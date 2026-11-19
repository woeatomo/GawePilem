export type ProviderErrorCode =
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'bad_request'
  | 'content_filtered'
  | 'invalid_output'
  | 'network'
  | 'unknown';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly code: ProviderErrorCode,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Error sementara yang layak dicoba ulang / dialihkan ke model cadangan. */
  get retryable(): boolean {
    return ['rate_limited', 'overloaded', 'timeout', 'network'].includes(this.code);
  }

  /** Pesan aman untuk ditampilkan ke user (Bahasa Indonesia, tanpa detail internal). */
  get userMessage(): string {
    switch (this.code) {
      case 'auth':
        return 'API key ditolak provider. Periksa key di Pengaturan Provider AI.';
      case 'rate_limited':
        return 'Provider AI sedang membatasi permintaan. Coba lagi sebentar lagi.';
      case 'overloaded':
        return 'Provider AI sedang sibuk.';
      case 'timeout':
        return 'Provider AI tidak merespons tepat waktu.';
      case 'content_filtered':
        return 'Permintaan ditolak oleh filter konten provider.';
      case 'invalid_output':
        return 'Hasil AI tidak sesuai format yang diminta.';
      case 'bad_request':
        return 'Permintaan ke provider AI tidak valid.';
      default:
        return 'Terjadi gangguan pada provider AI.';
    }
  }
}

export function errorFromStatus(provider: string, status: number, body: string, retryAfter?: string | null): ProviderError {
  const retryAfterMs = parseRetryAfter(retryAfter);
  const snippet = body.slice(0, 300);
  if (status === 401 || status === 403) return new ProviderError(`Auth gagal (${status}): ${snippet}`, provider, 'auth', status);
  if (status === 429) return new ProviderError(`Rate limited: ${snippet}`, provider, 'rate_limited', status, retryAfterMs);
  if (status === 408 || status === 504) return new ProviderError(`Timeout (${status})`, provider, 'timeout', status);
  if (status === 529 || status === 503 || status === 502 || status === 500)
    return new ProviderError(`Provider error ${status}: ${snippet}`, provider, 'overloaded', status, retryAfterMs);
  if (status === 400 && /content.?(policy|filter)|safety/i.test(body))
    return new ProviderError(`Konten difilter: ${snippet}`, provider, 'content_filtered', status);
  if (status >= 400 && status < 500) return new ProviderError(`Bad request (${status}): ${snippet}`, provider, 'bad_request', status);
  return new ProviderError(`HTTP ${status}: ${snippet}`, provider, 'unknown', status);
}

export function parseRetryAfter(v?: string | null): number | undefined {
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : undefined;
}

export function toProviderError(provider: string, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
    return new ProviderError(err.message, provider, 'timeout');
  if (err instanceof TypeError) return new ProviderError(err.message, provider, 'network');
  return new ProviderError(err instanceof Error ? err.message : String(err), provider, 'unknown');
}
