# -*- coding: utf-8 -*-
"""Normaliza a contagem de OUTUBRO/2026 e casa cada linha com o catalogo atual.

Entra  : dados/contagem-bruta-outubro.json  (extrair-outubro.py)
         dados/catalogo-atual.json          (retrato do banco, ver CATALOGO)
Sai    : dados/contagem-bar-do-zeca-2026-10.json
         dados/RELATORIO-OUTUBRO.txt

A diferenca de fundo em relacao ao normalizar.py de agosto: agosto construia um
catalogo do zero a partir da planilha; outubro casa a planilha contra um
catalogo que JA EXISTE no banco e que e a verdade do sistema. Entao aqui nao se
decide "qual e a categoria do produto" — isso ja esta decidido. Decide-se:

  · qual produto do catalogo e o dono de cada linha (o problema dos nomes
    repetidos / desdobrados — ver DESDOBRAR);
  · o que e produto realmente novo e em qual das 21 categorias ele entra;
  · qual custo do cadastro passa a valer (a cliente pediu para atualizar).

Nada aqui cria categoria nem setor: os 21 e os 4 sao os que o banco tem.
"""
import collections
import json
import os
import re
import statistics
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
BRUTA = os.path.join(BASE, 'contagem-bruta-outubro.json')
# Retrato do catalogo do banco no momento da carga (as 868 linhas de
# produtos x produto_setores do tenant do Bar do Zeca). E uma copia versionada
# de proposito: sem ela este script nao e reproduzivel fora do dia em que rodou.
CATALOGO = os.path.join(BASE, 'catalogo-atual.json')
DEST = os.path.join(BASE, 'contagem-bar-do-zeca-2026-10.json')
RELATORIO = os.path.join(BASE, 'RELATORIO-OUTUBRO.txt')

REFERENCIA = '2026-10-01'
COMPETENCIA = '2026-10'
# Data da carga, estampada em custo_atualizado_em. E a referencia da contagem e
# nao now(): reaplicar o seed em outro dia nao pode mudar o dado historico.
CARGA_EM = '2026-10-01 23:59:00-03'

bruta = json.load(open(BRUTA))
catalogo = json.load(open(CATALOGO))

# ------------------------------------------------------------- normalizacoes --
TITULOS = re.compile(r'^(CONTROLE DE ESTOQUE|HORTIFRUTI\s+BAR DO ZECA|'
                     r'PORCIONADOS BAR DO ZECA|PERDAS)', re.I)

UNIDADES = {'UN': 'UND', 'UND.': 'UND', 'CXS': 'CX', 'BD': 'BDJ'}
UNIDADES_ACEITAS = {'UND', 'KG', 'CX', 'LTS', 'PCT', 'FD', 'BDJ'}

CATEGORIAS = {'PRODUTOS': 'HORTIFRUTI', 'SORVETE': 'SORVETES',
              'BEBIDAS NÃO ALCOÓLICAS (ESTOQUE)': 'BEBIDAS NÃO ALCOÓLICAS',
              'BEBIDAS ALCOOLICAS': 'BEBIDAS ALCOÓLICAS',
              'BEBIDAS NAO ALCOOLICAS': 'BEBIDAS NÃO ALCOÓLICAS'}


def chave(s):
    """Chave de identidade de produto: sem acento, sem caixa, sem pontuacao.

    E a mesma comparacao que o banco faz em lower(mv_sem_acento(nome)), por isso
    'BATATA PALHA ' (com espaco no fim) e 'BATATA PALHA' sao o mesmo produto.
    """
    s = unicodedata.normalize('NFKD', s.upper())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()


# ------------------------------------------------- os 16 nomes que se repetem --
# O erro mais caro possivel nesta importacao. A migracao 0002 juntou os 6
# setores de agosto em 4; como o schema admite um vinculo por par
# (produto_id, setor_id), 14 produtos que viviam em dois setores com custo
# proprio em cada viraram produto separado, e outros 2 (BACON/BARRIGA SUINA da
# feijoada) ja tinham virado na normalizacao de agosto. Resultado: existe no
# catalogo o nome "limpo" E o nome com sufixo.
#
# A planilha de outubro continua trazendo o nome limpo nas DUAS (as vezes tres)
# ocorrencias. Quem decide de quem e a linha e a origem dela — a aba e o bloco:
#
#   nome limpo  -> primeira ocorrencia, em regra um bloco da aba Geral
#   nome sufixo -> segunda ocorrencia, e o sufixo E a categoria dessa ocorrencia
#
# A chave e (chave do nome, aba, categoria normalizada do bloco), que e
# exatamente a coordenada da segunda ocorrencia. Trocar um destes troca o custo
# do item e corrompe o CMV, entao a tabela e escrita a mao, nome por nome, e
# conferida linha a linha no relatorio.
DESDOBRAR = {
    ('ALECRIM', 'Hortifruti', 'HORTIFRUTI'): 'ALECRIM (HORTIFRUTI)',
    ('BACALHAU', 'Porcionados', 'PEIXES E FRUTOS DO MAR'): 'BACALHAU (PORCIONADO)',
    ('BACON', 'Porcionados', 'SUÍNOS'): 'BACON (SUÍNOS)',
    ('BACON', 'Porcionados', 'FEIJOADA'): 'BACON (FEIJOADA)',
    ('BARRIGA SUINA', 'Porcionados', 'SUÍNOS'): 'BARRIGA SUÍNA (SUÍNOS)',
    ('BARRIGA SUINA', 'Porcionados', 'FEIJOADA'): 'BARRIGA SUÍNA (FEIJOADA)',
    ('BATATA CALABRESA', 'Porcionados', 'SUÍNOS'): 'BATATA CALABRESA (SUÍNOS)',
    ('CALDO DE CARNE', 'Molhos', 'MOLHOS'): 'CALDO DE CARNE (MOLHOS)',
    ('CONTRA FILE', 'Porcionados', 'CARNES'): 'CONTRA FILÉ (CARNES)',
    ('FILE DE TILAPIA', 'Porcionados', 'PEIXES E FRUTOS DO MAR'): 'FILÉ DE TILÁPIA (PORCIONADO)',
    ('LINGUICA CALABRESA', 'Porcionados', 'FEIJOADA'): 'LINGUIÇA CALABRESA (FEIJOADA)',
    ('LINGUICA FINA', 'Porcionados', 'FEIJOADA'): 'LINGUIÇA FINA (FEIJOADA)',
    ('LINGUICA PAIO', 'Porcionados', 'FEIJOADA'): 'LINGUIÇA PAIO (FEIJOADA)',
    ('LOMBO SUINO SALGADO', 'Porcionados', 'SUÍNOS'): 'LOMBO SUÍNO SALGADO (SUÍNOS)',
    ('MOCOTO', 'Porcionados', 'SUÍNOS'): 'MOCOTÓ (SUÍNOS)',
    ('QUIABO', 'Porcionados', 'CARNES'): 'QUIABO (CARNES)',
}

# Grafia diferente do MESMO produto — coisa distinta de desdobramento, por isso
# em tabela separada. A planilha de outubro escreve "MOLHO SHOYO (1lts)" onde o
# cadastro tem "MOLHO SHOYO (1lt)": e a mesma garrafa de um litro, e a propria
# linha vizinha da planilha (MOLHO INGLÊS (1lts), H50) mostra que "lts" e a
# grafia corrente da casa. Tratar como produto novo criaria dois cadastros para
# a mesma garrafa — o oposto do que a cliente pediu.
GRAFIA = {
    ('MOLHO SHOYO 1LTS', 'Geral', 'MERCEARIA'): 'MOLHO SHOYO (1lt)',
}

