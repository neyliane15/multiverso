/**
 * Módulo 2.1 · a folha de contagem.
 *
 * Quem usa esta tela está **de pé, no estoque, com o celular na mão**, muitas
 * vezes de luva e com pressa. Isso decide tudo o que vem abaixo:
 *
 * - Um setor de cada vez. A planilha inteira numa tela só é ilegível no
 *   celular, e a pessoa anda pelo estoque setor a setor, não produto a produto.
 * - Salva no blur, nunca a cada tecla: uma requisição por item, e o teclado
 *   numérico do aparelho continua aberto enquanto se digita.
 * - Otimista: o número digitado entra no total na hora. Se o servidor recusar,
 *   o campo volta ao valor anterior e a tela diz o motivo — número errado na
 *   tela é pior do que operação lenta.
 * - Total do setor e total geral sempre à vista, grudados no rodapé.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Lock,
  LockOpen,
  Search,
  Store,
} from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  useAbrirContagem,
  useCategorias,
  useContagem,
  useContagens,
  useFecharContagem,
  useItensDaContagem,
  useLancarQuantidade,
  useReabrirContagem,
  useSetores,
  useTotaisPorSetor,
} from '@/dados/consultas'
import type { TipoContagem } from '@/tipos/banco'
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
  Dialogo,
  ErroDaConsulta,
  EstadoVazio,
  Ponto,
  Rotulo,
  Selecao,
  Selo,
  TotalDaBarra,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import {
  agruparPorCategoria,
  filtrarItens,
  hojeIso,
  quantidadeEmVigor,
  resumoDoFechamento,
  totalDosItens,
  type ItemContavel,
} from './logica'

const TIPOS: { valor: TipoContagem; rotulo: string; ajuda: string }[] = [
  { valor: 'semanal', rotulo: 'Semanal', ajuda: 'A foto da semana, para acompanhar consumo.' },
  { valor: 'mensal', rotulo: 'Mensal', ajuda: 'A foto que fecha o mês e alimenta o CMV.' },
  { valor: 'avulsa', rotulo: 'Avulsa', ajuda: 'Conferência fora do calendário.' },
]

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function Contagem() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para abrir a folha de contagem.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <ContagemDoRestaurante restauranteId={restaurante.id} />
}

function ContagemDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const { contagemId } = useParams<{ contagemId: string }>()
  const contagens = useContagens(restauranteId)

  // Sem id na rota, a tela abre a contagem aberta mais recente: é o que a
  // pessoa está fazendo agora. `useContagens` já vem ordenado por referência.
  const abertaMaisRecente = contagens.data?.find((c) => c.status === 'aberta')
  const alvo = contagemId ?? abertaMaisRecente?.id

  if (contagens.isLoading) {
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" />
        <Cartao>
          <Carregando linhas={5} />
        </Cartao>
      </>
    )
  }
  if (contagens.isError) {
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" />
        <Cartao>
          <ErroDaConsulta erro={contagens.error} aoTentar={() => void contagens.refetch()} />
        </Cartao>
      </>
    )
  }

  if (!alvo) return <AbrirContagem restauranteId={restauranteId} />
  return <Folha key={alvo} restauranteId={restauranteId} contagemId={alvo} />
}

/* ─────────────────────────────────────────────────────── abrir contagem ─── */

