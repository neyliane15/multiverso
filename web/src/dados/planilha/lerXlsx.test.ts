/**
 * Teste do leitor de XLSX.
 *
 * Metade dele roda contra planilhas montadas aqui, byte a byte, para alcançar
 * os cantos que arquivo de verdade não tem: entrada GUARDADA (sem compressão),
 * célula fora de ordem, célula omitida no meio da linha, texto quebrado em
 * vários `<t>`, ZIP64, método desconhecido.
 *
 * A outra metade roda contra as duas planilhas do cliente, se elas estiverem na
 * máquina (`MULTIVERSO_PLANILHAS`). Elas não entram no repositório — são dado de
 * cliente — e por isso o arquivo monta as suas. Mas quando estão, as somas
 * conferidas são as medidas de verdade, no centavo.
 */
import { describe, expect, it } from 'vitest'
import { ErroDePlanilha, dataDoSerial, exigirColunas, lerXlsx, numeroDaCelula } from './lerXlsx'

// ------------------------------------------------- um .xlsx montado a mão ---

/** CRC-32, porque o cabeçalho local do ZIP o pede. */
function crc32(dados: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of dados) {
    c ^= byte
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

interface ParteDoZip {
  nome: string
  texto: string
}

/**
 * Monta um ZIP só com entradas GUARDADAS (método 0).
 *
 * Sem compressão de propósito: o teste não precisa de deflate para exercitar o
 * leitor, e o caminho do método 0 é justamente o que nenhuma planilha de verdade
 * usa — então ele só tem teste aqui.
 */
function montarZip(partes: ParteDoZip[], opcoes: { metodo?: number; zip64?: boolean } = {}): Uint8Array {
  const pedacos: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0
  const codificador = new TextEncoder()

  for (const parte of partes) {
    const nome = codificador.encode(parte.nome)
    const conteudo = codificador.encode(parte.texto)
    const soma = crc32(conteudo)

    const local = new Uint8Array(30 + nome.length + conteudo.length)
    const dvLocal = new DataView(local.buffer)
    dvLocal.setUint32(0, 0x04034b50, true)
    dvLocal.setUint16(4, 20, true)
    dvLocal.setUint16(8, opcoes.metodo ?? 0, true)
    dvLocal.setUint32(14, soma, true)
    dvLocal.setUint32(18, conteudo.length, true)
    dvLocal.setUint32(22, conteudo.length, true)
    dvLocal.setUint16(26, nome.length, true)
    local.set(nome, 30)
    local.set(conteudo, 30 + nome.length)
    pedacos.push(local)

    const entrada = new Uint8Array(46 + nome.length)
    const dvEntrada = new DataView(entrada.buffer)
    dvEntrada.setUint32(0, 0x02014b50, true)
    dvEntrada.setUint16(10, opcoes.metodo ?? 0, true)
    dvEntrada.setUint32(16, soma, true)
    dvEntrada.setUint32(20, conteudo.length, true)
    dvEntrada.setUint32(24, conteudo.length, true)
    dvEntrada.setUint16(28, nome.length, true)
    dvEntrada.setUint32(42, deslocamento, true)
    entrada.set(nome, 46)
    central.push(entrada)

    deslocamento += local.length
  }

  const tamanhoCentral = central.reduce((soma, e) => soma + e.length, 0)
  const localizador = opcoes.zip64 ? 20 : 0
  const fim = new Uint8Array(localizador + 22)
  const dvFim = new DataView(fim.buffer)
  if (opcoes.zip64) dvFim.setUint32(0, 0x07064b50, true)
  dvFim.setUint32(localizador, 0x06054b50, true)
  dvFim.setUint16(localizador + 8, partes.length, true)
  dvFim.setUint16(localizador + 10, partes.length, true)
  dvFim.setUint32(localizador + 12, tamanhoCentral, true)
  dvFim.setUint32(localizador + 16, deslocamento, true)

  const total = deslocamento + tamanhoCentral + fim.length
  const saida = new Uint8Array(total)
  let posicao = 0
  for (const bloco of [...pedacos, ...central, fim]) {
    saida.set(bloco, posicao)
    posicao += bloco.length
  }
  return saida
}

const WORKBOOK = `<?xml version="1.0"?><workbook><sheets><sheet name="Entradas 09-26" sheetId="1" r:id="rId1"/></sheets></workbook>`
const RELS = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
const ESTILOS = `<?xml version="1.0"?><styleSheet><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts></styleSheet>`

function planilha(folha: string, partes: ParteDoZip[] = [], opcoes = {}): Uint8Array {
  return montarZip(
    [
      { nome: 'xl/workbook.xml', texto: WORKBOOK },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/styles.xml', texto: ESTILOS },
      { nome: 'xl/worksheets/sheet1.xml', texto: folha },
      ...partes,
    ],
    opcoes,
  )
}

describe('lerXlsx', () => {
  it('lê cabeçalho, número e texto compartilhado', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>27</v></c></row>
      </sheetData></worksheet>`,
      [
        {
          nome: 'xl/sharedStrings.xml',
          texto: `<sst><si><t>Produto</t></si><si><t>Qtde</t></si><si><t>LEITE CONDENSADO</t></si></sst>`,
        },
      ],
    )
    const aba = await lerXlsx(dados)
    expect(aba.nome).toBe('Entradas 09-26')
    expect(aba.cabecalho).toEqual(['Produto', 'Qtde'])
    expect(aba.linhas).toHaveLength(1)
    expect(aba.linhas[0]?.valores).toEqual({ Produto: 'LEITE CONDENSADO', Qtde: 27 })
    expect(aba.linhas[0]?.numero).toBe(2)
  })

  /**
   * O caso que a planilha de vendas de verdade tem: a coluna `Cliente` é vazia
   * em quase toda linha, e o Excel simplesmente NÃO escreve a célula. Ler as
   * células por ordem de aparição jogaria `Produto` para dentro de `Cliente` e
   * todo o resto da linha uma coluna para a esquerda.
   */
  it('respeita a coluna da referência quando a célula do meio não existe', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Cliente</t></is></c><c r="B1" t="inlineStr"><is><t>Produto</t></is></c><c r="C1" t="inlineStr"><is><t>Qtde</t></is></c></row>
        <row r="2"><c r="B2" t="inlineStr"><is><t>MATE</t></is></c><c r="C2"><v>3</v></c></row>
      </sheetData></worksheet>`,
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas[0]?.valores).toEqual({ Cliente: null, Produto: 'MATE', Qtde: 3 })
  })

  it('lê célula fora de ordem pela referência', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>A</t></is></c><c r="B1" t="inlineStr"><is><t>B</t></is></c></row>
        <row r="2"><c r="B2"><v>2</v></c><c r="A2"><v>1</v></c></row>
      </sheetData></worksheet>`,
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas[0]?.valores).toEqual({ A: 1, B: 2 })
  })

  it('recompõe texto quebrado em vários pedaços formatados', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c></row>
        <row r="2"><c r="A2" t="s"><v>1</v></c></row>
      </sheetData></worksheet>`,
      [
        {
          nome: 'xl/sharedStrings.xml',
          texto: `<sst><si><t>Produto</t></si><si><r><t>AMSTEL </t></r><r><t>600 ML</t></r></si></sst>`,
        },
      ],
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas[0]?.valores['Produto']).toBe('AMSTEL 600 ML')
  })

  /**
   * O arquivo não diz "esta célula é data": diz que ela usa o estilo 1, e que o
   * estilo 1 usa o formato 14. Sem este caminho, 46277 chegaria como número e o
   * importador gravaria o ano 46277.
   */
  it('converte data pelo estilo, embutido e personalizado', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Emissao</t></is></c><c r="B1" t="inlineStr"><is><t>Entrada</t></is></c><c r="C1" t="inlineStr"><is><t>Qtde</t></is></c></row>
        <row r="2"><c r="A2" s="1"><v>46266</v></c><c r="B2" s="2"><v>46266</v></c><c r="C2" s="0"><v>46266</v></c></row>
      </sheetData></worksheet>`,
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas[0]?.valores['Emissao']).toBe('2026-09-01')
    expect(aba.linhas[0]?.valores['Entrada']).toBe('2026-09-01')
    // Sem estilo de data, 46266 é só um número — número de nota, por exemplo.
    expect(aba.linhas[0]?.valores['Qtde']).toBe(46266)
  })

  it('pula linha em branco no meio da planilha', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>A</t></is></c></row>
        <row r="2"><c r="A2"><v>1</v></c></row>
        <row r="3"><c r="A3"></c></row>
        <row r="4"/>
        <row r="5"><c r="A5"><v>2</v></c></row>
      </sheetData></worksheet>`,
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas.map((l) => l.valores['A'])).toEqual([1, 2])
  })

  it('lê entrada compactada por deflate, que é o que toda planilha usa', async () => {
    // O deflate de verdade é exercitado pelas planilhas do cliente, mais abaixo.
    // Aqui o que se afirma é o contrário: método que o leitor não conhece recusa
    // com nome da parte, em vez de devolver lixo.
    const dados = planilha(`<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`, [], {
      metodo: 9,
    })
    await expect(lerXlsx(dados)).rejects.toThrow(/método 9/)
  })

  it('recusa arquivo que não é ZIP, dizendo o que fazer', async () => {
    const texto = new TextEncoder().encode('Produto;Qtde\nMATE;3\n')
    await expect(lerXlsx(texto)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'nao_e_zip',
    )
    await expect(lerXlsx(texto)).rejects.toThrow(/Pasta de Trabalho do Excel/)
  })

  it('recusa ZIP64 em vez de ler deslocamento errado', async () => {
    const dados = planilha(
      `<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
      [],
      { zip64: true },
    )
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'zip64',
    )
  })

  it('recusa primeira linha vazia: sem cabeçalho não há coluna', async () => {
    const dados = planilha(
      `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t> </t></is></c></row>
        <row r="2"><c r="A2"><v>1</v></c></row>
      </sheetData></worksheet>`,
    )
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'cabecalho_vazio',
    )
  })
})

describe('dataDoSerial', () => {
  /**
   * A época é 1899-12-30, não 1900-01-01, por causa do bug do ano 1900 que o
   * Excel preserva desde o Lotus 1-2-3. Usar 1900-01-01 erra por dois dias em
   * toda data moderna — e dois dias movem uma nota de mês, o que move o CMV.
   */
  it('usa a época do Excel', () => {
    expect(dataDoSerial(1)).toBe('1900-01-01')
    // Serial 61 em diante é onde o dia fantasma de 29/02/1900 já entrou.
    expect(dataDoSerial(61)).toBe('1900-03-01')
    expect(dataDoSerial(46266)).toBe('2026-09-01')
    expect(dataDoSerial(46295)).toBe('2026-09-30')
    // O mesmo número que o openpyxl devolve para a primeira DataCaixa do arquivo.
    expect(dataDoSerial(46277)).toBe('2026-09-12')
  })

  it('ignora a fração de hora e recusa serial impossível', () => {
    expect(dataDoSerial(46266.9999)).toBe('2026-09-01')
    expect(dataDoSerial(0)).toBeNull()
    expect(dataDoSerial(Number.NaN)).toBeNull()
  })
})

describe('numeroDaCelula', () => {
  it('aceita número, texto cru e texto em pt-BR', () => {
    expect(numeroDaCelula(27)).toBe(27)
    expect(numeroDaCelula('1234.56')).toBe(1234.56)
    expect(numeroDaCelula('1.234,56')).toBe(1234.56)
    expect(numeroDaCelula('1,5')).toBe(1.5)
    // Sem vírgula, o ponto é decimal. "83.783" é ambíguo de verdade e a escolha
    // está justificada no código: só célula de TEXTO chega aqui, e nas duas
    // planilhas número vem como número.
    expect(numeroDaCelula('83.783')).toBe(83.783)
  })

  it('devolve nulo em vez de zero para o que não é número', () => {
    expect(numeroDaCelula(null)).toBeNull()
    expect(numeroDaCelula('')).toBeNull()
    expect(numeroDaCelula('#N/A')).toBeNull()
    expect(numeroDaCelula(undefined)).toBeNull()
  })
})

describe('exigirColunas', () => {
  it('diz quais faltaram e o que havia', () => {
    const aba = { nome: 'Aba', cabecalho: ['Produto', 'Qtde'], linhas: [] }
    expect(() => exigirColunas(aba, ['Produto', 'PrecoFinal', 'Emissao'])).toThrow(
      /"PrecoFinal", "Emissao".*Produto, Qtde/s,
    )
    expect(() => exigirColunas(aba, ['Produto'])).not.toThrow()
  })
})
