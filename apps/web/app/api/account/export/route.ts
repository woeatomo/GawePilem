import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** Ekspor data pribadi & karya (hak akses data, UU PDP). Tanpa kolom rahasia. */
export async function GET() {
  const s = await getSession();
  if (!s) return new NextResponse('Unauthorized', { status: 401 });
  if (await rateLimit(`export:${s.userId}`, 3, 3600)) return new NextResponse('Terlalu sering, coba lagi nanti.', { status: 429 });
  const db = s.db;
  const [projects, bible, episodes, characters, scripts, shots, ledger, orders, jobs, publications] = await Promise.all([
    db.from('projects').select('*'),
    db.from('series_bible').select('*'),
    db.from('episodes').select('*'),
    db.from('characters').select('*'),
    db.from('scripts').select('*'),
    db.from('shots').select('*'),
    db.from('credit_ledger').select('id, type, amount, description, created_at, expires_at'),
    db.from('topup_orders').select('id, pack_id, amount_idr, credits, status, payment_method, created_at, paid_at'),
    db.from('jobs').select('id, type, action, provider, model, billing_mode, cost, status, created_at').eq('user_id', s.userId),
    db.from('publications').select('id, platform, variant, platform_video_id, status, created_at'),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    profile: { id: s.userId, email: s.email, display_name: s.profile.display_name, plan: s.profile.plan, locale: s.profile.locale, age_confirmed_at: s.profile.age_confirmed_at, data_consent_at: s.profile.data_consent_at, created_at: s.profile.created_at },
    projects: projects.data, series_bible: bible.data, episodes: episodes.data, characters: characters.data, scripts: scripts.data, shots: shots.data,
    credit_ledger: ledger.data, topup_orders: orders.data, jobs: jobs.data, publications: publications.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="atomo-data-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
}
