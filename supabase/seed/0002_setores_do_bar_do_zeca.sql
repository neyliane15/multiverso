-- ===========================================================================
-- Bar do Zeca · os setores passam a ser Bar, Cozinha, Limpeza, Descartáveis
--
-- GERADO por scripts/gerar-reestrutura.mjs — nao editar a mao.
--
-- O que este arquivo faz, e o que ele deliberadamente NAO faz:
--
--   faz    renomeia "Estoque Geral" para "Cozinha" (mesmo lugar, nome novo)
--          cria Limpeza e Descartaveis
--          move os vinculos dos setores que saem para o destino certo
--          desdobra 14 produtos que existiam em dois setores com custos
--          diferentes, para que nenhum custo se perca na juncao
--          arquiva Hortifruti, Massas e Panificacao, Molhos e Caldos, Porcionados
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
update setores set nome = 'Cozinha'
 where id = '19a7379f-949c-565a-b11d-16eaf91dab37' and restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';

-- 2 --------------------------------------------------------- as duas areas novas
-- Os ids sao UUIDv5 do nome, como no resto da carga: rodar de novo cai na
-- mesma linha em vez de criar um setor repetido.
insert into setores (id, restaurante_id, nome, cor, ordem) values
  ('5b525c9c-4dbd-5825-987b-b41bf4cf8009', 'b0a12eca-0000-4000-8000-000000000001', 'Limpeza', '#1c694d', 3),
  ('725e4111-5f1e-50b4-9ea7-c2c3e1eab915', 'b0a12eca-0000-4000-8000-000000000001', 'Descartáveis', '#325186', 4)
on conflict (id) do update set nome = excluded.nome, ordem = excluded.ordem, ativo = true;

-- 3 -------------------------------------------------------- a ordem das quatro
update setores set ordem = 1, cor = '#866732', ativo = true
 where id = 'd08c7059-341f-5415-b00d-db72edd7ba7a';
update setores set ordem = 2, cor = '#30551b', ativo = true
 where id = '19a7379f-949c-565a-b11d-16eaf91dab37';
update setores set ordem = 3, cor = '#1c694d', ativo = true
 where id = '5b525c9c-4dbd-5825-987b-b41bf4cf8009';
update setores set ordem = 4, cor = '#325186', ativo = true
 where id = '725e4111-5f1e-50b4-9ea7-c2c3e1eab915';

-- 4 ------------------------------------------------- os produtos que se desdobram
-- Cada um destes existia em dois setores com custo proprio em cada. Juntando
-- tudo em Cozinha, a chave (produto_id, setor_id) so admitiria um — e o custo
-- que a casa apurou seria o que se perderia. Viram produtos separados.

-- ALECRIM · Hortifruti KG 35.5
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('185a14a5-42fe-52ef-9e2d-98780c8a7317', 'b0a12eca-0000-4000-8000-000000000001', '3a614052-826e-58a0-856b-bbfe118fe9f8', 'ALECRIM (HORTIFRUTI)', 'KG', 35.5)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '185a14a5-42fe-52ef-9e2d-98780c8a7317', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '8a7400e3-1979-56da-8d9b-53c0033b5cd9' and ps.setor_id = '42970c23-cbe7-5ebf-b519-9a82e43226ba'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '8a7400e3-1979-56da-8d9b-53c0033b5cd9' and setor_id = '42970c23-cbe7-5ebf-b519-9a82e43226ba';

-- BACALHAU · Porcionados KG 83.2
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('6873772e-7f83-5d2a-92a1-c86870897577', 'b0a12eca-0000-4000-8000-000000000001', 'cd858e96-acbd-5202-b034-29678b4466c4', 'BACALHAU (PORCIONADO)', 'KG', 83.2)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '6873772e-7f83-5d2a-92a1-c86870897577', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '3a3bf8e8-a927-5885-9724-94b9db35fad3' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '3a3bf8e8-a927-5885-9724-94b9db35fad3' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- BACON · Porcionados KG 25.75
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('61827d45-4643-5a77-a148-f39a32205368', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'BACON (SUÍNOS)', 'KG', 25.75)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '61827d45-4643-5a77-a148-f39a32205368', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '8764eeb1-2a7b-5f2e-ba48-e6de0507f4b0' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '8764eeb1-2a7b-5f2e-ba48-e6de0507f4b0' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- BARRIGA SUÍNA · Porcionados KG 21.85
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('22a1118c-eeb5-50ad-a260-405f05d4674e', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'BARRIGA SUÍNA (SUÍNOS)', 'KG', 21.85)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '22a1118c-eeb5-50ad-a260-405f05d4674e', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = 'd0660efa-280c-5d1e-826d-5b7c05f803bf' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = 'd0660efa-280c-5d1e-826d-5b7c05f803bf' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- BATATA CALABRESA · Porcionados KG 0
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('d996e6d9-e4c4-5732-9ac2-827efee252db', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'BATATA CALABRESA (SUÍNOS)', 'KG', 0)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select 'd996e6d9-e4c4-5732-9ac2-827efee252db', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '6544fee5-442e-578d-9d66-41d791e95b4c' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '6544fee5-442e-578d-9d66-41d791e95b4c' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- CALDO DE CARNE · Molhos e Caldos KG 3
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('338b1ed7-6519-5ecf-83fe-c173a8c39f9d', 'b0a12eca-0000-4000-8000-000000000001', '5d3fdd64-e6e6-56f1-91f6-7c4f96dbf811', 'CALDO DE CARNE (MOLHOS)', 'KG', 3)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '338b1ed7-6519-5ecf-83fe-c173a8c39f9d', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '2f59adb3-0ee9-5c27-829a-3ed23e36ac14' and ps.setor_id = '4baad629-37bc-54a7-88eb-38c56420c36c'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '2f59adb3-0ee9-5c27-829a-3ed23e36ac14' and setor_id = '4baad629-37bc-54a7-88eb-38c56420c36c';

