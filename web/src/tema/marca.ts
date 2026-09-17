/**
 * Multiverso · camada de marca
 * ---------------------------------------------------------------------------
 * O app inteiro se repinta a partir do banco. Este arquivo é a única ponte
 * entre a linha de `restaurantes` e o CSS: ele calcula as derivadas que a UI
 * precisa e o banco não guarda (translúcidos, cor legível sobre a primária,
 * superfícies elevadas, paleta de gráficos) e escreve tudo em `--mv-*` no
 * `<html>`.
 *
 * Regra que vale para o sistema todo: componente nenhum escreve hexadecimal de
 * marca. Quem tem permissão de falar em hexadecimal é este arquivo.
 */

import type { Marca } from '@/tipos/banco'

/** Identidade do próprio Multiverso — espelha os DEFAULT de `restaurantes`. */
export const MARCA_PADRAO: Marca = {
  logo_url: null,
  logo_escuro_url: null,
  favicon_url: null,
  cor_primaria: '#E4572E',
  cor_secundaria: '#17255A',
  cor_acento: '#F5B700',
  cor_fundo: '#0E1116',
  cor_superficie: '#171B22',
  cor_texto: '#F2F4F8',
  fonte_titulo: 'Sora',
  fonte_texto: 'Inter',
  raio_borda: '14px',
  tema: 'escuro',
}

/** O preto e o branco do sistema. Só existem estes dois sobre cor de marca. */
export const TINTA_ESCURA = '#0B0D10' as const
export const TINTA_CLARA = '#FFFFFF' as const

/* ========================================================================== */
/* Conversões de cor                                                          */
/* ========================================================================== */

type Tripla = [number, number, number]

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** '#E4572E' | 'e4572e' | '#e57' -> '#e4572e'. Devolve null se não for cor. */
export function normalizarHex(valor: string): string | null {
  const bruto = valor.trim()
  if (!HEX.test(bruto)) return null
  const corpo = bruto.replace('#', '').toLowerCase()
  if (corpo.length === 3) {
    const [a, b, c] = [corpo[0], corpo[1], corpo[2]]
    if (a === undefined || b === undefined || c === undefined) return null
    return `#${a}${a}${b}${b}${c}${c}`
  }
  return `#${corpo}`
}

function canal(hex: string, inicio: number): number {
  return parseInt(hex.slice(inicio, inicio + 2), 16) / 255
}

/** sRGB (0..1) de um hexadecimal já normalizado. */
function paraSrgb(cor: string): Tripla {
  const hex = normalizarHex(cor) ?? '#000000'
  return [canal(hex, 1), canal(hex, 3), canal(hex, 5)]
}

const paraLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

