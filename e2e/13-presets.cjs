// Preset & gaya visual: semua preset mengisi form dengan benar; project non-anime bisa dibuat & diriset.
const { open, shot, BASE } = require('./lib.cjs');
(async () => {
  const { b, p, errs } = await open();
  await p.goto(BASE + '/studio');
  const presets = await p.locator('[aria-label="Preset"] button').allTextContents();
  console.log('preset:', presets.length, '|', presets.join(', '));
  console.log('gaya:', await p.locator('#style option').count(), 'dalam', await p.locator('#style optgroup').count(), 'grup');
  for (const [label, want] of [['Animasi anak 3D', 'animasi anak 3D animasi 16:9'], ['Drama webtoon', 'microdrama romance komik webtoon 9:16'], ['Donghua fantasi', 'serial fantasi donghua 3D 16:9']]) {
    await p.click(`[aria-label="Preset"] button:has-text("${label}")`);
    const got = [await p.inputValue('#format'), await p.inputValue('#genre'), await p.inputValue('#style'), await p.inputValue('#aspect')].join(' ');
    console.log(label.padEnd(16), got === want ? 'ok' : `SALAH: ${got}`);
  }
  await p.click('[aria-label="Preset"] button:has-text("Legenda Nusantara")');
  console.log('keterangan gaya:', (await p.locator('p.small.muted:has-text("Gaya ")').first().textContent()).trim());
  await shot(p, 'presets');
  await p.fill('#title', 'Hikayat Pulau Kabut');
  await p.fill('#topic', 'Legenda orisinal tentang pulau yang muncul hanya saat kabut turun, penjaganya, dan anak nelayan yang tersesat ke sana.');
  await p.click('text=Buat project');
  await p.waitForURL(/\/riset/, { timeout: 15000 });
  console.log('rail:', (await p.textContent('.proj span')).trim());
  await p.click('button:has-text("Riset dengan AI")');
  await p.waitForSelector('text=Dipakai sebagai konteks', { timeout: 30000 });
  console.log('riset: ok');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
