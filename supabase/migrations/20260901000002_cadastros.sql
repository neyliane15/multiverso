-- ============================================================================
-- Multiverso · 0002 · Modulo 1: Cadastros (produtos, categorias, setores)
-- ----------------------------------------------------------------------------
-- A regra que desenha este modulo: um produto tem UMA categoria e VARIOS
-- setores. Cada setor guarda a propria unidade e o proprio custo, porque na
-- pratica o mesmo item vale uma coisa cru no estoque e outra ja porcionado.
-- Ex.: FILE DE TILAPIA = R$ 41,50/KG no Estoque Geral e R$ 6,34/porcao nos
-- Porcionados. Sao a mesma tilapia, contada em dois lugares.
-- ============================================================================

-- -------------------------------------------------------------- categorias -
create table if not exists categorias (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  cor            text not null default '#6B7280' check (cor ~* '^#[0-9a-f]{6}$'),
  ordem          integer not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists categorias_nome_unico
  on categorias (restaurante_id, lower(mv_sem_acento(nome)));
create index if not exists categorias_restaurante_idx on categorias (restaurante_id, ordem);

-- ----------------------------------------------------------------- setores -
-- Setor = lugar onde se conta. Bar, Estoque Geral, Hortifruti, Camara Fria...
create table if not exists setores (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  cor            text not null default '#6B7280' check (cor ~* '^#[0-9a-f]{6}$'),
  ordem          integer not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists setores_nome_unico
  on setores (restaurante_id, lower(mv_sem_acento(nome)));
create index if not exists setores_restaurante_idx on setores (restaurante_id, ordem);

-- ---------------------------------------------------------------- produtos -
create table if not exists produtos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  categoria_id   uuid references categorias(id) on delete set null,
  nome           text not null,
  codigo         text,                       -- codigo interno / SKU
  codigo_barras  text,
  unidade        text not null default 'UND',-- unidade padrao de compra
  custo_medio    numeric(14,6) not null default 0 check (custo_medio >= 0),
  estoque_minimo numeric(14,4) not null default 0 check (estoque_minimo >= 0),
  perecivel      boolean not null default false,
  observacao     text,
  ativo          boolean not null default true,
  criado_por     uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists produtos_nome_unico
  on produtos (restaurante_id, lower(mv_sem_acento(nome)));
create index if not exists produtos_categoria_idx on produtos (restaurante_id, categoria_id);
create index if not exists produtos_busca_idx
  on produtos using gin (to_tsvector('portuguese', nome));

comment on column produtos.custo_medio is
  'Custo de referencia do produto. Cada vinculo em produto_setores pode sobrescrever com o custo daquele setor.';

-- -------------------------------------------------------- produto x setor --
-- O N:N que o enunciado pede. A unidade e o custo moram no vinculo.
create table if not exists produto_setores (
  produto_id  uuid not null references produtos(id) on delete cascade,
  setor_id    uuid not null references setores(id)  on delete cascade,
  unidade     text not null default 'UND',
  custo       numeric(14,6) not null default 0 check (custo >= 0),
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  primary key (produto_id, setor_id)
);

create index if not exists produto_setores_setor_idx on produto_setores (setor_id);

-- Guarda-corpo: produto e setor tem de ser do mesmo restaurante. Sem isto, um
-- vinculo mal montado vazaria dado de um tenant para outro pela porta dos fundos.
create or replace function mv_valida_produto_setor()
returns trigger language plpgsql as $$
declare r_produto uuid; r_setor uuid;
begin
  select restaurante_id into r_produto from produtos where id = new.produto_id;
  select restaurante_id into r_setor   from setores  where id = new.setor_id;
  if r_produto is distinct from r_setor then
    raise exception 'produto % e setor % pertencem a restaurantes diferentes', new.produto_id, new.setor_id;
  end if;
  return new;
end $$;

drop trigger if exists t_produto_setores_valida on produto_setores;
create trigger t_produto_setores_valida
  before insert or update on produto_setores
  for each row execute function mv_valida_produto_setor();

-- Mesma checagem entre produto e categoria.
create or replace function mv_valida_produto_categoria()
returns trigger language plpgsql as $$
declare r_categoria uuid;
begin
  if new.categoria_id is null then return new; end if;
  select restaurante_id into r_categoria from categorias where id = new.categoria_id;
  if r_categoria is distinct from new.restaurante_id then
    raise exception 'categoria % nao pertence ao restaurante %', new.categoria_id, new.restaurante_id;
  end if;
  return new;
end $$;

drop trigger if exists t_produtos_valida_categoria on produtos;
create trigger t_produtos_valida_categoria
  before insert or update on produtos
  for each row execute function mv_valida_produto_categoria();

call mv_registra_touch('categorias');
call mv_registra_touch('setores');
call mv_registra_touch('produtos');

-- ------------------------------------------------------------------- vista -
-- Produto com categoria e setores resolvidos: o que a tela de Cadastros lista.
create or replace view vw_produtos_completos as
select
  p.id, p.restaurante_id, p.nome, p.codigo, p.codigo_barras, p.unidade,
  p.custo_medio, p.estoque_minimo, p.perecivel, p.ativo, p.observacao,
  p.criado_em, p.atualizado_em,
  c.id as categoria_id, c.nome as categoria_nome, c.cor as categoria_cor,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'setor_id', s.id, 'setor_nome', s.nome, 'setor_cor', s.cor,
              'unidade', ps.unidade, 'custo', ps.custo, 'ordem', ps.ordem)
            order by s.ordem, s.nome)
       from produto_setores ps
       join setores s on s.id = ps.setor_id
      where ps.produto_id = p.id and ps.ativo),
    '[]'::jsonb) as setores
from produtos p
left join categorias c on c.id = p.categoria_id;
