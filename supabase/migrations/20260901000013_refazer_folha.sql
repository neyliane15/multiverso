-- ---------------------------------------------------------------------------
-- 0013 · Refazer a folha de uma contagem aberta
--
-- A folha e uma FOTO do cadastro no instante em que a contagem foi aberta.
-- Isso e proposital: mexer no cadastro nao pode mudar por baixo uma contagem
-- em andamento, e muito menos uma ja fechada.
--
-- Mas o efeito colateral aparece quando o cadastro muda de verdade. O Bar do
-- Zeca reorganizou os setores de seis para quatro, e a contagem que estava
-- aberta continuou mostrando Hortifruti, Massas e Panificacao, Molhos e
-- Caldos e Porcionados — setores que nao existem mais. Sem uma saida, a unica
-- opcao era cancelar a contagem e abrir outra, perdendo o que ja se contou.
--
-- Esta funcao realinha a folha aberta com o cadastro de hoje:
--
--   acrescenta  linha que o cadastro tem e a folha nao (produto novo, setor
--               novo, lugar novo)
--   remove      linha que o cadastro nao tem mais E que esta zerada e sem
--               carimbo de contagem
--   preserva    TUDO que tem quantidade ou carimbo, mesmo fora do cadastro.
--               Trabalho de quem contou nao se apaga para arrumar a tela; a
--               linha orfa aparece agrupada como "Fora do cadastro".
--
-- Nao mexe em unidade nem em custo das linhas que ficam: sao os numeros com
-- que a pessoa esta contando agora, e troca-los no meio do trabalho faria o
-- total pular sem explicacao.
-- ---------------------------------------------------------------------------

create or replace function mv_refazer_folha(p_contagem uuid)
returns table (acrescentadas integer, removidas integer, preservadas integer)
language plpgsql security invoker set search_path = public as $$
declare
  v_restaurante uuid;
  v_status      status_contagem;
  v_add         integer;
  v_del         integer;
  v_orfas       integer;
begin
  select restaurante_id, status into v_restaurante, v_status
    from contagens where id = p_contagem;

  if v_restaurante is null then
    raise exception 'contagem % nao existe', p_contagem;
  end if;
  if v_status <> 'aberta' then
    raise exception 'so a folha aberta pode ser refeita; esta esta %', v_status;
  end if;

  -- `on commit drop` so derruba no fim da transacao, e o PostgREST abre uma
  -- por chamada — mas duas chamadas dentro da MESMA transacao (um script, um
  -- teste) batiam em "relation _folha_alvo already exists". Derrubar antes
  -- custa nada e tira a pegadinha.
  drop table if exists _folha_alvo;

  -- A folha que mv_abrir_contagem geraria hoje. Mesmo LATERAL da 0011: o
  -- filtro de setor tem de valer dentro da busca dos lugares, senao um
  -- produto em dois setores multiplica linhas nulas.
  create temporary table _folha_alvo on commit drop as
  select ps.produto_id, ps.setor_id, e.id as estoque_id, ps.unidade,
         case when ps.custo > 0 then ps.custo else p.custo_medio end as custo,
         case when coalesce(ps.custo_atualizado_em, p.custo_atualizado_em) is not null
              then 'custo de ' || to_char(
                     coalesce(ps.custo_atualizado_em, p.custo_atualizado_em), 'DD/MM/YYYY')
         end as observacao
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
    join setores  s on s.id = ps.setor_id
    left join lateral (
      select e.id
        from produto_estoques pe
        join estoques e on e.id = pe.estoque_id
       where pe.produto_id = ps.produto_id and pe.ativo
         and e.setor_id = ps.setor_id and e.ativo
    ) e on true
   where p.restaurante_id = v_restaurante
     and p.ativo and s.ativo and ps.ativo;

  with fora as (
    delete from contagem_itens i
     where i.contagem_id = p_contagem
       and i.quantidade = 0
       and i.contado_em is null
       and not exists (
         select 1 from _folha_alvo a
          where a.produto_id = i.produto_id
            and a.setor_id   = i.setor_id
            and a.estoque_id is not distinct from i.estoque_id)
    returning 1)
  select count(*) into v_del from fora;

  with novas as (
    insert into contagem_itens
      (contagem_id, produto_id, setor_id, estoque_id, unidade, custo_unitario, observacao)
    select p_contagem, a.produto_id, a.setor_id, a.estoque_id, a.unidade, a.custo, a.observacao
      from _folha_alvo a
     where not exists (
       select 1 from contagem_itens i
        where i.contagem_id = p_contagem
          and i.produto_id = a.produto_id
          and i.setor_id   = a.setor_id
          and i.estoque_id is not distinct from a.estoque_id)
    returning 1)
  select count(*) into v_add from novas;

  -- O que sobrou fora do cadastro por ter quantidade: a tela precisa dizer
  -- quantas sao, senao a pessoa fecha a contagem sem perceber que ainda ha
  -- linha de um setor que nao existe mais somando no total.
  select count(*) into v_orfas
    from contagem_itens i
   where i.contagem_id = p_contagem
     and not exists (
       select 1 from _folha_alvo a
        where a.produto_id = i.produto_id
          and a.setor_id   = i.setor_id
          and a.estoque_id is not distinct from i.estoque_id);

  update contagens set atualizado_em = now() where id = p_contagem;

  return query select v_add, v_del, v_orfas;
end $$;

comment on function mv_refazer_folha(uuid) is
  'Realinha a folha de uma contagem ABERTA com o cadastro atual, sem apagar nada que ja tenha sido contado.';

grant execute on function mv_refazer_folha(uuid) to authenticated;
