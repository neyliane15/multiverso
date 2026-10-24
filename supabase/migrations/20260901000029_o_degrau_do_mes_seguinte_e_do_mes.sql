-- ===========================================================================
-- 0029 · O degrau do mes seguinte vale para o MES, nao para toda janela que
--        acaba no dia 30
--
-- A regra, escrita pela cliente: "mesmo que a contagem do final do mes tenha
-- sido feita no mes seguinte, voce ira pegar a primeira contagem do mes
-- seguinte para ser o estoque final".
--
-- A 0027 implementou isso com a condicao `p_fim e o ultimo dia do mes`, e a
-- condicao estava CERTA em existir. Medido sem ela, no Bar do Zeca com as
-- notas de setembro lancadas (contagens em 31/08 e 01/10):
--
--   31/08-06/09   final 01/10   CMV R$ 35.498,98
--   07/09-13/09   final 01/10   CMV R$ 28.844,12
--   14/09-20/09   final 01/10   CMV R$ 21.910,16
--   21/09-27/09   final 01/10   CMV R$ 18.579,58
--
-- Quatro semanas, quatro numeros fabricados: cada um e a queda de estoque do
-- MES inteiro (R$ 6.720,01) somada as compras daquela semana. Com a condicao,
-- as quatro voltam "Falta a contagem de estoque final", que e a verdade.
--
-- Mas a condicao olha so o FIM da janela, e isso deixa passar o mesmo erro por
-- outra porta. Medido na mesma funcao, com a mesma carga:
--
--   21/09-30/09 (dez dias)   final 01/10   CMV R$ 23.617,59
--   30/09-30/09 (um dia!)    final 01/10   CMV R$  7.883,27
--
-- Dez dias e um dia, com a queda de estoque de um mes dentro. E isso nao e
-- hipotese de laboratorio: a serie semanal da tela chama `mv_cmv_periodo` com
-- `[inicio da semana, +6 dias]`, e quando o ultimo dia do mes cai no ultimo dia
-- da semana da casa, UMA semana da serie acaba exatamente no fim do mes. Com
-- `dia_virada_semana = 1` (segunda a domingo), maio de 2026 e um desses meses:
-- 31/05/2026 e domingo, e a semana 25/05-31/05 puxaria a contagem de junho.
-- A cada ano todo restaurante passa por um ou dois desses meses.
--
-- A regra da cliente fala do mes. Entao a condicao passa a ser a janela SER um
-- mes civil: comeca no dia 1o e acaba no ultimo dia do mesmo mes. E uma linha a
-- mais na mesma condicao, e e menos invasiva que inventar outra regra: a serie
-- mensal (`date_trunc('month')` + 1 mes - 1 dia) continua caindo nela exata, e
-- nenhuma janela que nao seja um mes recebe estoque final de outro mes.
-- ===========================================================================
create or replace function mv_contagens_do_periodo(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  inicial_id        uuid,
  inicial_data      date,
  inicial_total     numeric,
  final_id          uuid,
  final_data        date,
  final_total       numeric,
  final_fora_do_periodo boolean
)
language plpgsql stable security invoker set search_path = public as $$
declare c_ini contagens; c_fim contagens;
begin
  -- Estoque inicial: a foto mais recente ate a virada do periodo.
  select * into c_ini from contagens
   where restaurante_id = p_restaurante and status = 'fechada' and referencia <= p_inicio
   order by referencia desc, fechada_em desc limit 1;

  -- Estoque final, degrau (a): a foto mais recente dentro do periodo, nunca a
  -- mesma do inicial.
  select * into c_fim from contagens
   where restaurante_id = p_restaurante and status = 'fechada'
     and referencia <= p_fim and referencia > coalesce(c_ini.referencia, '-infinity'::date)
   order by referencia desc, fechada_em desc limit 1;

  final_fora_do_periodo := false;

  -- Degrau (b): a PRIMEIRA contagem fechada do mes civil seguinte. `asc` de
  -- proposito — a regra dela diz a PRIMEIRA, nao a ultima.
  --
  -- E so quando a janela E UM MES CIVIL: comeca no dia 1o e acaba no ultimo dia
  -- do mesmo mes. Olhar so o fim deixava uma janela de dez dias (21/09-30/09) e
  -- uma de um dia (30/09) puxarem a contagem de outubro e mostrarem a queda de
  -- estoque de um mes inteiro como se fosse daqueles dias — e a serie semanal
  -- cai nessa porta sozinha nos meses em que o ultimo dia do mes e o ultimo dia
  -- da semana da casa.
  if c_fim.id is null
     and p_inicio = date_trunc('month', p_fim)::date
     and p_fim = (date_trunc('month', p_fim) + interval '1 month - 1 day')::date then
    select * into c_fim from contagens
     where restaurante_id = p_restaurante and status = 'fechada'
       and referencia >= (date_trunc('month', p_fim) + interval '1 month')::date
       and referencia <  (date_trunc('month', p_fim) + interval '2 month')::date
       and referencia >  coalesce(c_ini.referencia, '-infinity'::date)
     order by referencia asc, fechada_em asc limit 1;
    final_fora_do_periodo := c_fim.id is not null;
  end if;

  inicial_id    := c_ini.id;
  inicial_data  := c_ini.referencia;
  inicial_total := c_ini.total;
  final_id      := c_fim.id;
  final_data    := c_fim.referencia;
  final_total   := c_fim.total;
  return next;
end $$;

comment on function mv_contagens_do_periodo(uuid, date, date) is
  'As duas contagens fechadas que delimitam um periodo. O estoque final do mes seguinte vale so quando a janela E um mes civil. Fonte unica para mv_cmv_periodo e mv_cmv_por_categoria.';

grant execute on function mv_contagens_do_periodo(uuid, date, date) to authenticated;
