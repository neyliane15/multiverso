/**
 * As duas planilhas de setembro de 2026, lidas de verdade, conferidas no centavo.
 *
 * Os arquivos NÃO entram no repositório: são dado de cliente, com nome de
 * fornecedor, CNPJ e faturamento dentro. Então este arquivo se **pula sozinho**
 * quando eles não estão na máquina, e roda quando estão:
 *
 *     MULTIVERSO_PLANILHAS=/caminho/da/pasta npm test
 *
 * A pasta precisa de `compras_setembro.xlsx` e `vendas_setembro.xlsx`.
 *
 * Por que isto existe apesar de se pular: as somas abaixo são as medidas que
 * decidiram o desenho de todo o módulo — se o leitor, a agregação ou o de-para
 * mudarem de resultado, é aqui que aparece. Um teste que só roda na máquina de
 * quem tem o arquivo ainda é melhor que uma medida anotada em laudo, que nunca
 * roda de novo.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerXlsx } from './lerXlsx'
import { lerComprasDaPlanilha } from './compras'
import { lerVendasDaPlanilha } from './vendas'

const PASTA = process.env['MULTIVERSO_PLANILHAS'] ?? ''
const COMPRAS = PASTA === '' ? '' : `${PASTA.replace(/\/$/, '')}/compras_setembro.xlsx`
const VENDAS = PASTA === '' ? '' : `${PASTA.replace(/\/$/, '')}/vendas_setembro.xlsx`
const temOsArquivos = COMPRAS !== '' && existsSync(COMPRAS) && existsSync(VENDAS)

describe.skipIf(!temOsArquivos)('planilhas de setembro de 2026', () => {
  it('compras: 693 linhas viram 133 notas e R$ 83.783,29 no centavo', async () => {
    const aba = await lerXlsx(readFileSync(COMPRAS))
    expect(aba.nome).toBe('Entradas 09-26')
    expect(aba.cabecalho).toHaveLength(25)
    expect(aba.linhas).toHaveLength(693)

    const planilha = lerComprasDaPlanilha(aba)
    expect(planilha.notas).toHaveLength(133)
    expect(planilha.itens).toBe(693)
    expect(planilha.descartadas).toHaveLength(0)
    expect(planilha.total).toBe(83_783.29)
    expect(planilha.somaQuantidade).toBe(9_517.48)

    // O cabeçalho da nota soma os itens dela, sempre.
    for (const nota of planilha.notas) {
      const soma = nota.itens.reduce((s, i) => s + Math.round(i.valorTotal * 100), 0) / 100
      expect(nota.valorTotal).toBeCloseTo(soma, 2)
    }

    // A nota que prova que `PrecoFinal` não é `Qtde × Unitario`: a HNK cobrou
    // R$ 593,61 de ST e despesa em cima de R$ 2.742,96 de mercadoria.
    const hnk = planilha.notas.find((n) => n.numero === '121272')
    expect(hnk?.itens).toHaveLength(4)
    expect(hnk?.valorProdutos).toBeCloseTo(2_742.96, 2)
    expect(hnk?.valorOutros).toBeCloseTo(593.61, 2)
    expect(hnk?.valorTotal).toBe(3_336.57)

    // Nota emitida em agosto e recebida em setembro: o CMV soma pela EMISSÃO,
    // e a tela precisa dizer isso antes de alguém procurar o buraco.
    expect(planilha.avisos.join(' ')).toMatch(/agosto de 2026/)
    expect(planilha.avisos.join(' ')).toMatch(/1\.365,48/)
  })

  it('vendas: 11.198 linhas viram 136 itens e R$ 255.417,78 no centavo', async () => {
    const aba = await lerXlsx(readFileSync(VENDAS))
    expect(aba.nome).toBe('Faturamento 09-26')
    expect(aba.cabecalho).toHaveLength(29)
    expect(aba.linhas).toHaveLength(11_198)

    const planilha = lerVendasDaPlanilha(aba)
    expect(planilha.itens).toHaveLength(136)
    expect(planilha.descartadas).toHaveLength(0)
    expect(planilha.total).toBe(255_417.78)
    expect(planilha.somaQuantidade).toBe(13_651)
    expect(planilha.inicio).toBe('2026-09-01')
    expect(planilha.referencia).toBe('2026-09-30')
    // 26 dias de caixa em setembro, não 30: o bar não abriu todo dia.
    expect(planilha.dias).toBe(26)
  })

  /**
   * A pergunta que estava em aberto, e a resposta medida.
   *
   * `PrecoFinal` JÁ é líquido de `DescontoTotalRateado`, nas 11.198 linhas sem
   * exceção. Subtrair o desconto de novo tiraria R$ 17.069,44 do faturamento —
   * 6,7% — e inflaria o CMV% na mesma proporção.
   */
  it('vendas: o desconto já está dentro do PrecoFinal', async () => {
    const planilha = lerVendasDaPlanilha(await lerXlsx(readFileSync(VENDAS)))
    expect(planilha.totalBruto).toBe(272_487.22)
    expect(planilha.totalDesconto).toBe(17_069.44)
    expect(planilha.totalBruto - planilha.totalDesconto).toBeCloseTo(planilha.total, 2)
    // Nenhuma linha contradiz a conta, então nenhum aviso sobre ela.
    expect(planilha.avisos.join(' ')).not.toMatch(/não dá o preço final/)
  })

  /**
   * Os maiores itens do mês, com o valor. É a lista que diz o tamanho do
   * trabalho de vínculo à mão — e o motivo de a tela ordenar por dinheiro.
   */
  it('vendas: o serviço são 20,8% do faturamento', async () => {
    const planilha = lerVendasDaPlanilha(await lerXlsx(readFileSync(VENDAS)))
    const servico = planilha.itens.filter((i) =>
      /COUVERT|TAXA|SERVI/i.test(i.descricao.normalize('NFD').replace(/[̀-ͯ]/g, '')),
    )
    expect(servico).toHaveLength(5)
    const soma = servico.reduce((s, i) => s + Math.round(i.valorTotal * 100), 0) / 100
    expect(soma).toBe(53_049.68)
    expect(planilha.total - soma).toBeCloseTo(202_368.1, 2)
  })
})
