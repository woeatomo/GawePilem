const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/visual');
  const btn = p.locator('header button.primary');
  console.log('tombol:', await btn.textContent());
  await btn.click();
  await p.waitForSelector('[role=dialog][aria-label="Konfirmasi biaya"]', { timeout: 5000 });
  console.log('modal:', (await p.locator('[role=dialog] p').first().textContent()).replace(/\s+/g, ' '));
  await shot(p, 'e2e-07-konfirmasi');
  await p.click('[role=dialog] button.primary');
  for (let t = 0; t < 90; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    const done = (await p.locator('.stat b').first().textContent()) ?? '';
    if (done.startsWith('12/')) break;
  }
  console.log('stat:', (await p.locator('.stat b').allTextContents()).join(' | '));
  console.log('saldo:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-07-visual');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
