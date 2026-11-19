import type { Json, MediaJobData } from '@atomo/db';
import { ANALYTICS_SCOPE, PublishError, youtube } from '@atomo/publisher';
import type { Ctx } from '../ctx';
import { youtubeAccess } from './youtube-auth';

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sinkron statistik channel & video yang diunggah lewat aplikasi. Idempotent (snapshot ditimpa).
 * Analytics API butuh scope yt-analytics.readonly; akun lama tanpa scope itu tetap dapat views/likes.
 */
export async function syncMetrics(ctx: Ctx, d: Extract<MediaJobData, { kind: 'metrics' }>) {
  const { data: acc } = await ctx.admin.from('social_accounts').select('*').eq('id', d.socialAccountId).eq('workspace_id', d.workspaceId).maybeSingle();
  if (!acc || acc.platform !== 'youtube' || acc.status !== 'active') return;
  try {
    const { accessToken } = await youtubeAccess(ctx, acc);
    const { data: pubs } = await ctx.admin
      .from('publications')
      .select('id, platform_video_id, published_at')
      .eq('social_account_id', acc.id)
      .not('platform_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(200);
    const ids = (pubs ?? []).map((p) => p.platform_video_id!);
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
    const channel = await youtube.channelStats(accessToken);
    const stats = ids.length ? await youtube.videoStats(accessToken, ids) : {};

    const hasAnalyticsScope = acc.scopes.includes(ANALYTICS_SCOPE);
    let analytics: Awaited<ReturnType<typeof youtube.videoAnalytics>> = {};
    let watchMinutes365: number | null = null;
    let analyticsError: string | null = hasAnalyticsScope ? null : 'scope';
    if (hasAnalyticsScope) {
      try {
        if (ids.length) analytics = await youtube.videoAnalytics(accessToken, ids, day(yearAgo), day(now));
        const [row] = await youtube.analyticsReport(accessToken, { startDate: day(yearAgo), endDate: day(now), metrics: ['estimatedMinutesWatched', 'subscribersGained'] });
        watchMinutes365 = Number(row?.estimatedMinutesWatched ?? 0);
      } catch (e) {
        analyticsError = e instanceof PublishError && e.status === 403 ? 'scope' : 'unavailable';
        ctx.log('analytics gagal', { account: acc.id, error: (e as Error).message });
      }
    }

    const at = now.toISOString();
    for (const p of pubs ?? []) {
      const v = p.platform_video_id!;
      const m = { ...(stats[v] ?? {}), ...(analytics[v] ?? {}) };
      await ctx.admin.from('publications').update({ metrics: m as unknown as Json, metrics_at: at }).eq('id', p.id);
    }
    await ctx.admin
      .from('social_accounts')
      .update({ metrics: { ...channel, watchMinutes365, analyticsError } as unknown as Json, metrics_at: at })
      .eq('id', acc.id);
    ctx.log('metrik disinkron', { account: acc.id, videos: ids.length });
  } catch (e) {
    if (e instanceof PublishError && e.code === 'auth') await ctx.admin.from('social_accounts').update({ status: 'expired', last_error: e.message.slice(0, 300) }).eq('id', acc.id);
    // metrics_at sengaja tidak diubah: data lama tidak boleh tampak baru. Cron mencoba lagi jam berikutnya.
    ctx.log('sinkron metrik gagal', { account: acc.id, error: (e as Error).message });
  }
}

/** Cron: antrekan sinkron untuk akun yang datanya lebih tua dari 6 jam (maks 50 per putaran). */
export async function scheduleMetrics(ctx: Ctx) {
  const due = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data } = await ctx.admin
    .from('social_accounts')
    .select('id, workspace_id')
    .eq('platform', 'youtube')
    .eq('status', 'active')
    .or(`metrics_at.is.null,metrics_at.lt.${due}`)
    .order('metrics_at', { ascending: true, nullsFirst: true })
    .limit(50);
  for (const a of data ?? []) await ctx.send({ kind: 'metrics', jobId: `metrics-${a.id}`, workspaceId: a.workspace_id, socialAccountId: a.id });
  if (data?.length) ctx.log('sinkron metrik dijadwalkan', { accounts: data.length });
}