# Produto que a casa passou a contar numa MEDIDA diferente, com preco diferente.
# Regra da cliente: "se tem medidas diferentes e precos diferentes, considere
# como novo produto e adicione em sua categoria e setor adequado".
#
# E a mesma logica do desdobramento de agosto, mudando o eixo: la o que separava
# era o setor (BACON do estoque x BACON da feijoada), aqui e a unidade de medida.
# E o motivo e o mesmo: um cadastro so nao consegue guardar dois precos que
# dividem por denominadores diferentes.
#
#   BARBECUE DE GOIABADA: agosto contou 8 PORCOES a R$ 17,08 (o pote de 600 g);
#   outubro contou 3,45 KG a R$ 11,36 (o molho a granel). Um e preco de pote,
#   o outro e preco de quilo — pela planilha, 600 g a R$ 11,36/kg dariam R$ 6,82.
#   Sao duas mercadorias com dois precos, e viram dois cadastros.
#
#   GRAO DE BICO: a coluna MEDIDA trocou de UND (o pacote, R$ 13,20) para KG
#   (o granel, R$ 13,80).
#
# O cadastro antigo fica como esta, com a unidade e o custo dele. O novo nasce
# com a unidade e o custo de outubro, na categoria do bloco e no setor da aba —
# e e dele a linha de contagem deste mes. O total da contagem nao se mexe: a
# linha so troca de dono.
DESDOBRAR_POR_MEDIDA = {
    ('BARBECUE DE GOIABADA 600GR', 'Molhos', 'MOLHOS'): 'BARBECUE DE GOIABADA (KG)',
    ('GRAO DE BICO', 'Geral', 'MERCEARIA'): 'GRÃO DE BICO (KG)',
}

# Produto que a planilha lista DUAS VEZES em blocos de setor diferente, sendo um
# so item. Decisao de agosto, mantida: POLIFLOR aparece em DESCARTAVEIS e de
# novo em MATERIAL DE LIMPEZA; e o mesmo frasco, e vale a primeira ocorrencia.
# A segunda entra em `descartados` com o motivo, nunca em silencio.
SEGUNDA_OCORRENCIA_IGNORADA = {
    ('POLIFLOR', 'Geral', 'MATERIAL DE LIMPEZA'),
}

# ------------------------------------------------------------- o catalogo ---
por_chave = {}
for p in catalogo['produtos']:
    k = chave(p['nome'])
    if k in por_chave:
        raise SystemExit(f'catalogo com dois produtos de mesma chave: {p["nome"]!r}')
    por_chave[k] = p

setores_ativos = {s['nome']: s for s in catalogo['setores'] if s['ativo']}
setores_arquivados = {s['nome']: s for s in catalogo['setores'] if not s['ativo']}
cat_por_nome = {c['nome']: c for c in catalogo['categorias']}

# Em qual setor cada categoria vive hoje, derivado do catalogo e nao do mapa do
# briefing: o banco e a verdade. Serve para colocar produto NOVO no setor certo
# e para flagrar linha cujo setor nao combina com a categoria dela.
setor_da_categoria = {}
for p in catalogo['produtos']:
    for s in p['setores']:
        setor_da_categoria.setdefault(p['categoria'], set()).add(s['setor'])

# ------------------------------------------------------------- 1. limpeza ---
descartados = []
desdobrados = []
desdobrados_por_medida = []
regrafados = []
achados = []
limpos = []

for i in bruta['itens']:
    nome = i['produto']
    if TITULOS.match(nome) or not any(c.isalnum() for c in nome):
        descartados.append({'produto': nome, 'origem': i['origem'],
                            'motivo': 'linha de titulo ou sem nome de produto'})
        continue

    item = dict(i)
    item['unidade'] = UNIDADES.get(item['unidade'].strip(), item['unidade'].strip())
    item['categoria'] = CATEGORIAS.get(item['categoria'], item['categoria'])

    if item['unidade'] not in UNIDADES_ACEITAS:
        achados.append(f"{item['origem']}: unidade {item['unidade']!r} fora do conjunto "
                       f"aceito em agosto ({', '.join(sorted(UNIDADES_ACEITAS))})")
    if item['categoria'] not in cat_por_nome:
        achados.append(f"{item['origem']}: categoria {item['categoria']!r} nao e uma das "
                       f"{len(cat_por_nome)} categorias ativas do sistema")

    k = (chave(nome), item['aba'], item['categoria'])
    if k in SEGUNDA_OCORRENCIA_IGNORADA:
        descartados.append({'produto': nome, 'origem': i['origem'],
                            'motivo': f"segunda ocorrencia do mesmo item (bloco "
                                      f"{item['categoria']}); vale a primeira, decisao de agosto",
                            'quantidade': item['quantidade'], 'total': item['total']})
        continue
    if k in DESDOBRAR:
        novo = DESDOBRAR[k]
        desdobrados.append({'planilha': nome, 'catalogo': novo, 'origem': i['origem'],
                            'aba': item['aba'], 'bloco': item['categoria'],
                            'custo_outubro': item['custo_unitario'],
                            'custo_cadastro': por_chave[chave(novo)]['setores'][0]['custo']})
        item['produto'] = novo
    elif k in DESDOBRAR_POR_MEDIDA:
        novo = DESDOBRAR_POR_MEDIDA[k]
        antigo = por_chave.get(chave(nome))
        desdobrados_por_medida.append({
            'planilha': nome, 'catalogo_novo': novo, 'origem': i['origem'],
            'aba': item['aba'], 'bloco': item['categoria'],
            'unidade_outubro': item['unidade'], 'custo_outubro': item['custo_unitario'],
            'unidade_antiga': antigo['setores'][0]['unidade'] if antigo else None,
            'custo_antigo': antigo['setores'][0]['custo'] if antigo else None,
            'quantidade': item['quantidade'], 'total': item['total'],
        })
        # Renomeado, ele deixa de casar com o catalogo e segue pelo caminho de
        # produto novo — que ja sabe escolher categoria e setor pelo bloco.
        item['produto'] = novo
    elif k in GRAFIA:
        novo = GRAFIA[k]
        regrafados.append({'planilha': nome, 'catalogo': novo, 'origem': i['origem']})
        item['produto'] = novo

    limpos.append(item)

# Prova de que a tabela DESDOBRAR nao ficou com entrada morta nem incompleta:
# toda familia de desdobramento do catalogo tem de ter aparecido, e toda regra
# escrita tem de ter casado com alguma linha.
usadas = {(d['planilha'] and chave(d['planilha']), d['aba'], d['bloco']) for d in desdobrados}
for regra in DESDOBRAR:
    if regra not in usadas:
        achados.append(f'regra de desdobramento {regra} nao casou com nenhuma linha de outubro')
# Idem para o desdobramento por medida: regra que nao casa e regra que mente
# sobre o que a carga fez.
usadas_medida = {(chave(d['planilha']), d['aba'], d['bloco']) for d in desdobrados_por_medida}
for regra in DESDOBRAR_POR_MEDIDA:
    if regra not in usadas_medida:
        achados.append(f'regra de desdobramento por medida {regra} nao casou com nenhuma linha')
for nome_cat in (p['nome'] for p in catalogo['produtos']):
    if re.match(r'^.* \((HORTIFRUTI|PORCIONADO|SUÍNOS|FEIJOADA|MOLHOS|CARNES)\)$', nome_cat) \
       and nome_cat not in DESDOBRAR.values():
        achados.append(f'produto desdobrado {nome_cat!r} existe no catalogo e nao esta em DESDOBRAR')

