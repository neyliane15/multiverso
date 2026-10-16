/**
 * Lógica do relatório de contagem — o fluxo que a cliente desenhou:
 *
 *   1 CONTAGEM ANTERIOR → 2 COMPRAS → 3 VENDAS → 4 CONTAGEM ATUAL
 *                       → 5 CONSUMO → 6 IDEAL
 *
 *   CONSUMO   = contagem anterior + compras − contagem atual
 *   IDEAL     = contagem anterior + compras − vendas
 *   DIFERENÇA = contagem atual − ideal
 *
 * As contas são do banco (`mv_relatorio_de_contagem`), e é de propósito: elas
 * dependem de explodir a árvore de cada ficha vendida, e isso tem de acontecer
 * onde os dados estão. O que mora aqui é o que a TELA faz com as linhas —
 * filtrar, ordenar, somar o rodapé, e **julgar** cada linha.
 *
 * O julgamento é a parte que vale o arquivo. A regra da cliente tem três
 * estados, não dois:
 *
 *   contagem atual  >  média das 3 últimas vendas → "Não precisa comprar"
 *   contagem atual  ≤  média                      → sugere (média − atual)
 *   média inexistente                             → NÃO SE SABE
 *
 * O terceiro estado é o que um `if/else` perderia. Sem venda fechada nenhuma
 * não há média, e "não precisa comprar" seria uma resposta inventada — a mais
 * perigosa das três, porque manda a casa para a semana seguinte sem estoque.
 * O banco devolve `precisa_comprar` nulo nesse caso, e aqui ele vira um estado
 * próprio, com o motivo em texto.
 *
 * Sem React e sem Supabase, de propósito: é o miolo que os testes exercitam.
 */
import type { LinhaDoRelatorio } from '@/tipos/banco'
import { chaveBusca } from '@/util/formato'

/* ──────────────────────────────────────────────────── as fórmulas ───────── */

/**
 * As fórmulas, em texto, para a tela poder escrevê-las ONDE o número está.
 *
 * Elas vivem aqui e não espalhadas no JSX porque a tela mostra cada uma em
 * dois lugares (no cabeçalho da coluna e no cartão do celular), e duas cópias
 * de uma fórmula são duas chances de uma delas ficar velha.
 */
export const FORMULAS = {
  consumo: 'contagem anterior + compras − contagem atual',
  ideal: 'contagem anterior + compras − vendas',
  diferenca: 'contagem atual − ideal',
  sugestao: 'média das 3 últimas vendas − contagem atual',
} as const

/** O que cada coluna responde, em uma linha, para o cabeçalho explicar-se. */
export const EXPLICACOES = {
  consumo: 'O que o ESTOQUE diz que saiu.',
  ideal: 'O que o CARDÁPIO diz que deveria ter sobrado.',
  diferenca: 'A distância entre as duas. Negativa: falta no estoque o que ninguém vendeu.',
} as const

/* ────────────────────────────────────────────────── o julgamento ────────── */

export type Veredito = 'comprar' | 'tem_de_sobra' | 'sem_movimento' | 'sem_base'

export interface SugestaoJulgada {
  veredito: Veredito
  /** O que a tela escreve na célula. */
  rotulo: string
  /** Quanto sugerir. Nulo nos dois estados em que não há quantidade a sugerir. */
  quantidade: number | null
  /** Por que, quando a resposta não é um número. */
  motivo: string | null
}

/**
 * Julga UMA linha.
 *
 * O empate é tratado como "precisa comprar" porque a regra da cliente diz
 * "se a contagem atual for MAIOR que a média, não precisa comprar" — e no
 * empate ela não é maior. A sugestão nesse caso é exatamente zero, e a tela
 * diz "no limite da média": é a informação que faz a pessoa olhar o item sem
 * mandá-la comprar nada. A borda está decidida de propósito, e o banco decide
 * igual (`precisa_comprar = contagem_atual <= media_3`).
 */
