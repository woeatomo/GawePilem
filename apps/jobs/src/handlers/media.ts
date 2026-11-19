import { ProviderError, type CharacterReference } from '@atomo/ai-gateway';
import { chunks, type MediaJobData, type Row } from '@atomo/db';
import { extractDialog, findStyle } from '@atomo/prompt-engine';
import { stillToClipCommand, type CameraMove, type Quality, type Timeline } from '@atomo/timeline';
import type { Ctx } from '../ctx';
import { renderOpts } from '../render-limits';
import { beginJob, deadlineFrom, failJob, loadRunningJob, progress, succeedJob } from '../job';
import type { InternalMessage } from '../messages';
import { putBytes, putFromUrl } from '../storage';

type Acc = { done: number; failed: number; failedSec: number };
const negativeFor = (style: string) => `${findStyle(style).negative}, celebrity likeness, copyrighted character`;

const ANGLES = [
  { angle: 'depan', prompt: 'front-facing head and shoulders portrait, neutral expression, looking at camera' },
  { angle: '3/4', prompt: 'three-quarter view head and shoulders portrait' },
  { angle: 'samping', prompt: 'side profile portrait' },
  { angle: 'full', prompt: 'full body shot, standing, neutral pose' },
] as const;

async function project(ctx: Ctx, projectId: string) {
  const { data } = await ctx.admin.from('projects').select('*').eq('id', projectId).single();
  if (!data) throw new ProviderError('Project tidak ditemukan', 'jobs', 'bad_request');
  return data;
}

async function projectOfEpisode(ctx: Ctx, episodeId: string) {
  const { data: ep } = await ctx.admin.from('episodes').select('project_id').eq('id', episodeId).single();
  if (!ep) throw new ProviderError('Episode tidak ditemukan', 'jobs', 'bad_request');
  return project(ctx, ep.project_id);
}

function shotPrompt(s: Row<'shots'>): { image: string; motion: string } {
  try {
    const p = JSON.parse(s.prompt) as { image?: string; motion?: string };
    return { image: p.image ?? s.description, motion: p.motion ?? s.camera };
  } catch {
    return { image: s.prompt || s.description, motion: s.camera };
  }
}

async function lockedRefs(ctx: Ctx, characterIds: string[]): Promise<CharacterReference[]> {
  if (!characterIds.length) return [];
  const { data } = await ctx.admin.from('characters').select('id, name, ref_images, locked_at, voice_id').in('id', characterIds);
  const unlocked = (data ?? []).filter((c) => !c.locked_at);
  if (unlocked.length) throw new ProviderError(`Karakter belum dikunci: ${unlocked.map((c) => c.name).join(', ')}`, 'jobs', 'bad_request');
  return (data ?? []).map((c) => ({
    characterId: c.id,
    name: c.name,
    imageUrls: ((c.ref_images as { url: string }[]) ?? []).map((r) => r.url),
    ...(c.voice_id ? { voiceId: c.voice_id } : {}),
  }));
}

// ---------------- reference karakter ----------------

export async function charref(ctx: Ctx, d: Extract<MediaJobData, { kind: 'charref' }>) {
  const job = await beginJob(ctx, d.jobId);
  if (!job) return;
  try {
    const { data: c } = await ctx.admin.from('characters').select('*').eq('id', d.characterId).single();
    if (!c) throw new ProviderError('Karakter tidak ditemukan', 'jobs', 'bad_request');
    if (c.locked_at) throw new ProviderError('Karakter terkunci', 'jobs', 'bad_request');
    const p = await project(ctx, c.project_id);
    const vs = findStyle(p.visual_style);
    const setting = await ctx.settingFor(job.workspace_id, 'image', job);
    const gw = await ctx.gateway();
    const seed = Math.floor(Math.random() * 2 ** 31);
    const refs: { angle: string; url: string }[] = [];
    for (const [i, a] of ANGLES.entries()) {
      const prompt = `${vs.charSheet}, ${a.prompt}. Age ${c.age ?? 'adult'}. ${c.look}. ${vs.imageStyle}. Original character: not a real person, not based on any existing film, anime, game, or cartoon character.`;
      const characters: CharacterReference[] = refs[0] ? [{ characterId: c.id, name: c.name, imageUrls: [refs[0].url] }] : [];
      const { images } = await gw.generateImage(setting, { prompt, negativePrompt: negativeFor(p.visual_style), aspect: '1:1', seed, characters });
      refs.push({ angle: a.angle, url: await putFromUrl(ctx, `${job.workspace_id}/characters/${c.id}/${job.id}-${i}`, images[0]!.url, 'image/png') });
      await progress(ctx, job.id, ((i + 1) / ANGLES.length) * 100);
    }
    await ctx.admin.from('characters').update({ ref_images: refs }).eq('id', c.id);
    await succeedJob(ctx, job, { refs: refs.length, seed });
  } catch (e) {
    await failJob(ctx, job.id, e);
  }
}