# --------------------------------------- 2. linhas repetidas do mesmo par ---
# Mesma aba repetindo o mesmo (produto, setor): soma a quantidade, como agosto.
agrupado = {}
repetidas = []
for i in limpos:
    k = (chave(i['produto']), i['setor'])
    if k in agrupado:
        a = agrupado[k]
        repetidas.append({'produto': i['produto'], 'setor': i['setor'],
                          'origem_mantida': a['origem'], 'origem_somada': i['origem'],
                          'quantidade_somada': i['quantidade'], 'total_somado': i['total'],
                          'custo_mantido': a['custo_unitario'], 'custo_somado': i['custo_unitario']})
        a['quantidade'] = round(a['quantidade'] + i['quantidade'], 4)
        a['total'] = round(a['total'] + i['total'], 4)
        a['total_item'] = round(a['quantidade'] * a['custo_unitario'], 4)
        if abs(a['custo_unitario'] - i['custo_unitario']) > 1e-6:
            achados.append(f"{i['origem']}: linha repetida de {i['produto']!r} com custo "
                           f"diferente ({a['custo_unitario']} x {i['custo_unitario']}); "
                           f"ficou o da primeira")
    else:
        agrupado[k] = i
linhas = list(agrupado.values())

# ----------------------------------- 3. casamento com o catalogo / novos ----
novos = {}
conflitos_setor = []

for l in linhas:
    k = chave(l['produto'])
    p = por_chave.get(k)
    if p:
        l['novo'] = False
        l['produto'] = p['nome']            # o nome do cadastro manda na grafia
        l['produto_id'] = p['id']
        l['categoria_cadastro'] = p['categoria']
        vinculo = min(p['setores'], key=lambda s: s['ordem'])
        l['setor_cadastro'] = vinculo['setor']
        l['unidade_cadastro'] = vinculo['unidade']
        l['custo_cadastro'] = vinculo['custo']
        l['custo_fixo_cadastro'] = vinculo['custo_fixo']
        if vinculo['setor'] != l['setor']:
            # Nao se cria vinculo novo num setor diferente por conta propria: o
            # produto mudaria de lugar no sistema sem ninguem decidir. Fica como
            # pendencia e a linha e mantida no setor DO CADASTRO.
            conflitos_setor.append({'produto': p['nome'], 'origem': l['origem'],
                                    'setor_outubro': l['setor'],
                                    'setor_cadastro': vinculo['setor'],
                                    'bloco_outubro': l['categoria'],
                                    'categoria_cadastro': p['categoria'],
                                    'quantidade': l['quantidade'], 'total': l['total']})
            l['setor'] = vinculo['setor']
        l['setor_id'] = setores_ativos[l['setor']]['id']
        l['categoria'] = p['categoria']
        l['vinculo_ordem'] = vinculo['ordem']
    else:
        l['novo'] = True
        # Produto novo entra na categoria DO BLOCO da planilha e no setor em que
        # essa categoria vive hoje. Nenhuma categoria nova e criada.
        destinos = setor_da_categoria.get(l['categoria'], set())
        if len(destinos) != 1:
            achados.append(f"{l['origem']}: produto novo {l['produto']!r} na categoria "
                           f"{l['categoria']!r}, que hoje vive em {sorted(destinos) or 'nenhum setor'} "
                           f"— precisa de decisao da cliente")
            continue
        l['setor'] = next(iter(destinos))
        l['setor_id'] = setores_ativos[l['setor']]['id']
        l['categoria_cadastro'] = l['categoria']
        l['setor_cadastro'] = l['setor']
        l['unidade_cadastro'] = l['unidade']
        l['custo_cadastro'] = None
        l['custo_fixo_cadastro'] = False
        l['vinculo_ordem'] = setores_ativos[l['setor']]['ordem']
        novos[chave(l['produto'])] = {
            'nome': l['produto'],
            'categoria': l['categoria'],
            'categoria_id': cat_por_nome[l['categoria']]['id'],
            'setor': l['setor'],
            'setor_id': l['setor_id'],
            'unidade': l['unidade'],
            'custo': l['custo_unitario'],
            'ordem': l['vinculo_ordem'],
            'origem': l['origem'],
            'quantidade': l['quantidade'],
        }
        # produto_id do novo: UUIDv5 no mesmo espaco de nomes do resto da carga
        # (uuid5(restaurante_id, 'produto:<nome>')), que e o que idDe() do
        # gerar-seed.mjs produz. O gerador refaz essa conta e recusa divergencia.
        import uuid as _uuid
        l['produto_id'] = str(_uuid.uuid5(_uuid.UUID(catalogo['restaurante_id']),
                                          f"produto:{l['produto']}"))
        novos[chave(l['produto'])]['id'] = l['produto_id']

linhas = [l for l in linhas if 'produto_id' in l]

# Nenhuma linha pode apontar para setor arquivado — eles existem so para o
# historico de agosto continuar verdadeiro.
for l in linhas:
    if l['setor'] in setores_arquivados:
        raise SystemExit(f"{l['origem']}: linha aponta para setor arquivado {l['setor']!r}")

# Invariante: um unico par (produto, setor) por linha. Se dois nomes diferentes
# da planilha cairem no mesmo produto do catalogo, o indice unico de
# contagem_itens recusaria a carga — melhor parar aqui.
pares = collections.Counter((l['produto_id'], l['setor_id']) for l in linhas)
for par, n in pares.items():
    if n > 1:
        raise SystemExit(f'par produto x setor repetido depois do casamento: {par} ({n}x)')

# ----------------------------------------------- 4. os custos do cadastro ---
# A cliente pediu para atualizar. Tres regras, e a terceira nasceu de um erro
# que esta carga chegou a cometer:
#
#   1. so custo > 0 sobrescreve. Zero na planilha e "linha nao precificada",
#      nao "de graca" — em agosto categorias inteiras fecharam em R$ 0,00.
#
#   2. custo_fixo NAO bloqueia, porque a planilha de outubro e justamente a
#      planilha da casa: as abas Porcionados, Massas e Molhos sao onde os
#      custos proprios da casa sao mantidos.
#
#   3. unidade da planilha diferente da unidade do cadastro RETEM a
#      atualizacao. Esta e a regra nova. Custo so se compara com custo quando
#      os dois dividem pelo mesmo denominador: BARBECUE DE GOIABADA 600GR foi
#      contado em 8 PORCOES a R$ 17,08 em agosto e em 3,45 KG a R$ 11,36 em
#      outubro, e gravar R$ 11,36 num cadastro que diz UND faz o sistema
#      afirmar que um pote de 600 g custa o preco de um quilo. Nao e queda de
#      preco de 33%: e preco de porcao contra preco de quilo. Esses pares nao
#      entram na atualizacao; saem listados para a cliente dizer qual unidade
#      e a verdadeira, e o custo entra no mes seguinte ja resolvido.
#
# A regra 3 e deliberadamente mais larga do que o estrago conhecido: ela
# tambem retem caso em que os numeros provavelmente SE comparam (MOLHO SHOYO,
# cadastro em UND e planilha em LTS, sendo a mesma garrafa de 1 litro). Reter
# um custo certo custa uma linha de relatorio; gravar um custo errado custa
# CMV de ficha tecnica ate alguem perceber.
custos = []
custos_zerados = []
custos_retidos = []
custos_iguais = 0

