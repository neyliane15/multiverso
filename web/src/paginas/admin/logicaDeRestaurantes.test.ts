import { describe, expect, it } from 'vitest'
import {
  documentoAceitavel,
  gerarSlug,
  restauranteDoRascunho,
  slugDuplicado,
  slugLivre,
  slugValido,
  validarRestaurante,
  type RascunhoDeRestaurante,
  type RestauranteConhecido,
} from './logicaDeRestaurantes'

describe('gerarSlug', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(gerarSlug('Restaurante Açaí & Cia.')).toBe('restaurante-acai-cia')
    expect(gerarSlug('Bar do Zé')).toBe('bar-do-ze')
    expect(gerarSlug('CANTINA ITÁLIA')).toBe('cantina-italia')
  })

  it('não deixa hífen pendurado nas pontas nem repetido no meio', () => {
    expect(gerarSlug('  --- Churrascaria  ///  Gaúcha --- ')).toBe('churrascaria-gaucha')
  })

  it('preserva números', () => {
    expect(gerarSlug('Unidade 2 — Centro')).toBe('unidade-2-centro')
  })

  it('corta no limite sem terminar em hífen', () => {
    const longo = gerarSlug('Restaurante Muito Comprido Da Esquina Com A Avenida Central')
    expect(longo.length).toBeLessThanOrEqual(48)
    expect(longo.endsWith('-')).toBe(false)
    expect(slugValido(longo)).toBe(true)
  })

  it('devolve vazio quando não sobra letra nenhuma', () => {
    expect(gerarSlug('!!! ???')).toBe('')
  })
})

describe('slugValido', () => {
  it('aceita minúsculas, números e hífen simples', () => {
    expect(slugValido('bar-do-ze')).toBe(true)
    expect(slugValido('unidade2')).toBe(true)
  })

  it('recusa acento, espaço, caixa alta e hífen nas pontas', () => {
    expect(slugValido('bar do ze')).toBe(false)
    expect(slugValido('Bar-Do-Ze')).toBe(false)
    expect(slugValido('acaí')).toBe(false)
    expect(slugValido('-bar')).toBe(false)
    expect(slugValido('bar--ze')).toBe(false)
    expect(slugValido('')).toBe(false)
  })
})

const existentes: RestauranteConhecido[] = [
  { id: '1', nome: 'Bar do Zé', slug: 'bar-do-ze' },
  { id: '2', nome: 'Cantina Itália', slug: 'cantina-italia' },
]

describe('slugDuplicado e slugLivre', () => {
  it('não acusa o próprio registro ao editar', () => {
    expect(slugDuplicado('bar-do-ze', existentes)).toBe(true)
    expect(slugDuplicado('bar-do-ze', existentes, '1')).toBe(false)
  })

  it('sugere o próximo livre para a segunda unidade', () => {
    expect(slugLivre('bar-do-ze', existentes)).toBe('bar-do-ze-2')
    expect(slugLivre('bar-do-ze', [...existentes, { id: '3', nome: 'x', slug: 'bar-do-ze-2' }])).toBe(
      'bar-do-ze-3',
    )
  })

  it('devolve o próprio slug quando já está livre', () => {
    expect(slugLivre('pizzaria-nova', existentes)).toBe('pizzaria-nova')
  })
})

describe('documentoAceitavel', () => {
  it('aceita CNPJ, CPF e vazio; recusa contagem torta', () => {
    expect(documentoAceitavel('11.222.333/0001-81')).toBe(true)
    expect(documentoAceitavel('123.456.789-01')).toBe(true)
    expect(documentoAceitavel('')).toBe(true)
    expect(documentoAceitavel('123')).toBe(false)
  })
})

function rascunho(parcial: Partial<RascunhoDeRestaurante> = {}): RascunhoDeRestaurante {
  return {
    nome: 'Pizzaria Nova',
    slug: 'pizzaria-nova',
    documento: '',
    unidade: '',
    fuso: 'America/Sao_Paulo',
    dia_virada_semana: 1,
    ativo: true,
    ...parcial,
  }
}

describe('validarRestaurante', () => {
  it('aprova um cadastro mínimo', () => {
    expect(validarRestaurante(rascunho(), existentes)).toEqual([])
  })

  it('cobra nome e recusa nome repetido sem acento', () => {
    expect(validarRestaurante(rascunho({ nome: '  ' }), existentes)[0]?.campo).toBe('nome')
    const repetido = validarRestaurante(
      rascunho({ nome: 'cantina italia', slug: 'outra' }),
      existentes,
    )
    expect(repetido.some((p) => p.campo === 'nome')).toBe(true)
  })

  it('recusa slug inválido e slug de outro restaurante', () => {
    expect(validarRestaurante(rascunho({ slug: 'Slug Errado' }), existentes)[0]?.campo).toBe('slug')
    expect(
      validarRestaurante(rascunho({ slug: 'bar-do-ze' }), existentes).some((p) => p.campo === 'slug'),
    ).toBe(true)
  })

  it('deixa editar o próprio registro sem acusar duplicidade', () => {
    const meu = rascunho({ id: '1', nome: 'Bar do Zé', slug: 'bar-do-ze' })
    expect(validarRestaurante(meu, existentes)).toEqual([])
  })

  it('recusa dia de virada fora de 0..6', () => {
    expect(
      validarRestaurante(rascunho({ dia_virada_semana: 9 }), existentes).some(
        (p) => p.campo === 'dia_virada_semana',
      ),
    ).toBe(true)
  })
})

describe('restauranteDoRascunho', () => {
  it('guarda só os dígitos do documento e transforma vazio em null', () => {
    const r = restauranteDoRascunho(rascunho({ documento: '11.222.333/0001-81', unidade: '  ' }))
    expect(r.documento).toBe('11222333000181')
    expect(r.unidade).toBeNull()
  })

  it('não manda id quando é cadastro novo', () => {
    expect('id' in restauranteDoRascunho(rascunho())).toBe(false)
    expect(restauranteDoRascunho(rascunho({ id: '1' })).id).toBe('1')
  })
})
