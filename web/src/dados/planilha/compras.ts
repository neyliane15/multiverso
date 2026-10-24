/**
 * A planilha de entradas do ERP virando notas fiscais do módulo 3.1.
 *
 * Nada de banco aqui e nada de React: é o miolo que os testes exercitam contra
 * o arquivo de verdade. Quem grava é `paginas/compras/importarPlanilha.ts`.
 *
 * A planilha tem uma linha por ITEM e repete o cabeçalho da nota em todas elas
 * — 693 linhas para 133 notas, no arquivo de setembro de 2026. O agrupamento é
 * por `Nota_fiscal` + `Fornecedor` + `Emissao`, e não por `Nota_fiscal` só:
 * dois fornecedores podem numerar a nota 1 no mesmo mês, e o número da nota
 * não é chave de nada fora do emitente dela.
 *
 * Três coisas medidas no arquivo de setembro, que decidiram o desenho:
 *
 * 1. **`PrecoFinal` NÃO é `Qtde × Unitario`.** Em 159 das 693 linhas os dois
 *    discordam, e a diferença é o rateio de frete, despesa acessória e ICMS-ST
 *    que a nota cobrou. A soma de `PrecoFinal` fecha com `ValorTotalNota` em
 *    **133 de 133 notas**, no centavo. Então `PrecoFinal` é o desembolso da
 *    linha, e é ele que vira `nota_itens.valor_total` — a mesma decisão que
 *    `parsearXml.ts` tomou ao usar `custoDesembolsado` em vez de `vProd`.
 *    Exemplo: AMSTEL 600 ML, 360 × R$ 4,44 = R$ 1.598,40, mas a nota cobrou
 *    R$ 1.944,47. Usar `Unitario` como custo subestimaria essa linha em 18%.
 *
 * 2. **A soma dos `ValorTotalNota` distintos dá R$ 83.783,27, e a soma dos
 *    `PrecoFinal` dá R$ 83.783,29.** Dois centavos de diferença, do
 *    arredondamento do rateio por linha em 133 notas. O cabeçalho que este
 *    módulo monta soma os ITENS, não copia o `ValorTotalNota`: assim o total da
 *    nota no sistema sempre é a soma do que está dentro dela, e o total do
 *    período bate com o da planilha no centavo.
 *
 * 3. **A `Emissao` mais antiga é 26/08/2026, não 01/09.** Nota emitida em
 *    agosto e recebida em setembro é rotina, e `mv_cmv_periodo` filtra por
 *    `emitida_em`: essas notas caem no CMV de agosto. O módulo não mexe na
 *    data — avisa, com o valor, para que ninguém procure o buraco depois.
 */
import {
  exigirColunas,
  dataDaCelula,
  numeroDaCelula,
  textoDaCelula,
  type AbaDaPlanilha,
  type LinhaDePlanilha,
} from '@/dados/planilha/lerXlsx'

/** As colunas sem as quais não existe nota. O resto é enfeite e pode faltar. */
export const COLUNAS_DE_COMPRAS = [
  'Operacao',
  'Fornecedor',
  'Produto',
  'Unidade',
  'Qtde',
  'Unitario',
  'PrecoFinal',
  'Nota_fiscal',
  'Emissao',
] as const

export interface ItemDaPlanilhaDeCompras {
  /** Linha da planilha de onde ele saiu, para a tela poder apontar. */
  linha: number
  descricao: string
  unidade: string
  quantidade: number
  valorUnitario: number
  /** `PrecoFinal`: o desembolso da linha, já com frete, despesa e ST rateados. */
  valorTotal: number
  /** `Operacao` como veio. É ela que tira limpeza e descartáveis do CMV de insumo. */
  operacao: string
  classe: string | null
  grupo: string | null
}

export interface NotaDaPlanilhaDeCompras {
  /** `Nota_fiscal` + `Fornecedor` + `Emissao`, para a tela listar sem repetir. */
  chave: string
  numero: string
  fornecedorNome: string
  /** Só dígitos, como `fornecedores.documento` guarda. */
  fornecedorDocumento: string | null
  emitidaEm: string
  recebidaEm: string | null
  itens: ItemDaPlanilhaDeCompras[]
  /** Soma de `Qtde × Unitario` dos itens: a mercadoria, sem rateio. */
  valorProdutos: number
  valorFrete: number
  /** O rateio que sobrou: despesa acessória, seguro, ST, imposto. */
  valorOutros: number
  /** Quando o desembolso é MENOR que a mercadoria, a diferença é desconto. */
  valorDesconto: number
  /** Soma dos `PrecoFinal`: o que a casa pagou. */
  valorTotal: number
}

