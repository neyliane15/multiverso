/**
 * Módulo 2 · relatório de contagem.
 *
 * O fluxo que a cliente desenhou, com as seis etapas na ordem dela:
 *
 *   1 CONTAGEM ANTERIOR → 2 COMPRAS → 3 VENDAS → 4 CONTAGEM ATUAL
 *                       → 5 CONSUMO → 6 IDEAL
 *
 *   CONSUMO   = contagem anterior + compras − contagem atual
 *   IDEAL     = contagem anterior + compras − vendas
 *   DIFERENÇA = contagem atual − ideal
 *
 * A tela tem uma obrigação além de mostrar número: **explicar a conta onde o
 * número está**. Consumo e ideal são duas subtrações parecidas que respondem
 * coisas opostas, e quem olhar as duas colunas sem a fórmula ao lado vai achar
 * que uma delas está errada. Então a fórmula aparece no cabeçalho da coluna
 * (no `title`, que o navegador mostra ao parar o ponteiro) e por extenso no
 * cartão do celular, onde não há ponteiro nenhum.
 *
 * Duas decisões que valem o comentário:
 *
 * 1. **"Não precisa comprar" é marcado, e "não se sabe" é marcado diferente.**
 *    São três estados, não dois — ver `julgarSugestao`. Pintar o terceiro com
 *    a cor do primeiro seria dizer que está tudo bem num item sobre o qual o
 *    sistema não tem opinião.
 *
 * 2. **O período não é digitado: ele é entre duas contagens.** É a decisão da
 *    cliente, e a tela a torna visível no cabeçalho — a pessoa escolhe a
 *    contagem, e o relatório diz contra qual foto anterior ele está comparando.
 *    Sem isso, "compras do período" seria um número sem período.
 *
 * O celular vira cartão, como a tela de insumos: onze colunas numa tabela de
 * 390px ou cortam informação ou viram rolagem horizontal cega.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Scale, Store, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import { useContagens, useRelatorioDeContagem } from '@/dados/consultas'
import type { ContagemResumo, LinhaDoRelatorio } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Campo,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import { SeletorDeContagem } from './SeletorDeContagem'
import { contagemEmFoco, opcoesDeContagem } from './logicaDoDashboard'
import {
  EXPLICACOES,
  FORMULAS,
  categoriasDoRelatorio,
  filtrarRelatorio,
  julgarSugestao,
  ordenarRelatorio,
  resumoDoRelatorio,
  type OrdemDoRelatorio,
} from './logicaDoRelatorio'

/**
 * O valor do `<option>` do balde "Sem categoria".
 *
 * Um `<option>` não carrega `null` — o valor de um campo HTML é sempre string.
 * Este sentinela não colide com uuid nenhum, e é o que deixa o filtro
 * distinguir "todas" (string vazia) de "as sem categoria".
 */
const SEM_CATEGORIA = '\u0000sem-categoria'

export function RelatorioDeContagem() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Relatório de contagem" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver o relatório dele.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  // `key` no id: a troca de restaurante zera a contagem escolhida e os
  // filtros, em vez de deixar a tela apontando para uma foto de outra casa.
  return (
    <RelatorioDoRestaurante
      key={restaurante.id}
      restauranteId={restaurante.id}
      restauranteNome={restaurante.nome}
    />
  )
}

