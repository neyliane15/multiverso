/**
 * Módulo 2 · a planilha do PDV virando lançamento de vendas, e a conferência
 * das linhas que ficaram pendentes.
 *
 * Duas telas num arquivo, porque são dois momentos do mesmo trabalho:
 *
 *  · `PainelDaPlanilha` — lê o .xlsx no navegador, mostra a prévia agregada
 *    (11.198 linhas de cupom viram 136 linhas), e grava quando a pessoa
 *    confirma. Nada vai para o banco antes.
 *  · `ConferenciaDeVenda` — a lista das linhas gravadas, pendente em cima,
 *    ordenada pelo dinheiro. É o mesmo molde de `compras/Conferencia.tsx`, e
 *    pelo mesmo motivo: linha errada envenena o CMV em silêncio, linha pendente
 *    é um incômodo de dois cliques.
 *
 * A ordem por DINHEIRO não é enfeite. Na planilha de setembro, 91 nomes ficam
 * pendentes e eles valem R$ 175.405,45 — mas dez deles valem R$ 97.561,76.
 * Resolver os dez primeiros é resolver 56% do faturamento pendente.
 */
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  HandCoins,
  Package,
  Search,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import clsx from 'clsx'
import {
  chaves,
  useFichas,
  useItensDaVenda,
  useProdutos,
  useResolverItemDaVenda,
  useVendaApelidos,
  type ItemDeVenda,
} from '@/dados/consultas'
import { ErroDePlanilha, lerXlsx } from '@/dados/planilha/lerXlsx'
import { lerVendasDaPlanilha, type PlanilhaDeVendas as Planilha } from '@/dados/planilha/vendas'
import {
  fatorParaInsumo,
  pareceServico,
  sugerirAlvos,
  type AlvoDeVenda,
  type ApelidoDeVenda,
} from '@/dados/planilha/dePara'
import type { FichaCompleta, ProdutoCompleto, Venda } from '@/tipos/banco'
import {
  importarVendasDaPlanilha,
  resolverLinhasDeVenda,
  type LinhaResolvida,
} from './importarPlanilhaDeVendas'
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Rotulo,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { PainelLateral } from '../PainelLateral'
import { data as formatarData, dinheiro, porcentagem, quantidade } from '@/util/formato'

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/**
 * Abaixo disto a parecença não vira botão.
 *
 * Medido na planilha de setembro: com piso zero, 96 linhas pendentes ganhavam
 * três botões cada, e nas maiores eles eram todos absurdos — "COUVE FLOR" para
 * "COUVERT ARTISTICO 20 REAIS". O valor é o mesmo `CONFIANCA_MINIMA` de
 * `casarProdutos.ts`: abaixo dele a casa já decidiu que ninguém vincula.
 */
const PISO_DA_SUGESTAO = 0.72

const ROTULO_DO_ALVO: Record<AlvoDeVenda, string> = {
  ficha: 'Ficha do cardápio',
  produto: 'Insumo direto',
  servico: 'Serviço',
  pendente: 'Sem alvo',
}

const TOM_DO_ALVO: Record<AlvoDeVenda, 'sucesso' | 'marca' | 'info' | 'alerta'> = {
  ficha: 'sucesso',
  produto: 'marca',
  servico: 'info',
  pendente: 'alerta',
}

/** Os apelidos como o de-para os espera. */
function paraApelidos(linhas: { apelido: string; alvo: AlvoDeVenda; ficha_id: string | null; produto_id: string | null }[]): ApelidoDeVenda[] {
  return linhas.map((l) => ({
    apelido: l.apelido,
    alvo: l.alvo,
    ficha_id: l.ficha_id,
    produto_id: l.produto_id,
  }))
}

/* ─────────────────────────────────────────────── 1 · importar a planilha ── */

