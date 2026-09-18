import { describe, expect, it } from 'vitest'
import {
  VARIACAO_NOTAVEL,
  tomDaVariacao,
  variacoesPorContagem,
  type ContagemComparavel,
} from './variacao'

function contagem(
  id: string,
  referencia: string,
  total: number,
  tipo = 'mensal',
  status = 'fechada',
): ContagemComparavel {
  return { id, referencia, tipo, status, total }
}

describe('variacoesPorContagem', () => {
  it('compara com a anterior do mesmo tipo, ignorando a de outro tipo no meio', () => {
    const mapa = variacoesPorContagem([
      contagem('m1', '2026-07-31', 10_000, 'mensal'),
      contagem('s1', '2026-08-10', 3_000, 'semanal'),
      contagem('m2', '2026-08-31', 12_000, 'mensal'),
    ])
    expect(mapa.get('m2')).toMatchObject({
      anteriorId: 'm1',
      anteriorReferencia: '2026-07-31',
      valor: 2_000,
      percentual: 20,
    })
  })

  it('a primeira contagem de um tipo fica sem base, e não com variação zero', () => {
    const mapa = variacoesPorContagem([contagem('m1', '2026-07-31', 10_000)])
    expect(mapa.get('m1')).toMatchObject({ anteriorId: null, valor: null, percentual: null })
  })

  it('a ordem de entrada não muda o resultado', () => {
    const fora = [
      contagem('m3', '2026-09-30', 9_000),
      contagem('m1', '2026-07-31', 10_000),
      contagem('m2', '2026-08-31', 12_000),
    ]
    const mapa = variacoesPorContagem(fora)
    expect(mapa.get('m2')?.anteriorId).toBe('m1')
    expect(mapa.get('m3')?.anteriorId).toBe('m2')
    expect(mapa.get('m3')?.valor).toBe(-3_000)
  })

  it('contagem cancelada não serve de base e nem recebe variação', () => {
    const mapa = variacoesPorContagem([
      contagem('m1', '2026-07-31', 10_000),
      contagem('mx', '2026-08-15', 1, 'mensal', 'cancelada'),
      contagem('m2', '2026-08-31', 12_000),
    ])
    expect(mapa.get('m2')?.anteriorId).toBe('m1')
    expect(mapa.get('mx')).toMatchObject({ anteriorId: null, valor: null })
  })

  it('contagem aberta entra na comparação: o total dela já é o estoque de agora', () => {
    const mapa = variacoesPorContagem([
      contagem('m1', '2026-08-31', 10_000),
      contagem('m2', '2026-09-30', 11_000, 'mensal', 'aberta'),
    ])
    expect(mapa.get('m2')?.valor).toBe(1_000)
  })

  it('base zero não vira percentual infinito, mas o valor em reais continua', () => {
    const mapa = variacoesPorContagem([
      contagem('m1', '2026-07-31', 0),
      contagem('m2', '2026-08-31', 5_000),
    ])
    expect(mapa.get('m2')?.valor).toBe(5_000)
    expect(mapa.get('m2')?.percentual).toBeNull()
  })

  it('toda contagem recebida volta no mapa, inclusive as sem base', () => {
    const entrada = [
      contagem('m1', '2026-07-31', 10_000),
      contagem('s1', '2026-08-03', 2_000, 'semanal'),
      contagem('a1', '2026-08-04', 500, 'avulsa'),
    ]
    const mapa = variacoesPorContagem(entrada)
    expect(mapa.size).toBe(3)
    expect([...mapa.keys()].sort()).toEqual(['a1', 'm1', 's1'])
  })
})

describe('tomDaVariacao · a cor diz magnitude, não direção', () => {
  const base = { anteriorId: 'x', anteriorReferencia: '2026-07-31', anteriorTotal: 100 }

  it('queda grande e alta grande recebem o mesmo tom de atenção', () => {
    expect(tomDaVariacao({ ...base, valor: 40, percentual: 40 })).toBe('alerta')
    expect(tomDaVariacao({ ...base, valor: -40, percentual: -40 })).toBe('alerta')
  })

  it('variação de rotina fica neutra, para cima ou para baixo', () => {
    expect(tomDaVariacao({ ...base, valor: 5, percentual: 5 })).toBe('neutro')
    expect(tomDaVariacao({ ...base, valor: -5, percentual: -5 })).toBe('neutro')
  })

  it('exatamente no limite já conta como notável', () => {
    // Literal dos dois lados, de proposito. Usar VARIACAO_NOTAVEL como entrada
    // esperada tornava a assercao circular: "no limiar, e o limiar" passa com
    // qualquer limiar. Dobrar a constante para 30 nao derrubava nenhum dos 11
    // testes deste arquivo — e o destaque "confira este item" deixava de
    // disparar entre 15% e 29%, que e onde moram unidade trocada e item
    // esquecido.
    expect(tomDaVariacao({ ...base, valor: 15, percentual: 14.99 })).toBe('neutro')
    expect(tomDaVariacao({ ...base, valor: 15, percentual: 15 })).toBe('alerta')
    expect(tomDaVariacao({ ...base, valor: -15, percentual: -14.99 })).toBe('neutro')
    expect(tomDaVariacao({ ...base, valor: -15, percentual: -15 })).toBe('alerta')
    expect(VARIACAO_NOTAVEL).toBe(15)
  })

  it('sem base não há alarme', () => {
    expect(
      tomDaVariacao({
        anteriorId: null,
        anteriorReferencia: null,
        anteriorTotal: null,
        valor: null,
        percentual: null,
      }),
    ).toBe('neutro')
  })
})
