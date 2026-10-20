-- ===========================================================================
-- 0026 · O zero que ninguem contou para de mandar comprar
--
-- A 0023 escreve um numero que a casa nao mediu, em DUAS pontas, e so uma
-- delas esta discutida no laudo dela:
--
--   · produto ausente da folha ANTERIOR  -> `contagem_anterior` = 0
--   · produto ausente da folha ATUAL     -> `contagem_atual`    = 0
--
-- A defesa escrita para a primeira ("o produto e novo, entao tinha zero
-- mesmo") nao se sustenta na carga real. Medido no Bar do Zeca, relatorio de
-- 01/10 contra 31/08, 904 linhas:
--
--   anterior lido como zero ............ 50 linhas, TODAS as 50 ja com
--                                        vinculo de setor no cadastro
--   atual lido como zero ............... 36 linhas, TODAS as 36 com vinculo
--   dessas 36, "precisa comprar" ....... 36 de 36
--   dinheiro sugerido sobre estoque
--     que ninguem contou ............... R$ 309,97 de R$ 424,16 (73%)
--
-- A folha anterior tinha 868 linhas para 906 produtos: ela simplesmente nao
-- os incluiu. O zero nao e o que a foto registra — e o que o sistema escreve
-- no lugar de uma foto que nao existe.
--
-- E ele nao fica quieto. No cenario proprio desta auditoria, um insumo que
-- esta so na folha de agora sai com **consumo = -4**: a conta afirma que
-- saiu do estoque uma quantidade negativa, o que nao existe. O zero
-- inventado nao e um numero discreto; ele vaza para CONSUMO, IDEAL e
-- DIFERENCA — e a diferenca e a coluna que manda o gerente procurar furto.
--
-- Tres decisoes, e a ordem delas importa:
--
-- 1. **A sugestao de compra nao se apoia em estoque que ninguem mediu.**
--    Quando `contagem_atual` foi lido como zero por ausencia, `sugestao` e
--    `precisa_comprar` voltam NULOS. Recomendar compra em cima de um estoque
--    nao medido e gastar dinheiro num chute — e a regra da casa esta escrita
--    desde a 0005: numero errado e pior que numero ausente. A linha nao some
--    e nao perde coluna nenhuma; o que ela perde e o direito de mandar
--    comprar.
--
-- 2. **O zero continua aparecendo em CONSUMO, IDEAL e DIFERENCA — marcado.**
--    Troca-lo por nulo ali esvaziaria 86 das 904 linhas, e e justamente onde
--    o dinheiro acabou de entrar (o SAL que chegou por nota no meio do
--    periodo). Entao o numero fica, mas para de se parecer com uma medida:
--    duas colunas novas dizem, por linha e por ponta, que aquele zero e
--    LEITURA e nao MEDIDA. Ate aqui a unica forma de distinguir as duas
--    coisas era a escala do numerico, que e acidente de representacao.
--
-- 3. **`vendas_consideradas` passa a ter a metade que faltava.** A coluna diz
--    "3 lancamentos considerados" tanto para o insumo que saiu nos tres
--    quanto para o que saiu em um. A media sobre os tres periodos esta certa
--    (semana sem vender e semana de zero, e previsao de compra se faz sobre
--    periodos, nao sobre aparicoes) — o que estava errado era a COLUNA, que
--    afirmava "3" sem dizer que em dois deles o insumo nao saiu. Agora ela
--    diz as duas coisas, e quem le decide se aquele insumo e um item parado
--    ou um item que acabou de entrar no cardapio.
--
-- As duas frases que a 0023 punha em `pendencia` ("o anterior foi lido como
-- zero", "o estoque atual foi lido como zero") saem dali: elas viraram
-- coluna. Em texto corrido elas custavam tres linhas de vermelho por produto
-- na tela — e a tela tem de dizer isso em cada linha sem virar parede.
--
-- O corpo da funcao e o da 0024 (com a recusa de acesso de setor dela, que
-- continua sendo a primeira coisa que ela faz), com as mudancas acima. Ela e
-- redefinida inteira porque a tabela de retorno mudou, e `create or replace`
-- nao muda assinatura.
-- ===========================================================================

drop function if exists mv_relatorio_de_contagem(uuid);
create function mv_relatorio_de_contagem(p_contagem uuid)
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
  pendencia         text,
  -- As tres colunas que esta migracao acrescenta, no FIM da tabela de retorno
  -- para nao mover nenhuma das dezoito que ja existiam.
  anterior_lido_como_zero boolean,
  atual_lido_como_zero    boolean,
  vendas_com_saida        integer
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
           string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente) as motivo,
           -- Em quantos dos lancamentos considerados este insumo de fato SAIU.
           -- `mv_vendas_por_produto` devolve no maximo uma linha por produto
           -- por lancamento, entao isto e a contagem de lancamentos, nao de
           -- itens. E a metade que faltava em `vendas_consideradas`: 3 e
           -- quantos lancamentos entraram na divisao, nao em quantos o insumo
           -- apareceu — e a tela nao tinha como dizer a diferenca.
           count(*) filter (where e.quantidade > 0)::integer  as saidas
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
      -- As duas marcas: este zero foi CONTADO ou foi LIDO por ausencia?
      -- Ate aqui a unica forma de saber era a escala do numerico
      -- (`coalesce(x,0)` volta com escala 0, `round(sum(...),6)` com escala 6),
      -- o que nao e informacao: e acidente de representacao.
      (c_anterior.id is not null and anterior.pid is null) as ant_zero_lido,
      (atual.pid is null)                                  as atu_zero_lido,
      coalesce(media.saidas, 0)                            as n_saidas,
      nullif(concat_ws('; ',
        v_aberta,
        v_sem_anterior,
        case when atual.sem_fator then
          format('a contagem lancou este item em %s, que nao converte para %s',
                 atual.unidade_crua, p.unidade) end,
        case when anterior.sem_fator then
          'a contagem anterior lancou este item em unidade que nao converte para a de compra' end,
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
    case when base.q_med is null or base.q_atu is null or base.atu_zero_lido then null
         else greatest(base.q_med - base.q_atu, 0) end,
    case when base.q_med is null or base.q_atu is null or base.atu_zero_lido then null
         else base.q_atu <= base.q_med end,
    base.p_custo,
    base.pend,
    base.ant_zero_lido,
    base.atu_zero_lido,
    base.n_saidas
  from base
  order by base.pnome;
end $$;

-- O grant vem logo abaixo porque esta migracao faz `drop function`: o `drop`
-- leva o grant junto, e quem reaplicar a 0023 ou a 0024 por cima (o `supabase
-- db push` com o historico atras do banco) refaz a funcao e o grant de novo.
comment on function mv_relatorio_de_contagem(uuid) is
  'Contagem anterior, compras, vendas, contagem atual, consumo, ideal e sugestao de compra, por produto. As colunas anterior_lido_como_zero e atual_lido_como_zero dizem que aquele zero e leitura por ausencia na folha, nao medida.';

grant execute on function mv_relatorio_de_contagem(uuid) to authenticated;

-- ------------------------------------------- o rodape da leitura ----------
-- A mesma tela afirmava duas coisas opostas sobre as mesmas 526 linhas: o KPI
-- do topo as chamava de "itens zerados" e mandava concentrar a reposicao
-- neles, e o rodape as chamava de "linhas sem resposta nenhuma — nem
-- quantidade, nem carimbo".
--
-- Medido na carga de outubro (`supabase/seed/0003_contagem_outubro.sql`),
-- contagem de 01/10 do Bar do Zeca:
--
--   linhas na folha ............ 868
--   com carimbo (`contado_em`) ... 0      <- NENHUMA, nem as 342 preenchidas
--   com quantidade > 0 ......... 342
--   com quantidade = 0 ......... 526      (464 delas com custo preenchido)
--
-- Ou seja: "nem quantidade" e falso — a quantidade esta la, escrita como
-- zero. E "respondido" nao se pode decidir pelo carimbo, porque a folha
-- INTEIRA entrou sem carimbo nenhum. O `itens_respondidos` da 0023 (carimbo
-- OU quantidade) chama 342 de respondidas e 526 de nao-respondidas usando
-- dois criterios diferentes na mesma folha.
--
-- Esta vista para de escolher por conta propria: ela devolve os dois numeros
-- crus, separados, e deixa a frase do rodape dizer o que e verdade em cada
-- caso. `itens_respondidos` continua existindo, com a mesma conta, para nao
-- quebrar quem ja o le.
--
-- O que ISTO NAO conserta: o banco continua sem saber se um zero foi contado
-- ou se a linha ficou em branco, porque a carga grava `quantidade = 0` sem
-- `contado_em`. Saber exigiria mudar a carga 0003 — que ja esta aplicada na
-- producao da cliente — e isso e decisao dela, nao desta migracao.
drop view if exists vw_contagem_procedencia;
create view vw_contagem_procedencia as
select
  c.id as contagem_id,
  c.restaurante_id,
  c.referencia,
  c.tipo,
  c.status,
  c.titulo,
  c.criado_em,
  c.fechada_em,
  (select pc.nome from perfis pc where pc.id = c.criado_por)  as criado_por_nome,
  (select pf.nome from perfis pf where pf.id = c.fechado_por) as fechado_por_nome,
  (select count(*) from contagem_itens i where i.contagem_id = c.id)                       as itens_na_folha,
  (select count(*) from contagem_itens i
    where i.contagem_id = c.id and (i.contado_em is not null or i.quantidade > 0))         as itens_respondidos,
  -- Os dois numeros crus, que e o que o banco de fato sabe.
  (select count(*) from contagem_itens i
    where i.contagem_id = c.id and i.contado_em is not null)                               as itens_com_carimbo,
  (select count(*) from contagem_itens i
    where i.contagem_id = c.id and i.quantidade > 0)                                       as itens_com_quantidade,
  (select count(distinct i.setor_id) from contagem_itens i where i.contagem_id = c.id)     as setores,
  (select count(distinct coalesce(i.estoque_id::text, i.setor_id::text))
     from contagem_itens i where i.contagem_id = c.id)                                     as abas,
  (select count(distinct p.categoria_id) from contagem_itens i
     join produtos p on p.id = i.produto_id
    where i.contagem_id = c.id and p.categoria_id is not null)                             as categorias
from contagens c;

-- Sem isto a vista rodaria com os privilegios do DONO, e a RLS de `contagens`
-- pararia de valer dentro dela: a procedencia da contagem de um restaurante
-- apareceria para o admin de outro. A suite da casa pega isso (`20_fluxos`),
-- e pegou — esta linha estava faltando na primeira versao desta migracao.
alter view vw_contagem_procedencia set (security_invoker = on);

comment on view vw_contagem_procedencia is
  'O rodape da leitura de uma contagem: autoria, abas, e o que a folha tem de carimbo e de quantidade — separados, porque a folha de carga nao tem carimbo nenhum.';

grant select on vw_contagem_procedencia to authenticated;
