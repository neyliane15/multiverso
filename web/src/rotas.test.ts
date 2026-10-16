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

  it('o operador preso a setores ve a contagem e o historico dela — nada mais', () => {
    // O historico entrou porque a contagem entregue tem de ir para algum
    // lugar que a pessoa possa consultar. Os numeros que ele mostra ali sao os
    // do setor dele: a vista soma atraves da RLS.
    const modulos = menuVisivel('operador', true, true)
    const caminhos = modulos.flatMap((m) => m.itens.map((i) => i.caminho))
    expect(caminhos).toEqual(['/contagem', '/contagem/historico'])
    // E um modulo sem item nenhum nao aparece como titulo solto.
    expect(modulos.every((m) => m.itens.length > 0)).toBe(true)
  })

  it('a restricao vale ate para quem tem papel alto — o dado e que manda', () => {
    // Prender um admin a setor e recusado no banco; se um dia passar, a tela
    // nao pode ser o elo que abre tudo de novo.
    expect(menuVisivel('admin', true, true).flatMap((m) => m.itens.map((i) => i.caminho)))
      .toEqual(['/contagem', '/contagem/historico'])
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

  it('deixa passar o historico da contagem', () => {
    expect(rotaPermitidaNoSetor('/contagem/historico')).toBe(true)
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

/**
 * O guarda do operador de setor, agora que `/contagem` tem páginas nomeadas.
 *
 * Antes ele liberava o prefixo `/contagem/` inteiro, porque a única coisa
 * depois da barra era um uuid. Bastou nascer `/contagem/dashboard` para o
 * operador do bar poder ler o estoque, o consumo e a venda da casa inteira
 * digitando o endereço — e a RLS não salvaria a tela disso: ela entregaria o
 * total de um setor só, com cara de total da casa.
 */
describe('o guarda do operador e as paginas nomeadas da contagem', () => {
  it('barra o dashboard, o relatorio e as vendas', () => {
    for (const rota of ['/contagem/dashboard', '/contagem/relatorio', '/contagem/vendas']) {
      expect(rotaPermitidaNoSetor(rota)).toBe(false)
    }
  })

  it('continua deixando passar a folha de UMA contagem, pelo id', () => {
    expect(rotaPermitidaNoSetor('/contagem/8f2c1a94-0000-4000-8000-000000000001')).toBe(true)
  })

  it('e o historico, que esta na lista dele', () => {
    expect(rotaPermitidaNoSetor('/contagem/historico')).toBe(true)
  })

  it('nao deixa passar caminho de dois niveis', () => {
    expect(rotaPermitidaNoSetor('/contagem/abc/def')).toBe(false)
    expect(rotaPermitidaNoSetor('/contagem/')).toBe(false)
  })

  it('as tres paginas novas tambem nao aparecem no menu do operador de setor', () => {
    const caminhos = menuVisivel('operador', true, true).flatMap((m) =>
      m.itens.map((i) => i.caminho),
    )
    expect(caminhos).toEqual(['/contagem', '/contagem/historico'])
  })

  it('mas aparecem para o operador comum', () => {
    const caminhos = menuVisivel('operador', true).flatMap((m) => m.itens.map((i) => i.caminho))
    expect(caminhos).toContain('/contagem/dashboard')
    expect(caminhos).toContain('/contagem/relatorio')
    expect(caminhos).toContain('/contagem/vendas')
  })
})
