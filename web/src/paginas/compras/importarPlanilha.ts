/**
 * A gravação da planilha de compras: fornecedores, notas e itens.
 *
 * Mora aqui, e não em `consultas.ts`, pelo mesmo motivo que `gravar.ts`: não é
 * uma linha de tabela, é uma transação de várias etapas com tratamento de erro
 * próprio.
 *
 * **Em lote, nunca linha a linha.** São 133 notas e 693 itens no arquivo de
 * setembro; uma requisição por item seriam 693 idas ao servidor com a RLS
 * reavaliada em cada uma. Aqui são quatro: fornecedores que faltam, notas,
 * itens, e a leitura dos ids. O PostgREST aceita array no `insert` e devolve os
 * ids na mesma resposta.
 *
 * As notas nascem com status `importada`, como as do XML: elas só entram no CMV
 * depois de alguém LANÇAR cada uma, e `mv_lancar_nota` recusa nota com item
 * pendente. Isso é de propósito — a importação não decide que 342 itens sem
 * vínculo viraram custo de nada.
 */
import { supabase } from '@/dados/supabase'
import { casarCompraDaPlanilha } from '@/dados/planilha/dePara'
import { recalcularFatorAoVincular } from '@/dados/nfe/conversaoUnidade'
import type { ApelidoConhecido } from '@/dados/nfe/casarProdutos'
import { somarDinheiro, type PlanilhaDeCompras } from '@/dados/planilha/compras'
import type { Fornecedor, ProdutoCompleto } from '@/tipos/banco'
import { chaveBusca } from '@/util/formato'

export interface ResultadoDaImportacaoDeCompras {
  notas: number
  itens: number
  /** Itens que já nasceram apontando para um insumo. */
  vinculados: number
  /** Itens que precisam de vínculo à mão antes de a nota poder ser lançada. */
  pendentes: number
  /** Notas com ao menos um item pendente. */
  notasPendentes: number
  fornecedoresNovos: number
  total: number
  /** Nota que já existia com o mesmo número, fornecedor e emissão: não entrou de novo. */
  repetidas: { numero: string; fornecedor: string; emitidaEm: string }[]
}

export interface EntradaDaImportacaoDeCompras {
  restauranteId: string
  planilha: PlanilhaDeCompras
  arquivoNome: string
  /** O catálogo ativo, para o de-para. */
  produtos: ProdutoCompleto[]
  /** `produto_apelidos` do restaurante: o aprendizado das notas já conferidas. */
  apelidos: ApelidoConhecido[]
  fornecedores: Fornecedor[]
  /** Notas que já estão no banco, para não importar a mesma planilha duas vezes. */
  jaImportadas?: { numero: string | null; emitida_em: string; fornecedor_id: string | null }[]
  aoProgresso?: (passo: string) => void
}

function falhar(onde: string, erro: { message: string } | null): void {
  if (erro) throw new Error(`${onde}: ${erro.message}`)
}

/**
 * Garante que todo fornecedor da planilha exista, e devolve o id de cada um.
 *
 * O casamento é pelo DOCUMENTO quando ele existe — CNPJ é identidade e o nome
 * do mesmo emitente muda de grafia entre exportações ("HNK BR INDUSTRIA DE
 * BEBIDAS LTDA OpLog São Cristóvão RJ" é um nome de planilha, não de cadastro).
 * Sem documento, cai no nome normalizado.
 */
async function garantirFornecedores(
  entrada: EntradaDaImportacaoDeCompras,
): Promise<{ porChave: Map<string, string>; novos: number }> {
  const porDocumento = new Map<string, string>()
  const porNome = new Map<string, string>()
  for (const f of entrada.fornecedores) {
    if (f.documento) porDocumento.set(f.documento, f.id)
    porNome.set(chaveBusca(f.nome), f.id)
  }

  const faltam = new Map<string, { nome: string; documento: string | null }>()
  const porChave = new Map<string, string>()

  for (const nota of entrada.planilha.notas) {
    const chave = `${nota.fornecedorDocumento ?? ''}|${chaveBusca(nota.fornecedorNome)}`
    const achado =
      (nota.fornecedorDocumento ? porDocumento.get(nota.fornecedorDocumento) : undefined) ??
      porNome.get(chaveBusca(nota.fornecedorNome))
    if (achado) porChave.set(chave, achado)
    else faltam.set(chave, { nome: nota.fornecedorNome, documento: nota.fornecedorDocumento })
  }

  if (faltam.size > 0) {
    entrada.aoProgresso?.(`cadastrando ${faltam.size} fornecedor(es) que faltava(m)`)
    const { data, error } = await supabase
      .from('fornecedores')
      .insert(
        [...faltam.values()].map((f) => ({
          restaurante_id: entrada.restauranteId,
          nome: f.nome,
          documento: f.documento,
        })),
      )
      .select('id, nome, documento')
    falhar('não consegui cadastrar os fornecedores', error)

    const criados = (data ?? []) as Pick<Fornecedor, 'id' | 'nome' | 'documento'>[]
    for (const [chave, f] of faltam) {
      const criado = criados.find(
        (c) =>
          (f.documento !== null && c.documento === f.documento) ||
          chaveBusca(c.nome) === chaveBusca(f.nome),
      )
      if (criado) porChave.set(chave, criado.id)
    }
  }

  return { porChave, novos: faltam.size }
}

