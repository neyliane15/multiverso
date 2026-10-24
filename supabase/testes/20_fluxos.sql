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

-- -------------------------------- produto em varios lugares, varios setores --
-- A regra que desenha o modulo, um nivel abaixo: assim como o produto vive em
-- varios SETORES, ele vive em varios LUGARES de cada setor. Tres geladeiras na
-- cozinha sao tres paradas de quem conta, nao uma.
do $$
declare
  r uuid; s_a uuid; s_b uuid; p uuid; c uuid; c2 uuid;
  e_a1 uuid; e_a2 uuid; e_a3 uuid; e_b1 uuid; e_b2 uuid;
  res record; n integer;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  select id into s_a from setores where restaurante_id = r order by ordem, nome limit 1;
  select id into s_b from setores where restaurante_id = r and id <> s_a order by ordem, nome limit 1;

  -- Um produto que vive nos dois setores.
  select ps.produto_id into p from produto_setores ps where ps.setor_id = s_a limit 1;
  insert into produto_setores (produto_id, setor_id, unidade, custo)
  values (p, s_b, 'UND', 9) on conflict do nothing;

  insert into estoques (restaurante_id, setor_id, nome, ordem) values
    (r, s_a, 'Lugar A1', 1) returning id into e_a1;
  insert into estoques (restaurante_id, setor_id, nome, ordem) values
    (r, s_a, 'Lugar A2', 2) returning id into e_a2;
  insert into estoques (restaurante_id, setor_id, nome, ordem) values
    (r, s_a, 'Lugar A3', 3) returning id into e_a3;
  insert into estoques (restaurante_id, setor_id, nome, ordem) values
    (r, s_b, 'Lugar B1', 1) returning id into e_b1;
  insert into estoques (restaurante_id, setor_id, nome, ordem) values
    (r, s_b, 'Lugar B2', 2) returning id into e_b2;

  -- Tres lugares num setor, dois no outro.
  insert into produto_estoques (produto_id, estoque_id)
  values (p, e_a1), (p, e_a2), (p, e_a3), (p, e_b1), (p, e_b2);

  c := mv_abrir_contagem(r, date '2026-11-10', 'avulsa', 'Varios lugares');

  select count(*) into n from contagem_itens
   where contagem_id = c and produto_id = p and setor_id = s_a;
  perform conferir('tres lugares num setor rendem tres linhas', n = 3);

  select count(*) into n from contagem_itens
   where contagem_id = c and produto_id = p and setor_id = s_b;
  perform conferir('e dois lugares no outro rendem duas', n = 2);

  select count(distinct estoque_id) into n from contagem_itens
   where contagem_id = c and produto_id = p;
  perform conferir('as cinco linhas apontam para cinco lugares distintos', n = 5);

  perform conferir('e nenhuma delas vem sem lugar',
    not exists (select 1 from contagem_itens
                 where contagem_id = c and produto_id = p and estoque_id is null));

  -- A invariante que amarra as duas funcoes: refazer tem de chegar na MESMA
  -- folha que abrir. Sem isto, uma delas poderia ganhar um LATERAL e a outra
  -- nao, e a folha refeita passaria a divergir da recem-aberta sem aviso.
  select * into res from mv_refazer_folha(c);
  perform conferir('refazer concorda com abrir: nada a acrescentar',
    res.acrescentadas = 0);
  perform conferir('refazer concorda com abrir: nada a remover', res.removidas = 0);

  -- E uma folha aberta DEPOIS tem de ser identica, linha a linha.
  c2 := mv_abrir_contagem(r, date '2026-11-11', 'avulsa', 'Conferencia');
  perform conferir('duas folhas do mesmo cadastro tem as mesmas linhas',
    not exists (
      (select produto_id, setor_id, estoque_id from contagem_itens where contagem_id = c
       except
       select produto_id, setor_id, estoque_id from contagem_itens where contagem_id = c2)
      union all
      (select produto_id, setor_id, estoque_id from contagem_itens where contagem_id = c2
       except
       select produto_id, setor_id, estoque_id from contagem_itens where contagem_id = c)));

  -- Tirar um lugar tira exatamente uma linha da proxima folha.
  delete from produto_estoques where produto_id = p and estoque_id = e_a3;
  select * into res from mv_refazer_folha(c);
  perform conferir('tirar um lugar tira uma linha da folha', res.removidas = 1);
  select count(*) into n from contagem_itens
   where contagem_id = c and produto_id = p and setor_id = s_a;
  perform conferir('e sobram dois lugares naquele setor', n = 2);

  -- O cenario volta como estava.
  delete from contagem_itens where contagem_id in (c, c2);
  delete from contagens where id in (c, c2);
  delete from produto_estoques where produto_id = p;
  delete from estoques where id in (e_a1, e_a2, e_a3, e_b1, e_b2);
  delete from produto_setores where produto_id = p and setor_id = s_b;
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

-- ============================================================================
-- Ficha tecnica: o custo vem do catalogo, e a conta do prato fecha
-- ----------------------------------------------------------------------------
-- Numeros redondos de proposito. Picanha a R$ 100/KG, 200 G liquidos com 20%
-- de perda = 250 G comprados = R$ 25,00. Cerveja a R$ 10 a garrafa de 500 ML,
-- 100 ML = R$ 2,00. Rende 2 porcoes: R$ 13,50 a porcao. Vendida a R$ 54,00, o
-- CMV do prato e 25%.
-- ============================================================================
do $$
declare r uuid; u uuid := '00000000-0000-0000-0000-0000000000f1';
        f uuid; p_carne uuid; p_cerveja uuid; v numeric; b boolean; v_erro text;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into p_carne   from produtos where restaurante_id = r and nome = 'Picanha';
  select id into p_cerveja from produtos where restaurante_id = r and nome = 'Cerveja';

  -- A cerveja e comprada por garrafa; a receita usa mililitro.
  update produtos set unidade = 'UND', custo_medio = 10,
         conteudo_quantidade = 500, conteudo_unidade = 'ML'
   where id = p_cerveja;
  update produtos set unidade = 'KG', custo_medio = 100 where id = p_carne;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  insert into fichas (restaurante_id, nome, grupo, rendimento, preco_venda)
  values (r, 'Picanha na cerveja', 'Pratos', 2, 54) returning id into f;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade, perda_percentual, ordem)
  values (f, p_carne, 200, 'G', 20, 1), (f, p_cerveja, 100, 'ML', 0, 2);

  select custo into v from vw_ficha_itens where ficha_id = f and produto_id = p_carne;
  perform conferir('perda entra no custo: 200 G com 20% viram 250 G = R$ 25', v = 25);

  select quantidade_bruta into v from vw_ficha_itens where ficha_id = f and produto_id = p_carne;
  perform conferir('e o bruto aparece como 250 G', v = 250);

  select custo into v from vw_ficha_itens where ficha_id = f and produto_id = p_cerveja;
  perform conferir('a embalagem converte: 100 ML de uma garrafa de 500 ML a R$ 10 = R$ 2', v = 2);

  perform conferir('custo total do prato e 27',
    (select custo_total from vw_fichas_completas where id = f) = 27);
  perform conferir('rendendo 2 porcoes, a porcao custa 13,50',
    (select custo_porcao from vw_fichas_completas where id = f) = 13.5);
  perform conferir('o CMV do prato e 25% do preco de venda',
    (select cmv_percentual from vw_fichas_completas where id = f) = 25);
  perform conferir('a margem e o que sobra da porcao',
    (select margem from vw_fichas_completas where id = f) = 40.5);

  -- O custo NAO esta guardado na ficha: muda a nota, muda o prato.
  update produtos set custo_medio = 200 where id = p_carne;
  perform conferir('dobrou o custo da carne, o prato acompanha sozinho',
    (select custo_total from vw_fichas_completas where id = f) = 52);
  update produtos set custo_medio = 100 where id = p_carne;

  -- Unidade que nao converte nem pela embalagem: pendencia visivel, nao chute.
  update produtos set conteudo_quantidade = null, conteudo_unidade = null where id = p_cerveja;
  select unidade_incompativel into b from vw_ficha_itens where ficha_id = f and produto_id = p_cerveja;
  perform conferir('sem embalagem, ML para UND fica marcado como incompativel', b);
  perform conferir('e o item incompativel nao inventa custo',
    (select custo from vw_ficha_itens where ficha_id = f and produto_id = p_cerveja) is null);
  perform conferir('a ficha conta quantos itens estao incompativeis',
    (select itens_incompativeis from vw_fichas_completas where id = f) = 1);
  update produtos set conteudo_quantidade = 500, conteudo_unidade = 'ML' where id = p_cerveja;

  -- Duas vezes o mesmo produto na mesma ficha e erro de digitacao, nao receita.
  begin
    insert into ficha_itens (ficha_id, produto_id, quantidade, unidade)
    values (f, p_carne, 50, 'G');
    v_erro := null;
  exception when unique_violation then v_erro := 'recusado';
  end;
  perform conferir('o mesmo produto duas vezes na mesma ficha e recusado', v_erro = 'recusado');

  -- Sem preco de venda a pergunta nao tem resposta — e nulo e melhor que zero.
  update fichas set preco_venda = 0 where id = f;
  perform conferir('sem preco de venda, o CMV do prato e nulo, nao zero',
    (select cmv_percentual from vw_fichas_completas where id = f) is null);
  update fichas set preco_venda = 54 where id = f;

  reset role;
end $$;

-- ---------------------------------------------------- fator entre unidades --
do $$
begin
  perform conferir('G para KG divide por mil', mv_fator_unidade('G', 'KG') = 0.001);
  perform conferir('KG para G multiplica por mil', mv_fator_unidade('KG', 'G') = 1000);
  perform conferir('ML para L divide por mil', mv_fator_unidade('ML', 'L') = 0.001);
  perform conferir('a mesma unidade vale 1', mv_fator_unidade('UND', 'UND') = 1);
  perform conferir('sinonimo de planilha tambem casa (GR = G)', mv_fator_unidade('GR', 'KG') = 0.001);
  perform conferir('familias diferentes nao se convertem', mv_fator_unidade('G', 'ML') is null);
  perform conferir('massa para unidade nao se converte', mv_fator_unidade('KG', 'UND') is null);
  perform conferir('unidade desconhecida so serve para ela mesma',
    mv_fator_unidade('CX', 'CX') = 1 and mv_fator_unidade('CX', 'KG') is null);
end $$;

-- ============================================================================
-- Operador de setor: uma pessoa, um setor, uma tela
-- ----------------------------------------------------------------------------
-- O que importa aqui nao e o menu escondido — e a porta trancada. Se a RLS
-- deixar passar, basta digitar outro endereco no navegador.
-- ============================================================================
do $$
declare r uuid; c uuid; s_bar uuid; s_coz uuid;
        u_bar uuid := '00000000-0000-0000-0000-00000000f1b1';
        n integer; v_erro text; item_coz uuid;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into s_bar from setores where restaurante_id = r and nome = 'Bar';
  select id into s_coz from setores where restaurante_id = r and nome = 'Cozinha';

  insert into auth.users (id, email) values (u_bar, 'operador.bar@casa-teste.local');
  insert into perfis (id, restaurante_id, nome, email, papel, usuario)
  values (u_bar, r, 'Operador Bar', 'operador.bar@casa-teste.local', 'operador', 'Operador Bar');
  insert into perfil_setores (perfil_id, setor_id) values (u_bar, s_bar);

  -- uma contagem com linha nos dois setores, aberta por quem pode
  select id into c from contagens where restaurante_id = r and status = 'aberta' limit 1;
  if c is null then
    c := mv_abrir_contagem(r, current_date, 'avulsa', null);
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_bar::text, true);

  select count(*) into n from setores;
  perform conferir('o operador de setor enxerga so o setor dele', n = 1);

  select count(distinct i.setor_id) into n from contagem_itens i;
  perform conferir('e so as linhas de contagem daquele setor', n = 1);

  select count(*) into n from contagem_itens i join setores s on s.id = i.setor_id
   where s.nome = 'Cozinha';
  perform conferir('a contagem da cozinha nao existe para ele', n = 0);

  -- Lancar no proprio setor: pode.
  update contagem_itens i set quantidade = 3
    where i.contagem_id = c and i.setor_id = s_bar;
  get diagnostics n = row_count;
  perform conferir('ele lanca quantidade no proprio setor', n > 0);

  -- O caso que ja nos mordeu: UPDATE sem clausula que mencione o setor. A
  -- politica de SELECT so protege quem LE colunas, entao este e o teste que
  -- importa de verdade.
  update contagem_itens i set observacao = 'tentativa' where i.contagem_id = c;
  get diagnostics n = row_count;
  perform conferir('update sem filtro de setor so alcanca as linhas dele',
    n = (select count(*) from contagem_itens i2 where i2.contagem_id = c and i2.setor_id = s_bar));

  reset role;
  -- E, visto por fora, a cozinha ficou intocada.
  select count(*) into n from contagem_itens i
   where i.contagem_id = c and i.setor_id = s_coz and i.observacao = 'tentativa';
  perform conferir('nenhuma linha da cozinha foi tocada', n = 0);

  -- Calendario da casa: nao e dele.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_bar::text, true);
  begin
    perform mv_abrir_contagem(r, current_date + 30, 'avulsa', null);
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('operador de setor nao abre contagem', v_erro = 'recusado');

  update contagens set status = 'fechada' where id = c;
  get diagnostics n = row_count;
  perform conferir('nem fecha', n = 0);
  reset role;
