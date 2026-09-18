/**
 * Módulo 3.1 · entrada de notas fiscais.
 *
 * São três caminhos, e a tela precisa deixar claro qual é qual, porque eles
 * dão trabalhos muito diferentes:
 *
 *  1. **XML da NFe** — o único caminho em que o sistema lê tudo sozinho. O XML
 *     é parseado **no cliente**, a prévia aparece antes de qualquer gravação, e
 *     só depois de conferida a nota vai para a edge function.
 *  2. **PDF** — o sistema não lê PDF, e a tela diz isso com todas as letras. O
 *     arquivo fica anexado à nota; os itens são digitados.
 *  3. **Manual** — a compra de rua, sem documento nenhum.
 *
 * Quando existe `:notaId` na rota, a tela vira a conferência de itens, que é a
 * parte séria do módulo (ver `Conferencia.tsx`).
 */
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FileCode2,
  FileText,
  Loader2,
  PencilLine,
  Plus,
  Store,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { useSessao } from '@/dados/sessao'
import { chaves, useFornecedores, useProdutos } from '@/dados/consultas'
import { ErroNfe, parsearXml, type NotaImportada } from '@/dados/nfe/parsearXml'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Campo,
  CampoNumero,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Rotulo,
  Selecao,
  Selo,
  Tabela,
  Td,
  Th,
} from '@/componentes/base'
import { data as formatarData, dinheiro, documento, quantidade } from '@/util/formato'
import { hojeIso } from '@/paginas/contagem/logica'
import {
  ErroDeImportacao,
  criarNotaManual,
  enviarArquivoDaNota,
  importarXml,
  totalDaNotaManual,
  type ArquivoEnviado,
  type ItemManual,
} from './gravar'
import { Conferencia } from './Conferencia'

type Caminho = 'xml' | 'pdf' | 'manual'

