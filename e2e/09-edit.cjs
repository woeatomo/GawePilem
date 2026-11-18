const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/editor');
  const before = await p.textContent('.tl .mono.small:last-child');
  await p.click('text=Percepat pacing scene 1');
  await p.click('button:has-text("Minta usulan")');
  await p.waitForSelector('text=Usulan:', { timeout: 30000 });
  console.log('usulan:', (await p.locator('.note:has-text("Usulan:")').textContent()).replace(/\s+/g, ' ').slice(0, 200));
  await p.click('.note button:has-text("Terima")');
  await p.waitForTimeout(2500);
  await p.reload();
  console.log('timeline:', await p.locator('.tl .pill').first().textContent(), '| durasi sebelum:', before.trim(), '→ sesudah:', (await p.textContent('.tl .mono.small:last-child')).trim());
  await p.click('header button.primary');
  for (let t = 0; t < 90; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if ((await p.locator('a:has-text("Unduh MP4")').count()) >= 2) break;
  }
  console.log('render siap:', await p.locator('a:has-text("Unduh MP4")').count());
  console.log('saldo:', await p.textContent('.wallet .bal'));
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
