/**
 * Lógica do painel de CMV: períodos, pendências e os pontos do gráfico.
 *
 * O módulo inteiro existe por causa de uma regra do contrato: **o sistema não
 * inventa número**. Quando falta contagem, `mv_cmv_periodo` devolve `cmv` nulo
 * e uma `pendencia` escrita em texto — e a tela precisa mostrar o período,
 * dizer o que falta e apontar o caminho, sem nunca cair no zero. Um CMV errado
 * custa mais caro que um CMV ausente.
 *
 * Sem React e sem Supabase de propósito: é o miolo que os testes exercitam.
 */
import type { CmvPeriodo, CmvSerie } from '@/tipos/banco'
import { chaveBusca } from '@/util/formato'

export type Granularidade = 'semanal' | 'mensal'

/** O mínimo que a lógica precisa: serve tanto para `CmvSerie` quanto `CmvPeriodo`. */
export interface PeriodoDeCmv {
  inicio: string
  fim: string
  estoque_inicial: number | null
  compras: number
  estoque_final: number | null
  cmv: number | null
  completo: boolean
  pendencia: string | null
}

// ───────────────────────────────────────────────────────── pendência ───────

export interface AcaoDaPendencia {
  rotulo: string
  /** Caminho interno para onde a pessoa resolve o problema. */
  caminho: string
}

export interface PendenciaExplicada {
  /** O que falta, em uma linha. */
  titulo: string
  /** Por que o número não aparece — sempre explicando, nunca só "sem dados". */
  explicacao: string
  acao: AcaoDaPendencia | null
}

/**
 * O texto de `pendencia` vem do banco sem acento (é SQL escrito em ASCII).
 * Comparar por `chaveBusca` evita depender da grafia exata e sobrevive a um
 * ajuste de redação na migração.
 */
const NENHUMA = chaveBusca('Nenhuma contagem fechada neste periodo')
const SEM_INICIAL = chaveBusca('Falta a contagem de estoque inicial')
const SEM_FINAL = chaveBusca('Falta a contagem de estoque final')

/**
 * Traduz a pendência do banco em algo acionável.
 *
 * Período completo devolve `null` — não há o que explicar. Pendência que o
 * sistema não reconhece é repassada **como veio**: preferimos um texto cru do
 * banco a uma frase inventada que esconde o motivo real.
 */
export function explicarPendencia(periodo: PeriodoDeCmv): PendenciaExplicada | null {
  if (periodo.completo) return null

  const chave = chaveBusca(periodo.pendencia ?? '')
  const abrirContagem: AcaoDaPendencia = { rotulo: 'Abrir uma contagem', caminho: '/contagem' }

  if (chave === SEM_FINAL) {
    return {
      titulo: 'Falta a contagem de estoque final',
      explicacao:
        'Sem a foto do estoque no fim do período não dá para saber quanto saiu. ' +
        'Feche uma contagem com referência dentro do período.',
      acao: abrirContagem,
    }
  }
  if (chave === SEM_INICIAL) {
    return {
      titulo: 'Falta a contagem de estoque inicial',
      explicacao:
        'Sem a foto do estoque no começo do período não há de onde partir. ' +
        'É a última contagem fechada até o primeiro dia.',
      acao: { rotulo: 'Ver o histórico de contagens', caminho: '/contagem/historico' },
    }
  }
  if (chave === NENHUMA || chave === '') {
    return {
      titulo: 'Nenhuma contagem fechada neste período',
      explicacao:
        'O CMV nasce de duas contagens fechadas: a do começo e a do fim. ' +
        'Enquanto não houver as duas, este período fica sem número.',
      acao: abrirContagem,
    }
  }

  return {
    titulo: periodo.pendencia ?? 'Período incompleto',
    explicacao: 'Enquanto a pendência acima existir, este período fica sem CMV.',
    acao: abrirContagem,
  }
}

// ───────────────────────────────────────────────────── pontos do gráfico ───

export interface PontoDeCmv {
  rotulo: string
  inicio: string
  fim: string
  completo: boolean
  /**
   * `null` quando falta contagem. O Recharts pula ponto nulo, então o período
   * continua no eixo (com o rótulo) mas sem barra — que é exatamente o que
   * queremos: o período aparece, o número não é inventado.
   */
  estoqueInicial: number | null
  compras: number
  estoqueFinal: number | null
  cmv: number | null
  pendencia: string | null
}

export function pontosDaSerie(serie: readonly CmvSerie[]): PontoDeCmv[] {
  return serie.map((linha) => ({
    rotulo: linha.rotulo,
    inicio: linha.inicio,
    fim: linha.fim,
    completo: linha.completo,
    // Estoque só existe se houve contagem; compras é soma de notas e vale zero
    // de verdade quando ninguém comprou nada no período.
    estoqueInicial: linha.completo ? linha.estoque_inicial : null,
    compras: linha.compras,
    estoqueFinal: linha.completo ? linha.estoque_final : null,
    cmv: linha.completo ? linha.cmv : null,
    pendencia: linha.pendencia,
  }))
}

