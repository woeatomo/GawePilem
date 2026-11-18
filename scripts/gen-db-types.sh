#!/usr/bin/env bash
# Generate packages/db/src/database.types.ts dari migrasi (Postgres lokal tanpa Docker).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${DATABASE_URL:-$(bash supabase/tests/start-local.sh)}"
OUT=packages/db/src/database.types.ts
( cd /tmp && npx -y supabase@3 gen types typescript --remote "$URL" --schema public 2>/dev/null ) > "$OUT.tmp"
sed -n '/^export type Json/,$p' "$OUT.tmp" > "$OUT"; rm "$OUT.tmp"
npx prettier --write "$OUT" >/dev/null
echo "✓ $OUT"
