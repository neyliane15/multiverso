/**
 * Multiverso · logomarca
 * ---------------------------------------------------------------------------
 * Três quadrados arredondados encaixados, cada um girado um pouco mais que o
 * anterior: mundos dentro de mundos, que é literalmente o nome. Os restaurantes
 * são camadas do mesmo sistema, e o quadrado cheio no meio é aquele em que você
 * está agora.
 *
 * A rotação fora de fase é o que separa o desenho de um alvo concêntrico — ela
 * dá movimento sem animação. Em 24px lê como um selo sólido; em 96px as três
 * camadas se abrem.
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
  // A cor da plataforma, e não a do restaurante ativo: este símbolo diz quem
  // faz o sistema. Quem diz de quem é o restaurante é a logo dele, na barra de
  // cima. Repintar os dois com a mesma tinta apaga a diferença.
  const camada = marca ? 'var(--mv-plataforma)' : 'currentColor'
  const nucleo = marca ? 'var(--mv-plataforma)' : 'currentColor'

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
      {/* camada de fora: a rede */}
      <rect
        x="2.6"
        y="2.6"
        width="26.8"
        height="26.8"
        rx="9.2"
        transform="rotate(-15 16 16)"
        stroke={camada}
        strokeWidth="2.3"
        opacity={marca ? 0.42 : 0.38}
      />
      {/* camada do meio: o restaurante */}
      <rect
        x="8.8"
        y="8.8"
        width="14.4"
        height="14.4"
        rx="4.8"
        stroke={camada}
        strokeWidth="2.3"
        opacity={marca ? 0.85 : 0.75}
      />
      {/* o núcleo: onde você está */}
      <rect
        x="12.7"
        y="12.7"
        width="6.6"
        height="6.6"
        rx="2.2"
        transform="rotate(15 16 16)"
        fill={nucleo}
      />
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
 * A logomarca completa. O símbolo carrega a cor e o nome carrega a leitura —
 * pintar os dois divide a atenção e nenhum dos dois ganha.
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
          style={{
            fontSize: `${corpo}px`,
            letterSpacing: '-0.015em',
            color: pintura === 'marca' ? 'var(--mv-texto)' : 'currentColor',
          }}
        >
          Multiverso
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
