-- ============================================================================
-- Multiverso · seed 0003 · contagem de OUTUBRO/2026 · Bar do Zeca — Norte Shopping
-- ----------------------------------------------------------------------------
-- ARQUIVO GERADO por scripts/gerar-seed-outubro.mjs. Nao edite a mao: corrija o
-- JSON de origem ou o gerador e rode `node scripts/gerar-seed-outubro.mjs`.
--
-- Origem      : CONTAGEM_BDZ_NORTE_SHOPPING_01_OUTUBRO_2026.xlsx
--               extraida e conferida em dados/contagem-bar-do-zeca-2026-10.json
-- Cliente     : Bar do Zeca — Norte Shopping
-- Competencia : 2026-10 — contagem mensal com referencia 2026-10-01
-- Total da contagem: 71961.3510   (planilha, Geral!B93: 71961.3511)
--
-- PRESSUPOE a 0001 (catalogo) e a 0002 (os 4 setores de hoje) ja aplicadas:
-- esta carga NAO cria restaurante, setor nem categoria. As 21 categorias e os
-- 4 setores ativos continuam os mesmos; nenhuma categoria nova foi criada.
--
-- O que este arquivo faz:
--    11 produtos novos (e 11 vinculos produto x setor novos)
--    26 custos de vinculo atualizados para os precos de outubro
--       (25 subiram, 1 cairam; custo ZERO na planilha nao sobrescreve
--        custo real — zero e "linha nao precificada", nao "de graca")
--    26 produtos com custo_medio atualizado (custo do setor principal)
--     0 vinculos com custo_fixo recalculado
--   868 itens de contagem (342 com quantidade maior que zero)
--
-- O QUE ELE NAO FAZ
-- Nao encosta na contagem de agosto/2026. Ela esta fechada, vale
-- 78681.3573 e e o estoque inicial do CMV — o bloco de verificacao do fim
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
-- Todos os ids sao UUIDv5 derivados do nome e todo insert tem `on conflict`
-- apoiado em chave primaria ou indice unico. Os updates de custo levam
-- `is distinct from` na clausula where: reaplicar nao reescreve linha que ja
-- esta no valor de outubro, e por isso custo_atualizado_em nao se mexe de novo.
--
-- Como aplicar: veja supabase/seed/README.md.
-- ============================================================================

begin;

-- @bloco:precondicoes
-- A 0003 edita um catalogo que ela nao criou. Se os setores ou as categorias
-- que ela vai usar nao estiverem la, os updates de custo casariam zero linhas e
-- a carga "passaria" sem ter feito nada. Melhor parar na cara.
do $$
declare
  v_faltando text;
