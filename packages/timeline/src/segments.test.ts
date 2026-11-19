import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTimeline, muxCommand, planSegments, sliceTimeline, splitCommand, timelineDuration, type Timeline } from './index';

const long = (n: number, dipEvery = 4): Timeline => ({
  fps: 24, aspect: '16:9',
  tracks: {
    video: Array.from({ length: n }, (_, i) => ({ shotId: `s${i}`, in: 0, out: 3, ...(i > 0 ? { transition: i % dipEvery === 0 ? ('dip' as const) : ('cut' as const) } : {}) })),
    dialog: [{ lineId: 'l1', start: 1, assetId: 'vo' }, { lineId: 'l2', start: 20, assetId: 'vo' }],
    music: [{ assetId: 'mus', start: 0, end: 25, gainDb: -18, duckUnderDialog: true }],
    sfx: [],
    subtitle: [{ start: 1, end: 3, text: 'Halo' }],
  },
});

describe('planSegments', () => {
  it('timeline pendek tetap satu segmen', () => {
    const t = long(4);
    expect(planSegments(t, 120)).toEqual([{ start: 0, end: timelineDuration(t) }]);
  });

  it('memotong hanya di cut, menutup seluruh durasi tanpa celah', () => {
    const t = long(400); // ±20 menit
    const segs = planSegments(t, 120);
    expect(segs.length).toBeGreaterThan(8);
    expect(segs[0]!.start).toBe(0);
    expect(segs.at(-1)!.end).toBe(timelineDuration(t));
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
    // Batas segmen tidak pernah jatuh di klip yang masuk dengan dip.
    for (const s of segs.slice(1)) {
      const sl = sliceTimeline(t, s.start, s.end);
      expect(sl.tracks.video[0]!.in).toBe(0);
      expect(sl.tracks.video[0]!.out).toBe(3);
    }
    expect(Math.max(...segs.map((s) => s.end - s.start))).toBeLessThan(180);
  });

  it('mux memakai concat tanpa re-encode video', () => {
    const c = muxCommand({ segmentUrls: ['https://m/0.ts', 'https://m/1.ts'], audioUrl: 'https://m/a.m4a', duration: 12.5, outputName: 'x.mp4' });
    const a = splitCommand(c.command);
    expect(a).toContain('concat:{{in_s0}}|{{in_s1}}');
    expect(a.slice(a.indexOf('-c:v'), a.indexOf('-c:v') + 2)).toEqual(['-c:v', 'copy']);
    expect(c.inputFiles).toEqual({ in_s0: 'https://m/0.ts', in_s1: 'https://m/1.ts', in_aud: 'https://m/a.m4a' });
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!hasFfmpeg)('render per segmen dengan FFmpeg sungguhan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seg-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

  it('segmen video + audio master digabung jadi MP4 dengan durasi sama seperti satu pass', () => {
    ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', join(dir, 'c.mp4'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', join(dir, 'vo.wav'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=110:duration=30', join(dir, 'mus.wav'));
    const t = long(10); // 30 dtk, dip di klip 4 & 8
    const total = timelineDuration(t);
    const segs = planSegments(t, 8);
    expect(segs.length).toBeGreaterThan(1);
    const video = Object.fromEntries(t.tracks.video.map((v) => [v.shotId, { path: join(dir, 'c.mp4'), kind: 'video' as const }]));
    const audio = { vo: { path: join(dir, 'vo.wav'), kind: 'audio' as const }, mus: { path: join(dir, 'mus.wav'), kind: 'audio' as const } };
    const segFiles = segs.map((s, i) => {
      const out = join(dir, `seg${i}.ts`);
      const c = compileTimeline(sliceTimeline(t, s.start, s.end), { assets: video, outputPath: out, quality: '480p', preset: 'ultrafast', parts: 'video' });
      const r = spawnSync('ffmpeg', c.args, { encoding: 'utf8' });
      expect(r.status, r.stderr.slice(-400)).toBe(0);
      return out;
    });
    const aud = join(dir, 'a.m4a');
    const ca = compileTimeline(t, { assets: audio, outputPath: aud, quality: '480p', parts: 'audio' });
    expect(spawnSync('ffmpeg', ca.args, { encoding: 'utf8' }).status).toBe(0);
    const out = join(dir, 'final.mp4');
    const m = muxCommand({ segmentUrls: segFiles, audioUrl: aud, duration: total, outputName: 'final.mp4' });
    const files: Record<string, string> = { ...Object.fromEntries(segFiles.map((f, i) => [`in_s${i}`, f])), in_aud: aud, out_1: out };
    const args = splitCommand(m.command).map((a) => a.replace(/\{\{(\w+)\}\}/g, (_, k: string) => files[k]!));
    const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    expect(r.status, r.stderr.slice(-400)).toBe(0);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out], { encoding: 'utf8' }));
    const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    expect([v.width, v.height]).toEqual([854, 480]);
    expect(a).toBeTruthy();
    expect(Math.abs(Number(probe.format.duration) - total)).toBeLessThan(0.2);
    expect(Math.abs(Number(v.duration) - Number(a.duration))).toBeLessThan(0.2);
  }, 120_000);
});
