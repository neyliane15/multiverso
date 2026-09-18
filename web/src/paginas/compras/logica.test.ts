import { describe, expect, it } from 'vitest'
import {
  agruparFolha,
  filtrarCompras,
  resumirConferencia,
  resumirFolha,
  totalizarCompras,
  type CategoriaSimples,
  type CompraFiltravel,
  type ItemDeFolha,
} from './logica'

function compra(parcial: Partial<CompraFiltravel> & { id: string }): CompraFiltravel {
  return {
    emitida_em: '2026-09-10',
    fornecedor_id: 'f1',
    fornecedor_nome: 'Distribuidora Atlântico',
    status: 'lancada',
    valor_total: 1_000,
    itens_pendentes: 0,
    ...parcial,
  }
}

describe('filtrarCompras · período', () => {
  const compras = [
    compra({ id: '1', emitida_em: '2026-08-31' }),
    compra({ id: '2', emitida_em: '2026-09-01' }),
    compra({ id: '3', emitida_em: '2026-09-30' }),
    compra({ id: '4', emitida_em: '2026-10-01' }),
  ]

  it('o período inclui os dois extremos', () => {
    const dentro = filtrarCompras(compras, { inicio: '2026-09-01', fim: '2026-09-30' })
    expect(dentro.map((c) => c.id)).toEqual(['2', '3'])
  })

  it('nota com hora no carimbo entra no dia certo', () => {
    // vw_compras_historico devolve date, mas uma nota criada com timestamp
    // chegaria como '2026-09-30T23:40:00Z' — o dia ainda é 30/09.
    const comHora = [compra({ id: 'h', emitida_em: '2026-09-30T23:40:00Z' })]
    expect(filtrarCompras(comHora, { fim: '2026-09-30' })).toHaveLength(1)
  })

  it('só início, ou só fim, já filtra', () => {
    expect(filtrarCompras(compras, { inicio: '2026-09-30' }).map((c) => c.id)).toEqual(['3', '4'])
    expect(filtrarCompras(compras, { fim: '2026-09-01' }).map((c) => c.id)).toEqual(['1', '2'])
  })

  it('sem filtro nenhum, devolve tudo', () => {
    expect(filtrarCompras(compras)).toHaveLength(4)
  })
})

describe('filtrarCompras · fornecedor, busca e pendência', () => {
  const compras = [
    compra({ id: '1', fornecedor_id: 'f1', fornecedor_nome: 'Distribuidora Atlântico' }),
    compra({ id: '2', fornecedor_id: 'f2', fornecedor_nome: 'Hortifrúti São João', itens_pendentes: 3 }),
    compra({ id: '3', fornecedor_id: null, fornecedor_nome: 'Sem fornecedor' }),
  ]

  it('filtra pelo fornecedor escolhido', () => {
    expect(filtrarCompras(compras, { fornecedorId: 'f2' }).map((c) => c.id)).toEqual(['2'])
  })

  it('acha o fornecedor sem acento e sem caixa', () => {
    expect(filtrarCompras(compras, { busca: 'atlantico' }).map((c) => c.id)).toEqual(['1'])
    expect(filtrarCompras(compras, { busca: 'HORTIFRUTI' }).map((c) => c.id)).toEqual(['2'])
  })

  it('"só pendentes" deixa apenas quem tem item sem vínculo', () => {
    expect(filtrarCompras(compras, { soPendentes: true }).map((c) => c.id)).toEqual(['2'])
  })

  it('os filtros se somam', () => {
    expect(filtrarCompras(compras, { soPendentes: true, busca: 'atlantico' })).toEqual([])
  })
})

describe('totalizarCompras', () => {
  it('separa o que já é custo do que ainda não entrou no CMV', () => {
    const totais = totalizarCompras([
      compra({ id: '1', status: 'lancada', valor_total: 1_000 }),
      compra({ id: '2', status: 'importada', valor_total: 300, itens_pendentes: 2 }),
      compra({ id: '3', status: 'conferida', valor_total: 200 }),
    ])
    expect(totais.total).toBe(1_000)
    expect(totais.totalNaoLancado).toBe(500)
  })

  it('nota cancelada não soma em lugar nenhum', () => {
    const totais = totalizarCompras([
      compra({ id: '1', status: 'lancada', valor_total: 1_000 }),
      compra({ id: '2', status: 'cancelada', valor_total: 9_999 }),
    ])
    expect(totais.total).toBe(1_000)
    expect(totais.totalNaoLancado).toBe(0)
  })

  it('conta notas e itens pendentes de vínculo', () => {
    const totais = totalizarCompras([
      compra({ id: '1', itens_pendentes: 2, status: 'importada' }),
      compra({ id: '2', itens_pendentes: 5, status: 'importada' }),
      compra({ id: '3', itens_pendentes: 0 }),
    ])
    expect(totais).toMatchObject({ notas: 3, notasPendentes: 2, itensPendentes: 7 })
  })

  it('período sem nota devolve zeros, não NaN', () => {
    expect(totalizarCompras([])).toMatchObject({ notas: 0, total: 0, totalNaoLancado: 0 })
  })
})

