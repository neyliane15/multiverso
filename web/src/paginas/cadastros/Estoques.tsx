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
import { Archive, ArchiveRestore, Boxes, Package, Plus, Save, Search } from 'lucide-react'
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
import {
  useEstoques,
  useProdutos,
  useProdutosDoEstoque,
  useSalvarEstoque,
  useSetores,
} from '@/dados/consultas'
import type { Estoque, ProdutoCompleto, Setor } from '@/tipos/banco'
import { PainelLateral } from '../PainelLateral'
import {
  contarProdutosPorEstoque,
  diferencaDeMarcacao,
  filtrarProdutosDoSetor,
  produtosParaOEstoque,
} from './logicaDeEstoques'

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
  const vincular = useProdutosDoEstoque(restauranteId)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** O lugar cujo painel de produtos está aberto. */
  const [escolhendo, setEscolhendo] = useState<{ setor: Setor; estoque: Estoque } | null>(null)

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

      {aviso && (
        <Aviso tom="sucesso" titulo="Produtos vinculados">
          {aviso}
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
            aoEscolherProdutos={(estoque) => setEscolhendo({ setor, estoque })}
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

      {escolhendo && (
        <EscolherProdutos
          key={escolhendo.estoque.id}
          setor={escolhendo.setor}
          estoque={escolhendo.estoque}
          produtos={produtos.data ?? []}
          salvando={vincular.isPending}
          aoFechar={() => setEscolhendo(null)}
          aoSalvar={async (ids) => {
            setFalha(null)
            setAviso(null)
            try {
              const r = await vincular.mutateAsync({
                estoqueId: escolhendo.estoque.id,
                produtos: ids,
              })
              const partes = [
                r.adicionados > 0
                  ? `${r.adicionados} ${plural(r.adicionados, 'produto entrou', 'produtos entraram')}`
                  : null,
                r.removidos > 0
                  ? `${r.removidos} ${plural(r.removidos, 'saiu', 'saíram')}`
                  : null,
              ].filter(Boolean)
              setAviso(
                `${escolhendo.estoque.nome}: ${partes.join(' e ')}. ` +
                  'A próxima folha de contagem já nasce assim.',
              )
              setEscolhendo(null)
            } catch (erro) {
              setFalha(mensagem(erro))
            }
          }}
        />
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
  aoEscolherProdutos,
}: {
  setor: Setor
  estoques: readonly Estoque[]
  usos: ReadonlyMap<string, number>
  podeEditar: boolean
  salvando: boolean
  aoSalvar: (dados: Partial<Estoque> & { id?: string }) => Promise<boolean>
  aoEscolherProdutos: (estoque: Estoque) => void
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
                        {/* Antes do renomear: encher o lugar é o que se faz
                            com ele, e trocar o nome é o que quase nunca se
                            faz. */}
                        <Botao
                          tom="secundario"
                          tamanho="p"
                          onClick={() => aoEscolherProdutos(estoque)}
                          icone={<Package className="size-4" aria-hidden />}
                        >
                          Produtos
                        </Botao>
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

/* ──────────────────────────── escolher produtos para o lugar ───────────── */

/**
 * Enche o lugar com os produtos que o setor já tem.
 *
 * Sem esta tela, pôr os 455 produtos da Cozinha na Câmara fria custaria 455
 * painéis abertos um a um — e o recurso de estoque viraria enfeite para quem
 * já tem catálogo. A lista é só do SETOR porque o banco recusa o resto, e
 * oferecer o que o banco recusa é prometer o que não se cumpre.
 */
function EscolherProdutos({
  setor,
  estoque,
  produtos,
  salvando,
  aoSalvar,
  aoFechar,
}: {
  setor: Setor
  estoque: Estoque
  produtos: readonly ProdutoCompleto[]
  salvando: boolean
  aoSalvar: (ids: string[]) => void
  aoFechar: () => void
}): JSX.Element {
  const lista = useMemo(
    () => produtosParaOEstoque(produtos, setor.id, estoque.id),
    [produtos, setor.id, estoque.id],
  )
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(lista.filter((p) => p.dentro).map((p) => p.id)),
  )
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => filtrarProdutosDoSetor(lista, busca), [lista, busca])
  const { entram, saem } = diferencaDeMarcacao(lista, marcados)
  const nadaMudou = entram === 0 && saem === 0

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  /** Marca ou desmarca só o que a busca deixou à vista — nunca a lista toda. */
  function todosOsVisiveis(dentro: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual)
      for (const p of visiveis) {
        if (dentro) novo.add(p.id)
        else novo.delete(p.id)
      }
      return novo
    })
  }

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={`${setor.nome} › ${estoque.nome}`}
      descricao="Marque o que fica guardado aqui. Cada marca vira uma linha própria na folha de contagem."
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="mr-auto text-apoio text-texto-fraco" role="status">
            {nadaMudou
              ? `${marcados.size} ${plural(marcados.size, 'produto', 'produtos')} neste lugar`
              : [
                  entram > 0 ? `${entram} a mais` : null,
                  saem > 0 ? `${saem} a menos` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
          </span>
          <Botao tom="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            tom="primario"
            carregando={salvando}
            disabled={nadaMudou}
            onClick={() => aoSalvar([...marcados])}
            icone={<Save className="size-4" aria-hidden />}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {lista.length === 0 ? (
          <Aviso tom="alerta" titulo="Nenhum produto neste setor">
            Um produto só pode ficar num lugar do setor em que ele já existe. Vincule produtos a{' '}
            {setor.nome} no cadastro de Produtos e volte aqui.
          </Aviso>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
                  aria-hidden
                />
                <Campo
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={`Buscar entre os ${lista.length} produtos de ${setor.nome}`}
                  aria-label="Buscar produto"
                  className="pl-9"
                />
              </div>
              <Botao tom="secundario" tamanho="p" onClick={() => todosOsVisiveis(true)}>
                Marcar {busca === '' ? 'todos' : 'os encontrados'}
              </Botao>
              <Botao tom="fantasma" tamanho="p" onClick={() => todosOsVisiveis(false)}>
                Desmarcar
              </Botao>
            </div>

            {visiveis.length === 0 ? (
              <p className="text-apoio text-texto-fraco">Nenhum produto bate com a busca.</p>
            ) : (
              <ul className="divide-y divide-borda/60 rounded-marca border border-borda">
                {visiveis.map((produto) => (
                  <li key={produto.id}>
                    <label className="flex min-h-toque cursor-pointer items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[var(--mv-primaria)]"
                        checked={marcados.has(produto.id)}
                        onChange={() => alternar(produto.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-corpo text-texto">{produto.nome}</span>
                        {produto.tambemEm.length > 0 && (
                          /* Sem este aviso, marcar aqui cria uma segunda
                             contagem do mesmo produto sem ninguém perceber. */
                          <span className="block truncate text-micro text-texto-fraco">
                            também em {produto.tambemEm.join(', ')}
                          </span>
                        )}
                      </span>
                      {produto.categoriaNome && (
                        <Selo cor={produto.categoriaCor ?? undefined}>{produto.categoriaNome}</Selo>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </PainelLateral>
  )
}
