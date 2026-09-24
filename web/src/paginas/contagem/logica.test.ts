import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  chaveDoLugar,
  filtrarItens,
  foiTrabalhado,
  hojeIso,
  chaveDoSetor,
  ehSelecaoDeSetor,
  estoqueDaSelecao,
  gruposDaParada,
  itensDaParada,
  montarAbas,
  montarArvoreDeSetores,
  montarParadas,
  ondeFica,
  resumoDoFechamento,
  rotuloDaAba,
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

  it('item sem insumo carregado não quebra a busca', () => {
    const orfao = [item({ id: '9', produto: null })]
    expect(filtrarItens(orfao, { busca: 'qualquer' })).toEqual([])
    expect(filtrarItens(orfao)).toHaveLength(1)
  })
})

describe('foiTrabalhado · o que ainda falta contar', () => {
  it('zero carimbado é item trabalhado: o insumo acabou, não foi esquecido', () => {
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

describe('montarAbas · a folha se anda por parada, nao por setor', () => {
  const TOTAIS = [
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-1', estoque_nome: 'Geladeira 1', itens: 2 },
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-2', estoque_nome: 'Geladeira 2', itens: 1 },
    { setor_id: 's-horti', setor_nome: 'Hortifruti', setor_cor: '#222222', estoque_id: null, estoque_nome: null, itens: 2 },
  ]

  function linha(
    id: string,
    setor_id: string,
    estoque_id: string | null,
    quantidade: number,
    custo = 10,
  ): ItemContavel {
    return {
      id,
      produto_id: `p-${id}`,
      setor_id,
      estoque_id,
      quantidade,
      unidade: 'UND',
      custo_unitario: custo,
      total: quantidade * custo,
      contado_em: null,
      produto: { nome: id, categoria_id: null },
    }
  }

  const ITENS = [
    linha('a', 's-bar', 'e-1', 3),
    linha('b', 's-bar', 'e-1', 0),
    linha('c', 's-bar', 'e-2', 5),
    linha('d', 's-horti', null, 2),
    linha('e', 's-horti', null, 0),
  ]

  it('cada lugar vira uma parada, e o setor sem subdivisao tambem', () => {
    expect(montarAbas(TOTAIS, ITENS).map((a) => a.id)).toEqual([
      's-bar:e-1',
      's-bar:e-2',
      's-horti:',
    ])
  })

  it('o total e o progresso saem so dos itens daquela parada', () => {
    const [gel1, gel2, horti] = montarAbas(TOTAIS, ITENS)
    expect(gel1).toMatchObject({ preenchidos: 1, itens: 2, total: 30 })
    expect(gel2).toMatchObject({ preenchidos: 1, itens: 1, total: 50 })
    expect(horti).toMatchObject({ preenchidos: 1, itens: 2, total: 20 })
  })

  it('o rascunho local entra no total antes de o servidor confirmar', () => {
    const abas = montarAbas(TOTAIS, ITENS, new Map([['b', 4]]))
    expect(abas[0]).toMatchObject({ preenchidos: 2, total: 70 })
  })

  it('duas geladeiras do mesmo setor nao se misturam', () => {
    // O defeito que isto tranca: filtrar so por setor_id juntaria a Geladeira 1
    // e a 2 numa parada so, e quem esta contando a 2 veria o que ja contou na 1.
    const abas = montarAbas(TOTAIS, ITENS)
    expect(abas[0]?.total).not.toBe(abas[1]?.total)
    expect((abas[0]?.total ?? 0) + (abas[1]?.total ?? 0)).toBe(80)
  })

  it('o lugar nao se explica sozinho: o rotulo carrega o setor', () => {
    const [gel1, , horti] = montarAbas(TOTAIS, ITENS)
    expect(gel1 && rotuloDaAba(gel1)).toBe('Bar › Geladeira 1')
    expect(horti && rotuloDaAba(horti)).toBe('Hortifruti')
  })

  it('no setor ja dividido, a parada sem lugar se chama "Sem lugar definido"', () => {
    // "Bar" ao lado de "Geladeira 1" e "Geladeira 2" faria pensar que a
    // primeira contem as outras. Ela nao contem: e o resto do bar, o que ainda
    // nao foi posto em geladeira nenhuma.
    const totais = [
      ...TOTAIS,
      { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: null, estoque_nome: null, itens: 40 },
    ]
    const resto = montarAbas(totais, ITENS).find((a) => a.id === 's-bar:')
    expect(resto).toMatchObject({ titulo: 'Sem lugar definido', subtitulo: 'Bar' })
    expect(resto && rotuloDaAba(resto)).toBe('Bar › Sem lugar definido')
  })

  it('setor sem subdivisao nenhuma continua se chamando pelo proprio nome', () => {
    const horti = montarAbas(TOTAIS, ITENS).find((a) => a.id === 's-horti:')
    expect(horti).toMatchObject({ titulo: 'Hortifruti', subtitulo: null })
  })

  it('chaveDoLugar trata nulo e indefinido como o setor inteiro', () => {
    expect(chaveDoLugar('s', null)).toBe(chaveDoLugar('s', undefined))
  })
})

describe('o eixo da contagem · as mesmas linhas, tres recortes', () => {
  const LUGARES = [
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-1', estoque_nome: 'Geladeira 1', itens: 2 },
    { setor_id: 's-coz', setor_nome: 'Cozinha', setor_cor: '#222222', estoque_id: null, estoque_nome: null, itens: 2 },
  ]
  const CATS: CategoriaSimples[] = [
    { id: 'c-beb', nome: 'BEBIDAS', cor: '#a1a1a1' },
    { id: 'c-car', nome: 'CARNES', cor: '#b2b2b2' },
  ]

  function linha(
    id: string,
    setor_id: string,
    estoque_id: string | null,
    categoria_id: string | null,
    quantidade: number,
    custo = 10,
  ): ItemContavel {
    return {
      id, produto_id: `p-${id}`, setor_id, estoque_id, quantidade,
      unidade: 'UND', custo_unitario: custo, total: quantidade * custo,
      contado_em: null, produto: { nome: id.toUpperCase(), categoria_id },
    }
  }

  const ITENS = [
    linha('cerveja', 's-bar', 'e-1', 'c-beb', 2),
    linha('gin', 's-bar', 'e-1', 'c-beb', 0),
    linha('picanha', 's-coz', null, 'c-car', 1),
    linha('suco', 's-coz', null, 'c-beb', 0),
  ]

  it('trocar de eixo nao cria nem esconde linha nenhuma', () => {
    // A garantia que importa: os tres eixos sao recortes das MESMAS linhas.
    for (const eixo of ['setor', 'categoria', 'produto'] as const) {
      const paradas = montarParadas(eixo, LUGARES, CATS, ITENS)
      const vistos = new Set<string>()
      if (eixo === 'produto') {
        for (const g of gruposDaParada(eixo, ITENS, CATS, LUGARES)) {
          for (const i of g.itens) vistos.add(i.id)
        }
      } else {
        for (const parada of paradas) {
          for (const i of itensDaParada(eixo, parada.id, ITENS)) vistos.add(i.id)
        }
      }
      expect([...vistos].sort()).toEqual(['cerveja', 'gin', 'picanha', 'suco'])
    }
  })

  it('no eixo insumo nao ha parada: uma navegacao de uma entrada so e enfeite', () => {
    expect(montarParadas('produto', LUGARES, CATS, ITENS)).toEqual([])
  })

  it('no eixo setor, as paradas sao os lugares', () => {
    const paradas = montarParadas('setor', LUGARES, CATS, ITENS)
    expect(paradas.map((p) => p.titulo)).toEqual(['Geladeira 1', 'Cozinha'])
  })

  it('no eixo categoria, as paradas sao as categorias COM linha', () => {
    // Listar as 21 do cadastro com metade zerada faria a navegacao mentir
    // sobre o tamanho do trabalho.
    const paradas = montarParadas('categoria', LUGARES, [...CATS, { id: 'c-vazia', nome: 'VAZIA', cor: '#c3c3c3' }], ITENS)
    expect(paradas.map((p) => p.titulo)).toEqual(['BEBIDAS', 'CARNES'])
    expect(paradas[0]).toMatchObject({ itens: 3, preenchidos: 1 })
  })

  it('dentro da parada vem sempre o OUTRO eixo', () => {
    const noSetor = gruposDaParada('setor', itensDaParada('setor', 's-bar:e-1', ITENS), CATS, LUGARES)
    expect(noSetor.map((g) => g.nome)).toEqual(['BEBIDAS'])

    const naCategoria = gruposDaParada('categoria', itensDaParada('categoria', 'c-beb', ITENS), CATS, LUGARES)
    expect(naCategoria.map((g) => g.nome)).toEqual(['Bar › Geladeira 1', 'Cozinha'])
  })

  it('no eixo insumo e um bloco so, em ordem alfabetica', () => {
    const grupos = gruposDaParada('produto', ITENS, CATS, LUGARES)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.itens.map((i) => i.produto?.nome)).toEqual(['CERVEJA', 'GIN', 'PICANHA', 'SUCO'])
  })

  it('a linha da lista unica diz de onde e', () => {
    // Sem isso, um produto que vive em dois lugares aparece duas vezes
    // identicas e nao da para saber qual se esta preenchendo.
    const [cerveja, , picanha] = ITENS
    expect(cerveja && ondeFica(cerveja, LUGARES)).toBe('Bar › Geladeira 1')
    expect(picanha && ondeFica(picanha, LUGARES)).toBe('Cozinha')
  })

  it('linha de um setor que saiu do cadastro nao some: vai para o fim, visivel', () => {
    const orfa = linha('sumido', 's-antigo', null, 'c-car', 5)
    const grupos = gruposDaParada('categoria', [...ITENS, orfa], CATS, LUGARES)
    const resto = grupos.at(-1)
    expect(resto?.nome).toBe('Fora do cadastro')
    expect(resto?.itens.map((i) => i.id)).toEqual(['sumido'])
  })

  it('insumo sem categoria cai num balde proprio, nao no vazio', () => {
    const semCat = linha('avulso', 's-coz', null, null, 1)
    const grupos = gruposDaParada('setor', [semCat], CATS, LUGARES)
    expect(grupos.map((g) => g.nome)).toEqual(['Sem categoria'])
  })
})

describe('lista unica · o mesmo insumo em varios lugares', () => {
  const LUGARES = [
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-g1', estoque_nome: 'Geladeira 1', itens: 1 },
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-g2', estoque_nome: 'Geladeira 2', itens: 1 },
    { setor_id: 's-coz', setor_nome: 'Cozinha', setor_cor: '#222222', estoque_id: 'e-cf', estoque_nome: 'Câmara fria', itens: 1 },
    { setor_id: 's-coz', setor_nome: 'Cozinha', setor_cor: '#222222', estoque_id: 'e-de', estoque_nome: 'Despensa', itens: 1 },
  ]

  function mesma(id: string, setor_id: string, estoque_id: string): ItemContavel {
    return {
      id, produto_id: 'p-cachaca', setor_id, estoque_id, quantidade: 0,
      unidade: 'UND', custo_unitario: 7.91, total: 0, contado_em: null,
      produto: { nome: 'CACHAÇA 51', categoria_id: 'c-beb' },
    }
  }

  // De proposito fora de ordem: e assim que o servidor pode devolver.
  const ITENS = [
    mesma('4', 's-coz', 'e-de'),
    mesma('1', 's-bar', 'e-g1'),
    mesma('3', 's-coz', 'e-cf'),
    mesma('2', 's-bar', 'e-g2'),
  ]

  it('as linhas do mesmo insumo saem na ordem dos lugares, nao ao acaso', () => {
    // Cinco linhas com o mesmo nome em ordem aleatoria transformam preencher a
    // terceira geladeira em adivinhacao.
    const [grupo] = gruposDaParada('produto', ITENS, [], LUGARES)
    expect(grupo?.itens.map((i) => i.id)).toEqual(['1', '2', '3', '4'])
  })

  it('cada linha se explica pelo lugar', () => {
    const [grupo] = gruposDaParada('produto', ITENS, [], LUGARES)
    expect(grupo?.itens.map((i) => ondeFica(i, LUGARES))).toEqual([
      'Bar › Geladeira 1',
      'Bar › Geladeira 2',
      'Cozinha › Câmara fria',
      'Cozinha › Despensa',
    ])
  })

  it('no eixo setor, cada lugar e uma parada com uma linha so', () => {
    const paradas = montarParadas('setor', LUGARES, [], ITENS)
    expect(paradas).toHaveLength(4)
    for (const parada of paradas) {
      expect(itensDaParada('setor', parada.id, ITENS)).toHaveLength(1)
    }
  })

  it('no eixo categoria, o insumo aparece uma vez por lugar', () => {
    const grupos = gruposDaParada(
      'categoria',
      itensDaParada('categoria', 'c-beb', ITENS),
      [{ id: 'c-beb', nome: 'BEBIDAS', cor: '#a1a1a1' }],
      LUGARES,
    )
    expect(grupos.map((g) => g.nome)).toEqual([
      'Bar › Geladeira 1', 'Bar › Geladeira 2', 'Cozinha › Câmara fria', 'Cozinha › Despensa',
    ])
    expect(grupos.every((g) => g.itens.length === 1)).toBe(true)
  })
})

describe('a arvore da contagem · setor por fora, estoque de setor por dentro', () => {
  const LUGARES = [
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-g1', estoque_nome: 'Geladeira 1', itens: 2 },
    { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: 'e-g2', estoque_nome: 'Geladeira 2', itens: 1 },
    { setor_id: 's-coz', setor_nome: 'Cozinha', setor_cor: '#222222', estoque_id: null, estoque_nome: null, itens: 1 },
  ]
  const CATS: CategoriaSimples[] = [
    { id: 'c-beb', nome: 'BEBIDAS', cor: '#a1a1a1' },
    { id: 'c-car', nome: 'CARNES', cor: '#b2b2b2' },
  ]

  function linha(
    id: string,
    setor_id: string,
    estoque_id: string | null,
    categoria_id: string | null,
    quantidade: number,
    custo = 10,
  ): ItemContavel {
    return {
      id, produto_id: `p-${id}`, setor_id, estoque_id, quantidade,
      unidade: 'UND', custo_unitario: custo, total: quantidade * custo,
      contado_em: null, produto: { nome: id.toUpperCase(), categoria_id },
    }
  }

  const ITENS = [
    linha('cerveja', 's-bar', 'e-g1', 'c-beb', 2),
    linha('gin', 's-bar', 'e-g1', 'c-beb', 0),
    linha('vinho', 's-bar', 'e-g2', 'c-beb', 3),
    linha('picanha', 's-coz', null, 'c-car', 1),
  ]

  it('um galho por setor, com os lugares dentro', () => {
    const arvore = montarArvoreDeSetores(LUGARES, ITENS)
    expect(arvore.map((r) => r.nome)).toEqual(['Bar', 'Cozinha'])
    expect(arvore[0]?.lugares.map((l) => l.titulo)).toEqual(['Geladeira 1', 'Geladeira 2'])
  })

  it('o galho soma os lugares: itens, preenchidos e dinheiro', () => {
    const [bar] = montarArvoreDeSetores(LUGARES, ITENS)
    expect(bar).toMatchObject({ itens: 3, preenchidos: 2, total: 50 })
  })

  it('setor sem subdivisao nao ganha um nivel a mais so para ter um', () => {
    // Um galho com uma folha so chamada "Cozinha" dentro da "Cozinha" seria
    // um clique a mais que nao separa nada.
    const coz = montarArvoreDeSetores(LUGARES, ITENS).find((r) => r.setorId === 's-coz')
    expect(coz?.lugares).toEqual([])
    expect(coz).toMatchObject({ itens: 1, preenchidos: 1, total: 10 })
  })

  it('o rascunho local ja mexe no galho, antes de o servidor confirmar', () => {
    const [bar] = montarArvoreDeSetores(LUGARES, ITENS, new Map([['gin', 4]]))
    expect(bar).toMatchObject({ preenchidos: 3, total: 90 })
  })

  it('a chave do setor inteiro nao se confunde com a de um lugar', () => {
    // `s-bar:` (o lugar sem estoque) e `setor:s-bar` (o setor todo) sao coisas
    // diferentes, e trocar uma pela outra mostraria a folha errada.
    expect(chaveDoSetor('s-bar')).not.toBe(chaveDoLugar('s-bar', null))
    expect(ehSelecaoDeSetor(chaveDoSetor('s-bar'))).toBe(true)
    expect(ehSelecaoDeSetor(chaveDoLugar('s-bar', null))).toBe(false)
    expect(ehSelecaoDeSetor(null)).toBe(false)
  })

  it('escolher o setor traz as linhas de TODOS os lugares dele', () => {
    const doBar = itensDaParada('setor', chaveDoSetor('s-bar'), ITENS)
    expect(doBar.map((i) => i.id).sort()).toEqual(['cerveja', 'gin', 'vinho'])
  })

  it('escolher um lugar estreita a folha so para ele', () => {
    const g2 = itensDaParada('setor', chaveDoLugar('s-bar', 'e-g2'), ITENS)
    expect(g2.map((i) => i.id)).toEqual(['vinho'])
  })

  it('com o setor inteiro aberto, os blocos sao os ESTOQUES do setor', () => {
    // O pedido de quem conta: clicar no Bar e ver a Geladeira 1 e a 2 como
    // blocos, cada uma com o seu total.
    const itens = itensDaParada('setor', chaveDoSetor('s-bar'), ITENS)
    const grupos = gruposDaParada('setor', itens, CATS, LUGARES, undefined, chaveDoSetor('s-bar'))
    expect(grupos.map((g) => g.nome)).toEqual(['Bar › Geladeira 1', 'Bar › Geladeira 2'])
    expect(grupos.map((g) => g.total)).toEqual([20, 30])
  })

  it('os blocos do setor nao trazem lugar de outro setor', () => {
    const grupos = gruposDaParada('setor', ITENS, CATS, LUGARES, undefined, chaveDoSetor('s-bar'))
    // A picanha e da Cozinha: nao pode virar bloco do Bar, mas tambem nao
    // pode sumir — vai para o balde visivel do fim.
    expect(grupos.map((g) => g.nome)).toEqual(['Bar › Geladeira 1', 'Bar › Geladeira 2', 'Sem lugar definido'])
  })

  it('o resto do setor se chama "Sem lugar definido", nao pelo nome do setor', () => {
    // "Bar" como bloco ao lado de "Bar › Geladeira 1" faria pensar que um
    // contem o outro. Nao contem: e o que ainda nao foi posto em geladeira.
    const comResto = [
      ...LUGARES,
      { setor_id: 's-bar', setor_nome: 'Bar', setor_cor: '#111111', estoque_id: null, estoque_nome: null, itens: 1 },
    ]
    const solto = linha('agua', 's-bar', null, 'c-beb', 1)
    const itens = [...ITENS, solto]
    const grupos = gruposDaParada(
      'setor',
      itensDaParada('setor', chaveDoSetor('s-bar'), itens),
      CATS,
      comResto,
      undefined,
      chaveDoSetor('s-bar'),
    )
    expect(grupos.map((g) => g.nome)).toEqual([
      'Bar › Geladeira 1',
      'Bar › Geladeira 2',
      'Sem lugar definido',
    ])
  })

  it('setor sem subdivisao abre por CATEGORIA, nao num bloco so com o proprio nome', () => {
    // Um cabecalho "Cozinha" dentro da parada "Cozinha", com o rodape dizendo
    // "Cozinha", nao separa nada — e so ruido em cima da folha.
    const itens = [...ITENS, linha('frango', 's-coz', null, 'c-beb', 0)]
    const grupos = gruposDaParada(
      'setor',
      itensDaParada('setor', chaveDoSetor('s-coz'), itens),
      CATS,
      LUGARES,
      undefined,
      chaveDoSetor('s-coz'),
    )
    expect(grupos.map((g) => g.nome)).toEqual(['BEBIDAS', 'CARNES'])
  })

  it('dentro de UM lugar a categoria volta a mandar', () => {
    // Ali ja nao ha o que separar por lugar: dividir por lugar daria um bloco
    // so, com o nome do lugar repetido no titulo da parada.
    const itens = itensDaParada('setor', chaveDoLugar('s-bar', 'e-g1'), ITENS)
    const grupos = gruposDaParada('setor', itens, CATS, LUGARES, undefined, chaveDoLugar('s-bar', 'e-g1'))
    expect(grupos.map((g) => g.nome)).toEqual(['BEBIDAS'])
  })

  it('lugar criado depois da folha aparece na arvore, com 0/0', () => {
    // O defeito que isto tranca: a "Prateleira" recem-criada nao existia em
    // lugar nenhum da tela, e quem acabou de cria-la nao tinha como saber se
    // errou o cadastro, se o sistema nao salvou, ou se falta um passo.
    const cadastro = [
      { id: 'e-g1', setor_id: 's-bar', nome: 'Geladeira 1' },
      { id: 'e-g2', setor_id: 's-bar', nome: 'Geladeira 2' },
      { id: 'e-pra', setor_id: 's-coz', nome: 'Prateleira' },
    ]
    const coz = montarArvoreDeSetores(LUGARES, ITENS, undefined, cadastro)
      .find((r) => r.setorId === 's-coz')
    expect(coz?.lugares.map((l) => l.titulo)).toEqual(['Sem lugar definido', 'Prateleira'])
    expect(coz?.lugares.at(-1)).toMatchObject({ itens: 0, preenchidos: 0, total: 0 })
  })

  it('com vizinho ao lado, o resto do setor deixa de se chamar pelo setor', () => {
    // "Cozinha" logo abaixo de "Cozinha" parece repeticao ou erro de tela.
    const cadastro = [{ id: 'e-pra', setor_id: 's-coz', nome: 'Prateleira' }]
    const coz = montarArvoreDeSetores(LUGARES, ITENS, undefined, cadastro)
      .find((r) => r.setorId === 's-coz')
    expect(coz?.lugares[0]?.titulo).toBe('Sem lugar definido')
    expect(coz?.lugares[0]?.id).toBe(chaveDoLugar('s-coz', null))
  })

  it('lugar do cadastro que JA tem linha nao entra duas vezes', () => {
    const cadastro = [{ id: 'e-g1', setor_id: 's-bar', nome: 'Geladeira 1' }]
    const bar = montarArvoreDeSetores(LUGARES, ITENS, undefined, cadastro)
      .find((r) => r.setorId === 's-bar')
    expect(bar?.lugares.map((l) => l.titulo)).toEqual(['Geladeira 1', 'Geladeira 2'])
  })

  it('lugar de setor fora desta folha nao inventa um galho', () => {
    // Contagem aberta so para alguns setores: um lugar do setor que ficou de
    // fora nao pode fazer o setor inteiro reaparecer na navegacao.
    const cadastro = [{ id: 'e-x', setor_id: 's-limpeza', nome: 'Armario' }]
    const arvore = montarArvoreDeSetores(LUGARES, ITENS, undefined, cadastro)
    expect(arvore.map((r) => r.setorId)).toEqual(['s-bar', 's-coz'])
  })

  it('estoqueDaSelecao separa lugar, resto do setor e setor inteiro', () => {
    expect(estoqueDaSelecao(chaveDoLugar('s-bar', 'e-g1'))).toBe('e-g1')
    expect(estoqueDaSelecao(chaveDoLugar('s-bar', null))).toBeNull()
    expect(estoqueDaSelecao(chaveDoSetor('s-bar'))).toBeNull()
    expect(estoqueDaSelecao(null)).toBeNull()
  })

  it('a arvore inteira cobre as mesmas linhas da folha, sem repetir nenhuma', () => {
    const arvore = montarArvoreDeSetores(LUGARES, ITENS)
    const vistos: string[] = []
    for (const ramo of arvore) {
      const alvos = ramo.lugares.length > 0
        ? ramo.lugares.map((l) => l.id)
        : [chaveDoSetor(ramo.setorId)]
      for (const alvo of alvos) {
        for (const i of itensDaParada('setor', alvo, ITENS)) vistos.push(i.id)
      }
    }
    expect(vistos.sort()).toEqual(['cerveja', 'gin', 'picanha', 'vinho'])
  })
})
