-- Ajustes que so fazem sentido no ambiente local, aplicados depois das
-- migracoes: o PostgREST precisa enxergar os papeis e trocar para eles.
grant anon, authenticated to postgres;
grant usage on schema public to anon;
grant select on restaurantes to anon;   -- a tela de login mostra a marca antes da sessao

-- PostgREST assume este papel quando a requisicao chega sem token.
alter role anon set statement_timeout = '10s';
alter role authenticated set statement_timeout = '30s';
