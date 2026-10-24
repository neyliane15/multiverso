-- ===========================================================================
-- 0030 · O CMV recusa o acesso de setor, em vez de mostrar outro numero
--
-- O laudo do montador pede, na lista do que o revisor deve atacar:
-- "`mv_contagens_do_periodo` e `stable security invoker` e e chamada por duas
-- funcoes. Vale conferir sob RLS de operador de setor — `mv_relatorio_de_contagem`
-- recusa esse perfil explicitamente, mas o CMV nunca recusou e eu nao mudei
-- isso." Conferi. O CMV nao recusa, e o que ele devolve e pior que uma recusa.
--
-- Medido no banco do revisor, com a planilha de setembro dentro, pelo MESMO
-- periodo, com `set local role authenticated` e o `sub` de cada perfil:
--
--                        admin da casa      operador preso a 1 setor
--   estoque_inicial      78.681,36          78.681,36
--   compras              82.417,81          82.417,81
--   cmv                  89.137,82          89.137,82
--   cmv_limpeza           5.589,26           6.135,91   <-- diferente
--   cmv_insumo           83.548,56          83.001,91   <-- diferente
--   faturamento         255.417,78                  0   <-- diferente
--   cmv_percentual           34,90%              (nulo)
--
-- Tres numeros diferentes para o mesmo mes, sem uma palavra dizendo por que. A
-- causa e a RLS fazendo o seu trabalho em METADE das fontes: `estoque_inicial`
-- e `cmv` saem de `contagens.total`, que e coluna de cabecalho e nao e
-- recortada; mas as metades de limpeza somam `contagem_itens`, que e recortada
-- por setor (o operador ve 556 dos 868 itens), e o faturamento le `vendas`, que
-- a 0024 fechou para ele. O resultado e um CMV de insumo menor, um CMV de
-- limpeza maior, e a frase "sem venda fechada, nao ha percentual" na tela de
-- quem tem uma venda fechada na casa — ela so nao e dele.
--
-- Onde isso aparece: pela API, nao pela tela. `/cmv` nao tem `papeis` em
-- `rotas.ts`, mas `SoAContagem` (App.tsx) manda todo perfil restrito a setor de
-- volta para `/contagem` — conferido no navegador, o link nem aparece no menu.
-- O que existe e o RPC: o grant destas funcoes e para `authenticated`, e o
-- token do proprio operador chama `/rest/v1/rpc/mv_cmv_periodo` e recebia os
-- numeros divergentes com 200. Quem nao pode mentir e a funcao, porque a
-- proxima tela que alguem escrever vai chama-la.
--
-- A decisao desta casa para esse caso ja esta escrita, na 0026, palavra por
-- palavra: "este relatorio soma TODAS as abas da folha. Para quem enxerga uma
-- aba so, a RLS de `contagem_itens` recortaria a contagem atual e as colunas
-- sairiam com o total de um setor sob o rotulo da casa — sem nenhuma pendencia
-- dizendo que faltou aba. Recusa e a unica resposta que nao mente." O CMV soma
-- a casa inteira igual, e a 0019 ja esconde o total da contagem fechada desse
-- perfil pelo mesmo motivo. Entao as duas funcoes do modulo 4 passam a recusar
-- com a MESMA frase do relatorio — frase que diz o que fazer, e nao "permission
-- denied".
--
-- `mv_faturamento_periodo` recusa tambem: ela le `vendas`, e devolver zero para
-- quem nao pode ver venda e afirmar que a casa nao vendeu.
-- ===========================================================================

