// ============================================================================
// Multiverso · reestrutura de setores do Bar do Zeca
// ----------------------------------------------------------------------------
// A planilha de agosto/2026 foi contada em seis setores: Bar, Estoque Geral,
// Hortifruti, Massas e Panificacao, Molhos e Caldos e Porcionados. A operacao
// real do cliente tem QUATRO areas: Bar, Cozinha, Limpeza e Descartaveis.
//
// Este gerador escreve o SQL que leva o cadastro de um estado ao outro. Ele
// nao mexe na contagem de agosto: aquela foto esta fechada, vale R$ 78.681,36
// e e o estoque inicial do CMV. Historia nao se reescreve — os setores que
// saem de cena sao ARQUIVADOS, e as linhas ja contadas continuam apontando
// para eles. (Apagar nem seria possivel: contagem_itens.setor_id e
// `on delete restrict`, de proposito.)
//
// O ponto delicado sao 14 produtos que a planilha lista em DOIS setores com
// custos diferentes — file de tilapia e R$ 41,50/KG no Estoque Geral e R$ 6,34
// a porcao nos Porcionados. Juntando tudo em Cozinha, a chave
// (produto_id, setor_id) so admite um. A decisao do cliente foi: nada e
// substituido, porque as porcoes sao coisas diferentes. Entao cada ocorrencia
// vira um produto proprio, distinguido pela categoria — exatamente como a
// extracao ja fizera com BACON (FEIJOADA) e BARRIGA SUINA (FEIJOADA).
//
// Uso: node scripts/gerar-reestrutura.mjs
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGEM_JSON, RESTAURANTE_ID, idDe, txt, num } from './gerar-seed.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DESTINO = resolve(RAIZ, 'supabase/seed/0002_setores_do_bar_do_zeca.sql')

/** Os quatro setores que ficam, na ordem em que a folha de contagem os mostra. */
export const SETORES_FINAIS = ['Bar', 'Cozinha', 'Limpeza', 'Descartáveis']

/**
 * "Estoque Geral" nao e apagado nem esvaziado: e RENOMEADO para "Cozinha".
 *
 * E o mesmo lugar fisico com outro nome, e de longe o maior bloco (317
 * vinculos). Renomear mantem os 317 itens ja contados em agosto presos a um
 * setor vivo, em vez de deixar o maior pedaco da historia num setor
 * arquivado.
 */
export const RENOMEADO = { de: 'Estoque Geral', para: 'Cozinha' }

/** Os que saem de cena. Arquivados, nunca apagados. */
export const ARQUIVADOS = ['Hortifruti', 'Massas e Panificacao', 'Molhos e Caldos', 'Porcionados']

/**
 * Categoria manda em Limpeza e Descartaveis.
 *
 * Os 135 produtos dessas duas categorias estao todos hoje no Estoque Geral —
 * conferido no banco, nenhum no Bar. Entao o corte e limpo e nao precisa de
 * lista escrita a mao: a categoria ja diz a area.
 */
export const POR_CATEGORIA = {
  'MATERIAL DE LIMPEZA': 'Limpeza',
  'DESCARTÁVEIS': 'Descartáveis',
}

/** Ordem em que a planilha listou os setores — decide qual ocorrencia e a base. */
const ORDEM_ANTIGA = {
  Bar: 1,
  'Estoque Geral': 2,
  Hortifruti: 3,
  'Massas e Panificacao': 4,
  'Molhos e Caldos': 5,
  Porcionados: 6,
}

/** Para onde vai o vinculo, dado o setor antigo e a categoria do produto. */
export function destinoDoVinculo(setorAntigo, categoria) {
  if (setorAntigo === 'Bar') return 'Bar'
  return POR_CATEGORIA[categoria] ?? 'Cozinha'
}

/**
 * Nome do produto desdobrado.
 *
 * A categoria e o sufixo quando ela distingue as duas ocorrencias — e o que
 * ja existe no catalogo (BACON / BACON (FEIJOADA)). Quando as duas caem na
 * mesma categoria, o que as separa e a porcao, e o sufixo diz isso.
 */
export function nomeDesdobrado(nome, categoriaDaOcorrencia, categoriaDaBase) {
  const sufixo =
    categoriaDaOcorrencia !== categoriaDaBase ? categoriaDaOcorrencia : 'PORCIONADO'
  return `${nome} (${sufixo})`
}

/**
 * Le a planilha e decide, produto a produto, o que se desdobra.
 *
 * Uma ocorrencia POR SETOR: a planilha repete o mesmo produto no mesmo setor
 * em alguns blocos (o caso do POLIFLOR, listado duas vezes no Estoque Geral
 * com custo e quantidade zero), e o seed ja resolveu isso ficando com a
 * primeira. Ressuscitar a segunda aqui criaria um produto fantasma.
 */
