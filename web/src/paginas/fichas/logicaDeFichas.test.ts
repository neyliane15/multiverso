import { describe, expect, it } from 'vitest'
import {
  agruparPorGrupo,
  custoDoItem,
  fatorEntreUnidades,
  fatorParaProduto,
  filtrarFichas,
  precoParaAMeta,
  quantidadeBruta,
  resumoDaFicha,
  vereditoDoCmv,
  type ItemEmEdicao,
  type ProdutoParaFicha,
} from './logicaDeFichas'

function produto(parcial: Partial<ProdutoParaFicha> & { id: string }): ProdutoParaFicha {
  return {
    nome: 'Produto',
    unidade: 'KG',
    custo_medio: 100,
    conteudo_quantidade: null,
    conteudo_unidade: null,
    ...parcial,
  }
}

const CARNE = produto({ id: 'p-carne', nome: 'Picanha', unidade: 'KG', custo_medio: 100 })
// Comprada por garrafa; a receita usa mililitro.
const CERVEJA = produto({
  id: 'p-cerveja', nome: 'Cerveja', unidade: 'UND', custo_medio: 10,
  conteudo_quantidade: 500, conteudo_unidade: 'ML',
})
const MAPA = new Map([CARNE, CERVEJA].map((p) => [p.id, p]))

const item = (parcial: Partial<ItemEmEdicao> & { produto_id: string }): ItemEmEdicao => ({
  quantidade: 1, unidade: 'G', perda_percentual: 0, ...parcial,
})

describe('fator entre unidades', () => {
  it('converte dentro da familia', () => {
    expect(fatorEntreUnidades('G', 'KG')).toBe(0.001)
    expect(fatorEntreUnidades('KG', 'G')).toBe(1000)
    expect(fatorEntreUnidades('ML', 'L')).toBe(0.001)
    expect(fatorEntreUnidades('UND', 'UND')).toBe(1)
  })

  it('aceita o que vem escrito na planilha da cozinha', () => {
    expect(fatorEntreUnidades('gr', 'KG')).toBe(0.001)
    expect(fatorEntreUnidades('Litro', 'ML')).toBe(1000)
    expect(fatorEntreUnidades('unid', 'UND')).toBe(1)
  })

  it('recusa o que nao se converte, em vez de chutar 1', () => {
    // O defeito que isto tranca: 60 ML de um produto vendido por UND viraria
    // 60 garrafas de cachaca numa caipirinha.
    expect(fatorEntreUnidades('G', 'ML')).toBeNull()
    expect(fatorEntreUnidades('ML', 'UND')).toBeNull()
    expect(fatorEntreUnidades('KG', 'UND')).toBeNull()
  })

  it('unidade desconhecida so serve para ela mesma', () => {
    expect(fatorEntreUnidades('CX', 'CX')).toBe(1)
    expect(fatorEntreUnidades('CX', 'KG')).toBeNull()
    expect(fatorEntreUnidades('', '')).toBeNull()
  })

  it('a embalagem resolve o que a familia nao resolve', () => {
    // 100 ML de uma garrafa de 500 ML = um quinto de garrafa.
    expect(fatorParaProduto('ML', CERVEJA)).toBeCloseTo(0.002, 6)
    expect(fatorParaProduto('L', CERVEJA)).toBeCloseTo(2, 6)
    // Sem embalagem declarada, continua sem resposta.
    expect(fatorParaProduto('ML', { ...CERVEJA, conteudo_quantidade: null })).toBeNull()
  })
})

describe('a conta do item', () => {
  it('a perda vira quantidade comprada', () => {
    // 200 G limpos com 20% de perda saem de 250 G no estoque.
    expect(quantidadeBruta(200, 20)).toBe(250)
    expect(quantidadeBruta(100, 0)).toBe(100)
  })

  it('custo do item = bruto convertido vezes o custo do catalogo', () => {
    const conta = custoDoItem(item({ produto_id: 'p-carne', quantidade: 200, unidade: 'G', perda_percentual: 20 }), CARNE)
    expect(conta.bruto).toBe(250)
    expect(conta.custo).toBe(25)
    expect(conta.incompativel).toBe(false)
  })

  it('pela embalagem, 100 ML de uma garrafa de 500 ML a R$ 10 custam R$ 2', () => {
    const conta = custoDoItem(item({ produto_id: 'p-cerveja', quantidade: 100, unidade: 'ML' }), CERVEJA)
    expect(conta.custo).toBe(2)
  })

  it('unidade incompativel nao vira custo, vira pendencia', () => {
    const conta = custoDoItem(
      item({ produto_id: 'p-cerveja', quantidade: 100, unidade: 'ML' }),
      { ...CERVEJA, conteudo_quantidade: null },
    )
    expect(conta.custo).toBeNull()
    expect(conta.incompativel).toBe(true)
  })

  it('insumo sem custo aparece marcado, e nao como custo zero disfarcado', () => {
    const conta = custoDoItem(item({ produto_id: 'x', quantidade: 1, unidade: 'KG' }), produto({ id: 'x', custo_medio: 0 }))
    expect(conta.custo).toBe(0)
    expect(conta.semCusto).toBe(true)
  })

  it('insumo que sumiu do catalogo nao derruba a conta', () => {
    const conta = custoDoItem(item({ produto_id: 'nao-existe' }), undefined)
    expect(conta.custo).toBeNull()
    expect(conta.incompativel).toBe(true)
  })
})