const paraGama = (c: number): number => {
  const v = Math.max(0, Math.min(1, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

function linear(cor: string): Tripla {
  const [r, g, b] = paraSrgb(cor)
  return [paraLinear(r), paraLinear(g), paraLinear(b)]
}

function hexDeLinear([r, g, b]: Tripla): string {
  const oito = (c: number): string =>
    Math.round(Math.max(0, Math.min(1, paraGama(c))) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${oito(r)}${oito(g)}${oito(b)}`
}

function oklabDeLinear([r, g, b]: Tripla): Tripla {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function linearDeOklab([L, a, b]: Tripla): Tripla {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** Luminosidade, croma e matiz (OKLCH) de uma cor. */
export function oklch(cor: string): { L: number; C: number; H: number } {
  const [L, a, b] = oklabDeLinear(linear(cor))
  return {
    L,
    C: Math.hypot(a, b),
    H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  }
}

const dentroDoGamut = ([r, g, b]: Tripla): boolean =>
  r >= -1e-4 && r <= 1 + 1e-4 && g >= -1e-4 && g <= 1 + 1e-4 && b >= -1e-4 && b <= 1 + 1e-4

/**
 * OKLCH -> hexadecimal, reduzindo o croma até caber no sRGB.
 * Devolve também o croma que sobrou: é ele que diz se a cor ainda tem
 * identidade ou se virou cinza.
 */
export function deOklch(L: number, C: number, H: number): { hex: string; croma: number } {
  const rad = (H * Math.PI) / 180
  const monta = (c: number): Tripla => linearDeOklab([L, c * Math.cos(rad), c * Math.sin(rad)])
  let croma = C
  if (!dentroDoGamut(monta(C))) {
    let baixo = 0
    let alto = C
    for (let i = 0; i < 20; i += 1) {
      const meio = (baixo + alto) / 2
      if (dentroDoGamut(monta(meio))) baixo = meio
      else alto = meio
    }
    croma = baixo
  }
  return { hex: hexDeLinear(monta(croma)), croma }
}

/* ========================================================================== */
/* Contraste                                                                  */
/* ========================================================================== */

function luminancia(cor: string): number {
  const [r, g, b] = linear(cor)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Razão de contraste da WCAG 2.x, por luminância relativa. 1 = idênticas,
 * 21 = preto contra branco. AA pede 4,5 para texto corrido e 3 para texto
 * grande, ícone e borda de controle.
 */
export function contraste(corA: string, corB: string): number {
  const a = luminancia(corA)
  const b = luminancia(corB)
  const maior = Math.max(a, b)
  const menor = Math.min(a, b)
  return (maior + 0.05) / (menor + 0.05)
}

/** Preto ou branco sobre a cor dada — o que contrastar mais. */
export function corLegivelSobre(cor: string): typeof TINTA_ESCURA | typeof TINTA_CLARA {
  return contraste(TINTA_ESCURA, cor) >= contraste(TINTA_CLARA, cor)
    ? TINTA_ESCURA
    : TINTA_CLARA
}

/**
 * Sobe ou desce a luminosidade da cor até ela alcançar o contraste pedido
 * contra o fundo. Usada para o texto de marca (link, valor em destaque):
 * a matiz do restaurante é preservada, a legibilidade não é negociada.
 * Devolve a cor original quando nenhuma luminosidade alcança o alvo.
 */
export function ajustarParaContraste(cor: string, fundo: string, alvo = 4.5): string {
  if (contraste(cor, fundo) >= alvo) return cor
  const { L: origem, C, H } = oklch(cor)
  // Fundo escuro pede uma cor mais clara; fundo claro pede uma mais escura.
  const sentido = luminancia(fundo) < 0.18 ? 1 : -1
  for (let passo = 0.005; passo <= 1; passo += 0.005) {
    const L = origem + sentido * passo
    if (L < 0 || L > 1) break
    const { hex } = deOklch(L, C, H)
    if (contraste(hex, fundo) >= alvo) return hex
  }
  // Nem o extremo do sentido natural resolve: tenta o outro lado antes de desistir.
  for (let passo = 0.005; passo <= 1; passo += 0.005) {
    const L = origem - sentido * passo
    if (L < 0 || L > 1) break
    const { hex } = deOklch(L, C, H)
    if (contraste(hex, fundo) >= alvo) return hex
  }
  return cor
}

/* ========================================================================== */
/* Paleta de gráficos                                                         */
/* ========================================================================== */

/**
 * Oito âncoras de matiz, com luminosidade e croma presos à matiz (não ao slot).
 * A ordem é cíclica e é ela que garante a separação: slots vizinhos alternam
 * claro/escuro, porque é a diferença de luminosidade que sobrevive à simulação
 * de protanopia e deuteranopia.
 *
 * O conjunto foi escolhido por busca e conferido com o validador da skill
 * `dataviz` (bandas de L, piso de croma, ΔE de CVD entre pares vizinhos, piso
 * de visão normal e contraste contra a superfície), nos dois temas.
 */
interface Ancora {
  readonly H: number
  readonly Lc: number
  readonly Cc: number
  readonly Le: number
  readonly Ce: number
}

const ANCORAS: readonly Ancora[] = [
  { H: 119.6, Lc: 0.623, Cc: 0.179, Le: 0.641, Ce: 0.131 }, // verde-limão
  { H: 157.0, Lc: 0.497, Cc: 0.164, Le: 0.495, Ce: 0.151 }, // verde fundo
  { H: 215.8, Lc: 0.63, Cc: 0.166, Le: 0.64, Ce: 0.129 }, // ciano
  { H: 260.9, Lc: 0.477, Cc: 0.169, Le: 0.522, Ce: 0.143 }, // azul
  { H: 301.3, Lc: 0.623, Cc: 0.179, Le: 0.65, Ce: 0.131 }, // lilás
  { H: 342.9, Lc: 0.522, Cc: 0.175, Le: 0.523, Ce: 0.126 }, // vinho
  { H: 31.6, Lc: 0.654, Cc: 0.179, Le: 0.646, Ce: 0.123 }, // laranja
  { H: 69.1, Lc: 0.517, Cc: 0.135, Le: 0.512, Ce: 0.152 }, // âmbar fundo
]

const BANDA_L = { claro: [0.44, 0.76], escuro: [0.485, 0.665] } as const
const SUPERFICIE_GRAFICO = { claro: '#F7F8FA', escuro: '#171B22' } as const
const PISO_CROMA = 0.105
const ALVO_CVD = 8.5
const ALVO_NORMAL = 15.5

// Machado, Oliveira & Fernandes (2009), severidade 1,0, em RGB linear.
const CVD: Record<'protan' | 'deutan', readonly Tripla[]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
}

function simular(cor: string, tipo: 'protan' | 'deutan'): Tripla {
  const [r, g, b] = linear(cor)
  const m = CVD[tipo]
  const linha = (i: number): number => {
    const f = m[i]
    if (!f) return 0
    return Math.max(0, Math.min(1, f[0] * r + f[1] * g + f[2] * b))
  }
  return [linha(0), linha(1), linha(2)]
}

/** Distância euclidiana em OKLab x100. Sem `tipo`, é visão normal. */
function deltaE(a: string, b: string, tipo?: 'protan' | 'deutan'): number {
  const x = oklabDeLinear(tipo ? simular(a, tipo) : linear(a))
  const y = oklabDeLinear(tipo ? simular(b, tipo) : linear(b))
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** Quão bem duas cores se separam: 1 significa "no alvo" nos dois testes. */
function separacao(a: string, b: string): number {
  const cvd = Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'))
  return Math.min(cvd / ALVO_CVD, deltaE(a, b) / ALVO_NORMAL)
}

function ancoraEm(i: number): Ancora {
  const a = ANCORAS[((i % ANCORAS.length) + ANCORAS.length) % ANCORAS.length]
  // ANCORAS é uma constante de oito posições: o índice normalizado sempre existe.
  if (!a) throw new Error('âncora inexistente')
  return a
}

const cache = new Map<string, readonly string[]>()

/**
 * Oito cores de série derivadas da marca, distinguíveis entre si e legíveis nos
 * dois temas.
 *
 * O slot 1 é a marca: a matiz é a do restaurante, e a luminosidade desliza
 * dentro da banda do tema até se separar do vizinho. Os outros sete são as
 * âncoras fixas, em ordem cíclica — a âncora que ficaria colada na marca sai da
 * lista, e o sentido do ciclo é escolhido pelo que mais separa.
 *
 * A ordem é fixa e nunca é reciclada: a nona série vira "Outros", nunca uma
 * nona cor. Cor segue a entidade, não a posição no ranking.
 */
export function paletaDeGraficos(marca: Marca): string[] {
  const chave = `${marca.cor_primaria.toLowerCase()}|${marca.tema}`
  const pronta = cache.get(chave)
  if (pronta) return [...pronta]

  const claro = marca.tema === 'claro'
  const banda = claro ? BANDA_L.claro : BANDA_L.escuro
  const superficie = claro ? SUPERFICIE_GRAFICO.claro : SUPERFICIE_GRAFICO.escuro
  const hexes = ANCORAS.map((a) => deOklch(claro ? a.Lc : a.Le, claro ? a.Cc : a.Ce, a.H).hex)

  const { H: matiz } = oklch(marca.cor_primaria)

  // âncora que a marca substitui: a mais perto em matiz (ficaria quase igual).
  let removida = 0
  let menor = Infinity
  for (let i = 0; i < ANCORAS.length; i += 1) {
    const d = Math.abs((((matiz - ancoraEm(i).H + 540) % 360) - 180))
    if (d < menor) {
      menor = d
      removida = i
    }
  }

  const frente: number[] = []
  const tras: number[] = []
  for (let i = 1; i < ANCORAS.length; i += 1) {
    frente.push((removida + i) % ANCORAS.length)
    tras.push((removida + ANCORAS.length - i) % ANCORAS.length)
  }

  const hexEm = (i: number): string => hexes[i] ?? '#000000'

  // Percorrer o ciclo a partir de outro ponto cria um par novo entre âncoras
  // (o que "pula" a removida). Só vale quando esse par também passa nos pisos.
  const ordens: number[][] = [frente, tras]
  if (separacao(hexEm((removida + 7) % 8), hexEm((removida + 1) % 8)) >= 1) {
    for (let j = 2; j < 7; j += 1) {
      ordens.push(frente.slice(j).concat(frente.slice(0, j)))
      ordens.push(tras.slice(j).concat(tras.slice(0, j)))
    }
  }

  let melhorNota = -Infinity
  let melhorCor = marca.cor_primaria
  let melhorOrdem = frente
  const [pisoL, tetoL] = banda
  for (const ordem of ordens) {
    const vizinho = hexEm(ordem[0] ?? 0)
    for (let L = pisoL; L <= tetoL + 1e-9; L += 0.005) {
      for (let C = 0.105; C <= 0.2; C += 0.01) {
        const cor = deOklch(L, C, matiz)
        if (cor.croma < PISO_CROMA) continue
        const nota =
          Math.min(separacao(cor.hex, vizinho), contraste(cor.hex, superficie) / 2.9, 1) * 1000 +
          Math.min(cor.croma, 0.17) * 100 -
          Math.abs(L - 0.57)
        if (nota > melhorNota) {
          melhorNota = nota
          melhorCor = cor.hex
          melhorOrdem = ordem
        }
      }
    }
  }

  const paleta = [melhorCor, ...melhorOrdem.map((i) => hexEm(i))]
  cache.set(chave, paleta)
  return [...paleta]
}

/* ========================================================================== */
/* Derivadas e aplicação                                                      */
/* ========================================================================== */

function translucida(cor: string, alfa: number): string {
  const [r, g, b] = paraSrgb(cor)
  const oito = (c: number): number => Math.round(c * 255)
  return `rgb(${oito(r)} ${oito(g)} ${oito(b)} / ${alfa})`
}

/** Mistura duas cores em OKLab — mais honesta que misturar em sRGB. */
function misturar(a: string, b: string, peso: number): string {
  const x = oklabDeLinear(linear(a))
  const y = oklabDeLinear(linear(b))
  const m: Tripla = [
    x[0] + (y[0] - x[0]) * peso,
    x[1] + (y[1] - x[1]) * peso,
    x[2] + (y[2] - x[2]) * peso,
  ]
  return hexDeLinear(linearDeOklab(m))
}

function numeroDoRaio(raio: string): number {
  const n = Number.parseFloat(raio)
  return Number.isFinite(n) ? n : 14
}

/** Tudo que a UI usa e o banco não guarda. */
export interface DerivadasDaMarca {
  sobrePrimaria: string
  sobreSecundaria: string
  sobreAcento: string
  /** A primária empurrada até 4,5:1 contra a superfície: serve para texto. */
  primariaLegivel: string
  primaria06: string
  primaria10: string
  primaria16: string
  primaria24: string
  primaria40: string
  primaria64: string
  /** Superfícies elevadas, cada degrau com um pouco mais da marca dentro. */
  superficie1: string
  superficie2: string
  superficie3: string
  borda: string
  bordaForte: string
  textoSuave: string
  textoFraco: string
  /** Cor do anel de foco: a de maior contraste contra o fundo do tema. */
  foco: string
  raioP: string
  raioG: string
  graficos: string[]
}

export function derivarMarca(marca: Marca): DerivadasDaMarca {
  const claro = marca.tema === 'claro'
  const extremo = claro ? TINTA_ESCURA : TINTA_CLARA
  const raio = numeroDoRaio(marca.raio_borda)

  // Superfície elevada: um passo para longe do lado em que a própria superfície
  // já está (clara sobe para escuro, escura sobe para claro), com um fio da
  // primária dentro. É o "tingimento": mesmo o cinza do app é do restaurante,
  // sem que nenhum componente precise saber a cor dele.
  const rumo = oklch(marca.cor_superficie).L > 0.5 ? TINTA_ESCURA : TINTA_CLARA
  const degrau = (passo: number): string => {
    const base = misturar(marca.cor_superficie, rumo, passo * 0.038)
    return misturar(base, marca.cor_primaria, passo * 0.015)
  }

  // O anel de foco é do acento — é para isso que o acento existe. Só troca
  // quando o acento não aparece contra o fundo daquele restaurante.
  const candidatosFoco: string[] = [marca.cor_acento, marca.cor_primaria, extremo]
  let foco: string = extremo
  for (const c of candidatosFoco) {
    if (contraste(c, marca.cor_fundo) >= 4.5) {
      foco = c
      break
    }
  }

  return {
    sobrePrimaria: corLegivelSobre(marca.cor_primaria),
    sobreSecundaria: corLegivelSobre(marca.cor_secundaria),
    sobreAcento: corLegivelSobre(marca.cor_acento),
    primariaLegivel: ajustarParaContraste(marca.cor_primaria, marca.cor_superficie, 4.5),
    primaria06: translucida(marca.cor_primaria, 0.06),
    primaria10: translucida(marca.cor_primaria, 0.1),
    primaria16: translucida(marca.cor_primaria, 0.16),
    primaria24: translucida(marca.cor_primaria, 0.24),
    primaria40: translucida(marca.cor_primaria, 0.4),
    primaria64: translucida(marca.cor_primaria, 0.64),
    superficie1: degrau(1),
    superficie2: degrau(2),
    superficie3: degrau(3),
    borda: misturar(marca.cor_superficie, marca.cor_texto, claro ? 0.16 : 0.12),
    bordaForte: misturar(marca.cor_superficie, marca.cor_texto, claro ? 0.34 : 0.26),
    textoSuave: misturar(marca.cor_texto, marca.cor_fundo, 0.26),
    textoFraco: misturar(marca.cor_texto, marca.cor_fundo, 0.42),
    foco,
    raioP: `${Math.max(4, Math.round(raio * 0.55))}px`,
    raioG: `${Math.round(raio * 1.45)}px`,
    graficos: paletaDeGraficos(marca),
  }
}

/**
 * O mapa completo de `--mv-*` para uma marca. `aplicarMarca` escreve isto no
 * `<html>`; a prévia do admin escreve o mesmo mapa no `style` de um cartão, e
 * por isso a prévia mostra exatamente o que o app vai virar depois de salvar.
 */
export function variaveisDaMarca(marca: Marca): Record<string, string> {
  const d = derivarMarca(marca)
  const vars: Record<string, string> = {
    '--mv-primaria': marca.cor_primaria,
    '--mv-secundaria': marca.cor_secundaria,
    '--mv-acento': marca.cor_acento,
    '--mv-fundo': marca.cor_fundo,
    '--mv-superficie': marca.cor_superficie,
    '--mv-texto': marca.cor_texto,
    '--mv-fonte-titulo': `'${marca.fonte_titulo}'`,
    '--mv-fonte-texto': `'${marca.fonte_texto}'`,
    '--mv-raio': marca.raio_borda,
    '--mv-raio-p': d.raioP,
    '--mv-raio-g': d.raioG,
    '--mv-sobre-primaria': d.sobrePrimaria,
    '--mv-sobre-secundaria': d.sobreSecundaria,
    '--mv-sobre-acento': d.sobreAcento,
    '--mv-primaria-legivel': d.primariaLegivel,
    '--mv-primaria-06': d.primaria06,
    '--mv-primaria-10': d.primaria10,
    '--mv-primaria-16': d.primaria16,
    '--mv-primaria-24': d.primaria24,
    '--mv-primaria-40': d.primaria40,
    '--mv-primaria-64': d.primaria64,
    '--mv-superficie-1': d.superficie1,
    '--mv-superficie-2': d.superficie2,
    '--mv-superficie-3': d.superficie3,
    '--mv-borda': d.borda,
    '--mv-borda-forte': d.bordaForte,
    '--mv-texto-suave': d.textoSuave,
    '--mv-texto-fraco': d.textoFraco,
    '--mv-foco': d.foco,
  }
  d.graficos.forEach((cor, i) => {
    vars[`--mv-grafico-${i + 1}`] = cor
  })
  return vars
}

/**
 * Escreve a marca no `<html>`. É idempotente e barata: trocar de restaurante é
 * reescrever variáveis, não remontar a árvore — por isso a tela não pisca.
 */
export function aplicarMarca(marca: Marca, raiz?: HTMLElement): void {
  const alvo = raiz ?? (typeof document === 'undefined' ? undefined : document.documentElement)
  if (!alvo) return

  for (const [nome, valor] of Object.entries(variaveisDaMarca(marca))) {
    alvo.style.setProperty(nome, valor)
  }
  alvo.setAttribute('data-tema', marca.tema)
  alvo.style.colorScheme = marca.tema === 'claro' ? 'light' : 'dark'
}

/* ========================================================================== */
/* Validação                                                                  */
/* ========================================================================== */

export interface ResultadoDaValidacao {
  ok: boolean
  avisos: string[]
}

const AA_TEXTO = 4.5
const AA_GRAFICO = 3

function razao(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Confere a combinação escolhida pelo admin contra os mínimos da WCAG AA.
 * Não impede salvar: o admin decide. Mas ele vê o que está comprando.
 */
export function validarMarca(marca: Marca): ResultadoDaValidacao {
  const avisos: string[] = []

  const campos: Array<[keyof Marca, string]> = [
    ['cor_primaria', 'primária'],
    ['cor_secundaria', 'secundária'],
    ['cor_acento', 'de acento'],
    ['cor_fundo', 'de fundo'],
    ['cor_superficie', 'de superfície'],
    ['cor_texto', 'de texto'],
  ]
  for (const [campo, rotulo] of campos) {
    const valor = marca[campo]
    if (typeof valor !== 'string' || normalizarHex(valor) === null) {
      avisos.push(`A cor ${rotulo} não é um hexadecimal válido (esperado #RRGGBB).`)
    }
  }
  if (avisos.length > 0) return { ok: false, avisos }

  const textoSuperficie = contraste(marca.cor_texto, marca.cor_superficie)
  if (textoSuperficie < AA_TEXTO) {
    avisos.push(
      `Texto sobre a superfície: ${razao(textoSuperficie)}:1. ` +
        `AA pede ${razao(AA_TEXTO)}:1 — o texto do sistema vai ficar difícil de ler.`,
    )
  }

  const textoFundo = contraste(marca.cor_texto, marca.cor_fundo)
  if (textoFundo < AA_TEXTO) {
    avisos.push(
      `Texto sobre o fundo: ${razao(textoFundo)}:1. AA pede ${razao(AA_TEXTO)}:1.`,
    )
  }

  const sobrePrimaria = contraste(corLegivelSobre(marca.cor_primaria), marca.cor_primaria)
  if (sobrePrimaria < AA_TEXTO) {
    avisos.push(
      `Nenhuma tinta chega a AA sobre a primária (melhor caso: ${razao(sobrePrimaria)}:1). ` +
        'O texto do botão principal vai ficar fraco — escureça ou clareie a primária.',
    )
  }

  const primariaNoFundo = contraste(marca.cor_primaria, marca.cor_superficie)
  if (primariaNoFundo < AA_GRAFICO) {
    avisos.push(
      `Primária sobre a superfície: ${razao(primariaNoFundo)}:1. ` +
        `Abaixo de ${razao(AA_GRAFICO)}:1 ela some em gráfico, ícone e borda de campo.`,
    )
  }

  const acentoNoFundo = contraste(marca.cor_acento, marca.cor_superficie)
  if (acentoNoFundo < AA_GRAFICO) {
    avisos.push(
      `Acento sobre a superfície: ${razao(acentoNoFundo)}:1. ` +
        'O anel de foco usa o acento; abaixo de 3:1 ele deixa de ser visível.',
    )
  }

  const fundoSuperficie = contraste(marca.cor_fundo, marca.cor_superficie)
  if (fundoSuperficie < 1.08) {
    avisos.push(
      'Fundo e superfície estão quase iguais: os cartões vão sumir dentro da página.',
    )
  }

  const primariaAcento = deltaE(marca.cor_primaria, marca.cor_acento)
  if (primariaAcento < 12) {
    avisos.push(
      'Primária e acento são quase a mesma cor — o sistema perde o segundo sinal ' +
        '(o que separa "ação principal" de "atenção aqui").',
    )
  }

  const claro = marca.tema === 'claro'
  const fundoClaro = luminancia(marca.cor_fundo) > 0.35
  if (claro !== fundoClaro) {
    avisos.push(
      `O tema está marcado como ${marca.tema}, mas a cor de fundo é ` +
        `${fundoClaro ? 'clara' : 'escura'}. Os estados (sucesso, alerta, erro) seguem o ` +
        'tema, e vão ficar fora de lugar.',
    )
  }

  return { ok: avisos.length === 0, avisos }
}