// ---------------- frame kunci (dengan kelanjutan) ----------------

export async function keyframes(ctx: Ctx, d: Extract<MediaJobData, { kind: 'keyframe' }> & { acc?: Acc }) {
  const job = d.acc ? await loadRunningJob(ctx, d.jobId) : await beginJob(ctx, d.jobId);
  if (!job) return;
  const total = ((job.input as { params?: { shotIds?: string[] } }).params?.shotIds ?? d.shotIds).length;
  const acc: Acc = d.acc ?? { done: 0, failed: 0, failedSec: 0 };
  const late = deadlineFrom(Date.now());
  try {
    const shots = await shotsByIds(ctx, d.shotIds);
    if (!shots?.length) throw new ProviderError('Shot tidak ditemukan', 'jobs', 'bad_request');
    const p = await projectOfEpisode(ctx, shots[0]!.episode_id);
    const vs = findStyle(p.visual_style);
    const setting = await ctx.settingFor(job.workspace_id, 'image', job);
    const gw = await ctx.gateway();
    const order = d.shotIds.map((id) => shots.find((s) => s.id === id)).filter((s): s is Row<'shots'> => Boolean(s));
    for (const [i, s] of order.entries()) {
      if (late()) {
        await ctx.send({ ...d, shotIds: d.shotIds.slice(i), acc });
        return;
      }
      try {
        await ctx.admin.from('shots').update({ keyframe_status: 'running' }).eq('id', s.id);
        const { image } = shotPrompt(s);
        const { images } = await gw.generateImage(setting, {
          prompt: `${vs.framePrefix} ${image}. ${vs.imageStyle}. Shot type ${s.shot_type}.`,
          negativePrompt: negativeFor(p.visual_style),
          aspect: p.aspect_ratio,
          characters: await lockedRefs(ctx, s.character_ids),
        });
        const url = await putFromUrl(ctx, `${job.workspace_id}/shots/${s.id}/key-${job.id}`, images[0]!.url, 'image/png');
        await ctx.admin.from('shots').update({ keyframe_url: url, keyframe_status: 'ready', approved: false }).eq('id', s.id);
      } catch (e) {
        acc.failed++;
        ctx.log('keyframe gagal', { shot: s.id, error: (e as Error).message });
        await ctx.admin.from('shots').update({ keyframe_status: 'failed' }).eq('id', s.id);
      }
      acc.done++;
      await progress(ctx, job.id, (acc.done / total) * 100);
    }
    if (acc.failed >= total) throw new ProviderError('Semua frame kunci gagal dibuat', setting.provider, 'unknown');
    await succeedJob(ctx, job, { ok: total - acc.failed, failed: acc.failed }, Math.round((job.cost * acc.failed) / total), `${acc.failed} frame gagal dibuat`);
  } catch (e) {
    await failJob(ctx, job.id, e);
  }
}

// ---------------- klip video (submit → poll lewat pesan tertunda) ----------------

const POLL_SEC = (ctx: Ctx) => (ctx.mock ? 2 : 10);

