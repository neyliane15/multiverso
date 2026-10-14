-- ---------------------------------------------------------------------------
-- 0005 · Fichas tecnicas dos PRATOS EXECUTIVOS do Bar do Zeca Norte Shopping
--
-- Gerado por scripts/gerar-seed-executivos.mjs a partir de
-- dados/executivos-fichas.json. NAO EDITE A MAO: regere.
--
-- Origem do dado: dados/EXECUTIVOS_BDZ_NORTE_SHOPPING.xlsx
--                 14 abas (13 de prato + Resumo), 24 blocos, 165 linhas
--
-- 13 fichas · 99 itens · 15 produtos novos
--   9 sub-receitas da planilha, custo calculado RECURSIVAMENTE pelo nosso catalogo
--   6 ingredientes que o catalogo nao tem, custo vindo da planilha (marcados)
--
-- Custo somado das 13 fichas, aos precos de hoje: R$ 110.1092
-- Soma das quantidades dos itens (a ancora que esta carga COBRA): 9.07
--
-- Grupo do cardapio: Executivos (13 fichas)
--
-- O QUE ESTA CARGA NAO FAZ
--
--  1. Nao grava custo de ficha. O custo e lido na hora, de
--     `produtos.custo_medio`, por `mv_custo_do_produto` e
--     `vw_fichas_completas`. Guardar congelaria o numero no dia da carga.
--
--  2. Nao grava preco de venda. DECISAO DA CLIENTE: as 13 fichas nascem com
--     `preco_venda = 0` e os cinco indices de markup da aba Resumo
--     (3 · 3.5 · 4 · 4.5 · 5) ficam na `descricao`, em DUAS linhas de preco — os
--     cinco do custo da planilha e os cinco do nosso custo. A diferenca entre as
--     duas linhas e a informacao que ela quer: se o custo com que a casa
--     precifica bate com o custo real do estoque. Enquanto o preco for 0, a
--     vista devolve CMV e margem NULOS.
--
--  3. Nao encosta nas 56 fichas de drinque que a carga 0004 deixou no banco,
--     e a secao 5 MEDE isso em vez de prometer (veja a secao 4b).
--
--  4. Nao encosta nas contagens: agosto vale R$ 78681.3573 e outubro
--     R$ 71961.351, e o bloco de verificacao cobra os dois.
--
-- AS DUAS DECISOES DE LEITURA QUE MAIS MUDAM NUMERO, ditas aqui porque quem le
-- este arquivo em seis meses nao vai ter o relatorio a mao:
--
--  · `rendimento` = 1 nas 13, e NAO o "Rendimento (porcoes)" da planilha (0,655
--    no SCHNITZEL). A vista calcula `custo_porcao = custo_total / rendimento`, e
--    gravar 0,655 inflaria o custo da porcao em 52,7%. A planilha nao faz isso:
--    conferido nos 24 blocos e nas duas colunas de valor, `Custo porcao` =
--    `Custo total` / `PESO PORCAO` em 48 de 48 e por `Rendimento` em 0 de 48.
--    O 0,655 e o PESO do prato em quilos (e exatamente a soma dos Pesos
--    Liquidos nos 13 pratos) e foi para a `descricao`, onde e informacao e nao
--    divisor.
--
--  · `quantidade` = Peso Liquido e `perda_percentual` = (1 - 1/fator) x 100, com
--    o fator vindo da coluna `Fator de Correcao` — que e `PesoBruto / Peso
--    Liquido` em 163 de 163 linhas preenchidas, sem uma divergencia. A coluna
--    `Perda manipulacao` NAO foi usada: ela nao alimenta formula nenhuma da
--    planilha e contradiz as outras duas em 31 das 165 linhas. A volta
--    (`quantidade / (1 - perda/100)`) devolve a coluna `PesoBruto` em 160 das
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
-- `arquivo_fichas`: os ids das 13 fichas deste arquivo. Tudo daqui para baixo
-- — o delete e TODAS as perguntas da verificacao — se escopa nela, e nunca no
-- tenant. A 0004 contava o tenant e por isso parava de aplicar no dia em que a
-- cliente criasse uma ficha pela tela.
--
-- As outras duas vem na secao 0b, onde a POSSE desta carga e definida uma vez
-- so: `fichas_desta_carga` (o que esta carga pode apagar) e `fichas_de_fora`
-- (o retrato do que ela nao pode encostar).
--
-- `on commit drop` nas tres: elas nascem e morrem dentro da transacao.
-- ---------------------------------------------------------------------------

create temporary table arquivo_fichas (id uuid primary key) on commit drop;

-- @bloco:arquivo_fichas
insert into arquivo_fichas (id) values
  ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b'),
  ('c13c63a9-1701-5574-8fe8-fd79fc227b11'),
  ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7'),
  ('5543f567-9af1-533a-aa2f-5460f86c1719'),
  ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e'),
  ('ca06c802-a195-5afd-81df-da729255e4df'),
  ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa'),
  ('c369eb8c-fe78-5f83-b286-61313fec6882'),
  ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed'),
  ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490'),
  ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46'),
  ('d2509dff-f6ce-5728-a972-6dc16737e2e5'),
  ('3861d64f-bc4c-5689-aac0-d18655ed2f7a')
on conflict (id) do nothing;

-- @fim:arquivo_fichas

-- ---------------------------------------------------------------------------
-- 0b · AS FICHAS QUE ESTA CARGA POSSUI, e as que ela nao possui
--
-- A posse e definida UMA VEZ, aqui, e tanto o `delete` da secao 4b quanto a
-- verificacao da secao 5 leem desta tabela. Escrever a regra duas vezes foi
-- exatamente o defeito que o teste da ficha removida pegou: o retrato chamava
-- de "ficha de fora" toda ficha que nao estivesse em `arquivo_fichas`, e com
-- isso uma ficha que uma versao ANTERIOR desta carga criou e que a versao de
-- hoje nao tem mais contava como ficha de outra carga — o delete a apagava
-- (certo) e a verificacao acusava invasao (errado), derrubando a transacao.
--
-- POSSE = estar no arquivo de hoje, OU ter o `grupo` desta carga E um id que
-- seja o UUIDv5 recalculado do proprio nome. A segunda metade e o que alcanca a
-- ficha que saiu da lista; e a CONJUNCAO (grupo E UUIDv5) e o que impede que
-- ela alcance as fichas de drinque da 0004, que tambem nascem de
-- `UUIDv5(restaurante, 'ficha:' || nome)` mas estao em outro grupo.
--
-- A aritmetica do UUIDv5 (RFC 4122) em SQL, com o `pgcrypto` que o banco ja
-- tem: sha1(namespace_em_bytes || nome), 16 primeiros bytes, versao 5 no byte 6
-- e variante RFC no byte 8. E a mesma conta do `uuid5()` do gerar-seed.mjs.
-- ---------------------------------------------------------------------------

create temporary table fichas_desta_carga (id uuid primary key) on commit drop;

insert into fichas_desta_carga (id) select id from arquivo_fichas;

insert into fichas_desta_carga (id)
with posse as (
  select f.id, f.nome,
         substring(digest(decode(replace(f.restaurante_id::text, '-', ''), 'hex')
                          || convert_to('ficha-executivo:' || f.nome, 'UTF8'),
                          'sha1')
                   from 1 for 16) as h
    from fichas f
   where f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
     and f.id not in (select id from arquivo_fichas)
), v5 as (
  select id,
         encode(set_byte(set_byte(h, 6, (get_byte(h, 6) & 15) | 80),
                         8, (get_byte(h, 8) & 63) | 128), 'hex') as hex
    from posse
)
select f.id
  from fichas f
  join v5 on f.id = v5.id
 where f.id::text = substring(v5.hex, 1, 8) || '-' || substring(v5.hex, 9, 4) || '-'
                 || substring(v5.hex, 13, 4) || '-' || substring(v5.hex, 17, 4) || '-'
                 || substring(v5.hex, 21, 12)
on conflict (id) do nothing;

-- O retrato das fichas que NAO sao desta carga, tirado ANTES de qualquer insert
-- ou delete. Ele existe para uma coisa so: provar, no fim, que esta carga nao
-- encostou nas fichas de drinque da 0004. A invariancia e cobrada com
-- `raise exception`, e nao ha nenhum numero de outra carga escrito nela —
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
   where v.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
     and v.id not in (select id from fichas_desta_carga);

