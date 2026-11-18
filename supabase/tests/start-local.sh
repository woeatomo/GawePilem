#!/usr/bin/env bash
# Postgres lokal tanpa Docker untuk dev/tes: terapkan stub auth + migrasi + seed.
# Pakai: bash supabase/tests/start-local.sh [dir] [port]   → mencetak DATABASE_URL
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DIR="${1:-/tmp/atomo-pg}"
PORT="${2:-55433}"
RUNAS=""; if [ "$(id -u)" = "0" ]; then RUNAS="runuser -u postgres --"; fi
if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR"; [ -n "$RUNAS" ] && chown postgres "$DIR"
  $RUNAS initdb -D "$DIR" -U postgres -A trust >/dev/null
fi
if ! $RUNAS pg_ctl -D "$DIR" status >/dev/null 2>&1; then
  $RUNAS pg_ctl -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=localhost" -l "$DIR/log" -w start >/dev/null
fi
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
if ! $PSQL -lqt | cut -d'|' -f1 | grep -qw app; then
  $PSQL -c "create database app" >/dev/null
  $PSQL -d app -f tests/auth_stub.sql >/dev/null
  for f in migrations/*.sql; do $PSQL -d app -f "$f" >/dev/null; done
  $PSQL -d app -f seed.sql >/dev/null
fi
echo "postgresql://postgres@localhost:$PORT/app"
