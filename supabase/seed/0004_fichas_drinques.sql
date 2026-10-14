-- ---------------------------------------------------------------------------
-- 0004 · Fichas tecnicas das BEBIDAS do Bar do Zeca Norte Shopping
--
-- Gerado por scripts/gerar-seed-fichas.mjs a partir de
-- dados/fichas-drinques.json. NAO EDITE A MAO: regere.
--
-- Origem do dado: FICHAS_TECNICAS_BDZ_NORTE_SHOPPING.pdf
--                 md5 bfbe0f165e3a119c35a43ac2297b3418, 70 paginas
--                 ("Relatorio de Estrutura de Produto" do PDV Business Rio)
--
-- 79 fichas · 219 itens · 12 produtos novos (preparos da casa)
-- Custo total somado das fichas, aos precos de outubro: R$ 542.5965
--
-- Grupos do cardapio:
--   Cervejas e Chopps                  3 fichas
--   Cervejas e Chopps · Happy Hour     1 fichas
--   Cortesias                         17 fichas
--   Drinques                          49 fichas
--   Drinques · Happy Hour              3 fichas
--   Drinques · Sem Álcool              4 fichas
--   Refrigerantes e Águas              2 fichas
--
-- TRES COISAS QUE ESTA CARGA NAO FAZ, e vale dizer:
--
--  1. Nao grava custo. O custo da ficha e lido na hora, de
--     `produtos.custo_medio`, por `mv_custo_do_produto` e
--     `vw_fichas_completas`. Guardar congelaria o numero no dia da carga.
--
--  2. Nao grava preco de venda. O PDF e relatorio de CUSTO e nao traz preco:
--     as 79 fichas nascem com preco_venda = 0, e por isso o CMV, a margem e
--     o markup saem NULOS da vista. Nada foi inventado. Essa e a principal
--     pendencia devolvida a cliente.
--
--  3. Nao encosta nas contagens. Agosto vale R$ 78681.3573 e outubro
--     R$ 71961.351; o bloco de verificacao do fim cobra os dois.
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
-- 1 · Os 12 preparos da casa, como produto do catalogo
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
-- O preco pago, dito: `custo_fixo = true` e o custo fica CONGELADO no que o PDF
-- calculou — ele nao acompanha o preco do acucar. Enquanto o modulo nao tiver
-- sub-receita, recalcular o preparo e trabalho manual. Esta na lista de
-- pendencias da cliente, com o numero de cada um.
--
-- O custo usado e o recalculado pelos DOIS niveis, nao o `Total` impresso: o
-- PDV guarda custo cacheado da sub-receita e o cache esta velho (ESPUMA DE
-- GENGIBRE entra valendo 5,09 nos drinques e a ficha dela soma 5,91).
-- ---------------------------------------------------------------------------

