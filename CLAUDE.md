# Atomo Film Studio

Web app untuk kreator yang ingin membuat film dan serial (microdrama, film pendek, dokumenter, iklan naratif) dengan AI, dari riset sampai auto-publish ke YouTube, YouTube Shorts, dan TikTok. Produk ini dibuat oleh Atomo Digipedia.

Model bisnisnya: user membayar biaya AI dari **satu saldo kredit**, atau memakai API key sendiri (BYOK). Kita menjual workflow, prompt engine, editor, dan automasi publish.

- PRD lengkap: https://claude.ai/artifact/3gXmgZDxvDv42KAcw4RV78
- Prototype UI (acuan tampilan dan alur): https://claude.ai/artifact/8TA5ba6dhdW47pTC73yAup

Tidak ada platform tonton sendiri. Distribusi hanya lewat platform eksternal.

---

## Stack

| Bagian | Pilihan |
| --- | --- |
| Web app | Next.js (App Router) + TypeScript strict + Tailwind, deploy ke Cloudflare Workers (OpenNext) |
| Auth, DB, storage file kecil | Supabase (Postgres, Auth, RLS, Storage) |
| Antrean job | Redis + BullMQ (hanya di worker; web mengirim job lewat HTTP `POST /enqueue` bertoken) |
| Worker render & perakitan video | Node.js + FFmpeg (container terpisah) |
| Object storage aset besar | S3-compatible + CDN |
| Validasi | zod di setiap batas (API route, output LLM, webhook) |
| Tes | Vitest (unit), Playwright (alur utama) |
| Pembayaran | Payment gateway lokal (QRIS, VA, e-wallet) via webhook |

## Struktur repo (monorepo pnpm)

```
apps/
  web/            # Next.js: UI kreator, admin panel, API routes
  worker/         # BullMQ consumers: AI jobs, render FFmpeg, publish
packages/
  ai-gateway/     # interface per kategori AI + adapter provider + metering
  prompt-engine/  # template prompt per tahap x genre x format, versioned
  credits/        # tarif, estimasi, charge, refund (logika murni + tes)
  timeline/       # skema timeline JSON + validasi + kompilasi ke FFmpeg
  publisher/      # YouTube Data API, TikTok Content Posting API
  db/             # tipe hasil generate dari Supabase + query helpers
supabase/
  migrations/     # SQL migrasi, RLS policy
```

## Perintah

```
pnpm install
pnpm dev                       # web (Next.js :3000) + worker (BullMQ)
pnpm test                      # Vitest semua paket (render FFmpeg nyata ikut dites bila ffmpeg ada)
pnpm test:db                   # migrasi + RLS + RPC kredit di Postgres sementara (tanpa Docker)
pnpm test:e2e                  # alur utama via Playwright; butuh supabase start, redis, web (build+start), worker, AI_MOCK=1
pnpm lint && pnpm typecheck
pnpm build                     # build web
pnpm test:e2e:anime            # alur serial anime 16:9 + teaser 9:16
pnpm --filter @atomo/web cf:preview   # web di runtime Cloudflare (workerd) lokal
pnpm --filter @atomo/web cf:deploy    # deploy web ke Cloudflare (lihat docs/DEPLOY.md)
supabase start                 # Supabase lokal (Docker)
supabase db reset              # terapkan ulang semua migrasi + seed tarif
bash scripts/gen-db-types.sh   # regenerate packages/db/src/database.types.ts
```

Mode dev tanpa API key: `AI_MOCK=1` (semua kategori AI pakai adapter mock) dan `PAYMENTS_SANDBOX=1` (top-up simulasi).
Migrasi baru WAJIB revoke + grant eksplisit (Supabase memberi default privilege ke anon/authenticated).

---

## Pipeline produksi (8 tahap)

Riset → Cerita & karakter → Naskah → Storyboard → Produksi visual → Audio → Editor → Publish.

