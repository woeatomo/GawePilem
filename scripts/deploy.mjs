#!/usr/bin/env node
/**
 * Deploy Pilem Studio ke Supabase + Cloudflare dalam satu perintah. Idempotent: aman diulang.
 *
 * Hanya memakai API HTTPS (Supabase Management API + Cloudflare/wrangler), tanpa koneksi
 * Postgres langsung, jadi bisa jalan dari PC maupun dari sesi cloud yang lewat proxy.
 *
 *   node scripts/deploy.mjs                 # semua langkah
 *   node scripts/deploy.mjs --dry-run       # tampilkan rencana & config yang akan ditulis, tanpa memanggil apa pun
 *   node scripts/deploy.mjs --only supabase # satu langkah: supabase | cloudflare | jobs | web | smoke | superadmin
 *
 * Variabel wajib:
 *   SUPABASE_ACCESS_TOKEN   token akun Supabase (Account → Access Tokens)
 *   SUPABASE_PROJECT_REF    ref proyek (dari URL dashboard: /project/<ref>)
 *   CLOUDFLARE_API_TOKEN    token API Cloudflare (izin: Workers Scripts, Workers Routes, Queues, R2, Zone read, DNS edit)
 *   CLOUDFLARE_ACCOUNT_ID   id akun Cloudflare
 *   DOMAIN                  domain di Cloudflare, mis. pilem.id
 *     — atau, tanpa domain sendiri —
 *   WORKERS_SUBDOMAIN       subdomain workers.dev akun, mis. "atomos" → web <WEB_WORKER>.atomos.workers.dev,
 *                           job atomo-jobs.atomos.workers.dev, media disajikan Worker job (/media)
 *   WEB_WORKER              nama Worker web (default pilem-studio)
 * Opsional:
 *   WEB_HOST (default studio.<DOMAIN>), JOBS_HOST (jobs.<DOMAIN>), MEDIA_HOST (media.<DOMAIN>)
 *   SUPERADMIN_EMAIL        angkat superadmin (akun harus sudah daftar di web)
 *   ENCRYPTION_KEY, WORKER_TOKEN   bila kosong dibuat sekali & disimpan di .deploy/secrets.env (jangan hilang!)
 *   FREE_TIER=1             sesuaikan dengan paket gratis: Workers Free (tanpa limits.cpu_ms) &
 *                           Rendi Free (perintah ≤ 60 dtk, 4 vCPU, segmen render 30 dtk)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const STEPS = ['supabase', 'cloudflare', 'jobs', 'web', 'smoke', 'superadmin'];
if (ONLY && !STEPS.includes(ONLY)) fail(`--only harus salah satu dari: ${STEPS.join(', ')}`);

const log = (m) => console.log(`\x1b[33m▶\x1b[0m ${m}`);
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
function fail(m) {
  console.error(`\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
}

// ---------------------------------------------------------------- konfigurasi
const env = (k, d) => process.env[k] || d;
const need = (k) => env(k) || (DRY ? `<${k}>` : fail(`Variabel ${k} wajib diisi`));
const cfg = {
  sbToken: need('SUPABASE_ACCESS_TOKEN'),
  ref: need('SUPABASE_PROJECT_REF'),
  cfToken: need('CLOUDFLARE_API_TOKEN'),
  account: need('CLOUDFLARE_ACCOUNT_ID'),
  domain: env('DOMAIN') || (env('WORKERS_SUBDOMAIN') ? null : need('DOMAIN')),
};
cfg.webWorker = env('WEB_WORKER', 'pilem-studio');
cfg.sub = cfg.domain ? null : need('WORKERS_SUBDOMAIN').replace(/\.workers\.dev$/, '');
cfg.web = env('WEB_HOST', cfg.domain ? `studio.${cfg.domain}` : `${cfg.webWorker}.${cfg.sub}.workers.dev`);
cfg.jobs = env('JOBS_HOST', cfg.domain ? `jobs.${cfg.domain}` : `atomo-jobs.${cfg.sub}.workers.dev`);
// Tanpa domain sendiri: R2 tidak punya alamat publik produksi, jadi media disajikan Worker job (mendukung Range).
cfg.media = env('MEDIA_HOST', cfg.domain ? `media.${cfg.domain}` : `${cfg.jobs}/media`);
cfg.supabaseUrl = `https://${cfg.ref}.supabase.co`;
cfg.free = env('FREE_TIER') === '1';

/** Rahasia platform: dibuat sekali, disimpan lokal (gitignored), dipakai ulang di deploy berikutnya. */
function platformSecrets() {
  const file = join(ROOT, '.deploy/secrets.env');
  const saved = existsSync(file) ? Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
  const s = {
    ENCRYPTION_KEY: env('ENCRYPTION_KEY', saved.ENCRYPTION_KEY) || randomBytes(32).toString('base64'),
    WORKER_TOKEN: env('WORKER_TOKEN', saved.WORKER_TOKEN) || randomBytes(24).toString('hex'),
  };
  if (!DRY && (s.ENCRYPTION_KEY !== saved.ENCRYPTION_KEY || s.WORKER_TOKEN !== saved.WORKER_TOKEN)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `ENCRYPTION_KEY=${s.ENCRYPTION_KEY}\nWORKER_TOKEN=${s.WORKER_TOKEN}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    ok(`rahasia platform disimpan di .deploy/secrets.env — SIMPAN SALINANNYA di password manager (ENCRYPTION_KEY tidak boleh hilang/berganti)`);
  }
  return s;
}

// ---------------------------------------------------------------- HTTP helper
async function api(base, token, method, path, body) {
  if (DRY) return null;
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const sb = (m, p, b) => api('https://api.supabase.com', cfg.sbToken, m, p, b);
const cf = (m, p, b) => api('https://api.cloudflare.com/client/v4', cfg.cfToken, m, p, b);
const sql = (query) => sb('POST', `/v1/projects/${cfg.ref}/database/query`, { query });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function run(cmd, argv, opts = {}) {
  const shown = `${cmd} ${argv.join(' ')}`;
  if (DRY) return void console.log(`    $ ${shown}`);
  try {
    return execFileSync(cmd, argv, { stdio: opts.capture ? ['pipe', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', env: { ...process.env, CLOUDFLARE_API_TOKEN: cfg.cfToken, CLOUDFLARE_ACCOUNT_ID: cfg.account, ...(opts.env ?? {}) }, cwd: opts.cwd ?? ROOT, input: opts.input });
  } catch {
    if (opts.allowFail) return null;
    fail(`Perintah gagal: ${shown}`);
  }
}

// ---------------------------------------------------------------- 1. Supabase
async function supabase() {
  log('Supabase: proyek, migrasi, tarif awal, auth');
  const p = await sb('GET', `/v1/projects/${cfg.ref}`);
  if (p) ok(`proyek ${p.name} (${p.region}) status ${p.status}`);

  await sql(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const applied = new Set(((await sql('select version from supabase_migrations.schema_migrations')) ?? []).map((r) => r.version));
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    const [version, ...rest] = f.replace(/\.sql$/, '').split('_');
    if (applied.has(version)) continue;
    const body = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8');
    // Satu permintaan = satu transaksi: migrasi dan catatannya masuk bersama, atau tidak sama sekali.
    await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(rest.join('_'))});\ncommit;`);
    ok(`migrasi ${f}`);
    n++;
  }
  if (!n) ok(`semua ${files.length} migrasi sudah diterapkan`);

  // Tarif awal hanya bila tabel kosong (jangan menimpa tarif yang sudah diubah admin).
  const rates = await sql('select count(*)::int as n from public.rates');
  if (DRY || rates?.[0]?.n === 0) {
    await sql(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'));
    ok('tarif awal dimasukkan');
  } else ok(`tarif sudah ada (${rates[0].n} baris), tidak diubah`);

  await sb('PATCH', `/v1/projects/${cfg.ref}/config/auth`, {
    site_url: `https://${cfg.web}`,
    uri_allow_list: `https://${cfg.web}/auth/callback,https://${cfg.web}/**`,
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
  });
  ok(`auth: site_url https://${cfg.web}, 2FA TOTP aktif`);
}