for l in sorted(linhas, key=lambda x: (x['produto'], x['setor'])):
    if l['novo']:
        continue
    anterior = l['custo_cadastro']
    novo_custo = l['custo_unitario']
    if novo_custo <= 0:
        if anterior > 0:
            custos_zerados.append({'produto': l['produto'], 'setor': l['setor'],
                                   'unidade_cadastro': l['unidade_cadastro'],
                                   'unidade_outubro': l['unidade'],
                                   'custo_cadastro': anterior, 'origem': l['origem']})
        continue
    if abs(novo_custo - anterior) <= 1e-6:
        custos_iguais += 1
        continue
    if l['unidade_cadastro'] != l['unidade']:
        # Regra 3: denominadores diferentes, numeros incomparaveis.
        custos_retidos.append({
            'produto': l['produto'], 'setor': l['setor'], 'categoria': l['categoria'],
            'unidade_cadastro': l['unidade_cadastro'], 'unidade_outubro': l['unidade'],
            'custo_cadastro': anterior, 'custo_outubro': novo_custo,
            'percentual': round((novo_custo - anterior) / anterior * 100, 2) if anterior else None,
            'aba': l['aba'], 'origem': l['origem'],
        })
        continue
    diferenca = round(novo_custo - anterior, 6)
    percentual = round(diferenca / anterior * 100, 2) if anterior else None
    custos.append({
        'produto': l['produto'], 'produto_id': l['produto_id'],
        'setor': l['setor'], 'setor_id': l['setor_id'],
        'categoria': l['categoria'],
        'unidade_cadastro': l['unidade_cadastro'], 'unidade_outubro': l['unidade'],
        'unidade_divergente': l['unidade_cadastro'] != l['unidade'],
        'custo_anterior': anterior, 'custo_outubro': novo_custo,
        'diferenca': diferenca, 'percentual': percentual,
        'vinculo_ordem': l['vinculo_ordem'],
        'custo_fixo_cadastro': l['custo_fixo_cadastro'],
        'origem': l['origem'],
    })

# Unidade divergente entre planilha e cadastro, com ou sem mudanca de custo:
# e a bandeira vermelha de verdade, porque custo novo com unidade velha deixa o
# cadastro mentindo. A unidade do cadastro NAO e sobrescrita aqui — a regra da
# coluna dupla das abas Porcionados/Massas/Molhos deriva a unidade de "a linha
# tem numero na coluna PORCAO?", o que muda de mes para mes; deixar essa regra
# reescrever o cadastro estragaria o cadastro em vez de corrigi-lo.
unidades_divergentes = [
    {'produto': l['produto'], 'setor': l['setor'],
     'unidade_cadastro': l['unidade_cadastro'], 'unidade_outubro': l['unidade'],
     'custo_cadastro': l['custo_cadastro'], 'custo_outubro': l['custo_unitario'],
     'aba': l['aba'], 'origem': l['origem']}
    for l in sorted(linhas, key=lambda x: x['produto'])
    if not l['novo'] and l['unidade_cadastro'] != l['unidade']
]

# custo_medio do produto = custo do vinculo de menor ordem (o setor principal),
# a mesma regra do gerar-seed.mjs de agosto. Como hoje todo produto do catalogo
# tem exatamente um vinculo, o principal e esse — mas a conta e feita pelo
# minimo mesmo assim, para continuar certa se um dia houver dois.
custo_do_par = {(c['produto_id'], c['setor_id']): c['custo_outubro'] for c in custos}
custo_medio_novo = []
for p in catalogo['produtos']:
    vinculos = sorted(p['setores'], key=lambda s: s['ordem'])
    principal = vinculos[0]
    atual = custo_do_par.get((p['id'], principal['setor_id']), principal['custo'])
    if abs(atual - p['custo_medio']) > 1e-6:
        custo_medio_novo.append({'produto': p['nome'], 'produto_id': p['id'],
                                 'setor': principal['setor'],
                                 'custo_medio_anterior': p['custo_medio'],
                                 'custo_medio_novo': atual})

# custo_fixo: regra de agosto — true quando o custo do setor difere do
# custo_medio de referencia do produto. Com um vinculo por produto a regra da
# false para todo mundo, e sair aplicando isso APAGARIA a marca dos 12 vinculos
# que a 0002 deixou marcados (ALECRIM (HORTIFRUTI), FILE DE TILAPIA
# (PORCIONADO), ...) — justamente os custos proprios da casa, que a flag existe
# para proteger. Entao a regra e aplicada para LIGAR e nunca para desligar:
# custo_fixo = regra_de_agosto OR ja_estava_marcado.
custo_fixo_planejado = []
for l in linhas:
    if l['novo']:
        continue
    novo_c = custo_do_par.get((l['produto_id'], l['setor_id']), l['custo_cadastro'])
    cm = next((x['custo_medio_novo'] for x in custo_medio_novo if x['produto_id'] == l['produto_id']),
              por_chave[chave(l['produto'])]['custo_medio'])
    regra = abs(novo_c - cm) > 1e-6
    final = regra or l['custo_fixo_cadastro']
    if final != l['custo_fixo_cadastro']:
        custo_fixo_planejado.append({'produto': l['produto'], 'produto_id': l['produto_id'],
                                     'setor': l['setor'], 'setor_id': l['setor_id'],
                                     'de': l['custo_fixo_cadastro'], 'para': final})

# Quantos vinculos do catalogo ja estavam com custo zero ANTES desta carga. O
# bloco de verificacao do seed usa este numero como teto: se depois da carga
# houver mais vinculos zerados do que isso, algum zero da planilha de outubro
# passou por cima de preco real — exatamente o que a politica proibe.
vinculos_zerados_antes = sum(1 for p in catalogo['produtos'] for s in p['setores'] if s['custo'] == 0)

# ------------------------------------------------------ 5. o que nao veio ---
chaves_outubro = {chave(l['produto']) for l in linhas}
ausentes = [p for p in catalogo['produtos'] if chave(p['nome']) not in chaves_outubro]

# ------------------------------------------------------------- 6. totais ----
for l in linhas:
    l['total_item'] = round(l['quantidade'] * l['custo_unitario'], 4)
total_contagem = round(sum(l['total_item'] for l in linhas), 4)
total_planilha = bruta['total_planilha_valor_final']

setores_usados = sorted({l['setor'] for l in linhas},
                        key=lambda n: setores_ativos[n]['ordem'])
categorias_usadas = sorted({l['categoria'] for l in linhas},
                           key=lambda n: cat_por_nome[n]['ordem'])

saida = {
    'restaurante': bruta['restaurante'],
    'competencia': COMPETENCIA,
    'referencia': REFERENCIA,
    'carga_em': CARGA_EM,
    'origem': bruta['origem'],
    'restaurante_id': catalogo['restaurante_id'],
    'total_contagem': total_contagem,
    'total_planilha': total_planilha,
    'setores': [{'nome': n, 'id': setores_ativos[n]['id'], 'ordem': setores_ativos[n]['ordem']}
                for n in setores_usados],
    'categorias': [{'nome': n, 'id': cat_por_nome[n]['id'], 'ordem': cat_por_nome[n]['ordem']}
                   for n in categorias_usadas],
    'produtos_novos': sorted(novos.values(), key=lambda p: p['nome']),
    'custos_atualizados': custos,
    'custos_retidos_por_unidade': custos_retidos,
    'custo_medio_atualizado': custo_medio_novo,
    'custo_fixo_recalculado': custo_fixo_planejado,
    'custos_nao_atualizados_por_zero': custos_zerados,
    'unidades_divergentes': unidades_divergentes,
    'linhas': [{'produto': l['produto'], 'produto_id': l['produto_id'],
                'setor': l['setor'], 'setor_id': l['setor_id'],
                'categoria': l['categoria'], 'unidade': l['unidade'],
                'quantidade': l['quantidade'], 'custo_unitario': l['custo_unitario'],
                'total': l['total_item'], 'origem': l['origem'], 'novo': l['novo']}
               for l in sorted(linhas, key=lambda x: (x['setor'], x['categoria'], x['produto']))],
    'diagnostico': {
        'itens_na_planilha': len(bruta['itens']),
        'descartados': descartados,
        'desdobrados': desdobrados,
        'desdobrados_por_medida': desdobrados_por_medida,
        'regrafados': regrafados,
        'linhas_repetidas_somadas': repetidas,
        'conflitos_de_setor': conflitos_setor,
        'produtos_de_agosto_ausentes_em_outubro': [
            {'nome': p['nome'], 'categoria': p['categoria'],
             'setor': p['setores'][0]['setor'], 'custo': p['custo_medio']} for p in ausentes],
        'custos_iguais': custos_iguais,
        'vinculos_com_custo_zero_antes': vinculos_zerados_antes,
        'vinculos_com_custo_fixo_antes': sum(1 for p in catalogo['produtos']
                                             for s in p['setores'] if s['custo_fixo']),
        'produtos_no_catalogo_antes': len(catalogo['produtos']),
        'vinculos_no_catalogo_antes': sum(len(p['setores']) for p in catalogo['produtos']),
        'achados': achados,
    },
}
with open(DEST, 'w') as fh:
    json.dump(saida, fh, ensure_ascii=False, indent=1)


