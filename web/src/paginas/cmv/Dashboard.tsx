/**
 * Módulo 4 · dashboard de CMV.
 *
 *        CMV = Estoque Inicial + Compras − Estoque Final
 *        CMV% = CMV / Faturamento
 *
 * A tela inteira gira em torno de uma regra: **número ausente, nunca número
 * inventado**. Quando `mv_cmv_periodo` devolve `completo = false`, o CMV volta
 * nulo com a pendência escrita — e aqui isso vira um período que continua no
 * eixo, com o motivo em texto e um caminho para resolver. Nada de zero, nada
 * de barra escondida, nada de período sumido da série.
 *
 * Desde a 0027 a tela tem denominador, e ele vem em DOIS, lado a lado, porque
 * foi a decisão da cliente: o CMV% sobre o faturamento TOTAL e o CMV% sobre o
 * faturamento de PRODUTO. A diferença entre os dois é couvert e taxa de
 * serviço, que faturam e não consomem insumo — R$ 53.049,68 em setembro de
 * 2026, 20,8% do faturamento do Bar do Zeca. Mostrar só o primeiro faria o CMV
 * parecer 20% melhor do que é; mostrar só o segundo esconderia um quinto do
 * dinheiro que entrou. A tela mostra os dois e escreve a diferença.
 *
 * Decisões de gráfico (skill `dataviz` + IDENTIDADE.md):
 *
 * - **Dois gráficos, nunca dois eixos Y.** O CMV é uma medida derivada; os três
 *   componentes são outra leitura. Empilhar tudo num plot só com duas escalas
 *   inventaria correlação. São dois plots, cada um com um eixo.
 * - **Cor segue a entidade.** CMV é sempre a série 1 (a matiz do restaurante);
 *   estoque inicial, compras e estoque final ficam nas séries 2, 3 e 4, nesta
 *   ordem, nos dois gráficos e na tabela. Filtrar ou trocar granularidade não
 *   repinta ninguém.
 * - **Legenda sempre que houver duas séries**, e rótulo direto só no período
 *   mais recente com número — valor em cima de toda barra vira ruído e ninguém
 *   lê; a tabela logo abaixo carrega o resto.
 * - **Tabela de apoio embaixo de cada gráfico.** Parte da paleta fica entre
 *   2,85:1 e 3:1 contra a superfície: com tabela, nenhum valor depende de
 *   enxergar a cor.
 * - **A abertura por categoria é tabela com barra, não gráfico.** São mais de
 *   sete categorias no cadastro real, e além de ~7 classes as cores encostam
 *   umas nas outras. A cor de cada categoria vem do banco, no `style`.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, ArrowRight, CalendarClock, SprayCan, Store, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import { useCmv, useCmvPorCategoria, useCmvSerie } from '@/dados/consultas'
import { useMarca } from '@/tema/ProvedorDeMarca'
import type { CmvPeriodo, CmvSerie } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Ponto,
  Selecao,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import {
  data as formatarData,
  dinheiro,
  dinheiroCompacto,
  porcentagem,
  quantidade,
} from '@/util/formato'
import {
  explicarPendencia,
  ordenarCategorias,
  periodoSugerido,
  pontosDaSerie,
  resumirSerie,
  type Granularidade,
} from './periodos'

const PERIODOS: Record<Granularidade, number> = { semanal: 8, mensal: 6 }

export function DashboardCmv() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Dashboard CMV" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver o CMV.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <CmvDoRestaurante restauranteId={restaurante.id} />
}

function CmvDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const { graficos } = useMarca()
  const [granularidade, setGranularidade] = useState<Granularidade>('mensal')
  const [periodoEscolhido, setPeriodoEscolhido] = useState<string | null>(null)

  const serie = useCmvSerie(restauranteId, granularidade, PERIODOS[granularidade])

  // Cor por entidade, na ordem fixa da paleta. A série 1 carrega a matiz do
  // restaurante e fica com o CMV, que é o número que a tela existe para dar.
  const cor = {
    cmv: graficos[0] ?? 'var(--mv-primaria)',
    estoqueInicial: graficos[1] ?? 'var(--mv-grafico-2)',
    compras: graficos[2] ?? 'var(--mv-grafico-3)',
    estoqueFinal: graficos[3] ?? 'var(--mv-grafico-4)',
  }

  const linhas = useMemo(() => serie.data ?? [], [serie.data])
  const pontos = useMemo(() => pontosDaSerie(linhas), [linhas])
  const resumo = useMemo(() => resumirSerie(linhas), [linhas])

  // O rótulo direto vai no período mais recente que tem número. Se o último
  // está incompleto, rotular ali seria rotular o vazio.
  const ultimoComCmv = pontos.reduce(
    (indice, ponto, i) => (ponto.cmv === null ? indice : i),
    -1,
  )

  const sugerido = periodoSugerido(linhas)
  const detalhe =
    linhas.find((l) => `${l.inicio}|${l.fim}` === periodoEscolhido) ?? sugerido ?? null

  const cabecalho = (
    <CabecalhoDePagina
      titulo="Dashboard CMV"
      descricao="Estoque inicial + compras − estoque final. Faltando contagem, o período aparece sem número e com o motivo."
      acoes={
        <div className="flex rounded-marca-p border border-borda p-0.5" role="group" aria-label="Granularidade">
          {(['semanal', 'mensal'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={granularidade === opcao}
              onClick={() => {
                setGranularidade(opcao)
                // O período escolhido pertencia à outra escala: volta ao
                // sugerido em vez de apontar para um intervalo que sumiu.
                setPeriodoEscolhido(null)
              }}
              className={clsx(
                'min-h-toque rounded-marca-interno px-4 text-corpo font-medium capitalize transition-colors',
                granularidade === opcao
                  ? 'bg-primaria text-sobre-primaria'
                  : 'text-texto-suave hover:text-texto',
              )}
            >
              {opcao}
            </button>
          ))}
        </div>
      }
    />
  )

  if (serie.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (serie.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta erro={serie.error} aoTentar={() => void serie.refetch()} />
        </Cartao>
      </>
    )
  }
  if (linhas.length === 0) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio
            icone={<TrendingUp />}
            titulo="Ainda não há série para mostrar"
            acao={
              <Botao tom="primario" onClick={() => navegar('/contagem')}>
                Abrir a primeira contagem
              </Botao>
            }
          >
            O CMV nasce de duas contagens fechadas e das notas lançadas entre elas.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  return (
    <>
      {cabecalho}

      {resumo.incompletos > 0 && (
        <Aviso
          tom="alerta"
          titulo={`${resumo.incompletos} de ${resumo.periodos} períodos sem CMV`}
        >
          Esses períodos aparecem na série com o motivo escrito, e não com zero: um CMV errado
          custa mais caro que um CMV ausente.
        </Aviso>
      )}

      {/* ─────────────────────────────── o número, por período escolhido ── */}
      <DetalheDoPeriodo
        restauranteId={restauranteId}
        periodo={detalhe}
        series={linhas}
        aoEscolher={setPeriodoEscolhido}
        cores={cor}
      />

      {/* ────────────────────────────────────────────── CMV por período ── */}
      <Cartao
        titulo={`CMV ${granularidade}`}
        descricao={
          resumo.cmvMedio === null
            ? 'Nenhum período fechado ainda.'
            : `Média dos períodos completos: ${dinheiro(resumo.cmvMedio)}.`
        }
      >
        <div className="p-5 pt-4">
          {/* O gráfico é a leitura rápida; quem usa leitor de tela recebe os
              mesmos números na tabela "De onde vem o CMV", logo abaixo. */}
          <div
            className="h-[260px] w-full"
            role="img"
            aria-label={`CMV por período, escala ${granularidade}. Os valores estão na tabela abaixo.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pontos} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--mv-borda)"
                  strokeWidth={1}
                />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--mv-borda)' }}
                  tick={{ fill: 'var(--mv-texto-fraco)', fontSize: 11 }}
                />
                <YAxis
                  width={72}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(valor: number) => dinheiroCompacto(valor)}
                  tick={{ fill: 'var(--mv-texto-fraco)', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--mv-primaria-06)' }}
                  content={<Dica pontos={pontos} />}
                />
                <Bar
                  dataKey="cmv"
                  name="CMV"
                  fill={cor.cmv}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                >
                  <LabelList dataKey="cmv" content={rotuloDoPeriodo(ultimoComCmv)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Período sem CMV não some do eixo, mas a barra ausente não explica
              nada sozinha — a explicação vem escrita logo abaixo. */}
          {pontos.some((p) => !p.completo) && (
            <ul className="mt-3 space-y-1.5">
              {pontos
                .filter((p) => !p.completo)
                .map((ponto) => {
                  const explicada = explicarPendencia({
                    inicio: ponto.inicio,
                    fim: ponto.fim,
                    estoque_inicial: ponto.estoqueInicial,
                    compras: ponto.compras,
                    estoque_final: ponto.estoqueFinal,
                    cmv: ponto.cmv,
                    completo: ponto.completo,
                    pendencia: ponto.pendencia,
                  })
                  return (
                    <li
                      key={`${ponto.inicio}-${ponto.fim}`}
                      className="flex flex-wrap items-center gap-2 text-apoio text-texto-suave"
                    >
                      <AlertTriangle className="size-4 shrink-0 text-alerta-texto" aria-hidden />
                      <span className="mv-numero font-medium">{ponto.rotulo}</span>
                      <span className="text-texto-fraco">{explicada?.titulo}</span>
                      {explicada?.acao && (
                        <Link
                          to={explicada.acao.caminho}
                          className="inline-flex items-center gap-1 text-primaria-legivel underline-offset-2 hover:underline"
                        >
                          {explicada.acao.rotulo}
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      )}
                    </li>
                  )
                })}
            </ul>
          )}
        </div>
      </Cartao>

      {/* ─────────────────────────────────── composição, três medidas ──── */}
      <Cartao
        titulo="De onde vem o CMV"
        descricao="Estoque inicial, compras e estoque final, na mesma escala de reais."
      >
        <div className="p-5 pt-4">
          <div
            className="h-[280px] w-full"
            role="img"
            aria-label="Estoque inicial, compras e estoque final por período. Os mesmos valores estão na tabela abaixo."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pontos}
                margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
                barGap={2}
              >
                <CartesianGrid vertical={false} stroke="var(--mv-borda)" strokeWidth={1} />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--mv-borda)' }}
                  tick={{ fill: 'var(--mv-texto-fraco)', fontSize: 11 }}
                />
                <YAxis
                  width={72}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(valor: number) => dinheiroCompacto(valor)}
                  tick={{ fill: 'var(--mv-texto-fraco)', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--mv-primaria-06)' }}
                  content={<Dica pontos={pontos} />}
                />
                <Legend
                  verticalAlign="top"
                  align="left"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: 'var(--mv-texto-suave)' }}
                />
                <Bar
                  dataKey="estoqueInicial"
                  name="Estoque inicial"
                  fill={cor.estoqueInicial}
                  maxBarSize={20}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="compras"
                  name="Compras"
                  fill={cor.compras}
                  maxBarSize={20}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="estoqueFinal"
                  name="Estoque final"
                  fill={cor.estoqueFinal}
                  maxBarSize={20}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="-mx-5 mt-4 overflow-x-auto border-t border-borda">
            <Tabela>
              <thead>
                <tr>
                  <Th>Período</Th>
                  <Th numerico>Estoque inicial</Th>
                  <Th numerico>Compras</Th>
                  <Th numerico>Estoque final</Th>
                  <Th numerico>CMV</Th>
                </tr>
              </thead>
              <tbody>
                {pontos.map((ponto) => (
                  <tr key={`${ponto.inicio}-${ponto.fim}`}>
                    <Td className="mv-numero whitespace-nowrap">{ponto.rotulo}</Td>
                    <Td numerico>{ponto.completo ? dinheiro(ponto.estoqueInicial) : '—'}</Td>
                    <Td numerico>{dinheiro(ponto.compras)}</Td>
                    <Td numerico>{ponto.completo ? dinheiro(ponto.estoqueFinal) : '—'}</Td>
                    <Td numerico className="font-semibold">
                      {ponto.completo ? (
                        dinheiro(ponto.cmv)
                      ) : (
                        <span className="text-apoio font-normal text-alerta-texto">
                          sem CMV
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        </div>
      </Cartao>
    </>
  )
}

/* ──────────────────────────────────────────── o período em detalhe ──────── */

function DetalheDoPeriodo({
  restauranteId,
  periodo,
  series,
  aoEscolher,
  cores,
}: {
  restauranteId: string
  periodo: CmvSerie | null
  series: CmvSerie[]
  aoEscolher: (chave: string) => void
  cores: { cmv: string; estoqueInicial: string; compras: string; estoqueFinal: string }
}) {
  const navegarPara = useNavigate()
  const inicio = periodo?.inicio ?? ''
  const fim = periodo?.fim ?? ''
  const detalhe = useCmv(restauranteId, inicio, fim)
  const categorias = useCmvPorCategoria(restauranteId, inicio, fim)

  const dados = detalhe.data
  const explicada = dados ? explicarPendencia(dados) : null
  const linhasDeCategoria = useMemo(
    () => ordenarCategorias(categorias.data ?? []),
    [categorias.data],
  )

  return (
    <>
      <Cartao
        titulo="Período em detalhe"
        descricao={
          periodo ? `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}` : undefined
        }
        acao={
          <Selecao
            aria-label="Período em detalhe"
            value={periodo ? `${periodo.inicio}|${periodo.fim}` : ''}
            onChange={(e) => aoEscolher(e.target.value)}
            className="w-44"
          >
            {series.map((linha) => (
              <option key={`${linha.inicio}|${linha.fim}`} value={`${linha.inicio}|${linha.fim}`}>
                {linha.rotulo}
                {linha.completo ? '' : ' · sem CMV'}
              </option>
            ))}
          </Selecao>
        }
      >
        <div className="space-y-4 p-5">
          {detalhe.isLoading && <Carregando linhas={2} />}
          {detalhe.isError && (
            <ErroDaConsulta erro={detalhe.error} aoTentar={() => void detalhe.refetch()} />
          )}

          {dados && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador
                  rotulo="Estoque inicial"
                  valor={dados.estoque_inicial === null ? '—' : dinheiro(dados.estoque_inicial)}
                  icone={<Ponto cor={cores.estoqueInicial} />}
                  apoio={
                    dados.estoque_inicial_data
                      ? `Contagem de ${formatarData(dados.estoque_inicial_data)}`
                      : 'Nenhuma contagem fechada até o início do período.'
                  }
                />
                <Indicador
                  rotulo="Compras"
                  valor={dinheiro(dados.compras)}
                  icone={<Ponto cor={cores.compras} />}
                  apoio={`${quantidade(dados.compras_notas)} ${plural(dados.compras_notas, 'nota lançada', 'notas lançadas')} no período.`}
                />
                <Indicador
                  rotulo="Estoque final"
                  valor={dados.estoque_final === null ? '—' : dinheiro(dados.estoque_final)}
                  icone={<Ponto cor={cores.estoqueFinal} />}
                  tom={dados.estoque_final_fora_do_periodo ? 'alerta' : 'neutro'}
                  apoio={
                    dados.estoque_final_data === null ? (
                      'Nenhuma contagem fechada dentro do período.'
                    ) : dados.estoque_final_fora_do_periodo ? (
                      /* A contagem veio de FORA do período, pela regra da casa:
                         o fechamento do mês contado no dia 1º do mês seguinte é
                         o fechamento daquele mês. Dizer a data é obrigatório —
                         dias de movimento entre o fim do período e a contagem
                         mudam o número, e quem lê precisa saber quantos. */
                      <span className="flex items-start gap-1.5">
                        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          Contagem de{' '}
                          <strong className="mv-numero">
                            {formatarData(dados.estoque_final_data)}
                          </strong>
                          , de <strong>fora deste período</strong>.
                        </span>
                      </span>
                    ) : (
                      `Contagem de ${formatarData(dados.estoque_final_data)}`
                    )
                  }
                />
                <Indicador
                  rotulo="CMV do período"
                  valor={dados.cmv === null ? 'sem CMV' : dinheiro(dados.cmv)}
                  tom={dados.cmv === null ? 'alerta' : 'marca'}
                  icone={<Ponto cor={cores.cmv} />}
                  apoio={
                    dados.cmv === null
                      ? 'O número não existe enquanto faltar contagem.'
                      : 'Estoque inicial + compras − estoque final.'
                  }
                />
              </div>

              {dados.estoque_final_fora_do_periodo && dados.estoque_final_data && (
                <Aviso tom="alerta" titulo="O estoque final veio de fora do período">
                  <p className="mt-1">
                    Não há contagem fechada dentro de{' '}
                    {formatarData(dados.inicio)} a {formatarData(dados.fim)}, então o fechamento
                    usado é a <strong>primeira contagem do mês seguinte</strong>, de{' '}
                    <strong className="mv-numero">
                      {formatarData(dados.estoque_final_data)}
                    </strong>
                    . É a regra da casa: a contagem que fecha o mês costuma ser feita no mês
                    seguinte, e é ela mesma o fechamento.
                  </p>
                  <p className="mt-1">
                    O que isso custa: o movimento entre {formatarData(dados.fim)} e{' '}
                    {formatarData(dados.estoque_final_data)} entra neste CMV. Para o fechamento
                    mensal contado no dia 1º são algumas horas; se a contagem foi muito depois,
                    são dias de venda e de compra dentro do número.
                  </p>
                </Aviso>
              )}

              <FaturamentoELadoALado dados={dados} />

              {explicada && (
                <Aviso tom="alerta" titulo={explicada.titulo}>
                  <p className="mt-1">{explicada.explicacao}</p>
                  {explicada.acao && (
                    <Botao
                      tom="secundario"
                      tamanho="p"
                      className="mt-3"
                      onClick={() => navegarPara(explicada.acao?.caminho ?? '/contagem')}
                    >
                      {explicada.acao.rotulo}
                    </Botao>
                  )}
                </Aviso>
              )}
            </>
          )}

          {!detalhe.isLoading && !detalhe.isError && !dados && (
            <EstadoVazio titulo="Período sem dados">
              O banco não devolveu nada para este intervalo.
            </EstadoVazio>
          )}
        </div>
      </Cartao>

      <Cartao
        titulo="Abertura por categoria"
        descricao="Ordenada pelo CMV. A cor é a da categoria, como no cadastro."
      >
        {categorias.isLoading ? (
          <Carregando linhas={4} />
        ) : categorias.isError ? (
          <ErroDaConsulta erro={categorias.error} aoTentar={() => void categorias.refetch()} />
        ) : linhasDeCategoria.length === 0 ? (
          <EstadoVazio titulo="Nenhuma categoria com movimento">
            Sem contagem fechada e sem nota lançada no período, não há o que abrir.
          </EstadoVazio>
        ) : (
          <div className="overflow-x-auto">
            <Tabela>
              <thead>
                <tr>
                  <Th>Categoria</Th>
                  <Th numerico>Estoque inicial</Th>
                  <Th numerico>Compras</Th>
                  <Th numerico>Estoque final</Th>
                  <Th numerico>CMV</Th>
                  <Th numerico>Fatia</Th>
                </tr>
              </thead>
              <tbody>
                {linhasDeCategoria.map((linha) => (
                  <tr key={linha.categoria_id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Ponto cor={linha.categoria_cor} />
                        <span className="truncate">{linha.categoria_nome}</span>
                      </span>
                      {/* A barra repete o CMV em comprimento: quem não separa
                          as cores ainda compara pelo tamanho. */}
                      <span
                        className="mt-1 block h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-superficie-3"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${linha.proporcao}%`,
                            backgroundColor: linha.categoria_cor,
                          }}
                        />
                      </span>
                    </Td>
                    <Td numerico>{dinheiro(linha.estoque_inicial)}</Td>
                    <Td numerico>{dinheiro(linha.compras)}</Td>
                    <Td numerico>{dinheiro(linha.estoque_final)}</Td>
                    <Td numerico className="font-semibold">
                      {dinheiro(linha.cmv)}
                    </Td>
                    <Td numerico className="text-texto-fraco">
                      {porcentagem(linha.participacao)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Cartao>
    </>
  )
}

