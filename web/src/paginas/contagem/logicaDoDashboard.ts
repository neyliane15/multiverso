/**
 * Lógica do dashboard da contagem: a leitura de UMA foto do estoque.
 *
 * A folha de contagem tem uma linha por produto **por setor** — a picanha
 * aparece na cozinha e no bar, com custo diferente em cada um. O dashboard
 * responde perguntas sobre o produto, não sobre a parada: "quanto vale a
 * farinha nesta casa" é uma pergunta só, mesmo que ela esteja em três
 * geladeiras. Então a primeira coisa que este arquivo faz é consolidar.
 *
 * E é aí que mora a decisão que vale o comentário: **dinheiro sempre soma,
 * quantidade não sempre**. `total` é dinheiro e se soma entre setores sem
 * nenhuma dúvida. `quantidade` só se soma quando as paradas usaram a MESMA
 * unidade; contar a cerveja por CX no depósito e por UND no bar e somar 3 + 24
 * daria 27 de coisa nenhuma. Quando as unidades divergem, a quantidade volta
 * **nula** e a tela diz "unidades diferentes" — a mesma regra que a ficha
 * técnica já aplica em `mv_fator_para_produto`, e pelo mesmo motivo: número
 * errado é pior que número ausente.
 *
 * Nada aqui importa React ou Supabase, de propósito — é o miolo que os testes
 * exercitam sem montar tela nem subir banco.
 */
import { chaveBusca } from '@/util/formato'

/** O mínimo que a lógica precisa de `contagem_itens` (+ o nome do produto). */
export interface ItemLido {
  produto_id: string
  setor_id: string
  estoque_id?: string | null
  quantidade: number
  unidade: string
  custo_unitario: number
  total: number
  produto: { nome: string; categoria_id: string | null } | null
}

export interface CategoriaLida {
  id: string
  nome: string
  cor: string
}

/** Um produto da foto, com as paradas já somadas. */
export interface ProdutoContado {
  produtoId: string
  nome: string
  categoriaId: string | null
  categoriaNome: string
  categoriaCor: string | null
  /** Nula quando as paradas lançaram o produto em unidades diferentes. */
  quantidade: number | null
  /** Nula no mesmo caso: sem unidade comum, não há unidade a mostrar. */
  unidade: string | null
  /** Dinheiro soma sempre: é a coluna em que a tela pode confiar cegamente. */
  total: number
  /**
   * Valor unitário. Com quantidade, é o médio ponderado (total ÷ quantidade),
   * que é o número verdadeiro quando o mesmo produto tem custo diferente por
   * setor. Sem quantidade — item zerado, ou unidades divergentes — é o custo
   * que a própria foto congelou, para que a coluna não fique vazia justo no
   * item que alguém está conferindo.
   */
  valorUnitario: number
  /** Zerado é quantidade zero em TODAS as paradas. */
  zerado: boolean
  /** Quantas paradas da folha lançaram este produto. */
  paradas: number
}

const SEM_CATEGORIA = 'Sem categoria'

/**
 * Consolida a folha por produto.
 *
 * A ordem de saída é alfabética por nome, em pt-BR: é a ordem em que a tabela
 * completa nasce, antes de qualquer atalho de ordenação.
 */
export function agruparPorProduto(
  itens: readonly ItemLido[],
  categorias: readonly CategoriaLida[],
): ProdutoContado[] {
  const porCategoria = new Map(categorias.map((c) => [c.id, c]))
  const acumulado = new Map<
    string,
    {
      nome: string
      categoriaId: string | null
      quantidade: number
      unidades: Set<string>
      total: number
      custoMaximo: number
      paradas: number
      zerado: boolean
    }
  >()

  for (const item of itens) {
    const atual = acumulado.get(item.produto_id)
    if (atual) {
      atual.quantidade += item.quantidade
      atual.unidades.add(item.unidade)
      atual.total += item.total
      atual.custoMaximo = Math.max(atual.custoMaximo, item.custo_unitario)
      atual.paradas += 1
      atual.zerado = atual.zerado && item.quantidade === 0
    } else {
      acumulado.set(item.produto_id, {
        nome: item.produto?.nome ?? 'Insumo sem nome',
        categoriaId: item.produto?.categoria_id ?? null,
        quantidade: item.quantidade,
        unidades: new Set([item.unidade]),
        total: item.total,
        custoMaximo: item.custo_unitario,
        paradas: 1,
        zerado: item.quantidade === 0,
      })
    }
  }

  const linhas: ProdutoContado[] = []
  for (const [produtoId, a] of acumulado) {
    const umaUnidade = a.unidades.size === 1
    const quantidade = umaUnidade ? a.quantidade : null
    const categoria = a.categoriaId === null ? undefined : porCategoria.get(a.categoriaId)
    linhas.push({
      produtoId,
      nome: a.nome,
      categoriaId: a.categoriaId,
      // Categoria arquivada continua tendo item na foto, então continua
      // aparecendo — escondê-la faria o total das barras não fechar com o KPI.
      categoriaNome: categoria?.nome ?? (a.categoriaId === null ? SEM_CATEGORIA : 'Outra categoria'),
      categoriaCor: categoria?.cor ?? null,
      quantidade,
      unidade: umaUnidade ? [...a.unidades][0]! : null,
      total: a.total,
      valorUnitario:
        quantidade !== null && quantidade > 0 ? a.total / quantidade : a.custoMaximo,
      zerado: a.zerado,
      paradas: a.paradas,
    })
  }
  return linhas.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
}

