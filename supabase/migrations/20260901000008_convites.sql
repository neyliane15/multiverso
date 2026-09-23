-- ============================================================================
-- Multiverso · 0008 · O papel para de vir do navegador
-- ----------------------------------------------------------------------------
-- FALHA CORRIGIDA AQUI (critica, encontrada em auditoria e reproduzida):
--
--   mv_ao_criar_usuario lia `papel` e `restaurante_id` de raw_user_meta_data —
--   que e literalmente o `options.data` de supabase.auth.signUp(), escolhido
--   pelo navegador. Com cadastro aberto, bastava:
--
--     supabase.auth.signUp({ email, password,
--                            options: { data: { papel: 'master' } } })
--
--   e a conta nascia master da rede inteira. Reproduzido: o invasor passava a
--   enxergar todos os restaurantes, os 854 produtos e todos os usuarios.
--
--   A RLS estava correta. O problema era que o papel que ela consulta era
--   escolhido por quem se cadastrava, antes de qualquer politica rodar.
--
-- A CORRECAO: quem decide papel e restaurante e um CONVITE, gravado antes por
-- alguem que ja tinha esse poder. Sem convite valido, a conta existe no auth e
-- **nao ganha perfil** — e sem perfil, mv_papel_atual() e mv_restaurante_atual()
-- voltam nulos e toda politica nega. Cadastrar-se sozinho deixa de ser um
-- caminho para dentro.
--
-- Como efeito colateral bom, o convite deixa de precisar da service role: o
-- admin convida pela propria tela, sob RLS, e a pessoa se cadastra depois.
-- ============================================================================

create table if not exists convites (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid references restaurantes(id) on delete cascade,
  email          text not null,
  nome           text,
  papel          papel_usuario not null default 'operador',
  criado_por     uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null default now() + interval '14 days',
  aceito_em      timestamptz,
  aceito_por     uuid references auth.users(id) on delete set null,

  -- Mesma coerencia que perfis exige: master nao pertence a restaurante.
  constraint convite_tenant_coerente check (
    (papel = 'master' and restaurante_id is null) or
    (papel <> 'master' and restaurante_id is not null)
  )
);

-- Um convite em aberto por e-mail. Dois convites pendentes para a mesma pessoa
-- com papeis diferentes seria uma corrida decidindo o poder de alguem.
create unique index if not exists convites_email_pendente
  on convites (lower(email)) where aceito_em is null;
create index if not exists convites_restaurante_idx on convites (restaurante_id);

comment on table convites is
  'Quem pode ser o que, decidido ANTES do cadastro por quem ja tinha esse poder. Sem convite, a conta nao ganha perfil e nao enxerga nada.';