function AbrirContagem({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const setores = useSetores(restauranteId)
  const abrir = useAbrirContagem(restauranteId)

  const [referencia, setReferencia] = useState(() => hojeIso())
  const [tipo, setTipo] = useState<TipoContagem>('mensal')
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)

  const ativos = (setores.data ?? []).filter((s) => s.ativo)
  const todosOsSetores = escolhidos.size === 0

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    try {
      const id = await abrir.mutateAsync({
        referencia,
        tipo,
        // Conjunto vazio significa "a folha inteira" — é o que o banco entende
        // por `p_setores = null`, e é o caso comum.
        setores: todosOsSetores ? undefined : [...escolhidos],
      })
      navegar(`/contagem/${id}`)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Contagem"
        descricao="Nenhuma contagem aberta agora. Abra uma para começar a folha."
      />

      <Cartao>
        <EstadoVazio
          icone={<ClipboardList />}
          titulo="Sem contagem aberta"
        >
          A contagem monta a folha a partir do cadastro: cada produto ativo, em cada
          setor onde ele vive, vira uma linha zerada esperando a quantidade.
        </EstadoVazio>
      </Cartao>

      <Cartao titulo="Abrir contagem" descricao="Referência, tipo e quais setores entram.">
        <form onSubmit={(e) => void enviar(e)} className="space-y-5 p-5">
          {erro && <Aviso tom="erro" titulo="Não deu para abrir">{erro}</Aviso>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Rotulo para="referencia">Data de referência</Rotulo>
              <Campo
                id="referencia"
                type="date"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
              <p className="text-apoio text-texto-fraco">
                A data da foto do estoque. É por ela que o CMV acha esta contagem.
              </p>
            </div>

            <div className="space-y-1.5">
              <Rotulo para="tipo">Tipo</Rotulo>
              <Selecao
                id="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoContagem)}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </Selecao>
              <p className="text-apoio text-texto-fraco">
                {TIPOS.find((t) => t.valor === tipo)?.ajuda}
              </p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mv-rotulo mb-2">Setores</legend>
            {setores.isLoading && <Carregando linhas={2} />}
            {setores.isError && <ErroDaConsulta erro={setores.error} />}
            {setores.data && ativos.length === 0 && (
              <Aviso tom="alerta" titulo="Nenhum setor cadastrado">
                Sem setor não há onde contar. Cadastre os setores antes de abrir a contagem.
              </Aviso>
            )}
            {ativos.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {ativos.map((setor) => {
                    const marcado = escolhidos.has(setor.id)
                    return (
                      <Chip
                        key={setor.id}
                        marcado={marcado}
                        aoAlternar={() =>
                          setEscolhidos((atual) => {
                            const novo = new Set(atual)
                            if (novo.has(setor.id)) novo.delete(setor.id)
                            else novo.add(setor.id)
                            return novo
                          })
                        }
                      >
                        <Ponto cor={setor.cor} />
                        {setor.nome}
                        {marcado && <CheckCircle2 className="size-4" aria-hidden />}
                      </Chip>
                    )
                  })}
                </div>
                <p className="text-apoio text-texto-fraco" role="status">
                  {todosOsSetores
                    ? 'Nenhum setor marcado: a folha vai nascer com todos.'
                    : `${escolhidos.size} ${plural(escolhidos.size, 'setor', 'setores')} na folha.`}
                </p>
              </>
            )}
          </fieldset>

          <Botao
            type="submit"
            tom="primario"
            tamanho="g"
            carregando={abrir.isPending}
            disabled={ativos.length === 0}
          >
            Abrir contagem
          </Botao>
        </form>
      </Cartao>
    </>
  )
}

/* ────────────────────────────────────────────────────────────── a folha ─── */

