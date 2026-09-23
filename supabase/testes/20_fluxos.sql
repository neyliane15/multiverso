-- ============================================================================
-- Teste dos fluxos: abrir e fechar contagem, lancar nota, e o CMV saindo certo
-- do outro lado.
-- ----------------------------------------------------------------------------
-- O numero que este arquivo persegue e um so:
--        CMV = Estoque Inicial + Compras − Estoque Final
-- Com valores redondos, de proposito, para que a conta possa ser conferida de
-- cabeca: 1000 + 300 − 700 = 600.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Um restaurante limpo, so para este arquivo.
do $$
declare r uuid; u uuid := '00000000-0000-0000-0000-0000000000f1';
        c_carnes uuid; s_bar uuid; s_cozinha uuid; p1 uuid; p2 uuid;
begin
  insert into restaurantes (nome, slug) values ('Casa de Teste', 'casa-teste') returning id into r;
  insert into convites (email, nome, papel, restaurante_id)
  values ('chef@casa-teste.com', 'Chef', 'admin', r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (u, 'chef@casa-teste.com', jsonb_build_object('nome','Chef'));

  insert into categorias (restaurante_id, nome, ordem) values (r, 'Carnes', 1) returning id into c_carnes;
  insert into setores (restaurante_id, nome, ordem) values (r, 'Bar', 1) returning id into s_bar;
  insert into setores (restaurante_id, nome, ordem) values (r, 'Cozinha', 2) returning id into s_cozinha;

  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Picanha', 'KG', 100, c_carnes) returning id into p1;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Cerveja', 'UND', 10, c_carnes) returning id into p2;

  -- A picanha vive nos dois setores, com custo diferente em cada um: e o caso
  -- que o sistema inteiro existe para tratar.
  insert into produto_setores (produto_id, setor_id, unidade, custo) values
    (p1, s_cozinha, 'KG',  100),
    (p1, s_bar,     'KG',   80),
    (p2, s_bar,     'UND',  10);
end $$;

-- ------------------------------------------------- abrir e fechar ----------
do $$
declare r uuid; n integer; v_id uuid; v_contagem contagens; v_erro text;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  -- ESTOQUE INICIAL: 10kg de picanha na cozinha (1000) e nada mais.
  v_id := mv_abrir_contagem(r, date '2026-08-01', 'mensal', 'Inicial');
  select count(*) into n from contagem_itens where contagem_id = v_id;
  perform conferir('abrir contagem cria uma linha por produto x setor (3)', n = 3);

  perform conferir('a linha do bar herdou o custo do bar, nao o do produto',
    (select custo_unitario from contagem_itens ci
      join setores s on s.id = ci.setor_id
     where ci.contagem_id = v_id and s.nome = 'Bar'
       and ci.produto_id = (select id from produtos where nome = 'Picanha')) = 80);

  update contagem_itens set quantidade = 10
   where contagem_id = v_id
     and produto_id = (select id from produtos where nome = 'Picanha')
     and setor_id = (select id from setores where nome = 'Cozinha');

  perform conferir('o total da linha e quantidade x custo (coluna gerada)',
    (select total from contagem_itens
      where contagem_id = v_id and quantidade = 10) = 1000);

  v_contagem := mv_fechar_contagem(v_id);
  perform conferir('fechar congela o total em 1000', v_contagem.total = 1000);
  perform conferir('fechar conta 1 item preenchido', v_contagem.itens_contados = 1);
  perform conferir('fechar carimba a data', v_contagem.fechada_em is not null);

  -- Contagem fechada e foto: nao se mexe mais.
  begin
    update contagem_itens set quantidade = 999 where contagem_id = v_id;
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('contagem fechada recusa alteracao de item',
                   v_erro like '%ja fechada%');

  -- Fechar de novo nao deve passar em branco.
  begin
    perform mv_fechar_contagem(v_id);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('fechar duas vezes e recusado', v_erro is not null);
  reset role;
end $$;

