-- ---------------------------------------------------------------------------
-- 0020 · A data da contagem se corrige, e a contagem se apaga
--
-- Duas coisas que so aparecem com o sistema em uso de verdade:
--
-- 1. **A referencia envelhece.** A contagem e uma FOTO do estoque, e a data
--    dela e o dia dessa foto. So que ela e escolhida na hora de abrir — e uma
--    contagem aberta na segunda e contada na quinta ficava carimbada com
--    segunda. O numero vai para o CMV com a data errada, e o CMV e a conta que
--    o dono usa para decidir preco.
--
-- 2. **Contagem de teste nao deveria virar historico.** Quem esta aprendendo o
--    sistema abre duas ou tres para experimentar. Sem uma saida, elas ficam
--    para sempre no historico, atrapalhando a comparacao entre periodos.
--
-- Nos dois casos a permissao e estreita de proposito: mudar a data mexe em
-- CMV, e apagar destroi historico.
-- ---------------------------------------------------------------------------

/**
 * Muda a data de referencia de uma contagem ABERTA.
 *
 * So aberta: a fechada ja virou numero no CMV do periodo, e mexer na data dela
 * moveria dinheiro de um mes para outro sem que ninguem visse. Para corrigir
 * uma fechada, reabre-se primeiro — e isso fica registrado.
 *
 * O titulo acompanha quando era o automatico. Se alguem deu um nome proprio a
 * contagem ("Contagem do inventario anual"), esse nome fica: era escolha de
 * gente, e nao um rotulo gerado.
 */
create or replace function mv_mudar_referencia(p_contagem uuid, p_referencia date)
returns contagens
language plpgsql security invoker set search_path = public as $$
declare v_linha contagens; v_titulo_velho text;
begin
  select * into v_linha from contagens where id = p_contagem;
  if not found then raise exception 'contagem nao encontrada'; end if;
  if not mv_pode_administrar(v_linha.restaurante_id) then
    raise exception 'so quem administra o restaurante muda a data da contagem';
  end if;
  if v_linha.status <> 'aberta' then
    raise exception 'contagem % nao esta aberta; reabra antes de mudar a data', v_linha.status;
  end if;
  if p_referencia is null then raise exception 'a data nao pode ser vazia'; end if;

  v_titulo_velho := initcap(v_linha.tipo::text) || ' · ' ||
                    to_char(v_linha.referencia, 'DD/MM/YYYY');

  update contagens
     set referencia = p_referencia,
         titulo = case when titulo = v_titulo_velho or titulo is null
                       then initcap(tipo::text) || ' · ' || to_char(p_referencia, 'DD/MM/YYYY')
                       else titulo end
   where id = p_contagem
  returning * into v_linha;
  return v_linha;
end $$;

grant execute on function mv_mudar_referencia(uuid, date) to authenticated;

-- ----------------------------------------------------------- apagar e de --
-- master e admin, e nao de quem administra.
--
-- `mv_pode_administrar` inclui gerente — ela cobre o CADASTRO do restaurante.
-- Apagar contagem destroi historico e muda o CMV de um periodo inteiro; e da
-- mesma familia de equipe e identidade, que a 0014 ja tinha separado.
drop policy if exists contagens_apagar on contagens;
create policy contagens_apagar on contagens for delete to authenticated
  using (mv_eh_master()
         or (mv_papel_atual() = 'admin' and restaurante_id = mv_restaurante_atual()));