Kreator bisa review, edit, dan generate ulang di setiap tahap. Hasil tiap tahap disimpan sebagai aset project dan dipakai ulang lintas episode. Karakter (reference image multi-sudut + voice_id) **dikunci** dan wajib dipakai di setiap generate gambar, video, dan VO.

## Aturan kredit (wajib dipatuhi)

- Satu saldo per user, **tidak ada saldo per kategori**. 1 kredit = Rp100.
- Tarif dipotong per kategori dan tier:

| Kategori | Satuan | Hemat | Standar | Premium |
| --- | --- | --- | --- | --- |
| `naskah` (LLM) | per scene / per aksi teks | 3 | 5 | 9 |
| `vo` | per menit audio | 12 | 26 | 43 |
| `image` | per gambar | 3 | 6 | 10 |
| `video` | per detik video | 8 (480p) | 22 (720p) | 42 (1080p) |

- Tarif disimpan di tabel `rates` (bisa diubah admin), jangan di-hardcode di luar seed.
- Selalu tampilkan **estimasi per kategori sebelum generate**. Minta konfirmasi untuk aksi di atas 150 kredit.
- Kredit dipotong saat job dibuat. Kalau job gagal di sisi provider, **refund otomatis** dengan entri ledger terpisah.
- `credit_ledger` bersifat append-only. Saldo = SUM ledger. Jangan pernah UPDATE atau DELETE baris ledger.
- Potongan saldo dan pembuatan job harus atomik (satu transaksi Postgres atau RPC `charge_and_enqueue`). Cegah saldo negatif dengan constraint, bukan cuma dicek di aplikasi.
- Kategori yang memakai BYOK tidak memotong saldo, tapi tetap dicatat di `jobs` (cost 0, `billing_mode = 'byok'`).
- Budget cap opsional per kategori per project.
- Kredit berlaku 12 bulan sejak top-up (FIFO).

## AI gateway

Semua panggilan AI **hanya** lewat `packages/ai-gateway`. Modul lain tidak boleh memanggil SDK provider secara langsung.

```ts
interface ScriptAI   { generate(req: TextRequest): AsyncIterable<string> | Promise<TextResult> }
interface VoiceAI    { synthesize(req: VoiceRequest): Promise<AudioAsset> }
interface ImageAI    { generate(req: ImageRequest): Promise<ImageAsset[]> }
interface VideoAI    { imageToVideo(req: VideoRequest): Promise<VideoJobHandle> }
```

Gateway bertanggung jawab atas:

1. Memilih adapter dan model dari pengaturan user per kategori.
2. Memakai key platform (mode saldo) atau key BYOK user. Key BYOK didekripsi di server saja.
3. Metering, rate limit per provider, retry dengan backoff, dan fallback ke model cadangan.
4. Mencatat setiap panggilan ke tabel `jobs` (input ringkas, model, cost, status, error).

### Adapter teks: OpenCode Zen (default)

- Base URL: `https://opencode.ai/zen/v1`, auth `Authorization: Bearer $OPENCODE_API_KEY`.
- Format OpenAI-compatible. Mulai dari `POST /chat/completions` untuk model seperti `deepseek-v4-flash`, `deepseek-v4-pro`, `glm-5.2`, `minimax-m2.7`.
- Sebagian model memakai endpoint lain (GPT lewat `/responses`, Claude lewat `/messages`). Cek docs OpenCode Zen dan `GET /models` sebelum menambah model, dan simpan endpoint per model di config.
- OpenCode Zen **hanya untuk teks**. VO, gambar, dan video memakai adapter lain (mis. ElevenLabs, fal, Replicate).
- Cek ToS OpenCode Zen soal pemakaian sebagai backend produk komersial sebelum launch.
- Output terstruktur (karakter, shot list, metadata, edit timeline) selalu divalidasi dengan zod. Kalau gagal parse, ulangi sekali dengan pesan error, lalu tandai job gagal dan refund.

## Prompt engine

