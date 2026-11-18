'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Json } from '@atomo/db';
import { sceneHeading } from '@atomo/prompt-engine';
import { getSession, requireSession } from '@/lib/auth';
import { parseScript } from '@/lib/project';
import { supabaseServer } from '@/lib/supabase/server';

export type ActionState = { ok: boolean; message?: string } | null;
const fail = (message: string): ActionState => ({ ok: false, message });

// ---------- auth ----------

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ email: z.string().email('Email tidak valid'), password: z.string().min(8, 'Kata sandi minimal 8 karakter'), next: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email: p.data.email, password: p.data.password });
  if (error) return fail('Email atau kata sandi salah.');
  redirect(p.data.next?.startsWith('/') ? p.data.next : '/studio');
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ email: z.string().email('Email tidak valid'), password: z.string().min(8, 'Kata sandi minimal 8 karakter') }).safeParse(Object.fromEntries(form));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const db = await supabaseServer();
  const { data, error } = await db.auth.signUp({ email: p.data.email, password: p.data.password, options: { emailRedirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/callback` } });
  if (error) return fail(error.message);
  if (!data.session) return { ok: true, message: 'Cek email kamu untuk konfirmasi akun.' };
  redirect('/onboarding');
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect('/login');
}

export async function completeOnboarding(_: ActionState, form: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (form.get('age') !== 'on') return fail('Kamu harus berusia minimal 18 tahun.');
  if (form.get('consent') !== 'on') return fail('Persetujuan pemrosesan data wajib dicentang.');
  const now = new Date().toISOString();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const { error } = await s.db.from('profiles').update({ age_confirmed_at: now, data_consent_at: now, ...(name ? { display_name: name } : {}) }).eq('id', s.userId);
  if (error) return fail(error.message);
  redirect('/studio');
}

// ---------- project ----------

const projectSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib').max(120),
  format: z.enum(['microdrama', 'film_pendek', 'serial', 'dokumenter', 'iklan', 'animasi']),
  genre: z.string().trim().min(2).max(30),
  aspect: z.enum(['9:16', '16:9', '1:1']),
  style: z.string().trim().min(2).max(60),
  episodes: z.coerce.number().int().min(1).max(100),
  duration: z.coerce.number().int().min(15).max(3600),
  topic: z.string().trim().max(2000).default(''),
});

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  const s = await requireSession();
  const p = projectSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const d = p.data;
  const { data: project, error } = await s.db
    .from('projects')
    .insert({ workspace_id: s.workspaceId, title: d.title, format: d.format, genre: d.genre, aspect_ratio: d.aspect, visual_style: d.style, episode_count: d.episodes, target_duration_sec: d.duration, created_by: s.userId })
    .select('id')
    .single();
  if (error || !project) return fail(error?.message ?? 'Gagal membuat project');
  await Promise.all([
    s.db.from('series_bible').insert({ project_id: project.id, workspace_id: s.workspaceId, topic: d.topic }),
    s.db.from('episodes').insert({ project_id: project.id, workspace_id: s.workspaceId, number: 1, title: 'Episode 1' }),
  ]);
  redirect(`/studio/${project.id}/riset`);
}

export async function addEpisode(projectId: string) {
  const s = await requireSession();
  const { data: last } = await s.db.from('episodes').select('number').eq('project_id', projectId).order('number', { ascending: false }).limit(1).maybeSingle();
  const n = (last?.number ?? 0) + 1;
  await s.db.from('episodes').insert({ project_id: projectId, workspace_id: s.workspaceId, number: n, title: `Episode ${n}` });
  redirect(`/studio/${projectId}/naskah?ep=${n}`);
}

export async function saveBible(projectId: string, patch: { topic?: string; logline?: string; research?: string }): Promise<ActionState> {
  const s = await requireSession();
  const clean = z.object({ topic: z.string().max(2000).optional(), logline: z.string().max(400).optional(), research: z.string().max(20_000).optional() }).parse(patch);
  const { error } = await s.db.from('series_bible').update(clean).eq('project_id', projectId);
  if (error) return fail(error.message);
  revalidatePath(`/studio/${projectId}`, 'layout');
  return { ok: true };
}

export async function updateBudgetCaps(projectId: string, caps: Record<string, number | null>): Promise<ActionState> {
  const s = await requireSession();
  const parsed = z.record(z.enum(['naskah', 'vo', 'image', 'video']), z.number().int().min(0).max(10_000_000).nullable()).parse(caps);
  const clean = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null));
  const { error } = await s.db.from('projects').update({ budget_caps: clean as { [k: string]: Json } }).eq('id', projectId);
  if (error) return fail(error.message);
  revalidatePath(`/studio/${projectId}`, 'layout');
  return { ok: true };
}

// ---------- karakter ----------

export async function updateCharacter(characterId: string, patch: { voiceId?: string; look?: string; role?: string }): Promise<ActionState> {
  const s = await requireSession();
  const p = z.object({ voiceId: z.string().max(80).optional(), look: z.string().max(400).optional(), role: z.string().max(200).optional() }).parse(patch);
  const { error } = await s.db
    .from('characters')
    .update({ ...(p.voiceId !== undefined ? { voice_id: p.voiceId } : {}), ...(p.look !== undefined ? { look: p.look } : {}), ...(p.role !== undefined ? { role: p.role } : {}) })
    .eq('id', characterId);
  if (error) return fail(error.code === 'P0004' ? 'Karakter terkunci. Buka kunci dulu.' : error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function setCharacterLock(characterId: string, locked: boolean): Promise<ActionState> {
  const s = await requireSession();
  if (locked) {
    const { data: c } = await s.db.from('characters').select('ref_images, voice_id').eq('id', characterId).single();
    if (!c || !Array.isArray(c.ref_images) || c.ref_images.length === 0) return fail('Buat reference image wajah dulu sebelum mengunci.');
    if (!c.voice_id) return fail('Pilih suara dulu sebelum mengunci.');
  }
  const { error } = await s.db.from('characters').update({ locked_at: locked ? new Date().toISOString() : null }).eq('id', characterId);
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function deleteCharacter(characterId: string): Promise<ActionState> {
  const s = await requireSession();
  const { error } = await s.db.from('characters').delete().eq('id', characterId).is('locked_at', null);
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

// ---------- naskah ----------

export async function saveScene(episodeId: string, sceneNo: number, body: string): Promise<ActionState> {
  const s = await requireSession();
  const text = z.string().max(20_000).parse(body);
  const { data: cur } = await s.db.from('scripts').select('version, content, workspace_id').eq('episode_id', episodeId).order('version', { ascending: false }).limit(1).maybeSingle();
  const content = parseScript(cur?.content);
  if (sceneNo < 1 || sceneNo > content.scenes.length + 1) return fail('Nomor scene tidak valid');
  content.scenes[sceneNo - 1] = { heading: sceneHeading(text) || content.scenes[sceneNo - 1]?.heading || 'INT. LOKASI - WAKTU', body: text };
  const { data: ep } = await s.db.from('episodes').select('workspace_id').eq('id', episodeId).single();
  if (!ep) return fail('Episode tidak ditemukan');
  const { error } = await s.db.from('scripts').insert({
    episode_id: episodeId, workspace_id: ep.workspace_id, version: (cur?.version ?? 0) + 1, content: content as unknown as { [k: string]: Json }, note: `Edit manual scene ${sceneNo}`, created_by: s.userId,
  });
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function addBlankScene(episodeId: string): Promise<ActionState> {
  const s = await requireSession();
  const { data: cur } = await s.db.from('scripts').select('content').eq('episode_id', episodeId).order('version', { ascending: false }).limit(1).maybeSingle();
  return saveScene(episodeId, parseScript(cur?.content).scenes.length + 1, 'INT. LOKASI BARU - MALAM\n\n');
}

export async function restoreScriptVersion(episodeId: string, version: number): Promise<ActionState> {
  const s = await requireSession();
  const { data: old } = await s.db.from('scripts').select('content, workspace_id').eq('episode_id', episodeId).eq('version', version).single();
  const { data: cur } = await s.db.from('scripts').select('version').eq('episode_id', episodeId).order('version', { ascending: false }).limit(1).single();
  if (!old || !cur) return fail('Versi tidak ditemukan');
  const { error } = await s.db.from('scripts').insert({ episode_id: episodeId, workspace_id: old.workspace_id, version: cur.version + 1, content: old.content as { [k: string]: Json }, note: `Kembali ke versi ${version}`, created_by: s.userId });
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

// ---------- storyboard ----------

export async function updateShot(shotId: string, patch: { durationSec?: number; description?: string; camera?: string; approved?: boolean }): Promise<ActionState> {
  const s = await requireSession();
  const p = z.object({ durationSec: z.number().min(1).max(15).optional(), description: z.string().max(300).optional(), camera: z.string().max(80).optional(), approved: z.boolean().optional() }).parse(patch);
  const { error } = await s.db
    .from('shots')
    .update({
      ...(p.durationSec !== undefined ? { duration_sec: p.durationSec } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.camera !== undefined ? { camera: p.camera } : {}),
      ...(p.approved !== undefined ? { approved: p.approved } : {}),
    })
    .eq('id', shotId);
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function approveAllShots(episodeId: string): Promise<ActionState> {
  const s = await requireSession();
  const { error } = await s.db.from('shots').update({ approved: true }).eq('episode_id', episodeId).eq('keyframe_status', 'ready');
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function deleteShot(shotId: string): Promise<ActionState> {
  const s = await requireSession();
  const { error } = await s.db.from('shots').delete().eq('id', shotId);
  if (error) return fail(error.message);
  revalidatePath('/studio', 'layout');
  return { ok: true };
}

export async function moveShot(shotId: string, dir: -1 | 1): Promise<ActionState> {
  const s = await requireSession();
  const { data: shot } = await s.db.from('shots').select('id, episode_id, scene_no, order_index').eq('id', shotId).single();
  if (!shot) return fail('Shot tidak ditemukan');
  const { data: siblings } = await s.db.from('shots').select('id, order_index').eq('episode_id', shot.episode_id).eq('scene_no', shot.scene_no).order('order_index');
  const list = siblings ?? [];
  const i = list.findIndex((x) => x.id === shotId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j]!, list[i]!];
  await Promise.all(list.map((x, idx) => s.db.from('shots').update({ order_index: idx }).eq('id', x.id)));
  revalidatePath('/studio', 'layout');
  return { ok: true };
}
