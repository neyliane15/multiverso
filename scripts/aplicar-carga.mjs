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

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

// --------------------------------------------------------------- o .env ----
// As variaveis do PowerShell (`$env:...`) morrem junto com a janela. Quem
// aplica a carga uma vez por mes nao tem por que redigitar a conexao toda vez —
// e redigitar senha e justamente como se erra senha.
//
// Entao a conexao pode morar num .env.local (ou .env) na raiz do projeto. Os
// dois ja estao no .gitignore desde o comeco do projeto, que e a razao de usar
// arquivo em vez de variavel permanente do Windows: fica visivel, fica num
// lugar so, e some junto com a pasta.
//
// O que ja estiver no ambiente ganha do arquivo: assim da para sobrescrever
// pontualmente, por exemplo para apontar para um banco de teste, sem editar
// nada.
function carregarEnv() {
  for (const nome of ['.env.local', '.env']) {
    const caminho = resolve(process.cwd(), nome)
    if (!existsSync(caminho)) continue
    for (const bruta of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
      const linha = bruta.trim()
      if (!linha || linha.startsWith('#')) continue
      const corte = linha.indexOf('=')
      if (corte < 1) continue
      const chave = linha.slice(0, corte).trim()
      let valor = linha.slice(corte + 1).trim()
      // Aspas em volta do valor sao delimitador, nao conteudo — tirar as duas
      // so quando forem iguais e estiverem nas duas pontas.
      if (valor.length > 1 && (valor.at(0) === valor.at(-1)) && ['"', "'"].includes(valor.at(0))) {
        valor = valor.slice(1, -1)
      }
      if (process.env[chave] === undefined) process.env[chave] = valor
    }
    return nome
  }
  return null
}

const envUsado = carregarEnv()

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
  console.error('falta dizer qual e o banco.')
  console.error('')
  console.error('O jeito que nao precisa ser refeito toda vez: criar um arquivo')
  console.error('.env.local na raiz do projeto (ele ja esta no .gitignore) com os')
  console.error('valores que o painel do Supabase mostra em Connect ->')
  console.error('Connection parameters:')
  console.error('')
  console.error('   PGHOST=db.SEUPROJETO.supabase.co')
  console.error('   PGPORT=5432')
  console.error('   PGDATABASE=postgres')
  console.error('   PGUSER=postgres')
  console.error('   PGPASSWORD=sua senha, inteira, sem escapar nada')
  console.error('')
  console.error('Feito isso, `npm run carga` funciona em qualquer janela, sempre.')
  console.error('')
  console.error('Para uma vez so, as mesmas variaveis servem no PowerShell')
  console.error('($env:PGHOST = ...), mas morrem quando a janela fecha.')
  console.error('')
  console.error('A senha da acesso total ao banco, por fora do RLS:')
  console.error('nao va para o git nem para print.')
  if (envUsado === null) console.error('')
  if (envUsado === null) console.error('(nenhum .env.local nem .env foi encontrado nesta pasta)')
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
const alvoVisivel = url
  ? (url.match(/@([^/?]+)/)?.[1] ?? 'conexao da DATABASE_URL')
  : `${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE ?? 'postgres'}`
console.log(`aplicando ${arquivo} (${(sql.length / 1024).toFixed(0)} KB)`)
console.log(`         em ${alvoVisivel}${envUsado ? `  (conexao lida de ${envUsado})` : ''}`)
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
  // 28P01 = senha recusada. A rede funcionou e o servidor respondeu, entao o
  // que falta e so a credencial — e no PowerShell a causa mais comum nao e
  // senha errada, e aspas: "..." interpola $ e `, entao uma senha com cifrao
  // chega truncada sem ninguem perceber. Por isso o diagnostico mostra o
  // TAMANHO do que chegou (nunca o conteudo): se nao bate com o que foi
  // digitado, o problema e a aspa, nao a senha.
  if (erro.code === '28P01') {
    const senha = process.env.PGPASSWORD ?? (url ?? '').split(':')[2]?.split('@')[0] ?? ''
    console.error('')
    console.error(`  A senha chegou aqui com ${senha.length} caractere(s).`)
    if (senha.length === 0) {
      console.error('  Ou seja: chegou VAZIA. A variavel nao foi definida nesta')
      console.error('  mesma janela do PowerShell, ou foi definida com outro nome.')
    }
    if (/^\[.*\]$/.test(senha)) {
      console.error('  Ela ainda esta entre colchetes — o [YOUR-PASSWORD] do painel')
      console.error('  ficou no lugar da senha de verdade.')
    }
    if (senha !== senha.trim()) {
      console.error('  Ela tem espaco sobrando no comeco ou no fim.')
    }
    console.error('')
    console.error('  Confira o tamanho sem revelar a senha:')
    console.error('    $env:PGPASSWORD.Length')
    console.error('')
    console.error('  Se o numero nao bater com o que voce digitou, o problema e a')
    console.error('  ASPA. No PowerShell, aspas duplas interpretam $ e crase:')
    console.error('    $env:PGPASSWORD = "Bar$Zeca"   <- vira "Bar" + variavel vazia')
    console.error('    $env:PGPASSWORD = \'Bar$Zeca\'   <- correto, aspas SIMPLES')
    console.error('')
    console.error('  Se o numero bater, a senha e outra mesmo: use "Reset database')
    console.error('  password" no painel (nao apaga dado nenhum) e escolha uma so')
    console.error('  com letras e numeros.')
  }
  if (
    ['ENOTFOUND', 'ENETUNREACH', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(erro.code)
  ) {
    console.error('')
    console.error('  Isso e a rede, nao o banco: nada chegou a ser enviado.')
    if (erro.code === 'ENOTFOUND') {
      console.error('  ENOTFOUND quer dizer que o endereco nem foi encontrado — o')
      console.error('  Supabase aposentou o DNS da conexao direta para quem nao tem')
      console.error('  IPv6, entao db.<projeto>.supabase.co deixou de existir para voce.')
    } else {
      console.error('  A conexao direta do Supabase (db.<projeto>.supabase.co) so')
      console.error('  atende por IPv6, e a sua rede nao tem.')
    }
    console.error('')
    console.error('  No painel: Connect > aba "Direct / Connection string" >')
    console.error('  Connection Method = "Session pooler". De la saem estes valores:')
    console.error('')
    console.error('    PGHOST=aws-0-<regiao>.pooler.supabase.com')
    console.error('    PGPORT=5432')
    console.error('    PGDATABASE=postgres')
    console.error('    PGUSER=postgres.<projeto>')
    console.error('    PGPASSWORD=a senha, sem aspas')
    console.error('')
    console.error('  Ponha no .env.local e APAGUE a linha DATABASE_URL antiga: ela')
    console.error('  tem prioridade sobre estas cinco e as deixaria sem efeito.')
    console.error('  A forma separada tambem dispensa codificar @ ou # na senha.')
    console.error('')
    console.error('  Nao use "Transaction pooler": ela nao mantem a transacao, e e')
    console.error('  a transacao que garante o tudo-ou-nada desta carga.')
  }
  process.exitCode = 1
} finally {
  await cliente.end().catch(() => {})
}
