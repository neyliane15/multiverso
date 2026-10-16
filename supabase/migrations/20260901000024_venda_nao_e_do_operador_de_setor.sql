-- ===========================================================================
-- 0024 · A venda, o relatorio e o operador preso a setor
--
-- A 0023 nasceu com as tres telas novas de `/contagem` e fechou o furo do
-- GUARDA DE ROTA: `rotaPermitidaNoSetor` liberava o prefixo `/contagem/`
-- inteiro, e bastou nascer `/contagem/dashboard` para quem conta um setor
-- poder digitar o endereco e abrir a casa toda. O proprio comentario escrito
-- la diz por que isso importa:
--
--   "A RLS continuaria recortando o que ele enxerga — e e justamente esse o
--    problema: ele veria um dashboard com o total de um setor so, com cara de
--    total da casa."
--
-- Esta migracao e a outra metade da mesma frase. Rota e tranca de porta; RLS
-- e tranca de cofre, e o cofre ficou aberto. Medido no banco, com identidade
-- de verdade (`set local role authenticated` + request.jwt.claim.sub dentro da
-- transacao), um operador preso ao setor "Bar" conseguia:
--
--   · LER as 10 vendas da casa e os 30 itens delas (as politicas da 0023
--     pediam `mv_pode_operar`, e nada mais);
--   · LANCAR uma venda da casa inteira, por item, e FECHA-LA;
--   · LER `mv_relatorio_de_contagem` por inteiro — 15 linhas, as mesmas 15 do
--     operador sem restricao — so que com a contagem atual recortada pela RLS
--     de `contagem_itens`. Na mesma contagem, lado a lado:
--
--         produto    operador livre        operador preso ao Bar
--         B_IGUAL    atual 1002,000        atual 2,000
--                    consumo -902,000      consumo 98,000
--                    precisa_comprar f     precisa_comprar t
--
--     Nenhuma coluna, nenhuma pendencia dizia que faltava uma aba. Numero
--     errado e pior que numero ausente — a regra esta escrita na 0005.
--
-- Duas decisoes:
--
-- 1. **Venda e coisa da casa, nao do setor.** As politicas de `vendas` e
--    `venda_itens` passam a exigir `not mv_restrito_a_setores()`, exatamente
--    como `contagens_criar` e `contagens_editar` fazem desde a 0018: quem
--    conta uma aba nao decide o calendario nem o cardapio dos outros. A venda
--    nao tem setor nenhum para recortar, entao nao ha meia-leitura possivel:
--    ou e a casa, ou e recusa.
--
-- 2. **O relatorio RECUSA em vez de somar meia folha.** Ele atravessa setores
--    por construcao (`contagem_itens` de todas as abas num `group by
--    produto_id`), e quem le uma aba so nao tem como saber disso pela tela.
--    Recusar e a unica resposta honesta.
-- ===========================================================================

