/**
 * Módulo 3.2 · lista de compras.
 *
 * `mv_gerar_lista_compras` monta a folha com o cadastro inteiro, já sugerindo
 * a quantidade que falta para o estoque mínimo. O trabalho da tela é o resto:
 * ser usável **dentro do mercado, com uma mão só**.
 *
 * Daí as decisões:
 * - alvo de toque grande no que se usa andando (o botão de "comprado" ocupa os
 *   44px inteiros e fica na borda, onde o polegar alcança);
 * - o item comprado **sai da frente** — ele vai para a lista de conferência no
 *   fim, que fica fechada por padrão;
 * - o total estimado sobe a cada quantidade digitada e nunca sai da tela.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, ListPlus, Search, ShoppingCart, Store, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  chaves,
  useCategorias,
  useEncerrarLista,
  useGerarListaDeCompras,
  useItensDaLista,
  useLancarItemDaLista,
  useListasDeCompras,
  useProdutosPorCategoria,
} from '@/dados/consultas'
import {
  Aviso,
  BarraDeTotais,
  Botao,
  CabecalhoDePagina,
  Campo,
  CampoNumero,
  Carregando,
  Cartao,
  Chip,
  ErroDaConsulta,
  EstadoVazio,
  Ponto,
  Rotulo,
  Selecao,
  Selo,
  TotalDaBarra,
  plural,
} from '@/componentes/base'
import type { ListaCompras } from '@/tipos/banco'
import { data as formatarData, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import {
  agruparFolha,
  coberturaDaFolha,
  produtosDaEscolha,
  quantidadeDoItem,
  resumirFolha,
  type ItemDeFolha,
} from './logica'
import { marcarItemComprado } from './gravar'

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function ListaDeCompras() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Lista de compras" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para montar a lista.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <ListaDoRestaurante restauranteId={restaurante.id} />
}

/** Rota `/compras/lista/nova`: a folha de gerar, mesmo havendo folha aberta. */
const ROTA_NOVA = 'nova'

function ListaDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const { listaId } = useParams<{ listaId: string }>()
  const listas = useListasDeCompras(restauranteId)

  // Sem id na rota: a lista mais recente que ainda está em andamento. Uma lista
  // concluída não deve reabrir sozinha quando alguém clica no menu.
  const emAndamento = listas.data?.find((l) => l.status === 'rascunho' || l.status === 'enviada')
  const pedindoNova = listaId === ROTA_NOVA
  const alvo = pedindoNova ? undefined : (listaId ?? emAndamento?.id)

  if (listas.isLoading) {
    return (
      <>
        <CabecalhoDePagina titulo="Lista de compras" />
        <Cartao>
          <Carregando linhas={5} />
        </Cartao>
      </>
    )
  }
  if (listas.isError) {
    return (
      <>
        <CabecalhoDePagina titulo="Lista de compras" />
        <Cartao>
          <ErroDaConsulta erro={listas.error} aoTentar={() => void listas.refetch()} />
        </Cartao>
      </>
    )
  }

  if (!alvo) {
    return (
      <GerarLista
        restauranteId={restauranteId}
        aberta={pedindoNova ? (emAndamento ?? null) : null}
      />
    )
  }

  const lista = listas.data?.find((l) => l.id === alvo)
  return (
    <Folha
      key={alvo}
      restauranteId={restauranteId}
      listaId={alvo}
      nome={lista?.nome ?? 'Lista de compras'}
      referencia={lista?.referencia ?? null}
      status={lista?.status ?? 'rascunho'}
      listas={listas.data ?? []}
    />
  )
}

/* ─────────────────────────────────────────────────────────── gerar folha ── */

