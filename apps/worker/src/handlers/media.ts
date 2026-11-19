import { ProviderError, type CharacterReference } from '@atomo/ai-gateway';
import type { Job, Row } from '@atomo/db';
import { extractDialog } from '@atomo/prompt-engine';
import { admin } from '../db';
import { getGateway, settingFor } from '../gateway';
import { log, progress, type JobResult } from '../job';
import { extFor, fetchAsset, publicUrl, storage } from '../storage';
import { stillToClip } from './ffmpeg';

const ANGLES = [
  { angle: 'depan', prompt: 'front-facing head and shoulders portrait, neutral expression, looking at camera' },
  { angle: '3/4', prompt: 'three-quarter view head and shoulders portrait' },
  { angle: 'samping', prompt: 'side profile portrait' },
  { angle: 'full', prompt: 'full body shot, standing, neutral pose' },
] as const;

const STYLE_EN: Record<string, string> = {
  'realistis sinematik': 'cinematic photorealistic, 35mm film still, natural skin texture',
  anime: 'anime style, clean line art, cel shading',
  '3D animasi': '3D animated film style, soft global illumination',
  'cat air': 'watercolor illustration style',
  'noir hitam putih': 'black and white film noir, high contrast',
};

async function store(workspaceId: string, path: string, url: string): Promise<string> {
  const a = await fetchAsset(url);
  return storage.put(`${workspaceId}/${path}.${extFor(a.contentType)}`, a.data, a.contentType);
}

async function project(projectId: string) {
  const { data } = await admin.from('projects').select('*').eq('id', projectId).single();
  if (!data) throw new ProviderError('Project tidak ditemukan', 'worker', 'bad_request');
  return data;
}

/** Reference image multi-sudut untuk mengunci wajah karakter. Seed sama untuk semua sudut. */
export async function charref(job: Job, characterId: string): Promise<JobResult> {
  const { data: c } = await admin.from('characters').select('*').eq('id', characterId).single();
  if (!c) throw new ProviderError('Karakter tidak ditemukan', 'worker', 'bad_request');
  if (c.locked_at) throw new ProviderError('Karakter terkunci', 'worker', 'bad_request');
  const p = await project(c.project_id);
  const setting = await settingFor(job.workspace_id, 'image', job);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const style = STYLE_EN[p.visual_style] ?? p.visual_style;
  const refs: { angle: string; url: string }[] = [];
  for (const [i, a] of ANGLES.entries()) {
    const prompt = `Character reference sheet. ${a.prompt}. Original fictional character, Indonesian, age ${c.age ?? 'adult'}. ${c.look}. Plain dark studio background, soft key light. ${style}. Not a real person, not a celebrity.`;
    // Sudut 2+ memakai sudut depan sebagai reference supaya wajah konsisten.
    const characters: CharacterReference[] = refs[0] ? [{ characterId: c.id, name: c.name, imageUrls: [publicUrl(refs[0].url)] }] : [];
    const { images } = await (await getGateway()).generateImage(setting, { prompt, aspect: '1:1', seed, characters });
    const url = await store(job.workspace_id, `characters/${c.id}/${job.id}-${i}`, images[0]!.url);
    refs.push({ angle: a.angle, url });
    await progress(job.id, ((i + 1) / ANGLES.length) * 100);
  }
  await admin.from('characters').update({ ref_images: refs }).eq('id', c.id);
  return { output: { refs: refs.length, seed } };
}

function shotPrompt(s: Row<'shots'>): { image: string; motion: string } {
  try {
    const p = JSON.parse(s.prompt) as { image?: string; motion?: string };
    return { image: p.image ?? s.description, motion: p.motion ?? s.camera };
  } catch {
    return { image: s.prompt || s.description, motion: s.camera };
  }
}

async function lockedRefs(characterIds: string[]): Promise<CharacterReference[]> {
  if (!characterIds.length) return [];
  const { data } = await admin.from('characters').select('id, name, ref_images, locked_at, voice_id').in('id', characterIds);
  const unlocked = (data ?? []).filter((c) => !c.locked_at);
  if (unlocked.length) throw new ProviderError(`Karakter belum dikunci: ${unlocked.map((c) => c.name).join(', ')}`, 'worker', 'bad_request');
  return (data ?? []).map((c) => ({
    characterId: c.id,
    name: c.name,
    imageUrls: ((c.ref_images as { url: string }[]) ?? []).map((r) => publicUrl(r.url)),
    ...(c.voice_id ? { voiceId: c.voice_id } : {}),
  }));
}

