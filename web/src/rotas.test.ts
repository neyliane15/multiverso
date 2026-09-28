import { describe, expect, it } from 'vitest'
import { MODULOS, menuVisivel, rotaPermitidaNoSetor } from './rotas'

describe('o menu de cada papel', () => {
  it('sem papel nao ha menu nenhum', () => {
    expect(menuVisivel(null, true)).toEqual([])
  })

  it('o operador comum ve o sistema inteiro menos o que e de master e admin', () => {
    const caminhos = menuVisivel('operador', true).flatMap((m) => m.itens.map((i) => i.caminho))
    expect(caminhos).toContain('/contagem')
    expect(caminhos).toContain('/cadastros/insumos')
    expect(caminhos).not.toContain('/rede')
    expect(caminhos).not.toContain('/admin/usuarios')
  })

  it('o operador preso a setores ve SO a contagem', () => {
    const modulos = menuVisivel('operador', true, true)
    const caminhos = modulos.flatMap((m) => m.itens.map((i) => i.caminho))
    expect(caminhos).toEqual(['/contagem'])
    // E um modulo sem item nenhum nao aparece como titulo solto.
    expect(modulos.every((m) => m.itens.length > 0)).toBe(true)
  })

  it('a restricao vale ate para quem tem papel alto — o dado e que manda', () => {
    // Prender um admin a setor e recusado no banco; se um dia passar, a tela
    // nao pode ser o elo que abre tudo de novo.
    expect(menuVisivel('admin', true, true).flatMap((m) => m.itens.map((i) => i.caminho)))
      .toEqual(['/contagem'])
  })

  it('sem restaurante em foco, some o que depende de um', () => {
    const caminhos = menuVisivel('master', false).flatMap((m) => m.itens.map((i) => i.caminho))
    expect(caminhos).toContain('/rede')
    expect(caminhos).not.toContain('/contagem')
  })
})

describe('o guarda de rota do operador de setor', () => {
  it('deixa passar a contagem e o que pendura nela', () => {
    expect(rotaPermitidaNoSetor('/contagem')).toBe(true)
    expect(rotaPermitidaNoSetor('/contagem/abc-123')).toBe(true)
  })

  it('barra o resto do sistema', () => {
    for (const rota of ['/', '/cmv', '/compras/notas', '/admin/usuarios', '/cadastros/insumos']) {
      expect(rotaPermitidaNoSetor(rota)).toBe(false)
    }
  })

  it('nao se engana com caminho que so COMECA igual', () => {
    // '/contagemx' nao e '/contagem'.
    expect(rotaPermitidaNoSetor('/contagemx')).toBe(false)
  })
})

describe('o mapa dos modulos', () => {
  it('todo item tem caminho, rotulo e icone', () => {
    for (const modulo of MODULOS) {
      for (const item of modulo.itens) {
        expect(item.caminho.startsWith('/')).toBe(true)
        expect(item.rotulo).not.toBe('')
        expect(item.icone).not.toBe('')
      }
    }
  })

  it('nao ha caminho repetido', () => {
    const todos = MODULOS.flatMap((m) => m.itens.map((i) => i.caminho))
    expect(new Set(todos).size).toBe(todos.length)
  })
})
