# Atomo Film Studio

Web app untuk kreator yang membuat film & serial (microdrama, film pendek, dokumenter, iklan naratif) dengan AI, dari riset sampai publish ke YouTube. Satu saldo kredit untuk semua kategori AI, atau BYOK.

Spesifikasi lengkap ada di [CLAUDE.md](./CLAUDE.md).

## Isi repo

| Path | Isi |
| --- | --- |
| `apps/web` | Next.js 16 (App Router): UI 8 tahap produksi, Saldo & tarif, Provider AI, API route AI/render/publish |
| `apps/worker` | Worker BullMQ: reference image karakter, frame kunci, image-to-video, VO, render FFmpeg, upload YouTube, sapuan kredit hangus |
| `packages/credits` | Tarif, estimasi, budget cap, ledger FIFO 12 bulan (logika murni + tes) |
| `packages/ai-gateway` | Satu-satunya pintu ke provider AI: OpenCode Zen (teks), fal (gambar/video), ElevenLabs (VO), mock; BYOK AES-256-GCM, retry, fallback, output zod |
| `packages/prompt-engine` | Template per tahap × genre × format (A/B), konteks terpangkas, guardrail, variasi cerita, moderasi prefilter, parser naskah |
| `packages/timeline` | Skema timeline JSON, rakit otomatis, operasi edit, subtitle ASS karaoke, kompilasi ke FFmpeg |
| `packages/publisher` | YouTube Data API: OAuth, refresh token, upload resumable, label konten sintetis |
| `packages/db` | Tipe hasil generate Supabase, helper RPC kredit/job, kontrak antrean |
| `supabase/` | Migrasi SQL, RLS, RPC `charge_and_enqueue`, seed tarif, tes database |

## Menjalankan lokal

Butuh Node 22, pnpm 10, Docker (untuk Supabase lokal), Redis, dan FFmpeg.

```bash
pnpm install
cp .env.example .env            # isi kunci; biarkan AI_MOCK=1 untuk mencoba tanpa API key
supabase start                  # Supabase lokal (Docker), salin anon & service key ke .env
supabase db reset               # terapkan migrasi + seed tarif
openssl rand -base64 32         # → ENCRYPTION_KEY
redis-server &                  # antrean BullMQ
pnpm dev                        # web (http://localhost:3000) + worker
```

Dengan `AI_MOCK=1` dan `PAYMENTS_SANDBOX=1`, seluruh alur bisa dicoba tanpa biaya: daftar → top-up sandbox di **Saldo & tarif** → buat project → riset → karakter (reference image + kunci) → naskah → storyboard → render klip → VO → render MP4.

## Tes & pemeriksaan

```bash
pnpm test            # Vitest: kredit, gateway, prompt, timeline (termasuk render FFmpeg nyata), publisher, web
pnpm test:db         # migrasi + RLS + RPC kredit di Postgres sementara (tanpa Docker), termasuk uji konkurensi
pnpm lint && pnpm typecheck
pnpm build
bash scripts/gen-db-types.sh   # regenerate packages/db/src/database.types.ts dari migrasi
```

## Aturan uang (ringkas)

- Biaya dihitung ulang di server dari tabel `rates`; client mengirim `expectedTotal` dan ditolak bila tarif berubah.
- Potong saldo + buat job dalam satu transaksi (`charge_and_enqueue`); saldo negatif dicegah `CHECK (balance >= 0)`.
- `credit_ledger` append-only (trigger menolak UPDATE/DELETE/TRUNCATE). Gagal di provider → `job_fail` me-refund otomatis; sukses sebagian → `job_finish_partial` me-refund proporsional.
- Lot FIFO: kredit yang paling cepat hangus dipakai dulu, hangus 12 bulan sejak top-up (sapuan harian worker).
