-- ===========================================================================
-- 0034 · O mes ja lido que muda de numero, e a data que denuncia
--
-- A 0027 registrou o raciocinio e nao mediu, porque o Bar do Zeca nao tem
-- contagem antes de 31/08. Montei a casa com a contagem de 31/07 e medi.
--
-- O CMV de agosto de 2026, no mesmo banco, com a mesma contagem de 31/07 e a
-- mesma de 31/08, so mudando se a planilha de SETEMBRO esta importada:
--
--   sem a planilha:   compras R$     0,00 ·  0 notas · CMV R$     0,00
--   com a planilha:   compras R$ 1.365,48 ·  5 notas · CMV R$ 1.365,48
--                     (cmv_limpeza R$ 573,00 · cmv_insumo R$ 792,48)
--
-- As cinco notas estao emitidas em agosto (26/08 a 31/08) e chegaram dentro do
-- arquivo de setembro. `mv_cmv_periodo` soma a compra pela EMISSAO, entao elas
-- caem em agosto — e isso esta CERTO: nota que chega atrasada e compra de
-- agosto, nao de setembro. O defeito nao e o numero, e o silencio. Um mes que
-- alguem ja leu passou de zero a mil trezentos e sessenta e cinco reais, e
-- nenhuma tela diz que isso aconteceu.
--
-- A previa da importacao avisa ANTES de gravar ("As notas desta planilha estao
-- emitidas em 2 meses diferentes...", `dados/planilha/compras.ts`). Depois de
-- gravar, nada. Quem abrir agosto no mes que vem ve um numero diferente do que
-- leu, sem rastro.
--
-- O conserto honesto e barato e UMA data: quando a compra mais recente deste
-- periodo ENTROU no sistema (`notas_fiscais.criado_em`, que e diferente de
-- `emitida_em`). Com ela, a tela pode dizer a frase que faltava — "se alguem
-- leu este numero antes de 24/10/2026, ele mudou depois".
--
-- O que NAO foi feito, e por que: guardar o CMV fechado de cada mes para
-- comparar depois. Seria o conserto completo — "em 20/10 este mes valia X" —
-- e e uma entrega propria (fechamento de periodo, com quem fechou e quando).
-- Inventar meia versao dela aqui daria um numero guardado que ninguem sabe se
-- vale, que e pior que uma data honesta.
-- ===========================================================================

drop function if exists mv_cmv_periodo(uuid, date, date);

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
  cmv_insumo                    numeric,
  compras_divergencia_operacao  numeric,
  compras_sem_classificacao     numeric,
  compras_entrada_mais_recente  date
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c record;
  v_compras numeric := 0; v_notas integer := 0; v_entrada date;
  f record;
  v_compras_limpeza numeric := 0;
  v_divergencia numeric := 0;
  v_sem_classificacao numeric := 0;
  v_ini_limpeza numeric; v_fim_limpeza numeric;
begin
  if mv_restrito_a_setores() then
    raise exception 'este relatorio soma a casa inteira e seu acesso e de setor: peca a leitura a quem administra';
  end if;

  select * into c from mv_contagens_do_periodo(p_restaurante, p_inicio, p_fim);

  select coalesce(sum(n.valor_total), 0), count(*), max(n.criado_em)::date
    into v_compras, v_notas, v_entrada
    from notas_fiscais n
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

  -- A categoria do insumo vinculado, e NADA MAIS (0031). Mesma base das duas
  -- pontas de estoque abaixo, que e o que faz as tres parcelas falarem do
  -- mesmo conjunto de coisas.
  select coalesce(sum(it.valor_total) filter (
             where coalesce(cat.fora_do_insumo, false)), 0),
         coalesce(sum(it.valor_total) filter (
             where it.produto_id is not null
               and coalesce(cat.fora_do_insumo, false)
                   is distinct from mv_operacao_fora_do_insumo(it.operacao)), 0),
         coalesce(sum(it.valor_total) filter (where it.produto_id is null), 0)
    into v_compras_limpeza, v_divergencia, v_sem_classificacao
    from nota_itens it
    join notas_fiscais n on n.id = it.nota_id
    left join produtos p on p.id = it.produto_id
    left join categorias cat on cat.id = p.categoria_id
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

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

  compras_divergencia_operacao := v_divergencia;
  compras_sem_classificacao    := v_sem_classificacao;
  compras_entrada_mais_recente := v_entrada;

  return next;
end $$;

comment on function mv_cmv_periodo(uuid, date, date) is
  'CMV do periodo com faturamento, os dois percentuais, limpeza separada pela CATEGORIA nas tres pontas, e a data em que a compra mais recente entrou no sistema. Recusa acesso de setor.';

grant execute on function mv_cmv_periodo(uuid, date, date) to authenticated;
