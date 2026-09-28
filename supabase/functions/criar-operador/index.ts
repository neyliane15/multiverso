/**
 * Edge Function `criar-operador` — o acesso mais estreito do sistema.
 *
 * Cria de uma vez a conta no Auth, o perfil de operador e a lista de setores
 * que ele enxerga. Só master e admin conseguem chamar, e a regra que decide
 * isso é a MESMA da tela (`web/src/paginas/admin/regraDeOperador.ts`, copiada
 * para cá pelo `preparar-funcao.mjs`).
 *
 * Como publicar, a partir da raiz do repositório:
 *
 *   npm run funcao:preparar
 *   supabase functions deploy criar-operador
 *
 * Como chamar:
 *
 *   POST https://<projeto>.supabase.co/functions/v1/criar-operador
 *   Authorization: Bearer <access_token de quem está logado>
 *   { "restauranteId": "...", "nome": "Operador Bar",
 *     "usuario": "Operador Bar", "senha": "...", "setores": ["<uuid>"] }
 *
 * Três decisões que valem explicação:
 *
 * 1. **Quem pede sai do token, nunca do corpo.** Um cliente com o token de
 *    alguém não consegue afirmar ser outra pessoa.
 *
 * 2. **A conta nasce com e-mail sintético e já confirmado.** O login é
 *    "Operador Bar"; o endereço existe só porque o GoTrue exige um, aponta
 *    para o domínio `.local` (que não existe na internet) e nunca recebe
 *    mensagem. Confirmar na hora é o certo: não há caixa de entrada para
 *    onde mandar a confirmação.
 *
 * 3. **Se o perfil ou os setores falharem, a conta criada é desfeita.** Meia
 *    criação deixaria uma conta que entra e não enxerga nada — e ninguém
 *    entenderia por quê.
 */

import { createClient } from '@supabase/supabase-js'

import {
  emailSintetico,
  podeCriarOperador,
  validarOperador,
  type QuemCria,
} from './_compartilhado/regraDeOperador.ts'

const CABECALHOS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json' },
  })

const erro = (mensagem: string, status: number) => responder({ erro: mensagem }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS_CORS })
  if (req.method !== 'POST') return erro('Use POST.', 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !servico) return erro('A função está sem as variáveis do projeto.', 500)

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao.startsWith('Bearer ')) return erro('Faltou o token de quem está pedindo.', 401)

  let corpo: {
    restauranteId?: string
    nome?: string
    usuario?: string
    senha?: string
    setores?: string[]
  }
  try {
    corpo = await req.json()
  } catch {
    return erro('Corpo inválido: esperava JSON.', 400)
  }

  const restauranteId = corpo.restauranteId ?? ''
  const dados = {
    nome: corpo.nome ?? '',
    usuario: corpo.usuario ?? '',
    senha: corpo.senha ?? '',
    setores: corpo.setores ?? [],
  }
  if (!restauranteId) return erro('Faltou dizer de qual restaurante é o acesso.', 400)

  const problemas = validarOperador(dados)
  if (problemas.length > 0) return erro(problemas[0]!.mensagem, 400)

  const comOToken = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao } = await comOToken.auth.getUser()
  const autorId = sessao.user?.id
  if (!autorId) return erro('Token inválido ou expirado.', 401)

  const comServico = createClient(url, servico, { auth: { persistSession: false } })

  const { data: perfilDoAutor, error: erroPerfil } = await comServico
    .from('perfis')
    .select('id, papel, restaurante_id')
    .eq('id', autorId)
    .maybeSingle()
  if (erroPerfil) return erro(`Não consegui ler o seu perfil: ${erroPerfil.message}`, 500)

  const veredito = podeCriarOperador((perfilDoAutor as QuemCria) ?? null, restauranteId)
  if (!veredito.permitido) return erro(veredito.motivo, 403)

  // O restaurante e os setores conferem antes de qualquer criação: setor de
  // outra casa dentro da lista faria a restrição virar um furo.
  const { data: restaurante } = await comServico
    .from('restaurantes')
    .select('id, slug, nome')
    .eq('id', restauranteId)
    .maybeSingle()
  if (!restaurante) return erro('Restaurante não encontrado.', 404)

  const { data: setores } = await comServico
    .from('setores')
    .select('id')
    .eq('restaurante_id', restauranteId)
    .in('id', dados.setores)
  if ((setores ?? []).length !== dados.setores.length) {
    return erro('Algum setor escolhido não é deste restaurante.', 400)
  }

  const usuario = dados.usuario.trim()
  const { data: jaExiste } = await comServico
    .from('perfis')
    .select('id')
    .ilike('usuario', usuario)
    .maybeSingle()
  if (jaExiste) return erro(`Já existe um acesso chamado "${usuario}".`, 409)

  const email = emailSintetico(usuario, (restaurante as { slug: string }).slug)

  const { data: criado, error: erroCriar } = await comServico.auth.admin.createUser({
    email,
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome.trim() },
  })
  if (erroCriar || !criado.user) {
    return erro(`Não consegui criar a conta: ${erroCriar?.message ?? 'motivo desconhecido'}`, 500)
  }
  const novoId = criado.user.id

  // Daqui para baixo, qualquer falha desfaz a conta: uma conta que entra e não
  // enxerga nada é pior que nenhuma.
  const desfazer = async (mensagem: string, status: number) => {
    await comServico.auth.admin.deleteUser(novoId)
    return erro(mensagem, status)
  }

  // O gatilho `mv_ao_criar_usuario` pode ter criado um perfil sem convite. O
  // upsert acerta os dois casos sem depender de qual aconteceu.
  const { error: erroPerfilNovo } = await comServico.from('perfis').upsert(
    {
      id: novoId,
      restaurante_id: restauranteId,
      nome: dados.nome.trim(),
      email,
      papel: 'operador',
      usuario,
      ativo: true,
      convite_aceito_em: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (erroPerfilNovo) return desfazer(`Não consegui criar o perfil: ${erroPerfilNovo.message}`, 500)

  const { error: erroSetores } = await comServico
    .from('perfil_setores')
    .insert(dados.setores.map((setor_id) => ({ perfil_id: novoId, setor_id })))
  if (erroSetores) return desfazer(`Não consegui prender aos setores: ${erroSetores.message}`, 500)

  return responder({
    criado: { id: novoId, nome: dados.nome.trim(), usuario, email, setores: dados.setores.length },
    aviso: `Entre com o login "${usuario}" e a senha escolhida. O e-mail é interno e não recebe mensagem.`,
  })
})
