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

/* ──────────────────────────────────────────────── o eixo da contagem ────── */

/**
 * Por onde se caminha na folha.
 *
 * Contar é uma tarefa física, e nem toda casa a faz do mesmo jeito. Quem tem
 * o estoque organizado por lugar anda por setor. Quem confere preço de compra
 * quer todas as bebidas juntas, venham de onde vierem. Quem está caçando um
 * item específico não quer navegação nenhuma — quer a lista inteira e a busca.
 *
 * A tela não escolhe por ninguém: o eixo é do usuário, e os três reagrupam
 * exatamente as mesmas linhas. Nada é criado nem escondido ao trocar.
 */
export type Eixo = 'setor' | 'categoria' | 'produto'

export const EIXOS: { valor: Eixo; rotulo: string; ajuda: string }[] = [
  { valor: 'setor', rotulo: 'Setor', ajuda: 'Uma parada por setor e por lugar — a ordem em que se anda pela casa.' },
  { valor: 'categoria', rotulo: 'Categoria', ajuda: 'Uma parada por categoria, com os setores agrupados dentro.' },
  // O `valor` continua 'produto': ele é a chave gravada no localStorage de quem
  // conta, e trocá-la jogaria fora a preferência de eixo de todo mundo. O que
  // a pessoa lê é o `rotulo`.
  { valor: 'produto', rotulo: 'Insumo', ajuda: 'A folha inteira numa lista só, em ordem alfabética.' },
]

/** Uma parada da navegação: um setor, um lugar, uma categoria. */
export interface Parada {
  id: string
  titulo: string
  subtitulo: string | null
  cor: string | null
  itens: number
  preenchidos: number
  total: number
}

/** Um bloco dentro da parada aberta. */
export interface Grupo {
  id: string
  nome: string
  cor: string | null
  itens: ItemContavel[]
  total: number
}

const porNome = (a: ItemContavel, b: ItemContavel) =>
  (a.produto?.nome ?? '').localeCompare(b.produto?.nome ?? '', 'pt-BR')

/**
 * Agrupa por uma chave qualquer, na ordem dada.
 *
 * A ordem vem do cadastro, e não do `Map`: categoria e setor têm ordem própria
 * que o admin define, e obedecê-la é o que faz a folha da tela bater com a
 * folha de papel. O que sobrar — categoria arquivada, setor que saiu do
 * cadastro — vai para o fim, visível. Esconder seria perder item de vista bem
 * na hora de contar.
 */
export function agrupar(
  itens: readonly ItemContavel[],
  chaveDoItem: (item: ItemContavel) => string,
  ordem: readonly { id: string; nome: string; cor: string | null }[],
  rascunhos?: Rascunhos,
  nomeDoResto = 'Fora do cadastro',
): Grupo[] {
  const porChave = new Map<string, ItemContavel[]>()
  for (const item of itens) {
    const chave = chaveDoItem(item)
    const lista = porChave.get(chave)
    if (lista) lista.push(item)
    else porChave.set(chave, [item])
  }

  const montar = (id: string, nome: string, cor: string | null, lista: ItemContavel[]): Grupo => {
    const ordenados = [...lista].sort(porNome)
    return { id, nome, cor, itens: ordenados, total: totalDosItens(ordenados, rascunhos) }
  }

  const grupos: Grupo[] = []
  for (const { id, nome, cor } of ordem) {
    const lista = porChave.get(id)
    if (!lista) continue
    grupos.push(montar(id, nome, cor, lista))
    porChave.delete(id)
  }
  for (const [chave, lista] of porChave) {
    grupos.push(montar(chave, nomeDoResto, null, lista))
  }
  return grupos
}

/** A chave de categoria de um item, com um balde próprio para quem não tem. */
export const chaveDaCategoria = (item: ItemContavel): string =>
  item.produto?.categoria_id ?? 'sem-categoria'

/**
 * As paradas do eixo escolhido.
 *
 * No eixo `produto` não há parada nenhuma: a folha é uma lista só, e uma
 * navegação de uma entrada só seria enfeite ocupando a largura da tela.
 */
