import { describe, expect, it } from 'vitest'
import type { Categoria, ProdutoCompleto } from '@/tipos/banco'
import {
  avisoDeDesativacao,
  contarUso,
  filtrarCadastro,
  moverNaOrdem,
  nomeDuplicado,
  ordenarCadastro,
  proximaOrdem,
  validarCadastro,
  type RascunhoDeCadastro,
} from './logicaDeCadastro'

function item(parcial: Partial<Categoria> & { id: string; nome: string }): Categoria {
  return {
    restaurante_id: 'r1',
    descricao: null,
    cor: '#6B7280',
    ordem: 0,
    ativo: true,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...parcial,
  }
}

function produto(
  parcial: Partial<ProdutoCompleto> & { id: string; nome: string },
): ProdutoCompleto {
  return {
    restaurante_id: 'r1',
    codigo: null,
    codigo_barras: null,
    unidade: 'UND',
    custo_medio: 0,
    custo_atualizado_em: null,
    estoque_minimo: 0,
    perecivel: false,
    observacao: null,
    ativo: true,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    categoria_id: null,
    categoria_nome: null,
    categoria_cor: null,
    setores: [],
    ...parcial,
  }
}

describe('contarUso', () => {
  const produtos: ProdutoCompleto[] = [
    produto({
      id: 'p1',
      nome: 'Filé de tilápia',
      categoria_id: 'c-proteina',
      setores: [
        { setor_id: 's-geral', setor_nome: 'Estoque Geral', setor_cor: '#111111', unidade: 'KG', custo: 41.5, ordem: 0, custo_fixo: false, custo_atualizado_em: null },
        { setor_id: 's-porc', setor_nome: 'Porcionados', setor_cor: '#222222', unidade: 'UND', custo: 6.34, ordem: 1, custo_fixo: false, custo_atualizado_em: null },
      ],
    }),
    produto({ id: 'p2', nome: 'Alcatra', categoria_id: 'c-proteina', setores: [
      { setor_id: 's-geral', setor_nome: 'Estoque Geral', setor_cor: '#111111', unidade: 'KG', custo: 39, ordem: 0, custo_fixo: false, custo_atualizado_em: null },
    ] }),
    produto({ id: 'p3', nome: 'Arquivado', categoria_id: 'c-proteina', ativo: false }),
  ]

  it('conta produto por categoria, ignorando arquivado', () => {
    expect(contarUso(produtos, 'categoria').get('c-proteina')).toBe(2)
  })

  it('um produto em dois setores conta uma vez em cada', () => {
    const uso = contarUso(produtos, 'setor')
    expect(uso.get('s-geral')).toBe(2)
    expect(uso.get('s-porc')).toBe(1)
  })

  it('devolve mapa vazio para quem ninguém usa', () => {
    expect(contarUso(produtos, 'categoria').get('c-bebida')).toBeUndefined()
  })
})

describe('nomeDuplicado e validarCadastro', () => {
  const itens = [item({ id: '1', nome: 'Proteínas' }), item({ id: '2', nome: 'Bebidas' })]

  it('compara sem acento e sem caixa, como o índice único do banco', () => {
    expect(nomeDuplicado('proteinas', itens)).toBe(true)
    expect(nomeDuplicado('PROTEÍNAS', itens)).toBe(true)
    expect(nomeDuplicado('Proteínas', itens, '1')).toBe(false)
    expect(nomeDuplicado('Mercearia', itens)).toBe(false)
  })

  function rascunho(p: Partial<RascunhoDeCadastro> = {}): RascunhoDeCadastro {
    return { nome: 'Mercearia', descricao: '', cor: '#1B7F5A', ordem: 3, ativo: true, ...p }
  }

  it('aprova um cadastro correto', () => {
    expect(validarCadastro(rascunho(), itens, 'categoria')).toEqual([])
  })

  it('cobra nome, cor hexadecimal e ordem inteira não negativa', () => {
    expect(validarCadastro(rascunho({ nome: '   ' }), itens, 'categoria')[0]?.campo).toBe('nome')
    expect(validarCadastro(rascunho({ cor: 'verde' }), itens, 'categoria')[0]?.campo).toBe('cor')
    expect(validarCadastro(rascunho({ ordem: -1 }), itens, 'categoria')[0]?.campo).toBe('ordem')
    expect(validarCadastro(rascunho({ ordem: 1.5 }), itens, 'setor')[0]?.campo).toBe('ordem')
  })

  it('explica a duplicidade citando a comparação sem acento', () => {
    const p = validarCadastro(rascunho({ nome: 'proteinas' }), itens, 'categoria')
    expect(p[0]?.mensagem).toMatch(/sem acento/i)
  })
})

