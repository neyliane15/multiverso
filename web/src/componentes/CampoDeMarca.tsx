/**
 * Gestão de Restaurantes · controles de identidade
 * ---------------------------------------------------------------------------
 * O que o admin usa em Configurações para montar a cara do restaurante dele.
 * Quatro peças: escolher cor, subir logo, escolher fonte e ver o resultado
 * antes de salvar.
 *
 * O aviso de contraste nunca bloqueia. Ele diz o que vai acontecer e deixa a
 * decisão com quem é dono da marca.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react'
import { Check, Image as Icone, Trash2, Upload } from 'lucide-react'
import type { Marca } from '@/tipos/banco'
import { supabase } from '@/dados/supabase'
import {
  contraste,
  corLegivelSobre,
  normalizarHex,
  validarMarca,
  variaveisDaMarca,
} from '@/tema/marca'
import { carregarFonte } from '@/tema/ProvedorDeMarca'
import { Aviso, Botao } from './base'
import { LogoDoRestaurante } from './LogoDoRestaurante'

/* ========================================================================== */
/* Apoio                                                                      */
/* ========================================================================== */

const estilo = (marca: Marca): CSSProperties => variaveisDaMarca(marca) as CSSProperties

const cartao =
  'rounded-marca border border-borda bg-superficie-1 p-4 sm:p-5'

const campo =
  'h-toque w-full rounded-marca-p border border-borda bg-superficie px-3 text-corpo ' +
  'text-texto outline-none transition-colors focus-visible:border-primaria'

/* ========================================================================== */
/* SeletorDeCor                                                               */
/* ========================================================================== */

export interface PropsDoSeletorDeCor {
  rotulo: string
  /** Uma linha explicando onde essa cor aparece no sistema. */
  ajuda?: string
  valor: string
  aoMudar: (hex: string) => void
  /** A marca inteira, para medir o contraste da escolha contra o resto dela. */
  marca: Marca
  /** Qual campo da marca este seletor edita — filtra o aviso que interessa. */
  campoDaMarca: keyof Marca
  desabilitado?: boolean
}

