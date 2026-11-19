# Deploy: serverless penuh (Cloudflare + Supabase + provider)

```
Browser ──► Worker "atomo-film-studio" (web Next.js, OpenNext)
               │  Supabase (auth, data, RPC kredit)  ◄──────────────┐
               │  POST /enqueue (Bearer WORKER_TOKEN)                │
               ▼                                                     │
            Worker "atomo-jobs" ── Cloudflare Queue "atomo-jobs" ◄───┤ (pesan tertunda untuk menunggu hasil)
               │   ├─ teks/gambar/video/VO → OpenCode Zen, fal.ai, ElevenLabs
               │   ├─ render MP4 & teaser   → Rendi (FFmpeg cloud)
               │   └─ cron harian           → kredit hangus
               ▼
            R2 "atomo-media" (wajah karakter, frame, klip, VO, MP4) ── domain publik media
```

Tidak ada server yang perlu dirawat: tanpa VPS, tanpa Redis. Semua model AI dan render berjalan di provider.

| Komponen | Layanan | Biaya tetap |
| --- | --- | --- |
| Web + job + antrean + cron | Cloudflare Workers **Paid** (Queues termasuk) | ±$5/bln + pemakaian |
| Media | Cloudflare R2 | per GB tersimpan; egress gratis |
| Database & auth | Supabase | paket sesuai kebutuhan |
| AI & render | OpenCode Zen, fal.ai, ElevenLabs, Rendi | per pemakaian (ditutup saldo kredit user) |

Perkiraan waktu setup pertama: 45–60 menit.

## Yang perlu disiapkan

- Akun Cloudflare dengan domain, mis. `studio.contoh.id` (web), `jobs.contoh.id` (Worker job), `media.contoh.id` (R2).
- Proyek Supabase (region Singapore).
- Akun API: OpenCode Zen, fal.ai, ElevenLabs, **Rendi**; opsional Midtrans & Google OAuth.
- Dua rahasia, buat sekali dan simpan di password manager:
  ```bash
  openssl rand -base64 32   # ENCRYPTION_KEY (sama di web & jobs, jangan pernah diganti)
  openssl rand -hex 24      # WORKER_TOKEN   (sama di web & jobs)
  ```

## 1. Supabase

1. Buat project (Singapore). Catat **Project URL**, **anon key**, **service_role key**, **connection string**.
2. Terapkan migrasi & tarif:
   ```bash
   npx supabase@3 login
   npx supabase@3 link --project-ref <PROJECT_REF>
   npx supabase@3 db push
   psql "<CONNECTION_STRING>" -f supabase/seed.sql
   ```
3. **Authentication → URL Configuration**: Site URL `https://studio.contoh.id`, Redirect `https://studio.contoh.id/auth/callback`.
4. **Authentication → Multi-Factor**: aktifkan **TOTP** (wajib untuk superadmin).
5. **Authentication → Email**: aktifkan konfirmasi email dan pasang SMTP sendiri.

## 2. R2 & Queue

```bash
npx wrangler login
npx wrangler r2 bucket create atomo-media
npx wrangler queues create atomo-jobs
npx wrangler queues create atomo-jobs-dlq
```

Lalu di dashboard: R2 → `atomo-media` → Settings → **Custom Domain** → `media.contoh.id` (URL publik media).
Penyedia AI dan Rendi mengambil gambar/klip dari URL ini, jadi bucket harus bisa dibaca publik lewat domain tersebut.

## 3. Worker job (`apps/jobs`)

```bash
cd apps/jobs
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put WORKER_TOKEN
# isi vars di wrangler.jsonc: NEXT_PUBLIC_SUPABASE_URL, MEDIA_PUBLIC_URL=https://media.contoh.id,
# APP_URL=https://studio.contoh.id, AI_MOCK=0. Biarkan RENDER_BASE_URL kosong (→ Rendi).
pnpm deploy
curl https://atomo-jobs.<akun>.workers.dev/health   # → {"ok":true}
```