-- @bloco:produtos_preparos
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio, custo_atualizado_em, ativo) values
  ('79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'ESPUMA DE GENGIBRE', 'LT', 5.91, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('9478f048-abef-524c-91e1-4990af1aff8a', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'ESPUMA DE HIBISCO', 'LT', 19.6136, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('5d2df11c-139e-59f7-9ce1-1341bb618665', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'MIX DE PINA', 'LT', 13.714, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('db164cac-2a2d-550e-99c5-ca9d91c657fd', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'SUCO NATURAL', 'UND', 0.897, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE ACUCAR', 'LT', 0.39, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('648ae03e-5952-52f8-994b-0f02fd4cf304', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE CANELA E MEL', 'LT', 58.19, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('2281c43f-f891-55ee-ae00-3cb22272d9fa', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE GENGIBRE', 'LT', 5.82, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('8d0ce4e2-f036-561a-9c7e-369ee1a1a36e', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE HIBISCO', 'LT', 24.34, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('07a63dbb-8f8a-5183-9d29-66e11e43c72a', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE MARACUJA', 'LT', 14.64, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('0de840f4-066f-57d5-8f75-3ff10f33c74c', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE MEL', 'LT', 62.788, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('cfe5fcc2-1632-5764-817d-e63458f01a24', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE MORANGO', 'LT', 33.844, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('37f58d0a-2f23-590b-9d6c-b9ed25a91bb7', 'b0a12eca-0000-4000-8000-000000000001', '01c47b56-4321-5597-b73a-43efbc951b15', 'XAROPE DE UVA', 'LT', 27.11, '2026-10-01 23:59:00-03'::timestamptz, true)
on conflict (id) do update set
     categoria_id = excluded.categoria_id,
     unidade = excluded.unidade,
     custo_medio = excluded.custo_medio,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true;

-- @fim:produtos_preparos

-- O vinculo com o setor Bar. `custo_fixo = true` diz ao
-- `mv_custo_do_produto` que este custo e calculado pela casa, e nao vem de
-- nota fiscal — que e exatamente o caso de um xarope feito na cozinha do bar.

-- @bloco:vinculos_preparos
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo, custo_atualizado_em, ativo) values
  ('79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 5.91, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('9478f048-abef-524c-91e1-4990af1aff8a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 19.6136, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('5d2df11c-139e-59f7-9ce1-1341bb618665', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 13.714, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('db164cac-2a2d-550e-99c5-ca9d91c657fd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'UND', 0.897, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 0.39, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('648ae03e-5952-52f8-994b-0f02fd4cf304', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 58.19, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('2281c43f-f891-55ee-ae00-3cb22272d9fa', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 5.82, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('8d0ce4e2-f036-561a-9c7e-369ee1a1a36e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 24.34, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('07a63dbb-8f8a-5183-9d29-66e11e43c72a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 14.64, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('0de840f4-066f-57d5-8f75-3ff10f33c74c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 62.788, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('cfe5fcc2-1632-5764-817d-e63458f01a24', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 33.844, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true),
  ('37f58d0a-2f23-590b-9d6c-b9ed25a91bb7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 'LT', 27.11, 1, true, '2026-10-01 23:59:00-03'::timestamptz, true)
on conflict (produto_id, setor_id) do update set
     unidade = excluded.unidade,
     custo = excluded.custo,
     custo_fixo = excluded.custo_fixo,
     custo_atualizado_em = excluded.custo_atualizado_em,
     ativo = true;

-- @fim:vinculos_preparos

-- ---------------------------------------------------------------------------
-- 2 · As 79 fichas
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

-- @bloco:fichas
insert into fichas (id, restaurante_id, nome, grupo, descricao, modo_preparo, rendimento, unidade_rendimento, preco_venda, cmv_alvo, ativo, ordem) values
  ('95055903-8990-5624-a144-6b413a705e96', 'b0a12eca-0000-4000-8000-000000000001', 'BRAHMA CHOPP 300ML', 'Cervejas e Chopps', 'Ficha do PDV BDZ89 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 1),
  ('3e80c1c3-483b-5c98-98cd-da428b897f3f', 'b0a12eca-0000-4000-8000-000000000001', 'HEINEKEN LONGNECK', 'Cervejas e Chopps', 'Ficha do PDV BDZ3021 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 2),
  ('9352654e-6c75-5c5b-9114-681277de3af8', 'b0a12eca-0000-4000-8000-000000000001', 'Heineken Ultimate LN 330ML', 'Cervejas e Chopps', 'Ficha do PDV BDZ30215 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 3),
  ('38f8c969-12e4-5ba0-a84e-ff087fb10095', 'b0a12eca-0000-4000-8000-000000000001', 'AMSTEL CHOPP 300 ML HH', 'Cervejas e Chopps · Happy Hour', 'Ficha do PDV BDZ661 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 1),
  ('23d9d7e4-6c9b-5d3a-aa8b-41427973804e', 'b0a12eca-0000-4000-8000-000000000001', 'AGUA COM GAS APOIO', 'Cortesias', 'Ficha do PDV BDZ2 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 1),
  ('1c98f080-1d0a-50a8-a77d-d57dc9b0adc1', 'b0a12eca-0000-4000-8000-000000000001', 'AGUA SEM GAS APOIO', 'Cortesias', 'Ficha do PDV BDZ6 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 2),
  ('19386778-500f-5268-94d5-49417e324d5b', 'b0a12eca-0000-4000-8000-000000000001', 'ANTARTICA ORIG600 ML APOIO', 'Cortesias', 'Ficha do PDV BDZ60 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 3),
  ('8fd86521-f0b2-5cfb-999b-d67614bd2ec1', 'b0a12eca-0000-4000-8000-000000000001', 'BRAHMA GF 600 ML APOIO', 'Cortesias', 'Ficha do PDV BDZ68 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 4),
  ('88693e80-5a99-5aee-925a-cf29b60510d9', 'b0a12eca-0000-4000-8000-000000000001', 'CHOPP 220 ML - APOIO', 'Cortesias', 'Ficha do PDV BDZ900001 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 5),
  ('792bcb6e-6f8e-545c-a48f-1fea44113eda', 'b0a12eca-0000-4000-8000-000000000001', 'COCA COCA ZERO APOIO KS', 'Cortesias', 'Ficha do PDV BDZ7AP1 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 6),
  ('e814d37a-60a7-5e4b-8611-2d42626bf2bf', 'b0a12eca-0000-4000-8000-000000000001', 'COCA COLA APOIO KS', 'Cortesias', 'Ficha do PDV BDZ8AP1 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 7),
  ('6fc63342-e99c-5132-a0ea-d42f92b4e15b', 'b0a12eca-0000-4000-8000-000000000001', 'GUARANA APOIO', 'Cortesias', 'Ficha do PDV BDZ10 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 8),
  ('e4a299d4-78a2-5dd1-8d7f-5719fe98a7e2', 'b0a12eca-0000-4000-8000-000000000001', 'GUARANA ZERO APOIO', 'Cortesias', 'Ficha do PDV BDZ12 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 9),
  ('67cd4035-d289-5dba-91c5-c9a82da7a8f7', 'b0a12eca-0000-4000-8000-000000000001', 'RED BULL ACAI 250 ML APOIO', 'Cortesias', 'Ficha do PDV BDZ17AP · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 10),
  ('b2a17154-045a-5258-bc42-2a21b8fc39ec', 'b0a12eca-0000-4000-8000-000000000001', 'RED BULL C APOIO', 'Cortesias', 'Ficha do PDV BDZ18AP · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 11),
  ('976cc45e-2e55-52a8-914e-f814deb20452', 'b0a12eca-0000-4000-8000-000000000001', 'RED BULL MELANCIA 250 ML C APOIO', 'Cortesias', 'Ficha do PDV BDZ20AP · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 12),
  ('4ab9505f-8d95-56c0-aeec-e4712346b25b', 'b0a12eca-0000-4000-8000-000000000001', 'RED BULL SUGAR FREE APOIO', 'Cortesias', 'Ficha do PDV BDZ21AP · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 13),
  ('616e2fbe-a789-5df2-a15c-fe10f1df5455', 'b0a12eca-0000-4000-8000-000000000001', 'RED BULL TROPICAL 250 ML C APOIO', 'Cortesias', 'Ficha do PDV BDZ23AP · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 14),
  ('2808438a-352a-5570-8102-73ea72bc40f5', 'b0a12eca-0000-4000-8000-000000000001', 'STELA LONG NECK APOIO', 'Cortesias', 'Ficha do PDV BDZ86 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 15),
  ('09ae139e-d65c-5b98-bad7-a3fb35ffadd4', 'b0a12eca-0000-4000-8000-000000000001', 'TONICA APOIO', 'Cortesias', 'Ficha do PDV BDZ27 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 16),
  ('2972cfd7-628d-5f0c-9486-993f94961231', 'b0a12eca-0000-4000-8000-000000000001', 'TONICA ZERO APOIO', 'Cortesias', 'Ficha do PDV BDZ30 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 100, true, 17),
  ('b9ffcc60-77ab-57f1-b5a4-ccca52aca995', 'b0a12eca-0000-4000-8000-000000000001', '43 SPRITZ', 'Drinques', 'Ficha do PDV BDZ50153 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 1),
  ('997f6893-7b76-5934-8f2d-0249274b41c4', 'b0a12eca-0000-4000-8000-000000000001', 'AGORA POR FAVOR', 'Drinques', 'Ficha do PDV BDZ50191 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 2),
  ('99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'b0a12eca-0000-4000-8000-000000000001', 'APEROL SPRITZ', 'Drinques', 'Ficha do PDV BDZ15312 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 3),
  ('6fb2af9c-73b7-5b32-a329-8f876c27eb2f', 'b0a12eca-0000-4000-8000-000000000001', 'ATOS OITAVO', 'Drinques', 'Ficha do PDV BDZ50197 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 4),
  ('020bf257-9cbd-54a2-9e62-9154679f603d', 'b0a12eca-0000-4000-8000-000000000001', 'BI-SAMBAS', 'Drinques', 'Ficha do PDV BDZ156 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 5),
  ('0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', 'b0a12eca-0000-4000-8000-000000000001', 'BLUE TA DE CAO', 'Drinques', 'Ficha do PDV BDZ790 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 6),
  ('c69d7374-3ba7-55bd-ace4-8f912f546610', 'b0a12eca-0000-4000-8000-000000000001', 'BOSSA SOUR', 'Drinques', 'Ficha do PDV BDZ501901 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 7),
  ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', 'b0a12eca-0000-4000-8000-000000000001', 'BRASILEIRINHO', 'Drinques', 'Ficha do PDV BDZ710 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 8),
  ('a78043db-4a76-5d64-9973-20eedfeca10d', 'b0a12eca-0000-4000-8000-000000000001', 'BRISANDO', 'Drinques', 'Ficha do PDV BDZ1793 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 9),
  ('c6483741-e661-56dc-a3a0-52f14aba1b1e', 'b0a12eca-0000-4000-8000-000000000001', 'BRISEEIIII', 'Drinques', 'Ficha do PDV BDZ5017 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 10),
  ('a176a479-44b0-582b-b83a-3760e1790457', 'b0a12eca-0000-4000-8000-000000000001', 'CACHACA DO ZECA', 'Drinques', 'Ficha do PDV BDZ36 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 11),
  ('21e5da96-fd2d-5d2e-804c-b431790429e7', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIRINHA BDZ', 'Drinques', 'Ficha do PDV BDZ161 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 12),
  ('42655c6d-ef62-5ed2-a09e-a0fc05321206', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIRINHA COM MEL', 'Drinques', 'Ficha do PDV BDZ162 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 13),
  ('816545ff-4f9d-5aca-bc28-f7d27606dcad', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIRINHA ESP SAGATIBA', 'Drinques', 'Ficha do PDV BDZ727 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 14),
  ('4a9ac3f1-b661-5352-815f-130ca7e2ef99', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIVODKA ABSOLUT BDZ', 'Drinques', 'Ficha do PDV BDZ3403 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 15),
  ('455ff383-da0d-56ad-8903-3f176f79ac00', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIVODKA SKYY', 'Drinques', 'Ficha do PDV BDZ3811 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 16),
  ('93d3728a-fdbf-57c9-af90-facaeb93c654', 'b0a12eca-0000-4000-8000-000000000001', 'CAMISA 10', 'Drinques', 'Ficha do PDV BDZ761 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 17),
  ('4e8468df-d206-5e95-b519-965dccf84921', 'b0a12eca-0000-4000-8000-000000000001', 'CAMPARI TONICA', 'Drinques', 'Ficha do PDV BDZ153 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 18),
  ('ef0689c3-1ce9-5863-841c-8727995acacc', 'b0a12eca-0000-4000-8000-000000000001', 'CARAJILLO BDZ', 'Drinques', 'Ficha do PDV BDZ5015 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 19),
  ('643aa1de-242f-59d5-8235-3eb624580d03', 'b0a12eca-0000-4000-8000-000000000001', 'COISA DE MALANDRO', 'Drinques', 'Ficha do PDV BDZ166 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 20),
  ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', 'b0a12eca-0000-4000-8000-000000000001', 'CORACAO DE SAMBISTA', 'Drinques', 'Ficha do PDV BDZ5022 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 21),
  ('924b6ffb-7838-5e18-9610-4305eeb9769e', 'b0a12eca-0000-4000-8000-000000000001', 'DEIXA ARDER', 'Drinques', 'Ficha do PDV BDZ50193 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 22),
  ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', 'b0a12eca-0000-4000-8000-000000000001', 'DOM AMORES EM VERMELHO', 'Drinques', 'Ficha do PDV BDZ172 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 23),
  ('461e3985-95b2-51cb-8ccf-d94057c95189', 'b0a12eca-0000-4000-8000-000000000001', 'EXPLOSAO DO ZECA', 'Drinques', 'Ficha do PDV BDZ178 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 24),
  ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', 'b0a12eca-0000-4000-8000-000000000001', 'FOLIA DO DOM', 'Drinques', 'Ficha do PDV BDZ179 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 25),
  ('9b145afd-22e6-5e73-b05f-a0e20df65dab', 'b0a12eca-0000-4000-8000-000000000001', 'FULERAGEM', 'Drinques', 'Ficha do PDV BDZ50198 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 26),
  ('57d67512-8f2a-5d2d-a198-aeefa95773cb', 'b0a12eca-0000-4000-8000-000000000001', 'GIN COM ESPUMA', 'Drinques', 'Ficha do PDV BDZ276 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 27),
  ('65745fd4-d0a0-5b24-bb9b-3efe01385351', 'b0a12eca-0000-4000-8000-000000000001', 'GIN PINK', 'Drinques', 'Ficha do PDV BDZ181 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 28),
  ('b4fa78df-2d85-5223-84aa-9e0f21fbede0', 'b0a12eca-0000-4000-8000-000000000001', 'GIN TROPICAL', 'Drinques', 'Ficha do PDV BDZ304 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 29),
  ('1dec1681-d161-5ad4-a3a7-1b4b3a9118da', 'b0a12eca-0000-4000-8000-000000000001', 'GT ARPO GIN', 'Drinques', 'Ficha do PDV BDZ2885 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 30),
  ('08467c7b-f626-5662-b1cb-806591f671e5', 'b0a12eca-0000-4000-8000-000000000001', 'GT BOMBAY', 'Drinques', 'Ficha do PDV BDZ282 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 31),
  ('3a95d358-da0f-5265-845d-0c511175aee5', 'b0a12eca-0000-4000-8000-000000000001', 'GT TANQUERAY', 'Drinques', 'Ficha do PDV BDZ291 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 32),
  ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', 'b0a12eca-0000-4000-8000-000000000001', 'HOJE TA CALOR', 'Drinques', 'Ficha do PDV BDZ50196 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 33),
  ('6152f477-5d2c-57e6-a71c-c99ba1803c12', 'b0a12eca-0000-4000-8000-000000000001', 'JA FOI', 'Drinques', 'Ficha do PDV BDZ764 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 34),
  ('2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', 'b0a12eca-0000-4000-8000-000000000001', 'JA SAIU', 'Drinques', 'Ficha do PDV BDZ504 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 35),
  ('75ac6e85-33ca-5069-860b-2c23e0d567ac', 'b0a12eca-0000-4000-8000-000000000001', 'LIMONCELLO SPRITZ', 'Drinques', 'Ficha do PDV BDZ2034 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 36),
  ('82a53d37-21a6-5ac9-a7cf-2cee49206fda', 'b0a12eca-0000-4000-8000-000000000001', 'MOSCOW IN ZECA', 'Drinques', 'Ficha do PDV BDZ189 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 37),
  ('e2bdb7c1-aeae-545a-b070-fe46f89573d1', 'b0a12eca-0000-4000-8000-000000000001', 'NEGRONI BDZ', 'Drinques', 'Ficha do PDV BDZ192 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 38),
  ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', 'b0a12eca-0000-4000-8000-000000000001', 'NOAH PAGODINHO', 'Drinques', 'Ficha do PDV BDZ750 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 39),
  ('48542889-8f6e-50e2-8ef9-e8b4f280813c', 'b0a12eca-0000-4000-8000-000000000001', 'PAREI NO ZECA', 'Drinques', 'Ficha do PDV BDZ725 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 40),
  ('169d6e22-6f78-5e64-95d6-7bd20fadfc4c', 'b0a12eca-0000-4000-8000-000000000001', 'QUE CALOR E ESSE', 'Drinques', 'Ficha do PDV BDZ50195 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 41),
  ('7eb02966-30f4-5632-a533-270e1074795d', 'b0a12eca-0000-4000-8000-000000000001', 'SAI AGORA', 'Drinques', 'Ficha do PDV BDZ50192 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 42),
  ('fd64761b-abf4-5e74-8637-adce2a336fda', 'b0a12eca-0000-4000-8000-000000000001', 'SALVE JORGE', 'Drinques', 'Ficha do PDV BDZ5011 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 43),
  ('13c818c5-b902-5132-8837-195d59dd20d0', 'b0a12eca-0000-4000-8000-000000000001', 'SEGREDO DO ZECA', 'Drinques', 'Ficha do PDV BDZ202 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 44),
  ('4525e832-01b9-5c14-98d4-da3e1113a4d1', 'b0a12eca-0000-4000-8000-000000000001', 'SO UM MINUTO', 'Drinques', 'Ficha do PDV BDZ763 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 45),
  ('ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', 'b0a12eca-0000-4000-8000-000000000001', 'TAMO JUNTO', 'Drinques', 'Ficha do PDV BDZ762 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 46),
  ('7c0c701d-8262-5506-99ec-3089b31965eb', 'b0a12eca-0000-4000-8000-000000000001', 'TOMA LIZA', 'Drinques', 'Ficha do PDV BDZ765 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 47),
  ('57823137-ab4b-5450-a8f9-e56af27f11b4', 'b0a12eca-0000-4000-8000-000000000001', 'VAI VIVER', 'Drinques', 'Ficha do PDV BDZ50199 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 48),
  ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', 'b0a12eca-0000-4000-8000-000000000001', 'XEREM', 'Drinques', 'Ficha do PDV BDZ10000 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 49),
  ('0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'b0a12eca-0000-4000-8000-000000000001', 'APEROL SPRITZ HH', 'Drinques · Happy Hour', 'Ficha do PDV BDZ1532 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 1),
  ('a6776e26-08d1-50cf-b746-509536923cc3', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIRINHA HH', 'Drinques · Happy Hour', 'Ficha do PDV BDZ729 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 2),
  ('0f881b17-934c-5c88-ae9e-571e75740f06', 'b0a12eca-0000-4000-8000-000000000001', 'CAIPIVODKA SKYY HH', 'Drinques · Happy Hour', 'Ficha do PDV BDZ3812 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 3),
  ('152bb216-c36a-5c3e-98d9-5961987b8c4e', 'b0a12eca-0000-4000-8000-000000000001', 'MATE DA CASA SABORES', 'Drinques · Sem Álcool', 'Ficha do PDV BDZ800 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 1),
  ('edc42641-fa54-5bf0-9c47-b1f552e00fed', 'b0a12eca-0000-4000-8000-000000000001', 'MONICA COQUETEL', 'Drinques · Sem Álcool', 'Ficha do PDV BDZ1797 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 2),
  ('45574e1d-b121-5266-9513-c8d62ac08d3e', 'b0a12eca-0000-4000-8000-000000000001', 'SILENCIO', 'Drinques · Sem Álcool', 'Ficha do PDV BDZ751 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 3),
  ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', 'b0a12eca-0000-4000-8000-000000000001', 'TO CALMA', 'Drinques · Sem Álcool', 'Ficha do PDV BDZ50194 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 20, true, 4),
  ('5dd17f82-0cae-5026-957c-42421a73800a', 'b0a12eca-0000-4000-8000-000000000001', 'COCA COLA KS', 'Refrigerantes e Águas', 'Ficha do PDV BDZ811 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 1),
  ('7236370a-2e08-5f3b-8785-7f07023afbf4', 'b0a12eca-0000-4000-8000-000000000001', 'COCA COLA ZERO KS', 'Refrigerantes e Águas', 'Ficha do PDV BDZ7112 · Relatorio de Estrutura de Produto, Bar do Zeca Norte Shopping', null, 1, 'PORCAO', 0, 30, true, 2)
on conflict (id) do update set
     nome = excluded.nome,
     grupo = excluded.grupo,
     descricao = excluded.descricao,
     rendimento = excluded.rendimento,
     unidade_rendimento = excluded.unidade_rendimento,
     cmv_alvo = excluded.cmv_alvo,
     ativo = true,
     ordem = excluded.ordem;

-- @fim:fichas

-- preco_venda de proposito FORA do `do update`: se a cliente
-- preencher o preco pela tela, reaplicar esta carga nao pode zerar o trabalho
-- dela. O arquivo manda no que veio do PDF; o preco e dela.

-- ---------------------------------------------------------------------------
-- 3 · Os 219 itens
--
-- A `observacao` guarda o nome do componente NO PDV. Sem ela a ficha diz
-- "GIN ARPO 5 LT" e ninguem acha a linha correspondente no PDF; com ela a
-- conferencia contra a origem e linha a linha. Onde a observacao traz dois
-- nomes separados por "+", dois componentes do PDV cairam no MESMO produto do
-- catalogo e as quantidades foram somadas — `unique (ficha_id, produto_id)`
-- nao deixa o mesmo produto entrar duas vezes na mesma ficha.
--
-- A `unidade` e a do NOSSO cadastro, nunca a do PDV: `mv_fator_unidade`
-- devolve 1 para unidade igual nos dois lados, e e isso que mantem a quantidade
-- intacta. As divergencias PDV x cadastro estao listadas no
-- dados/RELATORIO-FICHAS.txt.
-- ---------------------------------------------------------------------------

-- @bloco:ficha_itens
insert into ficha_itens (id, ficha_id, produto_id, quantidade, unidade, perda_percentual, observacao, ordem) values
  ('23ed4ff2-66f6-581e-b324-cfd18563c30b', '95055903-8990-5624-a144-6b413a705e96', 'e2007236-4bc3-5813-b5fc-d450a1d14ab3', 0.35, 'LTS', 0, 'PDV: CHOPP BRAHMA CLARO BARRIL 50L', 1),
  ('0650435e-871a-5d31-9744-e399e037eda7', '3e80c1c3-483b-5c98-98cd-da428b897f3f', '793bd6d9-d16b-5886-a1e8-4fd9977194c8', 1, 'UND', 0, 'PDV: CERVEJA HEINEKEN 330 ML', 1),
  ('2087207a-b590-561c-84b9-2b937833bcfe', '9352654e-6c75-5c5b-9114-681277de3af8', '0ada73a6-ae98-5cd8-8c35-2c1be6eded8f', 1, 'UND', 0, 'PDV: CERVEJA HEINEKEN ULTIMATE', 1),
  ('930157f7-64ee-56cb-abb7-1e3bc39dcb0f', '38f8c969-12e4-5ba0-a84e-ff087fb10095', '17f09dbe-399c-5c33-9d43-5555da2679a7', 0.35, 'UND', 0, 'PDV: CHOPP AMSTEL BARRIL 50L', 1),
  ('23fcc6bb-5f5a-5feb-8fea-57e1f0d600c7', '23d9d7e4-6c9b-5d3a-aa8b-41427973804e', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 1, 'UND', 0, 'PDV: AGUA COM GAS', 1),
  ('070def3c-e2e6-5a9b-84ba-5c5e5445278c', '1c98f080-1d0a-50a8-a77d-d57dc9b0adc1', '2d9be38d-b257-55c1-b331-d703c08a51ff', 1, 'UND', 0, 'PDV: AGUA SEM GAS', 1),
  ('3d7a5271-b98e-5c35-9194-9dd34cae8f86', '19386778-500f-5268-94d5-49417e324d5b', 'ea3d443f-becf-58b9-aefc-300d1857d4d4', 1, 'UND', 0, 'PDV: ANTARTICA ORIG600 ML', 1),
  ('f2a936ff-a801-5baf-a4ac-63c0348f0c5d', '8fd86521-f0b2-5cfb-999b-d67614bd2ec1', '3fcdd3ff-5266-505f-860f-0c03702494a6', 1, 'UND', 0, 'PDV: BRAHMA GF 600 ML', 1),
  ('24d14fff-d652-586e-a875-32d735c8c229', '88693e80-5a99-5aee-925a-cf29b60510d9', 'e2007236-4bc3-5813-b5fc-d450a1d14ab3', 0.25, 'LTS', 0, 'PDV: CHOPP BRAHMA CLARO BARRIL 50L', 1),
  ('09d9dc19-1db8-5676-92c8-1db5f48a62cf', '792bcb6e-6f8e-545c-a48f-1fea44113eda', 'c9ae0be8-b02c-5e60-8396-7ff744e2a9aa', 1, 'UND', 0, 'PDV: COCA-COLA ZERO KS', 1),
  ('7cb17282-fe2b-59dc-8a21-407b116bbe92', 'e814d37a-60a7-5e4b-8611-2d42626bf2bf', '71761253-d7c5-5340-89f6-7020e3f62e8b', 1, 'UND', 0, 'PDV: COCA-COLA KS', 1),
  ('c99af6ef-8d3e-5a9c-852d-c79a427790ef', '6fc63342-e99c-5132-a0ea-d42f92b4e15b', '8cc5fd8a-6f16-5ee9-8e79-b78a396164b0', 1, 'UND', 0, 'PDV: GUARANA', 1),
  ('e99bc1b2-d0e7-5d90-a0a0-5a2587e1682f', 'e4a299d4-78a2-5dd1-8d7f-5719fe98a7e2', '2ca5fa6d-643f-57e4-95e1-44c0dcd4d6de', 1, 'UND', 0, 'PDV: GUARANA ZERO', 1),
  ('ae7ea437-194c-5008-82ca-1616a6d0d989', '67cd4035-d289-5dba-91c5-c9a82da7a8f7', '9dba175e-7996-51ef-b7b7-08049e721eef', 1, 'UND', 0, 'PDV: RED BULL ACAI 250 ML', 1),
  ('70ff450b-df6e-542c-9940-066a698aa8b6', 'b2a17154-045a-5258-bc42-2a21b8fc39ec', 'd349e311-1c28-525b-a5d3-602d4ae802b3', 1, 'UND', 0, 'PDV: RED BULL C', 1),
  ('1fe526a1-c990-5294-9701-63f7d29ad2df', '976cc45e-2e55-52a8-914e-f814deb20452', '4ffe41ca-0b27-5dae-aa87-7d9b846eca88', 1, 'UND', 0, 'PDV: RED BULL MELANCIA 250 ML C', 1),
  ('9b746e37-3ebe-5b03-8a32-d5563b5351cc', '4ab9505f-8d95-56c0-aeec-e4712346b25b', '11fb856d-f850-55bb-adb6-1d66104535c1', 1, 'UND', 0, 'PDV: RED BULL SUGAR FREE', 1),
  ('cac2980a-05f2-5d8f-aa95-ac874453d98a', '616e2fbe-a789-5df2-a15c-fe10f1df5455', 'a30c7795-4879-531c-9b42-946c0ae542ab', 1, 'UND', 0, 'PDV: RED BULL TROPICAL 250 ML C', 1),
  ('a73d18a8-1d59-50c0-ba31-0943d04e165a', '2808438a-352a-5570-8102-73ea72bc40f5', '2a7eea71-762b-523e-8c56-c787ae144577', 1, 'UND', 0, 'PDV: STELLA LONG NECK', 1),
  ('ba8df4e1-ab07-5525-9775-9179d0a2468b', '09ae139e-d65c-5b98-bad7-a3fb35ffadd4', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 1, 'UND', 0, 'PDV: TONICA C', 1),
  ('a1b2d359-264f-51a8-b852-2e522c4ed309', '2972cfd7-628d-5f0c-9486-993f94961231', 'de6d2786-632b-5236-b721-079f3f483bd1', 1, 'UND', 0, 'PDV: TONICA ZERO C', 1),
  ('406f7b28-ac43-5017-84f5-36972f7a1f43', 'b9ffcc60-77ab-57f1-b5a4-ccca52aca995', '8dd9cd92-7dc2-5739-afc5-9b35e064431e', 0.062, 'UND', 0, 'PDV: GF LICOR 43', 1),
  ('ac0e73f1-efa4-5ae2-95b3-04d7a2163750', 'b9ffcc60-77ab-57f1-b5a4-ccca52aca995', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 2),
  ('fb447a11-e665-533b-bd0b-9c2d58483299', 'b9ffcc60-77ab-57f1-b5a4-ccca52aca995', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.5, 'UND', 0, 'PDV: AGUA COM GAS', 3),
  ('56d79e64-9252-53ff-9a27-e8d5127853ad', '997f6893-7b76-5934-8f2d-0249274b41c4', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 1),
  ('5ab94043-f4f7-5700-96f9-321c96814c90', '997f6893-7b76-5934-8f2d-0249274b41c4', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.5, 'UND', 0, 'PDV: MONSTER PACIFIC PUNCH 473 ML', 2),
  ('4d6a8d04-8a2a-54ef-831e-7ea09a98024f', '997f6893-7b76-5934-8f2d-0249274b41c4', '85093fba-36dd-5266-8a3b-641ed84460b4', 0.062, 'UND', 0, 'PDV: GF VODKA SKYY', 3),
  ('3630347b-a523-5398-bd60-39f2822c70a3', '997f6893-7b76-5934-8f2d-0249274b41c4', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c', 0.021, 'UND', 0, 'PDV: XAROPE MONIN DE MACA VERDE 700ML', 4),
  ('07077737-ec12-5153-ac2f-19eab4cbd56d', '99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'd917bc5b-2bda-58a8-91ea-a2746bed8455', 0.066, 'UND', 0, 'PDV: GF APEROL', 1),
  ('ee022c79-61aa-5599-bc2d-4cd670e9a7d3', '99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'a77c4e24-51bc-59c0-877a-371eb68afaed', 0.333, 'UND', 0, 'PDV: ESPUMANTE SALTON BRUT 750 ML', 2),
  ('c5eea035-17d8-5b45-a6a4-1c1105f5c858', '99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'da514cb3-f2d4-50e7-b0c2-9781b0ef268b', 0.05, 'KG', 0, 'PDV: LARANJA BAHIA', 3),
  ('86cabc04-0253-5787-8a46-481f7cc98d04', '99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.25, 'UND', 0, 'PDV: AGUA COM GAS', 4),
  ('08d96831-8446-5d7e-a37e-2d286a16b9cd', '6fb2af9c-73b7-5b32-a329-8f876c27eb2f', 'acb5761f-87f7-5433-8938-615f0631fdf6', 0.1, 'UND', 0, 'PDV: VINHO SALTON ATOS LICOROSO', 1),
  ('0ca257bf-9d78-5be5-81dc-33cf007314bd', '6fb2af9c-73b7-5b32-a329-8f876c27eb2f', 'a77c4e24-51bc-59c0-877a-371eb68afaed', 0.05, 'UND', 0, 'PDV: ESPUMANTE SALTON BRUT 750 ML', 2),
  ('15335f9f-cb3f-58bb-b426-86336ec7a8b9', '6fb2af9c-73b7-5b32-a329-8f876c27eb2f', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 3),
  ('a7e53b11-f5fd-5c7c-bf0a-144cf0b6f9e6', '6fb2af9c-73b7-5b32-a329-8f876c27eb2f', '7ec6b740-bdb5-5d22-9871-592cae2a19cf', 0.05, 'KG', 0, 'PDV: MARSHMALLOW', 4),
  ('e0bd5f0b-3908-501a-aa0a-363df61a25ea', '020bf257-9cbd-54a2-9e62-9154679f603d', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 0.02, 'LT', 0, 'PDV: ESPUMA DE GENGIBRE', 1),
  ('8bc29021-33a6-5c0e-ad10-413dd8c1351a', '020bf257-9cbd-54a2-9e62-9154679f603d', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.012, 'UND', 0, 'PDV: GF ARPO BAG', 2),
  ('6ee2cf9b-f7f6-521a-98ae-1445283d49af', '020bf257-9cbd-54a2-9e62-9154679f603d', '07a63dbb-8f8a-5183-9d29-66e11e43c72a', 0.08, 'LT', 0, 'PDV: XAROPE DE MARACUJA', 3),
  ('4c6f61e5-144b-5511-afa4-36b2b22ff98a', '0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 1),
  ('0f02cba3-c244-58bd-8184-4159facc59d3', '0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('28f9a171-7df6-543f-842e-d74e61822a0d', '0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '07a63dbb-8f8a-5183-9d29-66e11e43c72a', 0.1, 'LT', 0, 'PDV: XAROPE DE MARACUJA', 3),
  ('2a841db1-43f5-56b3-982a-b2406a866ce6', '0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.05, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 4),
  ('fb5a1543-9a60-55d6-a2e6-acb19d29995a', 'c69d7374-3ba7-55bd-ace4-8f912f546610', '3bdd7c34-1b21-58f1-acdf-1b127b657f1e', 0.062, 'UND', 0, 'PDV: GF GIN TANQUERAY BOSSA NOVA', 1),
  ('defd8859-89af-5b7a-93d0-dacd64e11670', 'c69d7374-3ba7-55bd-ace4-8f912f546610', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('e53ef9a0-015e-59b8-bf36-d909dacab7a1', 'c69d7374-3ba7-55bd-ace4-8f912f546610', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 0.1, 'LT', 0, 'PDV: XAROPE DE ACUCAR', 3),
  ('ada720c0-6d2a-5862-a7e2-d274b58e13df', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 1),
  ('d7dcc7b6-ddcb-591c-b1f2-84e7932b0d3d', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '547846ac-268d-553d-9bf8-2dcc72070fb6', 1, 'KG', 0, 'PDV: CAFÉ NESPRESSO RISTRETTO', 2),
  ('6e6795af-5aff-58e9-aa06-167088d6a907', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 3),
  ('3ebc78d8-2e42-5133-97b5-ab763c42d5aa', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 0.02, 'LT', 0, 'PDV: XAROPE DE ACUCAR', 4),
  ('79fa9cda-5b3f-5307-91c0-1cf186ea1be0', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.01, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 5),
  ('4acf5879-4eeb-5586-bf4b-7600fb9115d7', 'a78043db-4a76-5d64-9973-20eedfeca10d', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 0.1, 'LT', 0, 'PDV: ESPUMA DE GENGIBRE', 1),
  ('a4ccd4d1-832b-5016-b227-7295a7369746', 'a78043db-4a76-5d64-9973-20eedfeca10d', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.012, 'UND', 0, 'PDV: GF ARPO BAG', 2),
  ('50a9cc96-018f-57a5-8262-b70aea33687e', 'a78043db-4a76-5d64-9973-20eedfeca10d', '07a63dbb-8f8a-5183-9d29-66e11e43c72a', 0.05, 'LT', 0, 'PDV: XAROPE DE MARACUJA', 3),
  ('77475f1f-da35-5e51-aba9-4c0df344e825', 'a78043db-4a76-5d64-9973-20eedfeca10d', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 1, 'UND', 0, 'PDV: AGUA COM GAS', 4),
  ('68ee9fe7-b111-59bc-94ac-f745325b1576', 'c6483741-e661-56dc-a3a0-52f14aba1b1e', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 0.1, 'LT', 0, 'PDV: ESPUMA DE GENGIBRE', 1),
  ('462af0cc-7ef9-574f-8d25-d0ee02d10856', 'c6483741-e661-56dc-a3a0-52f14aba1b1e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 2),
  ('c27300c4-674d-5e7e-8569-3ae79ccf916b', 'c6483741-e661-56dc-a3a0-52f14aba1b1e', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.071, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 3),
  ('0c7d899b-8627-523f-89d8-ab4f1343ea34', 'a176a479-44b0-582b-b83a-3760e1790457', 'b55a4060-5a7a-5205-bd54-b3b2ec553109', 0.05, 'UND', 0, 'PDV: CACHAÇA YPIOCA PRATA', 1),
  ('cbed57f3-d845-544a-83f1-45f3f991a858', '21e5da96-fd2d-5d2e-804c-b431790429e7', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', 0.05, 'KG', 0, 'PDV: ACUCAR REFINADO', 1),
  ('9d184889-2479-574c-b9e0-17fea8cdb7fc', '21e5da96-fd2d-5d2e-804c-b431790429e7', 'd17456f9-09ea-587e-be0f-90df95e1e79c', 0.07, 'UND', 0, 'PDV: GF PRATEADA', 2),
  ('f0d6a51c-cff1-5cdd-aa25-10032c074849', '21e5da96-fd2d-5d2e-804c-b431790429e7', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 3),
  ('d379cf43-c7c3-559b-83bf-4ed752c7d3dc', '42655c6d-ef62-5ed2-a09e-a0fc05321206', 'd17456f9-09ea-587e-be0f-90df95e1e79c', 0.07, 'UND', 0, 'PDV: GF PRATEADA', 1),
  ('c88e91d9-2419-5338-82ed-91b538043fa0', '42655c6d-ef62-5ed2-a09e-a0fc05321206', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('98d6db06-6909-5179-a77d-cd1474b24355', '42655c6d-ef62-5ed2-a09e-a0fc05321206', '648ae03e-5952-52f8-994b-0f02fd4cf304', 0.1, 'LT', 0, 'PDV: XAROPE DE CANELA E MEL', 3),
  ('cfaa65b4-a89c-5a0b-8310-214deaec9dfc', '816545ff-4f9d-5aca-bc28-f7d27606dcad', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', 0.05, 'KG', 0, 'PDV: ACUCAR REFINADO', 1),
  ('5f8ce940-112e-5aed-96c1-32361634b94e', '816545ff-4f9d-5aca-bc28-f7d27606dcad', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 2),
  ('e36be3b3-ab38-5dd7-84ea-0c1f5c227f05', '816545ff-4f9d-5aca-bc28-f7d27606dcad', '0721bf22-53ee-552b-85b0-390e3815fbce', 0.1, 'KG', 0, 'PDV: UVA THOMPSON', 3),
  ('64f07e6c-e785-5173-9b45-f622f8ffeebc', '4a9ac3f1-b661-5352-815f-130ca7e2ef99', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', 0.05, 'KG', 0, 'PDV: ACUCAR REFINADO', 1),
  ('f6807a52-a811-57e1-8a1b-b4e560919012', '4a9ac3f1-b661-5352-815f-130ca7e2ef99', '9693737a-87e4-53d5-8b2e-cfdff05ad438', 0.1, 'UND', 0, 'PDV: MORANGO', 2),
  ('9eca1461-9aee-570d-91bd-a160cc4cba6d', '4a9ac3f1-b661-5352-815f-130ca7e2ef99', '46e753df-2f38-5a51-b32e-9056987b82da', 0.062, 'UND', 0, 'PDV: GF ABSOLUT', 3),
  ('483b2b48-e2a3-5526-ad64-d45840629e85', '455ff383-da0d-56ad-8903-3f176f79ac00', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', 0.05, 'KG', 0, 'PDV: ACUCAR REFINADO', 1),
  ('88908a4e-6e5d-5a53-abf4-1571cc48837c', '455ff383-da0d-56ad-8903-3f176f79ac00', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('e7686c8d-7ac3-5126-ad37-7dee52e892f2', '455ff383-da0d-56ad-8903-3f176f79ac00', '85093fba-36dd-5266-8a3b-641ed84460b4', 0.062, 'UND', 0, 'PDV: GF VODKA SKYY', 3),
  ('4555a8cb-55a8-54d9-a3e3-1f606bf0c607', '93d3728a-fdbf-57c9-af90-facaeb93c654', 'da751684-55a1-5e6a-afc0-e8cc647340d5', 0.062, 'UND', 0, 'PDV: GF JACK DANIELS', 1),
  ('7ef4375f-1cdb-5c5c-9682-754af331f8d4', '93d3728a-fdbf-57c9-af90-facaeb93c654', '07a63dbb-8f8a-5183-9d29-66e11e43c72a', 0.02, 'LT', 0, 'PDV: XAROPE DE MARACUJA', 2),
  ('99283d39-dbff-5a22-b44e-217bc00540dd', '93d3728a-fdbf-57c9-af90-facaeb93c654', '875290ab-7c19-5b93-81cd-74875ce9e445', 0.02, 'UND', 0, 'PDV: XAROPE MONIN MANGA 700ML', 3),
  ('c7f07dd3-1f75-5423-a7cb-85e073ed5411', '4e8468df-d206-5e95-b519-965dccf84921', 'd7652807-853f-57d2-bf29-bcbe18a82c1a', 0.006, 'UND', 0, 'PDV: GF CAMPARI', 1),
  ('466638b4-2a78-5cfc-96b5-c39d4e05fb7b', '4e8468df-d206-5e95-b519-965dccf84921', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 2),
  ('66ecaf00-d183-5d4e-943c-684fb33cb2b0', '4e8468df-d206-5e95-b519-965dccf84921', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 0.2, 'UND', 0, 'PDV: TONICA C', 3),
  ('b579222a-10f3-5847-8e46-234b9f892508', 'ef0689c3-1ce9-5863-841c-8727995acacc', '547846ac-268d-553d-9bf8-2dcc72070fb6', 1, 'KG', 0, 'PDV: CAFÉ NESPRESSO RISTRETTO', 1),
  ('9ce36605-274f-56db-b04d-03dd943b2262', 'ef0689c3-1ce9-5863-841c-8727995acacc', '8dd9cd92-7dc2-5739-afc5-9b35e064431e', 0.062, 'UND', 0, 'PDV: GF LICOR 43', 2),
  ('7cdc20ac-3d65-52d7-8ff5-1ce086fbf110', '643aa1de-242f-59d5-8235-3eb624580d03', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 1),
  ('2c055d16-b07a-581d-9e17-f8d31978f991', '643aa1de-242f-59d5-8235-3eb624580d03', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('04119216-b936-5461-b1f3-c1f3233d5fd7', '643aa1de-242f-59d5-8235-3eb624580d03', '5cae0188-9581-5a1f-ba01-ff79e6008478', 0.03, 'UND', 0, 'PDV: XAROPE MONIN AMORA 700 ML', 3),
  ('72c22034-4090-54d4-8f2b-1266e27990ca', '643aa1de-242f-59d5-8235-3eb624580d03', 'ed7a267d-151e-501c-84ae-4ce41024e970', 0.03, 'UND', 0, 'PDV: XAROPE MONIN ACAI', 4),
  ('e9385a66-7fa8-5617-a5a3-2ad4b6c032d6', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '57143922-9fb1-5873-889b-c7160e879247', 0.062, 'UND', 0, 'PDV: GF BANANINHA', 1),
  ('1744f770-ba7c-5108-a4a3-afc1851d4049', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.02, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 2),
  ('44425f02-7772-5f57-bcb1-058a9e4d7178', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.04, 'KG', 0, 'PDV: LIMÃO', 3),
  ('76fee573-5b0d-5bc9-bec5-7f926294172a', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '7fa72a53-1ca8-541e-ba0f-b39d7a6a4104', 0.05, 'KG', 0, 'PDV: UVA ROXA', 4),
  ('ffd41a7f-80b8-502f-ba66-06fecda909e7', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.02, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 5),
  ('996c8f65-c0a2-5123-bd12-4edd9f171f10', '924b6ffb-7838-5e18-9610-4305eeb9769e', '19f33bd4-f067-5ce9-a218-b7ebda5cef98', 0.1, 'KG', 0, 'PDV: ABACAXI', 1),
  ('ffddc1b7-0491-5275-a48b-7a1407d75d18', '924b6ffb-7838-5e18-9610-4305eeb9769e', 'addab1e1-f266-5997-b81b-7d34779e2946', 0.005, 'UND', 0, 'PDV: BITTER ANGOSTURA AROMATIC 100ML', 2),
  ('3f0f1c1d-9f45-5107-98e2-457dc6a3cff4', '924b6ffb-7838-5e18-9610-4305eeb9769e', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 3),
  ('535bf10a-6050-5e70-8ad8-3e058c0bf3cf', '924b6ffb-7838-5e18-9610-4305eeb9769e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 4),
  ('11936db9-17fc-538f-8a23-8a875f1d8012', '924b6ffb-7838-5e18-9610-4305eeb9769e', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 0.01, 'LT', 0, 'PDV: XAROPE DE ACUCAR', 5),
  ('0487cb8e-8243-51a9-82bd-7a4cff85f6e3', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb', 0.1, 'LT', 0, 'PDV: ESPUMA DE GENGIBRE', 1),
  ('ce183d7d-a14d-57fc-b1af-438cd6e4d7ee', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '5d2df11c-139e-59f7-9ce1-1341bb618665', 0.09, 'LT', 0, 'PDV: MIX DE PINA', 2),
  ('409d63c4-2ca1-5c9c-8fa8-883b99749cc3', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '9693737a-87e4-53d5-8b2e-cfdff05ad438', 0.05, 'UND', 0, 'PDV: MORANGO', 3),
  ('466c41de-1955-5bac-a39a-f08896e756cc', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '85093fba-36dd-5266-8a3b-641ed84460b4', 0.062, 'UND', 0, 'PDV: GF VODKA SKYY', 4),
  ('b5544b98-e66b-58a0-8bf8-65c88a224159', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '55829988-bd7c-5a4b-8dd0-8ec748af6201', 0.05, 'UND', 0, 'PDV: XAROPE FRANCES GRENADINE MONIN', 5),
  ('d1f4e8f7-fd29-5f7f-8c5a-a4808da64764', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c', 0.05, 'UND', 0, 'PDV: XAROPE MONIN DE MACA VERDE 700ML', 6),
  ('c91e99f3-34d4-51f3-b6d2-524fb0ccf34e', '461e3985-95b2-51cb-8ccf-d94057c95189', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.012, 'UND', 0, 'PDV: GF ARPO BAG', 1),
  ('046671e8-8ebc-52da-b537-d9fd472a0451', '461e3985-95b2-51cb-8ccf-d94057c95189', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('203efe41-2a94-50b5-bd54-2111eb7fc44e', '461e3985-95b2-51cb-8ccf-d94057c95189', '0778e020-8f29-5b43-8d7c-fe8c80d29830', 1, 'UND', 0, 'PDV: TONICA PINK LIMONADE', 3),
  ('e89e154f-ef37-5140-a067-d25673eb48f9', '461e3985-95b2-51cb-8ccf-d94057c95189', 'cfe5fcc2-1632-5764-817d-e63458f01a24', 0.1, 'LT', 0, 'PDV: XAROPE DE MORANGO', 4),
  ('b3797501-3c39-543a-a2bc-15292fadb4b2', 'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', 'cc195de4-3e00-5e61-8bff-6ee91ac1a33f', 0.062, 'UND', 0, 'PDV: GF LIMONCELLO', 1),
  ('a405b2fa-af3a-5935-8e2c-f42dd277d0b3', 'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.02, 'KG', 0, 'PDV: LIMÃO', 2),
  ('6420ba47-23ee-532a-a95b-974fee519766', 'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 0.1, 'UND', 0, 'PDV: TONICA SCHWEPPES', 3),
  ('66d48ec5-1be6-5c20-b570-28e64ec25b84', 'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '4dd0f67c-0d79-5260-ba97-c3056ba8d1cb', 0.062, 'UND', 0, 'PDV: GF JACK HONEY', 4),
  ('3a129f26-2173-58df-b0a7-eee5014fd0ff', 'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '0de840f4-066f-57d5-8f75-3ff10f33c74c', 0.02, 'LT', 0, 'PDV: XAROPE DE MEL', 5),
  ('564353b4-4e23-55ba-8c23-e5c2bdc877c4', '9b145afd-22e6-5e73-b05f-a0e20df65dab', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98', 0.062, 'UND', 0, 'PDV: GF GIN BEEFETER PINK 750 ML', 1),
  ('072814d9-cd2b-5330-9702-f58f591f08bb', '9b145afd-22e6-5e73-b05f-a0e20df65dab', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('2d970d90-4b05-5470-9cae-16f6d18ca2ff', '9b145afd-22e6-5e73-b05f-a0e20df65dab', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.25, 'UND', 0, 'PDV: MONSTER ULTRA PEACHY KEEN 473 ML', 3),
  ('71471e74-c63e-5428-94e7-ab5c9da66ef5', '9b145afd-22e6-5e73-b05f-a0e20df65dab', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.05, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 4),
  ('cef36319-1e7c-53a9-b784-0cdc1e7552d8', '57d67512-8f2a-5d2d-a198-aeefa95773cb', '9478f048-abef-524c-91e1-4990af1aff8a', 0.05, 'LT', 0, 'PDV: ESPUMA DE HIBISCO', 1),
  ('9f2327ad-971d-5900-9a07-c5626f76882a', '57d67512-8f2a-5d2d-a198-aeefa95773cb', 'b38d0bda-9878-5ab6-bc51-0da311f8e0ec', 0.05, 'UND', 0, 'PDV: GF VELVO BOTANIC GIN', 2),
  ('74d49d42-19d4-5ca6-a75f-4a998aa12c00', '65745fd4-d0a0-5b24-bb9b-3efe01385351', '9478f048-abef-524c-91e1-4990af1aff8a', 0.1, 'LT', 0, 'PDV: ESPUMA DE HIBISCO', 1),
  ('a79a5193-efbd-5eca-b66f-6e16b2358b0c', '65745fd4-d0a0-5b24-bb9b-3efe01385351', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98', 0.062, 'UND', 0, 'PDV: GF GIN BEEFETER PINK 750 ML', 2),
  ('53f583a4-e5c7-58cc-a109-351f44cda6f3', '65745fd4-d0a0-5b24-bb9b-3efe01385351', '9693737a-87e4-53d5-8b2e-cfdff05ad438', 0.05, 'UND', 0, 'PDV: MORANGO', 3),
  ('973b3c8e-f04c-5464-9ffd-5faafd3a82b7', '65745fd4-d0a0-5b24-bb9b-3efe01385351', '0778e020-8f29-5b43-8d7c-fe8c80d29830', 1, 'UND', 0, 'PDV: TONICA PINK LIMONADE', 4),
  ('4c6cf27d-ecb1-5756-bae3-516e7de6695d', 'b4fa78df-2d85-5223-84aa-9e0f21fbede0', '975cbcd3-7ee6-5956-bc07-098037cf9f3e', 0.066, 'UND', 0, 'PDV: GF TANQUERAY', 1),
  ('9ffade8c-11be-5da0-ac78-cac4e2b8cf91', 'b4fa78df-2d85-5223-84aa-9e0f21fbede0', 'a30c7795-4879-531c-9b42-946c0ae542ab', 1, 'UND', 0, 'PDV: RED BULL TROPICAL 250 ML C', 2),
  ('dd936953-3ea7-5dea-acf2-021a055f0676', '1dec1681-d161-5ad4-a3a7-1b4b3a9118da', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.012, 'UND', 0, 'PDV: GF ARPO BAG', 1),
  ('b7a01da7-1015-5d7b-b269-24a99e1d43cd', '1dec1681-d161-5ad4-a3a7-1b4b3a9118da', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('05b64de7-8fca-5ae5-bbe9-e1d6911e47e3', '1dec1681-d161-5ad4-a3a7-1b4b3a9118da', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 0.5, 'UND', 0, 'PDV: TONICA C', 3),
  ('1ebfc789-130d-517a-9060-79593d82e5ed', '08467c7b-f626-5662-b1cb-806591f671e5', '4ba889db-fc88-5cca-9ed4-f866855277d8', 0.066, 'UND', 0, 'PDV: GF GIN BOMBAY', 1),
  ('4c555f0e-553f-53d7-8079-3a51eb24eb22', '08467c7b-f626-5662-b1cb-806591f671e5', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('0c575a62-1134-58d2-9817-0bb571f14a51', '08467c7b-f626-5662-b1cb-806591f671e5', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 1, 'UND', 0, 'PDV: TONICA C', 3),
  ('62805f6b-f9d4-5ef6-a7be-246f92aa36c6', '3a95d358-da0f-5265-845d-0c511175aee5', '975cbcd3-7ee6-5956-bc07-098037cf9f3e', 0.066, 'UND', 0, 'PDV: GF TANQUERAY', 1),
  ('6b734c22-5a96-553c-8019-37214817eca2', '3a95d358-da0f-5265-845d-0c511175aee5', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 0.175, 'UND', 0, 'PDV: TONICA C', 2),
  ('fcfa9eb6-20df-5597-88bd-6800cb4fd82a', '3a95d358-da0f-5265-845d-0c511175aee5', 'cfe5fcc2-1632-5764-817d-e63458f01a24', 0.1, 'LT', 0, 'PDV: XAROPE DE MORANGO', 3),
  ('1679f9f2-e22c-5e99-a575-b6113931c991', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '19f33bd4-f067-5ce9-a218-b7ebda5cef98', 0.1, 'KG', 0, 'PDV: ABACAXI', 1),
  ('e5ba9a3d-8462-5955-a46b-6f24f6f246fd', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('56243d75-3d74-5113-894d-6e78e72a01e0', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '5506b461-f548-530b-989c-be427e6abae8', 0.062, 'UND', 0, 'PDV: GF TEQUILA JOSE CUERVO', 3),
  ('a4c461a7-cdda-5e9f-bf28-dbc0c6c38fc7', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '55829988-bd7c-5a4b-8dd0-8ec748af6201', 0.036, 'UND', 0, 'PDV: XAROPE FRANCES GRENADINE MONIN', 4),
  ('5f84761f-3331-5367-8461-ef280e9450a7', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '875290ab-7c19-5b93-81cd-74875ce9e445', 0.025, 'UND', 0, 'PDV: XAROPE MONIN SPICE MANGO', 5),
  ('c3bd3ccf-9825-515d-b948-29d164a6021a', '6152f477-5d2c-57e6-a71c-c99ba1803c12', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98', 0.062, 'UND', 0, 'PDV: GF GIN BEEFETER PINK 750 ML', 1),
  ('cbe981e3-b436-599d-aff3-2f3590aaba65', '6152f477-5d2c-57e6-a71c-c99ba1803c12', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('972e1fde-f78f-5f23-9b60-07c3c957134f', '6152f477-5d2c-57e6-a71c-c99ba1803c12', '85dca8e9-b524-5882-97a0-83d34d620c86', 1.1, 'UND', 0, 'PDV: MONSTER ENERGETICO SEM ACUCAR + MONSTER SABORES', 3),
  ('9ecb10f3-6e8c-57ad-a20e-475650fb9f4a', '6152f477-5d2c-57e6-a71c-c99ba1803c12', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.1, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 4),
  ('d712ced9-2ffd-5bd0-b757-312c1d77b0c8', '2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 1),
  ('ec918cbf-d1e4-54f9-9713-99046fa70322', '2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.5, 'UND', 0, 'PDV: MONSTER PACIFIC PUNCH 473 ML', 2),
  ('97e95833-2a48-511b-bbbc-f96d4cbcd4da', '2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c', 0.021, 'UND', 0, 'PDV: XAROPE MONIN DE MACA VERDE 700ML', 3),
  ('cdccf57a-b9fd-51b1-82ca-c6249ccf6113', '75ac6e85-33ca-5069-860b-2c23e0d567ac', 'a77c4e24-51bc-59c0-877a-371eb68afaed', 0.1, 'UND', 0, 'PDV: ESPUMANTE SALTON BRUT 750 ML', 1),
  ('60910559-5d8f-54bb-be06-ae731ca875d1', '75ac6e85-33ca-5069-860b-2c23e0d567ac', 'cc195de4-3e00-5e61-8bff-6ee91ac1a33f', 0.062, 'UND', 0, 'PDV: GF LIMONCELLO', 2),
  ('17a9c3da-deb0-59eb-9b93-7f1a06e19254', '75ac6e85-33ca-5069-860b-2c23e0d567ac', '13edac0f-c071-59e4-8c16-8e07d7fe3f3c', 0.05, 'KG', 0, 'PDV: LIMÃO SICILIANO', 3),
  ('1fecde11-9288-5f32-916a-47e1d2580bb0', '75ac6e85-33ca-5069-860b-2c23e0d567ac', 'bcdcb808-aa5a-589e-b7c8-da9437be95d1', 0.01, 'UND', 0, 'PDV: MANJERICAO', 4),
  ('84a74907-a998-5806-9990-b2d2181f4144', '75ac6e85-33ca-5069-860b-2c23e0d567ac', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.5, 'UND', 0, 'PDV: AGUA COM GAS', 5),
  ('012498ac-cadc-582e-a050-9ca2738f216b', '82a53d37-21a6-5ac9-a7cf-2cee49206fda', '9478f048-abef-524c-91e1-4990af1aff8a', 0.05, 'LT', 0, 'PDV: ESPUMA DE HIBISCO', 1),
  ('d148a0c2-17a0-5886-92fd-d8bb72800d0b', '82a53d37-21a6-5ac9-a7cf-2cee49206fda', '2281c43f-f891-55ee-ae00-3cb22272d9fa', 0.05, 'LT', 0, 'PDV: XAROPE DE GENGIBRE', 2),
  ('4ce055b4-9bc9-55df-8f66-40849a34b5e7', 'e2bdb7c1-aeae-545a-b070-fe46f89573d1', 'd7652807-853f-57d2-bf29-bcbe18a82c1a', 0.003, 'UND', 0, 'PDV: GF CAMPARI', 1),
  ('b79899f9-504a-502c-a924-02e7cfd7e870', 'e2bdb7c1-aeae-545a-b070-fe46f89573d1', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.006, 'UND', 0, 'PDV: GF ARPO BAG', 2),
  ('5560edde-9de4-5bd6-96c6-14b34664b2b5', 'e2bdb7c1-aeae-545a-b070-fe46f89573d1', '0a8b9e73-285b-5685-a5c5-08e327f3c14a', 0.033, 'UND', 0, 'PDV: GF CINZANO VERMOUTH ROSSO', 3),
  ('8c6d4bb2-2cea-5bbe-a2a0-bf40810b5278', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 1),
  ('05845764-7821-5cbf-9ff1-2d34ce66267d', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', '5d2df11c-139e-59f7-9ce1-1341bb618665', 0.04, 'LT', 0, 'PDV: MIX DE PINA', 2),
  ('4df23b27-006e-5e62-9c1b-defe9c2c228d', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', '9693737a-87e4-53d5-8b2e-cfdff05ad438', 0.1, 'UND', 0, 'PDV: MORANGO', 3),
  ('00e6c5b4-4515-50aa-9b08-e23000742237', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', 'ed7a267d-151e-501c-84ae-4ce41024e970', 0.01, 'UND', 0, 'PDV: XAROPE MONIN ACAI', 4),
  ('88d54faf-bb56-5aba-80d2-a6e7f2530d07', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.021, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 5),
  ('18cc7e87-1946-5cdd-9460-6b7d025c4d31', '4446da09-6756-5e3a-9a01-c0ebbe5716a2', '55829988-bd7c-5a4b-8dd0-8ec748af6201', 0.014, 'UND', 0, 'PDV: XAROPE FRANCES GRENADINE MONIN', 6),
  ('1602eaf7-caf2-50f0-9505-a24c0737f132', '48542889-8f6e-50e2-8ef9-e8b4f280813c', 'd17456f9-09ea-587e-be0f-90df95e1e79c', 0.07, 'UND', 0, 'PDV: GF PRATEADA', 1),
  ('720861d1-00c3-54d8-a927-6187bf1e1957', '48542889-8f6e-50e2-8ef9-e8b4f280813c', '39b974e7-291d-5942-bc3c-9a9574e7d2b9', 0.0186, 'UND', 0, 'PDV: GF CACHACA SALINAS', 2),
  ('2e785f35-e6a7-537c-b756-984f3e295fbf', '48542889-8f6e-50e2-8ef9-e8b4f280813c', 'ceb97526-3fa5-54ac-97bd-793d2d8e153b', 0.02, 'KG', 0, 'PDV: TANGERINA IMPORTADA', 3),
  ('c94bb2ce-c4e1-5cf3-89ef-76a662c91b7c', '48542889-8f6e-50e2-8ef9-e8b4f280813c', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.025, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 4),
  ('ea1934af-749d-538f-b0d0-9856cdf28ec2', '169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.25, 'UND', 0, 'PDV: MONSTER ULTRA FIESTA MANGO 473 ML', 1),
  ('84203050-45e3-5f0a-b58a-0fb50e9b241e', '169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '2800593c-5393-5b50-a73f-8e42e5d38529', 0.062, 'UND', 0, 'PDV: GF TEQUILA JOSE CUERVO ORO', 2),
  ('43821c4a-6cf0-57c9-ad58-ece16ce05791', '169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '875290ab-7c19-5b93-81cd-74875ce9e445', 0.01, 'UND', 0, 'PDV: XAROPE MONIN SPICE MANGO', 3),
  ('e34ec68e-1407-5454-811e-00500e946fc7', '7eb02966-30f4-5632-a533-270e1074795d', '547846ac-268d-553d-9bf8-2dcc72070fb6', 1, 'KG', 0, 'PDV: CAFÉ NESPRESSO BRAZIL ORGANIC', 1),
  ('11ef167c-bab9-595c-b07b-459ce3489a4b', '7eb02966-30f4-5632-a533-270e1074795d', '7ec6b740-bdb5-5d22-9871-592cae2a19cf', 0.01, 'KG', 0, 'PDV: MARSHMALLOW', 2),
  ('06a977f8-0d90-5b57-8c10-d328f36a4d2d', '7eb02966-30f4-5632-a533-270e1074795d', 'b79bd26c-dd75-5e43-94b6-93b939f9f95f', 0.062, 'UND', 0, 'PDV: GF BACARDI ORO', 3),
  ('51f9081d-80bd-5b67-a289-2d326d7724a6', '7eb02966-30f4-5632-a533-270e1074795d', 'e8bdfe3d-03f8-55e5-9cf8-46ddd0597bb6', 0.02, 'UND', 0, 'PDV: XAROPE MONIN CARAMELO 700 ML', 4),
  ('3b7d9668-2d20-5898-b65e-843b9fd89f62', 'fd64761b-abf4-5e74-8637-adce2a336fda', '1970db91-2eb8-5566-b5b0-341b2a320cd4', 0.062, 'UND', 0, 'PDV: GF GABRIELA', 1),
  ('e0c6c722-9fd7-59b1-9194-d7795cdc377b', 'fd64761b-abf4-5e74-8637-adce2a336fda', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.05, 'KG', 0, 'PDV: LIMÃO', 2),
  ('83b835bc-d2f9-5b41-844c-efee3350b466', 'fd64761b-abf4-5e74-8637-adce2a336fda', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4', 0.1, 'KG', 0, 'PDV: MARACUJÁ AZEDO', 3),
  ('2f6db9d3-344f-5f1c-9e01-b27c990bf822', 'fd64761b-abf4-5e74-8637-adce2a336fda', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.025, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 4),
  ('e4db0881-c991-5fd0-aa5c-d180ca73e6d5', 'fd64761b-abf4-5e74-8637-adce2a336fda', '55829988-bd7c-5a4b-8dd0-8ec748af6201', 0.025, 'UND', 0, 'PDV: XAROPE FRANCES GRENADINE MONIN', 5),
  ('179c35f0-e3cb-56aa-8430-609770dd5083', '13c818c5-b902-5132-8837-195d59dd20d0', '9478f048-abef-524c-91e1-4990af1aff8a', 0.05, 'LT', 0, 'PDV: ESPUMA DE HIBISCO', 1),
  ('e5e0d3c1-2dfa-50ff-8e8b-187f4fa7084e', '13c818c5-b902-5132-8837-195d59dd20d0', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 0.012, 'UND', 0, 'PDV: GF ARPO BAG', 2),
  ('6d7c57f6-1686-50b4-bf11-f303ce43431d', '13c818c5-b902-5132-8837-195d59dd20d0', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.015, 'KG', 0, 'PDV: LIMÃO', 3),
  ('b69ad045-613b-5ca6-80ba-3c107039a589', '13c818c5-b902-5132-8837-195d59dd20d0', '7fa72a53-1ca8-541e-ba0f-b39d7a6a4104', 0.05, 'KG', 0, 'PDV: UVA ROXA', 4),
  ('fd119c25-738a-5776-8a07-f828f1b09d61', '13c818c5-b902-5132-8837-195d59dd20d0', '37f58d0a-2f23-590b-9d6c-b9ed25a91bb7', 0.1, 'LT', 0, 'PDV: XAROPE DE UVA', 5),
  ('64852299-f677-50aa-9224-48a0a6af550c', '4525e832-01b9-5c14-98d4-da3e1113a4d1', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 1),
  ('5e4f5690-68af-503c-9d97-31117c82a6d7', '4525e832-01b9-5c14-98d4-da3e1113a4d1', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.2, 'UND', 0, 'PDV: MONSTER SABORES', 2),
  ('9bf6b3be-4bd4-5aa1-900d-8f6815042283', '4525e832-01b9-5c14-98d4-da3e1113a4d1', '2800593c-5393-5b50-a73f-8e42e5d38529', 0.062, 'UND', 0, 'PDV: GF TEQUILA JOSE CUERVO ORO', 3),
  ('3ad555e2-f14f-5114-9744-de80497323cc', '4525e832-01b9-5c14-98d4-da3e1113a4d1', '875290ab-7c19-5b93-81cd-74875ce9e445', 0.1, 'UND', 0, 'PDV: XAROPE MONIN MANGA 700ML', 4),
  ('281f01ee-3e37-51ce-837d-70373079eba7', 'ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 1),
  ('f1a3491f-933c-5d47-ac35-3d1b39e34f5c', 'ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '85dca8e9-b524-5882-97a0-83d34d620c86', 0.5, 'UND', 0, 'PDV: MONSTER SABORES', 2),
  ('1110a7db-2c90-552c-8ab8-0afe176860d1', 'ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '85093fba-36dd-5266-8a3b-641ed84460b4', 0.062, 'UND', 0, 'PDV: GF VODKA SKYY', 3),
  ('5dab0e7d-14bb-5732-84f2-084f4c9100dd', '7c0c701d-8262-5506-99ec-3089b31965eb', 'd17456f9-09ea-587e-be0f-90df95e1e79c', 0.07, 'UND', 0, 'PDV: GF PRATEADA', 1),
  ('f00922f3-6f98-5527-9976-976715ee65a8', '7c0c701d-8262-5506-99ec-3089b31965eb', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 2),
  ('48f0850a-5277-54f2-b697-1f3265b6bf33', '57823137-ab4b-5450-a8f9-e56af27f11b4', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 1),
  ('e56b71ad-2dd1-5c00-97e0-fbd18acd89fe', '57823137-ab4b-5450-a8f9-e56af27f11b4', 'b79bd26c-dd75-5e43-94b6-93b939f9f95f', 0.062, 'UND', 0, 'PDV: GF BACARDI ORO', 2),
  ('d61a3e3b-ace5-54b7-941a-39efbd670636', '57823137-ab4b-5450-a8f9-e56af27f11b4', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 0.071, 'UND', 0, 'PDV: XAROPE FRANCES BAUNILHA', 3),
  ('ee7937c5-13ea-5556-8792-85cc80b97b8f', '1fd1c668-fa04-5cd8-9a97-056f89e499ae', 'addab1e1-f266-5997-b81b-7d34779e2946', 0.001, 'UND', 0, 'PDV: BITTER ANGOSTURA AROMATIC', 1),
  ('f7926c56-5068-58b8-84ba-2b03e7935c9d', '1fd1c668-fa04-5cd8-9a97-056f89e499ae', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 2),
  ('78eb8946-05e8-5cea-9693-c5b27b7c02bb', '1fd1c668-fa04-5cd8-9a97-056f89e499ae', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 3),
  ('6dfe835d-02af-5a3b-bc20-9226ea48b938', '1fd1c668-fa04-5cd8-9a97-056f89e499ae', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4', 0.05, 'KG', 0, 'PDV: MARACUJÁ AZEDO', 4),
  ('2567057e-dcd2-5ca7-bd44-b179dcfab925', '1fd1c668-fa04-5cd8-9a97-056f89e499ae', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba', 0.01, 'LT', 0, 'PDV: XAROPE DE ACUCAR', 5),
  ('86d27c88-f889-5ac6-890b-16fae0e331b7', '0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'd917bc5b-2bda-58a8-91ea-a2746bed8455', 0.075, 'UND', 0, 'PDV: GF APEROL', 1),
  ('4641b86f-d3f3-58a0-aa2d-d474bb6f3415', '0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'a77c4e24-51bc-59c0-877a-371eb68afaed', 0.25, 'UND', 0, 'PDV: ESPUMANTE SALTON BRUT 750 ML', 2)
on conflict (ficha_id, produto_id) do update set
     quantidade = excluded.quantidade,
     unidade = excluded.unidade,
     perda_percentual = excluded.perda_percentual,
     observacao = excluded.observacao,
     ordem = excluded.ordem;

insert into ficha_itens (id, ficha_id, produto_id, quantidade, unidade, perda_percentual, observacao, ordem) values
  ('7c1a6380-2218-5d8f-99a1-f27bd768fbdc', '0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'da514cb3-f2d4-50e7-b0c2-9781b0ef268b', 0.01, 'KG', 0, 'PDV: LARANJA BAHIA', 3),
  ('18bd1a7a-b91c-54f7-ae21-c4244bfda263', '0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.05, 'UND', 0, 'PDV: AGUA COM GAS', 4),
  ('267e6305-4e32-57aa-bf1f-a58157502355', 'a6776e26-08d1-50cf-b746-509536923cc3', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', 0.05, 'KG', 0, 'PDV: ACUCAR REFINADO', 1),
  ('c126b808-a698-5f19-8a37-abae6ceeee34', 'a6776e26-08d1-50cf-b746-509536923cc3', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 0.066, 'UND', 0, 'PDV: CACHAÇA SAGATIBA', 2),
  ('393d8021-d757-5a67-908e-8d49e4b37d5c', 'a6776e26-08d1-50cf-b746-509536923cc3', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4', 0.03, 'KG', 0, 'PDV: MARACUJÁ AZEDO', 3),
  ('38a2965d-203a-5e35-9911-48319a6aafaf', 'a6776e26-08d1-50cf-b746-509536923cc3', '0721bf22-53ee-552b-85b0-390e3815fbce', 0.03, 'KG', 0, 'PDV: UVA THOMPSON', 4),
  ('d6cfcca1-6f57-5a64-b9f3-982388183dad', '0f881b17-934c-5c88-ae9e-571e75740f06', '2b872e07-6138-5b96-8eca-cf28477e8e18', 0.1, 'KG', 0, 'PDV: LIMA DA PERSIA', 1),
  ('c0273369-ccf0-59c7-9f15-6b5d6af7b18b', '0f881b17-934c-5c88-ae9e-571e75740f06', '85093fba-36dd-5266-8a3b-641ed84460b4', 0.062, 'UND', 0, 'PDV: GF VODKA SKYY', 2),
  ('b6089ac8-0168-5ea4-980b-1851b345fce6', '152bb216-c36a-5c3e-98d9-5961987b8c4e', '2281c43f-f891-55ee-ae00-3cb22272d9fa', 0.1, 'LT', 0, 'PDV: XAROPE DE GENGIBRE', 1),
  ('257be39d-1416-5733-848c-8c9ec7e827b2', 'edc42641-fa54-5bf0-9c47-b1f552e00fed', '9693737a-87e4-53d5-8b2e-cfdff05ad438', 0.05, 'UND', 0, 'PDV: MORANGO', 1),
  ('7031bc19-28a9-57dc-9c9d-65ea91a43637', 'edc42641-fa54-5bf0-9c47-b1f552e00fed', '5f1e53b1-db9c-5707-8c37-d6d3a3f855f6', 1, 'UND', 0, 'PDV: TONICA RED MINT', 2),
  ('2c65f5d3-e676-5092-bdd2-f5d559679ea6', '45574e1d-b121-5266-9513-c8d62ac08d3e', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.025, 'UND', 0, 'PDV: AGUA COM GAS', 1),
  ('86e25575-d7b4-50c8-ae89-269359b0a48e', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', 0.1, 'KG', 0, 'PDV: LIMÃO', 1),
  ('7d3a252b-b025-5965-879b-85f3f2335b8a', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', 'db164cac-2a2d-550e-99c5-ca9d91c657fd', 1, 'UND', 0, 'PDV: SUCO NATURAL', 2),
  ('ea34e870-520d-59d4-a5df-47f7878bd108', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', '2281c43f-f891-55ee-ae00-3cb22272d9fa', 0.1, 'LT', 0, 'PDV: XAROPE DE GENGIBRE', 3),
  ('8862a2e9-daba-5cfb-8fc9-fca821a26002', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', '8d0ce4e2-f036-561a-9c7e-369ee1a1a36e', 0.1, 'LT', 0, 'PDV: XAROPE DE HIBISCO', 4),
  ('cd83b226-7e9f-542b-95ef-bf1f8af41e6c', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 0.5, 'UND', 0, 'PDV: AGUA COM GAS', 5),
  ('1c5aceaa-bf47-5dfb-8ac3-728a3bcd6595', '5dd17f82-0cae-5026-957c-42421a73800a', '71761253-d7c5-5340-89f6-7020e3f62e8b', 1, 'UND', 0, 'PDV: COCA-COLA KS', 1),
  ('452f4e75-a31a-5f25-91ef-8a2925f2d024', '7236370a-2e08-5f3b-8785-7f07023afbf4', 'c9ae0be8-b02c-5e60-8396-7ff744e2a9aa', 1, 'UND', 0, 'PDV: COCA-COLA ZERO KS', 1)
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
-- Esta e a parte que a carga de outubro nao tinha e que custou uma aplicacao
-- quebrada. O `on conflict` acima resolve "o item mudou" e "o item e novo"; ele
-- NAO resolve "o item deixou de existir". Sem o delete abaixo, tirar um
-- ingrediente da ficha no arquivo e reaplicar deixaria o ingrediente velho no
-- banco para sempre, somando custo que a receita nao tem mais.
--
-- O delete e por PAR (ficha, produto) e nao por ficha, e e isso que faz ele
-- cobrir os tres casos de uma vez: item removido da lista, ficha que encolheu,
-- e ficha que trocou um produto por outro. Ele so olha as 79 fichas desta
-- carga — ficha que a cliente criar pela tela nao e tocada.
-- ---------------------------------------------------------------------------

delete from ficha_itens i
 using fichas f
 where f.id = i.ficha_id
   and f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
   and i.ficha_id in (
    '95055903-8990-5624-a144-6b413a705e96', '3e80c1c3-483b-5c98-98cd-da428b897f3f', '9352654e-6c75-5c5b-9114-681277de3af8',
    '38f8c969-12e4-5ba0-a84e-ff087fb10095', '23d9d7e4-6c9b-5d3a-aa8b-41427973804e', '1c98f080-1d0a-50a8-a77d-d57dc9b0adc1',
    '19386778-500f-5268-94d5-49417e324d5b', '8fd86521-f0b2-5cfb-999b-d67614bd2ec1', '88693e80-5a99-5aee-925a-cf29b60510d9',
    '792bcb6e-6f8e-545c-a48f-1fea44113eda', 'e814d37a-60a7-5e4b-8611-2d42626bf2bf', '6fc63342-e99c-5132-a0ea-d42f92b4e15b',
    'e4a299d4-78a2-5dd1-8d7f-5719fe98a7e2', '67cd4035-d289-5dba-91c5-c9a82da7a8f7', 'b2a17154-045a-5258-bc42-2a21b8fc39ec',
    '976cc45e-2e55-52a8-914e-f814deb20452', '4ab9505f-8d95-56c0-aeec-e4712346b25b', '616e2fbe-a789-5df2-a15c-fe10f1df5455',
    '2808438a-352a-5570-8102-73ea72bc40f5', '09ae139e-d65c-5b98-bad7-a3fb35ffadd4', '2972cfd7-628d-5f0c-9486-993f94961231',
    'b9ffcc60-77ab-57f1-b5a4-ccca52aca995', '997f6893-7b76-5934-8f2d-0249274b41c4', '99f242e7-d548-5e7d-9932-9f4a9cbe54d6',
    '6fb2af9c-73b7-5b32-a329-8f876c27eb2f', '020bf257-9cbd-54a2-9e62-9154679f603d', '0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a',
    'c69d7374-3ba7-55bd-ace4-8f912f546610', 'cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', 'a78043db-4a76-5d64-9973-20eedfeca10d',
    'c6483741-e661-56dc-a3a0-52f14aba1b1e', 'a176a479-44b0-582b-b83a-3760e1790457', '21e5da96-fd2d-5d2e-804c-b431790429e7',
    '42655c6d-ef62-5ed2-a09e-a0fc05321206', '816545ff-4f9d-5aca-bc28-f7d27606dcad', '4a9ac3f1-b661-5352-815f-130ca7e2ef99',
    '455ff383-da0d-56ad-8903-3f176f79ac00', '93d3728a-fdbf-57c9-af90-facaeb93c654', '4e8468df-d206-5e95-b519-965dccf84921',
    'ef0689c3-1ce9-5863-841c-8727995acacc', '643aa1de-242f-59d5-8235-3eb624580d03', '6000c57a-cd7d-5b9d-b47b-7e524a0660f2',
    '924b6ffb-7838-5e18-9610-4305eeb9769e', '5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '461e3985-95b2-51cb-8ccf-d94057c95189',
    'dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '9b145afd-22e6-5e73-b05f-a0e20df65dab', '57d67512-8f2a-5d2d-a198-aeefa95773cb',
    '65745fd4-d0a0-5b24-bb9b-3efe01385351', 'b4fa78df-2d85-5223-84aa-9e0f21fbede0', '1dec1681-d161-5ad4-a3a7-1b4b3a9118da',
    '08467c7b-f626-5662-b1cb-806591f671e5', '3a95d358-da0f-5265-845d-0c511175aee5', 'c930e0d8-8da1-5c29-bdc4-c70e1c8949a0',
    '6152f477-5d2c-57e6-a71c-c99ba1803c12', '2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', '75ac6e85-33ca-5069-860b-2c23e0d567ac',
    '82a53d37-21a6-5ac9-a7cf-2cee49206fda', 'e2bdb7c1-aeae-545a-b070-fe46f89573d1', '4446da09-6756-5e3a-9a01-c0ebbe5716a2',
    '48542889-8f6e-50e2-8ef9-e8b4f280813c', '169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '7eb02966-30f4-5632-a533-270e1074795d',
    'fd64761b-abf4-5e74-8637-adce2a336fda', '13c818c5-b902-5132-8837-195d59dd20d0', '4525e832-01b9-5c14-98d4-da3e1113a4d1',
    'ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '7c0c701d-8262-5506-99ec-3089b31965eb', '57823137-ab4b-5450-a8f9-e56af27f11b4',
    '1fd1c668-fa04-5cd8-9a97-056f89e499ae', '0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'a6776e26-08d1-50cf-b746-509536923cc3',
    '0f881b17-934c-5c88-ae9e-571e75740f06', '152bb216-c36a-5c3e-98d9-5961987b8c4e', 'edc42641-fa54-5bf0-9c47-b1f552e00fed',
    '45574e1d-b121-5266-9513-c8d62ac08d3e', 'e5645b37-fdba-557d-8ed4-4f5d6d94566c', '5dd17f82-0cae-5026-957c-42421a73800a',
    '7236370a-2e08-5f3b-8785-7f07023afbf4'
   )
   and (i.ficha_id, i.produto_id) not in (
    ('95055903-8990-5624-a144-6b413a705e96', 'e2007236-4bc3-5813-b5fc-d450a1d14ab3'), ('3e80c1c3-483b-5c98-98cd-da428b897f3f', '793bd6d9-d16b-5886-a1e8-4fd9977194c8'),
    ('9352654e-6c75-5c5b-9114-681277de3af8', '0ada73a6-ae98-5cd8-8c35-2c1be6eded8f'), ('38f8c969-12e4-5ba0-a84e-ff087fb10095', '17f09dbe-399c-5c33-9d43-5555da2679a7'),
    ('23d9d7e4-6c9b-5d3a-aa8b-41427973804e', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'), ('1c98f080-1d0a-50a8-a77d-d57dc9b0adc1', '2d9be38d-b257-55c1-b331-d703c08a51ff'),
    ('19386778-500f-5268-94d5-49417e324d5b', 'ea3d443f-becf-58b9-aefc-300d1857d4d4'), ('8fd86521-f0b2-5cfb-999b-d67614bd2ec1', '3fcdd3ff-5266-505f-860f-0c03702494a6'),
    ('88693e80-5a99-5aee-925a-cf29b60510d9', 'e2007236-4bc3-5813-b5fc-d450a1d14ab3'), ('792bcb6e-6f8e-545c-a48f-1fea44113eda', 'c9ae0be8-b02c-5e60-8396-7ff744e2a9aa'),
    ('e814d37a-60a7-5e4b-8611-2d42626bf2bf', '71761253-d7c5-5340-89f6-7020e3f62e8b'), ('6fc63342-e99c-5132-a0ea-d42f92b4e15b', '8cc5fd8a-6f16-5ee9-8e79-b78a396164b0'),
    ('e4a299d4-78a2-5dd1-8d7f-5719fe98a7e2', '2ca5fa6d-643f-57e4-95e1-44c0dcd4d6de'), ('67cd4035-d289-5dba-91c5-c9a82da7a8f7', '9dba175e-7996-51ef-b7b7-08049e721eef'),
    ('b2a17154-045a-5258-bc42-2a21b8fc39ec', 'd349e311-1c28-525b-a5d3-602d4ae802b3'), ('976cc45e-2e55-52a8-914e-f814deb20452', '4ffe41ca-0b27-5dae-aa87-7d9b846eca88'),
    ('4ab9505f-8d95-56c0-aeec-e4712346b25b', '11fb856d-f850-55bb-adb6-1d66104535c1'), ('616e2fbe-a789-5df2-a15c-fe10f1df5455', 'a30c7795-4879-531c-9b42-946c0ae542ab'),
    ('2808438a-352a-5570-8102-73ea72bc40f5', '2a7eea71-762b-523e-8c56-c787ae144577'), ('09ae139e-d65c-5b98-bad7-a3fb35ffadd4', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'),
    ('2972cfd7-628d-5f0c-9486-993f94961231', 'de6d2786-632b-5236-b721-079f3f483bd1'), ('b9ffcc60-77ab-57f1-b5a4-ccca52aca995', '8dd9cd92-7dc2-5739-afc5-9b35e064431e'),
    ('b9ffcc60-77ab-57f1-b5a4-ccca52aca995', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('b9ffcc60-77ab-57f1-b5a4-ccca52aca995', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'),
    ('997f6893-7b76-5934-8f2d-0249274b41c4', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('997f6893-7b76-5934-8f2d-0249274b41c4', '85dca8e9-b524-5882-97a0-83d34d620c86'),
    ('997f6893-7b76-5934-8f2d-0249274b41c4', '85093fba-36dd-5266-8a3b-641ed84460b4'), ('997f6893-7b76-5934-8f2d-0249274b41c4', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c'),
    ('99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'd917bc5b-2bda-58a8-91ea-a2746bed8455'), ('99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'a77c4e24-51bc-59c0-877a-371eb68afaed'),
    ('99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'da514cb3-f2d4-50e7-b0c2-9781b0ef268b'), ('99f242e7-d548-5e7d-9932-9f4a9cbe54d6', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'),
    ('6fb2af9c-73b7-5b32-a329-8f876c27eb2f', 'acb5761f-87f7-5433-8938-615f0631fdf6'), ('6fb2af9c-73b7-5b32-a329-8f876c27eb2f', 'a77c4e24-51bc-59c0-877a-371eb68afaed'),
    ('6fb2af9c-73b7-5b32-a329-8f876c27eb2f', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('6fb2af9c-73b7-5b32-a329-8f876c27eb2f', '7ec6b740-bdb5-5d22-9871-592cae2a19cf'),
    ('020bf257-9cbd-54a2-9e62-9154679f603d', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb'), ('020bf257-9cbd-54a2-9e62-9154679f603d', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'),
    ('020bf257-9cbd-54a2-9e62-9154679f603d', '07a63dbb-8f8a-5183-9d29-66e11e43c72a'), ('0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'),
    ('0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', '07a63dbb-8f8a-5183-9d29-66e11e43c72a'),
    ('0ab46e4a-d7af-5d9b-9e96-6bd6e8b3662a', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('c69d7374-3ba7-55bd-ace4-8f912f546610', '3bdd7c34-1b21-58f1-acdf-1b127b657f1e'),
    ('c69d7374-3ba7-55bd-ace4-8f912f546610', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('c69d7374-3ba7-55bd-ace4-8f912f546610', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba'),
    ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'), ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '547846ac-268d-553d-9bf8-2dcc72070fb6'),
    ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba'),
    ('cdfbc635-3523-54fd-a0d2-13c9a3ae9d6e', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('a78043db-4a76-5d64-9973-20eedfeca10d', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb'),
    ('a78043db-4a76-5d64-9973-20eedfeca10d', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'), ('a78043db-4a76-5d64-9973-20eedfeca10d', '07a63dbb-8f8a-5183-9d29-66e11e43c72a'),
    ('a78043db-4a76-5d64-9973-20eedfeca10d', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'), ('c6483741-e661-56dc-a3a0-52f14aba1b1e', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb'),
    ('c6483741-e661-56dc-a3a0-52f14aba1b1e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('c6483741-e661-56dc-a3a0-52f14aba1b1e', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'),
    ('a176a479-44b0-582b-b83a-3760e1790457', 'b55a4060-5a7a-5205-bd54-b3b2ec553109'), ('21e5da96-fd2d-5d2e-804c-b431790429e7', '11706c2a-7e9c-5695-ad0e-bb4d0160e247'),
    ('21e5da96-fd2d-5d2e-804c-b431790429e7', 'd17456f9-09ea-587e-be0f-90df95e1e79c'), ('21e5da96-fd2d-5d2e-804c-b431790429e7', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('42655c6d-ef62-5ed2-a09e-a0fc05321206', 'd17456f9-09ea-587e-be0f-90df95e1e79c'), ('42655c6d-ef62-5ed2-a09e-a0fc05321206', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('42655c6d-ef62-5ed2-a09e-a0fc05321206', '648ae03e-5952-52f8-994b-0f02fd4cf304'), ('816545ff-4f9d-5aca-bc28-f7d27606dcad', '11706c2a-7e9c-5695-ad0e-bb4d0160e247'),
    ('816545ff-4f9d-5aca-bc28-f7d27606dcad', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'), ('816545ff-4f9d-5aca-bc28-f7d27606dcad', '0721bf22-53ee-552b-85b0-390e3815fbce'),
    ('4a9ac3f1-b661-5352-815f-130ca7e2ef99', '11706c2a-7e9c-5695-ad0e-bb4d0160e247'), ('4a9ac3f1-b661-5352-815f-130ca7e2ef99', '9693737a-87e4-53d5-8b2e-cfdff05ad438'),
    ('4a9ac3f1-b661-5352-815f-130ca7e2ef99', '46e753df-2f38-5a51-b32e-9056987b82da'), ('455ff383-da0d-56ad-8903-3f176f79ac00', '11706c2a-7e9c-5695-ad0e-bb4d0160e247'),
    ('455ff383-da0d-56ad-8903-3f176f79ac00', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('455ff383-da0d-56ad-8903-3f176f79ac00', '85093fba-36dd-5266-8a3b-641ed84460b4'),
    ('93d3728a-fdbf-57c9-af90-facaeb93c654', 'da751684-55a1-5e6a-afc0-e8cc647340d5'), ('93d3728a-fdbf-57c9-af90-facaeb93c654', '07a63dbb-8f8a-5183-9d29-66e11e43c72a'),
    ('93d3728a-fdbf-57c9-af90-facaeb93c654', '875290ab-7c19-5b93-81cd-74875ce9e445'), ('4e8468df-d206-5e95-b519-965dccf84921', 'd7652807-853f-57d2-bf29-bcbe18a82c1a'),
    ('4e8468df-d206-5e95-b519-965dccf84921', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('4e8468df-d206-5e95-b519-965dccf84921', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'),
    ('ef0689c3-1ce9-5863-841c-8727995acacc', '547846ac-268d-553d-9bf8-2dcc72070fb6'), ('ef0689c3-1ce9-5863-841c-8727995acacc', '8dd9cd92-7dc2-5739-afc5-9b35e064431e'),
    ('643aa1de-242f-59d5-8235-3eb624580d03', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'), ('643aa1de-242f-59d5-8235-3eb624580d03', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('643aa1de-242f-59d5-8235-3eb624580d03', '5cae0188-9581-5a1f-ba01-ff79e6008478'), ('643aa1de-242f-59d5-8235-3eb624580d03', 'ed7a267d-151e-501c-84ae-4ce41024e970'),
    ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '57143922-9fb1-5873-889b-c7160e879247'), ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'),
    ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', '7fa72a53-1ca8-541e-ba0f-b39d7a6a4104'),
    ('6000c57a-cd7d-5b9d-b47b-7e524a0660f2', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('924b6ffb-7838-5e18-9610-4305eeb9769e', '19f33bd4-f067-5ce9-a218-b7ebda5cef98'),
    ('924b6ffb-7838-5e18-9610-4305eeb9769e', 'addab1e1-f266-5997-b81b-7d34779e2946'), ('924b6ffb-7838-5e18-9610-4305eeb9769e', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'),
    ('924b6ffb-7838-5e18-9610-4305eeb9769e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('924b6ffb-7838-5e18-9610-4305eeb9769e', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba'),
    ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '79e3cc0e-6ea8-5c55-abc1-e336321fe4fb'), ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '5d2df11c-139e-59f7-9ce1-1341bb618665'),
    ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '9693737a-87e4-53d5-8b2e-cfdff05ad438'), ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '85093fba-36dd-5266-8a3b-641ed84460b4'),
    ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', '55829988-bd7c-5a4b-8dd0-8ec748af6201'), ('5a5ce539-33f1-5bfa-ad46-86c41f1ed3cd', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c'),
    ('461e3985-95b2-51cb-8ccf-d94057c95189', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'), ('461e3985-95b2-51cb-8ccf-d94057c95189', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('461e3985-95b2-51cb-8ccf-d94057c95189', '0778e020-8f29-5b43-8d7c-fe8c80d29830'), ('461e3985-95b2-51cb-8ccf-d94057c95189', 'cfe5fcc2-1632-5764-817d-e63458f01a24'),
    ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', 'cc195de4-3e00-5e61-8bff-6ee91ac1a33f'), ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'), ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '4dd0f67c-0d79-5260-ba97-c3056ba8d1cb'),
    ('dc67c60f-fbba-5396-9baf-1f75f4bd9be1', '0de840f4-066f-57d5-8f75-3ff10f33c74c'), ('9b145afd-22e6-5e73-b05f-a0e20df65dab', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98'),
    ('9b145afd-22e6-5e73-b05f-a0e20df65dab', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('9b145afd-22e6-5e73-b05f-a0e20df65dab', '85dca8e9-b524-5882-97a0-83d34d620c86'),
    ('9b145afd-22e6-5e73-b05f-a0e20df65dab', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('57d67512-8f2a-5d2d-a198-aeefa95773cb', '9478f048-abef-524c-91e1-4990af1aff8a'),
    ('57d67512-8f2a-5d2d-a198-aeefa95773cb', 'b38d0bda-9878-5ab6-bc51-0da311f8e0ec'), ('65745fd4-d0a0-5b24-bb9b-3efe01385351', '9478f048-abef-524c-91e1-4990af1aff8a'),
    ('65745fd4-d0a0-5b24-bb9b-3efe01385351', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98'), ('65745fd4-d0a0-5b24-bb9b-3efe01385351', '9693737a-87e4-53d5-8b2e-cfdff05ad438'),
    ('65745fd4-d0a0-5b24-bb9b-3efe01385351', '0778e020-8f29-5b43-8d7c-fe8c80d29830'), ('b4fa78df-2d85-5223-84aa-9e0f21fbede0', '975cbcd3-7ee6-5956-bc07-098037cf9f3e'),
    ('b4fa78df-2d85-5223-84aa-9e0f21fbede0', 'a30c7795-4879-531c-9b42-946c0ae542ab'), ('1dec1681-d161-5ad4-a3a7-1b4b3a9118da', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'),
    ('1dec1681-d161-5ad4-a3a7-1b4b3a9118da', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('1dec1681-d161-5ad4-a3a7-1b4b3a9118da', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'),
    ('08467c7b-f626-5662-b1cb-806591f671e5', '4ba889db-fc88-5cca-9ed4-f866855277d8'), ('08467c7b-f626-5662-b1cb-806591f671e5', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('08467c7b-f626-5662-b1cb-806591f671e5', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'), ('3a95d358-da0f-5265-845d-0c511175aee5', '975cbcd3-7ee6-5956-bc07-098037cf9f3e'),
    ('3a95d358-da0f-5265-845d-0c511175aee5', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24'), ('3a95d358-da0f-5265-845d-0c511175aee5', 'cfe5fcc2-1632-5764-817d-e63458f01a24'),
    ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '19f33bd4-f067-5ce9-a218-b7ebda5cef98'), ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '5506b461-f548-530b-989c-be427e6abae8'), ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '55829988-bd7c-5a4b-8dd0-8ec748af6201'),
    ('c930e0d8-8da1-5c29-bdc4-c70e1c8949a0', '875290ab-7c19-5b93-81cd-74875ce9e445'), ('6152f477-5d2c-57e6-a71c-c99ba1803c12', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98'),
    ('6152f477-5d2c-57e6-a71c-c99ba1803c12', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('6152f477-5d2c-57e6-a71c-c99ba1803c12', '85dca8e9-b524-5882-97a0-83d34d620c86'),
    ('6152f477-5d2c-57e6-a71c-c99ba1803c12', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', '85dca8e9-b524-5882-97a0-83d34d620c86'), ('2180fbc3-69c8-5f6b-bc29-f102fc8a2a1e', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c'),
    ('75ac6e85-33ca-5069-860b-2c23e0d567ac', 'a77c4e24-51bc-59c0-877a-371eb68afaed'), ('75ac6e85-33ca-5069-860b-2c23e0d567ac', 'cc195de4-3e00-5e61-8bff-6ee91ac1a33f'),
    ('75ac6e85-33ca-5069-860b-2c23e0d567ac', '13edac0f-c071-59e4-8c16-8e07d7fe3f3c'), ('75ac6e85-33ca-5069-860b-2c23e0d567ac', 'bcdcb808-aa5a-589e-b7c8-da9437be95d1'),
    ('75ac6e85-33ca-5069-860b-2c23e0d567ac', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'), ('82a53d37-21a6-5ac9-a7cf-2cee49206fda', '9478f048-abef-524c-91e1-4990af1aff8a'),
    ('82a53d37-21a6-5ac9-a7cf-2cee49206fda', '2281c43f-f891-55ee-ae00-3cb22272d9fa'), ('e2bdb7c1-aeae-545a-b070-fe46f89573d1', 'd7652807-853f-57d2-bf29-bcbe18a82c1a'),
    ('e2bdb7c1-aeae-545a-b070-fe46f89573d1', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'), ('e2bdb7c1-aeae-545a-b070-fe46f89573d1', '0a8b9e73-285b-5685-a5c5-08e327f3c14a'),
    ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', '5d2df11c-139e-59f7-9ce1-1341bb618665'),
    ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', '9693737a-87e4-53d5-8b2e-cfdff05ad438'), ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', 'ed7a267d-151e-501c-84ae-4ce41024e970'),
    ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('4446da09-6756-5e3a-9a01-c0ebbe5716a2', '55829988-bd7c-5a4b-8dd0-8ec748af6201'),
    ('48542889-8f6e-50e2-8ef9-e8b4f280813c', 'd17456f9-09ea-587e-be0f-90df95e1e79c'), ('48542889-8f6e-50e2-8ef9-e8b4f280813c', '39b974e7-291d-5942-bc3c-9a9574e7d2b9'),
    ('48542889-8f6e-50e2-8ef9-e8b4f280813c', 'ceb97526-3fa5-54ac-97bd-793d2d8e153b'), ('48542889-8f6e-50e2-8ef9-e8b4f280813c', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'),
    ('169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '85dca8e9-b524-5882-97a0-83d34d620c86'), ('169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '2800593c-5393-5b50-a73f-8e42e5d38529'),
    ('169d6e22-6f78-5e64-95d6-7bd20fadfc4c', '875290ab-7c19-5b93-81cd-74875ce9e445'), ('7eb02966-30f4-5632-a533-270e1074795d', '547846ac-268d-553d-9bf8-2dcc72070fb6'),
    ('7eb02966-30f4-5632-a533-270e1074795d', '7ec6b740-bdb5-5d22-9871-592cae2a19cf'), ('7eb02966-30f4-5632-a533-270e1074795d', 'b79bd26c-dd75-5e43-94b6-93b939f9f95f'),
    ('7eb02966-30f4-5632-a533-270e1074795d', 'e8bdfe3d-03f8-55e5-9cf8-46ddd0597bb6'), ('fd64761b-abf4-5e74-8637-adce2a336fda', '1970db91-2eb8-5566-b5b0-341b2a320cd4'),
    ('fd64761b-abf4-5e74-8637-adce2a336fda', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('fd64761b-abf4-5e74-8637-adce2a336fda', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4'),
    ('fd64761b-abf4-5e74-8637-adce2a336fda', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('fd64761b-abf4-5e74-8637-adce2a336fda', '55829988-bd7c-5a4b-8dd0-8ec748af6201'),
    ('13c818c5-b902-5132-8837-195d59dd20d0', '9478f048-abef-524c-91e1-4990af1aff8a'), ('13c818c5-b902-5132-8837-195d59dd20d0', '9e761b73-a50f-5df9-a451-f5a6edadb8a1'),
    ('13c818c5-b902-5132-8837-195d59dd20d0', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('13c818c5-b902-5132-8837-195d59dd20d0', '7fa72a53-1ca8-541e-ba0f-b39d7a6a4104'),
    ('13c818c5-b902-5132-8837-195d59dd20d0', '37f58d0a-2f23-590b-9d6c-b9ed25a91bb7'), ('4525e832-01b9-5c14-98d4-da3e1113a4d1', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('4525e832-01b9-5c14-98d4-da3e1113a4d1', '85dca8e9-b524-5882-97a0-83d34d620c86'), ('4525e832-01b9-5c14-98d4-da3e1113a4d1', '2800593c-5393-5b50-a73f-8e42e5d38529'),
    ('4525e832-01b9-5c14-98d4-da3e1113a4d1', '875290ab-7c19-5b93-81cd-74875ce9e445'), ('ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '85dca8e9-b524-5882-97a0-83d34d620c86'), ('ab8e6403-dc95-5a53-bc3b-20db8cf1b7e8', '85093fba-36dd-5266-8a3b-641ed84460b4'),
    ('7c0c701d-8262-5506-99ec-3089b31965eb', 'd17456f9-09ea-587e-be0f-90df95e1e79c'), ('7c0c701d-8262-5506-99ec-3089b31965eb', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('57823137-ab4b-5450-a8f9-e56af27f11b4', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('57823137-ab4b-5450-a8f9-e56af27f11b4', 'b79bd26c-dd75-5e43-94b6-93b939f9f95f'),
    ('57823137-ab4b-5450-a8f9-e56af27f11b4', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953'), ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', 'addab1e1-f266-5997-b81b-7d34779e2946'),
    ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'), ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'),
    ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4'), ('1fd1c668-fa04-5cd8-9a97-056f89e499ae', '1604a0db-ce1e-5dc7-99e9-d56ebfb8f4ba'),
    ('0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'd917bc5b-2bda-58a8-91ea-a2746bed8455'), ('0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'a77c4e24-51bc-59c0-877a-371eb68afaed'),
    ('0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'da514cb3-f2d4-50e7-b0c2-9781b0ef268b'), ('0d5cb47d-5dba-5fb8-95f6-5ea397b530fa', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'),
    ('a6776e26-08d1-50cf-b746-509536923cc3', '11706c2a-7e9c-5695-ad0e-bb4d0160e247'), ('a6776e26-08d1-50cf-b746-509536923cc3', '4d037b19-ce78-5c35-b6e3-a38c97c89f16'),
    ('a6776e26-08d1-50cf-b746-509536923cc3', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4'), ('a6776e26-08d1-50cf-b746-509536923cc3', '0721bf22-53ee-552b-85b0-390e3815fbce'),
    ('0f881b17-934c-5c88-ae9e-571e75740f06', '2b872e07-6138-5b96-8eca-cf28477e8e18'), ('0f881b17-934c-5c88-ae9e-571e75740f06', '85093fba-36dd-5266-8a3b-641ed84460b4'),
    ('152bb216-c36a-5c3e-98d9-5961987b8c4e', '2281c43f-f891-55ee-ae00-3cb22272d9fa'), ('edc42641-fa54-5bf0-9c47-b1f552e00fed', '9693737a-87e4-53d5-8b2e-cfdff05ad438'),
    ('edc42641-fa54-5bf0-9c47-b1f552e00fed', '5f1e53b1-db9c-5707-8c37-d6d3a3f855f6'), ('45574e1d-b121-5266-9513-c8d62ac08d3e', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'),
    ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b'), ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', 'db164cac-2a2d-550e-99c5-ca9d91c657fd'),
    ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', '2281c43f-f891-55ee-ae00-3cb22272d9fa'), ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', '8d0ce4e2-f036-561a-9c7e-369ee1a1a36e'),
    ('e5645b37-fdba-557d-8ed4-4f5d6d94566c', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405'), ('5dd17f82-0cae-5026-957c-42421a73800a', '71761253-d7c5-5340-89f6-7020e3f62e8b'),
    ('7236370a-2e08-5f3b-8785-7f07023afbf4', 'c9ae0be8-b02c-5e60-8396-7ff744e2a9aa')
   );

-- ---------------------------------------------------------------------------
-- 5 · Verificacao. Se a conta nao fechar, a transacao cai aqui e nao na
--     producao de alguem.
--
-- Nove perguntas, e nenhuma delas e "parece correto":
--
--   1. as 79 fichas existem?
--   2. os 219 itens existem — nem um a mais (duplicacao) nem a menos?
--   3. a soma de custo que a VISTA calcula bate com a que o normalizador
--      calculou do retrato do catalogo? E a prova de que o de-para fala do
--      mesmo catalogo que esta no banco;
--   4. alguma ficha com custo zero? Ficha de bebida com custo zero e erro de
--      mapeamento, e o briefing proibe custo zero inexplicado;
--   5. algum item apontando para produto INATIVO? O custo dele viria zero e
--      ninguem olharia duas vezes;
--   6. algum item com unidade incompativel? A vista marca
--      `unidade_incompativel` quando nao sabe converter, e nesse caso o custo
--      do item vem NULO — a ficha mentiria para baixo;
--   7. o catalogo tem 891 produtos (= 879 + os 12 preparos)?
--   8. a contagem de agosto continua valendo R$ 78681.3573?
--   9. e a de outubro, R$ 71961.351?
-- ---------------------------------------------------------------------------

do $$
declare
  v_fichas       integer;
  v_itens        integer;
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
    from fichas where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';

  select count(*) into v_itens
    from ficha_itens i
    join fichas f on f.id = i.ficha_id
   where f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';

  select coalesce(sum(custo_total), 0) into v_custo
    from vw_fichas_completas where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';

  if v_fichas <> 79 then
    raise exception '0004: % fichas, esperado 79', v_fichas;
  end if;

  if v_itens <> 219 then
    raise exception '0004: % itens de ficha, esperado 219', v_itens;
  end if;

  -- Tolerancia de um centavo: o normalizador arredonda cada item em 4 casas e a
  -- vista tambem. Diferenca maior que isso e de DADO, nao de arredondamento.
  if abs(v_custo - 542.5965) > 0.01 then
    raise exception '0004: custo somado das fichas e %, esperado 542.5965 (diferenca de %)',
      v_custo, abs(v_custo - 542.5965);
  end if;

  select count(*), string_agg(nome, ', ' order by nome)
    into v_zeradas, v_nomes
    from vw_fichas_completas
   where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and custo_total = 0;
  if v_zeradas > 0 then
    raise exception '0004: % ficha(s) com custo ZERO: %. Custo zero em ficha de bebida e erro de mapeamento.',
      v_zeradas, v_nomes;
  end if;

  select count(*) into v_inativos
    from ficha_itens i
    join fichas f   on f.id = i.ficha_id
    join produtos p on p.id = i.produto_id
   where f.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and not p.ativo;
  if v_inativos > 0 then
    raise exception '0004: % item(ns) apontando para produto INATIVO', v_inativos;
  end if;

  select count(*) into v_incompat
    from vw_ficha_itens
   where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and unidade_incompativel;
  if v_incompat > 0 then
    raise exception '0004: % item(ns) com unidade incompativel — o custo deles vem NULO', v_incompat;
  end if;

  select count(*) into v_produtos
    from produtos where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  if v_produtos <> 891 then
    raise exception '0004: % produtos cadastrados, esperado 891 (= 879 + 12 preparos)', v_produtos;
  end if;

  -- Esta carga nao cria categoria nem setor: os 21 e os 4 sao os que o banco ja
  -- tinha, e os preparos entraram em categoria existente.
  select count(*) into v_categorias
    from categorias where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  if v_categorias <> 21 then
    raise exception '0004: % categorias, esperado 21 (nenhuma categoria nova)', v_categorias;
  end if;

  select count(*) into v_setores
    from setores where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and ativo;
  if v_setores <> 4 then
    raise exception '0004: % setores ativos, esperado 4 (nenhum setor novo)', v_setores;
  end if;

  select coalesce(sum(i.total), 0) into v_agosto
    from contagem_itens i
    join contagens c on c.id = i.contagem_id
   where c.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and c.referencia = '2026-08-31';
  if abs(v_agosto - 78681.3573) > 0.01 then
    raise exception '0004: a contagem de agosto vale agora %, e tem de valer 78681.3573', v_agosto;
  end if;

  select coalesce(sum(i.total), 0) into v_outubro
    from contagem_itens i
    join contagens c on c.id = i.contagem_id
   where c.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and c.referencia = '2026-10-01';
  if abs(v_outubro - 71961.351) > 0.01 then
    raise exception '0004: a contagem de outubro vale agora %, e tem de valer 71961.351', v_outubro;
  end if;

  raise notice '0004 ok: % fichas, % itens, custo somado R$ %, catalogo com % produtos',
    v_fichas, v_itens, round(v_custo, 4), v_produtos;
end $$;

commit;
