/**
 * O painel que entra pela direita para editar um registro.
 *
 * Não existe modal em `componentes/base.tsx`, e esta é a única peça de
 * estrutura que os cadastros precisavam além das primitivas — então ela mora
 * aqui, junto das telas que a usam, e não vira uma segunda biblioteca.
 *
 * Por que painel e não diálogo centralizado: o formulário de produto é alto
 * (um bloco por setor) e a lista atrás dele é a referência de quem está
 * editando. No celular ele ocupa a tela inteira, porque metade de um
 * formulário não serve para ninguém.
 */
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Botao } from '@/componentes/base'

export interface PropsDoPainelLateral {
  aberto: boolean
  titulo: string
  descricao?: ReactNode
  aoFechar: () => void
  /** Rodapé fixo: é onde ficam Salvar e Cancelar, sempre alcançáveis. */
  rodape?: ReactNode
  largura?: 'media' | 'larga'
  children: ReactNode
}

export function PainelLateral({
  aberto,
  titulo,
  descricao,
  aoFechar,
  rodape,
  largura = 'media',
  children,
}: PropsDoPainelLateral): JSX.Element | null {
  const idDoTitulo = useId()
  const caixa = useRef<HTMLDivElement>(null)

  // Esc fecha, e o foco entra no painel: quem abriu com o teclado continua
  // com o teclado. Sem isto o foco ficaria na linha da tabela, atrás do véu.
  useEffect(() => {
    if (!aberto) return
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
  }, [aberto, aoFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar o painel"
        onClick={aoFechar}
        className="absolute inset-0 bg-neutro-1000/60"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        tabIndex={-1}
        className={[
          'relative flex h-dvh w-full flex-col border-l border-borda bg-superficie shadow-alta outline-none',
          largura === 'larga' ? 'sm:max-w-[680px]' : 'sm:max-w-[520px]',
        ].join(' ')}
      >
        <div className="mv-faixa h-0.75 shrink-0" aria-hidden />
        <header className="flex items-start gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={idDoTitulo} className="font-titulo text-destaque font-semibold text-texto">
              {titulo}
            </h2>
            {descricao && (
              <div className="mt-1 text-apoio leading-relaxed text-texto-fraco">{descricao}</div>
            )}
          </div>
          <Botao tom="fantasma" tamanho="p" onClick={aoFechar} aria-label="Fechar">
            <X className="size-5" aria-hidden />
          </Botao>
        </header>

        <div className="mv-entra min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {/* O rodapé é onde ficam Salvar e Cancelar, e no celular ele encosta na
            barra de gesto do aparelho — daí a área segura. */}
        {rodape && (
          <footer className="mv-segura-b flex flex-wrap items-center justify-end gap-2 border-t border-borda px-5 pt-4 [--mv-folga-b:1rem]">
            {rodape}
          </footer>
        )}
      </div>
    </div>
  )
}