export async function clips(ctx: Ctx, d: Extract<MediaJobData, { kind: 'clip' }> & { acc?: Acc }) {
  const job = d.acc ? await loadRunningJob(ctx, d.jobId) : await beginJob(ctx, d.jobId);
  if (!job) return;
  const late = deadlineFrom(Date.now());
  try {
    const shots = await shotsByIds(ctx, d.shotIds);
    if (!shots?.length) throw new ProviderError('Shot tidak ditemukan', 'jobs', 'bad_request');
    const p = await projectOfEpisode(ctx, shots[0]!.episode_id);
    const setting = await ctx.settingFor(job.workspace_id, 'video', job);
    const resolution = ({ hemat: '480p', standar: '720p', premium: '1080p' } as const)[setting.tier];
    const gw = await ctx.gateway();
    for (const [i, id] of d.shotIds.entries()) {
      if (late()) {
        await ctx.send({ ...d, shotIds: d.shotIds.slice(i), acc: d.acc ?? { done: 0, failed: 0, failedSec: 0 } });
        return;
      }
      const s = shots.find((x) => x.id === id);
      if (!s) continue;
      try {
        if (!s.approved || !s.keyframe_url) throw new ProviderError('Shot belum disetujui atau belum punya frame kunci', 'jobs', 'bad_request');
        await ctx.admin.from('shots').update({ clip_status: 'running', clip_progress: 5 }).eq('id', s.id);
        if (s.motion === 'camera') {
          // Hybrid: gerak kamera dari frame kunci, dirender FFmpeg (tanpa biaya video AI).
          await submitCameraClip(ctx, { jobId: job.id, workspaceId: job.workspace_id, shotId: s.id, imageUrl: s.keyframe_url, durationSec: Number(s.duration_sec), aspect: p.aspect_ratio, quality: resolution, move: s.camera_move as CameraMove });
          continue;
        }
        const { handle } = await gw.startVideo(setting, { imageUrl: s.keyframe_url, prompt: shotPrompt(s).motion, durationSec: Number(s.duration_sec), aspect: p.aspect_ratio, resolution });
        await ctx.send({ kind: 'clip_poll', jobId: job.id, workspaceId: job.workspace_id, shotId: s.id, handle, deadline: Date.now() + 20 * 60_000 }, POLL_SEC(ctx));
      } catch (e) {
        ctx.log('klip gagal dimulai', { shot: s.id, error: (e as Error).message });
        await ctx.admin.from('shots').update({ clip_status: 'failed' }).eq('id', s.id);
      }
    }
    await finishClipsIfDone(ctx, job.id);
  } catch (e) {
    await failJob(ctx, job.id, e);
  }
}

export async function clipPoll(ctx: Ctx, m: Extract<InternalMessage, { kind: 'clip_poll' }>) {
  const job = await loadRunningJob(ctx, m.jobId);
  if (!job) return;
  const markFailed = async (why: string) => {
    ctx.log('klip gagal', { shot: m.shotId, error: why });
    await ctx.admin.from('shots').update({ clip_status: 'failed' }).eq('id', m.shotId);
    await finishClipsIfDone(ctx, m.jobId);
  };
  try {
    const setting = await ctx.settingFor(job.workspace_id, 'video', job);
    const st = await (await ctx.gateway()).videoStatus(setting, m.handle);
    if (st.state === 'queued' || st.state === 'running') {
      if (Date.now() > m.deadline) return markFailed('Render video melewati batas waktu');
      await ctx.admin.from('shots').update({ clip_progress: Math.max(5, Math.min(95, st.progress)) }).eq('id', m.shotId);
      return ctx.send(m, POLL_SEC(ctx));
    }
    if (st.state === 'failed' || !st.videoUrl) return markFailed(st.error ?? 'Render video gagal');
    if (st.videoUrl.startsWith('still:')) {
      // Mode demo: klip gerak kamera dari frame kunci, dirender di layanan FFmpeg.
      const { data: s } = await ctx.admin.from('shots').select('keyframe_url, duration_sec, episode_id').eq('id', m.shotId).single();
      const p = await projectOfEpisode(ctx, s!.episode_id);
      return submitCameraClip(ctx, { jobId: m.jobId, workspaceId: m.workspaceId, shotId: m.shotId, imageUrl: s!.keyframe_url!, durationSec: Number(s!.duration_sec), aspect: p.aspect_ratio, quality: '480p', move: 'push_in' });
    }
    const url = await putFromUrl(ctx, `${m.workspaceId}/shots/${m.shotId}/clip-${m.jobId}`, st.videoUrl, 'video/mp4');
    await ctx.admin.from('shots').update({ clip_url: url, clip_status: 'ready', clip_progress: 100 }).eq('id', m.shotId);
    await finishClipsIfDone(ctx, m.jobId);
  } catch (e) {
    const err = e as ProviderError;
    if (err.retryable && Date.now() < m.deadline) return ctx.send(m, POLL_SEC(ctx) * 2);
    await markFailed(err.message);
  }
}

