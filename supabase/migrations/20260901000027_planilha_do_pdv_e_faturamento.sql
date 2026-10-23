-- ===========================================================================
-- 0027 · A venda que vem da planilha, e o CMV que finalmente tem denominador
--
-- Ate aqui o CMV era so o numerador. `mv_cmv_periodo` (0005) devolve
-- "R$ 51 mil de CMV" e ninguem sabe se isso e bom: 51 mil sobre 80 mil de
-- faturamento e uma casa quebrando, 51 mil sobre 255 mil e uma casa saudavel.
-- O que faltava era o faturamento — e ele chega agora, porque as vendas
-- passaram a vir do PDV.
--
-- Quatro mudancas, e as quatro vem de decisao escrita da cliente.
--
-- 1 ------------------------------------------------- A VENDA GANHA TRES ALVOS
--
-- A 0023 fechou `venda_itens.ficha_id` como `not null`: toda venda entrava em
-- ficha, e a ficha explodia em insumo. A planilha do PDV mostrou os outros dois
-- casos, nas palavras dela:
--
--   "garrafa e produto fechado vendido inteiro, dose e apenas uma pequena
--    quantidade"
--
-- A garrafa nao tem ficha e nao deveria ter: a ficha existe para dizer quanto
-- de cada insumo um prato consome, e a garrafa consome UMA garrafa. Ficha de
-- uma linha para 209 cervejas seria cadastro de enfeite. Entao a venda passa a
-- apontar DIRETO para o produto.
--
-- E ha o terceiro caso, que a planilha trouxe com R$ 53.049,68 em cima da mesa:
-- COUVERT ARTISTICO, Taxa de servico, TAXA ROLHA. Sao 20,8% do faturamento de
-- setembro e **nao consomem insumo nenhum**. Nao sao ficha, nao sao produto, e
-- nao podem ser jogados fora: sem eles o faturamento mente para baixo, com eles
-- no consumo o CMV mente para cima.
--
-- Por isso a coluna `alvo` e um enum de QUATRO valores e nao um par de
-- booleanos: 'ficha', 'produto', 'servico' e 'pendente'. Os dois ultimos tem as
-- MESMAS colunas nulas, e nenhuma coluna poderia distingui-los — porque a
-- diferenca entre eles nao esta no dado, esta na decisao. 'servico' e alguem
-- afirmando "isto nao consome nada"; 'pendente' e ninguem tendo afirmado ainda.
-- Confundir os dois faria toda linha nao resolvida virar faturamento sem custo,
-- calada, o que e exatamente o erro que esta migracao existe para nao cometer.
--
-- 2 ------------------------------------ O DINHEIRO DO PDV E MEDIDA, NAO CONTA
--
-- `venda_itens.total` e coluna gerada: `round(quantidade * preco_unitario, 4)`.
-- Para a venda lancada a mao isso esta certo — 8 porcoes a R$ 42,00. Para a
-- agregacao de um mes de PDV nao fecha: AMSTEL 600 ML saiu 3.063 vezes e
-- faturou R$ 16.633,21, e 16.633,21/3.063 = 5,430398..., que nenhum
-- `numeric(14,4)` representa. Reconstituir dava R$ 16.633,32 — onze centavos de
-- erro em UM item, e 136 itens no arquivo.
--
-- Entao `valor_total_origem` guarda o que o PDV faturou, como ele faturou. O
-- quanto continua medido (`quantidade`, que e o que explode a ficha), o preco
-- unitario passa a ser o que ele sempre foi para uma agregacao: uma media para
-- a tela ler. A prova desta migracao e fechar com a planilha NO CENTAVO, e e
-- esta coluna que deixa.
--
-- 3 -------------------------- LIMPEZA E DESCARTAVEL SAEM DO CMV DE INSUMO
--
-- Decisao dela, literal: limpeza e descartaveis ficam fora do CMV de insumo,
-- com indicador proprio ao lado. Na planilha de compras de setembro sao 36 das
-- 693 linhas, na operacao "01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS".
--
-- Mas a compra e so uma das tres pontas: `MATERIAL DE LIMPEZA` (75 insumos) e
-- `DESCARTAVEIS` (60 insumos) estao no catalogo do Bar do Zeca e sao CONTADOS
-- na folha — eles estao dentro do estoque inicial e do final tambem. Separar so
-- a compra deixaria o estoque dos dois lados e o numero sairia errado nas duas
-- metades.
--
-- Por isso a marca mora na CATEGORIA (`categorias.fora_do_insumo`), que e o que
-- as tres pontas tem em comum, e a `operacao` da nota entra como segundo sinal
-- — ela e o unico classificador que existe para um item que ainda nao foi
-- vinculado a insumo nenhum.
--
-- 4 ------------------- O FECHAMENTO QUE ACONTECE NO MES SEGUINTE AINDA FECHA
--
-- Palavras dela: "mesmo que a contagem do final do mes tenha sido feita no mes
-- seguinte, voce ira pegar a primeira contagem do mes seguinte para ser o
-- estoque final".
--
-- Isso nao e refinamento, e conserto. Medido no Bar do Zeca, que tem duas
-- contagens fechadas — 31/08 e 01/10:
--
--   mv_cmv_periodo(bar, '2026-09-01', '2026-09-30')  ANTES desta migracao
--     estoque_inicial_data | 2026-08-31
--     estoque_final_data   | (vazio)
--     cmv                  | (vazio)
--     pendencia            | Falta a contagem de estoque final
--
-- A 0005 exige `referencia <= p_fim` para o final, e a contagem rotulada
-- "fechamento de estoque" caiu no dia 01/10. Resultado: setembro inteiro sem
-- CMV — justamente o mes das planilhas. A casa contou o estoque; o sistema e
-- que nao soube ler a data.
--
-- A busca passa a ter dois degraus, nesta ordem:
--   a) a contagem fechada mais recente DENTRO do periodo (o que ja valia);
--   b) nao havendo nenhuma, a PRIMEIRA contagem fechada do mes CIVIL seguinte
--      ao fim do periodo.
--
-- O degrau (b) e literal de proposito: se a primeira contagem de outubro for
-- dia 20, ela vale — e vinte dias de movimento entram no numero. Por isso a
-- funcao devolve `estoque_final_fora_do_periodo` em coluna propria, e a tela
-- diz a data. Numero que vem de outro mes sem avisar e o tipo de coisa que esta
-- casa decidiu nao fazer na 0005, e a regra nao muda por ser conveniente.
-- ===========================================================================

