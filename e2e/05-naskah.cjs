const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/naskah');
  await p.click('button:has-text("Buat outline episode")');
  await p.waitForSelector('.scene-item', { timeout: 30000 });
  const n = await p.locator('.scene-item').count();
  console.log('scene:', n);
  for (let i = 0; i < n; i++) {
    await p.locator('.scene-item').nth(i).click();
    await p.click(`button:has-text("Tulis SC ${i + 1} dengan AI")`);
    await p.waitForSelector(`.scene-item >> nth=${i} >> text=/\\d+ kata/`, { timeout: 30000 });
  }
  await p.reload();
  console.log('ringkasan scene:', await p.locator('.scene-item small').allTextContents());
  // tulis ulang SC 1
  await p.locator('.scene-item').nth(0).click();
  await p.fill('input[aria-label="Instruksi tulis ulang"]', 'Tambah ketegangan');
  await p.click('button:has-text("Tulis ulang")');
  await p.waitForTimeout(4000);
  await p.reload();
  console.log('versi:', await p.locator('details summary').first().textContent().catch(() => '-'));
  console.log('saldo:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-05-naskah');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