async function shotsByIds(ctx: Ctx, ids: string[]) {
  const parts = await Promise.all(chunks(ids).map((c) => ctx.admin.from('shots').select('*').in('id', c)));
  const err = parts.find((r) => r.error)?.error;
  if (err) throw new ProviderError(err.message, 'jobs', 'unknown');
  return parts.flatMap((r) => r.data ?? []);
}

async function submitCameraClip(ctx: Ctx, o: { jobId: string; workspaceId: string; shotId: string; imageUrl: string; durationSec: number; aspect: Timeline['aspect']; quality: Quality; move: CameraMove }) {
  const cmd = stillToClipCommand({ imageUrl: o.imageUrl, durationSec: o.durationSec, aspect: o.aspect, quality: o.quality, move: o.move, outputName: `clip-${o.shotId}.mp4` });
  const commandId = await (await ctx.render()).submit(cmd, renderOpts(ctx, 300, 2));
  await ctx.send({ kind: 'ffmpeg_poll', jobId: o.jobId, workspaceId: o.workspaceId, purpose: 'clip', targetId: o.shotId, commandId, key: `${o.workspaceId}/shots/${o.shotId}/clip-${o.jobId}`, deadline: Date.now() + 15 * 60_000, startedAt: Date.now(), expectedSec: o.durationSec }, 2);
}

/** Job klip selesai bila semua shot-nya final; refund proporsional untuk detik video AI yang gagal (shot gerak kamera tidak ditagih). */
export async function finishClipsIfDone(ctx: Ctx, jobId: string) {
  const job = await loadRunningJob(ctx, jobId);
  if (!job) return;
  const ids = (job.input as { params?: { shotIds?: string[] } }).params?.shotIds ?? [];
  const shots = await shotsByIds(ctx, ids);
  if (!shots || shots.some((s) => s.clip_status === 'queued' || s.clip_status === 'running')) {
    if (shots) await progress(ctx, jobId, (shots.filter((s) => s.clip_status === 'ready' || s.clip_status === 'failed').length / Math.max(1, ids.length)) * 100);
    return;
  }
  if (shots.every((s) => s.clip_status === 'failed')) return void (await failJob(ctx, jobId, new ProviderError('Semua klip gagal dirender', 'video', 'unknown')));
  const ai = shots.filter((s) => s.motion !== 'camera');
  const totalSec = ai.reduce((a, s) => a + Number(s.duration_sec), 0);
  const failedSec = ai.filter((s) => s.clip_status === 'failed').reduce((a, s) => a + Number(s.duration_sec), 0);
  await succeedJob(ctx, job, { ok: shots.length, failedSec }, totalSec > 0 ? Math.round((job.cost * failedSec) / totalSec) : 0, `${failedSec} detik video gagal dirender`);
}

// ---------------- voice over (dengan kelanjutan) ----------------

