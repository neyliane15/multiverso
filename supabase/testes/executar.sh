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

# A carga inteira, na ordem do nome. Nao e cenario de teste: e a conferencia
# de que os arquivos de carga continuam aplicaveis contra o schema atual — o
# bloco final de cada um levanta excecao se a conta nao fechar.
if [ -z "${SEM_SEED:-}" ]; then
  for f in "$RAIZ"/supabase/seed/*.sql; do
    [ -e "$f" ] || continue
    echo "→ carga $(basename "$f")"
    "${PSQL[@]}" -d "$BANCO" -f "$f" >/dev/null
  done
fi

for f in "$RAIZ"/supabase/testes/[1-9]*.sql; do
  [ -e "$f" ] || continue
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d "$BANCO" -f "$f"
done
echo "tudo passou"