export interface ResumoDaSerie {
  periodos: number
  completos: number
  incompletos: number
  /** Média dos períodos completos; null quando nenhum fechou. */
  cmvMedio: number | null
}

/** A média ignora período incompleto — somar zero baixaria a média de graça. */
export function resumirSerie(serie: readonly CmvSerie[]): ResumoDaSerie {
  const completos = serie.filter((linha) => linha.completo && linha.cmv !== null)
  const soma = completos.reduce((total, linha) => total + (linha.cmv ?? 0), 0)
  return {
    periodos: serie.length,
    completos: completos.length,
    incompletos: serie.length - completos.length,
    cmvMedio: completos.length === 0 ? null : soma / completos.length,
  }
}

/**
 * Qual período o detalhe abre sozinho.
 *
 * O mais recente **com CMV fechado**: abrir na semana corrente, que quase
 * sempre está incompleta, faria a tela nascer avisando de pendência em vez de
 * mostrar o número que a pessoa veio ver. Não havendo nenhum completo, o mais
 * recente mesmo — com a pendência à mostra, porque aí é essa a notícia.
 */
export function periodoSugerido(serie: readonly CmvSerie[]): CmvSerie | null {
  if (serie.length === 0) return null
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    const linha = serie[i]
    if (linha?.completo) return linha
  }
  return serie[serie.length - 1] ?? null
}

// ─────────────────────────────────────────────── abertura por categoria ────

export interface CategoriaDeCmv {
  /** Nulo no balde "Sem categoria" — produto cuja categoria foi apagada. */
  categoria_id: string | null
  categoria_nome: string
  categoria_cor: string
  /** `false` para categoria arquivada que ainda tem movimento no período. */
  categoria_ativa: boolean
  /** Nulo quando não há contagem de abertura no período. */
  estoque_inicial: number | null
  compras: number
  /** Nulo quando não há contagem de fechamento no período. */
  estoque_final: number | null
  /** Nulo quando falta qualquer uma das duas contagens. */
  cmv: number | null
}

export interface LinhaDeCategoria extends CategoriaDeCmv {
  /** Fatia do CMV total do período, de 0 a 100. Nula quando não há CMV. */
  participacao: number | null
  /** Largura da barra na tabela, de 0 a 100, relativa ao maior CMV. */
  proporcao: number
}

/**
 * Ordena as categorias por CMV e calcula participação e barra.
 *
 * Categoria com CMV zero ou negativo continua na lista: CMV negativo quer
 * dizer que o estoque cresceu mais do que se consumiu (compra grande no fim do
 * mês, ou item contado a mais) e é justamente o que alguém precisa ver.
 * `participacao` usa a soma dos positivos como base — misturar negativo no
 * denominador devolveria porcentagens acima de 100.
 *
 * CMV nulo é outra coisa: o período não tem as duas contagens e o número não
 * existe. Essa categoria vai para o fim da lista, sem fatia e sem barra. Tratar
 * nulo como zero a colocaria entre as que menos consumiram, que é uma
 * afirmação — e uma afirmação que ninguém fez.
 */
export function ordenarCategorias(categorias: readonly CategoriaDeCmv[]): LinhaDeCategoria[] {
  const base = categorias.reduce((total, c) => total + Math.max(c.cmv ?? 0, 0), 0)
  const maior = categorias.reduce((maximo, c) => Math.max(maximo, Math.abs(c.cmv ?? 0)), 0)

  return [...categorias]
    .sort((a, b) => {
      if (a.cmv === null && b.cmv === null) return a.categoria_nome.localeCompare(b.categoria_nome)
      if (a.cmv === null) return 1
      if (b.cmv === null) return -1
      return b.cmv - a.cmv
    })
    .map((categoria) => ({
      ...categoria,
      // Nulo so quando o CMV nao existe. Base zero (ninguem consumiu nada no
      // periodo) continua dando 0%: ali o numero existe e e zero mesmo.
      participacao:
        categoria.cmv === null ? null : base === 0 ? 0 : (Math.max(categoria.cmv, 0) / base) * 100,
      proporcao:
        categoria.cmv === null || maior === 0 ? 0 : (Math.abs(categoria.cmv) / maior) * 100,
    }))
}

// ────────────────────────────────────────────────────────── conferência ────

/**
 * Confere a identidade `CMV = Estoque Inicial + Compras − Estoque Final`.
 *
 * A conta vem pronta do banco; esta função existe para a tela poder dizer
 * "confere" ao lado dos três números. Tolerância de um centavo porque o banco
 * arredonda o CMV em 4 casas e os componentes vêm em 4 casas também.
 */
export function conferirFormula(periodo: CmvPeriodo, tolerancia = 0.01): boolean {
  if (!periodo.completo || periodo.cmv === null) return false
  const esperado =
    (periodo.estoque_inicial ?? 0) + periodo.compras - (periodo.estoque_final ?? 0)
  return Math.abs(esperado - periodo.cmv) <= tolerancia
}
