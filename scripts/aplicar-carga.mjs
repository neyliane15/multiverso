// ============================================================================
// Multiverso · aplicador de carga (supabase/seed/*.sql)
// ----------------------------------------------------------------------------
// `supabase db push` so aplica supabase/migrations/. As cargas de dados ficam
// em supabase/seed/ e precisam de um cliente de Postgres — e a maquina de quem
// opera o sistema e um Windows sem psql instalado.
//
// Colar o arquivo no SQL Editor do painel tambem nao serve: o editor corta
// scripts grandes (a carga de outubro tem 150 KB) e o corte caiu no meio de um
// bloco `do $$ ... $$`, produzindo "unterminated dollar-quoted string". Pior
// que falhar: ele chegou a mandar meio arquivo para o banco.
//
// Este script usa o `pg`, que o projeto ja tem como devDependency, manda o
// arquivo inteiro numa tacada so (o proprio arquivo abre `begin` e fecha
// `commit`, entao ou entra tudo ou nao entra nada) e imprime os NOTICE do
// Postgres — que e onde o bloco de verificacao da carga diz se a conta fechou.
//
//   $env:DATABASE_URL = "postgresql://postgres:SENHA@HOST:5432/postgres"
//   npm run carga -- supabase/seed/0003_contagem_outubro.sql
// ============================================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const arquivo = process.argv[2]
const url = process.env.DATABASE_URL

if (!arquivo) {
  console.error('uso: npm run carga -- <arquivo.sql>')
  process.exit(1)
}
if (!url) {
  console.error('falta a variavel DATABASE_URL com a conexao do banco.')
  console.error('')
  console.error('No PowerShell:')
  console.error('  $env:DATABASE_URL = "postgresql://postgres:SENHA@HOST:5432/postgres"')
  console.error('')
  console.error('A string sai no painel do Supabase em Settings -> Database.')
  console.error('Ela contem a senha do banco: nao va para o git nem para print.')
  process.exit(1)
}

const caminho = resolve(process.cwd(), arquivo)
const sql = readFileSync(caminho, 'utf8')

// O Supabase exige TLS. rejectUnauthorized: false porque o certificado e de uma
// CA propria da Supabase que o Node nao traz no bundle; a conexao segue
// cifrada. Em banco local (socket ou localhost) nao se pede TLS nenhum.
const local = /(^|@)(localhost|127\.0\.0\.1)|[?&]host=/.test(url)
const cliente = new pg.Client({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
})

// Os NOTICE sao a resposta do bloco de verificacao da carga. Sem imprimi-los,
// o comando terminaria em silencio e ninguem saberia se a conta fechou.
cliente.on('notice', (n) => {
  const texto = (n.message ?? '').trim()
  if (texto && !/does not exist, skipping|already exists, skipping/.test(texto)) {
    console.log('  ' + texto)
  }
})

const comecou = Date.now()
console.log(`aplicando ${arquivo} (${(sql.length / 1024).toFixed(0)} KB) ...`)
console.log('')

try {
  await cliente.connect()
  await cliente.query(sql)
  console.log('')
  console.log(`carga aplicada em ${((Date.now() - comecou) / 1000).toFixed(1)}s.`)
} catch (erro) {
  console.error('')
  console.error('A CARGA FALHOU — nada foi gravado (o arquivo roda em transacao).')
  console.error('')
  console.error('  ' + (erro.message ?? erro))
  if (erro.where) console.error('  em: ' + erro.where)
  if (erro.hint) console.error('  dica: ' + erro.hint)
  process.exitCode = 1
} finally {
  await cliente.end().catch(() => {})
}
