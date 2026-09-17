/**
 * Multiverso · logomarca
 * ---------------------------------------------------------------------------
 * Duas órbitas cruzadas e um núcleo cheio: vários mundos — vários restaurantes
 * — girando num sistema só, com um deles em destaque na trajetória. O núcleo
 * cobre o cruzamento, então em 24px o desenho fecha em três formas legíveis;
 * em 96px as órbitas abrem e o satélite aparece.
 *
 * As cores vêm de `currentColor` e de var(--mv-*). Nenhum hexadecimal aqui.
 */

import type { CSSProperties, SVGProps } from 'react'

export type VarianteDaLogo = 'simbolo' | 'completa'
export type PinturaDaLogo = 'marca' | 'monocromatica'

export interface PropsDoSimbolo extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Lado do símbolo em pixels. Desenhado para funcionar de 24 a 96. */
  tamanho?: number
  /** 'marca' usa primária e acento; 'monocromatica' usa só currentColor. */
  pintura?: PinturaDaLogo
  /** Some para o leitor de tela quando a logo vem acompanhada de texto. */
  decorativa?: boolean
  titulo?: string
}

export function SimboloDoMultiverso({
  tamanho = 32,
  pintura = 'marca',
  decorativa = false,
  titulo = 'Multiverso',
  ...resto
}: PropsDoSimbolo): JSX.Element {
  const marca = pintura === 'marca'
  const orbita = marca ? 'var(--mv-primaria)' : 'currentColor'
  const nucleo = marca ? 'var(--mv-primaria)' : 'currentColor'
  const satelite = marca ? 'var(--mv-acento)' : 'currentColor'

  const acessibilidade = decorativa
    ? ({ 'aria-hidden': true, focusable: false } as const)
    : ({ role: 'img', 'aria-label': titulo } as const)

  return (
    <svg
      viewBox="0 0 32 32"
      width={tamanho}
      height={tamanho}
      fill="none"
      shapeRendering="geometricPrecision"
      {...acessibilidade}
      {...resto}
    >
      {/* as duas órbitas: mesma elipse, espelhada no eixo vertical */}
      <ellipse
        cx="16"
        cy="16"
        rx="13.2"
        ry="6.4"
        transform="rotate(-32 16 16)"
        stroke={orbita}
        strokeWidth="2.4"
        opacity={marca ? 0.55 : 0.45}
      />
      <ellipse
        cx="16"
        cy="16"
        rx="13.2"
        ry="6.4"
        transform="rotate(32 16 16)"
        stroke={orbita}
        strokeWidth="2.4"
        opacity={marca ? 0.9 : 0.8}
      />
      {/* o núcleo fecha o cruzamento — é o que segura o desenho em 24px */}
      <circle cx="16" cy="16" r="4.6" fill={nucleo} />
      {/* um mundo na trajetória */}
      <circle cx="27.19" cy="9" r="2.5" fill={satelite} />
    </svg>
  )
}

export interface PropsDaLogo {
  variante?: VarianteDaLogo
  /** Lado do símbolo em pixels; o texto acompanha. */
  tamanho?: number
  pintura?: PinturaDaLogo
  className?: string
  style?: CSSProperties
  /** Uma linha curta abaixo do nome — a unidade, o ambiente, o papel. */
  legenda?: string
}

/**
 * A logomarca completa. O nome quebra em "Multi" + "verso": a parte que muda
 * (o restaurante) fica na cor da marca; a parte que é sempre a mesma (a
 * plataforma) fica na cor do texto.
 */
export function Logo({
  variante = 'completa',
  tamanho = 32,
  pintura = 'marca',
  className,
  style,
  legenda,
}: PropsDaLogo): JSX.Element {
  if (variante === 'simbolo') {
    return (
      <SimboloDoMultiverso
        tamanho={tamanho}
        pintura={pintura}
        className={className}
        style={style}
      />
    )
  }

  const corpo = Math.round(tamanho * 0.58)

  return (
    <span
      className={['inline-flex items-center gap-2.5', className].filter(Boolean).join(' ')}
      style={style}
    >
      <SimboloDoMultiverso tamanho={tamanho} pintura={pintura} decorativa />
      <span className="inline-flex flex-col justify-center leading-none">
        <span
          className="font-titulo font-semibold"
          style={{ fontSize: `${corpo}px`, letterSpacing: '-0.02em' }}
        >
          <span style={{ color: 'var(--mv-texto)' }}>Multi</span>
          <span style={{ color: pintura === 'marca' ? 'var(--mv-primaria)' : 'currentColor' }}>
            verso
          </span>
        </span>
        {legenda ? (
          <span
            className="mv-rotulo mt-1"
            style={{ fontSize: `${Math.max(9, Math.round(corpo * 0.42))}px` }}
          >
            {legenda}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export default Logo
