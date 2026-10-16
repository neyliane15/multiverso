import { describe, expect, it } from 'vitest'
import {
  agruparPorProduto,
  alertaDeReposicao,
  capitalParado,
  filtrarEOrdenar,
  kpisDaContagem,
  paginar,
  valorPorCategoria,
  zeradosPorCategoria,
  type CategoriaLida,
  type ItemLido,
} from './logicaDoDashboard'

const CATEGORIAS: CategoriaLida[] = [
  { id: 'c-prot', nome: 'Proteínas', cor: '#aa0000' },
  { id: 'c-beb', nome: 'Bebidas', cor: '#0000aa' },
  { id: 'c-limp', nome: 'Limpeza', cor: '#00aa00' },
]

/**
 * Uma linha da folha como o banco a entrega.
 *
 * `total` é coluna gerada em `contagem_itens` (quantidade × custo_unitario),
 * então o ajudante a calcula em vez de aceitar um valor avulso — um teste que
 * pudesse mandar total 500 com quantidade 1 e custo 1 estaria provando uma
 * aritmética que o banco não permite.
 */
function item(parcial: Partial<Omit<ItemLido, 'total'>> & { produto_id: string }): ItemLido {
  const quantidade = parcial.quantidade ?? 0
  const custoUnitario = parcial.custo_unitario ?? 10
  return {
    setor_id: 's-coz',
    estoque_id: null,
    unidade: 'KG',
    produto: { nome: 'Insumo', categoria_id: 'c-prot' },
    ...parcial,
    quantidade,
    custo_unitario: custoUnitario,
    total: quantidade * custoUnitario,
  }
}

