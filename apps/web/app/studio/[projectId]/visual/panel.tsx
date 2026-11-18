'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { VIDEO_RESOLUTION } from '@atomo/credits';
import { AIButton } from '@/components/use-ai';
import { fmt1, timecode } from '@/components/ui';

interface S {
  id: string; no: number; sceneNo: number; durationSec: number; description: string; keyframeUrl: string | null; approved: boolean;
  keyframeReady: boolean; clipStatus: string; clipProgress: number; clipUrl: string | null;
}

const STATUS: Record<string, [string, string]> = {
  empty: ['Belum dirender', ''], queued: ['Antre', 'info'], running: ['Merender', 'acc'], ready: ['Selesai', 'good'], failed: ['Gagal', 'crit'],
};

export function VisualPanel(p: { projectId: string; episode: number; aspect: string; tier: 'hemat' | 'standar' | 'premium'; shots: S[] }) {
  const renderable = p.shots.filter((s) => s.approved && s.keyframeReady && (s.clipStatus === 'empty' || s.clipStatus === 'failed'));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(renderable.map((s) => s.id)));
  const sel = useMemo(() => renderable.filter((s) => picked.has(s.id)), [renderable, picked]);
  const sec = Math.ceil(sel.reduce((a, s) => a + s.durationSec, 0));
  const done = p.shots.filter((s) => s.clipStatus === 'ready');
  const running = p.shots.filter((s) => s.clipStatus === 'queued' || s.clipStatus === 'running');
  const unapproved = p.shots.filter((s) => !s.approved).length;

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 5/8 · AI IMAGE TO VIDEO</p>
          <h1>Produksi visual</h1>
          <p className="lede">Frame kunci yang sudah disetujui dihidupkan jadi klip video. Pakai tier Hemat (480p) untuk draft, Premium (1080p) untuk final. Tier sekarang: {p.tier} · {VIDEO_RESOLUTION[p.tier]}.</p>
        </div>
        <div className="vactions">
          <AIButton action="clip" params={{ shotIds: sel.map((s) => s.id) }} items={[{ category: 'video', quantity: sec }]} label={`Render ${sel.length} shot · ${sec} dtk`} disabled={!sel.length} />
        </div>
      </header>
      {unapproved > 0 && (
        <p className="note warn">
          {unapproved} shot belum disetujui di <Link href={`/studio/${p.projectId}/storyboard${p.episode > 1 ? `?ep=${p.episode}` : ''}`}><b>storyboard</b></Link>. Hanya shot yang disetujui yang bisa dirender.
        </p>
      )}
      <div className="stats">
        <div className="stat"><small>Klip selesai</small><b>{done.length}/{p.shots.length}</b><span>{fmt1(done.reduce((a, s) => a + s.durationSec, 0))} detik</span></div>
        <div className="stat"><small>Sedang dirender</small><b>{running.length}</b><span>diperbarui otomatis</span></div>
        <div className="stat"><small>Dipilih</small><b>{sel.length}</b><span>{sec} detik video</span></div>
        <div className="stat"><small>Resolusi</small><b>{VIDEO_RESOLUTION[p.tier]}</b><span>ubah di Provider AI</span></div>
      </div>
      <section className="card">
        <div className="card-h">
          <h2>Antrean render</h2>
          {renderable.length > 0 && (
            <button className="btn sm ghost" onClick={() => setPicked(picked.size === renderable.length ? new Set() : new Set(renderable.map((s) => s.id)))}>
              {picked.size === renderable.length ? 'Kosongkan pilihan' : 'Pilih semua'}
            </button>
          )}
        </div>
        {p.shots.length === 0 ? (
          <p className="muted">Belum ada shot. Buat shot list di tahap storyboard.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="qtable">
              <thead>
                <tr><th></th><th>Shot</th><th>Deskripsi</th><th className="num-r">Durasi</th><th>Status</th><th>Progres</th><th></th></tr>
              </thead>
              <tbody>
                {p.shots.map((s) => {
                  const can = renderable.includes(s);
                  const [label, cls] = STATUS[s.clipStatus] ?? ['?', ''];
                  return (
                    <tr key={s.id}>
                      <td>
                        <input type="checkbox" aria-label={`Pilih shot ${s.no}`} disabled={!can} checked={can && picked.has(s.id)} onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(s.id); else n.delete(s.id);
                          setPicked(n);
                        }} />
                      </td>
                      <td className="mono">#{s.no} · SC{s.sceneNo}</td>
                      <td className="small">{s.description}{!s.approved && <span className="pill warn" style={{ marginLeft: 6 }}>belum disetujui</span>}</td>
                      <td className="num-r">{timecode(s.durationSec)}</td>
                      <td><span className={`pill ${cls}`}>{label}</span></td>
                      <td><div className={`bar ${s.clipStatus === 'ready' ? 'done' : ''}`}><i style={{ width: `${s.clipStatus === 'ready' ? 100 : s.clipProgress}%` }} /></div></td>
                      <td>{s.clipUrl && <a className="btn sm ghost" href={s.clipUrl} target="_blank" rel="noreferrer">Lihat</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {done.length > 0 && (
        <div className="board">
          {done.map((s) => (
            <article className="shot" key={s.id}>
              <div className={`frame ${p.aspect === '16:9' ? 'r169' : p.aspect === '1:1' ? 'r11' : ''}`}>
                <video src={s.clipUrl ?? undefined} poster={s.keyframeUrl ?? undefined} muted loop playsInline preload="none" onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
                <span className="no">#{s.no}</span>
                <span className="dur">{fmt1(s.durationSec)}s</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