describe('o resumo do prato', () => {
  // Os mesmos numeros do teste de banco: se os dois lados divergirem, quebra.
  const ITENS = [
    item({ produto_id: 'p-carne', quantidade: 200, unidade: 'G', perda_percentual: 20 }),
    item({ produto_id: 'p-cerveja', quantidade: 100, unidade: 'ML' }),
  ]

  it('soma os itens, divide pelo rendimento e cruza com o preco', () => {
    const r = resumoDaFicha(ITENS, MAPA, 2, 54)
    expect(r.custoTotal).toBe(27)
    expect(r.custoPorcao).toBe(13.5)
    expect(r.cmv).toBe(25)
    expect(r.margem).toBe(40.5)
    expect(r.markup).toBe(4)
  })

  it('sem preco de venda, o CMV e nulo — nao zero', () => {
    const r = resumoDaFicha(ITENS, MAPA, 2, 0)
    expect(r.cmv).toBeNull()
    expect(r.margem).toBeNull()
    expect(r.custoPorcao).toBe(13.5)
  })

  it('rendimento vazio no meio da digitacao nao vira Infinity', () => {
    const r = resumoDaFicha(ITENS, MAPA, 0, 54)
    expect(Number.isFinite(r.custoPorcao)).toBe(true)
    expect(r.custoPorcao).toBe(27)
  })

  it('item incompativel nao entra no total, mas e contado', () => {
    const mapaSemEmbalagem = new Map(MAPA)
    mapaSemEmbalagem.set('p-cerveja', { ...CERVEJA, conteudo_quantidade: null })
    const r = resumoDaFicha(ITENS, mapaSemEmbalagem, 2, 54)
    expect(r.custoTotal).toBe(25)
    expect(r.incompativeis).toBe(1)
  })
})

describe('vale a pena ou nao', () => {
  it('julga contra a meta da casa, nao contra um numero de manual', () => {
    expect(vereditoDoCmv(25, 30)).toBe('dentro')
    expect(vereditoDoCmv(30, 30)).toBe('dentro')
    // Cinco pontos de tolerancia: 31% com meta de 30% e aviso, nao problema.
    expect(vereditoDoCmv(33, 30)).toBe('limite')
    expect(vereditoDoCmv(41, 30)).toBe('acima')
    // A mesma conta muda de veredito conforme a meta — que e o ponto.
    expect(vereditoDoCmv(25, 20)).toBe('limite')
    expect(vereditoDoCmv(25, 15)).toBe('acima')
  })

  it('sem preco nao ha julgamento', () => {
    expect(vereditoDoCmv(null, 30)).toBe('sem_preco')
  })

  it('diz o preco que faria o prato bater a meta', () => {
    expect(precoParaAMeta(13.5, 30)).toBe(45)
    expect(precoParaAMeta(13.5, 25)).toBe(54)
    expect(precoParaAMeta(0, 30)).toBeNull()
  })
})

describe('a listagem do cardapio', () => {
  const FICHAS = [
    { nome: 'Picanha na cerveja', grupo: 'Pratos' },
    { nome: 'Caipirinha', grupo: 'Drinks' },
    { nome: 'Bolo', grupo: null },
    { nome: 'Batata frita', grupo: 'Pratos' },
  ]

  it('agrupa pelo grupo do cardapio, em ordem, com os soltos no fim', () => {
    const grupos = agruparPorGrupo(FICHAS)
    expect(grupos.map((g) => g.nome)).toEqual(['Drinks', 'Pratos', 'Sem grupo'])
    expect(grupos[1]?.fichas.map((f) => f.nome)).toEqual(['Batata frita', 'Picanha na cerveja'])
  })

  it('a busca ignora acento e caixa', () => {
    expect(filtrarFichas(FICHAS, 'caipirinha').map((f) => f.nome)).toEqual(['Caipirinha'])
    expect(filtrarFichas(FICHAS, 'PRATOS')).toHaveLength(2)
    expect(filtrarFichas(FICHAS, '')).toHaveLength(4)
  })
})
