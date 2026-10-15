#!/usr/bin/env bash
# Sobe um Postgres descartável para rodar a suíte de banco.
#
# Por que existe: as migrações do Multiverso dependem de RLS, de triggers e de
# funções SECURITY DEFINER. Nada disso se prova lendo SQL — é preciso um banco
# de verdade, com troca de usuário. Este script cria um cluster do zero, então
# pode ser rodado em máquina limpa e num container recém-criado.
#
# Uso: supabase/testes/preparar-postgres.sh   (idempotente)
set -euo pipefail

VERSAO="${PG_VERSAO:-16}"
BIN="/usr/lib/postgresql/$VERSAO/bin"
DONO="${PG_DONO:-pg}"
BASE="/home/$DONO"
DADOS="$BASE/pgdata"
SOCK="$BASE/sock"

[ -d "$BIN" ] || { echo "Postgres $VERSAO não encontrado em $BIN" >&2; exit 1; }

# O Postgres se recusa a rodar como root, daí o usuário dedicado.
id -u "$DONO" >/dev/null 2>&1 || useradd -m "$DONO"

comoDono() { su "$DONO" -c "PATH=$BIN:\$PATH $1"; }

subir() {
  mkdir -p "$SOCK"
  chown -R "$DONO" "$BASE"
  # listen_addresses vazio: só socket local. Este banco é de teste e não tem
  # por que aceitar conexão de rede.
  comoDono "pg_ctl -D $DADOS -o '-k $SOCK -c listen_addresses=' -l $DADOS/log start -w" >/dev/null
}

# TRÊS casos, e não dois. O `if/else` original tinha só "de pé" e "não de pé", e
# tratava o segundo com `rm -rf "$DADOS"` — o que fazia deste script, anunciado
# como idempotente, um apagador de banco.
#
# O caso que faltava é o do meio: **cluster parado com o diretório de dados
# intacto**. É um estado comum (a máquina reiniciou, alguém deu `pg_ctl stop`,
# o container foi pausado) e `pg_ctl status` devolve **3** nele, igual ao que
# devolve quando não existe cluster nenhum. O `if` só distinguia zero de
# não-zero, então os dois caminhos iam para o `else` e o diretório era apagado.
#
# Foi medido assim, num cluster descartável: com o `$DADOS` intacto e o servidor
# parado, `pg_ctl status` → `pg_ctl: no server running`, exit **3**. E foi
# encontrado assim de verdade, duas vezes nesta sessão — socket órfão e servidor
# fora do ar, com o banco de trabalho inteiro no diretório.
#
# O teste que separa o caso do meio é a existência do `PG_VERSION`: ele é o
# primeiro arquivo que o `initdb` escreve e o que o próprio Postgres usa para
# reconhecer um diretório como cluster. Se ele está lá, há um cluster — e um
# cluster se RELIGA, nunca se apaga.
if comoDono "pg_ctl -D $DADOS status" >/dev/null 2>&1; then
  echo "Postgres já está de pé em $SOCK"
elif [ -s "$DADOS/PG_VERSION" ]; then
  subir
  echo "Postgres $VERSAO religado em $SOCK (o cluster já existia e estava parado)"
else
  # Nenhum cluster aqui. Criar um é o caminho normal numa máquina limpa, e é o
  # único em que apagar faz sentido — mas o `rm -rf` continua atrás de uma
  # porta, porque um `$DADOS` que exista sem `PG_VERSION` pode ser qualquer
  # coisa (um diretório meio-criado, um ponto de montagem, um engano de
  # digitação em `PG_DONO`).
  if [ -e "$DADOS" ] && [ "${PG_APAGAR:-}" != "1" ]; then
    echo "ERRO: $DADOS existe mas não tem PG_VERSION — não parece um cluster." >&2
    echo "      Este script NÃO vai apagá-lo. Confira o diretório; se ele for" >&2
    echo "      descartável mesmo, rode de novo com PG_APAGAR=1." >&2
    exit 1
  fi
  rm -rf "$DADOS" "$SOCK"
  mkdir -p "$SOCK"
  chown -R "$DONO" "$BASE"
  comoDono "initdb -D $DADOS -U postgres --auth=trust" >/dev/null
  subir
  echo "Postgres $VERSAO no ar em $SOCK (cluster novo)"
fi

echo "$SOCK"
