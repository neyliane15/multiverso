-- ---------------------------------------------------------------------------
-- 0014 · Convite e coisa de admin, tambem para editar e apagar
--
-- A 0010 deixou a regra escrita no proprio comentario de mv_pode_administrar:
-- ela cobre o CADASTRO do restaurante, e "NAO cobre identidade visual nem
-- equipe — essas exigem admin". As politicas de leitura e de criacao de
-- convites obedeciam (`mv_papel_atual() in ('master','admin')`). As de UPDATE
-- e DELETE, nao: usavam mv_pode_administrar sozinha, que inclui gerente.
--
-- O furo nao era teorico. Um gerente nao enxerga convite nenhum — a politica
-- de SELECT barra — e por isso um `update ... where email = '...'` devolvia
-- zero linhas: o Postgres aplica a politica de SELECT quando a clausula WHERE
-- le colunas da tabela. Mas SEM clausula WHERE nao ha coluna para ler, e a
-- politica de SELECT sai de cena. Medido neste banco:
--
--   update convites set papel = 'admin';   -> UPDATE 1
--   delete from convites;                  -> DELETE 4
--
-- Ou seja: o gerente promovia a admin um convite pendente que ele nem podia
-- ver — e a pessoa convidada entrava acima dele — e podia varrer os convites
-- do restaurante, inclusive os JA ACEITOS, que sao o registro de como cada um
-- entrou no sistema.
--
-- Duas regras passam a valer aqui:
--
--   1. mexer em convite exige master ou admin, em TODAS as operacoes;
--   2. convite aceito e historico: ninguem edita nem apaga. Quem entrou,
--      entrou, e a linha diz por qual porta.
-- ---------------------------------------------------------------------------

drop policy if exists convites_editar on convites;
create policy convites_editar on convites for update to authenticated
  using (
    aceito_em is null
    and (mv_eh_master()
         or (mv_pode_administrar(restaurante_id) and mv_papel_atual() = 'admin'))
  )
  with check (
    (papel = 'master' and mv_eh_master())
    or (papel <> 'master'
        and mv_pode_administrar(restaurante_id)
        and mv_papel_atual() in ('master', 'admin'))
  );

drop policy if exists convites_apagar on convites;
create policy convites_apagar on convites for delete to authenticated
  using (
    -- Sem o `aceito_em is null`, um `delete from convites` apagava o registro
    -- de quem ja entrou. E o unico lugar que guarda com que papel a pessoa foi
    -- admitida e quem a admitiu.
    aceito_em is null
    and (mv_eh_master()
         or (mv_pode_administrar(restaurante_id) and mv_papel_atual() = 'admin'))
  );

comment on table convites is
  'Quem pode entrar, com que papel e em qual restaurante. Ler, criar, editar e apagar exigem master ou admin — gerente nao mexe em equipe. Convite aceito e historico: imutavel.';