export function montarPlano(dados = JSON.parse(readFileSync(ORIGEM_JSON, 'utf8'))) {
  const desdobrar = []

  for (const produto of dados.produtos) {
    const porSetor = new Map()
    for (const ocorrencia of produto.setores) {
      if (!porSetor.has(ocorrencia.setor)) porSetor.set(ocorrencia.setor, ocorrencia)
    }
    const foraDoBar = [...porSetor.values()]
      .filter((o) => o.setor !== 'Bar')
      .sort((a, b) => ORDEM_ANTIGA[a.setor] - ORDEM_ANTIGA[b.setor])

    if (foraDoBar.length < 2) continue

    const base = foraDoBar[0]
    for (const ocorrencia of foraDoBar.slice(1)) {
      const nome = nomeDesdobrado(produto.nome, ocorrencia.categoria, base.categoria)
      desdobrar.push({
        nome,
        id: idDe('produto', nome),
        baseNome: produto.nome,
        baseId: idDe('produto', produto.nome),
        setorDeOrigem: ocorrencia.setor,
        setorDeOrigemId: idDe('setor', ocorrencia.setor),
        categoria: ocorrencia.categoria,
        categoriaId: idDe('categoria', ocorrencia.categoria),
        unidade: ocorrencia.unidade,
        custo: ocorrencia.custo,
        destino: destinoDoVinculo(ocorrencia.setor, ocorrencia.categoria),
      })
    }
  }

  const nomesExistentes = new Set(dados.produtos.map((p) => p.nome))
  for (const d of desdobrar) {
    if (nomesExistentes.has(d.nome)) {
      throw new Error(`o desdobramento "${d.nome}" colide com um produto que ja existe`)
    }
  }
  return { desdobrar, totalDeProdutos: dados.produtos.length }
}

// ------------------------------------------------------------------- SQL ---

/**
 * Id do setor pelo nome final.
 *
 * "Cozinha" herda o id do "Estoque Geral": ela E aquela linha, renomeada. E o
 * motivo de renomear em vez de criar — os 317 itens que agosto ja contou
 * continuam presos a um setor vivo. Derivar o id do nome novo criaria um
 * segundo setor e deixaria o maior pedaco da historia orfao.
 */
const ID_DO_SETOR = {
  [RENOMEADO.para]: idDe('setor', RENOMEADO.de),
}
const idSetor = (nome) => ID_DO_SETOR[nome] ?? idDe('setor', nome)

