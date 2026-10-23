/**
 * Leitor de XLSX no navegador, sem dependência nova.
 *
 * Um `.xlsx` é um ZIP com XML dentro. O projeto já tem `fast-xml-parser` — é
 * ele que lê a NFe desde a 3.1 — e o navegador já descompacta com
 * `DecompressionStream('deflate-raw')`. O que faltava era só abrir o ZIP, e
 * isso é a tabela de diretório central: 46 bytes de cabeçalho por arquivo.
 *
 * Por que não `xlsx` (SheetJS) nem `exceljs`, medido antes de escrever:
 *
 * - `xlsx@0.18.5` é a última versão publicada no npm, e é a que carrega os
 *   avisos de protótipo/ReDoS abertos; as correções (0.19.3+) saem só pelo CDN
 *   próprio da SheetJS, que não é canal de `package-lock.json`. Fixar a versão,
 *   como manda a casa, seria fixar justamente a vulnerável.
 * - `exceljs@4.4.0` são 21,8 MB desempacotados e 9 dependências de runtime
 *   (`archiver`, `unzipper`, `tmp`, `readable-stream`) feitas para Node, não
 *   para navegador — entram polyfill de `Buffer` e de `stream` no bundle.
 *
 * Nenhuma das duas se paga para ler **uma aba de tabela plana**, que é todo o
 * caso de uso: sem fórmula, sem estilo, sem gráfico, sem escrita. O custo deste
 * arquivo é ~250 linhas testadas contra as duas planilhas de verdade.
 *
 * O que ele NÃO faz, e recusa dizendo: ZIP64, entrada compactada por método
 * que não seja "guardado" (0) ou "deflate" (8), e planilha sem aba. Recusar em
 * voz alta é melhor que devolver meia tabela.
 *
 * Duas medidas que decidiram o desenho, na aba de 11.198 linhas × 29 colunas
 * (`xl/worksheets/sheet1.xml` com 11,5 MB crus, 324.703 células):
 *
 *   árvore inteira num `parse` só .... 3.530 ms · 285 MB de heap
 *   uma linha por `parse` ............ 1.549 ms ·  25 MB de heap
 *
 * Por isso o XML da aba é fatiado por `<row>` com expressão regular — e **só**
 * por `<row>`: o conteúdo de cada linha continua passando pelo
 * `fast-xml-parser`, que é quem sabe de escape, de `<is>` embutido e de
 * namespace. Fatiar o envelope é diferente de parsear XML com regex.
 */
import { XMLParser } from 'fast-xml-parser'

// ------------------------------------------------------------- erros -------

export type CodigoErroPlanilha =
  | 'nao_e_zip'
  | 'zip64'
  | 'metodo_desconhecido'
  | 'sem_aba'
  | 'aba_vazia'
  | 'cabecalho_vazio'
  | 'coluna_ausente'

/** Erro de leitura com código estável — a tela escolhe o texto pelo código. */
export class ErroDePlanilha extends Error {
  readonly codigo: CodigoErroPlanilha

  constructor(codigo: CodigoErroPlanilha, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDePlanilha'
    this.codigo = codigo
  }
}

// ------------------------------------------------------------- tipos -------

/**
 * Valor de célula já convertido.
 *
 * Data vira `YYYY-MM-DD` (texto), e não `Date`, pelo mesmo motivo que o resto
 * do sistema trata data como ISO: um `Date` arrasta fuso, e a planilha não tem
 * fuso nenhum — ela tem um número de dias.
 */
export type ValorDeCelula = string | number | boolean | null

export interface LinhaDePlanilha {
  /** Número da linha na planilha, como o Excel a mostra. Serve para a mensagem de erro. */
  numero: number
  /** Valores pela coluna do cabeçalho. Coluna ausente na linha vem `null`. */
  valores: Record<string, ValorDeCelula>
}

