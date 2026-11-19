import { ProviderError } from '@atomo/ai-gateway';
import type { MediaJobData } from '@atomo/db';
import { muxCommand, outputSize, planSegments, remoteCommand, sliceTimeline, timelineDuration, timelineSchema, toAss, type Quality, type RemoteAsset, type Timeline } from '@atomo/timeline';
import type { Ctx } from '../ctx';
import { renderOpts } from '../render-limits';
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

    const videoAssets = (tl: Timeline) => {
      const out: Record<string, RemoteAsset> = {};
      for (const v of tl.tracks.video) {
        const s = shots?.find((x) => x.id === v.shotId);
        if (s?.clip_url) out[v.shotId] = { url: s.clip_url, kind: 'video' };
        else if (s?.keyframe_url) out[v.shotId] = { url: s.keyframe_url, kind: 'still' };
        else throw new ProviderError(`Shot ${v.shotId} belum punya klip atau frame kunci`, 'jobs', 'bad_request');
      }
      return out;
    };
    const audioAssets = (tl: Timeline) => {
      const out: Record<string, RemoteAsset> = {};
      for (const a of [...tl.tracks.dialog, ...tl.tracks.music, ...tl.tracks.sfx]) {
        if (out[a.assetId]) continue;
        const t = audio?.find((x) => x.id === a.assetId);
        if (!t?.url) throw new ProviderError(`Audio ${a.assetId} tidak ditemukan`, 'jobs', 'bad_request');
        out[a.assetId] = { url: t.url, kind: 'audio' };
      }
      return out;
    };
    const quality = (r.resolution as Quality) ?? '720p';
    const size = outputSize(r.aspect_ratio, quality);
    const reframe = (r.reframe as 'crop' | 'blur' | null) ?? 'crop';
    // Watermark paket Free ditulis ke ASS (libass punya font cadangan), bukan drawtext yang gagal bila server render tanpa font default.
    const subsFor = async (tl: Timeline, name: string) => {
      const watermark = plan === 'free' ? { text: 'Pilem Studio', untilSec: timelineDuration(tl) } : undefined;
      if (!tl.tracks.subtitle.length && !watermark) return undefined;
      const ass = toAss(tl.tracks.subtitle, size, { karaoke: r.aspect_ratio === '9:16', ...(watermark ? { watermark } : {}) });
      return putBytes(ctx, `${r.workspace_id}/renders/${r.id}/${name}.ass`, ass, 'text/plain');
    };

    const segments = planSegments(timeline, Number(ctx.env.RENDER_SEGMENT_SEC ?? 120) || 120);
    if (segments.length > 1) {
      // Episode panjang: segmen video paralel + audio master, lalu digabung tanpa re-encode (lihat ffmpegPoll → maybeMux).
      const client = await ctx.render();
      await ctx.admin.from('render_segments').delete().eq('render_id', r.id);
      await ctx.admin.from('renders').update({ status: 'running', progress: 2, error: null, segment_count: segments.length, mux_claimed_at: null }).eq('id', r.id);
      const total = timelineDuration(timeline);
      const parts = [
        { idx: -1, kind: 'audio' as const, start: 0, end: total, tl: timeline },
        ...segments.map((s, i) => ({ idx: i, kind: 'video' as const, start: s.start, end: s.end, tl: sliceTimeline(timeline, s.start, s.end) })),
      ];
      for (const part of parts) {
        const subtitleUrl = part.kind === 'video' ? await subsFor(part.tl, `subs-${part.idx}`) : undefined;
        const cmd =
          part.kind === 'audio'
            ? remoteCommand(part.tl, { assets: audioAssets(part.tl), quality, parts: 'audio', outputName: `${r.id}-audio.m4a` })
            : remoteCommand(part.tl, { assets: videoAssets(part.tl), quality, parts: 'video', outputAspect: r.aspect_ratio, reframe, outputName: `${r.id}-seg${part.idx}.ts`, ...(subtitleUrl ? { subtitleUrl } : {}) });
        const commandId = await client.submit(cmd, renderOpts(ctx, Math.max(300, Math.round(cmd.duration * 6)), part.kind === 'audio' ? 2 : 8));
        const { data: seg, error } = await ctx.admin
          .from('render_segments')
          .insert({ render_id: r.id, workspace_id: r.workspace_id, idx: part.idx, kind: part.kind, range_start: part.start, range_end: part.end, command_id: commandId })
          .select('id')
          .single();
        if (error || !seg) throw new ProviderError(`Gagal mencatat segmen: ${error?.message}`, 'jobs', 'unknown');
        const key = `${r.workspace_id}/renders/${r.id}/${part.kind === 'audio' ? 'audio' : `seg-${part.idx}`}`;
        await ctx.send(
          { kind: 'ffmpeg_poll', jobId: job.id, workspaceId: r.workspace_id, purpose: 'segment', targetId: seg.id, commandId, key, deadline: Date.now() + 60 * 60_000, startedAt: Date.now(), expectedSec: cmd.duration },
          5,
        );
      }
      return;
    }

    const subtitleUrl = await subsFor(timeline, 'subs');
    const cmd = remoteCommand(timeline, {
      assets: { ...videoAssets(timeline), ...audioAssets(timeline) }, quality, outputName: `${r.id}.mp4`, outputAspect: r.aspect_ratio, reframe,
      ...(subtitleUrl ? { subtitleUrl } : {}),
    });
    const commandId = await (await ctx.render()).submit(cmd, renderOpts(ctx, Math.max(300, Math.round(cmd.duration * 6)), 8));
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
    if (m.purpose === 'segment') {
      const { data: seg } = await ctx.admin.from('render_segments').update({ status: 'failed' }).eq('id', m.targetId).select('render_id').single();
      if (seg) await ctx.admin.from('renders').update({ status: 'failed', error: `Segmen gagal: ${why}`.slice(0, 1000) }).eq('id', seg.render_id);
      await failJob(ctx, m.jobId, new ProviderError(why, 'rendi', 'unknown'));
    } else if (m.purpose === 'render') {
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
    } else if (m.purpose === 'clip') await ctx.admin.from('shots').update({ clip_progress: Math.max(50, pct) }).eq('id', m.targetId);
    return ctx.send(m, m.purpose === 'clip' ? 3 : 10);
  }
  const out = st.outputs.out_1;
  if (st.state === 'failed' || !out) return fail(st.error ?? 'Render gagal');
  if (m.purpose === 'segment') {
    try {
      const { data: seg } = await ctx.admin.from('render_segments').select('kind, render_id').eq('id', m.targetId).single();
      if (!seg) return;
      const url = await putFromUrl(ctx, m.key, out.url, seg.kind === 'audio' ? 'audio/mp4' : 'video/mp2t');
      await ctx.admin.from('render_segments').update({ status: 'ready', url }).eq('id', m.targetId);
      await maybeMux(ctx, m.jobId, seg.render_id);
    } catch (e) {
      if (Date.now() < m.deadline) return ctx.send(m, 15);
      await fail((e as Error).message);
    }
    return;
  }
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