function RelatorioDoRestaurante({
  restauranteId,
  restauranteNome,
}: {
  restauranteId: string
  restauranteNome: string
}) {
  const navegar = useNavigate()
  const contagens = useContagens(restauranteId)
  const [escolhida, setEscolhida] = useState<string | null>(null)

  const foco = useMemo(
    () => contagemEmFoco(contagens.data ?? [], escolhida),
    [contagens.data, escolhida],
  )
  const relatorio = useRelatorioDeContagem(foco?.id)

  /**
   * Qual foto o relatório está usando como ponta anterior.
   *
   * O banco já decide isso e já diz, pela `pendencia`, quando não achou
   * nenhuma. Aqui a mesma regra é repetida só para o CABEÇALHO poder escrever
   * o período — e ela é repetida sobre a mesma lista que o seletor usa, então
   * as duas não podem discordar: a imediatamente anterior, fechada.
   */
  const anterior = useMemo(() => {
    if (!foco) return null
    return (
      opcoesDeContagem(contagens.data ?? []).find(
        (c) => c.status === 'fechada' && c.referencia < foco.referencia,
      ) ?? null
    )
  }, [contagens.data, foco])

  const cabecalho = (
    <div>
      <p className="mv-rotulo mb-1.5">Relatório de contagem · {restauranteNome}</p>
      <CabecalhoDePagina
        titulo={
          foco
            ? `Consumo e compra — ${formatarData(foco.referencia)}`
            : 'Relatório de contagem'
        }
        descricao={
          foco ? (
            anterior ? (
              <>
                Período entre a contagem de{' '}
                <strong className="mv-numero text-texto-suave">
                  {formatarData(anterior.referencia)}
                </strong>{' '}
                e a de{' '}
                <strong className="mv-numero text-texto-suave">
                  {formatarData(foco.referencia)}
                </strong>
                . Compras e vendas são as que caem nesse intervalo.
              </>
            ) : (
              'Esta é a primeira contagem fechada desta casa: sem foto anterior, o consumo e o ideal não têm as duas pontas.'
            )
          ) : undefined
        }
        acoes={
          (contagens.data ?? []).length > 0 ? (
            <SeletorDeContagem
              contagens={contagens.data ?? []}
              escolhida={foco?.id ?? null}
              aoEscolher={setEscolhida}
              rotulo="Contagem do relatório"
            />
          ) : undefined
        }
      />
    </div>
  )

  if (contagens.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (contagens.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta erro={contagens.error} aoTentar={() => void contagens.refetch()} />
        </Cartao>
      </>
    )
  }

  if (!foco) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio
            icone={<Scale />}
            titulo="Nenhuma contagem fechada ainda"
            acao={
              <Botao tom="primario" onClick={() => navegar('/contagem')}>
                Ir para a folha de contagem
              </Botao>
            }
          >
            O relatório compara duas fotos do estoque. Sem contagem fechada não há foto nenhuma — e
            um relatório montado sobre folha aberta diria que a casa consumiu o que ninguém contou
            ainda.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  return (
    <>
      {cabecalho}
      <Explicacao />
      {relatorio.isLoading ? (
        <Cartao>
          <Carregando linhas={8} />
        </Cartao>
      ) : relatorio.isError ? (
        <Cartao>
          <ErroDaConsulta erro={relatorio.error} aoTentar={() => void relatorio.refetch()} />
        </Cartao>
      ) : (
        <Corpo linhas={relatorio.data ?? []} contagem={foco} temAnterior={anterior !== null} />
      )}
    </>
  )
}

/**
 * As fórmulas, antes da tabela.
 *
 * Não é decoração nem ajuda escondida atrás de um ícone: é o desenho que a
 * cliente mandou, e é a única coisa que faz "consumo" e "ideal" pararem de
 * parecer a mesma conta digitada duas vezes.
 */
