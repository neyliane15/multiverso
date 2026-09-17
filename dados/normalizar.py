# -*- coding: utf-8 -*-
"""Limpa a extracao bruta e monta o catalogo final do Bar do Zeca."""
import json, re, unicodedata, collections

BASE = '/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad'
d = json.load(open(f'{BASE}/contagem.json'))

TITULOS = re.compile(r'^(CONTROLE DE ESTOQUE|HORTIFRUTI\s+BAR DO ZECA|PORCIONADOS BAR DO ZECA|PERDAS)', re.I)
UNIDADES = {'UN': 'UND', 'UND.': 'UND', 'CXS': 'CX', 'BD': 'BDJ'}
CATEGORIAS = {'PRODUTOS': 'HORTIFRUTI', 'SORVETE': 'SORVETES',
              'BEBIDAS NÃO ALCOÓLICAS (ESTOQUE)': 'BEBIDAS NÃO ALCOÓLICAS',
              'BEBIDAS ALCOOLICAS': 'BEBIDAS ALCOÓLICAS'}

def chave(s):
    s = unicodedata.normalize('NFKD', s.upper())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()

limpos, descartados = [], []
for i in d['itens']:
    if TITULOS.match(i['produto']):
        descartados.append(i['produto']); continue
    i['unidade'] = UNIDADES.get(i['unidade'], i['unidade'])
    i['categoria'] = CATEGORIAS.get(i['categoria'], i['categoria'])
    limpos.append(i)

# junta linhas repetidas no mesmo setor+categoria (somando a quantidade)
agrupado = {}
for i in limpos:
    k = (chave(i['produto']), i['setor'], i['categoria'])
    if k in agrupado:
        agrupado[k]['quantidade'] = round(agrupado[k]['quantidade'] + i['quantidade'], 4)
        agrupado[k]['total'] = round(agrupado[k]['total'] + i['total'], 4)
    else:
        agrupado[k] = i
linhas = list(agrupado.values())

# catalogo: um produto por nome; cada setor guarda a propria unidade e o proprio custo
produtos = {}
for i in linhas:
    k = chave(i['produto'])
    p = produtos.setdefault(k, {'nome': i['produto'], 'categoria': i['categoria'], 'setores': []})
    p['setores'].append({'setor': i['setor'], 'categoria': i['categoria'], 'unidade': i['unidade'],
                         'custo': i['custo_unitario'], 'quantidade': i['quantidade'], 'total': i['total']})

total = round(sum(i['total'] for i in linhas), 4)
saida = {
    'restaurante': 'Bar do Zeca — Norte Shopping', 'competencia': '2026-08',
    'origem': 'Contagem_BDZ_NS_08_Agosto_2026_okk.xlsx',
    'total_contagem': total,
    'setores': sorted({i['setor'] for i in linhas}),
    'categorias': sorted({i['categoria'] for i in linhas}),
    'produtos': sorted(produtos.values(), key=lambda p: p['nome']),
    'linhas': linhas,
}
json.dump(saida, open(f'{BASE}/catalogo.json', 'w'), ensure_ascii=False, indent=1)

print('descartadas (linhas de titulo):', descartados)
print('linhas de contagem:', len(linhas))
print('produtos unicos  :', len(produtos))
print('total            : %.4f  (planilha: 78681.3573)  diferenca: %.6f' % (total, total - 78681.3573))
print('setores          :', saida['setores'])
print('categorias       :', len(saida['categorias']))
for c in saida['categorias']:
    sub = [l for l in linhas if l['categoria'] == c]
    print('   %-26s %3d itens  R$ %11.2f' % (c, len(sub), sum(x['total'] for x in sub)))
print('unidades         :', collections.Counter(l['unidade'] for l in linhas))
print('produtos em >1 setor:', sum(1 for p in produtos.values() if len({s['setor'] for s in p['setores']}) > 1))