drop policy if exists vendas_ler on vendas;
create policy vendas_ler on vendas for select to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists vendas_criar on vendas;
create policy vendas_criar on vendas for insert to authenticated
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists vendas_editar on vendas;
create policy vendas_editar on vendas for update to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores())
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists vendas_apagar on vendas;
create policy vendas_apagar on vendas for delete to authenticated
  using (mv_pode_administrar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists venda_itens_tudo on venda_itens;
create policy venda_itens_tudo on venda_itens for all to authenticated
  using (not mv_restrito_a_setores()
         and exists (select 1 from vendas v
                      where v.id = venda_itens.venda_id and mv_pode_operar(v.restaurante_id)))
  with check (not mv_restrito_a_setores()
              and exists (select 1 from vendas v
                           where v.id = venda_itens.venda_id and mv_pode_operar(v.restaurante_id)));

-- O relatorio: recusa escrita no comeco da funcao, antes de qualquer conta.
-- O corpo e o da 0023, palavra por palavra, com o `raise` novo no topo — por
-- isso a funcao e redefinida inteira aqui em vez de remendada.
create or replace function mv_relatorio_de_contagem(p_contagem uuid)
returns table (
  produto_id        uuid,
  produto_nome      text,
  categoria_id      uuid,
  categoria_nome    text,
  unidade           text,
  contagem_anterior numeric,
  compras           numeric,
  vendas            numeric,
  contagem_atual    numeric,
  consumo           numeric,
  ideal             numeric,
  diferenca         numeric,
  media_3_vendas    numeric,
  vendas_consideradas integer,
  sugestao          numeric,
  precisa_comprar   boolean,
  custo_unitario    numeric,
  pendencia         text
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c_atual        contagens;
  c_anterior     contagens;
  v_consideradas integer := 0;
  v_sem_anterior text := null;
  v_sem_venda    text := null;
  v_aberta       text := null;
begin
  -- Este relatorio soma TODAS as abas da folha. Para quem enxerga uma aba so,
  -- a RLS de `contagem_itens` recortaria a contagem atual e as colunas sairiam
  -- com o total de um setor sob o rotulo da casa — sem nenhuma pendencia
  -- dizendo que faltou aba. Recusa e a unica resposta que nao mente.
  if mv_restrito_a_setores() then
    raise exception 'este relatorio soma a casa inteira e seu acesso e de setor: peca a leitura a quem administra';
  end if;

  select * into c_atual from contagens where id = p_contagem;
  if not found then
    raise exception 'contagem % nao encontrada', p_contagem;
  end if;

  select * into c_anterior from contagens
   where restaurante_id = c_atual.restaurante_id
     and status = 'fechada'
     and referencia < c_atual.referencia
   order by referencia desc, fechada_em desc nulls last
   limit 1;

  if c_anterior.id is null then
    v_sem_anterior := 'sem contagem anterior fechada: consumo, ideal e diferenca precisam das duas pontas';
  end if;
  if c_atual.status <> 'fechada' then
    v_aberta := 'a contagem escolhida ainda esta ' || c_atual.status::text
             || ': os numeros desta coluna sao parciais';
  end if;

  select count(*) into v_consideradas
    from (select v.id from public.vendas v
           where v.restaurante_id = c_atual.restaurante_id
             and v.status = 'fechada'
             and v.referencia <= c_atual.referencia
           order by v.referencia desc, v.fechada_em desc nulls last
           limit 3) t;

  if v_consideradas = 0 then
    v_sem_venda := 'nenhuma venda fechada ate ' || to_char(c_atual.referencia, 'DD/MM/YYYY')
                || ': sem media para sugerir compra';
  end if;

  return query
  with
  atual as (
    select i.produto_id                                         as pid,
           case when bool_or(x.fator is null) then null
                else round(sum(i.quantidade * x.fator), 6) end  as qtd,
           bool_or(x.fator is null)                             as sem_fator,
           max(i.unidade) filter (where x.fator is null)         as unidade_crua,
           max(i.custo_unitario)                                as custo
      from contagem_itens i
      cross join lateral (
        select mv_fator_para_produto(i.unidade, i.produto_id) as fator
      ) x
     where i.contagem_id = c_atual.id
     group by i.produto_id
  ),
  anterior as (
    select i.produto_id                                         as pid,
           case when bool_or(x.fator is null) then null
                else round(sum(i.quantidade * x.fator), 6) end  as qtd,
           bool_or(x.fator is null)                             as sem_fator
      from contagem_itens i
      cross join lateral (
        select mv_fator_para_produto(i.unidade, i.produto_id) as fator
      ) x
     where i.contagem_id = c_anterior.id
     group by i.produto_id
  ),
  compradas as (
    select it.produto_id                           as pid,
           round(sum(it.quantidade_convertida), 6) as qtd
      from nota_itens it
      join notas_fiscais n on n.id = it.nota_id
     where c_anterior.id is not null
       and n.restaurante_id = c_atual.restaurante_id
       and n.status = 'lancada'
       and it.produto_id is not null
       and n.emitida_em >  c_anterior.referencia
       and n.emitida_em <= c_atual.referencia
     group by it.produto_id
  ),
  vendidas as (
    select e.produto_id as pid,
           case when bool_or(e.fator_ausente) then null
                else round(sum(e.quantidade), 6) end as qtd,
           bool_or(e.fator_ausente)                  as sem_fator,
           string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente) as motivo
      from public.vendas v
      cross join lateral mv_vendas_por_produto(v.id) e
     where c_anterior.id is not null
       and v.restaurante_id = c_atual.restaurante_id
       and v.status = 'fechada'
       and v.referencia >  c_anterior.referencia
       and v.referencia <= c_atual.referencia
     group by e.produto_id
  ),
  tres as (
    select v.id from public.vendas v
     where v.restaurante_id = c_atual.restaurante_id
       and v.status = 'fechada'
       and v.referencia <= c_atual.referencia
     order by v.referencia desc, v.fechada_em desc nulls last
     limit 3
  ),
  media as (
    select e.produto_id as pid,
           case when bool_or(e.fator_ausente) then null
                else round(sum(e.quantidade) / v_consideradas, 6) end as qtd,
           bool_or(e.fator_ausente)                  as sem_fator,
           string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente) as motivo
      from tres t
      cross join lateral mv_vendas_por_produto(t.id) e
     group by e.produto_id
  ),
  universo as (
    select atual.pid     as pid from atual
    union select anterior.pid  from anterior
    union select compradas.pid from compradas
    union select vendidas.pid  from vendidas
    union select media.pid     from media
  ),
  base as (
    select
      p.id as pid, p.nome as pnome, p.categoria_id as pcat, cat.nome as pcatnome,
      p.unidade as pun,
      case when c_anterior.id is null  then null
           when anterior.sem_fator     then null
           else coalesce(anterior.qtd, 0) end as q_ant,
      case when c_anterior.id is null  then null
           else coalesce(compradas.qtd, 0) end as q_com,
      case when c_anterior.id is null  then null
           when vendidas.sem_fator     then null
           else coalesce(vendidas.qtd, 0) end as q_ven,
      case when atual.sem_fator        then null
           else coalesce(atual.qtd, 0) end    as q_atu,
      case when v_consideradas = 0     then null
           when media.sem_fator        then null
           else coalesce(media.qtd, 0) end    as q_med,
      coalesce(nullif(atual.custo, 0), mv_custo_do_produto(p.id)) as p_custo,
      nullif(concat_ws('; ',
        v_aberta,
        v_sem_anterior,
        case when atual.sem_fator then
          format('a contagem lancou este item em %s, que nao converte para %s',
                 atual.unidade_crua, p.unidade) end,
        case when anterior.sem_fator then
          'a contagem anterior lancou este item em unidade que nao converte para a de compra' end,
        case when c_anterior.id is not null and anterior.pid is null then
          'este item nao estava na folha da contagem anterior; o anterior foi lido como zero' end,
        case when atual.pid is null then
          'este item nao esta na folha desta contagem; o estoque atual foi lido como zero' end,
        vendidas.motivo,
        case when vendidas.motivo is null then media.motivo end,
        v_sem_venda
      ), '') as pend
    from universo u
    join produtos p on p.id = u.pid
    left join categorias cat on cat.id = p.categoria_id
    left join atual     on atual.pid     = u.pid
    left join anterior  on anterior.pid  = u.pid
    left join compradas on compradas.pid = u.pid
    left join vendidas  on vendidas.pid  = u.pid
    left join media     on media.pid     = u.pid
    where p.restaurante_id = c_atual.restaurante_id
  )
  select
    base.pid, base.pnome, base.pcat, base.pcatnome, base.pun,
    base.q_ant, base.q_com, base.q_ven, base.q_atu,
    round(base.q_ant + base.q_com - base.q_atu, 6),
    round(base.q_ant + base.q_com - base.q_ven, 6),
    round(base.q_atu - (base.q_ant + base.q_com - base.q_ven), 6),
    base.q_med,
    v_consideradas,
    case when base.q_med is null or base.q_atu is null then null
         else greatest(base.q_med - base.q_atu, 0) end,
    case when base.q_med is null or base.q_atu is null then null
         else base.q_atu <= base.q_med end,
    base.p_custo,
    base.pend
  from base
  order by base.pnome;
end $$;

-- `create or replace function` preserva o grant, mas quem reaplica a 0023 por
-- cima (o `supabase db push` com o historico atras do banco) faz `drop
-- function`, e ai o grant cai. Re-outorgar aqui e barato e deixa a ordem das
-- passadas sem importancia.
grant execute on function mv_relatorio_de_contagem(uuid) to authenticated;
