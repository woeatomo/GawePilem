import { clipStarts, overlapFor, round3, timelineDuration, type Timeline } from './schema';

export type Quality = '480p' | '720p' | '1080p';

export function outputSize(aspect: Timeline['aspect'], quality: Quality): { width: number; height: number } {
  const short = { '480p': 480, '720p': 720, '1080p': 1080 }[quality];
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (aspect === '9:16') return { width: short, height: long };
  if (aspect === '16:9') return { width: long, height: short };
  return { width: short, height: short };
}

export interface AssetRef {
  path: string;
  /** still = gambar diam (keyframe) yang di-loop; video = klip; audio = file suara. */
  kind: 'video' | 'still' | 'audio';
}

export interface CompileOptions {
  /** shotId / assetId → file lokal. */
  assets: Record<string, AssetRef>;
  outputPath: string;
  quality: Quality;
  /** Path file .ass subtitle (ditulis worker); kosong = tanpa subtitle. */
  subtitlePath?: string;
  /** Watermark teks (paket Free). */
  watermark?: string;
  crf?: number;
  preset?: string;
  /** Normalisasi loudness ke -14 LUFS (standar platform sosial). */
  loudnorm?: boolean;
}

export interface CompiledCommand {
  args: string[];
  duration: number;
  filterComplex: string;
}

export class CompileError extends Error {}

const f3 = (n: number) => round3(n).toString();
const dbToVol = (db: number) => round3(10 ** (db / 20)).toString();

/** Escape path untuk dipakai di dalam filtergraph (subtitles=...). */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Kompilasi timeline JSON menjadi argumen FFmpeg (satu pass, tanpa shell).
 * Video: trim + freeze frame bila klip sumber lebih pendek, scale/crop ke rasio target,
 * transisi xfade. Audio: dialog (adelay), musik dengan ducking sidechain, sfx, lalu amix.
 */
