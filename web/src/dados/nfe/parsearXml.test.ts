import { describe, expect, it } from 'vitest'

import {
  ErroNfe,
  calcularDigitoChave,
  dataEmissaoParaIso,
  parsearXml,
  partesDaChave,
  ratearDespesa,
  validarChaveAcesso,
} from './parsearXml'
import {
  CHAVE_DV_ERRADO,
  CHAVE_LEGADO,
  CHAVE_MULTI,
  CHAVE_NFCE,
  CHAVE_UNICA,
  XML_AUTORIZADA_FORA_DE_PRAZO,
  XML_CERVEJA_ST,
  XML_CHAVE_DV_ERRADO,
  XML_FRETE_CABECALHO,
  XML_FRETE_NO_ITEM,
  XML_LOTE_DUAS_NOTAS,
  XML_NOTA_CANCELADA,
  XML_NOTA_DENEGADA,
  XML_EVENTO_CANCELAMENTO,
  XML_ITEM_UNICO,
  XML_LEGADO_DEMI,
  XML_MAL_FORMADO,
  XML_MODELO_NAO_SUPORTADO,
  XML_MULTIPLOS_ITENS,
  XML_NFCE,
  XML_TOTAL_DIVERGENTE,
} from './fixturesNfe'

describe('chave de acesso', () => {
  it('calcula o dígito verificador pelo módulo 11', () => {
    expect(calcularDigitoChave(CHAVE_MULTI.slice(0, 43))).toBe(Number(CHAVE_MULTI[43]))
    expect(calcularDigitoChave(CHAVE_NFCE.slice(0, 43))).toBe(Number(CHAVE_NFCE[43]))
  })

  it('aceita chave boa e recusa chave com dígito trocado', () => {
    expect(validarChaveAcesso(CHAVE_MULTI)).toBe(true)
    expect(validarChaveAcesso(CHAVE_DV_ERRADO)).toBe(false)
  })

  it('recusa chave com tamanho errado', () => {
    expect(validarChaveAcesso(CHAVE_MULTI.slice(0, 43))).toBe(false)
    expect(validarChaveAcesso(`${CHAVE_MULTI}0`)).toBe(false)
    expect(validarChaveAcesso('')).toBe(false)
  })

  it('ignora pontuação na chave digitada à mão', () => {
    const comEspacos = CHAVE_MULTI.replace(/(\d{4})(?=\d)/g, '$1 ')
    expect(validarChaveAcesso(comEspacos)).toBe(true)
  })

  it('separa as partes da chave', () => {
    expect(partesDaChave(CHAVE_MULTI)).toEqual({
      uf: '35',
      anoMes: '2603',
      cnpj: '12345678000195',
      modelo: '55',
      serie: '001',
      numero: '000012345',
    })
    expect(partesDaChave('123')).toBeNull()
  })
})

describe('data de emissão', () => {
  it('mantém o dia do emitente quando o offset é -03:00', () => {
    expect(dataEmissaoParaIso('2026-03-12T21:40:00-03:00')).toBe('2026-03-12')
  })

  it('converte para America/Sao_Paulo quando a hora vem em UTC', () => {
    // 01:30 UTC do dia 13 ainda é dia 12 às 22:30 em São Paulo.
    expect(dataEmissaoParaIso('2026-03-13T01:30:00Z')).toBe('2026-03-12')
    expect(dataEmissaoParaIso('2026-03-12T23:30:00-02:00')).toBe('2026-03-12')
  })

  it('aceita dEmi legado, que já é data local', () => {
    expect(dataEmissaoParaIso('2025-12-20')).toBe('2025-12-20')
  })

  it('aceita dhEmi sem offset como hora local', () => {
    expect(dataEmissaoParaIso('2026-01-05T08:00:00')).toBe('2026-01-05')
  })

  it('reclama de formato desconhecido', () => {
    expect(() => dataEmissaoParaIso('20/12/2025')).toThrow(ErroNfe)
  })
})

