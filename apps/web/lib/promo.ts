import { clipStarts, timelineDuration, type Timeline } from '@atomo/timeline';

export interface SceneSpan {
  sceneNo: number;
  start: number;
  end: number;
}

/** Rentang waktu tiap scene di timeline (dari shot yang dipakai klip video). */
export function sceneSpans(t: Timeline, sceneOfShot: Map<string, number>): SceneSpan[] {
  const starts = clipStarts(t);
  const spans = new Map<number, SceneSpan>();
  t.tracks.video.forEach((c, i) => {
    const n = sceneOfShot.get(c.shotId);
    if (n === undefined) return;
    const s = starts[i]!;
    const e = s + (c.out - c.in);
    const cur = spans.get(n);
    if (!cur) spans.set(n, { sceneNo: n, start: s, end: e });
    else spans.set(n, { sceneNo: n, start: Math.min(cur.start, s), end: Math.max(cur.end, e) });
  });
  return [...spans.values()].sort((a, b) => a.start - b.start);
}

export function formatTs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/**
 * Chapter YouTube dari scene: wajib mulai 0:00, minimal 3 chapter, tiap chapter ≥ 10 detik
 * (scene yang lebih pendek digabung ke chapter sebelumnya). Kosong bila syarat tidak terpenuhi.
 */
export function chapters(spans: SceneSpan[], heading: (sceneNo: number) => string, total: number): { start: number; title: string }[] {
  const out: { start: number; title: string; end: number }[] = [];
  for (const s of spans) {
    const title = heading(s.sceneNo).slice(0, 80) || `Scene ${s.sceneNo}`;
    const prev = out.at(-1);
    if (prev && s.start - prev.start < 10) {
      prev.end = s.end;
      continue;
    }
    out.push({ start: out.length ? s.start : 0, title, end: s.end });
  }
  const last = out.at(-1);
  if (last && total - last.start < 10 && out.length > 1) out.pop();
  return out.length >= 3 ? out.map(({ start, title }) => ({ start, title })) : [];
}

export const chapterText = (cs: { start: number; title: string }[]) => cs.map((c) => `${formatTs(c.start)} ${c.title}`).join('\n');

/** Rentang Shorts dari scene: 15–59 detik, mulai di awal scene. */
export function shortRange(span: SceneSpan, total: number): { start: number; end: number } {
  const start = Math.round(span.start * 10) / 10;
  const end = Math.min(total, start + 59, Math.max(span.end, start + 15));
  return { start, end: Math.round(end * 10) / 10 };
}

export function timelineTotal(t: Timeline): number {
  return timelineDuration(t);
}
