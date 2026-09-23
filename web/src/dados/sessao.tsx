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
  /** A consulta do perfil falhou. Não confundir com "não tem perfil". */
  falhaAoCarregar: string | null
  /** Tenta carregar o perfil de novo, sem sair da conta. */
  recarregarPerfil: () => void
  podeAdministrar: boolean
  trocarRestaurante: (id: string) => void
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<EstadoSessao | null>(null)
const CHAVE_ESCOLHA = 'multiverso.restaurante-ativo'

const PODE_ADMINISTRAR: PapelUsuario[] = ['master', 'admin', 'gerente']

/** Quanto a tela espera o perfil antes de dizer que não veio. */
const PRAZO_DO_PERFIL = 15_000

/** Promessa com prazo: sem ele, a tela espera para sempre e não mostra nada. */
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(
      () => rejeitar(new Error('O servidor não respondeu a tempo.')),
      ms,
    )
    promessa.then(
      (valor) => {
        clearTimeout(relogio)
        resolver(valor)
      },
      (falha) => {
        clearTimeout(relogio)
        rejeitar(falha)
      },
    )
  })
}

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
  /** Mensagem de quando a consulta do perfil falhou — diferente de não ter perfil. */
  const [falhaAoCarregar, setFalhaAoCarregar] = useState<string | null>(null)

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null)
      setRestaurantes([])
      return
    }
    /**
     * Tudo dentro de um try, e com prazo.
     *
     * Duas coisas deixavam a tela em "Carregando" para sempre. Uma exceção —
     * `maybeSingle()` lança em resposta que não é 2xx — subia para quem
     * chamou, e lá em cima o `setCarregando(false)` ficava depois de um
     * `await` que nunca voltava. E a consulta podia simplesmente não
     * responder. Sem prazo, "não respondeu" e "ainda vai responder" são a
     * mesma coisa para a tela, e ela escolhe esperar — sem erro e sem volta.
     */
    let perfilDito: { data: unknown; error: { message: string } | null }
    let restaurantesDitos: { data: unknown }
    try {
      // A RLS já limita o que volta: o master recebe a rede, os demais recebem
      // só o próprio restaurante. Não filtramos nada no cliente.
      ;[perfilDito, restaurantesDitos] = await comPrazo(
        Promise.all([
          supabase.from('perfis').select('*').eq('id', s.user.id).maybeSingle(),
          supabase.from('restaurantes').select('*').eq('ativo', true).order('nome'),
        ]),
        PRAZO_DO_PERFIL,
      )
    } catch (falha) {
      setFalhaAoCarregar(falha instanceof Error ? falha.message : String(falha))
      return
    }

    /**
     * O erro da consulta NÃO é a mesma coisa que "esta conta não tem perfil".
     *
     * Antes os dois viravam `perfil = null`, e `null` leva à tela que diz
     * "sua conta existe mas ainda não tem acesso". Ou seja: uma requisição que
     * falhou — rede oscilando, token sendo renovado, PostgREST respondendo
     * 5xx — era anunciada como falta de convite. A pessoa ia atrás de um
     * convite que existe, enquanto o problema era outro e passaria sozinho.
     */
    if (perfilDito.error) {
      setFalhaAoCarregar(perfilDito.error.message)
      return
    }
    setFalhaAoCarregar(null)
    setPerfil((perfilDito.data as Perfil) ?? null)
    setRestaurantes((restaurantesDitos.data as Restaurante[]) ?? [])

    /**
     * Carimba a presença. O `.then()` vazio não é enfeite: as consultas do
     * supabase-js são *thenable*, não Promise — elas só saem do lugar quando
     * alguém as aguarda. Com `void` na frente, a expressão era avaliada e a
     * requisição NUNCA era enviada, e a coluna `ultimo_acesso_em` ficava nula
     * para todo mundo, para sempre. A tela de Usuários dizia "nunca entrou"
     * até para quem estava lendo a tela naquele instante.
     *
     * Falhar aqui não pode derrubar nada: é conveniência, não sessão.
     */
    void supabase
      .from('perfis')
      .update({ ultimo_acesso_em: new Date().toISOString() })
      .eq('id', s.user.id)
      .then(
        () => undefined,
        () => undefined,
      )
  }, [])

  useEffect(() => {
    let vivo = true
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!vivo) return
        setSessao(data.session)
        await carregarPerfil(data.session)
      })
      // `finally`, e não a última linha do `then`: o que decide se a tela sai
      // do "Carregando" não pode depender de nada ter dado certo.
      .finally(() => {
        if (vivo) setCarregando(false)
      })

    const { data: inscricao } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (evento === 'SIGNED_OUT') setRecuperandoSenha(false)
      setSessao(s)
      /**
       * O `setTimeout` tira a consulta de DENTRO do callback, e isso não é
       * estilo: o supabase-js executa este callback segurando o cadeado de
       * autenticação, e qualquer consulta feita aqui espera o mesmo cadeado.
       * As duas ficam esperando uma à outra, a promessa não resolve, e a tela
       * fica em "Carregando" sem erro nenhum. Zero milissegundo basta — o que
       * importa é sair da pilha do callback.
       */
      setTimeout(() => {
        if (vivo) void carregarPerfil(s)
      }, 0)
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
    falhaAoCarregar,
    recarregarPerfil: () => void carregarPerfil(sessao),
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