export interface AbaDaPlanilha {
  nome: string
  /** Os títulos da primeira linha, na ordem, já aparados. */
  cabecalho: string[]
  linhas: LinhaDePlanilha[]
}

// --------------------------------------------------------------- zip -------

interface EntradaDeZip {
  nome: string
  metodo: number
  tamanhoCompactado: number
  deslocamento: number
}

const ASSINATURA_FIM = 0x06054b50
const ASSINATURA_CENTRAL = 0x02014b50
const ASSINATURA_FIM_ZIP64_LOCALIZADOR = 0x07064b50
/** O comentário do ZIP cabe em 16 bits, então o fim do arquivo está nos últimos 64 KiB + 22. */
const MAXIMO_COMENTARIO = 0xffff + 22

function abrirZip(dados: Uint8Array): Map<string, EntradaDeZip> {
  const dv = new DataView(dados.buffer, dados.byteOffset, dados.byteLength)

  // O "fim do diretório central" é procurado de trás para frente porque ele
  // pode ter um comentário depois. É assim que todo leitor de ZIP faz.
  let fim = -1
  const piso = Math.max(0, dados.length - MAXIMO_COMENTARIO)
  for (let i = dados.length - 22; i >= piso; i -= 1) {
    if (dv.getUint32(i, true) === ASSINATURA_FIM) {
      fim = i
      break
    }
  }
  if (fim < 0) {
    throw new ErroDePlanilha(
      'nao_e_zip',
      'Este arquivo não é um .xlsx: não encontrei o índice do ZIP dentro dele. ' +
        'Planilha salva como .xls antigo ou .csv renomeado não serve — salve como "Pasta de Trabalho do Excel (.xlsx)".',
    )
  }

  const total = dv.getUint16(fim + 10, true)
  let ponteiro = dv.getUint32(fim + 16, true)
  // 0xffffffff nos campos de 32 bits é a marca do ZIP64. Ler em frente devolveria
  // deslocamento errado e lixo em vez de XML.
  if (total === 0xffff || ponteiro === 0xffffffff || temRodapeZip64(dv, fim)) {
    throw new ErroDePlanilha(
      'zip64',
      'Esta planilha está no formato ZIP64 (arquivo muito grande ou com muitas partes), que este leitor não abre. ' +
        'Reabra no Excel e salve de novo, ou exporte um período menor.',
    )
  }

  const entradas = new Map<string, EntradaDeZip>()
  for (let k = 0; k < total; k += 1) {
    if (dv.getUint32(ponteiro, true) !== ASSINATURA_CENTRAL) {
      throw new ErroDePlanilha(
        'nao_e_zip',
        `O índice do .xlsx está corrompido na entrada ${k + 1} de ${total}. O arquivo provavelmente não baixou inteiro.`,
      )
    }
    const metodo = dv.getUint16(ponteiro + 10, true)
    const tamanhoCompactado = dv.getUint32(ponteiro + 20, true)
    const tamanhoDoNome = dv.getUint16(ponteiro + 28, true)
    const tamanhoExtra = dv.getUint16(ponteiro + 30, true)
    const tamanhoComentario = dv.getUint16(ponteiro + 32, true)
    const deslocamento = dv.getUint32(ponteiro + 42, true)
    const nome = new TextDecoder().decode(
      dados.subarray(ponteiro + 46, ponteiro + 46 + tamanhoDoNome),
    )
    entradas.set(nome, { nome, metodo, tamanhoCompactado, deslocamento })
    ponteiro += 46 + tamanhoDoNome + tamanhoExtra + tamanhoComentario
  }
  return entradas
}

/**
 * O localizador do fim ZIP64 tem 20 bytes e fica imediatamente antes do fim
 * comum. Quando ele existe, os campos de 32 bits do fim comum são espelho e
 * podem estar truncados: os valores de verdade estão no rodapé ZIP64.
 */
