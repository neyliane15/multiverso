#!/usr/bin/env bash
# Sobe o Multiverso inteiro na máquina, sem Docker e sem projeto na nuvem.
#
#   Postgres  ← migrações + carga do Bar do Zeca + usuários de demonstração
#   PostgREST ← a mesma API REST que o Supabase serve, com a RLS valendo
#   portão    ← faz o papel do Kong + GoTrue (só a senha é de mentira)
#
# Uso: ferramentas/local/subir.sh    (depois: npm run dev)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BANCO="${BANCO:-multiverso_app}"
SOCK="${SOCK:-/home/pg/sock}"
PORTA_REST="${PORTA_REST:-54325}"
PORTA_PORTAO="${PORTA_PORTAO:-54321}"
SEGREDO="${JWT_SEGREDO:-segredo-local-do-multiverso-com-32-caracteres}"
TMP="${TMPDIR:-/tmp}/multiverso-local"
mkdir -p "$TMP"

command -v postgrest >/dev/null 2>&1 || {
  echo "postgrest não está no PATH. Baixe o binário estático de" >&2
  echo "https://github.com/PostgREST/postgrest/releases e ponha em /usr/local/bin." >&2
  exit 1
}

"$RAIZ/supabase/testes/preparar-postgres.sh" >/dev/null

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -q)
echo "→ banco $BANCO do zero"
# Uma execucao anterior pode ter deixado o PostgREST segurando conexoes, e o
# DROP DATABASE falha com qualquer sessao aberta. Derruba as sessoes primeiro.
"${PSQL[@]}" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$BANCO';" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $BANCO;" -c "create database $BANCO;" >/dev/null
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/supabase/testes/00_ambiente_supabase.sql" >/dev/null

for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done

# Todos os arquivos de carga, na ordem do nome. O 0002 depende do 0001 ter
# rodado, e nomear um a um aqui significaria esquecer o proximo.
for f in "$RAIZ"/supabase/seed/*.sql; do
  echo "→ carga $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" 2>&1 | grep -iE "seed Bar|setores do Bar" || true
done
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/ferramentas/local/preparar.sql" >/dev/null
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/ferramentas/local/usuarios.sql" 2>&1 | grep -i "usuarios locais" || true

cat > "$TMP/postgrest.conf" <<CONF
db-uri = "postgres://postgres@/$BANCO?host=$SOCK"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SEGREDO"
server-port = $PORTA_REST
server-host = "127.0.0.1"
db-pool = 10
CONF

# Derrubar por pidfile, e nao por `pkill -f`: o padrao de pkill casa com
# QUALQUER linha de comando que contenha o texto — inclusive a do shell que
# esta rodando este script, se ele o recebeu por heredoc. Ja aconteceu.
for arquivo in "$TMP/postgrest.pid" "$TMP/portao.pid"; do
  [ -f "$arquivo" ] && kill "$(cat "$arquivo")" 2>/dev/null || true
  rm -f "$arquivo"
done

# Esperar a porta soltar de verdade. `kill` so PEDE para o processo sair; subir
# o novo no mesmo instante fazia o PostgREST morrer com "Address in use" e o
# app inteiro responder 502 — com o script dizendo "no ar" logo abaixo.
for porta in "$PORTA_REST" "$PORTA_PORTAO"; do
  for _ in $(seq 1 40); do
    (exec 3<>"/dev/tcp/127.0.0.1/$porta") 2>/dev/null || break
    exec 3<&- 3>&-
    sleep 0.25
  done
done

postgrest "$TMP/postgrest.conf" > "$TMP/postgrest.log" 2>&1 &
echo $! > "$TMP/postgrest.pid"
JWT_SEGREDO="$SEGREDO" PORTA="$PORTA_PORTAO" POSTGREST="http://127.0.0.1:$PORTA_REST" \
  node "$RAIZ/ferramentas/local/portao.mjs" > "$TMP/portao.log" 2>&1 &
echo $! > "$TMP/portao.pid"

pronto=nao
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORTA_PORTAO/rest/v1/" >/dev/null 2>&1; then pronto=sim; break; fi
  sleep 0.5
done
if [ "$pronto" != sim ]; then
  echo "a API nao subiu. Fim do log do PostgREST:" >&2
  tail -5 "$TMP/postgrest.log" >&2
  exit 1
fi

cat > "$RAIZ/.env" <<ENV
# Gerado por ferramentas/local/subir.sh — ambiente local, não é projeto de verdade.
VITE_SUPABASE_URL=http://127.0.0.1:$PORTA_PORTAO
VITE_SUPABASE_ANON_KEY=anon-local-do-multiverso
ENV

echo
echo "no ar:"
echo "  API      http://127.0.0.1:$PORTA_PORTAO   (logs em $TMP)"
echo "  entrar   admin@bardozeca.com.br · master@multiverso.app · estoque@bardozeca.com.br"
echo "  senha    multiverso"
echo
echo "agora: npm run dev"
