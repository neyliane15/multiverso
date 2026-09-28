/**
 * Módulo 2.2 · histórico de contagens.
 *
 * A lista existe por causa de uma coluna: a **variação** contra a contagem
 * anterior do mesmo tipo. Total isolado não diz nada — R$ 82 mil de estoque só
 * vira informação ao lado dos R$ 71 mil do mês passado.
 *
 * A cor da variação é semântica e mede **magnitude, não direção** (ver
 * `variacao.ts`): estoque que sobe não é bom nem ruim por si, mas salto grande
 * quase sempre é item esquecido, unidade trocada ou preço que mudou. Direção
 * fica com o sinal e a seta, que funcionam sem cor nenhuma.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, History, Minus, Store, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import { useApagarContagem, useContagens } from '@/dados/consultas'
import type { ContagemResumo, StatusContagem, TipoContagem } from '@/tipos/banco'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Dialogo,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Linha,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
} from '@/componentes/base'
import { data as formatarData, dinheiro, porcentagem } from '@/util/formato'
import { tomDaVariacao, variacoesPorContagem, type Variacao } from './variacao'

const TOM_DO_STATUS: Record<StatusContagem, 'sucesso' | 'marca' | 'erro'> = {
  fechada: 'sucesso',
  aberta: 'marca',
  cancelada: 'erro',
}

const ROTULO_DO_STATUS: Record<StatusContagem, string> = {
  fechada: 'Fechada',
  aberta: 'Aberta',
  cancelada: 'Cancelada',
}

export function HistoricoDeContagens() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Histórico de contagens" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver as contagens.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <HistoricoDoRestaurante restauranteId={restaurante.id} />
}

function HistoricoDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const { perfil, ehMaster } = useSessao()
  const contagens = useContagens(restauranteId)
  const apagar = useApagarContagem(restauranteId)
  const [tipo, setTipo] = useState<TipoContagem | 'todos'>('todos')
  const [apagando, setApagando] = useState<ContagemResumo | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  /**
   * Apagar contagem é de master e admin — não de quem administra.
   *
   * `podeAdministrar` inclui gerente, e cobre o cadastro do restaurante.
   * Apagar destrói histórico e muda o CMV de um período inteiro: é da mesma
   * família de equipe e identidade. A política do banco diz o mesmo; aqui o
   * botão só não aparece para quem levaria uma recusa.
   */
  const podeApagar = ehMaster || perfil?.papel === 'admin'

  // A variação é calculada com a lista **inteira**: filtrar por tipo na tela
  // não pode mudar contra quem cada contagem foi comparada.
  const variacoes = useMemo(
    () => variacoesPorContagem(contagens.data ?? []),
    [contagens.data],
  )

  const lista = useMemo(
    () => (contagens.data ?? []).filter((c) => tipo === 'todos' || c.tipo === tipo),
    [contagens.data, tipo],
  )

  const cabecalho = (
    <CabecalhoDePagina
      titulo="Histórico de contagens"
      descricao="Toda foto do estoque, com a variação contra a contagem anterior do mesmo tipo."
      acoes={
        <Selecao
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoContagem | 'todos')}
          aria-label="Filtrar por tipo de contagem"
          className="w-44"
        >
          <option value="todos">Todos os tipos</option>
          <option value="semanal">Semanal</option>
          <option value="mensal">Mensal</option>
          <option value="avulsa">Avulsa</option>
        </Selecao>
      }
    />
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

  if (lista.length === 0) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <EstadoVazio
            icone={<History />}
            titulo={tipo === 'todos' ? 'Nenhuma contagem ainda' : 'Nenhuma contagem deste tipo'}
            acao={
              <Botao tom="primario" onClick={() => navegar('/contagem')}>
                Abrir a primeira contagem
              </Botao>
            }
          >
            A primeira contagem é a linha de partida do CMV: sem ela não há estoque inicial
            para comparar.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  const dialogo = apagando && (
    <Dialogo
      titulo="Apagar esta contagem?"
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
            Apagar a contagem
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-corpo leading-relaxed text-texto-suave">
        <p>
          A contagem de{' '}
          <strong className="mv-numero text-texto">{formatarData(apagando.referencia)}</strong> some
          do sistema, com <strong className="text-texto">{apagando.itens_total} linhas</strong> e{' '}
          <strong className="mv-numero text-texto">{dinheiro(apagando.total)}</strong> contados.
        </p>
        {/*
          O aviso do CMV não é formalidade: a contagem é estoque inicial de um
          período e final de outro. Apagar uma do meio muda duas contas de uma
          vez, e quem olhar o gráfico depois não vai ter como saber por quê.
        */}
        <p>
          O CMV dos períodos que usavam esta foto passa a ser calculado sem ela. Se a ideia é só
          tirar do caminho uma contagem errada, considere cancelá-la: ela fica no histórico,
          marcada, e não entra em cálculo nenhum.
        </p>
        <p className="text-alerta-texto">Não tem desfazer.</p>
      </div>
    </Dialogo>
  )

  return (
    <>
      {cabecalho}

      {falha && (
        <Aviso tom="erro" titulo="Não deu para apagar">
          {falha}
        </Aviso>
      )}
      {dialogo}

      {/* Celular: cartões. Uma tabela de oito colunas ou corta informação ou
          vira rolagem horizontal cega — e aqui nenhuma coluna é dispensável. */}
      <ul className="space-y-3 lg:hidden">
        {lista.map((contagem) => (
          <li key={contagem.id} className="relative">
            <CartaoDeContagem
              contagem={contagem}
              variacao={variacoes.get(contagem.id)}
              aoAbrir={() => navegar(`/contagem/${contagem.id}`)}
            />
            {/* Fora do cartão, e não dentro: botão dentro de botão é HTML
                inválido, e no celular o toque acabaria abrindo a contagem que
                a pessoa quer apagar. */}
            {podeApagar && (
              <Botao
                tom="fantasma"
                tamanho="p"
                className="absolute bottom-2 right-2"
                aria-label={`Apagar a contagem de ${formatarData(contagem.referencia)}`}
                onClick={() => {
                  setFalha(null)
                  setApagando(contagem)
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Botao>
            )}
          </li>
        ))}
      </ul>

      <Cartao className="hidden lg:block">
        <Tabela>
          <thead>
            <tr>
              <Th>Referência</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th numerico>Itens</Th>
              <Th numerico>Total</Th>
              <Th numerico>Variação</Th>
              <Th>Fechada por</Th>
              {podeApagar && <Th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lista.map((contagem) => (
              <Linha key={contagem.id} aoClicar={() => navegar(`/contagem/${contagem.id}`)}>
                <Td>
                  <span className="block font-medium text-texto">
                    <span className="mv-numero">{formatarData(contagem.referencia)}</span>
                    {contagem.titulo && (
                      <span className="block text-micro font-normal text-texto-fraco">
                        {contagem.titulo}
                      </span>
                    )}
                  </span>
                </Td>
                <Td className="capitalize">{contagem.tipo}</Td>
                <Td>
                  <Selo tom={TOM_DO_STATUS[contagem.status]}>
                    {ROTULO_DO_STATUS[contagem.status]}
                  </Selo>
                </Td>
                <Td numerico>
                  {contagem.itens_preenchidos}
                  <span className="text-texto-fraco">/{contagem.itens_total}</span>
                </Td>
                <Td numerico className="font-semibold">
                  {dinheiro(contagem.total)}
                </Td>
                <Td numerico>
                  <Variacao variacao={variacoes.get(contagem.id)} />
                </Td>
                <Td className="text-texto-suave">
                  {contagem.fechado_por_nome ?? (
                    <span className="text-texto-fraco">
                      {contagem.criado_por_nome ?? '—'}
                      <span className="block text-micro">em andamento</span>
                    </span>
                  )}
                </Td>
                {podeApagar && (
                  <Td>
                    <Botao
                      tom="fantasma"
                      tamanho="p"
                      aria-label={`Apagar a contagem de ${formatarData(contagem.referencia)}`}
                      onClick={(e) => {
                        // A linha inteira abre a contagem; este botão não pode
                        // levar junto para a folha que está prestes a sumir.
                        e.stopPropagation()
                        setFalha(null)
                        setApagando(contagem)
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Botao>
                  </Td>
                )}
              </Linha>
            ))}
          </tbody>
        </Tabela>
      </Cartao>
    </>
  )
}

/* ──────────────────────────────────────────────────────────── variação ──── */

function Variacao({ variacao }: { variacao: Variacao | undefined }) {
  if (!variacao || variacao.valor === null) {
    return (
      <span className="inline-flex items-center gap-1 text-texto-fraco">
        <Minus className="size-3.5" aria-hidden />
        <span className="text-apoio">primeira</span>
      </span>
    )
  }

  const subiu = variacao.valor > 0
  const alerta = tomDaVariacao(variacao) === 'alerta'
  const Seta = subiu ? ArrowUpRight : ArrowDownRight
  const sinal = subiu ? '+' : '−'
  const absoluto = Math.abs(variacao.valor)

  return (
    <span
      className={clsx(
        'inline-flex flex-col items-end leading-tight',
        alerta ? 'text-alerta-texto' : 'text-texto-suave',
      )}
      title={
        variacao.anteriorReferencia
          ? `Contra a contagem de ${formatarData(variacao.anteriorReferencia)} (${dinheiro(variacao.anteriorTotal)})`
          : undefined
      }
    >
      <span className="mv-numero inline-flex items-center gap-1 font-medium">
        <Seta className="size-3.5" aria-hidden />
        {sinal}
        {dinheiro(absoluto)}
      </span>
      <span className="mv-numero text-micro">
        {variacao.percentual === null
          ? 'sem base para %'
          : `${sinal}${porcentagem(Math.abs(variacao.percentual))}`}
      </span>
    </span>
  )
}

/* ────────────────────────────────────────────────────── cartão (celular) ── */

function CartaoDeContagem({
  contagem,
  variacao,
  aoAbrir,
}: {
  contagem: ContagemResumo
  variacao: Variacao | undefined
  aoAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="w-full rounded-marca border border-borda bg-superficie-1 p-4 text-left transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mv-numero text-destaque font-semibold text-texto">
            {formatarData(contagem.referencia)}
          </div>
          <div className="truncate text-apoio text-texto-fraco">
            {contagem.titulo ?? contagem.tipo}
          </div>
        </div>
        <Selo tom={TOM_DO_STATUS[contagem.status]}>{ROTULO_DO_STATUS[contagem.status]}</Selo>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="mv-rotulo">Total</dt>
          <dd className="mv-numero text-corpo font-semibold text-texto">
            {dinheiro(contagem.total)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="mv-rotulo">Variação</dt>
          <dd>
            <Variacao variacao={variacao} />
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between text-micro text-texto-fraco">
        <span className="mv-numero">
          {contagem.itens_preenchidos}/{contagem.itens_total} itens
        </span>
        <span>{contagem.fechado_por_nome ?? contagem.criado_por_nome ?? '—'}</span>
      </div>
    </button>
  )
}
