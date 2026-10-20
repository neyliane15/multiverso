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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import { janelaDeLinhas } from '@/paginas/cadastros/logicaDeProdutos'
import { SeletorDeContagem } from './SeletorDeContagem'
import { contagemEmFoco, opcoesDeContagem } from './logicaDoDashboard'
import {
  EXPLICACOES,
  FORMULAS,
  categoriasDoRelatorio,
  filtrarRelatorio,
  explicacaoDoZeroLido,
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

/* ========================================================================== */
/* Janela de rolagem                                                          */
/* ========================================================================== */
/**
 * O relatório desenhava as 904 linhas de uma vez — e as desenhava DUAS vezes.
 *
 * Medido nesta árvore, viewport de 390 px e CPU 4× mais lenta (aparelho médio),
 * com os 904 insumos do Bar do Zeca:
 *
 *   nós no DOM .......... 64.679   (904 `<tr>` MAIS 921 cartões: `hidden
 *                                   xl:table` esconde por CSS, mas monta as
 *                                   duas árvores)
 *   altura da página .... 344.896 px  (408 telas de rolagem)
 *   limpar a busca ...... 11.086 ms   — a interface congelada
 *
 * A casa já resolveu isto uma vez, na tela de insumos: uma janela de linhas
 * com dois espaçadores, vinte linhas de conta, sem biblioteca. A mesma
 * `janelaDeLinhas` serve aqui — ela não sabe nada de produto, só de altura.
 *
 * Duas consequências de projeto, e as duas são de propósito:
 *
 * 1. **Uma árvore só por vez.** `useTelaLarga` decide no JavaScript qual das
 *    duas desenhar, em vez de deixar o CSS esconder a outra. Quem está no
 *    celular para de pagar a tabela de onze colunas, e quem está no desktop
 *    para de pagar 904 cartões.
 * 2. **A altura da linha é fixa**, porque a janela conta em pixels. Então o
 *    que cabia em três linhas de texto passa a caber em duas, com o resto no
 *    `title` — e o cartão do celular, que é onde não há ponteiro, continua
 *    mostrando tudo por extenso.
 */
const ALTURA_DA_LINHA = 76
const ALTURA_DO_CARTAO = 376
/** Linhas extras acima e abaixo da janela: rolagem rápida não mostra buraco. */
const FOLGA = 6

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 1280px)')
    const aoMudar = () => setLarga(consulta.matches)
    aoMudar()
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])
  return larga
}

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

  /* ------------------------------------------------------- janela ------- */
  // Mesma peça da tela de insumos: `janelaDeLinhas` + dois espaçadores. Ver o
  // bloco de comentário em ALTURA_DA_LINHA.
  const telaLarga = useTelaLarga()
  const alturaDaLinha = telaLarga ? ALTURA_DA_LINHA : ALTURA_DO_CARTAO
  const caixa = useRef<HTMLDivElement | null>(null)
  const observador = useRef<ResizeObserver | null>(null)
  const [topo, setTopo] = useState(0)
  const [altura, setAltura] = useState(640)

  // Ref de callback, e não efeito com []: o contêiner só nasce depois que a
  // consulta volta, e um efeito rodaria antes dele existir.
  const medirCaixa = useCallback((elemento: HTMLDivElement | null) => {
    observador.current?.disconnect()
    caixa.current = elemento
    if (!elemento) return
    const obs = new ResizeObserver(() => setAltura(elemento.clientHeight))
    obs.observe(elemento)
    observador.current = obs
    setAltura(elemento.clientHeight)
  }, [])

  // Trocar de filtro volta ao topo: senão a janela fica apontando para uma
  // posição que a lista nova não tem, e a tela abre no meio do nada.
  useEffect(() => {
    if (caixa.current) caixa.current.scrollTop = 0
    setTopo(0)
  }, [busca, categoriaId, soPrecisaComprar, soComPendencia, ordem])

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
          <div
            ref={medirCaixa}
            onScroll={aoRolar}
            className="max-h-[min(68vh,720px)] overflow-auto"
            style={{ height: Math.min(visiveis.length * alturaDaLinha + 48, 720) }}
          >
            {telaLarga ? (
              /* Onze colunas. A calha de 20px do design system é a largura de
                 leitura de uma tabela de cinco colunas; aqui ela sozinha come
                 220px. Com 8px a tabela passou de 1374px para caber na caixa
                 de 1350px — ou seja, para de rolar na horizontal a partir de
                 1600px de tela. Abaixo disso a caixa é menor que a tabela e a
                 rolagem continua, dentro dela: a PÁGINA nunca rola de lado.
                 O `<table>` é montado aqui, e não pelo componente `Tabela`,
                 porque o cabeçalho grudado depende de este div ser o único
                 contêiner de rolagem. */
              <table className="w-full border-collapse text-corpo [&_td]:px-2 [&_th]:px-2 [&_tbody_tr:last-child>td]:border-b-0">
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
                  {espacoAcima > 0 && (
                    <tr aria-hidden style={{ height: espacoAcima }}>
                      <td colSpan={11} />
                    </tr>
                  )}
                  {janela.map((l) => (
                    <LinhaDaTabela key={l.produto_id} linha={l} />
                  ))}
                  {espacoAbaixo > 0 && (
                    <tr aria-hidden style={{ height: espacoAbaixo }}>
                      <td colSpan={11} />
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <ul className="divide-y divide-borda/60">
                {espacoAcima > 0 && <li aria-hidden style={{ height: espacoAcima }} />}
                {janela.map((l) => (
                  <CartaoDaLinha key={l.produto_id} linha={l} />
                ))}
                {espacoAbaixo > 0 && <li aria-hidden style={{ height: espacoAbaixo }} />}
              </ul>
            )}
          </div>
        )}
        {/* A legenda da marca. Fica FORA da caixa de rolagem, para não sumir
            quando a pessoa desce a lista. */}
        {visiveis.some((l) => l.anterior_lido_como_zero || l.atual_lido_como_zero) && (
          <p className="border-t border-borda px-5 py-3 text-micro leading-snug text-texto-fraco">
            <span className="border-b border-dotted border-alerta-texto/70">0</span>
            <span className="ml-1 rounded-marca-p bg-alerta-suave px-1 py-px font-medium text-alerta-texto">
              lido
            </span>{' '}
            — o insumo não estava
            na folha daquela contagem. O número é leitura, não medida: ninguém contou. Enquanto o
            estoque de hoje não for contado, a tela não sugere compra para ele.
          </p>
        )}
      </Cartao>
    </>
  )
}

