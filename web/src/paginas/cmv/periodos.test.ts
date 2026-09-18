import { describe, expect, it } from 'vitest'
import type { CmvPeriodo, CmvSerie } from '@/tipos/banco'
import {
  conferirFormula,
  explicarPendencia,
  ordenarCategorias,
  periodoSugerido,
  pontosDaSerie,
  resumirSerie,
  type CategoriaDeCmv,
} from './periodos'

function periodo(parcial: Partial<CmvSerie> & { rotulo: string }): CmvSerie {
  return {
    inicio: '2026-09-01',
    fim: '2026-09-30',
    estoque_inicial: 10_000,
    compras: 30_000,
    estoque_final: 8_000,
    cmv: 32_000,
    completo: true,
    pendencia: null,
    ...parcial,
  }
}

const INCOMPLETO = (rotulo: string, pendencia: string): CmvSerie =>
  periodo({
    rotulo,
    estoque_inicial: 10_000,
    estoque_final: null,
    cmv: null,
    completo: false,
    pendencia,
  })

describe('explicarPendencia', () => {
  it('período completo não tem o que explicar', () => {
    expect(explicarPendencia(periodo({ rotulo: 'Set/26' }))).toBeNull()
  })

  it('reconhece o texto do banco mesmo sem acento e aponta a contagem', () => {
    const explicada = explicarPendencia(INCOMPLETO('Set/26', 'Falta a contagem de estoque final'))
    expect(explicada?.titulo).toBe('Falta a contagem de estoque final')
    expect(explicada?.acao?.caminho).toBe('/contagem')
    expect(explicada?.explicacao.length).toBeGreaterThan(20)
  })

  it('estoque inicial faltando manda para o histórico, não para abrir contagem nova', () => {
    const explicada = explicarPendencia(INCOMPLETO('Set/26', 'Falta a contagem de estoque inicial'))
    expect(explicada?.acao?.caminho).toBe('/contagem/historico')
  })

  it('pendência desconhecida é repassada como veio, sem inventar motivo', () => {
    const explicada = explicarPendencia(INCOMPLETO('Set/26', 'Contagem travada pelo fiscal'))
    expect(explicada?.titulo).toBe('Contagem travada pelo fiscal')
  })

  it('incompleto sem texto nenhum ainda explica alguma coisa', () => {
    const mudo = periodo({ rotulo: 'Set/26', completo: false, cmv: null, pendencia: null })
    expect(explicarPendencia(mudo)?.titulo).toBe('Nenhuma contagem fechada neste período')
  })
})

describe('pontosDaSerie · período incompleto nunca vira zero', () => {
  const serie = [
    periodo({ rotulo: 'Jul/26' }),
    INCOMPLETO('Ago/26', 'Falta a contagem de estoque final'),
  ]

  it('mantém o período no eixo, com o rótulo, mesmo sem número', () => {
    const pontos = pontosDaSerie(serie)
    expect(pontos.map((p) => p.rotulo)).toEqual(['Jul/26', 'Ago/26'])
  })

  it('CMV e estoques do período incompleto vêm nulos, não zerados', () => {
    const [, incompleto] = pontosDaSerie(serie)
    expect(incompleto?.cmv).toBeNull()
    expect(incompleto?.estoqueInicial).toBeNull()
    expect(incompleto?.estoqueFinal).toBeNull()
  })

  it('compras continuam valendo: elas não dependem de contagem', () => {
    const [, incompleto] = pontosDaSerie(serie)
    expect(incompleto?.compras).toBe(30_000)
  })
})

describe('resumirSerie', () => {
  it('a média ignora o período incompleto em vez de somá-lo como zero', () => {
    const resumo = resumirSerie([
      periodo({ rotulo: 'Jul/26', cmv: 30_000 }),
      periodo({ rotulo: 'Ago/26', cmv: 40_000 }),
      INCOMPLETO('Set/26', 'Falta a contagem de estoque final'),
    ])
    expect(resumo).toMatchObject({ periodos: 3, completos: 2, incompletos: 1 })
    expect(resumo.cmvMedio).toBe(35_000)
  })

  it('série sem nenhum período completo não tem média', () => {
    const resumo = resumirSerie([INCOMPLETO('Set/26', 'Falta a contagem de estoque inicial')])
    expect(resumo.cmvMedio).toBeNull()
  })

  it('série vazia não quebra', () => {
    expect(resumirSerie([])).toMatchObject({ periodos: 0, completos: 0, cmvMedio: null })
  })
})

describe('periodoSugerido', () => {
  it('abre no mais recente que tem CMV fechado, não na semana em curso', () => {
    const serie = [
      periodo({ rotulo: 'Jul/26' }),
      periodo({ rotulo: 'Ago/26' }),
      INCOMPLETO('Set/26', 'Falta a contagem de estoque final'),
    ]
    expect(periodoSugerido(serie)?.rotulo).toBe('Ago/26')
  })

  it('sem nenhum completo, abre no mais recente e mostra a pendência', () => {
    const serie = [
      INCOMPLETO('Ago/26', 'Falta a contagem de estoque inicial'),
      INCOMPLETO('Set/26', 'Falta a contagem de estoque final'),
    ]
    expect(periodoSugerido(serie)?.rotulo).toBe('Set/26')
  })

  it('série vazia devolve nulo', () => {
    expect(periodoSugerido([])).toBeNull()
  })
})

