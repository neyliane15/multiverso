/**
 * De-para entre o item da nota e o produto cadastrado.
 *
 * A cascata vai do sinal mais confiável (um humano já disse que essa descrição
 * é esse produto) ao mais frágil (as descrições se parecem). Só os degraus de
 * cima vinculam sozinhos; o resto vira sugestão para alguém confirmar.
 *
 * Por que tanto cuidado: item casado errado entra no custo médio do produto
 * errado, e o CMV do mês sai errado sem ninguém perceber. Ficar pendente é um
 * incômodo de dois cliques; ficar errado é um número falso no dashboard.
 */

import { chaveBusca } from '../../util/formato'

// --------------------------------------------------------------- tipos ----

export interface ProdutoCandidato {
  id: string
  nome: string
  codigo?: string | null
  codigo_barras?: string | null
  unidade?: string | null
}

/** Linha de `produto_apelidos` — o aprendizado dos vínculos já feitos à mão. */
export interface ApelidoConhecido {
  produto_id: string
  fornecedor_id?: string | null
  apelido: string
  codigo_fornecedor?: string | null
  fator_conversao?: number | null
  unidade?: string | null
}

export interface ItemParaCasar {
  descricao: string
  ean?: string | null
  codigoFornecedor?: string | null
}

export interface ContextoCasamento {
  produtos: ProdutoCandidato[]
  apelidos?: ApelidoConhecido[]
  /** Fornecedor da nota: apelido do mesmo fornecedor vale mais. */
  fornecedorId?: string | null
  /** Padrão: CONFIANCA_MINIMA. Serve para afrouxar/apertar em teste ou tela. */
  confiancaMinima?: number
}

export type MotivoCasamento =
  | 'apelido_fornecedor'
  | 'apelido_geral'
  | 'ean'
  | 'codigo_fornecedor'
  | 'similaridade'
  | 'ambiguo'
  | 'sem_correspondencia'

export interface SugestaoProduto {
  produtoId: string
  nome: string
  confianca: number
}

export interface Casamento {
  /** Preenchido **só** quando dá para vincular sozinho, sem humano. */
  produtoId: string | null
  confianca: number
  motivo: MotivoCasamento
  /** Mesma informação do motivo, em português, pronta para a tela. */
  explicacao: string
  automatico: boolean
  /** Fator que o apelido já ensinou, quando houver. */
  fatorSugerido: number | null
  unidadeSugerida: string | null
  /** Melhores palpites para o humano escolher, do mais parecido ao menos. */
  sugestoes: SugestaoProduto[]
}

/** Abaixo disto ninguém vincula sozinho: o humano confirma. */
export const CONFIANCA_MINIMA = 0.72

const CONFIANCA_APELIDO_FORNECEDOR = 0.99
const CONFIANCA_APELIDO_GERAL = 0.95
const CONFIANCA_EAN = 0.93
const CONFIANCA_CODIGO = 0.85

/** Duas opções separadas por menos que isto são um empate: ninguém decide sozinho. */
const EMPATE = 0.02

// -------------------------------------------------------- similaridade ----

/** Palavras que não distinguem produto nenhum. */
const RUIDO = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'C', 'P', 'PARA', 'EM', 'A', 'O', 'TIPO'])

function tokens(texto: string): Set<string> {
  return new Set(
    chaveBusca(texto)
      .split(' ')
      .filter((palavra) => palavra !== '' && !RUIDO.has(palavra)),
  )
}

function prefixoComum(a: string, b: string): number {
  const limite = Math.min(a.length, b.length)
  let i = 0
  while (i < limite && a[i] === b[i]) i += 1
  return i
}