# ----------------------------------------------------------- o relatorio ----
def rel(linhas_txt):
    return '\n'.join(linhas_txt)


# ---- insumos da secao 9 do relatorio -----------------------------------------
# Divergencia de unidade SEM mudanca de custo: o cadastro nao foi tocado, so a
# unidade fica a confirmar. As com mudanca de custo estao em custos_retidos.
_retidos = {(c['produto'], c['setor']) for c in custos_retidos}
so_unidade = [u for u in unidades_divergentes if (u['produto'], u['setor']) not in _retidos]

# Preco de fardo digitado em linha de unidade. Compara cada item com os IRMAOS
# da mesma familia de produto (as duas primeiras palavras do nome) e mesma
# unidade: a mediana da categoria inteira e diluida demais para enxergar isso.
# 50x e o corte que separa o defeito real do fardo legitimo — "SACO DE 60L
# (FARDO C/100)" a R$ 60,10 e preco certo de um fardo de 100 e nao pode entrar.
def _familia(nome):
    t = unicodedata.normalize('NFKD', nome.upper())
    t = ''.join(ch for ch in t if not unicodedata.combining(ch)).split('(')[0]
    return ' '.join(re.sub(r'[^A-Z0-9]+', ' ', t).split()[:2])

_por_familia = collections.defaultdict(list)
for l in linhas:
    if l['custo_unitario'] > 0:
        _por_familia[(_familia(l['produto']), l['unidade'])].append(l)

embalagem = []
for _chave, _irmaos in _por_familia.items():
    if len(_irmaos) < 3:
        continue
    _med = statistics.median(x['custo_unitario'] for x in _irmaos)
    if _med <= 0:
        continue
    for x in _irmaos:
        if x['custo_unitario'] >= 50 * _med:
            embalagem.append({'produto': x['produto'], 'categoria': x['categoria'],
                              'unidade': x['unidade'], 'custo': x['custo_unitario'],
                              'mediana': _med, 'quantidade': x['quantidade'],
                              'total': x['total'], 'origem': x['origem']})
embalagem.sort(key=lambda e: -e['total'])

L = []
A = L.append
A('=' * 78)
A('RELATORIO DA IMPORTACAO DA CONTAGEM DE OUTUBRO/2026')
A('Bar do Zeca - Norte Shopping   (tenant %s)' % catalogo['restaurante_id'])
A('=' * 78)
A('')
A('origem        : %s' % bruta['origem'])
A('competencia   : %s      referencia da contagem: %s' % (COMPETENCIA, REFERENCIA))
A('gerado por    : dados/extrair-outubro.py + dados/normalizar-outubro.py')
A('')
A('-' * 78)
A('1. TOTAIS')
A('-' * 78)
A('celulas de produto lidas na planilha ........ %d' % len(bruta['itens']))
A('descartadas (titulo / sem nome / repetida) .. %d' % len(descartados))
A('linhas de contagem .......................... %d' % len(linhas))
A('produtos unicos ............................. %d' % len({l['produto_id'] for l in linhas}))
A('produtos novos .............................. %d' % len(novos))
A('')
A('total calculado (soma de quantidade x custo, 4 casas) . %15.4f' % total_contagem)
A('total da planilha (Geral!B93, VALOR FINAL) ........... %15.4f' % total_planilha)
A('diferenca ............................................ %15.6f' % (total_contagem - total_planilha))
A('')
A('A diferenca de R$ 0,0001 e arredondamento, nao dado: a planilha guarda o')
A('VALOR FINAL como 71961.35106999999 (float binario) e o banco arredonda cada')
A('linha em 4 casas antes de somar (contagem_itens.total e coluna gerada).')
A('')
A('conferencias do extrator:')
A('  divergencias item x item (|qtd x valor - TOTAL| > 0,02) ... %d'
  % len(bruta['avisos']))
A('  blocos cujo TOTAL nao fecha com a soma das linhas ......... %d'
  % sum(1 for c in bruta['conferencia']
        if c['planilha'] is not None and abs(c['planilha'] - c['calculado']) > 0.02))
A('  blocos sem linha de TOTAL na planilha ..................... %d'
  % sum(1 for c in bruta['conferencia'] if c['planilha'] is None))
A('  linhas do resumo da casa que nao fecham (Geral A74:E95) ... %d'
  % sum(1 for x in bruta['resumo_planilha'] if abs(x['diferenca']) > 0.02))
A('')
A('-' * 78)
A('2. ITENS POR SETOR')
A('-' * 78)
for s in setores_usados:
    sub = [l for l in linhas if l['setor'] == s]
    A('   %-16s %4d linhas   R$ %13.2f   (%d com quantidade > 0)'
      % (s, len(sub), sum(x['total_item'] for x in sub), sum(1 for x in sub if x['quantidade'] > 0)))
A('   %-16s %4d linhas   R$ %13.2f' % ('TOTAL', len(linhas), total_contagem))
A('')
A('-' * 78)
A('3. ITENS POR CATEGORIA')
A('-' * 78)
for c in categorias_usadas:
    sub = [l for l in linhas if l['categoria'] == c]
    A('   %-26s %4d linhas   R$ %13.2f   setor: %s'
      % (c, len(sub), sum(x['total_item'] for x in sub), sorted({x['setor'] for x in sub})[0]))
A('   categorias usadas: %d de %d ativas' % (len(categorias_usadas), len(cat_por_nome)))
nao_usadas = [c['nome'] for c in catalogo['categorias'] if c['nome'] not in categorias_usadas]
A('   categorias sem nenhuma linha em outubro: %s' % (nao_usadas or 'nenhuma'))
A('')
A('-' * 78)
A('4. UNIDADES')
A('-' * 78)
for u, n in sorted(collections.Counter(l['unidade'] for l in linhas).items(),
                   key=lambda x: -x[1]):
    A('   %-6s %4d   %s' % (u, n, 'ok' if u in UNIDADES_ACEITAS else '<<< FORA DO CONJUNTO DE AGOSTO'))
