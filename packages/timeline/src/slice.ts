import { clipStarts, round3, timelineDuration, type Timeline } from './schema';

export class SliceError extends Error {}

/**
 * Ambil potongan [start, end) dari timeline (mis. teaser Shorts dari episode 16:9).
 * Klip video dipangkas pada batas, dialog/sfx yang mulai di luar rentang dibuang,
 * subtitle & musik dipotong, lalu semua waktu digeser supaya potongan mulai di 0.
 * Transisi di batas potongan dijadikan cut supaya tidak ada overlap ke klip yang dibuang.
 */
export function sliceTimeline(t: Timeline, start: number, end: number): Timeline {
  const total = timelineDuration(t);
  const s = Math.max(0, start);
  const e = Math.min(total, end);
  if (e - s < 1) throw new SliceError('Rentang potongan minimal 1 detik dan harus di dalam durasi episode');

  const starts = clipStarts(t);
  const video: Timeline['tracks']['video'] = [];
  t.tracks.video.forEach((c, i) => {
    const cs = starts[i]!;
    const ce = cs + (c.out - c.in);
    if (ce <= s || cs >= e) return;
    const cutIn = Math.max(0, s - cs);
    const cutOut = Math.max(0, ce - e);
    const nin = round3(c.in + cutIn);
    const nout = round3(c.out - cutOut);
    if (nout - nin < 0.2) return;
    const clip = { shotId: c.shotId, in: nin, out: nout, ...(c.transition ? { transition: c.transition } : {}) };
    // Klip pertama potongan, atau klip yang sudah dipangkas di awal, tidak boleh membawa transisi masuk.
    if (video.length === 0 || cutIn > 0) delete (clip as { transition?: string }).transition;
    video.push(clip);
  });
  if (!video.length) throw new SliceError('Tidak ada klip di rentang itu');

  const inRange = (x: number) => x >= s && x < e;
  const shift = (x: number) => round3(x - s);
  return {
    fps: t.fps,
    aspect: t.aspect,
    tracks: {
      video,
      dialog: t.tracks.dialog.filter((d) => inRange(d.start)).map((d) => ({ ...d, start: shift(d.start) })),
      sfx: t.tracks.sfx.filter((d) => inRange(d.start)).map((d) => ({ ...d, start: shift(d.start) })),
      music: t.tracks.music
        .filter((m) => m.end > s && m.start < e)
        .map((m) => ({ ...m, start: shift(Math.max(m.start, s)), end: shift(Math.min(m.end, e)) }))
        .filter((m) => m.end > m.start),
      subtitle: t.tracks.subtitle
        .filter((x) => x.end > s && x.start < e)
        .map((x) => ({
          start: shift(Math.max(x.start, s)),
          end: shift(Math.min(x.end, e)),
          text: x.text,
          ...(x.words ? { words: x.words.filter((w) => inRange(w.t)).map((w) => ({ t: shift(w.t), w: w.w })) } : {}),
        }))
        .filter((x) => x.end > x.start),
    },
  };
}