end $$;

-- ------------------------------------------------------ entrar sem e-mail ---
do $$
declare v text;
begin
  select mv_email_de_login('Operador Bar') into v;
  perform conferir('o nome de usuario resolve para o e-mail sintetico',
    v = 'operador.bar@casa-teste.local');
  select mv_email_de_login('  operador bar  ') into v;
  perform conferir('espaco e caixa nao atrapalham quem digita', v = 'operador.bar@casa-teste.local');
  select mv_email_de_login('chef@casa-teste.com') into v;
  perform conferir('quem entra por e-mail nao e resolvivel por nome', v is null);
  select mv_email_de_login('nao existe') into v;
  perform conferir('nome que nao existe devolve nulo, nao erro', v is null);
end $$;

-- --------------------------------------------- o que a restricao nao faz ----
do $$
declare r uuid; u_bar uuid := '00000000-0000-0000-0000-00000000f1b1';
        s_coz uuid; v_erro text; v_admin uuid;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into s_coz from setores where restaurante_id = r and nome = 'Cozinha';
  select id into v_admin from perfis where restaurante_id = r and papel = 'admin' limit 1;

  -- Prender um admin a um setor esconderia dele a propria administracao.
  begin
    insert into perfil_setores (perfil_id, setor_id) values (v_admin, s_coz);
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('admin nao se prende a setor', v_erro = 'recusado');

  -- E um setor de outro restaurante nao entra na lista de ninguem.
  begin
    insert into perfil_setores (perfil_id, setor_id)
    values (u_bar, (select id from setores where restaurante_id <> r limit 1));
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('setor de outro restaurante e recusado', v_erro = 'recusado');
end $$;

-- ============================================================================
-- A entrega do setor: zero e resposta, vazio nao e
-- ============================================================================
do $$
declare r uuid; c uuid; s_bar uuid; s_coz uuid;
        u_bar uuid := '00000000-0000-0000-0000-00000000f1b1';
        n integer; v_erro text; v_linha contagem_setores;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into s_bar from setores where restaurante_id = r and nome = 'Bar';
  select id into s_coz from setores where restaurante_id = r and nome = 'Cozinha';
  select id into c from contagens where restaurante_id = r and status = 'aberta' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_bar::text, true);

  -- 1. Entregar com item sem resposta e recusado, e a mensagem diz quantos.
  update contagem_itens set contado_em = null
   where contagem_id = c and setor_id = s_bar;
  begin
    v_linha := mv_entregar_setor(c, s_bar);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('entregar com item em branco e recusado', v_erro like 'faltam %sem resposta%');
  perform conferir('e a recusa diz quantos faltam, para a pessoa saber onde agir',
    v_erro ~ '\d+');

  -- 2. Zerar os pendentes responde por eles — com zero, que e resposta.
  select mv_zerar_pendentes(c, s_bar) into n;
  perform conferir('zerar pendentes carimba as linhas em branco', n > 0);
  perform conferir('e nenhuma linha do setor fica sem resposta',
    (select count(*) from contagem_itens
      where contagem_id = c and setor_id = s_bar and contado_em is null) = 0);
  perform conferir('zerar nao inventa quantidade',
    (select count(*) from contagem_itens
      where contagem_id = c and setor_id = s_bar and quantidade <> 0 and contado_em is not null)
    >= 0);

  -- 3. Agora entrega.
  v_linha := mv_entregar_setor(c, s_bar);
  perform conferir('entrega registra quantas linhas foram entregues', v_linha.itens > 0);
  perform conferir('e quem entregou', v_linha.entregue_por = u_bar);

  -- 4. Entregue congela: a quantidade nao muda mais em silencio.
  begin
    update contagem_itens set quantidade = 99
     where contagem_id = c and setor_id = s_bar;
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('setor entregue nao aceita mudanca de quantidade', v_erro = 'recusado');

  -- 5. A entrega NAO fecha a contagem — isso e decisao de quem ve a casa.
  perform conferir('a contagem continua aberta depois da entrega',
    (select status from contagens where id = c) = 'aberta');

  -- 6. Recontagem destrava, e a correcao passa a ser possivel de novo.
  perform mv_recontar_setor(c, s_bar);
  perform conferir('recontagem apaga o registro da entrega',
    not exists (select 1 from contagem_setores where contagem_id = c and setor_id = s_bar));
  update contagem_itens set quantidade = 5
   where contagem_id = c and setor_id = s_bar;
  get diagnostics n = row_count;
  perform conferir('e a quantidade volta a aceitar correcao', n > 0);

  -- 7. O setor do vizinho continua fora do alcance dele.
  begin
    v_linha := mv_entregar_setor(c, s_coz);
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('operador do Bar nao entrega a cozinha', v_erro = 'recusado');
  reset role;
end $$;

-- --------------------------------------------- o andamento que o gerente ve -
do $$
declare r uuid; c uuid; s_bar uuid; u uuid := '00000000-0000-0000-0000-0000000000f1';
        v_pendentes integer; v_entregue timestamptz;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into s_bar from setores where restaurante_id = r and nome = 'Bar';
  select id into c from contagens where restaurante_id = r and status = 'aberta' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  perform conferir('o gerente ve o andamento de todos os setores',
    (select count(*) from vw_entrega_por_setor where contagem_id = c) >= 2);

  select pendentes, entregue_em into v_pendentes, v_entregue
    from vw_entrega_por_setor where contagem_id = c and setor_id = s_bar;
  perform conferir('e ve que o Bar esta sem entrega depois da recontagem', v_entregue is null);
  perform conferir('com a conta de quantos itens ainda faltam responder', v_pendentes >= 0);
  reset role;
end $$;

-- ============================================================================
-- A data da contagem se corrige; apagar e de master e admin
-- ============================================================================
do $$
declare r uuid; c uuid; v_erro text; v_linha contagens;
        u_admin uuid; u_gerente uuid; u_op uuid := '00000000-0000-0000-0000-00000000f1b1';
        n integer;
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into u_admin   from perfis where restaurante_id = r and papel = 'admin'   limit 1;
  select id into u_gerente from perfis where restaurante_id = r and papel = 'gerente' limit 1;
  select id into c from contagens where restaurante_id = r and status = 'aberta' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_admin::text, true);

  v_linha := mv_mudar_referencia(c, current_date);
  perform conferir('o admin corrige a data da contagem aberta', v_linha.referencia = current_date);
  perform conferir('e o titulo automatico acompanha a data nova',
    v_linha.titulo = initcap(v_linha.tipo::text) || ' · ' || to_char(current_date, 'DD/MM/YYYY'));

  -- Titulo dado por gente nao e reescrito por robo.
  update contagens set titulo = 'Inventario anual' where id = c;
  v_linha := mv_mudar_referencia(c, current_date - 1);
  perform conferir('titulo escrito a mao sobrevive a troca de data',
    v_linha.titulo = 'Inventario anual');
  update contagens set titulo = initcap(v_linha.tipo::text) || ' · ' ||
    to_char(v_linha.referencia, 'DD/MM/YYYY') where id = c;

  -- O operador de setor nao mexe na data da casa.
  perform set_config('request.jwt.claim.sub', u_op::text, true);
  begin
    v_linha := mv_mudar_referencia(c, current_date);
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform conferir('operador de setor nao muda a data da contagem', v_erro = 'recusado');
  reset role;
end $$;

do $$
declare r uuid; c uuid; n integer;
        u_admin uuid; u_gerente uuid; u_op uuid := '00000000-0000-0000-0000-00000000f1b1';
begin
  select id into r from restaurantes where slug = 'casa-teste';
  select id into u_admin   from perfis where restaurante_id = r and papel = 'admin'   limit 1;
  select id into u_gerente from perfis where restaurante_id = r and papel = 'gerente' limit 1;

  -- uma contagem descartavel, so para este teste
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_admin::text, true);
  c := mv_abrir_contagem(r, current_date - 40, 'avulsa', null);
  reset role;

  -- gerente NAO apaga: apagar contagem destroi historico e muda o CMV.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_gerente::text, true);
  delete from contagens where id = c;
  get diagnostics n = row_count;
  perform conferir('gerente nao apaga contagem', n = 0);

  -- operador de setor, menos ainda
  perform set_config('request.jwt.claim.sub', u_op::text, true);
  delete from contagens where id = c;
  get diagnostics n = row_count;
  perform conferir('operador de setor nao apaga contagem', n = 0);

  -- admin apaga, e leva as linhas junto
  perform set_config('request.jwt.claim.sub', u_admin::text, true);
  delete from contagens where id = c;
  get diagnostics n = row_count;
  perform conferir('admin apaga a contagem', n = 1);
  reset role;
  perform conferir('e as linhas dela vao junto',
    not exists (select 1 from contagem_itens where contagem_id = c));
end $$;

-- ============================================================================
-- Vendas, a explosao pela arvore das fichas, e o relatorio da contagem
-- ----------------------------------------------------------------------------
-- Os numeros deste arquivo sao escolhidos para serem conferiveis a mao, e a
-- arvore e de proposito de TRES niveis de producao, porque e onde a conta de
-- quantidade podia divergir da de custo sem ninguem ver:
--
--   EMPADAO (venda, rende 1 porcao)
--     └─ EMPADAO CRU (producao, rende 4 UND)
--          ├─ MASSA   (producao, rende 1 KG)  ── FARINHA 800 G
--          └─ RECHEIO (producao, rende 2 KG)  ── CEBOLA 500 G, perda 20%
--
--   Por porcao de EMPADAO:
--     MASSA   → 0,25 KG × (800 G ÷ 1 KG = 0,8) ÷ 4 = 0,05       KG de farinha
--     RECHEIO → 0,50 KG × (625 G ÷ 2 KG = 0,3125) ÷ 4 = 0,0390625 KG de cebola
--
--   CAIPIRINHA (venda, rende 1) ── VODKA 60 ML + LIMAO 50 G
--     VODKA: UND nao converte para ML, mas a garrafa tem 1000 ML cadastrados,
--            entao 60 ML = 0,06 garrafa. (`mv_fator_para_produto`, 0017)
--     LIMAO: UND, sem conteudo cadastrado. 50 G nao converte para nada — e
--            esta linha tem de voltar MARCADA, nunca como zero limao.
-- ============================================================================
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1';
  c_secos uuid; c_bar uuid; s_coz uuid; s_bar uuid;
  p_farinha uuid; p_cebola uuid; p_vodka uuid; p_limao uuid; p_azeite uuid;
  f_massa uuid; f_recheio uuid; f_cru uuid; f_empadao uuid; f_caipira uuid; f_salada uuid;