function GerarLista({
  restauranteId,
  aberta,
}: {
  restauranteId: string
  /** A folha em andamento, quando se chegou aqui por "Nova folha". */
  aberta: ListaCompras | null
}) {
  const navegar = useNavigate()
  const categorias = useCategorias(restauranteId)
  const porCategoria = useProdutosPorCategoria(restauranteId)
  const gerar = useGerarListaDeCompras(restauranteId)

  const [nome, setNome] = useState('')
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)

  const ativas = (categorias.data ?? []).filter((c) => c.ativo)
  const contagem = porCategoria.data
  const noCadastro = contagem ? [...contagem.values()].reduce((a, b) => a + b, 0) : null
  const naFolha = contagem === undefined ? null : produtosDaEscolha(contagem, escolhidas)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    try {
      const id = await gerar.mutateAsync({
        nome: nome.trim() === '' ? undefined : nome.trim(),
        categorias: escolhidas.size === 0 ? undefined : [...escolhidas],
      })
      navegar(`/compras/lista/${id}`)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Lista de compras"
        descricao="O cadastro inteiro virando folha de pedido, com a quantidade que falta para o estoque mínimo."
      />

      <Cartao>
        <EstadoVazio
          icone={<ShoppingCart />}
          titulo={aberta ? `"${aberta.nome}" continua aberta` : 'Nenhuma lista em aberto'}
        >
          A folha nasce com todos os produtos ativos e já sugere quanto pedir de cada um,
          comparando o estoque mínimo com a última contagem fechada.
          {aberta && (
            <Botao
              tom="fantasma"
              tamanho="p"
              className="mt-3"
              onClick={() => navegar(`/compras/lista/${aberta.id}`)}
            >
              Voltar para ela
            </Botao>
          )}
        </EstadoVazio>
      </Cartao>

      <Cartao titulo="Gerar lista" descricao="Tudo, ou só algumas categorias.">
        <form onSubmit={(e) => void enviar(e)} className="space-y-5 p-5">
          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <div className="space-y-1.5">
            <Rotulo para="nome-lista">Nome (opcional)</Rotulo>
            <Campo
              id="nome-lista"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Pedido da semana"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mv-rotulo mb-2">Categorias</legend>
            {categorias.isLoading && <Carregando linhas={2} />}
            {categorias.isError && <ErroDaConsulta erro={categorias.error} />}
            <div className="flex flex-wrap gap-2">
              {ativas.map((categoria) => {
                const marcada = escolhidas.has(categoria.id)
                return (
                  <Chip
                    key={categoria.id}
                    marcado={marcada}
                    aoAlternar={() =>
                      setEscolhidas((atual) => {
                        const novo = new Set(atual)
                        if (novo.has(categoria.id)) novo.delete(categoria.id)
                        else novo.add(categoria.id)
                        return novo
                      })
                    }
                  >
                    <Ponto cor={categoria.cor} />
                    {categoria.nome}
                    {contagem && (
                      <span className="mv-numero text-micro text-texto-fraco">
                        {contagem.get(categoria.id) ?? 0}
                      </span>
                    )}
                  </Chip>
                )
              })}
            </div>
            <p className="text-apoio text-texto-fraco" role="status">
              {escolhidas.size === 0
                ? noCadastro === null
                  ? 'Nenhuma marcada: a folha vai sair com o cadastro inteiro.'
                  : `Nenhuma marcada: a folha vai sair com o cadastro inteiro — ${noCadastro} ${plural(noCadastro, 'insumo', 'insumos')}.`
                : `${escolhidas.size} ${plural(escolhidas.size, 'categoria marcada', 'categorias marcadas')}` +
                  (naFolha === null
                    ? '. Só o que estiver nelas entra na folha.'
                    : `: a folha vai sair com ${naFolha} ${plural(naFolha, 'insumo', 'insumos')}, e não com ${noCadastro ?? 0}.`)}
            </p>
            {escolhidas.size > 0 && (
              <Botao tom="fantasma" tamanho="p" onClick={() => setEscolhidas(new Set())}>
                Desmarcar todas e levar o cadastro inteiro
              </Botao>
            )}
          </fieldset>

          <Botao type="submit" tom="primario" tamanho="g" carregando={gerar.isPending}>
            Gerar lista
          </Botao>
        </form>
      </Cartao>
    </>
  )
}

const ESTADO_DA_LISTA: Record<ListaCompras['status'], string> = {
  rascunho: '',
  enviada: ' · enviada',
  concluida: ' · concluída',
  cancelada: ' · cancelada',
}

/**
 * Nome da folha no seletor.
 *
 * Duas folhas geradas no mesmo dia nascem com o mesmo nome padrão
 * (`Lista · DD/MM/AAAA`), e um seletor com três opções idênticas não serve
 * para escolher nada. Quando o nome se repete, a hora entra para desempatar.
 */
