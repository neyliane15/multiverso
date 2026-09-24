import { describe, expect, it } from 'vitest'

import {
  converterUnidade,
  extrairEmbalagem,
  fatorEntreUnidades,
  normalizarUnidade,
  recalcularFatorAoVincular,
} from './conversaoUnidade'

function fator(unidadeComercial: string, descricao: string, unidadeCadastro: string | null): number {
  return converterUnidade({ unidadeComercial, descricao, unidadeCadastro }).fator
}

describe('normalizarUnidade', () => {
  it('tira pontuação, acento e caixa', () => {
    expect(normalizarUnidade('cx.')).toBe('CX')
    expect(normalizarUnidade(' Und ')).toBe('UND')
    expect(normalizarUnidade('PÇ')).toBe('PC')
    expect(normalizarUnidade(null)).toBe('')
  })
})

describe('extrairEmbalagem', () => {
  it('lê "C/24" de caixa de cerveja', () => {
    const embalagem = extrairEmbalagem('CERVEJA HEINEKEN LONG NECK 330ML CX C/24')
    expect(embalagem?.multiplicador).toBe(24)
    expect(embalagem?.conteudo).toEqual({ valor: 330, unidade: 'ML' })
  })

  it('lê "12X1L" com o conteúdo de cada peça', () => {
    expect(extrairEmbalagem('REFRIGERANTE COLA CX 12X1L')).toMatchObject({
      multiplicador: 12,
      conteudo: { valor: 1, unidade: 'L' },
    })
  })

  it('lê "12X500ML" grudado', () => {
    expect(extrairEmbalagem('AGUA MINERAL 12X500ML')).toMatchObject({
      multiplicador: 12,
      conteudo: { valor: 500, unidade: 'ML' },
    })
  })

  it('lê "C/ 100" com espaço depois da barra', () => {
    expect(extrairEmbalagem('GUARDANAPO PCT C/ 100')?.multiplicador).toBe(100)
  })

  it('lê "COM 30" por extenso', () => {
    expect(extrairEmbalagem('OVOS BRANCOS CAIXA COM 30')?.multiplicador).toBe(30)
  })

  it('preserva o decimal com vírgula', () => {
    expect(extrairEmbalagem('REFRIGERANTE 1,5L FD C/6')).toMatchObject({
      multiplicador: 6,
      conteudo: { valor: 1.5, unidade: 'L' },
    })
  })

  it('devolve conteúdo sem multiplicador quando a descrição só traz o volume', () => {
    expect(extrairEmbalagem('OLEO DE SOJA 900ML')).toMatchObject({
      multiplicador: 1,
      conteudo: { valor: 900, unidade: 'ML' },
    })
  })

  it('devolve null quando não há pista nenhuma', () => {
    expect(extrairEmbalagem('CAIXA MISTERIOSA')).toBeNull()
    expect(extrairEmbalagem('')).toBeNull()
    expect(extrairEmbalagem(null)).toBeNull()
  })
})

describe('fatorEntreUnidades', () => {
  it('converte dentro da mesma família', () => {
    expect(fatorEntreUnidades('KG', 'G')).toBe(1000)
    expect(fatorEntreUnidades('G', 'KG')).toBe(0.001)
    expect(fatorEntreUnidades('L', 'ML')).toBe(1000)
    expect(fatorEntreUnidades('ML', 'L')).toBe(0.001)
    expect(fatorEntreUnidades('DZ', 'UN')).toBe(12)
  })

  it('recusa famílias diferentes e unidades desconhecidas', () => {
    expect(fatorEntreUnidades('KG', 'L')).toBeNull()
    expect(fatorEntreUnidades('KG', 'UN')).toBeNull()
    expect(fatorEntreUnidades('XYZ', 'UN')).toBeNull()
  })
})

describe('converterUnidade — embalagem', () => {
  it('CX C/24 vira 24 unidades', () => {
    expect(fator('CX', 'CERVEJA HEINEKEN LONG NECK 330ML CX C/24', 'UN')).toBe(24)
  })

  it('CAIXA COM 30 vira 30 unidades', () => {
    expect(fator('CAIXA', 'OVOS BRANCOS CAIXA COM 30', 'UN')).toBe(30)
  })

  it('FARDO conta as peças da descrição', () => {
    expect(fator('FD', 'ARROZ TIPO 1 FD C/6 PCT 5KG', 'UN')).toBe(6)
    expect(fator('FARDO', 'GUARDANAPO FARDO COM 20 PACOTES', 'UN')).toBe(20)
  })

  it('PCT C/ 100 vira 100 unidades', () => {
    expect(fator('PCT', 'GUARDANAPO PCT C/ 100', 'UN')).toBe(100)
  })

  it('caixa com volume declarado converte até a unidade do cadastro', () => {
    expect(fator('CX', 'REFRIGERANTE COLA CX 12X1L', 'L')).toBe(12)
    expect(fator('CX', 'AGUA MINERAL 12X500ML', 'ML')).toBe(6000)
    expect(fator('CX', 'AGUA MINERAL 12X500ML', 'L')).toBe(6)
    expect(fator('FD', 'ARROZ TIPO 1 FD C/6 PCT 5KG', 'KG')).toBe(30)
  })

  it('caixa de peso único converte pelo conteúdo', () => {
    expect(fator('CX', 'TOMATE ITALIANO CX 20KG', 'KG')).toBe(20)
    expect(fator('PCT', 'ACUCAR REFINADO UNIAO 1KG', 'KG')).toBe(1)
  })

  it('caixa sem pista fica em 1 e avisa', () => {
    const resultado = converterUnidade({
      unidadeComercial: 'CX',
      descricao: 'CAIXA MISTERIOSA',
      unidadeCadastro: 'UN',
    })
    expect(resultado.fator).toBe(1)
    expect(resultado.origem).toBe('desconhecida')
    expect(resultado.aviso).toMatch(/caixa/)
  })

  it('avisa quando a caixa tem contagem mas o cadastro pede peso', () => {
    const resultado = converterUnidade({
      unidadeComercial: 'CX',
      descricao: 'MIUDOS CX C/8',
      unidadeCadastro: 'KG',
    })
    expect(resultado.fator).toBe(8)
    expect(resultado.aviso).toMatch(/Confira o fator/)
  })
})