export function julgarSugestao(linha: LinhaDoRelatorio): SugestaoJulgada {
  if (linha.precisa_comprar === null || linha.media_3_vendas === null) {
    return {
      veredito: 'sem_base',
      rotulo: 'Não se sabe',
      quantidade: null,
      motivo:
        linha.vendas_consideradas === 0
          ? 'Nenhuma venda fechada até a data desta contagem.'
          : 'Algum insumo desta venda está sem conversão de unidade.',
    }
  }
  if (!linha.precisa_comprar) {
    return {
      veredito: 'tem_de_sobra',
      rotulo: 'Não precisa comprar',
      quantidade: null,
      motivo: null,
    }
  }
  const quantidade = linha.sugestao ?? 0

  /*
   * O empate em ZERO não é o mesmo empate.
   *
   * A regra da cliente é literal e o banco a aplica ao pé da letra: estoque 0
   * contra média 0 é `precisa_comprar = true`, sugestão 0. Tecnicamente certo,
   * e inútil na tela: medido na carga real do Bar do Zeca, 882 linhas no
   * relatório viravam **538 "precisa comprar"**, das quais a esmagadora
   * maioria era insumo que não foi vendido e não está em estoque — um pedido
   * de compra com quinhentas linhas de nada.
   *
   * Então a tela nomeia o sub-caso em vez de escondê-lo. Nada muda de número:
   * a sugestão continua zero e a linha continua ali, com todas as colunas. O
   * que muda é que o resumo e o filtro "só o que comprar" param de contar como
   * decisão pendente aquilo sobre o que não há decisão nenhuma a tomar.
   */
  if (quantidade === 0 && linha.media_3_vendas === 0 && linha.contagem_atual === 0) {
    return {
      veredito: 'sem_movimento',
      rotulo: 'Sem movimento',
      quantidade: null,
      motivo: 'Não foi vendido e não está em estoque.',
    }
  }

  return {
    veredito: 'comprar',
    rotulo: quantidade === 0 ? 'No limite da média' : 'Comprar',
    quantidade,
    motivo: quantidade === 0 ? 'O estoque empata com a média: não sobra folga.' : null,
  }
}

/* ────────────────────────────────────────────────────── filtro e ordem ─── */

export type OrdemDoRelatorio = 'nome' | 'diferenca' | 'sugestao' | 'consumo'

export interface FiltroDoRelatorio {
  busca?: string
  /**
   * Três estados, e eles não são dois.
   *
   * `undefined` (ou ausente) = todas as categorias. `null` = o balde **Sem
   * categoria**, que tem linhas de verdade num catálogo de 900 itens. Uma
   * string = aquela categoria. Usar `null` para "todas" tornaria o balde
   * inalcançável pelo filtro, que é o defeito que isto tranca.
   */
  categoriaId?: string | null
  soPrecisaComprar?: boolean
  soComPendencia?: boolean
}

export function filtrarRelatorio(
  linhas: readonly LinhaDoRelatorio[],
  filtro: FiltroDoRelatorio = {},
): LinhaDoRelatorio[] {
  const alvo = chaveBusca(filtro.busca ?? '')
  const termos = alvo === '' ? [] : alvo.split(' ')

  return linhas.filter((l) => {
    // "Só o que precisa comprar" guarda o que comprar E o que NÃO SE SABE, de
    // propósito: a lista existe para fechar o pedido da semana, e item sem
    // resposta é justamente o que precisa de olho humano antes do pedido sair.
    // O que sai são as duas respostas prontas — "tem de sobra" e "sem
    // movimento".
    if (filtro.soPrecisaComprar) {
      const veredito = julgarSugestao(l).veredito
      if (veredito === 'tem_de_sobra' || veredito === 'sem_movimento') return false
    }
    if (filtro.soComPendencia && l.pendencia === null) return false
    if (filtro.categoriaId !== undefined && l.categoria_id !== filtro.categoriaId) return false
    if (termos.length === 0) return true
    const nome = chaveBusca(l.produto_nome)
    const categoria = chaveBusca(l.categoria_nome ?? '')
    return termos.every((t) => nome.includes(t) || categoria.includes(t))
  })
}