-- -------------------------------------------------- compras e custo --------
do $$
declare r uuid; f uuid; nota uuid; p_picanha uuid; v_erro text; v_nota notas_fiscais;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into p_picanha from produtos where nome = 'Picanha';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  insert into fornecedores (restaurante_id, nome, documento)
  values (r, 'Frigorifico do Zeca', '11222333000181') returning id into f;

  -- COMPRAS: 300 no periodo. Uma caixa com 2kg a 150 o kg.
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero,
                             emitida_em, valor_produtos, valor_total,
                             chave_acesso)
  values (r, f, 'xml', '1001', date '2026-08-15', 300, 300,
          '35260811222333000181550010000010011000010019')
  returning id into nota;

  insert into nota_itens (nota_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total, fator_conversao)
  values (nota, 'PICANHA BOV RESF CX C/2KG', 'CX', 1, 300, 300, 2);

  perform conferir('quantidade convertida aplica o fator (1 CX x 2 = 2 KG)',
    (select quantidade_convertida from nota_itens where nota_id = nota) = 2);
  perform conferir('custo convertido e o valor por unidade do cadastro (300/2)',
    (select custo_convertido from nota_itens where nota_id = nota) = 150);

  -- Nota com item solto nao entra no CMV: seria compra sem dono.
  begin
    perform mv_lancar_nota(nota);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('nota com item sem produto vinculado nao e lancada',
                   v_erro like '%sem produto vinculado%');

  update nota_itens set produto_id = p_picanha where nota_id = nota;

  perform conferir('vincular o item gravou o de-para para a proxima nota',
    (select count(*) from produto_apelidos
      where produto_id = p_picanha and apelido like 'PICANHA BOV%') = 1);

  v_nota := mv_lancar_nota(nota);
  perform conferir('nota lancada muda de status', v_nota.status = 'lancada');
  perform conferir('lancar a nota empurrou o custo medio da picanha para 150',
    (select custo_medio from produtos where id = p_picanha) = 150);

  -- A mesma chave nao entra duas vezes.
  begin
    insert into notas_fiscais (restaurante_id, emitida_em, chave_acesso, valor_total)
    values (r, date '2026-08-16', '35260811222333000181550010000010011000010019', 300);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('a mesma chave de acesso nao entra duas vezes', v_erro is not null);
  reset role;
end $$;

-- ----------------------------------- o custo chega ate a contagem ----------
do $$
declare r uuid; f uuid; nota uuid; p_cerveja uuid; s_bar uuid; s_coz uuid;
        c_id uuid; v_erro text;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into p_cerveja from produtos where nome = 'Cerveja' and restaurante_id = r;
  select id into s_bar from setores where nome = 'Bar' and restaurante_id = r;
  select id into s_coz from setores where nome = 'Cozinha' and restaurante_id = r;
  select id into f from fornecedores where restaurante_id = r limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  -- A cerveja vive no Bar a 10. No Estoque (Cozinha) o custo e da casa: engradado
  -- montado por eles, marcado como custo proprio.
  insert into produto_setores (produto_id, setor_id, unidade, custo, custo_fixo)
  values (p_cerveja, s_coz, 'CX', 240, true);

  -- Nota com DUAS linhas do mesmo produto, precos diferentes: o caso em que o
  -- custo era sorteado. 10 a 12 e 10 a 14 -> media ponderada 13.
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero,
                             emitida_em, valor_produtos, valor_total)
  -- Outubro de proposito: dentro de agosto esta nota entraria nas compras do
  -- periodo e quebraria a conta redonda que o teste de CMV persegue.
  values (r, f, 'manual', '2002', date '2026-10-05', 260, 260) returning id into nota;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total, fator_conversao) values
    (nota, p_cerveja, 'CERVEJA LOTE A', 'UND', 10, 12, 120, 1),
    (nota, p_cerveja, 'CERVEJA LOTE B', 'UND', 10, 14, 140, 1);

  perform mv_lancar_nota(nota);

  perform conferir('nota com duas linhas do mesmo produto vira media ponderada (260/20 = 13)',
    (select custo_medio from produtos where id = p_cerveja) = 13);

  perform conferir('o vinculo que segue a compra foi atualizado para 13',
    (select custo from produto_setores where produto_id = p_cerveja and setor_id = s_bar) = 13);

  perform conferir('o vinculo marcado como custo proprio nao foi tocado',
    (select custo from produto_setores where produto_id = p_cerveja and setor_id = s_coz) = 240);

  perform conferir('e o custo carimbou a data de atualizacao',
    (select custo_atualizado_em is not null from produto_setores
      where produto_id = p_cerveja and setor_id = s_bar));

  -- Relancar reaplicaria o custo e uma nota cancelada voltaria a contar.
  begin
    perform mv_lancar_nota(nota);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('lancar a mesma nota duas vezes e recusado', v_erro like '%ja foi lancada%');

  -- E o custo novo chega na proxima folha de contagem.
  c_id := mv_abrir_contagem(r, date '2026-10-06', 'semanal', 'Conferencia de custo');
  perform conferir('a folha de contagem nasce com o custo novo no bar',
    (select custo_unitario from contagem_itens
      where contagem_id = c_id and produto_id = p_cerveja and setor_id = s_bar) = 13);
  perform conferir('e com o custo proprio preservado na cozinha',
    (select custo_unitario from contagem_itens
      where contagem_id = c_id and produto_id = p_cerveja and setor_id = s_coz) = 240);
  perform conferir('a linha diz de quando e o custo que esta usando',
    (select observacao like 'custo de %' from contagem_itens
      where contagem_id = c_id and produto_id = p_cerveja and setor_id = s_bar));

  delete from contagens where id = c_id;
  reset role;
