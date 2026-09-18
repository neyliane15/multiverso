/**
 * As gravações do módulo 3.1 que não cabem em `consultas.ts`.
 *
 * Três operações que não são uma linha de tabela: chamar a edge function de
 * importação, subir o arquivo da nota para o Storage e criar uma nota manual
 * (cabeçalho + itens numa transação de duas etapas). Ficam juntas aqui, e não
 * espalhadas pela tela, para que o tratamento de erro seja um só — em especial
 * o 409 de nota repetida, que precisa virar mensagem clara e link para a nota
 * que já existe, nunca um "erro inesperado".
 */
import { supabase } from '@/dados/supabase'
import type { NotaFiscal, OrigemNota } from '@/tipos/banco'

const BUCKET = 'notas'

/** Erro de importação com o status HTTP preservado — a tela decide o texto. */
export class ErroDeImportacao extends Error {
  readonly status: number
  /** Id da nota que já estava lá, quando o erro é de duplicidade. */
  readonly notaExistenteId: string | null

  constructor(mensagem: string, status: number, notaExistenteId: string | null = null) {
    super(mensagem)
    this.name = 'ErroDeImportacao'
    this.status = status
    this.notaExistenteId = notaExistenteId
  }

  /** 409: a nota já foi importada. Não é falha do sistema, é aviso. */
  get jaImportada(): boolean {
    return this.status === 409
  }
}

export interface ResultadoDaImportacao {
  notaId: string
  total: number
  vinculados: number
  pendentes: number
  avisos: string[]
}

interface CorpoDeErro {
  erro?: string
  notaId?: string
}

/**
 * Manda o XML para `importar-nfe`.
 *
 * O `functions.invoke` do supabase-js não entrega o corpo da resposta quando o
 * status não é 2xx — ele embrulha a `Response` em `error.context`. Sem abrir
 * esse embrulho, a mensagem que sobra é "Edge Function returned a non-2xx
 * status code", que não ajuda ninguém.
 */
export async function importarXml(entrada: {
  restauranteId: string
  xml: string
  arquivoUrl?: string
  arquivoNome?: string
}): Promise<ResultadoDaImportacao> {
  const { data, error } = await supabase.functions.invoke('importar-nfe', {
    body: {
      restauranteId: entrada.restauranteId,
      xml: entrada.xml,
      arquivoUrl: entrada.arquivoUrl,
      arquivoNome: entrada.arquivoNome,
    },
  })

  if (error) {
    const resposta = (error as { context?: unknown }).context
    if (resposta instanceof Response) {
      const corpo = (await resposta.json().catch(() => null)) as CorpoDeErro | null
      throw new ErroDeImportacao(
        corpo?.erro ?? error.message,
        resposta.status,
        corpo?.notaId ?? null,
      )
    }
    throw new ErroDeImportacao(error.message, 0)
  }

  const resultado = data as ResultadoDaImportacao | null
  if (!resultado?.notaId) {
    throw new ErroDeImportacao('A importação respondeu sem o id da nota.', 0)
  }
  return resultado
}

export interface ArquivoEnviado {
  caminho: string
  nome: string
}

/**
 * Sobe o arquivo da nota para `notas/<restaurante_id>/<nome>`.
 *
 * O nome ganha um carimbo de tempo: dois PDFs chamados "nota.pdf" no mesmo
 * restaurante são rotina, e o segundo não pode apagar o primeiro.
 */
export async function enviarArquivoDaNota(
  restauranteId: string,
  arquivo: File,
): Promise<ArquivoEnviado> {
  const seguro = arquivo.name.replace(/[^\w.\-]+/g, '-')
  const nome = `${Date.now()}-${seguro}`
  const caminho = `${restauranteId}/${nome}`

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(`Não consegui enviar o arquivo: ${error.message}`)

  return { caminho, nome: arquivo.name }
}

export interface ItemManual {
  produtoId: string
  descricao: string
  unidade: string
  quantidade: number
  valorUnitario: number
}

export interface NotaManual {
  restauranteId: string
  fornecedorId: string | null
  origem: Extract<OrigemNota, 'manual' | 'pdf'>
  emitidaEm: string
  numero?: string | null
  observacao?: string | null
  arquivoUrl?: string | null
  arquivoNome?: string | null
  itens: ItemManual[]
}

export function totalDaNotaManual(itens: readonly ItemManual[]): number {
  return itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitario, 0)
}

/**
 * Cria a nota manual (compra de rua ou o PDF que alguém digitou).
 *
 * O item nasce já vinculado ao produto — quem digitou escolheu do cadastro — e
 * com fator 1, porque a quantidade foi informada na unidade do próprio
 * cadastro. Se os itens falharem, a nota é apagada: nota sem item entraria no
 * histórico valendo zero e ninguém entenderia o buraco.
 */
export async function criarNotaManual(nota: NotaManual): Promise<string> {
  const total = totalDaNotaManual(nota.itens)

  const { data: criada, error: erroNota } = await supabase
    .from('notas_fiscais')
    .insert({
      restaurante_id: nota.restauranteId,
      fornecedor_id: nota.fornecedorId,
      origem: nota.origem,
      status: 'importada',
      numero: nota.numero ?? null,
      emitida_em: nota.emitidaEm,
      valor_produtos: total,
      valor_total: total,
      arquivo_url: nota.arquivoUrl ?? null,
      arquivo_nome: nota.arquivoNome ?? null,
      observacao: nota.observacao ?? null,
    })
    .select('id')
    .single()

  if (erroNota || !criada) {
    throw new Error(`Não consegui gravar a nota: ${erroNota?.message ?? 'erro desconhecido'}.`)
  }
  const notaId = (criada as Pick<NotaFiscal, 'id'>).id

  const { error: erroItens } = await supabase.from('nota_itens').insert(
    nota.itens.map((item, ordem) => ({
      nota_id: notaId,
      produto_id: item.produtoId,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      valor_unitario: item.valorUnitario,
      valor_total: item.quantidade * item.valorUnitario,
      fator_conversao: 1,
      ordem,
    })),
  )

  if (erroItens) {
    await supabase.from('notas_fiscais').delete().eq('id', notaId)
    throw new Error(`Não consegui gravar os itens: ${erroItens.message}`)
  }

  return notaId
}

/** Marca (ou desmarca) um item da lista de compras como comprado. */
export async function marcarItemComprado(itemId: string, comprado: boolean): Promise<void> {
  const { error } = await supabase
    .from('lista_compras_itens')
    .update({ comprado })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
}
