/**
 * Quem pode mexer em quem — a mesma regra que o banco impõe, escrita antes do
 * clique.
 *
 * O trigger `mv_guarda_papel` (0006_rls.sql) recusa duas coisas: um usuário
 * alterando o próprio papel e um admin promovendo alguém a master. A política
 * `perfis_editar` ainda exige ser master ou admin do restaurante do alvo.
 *
 * Repetimos a regra aqui de propósito. Não é confiança na tela — a segurança
 * continua sendo do banco, e é ele quem decide. É que "opção desabilitada com
 * o motivo escrito" é uma interface, e "erro em português do Postgres depois
 * do clique" não é. Se as duas discordarem, o banco ganha e esta tela está
 * errada — por isso a regra tem teste próprio.
 */
import { chaveBusca } from '@/util/formato'
import type { PapelUsuario, Perfil } from '@/tipos/banco'

/** O mínimo que precisamos saber de alguém para decidir permissão. */
export interface Envolvido {
  id: string
  papel: PapelUsuario
  restaurante_id: string | null
}

export const PAPEIS: PapelUsuario[] = ['master', 'admin', 'gerente', 'operador']

export const DESCRICAO_DO_PAPEL: Record<PapelUsuario, string> = {
  master: 'A rede inteira. Cadastra restaurantes, cria admins, monitora tudo.',
  admin: 'O próprio restaurante, incluindo equipe e identidade visual.',
  gerente: 'O próprio restaurante: cadastros, contagem e compras. Não mexe em usuários.',
  operador: 'Lança contagem e compras. Não apaga cadastro.',
}

/* ========================================================================== */
/* Quem pode administrar equipe                                               */
/* ========================================================================== */

/**
 * A rota de Usuários aceita gerente (ele administra o restaurante), mas a RLS
 * de `perfis` só deixa master e admin escreverem. Sem isto o gerente veria os
 * controles e tomaria 42501 em cada clique.
 */
export function podeEditarEquipe(ator: Envolvido | null): boolean {
  return ator?.papel === 'master' || ator?.papel === 'admin'
}

export function motivoSemEdicao(ator: Envolvido | null): string {
  if (!ator) return 'Sessão sem perfil carregado.'
  if (ator.papel === 'gerente') {
    return 'Gerente enxerga a equipe, mas quem altera papel e acesso é o admin do restaurante ou um master.'
  }
  return 'Seu papel não permite alterar usuários.'
}

/* ========================================================================== */
/* Alterar o papel de alguém                                                  */
/* ========================================================================== */

export interface Permissao {
  permitido: boolean
  /** Vazio quando permitido; o motivo em português quando não. */
  motivo: string
}

const PERMITIDO: Permissao = { permitido: true, motivo: '' }

/**
 * Espelha `mv_guarda_papel` na ordem em que o banco checa — inclusive a ordem,
 * para que a tela diga o mesmo motivo que o banco diria.
 */
export function podeDefinirPapel(
  ator: Envolvido | null,
  alvo: Envolvido,
  novoPapel: PapelUsuario,
): Permissao {
  if (!ator) return { permitido: false, motivo: 'Sessão sem perfil carregado.' }
  if (novoPapel === alvo.papel) return PERMITIDO

  if (!podeEditarEquipe(ator)) {
    return { permitido: false, motivo: motivoSemEdicao(ator) }
  }

  if (ator.papel === 'admin') {
    if (alvo.restaurante_id !== ator.restaurante_id) {
      return {
        permitido: false,
        motivo: 'Este usuário é de outro restaurante. Só um master mexe fora do seu.',
      }
    }
    if (novoPapel === 'master') {
      return {
        permitido: false,
        motivo: 'Só um master promove alguém a master — o banco recusa a operação.',
      }
    }
    if (alvo.id === ator.id) {
      return { permitido: false, motivo: 'Você não pode alterar o próprio papel.' }
    }
  }

  return PERMITIDO
}

export interface OpcaoDePapel {
  papel: PapelUsuario
  disponivel: boolean
  /** Por que está indisponível — some quando disponível. */
  motivo: string
}

/** As quatro opções com o motivo de cada indisponibilidade já escrito. */
export function opcoesDePapel(ator: Envolvido | null, alvo: Envolvido): OpcaoDePapel[] {
  return PAPEIS.map((papel) => {
    const { permitido, motivo } = podeDefinirPapel(ator, alvo, papel)
    return { papel, disponivel: permitido, motivo }
  })
}

/* ========================================================================== */
/* O que mandar para o banco                                                  */
/* ========================================================================== */

