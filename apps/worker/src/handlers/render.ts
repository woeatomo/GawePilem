import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderError } from '@atomo/ai-gateway';
import type { Job } from '@atomo/db';
import { compileTimeline, outputSize, timelineSchema, toAss, type AssetRef, type Quality } from '@atomo/timeline';
import { admin } from '../db';
import { progress, type JobResult } from '../job';
import { fetchAsset, storage } from '../storage';
import { parseProgress, runFfmpeg } from './ffmpeg';

/**
 * Render timeline → MP4. Idempotent: output disimpan dengan nama berdasarkan render id,
 * jadi retry menimpa file yang sama.
 */
export async function render(job: Job, renderId: string): Promise<JobResult> {
  const { data: r } = await admin.from('renders').select('*').eq('id', renderId).single();
  if (!r) throw new ProviderError('Render tidak ditemukan', 'worker', 'bad_request');
  if (r.status === 'ready' && r.url) return { output: { url: r.url, skipped: true } };
  const { data: tl } = await admin.from('timelines').select('data').eq('id', r.timeline_id!).single();
  const timeline = timelineSchema.parse(tl?.data);
  const [{ data: shots }, { data: audio }, { data: ep }] = await Promise.all([
    admin.from('shots').select('id, clip_url, keyframe_url').eq('episode_id', r.episode_id),
    admin.from('audio_tracks').select('id, url').eq('episode_id', r.episode_id),
    admin.from('episodes').select('project_id, projects(title)').eq('id', r.episode_id).single(),
  ]);
  const { data: owner } = await admin.from('workspaces').select('owner_id, profiles(plan)').eq('id', r.workspace_id).single();
  const plan = (owner?.profiles as unknown as { plan: string } | null)?.plan ?? 'free';

  await admin.from('renders').update({ status: 'running', progress: 1, error: null }).eq('id', r.id);
  const dir = await mkdtemp(join(tmpdir(), `render-${r.id}-`));
  try {
    const assets: Record<string, AssetRef> = {};
    const download = async (id: string, url: string, kind: AssetRef['kind'], ext: string) => {
      const a = await fetchAsset(url);
      const path = join(dir, `${id}.${ext}`);
      await writeFile(path, a.data);
      assets[id] = { path, kind };
    };
    for (const v of timeline.tracks.video) {
      const s = shots?.find((x) => x.id === v.shotId);
      if (s?.clip_url) await download(v.shotId, s.clip_url, 'video', 'mp4');
      else if (s?.keyframe_url) await download(v.shotId, s.keyframe_url, 'still', 'png');
      else throw new ProviderError(`Shot ${v.shotId} belum punya klip atau frame kunci`, 'worker', 'bad_request');
    }
    for (const d of [...timeline.tracks.dialog, ...timeline.tracks.music, ...timeline.tracks.sfx]) {
      if (assets[d.assetId]) continue;
      const t = audio?.find((x) => x.id === d.assetId);
      if (!t?.url) throw new ProviderError(`Audio ${d.assetId} tidak ditemukan`, 'worker', 'bad_request');
      await download(d.assetId, t.url, 'audio', t.url.endsWith('.wav') ? 'wav' : 'mp3');
    }
    const quality = (r.resolution as Quality) ?? '720p';
    const size = outputSize(timeline.aspect, quality);
    let subtitlePath: string | undefined;
    if (timeline.tracks.subtitle.length) {
      subtitlePath = join(dir, 'subs.ass');
      await writeFile(subtitlePath, toAss(timeline.tracks.subtitle, size, { karaoke: timeline.aspect === '9:16' }));
    }
    const out = join(dir, 'out.mp4');
    const cmd = compileTimeline(timeline, {
      assets, outputPath: out, quality, ...(subtitlePath ? { subtitlePath } : {}),
      ...(plan === 'free' ? { watermark: 'Atomo Film Studio' } : {}),
    });
    let lastPct = 0;
    await runFfmpeg(cmd.args, (chunk) => {
      const pct = parseProgress(chunk, cmd.duration);
      if (pct !== null && pct - lastPct >= 5) {
        lastPct = pct;
        void admin.from('renders').update({ progress: pct }).eq('id', r.id);
        void progress(job.id, pct);
      }
    });
    const data = new Uint8Array(await readFile(out));
    const title = (ep?.projects as unknown as { title: string } | null)?.title ?? 'render';
    const url = await storage.put(`${r.workspace_id}/renders/${r.id}.mp4`, data, 'video/mp4');
    await admin.from('renders').update({ status: 'ready', progress: 100, url, duration_sec: cmd.duration, finished_at: new Date().toISOString() }).eq('id', r.id);
    await admin.from('episodes').update({ status: 'ready' }).eq('id', r.episode_id);
    return { output: { url, bytes: data.byteLength, duration: cmd.duration, title } };
  } catch (e) {
    await admin.from('renders').update({ status: 'failed', error: (e as Error).message.slice(0, 1000) }).eq('id', r.id);
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
