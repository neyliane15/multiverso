/**
 * A lógica do catálogo, fora da tela.
 *
 * Mora aqui tudo que decide *o que aparece* (busca, filtro, ordem) e *o que
 * pode ser salvo* (validação, montagem dos vínculos por setor). Está separado
 * do componente por dois motivos: com 852 produtos a filtragem roda a cada
 * tecla e precisa ser barata, e a regra de "um produto, vários setores, cada
 * setor com o próprio custo" é a regra que desenha o módulo — ela merece teste
 * próprio, não inspeção visual.
 */
import { chaveBusca } from '@/util/formato'
import type { ProdutoCompleto } from '@/tipos/banco'
import type { VinculoSetor } from '@/dados/consultas'

export type SituacaoDoProduto = 'ativos' | 'arquivados' | 'todos'
export type ColunaDeProdutos = 'nome' | 'categoria' | 'setores' | 'unidade' | 'custo'
export type Direcao = 'crescente' | 'decrescente'

export interface FiltroDeProdutos {
  busca: string
  categoriaId: string | null
  setorId: string | null
  situacao: SituacaoDoProduto
}

export interface OrdemDeProdutos {
  coluna: ColunaDeProdutos
  direcao: Direcao
}

export const FILTRO_INICIAL: FiltroDeProdutos = {
  busca: '',
  categoriaId: null,
  setorId: null,
  situacao: 'ativos',
}

export const ORDEM_INICIAL: OrdemDeProdutos = { coluna: 'nome', direcao: 'crescente' }

/** Unidades que aparecem na planilha do cliente. Campo aceita outras. */
export const UNIDADES_COMUNS = [
  'UND',
  'KG',
  'G',
  'L',
  'ML',
  'CX',
  'FD',
  'PCT',
  'BDJ',
  'GRF',
  'LT',
  'MÇ',
  'DZ',
] as const

/* ========================================================================== */
/* Busca                                                                      */
/* ========================================================================== */

/**
 * O texto que a busca varre: nome, códigos, categoria e setores. Achar
 * "TILAPIA" digitando "tilapia" é `chaveBusca` tirando acento e caixa dos dois
 * lados — a mesma função que o de-para de nota fiscal usa, então buscar na tela
 * e casar item de nota usam o mesmo critério.
 */
export function textoDeBusca(produto: ProdutoCompleto): string {
  const partes = [
    produto.nome,
    produto.codigo ?? '',
    produto.codigo_barras ?? '',
    produto.categoria_nome ?? '',
    ...produto.setores.map((s) => s.setor_nome),
  ]
  return chaveBusca(partes.join(' '))
}

/**
 * Índice de busca calculado uma vez por lista. Sem ele, cada tecla digitada
 * normalizaria 852 nomes de novo — é aí que a busca engasga.
 */
export function criarIndiceDeBusca(produtos: readonly ProdutoCompleto[]): Map<string, string> {
  const indice = new Map<string, string>()
  for (const p of produtos) indice.set(p.id, textoDeBusca(p))
  return indice
}

/** Cada palavra digitada precisa aparecer — "file tilapia" acha "FILÉ DE TILÁPIA". */
export function combina(texto: string, busca: string): boolean {
  const alvo = chaveBusca(busca)
  if (alvo === '') return true
  return alvo.split(' ').every((termo) => texto.includes(termo))
}

/* ========================================================================== */
/* Filtro e ordem                                                             */
/* ========================================================================== */

export function filtrarProdutos(
  produtos: readonly ProdutoCompleto[],
  filtro: FiltroDeProdutos,
  indice?: Map<string, string>,
): ProdutoCompleto[] {
  return produtos.filter((p) => {
    if (filtro.situacao === 'ativos' && !p.ativo) return false
    if (filtro.situacao === 'arquivados' && p.ativo) return false
    if (filtro.categoriaId && p.categoria_id !== filtro.categoriaId) return false
    if (filtro.setorId && !p.setores.some((s) => s.setor_id === filtro.setorId)) return false
    if (filtro.busca.trim() === '') return true
    return combina(indice?.get(p.id) ?? textoDeBusca(p), filtro.busca)
  })
}

/**
 * O custo que representa o produto na coluna. Quando os setores discordam — a
 * tilápia a 41,50/KG no Estoque Geral e a 6,34/UND nos Porcionados — mostramos
 * o menor e a tela diz que há mais de um. Inventar uma média aqui esconderia
 * exatamente o caso que o módulo existe para tratar.
 */