/**
 * Um setor com os lugares dentro — a navegação da contagem por setor.
 *
 * Antes eram paradas soltas: "Sem lugar definido", "Geladeira 1", "Geladeira
 * 2", "Cozinha", "Câmara fria"… tudo no mesmo nível, e a relação entre elas só
 * existia na cabeça de quem lia. Com quatro setores e alguns lugares em cada,
 * a coluna virava uma lista de quinze entradas sem hierarquia nenhuma.
 *
 * Agora o setor é o galho e os lugares são as folhas. Clicar no setor mostra
 * o setor INTEIRO, com os lugares como subgrupos; clicar num lugar estreita
 * para ele. As duas coisas que quem conta quer, sem escolher uma só.
 */
export interface RamoDeSetor {
  setorId: string
  nome: string
  cor: string
  itens: number
  preenchidos: number
  total: number
  /** Os lugares do setor. Vazio quando o setor não tem subdivisão. */
  lugares: Parada[]
}

/**
 * Um lugar como ele existe no CADASTRO — que não é a mesma coisa que um lugar
 * com linha nesta folha.
 *
 * A folha é uma foto do cadastro no instante em que a contagem abriu. Um lugar
 * criado depois, ou um lugar ainda sem produto nenhum, não produz linha
 * nenhuma — e, se a navegação só olhasse para as linhas, ele simplesmente não
 * existiria na tela. Quem acabou de criar a "Prateleira" clicaria na Cozinha,
 * não veria a Prateleira, e não teria como saber se errou o cadastro, se o
 * sistema não salvou, ou se falta um passo.
 */
export interface LugarDoCadastro {
  id: string
  setor_id: string
  nome: string
}

/** A chave de uma seleção de SETOR inteiro, distinta da de um lugar. */
export const chaveDoSetor = (setorId: string): string => `setor:${setorId}`

/** A seleção é de um setor inteiro? */
export const ehSelecaoDeSetor = (selecao: string | null): boolean =>
  selecao !== null && selecao.startsWith('setor:')

const setorDaSelecao = (selecao: string): string => selecao.slice('setor:'.length)

/**
 * O estoque de uma seleção de lugar — nulo quando é o setor inteiro ou o
 * balde "sem lugar". É o que a tela precisa para explicar um lugar vazio.
 */
export function estoqueDaSelecao(selecao: string | null): string | null {
  if (selecao === null || ehSelecaoDeSetor(selecao)) return null
  const estoque = selecao.slice(selecao.indexOf(':') + 1)
  return estoque === '' ? null : estoque
}

/**
 * Monta a árvore: um galho por setor, com os lugares dentro.
 *
 * O setor sem subdivisão nenhuma continua sendo um galho SEM folhas — e não
 * um galho com uma folha só chamada "Sem lugar definido". Um nível de
 * hierarquia que não separa nada é só um clique a mais.
 */
export function montarArvoreDeSetores(
  totais: readonly TotalDoLugar[],
  itens: readonly ItemContavel[],
  rascunhos?: Rascunhos,
  /** Os lugares do cadastro, para os que ainda não têm linha aparecerem. */
  lugaresDoCadastro: readonly LugarDoCadastro[] = [],
): RamoDeSetor[] {
  const paradas = montarAbas(totais, itens, rascunhos)
  const porSetor = new Map<string, RamoDeSetor>()

  for (const parada of paradas) {
    let ramo = porSetor.get(parada.setorId)
    if (!ramo) {
      ramo = {
        setorId: parada.setorId,
        nome: parada.setorNome,
        cor: parada.cor,
        itens: 0,
        preenchidos: 0,
        total: 0,
        lugares: [],
      }
      porSetor.set(parada.setorId, ramo)
    }
    ramo.itens += parada.itens
    ramo.preenchidos += parada.preenchidos
    ramo.total += parada.total
    ramo.lugares.push({
      id: parada.id,
      titulo: parada.titulo,
      subtitulo: null,
      cor: parada.cor,
      itens: parada.itens,
      preenchidos: parada.preenchidos,
      total: parada.total,
    })
  }

  /**
   * Os lugares do cadastro que ainda não têm linha nenhuma nesta folha.
   *
   * Entram com 0/0 e no fim da lista do setor. Mostrar um lugar vazio não é
   * poluição: é a única forma de quem criou a "Prateleira" agora há pouco ver
   * que ela existe — e, ao clicar, ler por que ela ainda não tem o que contar.
   * O silêncio é que seria o defeito.
   *
   * Setor que não está na folha (não entrou nesta contagem) não ganha galho
   * por causa de um lugar: ali o lugar vazio seria o menor dos assuntos.
   */
  for (const lugar of lugaresDoCadastro) {
    const ramo = porSetor.get(lugar.setor_id)
    if (!ramo) continue
    const chave = chaveDoLugar(lugar.setor_id, lugar.id)
    if (ramo.lugares.some((l) => l.id === chave)) continue
    ramo.lugares.push({
      id: chave,
      titulo: lugar.nome,
      subtitulo: null,
      cor: ramo.cor,
      itens: 0,
      preenchidos: 0,
      total: 0,
    })
  }

  for (const ramo of porSetor.values()) {
    // Um lugar só, e ele é o próprio setor: não há o que abrir.
    if (ramo.lugares.length === 1 && ramo.lugares[0]?.id === chaveDoLugar(ramo.setorId, null)) {
      ramo.lugares = []
      continue
    }
    /**
     * Com vizinhos ao lado, o resto do setor deixa de se chamar pelo nome do
     * setor. "Cozinha" logo abaixo de "Cozinha" faria pensar em repetição ou
     * em erro de tela — e não é nem uma coisa nem outra: é o que ainda não foi
     * posto em lugar nenhum. A folha aberta antes do lugar existir nasce com
     * essa parada chamada pelo setor, porque na hora não havia o que separar.
     */
    const resto = ramo.lugares.find((l) => l.id === chaveDoLugar(ramo.setorId, null))
    if (resto && resto.titulo === ramo.nome) resto.titulo = 'Sem lugar definido'
  }

  return [...porSetor.values()]
}

