-- ---------------------------------------------------------------------------
-- 0017 · Fichas tecnicas
--
-- A ficha responde uma pergunta que o estoque sozinho nao responde: ESTE PRATO
-- vale a pena? Ela pega os MESMOS produtos da contagem — mesmo id, mesmo nome,
-- mesmo custo — diz quanto de cada um entra no prato, e cruza com o preco de
-- venda. O que sai dali e o CMV do prato.
--
-- Quatro decisoes que valem o comentario:
--
-- 1. O insumo e o produto do catalogo, sem copia e sem nome paralelo. Uma
--    tabela de "ingredientes" propria pareceria mais simples no comeco e seria
--    o fim da automacao: a nota atualiza `produtos.custo_medio`, nao a copia.
--    Aqui o vinculo e a chave estrangeira, entao o custo chega sozinho.
--
-- 2. O custo NAO e guardado na ficha. Guardar congelaria o numero no dia em
--    que alguem digitou — e a pergunta "vale a pena?" so faz sentido com o
--    custo de hoje. A ficha guarda QUANTIDADE; o custo e lido na hora, da
--    mesma fonte que a contagem le.
--
-- 3. A unidade da receita nao e a unidade de compra. Compra-se farinha em KG e
--    usa-se 250 G. `mv_fator_unidade` faz a ponte; quando as duas nao se
--    convertem (G para UND, por exemplo), o item entra marcado como
--    incompativel em vez de virar um numero errado. Pendencia visivel e
--    incomodo; custo errado e decisao errada.
--
-- 4. Perda entra como percentual sobre o liquido. Uma cebola de 100 G limpos
--    com 20% de perda custa 125 G comprados — e e isso que sai do estoque.
--    Sem o fator, toda ficha de hortifruti e de carne subestima o custo.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------- unidades da receita -
-- Fator para converter `de` em `para`. Nulo quando as duas nao pertencem a
-- mesma familia — e nulo aqui significa "a tela precisa perguntar", nunca 1.
create or replace function mv_fator_unidade(de text, para text)
returns numeric
language plpgsql immutable parallel safe set search_path = public as $$
declare
  v_de   text := upper(btrim(coalesce(mv_sem_acento(de), '')));
  v_para text := upper(btrim(coalesce(mv_sem_acento(para), '')));
  -- Quanto cada unidade vale na base da sua familia (G, ML ou UND).
  v_base_de   numeric;
  v_base_para numeric;
  v_fam_de    text;
  v_fam_para  text;
begin
  -- Sinonimos que aparecem em nota fiscal e em planilha de cozinha.
  v_de := case v_de
            when 'QUILO' then 'KG' when 'QUILOS' then 'KG' when 'KILO' then 'KG'
            when 'GR' then 'G' when 'GRAMA' then 'G' when 'GRAMAS' then 'G'
            when 'LT' then 'L' when 'LITRO' then 'L' when 'LITROS' then 'L'
            when 'MLT' then 'ML'
            when 'UN' then 'UND' when 'UNID' then 'UND' when 'UNIDADE' then 'UND'
            when 'PC' then 'UND' when 'PCT' then 'UND' when 'PECA' then 'UND'
            else v_de end;
  v_para := case v_para
            when 'QUILO' then 'KG' when 'QUILOS' then 'KG' when 'KILO' then 'KG'
            when 'GR' then 'G' when 'GRAMA' then 'G' when 'GRAMAS' then 'G'
            when 'LT' then 'L' when 'LITRO' then 'L' when 'LITROS' then 'L'
            when 'MLT' then 'ML'
            when 'UN' then 'UND' when 'UNID' then 'UND' when 'UNIDADE' then 'UND'
            when 'PC' then 'UND' when 'PCT' then 'UND' when 'PECA' then 'UND'
            else v_para end;

  select f, b into v_fam_de, v_base_de from (values
    ('KG','massa',1000), ('G','massa',1), ('MG','massa',0.001),
    ('L','volume',1000), ('ML','volume',1),
    ('UND','unidade',1), ('DZ','unidade',12)
  ) as t(u, f, b) where u = v_de;

  select f, b into v_fam_para, v_base_para from (values
    ('KG','massa',1000), ('G','massa',1), ('MG','massa',0.001),
    ('L','volume',1000), ('ML','volume',1),
    ('UND','unidade',1), ('DZ','unidade',12)
  ) as t(u, f, b) where u = v_para;

  -- Unidade que o sistema nao conhece: so serve para ela mesma. Chutar familia
  -- aqui seria inventar conversao entre "CX" e "KG".
  if v_fam_de is null or v_fam_para is null then
    return case when v_de = v_para and v_de <> '' then 1 else null end;
  end if;
  if v_fam_de <> v_fam_para then return null; end if;
  return v_base_de / v_base_para;