export function faixaDeCusto(produto: ProdutoCompleto): {
  minimo: number
  maximo: number
  divergente: boolean
} {
  if (produto.setores.length === 0) {
    return { minimo: produto.custo_medio, maximo: produto.custo_medio, divergente: false }
  }
  const custos = produto.setores.map((s) => s.custo)
  const minimo = Math.min(...custos)
  const maximo = Math.max(...custos)
  const unidades = new Set(produto.setores.map((s) => s.unidade))
  return { minimo, maximo, divergente: minimo !== maximo || unidades.size > 1 }
}

/** As unidades em que este produto é contado, sem repetir. */
export function unidadesDoProduto(produto: ProdutoCompleto): string[] {
  if (produto.setores.length === 0) return [produto.unidade]
  return [...new Set(produto.setores.map((s) => s.unidade))]
}

function texto(a: string, b: string): number {
  return chaveBusca(a).localeCompare(chaveBusca(b), 'pt-BR')
}

export function compararProdutos(
  a: ProdutoCompleto,
  b: ProdutoCompleto,
  coluna: ColunaDeProdutos,
): number {
  switch (coluna) {
    case 'categoria': {
      const r = texto(a.categoria_nome ?? 'ZZZZ', b.categoria_nome ?? 'ZZZZ')
      return r !== 0 ? r : texto(a.nome, b.nome)
    }
    case 'setores': {
      const r = a.setores.length - b.setores.length
      return r !== 0 ? r : texto(a.nome, b.nome)
    }
    case 'unidade': {
      const r = texto(unidadesDoProduto(a).join('/'), unidadesDoProduto(b).join('/'))
      return r !== 0 ? r : texto(a.nome, b.nome)
    }
    case 'custo': {
      const r = faixaDeCusto(a).minimo - faixaDeCusto(b).minimo
      return r !== 0 ? r : texto(a.nome, b.nome)
    }
    default:
      return texto(a.nome, b.nome)
  }
}

export function ordenarProdutos(
  produtos: readonly ProdutoCompleto[],
  ordem: OrdemDeProdutos,
): ProdutoCompleto[] {
  const sinal = ordem.direcao === 'crescente' ? 1 : -1
  // Cópia: a lista que vem do cache do React Query não é nossa para mexer.
  return [...produtos].sort((a, b) => sinal * compararProdutos(a, b, ordem.coluna))
}

/** Clicar na mesma coluna inverte; clicar em outra começa crescente. */
export function alternarOrdem(
  ordem: OrdemDeProdutos,
  coluna: ColunaDeProdutos,
): OrdemDeProdutos {
  if (ordem.coluna !== coluna) return { coluna, direcao: 'crescente' }
  return { coluna, direcao: ordem.direcao === 'crescente' ? 'decrescente' : 'crescente' }
}

/* ========================================================================== */
/* Formulário                                                                 */
/* ========================================================================== */

export interface RascunhoDeSetor {
  marcado: boolean
  unidade: string
  custo: number
  /** Custo da casa: não acompanha nota fiscal. */
  custoFixo: boolean
  /**
   * Ids dos estoques deste setor onde o produto fica. Vazio significa "o setor
   * inteiro", não "erro": setor sem subdivisão é o caso normal, e é o de todos
   * os 854 produtos que vieram da planilha.
   */
  estoques: string[]
}

export interface RascunhoDeProduto {
  id?: string
  nome: string
  codigo: string
  categoria_id: string | null
  unidade: string
  custo_medio: number
  estoque_minimo: number
  perecivel: boolean
  observacao: string
  ativo: boolean
  /** Um estado por setor do restaurante, marcado ou não. */
  setores: Record<string, RascunhoDeSetor>
}

export interface ProblemaDeProduto {
  /** 'nome', 'setores', ou 'setor:<id>' quando o erro é do custo daquele setor. */
  campo: string
  mensagem: string
}

export interface SetorDisponivel {
  id: string
  nome: string
  cor: string
  /** Os estoques cadastrados neste setor. Vazio = setor sem subdivisão. */
  estoques?: readonly { id: string; nome: string }[]
}

/**
 * Abre o formulário: produto existente vira rascunho com os setores dele já
 * marcados, com a unidade e o custo *daquele* setor. Produto novo começa com
 * nenhum setor marcado — marcar é decisão consciente, porque cada marca vira
 * uma linha a mais na folha de contagem.
 */
