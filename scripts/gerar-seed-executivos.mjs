// ============================================================================
// supabase/seed/0005_fichas_executivos.sql, gerado de dados/executivos-fichas.json
// ----------------------------------------------------------------------------
// As 13 fichas dos PRATOS EXECUTIVOS, os 15 produtos novos (9 sub-receitas da
// planilha com custo recursivo pelo nosso catalogo + 6 ingredientes que o
// catalogo nao tem), e os itens de cada ficha.
//
// A CARGA NASCE AUTOSSUFICIENTE. Nao e uma promessa: e a lista de coisas que a
// 0004 so passou a fazer DEPOIS de tres laudos, e que esta aqui desde a primeira
// linha. Vale enumerar, porque cada item custou uma aplicacao quebrada:
//
//  1. `create temporary table arquivo_fichas (...) on commit drop` com os ids
//     deste arquivo, e TODA pergunta do bloco de verificacao escopada nela. A
//     0004 contava o tenant inteiro, e por isso parava de aplicar no dia em que
//     a cliente criasse uma ficha pela tela (medido la: `80 fichas, esperado
//     79`). A carga responde pelo que ELA carrega.
//
//  2. O `delete` de ITEM e por PAR (ficha, produto), e e isso que cobre os tres
//     casos de encolhimento: item removido, ficha que encolheu, ficha que trocou
//     um produto por outro. A carga de outubro quebrou por nao ter isso.
//
//  3. O `delete` de FICHA e por POSSE GRAVADA: `fichas.origem_carga = '0005'`,
//     a coluna que a migracao 0021 criou. Ficha feita na tela nasce com a coluna
//     NULA e nenhuma carga a reivindica.
//
//  4. Dinheiro em `raise warning`, nao `raise exception`. A 0004 prendia a si
//     mesma a um catalogo congelado: uma nota fiscal de limao a tornava
//     inaplicavel. O que vira excecao e a SOMA DAS QUANTIDADES, que nao depende
//     de preco nenhum e e o que o arquivo realmente manda.
//
//  5. `preco_venda` e `ativo` FORA do `do update`, para a carga nao apagar o
//     trabalho que a cliente fez na tela.
//
//  6. `raise warning` e nao `raise notice` no diagnostico final, porque o
//     `set local client_min_messages = warning` do topo esconderia o notice.
//
//  7. Uma TRAVA DE NOME antes de qualquer insert. `fichas_nome_unico` e um
//     indice UNIQUE sobre `lower(mv_sem_acento(nome))` e esta carga insere com
//     `on conflict (id)` — o alvo e a chave primaria, nao o nome. Entao se a
//     casa apagar um prato na tela e redigita-lo, a carga morria com
//     `ERROR: duplicate key value violates unique constraint "fichas_nome_unico"`,
//     que nao diz qual ficha nem o que fazer. A trava troca isso por um
//     diagnostico que nomeia a ficha e manda a acao. Vale igual para `produtos`.
//
//  8. E, porque promessa em comentario nao vale nada, a carga MEDE a promessa de
//     nao encostar nas fichas de outra carga: ela guarda, antes de tocar em
//     qualquer coisa, a contagem, os itens e o custo somado das fichas que NAO
//     sao desta carga, e levanta excecao se qualquer um dos tres se mexer. Isso
//     cobra "nao encostar nas 56 fichas de drinque" sem escrever 56 em lugar
//     nenhum — o que importa e a invariancia, nao o numero.
//
// SOBRE A CONVIVENCIA COM A 0004, e vale dizer porque este arquivo ja afirmou o
// contrario: as duas cargas sao independentes e a ORDEM NAO IMPORTA. Cada uma
// apaga so o que tem o seu proprio `origem_carga`. Isso foi medido nos dois
// sentidos e num banco onde a 0005 aplicou ANTES da 0004.
//
// Uma versao anterior deste arquivo afirmava, em comentario, que reaplicar a
// 0004 apagava as 13 fichas daqui (`DELETE 13`). Aquilo foi medido contra uma
// versao em que esta carga ainda usava o prefixo `'ficha:'` da 0004, e deixou de
// ser verdade quando o prefixo mudou — sem que o teste fosse refeito. Fica como
// regra: teste cujo resultado dependa de codigo alterado tem de ser refeito,
// inclusive o que passou.
//
// Reaproveita `idDe`/`txt`/`num`/`RESTAURANTE_ID` do gerar-seed.mjs por import,
// para que o id de um produto seja o MESMO que a 0001/0003/0004 calculariam.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { idDe, txt, num, RESTAURANTE_ID } from './gerar-seed.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const ORIGEM_JSON = resolve(RAIZ, 'dados/executivos-fichas.json')
export const DESTINO_SQL = resolve(RAIZ, 'supabase/seed/0005_fichas_executivos.sql')

// As duas contagens que nao podem se mexer, de nenhuma carga desta sessao.
export const TOTAL_AGOSTO = 78681.3573
export const TOTAL_OUTUBRO = 71961.3510

// Quantos produtos o tenant tem ANTES desta carga: 868 do retrato + 11 da 0003
// + 12 da 0004. O normalizador cobra esse numero ao montar o catalogo efetivo;
// aqui ele vira a previsao do total depois, em `raise warning`.
export const PRODUTOS_ANTES = 891

// O grupo do cardapio desta carga.
export const GRUPO = 'Executivos'

// O ROTULO DA POSSE: quem apaga o que, gravado em `fichas.origem_carga` pela
// migracao 0021. Esta e a linha que separa esta carga da 0004.
//
// Ela e um literal e nao uma conta, e isso e a correcao de um defeito real. A
// versao anterior provava posse recalculando `UUIDv5(restaurante, prefixo||nome)`
// em SQL, e o prefixo proprio era o que impedia esta carga de apagar as fichas
// da 0004. Dois problemas, os dois medidos:
//
//   · `nome` e coluna que a casa edita. Ficha renomeada deixava de ser
//     reconhecida pela carga que a criou; renomeada E fora da lista, ficava no
//     cardapio para sempre, fora do alcance de qualquer versao futura;
//   · a separacao entre cargas virava convencao: uma 0006 copiada de uma das
//     duas, sem trocar o prefixo, apagaria as fichas da outra em silencio.
//
// Com o rotulo nao ha o que esquecer nem o que recalcular, e a posse sobrevive a
// um renome.
export const CARGA = '0005'

// O espaco de nomes do ID da ficha. Ele continua separado da 0004 (que usa
// `'ficha:'`) porque dois ids iguais para fichas diferentes seria conflito de
// chave primaria — mas ele NAO carrega mais a posse. Um id voltou a ser um id.
export const ESPACO_DA_FICHA = 'ficha-executivo'

export const CARGA_EM = '2026-10-14 23:59:00-03'

// ------------------------------------------------------------- utilidades --
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

function listaDeIds(ids, porLinha = 3) {
  const linhas = []
  for (let i = 0; i < ids.length; i += porLinha) {
    linhas.push('    ' + ids.slice(i, i + porLinha).map((x) => `'${x}'`).join(', '))
  }
  return linhas.join(',\n')
}