describe('agruparPorProduto · consolidação por insumo', () => {
  it('soma as paradas do mesmo produto e conta quantas foram', () => {
    const linhas = agruparPorProduto(
      [
        item({ produto_id: 'p1', setor_id: 's-coz', quantidade: 10, custo_unitario: 100 }),
        item({ produto_id: 'p1', setor_id: 's-bar', quantidade: 2, custo_unitario: 80 }),
      ],
      CATEGORIAS,
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.quantidade).toBe(12)
    expect(linhas[0]!.total).toBe(1000 + 160)
    expect(linhas[0]!.paradas).toBe(2)
  })

  it('o valor unitário de um produto com custo diferente por setor é o médio ponderado', () => {
    const [linha] = agruparPorProduto(
      [
        item({ produto_id: 'p1', setor_id: 's-coz', quantidade: 10, custo_unitario: 100 }),
        item({ produto_id: 'p1', setor_id: 's-bar', quantidade: 2, custo_unitario: 80 }),
      ],
      CATEGORIAS,
    )
    // 1160 / 12 = 96,666…  — nem 100 nem 80, e é isso que a prateleira vale.
    expect(linha!.valorUnitario).toBeCloseTo(1160 / 12, 10)
  })

  it('unidades diferentes nas paradas anulam a quantidade, mas nunca o dinheiro', () => {
    const [linha] = agruparPorProduto(
      [
        item({ produto_id: 'p1', unidade: 'CX', quantidade: 3, custo_unitario: 120 }),
        item({ produto_id: 'p1', unidade: 'UND', quantidade: 24, custo_unitario: 5 }),
      ],
      CATEGORIAS,
    )
    expect(linha!.quantidade).toBeNull()
    expect(linha!.unidade).toBeNull()
    expect(linha!.total).toBe(360 + 120)
  })

  it('sem quantidade comparável o valor unitário cai no custo congelado, não em zero', () => {
    const [linha] = agruparPorProduto(
      [
        item({ produto_id: 'p1', unidade: 'CX', quantidade: 3, custo_unitario: 120 }),
        item({ produto_id: 'p1', unidade: 'UND', quantidade: 24, custo_unitario: 5 }),
      ],
      CATEGORIAS,
    )
    expect(linha!.valorUnitario).toBe(120)
  })

  it('item zerado mostra o custo da foto como valor unitário', () => {
    const [linha] = agruparPorProduto(
      [item({ produto_id: 'p1', quantidade: 0, custo_unitario: 42 })],
      CATEGORIAS,
    )
    expect(linha!.zerado).toBe(true)
    expect(linha!.total).toBe(0)
    expect(linha!.valorUnitario).toBe(42)
  })

  it('zerado exige zero em TODAS as paradas', () => {
    const [linha] = agruparPorProduto(
      [
        item({ produto_id: 'p1', setor_id: 's-coz', quantidade: 0 }),
        item({ produto_id: 'p1', setor_id: 's-bar', quantidade: 3 }),
      ],
      CATEGORIAS,
    )
    expect(linha!.zerado).toBe(false)
  })

  it('traz o nome e a cor da categoria do cadastro', () => {
    const [linha] = agruparPorProduto(
      [item({ produto_id: 'p1', produto: { nome: 'Gin', categoria_id: 'c-beb' } })],
      CATEGORIAS,
    )
    expect(linha!.categoriaNome).toBe('Bebidas')
    expect(linha!.categoriaCor).toBe('#0000aa')
  })

  it('produto sem categoria cai num grupo próprio, sem cor', () => {
    const [linha] = agruparPorProduto(
      [item({ produto_id: 'p1', produto: { nome: 'Guardanapo', categoria_id: null } })],
      CATEGORIAS,
    )
    expect(linha!.categoriaNome).toBe('Sem categoria')
    expect(linha!.categoriaCor).toBeNull()
  })

  it('categoria arquivada (fora do cadastro ativo) continua aparecendo', () => {
    const [linha] = agruparPorProduto(
      [item({ produto_id: 'p1', produto: { nome: 'Vinho', categoria_id: 'c-sumiu' } })],
      CATEGORIAS,
    )
    expect(linha!.categoriaNome).toBe('Outra categoria')
  })

  it('sai em ordem alfabética pt-BR', () => {
    const linhas = agruparPorProduto(
      [
        item({ produto_id: 'p1', produto: { nome: 'Óleo', categoria_id: 'c-prot' } }),
        item({ produto_id: 'p2', produto: { nome: 'Açúcar', categoria_id: 'c-prot' } }),
        item({ produto_id: 'p3', produto: { nome: 'Bacon', categoria_id: 'c-prot' } }),
      ],
      CATEGORIAS,
    )
    expect(linhas.map((l) => l.nome)).toEqual(['Açúcar', 'Bacon', 'Óleo'])
  })
})

/* ─────────────────────────────────────────────────────────── os KPIs ────── */

const FOLHA: ItemLido[] = [
  // Proteínas: 1000 + 0
  item({ produto_id: 'p-picanha', quantidade: 10, custo_unitario: 100, produto: { nome: 'Picanha', categoria_id: 'c-prot' } }),
  item({ produto_id: 'p-costela', quantidade: 0, custo_unitario: 50, produto: { nome: 'Costela', categoria_id: 'c-prot' } }),
  // Bebidas: 300 + 100 + 0
  item({ produto_id: 'p-cerveja', quantidade: 30, custo_unitario: 10, unidade: 'UND', produto: { nome: 'Cerveja', categoria_id: 'c-beb' } }),
  item({ produto_id: 'p-gin', quantidade: 2, custo_unitario: 50, unidade: 'UND', produto: { nome: 'Gin', categoria_id: 'c-beb' } }),
  item({ produto_id: 'p-tonica', quantidade: 0, custo_unitario: 6, unidade: 'UND', produto: { nome: 'Tônica', categoria_id: 'c-beb' } }),
  // Limpeza: 0
  item({ produto_id: 'p-sabao', quantidade: 0, custo_unitario: 8, unidade: 'UND', produto: { nome: 'Sabão', categoria_id: 'c-limp' } }),
]

