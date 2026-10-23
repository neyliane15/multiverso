/**
 * Módulo 2 · vendas do período.
 *
 * É a terceira ponta do relatório de contagem. As outras duas já existiam: o
 * estoque vem da contagem, a entrada vem da nota fiscal. O que saiu pela porta
 * não existia em lugar nenhum — e sem isso o IDEAL não tem como ser calculado,
 * porque ele é justamente "o que o cardápio diz que deveria ter sobrado".
 *
 * Três decisões da cliente que esta tela encarna:
 *
 * 1. **A venda é lançada em FICHA, não em produto.** Ninguém vende "1,2 kg de
 *    picanha": vende oito porções de PICANHA NA CHAPA. A conversão até o
 *    insumo é da ficha, e ela já sabe fazê-la — inclusive pela embalagem, que
 *    é o que transforma 60 ML de vodka em 0,06 garrafa.
 *
 * 2. **Produção não entra.** `fichas.producao` é insumo interno: a massa do
 *    empadão, o xarope do bar. Ela entra DENTRO de outra ficha, nunca no
 *    cardápio. A busca aqui já a esconde, e o banco recusa por gatilho — a
 *    tela é conforto, o gatilho é a regra.
 *
 * 3. **Fechar é o que conta.** Enquanto o lançamento está aberto ele não entra
 *    em conta nenhuma, e por isso pode ser corrigido à vontade. Fechado, ele
 *    vira foto: o relatório do período não muda de número depois de lido, e o
 *    banco recusa alteração de item — a mesma regra da contagem fechada.
 *
 * A importação de PDV **não** está aqui. O encaixe dela está: `vendas.origem`,
 * `vendas.origem_arquivo` e `venda_itens.descricao_origem` já existem no
 * banco, nos mesmos papéis que `notas_fiscais.origem` e `nota_itens.descricao`
 * cumprem nas compras. Esta tela é o caminho da mão.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  CircleCheck,
  Lock,
  LockOpen,
  Plus,
  Receipt,
  Search,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { useSessao } from '@/dados/sessao'
import {
  useApagarVenda,
  useFecharVenda,
  useFichas,
  useItensDaVenda,
  useReabrirVenda,
  useSalvarItensDaVenda,
  useSalvarVenda,
  useVendas,
  type ItemDeVendaParaGravar,
} from '@/dados/consultas'
import type { FichaCompleta, Venda } from '@/tipos/banco'
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
  Linha,
  Rotulo,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { chaveBusca, data as formatarData, dataHora, dinheiro, quantidade as formatarQuantidade } from '@/util/formato'
import { PainelLateral } from '../PainelLateral'
import { hojeIso } from './logica'

const TOM_DO_STATUS = { fechada: 'sucesso', aberta: 'marca', cancelada: 'erro' } as const
const ROTULO_DO_STATUS = { fechada: 'Fechada', aberta: 'Aberta', cancelada: 'Cancelada' } as const

export function Vendas() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Vendas" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para lançar as vendas dele.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <VendasDoRestaurante key={restaurante.id} restauranteId={restaurante.id} />
}

function VendasDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const { perfil, ehMaster } = useSessao()
  const vendas = useVendas(restauranteId)
  const fichas = useFichas(restauranteId)
  const fechar = useFecharVenda(restauranteId)
  const reabrir = useReabrirVenda(restauranteId)
  const apagar = useApagarVenda(restauranteId)

  const [editando, setEditando] = useState<Venda | 'nova' | null>(null)
  const [fechando, setFechando] = useState<Venda | null>(null)
  const [apagando, setApagando] = useState<Venda | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  // Apagar um lançamento muda o relatório de um período já lido, do mesmo jeito
  // que apagar contagem muda o CMV. A política do banco diz o mesmo; aqui o
  // botão só não aparece para quem levaria uma recusa.
  const podeApagar = ehMaster || perfil?.papel === 'admin'

  /** As fichas que se vendem: ativas e não-produção. */
  const vendaveis = useMemo(
    () => (fichas.data ?? []).filter((f) => f.ativo && !f.producao),
    [fichas.data],
  )

  const cabecalho = (
    <CabecalhoDePagina
      titulo="Vendas"
      descricao="O que saiu pela porta, ficha por ficha. Fechar o lançamento é o que o relatório de contagem enxerga."
      acoes={
        <Botao tom="primario" icone={<Plus className="size-4" aria-hidden />} onClick={() => setEditando('nova')}>
          Novo lançamento
        </Botao>
      }
    />
  )

  if (vendas.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={5} />
        </Cartao>
      </>
    )
  }
  if (vendas.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta erro={vendas.error} aoTentar={() => void vendas.refetch()} />
        </Cartao>
      </>
    )
  }

  const lista = vendas.data ?? []

  return (
    <>
      {cabecalho}

      {falha && (
        <Aviso tom="erro" titulo="Não deu para gravar">
          {falha}
        </Aviso>
      )}

      {vendaveis.length === 0 && !fichas.isLoading && (
        <Aviso tom="alerta" titulo="Nenhuma ficha de venda cadastrada">
          A venda é lançada em ficha, não em insumo: é a ficha que sabe quanto de cada produto o
          prato consome. Cadastre as fichas do cardápio antes de lançar as vendas — produções não
          contam, elas são insumo interno.
        </Aviso>
      )}

      {lista.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Receipt />}
            titulo="Nenhum lançamento de venda ainda"
            acao={
              <Botao tom="primario" onClick={() => setEditando('nova')}>
                Lançar o primeiro período
              </Botao>
            }
          >
            Sem venda lançada, o relatório de contagem calcula o consumo mas não o ideal — e não
            tem base para sugerir compra nenhuma.
          </EstadoVazio>
        </Cartao>
      ) : (
        <Cartao>
          <Tabela>
            <thead>
              <tr>
                <Th>Período</Th>
                <Th>Status</Th>
                <Th>Origem</Th>
                <Th numerico>Fichas</Th>
                <Th numerico>Valor</Th>
                <Th>Fechada</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <Linha key={v.id} aoClicar={() => setEditando(v)}>
                  <Td>
                    <span className="mv-numero block font-medium text-texto">
                      {v.inicio ? `${formatarData(v.inicio)} – ` : 'até '}
                      {formatarData(v.referencia)}
                    </span>
                    {v.titulo && (
                      <span className="block text-micro text-texto-fraco">{v.titulo}</span>
                    )}
                  </Td>
                  <Td>
                    <Selo tom={TOM_DO_STATUS[v.status]}>{ROTULO_DO_STATUS[v.status]}</Selo>
                  </Td>
                  <Td className="text-texto-suave">
                    {v.origem === 'manual' ? 'Lançada à mão' : 'PDV'}
                    {v.origem_arquivo && (
                      <span className="block truncate text-micro text-texto-fraco">
                        {v.origem_arquivo}
                      </span>
                    )}
                  </Td>
                  <Td numerico>{v.status === 'fechada' ? v.total_itens : '—'}</Td>
                  <Td numerico className="font-semibold">
                    {v.status === 'fechada' ? dinheiro(v.total_valor) : '—'}
                  </Td>
                  <Td className="text-texto-suave">
                    {v.fechada_em ? (
                      <span className="mv-numero text-micro">{dataHora(v.fechada_em)}</span>
                    ) : (
                      <span className="text-texto-fraco">em edição</span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex justify-end gap-1">
                      {v.status === 'aberta' ? (
                        <Botao
                          tom="secundario"
                          tamanho="p"
                          aria-label="Fechar este lançamento"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFalha(null)
                            setFechando(v)
                          }}
                        >
                          <Lock className="size-4" aria-hidden />
                        </Botao>
                      ) : (
                        v.status === 'fechada' && (
                          <Botao
                            tom="fantasma"
                            tamanho="p"
                            aria-label="Reabrir este lançamento"
                            carregando={reabrir.isPending}
                            onClick={(e) => {
                              e.stopPropagation()
                              setFalha(null)
                              reabrir.mutate(v.id, {
                                onError: (erro) =>
                                  setFalha(erro instanceof Error ? erro.message : String(erro)),
                              })
                            }}
                          >
                            <LockOpen className="size-4" aria-hidden />
                          </Botao>
                        )
                      )}
                      {podeApagar && (
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          aria-label="Apagar este lançamento"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFalha(null)
                            setApagando(v)
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Botao>
                      )}
                    </span>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
      )}

      {editando && (
        <PainelDoLancamento
          restauranteId={restauranteId}
          venda={editando === 'nova' ? null : editando}
          fichas={vendaveis}
          aoFechar={() => setEditando(null)}
          aoFalhar={setFalha}
        />
      )}

      {fechando && (
        <Dialogo
          titulo="Fechar este lançamento?"
          descricao={`Período que termina em ${formatarData(fechando.referencia)}`}
          aoFechar={() => setFechando(null)}
          rodape={
            <>
              <Botao tom="fantasma" onClick={() => setFechando(null)}>
                Ainda não
              </Botao>
              <Botao
                tom="primario"
                carregando={fechar.isPending}
                onClick={() =>
                  fechar.mutate(fechando.id, {
                    onSuccess: () => setFechando(null),
                    onError: (erro) => {
                      setFechando(null)
                      setFalha(erro instanceof Error ? erro.message : String(erro))
                    },
                  })
                }
              >
                Fechar o lançamento
              </Botao>
            </>
          }
        >
          <div className="space-y-3 text-corpo leading-relaxed text-texto-suave">
            <p>
              A partir daqui o relatório de contagem passa a considerar estas vendas — e as linhas
              do lançamento ficam trancadas, como as de uma contagem fechada.
            </p>
            <p>
              Reabrir é possível e fica registrado. O que não existe é corrigir uma linha sem
              reabrir: um relatório que muda de número depois de lido não serve para decidir compra.
            </p>
          </div>
        </Dialogo>
      )}

      {apagando && (
        <Dialogo
          titulo="Apagar este lançamento?"
          aoFechar={() => setApagando(null)}
          rodape={
            <>
              <Botao tom="fantasma" onClick={() => setApagando(null)}>
                Não apagar
              </Botao>
              <Botao
                tom="perigo"
                carregando={apagar.isPending}
                onClick={() =>
                  apagar.mutate(apagando.id, {
                    onSuccess: () => setApagando(null),
                    onError: (erro) => {
                      setApagando(null)
                      setFalha(erro instanceof Error ? erro.message : String(erro))
                    },
                  })
                }
              >
                Apagar o lançamento
              </Botao>
            </>
          }
        >
          <div className="space-y-3 text-corpo leading-relaxed text-texto-suave">
            <p>
              O lançamento de{' '}
              <strong className="mv-numero text-texto">
                {formatarData(apagando.referencia)}
              </strong>{' '}
              some do sistema, com as fichas dentro dele.
            </p>
            {/* O mesmo aviso do histórico de contagens, e pelo mesmo motivo:
                este número é ponta de um período. Apagá-lo muda o ideal e a
                média de três semanas de uma vez, e quem olhar o relatório
                depois não vai ter como saber por quê. */}
            <p>
              O relatório dos períodos que usavam estas vendas passa a ser calculado sem elas, e a
              média das três últimas vendas muda junto. Se a ideia é só tirar do caminho um
              lançamento errado, reabra-o e corrija as linhas.
            </p>
            <p className="text-alerta-texto">Não tem desfazer.</p>
          </div>
        </Dialogo>
      )}
    </>
  )
}