export interface AlteracaoDePapel {
  /** null quando a alteração não pode ser montada. */
  patch: { id: string; papel: PapelUsuario; restaurante_id: string | null } | null
  erro: string | null
}

/**
 * Monta o update respeitando `perfil_tenant_coerente`: master **não** tem
 * restaurante, e todos os outros papéis têm um obrigatoriamente. Promover sem
 * limpar o restaurante — ou rebaixar sem escolher um — estoura o CHECK do
 * banco com uma mensagem que ninguém entende.
 */
export function montarAlteracaoDePapel(
  ator: Envolvido | null,
  alvo: Envolvido,
  novoPapel: PapelUsuario,
  restauranteEscolhido?: string | null,
): AlteracaoDePapel {
  const permissao = podeDefinirPapel(ator, alvo, novoPapel)
  if (!permissao.permitido) return { patch: null, erro: permissao.motivo }

  if (novoPapel === 'master') {
    return { patch: { id: alvo.id, papel: 'master', restaurante_id: null }, erro: null }
  }

  const destino = restauranteEscolhido ?? alvo.restaurante_id
  if (!destino) {
    return {
      patch: null,
      erro:
        'Escolha o restaurante deste usuário: só o master vive fora de um, e todos os outros papéis precisam de um.',
    }
  }
  return { patch: { id: alvo.id, papel: novoPapel, restaurante_id: destino }, erro: null }
}

/* ========================================================================== */
/* Ativar e desativar                                                         */
/* ========================================================================== */

export function podeAlternarAtivo(ator: Envolvido | null, alvo: Envolvido): Permissao {
  if (!ator) return { permitido: false, motivo: 'Sessão sem perfil carregado.' }
  if (!podeEditarEquipe(ator)) return { permitido: false, motivo: motivoSemEdicao(ator) }
  if (alvo.id === ator.id) {
    return {
      permitido: false,
      motivo: 'Você não pode desativar o próprio acesso — seria a última coisa que esta tela faria.',
    }
  }
  if (ator.papel === 'admin' && alvo.restaurante_id !== ator.restaurante_id) {
    return { permitido: false, motivo: 'Este usuário é de outro restaurante.' }
  }
  if (ator.papel === 'admin' && alvo.papel === 'master') {
    return { permitido: false, motivo: 'Um admin não desativa um master.' }
  }
  return PERMITIDO
}

/* ========================================================================== */
/* Filtro da lista                                                            */
/* ========================================================================== */

export type SituacaoDoUsuario = 'ativos' | 'inativos' | 'todos'

export interface FiltroDeEquipe {
  busca: string
  restauranteId: string | null
  papel: PapelUsuario | null
  situacao: SituacaoDoUsuario
}

export const FILTRO_DE_EQUIPE: FiltroDeEquipe = {
  busca: '',
  restauranteId: null,
  papel: null,
  situacao: 'ativos',
}

export function filtrarEquipe(perfis: readonly Perfil[], filtro: FiltroDeEquipe): Perfil[] {
  const alvo = chaveBusca(filtro.busca)
  return perfis.filter((p) => {
    if (filtro.situacao === 'ativos' && !p.ativo) return false
    if (filtro.situacao === 'inativos' && p.ativo) return false
    if (filtro.papel && p.papel !== filtro.papel) return false
    if (filtro.restauranteId && p.restaurante_id !== filtro.restauranteId) return false
    if (alvo === '') return true
    const texto = chaveBusca(`${p.nome} ${p.email}`)
    return alvo.split(' ').every((termo) => texto.includes(termo))
  })
}

/**
 * O banco deixa um master mudar o próprio papel — o trigger só barra quem não
 * é master. Deixar passar calado seria um jeito silencioso de alguém se tirar
 * da rede sem querer, então a tela pede confirmação com o efeito escrito.
 */
export function avisoDeAutoAlteracao(
  ator: Envolvido | null,
  alvo: Envolvido,
  novoPapel: PapelUsuario,
): string | null {
  if (!ator || ator.id !== alvo.id || novoPapel === alvo.papel) return null
  if (ator.papel !== 'master') return null
  return (
    `Você está mudando o próprio papel de master para ${novoPapel}. ` +
    'Ao salvar, você perde a visão da rede e passa a enxergar só um restaurante. ' +
    'Outro master precisará devolver o papel.'
  )
}

/* ────────────────────────────────────────── entregar o convite ──────────── */

