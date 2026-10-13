// ============================================================================
// Multiverso · gerador do seed da contagem de OUTUBRO/2026 (Bar do Zeca)
// ----------------------------------------------------------------------------
// Le dados/contagem-bar-do-zeca-2026-10.json (ja extraido e conferido por
// dados/extrair-outubro.py + dados/normalizar-outubro.py) e escreve
// supabase/seed/0003_contagem_outubro.sql.
//
// Por que um gerador novo em vez de parametrizar o de agosto: a 0001 CRIA o
// restaurante, os setores, as categorias e o catalogo inteiro. A 0003 nao cria
// nada disso — ela chega num banco que ja tem 868 produtos e 4 setores, e o
// trabalho dela e outro:
//
//   · acrescentar os produtos que outubro trouxe de novo;
//   · atualizar o custo do cadastro com os precos de outubro (decisao da
//     cliente: "atualize os custos tambem");
//   · gravar as 868 linhas da contagem de outubro;
//   · e nao tocar em uma linha da contagem de agosto, que esta fechada e vale
//     R$ 78.681,3573 — ela e o estoque inicial do CMV.
//
// O que e reaproveitado do gerar-seed.mjs, por import e sem alterar o arquivo:
// idDe (UUIDv5 do nome, no mesmo espaco de nomes), txt, num e RESTAURANTE_ID.
// E o que garante que o id de produto novo calculado aqui seja o MESMO que a
// carga de agosto calcularia para aquele nome.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { idDe, txt, num, RESTAURANTE_ID, TIPO_CONTAGEM } from './gerar-seed.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const ORIGEM_JSON = resolve(RAIZ, 'dados/contagem-bar-do-zeca-2026-10.json')
export const DESTINO_SQL = resolve(RAIZ, 'supabase/seed/0003_contagem_outubro.sql')

// A contagem de agosto e invariante desta carga. O numero esta aqui para o
// bloco de verificacao do SQL poder cobrar que ele nao se moveu — se a 0003
// encostar em agosto, a transacao cai.
export const REFERENCIA_AGOSTO = '2026-08-31'
export const TOTAL_AGOSTO = 78681.3573

// Quantos produtos o catalogo tinha ANTES desta carga, conforme o retrato do
// banco em dados/catalogo-atual.json. Esta duplicado aqui de proposito: o JSON
// traz o numero medido e esta constante traz o numero esperado, e montarModelo
// recusa a gerar SQL se os dois discordarem. E o que torna possivel cobrar no
// SQL "877 = 868 + 9" em vez de "deu algum numero".
export const PRODUTOS_ANTES = 868

const SEP = '||'

// ------------------------------------------------------------- utilidades --
// emLotes e bloco nao sao exportados pelo gerar-seed.mjs, e o briefing pede
// para nao alterar aquele arquivo. Sao oito linhas; ficam aqui com o mesmo
// comportamento, inclusive os marcadores @bloco/@fim que scripts/conferir-seed
// usa para ler o SQL sem banco.
function emLotes(linhas, tamanho = 200) {
  const lotes = []
  for (let i = 0; i < linhas.length; i += tamanho) lotes.push(linhas.slice(i, i + tamanho))
  return lotes
}

function bloco(nome, tabela, colunas, linhas, conflito) {
  const partes = [`-- @bloco:${nome}`]
  for (const lote of emLotes(linhas)) {
    partes.push(`insert into ${tabela} (${colunas.join(', ')}) values`)
    partes.push(lote.map((l) => `  (${l})`).join(',\n'))
    partes.push(conflito + ';')
    partes.push('')
  }
  partes.push(`-- @fim:${nome}`)
  return partes.join('\n')
}

/**
 * `update ... from (values ...)` em lotes, no mesmo espirito do bloco().
 *
 * Cada linha e {sql, nota}. A `nota` vira comentario no fim da linha: uma lista
 * de 29 pares de UUID e ilegivel para quem revisa o arquivo, e e justamente o
 * custo do cadastro que esta sendo mexido ali. Com o nome do produto ao lado, a
 * cliente consegue conferir o SQL contra a secao 8 do relatorio linha por linha.
 */