Opsional: pasang custom domain `jobs.contoh.id` (Worker → Settings → Domains & Routes).

## 4. Web (`apps/web`)

```bash
cd apps/web
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put WORKER_TOKEN
export NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# isi vars di wrangler.jsonc: APP_URL, WORKER_URL (URL Worker job), AI_MOCK=0, PAYMENTS_SANDBOX=0
pnpm cf:deploy
```

Pasang custom domain `studio.contoh.id` (Worker → Settings → Domains & Routes).
Paket Workers **Paid** disarankan: bundle web ±2,6 MB gzip dan batas CPU paket gratis terlalu kecil untuk render halaman.

## 5. Superadmin & key asli

```bash
DATABASE_URL="<CONNECTION_STRING>" bash scripts/make-superadmin.sh kamu@contoh.id
```

1. Login di `https://studio.contoh.id`, buka **Secret platform** (`/admin/secrets`), aktifkan 2FA.
2. Isi `OPENCODE_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `RENDI_API_KEY`; opsional Midtrans & Google OAuth.
3. Key dipakai web seketika dan Worker job paling lambat 60 detik.

## 6. Uji asap (5 menit)

1. Daftar, lalu top-up. Untuk demo, set `PAYMENTS_SANDBOX=1` sementara.
2. Buat project dengan preset **Serial anime**, lalu riset (teks mengalir).
3. Buat karakter dan reference image (gambar muncul dari `media.contoh.id`).
4. Lanjutkan naskah, storyboard, satu klip, VO, render MP4, lalu teaser 9:16.
5. Log: `npx wrangler tail atomo-jobs` dan dashboard Queues (pesan gagal masuk `atomo-jobs-dlq`).

## Dev lokal

```bash
pnpm install
npx supabase@3 start && npx supabase@3 db reset
cp .env.example .env && cp .env apps/web/.env.local     # isi key Supabase lokal, ENCRYPTION_KEY, WORKER_TOKEN
cp apps/jobs/.dev.vars.example apps/jobs/.dev.vars       # nilai sama dengan .env
pnpm dev     # web :3000 + Worker job :8787 (Queue & R2 lokal) + emulator Rendi :8790 (FFmpeg lokal)
```

- `AI_MOCK=1` dan `PAYMENTS_SANDBOX=1` membuat seluruh alur bisa dicoba tanpa biaya.
- Uji web di runtime Cloudflare: `pnpm --filter @atomo/web cf:preview`; E2E: `E2E_BASE=http://localhost:8788 pnpm test:e2e`.

## Catatan

- **Jangan mengganti `ENCRYPTION_KEY`** setelah ada data.
- Render di Rendi memakai font yang tersedia di server mereka. Bila subtitle tampil dengan font cadangan, tambahkan file font sebagai input (fitur lanjutan).
- Batas `max_command_run_seconds` render diset 6× durasi video (minimal 300 detik).
- Episode panjang (sampai 20 menit) dirender per segmen ±2 menit secara paralel, lalu digabung tanpa re-encode. Atur panjang segmen dengan var `RENDER_SEGMENT_SEC` di `apps/jobs` (default 120). Satu episode 20 menit mengirim ±11 perintah sekaligus, jadi pastikan paket Rendi mengizinkan perintah paralel. Kalau tidak, perintah akan antre dan render tetap selesai, hanya lebih lama.
- Gabung segmen memakai protokol `concat:` FFmpeg. Uji sekali dengan key Rendi asli sebelum dipakai customer (lokal sudah diuji dengan emulator dan FFmpeg).
- Sebelum memakai key asli, cek ToS tiap provider soal reseller (lihat checklist di `CLAUDE.md`).
- Google Cloud: aktifkan **YouTube Data API v3** dan **YouTube Analytics API**, lalu tambahkan scope `youtube.upload`, `youtube.readonly`, dan `yt-analytics.readonly` di layar persetujuan OAuth. Selama proyek belum lolos audit Google, video yang diunggah terkunci private (termasuk yang dijadwalkan).