-- CONTRA FILÉ · Porcionados KG 11.04
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('cad7066c-2881-5eaf-bf75-3ebbd4cf1435', 'b0a12eca-0000-4000-8000-000000000001', 'b60937b9-20ba-5cc3-9055-b2362fd781ad', 'CONTRA FILÉ (CARNES)', 'KG', 11.04)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select 'cad7066c-2881-5eaf-bf75-3ebbd4cf1435', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '8c795a4b-5eff-5ac6-b537-e1953817e442' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '8c795a4b-5eff-5ac6-b537-e1953817e442' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- FILÉ DE TILÁPIA · Porcionados UND 6.34
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('9f2d8ebb-27ad-5a32-8755-8fa7378bd173', 'b0a12eca-0000-4000-8000-000000000001', 'cd858e96-acbd-5202-b034-29678b4466c4', 'FILÉ DE TILÁPIA (PORCIONADO)', 'UND', 6.34)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '9f2d8ebb-27ad-5a32-8755-8fa7378bd173', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '87c945e4-cb26-5333-a93e-16d6a01e2a87' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '87c945e4-cb26-5333-a93e-16d6a01e2a87' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- LINGUIÇA CALABRESA · Porcionados KG 16.87
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('ec71c95f-16a5-542a-8927-6ce42513f688', 'b0a12eca-0000-4000-8000-000000000001', 'e2f207b6-578f-5826-84f4-26b367a9ddf1', 'LINGUIÇA CALABRESA (FEIJOADA)', 'KG', 16.87)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select 'ec71c95f-16a5-542a-8927-6ce42513f688', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '9182dd5a-1d04-54f5-b841-d1c76dd5a4f4' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '9182dd5a-1d04-54f5-b841-d1c76dd5a4f4' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- LINGUIÇA FINA · Porcionados KG 19.88
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('15ce21fc-e32a-5335-a128-a827ffb40ad4', 'b0a12eca-0000-4000-8000-000000000001', 'e2f207b6-578f-5826-84f4-26b367a9ddf1', 'LINGUIÇA FINA (FEIJOADA)', 'KG', 19.88)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '15ce21fc-e32a-5335-a128-a827ffb40ad4', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '062ab54f-c0be-5ca7-aaf4-c64ebae99562' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '062ab54f-c0be-5ca7-aaf4-c64ebae99562' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- LINGUIÇA PAIO · Porcionados KG 21.99
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('37875d54-fc45-5287-afd1-f8da29141adc', 'b0a12eca-0000-4000-8000-000000000001', 'e2f207b6-578f-5826-84f4-26b367a9ddf1', 'LINGUIÇA PAIO (FEIJOADA)', 'KG', 21.99)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '37875d54-fc45-5287-afd1-f8da29141adc', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = 'f4d8ba8e-bdda-503d-9683-ee9bdf25f676' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = 'f4d8ba8e-bdda-503d-9683-ee9bdf25f676' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- LOMBO SUÍNO SALGADO · Porcionados KG 18.49
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('9116e0a4-128e-5480-8660-1e3e874be0c4', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'LOMBO SUÍNO SALGADO (SUÍNOS)', 'KG', 18.49)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '9116e0a4-128e-5480-8660-1e3e874be0c4', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '26ba690b-656a-52d2-916c-10cd77a87e9f' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '26ba690b-656a-52d2-916c-10cd77a87e9f' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- MOCOTÓ · Porcionados KG 0
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('0fdf4499-17ee-5f19-ab28-160aad462366', 'b0a12eca-0000-4000-8000-000000000001', '93d69735-36bd-572d-88d7-5c014cd81a02', 'MOCOTÓ (SUÍNOS)', 'KG', 0)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select '0fdf4499-17ee-5f19-ab28-160aad462366', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = '9aa1451a-ac29-5fa5-9582-18947502c76e' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = '9aa1451a-ac29-5fa5-9582-18947502c76e' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- QUIABO · Porcionados KG 0
insert into produtos (id, restaurante_id, categoria_id, nome, unidade, custo_medio) values
  ('e2c3af6c-ec13-519d-8b2b-f87d2357dbf2', 'b0a12eca-0000-4000-8000-000000000001', 'b60937b9-20ba-5cc3-9055-b2362fd781ad', 'QUIABO (CARNES)', 'KG', 0)