describe('converterUnidade — medidas e contagem', () => {
  it('KG vira G e G vira KG', () => {
    expect(fator('KG', 'PICANHA BOVINA', 'G')).toBe(1000)
    expect(fator('G', 'FERMENTO BIOLOGICO', 'KG')).toBe(0.001)
  })

  it('litro e mililitro se convertem nos dois sentidos', () => {
    expect(fator('L', 'OLEO COMPOSTO', 'ML')).toBe(1000)
    expect(fator('LT', 'LEITE INTEGRAL', 'ML')).toBe(1000)
    expect(fator('ML', 'ESSENCIA DE BAUNILHA', 'L')).toBe(0.001)
  })

  it('DZ vira 12 unidades, com ou sem cadastro informado', () => {
    expect(fator('DZ', 'OVO BRANCO GRANDE', 'UN')).toBe(12)
    expect(fator('DZ', 'OVO BRANCO GRANDE', null)).toBe(12)
    expect(fator('DZ', 'OVO BRANCO GRANDE', 'DZ')).toBe(1)
  })

  it('UN, UND e PC são a mesma coisa: fator 1', () => {
    expect(fator('UN', 'PRATO FUNDO', 'UN')).toBe(1)
    expect(fator('UND', 'PRATO FUNDO', 'UN')).toBe(1)
    expect(fator('PC', 'PRATO FUNDO', 'UN')).toBe(1)
  })

  it('unidade em peça com volume na descrição converte para medida', () => {
    expect(fator('UN', 'LEITE INTEGRAL CAIXA 1L', 'L')).toBe(1)
    expect(fator('UN', 'LEITE INTEGRAL CAIXA 1L', 'ML')).toBe(1000)
  })
})

describe('converterUnidade — quando não dá para saber', () => {
  it('unidade desconhecida fica em 1 e avisa', () => {
    const resultado = converterUnidade({
      unidadeComercial: 'ZZZ',
      descricao: 'COISA ESTRANHA',
      unidadeCadastro: 'UN',
    })
    expect(resultado.fator).toBe(1)
    expect(resultado.aviso).toMatch(/desconhecida/)
  })

  it('peso na nota contra contagem no cadastro fica em 1 e avisa', () => {
    const resultado = converterUnidade({
      unidadeComercial: 'KG',
      descricao: 'PICANHA BOVINA',
      unidadeCadastro: 'UN',
    })
    expect(resultado.fator).toBe(1)
    expect(resultado.aviso).toMatch(/grandezas diferentes/)
  })

  it('item sem unidade comercial fica em 1 e avisa', () => {
    const resultado = converterUnidade({ unidadeComercial: '', descricao: 'ALGO', unidadeCadastro: 'UN' })
    expect(resultado.fator).toBe(1)
    expect(resultado.aviso).toMatch(/não informa unidade/)
  })

  it('nunca devolve fator zero ou negativo (o banco recusaria)', () => {
    const entradas = [
      { unidadeComercial: 'CX', descricao: 'CX C/0', unidadeCadastro: 'UN' },
      { unidadeComercial: 'ML', descricao: 'X', unidadeCadastro: 'L' },
      { unidadeComercial: 'ZZZ', descricao: '', unidadeCadastro: null },
    ]
    for (const entrada of entradas) {
      expect(converterUnidade(entrada).fator).toBeGreaterThan(0)
    }
  })
})

describe('recalcularFatorAoVincular', () => {
  it('corrige o fator que a importação chutou sem saber a unidade do cadastro', () => {
    const item = { descricao: 'REFRIGERANTE COLA CX 12X1L', unidade: 'CX' }

    // Na importação, item pendente: sem produto, sem unidade de cadastro.
    const naImportacao = converterUnidade({
      unidadeComercial: item.unidade,
      descricao: item.descricao,
      unidadeCadastro: null,
    })
    expect(naImportacao.fator).toBe(12) // 12 garrafas

    // No vínculo manual, o produto é contado em litro: 12 garrafas de 1 L.
    expect(recalcularFatorAoVincular(item, { unidade: 'L' }).fator).toBe(12)
    // E se o cadastro contasse em mililitro, o fator teria de mudar.
    expect(recalcularFatorAoVincular(item, { unidade: 'ML' }).fator).toBe(12000)
  })

  it('devolve o mesmo resultado de converterUnidade, com o aviso junto', () => {
    const item = { descricao: 'CAIXA MISTERIOSA', unidade: 'CX' }
    const resultado = recalcularFatorAoVincular(item, { unidade: 'UN' })
    expect(resultado.fator).toBe(1)
    expect(resultado.aviso).toMatch(/caixa/)
  })

  it('aceita insumo sem unidade cadastrada', () => {
    const resultado = recalcularFatorAoVincular(
      { descricao: 'OVOS CAIXA COM 30', unidade: 'CX' },
      { unidade: null },
    )
    expect(resultado.fator).toBe(30)
  })
})
