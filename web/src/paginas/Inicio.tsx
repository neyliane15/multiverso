/**
 * O painel do restaurante: o que a pessoa precisa saber ao abrir, sem clicar.
 *
 * A regra do contrato vale inteira aqui: **nenhum número é estimado**. Quando
 * falta contagem, o CMV volta nulo com a pendência escrita — e a tela escreve
 * a pendência, nunca um zero que pareceria um resultado.
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Package,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from 'lucide-react'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Indicador,
  Selo,
} from '@/componentes/base'
import { useSessao } from '@/dados/sessao'
import { useCmv, useCompras, useContagens } from '@/dados/consultas'
import { data as formatarData, dinheiro, quantidade } from '@/util/formato'
import {
  avaliarUltimaContagem,
  dataIso,
  inicioDoMes,
  progressoDaContagem,
  resumirCompras,
} from './logicaDoPainel'

function Atalho({
  para,
  icone,
  titulo,
  descricao,
}: {
  para: string
  icone: JSX.Element
  titulo: string
  descricao: string
}): JSX.Element {
  return (
    <Link
      to={para}
      className="group flex min-h-toque items-center gap-3 rounded-marca border border-borda bg-superficie-1 p-4 transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-marca-p bg-primaria-16 text-primaria-legivel">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-titulo text-corpo font-semibold text-texto">{titulo}</span>
        <span className="block text-apoio leading-snug text-texto-fraco">{descricao}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-texto-fraco transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}

export function Inicio(): JSX.Element {
  const { restaurante } = useSessao()
  const navegar = useNavigate()
  const restauranteId = restaurante?.id ?? ''

  const hoje = dataIso()
  const inicio = inicioDoMes(hoje)

  const contagens = useContagens(restauranteId)
  const compras = useCompras(restauranteId)
  const cmv = useCmv(restauranteId, inicio, hoje)

  const lista = useMemo(() => contagens.data ?? [], [contagens.data])
  const fechada = useMemo(() => lista.find((c) => c.status === 'fechada') ?? null, [lista])
  const aberta = useMemo(() => lista.find((c) => c.status === 'aberta') ?? null, [lista])

  const idade = useMemo(
    () => avaliarUltimaContagem(fechada?.referencia ?? null, hoje),
    [fechada, hoje],
  )

  const mes = useMemo(
    () => resumirCompras(compras.data ?? [], inicio, hoje),
    [compras.data, inicio, hoje],
  )

  if (!restaurante) {
    return (
      <EstadoVazio titulo="Nenhum restaurante em foco">
        Escolha um restaurante na barra de cima — ou cadastre o primeiro em Administração.
      </EstadoVazio>
    )
  }

  const carregando = contagens.isPending || compras.isPending
  const erro = contagens.isError ? contagens.error : compras.isError ? compras.error : null

  const progresso = aberta ? progressoDaContagem(aberta.itens_preenchidos, aberta.itens_total) : 0

  return (
    <>
      <CabecalhoDePagina
        titulo={restaurante.nome}
        descricao={`O estado do restaurante hoje, ${formatarData(hoje)}.`}
        acoes={
          <Botao
            tom={aberta ? 'primario' : 'secundario'}
            icone={<ClipboardList className="size-4" aria-hidden />}
            onClick={() => navegar(aberta ? `/contagem/${aberta.id}` : '/contagem')}
          >
            {aberta ? 'Continuar a contagem' : 'Abrir contagem'}
          </Botao>
        }
      />

      {erro ? (
        <Cartao>
          <ErroDaConsulta
            erro={erro}
            aoTentar={() => {
              void contagens.refetch()
              void compras.refetch()
            }}
          />
        </Cartao>
      ) : carregando ? (
        <Cartao>
          <Carregando linhas={4} />
        </Cartao>
      ) : (
        <>
          {/* ─────────────────────────────────────────────── indicadores ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Estoque na última contagem"
              icone={<Warehouse className="size-3.5" aria-hidden />}
              valor={fechada ? dinheiro(fechada.total) : '—'}
              apoio={
                fechada ? (
                  <>
                    Fechada em {formatarData(fechada.referencia)} ·{' '}
                    <span className="mv-numero">{quantidade(fechada.itens_total)}</span> itens
                  </>
                ) : (
                  'Ainda não há contagem fechada.'
                )
              }
            />

            <Indicador
              rotulo="Contagem aberta"
              icone={<ClipboardList className="size-3.5" aria-hidden />}
              valor={aberta ? `${progresso}%` : 'nenhuma'}
              tom={aberta ? 'alerta' : 'neutro'}
              apoio={
                aberta ? (
                  <>
                    <span className="mv-numero">{quantidade(aberta.itens_preenchidos)}</span> de{' '}
                    <span className="mv-numero">{quantidade(aberta.itens_total)}</span> itens
                    lançados
                  </>
                ) : (
                  'Nada em aberto no momento.'
                )
              }
            />

            <Indicador
              rotulo="Compras do mês"
              icone={<ShoppingCart className="size-3.5" aria-hidden />}
              valor={dinheiro(mes.total)}
              apoio={
                <>
                  <span className="mv-numero">{quantidade(mes.notas)}</span>{' '}
                  {mes.notas === 1 ? 'nota' : 'notas'} desde {formatarData(inicio)}
                  {mes.notasPendentes > 0 && (
                    <>
                      {' · '}
                      <span className="text-alerta-texto">
                        <span className="mv-numero">{quantidade(mes.notasPendentes)}</span> com item
                        pendente
                      </span>
                    </>
                  )}
                </>
              }
            />

            <Indicador
              rotulo="CMV do mês"
              icone={<TrendingUp className="size-3.5" aria-hidden />}
              valor={
                cmv.isPending ? '…' : cmv.data?.cmv !== null && cmv.data ? dinheiro(cmv.data.cmv) : '—'
              }
              apoio={
                cmv.isError ? (
                  <span className="text-erro-texto">
                    {cmv.error instanceof Error ? cmv.error.message : 'Falhou ao consultar.'}
                  </span>
                ) : cmv.data?.cmv === null || !cmv.data ? (
                  // O banco devolve o motivo; repeti-lo aqui é a diferença
                  // entre "não sei" e um zero que parece resultado.
                  <span className="text-alerta-texto">
                    {cmv.data?.pendencia ?? 'Sem dados suficientes para calcular.'}
                  </span>
                ) : (
                  <>
                    {formatarData(inicio)} a {formatarData(hoje)}
                    {!cmv.data.completo && ' · período ainda parcial'}
                  </>
                )
              }
            />
          </div>

          {/* ──────────────────────────────────────────────── pendências ── */}
          {idade.estado !== 'em-dia' && (
            <Aviso
              tom={idade.estado === 'muito-atrasada' || idade.estado === 'nunca' ? 'alerta' : 'info'}
              titulo={idade.estado === 'nunca' ? 'Nenhuma contagem fechada' : 'Contagem atrasada'}
            >
              <p className="mt-1">{idade.mensagem}</p>
            </Aviso>
          )}

          {mes.notasPendentes > 0 && (
            <Aviso tom="alerta" titulo="Notas com item ainda sem insumo">
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <span>
                  <span className="mv-numero">{quantidade(mes.itensPendentes)}</span>{' '}
                  {mes.itensPendentes === 1 ? 'item' : 'itens'} em{' '}
                  <span className="mv-numero">{quantidade(mes.notasPendentes)}</span>{' '}
                  {mes.notasPendentes === 1 ? 'nota' : 'notas'} ainda não foram ligados a um produto
                  do catálogo. Enquanto isso, eles não entram no CMV.
                </span>
                <Link
                  to="/compras/notas"
                  className="font-semibold underline decoration-dotted underline-offset-4"
                >
                  Resolver os vínculos
                </Link>
              </p>
            </Aviso>
          )}

          {/* ─────────────────────────────────────── contagem em curso ──── */}
          {aberta && (
            <Cartao
              titulo="Contagem em andamento"
              descricao={aberta.titulo ?? `${aberta.tipo} · ${formatarData(aberta.referencia)}`}
              acao={
                <Botao tom="primario" tamanho="p" onClick={() => navegar(`/contagem/${aberta.id}`)}>
                  Continuar
                </Botao>
              }
            >
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Selo tom="alerta">aberta</Selo>
                  <span role="status" className="text-apoio text-texto-suave">
                    <span className="mv-numero text-texto">{quantidade(aberta.itens_preenchidos)}</span>{' '}
                    de <span className="mv-numero">{quantidade(aberta.itens_total)}</span> itens ·{' '}
                    <span className="mv-numero">{progresso}%</span>
                  </span>
                  <span className="mv-numero ml-auto text-corpo font-semibold text-texto">
                    {dinheiro(aberta.total)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-superficie-3"
                  role="progressbar"
                  aria-valuenow={progresso}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso da contagem aberta"
                >
                  <div
                    className="h-full rounded-full bg-primaria transition-[width]"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <p className="text-apoio text-texto-fraco">
                  O total sobe conforme os itens são lançados. Fechar a contagem congela essa foto —
                  é ela que vira estoque final do período no CMV.
                </p>
              </div>
            </Cartao>
          )}

          {/* ──────────────────────────────────────────────────── atalhos ── */}
          <section>
            <h2 className="mv-rotulo mb-3">O que dá para fazer agora</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Atalho
                para={aberta ? `/contagem/${aberta.id}` : '/contagem'}
                icone={<ClipboardList className="size-5" aria-hidden />}
                titulo={aberta ? 'Continuar a contagem' : 'Abrir contagem'}
                descricao={
                  aberta ? 'A folha em aberto, setor por setor.' : 'Monta a folha a partir do cadastro.'
                }
              />
              <Atalho
                para="/compras/notas"
                icone={<FileText className="size-5" aria-hidden />}
                titulo="Importar nota"
                descricao="XML, PDF ou lançamento manual da compra de rua."
              />
              <Atalho
                para="/compras/lista"
                icone={<ShoppingCart className="size-5" aria-hidden />}
                titulo="Gerar lista de compras"
                descricao="O cadastro vira folha de pedido com sugestão."
              />
              <Atalho
                para="/cadastros/insumos"
                icone={<Package className="size-5" aria-hidden />}
                titulo="Ajustar o catálogo"
                descricao="Insumos, categorias e setores."
              />
            </div>
          </section>
        </>
      )}
    </>
  )
}