/** Frame kunci per shot, memakai reference image karakter terkunci (consistency engine). */
export async function keyframes(job: Job, shotIds: string[]): Promise<JobResult> {
  const { data: shots } = await admin.from('shots').select('*').in('id', shotIds);
  if (!shots?.length) throw new ProviderError('Shot tidak ditemukan', 'worker', 'bad_request');
  const { data: ep } = await admin.from('episodes').select('project_id').eq('id', shots[0]!.episode_id).single();
  const p = await project(ep!.project_id);
  const setting = await settingFor(job.workspace_id, 'image', job);
  const style = STYLE_EN[p.visual_style] ?? p.visual_style;
  let failed = 0;
  for (const [i, s] of shots.entries()) {
    try {
      await admin.from('shots').update({ keyframe_status: 'running' }).eq('id', s.id);
      const { image } = shotPrompt(s);
      const characters = await lockedRefs(s.character_ids);
      const { images } = await (await getGateway()).generateImage(setting, {
        prompt: `${image}. ${style}. Shot type ${s.shot_type}.`,
        negativePrompt: 'text, watermark, logo, extra fingers, deformed face, celebrity likeness',
        aspect: p.aspect_ratio,
        characters,
      });
      const url = await store(job.workspace_id, `shots/${s.id}/key-${job.id}`, images[0]!.url);
      await admin.from('shots').update({ keyframe_url: url, keyframe_status: 'ready', approved: false }).eq('id', s.id);
    } catch (e) {
      failed++;
      log('keyframe gagal', { shot: s.id, error: (e as Error).message });
      await admin.from('shots').update({ keyframe_status: 'failed' }).eq('id', s.id);
      if (shots.length === 1) throw e;
    }
    await progress(job.id, ((i + 1) / shots.length) * 100);
  }
  if (failed === shots.length) throw new ProviderError('Semua frame kunci gagal dibuat', setting.provider, 'unknown');
  const refund = Math.min(job.cost, Math.round((job.cost * failed) / shots.length));
  return { output: { ok: shots.length - failed, failed }, refund, refundReason: `${failed} frame gagal dibuat` };
}

/** Image-to-video per shot. Hanya shot yang sudah disetujui. */
export async function clips(job: Job, shotIds: string[]): Promise<JobResult> {
  const { data: shots } = await admin.from('shots').select('*').in('id', shotIds);
  if (!shots?.length) throw new ProviderError('Shot tidak ditemukan', 'worker', 'bad_request');
  const { data: ep } = await admin.from('episodes').select('project_id').eq('id', shots[0]!.episode_id).single();
  const p = await project(ep!.project_id);
  const setting = await settingFor(job.workspace_id, 'video', job);
  const resolution = ({ hemat: '480p', standar: '720p', premium: '1080p' } as const)[setting.tier];
  const totalSec = shots.reduce((a, s) => a + Number(s.duration_sec), 0);
  let failedSec = 0;
  let done = 0;
  for (const s of shots) {
    try {
      if (!s.approved || !s.keyframe_url) throw new ProviderError('Shot belum disetujui atau belum punya frame kunci', 'worker', 'bad_request');
      await admin.from('shots').update({ clip_status: 'running', clip_progress: 5 }).eq('id', s.id);
      const { motion } = shotPrompt(s);
      const { handle } = await (await getGateway()).startVideo(setting, {
        imageUrl: publicUrl(s.keyframe_url), prompt: motion, durationSec: Number(s.duration_sec), aspect: p.aspect_ratio, resolution,
      });
      let url: string | undefined;
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        const st = await (await getGateway()).videoStatus(setting, handle);
        await admin.from('shots').update({ clip_progress: Math.max(5, st.progress) }).eq('id', s.id);
        if (st.state === 'succeeded') {
          url = st.videoUrl;
          break;
        }
        if (st.state === 'failed') throw new ProviderError(st.error ?? 'Render video gagal', setting.provider, 'unknown');
        await new Promise((r) => setTimeout(r, setting.provider === 'mock' ? 300 : 5000));
      }
      if (!url) throw new ProviderError('Render video melewati batas waktu', setting.provider, 'timeout');
      let stored: string;
      if (url.startsWith('still:')) {
        // Mode mock: buat klip dari frame kunci dengan gerak kamera halus.
        const key = await fetchAsset(s.keyframe_url);
        const mp4 = await stillToClip(key.data, Number(s.duration_sec), p.aspect_ratio);
        stored = await storage.put(`${job.workspace_id}/shots/${s.id}/clip-${job.id}.mp4`, mp4, 'video/mp4');
      } else {
        stored = await store(job.workspace_id, `shots/${s.id}/clip-${job.id}`, url);
      }
      await admin.from('shots').update({ clip_url: stored, clip_status: 'ready', clip_progress: 100 }).eq('id', s.id);
    } catch (e) {
      failedSec += Number(s.duration_sec);
      log('klip gagal', { shot: s.id, error: (e as Error).message });
      await admin.from('shots').update({ clip_status: 'failed' }).eq('id', s.id);
      if (shots.length === 1) throw e;
    }
    done++;
    await progress(job.id, (done / shots.length) * 100);
  }
  if (failedSec >= totalSec) throw new ProviderError('Semua klip gagal dirender', setting.provider, 'unknown');
  const refund = Math.min(job.cost, Math.round((job.cost * failedSec) / totalSec));
  return { output: { ok: shots.length, failedSec }, refund, refundReason: `${failedSec} detik video gagal dirender` };
}

