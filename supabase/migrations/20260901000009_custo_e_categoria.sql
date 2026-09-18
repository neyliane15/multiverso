-- ============================================================================
-- Multiverso · 0009 · Tres defeitos no caminho do custo, achados em auditoria
-- ============================================================================

-- ─── 1. O custo do setor que nota nenhuma atualizava ────────────────────────
--
-- mv_atualiza_custo_medio so tocava vinculo com custo zero (`and ps.custo = 0`).
-- Na carga do Bar do Zeca, 806 dos 868 vinculos tem custo diferente de zero —
-- ou seja, para 93% do catalogo o custo que a contagem usa nunca se movia,
-- por mais notas que entrassem. Cerveja sobe 20% em setembro, a nota e lancada,
-- a tela de Produtos mostra o preco novo, e a contagem de setembro continua
-- valorizando pelo preco de agosto. Em silencio.
--
-- Mas sair sobrescrevendo tudo seria pior. Ha vinculo cujo custo NAO e preco de
-- compra: file de tilapia e R$ 41,50/KG no Estoque Geral (o que se paga) e
-- R$ 6,34 a porcao nos Porcionados (o que se calcula). Sobrescrever o segundo
-- com o primeiro destruiria justamente o dado que o modulo existe para guardar.
--
-- Dai a coluna: o vinculo diz se o custo dele acompanha a compra ou e proprio.
alter table produto_setores
  add column if not exists custo_fixo boolean not null default false,
  add column if not exists custo_atualizado_em timestamptz;

comment on column produto_setores.custo_fixo is
  'true = custo calculado pela casa (porcao, receita) e nao acompanha nota. false = segue o custo de compra.';
comment on column produto_setores.custo_atualizado_em is
  'Quando este custo mudou pela ultima vez. A folha de contagem mostra a data para ninguem contar com preco velho sem saber.';

alter table produtos
  add column if not exists custo_atualizado_em timestamptz;

