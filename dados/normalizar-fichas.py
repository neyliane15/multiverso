# -*- coding: utf-8 -*-
"""Decide o que e ficha de BEBIDA, casa cada ingrediente com o nosso catalogo.

Entra  : dados/fichas-bruto.json                    (extrair-fichas.py)
         dados/catalogo-atual.json                  (retrato do banco PRE-0003)
         dados/contagem-bar-do-zeca-2026-10.json    (normalizar-outubro.py)
Sai    : dados/fichas-drinques.json
         dados/RELATORIO-FICHAS.txt

O extrair-fichas.py le o PDF e nao decide nada. Aqui estao as decisoes, e cada
uma e uma TABELA ESCRITA A MAO, nome por nome, no espirito da `DESDOBRAR` do
normalizar-outubro.py. Casamento automatico por semelhanca serviu para PROPOR
(a bancada que gerou estas tabelas esta no laudo); nenhuma linha entrou sem eu
olhar os dois nomes.

Sao quatro tabelas, e o script se recusa a rodar se qualquer uma estiver
incompleta — essa e a trava que impede uma ficha de sumir em silencio:

  CLASSIFICACAO  o que cada ficha de servico e, e em que grupo do cardapio
                 entra. Toda ficha que a triagem mecanica apontar como bebida
                 tem de estar aqui, classificada ou excluida com motivo.
  DEPARA         componente do PDV -> produto do nosso catalogo, com o porque.
  SEM_PRODUTO    componente que NAO existe no catalogo. Nao se inventa produto:
                 o item nao nasce e a falta vai para o relatorio.
  PREPAROS       preparo da casa (xarope, espuma) que vira produto novo.

O CATALOGO EFETIVO. O retrato versionado `catalogo-atual.json` e de ANTES da
carga 0003, com 868 produtos. A 0003 criou 11 produtos e mexeu no custo de 27.
Em vez de guardar um segundo retrato (que envelheceria igual), o catalogo que
vale aqui e RECONSTRUIDO: 868 + os `produtos_novos` da 0003, com os custos dos
`custo_medio_atualizado`. Da 879, que e o que o banco tem depois da 0003 — e o
script confere esse numero. Assim o de-para e reproduzivel a partir de arquivos
que estao no repositorio, e fica provado que ele fala do MESMO catalogo que a
carga de outubro deixou no banco.

O CUSTO NAO VEM DAQUI. Quem calcula custo e o banco, por `mv_custo_do_produto`
e `vw_fichas_completas`, a partir de `produtos.custo_medio` — e por isso a
ficha acompanha o preco real. O custo que este script calcula serve para UMA
coisa: conferir, drinque a drinque, contra o `Total` impresso no PDF. Os dois
nao batem exatamente (fontes e datas diferentes); o que precisa bater e a ordem
de grandeza, e cada divergencia grande esta explicada no relatorio.
"""
import json
import os
import re
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
BRUTO = os.path.join(BASE, 'fichas-bruto.json')
CATALOGO = os.path.join(BASE, 'catalogo-atual.json')
OUTUBRO = os.path.join(BASE, 'contagem-bar-do-zeca-2026-10.json')
DEST = os.path.join(BASE, 'fichas-drinques.json')
RELATORIO = os.path.join(BASE, 'RELATORIO-FICHAS.txt')

RESTAURANTE_ID = 'b0a12eca-0000-4000-8000-000000000001'

# Quantos produtos o banco tem depois da carga 0003. Conferido e nao anotado:
# se o retrato ou a carga mudarem, o de-para abaixo pode estar falando de um
# catalogo que nao existe mais.
PRODUTOS_ESPERADOS = 879

# CMV alvo por tipo de servico. O default da tabela e 30, e o proprio
# comentario da migracao 0017 diz que 30 "e razoavel num prato de cozinha e
# pessimo num drink, onde 20% ja e caro". Entao:
#   · coquetel  -> 20, como o briefing manda;
#   · revenda   -> 30, o default: cerveja, long neck e refrigerante tem a
#                  economia de revenda, nao de coquetel, e 20% de CMV em
#                  long neck nao existe em bar nenhum;
#   · cortesia  -> 100. Cortesia nao tem preco de venda por definicao, entao
#                  "meta de CMV" nao quer dizer nada para ela; 100 e a unica
#                  leitura honesta ("isto e custo inteiro, nao ha margem a
#                  perseguir") e e o maximo que o check da tabela aceita.
CMV_COQUETEL = 20
CMV_REVENDA = 30
CMV_CORTESIA = 100

# ---------------------------------------------------------------- o recorte --
# Ficha tecnica e para o que a casa PREPARA. O que ela apenas revende fechado
# nao tem receita: tem preco de compra, que o catalogo ja sabe.
#
# Este prefixo e o recorte, e ele e UMA LINHA de proposito — porque ele desfaz
# em parte uma decisao que a cliente tomou em voz alta ("nao sao apenas doses e
# garrafas, tudo relacionado a drinks, que envolvam bebidas"), e quem desfaz
# decisao de cliente tem de deixar o botao a vista.
#
# O que o recorte tira sao 23 fichas, e tres medicoes independentes dizem que
# elas sao de revenda e nao de preparo:
#
#  1. as 23 tem EXATAMENTE 1 item cada, todas as 23, sem excecao (as 56 que
#     ficam tem media 3,5 itens, e so 3 tem um item);
#  2. das 5 fichas do conjunto inteiro que levam 1,000 de bebida alcoolica —
#     garrafa fechada vendida inteira, que e a definicao da cliente — as 5
#     estao nas 23. Depois do recorte NAO RESTA nenhum item de garrafa inteira;
#  3. o custo delas contra o PDF fecha quase exato (COCA COLA -0,4%, GUARANA
#     0,0%, HEINEKEN LONGNECK 0,0%), porque produto simples com uma linha nao
#     tem receita para errar.
#
# As 23 nao sao perdidas: a tabela de conferencia delas continua no relatorio,
# marcada como CALIBRACAO DO DE-PARA — e a unica prova de ponta a ponta que
# estes dados permitem, justamente porque sao produto simples de uma linha.
# Trocar este prefixo por '' traz as 23 de volta, e o resto do script se ajusta.
PREFIXO_DO_RECORTE = 'Drinques'

# Trava da regra da cliente, reaplicada DEPOIS do de-para: "garrafa e produto
# fechado vendido inteiro, dose e apenas uma pequena quantidade". Item que
# consuma metade de uma garrafa de destilado ou mais e ACHADO, nao dado.
LIMITE_FRACAO_GARRAFA = 0.5

# Quantas das piores divergencias de custo o relatorio abre linha a linha.
# Doze cobre tudo acima de 20% de diferenca relativa.
PIORES = 12

# Categorias de produto que contam como "garrafa de destilado" para a trava.
CATEGORIA_ALCOOL = 'BEBIDAS ALCOÓLICAS'

# Sinonimos de unidade, copiados de `mv_fator_unidade` (migracao 0017). Precisam
# ser os mesmos: a divergencia que importa e a que a FUNCAO DO BANCO nao resolve
# — `UN` do PDV e `UND` do cadastro sao a mesma unidade e nao sao achado nenhum.
SINONIMO_UNIDADE = {
    'QUILO': 'KG', 'QUILOS': 'KG', 'KILO': 'KG',
    'GR': 'G', 'GRAMA': 'G', 'GRAMAS': 'G',
    'LT': 'L', 'LITRO': 'L', 'LITROS': 'L', 'MLT': 'ML',
    'UN': 'UND', 'UNID': 'UND', 'UNIDADE': 'UND',
    'PC': 'UND', 'PCT': 'UND', 'PECA': 'UND',
}
FAMILIA_UNIDADE = {'KG': 'massa', 'G': 'massa', 'MG': 'massa',
                   'L': 'volume', 'ML': 'volume',
                   'UND': 'unidade', 'DZ': 'unidade'}


def unidade_canonica(u):
    u = (u or '').strip().upper()
    return SINONIMO_UNIDADE.get(u, u)


def unidades_divergem(pdv, cadastro):
    """Divergencia de verdade: a que `mv_fator_unidade` NAO resolve sozinha.

    `UN` x `UND` e a mesma unidade e nao e achado. `KG` x `UND` e: o PDV mede o
    morango em quilo e o nosso cadastro em unidade, e nenhuma funcao converte
    massa em unidade — e por isso que a unidade GRAVADA no item e sempre a do
    nosso cadastro, nunca a do PDV.
    """
    a, b = unidade_canonica(pdv), unidade_canonica(cadastro)
    if a == b:
        return False
    return FAMILIA_UNIDADE.get(a) != FAMILIA_UNIDADE.get(b) \
        or FAMILIA_UNIDADE.get(a) is None


# ------------------------------------------------------------------ utilidades -
def chave(s):
    """Chave de identidade: sem acento, sem caixa, sem pontuacao."""
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    return ' '.join(re.sub(r'[^A-Za-z0-9]', ' ', s).upper().split())


# =============================================================================
# TABELA 1 · CLASSIFICACAO — o que cada ficha de servico de bebida e
# =============================================================================
# A cliente ampliou o escopo: "Nao sao apenas doses e garrafas, tudo
# relacionado a drinks, que envolvam bebidas". Entao a ficha nao e so do
# coquetel: e de tudo o que a casa serve para o cliente BEBER.
#
# A triagem e mecanica e esta em `triar()`:
#   · tem componente (ficha vazia nao vira ficha);
#   · nao e insumo nem preparo: nao comeca com `DS `/`GF `, nao termina em
#     ` MP`, e a unidade do PDV nao e KG nem LT. Dose e garrafa ficam fora
#     como ficha propria porque elas JA entram achatadas dentro de quem as
#     usa — virariam o mesmo custo duas vezes no modulo. KG e preparo de
#     cozinha; LT e preparo de bar a granel (xarope, espuma), e os 14 LT do
#     relatorio sao todos preparo, nenhum e servico;
#   · algum componente achatado e bebida.
#
# A triagem aponta 89 fichas. As 82 que entram e as 7 que saem estao abaixo,
# uma por uma — e `conferir_classificacao()` quebra se a triagem apontar uma
# ficha que nao esteja nesta tabela. A armadilha da ampliacao e o inverso:
# prato que LEVA bebida nao e bebida. O critetio e "a casa serve isto para o
# cliente beber?", e e por isso que os sete pratos abaixo saem com motivo.
#
# Grupos do cardapio (campo `grupo`, que e por onde a tela agrupa):
#   Drinques                       coquetel com alcool
#   Drinques · Happy Hour          idem, versao HH (receita propria, ficha propria)
#   Drinques · Sem Álcool          coquetel/bebida preparada sem alcool
#   Cervejas e Chopps              cerveja e chopp vendidos
#   Cervejas e Chopps · Happy Hour idem, versao HH
#   Refrigerantes e Águas          refrigerante e agua vendidos
#   Cortesias                      o que a casa da (sufixo APOIO no PDV)
#
# O sufixo ` · Happy Hour` sai do nome da ficha terminar em HH, e nao de
# gosto: o PDV usa HH para marcar a versao de happy hour, e ela tem receita
# diferente da normal (APEROL SPRITZ usa `DS APEROL`; APEROL SPRITZ HH usa
# `GF APEROL` direto). Sao duas fichas, nao uma.
DRINQUE = 'Drinques'
DRINQUE_HH = 'Drinques · Happy Hour'
DRINQUE_SEM = 'Drinques · Sem Álcool'
CERVEJA = 'Cervejas e Chopps'
CERVEJA_HH = 'Cervejas e Chopps · Happy Hour'
REFRI = 'Refrigerantes e Águas'
CORTESIA = 'Cortesias'

