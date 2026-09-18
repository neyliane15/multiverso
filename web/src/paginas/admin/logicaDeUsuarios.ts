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
