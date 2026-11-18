// Modul server-only (node:crypto): impor lewat '@atomo/credits/midtrans', jangan dari index (dipakai client).
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { TopupPack } from './packs';

/**
 * Integrasi Midtrans Snap (QRIS, virtual account, e-wallet). Hanya logika murni:
 * pembuatan payload, verifikasi signature notifikasi, dan pemetaan status.
 * Panggilan HTTP ada di route web.
 */
export const MIDTRANS_URL = {
  sandbox: { snap: 'https://app.sandbox.midtrans.com/snap/v1/transactions', api: 'https://api.sandbox.midtrans.com/v2' },
  production: { snap: 'https://app.midtrans.com/snap/v1/transactions', api: 'https://api.midtrans.com/v2' },
} as const;

export const ENABLED_PAYMENTS = ['other_qris', 'gopay', 'shopeepay', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'echannel', 'other_va'];

export function snapRequest(orderId: string, pack: TopupPack, email: string, finishUrl: string) {
  return {
    transaction_details: { order_id: orderId, gross_amount: pack.priceIdr },
    item_details: [{ id: pack.id, price: pack.priceIdr, quantity: 1, name: `Kredit ${pack.name} (${pack.credits})`.slice(0, 50) }],
    customer_details: { email },
    enabled_payments: ENABLED_PAYMENTS,
    expiry: { unit: 'hours', duration: 24 },
    callbacks: { finish: finishUrl },
  };
}

export function basicAuth(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

export const notificationSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().optional(),
  payment_type: z.string().optional(),
});
export type MidtransNotification = z.infer<typeof notificationSchema>;

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key). Dibandingkan constant-time. */
export function verifySignature(n: Pick<MidtransNotification, 'order_id' | 'status_code' | 'gross_amount' | 'signature_key'>, serverKey: string): boolean {
  const expected = createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + serverKey).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(n.signature_key.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaymentOutcome = 'paid' | 'pending' | 'expired' | 'failed' | 'review';

/** Pemetaan status Midtrans → status pesanan. Kredit hanya masuk untuk 'paid'. */
export function mapStatus(transactionStatus: string, fraudStatus?: string): PaymentOutcome {
  switch (transactionStatus) {
    case 'settlement':
      return 'paid';
    case 'capture':
      return fraudStatus === 'accept' || fraudStatus === undefined ? 'paid' : fraudStatus === 'challenge' ? 'review' : 'failed';
    case 'pending':
      return 'pending';
    case 'expire':
      return 'expired';
    case 'cancel':
    case 'deny':
    case 'failure':
      return 'failed';
    default:
      return 'pending';
  }
}

/** gross_amount Midtrans berupa string "150000.00" → rupiah bulat. */
export function parseGrossAmount(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error('gross_amount tidak valid');
  return Math.round(n);
}