function Explicacao() {
  const etapas = [
    'Contagem anterior',
    'Compras',
    'Vendas',
    'Contagem atual',
    'Consumo',
    'Ideal',
  ]
  return (
    <Cartao titulo="Como esta conta é feita" descricao="As seis etapas, na ordem.">
      <div className="space-y-4 p-5">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {etapas.map((etapa, i) => (
            <li key={etapa} className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-marca-p border border-borda bg-superficie-2 px-2.5 py-1 text-apoio text-texto-suave">
                <span className="mv-numero text-micro text-texto-fraco">{i + 1}</span>
                {etapa}
              </span>
              {i < etapas.length - 1 && (
                <ArrowRight className="size-3.5 shrink-0 text-texto-fraco" aria-hidden />
              )}
            </li>
          ))}
        </ol>

        <dl className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['Consumo', FORMULAS.consumo, EXPLICACOES.consumo],
              ['Ideal', FORMULAS.ideal, EXPLICACOES.ideal],
              ['Diferença', FORMULAS.diferenca, EXPLICACOES.diferenca],
            ] as const
          ).map(([nome, formula, explica]) => (
            <div key={nome} className="rounded-marca-p border border-borda bg-superficie px-4 py-3">
              <dt className="mv-rotulo">{nome}</dt>
              <dd className="mv-numero mt-1.5 text-apoio leading-snug text-texto">{formula}</dd>
              <dd className="mt-1.5 text-micro leading-snug text-texto-fraco">{explica}</dd>
            </div>
          ))}
        </dl>

        <p className="text-apoio leading-relaxed text-texto-fraco">
          A <strong className="text-texto-suave">sugestão de compra</strong> é{' '}
          <span className="mv-numero">{FORMULAS.sugestao}</span>. Quando o estoque atual é maior que
          essa média, a linha é marcada como{' '}
          <strong className="text-texto-suave">“Não precisa comprar”</strong>. Quando não há venda
          fechada nenhuma até a data da contagem, não há média — e o sistema diz{' '}
          <strong className="text-texto-suave">“Não se sabe”</strong> em vez de chutar.
        </p>
      </div>
    </Cartao>
  )
}

