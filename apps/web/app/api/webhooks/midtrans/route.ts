import { NextResponse } from 'next/server';
import { basicAuth, mapStatus, MIDTRANS_URL, notificationSchema, parseGrossAmount, verifySignature } from '@atomo/credits/midtrans';
import { audit } from '@atomo/db';
import { env } from '@/lib/env';
import { platformSecret } from '@/lib/platform';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notifikasi pembayaran Midtrans. Lapisan pengaman:
 * 1. signature SHA512 dengan server key, 2. status dicek ulang ke API Midtrans,
 * 3. nominal harus sama dengan pesanan, 4. RPC idempotent (webhook boleh dikirim berulang).
 */
export async function POST(req: Request) {
  const e = env();
  const serverKey = await platformSecret('MIDTRANS_SERVER_KEY');
  if (!serverKey) return new NextResponse('not configured', { status: 503 });
  const parsed = notificationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse('bad request', { status: 400 });
  const n = parsed.data;
  if (!verifySignature(n, serverKey)) return new NextResponse('invalid signature', { status: 401 });
  if (!UUID.test(n.order_id)) return NextResponse.json({ ok: true, ignored: 'unknown order format' });

  // Jangan percaya isi notifikasi saja: ambil status terkini langsung dari Midtrans.
  const urls = e.MIDTRANS_PRODUCTION ? MIDTRANS_URL.production : MIDTRANS_URL.sandbox;
  const st = await fetch(`${urls.api}/${encodeURIComponent(n.order_id)}/status`, {
    headers: { authorization: basicAuth(serverKey), accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!st?.ok) return new NextResponse('status check failed', { status: 502 }); // Midtrans akan mengirim ulang
  const live = notificationSchema.partial().safeParse(await st.json());
  const status = live.success && live.data.transaction_status ? live.data.transaction_status : n.transaction_status;
  const fraud = live.success ? (live.data.fraud_status ?? n.fraud_status) : n.fraud_status;
  const outcome = mapStatus(status, fraud);

  const admin = supabaseAdmin();
  const { data: order } = await admin.from('topup_orders').select('id, user_id').eq('id', n.order_id).maybeSingle();
  if (!order) return NextResponse.json({ ok: true, ignored: 'order not found' });

  if (outcome === 'paid') {
    const { data, error } = await admin.rpc('topup_order_paid', { p_order_id: order.id, p_amount_idr: parseGrossAmount(n.gross_amount), ...(n.payment_type ? { p_payment_method: n.payment_type } : {}) });
    if (error) {
      console.error('[midtrans] gagal mencatat pembayaran', order.id, error.message);
      return new NextResponse('error', { status: error.code === 'P0009' ? 400 : 500 });
    }
    if (data === 'paid') await audit(admin, { actorId: order.user_id, workspaceId: null, action: 'billing.topup_paid', targetType: 'topup_order', targetId: order.id, details: { gross: n.gross_amount, method: n.payment_type ?? null } });
  } else if (outcome === 'expired' || outcome === 'failed') {
    await admin.rpc('topup_order_closed', { p_order_id: order.id, p_status: outcome });
  }
  return NextResponse.json({ ok: true, outcome });
}
