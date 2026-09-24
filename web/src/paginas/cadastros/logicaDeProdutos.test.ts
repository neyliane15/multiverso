/**
 * O que estes testes protegem: a regra de "um produto, uma categoria, vários
 * setores, cada setor com a própria unidade e o próprio custo" — o caso real
 * do FILÉ DE TILÁPIA, 41,50/KG no Estoque Geral e 6,34/UND nos Porcionados —
 * e a busca sem acento, que é o que faz a tela de 852 produtos ser usável.
 */
import { describe, expect, it } from 'vitest'
import type { ProdutoCompleto, SetorDoProduto } from '@/tipos/banco'
import {
  alternarOrdem,
  combina,
  compararProdutos,
  criarIndiceDeBusca,
  faixaDeCusto,
  filtrarProdutos,
  janelaDeLinhas,
  linhasDeContagem,
  linhasDoRascunho,
  lugaresDoProduto,
  nomeJaUsado,
  ordenarProdutos,
  produtoDoRascunho,
  rascunhoDeProduto,
  textoDeBusca,
  unidadesDoProduto,
  validarProduto,
  vinculosDoRascunho,
  type FiltroDeProdutos,
  type SetorDisponivel,
} from './logicaDeProdutos'

const GERAL: SetorDoProduto = {
  setor_id: 's-geral',
  setor_nome: 'Estoque Geral',
  setor_cor: '#1B7F5A',
  unidade: 'KG',
  custo: 41.5,
  ordem: 0,
  custo_fixo: false,
  custo_atualizado_em: null,
  estoques: [],
}
const PORCIONADOS: SetorDoProduto = {
  setor_id: 's-porc',
  setor_nome: 'Porcionados',
  setor_cor: '#E4572E',
  unidade: 'UND',
  custo: 6.34,
  ordem: 1,
  custo_fixo: false,
  custo_atualizado_em: null,
  estoques: [],
}

function produto(
  parcial: Partial<ProdutoCompleto> & { id: string; nome: string },
): ProdutoCompleto {
  return {
    restaurante_id: 'r1',
    codigo: null,
    codigo_barras: null,
    unidade: 'UND',
    conteudo_quantidade: null,
    conteudo_unidade: null,
    custo_medio: 0,
    custo_atualizado_em: null,
    estoque_minimo: 0,
    perecivel: false,
    observacao: null,
    ativo: true,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    categoria_id: null,
    categoria_nome: null,
    categoria_cor: null,
    setores: [],
    ...parcial,
  }
}

const tilapia = produto({
  id: 'p-tilapia',
  nome: 'FILÉ DE TILÁPIA',
  codigo: 'PX-014',
  categoria_id: 'c-pescados',
  categoria_nome: 'Pescados',
  categoria_cor: '#2F80ED',
  unidade: 'KG',
  custo_medio: 41.5,
  custo_atualizado_em: null,
  setores: [GERAL, PORCIONADOS],
})

const arroz = produto({
  id: 'p-arroz',
  nome: 'Arroz agulhinha',
  categoria_id: 'c-mercearia',
  categoria_nome: 'Mercearia',
  categoria_cor: '#F5B700',
  unidade: 'KG',
  custo_medio: 5.2,
  custo_atualizado_em: null,
  setores: [{ ...GERAL, unidade: 'KG', custo: 5.2 }],
})

const arquivado = produto({ id: 'p-velho', nome: 'Refrigerante antigo', ativo: false })

const catalogo = [tilapia, arroz, arquivado]

/* ------------------------------------------------------------- busca ------ */

