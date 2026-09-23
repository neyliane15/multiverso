-- ---------------------------------------------------------------------------
-- 0016 · O primeiro master entra sem apagar a propria conta
--
-- `mv_semear_master` criava um CONVITE. Mas o gatilho que transforma convite
-- em perfil roda no INSERT de auth.users — ou seja, so pega quem ainda nao se
-- cadastrou. Quem instalou o sistema, criou a propria conta primeiro e so
-- depois foi semear o master encontrava a porta fechada, e a saida
-- documentada era "apague a conta e cadastre de novo".
--
-- Isso e pedir para a pessoa desfazer o que ela fez certo. A funcao passa a
-- resolver os tres casos com a MESMA chamada:
--
--   conta ja existe, sem perfil  -> cria o perfil de master ali mesmo
--   conta ja existe, com perfil  -> promove aquele perfil a master
--   conta ainda nao existe       -> grava o convite, como antes
--
-- A guarda continua sendo uma so, e e ela que faz isso ser seguro em vez de
-- uma porta dos fundos: SO RODA ENQUANTO NAO HOUVER MASTER NENHUM. Havendo um,
-- a funcao se recusa e manda usar `mv_convidar` — que exige convite, papel e
-- quem convidou.
--
-- E continua `security definer` com execucao revogada de anon, authenticated e
-- public: ninguem alcanca isto pela API. So quem abre o SQL Editor do projeto,
-- que ja e dono do banco.
--
-- Nao se fixa e-mail de ninguem no codigo. Um endereco escrito aqui viraria
-- master automatico em toda copia deste sistema — inclusive nas que nao sao
-- de quem o escreveu.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------- a brecha da semeadura ---
-- `mv_guarda_papel` recusa qualquer troca de papel feita por quem nao e master
-- nem admin — e na semeadura nao ha ninguem logado, entao ela recusa tambem a
-- promocao do primeiro master. Precisa de uma brecha, e brecha em gatilho de
-- seguranca se escreve estreita:
--
--   1. so vale com a marca `mv.semeando` ligada, que unicamente esta funcao
--      liga, e apenas dentro da propria transacao (`set local`);
--   2. E so enquanto NAO HOUVER OUTRO MASTER. Esta e a que importa: mesmo que
--      alguem conseguisse ligar a marca, com um master no sistema ela nao
--      promove ninguem.
--
-- A marca sozinha nao e permissao. As duas juntas descrevem exatamente um
-- momento: a instalacao ainda sem dono.
create or replace function mv_guarda_papel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.papel is distinct from old.papel or new.restaurante_id is distinct from old.restaurante_id then
    if not (mv_eh_master() or (mv_papel_atual() = 'admin'
                               and new.restaurante_id = mv_restaurante_atual()
                               and old.restaurante_id = mv_restaurante_atual()
                               and new.papel <> 'master')
            or (coalesce(current_setting('mv.semeando', true), '') = '1'
                and new.papel = 'master'
                and not exists (select 1 from perfis
                                 where papel = 'master' and id <> new.id))) then
      raise exception 'sem permissao para alterar papel ou restaurante deste usuario';
    end if;
    if new.id = auth.uid() and not mv_eh_master() then
      raise exception 'um usuario nao pode alterar o proprio papel';
    end if;
  end if;
  return new;
end $$;

-- O tipo de retorno muda (era `convites`), e o Postgres nao substitui funcao
-- trocando retorno.
drop function if exists mv_semear_master(text, text);

create or replace function mv_semear_master(p_email text, p_nome text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email   text := lower(trim(p_email));
  v_usuario uuid;
  v_perfil  perfis;
  v_nome    text;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'e-mail invalido: %', p_email;
  end if;

  if exists (select 1 from perfis where papel = 'master') then
    raise exception
      'ja existe um master no sistema; use mv_convidar para chamar mais alguem';
  end if;

  select id into v_usuario from auth.users where lower(email) = v_email;
  v_nome := coalesce(nullif(trim(coalesce(p_nome, '')), ''), split_part(v_email, '@', 1));

  -- Caso 3: ninguem se cadastrou com esse e-mail ainda. Convite, como antes.
  if v_usuario is null then
    insert into convites (email, nome, papel, expira_em)
    values (v_email, v_nome, 'master', now() + interval '30 days')
    on conflict (lower(email)) where aceito_em is null
    do update set papel = 'master', restaurante_id = null,
                  nome = excluded.nome,
                  expira_em = now() + interval '30 days';
    return format('convite de master criado para %s. Agora cadastre-se com esse e-mail.', v_email);
  end if;

  select * into v_perfil from perfis where id = v_usuario;

  -- Caso 2: ja tem perfil (entrou por um convite comum, por exemplo).
  if v_perfil.id is not null then
    -- `set local`: vale so nesta transacao, e some quando ela termina.
    perform set_config('mv.semeando', '1', true);
    update perfis
       set papel = 'master', restaurante_id = null, ativo = true
     where id = v_usuario;
    perform set_config('mv.semeando', '0', true);
    return format('%s era %s e agora e master.', v_email, v_perfil.papel);
  end if;

  -- Caso 1: a conta existe e esta orfa — o caso de quem instalou o sistema e
  -- se cadastrou antes de semear. Perfil de master direto, sem recriar nada.
  insert into perfis (id, restaurante_id, nome, email, papel, convite_aceito_em)
  values (v_usuario, null, v_nome, v_email, 'master', now());

  -- Se houver convite pendente para este e-mail, ele ja cumpriu o papel.
  update convites set aceito_em = now(), aceito_por = v_usuario
   where lower(email) = v_email and aceito_em is null;

  return format('%s agora e master. Recarregue a pagina do sistema.', v_email);
end $$;

comment on function mv_semear_master(text, text) is
  'Faz alguem master da instalacao ENQUANTO NAO HOUVER NENHUM. Serve conta ja criada (com ou sem perfil) e conta que ainda nao existe. Havendo master, recusa e manda usar mv_convidar.';

revoke execute on function mv_semear_master(text, text) from public, authenticated, anon;
