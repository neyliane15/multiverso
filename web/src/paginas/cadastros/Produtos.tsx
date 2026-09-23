/**
 * Módulo 1.1 · Produtos — a tela mais densa do sistema.
 *
 * O primeiro cliente tem 852 produtos. Duas decisões saem daí:
 *
 * 1. A busca roda em `useDeferredValue`. Digitar continua instantâneo porque o
 *    React pinta a letra primeiro e refaz a lista depois, e o índice de busca
 *    é montado uma vez por catálogo — não 852 normalizações por tecla.
 * 2. A tabela é virtualizada à mão, com janela e espaçadores. Sem dependência
 *    nova: são vinte linhas de conta. 852 <tr> no DOM engasgam a rolagem em
 *    celular, que é onde esta tela mais é aberta.
 *
 * No celular a tabela vira cartão. Nada de rolagem horizontal para ler o custo.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  CabecalhoDePagina,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Selecao,
  Selo,
  Th,
  Td,
  Linha,
} from '@/componentes/base'
import { useSessao } from '@/dados/sessao'
import {
  useArquivarProduto,
  useCategorias,
  useProdutos,
  useSalvarProduto,
  useEstoques,
  useSetores,
} from '@/dados/consultas'
import { dinheiro, quantidade } from '@/util/formato'
import type { ProdutoCompleto } from '@/tipos/banco'
import { FormularioDeProduto } from './FormularioDeProduto'
import {
  FILTRO_INICIAL,
  ORDEM_INICIAL,
  alternarOrdem,
  criarIndiceDeBusca,
  faixaDeCusto,
  filtrarProdutos,
  janelaDeLinhas,
  lugaresDoProduto,
  ordenarProdutos,
  unidadesDoProduto,
  type ColunaDeProdutos,
  type FiltroDeProdutos,
} from './logicaDeProdutos'

/* ========================================================================== */
/* Virtualização                                                              */
/* ========================================================================== */

const ALTURA_DA_LINHA = 48
const ALTURA_DO_CARTAO = 118
/** Linhas extras acima e abaixo da janela: rolagem rápida não mostra buraco. */
const FOLGA = 6

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 768px)')
    const aoMudar = () => setLarga(consulta.matches)
    aoMudar()
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])
  return larga
}

/* ========================================================================== */
/* Cabeçalho ordenável                                                        */
/* ========================================================================== */

function ThOrdenavel({
  coluna,
  atual,
  aoOrdenar,
  children,
  numerico,
  className,
}: {
  coluna: ColunaDeProdutos
  atual: { coluna: ColunaDeProdutos; direcao: 'crescente' | 'decrescente' }
  aoOrdenar: (coluna: ColunaDeProdutos) => void
  children: React.ReactNode
  numerico?: boolean
  className?: string
}): JSX.Element {
  const ativa = atual.coluna === coluna
  const Icone = !ativa ? ArrowUpDown : atual.direcao === 'crescente' ? ArrowUp : ArrowDown
  return (
    <Th numerico={numerico} className={className}>
      <button
        type="button"
        onClick={() => aoOrdenar(coluna)}
        aria-label={`Ordenar por ${String(children)}`}
        className={[
          'inline-flex items-center gap-1.5 rounded-marca-p py-1',
          numerico ? 'flex-row-reverse' : '',
          ativa ? 'text-primaria-legivel' : 'hover:text-texto',
        ].join(' ')}
      >
        {children}
        <Icone className="size-3.5" aria-hidden />
      </button>
    </Th>
  )
}

/* ========================================================================== */
/* Célula de setores                                                          */
/* ========================================================================== */

/**
 * Mostra dois setores e resume o resto. A linha tem altura fixa por causa da
 * janela de rolagem — quebrar em várias linhas desalinharia tudo —, e o título
 * completo fica no `title` para quem precisar do detalhe sem abrir o produto.
 */