describe('busca sem acento', () => {
  it('varre nome, código, categoria e setores', () => {
    const texto = textoDeBusca(tilapia)
    expect(texto).toContain('FILE DE TILAPIA')
    expect(texto).toContain('PX 014')
    expect(texto).toContain('PESCADOS')
    expect(texto).toContain('PORCIONADOS')
  })

  it('acha "TILÁPIA" digitando "tilapia"', () => {
    expect(combina(textoDeBusca(tilapia), 'tilapia')).toBe(true)
    expect(combina(textoDeBusca(tilapia), 'TILÁPIA')).toBe(true)
  })

  it('exige todas as palavras, em qualquer ordem', () => {
    expect(combina(textoDeBusca(tilapia), 'file tilapia')).toBe(true)
    expect(combina(textoDeBusca(tilapia), 'tilapia file')).toBe(true)
    expect(combina(textoDeBusca(tilapia), 'tilapia alcatra')).toBe(false)
  })

  it('busca vazia combina com tudo', () => {
    expect(combina(textoDeBusca(arroz), '   ')).toBe(true)
  })

  it('o índice guarda um texto por insumo e é o mesmo de textoDeBusca', () => {
    const indice = criarIndiceDeBusca(catalogo)
    expect(indice.size).toBe(3)
    expect(indice.get('p-tilapia')).toBe(textoDeBusca(tilapia))
  })
})

/* ------------------------------------------------------------ filtro ------ */

function filtro(p: Partial<FiltroDeProdutos> = {}): FiltroDeProdutos {
  return { busca: '', categoriaId: null, setorId: null, situacao: 'ativos', ...p }
}

describe('filtrarProdutos', () => {
  it('esconde arquivados por padrão e os mostra sozinhos quando pedido', () => {
    expect(filtrarProdutos(catalogo, filtro()).map((p) => p.id)).toEqual(['p-tilapia', 'p-arroz'])
    expect(filtrarProdutos(catalogo, filtro({ situacao: 'arquivados' })).map((p) => p.id)).toEqual([
      'p-velho',
    ])
    expect(filtrarProdutos(catalogo, filtro({ situacao: 'todos' })).length).toBe(3)
  })

  it('filtra por categoria', () => {
    expect(filtrarProdutos(catalogo, filtro({ categoriaId: 'c-pescados' })).map((p) => p.id)).toEqual([
      'p-tilapia',
    ])
  })

  it('filtra por setor — o insumo aparece se vive lá, mesmo com dois setores', () => {
    expect(filtrarProdutos(catalogo, filtro({ setorId: 's-porc' })).map((p) => p.id)).toEqual([
      'p-tilapia',
    ])
    expect(filtrarProdutos(catalogo, filtro({ setorId: 's-geral' })).map((p) => p.id)).toEqual([
      'p-tilapia',
      'p-arroz',
    ])
  })

  it('combina busca e filtro', () => {
    const r = filtrarProdutos(catalogo, filtro({ busca: 'tilapia', categoriaId: 'c-mercearia' }))
    expect(r).toEqual([])
  })

  it('usa o índice quando ele é passado', () => {
    const indice = criarIndiceDeBusca(catalogo)
    expect(filtrarProdutos(catalogo, filtro({ busca: 'agulhinha' }), indice).map((p) => p.id)).toEqual(
      ['p-arroz'],
    )
  })
})

/* ------------------------------------- custo e unidade por setor ---------- */

describe('faixaDeCusto e unidadesDoProduto', () => {
  it('a tilápia é divergente: dois custos e duas unidades', () => {
    const faixa = faixaDeCusto(tilapia)
    expect(faixa.minimo).toBe(6.34)
    expect(faixa.maximo).toBe(41.5)
    expect(faixa.divergente).toBe(true)
    expect(unidadesDoProduto(tilapia)).toEqual(['KG', 'UND'])
  })

  it('insumo de um setor só não é divergente', () => {
    expect(faixaDeCusto(arroz).divergente).toBe(false)
    expect(unidadesDoProduto(arroz)).toEqual(['KG'])
  })

  it('mesmo custo em unidades diferentes ainda é divergente', () => {
    const p = produto({
      id: 'x',
      nome: 'X',
      setores: [
        { ...GERAL, unidade: 'KG', custo: 10 },
        { ...PORCIONADOS, unidade: 'UND', custo: 10 },
      ],
    })
    expect(faixaDeCusto(p).divergente).toBe(true)
  })

  it('insumo sem setor cai no custo e na unidade do próprio insumo', () => {
    const solto = produto({ id: 'y', nome: 'Y', unidade: 'CX', custo_medio: 12 })
    expect(faixaDeCusto(solto)).toEqual({ minimo: 12, maximo: 12, divergente: false })
    expect(unidadesDoProduto(solto)).toEqual(['CX'])
  })
})

/* ------------------------------------------------------------- ordem ------ */

