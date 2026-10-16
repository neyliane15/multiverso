/**
 * Módulo 2 · leitura da contagem.
 *
 * A folha de contagem responde "quanto tem de cada coisa". Esta tela responde
 * as perguntas que vêm depois, e que ninguém consegue fazer olhando 868 linhas
 * em ordem alfabética: onde está o dinheiro, o que zerou, e por onde começar a
 * reposição.
 *
 * Três decisões que valem o comentário:
 *
 * 1. **Ela lê UMA contagem, escolhida, e diz qual.** O padrão é a mais recente
 *    fechada (`contagemPadrao`). Restaurante sem nenhuma contagem fechada vê
 *    estado vazio — nunca uma faixa de quatro zeros, que parece leitura e não
 *    é. Essa é a mesma regra do dashboard de CMV: número ausente, nunca número
 *    inventado.
 *
 * 2. **As barras são divs com largura percentual, e não biblioteca de
 *    gráfico.** São dezessete categorias no cadastro real; acima de ~7 classes
 *    as cores de série encostam umas nas outras, então o desenho que funciona
 *    é a barra horizontal com o nome e o valor escritos ao lado. A cor de cada
 *    categoria vem do banco, no `style` — a mesma que a tela de cadastro usa.
 *
 * 3. **Dinheiro e quantidade têm confiabilidades diferentes**, e a tela não
 *    finge o contrário. `agruparPorProduto` só soma quantidade quando todas as
 *    paradas usaram a mesma unidade; quando não, a coluna Estoque diz
 *    "unidades diferentes" e a coluna Total segue valendo. Ver o comentário de
 *    `logicaDoDashboard`.
 *
 * O desenho vem de um artefato que a cliente mandou; a estrutura é a dele e o
 * vestuário é o desta casa.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChartColumnBig, CircleOff, Layers, Store, TriangleAlert, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import {
  useCategorias,
  useContagens,
  useItensDaContagem,
  useProcedenciaDaContagem,
} from '@/dados/consultas'
import type { ContagemProcedencia } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  Campo,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Ponto,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import {
  data as formatarData,
  dataHora,
  dinheiro,
  porcentagem,
  quantidade as formatarQuantidade,
} from '@/util/formato'
import { SeletorDeContagem } from './SeletorDeContagem'
import {
  agruparPorProduto,
  alertaDeReposicao,
  capitalParado,
  contagemEmFoco,
  filtrarEOrdenar,
  kpisDaContagem,
  paginar,
  valorPorCategoria,
  zeradosPorCategoria,
  type OrdemDaTabela,
  type ProdutoContado,
} from './logicaDoDashboard'

const POR_PAGINA = 25

/**
 * O valor do `<option>` do balde "Sem categoria".
 *
 * Um `<option>` não carrega `null`: o valor de um campo HTML é sempre string.
 * Este sentinela é impossível de colidir com um uuid de categoria, e é o que
 * permite ao filtro distinguir "todas" (string vazia) de "as sem categoria".
 */
const SEM_CATEGORIA = '\u0000sem-categoria'

export function DashboardDaContagem() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Leitura da contagem" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ler a contagem dele.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  // A `key` troca a tela inteira quando o master pula de restaurante: sem
  // isso, a contagem escolhida e a busca digitada atravessariam a troca, e a
  // tela abriria apontando para uma contagem que não é mais desta casa.
  return (
    <LeituraDoRestaurante
      key={restaurante.id}
      restauranteId={restaurante.id}
      restauranteNome={restaurante.nome}
    />
  )
}

