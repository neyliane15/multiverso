-- ============================================================================
-- Multiverso · 0006 · Row Level Security
-- ----------------------------------------------------------------------------
-- Duas regras governam tudo:
--   1. Voce enxerga o seu restaurante. O master enxerga a rede.
--   2. Quem opera lanca contagem e compra; quem administra mexe no cadastro,
--      nos usuarios e na identidade visual.
--
-- Cada tabela filha (itens) e checada pela nota/contagem/lista a que pertence,
-- nunca por um restaurante_id repetido que poderia sair de sincronia.
-- ============================================================================

alter table restaurantes        enable row level security;
alter table perfis              enable row level security;
alter table categorias          enable row level security;
alter table setores             enable row level security;
alter table produtos            enable row level security;
alter table produto_setores     enable row level security;
alter table contagens           enable row level security;
alter table contagem_itens      enable row level security;
alter table fornecedores        enable row level security;
alter table notas_fiscais       enable row level security;
alter table nota_itens          enable row level security;
alter table produto_apelidos    enable row level security;
alter table listas_compras      enable row level security;
alter table lista_compras_itens enable row level security;

-- Views herdam a RLS de quem consulta, e nao do dono. Sem isto uma view seria
-- um tunel por baixo de todas as politicas acima.
alter view vw_produtos_completos     set (security_invoker = on);
alter view vw_contagens_resumo       set (security_invoker = on);
alter view vw_contagem_por_setor     set (security_invoker = on);
alter view vw_compras_historico      set (security_invoker = on);
alter view vw_panorama_restaurantes  set (security_invoker = on);

-- ----------------------------------------------------------- restaurantes --
drop policy if exists restaurantes_ler on restaurantes;
create policy restaurantes_ler on restaurantes for select to authenticated
  using (mv_eh_master() or id = mv_restaurante_atual());

drop policy if exists restaurantes_criar on restaurantes;
create policy restaurantes_criar on restaurantes for insert to authenticated
  with check (mv_eh_master());

-- O admin edita a propria marca (logo, cores, fontes). Nao cria nem apaga.
drop policy if exists restaurantes_editar on restaurantes;
create policy restaurantes_editar on restaurantes for update to authenticated
  using (mv_eh_master() or (id = mv_restaurante_atual() and mv_papel_atual() = 'admin'))
  with check (mv_eh_master() or (id = mv_restaurante_atual() and mv_papel_atual() = 'admin'));

drop policy if exists restaurantes_apagar on restaurantes;
create policy restaurantes_apagar on restaurantes for delete to authenticated
  using (mv_eh_master());

-- ------------------------------------------------------------------ perfis -
drop policy if exists perfis_ler on perfis;
create policy perfis_ler on perfis for select to authenticated
  using (id = auth.uid() or mv_eh_master() or restaurante_id = mv_restaurante_atual());

drop policy if exists perfis_criar on perfis;
create policy perfis_criar on perfis for insert to authenticated
  with check (mv_eh_master() or (restaurante_id = mv_restaurante_atual() and mv_papel_atual() = 'admin'));

-- Cada um edita o proprio cadastro; admin edita a equipe do seu restaurante.
drop policy if exists perfis_editar on perfis;
create policy perfis_editar on perfis for update to authenticated
  using (id = auth.uid() or mv_eh_master()
         or (restaurante_id = mv_restaurante_atual() and mv_papel_atual() = 'admin'))
  with check (id = auth.uid() or mv_eh_master()
         or (restaurante_id = mv_restaurante_atual() and mv_papel_atual() = 'admin'));

drop policy if exists perfis_apagar on perfis;
create policy perfis_apagar on perfis for delete to authenticated
  using (mv_eh_master() or (restaurante_id = mv_restaurante_atual() and mv_papel_atual() = 'admin'));

-- Ninguem promove a si mesmo. A troca de papel e de restaurante so vale se
-- quem esta mexendo puder administrar o destino.
create or replace function mv_guarda_papel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.papel is distinct from old.papel or new.restaurante_id is distinct from old.restaurante_id then
    if not (mv_eh_master() or (mv_papel_atual() = 'admin'
                               and new.restaurante_id = mv_restaurante_atual()
                               and old.restaurante_id = mv_restaurante_atual()
                               and new.papel <> 'master')) then
      raise exception 'sem permissao para alterar papel ou restaurante deste usuario';
    end if;
    if new.id = auth.uid() and not mv_eh_master() then
      raise exception 'um usuario nao pode alterar o proprio papel';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_perfis_guarda_papel on perfis;
