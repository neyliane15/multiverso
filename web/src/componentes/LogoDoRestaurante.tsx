/**
 * Multiverso · logo do restaurante
 * ---------------------------------------------------------------------------
 * Mostra o logo que o admin subiu. Quando não existe — e no começo nunca
 * existe — desenha um monograma a partir do nome, com as cores daquele
 * restaurante. A tela nunca fica com um buraco no lugar da marca.
 *
 * As cores saem de var(--mv-*) quando o restaurante mostrado é o ativo, e da
 * marca passada por props quando são vários na mesma tela (o painel do master).
 */

import { useMemo, useState, type CSSProperties } from 'react'
import type { Marca } from '@/tipos/banco'
import { corLegivelSobre } from '@/tema/marca'

const CONECTORES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'o', 'a'])

/** 'Bar do Zé' -> 'BZ'; 'Cantina' -> 'CA'; '  ' -> '?'. */
export function iniciaisDe(nome: string): string {
  const palavras = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0)

  const uteis = palavras.filter((p) => !CONECTORES.has(p.toLowerCase()))
  const base = uteis.length > 0 ? uteis : palavras
  const primeira = base[0]
  if (primeira === undefined) return '?'

  const segunda = base[1]
  if (segunda !== undefined) return (primeira[0] ?? '').concat(segunda[0] ?? '').toUpperCase()
  return primeira.slice(0, 2).toUpperCase()
}

export interface PropsDoLogoDoRestaurante {
  nome: string
  logoUrl?: string | null
  logoEscuroUrl?: string | null
  /** Quando vem, as cores saem daqui — para listar vários restaurantes juntos. */
  marca?: Marca | null
  /** Lado em pixels. 24 na barra, 40 na lista, 96 na prévia. */
  tamanho?: number
  className?: string
  /** Só o desenho, sem texto alternativo — quando o nome já está ao lado. */
  decorativo?: boolean
}

export function LogoDoRestaurante({
  nome,
  logoUrl = null,
  logoEscuroUrl = null,
  marca = null,
  tamanho = 40,
  className,
  decorativo = false,
}: PropsDoLogoDoRestaurante): JSX.Element {
  const [falhou, setFalhou] = useState(false)

  const escolhido = useMemo(() => {
    const escuro = marca?.tema === 'escuro'
    if (escuro && logoEscuroUrl) return logoEscuroUrl
    return logoUrl ?? logoEscuroUrl
  }, [logoUrl, logoEscuroUrl, marca?.tema])

  const cores = useMemo(() => {
    if (!marca) {
      return {
        primaria: 'var(--mv-primaria)',
        secundaria: 'var(--mv-secundaria)',
        tinta: 'var(--mv-sobre-primaria)',
        raio: 'var(--mv-raio)',
      }
    }
    return {
      primaria: marca.cor_primaria,
      secundaria: marca.cor_secundaria,
      tinta: corLegivelSobre(marca.cor_primaria),
      raio: marca.raio_borda,
    }
  }, [marca])

  const rotulo = decorativo ? undefined : nome

  if (escolhido && !falhou) {
    return (
      <img
        src={escolhido}
        alt={rotulo ?? ''}
        aria-hidden={decorativo || undefined}
        width={tamanho}
        height={tamanho}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(true)}
        className={['object-contain', className].filter(Boolean).join(' ')}
        style={{ width: tamanho, height: tamanho, borderRadius: cores.raio }}
      />
    )
  }

  const iniciais = iniciaisDe(nome)
  const estilo: CSSProperties = {
    width: tamanho,
    height: tamanho,
    borderRadius: cores.raio,
    // A diagonal primária -> secundária dá a cada restaurante um monograma
    // diferente mesmo quando as iniciais coincidem.
    backgroundImage: `linear-gradient(135deg, ${cores.primaria} 0%, ${cores.secundaria} 140%)`,
    color: cores.tinta,
    fontSize: `${Math.max(10, Math.round(tamanho * 0.4))}px`,
    letterSpacing: tamanho >= 40 ? '0.02em' : '0',
  }

  return (
    <span
      className={[
        'inline-flex shrink-0 select-none items-center justify-center font-titulo font-semibold leading-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={estilo}
      role={decorativo ? undefined : 'img'}
      aria-label={rotulo}
      aria-hidden={decorativo || undefined}
      title={decorativo ? undefined : nome}
    >
      {iniciais}
    </span>
  )
}

export default LogoDoRestaurante
