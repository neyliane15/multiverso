/**
 * A conta da ficha técnica, do lado do navegador.
 *
 * O servidor já calcula tudo em `vw_fichas_completas` — e é ele quem manda na
 * lista. Esta cópia existe para o EDITOR: enquanto a pessoa digita "200 G de
 * picanha", o custo do prato precisa mudar na hora, antes de qualquer
 * salvamento. Esperar o ida-e-volta transformaria montar uma ficha num
 * exercício de paciência.
 *
 * As duas contas são a mesma fórmula, e os testes de banco e os daqui usam os
 * MESMOS números redondos de propósito: se um dia elas divergirem, um dos dois
 * lados quebra.
 */

/** O que a conta precisa saber do produto. Vem do catálogo, sem cópia. */
export interface ProdutoParaFicha {
  id: string
  nome: string
  unidade: string
  custo_medio: number
  conteudo_quantidade: number | null
  conteudo_unidade: string | null
  categoria_nome?: string | null
  categoria_cor?: string | null
}

/** Um item como ele existe no editor, antes de virar linha no banco. */
export interface ItemEmEdicao {
  produto_id: string
  quantidade: number
  unidade: string
  perda_percentual: number
  observacao?: string | null
}

export interface CustoDoItem {
  /** O que sai do estoque: o líquido mais a perda. */
  bruto: number
  /** Nulo quando as unidades não se convertem nem pela embalagem. */
  fator: number | null
  custoUnitario: number
  custo: number | null
  incompativel: boolean
  semCusto: boolean
}

export interface ResumoDaFicha {
  custoTotal: number
  custoPorcao: number
  /** Nulo sem preço de venda: a pergunta ainda não tem resposta. */
  cmv: number | null
  margem: number | null
  markup: number | null
  incompativeis: number
  semCusto: number
}

/* ───────────────────────────────────────────────────────────── unidades ──── */

const SINONIMOS: Record<string, string> = {
  QUILO: 'KG', QUILOS: 'KG', KILO: 'KG',
  GR: 'G', GRAMA: 'G', GRAMAS: 'G',
  LT: 'L', LITRO: 'L', LITROS: 'L',
  MLT: 'ML',
  UN: 'UND', UNID: 'UND', UNIDADE: 'UND', PC: 'UND', PCT: 'UND', PECA: 'UND',
}

/** Quanto cada unidade vale na base da família — a mesma tabela do banco. */
const BASE: Record<string, { familia: string; valor: number }> = {
  KG: { familia: 'massa', valor: 1000 },
  G: { familia: 'massa', valor: 1 },
  MG: { familia: 'massa', valor: 0.001 },
  L: { familia: 'volume', valor: 1000 },
  ML: { familia: 'volume', valor: 1 },
  UND: { familia: 'unidade', valor: 1 },
  DZ: { familia: 'unidade', valor: 12 },
}