const CONTADOS = agruparPorProduto(FOLHA, CATEGORIAS)

describe('kpisDaContagem', () => {
  it('o valor total é a soma do dinheiro de toda a folha', () => {
    expect(kpisDaContagem(CONTADOS, 2).valorTotal).toBe(1000 + 300 + 100)
  })

  it('itens contados é o número de INSUMOS, não de linhas da folha', () => {
    const comRepetido = agruparPorProduto(
      [
        ...FOLHA,
        item({ produto_id: 'p-picanha', setor_id: 's-bar', quantidade: 1, custo_unitario: 80, produto: { nome: 'Picanha', categoria_id: 'c-prot' } }),
      ],
      CATEGORIAS,
    )
    expect(comRepetido).toHaveLength(6)
    expect(kpisDaContagem(comRepetido, 2).itensContados).toBe(6)
  })

  it('conta as categorias que têm item e repassa as abas que vieram do servidor', () => {
    const kpis = kpisDaContagem(CONTADOS, 8)
    expect(kpis.categorias).toBe(3)
    expect(kpis.abas).toBe(8)
  })

  it('zerados vêm com a quantidade e o percentual do total contado', () => {
    const kpis = kpisDaContagem(CONTADOS, 2)
    expect(kpis.zerados).toBe(3)
    expect(kpis.percentualZerados).toBeCloseTo((3 / 6) * 100, 10)
  })

  it('a maior categoria é a de maior valor, com a fatia dela', () => {
    const kpis = kpisDaContagem(CONTADOS, 2)
    expect(kpis.maiorCategoria?.nome).toBe('Proteínas')
    expect(kpis.maiorCategoria?.valor).toBe(1000)
    expect(kpis.maiorCategoria?.participacao).toBeCloseTo((1000 / 1400) * 100, 10)
  })

  it('folha vazia não divide por zero nem inventa maior categoria', () => {
    const kpis = kpisDaContagem([], 0)
    expect(kpis.percentualZerados).toBe(0)
    expect(kpis.maiorCategoria).toBeNull()
  })
})

describe('valorPorCategoria', () => {
  it('ordena por valor e dá a fatia de cada uma', () => {
    const fatias = valorPorCategoria(CONTADOS)
    expect(fatias.map((f) => f.nome)).toEqual(['Proteínas', 'Bebidas', 'Limpeza'])
    expect(fatias[1]!.valor).toBe(400)
  })

  it('a barra é relativa à MAIOR categoria, não ao total', () => {
    const fatias = valorPorCategoria(CONTADOS)
    expect(fatias[0]!.proporcao).toBe(100)
    expect(fatias[1]!.proporcao).toBeCloseTo(40, 10)
    // E a fatia continua sendo a do total, que é outro número.
    expect(fatias[1]!.participacao).toBeCloseTo((400 / 1400) * 100, 10)
  })

  it('categoria inteira zerada aparece com valor zero, não desaparece', () => {
    const fatias = valorPorCategoria(CONTADOS)
    const limpeza = fatias.find((f) => f.nome === 'Limpeza')
    expect(limpeza?.valor).toBe(0)
    expect(limpeza?.proporcao).toBe(0)
  })

  it('tudo zerado não divide por zero', () => {
    const fatias = valorPorCategoria(
      agruparPorProduto([item({ produto_id: 'p1', quantidade: 0 })], CATEGORIAS),
    )
    expect(fatias[0]!.participacao).toBe(0)
    expect(fatias[0]!.proporcao).toBe(0)
  })
})

describe('capitalParado', () => {
  it('é o ranking por valor, e o zerado nunca entra', () => {
    const ranking = capitalParado(CONTADOS)
    expect(ranking.map((p) => p.nome)).toEqual(['Picanha', 'Cerveja', 'Gin'])
  })

  it('respeita o limite pedido', () => {
    expect(capitalParado(CONTADOS, 2).map((p) => p.nome)).toEqual(['Picanha', 'Cerveja'])
  })
})

