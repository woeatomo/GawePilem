import 'server-only';
import { ProviderError, type ProviderSetting } from '@atomo/ai-gateway';
import { estimate, requiresConfirmation, type Category, type Estimate } from '@atomo/credits';
import { chargeAndEnqueue, CreditError, jobFail, jobRunning, jobSucceed, type Json, type Job } from '@atomo/db';
import {
  buildPrompt, moderateText, moderationMessage, OUTPUT_SCHEMAS, sceneHeading, findModelContext,
  type CharactersOutput, type OutlineOutput, type ShotlistOutput,
} from './engine';
import type { Session } from '../auth';
import { enqueueMedia } from '../queue';
import { loadRates, loadSecretSetting, gateway } from '../settings';
import { supabaseAdmin } from '../supabase/server';
import type { ProjectBundle, ScriptContent } from '../project';
import { ACTION_META, actionParams, quantities, type ActionId, type ActionParams } from './actions';
import { projectContext, quantityContext } from './context';

export class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface ExecuteInput {
  session: Session;
  bundle: ProjectBundle;
  action: ActionId;
  rawParams: unknown;
  expectedTotal: number | null;
  confirmed: boolean;
  idempotencyKey: string;
}

export type ExecuteResult =
  | { kind: 'stream'; job: Job; stream: ReadableStream<Uint8Array> }
  | { kind: 'json'; job: Job; data: unknown }
  | { kind: 'queued'; job: Job };

const CREDIT_HTTP: Record<string, number> = { insufficient_credits: 402, rate_changed: 409, budget_cap: 409, forbidden: 403, not_found: 404 };

/** Hitung estimasi server-side dari data project + tarif DB + mode billing per kategori. */
export async function estimateAction(
  s: Session,
  b: ProjectBundle,
  action: ActionId,
  params: unknown,
): Promise<{ estimate: Estimate; settings: Partial<Record<Category, ProviderSetting>> }> {
  const items = quantities(action, params, quantityContext(b));
  const rates = await loadRates(s.db);
  const settings: Partial<Record<Category, ProviderSetting>> = {};
  for (const it of items) settings[it.category] ??= await loadSecretSetting(s.workspaceId, it.category);
  const e = estimate(
    items.map((it) => ({ category: it.category, quantity: it.quantity, tier: settings[it.category]!.tier, billingMode: settings[it.category]!.mode })),
    rates,
  );
  return { estimate: e, settings };
}

function moderationInput(action: ActionId, p: Record<string, unknown>): string {
  return [p.topic, p.instruction].filter((x): x is string => typeof x === 'string').join('\n');
}

