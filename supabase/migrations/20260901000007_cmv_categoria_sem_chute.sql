-- ============================================================================
-- Multiverso · 0007 · A abertura por categoria para de chutar estoque final
-- ----------------------------------------------------------------------------
-- Defeito que so apareceu com o app aberto na frente, com a carga do Bar do
-- Zeca dentro: o cartao do periodo dizia "sem CMV" — correto, falta a contagem
-- de fechamento — e a tabela logo abaixo mostrava R$ 38.905,46 de CMV em
-- bebidas alcoolicas.
--
-- O motivo era um `coalesce(ef.v, 0)`: sem contagem final, a funcao assumia
-- estoque final zero, o que equivale a afirmar que o bar consumiu o estoque
-- inteiro. Numa categoria com quase metade do estoque, o erro tem o tamanho do
-- estoque.
--
-- Zero e um numero. "Nao sei" nao e zero. Esta versao devolve nulo em cada
-- coluna que depende de contagem ausente, exatamente como mv_cmv_periodo ja
-- fazia — as duas passam a contar a mesma historia.
--
-- Compras seguem valendo mesmo sem contagem: nota lancada e fato consumado.
-- ============================================================================

create or replace function mv_cmv_por_categoria(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  categoria_id    uuid,
  categoria_nome  text,
  categoria_cor   text,
  estoque_inicial numeric,
  compras         numeric,
  estoque_final   numeric,
  cmv             numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare v_ini uuid; v_fim uuid; d_ini date;
begin
  select id, referencia into v_ini, d_ini from contagens
   where restaurante_id = p_restaurante and status = 'fechada' and referencia <= p_inicio
   order by referencia desc, fechada_em desc limit 1;

  select id into v_fim from contagens
   where restaurante_id = p_restaurante and status = 'fechada'
     and referencia <= p_fim and referencia > coalesce(d_ini, '-infinity'::date)
   order by referencia desc, fechada_em desc limit 1;

  return query
  with cat as (
    select c.id, c.nome, c.cor from categorias c
     where c.restaurante_id = p_restaurante and c.ativo
  ),
  ei as (
    select p.categoria_id as cid, sum(i.total) as v
      from contagem_itens i join produtos p on p.id = i.produto_id
     where i.contagem_id = v_ini group by p.categoria_id
  ),
  ef as (
    select p.categoria_id as cid, sum(i.total) as v
      from contagem_itens i join produtos p on p.id = i.produto_id
     where i.contagem_id = v_fim group by p.categoria_id
  ),
  co as (
    select p.categoria_id as cid, sum(it.valor_total) as v
      from nota_itens it
      join notas_fiscais n on n.id = it.nota_id
      join produtos p on p.id = it.produto_id
     where n.restaurante_id = p_restaurante and n.status = 'lancada'
       and n.emitida_em between p_inicio and p_fim
     group by p.categoria_id
  )
  select
    cat.id, cat.nome, cat.cor,
    -- Existe contagem inicial? Entao categoria sem linha nela e zero de verdade
    -- (nao havia aquele produto no estoque). Sem contagem, e nulo: nao se sabe.
    case when v_ini is not null then coalesce(ei.v, 0) end,
    coalesce(co.v, 0),
    case when v_fim is not null then coalesce(ef.v, 0) end,
    case when v_ini is not null and v_fim is not null
         then round(coalesce(ei.v, 0) + coalesce(co.v, 0) - coalesce(ef.v, 0), 4)
    end
    from cat
    left join ei on ei.cid = cat.id
    left join ef on ef.cid = cat.id
    left join co on co.cid = cat.id
   -- nulls last: categoria sem CMV vai para o fim em vez de fingir ser a menor
   order by 7 desc nulls last, 2;
end $$;