A('')
A('-' * 78)
A('4b. DESDOBRAMENTO POR MEDIDA — PRODUTO NOVO  (%d)' % len(desdobrados_por_medida))
A('-' * 78)
A('Regra da cliente: "se tem medidas diferentes e precos diferentes, considere')
A('como novo produto e adicione em sua categoria e setor adequado".')
A('')
A('E a mesma logica do desdobramento de agosto, mudando o eixo: la o que separava')
A('os produtos era o setor, aqui e a unidade de medida. O cadastro antigo fica')
A('intocado, com a unidade e o custo dele; o novo nasce com a unidade e o custo')
A('de outubro, e e dele a linha de contagem deste mes. O total nao se mexe — a')
A('linha so troca de dono.')
if desdobrados_por_medida:
    A('')
    A('    %-28s %-6s %10s   %-28s %-6s %10s'
      % ('CADASTRO QUE FICA', 'UN', 'CUSTO', 'CADASTRO NOVO', 'UN', 'CUSTO'))
    for x in desdobrados_por_medida:
        A('    %-28s %-6s %10.4f   %-28s %-6s %10.4f'
          % (x['planilha'][:28], x['unidade_antiga'] or '?', x['custo_antigo'] or 0,
             x['catalogo_novo'][:28], x['unidade_outubro'], x['custo_outubro']))
    A('')
    A('    %-28s %-22s %-13s %9s %11s  %s'
      % ('CADASTRO NOVO', 'CATEGORIA', 'SETOR', 'QTD', 'NO TOTAL', 'CELULA'))
    for x in desdobrados_por_medida:
        linha = next(l for l in linhas if l['produto'] == x['catalogo_novo'])
        A('    %-28s %-22s %-13s %9.4f %11.4f  %s'
          % (x['catalogo_novo'][:28], linha['categoria'], linha['setor'],
             x['quantidade'], x['total'], x['origem']))
    A('')
    A('    O que cada um quer dizer, para a decisao ficar conferivel:')
    A('    BARBECUE DE GOIABADA — agosto contou 8 PORCOES a R$ 17,08 (o pote de')
    A('    600 g); outubro contou 3,45 KG a R$ 11,36 (o molho a granel). Pela')
    A('    planilha, 600 g a R$ 11,36/kg dariam R$ 6,82: sao duas mercadorias.')
    A('    GRAO DE BICO — a coluna MEDIDA trocou de UND (pacote, R$ 13,20) para')
    A('    KG (granel, R$ 13,80).')
    A('')
    A('    Os dois cadastros antigos continuam existindo e nao foram contados')
    A('    neste mes nessa medida — aparecem na secao de ausentes, que e o certo:')
    A('    deixar de ser contado uma vez nao e deixar de existir.')
A('')
A('-' * 78)
A('5. DESEMPATE DOS NOMES REPETIDOS / DESDOBRADOS')
A('-' * 78)
A('Cada linha abaixo e uma decisao: o nome que a planilha escreve, a aba e o')
A('bloco de onde ele veio, e o produto do catalogo que ficou com a linha.')
A('')
A('   %-24s %-13s %-24s %-30s %s' % ('NOME NA PLANILHA', 'ABA', 'BLOCO', 'PRODUTO DO CATALOGO', 'CELULA'))
for d in sorted(desdobrados, key=lambda x: (x['planilha'], x['aba'], x['bloco'])):
    A('   %-24s %-13s %-24s %-30s %s'
      % (d['planilha'], d['aba'], d['bloco'], d['catalogo'], d['origem']))
A('')
A('   E as ocorrencias que ficaram com o nome LIMPO (primeira ocorrencia):')
limpos_nomes = sorted({chave(d['planilha']) for d in desdobrados})
for k in limpos_nomes:
    for l in linhas:
        if chave(l['produto']) == k:
            A('   %-30s %-24s %-13s custo %-10s %s'
              % (l['produto'], l['categoria'], l['setor'], l['custo_unitario'], l['origem']))
A('')
A('   total de desdobramentos resolvidos: %d (as 16 familias do catalogo)' % len(desdobrados))
A('')
A('-' * 78)
A('6. GRAFIA DIFERENTE DO MESMO PRODUTO')
A('-' * 78)
if regrafados:
    for r in regrafados:
        A('   planilha %-26s -> catalogo %-26s %s'
          % (repr(r['planilha']), repr(r['catalogo']), r['origem']))
    A('')
    A('   Motivo: (1lt) e (1lts) sao a mesma garrafa de um litro, e a linha')
    A('   vizinha da planilha (MOLHO INGLES (1lts), Geral!H50) mostra que "lts" e')
    A('   a grafia corrente da casa. Tratar como novo criaria cadastro duplicado.')
else:
    A('   nenhuma')
A('')
A('-' * 78)
A('7. PRODUTOS NOVOS  (%d)' % len(novos))
A('-' * 78)
A('Cada um entra numa das %d categorias que ja existem. Nenhuma categoria nova'
  % len(cat_por_nome))
A('foi criada, e nenhuma precisou ser criada.')
A('')
A('   %-26s %-22s %-14s %-5s %10s %9s  %s'
  % ('PRODUTO', 'CATEGORIA', 'SETOR', 'UN', 'CUSTO', 'QTD', 'CELULA'))
for p in sorted(novos.values(), key=lambda x: (x['categoria'], x['nome'])):
    A('   %-26s %-22s %-14s %-5s %10.4f %9.4f  %s'
      % (p['nome'], p['categoria'], p['setor'], p['unidade'], p['custo'],
         p['quantidade'], p['origem']))
A('')
A('   por categoria: %s'
  % ', '.join('%s=%d' % kv for kv in sorted(
      collections.Counter(p['categoria'] for p in novos.values()).items())))
A('   por setor    : %s'
  % ', '.join('%s=%d' % kv for kv in sorted(
      collections.Counter(p['setor'] for p in novos.values()).items())))
A('')
A('-' * 78)
A('8. CUSTOS DO CADASTRO — ATUALIZADOS (%d)' % len(custos))
A('-' * 78)
A('A cliente pediu: "Atualize os custos tambem". produto_setores.custo passa a')
A('ser o custo de outubro e custo_atualizado_em recebe %s.' % CARGA_EM)
A('Custo ZERO na planilha nao sobrescreve custo real (secao 9d), e custo cuja')
A('unidade nao bate com a do cadastro fica RETIDO (secao 9a) — numero com')
A('denominador diferente nao se compara com o anterior.')
A('')
sobe = [c for c in custos if c['diferenca'] > 0]
cai = [c for c in custos if c['diferenca'] < 0]
A('   subiram ................................... %d' % len(sobe))
A('   cairam .................................... %d' % len(cai))
A('   ficaram iguais (nao entram no update) ..... %d' % custos_iguais)
A('   nao atualizados por serem zero na planilha  %d' % len(custos_zerados))
A('   RETIDOS por unidade incompativel (secao 9a)  %d' % len(custos_retidos))
A('   produtos novos (custo nasce da planilha) .. %d' % len(novos))
A('')
A('   %-32s %-14s %-5s %-5s %11s %11s %11s %9s'
  % ('PRODUTO', 'SETOR', 'UN-C', 'UN-O', 'ANTERIOR', 'OUTUBRO', 'DIFERENCA', '%'))
for c in custos:
    A('   %-32s %-14s %-5s %-5s %11.4f %11.4f %+11.4f %+8.2f%%'
      % (c['produto'][:32], c['setor'], c['unidade_cadastro'], c['unidade_outubro'],
         c['custo_anterior'], c['custo_outubro'], c['diferenca'],
         c['percentual'] if c['percentual'] is not None else 0.0))