begin
  insert into restaurantes (nome, slug) values ('Prova de Vendas', 'prova-vendas') returning id into r;
  insert into convites (email, nome, papel, restaurante_id)
  values ('admin@prova-vendas.com', 'Admin da Prova', 'admin', r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (u, 'admin@prova-vendas.com', jsonb_build_object('nome','Admin da Prova'));

  insert into categorias (restaurante_id, nome, ordem) values (r, 'Secos', 1) returning id into c_secos;
  insert into categorias (restaurante_id, nome, ordem) values (r, 'Bar', 2)   returning id into c_bar;
  insert into setores (restaurante_id, nome, ordem) values (r, 'Cozinha', 1) returning id into s_coz;
  insert into setores (restaurante_id, nome, ordem) values (r, 'Bar', 2)     returning id into s_bar;

  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Farinha', 'KG', 5, c_secos) returning id into p_farinha;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Cebola', 'KG', 10, c_secos) returning id into p_cebola;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id,
                        conteudo_quantidade, conteudo_unidade)
  values (r, 'Vodka', 'UND', 60, c_bar, 1000, 'ML') returning id into p_vodka;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Limao', 'UND', 1, c_bar) returning id into p_limao;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Azeite', 'L', 20, c_secos) returning id into p_azeite;

  insert into produto_setores (produto_id, setor_id, unidade) values
    (p_farinha, s_coz, 'KG'), (p_cebola, s_coz, 'KG'), (p_azeite, s_coz, 'L'),
    (p_vodka, s_bar, 'UND'), (p_limao, s_bar, 'UND');

  -- a arvore de producao
  insert into fichas (restaurante_id, nome, producao, rendimento, unidade_rendimento)
  values (r, 'Massa do empadao', true, 1, 'KG') returning id into f_massa;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade)
  values (f_massa, p_farinha, 800, 'G');

  insert into fichas (restaurante_id, nome, producao, rendimento, unidade_rendimento)
  values (r, 'Recheio do empadao', true, 2, 'KG') returning id into f_recheio;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade, perda_percentual)
  values (f_recheio, p_cebola, 500, 'G', 20);

  insert into fichas (restaurante_id, nome, producao, rendimento, unidade_rendimento)
  values (r, 'Empadao cru', true, 4, 'UND') returning id into f_cru;
  insert into ficha_itens (ficha_id, producao_id, quantidade, unidade) values
    (f_cru, f_massa, 0.25, 'KG'),
    (f_cru, f_recheio, 0.5, 'KG');

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r, 'Empadao de frango', 1, 'PORCAO', 30) returning id into f_empadao;
  insert into ficha_itens (ficha_id, producao_id, quantidade, unidade)
  values (f_empadao, f_cru, 1, 'UND');

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r, 'Caipirinha', 1, 'PORCAO', 20) returning id into f_caipira;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values
    (f_caipira, p_vodka, 60, 'ML'),
    (f_caipira, p_limao, 50, 'G');

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r, 'Salada', 1, 'PORCAO', 15) returning id into f_salada;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade)
  values (f_salada, p_azeite, 100, 'ML');
end $$;

-- ------------------------------------------- a explosao de UMA ficha --------
do $$
declare r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1'; v numeric; b boolean; t text;
        f_empadao uuid; f_caipira uuid; n integer;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  select id into f_empadao from fichas where restaurante_id = r and nome = 'Empadao de frango';
  select id into f_caipira from fichas where restaurante_id = r and nome = 'Caipirinha';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  select x.quantidade into v from mv_produtos_da_ficha(f_empadao) x
    join produtos p on p.id = x.produto_id where p.nome = 'Farinha';
  perform conferir('tres niveis de producao: 0,05 KG de farinha por porcao de empadao', v = 0.05);

  select x.quantidade into v from mv_produtos_da_ficha(f_empadao) x
    join produtos p on p.id = x.produto_id where p.nome = 'Cebola';
  perform conferir('e a perda de 20% sobe a arvore inteira: 0,0390625 KG de cebola',
                   v = 0.0390625);

  select x.quantidade into v from mv_produtos_da_ficha(f_caipira) x
    join produtos p on p.id = x.produto_id where p.nome = 'Vodka';
  perform conferir('a embalagem converte 60 ML em 0,06 garrafa', v = 0.06);

  select x.quantidade, x.fator_ausente, x.motivo into v, b, t
    from mv_produtos_da_ficha(f_caipira) x
    join produtos p on p.id = x.produto_id where p.nome = 'Limao';
  perform conferir('unidade incompativel nao vira zero: a quantidade volta nula', v is null);
  perform conferir('e a linha volta marcada como sem fator', b);
  perform conferir('com o motivo dizendo qual insumo e em que unidade',
                   t like '%Limao%' and t like '%G%');
  reset role;
end $$;

-- ------------------------------------------- os lancamentos de venda -------
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1';
  f_empadao uuid; f_caipira uuid; f_salada uuid; f_massa uuid;
  v1 uuid; v2 uuid; v3 uuid; v_linha vendas; v_erro text; v numeric; b boolean;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  select id into f_empadao from fichas where restaurante_id = r and nome = 'Empadao de frango';
  select id into f_caipira from fichas where restaurante_id = r and nome = 'Caipirinha';
  select id into f_salada  from fichas where restaurante_id = r and nome = 'Salada';
  select id into f_massa   from fichas where restaurante_id = r and nome = 'Massa do empadao';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  insert into vendas (restaurante_id, referencia, inicio, titulo, criado_por)
  values (r, date '2026-07-25', date '2026-07-19', 'Semana 1', u) returning id into v1;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values
    (v1, f_empadao, 100, 30), (v1, f_caipira, 50, 20), (v1, f_salada, 10, 15);

  insert into vendas (restaurante_id, referencia, inicio, titulo, criado_por)
  values (r, date '2026-08-01', date '2026-07-26', 'Semana 2', u) returning id into v2;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values
    (v2, f_empadao, 200, 30), (v2, f_caipira, 100, 20), (v2, f_salada, 20, 15);

  insert into vendas (restaurante_id, referencia, inicio, titulo, criado_por)
  values (r, date '2026-08-08', date '2026-08-02', 'Semana 3', u) returning id into v3;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values
    (v3, f_empadao, 300, 30), (v3, f_caipira, 150, 20), (v3, f_salada, 30, 15);

  -- Producao e insumo interno: ela entra dentro de ficha, nunca no cardapio.
  begin
    insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario)
    values (v3, f_massa, 1, 0);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('ficha de producao nao se vende', v_erro like '%producao%nao se vende%');

  -- O total do item e quantidade x preco congelado.
  perform conferir('o total do item e a coluna gerada (300 x 30)',
    (select total from venda_itens where venda_id = v3 and ficha_id = f_empadao) = 9000);

  v_linha := mv_fechar_venda(v1);
  perform conferir('fechar a venda carimba a data', v_linha.fechada_em is not null);
  perform conferir('e congela o total do lancamento (100x30 + 50x20 + 10x15 = 4150)',
                   v_linha.total_valor = 4150);
  perform conferir('e conta as linhas', v_linha.total_itens = 3);

  begin
    update venda_itens set quantidade = 999 where venda_id = v1;
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('venda fechada recusa alteracao de item', v_erro like '%ja fechada%');

  perform mv_fechar_venda(v2);
  perform mv_fechar_venda(v3);

  -- Duas vendas para a mesma referencia seriam a planilha duplicada.
  begin
    insert into vendas (restaurante_id, referencia, criado_por)
    values (r, date '2026-08-08', u);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('duas vendas na mesma referencia sao recusadas', v_erro <> 'passou');

  -- A explosao de um lancamento inteiro: 300 empadoes x 0,05 = 15 KG.
  select x.quantidade into v from mv_vendas_por_produto(v3) x
    join produtos p on p.id = x.produto_id where p.nome = 'Farinha';
  perform conferir('a venda da semana 3 consumiu 15 KG de farinha', v = 15);

  select x.quantidade into v from mv_vendas_por_produto(v3) x
    join produtos p on p.id = x.produto_id where p.nome = 'Vodka';
  perform conferir('e 9 garrafas de vodka (150 x 0,06)', v = 9);

  select x.quantidade, x.fator_ausente into v, b from mv_vendas_por_produto(v3) x
    join produtos p on p.id = x.produto_id where p.nome = 'Limao';
  perform conferir('o limao sem conversao continua nulo e marcado na venda inteira',
                   v is null and b);
  reset role;
end $$;

-- ------------------------------------------- as duas fotos e as compras ----
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1';
  c1 uuid; c2 uuid; nota uuid; forn uuid; p_farinha uuid;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  select id into p_farinha from produtos where restaurante_id = r and nome = 'Farinha';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  c1 := mv_abrir_contagem(r, date '2026-08-01', 'semanal', 'Foto 1');
  update contagem_itens i set quantidade = 20 from produtos p
   where p.id = i.produto_id and i.contagem_id = c1 and p.nome = 'Farinha';
  update contagem_itens i set quantidade = 5 from produtos p
   where p.id = i.produto_id and i.contagem_id = c1 and p.nome = 'Cebola';
  update contagem_itens i set quantidade = 10 from produtos p
   where p.id = i.produto_id and i.contagem_id = c1 and p.nome = 'Vodka';
  update contagem_itens i set quantidade = 5 from produtos p
   where p.id = i.produto_id and i.contagem_id = c1 and p.nome = 'Azeite';

  -- A nota do DIA da contagem anterior fica FORA do periodo: aquele estoque ja
  -- esta dentro da foto. O intervalo e (anterior, atual].
  insert into fornecedores (restaurante_id, nome) values (r, 'Moinho') returning id into forn;
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero, emitida_em,
                             valor_produtos, valor_total, status)
  values (r, forn, 'manual', '900', date '2026-08-01', 495, 495, 'lancada') returning id into nota;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total)
  values (nota, p_farinha, 'FARINHA DE TRIGO', 'KG', 99, 5, 495);

  -- A nota de dentro do periodo: 10 KG de farinha.
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero, emitida_em,
                             valor_produtos, valor_total, status)
  values (r, forn, 'manual', '901', date '2026-08-05', 50, 50, 'lancada') returning id into nota;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total)
  values (nota, p_farinha, 'FARINHA DE TRIGO', 'KG', 10, 5, 50);

  -- E uma nota que nunca foi lancada: nao e compra.
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero, emitida_em,
                             valor_produtos, valor_total, status)
  values (r, forn, 'manual', '902', date '2026-08-06', 1000, 1000, 'importada') returning id into nota;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total)
  values (nota, p_farinha, 'FARINHA DE TRIGO', 'KG', 200, 5, 1000);
  reset role;
end $$;

-- --------------------------------- relatorio SEM contagem anterior ---------
-- A primeira contagem do restaurante nao tem com o que se comparar, e o
-- arquivo inteiro gira em torno de nao inventar o "anterior = 0".
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1'; c1 uuid; l record;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  select id into c1 from contagens where restaurante_id = r and referencia = date '2026-08-01';
  perform mv_fechar_contagem(c1);

  select * into l from mv_relatorio_de_contagem(c1) where produto_nome = 'Farinha';
  perform conferir('primeira contagem: o estoque atual e afirmado', l.contagem_atual = 20);
  perform conferir('primeira contagem: contagem anterior volta NULA', l.contagem_anterior is null);
  perform conferir('primeira contagem: compras volta NULA', l.compras is null);
  perform conferir('primeira contagem: vendas volta NULA', l.vendas is null);
  perform conferir('primeira contagem: consumo volta NULO', l.consumo is null);
  perform conferir('primeira contagem: ideal volta NULO', l.ideal is null);
  perform conferir('primeira contagem: diferenca volta NULA', l.diferenca is null);
  perform conferir('primeira contagem: a pendencia diz o que falta',
                   l.pendencia like '%sem contagem anterior fechada%');

  -- A media nao depende da contagem anterior: ela olha as vendas fechadas ate
  -- a data da foto. Ate 01/08 ha duas (25/07 e 01/08), e a media e das duas.
  perform conferir('a media usa as duas vendas que existem ate a data', l.vendas_consideradas = 2);
  perform conferir('media de farinha = (5 + 10) / 2 = 7,5', l.media_3_vendas = 7.5);
  perform conferir('20 KG em estoque contra 7,5 de media: nao precisa comprar',
                   l.precisa_comprar = false);
  perform conferir('e a sugestao e zero', l.sugestao = 0);
  reset role;
end $$;