-- 1 ---------------------------------------- a nota que veio de planilha ----
-- `origem_nota` tinha 'xml', 'pdf' e 'manual'. A nota da planilha nao e nenhuma
-- das tres: ninguem digitou (nao e manual), nao ha arquivo da nota anexado (nao
-- e pdf) e nao ha XML para reprocessar. Chama-la de 'manual' faria a tela de
-- conferencia dizer "origem manual" para 133 notas que ninguem digitou — e a
-- origem existe justamente para quem for conferir saber de onde o numero veio.
alter type origem_nota add value if not exists 'planilha';

-- 2 ------------------------------------------------------- o alvo da venda --
do $$ begin
  create type alvo_de_venda as enum ('ficha', 'produto', 'servico', 'pendente');
exception when duplicate_object then null; end $$;

alter table venda_itens
  add column if not exists alvo alvo_de_venda not null default 'ficha',
  add column if not exists produto_id uuid references produtos(id) on delete restrict,
  -- O que o PDV faturou nesta linha, como ele faturou. Nulo no lancamento
  -- manual, onde `total` (quantidade x preco) e a verdade.
  add column if not exists valor_total_origem numeric(16,4)
    check (valor_total_origem is null or valor_total_origem >= 0),
  -- Quantas linhas de cupom foram somadas nesta. 3.063 para a AMSTEL 600 ML.
  add column if not exists linhas_de_origem integer;

-- `ficha_id` era `not null`. Deixa de ser, porque agora ha outras tres pontas.
alter table venda_itens alter column ficha_id drop not null;

-- O default 'ficha' e para o caminho da mao, que e o unico que existia: a tela
-- de vendas grava `ficha_id` e nada mais, e continua valendo sem mudar uma
-- linha. A importacao sempre diz qual alvo e.
comment on column venda_itens.alvo is
  'ficha | produto | servico | pendente. Servico e pendente tem as mesmas colunas nulas: a diferenca e a decisao, nao o dado.';
comment on column venda_itens.valor_total_origem is
  'Faturamento desta linha como o PDV faturou. Existe porque quantidade x preco nao reproduz a agregacao de um mes no centavo.';
comment on column venda_itens.produto_id is
  'A venda que aponta direto para o insumo: garrafa fechada, vendida inteira, sem ficha no meio.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'venda_itens_alvo_unico') then
    alter table venda_itens add constraint venda_itens_alvo_unico check (
      case alvo
        when 'ficha'   then ficha_id is not null and produto_id is null
        when 'produto' then produto_id is not null and ficha_id is null
        else num_nonnulls(ficha_id, produto_id) = 0
      end
    );
  end if;
