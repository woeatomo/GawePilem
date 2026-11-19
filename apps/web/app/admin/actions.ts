'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { encryptPlatformSecret, isPlatformSecretName } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { platformSecrets } from '@/lib/platform';
import { rateLimit } from '@/lib/ratelimit';

export type SecretActionResult = { ok: true } | { ok: false; code: 'step_up' | 'forbidden' | 'invalid' | 'rate_limited' | 'error'; message: string };

const value = z.string().trim().min(8, 'Nilai terlalu pendek').max(4000, 'Nilai terlalu panjang').refine((v) => !/\s/.test(v), 'Nilai tidak boleh berisi spasi atau baris baru');

function mapError(e: { code?: string; message: string }): SecretActionResult {
  if (e.code === 'P0010') return { ok: false, code: 'step_up', message: 'Verifikasi ulang kode 2FA dulu.' };
  if (e.code === '42501') return { ok: false, code: 'forbidden', message: 'Hanya superadmin dengan sesi 2FA.' };
  return { ok: false, code: 'error', message: 'Gagal menyimpan. Coba lagi.' };
}

/**
 * Simpan secret platform. Enkripsi terjadi di server ini; database menerima ciphertext lewat RPC
 * yang dipanggil DENGAN SESI USER, sehingga database sendiri memeriksa superadmin + 2FA (aal2)
 * + verifikasi 2FA ≤ 15 menit. Nilai asli tidak pernah dikirim balik ke browser.
 */
export async function setPlatformSecret(name: string, raw: string): Promise<SecretActionResult> {
  const s = await getSession();
  if (!s?.profile.is_superadmin) return { ok: false, code: 'forbidden', message: 'Akses ditolak.' };
  if (await rateLimit(`secret:${s.userId}`, 20, 600)) return { ok: false, code: 'rate_limited', message: 'Terlalu sering. Coba lagi nanti.' };
  if (!isPlatformSecretName(name)) return { ok: false, code: 'invalid', message: 'Nama secret tidak dikenal.' };
  const v = value.safeParse(raw);
  if (!v.success) return { ok: false, code: 'invalid', message: v.error.issues[0]!.message };
  const { encrypted, hint } = encryptPlatformSecret(name, v.data, env().ENCRYPTION_KEY);
  const { error } = await s.db.rpc('set_platform_secret', { p_name: name, p_encrypted: encrypted, p_hint: hint });
  if (error) return mapError(error);
  platformSecrets().invalidate();
  revalidatePath('/admin/secrets');
  return { ok: true };
}

export async function deletePlatformSecret(name: string): Promise<SecretActionResult> {
  const s = await getSession();
  if (!s?.profile.is_superadmin) return { ok: false, code: 'forbidden', message: 'Akses ditolak.' };
  if (await rateLimit(`secret:${s.userId}`, 20, 600)) return { ok: false, code: 'rate_limited', message: 'Terlalu sering. Coba lagi nanti.' };
  if (!isPlatformSecretName(name)) return { ok: false, code: 'invalid', message: 'Nama secret tidak dikenal.' };
  const { error } = await s.db.rpc('delete_platform_secret', { p_name: name });
  if (error) return mapError(error);
  platformSecrets().invalidate();
  revalidatePath('/admin/secrets');
  return { ok: true };
}
