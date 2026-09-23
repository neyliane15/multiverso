-- ============================================================================
-- Multiverso · 0005 · Modulo 4: Dashboard CMV
-- ----------------------------------------------------------------------------
--        CMV = Estoque Inicial + Compras − Estoque Final
--
-- Os tres numeros vem de fontes diferentes e o sistema nao inventa nenhum:
--   · Estoque Inicial → ultima contagem FECHADA ate o inicio do periodo
--   · Compras         → notas LANCADAS com emissao dentro do periodo
--   · Estoque Final   → ultima contagem FECHADA dentro do periodo
-- Faltando uma das contagens, o CMV volta nulo com o motivo dito em texto.
-- Numero errado e pior que numero ausente.
-- ============================================================================

-- Semana operacional do restaurante (respeita dia_virada_semana).
create or replace function mv_inicio_semana(p_data date, p_virada smallint default 1)
returns date language sql immutable as $$
  select p_data - ((extract(dow from p_data)::int - p_virada + 7) % 7)
$$;

-- ------------------------------------------------- CMV de um periodo -------
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
  pendencia            text
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c_ini contagens; c_fim contagens;
  v_compras numeric := 0; v_notas integer := 0;
begin
  -- Estoque inicial: a foto mais recente ate a virada do periodo.
  select * into c_ini from contagens
   where restaurante_id = p_restaurante and status = 'fechada' and referencia <= p_inicio
   order by referencia desc, fechada_em desc limit 1;

  -- Estoque final: a foto mais recente dentro do periodo, nunca a mesma do inicial.
  select * into c_fim from contagens
   where restaurante_id = p_restaurante and status = 'fechada'
     and referencia <= p_fim and referencia > coalesce(c_ini.referencia, '-infinity'::date)
   order by referencia desc, fechada_em desc limit 1;

  select coalesce(sum(n.valor_total), 0), count(*) into v_compras, v_notas
    from notas_fiscais n
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

  inicio := p_inicio;
  fim    := p_fim;
  estoque_inicial      := c_ini.total;
  estoque_inicial_data := c_ini.referencia;
  estoque_inicial_id   := c_ini.id;
  compras              := v_compras;
  compras_notas        := v_notas;
  estoque_final        := c_fim.total;
  estoque_final_data   := c_fim.referencia;
  estoque_final_id     := c_fim.id;

  if c_ini.id is null and c_fim.id is null then
    pendencia := 'Nenhuma contagem fechada neste periodo';
  elsif c_ini.id is null then
    pendencia := 'Falta a contagem de estoque inicial';
  elsif c_fim.id is null then
    pendencia := 'Falta a contagem de estoque final';
  end if;

  completo := (c_ini.id is not null and c_fim.id is not null);
  cmv := case when completo then round(c_ini.total + v_compras - c_fim.total, 4) end;
  return next;
end $$;

-- --------------------------------------- CMV aberto por categoria ----------
-- O `drop` e para a SEGUNDA passada: uma migracao posterior muda o formato do
-- retorno desta funcao, e `create or replace function` recusa mudar retorno.
-- Reaplicar esta migracao num banco ja adiantado — o que o `supabase db push`
-- faz sempre que o historico de migracoes esta atras do banco — morria em
-- "cannot change return type of existing function", levando junto a migracao
-- inteira. Quem depende do formato novo e a migracao que o introduziu, e ela
-- roda logo depois desta, na mesma passada.
drop function if exists mv_cmv_por_categoria(uuid, date, date);

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
  select cat.id, cat.nome, cat.cor,
         coalesce(ei.v, 0), coalesce(co.v, 0), coalesce(ef.v, 0),
         round(coalesce(ei.v, 0) + coalesce(co.v, 0) - coalesce(ef.v, 0), 4)
    from cat
    left join ei on ei.cid = cat.id
    left join ef on ef.cid = cat.id
    left join co on co.cid = cat.id
   order by 7 desc;
end $$;

-- ------------------------------------------ serie semanal / mensal ---------
-- Alimenta os graficos 4.1 / 4.2 / 4.3 de uma vez so.
create or replace function mv_cmv_serie(
  p_restaurante   uuid,
  p_granularidade text default 'mensal',   -- 'semanal' | 'mensal'
  p_periodos      integer default 6,
  p_ate           date default current_date
) returns table (
  rotulo               text,
  inicio               date,
  fim                  date,
  estoque_inicial      numeric,
  compras              numeric,
  estoque_final        numeric,
  cmv                  numeric,
  completo             boolean,
  pendencia            text
)
language plpgsql stable security invoker set search_path = public as $$
declare v_virada smallint; d_ini date; d_fim date; i integer;
begin
  if p_granularidade not in ('semanal', 'mensal') then
    raise exception 'granularidade invalida: % (use semanal ou mensal)', p_granularidade;
  end if;
  select dia_virada_semana into v_virada from restaurantes where id = p_restaurante;
  v_virada := coalesce(v_virada, 1);

  for i in reverse (p_periodos - 1) .. 0 loop
    if p_granularidade = 'mensal' then
      d_ini := date_trunc('month', p_ate - (i || ' month')::interval)::date;
      d_fim := (d_ini + interval '1 month - 1 day')::date;
      rotulo := to_char(d_ini, 'TMMon/YY');
    else
      d_ini := mv_inicio_semana((p_ate - (i * 7 || ' day')::interval)::date, v_virada);
      d_fim := d_ini + 6;
      rotulo := 'Sem ' || to_char(d_ini, 'DD/MM');
    end if;

    select c.inicio, c.fim, c.estoque_inicial, c.compras, c.estoque_final,
           c.cmv, c.completo, c.pendencia
      into inicio, fim, estoque_inicial, compras, estoque_final, cmv, completo, pendencia
      from mv_cmv_periodo(p_restaurante, d_ini, d_fim) c;
    return next;
  end loop;
end $$;

-- --------------------------------------- panorama para o master ------------
-- A tela onde o admin ve a rede inteira: um cartao por restaurante.
create or replace view vw_panorama_restaurantes as
select
  r.id, r.nome, r.slug, r.unidade, r.ativo, r.logo_url, r.cor_primaria, r.criado_em,
  (select count(*) from perfis   p where p.restaurante_id = r.id and p.ativo)   as usuarios,
  (select count(*) from produtos p where p.restaurante_id = r.id and p.ativo)   as produtos,
  (select count(*) from setores  s where s.restaurante_id = r.id and s.ativo)   as setores,
  (select count(*) from categorias c where c.restaurante_id = r.id and c.ativo) as categorias,
  (select count(*) from contagens c where c.restaurante_id = r.id)              as contagens,
  (select max(c.referencia) from contagens c
    where c.restaurante_id = r.id and c.status = 'fechada')                     as ultima_contagem,
  (select c.total from contagens c
    where c.restaurante_id = r.id and c.status = 'fechada'
    order by c.referencia desc limit 1)                                         as valor_estoque,
  (select max(p.ultimo_acesso_em) from perfis p where p.restaurante_id = r.id)  as ultimo_acesso
from restaurantes r;
