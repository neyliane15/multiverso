-- ---------------------------------------------------------------------------
-- Quanto o banco está crescendo, e o que isso projeta
--
-- Cole UMA consulta de cada vez no SQL Editor do Supabase e rode. Nenhuma
-- delas escreve nada: são todas de leitura.
--
-- Para que serve: com mais clientes entrando, a pergunta "o Supabase aguenta?"
-- deixa de ser palpite e vira medição. O que decide o plano não é a quantidade
-- de restaurantes — é disco, arquivo e processamento. Estas cinco consultas
-- mostram os dois primeiros com números do seu banco, e a quinta projeta.
--
-- Rode a cada mês ou dois, e guarde o resultado. Duas medições distantes
-- valem mais que qualquer estimativa minha.
-- ---------------------------------------------------------------------------


-- 1 ───────────────────────────────────────── tamanho de cada tabela, e o total
-- "total" inclui os índices, que costumam pesar tanto quanto os dados.
select
  c.relname                                            as tabela,
  pg_size_pretty(pg_total_relation_size(c.oid))        as total,
  pg_size_pretty(pg_relation_size(c.oid))              as so_os_dados,
  pg_size_pretty(pg_indexes_size(c.oid))               as so_os_indices
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and pg_total_relation_size(c.oid) > 0
order by pg_total_relation_size(c.oid) desc
limit 20;

-- ...e o banco inteiro, numa linha só:
-- select pg_size_pretty(pg_database_size(current_database())) as banco_inteiro;


-- 2 ──────────────────────────────────────────────── quanto cada cliente ocupa
-- A conta que importa quando chegar o décimo, o quinquagésimo, o centésimo
-- cliente: quanto UM restaurante custa em linhas.
select
  r.nome                                                              as restaurante,
  (select count(*) from produtos p where p.restaurante_id = r.id)     as produtos,
  (select count(*) from produto_setores ps
     join produtos p on p.id = ps.produto_id
    where p.restaurante_id = r.id)                                    as vinculos_de_setor,
  (select count(*) from contagens ct where ct.restaurante_id = r.id)  as contagens,
  (select count(*) from contagem_itens i
     join contagens ct on ct.id = i.contagem_id
    where ct.restaurante_id = r.id)                                   as linhas_de_contagem,
  (select count(*) from notas_fiscais nf where nf.restaurante_id = r.id) as notas,
  (select count(*) from nota_itens ni
     join notas_fiscais nf on nf.id = ni.nota_id
    where nf.restaurante_id = r.id)                                   as itens_de_nota
from restaurantes r
order by 1;


-- 3 ───────────────────────────────────────────────────── o ritmo do crescimento
-- Linhas de contagem e notas por mês. É daqui que sai a inclinação da curva —
-- e duas medições com dois meses de distância valem mais que qualquer chute.
select
  to_char(ct.criado_em, 'YYYY-MM')                     as mes,
  count(distinct ct.id)                                as contagens_abertas,
  count(i.id)                                          as linhas_de_contagem,
  pg_size_pretty((count(i.id) * 406)::bigint)          as tamanho_estimado
from contagens ct
left join contagem_itens i on i.contagem_id = ct.id
group by 1
order by 1 desc
limit 24;


-- 4 ─────────────────────────────────────── os arquivos (XML e PDF de nota, logos)
-- O Storage cresce mais rápido que o banco e quase ninguém olha. O XML é o que
-- o sistema lê; o PDF é só cópia para conferência, e é ele que pesa.
--
-- O `to_jsonb` no meio não é firula: o ambiente de teste local não tem a
-- coluna `metadata`, e ler por dentro do jsonb devolve nulo em vez de quebrar.
select
  o.bucket_id                                          as bucket,
  count(*)                                             as arquivos,
  pg_size_pretty(
    coalesce(sum((((to_jsonb(o) -> 'metadata') ->> 'size'))::bigint), 0)
  )                                                    as tamanho
from storage.objects o
group by 1
order by 2 desc;


-- 5 ─────────────────────────────────────────────────────────────── a projeção
-- Pega o que UM restaurante ocupa hoje e responde: e com N clientes?
-- Troque os dois números da primeira linha e rode de novo.
with premissas as (
  select 200 as clientes, 52 as contagens_por_ano
),
medido as (
  select
    -- catálogo: produtos + vínculos + categorias + setores + estoques
    (pg_total_relation_size('produtos')
     + pg_total_relation_size('produto_setores')
     + pg_total_relation_size('categorias')
     + pg_total_relation_size('setores')
     + pg_total_relation_size('estoques'))::numeric
      / greatest((select count(*) from restaurantes), 1)          as catalogo_por_cliente,
    -- uma contagem: o custo médio de uma folha fechada
    coalesce(
      pg_total_relation_size('contagem_itens')::numeric
        / nullif((select count(*) from contagens), 0), 0)         as uma_contagem
)
select
  p.clientes,
  p.contagens_por_ano,
  pg_size_pretty((m.catalogo_por_cliente)::bigint)                as catalogo_de_1_cliente,
  pg_size_pretty((m.uma_contagem)::bigint)                        as custo_de_1_contagem,
  pg_size_pretty((m.catalogo_por_cliente * p.clientes)::bigint)   as catalogo_de_todos,
  pg_size_pretty(
    (m.uma_contagem * p.contagens_por_ano * p.clientes)::bigint)  as contagens_por_ano_todos,
  pg_size_pretty(
    (m.catalogo_por_cliente * p.clientes
     + m.uma_contagem * p.contagens_por_ano * p.clientes * 5)::bigint) as em_5_anos
from premissas p, medido m;