function escrever(plano) {
  const p = []
  const R = txt(RESTAURANTE_ID)

  p.push(`-- ===========================================================================
-- Bar do Zeca · os setores passam a ser ${SETORES_FINAIS.join(', ')}
--
-- GERADO por scripts/gerar-reestrutura.mjs — nao editar a mao.
--
-- O que este arquivo faz, e o que ele deliberadamente NAO faz:
--
--   faz    renomeia "${RENOMEADO.de}" para "${RENOMEADO.para}" (mesmo lugar, nome novo)
--          cria Limpeza e Descartaveis
--          move os vinculos dos setores que saem para o destino certo
--          desdobra ${plano.desdobrar.length} produtos que existiam em dois setores com custos
--          diferentes, para que nenhum custo se perca na juncao
--          arquiva ${ARQUIVADOS.join(', ')}
--
--   nao faz nada na contagem de agosto/2026. Ela esta fechada, vale
--          R$ 78.681,3573 e e o estoque inicial do CMV. As linhas dela
--          continuam apontando para os setores de origem — inclusive os
--          arquivados. E isso que faz o historico continuar verdadeiro.
--
-- Roda quantas vezes quiser: tudo aqui e idempotente.
-- ===========================================================================

begin;

-- 1 ------------------------------------------------- o setor que so troca de nome
update setores set nome = ${txt(RENOMEADO.para)}
 where id = ${txt(idSetor(RENOMEADO.de))} and restaurante_id = ${R};

-- 2 --------------------------------------------------------- as duas areas novas
-- Os ids sao UUIDv5 do nome, como no resto da carga: rodar de novo cai na
-- mesma linha em vez de criar um setor repetido.
insert into setores (id, restaurante_id, nome, cor, ordem) values`)

  const cores = { Bar: '#866732', Cozinha: '#30551b', Limpeza: '#1c694d', 'Descartáveis': '#325186' }
  p.push(
    ['Limpeza', 'Descartáveis']
      .map((nome, i) =>
        `  (${txt(idSetor(nome))}, ${R}, ${txt(nome)}, ${txt(cores[nome])}, ${i + 3})`)
      .join(',\n') +
      `\non conflict (id) do update set nome = excluded.nome, ordem = excluded.ordem, ativo = true;`,
  )

  p.push(`
-- 3 -------------------------------------------------------- a ordem das quatro
${SETORES_FINAIS.map((nome, i) =>
  `update setores set ordem = ${i + 1}, cor = ${txt(cores[nome])}, ativo = true
 where id = ${txt(idSetor(nome))};`).join('\n')}

-- 4 ------------------------------------------------- os produtos que se desdobram
-- Cada um destes existia em dois setores com custo proprio em cada. Juntando
-- tudo em Cozinha, a chave (produto_id, setor_id) so admitiria um — e o custo
-- que a casa apurou seria o que se perderia. Viram produtos separados.`)

  for (const d of plano.desdobrar) {
    p.push(`
-- ${d.baseNome} · ${d.setorDeOrigem} ${d.unidade} ${d.custo}
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  (${txt(d.id)}, ${R}, ${txt(d.categoriaId)}, ${txt(d.nome)}, ${txt(d.unidade)}, ${num(d.custo, 6)})
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select ${txt(d.id)}, ${txt(idSetor(d.destino))}, ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = ${txt(d.baseId)} and ps.setor_id = ${txt(d.setorDeOrigemId)}
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = ${txt(d.baseId)} and setor_id = ${txt(d.setorDeOrigemId)};`)
  }

  p.push(`
-- 5 ------------------------------------- o resto dos vinculos muda de endereco
-- Primeiro os quatro setores que saem: tudo que sobrou neles vai para Cozinha.
-- Os desdobramentos do passo 4 ja sairam daqui, entao nao ha colisao de chave.
update produto_setores ps
   set setor_id = ${txt(idSetor('Cozinha'))}
 where ps.setor_id in (${ARQUIVADOS.map((n) => txt(idSetor(n))).join(', ')});

-- Depois Limpeza e Descartaveis, que saem de dentro da Cozinha. A categoria do
-- produto decide, e nao uma lista escrita a mao: os ${Object.keys(POR_CATEGORIA).length} conjuntos estao
-- inteiros no antigo Estoque Geral.
${Object.entries(POR_CATEGORIA).map(([categoria, setor]) =>
  `-- categoria ${categoria} -> setor ${setor}
update produto_setores ps
   set setor_id = ${txt(idSetor(setor))}
  from produtos p
 where p.id = ps.produto_id
   and p.categoria_id = ${txt(idDe('categoria', categoria))}  -- ${categoria}
   and ps.setor_id = ${txt(idSetor('Cozinha'))};`).join('\n\n')}

-- 6 ------------------------------------------------------ os que saem de cena
-- Arquivados, nao apagados. A contagem de agosto aponta para eles, e
-- contagem_itens.setor_id e 'on delete restrict' justamente para que ninguem
-- apague por engano um setor que tem historia.
update setores set ativo = false
 where restaurante_id = ${R}
   and id in (${ARQUIVADOS.map((n) => txt(idSetor(n))).join(', ')});

-- 7 -------------------------------------------------------------- conferencia
-- O arquivo se recusa a terminar se a conta nao fechar. Sem isto, um erro de
-- mapeamento so apareceria semanas depois, na folha de contagem.
do $$
declare v_setores integer; v_vinculos integer; v_bar integer; v_orfaos integer;
begin
  select count(*) into v_setores from setores
   where restaurante_id = ${R} and ativo;
  if v_setores <> ${SETORES_FINAIS.length} then
    raise exception 'esperava ${SETORES_FINAIS.length} setores ativos, encontrei %', v_setores;
  end if;

  select count(*) into v_vinculos from produto_setores ps
    join setores s on s.id = ps.setor_id where s.restaurante_id = ${R};
  if v_vinculos <> 868 then
    raise exception 'esperava 868 vinculos (nenhum se perde na mudanca), encontrei %', v_vinculos;
  end if;

  select count(*) into v_bar from produto_setores
   where setor_id = ${txt(idSetor('Bar'))};
  if v_bar <> 278 then
    raise exception 'o Bar nao devia ter mudado: esperava 278 vinculos, encontrei %', v_bar;
  end if;

  select count(*) into v_orfaos from produto_setores ps
    join setores s on s.id = ps.setor_id
   where s.restaurante_id = ${R} and not s.ativo;
  if v_orfaos <> 0 then
    raise exception '% vinculos ficaram num setor arquivado', v_orfaos;
  end if;

  raise notice 'setores do Bar do Zeca ok: % ativos, % vinculos, catalogo com % produtos',
    v_setores, v_vinculos, (select count(*) from produtos where restaurante_id = ${R});
end $$;

commit;`)

  return p.join('\n') + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plano = montarPlano()
  writeFileSync(DESTINO, escrever(plano), 'utf8')
  console.log(`escrito ${DESTINO}`)
  console.log(`  setores ...... ${SETORES_FINAIS.join(', ')}`)
  console.log(`  desdobrados .. ${plano.desdobrar.length}`)
  console.log(`  catalogo ..... ${plano.totalDeProdutos} -> ${plano.totalDeProdutos + plano.desdobrar.length}`)
}
