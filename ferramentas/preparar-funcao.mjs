/**
 * Prepara a edge function para o deploy, copiando o parser de NFe para dentro
 * da pasta dela.
 *
 * Por que isto existe: o parser é o mesmo do navegador e mora em
 * `web/src/dados/nfe/`. O bundler do `supabase functions deploy` não é
 * confiável para seguir import relativo que sai de `supabase/functions/` — e
 * descobrir isso no primeiro deploy, com o cliente esperando, é o pior momento.
 *
 * A fonte da verdade continua sendo uma só: `web/src/dados/nfe/`. Esta pasta é
 * gerada, está no .gitignore, e o deploy a refaz sempre. Duplicar o código no
 * repositório seria pedir para as duas cópias divergirem em silêncio.
 *
 * Uso: node ferramentas/preparar-funcao.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = join(RAIZ, 'web/src/dados/nfe')
const DESTINO = join(RAIZ, 'supabase/functions/importar-nfe/_compartilhado')

const MODULOS = ['parsearXml', 'conversaoUnidade', 'casarProdutos']

/**
 * A regra de quem exclui quem, copiada para a `remover-usuario`.
 *
 * Aquela função roda com a `service_role`, que passa por cima da RLS — a
 * checagem dela e a unica que sobra. Se a regra virasse uma segunda copia
 * escrita a mao, o lado que divergisse seria justamente o que apaga.
 */
const REGRA_ORIGEM = join(RAIZ, 'web/src/paginas/admin')
const REGRA_DESTINO = join(RAIZ, 'supabase/functions/remover-usuario/_compartilhado')
const REGRA_MODULOS = ['regraDeExclusao']

const CABECALHO_REGRA = `// ============================================================================
// ARQUIVO GERADO por ferramentas/preparar-funcao.mjs — nao edite aqui.
// A fonte e web/src/paginas/admin/%s.ts, o mesmo modulo que a TELA usa.
// Corrija la e rode o gerador de novo.
// ============================================================================

`

const CABECALHO = `// ============================================================================
// ARQUIVO GERADO por ferramentas/preparar-funcao.mjs — nao edite aqui.
// A fonte e web/src/dados/nfe/%s.ts. Corrija la e rode o gerador de novo.
// ============================================================================

`

/**
 * O Deno exige extensao no import relativo, e nao conhece o alias `@`. As duas
 * reescritas sao mecanicas e ficam registradas aqui em vez de viverem como
 * pegadinha no deno.json.
 */
function paraDeno(codigo) {
  return codigo
    .replace(/from '@\/util\/formato'/g, "from './texto.ts'")
    .replace(/from '\.\/([A-Za-z0-9_-]+)'/g, "from './$1.ts'")
}

rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })

// chaveBusca é a única coisa que o parser usa de `util/formato`, e é genérica:
// normalizar texto para comparar sem acento nem caixa. Vai sozinha.
const formato = readFileSync(join(RAIZ, 'web/src/util/formato.ts'), 'utf8')
const inicio = formato.indexOf('/** Compara ignorando acento')
const fim = formato.indexOf('\n}', inicio) + 2
if (inicio < 0 || fim < 2) {
  throw new Error('nao achei chaveBusca em web/src/util/formato.ts — o gerador precisa ser ajustado')
}
writeFileSync(
  join(DESTINO, 'texto.ts'),
  CABECALHO.replace('%s', '../util/formato') + formato.slice(inicio, fim) + '\n',
)

for (const modulo of MODULOS) {
  const codigo = readFileSync(join(ORIGEM, `${modulo}.ts`), 'utf8')
  writeFileSync(join(DESTINO, `${modulo}.ts`), CABECALHO.replace('%s', modulo) + paraDeno(codigo))
}

// Nenhum import pode escapar da pasta: é exatamente o que quebraria o deploy.
for (const arquivo of [...MODULOS, 'texto']) {
  const codigo = readFileSync(join(DESTINO, `${arquivo}.ts`), 'utf8')
  const fuga = [...codigo.matchAll(/from '([^']+)'/g)]
    .map((m) => m[1])
    .filter((caminho) => caminho.startsWith('..') || caminho.startsWith('@/'))
  if (fuga.length > 0) {
    throw new Error(`${arquivo}.ts ainda importa de fora da pasta: ${fuga.join(', ')}`)
  }
}

// ------------------------------------------------- remover-usuario ---------
rmSync(REGRA_DESTINO, { recursive: true, force: true })
mkdirSync(REGRA_DESTINO, { recursive: true })

for (const modulo of REGRA_MODULOS) {
  const codigo = readFileSync(join(REGRA_ORIGEM, `${modulo}.ts`), 'utf8')
  writeFileSync(
    join(REGRA_DESTINO, `${modulo}.ts`),
    CABECALHO_REGRA.replace('%s', modulo) + paraDeno(codigo),
  )
}

for (const arquivo of REGRA_MODULOS) {
  const codigo = readFileSync(join(REGRA_DESTINO, `${arquivo}.ts`), 'utf8')
  const fuga = [...codigo.matchAll(/from '([^']+)'/g)]
    .map((m) => m[1])
    .filter((caminho) => caminho.startsWith('..') || caminho.startsWith('@/'))
  if (fuga.length > 0) {
    throw new Error(`${arquivo}.ts ainda importa de fora da pasta: ${fuga.join(', ')}`)
  }
}

console.log(`funcao preparada: ${MODULOS.length + 1} arquivos em supabase/functions/importar-nfe/_compartilhado/`)
console.log(`regra copiada:    ${REGRA_MODULOS.length} arquivo em supabase/functions/remover-usuario/_compartilhado/`)