end $$;

comment on function mv_fator_unidade(text, text) is
  'Converte unidade de receita em unidade de compra. Nulo = incompativel.';

-- --------------------------------------------------- o que cabe na embalagem -
-- O caso que aparece em toda ficha de bar: compra-se a cachaca por UND (a
-- garrafa) e a receita usa 60 ML. UND e ML nao se convertem — nem devem, no
-- geral. O que falta nao e conversao, e um dado: quanto cabe numa unidade de
-- compra. Dito uma vez no produto, vale para todas as fichas que o usarem.
alter table produtos
  add column if not exists conteudo_quantidade numeric(14,4)
    check (conteudo_quantidade is null or conteudo_quantidade > 0),
  add column if not exists conteudo_unidade text;

comment on column produtos.conteudo_quantidade is
  'Quanto cabe em UMA unidade de compra: a garrafa de 965, o pacote de 5.';
comment on column produtos.conteudo_unidade is
  'A unidade do conteudo: ML para a garrafa, G para o pacote.';

-- O fator da receita para a unidade de compra do produto, em duas tentativas.
create or replace function mv_fator_para_produto(p_unidade text, p_produto uuid)
returns numeric
language plpgsql stable parallel safe set search_path = public as $$
declare v_prod produtos; v_direto numeric; v_ate_o_conteudo numeric;
begin
  select * into v_prod from produtos where id = p_produto;
  if not found then return null; end if;

  -- 1. Mesma familia: G para KG, ML para L, UND para UND.
  v_direto := mv_fator_unidade(p_unidade, v_prod.unidade);
  if v_direto is not null then return v_direto; end if;

  -- 2. Pela embalagem: 60 ML numa garrafa de 965 ML = 0,0622 garrafa.
  if v_prod.conteudo_quantidade is not null and v_prod.conteudo_quantidade > 0 then
    v_ate_o_conteudo := mv_fator_unidade(p_unidade, v_prod.conteudo_unidade);
    if v_ate_o_conteudo is not null then
      return v_ate_o_conteudo / v_prod.conteudo_quantidade;
    end if;
  end if;

  -- Nem uma coisa nem outra: a tela pergunta. Chutar 1 aqui poria 60 garrafas
  -- de cachaca numa caipirinha e ninguem olharia o numero duas vezes.
  return null;
end $$;

comment on function mv_fator_para_produto(text, uuid) is
  'Fator da unidade da receita para a unidade de compra, direto ou pela embalagem.';

-- ------------------------------------------------------------- o custo de hoje -
-- A mesma fonte que a contagem le, na mesma ordem de preferencia: o custo do
-- produto (que a nota atualiza) e, quando ele nao existe, o custo que a casa
-- fixou no vinculo de setor. Ficha e contagem discordando sobre o preco do
-- mesmo produto seria o pior dos dois mundos.
create or replace function mv_custo_do_produto(p_produto uuid)
returns numeric
language sql stable parallel safe set search_path = public as $$
  select coalesce(
    nullif(p.custo_medio, 0),
    (select max(ps.custo) from produto_setores ps
      where ps.produto_id = p.id and ps.ativo and ps.custo > 0),
    0)
  from produtos p where p.id = p_produto
