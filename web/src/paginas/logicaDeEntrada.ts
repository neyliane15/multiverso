/**
 * As decisões da porta de entrada, fora do componente para poderem ser testadas.
 *
 * Duas coisas moram aqui: traduzir o que o GoTrue devolve e decidir o que
 * dizer depois de um cadastro. A segunda é a que engana: `signUp` responde
 * "sucesso" em dois casos bem diferentes — sessão aberta na hora, ou e-mail de
 * confirmação a caminho — e tratar os dois igual deixa a pessoa parada na tela
 * esperando algo que não vai acontecer.
 */

export type ModoDaEntrada = 'entrar' | 'criar' | 'recuperar'

/**
 * Mensagem do GoTrue em português, sem contar mais do que ele conta.
 *
 * O "Invalid login credentials" é genérico de propósito: não revela se o
 * e-mail existe. A tradução mantém essa discrição — dizer "este e-mail não
 * está cadastrado" entregaria a lista de usuários para quem quisesse sondar.
 */
export function mensagemDeAuth(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login')) return 'E-mail ou senha não conferem.'
  if (m.includes('email not confirmed')) {
    return 'Falta confirmar o e-mail. Procure a mensagem que enviamos, inclusive no spam.'
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Este e-mail já tem conta. Entre com ela, ou use "Esqueci minha senha".'
  }
  if (m.includes('password should be') || m.includes('password is too short')) {
    return 'A senha é curta demais. Use ao menos 6 caracteres.'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'O cadastro está desligado no projeto. Peça ao administrador para ligá-lo no Supabase.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  }
  if (m.includes('for security purposes')) {
    return 'Espere alguns segundos antes de tentar de novo.'
  }
  return mensagem
}

/**
 * O erro é "falta confirmar o e-mail"?
 *
 * Importa porque esse caso tem saída própria: o convite já foi consumido no
 * cadastro, então quem não confirmou não entra E não pode ser convidado de
 * novo — `mv_convidar` recusa dizendo que já existe usuário com aquele
 * e-mail. Sem oferecer o reenvio aqui, a pessoa fica presa.
 */
export function precisaConfirmar(mensagem: string): boolean {
  return mensagem.toLowerCase().includes('email not confirmed')
}

/**
 * O que dizer depois de `signUp`.
 *
 * `sessao` vem nula quando o projeto exige confirmação de e-mail — o cadastro
 * deu certo, mas a pessoa ainda não entrou. Sem distinguir os dois, a tela
 * mandaria "pronto, entre" para quem ainda precisa abrir o e-mail.
 */
export function depoisDoCadastro(temSessao: boolean): {
  entrou: boolean
  titulo: string
  texto: string
} {
  if (temSessao) {
    return {
      entrou: true,
      titulo: 'Conta criada',
      texto: 'Estamos abrindo o sistema para você.',
    }
  }
  return {
    entrou: false,
    titulo: 'Confirme o e-mail',
    texto:
      'Este projeto do Supabase está exigindo confirmação: abra o link que acabou de chegar e você volta para cá já dentro do sistema. ' +
      'Quem administra pode desligar essa exigência — o convite já diz quem é você.',
  }
}

/** Senha aceitável para o GoTrue com a configuração padrão. */
export const MINIMO_DA_SENHA = 6

export function problemaDaSenha(senha: string, repetida: string): string | null {
  if (senha.length < MINIMO_DA_SENHA) {
    return `A senha precisa de pelo menos ${MINIMO_DA_SENHA} caracteres.`
  }
  if (senha !== repetida) return 'As duas senhas não são iguais.'
  return null
}