describe('ordenação', () => {
  it('por nome ignora acento e caixa', () => {
    const lista = [
      produto({ id: '1', nome: 'Ômega' }),
      produto({ id: '2', nome: 'abacaxi' }),
      produto({ id: '3', nome: 'Ácido' }),
    ]
    expect(ordenarProdutos(lista, { coluna: 'nome', direcao: 'crescente' }).map((p) => p.id)).toEqual(
      ['2', '3', '1'],
    )
  })

  it('inverte na direção decrescente', () => {
    const ids = ordenarProdutos(catalogo, { coluna: 'nome', direcao: 'decrescente' }).map((p) => p.id)
    expect(ids[0]).toBe('p-velho')
  })

  it('por custo usa o menor custo entre os setores', () => {
    // 6,34 da tilápia porcionada é menor que 5,20? Não — o arroz vem antes.
    const ids = ordenarProdutos([tilapia, arroz], { coluna: 'custo', direcao: 'crescente' }).map(
      (p) => p.id,
    )
    expect(ids).toEqual(['p-arroz', 'p-tilapia'])
  })

  it('por quantidade de setores', () => {
    const ids = ordenarProdutos([arroz, tilapia], { coluna: 'setores', direcao: 'decrescente' }).map(
      (p) => p.id,
    )
    expect(ids).toEqual(['p-tilapia', 'p-arroz'])
  })

  it('insumo sem categoria vai para o fim na ordem por categoria', () => {
    const ids = ordenarProdutos([arquivado, tilapia], {
      coluna: 'categoria',
      direcao: 'crescente',
    }).map((p) => p.id)
    expect(ids).toEqual(['p-tilapia', 'p-velho'])
  })

  it('compararProdutos desempata pelo nome', () => {
    const a = produto({ id: 'a', nome: 'Banana', categoria_nome: 'Hortifrúti' })
    const b = produto({ id: 'b', nome: 'Abacate', categoria_nome: 'Hortifrúti' })
    expect(compararProdutos(a, b, 'categoria')).toBeGreaterThan(0)
  })

  it('não mexe na lista original', () => {
    const copia = [...catalogo]
    ordenarProdutos(catalogo, { coluna: 'custo', direcao: 'decrescente' })
    expect(catalogo).toEqual(copia)
  })

  it('alternarOrdem inverte na mesma coluna e reinicia em outra', () => {
    const inicial = { coluna: 'nome', direcao: 'crescente' } as const
    expect(alternarOrdem(inicial, 'nome')).toEqual({ coluna: 'nome', direcao: 'decrescente' })
    expect(alternarOrdem(inicial, 'custo')).toEqual({ coluna: 'custo', direcao: 'crescente' })
    expect(alternarOrdem({ coluna: 'custo', direcao: 'decrescente' }, 'custo')).toEqual({
      coluna: 'custo',
      direcao: 'crescente',
    })
  })
})

/* --------------------------------------------------------- formulário ----- */

const setoresDisponiveis: SetorDisponivel[] = [
  { id: 's-geral', nome: 'Estoque Geral', cor: '#1B7F5A' },
  { id: 's-porc', nome: 'Porcionados', cor: '#E4572E' },
  { id: 's-bar', nome: 'Bar', cor: '#F5B700' },
]

describe('rascunhoDeProduto', () => {
  it('traz a unidade e o custo de cada setor, não uma média', () => {
    const r = rascunhoDeProduto(tilapia, setoresDisponiveis)
    expect(r.setores['s-geral']).toEqual({ marcado: true, unidade: 'KG', custo: 41.5, custoFixo: false, estoques: [] })
    expect(r.setores['s-porc']).toEqual({ marcado: true, unidade: 'UND', custo: 6.34, custoFixo: false, estoques: [] })
  })

  it('setor não vinculado começa desmarcado, com o palpite do insumo', () => {
    const r = rascunhoDeProduto(tilapia, setoresDisponiveis)
    expect(r.setores['s-bar']).toEqual({ marcado: false, unidade: 'KG', custo: 41.5, custoFixo: false, estoques: [] })
  })

  it('insumo novo começa sem setor marcado', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    expect(Object.values(r.setores).every((s) => !s.marcado)).toBe(true)
    expect(r.nome).toBe('')
    expect(r.ativo).toBe(true)
    expect('id' in r).toBe(false)
  })
})