/* ──────────────────────────────────────────── o formulário de um período ── */

interface LinhaDoFormulario {
  fichaId: string
  nome: string
  quantidade: number
  precoUnitario: number
}

function PainelDoLancamento({
  restauranteId,
  venda,
  fichas,
  aoFechar,
  aoFalhar,
}: {
  restauranteId: string
  venda: Venda | null
  fichas: FichaCompleta[]
  aoFechar: () => void
  aoFalhar: (mensagem: string) => void
}) {
  const itens = useItensDaVenda(venda?.id)
  const salvarVenda = useSalvarVenda(restauranteId)
  const salvarItens = useSalvarItensDaVenda(restauranteId)

  const [referencia, setReferencia] = useState(venda?.referencia ?? hojeIso())
  const [inicio, setInicio] = useState(venda?.inicio ?? '')
  const [titulo, setTitulo] = useState(venda?.titulo ?? '')
  const [linhas, setLinhas] = useState<LinhaDoFormulario[]>([])
  const [busca, setBusca] = useState('')

  const trancado = venda?.status === 'fechada'

  // As linhas chegam do servidor uma vez, quando a consulta volta. Depois disso
  // o formulário é o dono do rascunho: recarregar a cada render apagaria o que
  // a pessoa está digitando.
  // Só as linhas de FICHA: um lançamento importado do PDV também tem linha de
  // insumo direto, de serviço e pendente, e este formulário não sabe editá-las.
  // Elas continuam no banco — `useSalvarItensDaVenda` reconcilia apenas ficha —
  // e quem as resolve é a tela de conferência da planilha.
  useEffect(() => {
    if (!itens.data) return
    setLinhas(
      itens.data
        .filter((i) => i.alvo === 'ficha' && i.ficha_id !== null)
        .map((i) => ({
          fichaId: i.ficha_id as string,
          nome: i.ficha?.nome ?? 'Ficha apagada',
          quantidade: i.quantidade,
          precoUnitario: i.preco_unitario,
        })),
    )
  }, [itens.data])

  const jaNaLista = useMemo(() => new Set(linhas.map((l) => l.fichaId)), [linhas])

  const candidatas = useMemo(() => {
    const alvo = chaveBusca(busca)
    const termos = alvo === '' ? [] : alvo.split(' ')
    return fichas
      .filter((f) => !jaNaLista.has(f.id))
      .filter((f) => {
        if (termos.length === 0) return true
        const nome = chaveBusca(f.nome)
        const grupo = chaveBusca(f.grupo ?? '')
        return termos.every((t) => nome.includes(t) || grupo.includes(t))
      })
      .slice(0, 12)
  }, [fichas, jaNaLista, busca])

  const totalDoLancamento = linhas.reduce((soma, l) => soma + l.quantidade * l.precoUnitario, 0)

  async function gravar() {
    try {
      const salva = await salvarVenda.mutateAsync({
        id: venda?.id,
        referencia,
        // Campo de data vazio é `''`, e o Postgres recusa string vazia em
        // `date`. Nulo é o que a coluna aceita, e é o que "não informado"
        // significa — o período que vale é o que há entre duas contagens.
        inicio: inicio === '' ? null : inicio,
        titulo: titulo.trim() === '' ? null : titulo.trim(),
      })
      const paraGravar: ItemDeVendaParaGravar[] = linhas
        .filter((l) => l.quantidade > 0)
        .map((l) => ({
          ficha_id: l.fichaId,
          quantidade: l.quantidade,
          preco_unitario: l.precoUnitario,
        }))
      await salvarItens.mutateAsync({ vendaId: salva.id, itens: paraGravar })
      aoFechar()
    } catch (erro) {
      aoFalhar(erro instanceof Error ? erro.message : String(erro))
      aoFechar()
    }
  }

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={venda ? 'Lançamento de vendas' : 'Novo lançamento de vendas'}
      descricao={
        trancado
          ? 'Este lançamento está fechado: as linhas são foto e não se mexem. Reabra-o na lista para corrigir.'
          : 'Uma linha por ficha vendida. O preço vem da ficha e fica congelado neste lançamento.'
      }
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao tom="fantasma" onClick={aoFechar}>
            {trancado ? 'Fechar' : 'Cancelar'}
          </Botao>
          {!trancado && (
            <Botao
              tom="primario"
              carregando={salvarVenda.isPending || salvarItens.isPending}
              onClick={() => void gravar()}
            >
              Salvar o lançamento
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Rotulo para="venda-inicio">Início do período</Rotulo>
            <Campo
              id="venda-inicio"
              type="date"
              value={inicio}
              disabled={trancado}
              onChange={(e) => setInicio(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Rotulo para="venda-referencia">Fim do período</Rotulo>
            <Campo
              id="venda-referencia"
              type="date"
              value={referencia}
              disabled={trancado}
              onChange={(e) => setReferencia(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Rotulo para="venda-titulo">Nome (opcional)</Rotulo>
            <Campo
              id="venda-titulo"
              value={titulo}
              disabled={trancado}
              placeholder="Semana 32"
              onChange={(e) => setTitulo(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        {/* A data do fim é a que o relatório compara com a referência da
            contagem. Dizer isso aqui evita o lançamento carimbado no dia em
            que alguém digitou, que é o defeito que a contagem já teve. */}
        <p className="text-apoio leading-relaxed text-texto-fraco">
          O <strong className="text-texto-suave">fim do período</strong> é a data que o relatório
          compara com a contagem: as vendas que entram num relatório são as que terminam depois da
          foto anterior e até a foto escolhida. O início é informativo.
        </p>

        {itens.isLoading ? (
          <Carregando linhas={3} />
        ) : (
          <>
            {!trancado && (
              <div>
                <Rotulo para="busca-ficha">Adicionar ficha vendida</Rotulo>
                <div className="relative mt-1.5">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
                    aria-hidden
                  />
                  <Campo
                    id="busca-ficha"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar no cardápio — nome ou grupo"
                    className="pl-9"
                  />
                </div>
                {/* Só as fichas que se vendem aparecem aqui. Produção é insumo
                    interno e o banco a recusa; esconder é o conforto, não a
                    regra. */}
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                  {candidatas.length === 0 ? (
                    <li className="px-1 py-2 text-apoio text-texto-fraco">
                      {busca === ''
                        ? 'Todas as fichas do cardápio já estão na lista.'
                        : 'Nenhuma ficha de venda com esse nome.'}
                    </li>
                  ) : (
                    candidatas.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setLinhas((atuais) => [
                              ...atuais,
                              {
                                fichaId: f.id,
                                nome: f.nome,
                                quantidade: 0,
                                precoUnitario: f.preco_venda,
                              },
                            ])
                            setBusca('')
                          }}
                          className="flex min-h-toque w-full items-center justify-between gap-3 rounded-marca-p border border-borda bg-superficie-2 px-3 text-left transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-corpo text-texto">{f.nome}</span>
                            {f.grupo && (
                              <span className="block truncate text-micro text-texto-fraco">
                                {f.grupo}
                              </span>
                            )}
                          </span>
                          <span className="mv-numero shrink-0 text-apoio text-texto-suave">
                            {dinheiro(f.preco_venda)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {linhas.length === 0 ? (
              <EstadoVazio icone={<Receipt />} titulo="Nenhuma ficha neste lançamento">
                Busque acima e vá acrescentando o que foi vendido no período.
              </EstadoVazio>
            ) : (
              <div className="rounded-marca border border-borda">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Ficha</Th>
                      <Th numerico className="w-28">
                        Vendidas
                      </Th>
                      <Th numerico className="w-32">
                        Preço unit.
                      </Th>
                      <Th numerico className="w-28">
                        Total
                      </Th>
                      {!trancado && <Th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.fichaId}>
                        <Td>
                          <span className="block truncate text-texto">{l.nome}</span>
                        </Td>
                        <Td numerico>
                          {trancado ? (
                            formatarQuantidade(l.quantidade)
                          ) : (
                            <CampoNumero
                              valor={l.quantidade}
                              aria-label={`Quantidade vendida de ${l.nome}`}
                              aoMudar={(valor) =>
                                setLinhas((atuais) =>
                                  atuais.map((a, j) =>
                                    j === i ? { ...a, quantidade: valor } : a,
                                  ),
                                )
                              }
                              className="w-24"
                            />
                          )}
                        </Td>
                        <Td numerico>
                          {trancado ? (
                            dinheiro(l.precoUnitario)
                          ) : (
                            <CampoNumero
                              valor={l.precoUnitario}
                              aria-label={`Preço unitário de ${l.nome}`}
                              aoMudar={(valor) =>
                                setLinhas((atuais) =>
                                  atuais.map((a, j) =>
                                    j === i ? { ...a, precoUnitario: valor } : a,
                                  ),
                                )
                              }
                              className="w-28"
                            />
                          )}
                        </Td>
                        <Td numerico className="font-semibold">
                          {dinheiro(l.quantidade * l.precoUnitario)}
                        </Td>
                        {!trancado && (
                          <Td>
                            <Botao
                              tom="fantasma"
                              tamanho="p"
                              aria-label={`Tirar ${l.nome} do lançamento`}
                              onClick={() =>
                                setLinhas((atuais) => atuais.filter((_, j) => j !== i))
                              }
                            >
                              <X className="size-4" aria-hidden />
                            </Botao>
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
                <div className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3">
                  <span className="mv-rotulo">
                    {linhas.length} {plural(linhas.length, 'ficha', 'fichas')}
                  </span>
                  <span className="mv-numero text-destaque font-semibold text-primaria-legivel">
                    {dinheiro(totalDoLancamento)}
                  </span>
                </div>
              </div>
            )}

            {/*
              Linha com quantidade zero não é erro de quem digitou, é linha que
              a pessoa acrescentou e ainda não respondeu — ou que respondeu com
              "não vendeu nada". Ela não vai para o banco (o `check` do banco
              exige quantidade > 0), e dizer isso aqui é melhor que descartá-la
              em silêncio no salvamento.
            */}
            {!trancado && linhas.some((l) => l.quantidade === 0) && (
              <Aviso tom="info">
                {linhas.filter((l) => l.quantidade === 0).length}{' '}
                {plural(
                  linhas.filter((l) => l.quantidade === 0).length,
                  'linha está com quantidade zero e não será gravada',
                  'linhas estão com quantidade zero e não serão gravadas',
                )}
                .
              </Aviso>
            )}

            {trancado && (
              <div className="flex items-start gap-2 text-apoio leading-relaxed text-sucesso-texto">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Fechado em{' '}
                  <span className="mv-numero">{dataHora(venda?.fechada_em ?? null)}</span>. O
                  relatório de contagem já considera estas vendas.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </PainelLateral>
  )
}
