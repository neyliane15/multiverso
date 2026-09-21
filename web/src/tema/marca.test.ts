import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Marca } from '@/tipos/banco'
import {
  MARCA_PADRAO,
  TINTA_CLARA,
  TINTA_ESCURA,
  ajustarParaContraste,
  contraste,
  corLegivelSobre,
  derivarMarca,
  normalizarHex,
  oklch,
  paletaDeGraficos,
  validarMarca,
  variaveisDaMarca,
} from './marca'

/* -------------------------------------------------------------------------- */
/* Apoio                                                                       */
/* -------------------------------------------------------------------------- */

function marcaCom(mudancas: Partial<Marca>): Marca {
  return { ...MARCA_PADRAO, ...mudancas }
}

const paraLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

function oklab(cor: string): [number, number, number] {
  const hex = cor.replace('#', '')
  const canal = (i: number): number => paraLinear(parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = [canal(0), canal(2), canal(4)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Distância perceptiva entre duas cores (OKLab x100), como na skill dataviz. */
function deltaE(a: string, b: string): number {
  const x = oklab(a)
  const y = oklab(b)
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/* -------------------------------------------------------------------------- */
/* contraste                                                                   */
/* -------------------------------------------------------------------------- */

describe('contraste', () => {
  it('vai de 1 (idênticas) a 21 (preto contra branco)', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contraste('#E4572E', '#E4572E')).toBeCloseTo(1, 10)
  })

  it('não depende da ordem dos argumentos', () => {
    expect(contraste('#17255A', '#F2F4F8')).toBeCloseTo(contraste('#F2F4F8', '#17255A'), 10)
  })

  it('reproduz o cinza limítrofe da WCAG: #767676 no branco passa AA por pouco', () => {
    // #767676 é o cinza mais claro que ainda alcança 4,5:1 sobre branco.
    expect(contraste('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contraste('#777777', '#FFFFFF')).toBeLessThan(4.5)
  })

  it('usa luminância relativa, não distância de canal: azul e amarelo não são simétricos', () => {
    // Mesmo "afastamento" de RGB, contrastes muito diferentes contra branco.
    expect(contraste('#FFFF00', '#FFFFFF')).toBeLessThan(1.1)
    expect(contraste('#0000FF', '#FFFFFF')).toBeGreaterThan(8)
  })

  it('aceita forma curta e sem cerquilha', () => {
    expect(contraste('#fff', 'FFFFFF')).toBeCloseTo(1, 10)
    expect(normalizarHex('#e57')).toBe('#ee5577')
    expect(normalizarHex('nao é cor')).toBeNull()
  })

  it('o texto padrão do Multiverso passa AA sobre o fundo e sobre a superfície', () => {
    expect(contraste(MARCA_PADRAO.cor_texto, MARCA_PADRAO.cor_fundo)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(MARCA_PADRAO.cor_texto, MARCA_PADRAO.cor_superficie)).toBeGreaterThanOrEqual(4.5)
  })
})

/* -------------------------------------------------------------------------- */
/* corLegivelSobre                                                             */
/* -------------------------------------------------------------------------- */

describe('corLegivelSobre', () => {
  it('branco sobre amarelo reprova — então escolhe a tinta escura', () => {
    const amarelo = '#F5B700' // o acento padrão do Multiverso
    expect(contraste(TINTA_CLARA, amarelo)).toBeLessThan(4.5)
    expect(corLegivelSobre(amarelo)).toBe(TINTA_ESCURA)
    expect(contraste(corLegivelSobre(amarelo), amarelo)).toBeGreaterThanOrEqual(4.5)
  })

  it('sobre azul-marinho escolhe branco', () => {
    expect(corLegivelSobre('#17255A')).toBe(TINTA_CLARA)
  })

  it('sobre o laranja padrão escolhe a tinta escura, que contrasta mais', () => {
    expect(corLegivelSobre('#E4572E')).toBe(TINTA_ESCURA)
    expect(contraste(TINTA_ESCURA, '#E4572E')).toBeGreaterThan(contraste(TINTA_CLARA, '#E4572E'))
  })

  it('devolve sempre a melhor das duas tintas, para qualquer cor', () => {
    const amostra = ['#000000', '#FFFFFF', '#808080', '#E11D48', '#1BAF7A', '#7C3AED', '#00FFFF']
    for (const cor of amostra) {
      const escolhida = corLegivelSobre(cor)
      const outra = escolhida === TINTA_ESCURA ? TINTA_CLARA : TINTA_ESCURA
      expect(contraste(escolhida, cor)).toBeGreaterThanOrEqual(contraste(outra, cor))
    }
  })

  it('só devolve as duas tintas do sistema, nunca uma terceira cor', () => {
    expect([TINTA_ESCURA, TINTA_CLARA]).toContain(corLegivelSobre('#123456'))
  })
})

describe('ajustarParaContraste', () => {
  it('preserva a matiz e sobe a luminosidade até alcançar AA', () => {
    // Um laranja de marca sobre superfície clara: não chega a 4,5:1 sozinho.
    // Literal de propósito — amarrar isto à primária padrão fez o teste parar
    // de testar no dia em que ela virou um verde que já passa com folga.
    const fundo = '#F7F8FA'
    const original = '#E4572E'
    expect(contraste(original, fundo)).toBeLessThan(4.5)

    const ajustada = ajustarParaContraste(original, fundo, 4.5)
    expect(contraste(ajustada, fundo)).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(oklch(ajustada).H - oklch(original).H)).toBeLessThan(2)
  })

  it('devolve a cor intacta quando ela já passa', () => {
    expect(ajustarParaContraste('#FFFFFF', '#000000', 4.5)).toBe('#FFFFFF')
  })
})

/* -------------------------------------------------------------------------- */
/* paletaDeGraficos                                                            */
/* -------------------------------------------------------------------------- */

/** Um tema escuro completo. Não se monta escuro trocando só o campo `tema`:
 *  fundo, superfície e texto têm de virar junto, senão o fixture diz "escuro" e
 *  é claro por dentro — que foi exatamente o que aconteceu quando a marca
 *  padrão do Multiverso passou de escura para clara. */
const ESCURO: Partial<Marca> = {
  tema: 'escuro',
  cor_fundo: '#0E1116',
  cor_superficie: '#171B22',
  cor_texto: '#F2F4F8',
}

const MARCAS_DE_TESTE: Array<[string, Marca]> = [
  ['verde padrão (claro)', MARCA_PADRAO],
  ['verde padrão (escuro)', marcaCom(ESCURO)],
  ['laranja (escuro)', marcaCom({ ...ESCURO, cor_primaria: '#E4572E' })],
  ['azul-marinho', marcaCom({ ...ESCURO, cor_primaria: '#17255A' })],
  ['verde-claro', marcaCom({ cor_primaria: '#1BAF7A' })],
  ['roxo', marcaCom({ cor_primaria: '#7C3AED' })],
  ['rosa-choque', marcaCom({ cor_primaria: '#FF00AA' })],
  ['vermelho', marcaCom({ ...ESCURO, cor_primaria: '#E11D48' })],
]

describe('paletaDeGraficos', () => {
  it('devolve exatamente oito cores', () => {
    expect(paletaDeGraficos(MARCA_PADRAO)).toHaveLength(8)
  })

  it.each(MARCAS_DE_TESTE)('%s: não repete cor', (_nome, marca) => {
    const paleta = paletaDeGraficos(marca)
    expect(new Set(paleta.map((c) => c.toLowerCase())).size).toBe(8)
  })

  it.each(MARCAS_DE_TESTE)('%s: cores vizinhas se separam (ΔE OKLab ≥ 15)', (_nome, marca) => {
    const paleta = paletaDeGraficos(marca)
    for (let i = 0; i < paleta.length - 1; i += 1) {
      const a = paleta[i]
      const b = paleta[i + 1]
      if (a === undefined || b === undefined) throw new Error('paleta incompleta')
      expect(deltaE(a, b), `slots ${i + 1} e ${i + 2}: ${a} e ${b}`).toBeGreaterThanOrEqual(15)
    }
  })

  it.each(MARCAS_DE_TESTE)('%s: toda cor se destaca da superfície do tema', (_nome, marca) => {
    const superficie = marca.tema === 'claro' ? '#F7F8FA' : '#171B22'
    for (const cor of paletaDeGraficos(marca)) {
      // 2,9:1 é o piso com alívio obrigatório (rótulo direto ou tabela);
      // abaixo disso a série sumiria do gráfico.
      expect(contraste(cor, superficie), cor).toBeGreaterThanOrEqual(2.85)
    }
  })

  it.each(MARCAS_DE_TESTE)('%s: nenhuma cor vira cinza (croma OKLCH ≥ 0,10)', (_nome, marca) => {
    for (const cor of paletaDeGraficos(marca)) {
      expect(oklch(cor).C, cor).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('o primeiro slot carrega a matiz da marca', () => {
    for (const [, marca] of MARCAS_DE_TESTE) {
      const primeira = paletaDeGraficos(marca)[0]
      if (primeira === undefined) throw new Error('paleta vazia')
      const dif = Math.abs(((oklch(primeira).H - oklch(marca.cor_primaria).H + 540) % 360) - 180)
      expect(dif, `${marca.cor_primaria} -> ${primeira}`).toBeLessThan(3)
    }
  })

  it('marcas diferentes rendem paletas diferentes', () => {
    const a = paletaDeGraficos(marcaCom({ cor_primaria: '#17255A' })).join()
    const b = paletaDeGraficos(marcaCom({ cor_primaria: '#E4572E' })).join()
    expect(a).not.toBe(b)
  })

  it('é determinística e devolve uma cópia — quem recebe não corrompe o cache', () => {
    const primeira = paletaDeGraficos(MARCA_PADRAO)
    primeira[0] = '#000000'
    expect(paletaDeGraficos(MARCA_PADRAO)).toEqual(paletaDeGraficos(MARCA_PADRAO))
    expect(paletaDeGraficos(MARCA_PADRAO)[0]).not.toBe('#000000')
  })

  it('a ordem é fixa: o mesmo restaurante pinta a série 3 sempre da mesma cor', () => {
    const uma = paletaDeGraficos(marcaCom({ cor_primaria: '#1BAF7A' }))
    const outra = paletaDeGraficos(marcaCom({ cor_primaria: '#1BAF7A' }))
    expect(uma[2]).toBe(outra[2])
  })
})

/* -------------------------------------------------------------------------- */
/* validarMarca                                                                */
/* -------------------------------------------------------------------------- */

describe('validarMarca', () => {
  it('a marca padrão do Multiverso passa sem aviso', () => {
    const r = validarMarca(MARCA_PADRAO)
    expect(r.avisos).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('reprova texto cinza-claro sobre superfície clara', () => {
    const r = validarMarca(
      marcaCom({
        tema: 'claro',
        cor_fundo: '#FFFFFF',
        cor_superficie: '#F4F7FB',
        cor_texto: '#BDC3CA',
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/Texto sobre a superfície/)
  })

  it('avisa quando nenhuma tinta alcança AA sobre a primária', () => {
    // O ponto de equilíbrio: a luminância em que preto e branco empatam rende
    // no máximo ~4,36:1. Nenhuma das duas tintas salva uma primária daqui.
    const meio = '#787878'
    expect(contraste(TINTA_ESCURA, meio)).toBeLessThan(4.5)
    expect(contraste(TINTA_CLARA, meio)).toBeLessThan(4.5)
    const r = validarMarca(marcaCom({ cor_primaria: meio }))
    expect(r.avisos.join(' ')).toMatch(/Nenhuma tinta chega a AA sobre a primária/)
  })

  it('avisa quando a primária some dentro da superfície', () => {
    const r = validarMarca(marcaCom({ cor_primaria: '#1A1E26', cor_superficie: '#171B22' }))
    expect(r.avisos.join(' ')).toMatch(/Primária sobre a superfície/)
  })

  it('avisa quando fundo e superfície são quase iguais', () => {
    const r = validarMarca(marcaCom({ cor_fundo: '#171B22', cor_superficie: '#171B23' }))
    expect(r.avisos.join(' ')).toMatch(/quase iguais/)
  })

  it('avisa quando primária e acento são a mesma cor', () => {
    const r = validarMarca(marcaCom({ cor_primaria: '#E4572E', cor_acento: '#E4572F' }))
    expect(r.avisos.join(' ')).toMatch(/quase a mesma cor/)
  })

  it('avisa quando o tema marcado não bate com a cor de fundo', () => {
    // Cores claras carimbadas de escuro, e o contrário. Os dois lados importam:
    // o campo `tema` decide o esqueleto da interface, e errá-lo deixa a tela
    // meio clara e meio escura.
    const comoEscuro = validarMarca(marcaCom({ tema: 'escuro' }))
    expect(comoEscuro.avisos.join(' ')).toMatch(/marcado como escuro/)

    const comoClaro = validarMarca(
      marcaCom({ tema: 'claro', cor_fundo: '#0E1116', cor_superficie: '#171B22', cor_texto: '#F2F4F8' }),
    )
    expect(comoClaro.avisos.join(' ')).toMatch(/marcado como claro/)
  })

  it('recusa hexadecimal inválido antes de tentar qualquer cálculo', () => {
    const r = validarMarca(marcaCom({ cor_primaria: 'laranja' }))
    expect(r.ok).toBe(false)
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/primária não é um hexadecimal válido/)
  })

  it('os avisos vêm em português, nomeiam o que quebra e dizem a razão medida', () => {
    // Texto claro sobre superfície clara: reprova contra a superfície e contra
    // a página, então sai mais de um aviso — que é o que este teste quer ver.
    const r = validarMarca(marcaCom({ cor_texto: '#CFD8D3' }))
    expect(r.ok).toBe(false)
    expect(r.avisos.length).toBeGreaterThanOrEqual(2)
    for (const aviso of r.avisos) {
      expect(aviso).toMatch(/\b(sobre|Texto|Primária|Acento|Fundo|tema)\b/)
      expect(aviso, aviso).toMatch(/\d+,\d+:1|quase|Nenhuma/)
      expect(aviso.length).toBeGreaterThan(20)
    }
  })

  it('reprovar não é impedir: quem chama decide salvar mesmo assim', () => {
    // validarMarca não lança, não muda a marca, não tem efeito colateral.
    const marca = marcaCom({ cor_texto: '#CFD8D3' })
    const copia = { ...marca }
    expect(() => validarMarca(marca)).not.toThrow()
    expect(marca).toEqual(copia)
  })
})

/* -------------------------------------------------------------------------- */
/* derivadas                                                                   */
/* -------------------------------------------------------------------------- */

describe('derivarMarca', () => {
  it('a cor sobre a primária é sempre legível', () => {
    for (const [, marca] of MARCAS_DE_TESTE) {
      const d = derivarMarca(marca)
      expect(contraste(d.sobrePrimaria, marca.cor_primaria)).toBeGreaterThanOrEqual(
        contraste(d.sobrePrimaria === TINTA_ESCURA ? TINTA_CLARA : TINTA_ESCURA, marca.cor_primaria),
      )
    }
  })

  it('a primária legível alcança AA sobre a superfície', () => {
    for (const [, marca] of MARCAS_DE_TESTE) {
      const d = derivarMarca(marca)
      expect(contraste(d.primariaLegivel, marca.cor_superficie)).toBeGreaterThanOrEqual(4.4)
    }
  })

  it.each(MARCAS_DE_TESTE)(
    '%s: as superfícies elevadas sobem em degraus visíveis, para longe da própria superfície',
    (_nome, marca) => {
      const d = derivarMarca(marca)

      if (marca.tema === 'claro') {
        // No claro o cartão É a superfície — branco sobre página tingida, com a
        // borda separando. Escurecer o cartão para "elevá-lo" o afunda. Por
        // isso o primeiro degrau não se move, e os seguintes tingem para o lado
        // da página, para o que fica DENTRO do cartão.
        expect(d.superficie1.toLowerCase()).toBe(marca.cor_superficie.toLowerCase())
        const l1 = oklch(d.superficie1).L
        const l2 = oklch(d.superficie2).L
        const l3 = oklch(d.superficie3).L
        expect(l1 - l2, 'superfície 1 → 2').toBeGreaterThan(0.01)
        expect(l2 - l3, 'superfície 2 → 3').toBeGreaterThan(0.01)
        return
      }

      // No escuro cada degrau sobe, afastando-se da própria superfície.
      const passos = [marca.cor_superficie, d.superficie1, d.superficie2, d.superficie3]
      for (let i = 0; i < passos.length - 1; i += 1) {
        const atual = passos[i]
        const proximo = passos[i + 1]
        if (atual === undefined || proximo === undefined) throw new Error('degrau ausente')
        expect(oklch(proximo).L - oklch(atual).L, `degrau ${i}`).toBeGreaterThan(0.015)
      }
    },
  )

  it('o texto fraco continua passando AA sobre a superfície', () => {
    for (const [, marca] of MARCAS_DE_TESTE) {
      const d = derivarMarca(marca)
      expect(contraste(d.textoFraco, marca.cor_superficie), marca.cor_primaria).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('os translúcidos apontam para a primária do restaurante', () => {
    const d = derivarMarca(marcaCom({ cor_primaria: '#1BAF7A' }))
    expect(d.primaria16).toBe('rgb(27 175 122 / 0.16)')
    expect(d.primaria40).toBe('rgb(27 175 122 / 0.4)')
  })

  it('o raio derivado acompanha o raio escolhido', () => {
    const d = derivarMarca(marcaCom({ raio_borda: '20px' }))
    expect(d.raioP).toBe('11px')
    expect(d.raioG).toBe('29px')
  })

  it('o anel de foco é o acento quando o acento aparece', () => {
    expect(derivarMarca(MARCA_PADRAO).foco).toBe(MARCA_PADRAO.cor_acento)
  })

  it('o anel de foco troca quando o acento some no fundo', () => {
    // "Sumir" depende do tema, e o anel de foco é a única pista de onde o
    // teclado está — não pode depender de sorte. Os dois lados:
    const noEscuro = marcaCom({ ...ESCURO, cor_acento: '#101319' })
    const noClaro = marcaCom({ cor_acento: '#F4F7F5' })

    for (const marca of [noEscuro, noClaro]) {
      const d = derivarMarca(marca)
      expect(d.foco, marca.tema).not.toBe(marca.cor_acento)
      expect(contraste(d.foco, marca.cor_fundo), marca.tema).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* estilos.css                                                                 */
/* -------------------------------------------------------------------------- */

describe('estilos.css', () => {
  const css = readFileSync(new URL('../estilos.css', import.meta.url), 'utf8')
  const raiz = css.slice(css.indexOf(':root {'), css.indexOf('/* --- escala neutra'))

  it('o :root repete exatamente as derivadas da marca padrão', () => {
    // Esses valores existem só para o primeiro quadro, antes do provedor montar.
    // Se divergirem do que marca.ts calcula, a tela pisca na primeira pintura.
    for (const [nome, valor] of Object.entries(variaveisDaMarca(MARCA_PADRAO))) {
      if (nome.startsWith('--mv-fonte-')) continue // no CSS vão sem aspas duplicadas
      const achado = new RegExp(`${nome}:\\s*([^;]+);`).exec(raiz)?.[1]
      expect(achado?.trim().toLowerCase(), nome).toBe(valor.trim().toLowerCase())
    }
  })

  it('declara a escala neutra própria e os quatro estados nos dois temas', () => {
    for (const passo of ['0', '50', '400', '500', '950', '1000']) {
      expect(css).toContain(`--mv-neutro-${passo}:`)
    }
    const claro = css.slice(css.indexOf(":root[data-tema='claro']"))
    for (const estado of ['sucesso', 'alerta', 'erro', 'info']) {
      for (const papel of ['', '-texto', '-suave', '-borda']) {
        expect(css, `escuro: ${estado}${papel}`).toContain(`--mv-${estado}${papel}:`)
        expect(claro, `claro: ${estado}${papel}`).toContain(`--mv-${estado}${papel}:`)
      }
    }
  })

  it('trata movimento reduzido e foco visível', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain(':focus-visible')
    expect(css).toMatch(/--mv-toque:\s*44px/)
  })

  it('mapeia os tokens de marca para o Tailwind sem congelar o valor', () => {
    // `@theme inline` é o que faz o utilitário apontar para var(--mv-*): sem ele,
    // trocar de restaurante não repintaria nada.
    expect(css).toContain('@theme inline')
    for (const par of [
      ['--color-primaria', '--mv-primaria'],
      ['--color-acento', '--mv-acento'],
      ['--radius-marca', '--mv-raio'],
      ['--font-titulo', '--mv-pilha-titulo'],
    ]) {
      expect(css).toContain(`${par[0]}: var(${par[1]});`)
    }
  })
})
