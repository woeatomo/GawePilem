import { z } from 'zod';

const sec = z.number().finite().min(0).max(4 * 3600);
const gain = z.number().finite().min(-60).max(12);

export const videoClipSchema = z
  .object({ shotId: z.string().min(1), in: sec, out: sec, transition: z.enum(['cut', 'fade', 'dip']).optional() })
  .refine((c) => c.out - c.in >= 0.2, { message: 'Klip minimal 0,2 detik (out harus > in)' });
export const dialogClipSchema = z.object({ lineId: z.string().min(1), start: sec, assetId: z.string().min(1), gainDb: gain.optional() });
export const musicClipSchema = z
  .object({ assetId: z.string().min(1), start: sec, end: sec, gainDb: gain, duckUnderDialog: z.boolean() })
  .refine((m) => m.end > m.start, { message: 'Musik: end harus > start' });
export const sfxClipSchema = z.object({ assetId: z.string().min(1), start: sec, gainDb: gain.optional() });
export const subtitleSchema = z
  .object({
    start: sec,
    end: sec,
    text: z.string().min(1).max(300),
    words: z.array(z.object({ t: sec, w: z.string() })).optional(),
  })
  .refine((s) => s.end > s.start, { message: 'Subtitle: end harus > start' });

export const timelineSchema = z
  .object({
    fps: z.union([z.literal(24), z.literal(25), z.literal(30)]),
    aspect: z.enum(['9:16', '16:9', '1:1']),
    tracks: z.object({
      video: z.array(videoClipSchema).min(1),
      dialog: z.array(dialogClipSchema),
      music: z.array(musicClipSchema),
      sfx: z.array(sfxClipSchema),
      subtitle: z.array(subtitleSchema),
    }),
  })
  .superRefine((t, ctx) => {
    const ids = new Set<string>();
    t.tracks.video.forEach((v, i) => {
      if (ids.has(v.shotId)) ctx.addIssue({ code: 'custom', path: ['tracks', 'video', i, 'shotId'], message: `shotId ganda: ${v.shotId}` });
      ids.add(v.shotId);
    });
    const subs = [...t.tracks.subtitle].sort((a, b) => a.start - b.start);
    for (let i = 1; i < subs.length; i++) {
      if (subs[i]!.start < subs[i - 1]!.end - 0.001)
        ctx.addIssue({ code: 'custom', path: ['tracks', 'subtitle'], message: `Subtitle tumpang tindih di ${subs[i]!.start.toFixed(2)} dtk` });
    }
  });

export type Timeline = z.infer<typeof timelineSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type DialogClip = z.infer<typeof dialogClipSchema>;
export type MusicClip = z.infer<typeof musicClipSchema>;
export type SfxClip = z.infer<typeof sfxClipSchema>;
export type Subtitle = z.infer<typeof subtitleSchema>;

/** Durasi overlap transisi (detik). */
export const TRANSITION_SEC = 0.5;

/** Posisi mulai tiap klip video di timeline (transisi fade/dip saling tumpuk). */
export function clipStarts(t: { tracks: { video: readonly VideoClip[] } }): number[] {
  const starts: number[] = [];
  let acc = 0;
  t.tracks.video.forEach((c, i) => {
    const overlap = i > 0 && c.transition && c.transition !== 'cut' ? overlapFor(t.tracks.video, i) : 0;
    const start = Math.max(0, acc - overlap);
    starts.push(start);
    acc = start + (c.out - c.in);
  });
  return starts;
}

export function overlapFor(video: readonly VideoClip[], i: number): number {
  const prev = video[i - 1];
  const cur = video[i];
  if (!prev || !cur) return 0;
  // Overlap tidak boleh melebihi separuh klip terpendek.
  return Math.min(TRANSITION_SEC, (prev.out - prev.in) / 2, (cur.out - cur.in) / 2);
}

export function timelineDuration(t: { tracks: { video: readonly VideoClip[] } }): number {
  const starts = clipStarts(t);
  const last = t.tracks.video.length - 1;
  if (last < 0) return 0;
  return round3(starts[last]! + (t.tracks.video[last]!.out - t.tracks.video[last]!.in));
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Timecode HH:MM:SS:FF. */
export function timecode(sec: number, fps: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * fps + 1e-6);
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}