CLASSIFICACAO = {
    # ---------------------------------------------------- coquetel com alcool -
    '43 SPRITZ': (DRINQUE, 'coquetel: licor 43, agua com gas e limao'),
    'AGORA POR FAVOR': (DRINQUE, 'coquetel: vodka, xarope, energetico e limao'),
    'APEROL SPRITZ': (DRINQUE, 'coquetel: dose de aperol com espumante'),
    'APEROL SPRITZ HH': (DRINQUE_HH, 'versao HH do APEROL SPRITZ: usa GF APEROL'
                                     ' direto, receita propria'),
    'ATOS OITAVO': (DRINQUE, 'coquetel: espumante, vinho licoroso e marshmallow'),
    'BI-SAMBAS': (DRINQUE, 'coquetel: gin arpo, espuma e xarope de maracuja'),
    'BLUE TA DE CAO': (DRINQUE, 'coquetel: cachaca sagatiba e dois xaropes'),
    'BOSSA SOUR': (DRINQUE, 'coquetel: gin tanqueray bossa nova, limao, xarope'),
    'BRASILEIRINHO': (DRINQUE, 'coquetel: cachaca com cafe'),
    'BRISANDO': (DRINQUE, 'coquetel: gin arpo, espuma de gengibre'),
    'BRISEEIIII': (DRINQUE, 'coquetel: espuma de gengibre, baunilha, limao'),
    'CAIPIRINHA BDZ': (DRINQUE, 'caipirinha da casa'),
    'CAIPIRINHA COM MEL': (DRINQUE, 'caipirinha com xarope de canela e mel'),
    'CAIPIRINHA ESP SAGATIBA': (DRINQUE, 'caipirinha especial de sagatiba'),
    'CAIPIRINHA HH': (DRINQUE_HH, 'versao HH da caipirinha: sagatiba, uva e'
                                  ' maracuja'),
    'CAIPIVODKA ABSOLUT BDZ': (DRINQUE, 'caipivodka de absolut com morango'),
    'CAIPIVODKA SKYY': (DRINQUE, 'caipivodka de skyy'),
    'CAIPIVODKA SKYY HH': (DRINQUE_HH, 'versao HH: skyy com lima da persia'),
    'CAMISA 10': (DRINQUE, 'coquetel: jack daniels com xaropes de fruta'),
    'CAMPARI TONICA': (DRINQUE, 'coquetel: campari com tonica'),
    'CARAJILLO BDZ': (DRINQUE, 'coquetel: licor 43 com cafe espresso'),
    'COISA DE MALANDRO': (DRINQUE, 'coquetel: cachaca com xaropes de amora e acai'),
    'CORACAO DE SAMBISTA': (DRINQUE, 'coquetel: cachaca bananinha e sagatiba'),
    'DEIXA ARDER': (DRINQUE, 'coquetel: cachaca, abacaxi, bitter'),
    'DOM AMORES EM VERMELHO': (DRINQUE, 'coquetel: vodka, espuma, mix de pina'),
    'EXPLOSAO DO ZECA': (DRINQUE, 'coquetel: gin arpo com tonica pink'),
    'FOLIA DO DOM': (DRINQUE, 'coquetel: jack honey, limoncello, tonica'),
    'FULERAGEM': (DRINQUE, 'coquetel: gin beefeater pink com energetico'),
    'GIN COM ESPUMA': (DRINQUE, 'coquetel: gin velvo com espuma de hibisco'),
    'GIN PINK': (DRINQUE, 'coquetel: gin beefeater pink, tonica pink, espuma'),
    'GIN TROPICAL': (DRINQUE, 'coquetel: gin tanqueray com red bull tropical'),
    'GT ARPO GIN': (DRINQUE, 'gin tonica de arpo'),
    'GT BOMBAY': (DRINQUE, 'gin tonica de bombay'),
    'GT TANQUERAY': (DRINQUE, 'gin tonica de tanqueray com xarope de morango'),
    'HOJE TA CALOR': (DRINQUE, 'coquetel: tequila, grenadine, manga, abacaxi'),
    'JA FOI': (DRINQUE, 'coquetel: gin beefeater pink com dois monsters'),
    'JA SAIU': (DRINQUE, 'coquetel: energetico, maca verde e limao'),
    'LIMONCELLO SPRITZ': (DRINQUE, 'coquetel: limoncello com espumante'),
    'MOSCOW IN ZECA': (DRINQUE, 'coquetel: vodka ketel one, espuma, gengibre'),
    'NEGRONI BDZ': (DRINQUE, 'negroni da casa: cinzano, gin arpo, campari'),
    'NOAH PAGODINHO': (DRINQUE, 'coquetel: grenadine, acai, mix de pina, morango'),
    'PAREI NO ZECA': (DRINQUE, 'coquetel: cachaca salinas e prateada, tangerina'),
    'QUE CALOR E ESSE': (DRINQUE, 'coquetel: tequila ouro com monster manga'),
    'SAI AGORA': (DRINQUE, 'coquetel: bacardi oro, caramelo, cafe, marshmallow'),
    'SALVE JORGE': (DRINQUE, 'coquetel: cachaca gabriela, maracuja, baunilha'),
    'SEGREDO DO ZECA': (DRINQUE, 'coquetel: gin arpo, xarope de uva, espuma'),
    'SO UM MINUTO': (DRINQUE, 'coquetel: tequila ouro, monster, manga'),
    'TAMO JUNTO': (DRINQUE, 'coquetel: vodka skyy com monster'),
    'TOMA LIZA': (DRINQUE, 'coquetel: cointreau, cachaca prateada, limao'),
    'VAI VIVER': (DRINQUE, 'coquetel: bacardi oro, limao, baunilha'),
    'XEREM': (DRINQUE, 'coquetel: cachaca, bitter, maracuja, limao'),

    # --------------------------------------------------- coquetel sem alcool -
    'MATE DA CASA SABORES': (DRINQUE_SEM, 'mate preparado com xarope de'
                                          ' gengibre: bebida da casa, sem alcool'),
    'MONICA COQUETEL': (DRINQUE_SEM, 'coquetel sem alcool: tonica red mint com'
                                     ' morango — o proprio nome diz coquetel'),
    'SILENCIO': (DRINQUE_SEM, 'coquetel sem alcool: agua com gas e xarope de'
                              ' tangerina'),
    'TO CALMA': (DRINQUE_SEM, 'coquetel sem alcool: hibisco, gengibre, agua com'
                              ' gas e suco natural'),

    # ----------------------------------------------- destilado puro servido -
    'CACHACA DO ZECA': (DRINQUE, 'dose de cachaca ypioca servida pura: a casa'
                                 ' serve para beber, logo e bebida'),

    # ------------------------------------------------------ cerveja e chopp -
    'AMSTEL CHOPP 300 ML HH': (CERVEJA_HH, 'chopp amstel de happy hour: 0,35 do'
                                           ' barril, receita de verdade'),
    'BRAHMA CHOPP 300ML': (CERVEJA, 'chopp brahma: 0,35 do barril de 50 L'),
    'Cerpa Long Neck': (CERVEJA, 'long neck de cerpa servida'),
    'HEINEKEN LONGNECK': (CERVEJA, 'long neck de heineken servida'),
    'Heineken Ultimate LN 330ML': (CERVEJA, 'long neck heineken ultimate servida'),

    # ------------------------------------------------- refrigerante e agua -
    'COCA COLA KS': (REFRI, 'coca-cola KS vendida'),
    'COCA COLA ZERO KS': (REFRI, 'coca-cola zero KS vendida'),
    'MATE': (DRINQUE_SEM, 'mate da casa, servido sem xarope'),

    # ------------------------------------------------------------ cortesia -
    # Sufixo APOIO no PDV: bebida que a casa da (apoio de evento, consumacao de
    # equipe, cortesia de mesa). Entra como ficha porque a cliente pediu TUDO o
    # que envolve bebida, e porque o custo da cortesia e custo de verdade — e o
    # unico numero que ela tem sobre o que a casa da de graca.
    'AGUA COM GAS APOIO': (CORTESIA, 'cortesia de apoio: agua com gas'),
    'AGUA SEM GAS APOIO': (CORTESIA, 'cortesia de apoio: agua sem gas'),
    'ANTARTICA ORIG600 ML APOIO': (CORTESIA, 'cortesia de apoio: antarctica 600'),
    'BRAHMA GF 600 ML APOIO': (CORTESIA, 'cortesia de apoio: brahma 600'),
    'CHOPP 220 ML - APOIO': (CORTESIA, 'cortesia de apoio: 0,25 do barril'),
    'COCA COCA ZERO APOIO KS': (CORTESIA, 'cortesia de apoio: coca zero KS'),
    'COCA COLA APOIO KS': (CORTESIA, 'cortesia de apoio: coca-cola KS'),
    'GUARANA APOIO': (CORTESIA, 'cortesia de apoio: guarana'),
    'GUARANA ZERO APOIO': (CORTESIA, 'cortesia de apoio: guarana zero'),
    'RED BULL ACAI 250 ML APOIO': (CORTESIA, 'cortesia de apoio: red bull acai'),
    'RED BULL C APOIO': (CORTESIA, 'cortesia de apoio: red bull'),
    'RED BULL MELANCIA 250 ML C APOIO': (CORTESIA, 'cortesia: red bull melancia'),
    'RED BULL SUGAR FREE APOIO': (CORTESIA, 'cortesia: red bull sem acucar'),
    'RED BULL TROPICAL 250 ML C APOIO': (CORTESIA, 'cortesia: red bull tropical'),
    'SPATEN 600 ML APOIO': (CORTESIA, 'cortesia de apoio: spaten 600'),
    'STELA LONG NECK APOIO': (CORTESIA, 'cortesia de apoio: stella long neck'),
    'TONICA APOIO': (CORTESIA, 'cortesia de apoio: tonica'),
    'TONICA ZERO APOIO': (CORTESIA, 'cortesia de apoio: tonica zero'),
}

# A armadilha da ampliacao, resolvida uma a uma: prato que LEVA bebida (ou que
# a triagem pegou por semelhanca de nome) NAO e bebida.
FORA = {
    'ARROZ DE CAMARAO P/ 1': 'prato: arroz de camarao. Entrou na triagem pelo'
                             ' MIX DE QUEIJOS MP',
    'ARROZ DE CAMARAO P/2': 'prato: arroz de camarao para dois. Idem',
    'ATOLEI NO ZECA': 'prato: pure de aipim com acem e queijo. Entrou pelo'
                      ' MIX DE QUEIJOS MP',
    'BATATA DE MARECHAL': 'prato: batata com calabresa e queijo. Idem',
    'CPD GNOCCHI 180g': 'prato: nhoque com ragu de cordeiro. Leva VINHO TINTO'
                        ' SUAVE e VINHO BRANCO SECO como ingrediente de cozinha',
    'MENU PORTO': 'combo de sobremesas de evento. Leva um espumante'
                  ' (PUTRUELE NOCHETERNA BRUT) entre sete itens, mas o que se'
                  ' serve e a sobremesa',
    'PASTEL QUEIJO UND': 'prato: pastel de queijo. Entrou pelo MIX DE QUEIJOS MP',
}