export function SeletorDeCor({
  rotulo,
  ajuda,
  valor,
  aoMudar,
  marca,
  campoDaMarca,
  desabilitado = false,
}: PropsDoSeletorDeCor): JSX.Element {
  const id = useId()
  const [rascunho, setRascunho] = useState(valor)
  const [invalido, setInvalido] = useState(false)

  useEffect(() => {
    setRascunho(valor)
    setInvalido(false)
  }, [valor])

  const confirmar = useCallback(
    (texto: string) => {
      const hex = normalizarHex(texto)
      if (!hex) {
        setInvalido(true)
        return
      }
      setInvalido(false)
      aoMudar(hex.toUpperCase())
    },
    [aoMudar],
  )

  // Só os avisos que falam desta cor: o admin não precisa ler a lista inteira
  // enquanto mexe no seletor de acento.
  const avisos = useMemo(() => {
    const termo: Record<string, RegExp> = {
      cor_primaria: /primária/i,
      cor_secundaria: /secundária/i,
      cor_acento: /acento/i,
      cor_fundo: /fundo/i,
      cor_superficie: /superfície/i,
      cor_texto: /texto/i,
    }
    const filtro = termo[campoDaMarca as string]
    const todos = validarMarca(marca).avisos
    return filtro ? todos.filter((a) => filtro.test(a)) : todos
  }, [marca, campoDaMarca])

  const sobre = corLegivelSobre(valor)
  const razao = contraste(valor, marca.cor_superficie)

  return (
    <div className={cartao}>
      <div className="flex items-start gap-4">
        {/* amostra grande: o seletor nativo ocupa a amostra inteira */}
        <div className="relative shrink-0">
          <label
            htmlFor={id}
            className="flex size-16 cursor-pointer items-center justify-center rounded-marca border border-borda-forte sm:size-20"
            style={{ backgroundColor: valor }}
          >
            <span className="mv-rotulo" style={{ color: sobre, letterSpacing: '0.04em' }}>
              {valor.replace('#', '')}
            </span>
          </label>
          <input
            id={id}
            type="color"
            value={normalizarHex(valor) ?? '#000000'}
            disabled={desabilitado}
            onChange={(e) => aoMudar(e.target.value.toUpperCase())}
            aria-label={`Escolher a cor ${rotulo.toLowerCase()}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-titulo text-destaque font-semibold text-texto">{rotulo}</div>
          {ajuda ? <p className="mt-0.5 text-apoio text-texto-fraco">{ajuda}</p> : null}

          <div className="mt-3 flex items-center gap-2">
            <span aria-hidden className="mv-rotulo shrink-0">
              HEX
            </span>
            <input
              type="text"
              inputMode="text"
              spellCheck={false}
              autoComplete="off"
              value={rascunho}
              disabled={desabilitado}
              maxLength={7}
              aria-label={`Código hexadecimal da cor ${rotulo.toLowerCase()}`}
              aria-invalid={invalido}
              onChange={(e) => setRascunho(e.target.value)}
              onBlur={(e) => confirmar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmar(e.currentTarget.value)
                if (e.key === 'Escape') {
                  setRascunho(valor)
                  setInvalido(false)
                }
              }}
              className={`${campo} font-numero uppercase ${invalido ? 'border-erro' : ''}`}
            />
          </div>

          {invalido ? (
            <p role="alert" className="mt-2 text-apoio text-erro-texto">
              Use seis dígitos hexadecimais, como #1B7F5A.
            </p>
          ) : (
            <p className="mt-2 text-micro text-texto-fraco">
              Contraste contra a superfície:{' '}
              <span className="mv-numero">{razao.toFixed(2).replace('.', ',')}:1</span>
            </p>
          )}
        </div>
      </div>

      {avisos.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {avisos.map((aviso) => (
            <li key={aviso}>
              <Aviso tom="alerta">{aviso}</Aviso>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* ========================================================================== */
/* EnvioDeLogo                                                                */
/* ========================================================================== */

const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const
const LIMITE_BYTES = 2 * 1024 * 1024
const BUCKET = 'marcas'

const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function nomeDeArquivo(arquivo: File, prefixo: string): string {
  const ext = EXTENSAO[arquivo.type] ?? 'png'
  const carimbo = Date.now().toString(36)
  return `${prefixo}-${carimbo}.${ext}`
}

/** Traduz o que pode dar errado. Nada de "Bad Request" na cara do admin. */
export function conferirArquivoDeLogo(arquivo: File): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type as (typeof TIPOS_ACEITOS)[number])) {
    return 'Formato não aceito. Use PNG, JPG, WEBP ou SVG.'
  }
  if (arquivo.size > LIMITE_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1).replace('.', ',')
    return `O arquivo tem ${mb} MB e o limite é 2 MB. Reduza a imagem e envie de novo.`
  }
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  return null
}

export interface PropsDoEnvioDeLogo {
  restauranteId: string
  rotulo: string
  ajuda?: string
  /** URL pública atual, ou null. */
  valor: string | null
  aoMudar: (url: string | null) => void
  /** Prefixo do nome no bucket: 'logo', 'logo-escuro', 'favicon'. */
  prefixo?: string
  /** Fundo da prévia: útil para conferir um PNG transparente no tema certo. */
  fundoDaPrevia?: 'superficie' | 'claro' | 'escuro'
}

export function EnvioDeLogo({
  restauranteId,
  rotulo,
  ajuda,
  valor,
  aoMudar,
  prefixo = 'logo',
  fundoDaPrevia = 'superficie',
}: PropsDoEnvioDeLogo): JSX.Element {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)

  const enviar = useCallback(
    async (arquivo: File) => {
      setErro(null)
      const problema = conferirArquivoDeLogo(arquivo)
      if (problema) {
        setErro(problema)
        return
      }
      setEnviando(true)
      const caminho = `${restauranteId}/${nomeDeArquivo(arquivo, prefixo)}`
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
        cacheControl: '3600',
        contentType: arquivo.type,
        upsert: true,
      })
      setEnviando(false)

      if (error) {
        const texto = error.message.toLowerCase()
        if (texto.includes('row-level security') || texto.includes('unauthorized')) {
          setErro('Você não tem permissão para trocar a identidade deste restaurante.')
        } else if (texto.includes('exceeded') || texto.includes('size')) {
          setErro('O arquivo passou do limite de 2 MB aceito pelo servidor.')
        } else if (texto.includes('mime') || texto.includes('type')) {
          setErro('Formato não aceito pelo servidor. Use PNG, JPG, WEBP ou SVG.')
        } else if (texto.includes('fetch') || texto.includes('network')) {
          setErro('Sem conexão com o servidor. Confira a internet e tente de novo.')
        } else {
          setErro(`Não foi possível enviar o arquivo: ${error.message}`)
        }
        return
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
      aoMudar(data.publicUrl)
    },
    [restauranteId, prefixo, aoMudar],
  )

  const soltar = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setSobre(false)
      const arquivo = e.dataTransfer.files.item(0)
      if (arquivo) void enviar(arquivo)
    },
    [enviar],
  )

  const fundo =
    fundoDaPrevia === 'claro'
      ? 'var(--mv-neutro-0)'
      : fundoDaPrevia === 'escuro'
        ? 'var(--mv-neutro-950)'
        : 'var(--mv-superficie)'

  return (
    <div className={cartao}>
      <div className="font-titulo text-destaque font-semibold text-texto">{rotulo}</div>
      {ajuda ? <p className="mt-0.5 text-apoio text-texto-fraco">{ajuda}</p> : null}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSobre(true)
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        className={[
          'mt-3 flex flex-col items-center gap-3 rounded-marca border border-dashed p-5 text-center transition-colors sm:flex-row sm:text-left',
          sobre ? 'border-primaria' : 'border-borda-forte',
        ].join(' ')}
        style={sobre ? { backgroundColor: 'var(--mv-primaria-10)' } : undefined}
      >
        <div
          className="flex size-20 shrink-0 items-center justify-center rounded-marca border border-borda"
          style={{ backgroundColor: fundo }}
        >
          {valor ? (
            <img
              src={valor}
              alt="Prévia do arquivo enviado"
              className="max-h-16 max-w-16 object-contain"
            />
          ) : (
            <Icone aria-hidden className="size-6 text-texto-fraco" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-corpo text-texto">
            Arraste o arquivo aqui ou{' '}
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="rounded-marca-p font-semibold underline decoration-dotted underline-offset-4"
              style={{ color: 'var(--mv-primaria-legivel)' }}
            >
              escolha no aparelho
            </button>
            .
          </p>
          <p className="mt-1 text-micro text-texto-fraco">PNG, JPG, WEBP ou SVG, até 2 MB.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Botao
              tom="primario"
              onClick={() => entrada.current?.click()}
              carregando={enviando}
              icone={<Upload aria-hidden className="size-4" />}
            >
              {enviando ? 'Enviando…' : 'Enviar arquivo'}
            </Botao>

            {valor ? (
              <Botao
                tom="secundario"
                onClick={() => {
                  setErro(null)
                  aoMudar(null)
                }}
                icone={<Trash2 aria-hidden className="size-4" />}
              >
                Remover
              </Botao>
            ) : null}
          </div>
        </div>

        <input
          ref={entrada}
          id={id}
          type="file"
          accept={TIPOS_ACEITOS.join(',')}
          className="sr-only"
          aria-label={`Arquivo para ${rotulo.toLowerCase()}`}
          onChange={(e) => {
            const arquivo = e.target.files?.item(0)
            if (arquivo) void enviar(arquivo)
            e.target.value = ''
          }}
        />
      </div>

      {erro ? (
        <div className="mt-3">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      ) : null}
    </div>
  )
}

/* ========================================================================== */
/* SeletorDeFonte                                                             */
/* ========================================================================== */

export interface FonteCurada {
  familia: string
  /** O que ela faz bem, em uma linha. */
  nota: string
}

/** Curadoria curta: fontes do Google com acentuação completa e números que
 *  alinham em coluna. Lista curta de propósito — escolher é o trabalho do
 *  admin, garimpar não. */
export const FONTES_DE_TITULO: readonly FonteCurada[] = [
  { familia: 'Sora', nota: 'Geométrica de terminais retos. O padrão do sistema.' },
  { familia: 'Outfit', nota: 'Limpa e larga, boa para nome curto.' },
  { familia: 'Space Grotesk', nota: 'Técnica, com caráter. Combina com número.' },
  { familia: 'Archivo', nota: 'Condensada e firme, aguenta título longo.' },
  { familia: 'Bricolage Grotesque', nota: 'Irregular de propósito, para marca informal.' },
  { familia: 'Fraunces', nota: 'Serifada com contraste alto, para casa mais clássica.' },
  { familia: 'Libre Franklin', nota: 'Neutra de jornal, discreta e legível.' },
  { familia: 'Chivo', nota: 'Grotesca sólida, boa em peso alto.' },
]

export const FONTES_DE_TEXTO: readonly FonteCurada[] = [
  { familia: 'Inter', nota: 'Feita para tela. O padrão do sistema.' },
  { familia: 'Public Sans', nota: 'Sóbria, alta legibilidade em texto pequeno.' },
  { familia: 'Source Sans 3', nota: 'Humanista, confortável em bloco de texto.' },
  { familia: 'IBM Plex Sans', nota: 'Técnica, ótima ao lado de tabela.' },
  { familia: 'Work Sans', nota: 'Aberta e redonda, leve em tela pequena.' },
  { familia: 'Figtree', nota: 'Amigável sem perder a seriedade.' },
]

export interface PropsDoSeletorDeFonte {
  rotulo: string
  papel: 'titulo' | 'texto'
  valor: string
  aoMudar: (familia: string) => void
  /** O que a prévia escreve. O padrão é uma frase do próprio sistema. */
  amostra?: string
}

export function SeletorDeFonte({
  rotulo,
  papel,
  valor,
  aoMudar,
  amostra,
}: PropsDoSeletorDeFonte): JSX.Element {
  const opcoes = papel === 'titulo' ? FONTES_DE_TITULO : FONTES_DE_TEXTO
  const nomeDoGrupo = useId()

  // Prévia ao vivo: as famílias da lista são pedidas assim que o seletor abre.
  useEffect(() => {
    for (const o of opcoes) void carregarFonte(o.familia)
  }, [opcoes])

  const texto =
    amostra ??
    (papel === 'titulo' ? 'Contagem de estoque' : 'CMV do período fechou em 31,4% — R$ 48.210,55')

  return (
    <fieldset className={cartao}>
      <legend className="font-titulo text-destaque font-semibold text-texto">{rotulo}</legend>
      <p className="mt-0.5 text-apoio text-texto-fraco">
        {papel === 'titulo'
          ? 'Aparece nos títulos de tela e de cartão.'
          : 'Aparece no texto corrido, nos campos e nas tabelas.'}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => {
          const escolhida = o.familia === valor
          return (
            <label
              key={o.familia}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-marca border p-3 transition-colors',
                escolhida ? 'border-primaria' : 'border-borda hover:border-borda-forte',
              ].join(' ')}
              style={escolhida ? { backgroundColor: 'var(--mv-primaria-10)' } : undefined}
            >
              <input
                type="radio"
                name={nomeDoGrupo}
                checked={escolhida}
                onChange={() => aoMudar(o.familia)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: escolhida ? 'var(--mv-primaria)' : 'var(--mv-borda-forte)',
                  backgroundColor: escolhida ? 'var(--mv-primaria)' : 'transparent',
                  color: 'var(--mv-sobre-primaria)',
                }}
              >
                {escolhida ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0">
                <span
                  className="block truncate text-destaque text-texto"
                  style={{ fontFamily: `'${o.familia}', sans-serif`, fontWeight: 600 }}
                >
                  {o.familia}
                </span>
                <span
                  className="mt-1 block text-corpo text-texto-suave"
                  style={{ fontFamily: `'${o.familia}', sans-serif` }}
                >
                  {texto}
                </span>
                <span className="mt-1 block text-micro text-texto-fraco">{o.nota}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/* ========================================================================== */
/* PreviaDaMarca                                                              */
/* ========================================================================== */

const SEMANAS = [
  { rotulo: 'S32', valor: 31.2 },
  { rotulo: 'S33', valor: 33.8 },
  { rotulo: 'S34', valor: 29.6 },
  { rotulo: 'S35', valor: 34.9 },
  { rotulo: 'S36', valor: 30.1 },
  { rotulo: 'S37', valor: 28.4 },
]

const LINHAS = [
  { produto: 'Filé mignon', setor: 'Câmara fria', qtd: '12,400 kg', total: 'R$ 1.041,60' },
  { produto: 'Queijo meia-cura', setor: 'Geladeira', qtd: '8,250 kg', total: 'R$ 396,00' },
  { produto: 'Farinha de trigo', setor: 'Estoque seco', qtd: '45,000 kg', total: 'R$ 202,50' },
]

/** Mini gráfico de colunas — uma série, marca fina, sem grade, rótulo só no
 *  extremo. É a mesma gramática dos gráficos do sistema, em miniatura. */
function GraficoDaPrevia({ cor }: { cor: string }): JSX.Element {
  const maximo = Math.max(...SEMANAS.map((s) => s.valor))
  const menor = SEMANAS.reduce((a, b) => (b.valor < a.valor ? b : a), SEMANAS[0] as (typeof SEMANAS)[number])

  return (
    <figure className="m-0">
      <figcaption className="mv-rotulo">CMV semanal · % sobre venda</figcaption>
      <div className="mt-2 flex h-24 items-end gap-2" role="img" aria-label="CMV das últimas seis semanas, entre 28% e 35%.">
        {SEMANAS.map((s) => (
          <div key={s.rotulo} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="w-full max-w-6 rounded-t-marca-interno"
              style={{
                height: `${(s.valor / maximo) * 72}px`,
                backgroundColor: cor,
                opacity: s.rotulo === menor.rotulo ? 1 : 0.62,
              }}
            />
            <span className="text-micro text-texto-fraco">{s.rotulo}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-micro text-texto-suave">
        Menor da série: <span className="mv-numero">{menor.rotulo}</span>, {' '}
        <span className="mv-numero">{menor.valor.toFixed(1).replace('.', ',')}%</span>
      </p>
    </figure>
  )
}

export interface PropsDaPreviaDaMarca {
  marca: Marca
  /** O nome que aparece no cabeçalho da prévia. */
  nome?: string
}

/**
 * O cartão onde o admin vê a decisão antes de salvar: cabeçalho, botão,
 * tabela e gráfico, com as cores e as fontes escolhidas. As variáveis de marca
 * são escritas no `style` deste cartão, então a prévia é literalmente o mesmo
 * mecanismo do app inteiro, só que num pedaço da tela.
 */
export function PreviaDaMarca({ marca, nome = 'Seu restaurante' }: PropsDaPreviaDaMarca): JSX.Element {
  const resultado = useMemo(() => validarMarca(marca), [marca])

  useEffect(() => {
    void carregarFonte(marca.fonte_titulo)
    void carregarFonte(marca.fonte_texto)
  }, [marca.fonte_titulo, marca.fonte_texto])

  return (
    <div className="space-y-3">
      <div
        data-tema={marca.tema}
        style={{
          ...estilo(marca),
          backgroundColor: 'var(--mv-fundo)',
          color: 'var(--mv-texto)',
          fontFamily: 'var(--mv-pilha-texto)',
          borderRadius: 'var(--mv-raio-g)',
        }}
        className="overflow-hidden border border-borda-forte"
      >
        {/* cabeçalho */}
        <div className="mv-faixa h-[3px]" aria-hidden />
        <header
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
          style={{ backgroundColor: 'var(--mv-superficie)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <LogoDoRestaurante
              nome={nome}
              logoUrl={marca.logo_url}
              logoEscuroUrl={marca.logo_escuro_url}
              marca={marca}
              tamanho={36}
              decorativo
            />
            <div className="min-w-0">
              <div
                className="truncate font-semibold"
                style={{ fontFamily: 'var(--mv-pilha-titulo)', fontSize: 16, letterSpacing: '-0.015em' }}
              >
                {nome}
              </div>
              <div className="mv-rotulo mt-0.5">Contagem semanal · S37</div>
            </div>
          </div>
          <button
            type="button"
            className="mv-toque inline-flex items-center rounded-marca-p px-4 text-rotulo font-semibold"
            style={{ backgroundColor: 'var(--mv-primaria)', color: 'var(--mv-sobre-primaria)' }}
          >
            Fechar contagem
          </button>
        </header>

        <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
          {/* tabela */}
          <div className="min-w-0">
            <div className="mv-rotulo">Itens contados</div>
            <table className="mt-2 w-full border-collapse text-apoio">
              <thead>
                <tr style={{ color: 'var(--mv-texto-fraco)' }}>
                  <th className="border-b border-borda py-1.5 text-left font-semibold">Insumo</th>
                  <th className="border-b border-borda py-1.5 text-right font-semibold">Qtd.</th>
                  <th className="border-b border-borda py-1.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((l) => (
                  <tr key={l.produto}>
                    <td className="border-b border-borda py-2">
                      <div className="truncate">{l.produto}</div>
                      <div className="text-micro" style={{ color: 'var(--mv-texto-fraco)' }}>
                        {l.setor}
                      </div>
                    </td>
                    <td className="mv-numero border-b border-borda py-2 text-right align-top">
                      {l.qtd}
                    </td>
                    <td className="mv-numero border-b border-borda py-2 text-right align-top">
                      {l.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* gráfico + série */}
          <div className="min-w-0 space-y-4">
            <GraficoDaPrevia cor="var(--mv-grafico-1)" />
            <div>
              <div className="mv-rotulo">Cores de série</div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <li
                    key={n}
                    className="size-6 rounded-marca-interno"
                    style={{ backgroundColor: `var(--mv-grafico-${n})` }}
                    title={`Série ${n}`}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* estados: fixos, não seguem a marca */}
        <div
          className="flex flex-wrap gap-2 border-t border-borda px-4 py-3 sm:px-5"
          style={{ backgroundColor: 'var(--mv-superficie)' }}
        >
          {(
            [
              ['Contagem fechada', 'sucesso'],
              ['3 itens sem contagem', 'alerta'],
              ['Nota rejeitada', 'erro'],
              ['CMV do mês parcial', 'info'],
            ] as const
          ).map(([texto, estado]) => (
            <span
              key={estado}
              className="inline-flex items-center rounded-marca-p border px-2.5 py-1 text-micro font-semibold"
              style={{
                borderColor: `var(--mv-${estado}-borda)`,
                backgroundColor: `var(--mv-${estado}-suave)`,
                color: `var(--mv-${estado}-texto)`,
              }}
            >
              {texto}
            </span>
          ))}
        </div>
      </div>

      {resultado.ok ? (
        <p className="flex items-center gap-2 text-apoio text-sucesso-texto">
          <Check aria-hidden className="size-4" />
          A combinação passa em contraste AA. Pode salvar.
        </p>
      ) : (
        <div
          role="status"
          className="rounded-marca-p border border-alerta-borda bg-alerta-suave p-3 text-apoio text-alerta-texto"
        >
          <p className="font-semibold">
            {resultado.avisos.length === 1
              ? 'Um ponto reprova em contraste AA:'
              : `${resultado.avisos.length} pontos reprovam em contraste AA:`}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {resultado.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="mt-2 text-micro">Você pode salvar assim mesmo — a escolha é sua.</p>
        </div>
      )}
    </div>
  )
}
