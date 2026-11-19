'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { encryptPlatformSecret, isPlatformSecretName } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { platformSecrets } from '@/lib/platform';
import { rateLimit } from '@/lib/ratelimit';
import { findOffer } from '@atomo/credits';

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

// ---------------------------------------------------------------------------
// Kredit manual (transfer di luar payment gateway). Pemeriksaan hak akses dilakukan
// database lewat RPC yang dipanggil dengan sesi user (superadmin + aal2 + 2FA ≤ 15 menit).
// ---------------------------------------------------------------------------

export interface CustomerInfo { userId: string; email: string; plan: string; balance: number; periodEnd: string | null }
export type FindResult = { ok: true; customer: CustomerInfo | null } | { ok: false; code: 'forbidden' | 'invalid' | 'error'; message: string };

export async function findCustomer(email: string): Promise<FindResult> {
  const s = await getSession();
  if (!s?.profile.is_superadmin) return { ok: false, code: 'forbidden', message: 'Akses ditolak.' };
  const e = z.string().trim().email('Email tidak valid').max(200).safeParse(email);
  if (!e.success) return { ok: false, code: 'invalid', message: e.error.issues[0]!.message };
  const { data, error } = await s.db.rpc('admin_find_user', { p_email: e.data });
  if (error) return error.code === '42501' ? { ok: false, code: 'forbidden', message: 'Hanya superadmin dengan sesi 2FA.' } : { ok: false, code: 'error', message: 'Gagal mencari akun.' };
  const r = data?.[0];
  return { ok: true, customer: r ? { userId: r.user_id, email: r.email, plan: r.plan, balance: r.balance, periodEnd: r.period_end } : null };
}

const manualSchema = z
  .object({
    email: z.string().trim().email().max(200),
    mode: z.enum(['topup', 'plan', 'bonus']),
    credits: z.number().int().min(1, 'Kredit minimal 1').max(1_000_000, 'Kredit maksimal 1.000.000'),
    amountIdr: z.number().int().min(0).max(100_000_000, 'Nominal maksimal Rp100.000.000'),
    note: z.string().trim().min(3, 'Isi catatan, mis. bukti transfer').max(300),
    ref: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    offerId: z.string().max(40).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'bonus' && v.amountIdr !== 0) ctx.addIssue({ code: 'custom', message: 'Bonus tidak memakai nominal pembayaran' });
    if (v.mode !== 'bonus' && v.amountIdr < 1000) ctx.addIssue({ code: 'custom', message: 'Isi nominal pembayaran yang diterima (min Rp1.000)' });
    if (v.mode === 'plan' && !findOffer(v.offerId ?? '')) ctx.addIssue({ code: 'custom', message: 'Pilih paket' });
  });

export type ManualResult =
  | { ok: true; status: 'paid' | 'already_paid'; balance: number; plan: string }
  | { ok: false; code: 'step_up' | 'forbidden' | 'invalid' | 'not_found' | 'rate_limited' | 'error'; message: string };

export async function addManualCredit(input: z.input<typeof manualSchema>): Promise<ManualResult> {
  const s = await getSession();
  if (!s?.profile.is_superadmin) return { ok: false, code: 'forbidden', message: 'Akses ditolak.' };
  if (await rateLimit(`manualcredit:${s.userId}`, 30, 600)) return { ok: false, code: 'rate_limited', message: 'Terlalu sering. Coba lagi nanti.' };
  const v = manualSchema.safeParse(input);
  if (!v.success) return { ok: false, code: 'invalid', message: v.error.issues[0]!.message };
  const d = v.data;
  const offer = d.mode === 'plan' ? findOffer(d.offerId!) : undefined;
  const { data, error } = await s.db.rpc('admin_manual_credit', {
    p_email: d.email, p_credits: d.credits, p_amount_idr: d.amountIdr, p_note: d.note, p_ref: d.ref,
    ...(offer ? { p_offer_id: offer.id, p_plan_tier: offer.tier, p_months: offer.months } : {}),
  });
  if (error) {
    if (error.code === 'P0010') return { ok: false, code: 'step_up', message: 'Verifikasi ulang kode 2FA dulu.' };
    if (error.code === '42501') return { ok: false, code: 'forbidden', message: 'Hanya superadmin dengan sesi 2FA.' };
    if (error.code === 'P0005') return { ok: false, code: 'not_found', message: 'Akun tidak ditemukan. Customer harus daftar dulu.' };
    if (error.code === '22023') return { ok: false, code: 'invalid', message: error.message };
    return { ok: false, code: 'error', message: 'Gagal menambah kredit. Coba lagi.' };
  }
  const r = z.object({ status: z.enum(['paid', 'already_paid']), balance: z.number().nullable(), plan: z.string() }).parse(data);
  revalidatePath('/admin/kredit');
  return { ok: true, status: r.status, balance: r.balance ?? 0, plan: r.plan };
}