export interface PlanilhaDeCompras {
  aba: string
  notas: NotaDaPlanilhaDeCompras[]
  /** Linhas lidas (as que viraram item). */
  linhas: number
  itens: number
  /** Soma de todos os `valorTotal` — tem de bater com a planilha no centavo. */
  total: number
  somaQuantidade: number
  /** Linhas que ficaram de fora, com o motivo escrito. */
  descartadas: { linha: number; motivo: string }[]
  avisos: string[]
}

// ------------------------------------------------------------ centavos -----

/**
 * Soma em centavos, não em reais.
 *
 * `0.1 + 0.2 !== 0.3` em ponto flutuante, e 693 somas de reais acumulam o
 * erro: a prova desta importação é fechar com a planilha NO CENTAVO, e com
 * soma de `number` em reais ela fecharia em "quase". Os valores da planilha
 * têm duas casas, então somá-los em centavos é exato.
 */
export function somarDinheiro(valores: readonly number[]): number {
  let centavos = 0
  for (const valor of valores) centavos += Math.round(valor * 100)
  return centavos / 100
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

// ------------------------------------------------------------- leitura -----

function documentoLimpo(valor: string | null): string | null {
  if (valor === null) return null
  const digitos = valor.replace(/\D/g, '')
  // CNPJ tem 14 e CPF 11. Qualquer outro tamanho é lixo da exportação, e lixo
  // em `fornecedores.documento` quebraria o índice único de documento.
  return digitos.length === 14 || digitos.length === 11 ? digitos : null
}

export function lerComprasDaPlanilha(aba: AbaDaPlanilha): PlanilhaDeCompras {
  exigirColunas(aba, COLUNAS_DE_COMPRAS)

  const descartadas: { linha: number; motivo: string }[] = []
  const avisos: string[] = []
  const grupos = new Map<string, NotaDaPlanilhaDeCompras>()
  // Cabeçalho da nota que se repete em toda linha: lido uma vez, conferido nas
  // outras. Divergência vira aviso, porque a planilha é de terceiro.
  const freteDaNota = new Map<string, number>()
  const divergentes = new Set<string>()

  for (const linha of aba.linhas) {
    const item = itemDaLinha(linha, descartadas)
    if (!item) continue

    const numero = textoDaCelula(linha.valores['Nota_fiscal'])
    const fornecedor = textoDaCelula(linha.valores['Fornecedor'])
    const emissao = dataDaCelula(linha.valores['Emissao'])
    if (numero === null || fornecedor === null || emissao === null) {
      descartadas.push({
        linha: linha.numero,
        motivo: 'sem número de nota, sem fornecedor ou sem data de emissão',
      })
      continue
    }

    const chave = `${numero}|${fornecedor}|${emissao}`
    let nota = grupos.get(chave)
    if (!nota) {
      nota = {
        chave,
        numero,
        fornecedorNome: fornecedor,
        fornecedorDocumento: documentoLimpo(textoDaCelula(linha.valores['nu_cpf_cgc'])),
        emitidaEm: emissao,
        recebidaEm: dataDaCelula(linha.valores['DataEntrada']),
        itens: [],
        valorProdutos: 0,
        valorFrete: 0,
        valorOutros: 0,
        valorDesconto: 0,
        valorTotal: 0,
      }
      grupos.set(chave, nota)
      freteDaNota.set(chave, numeroDaCelula(linha.valores['vl_frete']) ?? 0)
    } else {
      const frete = numeroDaCelula(linha.valores['vl_frete']) ?? 0
      if (frete !== freteDaNota.get(chave)) divergentes.add(chave)
    }
    nota.itens.push(item)
  }

  const notas = [...grupos.values()].sort(
    (a, b) => a.emitidaEm.localeCompare(b.emitidaEm) || a.numero.localeCompare(b.numero),
  )

  for (const nota of notas) {
    nota.valorTotal = somarDinheiro(nota.itens.map((i) => i.valorTotal))
    nota.valorProdutos = arredondar(
      nota.itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitario, 0),
      4,
    )
    nota.valorFrete = freteDaNota.get(nota.chave) ?? 0
    const sobra = arredondar(nota.valorTotal - nota.valorProdutos - nota.valorFrete, 4)
    // O desembolso maior que a mercadoria é rateio de imposto e despesa; menor
    // é desconto. Jogar os dois em `valor_outros` deixaria a coluna negativa, e
    // negativo em "outras despesas" não quer dizer nada para quem lê a nota.
    nota.valorOutros = sobra > 0 ? sobra : 0
    nota.valorDesconto = sobra < 0 ? -sobra : 0
  }

  for (const chave of divergentes) {
    const nota = grupos.get(chave)
    avisos.push(
      `A nota ${nota?.numero} traz frete diferente em linhas diferentes; usei o da primeira linha.`,
    )
  }

  const total = somarDinheiro(notas.map((n) => n.valorTotal))
  const itens = notas.reduce((soma, n) => soma + n.itens.length, 0)
  const somaQuantidade = arredondar(
    notas.reduce((soma, n) => soma + n.itens.reduce((s, i) => s + i.quantidade, 0), 0),
    4,
  )

  // A data manda no CMV: `mv_cmv_periodo` soma a nota pela EMISSÃO. Nota
  // emitida fora do mês da planilha não é erro — é fato, e tem de ser dito.
  const porMes = new Map<string, number>()
  for (const nota of notas) {
    const mes = nota.emitidaEm.slice(0, 7)
    porMes.set(mes, somarDinheiro([porMes.get(mes) ?? 0, nota.valorTotal]))
  }
  if (porMes.size > 1) {
    const ordenados = [...porMes.entries()].sort((a, b) => b[1] - a[1])
    const principal = ordenados[0]?.[0]
    const fora = ordenados.filter(([mes]) => mes !== principal)
    avisos.push(
      `As notas desta planilha estão emitidas em ${porMes.size} meses diferentes. ` +
        `O CMV soma a compra pela data de EMISSÃO, então ` +
        fora
          .map(([mes, valor]) => `${formatarMes(mes)} fica com ${formatarReais(valor)}`)
          .join(' e ') +
        `, fora do mês principal (${formatarMes(principal ?? '')}).`,
    )
  }

  if (descartadas.length > 0) {
    avisos.push(
      `${descartadas.length} ${descartadas.length === 1 ? 'linha' : 'linhas'} da planilha ` +
        'não viraram item e estão listadas abaixo com o motivo.',
    )
  }

  return {
    aba: aba.nome,
    notas,
    linhas: aba.linhas.length,
    itens,
    total,
    somaQuantidade,
    descartadas,
    avisos,
  }
}

