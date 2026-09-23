#!/usr/bin/env bash
# Serve o `dist` na porta 4173, derrubando a previa anterior primeiro.
#
# Por que existe: `vite preview` nao falha quando a porta esta ocupada — ele
# avisa numa linha e sobe em 4174, 4175... A previa ANTIGA continua respondendo
# em 4173, com o bundle antigo. Quem testa no endereco de sempre passa a testar
# codigo velho sem nenhum sinal disso. Aconteceu: nove previas acumuladas, e as
# verificacoes de navegador rodando contra um build de duas mudancas atras.
#
# Uso: ferramentas/local/previa.sh [porta]
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORTA="${1:-4173}"
TMP="${TMPDIR:-/tmp}/multiverso-local"
mkdir -p "$TMP"
PID="$TMP/previa.pid"

[ -f "$PID" ] && kill "$(cat "$PID")" 2>/dev/null || true
rm -f "$PID"

# O pidfile guarda o PID do `npx`, e o `vite` de verdade e filho dele: matar o
# pai deixa o filho segurando a porta. Entao o alvo e quem ESCUTA a porta.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "$PORTA/tcp" 2>/dev/null || true
fi

# Espera a porta soltar: matar so PEDE para sair.
for _ in $(seq 1 40); do
  (exec 3<>"/dev/tcp/127.0.0.1/$PORTA") 2>/dev/null || break
  exec 3<&- 3>&-
  sleep 0.25
done

if (exec 3<>"/dev/tcp/127.0.0.1/$PORTA") 2>/dev/null; then
  exec 3<&- 3>&-
  echo "a porta $PORTA continua ocupada por outra coisa. Derrube-a antes." >&2
  exit 1
fi

cd "$RAIZ"
npx vite preview --port "$PORTA" --strictPort --host 127.0.0.1 > "$TMP/previa.log" 2>&1 &
echo $! > "$PID"

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORTA/" >/dev/null 2>&1; then
    echo "previa no ar em http://127.0.0.1:$PORTA (log em $TMP/previa.log)"
    exit 0
  fi
  sleep 0.5
done

echo "a previa nao subiu. Fim do log:" >&2
tail -5 "$TMP/previa.log" >&2
exit 1
