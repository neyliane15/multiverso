-- ===========================================================================
-- 0025 · Venda fechada fecha tambem no cabecalho
--
-- A 0023 escreveu, no comentario do gatilho e no laudo, que "venda fechada e
-- foto, como contagem fechada: o relatorio de um periodo nao muda de numero
-- depois de lido". O gatilho que ela criou protege `venda_itens`. O cabecalho
-- de `vendas` nao tinha gatilho nenhum — e e no cabecalho que mora a coluna
-- que decide EM QUE PERIODO a venda cai.
--
-- Medido como admin, com identidade de verdade, numa venda FECHADA, sem tocar
-- na tela (so pela API de dados):
--
--   antes:  referencia 2026-10-01 · total_itens 69 · total_valor 2070.0000
--   depois: referencia 2026-07-20 · total_itens  1 · total_valor    1.0000
--
-- Mudar `referencia` move a venda inteira de relatorio: a semana ja lida
-- perde o que explicava o consumo dela, e a semana vizinha ganha uma venda
-- que nunca aconteceu nela. E `total_itens`/`total_valor` existem justamente
-- para CONGELAR o valor no fechamento — editados a mao, passam a contradizer
-- os proprios itens, que o gatilho da 0023 nao deixa mexer.
--
-- A tela nao oferece esse caminho (`const trancado = venda?.status ===
-- 'fechada'` desabilita os campos), e e exatamente por isso que o gatilho
-- precisa existir: tranca de tela nao e tranca. A chave de servico, a API de
-- dados e qualquer script administrativo passam por fora da tela — e nao
-- passam por fora do gatilho.
--
-- O que CONTINUA podendo mudar numa venda fechada: `status` e os dois campos
-- que andam com ele (`fechada_em`, `fechado_por`), porque reabrir e caminho
-- legitimo e registrado (`mv_reabrir_venda`), e cancelar tambem; e
-- `atualizado_em`, que e do gatilho de toque.
--
-- Apagar uma venda fechada continua possivel para quem administra: e acao
-- explicita, confirmada em dialogo proprio e coberta por politica, do mesmo
-- jeito que apagar uma contagem. O que esta migracao fecha e a mudanca
-- SILENCIOSA, nao a decisao assumida.
-- ===========================================================================

create or replace function mv_venda_cabecalho_bloqueado()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'fechada' then
    return new;
  end if;

  -- Campo a campo, e nao `row(new) is distinct from row(old)`: a comparacao da
  -- linha inteira barraria tambem `atualizado_em`, que o gatilho de toque muda
  -- em toda gravacao — e o erro sairia em cima de REABRIR a venda, que e
  -- justamente o caminho certo.
  if new.restaurante_id is distinct from old.restaurante_id
     or new.referencia     is distinct from old.referencia
     or new.inicio         is distinct from old.inicio
     or new.titulo         is distinct from old.titulo
     or new.origem         is distinct from old.origem
     or new.origem_arquivo is distinct from old.origem_arquivo
     or new.total_itens    is distinct from old.total_itens
     or new.total_valor    is distinct from old.total_valor
     or new.criado_por     is distinct from old.criado_por
     or new.criado_em      is distinct from old.criado_em
  then
    raise exception 'venda ja fechada: reabra o lancamento para mudar periodo, titulo ou total';
  end if;
  return new;
end $$;

drop trigger if exists t_vendas_cabecalho_bloqueio on vendas;
create trigger t_vendas_cabecalho_bloqueio
  before update on vendas
  for each row execute function mv_venda_cabecalho_bloqueado();

-- ------------------------------------------------ a mensagem que sobrava ---
-- O laudo do revisor registrou, e nao consertou: quando o operador preso a
-- setor tenta inserir um ITEM numa venda, o erro que chega e "venda e ficha de
-- restaurantes diferentes", do gatilho da 0023 — porque ele nao enxerga a
-- venda (politica da 0024), a subconsulta do gatilho volta nula, e o gatilho
-- roda ANTES da politica. O bloqueio acontece; a frase manda procurar defeito
-- num cadastro que esta certo.
--
-- O gatilho nao tem como saber se a venda nao existe ou se quem pergunta nao
-- pode ve-la — e nao deve fingir que sabe. Entao ele passa a nomear as duas
-- possibilidades em vez de afirmar a errada. O mesmo vale para a ficha.
create or replace function mv_valida_venda_item()
returns trigger
language plpgsql set search_path = public as $$
declare v_ficha fichas; v_venda uuid;
begin
  select restaurante_id into v_venda from vendas where id = new.venda_id;
  select * into v_ficha from fichas where id = new.ficha_id;

  if v_venda is null then
    raise exception 'lancamento de venda % nao encontrado, ou fora do seu acesso', new.venda_id;
  end if;
  if v_ficha.id is null then
    raise exception 'ficha % nao encontrada, ou fora do seu acesso', new.ficha_id;
  end if;
  if v_ficha.restaurante_id <> v_venda then
    raise exception 'venda e ficha de restaurantes diferentes';
  end if;

  -- A regra da casa sobre o cardapio: garrafa e produto fechado, vendido
  -- inteiro; dose e uma pequena quantidade dela. As duas sao ficha de venda.
  -- Producao e o que a casa prepara para usar dentro de outra ficha, e nao tem
  -- preco de carta — vende-la seria vender o xarope por copo.
  if v_ficha.producao then
    raise exception 'a ficha "%" e uma producao: producao e insumo interno e nao se vende', v_ficha.nome;
  end if;
  return new;
end $$;
