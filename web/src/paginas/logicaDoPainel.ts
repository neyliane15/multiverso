/**
 * A aritmética do painel de início e do panorama da rede.
 *
 * Está fora das telas porque decide coisa que muda comportamento: quando uma
 * contagem "está velha", quando um restaurante virou sinal de abandono, e o
 * que entra na conta das compras do mês. São regras de negócio disfarçadas de
 * número na tela — merecem teste, não conferência no olho.
 *
 * Nada aqui estima: quando falta dado, a função devolve `null` e a tela
 * escreve a pendência. É a mesma promessa que `mv_cmv_periodo` faz no banco.
 */

/* ========================================================================== */
/* Datas                                                                      */
/* ========================================================================== */

/**
 * 'YYYY-MM-DD' do dia local. Data de referência de contagem é dia de
 * calendário, não instante: usar toISOString() jogaria a virada do dia para
 * UTC e, no Brasil, mudaria o dia inteiro depois das 21h.
 */
export function dataIso(agora: Date = new Date()): string {
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Primeiro dia do mês da data dada, em ISO. */
export function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

const MS_DIA = 86_400_000

/** Dias inteiros de `de` até `ate`. Negativo quando `ate` é anterior. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / MS_DIA)
}

/* ========================================================================== */
/* Idade da última contagem                                                   */
/* ========================================================================== */

/**
 * Quantos dias de atraso já contam como problema.
 *
 * O primeiro cliente conta semanalmente. Duas semanas sem fechar contagem
 * ainda é uma semana atropelada; um mês sem fechar significa que o CMV do
 * período não vai fechar, porque falta o estoque final.
 */
export const DIAS_ATENCAO = 14
export const DIAS_CRITICO = 30

export type EstadoDaContagem = 'nunca' | 'em-dia' | 'atrasada' | 'muito-atrasada'

export interface IdadeDaContagem {
  estado: EstadoDaContagem
  /** Dias desde a última contagem fechada, ou null se nunca houve uma. */
  dias: number | null
  mensagem: string
}

export function avaliarUltimaContagem(
  ultimaFechada: string | null | undefined,
  hoje: string,
): IdadeDaContagem {
  if (!ultimaFechada) {
    return {
      estado: 'nunca',
      dias: null,
      mensagem:
        'Nenhuma contagem fechada ainda. Sem a primeira foto do estoque, o CMV não tem de onde partir.',
    }
  }
  const dias = Math.max(0, diasEntre(ultimaFechada, hoje))
  if (dias > DIAS_CRITICO) {
    return {
      estado: 'muito-atrasada',
      dias,
      mensagem: `A última contagem fechada tem ${dias} dias. O CMV do período corrente vai ficar sem estoque final.`,
    }
  }
  if (dias > DIAS_ATENCAO) {
    return {
      estado: 'atrasada',
      dias,
      mensagem: `Faz ${dias} dias desde a última contagem fechada. Vale abrir a próxima.`,
    }
  }
  return {
    estado: 'em-dia',
    dias,
    mensagem:
      dias === 0
        ? 'A última contagem foi fechada hoje.'
        : `Última contagem fechada há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
  }
}

/* ========================================================================== */
/* Progresso de uma contagem aberta                                           */
/* ========================================================================== */

/** Porcentagem preenchida, 0 a 100. Folha sem itens é 0, nunca 100. */
export function progressoDaContagem(preenchidos: number, total: number): number {
  if (total <= 0) return 0
  const bruto = (preenchidos / total) * 100
  return Math.max(0, Math.min(100, Math.round(bruto)))
}

/* ========================================================================== */
/* Compras do período                                                         */
/* ========================================================================== */

export interface CompraDoPainel {
  emitida_em: string
  valor_total: number
  itens_pendentes: number
  status: string
}

export interface ResumoDeCompras {
  notas: number
  total: number
  /** Notas com pelo menos um item sem produto vinculado. */
  notasPendentes: number
  itensPendentes: number
}

/**
 * Soma o que entrou no intervalo. Nota cancelada fica de fora — ela não é
 * compra, é papel rasgado —, mas nota apenas importada entra: o dinheiro saiu
 * mesmo que o de-para ainda não tenha sido feito.
 */
export function resumirCompras(
  compras: readonly CompraDoPainel[],
  inicio: string,
  fim: string,
): ResumoDeCompras {
  let notas = 0
  let total = 0
  let notasPendentes = 0
  let itensPendentes = 0

  for (const c of compras) {
    if (c.status === 'cancelada') continue
    const dia = c.emitida_em.slice(0, 10)
    if (dia < inicio || dia > fim) continue
    notas += 1
    total += c.valor_total
    if (c.itens_pendentes > 0) {
      notasPendentes += 1
      itensPendentes += c.itens_pendentes
    }
  }
  return { notas, total, notasPendentes, itensPendentes }
}

/* ========================================================================== */
/* Panorama da rede                                                           */
/* ========================================================================== */

export interface RestauranteDoPanorama {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
  ultima_contagem: string | null
  ultimo_acesso: string | null
  valor_estoque: number | null
}

export type NivelDeRisco = 'inativo' | 'novo' | 'ok' | 'atencao' | 'critico'

export interface RiscoDeAbandono {
  nivel: NivelDeRisco
  /** Dias desde a última contagem fechada, ou null quando nunca houve uma. */
  dias: number | null
  motivo: string
}

/**
 * Cliente que parou de contar é cliente saindo. Esta é a leitura que o master
 * abre a tela para fazer, então ela é explícita — e um restaurante recém
 * cadastrado não é marcado como problema só por ainda não ter contado.
 */
export function avaliarRisco(r: RestauranteDoPanorama, hoje: string): RiscoDeAbandono {
  if (!r.ativo) {
    return { nivel: 'inativo', dias: null, motivo: 'Restaurante desativado.' }
  }
  if (!r.ultima_contagem) {
    const idade = Math.max(0, diasEntre(r.criado_em.slice(0, 10), hoje))
    if (idade <= DIAS_ATENCAO) {
      return {
        nivel: 'novo',
        dias: null,
        motivo: `Cadastrado há ${idade} ${idade === 1 ? 'dia' : 'dias'}, ainda sem a primeira contagem.`,
      }
    }
    return {
      nivel: 'critico',
      dias: null,
      motivo: `Cadastrado há ${idade} dias e nunca fechou uma contagem.`,
    }
  }
  const dias = Math.max(0, diasEntre(r.ultima_contagem, hoje))
  if (dias > DIAS_CRITICO) {
    return { nivel: 'critico', dias, motivo: `Sem contar há ${dias} dias.` }
  }
  if (dias > DIAS_ATENCAO) {
    return { nivel: 'atencao', dias, motivo: `Sem contar há ${dias} dias.` }
  }
  return { nivel: 'ok', dias, motivo: `Contou há ${dias} ${dias === 1 ? 'dia' : 'dias'}.` }
}

export type CriterioDoPanorama = 'risco' | 'nome' | 'estoque'

const PESO: Record<NivelDeRisco, number> = {
  critico: 0,
  atencao: 1,
  novo: 2,
  ok: 3,
  inativo: 4,
}

/**
 * Por padrão a lista sobe pelo risco: quem está sumindo aparece primeiro, sem
 * o master precisar procurar. Dentro do mesmo nível, o mais parado na frente.
 */
export function ordenarPanorama<T extends RestauranteDoPanorama>(
  lista: readonly T[],
  criterio: CriterioDoPanorama,
  hoje: string,
): T[] {
  const copia = [...lista]
  if (criterio === 'nome') {
    return copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
  if (criterio === 'estoque') {
    return copia.sort((a, b) => (b.valor_estoque ?? -1) - (a.valor_estoque ?? -1))
  }
  return copia.sort((a, b) => {
    const ra = avaliarRisco(a, hoje)
    const rb = avaliarRisco(b, hoje)
    const p = PESO[ra.nivel] - PESO[rb.nivel]
    if (p !== 0) return p
    const da = ra.dias ?? Number.MAX_SAFE_INTEGER
    const db = rb.dias ?? Number.MAX_SAFE_INTEGER
    if (da !== db) return db - da
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}
