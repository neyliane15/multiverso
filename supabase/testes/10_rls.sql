-- ============================================================================
-- Teste de RLS: dois restaurantes, quatro usuarios, e a pergunta que importa —
-- alguem consegue enxergar ou mexer no que nao e seu?
-- ----------------------------------------------------------------------------
-- Cada bloco troca de usuario com `set local role authenticated` +
-- request.jwt.claim.sub, que e como o PostgREST executa a requisicao de
-- verdade. Rodar como postgres nao provaria nada: superusuario ignora RLS.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;   -- para que os 'ok' aparecam

-- Funcao, e nao procedure: CALL nao aceita subconsulta como argumento, e
-- praticamente toda afirmacao aqui e uma contagem feita na hora.
create or replace function conferir(descricao text, condicao boolean)
returns void language plpgsql as $$
begin
  if condicao then
    raise notice '  ok   %', descricao;
  else
    raise exception 'FALHOU: %', descricao;
  end if;
end $$;

-- ------------------------------------------------------------- cenario -----
do $$
declare
  r_a uuid; r_b uuid;
  u_master uuid := '00000000-0000-0000-0000-0000000000aa';
  u_admin_a uuid := '00000000-0000-0000-0000-0000000000a1';
  u_oper_a  uuid := '00000000-0000-0000-0000-0000000000a2';
  u_admin_b uuid := '00000000-0000-0000-0000-0000000000b1';
  u_ger_a   uuid := '00000000-0000-0000-0000-0000000000a3';
begin
  insert into restaurantes (nome, slug) values ('Casa A', 'casa-a') returning id into r_a;
  insert into restaurantes (nome, slug) values ('Casa B', 'casa-b') returning id into r_b;

  -- Quem decide papel e restaurante e o convite, gravado antes. Os metadados
  -- do cadastro nao decidem nada (ver migracao 0008).
  insert into convites (email, nome, papel, restaurante_id) values
    ('master@multiverso.app', 'Master', 'master',   null),
    ('admin@casa-a.com',      'Admin A', 'admin',    r_a),
    ('oper@casa-a.com',       'Oper A',  'operador', r_a),
    ('ger@casa-a.com',        'Ger A',   'gerente',  r_a),
    ('admin@casa-b.com',      'Admin B', 'admin',    r_b);

  insert into auth.users (id, email, raw_user_meta_data) values
    (u_master,  'master@multiverso.app', jsonb_build_object('nome','Master','papel','master')),
    (u_admin_a, 'admin@casa-a.com',      jsonb_build_object('nome','Admin A','papel','admin','restaurante_id', r_a)),
    (u_oper_a,  'oper@casa-a.com',       jsonb_build_object('nome','Oper A','papel','operador','restaurante_id', r_a)),
    (u_ger_a,   'ger@casa-a.com',        jsonb_build_object('nome','Ger A','papel','gerente','restaurante_id', r_a)),
    (u_admin_b, 'admin@casa-b.com',      jsonb_build_object('nome','Admin B','papel','admin','restaurante_id', r_b));

  perform conferir('o trigger de auth.users criou os 5 perfis',
                (select count(*) from perfis) = 5);
  perform conferir('o master ficou sem restaurante',
                (select restaurante_id is null from perfis where id = u_master));

  -- Cadastro basico dos dois restaurantes, feito ainda como postgres.
  insert into categorias (restaurante_id, nome) values (r_a, 'Carnes'), (r_b, 'Carnes');
  insert into setores    (restaurante_id, nome) values (r_a, 'Bar'),    (r_b, 'Bar');
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  select r_a, 'Picanha', 'KG', 79.90, id from categorias where restaurante_id = r_a;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  select r_b, 'Fraldinha', 'KG', 49.90, id from categorias where restaurante_id = r_b;

  -- Escopado aos dois restaurantes deste teste. Sem isto, o join alcancaria
  -- tambem o catalogo carregado pela seed e colidiria com os vinculos dela.
  insert into produto_setores (produto_id, setor_id, unidade, custo)
  select p.id, s.id, 'KG', p.custo_medio
    from produtos p
    join setores s on s.restaurante_id = p.restaurante_id
   where p.restaurante_id in (r_a, r_b);
end $$;

-- ------------------------------------------- guarda de tenant cruzado ------
do $$
declare v_produto_a uuid; v_setor_b uuid; v_erro text;
begin
  select id into v_produto_a from produtos where nome = 'Picanha';
  select s.id into v_setor_b from setores s
    join restaurantes r on r.id = s.restaurante_id where r.slug = 'casa-b';
  begin
    insert into produto_setores (produto_id, setor_id) values (v_produto_a, v_setor_b);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('vincular produto da Casa A a setor da Casa B e recusado',
                v_erro like '%restaurantes diferentes%');
end $$;

