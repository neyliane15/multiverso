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
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Refrigerator,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  Store,
  Undo2,
} from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  useAbrirContagem,
  useCategorias,
  useContagem,
  useContagens,
  useEntregaPorSetor,
  useEntregarSetor,
  useFecharContagem,
  useMudarReferencia,
  useItensDaContagem,
  useLancarQuantidade,
  useReabrirContagem,
  useRecontarSetor,
  useRefazerFolha,
  useEstoques,
  useSetores,
  useTotaisPorEstoque,
  useVinculosPorEstoque,
  useZerarPendentes,
} from '@/dados/consultas'
import type { EntregaDeSetor, TipoContagem } from '@/tipos/banco'
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
import { data as formatarData, dataHora, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import {
  EIXOS,
  chaveDoSetor,
  ehSelecaoDeSetor,
  estoqueDaSelecao,
  filtrarItens,
  gruposDaParada,
  hojeIso,
  itensDaParada,
  montarArvoreDeSetores,
  montarParadas,
  ondeFica,
  precisaLancar,
  quantidadeEmVigor,
  resumoDoFechamento,
  totalDosItens,
  type Eixo,
  type ItemContavel,
  type Parada,
  type RamoDeSetor,
} from './logica'

/** Chave do eixo no localStorage. */
const EIXO_SALVO = 'multiverso:contagem:eixo'

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
  const { restritoASetores } = useSessao()
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

  /*
    Quem conta um setor não abre contagem — quem abre é a casa. Oferecer o
    formulário a ele seria mostrar um caminho que a RLS recusa no fim.
  */
  if (restritoASetores) {
    return (
      <>
        <CabecalhoDePagina titulo="Contagem" descricao="Nenhuma contagem aberta agora." />
        <Cartao>
          <EstadoVazio icone={<ClipboardList />} titulo="Nada para contar agora">
            Quando a contagem for aberta, a folha do seu setor aparece aqui.
          </EstadoVazio>
        </Cartao>
      </>
    )
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
          A contagem monta a folha a partir do cadastro: cada insumo ativo, em cada
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
  const { podeAdministrar, restritoASetores, setoresDoPerfil } = useSessao()

  const contagem = useContagem(contagemId)
  const entregas = useEntregaPorSetor(contagemId)
  const mudarData = useMudarReferencia(contagemId, restauranteId)
  const entregar = useEntregarSetor(contagemId)
  const recontar = useRecontarSetor(contagemId)
  const zerar = useZerarPendentes(contagemId)
  const itens = useItensDaContagem(contagemId)
  const porSetor = useTotaisPorEstoque(contagemId)
  const categorias = useCategorias(restauranteId)
  /**
   * Os lugares do CADASTRO, além dos que já têm linha na folha.
   *
   * A folha é uma foto do cadastro na hora em que a contagem abriu. Sem isto,
   * um lugar criado depois — ou ainda sem produto nenhum — não aparecia em
   * lugar nenhum da tela, e quem acabou de criá-lo não tinha como saber se
   * errou o cadastro, se o sistema não salvou, ou se falta um passo.
   */
  const estoques = useEstoques(restauranteId)

  const lancar = useLancarQuantidade(contagemId)
  const fechar = useFecharContagem(restauranteId)
  const reabrir = useReabrirContagem(restauranteId)
  const refazer = useRefazerFolha(contagemId)

  /**
   * O eixo fica no navegador, não no banco: é preferência de quem conta, e
   * cada pessoa da equipe tem a sua. Quem abre a folha amanhã acha do jeito
   * que deixou. Se o `localStorage` não estiver disponível, cai no padrão.
   */
  const [eixo, setEixo] = useState<Eixo>(() => {
    try {
      const salvo = localStorage.getItem(EIXO_SALVO)
      if (salvo === 'setor' || salvo === 'categoria' || salvo === 'produto') return salvo
    } catch {
      /* navegador anônimo, cookies bloqueados: o padrão serve. */
    }
    return 'setor'
  })
  const [paradaAtiva, setParadaAtiva] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [soNaoContados, setSoNaoContados] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** O título do aviso — "Folha refeita" só serve para uma das ações. */
  const [tituloDoAviso, setTituloDoAviso] = useState('Pronto')

  /**
   * Blocos fechados na mão, por id. Só o que a pessoa fechou entra aqui, então
   * a folha abre inteira como sempre — e quem quiser esconder o que já contou
   * fecha e segue.
   */
  /** O setor que está na tela de revisão, antes de entregar. */
  const [revisando, setRevisando] = useState<EntregaDeSetor | null>(null)

  const [gruposFechados, setGruposFechados] = useState<ReadonlySet<string>>(new Set())
  const alternarGrupo = (id: string) =>
    setGruposFechados((antes) => {
      const novo = new Set(antes)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

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

  /**
   * Os setores deste acesso, com o andamento de cada um.
   *
   * Para quem enxerga a casa inteira é a lista toda — é o quadro que diz se a
   * contagem já pode ser fechada. Para o operador de setor são só os dele.
   */
  const minhasEntregas = useMemo(() => {
    const todas = entregas.data ?? []
    if (!restritoASetores) return todas
    return todas.filter((e) => setoresDoPerfil.includes(e.setor_id))
  }, [entregas.data, restritoASetores, setoresDoPerfil])

  /** Setor entregue não se digita mais: a folha dele vira leitura. */
  const setoresEntregues = useMemo(
    () => new Set((entregas.data ?? []).filter((e) => e.entregue_em !== null).map((e) => e.setor_id)),
    [entregas.data],
  )
  const tudoEntregue =
    minhasEntregas.length > 0 && minhasEntregas.every((e) => e.entregue_em !== null)

  /**
   * Entregue trava a digitação, mas NÃO é o mesmo que fechada.
   *
   * As duas travam a folha, e é só isso que têm em comum: fechada congela o
   * CMV do período e só um gerente reabre; entregue é o operador dizendo "o
   * meu está pronto", e ele mesmo destrava com Recontar. Misturar as duas
   * fazia a tela dizer "peça a um gerente" para quem tinha o botão na mão.
   */
  const entregueEfechado = restritoASetores && tudoEntregue && !fechada && !cancelada
  const somenteLeitura = fechada || cancelada || entregueEfechado

  const todos = useMemo(() => itens.data ?? [], [itens.data])

  // Os nomes, as cores e a contagem de itens saem da view; o total e o
  // progresso são recalculados aqui para subirem junto com o que está sendo
  // digitado — a view só se atualiza depois do ida-e-volta com o servidor.
  const lugares = useMemo(() => porSetor.data ?? [], [porSetor.data])
  const paradas = useMemo(
    () => montarParadas(eixo, lugares, categorias.data ?? [], todos, rascunhos),
    [eixo, lugares, categorias.data, todos, rascunhos],
  )
  const lugaresDoCadastro = useMemo(
    () =>
      (estoques.data ?? [])
        .filter((e) => e.ativo)
        .map((e) => ({ id: e.id, setor_id: e.setor_id, nome: e.nome })),
    [estoques.data],
  )
  const arvore = useMemo(
    () =>
      eixo === 'setor'
        ? montarArvoreDeSetores(lugares, todos, rascunhos, lugaresDoCadastro)
        : [],
    [eixo, lugares, todos, rascunhos, lugaresDoCadastro],
  )
  // Quantos produtos cada lugar tem no cadastro — a conta que separa "folha
  // antiga, é só refazer" de "este lugar ainda está vazio".
  const vinculos = useVinculosPorEstoque(useMemo(
    () => lugaresDoCadastro.map((l) => l.id),
    [lugaresDoCadastro],
  ))

  /**
   * A seleção válida para este eixo. Trocar de eixo e cair numa seleção que
   * não existe ali deixaria a folha vazia sem motivo visível.
   *
   * No eixo setor, o padrão é o PRIMEIRO SETOR inteiro — não o primeiro lugar.
   * Quem abre a contagem quer ver o setor, e decide dali se desce.
   */
  const selecoesValidas = useMemo(() => {
    if (eixo === 'setor') {
      return new Set(arvore.flatMap((r) => [chaveDoSetor(r.setorId), ...r.lugares.map((l) => l.id)]))
    }
    return new Set(paradas.map((p) => p.id))
  }, [eixo, arvore, paradas])

  const padrao =
    eixo === 'setor'
      ? arvore[0] !== undefined
        ? chaveDoSetor(arvore[0].setorId)
        : null
      : (paradas[0]?.id ?? null)

  const paradaId =
    paradaAtiva !== null && selecoesValidas.has(paradaAtiva) ? paradaAtiva : padrao

  const ondeEstou = useMemo(() => {
    if (eixo === 'produto') return 'toda a folha'
    if (paradaId === null) return 'nesta folha'
    if (eixo === 'setor') {
      if (ehSelecaoDeSetor(paradaId)) {
        return arvore.find((r) => chaveDoSetor(r.setorId) === paradaId)?.nome ?? 'nesta folha'
      }
      for (const ramo of arvore) {
        const lugar = ramo.lugares.find((l) => l.id === paradaId)
        if (lugar) return `${ramo.nome} › ${lugar.titulo}`
      }
      return 'nesta folha'
    }
    const p = paradas.find((x) => x.id === paradaId)
    return p ? [p.subtitulo, p.titulo].filter(Boolean).join(' › ') : 'nesta folha'
  }, [eixo, paradaId, arvore, paradas])

  const tituloDoRodape = useMemo(() => {
    if (eixo === 'produto') return 'Na folha'
    if (eixo === 'setor' && paradaId !== null) {
      if (ehSelecaoDeSetor(paradaId)) {
        return arvore.find((r) => chaveDoSetor(r.setorId) === paradaId)?.nome ?? 'Setor'
      }
      for (const ramo of arvore) {
        const lugar = ramo.lugares.find((l) => l.id === paradaId)
        if (lugar) return lugar.titulo
      }
    }
    return paradas.find((x) => x.id === paradaId)?.titulo ?? 'Setor'
  }, [eixo, paradaId, arvore, paradas])

  const itensDaqui = useMemo(
    () => itensDaParada(eixo, paradaId, todos),
    [eixo, paradaId, todos],
  )

  /**
   * O lugar selecionado não tem linha nenhuma nesta folha — e por quê.
   *
   * `null` quando não é o caso. Quando é, `vinculados` decide a conversa: zero
   * significa "este lugar está vazio no cadastro"; mais que zero significa
   * "a folha é mais velha que o cadastro, é só refazer".
   */
  /**
   * A navegação não tem o que oferecer: um setor só, sem lugares dentro, ou
   * uma categoria só. Some em vez de ocupar uma coluna inteira.
   */
  const navegacaoInutil =
    eixo === 'setor'
      ? arvore.length <= 1 && (arvore[0]?.lugares.length ?? 0) === 0
      : eixo === 'categoria' && paradas.length <= 1

  const lugarSemLinha = useMemo(() => {
    if (eixo !== 'setor' || itensDaqui.length > 0) return null
    const estoque = estoqueDaSelecao(paradaId)
    if (estoque === null) return null
    return { estoque, vinculados: vinculos.data?.get(estoque) ?? 0 }
  }, [eixo, itensDaqui.length, paradaId, vinculos.data])

  const grupos = useMemo(
    () =>
      gruposDaParada(
        eixo,
        filtrarItens(itensDaqui, { busca, soNaoContados }, rascunhos),
        categorias.data ?? [],
        lugares,
        rascunhos,
        paradaId,
      ),
    [eixo, itensDaqui, busca, soNaoContados, rascunhos, categorias.data, lugares, paradaId],
  )

  const totalDoSetor = useMemo(
    () => totalDosItens(itensDaqui, rascunhos),
    [itensDaqui, rascunhos],
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
    /**
     * Digitar o mesmo número de novo não gasta requisição — MENOS quando a
     * linha ainda não tinha resposta.
     *
     * A linha nasce com quantidade zero e sem carimbo. Alguém que conferia a
     * prateleira, via que tinha acabado e digitava 0 batia neste `return`: o
     * valor não mudou, nada foi enviado, e o item continuava "em branco" para
     * o sistema. O gesto mais comum do fim da contagem — responder zero — era
     * justamente o único que não registrava nada.
     */
    if (!precisaLancar(item, valor, anterior, rascunhos)) return

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

  /**
   * Entrega o setor. O servidor recusa se houver linha em branco — e essa
   * recusa é a regra, não um detalhe da tela: zero é resposta, vazio não é.
   */
  async function entregarSetor(entrega: EntregaDeSetor) {
    setFalha(null)
    setAviso(null)
    try {
      await entregar.mutateAsync(entrega.setor_id)
      setRevisando(null)
      setTituloDoAviso('Setor entregue')
      setAviso(
        `${entrega.setor_nome} entregue com ${entrega.itens} ${plural(entrega.itens, 'item', 'itens')}. ` +
          'A contagem só fecha quando o responsável fechar — o seu já está pronto.',
      )
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    }
  }

  async function recontarSetor(entrega: EntregaDeSetor) {
    setFalha(null)
    setAviso(null)
    try {
      await recontar.mutateAsync(entrega.setor_id)
      setTituloDoAviso('De volta para contagem')
      setAviso(`${entrega.setor_nome} voltou para contagem. Corrija o que precisar e finalize de novo.`)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    }
  }

  async function zerarPendentes(entrega: EntregaDeSetor) {
    setFalha(null)
    try {
      const quantos = await zerar.mutateAsync(entrega.setor_id)
      setTituloDoAviso('Pendentes respondidos com zero')
      setAviso(
        `${quantos} ${plural(quantos, 'item foi marcado', 'itens foram marcados')} com zero. ` +
          'Confira antes de entregar.',
      )
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
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

  /**
   * Realinha a folha com o cadastro. A mensagem diz as três contas separadas
   * porque cada uma responde a uma pergunta diferente de quem clicou: entrou
   * coisa nova? sumiu alguma? e — a que importa — o que eu já contei ficou?
   */
  async function refazerAFolha() {
    setFalha(null)
    setAviso(null)
    try {
      const r = await refazer.mutateAsync()
      const partes = [
        `${r.acrescentadas} ${plural(r.acrescentadas, 'linha nova', 'linhas novas')}`,
        `${r.removidas} ${plural(r.removidas, 'linha zerada removida', 'linhas zeradas removidas')}`,
      ]
      if (r.preservadas > 0) {
        partes.push(
          `${r.preservadas} ${plural(r.preservadas, 'linha já contada', 'linhas já contadas')} ` +
            'fora do cadastro atual — ficaram na folha, agrupadas como "Fora do cadastro"',
        )
      }
      setTituloDoAviso('Folha refeita')
      setAviso(`${partes.join(', ')}. Nada do que já foi contado se perdeu.`)
    } catch (erro) {
      setFalha(`Não consegui refazer a folha: ${mensagemDoErro(erro)}`)
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
        descricao={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/*
              A data é editável enquanto a contagem está aberta.
              Ela é o dia da foto do estoque, e envelhece: contagem aberta na
              segunda e contada na quinta ficava carimbada com segunda, e o
              número entrava no CMV no dia errado. Depois de fechada ela vira
              número de um período e só se corrige reabrindo.
            */}
            {podeAdministrar && !somenteLeitura ? (
              <label className="flex items-center gap-2">
                <span>Referência</span>
                <Campo
                  type="date"
                  value={cabecalho?.referencia?.slice(0, 10) ?? ''}
                  disabled={mudarData.isPending}
                  aria-label="Data de referência desta contagem"
                  className="w-[9.5rem]"
                  onChange={(e) => {
                    const nova = e.target.value
                    if (nova === '' || nova === cabecalho?.referencia?.slice(0, 10)) return
                    setFalha(null)
                    mudarData.mutate(nova, {
                      onSuccess: () => {
                        setTituloDoAviso('Data corrigida')
                        setAviso(`Esta contagem passou a valer para ${formatarData(nova)}.`)
                      },
                      onError: (erro) => setFalha(mensagemDoErro(erro)),
                    })
                  }}
                />
              </label>
            ) : (
              <span>Referência {formatarData(cabecalho?.referencia)}</span>
            )}
            <span className="text-texto-fraco">· {resumo.itens} itens na folha</span>
          </span>
        }
        acoes={
          <>
            {/*
              O operador de setor não tem nada aqui.
              Refazer a folha, ver o histórico e fechar a contagem são decisões
              da casa inteira, e a RLS já recusa as três. Mostrar o botão só
              para ele receber "não autorizado" seria transformar regra em
              defeito aparente.
            */}
            {!somenteLeitura && !restritoASetores && (
              <Botao
                tom="fantasma"
                icone={<RefreshCw className="size-4" aria-hidden />}
                carregando={refazer.isPending}
                onClick={() => void refazerAFolha()}
              >
                Refazer a folha
              </Botao>
            )}
            <Botao tom="fantasma" onClick={() => navegar('/contagem/historico')}>
              Histórico
            </Botao>

            {/*
              O fim do trabalho de quem conta um setor.
              Entregar não fecha a contagem — fechar congela o CMV do período e
              continua sendo de quem enxerga a casa. Entregar diz "o meu está
              pronto", e é isso que o operador precisa poder dizer.
            */}
            {!fechada &&
              !cancelada &&
              minhasEntregas.map((entrega) =>
                entrega.entregue_em === null ? (
                  <Botao
                    key={entrega.setor_id}
                    tom="primario"
                    icone={<ClipboardCheck className="size-4" aria-hidden />}
                    onClick={() => setRevisando(entrega)}
                  >
                    {minhasEntregas.length === 1
                      ? 'Finalizar contagem'
                      : `Finalizar ${entrega.setor_nome}`}
                  </Botao>
                ) : (
                  <Botao
                    key={entrega.setor_id}
                    tom="secundario"
                    icone={<Undo2 className="size-4" aria-hidden />}
                    carregando={recontar.isPending}
                    onClick={() => void recontarSetor(entrega)}
                  >
                    {minhasEntregas.length === 1
                      ? 'Recontar'
                      : `Recontar ${entrega.setor_nome}`}
                  </Botao>
                ),
              )}
            {somenteLeitura ? (
              podeAdministrar &&
              !restritoASetores &&
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
              !restritoASetores && (
                <Botao
                  tom="primario"
                  icone={<Lock className="size-4" aria-hidden />}
                  onClick={() => setConfirmando(true)}
                >
                  Fechar contagem
                </Botao>
              )
            )}
          </>
        }
      />

      {/* No celular estes selos repetem o que o título e o rodapé já dizem, e
          cada linha a mais aqui é uma linha a menos de folha na tela. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
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

      {/*
        A entrega depende da migração 0019. Sem ela a consulta falha e o botão
        de finalizar simplesmente não existiria — e "sumiu o botão" é o pior
        jeito de descobrir que falta uma migração.
      */}
      {entregas.isError && (
        <Aviso tom="alerta" titulo="A entrega por setor ainda não está no banco">
          {/*
            Os dois comandos, e nesta ordem. `db push` sozinho responde "up to
            date" quando a migração ainda não chegou ao computador — e aí a
            mensagem parece mentira: o site está novo, o banco não, e o comando
            diz que está tudo certo.
          */}
          Na pasta do projeto, rode <strong className="text-texto-suave">git pull</strong> e depois{' '}
          <strong className="text-texto-suave">supabase db push</strong>. Os dois: sem o{' '}
          <em>pull</em>, a migração nem chegou ao seu computador, e o <em>push</em> responde que
          está tudo em dia. Contar e lançar continuam funcionando; o que falta é o botão de
          finalizar.
        </Aviso>
      )}

      {entregueEfechado && (
        <Aviso tom="sucesso" titulo="Setor entregue">
          A sua folha está travada para não mudar sem querer. Achou um erro ou lembrou de um item?{' '}
          <strong className="text-texto-suave">Recontar</strong> destrava — e fica registrado que
          houve recontagem.
        </Aviso>
      )}

      {somenteLeitura && !entregueEfechado && (
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

      {aviso && <Aviso tom="info" titulo={tituloDoAviso}>{aviso}</Aviso>}

      {/*
        O quadro das entregas.
        Para quem fecha a contagem, é o que responde "já posso fechar?" — e
        para o operador, é o recibo do que ele entregou. Só aparece quando há
        mais de um setor ou quando alguém já entregou: numa contagem de um
        setor só, antes de qualquer entrega, seria uma linha dizendo o óbvio.
      */}
      {(entregas.data ?? []).length > 0 &&
        ((entregas.data ?? []).length > 1 ||
          (entregas.data ?? []).some((e) => e.entregue_em !== null)) && (
          <QuadroDeEntregas
            entregas={entregas.data ?? []}
            podeRecontar={!fechada && !cancelada}
            meusSetores={restritoASetores ? setoresDoPerfil : null}
            recontando={recontar.isPending}
            aoRecontar={(entrega) => void recontarSetor(entrega)}
          />
        )}

      <BarraDeControle
        eixo={eixo}
        aoTrocarEixo={(proximo) => {
          setEixo(proximo)
          setParadaAtiva(null)
          try {
            localStorage.setItem(EIXO_SALVO, proximo)
          } catch {
            /* sem armazenamento: a escolha vale para esta visita. */
          }
        }}
        busca={busca}
        aoBuscar={setBusca}
        ondeEstou={ondeEstou}
        soNaoContados={soNaoContados}
        aoAlternarNaoContados={() => setSoNaoContados((v) => !v)}
        contados={resumo.comQuantidade}
        total={resumo.itens}
      />

      {todos.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={<ClipboardList />} titulo="Folha vazia">
            Esta contagem nasceu sem nenhuma linha — provavelmente não havia insumo ativo
            vinculado aos setores escolhidos. Confira o cadastro de insumos.
          </EstadoVazio>
        </Cartao>
      ) : (
        <div
          className={clsx(
            'grid gap-4',
            // No eixo produto não há navegação, e a lista toma a largura
            // inteira: uma coluna vazia de 240px seria só enfeite.
            eixo !== 'produto' && !navegacaoInutil && 'lg:grid-cols-[240px_minmax(0,1fr)]',
          )}
        >
          {/*
            Navegação de uma entrada só é decoração — e no celular é decoração
            que empurra a folha para fora da tela. É exatamente o caso do
            operador de setor: um setor, uma parada, nada a escolher.
          */}
          {navegacaoInutil ? null : eixo === 'setor' ? (
            <NavegacaoPorSetor
              ramos={arvore}
              escolhida={paradaId}
              aoEscolher={setParadaAtiva}
            />
          ) : (
            eixo === 'categoria' && (
              <Navegacao
                paradas={paradas}
                escolhida={paradaId}
                aoEscolher={setParadaAtiva}
                rotulo="Categorias da contagem"
              />
            )
          )}

          {/*
            A folga embaixo não é estética: a barra de totais é grudada no pé
            da tela, e sem ela a última linha da folha fica atrás do total —
            justo a linha que alguém ainda precisa preencher.
          */}
          <div className="min-w-0 space-y-4 pb-24 sm:pb-16">
            {categorias.isError && <ErroDaConsulta erro={categorias.error} />}

            {/*
              Um lugar sem NENHUMA linha nesta folha não é "nenhum item
              encontrado": é uma das duas situações abaixo, e dizer qual é a
              diferença entre a pessoa resolver em dois cliques ou achar que o
              sistema engoliu o que ela cadastrou.
            */}
            {lugarSemLinha !== null ? (
              <Cartao>
                {lugarSemLinha.vinculados === 0 ? (
                  <EstadoVazio
                    icone={<Refrigerator />}
                    titulo={`${ondeEstou} ainda não tem insumo nenhum`}
                    acao={
                      <Botao
                        tom="secundario"
                        onClick={() => navegar('/cadastros/estoques')}
                        icone={<Boxes />}
                      >
                        Escolher os insumos deste lugar
                      </Botao>
                    }
                  >
                    O lugar está criado, mas nada foi guardado nele ainda. Em Cadastros ›
                    Estoques de setor, o botão <strong className="text-texto-suave">Insumos</strong>{' '}
                    abre a lista do setor e deixa marcar todos de uma vez.
                  </EstadoVazio>
                ) : (
                  <EstadoVazio
                    icone={<RefreshCw />}
                    titulo={`${ondeEstou} entrou depois que esta folha foi aberta`}
                    acao={
                      <Botao
                        tom="secundario"
                        onClick={() => void refazerAFolha()}
                        carregando={refazer.isPending}
                        icone={<RefreshCw />}
                      >
                        Refazer a folha
                      </Botao>
                    }
                  >
                    A folha é uma foto do cadastro no instante em que a contagem abriu — por isso
                    ela não tem as {lugarSemLinha.vinculados}{' '}
                    {plural(lugarSemLinha.vinculados, 'linha', 'linhas')} deste lugar. Refazer traz
                    o que falta e preserva tudo o que já foi contado.
                  </EstadoVazio>
                )}
              </Cartao>
            ) : visiveis === 0 ? (
              <Cartao>
                <EstadoVazio
                  icone={<CheckCircle2 />}
                  titulo={soNaoContados ? `Nada pendente em ${ondeEstou}` : 'Nenhum item encontrado'}
                >
                  {soNaoContados
                    ? `Todos os itens de ${ondeEstou} já foram trabalhados — inclusive os que ficaram em zero de propósito.`
                    : `Nenhum insumo de ${ondeEstou} bate com a busca. Tente outro pedaço do nome.`}
                </EstadoVazio>
              </Cartao>
            ) : (
              grupos.map((grupo) => {
                const abertoAqui = !gruposFechados.has(grupo.id)
                return (
                <Cartao key={grupo.id}>
                  {/* No eixo produto o cabeçalho seria um só, dizendo "Todos
                      os produtos" — informação que o seletor acima já deu.
                      Nos outros, ele é o botão que fecha o bloco: dezessete
                      categorias abertas numa folha de 455 linhas são meia hora
                      de rolagem para achar a que falta contar. */}
                  {eixo !== 'produto' && (
                    <button
                      type="button"
                      onClick={() => alternarGrupo(grupo.id)}
                      aria-expanded={abertoAqui}
                      className={clsx(
                        'flex min-h-toque w-full items-center justify-between gap-3 px-5 py-3.5',
                        'text-left transition-colors hover:bg-primaria-06',
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
                  )}
                  {(abertoAqui || eixo === 'produto') && (
                  <ul className="divide-y divide-borda/60">
                    {grupo.itens.map((item) => {
                      const emVigor = quantidadeEmVigor(item, rascunhos)
                      const salvando = emVoo.has(item.id)
                      // Respondido = alguém já disse alguma coisa sobre esta
                      // linha, inclusive zero. O rascunho conta: o número
                      // aparece antes de o servidor confirmar.
                      const respondido = item.contado_em !== null || rascunhos.has(item.id)
                      // Na lista única, a linha precisa dizer de onde é: a
                      // tilápia aparece duas vezes, e sem isso não dá para
                      // saber qual delas se está preenchendo.
                      const lugar = eixo === 'produto' ? ondeFica(item, lugares) : null
                      return (
                        <li key={item.id} className="flex items-center gap-3 py-1 pl-5 pr-5">
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`qtd-${item.id}`}
                              className="block truncate text-corpo text-texto"
                            >
                              {item.produto?.nome ?? 'Insumo removido do cadastro'}
                            </label>
                            {/* A palavra "custo" não é enfeite: sem ela, o valor
                                cinza aqui e o total da linha ali do lado são
                                dois números soltos, e o que a pessoa lê como
                                "custo do insumo" é o R$ 0,00 de baixo. */}
                            <span className="mv-numero block truncate text-micro text-texto-fraco">
                              {lugar !== null && <span className="text-texto-suave">{lugar} · </span>}
                              custo{' '}
                              <span className="text-texto-suave">{dinheiro(item.custo_unitario)}</span>{' '}
                              por {item.unidade}
                            </span>
                          </div>
                          <div className="shrink-0 text-right">
                            <CampoNumero
                              key={`${item.id}:${reversoes.get(item.id) ?? 0}`}
                              id={`qtd-${item.id}`}
                              valor={emVigor}
                              aoMudar={(valor) => void lancarQuantidade(item, valor)}
                              disabled={somenteLeitura || setoresEntregues.has(item.setor_id)}
                              aria-label={`Quantidade de ${item.produto?.nome ?? 'produto'} em ${item.unidade}`}
                              className="w-24"
                            />
                            {/*
                              Linha ainda sem resposta mostra travessão, não
                              "R$ 0,00".
                              Zero é uma resposta — "acabou" — e branco é a
                              falta dela. Mostrar R$ 0,00 nos dois casos
                              apagava justamente a diferença que a entrega
                              cobra, e ainda fazia o total da linha parecer o
                              custo do insumo.
                            */}
                            <span
                              className={clsx(
                                'mv-numero mt-0.5 block text-micro',
                                salvando ? 'text-texto-fraco' : 'text-texto-suave',
                              )}
                              title="Total desta linha: quantidade × custo"
                            >
                              {respondido ? dinheiro(emVigor * item.custo_unitario) : (
                                <span className="text-texto-fraco">—</span>
                              )}
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
          </div>
        </div>
      )}

      {/* ─────────────────────────────────── os totais, sempre à vista ──── */}
      <BarraDeTotais>
        {/* "Setor" mentia quando a parada era uma geladeira: o numero e o
            da parada aberta, nao o do setor inteiro. */}
        <TotalDaBarra
          rotulo={tituloDoRodape}
          valor={dinheiro(totalDoSetor)}
        />
        <TotalDaBarra rotulo="Total da contagem" valor={dinheiro(totalGeral)} destaque alinharADireita />
        <div className="w-full text-apoio text-texto-fraco sm:w-auto">
          <span className="mv-numero">{resumo.comQuantidade}</span> de{' '}
          <span className="mv-numero">{resumo.itens}</span> itens com quantidade
        </div>
      </BarraDeTotais>

      {revisando && (
        <RevisarAntesDeEntregar
          entrega={
            (entregas.data ?? []).find((e) => e.setor_id === revisando.setor_id) ?? revisando
          }
          itensDoSetor={todos.filter((i) => i.setor_id === revisando.setor_id)}
          zerando={zerar.isPending}
          entregando={entregar.isPending}
          aoZerar={() => void zerarPendentes(revisando)}
          aoEntregar={() => void entregarSetor(revisando)}
          aoFechar={() => setRevisando(null)}
        />
      )}

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

/* ──────────────────────────────────────────── a barra de controle ──────── */

/**
 * Onde se decide COMO contar, antes de contar.
 *
 * Eixo, busca e filtro moram juntos porque são a mesma decisão: o recorte da
 * folha. Espalhá-los pela tela fazia a pessoa procurar o controle enquanto
 * segurava o celular com uma mão só.
 */
function BarraDeControle({
  eixo,
  aoTrocarEixo,
  busca,
  aoBuscar,
  ondeEstou,
  soNaoContados,
  aoAlternarNaoContados,
  contados,
  total,
}: {
  eixo: Eixo
  aoTrocarEixo: (eixo: Eixo) => void
  busca: string
  aoBuscar: (busca: string) => void
  ondeEstou: string
  soNaoContados: boolean
  aoAlternarNaoContados: () => void
  contados: number
  total: number
}): JSX.Element {
  const progresso = total === 0 ? 0 : (contados / total) * 100
  const ajuda = EIXOS.find((e) => e.valor === eixo)?.ajuda ?? ''

  return (
    <Cartao className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Contar por"
          className="flex shrink-0 rounded-marca-p border border-borda bg-superficie-2 p-1"
        >
          {EIXOS.map((opcao) => {
            const ativo = opcao.valor === eixo
            return (
              <button
                key={opcao.valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                title={opcao.ajuda}
                onClick={() => aoTrocarEixo(opcao.valor)}
                className={clsx(
                  'min-h-9 rounded-marca-p px-3 text-corpo transition-colors',
                  ativo
                    ? 'bg-superficie text-texto shadow-baixa'
                    : 'text-texto-fraco hover:text-texto',
                )}
              >
                {opcao.rotulo}
              </button>
            )
          })}
        </div>

        <div className="relative min-w-[150px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
            aria-hidden
          />
          <Campo
            type="search"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder={`Buscar insumo em ${ondeEstou}`}
            aria-label={`Buscar insumo em ${ondeEstou}`}
            className="pl-9"
          />
        </div>

        {/* No celular o rótulo encolhe para "Pendentes": o botão cabe ao lado
            da busca, e a folha começa uma linha acima. */}
        <Botao
          tom={soNaoContados ? 'primario' : 'secundario'}
          aria-pressed={soNaoContados}
          onClick={aoAlternarNaoContados}
          className="shrink-0"
        >
          <span className="sm:hidden">Pendentes</span>
          <span className="hidden sm:inline">Só os não contados</span>
        </Botao>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-superficie-3"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-primaria transition-[width]"
            style={{ width: `${progresso}%` }}
          />
        </span>
        <span className="mv-numero shrink-0 text-micro text-texto-fraco" role="status">
          {contados} de {total} contados
        </span>
      </div>

      {/* No celular esta linha só empurra a folha para baixo: quem está de pé
          no estoque já sabe por que clicou. No desktop ela explica os eixos. */}
      <p className="mt-2 hidden text-micro text-texto-fraco sm:block">{ajuda}</p>
    </Cartao>
  )
}

/* ─────────────────────────────────────────── a navegação da folha ──────── */

/**
 * As paradas: linhas finas, não cartões.
 *
 * A versão anterior eram caixas de 70px com barra de progresso dentro, e vinte
 * e uma categorias viravam uma coluna de rolagem infinita. Aqui cada parada
 * ocupa uma linha, o progresso é um traço embaixo do nome, e a que está aberta
 * se marca por uma faixa na lateral — o mesmo alvo de toque, um terço da
 * altura.
 */
function Navegacao({
  paradas,
  escolhida,
  aoEscolher,
  rotulo,
}: {
  paradas: readonly Parada[]
  escolhida: string | null
  aoEscolher: (id: string) => void
  rotulo: string
}): JSX.Element {
  return (
    <nav aria-label={rotulo} className="min-w-0">
      <ul
        className={clsx(
          'flex gap-2 overflow-x-auto pb-1',
          'lg:max-h-[70vh] lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-visible lg:pb-0',
        )}
      >
        {paradas.map((parada) => {
          const ativo = parada.id === escolhida
          const progresso = parada.itens === 0 ? 0 : (parada.preenchidos / parada.itens) * 100
          return (
            <li key={parada.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                aria-current={ativo ? 'true' : undefined}
                onClick={() => aoEscolher(parada.id)}
                className={clsx(
                  'flex min-h-toque w-full min-w-[150px] flex-col justify-center gap-1 rounded-marca-p',
                  'border-l-2 px-3 py-1.5 text-left transition-colors',
                  ativo
                    ? 'border-l-primaria bg-primaria-16'
                    : 'border-l-transparent hover:bg-primaria-06',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {parada.cor !== null && <Ponto cor={parada.cor} />}
                  <span
                    className={clsx(
                      'truncate text-corpo',
                      ativo ? 'font-medium text-primaria-legivel' : 'text-texto',
                    )}
                  >
                    {parada.titulo}
                  </span>
                  <span className="mv-numero ml-auto shrink-0 text-micro text-texto-fraco">
                    {parada.preenchidos}/{parada.itens}
                  </span>
                </span>
                {parada.subtitulo !== null && (
                  <span className="truncate text-micro text-texto-fraco">{parada.subtitulo}</span>
                )}
                <span
                  className="h-0.5 w-full overflow-hidden rounded-full bg-superficie-3"
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
  )
}

/**
 * A navegação por setor: setor é galho, estoque de setor é folha.
 *
 * Clicar no **setor** abre o setor inteiro — e a folha se divide em blocos,
 * um por estoque de setor. Clicar num **estoque** estreita a folha só para
 * ele. É a diferença entre "conferir o Bar" e "estar de pé na Geladeira 1",
 * e as duas coisas acontecem no mesmo dia.
 *
 * Por isso o clique no setor também abre o galho: quem clicou no Bar quer
 * ver quais lugares existem dentro dele, sem ter que caçar uma setinha. A
 * setinha existe para o caso contrário — espiar os lugares de um setor sem
 * sair de onde se está contando.
 */
function NavegacaoPorSetor({
  ramos,
  escolhida,
  aoEscolher,
}: {
  ramos: readonly RamoDeSetor[]
  escolhida: string | null
  aoEscolher: (id: string) => void
}): JSX.Element {
  // Só o que foi mexido na mão fica aqui. O resto se decide pela seleção —
  // assim o galho de quem está contando já nasce aberto, inclusive quando a
  // tela recarrega e a seleção volta do zero.
  const [mexidos, setMexidos] = useState<Record<string, boolean>>({})

  const pertence = (ramo: RamoDeSetor): boolean =>
    escolhida === chaveDoSetor(ramo.setorId) ||
    ramo.lugares.some((l) => l.id === escolhida)

  const alternar = (setorId: string, aberto: boolean) =>
    setMexidos((antes) => ({ ...antes, [setorId]: !aberto }))

  return (
    <nav aria-label="Setores e estoques da contagem" className="min-w-0">
      <ul className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto pb-1 lg:max-h-[70vh] lg:pb-0">
        {ramos.map((ramo) => {
          const chave = chaveDoSetor(ramo.setorId)
          const temLugares = ramo.lugares.length > 0
          const aberto = temLugares && (mexidos[ramo.setorId] ?? pertence(ramo))
          const ativo = escolhida === chave
          const progresso = ramo.itens === 0 ? 0 : (ramo.preenchidos / ramo.itens) * 100
          return (
            <li key={ramo.setorId} className="min-w-0">
              <div className="flex items-stretch">
                <button
                  type="button"
                  aria-current={ativo ? 'true' : undefined}
                  onClick={() => {
                    aoEscolher(chave)
                    // Escolher o setor é pedir para ver o que tem dentro.
                    if (temLugares) setMexidos((antes) => ({ ...antes, [ramo.setorId]: true }))
                  }}
                  className={clsx(
                    'flex min-h-toque min-w-0 flex-1 flex-col justify-center gap-1 rounded-marca-p',
                    'border-l-2 px-3 py-1.5 text-left transition-colors',
                    ativo
                      ? 'border-l-primaria bg-primaria-16'
                      : 'border-l-transparent hover:bg-primaria-06',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Ponto cor={ramo.cor} />
                    <span
                      className={clsx(
                        'truncate text-corpo',
                        ativo ? 'font-medium text-primaria-legivel' : 'text-texto',
                      )}
                    >
                      {ramo.nome}
                    </span>
                    <span className="mv-numero ml-auto shrink-0 text-micro text-texto-fraco">
                      {ramo.preenchidos}/{ramo.itens}
                    </span>
                  </span>
                  <span
                    className="h-0.5 w-full overflow-hidden rounded-full bg-superficie-3"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-primaria transition-[width]"
                      style={{ width: `${progresso}%` }}
                    />
                  </span>
                </button>
                {temLugares && (
                  <button
                    type="button"
                    onClick={() => alternar(ramo.setorId, aberto)}
                    aria-expanded={aberto}
                    aria-label={
                      aberto
                        ? `Esconder os estoques de ${ramo.nome}`
                        : `Ver os ${ramo.lugares.length} estoques de ${ramo.nome}`
                    }
                    className={clsx(
                      'flex min-h-toque w-10 shrink-0 items-center justify-center rounded-marca-p',
                      'text-texto-fraco transition-colors hover:bg-primaria-06 hover:text-texto',
                    )}
                  >
                    {aberto ? (
                      <ChevronDown className="size-4" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden />
                    )}
                  </button>
                )}
              </div>
              {aberto && (
                <ul className="ml-3 flex flex-col gap-0.5 border-l border-borda pl-1">
                  {ramo.lugares.map((lugar) => {
                    const dentro = lugar.id === escolhida
                    const andar = lugar.itens === 0 ? 0 : (lugar.preenchidos / lugar.itens) * 100
                    return (
                      <li key={lugar.id} className="min-w-0">
                        <button
                          type="button"
                          aria-current={dentro ? 'true' : undefined}
                          onClick={() => aoEscolher(lugar.id)}
                          className={clsx(
                            'flex min-h-toque w-full min-w-0 flex-col justify-center gap-1',
                            'rounded-marca-p border-l-2 px-3 py-1.5 text-left transition-colors',
                            dentro
                              ? 'border-l-primaria bg-primaria-16'
                              : 'border-l-transparent hover:bg-primaria-06',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={clsx(
                                'truncate text-micro',
                                dentro ? 'font-medium text-primaria-legivel' : 'text-texto-fraco',
                              )}
                            >
                              {lugar.titulo}
                            </span>
                            <span className="mv-numero ml-auto shrink-0 text-micro text-texto-fraco">
                              {lugar.preenchidos}/{lugar.itens}
                            </span>
                          </span>
                          <span
                            className="h-0.5 w-full overflow-hidden rounded-full bg-superficie-3"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full bg-primaria transition-[width]"
                              style={{ width: `${andar}%` }}
                            />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ────────────────────────────────────── a revisão antes de entregar ─────── */

/**
 * O passo que faltava entre contar e entregar.
 *
 * Quem conta duzentos itens de pé não lembra se pulou algum — e o item pulado
 * não se parece com nada na tela: ele é só uma linha em branco no meio de
 * outras duzentas. Esta tela mostra a conta antes de assinar: quantos foram
 * respondidos, quantos ficaram em branco, e QUAIS são.
 *
 * **Zero é resposta; branco não é.** É por isso que a entrega não sai com item
 * em branco — nem aqui, nem no servidor. "Zero" significa "acabou", e entra no
 * CMV; branco significa "não sei", e não existe conta de estoque com "não sei"
 * no meio. O atalho para responder tudo com zero existe, mas diz quantos são
 * antes: zerar duzentos itens sem ler o número seria assinar sem olhar.
 */
function RevisarAntesDeEntregar({
  entrega,
  itensDoSetor,
  zerando,
  entregando,
  aoZerar,
  aoEntregar,
  aoFechar,
}: {
  entrega: EntregaDeSetor
  itensDoSetor: readonly ItemContavel[]
  zerando: boolean
  entregando: boolean
  aoZerar: () => void
  aoEntregar: () => void
  aoFechar: () => void
}): JSX.Element {
  const emBranco = itensDoSetor.filter((i) => i.contado_em === null)
  const zerados = itensDoSetor.filter((i) => i.contado_em !== null && i.quantidade === 0).length
  const comQuantidade = itensDoSetor.filter((i) => i.quantidade > 0).length
  const pendentes = emBranco.length
  const MOSTRA = 12

  return (
    <Dialogo
      titulo={`Revisar ${entrega.setor_nome} antes de entregar`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao tom="fantasma" onClick={aoFechar}>
            Continuar contando
          </Botao>
          {pendentes > 0 ? (
            <Botao tom="secundario" carregando={zerando} onClick={aoZerar}>
              Marcar {pendentes === 1 ? 'o item' : `os ${pendentes} itens`} em branco como zero
            </Botao>
          ) : (
            <Botao
              tom="primario"
              icone={<ClipboardCheck className="size-4" aria-hidden />}
              carregando={entregando}
              onClick={aoEntregar}
            >
              Entregar {entrega.setor_nome}
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <dl className="mv-numero grid grid-cols-3 gap-3 text-center">
          <div className="rounded-marca-p bg-superficie-2 p-3">
            <dt className="text-micro text-texto-fraco">com quantidade</dt>
            <dd className="text-destaque text-texto">{comQuantidade}</dd>
          </div>
          <div className="rounded-marca-p bg-superficie-2 p-3">
            <dt className="text-micro text-texto-fraco">zerados</dt>
            <dd className="text-destaque text-texto">{zerados}</dd>
          </div>
          <div
            className={clsx(
              'rounded-marca-p p-3',
              pendentes > 0 ? 'bg-alerta-fundo' : 'bg-superficie-2',
            )}
          >
            <dt className="text-micro text-texto-fraco">em branco</dt>
            <dd
              className={clsx(
                'text-destaque',
                pendentes > 0 ? 'text-alerta-texto' : 'text-texto',
              )}
            >
              {pendentes}
            </dd>
          </div>
        </dl>

        {pendentes > 0 ? (
          <>
            <p className="text-corpo leading-relaxed text-texto-suave">
              <strong className="text-texto">Zero é resposta; em branco não é.</strong> Um item sem
              quantidade pode significar "acabou" ou "esqueci", e a diferença entre os dois é um CMV
              errado. Volte e responda, ou marque todos como zero de uma vez.
            </p>
            <div className="rounded-marca border border-borda">
              <ul className="max-h-48 divide-y divide-borda/60 overflow-y-auto">
                {emBranco.slice(0, MOSTRA).map((item) => (
                  <li key={item.id} className="truncate px-3 py-2 text-apoio text-texto">
                    {item.produto?.nome ?? 'Insumo removido do cadastro'}
                  </li>
                ))}
              </ul>
              {pendentes > MOSTRA && (
                <p className="border-t border-borda px-3 py-2 text-micro text-texto-fraco">
                  e mais {pendentes - MOSTRA}. Feche esta janela e use o filtro{' '}
                  <strong className="text-texto-suave">Pendentes</strong> para ver todos.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-corpo leading-relaxed text-texto-suave">
              Tudo respondido. O seu setor soma{' '}
              <strong className="mv-numero text-texto">{dinheiro(entrega.total)}</strong> em{' '}
              {entrega.itens} {plural(entrega.itens, 'item', 'itens')}.
            </p>
            <Aviso tom="info" titulo="Depois de entregar">
              A folha do seu setor fica travada e a contagem vai para o histórico. Se perceber um
              erro, o botão <strong className="text-texto-suave">Recontar</strong> destrava — e fica
              registrado que houve recontagem.
            </Aviso>
          </>
        )}
      </div>
    </Dialogo>
  )
}

/* ──────────────────────────────────────────── o andamento das entregas ──── */

/**
 * Quem já terminou, e quanto entregou.
 *
 * Antes disto, "a contagem está pronta?" era uma pergunta de WhatsApp. O
 * gerente olhava a folha inteira e não tinha como saber se o bar ainda estava
 * contando ou se tinha acabado com metade zerada.
 *
 * Cada linha diz o que importa para decidir: quantos itens, quantos ainda em
 * branco, quanto soma, e — quando entregue — quem entregou e quando.
 */
function QuadroDeEntregas({
  entregas,
  podeRecontar,
  meusSetores,
  recontando,
  aoRecontar,
}: {
  entregas: readonly EntregaDeSetor[]
  podeRecontar: boolean
  /** Nulo para quem enxerga a casa inteira. */
  meusSetores: readonly string[] | null
  recontando: boolean
  aoRecontar: (entrega: EntregaDeSetor) => void
}): JSX.Element {
  const entregues = entregas.filter((e) => e.entregue_em !== null).length
  return (
    <Cartao>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-3">
        <h2 className="font-titulo text-destaque font-semibold text-texto">
          {meusSetores ? 'A sua entrega' : 'Entregas por setor'}
        </h2>
        <span className="mv-numero text-apoio text-texto-fraco" role="status">
          {entregues} de {entregas.length} {plural(entregas.length, 'setor', 'setores')} entregue
          {entregues === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="divide-y divide-borda/60">
        {entregas.map((entrega) => {
          const entregue = entrega.entregue_em !== null
          const meu = meusSetores === null || meusSetores.includes(entrega.setor_id)
          return (
            <li
              key={entrega.setor_id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {entrega.setor_cor !== null && <Ponto cor={entrega.setor_cor} />}
                <span className="truncate text-corpo text-texto">{entrega.setor_nome}</span>
              </span>

              <span className="mv-numero shrink-0 text-apoio text-texto-fraco">
                {entrega.respondidos}/{entrega.itens}
                {entrega.pendentes > 0 && (
                  <span className="text-alerta-texto">
                    {' '}
                    · {entrega.pendentes} em branco
                  </span>
                )}
              </span>

              <span className="mv-numero shrink-0 text-apoio text-texto-suave">
                {dinheiro(entrega.total)}
              </span>

              <span className="shrink-0">
                {entregue ? (
                  <Selo tom="sucesso">
                    <CheckCircle2 className="size-3.5" aria-hidden /> entregue
                  </Selo>
                ) : (
                  <Selo tom="neutro">contando</Selo>
                )}
              </span>

              {entregue && (
                <span className="w-full text-micro text-texto-fraco sm:w-auto">
                  {entrega.entregue_por_nome ?? 'alguém'} · {dataHora(entrega.entregue_em)}
                </span>
              )}

              {entregue && podeRecontar && meu && (
                <Botao
                  tom="fantasma"
                  tamanho="p"
                  carregando={recontando}
                  onClick={() => aoRecontar(entrega)}
                >
                  Recontar
                </Botao>
              )}
            </li>
          )
        })}
      </ul>
    </Cartao>
  )
}
