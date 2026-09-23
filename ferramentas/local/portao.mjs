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
import pg from 'pg'
// A MESMA decisão que a tela e a edge function usam — nada reescrito aqui.
import { podeExcluirUsuario } from '../../web/src/paginas/admin/regraDeExclusao.ts'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { request as pedir } from 'node:http'

const PORTA = Number(process.env.PORTA ?? 54321)
const POSTGREST = process.env.POSTGREST ?? 'http://127.0.0.1:54325'
const SEGREDO = process.env.JWT_SEGREDO ?? 'segredo-local-do-multiverso-com-32-caracteres'
const SENHA = process.env.SENHA_LOCAL ?? 'multiverso'
/** `CONFIRMAR=1` faz o portão exigir confirmação, como um projeto recém-criado. */
const EXIGE_CONFIRMACAO = process.env.CONFIRMAR === '1'

/**
 * Os usuários vêm do BANCO, não de uma lista aqui.
 *
 * Havia uma cópia escrita à mão neste arquivo, e ela saiu de sincronia com o
 * `usuarios.sql` no dia em que um gerente foi acrescentado lá: entrar como
 * gerente devolvia "credenciais inválidas", e uma auditoria de papéis saiu com
 * o gerente aparecendo como se não enxergasse nada — quando na verdade ele
 * nem tinha entrado. Duas listas da mesma coisa sempre divergem; esta some.
 */
const USUARIOS = new Map()

/** Token de leitura assinado com o mesmo segredo que o PostgREST confere. */
function tokenDeServico(sub) {
  const agora = Math.floor(Date.now() / 1000)
  return assinar({ sub, role: 'authenticated', aud: 'authenticated', iat: agora, exp: agora + 60 })
}

/**
 * O único id escrito à mão: o do master, que o `usuarios.sql` fixa.
 *
 * É o ponto de partida obrigatório. A RLS de `perfis` entrega a linha a quem
 * já é aquele usuário, ao master, ou a quem é do mesmo restaurante — nenhum
 * desses caminhos existe antes de se saber o id de ALGUÉM. Um id, e o resto
 * sai do banco.
 */
const MASTER_ID = process.env.MASTER_ID ?? '11111111-1111-4111-8111-111111111111'

/**
 * Ligação direta com o Postgres, só para o cadastro.
 *
 * `auth.users` não é exposta pelo PostgREST (ele serve `public`), e é
 * justamente lá que o gatilho `mv_ao_criar_usuario` mora. Sem esta ligação, o
 * caminho convite → criar conta → perfil não teria como ser exercitado aqui —
 * e foi exatamente esse caminho que passou meses sem tela nenhuma.
 */
const BANCO = new pg.Client({
  host: process.env.SOCK ?? '/home/pg/sock',
  user: 'postgres',
  database: process.env.BANCO ?? 'multiverso_app',
})
let bancoLigado = BANCO.connect().then(() => true).catch(() => false)

/**
 * Procura o usuário pelo e-mail: primeiro em `perfis`, depois em `auth.users`.
 *
 * A segunda busca não é detalhe. Uma conta sem convite EXISTE no auth e não
 * tem perfil — e o GoTrue de verdade abre sessão para ela do mesmo jeito. Se
 * o portão recusasse essas, o estado "entrou mas não tem acesso" nunca
 * apareceria aqui, e a tela que o explica nunca seria exercitada.
 */
async function acharUsuario(email) {
  if (USUARIOS.has(email)) return USUARIOS.get(email)

  const r = await fetch(
    `${POSTGREST}/perfis?select=id,nome,email&email=eq.${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${tokenDeServico(MASTER_ID)}`,
        Accept: 'application/json',
      },
    },
  )
  const achados = r.ok ? await r.json() : []
  const u = achados[0]
  if (u) {
    USUARIOS.set(email, { id: u.id, nome: u.nome })
    return USUARIOS.get(email)
  }

  if (!(await bancoLigado)) return null
  const orfa = await BANCO.query('select id from auth.users where lower(email) = $1', [email])
  const conta = orfa.rows[0]
  if (!conta) return null
  USUARIOS.set(email, { id: conta.id, nome: email.split('@')[0] })
  return USUARIOS.get(email)
}

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

