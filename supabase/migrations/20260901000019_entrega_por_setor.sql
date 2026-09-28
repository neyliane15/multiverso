-- ---------------------------------------------------------------------------
-- 0019 · A entrega da contagem, setor por setor
--
-- Quem conta o bar termina o bar — nao a contagem da casa. Fechar a contagem
-- continua sendo decisao de quem enxerga tudo, porque fechar congela o CMV do
-- periodo. O que faltava era o passo do meio: "terminei o meu setor".
--
-- Tres decisoes que valem o comentario:
--
-- 1. **Zero e uma resposta; vazio nao e.** Um item sem quantidade pode
--    significar "acabou" ou "esqueci", e a diferenca entre os dois e um CMV
--    errado. A entrega exige que TODA linha do setor tenha sido respondida —
--    inclusive com zero. A regra mora aqui, e nao so na tela, porque tela se
--    contorna e conta de estoque nao.
--
-- 2. **Entregue congela; recontagem destrava.** Depois de entregue, a linha
--    daquele setor nao muda mais: se mudasse em silencio, a entrega nao valeria
--    nada. Quem contou errado pede recontagem — e isso fica registrado, com
--    hora, em vez de virar uma correcao invisivel.
--
-- 3. **A entrega nao fecha a contagem.** Ela diz "o meu esta pronto". O
--    gerente ve quais setores ja entregaram e fecha quando quiser. Um setor
--    que entregou antes nao trava o outro que ainda esta contando.
-- ---------------------------------------------------------------------------

create table if not exists contagem_setores (
  contagem_id  uuid not null references contagens(id) on delete cascade,
  setor_id     uuid not null references setores(id)   on delete cascade,
  entregue_em  timestamptz not null default now(),
  entregue_por uuid references perfis(id) on delete set null,
  -- Retrato do que foi entregue: quantas linhas e quanto dinheiro. Guardar
  -- aqui e de proposito — se a folha mudar depois, ainda se sabe o que a
  -- pessoa afirmou na hora em que assinou.
  itens        integer not null default 0,
  total        numeric(16,4) not null default 0,
  primary key (contagem_id, setor_id)
);

create index if not exists contagem_setores_setor_idx on contagem_setores (setor_id);

comment on table contagem_setores is
  'Quem terminou de contar qual setor, e quando. Nao fecha a contagem.';

alter table contagem_setores enable row level security;

drop policy if exists contagem_setores_ler on contagem_setores;
create policy contagem_setores_ler on contagem_setores for select to authenticated
  using (mv_pode_ver_setor(setor_id)
         and exists (select 1 from contagens c
                      where c.id = contagem_setores.contagem_id
                        and mv_pode_operar(c.restaurante_id)));

drop policy if exists contagem_setores_mexer on contagem_setores;
create policy contagem_setores_mexer on contagem_setores for all to authenticated
  using (mv_pode_ver_setor(setor_id)
         and exists (select 1 from contagens c
                      where c.id = contagem_setores.contagem_id
                        and mv_pode_operar(c.restaurante_id)))
  with check (mv_pode_ver_setor(setor_id)
              and exists (select 1 from contagens c
                           where c.id = contagem_setores.contagem_id
                             and mv_pode_operar(c.restaurante_id)));

grant select, insert, update, delete on contagem_setores to authenticated;

-- ------------------------------------------------------ entregue congela ---
create or replace function mv_setor_entregue()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from contagem_setores cs
              where cs.contagem_id = new.contagem_id and cs.setor_id = new.setor_id) then
    raise exception
      'este setor ja foi entregue; peca recontagem antes de mudar a quantidade';
  end if;
  return new;
end $$;

drop trigger if exists t_contagem_itens_entregue on contagem_itens;
create trigger t_contagem_itens_entregue
  before update of quantidade, custo_unitario, unidade on contagem_itens
  for each row execute function mv_setor_entregue();

-- ------------------------------------------------------------- as chamadas -
/**
 * Marca como zero tudo o que ainda nao foi respondido naquele setor.
 *
 * O atalho do fim da contagem: "o resto acabou". Devolve quantas linhas
 * carimbou, e a tela mostra esse numero ANTES — zerar duzentos itens sem ler
 * quantos sao seria assinar embaixo sem olhar.
 */
create or replace function mv_zerar_pendentes(p_contagem uuid, p_setor uuid)
returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update contagem_itens
     set quantidade = 0, contado_em = now()
   where contagem_id = p_contagem and setor_id = p_setor and contado_em is null;
  get diagnostics n = row_count;
  return n;
end $$;

