#!/usr/bin/env bash
# Alur serial anime 16:9: preset anime → pipeline penuh → render master 16:9 → teaser 9:16.
set -euo pipefail
cd "$(dirname "$0")"
rm -f .out/state.json
for s in 01-signup 11-anime-project 04-karakter 05-naskah 06-storyboard 07-visual 08-audio-editor 12-teaser 14-paket-promo; do
  echo "▶ $s"
  node "$s.cjs"
done
echo "✓ Alur anime selesai. Screenshot di e2e/.out/"