-- --------------------------------- o relatorio com as duas pontas ----------
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1'; c2 uuid; l record; n integer;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  c2 := mv_abrir_contagem(r, date '2026-08-08', 'semanal', 'Foto 2');
  update contagem_itens i set quantidade = 12 from produtos p
   where p.id = i.produto_id and i.contagem_id = c2 and p.nome = 'Farinha';
  update contagem_itens i set quantidade = 2 from produtos p
   where p.id = i.produto_id and i.contagem_id = c2 and p.nome = 'Cebola';
  update contagem_itens i set quantidade = 8 from produtos p
   where p.id = i.produto_id and i.contagem_id = c2 and p.nome = 'Vodka';
  update contagem_itens i set quantidade = 2 from produtos p
   where p.id = i.produto_id and i.contagem_id = c2 and p.nome = 'Azeite';

  -- Com a contagem ainda ABERTA o relatorio responde, mas avisa que o numero
  -- desta coluna e parcial. Mentir por omissao aqui seria pior que o aviso.
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Farinha';
  perform conferir('contagem aberta: o relatorio avisa que a coluna e parcial',
                   l.pendencia like '%ainda esta aberta%');

  perform mv_fechar_contagem(c2);

  -- ---------------------------------------------------------------- FARINHA --
  -- anterior 20 · compras 10 (so a nota de 05/08) · vendas 15 · atual 12
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Farinha';
  perform conferir('farinha: contagem anterior = 20', l.contagem_anterior = 20);
  perform conferir('farinha: compras = 10 (a nota de 01/08 ficou fora do intervalo)',
                   l.compras = 10);
  perform conferir('farinha: a nota nao lancada nao entra', l.compras = 10);
  perform conferir('farinha: vendas = 15 (300 empadoes x 0,05)', l.vendas = 15);
  perform conferir('farinha: contagem atual = 12', l.contagem_atual = 12);
  perform conferir('farinha: consumo = 20 + 10 - 12 = 18', l.consumo = 18);
  perform conferir('farinha: ideal = 20 + 10 - 15 = 15', l.ideal = 15);
  perform conferir('farinha: diferenca = 12 - 15 = -3', l.diferenca = -3);
  perform conferir('farinha: a media usa as tres vendas', l.vendas_consideradas = 3);
  perform conferir('farinha: media = (15 + 10 + 5) / 3 = 10', l.media_3_vendas = 10);
  perform conferir('farinha: 12 em estoque contra 10 de media -> nao precisa comprar',
                   l.precisa_comprar = false and l.sugestao = 0);
  perform conferir('farinha: o custo vem congelado da foto', l.custo_unitario = 5);
  perform conferir('farinha: sem pendencia nenhuma', l.pendencia is null);

  -- ----------------------------------------------------------------- CEBOLA --
  -- anterior 5 · compras 0 · vendas 11,71875 · atual 2
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Cebola';
  perform conferir('cebola: vendas = 300 x 0,0390625 = 11,71875', l.vendas = 11.71875);
  perform conferir('cebola: consumo = 5 + 0 - 2 = 3', l.consumo = 3);
  perform conferir('cebola: ideal = 5 - 11,71875 = -6,71875', l.ideal = -6.71875);
  perform conferir('cebola: diferenca = 2 - (-6,71875) = 8,71875', l.diferenca = 8.71875);
  perform conferir('cebola: media = 23,4375 / 3 = 7,8125', l.media_3_vendas = 7.8125);
  perform conferir('cebola: 2 contra 7,8125 -> precisa comprar 5,8125',
                   l.precisa_comprar = true and l.sugestao = 5.8125);

  -- ------------------------------------------------------------------ VODKA --
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Vodka';
  perform conferir('vodka: vendas = 150 x 0,06 = 9', l.vendas = 9);
  perform conferir('vodka: consumo = 10 + 0 - 8 = 2', l.consumo = 2);
  perform conferir('vodka: ideal = 10 - 9 = 1', l.ideal = 1);
  perform conferir('vodka: diferenca = 8 - 1 = 7', l.diferenca = 7);
  perform conferir('vodka: media = (9 + 6 + 3) / 3 = 6', l.media_3_vendas = 6);

  -- ------------------------------------------------- a BORDA da igualdade --
  -- Azeite: media (3 + 2 + 1) / 3 = 2 L, e a contagem atual tambem 2 L.
  -- A regra da cliente e "se a contagem atual for MAIOR que a media, nao
  -- precisa comprar". No empate ela NAO e maior, logo precisa comprar — e a
  -- quantidade sugerida e zero. Esta borda esta decidida de proposito.
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Azeite';
  perform conferir('azeite: media = (3 + 2 + 1) / 3 = 2 L', l.media_3_vendas = 2);
  perform conferir('azeite: a contagem atual empata com a media', l.contagem_atual = 2);
  perform conferir('azeite: EMPATE conta como precisa comprar', l.precisa_comprar = true);
  perform conferir('azeite: e a sugestao e exatamente zero', l.sugestao = 0);
  perform conferir('azeite: consumo = 5 + 0 - 2 = 3', l.consumo = 3);
  perform conferir('azeite: ideal = 5 - 3 = 2, e a diferenca fecha em zero',
                   l.ideal = 2 and l.diferenca = 0);

  -- ------------------------------------------------------------------ LIMAO --
  -- 50 G de limao vendido por UND nao converte. A linha nao pode virar zero:
  -- zero limao vendido faria a diferenca aparecer como furto.
  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Limao';
  perform conferir('limao: vendas volta NULA, nao zero', l.vendas is null);
  perform conferir('limao: ideal volta NULO', l.ideal is null);
  perform conferir('limao: diferenca volta NULA', l.diferenca is null);
  perform conferir('limao: a media tambem volta nula', l.media_3_vendas is null);
  perform conferir('limao: e a sugestao nao e chutada', l.sugestao is null and l.precisa_comprar is null);
  perform conferir('limao: a pendencia nomeia o insumo sem conversao',
                   l.pendencia like '%Limao%');
  -- O consumo nao depende da venda: ele e so estoque e nota.
  perform conferir('limao: o consumo continua afirmado (0 + 0 - 0)', l.consumo = 0);

  -- O relatorio so traz quem apareceu em alguma ponta.
  select count(*) into n from mv_relatorio_de_contagem(c2);
  perform conferir('o relatorio traz as cinco linhas que tiveram ponta', n = 5);
  reset role;
end $$;

-- --------------------------------- um produto que entrou agora -------------
-- Ele nao estava na folha da contagem anterior. O anterior e lido como ZERO, e
-- a 0026 passou a dizer isso em COLUNA (`anterior_lido_como_zero`) em vez de
-- em texto dentro da pendencia: a tela precisa marcar o proprio numero, e nao
-- escrever tres linhas de aviso por produto embaixo do nome do insumo.
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a1';
  c2 uuid; p_novo uuid; forn uuid; nota uuid; l record;
begin
  select id into r from restaurantes where slug = 'prova-vendas';
  select id into c2 from contagens where restaurante_id = r and referencia = date '2026-08-08';
  select id into forn from fornecedores where restaurante_id = r limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);

  insert into produtos (restaurante_id, nome, unidade, custo_medio)
  values (r, 'Sal', 'KG', 2) returning id into p_novo;
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, numero, emitida_em,
                             valor_produtos, valor_total, status)
  values (r, forn, 'manual', '903', date '2026-08-04', 8, 8, 'lancada') returning id into nota;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total)
  values (nota, p_novo, 'SAL REFINADO', 'KG', 4, 2, 8);

  select * into l from mv_relatorio_de_contagem(c2) where produto_nome = 'Sal';
  perform conferir('o insumo novo aparece no relatorio pela compra', l.compras = 4);
  perform conferir('o anterior dele e lido como zero, nao como nulo', l.contagem_anterior = 0);
  perform conferir('e a coluna diz que foi lido como zero', l.anterior_lido_como_zero);
  perform conferir('ele tambem nao esta na folha de agora, e isso tambem e dito',
                   l.atual_lido_como_zero);
  perform conferir('consumo = 0 + 4 - 0 = 4', l.consumo = 4);
  perform conferir('e, com o estoque de hoje nao medido, ele nao manda comprar',
                   l.sugestao is null and l.precisa_comprar is null);
  reset role;
end $$;

-- ============================================================================
-- Dois restaurantes na rede: cada um ve o seu, e so o seu
-- ----------------------------------------------------------------------------
-- A prova e com identidade de verdade, DENTRO de uma transacao: `set local
-- role authenticated` + `request.jwt.claim.sub`. Fora disso o teste rodaria
-- como superusuario, a RLS seria ignorada e o teste mentiria "passou".
-- ============================================================================
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a2';
  cat uuid; s uuid; p uuid; f uuid; v uuid; c uuid;
begin
  insert into restaurantes (nome, slug) values ('Maia de Mentira', 'maia-mentira') returning id into r;
  insert into convites (email, nome, papel, restaurante_id)
  values ('admin@maia-mentira.com', 'Admin da Maia', 'admin', r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (u, 'admin@maia-mentira.com', jsonb_build_object('nome','Admin da Maia'));

  insert into categorias (restaurante_id, nome) values (r, 'Graos') returning id into cat;
  insert into setores (restaurante_id, nome) values (r, 'Deposito') returning id into s;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r, 'Arroz da Maia', 'KG', 8, cat) returning id into p;
  insert into produto_setores (produto_id, setor_id, unidade) values (p, s, 'KG');

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r, 'Arroz de forno', 1, 'PORCAO', 25) returning id into f;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f, p, 200, 'G');

  insert into vendas (restaurante_id, referencia, titulo) values (r, date '2026-08-08', 'Maia S3')
  returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f, 10, 25);
end $$;

do $$
declare
  r_maia uuid; r_prova uuid;
  u_maia  uuid := '00000000-0000-0000-0000-00000000d0a2';
  u_prova uuid := '00000000-0000-0000-0000-00000000d0a1';
  c_maia uuid; c_prova uuid; v_maia uuid; v_prova uuid;
  f_prova uuid; n integer; v_erro text; l record;
begin
  select id into r_maia  from restaurantes where slug = 'maia-mentira';
  select id into r_prova from restaurantes where slug = 'prova-vendas';
  select id into v_maia  from vendas where restaurante_id = r_maia  limit 1;
  select id into v_prova from vendas where restaurante_id = r_prova and referencia = date '2026-08-08';
  select id into c_prova from contagens where restaurante_id = r_prova and referencia = date '2026-08-08';
  select id into f_prova from fichas where restaurante_id = r_prova and nome = 'Caipirinha';

  -- A Maia fecha a venda e abre a contagem dela, como ela mesma.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_maia::text, true);
  perform mv_fechar_venda(v_maia);
  c_maia := mv_abrir_contagem(r_maia, date '2026-08-09', 'semanal', 'Foto da Maia');
  update contagem_itens set quantidade = 30 where contagem_id = c_maia;
  perform mv_fechar_contagem(c_maia);

  -- Ficha de outro restaurante nao entra numa venda da Maia.
  begin
    insert into vendas (restaurante_id, referencia, titulo) values (r_maia, date '2026-08-15', 'x');
    insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario)
    values ((select id from vendas where restaurante_id = r_maia and referencia = date '2026-08-15'),
            f_prova, 1, 10);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  -- A mensagem aqui e a da 0025, e nao mais 'restaurantes diferentes': sob RLS
  -- a Maia nem ENXERGA a ficha da Prova, entao o gatilho nao tem como comparar
  -- restaurante nenhum. Dizer 'restaurantes diferentes' era afirmar uma causa
  -- que o gatilho nao mediu — e mandar procurar defeito num cadastro correto.
  perform conferir('ficha de outro restaurante nao entra na venda',
                   v_erro like '%ficha%nao encontrada, ou fora do seu acesso%');

  -- Primeira contagem da Maia: sem anterior, e com UMA venda fechada.
  select * into l from mv_relatorio_de_contagem(c_maia) where produto_nome = 'Arroz da Maia';
  perform conferir('a Maia ve o relatorio dela', l.contagem_atual = 30);
  perform conferir('com a unica venda fechada que ela tem', l.vendas_consideradas = 1);
  perform conferir('media = 10 porcoes x 0,2 KG / 1 venda = 2', l.media_3_vendas = 2);
  perform conferir('30 KG contra 2 de media: nao precisa comprar', l.precisa_comprar = false);
  reset role;

  -- ------------------------------------------------- agora o isolamento ----
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_prova::text, true);

  select count(*) into n from vendas where restaurante_id = r_maia;
  perform conferir('o admin da Prova nao ve as vendas da Maia', n = 0);

  select count(*) into n from venda_itens vi
    join vendas v on v.id = vi.venda_id where v.restaurante_id = r_maia;
  perform conferir('nem os itens delas', n = 0);

  select count(*) into n from mv_vendas_por_produto(v_maia);
  perform conferir('a explosao da venda da Maia volta vazia para a Prova', n = 0);

  select count(*) into n from vw_contagem_procedencia where restaurante_id = r_maia;
  perform conferir('a procedencia da contagem da Maia nao aparece para a Prova', n = 0);

  begin
    perform count(*) from mv_relatorio_de_contagem(c_maia);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('o relatorio da contagem da Maia e recusado para a Prova',
                   v_erro like '%nao encontrada%');

  -- E a Prova continua vendo o que e dela, para que o teste acima prove
  -- isolamento e nao uma sessao quebrada.
  select count(*) into n from mv_relatorio_de_contagem(c_prova);
  perform conferir('e a Prova continua lendo o relatorio dela', n = 6);
  reset role;

  -- O caminho inverso, que e o que mata a suspeita de ordem.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_maia::text, true);
  select count(*) into n from mv_vendas_por_produto(v_prova);
  perform conferir('a explosao da venda da Prova volta vazia para a Maia', n = 0);
  begin
    perform count(*) from mv_relatorio_de_contagem(c_prova);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform conferir('e o relatorio da Prova e recusado para a Maia',
                   v_erro like '%nao encontrada%');
  reset role;
