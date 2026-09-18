#!/usr/bin/env node
// ============================================================================
// Multiverso · conferencia do seed, sem banco de dados
// ----------------------------------------------------------------------------
// Le supabase/seed/0001_bar_do_zeca.sql como texto e o compara com o JSON de
// origem. O bloco `do $$ ... $$` no fim do SQL ja protege quem aplica, mas so
// depois de subir um Postgres; aqui a mesma pergunta e respondida em CI, em
// milissegundos, antes de o arquivo chegar perto de um banco.
//
// A conferencia e proposital e teimosamente burra: em vez de reaproveitar o
// modelo do gerador, ela reabre o SQL e reconta tudo do zero. Se o gerador
// tiver um erro de logica, um conferente que chame o gerador erraria junto.
// ============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const SQL_PADRAO = resolve(RAIZ, 'supabase/seed/0001_bar_do_zeca.sql')
export const JSON_PADRAO = resolve(RAIZ, 'dados/contagem-bar-do-zeca-2026-08.json')

export const TOTAL_ESPERADO = '78681.3573'
export const TOLERANCIA = '0.01'

// ------------------------------------------------------- aritmetica exata --
// Comparar dinheiro com ponto flutuante e pedir para um centavo sumir no meio
// de 868 multiplicacoes. Tudo aqui anda em BigInt numa escala fixa, do mesmo
// jeito que o numeric do Postgres.

const ESCALA = 4n // casas do total, como em contagem_itens.total

/** '30.59' com casas=4 vira 305900n. */
export function paraEscala(literal, casas) {
  const s = String(literal).trim()
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`literal numerico invalido: ${literal}`)
  const [inteira, decimal = ''] = s.split('.')
  if (decimal.length > casas) throw new Error(`${literal} tem mais de ${casas} casas decimais`)
  return BigInt(inteira + decimal.padEnd(casas, '0'))
}

/** round(quantidade * custo, 4) meio-para-cima, como o round() do numeric. */
function totalDaLinha(quantidade, custo) {
  const q = paraEscala(quantidade, 4) // numeric(14,4)
  const c = paraEscala(custo, 6) //      numeric(14,6)
  const produto = q * c // escala 10
  const divisor = 10n ** 6n // volta para a escala 4
  return (produto + divisor / 2n) / divisor
}

const formata = (valor) => {
  const base = 10n ** ESCALA
  return `${valor / base}.${String(valor % base).padStart(Number(ESCALA), '0')}`
}

// -------------------------------------------------------------- leitura ----

/**
 * Le um literal SQL ate o fechamento correto, tratando '' como aspa escapada.
 * Se algum nome tiver ficado com aspas quebradas, e aqui que a leitura sai do
 * lugar — e a contagem de linhas do bloco deixa de bater.
 */
function lerTupla(texto, inicio) {
  const valores = []
  let atual = ''
  let foiTexto = false
  let emTexto = false
  let i = inicio + 1 // pula o '('

  const fecha = () => {
    // Literal de texto sai como veio; numero, true e null saem sem espacos.
    valores.push(foiTexto ? atual : atual.trim())
    atual = ''
    foiTexto = false
  }

  while (i < texto.length) {
    const ch = texto[i]
    if (emTexto) {
      if (ch === "'") {
        if (texto[i + 1] === "'") { atual += "'"; i += 2; continue } // aspa escapada
        emTexto = false
        i += 1
        continue
      }
      atual += ch
      i += 1
      continue
    }
    if (ch === "'") {
      // So pode haver espaco entre a virgula e a abertura do literal; qualquer
      // outra coisa e sinal de que a leitura saiu do lugar.
      if (atual.trim() !== '') throw new Error(`lixo antes de um literal de texto: ${atual.trim()}`)
      atual = ''
      emTexto = true
      foiTexto = true
      i += 1
      continue
    }
    if (ch === ',') { fecha(); i += 1; continue }
    if (ch === ')') { fecha(); return { valores, fim: i + 1 } }
    atual += ch
    i += 1
  }
  throw new Error('tupla sem fechamento: o arquivo tem aspas desbalanceadas')
}

/** Todos os INSERTs de um trecho, com colunas e linhas ja separadas. */
export function lerInserts(trecho) {
  const inserts = []
  const re = /insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*values\s*/gi
  let m
  while ((m = re.exec(trecho)) !== null) {
    const colunas = m[2].split(',').map((c) => c.trim())
    const linhas = []
    let i = re.lastIndex
    for (;;) {
      while (i < trecho.length && /[\s,]/.test(trecho[i])) i += 1
      if (trecho[i] !== '(') break
      const { valores, fim } = lerTupla(trecho, i)
      if (valores.length !== colunas.length) {
        throw new Error(`${m[1]}: linha com ${valores.length} valores para ${colunas.length} colunas`)
      }
      linhas.push(Object.fromEntries(colunas.map((c, k) => [c, valores[k]])))
      i = fim
    }
    inserts.push({ tabela: m[1], colunas, linhas })
    re.lastIndex = i
  }
  return inserts
}

