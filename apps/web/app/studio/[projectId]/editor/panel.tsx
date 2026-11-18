'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Timeline } from '@atomo/timeline';
import { clipStarts } from '@atomo/timeline';
import { fmt1, timecode, useToast } from '@/components/ui';

interface R { id: string; status: string; progress: number; url: string | null; resolution: string; error: string | null; at: string; duration: number | null }

export function EditorPanel(p: {
  projectId: string; episode: number; aspect: string; plan: string; timeline: Timeline | null; duration: number; missing: string[];
  shotNo: Record<string, number>; renders: R[];
}) {
  const [quality, setQuality] = useState<'480p' | '720p' | '1080p'>(p.plan === 'free' ? '720p' : '1080p');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const latest = p.renders.find((r) => r.status === 'ready');
  const active = p.renders.find((r) => r.status === 'queued' || r.status === 'running');
  const t = p.timeline;
  const pct = (x: number) => `${(x / Math.max(0.001, p.duration)) * 100}%`;

  async function render() {
    setBusy(true);
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: p.projectId, episode: p.episode, quality, idempotencyKey: crypto.randomUUID().replace(/-/g, '') }),
      });
      const j = (await res.json()) as { error?: { message: string }; missing?: string[] };
      if (!res.ok) toast(j.error?.message ?? 'Gagal memulai render', 'err');
      else toast(j.missing?.length ? `Render dimulai. Catatan: ${j.missing.length} item belum lengkap.` : 'Render dimulai', 'info');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 7/8 · EDITOR</p>
          <h1>Editor & finishing</h1>
          <p className="lede">Timeline dirakit otomatis dari urutan shot dan VO: dialog ditempel ke shot yang tepat, shot diperpanjang bila dialog lebih panjang, subtitle gaya short-form dibuat dari naskah.</p>
        </div>
        <div className="vactions">
          <select aria-label="Resolusi" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} style={{ width: 'auto' }}>
            <option value="480p">480p (draft)</option>
            <option value="720p">720p</option>
            <option value="1080p" disabled={p.plan === 'free'}>1080p{p.plan === 'free' ? ' (Creator+)' : ''}</option>
          </select>
          <button className="btn primary" onClick={render} disabled={busy || !t || Boolean(active)}>
            {active ? `Merender ${active.progress}%` : busy ? 'Memulai…' : 'Rakit & render MP4'}
            <span className="cost">gratis</span>
          </button>
        </div>
      </header>
      {p.missing.length > 0 && (
        <p className="note warn">
          Belum lengkap: {p.missing.slice(0, 4).join(' · ')}{p.missing.length > 4 ? ` · +${p.missing.length - 4} lagi` : ''}. Render tetap bisa jalan; shot tanpa klip memakai frame kunci diam.
        </p>
      )}
      {!t ? (
        <section className="card">
          <p className="muted">Belum ada shot. Selesaikan <Link href={`/studio/${p.projectId}/storyboard`}><b>storyboard</b></Link> dulu.</p>
        </section>
      ) : (
        <section className="tl" aria-label="Timeline">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="mono small muted">00:00:00:00</span>
            <span className="mono small">{timecode(p.duration)} · {t.fps} fps · {t.aspect}</span>
          </div>
          <div className="track">
            <span>Video</span>
            <div className="lane">
              {t.tracks.video.map((v, i) => {
                const starts = clipStarts(t);
                return (
                  <div key={v.shotId} className={`clip v ${i % 2 ? 'alt' : ''}`} style={{ left: pct(starts[i]!), width: pct(v.out - v.in) }} title={`Shot #${p.shotNo[v.shotId]} · ${fmt1(v.out - v.in)} dtk${v.transition && v.transition !== 'cut' ? ` · ${v.transition}` : ''}`}>
                    #{p.shotNo[v.shotId]}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="track">
            <span>Dialog</span>
            <div className="lane">
              {t.tracks.dialog.map((d) => {
                const sub = t.tracks.subtitle.filter((s) => s.start >= d.start - 0.01);
                const end = sub[0]?.end ?? d.start + 1;
                return <div key={d.lineId} className="clip d" style={{ left: pct(d.start), width: pct(Math.max(0.3, end - d.start)) }} title={sub[0]?.text}>{d.lineId}</div>;
              })}
            </div>
          </div>
          <div className="track">
            <span>Subtitle</span>
            <div className="lane">
              {t.tracks.subtitle.map((s, i) => <div key={i} className="clip s" style={{ left: pct(s.start), width: pct(s.end - s.start) }} title={s.text} />)}
            </div>
          </div>
          <div className="track">
            <span>Musik</span>
            <div className="lane">{t.tracks.music.length ? <div className="clip m" style={{ left: 0, width: '100%' }}>musik · ducking</div> : <span className="faint small" style={{ padding: '0 8px', lineHeight: '34px' }}>tanpa musik</span>}</div>
          </div>
        </section>
      )}
      <div className="grid2">
        <section className="card">
          <h2>Pratinjau</h2>
          {latest?.url ? (
            <video src={latest.url} controls playsInline style={{ width: '100%', maxHeight: 560, background: '#000', borderRadius: 10, aspectRatio: p.aspect.replace(':', '/') }} />
          ) : (
            <p className="muted">Belum ada hasil render.</p>
          )}
        </section>
        <section className="card">
          <h2>Riwayat render</h2>
          {p.renders.length === 0 ? (
            <p className="muted">Belum ada.</p>
          ) : (
            <table className="qtable">
              <tbody>
                {p.renders.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{new Date(r.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="mono small">{r.resolution}</td>
                    <td>
                      {r.status === 'ready' ? <span className="pill good">Siap</span> : r.status === 'failed' ? <span className="pill crit" title={r.error ?? ''}>Gagal</span> : <div className="bar"><i style={{ width: `${r.progress}%` }} /></div>}
                    </td>
                    <td>{r.url && <a className="btn sm" href={r.url} download>Unduh MP4</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {latest && (
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <Link className="btn" href={`/studio/${p.projectId}/publish${p.episode > 1 ? `?ep=${p.episode}` : ''}`}>Lanjut ke publish →</Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
