/**
 * Quem pode excluir quem — a regra, sozinha.
 *
 * Mora num arquivo próprio, sem importar nada, porque ela roda em DOIS lugares:
 * na tela (para o botão existir ou não) e dentro da edge function que apaga de
 * verdade. A função usa a `service_role`, que passa por cima da RLS — então lá
 * a checagem não é enfeite, é a única que sobra. Duas cópias dessa decisão
 * divergiriam em silêncio, e o lado que divergisse seria o que apaga.
 *
 * `ferramentas/preparar-funcao.mjs` copia este arquivo para dentro da função no
 * deploy. A fonte é esta.
 */

export type PapelDeUsuario = 'master' | 'admin' | 'gerente' | 'operador'

export interface QuemMexe {
  id: string
  papel: PapelDeUsuario
  restaurante_id: string | null
}

export interface Veredito {
  permitido: boolean
  motivo: string
}

/**
 * Excluir é diferente de desativar, e a regra é mais apertada de propósito.
 *
 *   master   exclui qualquer um, menos ele mesmo
 *   admin    exclui gente do PRÓPRIO restaurante, e nunca um master
 *   gerente  não mexe em equipe (é a regra de toda esta seção)
 *   operador idem
 *
 * Ninguém exclui a própria conta: seria a última coisa que a tela faria, e
 * deixaria o restaurante sem quem administra se fosse o único admin.
 */
export function podeExcluirUsuario(ator: QuemMexe | null, alvo: QuemMexe): Veredito {
  if (!ator) {
    return { permitido: false, motivo: 'Sessão sem perfil carregado.' }
  }
  if (ator.id === alvo.id) {
    return {
      permitido: false,
      motivo: 'Você não pode excluir a própria conta. Peça a outro master ou admin.',
    }
  }
  if (ator.papel === 'master') {
    return { permitido: true, motivo: '' }
  }
  if (ator.papel !== 'admin') {
    return {
      permitido: false,
      motivo: 'Só master e admin mexem em equipe.',
    }
  }
  if (alvo.papel === 'master') {
    return { permitido: false, motivo: 'Um admin não exclui um master.' }
  }
  if (alvo.restaurante_id === null || alvo.restaurante_id !== ator.restaurante_id) {
    return { permitido: false, motivo: 'Este usuário é de outro restaurante.' }
  }
  return { permitido: true, motivo: '' }
}