function temRodapeZip64(dv: DataView, fim: number): boolean {
  const alvo = fim - 20
  if (alvo < 0) return false
  return dv.getUint32(alvo, true) === ASSINATURA_FIM_ZIP64_LOCALIZADOR
}

async function descompactar(dados: Uint8Array, entrada: EntradaDeZip): Promise<string> {
  const dv = new DataView(dados.buffer, dados.byteOffset, dados.byteLength)
  // O cabeçalho local repete nome e extra, e os dois podem ter tamanho diferente
  // do que está no diretório central: o começo dos dados se mede aqui, não lá.
  const tamanhoDoNome = dv.getUint16(entrada.deslocamento + 26, true)
  const tamanhoExtra = dv.getUint16(entrada.deslocamento + 28, true)
  const inicio = entrada.deslocamento + 30 + tamanhoDoNome + tamanhoExtra
  const bruto = dados.subarray(inicio, inicio + entrada.tamanhoCompactado)

  if (entrada.metodo === 0) return new TextDecoder().decode(bruto)
  if (entrada.metodo !== 8) {
    throw new ErroDePlanilha(
      'metodo_desconhecido',
      `A parte "${entrada.nome}" do .xlsx está compactada pelo método ${entrada.metodo}, que este leitor não abre. ` +
        'Reabra no Excel e salve de novo.',
    )
  }

  const fluxo = new Blob([bruto as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(new Uint8Array(await new Response(fluxo).arrayBuffer()))
}

// -------------------------------------------------------------- xml --------

const LEITOR = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Tudo texto. Deixar o parser converter estragaria número de nota com zero à
  // esquerda e transformaria código longo em notação científica — a mesma razão
  // escrita em `parsearXml.ts`.
  parseTagValue: false,
  parseAttributeValue: false,
  // Sem aparar, e isto tem motivo medido: o Excel quebra um texto formatado em
  // vários `<r><t>`, e "AMSTEL " + "600 ML" aparado vira "AMSTEL600 ML" — nome
  // de produto diferente, que o de-para não casa com nada. Quem apara é
  // `textoRico`, nas PONTAS do texto já remontado.
  trimValues: false,
})

type Registro = Record<string, unknown>

function comoLista(valor: unknown): Registro[] {
  if (valor === undefined || valor === null) return []
  return (Array.isArray(valor) ? valor : [valor]) as Registro[]
}

function texto(valor: unknown): string {
  if (valor === undefined || valor === null) return ''
  if (typeof valor === 'object') {
    const interno = (valor as Registro)['#text']
    return interno === undefined ? '' : String(interno)
  }
  return String(valor)
}

/**
 * Texto de uma célula `inlineStr` ou de um `<si>` da tabela de textos.
 *
 * O Excel quebra um texto formatado em vários `<r><t>`: "AMSTEL " + "600 ML".
 * Concatenar na ordem é o único jeito de recompor o nome que a pessoa vê.
 */
function textoRico(no: unknown): string {
  if (no === undefined || no === null) return ''
  const registro = no as Registro
  const partes = comoLista(registro['r'])
  if (partes.length > 0) return partes.map((parte) => texto(parte['t'])).join('').trim()
  return texto(registro['t']).trim()
}

// ------------------------------------------------------------- datas -------

/**
 * Formatos numéricos embutidos do Excel que significam data ou hora.
 *
 * O arquivo não diz "esta célula é uma data": ele diz que a célula usa o estilo
 * 1, e que o estilo 1 usa o formato 14. Sem este caminho, toda data da planilha
 * chegaria como 46277 — e o importador gravaria 46277 como ano.
 */