const arred = (v, casas) => Number(Number(v).toFixed(casas))

// ------------------------------------------------------------- modelo/dados -
export function montarModelo(dados) {
  if (dados.restaurante_id !== RESTAURANTE_ID) {
    throw new Error(`JSON e de outro restaurante: ${dados.restaurante_id}`)
  }
  const r = dados.resumo

  // Os produtos novos. O id e UUIDv5 do NOME, no mesmo espaco de nomes que a
  // 0001 usa — entao se um dia a casa cadastrar `BANHA` pela tela com este
  // mesmo nome, as duas cargas falam do mesmo produto em vez de duplicar.
  const produtos = dados.produtos_novos.map((p) => ({
    nome: p.nome,
    id: idDe('produto', p.nome),
    categoria: p.categoria,
    // O id vem do JSON, que o tirou do retrato versionado do catalogo — e NAO
    // de `idDe('categoria'|'setor', nome)`. Para categoria os dois coincidem;
    // para SETOR nao: `idDe('setor','Cozinha')` da um id que nao existe, porque
    // a carga 0002 renomeou "Estoque Geral" para "Cozinha" mantendo o id. A
    // 0004 nunca viu isso porque os preparos dela vao para o `Bar`. Com o id
    // derivado do nome, o `mv_valida_produto_setor` recusa a linha inteira.
    categoriaId: p.categoria_id,
    setor: p.setor,
    setorId: p.setor_id,
    unidade: p.unidade,
    custo: arred(p.custo, 4),
    custoFixo: p.custo_fixo === true,
    origem: p.origem,
  }))
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  for (const p of produtos) {
    if (!UUID.test(String(p.categoriaId ?? '')) || !UUID.test(String(p.setorId ?? ''))) {
      throw new Error(`produto novo sem categoria_id/setor_id do retrato: ${p.nome}. `
        + 'Estes ids NAO podem ser derivados do nome: o setor Cozinha herdou o id '
        + 'do "Estoque Geral" quando a 0002 o renomeou.')
    }
    if (!(p.custo > 0)) {
      throw new Error(`produto novo sem custo: ${p.nome}. Produto de custo zero `
        + 'faria a ficha que o usa nascer com custo errado e invisivel.')
    }
    if (p.custoFixo !== true) {
      throw new Error(`produto novo sem custo_fixo: ${p.nome}. Todo preparo e `
        + 'todo insumo custeado pela casa entra com custo_fixo = true.')
    }
  }
  const nomesNovos = new Set(produtos.map((p) => p.nome))
  if (nomesNovos.size !== produtos.length) {
    throw new Error('produto novo repetido na lista')
  }

  const fichas = []
  const itens = []
  for (const f of dados.fichas) {
    const id = idDe(ESPACO_DA_FICHA, f.nome)
    fichas.push({
      id,
      nome: f.nome,
      grupo: f.grupo,
      descricao: f.descricao,
      modoPreparo: null,
      rendimento: f.rendimento,
      unidadeRendimento: f.unidade_rendimento,
      precoVenda: f.preco_venda,
      cmvAlvo: f.cmv_alvo,
      ordem: f.ordem,
      custo: arred(f.custo_do_nosso_catalogo, 4),
    })
    const vistos = new Set()
    for (const it of f.itens) {
      const produtoId = idDe('produto', it.produto)
      if (vistos.has(produtoId)) {
        throw new Error(`o mesmo produto duas vezes na ficha ${f.nome}: ${it.produto}. `
          + 'O schema tem unique (ficha_id, produto_id); as quantidades teriam de ser somadas.')
      }
      vistos.add(produtoId)
      if (!(it.quantidade > 0)) {
        throw new Error(`quantidade <= 0 em ${f.nome}/${it.produto}`)
      }
      if (!(it.perda_percentual >= 0 && it.perda_percentual < 100)) {
        throw new Error(`perda_percentual fora do check em ${f.nome}/${it.produto}: `
          + it.perda_percentual)
      }
      itens.push({
        fichaId: id,
        produtoId,
        produto: it.produto,
        quantidade: arred(it.quantidade, 4),
        unidade: it.unidade,
        perda: arred(it.perda_percentual, 3),
        observacao: it.observacao,
        ordem: it.ordem,
        custo: arred(it.custo, 4),
      })
    }
  }

  if (fichas.length !== r.fichas) {
    throw new Error(`modelo com ${fichas.length} fichas e o JSON diz ${r.fichas}`)
  }
  if (itens.length !== r.itens) {
    throw new Error(`modelo com ${itens.length} itens e o JSON diz ${r.itens}`)
  }
  if (produtos.length !== r.produtos_novos) {
    throw new Error(`modelo com ${produtos.length} produtos novos e o JSON diz `
      + r.produtos_novos)
  }
  if (new Set(fichas.map((f) => f.id)).size !== fichas.length) {
    throw new Error('duas fichas com o mesmo id — nome repetido no arquivo')
  }

  // A ancora que a carga cobra com EXCECAO: a soma das quantidades, que nao
  // depende de preco nenhum. Se ela nao fechar, o arquivo e o banco falam de
  // receitas diferentes, e isso nunca e "o catalogo mudou de preco".
  const somaQuantidades = arred(itens.reduce((s, i) => s + i.quantidade, 0), 4)
  if (Math.abs(somaQuantidades - r.soma_das_quantidades) > 1e-9) {
    throw new Error(`soma das quantidades ${somaQuantidades} x ${r.soma_das_quantidades}`
      + ' do JSON')
  }
  const custoTotal = arred(fichas.reduce((s, f) => s + f.custo, 0), 4)
  if (Math.abs(custoTotal - r.custo_total_das_fichas) > 0.0002) {
    throw new Error(`soma de custo ${custoTotal} x ${r.custo_total_das_fichas} do JSON`)
  }

  // Todo produto usado por um item ou existe no catalogo ou e criado aqui. O
  // gerador nao tem o catalogo, mas tem a lista de produtos novos — e o que ele
  // pode provar e que nenhum produto NOVO ficou orfao, que e o cadastro sujo
  // que a 0004 aprendeu a recusar.
  const usados = new Set(itens.map((i) => i.produto))
  const usadosPorPreparo = new Set()
  for (const p of dados.produtos_novos) {
    for (const linha of p.receita_no_nosso_catalogo ?? []) usadosPorPreparo.add(linha.produto)
  }
  for (const p of produtos) {
    if (!usados.has(p.nome) && !usadosPorPreparo.has(p.nome)) {
      throw new Error(`produto novo criado e nao usado por ficha nem por preparo: `
        + `${p.nome}. Produto orfao e cadastro sujo; tire-o do normalizador.`)
    }
  }

  const grupos = [...new Set(fichas.map((f) => f.grupo))].sort()
  if (grupos.length !== 1 || grupos[0] !== GRUPO) {
    throw new Error(`esta carga carrega o grupo ${GRUPO} e o arquivo traz: `
      + `${grupos.join(', ')}. O delete de ficha se escopa pelo grupo, entao o `
      + 'grupo do arquivo e o da constante tem de ser o mesmo.')
  }

  return {
    fichas,
    itens,
    produtos,
    grupos,
    somaQuantidades,
    custoTotal,
    produtosDepois: PRODUTOS_ANTES + produtos.length,
    resumo: r,
  }
}

