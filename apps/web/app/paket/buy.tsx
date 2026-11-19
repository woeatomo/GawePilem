'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, fmt, rupiah, useToast } from '@/components/ui';

export interface OfferView { id: string; name: string; months: number; priceIdr: number; credits: number }

export function BuyPlan({ offer, label, disabled, sandbox, online, primary }: { offer: OfferView; label: string; disabled?: boolean; sandbox: boolean; online: boolean; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function call(path: string) {
    setBusy(true);
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offerId: offer.id }) });
    const j = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: { message: string } };
    if (res.ok && j.redirectUrl) {
      window.location.href = j.redirectUrl;
      return;
    }
    setBusy(false);
    if (!res.ok) return toast(j.error?.message ?? 'Gagal memproses paket', 'err');
    toast(`Paket ${offer.name} aktif · +${fmt(offer.credits)} kredit`);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <button className={`btn ${primary ? 'primary' : ''}`} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} label={`Paket ${offer.name}`}>
        <h2>Paket {offer.name} · {offer.months} bulan</h2>
        <p className="muted">{rupiah(offer.priceIdr)} · {fmt(offer.credits)} kredit langsung masuk (berlaku 12 bulan)</p>
        {online ? (
          <p className="note">Kamu akan diarahkan ke halaman pembayaran (QRIS, virtual account, GoPay, ShopeePay). Paket aktif otomatis setelah pembayaran terverifikasi. Tidak ada potong otomatis: kami ingatkan sebelum periode habis.</p>
        ) : sandbox ? (
          <p className="note">Mode sandbox aktif: pembayaran disimulasikan untuk pengujian.</p>
        ) : (
          <p className="note warn">Pembayaran online belum dikonfigurasi. Hubungi admin.</p>
        )}
        <div className="acts">
          <button className="btn ghost" onClick={() => setOpen(false)}>Batal</button>
          {sandbox && <button className={`btn ${online ? '' : 'primary'}`} disabled={busy} onClick={() => call('/api/plan/sandbox')}>Simulasi bayar</button>}
          {online && <button className="btn primary" disabled={busy} onClick={() => call('/api/plan/order')}>{busy ? 'Memproses…' : 'Bayar sekarang'}</button>}
        </div>
      </Modal>
    </>
  );
}

export function PeriodToggle({ value }: { value: 1 | 3 }) {
  const router = useRouter();
  return (
    <div className="seg" role="group" aria-label="Periode">
      <button aria-pressed={value === 1} onClick={() => router.replace('/paket?periode=1', { scroll: false })}>Bulanan</button>
      <button aria-pressed={value === 3} onClick={() => router.replace('/paket?periode=3', { scroll: false })}>3 bulan · hemat 10%</button>
    </div>
  );
}
