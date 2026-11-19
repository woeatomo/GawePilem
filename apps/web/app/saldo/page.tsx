import type { Metadata } from 'next';
import { CATEGORIES, CATEGORY_META, TIER_LABEL, TIERS, TOPUP_PACKS, VIDEO_RESOLUTION, creditsToRupiah, type Category } from '@atomo/credits';
import { fmt, rupiah } from '@/lib/format';
import { AccountPage, loadAccount } from '@/lib/account';
import { env } from '@/lib/env';
import { platformSecret } from '@/lib/platform';
import { TopupButtons } from './topup';

export const metadata: Metadata = { title: 'Saldo & tarif' };

const COLOR: Record<Category, string> = { naskah: 'var(--c-naskah)', vo: 'var(--c-vo)', image: 'var(--c-image)', video: 'var(--c-video)' };

export default async function Saldo() {
  const data = await loadAccount();
  const { session: s, rates, settings, balance } = data;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: ledger }, { data: jobs }, { data: lots }, { data: orders }] = await Promise.all([
    s.db.from('credit_ledger').select('id, type, amount, description, created_at').order('created_at', { ascending: false }).limit(40),
    s.db.from('jobs').select('cost_breakdown, status').eq('user_id', s.userId).gte('created_at', since).not('status', 'in', '(refunded,canceled)'),
    s.db.from('credit_lots').select('remaining, expires_at').gt('remaining', 0).order('expires_at').limit(3),
    s.db.from('topup_orders').select('id, pack_id, amount_idr, credits, status, created_at').order('created_at', { ascending: false }).limit(5),
  ]);
  const pendingOrders = (orders ?? []).filter((o) => o.status === 'pending');
  const usage = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const j of jobs ?? []) for (const c of CATEGORIES) usage[c] += Number((j.cost_breakdown as Record<string, number>)?.[c] ?? 0);
  const totalUsage = CATEGORIES.reduce((a, c) => a + usage[c], 0);
  const soon = lots?.[0];
  return (
    <AccountPage data={data} active="saldo" title="Saldo & tarif">
      <header className="vhead">
        <div>
          <p className="eyebrow">BILLING</p>
          <h1>Saldo & tarif</h1>
          <p className="lede">Satu saldo untuk semua kategori AI. Tiap kategori dipotong sesuai tarif dan tier yang kamu pilih. 1 kredit = Rp100. Kredit berlaku 12 bulan sejak top-up.</p>
        </div>
      </header>
      <div className="grid2">
        <section className="card">
          <p className="muted small">Saldo tersedia</p>
          <p className="big" style={{ margin: '6px 0' }}>{fmt(balance)}</p>
          <p className="muted small">≈ {rupiah(creditsToRupiah(balance))}{soon ? ` · ${fmt(soon.remaining)} kredit hangus ${new Date(soon.expires_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}` : ''}</p>
          <h3 style={{ margin: '18px 0 8px' }}>Pemakaian 30 hari · {fmt(totalUsage)} kredit</h3>
          <div className="stackbar" role="img" aria-label="Pemakaian per kategori">
            {CATEGORIES.map((c) => <i key={c} style={{ width: `${totalUsage ? (usage[c] / totalUsage) * 100 : 0}%`, background: COLOR[c] }} />)}
          </div>
          <div className="legend">
            {CATEGORIES.map((c) => (
              <div key={c}><span className="sw" style={{ background: COLOR[c] }} />{CATEGORY_META[c].label}<b>{fmt(usage[c])}</b></div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Top-up</h2>
          <TopupButtons packs={TOPUP_PACKS.map((p) => ({ ...p }))} sandbox={env().PAYMENTS_SANDBOX} online={Boolean(await platformSecret('MIDTRANS_SERVER_KEY'))} />
          {pendingOrders.length > 0 && (
            <p className="note" style={{ marginTop: 10 }}>
              {pendingOrders.length} pembayaran menunggu konfirmasi. Kredit masuk otomatis setelah pembayaran terverifikasi.
            </p>
          )}
          <p className="small faint" style={{ marginTop: 10 }}>Pembayaran QRIS, virtual account, dan e-wallet lewat payment gateway lokal. Top-up prabayar, tanpa tagihan belakangan.</p>
        </section>
      </div>
      <section className="card">
        <div className="card-h">
          <h2>Tarif per kategori (kredit)</h2>
          <span className="pill">Tier aktif ditandai · ubah di Provider AI</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tarif">
            <thead>
              <tr><th>Kategori</th><th>Satuan</th>{TIERS.map((t) => <th key={t} className="num-r">{TIER_LABEL[t]}</th>)}<th>Mode</th></tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c}>
                  <td><span className="sw" style={{ background: COLOR[c] }} />{CATEGORY_META[c].label}</td>
                  <td className="muted small">per {CATEGORY_META[c].unit}</td>
                  {TIERS.map((t) => (
                    <td key={t} className="num-r" style={settings[c].tier === t ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>
                      {fmt(rates[c][t])}{c === 'video' ? <span className="faint small"> {VIDEO_RESOLUTION[t]}</span> : null}
                    </td>
                  ))}
                  <td>{settings[c].mode === 'byok' ? <span className="pill info">BYOK · 0 kredit</span> : <span className="pill">Saldo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Riwayat saldo</h2>
        {ledger?.length ? (
          <table className="ledger">
            <thead><tr><th>Waktu</th><th>Keterangan</th><th className="num-r">Kredit</th></tr></thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="small muted">{new Date(l.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{l.description || l.type}{l.type === 'refund' && <span className="pill good" style={{ marginLeft: 6 }}>refund</span>}{l.type === 'expire' && <span className="pill warn" style={{ marginLeft: 6 }}>hangus</span>}</td>
                  <td className="num-r" style={{ color: l.amount > 0 ? 'var(--good)' : undefined }}>{l.amount > 0 ? '+' : ''}{fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Belum ada transaksi.</p>
        )}
      </section>
    </AccountPage>
  );
}
