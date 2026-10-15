-- ===========================================================================
-- Producao: a ficha que entra dentro de outra ficha
--
-- O modulo nasceu com um nivel so — ficha aponta para produto, e acabou. Isso
-- cobre o drink e o prato simples, e nao cobre a cozinha de verdade, onde o
-- prato leva uma preparacao que a casa fez: a massa do empadao, o recheio, o
-- tutu de feijao, o xarope de acucar do bar.
--
-- Ate aqui essas preparacoes viravam PRODUTO com custo congelado. Funcionava
-- de longe e mentia de perto: o EMPADAO DE FRANGO COM SALADA tem 87% do custo
-- em preparacao, entao o prato mais complexo da casa era justamente o que
-- menos acompanhava o preco real. Dobrar o preco da farinha nao mexia um
-- centavo no empadao.
--
-- Agora a preparacao e uma FICHA, marcada como producao, com os ingredientes
-- dela. O prato aponta para ela, e o custo sobe a arvore sozinho:
--
--     EMPADAO DE FRANGO COM SALADA   (prato)
--       └─ EMPADAO DE FRANGO         (producao)
--            ├─ MASSA EMPADAO        (producao)
--            └─ RECHEIO EMPADAO      (producao)
--
-- Tres decisoes que valem explicacao:
--
--   1. `producao` e coluna e nao convencao de nome de grupo. Grupo e texto
--      livre que a casa edita na tela; se a semantica morasse nele, renomear
--      "Producoes" para "Preparos" quebraria o calculo em silencio.
--
--   2. O item aponta para produto OU para producao, nunca os dois e nunca
--      nenhum. O `check` cobra isso, em vez de deixar a aplicacao lembrar.
--
--   3. O custo de uma producao e por UNIDADE DE RENDIMENTO, nao por ficha
--      inteira. A massa rende 1 KG e o prato leva 0,180 KG: o que o prato
--      paga e a fracao. Por isso a conta divide pelo rendimento, e por isso
--      `unidade_rendimento` passa a ter trabalho de verdade.
-- ===========================================================================

-- 1 ------------------------------------------------------------- a marca --
alter table fichas
  add column if not exists producao boolean not null default false;

comment on column fichas.producao is
  'true = preparacao da casa, que entra dentro de outra ficha em vez de ser vendida.';

-- Producao nao tem preco de carta: ela nao e vendida. Deixar o campo livre
-- conviveria com um CMV calculado sobre um preco que nao existe.
create index if not exists fichas_producao_idx
  on fichas (restaurante_id, producao) where ativo;

-- 2 --------------------------------------------- o item que aponta p/ ficha --
alter table ficha_itens
  add column if not exists producao_id uuid references fichas(id) on delete restrict;

-- `produto_id` era `not null`. Deixa de ser, porque agora ha a outra ponta.
alter table ficha_itens alter column produto_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ficha_itens_alvo_unico') then
    alter table ficha_itens add constraint ficha_itens_alvo_unico
      check (num_nonnulls(produto_id, producao_id) = 1);
  end if;
end $$;

-- O mesmo par nao entra duas vezes, dos dois lados.
create unique index if not exists ficha_itens_producao_unica
  on ficha_itens (ficha_id, producao_id) where producao_id is not null;

-- 3 ------------------------------------------------------ nada de ciclo --
-- Ficha que se come pela cauda derrubaria o calculo com recursao infinita, e o
-- lugar de recusar isso e na escrita: depois de gravado, qualquer leitura
-- explode. A funcao sobe a arvore a partir do alvo procurando a propria ficha.
create or replace function mv_producao_cria_ciclo(p_ficha uuid, p_alvo uuid)
returns boolean
language plpgsql stable set search_path = public as $$
declare v_achou boolean;
begin
  if p_ficha = p_alvo then return true; end if;
  with recursive abaixo as (
    select i.producao_id as id, 1 as nivel
      from ficha_itens i
     where i.ficha_id = p_alvo and i.producao_id is not null
    union all
    select i.producao_id, a.nivel + 1
      from abaixo a
      join ficha_itens i on i.ficha_id = a.id and i.producao_id is not null
     where a.nivel < 20
  )
  select exists (select 1 from abaixo where id = p_ficha) into v_achou;
  return coalesce(v_achou, false);
end $$;

-- O validador da 0017 olhava TODO item contra um produto. Com a ponta nova,
-- item de producao chega com `produto_id` nulo e ele acusava "ficha e produto
-- de restaurantes diferentes" — mensagem que manda procurar no lugar errado.
-- Ele passa a cuidar so do que e dele; a ponta de producao tem guarda propria.
create or replace function mv_valida_ficha_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ficha uuid; v_produto uuid;
begin
  if new.produto_id is null then return new; end if;
  select restaurante_id into v_ficha   from fichas   where id = new.ficha_id;
  select restaurante_id into v_produto from produtos where id = new.produto_id;
  if v_ficha is null or v_produto is null or v_ficha <> v_produto then
    raise exception 'ficha e produto de restaurantes diferentes';
  end if;
  return new;
