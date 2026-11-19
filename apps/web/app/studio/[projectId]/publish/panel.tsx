'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublishMeta } from '@atomo/prompt-engine';
import { AIButton } from '@/components/use-ai';
import { useToast } from '@/components/ui';

interface Acc { id: string; platform: string; name: string; avatar: string | null; status: string; audited: boolean; error: string | null }
interface Pub { id: string; variant: string; status: string; videoId: string | null; privacy: string; error: string | null; at: string; title: string }

const STATUS: Record<string, [string, string]> = {
  queued: ['Antre', 'info'], uploading: ['Mengunggah', 'acc'], processing: ['Diproses YouTube', 'acc'], published: ['Terunggah', 'good'], failed: ['Gagal', 'crit'], canceled: ['Dibatalkan', ''],
};
const FLASH: Record<string, string> = { connected: 'Channel YouTube terhubung.', invalid_state: 'Sesi OAuth kedaluwarsa. Coba lagi.', denied: 'Akses YouTube dibatalkan.', error: 'Gagal menghubungkan YouTube.' };

export function PublishPanel(p: {
  projectId: string; episode: number; title: string; synopsis: string;
  renders: { id: string; url: string | null; aspect: string; duration: number; variant: string; at: string }[];
  madeForKids: boolean;
  accounts: Acc[]; pubs: Pub[]; youtubeConfigured: boolean; quota: { used: number; limit: number }; plan: string; flash: string | null;
}) {
  const yt = p.accounts.filter((a) => a.platform === 'youtube');
  const [renderId, setRenderId] = useState(p.renders.find((r) => r.variant === 'master')?.id ?? p.renders[0]?.id ?? '');
  const render = p.renders.find((r) => r.id === renderId) ?? null;
  const [acc, setAcc] = useState(yt[0]?.id ?? '');
  const [title, setTitle] = useState(p.title && !/^Episode \d+$/.test(p.title) ? p.title : '');
  const [desc, setDesc] = useState(`${p.synopsis}\n\nKonten ini dibuat dengan bantuan AI.`.trim());
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (p.flash && FLASH[p.flash]) toast(FLASH[p.flash]!, p.flash === 'connected' ? 'ok' : 'err');
  }, [p.flash, toast]);
  const shorts = render?.aspect === '9:16' && (render?.duration ?? 0) <= 180;
  const account = yt.find((a) => a.id === acc);
  const back = `/studio/${p.projectId}/publish${p.episode > 1 ? `?ep=${p.episode}` : ''}`;

  async function publish() {
    if (!render || !acc) return;
    setBusy(true);
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ renderId: render.id, socialAccountId: acc, title, description: desc, tags: tags.split(/[,\s]+/).filter(Boolean), privacy, idempotencyKey: crypto.randomUUID().replace(/-/g, '') }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) toast(j.error?.message ?? 'Gagal', 'err');
    else toast('Masuk antrean upload YouTube', 'info');
    router.refresh();
  }

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 8/8 · PUBLISH</p>
          <h1>Publish</h1>
          <p className="lede">Unggah hasil render ke channel YouTube kamu. Video vertikal ≤ 3 menit otomatis masuk sebagai Shorts. Label konten AI selalu aktif dan tidak bisa dimatikan.</p>
        </div>
        <div className="vactions">
          <AIButton
            action="publish_meta"
            params={{}}
            items={[{ category: 'naskah', quantity: 1 }]}
            label="Buat judul & deskripsi"
            variant="secondary"
            onData={(d) => {
              const m = d as PublishMeta;
              setTitle(m.youtube.title);
              setDesc(m.youtube.description);
              setTags(m.youtube.tags.join(', '));
            }}
          />
        </div>
      </header>
      {!render && <p className="note warn">Belum ada render siap. Selesaikan render di tahap Editor dulu.</p>}
      <div className="plat">
        <section className="pcard">
          <div className="ph">
            <span className="av" style={{ background: '#e5484d' }} />
            <div><b>YouTube {shorts ? '· Shorts' : ''}</b><small>{yt.length ? `${yt.length} channel terhubung` : 'Belum terhubung'}</small></div>
          </div>
          <p className="small muted">Kuota upload hari ini: <b className="mono">{Math.max(0, p.quota.limit - p.quota.used)}/{p.quota.limit}</b></p>
          {account && !account.audited && <p className="small" style={{ color: 'var(--warn)' }}>Aplikasi belum lolos audit Google: video akan diunggah sebagai <b>private</b>.</p>}
          {account?.status !== undefined && account.status !== 'active' && <p className="small" style={{ color: 'var(--crit)' }}>Koneksi terputus: {account.error ?? 'hubungkan ulang'}.</p>}
          {p.youtubeConfigured ? (
            <a className="btn sm" href={`/api/oauth/youtube/start?back=${encodeURIComponent(back)}`}>{yt.length ? 'Hubungkan channel lain' : 'Hubungkan YouTube'}</a>
          ) : (
            <p className="small faint">Integrasi YouTube belum dikonfigurasi server.</p>
          )}
        </section>
        <section className="pcard" style={{ opacity: 0.6 }}>
          <div className="ph"><span className="av" style={{ background: '#5fcfbf' }} /><div><b>TikTok</b><small>Segera (Fase 2)</small></div></div>
          <p className="small muted">Klien yang belum diaudit TikTok hanya bisa posting private dan dibatasi jumlah user per 24 jam.</p>
        </section>
        <section className="pcard">
          <div className="ph"><span className="av" style={{ background: 'var(--accent)' }} /><div><b>Unduh MP4</b><small>Unggah manual ke platform mana pun</small></div></div>
          {render?.url ? <a className="btn sm" href={render.url} download>Unduh render terbaru</a> : <span className="small faint">Belum ada render</span>}
        </section>
      </div>
      {render && yt.length > 0 && (
        <section className="card">
          <h2>Metadata YouTube</h2>
          <div className="grid2">
            <div className="stack-sm">
              <div>
                <label className="lbl" htmlFor="rd">Video</label>
                <select id="rd" value={renderId} onChange={(e) => setRenderId(e.target.value)}>
                  {p.renders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.variant === 'teaser' ? 'Teaser' : 'Master'} {r.aspect} · {Math.round(r.duration)} dtk{r.aspect === '9:16' && r.duration <= 180 ? ' → Shorts' : ' → YouTube'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="ch">Channel</label>
                <select id="ch" value={acc} onChange={(e) => setAcc(e.target.value)}>
                  {yt.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="tt">Judul ({title.length}/100)</label>
                <input id="tt" type="text" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="lbl" htmlFor="tg">Tag (pisahkan dengan koma)</label>
                <input id="tg" type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="horor, microdrama, kamar7" />
              </div>
              <div>
                <label className="lbl">Visibilitas</label>
                <div className="seg">
                  {(['private', 'unlisted', 'public'] as const).map((v) => (
                    <button key={v} className={privacy === v ? 'on' : ''} onClick={() => setPrivacy(v)}>{{ private: 'Private', unlisted: 'Unlisted', public: 'Publik' }[v]}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="lbl" htmlFor="ds">Deskripsi</label>
              <textarea id="ds" rows={9} value={desc} maxLength={4800} onChange={(e) => setDesc(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span className="row">
              <span className="pill acc">Label konten AI: aktif (wajib)</span>
              {p.madeForKids && <span className="pill info" title="Aturan COPPA: komentar & iklan personalisasi dinonaktifkan YouTube">Dibuat untuk anak: aktif (wajib)</span>}
            </span>
            <button className="btn primary" disabled={busy || !title.trim() || !acc} onClick={publish}>{busy ? 'Mengirim…' : 'Publish ke YouTube'}</button>
          </div>
        </section>
      )}
      {p.pubs.length > 0 && (
        <section className="card">
          <h2>Status publish</h2>
          <table className="eps">
            <thead><tr><th>Waktu</th><th>Judul</th><th>Varian</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {p.pubs.map((x) => {
                const [label, cls] = STATUS[x.status] ?? [x.status, ''];
                return (
                  <tr key={x.id}>
                    <td className="small muted">{new Date(x.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{x.title}</td>
                    <td><span className="pill">{x.variant}</span> <span className="pill">{x.privacy}</span></td>
                    <td><span className={`pill ${cls}`} title={x.error ?? ''}>{label}</span>{x.error && <div className="small" style={{ color: 'var(--crit)' }}>{x.error}</div>}</td>
                    <td>{x.videoId && <a className="btn sm ghost" href={`https://youtu.be/${x.videoId}`} target="_blank" rel="noreferrer">Buka</a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
