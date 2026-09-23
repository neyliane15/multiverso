-- ---------------------------------------------------------------------------
-- Quais migrações já estão no banco?
--
-- Cole este arquivo inteiro no **SQL Editor** do painel do Supabase e rode.
-- Ele não muda nada: só olha se os objetos que cada migração cria já existem.
--
-- "aplicada" = está lá. "FALTA" = aquela migração ainda não entrou, e o que
-- ela habilita não vai funcionar na tela.
--
-- A forma normal de aplicar todas de uma vez é `supabase db push`, que roda
-- só o que falta, na ordem. Este arquivo é para conferir antes e depois.
-- ---------------------------------------------------------------------------
select
  '0011 · estoque de setor' as migracao,
  case when to_regclass('public.estoques') is not null
        and to_regclass('public.produto_estoques') is not null
       then 'aplicada' else 'FALTA' end as situacao,
  'Estoque de Setor no cadastro e na folha de contagem' as o_que_habilita
union all select '0012 · ordem da folha',
  case when exists (select 1 from information_schema.columns
                     where table_name = 'vw_contagem_por_estoque' and column_name = 'setor_ordem')
       then 'aplicada' else 'FALTA' end,
  'A folha segue a ordem dos setores, não a alfabética'
union all select '0013 · refazer a folha',
  case when to_regprocedure('public.mv_refazer_folha(uuid)') is not null
       then 'aplicada' else 'FALTA' end,
  'O botão "Refazer a folha" numa contagem aberta'
union all select '0014 · convite só de admin',
  case when exists (select 1 from pg_policies
                     where tablename = 'convites' and policyname = 'convites_editar'
                       and qual like '%mv_papel_atual%')
       then 'aplicada' else 'FALTA' end,
  'Correção de segurança: gerente não mexe mais em convite'
union all select '0015 · telefone do convite',
  case when exists (select 1 from information_schema.columns
                     where table_name = 'convites' and column_name = 'telefone')
       then 'aplicada' else 'FALTA' end,
  'O campo de contato e o recado pronto do WhatsApp'
union all select '0016 · semear master',
  case when to_regprocedure('public.mv_semear_master(text,text)') is not null
        and pg_get_function_result(to_regprocedure('public.mv_semear_master(text,text)')) = 'text'
       then 'aplicada' else 'FALTA' end,
  'mv_semear_master adota a conta que já existe, sem apagar nada'
order by 1;

-- ---------------------------------------------------------------------------
-- E quem já consegue entrar?
--
-- Cada conta que existe no Auth, com o papel que o sistema vê. Papel
-- "— sem perfil —" é a conta que a tela recebe com "você não tem convite":
-- ela existe no Auth, mas não tem linha em `perfis`.
--
-- Se o seu e-mail aparecer assim, é `mv_semear_master` que resolve — e a 0016
-- fez com que ela adote a conta que já existe, sem apagar nada:
--
--   select mv_semear_master('seu@email.com', 'Seu Nome');
-- ---------------------------------------------------------------------------
select
  u.email,
  coalesce(p.papel::text, '— sem perfil —') as papel,
  coalesce(r.nome, case when p.papel = 'master' then '(a rede inteira)' else '—' end) as restaurante,
  u.email_confirmed_at is not null as email_confirmado,
  p.ultimo_acesso_em,
  exists (select 1 from convites c
           where lower(c.email) = lower(u.email) and c.aceito_em is null) as convite_pendente
from auth.users u
left join perfis p on p.id = u.id
left join restaurantes r on r.id = p.restaurante_id
order by u.created_at;
