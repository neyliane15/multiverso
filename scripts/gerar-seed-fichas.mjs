// ============================================================================
// Multiverso · gerador do seed das FICHAS DE BEBIDA (Bar do Zeca Norte Shopping)
// ----------------------------------------------------------------------------
// Le dados/fichas-drinques.json (ja extraido e conferido por
// dados/extrair-fichas.py + dados/normalizar-fichas.py) e escreve
// supabase/seed/0004_fichas_drinques.sql.
//
// O que esta carga faz, e o que ela NAO faz:
//
//   · cria os produtos dos PREPAROS DA CASA (xarope, espuma, suco) — e so
//     esses. Nenhum outro produto e criado: os 83 insumos restantes ja estao no
//     catalogo que a 0001/0002/0003 deixaram, e e para eles que a ficha aponta;
//   · cria as fichas e os itens delas;
//   · NAO grava custo em lugar nenhum da ficha. O custo e lido na hora, de
//     `produtos.custo_medio`, por `mv_custo_do_produto`. Guardar congelaria o
//     numero no dia da carga, e a pergunta "vale a pena?" so faz sentido com o
//     custo de hoje;
//   · NAO encosta nas contagens. Agosto vale R$ 78.681,3573 e outubro
//     R$ 71.961,3510, e o bloco de verificacao cobra os dois.
//
// A LICAO QUE JA CUSTOU CARO NESTA SESSAO, e como ela esta resolvida aqui.
// A carga de outubro quebrou ao ser reaplicada depois que a lista de linhas
// ENCOLHEU, porque o `delete` cobria so um caso. `ficha_itens` tem o mesmo
// risco, e maior: o conjunto de itens de uma ficha e o que o ARQUIVO diz, e
// item que saiu da lista precisa sair do banco. Aqui sao dois movimentos, nessa
// ordem:
//
//   1. `insert ... on conflict (ficha_id, produto_id) do update` — o item que
//      continua na lista e atualizado NO LUGAR, mantendo o `id` dele. Nao e
//      firula: `ficha_itens.id` e o que a tela usa para editar a linha, e
//      trocar o id a cada carga invalidaria qualquer referencia.
//   2. `delete ... where ficha_id in (<as nossas>) and (ficha_id, produto_id)
//      not in (<os pares que o arquivo declara>)` — o item que SAIU do arquivo
//      sai do banco. O `delete` e por PAR e nao por ficha, entao ele cobre os
//      tres casos de uma vez: item removido, ficha que encolheu, e ficha que
//      trocou um produto por outro.
//
// O teste disso nao e ler o SQL: e aplicar, tirar um item do JSON, regerar,
// reaplicar e conferir o que sobrou. Esta no laudo, com os comandos.
//
// Reaproveitado do gerar-seed.mjs por import, sem alterar aquele arquivo:
// idDe (UUIDv5 do nome, no mesmo espaco de nomes), txt, num e RESTAURANTE_ID.
// E o que garante que o id do produto do preparo calculado aqui seja o MESMO
// que a carga de agosto calcularia para aquele nome.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { idDe, txt, num, RESTAURANTE_ID } from './gerar-seed.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const ORIGEM_JSON = resolve(RAIZ, 'dados/fichas-drinques.json')
export const DESTINO_SQL = resolve(RAIZ, 'supabase/seed/0004_fichas_drinques.sql')

// As duas contagens sao invariantes desta carga. Os numeros estao aqui para o
// bloco de verificacao do SQL poder cobrar que eles nao se moveram — se a 0004
// encostar numa contagem, a transacao cai.
export const TOTAL_AGOSTO = 78681.3573
export const TOTAL_OUTUBRO = 71961.3510

// Quantos produtos o catalogo tem ANTES desta carga (depois da 0003). Esta
// duplicado de proposito: o JSON traz o numero medido pelo normalizador e esta
// constante traz o numero esperado, e montarModelo recusa gerar SQL se os dois
// discordarem. E o que permite cobrar no SQL "891 = 879 + 12" em vez de "deu
// algum numero".
export const PRODUTOS_ANTES = 879

// Data da carga, estampada em custo_atualizado_em dos produtos de preparo. E a
// referencia da contagem de outubro e nao now(): reaplicar o seed em outro dia
// nao pode mudar o dado.
// O ROTULO DA POSSE desta carga, gravado em `fichas.origem_carga` pela migracao
// 0021. E ele que diz quais fichas esta carga pode apagar, e e um literal e nao
// uma conta: ele sobrevive a um renome feito na tela e nao depende de nenhuma
// convencao de prefixo entre cargas irmas.
export const CARGA = '0004'

export const CARGA_EM = '2026-10-01 23:59:00-03'

// ------------------------------------------------------------- utilidades --
// emLotes e bloco nao sao exportados pelo gerar-seed.mjs e o briefing pede para
// nao alterar aquele arquivo. Ficam aqui com o mesmo comportamento, inclusive
// os marcadores @bloco/@fim que scripts/conferir-seed usa para ler o SQL sem
// banco.
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

/** Lista de UUIDs quebrada em linhas legiveis, para o `in (...)` do delete. */
function listaDeIds(ids, porLinha = 3) {
  const linhas = []
  for (let i = 0; i < ids.length; i += porLinha) {
    linhas.push('    ' + ids.slice(i, i + porLinha).map((x) => `'${x}'`).join(', '))
  }
  return linhas.join(',\n')
}

