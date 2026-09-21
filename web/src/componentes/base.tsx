/**
 * Primitivas da interface.
 *
 * Nenhuma delas escreve cor de marca em hexadecimal — tudo sai dos tokens que
 * `aplicarMarca` reescreve no documento. Trocar de restaurante repinta estas
 * peças sem recompilar nada.
 *
 * ---------------------------------------------------------------------------
 * As três escalas que este arquivo manda, e que as telas seguem
 * ---------------------------------------------------------------------------
 *
 * **Tipo.** Só os degraus de `estilos.css`, nunca pixel solto: `micro` (11) ·
 * `rotulo` (12) · `apoio` (13) · `corpo` (15) · `destaque` (18, título de
 * cartão) · `secao` (22) · `tela` (28) · `numero` (32). Título de cartão em
 * 15px — do tamanho do corpo — é título que não titula nada.
 *
 * **Espaço dentro de um cartão.** Uma medida por papel, e a mesma calha de
 * 20px em todos eles, para que o primeiro caractere de cada linha caia embaixo
 * do título do cartão:
 *
 *     cabeçalho e faixa de filtro … px-5 py-4
 *     corpo …………………………………………………… p-5
 *     item de lista ……………………………… px-5 py-3
 *     célula de tabela ………………………… px-5 py-2.5   (linha de 44px)
 *     rótulo → campo …………………………… mt-1.5
 *
 * **Raio.** `rounded-marca` para superfície que guarda outra coisa (cartão,
 * painel, caixa de solta); `rounded-marca-p` para controle (botão, campo,
 * aviso, chip); `rounded-marca-g` para o que cobre a tela (diálogo); e
 * `rounded-full` só para pílula e disco.
 *
 * **Borda.** `border-borda` separa duas superfícies. `border-borda-forte` é
 * realce — hover e amostra de cor. `border-borda/60` é divisória *dentro* de
 * um cartão: ela não pode pesar igual à borda do próprio cartão, senão a
 * tabela vira grade.
 */
import { Children, forwardRef, useEffect, useId, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import clsx from 'clsx'
import {
  CircleAlert,
  CircleCheck,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────── palavras ──

/**
 * Concordância de número. O sistema escrevia "3 item(ns)" numa tela e
 * "3 itens" na tela do lado; parêntese é rascunho, não interface.
 */
export function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}

// ───────────────────────────────────────────────────────────────── botão ────

type Tom = 'primario' | 'secundario' | 'fantasma' | 'perigo'
type Tamanho = 'p' | 'm' | 'g'

/**
 * Os quatro tons têm os mesmos quatro estados — repouso, ponteiro em cima,
 * apertado e desabilitado. Antes só o primário escurecia ao ser apertado, e os
 * outros três não davam retorno nenhum de que o clique tinha pegado.
 */
const TOM: Record<Tom, string> = {
  primario:
    'bg-primaria text-sobre-primaria shadow-baixa hover:brightness-110 active:brightness-95',
  secundario:
    'bg-superficie-2 text-texto border border-borda hover:border-borda-forte hover:bg-superficie-3 active:brightness-95',
  fantasma:
    'text-texto-suave hover:bg-primaria-06 hover:text-texto active:bg-primaria-16',
  perigo:
    'bg-erro-suave text-erro-texto border border-erro-borda hover:brightness-110 active:brightness-95',
}

const TAMANHO: Record<Tamanho, string> = {
  p: 'h-9 px-3 text-apoio gap-1.5',
  m: 'h-toque px-4 text-corpo gap-2',
  g: 'h-12 px-6 text-corpo gap-2.5',
}

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tom?: Tom
  tamanho?: Tamanho
  carregando?: boolean
  icone?: ReactNode
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { tom = 'secundario', tamanho = 'm', carregando, icone, children, className, disabled, ...resto },
  ref,
) {
  // Botão só de ícone encosta nos 44px sozinho, e o que define "só de ícone" é
  // não ter texto nenhum — o desenho vem como filho, não pela prop `icone`.
  // Antes cada tela lembrava (ou esquecia) de escrever `mv-toque` na mão, e o
  // resultado era um alvo de 36px no cabeçalho: justo o botão que se aperta com
  // o polegar, andando.
  const soIcone = !Children.toArray(children).some(
    (filho) => typeof filho === 'string' || typeof filho === 'number',
  )

  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={clsx(
        'inline-flex items-center justify-center rounded-marca-p font-medium',
        'transition-[color,background-color,border-color,filter,box-shadow]',
        'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        TOM[tom],
        TAMANHO[tamanho],
        soIcone && 'mv-toque px-0',
        className,
      )}
      {...resto}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  )
})

