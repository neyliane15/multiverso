/**
 * Módulo 3.3 · histórico de compras.
 *
 * Duas perguntas, nesta ordem: "quanto entrou no período?" e "o que ainda não
 * entrou no CMV?". A segunda é a razão do destaque das notas com item pendente
 * — elas já existem, já foram pagas, e mesmo assim `mv_cmv_periodo` não as
 * enxerga, porque só soma nota com status `lancada`. Uma nota esquecida na
 * conferência é um buraco silencioso no custo do mês.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Receipt, Search, Store } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/dados/sessao'
import { useCompras, useFornecedores } from '@/dados/consultas'
import type { CompraHistorico, StatusNota } from '@/tipos/banco'
import {
  Botao,
  CabecalhoDePagina,
  Campo,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Linha,
  Rotulo,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade } from '@/util/formato'
import { hojeIso } from '@/paginas/contagem/logica'
import { filtrarCompras, totalizarCompras } from './logica'

const TOM_DO_STATUS: Record<StatusNota, 'sucesso' | 'info' | 'alerta' | 'erro'> = {
  lancada: 'sucesso',
  conferida: 'info',
  importada: 'alerta',
  cancelada: 'erro',
}

const ROTULO_DO_STATUS: Record<StatusNota, string> = {
  lancada: 'Lançada',
  conferida: 'Conferida',
  importada: 'Importada',
  cancelada: 'Cancelada',
}

/** Primeiro dia do mês corrente — o período que quase sempre se quer ver. */
function inicioDoMes(hoje = hojeIso()): string {
  return `${hoje.slice(0, 7)}-01`
}

export function HistoricoDeCompras() {
  const { restaurante } = useSessao()
  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Histórico de compras" />
        <Cartao>
          <EstadoVazio icone={<Store />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para ver as compras.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }
  return <ComprasDoRestaurante restauranteId={restaurante.id} />
}