function blocoUpdate(nome, corpo, linhas, colunasDoValues, condicao, tamanho = 200) {
  const partes = [`-- @bloco:${nome}`]
  for (const lote of emLotes(linhas, tamanho)) {
    partes.push(corpo)
    partes.push('  from (values')
    partes.push(lote.map((l, i) => {
      const virgula = i < lote.length - 1 ? ',' : ''
      return `    (${l.sql})${virgula}${l.nota ? `  -- ${l.nota}` : ''}`
    }).join('\n'))
    partes.push(`  ) as v(${colunasDoValues.join(', ')})`)
    partes.push(` ${condicao};`)
    partes.push('')
  }
  partes.push(`-- @fim:${nome}`)
  return partes.join('\n')
}

// ------------------------------------------------------------- modelo/dados -

/**
 * Confere o JSON de origem e monta as listas que viram SQL.
 *
 * Tudo que puder ser conferido antes de escrever uma linha de SQL e conferido
 * aqui: id de produto novo que nao bate com idDe, par (produto, setor)
 * repetido, total que nao fecha, custo zero entrando como atualizacao. SQL
 * bonito sobre dado torto e pior do que SQL nenhum.
 */
export function montarModelo(dados) {
  if (dados.restaurante_id !== RESTAURANTE_ID) {
    throw new Error(`JSON de outro restaurante: ${dados.restaurante_id}`)
  }

  if (dados.diagnostico.produtos_no_catalogo_antes !== PRODUTOS_ANTES) {
    throw new Error(`catalogo de origem tem ${dados.diagnostico.produtos_no_catalogo_antes} `
      + `produtos, e este gerador foi escrito para ${PRODUTOS_ANTES}`)
  }
  if (dados.diagnostico.vinculos_no_catalogo_antes !== PRODUTOS_ANTES) {
    throw new Error('catalogo de origem nao tem um vinculo por produto; '
      + 'a conta de vinculos do bloco de verificacao precisa ser revista')
  }

  const idDoSetor = new Map(dados.setores.map((s) => [s.nome, s.id]))
  const idDaCategoria = new Map(dados.categorias.map((c) => [c.nome, c.id]))

  // O id de setor NAO e idDe(nome): "Cozinha" nasceu como "Estoque Geral" na
  // 0001 e a 0002 so renomeou, entao o UUIDv5 dela e o do nome antigo. Por isso
  // o id vem do retrato do banco, carregado no JSON — derivar aqui apontaria
  // para um setor que nao existe e a carga iria para o lugar errado em silencio.
  for (const c of dados.categorias) {
    if (idDe('categoria', c.nome) !== c.id) {
      throw new Error(`categoria ${c.nome}: id ${c.id} nao e o UUIDv5 do nome`)
    }
  }

  const produtosNovos = dados.produtos_novos.map((p) => {
    const esperado = idDe('produto', p.nome)
    if (p.id !== esperado) {
      throw new Error(`produto novo ${p.nome}: id ${p.id} difere de idDe(produto) ${esperado}`)
    }
    if (!idDaCategoria.has(p.categoria)) {
      throw new Error(`produto novo ${p.nome}: categoria desconhecida ${p.categoria}`)
    }
    if (!idDoSetor.has(p.setor)) {
      throw new Error(`produto novo ${p.nome}: setor desconhecido ${p.setor}`)
    }
    if (idDoSetor.get(p.setor) !== p.setor_id) {
      throw new Error(`produto novo ${p.nome}: setor_id nao bate com o setor ${p.setor}`)
    }
    return { ...p, categoriaId: idDaCategoria.get(p.categoria) }
  })

  // Custos: so entram os que a planilha trouxe MAIOR QUE ZERO. Zero significa
  // "linha nao precificada" e nao pode apagar um custo real — e o normalizar
  // ja separou, mas a conta e refeita aqui porque custo zerado por engano e o
  // tipo de erro que ninguem ve no relatorio e aparece tres meses depois no CMV.
  const custos = dados.custos_atualizados.map((c) => {
    if (!(c.custo_outubro > 0)) {
      throw new Error(`custo de ${c.produto} / ${c.setor} nao e maior que zero: ${c.custo_outubro}`)
    }
    if (c.custo_outubro === c.custo_anterior) {
      throw new Error(`custo de ${c.produto} / ${c.setor} nao mudou; nao deveria estar na lista`)
    }
    return c
  })

  const custoMedio = dados.custo_medio_atualizado
  const custoFixo = dados.custo_fixo_recalculado

  // Itens da contagem. A folha de contagem tem de ser exatamente o cadastro de
  // produto x setor: um item por par, e nenhum par repetido.
  const itens = []
  const vistos = new Set()
  for (const l of dados.linhas) {
    const chave = l.produto_id + SEP + l.setor_id
    if (vistos.has(chave)) {
      throw new Error(`linha ${l.origem}: par produto x setor repetido (${l.produto} / ${l.setor})`)
    }
    vistos.add(chave)
    if (idDoSetor.get(l.setor) !== l.setor_id) {
      throw new Error(`linha ${l.origem}: setor_id nao bate com o setor ${l.setor}`)
    }
    itens.push(l)
  }

  // Soma como o banco vai somar: cada linha arredondada em 4 casas (a coluna
  // gerada contagem_itens.total), e so depois o acumulado.
  const soma = itens.reduce((acc, i) => acc + Math.round(i.quantidade * i.custo_unitario * 1e4) / 1e4, 0)
  const total = Math.round(soma * 1e4) / 1e4
  if (Math.abs(total - dados.total_contagem) > 0.01) {
    throw new Error(`total recalculado ${total} difere do JSON ${dados.total_contagem}`)
  }

  return {
    produtosNovos,
    custos,
    custoMedio,
    custoFixo,
    itens,
    total,
    itensContados: itens.filter((i) => i.quantidade > 0).length,
    produtosDepois: PRODUTOS_ANTES + produtosNovos.length,
    contagemId: idDe('contagem', `${TIPO_CONTAGEM}:${dados.referencia}`),
    contagemAgostoId: idDe('contagem', `${TIPO_CONTAGEM}:${REFERENCIA_AGOSTO}`),
    setoresUsados: dados.setores,
    categoriasUsadas: dados.categorias,
  }
}

