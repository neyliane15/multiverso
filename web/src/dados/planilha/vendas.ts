/**
 * A planilha de faturamento do PDV virando um lançamento de vendas do módulo 2.
 *
 * Sem banco e sem React: o miolo que os testes exercitam contra o arquivo de
 * verdade. Quem grava é `paginas/contagem/importarPlanilhaDeVendas.ts`.
 *
 * **O arquivo de setembro de 2026 tem 11.198 linhas para 136 produtos.** Uma
 * linha é um item de cupom — a mesma cerveja aparece 3.063 vezes. Mandar 11.198
 * requisições, ou gravar 11.198 linhas de `venda_itens`, seria transformar um
 * relatório de 136 itens num banco de 11 mil. Então a agregação acontece AQUI,
 * antes de qualquer gravação: uma linha por produto, por período.
 *
 * O que foi medido no arquivo, e o que isso decidiu:
 *
 * 1. **`PrecoFinal` já é líquido do desconto.** Nas 11.198 linhas, sem uma
 *    exceção: `Qtde × Unitario − DescontoTotalRateado = PrecoFinal`, na
 *    tolerância de um centavo. Em números: bruto R$ 272.487,22, desconto
 *    R$ 17.069,44, `PrecoFinal` R$ 255.417,78 — e 272.487,22 − 17.069,44 dá
 *    exatamente 255.417,78. **Subtrair o desconto de novo tiraria R$ 17.069,44
 *    do faturamento (6,7%)** e inflaria o CMV% na mesma proporção. São 748
 *    linhas com desconto; `ValorUnitarioTabela` é igual a `Unitario` em todas,
 *    então nem por aí haveria outra conta.
 *
 * 2. **A data é `DataCaixa`, não `Emissao`.** Venda do dia 12 fechada depois da
 *    meia-noite sai com `Emissao` 13/09 — e são 28 datas de emissão contra 26
 *    de caixa. Quem decide em que dia o bar vendeu é o caixa; a emissão é
 *    carimbo de impressora fiscal. `DataCaixa` não tem vazio no arquivo.
 *
 * 3. **O quanto é medido, o preço unitário é derivado.** `venda_itens.total` é
 *    coluna gerada (`quantidade × preco_unitario`), e nenhum preço unitário com
 *    quatro casas reproduz R$ 16.633,21 em 3.063 unidades: a conta sai com 11
 *    centavos de erro. O dinheiro do PDV é fato medido, não produto de dois
 *    outros números — por isso ele vai para `venda_itens.valor_total_origem`, e
 *    o `preco_unitario` fica sendo o que ele é: uma média para a tela ler.
 */
import {
  exigirColunas,
  dataDaCelula,
  numeroDaCelula,
  textoDaCelula,
  type AbaDaPlanilha,
} from '@/dados/planilha/lerXlsx'
import { somarDinheiro } from '@/dados/planilha/compras'

export const COLUNAS_DE_VENDAS = [
  'Produto',
  'Unidade',
  'Qtde',
  'Unitario',
  'DescontoTotalRateado',
  'PrecoFinal',
  'DataCaixa',
] as const

export interface ItemDaPlanilhaDeVendas {
  /** O nome como o PDV escreve. É a chave do de-para e o que a tela mostra. */
  descricao: string
  unidade: string
  /** Soma das quantidades do período. */
  quantidade: number
  /** Soma dos `PrecoFinal`: o faturamento do item, já líquido de desconto. */
  valorTotal: number
  /** Soma de `Qtde × Unitario`: o faturamento antes do desconto. */
  valorBruto: number
  /** Soma de `DescontoTotalRateado`. Guardado para a conferência, nunca subtraído. */
  valorDesconto: number
  /** Quantas linhas de cupom foram somadas aqui. */
  linhas: number
  /** Preço médio do período: `valorTotal / quantidade`, para a tela. */
  precoMedio: number
}