/* ─────────────────────────────────────────────────────────────── os KPIs ── */

export interface FatiaDeCategoria {
  categoriaId: string | null
  nome: string
  cor: string | null
  valor: number
  /** Fatia do valor total, em percentual. */
  participacao: number
  /** Largura da barra: relativa à MAIOR categoria, não ao total. */
  proporcao: number
  itens: number
  zerados: number
}

export interface KpisDaContagem {
  valorTotal: number
  itensContados: number
  categorias: number
  abas: number
  zerados: number
  /** Percentual de zerados sobre o total de itens da folha. */
  percentualZerados: number
  maiorCategoria: FatiaDeCategoria | null
}

/**
 * Os quatro números da faixa de cima.
 *
 * `itensContados` é o número de PRODUTOS na folha, não de linhas: a picanha em
 * três setores é um insumo contado, e dizer "3" aqui faria o cartão discordar
 * da tabela logo abaixo, que é consolidada.
 */
export function kpisDaContagem(
  produtos: readonly ProdutoContado[],
  abas: number,
): KpisDaContagem {
  const fatias = valorPorCategoria(produtos)
  const valorTotal = produtos.reduce((soma, p) => soma + p.total, 0)
  const zerados = produtos.filter((p) => p.zerado).length
  return {
    valorTotal,
    itensContados: produtos.length,
    categorias: fatias.length,
    abas,
    zerados,
    percentualZerados: produtos.length === 0 ? 0 : (zerados / produtos.length) * 100,
    maiorCategoria: fatias[0] ?? null,
  }
}

/**
 * Valor em estoque por categoria, da maior para a menor.
 *
 * A barra é desenhada contra a MAIOR categoria (`proporcao`), e não contra o
 * total: com dezessete categorias, a maior ficaria em 30% da largura e as
 * últimas em meio pixel. `participacao` continua sendo a fatia do total, que
 * é o número que a tela escreve ao lado.
 */
export function valorPorCategoria(produtos: readonly ProdutoContado[]): FatiaDeCategoria[] {
  const acumulado = new Map<
    string,
    { categoriaId: string | null; nome: string; cor: string | null; valor: number; itens: number; zerados: number }
  >()
  for (const p of produtos) {
    const chave = p.categoriaId ?? '\u0000sem'
    const atual = acumulado.get(chave)
    if (atual) {
      atual.valor += p.total
      atual.itens += 1
      if (p.zerado) atual.zerados += 1
    } else {
      acumulado.set(chave, {
        categoriaId: p.categoriaId,
        nome: p.categoriaNome,
        cor: p.categoriaCor,
        valor: p.total,
        itens: 1,
        zerados: p.zerado ? 1 : 0,
      })
    }
  }

  const lista = [...acumulado.values()].sort(
    (x, y) => y.valor - x.valor || x.nome.localeCompare(y.nome, 'pt-BR'),
  )
  const total = lista.reduce((soma, c) => soma + c.valor, 0)
  const maior = lista[0]?.valor ?? 0

  return lista.map((c) => ({
    ...c,
    participacao: total === 0 ? 0 : (c.valor / total) * 100,
    proporcao: maior === 0 ? 0 : (c.valor / maior) * 100,
  }))
}

/**
 * Onde está o capital parado: os insumos de maior valor em estoque.
 *
 * Item zerado nunca entra, por construção — ele vale zero, e a pergunta aqui é
 * sobre dinheiro que está dormindo na prateleira.
 */
export function capitalParado(
  produtos: readonly ProdutoContado[],
  limite = 10,
): ProdutoContado[] {
  return [...produtos]
    .filter((p) => p.total > 0)
    .sort((x, y) => y.total - x.total || x.nome.localeCompare(y.nome, 'pt-BR'))
    .slice(0, limite)
}

export interface ZeradosDaCategoria {
  categoriaId: string | null
  nome: string
  cor: string | null
  zerados: number
  itens: number
  /** Percentual da própria categoria que está zerada. */
  percentual: number
}