function Corpo({
  linhas,
  contagem,
  temAnterior,
}: {
  linhas: LinhaDoRelatorio[]
  contagem: ContagemResumo
  temAnterior: boolean
}) {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [categoriaId, setCategoriaId] = useState<string | null | undefined>(undefined)
  const [soPrecisaComprar, setSoPrecisaComprar] = useState(false)
  const [soComPendencia, setSoComPendencia] = useState(false)
  /*
   * A ordem padrão é "maior sugestão", e não alfabética.
   *
   * A tela existe para fechar o pedido da semana. Na carga real do Bar do
   * Zeca são 882 linhas, e em ordem alfabética as três primeiras são ABACATE,
   * ABACAXI e ABÓBORA — nenhuma delas com nada a decidir. Alfabético é a ordem
   * de um catálogo; esta aqui é uma lista de decisões.
   */
  const [ordem, setOrdem] = useState<OrdemDoRelatorio>('sugestao')

  const categorias = useMemo(() => categoriasDoRelatorio(linhas), [linhas])
  const resumo = useMemo(() => resumoDoRelatorio(linhas), [linhas])

  const visiveis = useMemo(
    () =>
      ordenarRelatorio(
        // `categoriaId` é tri-estado e vai direto: `undefined` = todas,
        // `null` = Sem categoria, string = aquela. Ver `FiltroDoRelatorio`.
        filtrarRelatorio(linhas, { busca, categoriaId, soPrecisaComprar, soComPendencia }),
        ordem,
      ),
    [linhas, busca, categoriaId, soPrecisaComprar, soComPendencia, ordem],
  )

  const vendasConsideradas = linhas[0]?.vendas_consideradas ?? 0

  if (linhas.length === 0) {
    return (
      <Cartao>
        <EstadoVazio icone={<Scale />} titulo="Nenhum insumo se moveu neste período">
          A contagem de {formatarData(contagem.referencia)} não tem linha com estoque, compra ou
          venda. Isso acontece numa folha recém-aberta e nunca respondida.
        </EstadoVazio>
      </Cartao>
    )
  }

  return (
    <>
      {!temAnterior && (
        <Aviso tom="alerta" titulo="Sem contagem anterior, metade das colunas não existe">
          Consumo, ideal e diferença precisam das duas pontas do período. Elas aparecem vazias de
          propósito: um “anterior = 0” transformaria toda a compra do período em consumo, e a conta
          sairia com cara de certa.
        </Aviso>
      )}

      {vendasConsideradas === 0 && (
        <Aviso tom="alerta" titulo="Nenhuma venda fechada até esta data">
          Sem venda lançada não há média de vendas, então não há sugestão de compra — e nem a
          marca de “não precisa comprar”, que seria um palpite.
          <Botao
            tom="secundario"
            tamanho="p"
            className="mt-3"
            onClick={() => navegar('/contagem/vendas')}
          >
            Lançar as vendas do período
          </Botao>
        </Aviso>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Insumos no relatório"
          valor={formatarQuantidade(resumo.insumos)}
          apoio={`${resumo.temDeSobra} com estoque de sobra · ${resumo.semMovimento} sem movimento nenhum`}
        />
        <Indicador
          rotulo="Precisam de compra"
          valor={formatarQuantidade(resumo.precisamComprar)}
          tom={resumo.precisamComprar > 0 ? 'alerta' : 'neutro'}
          apoio={`${dinheiro(resumo.valorSugerido)} ao custo congelado desta foto`}
        />
        <Indicador
          rotulo="Falta no estoque"
          valor={dinheiro(resumo.valorDaFalta)}
          tom={resumo.valorDaFalta > 0 ? 'erro' : 'neutro'}
          apoio="Soma das diferenças negativas: saiu do estoque e a venda não explica."
        />
        <Indicador
          rotulo="Sem resposta"
          valor={formatarQuantidade(resumo.semBase)}
          tom={resumo.semBase > 0 ? 'alerta' : 'neutro'}
          apoio={`${resumo.comPendencia} ${plural(resumo.comPendencia, 'linha tem', 'linhas têm')} pendência escrita`}
        />
      </div>

      <Cartao
        titulo="Insumo por insumo"
        descricao={`Média calculada sobre ${vendasConsideradas} ${plural(vendasConsideradas, 'venda fechada', 'vendas fechadas')} até ${formatarData(contagem.referencia)}.`}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-borda px-5 py-4">
          <Campo
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar insumo ou categoria…"
            aria-label="Buscar insumo"
            className="w-full sm:w-64"
          />
          <Selecao
            aria-label="Filtrar por categoria"
            value={categoriaId === undefined ? '' : (categoriaId ?? SEM_CATEGORIA)}
            onChange={(e) =>
              setCategoriaId(
                e.target.value === ''
                  ? undefined
                  : e.target.value === SEM_CATEGORIA
                    ? null
                    : e.target.value,
              )
            }
            className="w-full sm:w-52"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id ?? 'sem'} value={c.id ?? SEM_CATEGORIA}>
                {c.nome} ({c.linhas})
              </option>
            ))}
          </Selecao>
          <Selecao
            aria-label="Ordenar por"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemDoRelatorio)}
            className="w-full sm:w-52"
          >
            <option value="nome">Ordem alfabética</option>
            <option value="diferenca">Maior diferença</option>
            <option value="sugestao">Maior sugestão</option>
            <option value="consumo">Maior consumo</option>
          </Selecao>
          <Botao
            tom={soPrecisaComprar ? 'primario' : 'secundario'}
            tamanho="p"
            aria-pressed={soPrecisaComprar}
            onClick={() => setSoPrecisaComprar((s) => !s)}
          >
            Só o que comprar
          </Botao>
          <Botao
            tom={soComPendencia ? 'primario' : 'secundario'}
            tamanho="p"
            aria-pressed={soComPendencia}
            onClick={() => setSoComPendencia((s) => !s)}
          >
            Só com pendência
          </Botao>
          <span className="mv-numero ml-auto text-apoio text-texto-fraco">
            {visiveis.length} de {linhas.length}
          </span>
        </div>

        {visiveis.length === 0 ? (
          <EstadoVazio titulo="Nenhum insumo com esses filtros">
            Limpe a busca, a categoria ou os dois alternadores.
          </EstadoVazio>
        ) : (
          <>
            <ul className="divide-y divide-borda/60 xl:hidden">
              {visiveis.map((l) => (
                <CartaoDaLinha key={l.produto_id} linha={l} />
              ))}
            </ul>

            <div className="hidden xl:block">
              {/* Onze colunas. A calha de 20px do design system é a largura de
                  leitura de uma tabela de cinco colunas; aqui ela sozinha come
                  220px e empurra a sugestão de compra para fora da tela. 12px
                  mantém as colunas separadas e cabe num monitor de 1440 com a
                  barra lateral aberta. A rolagem horizontal continua existindo
                  para quem tem menos, e é da `Tabela`. */}
              <Tabela className="[&_td]:px-3 [&_th]:px-3">
                <thead>
                  <tr>
                    <Th>Insumo</Th>
                    <Th>Categoria</Th>
                    <Th numerico>Contagem anterior</Th>
                    <Th numerico>Compras</Th>
                    <Th numerico>Vendas</Th>
                    <Th numerico>Contagem atual</Th>
                    {/* A fórmula vai no `title` do cabeçalho: é onde a pessoa
                        para o ponteiro quando estranha o número da coluna. */}
                    <Th numerico className="cursor-help" >
                      <abbr title={`Consumo = ${FORMULAS.consumo}. ${EXPLICACOES.consumo}`} className="no-underline">
                        Consumo
                      </abbr>
                    </Th>
                    <Th numerico className="cursor-help">
                      <abbr title={`Ideal = ${FORMULAS.ideal}. ${EXPLICACOES.ideal}`} className="no-underline">
                        Ideal
                      </abbr>
                    </Th>
                    <Th numerico className="cursor-help">
                      <abbr title={`Diferença = ${FORMULAS.diferenca}. ${EXPLICACOES.diferenca}`} className="no-underline">
                        Diferença
                      </abbr>
                    </Th>
                    <Th numerico>Média 3 vendas</Th>
                    <Th>Sugestão de compra</Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <LinhaDaTabela key={l.produto_id} linha={l} />
                  ))}
                </tbody>
              </Tabela>
            </div>
          </>
        )}
      </Cartao>
    </>
  )
}

