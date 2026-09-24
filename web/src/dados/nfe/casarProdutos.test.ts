import { describe, expect, it } from 'vitest'

import {
  CONFIANCA_MINIMA,
  casarItem,
  casarItens,
  similaridadeTexto,
  type ApelidoConhecido,
  type ContextoCasamento,
  type ProdutoCandidato,
} from './casarProdutos'

const FORNECEDOR_BEBIDAS = 'f0000000-0000-0000-0000-00000000bebe'
const FORNECEDOR_ACOUGUE = 'f0000000-0000-0000-0000-0000000000a1'

const PRODUTOS: ProdutoCandidato[] = [
  {
    id: 'p-coca-2l',
    nome: 'Refrigerante Coca-Cola 2L',
    codigo: 'BEB-001',
    codigo_barras: '7894900011517',
    unidade: 'UN',
  },
  { id: 'p-coca-600', nome: 'Refrigerante Coca-Cola 600ml', codigo: 'BEB-002', codigo_barras: '7894900027013', unidade: 'UN' },
  { id: 'p-picanha', nome: 'Picanha Bovina', codigo: 'CAR-010', codigo_barras: null, unidade: 'KG' },
  { id: 'p-mussarela', nome: 'Queijo Mussarela Fatiado', codigo: 'FRI-003', codigo_barras: null, unidade: 'KG' },
  { id: 'p-arroz', nome: 'Arroz Branco Tipo 1 5kg', codigo: 'MER-020', codigo_barras: '7896006711421', unidade: 'PCT' },
  { id: 'p-arroz-par', nome: 'Arroz Parboilizado Tipo 1 5kg', codigo: 'MER-021', codigo_barras: null, unidade: 'PCT' },
]

const CONTEXTO: ContextoCasamento = { produtos: PRODUTOS, fornecedorId: FORNECEDOR_BEBIDAS }

describe('similaridadeTexto', () => {
  it('dá 1 para descrições iguais a menos de acento, caixa e pontuação', () => {
    expect(similaridadeTexto('ACUCAR REFINADO UNIAO', 'Açúcar Refinado União')).toBe(1)
  })

  it('separa embalagens diferentes do mesmo insumo', () => {
    const mesmoTamanho = similaridadeTexto('REFRIGERANTE COCA COLA 2L PET', 'Refrigerante Coca-Cola 2L')
    const outroTamanho = similaridadeTexto('REFRIGERANTE COCA COLA 2L PET', 'Refrigerante Coca-Cola 600ml')
    expect(mesmoTamanho).toBeGreaterThan(CONFIANCA_MINIMA)
    expect(outroTamanho).toBeLessThan(CONFIANCA_MINIMA)
    expect(mesmoTamanho).toBeGreaterThan(outroTamanho)
  })

  it('dá nota baixa para insumos que só compartilham uma palavra', () => {
    expect(similaridadeTexto('QUEIJO MUSSARELA FATIADO KG', 'Presunto Cozido Fatiado')).toBeLessThan(0.4)
  })

  it('não quebra com texto vazio', () => {
    expect(similaridadeTexto('', 'Picanha')).toBe(0)
    expect(similaridadeTexto('Picanha', '   ')).toBe(0)
  })
})

