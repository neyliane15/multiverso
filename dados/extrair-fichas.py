# -*- coding: utf-8 -*-
"""Extrai o "Relatorio de Estrutura de Produto" do PDV (Business Rio).

Entra : dados/FICHAS_TECNICAS_BDZ_NORTE_SHOPPING.pdf  (69 paginas)
Sai   : dados/fichas-bruto.json

O relatorio e a estrutura de TODOS os produtos da casa, nao so dos drinques.
Cada ficha e um bloco com um cabecalho de colunas, a linha do produto e uma
linha por componente:

    Codigo     Produto      Componentes            Qtde.  Qtde. Estoque  V. Unit  Subtotal
    BDZ50153   43 SPRITZ - UN
               FT103   LIMAO - KG                  0.050  1300.471       10,700   0,530
               BDZ1    AGUA COM GAS - UN           0.500  -1842.350      1,200    0,600
               BDZ325  DS LICOR 43 - UN            1.000  0.000          10,810   10,810
                                            Total:                                11,940

Cinco coisas que este script faz e que valem o comentario:

 1. LE O PDF, nao um .txt ao lado. O `pdftotext -layout` roda aqui dentro, com
    o md5 do PDF conferido antes. Um texto extraido a mao em outra sessao
    quebra a reprodutibilidade justamente no arquivo que e a fonte da verdade.

 2. ACHATA AS DOSES, ate a garrafa. O PDV tem dois niveis: `DS ABSOLUT - UN` e
    uma ficha cujo unico componente e `GF ABSOLUT - LT` na quantidade 0.062 —
    seis virgula dois por cento da garrafa. O nosso catalogo compra GARRAFA
    (unidade UND), nao dose, e a migracao 0017 nao tem sub-receita. Entao o
    drinque que leva `DS ABSOLUT x 1.000` passa a levar `GF ABSOLUT x 0.062`, e
    a fracao sai do proprio PDF — nunca de um padrao de mercado tipo
    "dose = 50 ml". A cadeia pode ter mais de um degrau (`DS CACHACA COM MEL`
    leva `DS PRATEADA x 1.000`, que leva `GF PRATEADA x 0.070`); o achatamento
    multiplica as fracoes e exige que a cadeia TERMINE numa folha.

 3. APLICA A REGRA DA CASA COMO TRAVA: "garrafa e produto fechado vendido
    inteiro, dose e apenas uma pequena quantidade". Qualquer item que, depois
    do achatamento, consuma `LIMITE_FRACAO_GARRAFA` ou mais de uma garrafa
    (`GF ...`) vira ACHADO em `garrafas_inteiras`, com ficha e linha do PDF.
    O relatorio inteiro confirma a regra — nenhuma ficha de drinque chega perto
    disso — e e justamente por isso que uma excecao e defeito, nunca dado.

 4. RECALCULA O CUSTO DE CADA FICHA pelos dois niveis. O PDV guarda um custo
    CACHEADO da sub-receita na coluna V. Unit do pai, e esse cache esta velho
    em varios casos (e ZERO em cinco doses: `DS PRATEADA` entra valendo 0,00 em
    cinco drinques, embora a ficha dela mesma some 3,84). Entao o `Total`
    impresso do drinque subestima o custo, e o numero honesto para comparar
    com o nosso banco e o `total_recalculado`, nao o `total_impresso`.

 5. CONFERE CADA FICHA CONTRA ELA MESMA, em tres niveis — ver `conferir`,
    `conferir_niveis` e `TOLERANCIA`.

Nada aqui decide o que e drinque nem casa nome com o nosso catalogo: isso e
trabalho do normalizar-fichas.py, que precisa justificar cada decisao.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(BASE, 'FICHAS_TECNICAS_BDZ_NORTE_SHOPPING.pdf')
DEST = os.path.join(BASE, 'fichas-bruto.json')

# md5 do PDF que foi lido para escrever este script. Conferido e nao apenas
# anotado: o relatorio do PDV e reemitido toda semana com os mesmos nomes de
# arquivo, e um PDF novo muda custo e receita sem mudar nada visivel.
MD5_ESPERADO = 'bfbe0f165e3a119c35a43ac2297b3418'

# Profundidade maxima da cadeia de doses. O relatorio tem no maximo dois
# degraus (dose -> dose -> garrafa); 3 e a folga, e o limite existe para
# transformar cadeia estranha em achado, nao em recursao infinita.
PROFUNDIDADE_MAX = 3

# Regra da casa virada trava: dose e fracao pequena de garrafa. Item que, ja
# achatado, consome metade de uma garrafa ou mais nao e dose — e defeito de
# cadastro (o `DS JAMBUZADA TRADICIONAL` do PDF leva `GF PRATEADA x 1.000`, a
# garrafa inteira ao preco da garrafa). Meio e folga generosa: a maior fracao
# legitima do relatorio e 0,075.
LIMITE_FRACAO_GARRAFA = 0.5

# Prefixos do vocabulario do PDV. `DS` = dose servida; `GF` = garrafa.
PREFIXO_DOSE = 'DS '
PREFIXO_GARRAFA = 'GF '


def num_br(s):
    """Numero no formato brasileiro do relatorio: 1.234,56 -> 1234.56."""
    s = (s or '').strip()
    if not s:
        return 0.0
    s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return 0.0


def num_us(s):
    """Numero das colunas de quantidade, que o PDV imprime com ponto: 0.050."""
    s = (s or '').strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def txt(s):
    return re.sub(r'\s+', ' ', (s or '')).strip()


def eh_dose(nome):
    return nome.upper().startswith(PREFIXO_DOSE)


def eh_garrafa(nome):
    return nome.upper().startswith(PREFIXO_GARRAFA)


# --------------------------------------------------------------- leitura do pdf -
def ler_pdf():
    md5 = hashlib.md5(open(PDF, 'rb').read()).hexdigest()
    if md5 != MD5_ESPERADO:
        raise SystemExit(
            f'PDF diferente do que foi lido para escrever este script.\n'
            f'  esperado: {MD5_ESPERADO}\n  encontrado: {md5}\n'
            f'Reveja o de-para do normalizar-fichas.py antes de seguir.')
    # `-layout` preserva as colunas, que e o que permite separar Qtde de
    # V. Unit por posicao e por formato (ponto x virgula).
    saida = subprocess.run(['pdftotext', '-layout', PDF, '-'],
                           capture_output=True, check=True)
    return saida.stdout.decode('utf-8'), md5


# ------------------------------------------------------------------- o parser -
# Cabecalho de coluna. Repete-se uma vez por ficha (e nao uma por pagina), e e
# por ele que o bloco comeca. O \f (quebra de pagina do pdftotext) pode vir
# colado nele, por isso o replace antes de comparar.
RE_CABECALHO = re.compile(r'^C[oó]digo\s+Produto\s+Componentes')

# Linha do produto da ficha: codigo na coluna zero, nome, e a unidade do PDV
# depois de " - ". Os codigos do PDV sao alfanumericos (BDZ50153, 898000062,
# 28000000311, FT103).
RE_FICHA = re.compile(r'^([A-Za-z0-9][A-Za-z0-9._-]*)\s{2,}(.+?)\s*-\s*([A-Z]{2,4})\s*$')

# Linha de componente: indentada, codigo, nome, e as quatro colunas numericas.
# As duas primeiras usam ponto decimal (0.050, -1842.350) e as duas ultimas
# virgula (10,700, 0,530): e esse contraste que impede confundir as colunas
# quando o layout "anda" de pagina para pagina.
RE_COMPONENTE = re.compile(
    r'^\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s+(.+?)\s*-\s*([A-Z]{2,4})\s+'
    r'(-?\d+\.\d+)\s+(-?[\d.]+)\s+'
    r'([\d.]*,\d+)\s+([\d.]*,\d+)\s*$')

# Codigo de componente que nao cabe na coluna sai sozinho numa linha, e o nome
# com os numeros vem na linha seguinte SEM codigo. Acontece com os EAN de 13
# digitos (2211991400617) e com um codigo longo da feijoada (BDZVGFSJ001).
# Sem tratar isso o parser leria a primeira palavra do NOME como codigo
# ("CPD CAMARAO CINZA 120GR" viraria codigo CPD, nome "CAMARAO CINZA 120GR") —
# nao perde dinheiro, mas corrompe as duas chaves pelas quais o achatamento e
# o de-para encontram o item.
RE_CODIGO_ORFAO = re.compile(r'^\s+([A-Za-z0-9][A-Za-z0-9._-]{6,})\s*$')

# Codigo COLADO no nome, sem espaco nenhum: `28000000011XAROPE DE MEL - LT`.
# Acontece com os 8 componentes cujo codigo tem 11 digitos — a coluna do PDV
# tem largura fixa e o codigo a estoura, encostando no nome.
#
# Sem tratar, a RE_COMPONENTE come a primeira palavra do NOME junto com o
# codigo (o `[A-Za-z0-9]*` e guloso): `XAROPE DE MEL` virava `DE MEL`,
# `LEITOSA EMPANAMENTO MP` virava `EMPANAMENTO MP` e `AIPIM COZIDO MP` virava
# `COZIDO MP`. Nenhum centavo se perde — qtd, V. Unit e Subtotal ficam certos —
# mas o NOME e a chave pela qual o achatamento acha a sub-receita e pela qual o
# de-para acha o produto do catalogo, e um nome mutilado nao casa com nada.
# `XAROPE DE MEL` esta dentro de um drinque (FOLIA DO DOM), entao isso valia
# correcao e nao nota de rodape.
#
# A separacao exige 9 digitos ou mais seguidos de letra, para nao partir os
# codigos legitimos que misturam letra e numero (BDZ50153, SG207989,
# BDZVGFSJ001): nenhum deles tem uma corrida de 9 digitos no meio.
RE_CODIGO_COLADO = re.compile(r'^(\s+)(\d{9,})([A-Za-zÀ-Üà-ü])')

# Componente cuja linha ja perdeu o codigo para a linha anterior: comeca pelo
# nome. Exige as quatro colunas numericas, que e o que a distingue de uma
# linha de ficha.
RE_COMPONENTE_SEM_CODIGO = re.compile(
    r'^\s+(.+?)\s*-\s*([A-Z]{2,4})\s+'
    r'(-?\d+\.\d+)\s+(-?[\d.]+)\s+'
    r'([\d.]*,\d+)\s+([\d.]*,\d+)\s*$')

# Linha do Total da ficha. Pode vir sem numero: 98 fichas do relatorio nao tem
# componente nenhum, e para elas o PDV imprime "Total:" e nada.
RE_TOTAL = re.compile(r'Total:\s*([\d.]*,?\d*)\s*$')

# Rodape de pagina e cabecalho da empresa. Nao sao dados; sao descartados sem
# virar achado porque aparecem 69 vezes cada.
RE_RODAPE = re.compile(r'^\s*\d+\s+de\s+\d+\s*$')
RE_EMPRESA = re.compile(r'BUSINESS RIO|IE\.:|Estrada DO ENGENHO|CEP\.:|'
                        r'Fone:|Relat[oó]rio de Estrutura|Impresso:')


def parsear(texto):
    """Quebra o texto em fichas. Devolve (fichas, ignoradas, remontadas)."""
    fichas = []
    ignoradas = []
    atual = None
    codigo_pendente = None   # codigo que saiu sozinho na linha anterior
    remontadas = []          # linhas recompostas, para o relatorio
    descoladas = []          # linhas em que o codigo estava colado no nome

    def add_componente(cod, nome, un, qtd, est, vun, sub, n):
        atual['componentes'].append({
            'codigo': cod,
            'nome': txt(nome),
            'unidade_pdv': un,
            'quantidade': round(num_us(qtd), 4),
            'estoque': num_us(est),
            'valor_unitario': round(num_br(vun), 4),
            'subtotal': round(num_br(sub), 4),
            'linha_pdf': n,
        })

    for n, cru in enumerate(texto.split('\n'), start=1):
        # \f vem colado no inicio da linha na virada de pagina.
        linha = cru.replace('\f', '')
        if not linha.strip():
            continue
        # Codigo colado no nome: separa ANTES de qualquer regex, porque e a
        # RE_COMPONENTE que seria enganada por ele.
        m = RE_CODIGO_COLADO.match(linha)
        if m:
            linha = RE_CODIGO_COLADO.sub(r'\1\2 \3', linha, count=1)
            descoladas.append({'linha': n, 'codigo': m.group(2),
                               'texto_corrigido': txt(linha)})
        if RE_RODAPE.match(linha) or RE_EMPRESA.search(linha):
            continue
        if RE_CABECALHO.match(linha):
            # Cabecalho fecha a ficha anterior e abre a proxima. Nao abre a
            # ficha em si: o nome vem na linha seguinte.
            atual = None
            codigo_pendente = None
            continue

        m = RE_TOTAL.search(linha)
        if m and not RE_COMPONENTE.match(linha):
            if atual is None:
                ignoradas.append({'linha': n, 'texto': txt(linha),
                                  'motivo': 'Total sem ficha aberta'})
                continue
            bruto = m.group(1)
            atual['total_impresso'] = num_br(bruto) if bruto.strip() else None
            codigo_pendente = None
            continue

        # Primeiro a linha orfa de codigo: ela nao casa com nada mais e, se
        # caisse na RE_FICHA, abriria uma ficha fantasma.
        m = RE_CODIGO_ORFAO.match(linha)
        if m and atual is not None:
            codigo_pendente = m.group(1)
            continue

        # Linha remontada: o codigo veio da linha anterior.
        if codigo_pendente is not None:
            m = RE_COMPONENTE_SEM_CODIGO.match(linha)
            if m:
                nome, un, qtd, est, vun, sub = m.groups()
                add_componente(codigo_pendente, nome, un, qtd, est, vun, sub, n)
                remontadas.append({'linha': n, 'codigo': codigo_pendente,
                                   'nome': txt(nome), 'ficha': atual['nome']})
                codigo_pendente = None
                continue
            codigo_pendente = None

        m = RE_COMPONENTE.match(linha)
        if m:
            if atual is None:
                ignoradas.append({'linha': n, 'texto': txt(linha),
                                  'motivo': 'componente sem ficha aberta'})
                continue
            cod, nome, un, qtd, est, vun, sub = m.groups()
            add_componente(cod, nome, un, qtd, est, vun, sub, n)
            continue

        m = RE_FICHA.match(linha)
        if m:
            cod, nome, un = m.groups()
            atual = {'codigo': cod, 'nome': txt(nome), 'unidade_pdv': un,
                     'linha_pdf': n, 'componentes': [], 'total_impresso': None}
            fichas.append(atual)
            continue

        ignoradas.append({'linha': n, 'texto': txt(linha), 'motivo': 'nao casou'})

    return fichas, ignoradas, remontadas, descoladas


# --------------------------------------------------------------- tolerancias --
# O relatorio imprime tudo com DUAS casas decimais (o "0,530" tem tres digitos
# e a terceira e sempre zero — conferido: nenhum valor do PDF tem terceira casa
# nao-nula) e as quantidades com TRES. Mas o PDV guarda e soma com precisao
# cheia. Dois efeitos, os dois medidos e nao supostos:
#
#  · a quantidade impressa e arredondada. `XAROPE MONIN x 0.021` com
#    V. Unit 68,43 daria Subtotal 1,44, e o PDV imprime 1,47 — porque a
#    quantidade guardada e 50/700 = 0,0714... impressa como 0,071, e 15/700 =
#    0,0214... impressa como 0,021.
#  · o PDV soma sem arredondar. A MOQUECA DE BANANA BDZ tem soma dos Subtotais
#    impressos 21,08 e Total impresso 21,11, porque 0,004 x 6,96 = 0,02784 e
#    impresso "0,030" e somado 0,02784.
#
# Logo a tolerancia nao pode ser um numero fixo: ela e derivada da precisao de
# impressao de cada parcela. Para um produto q x v em que q foi impresso com 3
# casas e v com 2, o erro maximo e
#     |v| x 0.0005  +  |q| x 0.005  +  0.005   (o arredondamento do proprio
#                                               Subtotal impresso)
# e o da ficha e a soma dos erros das linhas, mais o arredondamento do Total.
# Em vez de somar os erros (que superestima e ainda exige um numero de folga),
# a conferencia e por INTERVALO, que e exata: a quantidade impressa 0,021 quer
# dizer um valor em [0,0205; 0,0215), o V. Unit 68,43 quer dizer [68,425;
# 68,435), e o produto dos dois so pode estar entre os extremos. Se esse
# intervalo cruza o intervalo que o Subtotal impresso representa, os numeros
# sao compativeis; se nao cruza, ha erro de leitura de verdade.
ERRO_QTD = 0.0005     # meia unidade da ultima casa impressa da quantidade (3)
ERRO_VALOR = 0.005    # meia unidade da ultima casa impressa de reais (2)


def faixa_produto(c):
    """Intervalo possivel de Qtde x V. Unit, dada a precisao de impressao."""
    qs = (c['quantidade'] - ERRO_QTD, c['quantidade'] + ERRO_QTD)
    vs = (c['valor_unitario'] - ERRO_VALOR, c['valor_unitario'] + ERRO_VALOR)
    cantos = [q * v for q in qs for v in vs]
    return min(cantos), max(cantos)


def cruzam(a, b):
    """Dois intervalos se cruzam? Com uma folga de 1e-9 para o float binario."""
    return a[0] - 1e-9 <= b[1] and b[0] - 1e-9 <= a[1]


# --------------------------------------------------------- conferencia interna -
def conferir(fichas):
    """Duas conferencias aritmeticas sobre a leitura do PDF.

    linha : round(Qtde x V.Unit, 2) == Subtotal impresso (+/- tolerancia_linha)
    ficha : soma(Qtde x V.Unit)     == Total impresso    (+/- soma das tolerancias)

    A aritmetica sozinha nao prova que nenhuma linha se perdeu — a tolerancia
    de uma ficha grande chega a passar do valor de uma linha barata. Quem prova
    isso e a conferencia ESTRUTURAL: `linhas_ignoradas` tem de ser zero, ou
    seja, toda linha nao-vazia do PDF que nao e rodape foi classificada como
    cabecalho, ficha, componente ou Total. As duas juntas fecham.
    """
    ok, falhou, linhas_falhou = 0, [], []
    for f in fichas:
        baixo, alto = 0.0, 0.0
        soma = 0.0
        for c in f['componentes']:
            pb, pa = faixa_produto(c)
            baixo += pb
            alto += pa
            soma += c['quantidade'] * c['valor_unitario']
            impresso = (c['subtotal'] - ERRO_VALOR, c['subtotal'] + ERRO_VALOR)
            if not cruzam((pb, pa), impresso):
                linhas_falhou.append({
                    'ficha': f['nome'], 'componente': c['nome'],
                    'linha_pdf': c['linha_pdf'],
                    'quantidade': c['quantidade'],
                    'valor_unitario': c['valor_unitario'],
                    'subtotal_impresso': c['subtotal'],
                    'faixa_possivel': [round(pb, 4), round(pa, 4)]})
        f['soma_calculada'] = round(soma, 4)
        imp = f['total_impresso']
        if imp is None:
            # Sem componente o PDV nao imprime Total. Com componente e sem
            # Total seria contradicao, e e isso que a condicao pega.
            if f['componentes']:
                falhou.append({'ficha': f['nome'], 'codigo': f['codigo'],
                               'soma_calculada': round(soma, 4),
                               'total_impresso': None,
                               'motivo': 'ficha com componente e sem Total impresso'})
            else:
                ok += 1
            continue
        if not cruzam((baixo, alto), (imp - ERRO_VALOR, imp + ERRO_VALOR)):
            falhou.append({'ficha': f['nome'], 'codigo': f['codigo'],
                           'soma_calculada': round(soma, 4), 'total_impresso': imp,
                           'faixa_possivel': [round(baixo, 4), round(alto, 4)],
                           'componentes': len(f['componentes'])})
        else:
            ok += 1
    return ok, falhou, linhas_falhou


# ------------------------------------------------- os dois niveis, e o indice -
def indexar(fichas):
    """Indices para achar a ficha de um componente, e os codigos ambiguos.

    O PDV tem CODIGO REPETIDO: `2800000042` e ao mesmo tempo CALABRESA FEIJOADA
    MP, CARNE ASSADA MP, COSTELA SUINA ASSADA MP e TORRESMO FEIJOADA MP. Resolver
    por codigo nesses casos escolheria uma das quatro ao acaso, e o custo do
    prato mudaria conforme a ordem de leitura do PDF. Entao codigo ambiguo e
    descartado como chave e o nome decide; nome tambem ambiguo e achado.
    """
    por_codigo, ambiguos = {}, {}
    for f in fichas:
        por_codigo.setdefault(f['codigo'], []).append(f['nome'])
    for cod, nomes in por_codigo.items():
        if len(set(nomes)) > 1:
            ambiguos[cod] = sorted(set(nomes))

    codigo_unico = {}
    for f in fichas:
        if f['codigo'] not in ambiguos:
            codigo_unico[f['codigo']] = f
    nome_unico, nome_repetido = {}, set()
    for f in fichas:
        k = f['nome'].upper()
        if k in nome_unico:
            nome_repetido.add(k)
        nome_unico[k] = f
    for k in nome_repetido:
        nome_unico.pop(k, None)

    return codigo_unico, nome_unico, ambiguos, sorted(nome_repetido)


def ficha_do_componente(c, codigo_unico, nome_unico):
    """A ficha que descreve este componente, ou None se ele e folha.

    Nome antes de codigo: o nome e o que a ficha do drinque mostra e o que o
    de-para vai casar, e e ele que esta certo nos 8 codigos repetidos do PDV.
    """
    return nome_unico.get(c['nome'].upper()) or codigo_unico.get(c['codigo'])


def recalcular(fichas, codigo_unico, nome_unico):
    """Custo de cada ficha pelos DOIS niveis, no lugar do cache do PDV.

    O PDV guarda na coluna V. Unit do pai um custo CACHEADO da sub-receita, e
    esse cache esta velho — e em cinco doses esta ZERO. `DS PRATEADA` entra
    valendo 0,00 em CAIPIRINHA BDZ, CAIPIRINHA COM MEL, PAREI NO ZECA,
    TOMA LIZA e na dose `DS CACHACA COM MEL`, mas a ficha dela mesma soma 3,84
    (0,070 de uma garrafa de 54,90). O `Total` impresso desses drinques
    subestima o custo do drinque em exatamente a cachaca.

    Aqui o custo unitario de um componente que TEM ficha propria com
    componentes e o total recalculado DELA; de uma folha, e o V. Unit impresso
    (que nessa posicao e o preco de compra, e nao cache de nada).
    """
    memo = {}
    cache_divergente = []

    def total(f, caminho):
        if id(f) in memo:
            return memo[id(f)]
        if not f['componentes']:
            memo[id(f)] = None     # folha: nao tem custo proprio, so preco
            return None
        soma = 0.0
        for c in f['componentes']:
            filho = ficha_do_componente(c, codigo_unico, nome_unico)
            unit = None
            if filho is not None and filho is not f and id(filho) not in caminho:
                unit = total(filho, caminho | {id(f)})
            if unit is None:
                unit = c['valor_unitario']
            elif abs(unit - c['valor_unitario']) > 0.01:
                cache_divergente.append({
                    'ficha': f['nome'], 'componente': c['nome'],
                    'codigo': c['codigo'], 'linha_pdf': c['linha_pdf'],
                    'v_unit_cacheado_no_pai': c['valor_unitario'],
                    'custo_recalculado_da_sub_receita': round(unit, 4),
                    'diferenca': round(c['valor_unitario'] - unit, 4)})
            c['custo_unitario_recalculado'] = round(unit, 6)
            soma += c['quantidade'] * unit
        memo[id(f)] = round(soma, 4)
        return memo[id(f)]

    for f in fichas:
        f['total_recalculado'] = total(f, set())
    return cache_divergente


# ------------------------------------------------------- achatamento das doses -
def achatar(fichas, codigo_unico, nome_unico):
    """Troca dose por garrafa, multiplicando as fracoes, ate a folha.

    So achata o que o PDV cadastrou como dose (`DS ...`) ou como garrafa que
    por sua vez e combo (`GF ...` com componentes). Nao achata preparo de
    cozinha (`MP`) nem preparo da casa (xarope, espuma): quem decide o destino
    desses e o normalizar-fichas.py, porque ali ha uma escolha de modelagem a
    justificar, nao uma conversao de unidade.

    Devolve os achados: cadeia que nao termina em folha, cadeia funda demais,
    ciclo, e item que consome garrafa inteira.
    """
    achados = {'cadeia_sem_folha': [], 'cadeia_funda': [], 'ciclos': [],
               'garrafas_inteiras': []}

    def resolver(comp, caminho, profundidade, raiz, origem):
        alvo = ficha_do_componente(comp, codigo_unico, nome_unico)
        tem_estrutura = alvo is not None and alvo['componentes']
        achatavel = eh_dose(comp['nome']) or eh_garrafa(comp['nome'])

        if tem_estrutura and achatavel and alvo['codigo'] in caminho:
            achados['ciclos'].append({'ficha': raiz['nome'],
                                      'componente': comp['nome'],
                                      'linha_pdf': comp['linha_pdf'],
                                      'motivo': 'cadeia de dose volta em si mesma'})
            return [dict(comp, achatado_de=origem)]
        if tem_estrutura and achatavel and profundidade >= PROFUNDIDADE_MAX:
            achados['cadeia_funda'].append({'ficha': raiz['nome'],
                                            'componente': comp['nome'],
                                            'linha_pdf': comp['linha_pdf'],
                                            'profundidade': profundidade})
            return [dict(comp, achatado_de=origem)]
        if not (tem_estrutura and achatavel):
            # Dose que nao tem ficha propria seria chute de mililitro, e o
            # briefing proibe: dose sem estrutura e achado.
            if eh_dose(comp['nome']) and not tem_estrutura:
                achados['cadeia_sem_folha'].append({
                    'ficha': raiz['nome'], 'componente': comp['nome'],
                    'linha_pdf': comp['linha_pdf'],
                    'motivo': 'dose sem ficha propria no PDF: fracao da garrafa'
                              ' seria chute'})
            return [dict(comp, achatado_de=origem)]

        folhas = []
        for sub in alvo['componentes']:
            filho = dict(sub)
            filho['quantidade'] = round(comp['quantidade'] * sub['quantidade'], 6)
            # O custo unitario da folha e o preco de compra impresso nela; o
            # subtotal e refeito, porque o do PDF e do contexto da sub-receita.
            filho['subtotal'] = round(filho['quantidade'] * sub['valor_unitario'], 6)
            folhas.extend(resolver(filho, caminho | {alvo['codigo']},
                                   profundidade + 1, raiz,
                                   f'{origem} / {comp["nome"]}' if origem
                                   else comp['nome']))
        return folhas

    for f in fichas:
        plano, trilhas = [], []
        for c in f['componentes']:
            alvo = ficha_do_componente(c, codigo_unico, nome_unico)
            folhas = resolver(c, {f['codigo']}, 0, f, None)
            if alvo is not None and alvo['componentes'] and (eh_dose(c['nome'])
                                                             or eh_garrafa(c['nome'])):
                trilhas.append({'dose': c['nome'], 'codigo': c['codigo'],
                                'quantidade_no_drinque': c['quantidade'],
                                'virou': [f"{x['nome']} x {x['quantidade']}"
                                          for x in folhas]})
            plano.extend(folhas)

        # Mesma folha vinda por dois caminhos (direto e via dose) e um item so:
        # `ficha_itens` tem unique (ficha_id, produto_id) e as quantidades se
        # somam. Aqui a soma e por NOME de folha, que e a chave do de-para.
        juntos = {}
        for x in plano:
            k = x['nome'].upper()
            if k in juntos:
                juntos[k]['quantidade'] = round(juntos[k]['quantidade']
                                                + x['quantidade'], 6)
                juntos[k]['subtotal'] = round(juntos[k]['subtotal']
                                              + x['subtotal'], 6)
                juntos[k]['somado_de'] = (juntos[k].get('somado_de') or 1) + 1
            else:
                juntos[k] = dict(x)
        f['componentes_achatados'] = list(juntos.values())
        f['doses_achatadas'] = trilhas

        # A trava da regra da casa, aplicada depois do achatamento.
        for x in f['componentes_achatados']:
            if eh_garrafa(x['nome']) and x['quantidade'] >= LIMITE_FRACAO_GARRAFA:
                achados['garrafas_inteiras'].append({
                    'ficha': f['nome'], 'codigo_ficha': f['codigo'],
                    'item': x['nome'], 'quantidade': x['quantidade'],
                    'veio_de': x.get('achatado_de'),
                    'linha_pdf': x['linha_pdf'],
                    'motivo': f'consome {x["quantidade"]} de garrafa, e dose e '
                              f'fracao pequena (limite {LIMITE_FRACAO_GARRAFA})'})
    return achados


def main():
    texto, md5 = ler_pdf()
    fichas, ignoradas, remontadas, descoladas = parsear(texto)
    ok, falhou, linhas_falhou = conferir(fichas)
    codigo_unico, nome_unico, codigos_ambiguos, nomes_repetidos = indexar(fichas)
    cache_divergente = recalcular(fichas, codigo_unico, nome_unico)
    achados = achatar(fichas, codigo_unico, nome_unico)

    # Perfil do relatorio, para o laudo citar numero e nao impressao.
    com_comp = [f for f in fichas if f['componentes']]
    vazias = [f for f in fichas if not f['componentes']]
    linhas = sum(len(f['componentes']) for f in fichas)
    distintos = sorted({c['nome'].upper() for f in fichas for c in f['componentes']})
    doses = [f['nome'] for f in fichas if eh_dose(f['nome'])]
    garrafas = [f['nome'] for f in fichas if eh_garrafa(f['nome'])]
    zerados = [{'ficha': f['nome'], 'componente': c['nome'],
                'linha_pdf': c['linha_pdf'], 'valor_unitario': c['valor_unitario']}
               for f in fichas for c in f['componentes'] if c['quantidade'] == 0]

    saida = {
        'origem': {'arquivo': os.path.basename(PDF), 'md5': md5,
                   'paginas': texto.count('\f') + 1},
        'resumo': {
            'fichas': len(fichas),
            'fichas_com_componentes': len(com_comp),
            'fichas_vazias': len(vazias),
            'linhas_de_componente': linhas,
            'componentes_distintos': len(distintos),
            'componentes_com_quantidade_zero': len(zerados),
            'fichas_dose_ds': len(doses),
            'fichas_garrafa_gf': len(garrafas),
            'conferencia_ficha_ok': ok,
            'conferencia_ficha_falhou': len(falhou),
            'conferencia_linha_falhou': len(linhas_falhou),
            'linhas_remontadas': len(remontadas),
            'linhas_codigo_descolado': len(descoladas),
            'linhas_ignoradas': len(ignoradas),
            'codigos_ambiguos': len(codigos_ambiguos),
            'nomes_de_ficha_repetidos': len(nomes_repetidos),
            'cache_de_custo_divergente': len(cache_divergente),
            'cadeia_sem_folha': len(achados['cadeia_sem_folha']),
            'cadeia_funda': len(achados['cadeia_funda']),
            'ciclos': len(achados['ciclos']),
            'garrafas_inteiras': len(achados['garrafas_inteiras']),
        },
        'conferencia_ficha_falhou': falhou,
        'conferencia_linha_falhou': linhas_falhou,
        'linhas_remontadas': remontadas,
        'linhas_codigo_descolado': descoladas,
        'linhas_ignoradas': ignoradas,
        'codigos_ambiguos': codigos_ambiguos,
        'nomes_de_ficha_repetidos': nomes_repetidos,
        'cache_de_custo_divergente': cache_divergente,
        'componentes_com_quantidade_zero': zerados,
        'achados_do_achatamento': achados,
        'componentes_distintos': distintos,
        'fichas': fichas,
    }
    with open(DEST, 'w', encoding='utf-8') as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1)

    for k, v in saida['resumo'].items():
        print(f'{k:34} {v}')
    print(f'\nescrito: {DEST}')

    # O que impede seguir para o normalizar: leitura incompleta do PDF
    # (linha ignorada), aritmetica que nao fecha, ciclo ou cadeia funda. Esses
    # sao defeitos DESTE script.
    #
    # Nao travam, porque sao defeitos da ORIGEM ja tratados e nomeados:
    #   · codigo ambiguo      -> o nome decide (ver `indexar`);
    #   · cache de custo velho-> `total_recalculado` substitui (ver `recalcular`);
    #   · cadeia_sem_folha    -> dose sem ficha no PDF; o normalizar devolve
    #                            como pendencia e NAO chuta a fracao;
    #   · garrafas_inteiras   -> defeito de cadastro do PDV, nomeado no laudo.
    if ignoradas or falhou or linhas_falhou or achados['ciclos'] \
            or achados['cadeia_funda']:
        print('\nATENCAO: leitura ou aritmetica nao fecham. Veja '
              'linhas_ignoradas / conferencia_* / achados_do_achatamento.',
              file=sys.stderr)
        return 1
    if achados['cadeia_sem_folha'] or achados['garrafas_inteiras'] \
            or codigos_ambiguos or cache_divergente:
        print('\nDefeitos da ORIGEM tratados e registrados (ver resumo). '
              'Nao impedem seguir; vao para o relatorio.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
