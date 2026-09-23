/**
 * O parser da edge function e o do navegador precisam ser o mesmo parser.
 *
 * A pasta `_compartilhado` e gerada, e codigo gerado que ninguem confere vira
 * codigo divergente. Estes testes leem a copia e exigem que ela continue
 * fechando com a fonte — e que nenhum import escape da pasta, que e o que
 * quebraria o deploy.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeAll } from 'vitest'
import { chaveBusca } from '../web/src/util/formato.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const GERADO = join(RAIZ, 'supabase/functions/importar-nfe/_compartilhado')
const FONTE = join(RAIZ, 'web/src/dados/nfe')
const MODULOS = ['parsearXml', 'conversaoUnidade', 'casarProdutos']

beforeAll(() => {
  execFileSync('node', [join(RAIZ, 'ferramentas/preparar-funcao.mjs')], { cwd: RAIZ })
})

describe('preparar-funcao', () => {
  it('gera os quatro arquivos que a funcao importa', () => {
    for (const nome of [...MODULOS, 'texto']) {
      expect(existsSync(join(GERADO, `${nome}.ts`)), `${nome}.ts nao foi gerado`).toBe(true)
    }
  })

  it('nenhum import escapa da pasta — e o que quebraria o deploy', () => {
    for (const nome of [...MODULOS, 'texto']) {
      const codigo = readFileSync(join(GERADO, `${nome}.ts`), 'utf8')
      const caminhos = [...codigo.matchAll(/from '([^']+)'/g)].map((m) => m[1])
      for (const caminho of caminhos) {
        expect(caminho.startsWith('..'), `${nome}.ts importa ${caminho}`).toBe(false)
        expect(caminho.startsWith('@/'), `${nome}.ts importa ${caminho}`).toBe(false)
      }
    }
  })

  it('todo import relativo leva extensao, que o Deno exige', () => {
    for (const nome of MODULOS) {
      const codigo = readFileSync(join(GERADO, `${nome}.ts`), 'utf8')
      const relativos = [...codigo.matchAll(/from '(\.\/[^']+)'/g)].map((m) => m[1])
      for (const caminho of relativos) {
        expect(caminho.endsWith('.ts'), `${nome}.ts importa ${caminho} sem extensao`).toBe(true)
      }
    }
  })

  it('o corpo e identico a fonte, tirando as duas reescritas declaradas', () => {
    // Se alguem editar a copia a mao, ou se o gerador passar a mexer em mais
    // coisa do que promete, este teste morde. O parser do servidor nao pode
    // divergir do parser do navegador: a mesma nota tem de ser lida igual dos
    // dois lados, senao o custo que vai para o CMV depende de por onde entrou.
    for (const nome of MODULOS) {
      const fonte = readFileSync(join(FONTE, `${nome}.ts`), 'utf8')
      const copia = readFileSync(join(GERADO, `${nome}.ts`), 'utf8')
      const semCabecalho = copia.slice(copia.indexOf('// ====\n') + 1).replace(/^[\s\S]*?={70,}\n\n/, '')
      const esperado = fonte
        .replace(/from '@\/util\/formato'/g, "from './texto.ts'")
        .replace(/from '\.\/([A-Za-z0-9_-]+)'/g, "from './$1.ts'")
      expect(semCabecalho).toBe(esperado)
    }
  })

  it('leva chaveBusca inteira e sem retoque', () => {
    // E ela que casa "TILAPIA" com "Filé de tilápia" no de-para de produtos da
    // nota. Copiada pela metade, o servidor deixaria de reconhecer o que o
    // navegador reconhece — e item nao vinculado nao entra no CMV.
    const gerado = readFileSync(join(GERADO, 'texto.ts'), 'utf8')
    const fonte = readFileSync(join(RAIZ, 'web/src/util/formato.ts'), 'utf8')

    const inicio = fonte.indexOf('/** Compara ignorando acento')
    const corpo = fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2)

    expect(corpo).toContain('export function chaveBusca')
    expect(gerado).toContain(corpo)
  })

  it('e a chaveBusca da fonte faz o que o de-para precisa', () => {
    expect(chaveBusca('Filé de Tilápia')).toBe('FILE DE TILAPIA')
    expect(chaveBusca('AÇÚCAR  refinado (1kg)')).toBe('ACUCAR REFINADO 1KG')
    expect(chaveBusca('CERVEJA HEINEKEN 600ML')).toBe('CERVEJA HEINEKEN 600ML')
  })
})

describe('a regra de exclusao copiada para a remover-usuario', () => {
  it('e byte a byte a mesma decisao da tela', async () => {
    // A funcao roda com service_role, que passa por cima da RLS: a checagem
    // dela e a unica que sobra. Uma segunda copia escrita a mao divergiria, e
    // o lado que divergisse seria justamente o que apaga.
    const { podeExcluirUsuario: daTela } = await import(
      '../web/src/paginas/admin/regraDeExclusao.ts'
    )
    const copiada = readFileSync(
      join(RAIZ, 'supabase/functions/remover-usuario/_compartilhado/regraDeExclusao.ts'),
      'utf8',
    )
    const fonte = readFileSync(join(RAIZ, 'web/src/paginas/admin/regraDeExclusao.ts'), 'utf8')
    expect(copiada).toContain(fonte.trim())
    expect(typeof daTela).toBe('function')
  })

  it('nao importa nada de fora da pasta — e o que quebraria o deploy', () => {
    const copiada = readFileSync(
      join(RAIZ, 'supabase/functions/remover-usuario/_compartilhado/regraDeExclusao.ts'),
      'utf8',
    )
    const fuga = [...copiada.matchAll(/from '([^']+)'/g)]
      .map((m) => m[1])
      .filter((c) => c.startsWith('..') || c.startsWith('@/'))
    expect(fuga).toEqual([])
  })

  it('avisa que e gerado, para ninguem editar la', () => {
    const copiada = readFileSync(
      join(RAIZ, 'supabase/functions/remover-usuario/_compartilhado/regraDeExclusao.ts'),
      'utf8',
    )
    expect(copiada).toContain('ARQUIVO GERADO')
    expect(copiada).toContain('web/src/paginas/admin/regraDeExclusao.ts')
  })
})