describe('parsearXml — nota com vários itens', () => {
  const nota = parsearXml(XML_MULTIPLOS_ITENS)

  it('lê o cabeçalho da nota', () => {
    expect(nota.chaveAcesso).toBe(CHAVE_MULTI)
    expect(nota.chaveValida).toBe(true)
    expect(nota.numero).toBe('12345')
    expect(nota.serie).toBe('1')
    expect(nota.modelo).toBe('55')
    expect(nota.emitidaEm).toBe('2026-03-12')
  })

  it('lê o emitente com o CNPJ só em dígitos e o endereço em uma linha', () => {
    expect(nota.emitente.documento).toBe('12345678000195')
    expect(nota.emitente.razaoSocial).toBe('DISTRIBUIDORA DE BEBIDAS SAO PAULO LTDA')
    expect(nota.emitente.nomeFantasia).toBe('DISTRISP')
    expect(nota.emitente.inscricaoEstadual).toBe('123456789012')
    expect(nota.emitente.endereco).toBe(
      'AVENIDA DAS INDUSTRIAS, 1200 - GALPAO 3 - DISTRITO INDUSTRIAL - SAO PAULO/SP - CEP 04711000',
    )
  })

  it('lê os totais do ICMSTot, não a soma dos itens', () => {
    expect(nota.totais).toEqual({
      valorProdutos: 1775.25,
      valorFrete: 45,
      valorDesconto: 6.25,
      valorOutros: 0,
      valorSeguro: 0,
      valorTotal: 1814,
      impostosItens: 0,
      custoDesembolsado: 1814,
    })
  })

  it('confere o protocolo de autorização', () => {
    expect(nota.situacao).toEqual({
      cStat: '100',
      xMotivo: 'Autorizado o uso da NF-e',
      protocolo: '135260000012345',
      autorizada: true,
    })
  })

  it('lê os três itens na ordem do nItem', () => {
    expect(nota.itens.map((i) => i.ordem)).toEqual([1, 2, 3])
    expect(nota.itens[0]).toEqual({
      ordem: 1,
      codigoFornecedor: '7891',
      descricao: 'CERVEJA HEINEKEN LONG NECK 330ML CX C/24',
      ncm: '22030000',
      cfop: '5102',
      ean: '7896045506873',
      unidade: 'CX',
      quantidade: 10,
      valorUnitario: 89.9,
      valorDesconto: 0,
      valorTotal: 899,
      // 45,00 de frete rateados na proporção de vProd: 899 / 1775,25.
      valorFrete: 22.79,
      valorSeguro: 0,
      valorOutros: 0,
      impostos: { icmsSt: 0, fcpSt: 0, ipi: 0, ii: 0, total: 0 },
      custoDesembolsado: 921.79,
    })
  })

  it('trata "SEM GTIN" como ausência de código de barras', () => {
    expect(nota.itens[1]?.ean).toBeNull()
    expect(nota.itens[2]?.ean).toBeNull()
  })

  it('preserva o zero à esquerda do código do fornecedor', () => {
    expect(nota.itens[1]?.codigoFornecedor).toBe('0045')
  })

  it('lê desconto e quantidade fracionada do item', () => {
    expect(nota.itens[2]?.valorDesconto).toBe(6.25)
    expect(nota.itens[2]?.quantidade).toBe(12.5)
    expect(nota.itens[2]?.unidade).toBe('KG')
  })

  it('não gera aviso quando a nota fecha', () => {
    expect(nota.avisos).toEqual([])
  })
})

describe('parsearXml — nota com um item só', () => {
  it('lê o item quando <det> vem como objeto e não como lista', () => {
    const nota = parsearXml(XML_ITEM_UNICO)
    expect(nota.itens).toHaveLength(1)
    expect(nota.chaveAcesso).toBe(CHAVE_UNICA)
    expect(nota.itens[0]?.descricao).toBe('OLEO DE SOJA SOYA 900ML CX 20X900ML')
    expect(nota.itens[0]?.quantidade).toBe(3)
    expect(nota.itens[0]?.valorTotal).toBe(337.5)
    expect(nota.emitidaEm).toBe('2026-03-13')
    expect(nota.avisos).toEqual([])
  })
})

