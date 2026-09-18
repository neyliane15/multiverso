/**
 * Confere o vercel.json antes de ele ser recusado na publicação.
 *
 * O Vercel valida o arquivo contra um schema fechado: qualquer chave que ele
 * não conheça derruba o deploy inteiro, com uma mensagem que não diz o que
 * fazer. Aconteceu com uma chave `comment` — a tentativa de documentar o
 * arquivo por dentro, já que JSON não tem comentário.
 *
 * Uso: npm run vercel:conferir
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

const RAIZ_PERMITIDA = new Set([
  '$schema', 'framework', 'buildCommand', 'outputDirectory', 'installCommand',
  'devCommand', 'ignoreCommand', 'rewrites', 'redirects', 'headers',
  'cleanUrls', 'trailingSlash', 'regions', 'git', 'crons', 'functions', 'images',
])
const REGRA = ['source', 'has', 'missing']

function conferir(objeto, permitidas, onde) {
  const intrusas = Object.keys(objeto).filter((k) => !permitidas.includes(k))
  if (intrusas.length > 0) {
    throw new Error(`${onde}: o Vercel não conhece a chave ${intrusas.map((k) => `"${k}"`).join(', ')}`)
  }
}

const config = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
conferir(config, [...RAIZ_PERMITIDA], 'raiz')

for (const [i, r] of (config.rewrites ?? []).entries()) {
  conferir(r, [...REGRA, 'destination'], `rewrites[${i}]`)
}
for (const [i, r] of (config.redirects ?? []).entries()) {
  conferir(r, [...REGRA, 'destination', 'permanent', 'statusCode'], `redirects[${i}]`)
}
for (const [i, h] of (config.headers ?? []).entries()) {
  conferir(h, [...REGRA, 'headers'], `headers[${i}]`)
  for (const [j, c] of h.headers.entries()) {
    conferir(c, ['key', 'value'], `headers[${i}].headers[${j}]`)
  }
}

// A regra que quebra calada: sem ela, o app funciona navegando pelo menu e dá
// 404 no primeiro F5. Vale checar que ela não sumiu num acerto futuro.
const pegaTudo = (config.rewrites ?? []).some(
  (r) => r.source === '/(.*)' && r.destination === '/index.html',
)
if (!pegaTudo) {
  throw new Error('falta a reescrita que manda toda rota para o index.html — sem ela, F5 em /cmv devolve 404')
}

console.log('vercel.json ok: schema limpo e a reescrita de página única no lugar')
