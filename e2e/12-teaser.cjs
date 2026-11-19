// Render teaser 9:16 (latar blur) dari master 16:9, lalu cek ukuran file.
const { open, shot } = require('./lib.cjs');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/editor');
  await p.fill('#t-start', '5');
  await p.fill('#t-end', '35');
  await p.click('button:has-text("Render teaser 9:16")');
  for (let t = 0; t < 90; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if (await p.locator('section:has-text("Versi Shorts") video').count()) break;
  }
  const url = await p.locator('section:has-text("Versi Shorts") video').getAttribute('src');
  const master = await p.locator('a:has-text("Unduh MP4")').last().getAttribute('href');
  const probe = (u) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0', u], { encoding: 'utf8' }).trim().replace(/\n/g, ' | ');
  console.log('master:', probe(master));
  console.log('teaser:', probe(url));
  console.log('riwayat:', (await p.locator('tbody .pill').allTextContents()).join(', '));
  await shot(p, 'anime-02-editor');
  await p.goto(proj + '/publish');
  console.log('pilihan publish:', (await p.locator('#rd option').allTextContents()).join(' / ') || '(belum ada akun YouTube: pilihan muncul setelah terhubung)');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