end $$;

-- ------------------------------------------------------------- o CMV -------
do $$
declare r uuid; v_id uuid; c record;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  -- Sem estoque final ainda, o CMV precisa recusar-se a responder.
  select * into c from mv_cmv_periodo(r, date '2026-08-01', date '2026-08-31') x;
  perform conferir('sem contagem final o CMV volta nulo', c.cmv is null);
  perform conferir('e diz por que', c.pendencia = 'Falta a contagem de estoque final');
  perform conferir('mas as compras do periodo ja aparecem', c.compras = 300);

  -- ESTOQUE FINAL: 7kg de picanha na cozinha, agora a 150 (custo da nota) = 1050.
  -- Para a conta fechar em 600, forcamos o custo de fechamento em 100.
  v_id := mv_abrir_contagem(r, date '2026-08-31', 'mensal', 'Final');
  update contagem_itens set quantidade = 7, custo_unitario = 100
   where contagem_id = v_id
     and produto_id = (select id from produtos where nome = 'Picanha')
     and setor_id = (select id from setores where nome = 'Cozinha');
  perform mv_fechar_contagem(v_id);

  select * into c from mv_cmv_periodo(r, date '2026-08-01', date '2026-08-31') x;
  perform conferir('estoque inicial = 1000', c.estoque_inicial = 1000);
  perform conferir('compras = 300',          c.compras = 300);
  perform conferir('estoque final = 700',    c.estoque_final = 700);
  perform conferir('CMV = 1000 + 300 - 700 = 600', c.cmv = 600);
  perform conferir('o periodo esta completo', c.completo);
  perform conferir('e sem pendencia',         c.pendencia is null);

  perform conferir('a serie mensal devolve 6 periodos',
    (select count(*) from mv_cmv_serie(r, 'mensal', 6, date '2026-08-31')) = 6);
  perform conferir('o ultimo periodo da serie e o de agosto, com CMV 600',
    (select cmv from mv_cmv_serie(r, 'mensal', 6, date '2026-08-31')
      order by inicio desc limit 1) = 600);
  perform conferir('a abertura por categoria soma o mesmo CMV',
    (select sum(cmv) from mv_cmv_por_categoria(r, date '2026-08-01', date '2026-08-31')) = 600);

  -- Periodo sem contagem de fechamento: a abertura por categoria tem de voltar
  -- nula, e nao com estoque final zero. Zero ali afirmaria que a casa consumiu
  -- o estoque inteiro — o erro teria o tamanho do estoque.
  perform conferir('sem contagem final, o CMV por categoria e nulo',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30')
      where cmv is not null) = 0);
  perform conferir('sem contagem final, o estoque final por categoria e nulo',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30')
      where estoque_final is not null) = 0);
  perform conferir('mas o estoque inicial de setembro existe (a foto de agosto)',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30')
      where estoque_inicial is not null) > 0);

  -- Produto sem categoria sumia da abertura, e o total do periodo continuava
  -- contando com ele: as colunas deixavam de fechar sem nada avisar.
  update produtos set categoria_id = null where nome = 'Cerveja' and restaurante_id = r;
  perform conferir('produto sem categoria aparece como "Sem categoria"',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-08-01', date '2026-08-31')
      where categoria_nome = 'Sem categoria') = 1);

  -- Categoria arquivada tambem: o dado dela nao deixa de existir por ter sido
  -- tirada do cadastro.
  update produtos set categoria_id = (select id from categorias where restaurante_id = r limit 1)
   where nome = 'Cerveja' and restaurante_id = r;
  update categorias set ativo = false where restaurante_id = r;
  perform conferir('categoria arquivada com movimento continua na abertura',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-08-01', date '2026-08-31')
      where not categoria_ativa) = 1);
  update categorias set ativo = true where restaurante_id = r;

  -- Granularidade invalida tem de gritar, nao devolver vazio.
  begin
    perform count(*) from mv_cmv_serie(r, 'diaria', 3);
    perform conferir('granularidade invalida e recusada', false);
  exception when others then
    perform conferir('granularidade invalida e recusada', sqlerrm like '%granularidade invalida%');
  end;
  reset role;