export function rascunhoDeProduto(
  produto: ProdutoCompleto | null,
  setores: readonly SetorDisponivel[],
): RascunhoDeProduto {
  const porSetor: Record<string, RascunhoDeSetor> = {}
  for (const setor of setores) {
    const vinculo = produto?.setores.find((s) => s.setor_id === setor.id)
    porSetor[setor.id] = {
      marcado: Boolean(vinculo),
      unidade: vinculo?.unidade ?? produto?.unidade ?? 'UND',
      custo: vinculo?.custo ?? produto?.custo_medio ?? 0,
      custoFixo: vinculo?.custo_fixo ?? false,
      // Só os lugares que ainda existem neste setor. Um estoque apagado no
      // cadastro não pode reaparecer marcado quando alguém reabre o produto.
      estoques: (vinculo?.estoques ?? [])
        .map((e) => e.id)
        .filter((id) => (setor.estoques ?? []).some((e) => e.id === id)),
    }
  }
  return {
    ...(produto?.id ? { id: produto.id } : {}),
    nome: produto?.nome ?? '',
    codigo: produto?.codigo ?? '',
    categoria_id: produto?.categoria_id ?? null,
    unidade: produto?.unidade ?? 'UND',
    custo_medio: produto?.custo_medio ?? 0,
    estoque_minimo: produto?.estoque_minimo ?? 0,
    perecivel: produto?.perecivel ?? false,
    observacao: produto?.observacao ?? '',
    ativo: produto?.ativo ?? true,
    setores: porSetor,
  }
}

/** O nome já existe? O banco tem índice único sem acento — avisamos antes. */
export function nomeJaUsado(
  nome: string,
  produtos: readonly ProdutoCompleto[],
  idAtual?: string,
): boolean {
  const alvo = chaveBusca(nome)
  if (alvo === '') return false
  return produtos.some((p) => p.id !== idAtual && chaveBusca(p.nome) === alvo)
}

export function validarProduto(
  rascunho: RascunhoDeProduto,
  setores: readonly SetorDisponivel[],
  produtos: readonly ProdutoCompleto[] = [],
): ProblemaDeProduto[] {
  const problemas: ProblemaDeProduto[] = []

  if (rascunho.nome.trim() === '') {
    problemas.push({ campo: 'nome', mensagem: 'O insumo precisa de um nome.' })
  } else if (nomeJaUsado(rascunho.nome, produtos, rascunho.id)) {
    problemas.push({
      campo: 'nome',
      mensagem: 'Já existe um insumo com esse nome neste restaurante.',
    })
  }

  if (rascunho.custo_medio < 0 || Number.isNaN(rascunho.custo_medio)) {
    problemas.push({ campo: 'custo_medio', mensagem: 'O custo de referência não pode ser negativo.' })
  }
  if (rascunho.estoque_minimo < 0 || Number.isNaN(rascunho.estoque_minimo)) {
    problemas.push({ campo: 'estoque_minimo', mensagem: 'O estoque mínimo não pode ser negativo.' })
  }

  const marcados = setores.filter((s) => rascunho.setores[s.id]?.marcado)
  if (marcados.length === 0) {
    problemas.push({
      campo: 'setores',
      mensagem: 'Marque ao menos um setor — é o setor que diz onde este insumo é contado.',
    })
  }

  for (const setor of marcados) {
    const linha = rascunho.setores[setor.id]
    if (!linha) continue
    if (linha.unidade.trim() === '') {
      problemas.push({
        campo: `setor:${setor.id}`,
        mensagem: `Informe a unidade de ${setor.nome}.`,
      })
    }
    if (Number.isNaN(linha.custo) || linha.custo < 0) {
      problemas.push({
        campo: `setor:${setor.id}`,
        mensagem: `O custo em ${setor.nome} não pode ser negativo.`,
      })
    }
  }

  return problemas
}

export interface LugarDoProduto {
  setorId: string
  setorNome: string
  setorCor: string
  /** Os lugares dentro do setor. Vazio = conta-se o setor inteiro, uma vez. */
  estoques: string[]
  /** Quantas linhas de contagem este setor gera para este produto. */
  linhas: number
}

/**
 * Onde o produto é contado, com o peso de cada lugar.
 *
 * O catálogo mostrava só o nome do setor, e com isso um produto guardado em
 * três geladeiras da cozinha ficava idêntico a um contado uma vez lá. São
 * coisas diferentes: a primeira rende três linhas na folha, três paradas e
 * três números para somar. O `linhas` é esse peso, e é o que a lista precisa
 * mostrar para não esconder trabalho.
 */
export function lugaresDoProduto(produto: ProdutoCompleto): LugarDoProduto[] {
  return produto.setores.map((setor) => {
    const estoques = (setor.estoques ?? []).map((e) => e.nome)
    return {
      setorId: setor.setor_id,
      setorNome: setor.setor_nome,
      setorCor: setor.setor_cor,
      estoques,
      // Sem lugar cadastrado o setor ainda rende uma linha: a do setor inteiro.
      linhas: Math.max(estoques.length, 1),
    }
  })
}