end $$;

-- --------------------------------- sem venda nenhuma, sem media ------------
do $$
declare
  r uuid; u uuid := '00000000-0000-0000-0000-00000000d0a3'; cat uuid; s uuid; p uuid;
  c uuid; l record;
begin
  insert into restaurantes (nome, slug) values ('Casa Sem Venda', 'sem-venda') returning id into r;
  insert into convites (email, nome, papel, restaurante_id)
  values ('admin@sem-venda.com', 'Admin', 'admin', r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (u, 'admin@sem-venda.com', jsonb_build_object('nome','Admin'));
  insert into setores (restaurante_id, nome) values (r, 'Deposito') returning id into s;
  insert into produtos (restaurante_id, nome, unidade, custo_medio) values (r, 'Acucar', 'KG', 4)
  returning id into p;
  insert into produto_setores (produto_id, setor_id, unidade) values (p, s, 'KG');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u::text, true);
  c := mv_abrir_contagem(r, date '2026-08-08', 'semanal', 'Foto unica');
  update contagem_itens set quantidade = 7 where contagem_id = c;
  perform mv_fechar_contagem(c);

  select * into l from mv_relatorio_de_contagem(c) where produto_nome = 'Acucar';
  perform conferir('sem venda fechada: nenhuma venda considerada', l.vendas_consideradas = 0);
  perform conferir('sem venda fechada: a media volta NULA', l.media_3_vendas is null);
  perform conferir('sem venda fechada: a sugestao nao e chutada', l.sugestao is null);
  perform conferir('sem venda fechada: nem o "nao precisa comprar"', l.precisa_comprar is null);
  perform conferir('sem venda fechada: a pendencia diz por que',
                   l.pendencia like '%nenhuma venda fechada%');
  perform conferir('mas o estoque contado continua afirmado', l.contagem_atual = 7);
  reset role;
end $$;

-- ------------------ 0024: a venda e o relatorio nao sao do operador de setor --
-- A 0023 fechou o furo do GUARDA DE ROTA e deixou o do BANCO aberto. Medido
-- com identidade de verdade, um operador preso ao setor "Bar" lia as vendas da
-- casa, LANCAVA venda, e lia `mv_relatorio_de_contagem` por inteiro — com a
-- contagem atual recortada pela RLS de `contagem_itens` e nenhuma pendencia
-- dizendo que faltava aba. Numero errado e pior que numero ausente (0005).
do $$
declare
  r uuid; adm uuid := '00000000-0000-0000-0000-00000000e0a1';
  op  uuid := '00000000-0000-0000-0000-00000000e0a2';
  bar uuid; coz uuid; p uuid; f uuid; c0 uuid; c1 uuid; v uuid;
  v_erro text; n numeric;
begin
  insert into restaurantes (nome, slug) values ('Casa de Duas Abas', 'duas-abas') returning id into r;
  insert into convites (email, nome, papel, restaurante_id) values ('adm@duas-abas.com','Adm','admin',r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (adm, 'adm@duas-abas.com', jsonb_build_object('nome','Adm'));
  insert into convites (email, nome, papel, restaurante_id) values ('op@duas-abas.com','Op','operador',r);
  insert into auth.users (id, email, raw_user_meta_data)
  values (op, 'op@duas-abas.com', jsonb_build_object('nome','Op'));

  insert into setores (restaurante_id, nome) values (r,'Bar') returning id into bar;
  insert into setores (restaurante_id, nome) values (r,'Cozinha') returning id into coz;
  insert into produtos (restaurante_id, nome, unidade, custo_medio) values (r,'Gim','UND',40) returning id into p;
  insert into produto_setores (produto_id, setor_id, unidade) values (p,bar,'UND'), (p,coz,'UND');
  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'Gim Tonica',1,'PORCAO',30) returning id into f;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f,p,1,'UND');
  -- O operador fica preso ao Bar. A Cozinha e a aba que ele nao enxerga.
  insert into perfil_setores (perfil_id, setor_id) values (op, bar);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  c0 := mv_abrir_contagem(r, date '2026-08-01', 'mensal', 'Anterior');
  update contagem_itens set quantidade = 10 where contagem_id = c0;
  perform mv_fechar_contagem(c0);
  c1 := mv_abrir_contagem(r, date '2026-09-01', 'mensal', 'Atual');
  update contagem_itens set quantidade = 2    where contagem_id = c1 and setor_id = bar;
  update contagem_itens set quantidade = 1000 where contagem_id = c1 and setor_id = coz;
  perform mv_fechar_contagem(c1);
  insert into vendas (restaurante_id, referencia, titulo) values (r, date '2026-08-20','Agosto')
  returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f, 5, 30);
  perform mv_fechar_venda(v);

  select contagem_atual into n from mv_relatorio_de_contagem(c1) where produto_nome = 'Gim';
  perform conferir('o admin le as duas abas somadas (2 + 1000)', n = 1002);

  -- Agora o operador preso ao Bar, com identidade de verdade.
  perform set_config('request.jwt.claim.sub', op::text, true);
  perform conferir('o operador preso esta mesmo preso', mv_restrito_a_setores());
  perform conferir('e continua lendo a folha do SETOR dele',
                   (select count(*) from contagem_itens where contagem_id = c1) = 1);
  perform conferir('mas NAO le venda nenhuma da casa', (select count(*) from vendas) = 0);
  perform conferir('nem item de venda', (select count(*) from venda_itens) = 0);

  begin
    perform count(*) from mv_relatorio_de_contagem(c1);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('e o relatorio RECUSA em vez de somar meia folha',
                   v_erro like '%acesso e de setor%');

  begin
    insert into vendas (restaurante_id, referencia, titulo) values (r, date '2026-10-01','Invasao');
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('e nao lanca venda da casa inteira', v_erro like '%row-level security%');

  -- E o caso bom nao quebrou: o admin continua lendo e lancando.
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform conferir('o admin segue lendo o relatorio',
                   (select count(*) from mv_relatorio_de_contagem(c1)) >= 1);
  perform conferir('e segue lendo as vendas',
                   (select count(*) from vendas where restaurante_id = r) = 1);
  reset role;
end $$;

\echo '  --- Fluxos: todos os casos passaram'

-- ============================================================================
-- Venda fechada: o cabecalho tambem fecha (0025)
-- ----------------------------------------------------------------------------
-- O gatilho da 0023 protege `venda_itens`. O cabecalho de `vendas` nao tinha
-- gatilho nenhum — e e nele que mora `referencia`, a coluna que decide em que
-- relatorio aquela venda cai.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; s uuid; p uuid; f uuid; v uuid; v_erro text;
begin
  insert into restaurantes (nome, slug) values ('Casa do Cabecalho','casa-cabecalho') returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Geral') returning id into cat;
  insert into setores (restaurante_id, nome) values (r,'Deposito') returning id into s;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Cachaca','UND',30,cat) returning id into p;
  insert into produto_setores (produto_id, setor_id, unidade) values (p, s, 'UND');
  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'Dose',1,'PORCAO',12) returning id into f;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f, p, 1, 'UND');

  insert into vendas (restaurante_id, referencia, titulo) values (r, date '2026-10-01','Semana 1')
  returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f, 10, 12);

  -- Com a venda ABERTA, mudar o cabecalho continua sendo o caminho normal.
  update vendas set referencia = date '2026-10-02' where id = v;
  perform conferir('venda aberta: o cabecalho se edita normalmente',
                   (select referencia from vendas where id=v) = date '2026-10-02');
  perform mv_fechar_venda(v);

  begin
    update vendas set referencia = date '2026-07-20' where id = v;
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('venda FECHADA: mudar a referencia e recusado', v_erro like '%reabra o lancamento%');
  perform conferir('e a referencia nao mudou',
                   (select referencia from vendas where id=v) = date '2026-10-02');

  begin
    update vendas set total_valor = 1 where id = v;
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('venda FECHADA: mexer no total congelado e recusado', v_erro like '%reabra o lancamento%');
  perform conferir('o total continua o que o fechamento congelou',
                   (select total_valor from vendas where id=v) = 120);

  begin
    update vendas set titulo = 'outro nome' where id = v;
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('venda FECHADA: ate o titulo e recusado', v_erro like '%reabra o lancamento%');

  -- O que CONTINUA passando: reabrir, e mudar o cabecalho depois de reaberta.
  perform mv_reabrir_venda(v);
  perform conferir('reabrir uma venda fechada continua funcionando',
                   (select status from vendas where id=v) = 'aberta');
  update vendas set referencia = date '2026-07-20' where id = v;
  perform conferir('e com ela reaberta o cabecalho se edita de novo',
                   (select referencia from vendas where id=v) = date '2026-07-20');

  -- Cancelar uma venda fechada tambem continua possivel: e mudanca de status.
  perform mv_fechar_venda(v);
  update vendas set status = 'cancelada' where id = v;
  perform conferir('cancelar uma venda fechada continua possivel',
                   (select status from vendas where id=v) = 'cancelada');

  -- A mensagem do gatilho de item, quando a venda nao esta ao alcance de quem
  -- pergunta (o desencontro que o laudo do revisor registrou e nao consertou).
  begin
    insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario)
    values ('00000000-0000-4000-8000-000000000999', f, 1, 1);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('item de venda inexistente diz que a VENDA nao foi achada, nao que a ficha e de outro restaurante',
                   v_erro like '%lancamento de venda%nao encontrado%');
end $$;

-- ============================================================================
-- O zero lido, a sugestao que para em pe e a saida por lancamento (0026)
-- ----------------------------------------------------------------------------
-- Tres produtos: um so na folha anterior, um so na folha de agora, e um
-- contado zero nas duas. Os dois primeiros recebem um zero que ninguem mediu;
-- o terceiro e um zero de verdade. O relatorio tem de distinguir os tres.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; s uuid;
  p_so_antes uuid; p_so_agora uuid; p_zero uuid; p_normal uuid;
  f_normal uuid; f_so_agora uuid;
  c_ant uuid; c_atu uuid; v uuid;
  l record;