export function montarParadas(
  eixo: Eixo,
  totais: readonly TotalDoLugar[],
  categorias: readonly CategoriaSimples[],
  itens: readonly ItemContavel[],
  rascunhos?: Rascunhos,
): Parada[] {
  if (eixo === 'produto') return []

  if (eixo === 'setor') {
    return montarAbas(totais, itens, rascunhos).map((aba) => ({
      id: aba.id,
      titulo: aba.titulo,
      subtitulo: aba.subtitulo,
      cor: aba.cor,
      itens: aba.itens,
      preenchidos: aba.preenchidos,
      total: aba.total,
    }))
  }

  // Categoria: só as que têm linha nesta folha. Listar as 21 do cadastro com
  // metade zerada faria a navegação mentir sobre o tamanho do trabalho.
  const grupos = agrupar(itens, chaveDaCategoria, categorias, rascunhos, 'Sem categoria')
  return grupos.map((grupo) => ({
    id: grupo.id,
    titulo: grupo.nome,
    subtitulo: null,
    cor: grupo.cor,
    itens: grupo.itens.length,
    preenchidos: grupo.itens.filter((i) => quantidadeEmVigor(i, rascunhos) > 0).length,
    total: grupo.total,
  }))
}

/** Os itens que a parada aberta mostra. No eixo `produto`, a folha inteira. */
export function itensDaParada(
  eixo: Eixo,
  paradaId: string | null,
  itens: readonly ItemContavel[],
): ItemContavel[] {
  if (eixo === 'produto' || paradaId === null) return [...itens]
  if (eixo === 'setor') {
    // Seleção de setor inteiro: todas as linhas dele, de todos os lugares.
    if (ehSelecaoDeSetor(paradaId)) {
      const setor = setorDaSelecao(paradaId)
      return itens.filter((i) => i.setor_id === setor)
    }
    return itens.filter((i) => chaveDoLugar(i.setor_id, i.estoque_id) === paradaId)
  }
  return itens.filter((i) => chaveDaCategoria(i) === paradaId)
}

/**
 * Os blocos dentro da parada — sempre o outro eixo.
 *
 * Andando por setor, o que organiza a parada é a categoria; andando por
 * categoria, é o setor. No eixo produto não há bloco: um cartão só, porque
 * ali a pessoa está buscando pelo nome e qualquer divisão atrapalha.
 */
/** Os lugares como eixo de agrupamento, na ordem em que o servidor os manda. */
function ordemDosLugares(
  lugares: readonly TotalDoLugar[],
): { id: string; nome: string; cor: string | null }[] {
  return lugares.map((lugar) => ({
    id: chaveDoLugar(lugar.setor_id, lugar.estoque_id),
    nome:
      lugar.estoque_nome === null ? lugar.setor_nome : `${lugar.setor_nome} › ${lugar.estoque_nome}`,
    cor: lugar.setor_cor,
  }))
}

