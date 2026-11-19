import { ProviderError } from '@atomo/ai-gateway';
import type { MediaJobData } from '@atomo/db';
import { PublishError, youtube } from '@atomo/publisher';
import type { Ctx } from '../ctx';
import { beginJob, failJob, progress, succeedJob } from '../job';
import { youtubeAccess } from './youtube-auth';

/** Upload ke YouTube dengan stream dari R2. Idempotent: publikasi ber-platform_video_id dilewati. */
export async function publish(ctx: Ctx, d: Extract<MediaJobData, { kind: 'publish' }>) {
  const job = await beginJob(ctx, d.jobId);
  if (!job) return;
  const { data: pub } = await ctx.admin.from('publications').select('*').eq('id', d.publicationId).single();
  try {
    if (!pub) throw new ProviderError('Publikasi tidak ditemukan', 'youtube', 'bad_request');
    if (pub.platform_video_id) return void (await succeedJob(ctx, job, { videoId: pub.platform_video_id, skipped: true }));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count } = await ctx.admin.from('publications').select('id', { count: 'exact', head: true }).eq('platform', 'youtube').not('platform_video_id', 'is', null).gte('published_at', today.toISOString());
    if ((count ?? 0) >= Number(ctx.env.YOUTUBE_DAILY_UPLOADS ?? 100)) throw new ProviderError('Kuota upload YouTube hari ini habis. Coba lagi besok.', 'youtube', 'bad_request');

    const { data: acc } = await ctx.admin.from('social_accounts').select('*').eq('id', pub.social_account_id).single();
    if (!acc) throw new ProviderError('Akun YouTube tidak ditemukan', 'youtube', 'bad_request');
    try {
      const tokens = await youtubeAccess(ctx, acc);
      const { data: r } = await ctx.admin.from('renders').select('url').eq('id', pub.render_id).single();
      if (!r?.url) throw new ProviderError('File render tidak ada', 'youtube', 'bad_request');
      await ctx.admin.from('publications').update({ status: 'uploading', attempts: pub.attempts + 1, error: null }).eq('id', pub.id);
      const file = await fetch(r.url);
      const size = Number(file.headers.get('content-length') ?? 0);
      if (!file.ok || !file.body || !size) throw new ProviderError('Gagal membaca file render', 'youtube', 'network');
      const meta = pub.metadata as { title: string; description: string; tags: string[]; madeForKids?: boolean };
      let description = meta.description;
      if (pub.variant === 'shorts' && !/#shorts/i.test(meta.title + description)) description += '\n\n#Shorts';
      if (!/dibuat dengan bantuan AI/i.test(description)) description += '\n\nKonten ini dibuat dengan bantuan AI.';
      const up = await youtube.uploadVideo(tokens.accessToken, { stream: file.body, size }, {
        title: meta.title, description, tags: meta.tags, privacy: pub.privacy as 'private' | 'unlisted' | 'public', madeForKids: meta.madeForKids === true,
        ...(pub.scheduled_at ? { publishAt: new Date(pub.scheduled_at).toISOString() } : {}),
      }, fetch, (pct) => void progress(ctx, job.id, pct));
      await ctx.admin.from('publications').update({ status: 'published', platform_video_id: up.videoId, privacy: up.privacy, published_at: new Date().toISOString(), error: null }).eq('id', pub.id);
      if (pub.episode_id) await ctx.admin.from('episodes').update({ status: 'published' }).eq('id', pub.episode_id);
      await ctx.admin.from('audit_log').insert({ actor_id: acc.user_id, workspace_id: acc.workspace_id, action: 'publish.done', target_type: 'publication', target_id: pub.id, details: { videoId: up.videoId, privacy: up.privacy } });
      await succeedJob(ctx, job, { videoId: up.videoId, privacy: up.privacy });
    } catch (e) {
      if (e instanceof PublishError && e.code === 'auth') await ctx.admin.from('social_accounts').update({ status: 'expired', last_error: e.message.slice(0, 300) }).eq('id', acc.id);
      throw e;
    }
  } catch (e) {
    if (pub) await ctx.admin.from('publications').update({ status: 'failed', error: (e as Error).message.slice(0, 500) }).eq('id', pub.id);
    await failJob(ctx, job.id, e);
  }
}
