const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/audio');
  const vo = p.locator('header button.primary');
  console.log('tombol VO:', await vo.textContent());
  await vo.click();
  for (let t = 0; t < 60; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if ((await p.locator('.line audio').count()) === (await p.locator('.line').count())) break;
  }
  console.log('VO siap:', await p.locator('.line audio').count(), '/', await p.locator('.line').count());
  console.log('saldo setelah VO:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-08-audio');

  await p.goto(proj + '/editor');
  console.log('peringatan:', await p.locator('.note.warn').count());
  console.log('klip timeline:', await p.locator('.clip.v').count(), 'dialog:', await p.locator('.clip.d').count(), 'subtitle:', await p.locator('.clip.s').count());
  await p.click('button:has-text("Rakit & render MP4")');
  for (let t = 0; t < 90; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if (await p.locator('a:has-text("Unduh MP4")').count()) break;
    if (await p.locator('.pill.crit').count()) break;
  }
  const href = await p.locator('a:has-text("Unduh MP4")').first().getAttribute('href').catch(() => null);
  console.log('render:', href, (await p.locator('.pill.crit').getAttribute('title').catch(() => '')) || '');
  console.log('saldo akhir:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-09-editor');
  fs.writeFileSync('render.txt', href ?? '');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
