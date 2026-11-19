import type { Metadata } from 'next';
import Link from 'next/link';
import { AI_PROFILE_META, AI_PROFILES, creditsToRupiah, detectProfile, episodeEstimate, PLAN_FEATURES, PLAN_OFFERS, TIER_RANK, type PlanOffer } from '@atomo/credits';
import { fmt, rupiah } from '@/lib/format';
import { AccountPage, loadAccount } from '@/lib/account';
import { env } from '@/lib/env';
import { activePlan } from '@/lib/plan';
import { platformSecret } from '@/lib/platform';
import { BuyPlan, PeriodToggle } from './buy';

export const metadata: Metadata = { title: 'Paket & langganan' };

const DURATIONS = [
  { label: 'Microdrama 1,5 menit', minutes: 1.5, aiShare: 0.6 },
  { label: 'Episode 10 menit', minutes: 10, aiShare: 0.4 },
  { label: 'Episode 20 menit', minutes: 20, aiShare: 0.4 },
];

export default async function Paket(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await props.searchParams;
  const months: 1 | 3 = q.periode === '3' ? 3 : 1;
  const data = await loadAccount();
  const s = data.session;
  const [active, online] = await Promise.all([activePlan(s.db, s.userId, s.profile.plan), platformSecret('MIDTRANS_SERVER_KEY').then(Boolean)]);
  const sandbox = env().PAYMENTS_SANDBOX;
  const tiersNow = { naskah: data.settings.naskah.tier, vo: data.settings.vo.tier, image: data.settings.image.tier, video: data.settings.video.tier };
  const profileNow = detectProfile(tiersNow);
  const ep20 = episodeEstimate({ minutes: 20, aiShare: 0.4 }, AI_PROFILE_META.seimbang.tiers, data.rates).total;
  const subs = PLAN_OFFERS.filter((o) => o.kind === 'langganan' && o.months === months);
  const series = PLAN_OFFERS.filter((o) => o.kind === 'serial');

  const action = (o: PlanOffer) => {
    const same = active.periodEnd && active.tier === o.tier;
    const lower = active.periodEnd && TIER_RANK[o.tier] < TIER_RANK[active.tier];
    return { label: lower ? 'Paket aktif lebih tinggi' : same ? 'Perpanjang' : 'Pilih paket', disabled: Boolean(lower) };
  };
  const view = (o: PlanOffer) => ({ id: o.id, name: o.name, months: o.months, priceIdr: o.priceIdr, credits: o.credits });

  return (
    <AccountPage data={data} active="paket" title="Paket & langganan">
      <header className="vhead">
        <div>
          <p className="eyebrow">BILLING</p>
          <h1>Paket & langganan</h1>
          <p className="lede">
            Langganan berisi kredit bulanan plus fitur produksi. Paket serial memberi kredit lebih banyak untuk rilis episode rutin. Semua prabayar lewat QRIS, VA, atau e-wallet, tanpa potong otomatis.
          </p>
        </div>
        <div className="vactions"><PeriodToggle value={months} /></div>
      </header>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p className="muted small">Paket kamu</p>
            <p className="big" style={{ margin: '4px 0' }}>{PLAN_FEATURES[active.tier].label}</p>
            <p className="muted small">
              {active.periodEnd
                ? `Aktif sampai ${new Date(active.periodEnd).toLocaleDateString('id-ID', { dateStyle: 'long' })} · sisa ${active.daysLeft} hari`
                : 'Bayar kredit sesuai pemakaian. Upgrade untuk tanpa watermark, 1080p, dan publish terjadwal.'}
            </p>
          </div>
          <div className="stat" style={{ minWidth: 220 }}>
            <small>Saldo</small><b>{fmt(data.balance)}</b><span>≈ {rupiah(creditsToRupiah(data.balance))}</span>
          </div>
        </div>
        {active.daysLeft !== null && active.daysLeft <= 5 && (
          <p className="note warn" style={{ marginTop: 10 }}>Paket habis dalam {active.daysLeft} hari. Perpanjang supaya watermark tidak muncul lagi dan jadwal publish tetap jalan. Kredit yang tersisa tetap milikmu.</p>
        )}
      </section>

      <h2 style={{ margin: '22px 0 12px' }}>Langganan kreator</h2>
      <div className="plans">
        <article className={`plan ${active.tier === 'free' ? 'cur' : ''}`}>
          {active.tier === 'free' && <span className="tag">PAKET KAMU</span>}
          <h3>Gratis</h3>
          <p className="price">Rp0</p>
          <ul>{PLAN_FEATURES.free.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link className="btn" href="/saldo">Top-up kredit</Link>
        </article>
        {subs.map((o) => {
          const a = action(o);
          const cur = active.periodEnd && active.tier === o.tier;
          return (
            <article key={o.id} className={`plan ${cur ? 'cur' : o.highlight ? 'hl' : ''}`}>
              {cur ? <span className="tag">PAKET KAMU</span> : o.highlight && <span className="tag">PALING DIPILIH</span>}
              <h3>{o.name}</h3>
              <p className="price">{rupiah(Math.round(o.priceIdr / o.months))}<small> /bulan</small></p>
              <p className="small muted">{fmt(o.credits / o.months)} kredit/bulan{o.months === 3 ? ` · bayar ${rupiah(o.priceIdr)} per 3 bulan` : ''}</p>
              <ul>{o.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <BuyPlan offer={view(o)} label={a.label} disabled={a.disabled} sandbox={sandbox} online={online} primary={Boolean(o.highlight)} />
            </article>
          );
        })}
      </div>

      <h2 style={{ margin: '26px 0 6px' }}>Paket serial</h2>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Untuk channel dengan rilis rutin. Perkiraan 1 episode 20 menit (mode Seimbang, 40% video AI) ±{fmt(ep20)} kredit ≈ {rupiah(creditsToRupiah(ep20))}. Termasuk semua fitur Pro.
      </p>
      <div className="plans three">
        {series.map((o) => {
          const a = action(o);
          return (
            <article key={o.id} className={`plan ${o.highlight ? 'hl' : ''}`}>
              {o.highlight && <span className="tag">HEMAT TERBESAR</span>}
              <h3>{o.name}</h3>
              <p className="price">{rupiah(o.priceIdr)}<small> /bulan</small></p>
              <p className="small muted">
                {fmt(o.credits)} kredit · ±{o.episodes} episode · {rupiah(Math.round(o.priceIdr / o.episodes! / 20))}/menit tayang
              </p>
              <ul>{o.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <BuyPlan offer={view(o)} label={a.label} disabled={a.disabled} sandbox={sandbox} online={online} primary={Boolean(o.highlight)} />
            </article>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 22 }}>
        <div className="card-h">
          <h2>Berapa biaya satu episode?</h2>
          <Link className="btn sm" href="/provider">Ganti mode AI →</Link>
        </div>
        <p className="muted small">Perkiraan dengan tarif saat ini, termasuk cadangan 20% untuk generate ulang. Shot gerak kamera tidak memotong kredit video.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="qtable">
            <thead>
              <tr><th>Durasi</th>{AI_PROFILES.map((p) => <th key={p} className="num-r">{AI_PROFILE_META[p].label}{profileNow === p ? ' (aktif)' : ''}</th>)}</tr>
            </thead>
            <tbody>
              {DURATIONS.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}<span className="small faint"> · {Math.round(d.aiShare * 100)}% video AI</span></td>
                  {AI_PROFILES.map((p) => {
                    const t = episodeEstimate(d, AI_PROFILE_META[p].tiers, data.rates).total;
                    return <td key={p} className="num-r mono">{fmt(t)} kr<br /><span className="small faint">{rupiah(creditsToRupiah(t))}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small faint" style={{ marginTop: 12 }}>
        Kredit paket berlaku 12 bulan dan tetap milikmu walau paket berakhir. Membeli paket yang sama memperpanjang periode; upgrade berlaku mulai hari itu. Mode BYOK (API key sendiri) tidak memotong kredit.
      </p>
    </AccountPage>
  );
}
