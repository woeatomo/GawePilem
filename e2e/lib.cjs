// Pembantu E2E: jalankan berurutan terhadap stack lokal (Supabase + Redis + web + worker, AI_MOCK=1).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const OUT = path.join(__dirname, '.out');
fs.mkdirSync(OUT, { recursive: true });
process.chdir(OUT); // project.txt, render.txt, state.json disimpan di sini
const STATE = path.join(OUT, 'state.json');
async function open() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  p.on('response', (r) => r.status() >= 500 && errs.push(`HTTP ${r.status()} ${r.url()}`));
  return { b, ctx, p, errs, save: () => ctx.storageState({ path: STATE }) };
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
module.exports = { open, shot, BASE };