describe('validarProduto', () => {
  it('cobra nome', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 1, custoFixo: false, estoques: [] }
    expect(validarProduto(r, setoresDisponiveis).some((p) => p.campo === 'nome')).toBe(true)
  })

  it('cobra ao menos um setor, dizendo por quê', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    const problema = validarProduto(r, setoresDisponiveis).find((p) => p.campo === 'setores')
    expect(problema?.mensagem).toMatch(/onde este insumo é contado/i)
  })

  it('recusa custo negativo apontando o setor', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    r.setores['s-porc'] = { marcado: true, unidade: 'UND', custo: -3, custoFixo: false, estoques: [] }
    const problema = validarProduto(r, setoresDisponiveis).find((p) => p.campo === 'setor:s-porc')
    expect(problema?.mensagem).toMatch(/Porcionados/)
  })

  it('não olha o custo de setor desmarcado', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 2, custoFixo: false, estoques: [] }
    r.setores['s-bar'] = { marcado: false, unidade: '', custo: -9, custoFixo: false, estoques: [] }
    expect(validarProduto(r, setoresDisponiveis)).toEqual([])
  })

  it('avisa antes do erro 23505 quando o nome já existe', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'file de tilapia'
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 2, custoFixo: false, estoques: [] }
    expect(validarProduto(r, setoresDisponiveis, catalogo).some((p) => p.campo === 'nome')).toBe(true)
  })

  it('editar o próprio insumo não acusa nome repetido', () => {
    const r = rascunhoDeProduto(tilapia, setoresDisponiveis)
    expect(validarProduto(r, setoresDisponiveis, catalogo)).toEqual([])
  })

  it('nomeJaUsado compara sem acento', () => {
    expect(nomeJaUsado('FILE DE TILAPIA', catalogo)).toBe(true)
    expect(nomeJaUsado('FILÉ DE TILÁPIA', catalogo, 'p-tilapia')).toBe(false)
  })
})

describe('vinculosDoRascunho e produtoDoRascunho', () => {
  it('manda só os setores marcados, com unidade em caixa alta', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = '  Filé de tilápia  '
    r.setores['s-geral'] = { marcado: true, unidade: 'kg', custo: 41.5, custoFixo: false, estoques: [] }
    r.setores['s-porc'] = { marcado: true, unidade: ' und ', custo: 6.34, custoFixo: false, estoques: [] }

    expect(vinculosDoRascunho(r)).toEqual([
      { setor_id: 's-geral', unidade: 'KG', custo: 41.5, custo_fixo: false, estoques: [] },
      { setor_id: 's-porc', unidade: 'UND', custo: 6.34, custo_fixo: false, estoques: [] },
    ])
  })

  it('leva a marca de custo próprio para o vínculo', () => {
    // É esta marca que impede mv_atualiza_custo_medio de sobrescrever a porção
    // com o preço do quilo na próxima nota de tilápia. Perdê-la no caminho do
    // formulário para o banco reintroduz o defeito sem ninguém notar.
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 41.5, custoFixo: false, estoques: [] }
    r.setores['s-porc'] = { marcado: true, unidade: 'UND', custo: 6.34, custoFixo: true, estoques: [] }

    const vinculos = vinculosDoRascunho(r)
    expect(vinculos.find((v) => v.setor_id === 's-geral')?.custo_fixo).toBe(false)
    expect(vinculos.find((v) => v.setor_id === 's-porc')?.custo_fixo).toBe(true)
  })

  it('remover a marca de um setor tira o vínculo — é o que useSalvarProduto reconcilia', () => {
    const r = rascunhoDeProduto(tilapia, setoresDisponiveis)
    const linha = r.setores['s-porc']
    if (linha) linha.marcado = false
    expect(vinculosDoRascunho(r).map((v) => v.setor_id)).toEqual(['s-geral'])
  })

  it('limpa o nome, transforma campo vazio em null e não inventa id', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = '  Tomate italiano '
    r.codigo = '  '
    r.observacao = '   '
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 8, custoFixo: false, estoques: [] }

    const p = produtoDoRascunho(r)
    expect(p.nome).toBe('Tomate italiano')
    expect(p.codigo).toBeNull()
    expect(p.observacao).toBeNull()
    expect('id' in p).toBe(false)
  })

  it('sem unidade de compra escolhida, herda a do primeiro setor marcado', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    r.unidade = ''
    r.setores['s-porc'] = { marcado: true, unidade: 'cx', custo: 8, custoFixo: false, estoques: [] }
    expect(produtoDoRascunho(r).unidade).toBe('CX')
  })
})