describe('ordenarCategorias', () => {
  const categorias: CategoriaDeCmv[] = [
    {
      categoria_id: 'b',
      categoria_nome: 'Bebidas',
      categoria_cor: '#0000aa',
      estoque_inicial: 1_000,
      compras: 3_000,
      estoque_final: 2_000,
      cmv: 2_000,
    },
    {
      categoria_id: 'c',
      categoria_nome: 'Carnes',
      categoria_cor: '#aa0000',
      estoque_inicial: 5_000,
      compras: 9_000,
      estoque_final: 6_000,
      cmv: 8_000,
    },
    {
      categoria_id: 'm',
      categoria_nome: 'Mercearia',
      categoria_cor: '#00aa00',
      estoque_inicial: 2_000,
      compras: 1_000,
      estoque_final: 4_000,
      cmv: -1_000,
    },
  ]

  it('ordena do maior CMV para o menor', () => {
    expect(ordenarCategorias(categorias).map((c) => c.categoria_id)).toEqual(['c', 'b', 'm'])
  })

  it('a participação soma 100% entre as categorias que consumiram', () => {
    const linhas = ordenarCategorias(categorias)
    const soma = linhas.reduce((total, l) => total + (l.participacao ?? 0), 0)
    expect(soma).toBeCloseTo(100, 6)
  })

  it('categoria com CMV negativo aparece, com participação zero', () => {
    const negativa = ordenarCategorias(categorias).find((c) => c.categoria_id === 'm')
    expect(negativa?.participacao).toBe(0)
    expect(negativa?.proporcao).toBeGreaterThan(0)
  })

  it('categoria sem as duas contagens vai para o fim, sem fatia e sem barra', () => {
    // Nulo nao e zero. Tratar como zero colocaria a categoria entre as que
    // menos consumiram — uma afirmacao que ninguem fez. O caso real: periodo
    // sem contagem de fechamento, em que o CMV nao existe para ninguem.
    const comNulo = [
      ...categorias,
      {
        categoria_id: 'x',
        categoria_nome: 'HORTIFRUTI',
        categoria_cor: '#3FAE86',
        estoque_inicial: 4_000,
        compras: 900,
        estoque_final: null,
        cmv: null,
      },
    ]
    const linhas = ordenarCategorias(comNulo)

    expect(linhas[linhas.length - 1]?.categoria_id).toBe('x')
    expect(linhas[linhas.length - 1]?.participacao).toBeNull()
    expect(linhas[linhas.length - 1]?.proporcao).toBe(0)

    // E nao contamina o resto: a fatia das que tem CMV continua somando 100%.
    const soma = linhas.reduce((total, l) => total + (l.participacao ?? 0), 0)
    expect(soma).toBeCloseTo(100, 6)
  })

  it('a barra é relativa ao maior valor absoluto', () => {
    const linhas = ordenarCategorias(categorias)
    expect(linhas[0]?.proporcao).toBe(100)
    expect(linhas[1]?.proporcao).toBe(25)
  })

  it('período em que nada foi consumido não gera divisão por zero', () => {
    const zeradas = ordenarCategorias([{ ...categorias[0]!, cmv: 0 }])
    expect(zeradas[0]).toMatchObject({ participacao: 0, proporcao: 0 })
  })

  it('não altera o array recebido', () => {
    const copia = [...categorias]
    ordenarCategorias(categorias)
    expect(categorias).toEqual(copia)
  })
})

describe('conferirFormula', () => {
  function completo(parcial: Partial<CmvPeriodo> = {}): CmvPeriodo {
    return {
      inicio: '2026-09-01',
      fim: '2026-09-30',
      estoque_inicial: 10_000,
      estoque_inicial_data: '2026-08-31',
      estoque_inicial_id: 'c1',
      compras: 30_000,
      compras_notas: 12,
      estoque_final: 8_000,
      estoque_final_data: '2026-09-30',
      estoque_final_id: 'c2',
      cmv: 32_000,
      completo: true,
      pendencia: null,
      ...parcial,
    }
  }

  it('confere estoque inicial + compras − estoque final', () => {
    expect(conferirFormula(completo())).toBe(true)
  })

  it('aceita o centavo de arredondamento do banco', () => {
    expect(conferirFormula(completo({ cmv: 32_000.004 }))).toBe(true)
  })

  it('acusa quando os números não fecham', () => {
    expect(conferirFormula(completo({ cmv: 31_000 }))).toBe(false)
  })

  it('período incompleto não confere coisa nenhuma', () => {
    expect(conferirFormula(completo({ completo: false, cmv: null }))).toBe(false)
  })
})
