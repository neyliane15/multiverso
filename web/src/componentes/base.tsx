/**
 * Primitivas da interface.
 *
 * Nenhuma delas escreve cor de marca em hexadecimal — tudo sai dos tokens que
 * `aplicarMarca` reescreve no documento. Trocar de restaurante repinta estas
 * peças sem recompilar nada.
 */
import { forwardRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

// ───────────────────────────────────────────────────────────────── botão ────

type Tom = 'primario' | 'secundario' | 'fantasma' | 'perigo'
type Tamanho = 'p' | 'm' | 'g'

const TOM: Record<Tom, string> = {
  primario:
    'bg-primaria text-sobre-primaria hover:brightness-110 active:brightness-95 shadow-sm',
  secundario:
    'bg-superficie-2 text-texto border border-borda hover:border-borda-forte hover:bg-superficie-3',
  fantasma: 'text-texto-suave hover:text-texto hover:bg-primaria/10',
  perigo: 'bg-erro-suave text-erro-texto border border-erro-borda hover:bg-erro/20',
}

const TAMANHO: Record<Tamanho, string> = {
  p: 'h-9 px-3 text-[13px] gap-1.5',
  m: 'h-toque px-4 text-sm gap-2',
  g: 'h-12 px-6 text-[15px] gap-2.5',
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
  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={clsx(
        'inline-flex items-center justify-center rounded-marca-p font-medium',
        'transition-[filter,background-color,border-color] duration-150',
        'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        TOM[tom],
        TAMANHO[tamanho],
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
        'rounded-marca border border-borda bg-superficie-1',
        'shadow-[0_1px_2px_rgba(0,0,0,.28)]',
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            {titulo && (
              <h2 className="font-titulo text-[15px] font-semibold text-texto">{titulo}</h2>
            )}
            {descricao && (
              <p className="mt-0.5 text-[13px] leading-snug text-texto-fraco">{descricao}</p>
            )}
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </header>
      )}
      {children}
    </section>
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
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.08em] text-texto-fraco">
        {icone}
        {rotulo}
      </div>
      <div className={clsx('mv-numero mt-2 text-[28px] leading-none font-semibold', cor)}>
        {valor}
      </div>
      {apoio && <div className="mt-2 text-[12.5px] leading-snug text-texto-fraco">{apoio}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────── campos ──

export function Rotulo({ children, para }: { children: ReactNode; para?: string }) {
  return (
    <label
      htmlFor={para}
      className="block text-[12px] font-semibold uppercase tracking-[.06em] text-texto-fraco"
    >
      {children}
    </label>
  )
}

const CAMPO_BASE =
  'w-full rounded-marca-p border border-borda bg-superficie-2 px-3 text-sm text-texto ' +
  'placeholder:text-texto-fraco/70 transition-colors ' +
  'hover:border-borda-forte focus:border-primaria focus:outline-none ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export const Campo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Campo({ className, ...resto }, ref) {
    return <input ref={ref} className={clsx(CAMPO_BASE, 'h-toque', className)} {...resto} />
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
      className={clsx(CAMPO_BASE, 'mv-numero h-toque text-right tabular-nums', className)}
      {...resto}
    />
  )
})

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Selecao({ className, children, ...resto }, ref) {
    return (
      <select ref={ref} className={clsx(CAMPO_BASE, 'h-toque pr-8', className)} {...resto}>
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
    marca: 'bg-primaria/16 text-primaria-legivel border-primaria/30',
    sucesso: 'bg-sucesso-suave text-sucesso-texto border-sucesso-borda',
    alerta: 'bg-alerta-suave text-alerta-texto border-alerta-borda',
    erro: 'bg-erro-suave text-erro-texto border-erro-borda',
    info: 'bg-info-suave text-info-texto border-info-borda',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-[11.5px] font-medium whitespace-nowrap',
        !cor && tons[tom],
        cor && 'border-transparent',
      )}
      style={cor ? { backgroundColor: `${cor}26`, color: cor } : undefined}
    >
      {children}
    </span>
  )
}

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
  return (
    <div
      role={tom === 'erro' ? 'alert' : 'status'}
      className={clsx('rounded-marca-p border px-4 py-3 text-[13px] leading-relaxed', tons[tom])}
    >
      {titulo && <div className="font-semibold">{titulo}</div>}
      {children}
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
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icone && <div className="text-texto-fraco/60">{icone}</div>}
      <h3 className="font-titulo text-[15px] font-semibold text-texto">{titulo}</h3>
      {children && <p className="max-w-sm text-[13px] leading-relaxed text-texto-fraco">{children}</p>}
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
      <table className={clsx('w-full border-collapse text-sm', className)}>{children}</table>
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
        'sticky top-0 z-10 border-b border-borda bg-superficie-1 px-4 py-2.5',
        'text-[11px] font-semibold uppercase tracking-[.07em] text-texto-fraco',
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
        'border-b border-borda/60 px-4 py-2.5 align-middle',
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
      className={clsx(
        'transition-colors hover:bg-primaria/6',
        aoClicar && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  )
}

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
        <h1 className="font-titulo text-[22px] leading-tight font-semibold text-texto">{titulo}</h1>
        {descricao && (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-texto-fraco">
            {descricao}
          </p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}