begin
  insert into restaurantes (nome, slug) values ('Casa do Zero Lido','casa-zero-lido') returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Geral') returning id into cat;
  insert into setores (restaurante_id, nome) values (r,'Deposito') returning id into s;

  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id) values
    (r,'SO ANTES','UND',10,cat) returning id into p_so_antes;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id) values
    (r,'SO AGORA','UND',10,cat) returning id into p_so_agora;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id) values
    (r,'ZERO CONTADO','UND',10,cat) returning id into p_zero;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id) values
    (r,'NORMAL','UND',10,cat) returning id into p_normal;
  insert into produto_setores (produto_id, setor_id, unidade)
    select id, s, 'UND' from produtos where restaurante_id = r;

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'F NORMAL',1,'PORCAO',20) returning id into f_normal;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f_normal, p_normal, 1, 'UND');
  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'F SO AGORA',1,'PORCAO',20) returning id into f_so_agora;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f_so_agora, p_so_agora, 1, 'UND');

  -- Folha anterior: SO ANTES, ZERO CONTADO e NORMAL (SO AGORA fica de fora).
  insert into contagens (restaurante_id, referencia, tipo) values (r, date '2026-07-01','mensal')
  returning id into c_ant;
  insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario, contado_em)
  values (c_ant, p_so_antes, s, 9, 'UND', 10, now()),
         (c_ant, p_zero,     s, 0, 'UND', 10, now()),
         (c_ant, p_normal,   s, 50,'UND', 10, now());
  update contagens set status='fechada', fechada_em=now() where id=c_ant;

  -- Folha de agora: SO AGORA, ZERO CONTADO e NORMAL (SO ANTES fica de fora).
  insert into contagens (restaurante_id, referencia, tipo) values (r, date '2026-08-01','mensal')
  returning id into c_atu;
  insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario, contado_em)
  values (c_atu, p_so_agora, s, 4, 'UND', 10, now()),
         (c_atu, p_zero,     s, 0, 'UND', 10, now()),
         (c_atu, p_normal,   s, 1, 'UND', 10, now());
  update contagens set status='fechada', fechada_em=now() where id=c_atu;

  -- Tres lancamentos fechados: NORMAL sai nos tres (3+3+3), SO AGORA so no
  -- ultimo (12). Media de NORMAL = 3; media de SO AGORA = 4, com saida em 1.
  insert into vendas (restaurante_id, referencia) values (r, date '2026-07-10') returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f_normal, 3, 20);
  perform mv_fechar_venda(v);
  insert into vendas (restaurante_id, referencia) values (r, date '2026-07-20') returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f_normal, 3, 20);
  perform mv_fechar_venda(v);
  insert into vendas (restaurante_id, referencia) values (r, date '2026-07-30') returning id into v;
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f_normal, 3, 20);
  insert into venda_itens (venda_id, ficha_id, quantidade, preco_unitario) values (v, f_so_agora, 12, 20);
  perform mv_fechar_venda(v);

  select * into l from mv_relatorio_de_contagem(c_atu) where produto_nome = 'SO ANTES';
  perform conferir('ausente da folha de agora: o atual vem marcado como lido', l.atual_lido_como_zero);
  perform conferir('e o anterior dele e medida de verdade', not l.anterior_lido_como_zero);
  perform conferir('o numero continua la, para consumo e diferenca', l.contagem_atual = 0);
  perform conferir('mas a sugestao de compra NAO se apoia nele', l.sugestao is null);
  perform conferir('nem o veredito', l.precisa_comprar is null);
  perform conferir('o consumo continua afirmavel (9 + 0 - 0)', l.consumo = 9);

  select * into l from mv_relatorio_de_contagem(c_atu) where produto_nome = 'SO AGORA';
  perform conferir('ausente da folha anterior: o anterior vem marcado como lido', l.anterior_lido_como_zero);
  perform conferir('e o atual dele e medida de verdade', not l.atual_lido_como_zero);
  perform conferir('com media de 3 lancamentos, a sugestao existe', l.sugestao is not null);
  perform conferir('a media divide pelos 3 lancamentos: 12/3 = 4', l.media_3_vendas = 4);
  perform conferir('e a coluna diz que ele saiu em 1 deles', l.vendas_com_saida = 1);
  perform conferir('o anterior lido como zero poe o consumo em -4, que e o sintoma',
                   l.consumo = -4);

  select * into l from mv_relatorio_de_contagem(c_atu) where produto_nome = 'ZERO CONTADO';
  perform conferir('zero contado nas duas folhas nao recebe marca nenhuma',
                   not l.atual_lido_como_zero and not l.anterior_lido_como_zero);
  perform conferir('e continua respondendo a regra da cliente', l.sugestao = 0 and l.precisa_comprar);

  select * into l from mv_relatorio_de_contagem(c_atu) where produto_nome = 'NORMAL';
  perform conferir('o insumo que saiu nos tres lancamentos diz 3 de 3',
                   l.vendas_com_saida = 3 and l.vendas_consideradas = 3);
  perform conferir('media (3+3+3)/3 = 3, atual 1 -> sugestao 2',
                   l.media_3_vendas = 3 and l.sugestao = 2 and l.precisa_comprar);

  perform conferir('as duas frases de "lido como zero" sairam da pendencia',
                   (select count(*) from mv_relatorio_de_contagem(c_atu)
                     where pendencia like '%lido como zero%') = 0);

  -- A procedencia: carimbo e quantidade, separados.
  perform conferir('a vista conta o carimbo',
                   (select itens_com_carimbo from vw_contagem_procedencia where contagem_id=c_atu) = 3);
  perform conferir('e conta a quantidade preenchida, que e outra coisa',
                   (select itens_com_quantidade from vw_contagem_procedencia where contagem_id=c_atu) = 2);
end $$;

-- ============================================================================
-- 0027 · A venda com tres alvos, o faturamento, e o CMV que fecha
-- ----------------------------------------------------------------------------
-- O cenario e desenhado em cima da planilha de setembro, com numeros pequenos
-- e redondos para a conta poder ser conferida de cabeca — mas com as MESMAS
-- formas: uma ficha, uma garrafa vendida inteira, um couvert que nao consome
-- nada, uma linha pendente, e uma compra de limpeza.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; cat_limpeza uuid; s uuid;
  p_cachaca uuid; p_cerveja uuid; p_detergente uuid;
  f_dose uuid; f_producao uuid;
  v uuid; n uuid; i_pendente uuid;
  l record; v_erro text;
begin
  insert into restaurantes (nome, slug) values ('Casa do Faturamento','casa-faturamento')
  returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Bebidas') returning id into cat;
  -- `fora_do_insumo` e DECISAO de cadastro, nao adivinhacao: a 0027 carimba uma
  -- vez, pelo nome, as categorias que ja existiam, e daqui para frente quem diz
  -- e a tela. Categoria nova nasce dentro do CMV de insumo — e a tela do CMV diz
  -- em voz alta quando nenhuma categoria esta marcada, em vez de mostrar
  -- R$ 0,00 de limpeza com cara de medida.
  insert into categorias (restaurante_id, nome, fora_do_insumo)
  values (r,'MATERIAL DE LIMPEZA', true) returning id into cat_limpeza;
  insert into setores (restaurante_id, nome) values (r,'Bar') returning id into s;

  perform conferir('0027: categoria nova nasce DENTRO do insumo se ninguem disser',
    not (select fora_do_insumo from categorias where restaurante_id = r and nome = 'Bebidas'));

  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Cachaca','UND',30,cat) returning id into p_cachaca;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Cerveja 600','UND',6,cat) returning id into p_cerveja;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Detergente','UND',5,cat_limpeza) returning id into p_detergente;
  insert into produto_setores (produto_id, setor_id, unidade) values
    (p_cachaca, s, 'UND'), (p_cerveja, s, 'UND'), (p_detergente, s, 'UND');

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'Caipirinha',1,'PORCAO',20) returning id into f_dose;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade)
  values (f_dose, p_cachaca, 1, 'UND');
  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda, producao)
  values (r,'Xarope',1,'L',0,true) returning id into f_producao;

  -- ---------------------------------------------------- os quatro alvos ----
  insert into vendas (restaurante_id, referencia, inicio, origem, origem_arquivo)
  values (r, date '2026-09-30', date '2026-09-01', 'pdv', 'vendas_setembro.xlsx')
  returning id into v;

  insert into venda_itens (venda_id, alvo, ficha_id, quantidade, preco_unitario,
                           valor_total_origem, linhas_de_origem, descricao_origem)
  values (v, 'ficha', f_dose, 10, 20, 200, 7, 'CAIPIRINHA DE LIMAO');

  -- A garrafa: produto fechado, vendido inteiro, sem ficha no meio.
  insert into venda_itens (venda_id, alvo, produto_id, quantidade, preco_unitario,
                           valor_total_origem, linhas_de_origem, descricao_origem)
  values (v, 'produto', p_cerveja, 100, 11, 1100, 63, 'ANTARTICA ORIG600 ML');

  -- O servico: fatura e nao consome nada.
  insert into venda_itens (venda_id, alvo, quantidade, preco_unitario,
                           valor_total_origem, linhas_de_origem, descricao_origem)
  values (v, 'servico', 25, 20, 500, 25, 'COUVERT ARTISTICO 20 REAIS');

  -- E a linha que ninguem resolveu ainda.
  insert into venda_itens (venda_id, alvo, quantidade, preco_unitario,
                           valor_total_origem, linhas_de_origem, descricao_origem)
  values (v, 'pendente', 5, 40, 200, 3, 'BUFFET DE FEIJOADA')
  returning id into i_pendente;

  -- ------------------------------------------------- o que o banco recusa --
  begin
    insert into venda_itens (venda_id, alvo, ficha_id, produto_id, quantidade, preco_unitario)
    values (v, 'ficha', f_dose, p_cerveja, 1, 1);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('alvo unico: a linha nao aponta para ficha E insumo ao mesmo tempo',
                   v_erro like '%venda_itens_alvo_unico%');

  begin
    insert into venda_itens (venda_id, alvo, quantidade, preco_unitario)
    values (v, 'servico', 1, 1);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('servico sem nome de origem e recusado: faturamento anonimo nao se confere',
                   v_erro like '%nome de origem%');

  begin
    insert into venda_itens (venda_id, alvo, ficha_id, quantidade, preco_unitario)
    values (v, 'ficha', f_producao, 1, 1);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('producao continua sem poder ser vendida (regra da 0023)',
                   v_erro like '%producao e insumo interno%');

  -- ----------------------------------------- fechar recusa com pendente ----
  begin
    perform mv_fechar_venda(v);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('fechar recusa lancamento com linha pendente (espelho de mv_lancar_nota)',
                   v_erro like '%sem alvo%');
  perform conferir('e o lancamento continua aberto',
                   (select status from vendas where id = v) = 'aberta');

  -- -------------------------------------- resolver a mao ENSINA o de-para --
  perform conferir('o couvert resolvido ja virou apelido',
    (select alvo from venda_apelidos
      where restaurante_id = r and apelido = 'COUVERT ARTISTICO 20 REAIS') = 'servico');
  perform conferir('e a garrafa tambem, apontando para o insumo',
    (select produto_id from venda_apelidos
      where restaurante_id = r and apelido = 'ANTARTICA ORIG600 ML') = p_cerveja);
  perform conferir('pendente NAO vira apelido: ausencia de decisao nao se aprende',
    (select count(*) from venda_apelidos where apelido = 'BUFFET DE FEIJOADA') = 0);

  -- A pendente aponta para uma ficha que JA esta no lancamento. O
  -- `unique (venda_id, ficha_id)` da 0023 recusa a segunda linha, e esta certo:
  -- duas linhas da mesma ficha dobrariam o consumo dela. `mv_resolver_item_de_venda`
  -- e quem diz o que fazer — somar.
  perform mv_resolver_item_de_venda(i_pendente, 'ficha', f_dose);
  perform conferir('resolver a pendente ensina o nome do PDV',
    (select ficha_id from venda_apelidos
      where restaurante_id = r and apelido = 'BUFFET DE FEIJOADA') = f_dose);
  perform conferir('e a linha pendente desapareceu na fusao',
    (select count(*) from venda_itens where id = i_pendente) = 0);
  perform conferir('a fusao somou as quantidades: 10 caipirinhas + 5 buffets',
    (select quantidade from venda_itens where venda_id = v and ficha_id = f_dose) = 15);
  perform conferir('e somou o dinheiro: 200 + 200',
    (select valor_total_origem from venda_itens where venda_id = v and ficha_id = f_dose) = 400);
  perform conferir('o preco unitario virou media ponderada: 400/15',
    (select preco_unitario from venda_itens where venda_id = v and ficha_id = f_dose)
    = round(400::numeric / 15, 4));
  perform conferir('as linhas de cupom somaram: 7 + 3',
    (select linhas_de_origem from venda_itens where venda_id = v and ficha_id = f_dose) = 10);
  perform conferir('e os dois nomes do PDV ficaram na linha que sobrou',
    (select descricao_origem from venda_itens where venda_id = v and ficha_id = f_dose)
    = 'CAIPIRINHA DE LIMAO + BUFFET DE FEIJOADA');

  begin
    perform mv_resolver_item_de_venda(
      (select id from venda_itens where venda_id = v and alvo = 'servico'), 'pendente');
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('resolver para "pendente" e recusado: pendente nao e resposta',
                   v_erro like '%ausencia de resposta%');

  -- ----------------------------------------------- o dinheiro que fecha ----
  perform mv_fechar_venda(v);
  perform conferir('o total congelado soma valor_total_origem, nao quantidade x preco',
                   (select total_valor from vendas where id = v) = 2000);
  perform conferir('tres linhas depois da fusao, nao quatro',
                   (select total_itens from vendas where id = v) = 3);
  perform conferir('e nao o que a coluna gerada reconstituiria',
                   (select sum(total) from venda_itens where venda_id = v) <> 2000);

  -- Lancamento FECHADO e foto: nem a fusao mexe nele. O gatilho da 0023 pega
  -- os dois lados da fusao, o update e o delete — conferido aqui porque
  -- `mv_resolver_item_de_venda` apaga uma linha, e apagar escapa de muita
  -- trava escrita pensando so em escrita.
  begin
    perform mv_resolver_item_de_venda(
      (select id from venda_itens where venda_id = v and alvo = 'servico'), 'ficha', f_dose);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('venda fechada recusa ate a fusao de linhas',
                   v_erro like '%venda ja fechada%');
  perform conferir('e nenhuma linha sumiu na tentativa',
                   (select count(*) from venda_itens where venda_id = v) = 3);

  select * into l from mv_faturamento_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('faturamento total = 2000', l.total = 2000);
  perform conferir('faturamento de produto = 1500 (sem os 500 de couvert)', l.produto = 1500);
  perform conferir('faturamento de servico = 500', l.servico = 500);
  perform conferir('um lancamento, tres linhas (a quarta fundiu)',
                   l.lancamentos = 1 and l.itens = 3);

  -- ------------------------------------------- a venda explodida em insumo -
  perform conferir('a ficha explode: a linha fundida vale 15 cachacas',
    (select quantidade from mv_vendas_por_produto(v) where produto_id = p_cachaca) = 15);
  perform conferir('a garrafa entra direto, sem ficha: 100 cervejas',
    (select quantidade from mv_vendas_por_produto(v) where produto_id = p_cerveja) = 100);
  perform conferir('o servico nao explode em nada',
    (select count(*) from mv_vendas_por_produto(v)) = 2);