/** Número que pode não existir. Vazio é vazio — nunca zero fingindo leitura. */
function Numero({
  valor,
  unidade,
  lidoComoZero,
  ponta,
}: {
  valor: number | null
  unidade?: string
  /** Este zero não foi contado: foi lido por ausência na folha. */
  lidoComoZero?: boolean
  ponta?: 'anterior' | 'atual'
}) {
  if (valor === null) return <span className="text-texto-fraco">—</span>
  const numero = (
    <>
      {formatarQuantidade(valor)}
      {unidade && <span className="ml-1 text-micro text-texto-fraco">{unidade}</span>}
    </>
  )
  if (!lidoComoZero || !ponta) return numero
  /*
   * A marca vai NO NÚMERO, e não numa frase embaixo do nome do insumo.
   *
   * Em texto corrido as duas pontas custavam três linhas de vermelho por
   * produto — e o relatório tem 904 linhas. Uma parede vermelha ensina a não
   * ler nenhuma delas. Aqui o aviso fica onde o engano aconteceria: em cima do
   * próprio zero, com o motivo no `title` (ponteiro) e no texto só-leitor
   * (teclado e leitor de tela), que é como a casa já marca o resto.
   */
  return (
    <span
      className="border-b border-dotted border-alerta-texto/70 text-texto-suave"
      title={explicacaoDoZeroLido(ponta)}
    >
      {numero}
      {/* A marca é um selo (fundo + texto), e não texto solto, de propósito:
          `text-alerta-texto` sozinho depende de a superfície acompanhar o
          tema, e neste sistema ela não acompanha — medido, com o tema escuro
          escolhido numa marca de cores claras, texto de alerta solto cai para
          1,53:1 em TODAS as telas da casa, inclusive nas antigas. O par
          `bg-alerta-suave` + `text-alerta-texto` vira junto: 5,62:1 no claro e
          9,18:1 no escuro. */}
      <span
        aria-hidden
        className="ml-1 rounded-marca-p bg-alerta-suave px-1 py-px text-micro font-medium text-alerta-texto"
      >
        lido
      </span>
      <span className="sr-only"> — {explicacaoDoZeroLido(ponta)}</span>
    </span>
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

/**
 * A célula do julgamento.
 *
 * `compacta` é a versão da tabela, onde a altura da linha é fixa por causa da
 * janela de rolagem: o motivo sai do corpo e vai para o `title` e para o texto
 * só-leitor. No cartão do celular, que é onde não existe ponteiro para parar
 * em cima de nada, ele continua por extenso.
 */
function Sugestao({ linha, compacta = false }: { linha: LinhaDoRelatorio; compacta?: boolean }) {
  const julgado = julgarSugestao(linha)
  const motivo = julgado.motivo
  const Explicacao = () =>
    motivo === null ? null : compacta ? (
      <span className="sr-only">{motivo}</span>
    ) : (
      <span className="line-clamp-2 text-micro leading-snug text-texto-fraco">{motivo}</span>
    )

  if (julgado.veredito === 'tem_de_sobra') {
    return <Selo tom="sucesso">Não precisa comprar</Selo>
  }
  // Sem movimento não ganha selo: um selo cinza repetido em quinhentas linhas
  // é ruído que ensina a não olhar os outros quinhentos.
  if (julgado.veredito === 'sem_movimento') {
    return (
      <span className="text-micro text-texto-fraco" title={motivo ?? undefined}>
        {compacta ? 'Sem movimento' : motivo}
      </span>
    )
  }
  if (julgado.veredito === 'sem_base') {
    return (
      <span className="inline-flex flex-col items-start gap-1" title={motivo ?? undefined}>
        <Selo tom="neutro">
          <TriangleAlert className="size-3" aria-hidden />
          Não se sabe
        </Selo>
        <Explicacao />
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col items-start gap-1" title={motivo ?? undefined}>
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
      <Explicacao />
    </span>
  )
}

/**
 * Quantos dos lançamentos considerados tiveram saída deste insumo.
 *
 * A média divide pelo número de LANÇAMENTOS, e isso está certo: para prever a
 * compra da semana, semana sem vender é semana de zero. O que faltava era
 * dizer que, dos três, em dois o insumo não saiu — porque é essa diferença que
 * separa "item parado" de "item que acabou de entrar no cardápio", e só quem
 * conhece a casa sabe qual é qual. Aparece só quando há o que dizer.
 */
function SaiuEm({ linha }: { linha: LinhaDoRelatorio }) {
  if (linha.media_3_vendas === null) return null
  if (linha.vendas_com_saida >= linha.vendas_consideradas) return null
  return (
    <span className="mt-0.5 block text-micro leading-snug text-texto-fraco">
      saiu em {linha.vendas_com_saida} de {linha.vendas_consideradas}
    </span>
  )
}

function LinhaDaTabela({ linha }: { linha: LinhaDoRelatorio }) {
  const semResposta = julgarSugestao(linha).veredito === 'sem_base'
  return (
    // Altura fixa: a janela de rolagem conta em pixels, e uma linha que cresce
    // desalinha os espaçadores e faz a lista “pular”. O que não cabe em duas
    // linhas de texto vai para o `title`.
    <tr className={clsx(semResposta && 'bg-alerta-suave/30')} style={{ height: ALTURA_DA_LINHA }}>
      <Td className="max-w-[16rem]">
        <span className="block truncate font-medium text-texto" title={linha.produto_nome}>
          {linha.produto_nome}
        </span>
        {linha.pendencia && (
          <span
            className="mt-0.5 line-clamp-1 block text-micro leading-snug text-alerta-texto"
            title={linha.pendencia}
          >
            {linha.pendencia}
          </span>
        )}
      </Td>
      <Td className="max-w-[8rem] text-texto-suave">
        <span className="block truncate" title={linha.categoria_nome ?? undefined}>
          {linha.categoria_nome ?? '—'}
        </span>
      </Td>
      <Td numerico>
        <Numero
          valor={linha.contagem_anterior}
          unidade={linha.unidade}
          lidoComoZero={linha.anterior_lido_como_zero}
          ponta="anterior"
        />
      </Td>
      <Td numerico>
        <Numero valor={linha.compras} unidade={linha.unidade} />
      </Td>
      <Td numerico>
        <Numero valor={linha.vendas} unidade={linha.unidade} />
      </Td>
      <Td numerico className="font-semibold">
        <Numero
          valor={linha.contagem_atual}
          unidade={linha.unidade}
          lidoComoZero={linha.atual_lido_como_zero}
          ponta="atual"
        />
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
        <SaiuEm linha={linha} />
      </Td>
      <Td>
        <Sugestao linha={linha} compacta />
      </Td>
    </tr>
  )
}

/**
 * O cartão do celular.
 *
 * A fórmula de cada coluna NÃO se repete aqui. O argumento original era bom —
 * num aparelho de toque não existe parar o ponteiro em cima de nada, então
 * explicação atrás de hover é explicação que não existe —, mas a resposta
 * certa para ele é o cartão “Como esta conta é feita”, que abre esta mesma
 * tela, no celular inclusive, com as três fórmulas e o que cada uma responde.
 * Repeti-las em cada um dos 904 cartões custava 84px por cartão: é o que fazia
 * o cartão precisar de 377px de altura, e altura fixa é o que a janela de
 * rolagem exige.
 */
function CartaoDaLinha({ linha }: { linha: LinhaDoRelatorio }) {
  const semResposta = julgarSugestao(linha).veredito === 'sem_base'
  return (
    <li
      className={clsx('overflow-hidden px-5 py-4', semResposta && 'bg-alerta-suave/30')}
      style={{ height: ALTURA_DO_CARTAO }}
    >
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
            ['Contagem anterior', linha.contagem_anterior, 'anterior'],
            ['Compras', linha.compras, null],
            ['Vendas', linha.vendas, null],
            ['Contagem atual', linha.contagem_atual, 'atual'],
            ['Consumo', linha.consumo, null],
            ['Ideal', linha.ideal, null],
            ['Média 3 vendas', linha.media_3_vendas, null],
          ] as const
        ).map(([rotulo, valor, ponta]) => (
          <div key={rotulo}>
            <dt className="mv-rotulo">{rotulo}</dt>
            <dd className="mv-numero text-corpo text-texto">
              <Numero
                valor={valor}
                unidade={linha.unidade}
                lidoComoZero={
                  ponta === 'anterior'
                    ? linha.anterior_lido_como_zero
                    : ponta === 'atual'
                      ? linha.atual_lido_como_zero
                      : false
                }
                ponta={ponta ?? undefined}
              />
            </dd>

          </div>
        ))}
        <div>
          <dt className="mv-rotulo">Saída no período da média</dt>
          <dd className="mv-numero text-corpo text-texto">
            {linha.vendas_com_saida} de {linha.vendas_consideradas}{' '}
            {plural(linha.vendas_consideradas, 'lançamento', 'lançamentos')}
          </dd>
        </div>
        <div>
          <dt className="mv-rotulo">Diferença</dt>
          <dd className="mv-numero text-corpo">
            <Diferenca valor={linha.diferenca} unidade={linha.unidade} />
          </dd>
        </div>
      </dl>

      {linha.pendencia && (
        <p className="mt-3 line-clamp-2 text-micro leading-snug text-alerta-texto" title={linha.pendencia}>
          {linha.pendencia}
        </p>
      )}
    </li>
  )
}