create trigger t_perfis_guarda_papel
  before update on perfis
  for each row execute function mv_guarda_papel();

-- ------------------------------------- tabelas com restaurante_id proprio --
-- Ler e lancar: qualquer um do restaurante. Apagar: so quem administra.
do $$
declare t text;
begin
  foreach t in array array['categorias','setores','produtos','fornecedores',
                           'contagens','notas_fiscais','listas_compras','produto_apelidos']
  loop
    execute format('drop policy if exists %1$s_ler on %1$I', t);
    execute format('create policy %1$s_ler on %1$I for select to authenticated
                      using (mv_pode_operar(restaurante_id))', t);

    execute format('drop policy if exists %1$s_criar on %1$I', t);
    execute format('create policy %1$s_criar on %1$I for insert to authenticated
                      with check (mv_pode_operar(restaurante_id))', t);

    execute format('drop policy if exists %1$s_editar on %1$I', t);
    execute format('create policy %1$s_editar on %1$I for update to authenticated
                      using (mv_pode_operar(restaurante_id))
                      with check (mv_pode_operar(restaurante_id))', t);

    execute format('drop policy if exists %1$s_apagar on %1$I', t);
    execute format('create policy %1$s_apagar on %1$I for delete to authenticated
                      using (mv_pode_administrar(restaurante_id))', t);
  end loop;
end $$;

-- ------------------------------------------------ tabelas filhas (itens) ---
-- produto_setores pendura em produtos
drop policy if exists produto_setores_tudo on produto_setores;
create policy produto_setores_tudo on produto_setores for all to authenticated
  using (exists (select 1 from produtos p
                  where p.id = produto_setores.produto_id and mv_pode_operar(p.restaurante_id)))
  with check (exists (select 1 from produtos p
                  where p.id = produto_setores.produto_id and mv_pode_operar(p.restaurante_id)));

drop policy if exists contagem_itens_tudo on contagem_itens;
create policy contagem_itens_tudo on contagem_itens for all to authenticated
  using (exists (select 1 from contagens c
                  where c.id = contagem_itens.contagem_id and mv_pode_operar(c.restaurante_id)))
  with check (exists (select 1 from contagens c
                  where c.id = contagem_itens.contagem_id and mv_pode_operar(c.restaurante_id)));

drop policy if exists nota_itens_tudo on nota_itens;
create policy nota_itens_tudo on nota_itens for all to authenticated
  using (exists (select 1 from notas_fiscais n
                  where n.id = nota_itens.nota_id and mv_pode_operar(n.restaurante_id)))
  with check (exists (select 1 from notas_fiscais n
                  where n.id = nota_itens.nota_id and mv_pode_operar(n.restaurante_id)));

drop policy if exists lista_compras_itens_tudo on lista_compras_itens;
create policy lista_compras_itens_tudo on lista_compras_itens for all to authenticated
  using (exists (select 1 from listas_compras l
                  where l.id = lista_compras_itens.lista_id and mv_pode_operar(l.restaurante_id)))
  with check (exists (select 1 from listas_compras l
                  where l.id = lista_compras_itens.lista_id and mv_pode_operar(l.restaurante_id)));

-- ---------------------------------------------------------------- storage --
-- 'marcas' e publico: o logo aparece na tela de login, antes de existir sessao.
-- 'notas' e privado: XML e PDF de nota so pelo dono.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon'])
on conflict (id) do update set public = true, file_size_limit = 2097152;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas', 'notas', false, 10485760,
        array['application/xml','text/xml','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- Convencao de caminho: <restaurante_id>/<arquivo>. A primeira pasta e o tenant.
drop policy if exists marcas_ler on storage.objects;
create policy marcas_ler on storage.objects for select
  using (bucket_id = 'marcas');

drop policy if exists marcas_escrever on storage.objects;
create policy marcas_escrever on storage.objects for insert to authenticated
  with check (bucket_id = 'marcas' and mv_pode_administrar((storage.foldername(name))[1]::uuid));

drop policy if exists marcas_atualizar on storage.objects;
create policy marcas_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'marcas' and mv_pode_administrar((storage.foldername(name))[1]::uuid));

drop policy if exists marcas_apagar on storage.objects;
create policy marcas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'marcas' and mv_pode_administrar((storage.foldername(name))[1]::uuid));

drop policy if exists notas_arquivos on storage.objects;
create policy notas_arquivos on storage.objects for all to authenticated
  using (bucket_id = 'notas' and mv_pode_operar((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'notas' and mv_pode_operar((storage.foldername(name))[1]::uuid));

-- ------------------------------------------------------------- permissoes --
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
