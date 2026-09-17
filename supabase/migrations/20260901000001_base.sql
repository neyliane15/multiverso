-- ============================================================================
-- Multiverso · 0001 · Base: tenancy, perfis e helpers de autorizacao
-- ----------------------------------------------------------------------------
-- Um restaurante e um tenant. Todo dado do sistema pendura em restaurante_id,
-- e toda politica de RLS responde a mesma pergunta: "esta linha e do meu
-- restaurante?". O master e a unica excecao — ele enxerga a rede inteira.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------- enums ----
do $$ begin
  create type papel_usuario as enum ('master', 'admin', 'gerente', 'operador');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ restaurantes -
create table if not exists restaurantes (
  id               uuid primary key default gen_random_uuid(),
  nome             text        not null,
  slug             text        not null unique,
  documento        text,                                   -- CNPJ
  unidade          text,                                   -- filial / praca
  ativo            boolean     not null default true,

  -- identidade visual: o admin configura por restaurante e o app inteiro se
  -- repinta a partir daqui (ver web/src/tema).
  logo_url         text,
  logo_escuro_url  text,
  favicon_url      text,
  cor_primaria     text        not null default '#E4572E',
  cor_secundaria   text        not null default '#17255A',
  cor_acento       text        not null default '#F5B700',
  cor_fundo        text        not null default '#0E1116',
  cor_superficie   text        not null default '#171B22',
  cor_texto        text        not null default '#F2F4F8',
  fonte_titulo     text        not null default 'Sora',
  fonte_texto      text        not null default 'Inter',
  raio_borda       text        not null default '14px',
  tema             text        not null default 'escuro'
                   check (tema in ('claro', 'escuro')),

  -- preferencias operacionais
  moeda            text        not null default 'BRL',
  fuso             text        not null default 'America/Sao_Paulo',
  dia_virada_semana smallint   not null default 1
                   check (dia_virada_semana between 0 and 6),   -- 1 = segunda

  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  constraint cor_primaria_hex   check (cor_primaria   ~* '^#[0-9a-f]{6}$'),
  constraint cor_secundaria_hex check (cor_secundaria ~* '^#[0-9a-f]{6}$'),
  constraint cor_acento_hex     check (cor_acento     ~* '^#[0-9a-f]{6}$'),
  constraint cor_fundo_hex      check (cor_fundo      ~* '^#[0-9a-f]{6}$'),
  constraint cor_superficie_hex check (cor_superficie ~* '^#[0-9a-f]{6}$'),
  constraint cor_texto_hex      check (cor_texto      ~* '^#[0-9a-f]{6}$')
);

comment on table  restaurantes is 'Tenant. Cada linha e um restaurante com sua propria marca, cores e dados.';
comment on column restaurantes.dia_virada_semana is 'Dia em que a semana operacional vira (0=domingo). Usado pelo dashboard de CMV.';

-- ------------------------------------------------------------------ perfis -
-- Espelha auth.users. O master nao pertence a restaurante nenhum.
create table if not exists perfis (
  id               uuid primary key references auth.users(id) on delete cascade,
  restaurante_id   uuid        references restaurantes(id) on delete cascade,
  nome             text        not null,
  email            text        not null,
  telefone         text,
  avatar_url       text,
  papel            papel_usuario not null default 'operador',
  ativo            boolean     not null default true,
  convite_aceito_em timestamptz,
  ultimo_acesso_em timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  -- master nao tem restaurante; todo mundo mais tem, obrigatoriamente.
  constraint perfil_tenant_coerente check (
    (papel = 'master' and restaurante_id is null) or
    (papel <> 'master' and restaurante_id is not null)
  )
);

create index if not exists perfis_restaurante_idx on perfis (restaurante_id) where ativo;
create unique index if not exists perfis_email_unico on perfis (lower(email));

comment on table perfis is 'Usuario do sistema. papel=master monitora a rede inteira; os demais vivem dentro de um restaurante.';

-- -------------------------------------------------------- helpers de auth --
-- SECURITY DEFINER de proposito: estas funcoes sao consultadas de dentro das
-- politicas de RLS de perfis. Se lessem perfis sob RLS, a politica chamaria a
-- si mesma e o Postgres abortaria por recursao infinita.
create or replace function mv_papel_atual()
returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function mv_restaurante_atual()
returns uuid
language sql stable security definer set search_path = public as $$
  select restaurante_id from perfis where id = auth.uid() and ativo
$$;

create or replace function mv_eh_master()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'master' from perfis where id = auth.uid() and ativo), false)
$$;

-- "posso administrar este restaurante?" — master sempre; admin no proprio.
create or replace function mv_pode_administrar(alvo uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select mv_eh_master()
      or (alvo is not null
          and alvo = mv_restaurante_atual()
          and mv_papel_atual() in ('admin', 'gerente'))
$$;

-- "posso ao menos ver/lancar dados deste restaurante?"
create or replace function mv_pode_operar(alvo uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select mv_eh_master() or (alvo is not null and alvo = mv_restaurante_atual())
$$;

-- ------------------------------------------------------ atualizado_em ------
create or replace function mv_toca_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create or replace procedure mv_registra_touch(tabela text)
language plpgsql as $$
begin
  execute format(
    'drop trigger if exists %I on %I; create trigger %I before update on %I
       for each row execute function mv_toca_atualizado_em()',
    't_' || tabela || '_touch', tabela, 't_' || tabela || '_touch', tabela);
end $$;

call mv_registra_touch('restaurantes');
call mv_registra_touch('perfis');

-- ----------------------------------------------- novo usuario do auth ------
-- Um convite feito pelo admin chega aqui com os metadados ja preenchidos.
create or replace function mv_ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, restaurante_id, nome, email, papel)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'restaurante_id', '')::uuid,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'papel', ''), 'operador')::papel_usuario
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists t_auth_usuario_criado on auth.users;
create trigger t_auth_usuario_criado
  after insert on auth.users
  for each row execute function mv_ao_criar_usuario();
