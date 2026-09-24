import { describe, expect, it } from 'vitest'
import {
  contarProdutosPorEstoque,
  diferencaDeMarcacao,
  filtrarProdutosDoSetor,
  produtosParaOEstoque,
  type ProdutoDoSetor,
} from './logicaDeEstoques'
import type { ProdutoCompleto } from '@/tipos/banco'

const BAR = 's-bar'
const COZ = 's-coz'
const GEL1 = 'e-gel1'
const GEL2 = 'e-gel2'

function produto(
  nome: string,
  setores: { setor: string; estoques: { id: string; nome: string }[] }[],
  ativo = true,
): ProdutoCompleto {
  return {
    id: `p-${nome}`,
    restaurante_id: 'r1',
    nome,
    codigo: null,
    codigo_barras: null,
    unidade: 'UND',
    custo_medio: 10,
    custo_atualizado_em: null,
    estoque_minimo: 0,
    perecivel: false,
    conteudo_quantidade: null,
    conteudo_unidade: null,
    observacao: null,
    ativo,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    categoria_id: 'c1',
    categoria_nome: 'BEBIDAS',
    categoria_cor: '#111111',
    setores: setores.map((s, i) => ({
      setor_id: s.setor,
      setor_nome: s.setor,
      setor_cor: '#222222',
      unidade: 'UND',
      custo: 10,
      ordem: i,
      custo_fixo: false,
      custo_atualizado_em: null,
      estoques: s.estoques,
    })),
  }
}

const CATALOGO = [
  produto('CERVEJA', [{ setor: BAR, estoques: [{ id: GEL1, nome: 'Geladeira 1' }] }]),
  produto('GIN', [{ setor: BAR, estoques: [] }]),
  produto('CACHACA', [
    { setor: BAR, estoques: [{ id: GEL1, nome: 'Geladeira 1' }, { id: GEL2, nome: 'Geladeira 2' }] },
  ]),
  produto('PICANHA', [{ setor: COZ, estoques: [] }]),
  produto('SUMIU', [{ setor: BAR, estoques: [] }], false),
]

describe('produtosParaOEstoque · so o que o banco aceitaria', () => {
  it('oferece os insumos DO SETOR, nao do restaurante', () => {
    // O banco recusa pendurar na Geladeira do Bar um produto que so existe na
    // Cozinha. Oferecer na tela o que o banco recusa e prometer o que nao se
    // cumpre.
    const lista = produtosParaOEstoque(CATALOGO, BAR, GEL2)
    expect(lista.map((p) => p.nome)).toEqual(['CACHACA', 'CERVEJA', 'GIN'])
  })

  it('insumo arquivado fica de fora', () => {
    expect(produtosParaOEstoque(CATALOGO, BAR, GEL1).some((p) => p.nome === 'SUMIU')).toBe(false)
  })

  it('marca quem ja esta neste lugar', () => {
    const lista = produtosParaOEstoque(CATALOGO, BAR, GEL1)
    expect(lista.find((p) => p.nome === 'CERVEJA')?.dentro).toBe(true)
    expect(lista.find((p) => p.nome === 'GIN')?.dentro).toBe(false)
  })

  it('avisa em que OUTROS lugares do mesmo setor o insumo ja esta', () => {
    // Quem monta a Geladeira 2 precisa ver que a cachaca ja esta na 1 — senao
    // marca sem perceber que criou uma segunda contagem do mesmo produto.
    const lista = produtosParaOEstoque(CATALOGO, BAR, GEL2)
    expect(lista.find((p) => p.nome === 'CACHACA')).toMatchObject({
      dentro: true,
      tambemEm: ['Geladeira 1'],
    })
    expect(lista.find((p) => p.nome === 'CERVEJA')).toMatchObject({
      dentro: false,
      tambemEm: ['Geladeira 1'],
    })
  })

  it('vem em ordem alfabetica', () => {
    const nomes = produtosParaOEstoque(CATALOGO, BAR, GEL1).map((p) => p.nome)
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  })

  it('setor sem insumo nenhum devolve lista vazia, nao erro', () => {
    expect(produtosParaOEstoque(CATALOGO, 's-vazio', 'e-x')).toEqual([])
  })
})

describe('filtrarProdutosDoSetor', () => {
  const lista = produtosParaOEstoque(CATALOGO, BAR, GEL1)

  it('busca sem acento e sem caixa', () => {
    expect(filtrarProdutosDoSetor(lista, 'cachaca').map((p) => p.nome)).toEqual(['CACHACA'])
    expect(filtrarProdutosDoSetor(lista, 'CERV').map((p) => p.nome)).toEqual(['CERVEJA'])
  })

  it('busca vazia devolve tudo', () => {
    expect(filtrarProdutosDoSetor(lista, '')).toHaveLength(lista.length)
  })
})

describe('diferencaDeMarcacao · o que muda, nao o total', () => {
  const lista: ProdutoDoSetor[] = [
    { id: 'a', nome: 'A', categoriaNome: null, categoriaCor: null, dentro: true, tambemEm: [] },
    { id: 'b', nome: 'B', categoriaNome: null, categoriaCor: null, dentro: false, tambemEm: [] },
    { id: 'c', nome: 'C', categoriaNome: null, categoriaCor: null, dentro: false, tambemEm: [] },
  ]

  it('conta quem entra e quem sai', () => {
    expect(diferencaDeMarcacao(lista, new Set(['b', 'c']))).toEqual({ entram: 2, saem: 1 })
  })

  it('nada marcado tira todo mundo que estava', () => {
    expect(diferencaDeMarcacao(lista, new Set())).toEqual({ entram: 0, saem: 1 })
  })

  it('sem mexer, nada muda', () => {
    expect(diferencaDeMarcacao(lista, new Set(['a']))).toEqual({ entram: 0, saem: 0 })
  })
})

describe('contarProdutosPorEstoque', () => {
  it('conta por lugar, e o mesmo insumo conta em cada um', () => {
    const contagem = contarProdutosPorEstoque(CATALOGO)
    expect(contagem.get(GEL1)).toBe(2)
    expect(contagem.get(GEL2)).toBe(1)
  })
})