end $$;

-- Linha de servico e linha pendente nao tem alvo para desempatar, entao o que
-- nao se repete e o NOME CRU do PDV: duas linhas "Taxa de servico" no mesmo
-- lancamento seriam a planilha importada duas vezes.
--
-- O `unique (venda_id, ficha_id)` da 0023 continua inteiro, e de proposito: no
-- Postgres nulo nao conflita com nulo, entao ele nao estorva produto, servico
-- nem pendente — e continua sendo o `on conflict` que a tela da mao usa.
create unique index if not exists venda_itens_produto_unico
  on venda_itens (venda_id, produto_id) where produto_id is not null;
create unique index if not exists venda_itens_origem_unica
  on venda_itens (venda_id, lower(mv_sem_acento(descricao_origem)))
  where ficha_id is null and produto_id is null and descricao_origem is not null;

create index if not exists venda_itens_pendentes_idx
  on venda_itens (venda_id) where alvo = 'pendente';

-- 3 -------------------------------------------- o guarda-corpo, com 4 casos --
-- A 0025 separou "nao existe" de "nao e seu" nas mensagens, porque o gatilho
-- nao tem como distinguir as duas coisas sob RLS e nao deve fingir que tem. A
-- redacao dela e mantida palavra por palavra, e a mesma frase passa a valer
-- para o insumo da linha que aponta direto.
create or replace function mv_valida_venda_item()
returns trigger
language plpgsql set search_path = public as $$
declare v_ficha fichas; v_venda uuid; v_produto uuid;
begin
  select restaurante_id into v_venda from vendas where id = new.venda_id;
  if v_venda is null then
    raise exception 'lancamento de venda % nao encontrado, ou fora do seu acesso', new.venda_id;
  end if;

  if new.alvo = 'ficha' then
    select * into v_ficha from fichas where id = new.ficha_id;
    if v_ficha.id is null then
      raise exception 'ficha % nao encontrada, ou fora do seu acesso', new.ficha_id;
    end if;
    if v_ficha.restaurante_id <> v_venda then
      raise exception 'venda e ficha de restaurantes diferentes';
    end if;
    -- A regra da casa sobre o cardapio: garrafa e produto fechado, vendido
    -- inteiro; dose e uma pequena quantidade dela. As duas sao ficha de venda.
    -- Producao e o que a casa prepara para usar dentro de outra ficha, e nao
    -- tem preco de carta — vende-la seria vender o xarope por copo.
    if v_ficha.producao then
      raise exception 'a ficha "%" e uma producao: producao e insumo interno e nao se vende', v_ficha.nome;
    end if;

  elsif new.alvo = 'produto' then
    select restaurante_id into v_produto from produtos where id = new.produto_id;
    if v_produto is null then
      raise exception 'insumo % nao encontrado, ou fora do seu acesso', new.produto_id;
    end if;
    if v_produto <> v_venda then
      raise exception 'venda e insumo de restaurantes diferentes';
    end if;

  else
    -- Servico e pendente precisam do nome cru: e o unico rastro de onde a linha
    -- veio, e e por ele que o de-para aprende. Sem ele a linha e faturamento
    -- anonimo, que ninguem consegue conferir nem resolver depois.
    if coalesce(btrim(new.descricao_origem), '') = '' then
      raise exception 'linha de % precisa do nome de origem: sem ele a linha nao se confere nem se resolve', new.alvo;
    end if;
  end if;

  return new;
end $$;

-- 4 --------------------------------- fechar recusa lancamento com pendente --
-- O espelho de `mv_lancar_nota` (0004), e pela mesma razao: o valor de uma
-- linha pendente nao tem em que entrar. A diferenca e que aqui a recusa guarda
-- os DOIS lados da conta — faturamento e consumo — porque o faturamento so le
-- venda fechada. Enquanto houver pendente, nada daquela planilha entra em
-- numero nenhum.
create or replace function mv_fechar_venda(p_venda uuid)
returns vendas
language plpgsql security invoker set search_path = public as $$
declare v_linha vendas; v_pendentes integer;
begin
  select count(*) into v_pendentes from venda_itens
   where venda_id = p_venda and alvo = 'pendente';
  if v_pendentes > 0 then
    raise exception 'o lancamento tem % linha(s) sem alvo: vincule a ficha, o insumo, ou marque como servico', v_pendentes;
  end if;

  update vendas v
     set status      = 'fechada',
         fechada_em  = now(),
         fechado_por = auth.uid(),
         total_itens = (select count(*) from venda_itens i where i.venda_id = v.id),
         -- `valor_total_origem` na frente: quando o PDV faturou, o que ele
         -- faturou e o fato; `total` e a reconstituicao que arredonda.
         total_valor = (select coalesce(sum(coalesce(i.valor_total_origem, i.total)), 0)
                          from venda_itens i where i.venda_id = v.id)
   where v.id = p_venda and v.status = 'aberta'
  returning * into v_linha;

  if v_linha.id is null then
    raise exception 'venda % nao existe ou nao esta aberta', p_venda;
  end if;
  return v_linha;