create or replace function mv_faturamento_periodo(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  total        numeric,
  produto      numeric,
  servico      numeric,
  lancamentos  integer,
  itens        integer
)
language plpgsql stable security invoker set search_path = public as $$
begin
  if mv_restrito_a_setores() then
    raise exception 'este numero soma a casa inteira e seu acesso e de setor: peca a leitura a quem administra';
  end if;
  return query
  with linhas as (
    select v.id as venda_id,
           i.alvo,
           coalesce(i.valor_total_origem, i.total) as valor
      from vendas v
      join venda_itens i on i.venda_id = v.id
     where v.restaurante_id = p_restaurante
       and v.status = 'fechada'
       and v.referencia between p_inicio and p_fim
  )
  select coalesce(sum(l.valor), 0),
         coalesce(sum(l.valor) filter (where l.alvo <> 'servico'), 0),
         coalesce(sum(l.valor) filter (where l.alvo =  'servico'), 0),
         count(distinct l.venda_id)::integer,
         count(*)::integer
    from linhas l;
end $$;

comment on function mv_faturamento_periodo(uuid, date, date) is
  'Faturamento de vendas FECHADAS do periodo: total, de produto (sem servico) e de servico. Recusa acesso de setor.';

-- A recusa mora nas duas funcoes de tela, e nao dentro de
-- `mv_contagens_do_periodo`: ela e so a busca das duas fotos, e pode continuar
-- servindo quem precisar das datas sem o dinheiro da casa.
create or replace function mv_cmv_periodo(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  inicio               date,
  fim                  date,
  estoque_inicial      numeric,
  estoque_inicial_data date,
  estoque_inicial_id   uuid,
  compras              numeric,
  compras_notas        integer,
  estoque_final        numeric,
  estoque_final_data   date,
  estoque_final_id     uuid,
  cmv                  numeric,
  completo             boolean,
  pendencia            text,
  estoque_final_fora_do_periodo boolean,
  faturamento                   numeric,
  faturamento_produto           numeric,
  faturamento_servico           numeric,
  faturamento_lancamentos       integer,
  cmv_percentual                numeric,
  cmv_percentual_produto        numeric,
  compras_limpeza               numeric,
  estoque_inicial_limpeza       numeric,
  estoque_final_limpeza         numeric,
  cmv_limpeza                   numeric,
  cmv_insumo                    numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c record;
  v_compras numeric := 0; v_notas integer := 0;
  f record;
  v_compras_limpeza numeric := 0;
  v_ini_limpeza numeric; v_fim_limpeza numeric;
begin
  if mv_restrito_a_setores() then
    raise exception 'este relatorio soma a casa inteira e seu acesso e de setor: peca a leitura a quem administra';
  end if;

  select * into c from mv_contagens_do_periodo(p_restaurante, p_inicio, p_fim);

  select coalesce(sum(n.valor_total), 0), count(*) into v_compras, v_notas
    from notas_fiscais n
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

  select coalesce(sum(it.valor_total), 0) into v_compras_limpeza
    from nota_itens it
    join notas_fiscais n on n.id = it.nota_id
    left join produtos p on p.id = it.produto_id
    left join categorias cat on cat.id = p.categoria_id
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim
     and (coalesce(cat.fora_do_insumo, false) or mv_operacao_fora_do_insumo(it.operacao));

  select coalesce(sum(i.total), 0) into v_ini_limpeza
    from contagem_itens i
    join produtos p on p.id = i.produto_id
    join categorias cat on cat.id = p.categoria_id
   where i.contagem_id = c.inicial_id and cat.fora_do_insumo;

  select coalesce(sum(i.total), 0) into v_fim_limpeza
    from contagem_itens i
    join produtos p on p.id = i.produto_id
    join categorias cat on cat.id = p.categoria_id
   where i.contagem_id = c.final_id and cat.fora_do_insumo;

  select * into f from mv_faturamento_periodo(p_restaurante, p_inicio, p_fim);

  inicio := p_inicio;
  fim    := p_fim;
  estoque_inicial      := c.inicial_total;
  estoque_inicial_data := c.inicial_data;
  estoque_inicial_id   := c.inicial_id;
  compras              := v_compras;
  compras_notas        := v_notas;
  estoque_final        := c.final_total;
  estoque_final_data   := c.final_data;
  estoque_final_id     := c.final_id;
  estoque_final_fora_do_periodo := c.final_fora_do_periodo;

  if c.inicial_id is null and c.final_id is null then
    pendencia := 'Nenhuma contagem fechada neste periodo';
  elsif c.inicial_id is null then
    pendencia := 'Falta a contagem de estoque inicial';
  elsif c.final_id is null then
    pendencia := 'Falta a contagem de estoque final';
  end if;

  completo := (c.inicial_id is not null and c.final_id is not null);
  cmv := case when completo then round(c.inicial_total + v_compras - c.final_total, 4) end;

  faturamento             := f.total;
  faturamento_produto     := f.produto;
  faturamento_servico     := f.servico;
  faturamento_lancamentos := f.lancamentos;

  cmv_percentual := case when cmv is not null and f.total > 0
                         then round(cmv / f.total * 100, 2) end;
  cmv_percentual_produto := case when cmv is not null and f.produto > 0
                                 then round(cmv / f.produto * 100, 2) end;

  compras_limpeza         := v_compras_limpeza;
  estoque_inicial_limpeza := case when c.inicial_id is not null then coalesce(v_ini_limpeza, 0) end;
  estoque_final_limpeza   := case when c.final_id is not null then coalesce(v_fim_limpeza, 0) end;
  cmv_limpeza := case when completo
                      then round(coalesce(v_ini_limpeza, 0) + v_compras_limpeza
                                 - coalesce(v_fim_limpeza, 0), 4) end;
  cmv_insumo  := case when completo then round(cmv - cmv_limpeza, 4) end;

  return next;
end $$;

comment on function mv_cmv_periodo(uuid, date, date) is
  'CMV do periodo com faturamento, os dois percentuais, e limpeza/descartavel separado. Recusa acesso de setor.';

-- A tabela por categoria soma `contagem_itens` e `nota_itens` diretamente: para
-- o acesso de setor ela sairia com a fatia de um setor sob o rotulo da casa, e
-- deixaria de somar o mesmo que o cartao — que e justamente o defeito que a
-- 0027 acabou de curar criando `mv_contagens_do_periodo`.
create or replace function mv_cmv_por_categoria(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  categoria_id    uuid,
  categoria_nome  text,
  categoria_cor   text,
  categoria_ativa boolean,
  estoque_inicial numeric,
  compras         numeric,
  estoque_final   numeric,
  cmv             numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare v_ini uuid; v_fim uuid;
begin
  if mv_restrito_a_setores() then
    raise exception 'este relatorio soma a casa inteira e seu acesso e de setor: peca a leitura a quem administra';
  end if;

  select c.inicial_id, c.final_id into v_ini, v_fim
    from mv_contagens_do_periodo(p_restaurante, p_inicio, p_fim) c;

  return query
  with ei as (
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
  ),
  eixo as (
    select cid from ei union
    select cid from ef union
    select cid from co union
    select c.id from categorias c where c.restaurante_id = p_restaurante and c.ativo
  )
  select
    eixo.cid,
    coalesce(c.nome, 'Sem categoria'),
    coalesce(c.cor, '#6B7280'),
    coalesce(c.ativo, false),
    case when v_ini is not null then coalesce(ei.v, 0) end,
    coalesce(co.v, 0),
    case when v_fim is not null then coalesce(ef.v, 0) end,
    case when v_ini is not null and v_fim is not null
         then round(coalesce(ei.v, 0) + coalesce(co.v, 0) - coalesce(ef.v, 0), 4)
    end
    from eixo
    left join categorias c on c.id = eixo.cid and c.restaurante_id = p_restaurante
    left join ei on ei.cid is not distinct from eixo.cid
    left join ef on ef.cid is not distinct from eixo.cid
    left join co on co.cid is not distinct from eixo.cid
   order by 8 desc nulls last, 2;
end $$;

grant execute on function mv_cmv_periodo(uuid, date, date)         to authenticated;
grant execute on function mv_faturamento_periodo(uuid, date, date) to authenticated;
grant execute on function mv_cmv_por_categoria(uuid, date, date)   to authenticated;
