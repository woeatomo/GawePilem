import { createServer, type IncomingMessage, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Queue } from 'bullmq';
import { mediaJobSchema, queueFor, type MediaJobData } from '@atomo/db';
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

const MAX_BODY = 64 * 1024;

function tokenOk(header: string | undefined, token: string): boolean {
  const given = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error('too_large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * HTTP kecil untuk menerima job dari web (yang bisa berjalan di Cloudflare Workers tanpa Redis).
 *   GET  /health   → status worker & Redis
 *   POST /enqueue  → Authorization: Bearer <WORKER_TOKEN>, body MediaJobData
 */
export function startServer(opts: { port: number; token: string; queues: Record<string, Queue<MediaJobData>>; redisOk: () => Promise<boolean> }): Server {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && req.url === '/health') {
        const redis = await opts.redisOk();
        return send(redis ? 200 : 503, { ok: redis, redis });
      }
      if (req.method === 'POST' && req.url === '/enqueue') {
        if (!tokenOk(req.headers.authorization, opts.token)) return send(401, { error: 'unauthorized' });
        let raw: unknown;
        try {
          raw = JSON.parse(await readBody(req));
        } catch (e) {
          return send((e as Error).message === 'too_large' ? 413 : 400, { error: 'bad_body' });
        }
        const parsed = mediaJobSchema.safeParse(raw);
        if (!parsed.success) return send(400, { error: 'invalid_job', detail: parsed.error.issues[0]?.message });
        const data = parsed.data;
        const q = opts.queues[queueFor(data.kind)];
        if (!q) return send(500, { error: 'no_queue' });
        await q.add(data.kind, data, {
          jobId: data.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 7 * 86_400 },
        });
        log('job diterima', { kind: data.kind, jobId: data.jobId });
        return send(202, { ok: true });
      }
      send(404, { error: 'not_found' });
    } catch (e) {
      log('server error', { error: (e as Error).message });
      send(500, { error: 'internal' });
    }
  });
  server.listen(opts.port, '0.0.0.0', () => log('HTTP worker siap', { port: opts.port }));
  return server;
}
