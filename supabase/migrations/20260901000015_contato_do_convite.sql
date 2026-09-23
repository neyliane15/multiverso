-- ---------------------------------------------------------------------------
-- 0015 · O convite ganha contato
--
-- O convite so guardava e-mail, e e-mail e o que o sistema NAO usa para
-- avisar: nao ha envio. Quem convidava tinha de copiar o recado e procurar o
-- telefone da pessoa em outro lugar — e foi assim que dois convites do Bar do
-- Zeca ficaram parados sem ninguem saber.
--
-- Com o telefone aqui, a tela monta o link do WhatsApp com a mensagem pronta,
-- endereçada aquela pessoa. `perfis.telefone` ja existia desde a 0001, entao o
-- contato sobrevive ao convite ser aceito em vez de se perder no caminho.
--
-- O telefone e OPCIONAL de proposito. Nem toda casa tem o numero de todo
-- mundo, e um convite sem telefone continua valendo — so cai no "copiar o
-- recado", que e o que existia antes.
-- ---------------------------------------------------------------------------

alter table convites add column if not exists telefone text;

comment on column convites.telefone is
  'Contato para avisar do convite, em digitos com DDI (5511999998888). A tela monta o link do WhatsApp a partir dele.';

-- A assinatura muda (parametro novo), e o Postgres nao substitui funcao com
-- lista de argumentos diferente: ele criaria uma SEGUNDA mv_convidar e as
-- chamadas com quatro argumentos ficariam ambiguas.
drop function if exists mv_convidar(text, papel_usuario, uuid, text);

create or replace function mv_convidar(
  p_email        text,
  p_papel        papel_usuario default 'operador',
  p_restaurante  uuid default null,
  p_nome         text default null,
  p_telefone     text default null
) returns convites
language plpgsql security invoker set search_path = public as $$
declare v_linha convites; v_alvo uuid; v_fone text;
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

  -- So digitos. O que chega da tela pode vir com parenteses, traco e espaco, e
  -- guardar "(11) 99999-8888" faria o link do WhatsApp nascer quebrado.
  v_fone := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');

  insert into convites (restaurante_id, email, nome, telefone, papel, criado_por)
  values (v_alvo, lower(p_email), nullif(p_nome, ''), v_fone, p_papel, auth.uid())
  on conflict (lower(email)) where aceito_em is null
  do update set papel = excluded.papel,
                restaurante_id = excluded.restaurante_id,
                nome = excluded.nome,
                telefone = excluded.telefone,
                expira_em = now() + interval '14 days',
                criado_por = excluded.criado_por
  returning * into v_linha;

  return v_linha;
end $$;

grant execute on function mv_convidar(text, papel_usuario, uuid, text, text) to authenticated;

-- O contato segue para o perfil quando o convite e aceito. Sem isto, o numero
-- morre junto com o convite e a equipe fica sem telefone nenhum.
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

  insert into perfis (id, restaurante_id, nome, email, telefone, papel, convite_aceito_em)
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
    v_convite.telefone,
    v_convite.papel,
    now()
  )
  on conflict (id) do nothing;

  update convites
     set aceito_em = now(), aceito_por = new.id
   where id = v_convite.id;

  return new;
end $$;