const FORMATOS_DE_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function formatosDeData(estilos: string): Set<number> {
  const personalizados = new Set<number>()
  // numFmt personalizado: "dd/mm/yyyy" vira id 164+. Quem tem y/m/d ou h é data.
  const RE_FORMATO = /<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"/g
  let achado: RegExpExecArray | null
  while ((achado = RE_FORMATO.exec(estilos)) !== null) {
    const id = Number(achado[1])
    const codigo = (achado[2] ?? '').toLowerCase().replace(/\[[^\]]*\]/g, '')
    if (/[ymdh]/.test(codigo)) personalizados.add(id)
  }

  // cellXfs é a lista de estilos de célula, na ordem: o índice é o `s` da célula.
  const bloco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)
  const comData = new Set<number>()
  if (!bloco?.[1]) return comData
  const RE_XF = /<xf\b[^>]*>|<xf\b[^>]*\/>/g
  let indice = 0
  let xf: RegExpExecArray | null
  while ((xf = RE_XF.exec(bloco[1])) !== null) {
    const id = Number(/\bnumFmtId="(\d+)"/.exec(xf[0])?.[1] ?? '0')
    if (FORMATOS_DE_DATA.has(id) || personalizados.has(id)) comData.add(indice)
    indice += 1
  }
  return comData
}

/**
 * Serial do Excel para `YYYY-MM-DD`.
 *
 * A época é 1899-12-30 e não 1900-01-01 por causa do bug do ano 1900 que o
 * Excel preserva de propósito desde o Lotus 1-2-3: ele acha que 1900 foi
 * bissexto, e por isso o serial 60 é um 29/02/1900 que nunca existiu. Para
 * data moderna a conta é 1899-12-30 + serial; abaixo do serial 61 a conta é
 * 1899-12-31 + serial, porque o dia fantasma ainda não entrou.
 *
 * Conferido contra o `openpyxl` nas duas planilhas: 46277 é 12/09/2026 nos dois.
 */
export function dataDoSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const dias = Math.floor(serial)
  const epoca = dias < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  const d = new Date(epoca + dias * 86_400_000)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** 'AB12' -> 'AB'. A letra é a coluna; o número, a linha. */
function colunaDaReferencia(referencia: string): string {
  let fim = 0
  while (fim < referencia.length) {
    const c = referencia.charCodeAt(fim)
    if (c < 65 || c > 90) break
    fim += 1
  }
  return referencia.slice(0, fim)
}

/** 'A' -> 0, 'Z' -> 25, 'AA' -> 26. */
function indiceDaColuna(letras: string): number {
  let n = 0
  for (const letra of letras) n = n * 26 + (letra.charCodeAt(0) - 64)
  return n - 1
}

// ------------------------------------------------------------ leitura ------

/** Caminho da primeira aba, lido do workbook e dos seus relacionamentos. */
function primeiraAba(workbook: string, rels: string): { nome: string; caminho: string } {
  const folha = /<sheet\b[^>]*\/>/.exec(workbook)?.[0] ?? /<sheet\b[^>]*>/.exec(workbook)?.[0]
  if (!folha) {
    throw new ErroDePlanilha('sem_aba', 'Esta planilha não tem aba nenhuma dentro.')
  }
  const nome = (/\bname="([^"]*)"/.exec(folha)?.[1] ?? 'Planilha1').replace(/&amp;/g, '&')
  const rid = /\br:id="([^"]*)"/.exec(folha)?.[1] ?? /\bid="([^"]*)"/.exec(folha)?.[1] ?? ''

  const alvo = rid === '' ? null : new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)
  const destino = alvo ? /\bTarget="([^"]*)"/.exec(alvo[0])?.[1] : undefined
  // Sem o relacionamento, o palpite é o nome que 100% dos exportadores usam.
  const caminho = destino
    ? `xl/${destino.replace(/^\/?xl\//, '').replace(/^\//, '')}`
    : 'xl/worksheets/sheet1.xml'
  return { nome, caminho }
}

/**
 * Lê a PRIMEIRA aba de um `.xlsx` como tabela com cabeçalho.
 *
 * Só a primeira: as duas planilhas do cliente têm uma aba cada, e escolher aba
 * é pergunta de tela, não de leitor. Quando houver planilha de duas abas, é
 * aqui que o parâmetro entra.
 */