end $$;

-- --------------------------------------------- refazer a folha aberta ------
-- A folha e uma foto do cadastro no instante da abertura. Quando o cadastro
-- muda de verdade — o Bar do Zeca indo de seis setores para quatro — a folha
-- aberta fica mostrando setor que nao existe mais. Refazer realinha sem
-- apagar o que ja foi contado.
do $$
declare
  r uuid; c uuid; s_novo uuid; s_base uuid; p_alvo uuid; res record;
  n_antes integer; v_erro text;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  c := mv_abrir_contagem(r, date '2026-10-20', 'avulsa', 'Folha a refazer');
  select count(*) into n_antes from contagem_itens where contagem_id = c;

  -- Uma linha especifica, de um par produto x setor: o cenario tem produto em
  -- dois setores, e carimbar "o produto" carimbaria os dois.
  select produto_id, setor_id into p_alvo, s_base
    from contagem_itens where contagem_id = c limit 1;
  update contagem_itens set quantidade = 4, contado_em = now()
   where contagem_id = c and produto_id = p_alvo and setor_id = s_base;

  -- O cadastro muda: nasce um setor com este produto dentro.
  insert into setores (restaurante_id, nome) values (r, 'Deposito') returning id into s_novo;
  insert into produto_setores (produto_id, setor_id, unidade, custo)
  values (p_alvo, s_novo, 'UND', 5);

  select * into res from mv_refazer_folha(c);
  perform conferir('refazer traz a linha do setor novo', res.acrescentadas = 1);
  perform conferir('e nada mais: a folha cresce exatamente o que entrou',
    (select count(*) from contagem_itens where contagem_id = c) = n_antes + 1);
  perform conferir('refazer nao remove nada que esteja no cadastro', res.removidas = 0);

  -- Agora o produto sai do cadastro inteiro. A linha zerada do Deposito pode
  -- ir embora; a que tem quantidade, nao — e trabalho de quem contou.
  update produtos set ativo = false where id = p_alvo;
  select * into res from mv_refazer_folha(c);

  perform conferir('a linha zerada do produto que saiu e removida', res.removidas >= 1);
  perform conferir('a linha ja contada NAO e removida',
    (select quantidade from contagem_itens
      where contagem_id = c and produto_id = p_alvo and setor_id = s_base) = 4);
  perform conferir('e o carimbo de quem contou continua la',
    (select contado_em is not null from contagem_itens
      where contagem_id = c and produto_id = p_alvo and setor_id = s_base));
  perform conferir('ela volta contada como preservada, para a tela avisar',
    res.preservadas >= 1);
  perform conferir('a linha zerada do Deposito sumiu mesmo',
    not exists (select 1 from contagem_itens
                 where contagem_id = c and setor_id = s_novo));

  -- Chamar duas vezes seguidas nao pode explodir nem mudar nada de novo.
  select * into res from mv_refazer_folha(c);
  perform conferir('refazer de novo, logo em seguida, nao mexe em nada',
    res.acrescentadas = 0 and res.removidas = 0);

  update produtos set ativo = true where id = p_alvo;

  -- Folha fechada nao se refaz: a foto e imutavel, e e ela que sustenta o CMV.
  perform mv_fechar_contagem(c);
  begin
    perform mv_refazer_folha(c);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('folha fechada nao pode ser refeita', v_erro like '%so a folha aberta%');

  -- O cenario volta como estava.
  update contagens set status = 'aberta' where id = c;
  delete from contagem_itens where contagem_id = c;
  delete from contagens where id = c;
  delete from produto_setores where setor_id = s_novo;
  delete from setores where id = s_novo;
  reset role;