export async function executeAction(input: ExecuteInput): Promise<ExecuteResult> {
  const { session: s, bundle: b, action } = input;
  const parsed = actionParams[action].safeParse(input.rawParams ?? {});
  if (!parsed.success) throw new ActionError(400, 'bad_params', parsed.error.issues[0]?.message ?? 'Parameter tidak valid');
  const params = parsed.data as Record<string, unknown>;

  // Moderasi prompt sebelum uang dipotong.
  const modText = moderationInput(action, params);
  if (modText) {
    const m = moderateText(modText);
    if (m.verdict !== 'allow') {
      await supabaseAdmin().from('moderation_events').insert({
        workspace_id: s.workspaceId, user_id: s.userId, stage: action, verdict: m.verdict, categories: m.categories, excerpt: modText.slice(0, 500),
      });
      if (m.verdict === 'block') throw new ActionError(422, 'moderation_blocked', moderationMessage(m));
    }
  }

  // Validasi prasyarat per aksi (sebelum charge).
  precheck(action, params, b);

  const { estimate: est, settings } = await estimateAction(s, b, action, params);
  if (requiresConfirmation(est.total) && !input.confirmed)
    throw new ActionError(409, 'needs_confirmation', `Aksi ini memakai ${est.total} kredit. Konfirmasi dulu.`, { estimate: est });
  if (input.expectedTotal !== null && input.expectedTotal !== est.total)
    throw new ActionError(409, 'estimate_changed', 'Estimasi biaya berubah. Periksa lagi sebelum melanjutkan.', { estimate: est });

  const primary = est.lines[0]!.category;
  const setting = settings[primary]!;
  const admin = supabaseAdmin();
  let job: Job;
  try {
    job = await chargeAndEnqueue(admin, {
      userId: s.userId,
      workspaceId: s.workspaceId,
      projectId: b.project.id,
      episodeId: b.episode.id,
      type: ACTION_META[action].jobType,
      action,
      items: est.lines.map((l) => ({ category: l.category, tier: l.tier, quantity: l.quantity })),
      billing: Object.fromEntries(Object.entries(settings).map(([c, st]) => [c, st!.mode])),
      provider: setting.provider,
      model: setting.model,
      input: { params, template: action } as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey,
      expectedTotal: est.total,
    });
  } catch (e) {
    if (e instanceof CreditError) {
      const msg =
        e.code === 'insufficient_credits' ? 'Saldo kredit tidak cukup untuk aksi ini.' :
        e.code === 'budget_cap' ? 'Budget cap kategori ini di project sudah tercapai.' :
        e.code === 'rate_changed' ? 'Tarif baru saja berubah. Periksa estimasi lagi.' : e.message;
      throw new ActionError(CREDIT_HTTP[e.code] ?? 500, e.code, msg, { estimate: est });
    }
    throw e;
  }
  // Idempotency: job lama dikembalikan apa adanya.
  if (job.status !== 'queued') return { kind: 'json', job, data: job.output };

  const meta = ACTION_META[action];
  if (meta.kind === 'media') {
    const data = mediaJob(action, params, job.id, s.workspaceId, b.episode.id);
    // Tandai aset sebagai antre dulu supaya UI langsung menampilkan status.
    if (data.kind === 'keyframe') await admin.from('shots').update({ keyframe_status: 'queued' }).in('id', data.shotIds);
    if (data.kind === 'clip') await admin.from('shots').update({ clip_status: 'queued', clip_progress: 0 }).in('id', data.shotIds);
    try {
      await enqueueMedia(data);
    } catch (e) {
      // Antrean tidak tersedia: kembalikan kredit, jangan biarkan job menggantung.
      await jobFail(admin, job.id, `Antrean tidak tersedia: ${(e as Error).message}`);
      if (data.kind === 'keyframe') await admin.from('shots').update({ keyframe_status: 'empty' }).in('id', data.shotIds);
      if (data.kind === 'clip') await admin.from('shots').update({ clip_status: 'empty' }).in('id', data.shotIds);
      throw new ActionError(503, 'queue_down', 'Antrean render sedang tidak tersedia. Kredit sudah dikembalikan, coba lagi sebentar.');
    }
    return { kind: 'queued', job };
  }

  await jobRunning(admin, job.id);
  const fail = async (err: unknown) => {
    const pe = err instanceof ProviderError ? err : null;
    const message = pe ? pe.userMessage : 'Terjadi kesalahan saat memproses.';
    const refunded = await jobFail(admin, job.id, pe ? `${pe.code}: ${pe.message}` : String((err as Error)?.message ?? err)).catch(() => 0);
    return { message, refunded };
  };

  const built = buildPrompt({
    stage: action as Parameters<typeof buildPrompt>[0]['stage'],
    project: projectContext(b, contextScenes(action, params, b)),
    vars: promptVars(action, params, b),
    variationSeed: b.episode.id,
    contextTokens: findModelContext(setting.model),
  });
  const req = { messages: built.messages, maxTokens: built.maxTokens, temperature: action === 'research' ? 0.7 : 0.85 };

  if (meta.kind === 'stream') {
    const enc = new TextEncoder();
    const line = (o: unknown) => enc.encode(JSON.stringify(o) + '\n');
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const st = gateway().textStream(setting, { ...req, stream: true });
          let text = '';
          for await (const d of st) {
            text += d;
            controller.enqueue(line({ t: 'delta', v: d }));
          }
          const final = await st.final();
          const m = await st.meta;
          await persistText(action, params, b, final.text || text, s);
          await jobSucceed(admin, job.id, { chars: (final.text || text).length, usage: { ...final.usage }, model: m.model, fallbackFrom: m.fallbackFrom ?? null });
          controller.enqueue(line({ t: 'done', jobId: job.id, cost: job.cost }));
        } catch (err) {
          const f = await fail(err);
          controller.enqueue(line({ t: 'error', message: f.message, refunded: f.refunded }));
        } finally {
          controller.close();
        }
      },
    });
    return { kind: 'stream', job, stream };
  }

  try {
    const schema = OUTPUT_SCHEMAS[action as keyof typeof OUTPUT_SCHEMAS];
    const r = await gateway().structured(setting, req, schema);
    const saved = await persistStructured(action, params, b, r.data, s);
    await jobSucceed(admin, job.id, { repaired: r.repaired, model: r.meta.model, summary: saved });
    return { kind: 'json', job: { ...job, status: 'succeeded' }, data: r.data };
  } catch (err) {
    const f = await fail(err);
    throw new ActionError(502, 'ai_failed', `${f.message} Kredit ${f.refunded} sudah dikembalikan.`, { refunded: f.refunded });
  }
}