$$;

-- --------------------------------------------------------------- as fichas --
create table if not exists fichas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  -- Grupo do CARDAPIO (Entradas, Pratos, Sobremesas), que nao e a categoria do
  -- insumo. Texto e nao tabela: sao poucos, mudam com a estacao, e uma tabela
  -- a mais aqui so criaria um cadastro para manter.
  grupo          text,
  descricao      text,
  modo_preparo   text,
  rendimento     numeric(14,4) not null default 1 check (rendimento > 0),
  unidade_rendimento text not null default 'PORCAO',
  preco_venda    numeric(14,4) not null default 0 check (preco_venda >= 0),
  -- A meta de CMV DESTE prato, em percentual. Existe para que "vale a pena?"
  -- tenha uma resposta da casa, e nao um numero de manual: 30% e razoavel num
  -- prato de cozinha e pessimo num drink, onde 20% ja e caro.
  cmv_alvo       numeric(6,3) not null default 30
                   check (cmv_alvo > 0 and cmv_alvo <= 100),
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  criado_por     uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table fichas
  add column if not exists cmv_alvo numeric(6,3) not null default 30;

create unique index if not exists fichas_nome_unico
  on fichas (restaurante_id, lower(mv_sem_acento(nome)));
create index if not exists fichas_restaurante_idx on fichas (restaurante_id, ordem, nome);

comment on table fichas is
  'Ficha tecnica de um item do cardapio: rendimento, preco de venda e insumos.';
comment on column fichas.rendimento is
  'Quantas porcoes a receita rende. O custo por porcao e o custo total dividido por ele.';

call mv_registra_touch('fichas');

-- ------------------------------------------------------- os insumos da ficha -
create table if not exists ficha_itens (
  id            uuid primary key default gen_random_uuid(),
  ficha_id      uuid not null references fichas(id) on delete cascade,
  -- `restrict` de proposito: apagar um produto que esta em ficha apagaria o
  -- custo do prato sem ninguem perceber. A tela manda desativar o produto.
  produto_id    uuid not null references produtos(id) on delete restrict,
  quantidade    numeric(14,4) not null check (quantidade > 0),
  unidade       text not null,
  perda_percentual numeric(6,3) not null default 0
    check (perda_percentual >= 0 and perda_percentual < 100),
  observacao    text,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  unique (ficha_id, produto_id)
);

create index if not exists ficha_itens_produto_idx on ficha_itens (produto_id);

comment on column ficha_itens.quantidade is
  'Quantidade LIQUIDA, ja limpa/porcionada. A perda converte para o bruto comprado.';

-- Mesmo restaurante nos dois lados. Sem isto, uma ficha do Bar do Zeca poderia
-- apontar para um produto da Padaria — e o custo viria de outro cliente.
create or replace function mv_valida_ficha_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ficha uuid; v_produto uuid;
begin
  select restaurante_id into v_ficha   from fichas   where id = new.ficha_id;
  select restaurante_id into v_produto from produtos where id = new.produto_id;
  if v_ficha is null or v_produto is null or v_ficha <> v_produto then
    raise exception 'ficha e produto de restaurantes diferentes';
  end if;
  return new;
end $$;

drop trigger if exists t_ficha_itens_valida on ficha_itens;
create trigger t_ficha_itens_valida
  before insert or update on ficha_itens
  for each row execute function mv_valida_ficha_item();

-- ------------------------------------------------------------------ vistas --
-- Item a item, com a conta inteira aberta: quanto se compra, a que preco, e o
-- que isso custa no prato. A tela nao recalcula nada para LER — so para o
-- rascunho de quem esta editando.
-- A dependente cai primeiro: `vw_fichas_completas` le desta, e o `drop` sem
-- ela na frente falha na SEGUNDA passada desta migracao — que e o que o
-- `supabase db push` faz sempre que o historico esta atras do banco.
drop view if exists vw_fichas_completas;
drop view if exists vw_ficha_itens;

