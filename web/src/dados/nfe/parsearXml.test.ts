import { describe, expect, it } from 'vitest'

import {
  ErroNfe,
  calcularDigitoChave,
  dataEmissaoParaIso,
  parsearXml,
  partesDaChave,
  validarChaveAcesso,
} from './parsearXml'
import {
  CHAVE_DV_ERRADO,
  CHAVE_LEGADO,
  CHAVE_MULTI,
  CHAVE_NFCE,
  CHAVE_UNICA,
  XML_CHAVE_DV_ERRADO,
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
      valorTotal: 1814,
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
