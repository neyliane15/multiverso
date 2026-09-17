/**
 * Edge Function `importar-nfe` — módulo 3.1, importação de NFe.
 *
 * Recebe o XML da nota (colado no corpo ou já no bucket `notas`), lê com o
 * mesmo parser testado do front (`web/src/dados/nfe/`), encontra ou cria o
 * fornecedor pelo CNPJ, grava `notas_fiscais` + `nota_itens` e devolve o que
 * ficou pendente de vínculo.
 *
 * ---------------------------------------------------------------------------
 * Como publicar (a partir da **raiz do repositório**, para que os caminhos
 * relativos para `web/src/...` resolvam):
 *
 *   supabase functions deploy importar-nfe
 *
 * Plano B, se o bundler recusar os imports para fora de `supabase/functions/`:
 * copie `web/src/dados/nfe/{parsearXml,conversaoUnidade,casarProdutos}.ts` e
 * `web/src/util/formato.ts` para `supabase/functions/_compartilhado/`, troque os
 * três imports abaixo por `../_compartilhado/<arquivo>.ts` e faça o front
 * reexportar de lá — os testes continuam valendo, é o mesmo código.
 *
 * Como chamar:
 *
 *   POST https://<projeto>.supabase.co/functions/v1/importar-nfe
 *   Authorization: Bearer <access_token do usuário logado>
 *   { "restauranteId": "<uuid>", "xml": "<?xml ...?>" }
 *   { "restauranteId": "<uuid>", "arquivoUrl": "<restaurante>/<nome>.xml" }
 *
 * ---------------------------------------------------------------------------
 * Três decisões que valem explicação:
 *
 * 1. O cliente Supabase é criado com o **token de quem chamou**, nunca com a
 *    service role. Assim a RLS continua valendo: se o usuário não pode operar
 *    aquele restaurante, o insert falha — e é para falhar. Uma função com
 *    service role viraria um túnel por baixo de todas as políticas.
 *
 * 2. Item com casamento fraco entra com `produto_id` nulo, de propósito.
 *    Pendência é um incômodo de dois cliques; vínculo errado é CMV errado.
 *
 * 3. **Cabeçalho e item guardam números diferentes, e isso é intencional.**
 *    `notas_fiscais.valor_produtos` = `ICMSTot/vProd` e `notas_fiscais.valor_total`
 *    = `ICMSTot/vNF`: a nota é a verdade contábil e não se reescreve.
 *    Já `nota_itens.valor_total` recebe o **custo desembolsado** do item
 *    (vProd − desconto + ICMS-ST/IPI/II + frete e despesas rateadas), porque é
 *    dele que a coluna gerada `custo_convertido` tira o custo que
 *    `mv_atualiza_custo_medio` empurra para `produtos.custo_medio`. Num bar,
 *    onde quase toda bebida é ICMS-ST, usar `vProd` aqui subestimaria metade
 *    das compras e entregaria um CMV falso.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { ErroNfe, parsearXml, type NotaImportada } from '../../../web/src/dados/nfe/parsearXml.ts'
import { converterUnidade } from '../../../web/src/dados/nfe/conversaoUnidade.ts'
import {
  casarItem,
  type ApelidoConhecido,
  type ProdutoCandidato,
} from '../../../web/src/dados/nfe/casarProdutos.ts'

const CABECALHOS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET_NOTAS = 'notas'

interface CorpoRequisicao {
  restauranteId?: string
  xml?: string
  arquivoUrl?: string
  arquivoNome?: string
  /** Quando true, chave com DV errado aborta a importação em vez de virar aviso. */
  exigirChaveValida?: boolean
  /** Quando true, nota cancelada/denegada entra mesmo assim (só para conferência). */
  aceitarNaoAutorizada?: boolean
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function erro(mensagem: string, status: number, extra: Record<string, unknown> = {}): Response {
  return responder({ erro: mensagem, ...extra }, status)
}