create view vw_ficha_itens as
select
  i.id, i.ficha_id, f.restaurante_id,
  i.produto_id, p.nome as produto_nome, p.unidade as produto_unidade,
  p.categoria_id, c.nome as categoria_nome, c.cor as categoria_cor,
  i.quantidade, i.unidade, i.perda_percentual, i.observacao, i.ordem,
  p.custo_atualizado_em,
  x.quantidade_bruta,
  x.fator,
  x.custo_unitario,
  -- Sem fator nao ha custo: escrever um numero aqui seria inventar conversao.
  case when x.fator is null then null
       else round(x.quantidade_bruta * x.fator * x.custo_unitario, 4) end as custo,
  x.fator is null        as unidade_incompativel,
  x.custo_unitario = 0   as sem_custo
from ficha_itens i
join fichas f   on f.id = i.ficha_id
join produtos p on p.id = i.produto_id
left join categorias c on c.id = p.categoria_id
-- Uma chamada de cada, e nao uma por coluna: o fator e o custo aparecem em
-- quatro lugares da conta, e repetir a chamada e repetir a consulta.
cross join lateral (
  select round(i.quantidade / (1 - i.perda_percentual / 100), 4) as quantidade_bruta,
         mv_fator_para_produto(i.unidade, i.produto_id)          as fator,
         mv_custo_do_produto(i.produto_id)                       as custo_unitario
) x;

alter view vw_ficha_itens set (security_invoker = on);

-- A ficha inteira, com os itens dentro e as contas prontas.
drop view if exists vw_fichas_completas;
create view vw_fichas_completas as
with soma as (
  select ficha_id,
         sum(coalesce(custo, 0))                        as custo_total,
         count(*)                                       as itens,
         count(*) filter (where unidade_incompativel)   as itens_incompativeis,
         count(*) filter (where sem_custo)              as itens_sem_custo
    from vw_ficha_itens group by ficha_id
)
select
  f.id, f.restaurante_id, f.nome, f.grupo, f.descricao, f.modo_preparo,
  f.rendimento, f.unidade_rendimento, f.preco_venda, f.cmv_alvo, f.ativo, f.ordem,
  f.criado_em, f.atualizado_em,
  coalesce(s.itens, 0)               as itens,
  coalesce(s.itens_incompativeis, 0) as itens_incompativeis,
  coalesce(s.itens_sem_custo, 0)     as itens_sem_custo,
  coalesce(s.custo_total, 0)                                  as custo_total,
  round(coalesce(s.custo_total, 0) / f.rendimento, 4)         as custo_porcao,
  -- CMV do prato: quanto do preco de venda vai embora em insumo. Sem preco,
  -- nulo — e nulo aqui e honesto, porque a pergunta nao tem resposta ainda.
  case when f.preco_venda > 0
       then round(coalesce(s.custo_total, 0) / f.rendimento / f.preco_venda * 100, 2)
  end                                                         as cmv_percentual,
  case when f.preco_venda > 0
       then round(f.preco_venda - coalesce(s.custo_total, 0) / f.rendimento, 4)
  end                                                         as margem,
  case when coalesce(s.custo_total, 0) > 0
       then round(f.preco_venda / (coalesce(s.custo_total, 0) / f.rendimento), 2)
  end                                                         as markup,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', vi.id, 'produto_id', vi.produto_id, 'produto_nome', vi.produto_nome,
              'produto_unidade', vi.produto_unidade,
              'categoria_nome', vi.categoria_nome, 'categoria_cor', vi.categoria_cor,
              'quantidade', vi.quantidade, 'unidade', vi.unidade,
              'perda_percentual', vi.perda_percentual, 'quantidade_bruta', vi.quantidade_bruta,
              'custo_unitario', vi.custo_unitario, 'custo', vi.custo,
              'unidade_incompativel', vi.unidade_incompativel, 'sem_custo', vi.sem_custo,
              'observacao', vi.observacao, 'ordem', vi.ordem)
            order by vi.ordem, vi.produto_nome)
       from vw_ficha_itens vi where vi.ficha_id = f.id),
    '[]'::jsonb)                                              as itens_da_ficha
