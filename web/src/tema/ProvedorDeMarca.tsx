/**
 * Gestão de Restaurantes · provedor de marca
 * ---------------------------------------------------------------------------
 * Recebe o restaurante ativo, aplica a identidade dele e mantém as fontes
 * carregadas. Três casos que ele precisa resolver bem:
 *
 *  1. Nenhum restaurante (o master, e a tela de login): entra a marca do
 *     próprio sistema.
 *  2. Troca de restaurante sem piscar: as cores viram variáveis CSS escritas
 *     antes da pintura (useLayoutEffect), e a fonte nova é pedida antes de
 *     virar a fonte em uso — enquanto ela não chega, continua valendo a
 *     anterior, que já está desenhada.
 *  3. Tema claro/escuro por restaurante: o valor vem do banco; o operador pode
 *     trocar no aparelho dele, e a escolha fica guardada por restaurante.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Marca, Restaurante } from '@/tipos/banco'
import { MARCA_PADRAO, aplicarMarca, derivarMarca, type DerivadasDaMarca } from './marca'

export type TemaDaMarca = Marca['tema']

export interface ContextoDaMarca {
  /** O restaurante ativo, ou null quando é o master / ainda não há sessão. */
  restaurante: Restaurante | null
  /** A identidade em vigor: a do restaurante, ou a do sistema. */
  marca: Marca
  /** Tudo que a UI usa e o banco não guarda. */
  derivadas: DerivadasDaMarca
  /** As oito cores de série, na ordem fixa. Recharts consome direto. */
  graficos: string[]
  /** Tema em vigor (do banco, ou o que este aparelho escolheu). */
  tema: TemaDaMarca
  /** Troca o tema e lembra a escolha para este restaurante neste aparelho. */
  definirTema: (tema: TemaDaMarca) => void
  /** Volta ao tema que o admin configurou no banco. */
  limparTema: () => void
  /** Falso enquanto a fonte escolhida ainda não desenhou. */
  fontesProntas: boolean
  /** true quando a marca em vigor é a da plataforma, não a de um restaurante. */
  ehPlataforma: boolean
}

const Contexto = createContext<ContextoDaMarca | null>(null)

/* -------------------------------------------------------------------------- */
/* Fontes                                                                      */
/* -------------------------------------------------------------------------- */

const PESOS = 'wght@400;500;600;700'
const pedidas = new Map<string, Promise<void>>()