-- ---------------------------------------------------------------------------
-- 1 · Os 15 produtos novos
--
-- O nosso modulo nao tem ficha dentro de ficha (a migracao 0017 nao tem
-- sub-receita), e a planilha tem tres niveis: o prato EMPADAO DE FRANGO COM
-- SALADA leva EMPADAO DE FRANGO, que leva MASSA EMPADAO e RECHEIO EMPADAO.
-- Entao a sub-receita vira PRODUTO, como os xaropes da 0004, em categoria que
-- JA existe, setor Cozinha, `custo_fixo = true`.
--
-- 9 SUB-RECEITAS — custo calculado RECURSIVAMENTE PELO NOSSO CATALOGO:
--
--     custo por kg = soma(quantidade_bruta x custo_do_nosso_catalogo) / Peso Porcao
--
--   Nunca pelo `Custo compra` da planilha. Foi exatamente esse atalho que fez o
--   xarope de mel da 0004 nascer valendo R$ 62,79/L, porque o PDV cobra R$ 20,98
--   por uma garrafa de agua de 1,5 L — e os R$ 20,98 estavam no proprio
--   relatorio, denunciados como erro de cadastro, sendo usados como fonte de
--   custo. Aqui o custo sai do catalogo desde o primeiro dia.
--     MASSA EMPADÃO                  R$     4.0273 / KG
--     RECHEIO EMPADÃO                R$     13.748 / KG
--     EMPADÃO DE FRANGO              R$    11.3275 / KG
--     SALADA DA CASA (individual)    R$      23.58 / KG
--     GUARNIÇÃO À FRANCESA           R$     8.9554 / KG
--     TUTU DE FEIJÃO PRETO           R$     6.1147 / KG
--     SALADA DE LEGUMES MP           R$    25.1188 / KG
--     SALADA DE MAIONESE MP          R$     9.2998 / KG
--     BASE DE GNOCCHI                R$     11.622 / KG
--
-- 6 INGREDIENTES QUE O CATALOGO NAO TEM e para os quais a planilha NAO da
-- receita. Para esses nao ha o que recalcular, e o custo e o `Custo compra` DA
-- PLANILHA. Esta e a unica excecao a regra do custo, ela esta declarada, e cada
-- um tem secao propria no relatorio:
--     SAL COM PIMENTA                R$       2.72 / KG  <<< custo da planilha
--     BANHA                          R$          1 / KG  <<< custo da planilha
--     LEITOSA DE EMPANAMENTO         R$       7.25 / KG  <<< custo da planilha
--     ACÉM MP                        R$       62.6 / KG  <<< custo da planilha
--     PERNIL MP                      R$      36.99 / KG  <<< custo da planilha
--     ARROZ BRANCO DE BRÓCOLIS MP    R$       8.83 / KG  <<< custo da planilha
--
-- O preco pago pelos dois grupos, dito: com `custo_fixo = true` o custo fica
-- congelado no que esta carga calculou. O das 9 sub-receitas e derivado do
-- nosso catalogo, mas nao se recalcula sozinho quando a batata subir —
-- enquanto o modulo nao tiver sub-receita, isso e trabalho manual, e esta na
-- lista de pendencias da cliente.
-- ---------------------------------------------------------------------------

