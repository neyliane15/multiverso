/**
 * Lógica das telas de compras: filtro do histórico, totais do período e a
 * folha de pedido agrupada.
 *
 * Sem React e sem Supabase, para os testes alcançarem.
 */
import { chaveBusca } from '@/util/formato'

// ─────────────────────────────────────────────── 3.3 · histórico ───────────

/** O mínimo que o filtro precisa de `vw_compras_historico`. */
export interface CompraFiltravel {
  id: string
  emitida_em: string
  fornecedor_id: string | null
  fornecedor_nome: string
  status: string
  valor_total: number
  itens_pendentes: number
}

export interface FiltroDeCompras {
  /** `YYYY-MM-DD`, inclusivo. */
  inicio?: string
  /** `YYYY-MM-DD`, inclusivo. */
  fim?: string
  fornecedorId?: string
  /** Busca livre pelo nome do fornecedor ou pelo número da nota. */
  busca?: string
  /** Só as notas que ainda têm item sem produto vinculado. */
  soPendentes?: boolean
}

export function filtrarCompras<T extends CompraFiltravel>(
  compras: readonly T[],
  filtro: FiltroDeCompras = {},
): T[] {
  const alvo = chaveBusca(filtro.busca ?? '')
  return compras.filter((compra) => {
    // Datas em ISO comparam como texto — não é atalho, é o único jeito de não
    // arrastar fuso para dentro de um filtro de dia.
    const dia = compra.emitida_em.slice(0, 10)
    if (filtro.inicio && dia < filtro.inicio) return false
    if (filtro.fim && dia > filtro.fim) return false
    if (filtro.fornecedorId && compra.fornecedor_id !== filtro.fornecedorId) return false
    if (filtro.soPendentes && compra.itens_pendentes === 0) return false
    if (alvo !== '' && !chaveBusca(compra.fornecedor_nome).includes(alvo)) return false
    return true
  })
}

export interface TotaisDeCompras {
  notas: number
  /** Só as notas lançadas entram: é o que o CMV enxerga. */
  total: number
  /** Valor que ainda não conta para o CMV porque a nota não foi lançada. */
  totalNaoLancado: number
  notasPendentes: number
  itensPendentes: number
}

/**
 * Totaliza o período separando o que já virou custo do que ainda não virou.
 *
 * `mv_cmv_periodo` só soma nota com status `lancada`. Mostrar um total único,
 * misturando importada e lançada, faria a tela de compras brigar com o
 * dashboard de CMV — e quem confere acharia que um dos dois está errado.
 */
export function totalizarCompras(compras: readonly CompraFiltravel[]): TotaisDeCompras {
  let total = 0
  let totalNaoLancado = 0
  let notasPendentes = 0
  let itensPendentes = 0

  for (const compra of compras) {
    if (compra.status === 'cancelada') continue
    if (compra.status === 'lancada') total += compra.valor_total
    else totalNaoLancado += compra.valor_total
    if (compra.itens_pendentes > 0) {
      notasPendentes += 1
      itensPendentes += compra.itens_pendentes
    }
  }

  return { notas: compras.length, total, totalNaoLancado, notasPendentes, itensPendentes }
}

// ───────────────────────────────────────── 3.2 · lista de compras ──────────

export interface ItemDeFolha {
  id: string
  produto_id: string
  quantidade: number
  unidade: string
  custo_estimado: number
  comprado: boolean
  produto: { nome: string; categoria_id: string | null } | null
}

export interface CategoriaSimples {
  id: string
  nome: string
  cor: string
}

export interface GrupoDaFolha<T extends ItemDeFolha> {
  categoriaId: string | null
  nome: string
  cor: string | null
  itens: T[]
  total: number
}

export type Quantidades = ReadonlyMap<string, number>

export function quantidadeDoItem(item: ItemDeFolha, rascunhos?: Quantidades): number {
  const local = rascunhos?.get(item.id)
  return local === undefined ? item.quantidade : local
}

