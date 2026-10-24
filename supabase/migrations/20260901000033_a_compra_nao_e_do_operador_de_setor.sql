-- ===========================================================================
-- 0033 · A compra nao e do operador de setor
--
-- A 0018 abre com a frase que decide este arquivo:
--
--   "Quem conta o bar nao precisa — e nao deve — enxergar o CMV, AS NOTAS, a
--    equipe, nem a contagem da cozinha. Este arquivo cria o acesso mais
--    estreito do sistema: uma pessoa, um ou mais setores, uma tela."
--
-- E `web/src/rotas.ts` repete, sobre o mesmo perfil: "cadastro, COMPRAS, CMV e
-- equipe nao sao assunto seu".
--
-- A intencao esta escrita duas vezes. A politica nunca foi escrita: `notas_fiscais`,
-- `nota_itens` e `fornecedores` continuaram pedindo `mv_pode_operar` e nada
-- mais, desde a 0004. Entao isto nao e decisao de permissao da cliente a
-- tomar: e a 0018 inacabada. A 0024 fez esta mesma metade para a venda, e a
-- 0030 para o CMV, as duas citando esta mesma frase.
--
-- Medido pela API, com `perfil_setores` ligando a operadora ao setor "Bar", e
-- o token dela — isto e o estado ANTES:
--
--   LE  notas_fiscais ......... 133      LE  vendas ............ 0   ok (0024)
--   LE  nota_itens ............ 693      LE  venda_itens ....... 0   ok (0024)
--   LE  vw_compras_historico .. 133      LE  contagem_itens ... 556 de 868  ok
--   LE  fornecedores ........... 42      LE  venda_apelidos .... le tudo
--   GRAVA notas_fiscais ... HTTP 201 ACEITOU
--   GRAVA fornecedores .... HTTP 201 ACEITOU
--   RPC mv_lancar_nota .... ACEITOU E LANCOU
--
-- O ultimo e o que o revisor nao mediu, e e o pior: `mv_lancar_nota` chama
-- `mv_atualiza_custo_medio`, que faz `update produtos set custo_medio = ...`
-- na casa INTEIRA. Quem conta uma aba podia reescrever o custo de 906 insumos,
-- e com ele o valor do estoque de todos os setores e o CMV de todo mundo. Nao
-- e "ler o que nao e dele": e mexer no numero dos outros.
--
-- Quatro tabelas, e a razao de cada uma:
--
--  · `notas_fiscais` e `nota_itens` — "as notas", literal na 0018. Fechar a
--    tabela fecha tambem `vw_compras_historico`, que e `security_invoker`.
--  · `fornecedores` — existe para ser a contraparte das notas, e e a
--    importacao de compras que cria os 42 a partir da planilha. Deixar de fora
--    seria fechar a nota e deixar quem a emitiu aberto.
--  · `venda_apelidos` na LEITURA — a 0027 ja barrou a escrita dele para este
--    perfil, e a 0024 fechou `vendas` e `venda_itens`. Sobrou ele lendo o
--    vocabulario de cardapio de uma tabela que o perfil nao enxerga. E
--    inconsistencia, nao dinheiro, mas e de graca consertar.
--
-- O que NAO entra, e por que: `produtos`, `categorias`, `setores` e
-- `contagens` continuam legiveis, porque a folha de contagem dele e feita
-- deles — e e a unica tela que ele tem. `listas_compras` fica como esta: ela
-- nasce do cadastro, nao de dinheiro, e mexer nela sem medida seria trocar uma
-- suposicao por outra.
--
-- Conferido depois do conserto que nenhuma tela do perfil quebra:
-- `ROTAS_DO_OPERADOR_DE_SETOR` sao `/contagem`, `/contagem/historico` e
-- `/contagem/<id>`, e nenhuma delas chama `useCompras`, `useFornecedores` nem
-- `useVendaApelidos` — esses tres vivem em `paginas/compras/*`, em `Inicio` e
-- em `PlanilhaDeVendas`, todos fora do alcance dele.
-- ===========================================================================

drop policy if exists notas_fiscais_ler on notas_fiscais;
create policy notas_fiscais_ler on notas_fiscais for select to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists notas_fiscais_criar on notas_fiscais;
create policy notas_fiscais_criar on notas_fiscais for insert to authenticated
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists notas_fiscais_editar on notas_fiscais;
create policy notas_fiscais_editar on notas_fiscais for update to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores())
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists notas_fiscais_apagar on notas_fiscais;
create policy notas_fiscais_apagar on notas_fiscais for delete to authenticated
  using (mv_pode_administrar(restaurante_id) and not mv_restrito_a_setores());

-- A politica do item ja passa pela nota; o `not mv_restrito_a_setores()` entra
-- explicito do mesmo jeito que a 0024 fez em `venda_itens_tudo`, para quem ler
-- a politica do item nao precisar ir ler a da nota para saber a resposta.
drop policy if exists nota_itens_tudo on nota_itens;
create policy nota_itens_tudo on nota_itens for all to authenticated
  using (not mv_restrito_a_setores()
         and exists (select 1 from notas_fiscais n
                      where n.id = nota_itens.nota_id and mv_pode_operar(n.restaurante_id)))
  with check (not mv_restrito_a_setores()
              and exists (select 1 from notas_fiscais n
                           where n.id = nota_itens.nota_id and mv_pode_operar(n.restaurante_id)));

drop policy if exists fornecedores_ler on fornecedores;
create policy fornecedores_ler on fornecedores for select to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists fornecedores_criar on fornecedores;
create policy fornecedores_criar on fornecedores for insert to authenticated
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists fornecedores_editar on fornecedores;
create policy fornecedores_editar on fornecedores for update to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores())
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists fornecedores_apagar on fornecedores;
create policy fornecedores_apagar on fornecedores for delete to authenticated
  using (mv_pode_administrar(restaurante_id) and not mv_restrito_a_setores());

-- O vocabulario do cardapio, agora coerente com as vendas estarem fechadas.
drop policy if exists venda_apelidos_ler on venda_apelidos;
create policy venda_apelidos_ler on venda_apelidos for select to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

-- `mv_lancar_nota` e `mv_atualiza_custo_medio` sao `security invoker`: fechada
-- a leitura da nota, o `update notas_fiscais ... returning` de dentro dela nao
-- acha mais a linha e ela para na propria frase de "nao encontrada". Mesmo
-- assim a recusa fica EXPLICITA e no topo, no molde da 0024 e da 0030: a
-- proxima tela que alguem escrever vai chamar a funcao, e "deu erro de nota
-- nao encontrada" nao explica a uma pessoa por que ela nao pode lancar compra.
-- O corpo e o da 0009, palavra por palavra — inclusive as recusas de relancar
-- e de lancar nota cancelada, que a suite cobre —, com o `raise` novo no topo.
create or replace function mv_lancar_nota(p_nota uuid)
returns notas_fiscais
language plpgsql security invoker set search_path = public as $$
declare v_nota notas_fiscais; v_pendentes integer; v_status status_nota;
begin
  if mv_restrito_a_setores() then
    raise exception 'lancar compra e da casa e seu acesso e de setor: peca o lancamento a quem administra';
  end if;

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

comment on function mv_lancar_nota(uuid) is
  'Lanca a nota depois de conferir que nao ha item pendente. Recusa acesso de setor: lancar compra move o custo medio da casa inteira.';

grant execute on function mv_lancar_nota(uuid) to authenticated;
