#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Normaliza as fichas dos PRATOS EXECUTIVOS para o nosso schema.

    dados/executivos-bruto.json  ->  dados/executivos-fichas.json
                                 ->  dados/RELATORIO-EXECUTIVOS.txt

AS SEIS DECISOES QUE ESTE ARQUIVO TOMA, e o argumento de cada uma
=================================================================

1 · O NOME DA FICHA SAI DA `Resumo`, NAO DO BLOCO
-------------------------------------------------
O nome do bloco colide (`FILE DE FRANGO COM FRITAS` existe em duas abas, com 10
e com 7 ingredientes e custos diferentes) e mente (a aba `FILE DE PEIXE COM
PURE` tem um bloco chamado `FILE DE PEIXE COM LEGUMES`, e a aba
`SCHNITZEL COM MAIONESE` um bloco chamado `SCHNITIZEL`). O nome da aba tambem
nao serve: o Excel corta nome de aba em 31 caracteres e
`CARNE GUISADA  COM BATATA CORADA` chegou com a ultima letra comida.

A `Resumo` e a lista do que a casa VENDE, nao tem limite de 31 caracteres, e o
`Custo bruto` dela e exatamente o `Custo total` da coluna 10 do primeiro bloco
da aba, nas 13 linhas. O extrator liga as duas por tres caminhos (posicao, nome
e custo) e conta quantas fecham pelos tres.

2 · `rendimento` = 1, E O 0,655 DO SCHNITZEL NAO E UM RENDIMENTO
-----------------------------------------------------------------
`custo_porcao = custo_total / rendimento` no nosso schema, entao gravar 0,655
faria o SCHNITZEL custar 1/0,655 = 1,527 vez o custo dos seus itens, +52,7%.

A planilha NAO faz isso. Conferido nos 24 blocos e nas duas colunas de valor
(48 de 48): `Custo porcao` = `Custo total` / `PESO PORCAO`, e 0 de 48 por
`Rendimento`. Nos 13 pratos o `Peso Porcao` e 1, entao `Custo porcao` =
`Custo total` — e e esse numero, nao o dividido por 0,655, que a `Resumo` publica
como `Custo bruto` e multiplica pelos cinco indices.

E o 0,655 e o PESO do prato: ele e exatamente a soma dos Pesos Liquidos nos 13
pratos (13 de 13). O rotulo "(porcoes)" esta errado na planilha; a receita rende
UM prato de 0,655 kg. Entao `rendimento` = 1 e o peso vai para a `descricao`,
onde e informacao e nao divisor.

3 · A CONFERENCIA E CONTRA A COLUNA 10, E NAO PORQUE A `Resumo` A USA
---------------------------------------------------------------------
col9  = Peso Liquido x Custo compra  (165 de 165)
col10 = PesoBruto    x Custo compra  (157 de 165)

A nossa `vw_ficha_itens` calcula `quantidade_bruta * fator * custo_unitario`, com
`quantidade_bruta = quantidade / (1 - perda/100)` — que e PesoBruto. Ou seja: a
nossa vista reproduz a FORMULA da col10. A col9 ignora a perda de limpeza e
subestima o que sai do estoque.

As 8 linhas em que a col10 nao fecha sao as 8 linhas de sub-receita, e nas 8 o
PesoBruto e igual ao Peso Liquido (fator 1) — logo col9 e col10 deveriam ser
iguais e nao sao. A col10 delas e digitada a mao, e numa (`recheio empadao`) ela
e o custo do LOTE INTEIRO e nao da porcao. Por isso a conferencia usa a col10
RECALCULADA (PesoBruto x Custo compra) e nao a impressa — a mesma licao do cache
velho do PDV nos drinques.

4 · `perda_percentual` DE VERDADE, E A PROVA DA VOLTA
------------------------------------------------------
`Perda manipulacao` nao entra em formula nenhuma da planilha e contradiz as
outras duas colunas em 31 das 165 linhas (ha linha com perda 0,1 e bruto igual ao
liquido, e ha 5 com bruto menor que o liquido). O `Fator de Correcao` e
`PesoBruto / Peso Liquido` em 163 de 163 linhas preenchidas, sem uma divergencia.

Entao a verdade sao PesoBruto e Peso Liquido, e o fator e a conferencia:

    quantidade       = Peso Liquido
    perda_percentual = (1 - Peso Liquido / PesoBruto) x 100 = (1 - 1/fator) x 100

E a volta tem de devolver a coluna `PesoBruto` na precisao do schema
(quantidade com 4 casas, perda com 3): 160 das 165 fecham exato. As 5 que nao
fecham sao as 5 com liquido maior que bruto, que pediriam perda NEGATIVA — o
`check (perda_percentual >= 0)` as recusa, e elas sao tratadas no item 6.

5 · O CUSTO DOS PREPAROS SAI DO NOSSO CATALOGO, RECURSIVAMENTE
---------------------------------------------------------------
As 9 sub-receitas viram produto com `custo_fixo = true`, e o custo de cada uma e

    custo por kg = soma(quantidade_bruta_i x custo_do_nosso_catalogo_i) / Peso Porcao

calculado RECURSIVAMENTE, porque a arvore tem tres niveis: o prato EMPADAO DE
FRANGO COM SALADA leva EMPADAO DE FRANGO, que leva MASSA EMPADAO e RECHEIO
EMPADAO. Nunca pelo `Custo compra` da planilha — foi exatamente esse atalho que
fez o xarope de mel dos drinques valer R$ 62,79/L porque o PDV cobrava R$ 20,98
por uma garrafa de agua.

A unica excecao, declarada e contada: os 6 ingredientes que nao existem no
catalogo e para os quais a planilha NAO da receita (`sal com pimenta`, `banha`,
`leitosa de empanamento`, `acem mp`, `pernil mp`, `arroz branco de brocolis mp`).
Para esses nao ha o que recalcular, e o custo e o `Custo compra` da planilha —
marcado `custo_da_planilha: true` no JSON e listado em secao propria do relatorio.

