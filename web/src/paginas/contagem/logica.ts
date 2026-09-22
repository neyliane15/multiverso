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
  /** null = o setor não tem subdivisão; a linha vale pelo setor inteiro. */
  estoque_id?: string | null
  quantidade: number
  unidade: string
  custo_unitario: number
  total: number
  contado_em: string | null
  produto: { nome: string; categoria_id: string | null } | null
}

/**
 * Uma parada da folha: um setor sem subdivisão, ou um lugar dentro de um setor.
 *
 * A contagem se faz andando. Quem conta para na Geladeira 1, conta o que está
 * lá, e vai para a Geladeira 2 — não conta "o bar" de uma vez. Por isso a
 * navegação da folha é por parada, e não por setor: o setor sem lugar
 * cadastrado continua sendo uma parada só, que é a tela de antes dos estoques.
 */
export interface AbaDaFolha {
  id: string
  setorId: string
  estoqueId: string | null
  setorNome: string
  /** null quando a parada é o setor inteiro. */
  estoqueNome: string | null
  /** Linha de cima na aba. */
  titulo: string
  /** Linha de baixo, ou null quando o título já basta. */
  subtitulo: string | null
  cor: string
  itens: number
  preenchidos: number
  total: number
}

export interface TotalDoLugar {
  setor_id: string
  setor_nome: string
  setor_cor: string
  estoque_id: string | null
  estoque_nome: string | null
  itens: number
}

/**
 * Chave da parada. Setor e estoque juntos porque o id do estoque sozinho é
 * nulo no setor sem subdivisão, e o do setor sozinho não distingue geladeiras.
 */
export function chaveDoLugar(setorId: string, estoqueId: string | null | undefined): string {
  return `${setorId}:${estoqueId ?? ''}`
}

/**
 * Monta as paradas da folha.
 *
 * Os nomes e a contagem de itens vêm do servidor; o total e o progresso são
 * recalculados aqui para subirem junto com o que está sendo digitado — a view
 * só se atualiza depois do ida-e-volta.
 */
export function montarAbas(
  totais: readonly TotalDoLugar[],
  itens: readonly ItemContavel[],
  rascunhos?: Rascunhos,
): AbaDaFolha[] {
  // Setores que têm pelo menos um lugar cadastrado. Num setor desses, a parada
  // sem lugar não é "o bar": é o resto do bar, o que ainda não foi colocado em
  // geladeira nenhuma. Chamá-la de "Bar" ao lado de "Geladeira 1" faria pensar
  // que a primeira contém as outras.
  const divididos = new Set(
    totais.filter((t) => t.estoque_id !== null).map((t) => t.setor_id),
  )

  return totais.map((lugar) => {
    const id = chaveDoLugar(lugar.setor_id, lugar.estoque_id)
    const daParada = itens.filter(
      (i) => chaveDoLugar(i.setor_id, i.estoque_id) === id,
    )
    const semLugarNumSetorDividido =
      lugar.estoque_id === null && divididos.has(lugar.setor_id)
    return {
      id,
      titulo: semLugarNumSetorDividido
        ? 'Sem lugar definido'
        : (lugar.estoque_nome ?? lugar.setor_nome),
      subtitulo:
        lugar.estoque_nome !== null || semLugarNumSetorDividido ? lugar.setor_nome : null,
      setorId: lugar.setor_id,
      estoqueId: lugar.estoque_id,
      setorNome: lugar.setor_nome,
      estoqueNome: lugar.estoque_nome,
      cor: lugar.setor_cor,
      itens: lugar.itens,
      preenchidos: daParada.filter((i) => quantidadeEmVigor(i, rascunhos) > 0).length,
      total: totalDosItens(daParada, rascunhos),
    }
  })
}

/** Como a parada se chama na tela e nos textos de estado vazio. */
export function rotuloDaAba(aba: Pick<AbaDaFolha, 'titulo' | 'subtitulo'>): string {
  return aba.subtitulo === null ? aba.titulo : `${aba.subtitulo} › ${aba.titulo}`
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
