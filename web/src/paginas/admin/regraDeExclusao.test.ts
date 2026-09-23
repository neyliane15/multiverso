import { describe, expect, it } from 'vitest'
import { podeExcluirUsuario, type QuemMexe } from './regraDeExclusao'

const CASA_A = 'r-a'
const CASA_B = 'r-b'

const master: QuemMexe = { id: 'm', papel: 'master', restaurante_id: null }
const adminA: QuemMexe = { id: 'aa', papel: 'admin', restaurante_id: CASA_A }
const adminB: QuemMexe = { id: 'ab', papel: 'admin', restaurante_id: CASA_B }
const gerenteA: QuemMexe = { id: 'ga', papel: 'gerente', restaurante_id: CASA_A }
const operA: QuemMexe = { id: 'oa', papel: 'operador', restaurante_id: CASA_A }
const operB: QuemMexe = { id: 'ob', papel: 'operador', restaurante_id: CASA_B }

describe('podeExcluirUsuario · master', () => {
  it('exclui qualquer um', () => {
    for (const alvo of [adminA, adminB, gerenteA, operA, operB]) {
      expect(podeExcluirUsuario(master, alvo).permitido).toBe(true)
    }
  })

  it('menos ele mesmo', () => {
    const v = podeExcluirUsuario(master, master)
    expect(v.permitido).toBe(false)
    expect(v.motivo).toContain('própria conta')
  })
})

describe('podeExcluirUsuario · admin', () => {
  it('exclui a equipe do proprio restaurante', () => {
    expect(podeExcluirUsuario(adminA, gerenteA).permitido).toBe(true)
    expect(podeExcluirUsuario(adminA, operA).permitido).toBe(true)
  })

  it('exclui outro admin da mesma casa', () => {
    const outroAdminA: QuemMexe = { id: 'aa2', papel: 'admin', restaurante_id: CASA_A }
    expect(podeExcluirUsuario(adminA, outroAdminA).permitido).toBe(true)
  })

  it('nao alcanca o restaurante alheio', () => {
    expect(podeExcluirUsuario(adminA, operB)).toMatchObject({
      permitido: false,
      motivo: 'Este usuário é de outro restaurante.',
    })
  })

  it('nao exclui um master', () => {
    // O master nao tem restaurante, entao a comparacao sozinha ja barraria —
    // mas a razao precisa ser dita, senao a tela mente o motivo.
    expect(podeExcluirUsuario(adminA, master)).toMatchObject({
      permitido: false,
      motivo: 'Um admin não exclui um master.',
    })
  })

  it('nem a propria conta', () => {
    expect(podeExcluirUsuario(adminA, adminA).permitido).toBe(false)
  })
})

describe('podeExcluirUsuario · quem nao mexe em equipe', () => {
  it('gerente nao exclui ninguem', () => {
    // Mesma regra da RLS de convites: `mv_pode_administrar` inclui gerente e
    // por isso NAO serve para decidir equipe.
    expect(podeExcluirUsuario(gerenteA, operA)).toMatchObject({
      permitido: false,
      motivo: 'Só master e admin mexem em equipe.',
    })
  })

  it('operador tampouco', () => {
    expect(podeExcluirUsuario(operA, gerenteA).permitido).toBe(false)
  })

  it('sem perfil carregado, nao', () => {
    expect(podeExcluirUsuario(null, operA).permitido).toBe(false)
  })
})