/* ────────────────────────────── o CMV%, dos dois lados, e a limpeza ─────── */

/**
 * Os dois percentuais lado a lado, com a diferença escrita em texto.
 *
 * Por que os dois, e não o "certo": porque não existe o certo, existem duas
 * perguntas diferentes. O CMV sobre o faturamento TOTAL responde "de cada real
 * que entrou na casa, quanto foi para o estoque" — é o número do caixa. O CMV
 * sobre o faturamento de PRODUTO responde "de cada real de comida e bebida
 * vendida, quanto custou o insumo" — é o número da cozinha, e é com ele que se
 * compara prato contra prato e mês contra mês.
 *
 * A diferença entre os dois é couvert e taxa de serviço: dinheiro que entra sem
 * tirar nada do estoque. Em setembro de 2026 foram R$ 53.049,68 de R$ 255.417,78
 * — 20,8%. Mostrar só o total faria o CMV parecer 20% melhor do que é.
 */
function FaturamentoELadoALado({ dados }: { dados: CmvPeriodo }) {
  const temFaturamento = dados.faturamento > 0
  const fatiaDeServico = temFaturamento ? (dados.faturamento_servico / dados.faturamento) * 100 : null
  const razao =
    dados.cmv_percentual !== null && dados.cmv_percentual > 0 && dados.cmv_percentual_produto !== null
      ? dados.cmv_percentual_produto / dados.cmv_percentual
      : null

  return (
    <div className="space-y-4 rounded-marca border border-borda bg-superficie-2 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-titulo text-secao font-semibold text-texto">CMV sobre o faturamento</h3>
        <span className="text-apoio text-texto-fraco">
          {dados.faturamento_lancamentos === 0
            ? 'Nenhum lançamento de venda fechado neste período.'
            : `${quantidade(dados.faturamento_lancamentos)} ${plural(dados.faturamento_lancamentos, 'lançamento de venda fechado', 'lançamentos de venda fechados')}.`}
        </span>
      </div>

      {!temFaturamento ? (
        /* Sem faturamento não há percentual, e zero no denominador não é "0%" —
           é "não dá para dividir". A mesma regra do CMV ausente desde a 0005. */
        <Aviso tom="info" titulo="Sem venda fechada, não há percentual">
          O CMV em reais existe (ele vem do estoque e das notas), mas a porcentagem precisa do
          faturamento. Importe a planilha do PDV em <strong>Vendas</strong> e{' '}
          <strong>feche</strong> o lançamento: lançamento aberto não entra em conta nenhuma.
        </Aviso>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-marca-p border border-borda bg-superficie-1 px-5 py-4">
              <div className="mv-rotulo">Sobre o faturamento total</div>
              <div
                aria-live="polite"
                className="mv-numero mt-2 text-tela leading-none font-semibold text-texto"
              >
                {dados.cmv_percentual === null ? 'sem CMV' : porcentagem(dados.cmv_percentual)}
              </div>
              <dl className="mt-3 space-y-1 text-apoio text-texto-fraco">
                <div className="flex justify-between gap-2">
                  <dt>Faturamento</dt>
                  <dd className="mv-numero text-texto-suave">{dinheiro(dados.faturamento)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>CMV</dt>
                  <dd className="mv-numero text-texto-suave">
                    {dados.cmv === null ? '—' : dinheiro(dados.cmv)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-micro leading-snug text-texto-fraco">
                De cada real que entrou na casa, quanto foi para o estoque. É o número do caixa.
              </p>
            </div>

            <div className="rounded-marca-p border border-primaria/40 bg-primaria-06 px-5 py-4">
              <div className="mv-rotulo">Sobre o faturamento de produto</div>
              <div
                aria-live="polite"
                className="mv-numero mt-2 text-tela leading-none font-semibold text-primaria-legivel"
              >
                {dados.cmv_percentual_produto === null
                  ? 'sem CMV'
                  : porcentagem(dados.cmv_percentual_produto)}
              </div>
              <dl className="mt-3 space-y-1 text-apoio text-texto-fraco">
                <div className="flex justify-between gap-2">
                  <dt>Faturamento de produto</dt>
                  <dd className="mv-numero text-texto-suave">
                    {dinheiro(dados.faturamento_produto)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Serviço que saiu da conta</dt>
                  <dd className="mv-numero text-texto-suave">
                    −{dinheiro(dados.faturamento_servico)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-micro leading-snug text-texto-fraco">
                De cada real de comida e bebida, quanto custou o insumo. É o número da cozinha.
              </p>
            </div>
          </div>

          {/* A diferença explicada em texto, que foi o pedido literal: "os dois
              lado a lado, com a diferença explicada na tela". */}
          <p className="text-apoio leading-relaxed text-texto-suave">
            A diferença entre os dois é <strong>couvert e taxa de serviço</strong>:{' '}
            <strong className="mv-numero">{dinheiro(dados.faturamento_servico)}</strong>
            {fatiaDeServico !== null && <> ({porcentagem(fatiaDeServico)} do faturamento)</>} que
            entraram sem tirar nada do estoque. Como esse dinheiro não consome insumo, ele{' '}
            <em>empurra o percentual para baixo</em> quando entra no denominador
            {razao !== null && (
              <>
                {' '}
                — o número da cozinha é{' '}
                <strong className="mv-numero">{razao.toFixed(2).replace('.', ',')}×</strong> o do
                caixa
              </>
            )}
            . O do caixa diz se a casa fecha a conta; o da cozinha diz se a ficha está certa.
          </p>
        </>
      )}

      {/* A terceira decisão da cliente: limpeza e descartáveis fora do CMV de
          insumo, com indicador próprio ao lado. */}
      <div className="grid gap-3 border-t border-borda pt-4 sm:grid-cols-3">
        <Indicador
          rotulo="CMV de insumo"
          valor={dados.cmv_insumo === null ? '—' : dinheiro(dados.cmv_insumo)}
          tom="marca"
          apoio="O que virou prato e copo: sem limpeza e sem descartável."
        />
        <Indicador
          rotulo="Limpeza e descartáveis"
          valor={dados.cmv_limpeza === null ? '—' : dinheiro(dados.cmv_limpeza)}
          icone={<SprayCan className="size-4 text-texto-fraco" aria-hidden />}
          apoio={
            dados.cmv_limpeza === null
              ? 'Precisa das duas contagens, como o CMV.'
              : `${dinheiro(dados.compras_limpeza)} comprados no período.`
          }
        />
        <Indicador
          rotulo="Soma dos dois"
          valor={dados.cmv === null ? '—' : dinheiro(dados.cmv)}
          apoio="É o CMV inteiro: as duas metades fecham, sempre."
        />
      </div>

      {dados.compras_sem_classificacao > 0 && (
        /* A divisão em duas metades é feita pela CATEGORIA do insumo vinculado
           (0031). Item de nota lançada sem insumo vinculado não tem categoria,
           então ele está dentro do CMV total e fora das duas metades. Calar
           isso seria escolher uma metade no lugar da casa. */
        <p className="text-micro leading-snug text-texto-fraco">
          <strong className="mv-numero">{dinheiro(dados.compras_sem_classificacao)}</strong> de
          compra lançada está em item sem insumo vinculado. Esse valor entra no CMV inteiro e{' '}
          <em>não</em> entra em nenhuma das duas metades acima — não há categoria para dizer de que
          lado ele fica. Vincule os itens na conferência da nota.
        </p>
      )}

      {dados.compras_divergencia_operacao > 0 && (
        /* A operação do ERP não soma dinheiro nenhum desde a 0031, mas ela é o
           único segundo olhar que existe sobre a classificação. Quando ela
           discorda da categoria, quem decide é a casa — e a casa só decide o
           que sabe que está em discussão. */
        <p className="text-micro leading-snug text-texto-fraco">
          Em <strong className="mv-numero">{dinheiro(dados.compras_divergencia_operacao)}</strong> de
          compra, a categoria do cadastro e a operação da nota do fornecedor discordam sobre ser
          limpeza. Vale o cadastro, que é o mesmo nas três pontas da conta; o aviso fica para a
          casa conferir a categoria em{' '}
          <Link
            to="/cadastros/produtos"
            className="text-primaria-legivel underline-offset-2 hover:underline"
          >
            Produtos
          </Link>
          .
        </p>
      )}

      {dados.compras > 0 && dados.compras_limpeza === 0 && (
        /* Zero aqui pode ser "não comprou limpeza" ou "ninguém marcou categoria
           nenhuma como fora do insumo" — coisas muito diferentes, e a tela não
           escolhe entre elas: diz as duas.
           Só aparece quando HOUVE compra no período: com `compras` zerado, o
           zero da limpeza não tem nada a explicar além do próprio zero, e a
           frase viraria uma suspeita falsa. */
        <p className="text-micro leading-snug text-texto-fraco">
          Houve {dinheiro(dados.compras)} de compra no período e nada dela caiu em limpeza. Isso
          pode querer dizer que a casa não comprou limpeza, ou que nenhuma categoria do cadastro
          está marcada como fora do CMV de insumo. Confira em{' '}
          <Link to="/cadastros/categorias" className="text-primaria-legivel underline-offset-2 hover:underline">
            Categorias
          </Link>
          .
        </p>
      )}
    </div>
  )
}

/**
 * Rótulo direto em uma coluna só: a mais recente com número.
 *
 * O texto veste token de texto, nunca a cor da série — cor clara de série é
 * ilegível como texto sobre a superfície.
 */
function rotuloDoPeriodo(alvo: number) {
  return function Rotulo(props: {
    x?: number | string
    y?: number | string
    width?: number | string
    value?: number | string
    index?: number
  }) {
    if (props.index !== alvo || typeof props.value !== 'number') return null
    return (
      <text
        x={Number(props.x ?? 0) + Number(props.width ?? 0) / 2}
        y={Number(props.y ?? 0) - 8}
        textAnchor="middle"
        fill="var(--mv-texto)"
        fontSize={11}
        fontWeight={600}
        className="mv-numero"
      >
        {dinheiroCompacto(props.value)}
      </text>
    )
  }
}

/* ────────────────────────────────────────────────────────────── tooltip ─── */

interface ItemDaDica {
  name?: string
  value?: number | string | null
  color?: string
  dataKey?: string | number
}

/**
 * A dica do gráfico repete o período por extenso e, quando falta contagem, diz
 * o motivo ali mesmo — é o lugar onde a pessoa está olhando quando estranha a
 * barra que não existe.
 */
function Dica({
  active,
  payload,
  label,
  pontos,
}: {
  active?: boolean
  payload?: ItemDaDica[]
  label?: string | number
  pontos: ReturnType<typeof pontosDaSerie>
}) {
  if (!active || !payload || payload.length === 0) return null
  const ponto = pontos.find((p) => p.rotulo === label)

  return (
    <div className="rounded-marca-p border border-borda bg-superficie-1 px-3 py-2 shadow-media">
      <div className="mv-numero text-apoio font-semibold text-texto">
        {ponto ? `${formatarData(ponto.inicio)} a ${formatarData(ponto.fim)}` : String(label ?? '')}
      </div>
      <ul className="mt-1.5 space-y-1">
        {payload.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center gap-2 text-apoio">
            <Ponto cor={item.color ?? 'var(--mv-borda-forte)'} />
            <span className="text-texto-suave">{item.name}</span>
            <span className="mv-numero ml-auto font-medium text-texto">
              {typeof item.value === 'number' ? dinheiro(item.value) : '—'}
            </span>
          </li>
        ))}
      </ul>
      {ponto && !ponto.completo && (
        <p className="mt-2 max-w-[220px] text-micro leading-snug text-alerta-texto">
          {ponto.pendencia ?? 'Período sem contagem fechada'} — sem CMV para este período.
        </p>
      )}
    </div>
  )
}
