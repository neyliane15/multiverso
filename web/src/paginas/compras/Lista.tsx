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
import { Check, Search, ShoppingCart, Store, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  chaves,
  useCategorias,
  useGerarListaDeCompras,
  useItensDaLista,
  useLancarItemDaLista,
  useListasDeCompras,
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
  Selo,
  TotalDaBarra,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import {
  agruparFolha,
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

function ListaDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const { listaId } = useParams<{ listaId: string }>()
  const listas = useListasDeCompras(restauranteId)

  // Sem id na rota: a lista mais recente que ainda está em andamento. Uma lista
  // concluída não deve reabrir sozinha quando alguém clica no menu.
  const emAndamento = listas.data?.find((l) => l.status === 'rascunho' || l.status === 'enviada')
  const alvo = listaId ?? emAndamento?.id

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

  if (!alvo) return <GerarLista restauranteId={restauranteId} />

  const lista = listas.data?.find((l) => l.id === alvo)
  return (
    <Folha
      key={alvo}
      restauranteId={restauranteId}
      listaId={alvo}
      nome={lista?.nome ?? 'Lista de compras'}
      referencia={lista?.referencia ?? null}
    />
  )
}

/* ─────────────────────────────────────────────────────────── gerar folha ── */

function GerarLista({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const categorias = useCategorias(restauranteId)
  const gerar = useGerarListaDeCompras(restauranteId)

  const [nome, setNome] = useState('')
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)

  const ativas = (categorias.data ?? []).filter((c) => c.ativo)

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
        <EstadoVazio icone={<ShoppingCart />} titulo="Nenhuma lista em aberto">
          A folha nasce com todos os produtos ativos e já sugere quanto pedir de cada um,
          comparando o estoque mínimo com a última contagem fechada.
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
                  </Chip>
                )
              })}
            </div>
            <p className="text-apoio text-texto-fraco" role="status">
              {escolhidas.size === 0
                ? 'Nenhuma marcada: a folha vai sair com o cadastro inteiro.'
                : `${escolhidas.size} ${plural(escolhidas.size, 'categoria', 'categorias')} na folha.`}
            </p>
          </fieldset>

          <Botao type="submit" tom="primario" tamanho="g" carregando={gerar.isPending}>
            Gerar lista
          </Botao>
        </form>
      </Cartao>
    </>
  )
}

/* ────────────────────────────────────────────────────────────── a folha ─── */

function Folha({
  restauranteId,
  listaId,
  nome,
  referencia,
}: {
  restauranteId: string
  listaId: string
  nome: string
  referencia: string | null
}) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const itens = useItensDaLista(listaId)
  const categorias = useCategorias(restauranteId)
  const lancar = useLancarItemDaLista(listaId)

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

  const cabecalho = (
    <CabecalhoDePagina
      titulo={nome}
      descricao={
        referencia
          ? `Gerada em ${formatarData(referencia)} · ${resumo.itens} produtos na folha`
          : `${resumo.itens} produtos na folha`
      }
      acoes={
        <Botao tom="fantasma" onClick={() => navegar('/compras/notas')}>
          Lançar nota
        </Botao>
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

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
          aria-hidden
        />
        <Campo
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto na folha"
          aria-label="Buscar produto na folha"
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
              : 'Nenhum produto da folha bate com a busca.'}
          </EstadoVazio>
        </Cartao>
      ) : (
        grupos.map((grupo) => (
          <Cartao key={grupo.categoriaId ?? 'sem-categoria'}>
            <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-4">
              <Selo cor={grupo.cor ?? undefined}>{grupo.nome}</Selo>
              <span className="mv-numero text-apoio text-texto-fraco">
                {dinheiro(grupo.total)}
              </span>
            </header>
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
                        {item.produto?.nome ?? 'Produto removido do cadastro'}
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
          </Cartao>
        ))
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