/** Recorta um bloco marcado com -- @bloco:nome ... -- @fim:nome. */
export function bloco(sql, nome) {
  const inicio = sql.indexOf(`-- @bloco:${nome}`)
  const fim = sql.indexOf(`-- @fim:${nome}`)
  if (inicio < 0 || fim < 0) throw new Error(`bloco ${nome} nao encontrado no SQL`)
  return sql.slice(inicio, fim)
}

/** Todas as linhas inseridas num bloco (ele pode ter varios INSERTs em lote). */
export function linhasDoBloco(sql, nome) {
  return lerInserts(bloco(sql, nome)).flatMap((i) => i.linhas)
}

// ----------------------------------------------------------- conferencia ---

export function conferirSeed({ sqlPath = SQL_PADRAO, jsonPath = JSON_PADRAO } = {}) {
  const sql = readFileSync(sqlPath, 'utf8')
  const dados = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const erros = []
  const exige = (condicao, mensagem) => { if (!condicao) erros.push(mensagem) }

  // Aspa mal escapada nao produz um erro sutil mais adiante: ela quebra a
  // leitura do arquivo aqui mesmo. Vira relatorio em vez de excecao para o
  // conferente falar a mesma lingua nos dois casos.
  let categorias, setores, produtos, vinculos, itens
  try {
    categorias = linhasDoBloco(sql, 'categorias')
    setores = linhasDoBloco(sql, 'setores')
    produtos = linhasDoBloco(sql, 'produtos')
    vinculos = linhasDoBloco(sql, 'produto_setores')
    itens = linhasDoBloco(sql, 'contagem_itens')
  } catch (erro) {
    return { ok: false, erros: [`SQL ilegivel: ${erro.message}`], resumo: null }
  }

  // ------------------------------------------------------------- o total --
  const total = itens.reduce((acc, i) => acc + totalDaLinha(i.quantidade, i.custo_unitario), 0n)
  const esperado = paraEscala(TOTAL_ESPERADO, Number(ESCALA))
  const tolerancia = paraEscala(TOLERANCIA, Number(ESCALA))
  const desvio = total > esperado ? total - esperado : esperado - total
  exige(desvio <= tolerancia, `total dos itens e ${formata(total)}, esperado ${TOTAL_ESPERADO}`)

  // A planilha tem de fechar com o SQL tambem pelo lado dela.
  const totalJson = dados.linhas.reduce(
    (acc, l) => acc + totalDaLinha(l.quantidade.toFixed(4), l.custo_unitario.toFixed(6)), 0n,
  )
  exige(totalJson === esperado, `o proprio JSON soma ${formata(totalJson)}, esperado ${TOTAL_ESPERADO}`)

  // ---------------------------------------------------------- quantidades --
  // As tres linhas a menos sao os pares produto x setor que a planilha repete;
  // o schema so admite um por par, e as repetidas estao zeradas.
  const paresNaPlanilha = new Set(dados.linhas.map((l) => `${l.produto}||${l.setor}`))
  exige(categorias.length === dados.categorias.length,
    `${categorias.length} categorias no SQL, ${dados.categorias.length} no JSON`)
  exige(setores.length === dados.setores.length,
    `${setores.length} setores no SQL, ${dados.setores.length} no JSON`)
  exige(produtos.length === dados.produtos.length,
    `${produtos.length} produtos no SQL, ${dados.produtos.length} no JSON`)
  exige(vinculos.length === paresNaPlanilha.size,
    `${vinculos.length} vinculos no SQL, ${paresNaPlanilha.size} pares distintos no JSON`)
  exige(itens.length === vinculos.length,
    `${itens.length} itens de contagem para ${vinculos.length} vinculos: a folha tem de espelhar o cadastro`)

  // ---------------------------------------------------------------- nomes --
  // Se alguma aspa tivesse escapado errado, o nome sairia truncado ou colado no
  // seguinte, e esta comparacao exata nao passaria.
  const nomesJson = new Set(dados.produtos.map((p) => p.nome))
  const nomesSql = new Set(produtos.map((p) => p.nome))
  for (const nome of nomesJson) {
    if (!nomesSql.has(nome)) erros.push(`produto ausente ou com nome corrompido no SQL: ${nome}`)
  }
  for (const nome of nomesSql) {
    if (!nomesJson.has(nome)) erros.push(`produto no SQL que nao existe no JSON: ${nome}`)
  }
  exige(nomesSql.size === produtos.length, 'ha nomes de produto repetidos no SQL')

  // Toda aspa dentro de literal tem de estar dobrada. Uma aspa solta faria o
  // Postgres engolir o resto do arquivo como se fosse texto.
  const comAspas = [...nomesJson].filter((n) => n.includes("'"))
  for (const nome of comAspas) {
    const escapado = nome.replaceAll("'", "''")
    if (!sql.includes(`'${escapado}'`)) erros.push(`nome com aspas mal escapado no SQL: ${nome}`)
  }

  // ------------------------------------------------------- integridade de ids
  const idsCategorias = new Set(categorias.map((c) => c.id))
  const idsSetores = new Set(setores.map((s) => s.id))
  const idsProdutos = new Set(produtos.map((p) => p.id))

  for (const p of produtos) {
    if (!idsCategorias.has(p.categoria_id)) erros.push(`produto ${p.nome} aponta para categoria inexistente`)
  }
  for (const v of vinculos) {
    if (!idsProdutos.has(v.produto_id)) erros.push(`vinculo com produto fora do bloco de produtos: ${v.produto_id}`)
    if (!idsSetores.has(v.setor_id)) erros.push(`vinculo com setor inexistente: ${v.setor_id}`)
  }

  const paresVinculo = new Set(vinculos.map((v) => `${v.produto_id}||${v.setor_id}`))
  exige(paresVinculo.size === vinculos.length, 'ha par produto x setor repetido em produto_setores')

  const paresItem = new Set()
  for (const i of itens) {
    if (!idsProdutos.has(i.produto_id)) erros.push(`item da contagem com produto fora do cadastro: ${i.produto_id}`)
    if (!idsSetores.has(i.setor_id)) erros.push(`item da contagem com setor inexistente: ${i.setor_id}`)
    const par = `${i.produto_id}||${i.setor_id}`
    if (!paresVinculo.has(par)) erros.push(`item da contagem sem vinculo produto_setores: ${par}`)
    if (paresItem.has(par)) erros.push(`item repetido na contagem: ${par}`)
    paresItem.add(par)
  }

  // ------------------------------------------------------------ ordem/seq --
  const ordens = (linhas) => linhas.map((l) => Number(l.ordem)).sort((a, b) => a - b)
  const sequencial = (lista) => lista.every((v, i) => v === i + 1)
  exige(sequencial(ordens(categorias)), 'a ordem das categorias nao e sequencial a partir de 1')
  exige(sequencial(ordens(setores)), 'a ordem dos setores nao e sequencial a partir de 1')

  const coresCategorias = new Set(categorias.map((c) => c.cor))
  exige(coresCategorias.size === categorias.length, 'ha categorias com a mesma cor')
  for (const c of [...categorias, ...setores]) {
    if (!/^#[0-9a-f]{6}$/i.test(c.cor)) erros.push(`cor fora do formato hex: ${c.nome} = ${c.cor}`)
  }

  // ---------------------------------------------- ordem das instrucoes -----
  // Os itens precisam entrar com a contagem ainda aberta: o trigger
  // t_contagem_itens_bloqueio recusa qualquer escrita depois do fechamento.
  exige(sql.indexOf('-- @bloco:contagem_itens') < sql.indexOf('-- @bloco:fechamento'),
    'os itens sao inseridos depois do fechamento da contagem')
  exige(sql.indexOf('-- @bloco:fechamento') < sql.indexOf('-- @bloco:verificacao'),
    'a verificacao roda antes do fechamento')
  exige(sql.includes('raise exception') && sql.includes(TOTAL_ESPERADO),
    'o bloco de verificacao nao confere o total esperado')
  exige(/\bbegin;/.test(sql) && /\bcommit;\s*$/.test(sql.trim()),
    'o seed nao esta inteiro dentro de uma transacao')
  // Todo valor numerico tem de estar em decimal simples. Notacao cientifica
  // (1e-6) ate seria aceita pelo Postgres, mas ninguem confere um seed assim.
  const numericos = [
    ...produtos.map((p) => ['produtos.custo_medio', p.custo_medio]),
    ...vinculos.map((v) => ['produto_setores.custo', v.custo]),
    ...itens.flatMap((i) => [
      ['contagem_itens.quantidade', i.quantidade],
      ['contagem_itens.custo_unitario', i.custo_unitario],
    ]),
  ]
  for (const [campo, valor] of numericos) {
    if (!/^\d+(\.\d+)?$/.test(valor)) erros.push(`${campo} com literal invalido: ${valor}`)
  }

  return {
    ok: erros.length === 0,
    erros,
    resumo: {
      categorias: categorias.length,
      setores: setores.length,
      produtos: produtos.length,
      vinculos: vinculos.length,
      itens: itens.length,
      itensContados: itens.filter((i) => paraEscala(i.quantidade, 4) > 0n).length,
      total: formata(total),
      linhasNoJson: dados.linhas.length,
      paresRepetidosNoJson: dados.linhas.length - paresNaPlanilha.size,
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, erros, resumo } = conferirSeed()
  console.log(`conferindo ${SQL_PADRAO}`)
  for (const [chave, valor] of Object.entries(resumo ?? {})) {
    console.log(`  ${chave.padEnd(20, '.')} ${valor}`)
  }
  if (ok) {
    console.log('seed confere com a planilha.')
  } else {
    for (const erro of erros) console.error(`  ERRO: ${erro}`)
    process.exitCode = 1
  }
}
