import { describe, expect, it } from 'vitest'
import { lerVendasDaPlanilha } from './vendas'
import type { AbaDaPlanilha, ValorDeCelula } from './lerXlsx'

function aba(linhas: Record<string, ValorDeCelula>[]): AbaDaPlanilha {
  return {
    nome: 'Faturamento 09-26',
    cabecalho: [
      'Produto', 'Unidade', 'Qtde', 'Unitario', 'DescontoTotalRateado',
      'PrecoFinal', 'DataCaixa',
    ],
    linhas: linhas.map((valores, i) => ({ numero: i + 2, valores })),
  }
}

const base = { Unidade: 'UN', DescontoTotalRateado: 0, DataCaixa: '2026-09-12' }

describe('lerVendasDaPlanilha', () => {
  /**
   * O que a tela precisa, e o que o banco precisa: 11.198 linhas de cupom para
   * 136 produtos. Uma linha por cupom seriam 11.198 linhas num relatório de 136.
   */
  it('agrega por produto, somando quantidade e dinheiro', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, Produto: 'AMSTEL 600 ML', Qtde: 2, Unitario: 11, PrecoFinal: 22 },
        { ...base, Produto: 'AMSTEL 600 ML', Qtde: 1, Unitario: 11, PrecoFinal: 11 },
        { ...base, Produto: 'MATE', Qtde: 1, Unitario: 10, PrecoFinal: 10 },
      ]),
    )
    expect(planilha.itens).toHaveLength(2)
    expect(planilha.linhas).toBe(3)
    const amstel = planilha.itens[0]
    expect(amstel?.descricao).toBe('AMSTEL 600 ML')
    expect(amstel?.quantidade).toBe(3)
    expect(amstel?.valorTotal).toBe(33)
    expect(amstel?.linhas).toBe(2)
    expect(amstel?.precoMedio).toBe(11)
    expect(planilha.total).toBe(43)
  })

  /**
   * A medida que decidiu a coluna `valor_total_origem` da 0027: nenhum preço
   * unitário de quatro casas reproduz R$ 16.633,21 em 3.063 unidades.
   * 16.633,21 / 3.063 = 5,4303657..., e 5,4304 × 3.063 = 16.633,32 — onze
   * centavos de erro num item. O dinheiro é medida, não produto de dois outros
   * números.
   */
  it('o preço médio não reproduz o total, e por isso o total é guardado', () => {
    const planilha = lerVendasDaPlanilha(
      aba([{ ...base, Produto: 'AMSTEL 600 ML', Qtde: 3063, Unitario: 5.43, PrecoFinal: 16633.21 }]),
    )
    const item = planilha.itens[0]!
    expect(item.valorTotal).toBe(16633.21)
    expect(item.precoMedio).toBe(5.4304)
    expect(item.quantidade * item.precoMedio).not.toBe(16633.21)
    expect(Math.round(item.quantidade * item.precoMedio * 100) / 100).toBe(16633.32)
  })

  /**
   * `PrecoFinal` já é líquido do desconto — confirmado nas 11.198 linhas do
   * arquivo de verdade. Subtrair outra vez tiraria R$ 17.069,44 (6,7%) do
   * faturamento e inflaria o CMV% na mesma proporção.
   */
  it('não subtrai o desconto de novo: ele já está dentro', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, Produto: 'MATE', Qtde: 1, Unitario: 10, DescontoTotalRateado: 9.96, PrecoFinal: 0.04 },
      ]),
    )
    expect(planilha.total).toBe(0.04)
    expect(planilha.totalBruto).toBe(10)
    expect(planilha.totalDesconto).toBe(9.96)
    expect(planilha.avisos).toEqual([])
  })

  it('avisa, sem corrigir, quando a conta da própria planilha não fecha', () => {
    const planilha = lerVendasDaPlanilha(
      aba([{ ...base, Produto: 'MATE', Qtde: 1, Unitario: 10, DescontoTotalRateado: 0, PrecoFinal: 7 }]),
    )
    // O número da planilha continua valendo: não somos nós que corrigimos
    // faturamento de terceiro.
    expect(planilha.total).toBe(7)
    expect(planilha.avisos.join(' ')).toMatch(/não dá o preço final/)
  })

  it('o período é a primeira e a última data de CAIXA', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, DataCaixa: '2026-09-30', Produto: 'MATE', Qtde: 1, Unitario: 1, PrecoFinal: 1 },
        { ...base, DataCaixa: '2026-09-01', Produto: 'MATE', Qtde: 1, Unitario: 1, PrecoFinal: 1 },
        { ...base, DataCaixa: '2026-09-01', Produto: 'CAFE', Qtde: 1, Unitario: 1, PrecoFinal: 1 },
      ]),
    )
    expect(planilha.inicio).toBe('2026-09-01')
    expect(planilha.referencia).toBe('2026-09-30')
    expect(planilha.dias).toBe(2)
  })

  it('ordena pelo dinheiro: é a ordem em que vale resolver o pendente', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, Produto: 'POUCO', Qtde: 1, Unitario: 4, PrecoFinal: 4 },
        { ...base, Produto: 'MUITO', Qtde: 1, Unitario: 17332.5, PrecoFinal: 17332.5 },
      ]),
    )
    expect(planilha.itens.map((i) => i.descricao)).toEqual(['MUITO', 'POUCO'])
  })

  it('descarta linha sem data de caixa dizendo o porquê', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, DataCaixa: null, Produto: 'MATE', Qtde: 1, Unitario: 1, PrecoFinal: 1 },
        { ...base, Produto: 'CAFE', Qtde: 1, Unitario: 1, PrecoFinal: 1 },
      ]),
    )
    expect(planilha.itens).toHaveLength(1)
    expect(planilha.descartadas).toEqual([{ linha: 2, motivo: '"MATE" sem data de caixa' }])
  })

  it('avisa quando o mesmo produto aparece com duas unidades', () => {
    const planilha = lerVendasDaPlanilha(
      aba([
        { ...base, Produto: 'PICANHA', Unidade: 'KG', Qtde: 1, Unitario: 10, PrecoFinal: 10 },
        { ...base, Produto: 'PICANHA', Unidade: 'UN', Qtde: 1, Unitario: 10, PrecoFinal: 10 },
      ]),
    )
    expect(planilha.avisos.join(' ')).toMatch(/mais de uma unidade \(KG, UN\)/)
  })

  it('recusa aba sem as colunas que fazem uma venda', () => {
    expect(() =>
      lerVendasDaPlanilha({ nome: 'Aba', cabecalho: ['Produto', 'Qtde'], linhas: [] }),
    ).toThrow(/"PrecoFinal"/)
  })
})