function precheck(action: ActionId, p: Record<string, unknown>, b: ProjectBundle) {
  const scenes = b.script?.content.scenes ?? [];
  if ((action === 'scene' || action === 'rewrite') && !scenes[(p.sceneNo as number) - 1])
    throw new ActionError(400, 'no_scene', 'Scene tidak ditemukan. Buat outline dulu.');
  if (action === 'rewrite' && !scenes[(p.sceneNo as number) - 1]?.body) throw new ActionError(400, 'empty_scene', 'Scene ini belum ditulis.');
  if (action === 'shotlist') {
    if (!scenes.some((s) => s.body)) throw new ActionError(400, 'no_script', 'Tulis naskah dulu sebelum membuat shot list.');
    if (b.shots.length && !p.replace) throw new ActionError(409, 'shots_exist', 'Shot list sudah ada. Konfirmasi untuk mengganti.');
    if (b.shots.some((s) => s.clip_status === 'ready') && p.replace)
      throw new ActionError(409, 'clips_exist', 'Beberapa shot sudah dirender jadi video. Hapus manual dulu agar render tidak hilang.');
  }
  if (action === 'characters' && !b.bible?.research && !b.bible?.topic) throw new ActionError(400, 'no_research', 'Isi ide dan riset dulu.');
  if (action === 'charref') {
    const c = b.characters.find((x) => x.id === p.characterId);
    if (!c) throw new ActionError(404, 'not_found', 'Karakter tidak ditemukan.');
    if (c.locked_at) throw new ActionError(409, 'locked', 'Karakter terkunci. Buka kunci dulu untuk membuat ulang wajah.');
  }
  if (action === 'keyframe' || action === 'clip') {
    const ids = new Set(p.shotIds as string[]);
    const shots = b.shots.filter((s) => ids.has(s.id));
    if (shots.length !== ids.size) throw new ActionError(404, 'not_found', 'Ada shot yang tidak ditemukan.');
    const needLock = shots.flatMap((s) => s.character_ids).filter((id) => !b.characters.find((c) => c.id === id)?.locked_at);
    if (needLock.length) throw new ActionError(409, 'unlocked_characters', 'Kunci wajah & suara semua karakter di shot ini dulu (tahap Cerita & karakter).');
    if (action === 'clip') {
      if (shots.some((s) => s.keyframe_status !== 'ready')) throw new ActionError(409, 'no_keyframe', 'Buat frame kunci dulu untuk semua shot yang dipilih.');
      if (shots.some((s) => !s.approved)) throw new ActionError(409, 'not_approved', 'Setujui storyboard shot ini dulu. Video adalah tahap termahal.');
    }
  }
  if (action === 'vo' && b.characters.some((c) => !c.voice_id))
    throw new ActionError(409, 'no_voice', 'Pilih dan kunci suara untuk setiap karakter dulu.');
}

function contextScenes(action: ActionId, p: Record<string, unknown>, b: ProjectBundle): { scenes?: 'all' | number[] } {
  const n = p.sceneNo as number | undefined;
  if (action === 'scene' && n) return { scenes: [n - 1, n + 1].filter((x) => x > 0 && x <= (b.script?.content.scenes.length ?? 0)) };
  if (action === 'shotlist' || action === 'continuity' || action === 'publish_meta') return { scenes: 'all' };
  return {};
}

function promptVars(action: ActionId, p: Record<string, unknown>, b: ProjectBundle): Record<string, string | number> {
  const scenes = b.script?.content.scenes ?? [];
  const n = (p.sceneNo as number) ?? 1;
  switch (action) {
    case 'research':
      return { topic: p.topic as string };
    case 'characters':
      return { count: (p.count as number) ?? 3 };
    case 'outline':
      return { episodeNumber: b.episode.number };
    case 'scene':
      return { sceneNo: n, sceneSummary: `${scenes[n - 1]?.heading ?? ''}\n${b.script?.content.summaries?.[n - 1] ?? ''}`.trim() };
    case 'rewrite':
      return { sceneNo: n, instruction: p.instruction as string, sceneText: scenes[n - 1]?.body ?? '' };
    default:
      return {};
  }
}

function mediaJob(action: ActionId, p: Record<string, unknown>, jobId: string, workspaceId: string, episodeId: string) {
  switch (action) {
    case 'charref':
      return { kind: 'charref' as const, jobId, workspaceId, characterId: (p as ActionParams<'charref'>).characterId };
    case 'keyframe':
      return { kind: 'keyframe' as const, jobId, workspaceId, shotIds: (p as ActionParams<'keyframe'>).shotIds };
    case 'clip':
      return { kind: 'clip' as const, jobId, workspaceId, shotIds: (p as ActionParams<'clip'>).shotIds };
    case 'vo':
      return { kind: 'vo' as const, jobId, workspaceId, episodeId, lineIds: (p as ActionParams<'vo'>).lineIds };
    default:
      throw new ActionError(400, 'bad_action', 'Aksi media tidak dikenal');
  }
}

// ---------------- persistensi ----------------

