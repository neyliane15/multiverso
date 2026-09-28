-- ---------------------------------------------------------------------------
-- 0018 · Operador de setor
--
-- Quem conta o bar nao precisa — e nao deve — enxergar o CMV, as notas, a
-- equipe, nem a contagem da cozinha. Este arquivo cria o acesso mais estreito
-- do sistema: uma pessoa, um ou mais setores, uma tela.
--
-- Tres decisoes que valem o comentario:
--
-- 1. **Nao entrou papel novo no enum.** "Operador Bar" parece um papel, mas
--    Bar e um SETOR — dado de um restaurante, nao conceito do sistema. Um enum
--    com `operador_bar` obrigaria a migracao nova a cada cliente que tivesse
--    "Salao" ou "Confeitaria", e daria a todos os outros clientes papeis que
--    nao significam nada para eles. O papel continua `operador`; o que muda e
--    a lista de setores que ele enxerga. A tela monta "Operador — Bar" a
--    partir dos setores DAQUELE restaurante, entao a pessoa ve exatamente o
--    que pediu, e o proximo cliente ve os setores dele.
--
-- 2. **A restricao vale no banco, nao na tela.** Esconder o menu e conforto;
--    o que impede o operador do bar de ler a contagem da cozinha e a RLS. Sem
--    ela, bastaria trocar o endereco no navegador.
--
-- 3. **Login sem e-mail.** Estes acessos sao de casa — "Operador Bar", nao um
--    e-mail que a pessoa consulta. O GoTrue exige e-mail, entao a conta nasce
--    com um endereco sintetico e o nome de usuario vira a chave de entrada.
--    `mv_email_de_login` so resolve quem TEM nome de usuario, ou seja, so
--    essas contas sinteticas — o e-mail de ninguem de verdade sai daqui.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------- login por nome de usuario -
alter table perfis add column if not exists usuario text;

create unique index if not exists perfis_usuario_unico
  on perfis (lower(mv_sem_acento(usuario))) where usuario is not null;

comment on column perfis.usuario is
  'Nome de entrada dos acessos de casa ("Operador Bar"). Nulo para quem entra por e-mail.';

-- ----------------------------------------------- os setores de um operador --
create table if not exists perfil_setores (
  perfil_id uuid not null references perfis(id)  on delete cascade,
  setor_id  uuid not null references setores(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, setor_id)
);

create index if not exists perfil_setores_setor_idx on perfil_setores (setor_id);

comment on table perfil_setores is
  'Setores que o operador enxerga. Sem linha nenhuma = sem restricao.';

-- Perfil e setor do mesmo restaurante. Sem isto, um operador de um cliente
-- poderia ser preso a um setor de outro — e ai a restricao viraria um furo.
create or replace function mv_valida_perfil_setor()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_perfil uuid; v_setor uuid; v_papel papel_usuario;
begin
  select restaurante_id, papel into v_perfil, v_papel from perfis  where id = new.perfil_id;
  select restaurante_id        into v_setor            from setores where id = new.setor_id;
  if v_perfil is null or v_setor is null or v_perfil <> v_setor then
    raise exception 'perfil e setor de restaurantes diferentes';
  end if;
  -- Prender um master ou um admin a um setor nao faria sentido e esconderia
  -- deles a propria administracao.
  if v_papel in ('master', 'admin') then
    raise exception 'master e admin nao se prendem a setor';
  end if;
  return new;
end $$;

drop trigger if exists t_perfil_setores_valida on perfil_setores;
create trigger t_perfil_setores_valida
  before insert or update on perfil_setores
  for each row execute function mv_valida_perfil_setor();

-- ------------------------------------------------------------- as perguntas -
/**
 * Este usuario esta preso a setores?
 *
 * `security definer` porque le `perfil_setores` de dentro das politicas que
 * protegem a propria tabela — sem isso a pergunta se responderia sozinha com
 * "nao ha linha nenhuma", e a restricao sumiria.
 */
create or replace function mv_restrito_a_setores()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil_setores where perfil_id = auth.uid())
$$;