// ------------------------------------------------------------- modelo/dados -
export function montarModelo(dados) {
  if (dados.restaurante_id !== RESTAURANTE_ID) {
    throw new Error(`JSON e de outro restaurante: ${dados.restaurante_id}`)
  }
  const antes = dados.catalogo.produtos_no_catalogo_efetivo
  if (antes !== PRODUTOS_ANTES) {
    throw new Error(
      `o JSON diz que o catalogo tem ${antes} produtos e este gerador espera ` +
      `${PRODUTOS_ANTES}. Reveja o de-para antes de gerar SQL.`)
  }

  // ------------------------------------------------- produtos dos preparos -
  // Saida (a) do briefing: o preparo da casa vira produto, com custo_fixo. A
  // categoria e o setor sao os que JA existem — esta carga nao cria nem um
  // nem outro, e o bloco de verificacao cobra que os numeros deles nao mudaram.
  const preparos = dados.produtos_novos.map((p) => ({
    id: idDe('produto', p.nome),
    nome: p.nome,
    categoriaId: idDe('categoria', p.categoria),
    categoria: p.categoria,
    setorId: idDe('setor', p.setor),
    setor: p.setor,
    unidade: p.unidade,
    custo: p.custo,
    usadoPor: p.usado_por.length,
  }))

  // ------------------------------------------------------ fichas e itens --
  // `ordem` e por grupo e depois por nome: a tela agrupa por `grupo`, e dentro
  // do grupo a ordem alfabetica e a unica estavel que nao exige a cliente
  // arrastar 79 linhas.
  const porGrupo = new Map()
  for (const f of dados.fichas) {
    if (!porGrupo.has(f.grupo)) porGrupo.set(f.grupo, [])
    porGrupo.get(f.grupo).push(f)
  }
  const fichas = []
  for (const grupo of [...porGrupo.keys()].sort()) {
    const lista = porGrupo.get(grupo).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    lista.forEach((f, i) => {
      fichas.push({
        id: idDe('ficha', f.nome),
        nome: f.nome,
        grupo: f.grupo,
        descricao: f.descricao,
        modoPreparo: f.modo_preparo,
        rendimento: f.rendimento,
        unidadeRendimento: f.unidade_rendimento,
        precoVenda: f.preco_venda,
        cmvAlvo: f.cmv_alvo,
        ordem: i + 1,
        custoEsperado: f.custo_nosso,
        itens: f.itens.map((it) => ({
          produtoId: it.produto_id ?? idDe('produto', it.produto),
          produto: it.produto,
          quantidade: it.quantidade,
          unidade: it.unidade,
          perda: it.perda_percentual,
          ordem: it.ordem,
          // A observacao e o nome do componente NO PDV. Sem ela a ficha diz
          // "GIN ARPO 5 LT" e ninguem acha a linha correspondente no PDF; com
          // ela a conferencia contra a origem e linha a linha.
          observacao: `PDV: ${it.componentes_pdv.join(' + ')}`,
        })),
      })
    })
  }

  const itens = fichas.flatMap((f) => f.itens.map((i) => ({ ...i, fichaId: f.id })))
  if (itens.length !== dados.resumo.itens) {
    throw new Error(`modelo com ${itens.length} itens e o JSON diz ${dados.resumo.itens}`)
  }
  if (fichas.length !== dados.resumo.fichas_de_bebida) {
    throw new Error(`modelo com ${fichas.length} fichas e o JSON diz ${dados.resumo.fichas_de_bebida}`)
  }

  // Nenhum item pode apontar para produto que esta ficha nao conhece: ou e id
  // do catalogo (que veio do retrato) ou e preparo criado aqui.
  const idsPreparo = new Set(preparos.map((p) => p.id))
  const semId = itens.filter((i) => !i.produtoId)
  if (semId.length) throw new Error(`item sem produto_id: ${semId[0].produto}`)
  const preparosUsados = new Set(itens.filter((i) => idsPreparo.has(i.produtoId))
    .map((i) => i.produto))
  const naoUsados = preparos.filter((p) => !preparosUsados.has(p.nome))
  if (naoUsados.length) {
    throw new Error(
      `preparo criado e nao usado por ficha nenhuma: ${naoUsados.map((p) => p.nome)}. ` +
      `Produto orfao e cadastro sujo; tire do PREPAROS do normalizador.`)
  }

  // `unique (ficha_id, produto_id)` — se o normalizador deixou passar um par
  // repetido, o insert quebraria no banco. Melhor quebrar aqui, com o nome.
  const vistos = new Set()
  for (const i of itens) {
    const k = `${i.fichaId}|${i.produtoId}`
    if (vistos.has(k)) {
      throw new Error(`par (ficha, produto) repetido: ${i.produto}`)
    }
    vistos.add(k)
  }

  // A ANCORA QUE NAO DEPENDE DO CATALOGO. O custo somado nao serve de
  // verificacao dura: ele muda toda vez que uma nota fiscal muda um preco, que
  // e precisamente o que este modulo existe para permitir. A soma das
  // QUANTIDADES, nao: ela e o que o arquivo manda, e so muda quando o arquivo
  // muda. Entao o dinheiro avisa e a quantidade cobra.
  const somaQuantidades = Number(itens.reduce((s, i) => s + i.quantidade, 0).toFixed(4))

  const custoTotal = Number(fichas.reduce((s, f) => s + f.custoEsperado, 0).toFixed(4))
  const esperado = dados.resumo.custo_total_das_fichas
  if (Math.abs(custoTotal - esperado) > 0.01) {
    throw new Error(`soma de custo ${custoTotal} x ${esperado} do JSON`)
  }

  return {
    preparos,
    fichas,
    itens,
    grupos: [...porGrupo.keys()].sort(),
    custoTotal,
    somaQuantidades,
    produtosDepois: PRODUTOS_ANTES + preparos.length,
    origem: dados.origem,
    catalogo: dados.catalogo,
    resumo: dados.resumo,
  }
}

