import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { enqueueMedia } from '@/lib/queue';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** Minta sinkron statistik YouTube sekarang (selain jadwal otomatis tiap 6 jam). Gratis, dibatasi 1×/10 menit. */
export async function POST() {
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`metrics:${s.workspaceId}`, 1, 600)) return jsonError(429, 'rate_limited', 'Statistik baru saja diperbarui. Coba lagi 10 menit lagi.');
  const { data: accs } = await s.db.from('social_accounts').select('id').eq('workspace_id', s.workspaceId).eq('platform', 'youtube').eq('status', 'active');
  if (!accs?.length) return jsonError(400, 'no_account', 'Belum ada channel YouTube yang terhubung.');
  for (const a of accs) await enqueueMedia({ kind: 'metrics', jobId: `metrics-${a.id}-${Date.now()}`, workspaceId: s.workspaceId, socialAccountId: a.id });
  return NextResponse.json({ ok: true, accounts: accs.length }, { status: 202 });
}