function rotuloDaLista(lista: ListaCompras, todas: readonly ListaCompras[]): string {
  const repetido = todas.filter((l) => l.nome === lista.nome).length > 1
  const hora = repetido
    ? ` · ${new Date(lista.criado_em).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
  return `${lista.nome}${hora}${ESTADO_DA_LISTA[lista.status]}`
}

/* ────────────────────────────────────────────────────────────── a folha ─── */

function Folha({
  restauranteId,
  listaId,
  nome,
  referencia,
  status,
  listas,
}: {
  restauranteId: string
  listaId: string
  nome: string
  referencia: string | null
  status: ListaCompras['status']
  listas: readonly ListaCompras[]
}) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const itens = useItensDaLista(listaId)
  const categorias = useCategorias(restauranteId)
  const porCategoria = useProdutosPorCategoria(restauranteId)
  const lancar = useLancarItemDaLista(listaId)
  const encerrar = useEncerrarLista(restauranteId)

  const [busca, setBusca] = useState('')
  const [mostrarComprados, setMostrarComprados] = useState(false)
  const [rascunhos, setRascunhos] = useState<ReadonlyMap<string, number>>(new Map())
  /** Gravações em voo, por item — ver a mesma decisão em contagem/Contagem.tsx. */
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(new Set())
  const [reversoes, setReversoes] = useState<ReadonlyMap<string, number>>(new Map())
  const [falha, setFalha] = useState<string | null>(null)

  const lista = useMemo(() => itens.data ?? [], [itens.data])

  const grupos = useMemo(
    () => agruparFolha(lista, categorias.data ?? [], { busca }, rascunhos),
    [lista, categorias.data, busca, rascunhos],
  )
  const comprados = useMemo(() => lista.filter((i) => i.comprado), [lista])
  const resumo = useMemo(() => resumirFolha(lista, rascunhos), [lista, rascunhos])

  /**
   * O rascunho sai quando o servidor passa a devolver o mesmo número. Mantê-lo
   * depois disso faria o valor local sombrear o do servidor para sempre.
   * Quem digitou de novo durante a gravação fica protegido pela própria
   * comparação: o rascunho mais novo não bate com o servidor e permanece.
   */
  useEffect(() => {
    if (rascunhos.size === 0) return
    const sobrando = new Map(rascunhos)
    let mudou = false
    for (const item of lista) {
      if (sobrando.get(item.id) === item.quantidade && !emVoo.has(item.id)) {
        sobrando.delete(item.id)
        mudou = true
      }
    }
    if (mudou) setRascunhos(sobrando)
  }, [lista, rascunhos, emVoo])
  const visiveis = grupos.reduce((soma, g) => soma + g.itens.length, 0)

  /** Categorias fechadas na mão. O que não está aqui, está aberto. */
  const [fechados, setFechados] = useState<ReadonlySet<string>>(new Set())
  const alternarGrupo = (id: string) =>
    setFechados((antes) => {
      const novo = new Set(antes)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  async function lancarQuantidade(item: ItemDeFolha, valor: number) {
    const anterior = quantidadeDoItem(item, rascunhos)
    if (valor === anterior) return
    setFalha(null)
    setRascunhos((atual) => new Map(atual).set(item.id, valor))
    setEmVoo((atual) => new Set(atual).add(item.id))
    try {
      await lancar.mutateAsync({ itemId: item.id, quantidade: valor })
    } catch (erro) {
      setRascunhos((atual) => {
        const novo = new Map(atual)
        novo.delete(item.id)
        return novo
      })
      setReversoes((atual) => new Map(atual).set(item.id, (atual.get(item.id) ?? 0) + 1))
      setFalha(`${item.produto?.nome ?? 'Item'}: ${mensagemDoErro(erro)} — o valor voltou atrás.`)
    } finally {
      setEmVoo((atual) => {
        const novo = new Set(atual)
        novo.delete(item.id)
        return novo
      })
    }
  }

  async function alternarComprado(item: ItemDeFolha) {
    setFalha(null)
    try {
      await marcarItemComprado(item.id, !item.comprado)
      await qc.invalidateQueries({ queryKey: chaves.listaItens(listaId) })
    } catch (erro) {
      setFalha(`${item.produto?.nome ?? 'Item'}: ${mensagemDoErro(erro)}`)
    }
  }

  const noCadastro = porCategoria.data
    ? [...porCategoria.data.values()].reduce((a, b) => a + b, 0)
    : null
  /**
   * A folha pode ter nascido com só algumas categorias marcadas. Quem abre a
   * tela dias depois não vê essa escolha em lugar nenhum e conclui que o
   * cadastro sumiu — foi exatamente o que aconteceu com a folha só de APARAS.
   * Enquanto faltar produto, a tela diz quanto falta e oferece a saída.
   */
  const cobertura = coberturaDaFolha(resumo.itens, itens.isLoading ? null : noCadastro)
  const emAberto = status === 'rascunho' || status === 'enviada'

  async function encerrarFolha() {
    setFalha(null)
    try {
      await encerrar.mutateAsync({ listaId, status: 'concluida' })
      navegar('/compras/lista')
    } catch (erro) {
      setFalha(`Não consegui concluir a folha: ${mensagemDoErro(erro)}`)
    }
  }

  const cabecalho = (
    <CabecalhoDePagina
      titulo={nome}
      descricao={
        referencia
          ? `Gerada em ${formatarData(referencia)} · ${resumo.itens} insumos na folha`
          : `${resumo.itens} insumos na folha`
      }
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          {listas.length > 1 && (
            <Selecao
              value={listaId}
              aria-label="Trocar de folha"
              onChange={(e) => navegar(`/compras/lista/${e.target.value}`)}
              className="w-full sm:w-64"
            >
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {rotuloDaLista(l, listas)}
                </option>
              ))}
            </Selecao>
          )}
          <Botao tom="fantasma" onClick={() => navegar(`/compras/lista/${ROTA_NOVA}`)}>
            <ListPlus className="size-4" aria-hidden />
            Nova folha
          </Botao>
          {emAberto && (
            <Botao tom="fantasma" carregando={encerrar.isPending} onClick={() => void encerrarFolha()}>
              Concluir
            </Botao>
          )}
          <Botao tom="fantasma" onClick={() => navegar('/compras/notas')}>
            Lançar nota
          </Botao>
        </div>
      }
    />
  )

  if (itens.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (itens.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta erro={itens.error} aoTentar={() => void itens.refetch()} />
        </Cartao>
      </>
    )
  }

  return (
    <>
      {cabecalho}

      {falha && (
        <Aviso tom="erro" titulo="Não deu para salvar">
          {falha}
        </Aviso>
      )}

      {cobertura.parcial && (
        <Aviso tom="alerta" titulo="Esta folha não tem o cadastro inteiro">
          <p>
            Ela nasceu com {resumo.itens} {plural(resumo.itens, 'insumo', 'insumos')} de{' '}
            {noCadastro} — foi gerada com algumas categorias marcadas. O resto do estoque
            continua no cadastro; só não entrou nesta folha.
          </p>
          <Botao
            tom="primario"
            tamanho="p"
            className="mt-3"
            onClick={() => navegar(`/compras/lista/${ROTA_NOVA}`)}
          >
            Gerar folha com o cadastro inteiro
          </Botao>
        </Aviso>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
          aria-hidden
        />
        <Campo
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar insumo na folha"
          aria-label="Buscar insumo na folha"
          className="pl-9"
        />
      </div>

      {lista.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={<ShoppingCart />} titulo="Folha vazia">
            Esta lista nasceu sem produto nenhum. Confira se há produtos ativos nas categorias
            escolhidas.
          </EstadoVazio>
        </Cartao>
      ) : visiveis === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Check />}
            titulo={busca === '' ? 'Tudo comprado' : 'Nada encontrado'}
          >
            {busca === ''
              ? 'Todos os itens da folha já foram marcados como comprados.'
              : 'Nenhum insumo da folha bate com a busca.'}
          </EstadoVazio>
        </Cartao>
      ) : (
        grupos.map((grupo) => {
          const chave = grupo.categoriaId ?? 'sem-categoria'
          const abertoAqui = !fechados.has(chave)
          return (
          <Cartao key={chave}>
            {/* O cabeçalho é o botão: numa folha com vinte categorias, fechar
                o que já foi comprado é o que deixa a lista caber na tela do
                celular dentro do mercado. */}
            <button
              type="button"
              onClick={() => alternarGrupo(chave)}
              aria-expanded={abertoAqui}
              className={clsx(
                'flex min-h-toque w-full items-center justify-between gap-3 px-5 py-4 text-left',
                'transition-colors hover:bg-primaria-06',
                abertoAqui && 'border-b border-borda',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {abertoAqui ? (
                  <ChevronDown className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                )}
                <Selo cor={grupo.cor ?? undefined}>{grupo.nome}</Selo>
              </span>
              <span className="mv-numero shrink-0 text-apoio text-texto-fraco">
                {!abertoAqui && (
                  <span className="mr-2">
                    {grupo.itens.length} {plural(grupo.itens.length, 'item', 'itens')}
                  </span>
                )}
                {dinheiro(grupo.total)}
              </span>
            </button>
            {abertoAqui && (
            <ul className="divide-y divide-borda/60">
              {grupo.itens.map((item) => {
                const emVigor = quantidadeDoItem(item, rascunhos)
                return (
                  <li key={item.id} className="flex items-center gap-2 py-1 pl-1 pr-5">
                    <button
                      type="button"
                      onClick={() => void alternarComprado(item)}
                      aria-pressed={item.comprado}
                      aria-label={`Marcar ${item.produto?.nome ?? 'item'} como comprado`}
                      className={clsx(
                        'mv-toque grid shrink-0 place-items-center rounded-marca-p border transition-colors',
                        'border-borda bg-superficie-2 text-texto-fraco',
                        'hover:border-borda-forte hover:bg-primaria-06 hover:text-primaria-legivel',
                        'active:bg-primaria-16',
                      )}
                    >
                      <Check className="size-5" aria-hidden />
                    </button>

                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`pedido-${item.id}`}
                        className="block truncate text-corpo text-texto"
                      >
                        {item.produto?.nome ?? 'Insumo removido do cadastro'}
                      </label>
                      <span className="mv-numero text-micro text-texto-fraco">
                        {item.unidade} · {dinheiro(item.custo_estimado)} estimado
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <CampoNumero
                        key={`${item.id}:${reversoes.get(item.id) ?? 0}`}
                        id={`pedido-${item.id}`}
                        valor={emVigor}
                        aoMudar={(valor) => void lancarQuantidade(item, valor)}
                        aria-label={`Quantidade a comprar de ${item.produto?.nome ?? 'produto'} em ${item.unidade}`}
                        className="w-24"
                      />
                      <span className="mv-numero mt-0.5 block text-micro text-texto-suave">
                        {dinheiro(emVigor * item.custo_estimado)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            )}
          </Cartao>
          )
        })
      )}

      {comprados.length > 0 && (
        <Cartao
          titulo={`Já comprados (${comprados.length})`}
          descricao="Saíram da folha para não atrapalhar. Ficam aqui para conferência."
          acao={
            <Botao
              tom="fantasma"
              tamanho="p"
              aria-expanded={mostrarComprados}
              onClick={() => setMostrarComprados((v) => !v)}
            >
              {mostrarComprados ? 'Esconder' : 'Mostrar'}
            </Botao>
          }
        >
          {mostrarComprados && (
            <ul className="divide-y divide-borda/60">
              {comprados.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <Check className="size-4 shrink-0 text-sucesso-texto" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-corpo text-texto-suave line-through">
                    {item.produto?.nome ?? 'Produto'}
                  </span>
                  <span className="mv-numero text-apoio text-texto-fraco">
                    {formatarQuantidade(quantidadeDoItem(item, rascunhos))} {item.unidade}
                  </span>
                  <Botao
                    tom="fantasma"
                    tamanho="p"
                    aria-label={`Desmarcar ${item.produto?.nome ?? 'item'}`}
                    onClick={() => void alternarComprado(item)}
                  >
                    <Undo2 className="size-4" aria-hidden />
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      <BarraDeTotais>
        <TotalDaBarra
          rotulo="A comprar"
          valor={
            <>
              {formatarQuantidade(resumo.aComprar)}
              <span className="text-apoio text-texto-fraco"> de {resumo.itens}</span>
            </>
          }
        />
        <TotalDaBarra
          rotulo="Total estimado"
          valor={dinheiro(resumo.totalEstimado)}
          destaque
          alinharADireita
        />
      </BarraDeTotais>
    </>
  )
}