// ----------------------------------------------------------------- escrita --
export function gerarSql(m, dados) {
  const p = []
  const cabecalho = `-- ---------------------------------------------------------------------------
-- 0004 · Fichas tecnicas das BEBIDAS do Bar do Zeca Norte Shopping
--
-- Gerado por scripts/gerar-seed-fichas.mjs a partir de
-- dados/fichas-drinques.json. NAO EDITE A MAO: regere.
--
-- Origem do dado: ${m.origem.arquivo}
--                 md5 ${m.origem.md5}, ${m.origem.paginas} paginas
--                 ("Relatorio de Estrutura de Produto" do PDV Business Rio)
--
-- ${m.fichas.length} fichas · ${m.itens.length} itens · ${m.preparos.length} produtos novos (preparos da casa)
-- Custo total somado das fichas, aos precos de outubro: R$ ${m.custoTotal}
--
-- Grupos do cardapio:
${m.grupos.map((g) => `--   ${g.padEnd(32)} ${String(m.fichas.filter((f) => f.grupo === g).length).padStart(3)} fichas`).join('\n')}
--
-- TRES COISAS QUE ESTA CARGA NAO FAZ, e vale dizer:
--
--  1. Nao grava custo. O custo da ficha e lido na hora, de
--     \`produtos.custo_medio\`, por \`mv_custo_do_produto\` e
--     \`vw_fichas_completas\`. Guardar congelaria o numero no dia da carga.
--
--  2. Nao grava preco de venda. O PDF e relatorio de CUSTO e nao traz preco:
--     as ${m.fichas.length} fichas nascem com preco_venda = 0, e por isso o CMV, a margem e
--     o markup saem NULOS da vista. Nada foi inventado. Essa e a principal
--     pendencia devolvida a cliente.
--
--  3. Nao encosta nas contagens. Agosto vale R$ ${TOTAL_AGOSTO} e outubro
--     R$ ${TOTAL_OUTUBRO}; o bloco de verificacao do fim cobra os dois.
--
-- IDEMPOTENCIA. O conjunto de itens de uma ficha e o que o ARQUIVO diz. O
-- insert atualiza no lugar (mantendo o id de cada item) e o delete do fim tira
-- do banco todo par (ficha, produto) que o arquivo nao declara mais. Aplicar
-- duas vezes nao duplica nada; aplicar depois de encolher a lista deixa a ficha
-- exatamente com os itens do arquivo.
-- ---------------------------------------------------------------------------

begin;

set local client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 0 · AS FICHAS QUE ESTE ARQUIVO CARREGA, numa tabela temporaria
--
-- Tudo daqui para baixo — o delete de ficha e TODAS as perguntas do bloco de
-- verificacao — se escopa por esta tabela, e nao pelo tenant.
--
-- A primeira versao desta carga contava o tenant (\`select count(*) from fichas
-- where restaurante_id = …\`) e isso a tornava inaplicavel por dois motivos que
-- nada tem de hipotetico:
--
--  · no dia em que a cliente criasse UMA ficha pela tela, a carga passaria a
--    recusar-se a aplicar — \`80 fichas, esperado 79\` — e ficaria assim ate
--    alguem apagar a ficha dela. A ironia e que o comentario da secao 4
--    prometia o contrario: o delete nunca a tocou; era a VERIFICACAO que a
--    contava;
--  · e o mesmo valia para o escopo encolher: trocar 79 fichas por 56 exigia um
--    \`delete\` manual ao lado da carga, que e justamente o que a 0003 deixou de
--    precisar.
--
-- Com a tabela temporaria, a carga responde sobre o que ELA carrega e e
-- indiferente ao que mais existe no tenant. \`on commit drop\`: ela nasce e
-- morre dentro da transacao.
-- ---------------------------------------------------------------------------

create temporary table arquivo_fichas (id uuid primary key) on commit drop;
`
  p.push(cabecalho)
  p.push(bloco(
    'arquivo_fichas', 'arquivo_fichas', ['id'],
    m.fichas.map((f) => txt(f.id)),
    'on conflict (id) do nothing'))
  p.push('')

  // ------------------------------------------------- a trava do nome unico --
  p.push(`-- ---------------------------------------------------------------------------
-- 0a · A TRAVA DO NOME, antes de qualquer insert
--
-- \`fichas_nome_unico\` e um indice UNIQUE sobre
-- \`(restaurante_id, lower(mv_sem_acento(nome)))\`, e o \`insert into fichas\` desta
-- carga usa \`on conflict (id) do update\` — o alvo do \`on conflict\` e a chave
-- PRIMARIA, nao este indice. Entao o nome e um recurso compartilhado que nenhuma
-- clausula da carga absorve.
--
-- O caso e a coisa mais natural que a casa pode fazer: apagar um drinque na tela
-- e digita-lo de novo. A ficha nova nasce com \`gen_random_uuid()\` e com o mesmo
-- nome, e a carga morre assim:
--
--     ERROR:  duplicate key value violates unique constraint "fichas_nome_unico"
--
-- Isso nao diz qual ficha, nao diz por que, e nao diz o que fazer. A trava
-- abaixo troca o erro cru pela instrucao.
--
-- POR QUE NAO \`on conflict (nome)\`: isso faria a carga CAPTURAR a ficha que a
-- casa criou, sobrescrevendo o trabalho dela com o do arquivo — exatamente o que
-- o desenho da posse (\`origem_carga\`) existe para evitar. Recusar e aplicar e a
-- resposta certa; a casa decide se renomeia a dela ou se apaga.
--
-- \`produtos_nome_unico\` tem a mesma forma e a mesma exposicao, e por isso a
-- trava cobre os dois.
-- ---------------------------------------------------------------------------

do $$
declare
  v_n int;
  v_quais text;
begin
  select count(*), string_agg(format('%L (id %s, origem %s)', f.nome, f.id,
                                     coalesce(f.origem_carga, 'feita na tela')),
                              ', ' order by f.nome)
    into v_n, v_quais
    from fichas f
   where f.restaurante_id = ${txt(RESTAURANTE_ID)}
     and f.id not in (select id from arquivo_fichas)
     and lower(mv_sem_acento(f.nome)) in (
${emLotes(m.fichas, 2).map((lote) => '       ' + lote.map((f) => `lower(mv_sem_acento(${txt(f.nome)}))`).join(', ')).join(',\n')}
     );
  if v_n <> 0 then
    raise exception '0004: % ficha(s) com um nome desta carga e outro id: %. O indice fichas_nome_unico recusaria o insert com "duplicate key" e esta carga nao aplicaria. Isso acontece quando a ficha foi apagada e redigitada na tela. O que fazer: renomeie ou apague a ficha listada acima, e reaplique. A carga NAO a sobrescreve de proposito — o trabalho feito na tela nao e dela.',
      v_n, v_quais;
  end if;

  select count(*), string_agg(format('%L (id %s)', p.nome, p.id), ', ' order by p.nome)
    into v_n, v_quais
    from produtos p
   where p.restaurante_id = ${txt(RESTAURANTE_ID)}
     and p.id not in (
${listaDeIds(m.preparos.map((x) => x.id))}
     )
     and lower(mv_sem_acento(p.nome)) in (
${emLotes(m.preparos, 2).map((lote) => '       ' + lote.map((x) => `lower(mv_sem_acento(${txt(x.nome)}))`).join(', ')).join(',\n')}
     );
  if v_n <> 0 then
    raise exception '0004: % produto(s) com um nome desta carga e outro id: %. O indice produtos_nome_unico recusaria o insert. O que fazer: RENOMEIE o produto listado (ou apague-o, se ele for mesmo duplicata do desta carga) e reaplique. DESATIVAR NAO RESOLVE: o indice nao olha a coluna ativo, medido — com o produto desativado a carga recusa igual.',
      v_n, v_quais;
  end if;
end $$;
`)

  // --------------------------------------------------- produtos dos preparos -
  p.push(`-- ---------------------------------------------------------------------------
-- 1 · Os ${m.preparos.length} preparos da casa, como produto do catalogo
--
-- No PDF o xarope e a espuma SAO ficha, com ingredientes proprios. No nosso
-- modulo nao existe ficha dentro de ficha (a migracao 0017 nao tem
-- sub-receita), e o briefing da tres saidas. A escolhida e a (a): o preparo
-- vira produto, numa categoria que JA existe, com o custo que o PDF calcula
-- para ele.
--
-- Por que: a ficha do drinque continua dizendo "xarope de maracuja", que e como
-- a casa enxerga a propria receita. Achatar trocaria isso por "acucar + agua"
-- em 23 fichas e o barman nao reconheceria mais o que faz.
--
-- O preco pago, dito: \`custo_fixo = true\` e o custo fica CONGELADO no que o PDF
-- calculou — ele nao acompanha o preco do acucar. Enquanto o modulo nao tiver
-- sub-receita, recalcular o preparo e trabalho manual. Esta na lista de
-- pendencias da cliente, com o numero de cada um.
--
-- O custo usado e o recalculado pelos DOIS niveis, nao o \`Total\` impresso: o
-- PDV guarda custo cacheado da sub-receita e o cache esta velho (ESPUMA DE
-- GENGIBRE entra valendo 5,09 nos drinques e a ficha dela soma 5,91).
-- ---------------------------------------------------------------------------
`)
  p.push(bloco(
    'produtos_preparos', 'produtos',
    ['id', 'restaurante_id', 'categoria_id', 'nome', 'unidade', 'custo_medio',
      'custo_atualizado_em', 'ativo'],
    m.preparos.map((x) => [
      txt(x.id), txt(RESTAURANTE_ID), txt(x.categoriaId), txt(x.nome),
      txt(x.unidade), num(x.custo, 4), `${txt(CARGA_EM)}::timestamptz`, 'true',
    ].join(', ')),
    `on conflict (id) do update set
     categoria_id = excluded.categoria_id,
     unidade = excluded.unidade,
     custo_medio = excluded.custo_medio,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true`))
  p.push('')

  p.push(`-- O vinculo com o setor Bar. \`custo_fixo = true\` diz ao
-- \`mv_custo_do_produto\` que este custo e calculado pela casa, e nao vem de
-- nota fiscal — que e exatamente o caso de um xarope feito na cozinha do bar.
`)
  p.push(bloco(
    'vinculos_preparos', 'produto_setores',
    ['produto_id', 'setor_id', 'unidade', 'custo', 'ordem', 'custo_fixo',
      'custo_atualizado_em', 'ativo'],
    m.preparos.map((x) => [
      txt(x.id), txt(x.setorId), txt(x.unidade), num(x.custo, 4), '1', 'true',
      `${txt(CARGA_EM)}::timestamptz`, 'true',
    ].join(', ')),
    `on conflict (produto_id, setor_id) do update set
     unidade = excluded.unidade,
     custo = excluded.custo,
     custo_fixo = excluded.custo_fixo,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true`))
  p.push('')

  // ----------------------------------------------------------------- fichas -
  p.push(`-- ---------------------------------------------------------------------------
-- 2 · As ${m.fichas.length} fichas
--
-- cmv_alvo: 20 em drinque (o default da tabela e 30, e o proprio comentario da
-- migracao 0017 diz que 30 "e razoavel num prato de cozinha e pessimo num
-- drink, onde 20% ja e caro"); 30 em cerveja, chopp e refrigerante, que tem
-- economia de REVENDA e nao de coquetel; 100 em cortesia, que nao tem preco de
-- venda por definicao — "meta de CMV" nao quer dizer nada para ela, e 100 e a
-- unica leitura honesta e o maximo que o check da tabela aceita.
--
-- rendimento 1 e unidade_rendimento PORCAO: o default da tabela. A vista divide
-- o custo total pelo rendimento, e com rendimento 1 o rotulo e cosmetico —
-- inventar um vocabulario de "COPO"/"TACA"/"LONG NECK" aqui seria cadastro a
-- manter sem nenhum numero mudando.
--
-- perda_percentual fica 0 em todos os itens: o PDF nao informa perda, e nao se
-- inventa perda.
-- ---------------------------------------------------------------------------
`)
  p.push(bloco(
    'fichas', 'fichas',
    ['id', 'restaurante_id', 'nome', 'grupo', 'descricao', 'modo_preparo',
      'rendimento', 'unidade_rendimento', 'preco_venda', 'cmv_alvo', 'ativo',
      'ordem', 'origem_carga'],
    m.fichas.map((f) => [
      txt(f.id), txt(RESTAURANTE_ID), txt(f.nome), txt(f.grupo),
      txt(f.descricao), txt(f.modoPreparo), num(f.rendimento, 4),
      txt(f.unidadeRendimento), num(f.precoVenda, 4), num(f.cmvAlvo, 3),
      'true', String(f.ordem), txt(CARGA),
    ].join(', ')),
    `on conflict (id) do update set
     nome = excluded.nome,
     grupo = excluded.grupo,
     descricao = excluded.descricao,
     rendimento = excluded.rendimento,
     unidade_rendimento = excluded.unidade_rendimento,
     ordem = excluded.ordem,
     origem_carga = excluded.origem_carga`))
  p.push('')
  p.push(`-- O carimbo da posse, para a ficha que ESTA no arquivo de hoje mas nasceu
-- antes da migracao 0021 (e por isso teria \`origem_carga\` nula). O \`do update\`
-- acima ja resolve isso; este \`update\` existe porque ele casa por **id** contra
-- \`arquivo_fichas\`, o que alcanca tambem a ficha que a casa RENOMEOU — o nome
-- mudou, o id nao.
update fichas set origem_carga = ${txt(CARGA)}
 where id in (select id from arquivo_fichas)
   and (origem_carga is null or origem_carga = ${txt(CARGA)});
`)
  p.push('')
  p.push(`-- TRES colunas de proposito FORA do \`do update\`. O criterio e um so: campo em
-- que a casa DECIDE algo a carga nao sobrescreve; campo que descreve o que veio
-- do PDF, sim.
--
-- \`preco_venda\`: se a cliente preencher o preco pela tela, reaplicar esta carga
-- nao pode zerar o trabalho dela. O arquivo manda no que veio do PDF; o preco e
-- dela.
--
-- \`ativo\` entrou nessa lista por medicao, nao por simetria: com \`ativo = true\`
-- no \`do update\`, uma ficha que a cliente DESATIVOU pela tela voltava ativa na
-- proxima reaplicacao. Desativar e a forma que o modulo tem de dizer "este
-- drinque saiu do cardapio", e a carga nao tem autoridade para discordar. A
-- ficha nasce \`true\` no insert; depois disso, quem manda e ela.
--
-- \`cmv_alvo\` entrou depois, pelo mesmo raciocinio e tambem por medicao: ele e a
-- META de CMV que a casa escolhe para o item, e com ele no \`do update\` um
-- ajuste feito na tela era desfeito na reaplicacao. O valor que a carga grava na
-- primeira vez (20 em coquetel, 30 em revenda, 100 em cortesia) e ponto de
-- partida, nao palavra final.
`)

  // ------------------------------------------------------------------ itens -
  p.push(`-- ---------------------------------------------------------------------------
-- 3 · Os ${m.itens.length} itens
--
-- A \`observacao\` guarda o nome do componente NO PDV. Sem ela a ficha diz
-- "GIN ARPO 5 LT" e ninguem acha a linha correspondente no PDF; com ela a
-- conferencia contra a origem e linha a linha. Onde a observacao traz dois
-- nomes separados por "+", dois componentes do PDV cairam no MESMO produto do
-- catalogo e as quantidades foram somadas — \`unique (ficha_id, produto_id)\`
-- nao deixa o mesmo produto entrar duas vezes na mesma ficha.
--
-- A \`unidade\` e a do NOSSO cadastro, nunca a do PDV: \`mv_fator_unidade\`
-- devolve 1 para unidade igual nos dois lados, e e isso que mantem a quantidade
-- intacta. As divergencias PDV x cadastro estao listadas no
-- dados/RELATORIO-FICHAS.txt.
-- ---------------------------------------------------------------------------
`)
  p.push(bloco(
    'ficha_itens', 'ficha_itens',
    ['id', 'ficha_id', 'produto_id', 'quantidade', 'unidade',
      'perda_percentual', 'observacao', 'ordem'],
    m.itens.map((i) => [
      txt(idDe('ficha_item', `${i.fichaId}:${i.produtoId}`)),
      txt(i.fichaId), txt(i.produtoId), num(i.quantidade, 4), txt(i.unidade),
      num(i.perda, 3), txt(i.observacao), String(i.ordem),
    ].join(', ')),
    `on conflict (ficha_id, produto_id) do update set
     quantidade = excluded.quantidade,
     unidade = excluded.unidade,
     perda_percentual = excluded.perda_percentual,
     observacao = excluded.observacao,
     ordem = excluded.ordem`))
  p.push('')

  // ------------------------------------------------------ o delete que falta -
  p.push(`-- ---------------------------------------------------------------------------
-- 4 · O item que SAIU do arquivo sai do banco
--
-- Esta e a parte que a carga de outubro nao tinha e que custou uma aplicacao
-- quebrada. O \`on conflict\` acima resolve "o item mudou" e "o item e novo"; ele
-- NAO resolve "o item deixou de existir". Sem o delete abaixo, tirar um
-- ingrediente da ficha no arquivo e reaplicar deixaria o ingrediente velho no
-- banco para sempre, somando custo que a receita nao tem mais.
--
-- O delete e por PAR (ficha, produto) e nao por ficha, e e isso que faz ele
-- cobrir os tres casos de uma vez: item removido da lista, ficha que encolheu,
-- e ficha que trocou um produto por outro. Ele so olha as ${m.fichas.length} fichas desta
-- carga — ficha que a cliente criar pela tela nao e tocada.
-- ---------------------------------------------------------------------------

delete from ficha_itens i
 using fichas f
 where f.id = i.ficha_id
   and f.restaurante_id = ${txt(RESTAURANTE_ID)}
   and i.ficha_id in (
${listaDeIds(m.fichas.map((f) => f.id))}
   )
   and (i.ficha_id, i.produto_id) not in (
${emLotes(m.itens, 2).map((lote) => '    ' + lote.map((i) => `(${txt(i.fichaId)}, ${txt(i.produtoId)})`).join(', ')).join(',\n')}
   );

-- ---------------------------------------------------------------------------
-- 4b · A FICHA que saiu do arquivo sai do banco. E so ela.
--
-- O delete de item resolve "a ficha encolheu". Nao resolve "a ficha deixou de
-- existir": trocar o escopo de 79 fichas por 56 deixava 23 fichas orfas no
-- banco, com os itens apagados pelo passo 4 e o cabecalho intacto — 23 fichas
-- de custo zero na tela da cliente.
--
-- O problema de apagar ficha e saber QUAIS sao nossas. Apagar por tenant
-- apagaria a ficha que a cliente criou na tela; apagar por \`grupo\` tambem,
-- porque o grupo e texto livre e ela pode digitar "Cortesias".
--
-- A POSSE E GRAVADA, em \`fichas.origem_carga\` — a coluna que a migracao 0021
-- criou. Esta carga escreve \`'${CARGA}'\` nela (secao 2), ficha feita na tela fica
-- com a coluna NULA, e a 0005 escreve \`'0005'\`. Entao o delete abaixo alcanca
-- exatamente as fichas que uma versao ANTERIOR desta mesma carga criou e que a
-- versao de hoje nao tem mais.
--
-- ATE A 0021 ISSO ERA CALCULADO: a carga reconhecia as suas fichas refazendo em
-- SQL a conta de \`UUIDv5(restaurante_id, 'ficha:' || nome)\` — 20 linhas de
-- sha1, set_byte e substring — e comparando com o id gravado. Funcionava, e
-- tinha dois defeitos que o rotulo resolve:
--
--  · **a chave era mutavel.** \`nome\` e coluna que a casa edita na tela. Ficha
--    renomeada deixava de ser reconhecida pela propria carga que a criou, e se
--    depois saisse da lista ficava no cardapio PARA SEMPRE — fora do alcance de
--    qualquer versao futura desta carga. O rotulo nao muda quando o nome muda;
--  · **a separacao entre cargas virava convencao.** Era o prefixo que separava
--    esta carga da 0005, e uma 0006 copiada de uma das duas sem trocar o
--    prefixo apagaria as fichas da outra em silencio.
--
-- Os ids continuam UUIDv5 do nome: eles so deixam de CARREGAR a posse.
-- ---------------------------------------------------------------------------

delete from fichas f
 where f.restaurante_id = ${txt(RESTAURANTE_ID)}
   and f.origem_carga = ${txt(CARGA)}
   and f.id not in (select id from arquivo_fichas);
`)

  // ------------------------------------------------------------ verificacao -
  p.push(`-- ---------------------------------------------------------------------------
-- 5 · Verificacao. Se a conta nao fechar, a transacao cai aqui e nao na
--     producao de alguem.
--
-- DUAS REGRAS DE DESENHO, as duas aprendidas errando:
--
--  1. TODA pergunta se escopa em \`arquivo_fichas\`, nunca no tenant. A carga
--     responde pelo que ELA carrega. Contar o tenant fazia a carga recusar-se a
--     aplicar quando a cliente criava uma ficha pela tela.
--
--  2. O DINHEIRO AVISA; A QUANTIDADE COBRA. A primeira versao tinha
--     \`if abs(v_custo - <numero>) > 0.01 then raise exception\`, e isso prendia
--     a carga a um catalogo congelado: bastou o limao ir de R$ 7,11 para R$ 8,00
--     para a carga parar de aplicar. Era a negacao da regra central do modulo —
--     o custo DEVE acompanhar o catalogo, e era a unica coisa que a verificacao
--     proibia. Nao precisa de ninguem errar: basta a proxima nota fiscal.
--
--     Entao o custo somado virou \`raise warning\` (que e informacao de verdade:
--     se o catalogo NAO mudou e o numero mudou, e erro de mapeamento), e no
--     lugar dele entrou uma ancora que nao depende de preco nenhum: a soma das
--     QUANTIDADES dos itens, ${m.somaQuantidades}. Ela e o que o arquivo manda, e so muda
--     quando o arquivo muda.
--
-- \`raise warning\` e nao \`notice\`: o \`set local client_min_messages = warning\`
-- do topo esconde \`notice\`, e um diagnostico que ninguem ve nao e diagnostico.
--
-- As perguntas, e nenhuma delas e "parece correto":
--
--   1. as ${m.fichas.length} fichas DO ARQUIVO existem?
--   2. os ${m.itens.length} itens delas existem — nem um a mais (duplicacao) nem a menos?
--   3. a soma das quantidades e ${m.somaQuantidades}?
--   4. os ${m.preparos.length} produtos de preparo existem e estao ativos?
--   5. alguma das fichas do arquivo com custo zero? Ficha de bebida com custo
--      zero e erro de mapeamento;
--   6. algum item delas apontando para produto INATIVO? O custo viria zero;
--   7. algum item com unidade incompativel? A vista marca
--      \`unidade_incompativel\` quando nao sabe converter, e nesse caso o custo
--      do item vem NULO — a ficha mentiria para baixo;
--   8. a contagem de agosto continua valendo R$ ${TOTAL_AGOSTO}?
--   9. e a de outubro, R$ ${TOTAL_OUTUBRO}?
--
-- E tres avisos, que informam sem derrubar: o custo somado, o total de produtos
-- do tenant e o total de categorias e setores. Os tres contam o TENANT, e e por
-- isso que avisam em vez de cobrar — a cliente pode cadastrar produto e
-- categoria pela tela, e isso nao e defeito desta carga.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fichas       integer;
  v_itens        integer;
  v_quantidades  numeric;
  v_preparos     integer;
  v_custo        numeric;
  v_zeradas      integer;
  v_inativos     integer;
  v_incompat     integer;
  v_produtos     integer;
  v_categorias   integer;
  v_setores      integer;
  v_agosto       numeric;
  v_outubro      numeric;
  v_nomes        text;
begin
  select count(*) into v_fichas
    from fichas f join arquivo_fichas a on a.id = f.id;

  select count(*), coalesce(sum(i.quantidade), 0)
    into v_itens, v_quantidades
    from ficha_itens i join arquivo_fichas a on a.id = i.ficha_id;

  if v_fichas <> ${m.fichas.length} then
    raise exception '0004: % fichas do arquivo no banco, esperado ${m.fichas.length}', v_fichas;
  end if;

  if v_itens <> ${m.itens.length} then
    raise exception '0004: % itens das fichas do arquivo, esperado ${m.itens.length}', v_itens;
  end if;

  -- A ancora que nao depende de preco: 4 casas, como a coluna.
  if abs(v_quantidades - ${m.somaQuantidades}) > 0.0001 then
    raise exception '0004: soma das quantidades dos itens e %, esperado ${m.somaQuantidades} (diferenca de %)',
      v_quantidades, abs(v_quantidades - ${m.somaQuantidades});
  end if;

  select count(*) into v_preparos
    from produtos
   where restaurante_id = ${txt(RESTAURANTE_ID)} and ativo
     and id in (${m.preparos.map((x) => txt(x.id)).join(', ')});
  if v_preparos <> ${m.preparos.length} then
    raise exception '0004: % dos ${m.preparos.length} produtos de preparo existem e estao ativos', v_preparos;
  end if;

  select count(*), string_agg(v.nome, ', ' order by v.nome)
    into v_zeradas, v_nomes
    from vw_fichas_completas v join arquivo_fichas a on a.id = v.id
   where v.custo_total = 0;
  if v_zeradas > 0 then
    raise exception '0004: % ficha(s) com custo ZERO: %. Custo zero em ficha de bebida e erro de mapeamento.',
      v_zeradas, v_nomes;
  end if;

  select count(*) into v_inativos
    from ficha_itens i
    join arquivo_fichas a on a.id = i.ficha_id
    join produtos p on p.id = i.produto_id
   where not p.ativo;
  if v_inativos > 0 then
    raise exception '0004: % item(ns) apontando para produto INATIVO', v_inativos;
  end if;

  select count(*) into v_incompat
    from vw_ficha_itens vi join arquivo_fichas a on a.id = vi.ficha_id
   where vi.unidade_incompativel;
  if v_incompat > 0 then
    raise exception '0004: % item(ns) com unidade incompativel — o custo deles vem NULO', v_incompat;
  end if;

  select coalesce(sum(i.total), 0) into v_agosto
    from contagem_itens i
    join contagens c on c.id = i.contagem_id
   where c.restaurante_id = ${txt(RESTAURANTE_ID)} and c.referencia = '2026-08-31';
  if abs(v_agosto - ${TOTAL_AGOSTO}) > 0.01 then
    raise exception '0004: a contagem de agosto vale agora %, e tem de valer ${TOTAL_AGOSTO}', v_agosto;
  end if;

  select coalesce(sum(i.total), 0) into v_outubro
    from contagem_itens i
    join contagens c on c.id = i.contagem_id
   where c.restaurante_id = ${txt(RESTAURANTE_ID)} and c.referencia = '2026-10-01';
  if abs(v_outubro - ${TOTAL_OUTUBRO}) > 0.01 then
    raise exception '0004: a contagem de outubro vale agora %, e tem de valer ${TOTAL_OUTUBRO}', v_outubro;
  end if;

  -- ------------------------------------------------------------- os avisos --
  select coalesce(sum(v.custo_total), 0) into v_custo
    from vw_fichas_completas v join arquivo_fichas a on a.id = v.id;
  if abs(v_custo - ${m.custoTotal}) > 0.01 then
    raise warning '0004: custo somado das fichas e % e o arquivo previu ${m.custoTotal} — diferenca de %. Se o catalogo mudou de preco, isto e o ESPERADO (a ficha acompanha o preco real); se nao mudou, e erro de mapeamento.',
      v_custo, abs(v_custo - ${m.custoTotal});
  end if;

  select count(*) into v_produtos
    from produtos where restaurante_id = ${txt(RESTAURANTE_ID)};
  if v_produtos <> ${m.produtosDepois} then
    raise warning '0004: o tenant tem % produtos; esta carga previa ${m.produtosDepois} (= ${PRODUTOS_ANTES} + ${m.preparos.length} preparos). Se a cliente cadastrou produto pela tela, isto e o esperado.',
      v_produtos;
  end if;

  select count(*) into v_categorias
    from categorias where restaurante_id = ${txt(RESTAURANTE_ID)};
  select count(*) into v_setores
    from setores where restaurante_id = ${txt(RESTAURANTE_ID)} and ativo;
  if v_categorias <> 21 or v_setores <> 4 then
    raise warning '0004: o tenant tem % categorias e % setores ativos; esta carga previa 21 e 4, e nao cria nem uma nem outro.',
      v_categorias, v_setores;
  end if;

  raise warning '0004 ok: % fichas, % itens, soma das quantidades %, custo somado R$ %',
    v_fichas, v_itens, v_quantidades, round(v_custo, 4);
end $$;

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
  writeFileSync(DESTINO_SQL, sql)
  return { modelo, sql }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { modelo, sql } = gerar()
  const linha = (r, v) => console.log(`${r.padEnd(44)} ${v}`)
  linha('fichas', modelo.fichas.length)
  linha('itens', modelo.itens.length)
  linha('produtos novos (preparos)', modelo.preparos.length)
  linha('produtos no catalogo depois', modelo.produtosDepois)
  linha('soma das quantidades (ancora)', modelo.somaQuantidades)
  linha('custo total somado (R$)', modelo.custoTotal)
  for (const g of modelo.grupos) {
    linha(`  ${g}`, modelo.fichas.filter((f) => f.grupo === g).length)
  }
  // `sql.length` conta UNIDADES UTF-16, nao bytes: cada acento do cardapio
  // (NHOQUE, LIMÃO, CAIPIRINHA) cabe em 1 unidade e ocupa 2 bytes no arquivo.
  // O numero impresso ficava menor que o arquivo no disco e nao servia para
  // conferir nada. Medido nesta carga: 99096 impresso contra 99282 em disco.
  linha('bytes de SQL', Buffer.byteLength(sql, 'utf8'))
  console.log(`\nescrito: ${DESTINO_SQL}`)
}
