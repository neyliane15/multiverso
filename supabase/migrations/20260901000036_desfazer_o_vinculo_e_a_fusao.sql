-- ===========================================================================
-- 0036 · Desfazer o vinculo, e desfazer a fusao
--
-- Sao 96 linhas pendentes no primeiro mes (R$ 228.455,13), e 82 delas exigem
-- digitar na busca e escolher — uma hora de trabalho a mao, sem rede. O que
-- havia de desfazer era meio: a linha resolvida virava um `<select>` com 69
-- fichas e 906 insumos, entao dava para TROCAR o alvo. Nao dava para:
--
--  · voltar a linha para "pendente". `mv_resolver_item_de_venda` recusa
--    'pendente' de proposito, e com razao — "resolver e dizer o que a linha e".
--    Mas isso deixava a pessoa sem saida quando ela nao SABE: trocar por um
--    alvo qualquer para sair de onde errou e pior que nao ter clicado;
--  · desfazer uma FUSAO. Ela apaga a linha clicada, e a 0028 nao guardava o
--    que apagou. No cenario do revisor, seis nomes do PDV viraram uma linha de
--    R$ 37.124,58 sem como voltar atras pela tela. Um vinculo errado nao erra
--    so o alvo: ele apaga a conferencia por nome;
--  · esquecer o apelido. `mv_ensina_apelido_de_venda` grava o de-para na hora
--    de resolver, e e isso que faz o mes seguinte chegar vinculado. Desfazer
--    sem esquecer o apelido seria desfazer so uma vez: a proxima importacao
--    refazia o vinculo errado sozinha, e dessa vez calada.
--
-- Duas pecas.
--
-- 1 ---------------------------------------------- a fusao passa a ter recibo
--
-- `venda_itens.fundidas` guarda a FOTO de cada linha absorvida, do jeito que
-- ela estava antes de somar — e tambem a foto da propria linha que sobreviveu,
-- porque a fusao mexeu nela: quantidade, preco, dinheiro, contagem de cupons e
-- nome, todos viraram a soma dos dois. Sem a foto dela, desfazer devolveria as
-- partes e deixaria o total dobrado.
--
-- jsonb e nao tabela propria porque isto nao e historico de auditoria: e o
-- recibo de UMA operacao, que vive e morre com a linha e nao e consultado por
-- ninguem alem do desfazer. Tabela separada precisaria de RLS, de chave
-- estrangeira com cascade e de politica propria para guardar o mesmo dado.
--
-- 2 ------------------------------------- `mv_desfazer_item_de_venda` existe
--
-- Funcao propria, e nao um `p_alvo = 'pendente'` em `mv_resolver_item_de_venda`,
-- por tres razoes que sao a mesma: desfazer nao e resolver ao contrario. Ela
-- recria linhas, esquece apelido e devolve VARIAS linhas; resolver devolve uma.
-- Misturar as duas faria a frase da 0028 ("pendente e a ausencia de resposta")
-- deixar de ser verdade dentro da propria funcao que a escreveu.
--
-- O que ela faz, na ordem: esquece o apelido de cada nome envolvido, recria as
-- linhas absorvidas como PENDENTES, devolve a linha sobrevivente aos numeros
-- dela e a deixa pendente tambem. O gatilho `t_venda_itens_bloqueio` da 0023
-- continua valendo por cima de tudo: lancamento fechado nao se desfaz.
-- ===========================================================================

alter table venda_itens
  add column if not exists fundidas jsonb;

comment on column venda_itens.fundidas is
  'Recibo da fusao: a foto de cada linha absorvida E da propria linha antes de somar. Nulo quando nunca houve fusao. Lido so por mv_desfazer_item_de_venda.';

-- A foto de uma linha: so o que a fusao MEXE, que e o que desfazer precisa
-- repor. `id` e `venda_id` ficam de fora de proposito — a linha absorvida volta
-- com id novo, porque o antigo foi apagado e ressuscitar id apagado faria
-- `descricao_origem` deixar de ser rastro de uma linha e passar a ser de duas.
create or replace function mv_foto_de_item_de_venda(p_item venda_itens)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'descricao_origem',   p_item.descricao_origem,
    'quantidade',         p_item.quantidade,
    'preco_unitario',     p_item.preco_unitario,
    'unidade',            p_item.unidade,
    'valor_total_origem', p_item.valor_total_origem,
    'linhas_de_origem',   p_item.linhas_de_origem)
