import { ProviderError } from './errors';

export interface RetryOptions {
  retries: number;
  baseMs: number;
  maxMs: number;
  signal?: AbortSignal;
  /** Untuk tes: ganti sleep. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (err: ProviderError, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY: RetryOptions = { retries: 3, baseMs: 500, maxMs: 8_000 };

const realSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('aborted'));
    });
  });

/** Exponential backoff + full jitter. Hanya error retryable yang diulang; Retry-After dihormati. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: Partial<RetryOptions> = {}): Promise<T> {
  const o = { ...DEFAULT_RETRY, ...opts };
  const sleep = o.sleep ?? ((ms: number) => realSleep(ms, o.signal));
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!(err instanceof ProviderError) || !err.retryable || attempt >= o.retries || o.signal?.aborted) throw err;
      const expo = Math.min(o.maxMs, o.baseMs * 2 ** attempt);
      const delay = Math.max(err.retryAfterMs ?? 0, Math.floor(Math.random() * expo));
      o.onRetry?.(err, attempt + 1, delay);
      await sleep(Math.min(delay, o.maxMs * 4));
      attempt++;
    }
  }
}
