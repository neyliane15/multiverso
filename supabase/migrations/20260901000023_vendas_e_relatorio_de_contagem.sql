-- ===========================================================================
-- 0023 · Vendas, e o relatorio que a contagem nunca soube dar
--
-- Ate aqui a contagem respondia "quanto tem". A cliente desenhou a pergunta
-- seguinte, que e a que decide a compra da semana:
--
--   1 CONTAGEM ANTERIOR → 2 COMPRAS → 3 VENDAS → 4 CONTAGEM ATUAL
--                       → 5 CONSUMO → 6 IDEAL
--
--   CONSUMO   = CONTAGEM ANTERIOR + COMPRAS − CONTAGEM ATUAL
--   IDEAL     = CONTAGEM ANTERIOR + COMPRAS − VENDAS
--   DIFERENCA = CONTAGEM ATUAL − IDEAL
--
-- CONSUMO e o que o estoque diz que saiu. IDEAL e o que o cardapio diz que
-- deveria ter saido. A DIFERENCA entre os dois e a perda, o erro de contagem,
-- o copo servido a mais e o que saiu pela porta — e e por isso que as duas
-- contas existem lado a lado em vez de uma so.
--
-- Quatro decisoes que valem o comentario:
--
-- 1. **O periodo de cada linha e entre duas contagens**, nunca "a semana
--    passada" em cima do calendario. O intervalo e `(anterior.referencia,
--    atual.referencia]`: aberto no inicio porque a contagem anterior JA
--    fotografou aquele dia, fechado no fim porque a atual fotografa este. Nota
--    emitida no dia da contagem anterior ja esta dentro da foto dela; contar
--    de novo seria somar a mesma caixa duas vezes.
--
-- 2. **Sem contagem anterior nao ha consumo nem ideal, e o sistema diz isso.**
--    A primeira contagem de um restaurante devolve `contagem_atual` e a
--    `pendencia` escrita. Chutar "anterior = 0" transformaria toda a compra do
--    periodo em consumo, e a conta sairia com cara de certa. A regra e a mesma
--    de `mv_cmv_periodo`: numero errado e pior que numero ausente.
--
-- 3. **A venda entra em FICHA, e a ficha explode em PRODUTO.** Ninguem vende
--    "1,2 kg de picanha": vende 8 porcoes de PICANHA NA CHAPA, e a ficha diz
--    quanto de picanha isso consome. "Multiplicacao da quantidade de vendas
--    pela quantidade dos produtos, ate se tornar 1 unidade" — a conversao ate
--    a unidade de compra e `mv_fator_para_produto`, que ja existe desde a 0017
--    e ja sabe que 60 ML numa garrafa de 965 ML sao 0,0622 garrafa.
--
-- 4. **Producao nao se vende.** `fichas.producao = true` e insumo interno: a
--    massa do empadao, o xarope do bar. Ela entra DENTRO de outra ficha (0022)
--    e nunca no cardapio. O gatilho recusa, com a mesma firmeza com que a 0022
--    recusa ficha de venda dentro de outra ficha.
--
-- A importacao de PDV nao esta aqui — so o encaixe dela: `vendas.origem`,
-- `vendas.origem_arquivo` e `venda_itens.descricao_origem`, nos mesmos papeis
-- que `notas_fiscais.origem` e `nota_itens.descricao` cumprem nas compras.
-- ===========================================================================

do $$ begin
  create type status_venda as enum ('aberta', 'fechada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_venda as enum ('manual', 'pdv');
exception when duplicate_object then null; end $$;

-- 1 ------------------------------------------------------- o lancamento ----
create table if not exists vendas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  -- `referencia` e o FIM do periodo vendido, para casar com `contagens`: as
  -- duas datas se comparam direto, e o relatorio pega as vendas que caem
  -- entre duas fotos sem ter de adivinhar de que lado a semana fecha.
  referencia     date not null,
  -- O inicio e informativo e pode faltar: o periodo que vale para a conta e o
  -- que ha entre duas contagens, nao o que alguem digitou aqui.
  inicio         date,
  titulo         text,
  status         status_venda not null default 'aberta',
  origem         origem_venda not null default 'manual',
  origem_arquivo text,
  total_itens    integer       not null default 0,
  total_valor    numeric(16,4) not null default 0,
  criado_por     uuid references perfis(id) on delete set null,
  fechado_por    uuid references perfis(id) on delete set null,
  fechada_em     timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint venda_fechada_tem_data check (
    (status = 'fechada' and fechada_em is not null) or status <> 'fechada'),
  constraint venda_inicio_antes_do_fim check (inicio is null or inicio <= referencia)
);

-- Uma venda por referencia, como `contagens` faz. Dois lancamentos para a
-- semana que fecha em 08/08 sao a planilha duplicada: o relatorio somaria as
-- duas e a venda da semana dobraria. Quando a importacao de PDV chegar, ela
-- bate nesta trava de proposito — quem lancou na mao cancela o lancamento
-- antes de importar, em vez de ficar com duas verdades.
create unique index if not exists vendas_ref_unica
  on vendas (restaurante_id, referencia)
  where status <> 'cancelada';
create index if not exists vendas_periodo_idx
  on vendas (restaurante_id, referencia desc)
  where status <> 'cancelada';

comment on table vendas is
  'Um lancamento de vendas de um periodo: hoje digitado a mao, amanha vindo do PDV.';
comment on column vendas.referencia is
  'O FIM do periodo vendido. Comparavel direto com contagens.referencia.';
comment on column vendas.origem is
  'Como o lancamento entrou. A coluna existe antes da importacao de PDV, para que ela nao precise de migracao.';

-- 2 ----------------------------------------------------- o que foi vendido --
create table if not exists venda_itens (
  id         uuid primary key default gen_random_uuid(),
  venda_id   uuid not null references vendas(id) on delete cascade,
  -- `restrict` pelo mesmo motivo de `ficha_itens.produto_id`: apagar a ficha
  -- apagaria a venda dela sem ninguem perceber, e o relatorio do mes passado
  -- mudaria de numero. A tela manda desativar a ficha.
  ficha_id   uuid not null references fichas(id) on delete restrict,
  quantidade numeric(14,4) not null check (quantidade > 0),
  -- Congelado do preco da ficha no lancamento, nao lido na hora: a venda de
  -- agosto nao pode mudar de valor quando o cardapio subir em setembro. E a
  -- mesma decisao que `contagem_itens.custo_unitario` tomou na 0003.
  preco_unitario numeric(14,4) not null default 0 check (preco_unitario >= 0),
  total      numeric(16,4) generated always as (round(quantidade * preco_unitario, 4)) stored,
  -- O texto cru do PDV, preservado como veio — o papel que `nota_itens.
  -- descricao` cumpre nas compras. Hoje fica nulo no lancamento manual.
  descricao_origem text,
  criado_em  timestamptz not null default now(),

  unique (venda_id, ficha_id)
);

create index if not exists venda_itens_venda_idx on venda_itens (venda_id);
create index if not exists venda_itens_ficha_idx on venda_itens (ficha_id);

comment on column venda_itens.descricao_origem is
  'Descricao crua do PDV. Guardada para o de-para da importacao futura.';

call mv_registra_touch('vendas');

-- 3 ------------------------------------------------------ guarda-corpos ----
-- Ficha de outro restaurante, e ficha de producao, nao entram numa venda.
create or replace function mv_valida_venda_item()
returns trigger
language plpgsql set search_path = public as $$
declare v_ficha fichas; v_venda uuid;
begin
  select restaurante_id into v_venda from vendas where id = new.venda_id;
  select * into v_ficha from fichas where id = new.ficha_id;

  if v_ficha.id is null or v_venda is null or v_ficha.restaurante_id <> v_venda then
    raise exception 'venda e ficha de restaurantes diferentes';
  end if;

  -- A regra da casa sobre o cardapio: garrafa e produto fechado, vendido
  -- inteiro; dose e uma pequena quantidade dela. As duas sao ficha de venda.
  -- Producao e o que a casa prepara para usar dentro de outra ficha, e nao
  -- tem preco de carta — vende-la seria vender o xarope por copo.
  if v_ficha.producao then
    raise exception 'a ficha "%" e uma producao: producao e insumo interno e nao se vende', v_ficha.nome;
  end if;
  return new;
end $$;

drop trigger if exists t_venda_itens_valida on venda_itens;
create trigger t_venda_itens_valida
  before insert or update on venda_itens
  for each row execute function mv_valida_venda_item();

-- Venda fechada e foto, como contagem fechada: o relatorio de um periodo nao
-- muda de numero depois de lido.
create or replace function mv_venda_bloqueada()
returns trigger language plpgsql set search_path = public as $$
declare st status_venda;
begin
  select status into st from vendas
   where id = coalesce(new.venda_id, old.venda_id);
  if st = 'fechada' then
    raise exception 'venda ja fechada: os itens nao podem mais ser alterados';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_venda_itens_bloqueio on venda_itens;
create trigger t_venda_itens_bloqueio
  before insert or update or delete on venda_itens
  for each row execute function mv_venda_bloqueada();

-- 4 -------------------------------------------------- abrir / fechar -------
create or replace function mv_fechar_venda(p_venda uuid)
returns vendas
language plpgsql security invoker set search_path = public as $$
declare v_linha vendas;
begin
  update vendas v
     set status      = 'fechada',
         fechada_em  = now(),
         fechado_por = auth.uid(),
         total_itens = (select count(*) from venda_itens i where i.venda_id = v.id),
         total_valor = (select coalesce(sum(i.total), 0) from venda_itens i where i.venda_id = v.id)
   where v.id = p_venda and v.status = 'aberta'
  returning * into v_linha;

  if v_linha.id is null then
    raise exception 'venda % nao existe ou nao esta aberta', p_venda;
  end if;
  return v_linha;
end $$;

create or replace function mv_reabrir_venda(p_venda uuid)
returns vendas
language plpgsql security invoker set search_path = public as $$
declare v_linha vendas;
begin
  update vendas
     set status = 'aberta', fechada_em = null, fechado_por = null
   where id = p_venda and status = 'fechada'
  returning * into v_linha;
  if v_linha.id is null then
    raise exception 'venda % nao esta fechada', p_venda;
  end if;
  return v_linha;
end $$;

-- 5 ------------------------------------- a quantidade que sobe a arvore ----
-- O gemeo de `mv_custo_da_producao` (0022), do outro lado da conta: ela devolve
-- o CUSTO de uma unidade de rendimento, esta devolve a QUANTIDADE de cada
-- produto que uma unidade de rendimento consome. A semantica e copiada linha
-- por linha, de proposito — se as duas discordassem, o custo do prato e o
-- consumo do prato contariam historias diferentes sobre a mesma receita.
--
--   quantidade / (1 - perda/100)   · a perda converte liquido em bruto
--   × fator                        · da unidade da receita para a de compra
--   / rendimento                   · o prato paga a fracao, nao a panela
--
-- A diferenca esta no que acontece com fator nulo. No custo, nulo contamina e
-- a ficha inteira volta sem numero — e o certo la, porque custo pela metade
-- nao e custo. Aqui a linha volta MARCADA, com o nome do insumo e o motivo:
-- o relatorio precisa poder dizer "a vodka esta sem conversao" em vez de somar
-- zero vodka e deixar a diferenca aparecer como furto.
drop function if exists mv_produtos_da_ficha(uuid, integer);
create function mv_produtos_da_ficha(p_ficha uuid, p_nivel integer default 0)
returns table (
  produto_id    uuid,
  quantidade    numeric,
  fator_ausente boolean,
  motivo        text
)
language plpgsql stable set search_path = public as $$
declare
  v_ficha  fichas;
  v_filha  fichas;
  v_bruta  numeric;
  v_fator  numeric;
  r record;
  f record;
begin
  -- O mesmo teto da 0022: arvore funda ou ciclo que escapou para com mensagem,
  -- em vez de estourar a pilha do Postgres.
  if p_nivel > 10 then
    raise exception 'ficha aninhada demais (mais de 10 niveis) a partir de %', p_ficha;
  end if;

  select * into v_ficha from fichas where id = p_ficha;
  if not found or v_ficha.rendimento is null or v_ficha.rendimento <= 0 then
    return;
  end if;

  for r in select * from ficha_itens fi where fi.ficha_id = p_ficha loop
    v_bruta := round(r.quantidade / (1 - r.perda_percentual / 100), 4);

    if r.produto_id is not null then
      v_fator := mv_fator_para_produto(r.unidade, r.produto_id);
      produto_id := r.produto_id;
      if v_fator is null then
        quantidade    := null;
        fator_ausente := true;
        motivo := format('"%s" entra em "%s" em %s, que nao converte para a unidade de compra',
                         (select p.nome from produtos p where p.id = r.produto_id),
                         v_ficha.nome, r.unidade);
      else
        quantidade    := v_bruta * v_fator / v_ficha.rendimento;
        fator_ausente := false;
        motivo        := null;
      end if;
      return next;

    else
      select * into v_filha from fichas where id = r.producao_id;
      -- A producao filha rende na unidade dela; o item pede na unidade dele.
      v_fator := mv_fator_unidade(r.unidade, v_filha.unidade_rendimento);

      -- A arvore e percorrida mesmo com o fator nulo. Parar aqui devolveria
      -- "sem conversao" sem dizer de quem: a tela precisa dos produtos de
      -- baixo para nomear o que ficou sem numero.
      for f in select * from mv_produtos_da_ficha(r.producao_id, p_nivel + 1) loop
        produto_id := f.produto_id;
        if v_fator is null then
          quantidade    := null;
          fator_ausente := true;
          motivo := format('a producao "%s" entra em "%s" em %s, que nao converte para %s',
                           v_filha.nome, v_ficha.nome, r.unidade, v_filha.unidade_rendimento);
        elsif f.fator_ausente then
          quantidade    := null;
          fator_ausente := true;
          motivo        := f.motivo;
        else
          quantidade    := v_bruta * v_fator * f.quantidade / v_ficha.rendimento;
          fator_ausente := false;
          motivo        := null;
        end if;
        return next;
      end loop;
    end if;
  end loop;
end $$;

comment on function mv_produtos_da_ficha(uuid, integer) is
  'Produtos (e quanto de cada) que UMA unidade de rendimento da ficha consome, somando a arvore.';

-- 6 ------------------------------------- o que uma venda tirou do estoque --
-- Uma linha por produto. Produto com qualquer ponta sem conversao volta com
-- `quantidade` NULA e o motivo escrito: somar o que se sabe e ignorar o que
-- falta daria um numero plausivel e errado, que e o pior tipo.
drop function if exists mv_vendas_por_produto(uuid);
create function mv_vendas_por_produto(p_venda uuid)
returns table (
  produto_id    uuid,
  quantidade    numeric,
  fator_ausente boolean,
  motivo        text
)
language sql stable security invoker set search_path = public as $$
  select x.produto_id,
         case when bool_or(x.fator_ausente) then null
              else round(sum(vi.quantidade * x.quantidade), 6) end,
         bool_or(x.fator_ausente),
         string_agg(distinct x.motivo, '; ') filter (where x.fator_ausente)
    from venda_itens vi
    cross join lateral mv_produtos_da_ficha(vi.ficha_id) x
   where vi.venda_id = p_venda
   group by x.produto_id
$$;

comment on function mv_vendas_por_produto(uuid) is
  'Explode um lancamento de vendas em produtos do catalogo, pela arvore das fichas.';

-- 7 ------------------------------------------- o relatorio da contagem -----
-- Uma linha por produto que apareca em QUALQUER das pontas do periodo: na foto
-- anterior, nas notas, nas vendas, ou na foto de agora. Produto que nao
-- apareceu em ponta nenhuma nao e linha vazia — e silencio, e silencio e o
-- certo para um catalogo de 900 itens onde 300 nao se mexeram.
--
-- Duas leituras de "faltou" que o arquivo trata DIFERENTE, de proposito:
--
--   · **Nao existe contagem anterior nenhuma** (a primeira do restaurante):
--     consumo, ideal, diferenca e compras voltam NULOS. Nao ha periodo, e sem
--     periodo nao ha o que somar. A pendencia diz isso em texto.
--
--   · **Existe a contagem anterior, e o produto nao estava na folha dela**:
--     ai o anterior foi lido como ZERO, porque e o que a foto registra — e a
--     pendencia diz exatamente que foi lido como zero. Devolver nulo aqui
--     esvaziaria a linha justo dos itens novos, que sao onde o dinheiro
--     acabou de entrar.
drop function if exists mv_relatorio_de_contagem(uuid);
create function mv_relatorio_de_contagem(p_contagem uuid)
returns table (
  produto_id        uuid,
  produto_nome      text,
  categoria_id      uuid,
  categoria_nome    text,
  unidade           text,
  contagem_anterior numeric,
  compras           numeric,
  vendas            numeric,
  contagem_atual    numeric,
  consumo           numeric,
  ideal             numeric,
  diferenca         numeric,
  media_3_vendas    numeric,
  vendas_consideradas integer,
  sugestao          numeric,
  precisa_comprar   boolean,
  custo_unitario    numeric,
  pendencia         text
)
language plpgsql stable security invoker set search_path = public as $$
declare
  c_atual        contagens;
  c_anterior     contagens;
  v_consideradas integer := 0;
  v_sem_anterior text := null;
  v_sem_venda    text := null;
  v_aberta       text := null;
begin
  select * into c_atual from contagens where id = p_contagem;
  if not found then
    raise exception 'contagem % nao encontrada', p_contagem;
  end if;

  -- A foto imediatamente anterior, e so ela fechada: comparar com uma contagem
  -- aberta seria comparar com meia leitura.
  select * into c_anterior from contagens
   where restaurante_id = c_atual.restaurante_id
     and status = 'fechada'
     and referencia < c_atual.referencia
   order by referencia desc, fechada_em desc nulls last
   limit 1;

  if c_anterior.id is null then
    v_sem_anterior := 'sem contagem anterior fechada: consumo, ideal e diferenca precisam das duas pontas';
  end if;
  if c_atual.status <> 'fechada' then
    v_aberta := 'a contagem escolhida ainda esta ' || c_atual.status::text
             || ': os numeros desta coluna sao parciais';
  end if;

  -- Quantas das tres vendas mais recentes de fato existem. Uma casa que acabou
  -- de comecar a lancar venda tem uma semana, e media de uma semana e melhor
  -- que media nenhuma — desde que a tela diga que foi uma.
  select count(*) into v_consideradas
    from (select v.id from public.vendas v
           where v.restaurante_id = c_atual.restaurante_id
             and v.status = 'fechada'
             and v.referencia <= c_atual.referencia
           order by v.referencia desc, v.fechada_em desc nulls last
           limit 3) t;

  if v_consideradas = 0 then
    v_sem_venda := 'nenhuma venda fechada ate ' || to_char(c_atual.referencia, 'DD/MM/YYYY')
                || ': sem media para sugerir compra';
  end if;

  return query
  with
  -- -------------------------------------------------------------- contagens --
  -- A contagem lanca na unidade do SETOR, que nem sempre e a de compra do
  -- produto (conta-se a cerveja por CX no deposito e por UND no bar).
  -- `mv_fator_para_produto` faz a ponte, inclusive pela embalagem; fator nulo
  -- marca a linha em vez de somar quantidade de unidade errada.
  atual as (
    select i.produto_id                                         as pid,
           case when bool_or(x.fator is null) then null
                else round(sum(i.quantidade * x.fator), 6) end  as qtd,
           bool_or(x.fator is null)                             as sem_fator,
           max(i.unidade) filter (where x.fator is null)         as unidade_crua,
           max(i.custo_unitario)                                as custo
      from contagem_itens i
      cross join lateral (
        select mv_fator_para_produto(i.unidade, i.produto_id) as fator
      ) x
     where i.contagem_id = c_atual.id
     group by i.produto_id
  ),
  anterior as (
    select i.produto_id                                         as pid,
           case when bool_or(x.fator is null) then null
                else round(sum(i.quantidade * x.fator), 6) end  as qtd,
           bool_or(x.fator is null)                             as sem_fator
      from contagem_itens i
      cross join lateral (
        select mv_fator_para_produto(i.unidade, i.produto_id) as fator
      ) x
     where i.contagem_id = c_anterior.id
     group by i.produto_id
  ),
  -- ---------------------------------------------------------------- compras --
  -- `quantidade_convertida` ja esta na unidade do cadastro (0004), entao aqui
  -- nao ha conversao a fazer — e nao ha conversao a inventar.
  compradas as (
    select it.produto_id                           as pid,
           round(sum(it.quantidade_convertida), 6) as qtd
      from nota_itens it
      join notas_fiscais n on n.id = it.nota_id
     where c_anterior.id is not null
       and n.restaurante_id = c_atual.restaurante_id
       and n.status = 'lancada'
       and it.produto_id is not null
       and n.emitida_em >  c_anterior.referencia
       and n.emitida_em <= c_atual.referencia
     group by it.produto_id
  ),
  -- ----------------------------------------------------------------- vendas --
  vendidas as (
    select e.produto_id as pid,
           case when bool_or(e.fator_ausente) then null
                else round(sum(e.quantidade), 6) end as qtd,
           bool_or(e.fator_ausente)                  as sem_fator,
           string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente) as motivo
      from public.vendas v
      cross join lateral mv_vendas_por_produto(v.id) e
     where c_anterior.id is not null
       and v.restaurante_id = c_atual.restaurante_id
       and v.status = 'fechada'
       and v.referencia >  c_anterior.referencia
       and v.referencia <= c_atual.referencia
     group by e.produto_id
  ),
  -- As tres vendas fechadas mais recentes ate a data da contagem. Repare que
  -- a janela da media NAO e o periodo do relatorio: a media serve para prever
  -- a semana que vem, e para isso ela quer o historico recente, nao o recorte
  -- entre duas fotos.
  tres as (
    select v.id from public.vendas v
     where v.restaurante_id = c_atual.restaurante_id
       and v.status = 'fechada'
       and v.referencia <= c_atual.referencia
     order by v.referencia desc, v.fechada_em desc nulls last
     limit 3
  ),
  -- A media divide pelo NUMERO DE VENDAS consideradas, nao pelo numero de
  -- vendas em que o produto apareceu. Semana sem vender picanha e semana de
  -- zero picanha, e zero faz parte da media — tirar essa semana da conta
  -- inflaria a sugestao de compra exatamente dos itens que menos saem.
  media as (
    select e.produto_id as pid,
           case when bool_or(e.fator_ausente) then null
                else round(sum(e.quantidade) / v_consideradas, 6) end as qtd,
           bool_or(e.fator_ausente)                  as sem_fator,
           string_agg(distinct e.motivo, '; ') filter (where e.fator_ausente) as motivo
      from tres t
      cross join lateral mv_vendas_por_produto(t.id) e
     group by e.produto_id
  ),
  universo as (
    select atual.pid     as pid from atual
    union select anterior.pid  from anterior
    union select compradas.pid from compradas
    union select vendidas.pid  from vendidas
    union select media.pid     from media
  ),
  -- As quatro pontas normalizadas num lugar so, para que a aritmetica de baixo
  -- seja legivel: nulo aqui quer dizer "nao da para afirmar", e nulo propaga
  -- sozinho pela soma do proprio Postgres.
  base as (
    select
      p.id as pid, p.nome as pnome, p.categoria_id as pcat, cat.nome as pcatnome,
      p.unidade as pun,
      case when c_anterior.id is null  then null
           when anterior.sem_fator     then null
           else coalesce(anterior.qtd, 0) end as q_ant,
      case when c_anterior.id is null  then null
           else coalesce(compradas.qtd, 0) end as q_com,
      case when c_anterior.id is null  then null
           when vendidas.sem_fator     then null
           else coalesce(vendidas.qtd, 0) end as q_ven,
      case when atual.sem_fator        then null
           else coalesce(atual.qtd, 0) end    as q_atu,
      case when v_consideradas = 0     then null
           when media.sem_fator        then null
           else coalesce(media.qtd, 0) end    as q_med,
      -- O custo que a propria foto congelou; so quando o produto nao esta nela
      -- (ou entrou nela com custo zero) e que o custo de hoje entra, pela
      -- mesma fonte que a ficha le.
      coalesce(nullif(atual.custo, 0), mv_custo_do_produto(p.id)) as p_custo,
      nullif(concat_ws('; ',
        v_aberta,
        v_sem_anterior,
        case when atual.sem_fator then
          format('a contagem lancou este item em %s, que nao converte para %s',
                 atual.unidade_crua, p.unidade) end,
        case when anterior.sem_fator then
          'a contagem anterior lancou este item em unidade que nao converte para a de compra' end,
        case when c_anterior.id is not null and anterior.pid is null then
          'este item nao estava na folha da contagem anterior; o anterior foi lido como zero' end,
        case when atual.pid is null then
          'este item nao esta na folha desta contagem; o estoque atual foi lido como zero' end,
        vendidas.motivo,
        case when vendidas.motivo is null then media.motivo end,
        v_sem_venda
      ), '') as pend
    from universo u
    join produtos p on p.id = u.pid
    left join categorias cat on cat.id = p.categoria_id
    left join atual     on atual.pid     = u.pid
    left join anterior  on anterior.pid  = u.pid
    left join compradas on compradas.pid = u.pid
    left join vendidas  on vendidas.pid  = u.pid
    left join media     on media.pid     = u.pid
    where p.restaurante_id = c_atual.restaurante_id
  )
  select
    base.pid, base.pnome, base.pcat, base.pcatnome, base.pun,
    base.q_ant, base.q_com, base.q_ven, base.q_atu,
    -- CONSUMO = anterior + compras − atual: o que o ESTOQUE diz que saiu.
    round(base.q_ant + base.q_com - base.q_atu, 6),
    -- IDEAL = anterior + compras − vendas: o que o CARDAPIO diz que deveria
    -- ter sobrado.
    round(base.q_ant + base.q_com - base.q_ven, 6),
    -- DIFERENCA = atual − ideal. Positiva, sobrou mais do que a venda explica;
    -- negativa, falta no estoque o que ninguem vendeu.
    round(base.q_atu - (base.q_ant + base.q_com - base.q_ven), 6),
    base.q_med,
    v_consideradas,
    -- A regra, ao pe da letra: "se a contagem atual for MAIOR que a media, nao
    -- precisa comprar; senao, sugestao = media − contagem atual". No EMPATE,
    -- portanto, PRECISA comprar, e a sugestao e zero — a borda esta decidida de
    -- proposito, e ha teste para ela. Sem media (nenhuma venda fechada) as duas
    -- colunas voltam nulas: a pergunta nao tem resposta, e inventar "nao precisa
    -- comprar" aqui mandaria a casa para a semana seguinte sem estoque.
    case when base.q_med is null or base.q_atu is null then null
         else greatest(base.q_med - base.q_atu, 0) end,
    case when base.q_med is null or base.q_atu is null then null
         else base.q_atu <= base.q_med end,
    base.p_custo,
    base.pend
  from base
  order by base.pnome;
end $$;

comment on function mv_relatorio_de_contagem(uuid) is
  'Contagem anterior, compras, vendas, contagem atual, consumo, ideal e sugestao de compra, por produto.';

-- 8 ------------------------------------------- a procedencia da contagem ---
-- O rodape do dashboard. `fichas.origem_carga` (0021) nao se aplica aqui: uma
-- contagem nasce da folha e e preenchida a mao, nao de arquivo. Entao o que
-- esta vista afirma e so o que o banco sabe de fato — se esta aberta ou
-- fechada, quem fechou, quando, e quantas abas foram lidas. Procedencia
-- inventada e pior que procedencia curta.
drop view if exists vw_contagem_procedencia;
create view vw_contagem_procedencia as
select
  c.id as contagem_id,
  c.restaurante_id,
  c.referencia,
  c.tipo,
  c.status,
  c.titulo,
  c.criado_em,
  c.fechada_em,
  (select pc.nome from perfis pc where pc.id = c.criado_por)  as criado_por_nome,
  (select pf.nome from perfis pf where pf.id = c.fechado_por) as fechado_por_nome,
  (select count(*) from contagem_itens i where i.contagem_id = c.id)                      as itens_na_folha,
  -- "Respondido" e carimbo OU quantidade, nao so carimbo. A folha preenchida
  -- por carga de planilha (0003) grava quantidade sem `contado_em`, e contar
  -- so o carimbo fazia o rodape do dashboard dizer "868 linhas sem resposta —
  -- elas entram nesta leitura como zero" numa contagem com 342 linhas
  -- preenchidas. A frase era falsa para 342 delas, que e exatamente o tipo de
  -- afirmacao que este rodape existe para nao fazer.
  (select count(*) from contagem_itens i
    where i.contagem_id = c.id and (i.contado_em is not null or i.quantidade > 0)) as itens_respondidos,
  (select count(distinct i.setor_id) from contagem_itens i where i.contagem_id = c.id)    as setores,
  (select count(distinct coalesce(i.estoque_id::text, i.setor_id::text))
     from contagem_itens i where i.contagem_id = c.id)                                    as abas,
  (select count(distinct p.categoria_id) from contagem_itens i
     join produtos p on p.id = i.produto_id
    where i.contagem_id = c.id and p.categoria_id is not null)                            as categorias
from contagens c;

alter view vw_contagem_procedencia set (security_invoker = on);

-- 9 ----------------------------------------------------------------- rls ---
alter table vendas      enable row level security;
alter table venda_itens enable row level security;

drop policy if exists vendas_ler on vendas;
create policy vendas_ler on vendas for select to authenticated
  using (mv_pode_operar(restaurante_id));

drop policy if exists vendas_criar on vendas;
create policy vendas_criar on vendas for insert to authenticated
  with check (mv_pode_operar(restaurante_id));

drop policy if exists vendas_editar on vendas;
create policy vendas_editar on vendas for update to authenticated
  using (mv_pode_operar(restaurante_id))
  with check (mv_pode_operar(restaurante_id));

-- Apagar um lancamento de vendas muda o relatorio de um periodo fechado, do
-- mesmo jeito que apagar contagem muda o CMV: e de quem administra.
drop policy if exists vendas_apagar on vendas;
create policy vendas_apagar on vendas for delete to authenticated
  using (mv_pode_administrar(restaurante_id));

drop policy if exists venda_itens_tudo on venda_itens;
create policy venda_itens_tudo on venda_itens for all to authenticated
  using (exists (select 1 from vendas v
                  where v.id = venda_itens.venda_id and mv_pode_operar(v.restaurante_id)))
  with check (exists (select 1 from vendas v
                       where v.id = venda_itens.venda_id and mv_pode_operar(v.restaurante_id)));

-- 10 --------------------------------------------------------- permissoes ---
-- `drop view` e `drop function` levam o grant junto. Sem re-outorgar aqui, a
-- SEGUNDA passada desta migracao — que e o que o `supabase db push` faz sempre
-- que o historico esta atras do banco — deixaria a tela com "permission denied
-- for function mv_relatorio_de_contagem". Foi assim que a 0022 quebrou a tela
-- de fichas na primeira vez que rodou por cima da 0017.
grant select, insert, update, delete on vendas, venda_itens to authenticated;
grant select on vw_contagem_procedencia to authenticated;
grant execute on function mv_fechar_venda(uuid)                to authenticated;
grant execute on function mv_reabrir_venda(uuid)               to authenticated;
grant execute on function mv_produtos_da_ficha(uuid, integer)  to authenticated;
grant execute on function mv_vendas_por_produto(uuid)          to authenticated;
grant execute on function mv_relatorio_de_contagem(uuid)       to authenticated;