const CAMINHOS: { valor: Caminho; rotulo: string; ajuda: string; icone: typeof FileCode2 }[] = [
  {
    valor: 'xml',
    rotulo: 'XML da NFe',
    ajuda: 'O sistema lê o arquivo inteiro: fornecedor, itens, impostos e total.',
    icone: FileCode2,
  },
  {
    valor: 'pdf',
    rotulo: 'PDF da nota',
    ajuda: 'O arquivo fica anexado, mas os itens você digita — o sistema não lê PDF.',
    icone: FileText,
  },
  {
    valor: 'manual',
    rotulo: 'Compra de rua',
    ajuda: 'Sem documento: fornecedor, data e os itens comprados.',
    icone: PencilLine,
  },
]

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export function Notas() {
  const { notaId } = useParams<{ notaId: string }>()
  const { restaurante } = useSessao()

  if (!restaurante) {
    return (
      <>
        <CabecalhoDePagina titulo="Notas fiscais" />
        <Cartao>
          <EstadoVazio icone={<Store className="size-7" />} titulo="Nenhum restaurante em foco">
            Escolha um restaurante na barra de cima para lançar notas.
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  if (notaId) return <Conferencia key={notaId} restauranteId={restaurante.id} notaId={notaId} />
  return <EntradaDeNotas restauranteId={restaurante.id} />
}

/* ──────────────────────────────────────────────────── escolha do caminho ── */

function EntradaDeNotas({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const [caminho, setCaminho] = useState<Caminho>('xml')

  return (
    <>
      <CabecalhoDePagina
        titulo="Notas fiscais"
        descricao="Toda compra entra por aqui. É ela que empurra o custo médio dos produtos e o CMV do período."
        acoes={
          <Botao tom="fantasma" onClick={() => navegar('/compras/historico')}>
            Histórico
          </Botao>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Como a nota vai entrar">
        {CAMINHOS.map((opcao) => {
          const ativo = opcao.valor === caminho
          const Icone = opcao.icone
          return (
            <button
              key={opcao.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => setCaminho(opcao.valor)}
              className={clsx(
                'flex min-h-toque flex-col items-start gap-1 rounded-marca border p-4 text-left transition-colors',
                ativo
                  ? 'border-primaria bg-primaria/16'
                  : 'border-borda bg-superficie-1 hover:border-borda-forte',
              )}
            >
              <span
                className={clsx(
                  'flex items-center gap-2 font-titulo text-corpo font-semibold',
                  ativo ? 'text-primaria-legivel' : 'text-texto',
                )}
              >
                <Icone className="size-[18px]" aria-hidden />
                {opcao.rotulo}
              </span>
              <span className="text-apoio leading-snug text-texto-fraco">{opcao.ajuda}</span>
            </button>
          )
        })}
      </div>

      {caminho === 'xml' && <CaminhoDoXml restauranteId={restauranteId} />}
      {caminho === 'pdf' && <CaminhoDoPdf restauranteId={restauranteId} />}
      {caminho === 'manual' && (
        <FormularioManual restauranteId={restauranteId} origem="manual" arquivo={null} />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────── 1 · XML ── */

function CaminhoDoXml({ restauranteId }: { restauranteId: string }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)

  const [arrastando, setArrastando] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [previa, setPrevia] = useState<{ nota: NotaImportada; xml: string; nome: string } | null>(
    null,
  )
  const [erro, setErro] = useState<string | null>(null)
  const [duplicada, setDuplicada] = useState<{ mensagem: string; notaId: string | null } | null>(
    null,
  )
  const [gravando, setGravando] = useState(false)

  async function receberArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setDuplicada(null)
    setPrevia(null)
    setLendo(true)
    try {
      const xml = await arquivo.text()
      // Parse no cliente: ninguém grava nada antes de a pessoa ver o que veio.
      const nota = parsearXml(xml)
      setPrevia({ nota, xml, nome: arquivo.name })
    } catch (falha) {
      setErro(
        falha instanceof ErroNfe
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
    setDuplicada(null)
    setGravando(true)
    try {
      const resultado = await importarXml({
        restauranteId,
        xml: previa.xml,
        arquivoNome: previa.nome,
      })
      // A nota acabou de nascer fora do TanStack Query: sem invalidar, a tela
      // de conferência abriria com um histórico em cache que não a contém.
      await qc.invalidateQueries({ queryKey: chaves.compras(restauranteId) })
      navegar(`/compras/notas/${resultado.notaId}`)
    } catch (falha) {
      if (falha instanceof ErroDeImportacao && falha.jaImportada) {
        setDuplicada({ mensagem: falha.message, notaId: falha.notaExistenteId })
      } else {
        setErro(mensagemDoErro(falha))
      }
    } finally {
      setGravando(false)
    }
  }

  return (
    <>
      <Cartao
        titulo="XML da NFe"
        descricao="Arraste o arquivo aqui ou escolha no aparelho. Um XML por vez."
      >
        <div className="p-5">
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
              arrastando ? 'border-primaria bg-primaria/10' : 'border-borda bg-superficie-2',
            )}
          >
            {lendo ? (
              <Loader2 className="size-7 animate-spin text-texto-fraco" aria-hidden />
            ) : (
              <UploadCloud className="size-7 text-texto-fraco" aria-hidden />
            )}
            <p className="text-apoio text-texto-suave">
              Solte o XML aqui — nada é gravado antes de você conferir.
            </p>
            <input
              ref={entrada}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="sr-only"
              onChange={(e) => {
                void receberArquivo(e.target.files?.[0])
                e.target.value = ''
              }}
              aria-label="Escolher o arquivo XML da nota"
            />
            <Botao tom="secundario" onClick={() => entrada.current?.click()}>
              Escolher arquivo
            </Botao>
          </div>
        </div>
      </Cartao>

      {erro && (
        <Aviso tom="erro" titulo="Não deu para ler o XML">
          {erro}
        </Aviso>
      )}

      {duplicada && (
        <Aviso tom="alerta" titulo="Esta nota já está no sistema">
          <p className="mt-1">{duplicada.mensagem}</p>
          <p className="mt-1">
            Importar de novo dobraria as compras do mês, então o sistema recusou. Se faltou
            conferir algum item, abra a nota que já existe.
          </p>
          {duplicada.notaId && (
            <Botao
              tom="secundario"
              tamanho="p"
              className="mt-3"
              onClick={() => navegar(`/compras/notas/${duplicada.notaId}`)}
            >
              Abrir a nota importada
            </Botao>
          )}
        </Aviso>
      )}

      {previa && (
        <PreviaDaNota
          nota={previa.nota}
          nome={previa.nome}
          gravando={gravando}
          aoDescartar={() => setPrevia(null)}
          aoConfirmar={() => void gravar()}
        />
      )}
    </>
  )
}

function PreviaDaNota({
  nota,
  nome,
  gravando,
  aoDescartar,
  aoConfirmar,
}: {
  nota: NotaImportada
  nome: string
  gravando: boolean
  aoDescartar: () => void
  aoConfirmar: () => void
}) {
  return (
    <Cartao
      titulo="Confira antes de gravar"
      descricao={nome}
      acao={<Selo tom="info">Ainda não gravada</Selo>}
    >
      <div className="space-y-4 p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="mv-rotulo">Emitente</dt>
            <dd className="text-corpo text-texto">{nota.emitente.razaoSocial}</dd>
            <dd className="mv-numero text-micro text-texto-fraco">
              {documento(nota.emitente.documento)}
            </dd>
          </div>
          <div>
            <dt className="mv-rotulo">Nota</dt>
            <dd className="mv-numero text-corpo text-texto">
              nº {nota.numero} · série {nota.serie}
            </dd>
            <dd className="mv-numero text-micro text-texto-fraco">
              {formatarData(nota.emitidaEm)}
            </dd>
          </div>
          <div>
            <dt className="mv-rotulo">Total da nota</dt>
            <dd className="mv-numero text-destaque font-semibold text-texto">
              {dinheiro(nota.totais.valorTotal)}
            </dd>
          </div>
          <div>
            <dt className="mv-rotulo">Desembolso com impostos</dt>
            <dd className="mv-numero text-destaque font-semibold text-texto">
              {dinheiro(nota.totais.custoDesembolsado)}
            </dd>
            <dd className="text-micro text-texto-fraco">
              É este o valor que vira custo do produto.
            </dd>
          </div>
        </dl>

        {nota.avisos.length > 0 && (
          <Aviso tom="alerta" titulo="A leitura deixou observações">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {nota.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </Aviso>
        )}

        <div className="-mx-5 max-h-[420px] overflow-y-auto border-y border-borda">
          <Tabela>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Un.</Th>
                <Th numerico>Qtd.</Th>
                <Th numerico>Unitário</Th>
                <Th numerico>Total</Th>
              </tr>
            </thead>
            <tbody>
              {nota.itens.map((item) => (
                <tr key={`${item.ordem}-${item.descricao}`}>
                  <Td>{item.descricao}</Td>
                  <Td className="mv-numero">{item.unidade}</Td>
                  <Td numerico>{quantidade(item.quantidade)}</Td>
                  <Td numerico>{dinheiro(item.valorUnitario)}</Td>
                  <Td numerico>{dinheiro(item.valorTotal)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao tom="secundario" onClick={aoDescartar}>
            Descartar
          </Botao>
          <Botao tom="primario" carregando={gravando} onClick={aoConfirmar}>
            Importar {nota.itens.length} iten(s)
          </Botao>
        </div>
      </div>
    </Cartao>
  )
}

/* ─────────────────────────────────────────────────────────────── 2 · PDF ── */

function CaminhoDoPdf({ restauranteId }: { restauranteId: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [arquivo, setArquivo] = useState<ArquivoEnviado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(escolhido: File | undefined) {
    if (!escolhido) return
    setErro(null)
    setEnviando(true)
    try {
      setArquivo(await enviarArquivoDaNota(restauranteId, escolhido))
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Cartao titulo="PDF da nota" descricao="O arquivo fica guardado junto da nota.">
        <div className="space-y-4 p-5">
          <Aviso tom="info" titulo="O sistema não lê PDF">
            Não existe leitura automática aqui: anexe o PDF e confira os itens digitando um a
            um. É trabalhoso de propósito — um item chutado vira custo errado no produto e CMV
            errado no mês.
          </Aviso>

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          {arquivo ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-marca-p border border-borda bg-superficie-2 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-texto-fraco" aria-hidden />
                <span className="truncate text-corpo">{arquivo.nome}</span>
              </span>
              <Selo tom="sucesso">Anexado</Selo>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={entrada}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  void enviar(e.target.files?.[0])
                  e.target.value = ''
                }}
                aria-label="Escolher o PDF da nota"
              />
              <Botao
                tom="secundario"
                carregando={enviando}
                icone={<UploadCloud className="size-4" aria-hidden />}
                onClick={() => entrada.current?.click()}
              >
                Anexar PDF
              </Botao>
              <span className="text-apoio text-texto-fraco">
                Depois de anexar, o formulário de itens abre logo abaixo.
              </span>
            </div>
          )}
        </div>
      </Cartao>

      {arquivo && (
        <FormularioManual restauranteId={restauranteId} origem="pdf" arquivo={arquivo} />
      )}
    </>
  )
}

/* ────────────────────────────────────────────── 3 · manual (e o do PDF) ─── */

interface LinhaManual {
  chave: string
  produtoId: string
  quantidade: number
  valorUnitario: number
}

let proximaChave = 0
const novaLinha = (): LinhaManual => ({
  chave: `linha-${(proximaChave += 1)}`,
  produtoId: '',
  quantidade: 0,
  valorUnitario: 0,
})

function FormularioManual({
  restauranteId,
  origem,
  arquivo,
}: {
  restauranteId: string
  origem: 'manual' | 'pdf'
  arquivo: ArquivoEnviado | null
}) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const fornecedores = useFornecedores(restauranteId)
  const produtos = useProdutos(restauranteId)

  const [fornecedorId, setFornecedorId] = useState('')
  const [emitidaEm, setEmitidaEm] = useState(() => hojeIso())
  const [numero, setNumero] = useState('')
  const [linhas, setLinhas] = useState<LinhaManual[]>(() => [novaLinha()])
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)

  const catalogo = (produtos.data ?? []).filter((p) => p.ativo)

  function alterar(chave: string, mudanca: Partial<LinhaManual>) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)),
    )
  }

  const itens: ItemManual[] = linhas.flatMap((linha) => {
    const produto = catalogo.find((p) => p.id === linha.produtoId)
    if (!produto || linha.quantidade <= 0) return []
    return [
      {
        produtoId: produto.id,
        descricao: produto.nome,
        unidade: produto.unidade,
        quantidade: linha.quantidade,
        valorUnitario: linha.valorUnitario,
      },
    ]
  })
  const total = totalDaNotaManual(itens)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    if (itens.length === 0) {
      setErro('Escolha ao menos um produto e informe a quantidade.')
      return
    }
    setGravando(true)
    try {
      const notaId = await criarNotaManual({
        restauranteId,
        fornecedorId: fornecedorId === '' ? null : fornecedorId,
        origem,
        emitidaEm,
        numero: numero.trim() === '' ? null : numero.trim(),
        arquivoUrl: arquivo?.caminho ?? null,
        arquivoNome: arquivo?.nome ?? null,
        itens,
      })
      await qc.invalidateQueries({ queryKey: chaves.compras(restauranteId) })
      navegar(`/compras/notas/${notaId}`)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setGravando(false)
    }
  }

  return (
    <Cartao
      titulo={origem === 'pdf' ? 'Itens da nota em PDF' : 'Compra de rua'}
      descricao="O item já nasce vinculado ao produto do cadastro — por isso a nota sai pronta para lançar."
    >
      <form onSubmit={(e) => void enviar(e)} className="space-y-5 p-5">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {produtos.isError && <ErroDaConsulta erro={produtos.error} />}
        {produtos.isLoading && <Carregando linhas={2} />}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Rotulo para="fornecedor">Fornecedor</Rotulo>
            <Selecao
              id="fornecedor"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
            >
              <option value="">Sem fornecedor</option>
              {(fornecedores.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="space-y-1.5">
            <Rotulo para="emitida">Data da compra</Rotulo>
            <Campo
              id="emitida"
              type="date"
              required
              value={emitidaEm}
              onChange={(e) => setEmitidaEm(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Rotulo para="numero">Número (opcional)</Rotulo>
            <Campo
              id="numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="cupom, recibo…"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="mv-rotulo">Itens</div>
          <ul className="space-y-2">
            {linhas.map((linha) => {
              const produto = catalogo.find((p) => p.id === linha.produtoId)
              return (
                <li
                  key={linha.chave}
                  className="grid gap-2 rounded-marca-p border border-borda bg-superficie-2 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <Rotulo para={`produto-${linha.chave}`}>Produto</Rotulo>
                    <Selecao
                      id={`produto-${linha.chave}`}
                      value={linha.produtoId}
                      onChange={(e) => {
                        const escolhido = catalogo.find((p) => p.id === e.target.value)
                        alterar(linha.chave, {
                          produtoId: e.target.value,
                          // O custo médio entra como palpite do preço — quase
                          // sempre é ele mesmo, e quem digita corrige se mudou.
                          valorUnitario:
                            linha.valorUnitario === 0 && escolhido
                              ? escolhido.custo_medio
                              : linha.valorUnitario,
                        })
                      }}
                    >
                      <option value="">Escolha o produto</option>
                      {catalogo.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} ({p.unidade})
                        </option>
                      ))}
                    </Selecao>
                  </div>

                  <div className="space-y-1">
                    <Rotulo para={`qtd-${linha.chave}`}>
                      Qtd. {produto ? `(${produto.unidade})` : ''}
                    </Rotulo>
                    <CampoNumero
                      id={`qtd-${linha.chave}`}
                      valor={linha.quantidade}
                      aoMudar={(valor) => alterar(linha.chave, { quantidade: valor })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Rotulo para={`valor-${linha.chave}`}>Unitário</Rotulo>
                    <CampoNumero
                      key={`${linha.chave}:${linha.produtoId}`}
                      id={`valor-${linha.chave}`}
                      valor={linha.valorUnitario}
                      aoMudar={(valor) => alterar(linha.chave, { valorUnitario: valor })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
                    <span className="mv-numero text-corpo font-semibold text-texto">
                      {dinheiro(linha.quantidade * linha.valorUnitario)}
                    </span>
                    <Botao
                      tom="fantasma"
                      tamanho="p"
                      aria-label="Remover este item"
                      className="mv-toque px-2"
                      onClick={() =>
                        setLinhas((atual) =>
                          atual.length === 1
                            ? [novaLinha()]
                            : atual.filter((l) => l.chave !== linha.chave),
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Botao>
                  </div>
                </li>
              )
            })}
          </ul>

          <Botao
            tom="secundario"
            icone={<Plus className="size-4" aria-hidden />}
            onClick={() => setLinhas((atual) => [...atual, novaLinha()])}
          >
            Mais um item
          </Botao>
        </div>

        <div
          role="status"
          className="flex items-center justify-between rounded-marca-p border border-borda bg-superficie-2 px-4 py-3"
        >
          <span className="mv-rotulo">Total da nota</span>
          <span className="mv-numero text-secao font-semibold text-texto">{dinheiro(total)}</span>
        </div>

        <Botao type="submit" tom="primario" tamanho="g" carregando={gravando}>
          Gravar nota
        </Botao>
      </form>
    </Cartao>
  )
}
