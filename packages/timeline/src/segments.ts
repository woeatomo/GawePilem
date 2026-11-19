import { joinCommand, type RemoteCommand } from './remote';
import { clipStarts, round3, timelineDuration, type Timeline } from './schema';

export interface SegmentPlan {
  start: number;
  end: number;
}

/**
 * Bagi timeline panjang jadi segmen ±targetSec untuk dirender paralel.
 * Hanya dipotong di batas klip dengan transisi cut, supaya fade/dip tidak terbelah dan
 * segmen bisa digabung tanpa re-encode.
 */
export function planSegments(t: Timeline, targetSec = 120): SegmentPlan[] {
  const total = timelineDuration(t);
  if (total <= targetSec * 1.5) return [{ start: 0, end: total }];
  const starts = clipStarts(t);
  const cuts = t.tracks.video
    .map((c, i) => ({ i, at: starts[i]! }))
    .filter(({ i }) => i > 0 && (t.tracks.video[i]!.transition ?? 'cut') === 'cut')
    .map(({ at }) => at);
  const out: SegmentPlan[] = [];
  let from = 0;
  for (const at of cuts) {
    // Potong saat segmen sudah mencapai target, asal sisa tidak terlalu pendek.
    if (at - from >= targetSec && total - at >= targetSec / 3) {
      out.push({ start: from, end: round3(at) });
      from = round3(at);
    }
  }
  out.push({ start: from, end: total });
  return out;
}

/** Gabung segmen video (MPEG-TS) + audio master jadi MP4 tanpa re-encode video. */
export function muxCommand(o: { segmentUrls: string[]; audioUrl: string; duration: number; outputName: string }): RemoteCommand {
  if (!o.segmentUrls.length) throw new Error('Tidak ada segmen untuk digabung');
  const inputFiles: Record<string, string> = {};
  o.segmentUrls.forEach((u, i) => (inputFiles[`in_s${i}`] = u));
  inputFiles.in_aud = o.audioUrl;
  const concat = `concat:${o.segmentUrls.map((_, i) => `{{in_s${i}}}`).join('|')}`;
  const args = [
    '-hide_banner', '-y', '-nostdin', '-i', concat, '-i', '{{in_aud}}',
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy',
    '-t', String(round3(o.duration)), '-movflags', '+faststart', '{{out_1}}',
  ];
  return { command: joinCommand(args), inputFiles, outputFiles: { out_1: o.outputName }, duration: o.duration };
}