describe('casarItem — apelido aprendido', () => {
  const apelidos: ApelidoConhecido[] = [
    {
      produto_id: 'p-picanha',
      fornecedor_id: FORNECEDOR_ACOUGUE,
      apelido: 'PICANHA BOV RESF VACUO',
      fator_conversao: 1,
      unidade: 'KG',
    },
    {
      produto_id: 'p-mussarela',
      fornecedor_id: FORNECEDOR_BEBIDAS,
      apelido: 'MUSSA FATIADA 2KG',
      fator_conversao: 2,
      unidade: 'KG',
    },
  ]

  it('vincula sozinho quando o apelido é do mesmo fornecedor', () => {
    const casamento = casarItem(
      { descricao: 'MUSSA FATIADA 2KG' },
      { produtos: PRODUTOS, apelidos, fornecedorId: FORNECEDOR_BEBIDAS },
    )
    expect(casamento.produtoId).toBe('p-mussarela')
    expect(casamento.motivo).toBe('apelido_fornecedor')
    expect(casamento.automatico).toBe(true)
    expect(casamento.confianca).toBeGreaterThan(0.95)
    // O apelido também ensina o fator que alguém já conferiu à mão.
    expect(casamento.fatorSugerido).toBe(2)
    expect(casamento.unidadeSugerida).toBe('KG')
  })

  it('aceita apelido de outro fornecedor, com confiança menor', () => {
    const casamento = casarItem(
      { descricao: 'Picanha Bov Resf Vácuo' },
      { produtos: PRODUTOS, apelidos, fornecedorId: FORNECEDOR_BEBIDAS },
    )
    expect(casamento.produtoId).toBe('p-picanha')
    expect(casamento.motivo).toBe('apelido_geral')
    expect(casamento.confianca).toBeLessThan(0.99)
    expect(casamento.confianca).toBeGreaterThanOrEqual(CONFIANCA_MINIMA)
  })

  it('prefere o apelido do fornecedor da nota quando a mesma descrição tem dois donos', () => {
    const conflitantes: ApelidoConhecido[] = [
      { produto_id: 'p-arroz-par', fornecedor_id: null, apelido: 'ARROZ T1 5KG' },
      { produto_id: 'p-arroz', fornecedor_id: FORNECEDOR_BEBIDAS, apelido: 'ARROZ T1 5KG' },
    ]
    const casamento = casarItem(
      { descricao: 'ARROZ T1 5KG' },
      { produtos: PRODUTOS, apelidos: conflitantes, fornecedorId: FORNECEDOR_BEBIDAS },
    )
    expect(casamento.produtoId).toBe('p-arroz')
    expect(casamento.motivo).toBe('apelido_fornecedor')
  })

  it('o apelido vence o código de barras que aponta para outro insumo', () => {
    const casamento = casarItem(
      { descricao: 'MUSSA FATIADA 2KG', ean: '7894900011517' },
      { produtos: PRODUTOS, apelidos, fornecedorId: FORNECEDOR_BEBIDAS },
    )
    expect(casamento.produtoId).toBe('p-mussarela')
  })
})

describe('casarItem — código de barras', () => {
  it('vincula pelo EAN', () => {
    const casamento = casarItem(
      { descricao: 'REFRI COLA GARRAFA GRANDE', ean: '7894900011517' },
      CONTEXTO,
    )
    expect(casamento.produtoId).toBe('p-coca-2l')
    expect(casamento.motivo).toBe('ean')
    expect(casamento.automatico).toBe(true)
  })

  it('casa GTIN-14 da nota com o EAN-13 do cadastro', () => {
    const casamento = casarItem({ descricao: 'REFRI COLA', ean: '07894900011517' }, CONTEXTO)
    expect(casamento.produtoId).toBe('p-coca-2l')
  })

  it('recusa quando dois insumos dividem o mesmo EAN', () => {
    const duplicados: ProdutoCandidato[] = [
      { id: 'p-a', nome: 'Insumo A', codigo_barras: '7891000100103' },
      { id: 'p-b', nome: 'Insumo B', codigo_barras: '7891000100103' },
    ]
    const casamento = casarItem({ descricao: 'ALGO', ean: '7891000100103' }, { produtos: duplicados })
    expect(casamento.produtoId).toBeNull()
    expect(casamento.motivo).toBe('ambiguo')
    expect(casamento.sugestoes.map((s) => s.produtoId)).toEqual(['p-a', 'p-b'])
  })

  it('ignora EAN que não existe no cadastro e continua a cascata', () => {
    const casamento = casarItem(
      { descricao: 'Arroz Branco Tipo 1 5kg', ean: '9999999999999' },
      CONTEXTO,
    )
    expect(casamento.produtoId).toBe('p-arroz')
    expect(casamento.motivo).toBe('similaridade')
  })
})

describe('casarItem — código do fornecedor', () => {
  it('vincula quando o código do item é o código do insumo', () => {
    const casamento = casarItem(
      { descricao: 'ITEM SEM NOME RECONHECIVEL', codigoFornecedor: 'beb-001' },
      CONTEXTO,
    )
    expect(casamento.produtoId).toBe('p-coca-2l')
    expect(casamento.motivo).toBe('codigo_fornecedor')
    expect(casamento.confianca).toBeGreaterThanOrEqual(CONFIANCA_MINIMA)
  })
})