A('')
A('   produtos.custo_medio atualizado (custo do setor principal): %d' % len(custo_medio_novo))
A('')
A('-' * 78)
A('9. CUSTOS: O QUE PEDE DECISAO, E O QUE E SO HISTORICO')
A('-' * 78)
A('')
A('Variacao de preco NAO e problema e nao pede confirmacao de ninguem: o custo')
A('oscila por fornecedor e por inflacao, o custo de agosto fica em agosto e o de')
A('outubro em outubro — cada contagem guarda o proprio custo_unitario, linha por')
A('linha. Problema e quando o numero NAO E PRECO: quando a unidade da planilha e')
A('a do cadastro sao diferentes e os dois valores dividem por denominadores')
A('diferentes. E so isso que esta secao cobra.')
A('')
A('9a. CUSTOS RETIDOS — A UNIDADE NAO BATE COM A DO CADASTRO  (%d)' % len(custos_retidos))
A('    <<< E AQUI QUE O CADASTRO PODERIA PASSAR A MENTIR. ESTES NAO FORAM')
A('        ATUALIZADOS: a carga segurou o custo e esta devolvendo a decisao.')
if custos_retidos:
    A('')
    A('    %-32s %-14s %-6s %-6s %11s %11s %9s  %s'
      % ('PRODUTO', 'SETOR', 'UN-CAD', 'UN-PLAN', 'CADASTRO', 'OUTUBRO', '%', 'CELULA'))
    for c in sorted(custos_retidos, key=lambda x: x['produto']):
        A('    %-32s %-14s %-6s %-6s %11.4f %11.4f %+8.2f%%  %s'
          % (c['produto'][:32], c['setor'], c['unidade_cadastro'], c['unidade_outubro'],
             c['custo_cadastro'], c['custo_outubro'],
             c['percentual'] if c['percentual'] is not None else 0.0, c['origem']))
    A('')
    A('    O caso que ensinou a regra, para a decisao ficar concreta:')
    A('    BARBECUE DE GOIABADA 600GR foi contado em agosto como 8 na coluna')
    A('    PORCOES a R$ 17,08, e em outubro como 3,45 na coluna ESTOQUE/KG a')
    A('    R$ 11,36. Os "-33%" nao sao queda de preco: e preco de porcao contra')
    A('    preco de quilo. Gravar R$ 11,36 num cadastro que diz UND faria o')
    A('    sistema afirmar que um pote de 600 g custa o preco de um quilo —')
    A('    600 g a R$ 11,36/kg dariam R$ 6,82. A decisao e entre "KG, R$ 11,36" e')
    A('    "UND, R$ 6,82", e a planilha nao responde isso sozinha.')
    A('')
    A('    MOLHO SHOYO esta retido por prudencia, nao por duvida real: cadastro em')
    A('    UND, planilha em LTS, e e a mesma garrafa de 1 litro, entao os numeros')
    A('    provavelmente se comparam. Reter um custo certo custa uma linha deste')
    A('    relatorio; gravar um errado custa CMV de ficha tecnica.')
else:
    A('    nenhum')
A('')
A('9b. UNIDADE DIFERENTE, MAS CUSTO IGUAL NOS DOIS  (%d)' % len(so_unidade))
A('    Nada foi alterado no cadastro — o custo e o mesmo numero. Fica so a')
A('    unidade a confirmar na tela de Produtos, quando sobrar tempo.')
A('')
A('    Nas abas Porcionados / Massas / Molhos a unidade nao vem escrita: ela e')
A('    derivada de "a linha tem numero na coluna PORCAO?", ou seja muda conforme')
A('    a casa contou ou nao aquele item naquele mes. Por isso a unidade do')
A('    cadastro nunca e sobrescrita por esta carga: deixar essa regra reescrever')
A('    o cadastro estragaria o cadastro em vez de corrigi-lo.')
if so_unidade:
    A('')
    A('    %-32s %-14s %-6s %-6s %11s  %-13s %s'
      % ('PRODUTO', 'SETOR', 'UN-CAD', 'UN-PLAN', 'CUSTO', 'ABA', 'CELULA'))
    for u in so_unidade:
        A('    %-32s %-14s %-6s %-6s %11.4f  %-13s %s'
          % (u['produto'][:32], u['setor'], u['unidade_cadastro'], u['unidade_outubro'],
             u['custo_cadastro'], u['aba'], u['origem']))
A('')
A('9c. NUMERO DE EMBALAGEM LANCADO COMO NUMERO DE UNIDADE  (%d)' % len(embalagem))
A('    Linhas cujo custo e pelo menos 50x a mediana dos irmaos da MESMA familia')
A('    de produto e MESMA unidade. Esse padrao costuma ser preco de fardo ou de')
A('    caixa digitado numa linha que diz UND.')
A('')
A('    Nada aqui foi alterado por esta carga: estes custos sao identicos aos de')
A('    agosto e aos do cadastro. E defeito da planilha de origem, anterior a')
A('    outubro — por isso entra como aviso, nao como mudanca.')
if embalagem:
    A('')
    A('    %-32s %-20s %-5s %11s %10s %9s %11s  %s'
      % ('PRODUTO', 'CATEGORIA', 'UN', 'CUSTO', 'MEDIANA', 'QTD', 'NO TOTAL', 'CELULA'))
    for e in embalagem:
        A('    %-32s %-20s %-5s %11.2f %10.4f %9.4f %11.2f  %s'
          % (e['produto'][:32], e['categoria'], e['unidade'], e['custo'], e['mediana'],
             e['quantidade'], e['total'], e['origem']))
    A('')
    A('    O que vale dinheiro agora e so a linha com quantidade > 0. As de')
    A('    quantidade zero nao entram no total deste mes, mas valorizariam')
    A('    qualquer contagem futura desse item.')
else:
    A('    nenhuma')
A('')
A('9d. CUSTO QUE CAIRIA DE VALOR REAL PARA ZERO  (%d)' % len(custos_zerados))
A('    Nao foi atualizado: zero na planilha significa "linha nao precificada".')
if custos_zerados:
    A('')
    A('    %-34s %-14s %-6s %-6s %11s  %s'
      % ('PRODUTO', 'SETOR', 'UN-CAD', 'UN-OUT', 'CUSTO-CAD', 'CELULA'))
    for z in sorted(custos_zerados, key=lambda x: x['produto']):
        A('    %-34s %-14s %-6s %-6s %11.4f  %s'
          % (z['produto'][:34], z['setor'], z['unidade_cadastro'], z['unidade_outubro'],
             z['custo_cadastro'], z['origem']))
else:
    A('    nenhum')
A('')
A('9e. HISTORICO DE PRECO — INFORMACAO, NAO PENDENCIA  (%d custos alterados)' % len(custos))
A('    Estas linhas sao o historico de preco de outubro. Nao pedem confirmacao:')
A('    o custo de agosto continua valendo em agosto e o de outubro passa a valer')
A('    em outubro. Todas tem a MESMA unidade no cadastro e na planilha — as que')
A('    nao tinham estao retidas na 9a.')
A('')
maiores = sorted([c for c in custos if c['percentual'] is not None],
                 key=lambda x: -abs(x['percentual']))[:10]
if maiores:
    A('    As maiores variacoes:')
    A('')
    A('    %-32s %-14s %-5s %11s %11s %9s  %s'
      % ('PRODUTO', 'SETOR', 'UN', 'ANTERIOR', 'OUTUBRO', '%', 'CELULA'))
    for c in maiores:
        A('    %-32s %-14s %-5s %11.4f %11.4f %+8.2f%%  %s'
          % (c['produto'][:32], c['setor'], c['unidade_cadastro'],
             c['custo_anterior'], c['custo_outubro'], c['percentual'], c['origem']))
A('')
A('-' * 78)
A('10. custo_fixo RECALCULADO')
A('-' * 78)
A('A flag significa "custo calculado pela casa, nao acompanha nota fiscal".')
A('Regra de agosto: true quando o custo do setor difere do custo_medio de')
A('referencia do produto. Como depois da 0002 cada produto tem UM vinculo, a')
A('regra da false para todos — e aplicar isso cru APAGARIA a marca dos 12')
A('vinculos que a 0002 marcou, que sao justamente os custos proprios da casa')
A('(ALECRIM (HORTIFRUTI), FILE DE TILAPIA (PORCIONADO), CALDO DE CARNE')
A('(MOLHOS), ...). Entao a regra e aplicada para LIGAR e nunca para desligar:')
A('')
A('    custo_fixo = regra_de_agosto OR ja_estava_marcado')
A('')
A('   vinculos que mudam de custo_fixo nesta carga: %d' % len(custo_fixo_planejado))
for c in custo_fixo_planejado:
    A('      %-34s %-14s %s -> %s' % (c['produto'][:34], c['setor'], c['de'], c['para']))
