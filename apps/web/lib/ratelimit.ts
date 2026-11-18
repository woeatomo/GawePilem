import 'server-only';
import { redis } from './redis';

const memory = new Map<string, { count: number; reset: number }>();

/**
 * Fixed-window rate limit. Redis bila tersedia (multi-instance), memori sebagai cadangan.
 * Mengembalikan detik tunggu (0 = boleh).
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<number> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  try {
    const r = redis();
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, windowSec + 1);
    return n > limit ? windowSec - (Math.floor(Date.now() / 1000) % windowSec) : 0;
  } catch {
    const now = Date.now();
    const cur = memory.get(k);
    if (!cur || cur.reset < now) {
      memory.set(k, { count: 1, reset: now + windowSec * 1000 });
      return 0;
    }
    cur.count++;
    return cur.count > limit ? Math.ceil((cur.reset - now) / 1000) : 0;
  }
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
}