function LeituraDoRestaurante({
  restauranteId,
  restauranteNome,
}: {
  restauranteId: string
  restauranteNome: string
}) {
  const navegar = useNavigate()
  const contagens = useContagens(restauranteId)
  const categorias = useCategorias(restauranteId)
  const [escolhida, setEscolhida] = useState<string | null>(null)

  const foco = useMemo(
    () => contagemEmFoco(contagens.data ?? [], escolhida),
    [contagens.data, escolhida],
  )
  const itens = useItensDaContagem(foco?.id)
  const procedencia = useProcedenciaDaContagem(foco?.id)

  const produtos = useMemo(
    () => agruparPorProduto(itens.data ?? [], categorias.data ?? []),
    [itens.data, categorias.data],
  )

  const cabecalho = (
    <div>
      <p className="mv-rotulo mb-1.5">Contagem de estoque · {restauranteNome}</p>
      <CabecalhoDePagina
        titulo={
          foco ? `Leitura da contagem — ${formatarData(foco.referencia)}` : 'Leitura da contagem'
        }
        descricao={
          foco && procedencia.data ? <LinhaDeMetadados procedencia={procedencia.data} /> : undefined
        }
        acoes={
          (contagens.data ?? []).length > 0 ? (
            <SeletorDeContagem
              contagens={contagens.data ?? []}
              escolhida={foco?.id ?? null}
              aoEscolher={setEscolhida}
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

  /*
   * O estado vazio honesto, e os dois motivos para ele.
   *
   * Sem contagem nenhuma, não há o que ler. Com contagens mas nenhuma fechada,
   * `contagemPadrao` devolve nulo de propósito — mas aqui o seletor existe e a
   * pessoa pode escolher a folha em andamento, então o texto muda: não é
   * "nunca contaram", é "ainda não fecharam a primeira".
   */
  if (!foco) {
    const temAlguma = (contagens.data ?? []).length > 0
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio
            icone={<ChartColumnBig />}
            titulo={temAlguma ? 'Nenhuma contagem fechada ainda' : 'Nenhuma contagem ainda'}
            acao={
              <Botao tom="primario" onClick={() => navegar('/contagem')}>
                {temAlguma ? 'Ir para a folha de contagem' : 'Abrir a primeira contagem'}
              </Botao>
            }
          >
            {temAlguma
              ? 'Esta casa tem contagem em andamento, mas nenhuma fechada. A leitura precisa de uma foto inteira: enquanto a folha está aberta, o total que aparecesse aqui seria metade do estoque com cara de total.'
              : 'A leitura é feita sobre uma contagem. Abra a primeira e feche-a — ela também é a linha de partida do CMV.'}
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  if (itens.isLoading || categorias.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={8} />
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
      {foco.status !== 'fechada' && (
        <Aviso tom="alerta" titulo="Esta contagem ainda está em andamento">
          Os números abaixo são parciais: o que ainda não foi contado entra como zero. A leitura
          definitiva é a da contagem fechada.
        </Aviso>
      )}
      <Leitura
        produtos={produtos}
        categorias={categorias.data ?? []}
        procedencia={procedencia.data ?? null}
      />
    </>
  )
}

/** A linha de metadados do cabeçalho: o que esta foto é, em números. */
function LinhaDeMetadados({ procedencia }: { procedencia: ContagemProcedencia }) {
  return (
    <>
      <span className="mv-numero">{procedencia.itens_na_folha}</span>{' '}
      {plural(procedencia.itens_na_folha, 'item na folha', 'itens na folha')} ·{' '}
      <span className="mv-numero">{procedencia.categorias}</span>{' '}
      {plural(procedencia.categorias, 'categoria', 'categorias')} ·{' '}
      <span className="mv-numero">{procedencia.abas}</span>{' '}
      {plural(procedencia.abas, 'aba', 'abas')} em{' '}
      <span className="mv-numero">{procedencia.setores}</span>{' '}
      {plural(procedencia.setores, 'setor', 'setores')} ·{' '}
      {procedencia.status === 'fechada'
        ? `fechada por ${procedencia.fechado_por_nome ?? 'alguém que saiu do sistema'}`
        : 'folha em andamento'}
    </>
  )
}

function Leitura({
  produtos,
  categorias,
  procedencia,
}: {
  produtos: ProdutoContado[]
  categorias: { id: string; nome: string; cor: string }[]
  procedencia: ContagemProcedencia | null
}) {
  const navegar = useNavigate()
  // Tri-estado: `undefined` = todas, `null` = Sem categoria, string = aquela.
  // Insumo sem categoria existe na folha, então o balde dele tem de ser
  // alcançável pelo filtro — e não pode dividir o mesmo valor com "todas".
  const [categoriaId, setCategoriaId] = useState<string | null | undefined>(undefined)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<OrdemDaTabela>('valor')
  const [soZerados, setSoZerados] = useState(false)
  const [pagina, setPagina] = useState(1)

  /*
   * O filtro de categoria do topo vale para a PÁGINA INTEIRA.
   *
   * Era a pergunta a decidir aqui: filtrar só a tabela, ou filtrar tudo? Filtrar
   * tudo, porque "Bebidas" é um recorte do estoque, e um KPI de valor total que
   * ignorasse o filtro ao lado de uma tabela que o obedece faria a tela parecer
   * quebrada. A exceção é o próprio seletor de categoria, que precisa continuar
   * oferecendo todas elas.
   */
  const noRecorte = useMemo(
    () =>
      categoriaId === undefined
        ? produtos
        : produtos.filter((p) => p.categoriaId === categoriaId),
    [produtos, categoriaId],
  )

  const kpis = useMemo(
    () => kpisDaContagem(noRecorte, procedencia?.abas ?? 0),
    [noRecorte, procedencia?.abas],
  )
  const fatias = useMemo(() => valorPorCategoria(noRecorte), [noRecorte])
  const ranking = useMemo(() => capitalParado(noRecorte), [noRecorte])
  const zerados = useMemo(() => zeradosPorCategoria(noRecorte), [noRecorte])
  const alerta = useMemo(() => alertaDeReposicao(zerados), [zerados])

  const filtrados = useMemo(
    () => filtrarEOrdenar(noRecorte, { busca, soZerados, ordem }),
    [noRecorte, busca, soZerados, ordem],
  )
  const paginado = paginar(filtrados, pagina, POR_PAGINA)

  // As categorias do seletor saem dos próprios produtos: oferecer uma
  // categoria que não tem item nesta foto seria oferecer uma tela vazia.
  const categoriasComItem = useMemo(() => {
    const presentes = new Set(produtos.map((p) => p.categoriaId))
    const doCadastro: { id: string | null; nome: string }[] = categorias.filter((c) =>
      presentes.has(c.id),
    )
    // O balde entra no fim, e só quando existe: um insumo sem categoria é
    // insumo que alguém esqueceu de classificar, e esconder o filtro dele
    // esconderia justamente o que precisa ser arrumado.
    if (presentes.has(null)) doCadastro.push({ id: null, nome: 'Sem categoria' })
    return doCadastro
  }, [produtos, categorias])

  return (
    <>
      {/* ──────────────────────────────────────── filtro por categoria ──── */}
      <Cartao>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label htmlFor="filtro-categoria" className="mv-rotulo">
            Filtrar por categoria
          </label>
          <Selecao
            id="filtro-categoria"
            value={categoriaId === undefined ? '' : (categoriaId ?? SEM_CATEGORIA)}
            onChange={(e) => {
              setCategoriaId(
                e.target.value === ''
                  ? undefined
                  : e.target.value === SEM_CATEGORIA
                    ? null
                    : e.target.value,
              )
              setPagina(1)
            }}
            className="w-full sm:w-64"
          >
            <option value="">Todas as categorias</option>
            {categoriasComItem.map((c) => (
              <option key={c.id ?? SEM_CATEGORIA} value={c.id ?? SEM_CATEGORIA}>
                {c.nome}
              </option>
            ))}
          </Selecao>
          <Botao
            tom="fantasma"
            tamanho="p"
            disabled={categoriaId === undefined}
            onClick={() => {
              setCategoriaId(undefined)
              setPagina(1)
            }}
          >
            Limpar filtro
          </Botao>
        </div>
      </Cartao>

      {/* ─────────────────────────────────────────────── os quatro KPIs ─── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Valor total em estoque"
          valor={dinheiro(kpis.valorTotal)}
          tom="marca"
          icone={<Wallet className="size-3.5" aria-hidden />}
          apoio={
            categoriaId === undefined
              ? 'Soma de quantidade × custo congelado, linha por linha da folha.'
              : 'Só a categoria em foco.'
          }
        />
        <Indicador
          rotulo="Itens contados"
          valor={formatarQuantidade(kpis.itensContados)}
          icone={<Layers className="size-3.5" aria-hidden />}
          apoio={`em ${kpis.categorias} ${plural(kpis.categorias, 'categoria', 'categorias')}, ${kpis.abas} ${plural(kpis.abas, 'aba', 'abas')}`}
        />
        <Indicador
          rotulo="Itens zerados"
          valor={formatarQuantidade(kpis.zerados)}
          tom={kpis.zerados > 0 ? 'alerta' : 'neutro'}
          icone={<CircleOff className="size-3.5" aria-hidden />}
          apoio={`${porcentagem(kpis.percentualZerados)} do total contado`}
        />
        <Indicador
          rotulo="Maior categoria"
          valor={
            kpis.maiorCategoria ? (
              <span className="flex items-center gap-2 text-secao">
                {kpis.maiorCategoria.cor && <Ponto cor={kpis.maiorCategoria.cor} />}
                <span className="truncate">{kpis.maiorCategoria.nome}</span>
              </span>
            ) : (
              '—'
            )
          }
          apoio={
            kpis.maiorCategoria
              ? `${dinheiro(kpis.maiorCategoria.valor)} · ${porcentagem(kpis.maiorCategoria.participacao)} do estoque`
              : 'Nenhuma categoria com item nesta foto.'
          }
        />
      </div>

      {/* ───────────────────────────── valor por categoria + ranking ────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Valor em estoque por categoria"
          descricao="Ordenado por valor total. A barra compara com a maior categoria."
        >
          {fatias.length === 0 ? (
            <EstadoVazio titulo="Nada a comparar">
              Nenhum item nesta foto depois do filtro.
            </EstadoVazio>
          ) : (
            <ul className="divide-y divide-borda/60">
              {fatias.map((f) => (
                <li key={f.categoriaId ?? 'sem'} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      {f.cor && <Ponto cor={f.cor} />}
                      <span className="truncate text-corpo text-texto">{f.nome}</span>
                    </span>
                    <span className="mv-numero shrink-0 text-corpo font-semibold text-texto">
                      {dinheiro(f.valor)}
                    </span>
                  </div>
                  {/* A barra repete o valor em comprimento: quem não separa as
                      cores ainda compara pelo tamanho. */}
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-superficie-3"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(f.proporcao, f.valor > 0 ? 1.5 : 0)}%`,
                        backgroundColor: f.cor ?? 'var(--mv-borda-forte)',
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-micro text-texto-fraco">
                    <span>
                      {f.itens} {plural(f.itens, 'insumo', 'insumos')}
                      {f.zerados > 0 && `, ${f.zerados} ${plural(f.zerados, 'zerado', 'zerados')}`}
                    </span>
                    <span className="mv-numero">{porcentagem(f.participacao)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Onde está o capital parado"
          descricao="Os dez insumos de maior valor em estoque nesta foto."
        >
          {ranking.length === 0 ? (
            <EstadoVazio icone={<Wallet />} titulo="Nenhum insumo com valor">
              Toda a foto está zerada, ou o filtro não deixou nada com valor.
            </EstadoVazio>
          ) : (
            <ol className="divide-y divide-borda/60">
              {ranking.map((p, i) => (
                <li key={p.produtoId} className="flex items-center gap-3 px-5 py-3">
                  <span className="mv-numero w-5 shrink-0 text-right text-apoio text-texto-fraco">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-corpo text-texto">{p.nome}</span>
                    <span className="block truncate text-micro text-texto-fraco">
                      {p.categoriaNome}
                      {' · '}
                      {p.quantidade === null
                        ? 'unidades diferentes'
                        : `${formatarQuantidade(p.quantidade)} ${p.unidade}`}
                    </span>
                  </span>
                  <span className="mv-numero shrink-0 text-corpo font-semibold text-texto">
                    {dinheiro(p.total)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>

      {/* ───────────────────────────────────────── os zerados e o alerta ── */}
      <Cartao
        titulo="Itens zerados por categoria"
        descricao="Estoque zero no momento da contagem. Ordenado por quantidade de zerados."
      >
        <div className="space-y-4 p-5">
          {alerta === null ? (
            <Aviso tom="sucesso" titulo="Nenhum item zerado nesta leitura">
              Todo insumo da folha fechou com quantidade maior que zero.
            </Aviso>
          ) : (
            <Aviso tom="alerta" titulo="Por onde começar a reposição">
              <p className="mt-1">{alerta}</p>
              <p className="mt-1">
                Use a busca da tabela completa para abrir os itens de qualquer uma delas, ou o
                relatório para ver quanto comprar de cada um.
              </p>
              <Botao
                tom="secundario"
                tamanho="p"
                className="mt-3"
                onClick={() => navegar('/contagem/relatorio')}
              >
                Ver o relatório de contagem
              </Botao>
            </Aviso>
          )}

          {zerados.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {zerados.map((z) => (
                <li key={z.categoriaId ?? 'sem'}>
                  <Selo cor={z.cor ?? undefined}>
                    {z.nome}
                    <span className="mv-numero font-semibold">
                      {z.zerados}/{z.itens}
                    </span>
                    <span className="mv-numero text-texto-fraco">
                      {porcentagem(z.percentual, 0)}
                    </span>
                  </Selo>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Cartao>

      {/* ────────────────────────────────────────── a tabela completa ───── */}
      <Cartao
        titulo="Tabela completa — todos os itens contados"
        descricao="Busque, ordene pelos atalhos ou filtre pela categoria no topo da página."
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-borda px-5 py-4">
          <Campo
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar insumo ou categoria…"
            aria-label="Buscar insumo"
            className="w-full sm:w-72"
          />
          <div className="flex rounded-marca-p border border-borda p-0.5" role="group" aria-label="Ordenar por">
            {(
              [
                ['valor', 'Valor total'],
                ['estoque', 'Estoque'],
                ['nome', 'Nome'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={ordem === valor}
                onClick={() => setOrdem(valor)}
                className={clsx(
                  'min-h-toque rounded-marca-interno px-3 text-apoio font-medium transition-colors',
                  ordem === valor
                    ? 'bg-primaria text-sobre-primaria'
                    : 'text-texto-suave hover:text-texto',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Botao
            tom={soZerados ? 'primario' : 'secundario'}
            tamanho="p"
            aria-pressed={soZerados}
            onClick={() => {
              setSoZerados((s) => !s)
              setPagina(1)
            }}
          >
            Só zerados
          </Botao>
          <span className="mv-numero ml-auto text-apoio text-texto-fraco">
            {paginado.total === 0
              ? 'nenhum item'
              : `${paginado.de}–${paginado.ate} de ${paginado.total}`}
          </span>
        </div>

        {paginado.total === 0 ? (
          <EstadoVazio titulo="Nenhum item com esses filtros">
            Limpe a busca, a categoria ou o “Só zerados”.
          </EstadoVazio>
        ) : (
          <>
            {/* Celular: cartões. Seis colunas numa tabela de 390px ou cortam
                informação ou viram rolagem horizontal cega. */}
            <ul className="divide-y divide-borda/60 lg:hidden">
              {paginado.linhas.map((p) => (
                <li key={p.produtoId} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-corpo font-medium text-texto">{p.nome}</div>
                      <div className="mt-0.5 truncate text-micro text-texto-fraco">
                        {p.categoriaNome}
                      </div>
                    </div>
                    <div className="mv-numero shrink-0 text-right text-corpo font-semibold text-texto">
                      {dinheiro(p.total)}
                    </div>
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-micro">
                    <div className="flex gap-1.5">
                      <dt className="text-texto-fraco">Estoque</dt>
                      <dd className="mv-numero text-texto">
                        {p.quantidade === null
                          ? 'unidades diferentes'
                          : `${formatarQuantidade(p.quantidade)} ${p.unidade}`}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-texto-fraco">Valor unit.</dt>
                      <dd className="mv-numero text-texto">{dinheiro(p.valorUnitario)}</dd>
                    </div>
                    {p.zerado && (
                      <div>
                        <Selo tom="alerta">zerado</Selo>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Categoria</Th>
                    <Th numerico>Estoque</Th>
                    <Th>Un.</Th>
                    <Th numerico>Valor unit.</Th>
                    <Th numerico>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {paginado.linhas.map((p) => (
                    <tr key={p.produtoId} className={clsx(p.zerado && 'text-texto-suave')}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{p.nome}</span>
                          {p.zerado && <Selo tom="alerta">zerado</Selo>}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          {p.categoriaCor && <Ponto cor={p.categoriaCor} />}
                          <span className="truncate">{p.categoriaNome}</span>
                        </span>
                      </Td>
                      <Td numerico>
                        {/* Quantidade não comparável não vira número nenhum: a
                            célula diz o que aconteceu, e o total ao lado
                            continua confiável. */}
                        {p.quantidade === null ? (
                          <span className="text-micro text-alerta-texto">unidades diferentes</span>
                        ) : (
                          formatarQuantidade(p.quantidade)
                        )}
                      </Td>
                      <Td className="text-texto-fraco">{p.unidade ?? '—'}</Td>
                      <Td numerico>{dinheiro(p.valorUnitario)}</Td>
                      <Td numerico className="font-semibold">
                        {dinheiro(p.total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3">
              <span className="mv-numero text-apoio text-texto-fraco">
                Página {paginado.pagina} de {paginado.paginas}
              </span>
              <div className="flex gap-2">
                <Botao
                  tom="secundario"
                  tamanho="p"
                  disabled={paginado.pagina <= 1}
                  onClick={() => setPagina(paginado.pagina - 1)}
                >
                  ← anterior
                </Botao>
                <Botao
                  tom="secundario"
                  tamanho="p"
                  disabled={paginado.pagina >= paginado.paginas}
                  onClick={() => setPagina(paginado.pagina + 1)}
                >
                  próxima →
                </Botao>
              </div>
            </div>
          </>
        )}
      </Cartao>

      {/* ───────────────────────────────────────────────── procedência ──── */}
      {procedencia && <Procedencia procedencia={procedencia} />}
    </>
  )
}

/**
 * De onde veio esta leitura.
 *
 * `fichas.origem_carga` existe porque ficha nasce de arquivo; contagem não —
 * ela nasce da folha e é preenchida à mão. Então este rodapé afirma só o que o
 * banco sabe de fato: quem abriu, quem fechou, quando, quantas paradas foram
 * lidas e quantas linhas ficaram sem resposta. Inventar "gerado a partir de
 * tal planilha" aqui seria procedência falsa, que é pior que procedência
 * curta.
 */
function Procedencia({ procedencia }: { procedencia: ContagemProcedencia }) {
  const semResposta = procedencia.itens_na_folha - procedencia.itens_respondidos
  return (
    <footer className="rounded-marca border border-borda bg-superficie-1 px-5 py-4 text-apoio leading-relaxed text-texto-fraco">
      <span className="mv-rotulo mb-1.5 block">Procedência desta leitura</span>
      <p>
        Contagem <span className="capitalize">{procedencia.tipo}</span> de{' '}
        <span className="mv-numero text-texto-suave">
          {formatarData(procedencia.referencia)}
        </span>
        {procedencia.titulo && <> — “{procedencia.titulo}”</>}, aberta por{' '}
        {procedencia.criado_por_nome ?? 'alguém que saiu do sistema'} em{' '}
        <span className="mv-numero">{dataHora(procedencia.criado_em)}</span>
        {procedencia.status === 'fechada' ? (
          <>
            {' '}
            e fechada por {procedencia.fechado_por_nome ?? 'alguém que saiu do sistema'} em{' '}
            <span className="mv-numero">{dataHora(procedencia.fechada_em)}</span>. O valor e o
            custo de cada linha foram congelados nesse momento.
          </>
        ) : (
          <>
            {' '}
            e <strong>ainda aberta</strong> — os valores desta tela mudam a cada lançamento, e o
            custo ainda não está congelado.
          </>
        )}
      </p>
      <p className="mt-1.5">
        <span className="mv-numero">{procedencia.itens_na_folha}</span>{' '}
        {plural(procedencia.itens_na_folha, 'linha', 'linhas')} em{' '}
        <span className="mv-numero">{procedencia.abas}</span>{' '}
        {plural(procedencia.abas, 'aba', 'abas')} de{' '}
        <span className="mv-numero">{procedencia.setores}</span>{' '}
        {plural(procedencia.setores, 'setor', 'setores')}.{' '}
        {semResposta === 0 ? (
          'Todas as linhas foram respondidas.'
        ) : (
          <span className="text-alerta-texto">
            <TriangleAlert className="mr-1 inline size-3.5" aria-hidden />
            {semResposta} {plural(semResposta, 'linha', 'linhas')} sem resposta nenhuma — elas
            entram nesta leitura como zero.
          </span>
        )}
      </p>
    </footer>
  )
}
