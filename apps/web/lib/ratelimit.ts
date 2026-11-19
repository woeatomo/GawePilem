import 'server-only';
import { supabaseAdmin } from './supabase/server';

/**
 * Rate limit fixed-window di Postgres (RPC rate_limit_hit). Mengembalikan detik tunggu (0 = boleh).
 * Bila database tidak bisa dihubungi, permintaan diloloskan (fail-open) supaya layanan tetap jalan;
 * route berbiaya tetap terlindungi oleh charge_and_enqueue dan saldo.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_sec: windowSec });
  if (error) {
    console.error('[ratelimit]', error.message);
    return 0;
  }
  return data ?? 0;
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