/**
 * Entrega o setor. Recusa enquanto houver linha sem resposta.
 *
 * A mensagem diz QUANTAS faltam porque e o que a pessoa precisa saber para
 * agir — "faltam itens" manda procurar no escuro.
 */
create or replace function mv_entregar_setor(p_contagem uuid, p_setor uuid)
returns contagem_setores
language plpgsql security invoker set search_path = public as $$
declare v_pendentes integer; v_itens integer; v_total numeric; v_linha contagem_setores;
begin
  if not exists (select 1 from contagens c where c.id = p_contagem and c.status = 'aberta') then
    raise exception 'esta contagem nao esta aberta';
  end if;

  select count(*) filter (where contado_em is null), count(*), coalesce(sum(total), 0)
    into v_pendentes, v_itens, v_total
    from contagem_itens
   where contagem_id = p_contagem and setor_id = p_setor;

  if v_itens = 0 then
    raise exception 'este setor nao tem linha nenhuma nesta contagem';
  end if;
  if v_pendentes > 0 then
    raise exception
      'faltam % % sem resposta neste setor; zero tambem e resposta',
      v_pendentes, case when v_pendentes = 1 then 'item' else 'itens' end;
  end if;

  insert into contagem_setores (contagem_id, setor_id, entregue_por, itens, total)
  values (p_contagem, p_setor, auth.uid(), v_itens, v_total)
  on conflict (contagem_id, setor_id)
    do update set entregue_em = now(), entregue_por = auth.uid(),
                  itens = excluded.itens, total = excluded.total
  returning * into v_linha;
  return v_linha;
end $$;

/** Destrava o setor para recontagem. Some o registro da entrega anterior. */
create or replace function mv_recontar_setor(p_contagem uuid, p_setor uuid)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from contagens c where c.id = p_contagem and c.status = 'aberta') then
    raise exception 'esta contagem nao esta aberta';
  end if;
  delete from contagem_setores
   where contagem_id = p_contagem and setor_id = p_setor;
end $$;

grant execute on function mv_zerar_pendentes(uuid, uuid)  to authenticated;
grant execute on function mv_entregar_setor(uuid, uuid)   to authenticated;
grant execute on function mv_recontar_setor(uuid, uuid)   to authenticated;

-- ------------------------------------------------------------------ vistas -
-- O andamento de cada setor numa contagem: o que o gerente olha para saber se
-- ja pode fechar, e o que o operador olha para saber se ja entregou.
drop view if exists vw_entrega_por_setor;
create view vw_entrega_por_setor as
select
  i.contagem_id,
  c.restaurante_id,
  s.id                                                   as setor_id,
  s.nome                                                 as setor_nome,
  s.cor                                                  as setor_cor,
  s.ordem                                                as setor_ordem,
  count(*)                                               as itens,
  count(*) filter (where i.contado_em is not null)       as respondidos,
  count(*) filter (where i.contado_em is null)           as pendentes,
  coalesce(sum(i.total), 0)                              as total,
  cs.entregue_em,
  (select nome from perfis p where p.id = cs.entregue_por) as entregue_por_nome
from contagem_itens i
join contagens c on c.id = i.contagem_id
join setores   s on s.id = i.setor_id
left join contagem_setores cs
       on cs.contagem_id = i.contagem_id and cs.setor_id = i.setor_id
group by i.contagem_id, c.restaurante_id, s.id, s.nome, s.cor, s.ordem,
         cs.entregue_em, cs.entregue_por;

alter view vw_entrega_por_setor set (security_invoker = on);
grant select on vw_entrega_por_setor to authenticated;

-- O historico do operador de setor mostra o total DELE, e nao o da casa.
-- `c.total` e o numero congelado da contagem inteira; para quem so enxerga um
-- setor, ele seria um valor que a pessoa nao tem como explicar.
create or replace view vw_contagens_resumo as
select
  c.id, c.restaurante_id, c.referencia, c.tipo, c.status, c.titulo,
  c.criado_em, c.fechada_em,
  case when c.status = 'fechada' and not mv_restrito_a_setores() then c.total
       else (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id)
  end as total,
  (select count(*) from contagem_itens i where i.contagem_id = c.id)                    as itens_total,
  (select count(*) from contagem_itens i where i.contagem_id = c.id and i.quantidade > 0) as itens_preenchidos,
  (select nome from perfis where id = c.criado_por)  as criado_por_nome,
  (select nome from perfis where id = c.fechado_por) as fechado_por_nome
from contagens c;

alter view vw_contagens_resumo set (security_invoker = on);
grant select on vw_contagens_resumo to authenticated;