// ───────────────────────────────────────────────────────────── folha ───────

function folha(parcial: Partial<ItemDeFolha> & { id: string }): ItemDeFolha {
  return {
    produto_id: `p-${parcial.id}`,
    quantidade: 0,
    unidade: 'UND',
    custo_estimado: 10,
    comprado: false,
    produto: { nome: 'Produto', categoria_id: null },
    ...parcial,
  }
}

const CATEGORIAS: CategoriaSimples[] = [
  { id: 'c-carne', nome: 'Carnes', cor: '#aa0000' },
  { id: 'c-bebida', nome: 'Bebidas', cor: '#0000aa' },
]

describe('agruparFolha', () => {
  const itens = [
    folha({ id: '1', produto: { nome: 'Picanha', categoria_id: 'c-carne' } }),
    folha({ id: '2', produto: { nome: 'Cerveja', categoria_id: 'c-bebida' }, comprado: true }),
    folha({ id: '3', produto: { nome: 'Água', categoria_id: 'c-bebida' } }),
  ]

  it('o que já foi comprado sai da frente', () => {
    const grupos = agruparFolha(itens, CATEGORIAS)
    expect(grupos.flatMap((g) => g.itens.map((i) => i.id))).toEqual(['1', '3'])
  })

  it('com incluirComprados, a lista de conferência volta inteira', () => {
    const grupos = agruparFolha(itens, CATEGORIAS, { incluirComprados: true })
    expect(grupos.flatMap((g) => g.itens.map((i) => i.id)).sort()).toEqual(['1', '2', '3'])
  })

  it('a busca ignora acento', () => {
    const grupos = agruparFolha(itens, CATEGORIAS, { busca: 'agua' })
    expect(grupos.flatMap((g) => g.itens.map((i) => i.id))).toEqual(['3'])
  })

  it('categoria que ficou sem item visível some da folha', () => {
    const grupos = agruparFolha([itens[1]!], CATEGORIAS)
    expect(grupos).toEqual([])
  })

  it('o total do grupo usa o rascunho que ainda não foi salvo', () => {
    const grupos = agruparFolha(itens, CATEGORIAS, {}, new Map([['1', 3]]))
    expect(grupos[0]?.nome).toBe('Carnes')
    expect(grupos[0]?.total).toBe(30)
  })
})

describe('resumirFolha', () => {
  const itens = [
    folha({ id: '1', quantidade: 2, custo_estimado: 10 }),
    folha({ id: '2', quantidade: 0 }),
    folha({ id: '3', quantidade: 5, custo_estimado: 4, comprado: true }),
  ]

  it('conta o que falta comprar sem contar o que já foi', () => {
    expect(resumirFolha(itens)).toMatchObject({ itens: 3, aComprar: 1, comprados: 1 })
  })

  it('pedir zero não entra no total estimado', () => {
    expect(resumirFolha([folha({ id: '1', quantidade: 0, custo_estimado: 99 })]).totalEstimado).toBe(0)
  })

  it('o item comprado continua somando: ele já custou dinheiro', () => {
    expect(resumirFolha(itens).totalEstimado).toBe(40)
  })

  it('o rascunho entra no total antes de o servidor confirmar', () => {
    expect(resumirFolha(itens, new Map([['2', 3]])).totalEstimado).toBe(70)
    expect(resumirFolha(itens, new Map([['2', 3]])).aComprar).toBe(2)
  })
})

describe('resumirConferencia', () => {
  it('a nota só pode ser lançada com todos os itens vinculados', () => {
    const resumo = resumirConferencia([
      { id: '1', produto_id: 'p1' },
      { id: '2', produto_id: null },
    ])
    expect(resumo).toMatchObject({ itens: 2, vinculados: 1, pendentes: 1, podeLancar: false })
  })

  it('tudo vinculado libera o lançamento', () => {
    expect(resumirConferencia([{ id: '1', produto_id: 'p1' }]).podeLancar).toBe(true)
  })

  it('nota sem item nenhum não é lançável — não há o que virar custo', () => {
    expect(resumirConferencia([])).toMatchObject({ itens: 0, pendentes: 0, podeLancar: false })
  })
})
