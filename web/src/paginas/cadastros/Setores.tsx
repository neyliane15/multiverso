/**
 * Módulo 1.3 · Setores — onde se conta.
 *
 * Irmã de Categorias, e de propósito: mesma tela, mesma lógica. A diferença
 * que importa está no aviso de desativação — setor inativo tira produto da
 * próxima folha de contagem, e isso `avisoDeDesativacao` diz por extenso.
 */
import { useMemo, useState } from 'react'
import { EstadoVazio } from '@/componentes/base'
import { useSessao } from '@/dados/sessao'
import { useProdutos, useSalvarSetor, useSetores } from '@/dados/consultas'
import { TelaDeCadastro } from './TelaDeCadastro'
import { contarUso, type AjusteDeOrdem } from './logicaDeCadastro'

export function Setores(): JSX.Element {
  const { restaurante, podeAdministrar } = useSessao()
  const restauranteId = restaurante?.id ?? ''

  const setores = useSetores(restauranteId)
  const produtos = useProdutos(restauranteId)
  const salvar = useSalvarSetor(restauranteId)
  const [reordenando, setReordenando] = useState(false)

  const usos = useMemo(() => contarUso(produtos.data ?? [], 'setor'), [produtos.data])

  if (!restaurante) {
    return (
      <EstadoVazio titulo="Nenhum restaurante em foco">
        Escolha um restaurante na barra de cima para ver os setores dele.
      </EstadoVazio>
    )
  }

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
      tipo="setor"
      titulo="Setores"
      descricao="Onde se conta: bar, estoque geral, câmara fria, hortifrúti. Um produto pode viver em vários, com unidade e custo próprios em cada um."
      itens={setores.data ?? []}
      usos={usos}
      carregando={setores.isPending}
      erro={setores.isError ? setores.error : null}
      aoTentarDeNovo={() => void setores.refetch()}
      podeEditar={podeAdministrar}
      salvando={salvar.isPending || reordenando}
      erroDoServidor={salvar.error instanceof Error ? salvar.error.message : null}
      aoSalvar={(dados, aoTerminar) => salvar.mutate(dados, { onSuccess: aoTerminar })}
      aoReordenar={reordenar}
    />
  )
}
