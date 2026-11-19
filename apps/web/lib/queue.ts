import 'server-only';
import type { MediaJobData } from '@atomo/db';
import { env } from './env';

/**
 * Kirim job ke worker lewat HTTP (worker yang memegang BullMQ + Redis). Dengan begini web
 * bisa jalan di Cloudflare Workers tanpa koneksi TCP ke Redis. Idempotent: worker memakai
 * jobId sebagai id BullMQ, jadi kiriman ganda tidak menggandakan kerja.
 */
export async function enqueueMedia(data: MediaJobData): Promise<void> {
  const e = env();
  const res = await fetch(`${e.WORKER_URL.replace(/\/$/, '')}/enqueue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${e.WORKER_TOKEN}` },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Worker menolak job (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