/* -------------------------------------------------- janela de rolagem ----- */

describe('janelaDeLinhas', () => {
  // 852 produtos, linha de 48px, janela de 720px: 15 linhas cabem na tela.
  const total = 852
  const h = 48

  it('no topo começa na primeira linha, sem espaço acima', () => {
    const j = janelaDeLinhas(total, h, 0, 720)
    expect(j.primeira).toBe(0)
    expect(j.espacoAcima).toBe(0)
    expect(j.ultima).toBe(Math.ceil(720 / h) + 6)
  })

  it('desenha bem menos que o catálogo inteiro', () => {
    const j = janelaDeLinhas(total, h, 0, 720)
    expect(j.ultima - j.primeira).toBeLessThan(40)
  })

  it('os dois espaçadores mais as linhas desenhadas somam a altura real da lista', () => {
    for (const topo of [0, 500, 4_000, 20_000, 40_896]) {
      const j = janelaDeLinhas(total, h, topo, 720)
      const desenhadas = (j.ultima - j.primeira) * h
      expect(j.espacoAcima + desenhadas + j.espacoAbaixo).toBe(total * h)
    }
  })

  it('a janela cobre a faixa visível, com folga dos dois lados', () => {
    const topo = 4_800
    const j = janelaDeLinhas(total, h, topo, 720)
    expect(j.primeira * h).toBeLessThanOrEqual(topo)
    expect(j.ultima * h).toBeGreaterThanOrEqual(topo + 720)
  })

  it('no fim da lista não passa do total e zera o espaço de baixo', () => {
    const j = janelaDeLinhas(total, h, total * h, 720)
    expect(j.ultima).toBe(total)
    expect(j.espacoAbaixo).toBe(0)
  })

  it('lista vazia não desenha nada', () => {
    expect(janelaDeLinhas(0, h, 0, 720)).toEqual({
      primeira: 0,
      ultima: 0,
      espacoAcima: 0,
      espacoAbaixo: 0,
    })
  })

  it('aguenta medida torta sem devolver índice negativo', () => {
    const j = janelaDeLinhas(total, h, -100, -50)
    expect(j.primeira).toBe(0)
    expect(j.ultima).toBeGreaterThanOrEqual(0)
  })

  it('a altura do cartão do celular dá uma janela menor, não um erro', () => {
    const celular = janelaDeLinhas(total, 118, 0, 600)
    const desktop = janelaDeLinhas(total, 48, 0, 600)
    expect(celular.ultima).toBeLessThan(desktop.ultima)
  })
})