export function gruposDaParada(
  eixo: Eixo,
  itens: readonly ItemContavel[],
  categorias: readonly CategoriaSimples[],
  lugares: readonly TotalDoLugar[],
  rascunhos?: Rascunhos,
  /** A seleção, para o setor inteiro saber que deve se abrir por lugar. */
  selecao?: string | null,
): Grupo[] {
  if (eixo === 'setor') {
    /**
     * Setor inteiro selecionado: os subgrupos são os LUGARES.
     *
     * É o que quem conta pediu — clicar no Bar e ver a Geladeira 1 e a 2 como
     * blocos, cada uma com o seu total. Agrupar por categoria aqui misturaria
     * as geladeiras dentro de "BEBIDAS ALCOÓLICAS", e a folha deixaria de
     * corresponder ao caminho que se faz a pé.
     *
     * Dentro de UM lugar, porém, a categoria volta a mandar: ali já não há o
     * que separar por lugar.
     */
    if (ehSelecaoDeSetor(selecao ?? null)) {
      const setor = setorDaSelecao(selecao as string)
      const doSetor = ordemDosLugares(lugares).filter((l) => l.id.startsWith(`${setor}:`))
      /**
       * Setor sem subdivisão: a categoria manda, como em qualquer lugar.
       *
       * Dividir por lugar aqui daria UM bloco só, com o nome do setor
       * repetindo o título da parada e o rodapé. Um cabeçalho que não separa
       * nada é ruído em cima da folha.
       */
      if (doSetor.length > 1) {
        // O lugar nulo não se chama pelo nome do setor quando há outros ao
        // lado: "Bar" ao lado de "Bar › Geladeira 1" faria pensar que um
        // contém o outro. É o resto do setor, e a navegação já o chama assim.
        const semLugar = chaveDoLugar(setor, null)
        const nomeados = doSetor.map((l) =>
          l.id === semLugar ? { ...l, nome: 'Sem lugar definido' } : l,
        )
        return agrupar(
          itens,
          (i) => chaveDoLugar(i.setor_id, i.estoque_id),
          nomeados,
          rascunhos,
          'Sem lugar definido',
        )
      }
    }
    return agrupar(itens, chaveDaCategoria, categorias, rascunhos, 'Sem categoria')
  }
  if (eixo === 'categoria') {
    return agrupar(
      itens,
      (i) => chaveDoLugar(i.setor_id, i.estoque_id),
      ordemDosLugares(lugares),
      rascunhos,
      'Fora do cadastro',
    )
  }
  // Ordem alfabética, e o lugar desempata. Um produto guardado em cinco
  // lugares rende cinco linhas com o MESMO nome: sem desempate elas saem numa
  // ordem qualquer, e preencher a terceira geladeira vira adivinhação. O
  // índice vem de `lugares`, que já chega ordenado por setor e por lugar.
  const posicao = new Map(
    lugares.map((lugar, i) => [chaveDoLugar(lugar.setor_id, lugar.estoque_id), i]),
  )
  const ordenados = [...itens].sort((a, b) => {
    const nome = porNome(a, b)
    if (nome !== 0) return nome
    const pa = posicao.get(chaveDoLugar(a.setor_id, a.estoque_id)) ?? Number.MAX_SAFE_INTEGER
    const pb = posicao.get(chaveDoLugar(b.setor_id, b.estoque_id)) ?? Number.MAX_SAFE_INTEGER
    return pa - pb
  })
  return [{ id: 'todos', nome: 'Todos os insumos', cor: null, itens: ordenados, total: totalDosItens(ordenados, rascunhos) }]
}

/** Onde este item está, para a linha se explicar sozinha no eixo produto. */
export function ondeFica(
  item: ItemContavel,
  lugares: readonly TotalDoLugar[],
): string | null {
  const chave = chaveDoLugar(item.setor_id, item.estoque_id)
  const lugar = lugares.find((l) => chaveDoLugar(l.setor_id, l.estoque_id) === chave)
  if (!lugar) return null
  return lugar.estoque_nome === null ? lugar.setor_nome : `${lugar.setor_nome} › ${lugar.estoque_nome}`
}
