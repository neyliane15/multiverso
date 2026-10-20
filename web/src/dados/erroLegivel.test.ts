/**
 * O texto que a cliente lê quando o banco está atrás do código.
 *
 * Existe porque isso aconteceu de verdade: o Vercel publicou as telas novas,
 * o Supabase não recebeu as migrações, e a tela de relatório mostrou
 * "Could not find the function public.mv_relatorio_de_contagem(p_contagem) in
 * the schema cache" numa caixa vermelha, para quem administra um restaurante.
 */
import { describe, expect, it } from 'vitest'
import { erro } from './consultas'

/** Pega a mensagem que `erro` levanta, ou null quando ela deixa passar. */
function mensagemDe(e: { message: string; code?: string } | null): string | null {
  try {
    erro(e)
    return null
  } catch (lancado) {
    return lancado instanceof Error ? lancado.message : String(lancado)
  }
}

describe('erro legível', () => {
  it('nulo não levanta nada', () => {
    expect(mensagemDe(null)).toBeNull()
  })

  it('função que falta vira instrução, não despejo de diagnóstico', () => {
    const m = mensagemDe({
      code: 'PGRST202',
      message:
        'Could not find the function public.mv_relatorio_de_contagem(p_contagem) in the schema cache',
    })
    expect(m).toContain('mv_relatorio_de_contagem')
    expect(m).toContain('migrações')
    expect(m).toContain('npm run carga')
    // O jargão não pode sobreviver na mensagem que a pessoa lê.
    expect(m).not.toContain('schema cache')
    expect(m).not.toContain('Could not find')
  })

  it('tabela que falta diz "tabela", e nomeia qual', () => {
    const m = mensagemDe({
      code: 'PGRST205',
      message: "Could not find the table 'public.vendas' in the schema cache",
    })
    expect(m).toContain('A tabela')
    expect(m).toContain('vendas')
    expect(m).toContain('migrações')
  })

  it('diz que são dois passos — é a parte que ninguém adivinha', () => {
    const m = mensagemDe({ code: 'PGRST205', message: "'public.vendas'" })
    expect(m).toContain('dois passos')
  })

  it('sem o nome no texto, ainda explica o que fazer', () => {
    const m = mensagemDe({ code: 'PGRST202', message: 'mensagem estranha sem nome' })
    expect(m).toContain('não existe neste banco')
    expect(m).toContain('migrações')
  })

  it('os códigos que já eram traduzidos continuam iguais', () => {
    expect(mensagemDe({ code: '23505', message: 'x' })).toBe(
      'Já existe um registro com esse nome ou código.',
    )
    expect(mensagemDe({ code: '42501', message: 'x' })).toBe(
      'Você não tem permissão para esta operação.',
    )
  })

  it('código desconhecido devolve a mensagem crua, sem inventar', () => {
    expect(mensagemDe({ code: 'XX999', message: 'pane no servidor' })).toBe('pane no servidor')
  })
})
