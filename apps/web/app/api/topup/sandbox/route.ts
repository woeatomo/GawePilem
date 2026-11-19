import { z } from 'zod';
import { NextResponse } from 'next/server';
import { findPack } from '@atomo/credits';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Top-up SANDBOX untuk dev & demo (PAYMENTS_SANDBOX=1). Di produksi top-up hanya masuk
 * lewat webhook payment gateway yang terverifikasi (Fase 2).
 */
export async function POST(req: Request) {
  if (!env().PAYMENTS_SANDBOX) return jsonError(404, 'not_found', 'Tidak tersedia.');
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  const p = z.object({ packId: z.string(), nonce: z.string().min(8).max(64) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', 'Body tidak valid');
  const pack = findPack(p.data.packId);
  if (!pack) return jsonError(400, 'bad_pack', 'Paket tidak dikenal');
  const admin = supabaseAdmin();
  const ref = `sandbox:${s.userId}:${p.data.nonce}`;
  const { error } = await admin.rpc('credit_topup', { p_user_id: s.userId, p_amount: pack.credits, p_reference: ref, p_description: `Top-up paket ${pack.name} (sandbox)` });
  if (error) return jsonError(500, 'db', error.message);
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'billing.topup_sandbox', details: { pack: pack.id, credits: pack.credits } });
  return NextResponse.json({ ok: true, credits: pack.credits });
}
