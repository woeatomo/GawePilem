import { ProviderError } from '@atomo/ai-gateway';
import type { MediaJobData } from '@atomo/db';
import { outputSize, remoteCommand, sliceTimeline, timelineDuration, timelineSchema, toAss, type Quality, type RemoteAsset, type Timeline } from '@atomo/timeline';
import type { Ctx } from '../ctx';
import { beginJob, failJob, loadRunningJob, progress, succeedJob } from '../job';
import type { InternalMessage } from '../messages';
import { putBytes, putFromUrl } from '../storage';
import { finishClipsIfDone } from './media';

/** Render timeline di layanan FFmpeg cloud (Rendi). Idempotent: file hasil bernama sesuai render id. */
export async function render(ctx: Ctx, d: Extract<MediaJobData, { kind: 'render' }>) {
  const job = await beginJob(ctx, d.jobId);
  if (!job) return;
  try {
    const { data: r } = await ctx.admin.from('renders').select('*').eq('id', d.renderId).single();
    if (!r) throw new ProviderError('Render tidak ditemukan', 'jobs', 'bad_request');
    if (r.status === 'ready' && r.url) return void (await succeedJob(ctx, job, { url: r.url, skipped: true }));
    const { data: tl } = await ctx.admin.from('timelines').select('data').eq('id', r.timeline_id!).single();
    const full = timelineSchema.parse(tl?.data);
    const timeline: Timeline =
      r.variant === 'teaser' && r.range_start !== null && r.range_end !== null ? sliceTimeline(full, Number(r.range_start), Number(r.range_end)) : full;
    const [{ data: shots }, { data: audio }, { data: owner }] = await Promise.all([
      ctx.admin.from('shots').select('id, clip_url, keyframe_url').eq('episode_id', r.episode_id),
      ctx.admin.from('audio_tracks').select('id, url').eq('episode_id', r.episode_id),
      ctx.admin.from('workspaces').select('profiles(plan)').eq('id', r.workspace_id).single(),
    ]);
    const plan = (owner?.profiles as unknown as { plan: string } | null)?.plan ?? 'free';

    const assets: Record<string, RemoteAsset> = {};
    for (const v of timeline.tracks.video) {
      const s = shots?.find((x) => x.id === v.shotId);
      if (s?.clip_url) assets[v.shotId] = { url: s.clip_url, kind: 'video' };
      else if (s?.keyframe_url) assets[v.shotId] = { url: s.keyframe_url, kind: 'still' };
      else throw new ProviderError(`Shot ${v.shotId} belum punya klip atau frame kunci`, 'jobs', 'bad_request');
    }
    for (const a of [...timeline.tracks.dialog, ...timeline.tracks.music, ...timeline.tracks.sfx]) {
      if (assets[a.assetId]) continue;
      const t = audio?.find((x) => x.id === a.assetId);
      if (!t?.url) throw new ProviderError(`Audio ${a.assetId} tidak ditemukan`, 'jobs', 'bad_request');
      assets[a.assetId] = { url: t.url, kind: 'audio' };
    }
    const quality = (r.resolution as Quality) ?? '720p';
    const size = outputSize(r.aspect_ratio, quality);
    // Watermark paket Free ditulis ke ASS (libass punya font cadangan), bukan drawtext yang gagal bila server render tanpa font default.
    const watermark = plan === 'free' ? { text: 'Atomo Film Studio', untilSec: timelineDuration(timeline) } : undefined;
    let subtitleUrl: string | undefined;
    if (timeline.tracks.subtitle.length || watermark) {
      const ass = toAss(timeline.tracks.subtitle, size, { karaoke: r.aspect_ratio === '9:16', ...(watermark ? { watermark } : {}) });
      subtitleUrl = await putBytes(ctx, `${r.workspace_id}/renders/${r.id}/subs.ass`, ass, 'text/plain');
    }
    const cmd = remoteCommand(timeline, {
      assets, quality, outputName: `${r.id}.mp4`, outputAspect: r.aspect_ratio, reframe: (r.reframe as 'crop' | 'blur' | null) ?? 'crop',
      ...(subtitleUrl ? { subtitleUrl } : {}),
    });
    const commandId = await (await ctx.render()).submit(cmd, { maxSeconds: Math.max(300, Math.round(cmd.duration * 6)), vcpu: 8 });
    await ctx.admin.from('renders').update({ status: 'running', progress: 2, error: null }).eq('id', r.id);
    await ctx.send(
      { kind: 'ffmpeg_poll', jobId: job.id, workspaceId: r.workspace_id, purpose: 'render', targetId: r.id, commandId, key: `${r.workspace_id}/renders/${r.id}`, deadline: Date.now() + 60 * 60_000, startedAt: Date.now(), expectedSec: cmd.duration },
      5,
    );
  } catch (e) {
    await ctx.admin.from('renders').update({ status: 'failed', error: (e as Error).message.slice(0, 1000) }).eq('id', d.renderId);
    await failJob(ctx, job.id, e);
  }
}