$$;

comment on function mv_foto_de_item_de_venda(venda_itens) is
  'O que a fusao mexe numa linha de venda, em jsonb: o recibo que mv_desfazer_item_de_venda repoe.';

-- 1 ------------------------------------------- a fusao grava o recibo ------
-- Corpo da 0028, com o `fundidas` acrescentado no `update` da fusao.
create or replace function mv_resolver_item_de_venda(
  p_item    uuid,
  p_alvo    alvo_de_venda,
  p_ficha   uuid default null,
  p_produto uuid default null
) returns venda_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_item venda_itens; v_irmao venda_itens; v_restaurante uuid;
  v_valor numeric; v_qtd numeric;
begin
  select * into v_item from venda_itens where id = p_item;
  if v_item.id is null then
    raise exception 'linha de venda % nao encontrada, ou fora do seu acesso', p_item;
  end if;
  if p_alvo = 'pendente' then
    raise exception 'resolver e dizer o que a linha e: "pendente" e a ausencia de resposta. Para voltar atras, use mv_desfazer_item_de_venda';
  end if;

  select restaurante_id into v_restaurante from vendas where id = v_item.venda_id;
  perform mv_ensina_apelido_de_venda(
    v_restaurante, v_item.descricao_origem, p_alvo,
    case when p_alvo = 'ficha' then p_ficha end,
    case when p_alvo = 'produto' then p_produto end);

  if p_alvo = 'ficha' then
    select * into v_irmao from venda_itens
     where venda_id = v_item.venda_id and ficha_id = p_ficha and id <> p_item;
  elsif p_alvo = 'produto' then
    select * into v_irmao from venda_itens
     where venda_id = v_item.venda_id and produto_id = p_produto and id <> p_item;
  end if;

  if v_irmao.id is not null then
    if coalesce(upper(btrim(v_irmao.unidade)), '') <> coalesce(upper(btrim(v_item.unidade)), '') then
      raise exception
        'as duas linhas estao em unidades diferentes (% e %): somar % com % nao da quantidade nenhuma. Confira o cadastro antes de juntar.',
        coalesce(v_irmao.unidade, 'sem unidade'), coalesce(v_item.unidade, 'sem unidade'),
        v_irmao.descricao_origem, v_item.descricao_origem;
    end if;
    v_qtd   := v_irmao.quantidade + v_item.quantidade;
    v_valor := coalesce(v_irmao.valor_total_origem, v_irmao.total)
             + coalesce(v_item.valor_total_origem,  v_item.total);
    update venda_itens
       set quantidade         = v_qtd,
           preco_unitario     = case when v_qtd > 0 then round(v_valor / v_qtd, 4) else 0 end,
           valor_total_origem = v_valor,
           linhas_de_origem   = coalesce(v_irmao.linhas_de_origem, 0)
                              + coalesce(v_item.linhas_de_origem, 0),
           descricao_origem   = concat_ws(' + ', v_irmao.descricao_origem, v_item.descricao_origem),
           -- O recibo: o que ja estava guardado (uma fusao anterior desta mesma
           -- linha), mais a foto da linha absorvida, mais a foto DELA MESMA
           -- antes de somar — esta ultima so na primeira vez, porque depois
           -- disso a foto original ja esta dentro do array.
           fundidas = coalesce(v_irmao.fundidas, '[]'::jsonb)
                    || jsonb_build_array(mv_foto_de_item_de_venda(v_item))
                    || case when v_irmao.fundidas is null
                            then jsonb_build_array(mv_foto_de_item_de_venda(v_irmao))
                            else '[]'::jsonb end
     where id = v_irmao.id
    returning * into v_irmao;
    delete from venda_itens where id = p_item;
    return v_irmao;
  end if;

  update venda_itens
     set alvo       = p_alvo,
         ficha_id   = case when p_alvo = 'ficha'   then p_ficha   end,
         produto_id = case when p_alvo = 'produto' then p_produto end
   where id = p_item
  returning * into v_item;
  return v_item;