function familiaParaUrl(familia: string): string {
  const nome = familia.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${nome}:${PESOS}&display=swap`
}

/**
 * Pede uma família ao Google Fonts uma única vez por sessão. Resolve quando a
 * folha chega — e nunca rejeita: fonte que não carrega cai na pilha de reserva
 * declarada em estilos.css, e o app continua legível.
 */
export function carregarFonte(familia: string): Promise<void> {
  if (typeof document === 'undefined' || familia.trim() === '') return Promise.resolve()
  const chave = familia.trim().toLowerCase()
  const jaPedida = pedidas.get(chave)
  if (jaPedida) return jaPedida

  const promessa = new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = familiaParaUrl(familia)
    link.dataset['mvFonte'] = chave
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
    document.head.appendChild(link)
  })
  pedidas.set(chave, promessa)
  return promessa
}

/* -------------------------------------------------------------------------- */
/* Tema guardado por restaurante                                               */
/* -------------------------------------------------------------------------- */

const chaveDoTema = (id: string | null): string => `mv:tema:${id ?? 'plataforma'}`

function lerTemaGuardado(id: string | null): TemaDaMarca | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const valor = localStorage.getItem(chaveDoTema(id))
    return valor === 'claro' || valor === 'escuro' ? valor : null
  } catch {
    return null
  }
}

function guardarTema(id: string | null, tema: TemaDaMarca | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (tema === null) localStorage.removeItem(chaveDoTema(id))
    else localStorage.setItem(chaveDoTema(id), tema)
  } catch {
    /* navegador em modo privado: a escolha vale só para esta visita */
  }
}

/* -------------------------------------------------------------------------- */
/* Favicon                                                                     */
/* -------------------------------------------------------------------------- */

function aplicarFavicon(url: string | null): void {
  if (typeof document === 'undefined') return
  const id = 'mv-favicon'
  const existente = document.getElementById(id)
  if (!url) {
    existente?.remove()
    return
  }
  const link = existente instanceof HTMLLinkElement ? existente : document.createElement('link')
  link.id = id
  link.rel = 'icon'
  link.href = url
  if (!link.parentNode) document.head.appendChild(link)
}

/* -------------------------------------------------------------------------- */
/* Provedor                                                                    */
/* -------------------------------------------------------------------------- */

/** Extrai só a parte de identidade visual de um restaurante. */
export function marcaDoRestaurante(restaurante: Restaurante | null): Marca {
  if (!restaurante) return MARCA_PADRAO
  return {
    logo_url: restaurante.logo_url,
    logo_escuro_url: restaurante.logo_escuro_url,
    favicon_url: restaurante.favicon_url,
    cor_primaria: restaurante.cor_primaria,
    cor_secundaria: restaurante.cor_secundaria,
    cor_acento: restaurante.cor_acento,
    cor_fundo: restaurante.cor_fundo,
    cor_superficie: restaurante.cor_superficie,
    cor_texto: restaurante.cor_texto,
    fonte_titulo: restaurante.fonte_titulo,
    fonte_texto: restaurante.fonte_texto,
    raio_borda: restaurante.raio_borda,
    tema: restaurante.tema,
  }
}

export interface PropsDoProvedorDeMarca {
  /** O restaurante ativo. null = master, login, ou nada carregado ainda. */
  restaurante?: Restaurante | null
  /**
   * Marca avulsa, para a prévia do admin em Configurações: quando vem, ela
   * manda, e o restaurante entra só como origem do logo.
   */
  marca?: Marca
  children: ReactNode
}

export function ProvedorDeMarca({
  restaurante = null,
  marca: marcaForcada,
  children,
}: PropsDoProvedorDeMarca): JSX.Element {
  const idDoRestaurante = restaurante?.id ?? null
  const base = useMemo(
    () => marcaForcada ?? marcaDoRestaurante(restaurante),
    [marcaForcada, restaurante],
  )

  const [temaEscolhido, setTemaEscolhido] = useState<TemaDaMarca | null>(() =>
    lerTemaGuardado(idDoRestaurante),
  )
  // Trocar de restaurante é trocar de contexto: a escolha local do anterior não
  // atravessa junto.
  const ultimoId = useRef(idDoRestaurante)
  if (ultimoId.current !== idDoRestaurante) {
    ultimoId.current = idDoRestaurante
    // setState durante a renderização: o React descarta este quadro e refaz.
    // É o caminho oficial para estado derivado de prop, e evita um quadro com o
    // tema errado na tela.
    setTemaEscolhido(lerTemaGuardado(idDoRestaurante))
  }

  const marca = useMemo<Marca>(
    () => (temaEscolhido && temaEscolhido !== base.tema ? { ...base, tema: temaEscolhido } : base),
    [base, temaEscolhido],
  )

  const [fontesProntas, setFontesProntas] = useState(false)

  // Antes da pintura: as variáveis já estão no <html>. Nenhum quadro sai com a
  // cor do restaurante anterior.
  useLayoutEffect(() => {
    aplicarMarca(marca)
  }, [marca])

  useEffect(() => {
    aplicarFavicon(marca.favicon_url)
  }, [marca.favicon_url])

  useEffect(() => {
    let vivo = true
    setFontesProntas(false)
    const pedidos = [carregarFonte(marca.fonte_titulo), carregarFonte(marca.fonte_texto)]
    void Promise.all(pedidos).then(() => {
      if (vivo) setFontesProntas(true)
    })
    return () => {
      vivo = false
    }
  }, [marca.fonte_titulo, marca.fonte_texto])

  const definirTema = useCallback(
    (tema: TemaDaMarca) => {
      setTemaEscolhido(tema)
      guardarTema(idDoRestaurante, tema)
    },
    [idDoRestaurante],
  )

  const limparTema = useCallback(() => {
    setTemaEscolhido(null)
    guardarTema(idDoRestaurante, null)
  }, [idDoRestaurante])

  const derivadas = useMemo(() => derivarMarca(marca), [marca])

  const valor = useMemo<ContextoDaMarca>(
    () => ({
      restaurante,
      marca,
      derivadas,
      graficos: derivadas.graficos,
      tema: marca.tema,
      definirTema,
      limparTema,
      fontesProntas,
      ehPlataforma: restaurante === null && marcaForcada === undefined,
    }),
    [restaurante, marca, derivadas, definirTema, limparTema, fontesProntas, marcaForcada],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** A marca em vigor. Lança fora do provedor, de propósito: é erro de montagem. */
export function useMarca(): ContextoDaMarca {
  const valor = useContext(Contexto)
  if (!valor) {
    throw new Error('useMarca precisa estar dentro de <ProvedorDeMarca>.')
  }
  return valor
}