export interface PlanilhaDeVendas {
  aba: string
  itens: ItemDaPlanilhaDeVendas[]
  /** Primeira `DataCaixa` do arquivo. */
  inicio: string
  /** Última `DataCaixa`: é o FIM do período, e é o que casa com `contagens.referencia`. */
  referencia: string
  /** Quantas datas distintas o arquivo tem. 26 no de setembro, não 30. */
  dias: number
  linhas: number
  /** Soma de `valorTotal` — tem de bater com a planilha no centavo. */
  total: number
  totalBruto: number
  totalDesconto: number
  somaQuantidade: number
  descartadas: { linha: number; motivo: string }[]
  avisos: string[]
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

interface Acumulador {
  descricao: string
  unidades: Set<string>
  quantidade: number
  valores: number[]
  brutos: number[]
  descontos: number[]
  linhas: number
}

export function lerVendasDaPlanilha(aba: AbaDaPlanilha): PlanilhaDeVendas {
  exigirColunas(aba, COLUNAS_DE_VENDAS)

  const descartadas: { linha: number; motivo: string }[] = []
  const avisos: string[] = []
  const porProduto = new Map<string, Acumulador>()
  const datas = new Set<string>()
  let contaQueNaoFecha = 0

  for (const linha of aba.linhas) {
    const descricao = textoDaCelula(linha.valores['Produto'])
    if (descricao === null) {
      descartadas.push({ linha: linha.numero, motivo: 'sem nome de produto' })
      continue
    }
    const quantidade = numeroDaCelula(linha.valores['Qtde'])
    const valor = numeroDaCelula(linha.valores['PrecoFinal'])
    if (quantidade === null || valor === null) {
      descartadas.push({
        linha: linha.numero,
        motivo: `"${descricao}" sem quantidade ou sem valor`,
      })
      continue
    }
    const data = dataDaCelula(linha.valores['DataCaixa'])
    if (data === null) {
      descartadas.push({ linha: linha.numero, motivo: `"${descricao}" sem data de caixa` })
      continue
    }
    datas.add(data)

    const unitario = numeroDaCelula(linha.valores['Unitario']) ?? 0
    const desconto = numeroDaCelula(linha.valores['DescontoTotalRateado']) ?? 0
    // A conta que a planilha afirma. Conferida, nunca refeita: se ela não
    // fechar, o número da planilha continua valendo e o aviso aparece — não
    // somos nós que corrigimos faturamento de terceiro.
    if (Math.abs(quantidade * unitario - desconto - valor) > 0.01) contaQueNaoFecha += 1

    const chave = descricao
    let acumulado = porProduto.get(chave)
    if (!acumulado) {
      acumulado = {
        descricao,
        unidades: new Set(),
        quantidade: 0,
        valores: [],
        brutos: [],
        descontos: [],
        linhas: 0,
      }
      porProduto.set(chave, acumulado)
    }
    acumulado.unidades.add(textoDaCelula(linha.valores['Unidade']) ?? 'UND')
    acumulado.quantidade += quantidade
    acumulado.valores.push(valor)
    acumulado.brutos.push(arredondar(quantidade * unitario, 2))
    acumulado.descontos.push(desconto)
    acumulado.linhas += 1
  }

  const itens: ItemDaPlanilhaDeVendas[] = [...porProduto.values()]
    .map((a) => {
      const quantidade = arredondar(a.quantidade, 4)
      const valorTotal = somarDinheiro(a.valores)
      return {
        descricao: a.descricao,
        unidade: [...a.unidades][0] ?? 'UND',
        quantidade,
        valorTotal,
        valorBruto: somarDinheiro(a.brutos),
        valorDesconto: somarDinheiro(a.descontos),
        linhas: a.linhas,
        precoMedio: quantidade > 0 ? arredondar(valorTotal / quantidade, 4) : 0,
      }
    })
    // Pelo dinheiro, maior primeiro: é a ordem em que vale a pena resolver o
    // que ficou pendente. R$ 17.332 de BUFFET DE FEIJOADA importa mais que
    // R$ 4 de um item que saiu uma vez.
    .sort((a, b) => b.valorTotal - a.valorTotal || a.descricao.localeCompare(b.descricao, 'pt-BR'))

  const mistas = [...porProduto.values()].filter((a) => a.unidades.size > 1)
  for (const a of mistas) {
    avisos.push(
      `"${a.descricao}" aparece com mais de uma unidade (${[...a.unidades].join(', ')}); ` +
        `usei "${[...a.unidades][0]}" e somei as quantidades do mesmo jeito.`,
    )
  }
  if (contaQueNaoFecha > 0) {
    avisos.push(
      `Em ${contaQueNaoFecha} ${contaQueNaoFecha === 1 ? 'linha' : 'linhas'} a conta ` +
        '"quantidade × unitário − desconto" não dá o preço final da própria planilha. ' +
        'Mantive o preço final como veio — ele é o que o PDV faturou.',
    )
  }
  if (descartadas.length > 0) {
    avisos.push(
      `${descartadas.length} ${descartadas.length === 1 ? 'linha' : 'linhas'} da planilha ` +
        'não entraram na soma e estão listadas abaixo com o motivo.',
    )
  }

  const ordenadas = [...datas].sort()

  return {
    aba: aba.nome,
    itens,
    inicio: ordenadas[0] ?? '',
    referencia: ordenadas[ordenadas.length - 1] ?? '',
    dias: datas.size,
    linhas: aba.linhas.length,
    total: somarDinheiro(itens.map((i) => i.valorTotal)),
    totalBruto: somarDinheiro(itens.map((i) => i.valorBruto)),
    totalDesconto: somarDinheiro(itens.map((i) => i.valorDesconto)),
    somaQuantidade: arredondar(
      itens.reduce((soma, i) => soma + i.quantidade, 0),
      4,
    ),
    descartadas,
    avisos,
  }
}
