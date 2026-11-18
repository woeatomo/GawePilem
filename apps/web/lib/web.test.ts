import { describe, expect, it } from 'vitest';
import { estimate, SEED_RATES } from '@atomo/credits';
import { SAMPLE_SCENES, SAMPLE_SHOTLIST } from '@atomo/prompt-engine';
import { timelineSchema } from '@atomo/timeline';
import { quantities, actionParams } from './ai/actions';
import { dialogLines, quantityContext } from './ai/context';
import { assignLines, buildTimeline } from './assemble';
import type { ProjectBundle } from './project';
import type { Row } from '@atomo/db';

const now = '2026-11-18T00:00:00Z';
const chars = ['Laras', 'Dimas', 'Bu Wati'].map((name, i) => ({ id: `c${i}`, name, locked_at: now, voice_id: 'v' }) as unknown as Row<'characters'>);
const shots = SAMPLE_SHOTLIST.shots.map((s, i) => ({
  id: `s${i}`, scene_no: s.sceneNo, order_index: i, duration_sec: s.durationSec, dialog: s.dialog, description: s.description,
  character_ids: s.characters.map((n) => chars.find((c) => c.name === n)!.id), keyframe_status: 'ready', clip_status: i < 6 ? 'ready' : 'empty', approved: true,
})) as unknown as Row<'shots'>[];

function bundle(over: Partial<ProjectBundle> = {}): ProjectBundle {
  return {
    project: { id: 'p', workspace_id: 'w', title: 'Kamar 7', format: 'microdrama', genre: 'horor', aspect_ratio: '9:16', visual_style: 'realistis sinematik', language: 'id', target_duration_sec: 90, episode_count: 10 } as Row<'projects'>,
    bible: null,
    episodes: [],
    episode: { id: 'e', number: 1 } as Row<'episodes'>,
    characters: chars,
    script: { id: 'x', version: 1, content: { scenes: SAMPLE_SCENES.map((b) => ({ heading: b.split('\n')[0]!, body: b })) } },
    shots,
    audio: [],
    renders: [],
    ...over,
  };
}

describe('estimasi aksi (client & server memakai fungsi yang sama)', () => {
  it('shot list ditagih per scene, klip per detik, VO per menit', () => {
    const b = bundle();
    const ctx = quantityContext(b);
    expect(quantities('shotlist', {}, ctx)).toEqual([{ category: 'naskah', quantity: 3 }]);
    expect(quantities('clip', { shotIds: ['s0', 's1'] }, ctx)).toEqual([{ category: 'video', quantity: 7 }]);
    const lines = dialogLines(b);
    const vo = quantities('vo', { lineIds: lines.map((l) => l.id) }, ctx);
    const e = estimate(vo.map((v) => ({ ...v, tier: 'standar' as const, billingMode: 'saldo' as const })), SEED_RATES);
    expect(e.byCategory.vo).toBeGreaterThan(0);
    expect(e.byCategory.vo).toBeLessThanOrEqual(26);
  });

  it('parameter divalidasi', () => {
    expect(actionParams.research.safeParse({ topic: 'pendek' }).success).toBe(false);
    expect(actionParams.keyframe.safeParse({ shotIds: [] }).success).toBe(false);
  });
});

describe('rakit timeline dari data project', () => {
  it('dialog ditempel ke shot yang memuat kalimat itu', () => {
    const a = assignLines(bundle());
    const jangan = a.find((x) => x.line.text === 'Jangan dijawab.');
    expect(jangan?.shotId).toBe('s5');
    expect(a.every((x) => x.shotId)).toBe(true);
  });

  it('timeline valid; VO yang belum ada dilaporkan sebagai kekurangan', () => {
    const { timeline, missing } = buildTimeline(bundle());
    expect(timelineSchema.safeParse(timeline).success).toBe(true);
    expect(timeline.tracks.video).toHaveLength(12);
    expect(timeline.tracks.dialog).toHaveLength(0);
    expect(missing.length).toBe(dialogLines(bundle()).length);
    expect(timeline.tracks.video[6]!.transition).toBe('dip'); // horor: dip antar-scene
  });

  it('VO yang teksnya berubah tidak dipakai', () => {
    const b = bundle();
    const l = dialogLines(b)[0]!;
    const audio = [{ id: 'a1', line_id: l.id, text: 'teks lama', status: 'ready', duration_ms: 1500 }] as unknown as Row<'audio_tracks'>[];
    expect(buildTimeline({ ...b, audio }).timeline.tracks.dialog).toHaveLength(0);
    const ok = [{ ...audio[0]!, text: l.text }] as Row<'audio_tracks'>[];
    expect(buildTimeline({ ...b, audio: ok }).timeline.tracks.dialog).toHaveLength(1);
  });
});
