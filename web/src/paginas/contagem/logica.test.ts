import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  filtrarItens,
  foiTrabalhado,
  hojeIso,
  resumoDoFechamento,
  totalDosItens,
  type CategoriaSimples,
  type ItemContavel,
} from './logica'

function item(parcial: Partial<ItemContavel> & { id: string }): ItemContavel {
  return {
    produto_id: `p-${parcial.id}`,
    setor_id: 's1',
    quantidade: 0,
    unidade: 'KG',
    custo_unitario: 10,
    total: 0,
    contado_em: null,
    produto: { nome: 'Produto', categoria_id: null },
    ...parcial,
  }
}

const CATEGORIAS: CategoriaSimples[] = [
  { id: 'c-proteina', nome: 'Proteínas', cor: '#aa0000' },
  { id: 'c-bebida', nome: 'Bebidas', cor: '#0000aa' },
]

describe('filtrarItens · busca', () => {
  const itens = [
    item({ id: '1', produto: { nome: 'Filé de tilápia', categoria_id: null } }),
    item({ id: '2', produto: { nome: 'Açúcar refinado', categoria_id: null } }),
    item({ id: '3', produto: { nome: 'Cerveja Pilsen', categoria_id: null } }),
  ]

  it('acha "TILÁPIA" digitando sem acento e em minúscula', () => {
    expect(filtrarItens(itens, { busca: 'tilapia' }).map((i) => i.id)).toEqual(['1'])
  })

  it('acha "Açúcar" digitando "acucar"', () => {
    expect(filtrarItens(itens, { busca: 'acucar' }).map((i) => i.id)).toEqual(['2'])
  })

  it('exige todos os termos, em qualquer ordem', () => {
    expect(filtrarItens(itens, { busca: 'tilapia file' }).map((i) => i.id)).toEqual(['1'])
    expect(filtrarItens(itens, { busca: 'tilapia cerveja' })).toEqual([])
  })

  it('busca vazia ou só espaços devolve a folha inteira', () => {
    expect(filtrarItens(itens, { busca: '   ' })).toHaveLength(3)
    expect(filtrarItens(itens)).toHaveLength(3)
  })

  it('item sem produto carregado não quebra a busca', () => {
    const orfao = [item({ id: '9', produto: null })]
    expect(filtrarItens(orfao, { busca: 'qualquer' })).toEqual([])
    expect(filtrarItens(orfao)).toHaveLength(1)
  })
})

describe('foiTrabalhado · o que ainda falta contar', () => {
  it('zero carimbado é item trabalhado: o produto acabou, não foi esquecido', () => {
    const zerado = item({ id: '1', quantidade: 0, contado_em: '2026-09-18T10:00:00Z' })
    expect(foiTrabalhado(zerado)).toBe(true)
    expect(filtrarItens([zerado], { soNaoContados: true })).toEqual([])
  })

  it('zero sem carimbo continua na lista do que falta', () => {
    const intocado = item({ id: '1' })
    expect(foiTrabalhado(intocado)).toBe(false)
    expect(filtrarItens([intocado], { soNaoContados: true })).toHaveLength(1)
  })

  it('rascunho local tira o item da lista antes mesmo do servidor responder', () => {
    const intocado = item({ id: '1' })
    const rascunhos = new Map([['1', 0]])
    expect(foiTrabalhado(intocado, rascunhos)).toBe(true)
    expect(filtrarItens([intocado], { soNaoContados: true }, rascunhos)).toEqual([])
  })
})

describe('totais', () => {
  it('o rascunho local vence a quantidade que veio do servidor', () => {
    const itens = [item({ id: '1', quantidade: 2, custo_unitario: 10 })]
    expect(totalDosItens(itens)).toBe(20)
    expect(totalDosItens(itens, new Map([['1', 5]]))).toBe(50)
  })

  it('rascunho de outro item não interfere', () => {
    const itens = [item({ id: '1', quantidade: 2, custo_unitario: 10 })]
    expect(totalDosItens(itens, new Map([['2', 99]]))).toBe(20)
  })
})

