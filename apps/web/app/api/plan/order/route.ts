import { z } from 'zod';
import { NextResponse } from 'next/server';
import { basicAuth, MIDTRANS_URL, snapRequest } from '@atomo/credits/midtrans';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { platformSecret } from '@/lib/platform';
import { activePlan, findOffer, planPurchaseBlock } from '@/lib/plan';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Pesan paket/langganan prabayar lewat Midtrans Snap. Paket aktif & kredit masuk lewat webhook terverifikasi. */
export async function POST(req: Request) {
  const e = env();
  const serverKey = await platformSecret('MIDTRANS_SERVER_KEY');
  if (!serverKey) return jsonError(503, 'not_configured', 'Pembayaran online belum dikonfigurasi.');
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`order:${s.userId}`, 5, 300)) return jsonError(429, 'rate_limited', 'Terlalu banyak pesanan. Coba lagi beberapa menit lagi.');
  const p = z.object({ offerId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  const offer = p.success ? findOffer(p.data.offerId) : undefined;
  if (!offer) return jsonError(400, 'bad_offer', 'Paket tidak dikenal');
  const block = planPurchaseBlock(await activePlan(s.db, s.userId, s.profile.plan), offer);
  if (block) return jsonError(409, 'plan_active', block);

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('topup_orders')
    .insert({ user_id: s.userId, pack_id: offer.id, amount_idr: offer.priceIdr, credits: offer.credits, gateway: 'midtrans', kind: 'plan', plan_tier: offer.tier, months: offer.months })
    .select('id')
    .single();
  if (error || !order) return jsonError(500, 'db', 'Gagal membuat pesanan');

  const urls = e.MIDTRANS_PRODUCTION ? MIDTRANS_URL.production : MIDTRANS_URL.sandbox;
  const res = await fetch(urls.snap, {
    method: 'POST',
    headers: { authorization: basicAuth(serverKey), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(snapRequest(order.id, { id: offer.id, name: `${offer.name} ${offer.months} bln`, priceIdr: offer.priceIdr, credits: offer.credits }, s.email, `${e.APP_URL}/paket?order=${order.id}`)),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const snap = res?.ok ? z.object({ token: z.string(), redirect_url: z.string().url() }).safeParse(await res.json()) : null;
  if (!snap?.success) {
    await admin.rpc('topup_order_closed', { p_order_id: order.id, p_status: 'failed' });
    return jsonError(502, 'gateway', 'Payment gateway sedang bermasalah. Coba lagi sebentar.');
  }
  await admin.from('topup_orders').update({ gateway_ref: snap.data.token }).eq('id', order.id);
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'billing.plan_order_created', targetType: 'topup_order', targetId: order.id, details: { offer: offer.id, amount: offer.priceIdr }, ip: clientIp(req.headers) });
  return NextResponse.json({ orderId: order.id, redirectUrl: snap.data.redirect_url });
}