on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, ativo = true;

-- O vinculo e MOVIDO, nao recriado: unidade, custo, ordem e a marca custo_fixo
-- vem da linha que ja existe. Recriar com valores do gerador apagaria qualquer
-- ajuste que o admin tenha feito na tela desde a carga.
insert into produto_setores (produto_id, setor_id, unidade, custo, ordem, custo_fixo)
select 'e2c3af6c-ec13-519d-8b2b-f87d2357dbf2', '19a7379f-949c-565a-b11d-16eaf91dab37', ps.unidade, ps.custo, ps.ordem, ps.custo_fixo
  from produto_setores ps
 where ps.produto_id = 'f78c8a93-25de-50dd-8b21-f53d39176037' and ps.setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a'
on conflict (produto_id, setor_id) do nothing;

delete from produto_setores
 where produto_id = 'f78c8a93-25de-50dd-8b21-f53d39176037' and setor_id = '0be1640c-9e56-5cc2-902a-bae52307bd9a';

-- 5 ------------------------------------- o resto dos vinculos muda de endereco
-- Primeiro os quatro setores que saem: tudo que sobrou neles vai para Cozinha.
-- Os desdobramentos do passo 4 ja sairam daqui, entao nao ha colisao de chave.
update produto_setores ps
   set setor_id = '19a7379f-949c-565a-b11d-16eaf91dab37'
 where ps.setor_id in ('42970c23-cbe7-5ebf-b519-9a82e43226ba', '1845840a-385e-509f-af58-3715a9539282', '4baad629-37bc-54a7-88eb-38c56420c36c', '0be1640c-9e56-5cc2-902a-bae52307bd9a');

-- Depois Limpeza e Descartaveis, que saem de dentro da Cozinha. A categoria do
-- produto decide, e nao uma lista escrita a mao: os 2 conjuntos estao
-- inteiros no antigo Estoque Geral.
-- categoria MATERIAL DE LIMPEZA -> setor Limpeza
update produto_setores ps
   set setor_id = '5b525c9c-4dbd-5825-987b-b41bf4cf8009'
  from produtos p
 where p.id = ps.produto_id
   and p.categoria_id = '2c58bf88-d1a5-5462-98a0-b658fb5f1492'  -- MATERIAL DE LIMPEZA
   and ps.setor_id = '19a7379f-949c-565a-b11d-16eaf91dab37';

-- categoria DESCARTÁVEIS -> setor Descartáveis
update produto_setores ps
   set setor_id = '725e4111-5f1e-50b4-9ea7-c2c3e1eab915'
  from produtos p
 where p.id = ps.produto_id
   and p.categoria_id = '82bef36a-513d-59a8-91f2-780ed1f1ae38'  -- DESCARTÁVEIS
   and ps.setor_id = '19a7379f-949c-565a-b11d-16eaf91dab37';

-- 6 ------------------------------------------------------ os que saem de cena
-- Arquivados, nao apagados. A contagem de agosto aponta para eles, e
-- contagem_itens.setor_id e 'on delete restrict' justamente para que ninguem
-- apague por engano um setor que tem historia.
update setores set ativo = false
 where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001'
   and id in ('42970c23-cbe7-5ebf-b519-9a82e43226ba', '1845840a-385e-509f-af58-3715a9539282', '4baad629-37bc-54a7-88eb-38c56420c36c', '0be1640c-9e56-5cc2-902a-bae52307bd9a');

-- 7 -------------------------------------------------------------- conferencia
-- O arquivo se recusa a terminar se a conta nao fechar. Sem isto, um erro de
-- mapeamento so apareceria semanas depois, na folha de contagem.
do $$
declare v_setores integer; v_vinculos integer; v_bar integer; v_orfaos integer;
begin
  select count(*) into v_setores from setores
   where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and ativo;
  if v_setores <> 4 then
    raise exception 'esperava 4 setores ativos, encontrei %', v_setores;
  end if;

  select count(*) into v_vinculos from produto_setores ps
    join setores s on s.id = ps.setor_id where s.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001';
  if v_vinculos <> 868 then
    raise exception 'esperava 868 vinculos (nenhum se perde na mudanca), encontrei %', v_vinculos;
  end if;

  select count(*) into v_bar from produto_setores
   where setor_id = 'd08c7059-341f-5415-b00d-db72edd7ba7a';
  if v_bar <> 278 then
    raise exception 'o Bar nao devia ter mudado: esperava 278 vinculos, encontrei %', v_bar;
  end if;

  select count(*) into v_orfaos from produto_setores ps
    join setores s on s.id = ps.setor_id
   where s.restaurante_id = 'b0a12eca-0000-4000-8000-000000000001' and not s.ativo;
  if v_orfaos <> 0 then
    raise exception '% vinculos ficaram num setor arquivado', v_orfaos;
  end if;

  raise notice 'setores do Bar do Zeca ok: % ativos, % vinculos, catalogo com % produtos',
    v_setores, v_vinculos, (select count(*) from produtos where restaurante_id = 'b0a12eca-0000-4000-8000-000000000001');
end $$;

commit;