describe('agruparPorCategoria', () => {
  const itens = [
    item({ id: 'b', produto: { nome: 'Picanha', categoria_id: 'c-proteina' } }),
    item({ id: 'a', produto: { nome: 'Alcatra', categoria_id: 'c-proteina' } }),
    item({ id: 'c', produto: { nome: 'Cerveja', categoria_id: 'c-bebida' } }),
    item({ id: 'd', produto: { nome: 'Guardanapo', categoria_id: null } }),
    item({ id: 'e', produto: { nome: 'Item de categoria sumida', categoria_id: 'c-antiga' } }),
  ]

  it('segue a ordem do cadastro, não a ordem dos itens', () => {
    const grupos = agruparPorCategoria(itens, CATEGORIAS)
    expect(grupos.slice(0, 2).map((g) => g.nome)).toEqual(['Proteínas', 'Bebidas'])
  })

  it('ordena por nome dentro do grupo', () => {
    const grupos = agruparPorCategoria(itens, CATEGORIAS)
    expect(grupos[0]?.itens.map((i) => i.produto?.nome)).toEqual(['Alcatra', 'Picanha'])
  })

  it('não esconde item de categoria arquivada nem item sem categoria', () => {
    const grupos = agruparPorCategoria(itens, CATEGORIAS)
    const soltos = grupos.flatMap((g) => g.itens.map((i) => i.id))
    expect(soltos).toHaveLength(itens.length)
    expect(grupos.map((g) => g.categoriaId)).toContain(null)
    expect(grupos.map((g) => g.categoriaId)).toContain('c-antiga')
  })

  it('categoria cadastrada sem item nenhum não aparece na folha', () => {
    const grupos = agruparPorCategoria([itens[2]!], CATEGORIAS)
    expect(grupos.map((g) => g.nome)).toEqual(['Bebidas'])
  })

  it('o total do grupo acompanha o rascunho', () => {
    const grupos = agruparPorCategoria(itens, CATEGORIAS, new Map([['a', 3]]))
    expect(grupos[0]?.total).toBe(30)
  })
})

describe('resumoDoFechamento', () => {
  const itens = [
    item({ id: '1', quantidade: 4 }),
    item({ id: '2', quantidade: 0, contado_em: '2026-09-18T10:00:00Z' }),
    item({ id: '3', quantidade: 0 }),
    item({ id: '4', quantidade: 0 }),
  ]

  it('separa o zero deliberado do item que ninguém abriu', () => {
    const resumo = resumoDoFechamento(itens)
    expect(resumo).toMatchObject({ itens: 4, comQuantidade: 1, zerados: 3, nuncaTocados: 2 })
  })

  it('digitar zero num item esquecido tira ele dos nunca tocados', () => {
    const resumo = resumoDoFechamento(itens, new Map([['3', 0]]))
    expect(resumo.zerados).toBe(3)
    expect(resumo.nuncaTocados).toBe(1)
  })

  it('digitar quantidade move o item para os preenchidos e soma no total', () => {
    const resumo = resumoDoFechamento(itens, new Map([['4', 2]]))
    expect(resumo.comQuantidade).toBe(2)
    expect(resumo.zerados).toBe(2)
    expect(resumo.total).toBe(60)
  })

  it('folha vazia não quebra', () => {
    expect(resumoDoFechamento([])).toMatchObject({ itens: 0, zerados: 0, total: 0 })
  })
})

describe('hojeIso', () => {
  it('usa o dia local, não o UTC — 21h de Brasília ainda é hoje', () => {
    // 2026-03-10T23:30 local: em UTC-3 isso já é 11/03 lá fora.
    expect(hojeIso(new Date(2026, 2, 10, 23, 30))).toBe('2026-03-10')
  })

  it('preenche mês e dia com zero à esquerda', () => {
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