function Folha({ restauranteId, contagemId }: { restauranteId: string; contagemId: string }) {
  const navegar = useNavigate()
  const { podeAdministrar } = useSessao()

  const contagem = useContagem(contagemId)
  const itens = useItensDaContagem(contagemId)
  const porSetor = useTotaisPorSetor(contagemId)
  const categorias = useCategorias(restauranteId)

  const lancar = useLancarQuantidade(contagemId)
  const fechar = useFecharContagem(restauranteId)
  const reabrir = useReabrirContagem(restauranteId)

  const [setorAtivo, setSetorAtivo] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [soNaoContados, setSoNaoContados] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  /** Quantidade aceita localmente antes de o servidor confirmar. */
  const [rascunhos, setRascunhos] = useState<ReadonlyMap<string, number>>(new Map())
  /**
   * Itens com gravação em voo. Precisa ser por item: `lancar.isPending` é da
   * mutação inteira, então acenderia o indicador de "salvando" em todo item já
   * digitado sempre que qualquer um estivesse sendo gravado.
   */
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(new Set())
  /**
   * Quantas vezes cada campo teve de voltar atrás. Entra na `key` do
   * `CampoNumero` para forçar a remontagem — o campo é não controlado, então
   * sem remontar ele continuaria exibindo o número recusado.
   */
  const [reversoes, setReversoes] = useState<ReadonlyMap<string, number>>(new Map())

  const fechada = contagem.data?.status === 'fechada'
  const cancelada = contagem.data?.status === 'cancelada'
  const somenteLeitura = fechada || cancelada

  const todos = useMemo(() => itens.data ?? [], [itens.data])

  // Os setores, os nomes e as cores saem da view; o total e o progresso são
  // recalculados aqui para subirem junto com o que está sendo digitado — a
  // view só se atualiza depois do ida-e-volta com o servidor.
  const abas = useMemo(
    () =>
      (porSetor.data ?? []).map((setor) => {
        const doSetor = todos.filter((i) => i.setor_id === setor.setor_id)
        return {
          id: setor.setor_id,
          nome: setor.setor_nome,
          cor: setor.setor_cor,
          itens: setor.itens,
          preenchidos: doSetor.filter((i) => quantidadeEmVigor(i, rascunhos) > 0).length,
          total: totalDosItens(doSetor, rascunhos),
        }
      }),
    [porSetor.data, todos, rascunhos],
  )

  const setorEscolhido = setorAtivo ?? abas[0]?.id ?? null
  const itensDoSetor = useMemo(
    () => todos.filter((i) => i.setor_id === setorEscolhido),
    [todos, setorEscolhido],
  )

  const grupos = useMemo(
    () =>
      agruparPorCategoria(
        filtrarItens(itensDoSetor, { busca, soNaoContados }, rascunhos),
        categorias.data ?? [],
        rascunhos,
      ),
    [itensDoSetor, busca, soNaoContados, rascunhos, categorias.data],
  )

  const totalDoSetor = useMemo(
    () => totalDosItens(itensDoSetor, rascunhos),
    [itensDoSetor, rascunhos],
  )
  const totalGeral = useMemo(() => totalDosItens(todos, rascunhos), [todos, rascunhos])
  const resumo = useMemo(() => resumoDoFechamento(todos, rascunhos), [todos, rascunhos])

  /**
   * Some com o rascunho assim que o servidor passa a devolver aquele mesmo
   * número. Sem isto o valor otimista sombreia o do servidor para sempre — e se
   * o banco normalizasse a quantidade, a tela seguiria mostrando o valor local.
   *
   * A comparação com o valor do servidor é o que protege quem digitou de novo
   * enquanto a primeira gravação estava em voo: nesse caso o rascunho é mais
   * novo, não bate com o servidor, e fica.
   */
  useEffect(() => {
    if (rascunhos.size === 0) return
    const sobrando = new Map(rascunhos)
    let mudou = false
    for (const item of todos) {
      if (sobrando.get(item.id) === item.quantidade && !emVoo.has(item.id)) {
        sobrando.delete(item.id)
        mudou = true
      }
    }
    if (mudou) setRascunhos(sobrando)
  }, [todos, rascunhos, emVoo])
  const visiveis = grupos.reduce((soma, g) => soma + g.itens.length, 0)

  async function lancarQuantidade(item: ItemContavel, valor: number) {
    if (somenteLeitura) return
    const anterior = quantidadeEmVigor(item, rascunhos)
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
      setFalha(
        `${item.produto?.nome ?? 'Item'}: ${mensagemDoErro(erro)} — o valor voltou ao que estava.`,
      )
    } finally {
      setEmVoo((atual) => {
        const novo = new Set(atual)
        novo.delete(item.id)
        return novo
      })
    }
  }

  async function confirmarFechamento() {
    setFalha(null)
    try {
      await fechar.mutateAsync(contagemId)
      setConfirmando(false)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    }
  }

  async function confirmarReabertura() {
    setFalha(null)
    try {
      await reabrir.mutateAsync(contagemId)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    }
  }

  if (contagem.isLoading || itens.isLoading || porSetor.isLoading) {
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" />
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (contagem.isError || itens.isError || porSetor.isError) {
    const erro = contagem.error ?? itens.error ?? porSetor.error
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" />
        <Cartao>
          <ErroDaConsulta
            erro={erro}
            aoTentar={() => {
              void contagem.refetch()
              void itens.refetch()
              void porSetor.refetch()
            }}
          />
        </Cartao>
      </>
    )
  }

  const cabecalho = contagem.data
  const tituloDaTela = cabecalho?.titulo ?? 'Contagem'

  return (
    <>
      <CabecalhoDePagina
        titulo={tituloDaTela}
        descricao={`Referência ${formatarData(cabecalho?.referencia)} · ${resumo.itens} itens na folha`}
        acoes={
          <>
            <Botao tom="fantasma" onClick={() => navegar('/contagem/historico')}>
              Histórico
            </Botao>
            {somenteLeitura ? (
              podeAdministrar &&
              fechada && (
                <Botao
                  tom="secundario"
                  icone={<LockOpen className="size-4" aria-hidden />}
                  carregando={reabrir.isPending}
                  onClick={() => void confirmarReabertura()}
                >
                  Reabrir
                </Botao>
              )
            ) : (
              <Botao
                tom="primario"
                icone={<Lock className="size-4" aria-hidden />}
                onClick={() => setConfirmando(true)}
              >
                Fechar contagem
              </Botao>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Selo tom={fechada ? 'sucesso' : cancelada ? 'erro' : 'marca'}>
          {fechada ? (
            <>
              <Lock className="size-3.5" aria-hidden /> Fechada
            </>
          ) : cancelada ? (
            'Cancelada'
          ) : (
            'Aberta'
          )}
        </Selo>
        <Selo tom="neutro">{cabecalho?.tipo}</Selo>
        {fechada && cabecalho?.fechada_em && (
          <span className="text-apoio text-texto-fraco">
            Congelada em {formatarData(cabecalho.fechada_em)}
          </span>
        )}
      </div>

      {somenteLeitura && (
        <Aviso tom={cancelada ? 'erro' : 'info'} titulo={cancelada ? 'Contagem cancelada' : 'Contagem fechada'}>
          {cancelada
            ? 'Esta contagem foi cancelada e não entra em nenhum cálculo.'
            : 'A foto está congelada: quantidade e custo não mudam mais. ' +
              (podeAdministrar
                ? 'Se algo ficou errado, reabra, corrija e feche de novo.'
                : 'Peça a um gerente para reabrir se algo ficou errado.')}
        </Aviso>
      )}

      {falha && (
        <Aviso tom="erro" titulo="Não deu para salvar">
          {falha}
        </Aviso>
      )}

      {abas.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={<ClipboardList />} titulo="Folha vazia">
            Esta contagem nasceu sem nenhuma linha — provavelmente não havia produto ativo
            vinculado aos setores escolhidos. Confira o cadastro de produtos.
          </EstadoVazio>
        </Cartao>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* ───────────────────────────────────────── navegação por setor ── */}
          <nav aria-label="Setores da contagem" className="min-w-0">
            <ul
              className={clsx(
                'flex gap-2 overflow-x-auto pb-1',
                'lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0',
              )}
            >
              {abas.map((aba) => {
                const ativo = aba.id === setorEscolhido
                const progresso = aba.itens === 0 ? 0 : (aba.preenchidos / aba.itens) * 100
                return (
                  <li key={aba.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      aria-current={ativo ? 'true' : undefined}
                      onClick={() => setSetorAtivo(aba.id)}
                      className={clsx(
                        'flex min-h-toque w-full min-w-[168px] flex-col justify-center gap-1 rounded-marca-p border px-3 py-2 text-left transition-colors',
                        ativo
                          ? 'border-primaria bg-primaria-16 active:brightness-95'
                          : 'border-borda bg-superficie-1 hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Ponto cor={aba.cor} />
                        <span
                          className={clsx(
                            'truncate text-corpo font-medium',
                            ativo ? 'text-primaria-legivel' : 'text-texto',
                          )}
                        >
                          {aba.nome}
                        </span>
                      </span>
                      <span className="mv-numero text-micro text-texto-fraco">
                        {aba.preenchidos}/{aba.itens} · {dinheiro(aba.total)}
                      </span>
                      <span
                        className="h-1 w-full overflow-hidden rounded-full bg-superficie-3"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-primaria transition-[width]"
                          style={{ width: `${progresso}%` }}
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* ────────────────────────────────────────────────── os itens ── */}
          <div className="min-w-0 space-y-4">
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
                  placeholder="Buscar produto neste setor"
                  aria-label="Buscar produto neste setor"
                  className="pl-9"
                />
              </div>
              <Botao
                tom={soNaoContados ? 'primario' : 'secundario'}
                aria-pressed={soNaoContados}
                onClick={() => setSoNaoContados((v) => !v)}
              >
                Só os não contados
              </Botao>
            </div>

            {categorias.isError && <ErroDaConsulta erro={categorias.error} />}

            {visiveis === 0 ? (
              <Cartao>
                <EstadoVazio
                  icone={<CheckCircle2 />}
                  titulo={soNaoContados ? 'Nada pendente neste setor' : 'Nenhum item encontrado'}
                >
                  {soNaoContados
                    ? 'Todos os itens deste setor já foram trabalhados — inclusive os que ficaram em zero de propósito.'
                    : 'Nenhum produto deste setor bate com a busca. Tente outro pedaço do nome.'}
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
                      const emVigor = quantidadeEmVigor(item, rascunhos)
                      const salvando = emVoo.has(item.id)
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 px-5 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`qtd-${item.id}`}
                              className="block truncate text-corpo text-texto"
                            >
                              {item.produto?.nome ?? 'Produto removido do cadastro'}
                            </label>
                            <span className="mv-numero text-micro text-texto-fraco">
                              {item.unidade} · {dinheiro(item.custo_unitario)} por {item.unidade}
                            </span>
                          </div>
                          <div className="shrink-0 text-right">
                            <CampoNumero
                              key={`${item.id}:${reversoes.get(item.id) ?? 0}`}
                              id={`qtd-${item.id}`}
                              valor={emVigor}
                              aoMudar={(valor) => void lancarQuantidade(item, valor)}
                              disabled={somenteLeitura}
                              aria-label={`Quantidade de ${item.produto?.nome ?? 'produto'} em ${item.unidade}`}
                              className="w-24"
                            />
                            <span
                              className={clsx(
                                'mv-numero mt-0.5 block text-micro',
                                salvando ? 'text-texto-fraco' : 'text-texto-suave',
                              )}
                            >
                              {dinheiro(emVigor * item.custo_unitario)}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </Cartao>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────── os totais, sempre à vista ──── */}
      <BarraDeTotais>
        <TotalDaBarra rotulo="Setor" valor={dinheiro(totalDoSetor)} />
        <TotalDaBarra rotulo="Total da contagem" valor={dinheiro(totalGeral)} destaque alinharADireita />
        <div className="w-full text-apoio text-texto-fraco sm:w-auto">
          <span className="mv-numero">{resumo.comQuantidade}</span> de{' '}
          <span className="mv-numero">{resumo.itens}</span> itens com quantidade
        </div>
      </BarraDeTotais>

      {confirmando && (
        <ConfirmarFechamento
          resumo={resumo}
          salvando={fechar.isPending}
          aoCancelar={() => setConfirmando(false)}
          aoConfirmar={() => void confirmarFechamento()}
        />
      )}
    </>
  )
}

/* ──────────────────────────────────────────── confirmação do fechamento ─── */

function ConfirmarFechamento({
  resumo,
  salvando,
  aoCancelar,
  aoConfirmar,
}: {
  resumo: ReturnType<typeof resumoDoFechamento>
  salvando: boolean
  aoCancelar: () => void
  aoConfirmar: () => void
}) {
  return (
    <Dialogo
      titulo="Fechar a contagem?"
      descricao="Depois de fechada, quantidade e custo não mudam mais."
      aoFechar={aoCancelar}
      rodape={
        <>
          <Botao tom="secundario" onClick={aoCancelar}>
            Voltar e conferir
          </Botao>
          <Botao
            tom="primario"
            icone={<AlertTriangle className="size-4" aria-hidden />}
            carregando={salvando}
            onClick={aoConfirmar}
          >
            Fechar mesmo assim
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-marca-p border border-borda bg-superficie-2 px-3 py-2">
            <dt className="mv-rotulo">Com quantidade</dt>
            <dd className="mv-numero text-destaque font-semibold text-texto">
              {formatarQuantidade(resumo.comQuantidade)}
            </dd>
          </div>
          <div className="rounded-marca-p border border-borda bg-superficie-2 px-3 py-2">
            <dt className="mv-rotulo">Vão congelar zerados</dt>
            <dd className="mv-numero text-destaque font-semibold text-texto">
              {formatarQuantidade(resumo.zerados)}
            </dd>
          </div>
        </dl>

        {resumo.nuncaTocados > 0 ? (
          <Aviso
            tom="alerta"
            titulo={`${resumo.nuncaTocados} ${plural(resumo.nuncaTocados, 'item que ninguém abriu', 'itens que ninguém abriu')}`}
          >
            Destes {resumo.zerados} zerados, {resumo.nuncaTocados} nunca receberam nenhum
            valor — nem zero. Item esquecido vira estoque final menor, e o CMV do período
            sai maior sem que ninguém entenda por quê. Vale conferir antes de congelar.
          </Aviso>
        ) : (
          <Aviso tom="sucesso" titulo="Todos os itens foram trabalhados">
            Os {resumo.zerados} itens zerados foram abertos e confirmados em zero.
          </Aviso>
        )}

        <div className="flex items-center justify-between rounded-marca-p border border-borda bg-superficie-2 px-3 py-2">
          <span className="mv-rotulo">Total que vai ser congelado</span>
          <span className="mv-numero text-destaque font-semibold text-texto">
            {dinheiro(resumo.total)}
          </span>
        </div>
      </div>
    </Dialogo>
  )
}
