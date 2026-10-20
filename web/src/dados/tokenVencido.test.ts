/**
 * "JWT expired" não é oscilação de rede, e a diferença não é acadêmica.
 *
 * Quando o token vencia, a tela dizia à cliente que a conta estava certa, que
 * ela "continuava conectada" e que o problema "passa numa segunda tentativa".
 * As três coisas falsas — e o botão "Tentar de novo" repetia a consulta com o
 * mesmo token vencido, então não podia funcionar nunca. A única saída era
 * Sair, oferecido como opção secundária.
 */
import { describe, expect, it } from 'vitest'
import { ehTokenVencido } from './sessao'

describe('ehTokenVencido', () => {
  it('reconhece o código do PostgREST', () => {
    expect(ehTokenVencido({ code: 'PGRST301', message: 'qualquer coisa' })).toBe(true)
  })

  it('reconhece o texto, que é o que chega pelo caminho da exceção', () => {
    expect(ehTokenVencido({ message: 'JWT expired' })).toBe(true)
    expect(ehTokenVencido({ message: 'jwt is expired' })).toBe(true)
    // Caixa não pode decidir isso: foi assim que a maiúscula furou a trava de
    // rota do módulo de contagem.
    expect(ehTokenVencido({ message: 'Jwt Expired' })).toBe(true)
  })

  it('não confunde com falha de rede, que é o caso em que insistir resolve', () => {
    expect(ehTokenVencido({ message: 'Failed to fetch' })).toBe(false)
    expect(ehTokenVencido({ message: 'A consulta passou do prazo' })).toBe(false)
    expect(ehTokenVencido({ code: 'PGRST116', message: 'no rows' })).toBe(false)
  })

  it('não confunde com falta de permissão, que insistir também não resolve — mas por outro motivo', () => {
    expect(ehTokenVencido({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  it('nulo e vazio não são token vencido', () => {
    expect(ehTokenVencido(null)).toBe(false)
    expect(ehTokenVencido({})).toBe(false)
  })
})
