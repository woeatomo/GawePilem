import { z } from 'zod';
import { NextResponse } from 'next/server';
import { findPack } from '@atomo/credits';
import { basicAuth, MIDTRANS_URL, snapRequest } from '@atomo/credits/midtrans';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { platformSecret } from '@/lib/platform';
import { jsonError } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Buat pesanan top-up dan transaksi Midtrans Snap. Kredit baru masuk lewat webhook yang terverifikasi. */
export async function POST(req: Request) {
  const e = env();
  const serverKey = await platformSecret('MIDTRANS_SERVER_KEY');
  if (!serverKey) return jsonError(503, 'not_configured', 'Pembayaran online belum dikonfigurasi.');
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`order:${s.userId}`, 5, 300)) return jsonError(429, 'rate_limited', 'Terlalu banyak pesanan. Coba lagi beberapa menit lagi.');
  const p = z.object({ packId: z.string() }).safeParse(await req.json().catch(() => null));
  const pack = p.success ? findPack(p.data.packId) : undefined;
  if (!pack) return jsonError(400, 'bad_pack', 'Paket tidak dikenal');

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('topup_orders')
    .insert({ user_id: s.userId, pack_id: pack.id, amount_idr: pack.priceIdr, credits: pack.credits, gateway: 'midtrans' })
    .select('id')
    .single();
  if (error || !order) return jsonError(500, 'db', 'Gagal membuat pesanan');

  const urls = e.MIDTRANS_PRODUCTION ? MIDTRANS_URL.production : MIDTRANS_URL.sandbox;
  const res = await fetch(urls.snap, {
    method: 'POST',
    headers: { authorization: basicAuth(serverKey), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(snapRequest(order.id, pack, s.email, `${e.APP_URL}/saldo?order=${order.id}`)),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const snap = res?.ok ? z.object({ token: z.string(), redirect_url: z.string().url() }).safeParse(await res.json()) : null;
  if (!snap?.success) {
    await admin.rpc('topup_order_closed', { p_order_id: order.id, p_status: 'failed' });
    return jsonError(502, 'gateway', 'Payment gateway sedang bermasalah. Coba lagi sebentar.');
  }
  await admin.from('topup_orders').update({ gateway_ref: snap.data.token }).eq('id', order.id);
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'billing.order_created', targetType: 'topup_order', targetId: order.id, details: { pack: pack.id, amount: pack.priceIdr }, ip: clientIp(req.headers) });
  return NextResponse.json({ orderId: order.id, redirectUrl: snap.data.redirect_url });
}