export async function voiceOver(ctx: Ctx, d: Extract<MediaJobData, { kind: 'vo' }> & { acc?: Acc }) {
  const job = d.acc ? await loadRunningJob(ctx, d.jobId) : await beginJob(ctx, d.jobId);
  if (!job) return;
  const acc: Acc = d.acc ?? { done: 0, failed: 0, failedSec: 0 };
  const late = deadlineFrom(Date.now());
  try {
    const { data: ep } = await ctx.admin.from('episodes').select('project_id, workspace_id').eq('id', d.episodeId).single();
    if (!ep) throw new ProviderError('Episode tidak ditemukan', 'jobs', 'bad_request');
    const [{ data: script }, { data: chars }, p] = await Promise.all([
      ctx.admin.from('scripts').select('content').eq('episode_id', d.episodeId).order('version', { ascending: false }).limit(1).single(),
      ctx.admin.from('characters').select('id, name, voice_id, locked_at').eq('project_id', ep.project_id),
      project(ctx, ep.project_id),
    ]);
    const scenes = ((script?.content as { scenes?: { body: string; heading: string }[] })?.scenes ?? []).map((s) => s.body || s.heading);
    const perScene = new Map<number, number>();
    const lines = extractDialog(scenes).map((l) => {
      const n = perScene.get(l.sceneNo) ?? 0;
      perScene.set(l.sceneNo, n + 1);
      return { ...l, id: `${l.sceneNo}-${n}` };
    });
    const all = ((job.input as { params?: { lineIds?: string[] } }).params?.lineIds ?? d.lineIds);
    const totalSec = lines.filter((l) => all.includes(l.id)).reduce((a, l) => a + l.estimatedSec, 0);
    const want = lines.filter((l) => d.lineIds.includes(l.id));
    if (!want.length && !d.acc) throw new ProviderError('Baris dialog tidak ditemukan (naskah berubah?)', 'jobs', 'bad_request');
    const setting = await ctx.settingFor(job.workspace_id, 'vo', job);
    const gw = await ctx.gateway();
    for (const [i, l] of want.entries()) {
      if (late()) {
        await ctx.send({ ...d, lineIds: want.slice(i).map((x) => x.id), acc });
        return;
      }
      try {
        const c = chars?.find((x) => l.character.toLowerCase().includes(x.name.toLowerCase()));
        if (!c) throw new ProviderError(`Tokoh ${l.character} tidak ada di sheet karakter`, 'jobs', 'bad_request');
        if (!c.locked_at || !c.voice_id) throw new ProviderError(`Suara ${c.name} belum dikunci`, 'jobs', 'bad_request');
        const { audio } = await gw.synthesize(setting, { text: l.text, voiceId: c.voice_id, languageCode: p.language });
        const ext = audio.mimeType === 'audio/wav' ? 'wav' : 'mp3';
        const url = await putBytes(ctx, `${job.workspace_id}/audio/${d.episodeId}/${l.id}-${job.id}.${ext}`, audio.data, audio.mimeType);
        await ctx.admin.from('audio_tracks').delete().eq('episode_id', d.episodeId).eq('line_id', l.id);
        await ctx.admin.from('audio_tracks').insert({
          episode_id: d.episodeId, workspace_id: ep.workspace_id, type: 'dialog', character_id: c.id, line_id: l.id, text: l.text, url,
          duration_ms: audio.durationMs ?? Math.round(l.estimatedSec * 1000), status: 'ready',
        });
      } catch (e) {
        acc.failed++;
        acc.failedSec += l.estimatedSec;
        ctx.log('VO gagal', { line: l.id, error: (e as Error).message });
      }
      acc.done++;
      await progress(ctx, job.id, (acc.done / Math.max(1, all.length)) * 100);
    }
    if (acc.failedSec >= totalSec) throw new ProviderError('Semua baris VO gagal', setting.provider, 'unknown');
    await succeedJob(ctx, job, { lines: acc.done }, Math.round((job.cost * acc.failedSec) / Math.max(0.001, totalSec)), 'Sebagian baris VO gagal');
  } catch (e) {
    await failJob(ctx, job.id, e);
  }
}