end $$;

-- 5 ------------------------------------------ o de-para dos nomes do PDV ----
-- Tabela propria, e nao `produto_apelidos`, por tres motivos medidos:
--
--   · `produto_apelidos.produto_id` e `not null`: ele nao sabe apontar para
--     ficha, e 36 dos 136 nomes da planilha de setembro sao ficha.
--   · ele nao sabe dizer "isto e servico", que sao outros 5 nomes e 20,8% do
--     faturamento.
--   · ele e indexado por fornecedor, que nao existe em venda; e o vocabulario
--     e outro — "ANTARTICA ORIG600 ML" e nome de PDV, nunca de nota fiscal.
--     Misturar faria o importador de NFe comecar a casar linha de compra com
--     apelido de cardapio, que e vinculo errado com cara de aprendizado.
--
-- O desenho e o mesmo da 0004: o vinculo feito a mao fica registrado, e da
-- proxima vez o importador ja sabe. E e so isso que vincula sozinho — nenhuma
-- distancia de texto decide nada (ver `web/src/dados/planilha/dePara.ts`).
create table if not exists venda_apelidos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  apelido        text not null,
  alvo           alvo_de_venda not null,
  ficha_id       uuid references fichas(id) on delete cascade,
  produto_id     uuid references produtos(id) on delete cascade,
  usos           integer not null default 1,
  criado_em      timestamptz not null default now(),

  constraint venda_apelidos_alvo_unico check (
    case alvo
      when 'ficha'   then ficha_id is not null and produto_id is null
      when 'produto' then produto_id is not null and ficha_id is null
      when 'servico' then num_nonnulls(ficha_id, produto_id) = 0
      -- 'pendente' nao se aprende: pendente e a ausencia de decisao, e guardar
      -- a ausencia faria o importador "aprender" a nao resolver.
      else false
    end
  )
);

create unique index if not exists venda_apelidos_unico
  on venda_apelidos (restaurante_id, lower(mv_sem_acento(apelido)));

comment on table venda_apelidos is
  'De-para entre o nome que o PDV escreve e o que o sistema conhece: ficha, insumo, ou servico.';

