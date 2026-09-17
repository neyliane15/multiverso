/**
 * Leitor de XML de NFe (modelo 55) e NFC-e (modelo 65), layout 4.00.
 *
 * O objetivo é transformar o XML autorizado da SEFAZ em um objeto simples que
 * o resto do módulo 3.1 consegue usar sem saber nada de XML. Nada aqui toca no
 * banco: quem grava é a edge function `importar-nfe`.
 *
 * Duas decisões que valem explicação:
 * - Números chegam como texto e são convertidos aqui, um a um. Deixar o
 *   fast-xml-parser converter sozinho estragaria códigos como cProd "00123"
 *   e a própria chave de acesso (44 dígitos viram notação científica).
 * - Divergência de centavos entre a soma dos itens e o total da nota é
 *   rotina em nota real (arredondamento por item). Vira aviso, nunca exceção.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser'

// ---------------------------------------------------------------- tipos ----

export interface EmitenteNota {
  /** Só dígitos, como o banco guarda em `fornecedores.documento`. */
  documento: string
  razaoSocial: string
  nomeFantasia: string | null
  inscricaoEstadual: string | null
  /** Endereço montado em uma linha, do jeito que `fornecedores.endereco` espera. */
  endereco: string | null
}

export interface TotaisNota {
  valorProdutos: number
  valorFrete: number
  valorDesconto: number
  valorOutros: number
  valorTotal: number
}

export interface ItemImportado {
  /** `nItem` do XML: a ordem em que o item aparece na nota. */
  ordem: number
  codigoFornecedor: string | null
  descricao: string
  ncm: string | null
  cfop: string | null
  /** EAN/GTIN real; "SEM GTIN" vira null. */
  ean: string | null
  /** Unidade comercial da nota (uCom), como veio. */
  unidade: string
  quantidade: number
  valorUnitario: number
  valorDesconto: number
  valorTotal: number
}

export interface NotaImportada {
  chaveAcesso: string
  /** Falso quando o dígito verificador não bate — arquivo provavelmente corrompido. */
  chaveValida: boolean
  numero: string
  serie: string
  /** '55' (NFe) ou '65' (NFC-e). */
  modelo: string
  /** Data de emissão em `YYYY-MM-DD`, já no fuso America/Sao_Paulo. */
  emitidaEm: string
  emitente: EmitenteNota
  totais: TotaisNota
  itens: ItemImportado[]
  /** Problemas que não impedem a importação, em português, prontos para a tela. */
  avisos: string[]
}

export type CodigoErroNfe =
  | 'xml_invalido'
  | 'nao_e_nfe'
  | 'modelo_nao_suportado'
  | 'chave_ausente'
  | 'chave_invalida'
  | 'sem_itens'

/** Erro de importação com código estável — a UI escolhe o texto pelo código. */
export class ErroNfe extends Error {
  readonly codigo: CodigoErroNfe

  constructor(codigo: CodigoErroNfe, mensagem: string) {
    super(mensagem)
    this.name = 'ErroNfe'
    this.codigo = codigo
  }
}

export interface OpcoesParse {
  /**
   * Por padrão a chave com dígito verificador errado só gera aviso: quem chamou
   * decide se aborta ou deixa o humano conferir. Com `true`, vira exceção.
   */
  exigirChaveValida?: boolean
  /** Diferença tolerada, em reais, entre a soma dos itens e o total da nota. */
  toleranciaTotal?: number
}

// ------------------------------------------------- chave de acesso ---------

/**
 * Dígito verificador da chave de acesso: módulo 11 com pesos 2..9 cíclicos,
 * da direita para a esquerda, sobre os 43 primeiros dígitos.
 */