/**
 * O convite é uma LINHA NO BANCO, não um e-mail.
 *
 * O sistema não envia nada: não há SMTP configurado, não há função de envio,
 * e a linha em `convites` só libera a porta para quem se cadastrar com aquele
 * e-mail. Quem avisa a pessoa é quem convidou.
 *
 * Isso é decisão, não esquecimento — mandar e-mail exige um provedor
 * contratado, domínio verificado e uma chave que não pode viver no navegador.
 * Mas a tela precisa DIZER, e precisa dar o texto pronto: sem isso, quem
 * convida fica esperando um e-mail que nunca vai sair, e a pessoa convidada
 * nunca é avisada. Foi exatamente o que aconteceu com os dois primeiros
 * convites do Bar do Zeca.
 */
/**
 * Telefone brasileiro em formato que o WhatsApp entende: só dígitos, com DDI.
 *
 * O `wa.me` não perdoa: `(11) 99999-8888` abre uma conversa com ninguém, e
 * sem o 55 na frente ele tenta um número dos Estados Unidos. Como o erro é
 * SILENCIOSO — abre o WhatsApp, some a conversa, e quem clicou acha que
 * mandou — a normalização mora aqui, testada, em vez de solta na tela.
 *
 * As regras, na ordem em que importam:
 *   10 dígitos  DDD + fixo/celular antigo        -> 55 na frente
 *   11 dígitos  DDD + celular com o nono dígito  -> 55 na frente
 *   12 ou 13    já veio com DDI                  -> como está
 *   começa com 0 (0xx)                           -> o zero sai
 *
 * Devolve null quando não dá para confiar. Melhor não oferecer o botão do que
 * oferecer um que abre a conversa errada.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  let digitos = (bruto ?? '').replace(/\D/g, '')
  if (digitos === '') return null

  // 0xx11999998888: o zero de operadora não existe em número internacional.
  if (digitos.length > 11 && digitos.startsWith('0')) digitos = digitos.slice(1)

  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos
  // Outro país, já com DDI plausível: respeita em vez de estragar.
  if (digitos.length >= 11 && digitos.length <= 15) return digitos
  return null
}

/** Como o número aparece na tela: +55 (11) 99999-8888. */
export function telefoneLegivel(bruto: string | null | undefined): string | null {
  const n = normalizarTelefone(bruto)
  if (n === null) return null
  if (!n.startsWith('55') || (n.length !== 12 && n.length !== 13)) return `+${n}`
  const ddd = n.slice(2, 4)
  const resto = n.slice(4)
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4)
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4)
  return `+55 (${ddd}) ${meio}-${fim}`
}

/**
 * O link que abre a conversa com a mensagem já escrita.
 *
 * `wa.me` é o "click to chat" oficial: abre o aplicativo no celular ou o
 * WhatsApp Web no computador, na conversa daquele número, com o texto
 * preenchido. Quem convida confere e aperta enviar.
 *
 * Mandar sozinho, sem esse toque, exigiria a API oficial da Meta — conta
 * comercial verificada, modelos de mensagem aprovados e um número dedicado.
 * Não é o que esta função faz, e prometer isso na tela seria mentira.
 */
export function linkDoWhatsapp(telefone: string | null | undefined, mensagem: string): string | null {
  const numero = normalizarTelefone(telefone)
  if (numero === null) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

export interface DadosDoConvite {
  email: string
  nome?: string | null
  papel: PapelUsuario
  restaurante?: string | null
  expiraEm: string
  /** Endereço do sistema, para a pessoa saber onde clicar. */
  endereco: string
}

/** Data em pt-BR, sem depender do util de formato (que é de tela). */
function dia(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

/**
 * O recado pronto para colar no WhatsApp.
 *
 * Numerado porque são quatro passos numa tela que a pessoa nunca viu, e o
 * segundo — "Tenho um convite" — é o único que ela não adivinharia sozinha.
 */
export function mensagemDoConvite(dados: DadosDoConvite): string {
  const saudacao = dados.nome?.trim() ? `Oi, ${dados.nome.trim()}!` : 'Oi!'
  const onde = dados.restaurante?.trim() ? ` no ${dados.restaurante.trim()}` : ''
  const validade = dia(dados.expiraEm)

  return [
    `${saudacao} Você foi convidado para o Multiverso${onde}, como ${dados.papel}.`,
    '',
    'Para entrar:',
    `1. abra ${dados.endereco}`,
    '2. clique em "Tenho um convite"',
    `3. use exatamente este e-mail: ${dados.email}`,
    '4. escolha a senha que quiser — ela é sua, ninguém mais vê',
    ...(validade ? ['', `O convite vale até ${validade}.`] : []),
  ].join('\n')
}
