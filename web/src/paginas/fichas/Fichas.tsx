/**
 * Módulo 5 · Fichas técnicas.
 *
 * A pergunta desta tela é uma só: **este prato vale a pena?** Para responder,
 * ela usa os MESMOS produtos da contagem — mesmo id, mesmo nome, mesmo custo —
 * e nunca guarda o custo dentro da ficha. Guardar congelaria o número no dia
 * em que alguém digitou; a ficha guarda a QUANTIDADE, e o preço vem de onde
 * ele é atualizado: da nota de compra.
 *
 * Três coisas que a tela faz questão de mostrar, e não esconder:
 *
 * - **Unidade que não converte.** Compra-se cachaça por garrafa e a receita
 *   usa 60 ML. O item entra marcado, com o campo para dizer quanto cabe na
 *   garrafa ali mesmo — em vez de virar um custo errado que ninguém confere.
 * - **Produto sem custo.** Um insumo a R$ 0,00 derruba o CMV do prato e faz
 *   parecer ótimo o que não foi medido.
 * - **O preço que bateria a meta.** "Acima da meta" sem dizer quanto cobrar é
 *   metade da informação.
 */
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  useApagarFicha,
  useFichas,
  useProdutos,
  useSalvarConteudoDoProduto,
  useSalvarFicha,
  useSalvarItensDaFicha,
} from '@/dados/consultas'
import type { FichaCompleta, ProdutoCompleto } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Campo,
  CampoNumero,
  Carregando,
  Cartao,
  Dialogo,
  ErroDaConsulta,
  EstadoVazio,
  Rotulo,
  Selecao,
  Selo,
  plural,
} from '@/componentes/base'
import { dinheiro, porcentagem, quantidade as formatarQuantidade } from '@/util/formato'
import { PainelLateral } from '../PainelLateral'
import {
  TEXTO_DO_VEREDITO,
  UNIDADES_DA_RECEITA,
  agruparPorGrupo,
  custoDoItem,
  filtrarFichas,
  precoParaAMeta,
  resumoDaFicha,
  vereditoDoCmv,
  type ItemEmEdicao,
  type ProdutoParaFicha,
  type Veredito,
} from './logicaDeFichas'

const TOM_DO_VEREDITO: Record<Veredito, 'sucesso' | 'alerta' | 'erro' | 'neutro'> = {
  dentro: 'sucesso',
  limite: 'alerta',
  acima: 'erro',
  sem_preco: 'neutro',
}

function paraFicha(p: ProdutoCompleto): ProdutoParaFicha {
  return {
    id: p.id,
    nome: p.nome,
    unidade: p.unidade,
    custo_medio: p.custo_medio,
    conteudo_quantidade: p.conteudo_quantidade,
    conteudo_unidade: p.conteudo_unidade,
    categoria_nome: p.categoria_nome,
    categoria_cor: p.categoria_cor,
  }
}

export function Fichas() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Fichas técnicas" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver as fichas.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <FichasDoRestaurante restauranteId={restaurante.id} />
}

function FichasDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const fichas = useFichas(restauranteId)
  const produtos = useProdutos(restauranteId)
  const salvarFicha = useSalvarFicha(restauranteId)
  const salvarItens = useSalvarItensDaFicha(restauranteId)
  const apagar = useApagarFicha(restauranteId)

  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<FichaCompleta | 'nova' | null>(null)
  const [apagando, setApagando] = useState<FichaCompleta | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** Grupos fechados na mão. O que não está aqui, está aberto. */
  const [fechados, setFechados] = useState<ReadonlySet<string>>(new Set())

  const catalogo = useMemo(
    () => new Map((produtos.data ?? []).filter((p) => p.ativo).map((p) => [p.id, paraFicha(p)])),
    [produtos.data],
  )

  const visiveis = useMemo(
    () => filtrarFichas(fichas.data ?? [], busca),
    [fichas.data, busca],
  )
  const grupos = useMemo(() => agruparPorGrupo(visiveis), [visiveis])

  const acimaDaMeta = useMemo(
    () =>
      (fichas.data ?? []).filter(
        (f) => vereditoDoCmv(f.cmv_percentual, f.cmv_alvo) === 'acima',
      ).length,
    [fichas.data],
  )
  const comPendencia = useMemo(
    () => (fichas.data ?? []).filter((f) => f.itens_incompativeis + f.itens_sem_custo > 0).length,
    [fichas.data],
  )

  const alternar = (nome: string) =>
    setFechados((antes) => {
      const novo = new Set(antes)
      if (novo.has(nome)) novo.delete(nome)
      else novo.add(nome)
      return novo
    })

  async function gravar(
    dados: Parameters<typeof salvarFicha.mutateAsync>[0],
    itens: ItemEmEdicao[],
  ): Promise<boolean> {
    setFalha(null)
    setAviso(null)
    try {
      const ficha = await salvarFicha.mutateAsync(dados)
      await salvarItens.mutateAsync({
        fichaId: ficha.id,
        itens: itens.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          unidade: i.unidade,
          perda_percentual: i.perda_percentual,
          observacao: i.observacao ?? null,
        })),
      })
      setAviso(`Ficha de ${ficha.nome} salva com ${itens.length} ${plural(itens.length, 'insumo', 'insumos')}.`)
      setEditando(null)
      return true
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : String(erro))
      return false
    }
  }

  if (fichas.isLoading) return <Carregando />
  if (fichas.isError) return <ErroDaConsulta erro={fichas.error} />

  const total = fichas.data?.length ?? 0

  return (
    <>
      <CabecalhoDePagina
        titulo="Fichas técnicas"
        descricao="A receita de cada item do cardápio, com o custo vindo do catálogo e o CMV do prato calculado."
        acoes={
          <Botao tom="primario" icone={<Plus />} onClick={() => setEditando('nova')}>
            Nova ficha
          </Botao>
        }
      />

      {falha && (
        <Aviso tom="erro" titulo="Não consegui salvar">
          <p className="mt-1">{falha}</p>
        </Aviso>
      )}
      {aviso && (
        <Aviso tom="sucesso" titulo="Pronto">
          <p className="mt-1">{aviso}</p>
        </Aviso>
      )}

      <Cartao className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
              aria-hidden
            />
            <Campo
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar prato ou grupo do cardápio"
              aria-label="Buscar ficha"
              className="pl-9"
            />
          </div>
          <span className="text-apoio text-texto-fraco" role="status">
            {total} {plural(total, 'ficha', 'fichas')}
            {acimaDaMeta > 0 && ` · ${acimaDaMeta} acima da meta`}
            {comPendencia > 0 && ` · ${comPendencia} com pendência de custo`}
          </span>
        </div>
      </Cartao>

      {total === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<ChefHat />}
            titulo="Nenhuma ficha ainda"
            acao={
              <Botao tom="secundario" icone={<Plus />} onClick={() => setEditando('nova')}>
                Criar a primeira
              </Botao>
            }
          >
            A ficha diz quanto de cada produto entra num prato. O custo vem sozinho do catálogo —
            você só precisa dizer as quantidades e o preço de venda.
          </EstadoVazio>
        </Cartao>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => {
            const aberto = !fechados.has(grupo.nome)
            const custoDoGrupo = grupo.fichas.reduce((s, f) => s + f.custo_porcao, 0)
            return (
              <Cartao key={grupo.nome}>
                {/* O cabeçalho do grupo é o botão: clicar fecha o bloco inteiro.
                    Com trinta pratos no cardápio, rolar a lista inteira para
                    achar as sobremesas é o que cansa. */}
                <button
                  type="button"
                  onClick={() => alternar(grupo.nome)}
                  aria-expanded={aberto}
                  className={clsx(
                    'flex min-h-toque w-full items-center gap-3 px-5 py-3.5 text-left',
                    'transition-colors hover:bg-primaria-06',
                    aberto && 'border-b border-borda',
                  )}
                >
                  {aberto ? (
                    <ChevronDown className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                  )}
                  <span className="font-titulo text-destaque font-semibold text-texto">
                    {grupo.nome}
                  </span>
                  <span className="mv-numero ml-auto text-apoio text-texto-fraco">
                    {grupo.fichas.length} {plural(grupo.fichas.length, 'prato', 'pratos')} ·{' '}
                    {dinheiro(custoDoGrupo)} de custo
                  </span>
                </button>

                {aberto && (
                  <ul className="divide-y divide-borda/60">
                    {grupo.fichas.map((ficha) => (
                      <li key={ficha.id}>
                        <LinhaDaFicha ficha={ficha} aoAbrir={() => setEditando(ficha)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            )
          })}
        </div>
      )}

      {editando !== null && (
        <PainelDaFicha
          ficha={editando === 'nova' ? null : editando}
          catalogo={catalogo}
          carregandoCatalogo={produtos.isLoading}
          restauranteId={restauranteId}
          salvando={salvarFicha.isPending || salvarItens.isPending}
          aoFechar={() => setEditando(null)}
          aoSalvar={gravar}
          aoApagar={editando === 'nova' ? undefined : () => setApagando(editando)}
        />
      )}

      {apagando && (
        <Dialogo
          titulo="Apagar esta ficha?"
          aoFechar={() => setApagando(null)}
          rodape={
            <>
              <Botao tom="fantasma" onClick={() => setApagando(null)}>
                Não apagar
              </Botao>
              <Botao
                tom="perigo"
                carregando={apagar.isPending}
                onClick={() => {
                  void apagar.mutateAsync(apagando.id).then(
                    () => {
                      setApagando(null)
                      setEditando(null)
                      setAviso(`Ficha de ${apagando.nome} apagada.`)
                    },
                    (erro: unknown) => setFalha(erro instanceof Error ? erro.message : String(erro)),
                  )
                }}
              >
                Apagar {apagando.nome}
              </Botao>
            </>
          }
        >
          <p className="text-corpo leading-relaxed text-texto-suave">
            A receita de <strong className="text-texto">{apagando.nome}</strong> sai do sistema.
            Nenhum produto do catálogo é afetado — a ficha só aponta para eles.
          </p>
        </Dialogo>
      )}
    </>
  )
}

/* ──────────────────────────────────────────────── a linha de uma ficha ───── */

function LinhaDaFicha({ ficha, aoAbrir }: { ficha: FichaCompleta; aoAbrir: () => void }) {
  const veredito = vereditoDoCmv(ficha.cmv_percentual, ficha.cmv_alvo)
  const pendencias = ficha.itens_incompativeis + ficha.itens_sem_custo
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex min-h-toque w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-primaria-06"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-corpo text-texto">{ficha.nome}</span>
        <span className="mv-numero block truncate text-micro text-texto-fraco">
          {ficha.itens} {plural(ficha.itens, 'insumo', 'insumos')} · rende{' '}
          {formatarQuantidade(ficha.rendimento)} {ficha.unidade_rendimento.toLowerCase()}
          {pendencias > 0 && (
            <span className="text-alerta-texto">
              {' '}
              · {pendencias} {plural(pendencias, 'pendência', 'pendências')} de custo
            </span>
          )}
        </span>
      </span>
      <span className="mv-numero shrink-0 text-right">
        <span className="block text-micro text-texto-fraco">custo/porção</span>
        <span className="block text-corpo text-texto">{dinheiro(ficha.custo_porcao)}</span>
      </span>
      <span className="mv-numero shrink-0 text-right">
        <span className="block text-micro text-texto-fraco">venda</span>
        <span className="block text-corpo text-texto">{dinheiro(ficha.preco_venda)}</span>
      </span>
      <span className="shrink-0">
        <Selo tom={TOM_DO_VEREDITO[veredito]}>
          {ficha.cmv_percentual === null
            ? TEXTO_DO_VEREDITO.sem_preco
            : `CMV ${porcentagem(ficha.cmv_percentual)}`}
        </Selo>
      </span>
    </button>
  )
}