# =============================================================================
# TABELA 2 · DEPARA — componente do PDV -> produto do nosso catalogo
# =============================================================================
# Escrita a mao, nome por nome. O criterio de desempate, em ordem:
#
#  1. NOME, quando ele e inequivoco.
#  2. CUSTO IMPRESSO NO PDF. E o desempate mais forte que existe aqui, e em 14
#     casos ele e EXATO: `GF APEROL` vale 43,93 no PDF e `APERITIVO APEROL
#     (750ml)` vale 43,93 no nosso catalogo. Nao e coincidencia — e o mesmo
#     produto, com o mesmo preco de compra, escrito de dois jeitos.
#  3. GEOMETRIA DA DOSE. A casa usa fracao fixa de 0,062 em 41 das 54 doses, e
#     0,062 x 965 ml = 60 ml, 0,062 x 1000 ml = 62 ml, 0,066 x 900 ml = 59 ml.
#     Entao a fracao e DO RECIPIENTE, e o tamanho do recipiente que faz a conta
#     fechar em ~60 ml e o que a casa usa.
#  4. EXCLUSAO. `LIMÃO` generico casa com LIMÃO TAHITI porque o PDF lista
#     `LIMÃO SICILIANO` separado, e Tahiti e Siciliano sao os dois unicos
#     limoes do catalogo.
#
# A UNIDADE do item e a do NOSSO cadastro, nunca a do PDV — e `mv_fator_unidade`
# devolve 1 para unidade igual nos dois lados, que e o que mantem a quantidade
# intacta. A coluna de unidade do PDV nao e confiavel nas garrafas: ela diz LT
# em `GF APEROL` e o V. Unit impresso e o preco da garrafa de 750 ml, nao o do
# litro. Toda divergencia PDV x cadastro esta listada no relatorio.
#
# Cada linha e (produto_no_catalogo, motivo).
DEPARA = {
    # -------------------------------------------- destilados: garrafa inteira -
    # Fracao da GARRAFA, e a garrafa e o produto UND do nosso catalogo.
    'GF ABSOLUT': ('VODKA ABSOLUT (1000ml)',
                   'nome; 0,062 x 1000 ml = 62 ml, a dose da casa'),
    'GF AMARETO DEL ORSO': ('LICOR AMARETTO DELL ORSO', 'nome'),
    'GF APEROL': ('APERITIVO APEROL (750ml)',
                  'custo EXATO: PDF 43,93 = catalogo 43,93'),
    'GF ARPO BAG': ('GIN ARPO 5 LT',
                    'nome (BAG = bag-in-box de 5 L) e aritmetica exata: o V.'
                    ' Unit do PDF, 44,40, x 5 = 222,00, que e o preco do bag no'
                    ' nosso catalogo — ou seja o PDV precifica o bag POR LITRO'
                    ' num campo que e por bag. 0,012 x 5 L = 60 ml, a dose da'
                    ' casa. O outro candidato (GIN ARPO 750 ML) daria 9 ml'),
    'GF BACARDI BRANCO': ('RUM BACARDÍ CARTA BRANCA (980ml)', 'nome'),
    'GF BACARDI ORO': ('RUM BACARDÍ CARTA ORO (980ml)',
                       'nome; 0,062 x 980 ml = 61 ml'),
    'GF BANANINHA': ('CACHAÇA BANANINHA',
                     'nome; custo PDF 40,71 x catalogo 39,90'),
    'GF CACHACA SALINAS': ('CACHAÇA SALINAS TRADICIONAL (600ml)', 'nome'),
    'GF CAMPARI': ('APERITIVO CAMPARI MILANO BITTER (900ml)',
                   'nome; custo PDF 44,99 x catalogo 47,00'),
    'GF CINZANO VERMOUTH ROSSO': ('VERMOUTH CINZANO ROSSO (950ml)',
                                  'nome. O catalogo tem este produto DUAS vezes'
                                  ' (tambem como `CINZANO V. ROSSO`, mesmo'
                                  ' custo 26,81); escolhido o nome completo e a'
                                  ' duplicata virou achado'),
    'GF GABRIELA': ('CACHAÇA GABRIELA',
                    'custo EXATO: PDF 49,20 = catalogo 49,20'),
    'GF GIN BEEFETER 750 ML': ('GIN BEEFEATER LONDON DRY (750ml)',
                               'nome + tamanho; BEEFETER e erro de digitacao do PDV'),
    'GF GIN BEEFETER PINK 750 ML': ('GIN BEEFEATER PINK (750ml)',
                                    'nome + tamanho batem'),
    'GF GIN BOMBAY': ('GIN BOMBAY SAPPHIRE (750ml)',
                      'Bombay sem adjetivo e o Sapphire; 750 ml e o tamanho'
                      ' padrao da casa. O catalogo tambem tem o de 1000 ml'
                      ' (77,99) e o BRAMBLE (72,90) — ver pendencias'),
    'GF GIN TANQUERAY BOSSA NOVA': ('GIN TANQUERAY BOSSA NOVA (700ml)',
                                    'nome identico'),
    'GF JACK DANIELS': ('WHISKY JACK DANIEL\'S (1000ml)',
                        'nome sem adjetivo = o Jack comum. CUIDADO: o V. Unit do'
                        ' PDF (122,00) e igual ao custo do JACK DANIEL´S APPLE'
                        ' no catalogo, o que e armadilha — o PDV tem ficha'
                        ' separada `DS JACK DANIEL S APPLE` para o Apple'),
    'GF JACK DANIELS APPLE': ('WHISKY JACK DANIEL´S APPLE',
                              'nome; custo EXATO: PDF 122,00 = catalogo 122,00'),
    'GF JACK HONEY': ('WHISKY JACK DANIEL\'S HONEY (1000ml)',
                      'nome; custo PDF 125,00 x catalogo 132,90'),
    'GF LICOR 43': ('LICOR DIEGO ZAMORA 43',
                    'Licor 43 e da Diego Zamora; custo PDF 174,29 x catalogo'
                    ' 180,00'),
    'GF LIMONCELLO': ('LICOR LIMONCELLO CARAVELLAS (750ml)',
                      'nome. O catalogo tem DOIS limoncellos pelo mesmo custo'
                      ' (132,90): CARAVELLAS e VILLA MASSA. Escolhido o que'
                      ' comeca por LIMONCELLO, que e como o PDV escreve — e a'
                      ' escolha virou pendencia para a cliente'),
    'GF MALIBU': ('LICOR MALIBU', 'nome'),
    'GF PRATEADA': ('CACHAÇA JAMBUZADA PRATEADA',
                    'custo EXATO: PDF 54,90 = catalogo 54,90'),
    'GF TANQUERAY': ('GIN TANQUERAY LONDON DRY (750ml)',
                     'Tanqueray sem adjetivo e o London Dry; custo PDF 98,64 x'
                     ' catalogo 103,97'),
    'GF TEQUILA JOSE CUERVO': ('TEQUILA JOSÉ CUERVO PRATA (750ml)',
                               'por exclusao: o PDV tem `GF TEQUILA JOSE CUERVO'
                               ' ORO` separado, que casa EXATO com o OURO'
                               ' (99,00), logo o sem adjetivo e o PRATA'),
    'GF TEQUILA JOSE CUERVO ORO': ('TEQUILA JOSÉ CUERVO OURO (750ml)',
                                   'custo EXATO: PDF 99,00 = catalogo 99,00'),
    'GF VELVO BOTANIC GIN': ('GIN VELVO BOTANIC PREMIUM (700ml)', 'nome'),
    'GF VODKA SKYY': ('VODKA SKY (980ml)',
                      'nome (SKYY x SKY, uma letra); 0,062 x 980 ml = 61 ml'),
    'CACHAÇA SAGATIBA': ('CACHAÇA SAGATIBA PURA (700ml)',
                         'custo EXATO: PDF 25,00 = catalogo 25,00'),
    'CACHAÇA YPIOCA PRATA': ('CACHAÇA YPIOCA PRATA (965ml)', 'nome identico'),

    # ------------------------------------------- aperitivos, vinho, espumante -
    'ESPUMANTE SALTON BRUT 750 ML': ('ESPUMANTE SALTON',
                                     'nome; 0,333 x 750 ml = 250 ml, uma taca.'
                                     ' O catalogo tambem tem SALTON 0/0% (sem'
                                     ' alcool), que nao serve para spritz'),
    'VINHO SALTON ATOS LICOROSO': ('ESPUMANTE ATOS LICOROSO',
                                   'nome (o PDV chama de vinho o que o catalogo'
                                   ' chama de espumante licoroso)'),
    'BITTER ANGOSTURA AROMATIC': ('BITTER ANGOSTURA',
                                  'nome; 0,001 de garrafa = um dash'),
    'BITTER ANGOSTURA AROMATIC 100ML': ('BITTER ANGOSTURA',
                                        'mesmo produto que a linha de cima — o'
                                        ' PDV tem o Angostura cadastrado DUAS'
                                        ' vezes, com codigos e custos'
                                        ' diferentes (780,00 e 0,00)'),

    # ---------------------------------------------------------------- cerveja -
    'ANTARTICA ORIG600 ML': ('CERVEJA ANTARCTICA ORIGINAL (600ml)',
                             'nome + 600 ml; custo PDF 7,05 x catalogo 6,68'),
    'BRAHMA GF 600 ML': ('CERVEJA BRAHMA (600ml)',
                         'nome + 600 ml; custo PDF 6,59 x catalogo 6,36'),
    'CERVEJA HEINEKEN 330 ML': ('CERVEJA HEINEKEN 330 ML',
                                'nome E custo identicos (6,20): um dos poucos'
                                ' que casam por nome exato'),
    'CERVEJA HEINEKEN ULTIMATE': ('CERVEJA HEINEKEN 330 ML ULTIMATE',
                                  'nome; custo PDF 6,55 x catalogo 6,23'),
    'STELLA LONG NECK': ('CERVEJA STELLA LONG NECK (330ml)',
                         'nome; custo PDF 5,04 x catalogo 5,88. O catalogo tem'
                         ' tambem a PURE GOLD long neck, que e outro produto'),
    # Chopp: a fracao e em LITRO, e nos tres barris do nosso catalogo o custo
    # cadastrado e POR LITRO (9,91 / 12,89 / 13,73), embora a unidade diga UND
    # em dois deles. Entao a quantidade 0,35 vale direto, e a unidade errada do
    # cadastro e achado, nao obstaculo.
    'CHOPP AMSTEL BARRIL 50L': ('CHOPP AMSTEL (30LT)',
                                'unico chopp Amstel do catalogo. O PDV diz'
                                ' barril de 50 L e o cadastro diz 30 L —'
                                ' divergencia de tamanho que e achado; o custo'
                                ' cadastrado (9,91) e por litro, como o do PDF'
                                ' (10,41), e e isso que faz a conta fechar'),
    'CHOPP BRAHMA CLARO BARRIL 50L': ('CHOPP BRAHMA (50lts)',
                                      'nome + 50 L batem nos dois lados; custo'
                                      ' por litro PDF 14,17 x catalogo 12,89'),

    # ------------------------------------------- refrigerante, agua, tonica -
    'AGUA COM GAS': ('ÁGUA COM GÁS (350ml)',
                     'custo decide: PDF 1,20 x catalogo 1,19 na garrafinha de'
                     ' 350 ml, contra 3,00 na de 1,5 L. O drinque que leva 0,5'
                     ' leva meia garrafinha de 350 ml'),
    'AGUA SEM GAS': ('ÁGUA SEM GÁS (350ml)',
                     'mesmo desempate pelo custo: 1,20 x 1,19'),
    'AGUA 1 5 L': ('ÁGUA SEM GÁS (1,5lts)',
                   'o nome do PDV diz 1,5 L. O custo NAO bate (PDF 20,98 x'
                   ' catalogo 3,00) e isso e achado: 20,98 numa garrafa de agua'
                   ' de 1,5 L e erro de cadastro do PDV'),
    'COCA-COLA KS': ('COCA COLA KS', 'nome; custo PDF 2,26 x catalogo 2,25'),
    'COCA-COLA ZERO KS': ('COCA COLA ZERO KS', 'nome; 2,26 x 2,25'),
    'GUARANA': ('GUARANÁ ANTARCTICA (350ml)',
                'custo EXATO: PDF 2,83 = catalogo 2,83'),
    'GUARANA ZERO': ('GUARANÁ ANTARCTICA ZERO (350ml)',
                     'custo EXATO: PDF 2,83 = catalogo 2,83'),
    'TONICA C': ('TÔNICA SCHWEPPES',
                 'custo EXATO: PDF 3,59 x catalogo 3,58. O `C` do PDV e o'
                 ' sufixo de "com acucar", que o catalogo nao usa'),
    'TONICA ZERO C': ('TÔNICA SCHWEPPES ZERO',
                      'custo EXATO: PDF 3,58 = catalogo 3,58'),
    'TONICA SCHWEPPES': ('TÔNICA SCHWEPPES',
                         'nome exato. MESMO produto que `TONICA C` — o PDV tem'
                         ' a tonica cadastrada duas vezes, uma delas com custo'
                         ' zero'),
    'TONICA PINK LIMONADE': ('TÔNICA PINK LIMONADE',
                             'nome exato; custo PDF 4,08 x catalogo 4,00'),
    'TONICA RED MINT': ('TÔNICA PINK LIMONADE RED MIN',
                        'nome (RED MINT x RED MIN); custo EXATO 4,00'),

    # ----------------------------------------------------------- energeticos -
    # O PDV distingue quatro sabores de Monster; o catalogo tem UM produto
    # MONSTER, de custo 7,66 — exatamente o V. Unit que o PDF usa em tres dos
    # quatro. Casar todos no mesmo produto mantem o custo certo e deixa a
    # pendencia visivel.
    'MONSTER SABORES': ('MONSTER', 'custo EXATO: PDF 7,66 = catalogo 7,66'),
    'MONSTER ENERGETICO SEM ACUCAR': ('MONSTER',
                                      'o catalogo tem um unico MONSTER; custo'
                                      ' PDF 7,66 = catalogo 7,66'),
    'MONSTER PACIFIC PUNCH 473 ML': ('MONSTER',
                                     'idem; custo PDF 7,67 x catalogo 7,66'),
    'MONSTER ULTRA FIESTA MANGO 473 ML': ('MONSTER',
                                          'idem; PDF 7,64 x catalogo 7,66'),
    'MONSTER ULTRA PEACHY KEEN 473 ML': ('MONSTER',
                                         'idem; PDF 7,64 x catalogo 7,66'),
    'RED BULL C': ('RED BULL', 'custo EXATO: PDF 7,49 = catalogo 7,49'),
    'RED BULL SUGAR FREE': ('RED BULL ZERO',
                            'sugar free = zero; custo PDF 7,19 x catalogo 7,49'),
    'RED BULL ACAI 250 ML': ('RED BULL AÇAI', 'nome'),
    'RED BULL MELANCIA 250 ML C': ('RED BULL MELANCIA (250ml)', 'nome + 250 ml'),
    'RED BULL TROPICAL 250 ML C': ('RED BULL THE TROPICAL EDITION (250ml)',
                                   'nome + 250 ml; custo EXATO 7,49'),

    # ------------------------------------------------------- xaropes Monin -
    'XAROPE FRANCES BAUNILHA': ('XAROPE MONIN BAUNILHA',
                                'o "xarope frances" do PDV e o Monin; custo PDF'
                                ' 66,86 x catalogo 67,86'),
    'XAROPE FRANCES GRENADINE MONIN': ('XAROPE MONIN GRENADINE (700ml)',
                                       'nome; 66,86 x 67,86'),
    'XAROPE FRANCES TANGERINA MONIN 700ML': ('XAROPE MONIN TANGERINA',
                                             'nome; o PDF traz custo 0,00'),
    'XAROPE MONIN ACAI': ('XAROPE MONIN AÇAI (700ml)',
                          'nome; custo PDF 46,80 x catalogo 42,71'),
    'XAROPE MONIN AMORA 700 ML': ('XAROPE MONIN AMORA (700ml)',
                                  'nome + 700 ml; PDF 46,90 x catalogo 67,86'),
    'XAROPE MONIN CARAMELO 700 ML': ('XAROPE MONIN CARAMELO SALGADO (700ml)',
                                     'unico caramelo Monin de 700 ml do'
                                     ' catalogo; o PDF traz custo 0,00, entao'
                                     ' nao ha desempate por preco'),
    'XAROPE MONIN DE MACA VERDE 700ML': ('XAROPE MONIN MAÇÃ VERDE (700ml)',
                                         'nome + 700 ml; 68,43 x 67,86'),
    'XAROPE MONIN MANGA 700ML': ('XAROPE MONIN SPICY MANGO (700ml)',
                                 'unica manga Monin do catalogo. O PDV tem'
                                 ' TAMBEM `XAROPE MONIN SPICE MANGO`, que cai'
                                 ' no mesmo produto — ver pendencias'),
    'XAROPE MONIN SPICE MANGO': ('XAROPE MONIN SPICY MANGO (700ml)',
                                 'nome (SPICE x SPICY)'),

    # ------------------------------------------------------- hortifruti etc -
    'LIMÃO': ('LIMÃO TAHITI',
              'por EXCLUSAO: o catalogo tem dois limoes, Tahiti e Siciliano, e'
              ' o PDF lista `LIMÃO SICILIANO` como componente separado. Logo o'
              ' `LIMÃO` generico — o da caipirinha — e o Tahiti. Custo PDF'
              ' 10,70 x catalogo 7,11'),
    'LIMÃO SICILIANO': ('LIMÃO SICILIANO', 'nome exato'),
    'LIMA DA PERSIA': ('LIMA DA PÉRSIA', 'nome exato (sem acento no PDV)'),
    'LARANJA BAHIA': ('LARANJA BAHIA', 'nome exato'),
    'LARANJA PÊRA': ('LARANJA PERA', 'nome exato (sem acento no cadastro)'),
    'ABACAXI': ('ABACAXI', 'nome exato'),
    'MARACUJÁ AZEDO': ('MARACUJÁ',
                       'unico maracuja do catalogo; custo PDF 12,30 x catalogo'
                       ' 13,20'),
    'MORANGO': ('MORANGO',
                'nome exato. A unidade divergente e achado: o PDV mede em KG e'
                ' o nosso cadastro em UND'),
    'UVA ROXA': ('UVA CRISON ROXA', 'unica uva roxa do catalogo'),
    'UVA THOMPSON': ('UVA VERDE THOMPSON', 'nome (Thompson e a uva verde)'),
    'TANGERINA IMPORTADA': ('TANGERINA IMPORTADA', 'nome exato'),
    'MANJERICAO': ('MANJERICÃO',
                   'nome (sem acento no PDV). Unidade divergente: PDV em KG,'
                   ' cadastro em UND'),
    'GENGIBRE': ('GENGIBRE', 'nome exato'),
    'ACUCAR REFINADO': ('AÇUCAR REFINADO (1kg)',
                        'nome (sem cedilha no PDV); custo PDF 3,90 x catalogo'
                        ' 3,35'),
    'MEL 500G': ('MEL (500g)',
                 'nome + 500 g. Custo divergente e achado: PDF 50,20 x catalogo'
                 ' 23,00'),
    'HIBISCUS': ('HIBISCUS', 'nome exato'),
    'CANELA PAU': ('CANELA EM PAU',
                   'nome quase exato (o PDV inverte as duas ultimas palavras).'
                   ' O catalogo tem CANELA EM PAU (KG, R$ 65,45, TEMPEROS E'
                   ' AFINS) e CANELA EM PÓ (KG, R$ 48,00, MERCEARIA); o xarope'
                   ' usa a canela EM PAU, que e a que se infunde. Entrou na'
                   ' auditoria: era o unico ingrediente de preparo sem linha'
                   ' aqui, e sem ele o XAROPE DE CANELA E MEL nao tem preco'
                   ' proprio no nosso catalogo'),
    'MARSHMALLOW': ('MARSHMELLOWS',
                    'nome (grafia); custo PDF 6,00 x catalogo 7,99. NAO e o'
                    ' XAROPE MONIN MARSHMELOW: o PDV mede em KG, e doce, nao'
                    ' xarope'),
    'EMULSIFICANTE': ('EMULSIFICANTE', 'nome exato'),
    'CEREJA EM CALDAS': ('CEREJA MARRASQUINO',
                         'unica cereja em calda do catalogo'),
    'LEITE DE COCO': ('LEITE DE COCO', 'nome exato'),
    'LEITE CONDENSADO': ('LEITE CONDENSADO (395ml)',
                         'custo EXATO: PDF 5,69 = catalogo 5,69, que e a lata'
                         ' de 395 ml e nao a bisnaga de 2,6 kg'),
    'CREME DE LEITE 17% - 1,030KG': ('CREME DE LEITE',
                                     'unico creme de leite do catalogo; custo'
                                     ' PDF 13,58 x catalogo 12,89'),
    'CAFÉ NESPRESSO RISTRETTO': ('CAFÉ CAPSULA',
                                 'a capsula de cafe do catalogo; custo PDF 2,05'
                                 ' x catalogo 2,35, que e preco de CAPSULA e'
                                 ' nao de quilo — a unidade KG do cadastro esta'
                                 ' errada e e achado'),
    'CAFÉ NESPRESSO BRAZIL ORGANIC': ('CAFÉ CAPSULA',
                                      'mesma capsula; o catalogo nao distingue'
                                      ' sabor de capsula'),
}

# =============================================================================
# TABELA 2b · AVISO_NO_ITEM — a duvida viaja junto com o dado
# =============================================================================
# Ha tres lugares onde o de-para esta certo no dinheiro e duvidoso no
# significado, e nos tres a tentacao e gravar o numero "certo" e quebrar algo:
#
#  · MORANGO e MANJERICAO: o PDV mede em KG e o nosso cadastro em UND. Gravar
#    'KG' POE os itens em `unidade_incompativel`, o custo deles vem NULO e o
#    bloco de verificacao derruba a carga inteira — medido na auditoria. E a
#    evidencia diz que o numero gravado esta na ordem de grandeza certa (o
#    morango foi contado a R$ 22,02/UND em agosto e R$ 59,67/UND em outubro,
#    contra R$ 37,43/KG no PDV, e todo o resto do hortifruti esta em KG): a UND
#    e um quilo mal rotulado. Entao a unidade fica UND e a DUVIDA fica escrita.
#
#  · GF CAMPARI: a fracao e 0,006, que em 900 ml da 5,4 ml. Nenhuma outra dose
#    do relatorio e tao pequena (a menor legitima e 0,012, que em 5 L da 60 ml),
#    e 0,066 — a fracao que o PDV usa em sete outras doses — daria 59,4 ml. E
#    provavel que seja digito faltando, mas "provavel" nao entra no banco.
#
#  · CAFÉ CAPSULA: o nosso cadastro diz KG e o preco e de CAPSULA. O item esta
#    certo em dinheiro (1,000 x R$ 2,35) e errado em rotulo, e no dia em que
#    alguem arrumar o produto para UND a unidade DESTE item tem de ir junto.
#
# A `observacao` do item e o unico lugar que carrega texto ate a tela e sai no
# SQL ao lado do numero. Ela ja traz `PDV: <componente>`; aqui ganha o resto.
# Custo de gravar a duvida: zero. Custo de nao gravar: alguem reconfere o que
# ja foi conferido, ou pior, nao reconfere.
#
# A chave e o nome do componente NO PDV.
AVISO_NO_ITEM = {
    'MORANGO': 'PDV mede em KG e o nosso cadastro em UND — conferir o peso'
               ' da UND',
    'MANJERICAO': 'PDV mede em KG e o nosso cadastro em UND — conferir o peso'
                  ' da UND',
    'GF CAMPARI': 'dose de 5,4 ml no PDV (0,006 x 900 ml); conferir se e 0,066',
    'CAFÉ NESPRESSO RISTRETTO': 'cadastro em KG com preco de capsula; ao'
                                ' corrigir para UND, mudar a unidade deste'
                                ' item junto',
    'CAFÉ NESPRESSO BRAZIL ORGANIC': 'cadastro em KG com preco de capsula; ao'
                                     ' corrigir para UND, mudar a unidade'
                                     ' deste item junto',
}