describe('zeradosPorCategoria', () => {
  it('só traz categoria com zerado, ordenada pela QUANTIDADE de zerados', () => {
    const zerados = zeradosPorCategoria(CONTADOS)
    expect(zerados.map((z) => [z.nome, z.zerados])).toEqual([
      ['Bebidas', 1],
      ['Limpeza', 1],
      ['Proteínas', 1],
    ])
  })

  it('o percentual é da própria categoria', () => {
    const zerados = zeradosPorCategoria(CONTADOS)
    const limpeza = zerados.find((z) => z.nome === 'Limpeza')!
    expect(limpeza.percentual).toBe(100)
    const bebidas = zerados.find((z) => z.nome === 'Bebidas')!
    expect(bebidas.percentual).toBeCloseTo((1 / 3) * 100, 10)
  })

  it('uma categoria com vinte zerados vem antes de uma com dois a 100%', () => {
    const itens: ItemLido[] = [
      ...Array.from({ length: 20 }, (_, i) =>
        item({ produto_id: `g${i}`, quantidade: 0, produto: { nome: `G${i}`, categoria_id: 'c-prot' } }),
      ),
      item({ produto_id: 'g-ok', quantidade: 5, produto: { nome: 'Ok', categoria_id: 'c-prot' } }),
      item({ produto_id: 'z1', quantidade: 0, produto: { nome: 'Z1', categoria_id: 'c-limp' } }),
      item({ produto_id: 'z2', quantidade: 0, produto: { nome: 'Z2', categoria_id: 'c-limp' } }),
    ]
    const zerados = zeradosPorCategoria(agruparPorProduto(itens, CATEGORIAS))
    expect(zerados[0]!.nome).toBe('Proteínas')
    expect(zerados[1]!.percentual).toBe(100)
  })
})

describe('alertaDeReposicao', () => {
  it('é nulo quando não há zerado nenhum', () => {
    expect(alertaDeReposicao([])).toBeNull()
  })

  it('nomeia até três categorias e diz quantas sobraram', () => {
    const texto = alertaDeReposicao([
      { categoriaId: 'a', nome: 'Bebidas', cor: null, zerados: 9, itens: 20, percentual: 45 },
      { categoriaId: 'b', nome: 'Limpeza', cor: null, zerados: 4, itens: 6, percentual: 66 },
      { categoriaId: 'c', nome: 'Secos', cor: null, zerados: 2, itens: 9, percentual: 22 },
      { categoriaId: 'd', nome: 'Hortifrúti', cor: null, zerados: 1, itens: 5, percentual: 20 },
    ])
    expect(texto).toBe(
      '16 insumos zerados, concentrados em Bebidas (9), Limpeza (4) e Secos (2), e mais 1 categoria.',
    )
  })

  it('com uma só categoria não monta lista nem resto', () => {
    expect(
      alertaDeReposicao([
        { categoriaId: 'a', nome: 'Bebidas', cor: null, zerados: 1, itens: 3, percentual: 33 },
      ]),
    ).toBe('1 insumo zerado, concentrados em Bebidas (1).')
  })
})

/* ───────────────────────────────────────────────── tabela completa ─────── */