export function totalDoItemDaFolha(item: ItemDeFolha, rascunhos?: Quantidades): number {
  return quantidadeDoItem(item, rascunhos) * item.custo_estimado
}

/**
 * Agrupa a folha por categoria, deixando de fora o que já foi comprado.
 *
 * Dentro do mercado, item comprado só atrapalha: ele sai da frente e vai para
 * a lista de conferência no rodapé.
 */
export function agruparFolha<T extends ItemDeFolha>(
  itens: readonly T[],
  categorias: readonly CategoriaSimples[],
  opcoes: { busca?: string; incluirComprados?: boolean } = {},
  rascunhos?: Quantidades,
): GrupoDaFolha<T>[] {
  const alvo = chaveBusca(opcoes.busca ?? '')
  const visiveis = itens.filter((item) => {
    if (!opcoes.incluirComprados && item.comprado) return false
    if (alvo === '') return true
    return chaveBusca(item.produto?.nome ?? '').includes(alvo)
  })

  const porCategoria = new Map<string | null, T[]>()
  for (const item of visiveis) {
    const chave = item.produto?.categoria_id ?? null
    const lista = porCategoria.get(chave)
    if (lista) lista.push(item)
    else porCategoria.set(chave, [item])
  }

  const ordenar = (lista: T[]): T[] =>
    [...lista].sort((a, b) => (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR'))

  const grupos: GrupoDaFolha<T>[] = []
  for (const categoria of categorias) {
    const lista = porCategoria.get(categoria.id)
    if (!lista) continue
    const ordenada = ordenar(lista)
    grupos.push({
      categoriaId: categoria.id,
      nome: categoria.nome,
      cor: categoria.cor,
      itens: ordenada,
      total: ordenada.reduce((soma, item) => soma + totalDoItemDaFolha(item, rascunhos), 0),
    })
    porCategoria.delete(categoria.id)
  }

  for (const [chave, lista] of porCategoria) {
    const ordenada = ordenar(lista)
    grupos.push({
      categoriaId: chave,
      nome: chave === null ? 'Sem categoria' : 'Outra categoria',
      cor: null,
      itens: ordenada,
      total: ordenada.reduce((soma, item) => soma + totalDoItemDaFolha(item, rascunhos), 0),
    })
  }
  return grupos
}

export interface ResumoDaFolha {
  itens: number
  /** Itens com quantidade pedida, ainda não comprados. */
  aComprar: number
  comprados: number
  totalEstimado: number
}

/** O total estimado só soma o que tem quantidade: pedir zero não custa nada. */
export function resumirFolha(
  itens: readonly ItemDeFolha[],
  rascunhos?: Quantidades,
): ResumoDaFolha {
  let aComprar = 0
  let comprados = 0
  let totalEstimado = 0
  for (const item of itens) {
    const quantidade = quantidadeDoItem(item, rascunhos)
    if (item.comprado) comprados += 1
    else if (quantidade > 0) aComprar += 1
    if (quantidade > 0) totalEstimado += quantidade * item.custo_estimado
  }
  return { itens: itens.length, aComprar, comprados, totalEstimado }
}

// ─────────────────────────────────────────── 3.1 · notas fiscais ───────────

export interface ItemConferivel {
  id: string
  produto_id: string | null
}

export interface ResumoDaConferencia {
  itens: number
  vinculados: number
  pendentes: number
  /** Só com tudo vinculado o banco aceita lançar (`mv_lancar_nota`). */
  podeLancar: boolean
}

export function resumirConferencia(itens: readonly ItemConferivel[]): ResumoDaConferencia {
  const vinculados = itens.filter((item) => item.produto_id !== null).length
  const pendentes = itens.length - vinculados
  return {
    itens: itens.length,
    vinculados,
    pendentes,
    podeLancar: itens.length > 0 && pendentes === 0,
  }
}
