import { z } from 'zod';
import { NextResponse } from 'next/server';
import { audit, chargeAndEnqueue, jobFail } from '@atomo/db';
import { moderateText } from '@atomo/prompt-engine';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { enqueueMedia } from '@/lib/queue';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const body = z.object({
  renderId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(4800).default(''),
  tags: z.array(z.string().max(60)).max(20).default([]),
  privacy: z.enum(['private', 'unlisted', 'public']),
  publishAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(8),
});

/** Publish manual ke YouTube (Fase 1). Moderasi wajib sebelum publish, label AI selalu aktif. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`pub:${s.userId}`, 10, 60)) return jsonError(429, 'rate_limited', 'Terlalu sering. Coba lagi sebentar.');
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', p.error.issues[0]?.message ?? 'Body tidak valid');
  const d = p.data;
  if (d.publishAt && !['pro', 'studio'].includes(s.profile.plan)) return jsonError(403, 'plan', 'Publish terjadwal butuh paket Pro.');

  const { data: r } = await s.db.from('renders').select('id, status, url, episode_id, workspace_id, aspect_ratio, duration_sec').eq('id', d.renderId).maybeSingle();
  if (!r || r.status !== 'ready') return jsonError(400, 'render', 'Render belum siap.');
  const { data: acc } = await s.db.from('social_accounts').select('id, platform, status, workspace_id').eq('id', d.socialAccountId).maybeSingle();
  if (!acc || acc.platform !== 'youtube' || acc.workspace_id !== r.workspace_id) return jsonError(400, 'account', 'Akun YouTube tidak ditemukan.');
  if (acc.status !== 'active') return jsonError(409, 'account_inactive', 'Koneksi YouTube terputus. Hubungkan ulang akun.');

  // Moderasi sebelum publish (prefilter teks; review manual untuk yang ditandai).
  const admin = supabaseAdmin();
  const mod = moderateText(`${d.title}\n${d.description}\n${d.tags.join(' ')}`);
  if (mod.verdict !== 'allow') {
    await admin.from('moderation_events').insert({ workspace_id: s.workspaceId, user_id: s.userId, stage: 'publish', verdict: mod.verdict, categories: mod.categories, excerpt: d.title });
    return jsonError(422, 'moderation', mod.verdict === 'block' ? 'Konten melanggar kebijakan dan tidak bisa dipublikasikan.' : 'Konten ditandai untuk ditinjau tim sebelum dipublikasikan.');
  }

  const { data: ep } = await s.db.from('episodes').select('approved_at, project_id').eq('id', r.episode_id).single();
  const variant = r.aspect_ratio === '9:16' && Number(r.duration_sec ?? 0) <= 180 ? 'shorts' : 'youtube';
  const job = await chargeAndEnqueue(admin, {
    userId: s.userId, workspaceId: s.workspaceId, projectId: ep?.project_id ?? null, episodeId: r.episode_id, type: 'publish', action: 'publish.youtube',
    items: [], billing: {}, provider: 'youtube', model: variant, input: { renderId: r.id }, idempotencyKey: d.idempotencyKey, expectedTotal: 0,
  });
  const { data: pub, error } = await admin
    .from('publications')
    .upsert(
      {
        workspace_id: r.workspace_id, render_id: r.id, episode_id: r.episode_id, social_account_id: acc.id, platform: 'youtube', variant,
        privacy: d.privacy, scheduled_at: d.publishAt ?? null, ai_label: true, status: 'queued', error: null,
        metadata: { title: d.title, description: d.description, tags: d.tags, jobId: job.id },
      },
      { onConflict: 'render_id,social_account_id,variant' },
    )
    .select('id, platform_video_id')
    .single();
  if (error || !pub) return jsonError(500, 'db', error?.message ?? 'Gagal membuat publikasi');
  if (pub.platform_video_id) return jsonError(409, 'already', 'Render ini sudah diunggah ke channel tersebut.');
  // Approval kreator dicatat saat publish manual.
  if (!ep?.approved_at) await admin.from('episodes').update({ approved_at: new Date().toISOString(), approved_by: s.userId }).eq('id', r.episode_id);
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'publish.queue', targetType: 'publication', targetId: pub.id, details: { variant, privacy: d.privacy }, ip: clientIp(req.headers) });
  try {
    await enqueueMedia({ kind: 'publish', jobId: job.id, workspaceId: s.workspaceId, publicationId: pub.id });
  } catch {
    await jobFail(admin, job.id, 'Antrean tidak tersedia');
    await admin.from('publications').update({ status: 'failed', error: 'Antrean tidak tersedia' }).eq('id', pub.id);
    return jsonError(503, 'queue_down', 'Antrean sedang tidak tersedia.');
  }
  return NextResponse.json({ publicationId: pub.id, variant, audited: env().YOUTUBE_AUDITED }, { status: 202 });
}