end $$;

create or replace function mv_valida_producao_item()
returns trigger
language plpgsql set search_path = public as $$
declare v_alvo fichas; v_dona fichas;
begin
  if new.producao_id is null then return new; end if;

  select * into v_alvo from fichas where id = new.producao_id;
  select * into v_dona from fichas where id = new.ficha_id;

  if v_alvo.restaurante_id is distinct from v_dona.restaurante_id then
    raise exception 'ficha de outro restaurante nao entra nesta receita';
  end if;
  if not v_alvo.producao then
    raise exception 'a ficha "%" nao e uma producao: so producao entra dentro de outra ficha', v_alvo.nome;
  end if;
  if mv_producao_cria_ciclo(new.ficha_id, new.producao_id) then
    raise exception 'isto criaria um ciclo: "%" ja depende de "%"', v_alvo.nome, v_dona.nome;
  end if;
  return new;
end $$;

drop trigger if exists t_ficha_itens_producao on ficha_itens;
create trigger t_ficha_itens_producao
  before insert or update of producao_id, ficha_id on ficha_itens
  for each row execute function mv_valida_producao_item();

-- 4 ------------------------------------------------- o custo que sobe a arvore --
-- Devolve o custo de UMA unidade de rendimento da producao. O nivel existe
-- para que uma arvore funda ou um ciclo que escapou parem com mensagem, em vez
-- de estourar a pilha do Postgres.
create or replace function mv_custo_da_producao(p_ficha uuid, p_nivel integer default 0)
returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_ficha fichas;
  v_total numeric := 0;
  v_parcela numeric;
  v_fator numeric;
  r record;
begin
  if p_nivel > 10 then
    raise exception 'producao aninhada demais (mais de 10 niveis) a partir de %', p_ficha;
  end if;
  select * into v_ficha from fichas where id = p_ficha;
  if not found or v_ficha.rendimento is null or v_ficha.rendimento <= 0 then
    return null;
  end if;

  for r in select * from ficha_itens where ficha_id = p_ficha loop
    if r.produto_id is not null then
      v_fator := mv_fator_para_produto(r.unidade, r.produto_id);
      if v_fator is null then return null; end if;   -- incompativel contamina
      v_parcela := round(r.quantidade / (1 - r.perda_percentual / 100), 4)
                 * v_fator * mv_custo_do_produto(r.produto_id);
    else
      -- A producao filha rende na unidade dela; o item pede na unidade dele.
      v_fator := mv_fator_unidade(r.unidade,
                   (select unidade_rendimento from fichas where id = r.producao_id));
      if v_fator is null then return null; end if;
      v_parcela := round(r.quantidade / (1 - r.perda_percentual / 100), 4)
                 * v_fator * coalesce(mv_custo_da_producao(r.producao_id, p_nivel + 1), 0);
    end if;
    v_total := v_total + coalesce(v_parcela, 0);
  end loop;

  return round(v_total / v_ficha.rendimento, 6);
end $$;

comment on function mv_custo_da_producao(uuid, integer) is
  'Custo de UMA unidade de rendimento da producao, somando a arvore inteira.';

-- 5 ------------------------------------------------------------- as vistas --
drop view if exists vw_fichas_completas;
drop view if exists vw_ficha_itens;

create view vw_ficha_itens as
select
  i.id, i.ficha_id, f.restaurante_id,
  i.produto_id,
  i.producao_id,
  coalesce(p.nome, pr.nome)                      as produto_nome,
  coalesce(p.unidade, pr.unidade_rendimento)     as produto_unidade,
  i.producao_id is not null                      as e_producao,
  p.categoria_id, c.nome as categoria_nome, c.cor as categoria_cor,
  i.quantidade, i.unidade, i.perda_percentual, i.observacao, i.ordem,
  p.custo_atualizado_em,
  x.quantidade_bruta,
  x.fator,
  x.custo_unitario,
  case when x.fator is null then null
       else round(x.quantidade_bruta * x.fator * x.custo_unitario, 4) end as custo,
  x.fator is null        as unidade_incompativel,
  x.custo_unitario = 0   as sem_custo
from ficha_itens i
join fichas f on f.id = i.ficha_id
left join produtos p  on p.id = i.produto_id
left join fichas  pr on pr.id = i.producao_id
left join categorias c on c.id = p.categoria_id
cross join lateral (
  select round(i.quantidade / (1 - i.perda_percentual / 100), 4) as quantidade_bruta,
         case when i.produto_id is not null
              then mv_fator_para_produto(i.unidade, i.produto_id)
              else mv_fator_unidade(i.unidade, pr.unidade_rendimento) end as fator,
         case when i.produto_id is not null
              then mv_custo_do_produto(i.produto_id)
              else coalesce(mv_custo_da_producao(i.producao_id), 0) end   as custo_unitario
) x;

