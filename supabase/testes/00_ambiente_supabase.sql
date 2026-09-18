-- ============================================================================
-- Arremedo do ambiente Supabase para testar as migracoes num Postgres puro.
-- ----------------------------------------------------------------------------
-- Nao vai para producao. Existe para que `supabase/testes/executar.sh` possa
-- aplicar as migracoes de verdade, com RLS ligada, e exercitar as politicas
-- trocando de usuario — coisa que nenhum lint de SQL faz.
-- ============================================================================

-- Papeis sao do cluster, nao do banco: sobrevivem ao drop database.
do $$
declare p text;
begin
  foreach p in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = p) then
      execute format('create role %I nologin', p);
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- O Supabase resolve auth.uid() a partir do JWT. Aqui a fonte pode ser uma de
-- duas, e as duas importam:
--
--   request.jwt.claims  — o JSON inteiro, que e o que o PostgREST publica de
--                         verdade quando uma requisicao HTTP chega com token.
--   request.jwt.claim.* — o campo avulso, que os testes SQL trocam com
--                         set_config() para vestir cada usuario sem HTTP.
--
-- Ler as duas deixa o mesmo banco servir a suite de testes e o app rodando
-- contra PostgREST, sem uma versao de mentira para cada caso.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  )
$$;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text not null,
  owner     uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- 'restaurante/logo.png' -> {restaurante}
create or replace function storage.foldername(nome text) returns text[]
language sql immutable as $$
  select (string_to_array(nome, '/'))[1:greatest(array_length(string_to_array(nome, '/'), 1) - 1, 0)]
$$;

grant usage on schema auth, storage to authenticated, anon, service_role;
grant select on auth.users to authenticated;
grant all on storage.buckets, storage.objects to authenticated, service_role;