// ----------------------------------------------------------------- escrita --
export function gerarSql(m, dados) {
  const p = []
  const r = m.resumo
  const subs = m.produtos.filter((x) => x.origem === 'sub_receita_da_planilha')
  const semCat = m.produtos.filter((x) => x.origem === 'ingrediente_sem_catalogo')

  p.push(`-- ---------------------------------------------------------------------------
-- 0005 · Fichas tecnicas dos PRATOS EXECUTIVOS do Bar do Zeca Norte Shopping
--
-- Gerado por scripts/gerar-seed-executivos.mjs a partir de
-- dados/executivos-fichas.json. NAO EDITE A MAO: regere.
--
-- Origem do dado: dados/EXECUTIVOS_BDZ_NORTE_SHOPPING.xlsx
--                 14 abas (13 de prato + Resumo), 24 blocos, 165 linhas
--
-- ${m.fichas.length} fichas · ${m.itens.length} itens · ${m.produtos.length} produtos novos
--   ${subs.length} sub-receitas da planilha, custo calculado RECURSIVAMENTE pelo nosso catalogo
--   ${semCat.length} ingredientes que o catalogo nao tem, custo vindo da planilha (marcados)
--
-- Custo somado das ${m.fichas.length} fichas, aos precos de hoje: R$ ${m.custoTotal}
-- Soma das quantidades dos itens (a ancora que esta carga COBRA): ${m.somaQuantidades}
--
-- Grupo do cardapio: ${GRUPO} (${m.fichas.length} fichas)
--
-- O QUE ESTA CARGA NAO FAZ
--
--  1. Nao grava custo de ficha. O custo e lido na hora, de
--     \`produtos.custo_medio\`, por \`mv_custo_do_produto\` e
--     \`vw_fichas_completas\`. Guardar congelaria o numero no dia da carga.
--
--  2. Nao grava preco de venda. DECISAO DA CLIENTE: as ${m.fichas.length} fichas nascem com
--     \`preco_venda = 0\` e os cinco indices de markup da aba Resumo
--     (${r.indices.join(' · ')}) ficam na \`descricao\`, em DUAS linhas de preco — os
--     cinco do custo da planilha e os cinco do nosso custo. A diferenca entre as
--     duas linhas e a informacao que ela quer: se o custo com que a casa
--     precifica bate com o custo real do estoque. Enquanto o preco for 0, a
--     vista devolve CMV e margem NULOS.
--
--  3. Nao encosta nas ${m.fichas.length === 13 ? '56' : 'N'} fichas de drinque que a carga 0004 deixou no banco,
--     e a secao 5 MEDE isso em vez de prometer (veja a secao 4b).
--
--  4. Nao encosta nas contagens: agosto vale R$ ${TOTAL_AGOSTO} e outubro
--     R$ ${TOTAL_OUTUBRO}, e o bloco de verificacao cobra os dois.
--
-- AS DUAS DECISOES DE LEITURA QUE MAIS MUDAM NUMERO, ditas aqui porque quem le
-- este arquivo em seis meses nao vai ter o relatorio a mao:
--
--  · \`rendimento\` = 1 nas 13, e NAO o "Rendimento (porcoes)" da planilha (0,655
--    no SCHNITZEL). A vista calcula \`custo_porcao = custo_total / rendimento\`, e
--    gravar 0,655 inflaria o custo da porcao em 52,7%. A planilha nao faz isso:
--    conferido nos 24 blocos e nas duas colunas de valor, \`Custo porcao\` =
--    \`Custo total\` / \`PESO PORCAO\` em 48 de 48 e por \`Rendimento\` em 0 de 48.
--    O 0,655 e o PESO do prato em quilos (e exatamente a soma dos Pesos
--    Liquidos nos 13 pratos) e foi para a \`descricao\`, onde e informacao e nao
--    divisor.
--
--  · \`quantidade\` = Peso Liquido e \`perda_percentual\` = (1 - 1/fator) x 100, com
--    o fator vindo da coluna \`Fator de Correcao\` — que e \`PesoBruto / Peso
--    Liquido\` em 163 de 163 linhas preenchidas, sem uma divergencia. A coluna
--    \`Perda manipulacao\` NAO foi usada: ela nao alimenta formula nenhuma da
--    planilha e contradiz as outras duas em 31 das 165 linhas. A volta
--    (\`quantidade / (1 - perda/100)\`) devolve a coluna \`PesoBruto\` em 160 das
--    165 linhas; as 5 que faltam tem Peso Liquido MAIOR que o bruto, pediriam
--    perda negativa, e estao tratadas no relatorio.
--
-- IDEMPOTENCIA. O conjunto de itens de uma ficha, e o conjunto de fichas desta
-- carga, e o que o ARQUIVO diz. Aplicar duas vezes nao duplica nada; aplicar
-- depois de encolher a lista deixa o banco exatamente igual ao arquivo.
-- ---------------------------------------------------------------------------

begin;

set local client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 0 · O ESCOPO DESTA CARGA, em tres tabelas temporarias
--
-- \`arquivo_fichas\`: os ids das ${m.fichas.length} fichas deste arquivo. Tudo daqui para baixo
-- — o delete e TODAS as perguntas da verificacao — se escopa nela, e nunca no
-- tenant. A 0004 contava o tenant e por isso parava de aplicar no dia em que a
-- cliente criasse uma ficha pela tela.
--
-- As outras duas vem na secao 0b, onde a POSSE desta carga e definida uma vez
-- so: \`fichas_desta_carga\` (o que esta carga pode apagar) e \`fichas_de_fora\`
-- (o retrato do que ela nao pode encostar).
--
-- \`on commit drop\` nas tres: elas nascem e morrem dentro da transacao.
-- ---------------------------------------------------------------------------

create temporary table arquivo_fichas (id uuid primary key) on commit drop;
`)
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
-- O caso e a coisa mais natural que a casa pode fazer: apagar um prato na tela e
-- digita-lo de novo. A ficha nova nasce com \`gen_random_uuid()\` e com o mesmo
-- nome, e a carga morre assim:
--
--     ERROR:  duplicate key value violates unique constraint "fichas_nome_unico"
--     DETAIL: Key (restaurante_id, lower(mv_sem_acento(nome)))=(…, schnitzel com
--             maionese) already exists.
--
-- Isso nao diz qual ficha, nao diz por que, e nao diz o que fazer — e a mesma
-- carga que escreve nove diagnosticos cuidadosos no fim morreria com um erro
-- cru do Postgres no meio. A trava abaixo troca o erro pela instrucao.
--
-- POR QUE NAO \`on conflict (nome)\`: isso faria a carga CAPTURAR a ficha que a
-- casa criou, sobrescrevendo o trabalho dela com o do arquivo — exatamente o que
-- o desenho da posse (\`origem_carga\`) existe para evitar. Recusar e aplicar e a
-- resposta certa; a casa decide se renomeia a dela ou se apaga.
--
-- A mesma exposicao existe em \`produtos_nome_unico\`, com a mesma forma, e por
-- isso a trava cobre os dois. Hoje ela nao dispara em produto (os ${m.produtos.length} nomes
-- desta carga e os 12 da 0004 sao disjuntos), mas o custo de cobrir e uma
-- consulta e o custo de nao cobrir e a mesma mensagem crua.
-- ---------------------------------------------------------------------------

do $$
declare
  v_n int;
  v_quais text;
begin
  -- Ficha com um dos nomes desta carga, mas com OUTRO id. Comparada pela mesma
  -- expressao do indice, senao a trava deixa passar o que o indice vai recusar.
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
    raise exception '0005: % ficha(s) com um nome desta carga e outro id: %. O indice fichas_nome_unico recusaria o insert com "duplicate key" e esta carga nao aplicaria. Isso acontece quando a ficha foi apagada e redigitada na tela. O que fazer: renomeie ou apague a ficha listada acima, e reaplique. A carga NAO a sobrescreve de proposito — o trabalho feito na tela nao e dela.',
      v_n, v_quais;
  end if;

  -- O mesmo para produto, pelo mesmo motivo e com a mesma mensagem.
  select count(*), string_agg(format('%L (id %s)', p.nome, p.id), ', ' order by p.nome)
    into v_n, v_quais
    from produtos p
   where p.restaurante_id = ${txt(RESTAURANTE_ID)}
     and p.id not in (
${listaDeIds(m.produtos.map((x) => x.id))}
     )
     and lower(mv_sem_acento(p.nome)) in (
${emLotes(m.produtos, 2).map((lote) => '       ' + lote.map((x) => `lower(mv_sem_acento(${txt(x.nome)}))`).join(', ')).join(',\n')}
     );
  if v_n <> 0 then
    raise exception '0005: % produto(s) com um nome desta carga e outro id: %. O indice produtos_nome_unico recusaria o insert. O que fazer: RENOMEIE o produto listado (ou apague-o, se ele for mesmo duplicata do desta carga) e reaplique. DESATIVAR NAO RESOLVE: o indice nao olha a coluna ativo, medido — com o produto desativado a carga recusa igual.',
      v_n, v_quais;
  end if;
end $$;
`)
  p.push(`-- ---------------------------------------------------------------------------
-- 0b · AS FICHAS QUE ESTA CARGA POSSUI, e as que ela nao possui
--
-- A posse e definida UMA VEZ, aqui, e tanto o \`delete\` da secao 4b quanto a
-- verificacao da secao 5 leem desta tabela. Escrever a regra duas vezes foi
-- exatamente o defeito que o teste da ficha removida pegou: o retrato chamava
-- de "ficha de fora" toda ficha que nao estivesse em \`arquivo_fichas\`, e com
-- isso uma ficha que uma versao ANTERIOR desta carga criou e que a versao de
-- hoje nao tem mais contava como ficha de outra carga — o delete a apagava
-- (certo) e a verificacao acusava invasao (errado), derrubando a transacao.
--
-- POSSE = estar no arquivo de hoje, OU ter o rotulo \`origem_carga = '${CARGA}'\`.
--
-- O rotulo vem da migracao 0021 e substituiu uma posse CALCULADA: ate ela, esta
-- carga reconhecia as suas fichas refazendo em SQL a conta de
-- \`UUIDv5(restaurante_id, '${ESPACO_DA_FICHA}:' || nome)\` — 21 linhas de sha1,
-- set_byte e substring — e comparando com o id gravado. Funcionava, e tinha
-- dois defeitos que o rotulo resolve de uma vez:
--
--  · **a chave era mutavel.** \`nome\` e coluna que a casa edita na tela. Ficha
--    renomeada deixava de ser reconhecida pela propria carga que a criou, e se
--    depois saisse da lista ficava no cardapio PARA SEMPRE — nem esta carga nem
--    nenhuma versao futura dela conseguia remove-la. O rotulo nao muda quando o
--    nome muda;
--  · **a separacao entre cargas dependia de convencao.** Era o prefixo que
--    separava esta carga da 0004 (\`'ficha:'\`), e uma 0006 escrita copiando uma
--    das duas e esquecendo de trocar o prefixo apagaria as fichas da outra em
--    silencio. Nao e hipotese: esta carga nasceu com \`'ficha:'\` e so um teste
--    pegou. Com o rotulo, cada carga escreve o seu literal e nao ha o que
--    esquecer.
--
-- Os ids continuam UUIDv5 do nome — eles so deixam de CARREGAR a posse, o que e
-- ganho: um id passa a ser um id.
-- ---------------------------------------------------------------------------

create temporary table fichas_desta_carga (id uuid primary key) on commit drop;

insert into fichas_desta_carga (id) select id from arquivo_fichas;

insert into fichas_desta_carga (id)
select f.id
  from fichas f
 where f.restaurante_id = ${txt(RESTAURANTE_ID)}
   and f.origem_carga = ${txt(CARGA)}
   and f.id not in (select id from arquivo_fichas)
on conflict (id) do nothing;

-- O retrato das fichas que NAO sao desta carga, tirado ANTES de qualquer insert
-- ou delete. Ele existe para uma coisa so: provar, no fim, que esta carga nao
-- encostou nas fichas de drinque da 0004. A invariancia e cobrada com
-- \`raise exception\`, e nao ha nenhum numero de outra carga escrito nela —
-- entao a prova continua valendo se a 0004 mudar de tamanho.
--
-- O custo entra no retrato porque ele TEM de ser invariante: esta carga so
-- ACRESCENTA produtos novos e nao mexe no custo de nenhum produto que ja
-- existe, logo nenhuma ficha de fora pode mudar de custo por causa dela.
create temporary table fichas_de_fora on commit drop as
  select count(*) as fichas,
         coalesce(sum(v.custo_total), 0) as custo,
         coalesce(sum(v.itens), 0) as itens
    from vw_fichas_completas v
   where v.restaurante_id = ${txt(RESTAURANTE_ID)}
     and v.id not in (select id from fichas_desta_carga);
`)

  // ------------------------------------------------------------- produtos --
  p.push(`-- ---------------------------------------------------------------------------
-- 1 · Os ${m.produtos.length} produtos novos
--
-- O nosso modulo nao tem ficha dentro de ficha (a migracao 0017 nao tem
-- sub-receita), e a planilha tem tres niveis: o prato EMPADAO DE FRANGO COM
-- SALADA leva EMPADAO DE FRANGO, que leva MASSA EMPADAO e RECHEIO EMPADAO.
-- Entao a sub-receita vira PRODUTO, como os xaropes da 0004, em categoria que
-- JA existe, setor Cozinha, \`custo_fixo = true\`.
--
-- ${subs.length} SUB-RECEITAS — custo calculado RECURSIVAMENTE PELO NOSSO CATALOGO:
--
--     custo por kg = soma(quantidade_bruta x custo_do_nosso_catalogo) / Peso Porcao
--
--   Nunca pelo \`Custo compra\` da planilha. Foi exatamente esse atalho que fez o
--   xarope de mel da 0004 nascer valendo R$ 62,79/L, porque o PDV cobra R$ 20,98
--   por uma garrafa de agua de 1,5 L — e os R$ 20,98 estavam no proprio
--   relatorio, denunciados como erro de cadastro, sendo usados como fonte de
--   custo. Aqui o custo sai do catalogo desde o primeiro dia.
${subs.map((x) => `--     ${x.nome.padEnd(30)} R$ ${String(x.custo).padStart(10)} / ${x.unidade}`).join('\n')}
--
-- ${semCat.length} INGREDIENTES QUE O CATALOGO NAO TEM e para os quais a planilha NAO da
-- receita. Para esses nao ha o que recalcular, e o custo e o \`Custo compra\` DA
-- PLANILHA. Esta e a unica excecao a regra do custo, ela esta declarada, e cada
-- um tem secao propria no relatorio:
${semCat.map((x) => `--     ${x.nome.padEnd(30)} R$ ${String(x.custo).padStart(10)} / ${x.unidade}  <<< custo da planilha`).join('\n')}
--
-- O preco pago pelos dois grupos, dito: com \`custo_fixo = true\` o custo fica
-- congelado no que esta carga calculou. O das ${subs.length} sub-receitas e derivado do
-- nosso catalogo, mas nao se recalcula sozinho quando a batata subir —
-- enquanto o modulo nao tiver sub-receita, isso e trabalho manual, e esta na
-- lista de pendencias da cliente.
-- ---------------------------------------------------------------------------
`)
  p.push(bloco(
    'produtos_novos', 'produtos',
    ['id', 'restaurante_id', 'categoria_id', 'nome', 'unidade', 'custo_medio',
      'custo_atualizado_em', 'ativo'],
    m.produtos.map((x) => [
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
  p.push(`-- O vinculo com o setor Cozinha. \`custo_fixo = true\` diz ao
-- \`mv_custo_do_produto\` que este custo e calculado pela casa e nao vem de nota
-- fiscal — que e o caso de um recheio de empadao e de um tutu de feijao.
--
-- Nota de desenho, que vale registrar porque e contraintuitivo: o que protege
-- estes custos hoje nao e a flag, e sim ninguem mexer no \`custo_medio\`. O
-- \`mv_custo_do_produto\` le \`nullif(produtos.custo_medio, 0)\` PRIMEIRO e so cai
-- no custo do setor quando o do produto e zero. A flag e documentacao para a
-- tela; os dois campos sao gravados com o mesmo numero de proposito.
`)
  p.push(bloco(
    'vinculos_novos', 'produto_setores',
    ['produto_id', 'setor_id', 'unidade', 'custo', 'ordem', 'custo_fixo',
      'custo_atualizado_em', 'ativo'],
    m.produtos.map((x) => [
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

  // --------------------------------------------------------------- fichas --
  p.push(`-- ---------------------------------------------------------------------------
-- 2 · As ${m.fichas.length} fichas
--
-- \`grupo\` = '${GRUPO}', que e o que a planilha diz em "Categoria: Executivo" nos
-- 24 blocos. Um grupo so: a Resumo e uma lista de 13 pratos do mesmo cardapio.
--
-- \`cmv_alvo\` = ${m.fichas[0].cmvAlvo}, e isto NAO e escolha de quem fez a carga: e o que as 24
-- abas usam. Cada bloco traz \`Indice de custo\` 5 e \`CMV\` 0,2 nas duas colunas
-- de valor, e a conferencia fecha em 48 de 48 (\`CMV\` = 1 / \`Indice\`). O default
-- da tabela e 30; aqui o numero vem do dado.
--
-- \`rendimento\` = 1 e \`unidade_rendimento\` = 'PORCAO'. Ver o cabecalho: o
-- "Rendimento (porcoes)" da planilha e o PESO do prato, nao uma contagem, e
-- usa-lo como divisor inflaria o custo da porcao de 0,1% a 74%.
--
-- \`descricao\` traz a tabela dos cinco indices com DUAS linhas de preco. A
-- segunda e um RETRATO da data da carga e o texto diz isso: o custo vivo esta
-- em \`vw_fichas_completas.custo_total\`, que a tela le.
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
  p.push(`-- O carimbo da posse, para a ficha que ESTA no arquivo de hoje mas que
-- nasceu antes da migracao 0021 (e por isso tem \`origem_carga\` nula). O
-- \`do update\` acima ja resolve isso, e este \`update\` existe para o caso em que
-- a linha nao passou pelo \`do update\` — e tambem porque ele casa por **id**
-- contra \`arquivo_fichas\`, o que alcanca a ficha que a casa RENOMEOU: o nome
-- mudou, o id nao.
--
-- A clausula \`origem_carga is null or = '${CARGA}'\` e o que impede esta carga de
-- reivindicar ficha de outra: se um id deste arquivo ja estivesse carimbado como
-- '0004' (impossivel hoje, porque os espacos de id sao disjuntos), o carimbo nao
-- aconteceria e a verificacao da secao 5 acusaria a contagem errada.
update fichas set origem_carga = ${txt(CARGA)}
 where id in (select id from arquivo_fichas)
   and (origem_carga is null or origem_carga = ${txt(CARGA)});
`)
  p.push('')
  p.push(`-- TRES COLUNAS de proposito FORA do \`do update\`, e as tres por medicao e nao
-- por simetria. O criterio e um so: campo em que a casa DECIDE algo a carga nao
-- sobrescreve; campo que descreve o que veio da planilha, sim.
--
--  · \`preco_venda\`: a casa vai preencher o preco pela tela, prato a prato,
--    olhando os cinco indices da descricao. Reaplicar a carga nao pode zerar
--    isso. O arquivo manda no que veio da planilha; o preco e dela.
--  · \`ativo\`: com \`ativo = true\` no \`do update\`, uma ficha que ela DESATIVOU
--    voltava ativa na reaplicacao. Desativar e como o modulo diz "este prato
--    saiu do cardapio", e a carga nao tem autoridade para discordar. (Medido na
--    0004: \`XEREM\` desativada voltava ativa.)
--  · \`cmv_alvo\`: esta saiu depois, e o motivo e o mesmo. O \`cmv_alvo\` e o OUTRO
--    LADO do indice de markup — indice 4 quer dizer CMV 25% — e a decisao que a
--    casa tomou foi justamente escolher o indice prato a prato na tela. Com
--    \`cmv_alvo\` no \`do update\`, ela punha 25 no GNOCCHI e a reaplicacao
--    devolvia 20, mudando o veredito de CMV da tela junto. Medido.
--
-- O 20 que a carga grava na PRIMEIRA vez continua sendo o da planilha (indice 5,
-- CMV 0,2, em 48 de 48 celulas) — ele e o ponto de partida, nao a palavra final.
--
-- \`modo_preparo\` nasce nulo: a planilha e de CUSTO e nao traz preparo. Nao se
-- inventa modo de preparo, e isso esta na lista da cliente. Ele tambem esta fora
-- do \`do update\`, entao o preparo que ela digitar sobrevive — medido.
`)

  // ----------------------------------------------------------------- itens --
  p.push(`-- ---------------------------------------------------------------------------
-- 3 · Os ${m.itens.length} itens
--
-- \`quantidade\` e a LIQUIDA e \`perda_percentual\` reconstroi a bruta, que e o que
-- sai do estoque — \`quantidade_bruta = quantidade / (1 - perda/100)\` na
-- \`vw_ficha_itens\`. Esta e a primeira carga que usa \`perda_percentual\` de
-- verdade: na 0004 ela ficou 0 em todos os 196 itens porque o PDF nao informava
-- perda. Aqui a planilha informa, em ${new Set(m.itens.filter((i) => i.perda > 0).map((i) => i.perda)).size} valores distintos de perda, e a
-- volta foi provada contra a coluna \`PesoBruto\` linha por linha.
--
-- \`unidade\` e SEMPRE a do NOSSO cadastro, nunca a da planilha. Gravar a da
-- planilha faria \`mv_fator_para_produto\` devolver NULO quando as familias nao
-- se convertem (KG para UND, que e o caso de 5 ingredientes), o item viraria
-- \`unidade_incompativel\`, o custo viria NULO e a verificacao desta propria
-- carga levantaria excecao. A divergencia de unidade viaja na \`observacao\`.
--
-- \`observacao\` carrega a grafia da planilha, a ABA de onde ela veio — e a aba
-- importa, porque dois blocos se chamam \`FILE DE FRANGO COM FRITAS\` em abas
-- diferentes e sao pratos distintos — e o aviso, quando ha duvida no dado.
-- ---------------------------------------------------------------------------
`)
  p.push(bloco(
    'ficha_itens', 'ficha_itens',
    ['id', 'ficha_id', 'produto_id', 'quantidade', 'unidade', 'perda_percentual',
      'observacao', 'ordem'],
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

  // ---------------------------------------------------------------- delete --
  p.push(`-- ---------------------------------------------------------------------------
-- 4 · O item que SAIU do arquivo sai do banco
--
-- O \`on conflict\` acima resolve "o item mudou" e "o item e novo"; ele NAO
-- resolve "o item deixou de existir". Sem o delete abaixo, tirar um ingrediente
-- de uma ficha no arquivo e reaplicar deixaria o ingrediente velho no banco para
-- sempre, somando custo que a receita nao tem mais. Foi assim que a carga de
-- outubro quebrou.
--
-- O delete e por PAR (ficha, produto) e nao por ficha, e e isso que o faz cobrir
-- os tres casos de uma vez: item removido da lista, ficha que encolheu, e ficha
-- que trocou um produto por outro. Ele so olha as fichas de \`arquivo_fichas\`.
-- ---------------------------------------------------------------------------

delete from ficha_itens i
 using fichas f
 where f.id = i.ficha_id
   and f.restaurante_id = ${txt(RESTAURANTE_ID)}
   and i.ficha_id in (select id from arquivo_fichas)
   and (i.ficha_id, i.produto_id) not in (
${emLotes(m.itens, 2).map((lote) => '    ' + lote.map((i) => `(${txt(i.fichaId)}, ${txt(i.produtoId)})`).join(', ')).join(',\n')}
   );

-- ---------------------------------------------------------------------------
-- 4b · A FICHA que saiu do arquivo sai do banco. E SO ELA, e aqui "so ela" e a
--      parte dificil desta carga.
--
-- O delete de item resolve "a ficha encolheu". Nao resolve "a ficha deixou de
-- existir": tirar um prato do cardapio deixaria a ficha orfa no banco, com os
-- itens apagados pelo passo 4 e o cabecalho intacto — uma ficha de custo zero
-- na tela da cliente.
--
-- O problema e saber QUAIS fichas sao desta carga, e a resposta esta na secao
-- 0b: \`fichas_desta_carga\` = o arquivo de hoje MAIS toda ficha do tenant com o
-- rotulo \`origem_carga = '${CARGA}'\`. O delete tira dessa tabela as que estao no
-- arquivo de hoje — e o que sobra e, exatamente, "ficha que uma versao anterior
-- desta carga criou e que a versao de hoje nao tem mais".
--
-- O ROTULO torna isso exato por construcao. Ele e gravado pela propria carga
-- (secao 2), sobrevive a um renome, e e outro literal na 0004 — entao:
--
--   · ficha da 0004 nao e alcancada, porque o rotulo dela e '0004';
--   · ficha feita na tela nao e alcancada, porque o rotulo dela e NULO;
--   · ficha desta carga e alcancada esteja em que grupo estiver e com o nome
--     que a casa tiver dado a ela.
--
-- O QUE ESTA SEÇÃO JA DISSE DE ERRADO, e vale ficar escrito porque o erro foi de
-- metodo e nao de codigo:
--
--   · uma versao anterior provava posse recalculando o UUIDv5 do nome e somava
--     \`grupo = '${GRUPO}'\` como segunda trava, com um comentario aqui prometendo
--     que a verificacao DETECTARIA o caso restante (a casa mover um drinque para
--     o grupo ${GRUPO}). Nao detectava: o teste apagou a ficha XEREM e a carga
--     deu COMMIT, porque o retrato das "fichas de fora" era tirado depois de ela
--     ja ter entrado no grupo;
--   · e outra versao afirmava aqui que reaplicar a 0004 apagava as 13 fichas
--     desta carga (\`DELETE 13\`). Aquilo foi medido quando esta carga ainda usava
--     o prefixo \`'ficha:'\` da 0004, e deixou de ser verdade no instante em que o
--     prefixo mudou — mas o teste nao foi refeito e a frase ficou. Hoje, medido
--     de novo: reaplicar a 0004 da \`DELETE 0\` e as 13 sobrevivem com o custo
--     igual, e num banco novo a sequencia 0005 → 0004 → 0005 fecha certo. A
--     ORDEM NAO IMPORTA e a 0004 nao precisa de conserto por causa desta carga.
--
-- As duas frases erradas tinham a mesma causa: afirmacao em comentario que
-- sobreviveu a mudanca do codigo que a sustentava. E o padrao que o laudo da
-- 0004 batizou — "a promessa escrita ao lado do codigo que a quebrava" — e a
-- regra que fica e refazer o teste sempre que a solucao muda, inclusive o teste
-- que passava.
-- ---------------------------------------------------------------------------

delete from fichas f
 where f.restaurante_id = ${txt(RESTAURANTE_ID)}
   and f.id in (select id from fichas_desta_carga)
   and f.id not in (select id from arquivo_fichas);
`)

  // ----------------------------------------------------------- verificacao --
  p.push(`-- ---------------------------------------------------------------------------
-- 5 · Verificacao. Se a conta nao fechar, a transacao cai aqui e nao na tela
--     de alguem.
--
-- TRES REGRAS DE DESENHO, todas aprendidas errando em cargas anteriores:
--
--  1. TODA pergunta se escopa em \`arquivo_fichas\`, nunca no tenant. A carga
--     responde pelo que ELA carrega. Contar o tenant fazia a 0004 recusar-se a
--     aplicar quando a cliente criava uma ficha pela tela.
--
--  2. DINHEIRO AVISA; QUANTIDADE COBRA. A 0004 tinha
--     \`if abs(v_custo - <numero>) > 0.01 then raise exception\`, e isso a
--     prendia a um catalogo congelado: uma nota fiscal de limao a tornava
--     inaplicavel (medido: limao de 7,11 para 8,00 derrubava a carga). O
--     briefing diz que o custo e derivado no banco justamente para a ficha
--     acompanhar o preco real — proibir que ele mude e proibir o que o modulo
--     existe para permitir. Entao o custo somado e \`raise warning\`, e no lugar
--     dele a excecao esta na SOMA DAS QUANTIDADES (${m.somaQuantidades}), que nao
--     depende de preco nenhum e e exatamente o que o arquivo manda.
--
--  3. O que esta carga promete sobre as fichas DE FORA e MEDIDO, nao prometido.
--     Nenhum numero de outra carga aparece escrito aqui: o retrato foi tirado na
--     secao 0 e a verificacao cobra que ele nao se mexeu. Se a 0004 crescer ou
--     encolher, esta prova continua valendo.
--
-- E \`raise warning\` e nao \`raise notice\` em todo diagnostico, porque o
-- \`set local client_min_messages = warning\` do topo esconde notice — foi por
-- isso que o "ok" da 0004 nunca aparecia em \`psql -f\`.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fichas int; v_itens int; v_quantidades numeric; v_custo numeric;
  v_produtos int; v_novos int; v_zeradas int; v_nomes text;
  v_inativos int; v_incompat int; v_sem_custo int;
  v_agosto numeric; v_outubro numeric;
  v_fora_fichas int; v_fora_custo numeric; v_fora_itens int;
  v_antes_fichas int; v_antes_custo numeric; v_antes_itens int;
  v_categorias int; v_setores int;
begin
  -- 1 · as fichas do arquivo
  select count(*) into v_fichas
    from fichas f join arquivo_fichas a on a.id = f.id;
  if v_fichas <> ${m.fichas.length} then
    raise exception '0005: % fichas do arquivo no banco, esperado ${m.fichas.length}', v_fichas;
  end if;

  -- 2 · os itens delas
  select count(*) into v_itens
    from ficha_itens i join arquivo_fichas a on a.id = i.ficha_id;
  if v_itens <> ${m.itens.length} then
    raise exception '0005: % itens das fichas do arquivo, esperado ${m.itens.length}', v_itens;
  end if;

  -- 3 · a ancora que NAO depende de preco: a soma das quantidades
  select coalesce(sum(i.quantidade), 0) into v_quantidades
    from ficha_itens i join arquivo_fichas a on a.id = i.ficha_id;
  if abs(v_quantidades - ${m.somaQuantidades}) > 0.0001 then
    raise exception '0005: soma das quantidades dos itens e %, esperado ${m.somaQuantidades} (diferenca de %)',
      v_quantidades, round(v_quantidades - ${m.somaQuantidades}, 4);
  end if;

  -- 4 · todo grupo do arquivo e '${GRUPO}', porque e esse grupo que o delete
  --     da secao 4b usa como escopo. Grupo diferente aqui seria ficha fora do
  --     alcance do proprio delete que a criou.
  select count(*) into v_fichas
    from fichas f join arquivo_fichas a on a.id = f.id
   where f.grupo <> ${txt(GRUPO)};
  if v_fichas <> 0 then
    raise exception '0005: % ficha(s) desta carga com grupo diferente de ${GRUPO}', v_fichas;
  end if;
  select count(*) into v_fichas from fichas f join arquivo_fichas a on a.id = f.id;

  -- 5 · os ${m.produtos.length} produtos novos existem, estao ativos e com custo
  select count(*) into v_novos
    from produtos p
    join produto_setores ps on ps.produto_id = p.id and ps.ativo
   where p.restaurante_id = ${txt(RESTAURANTE_ID)}
     and p.ativo
     and p.custo_medio > 0
     and p.id in (
${listaDeIds(m.produtos.map((x) => x.id))}
     );
  if v_novos <> ${m.produtos.length} then
    raise exception '0005: % dos ${m.produtos.length} produtos novos existem, ativos e com custo', v_novos;
  end if;

  -- 5b · os ${m.produtos.length} produtos novos estao no setor chamado 'Cozinha' e na categoria
  --      que o arquivo declara. Esta pergunta existe porque o id do setor NAO e
  --      funcao do nome: a 0002 renomeou "Estoque Geral" para "Cozinha" e
  --      manteve o id, entao derivar o id de 'Cozinha' da um setor que nao
  --      existe. Aqui o id vem do retrato e esta pergunta confere, pelo NOME,
  --      que ele e o setor certo — se alguem trocar a fonte do id por um
  --      UUIDv5 do nome do setor, a carga cai aqui com a mensagem explicando.
  select count(*) into v_novos
    from produto_setores ps
    join setores s on s.id = ps.setor_id
   where s.nome = ${txt('Cozinha')} and s.ativo
     and ps.ativo and ps.custo_fixo
     and ps.produto_id in (
${listaDeIds(m.produtos.map((x) => x.id))}
     );
  if v_novos <> ${m.produtos.length} then
    raise exception '0005: % dos ${m.produtos.length} produtos novos estao no setor Cozinha com custo_fixo; o id do setor NAO e o UUIDv5 do nome (a 0002 renomeou Estoque Geral para Cozinha mantendo o id)', v_novos;
  end if;

  -- 6 · nenhuma ficha desta carga com custo ZERO. Custo zero aqui e erro de
  --     mapeamento: todo prato tem ingrediente com preco.
  select count(*), coalesce(string_agg(v.nome, ', '), '') into v_zeradas, v_nomes
    from vw_fichas_completas v join arquivo_fichas a on a.id = v.id
   where v.custo_total <= 0;
  if v_zeradas <> 0 then
    raise exception '0005: % ficha(s) com custo ZERO: %', v_zeradas, v_nomes;
  end if;

  -- 7 · nenhum item apontando para produto inativo
  select count(*) into v_inativos
    from ficha_itens i
    join arquivo_fichas a on a.id = i.ficha_id
    join produtos p on p.id = i.produto_id
   where not p.ativo;
  if v_inativos <> 0 then
    raise exception '0005: % item(ns) apontando para produto INATIVO', v_inativos;
  end if;

  -- 8 · nenhum item com unidade incompativel. Se um destes aparecer, o custo
  --     dele vem NULO e a ficha mente para baixo sem avisar ninguem — e e por
  --     isso que a unidade gravada e a do nosso cadastro e nao a da planilha.
  select count(*) into v_incompat
    from vw_ficha_itens vi join arquivo_fichas a on a.id = vi.ficha_id
   where vi.unidade_incompativel;
  if v_incompat <> 0 then
    raise exception '0005: % item(ns) com unidade incompativel — o custo deles vem NULO', v_incompat;
  end if;

  -- 9 · nenhum item sem custo
  select count(*) into v_sem_custo
    from vw_ficha_itens vi join arquivo_fichas a on a.id = vi.ficha_id
   where vi.sem_custo;
  if v_sem_custo <> 0 then
    raise exception '0005: % item(ns) sem custo (produto com custo zero)', v_sem_custo;
  end if;

  -- 10 · AS FICHAS DE FORA NAO SE MEXERAM. E a promessa "nao encosta nas fichas
  --      de drinque da 0004", cobrada por medicao e sem nenhum numero de outra
  --      carga escrito aqui.
  select fichas, custo, itens into v_antes_fichas, v_antes_custo, v_antes_itens
    from fichas_de_fora;
  select count(*), coalesce(sum(v.custo_total), 0), coalesce(sum(v.itens), 0)
    into v_fora_fichas, v_fora_custo, v_fora_itens
    from vw_fichas_completas v
   where v.restaurante_id = ${txt(RESTAURANTE_ID)}
     and v.id not in (select id from arquivo_fichas);
  if v_fora_fichas <> v_antes_fichas then
    raise exception '0005: as fichas que NAO sao desta carga eram % e agora sao % — esta carga encostou em ficha de outra carga (as 0004, por exemplo). Veja a secao 4b.',
      v_antes_fichas, v_fora_fichas;
  end if;
  if v_fora_itens <> v_antes_itens then
    raise exception '0005: os itens das fichas de fora eram % e agora sao %',
      v_antes_itens, v_fora_itens;
  end if;
  if abs(v_fora_custo - v_antes_custo) > 0.0001 then
    raise exception '0005: o custo somado das fichas de fora era % e agora e % — esta carga mexeu no custo de um produto que outra ficha usa',
      round(v_antes_custo, 4), round(v_fora_custo, 4);
  end if;

  -- 11 · as duas contagens fechadas nao se mexem. Esta carga nao toca em
  --      contagem nenhuma; se um destes mudar, ela mexeu em algo que nao devia.
  --
  --      A TOLERANCIA SAI DA PRECISAO DO DADO, e nao de um numero redondo —
  --      licao A8 da 0004, onde um centavo de folga num dado de duas casas
  --      escondia 20 divergencias reais. Os dois totais sao citados com QUATRO
  --      casas, entao meia unidade da quarta casa (0,00005) e o maximo que o
  --      arredondamento de quem os escreveu explica. Uso 0,0005 porque o valor
  --      gravado de outubro e 71961,35107 e o numero combinado e 71961,3510:
  --      a diferenca de 0,00007 e arredondamento de impressao, e um centavo de
  --      mudanca de verdade (0,01) continua sendo pego com folga de 20x.
  select coalesce(sum(i.quantidade * i.custo_unitario), 0) into v_agosto
    from contagem_itens i join contagens c on c.id = i.contagem_id
   where c.restaurante_id = ${txt(RESTAURANTE_ID)} and c.referencia = '2026-08-31';
  if abs(v_agosto - ${TOTAL_AGOSTO}) > 0.0005 then
    raise exception '0005: a contagem de agosto vale agora %, e tem de valer ${TOTAL_AGOSTO}', v_agosto;
  end if;
  select coalesce(sum(i.quantidade * i.custo_unitario), 0) into v_outubro
    from contagem_itens i join contagens c on c.id = i.contagem_id
   where c.restaurante_id = ${txt(RESTAURANTE_ID)} and c.referencia = '2026-10-01';
  if abs(v_outubro - ${TOTAL_OUTUBRO}) > 0.0005 then
    raise exception '0005: a contagem de outubro vale agora %, e tem de valer ${TOTAL_OUTUBRO}', v_outubro;
  end if;

  -- ---- daqui para baixo e AVISO, nao excecao ----
  -- O custo somado PODE mudar: e isso que faz a ficha acompanhar o preco real.
  select coalesce(sum(v.custo_total), 0) into v_custo
    from vw_fichas_completas v join arquivo_fichas a on a.id = v.id;
  if abs(v_custo - ${m.custoTotal}) > 0.01 then
    raise warning '0005: custo somado das fichas e % e o arquivo previu ${m.custoTotal} — diferenca de %. Se o catalogo mudou de preco, isto e o ESPERADO (a ficha acompanha o preco real); se nao mudou, e erro de mapeamento.',
      round(v_custo, 4), round(v_custo - ${m.custoTotal}, 4);
  end if;

  select count(*) into v_produtos
    from produtos where restaurante_id = ${txt(RESTAURANTE_ID)};
  if v_produtos <> ${m.produtosDepois} then
    raise warning '0005: o tenant tem % produtos; esta carga previa ${m.produtosDepois} (= ${PRODUTOS_ANTES} antes + ${m.produtos.length} novos). Se a cliente cadastrou produto pela tela, isto e o esperado.',
      v_produtos;
  end if;

  -- Esta carga nao cria categoria nem setor: ela usa os que existem. Se um
  -- destes numeros mudar, alguma linha de categoria_id ou setor_id esta
  -- apontando para um id que o banco nao tem.
  select count(*) into v_categorias
    from categorias where restaurante_id = ${txt(RESTAURANTE_ID)};
  select count(*) into v_setores
    from setores where restaurante_id = ${txt(RESTAURANTE_ID)} and ativo;
  if v_categorias <> 21 or v_setores <> 4 then
    raise warning '0005: o tenant tem % categorias e % setores ativos; esta carga previa 21 e 4, e nao cria nem uma nem outro.',
      v_categorias, v_setores;
  end if;

  raise warning '0005 ok: % fichas, % itens, soma das quantidades %, custo somado R$ % · fichas de fora intactas: % com R$ %',
    v_fichas, v_itens, v_quantidades, round(v_custo, 4),
    v_fora_fichas, round(v_fora_custo, 4);
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
  const linha = (r, v) => console.log(`${r.padEnd(46)} ${v}`)
  linha('fichas', modelo.fichas.length)
  linha('itens', modelo.itens.length)
  linha('produtos novos', modelo.produtos.length)
  linha('  sub-receita (custo recursivo)',
    modelo.produtos.filter((x) => x.origem === 'sub_receita_da_planilha').length)
  linha('  sem catalogo (custo da planilha)',
    modelo.produtos.filter((x) => x.origem === 'ingrediente_sem_catalogo').length)
  linha('produtos no catalogo depois', modelo.produtosDepois)
  linha('soma das quantidades (ancora da excecao)', modelo.somaQuantidades)
  linha('custo total somado (R$)', modelo.custoTotal)
  linha('grupo', modelo.grupos.join(', '))
  // `sql.length` conta unidades UTF-16 e nao bytes: a diferenca e o numero de
  // caracteres nao-ASCII (924 neste arquivo, por causa dos acentos). O rotulo
  // dizia "bytes" e o numero era outro — N8 do laudo 3.
  linha('bytes de SQL', Buffer.byteLength(sql, 'utf8'))
  console.log(`\nescrito: ${DESTINO_SQL}`)
}
