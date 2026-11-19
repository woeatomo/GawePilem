# Deploy: Cloudflare (web + media) + VPS (worker)

```
Browser ──► Cloudflare Workers (web Next.js, OpenNext)
              │  Supabase JS (auth, data, RPC kredit)        ┌──► Supabase Cloud (Postgres, Auth + 2FA)
              │  POST /enqueue (Bearer WORKER_TOKEN) ──────► │
              ▼                                               VPS: Caddy (HTTPS) → worker (BullMQ + FFmpeg) → Redis
        Cloudflare R2 (media publik: wajah karakter, frame, klip, VO, MP4)  ◄── worker menulis
```

- **Web** jalan di Cloudflare Workers. Tidak butuh Redis: rate limit di Postgres, job dikirim ke worker lewat HTTP.
- **Worker** (FFmpeg + antrean) jalan di VPS dengan Docker: Redis, worker, dan Caddy (HTTPS otomatis).
- **Media** di Cloudflare R2 (S3-compatible) dan disajikan dari domain publik R2.
- **Key asli** (OpenCode Zen, fal, ElevenLabs, Midtrans, Google OAuth) diisi setelah deploy di `/admin/secrets` (superadmin + 2FA), bukan di file env.

Perkiraan waktu: 60–90 menit untuk pertama kali.

## Yang perlu disiapkan

| Kebutuhan | Catatan |
| --- | --- |
| Akun Cloudflare | Workers **Paid** ($5/bln) disarankan: batas CPU paket gratis terlalu kecil untuk render halaman. Bundle web ±2,6 MB gzip. |
| Domain di Cloudflare | Mis. `studio.contoh.id` (web), `media.contoh.id` (R2), `worker.contoh.id` (VPS) |
| Proyek Supabase | Region Singapore (`ap-southeast-1`) supaya dekat dengan user Indonesia |
| VPS | 2–4 vCPU, 4–8 GB RAM, Ubuntu 24.04 + Docker. Render FFmpeg memakai CPU. |
| Key provider | OpenCode Zen, fal.ai, ElevenLabs; opsional Midtrans & Google OAuth |

Buat tiga rahasia sekali saja dan simpan di password manager:

```bash
openssl rand -base64 32   # ENCRYPTION_KEY (jangan pernah diganti setelah dipakai)
openssl rand -hex 24      # WORKER_TOKEN (sama di web & worker)
```

## 1. Supabase

1. Buat project di dashboard Supabase (region Singapore). Catat **Project URL**, **anon key**, **service_role key**, dan **connection string** (Settings → Database).
2. Terapkan migrasi dari repo:
   ```bash
   npx supabase@3 login
   npx supabase@3 link --project-ref <PROJECT_REF>
   npx supabase@3 db push              # semua file supabase/migrations
   psql "<CONNECTION_STRING>" -f supabase/seed.sql   # tarif awal
   ```
3. **Authentication → URL Configuration**: Site URL `https://studio.contoh.id`, Redirect URL `https://studio.contoh.id/auth/callback`.
4. **Authentication → Multi-Factor**: aktifkan **TOTP** (wajib untuk superadmin).
5. **Authentication → Email**: aktifkan konfirmasi email untuk produksi, dan pasang SMTP sendiri supaya email tidak terkena batas kirim.

## 2. Cloudflare R2 (media)

1. R2 → **Create bucket** `atomo-media`.
2. Bucket → Settings → **Custom Domain** → `media.contoh.id`. Ini URL publik media.
3. R2 → **Manage API tokens** → buat token *Object Read & Write* khusus bucket ini. Catat Access Key ID, Secret, dan endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

## 3. Worker di VPS

```bash
# di VPS (Ubuntu + Docker)
git clone https://github.com/woeatomo/GawePilem.git && cd GawePilem
git checkout <branch-yang-dirilis>
cd deploy/vps && cp .env.example .env && nano .env   # isi semua nilai
docker compose --env-file .env up -d --build
curl https://worker.contoh.id/health   # → {"ok":true,"redis":true}
```

- DNS: `worker.contoh.id` → A record ke IP VPS. Set **DNS only** (awan abu-abu) supaya Caddy bisa mengambil sertifikat Let's Encrypt.
- Firewall: buka hanya port 22, 80, dan 443. Redis tidak pernah dibuka ke luar.
- Update versi: `git pull && docker compose --env-file .env up -d --build`. Job yang sedang jalan aman di-retry.

## 4. Web di Cloudflare Workers

```bash
cd apps/web
npx wrangler login

# Rahasia (diminta satu per satu)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put WORKER_TOKEN

# Variabel publik: dipakai saat build (NEXT_PUBLIC_* ditanam ke bundle) DAN saat runtime
export NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
pnpm cf:deploy
```

Lalu isi variabel non-rahasia di `wrangler.jsonc` → `vars` (atau dashboard → Worker → Settings → Variables), kemudian deploy ulang:

| Variabel | Nilai |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dari Supabase |
| `APP_URL` | `https://studio.contoh.id` |
| `WORKER_URL` | `https://worker.contoh.id` |
| `AI_MOCK` | `0` (atau `1` untuk demo tanpa biaya provider) |
| `PAYMENTS_SANDBOX` | `0` di produksi; `1` hanya untuk demo |

Pasang domain: Worker → Settings → **Domains & Routes** → Custom Domain `studio.contoh.id`.

## 5. Superadmin & key asli

```bash
# dari laptop, dengan connection string Supabase
DATABASE_URL="<CONNECTION_STRING>" bash scripts/make-superadmin.sh kamu@contoh.id
```

1. Daftar/login di `https://studio.contoh.id` dengan email itu.
2. Buka **Secret platform** (`/admin/secrets`), aktifkan 2FA (Google Authenticator), lalu isi `OPENCODE_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`. Isi juga Midtrans dan Google OAuth bila dipakai.
3. Key langsung dipakai web; worker memakainya paling lambat 60 detik.

## 6. Uji asap (5 menit)

1. Daftar akun baru, lalu top-up. Untuk demo pakai `PAYMENTS_SANDBOX=1` sementara; untuk produksi pakai Midtrans.
2. Buat project dengan preset **Serial anime 16:9**, lalu jalankan riset. Teks harus mengalir.
3. Buat karakter, lalu reference image. Gambar harus muncul dari `media.contoh.id`.
4. Selesaikan naskah, storyboard, satu shot klip, VO, lalu render, lalu teaser 9:16.
5. Cek `https://worker.contoh.id/health` dan log: `docker compose logs -f worker`.

## Catatan

- **Jangan mengganti `ENCRYPTION_KEY`** setelah ada data: key BYOK, token OAuth, dan secret platform jadi tidak terbaca.
- Sebelum memakai key asli, cek ToS tiap provider soal reseller. Lihat juga checklist di `CLAUDE.md`.
- Dev lokal tetap jalan dengan `pnpm dev`. Worker menerima job di `http://127.0.0.1:8787`; set `WORKER_TOKEN` yang sama di `.env`.
- Uji versi Cloudflare secara lokal (runtime workerd): `pnpm --filter @atomo/web cf:preview`.