/**
 * Similaridade 0..1 entre duas descrições.
 *
 * Jaccard sobre as palavras (ordem não importa: "FILE MIGNON BOV" e
 * "MIGNON BOVINO FILE" são o mesmo bicho) com bônus de prefixo comum, que é o
 * que separa "COCA COLA 2L" de "COCA COLA 600ML" — as duas dividem palavras,
 * mas a nota costuma começar igual quando é o mesmo item.
 *
 * Medidas (2L, 600ML, 1KG) contam como palavra de propósito: apagá-las faria
 * embalagens diferentes do mesmo produto marcarem 100%.
 */
export function similaridadeTexto(a: string, b: string): number {
  const normalA = chaveBusca(a)
  const normalB = chaveBusca(b)
  if (normalA === '' || normalB === '') return 0
  if (normalA === normalB) return 1

  const tokensA = tokens(a)
  const tokensB = tokens(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersecao = 0
  for (const palavra of tokensA) if (tokensB.has(palavra)) intersecao += 1
  const uniao = tokensA.size + tokensB.size - intersecao
  const jaccard = uniao === 0 ? 0 : intersecao / uniao

  const prefixo = prefixoComum(normalA, normalB) / Math.min(normalA.length, normalB.length)

  const score = 0.75 * jaccard + 0.25 * prefixo
  return Math.round(Math.min(1, Math.max(0, score)) * 10_000) / 10_000
}

// ------------------------------------------------------------ auxiliares --

/**
 * GTIN comparável: só dígitos e sem zero à esquerda, porque o mesmo produto
 * aparece como EAN-13 na nota e GTIN-14 (com um zero na frente) no cadastro.
 */
function normalizarEan(valor: string | null | undefined): string {
  if (!valor) return ''
  const digitos = valor.replace(/\D/g, '')
  return digitos.replace(/^0+(?=\d)/, '')
}

function normalizarCodigo(valor: string | null | undefined): string {
  if (!valor) return ''
  return chaveBusca(valor).replace(/\s+/g, '')
}

function melhoresSugestoes(descricao: string, produtos: ProdutoCandidato[], quantas = 3): SugestaoProduto[] {
  return produtos
    .map((produto) => ({
      produtoId: produto.id,
      nome: produto.nome,
      confianca: similaridadeTexto(descricao, produto.nome),
    }))
    .filter((sugestao) => sugestao.confianca > 0)
    .sort((a, b) => b.confianca - a.confianca)
    .slice(0, quantas)
}

function resultado(parcial: Partial<Casamento> & Pick<Casamento, 'motivo' | 'explicacao' | 'confianca'>): Casamento {
  return {
    produtoId: parcial.produtoId ?? null,
    confianca: parcial.confianca,
    motivo: parcial.motivo,
    explicacao: parcial.explicacao,
    automatico: parcial.produtoId != null,
    fatorSugerido: parcial.fatorSugerido ?? null,
    unidadeSugerida: parcial.unidadeSugerida ?? null,
    sugestoes: parcial.sugestoes ?? [],
  }
}

// --------------------------------------------------------------- cascata --

export function casarItem(item: ItemParaCasar, contexto: ContextoCasamento): Casamento {
  const produtos = contexto.produtos ?? []
  const apelidos = contexto.apelidos ?? []
  const limiar = contexto.confiancaMinima ?? CONFIANCA_MINIMA
  const sugestoes = melhoresSugestoes(item.descricao, produtos)
  const descricaoNormal = chaveBusca(item.descricao)

  // 1 e 2. Apelido: alguém já disse, à mão, que essa descrição é esse produto.
  const apelidosIguais = apelidos.filter((a) => chaveBusca(a.apelido) === descricaoNormal)
  const doFornecedor = contexto.fornecedorId
    ? apelidosIguais.find((a) => a.fornecedor_id === contexto.fornecedorId)
    : undefined
  const apelido = doFornecedor ?? apelidosIguais[0]

  if (apelido) {
    const mesmoFornecedor = apelido === doFornecedor
    return resultado({
      produtoId: apelido.produto_id,
      confianca: mesmoFornecedor ? CONFIANCA_APELIDO_FORNECEDOR : CONFIANCA_APELIDO_GERAL,
      motivo: mesmoFornecedor ? 'apelido_fornecedor' : 'apelido_geral',
      explicacao: mesmoFornecedor
        ? 'Esta descrição já foi vinculada a este produto neste fornecedor.'
        : 'Esta descrição já foi vinculada a este produto em outro fornecedor.',
      fatorSugerido: apelido.fator_conversao ?? null,
      unidadeSugerida: apelido.unidade ?? null,
      sugestoes,
    })
  }

  // 3. EAN: código de barras é identidade, desde que só um produto o use.
  const ean = normalizarEan(item.ean)
  if (ean !== '') {
    const porEan = produtos.filter((p) => normalizarEan(p.codigo_barras) === ean)
    const escolhido = porEan[0]
    if (porEan.length === 1 && escolhido) {
      return resultado({
        produtoId: escolhido.id,
        confianca: CONFIANCA_EAN,
        motivo: 'ean',
        explicacao: `Código de barras ${item.ean} confere com o cadastro.`,
        unidadeSugerida: escolhido.unidade ?? null,
        sugestoes,
      })
    }
    if (porEan.length > 1) {
      return resultado({
        confianca: 0.5,
        motivo: 'ambiguo',
        explicacao: `${porEan.length} produtos usam o código de barras ${item.ean}: escolha qual é.`,
        sugestoes: porEan.slice(0, 3).map((p) => ({ produtoId: p.id, nome: p.nome, confianca: 0.5 })),
      })
    }
  }

  // 4. Código do fornecedor batendo com o código interno do produto.
  const codigo = normalizarCodigo(item.codigoFornecedor)
  if (codigo !== '') {
    const porCodigo = produtos.filter((p) => normalizarCodigo(p.codigo) === codigo)
    const escolhido = porCodigo[0]
    if (porCodigo.length === 1 && escolhido) {
      return resultado({
        produtoId: escolhido.id,
        confianca: CONFIANCA_CODIGO,
        motivo: 'codigo_fornecedor',
        explicacao: `Código ${item.codigoFornecedor} confere com o código do produto no cadastro.`,
        unidadeSugerida: escolhido.unidade ?? null,
        sugestoes,
      })
    }
  }

  // 5. Último degrau: as descrições se parecem.
  const melhor = sugestoes[0]
  if (!melhor || melhor.confianca <= 0) {
    return resultado({
      confianca: 0,
      motivo: 'sem_correspondencia',
      explicacao: 'Nenhum produto cadastrado se parece com esta descrição.',
      sugestoes,
    })
  }

  const segundo = sugestoes[1]
  if (segundo && melhor.confianca - segundo.confianca < EMPATE && segundo.confianca >= limiar) {
    return resultado({
      confianca: melhor.confianca,
      motivo: 'ambiguo',
      explicacao: `"${melhor.nome}" e "${segundo.nome}" são igualmente parecidos com esta descrição: confirme qual é.`,
      sugestoes,
    })
  }

  if (melhor.confianca >= limiar) {
    const produto = produtos.find((p) => p.id === melhor.produtoId)
    return resultado({
      produtoId: melhor.produtoId,
      confianca: melhor.confianca,
      motivo: 'similaridade',
      explicacao: `Descrição parecida com "${melhor.nome}" (${Math.round(melhor.confianca * 100)}%).`,
      unidadeSugerida: produto?.unidade ?? null,
      sugestoes,
    })
  }

  return resultado({
    confianca: melhor.confianca,
    motivo: 'sem_correspondencia',
    explicacao:
      `O mais parecido é "${melhor.nome}" (${Math.round(melhor.confianca * 100)}%), ` +
      'pouco para vincular sozinho. Confirme o produto.',
    sugestoes,
  })
}

export function casarItens(itens: ItemParaCasar[], contexto: ContextoCasamento): Casamento[] {
  return itens.map((item) => casarItem(item, contexto))
}