describe('ordenarCadastro e moverNaOrdem', () => {
  const desordenado = [
    item({ id: 'c', nome: 'Carnes', ordem: 2 }),
    item({ id: 'a', nome: 'Aves', ordem: 0 }),
    item({ id: 'b', nome: 'Bebidas', ordem: 1 }),
  ]

  it('ordena por ordem e desempata pelo nome', () => {
    const empate = [
      item({ id: 'z', nome: 'Zebra', ordem: 0 }),
      item({ id: 'a', nome: 'Água', ordem: 0 }),
    ]
    expect(ordenarCadastro(empate).map((i) => i.id)).toEqual(['a', 'z'])
    expect(ordenarCadastro(desordenado).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('subir troca com o vizinho de cima e devolve só o que mudou', () => {
    expect(moverNaOrdem(desordenado, 'c', 'cima')).toEqual([
      { id: 'c', ordem: 1 },
      { id: 'b', ordem: 2 },
    ])
  })

  it('descer faz o inverso', () => {
    expect(moverNaOrdem(desordenado, 'a', 'baixo')).toEqual([
      { id: 'b', ordem: 0 },
      { id: 'a', ordem: 1 },
    ])
  })

  it('nas pontas não faz nada', () => {
    expect(moverNaOrdem(desordenado, 'a', 'cima')).toEqual([])
    expect(moverNaOrdem(desordenado, 'c', 'baixo')).toEqual([])
    expect(moverNaOrdem(desordenado, 'inexistente', 'cima')).toEqual([])
  })

  it('renumera de zero quando a planilha veio com ordem repetida', () => {
    // Todo mundo com ordem 0: trocar dois números manteria o empate e a lista
    // não se mexeria na tela. Por isso a renumeração é do conjunto.
    const empatados = [
      item({ id: 'a', nome: 'Aves', ordem: 0 }),
      item({ id: 'b', nome: 'Bebidas', ordem: 0 }),
      item({ id: 'c', nome: 'Carnes', ordem: 0 }),
    ]
    expect(moverNaOrdem(empatados, 'c', 'cima')).toEqual([
      { id: 'c', ordem: 1 },
      { id: 'b', ordem: 2 },
    ])
  })

  it('não mexe na lista original', () => {
    const copia = [...desordenado]
    moverNaOrdem(desordenado, 'c', 'cima')
    expect(desordenado).toEqual(copia)
  })

  it('proximaOrdem manda o novo para o fim da fila', () => {
    expect(proximaOrdem(desordenado)).toBe(3)
    expect(proximaOrdem([])).toBe(0)
  })
})

describe('avisoDeDesativacao', () => {
  it('diz que setor inativo some da próxima folha de contagem', () => {
    const texto = avisoDeDesativacao('setor', 12)
    expect(texto).toMatch(/12 produtos/)
    expect(texto).toMatch(/folha de contagem/i)
    expect(texto).toMatch(/já fechadas/i)
  })

  it('diz que categoria inativa não tira ninguém da contagem', () => {
    const texto = avisoDeDesativacao('categoria', 1)
    expect(texto).toMatch(/1 produto\b/)
    expect(texto).toMatch(/continuam sendo contados/i)
    expect(texto).toMatch(/CMV por categoria/)
  })

  it('não assusta quando ninguém usa', () => {
    expect(avisoDeDesativacao('setor', 0)).toMatch(/Nenhum produto/)
  })
})

describe('filtrarCadastro', () => {
  const itens = [
    item({ id: '1', nome: 'Proteínas', descricao: 'Carnes e peixes' }),
    item({ id: '2', nome: 'Bebidas', ativo: false }),
  ]

  it('esconde inativo por padrão e mostra quando pedido', () => {
    expect(filtrarCadastro(itens, '', false).map((i) => i.id)).toEqual(['1'])
    expect(filtrarCadastro(itens, '', true).map((i) => i.id)).toEqual(['1', '2'])
  })

  it('busca sem acento no nome e na descrição', () => {
    expect(filtrarCadastro(itens, 'proteinas', false).map((i) => i.id)).toEqual(['1'])
    expect(filtrarCadastro(itens, 'peixes', false).map((i) => i.id)).toEqual(['1'])
  })
})
