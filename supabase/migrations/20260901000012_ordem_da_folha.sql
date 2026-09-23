-- ---------------------------------------------------------------------------
-- 0012 · A folha de contagem respeita a ordem dos setores
--
-- `vw_contagem_por_estoque` ordenava por nome, e a tela repetia a ordenacao do
-- servidor. Com os setores do Bar do Zeca virando Bar, Cozinha, Limpeza e
-- Descartaveis, a folha passou a listar Descartaveis ANTES de Limpeza — porque
-- D vem antes de L, e nao porque alguem quis.
--
-- A coluna `ordem` do setor existe exatamente para isso: e a ordem em que se
-- anda pela casa, e o admin a define arrastando na tela de Setores. Ignora-la
-- na folha e mandar quem conta caminhar em ordem alfabetica.
--
-- As colunas novas vao no FIM da lista: `create or replace view` aceita
-- acrescentar no fim, mas nao no meio (ele tentaria renomear as seguintes).
-- ---------------------------------------------------------------------------

create or replace view vw_contagem_por_estoque as
select
  i.contagem_id, c.restaurante_id,
  s.id as setor_id, s.nome as setor_nome, s.cor as setor_cor,
  e.id as estoque_id, e.nome as estoque_nome,
  count(*)                                 as itens,
  count(*) filter (where i.quantidade > 0) as itens_preenchidos,
  coalesce(sum(i.total), 0)                as total,
  s.ordem                                  as setor_ordem,
  -- O setor sem subdivisao nao tem lugar, e a parada "sem lugar definido" de
  -- um setor dividido vem antes das geladeiras: e o resto do setor, e quem
  -- conta topa com ele primeiro. -1 poe as duas na frente sem caso especial.
  coalesce(e.ordem, -1)                    as estoque_ordem
from contagem_itens i
join contagens c on c.id = i.contagem_id
join setores   s on s.id = i.setor_id
left join estoques e on e.id = i.estoque_id
group by i.contagem_id, c.restaurante_id, s.id, s.nome, s.cor, s.ordem, e.id, e.nome, e.ordem;

alter view vw_contagem_por_estoque set (security_invoker = on);
grant select on vw_contagem_por_estoque to authenticated;