/** '2026-03-12' -> '12/03/2026', sem depender do fuso do servidor. */
function dataBr(iso: string | null | undefined): string {
  if (!iso) return 'data desconhecida'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

/** Aceita tanto o caminho dentro do bucket quanto a URL pública inteira. */
function caminhoNoBucket(arquivoUrl: string): string {
  const marcador = `/${BUCKET_NOTAS}/`
  const posicao = arquivoUrl.indexOf(marcador)
  const caminho = posicao >= 0 ? arquivoUrl.slice(posicao + marcador.length) : arquivoUrl
  return caminho.replace(/^\/+/, '').split('?')[0] ?? caminho
}

async function baixarXml(cliente: SupabaseClient, arquivoUrl: string): Promise<string> {
  const { data, error } = await cliente.storage.from(BUCKET_NOTAS).download(caminhoNoBucket(arquivoUrl))
  if (error || !data) {
    throw new Error(`Não consegui baixar o arquivo em "${arquivoUrl}": ${error?.message ?? 'arquivo não encontrado'}.`)
  }
  return await data.text()
}

/**
 * Fornecedor pelo CNPJ dentro do restaurante. O índice único
 * (restaurante_id, documento) é quem garante que não nasce duplicado: se duas
 * importações correrem juntas, a segunda cai no conflito e relê a primeira.
 */
async function acharOuCriarFornecedor(
  cliente: SupabaseClient,
  restauranteId: string,
  nota: NotaImportada,
): Promise<string | null> {
  const documento = nota.emitente.documento
  if (!documento) return null

  const { data: existente, error: erroBusca } = await cliente
    .from('fornecedores')
    .select('id')
    .eq('restaurante_id', restauranteId)
    .eq('documento', documento)
    .maybeSingle()
  if (erroBusca) throw new Error(`Falha ao procurar o fornecedor: ${erroBusca.message}`)
  if (existente) return existente.id as string

  const { data: criado, error: erroInsert } = await cliente
    .from('fornecedores')
    .insert({
      restaurante_id: restauranteId,
      nome: nota.emitente.nomeFantasia ?? nota.emitente.razaoSocial,
      documento,
      inscricao: nota.emitente.inscricaoEstadual,
      endereco: nota.emitente.endereco,
    })
    .select('id')
    .single()

  if (erroInsert) {
    if (erroInsert.code === '23505') {
      const { data: concorrente } = await cliente
        .from('fornecedores')
        .select('id')
        .eq('restaurante_id', restauranteId)
        .eq('documento', documento)
        .maybeSingle()
      if (concorrente) return concorrente.id as string
    }
    throw new Error(`Falha ao cadastrar o fornecedor: ${erroInsert.message}`)
  }
  return criado.id as string
}

Deno.serve(async (requisicao: Request): Promise<Response> => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS_CORS })
  if (requisicao.method !== 'POST') return erro('Use POST para importar uma nota.', 405)

  const autorizacao = requisicao.headers.get('Authorization')
  if (!autorizacao) {
    return erro('Faltou o cabeçalho Authorization: entre no sistema e tente de novo.', 401)
  }

  const urlSupabase = Deno.env.get('SUPABASE_URL')
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!urlSupabase || !chaveAnon) {
    return erro('Função mal configurada: faltam SUPABASE_URL e SUPABASE_ANON_KEY.', 500)
  }

  // Token do chamador → a RLS decide o que ele pode ler e gravar.
  const cliente = createClient(urlSupabase, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let corpo: CorpoRequisicao
  try {
    corpo = (await requisicao.json()) as CorpoRequisicao
  } catch {
    return erro('Corpo da requisição não é um JSON válido.', 400)
  }

  const restauranteId = corpo.restauranteId?.trim()
  if (!restauranteId) return erro('Informe o restauranteId.', 400)
  if (!corpo.xml && !corpo.arquivoUrl) return erro('Envie o xml ou o arquivoUrl da nota.', 400)

  const { data: dadosUsuario, error: erroUsuario } = await cliente.auth.getUser()
  if (erroUsuario || !dadosUsuario.user) {
    return erro('Sessão inválida ou expirada: entre de novo.', 401)
  }
  const usuarioId = dadosUsuario.user.id

  let xml: string
  try {
    xml = corpo.xml ?? (await baixarXml(cliente, corpo.arquivoUrl as string))
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : 'Falha ao ler o arquivo da nota.', 400)
  }

  let nota: NotaImportada
  try {
    nota = parsearXml(xml, {
      exigirChaveValida: corpo.exigirChaveValida === true,
      aceitarNaoAutorizada: corpo.aceitarNaoAutorizada === true,
    })
  } catch (falha) {
    if (falha instanceof ErroNfe) return erro(falha.message, 422, { codigo: falha.codigo })
    return erro(falha instanceof Error ? falha.message : 'Não foi possível ler o XML.', 422)
  }

  const avisos = [...nota.avisos]

  // Duplicidade: o índice único (restaurante_id, chave_acesso) já barraria, mas
  // a mensagem seria SQL cru. Melhor dizer quando a nota entrou.
  const { data: jaImportada, error: erroDuplicidade } = await cliente
    .from('notas_fiscais')
    .select('id, emitida_em, criado_em')
    .eq('restaurante_id', restauranteId)
    .eq('chave_acesso', nota.chaveAcesso)
    .maybeSingle()
  if (erroDuplicidade) return erro(`Falha ao conferir a nota: ${erroDuplicidade.message}`, 500)
  if (jaImportada) {
    return erro(`Esta nota já foi importada em ${dataBr(String(jaImportada.criado_em).slice(0, 10))}`, 409, {
      notaId: jaImportada.id,
      chaveAcesso: nota.chaveAcesso,
    })
  }

  let fornecedorId: string | null
  try {
    fornecedorId = await acharOuCriarFornecedor(cliente, restauranteId, nota)
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : 'Falha no fornecedor da nota.', 400)
  }
  if (!fornecedorId) {
    avisos.push('A nota ficou sem fornecedor: o XML não trouxe CNPJ. Escolha o fornecedor à mão.')
  }

  const { data: notaCriada, error: erroNota } = await cliente
    .from('notas_fiscais')
    .insert({
      restaurante_id: restauranteId,
      fornecedor_id: fornecedorId,
      origem: 'xml',
      status: 'importada',
      chave_acesso: nota.chaveAcesso,
      numero: nota.numero,
      serie: nota.serie,
      modelo: nota.modelo,
      emitida_em: nota.emitidaEm,
      valor_produtos: nota.totais.valorProdutos,
      valor_frete: nota.totais.valorFrete,
      valor_desconto: nota.totais.valorDesconto,
      valor_outros: nota.totais.valorOutros,
      valor_total: nota.totais.valorTotal,
      // O cabeçalho é cópia fiel do ICMSTot: não recebe imposto de item nem
      // rateio. Quem carrega o desembolso é nota_itens.valor_total.
      arquivo_url: corpo.arquivoUrl ?? null,
      arquivo_nome: corpo.arquivoNome ?? null,
      xml_bruto: xml,
      criado_por: usuarioId,
    })
    .select('id')
    .single()

  if (erroNota || !notaCriada) {
    if (erroNota?.code === '23505') {
      return erro(`Esta nota já foi importada em ${dataBr(nota.emitidaEm)}`, 409, {
        chaveAcesso: nota.chaveAcesso,
      })
    }
    return erro(`Não consegui gravar a nota: ${erroNota?.message ?? 'erro desconhecido'}.`, 400)
  }
  const notaId = notaCriada.id as string

  // Cadastro e aprendizado do de-para, já filtrados pela RLS do restaurante.
  const [{ data: produtos, error: erroProdutos }, { data: apelidos }] = await Promise.all([
    cliente
      .from('produtos')
      .select('id, nome, codigo, codigo_barras, unidade')
      .eq('restaurante_id', restauranteId)
      .eq('ativo', true)
      .limit(5000),
    cliente
      .from('produto_apelidos')
      .select('produto_id, fornecedor_id, apelido, codigo_fornecedor, fator_conversao, unidade')
      .eq('restaurante_id', restauranteId)
      .limit(10000),
  ])
  if (erroProdutos) {
    await cliente.from('notas_fiscais').delete().eq('id', notaId)
    return erro(`Não consegui ler o cadastro de produtos: ${erroProdutos.message}`, 400)
  }

  const candidatos = (produtos ?? []) as ProdutoCandidato[]
  const conhecidos = (apelidos ?? []) as ApelidoConhecido[]

  const linhas = nota.itens.map((item) => {
    const casamento = casarItem(
      { descricao: item.descricao, ean: item.ean, codigoFornecedor: item.codigoFornecedor },
      { produtos: candidatos, apelidos: conhecidos, fornecedorId },
    )
    const produto = candidatos.find((p) => p.id === casamento.produtoId)
    const conversao = converterUnidade({
      unidadeComercial: item.unidade,
      descricao: item.descricao,
      unidadeCadastro: produto?.unidade ?? casamento.unidadeSugerida,
    })

    // Fator que um humano já conferiu (veio do apelido) vale mais que palpite.
    const fator =
      casamento.motivo === 'apelido_fornecedor' && casamento.fatorSugerido && casamento.fatorSugerido > 0
        ? casamento.fatorSugerido
        : conversao.fator

    if (conversao.aviso && casamento.produtoId) {
      avisos.push(`Item ${item.ordem} (${item.descricao}): ${conversao.aviso}`)
    }

    return {
      linha: {
        nota_id: notaId,
        produto_id: casamento.produtoId,
        descricao: item.descricao,
        codigo_fornecedor: item.codigoFornecedor,
        ncm: item.ncm,
        cfop: item.cfop,
        ean: item.ean,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valor_unitario: item.valorUnitario,
        valor_desconto: item.valorDesconto,
        // Desembolso, não vProd: é daqui que sai custo_convertido e, depois,
        // produtos.custo_medio. Ver a decisão 3 no cabeçalho.
        valor_total: item.custoDesembolsado,
        fator_conversao: fator,
        ordem: item.ordem,
      },
      resumo: {
        ordem: item.ordem,
        descricao: item.descricao,
        produtoId: casamento.produtoId,
        confianca: casamento.confianca,
        motivo: casamento.motivo,
        explicacao: casamento.explicacao,
        fatorConversao: fator,
        valorProdutos: item.valorTotal,
        impostos: item.impostos,
        custoDesembolsado: item.custoDesembolsado,
        sugestoes: casamento.sugestoes,
      },
    }
  })

  const { error: erroItens } = await cliente.from('nota_itens').insert(linhas.map((l) => l.linha))
  if (erroItens) {
    // Nota sem item é pior que nota nenhuma: desfaz para o usuário reimportar.
    await cliente.from('notas_fiscais').delete().eq('id', notaId)
    return erro(`Não consegui gravar os itens da nota: ${erroItens.message}`, 400)
  }

  const itens = linhas.map((l) => l.resumo)
  return responder({
    notaId,
    chaveAcesso: nota.chaveAcesso,
    chaveValida: nota.chaveValida,
    fornecedorId,
    emitidaEm: nota.emitidaEm,
    situacao: nota.situacao,
    valorTotal: nota.totais.valorTotal,
    impostosItens: nota.totais.impostosItens,
    custoDesembolsado: nota.totais.custoDesembolsado,
    itens,
    total: itens.length,
    vinculados: itens.filter((i) => i.produtoId !== null).length,
    pendentes: itens.filter((i) => i.produtoId === null).length,
    avisos,
  })
})
