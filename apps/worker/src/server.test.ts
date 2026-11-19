import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MediaJobData } from '@atomo/db';
import { startServer } from './server';

const TOKEN = 'x'.repeat(32);
const added: { name: string; data: MediaJobData; jobId: string }[] = [];
const fakeQueue = (name: string) =>
  ({
    add: vi.fn(async (_n: string, data: MediaJobData, o: { jobId: string }) => {
      if (!added.some((a) => a.jobId === o.jobId)) added.push({ name, data, jobId: o.jobId });
    }),
  }) as unknown as Queue<MediaJobData>;

let base = '';
let server: ReturnType<typeof startServer>;
beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  server = startServer({ port: 0, token: TOKEN, queues: { 'atomo-media': fakeQueue('media'), 'atomo-render': fakeQueue('render') }, redisOk: async () => true });
  await new Promise((r) => server.once('listening', r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});
afterAll(() => server.close());

const post = (body: unknown, token = TOKEN) =>
  fetch(`${base}/enqueue`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ws = '8ceee71c-bfb0-4f85-85b3-51e41abb41f4';

describe('HTTP enqueue worker', () => {
  it('menolak token salah', async () => {
    expect((await post({ kind: 'purge', jobId: 'j0', workspaceId: ws }, 'salah')).status).toBe(401);
    expect((await post({ kind: 'purge', jobId: 'j0', workspaceId: ws }, '')).status).toBe(401);
  });

  it('menolak job tidak valid', async () => {
    expect((await post({ kind: 'hapus-semua', jobId: 'j1' })).status).toBe(400);
    expect((await post({ kind: 'keyframe', jobId: 'j1', workspaceId: ws, shotIds: [] })).status).toBe(400);
  });

  it('render ke antrean render, lainnya ke antrean media; idempotent per jobId', async () => {
    const r = '2bfc6be7-8356-47f8-bcce-9746b12c447d';
    expect((await post({ kind: 'render', jobId: 'j2', workspaceId: ws, renderId: r })).status).toBe(202);
    expect((await post({ kind: 'render', jobId: 'j2', workspaceId: ws, renderId: r })).status).toBe(202);
    expect((await post({ kind: 'purge', jobId: 'j3', workspaceId: ws })).status).toBe(202);
    expect(added.map((a) => [a.name, a.jobId])).toEqual([['render', 'j2'], ['media', 'j3']]);
  });

  it('health', async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, redis: true });
  });
});
