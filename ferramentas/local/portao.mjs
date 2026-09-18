/**
 * Portão do ambiente local: faz o papel do Kong + GoTrue do Supabase.
 *
 * Por que existe: o stack oficial do Supabase sobe em Docker, e nem todo
 * ambiente consegue puxar aquelas imagens. Sem ele, a única forma de ver o
 * sistema com os 854 produtos do Bar do Zeca dentro seria confiar no build —
 * e build passando não é o mesmo que tela funcionando.
 *
 * O que é real aqui: o Postgres, as migrações, a RLS, a carga, o PostgREST e o
 * caminho HTTP inteiro que o `@supabase/supabase-js` percorre. O token é
 * assinado com o mesmo segredo que o PostgREST verifica, então a política de
 * cada tabela decide de verdade quem vê o quê.
 *
 * O que é de mentira: só a checagem de senha. O GoTrue tem fluxo de convite,
 * recuperação e refresh que não cabe reimplementar — e não é o que este
 * ambiente serve para testar.
 *
 * Storage e Edge Functions não existem aqui e respondem 501 dizendo isso, em
 * vez de falharem com erro de rede que parece bug do app.
 */
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { request as pedir } from 'node:http'

const PORTA = Number(process.env.PORTA ?? 54321)
const POSTGREST = process.env.POSTGREST ?? 'http://127.0.0.1:54325'
const SEGREDO = process.env.JWT_SEGREDO ?? 'segredo-local-do-multiverso-com-32-caracteres'
const SENHA = process.env.SENHA_LOCAL ?? 'multiverso'

/** Os usuários que o `usuarios.sql` cria. E-mail → id e nome. */
const USUARIOS = new Map([
  ['master@multiverso.app', { id: '11111111-1111-4111-8111-111111111111', nome: 'Master do Multiverso' }],
  ['admin@bardozeca.com.br', { id: '22222222-2222-4222-8222-222222222222', nome: 'Zeca' }],
  ['estoque@bardozeca.com.br', { id: '33333333-3333-4333-8333-333333333333', nome: 'Dona Neide' }],
])

const base64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function assinar(carga) {
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify(carga))
  const assinatura = base64url(
    createHmac('sha256', SEGREDO).update(`${cabecalho}.${corpo}`).digest(),
  )
  return `${cabecalho}.${corpo}.${assinatura}`
}

function conferir(token) {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  const esperada = base64url(
    createHmac('sha256', SEGREDO).update(`${partes[0]}.${partes[1]}`).digest(),
  )
  // Comparação de tempo constante: o portão é de brincadeira, o hábito não.
  const a = Buffer.from(esperada)
  const b = Buffer.from(partes[2])
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString())
  return carga.exp * 1000 > Date.now() ? carga : null
}

function sessao(email) {
  const u = USUARIOS.get(email)
  if (!u) return null
  const agora = Math.floor(Date.now() / 1000)
  const carga = {
    sub: u.id,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: agora,
    exp: agora + 60 * 60 * 8,
  }
  const usuario = {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: { nome: u.nome },
    identities: [],
  }
  return {
    access_token: assinar(carga),
    token_type: 'bearer',
    expires_in: 60 * 60 * 8,
    expires_at: carga.exp,
    refresh_token: `refresh-${u.id}`,
    user: usuario,
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-supabase-api-version, x-retry-count, x-region, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers': 'content-range, content-location',
}

const responder = (res, status, corpo) => {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

async function lerCorpo(req) {
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  return Buffer.concat(pedacos)
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }

  // ─────────────────────────────────────────────────────────────── auth ────
  if (url.pathname === '/auth/v1/token') {
    const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}')
    const tipo = url.searchParams.get('grant_type')

    if (tipo === 'refresh_token') {
      const id = String(corpo.refresh_token ?? '').replace('refresh-', '')
      const email = [...USUARIOS].find(([, u]) => u.id === id)?.[0]
      const s = email ? sessao(email) : null
      return s
        ? responder(res, 200, s)
        : responder(res, 401, { error: 'invalid_grant', error_description: 'Sessão expirada.' })
    }

    const s = corpo.password === SENHA ? sessao(String(corpo.email ?? '').toLowerCase()) : null
    return s
      ? responder(res, 200, s)
      : responder(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        })
  }

  if (url.pathname === '/auth/v1/user') {
    const carga = conferir((req.headers.authorization ?? '').replace('Bearer ', ''))
    return carga
      ? responder(res, 200, sessao(carga.email).user)
      : responder(res, 401, { message: 'Token inválido ou expirado.' })
  }

  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204, CORS)
    return res.end()
  }

  // ───────────────────────────────────────────── o que não existe aqui ────
  if (url.pathname.startsWith('/storage/v1') || url.pathname.startsWith('/functions/v1')) {
    const qual = url.pathname.startsWith('/storage/v1') ? 'O Storage' : 'As Edge Functions'
    return responder(res, 501, {
      message: `${qual} não roda neste ambiente local — ele só tem Postgres e PostgREST. Use um projeto Supabase de verdade para exercitar esta parte.`,
    })
  }

  // ─────────────────────────────────────────── REST → PostgREST ───────────
  if (url.pathname.startsWith('/rest/v1')) {
    const corpo = await lerCorpo(req)
    const destino = new URL(POSTGREST)
    const cabecalhos = { ...req.headers, host: destino.host }
    delete cabecalhos.apikey
    delete cabecalhos['content-length']

    const adiante = pedir(
      {
        hostname: destino.hostname,
        port: destino.port,
        path: url.pathname.replace('/rest/v1', '') + url.search,
        method: req.method,
        headers: cabecalhos,
      },
      (resposta) => {
        // O PostgREST manda os proprios cabecalhos de CORS. Repassar os dele e
        // acrescentar os nossos produz "Access-Control-Allow-Origin: *, *", que
        // o navegador recusa por ter dois valores. Os dele saem; os nossos ficam.
        const cabecalhosDele = Object.fromEntries(
          Object.entries(resposta.headers).filter(
            ([k]) => !k.toLowerCase().startsWith('access-control-'),
          ),
        )
        res.writeHead(resposta.statusCode ?? 502, { ...cabecalhosDele, ...CORS })
        resposta.pipe(res)
      },
    )
    adiante.on('error', (e) =>
      responder(res, 502, { message: `PostgREST não respondeu: ${e.message}` }),
    )
    if (corpo.length > 0) adiante.write(corpo)
    return adiante.end()
  }

  responder(res, 404, { message: `Rota desconhecida: ${url.pathname}` })
}).listen(PORTA, () => {
  console.log(`portão do Multiverso em http://127.0.0.1:${PORTA}`)
  console.log(`  REST  → ${POSTGREST}`)
  console.log(`  senha de todos os usuários locais: ${SENHA}`)
})