export function PainelDaPlanilha({
  restauranteId,
  aoFechar,
  aoImportar,
}: {
  restauranteId: string
  aoFechar: () => void
  aoImportar: (vendaId: string) => void
}) {
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const fichas = useFichas(restauranteId)
  const produtos = useProdutos(restauranteId)
  const apelidos = useVendaApelidos(restauranteId)

  const [lendo, setLendo] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ planilha: Planilha; nome: string } | null>(null)
  const [referencia, setReferencia] = useState('')
  const [titulo, setTitulo] = useState('')

  const resolvidas = useMemo((): LinhaResolvida[] => {
    if (!previa || !fichas.data || !produtos.data) return []
    return resolverLinhasDeVenda({
      planilha: previa.planilha,
      fichas: fichas.data,
      produtos: produtos.data,
      apelidos: paraApelidos(apelidos.data ?? []),
    })
  }, [previa, fichas.data, produtos.data, apelidos.data])

  const resumo = useMemo(() => {
    const alvos: AlvoDeVenda[] = ['ficha', 'produto', 'servico', 'pendente']
    return alvos.map((alvo) => {
      const linhas = resolvidas.filter((l) => l.alvo === alvo)
      return {
        alvo,
        itens: linhas.length,
        valor: linhas.reduce((soma, l) => soma + Math.round(l.valorTotal * 100), 0) / 100,
      }
    })
  }, [resolvidas])

  async function receberArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setPrevia(null)
    setLendo(true)
    try {
      const aba = await lerXlsx(await arquivo.arrayBuffer())
      const planilha = lerVendasDaPlanilha(aba)
      setPrevia({ planilha, nome: arquivo.name })
      setReferencia(planilha.referencia)
    } catch (falha) {
      setErro(
        falha instanceof ErroDePlanilha
          ? falha.message
          : `Não consegui ler "${arquivo.name}": ${mensagemDoErro(falha)}`,
      )
    } finally {
      setLendo(false)
    }
  }

  async function gravar() {
    if (!previa) return
    setErro(null)
    setGravando(true)
    try {
      const saida = await importarVendasDaPlanilha({
        restauranteId,
        planilha: previa.planilha,
        arquivoNome: previa.nome,
        fichas: fichas.data ?? [],
        produtos: produtos.data ?? [],
        apelidos: paraApelidos(apelidos.data ?? []),
        referencia: referencia === '' ? undefined : referencia,
        titulo: titulo.trim() === '' ? null : titulo.trim(),
      })
      await qc.invalidateQueries({ queryKey: chaves.vendas(restauranteId) })
      await qc.invalidateQueries({ queryKey: chaves.vendaApelidos(restauranteId) })
      aoImportar(saida.vendaId)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setGravando(false)
    }
  }

  const carregando = fichas.isLoading || produtos.isLoading || apelidos.isLoading
  const total = previa?.planilha.total ?? 0

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo="Importar planilha do PDV"
      descricao="Uma linha por item de cupom. O sistema agrega por produto e por período antes de gravar."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao tom="fantasma" disabled={gravando} onClick={aoFechar}>
            Cancelar
          </Botao>
          {previa && (
            <Botao tom="primario" carregando={gravando} onClick={() => void gravar()}>
              Importar {resolvidas.length} {plural(resolvidas.length, 'linha', 'linhas')}
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <Aviso tom="info" titulo="O que a importação faz, e o que ela não decide">
          <p className="mt-1">
            Ela soma as linhas de cupom por produto — <strong>11.198 viram 136</strong> no arquivo
            de um mês — e guarda o faturamento como o PDV faturou. O desconto já vem dentro do
            preço final e não é subtraído de novo.
          </p>
          <p className="mt-1">
            Ela <strong>não</strong> adivinha o que cada nome é. Casam sozinhos o nome idêntico ao
            da ficha ou do insumo e o que você já vinculou antes; o resto fica pendente. É de
            propósito: <em>AMSTEL CHOPP 300 ML</em> e <em>AMSTEL CHOPP 300 ML HH</em> são produtos
            diferentes e nenhuma parecença de texto os separa.
          </p>
        </Aviso>

        <div>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              void receberArquivo(e.target.files?.[0])
              e.target.value = ''
            }}
            aria-label="Escolher a planilha de faturamento"
          />
          <Botao
            tom="secundario"
            carregando={lendo}
            icone={<UploadCloud className="size-4" aria-hidden />}
            onClick={() => entrada.current?.click()}
          >
            {previa ? 'Escolher outra planilha' : 'Escolher planilha'}
          </Botao>
          {previa && (
            <span className="ml-3 text-apoio text-texto-fraco">
              {previa.nome} · aba "{previa.planilha.aba}"
            </span>
          )}
        </div>

        {erro && (
          <Aviso tom="erro" titulo="Não deu para ler a planilha">
            {erro}
          </Aviso>
        )}

        {carregando && <Carregando linhas={2} />}
        {fichas.isError && <ErroDaConsulta erro={fichas.error} />}

        {previa && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Indicador
                rotulo="Faturamento da planilha"
                valor={dinheiro(total)}
                tom="marca"
                apoio={`${quantidade(previa.planilha.linhas)} linhas de cupom em ${quantidade(previa.planilha.dias)} ${plural(previa.planilha.dias, 'dia de caixa', 'dias de caixa')}.`}
              />
              <Indicador
                rotulo="Período da planilha"
                valor={`${formatarData(previa.planilha.inicio)} – ${formatarData(previa.planilha.referencia)}`}
                apoio={`Bruto ${dinheiro(previa.planilha.totalBruto)} menos ${dinheiro(previa.planilha.totalDesconto)} de desconto.`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Rotulo para="planilha-referencia">Fim do período</Rotulo>
                <Campo
                  id="planilha-referencia"
                  type="date"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className="mt-1.5"
                />
                {/* É a data que o relatório compara com a contagem, e a que o
                    CMV usa para somar o faturamento do período. */}
                <p className="mt-1.5 text-micro leading-snug text-texto-fraco">
                  Vem da última data de caixa da planilha. É esta data que o relatório compara com
                  a contagem e que o CMV usa para achar o faturamento do mês.
                </p>
              </div>
              <div>
                <Rotulo para="planilha-titulo">Nome (opcional)</Rotulo>
                <Campo
                  id="planilha-titulo"
                  value={titulo}
                  placeholder="Setembro/2026"
                  onChange={(e) => setTitulo(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            {previa.planilha.avisos.length > 0 && (
              <Aviso tom="alerta" titulo="A leitura deixou observações">
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {previa.planilha.avisos.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              </Aviso>
            )}

            <div className="rounded-marca border border-borda">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Como vai entrar</Th>
                    <Th numerico>Itens</Th>
                    <Th numerico>Faturamento</Th>
                    <Th numerico>Fatia</Th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((linha) => (
                    <tr key={linha.alvo}>
                      <Td>
                        <Selo tom={TOM_DO_ALVO[linha.alvo]}>{ROTULO_DO_ALVO[linha.alvo]}</Selo>
                      </Td>
                      <Td numerico>{quantidade(linha.itens)}</Td>
                      <Td numerico className="font-semibold">
                        {dinheiro(linha.valor)}
                      </Td>
                      <Td numerico className="text-texto-fraco">
                        {total > 0 ? porcentagem((linha.valor / total) * 100) : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>

            <Aviso tom="info" titulo="O lançamento nasce aberto">
              Aberto, ele não entra em conta nenhuma — nem no faturamento do CMV, nem no relatório
              de contagem. Depois de importar, resolva as linhas pendentes e feche: o banco{' '}
              <strong>recusa fechar</strong> com linha sem alvo, do mesmo jeito que recusa lançar
              nota com item pendente.
            </Aviso>
          </>
        )}
      </div>
    </PainelLateral>
  )
}

/* ──────────────────────────────────── 2 · conferir o que foi importado ──── */

export function ConferenciaDeVenda({
  restauranteId,
  venda,
  aoFechar,
  aoFalhar,
}: {
  restauranteId: string
  venda: Venda
  aoFechar: () => void
  aoFalhar: (mensagem: string) => void
}) {
  const itens = useItensDaVenda(venda.id)
  const fichas = useFichas(restauranteId)
  const produtos = useProdutos(restauranteId)
  const resolver = useResolverItemDaVenda(restauranteId, venda.id)
  const [soPendentes, setSoPendentes] = useState(true)

  const lista = useMemo(() => itens.data ?? [], [itens.data])
  const vendaveis = useMemo(
    () => (fichas.data ?? []).filter((f) => f.ativo && !f.producao),
    [fichas.data],
  )
  const catalogo = useMemo(() => (produtos.data ?? []).filter((p) => p.ativo), [produtos.data])

  const resumo = useMemo(() => {
    const porAlvo = { ficha: 0, produto: 0, servico: 0, pendente: 0 }
    let total = 0
    let pendente = 0
    for (const item of lista) {
      porAlvo[item.alvo] += 1
      const valor = item.valor_total_origem ?? item.total
      total = Math.round((total + valor) * 100) / 100
      if (item.alvo === 'pendente') pendente = Math.round((pendente + valor) * 100) / 100
    }
    return { porAlvo, total, pendente }
  }, [lista])

  /**
   * Qual linha do PDV já ocupa cada ficha e cada insumo deste lançamento.
   *
   * Serve para avisar antes do clique: vincular a um alvo que já tem linha
   * **funde as duas** (`mv_resolver_item_de_venda`) — soma quantidade, dinheiro
   * e cupons, e apaga a linha clicada. É o certo a fazer, e é irreversível:
   * depois da fusão não há como separar de novo, só os dois nomes guardados em
   * `descricao_origem`. A tela dizia nada sobre isso.
   */
  const jaOcupados = useMemo(() => {
    const porAlvo = new Map<string, string>()
    for (const i of lista) {
      const chave = i.ficha_id !== null ? `ficha:${i.ficha_id}` : i.produto_id !== null ? `produto:${i.produto_id}` : null
      if (chave !== null) porAlvo.set(chave, i.descricao_origem ?? 'outra linha')
    }
    return porAlvo
  }, [lista])

  const visiveis = soPendentes ? lista.filter((i) => i.alvo === 'pendente') : lista
  const trancado = venda.status === 'fechada'

  async function aplicar(item: ItemDeVenda, alvo: AlvoDeVenda, id: string | null) {
    try {
      await resolver.mutateAsync({
        itemId: item.id,
        alvo,
        fichaId: alvo === 'ficha' ? id : null,
        produtoId: alvo === 'produto' ? id : null,
      })
    } catch (falha) {
      aoFalhar(`${item.descricao_origem ?? 'linha'}: ${mensagemDoErro(falha)}`)
    }
  }

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={venda.titulo ?? `Vendas até ${formatarData(venda.referencia)}`}
      descricao={
        trancado
          ? 'Este lançamento está fechado: as linhas são foto e não se mexem. Reabra-o na lista para corrigir.'
          : 'Diga o que cada linha do PDV é. Enquanto houver pendente, o lançamento não fecha e não entra em conta nenhuma.'
      }
      aoFechar={aoFechar}
      rodape={
        <Botao tom="fantasma" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="space-y-5">
        {/* Dois por linha, e não quatro: R$ 255.417,78 em `text-tela` não cabe
            num quarto da largura do painel, e o número saía cortado no meio. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Indicador
            rotulo="Faturamento"
            valor={dinheiro(resumo.total)}
            tom="marca"
            apoio={`${quantidade(lista.length)} ${plural(lista.length, 'linha', 'linhas')} no lançamento.`}
          />
          <Indicador
            rotulo="Resolvidas"
            valor={quantidade(resumo.porAlvo.ficha + resumo.porAlvo.produto + resumo.porAlvo.servico)}
            apoio={`${resumo.porAlvo.ficha} em ficha · ${resumo.porAlvo.produto} em insumo · ${resumo.porAlvo.servico} serviço`}
          />
          <Indicador
            rotulo="Pendentes"
            valor={quantidade(resumo.porAlvo.pendente)}
            tom={resumo.porAlvo.pendente > 0 ? 'alerta' : 'sucesso'}
            apoio={
              resumo.porAlvo.pendente > 0
                ? `${dinheiro(resumo.pendente)} sem destino.`
                : 'Tudo pronto para fechar.'
            }
          />
          <Indicador
            rotulo="Serviço"
            valor={
              resumo.total > 0
                ? porcentagem(
                    (lista
                      .filter((i) => i.alvo === 'servico')
                      .reduce((s, i) => s + (i.valor_total_origem ?? i.total), 0) /
                      resumo.total) *
                      100,
                  )
                : '—'
            }
            apoio="Couvert e taxa: faturam e não consomem insumo."
          />
        </div>

        {resumo.porAlvo.pendente > 0 && !trancado && (
          <Aviso
            tom="alerta"
            titulo={`${resumo.porAlvo.pendente} ${plural(resumo.porAlvo.pendente, 'linha sem destino', 'linhas sem destino')}`}
          >
            O banco recusa fechar o lançamento assim, e faz bem: o faturamento dessas linhas não
            teria em que entrar e o consumo delas não existiria. Comece pelas de cima — elas estão
            ordenadas pelo dinheiro.
          </Aviso>
        )}

        {itens.isLoading ? (
          <Carregando linhas={6} />
        ) : itens.isError ? (
          <ErroDaConsulta erro={itens.error} aoTentar={() => void itens.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Lançamento sem linha nenhuma">
            Nada foi importado para este período.
          </EstadoVazio>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Botao
                tom={soPendentes ? 'primario' : 'secundario'}
                tamanho="p"
                onClick={() => setSoPendentes(true)}
              >
                Só pendentes ({resumo.porAlvo.pendente})
              </Botao>
              <Botao
                tom={soPendentes ? 'secundario' : 'primario'}
                tamanho="p"
                onClick={() => setSoPendentes(false)}
              >
                Todas ({lista.length})
              </Botao>
            </div>

            {visiveis.length === 0 ? (
              <EstadoVazio icone={<CheckCircle2 />} titulo="Nenhuma linha pendente">
                Todas as linhas deste lançamento já dizem o que são.
              </EstadoVazio>
            ) : (
              <ul className="divide-y divide-borda/60 rounded-marca border border-borda">
                {visiveis.map((item) => (
                  <LinhaDeVenda
                    key={item.id}
                    item={item}
                    fichas={vendaveis}
                    produtos={catalogo}
                    jaOcupados={jaOcupados}
                    bloqueado={trancado || resolver.isPending}
                    aoAplicar={(alvo, id) => void aplicar(item, alvo, id)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </PainelLateral>
  )
}

/* ─────────────────────────────────────────────────────── uma linha do PDV ── */

function LinhaDeVenda({
  item,
  fichas,
  produtos,
  jaOcupados,
  bloqueado,
  aoAplicar,
}: {
  item: ItemDeVenda
  fichas: FichaCompleta[]
  produtos: ProdutoCompleto[]
  /** `ficha:<id>` ou `produto:<id>` -> o nome do PDV que já ocupa aquele alvo. */
  jaOcupados: Map<string, string>
  bloqueado: boolean
  aoAplicar: (alvo: AlvoDeVenda, id: string | null) => void
}) {
  const pendente = item.alvo === 'pendente'
  const [busca, setBusca] = useState('')
  const valor = item.valor_total_origem ?? item.total
  const cheiroDeServico = pendente && pareceServico(item.descricao_origem ?? '')

  // A parecença custa 975 contas por linha e só serve para a linha pendente que
  // está na tela: calculada aqui, sob demanda, e não para as 136 de uma vez.
  //
  // O piso de confiança não é enfeite. Sem ele, COUVERT ARTISTICO 20 REAIS —
  // R$ 24.281,75, a maior linha do mês — vinha com "COUVE FLOR 13%" como botão
  // de um clique, e um botão convida a ser clicado. Sugestão abaixo do piso não
  // é sugestão, é ruído que só pode causar estrago: ela desaparece, e sobra a
  // busca, que obriga quem vincula a digitar o que está vinculando.
  const sugestoes = useMemo(
    () =>
      pendente
        ? sugerirAlvos(item.descricao_origem ?? '', { fichas, produtos }, 3).filter(
            (s) => s.confianca >= PISO_DA_SUGESTAO,
          )
        : [],
    [pendente, item.descricao_origem, fichas, produtos],
  )

  /**
   * A conversão da unidade do PDV para a do insumo, para a linha já resolvida e
   * para cada candidato a um clique.
   *
   * Nenhuma tela dizia isto antes, e com o catálogo do primeiro cliente são 362
   * insumos contados em KG contra 476 em UND: `PASTEL DE CAMARAO UND` tem botão
   * de 75% para o insumo `PASTEL DE CAMARÃO`, que é contado em KG. O clique
   * parece inocente e cria uma linha sem conversão possível.
   */
  const fatorDeInsumo = useMemo(() => {
    const porId = new Map<string, number | null>()
    for (const p of produtos) porId.set(p.id, fatorParaInsumo(item.unidade, p))
    return porId
  }, [produtos, item.unidade])

  const fatorDoItem =
    item.alvo === 'produto' && item.produto_id !== null
      ? (fatorDeInsumo.get(item.produto_id) ?? null)
      : null

  /** Com quem este alvo vai FUNDIR, se já houver linha nele. */
  function fundeCom(tipo: 'ficha' | 'produto', id: string): string | null {
    const dono = jaOcupados.get(`${tipo}:${id}`)
    return dono === undefined || dono === item.descricao_origem ? null : dono
  }

  /** `KG ≠ UND`: o selo que o botão de um clique passa a carregar. */
  function semConversao(tipo: 'ficha' | 'produto', id: string): string | null {
    if (tipo !== 'produto') return null
    if (fatorDeInsumo.get(id) !== null) return null
    const alvo = produtos.find((p) => p.id === id)
    return alvo ? `${item.unidade ?? alvo.unidade} ≠ ${alvo.unidade}` : null
  }

  const candidatos = useMemo(() => {
    if (busca.trim() === '') return []
    const alvo = busca.toLowerCase()
    return [
      ...fichas
        .filter((f) => f.nome.toLowerCase().includes(alvo))
        .map((f) => ({ tipo: 'ficha' as const, id: f.id, nome: f.nome })),
      ...produtos
        .filter((p) => p.nome.toLowerCase().includes(alvo))
        .map((p) => ({ tipo: 'produto' as const, id: p.id, nome: p.nome })),
    ].slice(0, 8)
  }, [busca, fichas, produtos])

  return (
    <li
      className={clsx(
        'grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]',
        pendente && 'border-l-[3px] border-l-alerta bg-alerta-suave/40',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-corpo text-texto">{item.descricao_origem ?? '— sem nome —'}</span>
          <Selo tom={TOM_DO_ALVO[item.alvo]}>
            {pendente && <AlertTriangle className="size-3.5" aria-hidden />}
            {ROTULO_DO_ALVO[item.alvo]}
          </Selo>
        </div>
        <div className="mv-numero mt-0.5 text-micro text-texto-fraco">
          {quantidade(item.quantidade)} × {dinheiro(item.preco_unitario)} ={' '}
          <span className="font-semibold text-texto-suave">{dinheiro(valor)}</span>
          {item.linhas_de_origem !== null && (
            <> · somado de {quantidade(item.linhas_de_origem)} {plural(item.linhas_de_origem, 'cupom', 'cupons')}</>
          )}
          {/* O " + " no nome é o rastro da fusão: duas ou mais linhas do PDV
              viraram esta. Dizer em voz alta, e quantas, porque a fusão não se
              desfaz — e porque um vínculo errado junta nomes que não têm nada a
              ver um com o outro e some com a conferência por nome. */}
          {(item.descricao_origem ?? '').includes(' + ') && (
            <>
              {' '}
              ·{' '}
              <span className="text-texto-suave">
                {quantidade((item.descricao_origem ?? '').split(' + ').length)} nomes do PDV
                juntados nesta linha
              </span>
            </>
          )}
        </div>
        {item.alvo === 'ficha' && item.ficha && (
          <p className="flex items-center gap-1.5 text-micro text-sucesso-texto">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Entra na ficha {item.ficha.nome}
          </p>
        )}
        {item.alvo === 'produto' && item.produto && (
          /* O que esta linha vai CONSUMIR, convertido — ou o aviso de que não há
             conversão. Antes dizia "Consome 59 UND de X" para uma venda em KG,
             que é a frase errada de três jeitos: a unidade não é a da venda, o
             número não é o consumo, e o relatório vai marcar a linha. */
          fatorDoItem === null ? (
            <p className="flex items-center gap-1.5 text-micro text-alerta-texto">
              <AlertTriangle className="size-3.5" aria-hidden />
              A venda está em {item.unidade} e {item.produto.nome} é contado em{' '}
              {item.produto.unidade}: não há conversão entre as duas, e esta linha sai marcada no
              relatório de contagem em vez de virar consumo.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-micro text-primaria-legivel">
              <Package className="size-3.5" aria-hidden />
              Consome {quantidade(item.quantidade * fatorDoItem)} {item.produto.unidade} de{' '}
              {item.produto.nome}
              {fatorDoItem !== 1 && (
                <span className="text-texto-fraco">
                  ({quantidade(item.quantidade)} {item.unidade})
                </span>
              )}
            </p>
          )
        )}
        {item.alvo === 'servico' && (
          <p className="flex items-center gap-1.5 text-micro text-texto-fraco">
            <HandCoins className="size-3.5" aria-hidden />
            Fatura e não consome insumo nenhum.
          </p>
        )}
      </div>

      {pendente && !bloqueado && (
        <div className="space-y-2">
          {sugestoes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {sugestoes.map((s) => (
                <Botao
                  key={`${s.tipo}-${s.id}`}
                  tom="secundario"
                  tamanho="p"
                  icone={<Sparkles className="size-3.5" aria-hidden />}
                  onClick={() => aoAplicar(s.tipo, s.id)}
                >
                  {s.nome}{' '}
                  <span className="mv-numero ml-1 text-micro text-texto-fraco">
                    {Math.round(s.confianca * 100)}%
                  </span>
                  {semConversao(s.tipo, s.id) !== null && (
                    <span className="mv-numero ml-1 text-micro text-alerta-texto">
                      {semConversao(s.tipo, s.id)}
                    </span>
                  )}
                  {fundeCom(s.tipo, s.id) !== null && (
                    <span className="ml-1 text-micro text-texto-fraco">
                      · junta com &ldquo;{fundeCom(s.tipo, s.id)}&rdquo;
                    </span>
                  )}
                </Botao>
              ))}
            </div>
          )}

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
              aria-hidden
            />
            <Campo
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ficha ou insumo pelo nome"
              aria-label={`Buscar o que "${item.descricao_origem}" é`}
              className="pl-9"
            />
          </div>

          {candidatos.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {candidatos.map((c) => (
                <li key={`${c.tipo}-${c.id}`}>
                  <button
                    type="button"
                    onClick={() => aoAplicar(c.tipo, c.id)}
                    className="flex min-h-toque w-full items-center justify-between gap-3 rounded-marca-p border border-borda bg-superficie-2 px-3 text-left transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16"
                  >
                    <span className="min-w-0 truncate text-corpo text-texto">{c.nome}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {fundeCom(c.tipo, c.id) !== null && (
                        <Selo tom="info">junta com &ldquo;{fundeCom(c.tipo, c.id)}&rdquo;</Selo>
                      )}
                      {semConversao(c.tipo, c.id) !== null && (
                        <Selo tom="alerta">{semConversao(c.tipo, c.id)}</Selo>
                      )}
                      <Selo tom={c.tipo === 'ficha' ? 'sucesso' : 'marca'}>
                        {c.tipo === 'ficha' ? 'ficha' : 'insumo'}
                      </Selo>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Marcar como serviço é AFIRMAR que a linha não consome nada. O
              atalho fica aqui, separado da busca, e nunca é aplicado sozinho —
              nem quando o nome grita "couvert". O que a lista de palavras faz é
              só destacar o botão: a afirmação continua sendo de quem clica. */}
          <Botao
            tom={cheiroDeServico ? 'secundario' : 'fantasma'}
            tamanho="p"
            icone={<HandCoins className="size-3.5" aria-hidden />}
            onClick={() => aoAplicar('servico', null)}
          >
            É serviço: fatura e não consome insumo
          </Botao>
        </div>
      )}

      {!pendente && !bloqueado && (
        <div className="space-y-1.5">
          <label htmlFor={`alvo-${item.id}`} className="sr-only">
            Mudar o destino de {item.descricao_origem}
          </label>
          <Selecao
            id={`alvo-${item.id}`}
            value={item.alvo === 'ficha' ? `ficha:${item.ficha_id}` : item.alvo === 'produto' ? `produto:${item.produto_id}` : 'servico:'}
            onChange={(e) => {
              const [tipo, id] = e.target.value.split(':')
              aoAplicar(tipo as AlvoDeVenda, id === '' ? null : (id ?? null))
            }}
          >
            <option value="servico:">Serviço — fatura e não consome insumo</option>
            {fichas.map((f) => (
              <option key={f.id} value={`ficha:${f.id}`}>
                Ficha · {f.nome}
              </option>
            ))}
            {produtos.map((p) => (
              <option key={p.id} value={`produto:${p.id}`}>
                Insumo · {p.nome} ({p.unidade})
              </option>
            ))}
          </Selecao>
        </div>
      )}
    </li>
  )
}
