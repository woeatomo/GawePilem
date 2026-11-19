import { clipStarts, overlapFor, round3, timelineDuration, type Subtitle, type Timeline } from './schema';

export interface AssembleShot {
  shotId: string;
  sceneNo: number;
  durationSec: number;
}

export interface AssembleLine {
  lineId: string;
  shotId: string;
  assetId: string;
  text: string;
  durationSec: number;
}

export interface AssembleInput {
  fps: Timeline['fps'];
  aspect: Timeline['aspect'];
  shots: AssembleShot[];
  lines: AssembleLine[];
  music?: { assetId: string; gainDb?: number };
  /** Jeda sebelum dialog dimulai di dalam shot. */
  leadInSec?: number;
  tailSec?: number;
  /** Transisi antar-scene. */
  sceneTransition?: 'cut' | 'fade' | 'dip';
  maxSubtitleChars?: number;
}

/**
 * Rakit otomatis: urutan shot sesuai naskah, dialog ditempel ke shot yang tepat,
 * shot diperpanjang bila dialog lebih panjang, musik dipotong pas durasi, subtitle dari dialog.
 */
export function autoAssemble(input: AssembleInput): Timeline {
  const lead = input.leadInSec ?? 0.2;
  const tail = input.tailSec ?? 0.3;
  const byShot = new Map<string, AssembleLine[]>();
  for (const l of input.lines) byShot.set(l.shotId, [...(byShot.get(l.shotId) ?? []), l]);

  const video: Timeline['tracks']['video'] = [];
  input.shots.forEach((s, i) => {
    const lines = byShot.get(s.shotId) ?? [];
    const speech = lines.reduce((acc, l) => acc + l.durationSec, 0) + Math.max(0, lines.length - 1) * 0.15;
    const dur = round3(Math.max(s.durationSec, lines.length ? lead + speech + tail : 0));
    const prev = input.shots[i - 1];
    const transition = i === 0 ? undefined : prev && prev.sceneNo !== s.sceneNo ? (input.sceneTransition ?? 'cut') : 'cut';
    video.push({ shotId: s.shotId, in: 0, out: dur, ...(transition ? { transition } : {}) });
  });

  // Posisi dialog dihitung dari posisi klip sebenarnya (transisi fade/dip menumpuk klip).
  const starts = clipStarts({ tracks: { video } });
  const dialog: Timeline['tracks']['dialog'] = [];
  const subtitle: Subtitle[] = [];
  input.shots.forEach((s, i) => {
    const overlap = i > 0 && video[i]!.transition && video[i]!.transition !== 'cut' ? overlapFor(video, i) : 0;
    let cursor = starts[i]! + overlap + lead;
    for (const l of byShot.get(s.shotId) ?? []) {
      dialog.push({ lineId: l.lineId, start: round3(cursor), assetId: l.assetId });
      subtitle.push(...splitSubtitle(l.text, cursor, l.durationSec, input.maxSubtitleChars ?? 42));
      cursor += l.durationSec + 0.15;
    }
  });
  const t = timelineDuration({ tracks: { video } });

  const music: Timeline['tracks']['music'] = input.music
    ? [{ assetId: input.music.assetId, start: 0, end: t, gainDb: input.music.gainDb ?? -18, duckUnderDialog: true }]
    : [];

  return { fps: input.fps, aspect: input.aspect, tracks: { video, dialog, music, sfx: [], subtitle } };
}

/** Pecah kalimat panjang jadi beberapa subtitle pendek, dengan timestamp per kata (perkiraan). */
export function splitSubtitle(text: string, start: number, duration: number, maxChars = 42): Subtitle[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[][] = [[]];
  for (const w of words) {
    const cur = chunks[chunks.length - 1]!;
    if (cur.length && [...cur, w].join(' ').length > maxChars) chunks.push([w]);
    else cur.push(w);
  }
  const weight = (ws: string[]) => ws.reduce((a, w) => a + w.length + 1, 0);
  const total = weight(words);
  const out: Subtitle[] = [];
  let t = start;
  for (const c of chunks) {
    const d = (duration * weight(c)) / total;
    let wt = t;
    const wordsTimed = c.map((w) => {
      const item = { t: round3(wt), w };
      wt += (d * (w.length + 1)) / weight(c);
      return item;
    });
    out.push({ start: round3(t), end: round3(t + d), text: c.join(' '), words: wordsTimed });
    t += d;
  }
  return out;
}