begin
  if not exists (select 1 from restaurantes where id = 'b0a12eca-0000-4000-8000-000000000001') then
    raise exception '0003: o restaurante b0a12eca-0000-4000-8000-000000000001 nao existe — aplique a 0001 primeiro';
  end if;

  select string_agg(x.nome, ', ') into v_faltando
    from (values
      ('Bar', 'd08c7059-341f-5415-b00d-db72edd7ba7a'::uuid),
      ('Cozinha', '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid),
      ('Limpeza', '5b525c9c-4dbd-5825-987b-b41bf4cf8009'::uuid),
      ('Descartáveis', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915'::uuid)
    ) as x(nome, id)
   where not exists (select 1 from setores s
                      where s.id = x.id and s.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and s.ativo);
  if v_faltando is not null then
    raise exception '0003: setor ativo ausente (%) — aplique a 0002 primeiro', v_faltando;
  end if;

  select string_agg(x.nome, ', ') into v_faltando
    from (values
      ('APARAS', '9c99ff22-f45b-5d8a-8b68-ec4ea4fbcd87'::uuid),
      ('BEBIDAS ALCOÓLICAS', '2a5026f9-2f1a-5080-8127-6b2e90b9ae94'::uuid),
      ('BEBIDAS NÃO ALCOÓLICAS', '01c47b56-4321-5597-b73a-43efbc951b15'::uuid),
      ('CARNES', 'b60937b9-20ba-5cc3-9055-b2362fd781ad'::uuid),
      ('CONGELADOS', 'ea5eae2d-7e65-5f55-9fae-9de473c5ffc0'::uuid),
      ('DESCARTÁVEIS', '82bef36a-513d-59a8-91f2-780ed1f1ae38'::uuid),
      ('EMBUTIDOS', '16c07953-035f-5109-8de5-ddd72ed79b54'::uuid),
      ('FEIJOADA', 'e2f207b6-578f-5826-84f4-26b367a9ddf1'::uuid),
      ('HORTIFRUTI', '3a614052-826e-58a0-856b-bbfe118fe9f8'::uuid),
      ('LATICÍNIOS', 'c4bab142-35c9-5833-b378-808f3b4f5035'::uuid),
      ('MASSAS', '3290fd5a-65e0-5322-a040-9961052eb7f3'::uuid),
      ('MATERIAL DE LIMPEZA', '2c58bf88-d1a5-5462-98a0-b658fb5f1492'::uuid),
      ('MERCEARIA', '156b289f-4bb4-5914-8190-08695ef3e83c'::uuid),
      ('MOLHOS', '5d3fdd64-e6e6-56f1-91f6-7c4f96dbf811'::uuid),
      ('PEIXES E FRUTOS DO MAR', 'cd858e96-acbd-5202-b034-29678b4466c4'::uuid),
      ('PROCESSADOS', 'b778785a-3e46-5329-a237-ba003d8522a3'::uuid),
      ('PROTEÍNAS CLIENTE', 'a384c88a-08b3-516a-9336-b08527a69b48'::uuid),
      ('PROTEÍNAS FUNCIONÁRIO', '6092e2e5-88a9-5120-ac04-0caf7797bcf0'::uuid),
      ('SORVETES', 'b1bec079-cca8-5e3a-8560-afd4f6add349'::uuid),
      ('SUÍNOS', '93d69735-36bd-572d-88d7-5c014cd81a02'::uuid),
      ('TEMPEROS E AFINS', '9618a2f7-9060-53c6-bedb-7bd318fad75a'::uuid)
    ) as x(nome, id)
   where not exists (select 1 from categorias c
                      where c.id = x.id and c.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001');
  if v_faltando is not null then
    raise exception '0003: categoria ausente (%)', v_faltando;
  end if;
end $$;
-- @fim:precondicoes

-- Os 11 produtos que outubro trouxe e agosto nao tinha. Cada um entra numa
-- das 21 categorias que ja existem, e no setor em que essa categoria vive hoje:
--   · ALCAPARRAS — MERCEARIA / Cozinha — KG R$ 74.9 (Geral!H10)
--   · BARBECUE DE GOIABADA (KG) — MOLHOS / Cozinha — KG R$ 11.36 (Molhos!A3)
--   · CANELA EM PÓ — MERCEARIA / Cozinha — KG R$ 48 (Geral!H21)
--   · CUPIM — PROTEÍNAS CLIENTE / Cozinha — KG R$ 31.47 (Geral!A14)
--   · FARINHA DE KIBE — MERCEARIA / Cozinha — KG R$ 5.9 (Geral!H26)
--   · FEIJÃO CARIOCA — MERCEARIA / Cozinha — KG R$ 9.65 (Geral!H33)
--   · GRÃO DE BICO (KG) — MERCEARIA / Cozinha — KG R$ 13.8 (Geral!H24)
--   · LENTILHA — MERCEARIA / Cozinha — UND R$ 7.45 (Geral!H43)
--   · MOSTARDA ESCURA (3,100) — MERCEARIA / Cozinha — UND R$ 47.4 (Geral!H55)
--   · NIRÁ — HORTIFRUTI / Cozinha — UND R$ 42 (Hortifruti!A71)
--   · NOZ MOSCADA — TEMPEROS E AFINS / Cozinha — KG R$ 146 (Geral!O69)
--
-- custo_medio e unidade sao os da planilha de outubro, que e a unica fonte que
-- existe para eles. custo_atualizado_em ja nasce estampado: esse custo tem data.
-- @bloco:produtos_novos
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio, custo_atualizado_em) values
  ('91d1be2a-67ee-5bd6-8407-6baa72eaa5d7', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'ALCAPARRAS', 'KG', 74.9, '2026-10-01 23:59:00-03'::timestamptz),
  ('035e4add-c354-58e3-a0b8-f5de8bb8e0d7', 'b0a12eca-0000-4000-8000-000000000001', '5d3fdd64-e6e6-56f1-91f6-7c4f96dbf811', 'BARBECUE DE GOIABADA (KG)', 'KG', 11.36, '2026-10-01 23:59:00-03'::timestamptz),
  ('8920ea55-3eab-5152-9edd-28891b32101d', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'CANELA EM PÓ', 'KG', 48, '2026-10-01 23:59:00-03'::timestamptz),
  ('e9ea8342-5254-5c32-897b-7ca432c80b79', 'b0a12eca-0000-4000-8000-000000000001', 'a384c88a-08b3-516a-9336-b08527a69b48', 'CUPIM', 'KG', 31.47, '2026-10-01 23:59:00-03'::timestamptz),
  ('c7f0c817-62e9-5809-bc27-9f068af99220', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'FARINHA DE KIBE', 'KG', 5.9, '2026-10-01 23:59:00-03'::timestamptz),
  ('9959d999-3e4a-5dcf-9605-aec9bfe8b039', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'FEIJÃO CARIOCA', 'KG', 9.65, '2026-10-01 23:59:00-03'::timestamptz),
  ('9962b08b-0b13-5a2e-a13d-57167bc99df5', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'GRÃO DE BICO (KG)', 'KG', 13.8, '2026-10-01 23:59:00-03'::timestamptz),
  ('2488f153-b644-5276-8941-d533bd3f17c3', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'LENTILHA', 'UND', 7.45, '2026-10-01 23:59:00-03'::timestamptz),
  ('0650c4cc-231a-52aa-9a1c-e9340869d6b1', 'b0a12eca-0000-4000-8000-000000000001', '156b289f-4bb4-5914-8190-08695ef3e83c', 'MOSTARDA ESCURA (3,100)', 'UND', 47.4, '2026-10-01 23:59:00-03'::timestamptz),
  ('86f6cf42-8762-5530-aff5-f45c1ec67f71', 'b0a12eca-0000-4000-8000-000000000001', '3a614052-826e-58a0-856b-bbfe118fe9f8', 'NIRÁ', 'UND', 42, '2026-10-01 23:59:00-03'::timestamptz),
  ('d2d44215-6c00-55b4-ad13-51268eca6bac', 'b0a12eca-0000-4000-8000-000000000001', '9618a2f7-9060-53c6-bedb-7bd318fad75a', 'NOZ MOSCADA', 'KG', 146, '2026-10-01 23:59:00-03'::timestamptz)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, custo_medio = excluded.custo_medio,
  custo_atualizado_em = excluded.custo_atualizado_em, ativo = true;

-- @fim:produtos_novos

-- custo_fixo = false nos vinculos novos: o custo deles veio da planilha e e
-- preco de compra, logo deve acompanhar a proxima nota fiscal.
-- @bloco:vinculos_novos
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo, custo_atualizado_em) values
  ('91d1be2a-67ee-5bd6-8407-6baa72eaa5d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 74.9, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('035e4add-c354-58e3-a0b8-f5de8bb8e0d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 11.36, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('8920ea55-3eab-5152-9edd-28891b32101d', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 48, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('e9ea8342-5254-5c32-897b-7ca432c80b79', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 31.47, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('c7f0c817-62e9-5809-bc27-9f068af99220', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 5.9, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('9959d999-3e4a-5dcf-9605-aec9bfe8b039', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 9.65, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('9962b08b-0b13-5a2e-a13d-57167bc99df5', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 13.8, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('2488f153-b644-5276-8941-d533bd3f17c3', '19a7379f-949c-565a-b11d-16eaf91dab37', 'UND', 7.45, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('0650c4cc-231a-52aa-9a1c-e9340869d6b1', '19a7379f-949c-565a-b11d-16eaf91dab37', 'UND', 47.4, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('86f6cf42-8762-5530-aff5-f45c1ec67f71', '19a7379f-949c-565a-b11d-16eaf91dab37', 'UND', 42, 2, false, '2026-10-01 23:59:00-03'::timestamptz),
  ('d2d44215-6c00-55b4-ad13-51268eca6bac', '19a7379f-949c-565a-b11d-16eaf91dab37', 'KG', 146, 2, false, '2026-10-01 23:59:00-03'::timestamptz)
on conflict (produto_id, setor_id) do update set
  unidade = excluded.unidade, custo = excluded.custo, ordem = excluded.ordem,
  custo_fixo = excluded.custo_fixo,
  custo_atualizado_em = excluded.custo_atualizado_em, ativo = true;

-- @fim:vinculos_novos

-- ---------------------------------------------------------------------------
-- OS CUSTOS DO CADASTRO PASSAM A SER OS DE OUTUBRO
--
-- Decisao da cliente ("atualize os custos tambem"). Tres cuidados que estao na
-- clausula where e nao no comentario:
--
--   1. so entram na lista os 26 pares cujo custo de outubro e MAIOR QUE ZERO e
--      diferente do atual. Zero na planilha e "linha nao precificada" — em
--      agosto categorias inteiras (APARAS, PROTEINAS FUNCIONARIO, SORVETES)
--      fecharam em R$ 0,00, e deixar isso virar custo apagaria preco real;
--   2. `is distinct from` faz o update ser uma operacao de convergencia: na
--      segunda passada ele casa zero linhas, e custo_atualizado_em fica com a
--      data da vez em que o valor realmente mudou;
--   3. custo_fixo NAO entra no where. A flag quer dizer "custo calculado pela
--      casa, nao acompanha nota fiscal" — e a planilha de outubro E a planilha
--      da casa: as abas Porcionados, Massas e Molhos sao exatamente onde esses
--      custos proprios sao mantidos. Fonte legitima para os dois tipos.
--
-- A lista completa, com custo anterior, custo novo, diferenca e percentual,
-- esta na secao 8 de dados/RELATORIO-OUTUBRO.txt. As variacoes acima de +/-50%
-- e as 6 linhas em que a unidade de outubro difere da do cadastro estao
-- destacadas na secao 9, para a cliente revisar de olho aberto.
-- ---------------------------------------------------------------------------
-- @bloco:custos_vinculos
update produto_setores ps
   set custo = v.custo, custo_atualizado_em = '2026-10-01 23:59:00-03'::timestamptz
  from (values
    ('185a14a5-42fe-52ef-9e2d-98780c8a7317', '19a7379f-949c-565a-b11d-16eaf91dab37', 27.9),  -- ALECRIM (HORTIFRUTI) · Cozinha · KG · 35.5 -> 27.9 (-21.41%)
    ('4ea9c961-eee6-5d6d-ace3-48b350c52965', '19a7379f-949c-565a-b11d-16eaf91dab37', 30.5),  -- ALFACE AMERICANA · Cozinha · KG · 8.16 -> 30.5 (+273.77%)
    ('035df35a-3b86-5ba5-af0e-202305f58947', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.97),  -- ARROZ PARBOILIZADO · Cozinha · KG · 3.92 -> 4.97 (+26.79%)
    ('9cceda95-e9ea-50e3-9d0f-59a72056c823', '19a7379f-949c-565a-b11d-16eaf91dab37', 16.07),  -- BOBO DE CAMARÃO 400gr · Cozinha · KG · 14.06 -> 16.07 (+14.3%)
    ('f74461b4-33c2-5b32-aabe-b717a62f3b6d', '19a7379f-949c-565a-b11d-16eaf91dab37', 28.55),  -- BROCOLIS · Cozinha · UND · 11 -> 28.55 (+159.55%)
    ('cc83f357-7621-58d0-955d-d0e4991e92aa', '19a7379f-949c-565a-b11d-16eaf91dab37', 53.55),  -- BRÓCOLIS AMERICANO · Cozinha · UND · 19.9 -> 53.55 (+169.1%)
    ('338b1ed7-6519-5ecf-83fe-c173a8c39f9d', '19a7379f-949c-565a-b11d-16eaf91dab37', 17.31),  -- CALDO DE CARNE (MOLHOS) · Cozinha · KG · 3 -> 17.31 (+477%)
    ('0dcd3584-267a-52da-8a3b-8cfe42d399ab', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.51),  -- CALDO DE FEIJÃO · Cozinha · KG · 2.42 -> 2.51 (+3.72%)
    ('cf407163-7c99-5115-9e02-41be84b2204b', '19a7379f-949c-565a-b11d-16eaf91dab37', 7.99),  -- COXA E SOBRECOXA SEM OSSO · Cozinha · KG · 7.42 -> 7.99 (+7.68%)
    ('3637cd19-7bc4-5052-a827-e1f5bc88cfd3', '19a7379f-949c-565a-b11d-16eaf91dab37', 40.1),  -- COXÃO MOLE · Cozinha · KG · 36.59 -> 40.1 (+9.59%)
    ('87c945e4-cb26-5333-a93e-16d6a01e2a87', '19a7379f-949c-565a-b11d-16eaf91dab37', 42.9),  -- FILÉ DE TILÁPIA · Cozinha · KG · 41.5 -> 42.9 (+3.37%)
    ('34460fc8-97a7-55d0-b8a6-d8c258b0f5ea', '19a7379f-949c-565a-b11d-16eaf91dab37', 10.15),  -- FRANGO A PASSARINHO · Cozinha · UND · 6.43 -> 10.15 (+57.85%)
    ('02838b3e-7653-59c2-9112-0e72888864a4', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.48),  -- GELEIA DE PIMENTA 600GR · Cozinha · KG · 8.99 -> 9.48 (+5.45%)
    ('3c99acda-e717-5aa7-98fb-a0c4c38ff3ed', '19a7379f-949c-565a-b11d-16eaf91dab37', 5.74),  -- LEITE INTEGRAL (1lts) · Cozinha · UND · 5.7 -> 5.74 (+0.7%)
    ('8a6b0418-c3d8-57fe-9e71-80f30ce622d9', '19a7379f-949c-565a-b11d-16eaf91dab37', 14.1),  -- MASSA FUNCIONÁRIO (1kg) · Cozinha · KG · 5.68 -> 14.1 (+148.24%)
    ('b6397ef5-3551-5712-a3c2-dae5abb37007', '19a7379f-949c-565a-b11d-16eaf91dab37', 11.22),  -- MOLHO DE TOMATE E MANJERICÃO · Cozinha · KG · 7.4 -> 11.22 (+51.62%)
    ('9693737a-87e4-53d5-8b2e-cfdff05ad438', '19a7379f-949c-565a-b11d-16eaf91dab37', 59.67),  -- MORANGO · Cozinha · UND · 22.02 -> 59.67 (+170.98%)
    ('e738b469-24fd-586c-a989-120e304a0248', '19a7379f-949c-565a-b11d-16eaf91dab37', 34.5),  -- MUSSARELA COMUM · Cozinha · KG · 33.98 -> 34.5 (+1.53%)
    ('f8528782-daae-56e9-93a0-851850871bb7', '19a7379f-949c-565a-b11d-16eaf91dab37', 34.5),  -- MUSSARELA FATIADA · Cozinha · KG · 33.98 -> 34.5 (+1.53%)
    ('5e7f7ca3-cb86-5902-8cfb-dfe7da291294', '19a7379f-949c-565a-b11d-16eaf91dab37', 34.5),  -- MUSSARELA RALADA · Cozinha · KG · 33.98 -> 34.5 (+1.53%)
    ('9a7c57c7-bf9b-53e8-ad75-acbff6ddd2f3', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.02),  -- ORELHA DE PORCO · Cozinha · KG · 8.83 -> 9.02 (+2.15%)
    ('eb3736fb-5391-54c5-86c0-38465c9c5bfc', '19a7379f-949c-565a-b11d-16eaf91dab37', 58.96),  -- PARMESÃO COZINHA · Cozinha · KG · 45.5 -> 58.96 (+29.58%)
    ('75760a42-bafd-5208-a2c8-325aa0f85335', '19a7379f-949c-565a-b11d-16eaf91dab37', 14.41),  -- PEITO DE FRANGO · Cozinha · KG · 12.84 -> 14.41 (+12.23%)
    ('e09ff3a8-dc19-5224-a5e8-20d4303227b7', '19a7379f-949c-565a-b11d-16eaf91dab37', 44.5),  -- QUEIJO COALHO (2kg) · Cozinha · KG · 42 -> 44.5 (+5.95%)
    ('f196aceb-2d57-5912-80e0-1f8d2343bfb3', '19a7379f-949c-565a-b11d-16eaf91dab37', 58.96),  -- QUEIJO PARMESÃO · Cozinha · KG · 45.5 -> 58.96 (+29.58%)
    ('21ee4a25-6b27-5c10-8c3d-30d732da1c89', '19a7379f-949c-565a-b11d-16eaf91dab37', 13.23)  -- VINAGRETE · Cozinha · KG · 8.23 -> 13.23 (+60.75%)
  ) as v(produto_id, setor_id, custo)
 where ps.produto_id = v.produto_id::uuid
   and ps.setor_id = v.setor_id::uuid
   and ps.custo is distinct from v.custo;

-- @fim:custos_vinculos

-- produtos.custo_medio = custo do setor principal (o vinculo de menor ordem),
-- a mesma regra que a 0001 usa para escolher o custo de referencia do cadastro.
-- @bloco:custo_medio
update produtos p
   set custo_medio = v.custo_medio, custo_atualizado_em = '2026-10-01 23:59:00-03'::timestamptz
  from (values
    ('185a14a5-42fe-52ef-9e2d-98780c8a7317', 27.9),  -- ALECRIM (HORTIFRUTI) · setor principal Cozinha · 35.5 -> 27.9
    ('4ea9c961-eee6-5d6d-ace3-48b350c52965', 30.5),  -- ALFACE AMERICANA · setor principal Cozinha · 8.16 -> 30.5
    ('035df35a-3b86-5ba5-af0e-202305f58947', 4.97),  -- ARROZ PARBOILIZADO · setor principal Cozinha · 3.92 -> 4.97
    ('9cceda95-e9ea-50e3-9d0f-59a72056c823', 16.07),  -- BOBO DE CAMARÃO 400gr · setor principal Cozinha · 14.06 -> 16.07
    ('f74461b4-33c2-5b32-aabe-b717a62f3b6d', 28.55),  -- BROCOLIS · setor principal Cozinha · 11 -> 28.55
    ('cc83f357-7621-58d0-955d-d0e4991e92aa', 53.55),  -- BRÓCOLIS AMERICANO · setor principal Cozinha · 19.9 -> 53.55
    ('338b1ed7-6519-5ecf-83fe-c173a8c39f9d', 17.31),  -- CALDO DE CARNE (MOLHOS) · setor principal Cozinha · 3 -> 17.31
    ('0dcd3584-267a-52da-8a3b-8cfe42d399ab', 2.51),  -- CALDO DE FEIJÃO · setor principal Cozinha · 2.42 -> 2.51
    ('cf407163-7c99-5115-9e02-41be84b2204b', 7.99),  -- COXA E SOBRECOXA SEM OSSO · setor principal Cozinha · 7.42 -> 7.99
    ('3637cd19-7bc4-5052-a827-e1f5bc88cfd3', 40.1),  -- COXÃO MOLE · setor principal Cozinha · 36.59 -> 40.1
    ('87c945e4-cb26-5333-a93e-16d6a01e2a87', 42.9),  -- FILÉ DE TILÁPIA · setor principal Cozinha · 41.5 -> 42.9
    ('34460fc8-97a7-55d0-b8a6-d8c258b0f5ea', 10.15),  -- FRANGO A PASSARINHO · setor principal Cozinha · 6.43 -> 10.15
    ('02838b3e-7653-59c2-9112-0e72888864a4', 9.48),  -- GELEIA DE PIMENTA 600GR · setor principal Cozinha · 8.99 -> 9.48
    ('3c99acda-e717-5aa7-98fb-a0c4c38ff3ed', 5.74),  -- LEITE INTEGRAL (1lts) · setor principal Cozinha · 5.7 -> 5.74
    ('8a6b0418-c3d8-57fe-9e71-80f30ce622d9', 14.1),  -- MASSA FUNCIONÁRIO (1kg) · setor principal Cozinha · 5.68 -> 14.1
    ('b6397ef5-3551-5712-a3c2-dae5abb37007', 11.22),  -- MOLHO DE TOMATE E MANJERICÃO · setor principal Cozinha · 7.4 -> 11.22
    ('9693737a-87e4-53d5-8b2e-cfdff05ad438', 59.67),  -- MORANGO · setor principal Cozinha · 22.02 -> 59.67
    ('e738b469-24fd-586c-a989-120e304a0248', 34.5),  -- MUSSARELA COMUM · setor principal Cozinha · 33.98 -> 34.5
    ('f8528782-daae-56e9-93a0-851850871bb7', 34.5),  -- MUSSARELA FATIADA · setor principal Cozinha · 33.98 -> 34.5
    ('5e7f7ca3-cb86-5902-8cfb-dfe7da291294', 34.5),  -- MUSSARELA RALADA · setor principal Cozinha · 33.98 -> 34.5
    ('9a7c57c7-bf9b-53e8-ad75-acbff6ddd2f3', 9.02),  -- ORELHA DE PORCO · setor principal Cozinha · 8.83 -> 9.02
    ('eb3736fb-5391-54c5-86c0-38465c9c5bfc', 58.96),  -- PARMESÃO COZINHA · setor principal Cozinha · 45.5 -> 58.96
    ('75760a42-bafd-5208-a2c8-325aa0f85335', 14.41),  -- PEITO DE FRANGO · setor principal Cozinha · 12.84 -> 14.41
    ('e09ff3a8-dc19-5224-a5e8-20d4303227b7', 44.5),  -- QUEIJO COALHO (2kg) · setor principal Cozinha · 42 -> 44.5
    ('f196aceb-2d57-5912-80e0-1f8d2343bfb3', 58.96),  -- QUEIJO PARMESÃO · setor principal Cozinha · 45.5 -> 58.96
    ('21ee4a25-6b27-5c10-8c3d-30d732da1c89', 13.23)  -- VINAGRETE · setor principal Cozinha · 8.23 -> 13.23
  ) as v(id, custo_medio)
 where p.id = v.id::uuid
   and p.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
   and p.custo_medio is distinct from v.custo_medio;

-- @fim:custo_medio

-- custo_fixo: a regra de agosto e "true quando o custo do setor difere do
-- custo_medio de referencia do produto". Depois da 0002 cada produto tem UM
-- vinculo, entao a regra crua daria false para todos — e aplicar isso apagaria a
-- marca dos 12 vinculos que a 0002 marcou, que sao justamente os custos
-- proprios da casa (ALECRIM (HORTIFRUTI), FILE DE TILAPIA (PORCIONADO),
-- CALDO DE CARNE (MOLHOS), ...). Entao a regra liga a flag e nunca a desliga:
--
--     custo_fixo = regra_de_agosto OR ja_estava_marcado
--
-- Nesta carga isso da 0 vinculo(s) a mudar.
-- @bloco:custo_fixo
-- Nenhum vinculo muda de custo_fixo: os 12 ja marcados continuam marcados e
-- nenhum custo novo passou a divergir do custo_medio do proprio produto.
-- @fim:custo_fixo

-- @bloco:contagem
-- A contagem nasce (ou volta a ser) ABERTA de proposito: o trigger
-- t_contagem_itens_bloqueio recusa insert, update e delete de item em contagem
-- fechada. Numa reaplicacao do seed, reabrir aqui e o que permite regravar os
-- itens; o fechamento vem depois deles, no fim do arquivo.
insert into contagens (id, restaurante_id, referencia, tipo, status, titulo, observacao)
values (
  '29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b0a12eca-0000-4000-8000-000000000001', date '2026-10-01', 'mensal', 'aberta',
  'Contagem mensal · Outubro/2026 · fechamento de estoque',
  'Importada da planilha do cliente (competencia 2026-10). Os custos do cadastro foram atualizados com os precos desta planilha.'
)
on conflict (id) do update set
  referencia = excluded.referencia, tipo = excluded.tipo, titulo = excluded.titulo,
  observacao = excluded.observacao,
  status = 'aberta', fechada_em = null, fechado_por = null,
  total = 0, itens_contados = 0;

-- Sobra de uma carga anterior: item cujo par produto x setor saiu do cadastro.
-- Sem esta limpeza, uma reextracao menor da planilha deixaria linhas orfas
-- inflando o total — e o bloco de verificacao acusaria sem dizer o porque.
delete from contagem_itens i
 where i.contagem_id = '29b20768-dcdc-52e2-adc3-6e3ae17c5173'
   and not exists (
     select 1 from produto_setores ps
      where ps.produto_id = i.produto_id and ps.setor_id = i.setor_id);
-- @fim:contagem

-- contagem_itens.total e coluna gerada — round(quantidade * custo_unitario, 4)
-- — por isso nao se escreve total aqui: ele nasce do banco, e e justamente isso
-- que torna a verificacao do fim do arquivo uma conferencia de verdade.
--
-- custo_unitario e o custo DA PLANILHA DE OUTUBRO, linha por linha. E ele que
-- da valor a contagem e alimenta o CMV, e e o mesmo numero que acabou de ser
-- gravado no cadastro nos 26 pares que mudaram de preco.
-- @bloco:contagem_itens
insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario) values
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11c3c2ce-1adc-5429-92fa-5269e2ac6e32', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 152.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd917bc5b-2bda-58a8-91ea-a2746bed8455', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 19, 'UND', 43.93),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd7652807-853f-57d2-bf29-bcbe18a82c1a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 22.8, 'UND', 47),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4201b189-8416-5210-98f3-4d846d742fdb', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.8, 'UND', 17.35),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f2fa554c-c43c-56b6-8f37-c835715bf769', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 97.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c8312fa3-190c-51b3-b578-4ba69bf8438c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cbcb227f-1e10-5f42-9bdb-56d92230a637', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0fd5196b-0deb-5895-918b-929458be492e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 16),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ad598144-b7d6-53c0-857f-93b88bd6747f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 43.92),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'addab1e1-f266-5997-b81b-7d34779e2946', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 152.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7fff057c-93bc-5393-834e-000f1a304825', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 7.9067),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '57143922-9fb1-5873-889b-c7160e879247', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.3, 'UND', 39.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '60eb55d4-06ab-51b8-a593-641b1ea8c538', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 26.26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '64551324-d8c2-5e7d-b177-e816d0e69518', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a47e8fcd-a4eb-57f5-9c1a-2c068fbf0067', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 68.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1c87ff17-fe17-5f20-8ee6-7eaf84b36423', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 17.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1970db91-2eb8-5566-b5b0-341b2a320cd4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7.8, 'UND', 49.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11b39748-d27b-504d-9993-faa17dc220f7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ef699c7c-b984-5787-8f92-9516556be2c4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.9, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a33d4453-785f-51eb-81e0-cab7dd1ae721', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.5, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '973bb2b5-348e-5ee9-9daa-f98d958d9266', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.8, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd17456f9-09ea-587e-be0f-90df95e1e79c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 12.7, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7dad5118-53a9-55e3-a515-a96e123a02af', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 46.15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f691940f-4f1d-5581-9afc-9d81ea626698', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 41.1033),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'faf6fce2-334c-52e4-8b56-6aa1cb689d3a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 94.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'acd872ea-15b7-5a50-a914-3740da8c885c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 36.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f37b49ce-6adc-51c1-a2e2-5e56597fb57f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 38.48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f09515c0-b213-5a15-993c-456dc0f8ee55', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 65.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b8688f34-d5ad-5725-b2f3-65df812271dd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 28.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4d037b19-ce78-5c35-b6e3-a38c97c89f16', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 70.1, 'UND', 25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '39b974e7-291d-5942-bc3c-9a9574e7d2b9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.1, 'UND', 34.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c5f14e65-0107-5618-bfcf-f6301146275e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 62.61),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dbd4e7a2-adb5-5fd9-a8c3-4478a6bd714e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 31.61),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '47a6789f-e789-5794-9ce5-7caa3fa248c7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 81.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8c586f87-c8b3-5614-8e17-77297c37d2c2', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 81.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f6c8eb73-c6bd-57eb-ac03-03c5320e4aff', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 31),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1e4cba03-ae16-55d3-b0fe-f48a41f95386', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 22.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eaba4a17-3b82-53a3-bfcb-2112fed11153', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 54.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '334ac2cf-386f-51f1-a9c7-e00a402a1fe0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2, 'UND', 11.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cc7d6ddc-2c4d-5117-97e4-b310454bdb41', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 12.1, 'UND', 35),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '08efc961-05c2-5ff9-b633-993f6e20cb06', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 73.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'accfcb15-f019-54d0-8a9a-7fd3c86c3c93', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 13.06),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b55a4060-5a7a-5205-bd54-b3b2ec553109', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.5, 'UND', 20.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2d747b8e-e4dd-561f-b55c-daab5d4caca7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 34.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8ae8f590-e32b-5e98-a3dd-44bba09a014e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 80, 'UND', 5.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e3223713-1c4d-5d01-809e-fe1b30f278f2', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 6.16),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ea3d443f-becf-58b9-aefc-300d1857d4d4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 594, 'UND', 6.68),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '10764213-ff56-5399-b851-e5d219839896', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 4.1247),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3fcdd3ff-5266-505f-860f-0c03702494a6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 377, 'UND', 6.36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eba54626-041f-52ec-aefa-e36b3bd6e273', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3.29),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '36bab6af-7202-5350-943f-8ad0507e07f9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 4.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '014e0594-4782-5311-bfb2-5f1945142434', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 2.9358),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2c5b4bdb-49bb-598c-8359-82cb0fee80e7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '79f60dd0-bbdc-5264-befb-529d3200503a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 12, 'UND', 3.48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'afa17b48-3d54-54c0-bcf9-828fb52448b0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 58, 'UND', 6.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b804f757-93e8-5ef6-affe-618aefb76a93', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 6.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '793bd6d9-d16b-5886-a1e8-4fd9977194c8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 101, 'UND', 6.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0ada73a6-ae98-5cd8-8c35-2c1be6eded8f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 21, 'UND', 6.23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2650a573-e13f-5d30-92eb-c6e4270903e0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 47, 'UND', 6.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9b412a8c-f1da-5504-aacc-aec085193415', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 458, 'UND', 9.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8796701e-24a3-54ac-a537-402f8cb1d3b0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 119, 'UND', 7.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2a7eea71-762b-523e-8c56-c787ae144577', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 5.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd766995f-cf30-555f-9850-13c5bb7198c6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 115, 'UND', 9.17),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '35c2c9a5-285f-5d73-bfc7-b954551f0bb1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 6.34),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '17f09dbe-399c-5c33-9d43-5555da2679a7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 90, 'UND', 9.91),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e2007236-4bc3-5813-b5fc-d450a1d14ab3', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 50, 'LTS', 12.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2703c732-cee1-558f-9f2c-78233d9d690e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 13.73),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ea2361a3-4cdb-5e9f-9535-dbfc1953eb9f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 5, 'UND', 122.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '63acaf11-e981-53f5-9b64-2abebb01cfc5', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 26.81),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8c59574e-c5b3-5366-931a-d1e83c4a00dc', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 299.66),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a445ae5d-a4f7-57a4-a1c0-af920be7464c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 289.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4cd1c4f5-f7d5-5729-9967-39a002862dff', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.4, 'UND', 31.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3090875f-b63b-5b8e-9a0f-cdc0a16159c0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'LTS', 89.84),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3fd90004-1f03-5928-9f41-e69ae6a589ba', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 289.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '267aa832-f489-50ac-9ad9-9dd0931e6997', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'acb5761f-87f7-5433-8938-615f0631fdf6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.8, 'UND', 86.27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a77c4e24-51bc-59c0-877a-371eb68afaed', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 29, 'UND', 29.67),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1da5ab72-ae77-52ca-9f08-5218f802caff', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 4, 'UND', 26.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e8e6b450-dfea-5b6a-8f7d-fcbca6b0e2cc', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.43),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1ccbd278-5e9c-5084-a0ee-c79dd16ceb9a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.43),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11d10dc8-2a08-5b4e-9e42-821ebccc8b47', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 30.4021),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6703b39b-4fe3-5c71-8344-5ba3c9239d13', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 69.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9e761b73-a50f-5df9-a451-f5a6edadb8a1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 222),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '553b481f-691f-5c0f-ab77-c99083909e87', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7.3, 'UND', 56.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5848bb0c-8c92-56aa-8a41-4da9bb95f1e8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 113.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f0080756-24f7-5648-bf25-9db56a0dc25b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 110.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1fce997b-312d-5873-9d0a-b2869375c549', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 105.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a84a89df-7c6e-5fbb-a0d9-2187e542aa98', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 8.5, 'UND', 111),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8ed1b869-82cc-5963-b896-1cbffd3d06c6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 72.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '13a260d5-5063-544b-9cb3-025257ca0869', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 77.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4ba889db-fc88-5cca-9ed4-f866855277d8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 5, 'UND', 78.05),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '83172634-e5de-5f54-b3d0-e6e514582245', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 84.345),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4ad06ce8-51e8-5b9f-854a-88f3ca8d3ac4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 41.4813),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8cb4e392-ba60-59c3-9d1e-cd9674b50a09', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 161.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dc599936-54d3-5db8-be9d-d86e72b1cdfa', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 89.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '80353d0d-4ff0-587e-a878-2a6bedcb8f03', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 59.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e1d9efc0-f48f-5bf0-9bf2-c1d254c9841a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 225.47),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e6be999e-a4cf-5013-b503-2d8dfc279faa', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 70),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7a7e1099-f1b7-5d51-9a94-39b05e24c579', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 233),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2a482aaf-a38b-5251-9470-f6fa35e262d6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 176.23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3bdd7c34-1b21-58f1-acdf-1b127b657f1e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.8, 'UND', 138.26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5007f52a-0f8a-5201-80e8-ebe309c0e819', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 99.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '975cbcd3-7ee6-5956-bc07-098037cf9f3e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7.2, 'UND', 103.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ef913eff-0473-592c-8a6d-49e0d6bb4b79', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9cd77ce7-864a-5c4c-ac80-34651b1e4c2c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 5.5, 'UND', 103.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '375f0cfc-e6c6-5d8f-8eb8-a8ec2ae5b2af', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 163.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'af5da558-ce2c-5739-b6e0-785b30012876', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 68.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '954ad663-2cf8-5b10-ac8e-6e2c0d5bd10b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 19, 'UND', 59.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b38d0bda-9878-5ab6-bc51-0da311f8e0ec', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 73.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '817beb99-5017-5133-b9bb-4e9f51bf780e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 54.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f7bfbbf7-f437-5e57-bdf6-6bdf6f0467b8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 92),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eb485b9b-0f19-5210-a9d8-8a27dbc1ab1b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 79.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4d60c5d2-0356-5c98-8cdc-c929ca3c1c11', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 71.34),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fc18f811-0356-5a7d-bc84-a9609917458b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 189),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e965c999-ba6e-58a5-ad61-e8f37e3359f0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 119.54),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7e668b60-6c40-5506-8eef-0174f2de192b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 99.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8dd9cd92-7dc2-5739-afc5-9b35e064431e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.8, 'UND', 180),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e4ebbe4f-b2c5-5158-b450-bcb1f7046d4e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 136.53),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '729e3c62-49fe-5ef0-975b-ac62315f0c24', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 120.87),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f4425b1c-6b10-55ca-b33a-ee332182640c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 113.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1f94ae99-7bc2-55d7-845a-4f8e07f4594e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cc195de4-3e00-5e61-8bff-6ee91ac1a33f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.2, 'UND', 132.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fba9ea45-fad6-5e4b-97e9-278b1a048983', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2, 'UND', 43.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '35be9702-b781-5057-8855-11d200cac85d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 196),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fa63c14e-c7a7-52e2-b947-3e900ca07263', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 117.15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ac356dab-da17-5f76-8db0-a4c49a0dd662', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 139.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3eb032b0-acc4-526f-8b5f-fffc867bf83e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 34.57),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dd1a2101-2908-54ea-9651-d475098e2a71', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd7ae3625-3915-5223-bbad-16c86e11f3ca', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7b6fe75d-b03d-5f31-9d3b-bffcaaadfd1a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 132.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f53822cd-9937-5f75-817b-00abd1882c4d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4cafff96-a0d6-55e3-9972-7a39a3b55bb1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 140),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a014b34e-c728-50c4-bd42-7df8605ae32f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 126.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0a217baa-e857-54a4-ab7c-41b295903293', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.3, 'UND', 37.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b79bd26c-dd75-5e43-94b6-93b939f9f95f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.6, 'UND', 37.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9c6913be-fc5e-5319-b98e-5beece619ef7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7.2, 'UND', 46.07),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c9f8cac6-bab0-5e31-ad7c-ebb81ea1617f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 125),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f01222f0-3ce9-565f-bb50-eda3c1d902a8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 38.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f7f58cd5-1487-5b7b-8ca2-44945bdd2609', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 39.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6f9d0971-e288-598e-9a3f-70556d3499f4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 112.59),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f0453a8e-0a34-5270-b854-8b5c16febbe8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 407.91),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a9f6c032-a7be-5a19-be23-bfaaa7cd0d4a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 382.27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7e6868ef-4334-5d89-956f-2b6278053e21', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 32.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bca3e81d-1356-54c2-a861-b506a85b5a9e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 265),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '854723b0-a5c0-5181-9630-3eb71a15e470', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 90.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '30db2301-f5a4-51dd-8b24-b64bc3b4f2b3', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 90.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2800593c-5393-5b50-a73f-8e42e5d38529', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.4, 'UND', 99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5506b461-f548-530b-989c-be427e6abae8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.4, 'UND', 95.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '69a354e2-891c-50bd-aef1-3c9e2dfe1a59', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 249.37),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7cc72b6d-06de-5059-93a3-b10e1e82d39d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 195),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a37f3c8c-e636-5a22-b4ce-e340e67066c6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 88.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '68e4ec8e-bc4a-51a0-bd0c-affd46bcd709', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 73.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0a8b9e73-285b-5685-a5c5-08e327f3c14a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.8, 'UND', 26.81),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a3e98456-96c8-5edf-b010-d4424d26e1f6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.8, 'UND', 23.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f1885e96-d829-583d-a520-6c0cfb699a40', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.46),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '46e753df-2f38-5a51-b32e-9056987b82da', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7.5, 'UND', 62.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e0cb69c6-801c-5ff4-97e7-7d1171af8db7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 148.54),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2d1d5e76-e0d8-5f1e-a62c-9a51b77c88c6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 61.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '803ba150-a7ba-5b17-9fc1-0315a86dfec2', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 95.73),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '59c68973-9de1-5e42-a247-7e20cced4e99', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 72.04),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a7e40f57-e720-5570-ad1a-487de2d19d0a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 131.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9fdd042a-3343-55ea-9bb6-8ca646d777ff', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 101.32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '80978679-105e-5c4c-b0eb-73627fb68fbf', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 95.73),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ffaef6bc-e6aa-5e8f-bbc9-b6f8e38639e9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 116.47),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2012f1a4-9029-5a52-8ab8-78d5856a19eb', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 108.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e4604bea-841c-5d95-8597-38cac6c449fa', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 83.05),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '58ed6f86-b8a1-509a-8ae6-2a20110cd4ed', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 77.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f26c049c-c206-5127-8dd4-f5a104a5cfa1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 77.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '53ecf494-1c0a-5c8e-b289-38dfeb607aa0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 77.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '85093fba-36dd-5266-8a3b-641ed84460b4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 50.8, 'UND', 22.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c02d135b-055e-5d64-8372-84d9f9e6c0ed', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 31),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8d11e124-b2b6-5132-a9fe-4e2b33439729', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3e893d29-4db5-5864-b671-74d095fa57bf', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e7a3dd75-3e3b-5359-9ff2-ff016418fe00', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 115.24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '337baf78-4829-520d-8260-add1a26f807d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 54.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '05814715-2404-58a2-bb49-098e98207ca9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.1, 'UND', 132.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6e1ec221-0540-5b0b-8fec-e007a6a62dee', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 118.08),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '513abae5-d4fa-511b-ac40-875c45b1e74b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.7, 'UND', 103.92),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '267b3b03-e9be-51bd-a4bb-0c86e688b1a8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0.2, 'UND', 330.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4dbb2bff-a600-5416-a4dc-baea2bcf2414', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 1100),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e9ea7abb-ded7-5841-8dac-7f622668b339', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 136.46),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a1cb822f-4bb4-5d41-bd80-83bf9b7531f7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 199.01),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '630a49c9-3af2-5113-bf7f-8d2aa4bd46a9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 290.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '35ff77c7-a241-5dd5-9593-3cd90623e711', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 699.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6acdc949-3cec-599f-b1f7-5b26602077c7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 293.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4eac033e-b13e-522c-8466-90426274bb12', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 1020),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'aec137c5-740f-5882-92c8-9aea349b1c13', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 59.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1fa15862-e6d2-5d12-ad8f-73bf5469845d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 76.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'da751684-55a1-5e6a-afc0-e8cc647340d5', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.6, 'UND', 118.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0fe06ef7-86c1-5143-acbe-b85d8de30b53', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 129.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4dd0f67c-0d79-5260-ba97-c3056ba8d1cb', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.8, 'UND', 132.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ea59fa98-c226-5982-aa98-1a27758e5b13', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 122),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '160d2101-9645-59b9-a648-7687fb733eee', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 87.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7746f478-b3e3-59d1-8867-069a7171a7f8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.3, 'UND', 122.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b9ad33d2-fb11-5af5-987d-8a6bfc1dfbd9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 94.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5bb53289-6e5b-5905-8cd9-24c0df619996', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 1129.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '37768947-b7d0-520d-8b14-fcf75714e536', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 626.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd71345a0-5a8d-5733-a1d8-b14e171d6267', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.5, 'UND', 179.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '30191da8-f9a2-55ee-a5fd-4b2311db6f5b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '503455b6-1736-5712-87c2-15d7057ee1fd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 5.3, 'UND', 70.07)
on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario;

insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario) values
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e32baf83-71b3-5194-a223-5a325254e2f4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 99.46),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e345ecf2-ae80-5f66-b37c-314923c6632a', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 658.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e6866507-3fbb-5ed7-9560-d9306dd7ef2f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 139.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ab00bd58-2ce8-5be7-98c4-b6521b6be595', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 109),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1d7acac2-a2f0-5e80-8c50-790f9e8abb39', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 95.51),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '32f55ab7-a8b3-5121-a8a7-f26e013c7885', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 557),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a48c65b9-6ebf-5e9f-80ad-f27d801031fd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 442.44),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '50e0be7b-57e8-5c9a-8d5b-46031b6c3ab1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 152.33),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9f2ece98-6225-57a4-9efa-4a00f6be7d69', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 160.27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '47f2b581-2556-53b1-93bd-da8f0d343a84', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9ed716c9-7596-512f-848b-33695c003ef9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 9.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '71761253-d7c5-5340-89f6-7020e3f62e8b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 252, 'UND', 2.25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ec97a6ab-f312-50c6-8064-1c98132826e4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3.26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9250e922-2799-587f-84e8-cecae489f9f3', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 9.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c9ae0be8-b02c-5e60-8396-7ff744e2a9aa', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 224, 'UND', 2.25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8d5d3af4-bbe3-5792-8b0c-d80253714f3f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3.26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8cc5fd8a-6f16-5ee9-8e79-b78a396164b0', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 65, 'UND', 2.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2ca5fa6d-643f-57e4-95e1-44c0dcd4d6de', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 50, 'UND', 2.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd539294a-be7a-5b8e-ba0e-25f168a22db6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 5.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fd7e3639-647b-545b-a0d0-22bc7cc3297e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5d80bf8c-0836-54a8-be00-cbfd5545cb11', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 22, 'UND', 9.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8da8c119-659e-5fff-8f84-3f8abe6de7f9', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '85dca8e9-b524-5882-97a0-83d34d620c86', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 61, 'UND', 7.66),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b14078e0-c535-5e86-9254-40e20642fdc8', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 7, 'UND', 4.66),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd349e311-1c28-525b-a5d3-602d4ae802b3', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 88, 'UND', 7.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9dba175e-7996-51ef-b7b7-08049e721eef', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 5.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a42bd12a-1751-5e42-b26f-1f00bc3115bc', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3, 'UND', 7.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ffb3cf23-003d-51d1-a75c-60922dece2f4', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 5.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4ffe41ca-0b27-5dae-aa87-7d9b846eca88', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 7.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0bae7e84-5333-54f7-b4c6-fb1d1f91b780', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 6.73),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a30c7795-4879-531c-9b42-946c0ae542ab', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 45, 'UND', 7.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11fb856d-f850-55bb-adb6-1d66104535c1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 7.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0da58022-e257-5e2d-882a-f6031e53361d', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 31, 'UND', 3.17),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ade3f33e-7c41-5ee9-a547-ffcb52f1a681', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 37, 'UND', 3.17),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e5f04889-115b-53d8-b048-3709da9e6490', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1a5bf84c-d8de-5a98-8e96-dd02cca36e3f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b77cefb8-f793-5dfc-8cfc-a24b9966036e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0778e020-8f29-5b43-8d7c-fe8c80d29830', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 79, 'UND', 4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5f1e53b1-db9c-5707-8c37-d6d3a3f855f6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 43, 'UND', 4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd4b4a662-1cb8-59f2-8aa4-f95c7b8e6a24', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 17, 'UND', 3.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'de6d2786-632b-5236-b721-079f3f483bd1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 11, 'UND', 3.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '53ca0b12-5031-5ef1-97bd-b0b977a7fda7', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0d1927bb-2cec-50cb-ba9d-9e75c7e57e89', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.9, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '45b19891-1b39-5686-be5e-4be83ec38bfd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.3, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5cae0188-9581-5a1f-ba01-ff79e6008478', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.4, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '62c7ac13-a2da-5aa8-8baf-151430162ff3', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.5, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ed7a267d-151e-501c-84ae-4ce41024e970', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 42.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b4a9eb42-d3cd-51ab-b119-fa8fe6305953', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.1, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '25cf876a-4d43-5bd1-bddc-a264b0c6bb16', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e8bdfe3d-03f8-55e5-9cf8-46ddd0597bb6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.2, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '692c27d0-fab3-557f-802d-7e102a1aa06c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ec5379a4-460f-5234-9448-24c80d78b8e1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3.2, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3e9a8eb8-3fb9-5a8c-81a6-a2f1cfe037c5', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.2, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8334e510-3be5-5fbc-b650-87fcb4c3896e', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c272f941-773a-5736-a3a4-076e385b0b53', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 3, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9bf1b2a5-3e93-5aee-af46-e424735c6dfc', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '55829988-bd7c-5a4b-8dd0-8ec748af6201', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 4.4, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '953c20be-2075-569f-b305-546100818944', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd41b9681-c863-58ae-9b06-a9fb3d1b08c5', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2.8, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b28c3017-760e-528e-897e-36ba97c2776f', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 43.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '81ad1442-7032-5bff-8fa6-16a34cbcfb46', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 2, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '30e39aa4-c99d-509e-a816-ecdff693f2fd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.1, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cab2db7c-42a1-5493-a9b1-2843c9c7df7c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1.7, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0f1d8d9a-6928-5b2b-b1ed-8e0425784917', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4f25fb47-c26d-549a-ab97-d8b411d1e603', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '17789018-e09c-5721-89f8-7ab331a599b1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f86125ef-ae8f-554e-8745-b049b17f50f6', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd2c3ef17-d6eb-53ff-8180-d276c7cccb0b', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '628c3278-7911-58c0-8b64-984701b190fc', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '875290ab-7c19-5b93-81cd-74875ce9e445', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 1, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '682eadff-0712-521d-b248-65ef7fc030d1', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1bd5f5f5-8300-5dc4-90c3-492fd3e00b2c', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 67.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a2b607aa-a696-57ae-9d57-d8ebfad7b405', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 72, 'UND', 1.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd10e4dd7-c874-5d9a-aba8-1e93bae40540', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '93872b33-7ccb-5939-9d0b-016abff71374', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 7.68),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3dbca9d8-f698-5805-a823-a185dbcbedfd', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 2.08),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b93e219f-64db-57ab-b70f-feab6bbc9b81', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 0, 'UND', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2d9be38d-b257-55c1-b331-d703c08a51ff', 'd08c7059-341f-5415-b00d-db72edd7ba7a', 236, 'UND', 1.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cb6d26f0-afba-58b9-b4dc-86d8a3796d12', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 30.48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c894492c-b3a1-5043-8bb5-ff86b07daa0e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 21.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e31e5772-3250-5e50-bb28-55cee8c2ae04', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 34.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ff560cc1-4d67-5b35-b8a9-5fc27504ef44', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '73624c76-7e62-5dc3-aa16-4c404061690d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'de9c3d55-3491-52f4-a324-7c5df6887800', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f99fbfae-c9b9-5398-a0da-0a5200a70eb1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '18738b38-1806-569a-8453-a92456bc095b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5441fea5-5d98-5063-926b-72dd1db7fb43', '19a7379f-949c-565a-b11d-16eaf91dab37', 25, 'UND', 3.44),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6c025543-9f2e-5f20-b950-3a2f0a8198da', '19a7379f-949c-565a-b11d-16eaf91dab37', 25, 'UND', 4.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5e49ce01-9249-5532-85a6-c075321d73ae', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '206e9398-910f-5b4b-a66b-18f36b17ae92', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 10.23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '32ec5ddd-9d04-5c7d-972c-d7e0ca179e32', '19a7379f-949c-565a-b11d-16eaf91dab37', 7, 'UND', 23.24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '991e496a-9ec9-5803-b1cb-33fc3991cdbe', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.39),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '675f8580-1839-5fe8-a25a-a4f4d2a81593', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4164b73d-85dc-577a-ad8e-cc05dc6a7ef4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 53.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '73e1dd71-f9a2-59b8-b682-ce52086f21c0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '627b80c3-b132-5fab-bb6c-31359ef37cbd', '19a7379f-949c-565a-b11d-16eaf91dab37', 23, 'UND', 1.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4850bb48-cc14-5fdd-8e8b-a44496cfead1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fbce0eb6-dbec-51bb-8a6a-3f8ae36d7c6b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '316931f8-dc97-5074-9a4e-de7be4b00695', '19a7379f-949c-565a-b11d-16eaf91dab37', 16, 'UND', 12.09),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a101386-2d99-53e5-820c-86d9dddde451', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8afaf8dc-8653-5214-8f83-2e98de906cbe', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 6.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '799e4d66-679a-5da1-851f-1c0b2185e8e0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 12.84),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '85e8a21b-beaf-5e23-8ad0-6f0ffbbc73cc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cad7066c-2881-5eaf-bf75-3ebbd4cf1435', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 11.04),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a2d9a963-0806-52d7-a9d8-144500c30f4e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 4.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '61a77b44-b42c-534f-804e-6a3e20918502', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'aef5f41f-fa45-54f8-9095-01d9e587b694', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 4.04),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2cc850f3-79e9-5b7c-bd30-155c562b4af4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '83ff73e4-84d4-5d41-b3f8-7570677025f9', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'UND', 7.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '66a6c87f-d085-5d0e-9740-1504dc4b7ebf', '19a7379f-949c-565a-b11d-16eaf91dab37', 26, 'UND', 7.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c8435769-b616-5097-9cd1-9c497c449184', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '37cadaa5-dd8e-5408-980e-425830aefed4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eb11bc54-b92c-53f2-bed8-636c0e4aac0a', '19a7379f-949c-565a-b11d-16eaf91dab37', 29, 'UND', 2.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '34460fc8-97a7-55d0-b8a6-d8c258b0f5ea', '19a7379f-949c-565a-b11d-16eaf91dab37', 23, 'UND', 10.15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bb5f7e74-da8c-54c9-8a21-e9a863a1dfa8', '19a7379f-949c-565a-b11d-16eaf91dab37', 29, 'UND', 10.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c3122578-3c5a-57c7-addc-d1e615180844', '19a7379f-949c-565a-b11d-16eaf91dab37', 27, 'UND', 1.66),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '10d18b6d-c8a4-536c-b244-a2be9e671619', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'UND', 2.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '08ccc2b2-2688-5ffd-b8be-b019743f57a4', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'UND', 16.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8b6d1be1-7028-5e5f-a975-b7fadf5a1e68', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.67),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd6bd8566-3707-5920-b5e7-a465a3fabd8b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b47b0e62-06be-59b2-a06b-e247b400adb1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 11),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '97d5cce1-875d-54e3-8d34-c4ad80db62a0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1fad2733-3491-5d7d-8b03-1ca12ea54cfc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 48.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '464f05f9-e891-5ae0-8344-c8a83a0fb7f9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '126acda1-73ea-5461-b45d-07eb84a3373d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c0f7a03c-33fe-5e3e-982e-a21dedf121fd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9bbe4ce3-b790-5585-9664-c2e080a9ae2d', '19a7379f-949c-565a-b11d-16eaf91dab37', 20, 'UND', 4.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2c73115d-7f9c-5073-afc3-3737a9765565', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b9f72a13-1b44-52f5-9f92-e56b5fc4c4bf', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '118053d9-beec-5b7d-bbb9-9912ceadee2f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.69),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ef2d345a-5fcd-5596-915f-c6a04412646b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '78dd2de0-5a7d-5ee0-ad8f-2e1e2bb8e6e7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e2c3af6c-ec13-519d-8b2b-f87d2357dbf2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0f652f42-e5e5-590c-b71e-e3a0253cb996', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '67255e85-cbd0-596b-bc29-32fba92650a3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '98172d69-64aa-57f9-badb-e20f80575758', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6407064a-2009-5a84-ac7a-22e6af4fbb9a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 4.91),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eea8e426-e6b2-5b05-bc1e-26247b3eb143', '19a7379f-949c-565a-b11d-16eaf91dab37', 11.5, 'KG', 15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a80bb22b-561c-539b-9f3b-650514050b5c', '19a7379f-949c-565a-b11d-16eaf91dab37', 61.15, 'KG', 13.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0cb4f154-483e-517d-aef9-cb9e9bba1298', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.2, 'KG', 12.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f21d1728-12f2-5523-b6f5-71423c1876e3', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 10),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '28eaf0f8-6446-5097-9df3-0f6ef318f7c0', '19a7379f-949c-565a-b11d-16eaf91dab37', 19, 'UND', 10),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a4299651-9fe8-5adb-922d-35bc736eb833', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8764eeb1-2a7b-5f2e-ba48-e6de0507f4b0', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.15, 'KG', 25.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9182dd5a-1d04-54f5-b841-d1c76dd5a4f4', '19a7379f-949c-565a-b11d-16eaf91dab37', 11.3, 'KG', 16.87),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4d12aaae-640e-56ea-baf6-917fbdae1086', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 42.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bc3b7a54-5f4a-5778-9db9-6053104265fb', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '062ab54f-c0be-5ca7-aaf4-c64ebae99562', '19a7379f-949c-565a-b11d-16eaf91dab37', 13, 'KG', 19.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c3fd0baa-c00c-5678-87c3-ccfbff252eb7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f4d8ba8e-bdda-503d-9683-ee9bdf25f676', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.95, 'KG', 20.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '332fd94d-179f-504c-805b-5bec76487a39', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 14.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9ee0b42b-fdd2-58ff-abba-cfd9273e63f5', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 14.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f7a853f8-89a0-59d1-b8a0-f28ef01be9d8', '19a7379f-949c-565a-b11d-16eaf91dab37', 6.45, 'KG', 1.73),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dba26ff5-2762-5239-bfce-2dd53cf566cd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 25.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '772eb377-9330-5f9a-bf6d-ab6ae13c5bcc', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'KG', 29.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9d30f849-7e2e-50e5-a59f-77a3e36bb3d4', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.25, 'KG', 143.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fbe69e89-2ce3-518a-9b74-f93c50fdf98d', '19a7379f-949c-565a-b11d-16eaf91dab37', 7.7, 'KG', 34.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c9e40591-fbe0-5641-9dba-3328a1fad2ce', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.35, 'KG', 33.52),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6cd5b998-4fa3-572a-a9b0-67a352927d95', '19a7379f-949c-565a-b11d-16eaf91dab37', 6.85, 'KG', 9.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eb9dcea5-e35e-59aa-bc11-f36963955283', '19a7379f-949c-565a-b11d-16eaf91dab37', 17.1, 'KG', 3.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ec71c95f-16a5-542a-8927-6ce42513f688', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 16.87),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '15ce21fc-e32a-5335-a128-a827ffb40ad4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '37875d54-fc45-5287-afd1-f8da29141adc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 21.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '63561004-4ba7-537b-bcb8-92b434c0f133', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.9, 'KG', 29.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4cd2729b-98ce-5832-8cb6-ac4327abb47b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '016bf2d2-bb4f-5a8e-af34-a58dfe281839', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.8, 'KG', 58.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a8c733b4-2707-51ab-8ea7-b4deb3f28b4f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 49.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '19f33bd4-f067-5ce9-a218-b7ebda5cef98', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.05, 'KG', 9.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cad8aca0-d6e0-534d-8570-7ab98b900282', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.15, 'KG', 4.05),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6cea808f-ef24-587e-bc8b-099ec059e9d9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a4f2a7fa-5409-55a9-acb1-8d2388ec2a63', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 16.13),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0f2788b3-9359-595b-8650-b0015146d2b1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ccb92219-41b2-52fd-846b-ccef66c63813', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 10.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '53809bde-9a33-55b0-b1c8-33adc1969af7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 10.08),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '084d3f30-20ab-549c-9130-ef309684d083', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 89.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '185a14a5-42fe-52ef-9e2d-98780c8a7317', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.1, 'KG', 27.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4ea9c961-eee6-5d6d-ace3-48b350c52965', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.15, 'KG', 30.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '551f8d44-ec39-522f-9fd1-5399b9ecbb84', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 15.81),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0325f5fa-6b5d-577f-b70b-83953ae3c597', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 16.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e9c64167-d5b7-5505-b1c6-e8573533bd3d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a69083be-e47d-5939-9c67-92a252f45374', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 20.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fe36ddfc-bfab-5a91-946f-3d25b3ef571a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 13.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '97d7da95-c807-5887-b8b9-fa0d00823cb9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 17.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bf80ba70-09c9-5f08-8521-94662eb45c8a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.15, 'KG', 95.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eff006d9-7992-5b3c-afba-5bf77fb7bbea', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8284f20c-7c41-568f-900e-72cccc22b608', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.4, 'KG', 7.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '83691c27-607b-5ebd-8eb8-6be823ba6e28', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 6.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2963123f-d573-57ff-84cd-1863674bbd48', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 3.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '97c59bd2-6028-5f70-bf2d-9f2a96076277', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.7, 'KG', 5.13),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd0873ac2-16c4-5ac5-bd1b-72544d79a56d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.65),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6544fee5-442e-578d-9d66-41d791e95b4c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '29811a40-e359-5029-b06c-8cd44b86bce1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 6.36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f03de7cd-8a7f-59d7-a33e-a3ac19bf78ff', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 4.25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8a08b6ab-01b7-57da-b40d-9d1b38e639ce', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.35, 'KG', 5.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '238afae1-21f0-5b24-a231-605aec256a03', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.75, 'KG', 5.84),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f74461b4-33c2-5b32-aabe-b717a62f3b6d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.95, 'UND', 28.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cc83f357-7621-58d0-955d-d0e4991e92aa', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.7, 'UND', 53.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a437e0fe-1ec8-59f7-bad1-fc22e83e1903', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5582084f-c166-52a3-b15d-b310aa8409ed', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'BDJ', 15),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7e90b683-4849-5588-b938-8222f78f4810', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 4.46)
on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario;

insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario) values
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '20c7c8fc-085f-546e-b107-860b2cf58806', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8b11486b-197c-5811-8ab4-d7cafb2aac1e', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'KG', 7.37),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c033c738-c3af-5c68-b4b4-521315ae456e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3ab5d361-fb99-54c0-a09d-f5def2ddb5bb', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 16.87),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ba4b9abe-d7ce-5863-9e50-c245ceca069c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.3, 'KG', 7.21),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f727e270-4e39-59f5-b876-d64a71b8d788', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.4, 'KG', 7.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '787956c7-b269-5d9b-80e8-1c5ffc7ab753', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 8.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ee41c336-d69b-50cc-a07e-82e426cdfd2c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 25.24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '37123746-c49c-59c2-abbb-0a996ce2b103', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 9.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4b4c3a87-b5b5-5519-9e5d-ceae287cf093', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.25, 'UND', 11.14),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b3c5a397-2fd5-5420-9138-67334f3f34b0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '443e3658-dcda-5f04-8dc0-262cf7ab4fdb', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 37.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ee90626e-69fd-51f9-8384-be196bca9c58', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2d87d325-ad1d-5c03-9ac8-34f9e2013a2e', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.1, 'KG', 8.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '37603490-de56-5229-a0cc-9e3c21c0f753', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4ad13e22-af16-5dee-aaf6-3ba379ab04f2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.2, 'UND', 15.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b4a456db-b698-56b6-9235-138803e55a55', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 12.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '232d961e-b02b-5858-8031-4a37fb35a625', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 37.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'da514cb3-f2d4-50e7-b0c2-9781b0ef268b', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.15, 'KG', 8.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a974021f-b357-5845-a4e3-7fa4443cbf56', '19a7379f-949c-565a-b11d-16eaf91dab37', 20, 'KG', 2.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f26a4367-6f7d-55a2-aebb-2f7c15b318f3', '19a7379f-949c-565a-b11d-16eaf91dab37', 7.6, 'KG', 6.04),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2b872e07-6138-5b96-8eca-cf28477e8e18', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 13.26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '13edac0f-c071-59e4-8c16-8e07d7fe3f3c', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.458, 'KG', 9.13),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9d92ac9e-b340-5eec-93fa-bdbbaed77f1b', '19a7379f-949c-565a-b11d-16eaf91dab37', 18.35, 'KG', 7.11),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '31d0eae6-2371-5b9e-8d63-aa0c49c412d9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 39.91),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c6ff302c-4319-563e-9419-c27a8fbefdc7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.6, 'UND', 7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bcdcb808-aa5a-589e-b7c8-da9437be95d1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 45.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a9e65467-9d8d-5a16-8dcd-85d9739e7af4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 4.65),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b28c58ad-05df-5cb9-9898-dd7cd6fb72f4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 13.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b0c5af74-e920-5bbf-b80c-d398a358e494', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 10.59),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3ca39cd5-ccc2-56e8-a433-405c10ee3079', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 17.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dbabcaeb-c7da-546d-b148-7f37e891b979', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.85, 'UND', 26),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6c73fb3a-01a1-580f-9fe2-c5839a6683c4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 10),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9693737a-87e4-53d5-8b2e-cfdff05ad438', '19a7379f-949c-565a-b11d-16eaf91dab37', 5.7, 'UND', 59.67),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '86f6cf42-8762-5530-aff5-f45c1ec67f71', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '07620aa5-5d81-50c9-83a9-fee69dccf1dc', '19a7379f-949c-565a-b11d-16eaf91dab37', 185, 'UND', 0.67),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '09eba83b-a963-54b4-9741-efa17e30fa4c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '472d78f6-3b33-54d1-b964-47a8069110b0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 1.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7a67a82d-71e5-5541-8c96-9a9cdc322490', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8c8eeaa3-bfa9-5eee-a46a-155cf35ed53b', '19a7379f-949c-565a-b11d-16eaf91dab37', 5.2, 'KG', 8.77),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5a952fa5-57cc-5953-abfa-80f022e080b6', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 61.53),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '62a956ae-86ea-5d3b-9351-52a393096eca', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 31.56),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '87bdd654-3a6c-5c5e-b646-25eca574e8f6', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 73.53),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e1fca14d-fb7e-579a-a51a-749e8f502c7f', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.35, 'KG', 24.06),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '57d134e4-de61-5617-b512-f1b0dc2360cf', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 8.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd29b88cf-cdcd-5c34-aa04-d09b4ac8c68c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.55, 'KG', 24.06),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ad47d27a-c4dc-5df6-b398-0566fcdb8099', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 14.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '375715fc-4547-561e-ae28-9b5f24634c3c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 14.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f78c8a93-25de-50dd-8b21-f53d39176037', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 8.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b21c78c9-1d89-54a6-9861-e25d9447a4a4', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'UND', 4.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cac229a1-92e6-5cc7-b630-a4bd811e4f58', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f5503f51-b7d3-56b9-89d7-0703c1748c0c', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.1, 'KG', 10.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b52c0a35-54bb-57e8-a1c0-cd62d8639cdc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.3, 'UND', 27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0e626ef9-04d7-5238-8fa4-b3a0da68fea4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 24.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6ba8c8fc-5dcd-5ccd-a248-19bd37205bf1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bb8ae046-0b66-5246-9bd5-5d980f257529', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 7.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4886cdaa-34a3-5b85-a192-30ef3f02b8f8', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 2.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0afc83ff-d3ce-5a94-bf6d-04f0b35c8663', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 9.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '652510e5-afaa-5bfb-87e5-7e975524be88', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 9.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ceb97526-3fa5-54ac-97bd-793d2d8e153b', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.6, 'KG', 12.18),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '81ca200a-38c8-56d5-a7f8-86c8ad57e502', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.35, 'KG', 24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '078ee63b-dce9-5e57-8e83-ad02b8acfcdc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '35865ed4-7232-57a2-beb3-b2f9b338bbd2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 4.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8b97c2e0-4c27-5c8e-b9c1-dfa0c8ca2422', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.5, 'KG', 6.83),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8459cad7-c47f-59c6-8900-454cf67cfc81', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7995238b-e5cd-5816-bad5-63f61089ef5c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 40.16),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7fa72a53-1ca8-541e-ba0f-b39d7a6a4104', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.1, 'KG', 36.56),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0721bf22-53ee-552b-85b0-390e3815fbce', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.6, 'KG', 36.56),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '56fb2896-dea4-5f7a-9df1-36548806da25', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 17.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '734919ac-2b7b-5c1e-a268-98ea75f1e613', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 36.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '122ec623-4967-529f-80c9-d4ba3e430ec5', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3df43b6d-2488-5a9c-8f59-d69838924b77', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bae795c0-9fda-5a68-bf66-c9622f1f13c0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 68.21),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'da6dd909-0b8e-5f4e-ad1b-955a2831bce7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 20),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '441db26b-7e04-5243-a845-a397d7916fa5', '19a7379f-949c-565a-b11d-16eaf91dab37', 16, 'UND', 12.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1bd90314-8a1e-5ba9-a72c-f40ddb3602f7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 11.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9046a1ad-da9e-5e52-b711-92aa290ed56f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 5.69),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bfecb393-3f33-5d18-b074-953e034903bd', '19a7379f-949c-565a-b11d-16eaf91dab37', 9, 'UND', 19.63),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3c99acda-e717-5aa7-98fb-a0c4c38ff3ed', '19a7379f-949c-565a-b11d-16eaf91dab37', 23, 'UND', 5.74),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dc5376c6-4ae4-5e5f-ad26-afb0bcbf49dc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 32.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd6a87478-c420-5bb2-abeb-9925d63231d9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 28),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd45d81f9-46d4-5b6f-848c-dc5bf6257f4e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1aed6287-d32c-53e2-ad2f-263f0fddb5ac', '19a7379f-949c-565a-b11d-16eaf91dab37', 13, 'KG', 7.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cd594a6e-6dc2-5081-af61-c1d3d17c4f19', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 32.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e738b469-24fd-586c-a989-120e304a0248', '19a7379f-949c-565a-b11d-16eaf91dab37', 12.25, 'KG', 34.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f8528782-daae-56e9-93a0-851850871bb7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 34.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5e7f7ca3-cb86-5902-8cfb-dfe7da291294', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 34.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'eb3736fb-5391-54c5-86c0-38465c9c5bfc', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.35, 'KG', 58.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '97bd03f8-3939-5355-9ef4-fc245b2566c1', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.8, 'KG', 19.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7ebd26f4-b98c-5d35-b9c3-70c6dcdd80c0', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.85, 'KG', 36.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e09ff3a8-dc19-5224-a5e8-20d4303227b7', '19a7379f-949c-565a-b11d-16eaf91dab37', 6.35, 'KG', 44.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '562c2ede-19f0-5a9a-8a75-7aa4939cc533', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f196aceb-2d57-5912-80e0-1f8d2343bfb3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 58.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1636d5ec-8bc8-5507-9709-2035b5abc364', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 27.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3d740504-e9cb-5dd1-9f9f-6d1d2b09d7b9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 29.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1ab463b6-1fe3-5f5f-9b1e-5053eb7c4909', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 29.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '588f5c16-5699-53bc-ac4e-2cac35161706', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 45.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e90e7414-0597-52bf-8c0e-7ce2b768a029', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0a5e53f9-3822-5596-94f9-fe7f0e953cd7', '19a7379f-949c-565a-b11d-16eaf91dab37', 6.75, 'KG', 37.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '01d3ba5e-5ba4-50cc-acaa-dbffc49aa48a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f77e82c2-1389-546a-9bd8-25a28361fcf6', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 10.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bea277c6-1c63-5a3a-a2ee-a24fca7d96a2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '85ab2ef2-41c7-59e3-bbaf-5b150682047d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0b4f8315-7dad-5aa7-a895-b2982add46ba', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9347ab44-b503-55e4-b24d-edfcba9399af', '19a7379f-949c-565a-b11d-16eaf91dab37', 16, 'UND', 7.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '320c1564-e6b7-555e-97ad-9ea7afcf7496', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '289e4d28-93db-5731-bd3c-d905d56545ed', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'UND', 15.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '360305e8-a2e8-5204-bcca-e233b3ff5a2b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f76883c6-850f-53d0-bf90-b67c005c89ce', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '263ed8ac-15e2-5380-8efb-f86719632872', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e043fc7e-fecb-54b2-afd7-0fcc32156c0e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '58892a6c-0b53-571c-82b0-beb5ebd8cabd', '19a7379f-949c-565a-b11d-16eaf91dab37', 30, 'UND', 4.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '892642d8-e868-53cc-a0e6-17234c740e36', '19a7379f-949c-565a-b11d-16eaf91dab37', 23, 'UND', 6.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b889886c-889c-510b-a45c-12a5d3d43735', '19a7379f-949c-565a-b11d-16eaf91dab37', 31, 'UND', 7.43),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '55c84e75-6b3a-5e07-8dc5-95b8ccf72fef', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '88f4c784-c74b-568c-9258-48d0a11251ea', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a5e91946-b9b2-54b8-8195-67d198a9e8aa', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.61),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f5d47037-b383-5072-8b1a-ca42852a3e9b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '72b0b7b8-68cb-563e-bd4e-ad67184f9692', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8995712e-6559-563d-8055-3f797d02c9cb', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e104dcfb-4ccb-5439-a23d-58fa33dd5613', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 1.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dc4d2beb-b816-5e60-932e-3d1de0042c65', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'adf8a2be-be4f-5871-bf1e-8b5eac463e14', '19a7379f-949c-565a-b11d-16eaf91dab37', 15, 'UND', 7.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '28d68685-7ee3-5030-8711-883618f46fd9', '19a7379f-949c-565a-b11d-16eaf91dab37', 13, 'KG', 0.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '64c4f4dd-fdd2-54d9-b5dd-9fad29f1448a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.74),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ed86bebf-46f3-50a8-8cd9-125bcc2daa35', '19a7379f-949c-565a-b11d-16eaf91dab37', 60, 'KG', 0.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6b1c9e3b-bcd0-509a-b18f-69cf11185f96', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.91),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bc07ba37-29e5-5842-a1ac-69daca5aa4d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 1.65),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e2b6cc5d-23be-5abb-8b8c-e8b32338885f', '19a7379f-949c-565a-b11d-16eaf91dab37', 13, 'UND', 6.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f458a9ae-8e4f-5e3d-ab3e-6fb9e3488a60', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a50522b-561c-5a38-aed0-4a5066a80c84', '19a7379f-949c-565a-b11d-16eaf91dab37', 20, 'KG', 2.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7c2ca24a-0213-5b87-945e-2f9e5edc35a3', '19a7379f-949c-565a-b11d-16eaf91dab37', 19, 'KG', 1.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '021ed011-dcc0-51d2-8690-cbe5e2d4fc55', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.74),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2db4856a-cc49-5b13-941a-7491197804fb', '19a7379f-949c-565a-b11d-16eaf91dab37', 16, 'KG', 3.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '572718b4-3a2e-56de-a426-9249ede82d06', '19a7379f-949c-565a-b11d-16eaf91dab37', 11, 'KG', 1.32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b5736345-6650-5b2e-9fbc-92d831d1d7b7', '19a7379f-949c-565a-b11d-16eaf91dab37', 24, 'KG', 1.37),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd738d7f2-0083-58b4-a2a1-da6ecd5de1cc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 1.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3dc7b9c1-e239-56fb-8fc7-5d27466c5fab', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0.78),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e171c771-3b01-5c32-842c-afc2e0495c83', '19a7379f-949c-565a-b11d-16eaf91dab37', 10, 'KG', 1.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '697e2fa6-ce32-5ad1-a43a-f7d3d4bdab27', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 26.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c5e9625b-38e9-58d6-8b18-3277b4231d82', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 25.32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e6554625-17da-5695-9eba-a20fad27e504', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0bd1ddee-76eb-56d5-8b80-443a4771a1a8', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6e394eaf-7e02-5a3e-870b-858290f19cbd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 28.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cefe0d8c-a661-5cd1-8ea3-3d21b2b4454b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '657ffb10-fb06-500d-a889-cb76f6a7de37', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 7.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '360fbe2e-504e-5da6-9d67-96ec25327bab', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'UND', 12.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fc44d66f-1d32-55f7-90be-14c2a8a4c6cf', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'CX', 74.05),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '91d1be2a-67ee-5bd6-8407-6baa72eaa5d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 74.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7b983825-9048-55c8-9fcd-1865c97642d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 20),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '035df35a-3b86-5ba5-af0e-202305f58947', '19a7379f-949c-565a-b11d-16eaf91dab37', 40, 'KG', 4.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'efa7a06e-3b5b-507a-ba1d-66e1e6a541e9', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'UND', 12.28),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a3844a60-085f-5d6d-8846-9382f4ca12ed', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 197.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '30118cd3-5d82-51bd-a64d-f76eac39cd4f', '19a7379f-949c-565a-b11d-16eaf91dab37', 18, 'UND', 26.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '81cdf6f7-5642-5cd3-a8f4-c04709f2a8e3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'CX', 49.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b5990a75-54f9-5225-9c1a-5848dcfa78c9', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 56.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4f2b7b4f-ecec-5099-922a-14150ed6dca5', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 25.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11706c2a-7e9c-5695-ad0e-bb4d0160e247', '19a7379f-949c-565a-b11d-16eaf91dab37', 15, 'KG', 3.35),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6257e8fe-7c6b-557a-974e-89cd4d4ee90f', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'CX', 17.29),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '08656275-959c-55a1-be5c-407f9b2ab0e4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '547846ac-268d-553d-9bf8-2dcc72070fb6', '19a7379f-949c-565a-b11d-16eaf91dab37', 72, 'KG', 2.35),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '52ac9031-f97f-5a20-abaf-ac4d9e58bb37', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 57.11),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '61abb962-9480-5bd4-ae84-ad35440e96d1', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.3, 'KG', 9.59),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8920ea55-3eab-5152-9edd-28891b32101d', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.5, 'KG', 48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '52f2dec7-33a9-5a02-9382-d5026fded92c', '19a7379f-949c-565a-b11d-16eaf91dab37', 12, 'UND', 21.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '16fd8307-a9b9-52e1-8b44-6b877778ac5b', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 38.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9c8e662d-2812-5398-a544-8f88a79512d8', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'KG', 25.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ba8d6373-5dbc-5ec0-bd0c-b248d31ce0b6', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 23.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c7f0c817-62e9-5809-bc27-9f068af99220', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'KG', 5.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '699e4caa-5b1b-577e-961d-76bb265cd157', '19a7379f-949c-565a-b11d-16eaf91dab37', 16.481, 'KG', 5.37),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7b3445a3-1992-5d4b-9cb8-7e2cf34e8a1c', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'KG', 4.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '30ae6f25-20f9-521a-96b7-8030a6418baa', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'KG', 7.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '128475ff-39b7-56f3-ae73-1293beb9d365', '19a7379f-949c-565a-b11d-16eaf91dab37', 21, 'KG', 4.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e21600dd-1642-5435-9a87-f5f430a54ee7', '19a7379f-949c-565a-b11d-16eaf91dab37', 19, 'KG', 16.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9959d999-3e4a-5dcf-9605-aec9bfe8b039', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'KG', 9.65),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ad3b4ea5-d7e8-5e47-811d-74e92bd8aa31', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'KG', 6.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e01188c5-0315-5f04-b3a4-36b9905134b8', '19a7379f-949c-565a-b11d-16eaf91dab37', 22, 'KG', 5.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a5182d3a-318d-511f-ace5-1b24d5e30496', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'KG', 8.69),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4d226279-1aa2-52dd-8866-fec0c2c0d625', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 19.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '54b70cce-8431-52ab-a172-52cd09aba15d', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'KG', 3.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd8052992-5d1c-5d9a-8ae1-9a8f03ea74bc', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 26.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9962b08b-0b13-5a2e-a13d-57167bc99df5', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 13.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1ec2486f-ef4c-55cc-af4b-2f9c9c403054', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.5, 'KG', 40.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd4e43739-2482-5dc9-951a-348acc46a4f3', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 27.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f1e2e805-1415-55d7-abe2-c1b5a4342900', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'CX', 21.53),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2488f153-b644-5276-8941-d533bd3f17c3', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'UND', 7.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b2a44cca-0c4d-57ba-ae53-cf93b3e49dee', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'UND', 39.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '15259bdb-7316-5ae8-a5e9-c776bc63e68a', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'CX', 17),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8a6b0418-c3d8-57fe-9e71-80f30ce622d9', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.5, 'KG', 14.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '540ab675-cb42-5b10-a459-45e01c41e7a5', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 8.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '35d25fce-bc29-5a81-a747-8a032adbca9a', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'KG', 4.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '713cde8b-5ef0-5123-8dea-47583d3e63fc', '19a7379f-949c-565a-b11d-16eaf91dab37', 7, 'KG', 23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'da237c53-3725-548e-8ad8-d2a900006056', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'UND', 24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '94f7b844-272d-5fde-b03a-f2b61d736693', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'UND', 12.94),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c4af041a-fa60-5829-a47f-729fdc14b7f2', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'KG', 13.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2300caa6-241d-53f7-9225-53b638e678fe', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'LTS', 6.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd11f6aba-42c1-5545-a400-b239eddd9d24', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'LTS', 15.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ed93ee87-bc92-542f-bdcc-794b568ea53b', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.105, 'UND', 48.24),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0650c4cc-231a-52aa-9a1c-e9340869d6b1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 47.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd9d72ed0-f5b7-55c1-9b79-5c93129dff86', '19a7379f-949c-565a-b11d-16eaf91dab37', 11, 'UND', 5.48)
on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario;

insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario) values
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b4574100-9125-52d9-a210-519a8e87f3c5', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'CX', 19.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b0fc77f3-8ced-5bbb-af87-72e94514e30a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'CX', 38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f12bb982-9008-50ce-a2de-fc986fb7cdf6', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 7.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '58ff2997-0065-5607-bfc1-d7c78b67ca8e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '92eb49dd-a5f3-52c2-ad62-5803f1be0eca', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.406, 'KG', 1.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '29f31d79-5f02-55f5-84cc-1d0c33167cd0', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'CX', 13.4),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9bfae6d2-984c-53ea-9e59-fd45cd2920ba', '19a7379f-949c-565a-b11d-16eaf91dab37', 16, 'UND', 18.55),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '82aaa9dd-8535-5073-8ccc-432ee7e496fb', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 11),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f51f6256-5366-5589-bab6-4f9311fb55a0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 24.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5d64a6bf-42ed-5301-b118-2d26cf33276a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 1.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd429f1d8-70ed-522a-8d81-929cbcb7eccc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 1.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'abab8144-c047-5680-9b66-3535a6203812', '19a7379f-949c-565a-b11d-16eaf91dab37', 3, 'UND', 1.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1261e70c-3837-52b9-8174-f3d675ffb77a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fcb5fb82-dd45-5bd1-9b50-0522c6d94612', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'UND', 16.21),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dc8aad7b-9f27-5c35-8e8b-01d338cac0a9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a1f686f6-bf72-5ee0-8c90-ecbd05e5e7f5', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'UND', 17.27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c7a2520e-4112-5968-a2a0-5826c9c5d25f', '19a7379f-949c-565a-b11d-16eaf91dab37', 4, 'UND', 181.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c65d4802-dedd-5790-9dcc-8315a7835c82', '19a7379f-949c-565a-b11d-16eaf91dab37', 29, 'UND', 7.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd11f2374-bef0-5e32-852f-e293685e6dea', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'LTS', 7.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '035e4add-c354-58e3-a0b8-f5de8bb8e0d7', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.45, 'KG', 11.36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9cceda95-e9ea-50e3-9d0f-59a72056c823', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.45, 'KG', 16.07),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e3609169-b7ab-5bd1-a5ba-20e37a1c7ea6', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '338b1ed7-6519-5ecf-83fe-c173a8c39f9d', '19a7379f-949c-565a-b11d-16eaf91dab37', 11.6, 'KG', 17.31),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '66d88e6f-a06e-50c7-a512-ea5b4fd254f0', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0dcd3584-267a-52da-8a3b-8cfe42d399ab', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.8, 'KG', 2.51),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '11f58da2-4a94-5e29-b2d1-0d5d99965eb7', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6ed15c5f-02ce-5806-848a-24a50d63b662', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 2.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c0412945-c0bd-5f41-8b8b-48005bf0e2af', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c8074cae-d2b4-59a8-8e30-884b9337d846', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0b112601-f78e-535b-94e1-c0eaf66dbec3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bc714205-368d-50b0-95b5-b4567236c92c', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.5, 'KG', 11),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f0ad5689-9e19-5b4e-9f5d-e77c6e158d9e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 67.77),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '02838b3e-7653-59c2-9112-0e72888864a4', '19a7379f-949c-565a-b11d-16eaf91dab37', 3.95, 'KG', 9.48),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd1a7420b-8af5-5479-a585-a5f08cdd8e70', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.8, 'KG', 13.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c331828b-a671-5dc6-8b5d-64112d4a30df', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '81f4e7a5-58a9-53f2-8711-ee133aa92a66', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.1, 'KG', 40.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6d64d3ac-7055-5f70-99c5-5cee58f4caf8', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 14.06),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '884266e8-b6c5-5a31-b812-c5106fc01b63', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fa48e8b2-b4ca-5ceb-ba49-d7038d6e0f29', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e5f33e63-9dcd-508c-94fa-e8131e58bb6d', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'KG', 24.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b6397ef5-3551-5712-a3c2-dae5abb37007', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.38, 'KG', 11.22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'aaaa1083-a539-528a-adc7-705ed1a33167', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 3.67),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1486265b-4cbb-5188-9b61-33361e573b82', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.112, 'KG', 30.41),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a7e419a-2edc-5a4d-82ae-20477ed2969a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c48718f2-bc48-5736-921c-e0dd3f15d144', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 64),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '21ee4a25-6b27-5c10-8c3d-30d732da1c89', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.35, 'KG', 13.23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a3bf8e8-a927-5885-9724-94b9db35fad3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 82),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6873772e-7f83-5d2a-92a1-c86870897577', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 83.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4d9799c2-434b-54f3-89cc-75f955af54aa', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 49.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '78038db3-6f24-52c9-a98c-07c7edc596f4', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.1, 'KG', 68.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1bff2f2b-73a6-59bf-be93-83090aeec082', '19a7379f-949c-565a-b11d-16eaf91dab37', 6, 'UND', 8.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '609d8a42-a5f4-587d-89de-ae094ad27342', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd0936828-c75a-551e-940a-57838460c4cd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 68.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c60d6f04-c232-5342-99d1-545a0b72ed0a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fec26663-90ea-594e-8412-df3bc99e14f2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 20.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9055faf9-985d-5646-84ac-720f4f97e11b', '19a7379f-949c-565a-b11d-16eaf91dab37', 10, 'KG', 21.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '87c945e4-cb26-5333-a93e-16d6a01e2a87', '19a7379f-949c-565a-b11d-16eaf91dab37', 10, 'KG', 42.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9f2d8ebb-27ad-5a32-8755-8fa7378bd173', '19a7379f-949c-565a-b11d-16eaf91dab37', 33, 'UND', 6.34),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7367caea-7cab-5fee-b883-b75011490ec3', '19a7379f-949c-565a-b11d-16eaf91dab37', 12, 'UND', 8.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '62f9e8e5-02b4-5b76-b049-c33cb2934fbc', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8f4bef73-099c-50ac-95f2-329cb8fdf42e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 35.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8033ab25-9894-59c2-a3bc-983de76bde92', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.5, 'UND', 23.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c164ea53-0979-52d8-9b4f-0908f8864f6b', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ece3460a-6e05-5c6f-b492-8c7a653c7216', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '84d73beb-ed65-5f58-a798-aaa2e4e84265', '19a7379f-949c-565a-b11d-16eaf91dab37', 16.6, 'KG', 30.59),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6a99c88f-f5d5-582b-9d17-4d69dedab966', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 11.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9cceb979-513b-565f-b098-af3e05dc01b8', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd0660efa-280c-5d1e-826d-5b7c05f803bf', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 15.52),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1edb9df2-19b4-5274-8b1d-93cc29ea9364', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.95, 'KG', 69.66),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '26acf5be-5e27-50fe-a083-80ab55aa6afd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 13.64),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e88b064d-fffa-5b78-9741-960c6b55f661', '19a7379f-949c-565a-b11d-16eaf91dab37', 9.3, 'KG', 35.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '044030ab-cb67-5c2a-8620-8911ac67af48', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd12167a2-e880-5d8f-b7e8-71eb94b962b7', '19a7379f-949c-565a-b11d-16eaf91dab37', 5, 'KG', 47.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0a06cf3d-63a3-5d92-9953-d1809d5a06fa', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.2, 'KG', 13.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8c795a4b-5eff-5ac6-b537-e1953817e442', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.7, 'KG', 47.87),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ad6b5322-d656-5032-b6da-5b6f89ef1dde', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 20.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b5ab233d-bd70-5c56-8430-abf12c9436aa', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 17.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cf407163-7c99-5115-9e02-41be84b2204b', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.7, 'KG', 7.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3637cd19-7bc4-5052-a827-e1f5bc88cfd3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 40.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e9ea8342-5254-5c32-897b-7ca432c80b79', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 31.47),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '51ec9dc6-66b5-5a36-b21e-fe91c0e69825', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '74d54f4f-de30-5c0c-89ac-5b92bd794844', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7c44a329-4e0e-55ec-b8bb-ff6e65adb094', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fca85d6a-5294-5b6f-9360-43823f8bc0bd', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 31.79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'da34f141-0c21-520c-9682-a6466be4cdf8', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '26ba690b-656a-52d2-916c-10cd77a87e9f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 17.65),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9aa1451a-ac29-5fa5-9582-18947502c76e', '19a7379f-949c-565a-b11d-16eaf91dab37', 17.4, 'KG', 7.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f0780fdf-b2d0-5f9f-a0f3-48f1b92bd3a9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 26.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9a7c57c7-bf9b-53e8-ad75-acbff6ddd2f3', '19a7379f-949c-565a-b11d-16eaf91dab37', 5.25, 'KG', 9.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '75760a42-bafd-5208-a2c8-325aa0f85335', '19a7379f-949c-565a-b11d-16eaf91dab37', 17, 'KG', 14.41),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8124044f-2471-5b0b-a07a-58bfa1d8dc6f', '19a7379f-949c-565a-b11d-16eaf91dab37', 8.45, 'KG', 13.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '74c98cf2-f61c-5610-8b7e-64c3735bbe6b', '19a7379f-949c-565a-b11d-16eaf91dab37', 6.835, 'KG', 9.7),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a9f05218-cf42-584a-a833-b0b28b685cd5', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 16.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4e7ff65f-af82-5a2e-a6af-4d8ed9329f92', '19a7379f-949c-565a-b11d-16eaf91dab37', 11.7, 'KG', 17.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '67983e5c-64cd-512e-9ca9-29699043ca82', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '81a32ea0-edf9-566a-a42e-e52f17819b62', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 9.28),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '57c49133-f6e2-54a8-afd6-4e9e3792dc6f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'LTS', 17),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '50dacfef-a9c8-5493-b0bd-2536f7d62196', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'LTS', 14.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '61827d45-4643-5a77-a148-f39a32205368', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 25.75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '22a1118c-eeb5-50ad-a260-405f05d4674e', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 21.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd996e6d9-e4c4-5732-9ac2-827efee252db', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2c3a12f8-e737-55a3-97b6-1111758fc1a1', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 27.36),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7939af82-6351-5c11-a527-a6067f213e9f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 24.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '89504fb1-b8b8-5ca6-8607-5057b2ad6d64', '19a7379f-949c-565a-b11d-16eaf91dab37', 26, 'UND', 3.93),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dbc3a738-33b8-56ce-80d7-557566833d93', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 29),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9116e0a4-128e-5480-8660-1e3e874be0c4', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 18.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0fdf4499-17ee-5f19-ab28-160aad462366', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd5a84a95-bc27-507f-a180-c3c9934bbc84', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 5.41),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd5b9430b-48d5-558c-a132-f35f872e2cac', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.82),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1af83be9-5b70-544d-a1b0-2ee61b96f320', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '817857d4-704d-5567-9dc0-86b3ea47ec42', '19a7379f-949c-565a-b11d-16eaf91dab37', 37, 'UND', 9.27),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8a7400e3-1979-56da-8d9b-53c0033b5cd9', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 27.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b6c71f2a-175c-56bd-bb07-9588860a509b', '19a7379f-949c-565a-b11d-16eaf91dab37', 4.71, 'KG', 45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3da79ae8-f1b6-551f-a969-86d0d8005be3', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 90),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd073db42-b33b-5065-900e-7fc67a595048', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 19.95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a8ab0254-97c9-588f-a25e-54ae3bdc326a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.454, 'KG', 65.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'daa065e6-66b4-544f-bfc6-99ef825dfcd1', '19a7379f-949c-565a-b11d-16eaf91dab37', 1, 'KG', 89.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '77355497-ddc9-5b8d-bdfa-664f438d43fb', '19a7379f-949c-565a-b11d-16eaf91dab37', 2, 'KG', 99.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '603c8887-8a5c-527c-bcf8-d29e7a84b038', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 13),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '97c4697c-ec8f-53ac-93f0-ab08d704da0a', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.253, 'KG', 20),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6f5a083d-71b5-5e5f-ad69-64bd049b8040', '19a7379f-949c-565a-b11d-16eaf91dab37', 2.532, 'KG', 22),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '29a39b82-2b8f-5151-a073-9475beb71aa2', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 21),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2fb9019d-93b9-53fe-bfff-e5a33edaa250', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '06e66558-23e7-5ad2-bc83-ab611ebc7d46', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.5, 'KG', 62),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'adaeca5b-0ec9-5e2c-8f0e-f5528d8f0796', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.593, 'KG', 35),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7ec6b740-bdb5-5d22-9871-592cae2a19cf', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 7.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd2d44215-6c00-55b4-ad13-51268eca6bac', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.204, 'KG', 146),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '20ce900f-c7cb-51b3-a4a2-75a0c7495111', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.137, 'KG', 50),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '95bc6af3-1459-5c83-85f9-b3c1ec6fcd91', '19a7379f-949c-565a-b11d-16eaf91dab37', 0.185, 'KG', 30),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4b36f0af-30ac-5faf-97b7-b69a8edeab1f', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 40.16),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '15acebc3-f1d5-540f-bbb7-8309f0eb8494', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.613, 'KG', 79),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0672e18b-4a9b-5663-9acf-ade1d86af997', '19a7379f-949c-565a-b11d-16eaf91dab37', 0, 'KG', 75),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f4d6e460-4b11-5a9e-a94e-20d66d8df4ff', '19a7379f-949c-565a-b11d-16eaf91dab37', 1.507, 'KG', 19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9d967785-9d70-5c6f-8a22-a78e647b5f49', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 85.09),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '831fb6f9-9378-51e8-a4e6-09f088a68dee', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'UND', 34.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd654ce86-c9c0-5f83-b7e2-4d7577d4c2f6', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 4, 'UND', 66.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '22fb4d0d-59e2-59d6-963b-6a68b21dceb2', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 4, 'UND', 42.53),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e38cd864-f3f7-5c51-948b-7919771e4eff', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 3, 'CX', 98.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '25885590-973e-50a9-aecc-74393c95e6ba', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 14, 'PCT', 13.64),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c9d4a125-1d4e-5da0-b415-efe5c41cd5c4', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 9.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd551df35-6421-588e-a62c-36fd30b99f4b', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '55e15f46-af3f-5746-ae57-ad1b5ef0eecb', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'CX', 170.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '92304fd2-dea3-5658-a0a1-8c4900766da5', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 13.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5dd80e4a-e61a-5900-8253-6416aa286ead', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '834cdfde-e179-53a1-82bf-702ee87f9de8', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'PCT', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '067d20da-3c27-585c-b59e-2278af6e88fa', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.605139),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2b605627-c891-5e8b-bc03-a86fa81a7cc2', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 162),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '438d2982-cfc9-5716-955c-6e81dc3d2b1c', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 75.31),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '07a716e0-20a5-5dd5-9ea3-b62d721ae2d5', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 7, 'PCT', 34.68),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b1aa3c74-a034-5199-b377-a67468e3026c', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.81),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '94d71358-0a4a-55c5-8678-d4a7afa3b772', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 167),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2e8e19ef-6f40-5ffb-99a1-1e960699306f', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'PCT', 5.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '279c1fd6-7dd6-5a5d-852a-c6422a969771', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 43.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '68d37266-1c68-526c-80ec-b41a6fcf8863', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 19),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '791931a3-641b-5ccd-b71e-6c532b449bde', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 70),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f549c978-00f3-5bfa-bfd8-6bf9d84ab835', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dee42ad9-b5e3-55c3-ab8d-69c3d3a981be', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '84e9f8f1-05fb-5ad4-b486-5e709249dad2', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'UND', 28.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '04bd8139-0bf0-53bc-aabe-73e571e64811', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 76.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7ed43751-adc8-5f98-99a9-9f5848cd61ac', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 4.23),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'aae64b26-de1c-5590-98f4-f119ec529275', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 110.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'fcec0353-b262-5f26-942f-5f1c612dee10', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1822e218-70f4-5c28-bcfc-137dd571a99b', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 2, 'CX', 108.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '79d94fdc-1688-5a74-b663-3a44b56042d6', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'PCT', 36.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1f47cb48-270f-5129-bb0a-e297f215990f', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 19, 'UND', 13.45),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '7523cbf6-a8b3-5999-9edf-68fc2dbd55f4', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 2, 'CX', 26.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bb3d3c4f-b283-566d-afc7-ba6623bf3ff8', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 29.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '58a02538-9aec-50bc-8270-b7997672b396', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'CX', 19.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b4aa29ad-c032-599c-bc97-2201d5444a0e', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'PCT', 18.49),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5296a963-4bf3-5fbd-ba32-a9f7b266dfc3', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 12, 'PCT', 5.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2f6ba815-1f44-590d-ba23-2bcc037c43e3', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 4, 'UND', 14.29),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '44d64c05-aeb9-5061-b0a6-7e3d183a77e8', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'UND', 49.56),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8b017a43-818a-56bf-980d-976134c45624', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 6, 'UND', 93.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd79e602c-c98d-59a2-899a-88dc71542f54', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'PCT', 93.71),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f9c6fc12-8faf-5da5-8256-303f9c7acbea', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c1eedea9-8648-5a49-a910-f15ec714df94', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 60),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0d1d8f40-7217-5f55-bc87-afe327015b7d', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.846),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '38250661-23f4-5380-8cad-92948900bd29', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0346ce55-760b-5164-a86b-67d268dcfff8', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 2, 'UND', 46.28),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b9f5d947-bb29-5a60-8dfd-7de142fdbc82', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.64),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a18ff229-ecf1-56fd-b7ec-b91289336d98', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 43.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '261d1870-6260-50af-a270-261ff27ac5d2', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 3, 'PCT', 21.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd725d6ce-9bf0-5dfa-b8d7-eeb2ab104d45', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.2538),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5daaec1c-866a-534a-b0ac-fcc52b58b92c', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.423),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a4c1f2da-9fb4-587d-b470-d8f8bf41ded1', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'FD', 295),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4c3ba689-14f5-510e-8147-ca6da3c81b1a', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'FD', 424),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '22722fbc-6914-5b6e-810f-677633b71347', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'UND', 424),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c2fc8bb5-eb6c-5483-8457-7805523cbb20', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0.85),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5c1ac00f-4745-5af4-8a8d-2677ac2adcce', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 870),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '881fce83-bb73-5378-bfc4-5cabb09c31e9', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'FD', 59.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '765508b6-eb28-5096-8981-007ce9802b64', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3f78b566-57bb-5865-ae45-beeae113fa12', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 1, 'PCT', 8.46),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bb3e7ceb-63bc-5ec1-ba4a-b04ee39a2c8c', '725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 2, 'PCT', 8.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e1a0a6fa-d520-589f-9a92-5ed6d1b6be81', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'UND', 397.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '99b331c7-b072-54bb-87ce-afe2f5d0a1df', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2, 'UND', 225.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f6d9d2e7-3167-5a53-bcf1-5afeda92a260', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 4, 'UND', 89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ffb1ef54-fc0c-5e2d-b1f6-80276af5ef3c', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 7.98),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a0c040a2-02e7-5734-af49-3db3b702b127', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 16.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0ef59acf-785c-5b34-b060-4b390698541b', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2, 'UND', 10.33),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'aa5a29e8-5b58-5cb8-a151-b8a41f5aaa5f', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 19.63)
on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario;

insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario) values
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2af8a044-91c7-5812-8180-e8c43960e982', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 16.57),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b3f25446-aaa1-5c8c-ac9c-0787791fb89d', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'LTS', 41),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e9a0d500-d37d-57ba-bc68-4598b34b10f4', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 31.86),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e3c7e07b-438f-5b2e-ae3a-3cbb9cf65371', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2, 'UND', 78.51),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4e2d753d-f91a-5d16-bb43-f22bb328ecc1', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 23.84),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'df6b9fb4-46e6-5852-83c4-00c8583e2450', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '39b6dd1d-0747-50bf-b165-2036798b4222', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 103),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '88c4e3f4-7cda-590a-a5e8-2cc674df4b48', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a24e2597-feef-5b57-8783-c0895186aba8', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 35.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '0a9d7b5a-b847-5037-8e34-2d095b7831b9', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'LTS', 20.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd5ad0271-7193-5322-aa84-e80a521a2801', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 204),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a6d4e30-bb73-5c9d-a4ca-5b5da792f3d1', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 14.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'de6ce560-538a-5bf6-8598-3ea094ff628b', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 2.12),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ad76b4db-9e76-5860-b1f7-71e508b4087b', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 2.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '562ae103-8d27-58dc-ac6a-6e79590f7c22', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 15, 'UND', 0.74),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f46c7e3f-78c4-5d83-b955-e55ce3fe48f3', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 10, 'UND', 1.93),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'bef2a6ee-5334-521a-9f41-fc32e381ae5f', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cd3b8831-8cdb-5f4d-8e11-f6cd2bf05394', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 397.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'dcebd96e-d708-55c9-81b0-988fd6e2b369', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2, 'UND', 95),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '012ded71-98e3-5bd7-a4ae-efbee752dc78', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'UND', 435.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '08206efe-0113-5787-be0d-56211387b788', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 688.96),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '22b14712-0340-5ab0-ad7b-570c5ee117c3', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 5, 'UND', 88.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f1632ffa-b868-5c0b-9f95-8a31d96810d4', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3e83785e-4386-5888-8b34-8b12cba56f23', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 12.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '1e544da5-af1c-5e0f-b6de-af1dfd0ab4f4', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '27591436-2d45-53df-99da-1b2286e80951', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 6.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a3e129df-dae2-5e4c-aac0-02aee0fc8455', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 18, 'UND', 5.56),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2fba2e63-90b2-546e-8394-abe79556f296', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 8.42),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '43b48607-b4ed-5689-8e90-cb400d9e6ed3', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 6, 'UND', 9.97),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4a27a029-1960-5988-9897-b909d6313588', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'CX', 20.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'cc050b8d-1097-5bf6-a171-37d6681bef89', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 9, 'UND', 3.02),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e3d3aaa6-9d59-5c44-bee8-e817f0e8b66d', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'CX', 150),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ca961251-a85e-5157-b05c-2c9998ac7b1e', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'CX', 244.89),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd93c358c-9132-5921-b9d4-a21a01c2a921', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 7.37),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '185cf18f-331b-5ffd-a9e7-b83c922b22b1', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'CX', 69),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '607c8fe2-77b6-5946-b741-51ceebf94073', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 5, 'CX', 173.88),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'd151e8a3-6418-5a51-a953-165cbeab727a', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'BDJ', 370),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6893b8af-1909-5563-a4e9-ae0b533e65f3', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'BDJ', 425),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e81c19ae-ee52-5e1a-aeb6-b7bead255c48', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b254d5a0-a889-50ba-8bab-65a11434072a', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 74.5),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4378cdbc-3e18-5065-a916-5521c8c4847e', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 239.76),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '5472d2a9-fd25-52b4-af8e-9cbfa7347334', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 150),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a7639c5c-268f-57c3-8949-72f9ab6cabea', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 39.32),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'c4f2906c-ac3e-5d3d-a785-4cd47190cc89', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'UND', 9.54),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3029a86b-cef3-5af4-b8e3-2d0611618ece', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 6.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3fc7aa0f-9123-5b43-a1de-ee39d8b0f801', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'LTS', 17.8),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8663e718-09d3-5fc3-a9d8-1707b54e84b6', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 33.62),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3821d3bb-a005-50a0-8c7e-794189bfdbb3', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0.333, 'CX', 289.38),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '307d9e28-e9f0-585c-b66c-11bb78065420', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2.5, 'CX', 339.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '196cb0b9-ea45-58b4-b60a-9689b8fff359', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'KG', 24.62),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '60756294-2a4d-5ebc-8b4c-7341814ecd4d', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'FD', 67.6),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'b874510d-d5fd-55dc-a47c-fde1769cb6b9', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 1, 'FD', 118.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4b0676d3-1fd4-5808-90ec-3f0ceeff73e9', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 2, 'UND', 60.1),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '2ebbb1f4-acc3-554e-8c5b-5bbbc6388f8e', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0.613),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '4c81fc2e-e9b6-5e4d-a526-2a6dc8064345', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 0),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3a2036e6-a2c4-5adc-8f8d-c9c5e74bf823', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 1.2896),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '3d2ed119-4bc3-5390-84e9-3e45a9857c48', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'FD', 24.25),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '825c2df2-a6f4-5a1f-b89a-2505d4855542', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 48.72),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '9d877b50-9be7-57ed-a4e3-1215a972fac5', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 691.2),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'ffbf7809-a754-575b-9767-ab3665407ff5', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 4.05),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '552c0982-cb6b-51df-a6fc-fde49e33382a', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 41.29),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'a4c576bd-0882-5cb8-9037-1b4ed735519a', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 74.3),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '8a1924b5-15fb-5c72-8f7f-50aab52cd557', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 1.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'f35ed8dd-dc54-5ca7-9047-3df4a29b4f86', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 23, 'LTS', 7.58),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '359c55a9-28f2-5dde-872c-6cf418337e55', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'LTS', 7.99),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '6581014c-3cc1-5e1c-bcb8-db8acae8039c', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 70),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', 'e83bfcd4-95b4-5376-8b7b-becdef906769', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 17.9),
  ('29b20768-dcdc-52e2-adc3-6e3ae17c5173', '36678142-342a-5cf0-93c9-935b3fc7ad05', '5b525c9c-4dbd-5825-987b-b41bf4cf8009', 0, 'UND', 25.16)
