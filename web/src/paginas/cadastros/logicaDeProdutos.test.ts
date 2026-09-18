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
}
const PORCIONADOS: SetorDoProduto = {
  setor_id: 's-porc',
  setor_nome: 'Porcionados',
  setor_cor: '#E4572E',
  unidade: 'UND',
  custo: 6.34,
  ordem: 1,
}

function produto(
  parcial: Partial<ProdutoCompleto> & { id: string; nome: string },
): ProdutoCompleto {
  return {
    restaurante_id: 'r1',
    codigo: null,
    codigo_barras: null,
    unidade: 'UND',
    custo_medio: 0,
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

  it('o índice guarda um texto por produto e é o mesmo de textoDeBusca', () => {
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

  it('filtra por setor — o produto aparece se vive lá, mesmo com dois setores', () => {
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

  it('produto de um setor só não é divergente', () => {
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

  it('produto sem setor cai no custo e na unidade do próprio produto', () => {
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

  it('produto sem categoria vai para o fim na ordem por categoria', () => {
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
    expect(r.setores['s-geral']).toEqual({ marcado: true, unidade: 'KG', custo: 41.5 })
    expect(r.setores['s-porc']).toEqual({ marcado: true, unidade: 'UND', custo: 6.34 })
  })

  it('setor não vinculado começa desmarcado, com o palpite do produto', () => {
    const r = rascunhoDeProduto(tilapia, setoresDisponiveis)
    expect(r.setores['s-bar']).toEqual({ marcado: false, unidade: 'KG', custo: 41.5 })
  })

  it('produto novo começa sem setor marcado', () => {
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
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 1 }
    expect(validarProduto(r, setoresDisponiveis).some((p) => p.campo === 'nome')).toBe(true)
  })

  it('cobra ao menos um setor, dizendo por quê', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    const problema = validarProduto(r, setoresDisponiveis).find((p) => p.campo === 'setores')
    expect(problema?.mensagem).toMatch(/onde este produto é contado/i)
  })

  it('recusa custo negativo apontando o setor', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    r.setores['s-porc'] = { marcado: true, unidade: 'UND', custo: -3 }
    const problema = validarProduto(r, setoresDisponiveis).find((p) => p.campo === 'setor:s-porc')
    expect(problema?.mensagem).toMatch(/Porcionados/)
  })

  it('não olha o custo de setor desmarcado', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'Tomate'
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 2 }
    r.setores['s-bar'] = { marcado: false, unidade: '', custo: -9 }
    expect(validarProduto(r, setoresDisponiveis)).toEqual([])
  })

  it('avisa antes do erro 23505 quando o nome já existe', () => {
    const r = rascunhoDeProduto(null, setoresDisponiveis)
    r.nome = 'file de tilapia'
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 2 }
    expect(validarProduto(r, setoresDisponiveis, catalogo).some((p) => p.campo === 'nome')).toBe(true)
  })

  it('editar o próprio produto não acusa nome repetido', () => {
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
    r.setores['s-geral'] = { marcado: true, unidade: 'kg', custo: 41.5 }
    r.setores['s-porc'] = { marcado: true, unidade: ' und ', custo: 6.34 }

    expect(vinculosDoRascunho(r)).toEqual([
      { setor_id: 's-geral', unidade: 'KG', custo: 41.5 },
      { setor_id: 's-porc', unidade: 'UND', custo: 6.34 },
    ])
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
    r.setores['s-geral'] = { marcado: true, unidade: 'KG', custo: 8 }

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
    r.setores['s-porc'] = { marcado: true, unidade: 'cx', custo: 8 }
    expect(produtoDoRascunho(r).unidade).toBe('CX')
  })
})