6 · O PRECO: `preco_venda` = 0 E OS CINCO INDICES NA `descricao`
-----------------------------------------------------------------
Decisao da cliente. A `descricao` traz as duas linhas de preco — os cinco do
custo da planilha e os cinco do nosso custo — e a diferenca entre elas, que e a
informacao que ela quer: se o custo com que a casa precifica bate com o estoque.
`cmv_alvo` = 20, que e o que as 24 abas usam (`Indice de custo` 5, `CMV` 0,2).
"""

from __future__ import annotations

import json
import sys
import unicodedata
from collections import Counter, OrderedDict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BRUTO = RAIZ / 'dados' / 'executivos-bruto.json'
# O retrato versionado do catalogo e de ANTES da carga 0003 (868 produtos). O
# catalogo que vale aqui e RECONSTRUIDO dos arquivos do repositorio — 868 + 11
# da 0003 + 12 da 0004, com os custos que a 0003 deixou — e o numero 891 e
# COBRADO. Guardar um segundo retrato envelheceria igual; reconstruir prova que
# o de-para fala do mesmo catalogo que as cargas deixaram no banco. E o desenho
# do `montar_catalogo()` do normalizar-fichas.py, estendido com a 0004.
CATALOGO = RAIZ / 'dados' / 'catalogo-atual.json'
OUTUBRO = RAIZ / 'dados' / 'contagem-bar-do-zeca-2026-10.json'
DRINQUES = RAIZ / 'dados' / 'fichas-drinques.json'
SAIDA = RAIZ / 'dados' / 'executivos-fichas.json'
RELATORIO = RAIZ / 'dados' / 'RELATORIO-EXECUTIVOS.txt'

# Quantos produtos o banco tem depois da 0004. Conferido e nao anotado: se um
# retrato ou uma carga mudar, o de-para abaixo pode estar falando de um catalogo
# que nao existe mais, e e melhor parar do que mapear no escuro.
PRODUTOS_ESPERADOS = 891

RESTAURANTE = 'b0a12eca-0000-4000-8000-000000000001'
GRUPO = 'Executivos'
CMV_ALVO = 20          # o que as proprias abas usam: indice 5, CMV 0,2
INDICES = [3, 3.5, 4, 4.5, 5]   # os cinco da `Resumo`
SETOR_DOS_NOVOS = 'Cozinha'

# ===========================================================================
# O DE-PARA, escrito a mao, nome por nome.
#
# A chave e a grafia da planilha em minuscula e sem espaco nas pontas — e so
# isso, porque e assim que `Banha`/`banha` e `maionese `/`maionese` sao a mesma
# linha e `farinha panko`/`farinha pankp` sao DUAS, deliberadamente: o segundo e
# um erro de digitacao e eu quero que ele apareca escrito no de-para em vez de
# desaparecer numa normalizacao esperta.
#
# O desempate, em ordem de forca — a mesma ordem dos drinques:
#   1. o `Custo compra` da planilha bate com o custo do nosso catalogo;
#   2. o nome diz o produto e o preco esta na mesma ordem de grandeza;
#   3. exclusao (o catalogo tem dois candidatos e a planilha lista o outro
#      em linha propria);
#   4. escolha forcada: ou o catalogo tem um candidato so, ou os candidatos mais
#      proximos no preco foram recusados por um argumento que nao e preco — e
#      nesse caso o argumento fica escrito no motivo, para a cliente poder
#      discordar dele (e o caso do `copalombo`).
#
# `razao` e o custo do nosso catalogo dividido pelo `Custo compra` da planilha, e
# ele esta escrito aqui para que a conferencia nao dependa de eu ter somado bem.
# ===========================================================================
EXATO = 'custo exato'           # o Custo compra da planilha == o nosso custo
QUASE = 'custo quase exato'     # dentro de 3%, que e a faixa do resto do de-para
NOME = 'nome'                   # o nome diz o produto
EXCLUSAO = 'exclusao'           # o outro candidato tem linha propria na planilha
FORCADA = 'escolha forcada'     # candidato unico, ou os mais proximos recusados

DE_PARA = OrderedDict([
    # ---- casam exato pelo nome, e a conferencia e so o preco ----------------
    ('alface americana', ('ALFACE AMERICANA', NOME,
        'nome identico; o catalogo tem quatro alfaces e so esta e americana')),
    ('batata asterix', ('BATATA ASTERIX', NOME,
        'nome identico')),
    ('brócolis americano', ('BRÓCOLIS AMERICANO', NOME,
        'nome identico; o outro candidato (BROCOLIS, R$ 28,55) nao e americano. '
        'O nosso cadastro mede em UND e a receita em KG — ver AVISO_NO_ITEM')),
    ('caldo de carne', ('CALDO DE CARNE', NOME,
        'nome identico, na MERCEARIA (o caldo de po). O homonimo de MOLHOS '
        '(R$ 17,31) e caldo feito na casa; a planilha nao diz qual, e o nome '
        'exato decide')),
    ('cenoura', ('CENOURA', NOME, 'nome identico')),
    ('ervilha congelada', ('ERVILHA CONGELADA', EXATO,
        'nome identico E custo identico: R$ 12,88 nos dois lados')),
    ('extrato de tomate', ('EXTRATO DE TOMATE', NOME, 'nome identico')),
    ('feijão pronto', ('FEIJÃO PRONTO', NOME, 'nome identico')),
    ('filé de tilápia', ('FILÉ DE TILÁPIA', EXATO,
        'nome identico E custo identico: R$ 42,90 nos dois lados')),
    ('manjericão', ('MANJERICÃO', NOME,
        'nome identico. O nosso cadastro mede em UND e a receita em KG — '
        'ver AVISO_NO_ITEM. E o mesmo defeito que os drinques acharam no MORANGO')),

    # ---- o custo da planilha bate EXATO com o nosso: o desempate mais forte --
    ('farinha panko', ('FARINHA PANKO (1kg)', EXATO,
        'R$ 16,20 = R$ 16,20, exato')),
    ('farinha pankp', ('FARINHA PANKO (1kg)', EXATO,
        'o mesmo produto com erro de digitacao no nome; R$ 16,20 = R$ 16,20')),
    ('farinha de mandioca', ('FARINHA DE MANDIOCA (1kg)', EXATO,
        'R$ 5,37 = R$ 5,37, exato')),
    ('parmesão', ('PARMESÃO QUEIJO RALADO', EXATO,
        'R$ 48,50 = R$ 48,50, exato. Os outros dois parmesoes do catalogo '
        '(PARMESÃO COZINHA e QUEIJO PARMESÃO) valem R$ 58,96 — a planilha usa o ralado')),
    ('couve refogada mp', ('COUVE PICADA', EXATO,
        'R$ 33,52 = R$ 33,52, exato. A planilha chama de "refogada" o que o nosso '
        'catalogo chama de "picada" e precifica igual — e o mesmo item')),
    ('carne assada 120gr', ('CARNE ASSADA SANDUICHE (120g)', EXATO,
        'R$ 7,97 = R$ 7,97, exato, e o nosso cadastro mede em UND. E isso que '
        'resolve o "1 KG de carne assada" da planilha: o 1 e UMA PORCAO de 120 g, '
        'nao um quilo — ver CONTAGEM e AVISO_NO_ITEM')),
    ('molho ao sugo', ('MOLHO DE TOMATE E MANJERICÃO', QUASE,
        'R$ 11,22 contra R$ 10,83 = 1,036. Sugo e molho de tomate com manjericao; '
        'o outro molho de tomate do catalogo e o APIMENTADO (R$ 24,75), 2,29x')),
    ('bombom de alcatra', ('BOMBOM DA ALCATRA', QUASE,
        'R$ 69,66 contra R$ 69,75 = 0,999. "DE" contra "DA" no nome')),
    ('filé de frango', ('PEITO DE FRANGO', QUASE,
        'R$ 14,41 contra R$ 14,44 = 0,998. File de frango e peito desossado; o '
        'FILE DE FRANGO 100 GR do catalogo e porcao pronta em UND (R$ 2,98) e a '
        'receita pesa em KG')),
    ('carne seca desfiada', ('CARNE SECA LAGARTO', QUASE,
        'R$ 47,90 contra R$ 49,22 = 0,973. A CARNE SECA de FEIJOADA custa '
        'R$ 143,70 (2,9x) e as CARNE SECA (150g)/(200g) sao porcao pronta')),
    ('manteiga', ('MANTEIGA COM SAL', QUASE,
        'R$ 32,40 contra R$ 32,80 = 0,988. A MANTEIGA SEM SAL custa R$ 24,00 (0,73x)')),
    ('batata frita', ('BATATA CONGELADA', QUASE,
        'R$ 13,38 contra R$ 13,75 = 0,973, e e o insumo cru que a casa frita. '
        'A BATATA FRITA (300g) do catalogo custa R$ 7,75 (0,56x) e e porcao pronta')),
    ('óleo de soja', ('ÓLEO DE SOJA (6lts)', QUASE,
        'R$ 7,80/litro contra R$ 7,89/litro = 0,989. A garrafa de 0,9 L (R$ 7,70 '
        'a UND) sairia a R$ 8,56/litro. A unidade do nosso cadastro e LTS')),
    ('alho batido', ('ALHO DESCASCADO', QUASE,
        'R$ 20,86 contra R$ 20,50 = 1,018. Alho batido e alho descascado passado '
        'na faca: bater nao muda a massa nem o preco. O ALHO TORRADO custa '
        'R$ 45,00 (2,2x) e o ALHO ROXO COM CASCA R$ 17,90, mas com casca')),

    # ---- forma cortada/ralada/picada de um unico ingrediente = o ingrediente -
    ('cenoura ralada', ('CENOURA', NOME,
        'ralar nao muda a massa; a planilha precifica as duas a R$ 6,99. '
        'Nenhum bloco usa "cenoura" e "cenoura ralada" juntos')),
    ('tomate picado', ('TOMATE SALADA MADURO', EXCLUSAO,
        'picar nao muda a massa. A planilha lista `tomate italiano` em linha '
        'propria, entao o tomate sem adjetivo e o outro. R$ 7,60 contra R$ 14,99 '
        '= 0,51: o preco da planilha e de tomate caro/antigo')),
    ('tomate', ('TOMATE SALADA MADURO', EXCLUSAO,
        'idem — a planilha lista `tomate italiano` separado')),
    ('tomate italiano', ('TOMATE ITALIANO MADURO', NOME,
        'nome identico mais "MADURO". R$ 6,83 contra R$ 14,99 = 0,46')),
    ('salsa picada', ('SALSA', NOME,
        'picar nao muda a massa. R$ 24,20 contra R$ 25,67 = 0,943 — e a razao '
        'proxima de 1 e que diz que a UND do nosso cadastro e cerca de um quilo. '
        'A SALSA CRESPA VERDE custa R$ 2,20, outra coisa. Ver AVISO_NO_ITEM')),
    ('bacon picado', ('BACON', NOME,
        'picar nao muda a massa. R$ 25,90 contra R$ 16,45 = 1,57. O catalogo tem '
        'tres bacons quase no mesmo preco (25,75 / 25,90 / 25,99); escolhi o de '
        'EMBUTIDOS, que e o generico, e nao o de FEIJOADA nem o de SUINOS')),

    # ---- exclusao e escolha forcada ----------------------------------------
    ('limão sciciliano', ('LIMÃO SICILIANO', NOME,
        'o nome da planilha tem "scicilia" por "sicilia". R$ 9,13 contra R$ 9,61 '
        '= 0,95. O outro limao do catalogo e o TAHITI (R$ 7,11)')),
    ('cebola branca', ('CEBOLA', EXCLUSAO,
        'o catalogo tem CEBOLA, CEBOLA ROXA, CEBOLA CALABRESA e CEBOLA CRISPY; '
        'a branca e a sem adjetivo. R$ 4,46 contra R$ 8,70 = 0,51, e a ROXA '
        '(R$ 7,37) ficaria mais perto no preco — mas a planilha diz BRANCA e cor '
        'de cebola nao se decide por preco')),
    ('rúcula', ('RÚCULA HIDROPÔNICA', FORCADA,
        'a unica rucula do catalogo. R$ 27,00 contra R$ 23,50 = 1,149. '
        'Mede em UND e a receita em KG — ver AVISO_NO_ITEM')),
    ('vagem', ('VAGEM FRANCESA', FORCADA,
        'a unica vagem do catalogo. R$ 17,60 contra R$ 10,00 = 1,76. '
        'Mede em UND e a receita em KG — ver AVISO_NO_ITEM')),
    ('presunto', ('PRESUNTO COZIDO', FORCADA,
        'o unico presunto do catalogo. R$ 19,50 contra R$ 22,98 = 0,849')),
    ('isca de fígado de boi', ('FIGADO', FORCADA,
        'o unico figado do catalogo. R$ 8,43 contra R$ 13,02 = 0,648; a planilha '
        'parece cobrar a isca ja cortada')),
    ('batata palha mp', ('BATATA PALHA', FORCADA,
        'a unica batata palha do catalogo. R$ 5,19 contra R$ 8,62 = 0,602. O "MP" '
        'do nome sugere preparo da casa, mas batata palha se compra pronta')),
    ('purê de batata mp', ('PURE DE BATATA', NOME,
        'nome identico sem o "MP". R$ 9,69 contra R$ 8,81 = 1,10')),
    ('farofa de bacon', ('FAROFA PRONTA', FORCADA,
        'a unica farofa do catalogo. R$ 9,80 contra R$ 8,87 = 1,105. O nosso '
        'cadastro nao diz de que e a farofa')),
    ('arroz branco pronto', ('ARROZ PRONTO', NOME,
        'arroz branco pronto e o ARROZ PRONTO; o ARROZ PARBOILIZADO (R$ 4,97) e '
        'o grao cru. R$ 1,73 contra R$ 1,98 = 0,874')),
    ('farinha de trigo', ('FARINHA DE TRIGO (1kg)', NOME,
        'nome identico mais o tamanho. R$ 4,10 contra R$ 5,90 = 0,695. Uma das '
        'cinco linhas de farinha da planilha esta com Unidade L — erro de rotulo '
        'dela; a unidade gravada e a do nosso cadastro, KG')),
    ('sal', ('SAL REFINADO (1kg)', NOME,
        'o sal de cozinha e o refinado; o SAL GROSSO custa R$ 2,90. '
        'R$ 1,75 contra R$ 2,72 = 0,643')),
    ('sal refinado', ('SAL REFINADO (1kg)', NOME,
        'nome identico mais o tamanho')),
    ('copalombo', ('LOMBO SUÍNO', FORCADA,
        'A DECISAO MAIS AGRESSIVA DO DE-PARA, e ela NAO e "custo quase exato": '
        'R$ 18,90 contra R$ 16,97 = 1,114, e 11,4% esta fora da faixa de 3% em '
        'que as outras sete grafias desse rotulo cabem (a pior delas e 3,6%). E '
        'escolha forcada, e a forca aparece na lista inteira de candidatos: '
        'COPA LOMBO (120G) R$ 4,30 e COPA LOMBO (250G) R$ 9,70 sao porcao pronta '
        'com o custo da porcao gravado numa unidade KG (dao R$ 35,83/kg e '
        'R$ 38,80/kg, coerentes entre si e 2,2x a planilha, e mapear para elas '
        'poria R$ 0,52 de carne num schnitzel); LOMBO SALGADO R$ 29,94 (razao '
        '1,764) e da FEIJOADA; LOMBO SUÍNO SALGADO R$ 17,65 (razao 1,040) e '
        'LOMBO SUÍNO SALGADO (SUÍNOS) R$ 18,49 (razao 1,090) estao MAIS PERTO no '
        'preco do que o escolhido, e foram recusados por serem carne CURADA, nao '
        'por preco: schnitzel se faz com lombo fresco. Sobra o LOMBO SUÍNO, que e '
        'o corte cru. A recusa esta registrada aqui e na observacao do item para '
        'que a cliente possa discordar do argumento, e nao do numero. Se eu '
        'estiver errado, 1 ficha subestima a carne')),

    # ---- contagem: o numero da planilha e uma CONTAGEM, nao um peso ---------
    ('ovo', ('OVO BRANCO', NOME,
        'nome identico mais a cor; o OVO CAIPIRA custa R$ 0,00 no catalogo. '
        'R$ 0,67 contra R$ 0,52 = 1,29, e os dois sao preco de UM ovo')),
    ('ovo branco', ('OVO BRANCO', NOME,
        'nome identico. A planilha rotula esta linha como KG com PesoBruto 7 — '
        'sao 7 ovos, nao 7 quilos: o Custo compra R$ 0,52 e o mesmo da linha '
        '`ovo` em UND nas outras duas receitas. Ver CONTAGEM')),

    # ---- fracao de embalagem: a receita pesa, o catalogo vende a embalagem --
    ('azeite', ('AZEITE EXTRA VIRGEM (5lts)', NOME,
        'o nosso cadastro vende a lata e mede em UND, entao a receita de 0,03 L '
        'entra como 0,03/5 = 0,006 lata — a mesma conversao de fracao que as '
        'doses dos drinques usam. R$ 197,90/5 L = R$ 39,58/L contra R$ 47,80/L '
        'da planilha = 0,828. A garrafa O-LIVE de 500 ml sairia a R$ 52,98/L '
        '(1,108), mais perto em preco — mas a lata de 5 L e o que uma cozinha usa '
        'para temperar 1,035 kg de salada em lote. Ver EMBALAGEM')),
    ('maionese', ('MAIONESE (2,8kg)', QUASE,
        'R$ 39,90 / 2,8 kg = R$ 14,25/kg contra R$ 14,96/kg da planilha = 0,952. '
        'O nosso cadastro vende o balde e mede em UND, entao 0,15 kg entra como '
        '0,15/2,8 = 0,0536 balde. A MAIONESE DE ALHO (R$ 13,85/kg) mediria em KG '
        'sem conversao, mas e outro produto — e a receita ja leva alho batido '
        'em linha propria. Ver EMBALAGEM')),
])

# Os quatro nomes de feijao, uma linha cada, porque sao quatro grafias e uma
# delas tem erro de digitacao que o briefing nomeia (`feijãp`).
DE_PARA['feijão preto mp'] = ('FEIJÃO PRONTO', NOME,
    'feijao preto pronto e o FEIJÃO PRONTO (R$ 3,58 contra R$ 3,15 = 1,137); o '
    'FEIJÃO PRETO (1kg) do catalogo, a R$ 5,89, e o grao cru')
DE_PARA['feijão preto pronto'] = ('FEIJÃO PRONTO', NOME, 'idem')
DE_PARA['feijãp preto pronto'] = ('FEIJÃO PRONTO', NOME,
    'idem, com "feijãp" por "feijão" — erro de digitacao da planilha')

# ---------------------------------------------------------------------------
# Produto do catalogo que e vendido por embalagem: a receita pesa, o cadastro
# conta. A fracao sai do TAMANHO ESCRITO NO NOME DO PRODUTO, nunca de um padrao.
# ---------------------------------------------------------------------------
EMBALAGEM = {
    'AZEITE EXTRA VIRGEM (5lts)': (5.0, 'L',
        'a lata de 5 litros, com o tamanho no proprio nome do produto'),
    'MAIONESE (2,8kg)': (2.8, 'KG',
        'o balde de 2,8 kg, com o tamanho no proprio nome do produto'),
}

# Grafias cujo numero na planilha e uma CONTAGEM e nao um peso: o valor vai
# direto para `quantidade`, sem conversao, porque o produto se vende por unidade.
CONTAGEM = {
    'ovo': 'o PesoBruto 3 e 2 sao tres e dois ovos; Custo compra R$ 0,52 e o preco de UM ovo',
    'ovo branco': 'o PesoBruto 7 sao sete ovos; o Peso Liquido 0,14 "kg" e que esta errado',
    'carne assada 120gr': 'o PesoBruto 1 e UMA porcao de 120 g; o nosso cadastro mede em UND e custa R$ 7,97, igual ao Custo compra',
}

# ---------------------------------------------------------------------------
# Os 6 ingredientes que NAO existem no catalogo e para os quais a planilha NAO
# da receita. Viram produto com `custo_fixo = true`, setor Cozinha, categoria
# que ja existe — e o custo e o `Custo compra` DA PLANILHA, porque nao ha
# receita para recalcular. Isso esta marcado no JSON e tem secao no relatorio.
# ---------------------------------------------------------------------------
PRODUTOS_NOVOS_SEM_RECEITA = OrderedDict([
    ('sal com pimenta', {
        'nome': 'SAL COM PIMENTA', 'unidade': 'KG', 'categoria': 'TEMPEROS E AFINS',
        'motivo':
            'MISTURA de dois ingredientes, e por isso nao e "sal cortado de outra '
            'forma": a regra que mapeia `alho batido` para ALHO DESCASCADO e '
            '`cenoura ralada` para CENOURA vale para a forma de UM ingrediente, nao '
            'para uma mistura. O catalogo nao tem o item. O custo R$ 2,72 e da '
            'planilha, e note que e o MESMO que ela usa para `sal` e `sal refinado`: '
            'na aritmetica dela a pimenta custa zero. Usado em 17 dos 24 blocos, '
            'R$ 0,009 a R$ 0,044 por prato'}),
    ('banha', {
        'nome': 'BANHA', 'unidade': 'KG', 'categoria': 'MERCEARIA',
        'motivo':
            'insumo de COMPRA que falta no catalogo: nao ha BANHA nem GORDURA em '
            'nenhuma das 21 categorias. Nao e preparo, nao tem receita, e o custo '
            'R$ 1,00/kg e da planilha — um numero redondo e implausivel para banha, '
            'que vai para a lista da cliente'}),
    ('leitosa de empanamento', {
        'nome': 'LEITOSA DE EMPANAMENTO', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo':
            'preparo de empanamento (a mistura liquida em que a carne passa antes da '
            'farinha). Nao existe no catalogo e a planilha nao da a receita; custo '
            'R$ 7,25 da planilha. Aparece com tres grafias (`leitosa`, `leitiosa`, '
            'e uma linha com a celula Unidade VAZIA)'}),
    ('leitiosa de empanamento', {
        'nome': 'LEITOSA DE EMPANAMENTO', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo': 'a mesma coisa com "leitiosa" por "leitosa" — erro de digitacao'}),
    ('acém mp', {
        'nome': 'ACÉM MP', 'unidade': 'KG', 'categoria': 'CARNES',
        'motivo':
            'acem GUISADO, preparo da casa. O catalogo tem ACEM cru a R$ 30,59 e a '
            'planilha cobra R$ 62,60 — 2,05x, que e a perda de peso de um cozido '
            'longo (acem perde cerca de metade). Mapear para o ACEM cru subestimaria '
            'pela metade um ingrediente que e 70% do custo do prato. A planilha nao '
            'da a receita do guisado, entao o custo R$ 62,60 e dela'}),
    ('pernil mp', {
        'nome': 'PERNIL MP', 'unidade': 'KG', 'categoria': 'SUÍNOS',
        'motivo':
            'pernil ASSADO, preparo da casa. O catalogo tem PERNIL cru a R$ 13,90 e '
            'PERNIL FATIADO a R$ 19,82; a planilha cobra R$ 36,99 (2,66x o cru). '
            'Mesmo caso do acem: a planilha nao da a receita do assado, o custo e dela'}),
    ('arroz branco de brocolis mp', {
        'nome': 'ARROZ BRANCO DE BRÓCOLIS MP', 'unidade': 'KG', 'categoria': 'FEIJOADA',
        'motivo':
            'arroz de brocolis, preparo da casa, sem nada parecido no catalogo e sem '
            'receita na planilha; custo R$ 8,83 dela. A categoria FEIJOADA e onde o '
            'catalogo guarda os acompanhamentos prontos (ARROZ PRONTO, FEIJÃO PRONTO, '
            'FAROFA PRONTA, COUVE PICADA)'}),
])

# ---------------------------------------------------------------------------
# As 9 sub-receitas: o produto que cada bloco vira. Custo RECURSIVO pelo nosso
# catalogo. Categoria sempre existente, com precedente dito.
# ---------------------------------------------------------------------------
SUB_RECEITA_PRODUTO = OrderedDict([
    ('MASSA EMPADÃO', {
        'nome': 'MASSA EMPADÃO', 'unidade': 'KG', 'categoria': 'MASSAS',
        'motivo': 'massa de torta; MASSAS ja guarda MASSA DE PASTEL e MASSA DE GNOCCHI'}),
    ('RECHEIO EMPADÃO', {
        'nome': 'RECHEIO EMPADÃO', 'unidade': 'KG', 'categoria': 'MOLHOS',
        'motivo': 'MOLHOS ja guarda RECHEIO DE CARNE MOÍDA e RECHEIO DE PASTEL'}),
    ('EMPADÃO DE FRANGO', {
        'nome': 'EMPADÃO DE FRANGO', 'unidade': 'KG', 'categoria': 'MASSAS',
        'motivo': 'torta montada; MASSAS ja guarda as EMPADA DE *. Cuidado: o '
                  'catalogo tem EMPADA DE FRANGO com custo R$ 0,00, que e outra '
                  'coisa (empada e individual, empadao e a torta) e esta zerada'}),
    ('SALADA DA CASA ( individual)', {
        'nome': 'SALADA DA CASA (individual)', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo': 'preparo composto da casa; PROCESSADOS e a categoria de item '
                  'processado na casa. A planilha rotula a Unidade como "porção" '
                  'mas o Custo porcao dela e por kg (R$ 2,5613 / 0,14 kg)'}),
    ('GUARNIÇÃO A FRANCESA', {
        'nome': 'GUARNIÇÃO À FRANCESA', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo': 'preparo composto da casa (batata palha, presunto, cebola, '
                  'ervilha, salsa, banha)'}),
    ('TUTU DE FEIJÃO PRETO', {
        'nome': 'TUTU DE FEIJÃO PRETO', 'unidade': 'KG', 'categoria': 'FEIJOADA',
        'motivo': 'acompanhamento pronto de feijao; FEIJOADA e onde vivem '
                  'FEIJÃO PRONTO, ARROZ PRONTO, FAROFA PRONTA, COUVE PICADA'}),
    ('SALADA DE LEGUMES MP', {
        'nome': 'SALADA DE LEGUMES MP', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo': 'preparo composto da casa. UM produto para as DUAS copias '
                  '(abas FILÉ DE FRANGO COM LEGUMES e FILÉ DE PEIXE COM LEGUMES)'}),
    ('SALADA DE MAIONESE', {
        'nome': 'SALADA DE MAIONESE MP', 'unidade': 'KG', 'categoria': 'PROCESSADOS',
        'motivo': 'preparo composto da casa. UM produto para as DUAS copias '
                  '(abas PERNIL COM MAIONESE e SCHNITZEL COM MAIONESE). O nome '
                  'gravado leva o "MP" porque e assim que as duas linhas de '
                  'ingrediente que o consomem o chamam'}),
    ('BASE DE GNOCCHI', {
        'nome': 'BASE DE GNOCCHI', 'unidade': 'KG', 'categoria': 'MASSAS',
        'motivo': 'massa de nhoque com manteiga e parmesao. O catalogo tem MASSA DE '
                  'GNOCCHI a R$ 3,00, que e massa simples e um preco possivelmente '
                  'velho; a receita da planilha e outra e mais caro, e as duas '
                  'coexistirem e pendencia para a cliente'}),
])

# ---------------------------------------------------------------------------
# A duvida viaja com o dado: aviso que entra na `observacao` do item, chaveado
# pela grafia da planilha. A licao A6 dos drinques — gravar a unidade do nosso
# cadastro e escrever a duvida, porque gravar a unidade da planilha faria
# `mv_fator_para_produto` devolver NULO, o item viraria `unidade_incompativel`,
# o custo viria nulo e a propria carga se recusaria a aplicar.
#
# O AVISO DE UNIDADE JA ESTEVE ERRADO, e o erro era do tipo pior: ele mandava a
# cliente FAZER a coisa que derruba o sistema. O texto antigo era "conferir o
# peso da UND", e a leitura natural dele, na tela de produto, e trocar a unidade
# do produto para KG — que e a unidade que a receita usa. Medido, e por dois
# caminhos independentes:
#
#   update produtos set unidade='KG' where nome in ('MANJERICÃO','SALSA')
#      -> 4 fichas perdem custo:  GNOCCHI COM CARNE ASSADA     R$ 0,2285
#                                 CARNE SECA COM TUTU A MINEIRA R$ 0,3630
#                                 ISCA DE FIGADO COM PURE       R$ 0,3630
#                                 LIMONCELLO SPRITZ (DRINQUE!)  R$ 0,4570
#      -> R$ 1,4115 somados, e as DUAS cargas param de aplicar:
#         ERROR: 0004: 1 item(ns) com unidade incompativel
#         ERROR: 0005: 3 item(ns) com unidade incompativel
#
# O estrago passa por cima do muro entre as cargas porque o MANJERICÃO e
# ingrediente de drinque tambem: o aviso desta carga podia derrubar a 0004.
#
# A acao certa nao e trocar a unidade depois; e NAO TROCAR NUNCA.
# `mv_fator_para_produto` converte peso<->contagem pela EMBALAGEM: com
# `conteudo_quantidade` e `conteudo_unidade` preenchidos, o item fala KG, o
# produto continua em UND (que e o que a folha de contagem usa) e o fator
# converte sozinho — medido com `conteudo_quantidade = 1 / conteudo_unidade = KG`
# na SALSA: fator 1, custo R$ 0,3630 antes e depois, zero itens incompativeis.
# ---------------------------------------------------------------------------
AVISO_UNIDADE = (
    'a planilha mede em KG e o nosso cadastro em UND. NAO troque a unidade do '
    'produto para KG: isso faz o fator de conversao vir nulo, o custo deste item '
    'vira nulo e as cargas 0004 e 0005 param de aplicar. O caminho certo e '
    'preencher conteudo_quantidade e conteudo_unidade do produto com o peso de '
    '1 UND; o fator passa a converter sozinho, a unidade do produto continua UND '
    'para a contagem e o custo nao muda. O custo gravado aqui supoe 1 UND = 1 kg'
)

AVISO_NO_ITEM = {
    'brócolis americano': AVISO_UNIDADE,
    'manjericão': AVISO_UNIDADE,
    'rúcula': AVISO_UNIDADE,
    'vagem': AVISO_UNIDADE,
    'salsa picada': AVISO_UNIDADE,
    'ovo branco':
        'a planilha rotula KG e o numero (7) e contagem de ovos, nao quilos',
    'carne assada 120gr':
        'a planilha rotula 1 KG e o nome diz 120 g; gravado como 1 UND da porcao '
        'de 120 g, que e o que o Custo compra R$ 7,97 precifica',
    'azeite':
        'receita em litro convertida para fracao da lata de 5 L do nosso cadastro',
    'maionese':
        'receita em quilo convertida para fracao do balde de 2,8 kg do nosso cadastro',
    'feijão pronto':
        'nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o '
        'PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio',
    'farinha de trigo':
        'uma das cinco linhas de farinha da planilha esta rotulada em L; a unidade '
        'gravada e KG, a do nosso cadastro',
    'leitosa de empanamento':
        'numa das tres linhas a celula Unidade da planilha esta vazia',
    'leitiosa de empanamento':
        'numa das tres linhas a celula Unidade da planilha esta vazia',
    'copalombo':
        'mapeado para LOMBO SUÍNO (R$ 18,90/kg contra R$ 16,97 da planilha, +11,4%) '
        'e nao para COPA LOMBO (120G/250G), que no nosso catalogo sao porcao pronta '
        'com custo de porcao numa unidade KG. O LOMBO SUÍNO SALGADO (R$ 17,65, a '
        '+4,0%) estava mais perto no preco e foi recusado por ser carne CURADA, nao '
        'por preco — se o copalombo da planilha for curado, troque para ele',
    'acém mp':
        'custo R$ 62,60 vindo da planilha: e acem guisado e a planilha nao da a receita',
    'pernil mp':
        'custo R$ 36,99 vindo da planilha: e pernil assado e a planilha nao da a receita',
    'banha':
        'custo R$ 1,00/kg vindo da planilha, e R$ 1,00 e implausivel para banha',
    'sal com pimenta':
        'custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: '
        'na conta dela a pimenta custa zero',
    'arroz  branco de brocolis mp':
        'custo R$ 8,83/kg vindo da planilha: a planilha nao da a receita',
}

# As grafias que o aviso de unidade cobre, derivadas da PROPRIA tabela acima.
# Nao e uma segunda lista a manter: se uma sexta grafia entrar em
# `AVISO_NO_ITEM` apontando para `AVISO_UNIDADE`, ela entra aqui sozinha, e o
# aviso herdado das sub-receitas passa a encontra-la sem eu editar nada.
GRAFIAS_EM_UND = frozenset(g for g, t in AVISO_NO_ITEM.items() if t is AVISO_UNIDADE)

# ---------------------------------------------------------------------------
# As 5 linhas em que o Peso Liquido (0,15) e MAIOR que o PesoBruto (0,12), o que
# pediria `perda_percentual` negativa e o schema recusa.
#
# A quantidade gravada e 0,12, e sao quatro razoes e nao uma preferencia:
#   1. liquido maior que bruto e impossivel: perda de limpeza nao cria massa;
#   2. o `check (perda_percentual >= 0)` do schema recusa o negativo;
#   3. o MESMO produto aparece 0,12 / 0,12 com fator 1 em SEIS outros blocos
#      da mesma planilha — 0,12 e o padrao da casa e 0,15 e a excecao. Sao seis,
#      e nao oito: das 12 linhas que resolvem para FEIJÃO PRONTO, 6 estao a
#      0,12/0,12, 5 a 0,12/0,15 e 1 e a linha de LOTE do TUTU (1/1). O 8 do
#      primeiro laudo contava blocos que nao eram deste produto;
#   4. a col10 — a coluna que a `Resumo` publica e que a nossa vista reproduz —
#      ja calcula 0,12 x 3,15 = R$ 0,378, identico aos seis blocos certos. A
#      propria planilha, no dinheiro, ja se comporta como se fosse 0,12.
# ---------------------------------------------------------------------------
QUANTIDADE_DO_BRUTO = {
    'feijão pronto': 'Peso Liquido maior que o PesoBruto (0,15 > 0,12): '
                     'a quantidade gravada e o PesoBruto'
}


# ===========================================================================
def sem_acento(t: str) -> str:
    return unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()


def chave(v) -> str:
    return ' '.join(sem_acento(str(v or '')).upper().split())


def k_ing(v) -> str:
    """A chave do de-para: a grafia da planilha em minuscula, com os espacos
    colapsados — e so isso. Nao tira acento nem mexe em letra, porque e assim
    que `farinha panko` e `farinha pankp` continuam sendo DUAS linhas escritas a
    mao em vez de desaparecerem numa normalizacao esperta. O colapso de espaco
    existe porque `arroz  branco pronto` tem dois espacos no meio, e o
    `main()` prova que colapsar nao juntou duas grafias diferentes."""
    return ' '.join(str(v or '').lower().split())


def q(v) -> float:
    return 0.0 if v is None else float(v)


def arred(v: float, casas: int) -> float:
    return float(Decimal(repr(float(v))).quantize(
        Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP))


def brl(v: float) -> str:
    s = '%.2f' % (v or 0)
    inteiro, dec = s.split('.')
    sinal = '-' if inteiro.startswith('-') else ''
    inteiro = inteiro.lstrip('-')
    partes = []
    while len(inteiro) > 3:
        partes.insert(0, inteiro[-3:])
        inteiro = inteiro[:-3]
    partes.insert(0, inteiro)
    return '%s%s,%s' % (sinal, '.'.join(partes), dec)


def numero(v: float, casas: int = 4) -> str:
    return ('%.*f' % (casas, v)).rstrip('0').rstrip('.').replace('.', ',') or '0'


# ===========================================================================
def montar_catalogo() -> tuple:
    """868 do retrato + 11 da carga 0003 + 12 da carga 0004, com os custos que a
    0003 deixou. Reproduzivel a partir de arquivos versionados, e cobrado em 891.
    """
    cat = json.loads(CATALOGO.read_text(encoding='utf-8'))
    out = json.loads(OUTUBRO.read_text(encoding='utf-8'))
    dri = json.loads(DRINQUES.read_text(encoding='utf-8'))

    if cat['restaurante_id'] != RESTAURANTE:
        sys.exit('o retrato do catalogo e de outro restaurante')

    prods: dict = {}
    for p in cat['produtos']:
        prods[p['nome']] = {
            'nome': p['nome'], 'unidade': p['unidade'], 'categoria': p['categoria'],
            'custo_medio': p['custo_medio'], 'ativo': p['ativo'],
            'setores': p.get('setores', []),
            'origem': 'catalogo-atual.json (retrato pre-0003)'}
    for p in out['produtos_novos']:
        prods[p['nome']] = {
            'nome': p['nome'], 'unidade': p['unidade'], 'categoria': p['categoria'],
            'custo_medio': p['custo'], 'ativo': True,
            'setores': [{'setor': p['setor'], 'unidade': p['unidade'],
                         'custo': p['custo'], 'custo_fixo': False}],
            'origem': 'criado pela carga 0003 (outubro)'}
    # A 0003 tambem mexeu no custo_medio de 27 produtos que ja existiam.
    por_id = {}
    for p in cat['produtos']:
        por_id[p['id']] = prods[p['nome']]
    atualizados = 0
    for c in out['custo_medio_atualizado']:
        alvo = por_id.get(c['produto_id'])
        if alvo is not None:
            alvo['custo_medio'] = c['custo_medio_novo']
            alvo['origem'] += ' + custo de outubro (carga 0003)'
            atualizados += 1
    for p in dri['produtos_novos']:
        prods[p['nome']] = {
            'nome': p['nome'], 'unidade': p['unidade'], 'categoria': p['categoria'],
            'custo_medio': p['custo'], 'ativo': True,
            'setores': [{'setor': p['setor'], 'unidade': p['unidade'],
                         'custo': p['custo'], 'custo_fixo': p['custo_fixo']}],
            'origem': 'criado pela carga 0004 (preparo de bar)'}

    if len(prods) != PRODUTOS_ESPERADOS:
        sys.exit('catalogo efetivo com %d produtos, esperados %d. Um retrato ou uma '
                 'carga mudou; reveja o de-para antes de seguir.'
                 % (len(prods), PRODUTOS_ESPERADOS))
    # OS IDS DE CATEGORIA E DE SETOR SAEM DO RETRATO, e nao de `idDe(tipo, nome)`.
    #
    # Isto nao e preciosismo: `idDe('setor', 'Cozinha')` da
    # ba5c78f6-1d8a-5c1a-a8dc-b6fe15ae5a5c e o setor Cozinha deste banco e
    # 19a7379f-949c-565a-b11d-16eaf91dab37, porque a carga 0002 RENOMEOU
    # "Estoque Geral" para "Cozinha" e manteve o id — de proposito, para nao
    # deixar orfaos os 317 itens que agosto ja havia contado
    # (scripts/gerar-reestrutura.mjs, ID_DO_SETOR). Ou seja: o id do setor NAO e
    # funcao do nome atual dele.
    #
    # A 0004 nunca tropecou nisso porque os preparos de bar vao para o setor
    # `Bar`, que nunca foi renomeado e cujo id coincide com o UUIDv5 do nome.
    # Esta carga poe 15 produtos na COZINHA, e com o id derivado do nome o
    # `mv_valida_produto_setor` recusa a linha inteira — medido.
    cats = {c['nome']: c['id'] for c in cat['categorias']}
    sets = {s['nome']: s['id'] for s in cat['setores'] if s['ativo']}
    return prods, atualizados, len(cat['produtos']), len(out['produtos_novos']), \
        len(dri['produtos_novos']), cats, sets


def main() -> int:
    bruto = json.loads(BRUTO.read_text(encoding='utf-8'))
    cont: Counter = Counter()
    achados: list = []

    (por_nome, custos_de_outubro, n_retrato, n_0003, n_0004,
     id_da_categoria, id_do_setor) = montar_catalogo()
    categorias_do_catalogo = set(id_da_categoria)
    setores_ativos = set(id_do_setor)
    catalogo = list(por_nome.values())
    cont['produtos_no_catalogo'] = len(catalogo)
    cont['produtos_do_retrato_pre_0003'] = n_retrato
    cont['produtos_criados_pela_0003'] = n_0003
    cont['produtos_criados_pela_0004'] = n_0004
    cont['custos_atualizados_pela_0003'] = custos_de_outubro
    if SETOR_DOS_NOVOS not in setores_ativos:
        sys.exit('setor %s nao existe ou nao esta ativo' % SETOR_DOS_NOVOS)

    # ---- trava: todo alvo do de-para tem de existir, e com nome exato -------
    faltando = sorted({alvo for alvo, _, _ in DE_PARA.values() if alvo not in por_nome})
    if faltando:
        sys.exit('de-para aponta para produto que nao existe no catalogo: %s' % faltando)
    for nome in EMBALAGEM:
        if nome not in por_nome:
            sys.exit('EMBALAGEM aponta para produto que nao existe: %s' % nome)

    # ---- trava: toda grafia da planilha tem de ter uma linha de de-para -----
    todas = [g for d in bruto['ingredientes'].values() for g in d['grafias']]
    # Colapsar espaco nao pode juntar duas grafias que diferem em mais que isso.
    por_chave: dict = {}
    for g in todas:
        por_chave.setdefault(k_ing(g), set()).add(g)
    for k, gs in por_chave.items():
        if len({' '.join(x.lower().split()) for x in gs}) != 1:
            sys.exit('a chave %r juntou grafias diferentes: %s' % (k, sorted(gs)))
    grafias = set(por_chave)
    subs = {k_ing(k) for k in bruto['sub_receitas_do_depara']}
    sem_linha = sorted(g for g in grafias
                       if g not in DE_PARA and g not in PRODUTOS_NOVOS_SEM_RECEITA
                       and g not in subs)
    if sem_linha:
        sys.exit('ingrediente da planilha SEM linha de de-para: %s\n'
                 '(semelhanca so propoe; escreva a linha a mao)' % sem_linha)
    cont['grafias_da_planilha'] = len(grafias)
    cont['linhas_do_depara'] = len(DE_PARA)
    cont['linhas_de_produto_novo_sem_receita'] = len(PRODUTOS_NOVOS_SEM_RECEITA)
    cont['linhas_de_sub_receita'] = len(subs)

    # ---- os produtos novos: 6 sem receita + 9 sub-receitas -----------------
    categorias_existentes = categorias_do_catalogo
    produtos_novos: OrderedDict = OrderedDict()
    for grafia, spec in PRODUTOS_NOVOS_SEM_RECEITA.items():
        if spec['categoria'] not in categorias_existentes:
            sys.exit('categoria inexistente para %s: %s' % (spec['nome'], spec['categoria']))
        if spec['nome'] in por_nome:
            sys.exit('produto novo %s JA EXISTE no catalogo — mapeie, nao crie' % spec['nome'])
        produtos_novos.setdefault(spec['nome'], {
            'nome': spec['nome'], 'unidade': spec['unidade'], 'categoria': spec['categoria'],
            'categoria_id': id_da_categoria[spec['categoria']],
            'setor': SETOR_DOS_NOVOS, 'setor_id': id_do_setor[SETOR_DOS_NOVOS],
            'custo_fixo': True, 'origem': 'ingrediente_sem_catalogo',
            'custo_da_planilha': True, 'motivo': spec['motivo'], 'grafias': [], 'custo': None,
        })
        produtos_novos[spec['nome']]['grafias'].append(grafia)
    for bloco_nome, spec in SUB_RECEITA_PRODUTO.items():
        if spec['categoria'] not in categorias_existentes:
            sys.exit('categoria inexistente para %s: %s' % (spec['nome'], spec['categoria']))
        if spec['nome'] in por_nome:
            sys.exit('sub-receita %s JA EXISTE no catalogo' % spec['nome'])
        produtos_novos[spec['nome']] = {
            'nome': spec['nome'], 'unidade': spec['unidade'], 'categoria': spec['categoria'],
            'categoria_id': id_da_categoria[spec['categoria']],
            'setor': SETOR_DOS_NOVOS, 'setor_id': id_do_setor[SETOR_DOS_NOVOS],
            'custo_fixo': True, 'origem': 'sub_receita_da_planilha',
            'custo_da_planilha': False, 'motivo': spec['motivo'],
            'bloco': bloco_nome, 'custo': None,
        }

    # ---- indice dos blocos -------------------------------------------------
    blocos = bruto['blocos']
    bloco_da_sub = {}
    for b in blocos:
        if b.get('e_sub_receita'):
            bloco_da_sub.setdefault(b['nome_sub_receita'], b)
    produto_da_sub = {bn: SUB_RECEITA_PRODUTO[bn]['nome'] for bn in SUB_RECEITA_PRODUTO}
    for bn in bloco_da_sub:
        if bn not in produto_da_sub:
            sys.exit('bloco de sub-receita sem produto declarado: %s' % bn)

    # -----------------------------------------------------------------------
    # O AVISO DE UNIDADE TEM DE SUBIR A ARVORE.
    #
    # Dos cinco ingredientes que a planilha pesa e o nosso cadastro conta, TRES
    # — BRÓCOLIS AMERICANO, RÚCULA HIDROPÔNICA e VAGEM FRANCESA — nao aparecem em
    # NENHUMA linha de `ficha_itens`:
    #
    #     BRÓCOLIS AMERICANO|UND|(nenhuma ficha)|0
    #     MANJERICÃO        |UND|Drinques|1 · Executivos|1
    #     RÚCULA HIDROPÔNICA|UND|(nenhuma ficha)|0
    #     SALSA             |UND|Executivos|2
    #     VAGEM FRANCESA    |UND|(nenhuma ficha)|0
    #
    # Eles vivem DENTRO de um produto de sub-receita, e o aviso deles ficava numa
    # linha que a cliente nao ve em lugar nenhum: a tela mostra a ficha do prato,
    # e na ficha do prato o que aparece e `SALADA DE LEGUMES MP`, uma linha so.
    # O aviso existia e nao servia para nada — era aviso para mim, no JSON.
    #
    # Esta funcao desce a arvore do preparo e devolve os produtos em UND que
    # estao abaixo dele, em qualquer profundidade, para que o aviso apareca na
    # linha que ELA ve. Nao e cosmetica: `SALADA DE LEGUMES MP` e a maior parcela
    # de custo do prato de maior divergencia da planilha, e e ela que carrega o
    # brocolis e a vagem.
    # -----------------------------------------------------------------------
    memo_und: dict = {}

    def und_abaixo(sub_nome: str, caminho: tuple = ()) -> list:
        if sub_nome in memo_und:
            return memo_und[sub_nome]
        if sub_nome in caminho:
            sys.exit('ciclo de sub-receita ao procurar unidade: %s' % sub_nome)
        achado: list = []
        for it in bloco_da_sub[sub_nome]['itens']:
            dentro = it.get('sub_receita')
            if dentro:
                achado.extend(und_abaixo(dentro, caminho + (sub_nome,)))
            elif k_ing(it['ingrediente']) in GRAFIAS_EM_UND:
                achado.append(DE_PARA[k_ing(it['ingrediente'])][0])
        unicos: list = []
        for nome_und in achado:
            if nome_und not in unicos:
                unicos.append(nome_und)
        memo_und[sub_nome] = unicos
        return unicos

    # =======================================================================
    # Resolver uma linha de ingrediente: produto, unidade, quantidade, perda.
    # A MESMA funcao serve o prato e a sub-receita — e e por isso que o custo do
    # preparo e o custo da ficha nao podem divergir de aritmetica.
    # =======================================================================
    memo_itens: dict = {}

    def resolver(bloco: dict, item: dict, ordem: int) -> dict:
        # Memo por LINHA DA PLANILHA. Sem ele, a recursao do custo chama esta
        # funcao varias vezes para a mesma linha e os contadores da prova da
        # volta contariam chamadas em vez de linhas — um numero que parece
        # resposta e nao e.
        memo_k = (bloco['aba'], bloco['linha_cabecalho'], item['linha'])
        if memo_k in memo_itens:
            return dict(memo_itens[memo_k], ordem=ordem)

        g = k_ing(item['ingrediente'])
        avisos = []

        sub = item.get('sub_receita')
        herdados: list = []
        if sub:
            nome_produto = produto_da_sub[sub]
            motivo = 'sub-receita da propria planilha (bloco %s), provada por %s' % (
                sub, item.get('prova_da_sub_receita'))
            forca = 'sub-receita'
            herdados = und_abaixo(sub)
            if herdados:
                lista = (herdados[0] if len(herdados) == 1
                         else ', '.join(herdados[:-1]) + ' e ' + herdados[-1])
                avisos.append(
                    'este preparo leva %s dentro dele, que a planilha mede em KG e '
                    'o nosso cadastro conta em UND: o custo deste item supoe '
                    '1 UND = 1 kg desses produtos. NAO troque a unidade deles para '
                    'KG — isso zera o custo e impede a carga de aplicar; preencha '
                    'conteudo_quantidade e conteudo_unidade com o peso de 1 UND'
                    % lista)
                cont['linhas_com_aviso_de_unidade_herdado'] += 1
        elif g in PRODUTOS_NOVOS_SEM_RECEITA:
            nome_produto = PRODUTOS_NOVOS_SEM_RECEITA[g]['nome']
            motivo = PRODUTOS_NOVOS_SEM_RECEITA[g]['motivo']
            forca = 'produto novo sem receita'
        else:
            nome_produto, forca, motivo = DE_PARA[g]

        novo = produtos_novos.get(nome_produto)
        prod = por_nome.get(nome_produto)
        unidade = (novo or prod)['unidade']

        bruto_pl = q(item['peso_bruto'])
        liq_pl = q(item['peso_liquido'])

        # (a) contagem: o numero da planilha ja e a quantidade, sem perda.
        if g in CONTAGEM:
            quantidade = arred(bruto_pl, 4)
            perda = 0.0
            avisos.append(CONTAGEM[g])
            cont['itens_por_contagem'] += 1
        # (b) liquido maior que bruto: a quantidade e o bruto, perda zero.
        elif item.get('liquido_maior_que_bruto'):
            quantidade = arred(bruto_pl, 4)
            perda = 0.0
            avisos.append(QUANTIDADE_DO_BRUTO.get(g, 'Peso Liquido maior que o PesoBruto'))
            cont['itens_com_quantidade_do_bruto'] += 1
        # (c) fracao de embalagem: a receita pesa, o cadastro conta.
        elif nome_produto in EMBALAGEM:
            tam, _un_emb, _por = EMBALAGEM[nome_produto]
            quantidade = arred(liq_pl / tam, 4)
            perda = arred((1.0 - liq_pl / bruto_pl) * 100.0, 3) if bruto_pl else 0.0
            cont['itens_por_fracao_de_embalagem'] += 1
        # (d) o caso normal: quantidade = Peso Liquido, perda do fator.
        else:
            quantidade = arred(liq_pl, 4)
            perda = arred((1.0 - liq_pl / bruto_pl) * 100.0, 3) if bruto_pl else 0.0

        if perda < 0 or perda >= 100:
            sys.exit('perda fora do check do schema em %s/%s: %s'
                     % (bloco['nome_do_bloco'], item['ingrediente'], perda))
        if quantidade <= 0:
            cont['itens_com_quantidade_zero'] += 1
            achados.append({'tipo': 'quantidade_zero', 'bloco': str(bloco['nome_do_bloco']),
                            'ingrediente': item['ingrediente']})

        # Exatamente a conta da `vw_ficha_itens`, com os mesmos arredondamentos:
        # o fator e 1 porque a unidade gravada e a do proprio produto.
        qtd_bruta = arred(quantidade / (1.0 - perda / 100.0), 4)

        if g in AVISO_NO_ITEM:
            avisos.append(AVISO_NO_ITEM[g])

        # A prova da volta, item a item, contra a coluna PesoBruto da planilha.
        volta_ok = None
        if not (g in CONTAGEM or item.get('liquido_maior_que_bruto')
                or nome_produto in EMBALAGEM):
            volta_ok = abs(qtd_bruta - arred(bruto_pl, 4)) < 1e-12
            cont['volta_ok' if volta_ok else 'volta_falhou'] += 1
        elif nome_produto in EMBALAGEM:
            # A volta pela embalagem: quantidade x tamanho tem de devolver o
            # PesoBruto. Ela so fecha EXATO quando o PesoBruto divide limpo pelo
            # tamanho da embalagem; quando nao divide, o limite e a precisao de
            # `quantidade` (numeric(14,4)) e nao um erro meu. A diferenca e
            # medida e vai para o relatorio em gramas e em reais.
            tam = EMBALAGEM[nome_produto][0]
            reconstruido = arred(qtd_bruta * tam, 6)
            volta_ok = abs(reconstruido - arred(bruto_pl, 6)) < 1e-9
            resto = {'reconstruido': reconstruido, 'peso_bruto': bruto_pl,
                     'diferenca': arred(reconstruido - bruto_pl, 8),
                     'embalagem': tam, 'quantidade': quantidade}
            if volta_ok:
                cont['volta_ok_pela_embalagem'] += 1
            else:
                cont['volta_pela_embalagem_limitada_pela_precisao'] += 1
                achados.append(dict(
                    tipo='volta_pela_embalagem_limitada_pela_precisao_de_quantidade',
                    bloco=str(bloco['nome_do_bloco']), ingrediente=item['ingrediente'],
                    produto=nome_produto, **resto))

        obs = 'planilha: %s · %s' % (item['ingrediente'].strip(), bloco['aba'].strip())
        if avisos:
            obs += ' · ' + ' · '.join(avisos)

        resolvido = {
            'ordem': ordem,
            'produto': nome_produto,
            'produto_novo': bool(novo),
            'unidade': unidade,
            'quantidade': quantidade,
            'perda_percentual': perda,
            'quantidade_bruta': qtd_bruta,
            'observacao': obs,
            'produtos_em_und_abaixo': herdados,
            'depara': {'grafia': item['ingrediente'], 'forca': forca, 'motivo': motivo},
            'planilha': {
                'linha': item['linha'],
                'peso_bruto': item['peso_bruto'], 'peso_liquido': item['peso_liquido'],
                'perda_manipulacao': item['perda_manipulacao'],
                'fator_correcao': item['fator_correcao'],
                'unidade': item['unidade'], 'custo_compra': item['custo_compra'],
                'valor_producao_col9': item['valor'][0],
                'valor_preco_de_custo_col10': item['valor'][1],
                # A col10 recalculada: PesoBruto x Custo compra. E ela, e nao a
                # impressa, que serve de conferencia — nas 8 linhas de sub-receita
                # a impressa foi digitada a mao.
                'col10_recalculada': arred(bruto_pl * q(item['custo_compra']), 6),
            },
            'volta_do_perda_percentual_ok': volta_ok,
        }
        memo_itens[memo_k] = resolvido
        return dict(resolvido, ordem=ordem)

    # =======================================================================
    # O custo, recursivo, pelo NOSSO catalogo.
    # =======================================================================
    custo_memo: dict = {}
    em_curso: set = set()

    def custo_do_produto(nome: str) -> float:
        if nome in custo_memo:
            return custo_memo[nome]
        if nome in em_curso:
            sys.exit('ciclo de sub-receita em %s' % nome)
        em_curso.add(nome)

        novo = produtos_novos.get(nome)
        if novo is None:
            prod = por_nome[nome]
            # A mesma ordem de preferencia do `mv_custo_do_produto`: o custo do
            # produto primeiro, o do vinculo de setor depois.
            valor = q(prod.get('custo_medio')) or max(
                [q(s.get('custo')) for s in prod.get('setores', [])
                 if s.get('custo')] or [0.0])
        elif novo['origem'] == 'ingrediente_sem_catalogo':
            # Nao ha receita para recalcular: o custo e o da planilha, e isso
            # esta declarado em `custo_da_planilha`.
            grafia = novo['grafias'][0]
            valor = next(
                q(i['custo_compra'])
                for b in blocos for i in b['itens']
                if k_ing(i['ingrediente']) in novo['grafias'])
            del grafia
        else:
            b = bloco_da_sub[novo['bloco']]
            soma = 0.0
            receita = []
            for ordem, item in enumerate(b['itens'], start=1):
                r = resolver(b, item, ordem)
                cu = custo_do_produto(r['produto'])
                parcela = arred(r['quantidade_bruta'] * cu, 4)
                soma += parcela
                # A receita fica NO ARQUIVO, e nao so na cabeca da recursao: e
                # ela que torna o custo do preparo auditavel sem reexecutar o
                # script, e e por ela que o gerador sabe que MASSA EMPADAO nao e
                # produto orfao — ele e consumido por outro preparo, nao por uma
                # ficha. Sem isso a trava de orfao reprovaria um produto legitimo.
                receita.append({
                    'grafia_na_planilha': item['ingrediente'],
                    'produto': r['produto'],
                    'quantidade': r['quantidade'],
                    'unidade': r['unidade'],
                    'perda_percentual': r['perda_percentual'],
                    'quantidade_bruta': r['quantidade_bruta'],
                    'custo_unitario_catalogo': cu,
                    'custo': parcela,
                    'custo_compra_na_planilha': item['custo_compra'],
                    'peso_bruto_na_planilha': item['peso_bruto'],
                })
            novo['receita_no_nosso_catalogo'] = receita
            novo['peso_porcao'] = b['peso_porcao']
            novo['custo_total_do_lote'] = arred(soma, 4)
            novo['custo_porcao_col9_da_planilha'] = b['cabecalho']['custo_porcao'][0]
            novo['custo_porcao_col10_da_planilha'] = b['cabecalho']['custo_porcao'][1]
            novo['aba'] = b['aba']
            # `Custo porcao` = `Custo total` / `Peso Porcao` — a relacao que a
            # planilha cumpre em 48 de 48, e nao a divisao por Rendimento.
            valor = arred(soma / q(b['peso_porcao']), 6)

        em_curso.discard(nome)
        custo_memo[nome] = valor
        return valor

    for nome, novo in produtos_novos.items():
        novo['custo'] = custo_do_produto(nome)

    # =======================================================================
    # As fichas.
    # =======================================================================
    pratos = [b for b in blocos if b.get('e_prato_vendido')]
    pratos.sort(key=lambda b: bruto['origem']['abas_de_prato'].index(b['aba']))
    fichas = []
    for ordem_ficha, b in enumerate(pratos, start=1):
        itens = []
        for ordem, item in enumerate(b['itens'], start=1):
            r = resolver(b, item, ordem)
            r['custo_unitario'] = custo_do_produto(r['produto'])
            r['custo'] = arred(r['quantidade_bruta'] * r['custo_unitario'], 4)
            itens.append(r)

        vistos = Counter(i['produto'] for i in itens)
        for p, n in vistos.items():
            if n > 1:
                cont['par_ficha_produto_repetido'] += 1
                achados.append({'tipo': 'o_mesmo_produto_duas_vezes_na_ficha',
                                'ficha': b['nome_na_resumo'], 'produto': p, 'vezes': n})

        nosso = arred(sum(i['custo'] for i in itens), 4)

        # O aviso herdado ganha o TAMANHO do preparo no prato. E o numero que
        # explica por que a divergencia contra a planilha mora nele, e so pode
        # ser escrito aqui porque depende do custo da ficha fechado. A conta e
        # a mesma `custo` que vai para o banco, nao uma estimativa.
        for i in itens:
            if i['produtos_em_und_abaixo'] and nosso > 0:
                i['observacao'] += (' · este preparo e %s%% do custo deste prato'
                                    % ('%.1f' % (i['custo'] / nosso * 100.0)).replace('.', ','))

        da_planilha = q(b['custo_bruto_da_resumo'])
        recalc = arred(sum(q(i['planilha']['col10_recalculada']) for i in itens), 4)

        ficha = {
            'nome': b['nome_na_resumo'],
            'grupo': GRUPO,
            'rendimento': 1,
            'unidade_rendimento': 'PORCAO',
            'preco_venda': 0,
            'cmv_alvo': CMV_ALVO,
            'ativo': True,
            'ordem': ordem_ficha,
            'itens': itens,
            'planilha': {
                'aba': b['aba'],
                'nome_do_bloco': b['nome_do_bloco'],
                'linha_do_cabecalho': b['linha_cabecalho'],
                'rendimento_rotulado': b['rendimento_planilha'],
                'peso_porcao': b['peso_porcao'],
                'peso_do_prato_kg': (b['total'] or {}).get('peso_liquido'),
                'custo_total_col9': b['cabecalho']['custo_total'][0],
                'custo_total_col10': b['cabecalho']['custo_total'][1],
                'custo_bruto_da_resumo': da_planilha,
                'custo_col10_recalculado': recalc,
                'precos_da_resumo': b['precos_da_resumo'],
            },
            'custo_do_nosso_catalogo': nosso,
        }
        ficha['descricao'] = montar_descricao(ficha)
        fichas.append(ficha)

        if nosso <= 0:
            cont['fichas_com_custo_zero'] += 1
            achados.append({'tipo': 'ficha_com_custo_zero', 'ficha': ficha['nome']})

    # =======================================================================
    # Numeros de fechamento e ancoras que a carga vai cobrar.
    # =======================================================================
    cont['fichas'] = len(fichas)
    cont['itens'] = sum(len(f['itens']) for f in fichas)
    cont['produtos_novos'] = len(produtos_novos)
    cont['produtos_novos_sub_receita'] = sum(
        1 for p in produtos_novos.values() if p['origem'] == 'sub_receita_da_planilha')
    cont['produtos_novos_sem_catalogo'] = sum(
        1 for p in produtos_novos.values() if p['origem'] == 'ingrediente_sem_catalogo')
    cont['produtos_distintos_usados'] = len({i['produto'] for f in fichas for i in f['itens']})
    cont['catalogo_depois'] = len(catalogo) + len(produtos_novos)

    custo_somado = arred(sum(f['custo_do_nosso_catalogo'] for f in fichas), 4)
    soma_quantidades = arred(sum(i['quantidade'] for f in fichas for i in f['itens']), 4)
    custo_da_planilha = arred(sum(q(f['planilha']['custo_bruto_da_resumo']) for f in fichas), 4)
    custo_recalc = arred(sum(q(f['planilha']['custo_col10_recalculado']) for f in fichas), 4)

    # Itens que apontam para produto com custo zero: nos drinques isso era a
    # fonte de "ficha com custo zero inexplicado".
    for f in fichas:
        for i in f['itens']:
            if q(i['custo_unitario']) <= 0:
                cont['itens_com_produto_de_custo_zero'] += 1
                achados.append({'tipo': 'produto_com_custo_zero', 'ficha': f['nome'],
                                'produto': i['produto']})

    saida = {
        'restaurante_id': RESTAURANTE,
        'resumo': {
            'fichas': len(fichas),
            'itens': cont['itens'],
            'produtos_novos': len(produtos_novos),
            'produtos_distintos_usados': cont['produtos_distintos_usados'],
            'catalogo_depois': cont['catalogo_depois'],
            'custo_total_das_fichas': custo_somado,
            'soma_das_quantidades': soma_quantidades,
            'custo_da_planilha_somado': custo_da_planilha,
            'custo_col10_recalculado_somado': custo_recalc,
            'grupos': {GRUPO: len(fichas)},
            'cmv_alvo': CMV_ALVO,
            'indices': INDICES,
        },
        'contadores': dict(sorted(cont.items())),
        'achados': achados,
        'produtos_novos': list(produtos_novos.values()),
        'fichas': fichas,
        'depara': [
            {'grafia': g, 'produto': alvo, 'forca': forca, 'motivo': motivo}
            for g, (alvo, forca, motivo) in DE_PARA.items()
        ],
        'sub_receitas': {bn: SUB_RECEITA_PRODUTO[bn]['nome'] for bn in SUB_RECEITA_PRODUTO},
        'copias_de_sub_receita': bruto['copias_de_sub_receita'],
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding='utf-8')
    escrever_relatorio(saida, bruto, por_nome)

    print('blocos da planilha %d · PRATOS %d · sub-receitas distintas %d'
          % (len(blocos), len(fichas), cont['produtos_novos_sub_receita']))
    print('itens %d · produtos distintos usados %d' % (cont['itens'],
                                                       cont['produtos_distintos_usados']))
    print('de-para escrito a mao: %d linhas de ingrediente + %d de sub-receita + %d de produto novo'
          % (cont['linhas_do_depara'], cont['linhas_de_sub_receita'],
             cont['linhas_de_produto_novo_sem_receita']))
    print('produtos novos %d (%d sub-receita com custo recursivo + %d sem catalogo com custo da planilha)'
          % (cont['produtos_novos'], cont['produtos_novos_sub_receita'],
             cont['produtos_novos_sem_catalogo']))
    print('catalogo %d -> %d' % (cont['produtos_no_catalogo'], cont['catalogo_depois']))
    print()
    print('custo somado  NOSSO catalogo ......... R$ %s' % numero(custo_somado))
    print('custo somado  da planilha (Resumo) ... R$ %s' % numero(custo_da_planilha))
    print('custo somado  col10 recalculada ...... R$ %s' % numero(custo_recalc))
    print('soma das quantidades (ancora) ........ %s' % numero(soma_quantidades))
    print()
    print('volta do perda_percentual: ok %d · pela embalagem %d · falhou %d'
          % (cont['volta_ok'], cont['volta_ok_pela_embalagem'], cont['volta_falhou']))
    print('itens por contagem %d · por fracao de embalagem %d · com quantidade do bruto %d'
          % (cont['itens_por_contagem'], cont['itens_por_fracao_de_embalagem'],
             cont['itens_com_quantidade_do_bruto']))
    print('ficha com custo zero %d · par (ficha,produto) repetido %d · produto de custo zero %d'
          % (cont['fichas_com_custo_zero'], cont['par_ficha_produto_repetido'],
             cont['itens_com_produto_de_custo_zero']))
    print()
    print('achados: %d · escrito %s e %s'
          % (len(achados), SAIDA.relative_to(RAIZ), RELATORIO.relative_to(RAIZ)))
    return 0


# ===========================================================================
def montar_descricao(ficha: dict) -> str:
    """A `descricao` da ficha: o peso do prato, o CMV alvo e a tabela dos cinco
    indices com DUAS linhas de preco — a da planilha e a nossa.

    A segunda linha e um retrato do dia da carga, e o texto diz isso: o custo
    vivo esta em `vw_fichas_completas.custo_total`, que a tela le. Escrever aqui
    um numero e dar a cliente a comparacao que ela pediu sem fingir que ele se
    atualiza sozinho.
    """
    pl = ficha['planilha']
    custo_pl = q(pl['custo_bruto_da_resumo'])
    custo_nosso = q(ficha['custo_do_nosso_catalogo'])
    peso = q(pl['peso_do_prato_kg'])

    linhas = []
    linhas.append('Executivo · Bar do Zeca Norte Shopping.')
    linhas.append('')
    linhas.append('A receita rende 1 prato de %s kg. (A planilha chama esse peso de'
                  ' "Rendimento (porções)"; ela não divide o custo por ele — divide'
                  ' pelo Peso Porção, que é 1.)' % numero(peso, 4))
    linhas.append('CMV alvo %d%%, que é o que a própria aba usa (Índice de custo 5,'
                  ' CMV 0,2).' % ficha['cmv_alvo'])
    linhas.append('')
    linhas.append('PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice;'
                  ' o CMV é o inverso do índice.')
    linhas.append('')
    cab = 'índice           ' + ''.join('%12s' % numero(i, 1) for i in INDICES)
    linhas.append(cab)
    linhas.append('-' * len(cab))
    linhas.append('custo da planilha (R$ %s)' % brl(custo_pl))
    linhas.append('  preço          ' + ''.join(
        '%12s' % brl(q(pl['precos_da_resumo'].get(('%g' % i), custo_pl * i)))
        for i in INDICES))
    linhas.append('custo do nosso estoque (R$ %s) — na data da carga' % brl(custo_nosso))
    linhas.append('  preço          ' + ''.join('%12s' % brl(custo_nosso * i) for i in INDICES))
    linhas.append('')
    if custo_pl > 0:
        dif = (custo_nosso / custo_pl - 1.0) * 100.0
        linhas.append('O nosso custo é %s%.1f%% em relação ao da planilha (R$ %s contra'
                      ' R$ %s). A diferença entre as duas linhas de preço é a diferença'
                      ' entre o custo com que a casa precifica e o custo real do'
                      ' estoque.' % ('+' if dif >= 0 else '', dif,
                                     brl(custo_nosso), brl(custo_pl)))
    linhas.append('')
    linhas.append('O preço de venda nasce 0 por decisão da casa: os cinco índices ficam'
                  ' aqui e o preço é escolhido prato a prato na tela. Enquanto ele for'
                  ' 0, o CMV e a margem da ficha são nulos.')
    if ficha['nome'] != str(pl['nome_do_bloco']):
        linhas.append('')
        linhas.append('Na planilha: aba "%s", bloco "%s" (linha %d). O nome vendido é o'
                      ' da aba Resumo.' % (pl['aba'].strip(), pl['nome_do_bloco'],
                                           pl['linha_do_cabecalho']))
    else:
        linhas.append('')
        linhas.append('Na planilha: aba "%s" (linha %d).'
                      % (pl['aba'].strip(), pl['linha_do_cabecalho']))
    return '\n'.join(linhas)


# ===========================================================================
def escrever_relatorio(saida: dict, bruto: dict, por_nome: dict) -> None:
    L = []
    w = L.append
    r = saida['resumo']
    # Counter e nao dict: contador que nunca foi incrementado vale ZERO e tem de
    # aparecer como zero no relatorio — "0 de 48" e a prova central da secao 5,
    # e um KeyError no lugar dela seria a pior forma de perder um argumento.
    c = Counter(saida['contadores'])
    bc = Counter(bruto['contadores'])

    def titulo(n, t):
        w('')
        w('=' * 78)
        w('%d · %s' % (n, t))
        w('=' * 78)
        w('')

    w('RELATORIO · FICHAS TECNICAS DOS PRATOS EXECUTIVOS')
    w('Bar do Zeca · Norte Shopping')
    w('')
    w('fonte  : %s' % bruto['origem']['arquivo'])
    w('destino: supabase/seed/0005_fichas_executivos.sql')
    w('')
    w('  pratos (fichas) ........................ %d' % r['fichas'])
    w('  itens de ficha ......................... %d' % r['itens'])
    w('  produtos novos ......................... %d' % r['produtos_novos'])
    w('    sub-receita, custo recursivo ......... %d' % c['produtos_novos_sub_receita'])
    w('    sem catalogo, custo da planilha ...... %d' % c['produtos_novos_sem_catalogo'])
    w('  produtos distintos usados .............. %d' % r['produtos_distintos_usados'])
    w('  catalogo: %d -> %d' % (c['produtos_no_catalogo'], r['catalogo_depois']))
    w('')
    w('  custo somado pelo NOSSO catalogo ....... R$ %s' % brl(r['custo_total_das_fichas']))
    w('  custo somado da planilha (Resumo) ...... R$ %s' % brl(r['custo_da_planilha_somado']))
    w('  custo somado col10 recalculada ......... R$ %s' % brl(r['custo_col10_recalculado_somado']))
    w('  soma das quantidades (ancora da carga) . %s' % numero(r['soma_das_quantidades']))
    w('  cmv_alvo em todas ...................... %d' % r['cmv_alvo'])
    w('  preco_venda em todas ................... 0  (decisao da cliente)')

    titulo(1, 'A PLANILHA, CONFERIDA — e nao presumida')
    w('14 abas: 13 de prato e a Resumo. 24 blocos, 165 linhas de ingrediente,')
    w('76 grafias de ingrediente (67 nomes distintos quando se ignora caixa e acento).')
    w('')
    w('As sete relacoes que o extrator confere linha por linha e bloco por bloco:')
    w('')
    w('  1 col9  = Peso Liquido x Custo compra ....... %d ok de 165' % bc['col9_igual_liquido_x_custo'])
    w('  2 col10 = PesoBruto    x Custo compra ....... %d ok de 165' % bc['col10_igual_bruto_x_custo'])
    w('  3 Fator de Correcao = PesoBruto/Peso Liquido  %d ok de 163 preenchidas (%d vazias)'
      % (bc['fator_igual_bruto_sobre_liquido'], bc['fator_vazio']))
    w('  4 Perda manipulacao = PesoBruto-Peso Liquido  %d ok, %d DIVERGENTES, %d vazias'
      % (bc['perda_igual_bruto_menos_liquido'], bc['perda_divergente'], bc['perda_vazia']))
    w('  5 linha TOTAL = soma das linhas ............. col9 %d/24 · col10 %d/24 · bruto %d/24 · liq %d/24'
      % (bc['total_fecha_col9'], bc['total_fecha_col10'],
         bc['total_fecha_peso_bruto'], bc['total_fecha_peso_liquido']))
    w('  6 Custo total do cabecalho = linha TOTAL .... col9 %d/24 · col10 %d/24'
      % (bc['cabecalho_fecha_com_total_col9'], bc['cabecalho_fecha_com_total_col10']))
    w('  7 Custo porcao = Custo total / PESO PORCAO .. %d de 48'
      % bc['custo_porcao_e_custo_total_sobre_peso_porcao'])
    w('    Custo porcao = Custo total / RENDIMENTO ... %d de 48'
      % bc['custo_porcao_e_custo_total_sobre_rendimento'])
    w('    Preco = Custo porcao x Indice ............. %d de 48'
      % bc['preco_e_custo_porcao_x_indice'])
    w('    CMV = 1 / Indice ......................... %d de 48' % bc['cmv_e_um_sobre_indice'])
    w('')
    w('E a Resumo: 13 linhas, 5 indices, preco = custo x indice em %d de 65.'
      % bc['preco_da_resumo_e_custo_x_indice'])
    w('')
    w('CRITICA A VARREDURA INICIAL DO BRIEFING: ela diz 164 linhas de ingrediente e')
    w('75 ingredientes distintos; sao 165 e 76. A linha a mais e a UNICA do arquivo')
    w('com a celula Unidade VAZIA:')
    for a in bruto['achados']:
        if a['tipo'] == 'unidade_vazia':
            w('    aba %s · bloco %s · linha %d · "%s" · R$ %s'
              % (a['aba'].strip(), a['bloco'], a['linha'], a['ingrediente'],
                 brl(a['valor_col9'])))
    w('  Um leitor que pare na ausencia de unidade a perde — e ela vale dinheiro e')
    w('  entra na linha TOTAL do bloco, que e justamente o que faz a conferencia 5')
    w('  passar. E a mesma familia do nome mutilado dos drinques: defeito de leitura')
    w('  que uma conferencia de total pega so se o total contar a linha perdida.')

    titulo(2, 'AS DUAS COLUNAS DE VALOR, e qual delas confere')
    w('col9  "Valor producao"       = Peso Liquido x Custo compra   (165 de 165)')
    w('col10 "Valor preco de custo" = PesoBruto    x Custo compra   (157 de 165)')
    w('')
    w('A diferenca entre as duas e exatamente o fator de correcao: a col9 cobra o que')
    w('vai no prato, a col10 cobra o que sai do estoque.')
    w('')
    w('USO A col10, e o motivo nao e "porque a Resumo usa". A nossa vw_ficha_itens')
    w('calcula  quantidade_bruta x fator x custo_unitario , com')
    w('quantidade_bruta = quantidade / (1 - perda/100) — que E o PesoBruto. A nossa')
    w('vista reproduz a FORMULA da col10. A col9 subestima o estoque em toda linha')
    w('com perda: %d das %d linhas tem fator maior que 1, %d tem bruto igual ao'
      % (bc['linhas_com_fator_maior_que_um'], bc['linhas_de_ingrediente'],
         bc['linhas_com_fator_igual_a_um']))
    w('liquido (e nelas as duas colunas dao o mesmo numero) e %d tem liquido MAIOR'
      % bc['liquido_maior_que_bruto'])
    w('que o bruto, que e impossivel e esta na secao 4.')
    w('')
    w('AS 8 LINHAS EM QUE A col10 NAO FECHA sao as 8 linhas de sub-receita — e nas')
    w('8 o PesoBruto e IGUAL ao Peso Liquido (fator 1), logo col9 e col10 deveriam')
    w('ser iguais. Nao sao: a col10 delas foi digitada a mao.')
    w('')
    for a in bruto['achados']:
        if a['tipo'] != 'col10_nao_e_bruto_x_custo':
            continue
        w('  %-26s . %-26s  col10 impressa %-12s  bruto x custo %s'
          % (a['bloco'][:26], a['ingrediente'][:26], brl(a['impresso']), brl(a['esperado'])))
    w('')
    w('  O pior dos oito e `recheio empadão` dentro de EMPADÃO DE FRANGO: a col10')
    w('  impressa (R$ 36,7065) e o Custo total do LOTE INTEIRO do RECHEIO EMPADÃO,')
    w('  nao o custo de 2,4 kg dele. Por isso a conferencia de custo deste relatorio')
    w('  usa a col10 RECALCULADA (PesoBruto x Custo compra) e nao a impressa — a')
    w('  mesma licao do cache velho do PDV nos drinques.')

    titulo(3, 'AS TRES COLUNAS DE PESO: qual conta a verdade')
    w('PesoBruto · Perda manipulacao · Peso Liquido, e o Fator de Correcao ao lado.')
    w('')
    w('  Fator de Correcao == PesoBruto / Peso Liquido : %d de %d preenchidas, ZERO divergencias'
      % (bc['fator_igual_bruto_sobre_liquido'], 165 - bc['fator_vazio']))
    w('  Perda manipulacao == PesoBruto - Peso Liquido : %d de 165, %d DIVERGENCIAS'
      % (bc['perda_igual_bruto_menos_liquido'], bc['perda_divergente']))
    w('')
    w('O ARGUMENTO, e nao a preferencia: o fator e uma FORMULA (nao erra uma vez em')
    w('163) e a perda e um numero DIGITADO (erra 31 vezes em 153 preenchidas). E,')
    w('decisivo: a `Perda manipulacao` NAO ENTRA EM FORMULA NENHUMA da planilha.')
    w('As duas colunas que alimentam o Custo total sao a col9 (Peso Liquido) e a')
    w('col10 (PesoBruto), e as duas fecham. A perda e decoracao — e decoracao errada.')
    w('')
    w('O caso que o briefing cita, com a conta aberta:')
    for a in bruto['achados']:
        if a['tipo'] == 'perda_manipulacao_divergente' and 'FIGADO' in chave(a['ingrediente']):
            w('  ISCA DE FIGADO · %s: bruto %s, perda %s, liquido %s'
              % (a['ingrediente'], numero(a['peso_bruto']), numero(a['perda_impressa']),
                 numero(a['peso_liquido'])))
            w('    bruto - perda = %s, e o liquido impresso e %s — nao fecha.'
              % (numero(a['bruto_menos_liquido']), numero(a['peso_liquido'])))
            w('    bruto / liquido = 1,25, que e exatamente o Fator de Correcao — fecha.')
    w('')
    w('As 31 divergencias por tipo:')
    w('  perda > 0 com PesoBruto IGUAL ao Peso Liquido (perda que nao existe) .. %d'
      % sum(1 for a in bruto['achados'] if a['tipo'] == 'perda_manipulacao_divergente'
            and abs(q(a['bruto_menos_liquido'])) < 1e-12))
    w('  perda = 0 com PesoBruto MAIOR que o Peso Liquido (perda nao anotada) .. %d'
      % sum(1 for a in bruto['achados'] if a['tipo'] == 'perda_manipulacao_divergente'
            and q(a['bruto_menos_liquido']) > 1e-12 and abs(q(a['perda_impressa'])) < 1e-12))
    w('  perda = 0 com Peso Liquido MAIOR que o PesoBruto (impossivel) ......... %d'
      % sum(1 for a in bruto['achados'] if a['tipo'] == 'perda_manipulacao_divergente'
            and q(a['bruto_menos_liquido']) < -1e-12))
    w('  perda > 0 e diferente de bruto - liquido .............................. %d'
      % sum(1 for a in bruto['achados'] if a['tipo'] == 'perda_manipulacao_divergente'
            and abs(q(a['perda_impressa'])) > 1e-12
            and abs(q(a['bruto_menos_liquido'])) > 1e-12))
    w('')
    w('E uma impossibilidade de outra natureza, que nao e divergencia de conta:')
    w('a perda declarada MAIOR que o PesoBruto da propria linha — perder mais do que')
    w('entrou. Em 165 linhas da planilha ela acontece em:')
    maiores = [a for a in bruto['achados']
               if a['tipo'] == 'perda_manipulacao_divergente'
               and q(a['perda_impressa']) > q(a['peso_bruto'])]
    for a in maiores:
        w('  %s · %s · linha %s: bruto %s, perda %s = %sx o proprio peso bruto'
          % (a.get('bloco', a.get('aba', '?')), a['ingrediente'].strip(), a.get('linha', '?'),
             numero(a['peso_bruto']), numero(a['perda_impressa']),
             numero(arred(q(a['perda_impressa']) / q(a['peso_bruto']), 2))))
    w('  total: %d de 165. Dinheiro hoje: zero, porque a `Perda manipulacao` nao'
      % len(maiores))
    w('  entra em formula nenhuma — e e mais um argumento para nao usa-la.')

    titulo(4, 'perda_percentual, E A PROVA DA VOLTA')
    w('    quantidade       = Peso Liquido')
    w('    perda_percentual = (1 - Peso Liquido / PesoBruto) x 100 = (1 - 1/fator) x 100')
    w('')
    w('A volta, na precisao do schema (quantidade numeric(14,4), perda numeric(6,3)):')
    w('    quantidade_bruta = round(quantidade / (1 - perda/100), 4)  ==  PesoBruto ?')
    w('')
    w('  no extrator, sobre as 165 linhas da planilha ...... %d exatas, %d falhas, %d impossiveis'
      % (bc['volta_do_perda_percentual_ok'], bc['volta_do_perda_percentual_falhou'],
         bc['liquido_maior_que_bruto']))
    w('  no normalizador, sobre os itens gravados .......... %d exatas, %d pela embalagem, %d falhas'
      % (c['volta_ok'], c['volta_ok_pela_embalagem'], c['volta_falhou']))
    w('')
    w('A tabela fator -> perda, que e o vocabulario inteiro da planilha:')
    fat = {}
    for f in saida['fichas']:
        for i in f['itens']:
            fc = i['planilha']['fator_correcao']
            fat.setdefault(round(q(fc), 12) if fc is not None else 1.0, set()).add(
                i['perda_percentual'])
    for prod in saida['produtos_novos']:
        pass
    for fc in sorted(fat):
        w('  fator %-20s -> perda %s %%' % (numero(fc, 12), ', '.join(
            numero(x, 3) for x in sorted(fat[fc]))))
    w('')
    w('AS 5 LINHAS QUE A VOLTA NAO PODE FECHAR, e o que eu fiz com elas:')
    w('')
    for a in bruto['achados']:
        if a['tipo'] != 'liquido_maior_que_bruto':
            continue
        w('  aba %-32s · %s' % (a['aba'].strip(), a['ingrediente']))
        w('      PesoBruto %s · Peso Liquido %s · fator %s · perda seria %s %%'
          % (numero(a['peso_bruto']), numero(a['peso_liquido']),
             numero(a['fator_correcao']), numero(a['perda_percentual_seria'], 1)))
    w('')
    w('  Peso Liquido MAIOR que PesoBruto pediria perda_percentual NEGATIVA, e o')
    w('  check (perda_percentual >= 0) do schema recusa. Gravei quantidade = PesoBruto')
    w('  (0,12) e perda = 0, por quatro razoes e nao por preferencia:')
    w('')
    w('    1. perda de limpeza nao cria massa: liquido > bruto e impossivel;')
    w('    2. o check do schema recusa o negativo, entao nao ha a opcao de gravar 0,15')
    w('       com perda -25%;')
    w('    3. o MESMO produto aparece 0,12 / 0,12 com fator 1 em SEIS outros')
    w('       blocos da mesma planilha: 0,12 e o padrao da casa, 0,15 e a excecao;')
    w('    4. e a razao que fecha a conta: a col10 — a coluna que a Resumo publica e')
    w('       que a nossa vista reproduz — ja calcula 0,12 x 3,15 = R$ 0,378, identico')
    w('       aos seis blocos certos. No dinheiro, a planilha ja se comporta como 0,12.')
    w('')
    w('  Cada um dos 5 itens leva o aviso na observacao.')

    titulo(5, 'rendimento: por que 1 e nao 0,655')
    w('O schema calcula custo_porcao = custo_total / rendimento. Gravar 0,655 faria')
    w('o SCHNITZEL custar 1/0,655 = 1,527 vez o custo dos seus itens: +52,7%.')
    w('')
    w('A PLANILHA NAO FAZ ISSO, e a prova sao dois contadores:')
    w('    Custo porcao = Custo total / PESO PORCAO ... %d de 48'
      % bc['custo_porcao_e_custo_total_sobre_peso_porcao'])
    w('    Custo porcao = Custo total / RENDIMENTO .... %d de 48'
      % bc['custo_porcao_e_custo_total_sobre_rendimento'])
    w('')
    w('Nos 13 pratos o Peso Porcao e 1, entao Custo porcao = Custo total — e e esse')
    w('numero, nao o dividido por 0,655, que a Resumo publica como Custo bruto e')
    w('multiplica pelos cinco indices. Conferido: o Custo bruto da Resumo e o Custo')
    w('total col10 do primeiro bloco da aba nas 13 linhas.')
    w('')
    w('E O QUE E, ENTAO, O "Rendimento (porcoes)"? E o PESO do prato em quilos. Ele e')
    w('exatamente a soma dos Pesos Liquidos nos 13 pratos (%d de 13), e vale 1 nos 11'
      % bc['rendimento_igual_ao_peso_liquido_total'])
    w('blocos de sub-receita. O rotulo "(porcoes)" esta errado na planilha.')
    w('')
    w('  %-34s %-10s %-10s %-12s' % ('prato', 'rotulado', 'peso liq', 'coerente?'))
    for f in saida['fichas']:
        pl = f['planilha']
        w('  %-34s %-10s %-10s %s'
          % (f['nome'][:34], numero(pl['rendimento_rotulado'], 4),
             numero(pl['peso_do_prato_kg'], 4),
             'sim' if abs(q(pl['rendimento_rotulado']) - q(pl['peso_do_prato_kg'])) < 1e-9
             else 'NAO'))
    w('')
    w('A PLANILHA E COERENTE? Sim, e por uma razao fragil: ela nunca divide pelo')
    w('rendimento. Se alguem na casa trocar a formula de Custo porcao de "/Peso')
    w('Porcao" para "/Rendimento", os 13 precos da Resumo mudam de uma vez e o')
    w('GNOCCHI (rendimento 1,375) vai para BAIXO enquanto os outros 12 sobem.')
    w('')
    w('Gravei rendimento = 1 e unidade_rendimento = PORCAO nas 13, e o peso do prato')
    w('foi para a descricao, onde e informacao e nao divisor.')

    titulo(6, 'O NOME DO PRATO: as duas armadilhas de nome, resolvidas com prova')
    w('A chave NAO pode ser o nome do bloco, e nao pode ser o nome da aba.')
    w('')
    w('ARMADILHA 1 · dois blocos com o mesmo nome em abas diferentes')
    w('')
    for f in saida['fichas']:
        if chave(f['planilha']['nome_do_bloco']) == chave('FILÉ DE FRANGO COM FRITAS'):
            w('  aba %-32s bloco %-26s %2d itens  col10 R$ %s'
              % (f['planilha']['aba'].strip(), f['planilha']['nome_do_bloco'],
                 len(f['itens']), brl(f['planilha']['custo_total_col10'])))
    w('')
    w('  Sao pratos DIFERENTES com nome igual: 10 ingredientes contra 7, e custos')
    w('  R$ 5,6787 contra R$ 5,8727. A Resumo lista os DOIS, com nomes distintos')
    w('  (FILÉ FRANGO EMPANADO COM FRITAS e FILÉ FRANGO FRITAS) e com esses dois')
    w('  custos. Entao nenhum atropela o outro: a prova e que os dois custos da')
    w('  Resumo aparecem, cada um ligado a sua aba, e os 13 custos da Resumo casam')
    w('  um a um com a col10 de um primeiro bloco diferente.')
    w('')
    w('ARMADILHA 2 · nome de bloco que nao bate com a aba — e sao CINCO, nao uma')
    w('')
    w('  %-32s %-28s %s' % ('aba', 'nome do bloco', 'nome na Resumo'))
    for a in bruto['achados']:
        if a['tipo'] == 'nome_do_bloco_diferente_do_nome_vendido':
            w('  %-32s %-28s %s' % (a['aba'][:32], a['nome_do_bloco'][:28], a['nome_na_resumo']))
    w('')
    w('  A aba FILÉ DE PEIXE COM PURÊ e a que o briefing cita, e a decisao e a Resumo:')
    w('  ela lista FILÉ DE PEIXE COM PURÊ e e a lista do que a casa vende. Mas a prova')
    w('  nao e a autoridade da Resumo — e o INGREDIENTE: a aba PURÊ leva')
    w('  `purê de batata mp` e `arroz branco de brocolis mp`; a aba LEGUMES leva')
    w('  `salada de legumes`. O prato da aba PURÊ tem pure dentro. O nome do bloco e')
    w('  resto de uma aba copiada.')
    w('')
    w('ARMADILHA 3 (que o briefing nao viu) · o nome da ABA tambem nao serve')
    w('')
    for a in bruto['achados']:
        if a['tipo'] == 'nome_da_aba_diferente_do_nome_vendido':
            w('  aba   "%s"  (%d caracteres — o limite do Excel)'
              % (a['aba'], a['tamanho_do_nome_da_aba']))
            w('  Resumo "%s"  (%d caracteres)'
              % (a['nome_na_resumo'], len(a['nome_na_resumo'])))
    w('')
    w('  O Excel corta nome de aba em 31 caracteres e comeu o "A" final. Quem usar o')
    w('  nome da aba como nome do prato grava um nome truncado — e truncado nao perde')
    w('  um centavo, exatamente como o nome mutilado dos drinques, e por isso passa')
    w('  em todas as conferencias de total.')
    w('')
    w('A SOLUCAO: o nome vem da Resumo, e a ligacao Resumo -> aba e feita por TRES')
    w('caminhos que tem de concordar — posicao, nome normalizado e o Custo bruto')
    w('contra a col10 do bloco. Concordam em %d de 13; a decima terceira e justamente'
      % bc['resumo_tres_caminhos_ok'])
    w('a aba truncada, onde o nome discorda e os outros dois caminhos decidem.')

    titulo(7, 'O DE-PARA, escrito a mao, linha por linha')
    w('%d linhas de ingrediente + %d de sub-receita + %d de produto novo.'
      % (c['linhas_do_depara'], c['linhas_de_sub_receita'],
         c['linhas_de_produto_novo_sem_receita']))
    w('')
    n_dist = bc['ingredientes_distintos_normalizados']
    n_sub = c['linhas_de_sub_receita']
    n_exato = sum(1 for d in saida['depara'] if d['produto'] in por_nome
                  and chave(d['produto']) == chave(d['grafia']))
    w('Dos %d nomes distintos da planilha, %d sao sub-receita dela e %d casam com o'
      % (n_dist, n_sub, n_exato))
    w('catalogo por nome identico (ignorando caixa e acento). Os outros %d foram'
      % (n_dist - n_sub - n_exato))
    w('escritos um a um. %d dessas grafias viraram %d produtos novos por nao'
      % (c['linhas_de_produto_novo_sem_receita'], c['produtos_novos_sem_catalogo']))
    w('existirem no catalogo (duas grafias caem no mesmo produto: `leitosa` e')
    w('`leitiosa` de empanamento).')
    w('')
    w('O desempate, em ordem de forca: custo exato > nome > exclusao > escolha forcada.')
    w('Semelhanca automatica so PROPOS; nenhuma linha entrou sem os dois nomes a vista.')
    w('')
    for d in saida['depara']:
        p = por_nome.get(d['produto'])
        w('  %-30s -> %-34s [%s]' % (d['grafia'], d['produto'], d['forca']))
        if p:
            w('      nosso: %-5s R$ %-10s %s' % (p['unidade'], numero(p['custo_medio']),
                                                 p['categoria']))
        w('      %s' % d['motivo'])
        w('')

    w('A RAZAO: o custo do nosso catalogo dividido pelo `Custo compra` da planilha,')
    w('por insumo. E a melhor evidencia que existe de que o de-para NAO tem erro')
    w('sistematico de produto: se um nome estivesse casando com o produto errado, ou')
    w('com a embalagem errada, a mediana nao ficaria em 1.')
    w('')
    w('Para os dois produtos vendidos por embalagem a razao e calculada POR UNIDADE')
    w('DA RECEITA (o preco da lata dividido pelos litros dela), porque comparar o')
    w('preco de uma lata de 5 L com o preco de um litro daria 4,1x e nao diria nada.')
    w('')
    razoes = []
    novos = {x['nome']: x['custo'] for x in saida['produtos_novos']}
    vistos_r = {}
    for f in saida['fichas']:
        for i in f['itens']:
            if i['produto'] in novos:
                continue
            vistos_r.setdefault((i['depara']['grafia'].strip(), i['produto']),
                                (q(i['planilha']['custo_compra']), q(i['custo_unitario'])))
    for pr in saida['produtos_novos']:
        for l in pr.get('receita_no_nosso_catalogo', []):
            if l['produto'] in novos:
                continue
            vistos_r.setdefault((l['grafia_na_planilha'].strip(), l['produto']),
                                (q(l['custo_compra_na_planilha']),
                                 q(l['custo_unitario_catalogo'])))
    for (g, prod), (cp, cu) in vistos_r.items():
        efetivo = cu / EMBALAGEM[prod][0] if prod in EMBALAGEM else cu
        razoes.append(((efetivo / cp) if cp else 0.0, g, prod, cp, efetivo,
                       prod in EMBALAGEM))
    razoes.sort(reverse=True)
    w('%-28s %-30s %9s %9s %7s' % ('planilha', 'nosso catalogo', 'planilha', 'nosso', 'razao'))
    w('-' * 78)
    for rz, g, prod, cp, cu, emb in razoes:
        w('%-28s %-30s %9s %9s %7.3f%s'
          % (g[:28], prod[:30], numero(cp, 2), numero(cu, 2), rz,
             '  (por unidade da receita)' if emb else ''))
    valores = sorted(x[0] for x in razoes)
    w('')
    w('  insumos distintos ................... %d' % len(valores))
    w('  MEDIANA da razao ................... %.3f' % valores[len(valores) // 2])
    w('  custo EXATO (dentro de 0,5%%) ........ %d'
      % sum(1 for x in valores if abs(x - 1) <= 0.005))
    w('  dentro de 0,8x a 1,25x ............. %d' % sum(1 for x in valores
                                                        if 0.8 <= x <= 1.25))
    w('  FORA de 0,5x a 2x .................. %d' % sum(1 for x in valores
                                                        if x < 0.5 or x > 2))
    w('')
    w('  Os que ficam fora de 0,5x a 2x, um a um — e nenhum deles e erro de')
    w('  mapeamento; sao preco de compra de datas e fontes diferentes:')
    for rz, g, prod, cp, cu, emb in razoes:
        if 0.5 <= rz <= 2:
            continue
        w('    %-26s -> %-30s R$ %s -> R$ %s = %.3f'
          % (g[:26], prod[:30], numero(cp, 2), numero(cu, 2), rz))

    titulo(8, 'OS PRODUTOS NOVOS: 9 sub-receitas + 6 sem catalogo')
    w('A sub-receita vira PRODUTO e nao ficha (o modulo nao tem ficha dentro de')
    w('ficha), com custo_fixo = true, setor %s e categoria que ja existe.' % SETOR_DOS_NOVOS)
    w('')
    w('AS 9 SUB-RECEITAS — custo calculado RECURSIVAMENTE pelo nosso catalogo.')
    w('')
    for p in saida['produtos_novos']:
        if p['origem'] != 'sub_receita_da_planilha':
            continue
        b = next((x for x in bruto['blocos']
                  if x.get('e_sub_receita') and x['nome_sub_receita'] == p['bloco']), None)
        w('  %-30s [%s] %s · %s' % (p['nome'], p['unidade'], p['categoria'], p['setor']))
        w('      custo R$ %s por %s   (a planilha calculava R$ %s)'
          % (numero(p['custo'], 6), p['unidade'],
             numero(q(b['cabecalho']['custo_porcao'][1]), 4) if b else '?'))
        w('      %s' % p['motivo'])
        if b:
            w('      a conta, pelo NOSSO catalogo (lote de %s %s):'
              % (numero(b['peso_porcao']), p['unidade']))
            total = 0.0
            for ordem, it in enumerate(b['itens'], start=1):
                g = k_ing(it['ingrediente'])
                alvo = (SUB_RECEITA_PRODUTO.get(it.get('sub_receita'), {}) or {}).get('nome') \
                    or (PRODUTOS_NOVOS_SEM_RECEITA.get(g, {}) or {}).get('nome') \
                    or (DE_PARA[g][0] if g in DE_PARA else None)
                cu = _custo_declarado(alvo, saida, por_nome)
                qt = q(it['peso_bruto'])
                if alvo in EMBALAGEM:
                    qt = arred(qt / EMBALAGEM[alvo][0], 4)
                parcela = arred(qt * cu, 4)
                total += parcela
                w('          %-10s %-32s x R$ %-10s = R$ %s'
                  % (numero(qt), (alvo or '?')[:32], numero(cu, 6), numero(parcela, 4)))
                w('                     (planilha: %s @ R$ %s)'
                  % (it['ingrediente'].strip(), numero(q(it['custo_compra']), 4)))
            w('          %-10s %-32s   R$ %s' % ('', 'TOTAL DO LOTE', numero(arred(total, 4))))
            w('          %-10s %-32s   R$ %s por %s'
              % ('', '/ Peso Porcao = %s' % numero(b['peso_porcao']),
                 numero(p['custo'], 6), p['unidade']))
        w('')
    w('AS 6 SEM CATALOGO — custo vindo do `Custo compra` DA PLANILHA, porque a')
    w('planilha nao da a receita e nao ha nada para recalcular. ESTE CUSTO E DA')
    w('PLANILHA, E NAO DO NOSSO ESTOQUE, e e a unica excecao a regra do briefing.')
    w('')
    for p in saida['produtos_novos']:
        if p['origem'] != 'ingrediente_sem_catalogo':
            continue
        usos = sum(1 for f in saida['fichas'] for i in f['itens'] if i['produto'] == p['nome'])
        usos += sum(1 for b in bruto['blocos'] if b.get('e_sub_receita')
                    for i in b['itens'] if k_ing(i['ingrediente']) in p['grafias'])
        w('  %-30s [%s] %s · %s' % (p['nome'], p['unidade'], p['categoria'], p['setor']))
        w('      custo R$ %s  <<< DA PLANILHA' % numero(p['custo'], 4))
        w('      grafias: %s' % ', '.join(repr(g) for g in p['grafias']))
        w('      usado em %d linhas de ingrediente' % usos)
        w('      %s' % p['motivo'])
        w('')

    titulo(9, 'A SUB-RECEITA REPETIDA EM ABAS DIFERENTES: UM produto, e as copias NAO divergem')
    w('Duas sub-receitas aparecem em duas abas cada. O briefing manda virar UM produto')
    w('e avisa que divergencia entre as copias e achado. Comparei as copias item a')
    w('item (nome, PesoBruto, Peso Liquido, unidade, Custo compra) e cabecalho a')
    w('cabecalho (Custo total nas duas colunas, Peso Porcao):')
    w('')
    for nome, d in saida['copias_de_sub_receita'].items():
        w('  %-24s abas: %s' % (nome, ' + '.join(d['abas'])))
        w('      itens identicos ..... %s' % ('SIM' if d['itens_identicos'] else 'NAO — ACHADO'))
        w('      cabecalho identico .. %s' % ('SIM' if d['cabecalho_identico'] else 'NAO — ACHADO'))
    w('')
    w('As copias sao identicas nas duas. Nao e achado — e e uma boa noticia: as duas')
    w('abas foram copiadas uma da outra e ninguem editou uma das copias depois. Cada')
    w('uma virou UM produto, consumido por duas fichas.')

    titulo(10, 'CONFERENCIA DE CUSTO: o nosso catalogo contra a planilha')
    w('A planilha e CONFERENCIA, nunca fonte. A coluna de comparacao e a col10')
    w('RECALCULADA (PesoBruto x Custo compra), e nao a impressa, porque as 8 linhas')
    w('de sub-receita tem col10 digitada a mao (secao 2).')
    w('')
    w('%-34s %10s %10s %10s %8s' % ('prato', 'NOSSO', 'Resumo', 'col10 rec', 'dif %'))
    w('-' * 78)
    linhas_dif = []
    for f in saida['fichas']:
        nosso = q(f['custo_do_nosso_catalogo'])
        pla = q(f['planilha']['custo_bruto_da_resumo'])
        rec = q(f['planilha']['custo_col10_recalculado'])
        dif = (nosso / rec - 1.0) * 100.0 if rec else None
        linhas_dif.append((abs(dif) if dif is not None else -1, f, nosso, pla, rec, dif))
    for _, f, nosso, pla, rec, dif in sorted(linhas_dif, key=lambda x: -x[0]):
        w('%-34s %10s %10s %10s %8s'
          % (f['nome'][:34], brl(nosso), brl(pla), brl(rec),
             ('%+.1f' % dif) if dif is not None else '-'))
    w('-' * 78)
    w('%-34s %10s %10s %10s' % ('SOMA', brl(r['custo_total_das_fichas']),
                                brl(r['custo_da_planilha_somado']),
                                brl(r['custo_col10_recalculado_somado'])))
    w('')
    difs = [abs(d) for _, _, _, _, _, d in linhas_dif if d is not None]
    difs.sort()
    if difs:
        w('A DISTRIBUICAO, contada e nao resumida:')
        for faixa in (1, 5, 10, 20, 50):
            w('  dentro de +/- %2d%% ....... %d de %d' % (faixa, sum(1 for d in difs if d <= faixa),
                                                          len(difs)))
        w('  ACIMA de +/- 20%% ........ %d' % sum(1 for d in difs if d > 20))
        w('  mediana do |desvio| ..... %.1f%%' % difs[len(difs) // 2])
        w('  pior .................... %.1f%%' % difs[-1])
    w('')
    w('O Custo bruto da Resumo contra a col10 recalculada, por prato — e aqui que')
    w('aparece o SCHNITZEL, cuja soma de dinheiro nao conta as duas ultimas linhas:')
    w('')
    for f in saida['fichas']:
        pla = q(f['planilha']['custo_bruto_da_resumo'])
        rec = q(f['planilha']['custo_col10_recalculado'])
        if abs(pla - rec) < 0.005:
            continue
        w('  %-34s Resumo R$ %-10s  col10 recalculada R$ %-10s  falta R$ %s'
          % (f['nome'][:34], brl(pla), brl(rec), brl(rec - pla)))

    titulo(11, 'OS ACHADOS DA PLANILHA, com a aritmetica')
    n = 0

    n += 1
    w('A%d · O SCHNITZEL PERDE R$ 0,6022 DE INGREDIENTE NA PROPRIA SOMA' % n)
    w('')
    for a in bruto['achados']:
        if a['tipo'] != 'linha_total_nao_e_a_soma_das_linhas' or 'soma_so_as_primeiras' not in a:
            continue
        w('  bloco %s (aba %s), coluna %s:' % (a['bloco'], a['aba'].strip(), a['coluna']))
        w('    soma das %d linhas .. R$ %s' % (len(a['de_fora']) + a['soma_so_as_primeiras'],
                                               brl(a['soma_das_linhas'])))
        w('    TOTAL impresso ..... R$ %s' % brl(a['total_impresso']))
        w('    o TOTAL soma so as %d PRIMEIRAS linhas; de fora ficaram:'
          % a['soma_so_as_primeiras'])
        for d in a['de_fora']:
            w('        linha %-3d %-26s R$ %s' % (d['linha'], d['ingrediente'], brl(d['valor'])))
    w('')
    w('  As colunas de PESO do mesmo bloco somam as 10 linhas (TOTAL bruto 0,675 e')
    w('  liquido 0,655 fecham com a soma); so as duas colunas de DINHEIRO param na')
    w('  oitava. E intervalo de SUM curto, nao ingrediente esquecido.')
    w('')
    w('  CONSEQUENCIA EM DINHEIRO: o Custo bruto do SCHNITZEL na Resumo e R$ 4,665 e')
    w('  deveria ser R$ 5,2672 — 12,9% a menos. Os cinco precos dele estao 12,9%')
    w('  baixos: no indice 5 a Resumo diz R$ 23,33 e a conta certa da R$ 26,34.')
    w('  E o SCHNITZEL e justamente o exemplo que o briefing usa.')
    w('')

    n += 1
    w('A%d · O GNOCCHI LEVA 1 KG ONDE O NOME DIZ 120 G' % n)
    w('')
    gn = next((f for f in saida['fichas'] if 'GNOCCHI' in chave(f['nome'])), None)
    if gn:
        it = next((i for i in gn['itens'] if 'CARNE ASSADA' in chave(i['depara']['grafia'])), None)
        w('  A planilha: `Carne assada 120gr`, PesoBruto 1, Unidade KG, Custo compra')
        w('  R$ 7,97, col10 R$ 7,97 — 61,7%% do custo do prato (R$ 12,92).')
        w('')
        w('  O catalogo resolve sem chute: CARNE ASSADA SANDUICHE (120g), unidade UND,')
        w('  custo R$ 7,97 — IGUAL ao Custo compra, ao centavo. Entao o "1" e UMA')
        w('  porcao de 120 g e o rotulo KG da planilha e que esta errado.')
        w('')
        w('  A confirmacao vem do peso do prato: os outros 12 pesam de 0,575 a 0,700 kg')
        w('  e o GNOCCHI pesa 1,375 — o unico fora, e a unica linha que explica o')
        w('  excesso e a que diz 1 "KG" de carne. Com a porcao no lugar, o prato pesa')
        w('  0,495 kg, dentro da familia.')
        if it:
            w('')
            w('  Gravado: quantidade %s %s de %s, custo R$ %s.'
              % (numero(it['quantidade']), it['unidade'], it['produto'], numero(it['custo'])))
    w('')

    n += 1
    w('A%d · OS 7 OVOS QUE PESAVAM 0,14 KG' % n)
    w('')
    w('  BASE DE GNOCCHI, linha `Ovo branco`: PesoBruto 7, Peso Liquido 0,14,')
    w('  Unidade KG, Fator de Correcao 50. Sete quilos de ovo rendendo 140 gramas.')
    w('')
    w('  As duas colunas falam de coisas diferentes: o 7 e uma CONTAGEM e o 0,14 e um')
    w('  peso. A prova de que o 7 e o numero certo esta em tres lugares:')
    w('    · o Custo compra R$ 0,52 e o preco de UM ovo — e o mesmo que a mesma')
    w('      planilha usa nas linhas `ovo` das receitas MASSA EMPADÃO (3 und) e')
    w('      EMPADÃO DE FRANGO (2 UND);')
    w('    · o nosso OVO BRANCO se cadastra em UND, a R$ 0,67;')
    w('    · a col10 da planilha calcula 7 x 0,52 = R$ 3,64, e e esse numero que')
    w('      entra no Custo total da BASE DE GNOCCHI (R$ 18,1008) e portanto no')
    w('      preco do prato. A planilha ja cobra 7 ovos.')
    w('')
    w('  Gravei 7 UND. Gravar 0,14 KG faria mv_fator_para_produto devolver NULO')
    w('  (massa nao converte para unidade e conteudo_quantidade esta vazio), o item')
    w('  viraria unidade_incompativel com custo NULO e a propria carga se recusaria')
    w('  a aplicar — a licao A6/N3 dos drinques, medida la e valida aqui.')
    w('')

    n += 1
    w('A%d · DOIS BLOCOS COM A LINHA TOTAL DE PESO QUE NAO FECHA' % n)
    w('')
    for a in bruto['achados']:
        if a['tipo'] != 'linha_total_nao_e_a_soma_das_linhas' or 'soma_so_as_primeiras' in a:
            continue
        w('  %-22s coluna %-12s soma das linhas %-10s TOTAL impresso %s'
          % (a['bloco'], a['coluna'], numero(a['soma_das_linhas']), numero(a['total_impresso'])))
    w('')
    w('  MASSA EMPADÃO: a soma da 4,52 e o TOTAL diz 1,65, porque a linha `ovo` tem')
    w('  3 (unidades) numa coluna somada em quilo. O TOTAL impresso, 1,65 kg, e o peso')
    w('  real do lote e e ele que o Custo porcao usa como divisor — esta certo.')
    w('  EMPADÃO DE FRANGO: a soma da 6,0 e o TOTAL diz 4 (bruto) e 3,6 (liquido),')
    w('  pelo mesmo motivo (2 ovos) mais 0,4 kg de perda de forno que nenhuma linha')
    w('  anota. Os dois TOTAIS de DINHEIRO desses blocos fecham, e e o dinheiro que')
    w('  vai para a ficha.')
    w('')

    n += 1
    w('A%d · AS 5 LINHAS COM PESO LIQUIDO MAIOR QUE O BRUTO' % n)
    w('  Secao 4, com as quatro razoes da decisao.')
    w('')

    n += 1
    w('A%d · A `Perda manipulacao` CONTRADIZ AS OUTRAS DUAS COLUNAS EM 31 LINHAS' % n)
    w('  Secao 3.')
    w('')

    n += 1
    w('A%d · DUAS LINHAS SEM FATOR DE CORRECAO' % n)
    w('')
    for a in bruto['achados']:
        if a['tipo'] == 'fator_de_correcao_vazio':
            w('  %-22s %-22s bruto %s = liquido %s'
              % (a['bloco'], a['ingrediente'], numero(a['peso_bruto']),
                 numero(a['peso_liquido'])))
    w('  Nas duas o bruto e igual ao liquido, entao o fator seria 1 e a perda 0 — a')
    w('  celula vazia nao esconde nada. Gravado perda 0.')
    w('')

    n += 1
    w('A%d · UMA LINHA COM A CELULA UNIDADE VAZIA, e e a que a varredura do briefing perdeu' % n)
    w('  Secao 1.')
    w('')

    n += 1
    w('A%d · INGREDIENTE COM UNIDADE DIVERGENTE DENTRO DA PROPRIA PLANILHA' % n)
    w('')
    for a in bruto['achados']:
        if a['tipo'] == 'ingrediente_com_unidade_divergente':
            w('  %-28s unidades na planilha: %s' % (a['ingrediente'], a['unidades']))
    w('  `farinha de trigo` aparece em KG em quatro linhas e em L numa (MINI ORELHA):')
    w('  farinha medida em litro. A unidade gravada e a do nosso cadastro, KG, nas 5.')
    w('')

    n += 1
    w('A%d · O CUSTO DA SUB-RECEITA QUE ENTRA NO PRATO NAO E O MESMO QUE A SUB-RECEITA SOMA' % n)
    w('')
    w('  A ligacao de 11 linhas de ingrediente a 9 blocos de sub-receita foi provada')
    w('  pelo numero: provadas pelo Custo porcao col9 %d, pelo col10 %d, pelo col9'
      % (bc['sub_receita_provada_por_col9'], bc['sub_receita_provada_por_col10']))
    w('  arredondado a dois decimais %d, sem prova %d.'
      % (bc['sub_receita_provada_por_col9_arredondado'], bc['sub_receitas_sem_prova']))
    w('')
    w('  Mas as tres formas serem necessarias E o achado: a planilha nao usa um')
    w('  criterio so. Oito linhas pegam o Custo porcao da col9 (o custo SEM o fator');
    w('  de correcao da sub-receita), uma (`Base de gnocchi`) pega o da col10, e uma')
    w('  (`guarnição à francesa`) pega o da col9 ARREDONDADO a R$ 11,63 quando a')
    w('  sub-receita soma R$ 11,634. Tres criterios em nove ligacoes.')
    w('')
    w('  Consequencia: o prato consome a sub-receita a um custo que NAO inclui a perda')
    w('  de limpeza dela, em 8 das 9. No nosso banco isso nao acontece — o custo do')
    w('  produto de sub-receita e calculado pelo PesoBruto dos ingredientes dela')
    w('  (secao 8), que e a conta certa.')
    w('')

    n += 1
    w('A%d · O CATALOGO TEM PRODUTOS QUE PARECEM SER O MESMO QUE ESTAS SUB-RECEITAS' % n)
    w('')
    for nome_cat, nota in (
            ('MASSA DE GNOCCHI', 'R$ 3,00/kg contra a BASE DE GNOCCHI da planilha; '
                                 'a da planilha leva manteiga e parmesao'),
            ('EMPADA DE FRANGO', 'custo R$ 0,00 no catalogo; empada e individual e '
                                 'empadao e a torta, mas vale reconciliar'),
            ('PURE DE BATATA', 'usado pelo de-para — nao e duplicata, e a prova de que '
                               'a casa ja cadastra preparo de cozinha como produto')):
        p = por_nome.get(nome_cat)
        if p:
            w('  %-24s %-5s R$ %-10s %-22s  %s'
              % (p['nome'], p['unidade'], numero(p['custo_medio']), p['categoria'], nota))
    w('')

    titulo(12, 'UNIDADE: o que foi gravado, e por que nao a da planilha')
    w('A unidade gravada e SEMPRE a do nosso cadastro. Gravar a da planilha faria')
    w('mv_fator_para_produto devolver NULO quando as familias nao se convertem (KG')
    w('para UND), o item viraria unidade_incompativel, o custo viria NULO e a carga')
    w('se recusaria a aplicar. Isso foi medido nos drinques (laudo 3, N3).')
    w('')
    w('%-28s %-8s %-8s %s' % ('produto', 'planilha', 'nosso', 'o que eu fiz'))
    w('-' * 78)
    vistos = set()
    for f in saida['fichas']:
        for i in f['itens']:
            un_pl = (i['planilha']['unidade'] or '(vazia)').strip().upper()
            if un_pl == i['unidade'].upper():
                continue
            k = (i['produto'], un_pl)
            if k in vistos:
                continue
            vistos.add(k)
            if i['produto'] in EMBALAGEM:
                acao = 'fracao da embalagem de %s %s' % (
                    numero(EMBALAGEM[i['produto']][0]), EMBALAGEM[i['produto']][1])
            elif k_ing(i['depara']['grafia']) in CONTAGEM:
                acao = 'o numero da planilha e contagem'
            else:
                acao = 'gravado %s + aviso na observacao' % i['unidade']
            w('%-28s %-8s %-8s %s' % (i['produto'][:28], un_pl, i['unidade'], acao))
    w('')
    # Contado por duas marcas, e nao por um pedaco de frase: a grafia que esta
    # em `GRAFIAS_EM_UND` (o ingrediente em UND aparece na propria linha) e a
    # lista `produtos_em_und_abaixo` (o ingrediente em UND esta dentro de um
    # preparo). O primeiro laudo disse 13 contando frase, e eram 3.
    direto = [i for f in saida['fichas'] for i in f['itens']
              if k_ing(i['depara']['grafia']) in GRAFIAS_EM_UND]
    herdado = [i for f in saida['fichas'] for i in f['itens'] if i['produtos_em_und_abaixo']]
    w('Os itens que levam aviso de unidade na observacao: %d — %d na propria linha '
      'e %d herdados de preparo.' % (len(direto) + len(herdado), len(direto), len(herdado)))
    for i in direto:
        w('  direto   %-26s %s' % (i['produto'][:26], i['depara']['grafia'].strip()))
    for i in herdado:
        w('  herdado  %-26s leva %s' % (i['produto'][:26],
                                        ', '.join(i['produtos_em_und_abaixo'])))

    titulo(13, 'AS 13 FICHAS, ITEM A ITEM')
    for f in saida['fichas']:
        pl = f['planilha']
        w('')
        w('-' * 78)
        w('%s   [%s]' % (f['nome'], f['grupo']))
        w('-' * 78)
        w('  planilha: aba "%s", bloco "%s", linha %d'
          % (pl['aba'].strip(), pl['nome_do_bloco'], pl['linha_do_cabecalho']))
        w('  rendimento gravado 1 · peso do prato %s kg · cmv_alvo %d · preco_venda 0'
          % (numero(pl['peso_do_prato_kg']), f['cmv_alvo']))
        w('  custo NOSSO R$ %-10s  Resumo R$ %-10s  col10 recalculada R$ %s'
          % (brl(f['custo_do_nosso_catalogo']), brl(pl['custo_bruto_da_resumo']),
             brl(pl['custo_col10_recalculado'])))
        w('')
        w('  %-32s %-5s %9s %7s %9s %9s' % ('produto', 'un', 'qtd', 'perda%', 'bruta', 'custo'))
        for i in f['itens']:
            w('  %-32s %-5s %9s %7s %9s %9s'
              % (i['produto'][:32], i['unidade'], numero(i['quantidade']),
                 numero(i['perda_percentual'], 3), numero(i['quantidade_bruta']),
                 brl(i['custo'])))
            w('      planilha: %-26s bruto %-8s liq %-8s fator %-10s @ R$ %s  ->  col9 R$ %s · col10 R$ %s'
              % (i['depara']['grafia'].strip(), numero(i['planilha']['peso_bruto']),
                 numero(i['planilha']['peso_liquido']),
                 numero(q(i['planilha']['fator_correcao']), 6),
                 numero(q(i['planilha']['custo_compra']), 4),
                 brl(i['planilha']['valor_producao_col9']),
                 brl(i['planilha']['valor_preco_de_custo_col10'])))
            if 'planilha:' in (i['observacao'] or '') and ' · ' in i['observacao'][9:]:
                extra = i['observacao'].split(' · ', 2)
                if len(extra) > 2:
                    w('      aviso: %s' % extra[2])

    titulo(14, 'A `descricao`: os cinco indices, nas duas linhas de preco')
    w('Decisao da cliente: preco_venda = 0 e os cinco indices gravados na descricao,')
    w('com DUAS linhas de preco — os cinco do custo dela e os cinco do nosso custo.')
    w('')
    w('Exemplo (a primeira ficha), como ela aparece na tela:')
    w('')
    for linha in saida['fichas'][0]['descricao'].split('\n'):
        w('  | %s' % linha)
    w('')
    w('A segunda linha de preco e um RETRATO da data da carga, e o texto diz isso.')
    w('O custo vivo esta em vw_fichas_completas.custo_total, que a tela le e que')
    w('acompanha o preco real do estoque; a descricao nao se atualiza sozinha.')

    titulo(15, 'O QUE PRECISA DA CLIENTE')
    pend = [
        ('PRECO DE VENDA das 13 fichas', 'Nascem com 0, por decisao dela. Sem preco '
         'nao existe CMV nem margem — a vista devolve nulo nos dois. Os cinco indices '
         'estao na descricao de cada ficha, nas duas linhas de preco.'),
        ('O SCHNITZEL esta 12,9% barato na propria planilha',
         'A soma de dinheiro do bloco nao conta `alho batido` e `limão sciciliano` '
         '(R$ 0,6022). Corrigir o intervalo da formula SUM muda o Custo bruto de '
         'R$ 4,665 para R$ 5,2672 e os cinco precos com ele. Enquanto nao for '
         'corrigido, qualquer preco tirado da Resumo para o SCHNITZEL nasce baixo.'),
        ('O GNOCCHI leva 1 "KG" de carne assada onde o nome diz 120 g',
         'Gravei 1 UND da porcao de 120 g, porque o Custo compra R$ 7,97 e exatamente '
         'o custo da CARNE ASSADA SANDUICHE (120g) do nosso catalogo. Confirmar; se '
         'for 1 kg mesmo, o prato tem 1,375 kg de comida e custa outra coisa.'),
        ('`copalombo` -> LOMBO SUÍNO: a minha escolha mais agressiva',
         'O catalogo TEM COPA LOMBO, em duas linhas (120G e 250G), mas as duas gravam '
         'o custo da PORCAO numa unidade KG — R$ 4,30 e R$ 9,70, que dao R$ 35,83/kg e '
         'R$ 38,80/kg. Mapeei para LOMBO SUÍNO (R$ 18,90/kg, 1,11x a planilha). Se eu '
         'estiver errado, 1 ficha subestima a carne.'),
        ('`BANHA` a R$ 1,00/kg', 'Nao existe banha nem gordura no catalogo. Criei o '
         'produto com o custo da planilha, e R$ 1,00/kg e um numero redondo e '
         'implausivel. Usado em 6 blocos.'),
        ('`SAL COM PIMENTA` a R$ 2,72/kg', 'O ingrediente mais usado da planilha '
         '(17 dos 24 blocos) e uma MISTURA que nao existe no catalogo. Criei o produto '
         'com o custo dela, que e o MESMO preco do sal puro: na conta da planilha a '
         'pimenta custa zero.'),
        ('`ACÉM MP` a R$ 62,60/kg e `PERNIL MP` a R$ 36,99/kg',
         'Preparos de carne que a planilha nao detalha. Os custos sao dela, e sao '
         '2,05x e 2,66x o corte cru do nosso catalogo — compativel com perda de '
         'coccao, mas nao verificavel. Sao 70% e 66% do custo dos seus pratos.'),
        ('`ARROZ BRANCO DE BRÓCOLIS MP` a R$ 8,83/kg e `LEITOSA DE EMPANAMENTO` a R$ 7,25/kg',
         'Idem: preparos sem receita na planilha e sem nada parecido no catalogo.'),
        ('Unidade: 5 ingredientes que a planilha pesa e o nosso catalogo conta',
         'BRÓCOLIS AMERICANO, MANJERICÃO, RÚCULA HIDROPÔNICA, SALSA e VAGEM FRANCESA '
         'estao em UND no nosso cadastro e em KG na receita. Gravei a unidade do '
         'cadastro com o aviso na observacao, porque gravar KG derrubaria a carga. '
         'RESOLVER PREENCHENDO produtos.conteudo_quantidade e conteudo_unidade com o '
         'peso de 1 UND — e NAO trocando a unidade do produto para KG: medido, '
         'trocar a unidade de MANJERICÃO e SALSA apaga R$ 1,4115 de custo em 4 '
         'fichas (uma delas o drinque LIMONCELLO SPRITZ) e faz as cargas 0004 e '
         '0005 se recusarem a aplicar. O que falta e um numero: quanto pesa 1 UND '
         'de cada um dos cinco.'),
        ('produtos.conteudo_quantidade esta vazio em todo o catalogo',
         'Preenchido (5000 ML na lata de azeite, 2800 G no balde de maionese, o peso '
         'da UND do manjericao), o item deixa de precisar da conversao de fracao que '
         'eu fiz a mao e os 5 avisos de unidade desaparecem. E um campo.'),
        ('As 5 linhas de `feijão pronto` com Peso Liquido 0,15 e PesoBruto 0,12',
         'Gravei 0,12. Confirmar, e corrigir na planilha: em seis outros blocos o '
         'mesmo produto esta 0,12 / 0,12 (das 12 linhas que resolvem para FEIJÃO '
         'PRONTO: 6 a 0,12/0,12, 5 a 0,12/0,15 e 1 linha de LOTE a 1/1).'),
        ('A celula `I8` da aba FILÉ DE FRANGO COM LEGUMES esta `=C8*H8` e deveria ser `=E8*H8`',
         'E a unica celula de Valor producao fora do padrao em 165 linhas. Hoje custa '
         'ZERO porque C8 e E8 valem 0,15 nessa linha — ela e um defeito latente: no dia '
         'em que o file de frango tiver perda, a col9 passa a somar peso BRUTO e as duas '
         'colunas de valor viram a mesma coisa. Lido com openpyxl data_only=False.'),
        ('A `Perda manipulacao` nao e usada por nada e esta errada em 31 linhas',
         'Ou ela passa a alimentar o Peso Liquido (liquido = bruto - perda) ou sai da '
         'planilha. Hoje ela e uma terceira versao da verdade que ninguem le.'),
        ('O nome do prato so existe certo na aba Resumo',
         'Cinco blocos tem nome diferente do que se vende, um deles com erro de '
         'digitacao (SCHNITIZEL), e uma aba esta truncada em 31 caracteres pelo Excel. '
         'Vale renomear os blocos para o nome vendido.'),
        ('MASSA DE GNOCCHI (R$ 3,00/kg) e EMPADA DE FRANGO (R$ 0,00) no catalogo',
         'Parecem ser o mesmo que a BASE DE GNOCCHI e o EMPADÃO DE FRANGO que eu criei. '
         'Se forem, ha duplicata; se nao forem, a EMPADA DE FRANGO esta com custo zero.'),
        ('`modo_preparo` e nulo nas 13',
         'A planilha e de custo e nao traz preparo. A ficha serve ao CMV e nao ao '
         'cozinheiro enquanto isso nao for digitado.'),
        ('Precos da planilha que estao longe do nosso estoque',
         'As piores razoes do de-para, todas com o nome dos dois lados na secao 7: '
         'tomate 0,46x e 0,51x, cebola 0,51x, batata palha 0,60x, figado 0,65x, '
         'farinha de trigo 0,70x, vagem 1,76x, bacon 1,57x. Nenhuma e erro de '
         'mapeamento; sao precos de compra de datas diferentes.'),
    ]
    for i, (t, d) in enumerate(pend, start=1):
        w('%2d · %s' % (i, t))
        for linha in _quebrar(d, 72):
            w('     %s' % linha)
        w('')

    RELATORIO.write_text('\n'.join(L) + '\n', encoding='utf-8')


def _custo_declarado(nome, saida, por_nome):
    for p in saida['produtos_novos']:
        if p['nome'] == nome:
            return q(p['custo'])
    p = por_nome.get(nome)
    if not p:
        return 0.0
    return q(p.get('custo_medio')) or max(
        [q(s.get('custo')) for s in p.get('setores', []) if s.get('custo')] or [0.0])


def _quebrar(texto: str, largura: int):
    palavras, linha, saida = texto.split(), '', []
    for p in palavras:
        if len(linha) + len(p) + 1 > largura:
            saida.append(linha)
            linha = p
        else:
            linha = (linha + ' ' + p).strip()
    if linha:
        saida.append(linha)
    return saida


if __name__ == '__main__':
    sys.exit(main())
