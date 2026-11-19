import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CAMERA_MOVES, joinCommand, remoteCommand, RenderClient, splitCommand, stillToClipCommand, toAss, outputSize, type Timeline } from './index';

const tl: Timeline = {
  fps: 24,
  aspect: '16:9',
  tracks: {
    video: [{ shotId: 'a', in: 0, out: 2 }, { shotId: 'b', in: 0, out: 2, transition: 'dip' }, { shotId: 'c', in: 0, out: 1.5, transition: 'cut' }],
    dialog: [{ lineId: 'l1', start: 0.3, assetId: 'vo1' }],
    music: [],
    sfx: [],
    subtitle: [{ start: 0.3, end: 1.5, text: "Jangan dijawab, \"Nduk\"!" }],
  },
};
const assets = {
  a: { url: 'https://media.contoh.id/w/a.mp4', kind: 'video' as const },
  b: { url: 'https://media.contoh.id/w/b.png', kind: 'still' as const },
  c: { url: 'https://media.contoh.id/w/c.mp4', kind: 'video' as const },
  vo1: { url: 'https://media.contoh.id/w/vo1.mp3', kind: 'audio' as const },
};

describe('perintah remote', () => {
  it('join/split bolak-balik untuk filtergraph berisi kutip, kurung, titik koma', () => {
    const args = ['-filter_complex', "[0:v]subtitles='{{in_sub}}',drawtext=text='Pilem Studio':x=w-tw[v];[1:a]volume=1[a]", '-i', '{{in_v0}}', 'dengan spasi', 'kutip"ganda', '', '$HOME'];
    expect(splitCommand(joinCommand(args))).toEqual(args);
    expect(() => splitCommand('"tidak ditutup')).toThrow();
  });

  it('alias input stabil, tanpa -progress, subtitle sebagai input', () => {
    const r = remoteCommand(tl, { assets, outputName: 'ep1.mp4', quality: '720p', subtitleUrl: 'https://media.contoh.id/w/subs.ass' });
    expect(r.inputFiles).toEqual({ in_v0: assets.a.url, in_v1: assets.b.url, in_v2: assets.c.url, in_a3: assets.vo1.url, in_sub: 'https://media.contoh.id/w/subs.ass' });
    expect(r.outputFiles).toEqual({ out_1: 'ep1.mp4' });
    expect(r.command).not.toContain('-progress');
    expect(r.command).not.toContain('\n');
    expect(r.command).toContain("subtitles='{{in_sub}}'");
    expect(r.command.trim().endsWith('{{out_1}}')).toBe(true);
    expect(r.duration).toBe(5);
  });

  it('still → klip dengan gerak kamera', () => {
    const r = stillToClipCommand({ imageUrl: 'https://m/x.png', durationSec: 3, aspect: '9:16', outputName: 'c.mp4' });
    expect(r.inputFiles).toEqual({ in_img: 'https://m/x.png' });
    expect(splitCommand(r.command)).toContain('{{in_img}}');
  });

  it('tiap gerak kamera menghasilkan ekspresi zoompan berbeda', () => {
    const vf = (move: (typeof CAMERA_MOVES)[number]) => {
      const a = splitCommand(stillToClipCommand({ imageUrl: 'https://m/x.png', durationSec: 2, aspect: '16:9', outputName: 'c.mp4', move }).command);
      return a[a.indexOf('-vf') + 1]!;
    };
    const all = CAMERA_MOVES.map(vf);
    expect(new Set(all).size).toBe(CAMERA_MOVES.length);
    expect(vf('pan_right')).toContain("x='(iw-iw/zoom)*on/47'");
    expect(vf('push_in')).toContain("z='1+0.12*on/47'");
    // default tetap push-in (perilaku lama)
    expect(stillToClipCommand({ imageUrl: 'u', durationSec: 2, aspect: '16:9', outputName: 'c.mp4' }).command).toContain('1+0.12*on/47');
  });
});

describe('RenderClient (API Rendi)', () => {
  it('submit & status sesuai kontrak', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      if (String(url).endsWith('/v1/run-ffmpeg-command')) return Response.json({ command_id: 'cmd1' });
      return Response.json({ status: 'SUCCESS', output_files: { out_1: { storage_url: 'https://storage.rendi.dev/x/ep1.mp4', size_mbytes: 12.5, duration: 5 } } });
    }) as unknown as typeof fetch;
    const c = new RenderClient({ apiKey: 'k', fetch: f });
    const id = await c.submit(remoteCommand(tl, { assets, outputName: 'ep1.mp4', quality: '720p' }));
    expect(id).toBe('cmd1');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toMatchObject({ output_files: { out_1: 'ep1.mp4' }, max_command_run_seconds: 900 });
    expect((calls[0]!.init!.headers as Record<string, string>)['X-API-KEY']).toBe('k');
    expect(await c.status('cmd1')).toEqual({ state: 'succeeded', outputs: { out_1: { url: 'https://storage.rendi.dev/x/ep1.mp4', sizeMb: 12.5, duration: 5 } } });
  });

  it('gagal & sedang berjalan', async () => {
    const f = vi.fn(async () => Response.json({ status: 'FAILED', error_status: 'UNREACHABLE_INPUT_FILE', error_message: 'in_v0 404' })) as unknown as typeof fetch;
    expect(await new RenderClient({ apiKey: 'k', fetch: f }).status('x')).toMatchObject({ state: 'failed', error: 'UNREACHABLE_INPUT_FILE: in_v0 404' });
    const g = vi.fn(async () => Response.json({ status: 'PROCESSING' })) as unknown as typeof fetch;
    expect((await new RenderClient({ apiKey: 'k', fetch: g }).status('x')).state).toBe('running');
    const h = vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    await expect(new RenderClient({ apiKey: 'k', fetch: h }).status('x')).rejects.toMatchObject({ retryable: true });
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!hasFfmpeg)('perintah remote dijalankan seperti layanan render', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

  it('substitusi placeholder → FFmpeg sukses, ukuran & durasi benar', () => {
    ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=2', join(dir, 'a.mp4'));
    ff('-f', 'lavfi', '-i', 'color=c=0x223344:size=640x360', '-frames:v', '1', join(dir, 'b.png'));
    ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(dir, 'vo1.mp3'));
    writeFileSync(join(dir, 'subs.ass'), toAss(tl.tracks.subtitle, outputSize('16:9', '480p')));
    const r = remoteCommand(tl, { assets, outputName: 'out.mp4', quality: '480p', preset: 'ultrafast', subtitleUrl: 'x' });
    const local: Record<string, string> = { in_v0: join(dir, 'a.mp4'), in_v1: join(dir, 'b.png'), in_v2: join(dir, 'a.mp4'), in_a3: join(dir, 'vo1.mp3'), in_sub: join(dir, 'subs.ass'), out_1: join(dir, 'out.mp4') };
    const args = splitCommand(r.command).map((a) => a.replace(/\{\{(\w+)\}\}/g, (_, k: string) => local[k]!));
    const p = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    expect(p.status, p.stderr.slice(-400)).toBe(0);
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0', join(dir, 'out.mp4')], { encoding: 'utf8' });
    expect(out).toMatch(/^854,480/);
    expect(Math.abs(Number(out.trim().split('\n').at(-1)) - 5)).toBeLessThan(0.15);
  }, 60_000);
});