-- Resolver uma linha a mao ENSINA. E a mesma mecanica de `mv_aprende_apelido`
-- (0004), com um cuidado a mais: o gatilho dispara tambem no INSERT, porque a
-- importacao grava a linha ja resolvida quando o apelido ainda nao existe (o
-- nome identico ao do cadastro, por exemplo) — e esse acerto tambem vale
-- guardar, para a planilha do mes que vem nem precisar comparar nome.
-- O aprendizado em funcao propria, e nao so dentro do gatilho, porque
-- `mv_resolver_item_de_venda` (adiante) precisa ensinar o nome de uma linha
-- que ele vai APAGAR na fusao — se o ensino morasse so no gatilho da linha, o
-- nome daquela linha nunca seria aprendido e a planilha do mes que vem
-- chegaria pendente de novo.
create or replace function mv_ensina_apelido_de_venda(
  p_restaurante uuid,
  p_apelido     text,
  p_alvo        alvo_de_venda,
  p_ficha       uuid,
  p_produto     uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_alvo = 'pendente' or coalesce(btrim(p_apelido), '') = '' or p_restaurante is null then
    return;
  end if;
  insert into venda_apelidos (restaurante_id, apelido, alvo, ficha_id, produto_id)
  values (p_restaurante, btrim(p_apelido), p_alvo, p_ficha, p_produto)
  on conflict (restaurante_id, lower(mv_sem_acento(apelido)))
  do update set alvo = excluded.alvo,
                ficha_id = excluded.ficha_id,
                produto_id = excluded.produto_id,
                usos = venda_apelidos.usos + 1;
end $$;

create or replace function mv_aprende_apelido_de_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.alvo is not distinct from old.alvo
     and new.ficha_id is not distinct from old.ficha_id
     and new.produto_id is not distinct from old.produto_id then
    return new;
  end if;

  perform mv_ensina_apelido_de_venda(
    (select restaurante_id from vendas where id = new.venda_id),
    new.descricao_origem, new.alvo, new.ficha_id, new.produto_id);
  return new;
end $$;

drop trigger if exists t_venda_itens_apelido on venda_itens;
create trigger t_venda_itens_apelido
  after insert or update of alvo, ficha_id, produto_id on venda_itens
  for each row execute function mv_aprende_apelido_de_venda();

-- Resolver uma linha pendente, FUNDINDO quando o alvo ja esta no lancamento.
--
-- O caso e rotina na planilha de verdade: o PDV escreve "AMSTEL 600 ML" e
-- "AMSTEL GF 600", e as duas sao a mesma garrafa. O `unique (venda_id,
-- ficha_id)` da 0023 recusa a segunda — e esta certo em recusar: duas linhas
-- para a mesma ficha dobrariam o consumo dela no relatorio. O que falta nao e
-- afrouxar a trava, e dizer o que fazer quando ela bate: somar.
--
-- A fusao soma o que e soma (quantidade, dinheiro, linhas de cupom) e recalcula
-- o preco unitario como MEDIA PONDERADA — porque ele sempre foi uma media, e
-- duas medias de precos diferentes nao se somam. O nome da linha que desaparece
-- nao se perde: ele e ensinado ao de-para antes, e o de-para e o que a proxima
-- importacao vai ler.
--
-- A regra mora aqui, e nao na tela, para valer tambem para script e para a API.
create or replace function mv_resolver_item_de_venda(
  p_item    uuid,
  p_alvo    alvo_de_venda,
  p_ficha   uuid default null,
  p_produto uuid default null
) returns venda_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_item venda_itens; v_irmao venda_itens; v_restaurante uuid;
  v_valor numeric; v_qtd numeric;
begin
  select * into v_item from venda_itens where id = p_item;
  if v_item.id is null then
    raise exception 'linha de venda % nao encontrada, ou fora do seu acesso', p_item;
  end if;
  if p_alvo = 'pendente' then
    raise exception 'resolver e dizer o que a linha e: "pendente" e a ausencia de resposta';
  end if;

  select restaurante_id into v_restaurante from vendas where id = v_item.venda_id;
  perform mv_ensina_apelido_de_venda(
    v_restaurante, v_item.descricao_origem, p_alvo,
    case when p_alvo = 'ficha' then p_ficha end,
    case when p_alvo = 'produto' then p_produto end);

  if p_alvo = 'ficha' then
    select * into v_irmao from venda_itens
     where venda_id = v_item.venda_id and ficha_id = p_ficha and id <> p_item;
  elsif p_alvo = 'produto' then
    select * into v_irmao from venda_itens
     where venda_id = v_item.venda_id and produto_id = p_produto and id <> p_item;
  end if;

  if v_irmao.id is not null then
    v_qtd   := v_irmao.quantidade + v_item.quantidade;
    v_valor := coalesce(v_irmao.valor_total_origem, v_irmao.total)
             + coalesce(v_item.valor_total_origem,  v_item.total);
    update venda_itens
       set quantidade         = v_qtd,
           preco_unitario     = case when v_qtd > 0 then round(v_valor / v_qtd, 4) else 0 end,
           valor_total_origem = v_valor,
           linhas_de_origem   = coalesce(v_irmao.linhas_de_origem, 0)
                              + coalesce(v_item.linhas_de_origem, 0),
           -- Os dois nomes ficam na linha que sobra, separados por " + ": e o
           -- rastro de que ela e a soma de duas linhas do PDV.
           descricao_origem   = concat_ws(' + ', v_irmao.descricao_origem, v_item.descricao_origem)
     where id = v_irmao.id
    returning * into v_irmao;
    delete from venda_itens where id = p_item;
    return v_irmao;
  end if;

  update venda_itens
     set alvo       = p_alvo,
         ficha_id   = case when p_alvo = 'ficha'   then p_ficha   end,
         produto_id = case when p_alvo = 'produto' then p_produto end
   where id = p_item
  returning * into v_item;
  return v_item;
end $$;

comment on function mv_resolver_item_de_venda(uuid, alvo_de_venda, uuid, uuid) is
  'Resolve uma linha de venda, fundindo-a com a linha do mesmo alvo quando ela ja existe no lancamento.';

-- 6 ----------------------------------- a venda explodida nas TRES origens ---
-- A ficha explode pela arvore (0023). O produto nao explode: a garrafa vendida
-- inteira E a quantidade do insumo, na unidade de compra dele — e isso nao e
-- atalho, e o que "aponta direto para o insumo" significa. Nao ha conversao a
-- fazer e, principalmente, nao ha conversao a inventar: `mv_fator_para_produto`
-- devolveria nulo para UN contra CX e a linha sairia marcada sem motivo.
-- O servico nao explode porque nao consome nada; a tela e que diz isso.
drop function if exists mv_vendas_por_produto(uuid);
create function mv_vendas_por_produto(p_venda uuid)
returns table (
  produto_id    uuid,
  quantidade    numeric,
  fator_ausente boolean,
  motivo        text
)
language sql stable security invoker set search_path = public as $$
  with explodido as (
    select x.produto_id, vi.quantidade * x.quantidade as qtd, x.fator_ausente, x.motivo
      from venda_itens vi
      cross join lateral mv_produtos_da_ficha(vi.ficha_id) x
     where vi.venda_id = p_venda and vi.alvo = 'ficha'
    union all
    select vi.produto_id, vi.quantidade, false, null::text
      from venda_itens vi
     where vi.venda_id = p_venda and vi.alvo = 'produto'
  )
  select e.produto_id,
         case when bool_or(e.fator_ausente) then null
              else round(sum(e.qtd), 6) end,
         bool_or(e.fator_ausente),
         string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente)
    from explodido e
   group by e.produto_id
