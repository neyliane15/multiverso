#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai as fichas dos PRATOS EXECUTIVOS da planilha do Bar do Zeca Norte Shopping.

    dados/EXECUTIVOS_BDZ_NORTE_SHOPPING.xlsx  ->  dados/executivos-bruto.json

O QUE A PLANILHA E, e por que ela precisa de um extrator e nao de um `read_excel`
-------------------------------------------------------------------------------
14 abas: 13 de prato e uma `Resumo`. Cada aba de prato tem de 1 a 5 BLOCOS, e
cada bloco e uma receita completa: 5 linhas de cabecalho (duas colunas de valor)
e uma tabela de ingredientes terminada por uma linha TOTAL.

    r+0  Categoria             | Executivo   || Custo total     | <col9> | <col10>
    r+1  Preparacao            | <NOME>      || Custo porcao    | <col9> | <col10>
    r+2  Rendimento (porcoes)  | <numero>    || Indice de custo |      5 |      5
    r+3  Peso Porcao           | <numero>    || Preco de venda  | <col9> | <col10>
    r+4  Obs:                  |             || CMV             |    0,2 |    0,2
    ...
    Ingrediente | Codigo SKU | PesoBruto | Perda manipulacao | Peso Liquido |
    Unidade | Fator de Correcao | Custo compra | Valor producao | Valor preco de custo

O primeiro bloco de cada aba e o PRATO VENDIDO; os de baixo sao SUB-RECEITAS que
algum bloco consome como ingrediente. A ligacao nao e por chave: e pelo numero.
O `Custo compra` da linha de ingrediente e o `Custo porcao` do bloco homonimo —
e e isso que este extrator confere, linha por linha, em `sub_receitas`.

AS SETE RELACOES QUE ESTE ARQUIVO CONFERE, e nao presume
--------------------------------------------------------
Cada uma vira um contador no JSON. Numero que nao fecha e achado, nao ajuste.

  1. col9  == Peso Liquido x Custo compra          (o custo SEM o fator)
  2. col10 == PesoBruto    x Custo compra          (o custo COM o fator)
  3. Fator de Correcao == PesoBruto / Peso Liquido
  4. Perda manipulacao == PesoBruto - Peso Liquido
  5. a linha TOTAL == a soma das linhas de ingrediente (nas 4 colunas)
  6. o `Custo total` do cabecalho == a linha TOTAL
  7. `Custo porcao` == `Custo total` / `Peso Porcao`   <- NAO / Rendimento
     e `Preco de venda` == `Custo porcao` x `Indice de custo`
     e `CMV` == 1 / `Indice de custo`

A relacao 7 e a que decide o significado de `Rendimento (porcoes)`, e por isso
ela e conferida nas DUAS colunas de valor e nos dois divisores possiveis: o
contador diz quantos blocos fecham por `Peso Porcao` e quantos por `Rendimento`.

O NOME DO PRATO VEM DA `Resumo`, e os tres caminhos tem de concordar
--------------------------------------------------------------------
O nome do BLOCO nao serve como chave: dois blocos em abas diferentes se chamam
`FILE DE FRANGO COM FRITAS` e sao pratos diferentes, e a aba `FILE DE PEIXE COM
PURE` tem um bloco chamado `FILE DE PEIXE COM LEGUMES`. O nome da ABA tambem nao
serve sozinho: o Excel corta nome de aba em 31 caracteres, e `CARNE GUISADA  COM
BATATA CORADA` chegou truncada.

