import { describe, expect, it } from 'vitest'
import {
  avaliarRisco,
  avaliarUltimaContagem,
  dataIso,
  diasEntre,
  inicioDoMes,
  ordenarPanorama,
  progressoDaContagem,
  resumirCompras,
  type CompraDoPainel,
  type RestauranteDoPanorama,
} from './logicaDoPainel'

describe('datas', () => {
  it('usa o dia local, não o dia em UTC', () => {
    // 23h de 30/09 em Brasília já é 1º/10 em UTC. A referência da contagem é
    // dia de calendário do restaurante, então tem de continuar 30/09.
    const noite = new Date(2026, 8, 30, 23, 30)
    expect(dataIso(noite)).toBe('2026-09-30')
  })

  it('inicioDoMes corta o dia', () => {
    expect(inicioDoMes('2026-09-18')).toBe('2026-09-01')
  })

  it('diasEntre conta dias inteiros, inclusive atravessando o mês', () => {
    expect(diasEntre('2026-09-18', '2026-09-18')).toBe(0)
    expect(diasEntre('2026-08-31', '2026-09-01')).toBe(1)
    expect(diasEntre('2026-09-01', '2026-08-31')).toBe(-1)
    expect(diasEntre('2026-01-01T10:00:00Z', '2026-01-31')).toBe(30)
  })
})

describe('avaliarUltimaContagem', () => {
  const hoje = '2026-09-18'

  it('diz que nunca houve contagem, sem inventar número', () => {
    const r = avaliarUltimaContagem(null, hoje)
    expect(r.estado).toBe('nunca')
    expect(r.dias).toBeNull()
    expect(r.mensagem).toMatch(/CMV/)
  })

  it('está em dia dentro de duas semanas', () => {
    expect(avaliarUltimaContagem('2026-09-18', hoje).estado).toBe('em-dia')
    expect(avaliarUltimaContagem('2026-09-04', hoje).estado).toBe('em-dia')
  })

  it('vira atraso no décimo quinto dia e crítico depois de um mês', () => {
    expect(avaliarUltimaContagem('2026-09-03', hoje).estado).toBe('atrasada')
    expect(avaliarUltimaContagem('2026-08-19', hoje).estado).toBe('atrasada')
    expect(avaliarUltimaContagem('2026-08-18', hoje).estado).toBe('muito-atrasada')
  })

  it('escreve o número de dias na mensagem', () => {
    expect(avaliarUltimaContagem('2026-09-17', hoje).mensagem).toMatch(/1 dia/)
    expect(avaliarUltimaContagem('2026-09-18', hoje).mensagem).toMatch(/hoje/i)
  })
})

describe('progressoDaContagem', () => {
  it('arredonda para inteiro e trava entre 0 e 100', () => {
    expect(progressoDaContagem(0, 852)).toBe(0)
    expect(progressoDaContagem(426, 852)).toBe(50)
    expect(progressoDaContagem(852, 852)).toBe(100)
    expect(progressoDaContagem(900, 852)).toBe(100)
  })

  it('folha sem item nenhum é zero, nunca cem', () => {
    expect(progressoDaContagem(0, 0)).toBe(0)
  })
})

describe('resumirCompras', () => {
  const compras: CompraDoPainel[] = [
    { emitida_em: '2026-09-02', valor_total: 1000, itens_pendentes: 0, status: 'lancada' },
    { emitida_em: '2026-09-15T08:00:00Z', valor_total: 500.5, itens_pendentes: 3, status: 'importada' },
    { emitida_em: '2026-09-16', valor_total: 999, itens_pendentes: 2, status: 'cancelada' },
    { emitida_em: '2026-08-31', valor_total: 700, itens_pendentes: 0, status: 'lancada' },
  ]

  it('soma o mês, ignora nota cancelada e ignora o que está fora do intervalo', () => {
    const r = resumirCompras(compras, '2026-09-01', '2026-09-30')
    expect(r.notas).toBe(2)
    expect(r.total).toBeCloseTo(1500.5, 2)
  })

  it('conta separadamente as notas com item pendente de vínculo', () => {
    const r = resumirCompras(compras, '2026-09-01', '2026-09-30')
    expect(r.notasPendentes).toBe(1)
    expect(r.itensPendentes).toBe(3)
  })

  it('devolve tudo zerado quando nada cai no intervalo', () => {
    expect(resumirCompras(compras, '2026-07-01', '2026-07-31')).toEqual({
      notas: 0,
      total: 0,
      notasPendentes: 0,
      itensPendentes: 0,
    })
  })
})

