/**
 * Módulo 3.1 · conferência de itens da nota.
 *
 * A parte séria do módulo. Um item casado com o produto errado entra no custo
 * médio errado e envenena o CMV do mês inteiro sem ninguém perceber; um item
 * pendente é um incômodo de dois cliques. Por isso a tela é desenhada para
 * empurrar o pendente para cima e nunca esconder a dúvida:
 *
 * - item sem produto fica em destaque, com a sugestão e a confiança à vista;
 * - `mv_lancar_nota` recusa nota com item pendente — a tela diz isso antes de
 *   deixar a pessoa tentar, e não depois do erro do banco;
 * - ao vincular à mão, o fator de conversão é **recalculado** com a unidade do
 *   produto escolhido. Sem isso o trigger `mv_aprende_apelido` memorizaria um
 *   fator torto e o repetiria em toda nota futura daquele fornecedor.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Link2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import {
  useCompras,
  useItensDaNota,
  useLancarNota,
  useProdutos,
  useVincularItemDaNota,
  type ItemDeNota,
} from '@/dados/consultas'
import { casarItem, type Casamento } from '@/dados/nfe/casarProdutos'
import { recalcularFatorAoVincular } from '@/dados/nfe/conversaoUnidade'
import type { ProdutoCompleto } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Selecao,
  Selo,
} from '@/componentes/base'
import { data as formatarData, dinheiro, porcentagem, quantidade } from '@/util/formato'
import { resumirConferencia } from './logica'

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function Conferencia({
  restauranteId,
  notaId,
}: {
  restauranteId: string
  notaId: string
}) {
  const navegar = useNavigate()
  const compras = useCompras(restauranteId)
  const itens = useItensDaNota(notaId)
  const produtos = useProdutos(restauranteId)
  const vincular = useVincularItemDaNota(notaId)
  const lancar = useLancarNota(restauranteId)

  const [falha, setFalha] = useState<string | null>(null)
  const [avisosDeConversao, setAvisosDeConversao] = useState<ReadonlyMap<string, string>>(new Map())
  const [confirmandoLancamento, setConfirmandoLancamento] = useState(false)

  const nota = compras.data?.find((c) => c.id === notaId)
  const lista = useMemo(() => itens.data ?? [], [itens.data])
  const catalogo = useMemo(
    () => (produtos.data ?? []).filter((p) => p.ativo),
    [produtos.data],
  )
  const resumo = resumirConferencia(lista)
  const lancada = nota?.status === 'lancada'

  // A sugestão automática só é calculada para o que está pendente: item já
  // vinculado tem resposta, e recalcular só gastaria trabalho.
  const sugestoes = useMemo(() => {
    if (catalogo.length === 0) return new Map<string, Casamento>()
    const mapa = new Map<string, Casamento>()
    for (const item of lista) {
      if (item.produto_id) continue
      mapa.set(
        item.id,
        casarItem(
          {
            descricao: item.descricao,
            ean: item.ean,
            codigoFornecedor: item.codigo_fornecedor,
          },
          { produtos: catalogo },
        ),
      )
    }
    return mapa
  }, [lista, catalogo])

  async function vincularItem(item: ItemDeNota, produtoId: string) {
    setFalha(null)
    const produto = catalogo.find((p) => p.id === produtoId)

    // O fator gravado na importação foi calculado sem saber a unidade do
    // cadastro. Agora ela é conhecida, então a conta é refeita.
    const conversao = recalcularFatorAoVincular(
      { descricao: item.descricao, unidade: item.unidade },
      { unidade: produto?.unidade ?? null },
    )

    try {
      await vincular.mutateAsync({ itemId: item.id, produtoId, fator: conversao.fator })
      setAvisosDeConversao((atual) => {
        const novo = new Map(atual)
        if (conversao.aviso) novo.set(item.id, conversao.aviso)
        else novo.delete(item.id)
        return novo
      })
    } catch (erro) {
      setFalha(`${item.descricao}: ${mensagemDoErro(erro)}`)
    }
  }

  async function desvincularItem(item: ItemDeNota) {
    setFalha(null)
    try {
      await vincular.mutateAsync({ itemId: item.id, produtoId: null })
    } catch (erro) {
      setFalha(`${item.descricao}: ${mensagemDoErro(erro)}`)
    }
  }

  async function confirmarLancamento() {
    setFalha(null)
    try {
      await lancar.mutateAsync(notaId)
      setConfirmandoLancamento(false)
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    }
  }

  const cabecalho = (
    <CabecalhoDePagina
      titulo={nota ? `Nota ${nota.numero ?? 'sem número'} · ${nota.fornecedor_nome}` : 'Conferência'}
      descricao={
        nota
          ? `Emitida em ${formatarData(nota.emitida_em)} · ${dinheiro(nota.valor_total)} · origem ${nota.origem}`
          : undefined
      }
      acoes={
        <Botao
          tom="fantasma"
          icone={<ArrowLeft className="size-4" aria-hidden />}
          onClick={() => navegar('/compras/historico')}
        >
          Voltar ao histórico
        </Botao>
      }
    />
  )

  if (itens.isLoading || compras.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (itens.isError || compras.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta
            erro={itens.error ?? compras.error}
            aoTentar={() => {
              void itens.refetch()
              void compras.refetch()
            }}
          />
        </Cartao>
      </>
    )
  }
  if (!nota) {
    // O histórico pode estar chegando agora (nota recém-criada, cache frio):
    // dizer "não encontrada" antes da hora seria mentir por meio segundo.
    if (compras.isFetching) {
      return (
        <>
          {cabecalho}
          <Cartao>
            <Carregando linhas={4} />
          </Cartao>
        </>
      )
    }
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio titulo="Nota não encontrada">
            Esta nota não existe mais, ou pertence a outro restaurante.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  return (
    <>
      {cabecalho}

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Itens da nota" valor={quantidade(resumo.itens)} />
        <Indicador
          rotulo="Vinculados"
          valor={quantidade(resumo.vinculados)}
          tom={resumo.pendentes === 0 ? 'sucesso' : 'neutro'}
        />
        <Indicador
          rotulo="Pendentes"
          valor={quantidade(resumo.pendentes)}
          tom={resumo.pendentes > 0 ? 'alerta' : 'neutro'}
          apoio={
            resumo.pendentes > 0
              ? 'Enquanto houver pendente, a nota não entra no CMV.'
              : 'Tudo pronto para lançar.'
          }
        />
      </div>

      {falha && (
        <Aviso tom="erro" titulo="Não deu para salvar">
          {falha}
        </Aviso>
      )}

      {lancada ? (
        <Aviso tom="sucesso" titulo="Nota lançada">
          Os custos médios dos produtos já foram atualizados por esta nota e o valor entrou
          nas compras do período.
        </Aviso>
      ) : resumo.pendentes > 0 ? (
        <Aviso tom="alerta" titulo={`${resumo.pendentes} item(ns) sem produto vinculado`}>
          O banco recusa lançar uma nota com item pendente, e faz bem: o valor desse item não
          teria em qual produto entrar. Vincule os destacados abaixo — ou, se o item não for
          estoque (taxa, frete, brinde), ele precisa ser vinculado a um produto mesmo assim ou
          removido da nota.
        </Aviso>
      ) : (
        <Aviso tom="info" titulo="Tudo vinculado">
          Ao lançar, cada item empurra o custo médio do produto correspondente — é esse número
          que a próxima contagem vai usar para valorizar o estoque.
        </Aviso>
      )}

      {produtos.isError && <ErroDaConsulta erro={produtos.error} />}

      <Cartao
        titulo="Itens"
        descricao="O que veio na nota, e em qual produto do cadastro cada linha entra."
        acao={
          !lancada && (
            <Botao
              tom="primario"
              disabled={!resumo.podeLancar}
              onClick={() => setConfirmandoLancamento(true)}
            >
              Lançar nota
            </Botao>
          )
        }
      >
        {lista.length === 0 ? (
          <EstadoVazio titulo="Nota sem itens">
            Nenhuma linha foi importada. Uma nota sem item não vira custo de nada.
          </EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda/60">
            {lista.map((item) => (
              <LinhaDeItem
                key={item.id}
                item={item}
                catalogo={catalogo}
                sugestao={sugestoes.get(item.id)}
                avisoDeConversao={avisosDeConversao.get(item.id)}
                bloqueado={lancada || vincular.isPending}
                aoVincular={(produtoId) => void vincularItem(item, produtoId)}
                aoDesvincular={() => void desvincularItem(item)}
              />
            ))}
          </ul>
        )}
      </Cartao>

      {confirmandoLancamento && (
        <Cartao titulo="Lançar esta nota?" className="border-primaria/40">
          <div className="space-y-4 p-5">
            <Aviso tom="alerta" titulo="Isto muda o custo dos produtos">
              Lançar grava o custo unitário desta nota como <strong>custo médio</strong> de cada
              produto vinculado, e soma {dinheiro(nota.valor_total)} às compras de{' '}
              {formatarData(nota.emitida_em)}. O CMV do período muda na mesma hora.
            </Aviso>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao tom="secundario" onClick={() => setConfirmandoLancamento(false)}>
                Ainda não
              </Botao>
              <Botao
                tom="primario"
                carregando={lancar.isPending}
                onClick={() => void confirmarLancamento()}
              >
                Lançar e atualizar custos
              </Botao>
            </div>
          </div>
        </Cartao>
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────── item da nota ── */

