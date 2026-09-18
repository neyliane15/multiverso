/**
 * Módulo 1.2 · Categorias — como o estoque se agrupa no CMV.
 *
 * A tela é montagem: toda a lógica está em `logicaDeCadastro.ts` e todo o
 * desenho em `TelaDeCadastro.tsx`, que Setores usa igual.
 */
import { useMemo, useState } from 'react'
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

  /** Reordenar são vários updates; a tela só volta ao normal quando todos voltam. */
  function reordenar(ajustes: AjusteDeOrdem[]) {
    if (ajustes.length === 0) return
    setReordenando(true)
    let restantes = ajustes.length
    for (const ajuste of ajustes) {
      salvar.mutate(ajuste, {
        onSettled: () => {
          restantes -= 1
          if (restantes === 0) setReordenando(false)
        },
      })
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
      aoSalvar={(dados, aoTerminar) => salvar.mutate(dados, { onSuccess: aoTerminar })}
      aoReordenar={reordenar}
    />
  )
}
