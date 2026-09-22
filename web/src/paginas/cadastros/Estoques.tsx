/**
 * Módulo 1.4 · Estoques de setor — onde, dentro do setor.
 *
 * O setor diz quem conta: o bar, a cozinha. O estoque de setor diz a parada
 * física de quem está contando: "Bar / Geladeira 1", "Bar / Prateleira do
 * fundo". Duas geladeiras do mesmo bar são duas paradas, e contar cada uma em
 * separado é o motivo de subdividir.
 *
 * A tela nasce agrupada por setor, e não como uma lista plana de lugares, por
 * um motivo só: "Geladeira 1" sozinha não quer dizer nada. O nome é único
 * dentro do setor justamente porque a cozinha também pode ter a dela.
 */
import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Boxes, Plus } from 'lucide-react'
import {
  Aviso,
  Botao,
  Campo,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Selo,
  plural,
} from '@/componentes/base'
import { useSessao } from '@/dados/sessao'
import { useEstoques, useProdutos, useSalvarEstoque, useSetores } from '@/dados/consultas'
import type { Estoque, Setor } from '@/tipos/banco'
import { contarProdutosPorEstoque } from './logicaDeEstoques'

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function Estoques(): JSX.Element {
  const { restaurante, podeAdministrar } = useSessao()
  const restauranteId = restaurante?.id ?? ''

  const setores = useSetores(restauranteId)
  const estoques = useEstoques(restauranteId)
  const produtos = useProdutos(restauranteId)
  const salvar = useSalvarEstoque(restauranteId)
  const [falha, setFalha] = useState<string | null>(null)

  const usos = useMemo(
    () => contarProdutosPorEstoque(produtos.data ?? []),
    [produtos.data],
  )

  const cabecalho = (
    <CabecalhoDePagina
      titulo="Estoques de setor"
      descricao="Onde, dentro do setor: Bar › Geladeira 1. Um produto pode ficar em mais de um lugar do mesmo setor — e cada lugar vira uma linha própria na folha de contagem."
    />
  )

  if (!restaurante) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio icone={<Boxes />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver os estoques dele.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  if (setores.isPending || estoques.isPending) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={5} />
        </Cartao>
      </>
    )
  }
  if (setores.isError || estoques.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta
            erro={setores.error ?? estoques.error}
            aoTentar={() => {
              void setores.refetch()
              void estoques.refetch()
            }}
          />
        </Cartao>
      </>
    )
  }

  const ativos = (setores.data ?? []).filter((s) => s.ativo)

  return (
    <>
      {cabecalho}

      {falha && (
        <Aviso tom="erro" titulo="Não deu para salvar">
          {falha}
        </Aviso>
      )}

      {ativos.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={<Boxes />} titulo="Nenhum setor ativo">
            O estoque mora dentro de um setor. Cadastre um setor antes — é ele que diz quem
            conta.
          </EstadoVazio>
        </Cartao>
      ) : (
        ativos.map((setor) => (
          <SetorComEstoques
            key={setor.id}
            setor={setor}
            estoques={(estoques.data ?? []).filter((e) => e.setor_id === setor.id)}
            usos={usos}
            podeEditar={podeAdministrar}
            salvando={salvar.isPending}
            aoSalvar={async (dados) => {
              setFalha(null)
              try {
                await salvar.mutateAsync(dados)
                return true
              } catch (erro) {
                setFalha(mensagem(erro))
                return false
              }
            }}
          />
        ))
      )}
    </>
  )
}

function SetorComEstoques({
  setor,
  estoques,
  usos,
  podeEditar,
  salvando,
  aoSalvar,
}: {
  setor: Setor
  estoques: readonly Estoque[]
  usos: ReadonlyMap<string, number>
  podeEditar: boolean
  salvando: boolean
  aoSalvar: (dados: Partial<Estoque> & { id?: string }) => Promise<boolean>
}): JSX.Element {
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')

  const visiveis = [...estoques].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault()
    const nome = novo.trim()
    if (nome === '') return
    const ok = await aoSalvar({ setor_id: setor.id, nome, ordem: visiveis.length + 1 })
    if (ok) setNovo('')
  }

  async function renomear(id: string) {
    const nome = nomeEditado.trim()
    if (nome === '') return
    const ok = await aoSalvar({ id, nome })
    if (ok) setEditando(null)
  }

  return (
    <Cartao
      titulo={<Selo cor={setor.cor}>{setor.nome}</Selo>}
      descricao={
        visiveis.length === 0
          ? 'Sem subdivisão: os produtos deste setor são contados uma vez, pelo setor inteiro.'
          : `${visiveis.length} ${plural(visiveis.length, 'lugar', 'lugares')} dentro deste setor.`
      }
    >
      {visiveis.length > 0 && (
        <ul className="divide-y divide-borda/60">
          {visiveis.map((estoque) => {
            const emUso = usos.get(estoque.id) ?? 0
            return (
              <li key={estoque.id} className="flex items-center gap-3 px-5 py-3">
                {editando === estoque.id ? (
                  <>
                    <Campo
                      value={nomeEditado}
                      autoFocus
                      aria-label={`Novo nome de ${estoque.nome}`}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void renomear(estoque.id)
                        if (e.key === 'Escape') setEditando(null)
                      }}
                    />
                    <Botao tom="primario" tamanho="p" carregando={salvando} onClick={() => void renomear(estoque.id)}>
                      Salvar
                    </Botao>
                    <Botao tom="fantasma" tamanho="p" onClick={() => setEditando(null)}>
                      Cancelar
                    </Botao>
                  </>
                ) : (
                  <>
                    <span
                      className={
                        estoque.ativo
                          ? 'min-w-0 flex-1 truncate text-corpo text-texto'
                          : 'min-w-0 flex-1 truncate text-corpo text-texto-fraco line-through'
                      }
                    >
                      {estoque.nome}
                    </span>
                    <span className="mv-numero shrink-0 text-micro text-texto-fraco">
                      {emUso} {plural(emUso, 'produto', 'produtos')}
                    </span>
                    {podeEditar && (
                      <>
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          onClick={() => {
                            setEditando(estoque.id)
                            setNomeEditado(estoque.nome)
                          }}
                        >
                          Renomear
                        </Botao>
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          carregando={salvando}
                          aria-label={`${estoque.ativo ? 'Arquivar' : 'Reativar'} ${estoque.nome}`}
                          onClick={() => void aoSalvar({ id: estoque.id, ativo: !estoque.ativo })}
                        >
                          {estoque.ativo ? (
                            <Archive className="size-4" aria-hidden />
                          ) : (
                            <ArchiveRestore className="size-4" aria-hidden />
                          )}
                        </Botao>
                      </>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {podeEditar && (
        <form onSubmit={(e) => void adicionar(e)} className="flex items-center gap-2 border-t border-borda px-5 py-4">
          <Campo
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder={`Novo lugar em ${setor.nome} — Geladeira 1, Prateleira do fundo…`}
            aria-label={`Nome do novo estoque em ${setor.nome}`}
          />
          <Botao type="submit" tom="secundario" carregando={salvando} disabled={novo.trim() === ''}>
            <Plus className="size-4" aria-hidden />
            Adicionar
          </Botao>
        </form>
      )}
    </Cartao>
  )
}
