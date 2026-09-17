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
begin
  insert into restaurantes (nome, slug) values ('Casa A', 'casa-a') returning id into r_a;
  insert into restaurantes (nome, slug) values ('Casa B', 'casa-b') returning id into r_b;

  -- O trigger em auth.users cria o perfil a partir dos metadados do convite.
  insert into auth.users (id, email, raw_user_meta_data) values
    (u_master,  'master@multiverso.app', jsonb_build_object('nome','Master','papel','master')),
    (u_admin_a, 'admin@casa-a.com',      jsonb_build_object('nome','Admin A','papel','admin','restaurante_id', r_a)),
    (u_oper_a,  'oper@casa-a.com',       jsonb_build_object('nome','Oper A','papel','operador','restaurante_id', r_a)),
    (u_admin_b, 'admin@casa-b.com',      jsonb_build_object('nome','Admin B','papel','admin','restaurante_id', r_b));

  perform conferir('o trigger de auth.users criou os 4 perfis',
                (select count(*) from perfis) = 4);
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
  perform conferir('admin ve so a equipe do proprio restaurante', n = 2);
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
  perform conferir('master ve os 4 usuarios', n = 4);

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

\echo '  --- RLS: todos os casos passaram'