-- @bloco:produtos_novos
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio, custo_atualizado_em, ativo) values
  ('9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 'b0a12eca-0000-4000-8000-000000000001', '9618a2f7-9060-53c6-bedb-7bd318fad75a', 'SAL COM PIMENTA', 'KG', 2.72, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('969f31f5-c349-5dba-9e1d-3b82bb636450', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'BANHA', 'KG', 1, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('8f4a4937-9614-5cfd-9ad7-5da56fa301ac', 'b0a12eca-0000-4000-8000-000000000001', 'b778785a-3e46-5329-a237-ba003d8522a3', 'LEITOSA DE EMPANAMENTO', 'KG', 7.25, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e228ba6d-748e-5f6a-b993-308ba94d2f25', 'b0a12eca-0000-4000-8000-000000000001', 'b60937b9-20ba-5cc3-9055-b2362fd781ad', 'ACÉM MP', 'KG', 62.6, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('da10f787-d2ca-5e3f-ad6a-e16d11f50352', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'PERNIL MP', 'KG', 36.99, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('8e3a491c-5e1f-522e-beef-736e62871376', 'b0a12eca-0000-4000-8000-000000000001', 'e2f207b6-578f-5826-84f4-26b367a9ddf1', 'ARROZ BRANCO DE BRÓCOLIS MP', 'KG', 8.83, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('37321a58-4cf1-5213-a2a9-5a2a3b9527ee', 'b0a12eca-0000-4000-8000-000000000001', '3290fd5a-65e0-5322-a040-9961052eb7f3', 'MASSA EMPADÃO', 'KG', 4.0273, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('7156d30d-b75a-5542-b5a3-75f35e9a4ef2', 'b0a12eca-0000-4000-8000-000000000001', '5d3fdd64-e6e6-56f1-91f6-7c4f96dbf811', 'RECHEIO EMPADÃO', 'KG', 13.748, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('2357a894-7acf-5559-aea1-6109c8e43312', 'b0a12eca-0000-4000-8000-000000000001', '3290fd5a-65e0-5322-a040-9961052eb7f3', 'EMPADÃO DE FRANGO', 'KG', 11.3275, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('90c7f67d-c747-51d2-8d93-1227d53f3f41', 'b0a12eca-0000-4000-8000-000000000001', 'b778785a-3e46-5329-a237-ba003d8522a3', 'SALADA DA CASA (individual)', 'KG', 23.58, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a', 'b0a12eca-0000-4000-8000-000000000001', 'b778785a-3e46-5329-a237-ba003d8522a3', 'GUARNIÇÃO À FRANCESA', 'KG', 8.9554, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e0c73456-6161-5d00-a03c-79a9a2af4a48', 'b0a12eca-0000-4000-8000-000000000001', 'e2f207b6-578f-5826-84f4-26b367a9ddf1', 'TUTU DE FEIJÃO PRETO', 'KG', 6.1147, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('d9fd3f84-08bd-5fbe-a389-f8d05264bc29', 'b0a12eca-0000-4000-8000-000000000001', 'b778785a-3e46-5329-a237-ba003d8522a3', 'SALADA DE LEGUMES MP', 'KG', 25.1188, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('990c9c4b-0ecb-5e85-9118-188de9ef448c', 'b0a12eca-0000-4000-8000-000000000001', 'b778785a-3e46-5329-a237-ba003d8522a3', 'SALADA DE MAIONESE MP', 'KG', 9.2998, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e577acfe-b291-562f-932f-b2bd7f2b37c0', 'b0a12eca-0000-4000-8000-000000000001', '3290fd5a-65e0-5322-a040-9961052eb7f3', 'BASE DE GNOCCHI', 'KG', 11.622, '2026-10-14 23:59:00-03'::timestamptz, true)
on conflict (id) do update set
     categoria_id = excluded.categoria_id,
     unidade = excluded.unidade,
     custo_medio = excluded.custo_medio,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true;

-- @fim:produtos_novos

-- O vinculo com o setor Cozinha. `custo_fixo = true` diz ao
-- `mv_custo_do_produto` que este custo e calculado pela casa e nao vem de nota
-- fiscal — que e o caso de um recheio de empadao e de um tutu de feijao.
--
-- Nota de desenho, que vale registrar porque e contraintuitivo: o que protege
-- estes custos hoje nao e a flag, e sim ninguem mexer no `custo_medio`. O
-- `mv_custo_do_produto` le `nullif(produtos.custo_medio, 0)` PRIMEIRO e so cai
-- no custo do setor quando o do produto e zero. A flag e documentacao para a
-- tela; os dois campos sao gravados com o mesmo numero de proposito.

-- @bloco:vinculos_novos
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo, custo_atualizado_em, ativo) values
  ('9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 2.72, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('969f31f5-c349-5dba-9e1d-3b82bb636450', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 1, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('8f4a4937-9614-5cfd-9ad7-5da56fa301ac', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 7.25, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e228ba6d-748e-5f6a-b993-308ba94d2f25', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 62.6, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('da10f787-d2ca-5e3f-ad6a-e16d11f50352', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 36.99, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('8e3a491c-5e1f-522e-beef-736e62871376', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 8.83, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('37321a58-4cf1-5213-a2a9-5a2a3b9527ee', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 4.0273, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('7156d30d-b75a-5542-b5a3-75f35e9a4ef2', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 13.748, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('2357a894-7acf-5559-aea1-6109c8e43312', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 11.3275, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('90c7f67d-c747-51d2-8d93-1227d53f3f41', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 23.58, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 8.9554, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e0c73456-6161-5d00-a03c-79a9a2af4a48', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 6.1147, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('d9fd3f84-08bd-5fbe-a389-f8d05264bc29', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 25.1188, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('990c9c4b-0ecb-5e85-9118-188de9ef448c', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 9.2998, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true),
  ('e577acfe-b291-562f-932f-b2bd7f2b37c0', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 11.622, 1, true, '2026-10-14 23:59:00-03'::timestamptz, true)
on conflict (produto_id, setor_id) do update set
     unidade = excluded.unidade,
     custo = excluded.custo,
     custo_fixo = excluded.custo_fixo,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true;

-- @fim:vinculos_novos

-- ---------------------------------------------------------------------------
-- 2 · As 13 fichas
--
-- `grupo` = 'Executivos', que e o que a planilha diz em "Categoria: Executivo" nos
-- 24 blocos. Um grupo so: a Resumo e uma lista de 13 pratos do mesmo cardapio.
--
-- `cmv_alvo` = 20, e isto NAO e escolha de quem fez a carga: e o que as 24
-- abas usam. Cada bloco traz `Indice de custo` 5 e `CMV` 0,2 nas duas colunas
-- de valor, e a conferencia fecha em 48 de 48 (`CMV` = 1 / `Indice`). O default
-- da tabela e 30; aqui o numero vem do dado.
--
-- `rendimento` = 1 e `unidade_rendimento` = 'PORCAO'. Ver o cabecalho: o
-- "Rendimento (porcoes)" da planilha e o PESO do prato, nao uma contagem, e
-- usa-lo como divisor inflaria o custo da porcao de 0,1% a 74%.
--
-- `descricao` traz a tabela dos cinco indices com DUAS linhas de preco. A
-- segunda e um RETRATO da data da carga e o texto diz isso: o custo vivo esta
-- em `vw_fichas_completas.custo_total`, que a tela le.
-- ---------------------------------------------------------------------------

-- @bloco:fichas
insert into fichas (id, restaurante_id, nome, grupo, descricao, modo_preparo, rendimento, unidade_rendimento, preco_venda, cmv_alvo, ativo, ordem) values
  ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b', 'b0a12eca-0000-4000-8000-000000000001', 'EMPADÃO DE FRANGO COM SALADA', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,64 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 7,02)
  preço                 21,06       24,56       28,07       31,58       35,09
custo do nosso estoque (R$ 6,12) — na data da carga
  preço                 18,35       21,40       24,46       27,52       30,58

O nosso custo é -12.9% em relação ao da planilha (R$ 6,12 contra R$ 7,02). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "EMPADÃO DE FRANGO COM SALADA" (linha 1).', null, 1, 'PORCAO', 0, 20, true, 1),
  ('c13c63a9-1701-5574-8fe8-fd79fc227b11', 'b0a12eca-0000-4000-8000-000000000001', 'MINI ORELHA EXECUTIVO', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,585 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 9,91)
  preço                 29,74       34,70       39,65       44,61       49,57
custo do nosso estoque (R$ 9,58) — na data da carga
  preço                 28,73       33,52       38,31       43,10       47,89

O nosso custo é -3.4% em relação ao da planilha (R$ 9,58 contra R$ 9,91). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "MINI ORELHA EXECUTIVO", bloco "MINI ORELHA DE ELEFANTE" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 2),
  ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'b0a12eca-0000-4000-8000-000000000001', 'CARNE GUISADA  COM BATATA CORADA', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,575 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 8,92)
  preço                 26,76       31,22       35,68       40,14       44,61
custo do nosso estoque (R$ 8,57) — na data da carga
  preço                 25,70       29,98       34,26       38,54       42,83

O nosso custo é -4.0% em relação ao da planilha (R$ 8,57 contra R$ 8,92). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "CARNE GUISADA  COM BATATA CORAD", bloco "CARNE GUISADA COM BATATA CORADA" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 3),
  ('5543f567-9af1-533a-aa2f-5460f86c1719', 'b0a12eca-0000-4000-8000-000000000001', 'CARNE SECA COM TUTU À MINEIRA', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,68 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 17,13)
  preço                 51,40       59,97       68,53       77,10       85,67
custo do nosso estoque (R$ 15,25) — na data da carga
  preço                 45,76       53,38       61,01       68,63       76,26

O nosso custo é -11.0% em relação ao da planilha (R$ 15,25 contra R$ 17,13). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "CARNE SECA COM TUTU À MINEIRA", bloco "CARNE SECA COM TUTU A MINEIRA" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 4),
  ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'b0a12eca-0000-4000-8000-000000000001', 'ISCA DE FÍGADO COM PURÊ', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,7 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 5,49)
  preço                 16,46       19,20       21,94       24,69       27,43
custo do nosso estoque (R$ 4,62) — na data da carga
  preço                 13,86       16,17       18,48       20,79       23,10

O nosso custo é -15.8% em relação ao da planilha (R$ 4,62 contra R$ 5,49). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "ISCA DE FÍGADO COM PURÊ", bloco "isca de fígado com purê" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 5),
  ('ca06c802-a195-5afd-81df-da729255e4df', 'b0a12eca-0000-4000-8000-000000000001', 'FILÉ FRANGO EMPANADO COM FRITAS', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,695 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 5,68)
  preço                 17,04       19,88       22,71       25,55       28,39
custo do nosso estoque (R$ 5,61) — na data da carga
  preço                 16,83       19,63       22,43       25,24       28,04

O nosso custo é -1.2% em relação ao da planilha (R$ 5,61 contra R$ 5,68). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "FILÉ FRANGO EMPANADO COM FRITAS", bloco "FILÉ DE FRANGO COM FRITAS" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 6),
  ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'b0a12eca-0000-4000-8000-000000000001', 'FILÉ FRANGO FRITAS', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,695 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 5,87)
  preço                 17,62       20,55       23,49       26,43       29,36
custo do nosso estoque (R$ 5,82) — na data da carga
  preço                 17,46       20,37       23,28       26,19       29,10

O nosso custo é -0.9% em relação ao da planilha (R$ 5,82 contra R$ 5,87). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "FILÉ FRANGO FRITAS", bloco "FILÉ DE FRANGO COM FRITAS" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 7),
  ('c369eb8c-fe78-5f83-b286-61313fec6882', 'b0a12eca-0000-4000-8000-000000000001', 'FILÉ DE FRANGO COM LEGUMES', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,695 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 7,10)
  preço                 21,31       24,86       28,41       31,97       35,52
custo do nosso estoque (R$ 7,29) — na data da carga
  preço                 21,88       25,52       29,17       32,81       36,46

O nosso custo é +2.7% em relação ao da planilha (R$ 7,29 contra R$ 7,10). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "FILÉ DE FRANGO COM LEGUMES" (linha 1).', null, 1, 'PORCAO', 0, 20, true, 8),
  ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'b0a12eca-0000-4000-8000-000000000001', 'FILÉ DE PEIXE COM LEGUMES', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,665 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 11,37)
  preço                 34,12       39,80       45,49       51,18       56,86
custo do nosso estoque (R$ 11,57) — na data da carga
  preço                 34,70       40,48       46,26       52,04       57,83

O nosso custo é +1.7% em relação ao da planilha (R$ 11,57 contra R$ 11,37). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "FILÉ DE PEIXE COM LEGUMES" (linha 1).', null, 1, 'PORCAO', 0, 20, true, 9),
  ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'b0a12eca-0000-4000-8000-000000000001', 'FILÉ DE PEIXE COM PURÊ', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,665 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 10,48)
  preço                 31,45       36,69       41,93       47,17       52,41
custo do nosso estoque (R$ 10,67) — na data da carga
  preço                 32,01       37,35       42,68       48,02       53,35

O nosso custo é +1.8% em relação ao da planilha (R$ 10,67 contra R$ 10,48). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "FILÉ DE PEIXE COM PURÊ", bloco "FILÉ DE PEIXE COM LEGUMES" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 10),
  ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'b0a12eca-0000-4000-8000-000000000001', 'PERNIL COM MAIONESE', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,595 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 6,75)
  preço                 20,24       23,61       26,99       30,36       33,73
custo do nosso estoque (R$ 6,65) — na data da carga
  preço                 19,94       23,27       26,59       29,92       33,24

O nosso custo é -1.5% em relação ao da planilha (R$ 6,65 contra R$ 6,75). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "PERNIL COM MAIONESE" (linha 1).', null, 1, 'PORCAO', 0, 20, true, 11),
  ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'b0a12eca-0000-4000-8000-000000000001', 'SCHNITZEL COM MAIONESE', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 0,655 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 4,67)
  preço                 14,00       16,33       18,66       20,99       23,32
custo do nosso estoque (R$ 5,26) — na data da carga
  preço                 15,78       18,41       21,04       23,67       26,30

O nosso custo é +12.8% em relação ao da planilha (R$ 5,26 contra R$ 4,67). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "SCHNITZEL COM MAIONESE", bloco "SCHNITIZEL COM MAIONESE" (linha 1). O nome vendido é o da aba Resumo.', null, 1, 'PORCAO', 0, 20, true, 12),
  ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'b0a12eca-0000-4000-8000-000000000001', 'GNOCCHI COM CARNE ASSADA', 'Executivos', 'Executivo · Bar do Zeca Norte Shopping.

A receita rende 1 prato de 1,375 kg. (A planilha chama esse peso de "Rendimento (porções)"; ela não divide o custo por ele — divide pelo Peso Porção, que é 1.)
CMV alvo 20%, que é o que a própria aba usa (Índice de custo 5, CMV 0,2).

PREÇO POR ÍNDICE DE MARKUP — preço = custo × índice; o CMV é o inverso do índice.

índice                      3         3,5           4         4,5           5
-----------------------------------------------------------------------------
custo da planilha (R$ 12,92)
  preço                 38,77       45,23       51,69       58,15       64,61
custo do nosso estoque (R$ 13,11) — na data da carga
  preço                 39,34       45,90       52,46       59,02       65,57

O nosso custo é +1.5% em relação ao da planilha (R$ 13,11 contra R$ 12,92). A diferença entre as duas linhas de preço é a diferença entre o custo com que a casa precifica e o custo real do estoque.

O preço de venda nasce 0 por decisão da casa: os cinco índices ficam aqui e o preço é escolhido prato a prato na tela. Enquanto ele for 0, o CMV e a margem da ficha são nulos.

Na planilha: aba "GNOCCHI COM CARNE ASSADA" (linha 1).', null, 1, 'PORCAO', 0, 20, true, 13)
on conflict (id) do update set
     nome = excluded.nome,
     grupo = excluded.grupo,
     descricao = excluded.descricao,
     rendimento = excluded.rendimento,
     unidade_rendimento = excluded.unidade_rendimento,
     cmv_alvo = excluded.cmv_alvo,
     ordem = excluded.ordem;

-- @fim:fichas

-- `preco_venda` e `ativo` de proposito FORA do `do update`, e os dois por
-- medicao e nao por simetria:
--
--  · `preco_venda`: a cliente vai preencher o preco pela tela, prato a prato,
--    olhando os cinco indices da descricao. Reaplicar a carga nao pode zerar
--    isso. O arquivo manda no que veio da planilha; o preco e dela.
--  · `ativo`: com `ativo = true` no `do update`, uma ficha que ela DESATIVOU
--    voltava ativa na reaplicacao. Desativar e como o modulo diz "este prato
--    saiu do cardapio", e a carga nao tem autoridade para discordar. (Medido na
--    0004: `XEREM` desativada voltava ativa.)
--
-- `modo_preparo` nasce nulo: a planilha e de CUSTO e nao traz preparo. Nao se
-- inventa modo de preparo, e isso esta na lista da cliente.

-- ---------------------------------------------------------------------------
-- 3 · Os 99 itens
--
-- `quantidade` e a LIQUIDA e `perda_percentual` reconstroi a bruta, que e o que
-- sai do estoque — `quantidade_bruta = quantidade / (1 - perda/100)` na
-- `vw_ficha_itens`. Esta e a primeira carga que usa `perda_percentual` de
-- verdade: na 0004 ela ficou 0 em todos os 196 itens porque o PDF nao informava
-- perda. Aqui a planilha informa, em 7 valores distintos de perda, e a
-- volta foi provada contra a coluna `PesoBruto` linha por linha.
--
-- `unidade` e SEMPRE a do NOSSO cadastro, nunca a da planilha. Gravar a da
-- planilha faria `mv_fator_para_produto` devolver NULO quando as familias nao
-- se convertem (KG para UND, que e o caso de 5 ingredientes), o item viraria
-- `unidade_incompativel`, o custo viria NULO e a verificacao desta propria
-- carga levantaria excecao. A divergencia de unidade viaja na `observacao`.
--
-- `observacao` carrega a grafia da planilha, a ABA de onde ela veio — e a aba
-- importa, porque dois blocos se chamam `FILE DE FRANGO COM FRITAS` em abas
-- diferentes e sao pratos distintos — e o aviso, quando ha duvida no dado.
-- ---------------------------------------------------------------------------