// ───────────────────────────────────────────────────────────────── cartão ───

export function Cartao({
  children,
  className,
  titulo,
  acao,
  descricao,
}: {
  children?: ReactNode
  className?: string
  titulo?: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <section
      className={clsx(
        'overflow-hidden rounded-marca border border-borda bg-superficie-1 shadow-baixa',
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            {titulo && (
              <h2 className="font-titulo text-destaque leading-tight font-semibold text-texto">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-1 text-apoio leading-snug text-texto-fraco">{descricao}</p>
            )}
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Marca de identidade ao lado do texto — o texto nunca veste a cor da série. */
export function Ponto({ cor, className }: { cor: string; className?: string }) {
  return (
    <span
      className={clsx('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: cor }}
      aria-hidden
    />
  )
}

/** Número em destaque. O `.mv-numero` traz a face tabular — dígito não dança. */
export function Indicador({
  rotulo,
  valor,
  apoio,
  tom = 'neutro',
  icone,
}: {
  rotulo: string
  valor: ReactNode
  apoio?: ReactNode
  tom?: 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'marca'
  icone?: ReactNode
}) {
  const cor = {
    neutro: 'text-texto',
    marca: 'text-primaria-legivel',
    sucesso: 'text-sucesso-texto',
    alerta: 'text-alerta-texto',
    erro: 'text-erro-texto',
  }[tom]
  return (
    <div className="rounded-marca border border-borda bg-superficie-1 px-5 py-4">
      <div className="mv-rotulo flex items-center gap-2">
        {icone}
        {rotulo}
      </div>
      {/* `aria-live="polite"`: este número se refaz sozinho quando a consulta
          volta ou quando alguém digita na folha. Sem isto ele muda em silêncio
          para quem usa leitor de tela. */}
      <div
        aria-live="polite"
        className={clsx('mv-numero mt-2 text-tela leading-none font-semibold', cor)}
      >
        {valor}
      </div>
      {apoio && <div className="mt-2 text-apoio leading-snug text-texto-fraco">{apoio}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────── campos ──

export function Rotulo({ children, para }: { children: ReactNode; para?: string }) {
  return (
    <label htmlFor={para} className="mv-rotulo block">
      {children}
    </label>
  )
}

const CAMPO_BASE =
  // `superficie` e nao `superficie-2`: no tema claro a tingida deixa o campo
  // com cara de desabilitado sobre o cartao branco. Assim funciona nos dois —
  // no claro e o branco com a borda separando, no escuro e o encaixe fundo.
  'rounded-marca-p border border-borda bg-superficie px-3 text-corpo text-texto ' +
  'placeholder:text-texto-fraco/70 transition-colors ' +
  'hover:border-borda-forte focus:border-primaria focus:outline-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

/** Classe de largura do Tailwind — `w-24`, `w-full`, `max-w-56`, `sm:w-40`. */
const LARGURA = /(^|\s)(\w+:)*(w-|min-w-|max-w-|basis-|size-)/

/**
 * Larga por padrão, estreita quando o chamador pedir.
 *
 * Passar `w-24` para um campo que já nasce `w-full` não o estreita: as duas
 * regras existem no CSS com a mesma especificidade, e quem vence é a que o
 * Tailwind emitiu por último — não a que veio depois no atributo `class`. O
 * campo de quantidade da lista de compras pedia 96px e ficava com 195 num
 * celular de 390, espremendo o nome do produto até sobrar "APARA D…". Aqui o
 * padrão sai de cena quando há largura explícita, em vez de brigar com ela.
 */
export function comLargura(className: string | undefined, padrao = 'w-full'): string {
  return LARGURA.test(className ?? '') ? '' : padrao
}

export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Campo({ className, ...resto }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(CAMPO_BASE, comLargura(className), 'h-toque', className)}
        {...resto}
      />
    )
  },
)

/**
 * Entrada numérica em pt-BR. O teclado do celular abre no numérico e a vírgula
 * decimal é aceita, porque ninguém digita ponto contando estoque.
 */
export const CampoNumero = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    valor: number
    aoMudar: (valor: number) => void
  }
>(function CampoNumero({ valor, aoMudar, className, ...resto }, ref) {
  return (
    <input
      ref={ref}
      inputMode="decimal"
      defaultValue={valor === 0 ? '' : String(valor).replace('.', ',')}
      onBlur={(e) => {
        const limpo = e.target.value.replace(/\./g, '').replace(',', '.').trim()
        const n = limpo === '' ? 0 : Number(limpo)
        if (!Number.isNaN(n) && n >= 0) aoMudar(n)
        else e.target.value = String(valor).replace('.', ',')
      }}
      className={clsx(
        CAMPO_BASE,
        comLargura(className),
        'mv-numero h-toque text-right tabular-nums',
        className,
      )}
      {...resto}
    />
  )
})

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Selecao({ className, children, ...resto }, ref) {
    return (
      <select
        ref={ref}
        className={clsx(CAMPO_BASE, comLargura(className), 'h-toque pr-8', className)}
        {...resto}
      >
        {children}
      </select>
    )
  },
)

// ────────────────────────────────────────────────────────────────── estados ─

export function Selo({
  children,
  tom = 'neutro',
  cor,
}: {
  children: ReactNode
  tom?: 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'info' | 'marca'
  /** Cor livre (categoria, setor). Vence o `tom`. */
  cor?: string
}) {
  const tons = {
    neutro: 'bg-superficie-3 text-texto-suave border-borda',
    marca: 'bg-primaria-16 text-primaria-legivel border-primaria-40',
    sucesso: 'bg-sucesso-suave text-sucesso-texto border-sucesso-borda',
    alerta: 'bg-alerta-suave text-alerta-texto border-alerta-borda',
    erro: 'bg-erro-suave text-erro-texto border-erro-borda',
    info: 'bg-info-suave text-info-texto border-info-borda',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-micro font-medium whitespace-nowrap',
        cor ? 'text-texto' : tons[tom],
      )}
      /* A cor de categoria e de setor vem do banco e pode ser qualquer uma —
         inclusive um azul que dá 2:1 como texto. Então ela não veste o texto:
         ela vira a lavagem do fundo, a borda e o ponto. O nome fica na cor de
         leitura do tema, que passa em AA por construção, e a identidade
         continua inteira porque o ponto colorido está ali do lado. */
      style={cor ? { backgroundColor: `${cor}26`, borderColor: `${cor}59` } : undefined}
    >
      {cor && <Ponto cor={cor} className="size-2" />}
      {children}
    </span>
  )
}

/**
 * Chip de escolha — o setor que entra na folha, a categoria que entra na lista.
 *
 * Vive aqui porque a contagem e a lista de compras tinham a mesma peça copiada,
 * e cada cópia já ia por um caminho: uma tinha `hover`, a outra não; nenhuma
 * tinha `active`. `aria-pressed` é o que diz o estado — a cor nunca está
 * sozinha.
 */
export function Chip({
  marcado,
  aoAlternar,
  children,
}: {
  marcado: boolean
  aoAlternar: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={aoAlternar}
      className={clsx(
        'inline-flex min-h-toque items-center gap-2 rounded-marca-p border px-3 text-corpo',
        'transition-colors',
        marcado
          ? 'border-primaria bg-primaria-16 text-primaria-legivel active:brightness-95'
          : 'border-borda bg-superficie-2 text-texto-suave hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16',
      )}
    >
      {children}
    </button>
  )
}

const ICONE_DO_TOM = {
  info: Info,
  alerta: TriangleAlert,
  erro: CircleAlert,
  sucesso: CircleCheck,
} as const

export function Aviso({
  tom = 'info',
  titulo,
  children,
}: {
  tom?: 'info' | 'alerta' | 'erro' | 'sucesso'
  titulo?: ReactNode
  children?: ReactNode
}) {
  const tons = {
    info: 'bg-info-suave text-info-texto border-info-borda',
    alerta: 'bg-alerta-suave text-alerta-texto border-alerta-borda',
    erro: 'bg-erro-suave text-erro-texto border-erro-borda',
    sucesso: 'bg-sucesso-suave text-sucesso-texto border-sucesso-borda',
  }
  const Icone = ICONE_DO_TOM[tom]
  return (
    <div
      role={tom === 'erro' ? 'alert' : 'status'}
      className={clsx(
        'flex gap-3 rounded-marca-p border px-4 py-3 text-apoio leading-relaxed',
        tons[tom],
      )}
    >
      {/* O ícone não é enfeite: metade dos avisos do sistema entra sem título,
          e sem ele a única coisa que diferenciaria um erro de um aviso seria a
          cor — que é justamente o que a identidade proíbe. */}
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo && <div className="font-semibold">{titulo}</div>}
        {children}
      </div>
    </div>
  )
}

export function EstadoVazio({
  icone,
  titulo,
  children,
  acao,
}: {
  icone?: ReactNode
  titulo: string
  children?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      {/* O tamanho do ícone é decisão daqui, não de cada tela: metade delas
          pedia `size-7` e a outra metade `size-8`, e duas telas vizinhas
          mostravam o mesmo vazio com desenhos de tamanhos diferentes. */}
      {icone && (
        <span className="text-texto-fraco/60 [&>svg]:size-8" aria-hidden>
          {icone}
        </span>
      )}
      <h3 className="font-titulo text-destaque font-semibold text-texto">{titulo}</h3>
      {children && <p className="max-w-sm text-apoio leading-relaxed text-texto-fraco">{children}</p>}
      {acao}
    </div>
  )
}

export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div
          key={i}
          className="mv-esqueleto h-9 rounded-marca-p"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  )
}

