import { z } from 'zod';
import { NextResponse } from 'next/server';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { activePlan, findOffer, planPurchaseBlock } from '@/lib/plan';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Pembelian paket SANDBOX (PAYMENTS_SANDBOX=1): melewati jalur pesanan & RPC yang sama dengan webhook. */
export async function POST(req: Request) {
  if (!env().PAYMENTS_SANDBOX) return jsonError(404, 'not_found', 'Tidak tersedia.');
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  const p = z.object({ offerId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  const offer = p.success ? findOffer(p.data.offerId) : undefined;
  if (!offer) return jsonError(400, 'bad_offer', 'Paket tidak dikenal');
  const block = planPurchaseBlock(await activePlan(s.db, s.userId, s.profile.plan), offer);
  if (block) return jsonError(409, 'plan_active', block);
  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('topup_orders')
    .insert({ user_id: s.userId, pack_id: offer.id, amount_idr: offer.priceIdr, credits: offer.credits, gateway: 'sandbox', kind: 'plan', plan_tier: offer.tier, months: offer.months })
    .select('id')
    .single();
  if (error || !order) return jsonError(500, 'db', 'Gagal membuat pesanan');
  const { error: payErr } = await admin.rpc('topup_order_paid', { p_order_id: order.id, p_amount_idr: offer.priceIdr, p_payment_method: 'sandbox' });
  if (payErr) return jsonError(500, 'db', payErr.message);
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'billing.plan_sandbox', targetType: 'topup_order', targetId: order.id, details: { offer: offer.id } });
  return NextResponse.json({ ok: true, tier: offer.tier, credits: offer.credits });
}
