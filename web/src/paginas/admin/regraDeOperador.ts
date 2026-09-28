/**
 * A regra do acesso de operador de setor — a mesma na tela e na função.
 *
 * Este arquivo não importa nada de propósito: ele é copiado inteiro para
 * dentro da edge function `criar-operador` pelo `preparar-funcao.mjs`. Aquela
 * função roda com a `service_role`, que passa por cima da RLS; a checagem
 * daqui é a única que sobra. Se a regra virasse uma segunda cópia escrita à
 * mão, o lado que divergisse seria justamente o que cria conta.
 */

export interface QuemCria {
  id: string
  papel: 'master' | 'admin' | 'gerente' | 'operador'
  restaurante_id: string | null
}

export interface Veredito {
  permitido: boolean
  motivo: string
}

/**
 * Quem cria acesso de operador.
 *
 * Gerente fica de fora, e isso é de propósito: `mv_pode_administrar` inclui
 * gerente para o CADASTRO do restaurante, mas equipe é identidade — e
 * identidade exige master ou admin. É a mesma linha que a 0014 corrigiu nas
 * políticas de convite.
 */
export function podeCriarOperador(ator: QuemCria | null, restauranteId: string): Veredito {
  if (!ator) return { permitido: false, motivo: 'Sessão sem perfil carregado.' }
  if (ator.papel === 'master') return { permitido: true, motivo: '' }
  if (ator.papel !== 'admin') return { permitido: false, motivo: 'Só master e admin criam acesso de equipe.' }
  if (ator.restaurante_id !== restauranteId) {
    return { permitido: false, motivo: 'Este restaurante é de outro administrador.' }
  }
  return { permitido: true, motivo: '' }
}

export interface DadosDoOperador {
  nome: string
  usuario: string
  senha: string
  setores: string[]
}

export interface Problema {
  campo: 'nome' | 'usuario' | 'senha' | 'setores'
  mensagem: string
}

/** Comprimento mínimo da senha. Curto demais é convite a chute. */
export const MINIMO_DA_SENHA = 8

export function validarOperador(dados: DadosDoOperador): Problema[] {
  const problemas: Problema[] = []
  const nome = dados.nome.trim()
  const usuario = dados.usuario.trim()

  if (nome === '') {
    problemas.push({ campo: 'nome', mensagem: 'O acesso precisa de um nome — é ele que aparece na tela.' })
  }
  if (usuario.length < 3) {
    problemas.push({ campo: 'usuario', mensagem: 'O login precisa de ao menos 3 letras.' })
  }
  // Barra, arroba e acento no login viram dor de cabeça na hora de digitar num
  // celular molhado, dentro de uma câmara fria. Letras, números e espaço.
  if (usuario !== '' && !/^[\p{L}\p{N} .\-_]+$/u.test(usuario)) {
    problemas.push({ campo: 'usuario', mensagem: 'Use letras, números, espaço, ponto, hífen ou sublinhado.' })
  }
  if (dados.senha.length < MINIMO_DA_SENHA) {
    problemas.push({
      campo: 'senha',
      mensagem: `A senha precisa de ao menos ${MINIMO_DA_SENHA} caracteres.`,
    })
  }
  if (dados.setores.length === 0) {
    problemas.push({
      campo: 'setores',
      mensagem: 'Escolha ao menos um setor — é o que este acesso vai enxergar.',
    })
  }
  return problemas
}

/**
 * O endereço que o GoTrue vai guardar.
 *
 * O login destas contas é "Operador Bar", não um e-mail — mas o GoTrue exige
 * um. Então ele nasce sintético, derivado do login e do restaurante, e nunca
 * recebe mensagem nenhuma. O domínio `.local` não existe na internet de
 * propósito: nenhuma mensagem escapa, nem por engano de configuração.
 */
export function emailSintetico(usuario: string, slugDoRestaurante: string): string {
  const parte = aca(usuario)
  const casa = aca(slugDoRestaurante) || 'restaurante'
  return `${parte || 'operador'}@${casa}.local`
}

/** Texto virando pedaço de endereço: sem acento, sem espaço, minúsculo. */
function aca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
