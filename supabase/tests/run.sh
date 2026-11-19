#!/usr/bin/env bash
# Uji migrasi + RLS + RPC kredit di Postgres sementara (tanpa Docker).
# Pakai: pnpm test:db   (butuh binary postgres 15/16 di PATH atau /usr/lib/postgresql/*/bin)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUNAS=""
cleanup() { $RUNAS pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
if [ "$(id -u)" = "0" ]; then RUNAS="runuser -u postgres --"; chown postgres "$DIR"; else RUNAS=""; fi
$RUNAS initdb -D "$DIR" -U postgres -A trust >/dev/null
$RUNAS pg_ctl -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database app" >/dev/null
$PSQL -d app -f tests/auth_stub.sql >/dev/null
for f in migrations/*.sql; do $PSQL -d app -f "$f" >/dev/null; done
$PSQL -d app -f seed.sql >/dev/null
for t in tests/*.test.sql; do
  echo "▶ $t"
  $PSQL -d app -tA -f "$t" | grep -v '^$'
done

echo "▶ konkurensi: 8 charge paralel @100 kredit dari saldo 500"
U=$($PSQL -d app -tA -c "insert into auth.users (email) values ('race@test.id') returning id" | head -1)
WS=$($PSQL -d app -tA -c "select id from public.workspaces where owner_id = '$U'")
$PSQL -d app -c "select public.credit_topup('$U', 500, 'race-topup')" >/dev/null
for i in $(seq 1 8); do
  ( $PSQL -d app -c "select public.charge_and_enqueue('$U','$WS',null,null,'image','x','[{\"category\":\"image\",\"tier\":\"premium\",\"quantity\":10}]','{}','p','m','{}','race-$i',100)" >/dev/null 2>&1 || true ) &
done
wait
OK=$($PSQL -d app -tA -c "select count(*) from public.jobs where user_id = '$U'")
BAL=$($PSQL -d app -tA -c "select balance from public.credit_balances where user_id = '$U'")
SUM=$($PSQL -d app -tA -c "select sum(amount) from public.credit_ledger where user_id = '$U'")
echo "  job sukses=$OK saldo=$BAL sum_ledger=$SUM"
[ "$OK" = "5" ] && [ "$BAL" = "0" ] && [ "$SUM" = "0" ] || { echo "GAGAL: konkurensi"; exit 1; }
echo "✓ Semua tes database lulus"