export function calcularDigitoChave(chave43: string): number {
  let soma = 0
  let peso = 2
  for (let i = chave43.length - 1; i >= 0; i -= 1) {
    const digito = Number(chave43[i])
    if (!Number.isFinite(digito)) throw new ErroNfe('chave_invalida', 'Chave de acesso com caractere não numérico.')
    soma += digito * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto === 0 || resto === 1 ? 0 : 11 - resto
}

/** Verdadeiro só quando são 44 dígitos e o DV confere. */
export function validarChaveAcesso(chave: string): boolean {
  const limpa = chave.replace(/\D/g, '')
  if (limpa.length !== 44) return false
  return calcularDigitoChave(limpa.slice(0, 43)) === Number(limpa.slice(43))
}

/** Partes legíveis da chave — útil para conferir o XML contra o cabeçalho. */
export function partesDaChave(chave: string): {
  uf: string
  anoMes: string
  cnpj: string
  modelo: string
  serie: string
  numero: string
} | null {
  const limpa = chave.replace(/\D/g, '')
  if (limpa.length !== 44) return null
  return {
    uf: limpa.slice(0, 2),
    anoMes: limpa.slice(2, 6),
    cnpj: limpa.slice(6, 20),
    modelo: limpa.slice(20, 22),
    serie: limpa.slice(22, 25),
    numero: limpa.slice(25, 34),
  }
}

// ------------------------------------------------------------ datas --------

const PARTES_DATA_SP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * `dhEmi` ('2026-03-12T21:40:00-03:00') ou `dEmi` legado ('2026-03-12') viram
 * `YYYY-MM-DD` no fuso do restaurante. O offset importa: nota emitida às 23h
 * em Brasília aparece como do dia seguinte se a gente ler em UTC.
 */
export function dataEmissaoParaIso(valor: string): string {
  const texto = valor.trim()

  // dEmi legado (NFe 3.10) e dhEmi sem hora: já é a data local do emitente.
  const apenasData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (apenasData) return texto

  const comOffset = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(texto)
  if (!comOffset) throw new ErroNfe('xml_invalido', `Data de emissão em formato desconhecido: "${valor}".`)

  // Sem offset não há o que converter: o horário já é o local do emitente.
  const offset = comOffset[3]
  if (!offset) return comOffset[1] as string

  const instante = new Date(texto)
  if (Number.isNaN(instante.getTime())) {
    throw new ErroNfe('xml_invalido', `Data de emissão inválida: "${valor}".`)
  }

  const partes = PARTES_DATA_SP.formatToParts(instante)
  const pega = (tipo: 'year' | 'month' | 'day'): string =>
    partes.find((p) => p.type === tipo)?.value ?? ''
  const ano = pega('year')
  const mes = pega('month')
  const dia = pega('day')
  if (!ano || !mes || !dia) {
    // Runtime sem dados de fuso: cai no offset fixo de Brasília (-03:00, sem
    // horário de verão desde 2019) para não devolver data errada em silêncio.
    return new Date(instante.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  return `${ano}-${mes}-${dia}`
}

// ------------------------------------------------- acesso ao XML cru -------

type Registro = Record<string, unknown>

function registro(valor: unknown): Registro | null {
  if (Array.isArray(valor)) return registro(valor[0])
  if (valor && typeof valor === 'object') return valor as Registro
  return null
}

/** `det` vem como objeto quando a nota tem um item só — o bug clássico. */
function emLista(valor: unknown): unknown[] {
  if (valor === undefined || valor === null) return []
  return Array.isArray(valor) ? valor : [valor]
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string') {
    const limpo = valor.trim()
    return limpo === '' ? null : limpo
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  const obj = registro(valor)
  if (obj && '#text' in obj) return texto(obj['#text'])
  return null
}

/** Valor monetário/quantidade da NFe: sempre ponto decimal, nunca vírgula. */
function numero(valor: unknown, padrao = 0): number {
  const bruto = texto(valor)
  if (bruto === null) return padrao
  const convertido = Number(bruto.replace(/\s/g, ''))
  return Number.isFinite(convertido) ? convertido : padrao
}

function somenteDigitos(valor: unknown): string | null {
  const bruto = texto(valor)
  if (bruto === null) return null
  const digitos = bruto.replace(/\D/g, '')
  return digitos === '' ? null : digitos
}

/** GTIN ausente vem como 'SEM GTIN' desde a NT 2016.002 — isso não é código. */
function eanValido(valor: unknown): string | null {
  const bruto = texto(valor)
  if (bruto === null) return null
  const limpo = bruto.toUpperCase().replace(/\s+/g, ' ').trim()
  if (limpo === 'SEM GTIN' || limpo === 'SEMGTIN') return null
  const digitos = bruto.replace(/\D/g, '')
  return digitos === '' ? null : digitos
}

/** Arredonda para centavos antes de comparar — 0.1+0.2 não é 0.3 em float. */
function centavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

const REAIS = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Aviso é texto de tela: dinheiro vai com vírgula, como manda o contrato. */
function emReais(valor: number): string {
  return `R$ ${REAIS.format(valor)}`
}

// ------------------------------------------------------------ parser ------

const LEITOR = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Com namespace ou sem (`<nfe:NFe>`), o caminho de leitura é o mesmo.
  removeNSPrefix: true,
  // Tudo string: preserva zero à esquerda de cProd/NCM e a chave de 44 dígitos.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

function extrairChave(infNFe: Registro): string {
  const id = texto(infNFe['@_Id'])
  if (id) {
    const digitos = id.replace(/^\s*NFe/i, '').replace(/\D/g, '')
    if (digitos.length === 44) return digitos
    if (digitos.length > 0) {
      throw new ErroNfe(
        'chave_invalida',
        `A chave de acesso tem ${digitos.length} dígitos; o esperado são 44.`,
      )
    }
  }
  throw new ErroNfe('chave_ausente', 'O XML não traz a chave de acesso (atributo Id de infNFe).')
}

function montarEndereco(enderEmit: Registro | null): string | null {
  if (!enderEmit) return null
  const logradouro = texto(enderEmit['xLgr'])
  const numeroCasa = texto(enderEmit['nro'])
  const complemento = texto(enderEmit['xCpl'])
  const bairro = texto(enderEmit['xBairro'])
  const municipio = texto(enderEmit['xMun'])
  const uf = texto(enderEmit['UF'])
  const cep = somenteDigitos(enderEmit['CEP'])

  const rua = [logradouro, numeroCasa].filter(Boolean).join(', ')
  const cidade = [municipio, uf].filter(Boolean).join('/')
  const partes = [rua, complemento, bairro, cidade, cep ? `CEP ${cep}` : null]
    .map((p) => (p ? p.trim() : ''))
    .filter((p) => p !== '')
  return partes.length > 0 ? partes.join(' - ') : null
}

function extrairItem(det: unknown, posicao: number): ItemImportado | null {
  const no = registro(det)
  if (!no) return null
  const prod = registro(no['prod'])
  if (!prod) return null

  const descricao = texto(prod['xProd'])
  const quantidade = numero(prod['qCom'])
  const valorUnitario = numero(prod['vUnCom'])
  const valorTotal = numero(prod['vProd'])

  return {
    ordem: Math.trunc(numero(no['@_nItem'], posicao + 1)),
    codigoFornecedor: texto(prod['cProd']),
    descricao: descricao ?? '(sem descrição)',
    ncm: somenteDigitos(prod['NCM']),
    cfop: somenteDigitos(prod['CFOP']),
    // cEANTrib é o plano B: muitos emitentes preenchem só o GTIN tributável.
    ean: eanValido(prod['cEAN']) ?? eanValido(prod['cEANTrib']),
    unidade: texto(prod['uCom']) ?? 'UND',
    quantidade,
    valorUnitario,
    valorDesconto: numero(prod['vDesc']),
    valorTotal,
  }
}

/**
 * Lê o XML e devolve a nota pronta para conferência.
 *
 * Aceita `<nfeProc><NFe>…`, `<NFe>` solto, com ou sem prefixo de namespace.
 */
export function parsearXml(xml: string, opcoes: OpcoesParse = {}): NotaImportada {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new ErroNfe('xml_invalido', 'Arquivo XML vazio.')
  }

  const validacao = XMLValidator.validate(xml, { allowBooleanAttributes: true })
  if (validacao !== true) {
    const detalhe = validacao.err?.msg ? ` (${validacao.err.msg})` : ''
    throw new ErroNfe('xml_invalido', `Arquivo XML mal formado${detalhe}.`)
  }

  let documento: Registro | null
  try {
    documento = registro(LEITOR.parse(xml))
  } catch (erro) {
    const detalhe = erro instanceof Error ? ` (${erro.message})` : ''
    throw new ErroNfe('xml_invalido', `Não foi possível ler o XML${detalhe}.`)
  }
  if (!documento) throw new ErroNfe('xml_invalido', 'Arquivo XML sem conteúdo.')

  const proc = registro(documento['nfeProc'])
  const nfe = registro(proc?.['NFe']) ?? registro(documento['NFe'])
  if (!nfe) {
    throw new ErroNfe(
      'nao_e_nfe',
      'Este XML não é uma NFe: não encontrei a tag <NFe>. Se for o XML de evento (cancelamento, CC-e), envie o arquivo da nota.',
    )
  }

  const infNFe = registro(nfe['infNFe'])
  if (!infNFe) throw new ErroNfe('nao_e_nfe', 'XML de NFe sem a tag <infNFe>.')

  const ide = registro(infNFe['ide'])
  if (!ide) throw new ErroNfe('nao_e_nfe', 'XML de NFe sem a tag <ide>.')

  const avisos: string[] = []

  const chaveAcesso = extrairChave(infNFe)
  const chaveValida = validarChaveAcesso(chaveAcesso)
  if (!chaveValida) {
    const mensagem =
      `A chave de acesso ${chaveAcesso} tem dígito verificador errado — ` +
      'o arquivo pode estar corrompido ou adulterado.'
    if (opcoes.exigirChaveValida) throw new ErroNfe('chave_invalida', mensagem)
    avisos.push(mensagem)
  }

  const modelo = texto(ide['mod']) ?? chaveAcesso.slice(20, 22)
  if (modelo !== '55' && modelo !== '65') {
    throw new ErroNfe(
      'modelo_nao_suportado',
      `Modelo ${modelo} não é suportado: o importador lê NFe (55) e NFC-e (65).`,
    )
  }

  const dataBruta = texto(ide['dhEmi']) ?? texto(ide['dEmi'])
  if (!dataBruta) throw new ErroNfe('nao_e_nfe', 'XML de NFe sem data de emissão (dhEmi/dEmi).')
  const emitidaEm = dataEmissaoParaIso(dataBruta)

  const emit = registro(infNFe['emit'])
  const documentoEmitente = somenteDigitos(emit?.['CNPJ']) ?? somenteDigitos(emit?.['CPF'])
  const emitente: EmitenteNota = {
    documento: documentoEmitente ?? '',
    razaoSocial: texto(emit?.['xNome']) ?? 'Fornecedor sem nome',
    nomeFantasia: texto(emit?.['xFant']),
    inscricaoEstadual: texto(emit?.['IE']),
    endereco: montarEndereco(registro(emit?.['enderEmit'])),
  }
  if (!documentoEmitente) {
    avisos.push('O XML não traz o CNPJ do emitente: confira o fornecedor antes de lançar.')
  }

  const icmsTot = registro(registro(infNFe['total'])?.['ICMSTot'])
  if (!icmsTot) {
    avisos.push('O XML não traz o bloco de totais (ICMSTot): os valores foram somados pelos itens.')
  }

  const itens = emLista(infNFe['det'])
    .map((det, posicao) => extrairItem(det, posicao))
    .filter((item): item is ItemImportado => item !== null)
    .sort((a, b) => a.ordem - b.ordem)

  if (itens.length === 0) {
    throw new ErroNfe('sem_itens', 'A NFe não tem nenhum item (<det>) para importar.')
  }

  const somaItens = centavos(itens.reduce((soma, item) => soma + item.valorTotal, 0))
  const totais: TotaisNota = {
    valorProdutos: icmsTot ? numero(icmsTot['vProd'], somaItens) : somaItens,
    valorFrete: numero(icmsTot?.['vFrete']),
    valorDesconto: numero(icmsTot?.['vDesc']),
    valorOutros: numero(icmsTot?.['vOutro']),
    valorTotal: numero(icmsTot?.['vNF']),
  }
  if (totais.valorTotal === 0) {
    // Sem vNF o histórico de compras mentiria: recompõe pelo que dá para somar.
    totais.valorTotal = centavos(
      totais.valorProdutos + totais.valorFrete + totais.valorOutros - totais.valorDesconto,
    )
  }

  const tolerancia = opcoes.toleranciaTotal ?? 0.02
  const diferenca = centavos(Math.abs(somaItens - totais.valorProdutos))
  if (icmsTot && diferenca > tolerancia) {
    avisos.push(
      `A soma dos itens (${emReais(somaItens)}) não bate com o total de produtos da nota ` +
        `(${emReais(totais.valorProdutos)}): diferença de ${emReais(diferenca)}.`,
    )
  }

  return {
    chaveAcesso,
    chaveValida,
    numero: texto(ide['nNF']) ?? partesDaChave(chaveAcesso)?.numero.replace(/^0+(?=\d)/, '') ?? '',
    serie: texto(ide['serie']) ?? '',
    modelo,
    emitidaEm,
    emitente,
    totais,
    itens,
    avisos,
  }
}