describe('estoque de setor · o lugar dentro do setor', () => {
  const COM_LUGARES: readonly SetorDisponivel[] = [
    {
      id: 's-bar',
      nome: 'Bar',
      cor: '#111111',
      estoques: [
        { id: 'e-gel1', nome: 'Geladeira 1' },
        { id: 'e-gel2', nome: 'Geladeira 2' },
      ],
    },
    { id: 's-geral', nome: 'Estoque Geral', cor: '#222222', estoques: [] },
  ]

  function produtoNoBar(estoques: { id: string; nome: string }[]): ProdutoCompleto {
    return produto({
      id: 'p-cachaca',
      nome: 'Cachaça 51',
      setores: [
        {
          setor_id: 's-bar',
          setor_nome: 'Bar',
          setor_cor: '#111111',
          unidade: 'UND',
          custo: 7.91,
          ordem: 0,
          custo_fixo: false,
          custo_atualizado_em: null,
          estoques,
        },
      ],
    })
  }

  it('insumo novo nasce sem lugar marcado', () => {
    const r = rascunhoDeProduto(null, COM_LUGARES)
    expect(r.setores['s-bar']?.estoques).toEqual([])
  })

  it('reabrir o insumo traz os lugares que ele ja tinha', () => {
    const r = rascunhoDeProduto(produtoNoBar([{ id: 'e-gel1', nome: 'Geladeira 1' }]), COM_LUGARES)
    expect(r.setores['s-bar']?.estoques).toEqual(['e-gel1'])
  })

  it('o mesmo insumo pode estar em duas geladeiras do mesmo bar', () => {
    const r = rascunhoDeProduto(
      produtoNoBar([
        { id: 'e-gel1', nome: 'Geladeira 1' },
        { id: 'e-gel2', nome: 'Geladeira 2' },
      ]),
      COM_LUGARES,
    )
    expect(r.setores['s-bar']?.estoques).toEqual(['e-gel1', 'e-gel2'])
  })

  it('lugar apagado do cadastro nao volta marcado', () => {
    // A Geladeira 3 saiu do cadastro de estoques, mas o vinculo antigo do
    // produto ainda a cita. Trazer a marca de volta faria o formulario gravar
    // um id que o banco recusa, com erro que nao explica nada.
    const r = rascunhoDeProduto(
      produtoNoBar([
        { id: 'e-gel1', nome: 'Geladeira 1' },
        { id: 'e-gel3', nome: 'Geladeira 3' },
      ]),
      COM_LUGARES,
    )
    expect(r.setores['s-bar']?.estoques).toEqual(['e-gel1'])
  })

  it('setor sem subdivisao fica com a lista vazia, e isso nao e erro', () => {
    const r = rascunhoDeProduto(produtoNoBar([]), COM_LUGARES)
    r.nome = 'Cachaca 51'
    r.setores['s-geral'] = { marcado: true, unidade: 'UND', custo: 7.91, custoFixo: false, estoques: [] }
    expect(validarProduto(r, COM_LUGARES)).toEqual([])
  })

  it('os lugares seguem para o vinculo que vai ao banco', () => {
    const r = rascunhoDeProduto(null, COM_LUGARES)
    r.setores['s-bar'] = {
      marcado: true,
      unidade: 'und',
      custo: 7.91,
      custoFixo: false,
      estoques: ['e-gel1', 'e-gel2'],
    }
    expect(vinculosDoRascunho(r)).toEqual([
      { setor_id: 's-bar', unidade: 'UND', custo: 7.91, custo_fixo: false, estoques: ['e-gel1', 'e-gel2'] },
    ])
  })

  it('setor desmarcado nao leva os lugares dele', () => {
    const r = rascunhoDeProduto(null, COM_LUGARES)
    r.setores['s-bar'] = {
      marcado: false,
      unidade: 'UND',
      custo: 7.91,
      custoFixo: false,
      estoques: ['e-gel1'],
    }
    r.setores['s-geral'] = { marcado: true, unidade: 'UND', custo: 7.91, custoFixo: false, estoques: [] }
    expect(vinculosDoRascunho(r).map((v) => v.setor_id)).toEqual(['s-geral'])
  })
})