describe('parsearXml — variações de layout', () => {
  it('lê <NFe> solto, com prefixo de namespace e dEmi legado', () => {
    const nota = parsearXml(XML_LEGADO_DEMI)
    expect(nota.chaveAcesso).toBe(CHAVE_LEGADO)
    expect(nota.emitidaEm).toBe('2025-12-20')
    expect(nota.numero).toBe('912')
    expect(nota.serie).toBe('5')
    expect(nota.emitente.documento).toBe('45678901000133')
    expect(nota.emitente.inscricaoEstadual).toBe('ISENTO')
    expect(nota.itens[0]?.descricao).toBe('TOMATE ITALIANO CX 20KG')
    expect(nota.itens[0]?.ean).toBeNull()
  })

  it('aceita NFC-e (modelo 65)', () => {
    const nota = parsearXml(XML_NFCE)
    expect(nota.modelo).toBe('65')
    expect(nota.chaveAcesso).toBe(CHAVE_NFCE)
    expect(nota.totais.valorTotal).toBe(32.94)
  })
})

describe('parsearXml — avisos', () => {
  it('avisa (sem explodir) quando a soma dos itens diverge do total', () => {
    const nota = parsearXml(XML_TOTAL_DIVERGENTE)
    expect(nota.itens).toHaveLength(2)
    // O total declarado na nota continua sendo a verdade contábil.
    expect(nota.totais.valorProdutos).toBe(100)
    expect(nota.avisos).toHaveLength(1)
    expect(nota.avisos[0]).toContain('R$ 0,06')
    expect(nota.avisos[0]).toContain('soma dos itens')
  })

  it('respeita a tolerância informada pelo chamador', () => {
    const nota = parsearXml(XML_TOTAL_DIVERGENTE, { toleranciaTotal: 0.1 })
    expect(nota.avisos).toEqual([])
  })

  it('avisa quando o dígito verificador da chave não fecha, mas devolve a nota', () => {
    const nota = parsearXml(XML_CHAVE_DV_ERRADO)
    expect(nota.chaveValida).toBe(false)
    expect(nota.chaveAcesso).toBe(CHAVE_DV_ERRADO)
    expect(nota.itens).toHaveLength(3)
    expect(nota.avisos.join(' ')).toMatch(/dígito verificador errado/)
  })

  it('explode na chave inválida quando o chamador exige chave válida', () => {
    expect(() => parsearXml(XML_CHAVE_DV_ERRADO, { exigirChaveValida: true })).toThrowError(
      /dígito verificador errado/,
    )
    try {
      parsearXml(XML_CHAVE_DV_ERRADO, { exigirChaveValida: true })
      expect.unreachable('deveria ter lançado ErroNfe')
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroNfe)
      expect((erro as ErroNfe).codigo).toBe('chave_invalida')
    }
  })
})

describe('parsearXml — erros', () => {
  function codigoDoErro(xml: string): string {
    try {
      parsearXml(xml)
    } catch (erro) {
      if (erro instanceof ErroNfe) return erro.codigo
      throw erro
    }
    throw new Error('parsearXml não lançou erro')
  }

  it('recusa arquivo vazio', () => {
    expect(codigoDoErro('   ')).toBe('xml_invalido')
  })

  it('recusa XML truncado', () => {
    expect(codigoDoErro(XML_MAL_FORMADO)).toBe('xml_invalido')
  })

  it('recusa XML que não é a nota (evento de cancelamento)', () => {
    expect(codigoDoErro(XML_EVENTO_CANCELAMENTO)).toBe('nao_e_nfe')
  })

  it('recusa modelo diferente de 55/65', () => {
    expect(codigoDoErro(XML_MODELO_NAO_SUPORTADO)).toBe('modelo_nao_suportado')
  })

  it('recusa NFe sem item', () => {
    const semItens = XML_NFCE.replace(/<det nItem="1">[\s\S]*?<\/det>/, '')
    expect(codigoDoErro(semItens)).toBe('sem_itens')
  })

  it('recusa chave de acesso com tamanho errado no Id', () => {
    const chaveCurta = XML_NFCE.replace(`NFe${CHAVE_NFCE}`, 'NFe12345')
    expect(codigoDoErro(chaveCurta)).toBe('chave_invalida')
  })

  it('escreve as mensagens em português', () => {
    try {
      parsearXml(XML_EVENTO_CANCELAMENTO)
    } catch (erro) {
      expect((erro as Error).message).toMatch(/não é uma NFe/)
    }
  })
})