export function compileTimeline(t: Timeline, o: CompileOptions): CompiledCommand {
  const { width: W, height: H } = outputSize(t.aspect, o.quality);
  const duration = timelineDuration(t);
  const inputs: string[] = [];
  const filters: string[] = [];
  let n = 0;
  const addInput = (ref: AssetRef, lengthSec: number) => {
    if (ref.kind === 'still') inputs.push('-loop', '1', '-framerate', String(t.fps), '-t', f3(lengthSec + 0.1), '-i', ref.path);
    else inputs.push('-i', ref.path);
    return n++;
  };
  const need = (id: string, kind: string) => {
    const a = o.assets[id];
    if (!a) throw new CompileError(`Aset ${kind} "${id}" tidak ditemukan`);
    return a;
  };

  // ---------- video ----------
  const starts = clipStarts(t);
  t.tracks.video.forEach((c, i) => {
    const ref = need(c.shotId, 'video');
    if (ref.kind === 'audio') throw new CompileError(`Aset ${c.shotId} bukan video/gambar`);
    const idx = addInput(ref, c.out);
    const len = c.out - c.in;
    filters.push(
      `[${idx}:v]tpad=stop_mode=clone:stop_duration=${f3(len + 1)},trim=start=${f3(c.in)}:duration=${f3(len)},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${t.fps},format=yuv420p,settb=AVTB[v${i}]`,
    );
  });
  let vLabel = 'v0';
  for (let i = 1; i < t.tracks.video.length; i++) {
    const c = t.tracks.video[i]!;
    const out = `vx${i}`;
    if (c.transition === 'fade' || c.transition === 'dip') {
      const d = overlapFor(t.tracks.video, i);
      filters.push(`[${vLabel}][v${i}]xfade=transition=${c.transition === 'dip' ? 'fadeblack' : 'fade'}:duration=${f3(d)}:offset=${f3(starts[i]!)},settb=AVTB[${out}]`);
    } else {
      // concat bisa mengubah timebase; samakan lagi supaya xfade berikutnya tidak gagal.
      filters.push(`[${vLabel}][v${i}]concat=n=2:v=1:a=0,settb=AVTB[${out}]`);
    }
    vLabel = out;
  }
  const post: string[] = [];
  if (o.subtitlePath) post.push(`subtitles='${escapeFilterPath(o.subtitlePath)}'`);
  if (o.watermark) {
    const txt = o.watermark.replace(/[\\':,%[\]]/g, '');
    post.push(`drawtext=text='${txt}':fontcolor=white@0.55:fontsize=${Math.round(Math.min(W, H) * 0.03)}:x=w-tw-${Math.round(W * 0.04)}:y=${Math.round(H * 0.03)}`);
  }
  filters.push(`[${vLabel}]${post.length ? post.join(',') : 'null'}[vout]`);

  // ---------- audio ----------
  const dialogLabels: string[] = [];
  t.tracks.dialog.forEach((d, i) => {
    const idx = addInput(need(d.assetId, 'dialog'), 0);
    const ms = Math.round(d.start * 1000);
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${dbToVol(d.gainDb ?? 0)},adelay=${ms}|${ms}[d${i}]`);
    dialogLabels.push(`[d${i}]`);
  });
  const mixLabels: string[] = [];
  let dialogBus: string | null = null;
  let sidechain: string | null = null;
  if (dialogLabels.length) {
    const duck = t.tracks.music.some((m) => m.duckUnderDialog);
    filters.push(
      `${dialogLabels.join('')}amix=inputs=${dialogLabels.length}:normalize=0:duration=longest${duck ? ',asplit=2[dbus][dsc]' : '[dbus]'}`,
    );
    dialogBus = '[dbus]';
    sidechain = duck ? '[dsc]' : null;
    mixLabels.push(dialogBus);
  }
  const duckedMusic: string[] = [];
  const plainMusic: string[] = [];
  t.tracks.music.forEach((m, i) => {
    const idx = addInput(need(m.assetId, 'musik'), 0);
    const ms = Math.round(m.start * 1000);
    const len = m.end - m.start;
    const fadeOut = Math.min(1.5, len / 4);
    filters.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f3(len)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:d=${f3(Math.min(0.8, len / 4))},afade=t=out:st=${f3(len - fadeOut)}:d=${f3(fadeOut)},volume=${dbToVol(m.gainDb)},adelay=${ms}|${ms}[m${i}]`,
    );
    (m.duckUnderDialog && sidechain ? duckedMusic : plainMusic).push(`[m${i}]`);
  });
  if (duckedMusic.length && sidechain) {
    const bus = duckedMusic.length > 1 ? '[mbus]' : duckedMusic[0]!;
    if (duckedMusic.length > 1) filters.push(`${duckedMusic.join('')}amix=inputs=${duckedMusic.length}:normalize=0[mbus]`);
    filters.push(`${bus}${sidechain}sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[mduck]`);
    mixLabels.push('[mduck]');
  } else if (sidechain) {
    filters.push(`${sidechain}anullsink`);
  }
  mixLabels.push(...plainMusic);
  t.tracks.sfx.forEach((s, i) => {
    const idx = addInput(need(s.assetId, 'sfx'), 0);
    const ms = Math.round(s.start * 1000);
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${dbToVol(s.gainDb ?? 0)},adelay=${ms}|${ms}[s${i}]`);
    mixLabels.push(`[s${i}]`);
  });
  if (!mixLabels.length) {
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${f3(duration)}[aout]`);
  } else {
    const norm = o.loudnorm === false ? '' : ',loudnorm=I=-14:TP=-1.5:LRA=11';
    filters.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest,apad,atrim=0:${f3(duration)}${norm},aresample=48000[aout]`,
    );
  }

  const filterComplex = filters.join(';\n');
  const args = [
    '-hide_banner', '-y', '-nostdin',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', o.preset ?? 'medium', '-crf', String(o.crf ?? 20), '-pix_fmt', 'yuv420p', '-r', String(t.fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', f3(duration),
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    o.outputPath,
  ];
  return { args, duration, filterComplex };
}

/** Baca progres dari `-progress pipe:1` (out_time_us) → 0..100. */
export function parseProgress(chunk: string, duration: number): number | null {
  const m = /out_time_us=(\d+)/g;
  let last: number | null = null;
  for (const x of chunk.matchAll(m)) last = Number(x[1]);
  if (last === null || duration <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((last / 1e6 / duration) * 100)));
}
