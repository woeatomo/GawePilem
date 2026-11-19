// Paket & langganan (sandbox), mode AI satu klik, dan kit promosi + render Shorts dari kandidat AI.
const { open, shot, BASE } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const { b, p, errs } = await open();
  const saldo = async () => Number((await p.locator('.stat:has-text("Saldo") b').first().textContent()).replace(/\D/g, ''));

  await p.goto(BASE + '/paket');
  const before = await saldo();
  console.log('paket:', (await p.locator('.plan h3').allTextContents()).join(', '));
  await p.locator('.plan:has(h3:text-is("Pro")) button').click();
  await p.click('button:has-text("Simulasi bayar")');
  await p.waitForSelector('text=Paket Pro aktif', { timeout: 15000 });
  await p.reload();
  console.log('paket kamu:', (await p.locator('.card .big').first().textContent()).trim(), '| saldo +', (await saldo()) - before);
  console.log('creator saat Pro aktif:', (await p.locator('.plan:has(h3:text-is("Creator")) button').textContent()).trim(), (await p.locator('.plan:has(h3:text-is("Creator")) button').isDisabled()) ? '(nonaktif)' : '(AKTIF?)');
  await p.click('button:has-text("3 bulan")');
  await p.waitForURL(/periode=3/);
  console.log('harga 3 bulan Pro:', (await p.locator('.plan:has(h3:text-is("Pro")) .small').first().textContent()).trim());
  console.log('tabel biaya episode:', (await p.locator('.qtable tbody tr').first().innerText()).replace(/\s+/g, ' '));
  await shot(p, 'paket');

  await p.goto(BASE + '/provider');
  await p.click('.aimode:has-text("Gacor")');
  await p.waitForSelector('text=Mode AI: Gacor', { timeout: 10000 });
  await p.reload();
  console.log('mode AI aktif:', (await p.locator('.aimode[aria-pressed="true"] b').textContent()).trim(), '| video tier:', await p.locator('.prov:has-text("Video") select').last().inputValue().catch(() => '?'));
  await shot(p, 'provider-mode');
  await p.click('.aimode:has-text("Seimbang")');
  await p.waitForSelector('text=Mode AI: Seimbang', { timeout: 10000 });

  const proj = fs.readFileSync('project.txt', 'utf8');
  await p.goto(proj + '/publish');
  await p.click('button:has-text("Buat kit promosi")');
  await p.waitForSelector('text=Kandidat Shorts', { timeout: 30000 });
  console.log('judul A/B:', (await p.locator('section:has(h2:text-is("Kit promosi")) .row > span').allTextContents()).slice(0, 3).join(' / '));
  const desc = await p.locator('section:has(h2:text-is("Kit promosi")) pre').textContent();
  console.log('chapter:', desc.split('\n').filter((l) => /^\d+:\d\d /.test(l)).join(' | ') || '(tidak ada)');
  console.log('shorts:', (await p.locator('section:has(h2:text-is("Kit promosi")) .pill.mono').allTextContents()).join(', '));
  await p.locator('button:has-text("Render Shorts 9:16")').first().click();
  await p.waitForSelector('text=Shorts masuk antrean', { timeout: 15000 });
  await shot(p, 'promo');
  await p.goto(proj + '/editor');
  for (let t = 0; t < 60; t++) {
    const pending = await p.locator('tbody .pill:has-text("Antre"), tbody .pill:has-text("Merender")').count();
    if (!pending) break;
    await p.waitForTimeout(2000);
    await p.reload();
  }
  console.log('riwayat render:', (await p.locator('tbody .pill').allTextContents()).join(', '));
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
