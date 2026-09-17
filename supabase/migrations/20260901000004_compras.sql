-- ============================================================================
-- Multiverso · 0004 · Modulo 3: Gestao de Compras
-- ----------------------------------------------------------------------------
-- 3.1 Notas fiscais: XML da NFe le tudo sozinho; PDF e compra de rua entram
--     pela mao. A chave de acesso e unica — importar o mesmo XML duas vezes
--     nao pode inflar as compras do mes.
-- 3.2 Lista de compras: o cadastro inteiro virando folha de pedido.
-- 3.3 Historico: as notas lancadas, por periodo e por fornecedor.
-- ============================================================================

do $$ begin
  create type origem_nota as enum ('xml', 'pdf', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_nota as enum ('importada', 'conferida', 'lancada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_lista as enum ('rascunho', 'enviada', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ fornecedores -
create table if not exists fornecedores (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  documento      text,                       -- CNPJ/CPF, so digitos
  inscricao      text,
  email          text,
  telefone       text,
  endereco       text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists fornecedores_documento_unico
  on fornecedores (restaurante_id, documento) where documento is not null;
create index if not exists fornecedores_nome_idx on fornecedores (restaurante_id, nome);

-- ----------------------------------------------------------- notas fiscais -
create table if not exists notas_fiscais (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  fornecedor_id  uuid references fornecedores(id) on delete set null,
  origem         origem_nota not null default 'manual',
  status         status_nota not null default 'importada',

  chave_acesso   text check (chave_acesso is null or chave_acesso ~ '^[0-9]{44}$'),
  numero         text,
  serie          text,
  modelo         text,
  emitida_em     date not null,
  recebida_em    date,

  valor_produtos numeric(16,4) not null default 0,
  valor_frete    numeric(16,4) not null default 0,
  valor_desconto numeric(16,4) not null default 0,
  valor_outros   numeric(16,4) not null default 0,
  valor_total    numeric(16,4) not null default 0,

  arquivo_url    text,                       -- storage: notas/<restaurante>/<id>.xml|pdf
  arquivo_nome   text,
  xml_bruto      text,                       -- guardado para reprocessar sem reupload
  observacao     text,

  criado_por     uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- A mesma nota nao entra duas vezes no mesmo restaurante.
create unique index if not exists notas_chave_unica
  on notas_fiscais (restaurante_id, chave_acesso) where chave_acesso is not null;
create index if not exists notas_periodo_idx
  on notas_fiscais (restaurante_id, emitida_em desc) where status <> 'cancelada';
create index if not exists notas_fornecedor_idx on notas_fiscais (restaurante_id, fornecedor_id);

comment on column notas_fiscais.xml_bruto is
  'XML original. Mantido para reprocessar o de-para de produtos sem pedir o arquivo de novo.';

-- ------------------------------------------------------- itens da nota -----
create table if not exists nota_itens (
  id             uuid primary key default gen_random_uuid(),
  nota_id        uuid not null references notas_fiscais(id) on delete cascade,
  produto_id     uuid references produtos(id) on delete set null,  -- null = ainda nao vinculado

  -- o que veio na nota, preservado como veio
  descricao      text not null,
  codigo_fornecedor text,
  ncm            text,
  cfop           text,
  ean            text,
  unidade        text not null default 'UND',
  quantidade     numeric(14,4) not null default 0 check (quantidade >= 0),
  valor_unitario numeric(14,6) not null default 0 check (valor_unitario >= 0),
  valor_desconto numeric(14,4) not null default 0,
  valor_total    numeric(16,4) not null default 0,

  -- conversao para a unidade do cadastro (CX com 12 UND -> fator 12)
  fator_conversao numeric(14,6) not null default 1 check (fator_conversao > 0),
  quantidade_convertida numeric(16,6)
    generated always as (round(quantidade * fator_conversao, 6)) stored,
  custo_convertido numeric(16,6)
    generated always as (case when quantidade * fator_conversao > 0
                              then round(valor_total / (quantidade * fator_conversao), 6)
                              else 0 end) stored,

  ordem          integer not null default 0
);

create index if not exists nota_itens_nota_idx    on nota_itens (nota_id);
create index if not exists nota_itens_produto_idx on nota_itens (produto_id);
create index if not exists nota_itens_pendentes_idx
  on nota_itens (nota_id) where produto_id is null;

-- ------------------------------------------------ de-para de descricoes ----
-- Aprende com o vinculo feito a mao: da proxima vez que "PICANHA BOV RESF KG"
-- chegar do mesmo fornecedor, o importador ja sabe qual produto e.
create table if not exists produto_apelidos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  produto_id     uuid not null references produtos(id) on delete cascade,
  fornecedor_id  uuid references fornecedores(id) on delete cascade,
  apelido        text not null,
  codigo_fornecedor text,
  fator_conversao numeric(14,6) not null default 1 check (fator_conversao > 0),
  unidade        text,
  usos           integer not null default 1,
  criado_em      timestamptz not null default now()
);

create unique index if not exists produto_apelidos_unico
  on produto_apelidos (restaurante_id, lower(mv_sem_acento(apelido)), coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Quando um item da nota e vinculado a um produto, o apelido fica registrado.
create or replace function mv_aprende_apelido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_restaurante uuid; v_fornecedor uuid;
begin
  if new.produto_id is null or new.produto_id is not distinct from old.produto_id then
    return new;
  end if;
  select n.restaurante_id, n.fornecedor_id into v_restaurante, v_fornecedor
    from notas_fiscais n where n.id = new.nota_id;

  insert into produto_apelidos (restaurante_id, produto_id, fornecedor_id, apelido,
                                codigo_fornecedor, fator_conversao, unidade)
  values (v_restaurante, new.produto_id, v_fornecedor, new.descricao,
          new.codigo_fornecedor, new.fator_conversao, new.unidade)
  on conflict (restaurante_id, lower(mv_sem_acento(apelido)),
               coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set produto_id = excluded.produto_id,
                fator_conversao = excluded.fator_conversao,
                usos = produto_apelidos.usos + 1;
  return new;
end $$;

drop trigger if exists t_nota_itens_apelido on nota_itens;
create trigger t_nota_itens_apelido
  after update of produto_id on nota_itens
  for each row execute function mv_aprende_apelido();

-- --------------------------------------- custo medio movel do produto ------
-- Toda nota lancada empurra o custo medio do produto. E o numero que a
-- proxima contagem vai usar para valorizar o estoque.
create or replace function mv_atualiza_custo_medio(p_nota uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update produtos p
     set custo_medio = i.custo_convertido,
         atualizado_em = now()
    from nota_itens i
   where i.nota_id = p_nota
     and i.produto_id = p.id
     and i.custo_convertido > 0;

  update produto_setores ps
     set custo = i.custo_convertido
    from nota_itens i
   where i.nota_id = p_nota
     and i.produto_id = ps.produto_id
     and i.custo_convertido > 0
     and ps.custo = 0;   -- so preenche setor sem custo proprio
end $$;

create or replace function mv_lancar_nota(p_nota uuid)
returns notas_fiscais
language plpgsql security invoker set search_path = public as $$
declare v_nota notas_fiscais; v_pendentes integer;
begin
  select count(*) into v_pendentes from nota_itens
   where nota_id = p_nota and produto_id is null;
  if v_pendentes > 0 then
    raise exception 'a nota tem % item(ns) sem produto vinculado', v_pendentes;
  end if;

  update notas_fiscais set status = 'lancada' where id = p_nota returning * into v_nota;
  if v_nota.id is null then raise exception 'nota % nao encontrada', p_nota; end if;

  perform mv_atualiza_custo_medio(p_nota);
  return v_nota;
end $$;

-- ------------------------------------------------------- lista de compras --
create table if not exists listas_compras (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  nome           text not null,
  referencia     date not null default current_date,
  status         status_lista not null default 'rascunho',
  observacao     text,
  total_estimado numeric(16,4) not null default 0,
  criado_por     uuid references perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists listas_compras_idx on listas_compras (restaurante_id, referencia desc);

create table if not exists lista_compras_itens (
  id          uuid primary key default gen_random_uuid(),
  lista_id    uuid not null references listas_compras(id) on delete cascade,
  produto_id  uuid not null references produtos(id) on delete cascade,
  setor_id    uuid references setores(id) on delete set null,
  quantidade  numeric(14,4) not null default 0 check (quantidade >= 0),
  unidade     text not null default 'UND',
  custo_estimado numeric(14,6) not null default 0,
  total_estimado numeric(16,4)
    generated always as (round(quantidade * custo_estimado, 4)) stored,
  comprado    boolean not null default false,
  observacao  text,
  unique (lista_id, produto_id)
);

create index if not exists lista_itens_lista_idx on lista_compras_itens (lista_id);

call mv_registra_touch('fornecedores');
call mv_registra_touch('notas_fiscais');
call mv_registra_touch('listas_compras');

-- Gera a folha de pedido com o cadastro inteiro (modulo 3.2), ja sugerindo a
-- quantidade que falta para o estoque minimo com base na ultima contagem.
create or replace function mv_gerar_lista_compras(
  p_restaurante uuid,
  p_nome        text default null,
  p_categorias  uuid[] default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_ultima uuid;
begin
  insert into listas_compras (restaurante_id, nome, criado_por)
  values (p_restaurante,
          coalesce(p_nome, 'Lista · ' || to_char(current_date, 'DD/MM/YYYY')),
          auth.uid())
  returning id into v_id;

  select id into v_ultima from contagens
   where restaurante_id = p_restaurante and status = 'fechada'
   order by referencia desc limit 1;

  insert into lista_compras_itens (lista_id, produto_id, unidade, custo_estimado, quantidade)
  select v_id, p.id, p.unidade, p.custo_medio,
         greatest(p.estoque_minimo - coalesce(
           (select sum(i.quantidade) from contagem_itens i
             where i.contagem_id = v_ultima and i.produto_id = p.id), 0), 0)
    from produtos p
   where p.restaurante_id = p_restaurante and p.ativo
     and (p_categorias is null or p.categoria_id = any (p_categorias));

  return v_id;
end $$;

-- ------------------------------------------------------------- historico ---
create or replace view vw_compras_historico as
select
  n.id, n.restaurante_id, n.emitida_em, n.recebida_em, n.numero, n.serie,
  n.origem, n.status, n.valor_total, n.chave_acesso, n.arquivo_url, n.criado_em,
  f.id as fornecedor_id, coalesce(f.nome, 'Sem fornecedor') as fornecedor_nome,
  (select count(*) from nota_itens i where i.nota_id = n.id)                        as itens,
  (select count(*) from nota_itens i where i.nota_id = n.id and i.produto_id is null) as itens_pendentes
from notas_fiscais n
left join fornecedores f on f.id = n.fornecedor_id;
