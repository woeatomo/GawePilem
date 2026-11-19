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
  const p = z.object({ projectId: z.string().uuid(), episode: z.number().int().positive(), quality: z.enum(['480p', '720p', '1080p']), idempotencyKey: z.string().min(8), mode: z.enum(['auto', 'latest']).default('latest'),
    teaser: z.object({ start: z.number().min(0), end: z.number().positive(), aspect: z.enum(['9:16', '16:9', '1:1']).default('9:16'), reframe: z.enum(['crop', 'blur']).default('blur') }).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', 'Body tidak valid');
  if (!QUALITY_BY_PLAN[s.profile.plan]?.includes(p.data.quality)) return jsonError(403, 'plan', 'Resolusi ini butuh paket Creator ke atas.');

  const t = p.data.teaser;
  if (t && (t.end - t.start < 1 || t.end - t.start > 180)) return jsonError(400, 'bad_range', 'Durasi teaser 1–180 detik (batas YouTube Shorts 3 menit).');
  const b = await loadProject(s.db, p.data.projectId, p.data.episode);
  if (!b.shots.length) return jsonError(400, 'no_shots', 'Belum ada shot untuk dirakit.');
  const admin = supabaseAdmin();
  let tl: { id: string };
  let missing: string[] = [];
  // Render versi timeline tersimpan (hasil edit) bila ada; selain itu rakit otomatis lalu simpan.
  if (p.data.mode === 'latest' && b.timeline && timelineSchema.safeParse(b.timeline.data).success) {
    tl = { id: b.timeline.id };
  } else {
    const built = buildTimeline(b);
    missing = built.missing;
    const valid = timelineSchema.safeParse(built.timeline);
    if (!valid.success) return jsonError(400, 'bad_timeline', `Timeline tidak valid: ${valid.error.issues[0]?.message}`);
    const { data: ins, error: te } = await s.db
      .from('timelines')
      .insert({ episode_id: b.episode.id, workspace_id: b.project.workspace_id, version: (b.timeline?.version ?? 0) + 1, data: valid.data as unknown as { [k: string]: Json }, source: 'auto', note: missing.length ? `Belum lengkap: ${missing.length} item` : 'Rakit otomatis', created_by: s.userId })
      .select('id')
      .single();
    if (te || !ins) return jsonError(500, 'db', te?.message ?? 'Gagal menyimpan timeline');
    tl = ins;
  }

  const job = await chargeAndEnqueue(admin, {
    userId: s.userId, workspaceId: s.workspaceId, projectId: b.project.id, episodeId: b.episode.id, type: 'render', action: 'render',
    items: [], billing: {}, provider: 'ffmpeg', model: p.data.quality, input: { timelineId: tl.id }, idempotencyKey: p.data.idempotencyKey, expectedTotal: 0,
  });
  const { data: r, error: re } = await admin
    .from('renders')
    .insert({
      episode_id: b.episode.id, workspace_id: b.project.workspace_id, timeline_id: tl.id, resolution: p.data.quality, status: 'queued',
      ...(t
        ? { variant: 'teaser', aspect_ratio: t.aspect, range_start: t.start, range_end: t.end, reframe: t.aspect === b.project.aspect_ratio ? 'crop' : t.reframe }
        : { variant: 'master', aspect_ratio: b.project.aspect_ratio }),
    })
    .select('id')
    .single();
  if (re || !r) return jsonError(500, 'db', re?.message ?? 'Gagal membuat render');
  if (!t) await admin.from('episodes').update({ status: 'edit' }).eq('id', b.episode.id);
  try {
    await enqueueMedia({ kind: 'render', jobId: job.id, workspaceId: s.workspaceId, renderId: r.id });
  } catch {
    await jobFail(admin, job.id, 'Antrean render tidak tersedia');
    await admin.from('renders').update({ status: 'failed', error: 'Antrean render tidak tersedia' }).eq('id', r.id);
    return jsonError(503, 'queue_down', 'Antrean render sedang tidak tersedia. Coba lagi sebentar.');
  }
  return NextResponse.json({ renderId: r.id, jobId: job.id, missing }, { status: 202 });
}