function ComprasDoRestaurante({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const compras = useCompras(restauranteId)
  const fornecedores = useFornecedores(restauranteId)

  const [inicio, setInicio] = useState(() => inicioDoMes())
  const [fim, setFim] = useState(() => hojeIso())
  const [fornecedorId, setFornecedorId] = useState('')
  const [busca, setBusca] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)

  const lista = useMemo(
    () =>
      filtrarCompras(compras.data ?? [], {
        inicio,
        fim,
        fornecedorId: fornecedorId === '' ? undefined : fornecedorId,
        busca,
        soPendentes,
      }),
    [compras.data, inicio, fim, fornecedorId, busca, soPendentes],
  )
  const totais = useMemo(() => totalizarCompras(lista), [lista])

  const cabecalho = (
    <CabecalhoDePagina
      titulo="Histórico de compras"
      descricao="Tudo que entrou, por período e por fornecedor."
      acoes={
        <Botao tom="primario" onClick={() => navegar('/compras/notas')}>
          Nova nota
        </Botao>
      }
    />
  )

  if (compras.isLoading) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      </>
    )
  }
  if (compras.isError) {
    return (
      <>
        {cabecalho}
        <Cartao>
          <ErroDaConsulta erro={compras.error} aoTentar={() => void compras.refetch()} />
        </Cartao>
      </>
    )
  }

  return (
    <>
      {cabecalho}

      <Cartao titulo="Período" descricao="As datas são de emissão da nota — é assim que o CMV enxerga a compra.">
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Rotulo para="inicio">De</Rotulo>
            <Campo
              id="inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Rotulo para="fim">Até</Rotulo>
            <Campo id="fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Rotulo para="fornecedor">Fornecedor</Rotulo>
            <Selecao
              id="fornecedor"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
            >
              <option value="">Todos</option>
              {(fornecedores.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="space-y-1.5">
            <Rotulo para="busca">Buscar</Rotulo>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
                aria-hidden
              />
              <Campo
                id="busca"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do fornecedor"
                className="pl-9"
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Botao
              tom={soPendentes ? 'primario' : 'secundario'}
              aria-pressed={soPendentes}
              icone={<AlertTriangle className="size-4" aria-hidden />}
              onClick={() => setSoPendentes((v) => !v)}
            >
              Só notas com item pendente
            </Botao>
          </div>
        </div>
      </Cartao>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Compras no período"
          valor={dinheiro(totais.total)}
          tom="marca"
          apoio="Só notas lançadas — é este valor que entra no CMV."
        />
        <Indicador
          rotulo="Ainda não lançado"
          valor={dinheiro(totais.totalNaoLancado)}
          tom={totais.totalNaoLancado > 0 ? 'alerta' : 'neutro'}
          apoio="Notas importadas ou conferidas que o CMV ainda não enxerga."
        />
        <Indicador rotulo="Notas" valor={quantidade(totais.notas)} />
        <Indicador
          rotulo="Itens sem produto"
          valor={quantidade(totais.itensPendentes)}
          tom={totais.itensPendentes > 0 ? 'alerta' : 'sucesso'}
          apoio={
            totais.notasPendentes > 0
              ? `Em ${totais.notasPendentes} ${plural(totais.notasPendentes, 'nota', 'notas')}. Enquanto houver um, a nota não é lançável.`
              : 'Nenhuma nota travada na conferência.'
          }
        />
      </div>

      {lista.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={<Receipt />} titulo="Nenhuma nota no período">
            Ajuste as datas ou o fornecedor — ou lance a primeira nota deste período.
          </EstadoVazio>
        </Cartao>
      ) : (
        <>
          {/* Celular: cartões, porque a tabela tem sete colunas e nenhuma sobra. */}
          <ul className="space-y-3 lg:hidden">
            {lista.map((compra) => (
              <li key={compra.id}>
                <CartaoDeCompra
                  compra={compra}
                  aoAbrir={() => navegar(`/compras/notas/${compra.id}`)}
                />
              </li>
            ))}
          </ul>

          <Cartao className="hidden lg:block">
            <Tabela>
              <thead>
                <tr>
                  <Th>Emissão</Th>
                  <Th>Fornecedor</Th>
                  <Th>Nota</Th>
                  <Th>Origem</Th>
                  <Th>Status</Th>
                  <Th numerico>Itens</Th>
                  <Th numerico>Total</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((compra) => (
                  <Linha
                    key={compra.id}
                    aoClicar={() => navegar(`/compras/notas/${compra.id}`)}
                    className={clsx(compra.itens_pendentes > 0 && 'bg-alerta-suave/40')}
                  >
                    <Td className="mv-numero">{formatarData(compra.emitida_em)}</Td>
                    <Td className="font-medium text-texto">{compra.fornecedor_nome}</Td>
                    <Td className="mv-numero text-texto-suave">{compra.numero ?? '—'}</Td>
                    <Td className="uppercase text-texto-fraco">{compra.origem}</Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Selo tom={TOM_DO_STATUS[compra.status]}>
                          {ROTULO_DO_STATUS[compra.status]}
                        </Selo>
                        {compra.itens_pendentes > 0 && (
                          <Selo tom="alerta">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {compra.itens_pendentes} sem produto
                          </Selo>
                        )}
                      </span>
                    </Td>
                    <Td numerico>{compra.itens}</Td>
                    <Td numerico className="font-semibold">
                      {dinheiro(compra.valor_total)}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          </Cartao>
        </>
      )}
    </>
  )
}

function CartaoDeCompra({
  compra,
  aoAbrir,
}: {
  compra: CompraHistorico
  aoAbrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={clsx(
        'w-full rounded-marca border bg-superficie-1 p-4 text-left transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16',
        compra.itens_pendentes > 0 ? 'border-alerta-borda bg-alerta-suave/40' : 'border-borda',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-corpo font-medium text-texto">{compra.fornecedor_nome}</div>
          <div className="mv-numero text-micro text-texto-fraco">
            {formatarData(compra.emitida_em)} · nº {compra.numero ?? '—'} · {compra.origem}
          </div>
        </div>
        <div className="mv-numero shrink-0 text-corpo font-semibold text-texto">
          {dinheiro(compra.valor_total)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Selo tom={TOM_DO_STATUS[compra.status]}>{ROTULO_DO_STATUS[compra.status]}</Selo>
        {compra.itens_pendentes > 0 && (
          <Selo tom="alerta">
            <AlertTriangle className="size-3.5" aria-hidden />
            {compra.itens_pendentes} de {compra.itens} sem produto
          </Selo>
        )}
      </div>
    </button>
  )
}
