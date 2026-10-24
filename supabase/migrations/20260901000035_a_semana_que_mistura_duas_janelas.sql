-- ===========================================================================
-- 0035 · A semana que mistura um mes de estoque com uma semana de compras
--
-- `CMV = estoque inicial + compras - estoque final` so e consumo quando a
-- compra cobre o MESMO intervalo que as duas fotos de estoque delimitam. A
-- serie semanal chama `mv_cmv_periodo` com uma janela de sete dias, e as
-- contagens que respondem sao as que existem — que podem estar a um mes de
-- distancia. Medido no meu banco, com as 133 notas lancadas:
--
--   janela           estoque inicial  estoque final   compras      CMV
--   31/08 a 06/09      31/08            (nenhuma)    28.778,97    (vazio)
--   07/09 a 13/09      31/08            (nenhuma)    22.124,11    (vazio)
--   21/09 a 27/09      31/08            (nenhuma)    11.859,57    (vazio)
--   28/09 a 04/10      31/08            01/10         5.038,01   11.758,0163
--
-- As tres primeiras voltam pendentes, que e o certo. A quarta fecha, e o
-- numero e a queda de estoque de 32 dias (78.681,3573 - 71.961,3510) menos as
-- compras de 7 (R$ 5.038,01). Nao e o consumo da semana, nao e o consumo do
-- mes, nao e o consumo de nada: faltam 25 dias de compra dentro de uma queda
-- de estoque que os inclui. E aparece na tela rotulado "Sem 28/09".
--
-- Isto e heranca da 0005, nao da 0027, e e defeito — nao leitura legitima.
--
-- O conserto CERTO e somar a compra pelo intervalo que as duas fotos
-- delimitam, `(inicial.referencia, final.referencia]`, que e a definicao de
-- periodo do proprio projeto. Ele muda o significado de `compras` nas duas
-- funcoes de CMV e o rotulo da serie inteira: e redesenho do periodo, e
-- entrega propria. (Vale registrar que ele arrumaria tambem uma assimetria que
-- ninguem notou: hoje o estoque final de 01/10 entra em setembro — a tela
-- explica que "o movimento entre 30/09 e 01/10 entra neste CMV" — mas a
-- compra de 01/10 nao entra, porque `compras` para no dia 30.)
--
-- O que esta migracao faz e a metade que nao fabrica nada: dar a serie as duas
-- datas que `mv_cmv_periodo` ja devolve, para a tela poder comparar o
-- intervalo do estoque com o da janela e parar de chamar aquele numero de "CMV
-- da semana". Numero errado e pior que numero ausente — a regra esta escrita
-- na 0005.
--
-- `mv_cmv_serie` le de `mv_cmv_periodo` por NOME, entao as duas colunas novas
-- entram sem mexer no resto.
-- ===========================================================================

drop function if exists mv_cmv_serie(uuid, text, integer, date);

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
  pendencia            text,
  estoque_inicial_data date,
  estoque_final_data   date
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
           c.cmv, c.completo, c.pendencia, c.estoque_inicial_data, c.estoque_final_data
      into inicio, fim, estoque_inicial, compras, estoque_final, cmv, completo, pendencia,
           estoque_inicial_data, estoque_final_data
      from mv_cmv_periodo(p_restaurante, d_ini, d_fim) c;
    return next;
  end loop;
end $$;

comment on function mv_cmv_serie(uuid, text, integer, date) is
  'Serie de CMV, semanal ou mensal, com as datas das duas contagens que fecharam cada janela — para a tela poder dizer quando o intervalo do estoque nao e o da janela.';

grant execute on function mv_cmv_serie(uuid, text, integer, date) to authenticated;