on conflict (contagem_id, produto_id, setor_id, estoque_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario;

-- @fim:contagem_itens

-- @bloco:fechamento
-- Fecha SOMANDO o banco, nunca repetindo o numero da planilha: se o que entrou
-- nos itens nao der 71961.3510, a verificacao abaixo derruba a transacao.
-- A data de fechamento e a da contagem, e nao now(), para o historico do
-- modulo 2.2 e o CMV lerem outubro como outubro.
update contagens c
   set status = 'fechada',
       fechada_em = '2026-10-01 23:59:00-03'::timestamptz,
       total = (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id),
       itens_contados = (select count(*) from contagem_itens i
                          where i.contagem_id = c.id and i.quantidade > 0)
 where c.id = '29b20768-dcdc-52e2-adc3-6e3ae17c5173';
-- @fim:fechamento

-- @bloco:verificacao
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
   where i.contagem_id = '29b20768-dcdc-52e2-adc3-6e3ae17c5173';

  select count(*) into v_produtos   from produtos   where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  select count(*) into v_categorias from categorias where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  select count(*) into v_setores    from setores    where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and ativo;
  select count(*) into v_vinculos
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
   where p.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  select status into v_status from contagens where id = '29b20768-dcdc-52e2-adc3-6e3ae17c5173';

  -- Tolerancia de um centavo: a planilha arredonda a exibicao e o banco
  -- arredonda cada linha em 4 casas. Diferenca maior que isso e erro de dado,
  -- nao de arredondamento.
  if abs(v_total - 71961.3510) > 0.01 then
    raise exception '0003: total da contagem de outubro e %, esperado 71961.3510 (diferenca de %)',
      v_total, abs(v_total - 71961.3510);
  end if;

  if v_itens <> 868 then
    raise exception '0003: % itens na contagem de outubro, esperado 868', v_itens;
  end if;

  -- 879 = os 868 produtos que a 0001/0002 deixaram + os 11 de outubro.
  if v_produtos <> 879 then
    raise exception '0003: % produtos cadastrados, esperado 879', v_produtos;
  end if;

  if v_vinculos <> 879 then
    raise exception '0003: % vinculos produto x setor, esperado 879', v_vinculos;
  end if;

  if v_categorias <> 21 then
    raise exception '0003: % categorias, esperado 21 (nenhuma categoria nova foi criada)', v_categorias;
  end if;

  if v_setores <> 4 then
    raise exception '0003: % setores ativos, esperado 4', v_setores;
  end if;

  if v_status is distinct from 'fechada' then
    raise exception '0003: a contagem de 2026-10-01 ficou com status %, esperado fechada', v_status;
  end if;

  -- Os custos: os 26 pares da lista tem de existir e tem de estar valendo o
  -- preco de outubro. Um id errado faria o update casar zero linhas e a carga
  -- "passar" sem ter atualizado nada — isto e o que impede esse silencio.
  select count(*), count(*) filter (where ps.custo = x.custo)
    into v_alvos, v_aplicados
    from (values
      ('185a14a5-42fe-52ef-9e2d-98780c8a7317'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 27.9::numeric),
      ('4ea9c961-eee6-5d6d-ace3-48b350c52965'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 30.5::numeric),
      ('035df35a-3b86-5ba5-af0e-202305f58947'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 4.97::numeric),
      ('9cceda95-e9ea-50e3-9d0f-59a72056c823'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 16.07::numeric),
      ('f74461b4-33c2-5b32-aabe-b717a62f3b6d'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 28.55::numeric),
      ('cc83f357-7621-58d0-955d-d0e4991e92aa'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 53.55::numeric),
      ('338b1ed7-6519-5ecf-83fe-c173a8c39f9d'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 17.31::numeric),
      ('0dcd3584-267a-52da-8a3b-8cfe42d399ab'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 2.51::numeric),
      ('cf407163-7c99-5115-9e02-41be84b2204b'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 7.99::numeric),
      ('3637cd19-7bc4-5052-a827-e1f5bc88cfd3'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 40.1::numeric),
      ('87c945e4-cb26-5333-a93e-16d6a01e2a87'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 42.9::numeric),
      ('34460fc8-97a7-55d0-b8a6-d8c258b0f5ea'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 10.15::numeric),
      ('02838b3e-7653-59c2-9112-0e72888864a4'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 9.48::numeric),
      ('3c99acda-e717-5aa7-98fb-a0c4c38ff3ed'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 5.74::numeric),
      ('8a6b0418-c3d8-57fe-9e71-80f30ce622d9'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 14.1::numeric),
      ('b6397ef5-3551-5712-a3c2-dae5abb37007'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 11.22::numeric),
      ('9693737a-87e4-53d5-8b2e-cfdff05ad438'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 59.67::numeric),
      ('e738b469-24fd-586c-a989-120e304a0248'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 34.5::numeric),
      ('f8528782-daae-56e9-93a0-851850871bb7'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 34.5::numeric),
      ('5e7f7ca3-cb86-5902-8cfb-dfe7da291294'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 34.5::numeric),
      ('9a7c57c7-bf9b-53e8-ad75-acbff6ddd2f3'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 9.02::numeric),
      ('eb3736fb-5391-54c5-86c0-38465c9c5bfc'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 58.96::numeric),
      ('75760a42-bafd-5208-a2c8-325aa0f85335'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 14.41::numeric),
      ('e09ff3a8-dc19-5224-a5e8-20d4303227b7'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 44.5::numeric),
      ('f196aceb-2d57-5912-80e0-1f8d2343bfb3'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 58.96::numeric),
      ('21ee4a25-6b27-5c10-8c3d-30d732da1c89'::uuid, '19a7379f-949c-565a-b11d-16eaf91dab37'::uuid, 13.23::numeric)
    ) as x(produto_id, setor_id, custo)
    join produto_setores ps
      on ps.produto_id = x.produto_id and ps.setor_id = x.setor_id;

  if v_alvos <> 26 then
    raise exception '0003: % dos 26 pares de custo existem em produto_setores', v_alvos;
  end if;
  if v_aplicados <> 26 then
    raise exception '0003: % dos 26 custos de outubro foram aplicados', v_aplicados;
  end if;

  -- Nenhum custo do cadastro pode ter virado zero por causa desta carga. A
  -- 0001 deixou 62 vinculos com custo zero (itens que a planilha nunca
  -- precificou); se este numero subir, algum zero da planilha de outubro passou
  -- por cima de preco real.
  select count(*) into v_zerados
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
   where p.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and ps.custo = 0;
  if v_zerados > 62 then
    raise exception '0003: % vinculos com custo zero, eram 62 antes da carga', v_zerados;
  end if;

  -- AGOSTO E INVARIANTE. Ela e o estoque inicial do CMV: se este numero se
  -- mover, a carga de outubro encostou onde nao devia.
  select total into v_total_agosto from contagens where id = '33401c88-15f6-595e-ba5f-6ff148a8fc6c';
  if v_total_agosto is null then
    raise exception '0003: a contagem de agosto/2026-08-31 desapareceu';
  end if;
  if abs(v_total_agosto - 78681.3573) > 0.01 then
    raise exception '0003: a contagem de agosto vale agora %, e tem de valer 78681.3573',
      v_total_agosto;
  end if;

  raise notice '0003 ok: % produtos, % vinculos, % itens de outubro, total %, agosto intacto em %',
    v_produtos, v_vinculos, v_itens, v_total, v_total_agosto;
end $$;
-- @fim:verificacao

commit;
