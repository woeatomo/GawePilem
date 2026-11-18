import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyEdits, autoAssemble, clipStarts, compileTimeline, EditError, editProposalSchema, outputSize, parseProgress,
  splitSubtitle, timecode, timelineDuration, timelineSchema, toAss, escapeFilterPath, type Timeline,
} from './index';

const base: Timeline = {
  fps: 24,
  aspect: '9:16',
  tracks: {
    video: [{ shotId: 'a', in: 0, out: 2 }, { shotId: 'b', in: 0.5, out: 2.5, transition: 'fade' }, { shotId: 'c', in: 0, out: 1.5, transition: 'cut' }],
    dialog: [{ lineId: 'l1', start: 0.3, assetId: 'vo1' }],
    music: [{ assetId: 'mus', start: 0, end: 5, gainDb: -18, duckUnderDialog: true }],
    sfx: [{ assetId: 'knock', start: 1.2 }],
    subtitle: [{ start: 0.3, end: 1.5, text: 'Jangan dijawab.' }],
  },
};

describe('skema & durasi', () => {
  it('valid dan durasi memperhitungkan overlap fade', () => {
    expect(timelineSchema.parse(base)).toBeTruthy();
    expect(clipStarts(base)).toEqual([0, 1.5, 3.5]);
    expect(timelineDuration(base)).toBe(5);
  });
  it('menolak out <= in, shot ganda, subtitle tumpang tindih', () => {
    expect(timelineSchema.safeParse({ ...base, tracks: { ...base.tracks, video: [{ shotId: 'a', in: 2, out: 1 }] } }).success).toBe(false);
    expect(timelineSchema.safeParse({ ...base, tracks: { ...base.tracks, video: [base.tracks.video[0], base.tracks.video[0]] } }).success).toBe(false);
    const subs = [{ start: 0, end: 2, text: 'a' }, { start: 1, end: 3, text: 'b' }];
    expect(timelineSchema.safeParse({ ...base, tracks: { ...base.tracks, subtitle: subs } }).success).toBe(false);
    expect(timelineSchema.safeParse({ ...base, fps: 60 }).success).toBe(false);
  });
  it('timecode HH:MM:SS:FF', () => {
    expect(timecode(3661.5, 24)).toBe('01:01:01:12');
  });
});

describe('rakit otomatis', () => {
  const tl = autoAssemble({
    fps: 24, aspect: '9:16', sceneTransition: 'fade', music: { assetId: 'mus' },
    shots: [
      { shotId: 's1', sceneNo: 1, durationSec: 3 },
      { shotId: 's2', sceneNo: 1, durationSec: 2 },
      { shotId: 's3', sceneNo: 2, durationSec: 4 },
    ],
    lines: [
      { lineId: 'l1', shotId: 's2', assetId: 'vo1', text: 'Tiga ketukan, jam tiga. Kalau kamu jawab, besok kamu yang ngetuk.', durationSec: 4 },
      { lineId: 'l2', shotId: 's3', assetId: 'vo2', text: 'Jangan dijawab.', durationSec: 1.2 },
    ],
  });
  it('shot diperpanjang bila dialog lebih panjang', () => {
    expect(tl.tracks.video.map((v) => v.out)).toEqual([3, 4.5, 4]);
  });
  it('dialog ditempel ke shot yang tepat, setelah transisi', () => {
    expect(tl.tracks.video[2]!.transition).toBe('fade');
    expect(tl.tracks.dialog).toEqual([
      { lineId: 'l1', start: 3.2, assetId: 'vo1' },
      { lineId: 'l2', start: 7.7, assetId: 'vo2' }, // shot 3 mulai 7,5 - 0,5 overlap = 7,0; +0,5 overlap +0,2 lead
    ]);
  });
  it('musik dipotong pas durasi, subtitle dipecah ≤ 42 karakter', () => {
    expect(tl.tracks.music[0]).toMatchObject({ start: 0, end: timelineDuration(tl), duckUnderDialog: true });
    expect(tl.tracks.subtitle.every((s) => s.text.length <= 42)).toBe(true);
    expect(timelineSchema.safeParse(tl).success).toBe(true);
  });
  it('splitSubtitle membagi waktu proporsional dengan timestamp per kata', () => {
    const s = splitSubtitle('satu dua tiga empat', 1, 2, 9);
    expect(s.map((x) => x.text)).toEqual(['satu dua', 'tiga', 'empat']);
    expect(s[0]!.start).toBe(1);
    expect(s.at(-1)!.end).toBe(3);
    expect(s[0]!.words![1]!.w).toBe('dua');
  });
});