/* ------------------------------------------------------------- panorama --- */

function casa(parcial: Partial<RestauranteDoPanorama> & { id: string; nome: string }): RestauranteDoPanorama {
  return {
    ativo: true,
    criado_em: '2025-01-10T12:00:00Z',
    ultima_contagem: null,
    ultimo_acesso: null,
    valor_estoque: null,
    ...parcial,
  }
}

describe('avaliarRisco', () => {
  const hoje = '2026-09-18'

  it('restaurante novo sem contagem não é acusado de abandono', () => {
    const r = avaliarRisco(casa({ id: '1', nome: 'Novo', criado_em: '2026-09-10T00:00:00Z' }), hoje)
    expect(r.nivel).toBe('novo')
    expect(r.motivo).toMatch(/8 dias/)
  })

  it('restaurante velho que nunca contou é crítico', () => {
    const r = avaliarRisco(casa({ id: '2', nome: 'Parado', criado_em: '2026-01-01T00:00:00Z' }), hoje)
    expect(r.nivel).toBe('critico')
    expect(r.dias).toBeNull()
  })

  it('classifica pelo tempo desde a última contagem', () => {
    expect(avaliarRisco(casa({ id: '3', nome: 'A', ultima_contagem: '2026-09-15' }), hoje).nivel).toBe('ok')
    expect(avaliarRisco(casa({ id: '4', nome: 'B', ultima_contagem: '2026-09-01' }), hoje).nivel).toBe('atencao')
    expect(avaliarRisco(casa({ id: '5', nome: 'C', ultima_contagem: '2026-06-01' }), hoje).nivel).toBe('critico')
  })

  it('restaurante desativado não é sinal de abandono, é decisão', () => {
    const r = avaliarRisco(casa({ id: '6', nome: 'D', ativo: false, ultima_contagem: '2024-01-01' }), hoje)
    expect(r.nivel).toBe('inativo')
  })
})

describe('ordenarPanorama', () => {
  const hoje = '2026-09-18'
  const lista: RestauranteDoPanorama[] = [
    casa({ id: 'ok', nome: 'Zebra', ultima_contagem: '2026-09-17', valor_estoque: 10 }),
    casa({ id: 'critico', nome: 'Alfa', ultima_contagem: '2026-05-01', valor_estoque: 900 }),
    casa({ id: 'atencao', nome: 'Beta', ultima_contagem: '2026-09-01', valor_estoque: 50 }),
    casa({ id: 'inativo', nome: 'Gama', ativo: false, valor_estoque: 5000 }),
  ]

  it('por risco, quem está sumindo aparece primeiro e o inativo vai para o fim', () => {
    expect(ordenarPanorama(lista, 'risco', hoje).map((r) => r.id)).toEqual([
      'critico',
      'atencao',
      'ok',
      'inativo',
    ])
  })

  it('dentro do mesmo nível, o mais parado vem antes', () => {
    const empatados: RestauranteDoPanorama[] = [
      casa({ id: 'menos', nome: 'A', ultima_contagem: '2026-07-01' }),
      casa({ id: 'mais', nome: 'B', ultima_contagem: '2026-03-01' }),
    ]
    expect(ordenarPanorama(empatados, 'risco', hoje).map((r) => r.id)).toEqual(['mais', 'menos'])
  })

  it('por nome usa a ordem do português', () => {
    expect(ordenarPanorama(lista, 'nome', hoje).map((r) => r.nome)).toEqual([
      'Alfa',
      'Beta',
      'Gama',
      'Zebra',
    ])
  })

  it('por estoque desce, e quem não tem contagem fica por último', () => {
    const semEstoque = casa({ id: 'sem', nome: 'Sem', valor_estoque: null })
    expect(ordenarPanorama([...lista, semEstoque], 'estoque', hoje).map((r) => r.id)).toEqual([
      'inativo',
      'critico',
      'atencao',
      'ok',
      'sem',
    ])
  })

  it('não mexe na lista que recebeu', () => {
    const original = [...lista]
    ordenarPanorama(lista, 'risco', hoje)
    expect(lista).toEqual(original)
  })
})