-- @bloco:ficha_itens
insert into ficha_itens (id, ficha_id, produto_id, quantidade, unidade, perda_percentual, observacao, ordem) values
  ('87b3af88-176c-56e8-a1a9-694a6dbad1e4', 'ccda32ce-7160-5c45-a6ed-89f1eb42e06b', '2357a894-7acf-5559-aea1-6109c8e43312', 0.18, 'KG', 0, 'planilha: empadão de frango · EMPADÃO DE FRANGO COM SALADA', 1),
  ('60c7dff1-2718-5a2e-8f59-e1d75d39797d', 'ccda32ce-7160-5c45-a6ed-89f1eb42e06b', '90c7f67d-c747-51d2-8d93-1227d53f3f41', 0.14, 'KG', 0, 'planilha: salada da casa( individual) · EMPADÃO DE FRANGO COM SALADA', 2),
  ('98c694e5-25d2-599d-b88d-2591a44460bc', 'ccda32ce-7160-5c45-a6ed-89f1eb42e06b', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · EMPADÃO DE FRANGO COM SALADA', 3),
  ('428116a5-6e77-5a34-bb00-799bc54a3a1f', 'ccda32ce-7160-5c45-a6ed-89f1eb42e06b', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijãp preto pronto · EMPADÃO DE FRANGO COM SALADA', 4),
  ('c08c80b3-7dde-504f-b502-c2bcb59889e1', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', '1edb9df2-19b4-5274-8b1d-93cc29ea9364', 0.09, 'KG', 10, 'planilha: bombom de alcatra · MINI ORELHA EXECUTIVO', 1),
  ('0397fbf7-cb74-5fa6-b826-6409506283b6', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · MINI ORELHA EXECUTIVO', 2),
  ('6606facf-58fb-55a2-9434-36fafd820c3f', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', '3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a', 0.1, 'KG', 0, 'planilha: guarnição à francesa · MINI ORELHA EXECUTIVO', 3),
  ('16610194-8a4f-5930-b5ec-1cd04e775522', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · MINI ORELHA EXECUTIVO · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('ed108139-120c-547c-85a3-45133dbce2a6', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · MINI ORELHA EXECUTIVO', 5),
  ('3f956b35-5925-5c66-bafe-9f508022f2af', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · MINI ORELHA EXECUTIVO · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('cb9f2146-9235-5e7f-9371-d4d601bda679', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac', 0.02, 'KG', 0, 'planilha: leitiosa de empanamento · MINI ORELHA EXECUTIVO · numa das tres linhas a celula Unidade da planilha esta vazia', 7),
  ('22f55396-814d-5c95-a9a6-9348f349653a', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', 'e21600dd-1642-5435-9a87-f5f430a54ee7', 0.02, 'KG', 0, 'planilha: farinha pankp · MINI ORELHA EXECUTIVO', 8),
  ('267817b1-1558-5e51-b0c6-1ae7968c93a6', 'c13c63a9-1701-5574-8fe8-fd79fc227b11', '128475ff-39b7-56f3-ae73-1293beb9d365', 0.01, 'KG', 0, 'planilha: farinha de trigo · MINI ORELHA EXECUTIVO · uma das cinco linhas de farinha da planilha esta rotulada em L; a unidade gravada e KG, a do nosso cadastro', 9),
  ('4bd004c6-e3b7-5a27-82a8-8add5380d882', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'e228ba6d-748e-5f6a-b993-308ba94d2f25', 0.1, 'KG', 0, 'planilha: acém mp · CARNE GUISADA  COM BATATA CORAD · custo R$ 62,60 vindo da planilha: e acem guisado e a planilha nao da a receita', 1),
  ('737c8b76-478b-5962-a12d-c8da144dbe42', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · CARNE GUISADA  COM BATATA CORAD', 2),
  ('940707ff-d321-5798-8b7b-5f3b681ba27d', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '97c59bd2-6028-5f70-bf2d-9f2a96076277', 0.1, 'KG', 50, 'planilha: batata asterix · CARNE GUISADA  COM BATATA CORAD', 3),
  ('a8708d26-4adf-58c1-85b5-5e97f8df6749', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · CARNE GUISADA  COM BATATA CORAD · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('e8d41b17-fda2-5338-b7f7-0b907ab88cd7', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '6cd5b998-4fa3-572a-a9b0-67a352927d95', 0.05, 'KG', 0, 'planilha: farofa de bacon · CARNE GUISADA  COM BATATA CORAD', 5),
  ('0e75dce5-dc6c-5a49-95b3-5b9f5d8789fe', '636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · CARNE GUISADA  COM BATATA CORAD · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('1063abae-4315-5c89-94e5-cec4c019a8bc', '5543f567-9af1-533a-aa2f-5460f86c1719', 'd12167a2-e880-5d8f-b7e8-71eb94b962b7', 0.08, 'KG', 50, 'planilha: carne seca desfiada · CARNE SECA COM TUTU À MINEIRA', 1),
  ('d2105d97-ca2f-5754-ba4a-992230914ed5', '5543f567-9af1-533a-aa2f-5460f86c1719', '7e90b683-4849-5588-b938-8222f78f4810', 0.05, 'KG', 28.571, 'planilha: cebola branca · CARNE SECA COM TUTU À MINEIRA', 2),
  ('2aea16ad-27b5-5536-8ccd-668550fcec80', '5543f567-9af1-533a-aa2f-5460f86c1719', '8459cad7-c47f-59c6-8900-454cf67cfc81', 0.05, 'KG', 75, 'planilha: tomate picado · CARNE SECA COM TUTU À MINEIRA', 3),
  ('6f136a24-ed38-5e37-a777-b4fbaba722ec', '5543f567-9af1-533a-aa2f-5460f86c1719', '0e626ef9-04d7-5238-8fa4-b3a0da68fea4', 0.015, 'UND', 0, 'planilha: salsa picada · CARNE SECA COM TUTU À MINEIRA · a planilha mede em KG e o nosso cadastro em UND — conferir o peso da UND', 4),
  ('5d9e78cc-a89d-5d9a-83b4-4353e8e89e42', '5543f567-9af1-533a-aa2f-5460f86c1719', '969f31f5-c349-5dba-9e1d-3b82bb636450', 0.04, 'KG', 0, 'planilha: banha · CARNE SECA COM TUTU À MINEIRA · custo R$ 1,00/kg vindo da planilha, e R$ 1,00 e implausivel para banha', 5),
  ('b3e5281b-a9a5-506e-ae94-75ed4ffffa42', '5543f567-9af1-533a-aa2f-5460f86c1719', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · CARNE SECA COM TUTU À MINEIRA', 6),
  ('16807473-d3f2-5e17-8e25-93879e146a2b', '5543f567-9af1-533a-aa2f-5460f86c1719', 'c9e40591-fbe0-5641-9dba-3328a1fad2ce', 0.05, 'KG', 50, 'planilha: couve refogada mp · CARNE SECA COM TUTU À MINEIRA', 7),
  ('29b78dec-d88b-520a-97b2-b7044c52810e', '5543f567-9af1-533a-aa2f-5460f86c1719', 'e0c73456-6161-5d00-a03c-79a9a2af4a48', 0.12, 'KG', 0, 'planilha: tutu de feijão mp · CARNE SECA COM TUTU À MINEIRA', 8),
  ('effe48a7-a27a-5e7d-bf15-5a2ff8bdae69', '5543f567-9af1-533a-aa2f-5460f86c1719', '6cd5b998-4fa3-572a-a9b0-67a352927d95', 0.05, 'KG', 0, 'planilha: farofa de bacon · CARNE SECA COM TUTU À MINEIRA', 9),
  ('6e8264b2-7787-5b28-9c08-9a2c4b3f968f', '5543f567-9af1-533a-aa2f-5460f86c1719', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · CARNE SECA COM TUTU À MINEIRA · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 10),
  ('91bee3f3-a4a8-56fe-ab81-1ae10f6c9d1f', '5543f567-9af1-533a-aa2f-5460f86c1719', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · CARNE SECA COM TUTU À MINEIRA', 11),
  ('190a8d4d-92f8-5b0a-b8ab-38c0c229f001', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '085ffb7e-1eba-5c2c-89c6-3ae31e3d7971', 0.12, 'KG', 20, 'planilha: isca de fígado de boi · ISCA DE FÍGADO COM PURÊ', 1),
  ('7882cbe0-d686-5fda-926e-6e3719d75502', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '118053d9-beec-5b7d-bbb9-9912ceadee2f', 0.15, 'KG', 0, 'planilha: purê de batata mp · ISCA DE FÍGADO COM PURÊ', 2),
  ('9a1bf42a-182d-53bf-92f1-7e91581bfebd', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '7e90b683-4849-5588-b938-8222f78f4810', 0.05, 'KG', 28.571, 'planilha: cebola branca · ISCA DE FÍGADO COM PURÊ', 3),
  ('d3a6ca79-ff31-5527-9ac5-a41be0295974', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '0e626ef9-04d7-5238-8fa4-b3a0da68fea4', 0.015, 'UND', 0, 'planilha: salsa picada · ISCA DE FÍGADO COM PURÊ · a planilha mede em KG e o nosso cadastro em UND — conferir o peso da UND', 4),
  ('81733ae6-21a2-5468-8c53-08e5b7829e7f', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '969f31f5-c349-5dba-9e1d-3b82bb636450', 0.02, 'KG', 0, 'planilha: banha · ISCA DE FÍGADO COM PURÊ · custo R$ 1,00/kg vindo da planilha, e R$ 1,00 e implausivel para banha', 5),
  ('7fd887d9-1728-5652-ac1a-cb1d8bc5293e', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · ISCA DE FÍGADO COM PURÊ', 6),
  ('09998898-18e7-5ebc-8707-26814aab6f52', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão preto mp · ISCA DE FÍGADO COM PURÊ', 7),
  ('95776dc9-8b5f-594a-a635-2273b9460140', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · ISCA DE FÍGADO COM PURÊ · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 8),
  ('fc27f953-4b7d-5f54-b698-ad33fd1fdf52', 'c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · ISCA DE FÍGADO COM PURÊ', 9),
  ('9b376371-0eb1-5ef9-b75d-d6c8526dc123', 'ca06c802-a195-5afd-81df-da729255e4df', '75760a42-bafd-5208-a2c8-325aa0f85335', 0.1, 'KG', 16.667, 'planilha: filé de frango · FILÉ FRANGO EMPANADO COM FRITAS', 1),
  ('a39a2306-90a3-5d28-864a-516aa90027c5', 'ca06c802-a195-5afd-81df-da729255e4df', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · FILÉ FRANGO EMPANADO COM FRITAS', 2),
  ('0d822bb6-2e5a-56fd-b99c-8a39a307bc03', 'ca06c802-a195-5afd-81df-da729255e4df', 'a80bb22b-561c-539b-9f3b-650514050b5c', 0.15, 'KG', 0, 'planilha: batata frita · FILÉ FRANGO EMPANADO COM FRITAS', 3),
  ('9004070b-fc9c-5b3b-aa3b-e93c6c8bda8d', 'ca06c802-a195-5afd-81df-da729255e4df', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · FILÉ FRANGO EMPANADO COM FRITAS · Peso Liquido maior que o PesoBruto (0,15 > 0,12): a quantidade gravada e o PesoBruto · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('40493a99-56ed-5df6-86ef-9da011e51517', 'ca06c802-a195-5afd-81df-da729255e4df', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · FILÉ FRANGO EMPANADO COM FRITAS', 5),
  ('c84319ba-a964-5a41-80fd-4c50c19974b5', 'ca06c802-a195-5afd-81df-da729255e4df', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · FILÉ FRANGO EMPANADO COM FRITAS · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('03b65904-7b7d-5ac6-a78a-26a261f01d4a', 'ca06c802-a195-5afd-81df-da729255e4df', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac', 0.02, 'KG', 0, 'planilha: Leitosa de empanamento · FILÉ FRANGO EMPANADO COM FRITAS · numa das tres linhas a celula Unidade da planilha esta vazia', 7),
  ('7afcd785-3ef1-5c5f-b757-f23836a16190', 'ca06c802-a195-5afd-81df-da729255e4df', '128475ff-39b7-56f3-ae73-1293beb9d365', 0.01, 'KG', 0, 'planilha: Farinha de trigo · FILÉ FRANGO EMPANADO COM FRITAS · uma das cinco linhas de farinha da planilha esta rotulada em L; a unidade gravada e KG, a do nosso cadastro', 8),
  ('8e4ff4de-52fa-5c0d-8186-6c64853b940e', 'ca06c802-a195-5afd-81df-da729255e4df', 'e21600dd-1642-5435-9a87-f5f430a54ee7', 0.02, 'KG', 0, 'planilha: Farinha panko · FILÉ FRANGO EMPANADO COM FRITAS', 9),
  ('84966ec4-1675-5d3f-a733-1bee4a6e3a21', 'ca06c802-a195-5afd-81df-da729255e4df', 'd11f2374-bef0-5e32-852f-e293685e6dea', 0.02, 'LTS', 0, 'planilha: óleo de soja · FILÉ FRANGO EMPANADO COM FRITAS', 10),
  ('291bad1c-3c3b-5078-b4f6-70681153e3b0', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', '75760a42-bafd-5208-a2c8-325aa0f85335', 0.15, 'KG', 11.765, 'planilha: filé de frango · FILÉ FRANGO FRITAS', 1),
  ('85ce08d3-0a43-531c-bbf1-533fa81b2fe6', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · FILÉ FRANGO FRITAS', 2),
  ('93cf5f7e-2a50-5345-b3c4-d69b0f5c6c67', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'a80bb22b-561c-539b-9f3b-650514050b5c', 0.15, 'KG', 0, 'planilha: batata frita · FILÉ FRANGO FRITAS', 3),
  ('5b6ad9d4-057c-5617-9f07-5563374fd5ce', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · FILÉ FRANGO FRITAS · Peso Liquido maior que o PesoBruto (0,15 > 0,12): a quantidade gravada e o PesoBruto · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('e2d94e2d-8366-50a6-9f00-3473eb81cd3a', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · FILÉ FRANGO FRITAS', 5),
  ('6cd4a881-dae1-5208-8a58-8763d54a57b8', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · FILÉ FRANGO FRITAS · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('a0cb881d-835e-5d31-a8d0-1eb06309741d', '2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'd11f2374-bef0-5e32-852f-e293685e6dea', 0.02, 'LTS', 0, 'planilha: óleo de soja · FILÉ FRANGO FRITAS', 7),
  ('59442bd4-1631-53b7-ac34-d2aada99651c', 'c369eb8c-fe78-5f83-b286-61313fec6882', '75760a42-bafd-5208-a2c8-325aa0f85335', 0.15, 'KG', 0, 'planilha: filé de frango · FILÉ DE FRANGO COM LEGUMES', 1),
  ('04c9e0bb-ce5f-5a05-91b5-388697e69afd', 'c369eb8c-fe78-5f83-b286-61313fec6882', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · FILÉ DE FRANGO COM LEGUMES', 2),
  ('5d43e6f9-bc4b-51a3-ba4f-dc2f571e648b', 'c369eb8c-fe78-5f83-b286-61313fec6882', 'd9fd3f84-08bd-5fbe-a389-f8d05264bc29', 0.15, 'KG', 0, 'planilha: salada de legumes · FILÉ DE FRANGO COM LEGUMES', 3),
  ('fbfc8bcc-907b-56d2-8c57-4b1434bb2cc2', 'c369eb8c-fe78-5f83-b286-61313fec6882', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · FILÉ DE FRANGO COM LEGUMES · Peso Liquido maior que o PesoBruto (0,15 > 0,12): a quantidade gravada e o PesoBruto · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('bf00b210-533e-55d2-b168-a94a1f91e4e8', 'c369eb8c-fe78-5f83-b286-61313fec6882', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · FILÉ DE FRANGO COM LEGUMES', 5),
  ('25996e2a-b527-51be-918d-2953c677dfd9', 'c369eb8c-fe78-5f83-b286-61313fec6882', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · FILÉ DE FRANGO COM LEGUMES · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('a2ab380d-0cdc-5a3f-8eaf-5b73a6a1a515', 'c369eb8c-fe78-5f83-b286-61313fec6882', 'd11f2374-bef0-5e32-852f-e293685e6dea', 0.02, 'LTS', 0, 'planilha: óleo de soja · FILÉ DE FRANGO COM LEGUMES', 7),
  ('a2a43d51-a046-5f8d-86a9-cc0e91bf3c5e', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', '87c945e4-cb26-5333-a93e-16d6a01e2a87', 0.12, 'KG', 20, 'planilha: filé de tilápia · FILÉ DE PEIXE COM LEGUMES', 1),
  ('f552a4ef-43a4-577e-92de-fa5b2cfe84bd', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · FILÉ DE PEIXE COM LEGUMES', 2),
  ('94df27b6-1224-5aea-995c-54f1558ff7c6', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'd9fd3f84-08bd-5fbe-a389-f8d05264bc29', 0.15, 'KG', 0, 'planilha: salada de legumes · FILÉ DE PEIXE COM LEGUMES', 3),
  ('8a57eeea-7e79-5855-b15c-0168591a717d', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · FILÉ DE PEIXE COM LEGUMES · Peso Liquido maior que o PesoBruto (0,15 > 0,12): a quantidade gravada e o PesoBruto · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('fffe1f3f-c8f1-57ad-bb37-211dc5f32b40', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · FILÉ DE PEIXE COM LEGUMES', 5),
  ('302e8bab-a9e8-5377-8075-541a9a824669', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · FILÉ DE PEIXE COM LEGUMES · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('b01ee713-c410-516d-8881-3d03118985d7', '79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'd11f2374-bef0-5e32-852f-e293685e6dea', 0.02, 'LTS', 0, 'planilha: óleo de soja · FILÉ DE PEIXE COM LEGUMES', 7),
  ('3bd7fc05-e335-567b-abc1-5be4aabe7bf6', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '87c945e4-cb26-5333-a93e-16d6a01e2a87', 0.12, 'KG', 20, 'planilha: filé de tilápia · FILÉ DE PEIXE COM PURÊ', 1),
  ('46b51332-45f4-5913-9856-e3278d78813e', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '8e3a491c-5e1f-522e-beef-736e62871376', 0.2, 'KG', 0, 'planilha: arroz  branco de brocolis mp · FILÉ DE PEIXE COM PURÊ', 2),
  ('f837c510-3bee-5192-8b8f-8718fedd0ff5', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '118053d9-beec-5b7d-bbb9-9912ceadee2f', 0.15, 'KG', 0, 'planilha: purê de batata mp · FILÉ DE PEIXE COM PURÊ', 3),
  ('5d9d23f4-2ab3-5629-bca7-7462fd6750a7', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · FILÉ DE PEIXE COM PURÊ · Peso Liquido maior que o PesoBruto (0,15 > 0,12): a quantidade gravada e o PesoBruto · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('5091c89d-538b-5bca-9561-462db0505af2', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · FILÉ DE PEIXE COM PURÊ', 5),
  ('1676efda-1374-5d06-8a60-a11f369eae69', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · FILÉ DE PEIXE COM PURÊ · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('eeb793e7-c8e4-5f43-a7df-90cbb1a6726a', '07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'd11f2374-bef0-5e32-852f-e293685e6dea', 0.02, 'LTS', 0, 'planilha: óleo de soja · FILÉ DE PEIXE COM PURÊ', 7),
  ('2d4be078-b763-5084-a8de-82a9a9cc4f20', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'da10f787-d2ca-5e3f-ad6a-e16d11f50352', 0.12, 'KG', 0, 'planilha: Pernil MP · PERNIL COM MAIONESE · custo R$ 36,99 vindo da planilha: e pernil assado e a planilha nao da a receita', 1),
  ('ee0330aa-7b53-52a2-9002-87d116fde63d', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · PERNIL COM MAIONESE', 2),
  ('8f152949-0147-52b0-bfcf-c424c9e3ded1', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '990c9c4b-0ecb-5e85-9118-188de9ef448c', 0.1, 'KG', 0, 'planilha: Salada de Maionese MP · PERNIL COM MAIONESE', 3),
  ('4da316fe-2380-5507-9316-a9e6ab13b8a0', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · PERNIL COM MAIONESE · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('690944de-05b5-5d73-925a-de10acc118f9', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '6cd5b998-4fa3-572a-a9b0-67a352927d95', 0.05, 'KG', 0, 'planilha: farofa de bacon · PERNIL COM MAIONESE', 5),
  ('a2b1f550-416c-5951-ae1f-16ce54576d45', 'e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · PERNIL COM MAIONESE · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 6),
  ('ed7fc95d-f4ce-527d-8e26-970d9185907b', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', 'da34f141-0c21-520c-9682-a6466be4cdf8', 0.1, 'KG', 16.667, 'planilha: copalombo · SCHNITZEL COM MAIONESE · mapeado para LOMBO SUÍNO e nao para COPA LOMBO (120G/250G), que no nosso catalogo sao porcao pronta com custo de porcao numa unidade KG', 1),
  ('d32992da-8218-50e9-821d-f90c90e136d3', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', 0.2, 'KG', 0, 'planilha: arroz  branco pronto · SCHNITZEL COM MAIONESE', 2),
  ('84ce4036-d013-5d4a-bb3a-92abfd6faafe', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', '990c9c4b-0ecb-5e85-9118-188de9ef448c', 0.1, 'KG', 0, 'planilha: Salada de maionese MP · SCHNITZEL COM MAIONESE', 3),
  ('452e72ad-362e-520e-91d6-e8b2cccb3fa6', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', 'eb9dcea5-e35e-59aa-bc11-f36963955283', 0.12, 'KG', 0, 'planilha: feijão pronto · SCHNITZEL COM MAIONESE · nas 5 fichas em que a planilha traz Peso Liquido 0,15 maior que o PesoBruto 0,12, a quantidade gravada e 0,12 — ver o relatorio', 4),
  ('4f9916e5-82b5-5214-8c1d-411173979ef0', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', '128475ff-39b7-56f3-ae73-1293beb9d365', 0.05, 'KG', 0, 'planilha: farinha de trigo · SCHNITZEL COM MAIONESE · uma das cinco linhas de farinha da planilha esta rotulada em L; a unidade gravada e KG, a do nosso cadastro', 5),
  ('6bc2f617-add5-5d29-a287-83f5b2f10da7', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', 'e21600dd-1642-5435-9a87-f5f430a54ee7', 0.02, 'KG', 0, 'planilha: farinha panko · SCHNITZEL COM MAIONESE', 6),
  ('5f7ba118-7b93-56e7-8699-969b004683b1', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac', 0.02, 'KG', 0, 'planilha: leitosa de empanamento · SCHNITZEL COM MAIONESE · numa das tres linhas a celula Unidade da planilha esta vazia', 7),
  ('56d8eaac-86d9-54fd-b0ff-9dc50c9c2d61', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', 0.005, 'KG', 0, 'planilha: sal com pimenta · SCHNITZEL COM MAIONESE · custo R$ 2,72/kg vindo da planilha, que e o mesmo preco do sal puro: na conta dela a pimenta custa zero', 8),
  ('06c5c5eb-2ed8-5eef-8b2c-cd0f06323760', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', 'a69083be-e47d-5939-9c67-92a252f45374', 0.02, 'KG', 0, 'planilha: alho batido · SCHNITZEL COM MAIONESE', 9),
  ('c2112e82-619e-5563-a7e9-a42dfdd9dcff', 'd2509dff-f6ce-5728-a972-6dc16737e2e5', '13edac0f-c071-59e4-8c16-8e07d7fe3f3c', 0.02, 'KG', 0, 'planilha: limão sciciliano · SCHNITZEL COM MAIONESE', 10),
  ('15240ecf-f220-513b-beb5-1d9e5ee0522f', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', '73e1dd71-f9a2-59b8-b682-ce52086f21c0', 1, 'UND', 0, 'planilha: Carne assada 120gr · GNOCCHI COM CARNE ASSADA · o PesoBruto 1 e UMA porcao de 120 g; o nosso cadastro mede em UND e custa R$ 7,97, igual ao Custo compra · a planilha rotula 1 KG e o nome diz 120 g; gravado como 1 UND da porcao de 120 g, que e o que o Custo compra R$ 7,97 precifica', 1),
  ('f91ea7b6-dc41-5b3e-8379-5aeb866e630a', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'e577acfe-b291-562f-932f-b2bd7f2b37c0', 0.25, 'KG', 0, 'planilha: Base de gnocchi · GNOCCHI COM CARNE ASSADA', 2),
  ('b5e33513-6665-5b14-b927-4bd497042258', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'b6397ef5-3551-5712-a3c2-dae5abb37007', 0.05, 'KG', 0, 'planilha: Molho ao sugo · GNOCCHI COM CARNE ASSADA', 3),
  ('2b5ec15a-1d09-5965-8792-cebe33d1136d', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', '1fad2733-3491-5d7d-8b03-1ca12ea54cfc', 0.02, 'KG', 0, 'planilha: Parmesão · GNOCCHI COM CARNE ASSADA', 4),
  ('59c7653e-2218-5fec-93c8-4595d9c4061a', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', '2f59adb3-0ee9-5c27-829a-3ed23e36ac14', 0.05, 'KG', 0, 'planilha: Caldo de carne · GNOCCHI COM CARNE ASSADA', 5),
  ('ff8395df-8b16-57ab-a845-606d8818e7d7', '3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'bcdcb808-aa5a-589e-b7c8-da9437be95d1', 0.005, 'UND', 0, 'planilha: Manjericão · GNOCCHI COM CARNE ASSADA · a planilha mede em KG e o nosso cadastro em UND — conferir o peso da UND', 6)
on conflict (ficha_id, produto_id) do update set
     quantidade = excluded.quantidade,
     unidade = excluded.unidade,
     perda_percentual = excluded.perda_percentual,
     observacao = excluded.observacao,
     ordem = excluded.ordem;

-- @fim:ficha_itens

-- ---------------------------------------------------------------------------
-- 4 · O item que SAIU do arquivo sai do banco
--
-- O `on conflict` acima resolve "o item mudou" e "o item e novo"; ele NAO
-- resolve "o item deixou de existir". Sem o delete abaixo, tirar um ingrediente
-- de uma ficha no arquivo e reaplicar deixaria o ingrediente velho no banco para
-- sempre, somando custo que a receita nao tem mais. Foi assim que a carga de
-- outubro quebrou.
--
-- O delete e por PAR (ficha, produto) e nao por ficha, e e isso que o faz cobrir
-- os tres casos de uma vez: item removido da lista, ficha que encolheu, e ficha
-- que trocou um produto por outro. Ele so olha as fichas de `arquivo_fichas`.
-- ---------------------------------------------------------------------------

delete from ficha_itens i
 using fichas f
 where f.id = i.ficha_id
   and f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
   and i.ficha_id in (select id from arquivo_fichas)
   and (i.ficha_id, i.produto_id) not in (
    ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b', '2357a894-7acf-5559-aea1-6109c8e43312'), ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b', '90c7f67d-c747-51d2-8d93-1227d53f3f41'),
    ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('ccda32ce-7160-5c45-a6ed-89f1eb42e06b', 'eb9dcea5-e35e-59aa-bc11-f36963955283'),
    ('c13c63a9-1701-5574-8fe8-fd79fc227b11', '1edb9df2-19b4-5274-8b1d-93cc29ea9364'), ('c13c63a9-1701-5574-8fe8-fd79fc227b11', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'),
    ('c13c63a9-1701-5574-8fe8-fd79fc227b11', '3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a'), ('c13c63a9-1701-5574-8fe8-fd79fc227b11', 'eb9dcea5-e35e-59aa-bc11-f36963955283'),
    ('c13c63a9-1701-5574-8fe8-fd79fc227b11', 'a69083be-e47d-5939-9c67-92a252f45374'), ('c13c63a9-1701-5574-8fe8-fd79fc227b11', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'),
    ('c13c63a9-1701-5574-8fe8-fd79fc227b11', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac'), ('c13c63a9-1701-5574-8fe8-fd79fc227b11', 'e21600dd-1642-5435-9a87-f5f430a54ee7'),
    ('c13c63a9-1701-5574-8fe8-fd79fc227b11', '128475ff-39b7-56f3-ae73-1293beb9d365'), ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'e228ba6d-748e-5f6a-b993-308ba94d2f25'),
    ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '97c59bd2-6028-5f70-bf2d-9f2a96076277'),
    ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '6cd5b998-4fa3-572a-a9b0-67a352927d95'),
    ('636b9ea4-5c1b-5a92-9df4-ec63b824c8e7', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('5543f567-9af1-533a-aa2f-5460f86c1719', 'd12167a2-e880-5d8f-b7e8-71eb94b962b7'),
    ('5543f567-9af1-533a-aa2f-5460f86c1719', '7e90b683-4849-5588-b938-8222f78f4810'), ('5543f567-9af1-533a-aa2f-5460f86c1719', '8459cad7-c47f-59c6-8900-454cf67cfc81'),
    ('5543f567-9af1-533a-aa2f-5460f86c1719', '0e626ef9-04d7-5238-8fa4-b3a0da68fea4'), ('5543f567-9af1-533a-aa2f-5460f86c1719', '969f31f5-c349-5dba-9e1d-3b82bb636450'),
    ('5543f567-9af1-533a-aa2f-5460f86c1719', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('5543f567-9af1-533a-aa2f-5460f86c1719', 'c9e40591-fbe0-5641-9dba-3328a1fad2ce'),
    ('5543f567-9af1-533a-aa2f-5460f86c1719', 'e0c73456-6161-5d00-a03c-79a9a2af4a48'), ('5543f567-9af1-533a-aa2f-5460f86c1719', '6cd5b998-4fa3-572a-a9b0-67a352927d95'),
    ('5543f567-9af1-533a-aa2f-5460f86c1719', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('5543f567-9af1-533a-aa2f-5460f86c1719', 'a69083be-e47d-5939-9c67-92a252f45374'),
    ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '085ffb7e-1eba-5c2c-89c6-3ae31e3d7971'), ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '118053d9-beec-5b7d-bbb9-9912ceadee2f'),
    ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '7e90b683-4849-5588-b938-8222f78f4810'), ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '0e626ef9-04d7-5238-8fa4-b3a0da68fea4'),
    ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '969f31f5-c349-5dba-9e1d-3b82bb636450'), ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'),
    ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'),
    ('c05f5997-d1b7-5fe6-842e-c8d5e3b31d6e', 'a69083be-e47d-5939-9c67-92a252f45374'), ('ca06c802-a195-5afd-81df-da729255e4df', '75760a42-bafd-5208-a2c8-325aa0f85335'),
    ('ca06c802-a195-5afd-81df-da729255e4df', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('ca06c802-a195-5afd-81df-da729255e4df', 'a80bb22b-561c-539b-9f3b-650514050b5c'),
    ('ca06c802-a195-5afd-81df-da729255e4df', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('ca06c802-a195-5afd-81df-da729255e4df', 'a69083be-e47d-5939-9c67-92a252f45374'),
    ('ca06c802-a195-5afd-81df-da729255e4df', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('ca06c802-a195-5afd-81df-da729255e4df', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac'),
    ('ca06c802-a195-5afd-81df-da729255e4df', '128475ff-39b7-56f3-ae73-1293beb9d365'), ('ca06c802-a195-5afd-81df-da729255e4df', 'e21600dd-1642-5435-9a87-f5f430a54ee7'),
    ('ca06c802-a195-5afd-81df-da729255e4df', 'd11f2374-bef0-5e32-852f-e293685e6dea'), ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', '75760a42-bafd-5208-a2c8-325aa0f85335'),
    ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'a80bb22b-561c-539b-9f3b-650514050b5c'),
    ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'a69083be-e47d-5939-9c67-92a252f45374'),
    ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('2d7cc0a5-8104-5765-bfcc-fa98d04438aa', 'd11f2374-bef0-5e32-852f-e293685e6dea'),
    ('c369eb8c-fe78-5f83-b286-61313fec6882', '75760a42-bafd-5208-a2c8-325aa0f85335'), ('c369eb8c-fe78-5f83-b286-61313fec6882', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'),
    ('c369eb8c-fe78-5f83-b286-61313fec6882', 'd9fd3f84-08bd-5fbe-a389-f8d05264bc29'), ('c369eb8c-fe78-5f83-b286-61313fec6882', 'eb9dcea5-e35e-59aa-bc11-f36963955283'),
    ('c369eb8c-fe78-5f83-b286-61313fec6882', 'a69083be-e47d-5939-9c67-92a252f45374'), ('c369eb8c-fe78-5f83-b286-61313fec6882', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'),
    ('c369eb8c-fe78-5f83-b286-61313fec6882', 'd11f2374-bef0-5e32-852f-e293685e6dea'), ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', '87c945e4-cb26-5333-a93e-16d6a01e2a87'),
    ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'd9fd3f84-08bd-5fbe-a389-f8d05264bc29'),
    ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'a69083be-e47d-5939-9c67-92a252f45374'),
    ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('79e10549-7ced-5edc-8eb6-9fa3a01b8fed', 'd11f2374-bef0-5e32-852f-e293685e6dea'),
    ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '87c945e4-cb26-5333-a93e-16d6a01e2a87'), ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '8e3a491c-5e1f-522e-beef-736e62871376'),
    ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '118053d9-beec-5b7d-bbb9-9912ceadee2f'), ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'eb9dcea5-e35e-59aa-bc11-f36963955283'),
    ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'a69083be-e47d-5939-9c67-92a252f45374'), ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'),
    ('07e7fd1e-ae2a-5cd3-a5aa-e3980ac6d490', 'd11f2374-bef0-5e32-852f-e293685e6dea'), ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'da10f787-d2ca-5e3f-ad6a-e16d11f50352'),
    ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '990c9c4b-0ecb-5e85-9118-188de9ef448c'),
    ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '6cd5b998-4fa3-572a-a9b0-67a352927d95'),
    ('e10f2aec-e835-5aa9-bfc9-59b1a0fb2b46', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'da34f141-0c21-520c-9682-a6466be4cdf8'),
    ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8'), ('d2509dff-f6ce-5728-a972-6dc16737e2e5', '990c9c4b-0ecb-5e85-9118-188de9ef448c'),
    ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'eb9dcea5-e35e-59aa-bc11-f36963955283'), ('d2509dff-f6ce-5728-a972-6dc16737e2e5', '128475ff-39b7-56f3-ae73-1293beb9d365'),
    ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'e21600dd-1642-5435-9a87-f5f430a54ee7'), ('d2509dff-f6ce-5728-a972-6dc16737e2e5', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac'),
    ('d2509dff-f6ce-5728-a972-6dc16737e2e5', '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b'), ('d2509dff-f6ce-5728-a972-6dc16737e2e5', 'a69083be-e47d-5939-9c67-92a252f45374'),
    ('d2509dff-f6ce-5728-a972-6dc16737e2e5', '13edac0f-c071-59e4-8c16-8e07d7fe3f3c'), ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', '73e1dd71-f9a2-59b8-b682-ce52086f21c0'),
    ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'e577acfe-b291-562f-932f-b2bd7f2b37c0'), ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'b6397ef5-3551-5712-a3c2-dae5abb37007'),
    ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', '1fad2733-3491-5d7d-8b03-1ca12ea54cfc'), ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', '2f59adb3-0ee9-5c27-829a-3ed23e36ac14'),
    ('3861d64f-bc4c-5689-aac0-d18655ed2f7a', 'bcdcb808-aa5a-589e-b7c8-da9437be95d1')
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
-- 0b: `fichas_desta_carga` = o arquivo de hoje MAIS toda ficha do tenant cujo
-- id seja o UUIDv5 recalculado de `'ficha-executivo:' || nome`. O delete
-- tira dessa tabela as que estao no arquivo de hoje — e o que sobra e,
-- exatamente, "ficha que uma versao anterior desta carga criou e que a versao
-- de hoje nao tem mais".
--
-- O ESPACO DE NOMES 'ficha-executivo' E O QUE TORNA ISSO EXATO. A 0004 usa
-- 'ficha:' e esta certa para ela; se esta carga usasse o mesmo prefixo, a posse
-- viraria um palpite e o delete alcancaria as fichas da outra carga. Isso foi
-- medido: a clausula da 0004, copiada tal e qual para ca, alcanca as 56 fichas
-- de drinque — 49 em Drinques, 3 em Happy Hour, 4 em Sem Alcool, contadas.
-- Com o prefixo proprio, nenhuma ficha da 0004 e nenhuma ficha criada na tela
-- (que nasce de `gen_random_uuid()`) satisfaz a igualdade; seria preciso
-- acertar 122 bits.
--
-- E POR QUE NAO HA CLAUSULA DE `grupo` AQUI. A primeira versao desta carga
-- tinha: ela usava 'ficha:' e somava `grupo = 'Executivos'` como segunda trava.
-- O teste derrubou as duas metades dessa ideia:
--
--   · o `grupo` nao protege o que importa — a cliente mover a ficha XEREM para
--     o grupo "Executivos" fez esta carga APAGA-LA, e a carga deu COMMIT, porque
--     o retrato das "fichas de fora" era tirado depois de ela ja ter entrado no
--     grupo. O comentario de entao prometia que a verificacao detectaria o
--     caso. Nao detectava;
--   · e o `grupo` ATRAPALHA no caso legitimo: se a cliente mudar o grupo de
--     uma ficha DESTA carga e ela depois sair da lista, a clausula de grupo
--     impediria o delete e deixaria a ficha orfa no banco.
--
-- Com a posse pelo espaco de nomes, os dois casos ficam certos sem clausula de
-- grupo: o drinque movido nao e alcancado porque o id nao casa, e a ficha desta
-- carga e alcancada esteja ela em que grupo estiver.
--
-- A aritmetica do UUIDv5 (RFC 4122) em SQL, com o `pgcrypto` que o banco ja
-- tem: sha1(namespace_em_bytes || nome), 16 primeiros bytes, versao 5 no byte 6
-- e variante RFC no byte 8. E a mesma conta do `uuid5()` do gerar-seed.mjs.
--
-- O QUE ESTA CARGA NAO PODE RESOLVER, e esta no laudo: a 0004 nao tem espaco de
-- nomes proprio nem clausula de grupo, entao REAPLICAR A 0004 depois desta
-- apaga as 13 fichas daqui (`DELETE 13`, medido). O conserto e uma linha na
-- 0004 e nao e entregavel deste turno. Enquanto isso, a ordem importa: 0004
-- antes, 0005 depois — que e a ordem em que supabase/testes/executar.sh aplica.
-- ---------------------------------------------------------------------------

delete from fichas f
 where f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
   and f.id in (select id from fichas_desta_carga)
   and f.id not in (select id from arquivo_fichas);

-- ---------------------------------------------------------------------------
-- 5 · Verificacao. Se a conta nao fechar, a transacao cai aqui e nao na tela
--     de alguem.
--
-- TRES REGRAS DE DESENHO, todas aprendidas errando em cargas anteriores:
--
--  1. TODA pergunta se escopa em `arquivo_fichas`, nunca no tenant. A carga
--     responde pelo que ELA carrega. Contar o tenant fazia a 0004 recusar-se a
--     aplicar quando a cliente criava uma ficha pela tela.
--
--  2. DINHEIRO AVISA; QUANTIDADE COBRA. A 0004 tinha
--     `if abs(v_custo - <numero>) > 0.01 then raise exception`, e isso a
--     prendia a um catalogo congelado: uma nota fiscal de limao a tornava
--     inaplicavel (medido: limao de 7,11 para 8,00 derrubava a carga). O
--     briefing diz que o custo e derivado no banco justamente para a ficha
--     acompanhar o preco real — proibir que ele mude e proibir o que o modulo
--     existe para permitir. Entao o custo somado e `raise warning`, e no lugar
--     dele a excecao esta na SOMA DAS QUANTIDADES (9.07), que nao
--     depende de preco nenhum e e exatamente o que o arquivo manda.
--
--  3. O que esta carga promete sobre as fichas DE FORA e MEDIDO, nao prometido.
--     Nenhum numero de outra carga aparece escrito aqui: o retrato foi tirado na
--     secao 0 e a verificacao cobra que ele nao se mexeu. Se a 0004 crescer ou
--     encolher, esta prova continua valendo.
--
-- E `raise warning` e nao `raise notice` em todo diagnostico, porque o
-- `set local client_min_messages = warning` do topo esconde notice — foi por
-- isso que o "ok" da 0004 nunca aparecia em `psql -f`.
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
  if v_fichas <> 13 then
    raise exception '0005: % fichas do arquivo no banco, esperado 13', v_fichas;
  end if;

  -- 2 · os itens delas
  select count(*) into v_itens
    from ficha_itens i join arquivo_fichas a on a.id = i.ficha_id;
  if v_itens <> 99 then
    raise exception '0005: % itens das fichas do arquivo, esperado 99', v_itens;
  end if;

  -- 3 · a ancora que NAO depende de preco: a soma das quantidades
  select coalesce(sum(i.quantidade), 0) into v_quantidades
    from ficha_itens i join arquivo_fichas a on a.id = i.ficha_id;
  if abs(v_quantidades - 9.07) > 0.0001 then
    raise exception '0005: soma das quantidades dos itens e %, esperado 9.07 (diferenca de %)',
      v_quantidades, round(v_quantidades - 9.07, 4);
  end if;

  -- 4 · todo grupo do arquivo e 'Executivos', porque e esse grupo que o delete
  --     da secao 4b usa como escopo. Grupo diferente aqui seria ficha fora do
  --     alcance do proprio delete que a criou.
  select count(*) into v_fichas
    from fichas f join arquivo_fichas a on a.id = f.id
   where f.grupo <> 'Executivos';
  if v_fichas <> 0 then
    raise exception '0005: % ficha(s) desta carga com grupo diferente de Executivos', v_fichas;
  end if;
  select count(*) into v_fichas from fichas f join arquivo_fichas a on a.id = f.id;

  -- 5 · os 15 produtos novos existem, estao ativos e com custo
  select count(*) into v_novos
    from produtos p
    join produto_setores ps on ps.produto_id = p.id and ps.ativo
   where p.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
     and p.ativo
     and p.custo_medio > 0
     and p.id in (
    '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', '969f31f5-c349-5dba-9e1d-3b82bb636450', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac',
    'e228ba6d-748e-5f6a-b993-308ba94d2f25', 'da10f787-d2ca-5e3f-ad6a-e16d11f50352', '8e3a491c-5e1f-522e-beef-736e62871376',
    '37321a58-4cf1-5213-a2a9-5a2a3b9527ee', '7156d30d-b75a-5542-b5a3-75f35e9a4ef2', '2357a894-7acf-5559-aea1-6109c8e43312',
    '90c7f67d-c747-51d2-8d93-1227d53f3f41', '3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a', 'e0c73456-6161-5d00-a03c-79a9a2af4a48',
    'd9fd3f84-08bd-5fbe-a389-f8d05264bc29', '990c9c4b-0ecb-5e85-9118-188de9ef448c', 'e577acfe-b291-562f-932f-b2bd7f2b37c0'
     );
  if v_novos <> 15 then
    raise exception '0005: % dos 15 produtos novos existem, ativos e com custo', v_novos;
  end if;

  -- 5b · os 15 produtos novos estao no setor chamado 'Cozinha' e na categoria
  --      que o arquivo declara. Esta pergunta existe porque o id do setor NAO e
  --      funcao do nome: a 0002 renomeou "Estoque Geral" para "Cozinha" e
  --      manteve o id, entao derivar o id de 'Cozinha' da um setor que nao
  --      existe. Aqui o id vem do retrato e esta pergunta confere, pelo NOME,
  --      que ele e o setor certo — se alguem trocar a fonte do id por um
  --      UUIDv5 do nome do setor, a carga cai aqui com a mensagem explicando.
  select count(*) into v_novos
    from produto_setores ps
    join setores s on s.id = ps.setor_id
   where s.nome = 'Cozinha' and s.ativo
     and ps.ativo and ps.custo_fixo
     and ps.produto_id in (
    '9fb59ead-0cb9-5e6f-9572-c49ed776ee3b', '969f31f5-c349-5dba-9e1d-3b82bb636450', '8f4a4937-9614-5cfd-9ad7-5da56fa301ac',
    'e228ba6d-748e-5f6a-b993-308ba94d2f25', 'da10f787-d2ca-5e3f-ad6a-e16d11f50352', '8e3a491c-5e1f-522e-beef-736e62871376',
    '37321a58-4cf1-5213-a2a9-5a2a3b9527ee', '7156d30d-b75a-5542-b5a3-75f35e9a4ef2', '2357a894-7acf-5559-aea1-6109c8e43312',
    '90c7f67d-c747-51d2-8d93-1227d53f3f41', '3cc9e4f2-26c0-51b6-a0c1-99afbb90ee2a', 'e0c73456-6161-5d00-a03c-79a9a2af4a48',
    'd9fd3f84-08bd-5fbe-a389-f8d05264bc29', '990c9c4b-0ecb-5e85-9118-188de9ef448c', 'e577acfe-b291-562f-932f-b2bd7f2b37c0'
     );
  if v_novos <> 15 then
    raise exception '0005: % dos 15 produtos novos estao no setor Cozinha com custo_fixo; o id do setor NAO e o UUIDv5 do nome (a 0002 renomeou Estoque Geral para Cozinha mantendo o id)', v_novos;
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
   where v.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
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
   where c.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and c.referencia = '2026-08-31';
  if abs(v_agosto - 78681.3573) > 0.0005 then
    raise exception '0005: a contagem de agosto vale agora %, e tem de valer 78681.3573', v_agosto;
  end if;
  select coalesce(sum(i.quantidade * i.custo_unitario), 0) into v_outubro
    from contagem_itens i join contagens c on c.id = i.contagem_id
   where c.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and c.referencia = '2026-10-01';
  if abs(v_outubro - 71961.351) > 0.0005 then
    raise exception '0005: a contagem de outubro vale agora %, e tem de valer 71961.351', v_outubro;
  end if;

  -- ---- daqui para baixo e AVISO, nao excecao ----
  -- O custo somado PODE mudar: e isso que faz a ficha acompanhar o preco real.
  select coalesce(sum(v.custo_total), 0) into v_custo
    from vw_fichas_completas v join arquivo_fichas a on a.id = v.id;
  if abs(v_custo - 110.1092) > 0.01 then
    raise warning '0005: custo somado das fichas e % e o arquivo previu 110.1092 — diferenca de %. Se o catalogo mudou de preco, isto e o ESPERADO (a ficha acompanha o preco real); se nao mudou, e erro de mapeamento.',
      round(v_custo, 4), round(v_custo - 110.1092, 4);
  end if;

  select count(*) into v_produtos
    from produtos where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  if v_produtos <> 906 then
    raise warning '0005: o tenant tem % produtos; esta carga previa 906 (= 891 antes + 15 novos). Se a cliente cadastrou produto pela tela, isto e o esperado.',
      v_produtos;
  end if;

  -- Esta carga nao cria categoria nem setor: ela usa os que existem. Se um
  -- destes numeros mudar, alguma linha de categoria_id ou setor_id esta
  -- apontando para um id que o banco nao tem.
  select count(*) into v_categorias
    from categorias where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  select count(*) into v_setores
    from setores where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and ativo;
  if v_categorias <> 21 or v_setores <> 4 then
    raise warning '0005: o tenant tem % categorias e % setores ativos; esta carga previa 21 e 4, e nao cria nem uma nem outro.',
      v_categorias, v_setores;
  end if;

  raise warning '0005 ok: % fichas, % itens, soma das quantidades %, custo somado R$ % · fichas de fora intactas: % com R$ %',
    v_fichas, v_itens, v_quantidades, round(v_custo, 4),
    v_fora_fichas, round(v_fora_custo, 4);
end $$;

commit;