export async function lerXlsx(arquivo: ArrayBuffer | Uint8Array): Promise<AbaDaPlanilha> {
  const dados = arquivo instanceof Uint8Array ? arquivo : new Uint8Array(arquivo)
  const entradas = abrirZip(dados)

  const pegar = async (nome: string, obrigatorio: boolean): Promise<string> => {
    const entrada = entradas.get(nome)
    if (!entrada) {
      if (!obrigatorio) return ''
      throw new ErroDePlanilha('sem_aba', `O .xlsx não tem a parte "${nome}" dentro.`)
    }
    return descompactar(dados, entrada)
  }

  const workbook = await pegar('xl/workbook.xml', true)
  const rels = await pegar('xl/_rels/workbook.xml.rels', false)
  const aba = primeiraAba(workbook, rels)

  const estilos = await pegar('xl/styles.xml', false)
  const estilosDeData = estilos === '' ? new Set<number>() : formatosDeData(estilos)

  // A tabela de textos: a célula guarda o índice, não a palavra. Um nome de
  // produto que aparece 3.000 vezes está gravado uma só.
  const textosCrus = await pegar('xl/sharedStrings.xml', false)
  const textos: string[] = []
  if (textosCrus !== '') {
    const RE_SI = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si\s*>)/g
    let achado: RegExpExecArray | null
    while ((achado = RE_SI.exec(textosCrus)) !== null) {
      textos.push(achado[1] === undefined ? '' : textoRico(LEITOR.parse(`<si>${achado[1]}</si>`).si))
    }
  }

  const folha = await pegar(aba.caminho, true)

  const cabecalho: string[] = []
  const linhas: LinhaDePlanilha[] = []

  const RE_LINHA = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row\s*>)/g
  let bruta: RegExpExecArray | null
  while ((bruta = RE_LINHA.exec(folha)) !== null) {
    const numero = Number(/\br="(\d+)"/.exec(bruta[1] ?? '')?.[1] ?? '0')
    const miolo = bruta[2]
    if (miolo === undefined || miolo === '') continue

    const celulas = comoLista((LEITOR.parse(`<linha>${miolo}</linha>`) as Registro)['linha'])
      .flatMap((linha) => comoLista(linha['c']))

    // Posição pela referência (`A2`), nunca pela ordem de aparição: a planilha
    // de vendas OMITE a célula vazia, então a linha 2 pula direto de C2 para E2.
    // Ler por ordem jogaria todo o resto da linha uma coluna para a esquerda.
    const porColuna: ValorDeCelula[] = []
    for (const celula of celulas) {
      const referencia = texto(celula['@_r'])
      const indice = referencia === '' ? porColuna.length : indiceDaColuna(colunaDaReferencia(referencia))
      porColuna[indice] = valorDaCelula(celula, textos, estilosDeData)
    }

    if (cabecalho.length === 0) {
      for (let i = 0; i < porColuna.length; i += 1) {
        const titulo = porColuna[i]
        cabecalho[i] = titulo === null || titulo === undefined ? '' : String(titulo).trim()
      }
      if (cabecalho.every((t) => t === '')) {
        throw new ErroDePlanilha(
          'cabecalho_vazio',
          `A primeira linha da aba "${aba.nome}" está vazia: sem cabeçalho não há como saber qual coluna é qual.`,
        )
      }
      continue
    }

    const valores: Record<string, ValorDeCelula> = {}
    let algumPreenchido = false
    for (let i = 0; i < cabecalho.length; i += 1) {
      const titulo = cabecalho[i]
      if (titulo === undefined || titulo === '') continue
      const valor = porColuna[i] ?? null
      valores[titulo] = valor
      if (valor !== null && valor !== '') algumPreenchido = true
    }
    // Linha em branco no meio ou no fim é rotina em planilha exportada. Ela não
    // é dado e não vira linha de nota nem de venda.
    if (algumPreenchido) linhas.push({ numero, valores })
  }

  if (cabecalho.length === 0) {
    throw new ErroDePlanilha('aba_vazia', `A aba "${aba.nome}" não tem nenhuma linha.`)
  }

  return { nome: aba.nome, cabecalho: cabecalho.map((t) => t ?? ''), linhas }
}

