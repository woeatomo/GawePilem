import { z } from 'zod';
import { NextResponse } from 'next/server';
import { chargeAndEnqueue, jobFail, type Json } from '@atomo/db';
import { timelineSchema } from '@atomo/timeline';
import { getSession } from '@/lib/auth';
import { buildTimeline } from '@/lib/assemble';
import { jsonError } from '@/lib/http';
import { loadProject } from '@/lib/project';
import { enqueueMedia } from '@/lib/queue';
import { rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const QUALITY_BY_PLAN: Record<string, ('480p' | '720p' | '1080p')[]> = {
  free: ['480p', '720p'], creator: ['480p', '720p', '1080p'], pro: ['480p', '720p', '1080p'], studio: ['480p', '720p', '1080p'],
};

/** Rakit otomatis timeline dari shot + VO, simpan sebagai versi, lalu antrekan render FFmpeg (tanpa biaya kredit). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`render:${s.userId}`, 6, 60)) return jsonError(429, 'rate_limited', 'Terlalu sering render. Coba lagi sebentar.');
  const p = z.object({ projectId: z.string().uuid(), episode: z.number().int().positive(), quality: z.enum(['480p', '720p', '1080p']), idempotencyKey: z.string().min(8) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', 'Body tidak valid');
  if (!QUALITY_BY_PLAN[s.profile.plan]?.includes(p.data.quality)) return jsonError(403, 'plan', 'Resolusi ini butuh paket Creator ke atas.');

  const b = await loadProject(s.db, p.data.projectId, p.data.episode);
  if (!b.shots.length) return jsonError(400, 'no_shots', 'Belum ada shot untuk dirakit.');
  const { timeline, missing } = buildTimeline(b);
  const valid = timelineSchema.safeParse(timeline);
  if (!valid.success) return jsonError(400, 'bad_timeline', `Timeline tidak valid: ${valid.error.issues[0]?.message}`);

  const admin = supabaseAdmin();
  const { data: last } = await admin.from('timelines').select('version').eq('episode_id', b.episode.id).order('version', { ascending: false }).limit(1).maybeSingle();
  const { data: tl, error: te } = await s.db
    .from('timelines')
    .insert({ episode_id: b.episode.id, workspace_id: b.project.workspace_id, version: (last?.version ?? 0) + 1, data: valid.data as unknown as { [k: string]: Json }, source: 'auto', note: missing.length ? `Belum lengkap: ${missing.length} item` : 'Rakit otomatis', created_by: s.userId })
    .select('id')
    .single();
  if (te || !tl) return jsonError(500, 'db', te?.message ?? 'Gagal menyimpan timeline');

  const job = await chargeAndEnqueue(admin, {
    userId: s.userId, workspaceId: s.workspaceId, projectId: b.project.id, episodeId: b.episode.id, type: 'render', action: 'render',
    items: [], billing: {}, provider: 'ffmpeg', model: p.data.quality, input: { timelineId: tl.id }, idempotencyKey: p.data.idempotencyKey, expectedTotal: 0,
  });
  const { data: r, error: re } = await admin
    .from('renders')
    .insert({ episode_id: b.episode.id, workspace_id: b.project.workspace_id, timeline_id: tl.id, aspect_ratio: b.project.aspect_ratio, resolution: p.data.quality, status: 'queued' })
    .select('id')
    .single();
  if (re || !r) return jsonError(500, 'db', re?.message ?? 'Gagal membuat render');
  await admin.from('episodes').update({ status: 'edit' }).eq('id', b.episode.id);
  try {
    await enqueueMedia({ kind: 'render', jobId: job.id, workspaceId: s.workspaceId, renderId: r.id });
  } catch {
    await jobFail(admin, job.id, 'Antrean render tidak tersedia');
    await admin.from('renders').update({ status: 'failed', error: 'Antrean render tidak tersedia' }).eq('id', r.id);
    return jsonError(503, 'queue_down', 'Antrean render sedang tidak tersedia. Coba lagi sebentar.');
  }
  return NextResponse.json({ renderId: r.id, jobId: job.id, missing }, { status: 202 });
}