/**
 * Ordena.
 *
 * Nulo desce sempre para o fim, em qualquer ordem numérica. Tratá-lo como zero
 * colocaria as linhas sem resposta no meio das que têm diferença pequena — ou
 * seja, esconderia exatamente o que precisa ser visto.
 */
export function ordenarRelatorio(
  linhas: readonly LinhaDoRelatorio[],
  ordem: OrdemDoRelatorio = 'nome',
): LinhaDoRelatorio[] {
  const copia = [...linhas]
  const porNome = (a: LinhaDoRelatorio, b: LinhaDoRelatorio) =>
    a.produto_nome.localeCompare(b.produto_nome, 'pt-BR')

  if (ordem === 'nome') return copia.sort(porNome)

  const valor = (l: LinhaDoRelatorio): number | null =>
    ordem === 'diferenca'
      ? l.diferenca === null
        ? null
        : // A diferença interessa pela MAGNITUDE: −8 é tão digno de atenção
          // quanto +8, e ordenar pelo valor assinado poria as sobras no topo
          // e as faltas no rodapé, longe uma da outra.
          Math.abs(l.diferenca)
      : ordem === 'sugestao'
        ? l.sugestao
        : l.consumo

  return copia.sort((a, b) => {
    const x = valor(a)
    const y = valor(b)
    if (x === null && y === null) return porNome(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return y - x || porNome(a, b)
  })
}

/* ───────────────────────────────────────────────────────── o rodapé ────── */

export interface ResumoDoRelatorio {
  insumos: number
  precisamComprar: number
  temDeSobra: number
  /** Nem vendido nem em estoque: não há decisão a tomar sobre eles. */
  semMovimento: number
  semBase: number
  comPendencia: number
  /** Valor da compra sugerida, ao custo congelado da própria foto. */
  valorSugerido: number
  /** Soma das diferenças negativas, em dinheiro: o que falta e ninguém vendeu. */
  valorDaFalta: number
}

/**
 * O resumo que o rodapé mostra.
 *
 * `valorDaFalta` soma só as diferenças NEGATIVAS. Somar as duas direções
 * daria um número que se anula — e a sobra num item não paga a falta em outro:
 * são dois problemas diferentes, e só um deles custa dinheiro hoje.
 */
export function resumoDoRelatorio(linhas: readonly LinhaDoRelatorio[]): ResumoDoRelatorio {
  let precisamComprar = 0
  let temDeSobra = 0
  let semMovimento = 0
  let semBase = 0
  let comPendencia = 0
  let valorSugerido = 0
  let valorDaFalta = 0

  for (const l of linhas) {
    const julgado = julgarSugestao(l)
    if (julgado.veredito === 'comprar') {
      precisamComprar += 1
      valorSugerido += (julgado.quantidade ?? 0) * l.custo_unitario
    } else if (julgado.veredito === 'tem_de_sobra') temDeSobra += 1
    else if (julgado.veredito === 'sem_movimento') semMovimento += 1
    else semBase += 1

    if (l.pendencia !== null) comPendencia += 1
    if (l.diferenca !== null && l.diferenca < 0) {
      valorDaFalta += Math.abs(l.diferenca) * l.custo_unitario
    }
  }

  return {
    insumos: linhas.length,
    precisamComprar,
    temDeSobra,
    semMovimento,
    semBase,
    comPendencia,
    valorSugerido,
    valorDaFalta,
  }
}

/**
 * As categorias presentes no relatório, para o filtro.
 *
 * Saem das próprias linhas e não do cadastro: o filtro não pode oferecer uma
 * categoria que não tem linha nenhuma neste período.
 */
export function categoriasDoRelatorio(
  linhas: readonly LinhaDoRelatorio[],
): { id: string | null; nome: string; linhas: number }[] {
  const mapa = new Map<string, { id: string | null; nome: string; linhas: number }>()
  for (const l of linhas) {
    const chave = l.categoria_id ?? '\u0000sem'
    const atual = mapa.get(chave)
    if (atual) atual.linhas += 1
    else
      mapa.set(chave, {
        id: l.categoria_id,
        nome: l.categoria_nome ?? 'Sem categoria',
        linhas: 1,
      })
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