async function sessao(email) {
  const u = await acharUsuario(email)
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
      const s = email ? await sessao(email) : null
      return s
        ? responder(res, 200, s)
        : responder(res, 401, { error: 'invalid_grant', error_description: 'Sessão expirada.' })
    }

    const alvo = String(corpo.email ?? '').toLowerCase()
    if (corpo.password === SENHA && (await bancoLigado)) {
      const conf = await BANCO.query(
        'select email_confirmed_at from auth.users where lower(email) = $1',
        [alvo],
      )
      if (conf.rows[0] && conf.rows[0].email_confirmed_at === null) {
        return responder(res, 400, {
          error: 'invalid_grant',
          error_description: 'Email not confirmed',
        })
      }
    }
    const s = corpo.password === SENHA ? await sessao(alvo) : null
    return s
      ? responder(res, 200, s)
      : responder(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        })
  }

  /**
   * Cadastro. Cria a linha em `auth.users` e deixa o gatilho decidir o resto:
   * com convite pendente nasce o perfil, sem convite a conta fica órfã — que
   * é o estado seguro que a tela `SemConvite` explica.
   */
  if (url.pathname === '/auth/v1/signup') {
    const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}')
    const email = String(corpo.email ?? '').toLowerCase().trim()
    const senha = String(corpo.password ?? '')

    if (!email.includes('@')) {
      return responder(res, 422, { code: 422, msg: 'Unable to validate email address' })
    }
    if (senha.length < 6) {
      return responder(res, 422, { code: 422, msg: 'Password should be at least 6 characters' })
    }
    if (!(await bancoLigado)) {
      return responder(res, 501, { msg: 'cadastro indisponível: sem ligação com o banco' })
    }

    const jaExiste = await BANCO.query('select 1 from auth.users where lower(email) = $1', [email])
    if (jaExiste.rowCount > 0) {
      return responder(res, 422, { code: 422, msg: 'User already registered' })
    }

    // O cache é por e-mail e a conta acabou de nascer com id novo. Sem limpar,
    // um e-mail recriado (banco resetado entre execuções) receberia sessão com
    // o id antigo — e a pessoa entraria como um perfil que não existe mais.
    USUARIOS.delete(email)
    await BANCO.query(
      'insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), $1, $2)',
      [email, EXIGE_CONFIRMACAO ? null : new Date().toISOString()],
    )
    const s = await sessao(email)
    if (!s) {
      return responder(res, 500, { msg: 'conta criada mas sem sessão: isto é defeito do portão' })
    }
    // Com confirmação exigida, o GoTrue devolve o USUÁRIO e nenhuma sessão —
    // e é isso que faz a tela dizer "confirme o e-mail" em vez de entrar.
    // Sem reproduzir essa diferença, o caso que o usuário encontrou não
    // apareceria aqui nunca.
    if (EXIGE_CONFIRMACAO) return responder(res, 200, s.user)
    // Sem confirmação, a sessão abre na hora — com convite ou sem. Quem não
    // tem perfil entra e encontra a tela que explica.
    return responder(res, 200, s)
  }

  /**
   * Reenvio da confirmação. Aqui não há e-mail: o portão confirma na hora,
   * que é o efeito de clicar no link. Serve para exercitar a saída do caso
   * "cadastrou e não confirmou".
   */
  if (url.pathname === '/auth/v1/resend') {
    const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}')
    const alvo = String(corpo.email ?? '').toLowerCase()
    if (await bancoLigado) {
      await BANCO.query(
        'update auth.users set email_confirmed_at = now() where lower(email) = $1',
        [alvo],
      )
    }
    return responder(res, 200, {})
  }

  /** Recuperação de senha: aqui não há e-mail para enviar, e o portão diz isso. */
  if (url.pathname === '/auth/v1/recover') {
    return responder(res, 501, {
      msg: 'recuperação de senha não existe no portão local — use o GoTrue de verdade',
    })
  }

  if (url.pathname === '/auth/v1/user') {
    const carga = conferir((req.headers.authorization ?? '').replace('Bearer ', ''))
    const s = carga ? await sessao(carga.email) : null
    return s
      ? responder(res, 200, s.user)
      : responder(res, 401, { message: 'Token inválido ou expirado.' })
  }

  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204, CORS)
    return res.end()
  }

  // ───────────────────────────────────────────── o que não existe aqui ────
  /**
   * `remover-usuario`, a única edge function reimplementada aqui.
   *
   * As outras podem responder 501 porque o que elas fazem (ler XML, guardar
   * arquivo) não muda a regra de quem pode o quê. Esta muda: ela é o caminho
   * pelo qual uma conta some, e a decisão dela roda com service_role, sem RLS
   * por baixo. Testar isso só em produção seria descobrir o erro apagando a
   * pessoa errada.
   *
   * O código da decisão é o MESMO arquivo que a tela e a função usam.
   */
  if (url.pathname === '/functions/v1/remover-usuario') {
    const carga = conferir((req.headers.authorization ?? '').replace('Bearer ', ''))
    if (!carga) return responder(res, 401, { erro: 'Token inválido ou expirado.' })
    if (!(await bancoLigado)) return responder(res, 501, { erro: 'sem ligação com o banco' })

    const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}')
    const alvoId = corpo.usuarioId
    if (!alvoId) return responder(res, 400, { erro: 'Faltou dizer qual usuário excluir.' })

    const { rows } = await BANCO.query(
      'select id, papel, restaurante_id, nome, email from perfis where id = any($1::uuid[])',
      [[carga.sub, alvoId]],
    )
    const ator = rows.find((p) => p.id === carga.sub) ?? null
    const alvo = rows.find((p) => p.id === alvoId) ?? null
    if (!ator) return responder(res, 403, { erro: 'Sua conta não tem perfil neste sistema.' })
    if (!alvo) return responder(res, 404, { erro: 'Este usuário não existe (ou já foi excluído).' })

    const veredito = podeExcluirUsuario(ator, alvo)
    if (!veredito.permitido) return responder(res, 403, { erro: veredito.motivo })

    await BANCO.query('delete from auth.users where id = $1', [alvoId])
    USUARIOS.delete(alvo.email)
    return responder(res, 200, {
      excluido: { id: alvo.id, nome: alvo.nome, email: alvo.email },
      aviso: 'O histórico do que a pessoa lançou continua, agora sem nome.',
    })
  }

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
