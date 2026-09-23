/**
 * Edge Function `remover-usuario` — exclusão de verdade, não pela metade.
 *
 * Apagar só a linha de `perfis` pelo navegador deixaria a conta viva no
 * `auth.users`: a pessoa continuaria entrando, cairia na tela "sua conta
 * existe mas ainda não tem acesso", e não poderia ser convidada de novo —
 * porque o gatilho que transforma convite em perfil só dispara quando a conta
 * NASCE. Limbo, e sem saída pela interface.
 *
 * Apagar o usuário do `auth` resolve os dois: a FK de `perfis` é
 * `on delete cascade`, então o perfil vai junto, e o e-mail fica livre para um
 * convite novo. Só que isso exige a `service_role`, que não pode viver no
 * navegador. Daí esta função.
 *
 * ---------------------------------------------------------------------------
 * Como publicar, da raiz do repositório:
 *
 *   node ferramentas/preparar-funcao.mjs
 *   supabase functions deploy remover-usuario
 *
 * ---------------------------------------------------------------------------
 * A `service_role` passa por cima de TODA a RLS. Então aqui ela é usada no
 * menor pedaço possível, e nunca para decidir:
 *
 * 1. quem está chamando sai do JWT, nunca do corpo do pedido. O corpo diz só
 *    QUEM apagar; dizer também quem é você seria deixar o pedido escolher a
 *    própria permissão;
 * 2. a decisão é `podeExcluirUsuario`, o mesmo arquivo que a tela usa —
 *    copiado para cá no deploy, com a fonte em `web/src/paginas/admin/`;
 * 3. a `service_role` só aparece depois do "sim", e só para o `deleteUser`.
 */

import { createClient } from '@supabase/supabase-js'
import { podeExcluirUsuario, type QuemMexe } from './_compartilhado/regraDeExclusao.ts'

const CABECALHOS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const erro = (mensagem: string, status: number) => responder({ erro: mensagem }, status)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS_CORS })
  if (req.method !== 'POST') return erro('Use POST.', 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !servico) {
    return erro('A função está sem as variáveis do projeto.', 500)
  }

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao.startsWith('Bearer ')) return erro('Faltou o token de quem está pedindo.', 401)

  let corpo: { usuarioId?: string }
  try {
    corpo = await req.json()
  } catch {
    return erro('Corpo inválido: esperava JSON.', 400)
  }
  const alvoId = corpo.usuarioId
  if (!alvoId) return erro('Faltou dizer qual usuário excluir.', 400)

  // Quem pede sai do token. Um cliente com o token de alguém não consegue
  // afirmar ser outra pessoa.
  const comOToken = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao } = await comOToken.auth.getUser()
  const autorId = sessao.user?.id
  if (!autorId) return erro('Token inválido ou expirado.', 401)

  // A leitura dos dois perfis usa a service_role de propósito: se ela passasse
  // pela RLS, um alvo que o autor não enxerga voltaria como "não existe", e a
  // resposta diria a coisa errada. A decisão vem logo abaixo, explícita.
  const comServico = createClient(url, servico, { auth: { persistSession: false } })

  const { data: perfis, error: erroPerfis } = await comServico
    .from('perfis')
    .select('id, papel, restaurante_id, nome, email')
    .in('id', [autorId, alvoId])

  if (erroPerfis) return erro(`Não consegui ler os perfis: ${erroPerfis.message}`, 500)

  const linhas = (perfis ?? []) as (QuemMexe & { nome: string; email: string })[]
  const ator = linhas.find((p) => p.id === autorId) ?? null
  const alvo = linhas.find((p) => p.id === alvoId) ?? null

  if (!ator) return erro('Sua conta não tem perfil neste sistema.', 403)
  if (!alvo) return erro('Este usuário não existe (ou já foi excluído).', 404)

  const veredito = podeExcluirUsuario(ator, alvo)
  if (!veredito.permitido) return erro(veredito.motivo, 403)

  // A partir daqui, e só aqui, a service_role trabalha. O cascade de
  // `perfis.id -> auth.users(id)` leva o perfil junto.
  const { error: erroApagar } = await comServico.auth.admin.deleteUser(alvoId)
  if (erroApagar) return erro(`Não consegui excluir: ${erroApagar.message}`, 500)

  return responder({
    excluido: { id: alvo.id, nome: alvo.nome, email: alvo.email },
    // O convite aceito fica: é o registro de como a pessoa entrou, e a 0014
    // tornou isso imutável. O e-mail, porém, já está livre para um convite novo.
    aviso: 'O histórico do que a pessoa lançou continua, agora sem nome.',
  })
})
