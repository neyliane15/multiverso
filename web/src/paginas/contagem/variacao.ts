/**
 * Variação de uma contagem contra a anterior **do mesmo tipo**.
 *
 * Comparar a mensal de agosto com a semanal da última segunda não diz nada: as
 * duas fotos cobrem coisas diferentes. Por isso a base é sempre a contagem
 * anterior do mesmo tipo, e contagem cancelada nunca serve de base.
 */

export interface ContagemComparavel {
  id: string
  referencia: string
  tipo: string
  status: string
  total: number
}

export interface Variacao {
  /** Contra quem foi comparada. Null quando é a primeira daquele tipo. */
  anteriorId: string | null
  anteriorReferencia: string | null
  anteriorTotal: number | null
  /** Diferença em reais. Null quando não há base. */
  valor: number | null
  /** Diferença percentual. Null sem base, e também quando a base era zero. */
  percentual: number | null
}

/** Acima disto a variação deixa de ser rotina e vira coisa para conferir. */
export const VARIACAO_NOTAVEL = 15

export type TomDaVariacao = 'neutro' | 'alerta'

/**
 * A cor diz **magnitude**, não direção.
 *
 * Estoque que sobe não é bom nem ruim por si — depende de compra, de virada de
 * mês, de reposição. O que sempre merece um olhar é o salto: variação grande
 * contra a foto anterior costuma ser item esquecido, unidade trocada ou preço
 * que mudou. O sinal (+/−) e a seta continuam dizendo a direção; a cor fica
 * reservada para o que pede conferência.
 */
export function tomDaVariacao(variacao: Variacao): TomDaVariacao {
  if (variacao.percentual === null) return 'neutro'
  return Math.abs(variacao.percentual) >= VARIACAO_NOTAVEL ? 'alerta' : 'neutro'
}

const SEM_BASE: Variacao = {
  anteriorId: null,
  anteriorReferencia: null,
  anteriorTotal: null,
  valor: null,
  percentual: null,
}

/**
 * Para cada contagem, a variação contra a anterior do mesmo tipo.
 *
 * A ordem de entrada não importa: a função ordena por referência antes de
 * comparar. Empate de referência no mesmo tipo (só acontece com uma cancelada
 * no meio) é resolvido pelo id, para o resultado ser sempre o mesmo.
 */
export function variacoesPorContagem(
  contagens: readonly ContagemComparavel[],
): Map<string, Variacao> {
  const mapa = new Map<string, Variacao>()
  const porTipo = new Map<string, ContagemComparavel[]>()

  for (const contagem of contagens) {
    mapa.set(contagem.id, SEM_BASE)
    if (contagem.status === 'cancelada') continue
    const lista = porTipo.get(contagem.tipo)
    if (lista) lista.push(contagem)
    else porTipo.set(contagem.tipo, [contagem])
  }

  for (const lista of porTipo.values()) {
    const ordenadas = [...lista].sort(
      (a, b) => a.referencia.localeCompare(b.referencia) || a.id.localeCompare(b.id),
    )
    for (let i = 1; i < ordenadas.length; i += 1) {
      const atual = ordenadas[i]
      const anterior = ordenadas[i - 1]
      if (!atual || !anterior) continue
      const valor = atual.total - anterior.total
      mapa.set(atual.id, {
        anteriorId: anterior.id,
        anteriorReferencia: anterior.referencia,
        anteriorTotal: anterior.total,
        valor,
        // Base zero não tem percentual: "infinito por cento" não informa nada.
        percentual: anterior.total === 0 ? null : (valor / anterior.total) * 100,
      })
    }
  }

  return mapa
}
