#!/usr/bin/env bash
# Alur utama end-to-end: daftar → top-up sandbox → riset → karakter → naskah → storyboard
# → klip video → VO → render MP4 → edit AI + render ulang.
# Prasyarat: supabase start, redis, `pnpm build && pnpm --filter @atomo/web start`, worker jalan,
# .env dengan AI_MOCK=1 dan PAYMENTS_SANDBOX=1.
set -euo pipefail
cd "$(dirname "$0")"
rm -f .out/state.json
for s in 01-signup 02-project-riset 04-karakter 05-naskah 06-storyboard 07-visual 08-audio-editor 09-edit 10-admin-secrets; do
  echo "▶ $s"
  node "$s.cjs"
done
echo "✓ Alur E2E selesai. Screenshot di e2e/.out/"