from fichas f
left join soma s on s.ficha_id = f.id;

alter view vw_fichas_completas set (security_invoker = on);

-- --------------------------------------------------------------------- rls --
alter table fichas      enable row level security;
alter table ficha_itens enable row level security;

drop policy if exists fichas_ler on fichas;
create policy fichas_ler on fichas for select to authenticated
  using (mv_pode_operar(restaurante_id));

drop policy if exists fichas_criar on fichas;
create policy fichas_criar on fichas for insert to authenticated
  with check (mv_pode_operar(restaurante_id));

drop policy if exists fichas_editar on fichas;
create policy fichas_editar on fichas for update to authenticated
  using (mv_pode_operar(restaurante_id))
  with check (mv_pode_operar(restaurante_id));

drop policy if exists fichas_apagar on fichas;
create policy fichas_apagar on fichas for delete to authenticated
  using (mv_pode_administrar(restaurante_id));

drop policy if exists ficha_itens_tudo on ficha_itens;
create policy ficha_itens_tudo on ficha_itens for all to authenticated
  using (exists (select 1 from fichas f
                  where f.id = ficha_itens.ficha_id and mv_pode_operar(f.restaurante_id)))
  with check (exists (select 1 from fichas f
                       where f.id = ficha_itens.ficha_id and mv_pode_operar(f.restaurante_id)));

grant select, insert, update, delete on fichas, ficha_itens to authenticated;
grant select on vw_ficha_itens, vw_fichas_completas to authenticated;

-- --------------------------------------------- o conteudo na vista de produtos -
-- `create or replace` e nao `drop`: esta vista vem da 0009 com grant proprio, e
-- as duas colunas entram no FIM da lista, que e o que o Postgres aceita
-- acrescentar sem derrubar a vista.
create or replace view vw_produtos_completos as
select
  p.id, p.restaurante_id, p.nome, p.codigo, p.codigo_barras, p.unidade,
  p.custo_medio, p.custo_atualizado_em, p.estoque_minimo, p.perecivel, p.ativo,
  p.observacao, p.criado_em, p.atualizado_em,
  c.id as categoria_id, c.nome as categoria_nome, c.cor as categoria_cor,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'setor_id', s.id, 'setor_nome', s.nome, 'setor_cor', s.cor,
              'unidade', ps.unidade, 'custo', ps.custo, 'ordem', ps.ordem,
              'custo_fixo', ps.custo_fixo,
              'custo_atualizado_em', ps.custo_atualizado_em,
              'estoques', coalesce(
                (select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'ordem', e.ordem)
                        order by e.ordem, e.nome)
                   from produto_estoques pe
                   join estoques e on e.id = pe.estoque_id
                  where pe.produto_id = p.id and pe.ativo
                    and e.setor_id = s.id and e.ativo),
                '[]'::jsonb))
            order by s.ordem, s.nome)
       from produto_setores ps
       join setores s on s.id = ps.setor_id
      where ps.produto_id = p.id and ps.ativo),
    '[]'::jsonb) as setores,
  p.conteudo_quantidade, p.conteudo_unidade
from produtos p
left join categorias c on c.id = p.categoria_id;

alter view vw_produtos_completos set (security_invoker = on);
grant execute on function mv_fator_unidade(text, text) to authenticated;
grant execute on function mv_fator_para_produto(text, uuid) to authenticated;
grant execute on function mv_custo_do_produto(uuid) to authenticated;
