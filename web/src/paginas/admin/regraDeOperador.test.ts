import { describe, expect, it } from 'vitest'
import {
  emailSintetico,
  podeCriarOperador,
  validarOperador,
  type QuemCria,
} from './regraDeOperador'

const ator = (parcial: Partial<QuemCria> = {}): QuemCria => ({
  id: 'u1', papel: 'admin', restaurante_id: 'r1', ...parcial,
})

describe('quem cria acesso de operador', () => {
  it('master cria em qualquer restaurante', () => {
    expect(podeCriarOperador(ator({ papel: 'master', restaurante_id: null }), 'r9').permitido).toBe(true)
  })

  it('admin cria no proprio restaurante, e so nele', () => {
    expect(podeCriarOperador(ator(), 'r1').permitido).toBe(true)
    expect(podeCriarOperador(ator(), 'r2').permitido).toBe(false)
  })

  it('gerente nao mexe em equipe — equipe e identidade', () => {
    // A mesma linha que a migracao 0014 corrigiu nas politicas de convite.
    expect(podeCriarOperador(ator({ papel: 'gerente' }), 'r1').permitido).toBe(false)
    expect(podeCriarOperador(ator({ papel: 'operador' }), 'r1').permitido).toBe(false)
  })

  it('sem perfil carregado, nao', () => {
    expect(podeCriarOperador(null, 'r1').permitido).toBe(false)
  })
})

describe('o que o formulario cobra', () => {
  const bom = { nome: 'Operador Bar', usuario: 'Operador Bar', senha: 'OperadorBar@2026', setores: ['s1'] }

  it('aceita o caso certo', () => {
    expect(validarOperador(bom)).toEqual([])
  })

  it('cobra nome, login, senha e ao menos um setor', () => {
    const p = validarOperador({ nome: '  ', usuario: 'ab', senha: '123', setores: [] })
    expect(p.map((x) => x.campo).sort()).toEqual(['nome', 'senha', 'setores', 'usuario'])
  })

  it('recusa login com caractere que atrapalha quem digita', () => {
    expect(validarOperador({ ...bom, usuario: 'bar@casa' }).some((p) => p.campo === 'usuario')).toBe(true)
    // Acento passa: quem digita "Descartáveis" nao tem de saber tirar o acento.
    expect(validarOperador({ ...bom, usuario: 'Operador Descartáveis' })).toEqual([])
  })

  it('senha curta e recusada antes de chegar no servidor', () => {
    expect(validarOperador({ ...bom, senha: 'curta12' }).some((p) => p.campo === 'senha')).toBe(true)
  })
})

describe('o e-mail sintetico', () => {
  it('sai do login e do restaurante, sem acento nem espaco', () => {
    expect(emailSintetico('Operador Bar', 'bar-do-zeca')).toBe('operador-bar@bar-do-zeca.local')
    expect(emailSintetico('Operador Descartáveis', 'bar-do-zeca')).toBe('operador-descartaveis@bar-do-zeca.local')
  })

  it('dois restaurantes podem ter o mesmo login sem colidir no GoTrue', () => {
    expect(emailSintetico('Operador Bar', 'casa-a')).not.toBe(emailSintetico('Operador Bar', 'casa-b'))
  })

  it('nao devolve endereco quebrado quando o texto e estranho', () => {
    expect(emailSintetico('!!!', 'casa')).toBe('operador@casa.local')
    expect(emailSintetico('Bar', '???')).toBe('bar@restaurante.local')
  })
})