function itemDaLinha(
  linha: LinhaDePlanilha,
  descartadas: { linha: number; motivo: string }[],
): ItemDaPlanilhaDeCompras | null {
  const descricao = textoDaCelula(linha.valores['Produto'])
  if (descricao === null) {
    descartadas.push({ linha: linha.numero, motivo: 'sem nome de produto' })
    return null
  }

  const quantidade = numeroDaCelula(linha.valores['Qtde'])
  const valorTotal = numeroDaCelula(linha.valores['PrecoFinal'])
  if (quantidade === null || valorTotal === null) {
    descartadas.push({
      linha: linha.numero,
      motivo: `"${descricao}" sem quantidade ou sem valor`,
    })
    return null
  }
  // `nota_itens.quantidade` tem `check (quantidade >= 0)`, e quantidade zero
  // faria `custo_convertido` virar zero — o que apagaria o custo do insumo na
  // hora de lançar. Devolução vem como linha negativa em alguns ERPs: ela sai
  // daqui com o motivo escrito, em vez de entrar e zerar um custo.
  if (quantidade <= 0) {
    descartadas.push({
      linha: linha.numero,
      motivo: `"${descricao}" veio com quantidade ${quantidade}; o sistema não lança entrada sem quantidade`,
    })
    return null
  }

  return {
    linha: linha.numero,
    descricao,
    unidade: textoDaCelula(linha.valores['Unidade']) ?? 'UND',
    quantidade,
    valorUnitario: numeroDaCelula(linha.valores['Unitario']) ?? 0,
    valorTotal,
    operacao: textoDaCelula(linha.valores['Operacao']) ?? '',
    classe: textoDaCelula(linha.valores['Classe']),
    grupo: textoDaCelula(linha.valores['Grupo']),
  }
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function formatarMes(mes: string): string {
  const [ano, numero] = mes.split('-')
  const nome = MESES[Number(numero) - 1]
  return nome === undefined ? mes : `${nome} de ${ano}`
}

function formatarReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
