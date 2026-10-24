import { describe, expect, it } from 'vitest'
import { lerComprasDaPlanilha, somarDinheiro } from './compras'
import type { AbaDaPlanilha, ValorDeCelula } from './lerXlsx'

function aba(linhas: Record<string, ValorDeCelula>[]): AbaDaPlanilha {
  const cabecalho = [
    'Loja', 'Operacao', 'Fornecedor', 'Produto', 'Unidade', 'Qtde', 'Unitario',
    'PrecoFinal', 'vl_frete', 'Nota_fiscal', 'DataEntrada', 'Classe', 'Grupo',
    'Emissao', 'nu_cpf_cgc',
  ]
  return {
    nome: 'Entradas 09-26',
    cabecalho,
    linhas: linhas.map((valores, i) => ({ numero: i + 2, valores })),
  }
}

const base = {
  Loja: 'BAR DO ZECA',
  Operacao: '01 - COMPRAS INSUMOS',
  Fornecedor: 'TOP ALTO',
  Unidade: 'KG',
  vl_frete: 0,
  Emissao: '2026-09-02',
  DataEntrada: '2026-09-02',
  Classe: 'INSUMOS',
  Grupo: 'MERCEARIA',
  nu_cpf_cgc: '10915021/0001-90',
}

describe('somarDinheiro', () => {
  /**
   * Em reais, `0.1 + 0.2` não dá `0.3`, e 693 somas acumulam o erro. A prova da
   * importação é fechar com a planilha NO CENTAVO; em centavos ela fecha.
   */
  it('soma em centavos, não em reais', () => {
    expect(somarDinheiro([0.1, 0.2])).toBe(0.3)
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(somarDinheiro([1944.47, 492.38, 329.44, 570.28])).toBe(3336.57)
    expect(somarDinheiro([])).toBe(0)
  })
})

