/**
 * Gestão de Restaurantes · logomarca
 * ---------------------------------------------------------------------------
 * Uma travessa com a tampa e o puxador: o gesto de servir, que é o fim de toda
 * a contagem que este sistema faz. Três traços e nada mais — em 24px lê como um
 * selo, em 96px as três peças se separam.
 *
 * A hierarquia é a mesma em qualquer tamanho: o prato é a base e vem mais
 * claro, a tampa é a forma que se reconhece e vem cheia, o puxador é sólido e
 * segura o olho no centro. É o que mantém o desenho legível quando ele encolhe
 * para o tamanho de um favicon.
 *
 * As cores vêm de `currentColor` e de var(--mv-*). Nenhum hexadecimal aqui —
 * quem fala em hexadecimal é `tema/marca.ts`, e o favicon, que é um arquivo
 * estático e não tem como ler variável de CSS.
 */

import type { CSSProperties, SVGProps } from 'react'
import { NOME_DO_SISTEMA, NOME_EM_LINHAS } from '@/tema/marca'

export type VarianteDaLogo = 'simbolo' | 'completa'
export type PinturaDaLogo = 'marca' | 'monocromatica'

export interface PropsDoSimbolo extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Lado do símbolo em pixels. Desenhado para funcionar de 24 a 96. */
  tamanho?: number
  /** 'marca' usa a cor da plataforma; 'monocromatica' usa só currentColor. */
  pintura?: PinturaDaLogo
  /** Some para o leitor de tela quando a logo vem acompanhada de texto. */
  decorativa?: boolean
  titulo?: string
}

export function SimboloDoSistema({
  tamanho = 32,
  pintura = 'marca',
  decorativa = false,
  titulo = NOME_DO_SISTEMA,
  ...resto
}: PropsDoSimbolo): JSX.Element {
  const marca = pintura === 'marca'
  // A cor da plataforma, e não a do restaurante ativo: este símbolo diz quem
  // faz o sistema. Quem diz de quem é o restaurante é a logo dele, na barra de
  // cima. Repintar os dois com a mesma tinta apaga a diferença.
  const tinta = marca ? 'var(--mv-plataforma)' : 'currentColor'

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
      {/* o prato: a base, e a peça mais larga do desenho */}
      <path
        d="M3.8 25h24.4"
        stroke={tinta}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={marca ? 0.55 : 0.45}
      />
      {/* a tampa */}
      <path
        d="M6 21.6a10 10 0 0 1 20 0"
        stroke={tinta}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={marca ? 1 : 0.8}
      />
      {/* o puxador: o ponto sólido que segura o centro */}
      <circle cx="16" cy="8.6" r="1.8" fill={tinta} />
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
      <SimboloDoSistema
        tamanho={tamanho}
        pintura={pintura}
        className={className}
        style={style}
      />
    )
  }

  const corpo = Math.round(tamanho * 0.38)

  return (
    <span
      className={['inline-flex items-center gap-2.5', className].filter(Boolean).join(' ')}
      style={style}
    >
      <SimboloDoSistema tamanho={tamanho} pintura={pintura} decorativa />
      <span className="inline-flex flex-col justify-center leading-none">
        <span
          className="font-titulo font-semibold"
          style={{
            fontSize: `${corpo}px`,
            lineHeight: 1.08,
            letterSpacing: '-0.015em',
            color: pintura === 'marca' ? 'var(--mv-texto)' : 'currentColor',
          }}
        >
          {NOME_EM_LINHAS.map((linha) => (
            <span key={linha} className="block">
              {linha}
            </span>
          ))}
        </span>
        {legenda ? (
          <span
            className="mv-rotulo mt-1"
            style={{ fontSize: `${Math.max(9, Math.round(corpo * 0.52))}px` }}
          >
            {legenda}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export default Logo
