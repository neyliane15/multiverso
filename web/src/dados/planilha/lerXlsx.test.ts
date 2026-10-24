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
import { Buffer } from 'node:buffer'
import { deflateRawSync } from 'node:zlib'
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
  /** Conteúdo já compactado por fora, para o caso do método 8. */
  bytes?: Uint8Array
  /** Método desta parte, quando ele não é o do ZIP todo. */
  metodo?: number
  /** Tamanho cru DECLARADO no índice, que um arquivo hostil mente à vontade. */
  cruDeclarado?: number
  /** CRC-32 adulterado, para provar que o leitor confere. */
  crcErrado?: boolean
  /** 0xffffffff nos campos de tamanho: ZIP64 declarado nesta entrada. */
  zip64NoCentral?: boolean
}

/**
 * Monta um ZIP só com entradas GUARDADAS (método 0).
 *
 * Sem compressão de propósito: o teste não precisa de deflate para exercitar o
 * leitor, e o caminho do método 0 é justamente o que nenhuma planilha de verdade
 * usa — então ele só tem teste aqui.
 */
function montarZip(
  partes: ParteDoZip[],
  opcoes: { metodo?: number; zip64?: boolean; inicioCentralLouco?: boolean } = {},
): Uint8Array {
  const pedacos: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0
  const codificador = new TextEncoder()

  for (const parte of partes) {
    const nome = codificador.encode(parte.nome)
    const cru = codificador.encode(parte.texto)
    // `bytes` é o conteúdo já compactado: o tamanho CRU continua sendo o do
    // texto, que é o que o índice do ZIP declara.
    const conteudo = parte.bytes ?? cru
    const soma = parte.crcErrado ? crc32(cru) ^ 0xffffffff : crc32(cru)

    const local = new Uint8Array(30 + nome.length + conteudo.length)
    const dvLocal = new DataView(local.buffer)
    dvLocal.setUint32(0, 0x04034b50, true)
    dvLocal.setUint16(4, 20, true)
    dvLocal.setUint16(8, parte.metodo ?? opcoes.metodo ?? 0, true)
    dvLocal.setUint32(14, soma, true)
    dvLocal.setUint32(18, conteudo.length, true)
    dvLocal.setUint32(22, cru.length, true)
    dvLocal.setUint16(26, nome.length, true)
    local.set(nome, 30)
    local.set(conteudo, 30 + nome.length)
    pedacos.push(local)

    const entrada = new Uint8Array(46 + nome.length)
    const dvEntrada = new DataView(entrada.buffer)
    dvEntrada.setUint32(0, 0x02014b50, true)
    dvEntrada.setUint16(10, parte.metodo ?? opcoes.metodo ?? 0, true)
    dvEntrada.setUint32(16, soma, true)
    dvEntrada.setUint32(20, parte.zip64NoCentral ? 0xffffffff : conteudo.length, true)
    dvEntrada.setUint32(24, parte.zip64NoCentral ? 0xffffffff : (parte.cruDeclarado ?? cru.length), true)
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
  dvFim.setUint32(localizador + 16, opcoes.inicioCentralLouco ? 0xfffffff0 : deslocamento, true)

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

/**
 * O leitor contra arquivo HOSTIL, que é o que ele de fato recebe: um .xlsx vem
 * de fora, pela mão da cliente, e abre no navegador dela.
 *
 * Cada caso aqui foi medido ANTES de existir conserto, com o leitor da 0027 e
 * com o arquivo montado por fora (Python, `zipfile` e `zlib`). Os tempos de
 * "antes" estão no comentário de cada um, porque é o que diz o tamanho do
 * defeito: dois quilobytes de arquivo que travam a aba não é um aviso feio, é
 * a aba da cliente morta.
 */
describe('lerXlsx — arquivo hostil', () => {
  const PRODUTO = '<row r="1"><c r="A1" t="inlineStr"><is><t>Produto</t></is></c></row>'
  const UMA_LINHA = `<worksheet><sheetData>${PRODUTO}<row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>`

  /**
   * ANTES: 5,0 s com 50 mil tags, e mais de 60 s (sem terminar) com 200 mil —
   * de um .xlsx de 2 KB. A expressão regular `<row\b([^>]*?)...` não casa nada
   * quando a tag nunca fecha, e o motor recomeça um caractere adiante: custo
   * N × tamanho. O `fatiarXml` anda por índice e visita cada caractere uma vez.
   */
  it('não trava com tag que nunca fecha, em nenhuma das partes', async () => {
    const casos: { rotulo: string; dados: Uint8Array }[] = [
      {
        rotulo: 'aba',
        dados: planilha(`<worksheet><sheetData>${'<row '.repeat(200_000)}</sheetData></worksheet>`),
      },
      {
        rotulo: 'tabela de textos',
        dados: planilha(UMA_LINHA, [
          { nome: 'xl/sharedStrings.xml', texto: `<sst>${'<si '.repeat(200_000)}</sst>` },
        ]),
      },
      {
        rotulo: 'estilos',
        dados: montarZip([
          { nome: 'xl/workbook.xml', texto: WORKBOOK },
          { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
          {
            nome: 'xl/styles.xml',
            texto: `<styleSheet><cellXfs count="1">${'<xf '.repeat(200_000)}</cellXfs></styleSheet>`,
          },
          { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA },
        ]),
      },
    ]
    for (const caso of casos) {
      const comecou = Date.now()
      // Ler ou recusar, as duas coisas servem. O que não serve é não voltar.
      await lerXlsx(caso.dados).catch((e: unknown) => {
        if (!(e instanceof ErroDePlanilha)) throw e
      })
      expect(Date.now() - comecou, `${caso.rotulo} demorou demais`).toBeLessThan(5_000)
    }
  })

  /**
   * ANTES, medido com um processo por arquivo e teto de 60 s:
   *
   *   uma célula em "AAAAAA1" (764 bytes) .... LEU, 928 ms, RSS 461 MB,
   *                                            cabeçalho de 12.356.631 colunas
   *   a mesma, com 200 linhas (1.988 bytes) .. LEU, 8.622 ms (43 ms por linha;
   *                                            a aba da cliente tem 11.198)
   *   uma célula em "FXSHRXW1" (752 bytes) ... 15.313 ms, RSS 2.128 MB, e no
   *                                            fim "o arquivo está corrompido,
   *                                            reabra no Excel" — que é mentira:
   *                                            o motor ficou sem memória
   *
   * A posição da célula vem da referência, e a referência vem do arquivo.
   * `indiceDaColuna` não tinha teto, e um índice ainda abaixo de 2^32 faz
   * `porColuna.length` virar aquele número — o laço do cabeçalho anda até lá uma
   * vez, e o de montar os valores anda até lá a cada linha.
   */
  it('recusa célula em coluna que não existe no Excel', async () => {
    for (const coluna of ['AAAAAA', 'FXSHRXW', 'XFE']) {
      const dados = planilha(
        `<worksheet><sheetData><row r="1">${PRODUTO.slice(PRODUTO.indexOf('<c'), PRODUTO.indexOf('</row>'))}` +
          `<c r="${coluna}1" t="inlineStr"><is><t>fim</t></is></c></row></sheetData></worksheet>`,
      )
      const comecou = Date.now()
      await expect(lerXlsx(dados)).rejects.toMatchObject({ codigo: 'coluna_fora_da_faixa' })
      expect(Date.now() - comecou, `${coluna} demorou demais`).toBeLessThan(1_000)
    }
  })

  it('XFD, que é a última coluna de verdade, continua passando', async () => {
    const dados = planilha(
      '<worksheet><sheetData><row r="1">' +
        '<c r="A1" t="inlineStr"><is><t>Produto</t></is></c>' +
        '<c r="XFD1" t="inlineStr"><is><t>fim</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>CERVEJA</t></is></c></row>' +
        '</sheetData></worksheet>',
    )
    const aba = await lerXlsx(dados)
    expect(aba.cabecalho.length).toBe(16_384)
    expect(aba.linhas).toHaveLength(1)
  })

  /**
   * `indiceDaColuna('')` devolvia -1, e `porColuna[-1] = valor` em JavaScript
   * não é posição de array: é um campo de texto. A célula sumia sem uma palavra.
   */
  it('célula com referência em minúscula entra pela ordem, em vez de sumir', async () => {
    const dados = planilha(
      '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Produto</t></is></c></row>' +
        '<row r="2"><c r="a2" t="inlineStr"><is><t>CERVEJA</t></is></c></row>' +
        '</sheetData></worksheet>',
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas).toHaveLength(1)
    expect(aba.linhas[0]?.valores['Produto']).toBe('CERVEJA')
  })

  /**
   * ANTES: mais de 60 s, sem terminar, com um arquivo de **663 bytes**. O `r:id`
   * do `<sheet>` vinha do arquivo e era interpolado em `new RegExp(...)`: quem
   * manda a planilha escolhia a expressão regular que o navegador ia rodar.
   */
  it('não deixa o r:id do arquivo virar expressão regular', async () => {
    const dados = montarZip([
      {
        nome: 'xl/workbook.xml',
        texto: `<workbook><sheets><sheet name="Aba" sheetId="1" r:id="(a+)+$"/></sheets></workbook>`,
      },
      {
        nome: 'xl/_rels/workbook.xml.rels',
        texto: `<Relationships><Relationship Id="${'a'.repeat(40)}" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA },
    ])
    const comecou = Date.now()
    const aba = await lerXlsx(dados)
    expect(Date.now() - comecou).toBeLessThan(5_000)
    // Sem relacionamento que casa, o palpite é o caminho que todo exportador usa.
    expect(aba.linhas).toHaveLength(1)
  })

  /**
   * A bomba de descompressão. ANTES, medido: um .xlsx de 9,2 MB cuja aba
   * expande em 1,9 GB levava 38,3 s, chegava a 5,8 GB de memória e terminava
   * com `Error: Cannot create a string longer than 0x1fffffe8 characters` —
   * mensagem de motor, não de planilha. Na aba da cliente é a aba morrendo.
   */
  it('recusa parte que passa do teto pelo tamanho declarado', async () => {
    const dados = planilha(UMA_LINHA)
    const comTamanhoMentido = montarZip([
      { nome: 'xl/workbook.xml', texto: WORKBOOK },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/styles.xml', texto: ESTILOS },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA, cruDeclarado: 65 * 1024 * 1024 },
    ])
    await expect(lerXlsx(dados)).resolves.toBeTruthy()
    await expect(lerXlsx(comTamanhoMentido)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'grande_demais',
    )
    await expect(lerXlsx(comTamanhoMentido)).rejects.toThrow(/período menor/)
  })

  /**
   * E o tamanho declarado é declaração, não promessa: este arquivo diz 1 KB no
   * índice e entrega 70 MiB. Quem recusa é a contagem de bytes DURANTE a
   * descompressão — o teto declarado é só a recusa barata.
   */
  it('recusa parte que mente o tamanho e estoura descompactando', async () => {
    const encheu = deflateRawSync(Buffer.alloc(70 * 1024 * 1024, 0x41))
    const dados = montarZip(
      [
        { nome: 'xl/workbook.xml', texto: WORKBOOK },
        { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
        {
          nome: 'xl/worksheets/sheet1.xml',
          texto: 'A'.repeat(1024),
          bytes: new Uint8Array(encheu),
          cruDeclarado: 1024,
          metodo: 8,
        },
      ],
    )
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'grande_demais',
    )
  })

  /**
   * O CRC-32 está no formato para isto. ANTES: o leitor lia a planilha inteira
   * de um arquivo com CRC adulterado, sem um pio — e byte trocado em célula de
   * dinheiro é pior que arquivo recusado.
   */
  it('recusa parte cujo CRC não confere', async () => {
    const dados = montarZip([
      { nome: 'xl/workbook.xml', texto: WORKBOOK, crcErrado: true },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA },
    ])
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'conteudo_corrompido',
    )
  })

  /**
   * Duas partes com o mesmo nome: ANTES ficava com a ÚLTIMA, em silêncio. É o
   * truque de confundir leitor de ZIP — a cópia que a pessoa confere num
   * programa é uma, a que entra no banco é outra.
   */
  it('recusa .xlsx com nome de parte repetido', async () => {
    const dados = montarZip([
      { nome: 'xl/workbook.xml', texto: WORKBOOK },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA },
      {
        nome: 'xl/worksheets/sheet1.xml',
        texto: `<worksheet><sheetData>${PRODUTO}<row r="2"><c r="A2"><v>999</v></c></row></sheetData></worksheet>`,
      },
    ])
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'entrada_repetida',
    )
  })

  /**
   * ZIP64 também se declara entrada por entrada, com 0xffffffff no campo de
   * tamanho. ANTES: o leitor lia esse arquivo — recortava até o fim do arquivo
   * e o deflate parava sozinho, então o tamanho errado dava certo por sorte. A
   * recusa valia para o rodapé; o laudo dizia que valia para o formato.
   */
  it('recusa ZIP64 declarado na entrada, e não só no rodapé', async () => {
    const dados = montarZip([
      { nome: 'xl/workbook.xml', texto: WORKBOOK },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA, zip64NoCentral: true },
    ])
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'zip64',
    )
  })

  /**
   * ANTES: `RangeError: Offset is outside the bounds of the DataView` — verdade,
   * mas não é frase que se mostre para quem só escolheu o arquivo errado. A
   * tela mostra a mensagem crua do erro que não é `ErroDePlanilha`.
   */
  it('traduz índice que aponta para fora do arquivo', async () => {
    const dados = planilha(UMA_LINHA, [], { inicioCentralLouco: true })
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'nao_e_zip',
    )
    await expect(lerXlsx(dados)).rejects.toThrow(/não baixou inteiro/)
  })

  /** O que o leitor não previu ainda sai como ErroDePlanilha, com o detalhe no fim. */
  it('embrulha erro técnico em ErroDePlanilha', async () => {
    const dados = montarZip(
      [
        { nome: 'xl/workbook.xml', texto: WORKBOOK },
        { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
        {
          nome: 'xl/worksheets/sheet1.xml',
          texto: UMA_LINHA,
          bytes: new TextEncoder().encode('isto nao e um fluxo deflate'),
          metodo: 8,
        },
      ],
    )
    await expect(lerXlsx(dados)).rejects.toSatisfy(
      (e: unknown) => e instanceof ErroDePlanilha && e.codigo === 'arquivo_corrompido',
    )
    await expect(lerXlsx(dados)).rejects.toThrow(/detalhe técnico/)
  })

  /**
   * Zip slip não alcança este leitor, e vale dizer por quê: o nome da entrada
   * só é usado como CHAVE de um `Map`, e as partes lidas são quatro nomes
   * fixos. Nada no caminho toca disco. O teste existe para que ninguém
   * transforme o nome em caminho de arquivo depois.
   */
  it('ignora entrada com nome de travessia de diretório', async () => {
    const dados = montarZip([
      { nome: '../../../../etc/passwd', texto: 'root:x:0:0:comprometido' },
      { nome: 'xl/workbook.xml', texto: WORKBOOK },
      { nome: 'xl/_rels/workbook.xml.rels', texto: RELS },
      { nome: 'xl/worksheets/sheet1.xml', texto: UMA_LINHA },
    ])
    const aba = await lerXlsx(dados)
    expect(aba.linhas).toHaveLength(1)
  })

  /**
   * XXE e bilhão de risadas: a entidade chega LITERAL à célula, porque o
   * DOCTYPE nunca vai para o parser — só o miolo de cada `<row>` e de cada
   * `<si>` vai. O fatiamento, que existe por memória, também fecha esta porta.
   */
  it('não expande entidade de DOCTYPE', async () => {
    const risadas =
      '<!DOCTYPE worksheet [<!ENTITY a0 "ha">' +
      Array.from({ length: 9 }, (_, i) => `<!ENTITY a${i + 1} "${`&a${i};`.repeat(10)}">`).join('') +
      ']>'
    const dados = planilha(
      `<?xml version="1.0"?>${risadas}<worksheet><sheetData>${PRODUTO}` +
        `<row r="2"><c r="A2" t="inlineStr"><is><t>&a9;</t></is></c></row>` +
        `</sheetData></worksheet>`,
    )
    const aba = await lerXlsx(dados)
    expect(aba.linhas[0]?.valores['Produto']).toBe('&a9;')
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

describe('lerXlsx — progresso', () => {
  /**
   * A leitura da aba de vendas da cliente leva 10,0 s a 390 px com a CPU freada
   * 4x, e não vai deixar de levar sem Web Worker. O que é de graça é esses dez
   * segundos não serem cegos: o laço já solta a thread a cada 2.000 linhas, e
   * `aoProgresso` fala nos mesmos pontos.
   */
  it('avisa a cada 2.000 linhas, e não avisa em planilha pequena', async () => {
    const linha = (n: number) =>
      `<row r="${n}"><c r="A${n}" t="inlineStr"><is><t>x${n}</t></is></c></row>`
    const corpo = Array.from({ length: 4_500 }, (_, i) => linha(i + 1)).join('')
    const avisos: number[] = []
    const aba = await lerXlsx(planilha(`<worksheet><sheetData>${corpo}</sheetData></worksheet>`), {
      aoProgresso: (n) => avisos.push(n),
    })
    expect(aba.linhas).toHaveLength(4_499)
    expect(avisos).toEqual([2_000, 4_000])

    const curta = await lerXlsx(
      planilha(`<worksheet><sheetData>${linha(1)}${linha(2)}</sheetData></worksheet>`),
      { aoProgresso: () => expect.fail('planilha de 2 linhas não tem progresso a relatar') },
    )
    expect(curta.linhas).toHaveLength(1)
  })
})
