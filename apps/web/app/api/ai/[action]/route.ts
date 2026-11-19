import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ACTION_IDS, type ActionId } from '@/lib/ai/actions';
import { ActionError, estimateAction, executeAction } from '@/lib/ai/execute';
import { jsonError } from '@/lib/http';
import { loadProject } from '@/lib/project';
import { clientIp, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const body = z.object({
  projectId: z.string().uuid(),
  episode: z.number().int().positive().default(1),
  params: z.unknown().optional(),
  expectedTotal: z.number().int().nonnegative().nullable().default(null),
  confirmed: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100),
  /** true = hanya hitung estimasi, tanpa charge. */
  estimateOnly: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!(ACTION_IDS as readonly string[]).includes(action)) return jsonError(404, 'unknown_action', 'Aksi tidak dikenal');

  const session = await getSession();
  if (!session) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (!session.profile.age_confirmed_at) return jsonError(403, 'onboarding', 'Selesaikan onboarding dulu.');

  // Rate limit per user dan per IP di semua route AI.
  const ip = clientIp(req.headers);
  const [wu, wi] = await Promise.all([rateLimit(`ai:u:${session.userId}`, 30, 60), rateLimit(`ai:ip:${ip}`, 60, 60)]);
  if (wu || wi) return jsonError(429, 'rate_limited', `Terlalu banyak permintaan. Coba lagi dalam ${Math.max(wu, wi)} detik.`);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Body tidak valid');
  const b = parsed.data;

  try {
    const bundle = await loadProject(session.db, b.projectId, b.episode);
    if (b.estimateOnly) {
      const { estimate } = await estimateAction(session, bundle, action as ActionId, b.params ?? {});
      return NextResponse.json({ estimate });
    }
    const r = await executeAction({
      session, bundle, action: action as ActionId, rawParams: b.params ?? {},
      expectedTotal: b.expectedTotal, confirmed: b.confirmed, idempotencyKey: b.idempotencyKey,
    });
    if (r.kind === 'stream')
      return new Response(r.stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-job-id': r.job.id } });
    if (r.kind === 'queued') return NextResponse.json({ jobId: r.job.id, status: 'queued', cost: r.job.cost }, { status: 202 });
    return NextResponse.json({ jobId: r.job.id, cost: r.job.cost, data: r.data });
  } catch (e) {
    if (e instanceof ActionError) return jsonError(e.status, e.code, e.message, e.extra);
    console.error(`[ai/${action}]`, e);
    return jsonError(500, 'internal', 'Terjadi kesalahan server.');
  }
}