/**
 * As notas que o banco JÁ tem na janela de emissão da planilha.
 *
 * Lida do servidor na hora de gravar, e paginada, porque a trava contra importar
 * o mesmo mês duas vezes depende dela. Duas coisas davam errado antes, e as
 * duas são silenciosas:
 *
 * - o histórico vinha do cache da tela (`useCompras`), que podia estar frio
 *   desde antes de outra pessoa importar;
 * - e vinha TRUNCADO: medido com 1.001 notas e `db-max-rows = 1000`, que é o
 *   que o Supabase hospedado usa, a resposta é **200 com 1.000 linhas**. Sem
 *   erro e sem aviso.
 *
 * A janela é a da própria planilha (primeira e última emissão), então a
 * consulta é pequena mesmo numa casa com anos de histórico.
 */
async function notasQueJaExistem(
  restauranteId: string,
  de: string,
  ate: string,
): Promise<{ numero: string | null; emitida_em: string; fornecedor_id: string | null }[]> {
  const achadas: { numero: string | null; emitida_em: string; fornecedor_id: string | null }[] = []
  const PAGINA = 1000
  for (let inicio = 0; inicio < 50_000; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('notas_fiscais')
      .select('numero, emitida_em, fornecedor_id')
      .eq('restaurante_id', restauranteId)
      .gte('emitida_em', de)
      .lte('emitida_em', ate)
      .order('emitida_em')
      .order('id')
      .range(inicio, inicio + PAGINA - 1)
    falhar('não consegui conferir quais notas já estão no banco', error)
    const lote = (data ?? []) as typeof achadas
    achadas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return achadas
}

export async function importarComprasDaPlanilha(
  entrada: EntradaDaImportacaoDeCompras,
): Promise<ResultadoDaImportacaoDeCompras> {
  const { porChave, novos } = await garantirFornecedores(entrada)

  // A mesma planilha importada duas vezes dobraria as compras do mês. A nota de
  // planilha não tem chave de acesso, então o índice único da 0004 não a pega —
  // a trava aqui é número + fornecedor + emissão, que é a mesma identidade do
  // agrupamento.
  //
  // As duas fontes entram juntas: o que a tela já tinha em mão e o que o banco
  // responde AGORA para a janela de emissão da planilha. A segunda é a que vale
  // — ela não depende de cache nem do teto de linhas do PostgREST.
  const emissoes = entrada.planilha.notas.map((n) => n.emitidaEm).sort()
  const doBanco =
    emissoes.length === 0
      ? []
      : await notasQueJaExistem(
          entrada.restauranteId,
          emissoes[0] as string,
          emissoes[emissoes.length - 1] as string,
        )
  const jaExiste = new Set(
    [...(entrada.jaImportadas ?? []), ...doBanco].map(
      (n) => `${n.numero ?? ''}|${n.fornecedor_id ?? ''}|${n.emitida_em.slice(0, 10)}`,
    ),
  )
  const repetidas: ResultadoDaImportacaoDeCompras['repetidas'] = []

  const paraGravar = entrada.planilha.notas.filter((nota) => {
    const fornecedorId = porChave.get(
      `${nota.fornecedorDocumento ?? ''}|${chaveBusca(nota.fornecedorNome)}`,
    )
    if (jaExiste.has(`${nota.numero}|${fornecedorId ?? ''}|${nota.emitidaEm}`)) {
      repetidas.push({
        numero: nota.numero,
        fornecedor: nota.fornecedorNome,
        emitidaEm: nota.emitidaEm,
      })
      return false
    }
    return true
  })

  if (paraGravar.length === 0) {
    return {
      notas: 0,
      itens: 0,
      vinculados: 0,
      pendentes: 0,
      notasPendentes: 0,
      fornecedoresNovos: novos,
      total: 0,
      repetidas,
    }
  }

  entrada.aoProgresso?.(`gravando ${paraGravar.length} nota(s)`)
  const { data: criadas, error: erroNotas } = await supabase
    .from('notas_fiscais')
    .insert(
      paraGravar.map((nota) => ({
        restaurante_id: entrada.restauranteId,
        fornecedor_id:
          porChave.get(`${nota.fornecedorDocumento ?? ''}|${chaveBusca(nota.fornecedorNome)}`) ??
          null,
        origem: 'planilha',
        status: 'importada',
        numero: nota.numero,
        emitida_em: nota.emitidaEm,
        recebida_em: nota.recebidaEm,
        valor_produtos: nota.valorProdutos,
        valor_frete: nota.valorFrete,
        valor_desconto: nota.valorDesconto,
        valor_outros: nota.valorOutros,
        valor_total: nota.valorTotal,
        arquivo_nome: entrada.arquivoNome,
      })),
    )
    .select('id, numero, emitida_em, fornecedor_id')
  falhar('não consegui gravar as notas', erroNotas)

  const nascidas = (criadas ?? []) as {
    id: string
    numero: string | null
    emitida_em: string
    fornecedor_id: string | null
  }[]
  const idPorChave = new Map(
    nascidas.map((n) => [`${n.numero ?? ''}|${n.fornecedor_id ?? ''}|${n.emitida_em.slice(0, 10)}`, n.id]),
  )

  const catalogo = entrada.produtos.filter((p) => p.ativo)
  const linhas: Record<string, unknown>[] = []
  let vinculados = 0
  let pendentes = 0
  const notasComPendente = new Set<string>()

  for (const nota of paraGravar) {
    const fornecedorId =
      porChave.get(`${nota.fornecedorDocumento ?? ''}|${chaveBusca(nota.fornecedorNome)}`) ?? null
    const notaId = idPorChave.get(`${nota.numero}|${fornecedorId ?? ''}|${nota.emitidaEm}`)
    if (notaId === undefined) continue

    nota.itens.forEach((item, ordem) => {
      const casamento = casarCompraDaPlanilha(item.descricao, {
        produtos: catalogo,
        apelidos: entrada.apelidos,
      })
      const produto = catalogo.find((p) => p.id === casamento.produtoId)
      // O fator só se calcula com a unidade do cadastro na mão. Item pendente
      // entra com fator 1 e o `Conferencia` o recalcula no vínculo, que é o que
      // ele já faz com o item pendente do XML.
      const conversao = produto
        ? recalcularFatorAoVincular(
            { descricao: item.descricao, unidade: item.unidade },
            { unidade: produto.unidade },
          )
        : null

      if (casamento.produtoId) vinculados += 1
      else {
        pendentes += 1
        notasComPendente.add(notaId)
      }

      linhas.push({
        nota_id: notaId,
        produto_id: casamento.produtoId,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valor_unitario: item.valorUnitario,
        valor_total: item.valorTotal,
        fator_conversao: conversao?.fator ?? casamento.fatorSugerido ?? 1,
        operacao: item.operacao,
        ordem,
      })
    })
  }

  // Lotes de 500: uma requisição com 693 objetos passa de 300 KB de JSON, e o
  // PostgREST atrás de proxy (Kong, no Supabase) devolve 413 em corpo grande.
  // Partir aqui é mais barato que descobrir o teto na casa da cliente.
  entrada.aoProgresso?.(`gravando ${linhas.length} item(ns)`)
  for (let de = 0; de < linhas.length; de += 500) {
    const { error } = await supabase
      .from('nota_itens')
      .insert(linhas.slice(de, de + 500))
      .select('id')
    falhar('não consegui gravar os itens das notas', error)
  }

  return {
    notas: paraGravar.length,
    itens: linhas.length,
    vinculados,
    pendentes,
    notasPendentes: notasComPendente.size,
    fornecedoresNovos: novos,
    total: somarDinheiro(paraGravar.map((n) => n.valorTotal)),
    repetidas,
  }
}
