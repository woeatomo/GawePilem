const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/karakter');
  if (!(await p.locator('article.char').count())) {
    await p.click('button:has-text("Buat logline & karakter dengan AI")');
    await p.waitForSelector('article.char', { timeout: 30000 });
  }
  const card = (name) => p.locator('article.char', { has: p.locator(`h3:text-is("${name}")`) });
  const names = await p.locator('article.char h3').allTextContents();
  console.log('karakter:', names);
  for (const n of names) {
    const btn = card(n).locator('button:has-text("Buat reference image")');
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(800); }
  }
  for (let t = 0; t < 60; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if ((await p.locator('.portrait img').count()) === names.length) break;
  }
  console.log('portrait:', await p.locator('.portrait img').count());
  for (const n of names) {
    await card(n).locator('button:has-text("Kunci wajah & suara")').click();
    await p.waitForTimeout(1500);
  }
  await p.reload();
  console.log('urutan setelah update:', await p.locator('article.char h3').allTextContents());
  console.log('terkunci:', await p.locator('text=Wajah & suara dikunci').count());
  console.log('saldo:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-04-karakter');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