describe('parsearXml — custo desembolsado (imposto por item)', () => {
  const nota = parsearXml(XML_CERVEJA_ST)

  it('soma o ICMS-ST devido na operação ao custo do item', () => {
    const cerveja = nota.itens[0]
    expect(cerveja?.valorTotal).toBe(1000)
    expect(cerveja?.impostos).toEqual({ icmsSt: 230, fcpSt: 0, ipi: 0, ii: 0, total: 230 })
    expect(cerveja?.custoDesembolsado).toBe(1230)
  })

  it('ignora ST já retido antes (ICMS60), que está embutido no preço', () => {
    const longNeck = nota.itens[1]
    expect(longNeck?.valorTotal).toBe(500)
    // vICMSSTRet de 88,00 no XML: somá-lo cobraria o ST duas vezes.
    expect(longNeck?.impostos.total).toBe(0)
    expect(longNeck?.custoDesembolsado).toBe(500)
  })

  it('o custo unitário do estoque muda de verdade por causa do ST', () => {
    const cerveja = nota.itens[0]
    // Réplica da coluna gerada custo_convertido de nota_itens:
    // round(valor_total / (quantidade * fator_conversao), 6), com fator 12 (CX C/12).
    const fator = 12
    const convertido = (valor: number): number =>
      Math.round((valor / ((cerveja?.quantidade ?? 0) * fator)) * 1e6) / 1e6
    const custoComSt = convertido(cerveja?.custoDesembolsado ?? 0)
    const custoSoVProd = convertido(cerveja?.valorTotal ?? 0)
    expect(custoSoVProd).toBeCloseTo(8.333333, 6)
    expect(custoComSt).toBeCloseTo(10.25, 6)
    // 23% de diferença no custo da lata: é isso que o CMV estava perdendo.
    expect(custoComSt / custoSoVProd).toBeCloseTo(1.23, 4)
  })

  it('leva os impostos para os totais da nota', () => {
    expect(nota.totais.impostosItens).toBe(230)
    expect(nota.totais.valorProdutos).toBe(1500)
    expect(nota.totais.custoDesembolsado).toBe(1730)
  })
})

describe('parsearXml — rateio de despesas', () => {
  it('rateia o frete do cabeçalho na proporção de vProd e fecha no centavo', () => {
    const nota = parsearXml(XML_FRETE_CABECALHO)
    const fretes = nota.itens.map((item) => item.valorFrete)
    // 100 / 3 não fecha: os centavos que sobram vão para um item só.
    expect(fretes).toEqual([33.34, 33.33, 33.33])
    const somaFretes = Math.round(fretes.reduce((soma, valor) => soma + valor, 0) * 100) / 100
    expect(somaFretes).toBe(nota.totais.valorFrete)
    expect(nota.itens.map((item) => item.custoDesembolsado)).toEqual([43.34, 43.33, 43.33])
  })

  it('item que traz o próprio frete não recebe rateio do cabeçalho', () => {
    const nota = parsearXml(XML_FRETE_NO_ITEM)
    const [primeiro, segundo] = nota.itens
    expect(primeiro?.valorFrete).toBe(10)
    // Resíduo do cabeçalho (30 − 10) inteiro para quem não declarou nada.
    expect(segundo?.valorFrete).toBe(20)
    expect(primeiro?.custoDesembolsado).toBe(110)
    expect(segundo?.custoDesembolsado).toBe(120)
  })

  it('o desconto do item continua sendo dele e abate o custo', () => {
    const nota = parsearXml(XML_MULTIPLOS_ITENS)
    const picanha = nota.itens[2]
    expect(picanha?.valorDesconto).toBe(6.25)
    // 786,25 − 6,25 de desconto + 19,93 de frete rateado.
    expect(picanha?.custoDesembolsado).toBe(799.93)
  })

  it('a soma dos custos desembolsados fecha no valor da nota', () => {
    for (const xml of [XML_MULTIPLOS_ITENS, XML_CERVEJA_ST, XML_FRETE_CABECALHO, XML_FRETE_NO_ITEM]) {
      const nota = parsearXml(xml)
      const soma = Math.round(
        nota.itens.reduce((total, item) => total + item.custoDesembolsado, 0) * 100,
      ) / 100
      expect(soma).toBe(nota.totais.valorTotal)
    }
  })

  it('ratearDespesa não divide por zero quando a nota inteira é bonificação', () => {
    const { rateios } = ratearDespesa(30, [0, 0, 0], [0, 0, 0])
    expect(rateios).toEqual([10, 10, 10])
    const soma = rateios.reduce((total, valor) => total + valor, 0)
    expect(soma).toBe(30)
  })

  it('ratearDespesa não inventa despesa quando o cabeçalho já foi coberto', () => {
    const { rateios } = ratearDespesa(10, [6, 4], [100, 100])
    expect(rateios).toEqual([0, 0])
  })
})

