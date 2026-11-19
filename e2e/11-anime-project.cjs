// Project serial anime 16:9 dari preset, lalu riset. Tahap berikutnya memakai skrip 04–08 yang sama.
const { open, shot, BASE } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  await p.goto(BASE + '/studio');
  await p.click('button:has-text("Serial anime 16:9")');
  await p.fill('#title', 'Penjaga Gerbang Senja');
  await p.fill('#topic', 'Remaja penjaga gerbang dunia roh di kota pelabuhan fiktif. Tiap senja gerbang terbuka dan ia harus memilih siapa yang boleh lewat. Penonton 15-30 tahun.');
  console.log('preset:', await p.inputValue('#format'), await p.inputValue('#genre'), await p.inputValue('#style'), await p.inputValue('#aspect'));
  await p.click('text=Buat project');
  await p.waitForURL(/\/riset/, { timeout: 15000 });
  fs.writeFileSync('project.txt', p.url().replace(/\/riset.*/, ''));
  console.log('rail:', (await p.textContent('.proj span')).trim());
  await p.click('button:has-text("Riset dengan AI")');
  await p.waitForSelector('text=Dipakai sebagai konteks', { timeout: 30000 });
  await shot(p, 'anime-01-riset');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
