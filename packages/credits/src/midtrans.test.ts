import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { findPack } from './index';
import { mapStatus, parseGrossAmount, snapRequest, verifySignature, basicAuth } from './midtrans';

const KEY = 'SB-Mid-server-test';
const sign = (o: string, s: string, g: string) => createHash('sha512').update(o + s + g + KEY).digest('hex');

describe('Midtrans', () => {
  it('signature valid diterima, yang diubah ditolak', () => {
    const n = { order_id: 'o1', status_code: '200', gross_amount: '150000.00', signature_key: sign('o1', '200', '150000.00') };
    expect(verifySignature(n, KEY)).toBe(true);
    expect(verifySignature({ ...n, gross_amount: '1500000.00' }, KEY)).toBe(false);
    expect(verifySignature({ ...n, signature_key: 'x' }, KEY)).toBe(false);
    expect(verifySignature(n, 'kunci-lain')).toBe(false);
  });

  it('pemetaan status: kredit hanya untuk settlement/capture accept', () => {
    expect(mapStatus('settlement')).toBe('paid');
    expect(mapStatus('capture', 'accept')).toBe('paid');
    expect(mapStatus('capture', 'challenge')).toBe('review');
    expect(mapStatus('pending')).toBe('pending');
    expect(mapStatus('expire')).toBe('expired');
    expect(mapStatus('deny')).toBe('failed');
    expect(mapStatus('refund')).toBe('pending');
  });

  it('payload Snap memakai harga paket', () => {
    const r = snapRequest('o1', findPack('creator')!, 'a@b.id', 'https://app/saldo');
    expect(r.transaction_details).toEqual({ order_id: 'o1', gross_amount: 150_000 });
    expect(r.enabled_payments).toContain('other_qris');
    expect(basicAuth('k')).toBe(`Basic ${Buffer.from('k:').toString('base64')}`);
    expect(parseGrossAmount('150000.00')).toBe(150000);
    expect(() => parseGrossAmount('abc')).toThrow();
  });
});
