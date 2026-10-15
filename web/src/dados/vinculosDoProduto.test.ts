import { describe, expect, it } from 'vitest'
import { costurarProduto, reconciliarVinculos, type VinculoSetor } from './vinculosDoProduto'
import type { ProdutoCompleto, SetorDoProduto } from '@/tipos/banco'

function setorDeAntes(parcial: Partial<SetorDoProduto> & { setor_id: string }): SetorDoProduto {
  return {
    setor_nome: 'Setor',
    setor_cor: '#000',
    unidade: 'KG',
    custo: 10,
    custo_fixo: false,
    custo_atualizado_em: null,
    ordem: 0,
    estoques: [],
    ...parcial,
  }
}

function vinculo(parcial: Partial<VinculoSetor> & { setor_id: string }): VinculoSetor {
  return { unidade: 'KG', custo: 10, custo_fixo: false, estoques: [], ...parcial }
}

function produto(id: string, nome: string): ProdutoCompleto {
  return {
    id,
    restaurante_id: 'r',
    nome,
    codigo: null,
    codigo_barras: null,
    unidade: 'UND',
    custo_medio: 0,
    custo_atualizado_em: null,
    estoque_minimo: 0,
    perecivel: false,
    ativo: true,
    observacao: null,
    criado_em: '2026-10-01T00:00:00Z',
    atualizado_em: '2026-10-01T00:00:00Z',
    conteudo_quantidade: null,
    conteudo_unidade: null,
    categoria_id: null,
    categoria_nome: null,
    categoria_cor: null,
    setores: [],
  } as ProdutoCompleto
}