describe('edit dengan operasi', () => {
  it('trim, pindah, transisi, hapus, tanpa memutasi input', () => {
    const out = applyEdits(base, [
      { op: 'trim', shotId: 'a', out: 1.5 },
      { op: 'move', shotId: 'c', toIndex: 0 },
      { op: 'transition', shotId: 'a', transition: 'dip' },
      { op: 'remove', shotId: 'b' },
      { op: 'gain', track: 'music', gainDb: -24 },
    ]);
    expect(out.tracks.video.map((v) => v.shotId)).toEqual(['c', 'a']);
    expect(out.tracks.video[0]!.transition).toBeUndefined();
    expect(out.tracks.music[0]!.gainDb).toBe(-24);
    expect(base.tracks.video[0]!.out).toBe(2);
  });
  it('menolak hasil tidak valid dan shot yang tidak ada', () => {
    expect(() => applyEdits(base, [{ op: 'trim', shotId: 'a', out: 0.1 }])).toThrow(EditError);
    expect(() => applyEdits(base, [{ op: 'remove', shotId: 'zzz' }])).toThrow(EditError);
  });
  it('skema proposal LLM', () => {
    expect(editProposalSchema.safeParse({ summary: 'percepat', ops: [{ op: 'trim', shotId: 'a', out: 1 }] }).success).toBe(true);
    expect(editProposalSchema.safeParse({ summary: 'x', ops: [{ op: 'hapusSemua' }] }).success).toBe(false);
  });
});

describe('ASS & kompilasi', () => {
  it('ASS dengan karaoke \\k', () => {
    const ass = toAss([{ start: 0.3, end: 1.5, text: 'Jangan {dijawab}', words: [{ t: 0.3, w: 'Jangan' }, { t: 0.9, w: 'dijawab' }] }], { width: 1080, height: 1920 }, { karaoke: true });
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Dialogue: 0,0:00:00.30,0:00:01.50,Default,,0,0,0,,{\\k60}Jangan {\\k60}dijawab');
  });
  it('ukuran keluaran genap per rasio', () => {
    expect(outputSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(outputSize('16:9', '480p')).toEqual({ width: 854, height: 480 });
  });
  it('error bila aset hilang', () => {
    expect(() => compileTimeline(base, { assets: {}, outputPath: 'x.mp4', quality: '480p' })).toThrow(/tidak ditemukan/);
  });
  it('filtergraph memuat xfade, concat, ducking sidechain', () => {
    const assets = Object.fromEntries(['a', 'b', 'c'].map((k) => [k, { path: `${k}.mp4`, kind: 'video' as const }]));
    for (const k of ['vo1', 'mus', 'knock']) assets[k] = { path: `${k}.wav`, kind: 'audio' } as never;
    const c = compileTimeline(base, { assets, outputPath: 'out.mp4', quality: '720p', subtitlePath: "/tmp/a:b's.ass" });
    expect(c.filterComplex).toContain('xfade=transition=fade:duration=0.5:offset=1.5');
    expect(c.filterComplex).toContain('concat=n=2');
    expect(c.filterComplex).toContain('sidechaincompress');
    expect(c.filterComplex).toContain("subtitles='/tmp/a\\:b\\'s.ass'");
    expect(c.args).toContain('-t');
    expect(escapeFilterPath('C:\\x,y')).toBe('C\\:/x\\,y');
  });
  it('parseProgress', () => {
    expect(parseProgress('frame=1\nout_time_us=2500000\nprogress=continue\n', 5)).toBe(50);
    expect(parseProgress('progress=end', 5)).toBeNull();
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!hasFfmpeg)('render FFmpeg sungguhan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

  it('merender MP4 9:16 dengan durasi & resolusi benar', () => {
    ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=1.5', join(dir, 'a.mp4')); // lebih pendek dari 2 dtk → freeze
    ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=3', join(dir, 'b.mp4'));
    ff('-f', 'lavfi', '-i', 'color=c=0x1d1406:size=576x1024', '-frames:v', '1', join(dir, 'c.png'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(dir, 'vo1.wav'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=110:duration=8', join(dir, 'mus.wav'));
    ff('-f', 'lavfi', '-i', 'anoisesrc=d=0.3:a=0.2', join(dir, 'knock.wav'));
    const subPath = join(dir, 'subs.ass');
    writeFileSync(subPath, toAss(base.tracks.subtitle, outputSize('9:16', '480p'), { karaoke: true }));
    const out = join(dir, 'out.mp4');
    const c = compileTimeline(base, {
      outputPath: out, quality: '480p', subtitlePath: subPath, watermark: 'Atomo Film Studio', preset: 'ultrafast',
      assets: {
        a: { path: join(dir, 'a.mp4'), kind: 'video' }, b: { path: join(dir, 'b.mp4'), kind: 'video' }, c: { path: join(dir, 'c.png'), kind: 'still' },
        vo1: { path: join(dir, 'vo1.wav'), kind: 'audio' }, mus: { path: join(dir, 'mus.wav'), kind: 'audio' }, knock: { path: join(dir, 'knock.wav'), kind: 'audio' },
      },
    });
    const r = spawnSync('ffmpeg', c.args, { encoding: 'utf8' });
    expect(r.stderr.split('\n').filter((l) => /error/i.test(l))).toEqual([]);
    expect(r.status).toBe(0);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out], { encoding: 'utf8' }));
    const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    expect([v.width, v.height]).toEqual([480, 854]);
    expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
    expect(Math.abs(Number(probe.format.duration) - 5)).toBeLessThan(0.15);
  }, 60_000);
});
