/**
 * Sessão: quem está logado, em que restaurante, e com que poder.
 *
 * O master não pertence a restaurante nenhum — ele escolhe qual quer olhar, e
 * essa escolha vive aqui (e só aqui). Para todos os outros papéis o
 * restaurante ativo é o próprio, sem escolha possível.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { PapelUsuario, Perfil, Restaurante } from '@/tipos/banco'

interface EstadoSessao {
  carregando: boolean
  sessao: Session | null
  perfil: Perfil | null
  restaurante: Restaurante | null
  /** Restaurantes que este usuário enxerga. Para o master, a rede inteira. */
  restaurantesVisiveis: Restaurante[]
  ehMaster: boolean
  /** Chegou pelo link de recuperação: a senha ainda é a antiga. */
  recuperandoSenha: boolean
  concluirRecuperacao: () => void
  podeAdministrar: boolean
  trocarRestaurante: (id: string) => void
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<EstadoSessao | null>(null)
const CHAVE_ESCOLHA = 'multiverso.restaurante-ativo'

const PODE_ADMINISTRAR: PapelUsuario[] = ['master', 'admin', 'gerente']

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [escolhido, setEscolhido] = useState<string | null>(
    () => localStorage.getItem(CHAVE_ESCOLHA),
  )
  /**
   * O GoTrue devolve a pessoa com sessão aberta ao clicar no link de
   * recuperação. Sem marcar esse estado, ela entraria direto no sistema e o
   * link teria "funcionado" sem trocar senha nenhuma.
   */
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null)
      setRestaurantes([])
      return
    }
    // A RLS já limita o que volta: o master recebe a rede, os demais recebem
    // só o próprio restaurante. Não filtramos nada no cliente.
    const [{ data: p }, { data: rs }] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('restaurantes').select('*').eq('ativo', true).order('nome'),
    ])
    setPerfil((p as Perfil) ?? null)
    setRestaurantes((rs as Restaurante[]) ?? [])

    // Carimba a presença sem travar a tela se falhar.
    void supabase
      .from('perfis')
      .update({ ultimo_acesso_em: new Date().toISOString() })
      .eq('id', s.user.id)
  }, [])

  useEffect(() => {
    let vivo = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      await carregarPerfil(data.session)
      if (vivo) setCarregando(false)
    })

    const { data: inscricao } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (evento === 'SIGNED_OUT') setRecuperandoSenha(false)
      setSessao(s)
      void carregarPerfil(s)
    })
    return () => {
      vivo = false
      inscricao.subscription.unsubscribe()
    }
  }, [carregarPerfil])

  const ehMaster = perfil?.papel === 'master'

  const restaurante = useMemo(() => {
    if (!perfil) return null
    if (!ehMaster) {
      return restaurantes.find((r) => r.id === perfil.restaurante_id) ?? null
    }
    return restaurantes.find((r) => r.id === escolhido) ?? restaurantes[0] ?? null
  }, [perfil, ehMaster, restaurantes, escolhido])

  const trocarRestaurante = useCallback((id: string) => {
    localStorage.setItem(CHAVE_ESCOLHA, id)
    setEscolhido(id)
  }, [])

  const valor: EstadoSessao = {
    carregando,
    sessao,
    perfil,
    restaurante,
    restaurantesVisiveis: restaurantes,
    ehMaster: Boolean(ehMaster),
    recuperandoSenha,
    concluirRecuperacao: () => setRecuperandoSenha(false),
    podeAdministrar: perfil ? PODE_ADMINISTRAR.includes(perfil.papel) : false,
    trocarRestaurante,
    recarregar: useCallback(() => carregarPerfil(sessao), [carregarPerfil, sessao]),
    sair: useCallback(async () => {
      localStorage.removeItem(CHAVE_ESCOLHA)
      await supabase.auth.signOut()
    }, []),
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao(): EstadoSessao {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>')
  return ctx
}

/** Atalho para as telas que só fazem sentido com um restaurante ativo. */
export function useRestauranteAtivo(): Restaurante {
  const { restaurante } = useSessao()
  if (!restaurante) throw new Error('Nenhum restaurante ativo nesta sessão')
  return restaurante
}