function valorDaCelula(
  celula: Registro,
  textos: string[],
  estilosDeData: ReadonlySet<number>,
): ValorDeCelula {
  const tipo = texto(celula['@_t'])
  const cru = celula['v']

  if (tipo === 'inlineStr') return textoRico(celula['is'])
  if (tipo === 's') {
    const indice = Number(texto(cru))
    return textos[indice] ?? ''
  }
  if (tipo === 'b') return texto(cru) === '1'
  // Célula de erro (#N/A, #DIV/0!) e célula de texto solto: devolvidas como texto.
  if (tipo === 'e' || tipo === 'str') return texto(cru)

  const bruto = texto(cru)
  if (bruto === '') return null
  const numero = Number(bruto)
  if (!Number.isFinite(numero)) return bruto

  const estilo = texto(celula['@_s'])
  if (estilo !== '' && estilosDeData.has(Number(estilo))) {
    return dataDoSerial(numero) ?? numero
  }
  return numero
}

// --------------------------------------------------------- utilidades ------

/** Exige que a aba traga as colunas pelo nome exato, e diz quais faltaram. */
export function exigirColunas(aba: AbaDaPlanilha, colunas: readonly string[]): void {
  const presentes = new Set(aba.cabecalho)
  const faltam = colunas.filter((c) => !presentes.has(c))
  if (faltam.length === 0) return
  throw new ErroDePlanilha(
    'coluna_ausente',
    `A aba "${aba.nome}" não tem ${faltam.length === 1 ? 'a coluna' : 'as colunas'} ` +
      `${faltam.map((c) => `"${c}"`).join(', ')}. ` +
      `O que encontrei foi: ${aba.cabecalho.filter((c) => c !== '').join(', ')}.`,
  )
}

/**
 * Número de célula, aceitando o texto com vírgula que algumas exportações
 * trazem. Aceita `undefined` porque `valores['Coluna']` de uma coluna que a
 * planilha não tem é exatamente isso — e "coluna ausente" é o mesmo que
 * "célula vazia" para quem chama.
 */
export function numeroDaCelula(valor: ValorDeCelula | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor !== 'string') return null
  const limpo = valor.trim().replace(/\s/g, '')
  if (limpo === '') return null
  // "1.234,56" é pt-BR e a vírgula manda: ponto é milhar. Sem vírgula, o ponto
  // é decimal — "83.783" volta 83,783, e não oitenta e três mil.
  //
  // A ambiguidade é real e não tem desempate: as duas leituras são possíveis
  // para esse texto. O que decide é que isto só é alcançado por célula de TEXTO,
  // e célula de texto com ponto de milhar e sem centavo não aparece em nenhuma
  // das duas planilhas — número vem como número. Escolher o decimal é escolher
  // a leitura que o resto do mundo dá ao mesmo texto.
  const normal = /,\d*$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '')
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Texto de célula, aparado. Vazio vira `null` — "não respondeu" não é "". */
export function textoDaCelula(valor: ValorDeCelula | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor).trim()
  return t === '' ? null : t
}

/** Data de célula em `YYYY-MM-DD`. Aceita serial, ISO e `DD/MM/YYYY`. */
export function dataDaCelula(valor: ValorDeCelula | undefined): string | null {
  if (typeof valor === 'number') return dataDoSerial(valor)
  const t = textoDaCelula(valor)
  if (t === null) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return t.slice(0, 10)
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  if (br) return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`
  const serial = Number(t)
  return Number.isFinite(serial) ? dataDoSerial(serial) : null
}