/** Cek status perintah FFmpeg remote; ulangi lewat pesan tertunda sampai selesai. */
export async function ffmpegPoll(ctx: Ctx, m: Extract<InternalMessage, { kind: 'ffmpeg_poll' }>) {
  const job = await loadRunningJob(ctx, m.jobId);
  if (!job) return;
  const fail = async (why: string) => {
    if (m.purpose === 'render') {
      await ctx.admin.from('renders').update({ status: 'failed', error: why.slice(0, 1000) }).eq('id', m.targetId);
      await failJob(ctx, m.jobId, new ProviderError(why, 'rendi', 'unknown'));
    } else {
      await ctx.admin.from('shots').update({ clip_status: 'failed' }).eq('id', m.targetId);
      await finishClipsIfDone(ctx, m.jobId);
    }
  };
  let st;
  try {
    st = await (await ctx.render()).status(m.commandId);
  } catch (e) {
    if (Date.now() < m.deadline) return ctx.send(m, 15);
    return fail((e as Error).message);
  }
  if (st.state === 'queued' || st.state === 'running') {
    if (Date.now() > m.deadline) return fail('Render melewati batas waktu');
    // Perkiraan progres dari waktu berjalan (render ±1–3× durasi video).
    const pct = Math.min(95, Math.round(((Date.now() - m.startedAt) / 1000 / Math.max(10, m.expectedSec * 2)) * 100));
    if (m.purpose === 'render') {
      await ctx.admin.from('renders').update({ progress: Math.max(3, pct) }).eq('id', m.targetId);
      await progress(ctx, m.jobId, pct);
    } else await ctx.admin.from('shots').update({ clip_progress: Math.max(50, pct) }).eq('id', m.targetId);
    return ctx.send(m, m.purpose === 'render' ? 10 : 3);
  }
  const out = st.outputs.out_1;
  if (st.state === 'failed' || !out) return fail(st.error ?? 'Render gagal');
  try {
    const url = await putFromUrl(ctx, m.key, out.url, 'video/mp4');
    if (m.purpose === 'render') {
      const { data: r } = await ctx.admin.from('renders').update({ status: 'ready', progress: 100, url, duration_sec: out.duration ?? m.expectedSec, finished_at: new Date().toISOString() }).eq('id', m.targetId).select('episode_id, variant').single();
      if (r?.variant === 'master') await ctx.admin.from('episodes').update({ status: 'ready' }).eq('id', r.episode_id);
      await succeedJob(ctx, job, { url, sizeMb: out.sizeMb ?? null, duration: out.duration ?? m.expectedSec });
    } else {
      await ctx.admin.from('shots').update({ clip_url: url, clip_status: 'ready', clip_progress: 100 }).eq('id', m.targetId);
      await finishClipsIfDone(ctx, m.jobId);
    }
  } catch (e) {
    if (Date.now() < m.deadline) return ctx.send(m, 15);
    await fail((e as Error).message);
  }
}
