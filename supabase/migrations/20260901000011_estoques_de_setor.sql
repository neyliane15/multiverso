-- ---------------------------------------------------------------------------
-- 0011 · Estoque de setor
--
-- O setor diz QUEM conta (o bar, a cozinha). O estoque de setor diz ONDE,
-- dentro dele: "Bar / Geladeira 1", "Bar / Prateleira do fundo". Quem conta
-- anda por lugares fisicos, nao por setores abstratos, e duas geladeiras do
-- mesmo bar sao duas paradas diferentes.
--
-- Duas decisoes que valem o comentario:
--
-- 1. O estoque e LUGAR, nao preco. Unidade e custo continuam em
--    produto_setores, um por setor. A mesma cerveja custa o mesmo na
--    Geladeira 1 e na 2 — guardar custo por estoque so criaria duas verdades
--    para o mesmo produto no mesmo setor.
--
-- 2. Estoque e opcional. Os 854 produtos do primeiro cliente vieram de uma
--    planilha que nao tem esse nivel, e setor sem subdivisao e legitimo: o
--    Hortifruti e uma camara so. Vinculo sem estoque continua valendo e conta
--    como hoje — uma linha por produto x setor.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- estoques --
create table if not exists estoques (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  setor_id       uuid not null references setores(id) on delete cascade,
  nome           text not null,
  descricao      text,
  ordem          integer not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Unico dentro do setor, nao do restaurante: "Geladeira 1" no Bar e
-- "Geladeira 1" na Cozinha sao duas geladeiras, e as duas tem esse nome.
create unique index if not exists estoques_nome_unico
  on estoques (setor_id, lower(mv_sem_acento(nome)));
create index if not exists estoques_setor_idx on estoques (setor_id, ordem);
create index if not exists estoques_restaurante_idx on estoques (restaurante_id, ordem);

comment on table estoques is
  'Lugar fisico dentro de um setor: Bar / Geladeira 1. Onde se conta, nao quanto custa.';

-- O restaurante_id e copia do setor: existe para a RLS ser um predicado
-- simples, como nas outras tabelas. Copia que diverge da origem e defeito, e o
-- gatilho abaixo impede a divergencia em vez de confiar em quem escreve.
create or replace function mv_valida_estoque_setor()
returns trigger language plpgsql as $$
declare r_setor uuid;
begin
  select restaurante_id into r_setor from setores where id = new.setor_id;
  if r_setor is distinct from new.restaurante_id then
    raise exception 'estoque % aponta para setor de outro restaurante', new.nome;
  end if;
  return new;
end $$;

drop trigger if exists t_estoques_valida on estoques;
create trigger t_estoques_valida
  before insert or update on estoques
  for each row execute function mv_valida_estoque_setor();

call mv_registra_touch('estoques');

-- ------------------------------------------------------ produto x estoque --
-- Em quais lugares do setor o produto vive. O mesmo produto pode estar na
-- Geladeira 1 e na 2 do mesmo bar — e contar as duas separado e exatamente o
-- motivo de subdividir o setor.
create table if not exists produto_estoques (
  produto_id uuid not null references produtos(id) on delete cascade,
  estoque_id uuid not null references estoques(id) on delete cascade,
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  primary key (produto_id, estoque_id)
);

create index if not exists produto_estoques_estoque_idx on produto_estoques (estoque_id);

-- Guarda-corpo duplo. O primeiro e o de sempre: mesmo restaurante. O segundo e
-- proprio daqui — nao adianta pendurar o produto na Geladeira 1 se ele nao
-- esta no Bar. O lugar so existe dentro do setor, e o vinculo tem de respeitar
-- isso, senao a folha de contagem nasce com produto em setor que ninguem
-- cadastrou.
create or replace function mv_valida_produto_estoque()
returns trigger language plpgsql as $$
declare r_produto uuid; r_estoque uuid; s_estoque uuid;
begin
  select restaurante_id into r_produto from produtos where id = new.produto_id;
  select restaurante_id, setor_id into r_estoque, s_estoque
    from estoques where id = new.estoque_id;

  if r_produto is distinct from r_estoque then
    raise exception 'produto % e estoque % pertencem a restaurantes diferentes',
      new.produto_id, new.estoque_id;
  end if;

  if not exists (select 1 from produto_setores ps
                  where ps.produto_id = new.produto_id and ps.setor_id = s_estoque) then
    raise exception
      'o produto nao esta no setor deste estoque: marque o setor antes de escolher o lugar';
  end if;

  return new;
end $$;

drop trigger if exists t_produto_estoques_valida on produto_estoques;
create trigger t_produto_estoques_valida
  before insert or update on produto_estoques
  for each row execute function mv_valida_produto_estoque();

-- Tirar o produto do setor tem de tirar dos lugares daquele setor tambem.
-- Sem isto o vinculo com a Geladeira 1 sobreviveria a saida do produto do Bar,
-- e a proxima folha o traria de volta por uma porta que ninguem ve.
create or replace function mv_limpa_estoques_do_setor()
returns trigger language plpgsql as $$
begin
  delete from produto_estoques pe
   using estoques e
   where pe.estoque_id = e.id
     and pe.produto_id = old.produto_id
     and e.setor_id    = old.setor_id;
  return old;
end $$;

drop trigger if exists t_produto_setores_limpa_estoques on produto_setores;
create trigger t_produto_setores_limpa_estoques
  after delete on produto_setores
  for each row execute function mv_limpa_estoques_do_setor();

-- ------------------------------------------------- a contagem ganha lugar --
alter table contagem_itens
  add column if not exists estoque_id uuid references estoques(id) on delete restrict;

-- A chave antiga dizia "um produto so uma vez por setor". Agora e uma vez por
-- lugar do setor, e `nulls not distinct` mantem valendo a regra antiga para o
-- setor sem subdivisao: duas linhas com estoque nulo continuam sendo duplicata.
alter table contagem_itens
  drop constraint if exists contagem_itens_contagem_id_produto_id_setor_id_key;

drop index if exists contagem_itens_lugar_unico;
create unique index contagem_itens_lugar_unico
  on contagem_itens (contagem_id, produto_id, setor_id, estoque_id) nulls not distinct;

create index if not exists contagem_itens_estoque_idx
  on contagem_itens (contagem_id, estoque_id);

-- ------------------------------------------------------ abrir a contagem ---
-- Uma linha por lugar onde o produto vive. Sem lugar cadastrado, uma linha
-- para o setor inteiro — que e o comportamento de antes desta migracao, e o
-- que os 868 vinculos do primeiro cliente continuam produzindo.
create or replace function mv_abrir_contagem(
  p_restaurante uuid,
  p_referencia  date,
  p_tipo        tipo_contagem default 'mensal',
  p_titulo      text default null,
  p_setores     uuid[] default null      -- null = todos os setores
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into contagens (restaurante_id, referencia, tipo, titulo, criado_por)
  values (p_restaurante, p_referencia, p_tipo,
          coalesce(p_titulo, initcap(p_tipo::text) || ' · ' || to_char(p_referencia, 'DD/MM/YYYY')),
          auth.uid())
  returning id into v_id;

  insert into contagem_itens
    (contagem_id, produto_id, setor_id, estoque_id, unidade, custo_unitario, observacao)
  select v_id, ps.produto_id, ps.setor_id, e.id, ps.unidade,
         case when ps.custo > 0 then ps.custo else p.custo_medio end,
         -- De quando e o custo que esta na linha. Veio da 0009 e continua aqui:
         -- reescrever a funcao sem isto apagaria a data da folha sem aviso.
         case when coalesce(ps.custo_atualizado_em, p.custo_atualizado_em) is not null
              then 'custo de ' || to_char(
                     coalesce(ps.custo_atualizado_em, p.custo_atualizado_em), 'DD/MM/YYYY')
         end
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
    join setores  s on s.id = ps.setor_id
    -- LATERAL, e nao dois left joins soltos: o filtro de setor tem de valer
    -- DENTRO da busca dos lugares. Com os joins soltos, um produto que vive no
    -- Bar e na Cozinha e tem duas geladeiras no Bar produzia, para a linha da
    -- Cozinha, duas linhas com estoque nulo — as duas geladeiras do Bar nao
    -- casavam com o setor e voltavam como nulo cada uma. Duplicata na chave, e
    -- a contagem inteira falhava ao abrir.
    --
    -- Sem lugar neste setor o lateral nao devolve linha, e o LEFT JOIN entrega
    -- uma unica linha com e.id nulo: exatamente a folha de antes dos estoques.
    left join lateral (
      select e.id
        from produto_estoques pe
        join estoques e on e.id = pe.estoque_id
       where pe.produto_id = ps.produto_id and pe.ativo
         and e.setor_id = ps.setor_id and e.ativo
    ) e on true
   where p.restaurante_id = p_restaurante
     and p.ativo and s.ativo and ps.ativo
     and (p_setores is null or ps.setor_id = any (p_setores));

  return v_id;
end $$;

-- ------------------------------------------------------------------ vistas -
-- Produto com categoria, setores e, dentro de cada setor, os lugares.
-- `create or replace` e de proposito: o DROP da 0009 levou junto o grant e a
-- tela de Produtos respondeu "permission denied". Trocar so o corpo preserva
-- permissao e dependencias — e exige repetir a lista de colunas exatamente
-- como a 0009 a deixou, `custo_atualizado_em` inclusive.
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
                (select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome)
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
    '[]'::jsonb) as setores
from produtos p
left join categorias c on c.id = p.categoria_id;

-- Total por lugar dentro de uma contagem. O setor sem subdivisao aparece uma
-- vez, com estoque_nome nulo — a tela mostra o setor inteiro nesse caso.
create or replace view vw_contagem_por_estoque as
select
  i.contagem_id, c.restaurante_id,
  s.id as setor_id, s.nome as setor_nome, s.cor as setor_cor,
  e.id as estoque_id, e.nome as estoque_nome,
  count(*)                                 as itens,
  count(*) filter (where i.quantidade > 0) as itens_preenchidos,
  coalesce(sum(i.total), 0)                as total
from contagem_itens i
join contagens c on c.id = i.contagem_id
join setores   s on s.id = i.setor_id
left join estoques e on e.id = i.estoque_id
group by i.contagem_id, c.restaurante_id, s.id, s.nome, s.cor, e.id, e.nome;

-- --------------------------------------------------------------------- RLS -
alter table estoques         enable row level security;
alter table produto_estoques enable row level security;

drop policy if exists estoques_ler on estoques;
create policy estoques_ler on estoques for select to authenticated
  using (mv_pode_operar(restaurante_id));

drop policy if exists estoques_criar on estoques;
create policy estoques_criar on estoques for insert to authenticated
  with check (mv_pode_operar(restaurante_id));

drop policy if exists estoques_editar on estoques;
create policy estoques_editar on estoques for update to authenticated
  using (mv_pode_operar(restaurante_id))
  with check (mv_pode_operar(restaurante_id));

drop policy if exists estoques_apagar on estoques;
create policy estoques_apagar on estoques for delete to authenticated
  using (mv_pode_administrar(restaurante_id));

drop policy if exists produto_estoques_tudo on produto_estoques;
create policy produto_estoques_tudo on produto_estoques for all to authenticated
  using (exists (select 1 from produtos p
                  where p.id = produto_estoques.produto_id and mv_pode_operar(p.restaurante_id)))
  with check (exists (select 1 from produtos p
                  where p.id = produto_estoques.produto_id and mv_pode_operar(p.restaurante_id)));

alter view vw_contagem_por_estoque set (security_invoker = on);
-- Reposto, e nao herdado: `create or replace view` nao preserva as opcoes, e
-- sem esta linha a vista volta a rodar com os direitos do dono — ou seja, sem
-- RLS, entregando o catalogo de um restaurante para o usuario de outro.
alter view vw_produtos_completos set (security_invoker = on);

grant select, insert, update, delete on estoques, produto_estoques to authenticated;
grant select on vw_contagem_por_estoque to authenticated;