function Setores({ produto }: { produto: ProdutoCompleto }): JSX.Element {
  if (produto.setores.length === 0) {
    return (
      <span className="text-apoio text-alerta-texto" title="Produto sem setor não entra na contagem">
        sem setor
      </span>
    )
  }
  const lugares = lugaresDoProduto(produto)
  const visiveis = lugares.slice(0, 2)
  const resto = lugares.length - visiveis.length
  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap"
      title={produto.setores
        .map((s) => {
          const onde = (s.estoques ?? []).map((e) => e.nome).join(', ')
          return `${s.setor_nome}${onde === '' ? '' : ` › ${onde}`}: ${dinheiro(s.custo)}/${s.unidade}`
        })
        .join(' · ')}
    >
      {visiveis.map((lugar) => (
        <Selo key={lugar.setorId} cor={lugar.setorCor}>
          {lugar.setorNome}
          {/* O número de lugares, quando há mais de um. Sem ele, um produto
              guardado em três geladeiras da cozinha fica idêntico a um contado
              uma vez lá — e são três linhas na folha contra uma. */}
          {lugar.estoques.length > 1 && (
            <span className="mv-numero opacity-70">·{lugar.estoques.length}</span>
          )}
        </Selo>
      ))}
      {resto > 0 && <span className="mv-numero text-micro text-texto-fraco">+{resto}</span>}
    </span>
  )
}

function Custo({ produto }: { produto: ProdutoCompleto }): JSX.Element {
  const faixa = faixaDeCusto(produto)
  if (!faixa.divergente) return <>{dinheiro(faixa.minimo)}</>
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title="Este produto tem custo ou unidade diferente em cada setor"
    >
      {dinheiro(faixa.minimo)}
      <span className="text-micro font-semibold text-acento">a {dinheiro(faixa.maximo)}</span>
    </span>
  )
}

/* ========================================================================== */
/* Tela                                                                       */
/* ========================================================================== */

