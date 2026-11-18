'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, fmt, rupiah, useToast } from '@/components/ui';

interface Pack { id: string; name: string; priceIdr: number; credits: number; bonusLabel: string }

export function TopupButtons({ packs, sandbox }: { packs: Pack[]; sandbox: boolean }) {
  const [pick, setPick] = useState<Pack | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function pay() {
    if (!pick) return;
    setBusy(true);
    const res = await fetch('/api/topup/sandbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId: pick.id, nonce: crypto.randomUUID() }) });
    setBusy(false);
    if (res.ok) {
      toast(`+${fmt(pick.credits)} kredit masuk`);
      setPick(null);
      router.refresh();
    } else toast('Top-up gagal', 'err');
  }
  return (
    <>
      <div className="packs">
        {packs.map((p) => (
          <button key={p.id} className="pack" onClick={() => setPick(p)}>
            <b>{p.name}</b>
            <span className="k">{fmt(p.credits)}</span>
            <small>{rupiah(p.priceIdr)} · bonus {p.bonusLabel}</small>
          </button>
        ))}
      </div>
      <Modal open={!!pick} onClose={() => setPick(null)} label="Top-up">
        {pick && (
          <>
            <h2>Top-up paket {pick.name}</h2>
            <p className="muted">{fmt(pick.credits)} kredit · {rupiah(pick.priceIdr)}</p>
            {sandbox ? (
              <p className="note">Mode sandbox aktif: pembayaran disimulasikan untuk pengujian. Di produksi kamu akan diarahkan ke QRIS/VA/e-wallet.</p>
            ) : (
              <p className="note warn">Pembayaran online sedang disiapkan (Fase 2: integrasi payment gateway + webhook). Hubungi admin untuk top-up manual.</p>
            )}
            <div className="acts">
              <button className="btn ghost" onClick={() => setPick(null)}>Batal</button>
              <button className="btn primary" disabled={!sandbox || busy} onClick={pay}>{busy ? 'Memproses…' : 'Bayar (sandbox)'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