function LinhaDeItem({
  item,
  catalogo,
  sugestao,
  avisoDeConversao,
  bloqueado,
  aoVincular,
  aoDesvincular,
}: {
  item: ItemDeNota
  catalogo: ProdutoCompleto[]
  sugestao: Casamento | undefined
  avisoDeConversao: string | undefined
  bloqueado: boolean
  aoVincular: (produtoId: string) => void
  aoDesvincular: () => void
}) {
  const pendente = item.produto_id === null
  const melhor = sugestao?.sugestoes[0]

  return (
    <li
      className={clsx(
        'grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
        pendente && 'border-l-2 border-l-alerta bg-alerta-suave/40',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-corpo text-texto">{item.descricao}</span>
          {pendente && (
            <Selo tom="alerta">
              <AlertTriangle className="size-3.5" aria-hidden /> Sem produto
            </Selo>
          )}
        </div>
        <div className="mv-numero mt-0.5 text-micro text-texto-fraco">
          {quantidade(item.quantidade)} {item.unidade} × {dinheiro(item.valor_unitario)} ={' '}
          {dinheiro(item.valor_total)}
          {item.fator_conversao !== 1 && (
            <> · fator {quantidade(item.fator_conversao)} · {quantidade(item.quantidade_convertida)} na unidade do cadastro</>
          )}
        </div>
        {item.ean && (
          <div className="mv-numero text-micro text-texto-fraco">EAN {item.ean}</div>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={`vinculo-${item.id}`} className="sr-only">
          Produto vinculado ao item {item.descricao}
        </label>
        <Selecao
          id={`vinculo-${item.id}`}
          value={item.produto_id ?? ''}
          disabled={bloqueado}
          onChange={(e) => {
            if (e.target.value === '') aoDesvincular()
            else aoVincular(e.target.value)
          }}
        >
          <option value="">— sem produto —</option>
          {catalogo.map((produto) => (
            <option key={produto.id} value={produto.id}>
              {produto.nome} ({produto.unidade})
            </option>
          ))}
        </Selecao>

        {!pendente && item.produto && (
          <p className="flex items-center gap-1.5 text-micro text-sucesso-texto">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Entra em {item.produto.nome}
          </p>
        )}

        {pendente && melhor && (
          <div className="flex flex-wrap items-center gap-2">
            <Botao
              tom="secundario"
              tamanho="p"
              icone={<Sparkles className="size-3.5" aria-hidden />}
              disabled={bloqueado}
              onClick={() => aoVincular(melhor.produtoId)}
            >
              {melhor.nome}
            </Botao>
            <span className="mv-numero text-micro text-texto-fraco">
              {porcentagem(melhor.confianca * 100, 0)} de confiança
            </span>
          </div>
        )}

        {pendente && sugestao && !melhor && (
          <p className="flex items-start gap-1.5 text-micro text-texto-fraco">
            <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {sugestao.explicacao}
          </p>
        )}

        {avisoDeConversao && (
          <p className="text-micro leading-snug text-alerta-texto">{avisoDeConversao}</p>
        )}
      </div>
    </li>
  )
}
