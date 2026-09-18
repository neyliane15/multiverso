/**
 * Módulo 1.2 · Categorias — como o estoque se agrupa no CMV.
 *
 * A tela é montagem: toda a lógica está em `logicaDeCadastro.ts` e todo o
 * desenho em `TelaDeCadastro.tsx`, que Setores usa igual.
 */
import { useMemo, useRef, useState } from 'react'
import { EstadoVazio } from '@/componentes/base'
import { useSessao } from '@/dados/sessao'
import { useCategorias, useProdutos, useSalvarCategoria } from '@/dados/consultas'
import { TelaDeCadastro } from './TelaDeCadastro'
import { contarUso, type AjusteDeOrdem } from './logicaDeCadastro'

export function Categorias(): JSX.Element {
  const { restaurante, podeAdministrar } = useSessao()
  const restauranteId = restaurante?.id ?? ''

  const categorias = useCategorias(restauranteId)
  const produtos = useProdutos(restauranteId)
  const salvar = useSalvarCategoria(restauranteId)
  const [reordenando, setReordenando] = useState(false)
  const [erroDaOrdem, setErroDaOrdem] = useState<string | null>(null)
  /** Lotes de reordenação em voo. Evita desligar o "salvando" cedo demais. */
  const lotesEmVoo = useRef(0)

  const usos = useMemo(
    () => contarUso(produtos.data ?? [], 'categoria'),
    [produtos.data],
  )

  if (!restaurante) {
    return (
      <EstadoVazio titulo="Nenhum restaurante em foco">
        Escolha um restaurante na barra de cima para ver as categorias dele.
      </EstadoVazio>
    )
  }

  /**
   * Reordenar são vários updates independentes. Promise.allSettled no lugar de
   * um contador porque o contador era por chamada: duas reordenações seguidas
   * se sobrepunham e a primeira a terminar já desligava o "salvando", com
   * gravações da segunda ainda em voo. E `onSettled` não distingue sucesso de
   * falha — um update recusado deixava a lista na ordem antiga sem aviso nenhum,
   * porque o erro do formulário só aparece dentro do painel, que está fechado.
   */
  async function reordenar(ajustes: AjusteDeOrdem[]) {
    if (ajustes.length === 0) return
    lotesEmVoo.current += 1
    setReordenando(true)
    setErroDaOrdem(null)
    try {
      const saidas = await Promise.allSettled(ajustes.map((a) => salvar.mutateAsync(a)))
      const falhas = saidas.filter((r) => r.status === 'rejected')
      const primeira = falhas[0]
      if (primeira && primeira.status === 'rejected') {
        const motivo =
          primeira.reason instanceof Error ? primeira.reason.message : String(primeira.reason)
        setErroDaOrdem(
          falhas.length === ajustes.length
            ? `A nova ordem não foi salva: ${motivo}`
            : `A nova ordem foi salva pela metade (${falhas.length} de ${ajustes.length} falharam): ${motivo}`,
        )
      }
    } finally {
      lotesEmVoo.current -= 1
      if (lotesEmVoo.current === 0) setReordenando(false)
    }
  }

  return (
    <TelaDeCadastro
      tipo="categoria"
      titulo="Categorias"
      descricao="Como o estoque se agrupa no CMV: proteínas, mercearia, bebidas. Cada produto tem uma só."
      itens={categorias.data ?? []}
      usos={usos}
      carregando={categorias.isPending}
      erro={categorias.isError ? categorias.error : null}
      aoTentarDeNovo={() => void categorias.refetch()}
      podeEditar={podeAdministrar}
      salvando={salvar.isPending || reordenando}
      erroDoServidor={salvar.error instanceof Error ? salvar.error.message : null}
      erroDaLista={erroDaOrdem}
      aoSalvar={(dados, aoTerminar) => salvar.mutate(dados, { onSuccess: aoTerminar })}
      aoReordenar={reordenar}
    />
  )
}