- Template disimpan di tabel `prompt_templates` dengan key `stage × genre × format × version`, dan bisa di-A/B test.
- Setiap prompt menyisipkan konteks: series bible, hasil riset, sheet karakter, dan scene terkait. Konteks dipangkas sesuai budget token model.
- Larangan yang selalu disisipkan: tidak meniru karakter atau IP berhak cipta, dan tidak memakai wajah atau suara orang nyata.
- Template mendorong variasi cerita, supaya channel kreator tidak dianggap konten massal atau repetitif.

## Editor & timeline JSON

LLM tidak mengedit video secara langsung. LLM membaca dan mengusulkan perubahan pada timeline JSON, kreator menerima atau membatalkan, lalu worker mengompilasi timeline jadi perintah FFmpeg.

```ts
type Timeline = {
  fps: 24 | 25 | 30;
  aspect: '9:16' | '16:9' | '1:1';
  tracks: {
    video:    { shotId: string; in: number; out: number; transition?: 'cut' | 'fade' | 'dip' }[];
    dialog:   { lineId: string; start: number; assetId: string; gainDb?: number }[];
    music:    { assetId: string; start: number; end: number; gainDb: number; duckUnderDialog: boolean }[];
    sfx:      { assetId: string; start: number; gainDb?: number }[];
    subtitle: { start: number; end: number; text: string; words?: { t: number; w: string }[] }[];
  };
};
```

Fitur AI editor: rakit otomatis dari shot list + VO, edit dengan perintah teks, subtitle otomatis (speech-to-text dengan timestamp per kata), reframe 9:16 ↔ 16:9 dengan deteksi posisi tokoh, dan potongan yang disinkronkan ke beat musik. Instruksi edit dipotong dari kategori `naskah`.

## Publish & automasi

- Koneksi akun lewat OAuth. Token disimpan terenkripsi, dengan refresh otomatis dan notifikasi kalau koneksi putus.
- Mode publish: manual, terjadwal, series autopilot (jadwal tetap per minggu), cross-post ke 3 platform. **Autopilot hanya menerbitkan episode yang sudah di-approve kreator.**
- Label konten AI selalu aktif dan tidak bisa dimatikan user. Cek nama field terbaru di docs YouTube Data API dan TikTok Content Posting API.
- YouTube: kuota upload per project dibatasi per hari. Antrekan upload dan tampilkan sisa kuota. Project API yang belum lolos audit Google mengunggah video sebagai private.
- TikTok: klien yang belum diaudit hanya bisa posting private dan dibatasi jumlah user per 24 jam. Tampilkan status ini dengan jelas di UI.
- Simpan setiap upload di tabel `publications` beserta `platform_video_id`, status, dan error.

## Skema database (ringkas)

`users`, `workspaces`, `provider_settings` (per kategori: provider, model, mode, `encrypted_key`), `rates`, `credit_ledger`, `projects`, `series_bible`, `episodes`, `characters`, `locations`, `scripts` (versi per episode), `shots`, `audio_tracks`, `timelines`, `renders`, `jobs`, `social_accounts`, `publications`, `automations`, `prompt_templates`, `moderation_events`.

- Aktifkan RLS di semua tabel milik user. Akses lewat `workspace_id`.
- Kolom rahasia (`encrypted_key`, token OAuth) tidak pernah dikirim ke client. Akses hanya lewat service role di server.

## Keamanan & moderasi

- Moderasi prompt dan output di setiap tahap, plus pemeriksaan wajib sebelum publish.
- Blokir pembuatan karakter yang meniru wajah atau suara orang nyata tanpa consent, dan blokir karakter IP terkenal.
- Rate limit per user dan per IP di semua route AI.
- Audit log untuk publish, perubahan billing, dan perubahan provider.
- Key asli platform (provider AI, Midtrans, Google OAuth) diatur superadmin di `/admin/secrets`: wajib 2FA TOTP (aal2), ubah butuh verifikasi 2FA ≤ 15 menit, terenkripsi di `platform_secrets`, dibaca lewat `PlatformSecrets` (`packages/db`). Superadmin hanya diangkat lewat `scripts/make-superadmin.sh`. `ENCRYPTION_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` tetap di env.
- Kepatuhan Indonesia: UU PDP (consent, hapus akun dan data), mekanisme takedown, usia minimal 18 tahun.

