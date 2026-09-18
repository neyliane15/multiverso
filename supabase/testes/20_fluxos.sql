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
  reset role;
end $$;

\echo '  --- Fluxos: todos os casos passaram'
