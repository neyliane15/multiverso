/**
 * Aplica um arquivo de carga num Postgres remoto (o do seu projeto Supabase).
 *
 * Por que existe: `psql` não vem instalado no Windows, e a carga do Bar do Zeca
 * tem 360 KB — grande demais para colar no editor de SQL do painel sem sustos.
 * Este script faz o mesmo que o psql faria, com a vantagem de mostrar as
 * mensagens de conferência que a própria carga emite.
 *
 * Uso:
 *   node ferramentas/carregar-seed.mjs "<url-de-conexao>"
 *   node ferramentas/carregar-seed.mjs "<url>" caminho/para/outro.sql
 *
 * A URL está no painel: Settings → Database → Connection string → URI.
 * Troque [YOUR-PASSWORD] pela senha do banco.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.argv[2]
const arquivo = process.argv[3] ?? join(RAIZ, 'supabase/seed/0001_bar_do_zeca.sql')

if (!url || !url.startsWith('postgres')) {
  console.error('Falta a URL de conexão.\n')
  console.error('  node ferramentas/carregar-seed.mjs "postgresql://postgres.xxx:SENHA@...supabase.com:5432/postgres"\n')
  console.error('Ela está no painel: Settings → Database → Connection string → URI,')
  console.error('trocando [YOUR-PASSWORD] pela senha que você escolheu ao criar o projeto.')
  process.exit(1)
}

const sql = readFileSync(arquivo, 'utf8')
console.log(`carregando ${arquivo}`)
console.log(`  ${(sql.length / 1024).toFixed(0)} KB\n`)

// Banco local não fala TLS; o do Supabase fala, com um certificado de cadeia
// que o Node não traz. A conexão continua criptografada — o que se dispensa é a
// checagem da cadeia, e o destino é um endereço que a própria pessoa colou.
const local = /localhost|127\.0\.0\.1|host=\//.test(url)
const cliente = new pg.Client({
  connectionString: url,
  ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
})

// A carga conversa: ela mesma diz quantos produtos entraram e se o total fecha.
cliente.on('notice', (n) => console.log(`  ${n.message}`))

try {
  await cliente.connect()
  await cliente.query(sql)
  console.log('\ncarga aplicada.')
} catch (erro) {
  console.error(`\nfalhou: ${erro.message}`)
  if (erro.hint) console.error(`dica do banco: ${erro.hint}`)
  process.exitCode = 1
} finally {
  await cliente.end()
}