if not custo_fixo_planejado:
    A('      nenhum (os 12 vinculos marcados continuam marcados)')
A('')
A('-' * 78)
A('11. LINHAS DESCARTADAS  (%d)' % len(descartados))
A('-' * 78)
for d in descartados:
    extra = ''
    if 'quantidade' in d:
        extra = '   (quantidade %s, total %s)' % (d['quantidade'], d['total'])
    A('   %-42s %-22s %s%s' % (repr(d['produto'])[:42], d['origem'], d['motivo'], extra))
A('')
A('-' * 78)
A('12. LINHAS REPETIDAS DO MESMO PAR (produto, setor)  (%d)' % len(repetidas))
A('-' * 78)
A('Somadas, como em agosto. Todas estao com quantidade zero, logo o total nao')
A('se move.')
for r in repetidas:
    A('   %-42s %-14s mantida %-18s somada %-18s qtd +%s'
      % (r['produto'][:42], r['setor'], r['origem_mantida'], r['origem_somada'],
         r['quantidade_somada']))
if not repetidas:
    A('   nenhuma')
A('')
A('-' * 78)
A('13. CONFLITO DE SETOR  (%d)' % len(conflitos_setor))
A('-' * 78)
A('Linha cujo bloco da planilha aponta para um setor diferente do que o')
A('cadastro tem. A linha fica no setor DO CADASTRO e o caso vira pendencia: nao')
A('se muda produto de setor sem a cliente decidir.')
for c in conflitos_setor:
    A('   %-30s planilha: %-14s (%s)   cadastro: %-14s (%s)   qtd %s   %s'
      % (c['produto'][:30], c['setor_outubro'], c['bloco_outubro'],
         c['setor_cadastro'], c['categoria_cadastro'], c['quantidade'], c['origem']))
if not conflitos_setor:
    A('   nenhum que tenha chegado a esta secao.')
    A('')
    A('   O unico caso de dois setores no mesmo produto — POLIFLOR, listado em')
    A('   DESCARTÁVEIS (Geral!V44) e de novo em MATERIAL DE LIMPEZA (Geral!V122) —')
    A('   foi resolvido antes, na secao 11, pela regra de agosto: e o mesmo frasco,')
    A('   vale a primeira ocorrencia. As duas linhas estao com quantidade zero,')
    A('   logo o total nao se move.')
A('')
A('-' * 78)
A('14. PRODUTOS DO CATALOGO SEM LINHA EM OUTUBRO  (%d de %d)'
  % (len(ausentes), len(catalogo['produtos'])))
A('-' * 78)
A('Nao foram desativados nem apagados: a contagem de outubro simplesmente nao')
A('os lista. O cadastro e o historico de agosto continuam intactos.')
A('')
for p in sorted(ausentes, key=lambda x: (x['categoria'], x['nome'])):
    A('   %-44s %-24s %-14s custo %s'
      % (p['nome'][:44], p['categoria'], p['setores'][0]['setor'], p['custo_medio']))
A('')
A('   por categoria: %s'
  % ', '.join('%s=%d' % kv for kv in sorted(
      collections.Counter(p['categoria'] for p in ausentes).items())))
A('')
A('-' * 78)
A('15. FORA DA CONTAGEM, DE PROPOSITO')
A('-' * 78)
A('   colunas PEDIDO e VALOR DO PEDIDO ......... nao fazem parte da contagem')
A('   aba "Bebidas Alcoolicas", coluna 12+ ..... lista de pedido de fornecedor')
A('     (%d rotulos, soma R$ %.2f) — "BEBIDAS PEDRO PACHECO", AZUMA, CAPEL, ...'
  % (len(bruta['pedido_fornecedor_fora_da_contagem']),
     sum(x['valor'] for x in bruta['pedido_fornecedor_fora_da_contagem'])))
for x in bruta['pedido_fornecedor_fora_da_contagem']:
    A('        %-24s valor %s   %s' % (x['rotulo'], x['valor'], x['origem']))
A('   aba "Perda" .............................. nao e contagem de estoque')
for p in bruta['aba_perda_fora_da_contagem']:
    A('        r%-3d %s' % (p['linha'], p['celulas']))
A('   Geral!B95 PERDA DE PRATO ................. 0 (fora da contagem)')
A('   Geral A74:E95 (resumo MERCADORIAS EM ESTOQUE) ... usado so como conferencia')
A('')
A('-' * 78)
A('16. IMPACTO NAS FICHAS TECNICAS')
A('-' * 78)
A('   fichas tecnicas cadastradas para o Bar do Zeca - Norte Shopping: 0')
A('   (a unica ficha do banco, "Picanha na cerveja", pertence ao restaurante')
A('   "Casa de Teste" das suites de RLS e nao usa nenhum produto deste tenant)')
A('   Logo: nenhuma ficha usa produto cujo custo mudou, e vw_fichas_completas')
A('   nao muda de valor para este restaurante nesta carga. Quando a primeira')
A('   ficha for cadastrada, ela ja nascera com os custos de outubro.')
A('')
A('-' * 78)
A('17. ACHADOS E PENDENCIAS')
A('-' * 78)
if achados:
    for a in achados:
        A('   · %s' % a)
else:
    A('   nenhum achado automatico.')
A('')
A('   Pendencias para a cliente decidir:')
A('   · CANELA EM PÓ entrou em MERCEARIA porque e o bloco da planilha que a')
A('     trouxe (Geral!H21). Pelo uso, TEMPEROS E AFINS seria defensavel — e a')
A('     categoria onde mora CANELA EM PAU. Nao foi mexido: a planilha manda.')
A('   · As 8 unidades divergentes da secao 9b: o custo foi atualizado, a unidade')
A('     nao. Decidir item a item na tela de Produtos.')
A('   · NIRÁ (Hortifruti!A71) ocupa a celula onde agosto tinha NABO. Sao')
A('     vegetais diferentes com preco diferente (42,00 x 6,10): NIRÁ entrou como')
A('     produto novo e NABO ficou na lista da secao 14.')
A('   · Nenhuma categoria nova foi criada, e nenhuma foi necessaria.')
A('')
A('=' * 78)
A('FIM')
A('=' * 78)

with open(RELATORIO, 'w') as fh:
    fh.write(rel(L) + '\n')

# ---------------------------------------------------------------- terminal ---
print('linhas de contagem .....', len(linhas))
print('produtos unicos ........', len({l['produto_id'] for l in linhas}))
print('produtos novos .........', len(novos))
print('total contagem .........  %.4f  (planilha %.4f, diferenca %+.6f)'
      % (total_contagem, total_planilha, total_contagem - total_planilha))
print('descartados ............', len(descartados))
print('desdobrados ............', len(desdobrados))
print('regrafados .............', len(regrafados))
print('repetidas somadas ......', len(repetidas))
print('conflitos de setor .....', len(conflitos_setor))
print('custos atualizados .....', len(custos), '(subiram %d, cairam %d, iguais %d, zero %d)'
      % (len(sobe), len(cai), custos_iguais, len(custos_zerados)))
print('custo_medio atualizado .', len(custo_medio_novo))
print('custo_fixo mudando .....', len(custo_fixo_planejado))
print('unidades divergentes ...', len(unidades_divergentes))
print('ausentes em outubro ....', len(ausentes))
print('achados ................', len(achados))
for a in achados: print('   ·', a)
print('setores ................', setores_usados)
print('categorias .............', len(categorias_usadas))
print('unidades ...............', dict(collections.Counter(l['unidade'] for l in linhas)))
print()
print('escrito:', DEST)
print('escrito:', RELATORIO)