async function supabaseKeys() {
  if (DRY) return { anon: '<anon>', service: '<service_role>' };
  const keys = await sb('GET', `/v1/projects/${cfg.ref}/api-keys?reveal=true`);
  const pick = (...names) => keys.find((k) => names.includes(k.type) || names.includes(k.name))?.api_key;
  // Kunci baru (publishable/secret) bila ada; selain itu kunci legacy anon/service_role.
  const anon = pick('publishable') ?? pick('anon');
  const service = pick('secret') ?? pick('service_role');
  if (!anon || !service) fail('Tidak menemukan API key proyek Supabase (publishable/anon dan secret/service_role).');
  return { anon, service };
}

// ---------------------------------------------------------------- 2. Cloudflare: R2, Queue, domain media
let zoneId = null;
async function zone() {
  if (zoneId || DRY) return zoneId ?? '<zone-id>';
  const z = await cf('GET', `/zones?name=${encodeURIComponent(cfg.domain)}&account.id=${cfg.account}`);
  zoneId = z?.result?.[0]?.id;
  if (!zoneId) fail(`Domain ${cfg.domain} tidak ditemukan di akun Cloudflare ini. Tambahkan domain ke Cloudflare dulu.`);
  return zoneId;
}

async function cloudflare() {
  log('Cloudflare: R2, Queue, domain media');
  const buckets = DRY ? [] : ((await cf('GET', `/accounts/${cfg.account}/r2/buckets`))?.result?.buckets ?? []).map((b) => b.name);
  if (!buckets.includes('atomo-media')) run('npx', ['wrangler', 'r2', 'bucket', 'create', 'atomo-media'], { cwd: join(ROOT, 'apps/jobs') });
  ok('R2 atomo-media');
  const queues = DRY ? [] : ((await cf('GET', `/accounts/${cfg.account}/queues`))?.result ?? []).map((q) => q.queue_name);
  for (const q of ['atomo-jobs', 'atomo-jobs-dlq']) if (!queues.includes(q)) run('npx', ['wrangler', 'queues', 'create', q], { cwd: join(ROOT, 'apps/jobs') });
  ok('Queue atomo-jobs + DLQ');
  if (!cfg.domain) return ok(`media disajikan Worker job: https://${cfg.media}`);
  const zid = await zone();
  const domains = DRY ? [] : ((await cf('GET', `/accounts/${cfg.account}/r2/buckets/atomo-media/domains/custom`))?.result?.domains ?? []).map((d) => d.domain);
  if (!domains.includes(cfg.media)) run('npx', ['wrangler', 'r2', 'bucket', 'domain', 'add', 'atomo-media', '--domain', cfg.media, '--zone-id', zid, '--min-tls', '1.2', '--force'], { cwd: join(ROOT, 'apps/jobs') });
  ok(`media publik https://${cfg.media}`);
}