describe('filtrarEOrdenar', () => {
  it('busca sem acento e por pedaço, no nome e na categoria', () => {
    expect(filtrarEOrdenar(CONTADOS, { busca: 'tonica' }).map((p) => p.nome)).toEqual(['Tônica'])
    expect(filtrarEOrdenar(CONTADOS, { busca: 'protein' }).map((p) => p.nome).sort()).toEqual([
      'Costela',
      'Picanha',
    ])
  })

  it('exige todos os termos, em qualquer ordem', () => {
    expect(filtrarEOrdenar(CONTADOS, { busca: 'bebidas gin' }).map((p) => p.nome)).toEqual(['Gin'])
  })

  it('filtra por categoria', () => {
    expect(
      filtrarEOrdenar(CONTADOS, { categoriaId: 'c-beb', ordem: 'nome' }).map((p) => p.nome),
    ).toEqual(['Cerveja', 'Gin', 'Tônica'])
  })

  it('"só zerados" deixa apenas os zerados', () => {
    expect(
      filtrarEOrdenar(CONTADOS, { soZerados: true, ordem: 'nome' }).map((p) => p.nome),
    ).toEqual(['Costela', 'Sabão', 'Tônica'])
  })

  it('a ordem padrão é por valor, do maior para o menor', () => {
    expect(filtrarEOrdenar(CONTADOS).map((p) => p.nome).slice(0, 3)).toEqual([
      'Picanha',
      'Cerveja',
      'Gin',
    ])
  })

  it('ordenar por estoque põe a quantidade não comparável no FIM, não no zero', () => {
    const comDivergencia = agruparPorProduto(
      [
        ...FOLHA,
        item({ produto_id: 'p-mix', unidade: 'CX', quantidade: 3, custo_unitario: 20, produto: { nome: 'Mix', categoria_id: 'c-beb' } }),
        item({ produto_id: 'p-mix', unidade: 'UND', quantidade: 36, custo_unitario: 2, produto: { nome: 'Mix', categoria_id: 'c-beb' } }),
      ],
      CATEGORIAS,
    )
    const nomes = filtrarEOrdenar(comDivergencia, { ordem: 'estoque' }).map((p) => p.nome)
    expect(nomes[0]).toBe('Cerveja')
    expect(nomes[nomes.length - 1]).toBe('Mix')
  })

  it('empate de valor cai no nome, para a ordem não dançar entre renderizações', () => {
    const empate = agruparPorProduto(
      [
        item({ produto_id: 'p1', quantidade: 1, custo_unitario: 10, produto: { nome: 'Zebu', categoria_id: 'c-prot' } }),
        item({ produto_id: 'p2', quantidade: 1, custo_unitario: 10, produto: { nome: 'Alho', categoria_id: 'c-prot' } }),
      ],
      CATEGORIAS,
    )
    expect(filtrarEOrdenar(empate).map((p) => p.nome)).toEqual(['Alho', 'Zebu'])
  })

  it('não altera o array que recebeu', () => {
    const antes = CONTADOS.map((p) => p.nome)
    filtrarEOrdenar(CONTADOS, { ordem: 'estoque' })
    expect(CONTADOS.map((p) => p.nome)).toEqual(antes)
  })
})

describe('paginar', () => {
  const lista = Array.from({ length: 53 }, (_, i) => i + 1)

  it('devolve a fatia e os rótulos em base 1', () => {
    const pagina = paginar(lista, 1, 25)
    expect(pagina.linhas).toHaveLength(25)
    expect([pagina.de, pagina.ate, pagina.total, pagina.paginas]).toEqual([1, 25, 53, 3])
  })

  it('a última página traz o resto', () => {
    const pagina = paginar(lista, 3, 25)
    expect(pagina.linhas).toEqual([51, 52, 53])
    expect([pagina.de, pagina.ate]).toEqual([51, 53])
  })

  it('corrige a página pedida quando o filtro encurtou a lista', () => {
    const pagina = paginar([1, 2, 3], 7, 25)
    expect(pagina.pagina).toBe(1)
    expect(pagina.linhas).toEqual([1, 2, 3])
  })

  it('página zero ou negativa vira a primeira', () => {
    expect(paginar(lista, 0, 25).pagina).toBe(1)
    expect(paginar(lista, -4, 25).pagina).toBe(1)
  })

  it('lista vazia tem uma página e nenhum rótulo', () => {
    const pagina = paginar([], 1, 25)
    expect([pagina.paginas, pagina.de, pagina.ate, pagina.total]).toEqual([1, 0, 0, 0])
  })
})
