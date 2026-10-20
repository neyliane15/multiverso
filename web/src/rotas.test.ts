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
    expect(rotaPermitidaNoSetor('/contagem/8f2c1a94-0000-4000-8000-000000000001')).toBe(true)
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
    // `/contagem/` era barrado aqui. O roteador monta a tela de CONTAGEM para
    // ele — é a mesma rota, com uma barra sobrando —, então barrá-lo era o
    // guarda e o roteador lendo o mesmo endereço de dois jeitos. Hoje passa,
    // porque é a porta do próprio operador. Ver 'o guarda le o endereco como
    // o roteador le', abaixo.
    expect(rotaPermitidaNoSetor('/contagem/')).toBe(true)
  })

  /**
   * O furo que a lista negra deixava aberto.
   *
   * O React Router casa rota SEM olhar maiuscula — `caseSensitive` e falso por
   * omissao. Medido com `matchRoutes` de verdade, `/contagem/Dashboard` casa a
   * rota `/contagem/dashboard` e monta o DashboardDaContagem; a lista negra,
   * comparando texto cru, respondia `true` para o mesmo endereco. Ou seja: o
   * furo que a pagina nomeada abriu continuava aberto, bastava uma letra
   * maiuscula no endereco digitado na mao.
   */
  it('barra as paginas nomeadas tambem com maiuscula, que e como o roteador casa', () => {
    for (const rota of [
      '/contagem/Dashboard',
      '/contagem/DASHBOARD',
      '/contagem/Relatorio',
      '/contagem/RELATORIO',
      '/contagem/Vendas',
      '/contagem/VENDAS',
    ]) {
      expect(rotaPermitidaNoSetor(rota)).toBe(false)
    }
  })

  /**
   * Lista BRANCA, e nao negra: pagina nova nasce BARRADA.
   *
   * Com lista negra, quem criasse `/contagem/compras` amanha precisaria
   * lembrar de voltar no guarda — e esquecer nao dava erro nenhum, so abria a
   * casa inteira para quem conta um setor.
   */
  it('qualquer nome que nao seja um id de contagem e barrado, inclusive nome que ainda nao existe', () => {
    for (const rota of [
      '/contagem/compras',
      '/contagem/cmv',
      '/contagem/pagina-que-nao-existe-ainda',
      '/contagem/..',
      '/contagem/8f2c1a94-0000-4000-8000-00000000000',
    ]) {
      expect(rotaPermitidaNoSetor(rota)).toBe(false)
    }
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

/**
 * O outro lado do mesmo desencontro.
 *
 * A lista branca fechou o lado perigoso (`/contagem/Dashboard` deixou de
 * passar). Faltava o lado inofensivo e irritante: o roteador ignora barra no
 * fim e não olha maiúscula, então ele ABRE `/contagem/historico/` e
 * `/contagem/<uuid>/` — e o guarda, comparando texto cru, mandava o operador
 * de volta para `/contagem`. Um link colado com barra no fim fechava a porta
 * do próprio dono dela.
 */
describe('o guarda le o endereco como o roteador le', () => {
  it('barra no fim nao fecha a porta do operador', () => {
    expect(rotaPermitidaNoSetor('/contagem/')).toBe(true)
    expect(rotaPermitidaNoSetor('/contagem/historico/')).toBe(true)
    expect(rotaPermitidaNoSetor('/contagem/8f2c1a94-0000-4000-8000-000000000001/')).toBe(true)
  })

  it('maiuscula tambem nao, nas rotas que sao dele', () => {
    expect(rotaPermitidaNoSetor('/contagem/Historico')).toBe(true)
    expect(rotaPermitidaNoSetor('/contagem/HISTORICO')).toBe(true)
    expect(rotaPermitidaNoSetor('/Contagem')).toBe(true)
  })

  it('e nada disso abre o que nao e dele — a lista continua BRANCA', () => {
    for (const rota of [
      '/contagem/dashboard/',
      '/contagem/Dashboard/',
      '/contagem/RELATORIO/',
      '/contagem/vendas//',
      '/CMV/',
      '/cadastros/insumos/',
      // o roteador decodifica antes de casar: `%64` é `d`, e isto monta o
      // Dashboard. A lista negra comparava texto cru e deixaria passar.
      '/contagem/%64ashboard',
      '/contagem/d%61shboard',
    ]) {
      expect(rotaPermitidaNoSetor(rota)).toBe(false)
    }
  })
})
