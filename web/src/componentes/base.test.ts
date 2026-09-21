import { describe, expect, it } from 'vitest'
import { comLargura } from './base'

describe('comLargura · a largura do chamador tem de vencer', () => {
  it('sem classe nenhuma, o campo nasce largo', () => {
    expect(comLargura(undefined)).toBe('w-full')
    expect(comLargura('')).toBe('w-full')
  })

  it('classe sem largura nao tira o padrao', () => {
    expect(comLargura('pl-9')).toBe('w-full')
    expect(comLargura('flex-wrap items-center')).toBe('w-full')
  })

  it('w-24 tira o w-full — era o defeito da folha no celular', () => {
    expect(comLargura('w-24')).toBe('')
  })

  it('reconhece a largura no meio da lista de classes', () => {
    expect(comLargura('mt-2 w-24 text-right')).toBe('')
  })

  it('reconhece min-w, max-w, size e basis', () => {
    expect(comLargura('min-w-40')).toBe('')
    expect(comLargura('max-w-56')).toBe('')
    expect(comLargura('size-10')).toBe('')
    expect(comLargura('basis-1/2')).toBe('')
  })

  it('reconhece largura com prefixo de tela', () => {
    expect(comLargura('w-full sm:w-64')).toBe('')
    expect(comLargura('sm:w-64')).toBe('')
  })

  it('nao confunde classe que so comeca parecido', () => {
    // `whitespace-nowrap` e `flex-wrap` nao sao largura.
    expect(comLargura('whitespace-nowrap')).toBe('w-full')
    expect(comLargura('shrink-0 grow')).toBe('w-full')
  })
})