alter view vw_ficha_itens set (security_invoker = on);

-- A ficha inteira. A unica mudanca de forma e `producao` e os campos novos do
-- item; o resto e identico ao que a 0017 deixou, de proposito — esta migracao
-- acrescenta um caminho, nao reescreve a conta.
create view vw_fichas_completas as
with soma as (
  select ficha_id,
         sum(coalesce(custo, 0))                        as custo_total,
         count(*)                                       as itens,
         count(*) filter (where unidade_incompativel)   as itens_incompativeis,
         count(*) filter (where sem_custo)              as itens_sem_custo
    from vw_ficha_itens group by ficha_id
)
select
  f.id, f.restaurante_id, f.nome, f.grupo, f.descricao, f.modo_preparo,
  f.rendimento, f.unidade_rendimento, f.preco_venda, f.cmv_alvo, f.ativo, f.ordem,
  f.producao,
  f.criado_em, f.atualizado_em,
  coalesce(s.itens, 0)               as itens,
  coalesce(s.itens_incompativeis, 0) as itens_incompativeis,
  coalesce(s.itens_sem_custo, 0)     as itens_sem_custo,
  coalesce(s.custo_total, 0)                                  as custo_total,
  round(coalesce(s.custo_total, 0) / f.rendimento, 4)         as custo_porcao,
  case when f.preco_venda > 0
       then round(coalesce(s.custo_total, 0) / f.rendimento / f.preco_venda * 100, 2)
  end                                                         as cmv_percentual,
  case when f.preco_venda > 0
       then round(f.preco_venda - coalesce(s.custo_total, 0) / f.rendimento, 4)
  end                                                         as margem,
  case when coalesce(s.custo_total, 0) > 0
       then round(f.preco_venda / (coalesce(s.custo_total, 0) / f.rendimento), 2)
  end                                                         as markup,
  -- Quem usa esta producao. Vazio numa ficha de venda, e numa producao diz em
  -- quantos pratos ela entra — que e a pergunta que aparece na hora de mexer
  -- no custo dela.
  coalesce((select count(*) from ficha_itens i where i.producao_id = f.id), 0) as usada_em,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', vi.id, 'produto_id', vi.produto_id,
              'producao_id', vi.producao_id, 'e_producao', vi.e_producao,
              'produto_nome', vi.produto_nome,
              'produto_unidade', vi.produto_unidade,
              'categoria_nome', vi.categoria_nome, 'categoria_cor', vi.categoria_cor,
              'quantidade', vi.quantidade, 'unidade', vi.unidade,
              'perda_percentual', vi.perda_percentual, 'quantidade_bruta', vi.quantidade_bruta,
              'custo_unitario', vi.custo_unitario, 'custo', vi.custo,
              'unidade_incompativel', vi.unidade_incompativel, 'sem_custo', vi.sem_custo,
              'observacao', vi.observacao, 'ordem', vi.ordem)
            order by vi.ordem, vi.produto_nome)
       from vw_ficha_itens vi where vi.ficha_id = f.id),
    '[]'::jsonb)                                              as itens_da_ficha
from fichas f
left join soma s on s.ficha_id = f.id;

alter view vw_fichas_completas set (security_invoker = on);

-- 6 ---------------------------------------------- producao nao se apaga sozinha --
-- `on delete restrict` na coluna ja impede apagar producao que esta em uso,
-- mas o erro que o Postgres devolve fala de chave estrangeira. Quem apaga uma
-- ficha na tela merece saber em quantos pratos ela esta.
create or replace function mv_guarda_producao_em_uso()
returns trigger
language plpgsql set search_path = public as $$
declare v_uso integer;
begin
  select count(*) into v_uso from ficha_itens where producao_id = old.id;
  if v_uso > 0 then
    raise exception 'a producao "%" esta em % ficha(s) e nao pode ser apagada; tire-a delas primeiro',
      old.nome, v_uso;
  end if;
  return old;
end $$;

drop trigger if exists t_fichas_producao_em_uso on fichas;
create trigger t_fichas_producao_em_uso
  before delete on fichas
  for each row when (old.producao) execute function mv_guarda_producao_em_uso();

-- 7 ----------------------------------------------------------- permissoes --
-- `drop view` leva o grant junto. Sem isto a tela devolve "permission denied
-- for view vw_ficha_itens" — e foi exatamente o que a suite acusou aqui, na
-- primeira vez que esta migracao rodou por cima da 0017.
grant select on vw_ficha_itens, vw_fichas_completas to authenticated;
grant execute on function mv_custo_da_producao(uuid, integer) to authenticated;
grant execute on function mv_producao_cria_ciclo(uuid, uuid) to authenticated;