// ---------------------------------------------------------------- 3 & 4. Worker job & web
/** Baca wrangler.jsonc (komentar baris penuh saja) lalu isi vars + custom domain produksi. */
export function productionConfig(file, vars, host) {
  const json = JSON.parse(readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/,(\s*[}\]])/g, '$1'));
  const out = { ...json, vars: { ...json.vars, ...vars }, ...(cfg.domain ? { routes: [{ pattern: host, custom_domain: true }] } : { workers_dev: true }) };
  for (const [k, v] of Object.entries(out.vars)) if (String(v).includes('GANTI')) fail(`${file}: var ${k} masih placeholder`);
  return out;
}

function writeConfig(dir, conf) {
  const path = join(ROOT, dir, 'wrangler.production.json');
  if (DRY) console.log(`    tulis ${dir}/wrangler.production.json:\n${JSON.stringify({ name: conf.name, vars: conf.vars, routes: conf.routes, workers_dev: conf.workers_dev, services: conf.services, limits: conf.limits }, null, 2).replace(/^/gm, '      ')}`);
  else writeFileSync(path, JSON.stringify(conf, null, 2));
  return path;
}

function putSecrets(dir, config, secrets) {
  if (DRY) return void console.log(`    $ wrangler secret bulk -c ${dir}/wrangler.production.json  (${Object.keys(secrets).join(', ')})`);
  const tmp = join(ROOT, '.deploy', `secrets-${Date.now()}.json`);
  mkdirSync(dirname(tmp), { recursive: true });
  writeFileSync(tmp, JSON.stringify(secrets), { mode: 0o600 });
  try {
    run('npx', ['wrangler', 'secret', 'bulk', tmp, '-c', config], { cwd: join(ROOT, dir) });
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function jobs() {
  log('Worker job (atomo-jobs)');
  const { service } = await supabaseKeys();
  const s = platformSecrets();
  const base = productionConfig(join(ROOT, 'apps/jobs/wrangler.jsonc'), {
    NEXT_PUBLIC_SUPABASE_URL: cfg.supabaseUrl, MEDIA_PUBLIC_URL: `https://${cfg.media}`, APP_URL: `https://${cfg.web}`, AI_MOCK: '0',
    ...(cfg.free ? { RENDER_SEGMENT_SEC: '30', RENDER_MAX_SECONDS: '60', RENDER_MAX_VCPU: '4' } : {}),
  }, cfg.jobs);
  // Workers Free tidak menerima limits.cpu_ms (batas CPU 10 ms; waktu tunggu jaringan tidak dihitung).
  if (cfg.free) delete base.limits;
  const conf = writeConfig('apps/jobs', base);
  // Deploy dulu agar Worker ada, lalu isi rahasia (bulk membuat versi baru dengan rahasia terpasang).
  run('npx', ['wrangler', 'deploy', '-c', conf], { cwd: join(ROOT, 'apps/jobs') });
  putSecrets('apps/jobs', conf, { SUPABASE_SERVICE_ROLE_KEY: service, ENCRYPTION_KEY: s.ENCRYPTION_KEY, WORKER_TOKEN: s.WORKER_TOKEN });
  ok(`Worker job di https://${cfg.jobs}`);
}

async function web() {
  log(`Web (${cfg.webWorker})`);
  const { anon, service } = await supabaseKeys();
  const s = platformSecrets();
  const pub = { NEXT_PUBLIC_SUPABASE_URL: cfg.supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon };
  const webConf = productionConfig(join(ROOT, 'apps/web/wrangler.jsonc'), {
    ...pub, APP_URL: `https://${cfg.web}`, WORKER_URL: `https://${cfg.jobs}`, AI_MOCK: '0', PAYMENTS_SANDBOX: '0',
  }, cfg.web);
  webConf.name = cfg.webWorker;
  webConf.services = (webConf.services ?? []).map((s) => (s.binding === 'WORKER_SELF_REFERENCE' ? { ...s, service: cfg.webWorker } : s));
  const conf = writeConfig('apps/web', webConf);
  // NEXT_PUBLIC_* ditanam saat build, jadi wajib ada di env build.
  run('npx', ['opennextjs-cloudflare', 'build'], { cwd: join(ROOT, 'apps/web'), env: { ...pub, NODE_ENV: 'production' } });
  run('npx', ['opennextjs-cloudflare', 'deploy', '-c', conf], { cwd: join(ROOT, 'apps/web'), env: pub });
  putSecrets('apps/web', conf, { SUPABASE_SERVICE_ROLE_KEY: service, ENCRYPTION_KEY: s.ENCRYPTION_KEY, WORKER_TOKEN: s.WORKER_TOKEN });
  ok(`Web di https://${cfg.web}`);
}

// ---------------------------------------------------------------- 5. uji asap
async function smoke() {
  log('Uji asap');
  if (DRY) return void console.log(`    GET https://${cfg.jobs}/health, https://${cfg.web}/login`);
  for (let i = 0; i < 12; i++) {
    const [h, w] = await Promise.all([
      fetch(`https://${cfg.jobs}/health`).then((r) => r.status).catch(() => 0),
      fetch(`https://${cfg.web}/login`).then((r) => r.status).catch(() => 0),
    ]);
    if (h === 200 && w === 200) return ok('job /health 200, web /login 200');
    console.log(`  … menunggu sertifikat & DNS (job ${h}, web ${w})`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  fail('Domain belum merespons. Sertifikat custom domain bisa butuh beberapa menit; jalankan lagi: node scripts/deploy.mjs --only smoke');
}

// ---------------------------------------------------------------- 6. superadmin
async function superadmin() {
  const email = env('SUPERADMIN_EMAIL');
  if (!email) return;
  log(`Superadmin ${email}`);
  const r = await sql(`update public.profiles set is_superadmin = true where lower(email) = lower(${lit(email)}) returning id;
    insert into public.audit_log (action, target_type, target_id, details)
      select 'platform.superadmin_grant', 'profile', id::text, '{"via":"deploy.mjs"}'::jsonb from public.profiles where lower(email) = lower(${lit(email)});`);
  if (!DRY && Array.isArray(r) && r.length === 0) fail(`Akun ${email} belum terdaftar. Daftar dulu di https://${cfg.web}, lalu: node scripts/deploy.mjs --only superadmin`);
  ok('superadmin diangkat; aktifkan 2FA di /admin/secrets lalu isi key provider');
}

const ALL = { supabase, cloudflare, jobs, web, smoke, superadmin };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (DRY) log(`DRY RUN — tidak ada yang dipanggil. web=${cfg.web} jobs=${cfg.jobs} media=${cfg.media}${cfg.free ? ' (mode paket gratis)' : ''}`);
  for (const step of STEPS) if (!ONLY || ONLY === step) await ALL[step]();
  console.log(`
Selesai. Langkah manual berikutnya:
  1. Daftar di https://${cfg.web}, lalu: SUPERADMIN_EMAIL=<email> node scripts/deploy.mjs --only superadmin
  2. Login, buka /admin/secrets, aktifkan 2FA, isi OPENCODE_API_KEY, FAL_KEY, ELEVENLABS_API_KEY, RENDI_API_KEY (+ Midtrans, Google)
  3. Google Cloud OAuth redirect URI : https://${cfg.web}/api/oauth/youtube/callback
     Midtrans notification URL      : https://${cfg.web}/api/webhooks/midtrans
  4. Supabase → Authentication → Email: pasang SMTP sendiri sebelum dibuka untuk umum`);
}
