// Analitik (akun YouTube & metrik disemai lewat DB karena E2E tidak bisa OAuth ke Google) + UI publish terjadwal.
const { open, shot, BASE } = require('./lib.cjs');
const fs = require('fs');
const { execFileSync } = require('child_process');
const sql = (q) => execFileSync('docker', ['exec', 'supabase_db_atomo-film-studio', 'psql', '-U', 'postgres', '-tAc', q], { encoding: 'utf8' }).trim();
(async () => {
  const proj = fs.readFileSync('project.txt', 'utf8');
  const projectId = proj.split('/studio/')[1].split(/[/?]/)[0];
  const [ws, owner] = sql(`select p.workspace_id || '|' || w.owner_id from projects p join workspaces w on w.id = p.workspace_id where p.id = '${projectId}'`).split('|');
  const master = sql(`select r.id || '|' || r.episode_id from renders r join episodes e on e.id = r.episode_id where e.project_id = '${projectId}' and r.variant = 'master' and r.status = 'ready' order by r.created_at desc limit 1`).split('|');
  sql(`delete from social_accounts where workspace_id = '${ws}' and channel_id = 'UC-e2e'`);
  const acc = sql(`insert into social_accounts (workspace_id, user_id, platform, channel_id, channel_name, encrypted_tokens, scopes, metrics, metrics_at)
    values ('${ws}', '${owner}', 'youtube', 'UC-e2e', 'Kanal Uji Pilem', 'x', array['https://www.googleapis.com/auth/yt-analytics.readonly'],
    '{"subscribers": 640, "views": 52000, "videos": 14, "watchMinutes365": 96000, "analyticsError": null}', now()) returning id`).split('\n')[0];
  sql(`insert into publications (workspace_id, render_id, episode_id, social_account_id, platform, variant, platform_video_id, privacy, status, published_at, metadata, metrics, metrics_at)
    values ('${ws}', '${master[0]}', '${master[1]}', '${acc}', 'youtube', 'youtube', 'vid-e2e-1', 'public', 'published', now() - interval '5 days',
    '{"title": "Penjaga Gerbang Senja · Eps 1"}', '{"views": 1830, "likes": 140, "comments": 22, "privacy": "public", "minutesWatched": 2400, "avgViewDurationSec": 512, "avgViewPct": 24.5, "subsGained": 31}', now())`);

  const { b, p, errs } = await open();
  await p.goto(BASE + '/analitik');
  console.log('channel:', (await p.locator('.card h2').first().textContent()).trim());
  console.log('stat:', (await p.locator('.stats .stat').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | '));
  console.log('baris video:', (await p.locator('.qtable tbody tr').first().innerText()).replace(/\s+/g, ' ').slice(0, 220));
  await shot(p, 'analitik');
  const r = await p.evaluate(() => globalThis.fetch('/api/analytics/refresh', { method: 'POST' }).then((x) => x.status));
  console.log('perbarui sekarang:', r, '| ulang langsung:', await p.evaluate(() => globalThis.fetch('/api/analytics/refresh', { method: 'POST' }).then((x) => x.status)));

  await p.goto(proj + '/publish');
  const teaser = await p.locator('#rd option', { hasText: 'Teaser' }).first().getAttribute('value');
  await p.selectOption('#rd', teaser);
  await p.fill('#tt', 'Teaser Penjaga Gerbang Senja');
  await p.click('.seg button:has-text("Jadwalkan")');
  // terlalu dekat → ditolak server
  const soon = new Date(Date.now() + 5 * 60_000);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await p.fill('input[aria-label="Jadwal tayang"]', local);
  await p.click('button:has-text("Unggah & jadwalkan")');
  await p.waitForSelector('text=minimal 15 menit', { timeout: 10000 });
  console.log('validasi jadwal: ok');
  await p.click('button:has-text("Kamis 19.00")');
  console.log('catatan jadwal:', (await p.locator('p.small.muted:has-text("menayangkannya publik")').textContent()).trim().slice(0, 120));
  console.log('peringatan audit:', (await p.locator('text=belum lolos audit Google, video terkunci').count()) > 0);
  await shot(p, 'publish-jadwal');
  await p.click('button:has-text("Unggah & jadwalkan")');
  await p.waitForSelector('text=Diunggah sekarang, tayang', { timeout: 10000 });
  const row = sql(`select variant || ' ' || to_char(scheduled_at at time zone 'Asia/Jakarta', 'Dy HH24:MI') from publications where social_account_id = '${acc}' and variant = 'shorts'`);
  console.log('publikasi terjadwal:', row);
  console.log('errors:', errs.filter((e) => !/status of 4\d\d/.test(e)));
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); process.exit(1); });