export function Produtos(): JSX.Element {
  const { restaurante, podeAdministrar } = useSessao()
  const restauranteId = restaurante?.id ?? ''

  const produtos = useProdutos(restauranteId)
  const categorias = useCategorias(restauranteId)
  const setores = useSetores(restauranteId)
  const estoques = useEstoques(restauranteId)
  const salvar = useSalvarProduto(restauranteId)
  const arquivar = useArquivarProduto(restauranteId)

  const [filtro, setFiltro] = useState<FiltroDeProdutos>(FILTRO_INICIAL)
  const [ordem, setOrdem] = useState(ORDEM_INICIAL)
  const [editando, setEditando] = useState<{ produto: ProdutoCompleto | null } | null>(null)

  // A busca é diferida: a tecla aparece no campo no mesmo quadro, e a lista de
  // 852 linhas refaz o filtro no quadro seguinte, sem travar a digitação.
  const buscaDiferida = useDeferredValue(filtro.busca)
  const filtrando = buscaDiferida !== filtro.busca

  const lista = useMemo(() => produtos.data ?? [], [produtos.data])
  const indice = useMemo(() => criarIndiceDeBusca(lista), [lista])

  const visiveis = useMemo(
    () => ordenarProdutos(filtrarProdutos(lista, { ...filtro, busca: buscaDiferida }, indice), ordem),
    [lista, filtro, buscaDiferida, indice, ordem],
  )

  const ativos = useMemo(() => lista.filter((p) => p.ativo).length, [lista])

  /* ------------------------------------------------------- janela ------- */
  const telaLarga = useTelaLarga()
  const alturaDaLinha = telaLarga ? ALTURA_DA_LINHA : ALTURA_DO_CARTAO
  const caixa = useRef<HTMLDivElement | null>(null)
  const observador = useRef<ResizeObserver | null>(null)
  const [topo, setTopo] = useState(0)
  const [altura, setAltura] = useState(640)

  // Ref de callback, e não useEffect: o contêiner só existe depois que a
  // consulta volta, e um efeito com [] rodaria antes dele nascer — a janela
  // ficaria travada na altura chutada.
  const medirCaixa = useCallback((elemento: HTMLDivElement | null) => {
    observador.current?.disconnect()
    caixa.current = elemento
    if (!elemento) return
    const obs = new ResizeObserver(() => setAltura(elemento.clientHeight))
    obs.observe(elemento)
    observador.current = obs
    setAltura(elemento.clientHeight)
  }, [])

  // Mudou o filtro ou a ordem: a lista é outra, e continuar na altura antiga
  // deixaria a pessoa olhando para o meio de uma lista que ela não pediu.
  useEffect(() => {
    caixa.current?.scrollTo({ top: 0 })
    setTopo(0)
  }, [filtro.categoriaId, filtro.setorId, filtro.situacao, buscaDiferida, ordem])

  const { primeira, ultima, espacoAcima, espacoAbaixo } = janelaDeLinhas(
    visiveis.length,
    alturaDaLinha,
    topo,
    altura,
    FOLGA,
  )
  const janela = visiveis.slice(primeira, ultima)

  const aoRolar = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setTopo(e.currentTarget.scrollTop)
  }, [])

  /* ------------------------------------------------------- ações -------- */
  const fechar = useCallback(() => {
    setEditando(null)
    salvar.reset()
  }, [salvar])

  const temFiltro =
    filtro.busca !== '' ||
    filtro.categoriaId !== null ||
    filtro.setorId !== null ||
    filtro.situacao !== 'ativos'

  if (!restaurante) {
    return (
      <EstadoVazio titulo="Nenhum restaurante em foco">
        Escolha um restaurante na barra de cima para ver o catálogo dele.
      </EstadoVazio>
    )
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Produtos"
        descricao="O catálogo. Um produto tem uma categoria e vive em um ou mais setores — cada setor com a própria unidade e o próprio custo."
        acoes={
          podeAdministrar && (
            <Botao
              tom="primario"
              icone={<Plus className="size-4" aria-hidden />}
              onClick={() => setEditando({ produto: null })}
            >
              Novo produto
            </Botao>
          )
        }
      />

      <Cartao>
        {/* ────────────────────────────────────────────────── filtros ──── */}
        <div className="grid gap-3 border-b border-borda px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
              aria-hidden
            />
            <Campo
              type="search"
              className="pl-9"
              placeholder="Buscar por nome, código, categoria…"
              aria-label="Buscar produto"
              value={filtro.busca}
              onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
            />
          </div>

          <Selecao
            aria-label="Filtrar por categoria"
            value={filtro.categoriaId ?? ''}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, categoriaId: e.target.value === '' ? null : e.target.value }))
            }
          >
            <option value="">Todas as categorias</option>
            {(categorias.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>

          <Selecao
            aria-label="Filtrar por setor"
            value={filtro.setorId ?? ''}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, setorId: e.target.value === '' ? null : e.target.value }))
            }
          >
            <option value="">Todos os setores</option>
            {(setores.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>

          <Selecao
            aria-label="Mostrar produtos ativos ou arquivados"
            value={filtro.situacao}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, situacao: e.target.value as FiltroDeProdutos['situacao'] }))
            }
          >
            <option value="ativos">Só ativos</option>
            <option value="arquivados">Só arquivados</option>
            <option value="todos">Ativos e arquivados</option>
          </Selecao>
        </div>

        {/* ─────────────────────────────────────────────────── resumo ──── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-5 py-3">
          <p role="status" className="text-apoio text-texto-fraco">
            <span className="mv-numero text-texto">{quantidade(visiveis.length)}</span>{' '}
            {visiveis.length === 1 ? 'produto' : 'produtos'} na tela
            {visiveis.length !== lista.length && (
              <>
                {' '}
                de <span className="mv-numero">{quantidade(lista.length)}</span> no catálogo
              </>
            )}
            {filtro.situacao === 'ativos' && ativos !== lista.length && (
              <>
                {' '}
                · <span className="mv-numero">{quantidade(lista.length - ativos)}</span> arquivados
              </>
            )}
            {filtrando && ' · filtrando…'}
          </p>
          {temFiltro && (
            <Botao
              tom="fantasma"
              tamanho="p"
              icone={<SlidersHorizontal className="size-4" aria-hidden />}
              onClick={() => setFiltro(FILTRO_INICIAL)}
            >
              Limpar filtros
            </Botao>
          )}
        </div>

        {/* ──────────────────────────────────────────────────── lista ──── */}
        {produtos.isPending ? (
          <Carregando linhas={8} />
        ) : produtos.isError ? (
          <ErroDaConsulta erro={produtos.error} aoTentar={() => void produtos.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio
            icone={<Package />}
            titulo="O catálogo está vazio"
            acao={
              podeAdministrar && (
                <Botao tom="primario" onClick={() => setEditando({ produto: null })}>
                  Cadastrar o primeiro produto
                </Botao>
              )
            }
          >
            Cadastre os produtos com a categoria e os setores em que cada um é contado. É esse
            cadastro que vira a folha de contagem e a lista de compras.
          </EstadoVazio>
        ) : visiveis.length === 0 ? (
          <EstadoVazio
            icone={<Search />}
            titulo="Nenhum produto com esses filtros"
            acao={
              <Botao tom="secundario" onClick={() => setFiltro(FILTRO_INICIAL)}>
                Limpar filtros
              </Botao>
            }
          >
            A busca ignora acento e caixa: digitar “tilapia” acha “FILÉ DE TILÁPIA”.
          </EstadoVazio>
        ) : (
          <div
            ref={medirCaixa}
            onScroll={aoRolar}
            className="max-h-[min(68vh,720px)] overflow-auto"
            style={{ height: Math.min(visiveis.length * alturaDaLinha + 48, 720) }}
          >
            {/* Tabela no desktop. O <table> é montado aqui, e não pelo
                componente Tabela, porque o cabeçalho grudado depende de este
                div ser o único contêiner de rolagem da tabela. */}
            {telaLarga ? (
              <table className="w-full border-collapse text-corpo [&_tbody_tr:last-child>td]:border-b-0">
                <thead>
                  <tr>
                    <ThOrdenavel coluna="nome" atual={ordem} aoOrdenar={(c) => setOrdem(alternarOrdem(ordem, c))}>
                      Produto
                    </ThOrdenavel>
                    <ThOrdenavel coluna="categoria" atual={ordem} aoOrdenar={(c) => setOrdem(alternarOrdem(ordem, c))}>
                      Categoria
                    </ThOrdenavel>
                    <ThOrdenavel coluna="setores" atual={ordem} aoOrdenar={(c) => setOrdem(alternarOrdem(ordem, c))}>
                      Setores
                    </ThOrdenavel>
                    <ThOrdenavel coluna="unidade" atual={ordem} aoOrdenar={(c) => setOrdem(alternarOrdem(ordem, c))}>
                      Unidade
                    </ThOrdenavel>
                    <ThOrdenavel
                      coluna="custo"
                      atual={ordem}
                      aoOrdenar={(c) => setOrdem(alternarOrdem(ordem, c))}
                      numerico
                    >
                      Custo
                    </ThOrdenavel>
                  </tr>
                </thead>
                <tbody>
                  {espacoAcima > 0 && (
                    <tr aria-hidden style={{ height: espacoAcima }}>
                      <td colSpan={5} />
                    </tr>
                  )}
                  {janela.map((p) => (
                    <Linha
                      key={p.id}
                      aoClicar={() => setEditando({ produto: p })}
                      /* A altura da linha é fixa porque a janela de rolagem
                         conta em pixels: uma linha que cresce desalinha os
                         espaçadores e a lista passa a “pular”. Por isso tudo
                         nesta célula cabe numa linha só. */
                      className={['h-12', p.ativo ? '' : 'opacity-60'].join(' ')}
                    >
                      <Td className="max-w-[24rem]">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className="truncate font-medium text-texto"
                            title={p.perecivel ? `${p.nome} · perecível` : p.nome}
                          >
                            {p.nome}
                          </span>
                          {p.codigo && (
                            <span className="mv-numero shrink-0 text-micro text-texto-fraco">
                              {p.codigo}
                            </span>
                          )}
                          {p.perecivel && (
                            <span className="shrink-0 text-micro text-texto-fraco">perecível</span>
                          )}
                          {!p.ativo && <Selo tom="neutro">arquivado</Selo>}
                        </span>
                      </Td>
                      <Td>
                        {p.categoria_nome ? (
                          <Selo cor={p.categoria_cor ?? undefined}>{p.categoria_nome}</Selo>
                        ) : (
                          <span className="text-apoio text-texto-fraco">sem categoria</span>
                        )}
                      </Td>
                      <Td>
                        <Setores produto={p} />
                      </Td>
                      <Td>
                        <span className="mv-numero text-apoio">{unidadesDoProduto(p).join(' · ')}</span>
                      </Td>
                      <Td numerico>
                        <Custo produto={p} />
                      </Td>
                    </Linha>
                  ))}
                  {espacoAbaixo > 0 && (
                    <tr aria-hidden style={{ height: espacoAbaixo }}>
                      <td colSpan={5} />
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* No celular a mesma janela vira lista de cartões: nada de
                 rolagem horizontal para achar o custo. */
              <ul className="divide-y divide-borda/60">
                {espacoAcima > 0 && <li aria-hidden style={{ height: espacoAcima }} />}
                {janela.map((p) => {
                  const faixa = faixaDeCusto(p)
                  return (
                    <li key={p.id} className="overflow-hidden" style={{ height: ALTURA_DO_CARTAO }}>
                      <button
                        type="button"
                        onClick={() => setEditando({ produto: p })}
                        className={[
                          'flex h-full w-full flex-col justify-center gap-1.5 px-5 text-left',
                          p.ativo ? '' : 'opacity-60',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-texto">{p.nome}</span>
                          {!p.ativo && <Selo tom="neutro">arquivado</Selo>}
                        </span>
                        <span className="flex items-center gap-1.5 overflow-hidden">
                          {p.categoria_nome && (
                            <Selo cor={p.categoria_cor ?? undefined}>{p.categoria_nome}</Selo>
                          )}
                          <Setores produto={p} />
                        </span>
                        <span className="mv-numero flex items-baseline gap-2 text-apoio text-texto-suave">
                          {dinheiro(faixa.minimo)}
                          {faixa.divergente && (
                            <span className="text-micro text-acento">a {dinheiro(faixa.maximo)}</span>
                          )}
                          <span className="text-micro text-texto-fraco">
                            / {unidadesDoProduto(p).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
                {espacoAbaixo > 0 && <li aria-hidden style={{ height: espacoAbaixo }} />}
              </ul>
            )}
          </div>
        )}
      </Cartao>

      <Aviso tom="info" titulo="Produto não se apaga, se arquiva">
        Um produto que já entrou em contagem fechada faz parte do histórico e do CMV daquele período.
        Arquivar tira ele das próximas folhas de contagem e das listas de compra, sem reescrever nada
        do que já aconteceu.
      </Aviso>

      {editando && (
        <FormularioDeProduto
          key={editando.produto?.id ?? 'novo'}
          produto={editando.produto}
          categorias={categorias.data ?? []}
          setores={setores.data ?? []}
          estoques={estoques.data ?? []}
          produtos={lista}
          podeEditar={podeAdministrar}
          salvando={salvar.isPending || arquivar.isPending}
          erroDoServidor={salvar.error instanceof Error ? salvar.error.message : null}
          aoSalvar={(entrada) => salvar.mutate(entrada, { onSuccess: fechar })}
          aoArquivar={(ativo) => {
            const id = editando.produto?.id
            if (id) arquivar.mutate({ id, ativo }, { onSuccess: fechar })
          }}
          aoFechar={fechar}
        />
      )}
    </>
  )
}