describe('parsearXml — situação na SEFAZ', () => {
  it('deixa passar a nota autorizada (100) e a autorizada fora de prazo (150)', () => {
    expect(parsearXml(XML_MULTIPLOS_ITENS).situacao?.autorizada).toBe(true)
    const foraDePrazo = parsearXml(XML_AUTORIZADA_FORA_DE_PRAZO)
    expect(foraDePrazo.situacao?.cStat).toBe('150')
    expect(foraDePrazo.situacao?.autorizada).toBe(true)
    expect(foraDePrazo.avisos).toEqual([])
  })

  it('recusa nota cancelada (101) dizendo o cStat e o motivo', () => {
    try {
      parsearXml(XML_NOTA_CANCELADA)
      expect.unreachable('nota cancelada não pode ser importada')
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroNfe)
      expect((erro as ErroNfe).codigo).toBe('nota_nao_autorizada')
      expect((erro as ErroNfe).message).toContain('101')
      expect((erro as ErroNfe).message).toContain('Cancelamento de NF-e homologado')
      expect((erro as ErroNfe).message).toMatch(/não pode entrar no CMV/)
    }
  })

  it('recusa nota denegada (302)', () => {
    try {
      parsearXml(XML_NOTA_DENEGADA)
      expect.unreachable('nota denegada não pode ser importada')
    } catch (erro) {
      expect((erro as ErroNfe).codigo).toBe('nota_nao_autorizada')
      expect((erro as ErroNfe).message).toContain('302')
    }
  })

  it('com aceitarNaoAutorizada a nota cancelada passa, mas avisando', () => {
    const nota = parsearXml(XML_NOTA_CANCELADA, { aceitarNaoAutorizada: true })
    expect(nota.situacao?.cStat).toBe('101')
    expect(nota.situacao?.autorizada).toBe(false)
    expect(nota.avisos.join(' ')).toMatch(/não está autorizada/)
    expect(nota.itens).toHaveLength(3)
  })

  it('XML sem protNFe não é erro: importa avisando que não deu para conferir', () => {
    const nota = parsearXml(XML_LEGADO_DEMI)
    expect(nota.situacao).toBeNull()
    expect(nota.avisos.join(' ')).toMatch(/protocolo de autorização/)
  })
})

describe('parsearXml — lote', () => {
  it('recusa arquivo de lote dizendo quantas notas ele tem', () => {
    try {
      parsearXml(XML_LOTE_DUAS_NOTAS)
      expect.unreachable('lote não pode ser importado pela metade')
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroNfe)
      expect((erro as ErroNfe).codigo).toBe('lote_nao_suportado')
      expect((erro as ErroNfe).message).toContain('2 notas')
    }
  })
})
