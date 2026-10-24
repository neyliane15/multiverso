/**
 * A gravação da planilha do PDV: um lançamento de vendas e as linhas dele.
 *
 * **11.198 linhas de cupom viram 136 linhas de banco, em duas requisições.**
 * A agregação acontece antes, em `dados/planilha/vendas.ts`; aqui só se grava.
 * Mandar uma requisição por linha de cupom seriam 11.198 idas ao servidor com
 * a RLS reavaliada em cada uma — e 11.198 linhas num relatório de 136 itens.
 *
 * Cada linha nasce com um dos quatro alvos da 0027:
 *
 *   ficha     a venda entra na receita, e a receita explode em insumo
 *   produto   a garrafa fechada, vendida inteira, aponta direto no insumo
 *   servico   couvert e taxa: faturam e não consomem nada
 *   pendente  ninguém disse ainda o que é — e é o único estado que impede
 *             fechar o lançamento (`mv_fechar_venda` recusa)
 *
 * O lançamento nasce ABERTO de propósito. Aberto ele não entra em conta
 * nenhuma: nem no faturamento, nem no relatório de contagem. Quem fecha é a
 * pessoa, depois de resolver os pendentes — a mesma regra que `mv_lancar_nota`
 * aplica à nota fiscal desde a 0004.
 */
import { supabase } from '@/dados/supabase'
import { casarVendaDaPlanilha, type AlvoDeVenda, type ApelidoDeVenda } from '@/dados/planilha/dePara'
import { somarDinheiro } from '@/dados/planilha/compras'
import type { PlanilhaDeVendas } from '@/dados/planilha/vendas'
import type { FichaCompleta, ProdutoCompleto, Venda } from '@/tipos/banco'

export interface ResultadoDaImportacaoDeVendas {
  vendaId: string
  itens: number
  porAlvo: Record<AlvoDeVenda, number>
  /** O que cada alvo soma em dinheiro, para a tela conferir com a planilha. */
  valorPorAlvo: Record<AlvoDeVenda, number>
  total: number
  inicio: string
  referencia: string
}

export interface EntradaDaImportacaoDeVendas {
  restauranteId: string
  planilha: PlanilhaDeVendas
  arquivoNome: string
  fichas: FichaCompleta[]
  produtos: ProdutoCompleto[]
  apelidos: ApelidoDeVenda[]
  /** Sobrescreve o fim do período que a planilha trouxe. A tela oferece. */
  referencia?: string
  titulo?: string | null
}

function falhar(onde: string, erro: { message: string } | null): void {
  if (erro) throw new Error(`${onde}: ${erro.message}`)
}

/** O que a importação vai gravar, resolvido antes de tocar no banco. */
export interface LinhaResolvida {
  descricao: string
  unidade: string
  quantidade: number
  valorTotal: number
  linhas: number
  precoMedio: number
  alvo: AlvoDeVenda
  fichaId: string | null
  produtoId: string | null
  explicacao: string
  pareceServico: boolean
}

/**
 * Resolve as 136 linhas contra o cadastro, sem gravar nada.
 *
 * Separado da gravação porque a tela mostra a prévia antes: ninguém grava 136
 * linhas sem ver quantas ficaram pendentes e quanto dinheiro elas somam. É a
 * mesma ordem do caminho do XML em `Notas.tsx` — prévia primeiro, gravação
 * depois.
 */
export function resolverLinhasDeVenda(entrada: {
  planilha: PlanilhaDeVendas
  fichas: FichaCompleta[]
  produtos: ProdutoCompleto[]
  apelidos: ApelidoDeVenda[]
}): LinhaResolvida[] {
  const fichas = entrada.fichas.map((f) => ({
    id: f.id,
    nome: f.nome,
    producao: f.producao,
    ativo: f.ativo,
    preco_venda: f.preco_venda,
  }))
  const produtos = entrada.produtos.filter((p) => p.ativo)

  return entrada.planilha.itens.map((item) => {
    const casamento = casarVendaDaPlanilha(item.descricao, {
      fichas,
      produtos,
      apelidos: entrada.apelidos,
    })
    return {
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      valorTotal: item.valorTotal,
      linhas: item.linhas,
      precoMedio: item.precoMedio,
      alvo: casamento.alvo,
      fichaId: casamento.fichaId,
      produtoId: casamento.produtoId,
      explicacao: casamento.explicacao,
      pareceServico: casamento.pareceServico,
    }
  })
}

const ALVOS: AlvoDeVenda[] = ['ficha', 'produto', 'servico', 'pendente']

export async function importarVendasDaPlanilha(
  entrada: EntradaDaImportacaoDeVendas,
): Promise<ResultadoDaImportacaoDeVendas> {
  const resolvidas = resolverLinhasDeVenda(entrada)
  const referencia = entrada.referencia ?? entrada.planilha.referencia
  if (referencia === '') {
    throw new Error('A planilha não tem nenhuma data de caixa: sem data não há período.')
  }

  const { data: criada, error: erroVenda } = await supabase
    .from('vendas')
    .insert({
      restaurante_id: entrada.restauranteId,
      referencia,
      inicio: entrada.planilha.inicio === '' ? null : entrada.planilha.inicio,
      titulo: entrada.titulo ?? null,
      origem: 'pdv',
      origem_arquivo: entrada.arquivoNome,
    })
    .select('id')
    .single()
  // `vendas_ref_unica` é a trava que a 0023 criou pensando nisto: a mensagem
  // dela já está traduzida em `consultas.ts`, e diz para cancelar o lançamento
  // que ocupa a data em vez de ficar com duas verdades sobre o mesmo período.
  falhar('não consegui abrir o lançamento de vendas', erroVenda)
  const vendaId = (criada as Pick<Venda, 'id'>).id

  const linhas = resolvidas.map((linha) => ({
    venda_id: vendaId,
    alvo: linha.alvo,
    ficha_id: linha.fichaId,
    produto_id: linha.produtoId,
    quantidade: linha.quantidade,
    // A unidade em que o PDV vendeu, que a 0028 usa para converter a linha de
    // insumo direto. Sem ela, 59 KG de batata entravam como 59 unidades.
    unidade: linha.unidade,
    // Média do período. A verdade do dinheiro é `valor_total_origem`: ver o
    // cabeçalho da 0027 e o de `dados/planilha/vendas.ts`.
    preco_unitario: linha.precoMedio,
    valor_total_origem: linha.valorTotal,
    linhas_de_origem: linha.linhas,
    descricao_origem: linha.descricao,
  }))

  const { error: erroItens } = await supabase.from('venda_itens').insert(linhas).select('id')
  if (erroItens) {
    // Lançamento sem linha nenhuma entraria na lista valendo zero e ninguém
    // entenderia o buraco — a mesma decisão de `criarNotaManual`.
    await supabase.from('vendas').delete().eq('id', vendaId)
    throw new Error(`não consegui gravar as linhas da venda: ${erroItens.message}`)
  }

  const porAlvo = {} as Record<AlvoDeVenda, number>
  const valorPorAlvo = {} as Record<AlvoDeVenda, number>
  for (const alvo of ALVOS) {
    const doAlvo = resolvidas.filter((l) => l.alvo === alvo)
    porAlvo[alvo] = doAlvo.length
    valorPorAlvo[alvo] = somarDinheiro(doAlvo.map((l) => l.valorTotal))
  }

  return {
    vendaId,
    itens: resolvidas.length,
    porAlvo,
    valorPorAlvo,
    total: somarDinheiro(resolvidas.map((l) => l.valorTotal)),
    inicio: entrada.planilha.inicio,
    referencia,
  }
}