---

## Konvensi kode

- TypeScript strict, tanpa `any`. Gunakan zod schema sebagai sumber tipe untuk data dari luar.
- Logika uang dan kredit hanya di `packages/credits`, dengan tes unit untuk setiap aturan di atas.
- Teks UI berbahasa Indonesia. Identifier kode berbahasa Inggris.
- Jangan commit secret. Semua key lewat env (`OPENCODE_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, dll.) dan sediakan `.env.example`.
- Setiap job panjang (render, publish) harus idempotent dan bisa di-retry dengan aman.
- Tampilan mengikuti prototype: tema gelap ala ruang editing, aksen amber, font Bricolage Grotesque, IBM Plex Sans, dan IBM Plex Mono untuk timecode dan angka.

## Urutan pengerjaan

### Fase 1: MVP (microdrama 9:16)
- [x] Scaffold monorepo, Supabase lokal, CI (lint, typecheck, test)
- [x] Auth Supabase, workspace, project, episode
- [x] `packages/credits` + tabel `rates` dan `credit_ledger` + RPC `charge_and_enqueue` + tes
- [x] AI gateway: adapter OpenCode Zen (teks, streaming) dengan BYOK
- [x] Prompt engine v1: riset, karakter, naskah, shot list (genre horor dan drama dulu)
- [x] Modul UI tahap 1–4 sesuai prototype
- [x] Adapter gambar + consistency (reference image karakter)
- [x] Adapter video (image-to-video) + antrean BullMQ + progres (polling job, belum Supabase Realtime)
- [x] Adapter VO (ElevenLabs) dengan voice lock per karakter
- [x] Timeline JSON + rakit otomatis + render FFmpeg + export MP4
- [x] Publish manual ke YouTube
- [x] Uji end-to-end dengan Supabase lokal (Docker) + mode mock: `pnpm test:e2e` (daftar → render MP4 → edit AI)
- [ ] Uji dengan key provider asli (OpenCode Zen, fal, ElevenLabs, YouTube, Midtrans)
- [ ] Verifikasi endpoint OpenCode Zen per model (`GET /models`), ToS reseller, dan field `status.containsSyntheticMedia` YouTube di docs terbaru

### Fase 2: Beta
- [x] Top-up via payment gateway (Midtrans Snap: QRIS, VA, e-wallet) + webhook bertanda tangan + estimasi biaya di semua tombol AI
- [ ] Integrasi TikTok, ajukan audit YouTube dan TikTok
- [x] AI editor dengan perintah teks (usulan operasi timeline, terima/batal, versi timeline)
- [ ] Subtitle otomatis dari speech-to-text (sekarang subtitle diambil dari naskah)
- [x] Moderasi sebelum publish (prefilter teks; antrean review manual belum ada UI)
- [x] Hapus akun & ekspor data (UU PDP)
- [x] Halaman secret platform untuk superadmin dengan 2FA TOTP (`/admin/secrets`)
- [x] Deploy: web di Cloudflare Workers (OpenNext), media di R2, worker Docker di VPS (`docs/DEPLOY.md`)
- [x] Mode anime (panduan gaya & model sheet karakter) + master 16:9 dengan teaser 9:16 untuk Shorts (reframe blur/crop)

### Fase 3: Launch
- [ ] Paket langganan, publish terjadwal, cross-post, analitik ringan

### Fase 4: Scale
- [ ] Series autopilot, format 16:9 panjang dengan reframe, marketplace template, workspace tim

Kerjakan per item kecil, jalankan tes setelah setiap perubahan, dan perbarui checklist ini.