describe('casarItem — similaridade', () => {
  it('vincula descrição quase igual', () => {
    const casamento = casarItem({ descricao: 'REFRIGERANTE COCA COLA 2L PET' }, CONTEXTO)
    expect(casamento.produtoId).toBe('p-coca-2l')
    expect(casamento.motivo).toBe('similaridade')
    expect(casamento.confianca).toBeGreaterThanOrEqual(CONFIANCA_MINIMA)
    expect(casamento.explicacao).toMatch(/Coca-Cola 2L/)
  })

  it('recusa quando o mais parecido ainda é pouco parecido', () => {
    // Divide a palavra "queijo" com a mussarela do cadastro e nada mais.
    const casamento = casarItem({ descricao: 'QUEIJO PARMESAO RALADO 100G' }, CONTEXTO)
    expect(casamento.produtoId).toBeNull()
    expect(casamento.automatico).toBe(false)
    expect(casamento.motivo).toBe('sem_correspondencia')
    expect(casamento.confianca).toBeLessThan(CONFIANCA_MINIMA)
    // Mesmo recusando, entrega palpites para o humano escolher.
    expect(casamento.sugestoes.length).toBeGreaterThan(0)
  })

  it('não confunde a embalagem grande com a pequena', () => {
    const casamento = casarItem({ descricao: 'REFRIGERANTE COCA COLA 600ML PET' }, CONTEXTO)
    expect(casamento.produtoId).toBe('p-coca-600')
  })

  it('não escolhe sozinho quando duas opções empatam', () => {
    const gemeos: ProdutoCandidato[] = [
      { id: 'p-x', nome: 'Farinha de Trigo Tipo 1 5kg' },
      { id: 'p-y', nome: 'Farinha de Trigo Tipo 1 5kg' },
    ]
    const casamento = casarItem({ descricao: 'FARINHA DE TRIGO TIPO 1 5KG' }, { produtos: gemeos })
    expect(casamento.produtoId).toBeNull()
    expect(casamento.motivo).toBe('ambiguo')
    expect(casamento.explicacao).toMatch(/confirme/i)
  })

  it('respeita um limiar mais exigente passado pelo chamador', () => {
    const casamento = casarItem(
      { descricao: 'REFRIGERANTE COCA COLA 2L PET' },
      { ...CONTEXTO, confiancaMinima: 0.95 },
    )
    expect(casamento.produtoId).toBeNull()
  })

  it('descrição sem nenhuma palavra em comum não vira sugestão nenhuma', () => {
    const casamento = casarItem({ descricao: 'MOLHO SHOYU TRADICIONAL 500ML' }, CONTEXTO)
    expect(casamento.produtoId).toBeNull()
    expect(casamento.confianca).toBe(0)
    expect(casamento.sugestoes).toEqual([])
    expect(casamento.explicacao).toMatch(/Nenhum insumo cadastrado/)
  })

  it('sem insumos cadastrados não inventa vínculo', () => {
    const casamento = casarItem({ descricao: 'QUALQUER COISA' }, { produtos: [] })
    expect(casamento.produtoId).toBeNull()
    expect(casamento.confianca).toBe(0)
    expect(casamento.sugestoes).toEqual([])
  })
})

describe('casarItens', () => {
  it('processa a nota inteira e separa o que ficou pendente', () => {
    const casamentos = casarItens(
      [
        { descricao: 'REFRIGERANTE COCA COLA 2L PET' },
        { descricao: 'PICANHA BOVINA', ean: null },
        { descricao: 'GUARDANAPO FOLHA DUPLA PCT C/50' },
      ],
      CONTEXTO,
    )
    expect(casamentos).toHaveLength(3)
    expect(casamentos.map((c) => c.produtoId)).toEqual(['p-coca-2l', 'p-picanha', null])
    expect(casamentos.filter((c) => c.produtoId === null)).toHaveLength(1)
    // Nenhum vínculo automático abaixo do limiar — é a regra dura do módulo.
    for (const casamento of casamentos) {
      if (casamento.automatico) expect(casamento.confianca).toBeGreaterThanOrEqual(CONFIANCA_MINIMA)
    }
  })
})
