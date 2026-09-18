-- ============================================================================
-- Usuarios de demonstracao para o ambiente local.
-- ----------------------------------------------------------------------------
-- Nao vai para producao. Existe para que se possa ABRIR o sistema e clicar,
-- com os 854 produtos do Bar do Zeca dentro — que e o unico jeito de descobrir
-- o que so aparece com dado de verdade em volume de verdade.
--
-- A senha nao mora aqui: quem confere e o portao (portao.mjs), que faz o papel
-- do GoTrue. Estas linhas so criam a identidade que o trigger
-- mv_ao_criar_usuario transforma em perfil.
-- ============================================================================

-- O papel vem daqui, e nao dos metadados do cadastro (migracao 0008).
insert into convites (email, nome, papel, restaurante_id) values
  ('master@multiverso.app',    'Master do Multiverso', 'master',   null),
  ('admin@bardozeca.com.br',   'Zeca',                 'admin',    'b0a12eca-0000-4000-8000-000000000001'),
  ('estoque@bardozeca.com.br', 'Dona Neide',           'operador', 'b0a12eca-0000-4000-8000-000000000001')
on conflict do nothing;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'master@multiverso.app',
   jsonb_build_object('nome', 'Master do Multiverso', 'papel', 'master')),
  ('22222222-2222-4222-8222-222222222222', 'admin@bardozeca.com.br',
   jsonb_build_object('nome', 'Zeca', 'papel', 'admin',
                      'restaurante_id', 'b0a12eca-0000-4000-8000-000000000001')),
  ('33333333-3333-4333-8333-333333333333', 'estoque@bardozeca.com.br',
   jsonb_build_object('nome', 'Dona Neide', 'papel', 'operador',
                      'restaurante_id', 'b0a12eca-0000-4000-8000-000000000001'))
on conflict (id) do nothing;

do $$
declare n integer;
begin
  select count(*) into n from perfis;
  if n < 3 then
    raise exception 'esperava 3 perfis criados pelo trigger, encontrei %', n;
  end if;
  raise notice 'usuarios locais prontos: master@multiverso.app, admin@bardozeca.com.br, estoque@bardozeca.com.br';
end $$;
