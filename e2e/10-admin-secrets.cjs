// Halaman secret platform: tersembunyi untuk user biasa, wajib 2FA TOTP untuk superadmin.
const { execFileSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const { BASE } = require('./lib.cjs');
const { totp } = require('./totp.cjs');

async function signup(b, email) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login');
  await p.click('text=Daftar');
  await p.fill('#email', email);
  await p.fill('#password', 'rahasia-123');
  await p.click('button[type=submit]');
  await p.waitForURL(/onboarding/);
  await p.check('input[name=age]');
  await p.check('input[name=consent]');
  await p.click('button[type=submit]');
  await p.waitForURL(/studio/);
  return { ctx, p };
}
const waitNextWindow = async () => new Promise((r) => setTimeout(r, 30_500 - (Date.now() % 30_000)));

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const stamp = Date.now();

  // 1. User biasa: halaman tidak ada (404) dan tidak ada menu admin.
  const user = await signup(b, `biasa+${stamp}@atomo.test`);
  const r1 = await user.p.goto(BASE + '/admin/secrets');
  console.log('user biasa → status', r1.status(), '| menu admin:', await user.p.locator('text=Secret platform').count());

  // 2. Superadmin (diangkat lewat skrip DB) tanpa 2FA → wajib aktivasi.
  const adminEmail = `admin+${stamp}@atomo.test`;
  const admin = await signup(b, adminEmail);
  admin.p.on('pageerror', (e) => errs.push(e.message));
  execFileSync('bash', [path.join(__dirname, '..', 'scripts', 'make-superadmin.sh'), adminEmail], { stdio: 'ignore' });
  await admin.p.goto(BASE + '/admin/secrets');
  await admin.p.waitForSelector('text=Aktifkan 2FA dulu');
  await admin.p.waitForSelector('img[alt="Kode QR 2FA"]');
  const secret = (await admin.p.locator('span.mono[style*="user-select"]').textContent()).trim();
  await admin.p.screenshot({ path: path.join(__dirname, '.out', 'admin-01-enroll.png') });
  await admin.p.fill('#enroll-code', totp(secret));
  await admin.p.click('button:has-text("Aktifkan")');
  await admin.p.waitForSelector('text=Verifikasi 2FA aktif', { timeout: 15000 });
  console.log('aktivasi 2FA: ok');

  // 3. Isi FAL_KEY → tersimpan terenkripsi, hanya hint yang tampil.
  const row = admin.p.locator('tr', { has: admin.p.locator('text=FAL_KEY') });
  await row.locator('button:has-text("Isi")').click();
  await row.locator('input[type=password]').fill('fal-rahasia-asli-1234abcd');
  await row.locator('button:has-text("Simpan")').click();
  await admin.p.waitForSelector('tr:has-text("FAL_KEY") >> text=Tersimpan (terenkripsi)', { timeout: 15000 });
  console.log('hint tampil:', (await row.locator('td.mono').textContent()).trim());
  const html = await admin.p.content();
  console.log('nilai asli bocor ke HTML:', html.includes('fal-rahasia-asli-1234abcd'));
  await admin.p.screenshot({ path: path.join(__dirname, '.out', 'admin-02-secrets.png'), fullPage: true });

  // 4. Database hanya menyimpan ciphertext.
  const stored = execFileSync('docker', ['exec', 'supabase_db_atomo-film-studio', 'psql', '-U', 'postgres', '-tAc',
    "select encrypted_value from public.platform_secrets where name='FAL_KEY'"], { encoding: 'utf8' }).trim();
  console.log('DB menyimpan ciphertext:', /^v1\./.test(stored) && !stored.includes('fal-rahasia'));

  // 5. Aplikasi memakai key itu: peringatan "key platform fal belum dikonfigurasi" hilang.
  await admin.p.goto(BASE + '/provider');
  console.log('peringatan key fal di Provider AI:', await admin.p.locator('text=Key platform untuk fal belum dikonfigurasi').count());

  // 6. Login baru (password saja, aal1) → wajib kode 2FA, daftar secret tidak tampil.
  const fresh = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p2 = await fresh.newPage();
  await p2.goto(BASE + '/login');
  await p2.fill('#email', adminEmail);
  await p2.fill('#password', 'rahasia-123');
  await p2.click('button[type=submit]');
  await p2.waitForURL(/studio/);
  await p2.goto(BASE + '/admin/secrets');
  await p2.waitForSelector('text=Masukkan kode 2FA');
  console.log('login baru tanpa 2FA → tabel secret tampil:', await p2.locator('text=FAL_KEY').count());
  await p2.fill('#mfa-code', '000000');
  await p2.click('button:has-text("Verifikasi")');
  await p2.waitForSelector('text=Kode salah');
  console.log('kode salah ditolak: ok');
  await waitNextWindow(); // kode yang sama tidak boleh dipakai dua kali dalam satu jendela 30 detik
  await p2.fill('#mfa-code', totp(secret));
  await p2.click('button:has-text("Verifikasi")');
  await p2.waitForSelector('text=Verifikasi 2FA aktif', { timeout: 15000 });
  console.log('login baru + kode 2FA → terbuka: ok');

  // 7. Hapus → kembali ke "Belum diisi" (env tidak berisi FAL_KEY di stack uji).
  p2.on('dialog', (d) => d.accept());
  await p2.locator('tr', { has: p2.locator('text=FAL_KEY') }).locator('button:has-text("Hapus")').click();
  await p2.waitForSelector('tr:has-text("FAL_KEY") >> text=Belum diisi', { timeout: 15000 });
  const audit = execFileSync('docker', ['exec', 'supabase_db_atomo-film-studio', 'psql', '-U', 'postgres', '-tAc',
    "select string_agg(action, ',' order by id) from public.audit_log where target_id='FAL_KEY'"], { encoding: 'utf8' }).trim();
  console.log('audit log:', audit);

  // 8. Kredit manual: user biasa tidak bisa membuka; superadmin top-up, aktifkan paket, bonus; klik ganda aman.
  console.log('user biasa → /admin/kredit status', (await user.p.goto(BASE + '/admin/kredit')).status());
  const custEmail = `biasa+${stamp}@atomo.test`;
  await p2.goto(BASE + '/admin/kredit');
  await p2.fill('input[aria-label="Email customer"]', custEmail);
  await p2.click('button:has-text("Cari")');
  await p2.waitForSelector(`text=${custEmail}`);
  const saldo0 = Number((await p2.locator('.stat:has-text("Saldo") b').textContent()).replace(/\D/g, ''));
  await p2.fill('#amt', '150000');
  await p2.fill('#note', 'Transfer BCA 20/11 ref 778899');
  await p2.click('button:has-text("Tinjau & tambahkan")');
  await p2.click('button:has-text("Ya, tambahkan")');
  await p2.waitForSelector('text=Berhasil. Saldo', { timeout: 15000 });
  await p2.click('.seg button:has-text("Aktifkan paket")');
  await p2.selectOption('#offer', 'pro-1m');
  await p2.fill('#note', 'Transfer paket Pro 20/11');
  await p2.click('button:has-text("Tinjau & tambahkan")');
  await p2.click('button:has-text("Ya, tambahkan")');
  await p2.waitForFunction(() => /pro/i.test(document.querySelector('.stat:nth-child(3) b')?.textContent ?? ''), null, { timeout: 15000 });
  await p2.click('.seg button:has-text("Bonus")');
  await p2.fill('#cr', '250');
  await p2.fill('#note', 'Kompensasi render gagal');
  await p2.click('button:has-text("Tinjau & tambahkan")');
  await p2.click('button:has-text("Ya, tambahkan")');
  await p2.waitForSelector('text=Berhasil. Saldo', { timeout: 15000 });
  await p2.reload();
  await p2.fill('input[aria-label="Email customer"]', custEmail);
  await p2.click('button:has-text("Cari")');
  await p2.waitForSelector(`text=${custEmail}`);
  const saldo1 = Number((await p2.locator('.stat:has-text("Saldo") b').textContent()).replace(/\D/g, ''));
  console.log('kredit manual: saldo +', saldo1 - saldo0, '(harap 1500+4990+250=6740) | paket:', (await p2.locator('.stat:has-text("Paket") b').textContent()).trim());
  console.log('riwayat:', await p2.locator('.qtable tbody tr').count(), 'baris');
  await p2.screenshot({ path: path.join(__dirname, '.out', 'admin-03-kredit.png'), fullPage: true });
  const plan = execFileSync('docker', ['exec', 'supabase_db_atomo-film-studio', 'psql', '-U', 'postgres', '-tAc',
    `select plan from public.profiles where email='${custEmail}'`], { encoding: 'utf8' }).trim();
  console.log('profil customer di DB:', plan);
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
