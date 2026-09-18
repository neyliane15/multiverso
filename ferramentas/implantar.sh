#!/usr/bin/env bash
# Coloca o Multiverso num projeto Supabase de verdade.
#
#   ferramentas/implantar.sh <referencia-do-projeto>
#
# A referência é o pedaço do meio da URL do painel:
#   https://supabase.com/dashboard/project/ABCDEFGHIJKLMNOPQRST
#                                          ^^^^^^^^^^^^^^^^^^^^
#
# O que este script faz, nesta ordem:
#   1. liga o repositório ao projeto        (supabase link)
#   2. aplica as 10 migrações               (supabase db push)
#   3. carrega o Bar do Zeca                (opcional, --com-carga)
#   4. publica a função que lê NFe          (supabase functions deploy)
#   5. confere o que ficou de pé
#
# É idempotente: rodar de novo não duplica nada.
set -euo pipefail

REF="${1:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COM_CARGA=0
for arg in "$@"; do [ "$arg" = "--com-carga" ] && COM_CARGA=1; done

if [ -z "$REF" ] || [ "$REF" = "--com-carga" ]; then
  echo "uso: ferramentas/implantar.sh <referencia-do-projeto> [--com-carga]" >&2
  echo "     a referencia esta na URL do painel do Supabase." >&2
  exit 1
fi

command -v supabase >/dev/null 2>&1 || {
  echo "A CLI do Supabase nao esta instalada." >&2
  echo "  npm i -g supabase     (ou brew install supabase/tap/supabase)" >&2
  exit 1
}

cd "$RAIZ"

echo "→ ligando ao projeto $REF"
# Pede a senha do banco se ela nao estiver em SUPABASE_DB_PASSWORD.
supabase link --project-ref "$REF"

echo "→ aplicando as migracoes"
supabase db push

if [ "$COM_CARGA" = "1" ]; then
  echo "→ carregando o Bar do Zeca (854 produtos)"
  # A carga confere o total e aborta a transacao inteira se nao bater.
  supabase db push --include-seed 2>/dev/null \
    || psql "$(supabase status -o env 2>/dev/null | grep DB_URL | cut -d= -f2- | tr -d '"')" \
            -v ON_ERROR_STOP=1 -f supabase/seed/0001_bar_do_zeca.sql
fi

echo "→ preparando a funcao de NFe"
node ferramentas/preparar-funcao.mjs

echo "→ publicando a funcao"
supabase functions deploy importar-nfe --project-ref "$REF"

echo
echo "pronto. falta o que so voce pode fazer:"
echo
echo "  1. No painel, em Settings → API, copie a URL e a anon key para o .env:"
echo "       VITE_SUPABASE_URL=https://$REF.supabase.co"
echo "       VITE_SUPABASE_ANON_KEY=..."
echo
echo "  2. No SQL Editor, crie o convite do primeiro master:"
echo "       select mv_semear_master('voce@seudominio.com.br', 'Seu Nome');"
echo
echo "  3. Em Authentication → Users → Add user, crie a conta com ESSE mesmo"
echo "     e-mail. O convite decide o papel; o cadastro nao decide nada."
echo
echo "  4. npm run build && npm run preview   (ou publique a pasta dist/)"