$$;

comment on function mv_vendas_por_produto(uuid) is
  'Explode um lancamento em insumos do catalogo: pela arvore da ficha, direto no produto, e sem nada no servico.';

-- 7 ------------------------------------ o que fica fora do CMV de insumo ----
alter table categorias
  add column if not exists fora_do_insumo boolean not null default false;

comment on column categorias.fora_do_insumo is
  'true = a categoria nao e insumo de prato (limpeza, descartavel). Entra no CMV total e sai do CMV de insumo.';

-- Carimbo inicial pelo nome, uma vez, e so onde ninguem marcou nada ainda.
-- Decisao da casa daqui para frente: a coluna e de cadastro e a tela manda.
do $$
declare n integer;
begin
  update categorias set fora_do_insumo = true
   where not fora_do_insumo
     and (upper(mv_sem_acento(nome)) like '%LIMPEZA%'
       or upper(mv_sem_acento(nome)) like '%DESCARTAV%'
       or upper(mv_sem_acento(nome)) like '%HIGIENE%');
  get diagnostics n = row_count;
  raise warning '0027: % categoria(s) marcada(s) como fora do CMV de insumo pelo nome', n;
end $$;

alter table nota_itens
  add column if not exists operacao text;

comment on column nota_itens.operacao is
  'Operacao do ERP, como veio na planilha. E o unico classificador que existe para um item ainda sem insumo vinculado.';

-- A regra em um lugar so, para que tela, teste e funcao do CMV digam o mesmo.
create or replace function mv_operacao_fora_do_insumo(p_operacao text)
returns boolean
language sql immutable parallel safe set search_path = public as $$
  select coalesce(
    upper(mv_sem_acento(p_operacao)) like '%LIMPEZA%'
    or upper(mv_sem_acento(p_operacao)) like '%DESCARTAV%'
    or upper(mv_sem_acento(p_operacao)) like '%HIGIENE%', false)
$$;

comment on function mv_operacao_fora_do_insumo(text) is
  'A operacao do ERP diz que a linha e limpeza/descartavel? "01 - COMPRAS DE LIMPEZAS E DESCARTAVEIS" diz.';

-- 8 ------------------------------------------------ o faturamento do periodo -
-- Soma o que as vendas FECHADAS do periodo faturaram, nos dois lados que a
-- cliente pediu: o total e o de produto (sem servico).
--
-- A atribuicao e pela `referencia`, que e o FIM do periodo vendido — a mesma
-- regra que `mv_relatorio_de_contagem` usa para pegar venda entre duas fotos.
-- Consequencia que vale dizer em voz alta: um lancamento de 01/09 a 30/09 cai
-- INTEIRO no periodo que contem 30/09. Lancamento que atravessa a borda de um
-- recorte semanal nao se parte — ele vai todo para a semana que contem o fim
-- dele. Para a leitura mensal, que e a que a cliente usa, isso e exato.
create or replace function mv_faturamento_periodo(
  p_restaurante uuid,
  p_inicio      date,
  p_fim         date
) returns table (
  total        numeric,
  produto      numeric,
  servico      numeric,
  lancamentos  integer,
  itens        integer
)
language sql stable security invoker set search_path = public as $$
  with linhas as (
    select v.id as venda_id,
           i.alvo,
           coalesce(i.valor_total_origem, i.total) as valor
      from vendas v
      join venda_itens i on i.venda_id = v.id
     where v.restaurante_id = p_restaurante
       and v.status = 'fechada'
       and v.referencia between p_inicio and p_fim
  )
  select coalesce(sum(valor), 0),
         coalesce(sum(valor) filter (where alvo <> 'servico'), 0),
         coalesce(sum(valor) filter (where alvo =  'servico'), 0),
         count(distinct venda_id)::integer,
         count(*)::integer
    from linhas