/** Este setor esta no alcance de quem esta perguntando? */
create or replace function mv_pode_ver_setor(p_setor uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select mv_eh_master()
      or not exists (select 1 from perfil_setores where perfil_id = auth.uid())
      or exists (select 1 from perfil_setores
                  where perfil_id = auth.uid() and setor_id = p_setor)
$$;

-- ------------------------------------------------------------------- a rls --
alter table perfil_setores enable row level security;

-- Cada um ve a propria lista; quem manda em equipe ve e mexe na dos outros.
drop policy if exists perfil_setores_ler on perfil_setores;
create policy perfil_setores_ler on perfil_setores for select to authenticated
  using (perfil_id = auth.uid()
         or exists (select 1 from perfis p
                     where p.id = perfil_setores.perfil_id
                       and (mv_eh_master()
                            or (mv_papel_atual() = 'admin'
                                and p.restaurante_id = mv_restaurante_atual()))));

drop policy if exists perfil_setores_mexer on perfil_setores;
create policy perfil_setores_mexer on perfil_setores for all to authenticated
  using (exists (select 1 from perfis p
                  where p.id = perfil_setores.perfil_id
                    and (mv_eh_master()
                         or (mv_papel_atual() = 'admin'
                             and p.restaurante_id = mv_restaurante_atual()))))
  with check (exists (select 1 from perfis p
                       where p.id = perfil_setores.perfil_id
                         and (mv_eh_master()
                              or (mv_papel_atual() = 'admin'
                                  and p.restaurante_id = mv_restaurante_atual()))));

-- O setor: o operador preso so enxerga os seus. E o que faz a navegacao da
-- contagem nascer com uma parada so, sem precisar de filtro na tela.
drop policy if exists setores_ler on setores;
create policy setores_ler on setores for select to authenticated
  using (mv_pode_operar(restaurante_id) and mv_pode_ver_setor(id));

-- A linha da contagem: a regra que de fato tranca a porta. Vale para ler e
-- para gravar — o operador do bar nao lanca quantidade na cozinha nem por
-- engano nem por endereco digitado na mao.
drop policy if exists contagem_itens_tudo on contagem_itens;
create policy contagem_itens_tudo on contagem_itens for all to authenticated
  using (mv_pode_ver_setor(contagem_itens.setor_id)
         and exists (select 1 from contagens c
                      where c.id = contagem_itens.contagem_id
                        and mv_pode_operar(c.restaurante_id)))
  with check (mv_pode_ver_setor(contagem_itens.setor_id)
              and exists (select 1 from contagens c
                           where c.id = contagem_itens.contagem_id
                             and mv_pode_operar(c.restaurante_id)));

-- Abrir, fechar e reabrir contagem continua sendo de quem enxerga a casa
-- inteira: quem conta um setor nao decide o calendario dos outros.
drop policy if exists contagens_criar on contagens;
create policy contagens_criar on contagens for insert to authenticated
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists contagens_editar on contagens;
create policy contagens_editar on contagens for update to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores())
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

-- --------------------------------------------------------- entrar sem e-mail -
/**
 * O e-mail sintetico de um nome de usuario, para a tela de entrada trocar um
 * pelo outro antes de chamar o GoTrue.
 *
 * `anon` pode executar — tem de poder, e chamado antes de existir sessao. O
 * que ele devolve nunca e o e-mail de uma pessoa: so tem `usuario` quem foi
 * criado como acesso de casa, e esses enderecos sao sinteticos e nao recebem
 * mensagem nenhuma.
 */
create or replace function mv_email_de_login(p_usuario text)
returns text
language sql stable security definer set search_path = public as $$
  select u.email
    from perfis p
    join auth.users u on u.id = p.id
   where p.usuario is not null
     and p.ativo
     and lower(mv_sem_acento(p.usuario)) = lower(mv_sem_acento(btrim(p_usuario)))
$$;

grant select, insert, update, delete on perfil_setores to authenticated;
grant execute on function mv_restrito_a_setores() to authenticated;
grant execute on function mv_pode_ver_setor(uuid) to authenticated;
grant execute on function mv_email_de_login(text) to anon, authenticated;
