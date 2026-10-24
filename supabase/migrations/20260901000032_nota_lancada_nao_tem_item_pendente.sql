-- ===========================================================================
-- 0032 · Nota lancada nao tem item pendente, por nenhum caminho
--
-- A regra existe desde a 0004 e e a base de tudo que soma compra:
--
--   if v_pendentes > 0 then
--     raise exception 'a nota tem % item(ns) sem produto vinculado', v_pendentes;
--
-- So que ela mora dentro de `mv_lancar_nota`, e ninguem e obrigado a passar
-- por ela. A politica `notas_fiscais_editar` libera UPDATE para quem pode
-- operar, e `status` e uma coluna como outra qualquer. Medido pela API, com o
-- token do admin da casa:
--
--   POST /nota_itens            (descricao, sem produto_id)          HTTP 201
--   POST /rpc/mv_lancar_nota    "a nota tem 1 item(ns) sem produto vinculado"
--   PATCH /notas_fiscais?id=eq.<n>  {"status":"lancada"}             HTTP 204
--
--   mv_cmv_periodo depois: compras R$ 83.417,81 em 129 notas (eram 128),
--   e os R$ 1.000 do item pendente dentro do CMV.
--
-- Duas coisas se perdem no desvio. A trava do item pendente, que e o que faz
-- "compra lancada" significar "compra que alguem conferiu". E
-- `mv_atualiza_custo_medio`, que `mv_lancar_nota` chama depois de gravar: a
-- nota entra no CMV e o custo do insumo nao se move, o que deixa o estoque
-- valendo o preco da compra anterior sem ninguem pedir isso.
--
-- O molde e o da 0023, que ja fez exatamente isto para a venda fechada: a
-- regra vira gatilho, porque gatilho nao se contorna escolhendo outra rota.
-- Dois, porque o desvio tem duas pontas:
--
--   a) `update notas_fiscais set status = 'lancada'` com item pendente;
--   b) pendurar item sem insumo numa nota JA lancada.
--
-- `mv_lancar_nota` nao precisa de excecao: quando ela faz o `update`, ja
-- conferiu que ha zero pendentes, e o gatilho confere a mesma coisa e deixa
-- passar. A mensagem e a dela, palavra por palavra, para a tela nao ter duas
-- frases para o mesmo fato.
--
-- E ha uma terceira ponta que NAO se tranca, de proposito: desvincular o
-- insumo de um item de nota lancada (`update nota_itens set produto_id =
-- null`). O motivo e que `nota_itens_produto_id_fkey` e `on delete set null`
-- desde a 0004 — apagar um insumo do cadastro ESVAZIA, por desenho, o vinculo
-- de todas as notas que o compraram, inclusive as lancadas. Um gatilho de
-- UPDATE sobre `produto_id` nao distingue a mao da pessoa da acao da chave
-- estrangeira, e trancar as duas faria "apagar um insumo com historico de
-- compra" passar a falhar — regressao pior do que o furo.
--
-- Por isso a 0031 devolve `compras_sem_classificacao`: este caminho existe por
-- desenho, e a resposta certa para ele e a tela DIZER quanto dinheiro de nota
-- lancada ficou sem categoria, nao fingir que nao acontece.
-- ===========================================================================

create or replace function mv_nota_lancada_sem_pendencia()
returns trigger
language plpgsql set search_path = public as $$
declare v_pendentes integer;
begin
  if new.status = 'lancada' and old.status is distinct from 'lancada' then
    select count(*) into v_pendentes from nota_itens
     where nota_id = new.id and produto_id is null;
    if v_pendentes > 0 then
      raise exception 'a nota tem % item(ns) sem produto vinculado', v_pendentes;
    end if;
  end if;
  return new;
end $$;

comment on function mv_nota_lancada_sem_pendencia() is
  'A trava de item pendente da 0004, como gatilho: `update status = lancada` pela API nao passa por mv_lancar_nota.';

drop trigger if exists t_notas_fiscais_sem_pendencia on notas_fiscais;
create trigger t_notas_fiscais_sem_pendencia
  before update of status on notas_fiscais
  for each row execute function mv_nota_lancada_sem_pendencia();

-- A outra ponta: o item que NASCE pendente dentro de uma nota ja lancada. So
-- INSERT, pelo que esta escrito no cabecalho: o UPDATE de `produto_id` e o que
-- a chave estrangeira usa para esvaziar o vinculo quando o insumo e apagado do
-- cadastro, e trancar isso trancaria apagar insumo com historico de compra.
create or replace function mv_item_de_nota_lancada()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.produto_id is null
     and (select status from notas_fiscais where id = new.nota_id) = 'lancada' then
    raise exception 'esta nota ja esta lancada: item sem insumo vinculado nao entra nela';
  end if;
  return new;
end $$;

comment on function mv_item_de_nota_lancada() is
  'Item sem insumo vinculado nao nasce dentro de nota ja lancada. So INSERT: o update de produto_id e o caminho do `on delete set null` do cadastro.';

drop trigger if exists t_nota_itens_sem_pendencia on nota_itens;
create trigger t_nota_itens_sem_pendencia
  before insert on nota_itens
  for each row execute function mv_item_de_nota_lancada();