-- ------------------------------------------------ o trigger, sem confiar ---
create or replace function mv_ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_convite convites;
begin
  select * into v_convite
    from convites
   where lower(email) = lower(new.email)
     and aceito_em is null
     and expira_em > now()
   order by criado_em desc
   limit 1;

  -- Sem convite a conta fica orfa de proposito: existe no auth, nao tem perfil,
  -- e por isso nao enxerga linha nenhuma. E o estado seguro, nao um erro.
  if v_convite.id is null then
    return new;
  end if;

  insert into perfis (id, restaurante_id, nome, email, papel, convite_aceito_em)
  values (
    new.id,
    v_convite.restaurante_id,
    coalesce(
      nullif(v_convite.nome, ''),
      -- O nome pode vir do cadastro: e so exibicao, nao decide poder nenhum.
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    v_convite.papel,
    now()
  )
  on conflict (id) do nothing;

  update convites
     set aceito_em = now(), aceito_por = new.id
   where id = v_convite.id;

  return new;
end $$;

-- ------------------------------------------------------- convidar ----------
-- security invoker: a RLS de `convites` decide se quem chama pode convidar.
create or replace function mv_convidar(
  p_email        text,
  p_papel        papel_usuario default 'operador',
  p_restaurante  uuid default null,
  p_nome         text default null
) returns convites
language plpgsql security invoker set search_path = public as $$
declare v_linha convites; v_alvo uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'e-mail invalido: %', p_email;
  end if;

  -- Master convida para qualquer restaurante; os demais, so para o proprio.
  v_alvo := case when p_papel = 'master' then null
                 else coalesce(p_restaurante, mv_restaurante_atual()) end;

  if exists (select 1 from perfis where lower(email) = lower(p_email)) then
    raise exception 'ja existe um usuario com o e-mail %', p_email;
  end if;

  insert into convites (restaurante_id, email, nome, papel, criado_por)
  values (v_alvo, lower(p_email), nullif(p_nome, ''), p_papel, auth.uid())
  on conflict (lower(email)) where aceito_em is null
  do update set papel = excluded.papel,
                restaurante_id = excluded.restaurante_id,
                nome = excluded.nome,
                expira_em = now() + interval '14 days',
                criado_por = excluded.criado_por
  returning * into v_linha;

  return v_linha;
end $$;

-- ------------------------------------------------------------- RLS ---------
alter table convites enable row level security;

-- Ler convite e ver quem esta sendo contratado e com que poder. Quem convida,
-- ve; o resto da equipe nao precisa saber — e nao e assunto de operador.
drop policy if exists convites_ler on convites;
create policy convites_ler on convites for select to authenticated
  using (mv_eh_master() or (mv_pode_administrar(restaurante_id)
                            and mv_papel_atual() in ('master', 'admin')));

-- Quem convida precisa poder administrar o destino, e ninguem cria um master
-- alem do proprio master. E a mesma regra de mv_guarda_papel, aplicada antes.
drop policy if exists convites_criar on convites;
create policy convites_criar on convites for insert to authenticated
  with check (
    (papel = 'master' and mv_eh_master())
    or (papel <> 'master' and mv_pode_administrar(restaurante_id)
        and mv_papel_atual() in ('master', 'admin'))
  );

drop policy if exists convites_editar on convites;
create policy convites_editar on convites for update to authenticated
  using (aceito_em is null and (mv_eh_master() or mv_pode_administrar(restaurante_id)))
  with check (
    (papel = 'master' and mv_eh_master())
    or (papel <> 'master' and mv_pode_administrar(restaurante_id))
  );

drop policy if exists convites_apagar on convites;
create policy convites_apagar on convites for delete to authenticated
  using (mv_eh_master() or mv_pode_administrar(restaurante_id));

grant select, insert, update, delete on convites to authenticated;

-- ------------------------------------------------------ primeiro master ----
-- Ovo e galinha: nao ha master para convidar o primeiro master. O primeiro
-- convite e semeado fora da RLS, por quem tem acesso ao banco (migracao, psql
-- ou service role). Depois disso, a cadeia se sustenta sozinha.
-- O `drop` e para a SEGUNDA passada: uma migracao posterior muda o formato do
-- retorno desta funcao, e `create or replace function` recusa mudar retorno.
-- Reaplicar esta migracao num banco ja adiantado — o que o `supabase db push`
-- faz sempre que o historico de migracoes esta atras do banco — morria em
-- "cannot change return type of existing function", levando junto a migracao
-- inteira. Quem depende do formato novo e a migracao que o introduziu, e ela
-- roda logo depois desta, na mesma passada.
drop function if exists mv_semear_master(text, text);

create or replace function mv_semear_master(p_email text, p_nome text default null)
returns convites
language plpgsql security definer set search_path = public as $$
declare v_linha convites;
begin
  if exists (select 1 from perfis where papel = 'master') then
    raise exception 'ja existe um master no sistema; use mv_convidar';
  end if;
  insert into convites (email, nome, papel, expira_em)
  values (lower(p_email), nullif(p_nome, ''), 'master', now() + interval '30 days')
  on conflict (lower(email)) where aceito_em is null
  do update set papel = 'master', restaurante_id = null,
                expira_em = now() + interval '30 days'
  returning * into v_linha;
  return v_linha;
end $$;

-- Ninguem alcanca isto pelo navegador: e so para quem ja esta dentro do banco.
revoke execute on function mv_semear_master(text, text) from public, authenticated, anon;