describe('lugaresDoProduto · o peso de cada setor na folha', () => {
  function comLugares(...setores: { nome: string; estoques: string[] }[]): ProdutoCompleto {
    return produto({
      id: 'p-multi',
      nome: 'CACHAÇA 51',
      setores: setores.map((s, i) => ({
        setor_id: `s-${i}`,
        setor_nome: s.nome,
        setor_cor: '#111111',
        unidade: 'UND',
        custo: 7.91,
        ordem: i,
        custo_fixo: false,
        custo_atualizado_em: null,
        estoques: s.estoques.map((nome, j) => ({ id: `e-${i}-${j}`, nome })),
      })),
    })
  }

  it('setor sem subdivisao ainda rende uma linha: a do setor inteiro', () => {
    const [cozinha] = lugaresDoProduto(comLugares({ nome: 'Cozinha', estoques: [] }))
    expect(cozinha).toMatchObject({ setorNome: 'Cozinha', estoques: [], linhas: 1 })
  })

  it('tres lugares no mesmo setor sao tres linhas, nao uma', () => {
    // O que a lista escondia: um produto guardado em tres geladeiras da
    // cozinha ficava igual a um contado uma vez la.
    const [cozinha] = lugaresDoProduto(
      comLugares({ nome: 'Cozinha', estoques: ['Câmara fria', 'Despensa', 'Bancada'] }),
    )
    expect(cozinha?.linhas).toBe(3)
    expect(cozinha?.estoques).toEqual(['Câmara fria', 'Despensa', 'Bancada'])
  })

  it('lugares em setores diferentes somam', () => {
    const p = comLugares(
      { nome: 'Bar', estoques: ['Geladeira 1', 'Geladeira 2'] },
      { nome: 'Cozinha', estoques: ['Câmara fria', 'Despensa'] },
    )
    expect(lugaresDoProduto(p).map((l) => l.linhas)).toEqual([2, 2])
    expect(linhasDeContagem(p)).toBe(4)
  })

  it('mistura de setor com e sem subdivisao', () => {
    const p = comLugares(
      { nome: 'Bar', estoques: ['Geladeira 1', 'Geladeira 2'] },
      { nome: 'Limpeza', estoques: [] },
    )
    expect(linhasDeContagem(p)).toBe(3)
  })

  it('insumo sem setor nenhum nao entra na folha', () => {
    expect(linhasDeContagem(produto({ id: 'p-solto', nome: 'SOLTO' }))).toBe(0)
  })
})

describe('linhasDoRascunho · o mesmo numero antes de salvar', () => {
  const SETORES: readonly SetorDisponivel[] = [
    { id: 's-bar', nome: 'Bar', cor: '#111111', estoques: [
      { id: 'e-1', nome: 'Geladeira 1' }, { id: 'e-2', nome: 'Geladeira 2' } ] },
    { id: 's-coz', nome: 'Cozinha', cor: '#222222', estoques: [] },
  ]

  it('conta so os setores marcados', () => {
    const r = rascunhoDeProduto(null, SETORES)
    expect(linhasDoRascunho(r)).toBe(0)
    r.setores['s-coz'] = { marcado: true, unidade: 'UND', custo: 1, custoFixo: false, estoques: [] }
    expect(linhasDoRascunho(r)).toBe(1)
  })

  it('marcar o segundo lugar do mesmo setor soma uma linha', () => {
    const r = rascunhoDeProduto(null, SETORES)
    r.setores['s-bar'] = { marcado: true, unidade: 'UND', custo: 1, custoFixo: false, estoques: ['e-1'] }
    expect(linhasDoRascunho(r)).toBe(1)
    r.setores['s-bar'] = { ...r.setores['s-bar']!, estoques: ['e-1', 'e-2'] }
    expect(linhasDoRascunho(r)).toBe(2)
  })

  it('desmarcar o setor leva os lugares dele junto', () => {
    const r = rascunhoDeProduto(null, SETORES)
    r.setores['s-bar'] = { marcado: false, unidade: 'UND', custo: 1, custoFixo: false, estoques: ['e-1', 'e-2'] }
    r.setores['s-coz'] = { marcado: true, unidade: 'UND', custo: 1, custoFixo: false, estoques: [] }
    expect(linhasDoRascunho(r)).toBe(1)
  })

  it('bate com o que o banco vai gerar', () => {
    // A tela promete um numero antes de salvar; o banco produz outro depois.
    // Os dois tem de ser o mesmo, senao a promessa e mentira.
    const r = rascunhoDeProduto(null, SETORES)
    r.setores['s-bar'] = { marcado: true, unidade: 'UND', custo: 1, custoFixo: false, estoques: ['e-1', 'e-2'] }
    r.setores['s-coz'] = { marcado: true, unidade: 'UND', custo: 1, custoFixo: false, estoques: [] }

    const salvo = produto({
      id: 'p', nome: 'X',
      setores: vinculosDoRascunho(r).map((v, i) => ({
        setor_id: v.setor_id, setor_nome: '', setor_cor: '#000000',
        unidade: v.unidade, custo: v.custo, ordem: i,
        custo_fixo: v.custo_fixo, custo_atualizado_em: null,
        estoques: v.estoques.map((id) => ({ id, nome: id })),
      })),
    })
    expect(linhasDeContagem(salvo)).toBe(linhasDoRascunho(r))
    expect(linhasDeContagem(salvo)).toBe(3)
  })
})