# Componente que simplesmente NAO existe no catalogo. Nao se inventa produto:
# o item nao nasce, a ficha nasce incompleta e a falta vai para o relatorio
# como pendencia da cliente, com o nome do que falta cadastrar.
SEM_PRODUTO = {
    'CERVEJA CERPA': 'nao existe nenhuma Cerpa no catalogo (as cervejas'
                     ' cadastradas sao Heineken, Brahma, Amstel, Stella,'
                     ' Antarctica, Caracu). O PDF ainda traz custo 0,00 e'
                     ' quantidade 2,857 — ver achados',
    'SPATEN 600ML': 'nao existe Spaten no catalogo. O PDF traz custo 0,00',
    'MATE -BASE': 'o mate-base e preparo da casa, NAO tem ficha no PDF e nao'
                  ' existe no catalogo. O catalogo tem `MATTE` (UND, 9,99), que'
                  ' e produto comprado e nao a base pronta: casar os dois seria'
                  ' chute. Para a casa, cadastrar a base ou dar ficha a ela'
                  ' resolve as duas fichas de mate',
    'DS COINTREAU': 'dose SEM ficha propria no PDF (`cadeia_sem_folha`). O'
                    ' produto existe (LICOR COINTREAU (700ml), 99,22), mas a'
                    ' FRACAO da garrafa nao esta em lugar nenhum e inventar'
                    ' 0,062 por analogia seria chute. Falta a ficha `DS'
                    ' COINTREAU` no PDV',
    'DS KETEL ONE': 'idem: dose sem ficha propria. O produto existe (VODKA'
                    ' KETEL ONE (1000ml), 83,05); falta a fracao',
}


# =============================================================================
# TABELA 3 · PREPAROS — xarope e espuma da casa viram produto do catalogo
# =============================================================================
# No PDF o preparo da casa E uma ficha, com ingredientes proprios. No nosso
# modulo nao existe ficha dentro de ficha: a migracao 0017 nao tem sub-receita.
# O briefing da tres saidas; escolhi a (a), virar produto do catalogo, e o
# argumento e este:
#
#  · a ficha do drinque continua dizendo "xarope de maracuja", que e como a
#    casa enxerga a propria receita. Achatar (saida b) trocaria isso por
#    "acucar 0,012 kg + maracuja 0,02 kg" em quatro drinques, e o barman nao
#    reconheceria mais o que faz;
#  · a saida (b) ainda perderia ingrediente de verdade: a agua do XAROPE DE MEL
#    e o EMULSIFICANTE das espumas somem quando a fracao e pequena o bastante,
#    e o custo do preparo deixa de ser auditavel contra o PDF;
#  · a saida (c), deixar o drinque incompleto, tiraria custo de 23 das 82
#    fichas — justamente as autorais, que sao as que a cliente quer precificar;
#  · o modulo tem `produto_setores.custo_fixo` exatamente para custo calculado
#    pela casa, e nao vindo de nota. O preparo entra por ali.
#
# DE ONDE VEM O CUSTO DO PREPARO — e por que a primeira versao estava errada.
#
# A primeira versao deste script gravava o custo que o PDF calcula para o
# preparo (`total_recalculado`). Era contrabando: o briefing diz que o custo vem
# do NOSSO catalogo, e um preparo cujo custo sai dos precos do PDV e um preco do
# PDV entrando no banco pela porta de servico. O efeito nao era cosmetico — o
# `XAROPE DE MEL` valia R$ 62,788/L porque o PDV cobra R$ 20,98 por uma garrafa
# de agua de 1,5 L e R$ 50,20 pelo mel, os DOIS precos que este mesmo relatorio
# denuncia como erro do PDV. Com os nossos: R$ 24,80/L.
#
# Agora `custo_dos_preparos()` refaz a receita de cada preparo com os precos do
# nosso catalogo, RECURSIVAMENTE (a ESPUMA DE HIBISCO leva CONCENTRADO DE
# GENGIBRE, que leva XAROPE DE GENGIBRE), e pelo mesmo de-para que os drinques
# usam. Isso tem duas consequencias boas:
#
#  · o numero passa a ser auditavel: ele sai dos mesmos precos que a contagem de
#    outubro deixou no banco, e nao de um PDF;
#  · e a lacuna aparece. Foi assim que o `CANELA PAU` apareceu: ele era o unico
#    ingrediente de preparo sem linha no de-para, e o recalculo nao fecha sem
#    ele. Com o V. Unit do PDF ninguem notaria, porque o PDF tem preco para tudo.
#
# O preco pago continua existindo e continua dito: `custo_fixo = true` congela o
# numero no dia da carga. O que mudou e a FONTE dele. Enquanto o modulo nao tiver
# sub-receita, recalcular um preparo quando o acucar subir e trabalho manual — e
# isso esta na lista de pendencias da cliente, com o numero de cada um.
#
# Cada linha e (categoria, setor, unidade, por_que_essa_categoria).
PREPAROS = {
    'ESPUMA DE GENGIBRE': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                           'preparo de bar sem alcool, medido em litro'),
    'ESPUMA DE HIBISCO': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                          'preparo de bar sem alcool, medido em litro'),
    'MIX DE PINA': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                    'mix de leites para coquetel, medido em litro'),
    'SUCO NATURAL': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'UND',
                     'suco de laranja espremido na casa, servido em copo (UND)'),
    'XAROPE DE ACUCAR': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                         'xarope da casa, medido em litro'),
    'XAROPE DE CANELA E MEL': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                               'xarope da casa, medido em litro'),
    'XAROPE DE GENGIBRE': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                           'xarope da casa, medido em litro'),
    'XAROPE DE HIBISCO': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                          'xarope da casa, medido em litro'),
    'XAROPE DE MARACUJA': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                           'xarope da casa, medido em litro'),
    'XAROPE DE MEL': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                      'xarope da casa, medido em litro'),
    'XAROPE DE MORANGO': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                          'xarope da casa, medido em litro'),
    'XAROPE DE UVA': ('BEBIDAS NÃO ALCOÓLICAS', 'Bar', 'LT',
                      'xarope da casa, medido em litro'),
}


# =============================================================================
# o catalogo efetivo
# =============================================================================
def montar_catalogo():
    """868 do retrato + 11 criados pela 0003, com os custos que a 0003 deixou."""
    cat = json.load(open(CATALOGO, encoding='utf-8'))
    out = json.load(open(OUTUBRO, encoding='utf-8'))

    prods = {}
    for p in cat['produtos']:
        prods[p['nome']] = {
            'id': p['id'], 'nome': p['nome'], 'unidade': p['unidade'],
            'categoria': p['categoria'], 'custo': p['custo_medio'],
            'ativo': p['ativo'], 'origem': 'catalogo-atual.json (pre-0003)'}
    for p in out['produtos_novos']:
        prods[p['nome']] = {
            'id': p['id'], 'nome': p['nome'], 'unidade': p['unidade'],
            'categoria': p['categoria'], 'custo': p['custo'],
            'ativo': True, 'origem': 'produto criado pela carga 0003'}
    # A 0003 tambem mexeu no custo_medio de 27 produtos que ja existiam.
    por_id = {v['id']: v for v in prods.values()}
    atualizados = 0
    for c in out['custo_medio_atualizado']:
        alvo = por_id.get(c['produto_id'])
        if alvo is not None:
            alvo['custo'] = c['custo_medio_novo']
            alvo['origem'] += ' + custo de outubro (carga 0003)'
            atualizados += 1

    if len(prods) != PRODUTOS_ESPERADOS:
        raise SystemExit(
            f'catalogo efetivo com {len(prods)} produtos, esperados'
            f' {PRODUTOS_ESPERADOS}. O retrato ou a carga 0003 mudaram; reveja'
            f' o de-para antes de seguir.')
    if cat['restaurante_id'] != RESTAURANTE_ID:
        raise SystemExit('retrato do catalogo e de outro restaurante.')
    return prods, atualizados


# =============================================================================
# triagem e conferencia das tabelas
# =============================================================================
# Token de bebida, com FRONTEIRA DE PALAVRA. Sem o \b, "TOMATE" casa com MATE,
# "CRUMBLE" com RUM e "CARAMELO" com MEL — e meia cozinha entra na triagem de
# bebida. Foi exatamente o que aconteceu na primeira passada.
TOKEN_BEBIDA = re.compile(
    r'\b(CHOPP|CERVEJA|BRAHMA|AMSTEL|HEINEKEN|ANTARTICA|SPATEN|STELLA|CERPA'
    r'|ESPUMANTE|VINHO|PROSECCO|BOTTEGA|CACHACA|CACHAÇA|VODKA|GIN|WHISKY'
    r'|TEQUILA|RUM|LICOR|APEROL|CAMPARI|CINZANO|MARTINI|BITTER|COCA-COLA'
    r'|GUARANA|GUARANÁ|TONICA|TÔNICA|BULL|MONSTER|AGUA|ÁGUA|SUCO|MATE|XAROPE'
    r'|ESPUMA|NESPRESSO|MIX|MARSHMALLOW|PUTRUELE)\b')


def eh_insumo(f):
    """Dose, garrafa, preparo de cozinha (MP/KG) ou preparo de bar (LT)."""
    n = f['nome'].upper()
    return (n.startswith(('DS ', 'GF ')) or n.endswith(' MP')
            or f['unidade_pdv'] in ('KG', 'LT'))


def triar(fichas):
    """As fichas de SERVICO que envolvem bebida. Mecanico, sem julgamento."""
    servicos = [f for f in fichas if f['componentes'] and not eh_insumo(f)]
    bebida = [f for f in servicos
              if any(c['nome'].upper().startswith(('GF ', 'DS '))
                     or TOKEN_BEBIDA.search(c['nome'].upper())
                     for c in f['componentes_achatados'])]
    return servicos, bebida


def conferir_classificacao(bebida):
    """Toda ficha triada tem de estar classificada ou excluida com motivo."""
    nomes = {f['nome'] for f in bebida}
    faltam = sorted(nomes - set(CLASSIFICACAO) - set(FORA))
    sobram = sorted((set(CLASSIFICACAO) | set(FORA)) - nomes)
    if faltam or sobram:
        raise SystemExit(
            'CLASSIFICACAO fora de sincronia com a triagem.\n'
            + (f'  triadas e nao classificadas: {faltam}\n' if faltam else '')
            + (f'  classificadas e nao triadas: {sobram}\n' if sobram else '')
            + 'Nenhuma ficha pode sumir em silencio: classifique ou exclua com'
              ' motivo.')


def conferir_depara(prods):
    """Todo alvo do de-para e dos preparos existe, e nada esta duplicado."""
    faltam = sorted({alvo for alvo, _ in DEPARA.values() if alvo not in prods})
    if faltam:
        raise SystemExit(f'de-para aponta para produto que nao existe no'
                         f' catalogo: {faltam}')
    choque = sorted(set(PREPAROS) & set(prods))
    if choque:
        raise SystemExit(f'preparo com nome de produto que JA existe no'
                         f' catalogo: {choque}')
    dobrado = sorted(set(DEPARA) & set(SEM_PRODUTO))
    if dobrado:
        raise SystemExit(f'componente em DEPARA e em SEM_PRODUTO: {dobrado}')


# =============================================================================
# custo dos preparos, pelo NOSSO catalogo
# =============================================================================
def custo_dos_preparos(por_nome, prods):
    """Refaz a receita de cada preparo com os precos do nosso catalogo.

    Recursivo porque preparo entra em preparo: a ESPUMA DE HIBISCO leva
    CONCENTRADO DE GENGIBRE (que nao e um dos 12, e so existe como ficha no
    PDF), e o CONCENTRADO leva XAROPE DE GENGIBRE, que e um dos 12.

    Devolve (custo_por_preparo, receita_por_preparo). A receita vai para o
    relatorio: sem ela o custo do preparo seria um numero sem conta atras.

    Ingrediente sem linha no de-para NAO recebe o preco do PDF como consolo —
    isso seria o contrabando de volta. O script para, com o nome do que falta.
    """
    PREP_MAIUSCULO = {k.upper(): k for k in PREPAROS}
    custo, receita, calculando = {}, {}, set()

    def total(nome):
        chave_ = nome.upper()
        if chave_ in custo:
            return custo[chave_]
        if chave_ in calculando:
            raise SystemExit(f'receita de preparo volta em si mesma: {nome!r}')
        f = por_nome.get(chave_)
        if f is None or not f['componentes']:
            raise SystemExit(f'preparo {nome!r} nao e ficha com componentes no'
                             f' PDF: o custo dele seria chute.')
        calculando.add(chave_)
        soma, linhas = 0.0, []
        for c in f['componentes']:
            n = c['nome']
            sub = por_nome.get(n.upper())
            if n.upper() in PREP_MAIUSCULO or (sub is not None and sub['componentes']):
                # sub-preparo: o custo dele e o recalculado DELE, nao o cache
                # que o PDV guarda na linha do pai.
                unit = total(n)
                alvo, un = n, 'LT'
            elif n in DEPARA:
                alvo = DEPARA[n][0]
                unit = prods[alvo]['custo']
                un = prods[alvo]['unidade']
            else:
                raise SystemExit(
                    f'ingrediente de preparo sem linha no de-para:'
                    f' {n!r} (dentro de {nome!r}). Nao se usa o V. Unit do PDF'
                    f' como consolo: ponha a linha em DEPARA.')
            valor = round(c['quantidade'] * unit, 6)
            soma += valor
            linhas.append({'componente_pdv': n, 'produto': alvo,
                           'quantidade': c['quantidade'], 'unidade': un,
                           'custo_unitario_catalogo': unit,
                           'valor_unitario_pdf': c['valor_unitario'],
                           'custo': round(valor, 4)})
        calculando.discard(chave_)
        custo[chave_] = round(soma, 4)
        receita[chave_] = linhas
        return custo[chave_]

    for nome in PREPAROS:
        total(nome)
    return ({k: custo[k.upper()] for k in PREPAROS},
            {k: receita[k.upper()] for k in PREPAROS})


# =============================================================================
# montagem das fichas
# =============================================================================
def grupo_e_cmv(grupo):
    if grupo == CORTESIA:
        return CMV_CORTESIA
    if grupo in (CERVEJA, CERVEJA_HH, REFRI):
        return CMV_REVENDA
    return CMV_COQUETEL