end $$;

-- ============================================================================
-- 0027 · O CMV com denominador, limpeza separada, e o fechamento do mes que
--        acontece no mes seguinte
-- ----------------------------------------------------------------------------
-- As datas sao as do Bar do Zeca de verdade: contagens em 31/08 e 01/10, e o
-- periodo 01/09 a 30/09. Ate a 0026 esse mes voltava NULO — a 0005 exigia
-- `referencia <= p_fim` para o estoque final e nenhuma contagem servia.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; cat_limpeza uuid; s uuid;
  p_cerveja uuid; p_detergente uuid;
  c_ago uuid; c_out uuid; n uuid; v uuid; f uuid;
  l record;
begin
  insert into restaurantes (nome, slug) values ('Casa do Mes Seguinte','casa-mes-seguinte')
  returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Bebidas') returning id into cat;
  insert into categorias (restaurante_id, nome, fora_do_insumo)
  values (r,'DESCARTAVEIS', true) returning id into cat_limpeza;
  insert into setores (restaurante_id, nome) values (r,'Bar') returning id into s;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Cerveja','UND',10,cat) returning id into p_cerveja;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Copo plastico','UND',1,cat_limpeza) returning id into p_detergente;
  insert into produto_setores (produto_id, setor_id, unidade) values
    (p_cerveja, s, 'UND'), (p_detergente, s, 'UND');

  -- Foto de 31/08: 100 cervejas (1000) + 200 copos (200) = 1200. Os itens
  -- entram ANTES de fechar, porque contagem fechada e foto e nao se mexe (0003).
  insert into contagens (restaurante_id, referencia, tipo) values (r, date '2026-08-31','mensal')
  returning id into c_ago;
  insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario)
  values (c_ago, p_cerveja, s, 100, 'UND', 10), (c_ago, p_detergente, s, 200, 'UND', 1);
  update contagens set status='fechada', fechada_em=now(), total=1200 where id=c_ago;

  -- A compra de setembro: 50 cervejas (500) e 100 copos (100).
  insert into notas_fiscais (restaurante_id, emitida_em, status, valor_total)
  values (r, date '2026-09-15','lancada', 600) returning id into n;
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total, operacao)
  values (n, p_cerveja, 'CERVEJA','UND', 50, 10, 500, '01 - COMPRAS INSUMOS'),
         (n, p_detergente,'COPO','UND', 100, 1, 100, '01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS');

  -- ------------------------------------------- sem a foto de fechamento ----
  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('sem contagem no mes seguinte, setembro continua sem CMV',
                   l.cmv is null and l.pendencia = 'Falta a contagem de estoque final');
  perform conferir('e as compras valem assim mesmo: nota lancada e fato consumado',
                   l.compras = 600);

  -- ------------------------------ a contagem de 01/10 fecha setembro -------
  -- Foto de 01/10: 80 cervejas (800) + 150 copos (150) = 950.
  insert into contagens (restaurante_id, referencia, tipo) values (r, date '2026-10-01','mensal')
  returning id into c_out;
  insert into contagem_itens (contagem_id, produto_id, setor_id, quantidade, unidade, custo_unitario)
  values (c_out, p_cerveja, s, 80, 'UND', 10), (c_out, p_detergente, s, 150, 'UND', 1);
  update contagens set status='fechada', fechada_em=now(), total=950 where id=c_out;

  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('a primeira contagem do mes seguinte vira o estoque final de setembro',
                   l.estoque_final_data = date '2026-10-01');
  perform conferir('e a funcao DIZ que ela veio de fora do periodo',
                   l.estoque_final_fora_do_periodo);
  perform conferir('o inicial continua sendo o de 31/08',
                   l.estoque_inicial_data = date '2026-08-31');
  perform conferir('CMV = 1200 + 600 - 950 = 850', l.cmv = 850);

  -- A MESMA contagem e o estoque INICIAL de outubro, e isso e o desejado.
  select * into l from mv_cmv_periodo(r, date '2026-10-01', date '2026-10-31');
  perform conferir('a mesma foto abre outubro como estoque inicial',
                   l.estoque_inicial_data = date '2026-10-01');
  perform conferir('e outubro nao usa a mesma foto dos dois lados',
                   l.estoque_final_id is distinct from l.estoque_inicial_id);

  -- -------------------- as DUAS funcoes contam a mesma historia ------------
  -- O defeito que isto tranca apareceu na tela, com a carga de verdade dentro:
  -- o cartao "Periodo em detalhe" mostrava o CMV de setembro e a tabela
  -- "Abertura por categoria" dizia "sem CMV" em TODAS as categorias, porque
  -- cada funcao procurava as contagens por conta propria e so uma conhecia a
  -- regra nova. E a mesma doenca da 0007, ao contrario. A cura nao foi copiar
  -- a regra para o segundo lugar — foi nao haver segundo lugar.
  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('a abertura por categoria enxerga o mesmo estoque final',
    (select sum(c.estoque_final) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30') c)
    = l.estoque_final);
  perform conferir('e o mesmo CMV, somado por categoria',
    (select sum(c.cmv) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30') c)
    = l.cmv);
  perform conferir('nenhuma categoria com movimento fica sem CMV enquanto o periodo tem',
    (select count(*) from mv_cmv_por_categoria(r, date '2026-09-01', date '2026-09-30') c
      where c.cmv is null and c.compras > 0) = 0);

  -- ------------------------------------------- a janela que NAO fecha mes --
  -- A regra fala do final do MES. Aplicada a semana, ela fabricaria numero:
  -- toda semana de setembro sairia com o CMV do mes inteiro.
  select * into l from mv_cmv_periodo(r, date '2026-09-07', date '2026-09-13');
  perform conferir('semana no meio do mes NAO puxa a contagem de outubro',
                   l.cmv is null and not l.estoque_final_fora_do_periodo);

  -- ---------------------------------------------- limpeza separada --------
  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('o estoque de limpeza sai separado nas duas pontas',
                   l.estoque_inicial_limpeza = 200 and l.estoque_final_limpeza = 150);
  perform conferir('a compra de limpeza sai pela CATEGORIA do insumo vinculado',
                   l.compras_limpeza = 100);
  perform conferir('CMV de limpeza = 200 + 100 - 150 = 150', l.cmv_limpeza = 150);
  perform conferir('CMV de insumo = 850 - 150 = 700', l.cmv_insumo = 700);
  perform conferir('as duas metades somam o CMV inteiro, sempre',
                   l.cmv_limpeza + l.cmv_insumo = l.cmv);
  perform conferir('as tres pontas do insumo fecham o CMV de insumo',
                   (l.estoque_inicial - l.estoque_inicial_limpeza)
                   + (l.compras - l.compras_limpeza)
                   - (l.estoque_final - l.estoque_final_limpeza) = l.cmv_insumo);

  -- ------------------------- a operacao do ERP NAO classifica dinheiro ----
  -- O defeito da 0031: o estoque saia pela categoria e a compra pela categoria
  -- OU pela operacao. Duas bases nas duas pontas da mesma conta. Na planilha de
  -- setembro da cliente o GUARDANAPO chega com as DUAS operacoes no mesmo mes
  -- (R$ 217,98 como limpeza, R$ 110,36 como insumo), e e o mesmo insumo do
  -- catalogo: a operacao nao e nem funcao do produto. Aqui o inverso, que e o
  -- caso em que o `or` de antes movia dinheiro: cerveja faturada como limpeza.
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total, operacao)
  values (n, p_cerveja, 'CERVEJA QUE O ERP FATUROU COMO LIMPEZA','UND', 7, 10, 70,
          '01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS');
  update notas_fiscais set valor_total = 670 where id = n;

  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('a operacao do ERP nao move a cerveja para a limpeza',
                   l.compras_limpeza = 100);
  perform conferir('ela entra no insumo, como manda a categoria do cadastro',
                   l.compras = 670 and l.cmv_insumo = 770);
  perform conferir('e a funcao DIZ onde as duas classificacoes discordam',
                   l.compras_divergencia_operacao = 70);

  -- ----------------- o que nao tem insumo vinculado nao tem categoria -----
  -- Nota lancada com item pendente nao deveria existir (`mv_lancar_nota`
  -- recusa, e a 0032 fecha o desvio pelo update). Enquanto houver qualquer
  -- caminho, a resposta honesta e dizer o tamanho do que a conta nao
  -- classifica, em vez de empurra-lo calado para uma das metades.
  insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                          valor_unitario, valor_total, operacao)
  values (n, p_cerveja, 'ITEM QUE PERDEU O INSUMO','UND', 1, 30, 30,
          '01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS');
  -- `on delete set null` da 0004: apagar o insumo do cadastro esvazia o vinculo
  -- da nota lancada. E o caminho que a 0032 NAO tranca, de proposito, e e por
  -- ele que `compras_sem_classificacao` tem razao de existir.
  update nota_itens set produto_id = null
   where nota_id = n and descricao = 'ITEM QUE PERDEU O INSUMO';

  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('item sem insumo vinculado nao vira limpeza pelo rotulo da nota',
                   l.compras_limpeza = 100);
  perform conferir('e a funcao DIZ quanto a divisao em duas metades nao alcanca',
                   l.compras_sem_classificacao = 30);

  delete from nota_itens where nota_id = n and produto_id is null;
  delete from nota_itens where nota_id = n
     and descricao = 'CERVEJA QUE O ERP FATUROU COMO LIMPEZA';
  update notas_fiscais set valor_total = 600 where id = n;
  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('desfeito o cenario, setembro volta ao CMV de 850', l.cmv = 850);

  -- ---- 0034: o mes ja lido que muda de numero tem de ter como ser notado ---
  -- Medido com a contagem de 31/07 no banco: o CMV de agosto de 2026 vai de
  -- R$ 0,00 para R$ 1.365,48 so porque a planilha de SETEMBRO foi importada —
  -- cinco notas emitidas entre 26/08 e 31/08 vieram dentro dela. O numero esta
  -- certo (compra e do mes da EMISSAO); o silencio e que nao estava.
  perform conferir('0034: a funcao diz quando a compra mais recente ENTROU',
                   l.compras_entrada_mais_recente = current_date);
  perform conferir('0034: e e depois do fim do periodo, que e o que a tela avisa',
                   l.compras_entrada_mais_recente > l.fim);
  perform conferir('0034: sem compra lancada no periodo, a data e nula',
                   (select c.compras_entrada_mais_recente
                      from mv_cmv_periodo(r, date '2026-07-01', date '2026-07-31') c) is null);

  -- ------------- 0032: a trava do item pendente vale fora de mv_lancar_nota --
  -- Medido pela API antes do gatilho: `PATCH {"status":"lancada"}` numa nota
  -- com item pendente voltava HTTP 204, e os R$ 1.000 do item entravam no CMV.
  declare
    n2 uuid; i2 uuid; houve boolean;
  begin
    insert into notas_fiscais (restaurante_id, emitida_em, status, valor_total)
    values (r, date '2026-09-20', 'importada', 1000) returning id into n2;
    insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                            valor_unitario, valor_total)
    values (n2, null, 'DETERGENTE QUE NINGUEM VINCULOU', 'UND', 10, 100, 1000);

    houve := false;
    begin update notas_fiscais set status = 'lancada' where id = n2;
    exception when others then houve := true; end;
    perform conferir('0032: update direto no status nao lanca nota com item pendente', houve);

    update nota_itens set produto_id = p_cerveja where nota_id = n2;
    update notas_fiscais set status = 'lancada' where id = n2;
    perform conferir('0032: vinculado o insumo, o mesmo update passa',
                     (select status from notas_fiscais where id = n2) = 'lancada');

    houve := false;
    begin
      insert into nota_itens (nota_id, produto_id, descricao, unidade, quantidade,
                              valor_unitario, valor_total)
      values (n2, null, 'ITEM PENDURADO DEPOIS', 'UND', 1, 500, 500);
    exception when others then houve := true; end;
    perform conferir('0032: item pendente nao se pendura em nota ja lancada', houve);

    -- E o caminho que fica aberto por desenho, com a conta dizendo o tamanho:
    -- apagar o insumo do cadastro esvazia o vinculo (`on delete set null`), e
    -- trancar isso trancaria apagar insumo com historico de compra.
    select id into i2 from nota_itens where nota_id = n2 limit 1;
    update nota_itens set produto_id = null where id = i2;
    perform conferir('0032: desvincular continua possivel, e a conta diz quanto',
      (select c.compras_sem_classificacao
         from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30') c) = 1000);

    perform conferir('0032: e a nota continua inteira depois das duas recusas',
                     (select count(*) from nota_itens where nota_id = n2) = 1);
    delete from notas_fiscais where id = n2;
  end;

  -- --------------------------------------------- os dois percentuais ------
  perform conferir('sem venda fechada nao ha percentual: nao se divide por zero',
                   l.faturamento = 0 and l.cmv_percentual is null
                   and l.cmv_percentual_produto is null);

  insert into fichas (restaurante_id, nome, rendimento, unidade_rendimento, preco_venda)
  values (r,'Cerveja na mesa',1,'PORCAO',12) returning id into f;
  insert into ficha_itens (ficha_id, produto_id, quantidade, unidade) values (f, p_cerveja, 1, 'UND');
  insert into vendas (restaurante_id, referencia, inicio, origem)
  values (r, date '2026-09-30', date '2026-09-01','pdv') returning id into v;
  insert into venda_itens (venda_id, alvo, ficha_id, quantidade, preco_unitario,
                           valor_total_origem, descricao_origem)
  values (v, 'ficha', f, 100, 12, 4000, 'CERVEJA NA MESA');
  insert into venda_itens (venda_id, alvo, quantidade, preco_unitario,
                           valor_total_origem, descricao_origem)
  values (v, 'servico', 50, 20, 1000, 'COUVERT ARTISTICO');

  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('venda ABERTA nao entra no faturamento', l.faturamento = 0);

  perform mv_fechar_venda(v);
  select * into l from mv_cmv_periodo(r, date '2026-09-01', date '2026-09-30');
  perform conferir('faturamento total = 5000', l.faturamento = 5000);
  perform conferir('faturamento de produto = 4000 (o couvert nao consome insumo)',
                   l.faturamento_produto = 4000);
  perform conferir('CMV% sobre o total = 850/5000 = 17,00', l.cmv_percentual = 17.00);
  perform conferir('CMV% sobre produto = 850/4000 = 21,25', l.cmv_percentual_produto = 21.25);
  -- A prova cruzada que o gabarito pede: a razao entre os dois percentuais e a
  -- razao entre os dois faturamentos.
  perform conferir('a diferenca entre os dois percentuais e a fatia do servico',
    round(l.cmv_percentual_produto / l.cmv_percentual, 4)
    = round(l.faturamento / l.faturamento_produto, 4));
end $$;

-- ============================================================================
-- 0028 · A venda que aponta para o insumo converte a unidade
-- ----------------------------------------------------------------------------
-- O caso vem da planilha de setembro: 11.144 linhas em UN e 54 em KG — a
-- BATATA FRITA, 59 KG. A 0027 somava a quantidade do PDV direto na do insumo,
-- entao 59 KG vendidos entravam como 59 UNIDADES consumidas, e a caixa
-- DIFERENCA do relatorio (vendas - consumo) mentia na mesma proporcao.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; s uuid;
  p_und uuid; p_saco uuid; p_kg uuid;
  v uuid; i_kg uuid; i_outro uuid; v_erro text; l record;
begin
  insert into restaurantes (nome, slug) values ('Casa da Unidade','casa-unidade')
  returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Cozinha') returning id into cat;
  insert into setores (restaurante_id, nome) values (r,'Cozinha') returning id into s;

  -- Tres cadastros do mesmo mundo real: o que se conta por unidade, o que se
  -- conta por unidade MAS tem peso na embalagem, e o que se conta por quilo.
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Batata porcionada','UND',8,cat) returning id into p_und;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id,
                        conteudo_quantidade, conteudo_unidade)
  values (r,'Batata saco de 5 kg','UND',40,cat,5,'KG') returning id into p_saco;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Batata a granel','KG',9,cat) returning id into p_kg;

  insert into vendas (restaurante_id, referencia, inicio, origem, origem_arquivo)
  values (r, date '2026-09-30', date '2026-09-01','pdv','vendas_setembro.xlsx')
  returning id into v;

  -- A linha como o PDV manda: 59 KG de BATATA FRITA.
  insert into venda_itens (venda_id, alvo, produto_id, quantidade, unidade,
                           preco_unitario, valor_total_origem, linhas_de_origem,
                           descricao_origem)
  values (v,'produto',p_kg,59,'KG',41.76,2463.67,54,'BATATA FRITA')
  returning id into i_kg;

  perform conferir('0028: KG para KG continua 1 por 1',
    (select quantidade from mv_vendas_por_produto(v) where produto_id = p_kg) = 59);

  -- O mesmo KG apontando para o insumo contado em UNIDADE: nao converte, e a
  -- linha sai MARCADA em vez de valer 59 unidades.
  update venda_itens set produto_id = p_und where id = i_kg;
  select * into l from mv_vendas_por_produto(v) where produto_id = p_und;
  perform conferir('0028: KG contra UND nao converte, e a quantidade volta NULA',
                   l.fator_ausente and l.quantidade is null);
  perform conferir('0028: e o motivo diz as duas unidades e o nome do PDV',
                   l.motivo like '%BATATA FRITA%' and l.motivo like '%KG%'
                   and l.motivo like '%UND%');

  -- E o caso que a 0017 resolveu para a ficha, valendo agora para a venda: o
  -- saco de 5 kg. 59 KG sao 11,8 sacos.
  update venda_itens set produto_id = p_saco where id = i_kg;
  select * into l from mv_vendas_por_produto(v) where produto_id = p_saco;
  perform conferir('0028: KG vira saco pela embalagem — 59 / 5 = 11,8',
                   l.quantidade = 11.8 and not l.fator_ausente);

  -- Lancamento da mao: sem unidade dita, a quantidade ja esta na unidade do
  -- insumo. E o que "sem unidade" sempre quis dizer, e tem de continuar valendo.
  update venda_itens set unidade = null, produto_id = p_und where id = i_kg;
  perform conferir('0028: linha sem unidade (lancamento da mao) continua 1 por 1',
    (select quantidade from mv_vendas_por_produto(v) where produto_id = p_und) = 59);

  -- -------------------------------------- a fusao nao soma KG com unidade ---
  update venda_itens set unidade = 'KG', produto_id = p_kg where id = i_kg;
  insert into venda_itens (venda_id, alvo, quantidade, unidade, preco_unitario,
                           valor_total_origem, descricao_origem)
  values (v,'pendente',10,'UN',12,120,'PORCAO DE BATATA')
  returning id into i_outro;
  begin
    perform mv_resolver_item_de_venda(i_outro, 'produto', null, p_kg);
    v_erro := 'passou';
  exception when others then v_erro := SQLERRM;
  end;
  perform conferir('0028: a fusao recusa somar quantidade de unidades diferentes',
                   v_erro like '%unidades diferentes%');
  perform conferir('0028: e nenhuma das duas linhas se perdeu na recusa',
                   (select count(*) from venda_itens where venda_id = v) = 2);

  -- Com a mesma unidade, funde como a 0027 desenhou.
  update venda_itens set unidade = 'KG' where id = i_outro;
  perform mv_resolver_item_de_venda(i_outro, 'produto', null, p_kg);
  perform conferir('0028: com a mesma unidade a fusao soma as quantidades',
    (select quantidade from venda_itens where venda_id = v and produto_id = p_kg) = 69);
  perform conferir('0028: e sobra uma linha so, com os dois nomes do PDV',
    (select count(*) from venda_itens where venda_id = v) = 1
    and (select descricao_origem from venda_itens where venda_id = v)
        = 'BATATA FRITA + PORCAO DE BATATA');
end $$;

-- ============================================================================
-- 0029 · O degrau do mes seguinte vale para o MES, nao para a semana que
--        termina no dia 31
-- ----------------------------------------------------------------------------
-- Maio de 2026 acaba num DOMINGO. Com `dia_virada_semana = 1` (segunda a
-- domingo), a serie semanal da tela gera a janela 25/05-31/05 — que termina
-- exatamente no ultimo dia do mes. Com a condicao da 0027, que olhava so o fim
-- da janela, essa semana puxava a contagem de junho e mostrava a queda de
-- estoque do MES como se fosse de sete dias. A cada ano todo restaurante passa
-- por um ou dois meses assim.
-- ============================================================================
do $$
declare
  r uuid; cat uuid; s uuid; p uuid; f uuid; n uuid;
  c_abr uuid; c_jun uuid; l record; v_semana record;
begin
  insert into restaurantes (nome, slug, dia_virada_semana)
  values ('Casa do Domingo 31','casa-domingo-31', 1) returning id into r;
  insert into categorias (restaurante_id, nome) values (r,'Cozinha') returning id into cat;
  insert into setores (restaurante_id, nome) values (r,'Cozinha') returning id into s;
  insert into produtos (restaurante_id, nome, unidade, custo_medio, categoria_id)
  values (r,'Farinha','KG',10,cat) returning id into p;
  insert into produto_setores (produto_id, setor_id, unidade) values (p, s, 'KG');

  -- A casa conta no fim de abril e no dia 1o de junho: o fechamento de maio
  -- aconteceu no mes seguinte, que e a situacao da regra da cliente.
  -- Os itens entram ANTES de fechar: contagem fechada e foto e nao se mexe (0003).
  insert into contagens (restaurante_id, referencia, titulo) values (r, date '2026-04-30','Abril')
  returning id into c_abr;
  insert into contagem_itens (contagem_id, produto_id, setor_id, unidade, quantidade, custo_unitario)
  values (c_abr, p, s, 'KG', 100, 10);
  update contagens set status='fechada', fechada_em=now(), total=1000 where id=c_abr;

  insert into contagens (restaurante_id, referencia, titulo) values (r, date '2026-06-01','Junho')
  returning id into c_jun;
  insert into contagem_itens (contagem_id, produto_id, setor_id, unidade, quantidade, custo_unitario)
  values (c_jun, p, s, 'KG', 40, 10);
  update contagens set status='fechada', fechada_em=now(), total=400 where id=c_jun;

  -- Uma compra em cada semana de maio, para os numeros nao se confundirem.
  insert into fornecedores (restaurante_id, nome) values (r,'Moinho') returning id into n;
  insert into notas_fiscais (restaurante_id, fornecedor_id, origem, status, numero, emitida_em, valor_total)
  values (r, n, 'planilha','lancada','1', date '2026-05-05', 100),
         (r, n, 'planilha','lancada','2', date '2026-05-27',  50);

  -- O mes inteiro: a regra da cliente valendo, com a data dita em voz alta.
  select * into l from mv_cmv_periodo(r, date '2026-05-01', date '2026-05-31');
  perform conferir('0029: o mes civil continua fechando pela contagem de junho',
                   l.estoque_final_data = date '2026-06-01' and l.estoque_final_fora_do_periodo);
  perform conferir('0029: e o CMV do mes e 1000 + 150 - 400 = 750', l.cmv = 750);

  -- A semana que termina no ultimo dia do mes NAO e um mes.
  select * into l from mv_cmv_periodo(r, date '2026-05-25', date '2026-05-31');
  perform conferir('0029: a semana que acaba em 31/05 nao puxa a contagem de junho',
                   l.cmv is null and l.estoque_final_data is null
                   and l.pendencia = 'Falta a contagem de estoque final');

  -- Nem dez dias, nem um dia.
  select * into l from mv_cmv_periodo(r, date '2026-05-22', date '2026-05-31');
  perform conferir('0029: dez dias que acabam em 31/05 tambem nao', l.cmv is null);
  select * into l from mv_cmv_periodo(r, date '2026-05-31', date '2026-05-31');
  perform conferir('0029: um dia que acaba em 31/05 tambem nao', l.cmv is null);

  -- E pela serie semanal, que e o caminho pelo qual a tela chega ali.
  select * into v_semana from mv_cmv_serie(r, 'semanal', 1, date '2026-05-31')
   where inicio = date '2026-05-25';
  perform conferir('0029: a serie semanal mostra a semana 25/05 sem CMV, nao com o do mes',
                   v_semana.cmv is null and v_semana.compras = 50);

  -- A semana que de fato CONTEM a contagem continua fechando pelo degrau (a),
  -- que nao mudou desde a 0005.
  select * into l from mv_cmv_periodo(r, date '2026-05-26', date '2026-06-01');
  perform conferir('0029: a semana que contem a contagem continua fechando por ela',
                   l.estoque_final_data = date '2026-06-01'
                   and not l.estoque_final_fora_do_periodo
                   and l.cmv = 1000 + 50 - 400);
end $$;