describe('reconciliarVinculos', () => {
  it('não grava nada quando os setores não mudaram', () => {
    // O caso que motivou tudo: ela corrige o nome do insumo e salva. Não há
    // por que gastar requisição de escrita em produto_setores.
    const antes = [setorDeAntes({ setor_id: 's1', unidade: 'KG', custo: 41.5 })]
    const plano = reconciliarVinculos(antes, [
      vinculo({ setor_id: 's1', unidade: 'KG', custo: 41.5 }),
    ])
    expect(plano.gravarSetores).toEqual([])
    expect(plano.removerSetores).toEqual([])
    expect(plano.removerLugares).toEqual([])
    expect(plano.gravarLugares).toEqual([])
  })

  it('grava só o setor cujo custo mudou', () => {
    const antes = [
      setorDeAntes({ setor_id: 's1', custo: 41.5, ordem: 0 }),
      setorDeAntes({ setor_id: 's2', custo: 6.34, unidade: 'UND', ordem: 1 }),
    ]
    const plano = reconciliarVinculos(antes, [
      vinculo({ setor_id: 's1', custo: 41.5 }),
      vinculo({ setor_id: 's2', custo: 7.1, unidade: 'UND' }),
    ])
    expect(plano.gravarSetores).toEqual([
      { setor_id: 's2', unidade: 'UND', custo: 7.1, custo_fixo: false, ordem: 1 },
    ])
  })

  it('o custo que vem como texto do banco não conta como mudança', () => {
    // numeric do Postgres chega como string em alguns caminhos. Comparar sem
    // converter faria toda tela de insumo regravar todos os setores.
    const antes = [setorDeAntes({ setor_id: 's1', custo: '41.50' as unknown as number })]
    const plano = reconciliarVinculos(antes, [vinculo({ setor_id: 's1', custo: 41.5 })])
    expect(plano.gravarSetores).toEqual([])
  })

  it('mudar a unidade ou o custo fixo conta como mudança', () => {
    const antes = [setorDeAntes({ setor_id: 's1', unidade: 'KG', custo_fixo: false })]
    expect(
      reconciliarVinculos(antes, [vinculo({ setor_id: 's1', unidade: 'G' })]).gravarSetores,
    ).toHaveLength(1)
    expect(
      reconciliarVinculos(antes, [vinculo({ setor_id: 's1', custo_fixo: true })]).gravarSetores,
    ).toHaveLength(1)
  })

  it('reordenar os setores regrava a ordem', () => {
    const antes = [
      setorDeAntes({ setor_id: 's1', ordem: 0 }),
      setorDeAntes({ setor_id: 's2', ordem: 1 }),
    ]
    const plano = reconciliarVinculos(antes, [
      vinculo({ setor_id: 's2' }),
      vinculo({ setor_id: 's1' }),
    ])
    expect(plano.gravarSetores.map((s) => [s.setor_id, s.ordem])).toEqual([
      ['s2', 0],
      ['s1', 1],
    ])
  })

  it('desmarcar um setor pede a remoção dele, e só dele', () => {
    const antes = [setorDeAntes({ setor_id: 's1' }), setorDeAntes({ setor_id: 's2', ordem: 1 })]
    const plano = reconciliarVinculos(antes, [vinculo({ setor_id: 's1' })])
    expect(plano.removerSetores).toEqual(['s2'])
  })

  it('insumo novo grava todos os setores marcados', () => {
    const plano = reconciliarVinculos([], [vinculo({ setor_id: 's1' }), vinculo({ setor_id: 's2' })])
    expect(plano.gravarSetores).toHaveLength(2)
    expect(plano.removerSetores).toEqual([])
  })

  it('o campo estoques não vai para a linha de produto_setores', () => {
    // Mandar junto faria o PostgREST recusar a linha inteira por coluna
    // desconhecida — foi assim que o save morreu a primeira vez.
    const plano = reconciliarVinculos([], [vinculo({ setor_id: 's1', estoques: ['e1'] })])
    expect(plano.gravarSetores[0]).not.toHaveProperty('estoques')
  })

  it('reconcilia os lugares dentro dos setores', () => {
    const antes = [
      setorDeAntes({
        setor_id: 's1',
        estoques: [
          { id: 'e1', nome: 'Geladeira 1' },
          { id: 'e2', nome: 'Geladeira 2' },
        ],
      }),
    ]
    const plano = reconciliarVinculos(antes, [
      vinculo({ setor_id: 's1', estoques: ['e2', 'e3'] }),
    ])
    expect(plano.removerLugares).toEqual(['e1'])
    expect(plano.gravarLugares).toEqual(['e3'])
  })

  it('não apaga setor que este formulário nunca viu', () => {
    // Duas pessoas editando: a outra marcou s9 depois que este formulário
    // abriu. O save não tem por que desfazer isso.
    const antes = [setorDeAntes({ setor_id: 's1' })]
    const plano = reconciliarVinculos(antes, [vinculo({ setor_id: 's1' })])
    expect(plano.removerSetores).not.toContain('s9')
  })
})

describe('costurarProduto', () => {
  it('troca a linha editada no lugar, sem mexer nas outras', () => {
    const lista = [produto('a', 'ABACATE'), produto('b', 'BANANA')]
    const editado = { ...produto('b', 'BANANA'), custo_medio: 9.9 }
    const nova = costurarProduto(lista, editado)
    expect(nova).toHaveLength(2)
    expect(nova[1]?.custo_medio).toBe(9.9)
    expect(nova[0]).toBe(lista[0])
  })

  it('não altera a lista que veio do cache', () => {
    const lista = [produto('a', 'ABACATE')]
    costurarProduto(lista, { ...produto('a', 'ABACATE'), ativo: false })
    expect(lista[0]?.ativo).toBe(true)
  })

  it('insumo novo entra na ordem alfabética', () => {
    const lista = [produto('a', 'ABACATE'), produto('c', 'CEBOLA')]
    const nova = costurarProduto(lista, produto('b', 'BANANA'))
    expect(nova.map((p) => p.nome)).toEqual(['ABACATE', 'BANANA', 'CEBOLA'])
  })

  it('insumo que vem depois de todos entra no fim', () => {
    const lista = [produto('a', 'ABACATE')]
    expect(costurarProduto(lista, produto('z', 'ZUCCHINI')).map((p) => p.nome)).toEqual([
      'ABACATE',
      'ZUCCHINI',
    ])
  })

  it('catálogo vazio vira lista de um', () => {
    expect(costurarProduto([], produto('a', 'ABACATE'))).toHaveLength(1)
  })
})