// ----------------------------------------------------------------- escrita --

export function gerarSql(modelo, dados) {
  const R = txt(RESTAURANTE_ID)
  const C = txt(modelo.contagemId)
  const CARGA = `${txt(dados.carga_em)}::timestamptz`
  const total = modelo.total.toFixed(4)
  const p = []

  const sobem = modelo.custos.filter((c) => c.diferenca > 0).length
  const caem = modelo.custos.filter((c) => c.diferenca < 0).length

  p.push(`-- ============================================================================
-- Multiverso · seed 0003 · contagem de OUTUBRO/2026 · Bar do Zeca — Norte Shopping
-- ----------------------------------------------------------------------------
-- ARQUIVO GERADO por scripts/gerar-seed-outubro.mjs. Nao edite a mao: corrija o
-- JSON de origem ou o gerador e rode \`node scripts/gerar-seed-outubro.mjs\`.
--
-- Origem      : ${dados.origem}
--               extraida e conferida em dados/contagem-bar-do-zeca-2026-10.json
-- Cliente     : ${dados.restaurante}
-- Competencia : ${dados.competencia} — contagem mensal com referencia ${dados.referencia}
-- Total da contagem: ${total}   (planilha, Geral!B93: ${dados.total_planilha.toFixed(4)})
--
-- PRESSUPOE a 0001 (catalogo) e a 0002 (os 4 setores de hoje) ja aplicadas:
-- esta carga NAO cria restaurante, setor nem categoria. As 21 categorias e os
-- 4 setores ativos continuam os mesmos; nenhuma categoria nova foi criada.
--
-- O que este arquivo faz:
--   ${String(modelo.produtosNovos.length).padStart(3)} produtos novos (e ${modelo.produtosNovos.length} vinculos produto x setor novos)
--   ${String(modelo.custos.length).padStart(3)} custos de vinculo atualizados para os precos de outubro
--       (${sobem} subiram, ${caem} cairam; custo ZERO na planilha nao sobrescreve
--        custo real — zero e "linha nao precificada", nao "de graca")
--   ${String(modelo.custoMedio.length).padStart(3)} produtos com custo_medio atualizado (custo do setor principal)
--   ${String(modelo.custoFixo.length).padStart(3)} vinculos com custo_fixo recalculado
--   ${String(modelo.itens.length).padStart(3)} itens de contagem (${modelo.itensContados} com quantidade maior que zero)
--
-- O QUE ELE NAO FAZ
-- Nao encosta na contagem de agosto/2026. Ela esta fechada, vale
-- ${TOTAL_AGOSTO.toFixed(4)} e e o estoque inicial do CMV — o bloco de verificacao do fim
-- cobra esse numero e derruba a transacao se ele tiver se movido.
-- Nao desativa produto que outubro nao lista: a planilha nao listar um item nao
-- e a casa ter deixado de usa-lo.
-- Nao sobrescreve a UNIDADE de produto que ja existe. A unidade das abas
-- Porcionados / Massas / Molhos e derivada de "a linha tem numero na coluna
-- PORCAO?", o que muda de mes para mes; deixar isso reescrever o cadastro
-- estragaria o cadastro. As divergencias estao listadas na secao 9b de
-- dados/RELATORIO-OUTUBRO.txt para a cliente decidir item a item.
--
-- IDEMPOTENCIA
-- Todos os ids sao UUIDv5 derivados do nome e todo insert tem \`on conflict\`
-- apoiado em chave primaria ou indice unico. Os updates de custo levam
-- \`is distinct from\` na clausula where: reaplicar nao reescreve linha que ja
-- esta no valor de outubro, e por isso custo_atualizado_em nao se mexe de novo.
--
-- Como aplicar: veja supabase/seed/README.md.
-- ============================================================================

begin;
`)

  // ------------------------------------------------------- pre-condicoes --
  p.push(`-- @bloco:precondicoes
-- A 0003 edita um catalogo que ela nao criou. Se os setores ou as categorias
-- que ela vai usar nao estiverem la, os updates de custo casariam zero linhas e
-- a carga "passaria" sem ter feito nada. Melhor parar na cara.
do $$
declare
  v_faltando text;
begin
  if not exists (select 1 from restaurantes where id = ${R}) then
    raise exception '0003: o restaurante ${RESTAURANTE_ID} nao existe — aplique a 0001 primeiro';
  end if;

  select string_agg(x.nome, ', ') into v_faltando
    from (values
${modelo.setoresUsados.map((s) => `      (${txt(s.nome)}, ${txt(s.id)}::uuid)`).join(',\n')}
    ) as x(nome, id)
   where not exists (select 1 from setores s
                      where s.id = x.id and s.restaurante_id = ${R} and s.ativo);
  if v_faltando is not null then
    raise exception '0003: setor ativo ausente (%) — aplique a 0002 primeiro', v_faltando;
  end if;

  select string_agg(x.nome, ', ') into v_faltando
    from (values
${modelo.categoriasUsadas.map((c) => `      (${txt(c.nome)}, ${txt(c.id)}::uuid)`).join(',\n')}
    ) as x(nome, id)
   where not exists (select 1 from categorias c
                      where c.id = x.id and c.restaurante_id = ${R});
  if v_faltando is not null then
    raise exception '0003: categoria ausente (%)', v_faltando;
  end if;
end $$;
-- @fim:precondicoes
`)

  // ----------------------------------------------------- produtos novos --
  p.push(`-- Os ${modelo.produtosNovos.length} produtos que outubro trouxe e agosto nao tinha. Cada um entra numa
-- das 21 categorias que ja existem, e no setor em que essa categoria vive hoje:
${modelo.produtosNovos.map((x) => `--   · ${x.nome} — ${x.categoria} / ${x.setor} — ${x.unidade} R$ ${x.custo} (${x.origem})`).join('\n')}
--
-- custo_medio e unidade sao os da planilha de outubro, que e a unica fonte que
-- existe para eles. custo_atualizado_em ja nasce estampado: esse custo tem data.`)
  p.push(bloco(
    'produtos_novos',
    'produtos',
    ['id', 'restaurante_id', 'categoria_id', 'nome', 'unidade', 'custo_medio', 'custo_atualizado_em'],
    modelo.produtosNovos.map((x) => [
      txt(x.id), R, txt(x.categoriaId), txt(x.nome), txt(x.unidade), num(x.custo, 6), CARGA,
    ].join(', ')),
    `on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, custo_medio = excluded.custo_medio,
  custo_atualizado_em = excluded.custo_atualizado_em, ativo = true`,
  ))
  p.push('')

  p.push(`-- custo_fixo = false nos vinculos novos: o custo deles veio da planilha e e
-- preco de compra, logo deve acompanhar a proxima nota fiscal.`)
  p.push(bloco(
    'vinculos_novos',
    'produto_setores',
    ['produto_id', 'setor_id', 'unidade', 'custo', 'ordem', 'custo_fixo', 'custo_atualizado_em'],
    modelo.produtosNovos.map((x) => [
      txt(x.id), txt(x.setor_id), txt(x.unidade), num(x.custo, 6), x.ordem, false, CARGA,
    ].join(', ')),
    `on conflict (produto_id, setor_id) do update set
  unidade = excluded.unidade, custo = excluded.custo, ordem = excluded.ordem,
  custo_fixo = excluded.custo_fixo,
  custo_atualizado_em = excluded.custo_atualizado_em, ativo = true`,
  ))
  p.push('')

  // ---------------------------------------------------- custos do cadastro --
  p.push(`-- ---------------------------------------------------------------------------
-- OS CUSTOS DO CADASTRO PASSAM A SER OS DE OUTUBRO
--
-- Decisao da cliente ("atualize os custos tambem"). Tres cuidados que estao na
-- clausula where e nao no comentario:
--
--   1. so entram na lista os ${modelo.custos.length} pares cujo custo de outubro e MAIOR QUE ZERO e
--      diferente do atual. Zero na planilha e "linha nao precificada" — em
--      agosto categorias inteiras (APARAS, PROTEINAS FUNCIONARIO, SORVETES)
--      fecharam em R$ 0,00, e deixar isso virar custo apagaria preco real;
--   2. \`is distinct from\` faz o update ser uma operacao de convergencia: na
--      segunda passada ele casa zero linhas, e custo_atualizado_em fica com a
--      data da vez em que o valor realmente mudou;
--   3. custo_fixo NAO entra no where. A flag quer dizer "custo calculado pela
--      casa, nao acompanha nota fiscal" — e a planilha de outubro E a planilha
--      da casa: as abas Porcionados, Massas e Molhos sao exatamente onde esses
--      custos proprios sao mantidos. Fonte legitima para os dois tipos.
--
-- A lista completa, com custo anterior, custo novo, diferenca e percentual,
-- esta na secao 8 de dados/RELATORIO-OUTUBRO.txt. As variacoes acima de +/-50%
-- e as ${dados.unidades_divergentes.length} linhas em que a unidade de outubro difere da do cadastro estao
-- destacadas na secao 9, para a cliente revisar de olho aberto.
-- ---------------------------------------------------------------------------`)
  p.push(blocoUpdate(
    'custos_vinculos',
    `update produto_setores ps
   set custo = v.custo, custo_atualizado_em = ${CARGA}`,
    modelo.custos.map((c) => ({
      sql: [txt(c.produto_id), txt(c.setor_id), num(c.custo_outubro, 6)].join(', '),
      nota: `${c.produto} · ${c.setor} · ${c.unidade_cadastro} · `
        + `${c.custo_anterior} -> ${c.custo_outubro} (${c.percentual > 0 ? '+' : ''}${c.percentual}%)`
        + `${c.unidade_divergente ? ` · UNIDADE DIVERGE: planilha em ${c.unidade_outubro}` : ''}`,
    })),
    ['produto_id', 'setor_id', 'custo'],
    `where ps.produto_id = v.produto_id::uuid
   and ps.setor_id = v.setor_id::uuid
   and ps.custo is distinct from v.custo`,
  ))
  p.push('')

  p.push(`-- produtos.custo_medio = custo do setor principal (o vinculo de menor ordem),
-- a mesma regra que a 0001 usa para escolher o custo de referencia do cadastro.`)
  p.push(blocoUpdate(
    'custo_medio',
    `update produtos p
   set custo_medio = v.custo_medio, custo_atualizado_em = ${CARGA}`,
    modelo.custoMedio.map((c) => ({
      sql: [txt(c.produto_id), num(c.custo_medio_novo, 6)].join(', '),
      nota: `${c.produto} · setor principal ${c.setor} · `
        + `${c.custo_medio_anterior} -> ${c.custo_medio_novo}`,
    })),
    ['id', 'custo_medio'],
    `where p.id = v.id::uuid
   and p.restaurante_id = ${R}
   and p.custo_medio is distinct from v.custo_medio`,
  ))
  p.push('')

  // -------------------------------------------------------------- custo_fixo --
  p.push(`-- custo_fixo: a regra de agosto e "true quando o custo do setor difere do
-- custo_medio de referencia do produto". Depois da 0002 cada produto tem UM
-- vinculo, entao a regra crua daria false para todos — e aplicar isso apagaria a
-- marca dos 12 vinculos que a 0002 marcou, que sao justamente os custos
-- proprios da casa (ALECRIM (HORTIFRUTI), FILE DE TILAPIA (PORCIONADO),
-- CALDO DE CARNE (MOLHOS), ...). Entao a regra liga a flag e nunca a desliga:
--
--     custo_fixo = regra_de_agosto OR ja_estava_marcado
--
-- Nesta carga isso da ${modelo.custoFixo.length} vinculo(s) a mudar.`)
  if (modelo.custoFixo.length === 0) {
    p.push(`-- @bloco:custo_fixo
-- Nenhum vinculo muda de custo_fixo: os ${dados.diagnostico.vinculos_com_custo_fixo_antes} ja marcados continuam marcados e
-- nenhum custo novo passou a divergir do custo_medio do proprio produto.
-- @fim:custo_fixo`)
  } else {
    p.push(blocoUpdate(
      'custo_fixo',
      `update produto_setores ps
   set custo_fixo = v.custo_fixo`,
      modelo.custoFixo.map((c) => ({
        sql: [txt(c.produto_id), txt(c.setor_id), c.para].join(', '),
        nota: `${c.produto} · ${c.setor} · ${c.de} -> ${c.para}`,
      })),
      ['produto_id', 'setor_id', 'custo_fixo'],
      `where ps.produto_id = v.produto_id::uuid
   and ps.setor_id = v.setor_id::uuid
   and ps.custo_fixo is distinct from v.custo_fixo`,
    ))
  }
  p.push('')

  // -------------------------------------------------------------- contagem --
  p.push(`-- @bloco:contagem
-- A contagem nasce (ou volta a ser) ABERTA de proposito: o trigger
-- t_contagem_itens_bloqueio recusa insert, update e delete de item em contagem
-- fechada. Numa reaplicacao do seed, reabrir aqui e o que permite regravar os
-- itens; o fechamento vem depois deles, no fim do arquivo.
insert into contagens (id, restaurante_id, referencia, tipo, status, titulo, observacao)
values (
  ${C}, ${R}, date ${txt(dados.referencia)}, ${txt(TIPO_CONTAGEM)}, 'aberta',
  ${txt('Contagem mensal · Outubro/2026 · fechamento de estoque')},
  ${txt(`Importada da planilha do cliente (competencia ${dados.competencia}). `
    + `Os custos do cadastro foram atualizados com os precos desta planilha.`)}
)
on conflict (id) do update set
  referencia = excluded.referencia, tipo = excluded.tipo, titulo = excluded.titulo,
  observacao = excluded.observacao,
  status = 'aberta', fechada_em = null, fechado_por = null,
  total = 0, itens_contados = 0;

-- Sobra de carga anterior. Esta contagem tem exatamente as ${modelo.itens.length} linhas
-- que o arquivo lista adiante: qualquer outra linha e resto de uma carga
-- passada e sai agora.
--
-- Nao basta apagar o par que saiu do CADASTRO. O caso que ensinou isso foi o
-- desdobramento por medida: BARBECUE DE GOIABADA 600GR continua existindo no
-- cadastro, mas a linha de outubro passou a ser do BARBECUE DE GOIABADA (KG).
-- A linha velha ficava para tras, a contagem terminava com duas linhas onde
-- devia ter uma, e o total subia R$ 66,79 — o bloco de verificacao recusava a
-- carga inteira sem dizer o porque.
--
-- Por isso a condicao e a lista de pares desta carga, e nao o cadastro: assim
-- reaplicar converge para o conjunto certo mesmo quando a lista ENCOLHE, que e
-- justamente quando o resto passa despercebido.
delete from contagem_itens i
 where i.contagem_id = ${C}
   and (i.produto_id, i.setor_id) not in (
${modelo.itens.map((x) => `     (${txt(x.produto_id)}, ${txt(x.setor_id)})`).join(",\n")}
   );
-- @fim:contagem
`)

  p.push(`-- contagem_itens.total e coluna gerada — round(quantidade * custo_unitario, 4)
-- — por isso nao se escreve total aqui: ele nasce do banco, e e justamente isso
-- que torna a verificacao do fim do arquivo uma conferencia de verdade.
--
-- custo_unitario e o custo DA PLANILHA DE OUTUBRO, linha por linha. E ele que
-- da valor a contagem e alimenta o CMV, e e o mesmo numero que acabou de ser
-- gravado no cadastro nos ${modelo.custos.length} pares que mudaram de preco.`)
  p.push(bloco(
    'contagem_itens',
    'contagem_itens',
    ['contagem_id', 'produto_id', 'setor_id', 'quantidade', 'unidade', 'custo_unitario'],
    modelo.itens.map((i) => [
      C, txt(i.produto_id), txt(i.setor_id), num(i.quantidade, 4), txt(i.unidade), num(i.custo_unitario, 6),
    ].join(', ')),
    // A chave ganhou o lugar na migracao 0011. A carga nao tem estoque de
    // setor — a planilha nao tem esse nivel — entao todas as linhas entram com
    // estoque nulo, e o indice e `nulls not distinct` justamente para que duas
    // delas ainda contem como a mesma linha.
    `on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario`,
  ))
  p.push('')

  // ------------------------------------------------------------ fechamento --
  p.push(`-- @bloco:fechamento
-- Fecha SOMANDO o banco, nunca repetindo o numero da planilha: se o que entrou
-- nos itens nao der ${total}, a verificacao abaixo derruba a transacao.
-- A data de fechamento e a da contagem, e nao now(), para o historico do
-- modulo 2.2 e o CMV lerem outubro como outubro.
update contagens c
   set status = 'fechada',
       fechada_em = ${CARGA},
       total = (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id),
       itens_contados = (select count(*) from contagem_itens i
                          where i.contagem_id = c.id and i.quantidade > 0)
 where c.id = ${C};
-- @fim:fechamento
`)

  // ----------------------------------------------------------- verificacao --
  p.push(`-- @bloco:verificacao
-- Rede de seguranca: a carga so vale se bater com a planilha E se agosto nao
-- tiver se movido. Qualquer desvio aborta a transacao inteira.
do $$
declare
  v_total        numeric;
  v_itens        integer;
  v_produtos     integer;
  v_vinculos     integer;
  v_categorias   integer;
  v_setores      integer;
  v_status       text;
  v_total_agosto numeric;
  v_alvos        integer;
  v_aplicados    integer;
  v_zerados      integer;
begin
  select coalesce(sum(i.total), 0), count(*)
    into v_total, v_itens
    from contagem_itens i
   where i.contagem_id = ${C};

  select count(*) into v_produtos   from produtos   where restaurante_id = ${R};
  select count(*) into v_categorias from categorias where restaurante_id = ${R};
  select count(*) into v_setores    from setores    where restaurante_id = ${R} and ativo;
  select count(*) into v_vinculos
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
   where p.restaurante_id = ${R};
  select status into v_status from contagens where id = ${C};

  -- Tolerancia de um centavo: a planilha arredonda a exibicao e o banco
  -- arredonda cada linha em 4 casas. Diferenca maior que isso e erro de dado,
  -- nao de arredondamento.
  if abs(v_total - ${total}) > 0.01 then
    raise exception '0003: total da contagem de outubro e %, esperado ${total} (diferenca de %)',
      v_total, abs(v_total - ${total});
  end if;

  if v_itens <> ${modelo.itens.length} then
    raise exception '0003: % itens na contagem de outubro, esperado ${modelo.itens.length}', v_itens;
  end if;

  -- ${modelo.produtosDepois} = os ${PRODUTOS_ANTES} produtos que a 0001/0002 deixaram + os ${modelo.produtosNovos.length} de outubro.
  if v_produtos <> ${modelo.produtosDepois} then
    raise exception '0003: % produtos cadastrados, esperado ${modelo.produtosDepois}', v_produtos;
  end if;

  if v_vinculos <> ${modelo.produtosDepois} then
    raise exception '0003: % vinculos produto x setor, esperado ${modelo.produtosDepois}', v_vinculos;
  end if;

  if v_categorias <> ${modelo.categoriasUsadas.length} then
    raise exception '0003: % categorias, esperado ${modelo.categoriasUsadas.length} (nenhuma categoria nova foi criada)', v_categorias;
  end if;

  if v_setores <> ${modelo.setoresUsados.length} then
    raise exception '0003: % setores ativos, esperado ${modelo.setoresUsados.length}', v_setores;
  end if;

  if v_status is distinct from 'fechada' then
    raise exception '0003: a contagem de ${dados.referencia} ficou com status %, esperado fechada', v_status;
  end if;

  -- Os custos: os ${modelo.custos.length} pares da lista tem de existir e tem de estar valendo o
  -- preco de outubro. Um id errado faria o update casar zero linhas e a carga
  -- "passar" sem ter atualizado nada — isto e o que impede esse silencio.
  select count(*), count(*) filter (where ps.custo = x.custo)
    into v_alvos, v_aplicados
    from (values
${modelo.custos.map((c) => `      (${txt(c.produto_id)}::uuid, ${txt(c.setor_id)}::uuid, ${num(c.custo_outubro, 6)}::numeric)`).join(',\n')}
    ) as x(produto_id, setor_id, custo)
    join produto_setores ps
      on ps.produto_id = x.produto_id and ps.setor_id = x.setor_id;

  if v_alvos <> ${modelo.custos.length} then
    raise exception '0003: % dos ${modelo.custos.length} pares de custo existem em produto_setores', v_alvos;
  end if;
  if v_aplicados <> ${modelo.custos.length} then
    raise exception '0003: % dos ${modelo.custos.length} custos de outubro foram aplicados', v_aplicados;
  end if;

  -- Nenhum custo do cadastro pode ter virado zero por causa desta carga. A
  -- 0001 deixou 62 vinculos com custo zero (itens que a planilha nunca
  -- precificou); se este numero subir, algum zero da planilha de outubro passou
  -- por cima de preco real.
  select count(*) into v_zerados
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
   where p.restaurante_id = ${R} and ps.custo = 0;
  if v_zerados > ${dados.diagnostico.vinculos_com_custo_zero_antes} then
    raise exception '0003: % vinculos com custo zero, eram ${dados.diagnostico.vinculos_com_custo_zero_antes} antes da carga', v_zerados;
  end if;

  -- AGOSTO E INVARIANTE. Ela e o estoque inicial do CMV: se este numero se
  -- mover, a carga de outubro encostou onde nao devia.
  select total into v_total_agosto from contagens where id = ${txt(modelo.contagemAgostoId)};
  if v_total_agosto is null then
    raise exception '0003: a contagem de agosto/${REFERENCIA_AGOSTO} desapareceu';
  end if;
  if abs(v_total_agosto - ${TOTAL_AGOSTO.toFixed(4)}) > 0.01 then
    raise exception '0003: a contagem de agosto vale agora %, e tem de valer ${TOTAL_AGOSTO.toFixed(4)}',
      v_total_agosto;
  end if;

  raise notice '0003 ok: % produtos, % vinculos, % itens de outubro, total %, agosto intacto em %',
    v_produtos, v_vinculos, v_itens, v_total, v_total_agosto;
end $$;
-- @fim:verificacao

commit;
`)

  return p.join('\n')
}