/** Número que pode não existir. Vazio é vazio — nunca zero fingindo leitura. */
function Numero({ valor, unidade }: { valor: number | null; unidade?: string }) {
  if (valor === null) return <span className="text-texto-fraco">—</span>
  return (
    <>
      {formatarQuantidade(valor)}
      {unidade && <span className="ml-1 text-micro text-texto-fraco">{unidade}</span>}
    </>
  )
}

/**
 * A diferença, com a direção dita sem depender de cor.
 *
 * Negativa é falta: saiu do estoque mais do que a venda explica. Positiva é
 * sobra: a venda explica mais saída do que o estoque mostra. O sinal carrega a
 * direção, e a cor só reforça — porque a cor sozinha não é informação.
 */
function Diferenca({ valor, unidade }: { valor: number | null; unidade: string }) {
  if (valor === null) return <span className="text-texto-fraco">—</span>
  if (valor === 0) {
    return (
      <span className="text-texto-suave">
        0<span className="ml-1 text-micro text-texto-fraco">{unidade}</span>
      </span>
    )
  }
  const falta = valor < 0
  return (
    <span className={falta ? 'font-semibold text-erro-texto' : 'text-texto'}>
      {falta ? '−' : '+'}
      {formatarQuantidade(Math.abs(valor))}
      <span className="ml-1 text-micro text-texto-fraco">{unidade}</span>
    </span>
  )
}

function Sugestao({ linha }: { linha: LinhaDoRelatorio }) {
  const julgado = julgarSugestao(linha)
  if (julgado.veredito === 'tem_de_sobra') {
    return <Selo tom="sucesso">Não precisa comprar</Selo>
  }
  // Sem movimento não ganha selo: um selo cinza repetido em quinhentas linhas
  // é ruído que ensina a não olhar os outros quinhentos.
  if (julgado.veredito === 'sem_movimento') {
    return <span className="text-micro text-texto-fraco">{julgado.motivo}</span>
  }
  if (julgado.veredito === 'sem_base') {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Selo tom="neutro">
          <TriangleAlert className="size-3" aria-hidden />
          Não se sabe
        </Selo>
        {julgado.motivo && (
          <span className="text-micro leading-snug text-texto-fraco">{julgado.motivo}</span>
        )}
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Selo tom="alerta">
        {julgado.quantidade === 0
          ? julgado.rotulo
          : `Comprar ${formatarQuantidade(julgado.quantidade)} ${linha.unidade}`}
      </Selo>
      {julgado.quantidade !== null && julgado.quantidade > 0 && (
        <span className="mv-numero text-micro text-texto-fraco">
          ≈ {dinheiro(julgado.quantidade * linha.custo_unitario)}
        </span>
      )}
      {julgado.motivo && (
        <span className="text-micro leading-snug text-texto-fraco">{julgado.motivo}</span>
      )}
    </span>
  )
}

