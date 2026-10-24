-- ===========================================================================
-- 0031 · A categoria e a fonte UNICA de "isto e limpeza e fica fora do insumo"
--
-- A 0027 escreveu a razao certa no proprio cabecalho:
--
--   "a compra e so uma das tres pontas: MATERIAL DE LIMPEZA (75 insumos) e
--    DESCARTAVEIS (60) estao no catalogo do Bar do Zeca e sao CONTADOS na
--    folha. Separar so a compra deixaria o estoque dos dois lados e o numero
--    sairia errado nas duas metades."
--
-- E escreveu, logo abaixo, o codigo que faz exatamente isso:
--
--   and (coalesce(cat.fora_do_insumo, false) or mv_operacao_fora_do_insumo(it.operacao))
--
-- O estoque sai SO pela categoria; a compra saia pela categoria OU pela
-- operacao do ERP. Sao duas bases diferentes nas duas pontas da mesma conta, e
-- a linha que uma classifica e a outra nao tem a COMPRA de um lado e o ESTOQUE
-- do outro. As duas metades erram, em sentidos opostos, caladas.
--
-- Nao e escolha de gosto: a operacao nao PODE ser a fonte unica, por duas
-- medidas da planilha de setembro da cliente.
--
-- 1. A operacao nao existe nas outras duas pontas. `contagem_itens` nao tem
--    coluna de operacao e nunca vai ter: quem conta uma prateleira nao
--    pergunta ao fornecedor com que rotulo ele faturou. Classificar o estoque
--    pela operacao e impossivel, nao inconveniente.
--
-- 2. A operacao nao e nem funcao do produto. Medido nas 681 linhas de
--    setembro: GUARDANAPO entra DUAS VEZES, com operacoes diferentes —
--
--      nota  37073 de 09/09   R$ 217,98   01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS
--      nota 981664 de 29/09   R$ 110,36   01 - COMPRAS INSUMOS
--
--    O mesmo guardanapo, o mesmo insumo do catalogo (DESCARTAVEIS), dois
--    rotulos. Um classificador que se contradiz dentro do mes, no mesmo
--    produto, nao e fonte de verdade de nada. A categoria e da casa; a
--    operacao e do fornecedor, e e ele quem digita.
--
-- Entao a categoria passa a decidir as TRES pontas, e a operacao para de somar
-- dinheiro. Ela continua guardada em `nota_itens.operacao` — e util, e e o
-- unico sinal que existe antes do vinculo — e passa a servir ao que ela sabe
-- fazer: DIZER que discorda. A funcao devolve duas colunas novas:
--
--   compras_divergencia_operacao  o dinheiro em que a categoria do cadastro e
--                                 a operacao do ERP discordam (R$ 110,36 em
--                                 setembro: o guardanapo faturado como insumo)
--   compras_sem_classificacao     o dinheiro de nota LANCADA cujo item nao tem
--                                 insumo vinculado, e portanto nao tem
--                                 categoria. A divisao limpeza/insumo nao
--                                 alcanca esse valor, e a tela tem de dizer.
--
-- A segunda coluna existe porque o furo e alcancavel: `mv_lancar_nota` recusa
-- nota com item pendente, mas `update notas_fiscais set status = 'lancada'`
-- pela API nao passa por ela (a 0032 fecha isso). Enquanto houver qualquer
-- caminho, a resposta honesta e dizer o tamanho do que a conta nao classifica,
-- em vez de empurrar o valor calado para uma das metades — que e o que o `or`
-- fazia: medido, R$ 1.000,00 de detergente sem insumo vinculado iam inteiros
-- para a limpeza por causa do rotulo da nota.
--
-- O numero de setembro NAO muda com esta migracao, e isso e o ponto: com o
-- de-para feito, as duas contas coincidem, porque todo produto de operacao de
-- limpeza tem par em categoria de limpeza. Medido no banco, as 133 notas
-- lancadas:
--
--   so pela categoria   R$ 6.135,91     <- o que vale a partir de agora
--   so pela operacao    R$ 6.025,55
--   pelo `or` de antes  R$ 6.135,91
--   so pela operacao e nao pela categoria:  (nenhum)
--
--   CMV total      78.681,3573 + 82.417,8100 - 71.961,3510 = R$ 89.137,8163
--   CMV de limpeza  8.014,7700 +  6.135,9100 -  8.561,4235 = R$  5.589,2565
--   CMV de insumo  89.137,8163 - 5.589,2565               = R$ 83.548,5598
--
-- O `or` nunca somou um centavo que a categoria nao somasse; ele so podia
-- somar o que a casa classificou de outro jeito. Retira-se o que so tem como
-- errar.
-- ===========================================================================

-- O retorno ganha duas colunas, e o Postgres nao troca o tipo de retorno de
-- uma funcao existente. Mesmo comentario que a 0005 e a 0007 ja carregam.
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
  compras_sem_classificacao     numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c record;
  v_compras numeric := 0; v_notas integer := 0;
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

  select coalesce(sum(n.valor_total), 0), count(*) into v_compras, v_notas
    from notas_fiscais n
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

  -- A categoria do insumo vinculado, e NADA MAIS. Mesma base das duas pontas
  -- de estoque abaixo, que e o que faz as tres parcelas falarem do mesmo
  -- conjunto de coisas.
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

  return next;
end $$;

comment on function mv_cmv_periodo(uuid, date, date) is
  'CMV do periodo com faturamento, os dois percentuais, e limpeza/descartavel separado pela CATEGORIA nas tres pontas. Recusa acesso de setor.';

comment on function mv_operacao_fora_do_insumo(text) is
  'A operacao do ERP diz que a linha e limpeza/descartavel? Nao classifica dinheiro (ver 0031): serve de sugestao no de-para e de aviso quando discorda da categoria.';

grant execute on function mv_cmv_periodo(uuid, date, date) to authenticated;