-- ─── 2. Nota com duas linhas do mesmo produto sorteava o custo ──────────────
--
-- `update produtos set custo_medio = i.custo_convertido from nota_itens i` com
-- duas linhas casando o mesmo produto — rotina numa nota de distribuidora, dois
-- lotes com precos diferentes — deixa o Postgres escolher UMA linha arbitraria.
-- Reimportar a mesma nota podia dar outro numero.
--
-- Agora agrega antes: o custo e o desembolso total dividido pela quantidade
-- total, que e a media ponderada daquela nota.
create or replace function mv_atualiza_custo_medio(p_nota uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  with por_produto as (
    select i.produto_id,
           sum(i.valor_total) as desembolso,
           sum(i.quantidade * i.fator_conversao) as quantidade
      from nota_itens i
     where i.nota_id = p_nota and i.produto_id is not null
     group by i.produto_id
    having sum(i.quantidade * i.fator_conversao) > 0
       and sum(i.valor_total) > 0
  )
  update produtos p
     set custo_medio = round(x.desembolso / x.quantidade, 6),
         custo_atualizado_em = now(),
         atualizado_em = now()
    from por_produto x
   where x.produto_id = p.id;

  -- O vinculo acompanha a compra, salvo quando a casa marcou que o custo e dela.
  with por_produto as (
    select i.produto_id,
           sum(i.valor_total) as desembolso,
           sum(i.quantidade * i.fator_conversao) as quantidade
      from nota_itens i
     where i.nota_id = p_nota and i.produto_id is not null
     group by i.produto_id
    having sum(i.quantidade * i.fator_conversao) > 0
       and sum(i.valor_total) > 0
  )
  update produto_setores ps
     set custo = round(x.desembolso / x.quantidade, 6),
         custo_atualizado_em = now()
    from por_produto x
   where x.produto_id = ps.produto_id
     and not ps.custo_fixo;
end $$;

-- Relancar uma nota reaplicaria o custo, e nota cancelada voltaria a contar.
create or replace function mv_lancar_nota(p_nota uuid)
returns notas_fiscais
language plpgsql security invoker set search_path = public as $$
declare v_nota notas_fiscais; v_pendentes integer; v_status status_nota;
begin
  select status into v_status from notas_fiscais where id = p_nota;
  if v_status is null then raise exception 'nota % nao encontrada', p_nota; end if;
  if v_status = 'lancada'  then raise exception 'esta nota ja foi lancada'; end if;
  if v_status = 'cancelada' then raise exception 'nota cancelada nao pode ser lancada'; end if;

  select count(*) into v_pendentes from nota_itens
   where nota_id = p_nota and produto_id is null;
  if v_pendentes > 0 then
    raise exception 'a nota tem % item(ns) sem produto vinculado', v_pendentes;
  end if;

  update notas_fiscais set status = 'lancada'
   where id = p_nota and status not in ('lancada', 'cancelada')
  returning * into v_nota;

  perform mv_atualiza_custo_medio(p_nota);
  return v_nota;
end $$;

-- A folha de contagem passa a carregar a data do custo que esta usando.
create or replace function mv_abrir_contagem(
  p_restaurante uuid,
  p_referencia  date,
  p_tipo        tipo_contagem default 'mensal',
  p_titulo      text default null,
  p_setores     uuid[] default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into contagens (restaurante_id, referencia, tipo, titulo, criado_por)
  values (p_restaurante, p_referencia, p_tipo,
          coalesce(p_titulo, initcap(p_tipo::text) || ' · ' || to_char(p_referencia, 'DD/MM/YYYY')),
          auth.uid())
  returning id into v_id;

  insert into contagem_itens (contagem_id, produto_id, setor_id, unidade, custo_unitario, observacao)
  select v_id, ps.produto_id, ps.setor_id, ps.unidade,
         case when ps.custo > 0 then ps.custo else p.custo_medio end,
         case when coalesce(ps.custo_atualizado_em, p.custo_atualizado_em) is not null
              then 'custo de ' || to_char(
                     coalesce(ps.custo_atualizado_em, p.custo_atualizado_em), 'DD/MM/YYYY')
         end
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
    join setores  s on s.id = ps.setor_id
   where p.restaurante_id = p_restaurante
     and p.ativo and s.ativo and ps.ativo
     and (p_setores is null or ps.setor_id = any (p_setores));

  return v_id;
end $$;

-- ─── 3. Categoria nula ou arquivada sumia da abertura por categoria ─────────
--
-- O CTE partia de `categorias where ativo` e ligava por left join, entao
-- produto sem categoria (a FK e `on delete set null`) ou de categoria
-- arquivada simplesmente nao aparecia. O total do periodo continuava contando
-- aqueles itens, a abertura parava de lista-los, e as colunas deixavam de
-- fechar sem nada avisar. Pior: a tela de Contagem MOSTRA um grupo "Sem
-- categoria", entao as duas telas discordavam sobre a existencia dos produtos.
--
-- Agora o eixo sao os DADOS, nao o cadastro de categorias: quem tem movimento
-- aparece, inclusive a categoria arquivada e o balde "Sem categoria".
-- A assinatura ganha `categoria_ativa`, e o Postgres nao deixa CREATE OR REPLACE
-- mudar o tipo de retorno. Derrubar e recriar e o unico caminho.
drop function if exists mv_cmv_por_categoria(uuid, date, date);

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
  -- Todo cid que apareceu em qualquer uma das tres pontas, mais as categorias
  -- ativas sem movimento (que continuam merecendo uma linha zerada na tela).
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

-- ─── 4. A vista de produtos passa a contar o custo do setor por inteiro ─────
-- Sem custo_fixo e custo_atualizado_em aqui, a tela nao teria como mostrar nem
-- deixar mudar a marca que a funcao acima consulta.
-- CREATE OR REPLACE VIEW nao aceita coluna nova no meio da lista (ele tenta
-- renomear as seguintes). Derrubar e recriar e o caminho; nenhuma outra view
-- depende desta, e o security_invoker e reposto logo abaixo.
drop view if exists vw_produtos_completos;

create view vw_produtos_completos as
select
  p.id, p.restaurante_id, p.nome, p.codigo, p.codigo_barras, p.unidade,
  p.custo_medio, p.custo_atualizado_em, p.estoque_minimo, p.perecivel, p.ativo,
  p.observacao, p.criado_em, p.atualizado_em,
  c.id as categoria_id, c.nome as categoria_nome, c.cor as categoria_cor,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'setor_id', s.id, 'setor_nome', s.nome, 'setor_cor', s.cor,
              'unidade', ps.unidade, 'custo', ps.custo, 'ordem', ps.ordem,
              'custo_fixo', ps.custo_fixo,
              'custo_atualizado_em', ps.custo_atualizado_em)
            order by s.ordem, s.nome)
       from produto_setores ps
       join setores s on s.id = ps.setor_id
      where ps.produto_id = p.id and ps.ativo),
    '[]'::jsonb) as setores
from produtos p
left join categorias c on c.id = p.categoria_id;

alter view vw_produtos_completos set (security_invoker = on);
-- O DROP levou junto o grant que a migracao 0006 tinha dado. Reposto aqui,
-- senao a tela de Produtos recebe "permission denied" na cara do usuario.
grant select on vw_produtos_completos to authenticated;