export function normalizar(unidade: string | null | undefined): string {
  const limpa = (unidade ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
  return SINONIMOS[limpa] ?? limpa
}

export const UNIDADES_DA_RECEITA = ['G', 'KG', 'ML', 'L', 'UND'] as const

/**
 * O fator para converter `de` em `para`. Nulo quando não dá.
 *
 * Nulo aqui nunca pode virar 1: "60 ML" de um produto vendido por UND viraria
 * 60 garrafas de cachaça numa caipirinha, e ninguém olha um número desses duas
 * vezes num relatório.
 */
export function fatorEntreUnidades(de: string, para: string): number | null {
  const a = normalizar(de)
  const b = normalizar(para)
  const ba = BASE[a]
  const bb = BASE[b]
  if (!ba || !bb) return a !== '' && a === b ? 1 : null
  if (ba.familia !== bb.familia) return null
  return ba.valor / bb.valor
}

/**
 * Da unidade da receita para a unidade de compra, em duas tentativas: direto,
 * e depois pelo conteúdo da embalagem (a garrafa de 965 ML).
 */
export function fatorParaProduto(unidade: string, produto: ProdutoParaFicha): number | null {
  const direto = fatorEntreUnidades(unidade, produto.unidade)
  if (direto !== null) return direto
  if (produto.conteudo_quantidade !== null && produto.conteudo_quantidade > 0) {
    const ateOConteudo = fatorEntreUnidades(unidade, produto.conteudo_unidade ?? '')
    if (ateOConteudo !== null) return ateOConteudo / produto.conteudo_quantidade
  }
  return null
}

/* ────────────────────────────────────────────────────────────── a conta ──── */

const arredondar = (n: number, casas: number): number => {
  const f = 10 ** casas
  return Math.round((n + Number.EPSILON) * f) / f
}

/** O bruto comprado: o líquido da receita mais a perda de limpeza. */
export function quantidadeBruta(quantidade: number, perdaPercentual: number): number {
  const perda = Math.min(Math.max(perdaPercentual, 0), 99.999)
  return arredondar(quantidade / (1 - perda / 100), 4)
}

export function custoDoItem(item: ItemEmEdicao, produto: ProdutoParaFicha | undefined): CustoDoItem {
  const bruto = quantidadeBruta(item.quantidade, item.perda_percentual)
  if (!produto) {
    return { bruto, fator: null, custoUnitario: 0, custo: null, incompativel: true, semCusto: true }
  }
  const fator = fatorParaProduto(item.unidade, produto)
  const custoUnitario = produto.custo_medio
  return {
    bruto,
    fator,
    custoUnitario,
    custo: fator === null ? null : arredondar(bruto * fator * custoUnitario, 4),
    incompativel: fator === null,
    semCusto: custoUnitario === 0,
  }
}

export function resumoDaFicha(
  itens: readonly ItemEmEdicao[],
  produtos: ReadonlyMap<string, ProdutoParaFicha>,
  rendimento: number,
  precoVenda: number,
): ResumoDaFicha {
  let custoTotal = 0
  let incompativeis = 0
  let semCusto = 0
  for (const item of itens) {
    const conta = custoDoItem(item, produtos.get(item.produto_id))
    custoTotal += conta.custo ?? 0
    if (conta.incompativel) incompativeis += 1
    if (conta.semCusto) semCusto += 1
  }
  custoTotal = arredondar(custoTotal, 4)
  // Rendimento zero não existe (o banco tem CHECK), mas a tela pode estar com
  // o campo vazio no meio da digitação — e dividir por zero viraria Infinity
  // no lugar de um preço.
  const porcoes = rendimento > 0 ? rendimento : 1
  const custoPorcao = arredondar(custoTotal / porcoes, 4)
  return {
    custoTotal,
    custoPorcao,
    cmv: precoVenda > 0 ? arredondar((custoPorcao / precoVenda) * 100, 2) : null,
    margem: precoVenda > 0 ? arredondar(precoVenda - custoPorcao, 4) : null,
    markup: custoPorcao > 0 ? arredondar(precoVenda / custoPorcao, 2) : null,
    incompativeis,
    semCusto,
  }
}

/* ──────────────────────────────────────────────────── vale a pena ou não ─── */

export type Veredito = 'dentro' | 'limite' | 'acima' | 'sem_preco'

/**
 * O julgamento do prato, contra a meta DA CASA.
 *
 * A meta é por ficha de propósito: 30% é razoável num prato de cozinha e
 * péssimo num drink, onde 20% já é caro. Fixar um número de manual aqui faria
 * o sistema dar uma opinião que não é dele.
 *
 * A faixa de tolerância (cinco pontos) existe porque um prato a 31% com meta
 * de 30% não é um problema — é um aviso para olhar na próxima compra.
 */
export function vereditoDoCmv(cmv: number | null, alvo: number): Veredito {
  if (cmv === null) return 'sem_preco'
  if (cmv <= alvo) return 'dentro'
  if (cmv <= alvo + 5) return 'limite'
  return 'acima'
}

export const TEXTO_DO_VEREDITO: Record<Veredito, string> = {
  dentro: 'Dentro da meta',
  limite: 'No limite',
  acima: 'Acima da meta',
  sem_preco: 'Falta o preço de venda',
}

/**
 * O preço que faria o prato bater a meta. É a pergunta seguinte de quem viu
 * "acima da meta" — e ela não se responde de cabeça com CMV em percentual.
 */
export function precoParaAMeta(custoPorcao: number, alvo: number): number | null {
  if (custoPorcao <= 0 || alvo <= 0) return null
  return arredondar(custoPorcao / (alvo / 100), 2)
}

/* ─────────────────────────────────────────────────────────── a listagem ──── */

export interface GrupoDeFichas<T> {
  nome: string
  fichas: T[]
}

/** Agrupa pelo grupo do cardápio, com os sem grupo no fim, visíveis. */
export function agruparPorGrupo<T extends { grupo: string | null; nome: string }>(
  fichas: readonly T[],
): GrupoDeFichas<T>[] {
  const porGrupo = new Map<string, T[]>()
  for (const ficha of fichas) {
    const chave = ficha.grupo?.trim() ? ficha.grupo.trim() : ''
    const lista = porGrupo.get(chave)
    if (lista) lista.push(ficha)
    else porGrupo.set(chave, [ficha])
  }
  const nomes = [...porGrupo.keys()].sort((a, b) => {
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b, 'pt-BR')
  })
  return nomes.map((nome) => ({
    nome: nome === '' ? 'Sem grupo' : nome,
    fichas: [...(porGrupo.get(nome) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }))
}

/** Busca por nome do prato ou por insumo dentro dele. */
export function filtrarFichas<T extends { nome: string; grupo: string | null }>(
  fichas: readonly T[],
  busca: string,
): T[] {
  const termo = normalizarBusca(busca)
  if (termo === '') return [...fichas]
  return fichas.filter(
    (f) => normalizarBusca(f.nome).includes(termo) || normalizarBusca(f.grupo ?? '').includes(termo),
  )
}

function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}
