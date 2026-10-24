-- ===========================================================================
-- 0028 · A venda que aponta direto para o insumo passa a CONVERTER a unidade
--
-- A 0027 abriu o alvo 'produto' — a garrafa fechada, vendida inteira, sem
-- ficha no meio — e somou a quantidade do PDV direto na do insumo:
--
--     select vi.produto_id, vi.quantidade, false, null::text
--       from venda_itens vi where vi.alvo = 'produto'
--
-- O laudo dela chama isso de "o ponto mais fragil da migracao", e esta certo.
-- Duas coisas estao erradas aqui, e a segunda e pior que a primeira.
--
-- 1 ------------------------------------------- a unidade do PDV ia para o lixo
--
-- A planilha do PDV TEM coluna de unidade, e ela nao e sempre a mesma: no
-- arquivo de setembro de 2026 sao 11.144 linhas em UN e **54 em KG** — a
-- BATATA FRITA, R$ 2.463,67 em 59 KG. `venda_itens` nao tinha coluna de
-- unidade, entao o importador lia a coluna, mostrava na previa e jogava fora.
-- Depois disso nao havia mais como converter: o dado nao existia no banco.
--
-- 2 ------------------------------- e a conta saia errada SEM AVISAR NINGUEM
--
-- Enquanto o catalogo contar o mesmo item na mesma unidade, 1 = 1 e ninguem
-- percebe. Mas o relatorio da 0023 compara VENDA com CONTAGEM e com COMPRA, e
-- esses dois ja convertem: `mv_relatorio_de_contagem` chama
-- `mv_fator_para_produto` na contagem, e `nota_itens.quantidade_convertida`
-- chega pronta da 0004. So a venda nao convertia. Resultado, no dia em que a
-- casa vincular a BATATA FRITA a um insumo contado em UND: 59 KG vendidos
-- entram como 59 UNIDADES consumidas, e a caixa "DIFERENCA" — que e
-- `vendas - consumo` — mente na mesma proporcao, com cara de medida.
--
-- `mv_fator_para_produto` (0017) e exatamente esta conversao, e ela ja sabe os
-- dois caminhos: mesma familia (KG para G) e pela embalagem (KG para o saco de
-- 5 KG). Quando nao da, ela devolve NULO — e nulo aqui significa "a tela
-- precisa perguntar", nunca 1. A linha sai marcada com o motivo, do mesmo jeito
-- que a contagem lancada em unidade incompativel sai marcada desde a 0023.
-- Chutar 1 e o que a 0017 chama de "por 60 garrafas de cachaca numa caipirinha".
--
-- Repare no que NAO muda: o alvo 'ficha' continua sem unidade nenhuma, porque
-- ali a quantidade e "quantas vezes o prato saiu" e quem sabe de unidade e a
-- receita. A unidade existe para a linha que aponta para o insumo.
-- ===========================================================================

-- 1 ------------------------------------------- a unidade que o PDV vendeu ----
alter table venda_itens
  add column if not exists unidade text;

comment on column venda_itens.unidade is
  'A unidade em que o PDV vendeu esta linha (KG, UN...). Nulo = a unidade de compra do insumo, que e o caso do lancamento feito a mao.';

-- 2 ------------------------------------- a explosao, agora com conversao ----
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
    -- A ficha explode pela arvore (0023), que ja converte item por item.
    select x.produto_id, vi.quantidade * x.quantidade as qtd, x.fator_ausente, x.motivo
      from venda_itens vi
      cross join lateral mv_produtos_da_ficha(vi.ficha_id) x
     where vi.venda_id = p_venda and vi.alvo = 'ficha'
    union all
    -- O insumo direto: a quantidade do PDV na unidade do PDV, convertida para a
    -- unidade de compra do cadastro. Sem unidade dita (lancamento da mao), a
    -- unidade do proprio insumo — que e o que "sem unidade" sempre significou.
    select vi.produto_id,
           vi.quantidade * coalesce(f.fator, 0),
           f.fator is null,
           case when f.fator is null then
             format('a venda lancou "%s" em %s, que nao converte para %s do cadastro',
                    coalesce(vi.descricao_origem, pr.nome), vi.unidade, pr.unidade)
           end
      from venda_itens vi
      join produtos pr on pr.id = vi.produto_id
      cross join lateral (
        select mv_fator_para_produto(coalesce(vi.unidade, pr.unidade), vi.produto_id) as fator
      ) f
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
  'Explode um lancamento em insumos do catalogo: pela arvore da ficha, direto no produto (convertendo a unidade), e sem nada no servico.';

grant execute on function mv_vendas_por_produto(uuid) to authenticated;

-- 3 ------------------------- a fusao nao soma quantidade de unidade diferente -
-- `mv_resolver_item_de_venda` funde duas linhas do mesmo alvo somando
-- quantidade, dinheiro e linhas de cupom. Com a unidade na linha, somar KG com
-- UN deixou de ser uma soma: sao duas medidas de coisas diferentes. Recusar e
-- a mesma escolha que a 0027 fez para a linha pendente — incomodo visivel em
-- vez de numero falso.
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
    if coalesce(upper(btrim(v_irmao.unidade)), '') <> coalesce(upper(btrim(v_item.unidade)), '') then
      raise exception
        'as duas linhas estao em unidades diferentes (% e %): somar % com % nao da quantidade nenhuma. Confira o cadastro antes de juntar.',
        coalesce(v_irmao.unidade, 'sem unidade'), coalesce(v_item.unidade, 'sem unidade'),
        v_irmao.descricao_origem, v_item.descricao_origem;
    end if;
    v_qtd   := v_irmao.quantidade + v_item.quantidade;
    v_valor := coalesce(v_irmao.valor_total_origem, v_irmao.total)
             + coalesce(v_item.valor_total_origem,  v_item.total);
    update venda_itens
       set quantidade         = v_qtd,
           preco_unitario     = case when v_qtd > 0 then round(v_valor / v_qtd, 4) else 0 end,
           valor_total_origem = v_valor,
           linhas_de_origem   = coalesce(v_irmao.linhas_de_origem, 0)
                              + coalesce(v_item.linhas_de_origem, 0),
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
  'Resolve uma linha de venda, fundindo-a com a linha do mesmo alvo quando ela ja existe no lancamento — e recusando fundir unidades diferentes.';

grant execute on function mv_resolver_item_de_venda(uuid, alvo_de_venda, uuid, uuid)
  to authenticated;