/** Bila semua segmen + audio master siap, kirim perintah gabung (sekali saja, lewat klaim atomik). */
async function maybeMux(ctx: Ctx, jobId: string, renderId: string) {
  const [{ data: r }, { data: segs }] = await Promise.all([
    ctx.admin.from('renders').select('id, workspace_id, segment_count').eq('id', renderId).single(),
    ctx.admin.from('render_segments').select('idx, kind, status, url, range_end').eq('render_id', renderId).order('idx'),
  ]);
  if (!r || !segs) return;
  const expected = r.segment_count + 1;
  const ready = segs.filter((s) => s.status === 'ready' && s.url);
  if (ready.length < expected) {
    const pct = Math.round(5 + (80 * ready.length) / expected);
    await ctx.admin.from('renders').update({ progress: pct }).eq('id', renderId);
    await progress(ctx, jobId, pct);
    return;
  }
  const { data: claimed } = await ctx.admin.from('renders').update({ mux_claimed_at: new Date().toISOString(), progress: 88 }).eq('id', renderId).is('mux_claimed_at', null).select('id');
  if (!claimed?.length) return;
  const video = ready.filter((s) => s.kind === 'video').sort((a, b) => a.idx - b.idx);
  const audio = ready.find((s) => s.kind === 'audio')!;
  const duration = Math.max(...video.map((s) => Number(s.range_end)));
  const cmd = muxCommand({ segmentUrls: video.map((s) => s.url!), audioUrl: audio.url!, duration, outputName: `${renderId}.mp4` });
  const commandId = await (await ctx.render()).submit(cmd, renderOpts(ctx, 900, 2));
  await ctx.send(
    { kind: 'ffmpeg_poll', jobId, workspaceId: r.workspace_id, purpose: 'render', targetId: renderId, commandId, key: `${r.workspace_id}/renders/${renderId}`, deadline: Date.now() + 30 * 60_000, startedAt: Date.now(), expectedSec: duration },
    5,
  );
}
