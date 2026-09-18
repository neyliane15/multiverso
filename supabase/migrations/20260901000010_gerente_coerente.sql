-- ============================================================================
-- Multiverso · 0010 · O gerente passa a significar a mesma coisa em toda parte
-- ----------------------------------------------------------------------------
-- A auditoria achou tres definicoes diferentes do que um gerente pode fazer:
-- a rota do app deixava ele entrar em Identidade visual, o mapa de navegacao
-- dizia que nao, e a RLS de `restaurantes` exigia admin. As telas compensavam
-- mostrando "voce esta so olhando", mas a proxima tela penduada na mesma
-- guarda nao herdaria essa gentileza.
--
-- Faltava um caso real: a politica do bucket `marcas` usava mv_pode_administrar,
-- que inclui gerente. Ou seja, o gerente podia TROCAR O ARQUIVO da logomarca,
-- mesmo sem poder gravar o endereco dela na tabela. Meio caminho de permissao
-- e o pior lugar para parar.
--
-- A regra passa a ser uma so: identidade visual e coisa de admin e de master.
-- ============================================================================

drop policy if exists marcas_escrever on storage.objects;
create policy marcas_escrever on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marcas'
    and (mv_eh_master()
         or ((storage.foldername(name))[1]::uuid = mv_restaurante_atual()
             and mv_papel_atual() = 'admin'))
  );

drop policy if exists marcas_atualizar on storage.objects;
create policy marcas_atualizar on storage.objects for update to authenticated
  using (
    bucket_id = 'marcas'
    and (mv_eh_master()
         or ((storage.foldername(name))[1]::uuid = mv_restaurante_atual()
             and mv_papel_atual() = 'admin'))
  );

drop policy if exists marcas_apagar on storage.objects;
create policy marcas_apagar on storage.objects for delete to authenticated
  using (
    bucket_id = 'marcas'
    and (mv_eh_master()
         or ((storage.foldername(name))[1]::uuid = mv_restaurante_atual()
             and mv_papel_atual() = 'admin'))
  );

comment on function mv_pode_administrar(uuid) is
  'Pode mexer no CADASTRO do restaurante (apagar produto, categoria, setor, fornecedor). Inclui gerente. NAO cobre identidade visual nem equipe — essas exigem admin, e as politicas de restaurantes, perfis e do bucket marcas conferem o papel diretamente.';