/** Voice over per baris dialog, memakai voice_id karakter yang terkunci. */
export async function voiceOver(job: Job, episodeId: string, lineIds: string[]): Promise<JobResult> {
  const { data: ep } = await admin.from('episodes').select('project_id, workspace_id').eq('id', episodeId).single();
  if (!ep) throw new ProviderError('Episode tidak ditemukan', 'worker', 'bad_request');
  const [{ data: script }, { data: chars }, p] = await Promise.all([
    admin.from('scripts').select('content').eq('episode_id', episodeId).order('version', { ascending: false }).limit(1).single(),
    admin.from('characters').select('id, name, voice_id, locked_at').eq('project_id', ep.project_id),
    project(ep.project_id),
  ]);
  const scenes = ((script?.content as { scenes?: { body: string; heading: string }[] })?.scenes ?? []).map((s) => s.body || s.heading);
  const perScene = new Map<number, number>();
  const lines = extractDialog(scenes).map((l) => {
    const n = perScene.get(l.sceneNo) ?? 0;
    perScene.set(l.sceneNo, n + 1);
    return { ...l, id: `${l.sceneNo}-${n}` };
  });
  const want = lines.filter((l) => lineIds.includes(l.id));
  if (!want.length) throw new ProviderError('Baris dialog tidak ditemukan (naskah berubah?)', 'worker', 'bad_request');
  const setting = await settingFor(job.workspace_id, 'vo', job);
  const totalSec = want.reduce((a, l) => a + l.estimatedSec, 0);
  let failedSec = 0;
  for (const [i, l] of want.entries()) {
    try {
      const c = chars?.find((x) => l.character.toLowerCase().includes(x.name.toLowerCase()));
      if (!c) throw new ProviderError(`Tokoh ${l.character} tidak ada di sheet karakter`, 'worker', 'bad_request');
      if (!c.locked_at || !c.voice_id) throw new ProviderError(`Suara ${c.name} belum dikunci`, 'worker', 'bad_request');
      const { audio } = await (await getGateway()).synthesize(setting, { text: l.text, voiceId: c.voice_id, languageCode: p.language });
      const ext = audio.mimeType === 'audio/wav' ? 'wav' : 'mp3';
      const url = await storage.put(`${job.workspace_id}/audio/${episodeId}/${l.id}-${job.id}.${ext}`, audio.data, audio.mimeType);
      await admin.from('audio_tracks').delete().eq('episode_id', episodeId).eq('line_id', l.id);
      await admin.from('audio_tracks').insert({
        episode_id: episodeId, workspace_id: ep.workspace_id, type: 'dialog', character_id: c.id, line_id: l.id, text: l.text, url,
        duration_ms: audio.durationMs ?? Math.round(l.estimatedSec * 1000), status: 'ready',
      });
    } catch (e) {
      failedSec += l.estimatedSec;
      log('VO gagal', { line: l.id, error: (e as Error).message });
      if (want.length === 1) throw e;
    }
    await progress(job.id, ((i + 1) / want.length) * 100);
  }
  if (failedSec >= totalSec) throw new ProviderError('Semua baris VO gagal', setting.provider, 'unknown');
  const refund = Math.min(job.cost, Math.round((job.cost * failedSec) / totalSec));
  return { output: { lines: want.length }, refund, refundReason: 'Sebagian baris VO gagal' };
}
