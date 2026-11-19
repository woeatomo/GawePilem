import { mediaJobSchema } from '@atomo/db';
import { makeCtx } from './ctx';
import type { Env } from './env';
import { parseMessage, type JobMessage } from './messages';
import { charref, clipPoll, clips, keyframes, voiceOver } from './handlers/media';
import { ffmpegPoll, render } from './handlers/render';
import { publish } from './handlers/publish';
import { expireCredits, purgeWorkspaceMedia } from './handlers/maintenance';
import { serveMedia } from './storage';

function tokenOk(header: string | null, token: string): boolean {
  const given = new TextEncoder().encode((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = new TextEncoder().encode(token);
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given[i]! ^ want[i]!;
  return diff === 0;
}

async function handle(env: Env, msg: JobMessage) {
  const ctx = makeCtx(env);
  switch (msg.kind) {
    case 'charref':
      return charref(ctx, msg);
    case 'keyframe':
      return keyframes(ctx, msg);
    case 'clip':
      return clips(ctx, msg);
    case 'clip_poll':
      return clipPoll(ctx, msg);
    case 'vo':
      return voiceOver(ctx, msg);
    case 'render':
      return render(ctx, msg);
    case 'ffmpeg_poll':
      return ffmpegPoll(ctx, msg);
    case 'publish':
      return publish(ctx, msg);
    case 'purge':
      return purgeWorkspaceMedia(ctx, msg.workspaceId);
    case 'expire':
      return expireCredits(ctx);
  }
}

export default {
  /**
   *  POST /enqueue   (Bearer WORKER_TOKEN) → masukkan job dari web ke Queue
   *  GET  /health
   *  GET  /media/<key>  → sajikan objek R2 (dev / tanpa custom domain)
   */
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true });
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) return serveMedia(makeCtx(env), decodeURIComponent(url.pathname.slice(7)), req);
    if (req.method === 'POST' && url.pathname === '/enqueue') {
      if (!tokenOk(req.headers.get('authorization'), env.WORKER_TOKEN)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      const body = await req.text();
      if (body.length > 64 * 1024) return Response.json({ error: 'too_large' }, { status: 413 });
      let raw: unknown;
      try {
        raw = JSON.parse(body);
      } catch {
        return Response.json({ error: 'bad_body' }, { status: 400 });
      }
      // Hanya jenis job publik; pesan internal (poll) tidak bisa dikirim dari luar.
      const p = mediaJobSchema.safeParse(raw);
      if (!p.success) return Response.json({ error: 'invalid_job', detail: p.error.issues[0]?.message }, { status: 400 });
      await env.JOBS.send(p.data);
      return Response.json({ ok: true }, { status: 202 });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  },

  async queue(batch, env): Promise<void> {
    for (const m of batch.messages) {
      let msg: JobMessage;
      try {
        msg = parseMessage(m.body);
      } catch (e) {
        console.error('pesan tidak valid dibuang', (e as Error).message);
        m.ack();
        continue;
      }
      try {
        await handle(env, msg);
        m.ack();
      } catch (e) {
        // Handler sudah menangani gagal permanen + refund; yang sampai sini error infrastruktur (DB/R2).
        console.error('job error, dicoba ulang', msg.kind, (e as Error).message);
        m.retry({ delaySeconds: Math.min(300, 10 * 2 ** m.attempts) });
      }
    }
  },

  async scheduled(_c, env, ctx): Promise<void> {
    ctx.waitUntil(expireCredits(makeCtx(env)));
  },
} satisfies ExportedHandler<Env, JobMessage>;
