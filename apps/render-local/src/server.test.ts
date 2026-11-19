import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RenderClient, stillToClipCommand } from '@atomo/timeline';
import { startRenderLocal } from './server';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!hasFfmpeg)('emulator Rendi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl-'));
  let rl: Server;
  let files: Server;
  let client: RenderClient;
  let png = '';
  beforeAll(async () => {
    // Server file sumber (meniru R2 publik).
    const img = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x553311:size=320x180', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1e7 }).stdout;
    files = createServer((_q, s) => { s.writeHead(200, { 'content-type': 'image/png' }); s.end(img); }).listen(0);
    await new Promise((r) => files.once('listening', r));
    png = `http://127.0.0.1:${(files.address() as { port: number }).port}/key.png`;
    rl = startRenderLocal({ port: 0, dir, apiKey: 'kunci' });
    await new Promise((r) => rl.once('listening', r));
    client = new RenderClient({ apiKey: 'kunci', baseUrl: `http://127.0.0.1:${(rl.address() as { port: number }).port}` });
  });
  afterAll(() => {
    rl.close();
    files.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('menolak key salah', async () => {
    await expect(new RenderClient({ apiKey: 'salah', baseUrl: (client as unknown as { opts: { baseUrl: string } }).opts.baseUrl }).status('x')).rejects.toMatchObject({ status: 401 });
  });

  it('menjalankan perintah lewat client Rendi dan menyajikan hasil', async () => {
    const id = await client.submit(stillToClipCommand({ imageUrl: png, durationSec: 2, aspect: '9:16', quality: '480p', outputName: 'clip.mp4' }));
    let st = await client.status(id);
    for (let i = 0; i < 60 && (st.state === 'queued' || st.state === 'running'); i++) {
      await new Promise((r) => setTimeout(r, 250));
      st = await client.status(id);
    }
    expect(st.state, st.error).toBe('succeeded');
    const res = await fetch(st.outputs.out_1!.url);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  }, 60_000);
});