-- ----------------------------------------------- o operador da Casa A ------
do $$
declare n integer; v_erro text; r_b uuid;
begin
  select id into r_b from restaurantes where slug = 'casa-b';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);

  select count(*) into n from produtos;
  perform conferir('operador da Casa A ve 1 produto (o dele)', n = 1);
  -- (a seed do Bar do Zeca, se carregada, fica invisivel daqui — e o ponto)

  select count(*) into n from produtos where nome = 'Fraldinha';
  perform conferir('operador da Casa A nao ve produto da Casa B', n = 0);

  select count(*) into n from restaurantes;
  perform conferir('operador da Casa A ve 1 restaurante', n = 1);

  -- Escrever no tenant alheio tem de falhar, e falha em silencio no INSERT:
  -- o WITH CHECK rejeita a linha.
  begin
    insert into produtos (restaurante_id, nome) values (r_b, 'Intruso');
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('operador nao consegue inserir produto na Casa B', v_erro is not null);

  -- Operador lanca, mas nao apaga cadastro.
  delete from produtos where nome = 'Picanha';
  get diagnostics n = row_count;
  perform conferir('operador nao apaga produto (policy de delete exige admin)', n = 0);

  -- E nao se promove.
  begin
    update perfis set papel = 'admin' where id = auth.uid();
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('operador nao muda o proprio papel', v_erro is not null);
  reset role;
end $$;

-- -------------------------------------------------- o admin da Casa A ------
do $$
declare n integer; v_erro text; r_b uuid;
begin
  select id into r_b from restaurantes where slug = 'casa-b';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

  update restaurantes set cor_primaria = '#112233' where slug = 'casa-a';
  perform conferir('admin troca a cor do proprio restaurante',
                (select cor_primaria from restaurantes where slug = 'casa-a') = '#112233');

  -- Conferir pelo valor nao serviria: deste assento a Casa B nem aparece, e a
  -- leitura voltaria NULL. Quem prova e o numero de linhas que o UPDATE tocou.
  update restaurantes set cor_primaria = '#999999' where id = r_b;
  get diagnostics n = row_count;
  perform conferir('admin nao troca a cor do restaurante alheio (0 linhas)', n = 0);

  delete from produtos where nome = 'Picanha';
  perform conferir('admin apaga produto do proprio restaurante',
                (select count(*) from produtos where nome = 'Picanha') = 0);

  begin
    insert into restaurantes (nome, slug) values ('Casa C', 'casa-c');
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('admin nao cria restaurante novo (so o master cria)', v_erro is not null);

  select count(*) into n from perfis;
  -- Casa A tem admin, operador e gerente. O master e o admin da Casa B ficam
  -- de fora — e e esse o ponto.
  perform conferir('admin ve so a equipe do proprio restaurante', n = 3);
  reset role;
end $$;

-- ------------------------------------------------------------ o master -----
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);

  -- Contagem exata acoplaria o teste a presenca da seed. O que importa e que
  -- o master alcance os dois restaurantes deste cenario, e nao so o proprio.
  select count(*) into n from restaurantes where slug in ('casa-a', 'casa-b');
  perform conferir('master ve os 2 restaurantes do cenario', n = 2);

  select count(*) into n from perfis;
  perform conferir('master ve os 5 usuarios', n = 5);

  select count(*) into n from vw_panorama_restaurantes where slug in ('casa-a', 'casa-b');
  perform conferir('panorama da rede traz os 2 restaurantes', n = 2);

  select count(*) into n from restaurantes;
  insert into restaurantes (nome, slug) values ('Casa C', 'casa-c');
  perform conferir('master cria restaurante', (select count(*) from restaurantes) = n + 1);
  reset role;
end $$;

-- --------------------------------------- views nao furam a RLS -------------
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  select count(*) into n from vw_produtos_completos;
  perform conferir('vw_produtos_completos respeita o tenant (security_invoker)', n = 1);
  select count(*) into n from vw_panorama_restaurantes;
  perform conferir('vw_panorama_restaurantes nao vaza a rede para um admin', n = 1);
  reset role;
end $$;

-- ------------------------------- cadastrar-se nao da poder nenhum ----------
do $$
declare n integer; v_invasor uuid := '99999999-9999-4999-8999-000000000001';
begin
  -- Isto e exatamente o que supabase.auth.signUp({options:{data:{...}}}) grava.
  -- Antes da migracao 0008 esta linha fazia um visitante virar master da rede.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_invasor, 'invasor@exemplo.com',
          jsonb_build_object('nome', 'Invasor', 'papel', 'master',
                             'restaurante_id', (select id from restaurantes where slug = 'casa-a')));

  select count(*) into n from perfis where id = v_invasor;
  perform conferir('cadastro sem convite nao ganha perfil', n = 0);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_invasor), true);

  perform conferir('e nao vira master por pedir', not mv_eh_master());
  select count(*) into n from restaurantes;
  perform conferir('nem enxerga restaurante nenhum', n = 0);
  select count(*) into n from produtos;
  perform conferir('nem produto nenhum', n = 0);
  reset role;
end $$;

