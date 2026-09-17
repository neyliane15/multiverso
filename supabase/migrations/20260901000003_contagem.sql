-- ============================================================================
-- Multiverso · 0003 · Modulo 2: Gestao de Contagem
-- ----------------------------------------------------------------------------
-- Uma contagem e uma foto do estoque numa data. Ela nasce aberta, se abastece
-- dos cadastros (produto x setor), e ao fechar congela quantidade E custo —
-- porque o custo de agosto nao pode mudar quando o preco de setembro subir.
-- O historico do modulo 2.2 e simplesmente a lista de contagens fechadas.
-- ============================================================================

do $$ begin
  create type tipo_contagem as enum ('semanal', 'mensal', 'avulsa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_contagem as enum ('aberta', 'fechada', 'cancelada');
exception when duplicate_object then null; end $$;

create table if not exists contagens (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  referencia     date not null,                        -- data da foto
  tipo           tipo_contagem   not null default 'mensal',
  status         status_contagem not null default 'aberta',
  titulo         text,
  observacao     text,
  total          numeric(16,4) not null default 0,     -- congelado no fechamento
  itens_contados integer       not null default 0,
  criado_por     uuid references perfis(id) on delete set null,
  fechado_por    uuid references perfis(id) on delete set null,
  fechada_em     timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint contagem_fechada_tem_data check (
    (status = 'fechada' and fechada_em is not null) or status <> 'fechada')
);

-- So pode existir uma contagem aberta por tipo e referencia. Duas contagens
-- mensais abertas em agosto seria a planilha duplicada de novo.
create unique index if not exists contagens_ref_unica
  on contagens (restaurante_id, tipo, referencia)
  where status <> 'cancelada';
create index if not exists contagens_historico_idx
  on contagens (restaurante_id, referencia desc);

-- ------------------------------------------------------------------ itens --
create table if not exists contagem_itens (
  id             uuid primary key default gen_random_uuid(),
  contagem_id    uuid not null references contagens(id) on delete cascade,
  produto_id     uuid not null references produtos(id) on delete restrict,
  setor_id       uuid not null references setores(id)  on delete restrict,
  quantidade     numeric(14,4)  not null default 0 check (quantidade >= 0),
  unidade        text           not null default 'UND',
  custo_unitario numeric(14,6)  not null default 0 check (custo_unitario >= 0),
  total          numeric(16,4)  generated always as (round(quantidade * custo_unitario, 4)) stored,
  contado_por    uuid references perfis(id) on delete set null,
  contado_em     timestamptz,
  observacao     text,

  -- o mesmo produto pode ser contado em varios setores, mas so uma vez em cada
  unique (contagem_id, produto_id, setor_id)
);

create index if not exists contagem_itens_contagem_idx on contagem_itens (contagem_id);
create index if not exists contagem_itens_produto_idx  on contagem_itens (produto_id);
create index if not exists contagem_itens_setor_idx    on contagem_itens (contagem_id, setor_id);

call mv_registra_touch('contagens');

-- ------------------------------------------- contagem fechada e imutavel ---
create or replace function mv_contagem_bloqueada()
returns trigger language plpgsql as $$
declare st status_contagem;
begin
  select status into st from contagens
   where id = coalesce(new.contagem_id, old.contagem_id);
  if st = 'fechada' then
    raise exception 'contagem ja fechada: os itens nao podem mais ser alterados';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_contagem_itens_bloqueio on contagem_itens;
create trigger t_contagem_itens_bloqueio
  before insert or update or delete on contagem_itens
  for each row execute function mv_contagem_bloqueada();

-- --------------------------------------------------- abrir uma contagem ----
-- Monta a folha de contagem a partir dos cadastros: todo par produto x setor
-- ativo vira uma linha zerada, ja com a unidade e o custo daquele setor.
create or replace function mv_abrir_contagem(
  p_restaurante uuid,
  p_referencia  date,
  p_tipo        tipo_contagem default 'mensal',
  p_titulo      text default null,
  p_setores     uuid[] default null      -- null = todos os setores
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into contagens (restaurante_id, referencia, tipo, titulo, criado_por)
  values (p_restaurante, p_referencia, p_tipo,
          coalesce(p_titulo, initcap(p_tipo::text) || ' · ' || to_char(p_referencia, 'DD/MM/YYYY')),
          auth.uid())
  returning id into v_id;

  insert into contagem_itens (contagem_id, produto_id, setor_id, unidade, custo_unitario)
  select v_id, ps.produto_id, ps.setor_id, ps.unidade,
         case when ps.custo > 0 then ps.custo else p.custo_medio end
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
    join setores  s on s.id = ps.setor_id
   where p.restaurante_id = p_restaurante
     and p.ativo and s.ativo and ps.ativo
     and (p_setores is null or ps.setor_id = any (p_setores));

  return v_id;
end $$;

-- -------------------------------------------------- fechar uma contagem ----
-- Congela o total e carimba quem fechou. A partir daqui a foto nao se mexe.
create or replace function mv_fechar_contagem(p_contagem uuid)
returns contagens
language plpgsql security invoker set search_path = public as $$
declare v_linha contagens;
begin
  update contagens c
     set status     = 'fechada',
         fechada_em = now(),
         fechado_por = auth.uid(),
         total = (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id),
         itens_contados = (select count(*) from contagem_itens i
                            where i.contagem_id = c.id and i.quantidade > 0)
   where c.id = p_contagem and c.status = 'aberta'
  returning * into v_linha;

  if v_linha.id is null then
    raise exception 'contagem % nao existe ou nao esta aberta', p_contagem;
  end if;
  return v_linha;
end $$;

create or replace function mv_reabrir_contagem(p_contagem uuid)
returns contagens
language plpgsql security invoker set search_path = public as $$
declare v_linha contagens;
begin
  update contagens
     set status = 'aberta', fechada_em = null, fechado_por = null
   where id = p_contagem and status = 'fechada'
  returning * into v_linha;
  if v_linha.id is null then
    raise exception 'contagem % nao esta fechada', p_contagem;
  end if;
  return v_linha;
end $$;

-- ------------------------------------------------------------- historico ---
create or replace view vw_contagens_resumo as
select
  c.id, c.restaurante_id, c.referencia, c.tipo, c.status, c.titulo,
  c.criado_em, c.fechada_em,
  case when c.status = 'fechada' then c.total
       else (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id)
  end as total,
  (select count(*) from contagem_itens i where i.contagem_id = c.id)                    as itens_total,
  (select count(*) from contagem_itens i where i.contagem_id = c.id and i.quantidade > 0) as itens_preenchidos,
  (select nome from perfis where id = c.criado_por)  as criado_por_nome,
  (select nome from perfis where id = c.fechado_por) as fechado_por_nome
from contagens c;

-- Total por setor dentro de uma contagem: alimenta os cards da tela 2.1.
create or replace view vw_contagem_por_setor as
select
  i.contagem_id, c.restaurante_id, s.id as setor_id, s.nome as setor_nome, s.cor as setor_cor,
  count(*)                                     as itens,
  count(*) filter (where i.quantidade > 0)     as itens_preenchidos,
  coalesce(sum(i.total), 0)                    as total
from contagem_itens i
join contagens c on c.id = i.contagem_id
join setores   s on s.id = i.setor_id
group by i.contagem_id, c.restaurante_id, s.id, s.nome, s.cor;
