#!/usr/bin/env bash
# Aplica as migracoes num Postgres local e roda a suite de testes de banco.
# Uso: supabase/testes/executar.sh [socket]
set -euo pipefail
SOCK="${1:-/home/pg/sock}"
BANCO="${BANCO:-multiverso}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists $BANCO;" -c "create database $BANCO;" >/dev/null
"${PSQL[@]}" -d "$BANCO" -f "$RAIZ/supabase/testes/00_ambiente_supabase.sql" >/dev/null

for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
done

if [ -z "${SEM_SEED:-}" ] && [ -f "$RAIZ/supabase/seed/0001_bar_do_zeca.sql" ]; then
  echo "→ carga do Bar do Zeca"
  "${PSQL[@]}" -d "$BANCO" -f "$RAIZ/supabase/seed/0001_bar_do_zeca.sql" >/dev/null
fi

for f in "$RAIZ"/supabase/testes/[1-9]*.sql; do
  [ -e "$f" ] || continue
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f"
done
echo "tudo passou"
