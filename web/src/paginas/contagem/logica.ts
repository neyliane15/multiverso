/**
 * Lógica da folha de contagem: busca, agrupamento, totais e o resumo que a
 * confirmação de fechamento mostra.
 *
 * Nada aqui importa React ou Supabase de propósito — é o miolo que os testes
 * conseguem exercitar sem montar tela nem subir banco.
 */
import { chaveBusca } from '@/util/formato'

/** O mínimo que a lógica precisa de `contagem_itens` (+ o nome do produto). */
export interface ItemContavel {
  id: string
  produto_id: string
  setor_id: string
  quantidade: number
  unidade: string
  custo_unitario: number
  total: number
  contado_em: string | null
  produto: { nome: string; categoria_id: string | null } | null
}

export interface CategoriaSimples {
  id: string
  nome: string
  cor: string
}

export interface GrupoDeCategoria {
  categoriaId: string | null
  nome: string
  cor: string | null
  itens: ItemContavel[]
  total: number
}

export interface FiltroDaFolha {
  busca?: string
  soNaoContados?: boolean
}

/** Quantidade em vigor: o rascunho local vence o que veio do servidor. */
export type Rascunhos = ReadonlyMap<string, number>

export function quantidadeEmVigor(item: ItemContavel, rascunhos?: Rascunhos): number {
  const local = rascunhos?.get(item.id)
  return local === undefined ? item.quantidade : local
}

export function totalDoItem(item: ItemContavel, rascunhos?: Rascunhos): number {
  return quantidadeEmVigor(item, rascunhos) * item.custo_unitario
}

/**
 * "Já passei por este" — e não "tem estoque".
 *
 * Um item zerado de propósito (acabou o produto) foi trabalhado e não pode
 * voltar para a lista do que falta contar; quem carrega essa informação é o
 * carimbo `contado_em`. O progresso por setor, esse sim, conta quantidade > 0,
 * porque é o que a view `vw_contagem_por_setor` congela.
 */
export function foiTrabalhado(item: ItemContavel, rascunhos?: Rascunhos): boolean {
  if (rascunhos?.has(item.id)) return true
  return item.contado_em !== null || item.quantidade > 0
}

export function filtrarItens(
  itens: readonly ItemContavel[],
  filtro: FiltroDaFolha = {},
  rascunhos?: Rascunhos,
): ItemContavel[] {
  const alvo = chaveBusca(filtro.busca ?? '')
  const termos = alvo === '' ? [] : alvo.split(' ')

  return itens.filter((item) => {
    if (filtro.soNaoContados && foiTrabalhado(item, rascunhos)) return false
    if (termos.length === 0) return true
    // Busca sem acento e por pedaço: "tilapia file" acha "FILÉ DE TILÁPIA".
    const nome = chaveBusca(item.produto?.nome ?? '')
    return termos.every((termo) => nome.includes(termo))
  })
}

/**
 * Agrupa por categoria na ordem do cadastro. Categoria sem item some da tela;
 * produto sem categoria cai num grupo próprio, no fim — esconder seria perder
 * item de vista bem na hora de contar.
 */
export function agruparPorCategoria(
  itens: readonly ItemContavel[],
  categorias: readonly CategoriaSimples[],
  rascunhos?: Rascunhos,
): GrupoDeCategoria[] {
  const porCategoria = new Map<string | null, ItemContavel[]>()
  for (const item of itens) {
    const chave = item.produto?.categoria_id ?? null
    const grupo = porCategoria.get(chave)
    if (grupo) grupo.push(item)
    else porCategoria.set(chave, [item])
  }

  const ordenados = (lista: ItemContavel[]): ItemContavel[] =>
    [...lista].sort((a, b) => (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR'))

  const grupos: GrupoDeCategoria[] = []
  for (const categoria of categorias) {
    const lista = porCategoria.get(categoria.id)
    if (!lista) continue
    const itensOrdenados = ordenados(lista)
    grupos.push({
      categoriaId: categoria.id,
      nome: categoria.nome,
      cor: categoria.cor,
      itens: itensOrdenados,
      total: totalDosItens(itensOrdenados, rascunhos),
    })
    porCategoria.delete(categoria.id)
  }

  // Sobrou categoria que não está no cadastro ativo (arquivada, por exemplo) —
  // ela continua tendo itens na folha, então continua aparecendo.
  for (const [chave, lista] of porCategoria) {
    const itensOrdenados = ordenados(lista)
    grupos.push({
      categoriaId: chave,
      nome: chave === null ? 'Sem categoria' : 'Outra categoria',
      cor: null,
      itens: itensOrdenados,
      total: totalDosItens(itensOrdenados, rascunhos),
    })
  }
  return grupos
}

export function totalDosItens(itens: readonly ItemContavel[], rascunhos?: Rascunhos): number {
  return itens.reduce((soma, item) => soma + totalDoItem(item, rascunhos), 0)
}

export interface ResumoDoFechamento {
  itens: number
  /** Itens com quantidade maior que zero: é o que a view chama de preenchido. */
  comQuantidade: number
  /** O que vai congelar valendo zero. */
  zerados: number
  /** Dos zerados, os que ninguém chegou a abrir. */
  nuncaTocados: number
  total: number
}

/**
 * O que a confirmação de fechamento precisa dizer antes de congelar a foto.
 *
 * Zerado e nunca tocado são coisas diferentes: o primeiro pode ser verdade
 * (acabou o produto), o segundo é quase sempre item esquecido — e item
 * esquecido vira estoque final menor, CMV maior e ninguém entende por quê.
 */
export function resumoDoFechamento(
  itens: readonly ItemContavel[],
  rascunhos?: Rascunhos,
): ResumoDoFechamento {
  let comQuantidade = 0
  let zerados = 0
  let nuncaTocados = 0
  for (const item of itens) {
    const quantidade = quantidadeEmVigor(item, rascunhos)
    if (quantidade > 0) comQuantidade += 1
    else {
      zerados += 1
      if (!foiTrabalhado(item, rascunhos)) nuncaTocados += 1
    }
  }
  return {
    itens: itens.length,
    comQuantidade,
    zerados,
    nuncaTocados,
    total: totalDosItens(itens, rascunhos),
  }
}

/** Referência sugerida ao abrir uma contagem: hoje, em `YYYY-MM-DD` local. */
export function hojeIso(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}
