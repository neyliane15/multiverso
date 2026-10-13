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

// Duas formas de dizer onde e o banco, e a segunda existe por um motivo
// pratico: o painel do Supabase avisa que senha com caractere especial
// (@ # / : ?) precisa ser percent-encoded dentro da URL. Quem erra isso recebe
// um erro de autenticacao que nao explica nada. Com os campos separados —
// que e a caixa "Connection parameters" do mesmo painel — nao ha o que
// escapar: a senha vai inteira, como foi digitada.
const avulso = process.env.PGHOST && process.env.PGPASSWORD

if (!arquivo) {
  console.error('uso: npm run carga -- <arquivo.sql>')
  process.exit(1)
}
if (!url && !avulso) {
  console.error('falta dizer qual e o banco. Ha duas formas; a segunda e a mais')
  console.error('segura quando a senha tem caractere especial (@ # / : ?).')
  console.error('')
  console.error('1) a string inteira (painel: Connect -> Connection string):')
  console.error('   $env:DATABASE_URL = "postgresql://postgres:SENHA@HOST:5432/postgres"')
  console.error('')
  console.error('2) os campos separados (painel: Connect -> Connection parameters):')
  console.error('   $env:PGHOST     = "db.SEUPROJETO.supabase.co"')
  console.error('   $env:PGPORT     = "5432"')
  console.error('   $env:PGDATABASE = "postgres"')
  console.error('   $env:PGUSER     = "postgres"')
  console.error('   $env:PGPASSWORD = "sua senha, inteira, sem escapar nada"')
  console.error('')
  console.error('A senha da acesso total ao banco, por fora do RLS:')
  console.error('nao va para o git nem para print.')
  process.exit(1)
}

const caminho = resolve(process.cwd(), arquivo)
const sql = readFileSync(caminho, 'utf8')

// O Supabase exige TLS. rejectUnauthorized: false porque o certificado e de uma
// CA propria da Supabase que o Node nao traz no bundle; a conexao segue
// cifrada. Em banco local (socket ou localhost) nao se pede TLS nenhum.
const alvo = url ?? `${process.env.PGHOST}:${process.env.PGPORT ?? 5432}`
// Local = localhost, 127.0.0.1 ou socket Unix (host comecando com barra).
// Nesses nao se pede TLS; o servidor de desenvolvimento nem oferece.
const local = /(^|@)(localhost|127\.0\.0\.1)|[?&]host=|^\//.test(alvo)

// Sem connectionString, o `pg` le PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
// sozinho — sao as variaveis padrao do libpq.
const cliente = new pg.Client({
  ...(url ? { connectionString: url } : {}),
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
  if (['ENETUNREACH', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(erro.code)) {
    console.error('')
    console.error('  Isso e a rede, nao o banco. A conexao direta do Supabase')
    console.error('  (db.<projeto>.supabase.co) so atende por IPv6. Se a sua rede')
    console.error('  nao tiver IPv6, use a opcao "Session pooler" no mesmo painel:')
    console.error('  o host muda para aws-0-<regiao>.pooler.supabase.com e o')
    console.error('  usuario para postgres.<projeto>, na mesma porta 5432.')
    console.error('  Nao use "Transaction pooler": ela nao mantem a transacao,')
    console.error('  e e a transacao que garante o tudo-ou-nada desta carga.')
  }
  process.exitCode = 1
} finally {
  await cliente.end().catch(() => {})
}