describe('lerComprasDaPlanilha', () => {
  it('agrupa por número, fornecedor e emissão', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        { ...base, Produto: 'LEITE', Qtde: 2, Unitario: 5, PrecoFinal: 10, Nota_fiscal: 1 },
        { ...base, Produto: 'CAFE', Qtde: 1, Unitario: 20, PrecoFinal: 20, Nota_fiscal: 1 },
        // Mesmo número, OUTRO fornecedor: nota diferente. Número de nota não é
        // chave de nada fora do emitente dela.
        {
          ...base,
          Fornecedor: 'OUTRO',
          nu_cpf_cgc: '11222333/0001-81',
          Produto: 'SAL',
          Qtde: 1,
          Unitario: 3,
          PrecoFinal: 3,
          Nota_fiscal: 1,
        },
      ]),
    )
    expect(planilha.notas).toHaveLength(2)
    expect(planilha.total).toBe(33)
    expect(planilha.notas[0]?.itens).toHaveLength(2)
    expect(planilha.notas[0]?.valorTotal).toBe(30)
  })

  /**
   * O caso de 159 das 693 linhas do arquivo de verdade: a nota cobrou mais que
   * a mercadoria (ST, frete, despesa acessória rateada). O desembolso é o que
   * vira custo, e a sobra fica em `valor_outros`.
   */
  it('o que a nota cobrou além da mercadoria vai para outras despesas', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        {
          ...base,
          Produto: 'AMSTEL 600 ML',
          Unidade: 'UN',
          Qtde: 360,
          Unitario: 4.44,
          PrecoFinal: 1944.47,
          vl_frete: 0,
          Nota_fiscal: 121272,
        },
      ]),
    )
    const nota = planilha.notas[0]
    expect(nota?.valorProdutos).toBeCloseTo(1598.4, 2)
    expect(nota?.valorTotal).toBe(1944.47)
    expect(nota?.valorOutros).toBeCloseTo(346.07, 2)
    expect(nota?.valorDesconto).toBe(0)
  })

  it('desembolso menor que a mercadoria é desconto, não despesa negativa', () => {
    const planilha = lerComprasDaPlanilha(
      aba([{ ...base, Produto: 'CAFE', Qtde: 10, Unitario: 10, PrecoFinal: 90, Nota_fiscal: 7 }]),
    )
    expect(planilha.notas[0]?.valorDesconto).toBe(10)
    expect(planilha.notas[0]?.valorOutros).toBe(0)
  })

  it('guarda a operação na linha: é ela que tira limpeza do CMV de insumo', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        {
          ...base,
          Operacao: '01 - COMPRAS DE LIMPEZAS E DESCARTÁVEIS',
          Produto: 'ALLKALY NT BJ-30L',
          Qtde: 30,
          Unitario: 7.28,
          PrecoFinal: 223.26,
          Nota_fiscal: 28052,
        },
      ]),
    )
    expect(planilha.notas[0]?.itens[0]?.operacao).toBe('01 - COMPRAS DE LIMPEZAS E DESCARTÁVEIS')
  })

  /**
   * `nota_itens` tem `check (quantidade >= 0)` e `custo_convertido` divide pela
   * quantidade: entrada com quantidade zero apagaria o custo do insumo na hora
   * de lançar. Devolução vem como linha negativa em alguns ERPs — ela sai com o
   * motivo escrito em vez de zerar um custo em silêncio.
   */
  it('descarta linha sem quantidade dizendo o porquê', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        { ...base, Produto: 'DEVOLUCAO', Qtde: -2, Unitario: 5, PrecoFinal: -10, Nota_fiscal: 9 },
        { ...base, Produto: 'CAFE', Qtde: 1, Unitario: 5, PrecoFinal: 5, Nota_fiscal: 9 },
      ]),
    )
    expect(planilha.notas).toHaveLength(1)
    expect(planilha.total).toBe(5)
    expect(planilha.descartadas).toEqual([
      {
        linha: 2,
        motivo: '"DEVOLUCAO" veio com quantidade -2; o sistema não lança entrada sem quantidade',
      },
    ])
    expect(planilha.avisos.join(' ')).toMatch(/1 linha da planilha/)
  })

  it('avisa quando as notas atravessam mais de um mês, porque o CMV soma pela emissão', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        { ...base, Produto: 'CAFE', Qtde: 1, Unitario: 100, PrecoFinal: 100, Nota_fiscal: 1 },
        {
          ...base,
          Emissao: '2026-08-26',
          Produto: 'SAL',
          Qtde: 1,
          Unitario: 20,
          PrecoFinal: 20,
          Nota_fiscal: 2,
        },
      ]),
    )
    expect(planilha.avisos.join(' ')).toMatch(/agosto de 2026 fica com R\$ 20,00/)
    expect(planilha.avisos.join(' ')).toMatch(/setembro de 2026/)
  })

  it('só aceita CNPJ e CPF como documento do fornecedor', () => {
    const planilha = lerComprasDaPlanilha(
      aba([
        { ...base, Produto: 'CAFE', Qtde: 1, Unitario: 5, PrecoFinal: 5, Nota_fiscal: 1 },
        {
          ...base,
          Fornecedor: 'SEM DOC',
          nu_cpf_cgc: '123',
          Produto: 'SAL',
          Qtde: 1,
          Unitario: 5,
          PrecoFinal: 5,
          Nota_fiscal: 2,
        },
      ]),
    )
    expect(planilha.notas.find((n) => n.fornecedorNome === 'TOP ALTO')?.fornecedorDocumento).toBe(
      '10915021000190',
    )
    // Lixo da exportação em `fornecedores.documento` quebraria o índice único.
    expect(planilha.notas.find((n) => n.fornecedorNome === 'SEM DOC')?.fornecedorDocumento).toBeNull()
  })

  it('recusa aba sem as colunas que fazem uma nota', () => {
    expect(() =>
      lerComprasDaPlanilha({ nome: 'Aba', cabecalho: ['Produto', 'Qtde'], linhas: [] }),
    ).toThrow(/"PrecoFinal"/)
  })
})