/** Erro de consulta com a mensagem real — nada de "algo deu errado". */
export function ErroDaConsulta({ erro, aoTentar }: { erro: unknown; aoTentar?: () => void }) {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  return (
    <div className="p-5">
      <Aviso tom="erro" titulo="Não deu para carregar">
        <p className="mt-1">{mensagem}</p>
        {aoTentar && (
          <Botao tom="secundario" tamanho="p" className="mt-3" onClick={aoTentar}>
            Tentar de novo
          </Botao>
        )}
      </Aviso>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────── tabela ───

export function Tabela({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table
        className={clsx(
          'w-full border-collapse text-corpo',
          // A última linha não leva divisória: embaixo dela já vem a borda do
          // cartão, e as duas juntas viravam um fio de 2px mais escuro que
          // todos os outros.
          '[&_tbody_tr:last-child>td]:border-b-0',
          className,
        )}
      >
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  numerico,
}: {
  children?: ReactNode
  className?: string
  numerico?: boolean
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'mv-rotulo sticky top-0 z-10 border-b border-borda bg-superficie-2 px-5 py-2.5',
        numerico ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  numerico,
}: {
  children?: ReactNode
  className?: string
  numerico?: boolean
}) {
  return (
    <td
      className={clsx(
        // px-5 alinha a primeira coluna com o título do cartão; py-2.5 com o
        // corpo de 15/24 fecha a linha em exatos 44px — o alvo de toque.
        'border-b border-borda/60 px-5 py-3 align-middle',
        numerico && 'mv-numero text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Linha({
  children,
  className,
  aoClicar,
}: {
  children: ReactNode
  className?: string
  aoClicar?: () => void
}) {
  return (
    <tr
      onClick={aoClicar}
      // Linha que se clica precisa ser alcançável pelo teclado e precisa dizer
      // que está em foco. O anel vai para dentro (`-outline-offset-2`) porque
      // um anel de 2px por fora da linha é cortado pela borda da tabela.
      tabIndex={aoClicar ? 0 : undefined}
      onKeyDown={
        aoClicar
          ? (e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                aoClicar()
              }
            }
          : undefined
      }
      className={clsx(
        'transition-colors hover:bg-primaria-06',
        aoClicar && 'cursor-pointer focus-visible:-outline-offset-2',
        className,
      )}
    >
      {children}
    </tr>
  )
}

// ────────────────────────────────────────────────────────────── estrutura ───

/** Cabeçalho de página: título, descrição e ações, sempre no mesmo lugar. */
export function CabecalhoDePagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-titulo text-tela leading-tight font-semibold text-texto">{titulo}</h1>
        {descricao && (
          <p className="mt-1 max-w-2xl text-apoio leading-relaxed text-texto-fraco">{descricao}</p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}

/**
 * A barra de totais grudada no rodapé — a da contagem e a da lista de compras.
 *
 * Ela existe como peça porque as duas telas a tinham copiada, com uma diferença
 * cada: uma esquecia a área segura do aparelho, a outra esquecia o rótulo do
 * meio. Grudada no rodapé, ela é o lugar exato onde a barra de gesto do iPhone
 * come o número que a pessoa está conferindo — daí `.mv-segura-b`.
 */
export function BarraDeTotais({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className={clsx(
        'mv-segura-b sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center',
        'justify-between gap-x-6 gap-y-1 border-t border-borda bg-fundo/95 px-4 pt-3',
        'backdrop-blur-md sm:-mx-6 sm:px-6',
      )}
    >
      {children}
    </div>
  )
}

/** Um par rótulo/valor da barra de totais, para os dois lados ficarem iguais. */
export function TotalDaBarra({
  rotulo,
  valor,
  destaque,
  alinharADireita,
}: {
  rotulo: string
  valor: ReactNode
  /** O número que a tela existe para dar: maior, na cor da marca. */
  destaque?: boolean
  alinharADireita?: boolean
}) {
  return (
    <div className={clsx(alinharADireita && 'text-right')}>
      <div className="mv-rotulo">{rotulo}</div>
      <div
        aria-live="polite"
        className={clsx(
          'mv-numero font-semibold',
          destaque ? 'text-secao text-primaria-legivel' : 'text-destaque text-texto',
        )}
      >
        {valor}
      </div>
    </div>
  )
}

/**
 * Diálogo de confirmação.
 *
 * Existe para que toda confirmação do sistema tenha a mesma anatomia: véu,
 * faixa da marca, título, corpo e as ações no rodapé, com o destrutivo à
 * direita. E, principalmente, o mesmo comportamento de foco do `PainelLateral`
 * — Esc fecha, o foco entra no diálogo e volta para quem o abriu. Sem isso,
 * quem confirmou o fechamento da contagem pelo teclado era devolvido ao topo
 * da página.
 */
export function Dialogo({
  titulo,
  descricao,
  aoFechar,
  rodape,
  children,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  aoFechar: () => void
  rodape?: ReactNode
  children?: ReactNode
}) {
  const idDoTitulo = useId()
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const anterior = document.activeElement as HTMLElement | null
    caixa.current?.focus()
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      anterior?.focus?.()
    }
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-50 grid items-end justify-items-center bg-neutro-1000/70 p-0 sm:place-items-center sm:p-4">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0" />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden outline-none',
          'mv-segura-b rounded-t-marca-g border border-borda bg-superficie-1 shadow-alta',
          'sm:rounded-marca-g',
        )}
      >
        <div className="mv-faixa h-0.75 shrink-0" aria-hidden />
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2
              id={idDoTitulo}
              className="font-titulo text-destaque leading-tight font-semibold text-texto"
            >
              {titulo}
            </h2>
            {descricao && (
              <p className="mt-1 text-apoio leading-snug text-texto-fraco">{descricao}</p>
            )}
          </div>
          <Botao tom="fantasma" tamanho="p" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </Botao>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {rodape && (
          <footer className="flex flex-col-reverse gap-2 border-t border-borda px-5 py-4 sm:flex-row sm:justify-end">
            {rodape}
          </footer>
        )}
      </div>
    </div>
  )
}
