const { open, shot } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/storyboard');
  await p.click('button:has-text("Pecah naskah jadi shot list")');
  await p.waitForSelector('article.shot', { timeout: 30000 });
  console.log('shot:', await p.locator('article.shot').count());
  const kf = p.locator('button:has-text("frame kunci")');
  console.log('tombol:', await kf.textContent());
  await kf.click();
  for (let t = 0; t < 60; t++) {
    await p.waitForTimeout(2000);
    await p.reload();
    if ((await p.locator('.shot .frame img').count()) === (await p.locator('article.shot').count())) break;
  }
  console.log('frame siap:', await p.locator('.shot .frame img').count());
  await p.click('button:has-text("Setujui semua frame siap")');
  await p.waitForTimeout(2000);
  await p.reload();
  console.log('stat:', (await p.locator('.stat b').allTextContents()).join(' | '));
  console.log('saldo:', await p.textContent('.wallet .bal'));
  await shot(p, 'e2e-06-storyboard');
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
