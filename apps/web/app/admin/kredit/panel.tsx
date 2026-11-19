'use client';

import { useEffect, useState, useTransition } from 'react';
import { addManualCredit, findCustomer, type CustomerInfo } from '@/app/admin/actions';
import { MfaChallenge } from '@/components/mfa';
import { Modal, fmt, rupiah, useToast } from '@/components/ui';

interface Offer { id: string; label: string; priceIdr: number; credits: number }
interface Hist { at: string; actor: string; user: string; credits: number; amountIdr: number; note: string; plan: string | null }
type Mode = 'topup' | 'plan' | 'bonus';

const newRef = () => `m${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 40);
const MODE_LABEL: Record<Mode, string> = { topup: 'Top-up kredit', plan: 'Aktifkan paket', bonus: 'Bonus / kompensasi' };

export function ManualCreditPanel({ stepUpUntil, offers, history }: { stepUpUntil: number; offers: Offer[]; history: Hist[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [needStepUp, setNeedStepUp] = useState(false);
  const [email, setEmail] = useState('');
  const [customer, setCustomer] = useState<CustomerInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('topup');
  const [amount, setAmount] = useState(150_000);
  const [credits, setCredits] = useState(1_500);
  const [offerId, setOfferId] = useState(offers[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState(newRef);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (needStepUp || stepUpUntil <= now) {
    return <MfaChallenge title="Verifikasi ulang 2FA" desc="Untuk menambah kredit, masukkan kode 2FA terbaru. Verifikasi berlaku 15 menit." onVerified={() => setNeedStepUp(false)} />;
  }

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'bonus') setAmount(0);
    else if (m === 'plan') {
      const o = offers.find((x) => x.id === offerId) ?? offers[0];
      if (o) { setAmount(o.priceIdr); setCredits(o.credits); }
    } else { setAmount(150_000); setCredits(1_500); }
  };
  const pickOffer = (id: string) => {
    setOfferId(id);
    const o = offers.find((x) => x.id === id);
    if (o) { setAmount(o.priceIdr); setCredits(o.credits); }
  };
  const search = () =>
    start(async () => {
      const r = await findCustomer(email);
      if (!r.ok) return toast(r.message, 'err');
      setCustomer(r.customer);
    });
  const submit = () =>
    start(async () => {
      const r = await addManualCredit({ email: customer!.email, mode, credits, amountIdr: mode === 'bonus' ? 0 : amount, note, ref, ...(mode === 'plan' ? { offerId } : {}) });
      setConfirm(false);
      if (!r.ok) {
        if (r.code === 'step_up') setNeedStepUp(true);
        return toast(r.message, 'err');
      }
      toast(r.status === 'already_paid' ? 'Sudah pernah diproses (tidak digandakan).' : `Berhasil. Saldo ${customer!.email} sekarang ${fmt(r.balance)} kredit.`);
      setCustomer({ ...customer!, balance: r.balance, plan: r.plan });
      setNote('');
      setRef(newRef());
    });

  const offer = offers.find((o) => o.id === offerId);
  const valid = Boolean(customer) && note.trim().length >= 3 && credits >= 1 && (mode === 'bonus' || amount >= 1000);
  const minutes = Math.max(0, Math.ceil((stepUpUntil - now) / 60_000));

  return (
    <>
      <p className="note">Verifikasi 2FA aktif, sisa sekitar <b>{minutes} menit</b>. Pastikan dana sudah benar-benar masuk ke rekening sebelum menambah kredit.</p>
      <section className="card">
        <h2>1. Cari customer</h2>
        <div className="row" style={{ gap: 8 }}>
          <input type="email" aria-label="Email customer" placeholder="email@customer.id" value={email} onChange={(e) => { setEmail(e.target.value); setCustomer(undefined); }} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ flex: 1 }} />
          <button className="btn" disabled={pending || !email.includes('@')} onClick={search}>Cari</button>
        </div>
        {customer === null && <p className="note warn" style={{ marginTop: 10 }}>Akun tidak ditemukan. Minta customer daftar dulu di halaman login dengan email ini.</p>}
        {customer && (
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><small>Akun</small><b style={{ fontSize: 14, fontFamily: 'inherit', overflowWrap: 'anywhere' }}>{customer.email}</b><span>terdaftar</span></div>
            <div className="stat"><small>Saldo</small><b>{fmt(customer.balance)}</b><span>≈ {rupiah(customer.balance * 100)}</span></div>
            <div className="stat"><small>Paket</small><b style={{ textTransform: 'capitalize' }}>{customer.plan}</b><span>{customer.periodEnd ? `sampai ${new Date(customer.periodEnd).toLocaleDateString('id-ID', { dateStyle: 'medium' })}` : 'tanpa periode aktif'}</span></div>
          </div>
        )}
      </section>

      {customer && (
        <section className="card">
          <h2>2. Tambah kredit</h2>
          <div className="seg" role="group" aria-label="Jenis penambahan" style={{ marginBottom: 12 }}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => pickMode(m)}>{MODE_LABEL[m]}</button>)}
          </div>
          <div className="grid3">
            {mode === 'plan' && (
              <div>
                <label className="lbl" htmlFor="offer">Paket</label>
                <select id="offer" value={offerId} onChange={(e) => pickOffer(e.target.value)}>
                  {offers.map((o) => <option key={o.id} value={o.id}>{o.label} · {rupiah(o.priceIdr)}</option>)}
                </select>
              </div>
            )}
            {mode !== 'bonus' && (
              <div>
                <label className="lbl" htmlFor="amt">Nominal diterima (Rp)</label>
                <input id="amt" type="number" min={1000} step={1000} value={amount} onChange={(e) => { const v = Number(e.target.value); setAmount(v); if (mode === 'topup') setCredits(Math.floor(v / 100)); }} />
                {mode === 'plan' && offer && amount !== offer.priceIdr && <p className="small faint">Harga katalog {rupiah(offer.priceIdr)} (diskon/negosiasi boleh).</p>}
              </div>
            )}
            <div>
              <label className="lbl" htmlFor="cr">Kredit</label>
              <input id="cr" type="number" min={1} max={1_000_000} value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
              <p className="small faint">≈ {rupiah(credits * 100)} nilai kredit{mode === 'topup' ? ' · 1 kredit = Rp100' : ''}</p>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="lbl" htmlFor="note">Catatan & bukti {mode === 'bonus' ? '(alasan bonus)' : '(bank, tanggal, no. referensi transfer)'}</label>
            <input id="note" type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'bonus' ? 'Kompensasi render gagal 20/11' : 'Transfer BCA 20/11 a.n. Budi, ref 1234567'} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn primary" disabled={!valid || pending} onClick={() => setConfirm(true)}>Tinjau & tambahkan</button>
          </div>
        </section>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} label="Konfirmasi kredit manual">
        {customer && (
          <>
            <h2>{MODE_LABEL[mode]}</h2>
            <p className="muted">
              <b style={{ color: 'var(--text)' }}>{fmt(credits)} kredit</b> untuk <b style={{ color: 'var(--text)' }}>{customer.email}</b>
              {mode === 'plan' && offer ? ` + paket ${offer.label}` : ''}
              {mode !== 'bonus' ? `, pembayaran ${rupiah(amount)}` : ' tanpa pembayaran'}.
            </p>
            <p className="small">Catatan: {note}</p>
            <p className="note warn small">Kredit tidak bisa ditarik kembali dari halaman ini. Pastikan dana sudah masuk.</p>
            <div className="acts">
              <button className="btn ghost" onClick={() => setConfirm(false)}>Batal</button>
              <button className="btn primary" disabled={pending} onClick={submit}>{pending ? 'Memproses…' : 'Ya, tambahkan'}</button>
            </div>
          </>
        )}
      </Modal>

      <section className="card">
        <h2>Riwayat kredit manual</h2>
        {history.length === 0 ? (
          <p className="muted small">Belum ada.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="qtable">
              <thead><tr><th>Waktu</th><th>Customer</th><th className="num-r">Kredit</th><th className="num-r">Bayar</th><th>Catatan</th><th>Oleh</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="small muted">{new Date(h.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{h.user}{h.plan ? <span className="pill" style={{ marginLeft: 6 }}>paket {h.plan}</span> : null}</td>
                    <td className="num-r mono">{fmt(h.credits)}</td>
                    <td className="num-r mono">{h.amountIdr ? rupiah(h.amountIdr) : 'bonus'}</td>
                    <td className="small">{h.note}</td>
                    <td className="small muted">{h.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
