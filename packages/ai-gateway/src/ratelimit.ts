/**
 * Token bucket per provider (in-process). Worker yang berjalan di banyak instance
 * sebaiknya juga memakai limiter BullMQ per antrean; ini lapisan pengaman lokal.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    readonly capacity: number,
    readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
    this.last = t;
  }

  /** Ambil satu token; kembalikan ms tunggu bila kosong (0 = boleh jalan). */
  take(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  constructor(
    private readonly limits: Record<string, { capacity: number; perSec: number }>,
    private readonly fallback = { capacity: 10, perSec: 2 },
  ) {}

  async acquire(provider: string, signal?: AbortSignal): Promise<void> {
    let b = this.buckets.get(provider);
    if (!b) {
      const l = this.limits[provider] ?? this.fallback;
      b = new TokenBucket(l.capacity, l.perSec);
      this.buckets.set(provider, b);
    }
    for (;;) {
      const wait = b.take();
      if (wait === 0) return;
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