/** Quantas linhas este produto põe na folha de contagem, somando os setores. */
export function linhasDeContagem(produto: ProdutoCompleto): number {
  return lugaresDoProduto(produto).reduce((soma, lugar) => soma + lugar.linhas, 0)
}

/** O mesmo, a partir do rascunho aberto no formulário (antes de salvar). */
export function linhasDoRascunho(rascunho: RascunhoDeProduto): number {
  let total = 0
  for (const linha of Object.values(rascunho.setores)) {
    if (!linha.marcado) continue
    total += Math.max(linha.estoques.length, 1)
  }
  return total
}

/** Os vínculos que `useSalvarProduto` reconcilia — só os setores marcados. */
export function vinculosDoRascunho(rascunho: RascunhoDeProduto): VinculoSetor[] {
  return Object.entries(rascunho.setores)
    .filter(([, linha]) => linha.marcado)
    .map(([setor_id, linha]) => ({
      setor_id,
      unidade: linha.unidade.trim().toUpperCase(),
      custo: linha.custo,
      custo_fixo: linha.custoFixo,
      estoques: linha.estoques,
    }))
}

/** O que vai para a tabela `produtos` (sem os vínculos). */
export function produtoDoRascunho(rascunho: RascunhoDeProduto): {
  id?: string
  nome: string
  codigo: string | null
  categoria_id: string | null
  unidade: string
  custo_medio: number
  estoque_minimo: number
  perecivel: boolean
  observacao: string | null
  ativo: boolean
} {
  const vinculos = vinculosDoRascunho(rascunho)
  const primeiro = vinculos[0]
  return {
    ...(rascunho.id ? { id: rascunho.id } : {}),
    nome: rascunho.nome.trim(),
    codigo: rascunho.codigo.trim() === '' ? null : rascunho.codigo.trim(),
    categoria_id: rascunho.categoria_id,
    // A unidade do produto é a de compra. Quando o admin não mexeu nela, a do
    // primeiro setor é o palpite mais útil — e continua editável.
    unidade: (rascunho.unidade.trim() === '' ? primeiro?.unidade ?? 'UND' : rascunho.unidade)
      .trim()
      .toUpperCase(),
    custo_medio: rascunho.custo_medio,
    estoque_minimo: rascunho.estoque_minimo,
    perecivel: rascunho.perecivel,
    observacao: rascunho.observacao.trim() === '' ? null : rascunho.observacao.trim(),
    ativo: rascunho.ativo,
  }
}

/* ========================================================================== */
/* Janela de rolagem                                                          */
/* ========================================================================== */

export interface JanelaDeLinhas {
  /** Índice da primeira linha desenhada. */
  primeira: number
  /** Índice logo depois da última desenhada (exclusivo, como `slice`). */
  ultima: number
  /** Altura do espaçador de cima, em pixels. */
  espacoAcima: number
  /** Altura do espaçador de baixo, em pixels. */
  espacoAbaixo: number
}

/**
 * Quais linhas de fato precisam existir no DOM.
 *
 * Com 852 produtos, desenhar tudo trava a rolagem no celular — que é onde esta
 * tela mais é aberta. Em vez de uma biblioteca de virtualização, a conta: a
 * linha tem altura fixa, então a primeira visível é o quanto já rolou dividido
 * por essa altura, e dois espaçadores seguram a barra de rolagem no tamanho
 * certo. A `folga` desenha algumas linhas além da janela para que rolar rápido
 * não mostre buraco branco.
 */
export function janelaDeLinhas(
  total: number,
  alturaDaLinha: number,
  topo: number,
  alturaVisivel: number,
  folga = 6,
): JanelaDeLinhas {
  if (total <= 0 || alturaDaLinha <= 0) {
    return { primeira: 0, ultima: 0, espacoAcima: 0, espacoAbaixo: 0 }
  }
  const primeira = Math.max(0, Math.floor(Math.max(0, topo) / alturaDaLinha) - folga)
  const ultima = Math.min(
    total,
    Math.max(primeira, Math.ceil((Math.max(0, topo) + Math.max(0, alturaVisivel)) / alturaDaLinha) + folga),
  )
  return {
    primeira,
    ultima,
    espacoAcima: primeira * alturaDaLinha,
    espacoAbaixo: Math.max(0, (total - ultima) * alturaDaLinha),
  }
}