end $$;

comment on function mv_resolver_item_de_venda(uuid, alvo_de_venda, uuid, uuid) is
  'Resolve uma linha de venda, fundindo-a com a linha do mesmo alvo quando ela ja existe — recusando unidades diferentes, e guardando o recibo da fusao em `fundidas`.';

-- 2 ----------------------------------------------------- desfazer ---------
create or replace function mv_desfazer_item_de_venda(p_item uuid)
returns setof venda_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_item venda_itens; v_restaurante uuid; v_foto jsonb; v_propria jsonb;
begin
  select * into v_item from venda_itens where id = p_item;
  if v_item.id is null then
    raise exception 'linha de venda % nao encontrada, ou fora do seu acesso', p_item;
  end if;
  if v_item.alvo = 'pendente' and v_item.fundidas is null then
    raise exception 'esta linha ja esta pendente: nao ha o que desfazer';
  end if;

  select restaurante_id into v_restaurante from vendas where id = v_item.venda_id;

  -- Esquecer o apelido de cada nome que a linha carrega. Sem isto, desfazer
  -- valeria uma vez so: a importacao do mes seguinte refaria o vinculo errado
  -- sozinha, e dessa vez sem ninguem clicar.
  delete from venda_apelidos
   where restaurante_id = v_restaurante
     and lower(mv_sem_acento(apelido)) in (
       select lower(mv_sem_acento(n))
         from unnest(string_to_array(coalesce(v_item.descricao_origem, ''), ' + ')) n
        where btrim(n) <> '');

  if v_item.fundidas is null then
    -- Sem fusao: a linha so volta a ser pergunta.
    return query
      update venda_itens
         set alvo = 'pendente', ficha_id = null, produto_id = null
       where id = p_item
      returning *;
    return;
  end if;

  -- Com fusao: a ultima foto do array e a da propria linha (ver o `update` da
  -- fusao), e as outras sao das linhas que ela absorveu.
  v_propria := v_item.fundidas -> (jsonb_array_length(v_item.fundidas) - 1);

  for v_foto in
    select f from jsonb_array_elements(v_item.fundidas) with ordinality t(f, i)
     where t.i < jsonb_array_length(v_item.fundidas)
  loop
    insert into venda_itens (venda_id, alvo, quantidade, preco_unitario, unidade,
                             descricao_origem, valor_total_origem, linhas_de_origem)
    values (v_item.venda_id, 'pendente',
            (v_foto ->> 'quantidade')::numeric,
            (v_foto ->> 'preco_unitario')::numeric,
            v_foto ->> 'unidade',
            v_foto ->> 'descricao_origem',
            (v_foto ->> 'valor_total_origem')::numeric,
            (v_foto ->> 'linhas_de_origem')::integer);
  end loop;

  return query
    update venda_itens
       set alvo = 'pendente', ficha_id = null, produto_id = null, fundidas = null,
           quantidade         = (v_propria ->> 'quantidade')::numeric,
           preco_unitario     = (v_propria ->> 'preco_unitario')::numeric,
           unidade            = v_propria ->> 'unidade',
           descricao_origem   = v_propria ->> 'descricao_origem',
           valor_total_origem = (v_propria ->> 'valor_total_origem')::numeric,
           linhas_de_origem   = (v_propria ->> 'linhas_de_origem')::integer
     where id = p_item
    returning *;
end $$;

comment on function mv_desfazer_item_de_venda(uuid) is
  'Volta uma linha de venda para pendente: desfaz a fusao pelo recibo em `fundidas`, recria as linhas absorvidas e esquece o apelido de cada nome envolvido.';

grant execute on function mv_desfazer_item_de_venda(uuid) to authenticated;
grant execute on function mv_foto_de_item_de_venda(venda_itens) to authenticated;
