import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountPage, loadAccount } from '@/lib/account';
import { channelMetricsSchema, insights, videoMetricsSchema, yppProgress, type VideoRow } from '@/lib/analytics';
import { fmt } from '@/lib/format';
import { RefreshMetrics } from './refresh';

export const metadata: Metadata = { title: 'Analitik' };

const dur = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const ago = (iso: string | null) => {
  if (!iso) return 'belum pernah';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

function Bar({ pct }: { pct: number }) {
  return <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div>;
}

export default async function Analitik() {
  const data = await loadAccount();
  const db = data.session.db;
  const [{ data: accs }, { data: pubs }] = await Promise.all([
    db.from('social_accounts').select('id, channel_name, status, scopes, metrics, metrics_at, audited').eq('workspace_id', data.session.workspaceId).eq('platform', 'youtube'),
    db
      .from('publications')
      .select('id, variant, platform_video_id, published_at, scheduled_at, metrics, metrics_at, social_account_id, metadata, episodes(number, title, project_id, projects(title))')
      .eq('workspace_id', data.session.workspaceId)
      .not('platform_video_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(100),
  ]);
  const rows = (pubs ?? []).map((p) => {
    const ep = p.episodes as unknown as { number: number; title: string; project_id: string; projects: { title: string } | null } | null;
    return {
      id: p.id, variant: p.variant, publishedAt: p.published_at, scheduledAt: p.scheduled_at, videoId: p.platform_video_id!,
      title: String((p.metadata as { title?: string })?.title ?? ''), project: ep?.projects?.title ?? '', episode: ep?.number ?? null, projectId: ep?.project_id ?? null,
      m: videoMetricsSchema.parse(p.metrics ?? {}), hasMetrics: Boolean(p.metrics_at),
    };
  });
  const tips = insights(rows as VideoRow[]);
  const totals = rows.reduce((a, r) => ({ views: a.views + r.m.views, minutes: a.minutes + (r.m.minutesWatched ?? 0), subs: a.subs + (r.m.subsGained ?? 0) }), { views: 0, minutes: 0, subs: 0 });
  const withPct = rows.filter((r) => r.variant !== 'shorts' && r.m.avgViewPct !== undefined && r.m.views > 0);
  const avgPct = withPct.length ? Math.round(withPct.reduce((a, r) => a + r.m.avgViewPct!, 0) / withPct.length) : null;

  return (
    <AccountPage data={data} active="analitik" title="Analitik">
      <header className="vhead">
        <div>
          <p className="eyebrow">PERTUMBUHAN</p>
          <h1>Analitik channel</h1>
          <p className="lede">Statistik video yang kamu unggah lewat Atomo, diperbarui otomatis tiap 6 jam dari YouTube. Pakai saran di tiap video untuk memperbaiki judul, thumbnail, dan pembuka episode berikutnya.</p>
        </div>
        <div className="vactions"><RefreshMetrics disabled={!accs?.some((a) => a.status === 'active')} /></div>
      </header>

      {!accs?.length ? (
        <section className="card">
          <h2>Belum ada channel terhubung</h2>
          <p className="muted">Hubungkan YouTube dari tahap Publish di project mana pun. Setelah video terunggah, statistiknya muncul di sini.</p>
          <Link className="btn" href="/studio">Buka project</Link>
        </section>
      ) : (
        <>
          {accs.map((a) => {
            const c = channelMetricsSchema.parse(a.metrics ?? {});
            const y = yppProgress(c);
            return (
              <section className="card" key={a.id}>
                <div className="card-h">
                  <h2>{a.channel_name}</h2>
                  <span className="small muted">diperbarui {ago(a.metrics_at)}{a.status !== 'active' ? ' · koneksi terputus' : ''}</span>
                </div>
                <div className="stats">
                  <div className="stat"><small>Subscriber</small><b>{fmt(c.subscribers)}</b><span>target monetisasi {fmt(y.subscribers.target)}</span><Bar pct={y.subscribers.pct} /></div>
                  <div className="stat">
                    <small>Jam tonton 12 bulan</small>
                    <b>{y.watchHours ? fmt(y.watchHours.value) : '–'}</b>
                    <span>{y.watchHours ? `target ${fmt(y.watchHours.target)} jam (perkiraan)` : 'butuh izin analitik'}</span>
                    {y.watchHours && <Bar pct={y.watchHours.pct} />}
                  </div>
                  <div className="stat"><small>Total views channel</small><b>{fmt(c.views)}</b><span>{fmt(c.videos)} video</span></div>
                  <div className="stat"><small>Rata-rata ditonton</small><b>{avgPct === null ? '–' : `${avgPct}%`}</b><span>video panjang dari Atomo</span></div>
                </div>
                {c.analyticsError === 'scope' && (
                  <p className="note warn" style={{ marginTop: 10 }}>
                    Jam tonton & retensi butuh izin YouTube Analytics. <a href="/api/oauth/youtube/start?back=/analitik"><b>Hubungkan ulang channel</b></a> sekali untuk mengaktifkannya.
                  </p>
                )}
                <p className="small faint" style={{ marginTop: 8 }}>Syarat monetisasi bisa berubah dan jam tonton resmi hanya menghitung video publik. Angka resmi ada di YouTube Studio → Hasilkan uang.</p>
              </section>
            );
          })}

          <section className="card">
            <div className="card-h">
              <h2>Video dari Atomo</h2>
              <span className="small muted">{fmt(totals.views)} views · {fmt(Math.round(totals.minutes / 60))} jam ditonton · +{fmt(totals.subs)} subscriber</span>
            </div>
            {rows.length === 0 ? (
              <p className="muted">Belum ada video yang diunggah.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="qtable">
                  <thead>
                    <tr><th>Video</th><th className="num-r">Views</th><th className="num-r">Ditonton</th><th className="num-r">Rata-rata durasi</th><th className="num-r">Suka · Komentar</th><th className="num-r">+Sub</th><th>Saran</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>{r.title || '(tanpa judul)'}</b>
                          <div className="small muted">
                            <span className="pill">{r.variant === 'shorts' ? 'Shorts' : 'Video'}</span> {r.project}{r.episode ? ` · Eps ${r.episode}` : ''}
                            {r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now() ? ` · tayang ${new Date(r.scheduledAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                          </div>
                        </td>
                        <td className="num-r mono">{r.hasMetrics ? fmt(r.m.views) : '–'}</td>
                        <td className="num-r mono">{r.m.avgViewPct === undefined ? '–' : `${r.m.avgViewPct}%`}</td>
                        <td className="num-r mono">{dur(r.m.avgViewDurationSec)}</td>
                        <td className="num-r mono">{fmt(r.m.likes)} · {fmt(r.m.comments)}</td>
                        <td className="num-r mono">{r.m.subsGained === undefined ? '–' : fmt(r.m.subsGained)}</td>
                        <td className="small">
                          {(tips[r.id] ?? []).map((t) => <div key={t.text} style={{ color: t.tone === 'good' ? 'var(--good)' : t.tone === 'warn' ? 'var(--warn)' : 'var(--muted)' }}>{t.text}</div>)}
                          <a className="small" href={`https://studio.youtube.com/video/${r.videoId}/analytics/tab-reach_viewers/period-default`} target="_blank" rel="noreferrer">CTR thumbnail di Studio ↗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small faint" style={{ marginTop: 8 }}>CTR tayangan (klik thumbnail) tidak tersedia lewat API YouTube untuk aplikasi pihak ketiga, jadi dibuka langsung di YouTube Studio.</p>
          </section>
        </>
      )}
    </AccountPage>
  );
}