-- ------------------------------ o convite decide, o cadastro nao -----------
do $$
declare r_a uuid; v_novo uuid := '99999999-9999-4999-8999-000000000002';
begin
  select id into r_a from restaurantes where slug = 'casa-a';
  insert into convites (email, nome, papel, restaurante_id)
  values ('convidado@casa-a.com', 'Convidado', 'operador', r_a);

  -- O cadastro tenta forcar master. O convite diz operador.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_novo, 'convidado@casa-a.com', jsonb_build_object('papel', 'master'));

  perform conferir('o papel vem do convite, nao do cadastro',
    (select papel from perfis where id = v_novo) = 'operador');
  perform conferir('e o restaurante tambem',
    (select restaurante_id from perfis where id = v_novo) = r_a);
  perform conferir('o convite fica marcado como consumido',
    (select aceito_em is not null from convites where email = 'convidado@casa-a.com'));
end $$;

-- ------------------------------- quem pode convidar quem -------------------
do $$
declare r_a uuid; r_b uuid; v_erro text;
begin
  select id into r_a from restaurantes where slug = 'casa-a';
  select id into r_b from restaurantes where slug = 'casa-b';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

  begin
    insert into convites (email, papel, restaurante_id) values ('x@x.com', 'master', null);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('admin nao convida master', v_erro is not null);

  begin
    insert into convites (email, papel, restaurante_id) values ('y@y.com', 'admin', r_b);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('admin nao convida para o restaurante alheio', v_erro is not null);

  insert into convites (email, papel, restaurante_id) values ('z@casa-a.com', 'gerente', r_a);
  perform conferir('admin convida para o proprio restaurante',
    (select count(*) from convites where email = 'z@casa-a.com') = 1);
  reset role;
end $$;

do $$
declare n integer; v_erro text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  begin
    insert into convites (email, papel, restaurante_id)
    values ('w@casa-a.com', 'operador', mv_restaurante_atual());
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('operador nao convida ninguem', v_erro is not null);

  select count(*) into n from convites;
  perform conferir('operador nao le os convites do restaurante', n = 0);
  reset role;
end $$;

do $$
declare n integer; v_erro text; r_a uuid;
begin
  select id into r_a from restaurantes where slug = 'casa-a';

  -- Um convite pendente, criado pelo admin da casa.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  insert into convites (email, papel, restaurante_id)
  values ('alvo@casa-a.com', 'operador', r_a);
  reset role;

  -- ---------------------------------------------------- o gerente e equipe --
  -- mv_pode_administrar inclui gerente, e por isso ela NAO serve para decidir
  -- quem mexe em equipe (ver o comentario da 0010). As politicas de UPDATE e
  -- DELETE de convites usavam ela sozinha, e o furo so aparecia SEM clausula
  -- WHERE: com WHERE, o Postgres aplica junto a politica de SELECT — que ja
  -- barrava o gerente — e a linha simplesmente nao era encontrada. Sem WHERE
  -- nao ha coluna para ler, a politica de SELECT sai de cena, e passava.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);

  perform conferir('o gerente e mesmo gerente', mv_papel_atual() = 'gerente');
  perform conferir('e mv_pode_administrar diz sim para ele',
    mv_pode_administrar(mv_restaurante_atual()));

  select count(*) into n from convites;
  perform conferir('gerente nao le convite nenhum', n = 0);

  begin
    perform mv_convidar('novo@casa-a.com', 'operador');
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('gerente nao convida ninguem', v_erro is not null);

  -- O caso que escapou: promover um convite a admin sem WHERE nenhum.
  update convites set papel = 'admin';
  get diagnostics n = row_count;
  perform conferir('gerente nao promove convite a admin (update sem where)', n = 0);

  delete from convites;
  get diagnostics n = row_count;
  perform conferir('gerente nao varre os convites (delete sem where)', n = 0);
  reset role;

  perform conferir('e o convite continua como o admin o deixou',
    (select papel from convites where email = 'alvo@casa-a.com') = 'operador');

  -- ------------------------------------------- convite aceito e historico --
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

  delete from convites where email = 'oper@casa-a.com';
  get diagnostics n = row_count;
  perform conferir('nem o admin apaga convite ja aceito', n = 0);

  update convites set papel = 'admin' where email = 'oper@casa-a.com';
  get diagnostics n = row_count;
  perform conferir('nem o admin reescreve convite ja aceito', n = 0);

  -- ---------------------------------------------- o admin segue podendo ----
  update convites set papel = 'gerente' where email = 'alvo@casa-a.com';
  get diagnostics n = row_count;
  perform conferir('admin edita convite pendente do proprio restaurante', n = 1);

  begin
    update convites set papel = 'master', restaurante_id = null
     where email = 'alvo@casa-a.com';
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('admin nao promove convite a master', v_erro is not null);

  delete from convites where email = 'alvo@casa-a.com';
  get diagnostics n = row_count;
  perform conferir('admin apaga convite pendente', n = 1);
  reset role;

  -- ------------------------------------------------------- o operador ------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  update convites set papel = 'admin';
  get diagnostics n = row_count;
  perform conferir('operador nao toca em convite (update sem where)', n = 0);
  delete from convites;
  get diagnostics n = row_count;
  perform conferir('operador nao apaga convite (delete sem where)', n = 0);
  reset role;
end $$;

\echo '  --- RLS: todos os casos passaram'