/* ───────────────────────────────────────────────── o painel de edição ────── */

interface CamposDaFicha {
  nome: string
  grupo: string
  rendimento: number
  unidade_rendimento: string
  preco_venda: number
  cmv_alvo: number
  descricao: string
  modo_preparo: string
}

function PainelDaFicha({
  ficha,
  catalogo,
  carregandoCatalogo,
  restauranteId,
  salvando,
  aoFechar,
  aoSalvar,
  aoApagar,
}: {
  ficha: FichaCompleta | null
  catalogo: ReadonlyMap<string, ProdutoParaFicha>
  carregandoCatalogo: boolean
  restauranteId: string
  salvando: boolean
  aoFechar: () => void
  aoSalvar: (
    dados: { id?: string } & Record<string, unknown>,
    itens: ItemEmEdicao[],
  ) => Promise<boolean>
  aoApagar?: () => void
}): JSX.Element {
  const [campos, setCampos] = useState<CamposDaFicha>({
    nome: ficha?.nome ?? '',
    grupo: ficha?.grupo ?? '',
    rendimento: ficha?.rendimento ?? 1,
    unidade_rendimento: ficha?.unidade_rendimento ?? 'PORCAO',
    preco_venda: ficha?.preco_venda ?? 0,
    cmv_alvo: ficha?.cmv_alvo ?? 30,
    descricao: ficha?.descricao ?? '',
    modo_preparo: ficha?.modo_preparo ?? '',
  })
  const [itens, setItens] = useState<ItemEmEdicao[]>(
    () =>
      ficha?.itens_da_ficha.map((i) => ({
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        unidade: i.unidade,
        perda_percentual: i.perda_percentual,
        observacao: i.observacao,
      })) ?? [],
  )
  const [buscaDeProduto, setBuscaDeProduto] = useState('')

  const resumo = useMemo(
    () => resumoDaFicha(itens, catalogo, campos.rendimento, campos.preco_venda),
    [itens, catalogo, campos.rendimento, campos.preco_venda],
  )
  const veredito = vereditoDoCmv(resumo.cmv, campos.cmv_alvo)
  const precoAlvo = precoParaAMeta(resumo.custoPorcao, campos.cmv_alvo)

  const jaEstao = useMemo(() => new Set(itens.map((i) => i.produto_id)), [itens])
  const candidatos = useMemo(() => {
    const termo = buscaDeProduto.trim().toLowerCase()
    if (termo === '') return []
    return [...catalogo.values()]
      .filter((p) => !jaEstao.has(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [buscaDeProduto, catalogo, jaEstao])

  const mudar = <C extends keyof CamposDaFicha>(campo: C, valor: CamposDaFicha[C]) =>
    setCampos((antes) => ({ ...antes, [campo]: valor }))

  const mudarItem = (produtoId: string, mudanca: Partial<ItemEmEdicao>) =>
    setItens((antes) =>
      antes.map((i) => (i.produto_id === produtoId ? { ...i, ...mudanca } : i)),
    )

  const adicionar = (produto: ProdutoParaFicha) => {
    setItens((antes) => [
      ...antes,
      {
        produto_id: produto.id,
        quantidade: 1,
        // A unidade de compra é o palpite certo na maioria das vezes, e é o
        // único que nunca nasce incompatível.
        unidade: produto.unidade,
        perda_percentual: 0,
      },
    ])
    setBuscaDeProduto('')
  }

  const podeSalvar = campos.nome.trim() !== '' && campos.rendimento > 0

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={ficha ? ficha.nome : 'Nova ficha técnica'}
      descricao="O custo de cada insumo vem do catálogo. Aqui você diz a quantidade."
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="mv-numero mr-auto text-apoio" role="status">
            <span className="text-texto-fraco">porção </span>
            <strong className="text-texto">{dinheiro(resumo.custoPorcao)}</strong>
            {resumo.cmv !== null && (
              <>
                <span className="text-texto-fraco"> · CMV </span>
                <strong className="text-texto">{porcentagem(resumo.cmv)}</strong>
              </>
            )}
          </span>
          {aoApagar && (
            <Botao tom="fantasma" icone={<Trash2 />} onClick={aoApagar}>
              Apagar
            </Botao>
          )}
          <Botao tom="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            tom="primario"
            carregando={salvando}
            disabled={!podeSalvar}
            onClick={() => {
              void aoSalvar(
                {
                  ...(ficha ? { id: ficha.id } : {}),
                  nome: campos.nome.trim(),
                  grupo: campos.grupo.trim() === '' ? null : campos.grupo.trim(),
                  rendimento: campos.rendimento,
                  unidade_rendimento: campos.unidade_rendimento,
                  preco_venda: campos.preco_venda,
                  cmv_alvo: campos.cmv_alvo,
                  descricao: campos.descricao.trim() === '' ? null : campos.descricao.trim(),
                  modo_preparo:
                    campos.modo_preparo.trim() === '' ? null : campos.modo_preparo.trim(),
                },
                itens,
              )
            }}
          >
            Salvar ficha
          </Botao>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Rotulo para="ficha-nome">Nome do prato</Rotulo>
            <Campo
              id="ficha-nome"
              className="mt-1.5"
              value={campos.nome}
              onChange={(e) => mudar('nome', e.target.value)}
              placeholder="Picanha na cerveja"
            />
          </div>
          <div>
            <Rotulo para="ficha-grupo">Grupo do cardápio</Rotulo>
            <Campo
              id="ficha-grupo"
              className="mt-1.5"
              value={campos.grupo}
              onChange={(e) => mudar('grupo', e.target.value)}
              placeholder="Pratos, Drinks, Sobremesas…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo para="ficha-rendimento">Rende</Rotulo>
              <CampoNumero
                id="ficha-rendimento"
                className="mt-1.5"
                valor={campos.rendimento}
                aoMudar={(v) => mudar('rendimento', v)}
              />
            </div>
            <div>
              <Rotulo para="ficha-unidade-rendimento">Em</Rotulo>
              <Selecao
                id="ficha-unidade-rendimento"
                className="mt-1.5"
                value={campos.unidade_rendimento}
                onChange={(e) => mudar('unidade_rendimento', e.target.value)}
              >
                <option value="PORCAO">porções</option>
                <option value="UND">unidades</option>
                <option value="KG">quilos</option>
                <option value="L">litros</option>
              </Selecao>
            </div>
          </div>
          <div>
            <Rotulo para="ficha-preco">Preço de venda</Rotulo>
            <CampoNumero
              id="ficha-preco"
              className="mt-1.5"
              valor={campos.preco_venda}
              aoMudar={(v) => mudar('preco_venda', v)}
            />
            <p className="mt-1.5 text-micro text-texto-fraco">Da porção, como está no cardápio.</p>
          </div>
          <div>
            <Rotulo para="ficha-alvo">Meta de CMV (%)</Rotulo>
            <CampoNumero
              id="ficha-alvo"
              className="mt-1.5"
              valor={campos.cmv_alvo}
              aoMudar={(v) => mudar('cmv_alvo', v)}
            />
            <p className="mt-1.5 text-micro text-texto-fraco">
              É a meta da casa para ESTE prato. 30% num prato de cozinha é razoável; num drink, 20%
              já é caro.
            </p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────── os insumos ───── */}
        <section>
          <h3 className="font-titulo text-destaque font-semibold text-texto">Insumos</h3>
          <p className="mt-1 text-apoio leading-relaxed text-texto-fraco">
            Os mesmos produtos da contagem, com o mesmo custo. A quantidade é a{' '}
            <strong className="text-texto-suave">líquida</strong> — a perda de limpeza entra na
            coluna ao lado e o sistema calcula quanto sai do estoque.
          </p>

          {itens.length > 0 && (
            <ul className="mt-3 space-y-2">
              {itens.map((item) => (
                <ItemDaFicha
                  key={item.produto_id}
                  item={item}
                  produto={catalogo.get(item.produto_id)}
                  restauranteId={restauranteId}
                  aoMudar={(mudanca) => mudarItem(item.produto_id, mudanca)}
                  aoTirar={() =>
                    setItens((antes) => antes.filter((i) => i.produto_id !== item.produto_id))
                  }
                />
              ))}
            </ul>
          )}

          <div className="mt-3">
            <Rotulo para="ficha-add">Adicionar insumo</Rotulo>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
                aria-hidden
              />
              <Campo
                id="ficha-add"
                value={buscaDeProduto}
                onChange={(e) => setBuscaDeProduto(e.target.value)}
                placeholder={
                  carregandoCatalogo ? 'Carregando o catálogo…' : 'Buscar insumo do catálogo'
                }
                className="pl-9"
              />
            </div>
            {candidatos.length > 0 && (
              <ul className="mt-2 divide-y divide-borda/60 rounded-marca border border-borda">
                {candidatos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => adicionar(p)}
                      className="flex min-h-toque w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primaria-06"
                    >
                      <span className="min-w-0 flex-1 truncate text-corpo text-texto">{p.nome}</span>
                      <span className="mv-numero shrink-0 text-micro text-texto-fraco">
                        {dinheiro(p.custo_medio)} / {p.unidade}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─────────────────────────────────────────────── o veredito ───── */}
        <section className="rounded-marca border border-borda p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-titulo text-destaque font-semibold text-texto">Vale a pena?</h3>
            <Selo tom={TOM_DO_VEREDITO[veredito]}>{TEXTO_DO_VEREDITO[veredito]}</Selo>
          </div>
          <dl className="mv-numero mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-corpo sm:grid-cols-4">
            <div>
              <dt className="text-micro text-texto-fraco">Custo total</dt>
              <dd className="text-texto">{dinheiro(resumo.custoTotal)}</dd>
            </div>
            <div>
              <dt className="text-micro text-texto-fraco">Custo/porção</dt>
              <dd className="text-texto">{dinheiro(resumo.custoPorcao)}</dd>
            </div>
            <div>
              <dt className="text-micro text-texto-fraco">CMV do prato</dt>
              <dd className="text-texto">
                {resumo.cmv === null ? '—' : porcentagem(resumo.cmv)}
              </dd>
            </div>
            <div>
              <dt className="text-micro text-texto-fraco">Margem</dt>
              <dd className="text-texto">{resumo.margem === null ? '—' : dinheiro(resumo.margem)}</dd>
            </div>
          </dl>

          {veredito === 'acima' && precoAlvo !== null && (
            <p className="mt-3 text-apoio leading-relaxed text-texto-fraco">
              Para bater a meta de {porcentagem(campos.cmv_alvo)}, a porção precisaria sair a{' '}
              <strong className="text-texto">{dinheiro(precoAlvo)}</strong> — ou o custo teria de
              cair. Nem sempre o preço é a saída: às vezes é a porção, ou o fornecedor.
            </p>
          )}
          {(resumo.incompativeis > 0 || resumo.semCusto > 0) && (
            <p className="mt-3 flex items-start gap-2 text-apoio leading-relaxed text-alerta-texto">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Este número está incompleto:{' '}
                {resumo.incompativeis > 0 &&
                  `${resumo.incompativeis} ${plural(resumo.incompativeis, 'insumo', 'insumos')} sem conversão de unidade`}
                {resumo.incompativeis > 0 && resumo.semCusto > 0 && ' e '}
                {resumo.semCusto > 0 &&
                  `${resumo.semCusto} ${plural(resumo.semCusto, 'insumo sem custo', 'insumos sem custo')} no catálogo`}
                .
              </span>
            </p>
          )}
        </section>

        <div>
          <Rotulo para="ficha-preparo">Modo de preparo</Rotulo>
          <textarea
            id="ficha-preparo"
            rows={4}
            value={campos.modo_preparo}
            onChange={(e) => mudar('modo_preparo', e.target.value)}
            placeholder="O passo a passo, para a cozinha repetir igual todo dia."
            className="mt-1.5 w-full rounded-marca border border-borda bg-superficie px-3 py-2 text-corpo text-texto placeholder:text-texto-fraco focus:border-primaria focus:outline-none"
          />
        </div>
      </div>
    </PainelLateral>
  )
}

/* ─────────────────────────────────────────── uma linha de insumo ─────────── */

function ItemDaFicha({
  item,
  produto,
  restauranteId,
  aoMudar,
  aoTirar,
}: {
  item: ItemEmEdicao
  produto: ProdutoParaFicha | undefined
  restauranteId: string
  aoMudar: (mudanca: Partial<ItemEmEdicao>) => void
  aoTirar: () => void
}): JSX.Element {
  const conta = custoDoItem(item, produto)
  const salvarConteudo = useSalvarConteudoDoProduto(restauranteId)
  const [conteudo, setConteudo] = useState(produto?.conteudo_quantidade ?? 0)

  return (
    <li className="rounded-marca border border-borda p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <span className="block truncate text-corpo text-texto">
            {produto?.nome ?? 'Insumo fora do catálogo'}
          </span>
          <span className="mv-numero block text-micro text-texto-fraco">
            {produto ? `${dinheiro(produto.custo_medio)} / ${produto.unidade}` : 'sem custo'}
          </span>
        </div>
        <div className="w-24">
          <Rotulo>Quantidade</Rotulo>
          <CampoNumero
            className="mt-1 w-24"
            valor={item.quantidade}
            aoMudar={(v) => aoMudar({ quantidade: v })}
            aria-label={`Quantidade de ${produto?.nome ?? 'insumo'}`}
          />
        </div>
        <div className="w-24">
          <Rotulo>Unidade</Rotulo>
          <Selecao
            className="mt-1 w-24"
            value={item.unidade}
            onChange={(e) => aoMudar({ unidade: e.target.value })}
            aria-label={`Unidade de ${produto?.nome ?? 'insumo'}`}
          >
            {[...new Set([item.unidade, ...UNIDADES_DA_RECEITA])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Selecao>
        </div>
        <div className="w-20">
          <Rotulo>Perda %</Rotulo>
          <CampoNumero
            className="mt-1 w-20"
            valor={item.perda_percentual}
            aoMudar={(v) => aoMudar({ perda_percentual: Math.min(v, 99) })}
            aria-label={`Perda de ${produto?.nome ?? 'insumo'}`}
          />
        </div>
        <div className="mv-numero w-24 text-right">
          <span className="block text-micro text-texto-fraco">custo</span>
          <span className="block text-corpo text-texto">
            {conta.custo === null ? '—' : dinheiro(conta.custo)}
          </span>
        </div>
        <Botao
          tom="fantasma"
          tamanho="p"
          onClick={aoTirar}
          aria-label={`Tirar ${produto?.nome ?? 'insumo'} da ficha`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Botao>
      </div>

      {item.perda_percentual > 0 && !conta.incompativel && (
        <p className="mv-numero mt-2 text-micro text-texto-fraco">
          Sai do estoque: {formatarQuantidade(conta.bruto)} {item.unidade} (com {item.perda_percentual}% de
          perda)
        </p>
      )}

      {/* A pendência que aparece em toda ficha de bar, resolvida sem sair daqui. */}
      {conta.incompativel && produto && (
        <div className="mt-3 rounded-marca-p border border-alerta-borda bg-alerta-fundo p-3">
          <p className="flex items-start gap-2 text-apoio leading-relaxed text-alerta-texto">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{item.unidade}</strong> não se converte em <strong>{produto.unidade}</strong>,
              que é como este produto é comprado. Diga quanto cabe em 1 {produto.unidade} e a conta
              passa a valer para todas as fichas que usarem {produto.nome}.
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <span className="text-apoio text-texto-suave">1 {produto.unidade} =</span>
            <CampoNumero
              className="w-28"
              valor={conteudo}
              aoMudar={setConteudo}
              aria-label={`Conteúdo de 1 ${produto.unidade} de ${produto.nome}`}
            />
            <span className="text-apoio text-texto-suave">{item.unidade}</span>
            <Botao
              tom="secundario"
              tamanho="p"
              carregando={salvarConteudo.isPending}
              disabled={conteudo <= 0}
              onClick={() => {
                void salvarConteudo.mutateAsync({
                  id: produto.id,
                  conteudo_quantidade: conteudo,
                  conteudo_unidade: item.unidade,
                })
              }}
            >
              Salvar
            </Botao>
          </div>
        </div>
      )}
    </li>
  )
}