function LinhaDaTabela({ linha }: { linha: LinhaDoRelatorio }) {
  const semResposta = julgarSugestao(linha).veredito === 'sem_base'
  return (
    <tr className={clsx(semResposta && 'bg-alerta-suave/30')}>
      <Td>
        <span className="block truncate font-medium text-texto">{linha.produto_nome}</span>
        {linha.pendencia && (
          <span className="mt-0.5 block max-w-[22rem] text-micro leading-snug text-alerta-texto">
            {linha.pendencia}
          </span>
        )}
      </Td>
      <Td className="text-texto-suave">{linha.categoria_nome ?? '—'}</Td>
      <Td numerico>
        <Numero valor={linha.contagem_anterior} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.compras} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.vendas} unidade={linha.unidade} />
      </Td>
      <Td numerico className="font-semibold">
        <Numero valor={linha.contagem_atual} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.consumo} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.ideal} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Diferenca valor={linha.diferenca} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.media_3_vendas} unidade={linha.unidade} />
      </Td>
      <Td>
        <Sugestao linha={linha} />
      </Td>
    </tr>
  )
}

/**
 * O cartão do celular.
 *
 * Aqui a fórmula vai por extenso, e não no `title`: num aparelho de toque não
 * existe parar o ponteiro em cima de nada, então uma explicação escondida
 * atrás de hover é uma explicação que não existe.
 */
function CartaoDaLinha({ linha }: { linha: LinhaDoRelatorio }) {
  const semResposta = julgarSugestao(linha).veredito === 'sem_base'
  return (
    <li className={clsx('px-5 py-4', semResposta && 'bg-alerta-suave/30')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-corpo font-medium text-texto">{linha.produto_nome}</div>
          <div className="mt-0.5 truncate text-micro text-texto-fraco">
            {linha.categoria_nome ?? 'Sem categoria'} · {linha.unidade}
          </div>
        </div>
        <Sugestao linha={linha} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {(
          [
            ['Contagem anterior', linha.contagem_anterior, null],
            ['Compras', linha.compras, null],
            ['Vendas', linha.vendas, null],
            ['Contagem atual', linha.contagem_atual, null],
            ['Consumo', linha.consumo, FORMULAS.consumo],
            ['Ideal', linha.ideal, FORMULAS.ideal],
            ['Média 3 vendas', linha.media_3_vendas, null],
          ] as const
        ).map(([rotulo, valor, formula]) => (
          <div key={rotulo}>
            <dt className="mv-rotulo">{rotulo}</dt>
            <dd className="mv-numero text-corpo text-texto">
              <Numero valor={valor} unidade={linha.unidade} />
            </dd>
            {formula && (
              <dd className="mt-0.5 text-micro leading-snug text-texto-fraco">{formula}</dd>
            )}
          </div>
        ))}
        <div>
          <dt className="mv-rotulo">Diferença</dt>
          <dd className="mv-numero text-corpo">
            <Diferenca valor={linha.diferenca} unidade={linha.unidade} />
          </dd>
          <dd className="mt-0.5 text-micro leading-snug text-texto-fraco">
            {FORMULAS.diferenca}
          </dd>
        </div>
      </dl>

      {linha.pendencia && (
        <p className="mt-3 text-micro leading-snug text-alerta-texto">{linha.pendencia}</p>
      )}
    </li>
  )
}