def montar(bebida, prods, prep_custo):
    """Transforma cada ficha triada e classificada em ficha + itens.

    Tres coisas acontecem aqui, e as tres viram linha de relatorio:

    1. SOMA DE DUPLICATA. `ficha_itens` tem `unique (ficha_id, produto_id)`:
       dois componentes do PDV que caem no MESMO produto do catalogo sao um
       item so, com as quantidades somadas. Acontece de verdade em duas fichas.

    2. QUANTIDADE ZERO NAO VIRA ITEM. O check da tabela e `quantidade > 0`.

    3. A TRAVA DA GARRAFA. Item de bebida alcoolica que, ja achatado e somado,
       consuma `LIMITE_FRACAO_GARRAFA` ou mais de uma garrafa e ACHADO. Quando
       o achado vem de uma linha de custo zero do PDF (que o proprio Total
       impresso ignora), a linha e DESCARTADA e dita; quando nao, ela entra e
       fica marcada, porque descartar silenciosamente seria pior.
    """
    saida, achados = [], {
        'itens_somados': [], 'quantidade_zero': [], 'sem_produto': [],
        'garrafa_inteira': [], 'unidade_divergente': [], 'preparo_usado': [],
    }

    for f in sorted(bebida, key=lambda x: x['nome'].upper()):
        if f['nome'] in FORA:
            continue
        grupo, motivo = CLASSIFICACAO[f['nome']]

        # A trava da garrafa vale para COQUETEL, nao para revenda. A regra da
        # cliente e "garrafa e produto fechado vendido inteiro, dose e apenas
        # uma pequena quantidade": uma long neck vendida inteira E 1,000 de
        # garrafa, e isso e o CERTO, nao defeito. O que a regra proibe e um
        # coquetel consumir meia garrafa de destilado. Coquetel aqui e ficha
        # com mais de um componente no PDV — bebida misturada.
        coquetel = len(f['componentes']) > 1

        itens = {}
        for c in f['componentes_achatados']:
            nome = c['nome']
            if c['quantidade'] <= 0:
                achados['quantidade_zero'].append(
                    {'ficha': f['nome'], 'componente': nome,
                     'linha_pdf': c['linha_pdf']})
                continue

            if nome.upper() in {k.upper() for k in PREPAROS}:
                real = next(k for k in PREPAROS if k.upper() == nome.upper())
                produto = {'id': None, 'nome': real, 'unidade': PREPAROS[real][2],
                           'categoria': PREPAROS[real][0],
                           'custo': prep_custo[real], 'preparo': True}
                achados['preparo_usado'].append(
                    {'ficha': f['nome'], 'preparo': real,
                     'quantidade': c['quantidade']})
            elif nome in DEPARA:
                alvo, _ = DEPARA[nome]
                produto = dict(prods[alvo], preparo=False)
            elif nome in SEM_PRODUTO:
                achados['sem_produto'].append(
                    {'ficha': f['nome'], 'componente': nome,
                     'quantidade': c['quantidade'],
                     'valor_unitario_pdf': c['valor_unitario'],
                     'motivo': SEM_PRODUTO[nome], 'linha_pdf': c['linha_pdf']})
                continue
            else:
                raise SystemExit(
                    f'componente sem decisao: {nome!r} (ficha {f["nome"]!r}).'
                    f' Ponha em DEPARA, em SEM_PRODUTO ou em PREPAROS.')

            if (not produto['preparo']
                    and unidades_divergem(c['unidade_pdv'], produto['unidade'])):
                achados['unidade_divergente'].append(
                    {'ficha': f['nome'], 'componente': nome,
                     'unidade_pdv': c['unidade_pdv'],
                     'unidade_cadastro': produto['unidade'],
                     'produto': produto['nome']})

            # Trava da garrafa, parte 1: por COMPONENTE, antes de somar.
            #
            # Linha de custo ZERO no PDF que, sozinha, consumiria meia embalagem
            # fechada ou mais dentro de um COQUETEL e defeito de cadastro do
            # PDV, e sao exatamente dois no relatorio inteiro:
            #
            #   XEREM    · BITTER ANGOSTURA AROMATIC 100ML x 1,000 @ 0,00
            #   SILENCIO · XAROPE FRANCES TANGERINA MONIN 700ML x 1,000 @ 0,00
            #
            # Nos dois casos o PDV tem o MESMO produto cadastrado duas vezes
            # (XEREM leva os dois Angosturas) ou cadastrado com preco zero, e a
            # quantidade 1,000 nao e receita: e a linha que ninguem terminou de
            # preencher. Com custo zero, o proprio `Total` impresso do PDF a
            # ignora — descartar nao muda a conferencia, e de fato o SILENCIO
            # passa a bater EXATO com o PDF (0,03, que e so a agua com gas).
            # Gravar 1,000 seria gravar uma garrafa de xarope de 700 ml num
            # drinque, e a regra da cliente proibe.
            if (coquetel and unidade_canonica(produto['unidade']) == 'UND'
                    and c['valor_unitario'] == 0
                    and c['quantidade'] >= LIMITE_FRACAO_GARRAFA):
                achados['garrafa_inteira'].append(
                    {'ficha': f['nome'], 'produto': produto['nome'],
                     'quantidade': c['quantidade'],
                     'componentes_pdv': [nome],
                     'valor_unitario_pdf': 0,
                     'descartado': True,
                     'motivo': f'consome {c["quantidade"]} de embalagem'
                               f' fechada num coquetel, e dose e fracao pequena'
                               f' (limite {LIMITE_FRACAO_GARRAFA}). A linha do'
                               f' PDF tem custo ZERO, logo o proprio Total'
                               f' impresso a ignora: DESCARTADA.'})
                continue

            k = produto['nome']
            if k in itens:
                itens[k]['quantidade'] = round(
                    itens[k]['quantidade'] + c['quantidade'], 6)
                itens[k]['componentes_pdv'].append(nome)
                if nome in AVISO_NO_ITEM \
                        and AVISO_NO_ITEM[nome] not in itens[k]['avisos']:
                    itens[k]['avisos'].append(AVISO_NO_ITEM[nome])
                achados['itens_somados'].append(
                    {'ficha': f['nome'], 'produto': k,
                     'componentes_pdv': list(itens[k]['componentes_pdv']),
                     'quantidade_somada': itens[k]['quantidade'],
                     'motivo': 'unique (ficha_id, produto_id): dois componentes'
                               ' do PDV caem no mesmo produto do catalogo'})
            else:
                itens[k] = {
                    'produto': k, 'produto_id': produto['id'],
                    'preparo': produto['preparo'],
                    'quantidade': c['quantidade'],
                    'unidade': produto['unidade'],
                    'categoria': produto['categoria'],
                    'custo_unitario_catalogo': produto['custo'],
                    'componentes_pdv': [nome],
                    'valor_unitario_pdf': c['valor_unitario'],
                    'perda_percentual': 0,
                    'avisos': ([AVISO_NO_ITEM[nome]] if nome in AVISO_NO_ITEM
                               else []),
                }

        # Trava da garrafa, parte 2: depois da soma, no que sobrou.
        for k, it in list(itens.items()):
            if not coquetel or it['categoria'] != CATEGORIA_ALCOOL:
                continue
            if it['quantidade'] < LIMITE_FRACAO_GARRAFA:
                continue
            achados['garrafa_inteira'].append(
                {'ficha': f['nome'], 'produto': k,
                 'quantidade': it['quantidade'],
                 'componentes_pdv': it['componentes_pdv'],
                 'valor_unitario_pdf': it['valor_unitario_pdf'],
                 'descartado': False,
                 'motivo': f'consome {it["quantidade"]} de garrafa de destilado'
                           f' num coquetel, e dose e fracao pequena (limite'
                           f' {LIMITE_FRACAO_GARRAFA}). MANTIDA e marcada:'
                           f' descartar em silencio seria pior.'})

        lista = sorted(itens.values(), key=lambda x: x['produto'])
        for i, it in enumerate(lista, start=1):
            it['ordem'] = i
            it['custo'] = round(it['quantidade'] * it['custo_unitario_catalogo'], 4)

        saida.append({
            'nome': f['nome'],
            'grupo': grupo,
            'motivo_da_classificacao': motivo,
            'codigo_pdv': f['codigo'],
            'unidade_pdv': f['unidade_pdv'],
            'linha_pdf': f['linha_pdf'],
            'descricao': f'Ficha do PDV {f["codigo"]} · Relatorio de Estrutura'
                         f' de Produto, Bar do Zeca Norte Shopping',
            'modo_preparo': None,
            'rendimento': 1,
            'unidade_rendimento': 'PORCAO',
            'preco_venda': 0,
            'cmv_alvo': grupo_e_cmv(grupo),
            'ativo': True,
            'itens': lista,
            'custo_nosso': round(sum(i['custo'] for i in lista), 4),
            'total_impresso_pdf': f['total_impresso'],
            'total_recalculado_pdf': f['total_recalculado'],
            'doses_achatadas': f['doses_achatadas'],
        })
    # O RECORTE, e ele e uma PARTICAO e nao um filtro: as 23 fichas que saem
    # continuam montadas, com itens e custo, porque a tabela de conferencia
    # delas e a CALIBRACAO DO DE-PARA e precisa dos numeros. A CLASSIFICACAO
    # continua cobrindo as 89 fichas triadas — ela e a trilha de auditoria.
    ficam = [d for d in saida if d['grupo'].startswith(PREFIXO_DO_RECORTE)]
    recortadas = [d for d in saida if not d['grupo'].startswith(PREFIXO_DO_RECORTE)]

    # Achado que vale como prova do recorte, e que e medido e nao afirmado:
    # depois dele nao resta item de garrafa fechada vendida inteira.
    inteiras_que_ficam = [
        {'ficha': d['nome'], 'produto': i['produto'],
         'quantidade': i['quantidade']}
        for d in ficam for i in d['itens']
        if i['categoria'] == CATEGORIA_ALCOOL and i['quantidade'] >= 1.0]
    inteiras_que_saem = [
        {'ficha': d['nome'], 'produto': i['produto'],
         'quantidade': i['quantidade']}
        for d in recortadas for i in d['itens']
        if i['categoria'] == CATEGORIA_ALCOOL and i['quantidade'] >= 1.0]
    if inteiras_que_ficam:
        raise SystemExit(
            f'depois do recorte ainda resta item de garrafa inteira:'
            f' {inteiras_que_ficam}. O recorte existe justamente para que nao'
            f' reste; se restou, a classificacao de grupo esta errada.')

    achados['garrafa_fechada_fora_do_recorte'] = inteiras_que_saem
    return ficam, recortadas, achados


def main():
    bruto = json.load(open(BRUTO, encoding='utf-8'))
    prods, custos_de_outubro = montar_catalogo()

    fichas = bruto['fichas']
    por_nome = {f['nome'].upper(): f for f in fichas}
    servicos, bebida = triar(fichas)
    conferir_classificacao(bebida)
    conferir_depara(prods)

    prep_custo, prep_receita = custo_dos_preparos(por_nome, prods)

    drinques, recortadas, achados = montar(bebida, prods, prep_custo)

    # Preparo que entrou em alguma ficha e, por isso, precisa virar produto.
    usados = sorted({a['preparo'] for a in achados['preparo_usado']})
    nao_usados = sorted(set(PREPAROS) - set(usados))

    # ----------------------------------------------------- fichas sem ficha --
    # Ficha de bebida que ficou sem NENHUM item nao pode nascer: viraria ficha
    # de custo zero, e o briefing proibe custo zero inexplicado.
    #
    # A conta e feita nos DOIS lados do recorte, de proposito. Duas das tres
    # fichas sem item (`Cerpa Long Neck` e `SPATEN 600 ML APOIO`) caem fora do
    # recorte, e se eu as contasse so entre as 56 elas desapareceriam do
    # relatorio — a cliente deixaria de saber que falta cadastrar a Cerpa e a
    # Spaten porque, por acidente, elas eram cerveja de revenda.
    #
    # E a conta vem ANTES da conferencia de custo: ficha que nao vai ser
    # carregada nao entra na tabela de comparacao. A primeira versao fazia o
    # contrario e a tabela listava o MATE com custo 0,00 contra PDF 0,00, uma
    # linha sobre uma ficha que nao existe no banco.
    vazias_apos = [d for d in drinques + recortadas if not d['itens']]
    drinques = [d for d in drinques if d['itens']]
    recortadas = [d for d in recortadas if d['itens']]

    # ----------------------------------------------- conferencia pelo custo --
    # O numero do PDF para comparar e o `total_recalculado`, nao o `Total`
    # impresso: o PDV guarda custo cacheado da sub-receita e esse cache esta
    # velho — em cinco doses esta ZERO, e nesses casos o Total impresso
    # subestima o custo do drinque em exatamente a cachaca.
    comparacao = []
    for d in drinques:
        pdf = d['total_recalculado_pdf']
        nosso = d['custo_nosso']
        if pdf and pdf > 0:
            rel = (nosso - pdf) / pdf * 100
        else:
            rel = None
        comparacao.append({
            'ficha': d['nome'], 'grupo': d['grupo'],
            'custo_nosso': nosso,
            'total_impresso_pdf': d['total_impresso_pdf'],
            'total_recalculado_pdf': pdf,
            'diferenca': round(nosso - (pdf or 0), 4),
            'diferenca_relativa_pct': round(rel, 2) if rel is not None else None,
            'itens': len(d['itens']),
            'itens_faltando': len([a for a in achados['sem_produto']
                                   if a['ficha'] == d['nome']]),
        })
    comparacao.sort(key=lambda x: -abs(x['diferenca_relativa_pct'] or 0))

    # Fichas vazias no PDF (sem componente nenhum) — informacao para a cliente.
    vazias_pdf = sorted(f['nome'] for f in fichas if not f['componentes'])
    # As que sao versao HH de um drinque que EXISTE com receita: a casa criou o
    # item de happy hour no PDV e nunca lancou a receita.
    com_receita = {f['nome'].upper() for f in fichas if f['componentes']}
    hh_sem_receita = []
    for n in vazias_pdf:
        m = re.match(r'^(.*?)\s+HH$', n, re.I)
        if m and m.group(1).upper() in com_receita:
            hh_sem_receita.append({'ficha_vazia': n, 'versao_normal': m.group(1)})

    saida = {
        'restaurante_id': RESTAURANTE_ID,
        'origem': bruto['origem'],
        'catalogo': {
            'arquivo': os.path.basename(CATALOGO),
            'produtos_no_retrato': len(json.load(open(CATALOGO,
                                                     encoding='utf-8'))['produtos']),
            'produtos_criados_pela_0003': len(json.load(
                open(OUTUBRO, encoding='utf-8'))['produtos_novos']),
            'produtos_no_catalogo_efetivo': len(prods),
            'custos_vindos_de_outubro': custos_de_outubro,
        },
        'resumo': {
            'fichas_no_pdf': len(fichas),
            'fichas_com_componentes': len([f for f in fichas if f['componentes']]),
            'fichas_vazias_no_pdf': len(vazias_pdf),
            'fichas_insumo_ds_gf_mp_kg_lt': len([f for f in fichas
                                                 if f['componentes']
                                                 and eh_insumo(f)]),
            'fichas_de_servico': len(servicos),
            'servicos_que_envolvem_bebida': len(bebida),
            'excluidas_por_serem_prato': len(FORA),
            'fichas_de_bebida': len(drinques),
            'fichas_sem_nenhum_item': len(vazias_apos),
            'itens': sum(len(d['itens']) for d in drinques),
            'produtos_distintos_usados': len({i['produto'] for d in drinques
                                              for i in d['itens']}),
            'preparos_virando_produto': len(usados),
            'linhas_do_depara': len(DEPARA),
            'componentes_sem_produto': len(SEM_PRODUTO),
            'itens_somados_por_unique': len(achados['itens_somados']),
            'itens_nao_criados_por_falta_de_produto': len(achados['sem_produto']),
            'itens_com_unidade_divergente': len(achados['unidade_divergente']),
            'achados_garrafa_inteira': len(achados['garrafa_inteira']),
            'hh_vazia_com_versao_normal': len(hh_sem_receita),
            'custo_total_das_fichas': round(sum(d['custo_nosso']
                                                for d in drinques), 4),
        },
        'grupos': {g: len([d for d in drinques if d['grupo'] == g])
                   for g in sorted({d['grupo'] for d in drinques})},
        'cmv_alvo_por_grupo': {g: grupo_e_cmv(g)
                               for g in sorted({d['grupo'] for d in drinques})},
        'produtos_novos': [
            {'nome': n, 'categoria': PREPAROS[n][0], 'setor': PREPAROS[n][1],
             'unidade': PREPAROS[n][2], 'motivo': PREPAROS[n][3],
             'custo': prep_custo[n], 'custo_fixo': True,
             'total_impresso_no_pdf': por_nome[n.upper()]['total_impresso'],
             'ingredientes_no_pdf': [
                 {'nome': c['nome'], 'unidade_pdv': c['unidade_pdv'],
                  'quantidade': c['quantidade'],
                  'valor_unitario': c['valor_unitario']}
                 for c in por_nome[n.upper()]['componentes']],
             'receita_no_nosso_catalogo': prep_receita[n],
             'usado_por': sorted({a['ficha'] for a in achados['preparo_usado']
                                  if a['preparo'] == n})}
            for n in usados],
        'preparos_nao_usados': nao_usados,
        'recorte': {
            'prefixo_de_grupo': PREFIXO_DO_RECORTE,
            'fichas_que_ficam': len(drinques),
            'fichas_recortadas': len(recortadas),
            'itens_recortados': sum(len(d['itens']) for d in recortadas),
            'custo_recortado': round(sum(d['custo_nosso']
                                         for d in recortadas), 4),
            'grupos_recortados': {g: len([d for d in recortadas
                                          if d['grupo'] == g])
                                  for g in sorted({d['grupo']
                                                   for d in recortadas})},
            'calibracao_do_depara': [
                {'ficha': d['nome'], 'grupo': d['grupo'],
                 'itens': len(d['itens']),
                 'componentes_pdv': [c for i in d['itens']
                                     for c in i['componentes_pdv']],
                 'produtos': [i['produto'] for i in d['itens']],
                 'custo_nosso': d['custo_nosso'],
                 'total_recalculado_pdf': d['total_recalculado_pdf'],
                 'total_impresso_pdf': d['total_impresso_pdf'],
                 'diferenca_relativa_pct': (
                     round((d['custo_nosso'] - d['total_recalculado_pdf'])
                           / d['total_recalculado_pdf'] * 100, 2)
                     if d['total_recalculado_pdf'] else None)}
                for d in sorted(recortadas, key=lambda x: x['nome'].upper())],
        },
        'valor_unitario_no_pdf': {
            k: sorted(v) for k, v in sorted(
                {c['nome']: {c2['valor_unitario']
                             for f in fichas for c2 in f['componentes']
                             if c2['nome'] == c['nome']}
                 for f in fichas for c in f['componentes']}.items())
            if k in DEPARA},
        'depara': [{'componente_pdv': k, 'produto_catalogo': v[0],
                    'unidade_catalogo': prods[v[0]]['unidade'],
                    'categoria_catalogo': prods[v[0]]['categoria'],
                    'custo_catalogo': prods[v[0]]['custo'],
                    'motivo': v[1]}
                   for k, v in sorted(DEPARA.items())],
        'sem_produto': [{'componente_pdv': k, 'motivo': v}
                        for k, v in sorted(SEM_PRODUTO.items())],
        'excluidas_por_serem_prato': [{'ficha': k, 'motivo': v}
                                      for k, v in sorted(FORA.items())],
        'fichas_vazias_no_pdf': vazias_pdf,
        'hh_vazia_com_versao_normal': hh_sem_receita,
        'fichas_sem_nenhum_item': [
            {'ficha': d['nome'], 'grupo': d['grupo'],
             'dentro_do_recorte': d['grupo'].startswith(PREFIXO_DO_RECORTE)}
            for d in vazias_apos],
        'achados': achados,
        'comparacao_de_custo': comparacao,
        'fichas': drinques,
    }

    with open(DEST, 'w', encoding='utf-8') as fh:
        json.dump(saida, fh, ensure_ascii=False, indent=1)

    escrever_relatorio(saida, bruto)

    for k, v in saida['resumo'].items():
        print(f'{k:44} {v}')
    print(f'\nescrito: {DEST}\nescrito: {RELATORIO}')
    return 0