end $$;

-- ----------------------------------------------- estoque de setor ----------
do $$
declare r uuid; s_bar uuid; e1 uuid; e2 uuid; p uuid; p_solto uuid; c uuid;
        v_contagem_sem_lugar uuid; v_unidade text; v_custo numeric; n integer; v_erro text;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  select id into s_bar from setores where restaurante_id = r limit 1;
  select produto_id into p from produto_setores where setor_id = s_bar limit 1;

  insert into estoques (restaurante_id, setor_id, nome, ordem)
  values (r, s_bar, 'Geladeira 1', 1) returning id into e1;
  insert into estoques (restaurante_id, setor_id, nome, ordem)
  values (r, s_bar, 'Geladeira 2', 2) returning id into e2;

  -- O nome e unico dentro do setor, nao do restaurante: a cozinha tambem tem
  -- uma "Geladeira 1", e ela e outra geladeira.
  begin
    insert into estoques (restaurante_id, setor_id, nome) values (r, s_bar, 'geladeira 1');
    perform conferir('nome de estoque repetido no mesmo setor e recusado', false);
  exception when unique_violation then
    perform conferir('nome de estoque repetido no mesmo setor e recusado', true);
  end;

  insert into estoques (restaurante_id, setor_id, nome)
  select r, id, 'Geladeira 1' from setores
   where restaurante_id = r and id <> s_bar limit 1;
  get diagnostics n = row_count;
  perform conferir('o mesmo nome noutro setor e aceito', n = 1);

  -- Lugar so existe dentro do setor: pendurar produto que nao esta no setor
  -- faria a folha nascer com produto em setor que ninguem cadastrou.
  -- Produto que nao esta em setor nenhum: nao adianta procurar um no cenario,
  -- porque os dois que existem moram justamente neste setor.
  insert into produtos (restaurante_id, nome, unidade)
  values (r, 'Sem setor nenhum', 'UND') returning id into p_solto;
  begin
    insert into produto_estoques (produto_id, estoque_id) values (p_solto, e1);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('produto fora do setor nao entra no estoque daquele setor',
    v_erro like '%nao esta no setor deste estoque%');

  -- ------------------------------------------------ a folha por lugar ------
  -- Sem lugar nenhum, a folha e a de antes desta migracao.
  c := mv_abrir_contagem(r, date '2026-10-05', 'mensal', 'Sem lugares');
  v_contagem_sem_lugar := c;
  select count(*) into n from contagem_itens where contagem_id = c and setor_id = s_bar;
  perform conferir('sem estoque cadastrado, o setor rende uma linha por produto',
    n = (select count(*) from produto_setores where setor_id = s_bar));
  perform conferir('e essa linha vem sem lugar',
    (select count(*) from contagem_itens
      where contagem_id = c and setor_id = s_bar and estoque_id is not null) = 0);

  -- Com duas geladeiras, o produto que mora nas duas rende duas linhas.
  insert into produto_estoques (produto_id, estoque_id) values (p, e1), (p, e2);
  c := mv_abrir_contagem(r, date '2026-10-06', 'mensal', 'Com lugares');

  perform conferir('produto em dois lugares rende duas linhas',
    (select count(*) from contagem_itens
      where contagem_id = c and produto_id = p and setor_id = s_bar) = 2);
  perform conferir('e as duas linhas apontam para geladeiras diferentes',
    (select count(distinct estoque_id) from contagem_itens
      where contagem_id = c and produto_id = p and setor_id = s_bar) = 2);
  perform conferir('o produto sem lugar continua rendendo uma linha so, sem lugar',
    (select count(*) from contagem_itens i
      where i.contagem_id = c and i.setor_id = s_bar
        and i.produto_id <> p and i.estoque_id is not null) = 0);

  -- A chave nova: uma vez por lugar, e `nulls not distinct` mantem valendo a
  -- regra antiga no setor sem subdivisao.
  begin
    insert into contagem_itens (contagem_id, produto_id, setor_id, estoque_id)
    values (c, p, s_bar, e1);
    v_erro := null;
  exception when unique_violation then v_erro := 'duplicata';
  end;
  perform conferir('o mesmo produto duas vezes no mesmo lugar e recusado', v_erro = 'duplicata');

  begin
    insert into contagem_itens (contagem_id, produto_id, setor_id, estoque_id)
    select c, i.produto_id, i.setor_id, null from contagem_itens i
     where i.contagem_id = c and i.estoque_id is null limit 1;
    v_erro := null;
  exception when unique_violation then v_erro := 'duplicata';
  end;
  perform conferir('duas linhas sem lugar no mesmo setor tambem sao duplicata',
    v_erro = 'duplicata');

  -- Sair do setor tem de levar os lugares daquele setor junto.
  select unidade, custo into v_unidade, v_custo
    from produto_setores where produto_id = p and setor_id = s_bar;
  delete from produto_setores where produto_id = p and setor_id = s_bar;
  perform conferir('sair do setor limpa os lugares daquele setor',
    (select count(*) from produto_estoques where produto_id = p and estoque_id in (e1, e2)) = 0);

  -- O cenario volta como estava: os blocos seguintes contam produtos e
  -- vinculos, e um produto de teste esquecido aqui quebraria a conta la.
  insert into produto_setores (produto_id, setor_id, unidade, custo)
  values (p, s_bar, v_unidade, v_custo);
  delete from contagens where id in (c, v_contagem_sem_lugar);
  delete from produtos where id = p_solto;
  delete from estoques where restaurante_id = r;

  reset role;