Entao o nome sai da `Resumo`, que e a lista do que a casa vende, e a ligacao de
cada linha da `Resumo` ao seu bloco e feita por TRES caminhos que tem de
concordar — posicao, nome normalizado e o `Custo bruto` contra o col10 do bloco.
`resumo_tres_caminhos_ok` conta quantas das 13 fecham pelos tres.
"""

from __future__ import annotations

import json
import sys
import unicodedata
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit('openpyxl nao esta instalado')

RAIZ = Path(__file__).resolve().parent.parent
XLSX = RAIZ / 'dados' / 'EXECUTIVOS_BDZ_NORTE_SHOPPING.xlsx'
SAIDA = RAIZ / 'dados' / 'executivos-bruto.json'

# O cabecalho da tabela de ingredientes, na ordem em que as colunas aparecem.
# Conferido coluna a coluna em todos os blocos: cabecalho diferente e achado,
# porque a posicao da coluna e o unico jeito de saber o que cada numero e.
CABECALHO = [
    'Ingrediente', 'Código SKU', 'PesoBruto', 'Perda manipulação', 'Peso Líquido',
    'Unidade', 'Fator de Correção', 'Custo compra', 'Valor produção',
    'Valor preço de custo',
]

# As cinco etiquetas da coluna 1 do cabecalho do bloco, na ordem.
ETIQUETAS_ESQ = ['Categoria', 'Preparação', 'Rendimento (porções)', 'Peso Porção', 'Obs:']
# E as cinco da coluna 7, idem.
ETIQUETAS_DIR = ['Custo total', 'Custo porção', 'Índice de custo', 'Preço de venda', 'CMV']

# Dinheiro e peso da planilha sao float de Excel, com o lixo de binario que isso
# traz (0.6950000000000002). A comparacao usa erro RELATIVO, porque os valores
# vao de 0,0136 a 85,67 e uma folga absoluta serviria mal nas duas pontas.
EPS = 1e-9

# ---------------------------------------------------------------------------
# As sub-receitas, escritas a mao: nome da linha de ingrediente -> nome do bloco.
#
# A mao porque nenhuma normalizacao liga `tutu de feijão mp` a `TUTU DE FEIJÃO
# PRETO`, e porque adivinhar aqui faria o custo de um prato depender de uma regra
# de semelhanca. Cada linha e CONFERIDA contra o numero: o `Custo compra` da
# linha tem de ser o `Custo porcao` do bloco. Linha que nao confere entra em
# `sub_receitas_sem_prova`.
# ---------------------------------------------------------------------------
SUB_RECEITAS = {
    'empadão de frango':            'EMPADÃO DE FRANGO',
    'salada da casa( individual)':  'SALADA DA CASA ( individual)',
    'massa empadão':                'MASSA EMPADÃO',
    'recheio empadão':              'RECHEIO EMPADÃO',
    'guarnição à francesa':         'GUARNIÇÃO A FRANCESA',
    'tutu de feijão mp':            'TUTU DE FEIJÃO PRETO',
    'salada de legumes':            'SALADA DE LEGUMES MP',
    'salada de maionese mp':        'SALADA DE MAIONESE',
    'base de gnocchi':              'BASE DE GNOCCHI',
}


def sem_acento(texto: str) -> str:
    return unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode()


def chave(valor) -> str:
    """Nome em forma comparavel: sem acento, maiusculo, espacos colapsados."""
    return ' '.join(sem_acento(str(valor or '')).upper().split())


def num(valor):
    """O numero da celula, ou None. Texto que nao e numero vira None, nao zero."""
    if valor is None or isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip().replace('.', '').replace(',', '.')
    try:
        return float(texto)
    except ValueError:
        return None


def q(valor) -> float:
    return 0.0 if valor is None else float(valor)


def rotulo_indice(valor: float) -> str:
    """'3' e '3.5' — chave de dicionario legivel, sem o `.0` do repr()."""
    return ('%g' % float(valor))


def arred(valor: float, casas: int) -> float:
    """Arredondamento meio-para-cima, como o `numeric` do Postgres — nao o
    meio-para-par do float do Python, que daria 0,125 -> 0,12."""
    return float(Decimal(repr(float(valor))).quantize(
        Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP))


def igual(a, b, eps: float = EPS) -> bool:
    a, b = q(a), q(b)
    return abs(a - b) <= eps * max(1.0, abs(a), abs(b))


# ---------------------------------------------------------------------------
def ler_blocos(ws, aba: str, cont: Counter, achados: list) -> list:
    """Todos os blocos de uma aba.

    O bloco e achado pela etiqueta `Categoria` na coluna 1 — ancora e nao
    posicao fixa, porque as abas tem de 1 a 5 blocos em linhas diferentes. As
    cinco etiquetas do cabecalho sao conferidas; etiqueta fora de ordem vira
    achado em vez de deslocar silenciosamente a leitura de um numero.
    """
    blocos = []
    linha = 1
    while linha <= ws.max_row:
        if chave(ws.cell(linha, 1).value) != 'CATEGORIA':
            linha += 1
            continue

        cont['blocos'] += 1
        r = linha

        for i, esperada in enumerate(ETIQUETAS_ESQ):
            lida = chave(ws.cell(r + i, 1).value)
            if lida != chave(esperada):
                achados.append({
                    'tipo': 'etiqueta_de_cabecalho_fora_de_ordem', 'aba': aba,
                    'linha': r + i, 'esperada': esperada, 'lida': str(ws.cell(r + i, 1).value),
                })
                cont['etiquetas_fora_de_ordem'] += 1
        for i, esperada in enumerate(ETIQUETAS_DIR):
            lida = chave(ws.cell(r + i, 7).value)
            if lida != chave(esperada):
                achados.append({
                    'tipo': 'etiqueta_de_valor_fora_de_ordem', 'aba': aba,
                    'linha': r + i, 'esperada': esperada, 'lida': str(ws.cell(r + i, 7).value),
                })
                cont['etiquetas_fora_de_ordem'] += 1

        bloco = {
            'aba': aba,
            'linha_cabecalho': r,
            'categoria': ws.cell(r, 3).value,
            'nome_do_bloco': ws.cell(r + 1, 3).value,
            'rendimento_planilha': num(ws.cell(r + 2, 3).value),
            'peso_porcao': num(ws.cell(r + 3, 3).value),
            'obs': ws.cell(r + 4, 3).value,
            # As duas colunas de valor do cabecalho, lado a lado, sempre as duas.
            'cabecalho': {
                'custo_total':  [num(ws.cell(r + 0, 9).value), num(ws.cell(r + 0, 10).value)],
                'custo_porcao': [num(ws.cell(r + 1, 9).value), num(ws.cell(r + 1, 10).value)],
                'indice':       [num(ws.cell(r + 2, 9).value), num(ws.cell(r + 2, 10).value)],
                'preco_venda':  [num(ws.cell(r + 3, 9).value), num(ws.cell(r + 3, 10).value)],
                'cmv':          [num(ws.cell(r + 4, 9).value), num(ws.cell(r + 4, 10).value)],
            },
            'itens': [],
            'total': None,
        }

        # A linha de cabecalho da tabela: procurada, nao presumida em r+6, porque
        # as abas tem numero diferente de linhas vazias entre uma coisa e outra.
        rt = r + 5
        while rt <= ws.max_row and chave(ws.cell(rt, 1).value) != 'INGREDIENTE':
            rt += 1
        if rt > ws.max_row:
            achados.append({'tipo': 'bloco_sem_tabela_de_ingredientes',
                            'aba': aba, 'linha': r, 'nome': str(bloco['nome_do_bloco'])})
            cont['blocos_sem_tabela'] += 1
            linha = r + 5
            continue
        bloco['linha_tabela'] = rt
        for c, esperada in enumerate(CABECALHO, start=1):
            lida = chave(ws.cell(rt, c).value)
            if lida != chave(esperada):
                achados.append({
                    'tipo': 'coluna_de_ingrediente_fora_de_ordem', 'aba': aba,
                    'linha': rt, 'coluna': c, 'esperada': esperada,
                    'lida': str(ws.cell(rt, c).value),
                })
                cont['colunas_fora_de_ordem'] += 1

        # As linhas de ingrediente, ate TOTAL ou ate a primeira linha sem nome.
        # Importa parar na AUSENCIA DE NOME e nao na ausencia de unidade: ha uma
        # linha com a celula Unidade vazia (`Leitosa de empanamento`, R$ 0,145) e
        # parar nela perderia um ingrediente que a linha TOTAL conta.
        rr = rt + 1
        while rr <= ws.max_row:
            nome = ws.cell(rr, 1).value
            if nome is None or not str(nome).strip():
                break
            if chave(nome) == 'TOTAL':
                bloco['total'] = {
                    'linha': rr,
                    'peso_bruto': num(ws.cell(rr, 3).value),
                    'peso_liquido': num(ws.cell(rr, 5).value),
                    'unidade': ws.cell(rr, 6).value,
                    'valor': [num(ws.cell(rr, 9).value), num(ws.cell(rr, 10).value)],
                }
                rr += 1
                break
            bruto = num(ws.cell(rr, 3).value)
            liquido = num(ws.cell(rr, 5).value)
            unidade = ws.cell(rr, 6).value
            item = {
                'linha': rr,
                'ingrediente': str(nome),
                'sku': ws.cell(rr, 2).value,
                'peso_bruto': bruto,
                'perda_manipulacao': num(ws.cell(rr, 4).value),
                'peso_liquido': liquido,
                'unidade': None if unidade is None or not str(unidade).strip() else str(unidade),
                'fator_correcao': num(ws.cell(rr, 7).value),
                'custo_compra': num(ws.cell(rr, 8).value),
                'valor': [num(ws.cell(rr, 9).value), num(ws.cell(rr, 10).value)],
            }
            if item['unidade'] is None:
                cont['itens_com_unidade_vazia'] += 1
                achados.append({'tipo': 'unidade_vazia', 'aba': aba,
                                'bloco': str(bloco['nome_do_bloco']), 'linha': rr,
                                'ingrediente': item['ingrediente'],
                                'valor_col9': item['valor'][0]})
            bloco['itens'].append(item)
            cont['linhas_de_ingrediente'] += 1
            rr += 1

        if bloco['total'] is None:
            achados.append({'tipo': 'bloco_sem_linha_total', 'aba': aba,
                            'nome': str(bloco['nome_do_bloco'])})
            cont['blocos_sem_total'] += 1

        blocos.append(bloco)
        linha = rr
    return blocos


# ---------------------------------------------------------------------------
def conferir_item(bloco: dict, item: dict, cont: Counter, achados: list) -> None:
    """As relacoes 1 a 4, na linha. Cada falha e um achado com os dois numeros."""
    bruto, liquido = item['peso_bruto'], item['peso_liquido']
    custo = item['custo_compra']
    col9, col10 = item['valor']
    onde = {'aba': bloco['aba'], 'bloco': str(bloco['nome_do_bloco']),
            'linha': item['linha'], 'ingrediente': item['ingrediente']}

    # 1 · col9 = Peso Liquido x Custo compra
    if igual(col9, q(liquido) * q(custo)):
        cont['col9_igual_liquido_x_custo'] += 1
    else:
        cont['col9_divergente'] += 1
        achados.append(dict(onde, tipo='col9_nao_e_liquido_x_custo',
                            esperado=q(liquido) * q(custo), impresso=col9))

    # 2 · col10 = PesoBruto x Custo compra
    if igual(col10, q(bruto) * q(custo)):
        cont['col10_igual_bruto_x_custo'] += 1
    else:
        cont['col10_divergente'] += 1
        item['col10_recalculado'] = q(bruto) * q(custo)
        achados.append(dict(onde, tipo='col10_nao_e_bruto_x_custo',
                            esperado=q(bruto) * q(custo), impresso=col10,
                            e_sub_receita=item['ingrediente'].strip().lower() in SUB_RECEITAS))

    # Quantas linhas tem perda de verdade: o fator maior que 1 e a medida de
    # quanto a col9 subestima o estoque, e esse numero vai para o relatorio.
    if q(bruto) > q(liquido) + 1e-12:
        cont['linhas_com_fator_maior_que_um'] += 1
    elif igual(bruto, liquido):
        cont['linhas_com_fator_igual_a_um'] += 1

    # 3 · Fator de Correcao = PesoBruto / Peso Liquido
    if item['fator_correcao'] is None:
        cont['fator_vazio'] += 1
        achados.append(dict(onde, tipo='fator_de_correcao_vazio',
                            peso_bruto=bruto, peso_liquido=liquido))
    elif liquido and igual(item['fator_correcao'], q(bruto) / q(liquido)):
        cont['fator_igual_bruto_sobre_liquido'] += 1
    else:
        cont['fator_divergente'] += 1
        achados.append(dict(onde, tipo='fator_de_correcao_divergente',
                            esperado=(q(bruto) / q(liquido)) if liquido else None,
                            impresso=item['fator_correcao']))

    # 4 · Perda manipulacao = PesoBruto - Peso Liquido
    if item['perda_manipulacao'] is None:
        cont['perda_vazia'] += 1
    elif igual(item['perda_manipulacao'], q(bruto) - q(liquido)):
        cont['perda_igual_bruto_menos_liquido'] += 1
    else:
        cont['perda_divergente'] += 1
        achados.append(dict(onde, tipo='perda_manipulacao_divergente',
                            peso_bruto=bruto, peso_liquido=liquido,
                            bruto_menos_liquido=q(bruto) - q(liquido),
                            perda_impressa=item['perda_manipulacao']))

    # O caso que o schema PROIBE: liquido maior que bruto da perda negativa.
    if q(liquido) > q(bruto) + 1e-12:
        cont['liquido_maior_que_bruto'] += 1
        item['liquido_maior_que_bruto'] = True
        achados.append(dict(onde, tipo='liquido_maior_que_bruto',
                            peso_bruto=bruto, peso_liquido=liquido,
                            fator_correcao=item['fator_correcao'],
                            perda_percentual_seria=(1.0 - q(liquido) / q(bruto)) * 100.0
                                                   if bruto else None))

    # A volta do `perda_percentual`, na precisao do schema: quantidade com 4
    # casas (numeric(14,4)) e perda com 3 (numeric(6,3)). Reconstruir o bruto
    # com essas duas precisoes tem de devolver a coluna `PesoBruto`.
    if bruto and q(liquido) <= q(bruto) + 1e-12:
        perda_pct = arred((1.0 - q(liquido) / q(bruto)) * 100.0, 3)
        quantidade = arred(q(liquido), 4)
        item['perda_percentual'] = perda_pct
        if perda_pct >= 100:
            cont['volta_impossivel_perda_100'] += 1
            achados.append(dict(onde, tipo='perda_percentual_chega_a_100',
                                peso_bruto=bruto, peso_liquido=liquido))
        else:
            bruto_rec = arred(quantidade / (1.0 - perda_pct / 100.0), 4)
            item['peso_bruto_reconstruido'] = bruto_rec
            if igual(bruto_rec, arred(q(bruto), 4), 1e-12):
                cont['volta_do_perda_percentual_ok'] += 1
            else:
                cont['volta_do_perda_percentual_falhou'] += 1
                achados.append(dict(onde, tipo='volta_do_perda_percentual_falhou',
                                    peso_bruto=bruto, peso_liquido=liquido,
                                    perda_percentual=perda_pct, reconstruido=bruto_rec))


def conferir_bloco(bloco: dict, cont: Counter, achados: list) -> None:
    """As relacoes 5 a 7, no bloco."""
    onde = {'aba': bloco['aba'], 'bloco': str(bloco['nome_do_bloco'])}
    itens = bloco['itens']
    total = bloco['total'] or {}

    soma = {
        'peso_bruto': sum(q(i['peso_bruto']) for i in itens),
        'peso_liquido': sum(q(i['peso_liquido']) for i in itens),
        'col9': sum(q(i['valor'][0]) for i in itens),
        'col10': sum(q(i['valor'][1]) for i in itens),
    }
    bloco['soma_das_linhas'] = soma

    # 5 · a linha TOTAL contra a soma das linhas, nas quatro colunas.
    for campo, impresso in (('peso_bruto', total.get('peso_bruto')),
                            ('peso_liquido', total.get('peso_liquido')),
                            ('col9', (total.get('valor') or [None, None])[0]),
                            ('col10', (total.get('valor') or [None, None])[1])):
        if igual(impresso, soma[campo]):
            cont['total_fecha_' + campo] += 1
            continue
        cont['total_divergente_' + campo] += 1
        achado = dict(onde, tipo='linha_total_nao_e_a_soma_das_linhas',
                      coluna=campo, soma_das_linhas=soma[campo], total_impresso=impresso,
                      diferenca=soma[campo] - q(impresso))
        # Quando a soma de um PREFIXO das linhas da o total impresso, o defeito
        # tem nome: o intervalo da formula SUM nao alcanca as ultimas linhas.
        if campo in ('col9', 'col10'):
            idx = 0 if campo == 'col9' else 1
            parcial = 0.0
            for k, item in enumerate(itens, start=1):
                parcial += q(item['valor'][idx])
                if igual(parcial, impresso) and k < len(itens):
                    achado['soma_so_as_primeiras'] = k
                    achado['de_fora'] = [
                        {'linha': i['linha'], 'ingrediente': i['ingrediente'],
                         'valor': i['valor'][idx]} for i in itens[k:]]
                    cont['total_de_dinheiro_com_intervalo_curto'] += 1
                    break
        achados.append(achado)

    # 6 · o `Custo total` do cabecalho contra a linha TOTAL.
    for idx, rotulo in ((0, 'col9'), (1, 'col10')):
        if igual(bloco['cabecalho']['custo_total'][idx], (total.get('valor') or [None, None])[idx]):
            cont['cabecalho_fecha_com_total_' + rotulo] += 1
        else:
            cont['cabecalho_divergente_' + rotulo] += 1
            achados.append(dict(onde, tipo='custo_total_do_cabecalho_nao_e_a_linha_total',
                                coluna=rotulo,
                                cabecalho=bloco['cabecalho']['custo_total'][idx],
                                linha_total=(total.get('valor') or [None, None])[idx]))

    # 7 · `Custo porcao` = `Custo total` dividido por QUEM? A pergunta inteira
    # do briefing sobre o `rendimento` esta aqui, e a resposta e um contador.
    pp = q(bloco['peso_porcao'])
    rend = q(bloco['rendimento_planilha'])
    for idx, rotulo in ((0, 'col9'), (1, 'col10')):
        ct = q(bloco['cabecalho']['custo_total'][idx])
        cp = q(bloco['cabecalho']['custo_porcao'][idx])
        if pp and igual(cp, ct / pp):
            cont['custo_porcao_e_custo_total_sobre_peso_porcao'] += 1
        else:
            cont['custo_porcao_nao_fecha_por_peso_porcao'] += 1
            achados.append(dict(onde, tipo='custo_porcao_nao_e_custo_total_sobre_peso_porcao',
                                coluna=rotulo, custo_total=ct, custo_porcao=cp, peso_porcao=pp))
        if rend and igual(cp, ct / rend):
            cont['custo_porcao_e_custo_total_sobre_rendimento'] += 1

        ix = q(bloco['cabecalho']['indice'][idx])
        if ix and igual(bloco['cabecalho']['preco_venda'][idx], cp * ix):
            cont['preco_e_custo_porcao_x_indice'] += 1
        else:
            cont['preco_divergente'] += 1
            achados.append(dict(onde, tipo='preco_de_venda_nao_e_custo_porcao_x_indice',
                                coluna=rotulo, custo_porcao=cp, indice=ix,
                                preco_impresso=bloco['cabecalho']['preco_venda'][idx]))
        if ix and igual(bloco['cabecalho']['cmv'][idx], 1.0 / ix):
            cont['cmv_e_um_sobre_indice'] += 1
        else:
            cont['cmv_divergente'] += 1
            achados.append(dict(onde, tipo='cmv_nao_e_um_sobre_indice', coluna=rotulo,
                                indice=ix, cmv_impresso=bloco['cabecalho']['cmv'][idx]))

    # `Rendimento (porcoes)` contra a soma dos pesos liquidos: e aqui que se ve
    # que, nos pratos, o "rendimento" e o PESO do prato e nao uma contagem.
    if igual(rend, q((total or {}).get('peso_liquido'))):
        cont['rendimento_igual_ao_peso_liquido_total'] += 1
        bloco['rendimento_e_o_peso_liquido'] = True
    if igual(rend, 1.0):
        cont['rendimento_igual_a_um'] += 1


# ---------------------------------------------------------------------------
def ler_resumo(ws, cont: Counter, achados: list) -> list:
    """A `Resumo`: por prato, o `Custo bruto` e os cinco precos dos cinco indices."""
    indices = []
    for c in range(3, ws.max_column + 1):
        texto = chave(ws.cell(2, c).value)
        if not texto.startswith('IND'):
            continue
        # "Indice de custo 3,5" -> 3.5. A cauda vai crua para `num`, que ja trata
        # a virgem decimal: converter aqui tambem comeria o separador duas vezes
        # e 3,5 viraria 35 — um indice sete vezes maior, que a conferencia de
        # `preco = custo x indice` pegaria, mas depois de ja estar no arquivo.
        cauda = texto.replace('INDICE DE CUSTO', '').strip()
        valor = num(cauda)
        if valor is None:
            achados.append({'tipo': 'indice_da_resumo_ilegivel', 'coluna': c,
                            'texto': str(ws.cell(2, c).value)})
            continue
        indices.append({'coluna': c, 'indice': valor})
    cont['indices_da_resumo'] = len(indices)

    linhas = []
    for r in range(3, ws.max_row + 1):
        nome = ws.cell(r, 1).value
        if nome is None or not str(nome).strip():
            continue
        precos = {}
        for ix in indices:
            precos[rotulo_indice(ix['indice'])] = num(ws.cell(r, ix['coluna']).value)
        linha = {'linha': r, 'nome': str(nome), 'custo_bruto': num(ws.cell(r, 2).value),
                 'precos': precos}
        # Preco = custo x indice. Se nao fechar, a `Resumo` tem numero digitado.
        for ix in indices:
            esperado = q(linha['custo_bruto']) * ix['indice']
            if igual(precos[rotulo_indice(ix['indice'])], esperado):
                cont['preco_da_resumo_e_custo_x_indice'] += 1
            else:
                cont['preco_da_resumo_divergente'] += 1
                achados.append({'tipo': 'preco_da_resumo_nao_e_custo_x_indice',
                                'prato': linha['nome'], 'indice': ix['indice'],
                                'esperado': esperado,
                                'impresso': precos[rotulo_indice(ix['indice'])]})
        linhas.append(linha)
        cont['linhas_da_resumo'] += 1
    return linhas


def ligar_resumo(resumo: list, blocos: list, abas: list, cont: Counter, achados: list) -> None:
    """Liga cada linha da `Resumo` ao bloco do prato por TRES caminhos.

    Um caminho sozinho mente: o nome da aba vem truncado em 31 caracteres, o
    nome do bloco se repete entre abas, e a posicao e so convencao. Os tres
    juntos nao mentem — e quando um discorda dos outros dois, isso e o achado.
    """
    primeiro_da_aba = {}
    for bloco in blocos:
        primeiro_da_aba.setdefault(bloco['aba'], bloco)

    por_chave_de_aba = {chave(a): a for a in abas}

    for posicao, linha in enumerate(resumo):
        aba_por_posicao = abas[posicao] if posicao < len(abas) else None
        aba_por_nome = por_chave_de_aba.get(chave(linha['nome']))
        casam_por_custo = [
            b['aba'] for b in primeiro_da_aba.values()
            if igual(linha['custo_bruto'], b['cabecalho']['custo_total'][1])
        ]

        linha['aba_por_posicao'] = aba_por_posicao
        linha['aba_por_nome'] = aba_por_nome
        linha['abas_por_custo_col10'] = casam_por_custo
        # Tambem pelo col9, para registrar que a `Resumo` usa a col10 e nao a col9.
        linha['abas_por_custo_col9'] = [
            b['aba'] for b in primeiro_da_aba.values()
            if igual(linha['custo_bruto'], b['cabecalho']['custo_total'][0])
        ]

        tres = (aba_por_posicao is not None
                and aba_por_nome == aba_por_posicao
                and casam_por_custo == [aba_por_posicao])
        if tres:
            cont['resumo_tres_caminhos_ok'] += 1
        else:
            cont['resumo_caminhos_discordam'] += 1
            achados.append({'tipo': 'resumo_os_tres_caminhos_discordam', 'prato': linha['nome'],
                            'aba_por_posicao': aba_por_posicao, 'aba_por_nome': aba_por_nome,
                            'abas_por_custo_col10': casam_por_custo})

        # A aba escolhida: a posicao confirmada pelo custo, que e o unico dos
        # tres caminhos que nao depende de como alguem digitou o nome.
        escolhida = None
        if len(casam_por_custo) == 1 and casam_por_custo[0] == aba_por_posicao:
            escolhida = aba_por_posicao
        elif aba_por_nome and aba_por_nome in casam_por_custo:
            escolhida = aba_por_nome
        elif aba_por_posicao:
            escolhida = aba_por_posicao
        linha['aba'] = escolhida

        if escolhida:
            bloco = primeiro_da_aba[escolhida]
            bloco['nome_na_resumo'] = linha['nome']
            bloco['e_prato_vendido'] = True
            bloco['precos_da_resumo'] = linha['precos']
            bloco['custo_bruto_da_resumo'] = linha['custo_bruto']
            if chave(bloco['nome_do_bloco']) != chave(linha['nome']):
                cont['nome_do_bloco_diferente_do_nome_vendido'] += 1
                achados.append({'tipo': 'nome_do_bloco_diferente_do_nome_vendido',
                                'aba': escolhida, 'nome_do_bloco': str(bloco['nome_do_bloco']),
                                'nome_na_resumo': linha['nome']})
            if chave(escolhida) != chave(linha['nome']):
                cont['nome_da_aba_diferente_do_nome_vendido'] += 1
                achados.append({'tipo': 'nome_da_aba_diferente_do_nome_vendido',
                                'aba': escolhida, 'tamanho_do_nome_da_aba': len(escolhida),
                                'nome_na_resumo': linha['nome']})


def ligar_sub_receitas(blocos: list, cont: Counter, achados: list) -> None:
    """Liga cada linha de ingrediente que e sub-receita ao bloco dela, e PROVA
    a ligacao pelo numero: o `Custo compra` da linha e o `Custo porcao` do bloco.
    """
    por_nome = {}
    for bloco in blocos:
        por_nome.setdefault(chave(bloco['nome_do_bloco']), []).append(bloco)

    for nome_bloco in SUB_RECEITAS.values():
        if chave(nome_bloco) not in por_nome:
            cont['sub_receita_do_depara_sem_bloco'] += 1
            achados.append({'tipo': 'sub_receita_do_depara_sem_bloco_na_planilha',
                            'bloco_esperado': nome_bloco})

    nomes_consumidos = set()
    for bloco in blocos:
        for item in bloco['itens']:
            alvo = SUB_RECEITAS.get(item['ingrediente'].strip().lower())
            if not alvo:
                continue
            nomes_consumidos.add(alvo)
            item['sub_receita'] = alvo
            candidatos = por_nome.get(chave(alvo), [])
            if not candidatos:
                continue
            sub = candidatos[0]
            item['sub_receita_aba'] = sub['aba']
            cont['linhas_que_sao_sub_receita'] += 1
            # A prova. col9 primeiro porque e a coluna em que a planilha quase
            # sempre liga; col10 depois; e o arredondamento a 2 casas por fim,
            # porque uma das nove ligacoes foi digitada arredondada.
            cp9, cp10 = sub['cabecalho']['custo_porcao']
            if igual(item['custo_compra'], cp9):
                item['prova_da_sub_receita'] = 'custo_porcao_col9'
                cont['sub_receita_provada_por_col9'] += 1
            elif igual(item['custo_compra'], cp10):
                item['prova_da_sub_receita'] = 'custo_porcao_col10'
                cont['sub_receita_provada_por_col10'] += 1
            elif igual(arred(q(item['custo_compra']), 2), arred(q(cp9), 2), 1e-9):
                item['prova_da_sub_receita'] = 'custo_porcao_col9_arredondado'
                cont['sub_receita_provada_por_col9_arredondado'] += 1
            else:
                item['prova_da_sub_receita'] = None
                cont['sub_receitas_sem_prova'] += 1
                achados.append({
                    'tipo': 'sub_receita_sem_prova_no_numero',
                    'aba': bloco['aba'], 'bloco': str(bloco['nome_do_bloco']),
                    'linha': item['linha'], 'ingrediente': item['ingrediente'],
                    'bloco_da_sub_receita': alvo,
                    'custo_compra_da_linha': item['custo_compra'],
                    'custo_porcao_col9': cp9, 'custo_porcao_col10': cp10,
                })

    for bloco in blocos:
        nome = chave(bloco['nome_do_bloco'])
        bloco['e_sub_receita'] = any(chave(n) == nome for n in nomes_consumidos)
        if bloco['e_sub_receita']:
            bloco['nome_sub_receita'] = next(
                n for n in nomes_consumidos if chave(n) == nome)

    # Bloco que nao e prato vendido nem sub-receita consumida e orfao: a casa tem
    # a receita e nada a usa. Nos drinques isso existiu (LICOR DE CEREJA BDZ) e
    # era achado, nao detalhe.
    for bloco in blocos:
        if not bloco.get('e_prato_vendido') and not bloco.get('e_sub_receita'):
            cont['blocos_orfaos'] += 1
            achados.append({'tipo': 'bloco_orfao', 'aba': bloco['aba'],
                            'nome': str(bloco['nome_do_bloco'])})


# ---------------------------------------------------------------------------
def main() -> int:
    if not XLSX.exists():
        sys.exit('nao achei %s' % XLSX)

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    cont: Counter = Counter()
    # Contador que vale ZERO e resultado, nao ausencia: `dict(Counter)` perde a
    # chave que nunca foi incrementada, e justamente as mais importantes deste
    # arquivo sao as que tem de dar zero — nenhuma linha com col9 divergente,
    # nenhum bloco com Custo porcao fechando pelo Rendimento. Semeadas aqui.
    for k in ('col9_divergente', 'col10_divergente', 'fator_divergente', 'fator_vazio',
              'perda_divergente', 'perda_vazia', 'liquido_maior_que_bruto',
              'volta_do_perda_percentual_ok', 'volta_do_perda_percentual_falhou',
              'volta_impossivel_perda_100',
              'custo_porcao_e_custo_total_sobre_peso_porcao',
              'custo_porcao_nao_fecha_por_peso_porcao',
              'custo_porcao_e_custo_total_sobre_rendimento',
              'preco_e_custo_porcao_x_indice', 'preco_divergente',
              'cmv_e_um_sobre_indice', 'cmv_divergente',
              'rendimento_igual_ao_peso_liquido_total', 'rendimento_igual_a_um',
              'total_fecha_peso_bruto', 'total_fecha_peso_liquido',
              'total_fecha_col9', 'total_fecha_col10',
              'total_divergente_peso_bruto', 'total_divergente_peso_liquido',
              'total_divergente_col9', 'total_divergente_col10',
              'total_de_dinheiro_com_intervalo_curto',
              'cabecalho_fecha_com_total_col9', 'cabecalho_fecha_com_total_col10',
              'cabecalho_divergente_col9', 'cabecalho_divergente_col10',
              'etiquetas_fora_de_ordem', 'colunas_fora_de_ordem',
              'itens_com_unidade_vazia', 'blocos_sem_tabela', 'blocos_sem_total',
              'blocos_orfaos', 'sub_receita_provada_por_col9',
              'sub_receita_provada_por_col10',
              'sub_receita_provada_por_col9_arredondado', 'sub_receitas_sem_prova',
              'sub_receita_do_depara_sem_bloco', 'linhas_que_sao_sub_receita',
              'sub_receita_repetida_em_abas',
              'sub_receita_repetida_com_copias_identicas',
              'sub_receita_repetida_com_copias_divergentes',
              'resumo_tres_caminhos_ok', 'resumo_caminhos_discordam',
              'nome_do_bloco_diferente_do_nome_vendido',
              'nome_da_aba_diferente_do_nome_vendido',
              'preco_da_resumo_e_custo_x_indice', 'preco_da_resumo_divergente',
              'ingrediente_com_custo_compra_divergente',
              'ingrediente_com_unidade_divergente',
              'ingrediente_com_mais_de_uma_grafia',
              'linhas_com_fator_maior_que_um', 'linhas_com_fator_igual_a_um'):
        cont[k] += 0
    achados: list = []

    abas_de_prato = [a for a in wb.sheetnames if chave(a) != 'RESUMO']
    cont['abas'] = len(wb.sheetnames)
    cont['abas_de_prato'] = len(abas_de_prato)
    if 'Resumo' not in wb.sheetnames:
        sys.exit('a aba Resumo nao existe — ela e a lista do que a casa vende')

    blocos: list = []
    for aba in abas_de_prato:
        blocos.extend(ler_blocos(wb[aba], aba, cont, achados))

    for bloco in blocos:
        for item in bloco['itens']:
            conferir_item(bloco, item, cont, achados)
        conferir_bloco(bloco, cont, achados)

    resumo = ler_resumo(wb['Resumo'], cont, achados)
    ligar_resumo(resumo, blocos, abas_de_prato, cont, achados)
    ligar_sub_receitas(blocos, cont, achados)

    # Inventario de ingredientes, por nome normalizado — que e a materia-prima do
    # de-para. As grafias ficam todas, porque o de-para e escrito contra a grafia.
    ingredientes: dict = {}
    for bloco in blocos:
        for item in bloco['itens']:
            k = chave(item['ingrediente'])
            d = ingredientes.setdefault(k, {'grafias': set(), 'unidades': set(),
                                            'custos': set(), 'usos': []})
            d['grafias'].add(item['ingrediente'])
            d['unidades'].add((item['unidade'] or '').strip().upper())
            d['custos'].add(arred(q(item['custo_compra']), 6))
            d['usos'].append({'aba': bloco['aba'], 'bloco': str(bloco['nome_do_bloco']),
                              'linha': item['linha']})
    for k, d in ingredientes.items():
        if len(d['custos']) > 1:
            cont['ingrediente_com_custo_compra_divergente'] += 1
            achados.append({'tipo': 'ingrediente_com_custo_compra_divergente',
                            'ingrediente': k, 'custos': sorted(d['custos'])})
        if len(d['unidades']) > 1:
            cont['ingrediente_com_unidade_divergente'] += 1
            achados.append({'tipo': 'ingrediente_com_unidade_divergente',
                            'ingrediente': k, 'unidades': sorted(d['unidades'])})
        if len(d['grafias']) > 1:
            cont['ingrediente_com_mais_de_uma_grafia'] += 1

    cont['ingredientes_distintos_normalizados'] = len(ingredientes)
    cont['ingredientes_distintos_literais'] = len(
        {i['ingrediente'] for b in blocos for i in b['itens']})
    cont['pratos_vendidos'] = sum(1 for b in blocos if b.get('e_prato_vendido'))
    cont['blocos_sub_receita'] = sum(1 for b in blocos if b.get('e_sub_receita'))
    cont['sub_receitas_distintas'] = len({b['nome_sub_receita'] for b in blocos
                                          if b.get('e_sub_receita')})

    # Blocos de sub-receita repetidos em abas diferentes: tem de virar UM produto.
    repetidos: dict = {}
    for bloco in blocos:
        if bloco.get('e_sub_receita'):
            repetidos.setdefault(bloco['nome_sub_receita'], []).append(bloco)
    copias = {}
    for nome, lista in repetidos.items():
        if len(lista) < 2:
            continue
        cont['sub_receita_repetida_em_abas'] += 1
        # As copias divergirem em ingrediente ou custo e achado, nao detalhe.
        assinaturas = {
            json.dumps([[chave(i['ingrediente']), i['peso_bruto'], i['peso_liquido'],
                         (i['unidade'] or '').upper(), i['custo_compra']]
                        for i in b['itens']], ensure_ascii=False) for b in lista}
        valores = {(b['cabecalho']['custo_total'][0], b['cabecalho']['custo_total'][1],
                    b['peso_porcao']) for b in lista}
        copias[nome] = {'abas': [b['aba'] for b in lista],
                        'itens_identicos': len(assinaturas) == 1,
                        'cabecalho_identico': len(valores) == 1}
        if len(assinaturas) > 1 or len(valores) > 1:
            cont['sub_receita_repetida_com_copias_divergentes'] += 1
            achados.append({'tipo': 'sub_receita_repetida_com_copias_divergentes',
                            'sub_receita': nome, 'abas': [b['aba'] for b in lista],
                            'itens_identicos': len(assinaturas) == 1,
                            'cabecalho_identico': len(valores) == 1})
        else:
            cont['sub_receita_repetida_com_copias_identicas'] += 1

    saida = {
        'origem': {
            'arquivo': str(XLSX.relative_to(RAIZ)),
            'abas': wb.sheetnames,
            'abas_de_prato': abas_de_prato,
        },
        'contadores': dict(sorted(cont.items())),
        'achados': achados,
        'resumo': resumo,
        'blocos': blocos,
        'copias_de_sub_receita': copias,
        'ingredientes': {
            k: {'grafias': sorted(d['grafias']), 'unidades': sorted(d['unidades']),
                'custos': sorted(d['custos']), 'usos': d['usos']}
            for k, d in sorted(ingredientes.items())
        },
        'sub_receitas_do_depara': SUB_RECEITAS,
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding='utf-8')

    c = cont
    print('abas %d (prato %d + Resumo) · blocos %d · linhas de ingrediente %d'
          % (c['abas'], c['abas_de_prato'], c['blocos'], c['linhas_de_ingrediente']))
    print('pratos vendidos %d · blocos de sub-receita %d · sub-receitas distintas %d · orfaos %d'
          % (c['pratos_vendidos'], c['blocos_sub_receita'],
             c['sub_receitas_distintas'], c['blocos_orfaos']))
    print('ingredientes distintos: %d literais · %d normalizados'
          % (c['ingredientes_distintos_literais'], c['ingredientes_distintos_normalizados']))
    print()
    print('CONFERENCIAS (de %d linhas e %d blocos):' % (c['linhas_de_ingrediente'], c['blocos']))
    print('  1 col9  = liquido x custo ......... %d ok · %d divergente'
          % (c['col9_igual_liquido_x_custo'], c['col9_divergente']))
    print('  2 col10 = bruto    x custo ........ %d ok · %d divergente'
          % (c['col10_igual_bruto_x_custo'], c['col10_divergente']))
    print('  3 fator = bruto / liquido ......... %d ok · %d divergente · %d vazio'
          % (c['fator_igual_bruto_sobre_liquido'], c['fator_divergente'], c['fator_vazio']))
    print('  4 perda = bruto - liquido ......... %d ok · %d divergente · %d vazia'
          % (c['perda_igual_bruto_menos_liquido'], c['perda_divergente'], c['perda_vazia']))
    print('    liquido MAIOR que bruto ......... %d' % c['liquido_maior_que_bruto'])
    print('  5 TOTAL = soma das linhas ......... bruto %d/%d · liquido %d/%d · col9 %d/%d · col10 %d/%d'
          % (c['total_fecha_peso_bruto'], c['blocos'], c['total_fecha_peso_liquido'], c['blocos'],
             c['total_fecha_col9'], c['blocos'], c['total_fecha_col10'], c['blocos']))
    print('    TOTAL de dinheiro com SUM curto .. %d' % c['total_de_dinheiro_com_intervalo_curto'])
    print('  6 cabecalho = TOTAL ............... col9 %d/%d · col10 %d/%d'
          % (c['cabecalho_fecha_com_total_col9'], c['blocos'],
             c['cabecalho_fecha_com_total_col10'], c['blocos']))
    print('  7 custo porcao = custo total / PESO PORCAO ... %d de %d'
          % (c['custo_porcao_e_custo_total_sobre_peso_porcao'], 2 * c['blocos']))
    print('    custo porcao = custo total / RENDIMENTO .... %d de %d'
          % (c['custo_porcao_e_custo_total_sobre_rendimento'], 2 * c['blocos']))
    print('    preco = custo porcao x indice ... %d de %d · cmv = 1/indice ... %d de %d'
          % (c['preco_e_custo_porcao_x_indice'], 2 * c['blocos'],
             c['cmv_e_um_sobre_indice'], 2 * c['blocos']))
    print('    rendimento == peso liquido total  %d · rendimento == 1  %d'
          % (c['rendimento_igual_ao_peso_liquido_total'], c['rendimento_igual_a_um']))
    print()
    print('A VOLTA DO perda_percentual (prova contra a coluna PesoBruto):')
    print('  fecha exato %d · falhou %d · impossivel (perda negativa) %d'
          % (c['volta_do_perda_percentual_ok'], c['volta_do_perda_percentual_falhou'],
             c['liquido_maior_que_bruto']))
    print()
    print('A RESUMO:')
    print('  linhas %d · indices %d · preco = custo x indice %d de %d'
          % (c['linhas_da_resumo'], c['indices_da_resumo'],
             c['preco_da_resumo_e_custo_x_indice'],
             c['linhas_da_resumo'] * c['indices_da_resumo']))
    print('  os tres caminhos (posicao+nome+custo) concordam em %d de %d'
          % (c['resumo_tres_caminhos_ok'], c['linhas_da_resumo']))
    print('  nome do BLOCO diferente do nome vendido .. %d'
          % c['nome_do_bloco_diferente_do_nome_vendido'])
    print('  nome da ABA   diferente do nome vendido .. %d'
          % c['nome_da_aba_diferente_do_nome_vendido'])
    print()
    print('SUB-RECEITAS: provadas por col9 %d · por col10 %d · por col9 arredondado %d · SEM prova %d'
          % (c['sub_receita_provada_por_col9'], c['sub_receita_provada_por_col10'],
             c['sub_receita_provada_por_col9_arredondado'], c['sub_receitas_sem_prova']))
    print('  repetidas em abas diferentes %d (copias identicas %d · divergentes %d)'
          % (c['sub_receita_repetida_em_abas'],
             c['sub_receita_repetida_com_copias_identicas'],
             c['sub_receita_repetida_com_copias_divergentes']))
    print()
    print('ESTRUTURA: etiquetas fora de ordem %d · colunas fora de ordem %d · unidade vazia %d'
          % (c['etiquetas_fora_de_ordem'], c['colunas_fora_de_ordem'],
             c['itens_com_unidade_vazia']))
    print('ingrediente com custo divergente %d · com unidade divergente %d · com varias grafias %d'
          % (c['ingrediente_com_custo_compra_divergente'],
             c['ingrediente_com_unidade_divergente'],
             c['ingrediente_com_mais_de_uma_grafia']))
    print()
    print('achados: %d · escrito %s' % (len(achados), SAIDA.relative_to(RAIZ)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