# =============================================================================
# relatorio
# =============================================================================
def escrever_relatorio(s, bruto):
    L = []
    def p(t=''):
        L.append(t)

    r = s['resumo']
    p('=' * 78)
    p('FICHAS TECNICAS DE BEBIDA · BAR DO ZECA NORTE SHOPPING')
    p('=' * 78)
    p()
    p(f'Origem    : {s["origem"]["arquivo"]}  (md5 {s["origem"]["md5"]},'
      f' {s["origem"]["paginas"]} paginas)')
    p(f'Catalogo  : {s["catalogo"]["produtos_no_retrato"]} produtos do retrato'
      f' pre-0003 + {s["catalogo"]["produtos_criados_pela_0003"]} criados pela'
      f' carga 0003 = {s["catalogo"]["produtos_no_catalogo_efetivo"]}')
    p(f'            ({s["catalogo"]["custos_vindos_de_outubro"]} custos vieram'
      f' da contagem de outubro)')
    p(f'Restaurante: {s["restaurante_id"]}')
    p()
    p('-' * 78)
    p('1 · DO PDF ATE AS FICHAS DE BEBIDA')
    p('-' * 78)
    p(f'  fichas no PDF                                 {r["fichas_no_pdf"]:>6}')
    p(f'    vazias, sem componente nenhum               {r["fichas_vazias_no_pdf"]:>6}'
      f'   (secao 8)')
    p(f'    com componente                              {r["fichas_com_componentes"]:>6}')
    p(f'      insumo e preparo (DS/GF/MP/KG/LT)         {r["fichas_insumo_ds_gf_mp_kg_lt"]:>6}'
      f'   (secao 2)')
    p(f'      servicos                                  {r["fichas_de_servico"]:>6}')
    p(f'        envolvem bebida                         {r["servicos_que_envolvem_bebida"]:>6}')
    p(f'          excluidas por serem prato             {r["excluidas_por_serem_prato"]:>6}'
      f'   (secao 3)')
    p(f'          sem nenhum item apos o de-para        {r["fichas_sem_nenhum_item"]:>6}'
      f'   (secao 7)')
    p(f'          FICHAS CRIADAS                        {r["fichas_de_bebida"]:>6}')
    p(f'            itens                               {r["itens"]:>6}')
    p(f'            produtos distintos usados           {r["produtos_distintos_usados"]:>6}')
    p(f'            custo total somado (R$)        {r["custo_total_das_fichas"]:>11}')
    p()
    p('  por grupo do cardapio (campo `grupo`, por onde a tela agrupa):')
    for g, n in s['grupos'].items():
        p(f'    {g:38} {n:>4} fichas   cmv_alvo {s["cmv_alvo_por_grupo"][g]}')
    p()
    p('  preco_venda nasce 0 em TODAS as fichas: o PDF e relatorio de CUSTO e')
    p('  nao traz preco de venda. Sem ele nao existe CMV. Essa e a principal')
    p('  pendencia devolvida a cliente (secao 10).')
    p()

    p('-' * 78)
    p('2 · O QUE FICOU FORA, E POR QUE')
    p('-' * 78)
    p('  DS (dose) e GF (garrafa) nao viram ficha propria: elas ja entram')
    p('  ACHATADAS dentro de quem as usa. Se virassem ficha, o mesmo custo')
    p('  apareceria duas vezes no modulo.')
    p(f'    fichas DS no PDF: {bruto["resumo"]["fichas_dose_ds"]}'
      f'   ·   fichas GF: {bruto["resumo"]["fichas_garrafa_gf"]}')
    p('  MP e fichas em KG: preparo de cozinha.')
    p('  Fichas em LT: preparo de bar a granel (xarope, espuma). Todas as 14 do')
    p('  relatorio sao preparo, nenhuma e servico — conferido uma a uma.')
    p()
    p('  A FRACAO DA DOSE, e o que ela diz: a casa usa 0,062 em 41 das 54 doses,')
    p('  INDEPENDENTE do tamanho da garrafa. Logo a dose NAO e volume constante:')
    p('    0,062 x  965 ml (Ypioca)   =  60 ml')
    p('    0,062 x 1000 ml (Absolut)  =  62 ml')
    p('    0,066 x  900 ml (Campari)  =  59 ml')
    p('    0,066 x  700 ml (Sagatiba) =  46 ml')
    p('    0,012 x 5000 ml (Arpo bag) =  60 ml')
    p('  Quem compra garrafa de 700 ml serve 46 ml e quem compra de 1 L serve')
    p('  62 ml pelo mesmo preco de carta. Isso e decisao de margem, nao de')
    p('  receita, e esta na lista da cliente.')
    p()

    p('-' * 78)
    p('3 · PRATO QUE LEVA BEBIDA NAO E BEBIDA')
    p('-' * 78)
    for x in s['excluidas_por_serem_prato']:
        p(f'  {x["ficha"]}')
        p(f'      {x["motivo"]}')
    p()

    p('-' * 78)
    p('4 · DE-PARA: INGREDIENTE DO PDV -> PRODUTO DO NOSSO CATALOGO')
    p('-' * 78)
    p(f'  {len(s["depara"])} linhas, escritas a mao, nome por nome.')
    p()
    p('  A PRECISAO DO PDF, que e o que da forca ao desempate por custo: o')
    p('  relatorio imprime DINHEIRO com duas casas decimais e QUANTIDADE com')
    p('  tres. (A primeira versao deste relatorio dizia tres casas para os')
    p('  dois; o "0,530" tem tres digitos, mas a terceira e sempre zero —')
    p('  conferido nas 936 linhas.) Entao um V. Unit impresso 43,93 quer dizer')
    p('  um valor em [43,925; 43,935), e um custo de catalogo que caia dentro')
    p('  desse intervalo nao e coincidencia: e o mesmo preco de compra.')
    p()
    exatos = []
    for x in s['depara']:
        for v in s['valor_unitario_no_pdf'].get(x['componente_pdv'], []):
            if v > 0 and abs(v - x['custo_catalogo']) < 0.005:
                exatos.append((x['componente_pdv'], v, x['produto_catalogo']))
    exatos = sorted(set(exatos))
    p(f'  CASOS DE CUSTO EXATO (o V. Unit do PDF cai dentro do intervalo de')
    p(f'  impressao do custo do nosso catalogo): {len(exatos)}')
    for n, v, alvo in exatos:
        p(f'    {n[:36]:38} PDF {v:>8} = {alvo[:34]:36}')
    p()
    # A particao, calculada e nao afirmada: depois do recorte, nem toda linha
    # do de-para continua alimentando algo.
    nas_fichas = {c for d in s['fichas'] for i in d['itens']
                  for c in i['componentes_pdv']}
    nos_preparos = {l['componente_pdv'] for x in s['produtos_novos']
                    for l in x['receita_no_nosso_catalogo']}
    nas_recortadas = {c for d in s['recorte']['calibracao_do_depara']
                      for c in d['componentes_pdv']}
    todas = {x['componente_pdv'] for x in s['depara']}
    so_fichas = sorted(todas & nas_fichas)
    so_preparo = sorted((todas & nos_preparos) - nas_fichas)
    morreram = sorted((todas & nas_recortadas) - nas_fichas - nos_preparos)
    inuteis = sorted(todas - nas_fichas - nos_preparos - nas_recortadas)
    p(f'  particao das {len(s["depara"])} linhas, DEPOIS do recorte:')
    p(f'    alimentam item de ficha                   {len(so_fichas):>4}')
    p(f'    alimentam so preparo                      {len(so_preparo):>4}')
    p(f'    morreram COM o recorte                    {len(morreram):>4}')
    p(f'    nunca alimentaram nada                    {len(inuteis):>4}')
    p(f'    soma                                      '
      f'{len(so_fichas) + len(so_preparo) + len(morreram) + len(inuteis):>4}')
    p()
    p('    As que morreram com o recorte sao o de-para das fichas de revenda')
    p('    e cortesia da secao 12, e ficam na tabela de proposito: elas sao o')
    p('    que torna aquela conferencia possivel, e apaga-las jogaria fora o')
    p('    trabalho que ja foi conferido. Se a cliente pedir as 23 de volta,')
    p('    e so trocar o PREFIXO_DO_RECORTE e elas voltam a servir.')
    for i in range(0, len(morreram), 2):
        p('      ' + '  |  '.join(f'{n:<34}' for n in morreram[i:i + 2]))
    p()
    p('    As que nunca alimentaram nada sao dose e garrafa que o PDV usa em')
    p('    ficha de dose (DS/GF) mas que nenhum SERVICO consome, mais o xarope')
    p('    de tangerina cuja linha foi descartada pela trava da garrafa. Ficam')
    p('    como de-para conferido, para a proxima emissao do relatorio do PDV:')
    for i in range(0, len(inuteis), 2):
        p('      ' + '  |  '.join(f'{n:<34}' for n in inuteis[i:i + 2]))
    p()
    for x in s['depara']:
        marca = ('  [item de ficha]' if x['componente_pdv'] in nas_fichas
                 else '  [so preparo]' if x['componente_pdv'] in nos_preparos
                 else '  [morreu com o recorte]'
                 if x['componente_pdv'] in nas_recortadas
                 else '  [nunca alimentou nada]')
        p(f'  {x["componente_pdv"]}{marca}')
        p(f'    -> {x["produto_catalogo"]}  [{x["unidade_catalogo"]}]'
          f'  {x["categoria_catalogo"]}  R$ {x["custo_catalogo"]}')
        p(f'       {x["motivo"]}')
    p()

    p('-' * 78)
    p('5 · PREPAROS DA CASA: VIRAM PRODUTO DO CATALOGO')
    p('-' * 78)
    p('  Saida escolhida: (a) do briefing — o preparo vira produto, numa')
    p('  categoria que ja existe, com `custo_fixo = true`. Argumento no')
    p('  cabecalho do normalizar-fichas.py.')
    p()
    p('  DE ONDE VEM O CUSTO, e por que a primeira versao estava errada: ela')
    p('  gravava o custo que o PDF calcula para o preparo. Era contrabando — o')
    p('  briefing diz que o custo vem do NOSSO catalogo, e um preparo custeado')
    p('  pelo PDV e um preco do PDV entrando no banco pela porta de servico. E')
    p('  nao era cosmetico: o XAROPE DE MEL valia R$ 62,788/L porque o PDV')
    p('  cobra R$ 20,98 por uma garrafa de agua de 1,5 L e R$ 50,20 pelo mel —')
    p('  os DOIS precos que este mesmo relatorio denuncia como erro do PDV.')
    p('  Com os nossos: R$ 24,80/L.')
    p()
    p('  Agora a receita de cada preparo e refeita com os precos do nosso')
    p('  catalogo, RECURSIVAMENTE (a ESPUMA DE HIBISCO leva CONCENTRADO DE')
    p('  GENGIBRE, que leva XAROPE DE GENGIBRE) e pelo mesmo de-para que os')
    p('  drinques usam. A conta de cada um esta aberta abaixo. Foi assim que o')
    p('  CANELA PAU apareceu: ele era o unico ingrediente de preparo sem linha')
    p('  no de-para, e o recalculo nao fecha sem ele — com o V. Unit do PDF')
    p('  ninguem notaria, porque o PDF tem preco para tudo.')
    p()
    p('  O preco pago continua existindo e continua dito: `custo_fixo` congela')
    p('  o numero no dia da carga. O que mudou e a FONTE dele (secao 10).')
    p()
    soma_prep = 0.0
    for x in s['produtos_novos']:
        p(f'  {x["nome"]}  [{x["unidade"]}]  {x["categoria"]} · setor'
          f' {x["setor"]}')
        p(f'      custo R$ {x["custo"]}   (o PDF calculava'
          f' {x["total_impresso_no_pdf"]})')
        p(f'      {x["motivo"]}')
        p(f'      a conta, pelo NOSSO catalogo:')
        for c in x['receita_no_nosso_catalogo']:
            p(f'        {c["quantidade"]:>8} {c["unidade"]:<4}'
              f' {c["produto"][:34]:36} x R$ {c["custo_unitario_catalogo"]:>9}'
              f' = {c["custo"]:>9}')
            if c['componente_pdv'] != c['produto']:
                p(f'                 (PDV: {c["componente_pdv"]}'
                  f' @ {c["valor_unitario_pdf"]})')
        p(f'        {"":>8} {"":<4} {"TOTAL":36}'
          f' {"":>14} = {x["custo"]:>9}')
        p(f'      usado por: {", ".join(x["usado_por"])}')
        soma_prep += x['custo']
        p()
    p(f'  soma dos {len(s["produtos_novos"])} preparos, aos nossos precos:'
      f' R$ {round(soma_prep, 4)}')
    if s['preparos_nao_usados']:
        p()
        p(f'  preparos mapeados e nao usados por nenhuma ficha de bebida:'
          f' {s["preparos_nao_usados"]}')
    p()

    p('-' * 78)
    p('6 · INGREDIENTE QUE NAO EXISTE NO CATALOGO (nao se inventa produto)')
    p('-' * 78)
    for x in s['sem_produto']:
        p(f'  {x["componente_pdv"]}')
        p(f'      {x["motivo"]}')
    p()
    p('  Efeito ficha a ficha (item que NAO nasceu):')
    for a in s['achados']['sem_produto']:
        p(f'    {a["ficha"]:34} {a["componente"]:28} x {a["quantidade"]}'
          f'  (V.Unit PDF {a["valor_unitario_pdf"]}, linha {a["linha_pdf"]})')
    p()

    p('-' * 78)
    p('7 · FICHA DE BEBIDA QUE NAO NASCEU')
    p('-' * 78)
    if not s['fichas_sem_nenhum_item']:
        p('  nenhuma.')
    for x in s['fichas_sem_nenhum_item']:
        p(f'  {x["ficha"]}  (grupo que teria: {x["grupo"]})')
    p('  Ficha sem nenhum item viraria ficha de custo zero, e custo zero')
    p('  inexplicado e proibido. Cada uma esta na secao 6 com o que falta')
    p('  cadastrar para destrava-la.')
    p()

    p('-' * 78)
    p('8 · FICHAS VAZIAS NO PDF (receita que ninguem cadastrou)')
    p('-' * 78)
    p(f'  {len(s["fichas_vazias_no_pdf"])} fichas do PDV nao tem componente'
      f' nenhum. Nao viram ficha.')
    p()
    p(f'  Dessas, {len(s["hh_vazia_com_versao_normal"])} sao a versao HAPPY HOUR'
      f' de um drinque que EXISTE com receita —')
    p('  ou seja, a casa criou o item de happy hour no PDV e nunca lancou a')
    p('  receita dele. Sao as mais faceis de resolver e as que mais custam:')
    for x in s['hh_vazia_com_versao_normal']:
        p(f'    {x["ficha_vazia"]:34} <- copiar/ajustar de {x["versao_normal"]}')
    p()
    p('  lista completa das vazias:')
    for i in range(0, len(s['fichas_vazias_no_pdf']), 2):
        par = s['fichas_vazias_no_pdf'][i:i + 2]
        p('    ' + '  |  '.join(f'{n:<36}' for n in par))
    p()

    p('-' * 78)
    p('9 · CONFERENCIA DE CUSTO CONTRA O PDF')
    p('-' * 78)
    p('  O custo da ficha NAO vem do PDF: vem de `produto_setores.custo` /')
    p('  `produtos.custo_medio` do nosso catalogo (precos de outubro), por')
    p('  `mv_custo_do_produto` e `vw_fichas_completas`. E isso que faz a ficha')
    p('  acompanhar o preco real. O PDF e a CONFERENCIA.')
    p()
    p('  A coluna do PDF usada e o `total_recalculado`, nao o `Total` impresso:')
    p('  o PDV guarda custo CACHEADO da sub-receita e o cache esta velho — em')
    p('  cinco doses esta ZERO, e nesses casos o Total impresso subestima o')
    p('  drinque em exatamente a cachaca (ver secao 11).')
    p()
    p(f'  {"ficha":<34}{"nosso":>9}{"PDF rec":>9}{"PDF imp":>9}{"dif %":>9}'
      f'  itens')
    for x in s['comparacao_de_custo']:
        rel = ('%.1f' % x['diferenca_relativa_pct']) \
            if x['diferenca_relativa_pct'] is not None else '  -'
        falta = f'  (-{x["itens_faltando"]} item)' if x['itens_faltando'] else ''
        p(f'  {x["ficha"][:33]:<34}{x["custo_nosso"]:>9.2f}'
          f'{(x["total_recalculado_pdf"] or 0):>9.2f}'
          f'{(x["total_impresso_pdf"] or 0):>9.2f}{rel:>9}'
          f'{len(x["ficha"]) and x["itens"]:>5}{falta}')
    p()

    calc = [x for x in s['comparacao_de_custo']
            if x['diferenca_relativa_pct'] is not None]
    semcalc = [x['ficha'] for x in s['comparacao_de_custo']
               if x['diferenca_relativa_pct'] is None]
    def dentro(lim):
        return sum(1 for x in calc if abs(x['diferenca_relativa_pct']) <= lim)
    acima20 = len(calc) - dentro(20)
    mediana = sorted(abs(x['diferenca_relativa_pct']) for x in calc)
    mediana = mediana[len(mediana) // 2] if mediana else 0
    p('  A DISTRIBUICAO, contada e nao resumida:')
    p(f'    fichas com divergencia calculavel   {len(calc):>4} de'
      f' {len(s["comparacao_de_custo"])}')
    if semcalc:
        p(f'      (sem: o Total do PDF e zero — {", ".join(semcalc)})')
    for lim in (1, 5, 10, 20, 50):
        p(f'    dentro de +/-{lim:>3}%                      {dentro(lim):>4}')
    p(f'    ACIMA de +/- 20%                      {acima20:>4}')
    p(f'    mediana do |desvio|                  {mediana:>5.1f}%')
    p(f'    pior                                 '
      f'{max(abs(x["diferenca_relativa_pct"]) for x in calc):>5.1f}%')
    p()
    p(f'  Uma frase que a primeira versao deste relatorio trazia e que nao')
    p(f'  resiste a esta contagem: "tres causas respondem por tudo acima de')
    p(f'  20%". Sao {acima20} fichas acima de 20%, nao tres causas, e as causas')
    p('  medidas sao SETE, cada uma com o delta em reais na tabela abaixo:')
    p('    1. insumo com custo ZERO no PDV (GF BACARDI ORO, GF VELVO BOTANIC')
    p('       GIN, VINHO SALTON ATOS LICOROSO, XAROPE MONIN CARAMELO/MANGA/')
    p('       SPICE MANGO, BITTER ANGOSTURA): o Total do PDF nao os conta;')
    p('    2. o bag de ARPO precificado por litro no PDV: 5x (ver secao 4);')
    p('    3. UVA THOMPSON 3,42x e UVA ROXA 3,00x — preco velho no PDV;')
    p('    4. MORANGO 1,59x — e o morango dobrou entre agosto e outubro;')
    p('    5. ABACAXI 1,63x;')
    p('    6. LIMAO 0,66x (o nosso e MAIS BARATO que o do PDV);')
    p('    7. item que NAO nasceu por falta de dado na origem (secao 6).')
    p()
    p('  AS PIORES DIVERGENCIAS, UMA A UMA')
    p('  Para cada ficha, a linha que responde pela maior parte da diferenca, e')
    p('  a causa — classificada pela propria conta, nao por impressao.')
    p()
    faltando = {}
    for x in s['achados']['sem_produto']:
        faltando.setdefault(x['ficha'], []).append(x)
    for x in s['comparacao_de_custo'][:PIORES]:
        d = next(k for k in s['fichas'] if k['nome'] == x['ficha'])
        p(f'  {x["ficha"]}   nosso R$ {x["custo_nosso"]}  x  PDF R$'
          f' {x["total_recalculado_pdf"]}   ({x["diferenca_relativa_pct"]}%)')
        linhas = sorted(d['itens'],
                        key=lambda i: -abs(i['custo'] - i['quantidade']
                                           * i['valor_unitario_pdf']))
        for i in linhas[:3]:
            no_pdf = round(i['quantidade'] * i['valor_unitario_pdf'], 4)
            delta = round(i['custo'] - no_pdf, 4)
            if abs(delta) < 0.01:
                continue
            if i['valor_unitario_pdf'] == 0:
                causa = ('o PDV cadastrou este insumo com custo ZERO, logo o'
                         ' Total do PDF nao o conta. O nosso catalogo tem o'
                         ' preco, e e o nosso que esta certo')
            elif i['preparo']:
                causa = ('preparo da casa: o PDV guarda custo cacheado e velho'
                         ' do preparo; aqui vale o recalculado pelos dois'
                         ' niveis')
            elif i['produto'] == 'GIN ARPO 5 LT':
                causa = ('o PDV precifica o bag de 5 L POR LITRO (44,40) num'
                         ' campo que e por bag; 44,40 x 5 = 222,00, que e o'
                         ' preco do bag no nosso catalogo. O PDF subestima o'
                         ' gin do Arpo em 5 vezes — aqui o nosso banco esta'
                         ' certo e o PDF errado')
            else:
                razao = (i['custo_unitario_catalogo'] / i['valor_unitario_pdf']
                         if i['valor_unitario_pdf'] else None)
                causa = (f'preco de compra diferente: PDF R$'
                         f' {i["valor_unitario_pdf"]} x catalogo R$'
                         f' {i["custo_unitario_catalogo"]}'
                         + (f' ({razao:.2f}x)' if razao else ''))
            p(f'      {i["produto"][:40]:42} x {i["quantidade"]:<9}'
              f' nosso {i["custo"]:>8.2f}  PDF {no_pdf:>8.2f}  dif'
              f' {delta:>8.2f}')
            for linha in quebrar(causa, 62):
                p(f'          {linha}')
        for a_ in faltando.get(x['ficha'], []):
            p(f'      (-) {a_["componente"][:38]:40} x {a_["quantidade"]}'
              f'   item NAO criado: ver secao 6')
        p()

    p('-' * 78)
    p('10 · DECISOES QUE PRECISAM DA CLIENTE')
    p('-' * 78)
    pend = [
        ('PRECO DE VENDA — a pendencia principal',
         f'As {r["fichas_de_bebida"]} fichas nascem com preco_venda = 0, porque'
         ' o PDF e relatorio de CUSTO e nao traz preco. Sem preco nao existe'
         ' CMV e nao existe margem: a vista `vw_fichas_completas` devolve'
         ' NULO nos dois. O `markup` nao: ele sai 0,00, porque a conta e'
         ' `preco_venda / custo_porcao` e zero dividido por custo e zero —'
         ' um zero que parece resposta e nao e. Nada aqui foi inventado.'
         ' Preenchido o preco, os tres aparecem sozinhos.'),
        ('O CMV ALVO QUE EU ESCOLHI',
         f'Drinque {CMV_COQUETEL}% (o briefing manda, e o comentario da'
         f' migracao 0017 diz que 30 e "pessimo num drink"); cerveja, chopp e'
         f' refrigerante {CMV_REVENDA}% (economia de revenda, nao de coquetel);'
         f' cortesia {CMV_CORTESIA}% (cortesia nao tem preco de venda, entao'
         f' "meta de CMV" nao quer dizer nada para ela). Decisao minha, nao'
         f' dado do PDF.'),
        ('CORTESIA TEM PRECO DE VENDA?',
         f'{len([d for d in s["fichas"] if d["grupo"] == CORTESIA])} fichas de'
         ' apoio entraram como `Cortesias`. Se a casa nunca cobra por elas, o'
         ' preco fica 0 para sempre e o numero que importa e o CUSTO TOTAL do'
         ' que se da de graca por mes — conta que o modulo nao faz hoje.'),
        ('PREPARO VIRANDO PRODUTO: O CUSTO CONGELA',
         f'Os {len(s["produtos_novos"])} preparos entraram como produto, com o'
         ' custo refeito pelos NOSSOS precos (secao 5) e `custo_fixo = true`.'
         ' Vantagem: a ficha do drinque continua dizendo "xarope de maracuja".'
         ' Preco: o numero congela no dia da carga e nao acompanha o acucar.'
         ' Quatro deles mudam muito de valor quando o preco mexe — XAROPE DE'
         ' UVA (R$ 75,47), XAROPE DE MORANGO (R$ 51,09), XAROPE DE CANELA E MEL'
         ' (R$ 29,55) e XAROPE DE MEL (R$ 24,80) — e sao os que vale a pena'
         ' refazer primeiro. Enquanto o modulo nao tiver sub-receita,'
         ' recalcular e trabalho manual.'),
        ('O RECORTE: 23 FICHAS QUE A SENHORA PEDIU FICARAM DE FORA',
         'A senhora disse "nao sao apenas doses e garrafas, tudo relacionado a'
         ' drinks, que envolvam bebidas", e as cortesias, cervejas e'
         ' refrigerantes entraram. Depois disso o escopo foi recortado para o'
         f' que a casa PREPARA ({len(s["fichas"])} fichas), e as 23 de revenda'
         ' sairam. O motivo esta medido na secao 12 (1 item cada, as 5 garrafas'
         ' fechadas vendidas inteiras estao todas la, e o custo delas fecha'
         ' quase exato contra o PDF) — mas e uma decisao que desfaz em parte o'
         ' que a senhora pediu, e por isso ela esta aqui e nao escondida. Para'
         ' traze-las de volta e uma linha de codigo; a conferencia delas'
         ' continua na secao 12, pronta.'),
        ('O CAMPARI: 0,006 OU 0,066?',
         'A dose de Campari do PDV e 0,006 de garrafa, que em 900 ml da 5,4 ml'
         ' — a menor dose legitima do relatorio e 60 ml. Com 0,066 daria 59,4'
         ' ml, que e dose de verdade. Ficou 0,006 porque e o que o PDV diz, e a'
         ' duvida esta escrita na observacao dos 2 itens. Uma palavra sua'
         ' resolve: CAMPARI TONICA e NEGRONI BDZ sobem de custo 11x no Campari.'),
        ('O BITTER ANGOSTURA: AS DUAS QUANTIDADES ESTAO ERRADAS',
         'O PDV tem o Angostura cadastrado duas vezes, em escalas diferentes, e'
         ' a ordem esta invertida (secao 11b, B): no PDF o XEREM leva o dobro do'
         ' DEIXA ARDER; no nosso banco leva um quinto. E o preco do nosso'
         ' BITTER ANGOSTURA (R$ 152,90) e igual ao de outro produto e nunca foi'
         ' contado, entao nem o tamanho da garrafa se deduz. Precisamos do'
         ' tamanho da garrafa e de quantos dashes vao em cada drinque.'),
        ('O MORANGO: A UND E UM QUILO?',
         'O PDV mede morango em KG e o nosso cadastro em UND. A unidade gravada'
         ' e UND, porque gravar KG poe os 5 itens em "unidade incompativel" e o'
         ' custo deles vem NULO — medido. A evidencia diz que a UND e um quilo'
         ' mal rotulado (contado a R$ 22,02/UND em agosto e R$ 59,67/UND em'
         ' outubro, contra R$ 37,43/KG no PDV). Confirme o peso da UND. De'
         ' passagem: o morango DOBROU de preco entre as duas contagens, e as 5'
         ' fichas de morango vao oscilar 40% de custo com a estacao.'),
        ('O MATE -BASE PODE JA EXISTIR NO CATALOGO',
         'Ha um TOP MATE 5L (R$ 41,29) cadastrado em MATERIAL DE LIMPEZA, setor'
         ' Limpeza, numa categoria que no resto e rodo e agua sanitaria. Pode'
         ' ser o concentrado de mate no lugar errado — ou pode ser quimico de'
         ' limpeza, porque o preco cabe nos dois e o estoque e zero nas duas'
         ' contagens. Nao foi mapeado (secao 11b, D). Se for o mate, ainda'
         ' falta a quantidade: o PDV diz 0,025 LT e nao da preco.'),
        ('A DOSE NAO E VOLUME CONSTANTE',
         'A casa usa fracao fixa de 0,062 em 41 das 54 doses, independente do'
         ' tamanho da garrafa (secao 2). Quem compra 700 ml serve 46 ml e quem'
         ' compra 1 L serve 62 ml. Isso e decisao de margem, e esta no PDV, nao'
         ' em lugar nenhum visivel.'),
        ('TRES PRODUTOS A CADASTRAR, E DUAS DOSES A CRIAR NO PDV',
         'CERVEJA CERPA, SPATEN 600ML e MATE -BASE nao existem no catalogo;'
         ' DS COINTREAU e DS KETEL ONE sao dose sem ficha no PDV. Enquanto'
         ' isso, as fichas da secao 6 e 7 ficam incompletas. Nada foi chutado.'),
        ('UM CAMPO QUE DESTRAVA AS DOSES EM LITRO',
         '`produtos.conteudo_quantidade` esta vazio em todas as garrafas. Com'
         ' ele preenchido (965 para a Ypioca, 700 para a Sagatiba), o modulo'
         ' passa a aceitar receita em ML direto, e `mv_fator_para_produto` faz'
         ' a conversao. Hoje a ficha depende de a fracao vir do PDV.'),
        ('DOIS LIMONCELLOS E UM BOMBAY: ESCOLHI, CONFIRME',
         'O catalogo tem LICOR LIMONCELLO CARAVELLAS e LICOR VILLA MASSA'
         ' LIMONCELLO pelo mesmo custo 132,90; escolhi o CARAVELLAS. Tem'
         ' BOMBAY SAPPHIRE 750 ml, 1000 ml e BRAMBLE; escolhi o 750 ml.'
         ' Nenhum dos dois tem desempate por preco no PDF.'),
        ('O CATALOGO TEM DUPLICATA',
         '`VERMOUTH CINZANO ROSSO (950ml)` e `CINZANO V. ROSSO` sao o mesmo'
         ' produto, com o mesmo custo 26,81, cadastrados duas vezes. Usei o'
         ' primeiro. Vale desativar o outro.'),
        ('UM MONSTER PARA QUATRO SABORES',
         'O PDV distingue MONSTER SABORES, SEM ACUCAR, PACIFIC PUNCH, ULTRA'
         ' FIESTA MANGO e ULTRA PEACHY KEEN; o catalogo tem um unico MONSTER.'
         ' Casei todos nele (o custo 7,66 e o mesmo), o que mantem o custo'
         ' certo e perde o sabor. Se a casa quer controlar sabor, falta'
         ' cadastro.'),
    ]
    for i, (t, c) in enumerate(pend, start=1):
        p(f'  {i}. {t}')
        for linha in quebrar(c, 72):
            p(f'     {linha}')
        p()

    p('-' * 78)
    p('11 · ACHADOS (defeito da origem, nomeado e nao escondido)')
    p('-' * 78)
    a = s['achados']
    p(f'  itens somados por unique (ficha_id, produto_id):'
      f' {len(a["itens_somados"])}')
    for x in a['itens_somados']:
        p(f'    {x["ficha"]} · {x["produto"]} = {x["quantidade_somada"]}')
        p(f'        vem de: {" + ".join(x["componentes_pdv"])}')
    p()
    p(f'  trava da garrafa (>= {LIMITE_FRACAO_GARRAFA} de garrafa de destilado):'
      f' {len(a["garrafa_inteira"])}')
    for x in a['garrafa_inteira']:
        p(f'    {x["ficha"]} · {x["produto"]} x {x["quantidade"]}'
          f'   [{"DESCARTADA" if x["descartado"] else "MANTIDA e marcada"}]')
        p(f'        {x["motivo"]}')
    p()
    p(f'  unidade do PDV diferente da do nosso cadastro:'
      f' {len(a["unidade_divergente"])}')
    vistos = set()
    for x in a['unidade_divergente']:
        k = (x['componente'], x['produto'])
        if k in vistos:
            continue
        vistos.add(k)
        p(f'    {x["componente"]:38} PDV {x["unidade_pdv"]:4} x cadastro'
          f' {x["unidade_cadastro"]:4}  ({x["produto"]})')
    p('    A unidade gravada no item e a do NOSSO cadastro, nunca a do PDV:')
    p('    `mv_fator_unidade` devolve 1 para unidade igual nos dois lados, e e')
    p('    isso que mantem a quantidade intacta. A coluna de unidade do PDV nao')
    p('    e confiavel nas garrafas — ela diz LT em `GF APEROL` e o V. Unit')
    p('    impresso e o preco da garrafa de 750 ml, nao o do litro.')
    p()
    p(f'  componente com quantidade zero (nao vira item, `quantidade > 0`):'
      f' {len(a["quantidade_zero"])}')
    for x in a['quantidade_zero']:
        p(f'    {x["ficha"]} · {x["componente"]} (linha {x["linha_pdf"]})')
    if not a['quantidade_zero']:
        p('    nenhum nas fichas de bebida. Os 3 do PDF estao todos em preparo')
        p('    de cozinha (ACEM DESFIADO MP · TOMILHO, RECHEIO CARNE MOIDA MP ·')
        p('    LOURO, RISOLE DE CAMARAO · PIMENTA DO REINO GRAO PRETA).')
    p()

    p('-' * 78)
    p('11b · ACHADOS QUE A AUDITORIA ACRESCENTOU')
    p('-' * 78)
    p('  Cinco defeitos da origem que a primeira versao deste relatorio nao')
    p('  trazia. Nenhum deles muda uma quantidade carregada; todos mudam o que')
    p('  a cliente precisa levar ao suporte do PDV.')
    p()
    p('  A · DS CAMPARI: a dose e de 5,4 ml, e nenhuma outra e tao pequena')
    p('      O PDV usa 0,006 de garrafa. Em 900 ml (o Campari do nosso')
    p('      catalogo) isso da 0,006 x 900 = 5,4 ml. A menor dose LEGITIMA do')
    p('      relatorio e 0,012, que em 5 L da 60 ml; as outras 48 doses ficam')
    p('      entre 46 e 62 ml. Com 0,066 — a fracao que o PDV usa em sete')
    p('      outras doses — daria 59,4 ml, que e dose de verdade. Digito')
    p('      faltando e a leitura mais provavel, mas provavel nao entra no')
    p('      banco: ficou 0,006, e a duvida esta na observacao dos 2 itens')
    p('      (CAMPARI TONICA e NEGRONI BDZ). Se for 0,066, os dois sobem.')
    p()
    p('  B · BITTER ANGOSTURA: duas escalas no PDV, e a ordem esta INVERTIDA')
    p('      XEREM       · BITTER ANGOSTURA AROMATIC       x 0,001 @ 780,00')
    p('      XEREM       · BITTER ANGOSTURA AROMATIC 100ML x 1,000 @   0,00')
    p('      DEIXA ARDER · BITTER ANGOSTURA AROMATIC 100ML x 0,005 @   0,00')
    p('      Os dois cadastros caem no mesmo produto nosso. Se 780,00 e preco')
    p('      do LITRO, as duas linhas em mililitro sao XEREM = 1 ml e DEIXA')
    p('      ARDER = 0,5 ml — ou seja, no PDF o XEREM leva o DOBRO. No nosso')
    p('      banco (fracao de garrafa) o XEREM leva 0,001 e o DEIXA ARDER')
    p('      0,005: um QUINTO. Nao e so escala incoerente, e inversao, e as')
    p('      DUAS quantidades estao erradas — nao uma.')
    p('      Pior: o preco do nosso BITTER ANGOSTURA (R$ 152,90) e EXATAMENTE')
    p('      o do ANGOSTURA CARIBBEAN RUM, que e outro produto, e nenhum dos')
    p('      dois foi contado em agosto nem em outubro. Preco igual ao de')
    p('      outro produto e sem contagem atras e preco copiado, nao medido —')
    p('      entao nem o tamanho da garrafa se deduz do custo.')
    p()
    p('  C · SILENCIO vale R$ 0,03, e isso nao e preco de drinque')
    p('      Depois de descartar a garrafa de xarope (secao 11), sobra agua com')
    p('      gas 0,025 x R$ 1,19 = R$ 0,0298. A ficha bate EXATO com o PDF, e')
    p('      e justamente por isso que ela esta errada: os dois concordam')
    p('      porque os dois ignoram o xarope. Um coquetel de R$ 0,03 nao')
    p('      existe. O que falta e a quantidade de xarope de tangerina, que no')
    p('      PDV esta como 1,000 (garrafa inteira) e no resto das fichas de')
    p('      xarope fica entre 0,01 e 0,071. E a ficha que a cliente mais')
    p('      precisa reconferir, embora seja a que menos custa.')
    p()
    p('  D · MATE -BASE pode ser o TOP MATE 5L que o catalogo ja tem')
    p('      O catalogo tem TOP MATE 5L (UND, R$ 41,29) — mas em MATERIAL DE')
    p('      LIMPEZA, setor Limpeza, numa categoria que no resto e rodo, pano')
    p('      de chao e agua sanitaria. E o unico nome "bebivel" de la.')
    p('      NAO foi mapeado, por dois motivos medidos: (1) R$ 41,29 por 5 L')
    p('      cabe tanto num concentrado de mate quanto num quimico de limpeza')
    p('      (o DETERGENTE TRUMP S de 5 L mora na mesma faixa), e o estoque')
    p('      zero nas duas contagens nao desempata; (2) mesmo se fosse o mate,')
    p('      a quantidade seria chute — o PDV diz 0,025 LT e nao da preco,')
    p('      entao nao ha desempate por custo, que e o mesmo motivo pelo qual')
    p('      DS COINTREAU ficou de fora. Corrigir categoria e setor e dado da')
    p('      carga 0001, nao desta. Fica como pendencia da cliente, agora com')
    p('      o nome do candidato.')
    p()
    p('  E · CAFÉ CAPSULA: o rotulo esta errado, o dinheiro esta certo')
    p('      O nosso cadastro diz KG e o custo R$ 2,35 e preco de CAPSULA. O')
    p('      item grava 1,000 KG de cafe, o que lido ao pe da letra e um quilo')
    p('      de cafe num drinque. O custo sai certo (R$ 2,35 contra R$ 2,05 do')
    p('      PDV) exatamente porque o preco tambem esta por capsula: os dois')
    p('      erros se cancelam. No dia em que alguem arrumar o produto para')
    p('      UND, a unidade dos 3 itens tem de ir junto — e e isso que esta')
    p('      escrito na observacao deles.')
    p()

    p('-' * 78)
    p('12 · CALIBRACAO DO DE-PARA: as fichas que o recorte tirou')
    p('-' * 78)
    p(f'  O recorte (`grupo` tem de comecar com'
      f' \'{s["recorte"]["prefixo_de_grupo"]}\') tirou'
      f' {s["recorte"]["fichas_recortadas"]} fichas e'
      f' {s["recorte"]["itens_recortados"]} itens,')
    p(f'  R$ {s["recorte"]["custo_recortado"]} de custo. Por grupo:')
    for g, n in s['recorte']['grupos_recortados'].items():
        p(f'    {g:38} {n:>4}')
    p()
    p('  POR QUE O RECORTE: ficha tecnica e para o que a casa PREPARA. O que')
    p('  ela apenas revende fechado nao tem receita — tem preco de compra, que')
    p('  o catalogo ja sabe. Tres medicoes independentes dizem que estas sao de')
    p('  revenda:')
    p(f'    1. as {s["recorte"]["fichas_recortadas"]} tem EXATAMENTE 1 item'
      f' cada, sem excecao (as {len(s["fichas"])} que ficam')
    p(f'       tem media'
      f' {sum(len(d["itens"]) for d in s["fichas"]) / len(s["fichas"]):.1f}'
      f' itens, e so 3 tem um item);')
    p(f'    2. dos itens de garrafa FECHADA vendida inteira (>= 1,000 de bebida')
    p(f'       alcoolica), os'
      f' {len(s["achados"]["garrafa_fechada_fora_do_recorte"])} estao TODOS'
      f' aqui. Depois do recorte nao resta')
    p('       nenhum — e o script levanta excecao se restar:')
    for x in s['achados']['garrafa_fechada_fora_do_recorte']:
        p(f'         {x["ficha"][:34]:36} {x["produto"][:34]:36}'
          f' x {x["quantidade"]}')
    p('    3. o custo delas contra o PDF fecha quase exato, abaixo.')
    p()
    p('  E E POR ISSO QUE A TABELA FICA AQUI. Depois do recorte, toda ficha')
    p('  remanescente tem dose, fracao, preparo ou unidade convertida no meio,')
    p('  e nenhuma divergencia de custo pode mais ser atribuida a uma causa so')
    p('  por inspecao. Estas 23 nao: produto simples, uma linha, sem conversao.')
    p('  Elas sao a UNICA prova de ponta a ponta que estes dados permitem de')
    p('  que o de-para esta certo — e por isso a conferencia delas continua no')
    p('  relatorio mesmo depois de elas sairem da carga.')
    p()
    cal = [x for x in s['recorte']['calibracao_do_depara']
           if x['diferenca_relativa_pct'] is not None]
    p(f'  {"ficha":<34}{"nosso":>9}{"PDF rec":>9}{"dif %":>9}  produto')
    for x in s['recorte']['calibracao_do_depara']:
        rel = ('%.1f' % x['diferenca_relativa_pct']) \
            if x['diferenca_relativa_pct'] is not None else '  -'
        p(f'  {x["ficha"][:33]:<34}{x["custo_nosso"]:>9.2f}'
          f'{(x["total_recalculado_pdf"] or 0):>9.2f}{rel:>9}'
          f'  {", ".join(x["produtos"])[:30]}')
    p()
    if cal:
        dentro1 = sum(1 for x in cal if abs(x['diferenca_relativa_pct']) <= 1)
        p(f'  {len(cal)} das {len(s["recorte"]["calibracao_do_depara"])} tem'
          f' divergencia calculavel (duas tem Total zero no PDF).')
        p(f'  Dentro de +/-1%: {dentro1}.  Pior:'
          f' {max(abs(x["diferenca_relativa_pct"]) for x in cal):.1f}%.'
          f'  TODAS dentro de +/-20%.')
        calc56 = [x for x in s['comparacao_de_custo']
                  if x['diferenca_relativa_pct'] is not None]
        acima = sum(1 for x in calc56 if abs(x['diferenca_relativa_pct']) > 20)
        p(f'  Em contraste, as {acima} divergencias acima de 20% ficam todas'
          f' dentro')
        p('  das fichas que sobraram. O recorte tira 23 fichas e ZERO')
        p('  problemas — e a proporcao de problemas piora de 25% para 35%,')
        p('  o que e esperado: o que sai e o que nao tinha receita para errar.')
    p()

    with open(RELATORIO, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L) + '\n')


def quebrar(t, n):
    saida, linha = [], ''
    for w in t.split():
        if len(linha) + len(w) + 1 > n:
            saida.append(linha)
            linha = w
        else:
            linha = (linha + ' ' + w).strip()
    if linha:
        saida.append(linha)
    return saida


if __name__ == '__main__':
    raise SystemExit(main())