$$;

comment on function mv_faturamento_periodo(uuid, date, date) is
  'Faturamento de vendas FECHADAS do periodo: total, de produto (sem servico) e de servico.';

-- 9 -------------------------------------------------- o CMV com denominador --
-- A tabela de retorno muda, entao a funcao e redefinida inteira: `create or
-- replace` recusa mudar retorno. O `drop` tem de vir antes, e `mv_cmv_serie`
-- continua valendo porque le as colunas pelo NOME — as novas entram no fim.
drop function if exists mv_cmv_periodo(uuid, date, date);

create function mv_cmv_periodo(
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
  -- As colunas da 0027, no FIM para nao mover nenhuma das treze de cima.
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
  cmv_insumo                    numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c_ini contagens; c_fim contagens;
  v_compras numeric := 0; v_notas integer := 0;
  v_fora boolean := false;
  f record;
  v_compras_limpeza numeric := 0;
  v_ini_limpeza numeric; v_fim_limpeza numeric;
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

  -- Degrau (b): a PRIMEIRA contagem fechada do mes civil seguinte ao fim do
  -- periodo. A casa conta no dia 1o e chama aquilo de fechamento do mes que
  -- passou — e e isso que e. `referencia desc` virou `asc` aqui de proposito:
  -- a regra dela diz a PRIMEIRA, nao a ultima.
  --
  -- E so para periodo que FECHA UM MES. A regra fala do "final do mes", e
  -- aplica-la a janela semanal fabrica numero: medido na serie semanal de
  -- setembro do Bar do Zeca, sem esta condicao, QUATRO semanas que terminam no
  -- meio do mes saiam todas com o mesmo CMV de R$ 6.720,0063 — o CMV do mes
  -- inteiro, repetido, como se o bar consumisse isso por semana. O grafico
  -- mostraria quatro barras iguais e cada uma seria o mes. A semana que de fato
  -- contem a contagem continua fechando pelo degrau (a), que nao mudou.
  if c_fim.id is null and p_fim = (date_trunc('month', p_fim) + interval '1 month - 1 day')::date then
    select * into c_fim from contagens
     where restaurante_id = p_restaurante and status = 'fechada'
       and referencia >= (date_trunc('month', p_fim) + interval '1 month')::date
       and referencia <  (date_trunc('month', p_fim) + interval '2 month')::date
       and referencia >  coalesce(c_ini.referencia, '-infinity'::date)
     order by referencia asc, fechada_em asc limit 1;
    v_fora := c_fim.id is not null;
  end if;

  select coalesce(sum(n.valor_total), 0), count(*) into v_compras, v_notas
    from notas_fiscais n
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim;

  -- A fatia de limpeza/descartavel da compra, por ITEM: pela categoria do
  -- insumo vinculado, ou pela operacao que a nota trouxe quando ele ainda nao
  -- tem vinculo. `compras` continua sendo a soma dos CABECALHOS, como sempre
  -- foi — o que a nota cobrou e nao rateou por item (frete, imposto) fica do
  -- lado do insumo, que e onde a maior parte dela nasce.
  select coalesce(sum(it.valor_total), 0) into v_compras_limpeza
    from nota_itens it
    join notas_fiscais n on n.id = it.nota_id
    left join produtos p on p.id = it.produto_id
    left join categorias cat on cat.id = p.categoria_id
   where n.restaurante_id = p_restaurante
     and n.status = 'lancada'
     and n.emitida_em between p_inicio and p_fim
     and (coalesce(cat.fora_do_insumo, false) or mv_operacao_fora_do_insumo(it.operacao));

  select coalesce(sum(i.total), 0) into v_ini_limpeza
    from contagem_itens i
    join produtos p on p.id = i.produto_id
    join categorias cat on cat.id = p.categoria_id
   where i.contagem_id = c_ini.id and cat.fora_do_insumo;

  select coalesce(sum(i.total), 0) into v_fim_limpeza
    from contagem_itens i
    join produtos p on p.id = i.produto_id
    join categorias cat on cat.id = p.categoria_id
   where i.contagem_id = c_fim.id and cat.fora_do_insumo;

  select * into f from mv_faturamento_periodo(p_restaurante, p_inicio, p_fim);

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
  estoque_final_fora_do_periodo := v_fora;

  if c_ini.id is null and c_fim.id is null then
    pendencia := 'Nenhuma contagem fechada neste periodo';
  elsif c_ini.id is null then
    pendencia := 'Falta a contagem de estoque inicial';
  elsif c_fim.id is null then
    pendencia := 'Falta a contagem de estoque final';
  end if;

  completo := (c_ini.id is not null and c_fim.id is not null);
  cmv := case when completo then round(c_ini.total + v_compras - c_fim.total, 4) end;

  faturamento             := f.total;
  faturamento_produto     := f.produto;
  faturamento_servico     := f.servico;
  faturamento_lancamentos := f.lancamentos;

  -- Percentual so existe com as duas pontas: sem CMV nao ha numerador, e sem
  -- faturamento nao ha denominador. Zero no denominador nao e "0%", e "nao da
  -- para dividir" — a regra da 0005 vale aqui igual.
  cmv_percentual := case when cmv is not null and f.total > 0
                         then round(cmv / f.total * 100, 2) end;
  cmv_percentual_produto := case when cmv is not null and f.produto > 0
                                 then round(cmv / f.produto * 100, 2) end;

  compras_limpeza         := v_compras_limpeza;
  estoque_inicial_limpeza := case when c_ini.id is not null then coalesce(v_ini_limpeza, 0) end;
  estoque_final_limpeza   := case when c_fim.id is not null then coalesce(v_fim_limpeza, 0) end;
  -- As duas metades somam o CMV inteiro, por construcao. E conferido em teste.
  cmv_limpeza := case when completo
                      then round(coalesce(v_ini_limpeza, 0) + v_compras_limpeza
                                 - coalesce(v_fim_limpeza, 0), 4) end;
  cmv_insumo  := case when completo then round(cmv - cmv_limpeza, 4) end;

  return next;
end $$;

comment on function mv_cmv_periodo(uuid, date, date) is
  'CMV do periodo com faturamento, os dois percentuais, e limpeza/descartavel separado.';

-- 10 ---------------------------------------------------------------- rls ----
alter table venda_apelidos enable row level security;

-- Igual a `produto_apelidos` (0006): ler e de quem opera, mexer tambem — o
-- de-para nasce do trabalho de quem lanca.
drop policy if exists venda_apelidos_ler on venda_apelidos;
create policy venda_apelidos_ler on venda_apelidos for select to authenticated
  using (mv_pode_operar(restaurante_id));

drop policy if exists venda_apelidos_criar on venda_apelidos;
create policy venda_apelidos_criar on venda_apelidos for insert to authenticated
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists venda_apelidos_editar on venda_apelidos;
create policy venda_apelidos_editar on venda_apelidos for update to authenticated
  using (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores())
  with check (mv_pode_operar(restaurante_id) and not mv_restrito_a_setores());

drop policy if exists venda_apelidos_apagar on venda_apelidos;
create policy venda_apelidos_apagar on venda_apelidos for delete to authenticated
  using (mv_pode_administrar(restaurante_id));

-- 11 -------------------------------------------------------- permissoes ----
-- `drop function` leva o grant junto. Sem re-outorgar aqui, a SEGUNDA passada
-- desta migracao — que e o que o `supabase db push` faz sempre que o historico
-- esta atras do banco — deixaria a tela do CMV com "permission denied for
-- function mv_cmv_periodo". Foi assim que a 0022 quebrou a tela de fichas.
grant select, insert, update, delete on venda_apelidos to authenticated;
grant execute on function mv_cmv_periodo(uuid, date, date)         to authenticated;
grant execute on function mv_faturamento_periodo(uuid, date, date) to authenticated;
grant execute on function mv_vendas_por_produto(uuid)              to authenticated;
grant execute on function mv_fechar_venda(uuid)                    to authenticated;
grant execute on function mv_operacao_fora_do_insumo(text)         to authenticated;
grant execute on function mv_ensina_apelido_de_venda(uuid, text, alvo_de_venda, uuid, uuid)
  to authenticated;
grant execute on function mv_resolver_item_de_venda(uuid, alvo_de_venda, uuid, uuid)
  to authenticated;
