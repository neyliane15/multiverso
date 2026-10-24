/**
 * Módulo 3.1 · o quarto caminho de entrada: a planilha de entradas do ERP.
 *
 * A ordem é a do XML, e de propósito: **prévia primeiro, gravação depois**.
 * São 133 notas e 693 itens num arquivo; ninguém grava isso sem ver antes
 * quantas notas são, quanto somam, e quantos itens vão ficar pendentes.
 *
 * A prévia é lida no navegador e nada vai para o banco até a pessoa confirmar.
 * Depois de gravadas, as notas nascem `importada` — elas só entram no CMV
 * quando alguém LANÇA cada uma, e `mv_lancar_nota` recusa nota com item
 * pendente. A importação não decide que item sem vínculo virou custo de nada.
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, UploadCloud } from 'lucide-react'
import clsx from 'clsx'
import {
  chaves,
  useCompras,
  useFornecedores,
  useProdutoApelidos,
  useProdutos,
} from '@/dados/consultas'
import { ErroDePlanilha, lerXlsx } from '@/dados/planilha/lerXlsx'
import { lerComprasDaPlanilha, type PlanilhaDeCompras as Planilha } from '@/dados/planilha/compras'
import { casarCompraDaPlanilha } from '@/dados/planilha/dePara'
import {
  importarComprasDaPlanilha,
  type ResultadoDaImportacaoDeCompras,
} from './importarPlanilha'
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  ErroDaConsulta,
  Indicador,
  Selo,
  Tabela,
  Td,
  Th,
  plural,
} from '@/componentes/base'
import { data as formatarData, dinheiro, quantidade } from '@/util/formato'

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function CaminhoDaPlanilha({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const produtos = useProdutos(restauranteId)
  const apelidos = useProdutoApelidos(restauranteId)
  const fornecedores = useFornecedores(restauranteId)
  const compras = useCompras(restauranteId)

  const [arrastando, setArrastando] = useState(false)
  const [lendo, setLendo] = useState(false)
  // Quantas linhas o leitor ja passou. A leitura da aba de vendas leva 10,0 s
  // a 390 px com a CPU freada 4x, e nao vai deixar de levar sem Web Worker —
  // o que da para fazer de graca e esses segundos nao serem cegos.
  const [linhasLidas, setLinhasLidas] = useState(0)
  const [previa, setPrevia] = useState<{ planilha: Planilha; nome: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, setGravando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDaImportacaoDeCompras | null>(null)

  const catalogo = useMemo(() => (produtos.data ?? []).filter((p) => p.ativo), [produtos.data])

  /**
   * Quantos itens vão nascer pendentes, pelo mesmo de-para que a gravação usa.
   *
   * A conta roda na prévia e não na gravação porque é esse número que decide se
   * a pessoa quer importar agora: 342 itens para vincular à mão é uma tarde de
   * trabalho, e ela tem o direito de saber disso antes.
   */
  const pendentes = useMemo(() => {
    if (!previa || catalogo.length === 0) return null
    let vinculados = 0
    let pendentes = 0
    let valorPendente = 0
    const nomes = new Set<string>()
    for (const nota of previa.planilha.notas) {
      for (const item of nota.itens) {
        const casamento = casarCompraDaPlanilha(item.descricao, {
          produtos: catalogo,
          apelidos: apelidos.data ?? [],
        })
        if (casamento.produtoId) vinculados += 1
        else {
          pendentes += 1
          valorPendente = Math.round((valorPendente + item.valorTotal) * 100) / 100
          nomes.add(item.descricao)
        }
      }
    }
    return { vinculados, pendentes, valorPendente, nomes: nomes.size }
  }, [previa, catalogo, apelidos.data])

  async function receberArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setPrevia(null)
    setResultado(null)
    setLinhasLidas(0)
    setLendo(true)
    try {
      const aba = await lerXlsx(await arquivo.arrayBuffer(), { aoProgresso: setLinhasLidas })
      setPrevia({ planilha: lerComprasDaPlanilha(aba), nome: arquivo.name })
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
    setGravando('começando')
    try {
      const saida = await importarComprasDaPlanilha({
        restauranteId,
        planilha: previa.planilha,
        arquivoNome: previa.nome,
        produtos: produtos.data ?? [],
        apelidos: apelidos.data ?? [],
        fornecedores: fornecedores.data ?? [],
        jaImportadas: (compras.data ?? []).map((c) => ({
          numero: c.numero,
          emitida_em: c.emitida_em,
          fornecedor_id: c.fornecedor_id,
        })),
        aoProgresso: setGravando,
      })
      await qc.invalidateQueries({ queryKey: chaves.compras(restauranteId) })
      await qc.invalidateQueries({ queryKey: chaves.fornecedores(restauranteId) })
      setResultado(saida)
      setPrevia(null)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setGravando(null)
    }
  }

  const carregando = produtos.isLoading || apelidos.isLoading || fornecedores.isLoading

  return (
    <>
      <Cartao
        titulo="Planilha de entradas do ERP"
        descricao="Uma linha por item, com o cabeçalho da nota repetido. O sistema agrupa por número, fornecedor e emissão."
      >
        <div className="space-y-4 p-5">
          <Aviso tom="info" titulo="O que o sistema lê, e o que ele não decide">
            <p className="mt-1">
              Ele lê fornecedor, número, emissão, entrada, produto, unidade, quantidade, unitário,
              preço final e operação. O <strong>preço final</strong> é o que vira custo: ele já
              traz o frete, a despesa e o ICMS-ST que a nota rateou, e numa cerveja isso é 18%
              acima do unitário.
            </p>
            <p className="mt-1">
              O que ele não decide é qual insumo é qual. Só vincula sozinho o nome{' '}
              <strong>idêntico</strong> ao do cadastro ou o que alguém já vinculou à mão antes — o
              resto fica pendente, para a conferência de sempre.
            </p>
          </Aviso>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastando(false)
              void receberArquivo(e.dataTransfer.files[0])
            }}
            className={clsx(
              'flex flex-col items-center gap-3 rounded-marca border-2 border-dashed px-6 py-10 text-center transition-colors',
              arrastando ? 'border-primaria bg-primaria-10' : 'border-borda bg-superficie-2',
            )}
          >
            {lendo ? (
              <Loader2 className="size-7 animate-spin text-texto-fraco" aria-hidden />
            ) : (
              <UploadCloud className="size-7 text-texto-fraco" aria-hidden />
            )}
            <p className="text-apoio text-texto-suave" aria-live="polite">
              {lendo
                ? linhasLidas > 0
                  ? `Lendo a planilha — ${quantidade(linhasLidas)} linhas até agora.`
                  : 'Abrindo o arquivo…'
                : 'Solte o .xlsx aqui — nada é gravado antes de você conferir.'}
            </p>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                void receberArquivo(e.target.files?.[0])
                e.target.value = ''
              }}
              aria-label="Escolher a planilha de entradas"
            />
            <Botao tom="secundario" onClick={() => entrada.current?.click()}>
              Escolher planilha
            </Botao>
          </div>

          {carregando && <Carregando linhas={2} />}
          {produtos.isError && <ErroDaConsulta erro={produtos.error} />}
        </div>
      </Cartao>

      {erro && (
        <Aviso tom="erro" titulo="Não deu para ler a planilha">
          {erro}
        </Aviso>
      )}

      {resultado && <ResultadoDaPlanilha resultado={resultado} aoVerHistorico={() => navegar('/compras/historico')} />}

      {previa && (
        <PreviaDaPlanilha
          planilha={previa.planilha}
          nome={previa.nome}
          pendentes={pendentes}
          gravando={gravando}
          aoDescartar={() => setPrevia(null)}
          aoConfirmar={() => void gravar()}
        />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────── a prévia ── */

function PreviaDaPlanilha({
  planilha,
  nome,
  pendentes,
  gravando,
  aoDescartar,
  aoConfirmar,
}: {
  planilha: Planilha
  nome: string
  pendentes: { vinculados: number; pendentes: number; valorPendente: number; nomes: number } | null
  gravando: string | null
  aoDescartar: () => void
  aoConfirmar: () => void
}) {
  const [verTodas, setVerTodas] = useState(false)
  const notas = verTodas ? planilha.notas : planilha.notas.slice(0, 15)

  return (
    <Cartao
      titulo="Confira antes de gravar"
      descricao={`${nome} · aba "${planilha.aba}"`}
      acao={<Selo tom="info">Ainda não gravada</Selo>}
    >
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Notas"
            valor={quantidade(planilha.notas.length)}
            apoio={`Agrupadas de ${quantidade(planilha.linhas)} ${plural(planilha.linhas, 'linha', 'linhas')} da planilha.`}
          />
          <Indicador rotulo="Itens" valor={quantidade(planilha.itens)} />
          <Indicador
            rotulo="Total"
            valor={dinheiro(planilha.total)}
            tom="marca"
            apoio="Soma dos preços finais, que é o que vira custo."
          />
          <Indicador
            rotulo="Vão ficar pendentes"
            valor={pendentes === null ? '—' : quantidade(pendentes.pendentes)}
            tom={pendentes && pendentes.pendentes > 0 ? 'alerta' : 'sucesso'}
            apoio={
              pendentes === null
                ? 'Carregando o catálogo para conferir.'
                : pendentes.pendentes === 0
                  ? 'Todo item casou com um insumo do cadastro.'
                  : `${dinheiro(pendentes.valorPendente)} em ${quantidade(pendentes.nomes)} ${plural(pendentes.nomes, 'nome diferente', 'nomes diferentes')}.`
            }
          />
        </div>

        {planilha.avisos.length > 0 && (
          <Aviso tom="alerta" titulo="A leitura deixou observações">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {planilha.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </Aviso>
        )}

        {planilha.descartadas.length > 0 && (
          <div className="rounded-marca-p border border-borda bg-superficie-2 p-4">
            <div className="mv-rotulo flex items-center gap-2">
              <AlertTriangle className="size-4 text-alerta-texto" aria-hidden />
              Linhas que não viraram item
            </div>
            <ul className="mt-2 space-y-1 text-apoio text-texto-suave">
              {planilha.descartadas.slice(0, 20).map((d) => (
                <li key={d.linha}>
                  <span className="mv-numero">linha {d.linha}</span> · {d.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pendentes !== null && pendentes.pendentes > 0 && (
          <Aviso tom="info" titulo="Pendente não é erro, é trabalho que sobra">
            O item fica na nota com o valor certo e sem insumo. A nota não entra no CMV enquanto
            houver pendente — <strong>o banco recusa lançá-la</strong> — e cada vínculo que você
            fizer à mão fica aprendido: na planilha do mês que vem aquele nome já vem casado.
          </Aviso>
        )}

        <div className="-mx-5 max-h-[420px] overflow-y-auto border-y border-borda">
          <Tabela>
            <thead>
              <tr>
                <Th>Nota</Th>
                <Th>Fornecedor</Th>
                <Th>Emissão</Th>
                <Th>Entrada</Th>
                <Th numerico>Itens</Th>
                <Th numerico>Total</Th>
              </tr>
            </thead>
            <tbody>
              {notas.map((nota) => (
                <tr key={nota.chave}>
                  <Td className="mv-numero">{nota.numero}</Td>
                  <Td>
                    <span className="block max-w-[28ch] truncate">{nota.fornecedorNome}</span>
                  </Td>
                  <Td className="mv-numero">{formatarData(nota.emitidaEm)}</Td>
                  <Td className="mv-numero text-texto-fraco">{formatarData(nota.recebidaEm)}</Td>
                  <Td numerico>{nota.itens.length}</Td>
                  <Td numerico className="font-semibold">
                    {dinheiro(nota.valorTotal)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>

        {!verTodas && planilha.notas.length > notas.length && (
          <Botao tom="fantasma" tamanho="p" onClick={() => setVerTodas(true)}>
            Ver as {planilha.notas.length} notas
          </Botao>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {gravando && (
            <span className="mr-auto text-apoio text-texto-fraco">{gravando}…</span>
          )}
          <Botao tom="secundario" disabled={gravando !== null} onClick={aoDescartar}>
            Descartar
          </Botao>
          <Botao tom="primario" carregando={gravando !== null} onClick={aoConfirmar}>
            Importar {planilha.notas.length} {plural(planilha.notas.length, 'nota', 'notas')}
          </Botao>
        </div>
      </div>
    </Cartao>
  )
}

/* ───────────────────────────────────────────────────────── o que aconteceu ── */

function ResultadoDaPlanilha({
  resultado,
  aoVerHistorico,
}: {
  resultado: ResultadoDaImportacaoDeCompras
  aoVerHistorico: () => void
}) {
  return (
    <Cartao
      titulo="Planilha importada"
      acao={
        <Botao tom="primario" tamanho="p" onClick={aoVerHistorico}>
          Abrir o histórico
        </Botao>
      }
    >
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Notas gravadas" valor={quantidade(resultado.notas)} tom="sucesso" />
          <Indicador rotulo="Itens" valor={quantidade(resultado.itens)} />
          <Indicador rotulo="Total" valor={dinheiro(resultado.total)} tom="marca" />
          <Indicador
            rotulo="Itens pendentes"
            valor={quantidade(resultado.pendentes)}
            tom={resultado.pendentes > 0 ? 'alerta' : 'sucesso'}
            apoio={
              resultado.pendentes > 0
                ? `Em ${quantidade(resultado.notasPendentes)} ${plural(resultado.notasPendentes, 'nota', 'notas')}, que não podem ser lançadas antes do vínculo.`
                : 'Todas as notas já podem ser lançadas.'
            }
          />
        </div>

        {resultado.fornecedoresNovos > 0 && (
          <Aviso tom="info">
            {quantidade(resultado.fornecedoresNovos)}{' '}
            {plural(resultado.fornecedoresNovos, 'fornecedor novo foi cadastrado', 'fornecedores novos foram cadastrados')}{' '}
            a partir da planilha, com o CNPJ que ela trouxe.
          </Aviso>
        )}

        {resultado.repetidas.length > 0 && (
          <Aviso
            tom="alerta"
            titulo={`${resultado.repetidas.length} ${plural(resultado.repetidas.length, 'nota já estava', 'notas já estavam')} no sistema`}
          >
            <p className="mt-1">
              Elas não entraram de novo: importar a mesma planilha duas vezes dobraria as compras
              do mês. A identidade conferida é número + fornecedor + emissão.
            </p>
            <ul className="mv-numero mt-2 space-y-0.5 text-micro">
              {resultado.repetidas.slice(0, 10).map((r) => (
                <li key={`${r.numero}-${r.emitidaEm}`}>
                  nº {r.numero} · {formatarData(r.emitidaEm)} · {r.fornecedor}
                </li>
              ))}
            </ul>
          </Aviso>
        )}

        <Aviso tom="info" titulo="As notas nasceram importadas, não lançadas">
          Elas ainda não entraram no CMV. Abra cada uma no histórico, confira os itens e lance —
          é o lançamento que empurra o custo médio dos insumos.
        </Aviso>
      </div>
    </Cartao>
  )
}