/**
 * Onde estão os zerados.
 *
 * Ordenado pela QUANTIDADE de zerados, e não pelo percentual: uma categoria de
 * dois itens com os dois zerados dá 100% e não é notícia; vinte zerados numa
 * categoria de trinta é a reposição da semana.
 */
export function zeradosPorCategoria(produtos: readonly ProdutoContado[]): ZeradosDaCategoria[] {
  return valorPorCategoria(produtos)
    .filter((c) => c.zerados > 0)
    .map((c) => ({
      categoriaId: c.categoriaId,
      nome: c.nome,
      cor: c.cor,
      zerados: c.zerados,
      itens: c.itens,
      percentual: c.itens === 0 ? 0 : (c.zerados / c.itens) * 100,
    }))
    .sort((x, y) => y.zerados - x.zerados || x.nome.localeCompare(y.nome, 'pt-BR'))
}

/**
 * A frase do destaque: onde concentrar a reposição.
 *
 * Nula quando não há zerado nenhum — faixa de alerta sem alerta é ruído, e
 * ensina a ignorar a próxima.
 */
export function alertaDeReposicao(zerados: readonly ZeradosDaCategoria[]): string | null {
  if (zerados.length === 0) return null
  const total = zerados.reduce((soma, c) => soma + c.zerados, 0)
  const tres = zerados.slice(0, 3)
  const nomes = tres.map((c) => `${c.nome} (${c.zerados})`)
  const resto = zerados.length - tres.length
  const lista =
    nomes.length === 1
      ? nomes[0]!
      : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]!}`
  return (
    `${total} ${total === 1 ? 'insumo zerado' : 'insumos zerados'}, concentrados em ${lista}` +
    (resto > 0 ? `, e mais ${resto} ${resto === 1 ? 'categoria' : 'categorias'}.` : '.')
  )
}

/* ──────────────────────────────────────────────── a tabela completa ────── */

export type OrdemDaTabela = 'valor' | 'estoque' | 'nome'

export interface FiltroDaTabela {
  busca?: string
  categoriaId?: string | null
  soZerados?: boolean
  ordem?: OrdemDaTabela
}

/**
 * Busca, filtro, zerados e ordenação — numa passada.
 *
 * A busca é a mesma do resto do sistema (`chaveBusca`): sem acento, por
 * pedaço, exigindo todos os termos em qualquer ordem. "cerv pils" acha
 * "CERVEJA PILSEN".
 */
export function filtrarEOrdenar(
  produtos: readonly ProdutoContado[],
  filtro: FiltroDaTabela = {},
): ProdutoContado[] {
  const alvo = chaveBusca(filtro.busca ?? '')
  const termos = alvo === '' ? [] : alvo.split(' ')

  const filtrados = produtos.filter((p) => {
    if (filtro.soZerados && !p.zerado) return false
    if (filtro.categoriaId != null && p.categoriaId !== filtro.categoriaId) return false
    if (termos.length === 0) return true
    const nome = chaveBusca(p.nome)
    const categoria = chaveBusca(p.categoriaNome)
    return termos.every((t) => nome.includes(t) || categoria.includes(t))
  })

  const ordem = filtro.ordem ?? 'valor'
  return filtrados.sort((x, y) => {
    if (ordem === 'nome') return x.nome.localeCompare(y.nome, 'pt-BR')
    if (ordem === 'estoque') {
      // Quantidade nula (unidades divergentes) desce para o fim em vez de
      // virar zero: ela não é "pouco estoque", é estoque não comparável.
      const a = x.quantidade ?? -1
      const b = y.quantidade ?? -1
      return b - a || x.nome.localeCompare(y.nome, 'pt-BR')
    }
    return y.total - x.total || x.nome.localeCompare(y.nome, 'pt-BR')
  })
}

export interface Pagina<T> {
  linhas: T[]
  /** Página em vigor, já corrigida quando a pedida não existe mais. */
  pagina: number
  paginas: number
  /** Posição da primeira e da última linha, em base 1, para o rótulo. */
  de: number
  ate: number
  total: number
}

/**
 * Pagina uma lista já filtrada.
 *
 * A página pedida é **corrigida** em vez de respeitada: quem está na página 7
 * e digita uma busca que deixa três linhas tem de ver as três linhas, não uma
 * tabela vazia com "página 7 de 1". Esse era o defeito mais comum de paginação
 * caseira, e ele se resolve aqui, uma vez.
 */
export function paginar<T>(lista: readonly T[], pagina: number, porPagina = 25): Pagina<T> {
  const total = lista.length
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const emVigor = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas)
  const inicio = (emVigor - 1) * porPagina
  const linhas = lista.slice(inicio, inicio + porPagina) as T[]
  return {
    linhas,
    pagina: emVigor,
    paginas,
    de: total === 0 ? 0 : inicio + 1,
    ate: inicio + linhas.length,
    total,
  }
}