async function saveScript(s: Session, b: ProjectBundle, content: ScriptContent, note: string) {
  const version = (b.script?.version ?? 0) + 1;
  const { error } = await s.db.from('scripts').insert({
    episode_id: b.episode.id, workspace_id: b.project.workspace_id, version, content: content as unknown as { [k: string]: Json }, note, created_by: s.userId,
  });
  if (error) throw new Error(`Gagal menyimpan naskah: ${error.message}`);
  b.script = { id: '', version, content };
}

async function persistText(action: ActionId, p: Record<string, unknown>, b: ProjectBundle, text: string, s: Session) {
  const clean = text.replace(/^```\w*\n?|```$/g, '').trim();
  if (action === 'research') {
    const { error } = await s.db.from('series_bible').upsert({ project_id: b.project.id, workspace_id: b.project.workspace_id, topic: p.topic as string, research: clean });
    if (error) throw new Error(error.message);
    return;
  }
  const n = p.sceneNo as number;
  const content = structuredClone(b.script!.content);
  content.scenes[n - 1] = { heading: sceneHeading(clean) || content.scenes[n - 1]!.heading, body: clean };
  await saveScript(s, b, content, action === 'scene' ? `AI menulis scene ${n}` : `AI menulis ulang scene ${n}: ${p.instruction as string}`);
}

const VOICE_FOR_HINT: Record<string, string> = {
  perempuan_lembut: 'EXAVITQu4vr4xnSDxMaL',
  perempuan_matang: 'XrExE9yKIg1WjnnlVkGX',
  laki_hangat: 'TX3LPaxmHKxFdv7VOQHJ',
  laki_berat: 'pNInz6obpgDQGcFmaJgB',
  anak: 'jBpfuIE2acCO8z3wKNLl',
  narator: 'onwK4e9ZLuTAKqWW03F9',
};

async function persistStructured(action: ActionId, p: Record<string, unknown>, b: ProjectBundle, data: unknown, s: Session): Promise<string> {
  const ws = b.project.workspace_id;
  switch (action) {
    case 'characters': {
      const d = data as CharactersOutput;
      await s.db.from('series_bible').upsert({ project_id: b.project.id, workspace_id: ws, logline: d.logline, premise: d.premise });
      const existing = new Set(b.characters.map((c) => c.name.toLowerCase()));
      const rows = d.characters
        .filter((c) => !existing.has(c.name.toLowerCase()))
        .map((c) => ({
          project_id: b.project.id, workspace_id: ws, name: c.name, age: c.age, role: c.role, traits: c.traits, look: c.look,
          backstory: c.backstory, speech_style: c.speechStyle, sample_line: c.sampleLine,
          voice_provider: 'elevenlabs', voice_id: VOICE_FOR_HINT[c.voiceHint] ?? null,
        }));
      if (rows.length) {
        const { error } = await s.db.from('characters').insert(rows);
        if (error) throw new Error(error.message);
      }
      return `${rows.length} karakter baru`;
    }
    case 'outline': {
      const d = data as OutlineOutput;
      await s.db.from('episodes').update({ title: d.episodeTitle, synopsis: d.synopsis }).eq('id', b.episode.id);
      await saveScript(s, b, {
        title: d.episodeTitle, synopsis: d.synopsis, hook: d.hook, cliffhanger: d.cliffhanger,
        scenes: d.scenes.map((sc) => ({ heading: sc.heading, body: '' })),
        summaries: d.scenes.map((sc) => sc.summary),
      }, 'Outline AI');
      return `${d.scenes.length} scene`;
    }
    case 'shotlist': {
      const d = data as ShotlistOutput;
      const byName = new Map(b.characters.map((c) => [c.name.toLowerCase(), c.id]));
      const sceneCount = b.script?.content.scenes.length ?? 1;
      if (b.shots.length) await s.db.from('shots').delete().eq('episode_id', b.episode.id);
      const order = new Map<number, number>();
      const rows = d.shots.map((sh) => {
        const sceneNo = Math.min(Math.max(1, sh.sceneNo), sceneCount);
        const idx = order.get(sceneNo) ?? 0;
        order.set(sceneNo, idx + 1);
        return {
          episode_id: b.episode.id, workspace_id: ws, scene_no: sceneNo, order_index: idx, shot_type: sh.shotType, camera: sh.camera,
          duration_sec: sh.durationSec, description: sh.description, dialog: sh.dialog,
          prompt: JSON.stringify({ image: sh.imagePrompt, motion: sh.motionPrompt }),
          character_ids: sh.characters.map((n) => byName.get(n.toLowerCase())).filter((x): x is string => Boolean(x)),
        };
      });
      const { error } = await s.db.from('shots').insert(rows);
      if (error) throw new Error(error.message);
      await s.db.from('episodes').update({ title: b.episode.title }).eq('id', b.episode.id);
      return `${rows.length} shot`;
    }
    default:
      return 'ok';
  }
}