// ------------------------------------------------------------------- main --

export function gerar() {
  const dados = JSON.parse(readFileSync(ORIGEM_JSON, 'utf8'))
  const modelo = montarModelo(dados)
  const sql = gerarSql(modelo, dados)
  mkdirSync(dirname(DESTINO_SQL), { recursive: true })
  writeFileSync(DESTINO_SQL, sql, 'utf8')
  return { modelo, sql }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { modelo } = gerar()
  console.log(`seed escrito em ${DESTINO_SQL}`)
  console.log(`  produtos novos ....... ${modelo.produtosNovos.length}`)
  console.log(`  vinculos novos ....... ${modelo.produtosNovos.length}`)
  console.log(`  custos atualizados ... ${modelo.custos.length}`)
  console.log(`  custo_medio .......... ${modelo.custoMedio.length}`)
  console.log(`  custo_fixo ........... ${modelo.custoFixo.length}`)
  console.log(`  itens ................ ${modelo.itens.length} (${modelo.itensContados} com quantidade > 0)`)
  console.log(`  total ................ ${modelo.total.toFixed(4)}`)
  console.log(`  produtos depois ...... ${modelo.produtosDepois}`)
  console.log(`  contagem outubro ..... ${modelo.contagemId}`)
  console.log(`  contagem agosto ...... ${modelo.contagemAgostoId} (invariante, ${TOTAL_AGOSTO.toFixed(4)})`)
}