end $$;

-- ------------------------------------------------- lista de compras --------
do $$
declare r uuid; l uuid; n integer;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  update produtos set estoque_minimo = 12 where nome = 'Picanha' and restaurante_id = r;
  l := mv_gerar_lista_compras(r, 'Pedido da semana');

  select count(*) into n from lista_compras_itens where lista_id = l;
  perform conferir('a lista traz o cadastro inteiro (2 produtos)', n = 2);

  -- Ultima contagem fechada tem 7kg; o minimo e 12; faltam 5.
  perform conferir('a sugestao e a diferenca para o estoque minimo (12 - 7 = 5)',
    (select quantidade from lista_compras_itens li
      join produtos p on p.id = li.produto_id
     where li.lista_id = l and p.nome = 'Picanha') = 5);

  perform conferir('produto sem minimo definido nao vira sugestao',
    (select quantidade from lista_compras_itens li
      join produtos p on p.id = li.produto_id
     where li.lista_id = l and p.nome = 'Cerveja') = 0);

  -- Marcar categoria estreita a folha de verdade. Foi por aqui que o primeiro
  -- cliente acabou com uma folha de 7 produtos num cadastro de 854, e concluiu
  -- que o estoque tinha sumido: o filtro funciona, quem nao dizia nada era a
  -- tela. O comportamento fica fixado aqui para nunca virar "bug do banco".
  -- Os dois produtos nasceram na mesma categoria. Para o filtro significar
  -- alguma coisa, a cerveja ganha a dela.
  insert into categorias (restaurante_id, nome) values (r, 'Bebidas')
    on conflict do nothing;
  update produtos
     set categoria_id = (select id from categorias
                          where restaurante_id = r and nome = 'Bebidas')
   where nome = 'Cerveja' and restaurante_id = r;

  l := mv_gerar_lista_compras(r, 'So carnes',
         array[(select categoria_id from produtos
                 where nome = 'Picanha' and restaurante_id = r)]);
  select count(*) into n from lista_compras_itens where lista_id = l;
  perform conferir('categoria marcada estreita a folha (so 1 produto)', n = 1);
  perform conferir('e o produto da folha e mesmo o da categoria marcada',
    (select p.nome from lista_compras_itens li
      join produtos p on p.id = li.produto_id
     where li.lista_id = l) = 'Picanha');

  -- E o que ficou de fora e exatamente o que o usuario procurava: o resto.
  perform conferir('o produto da outra categoria fica de fora da folha',
    not exists (select 1 from lista_compras_itens li
                 join produtos p on p.id = li.produto_id
                where li.lista_id = l and p.nome = 'Cerveja'));

  -- Array vazio nao e "nenhum filtro": `= any('{}')` nao casa com nada.
  l := mv_gerar_lista_compras(r, 'Nenhuma categoria', array[]::uuid[]);
  select count(*) into n from lista_compras_itens where lista_id = l;
  perform conferir('array vazio de categorias gera folha vazia, nao o cadastro', n = 0);

  reset role;
end $$;

\echo '  --- Fluxos: todos os casos passaram'
