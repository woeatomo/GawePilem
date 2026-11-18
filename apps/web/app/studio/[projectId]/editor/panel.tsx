'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { EditProposal, Timeline } from '@atomo/timeline';
import { clipStarts } from '@atomo/timeline';
import { acceptTimelineEdit, reassembleTimeline, restoreTimeline } from '@/app/actions';
import { AIButton } from '@/components/use-ai';
import { fmt1, timecode, useToast } from '@/components/ui';

const QUICK_EDIT = ['Percepat pacing scene 1', 'Tambah jeda sebelum twist', 'Pakai dip ke hitam antar-scene', 'Kecilkan musik saat dialog', 'Potong shot yang terlalu lama'];
const SOURCE: Record<string, string> = { auto: 'rakit otomatis', ai_edit: 'edit AI', manual: 'manual' };

function describeOp(op: EditProposal['ops'][number], no: Record<string, number>): string {
  switch (op.op) {
    case 'trim': return `Potong shot #${no[op.shotId] ?? '?'}${op.in !== undefined ? ` mulai ${fmt1(op.in)} dtk` : ''}${op.out !== undefined ? ` sampai ${fmt1(op.out)} dtk` : ''}`;
    case 'move': return `Pindah shot #${no[op.shotId] ?? '?'} ke urutan ${op.toIndex + 1}`;
    case 'remove': return `Hapus shot #${no[op.shotId] ?? '?'}`;
    case 'transition': return `Transisi ${op.transition} masuk ke shot #${no[op.shotId] ?? '?'}`;
    case 'shiftDialog': return `Geser dialog ${op.lineId} ${op.by > 0 ? '+' : ''}${fmt1(op.by)} dtk`;
    case 'gain': return `Volume ${op.track} ${op.gainDb} dB`;
    case 'duck': return `Ducking musik ${op.enabled ? 'aktif' : 'mati'}`;
    case 'subtitleText': return `Ubah subtitle #${op.index + 1}: “${op.text}”`;
  }
}

interface R { id: string; status: string; progress: number; url: string | null; resolution: string; error: string | null; at: string; duration: number | null }

export function EditorPanel(p: {
  projectId: string; episode: number; aspect: string; plan: string; timeline: Timeline | null; duration: number; missing: string[];
  shotNo: Record<string, number>; renders: R[]; episodeId: string;
  saved: { version: number; source: string; note: string } | null;
  versions: { version: number; source: string; note: string; at: string }[];
}) {
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<{ p: EditProposal; base: number } | null>(null);
  const [pending, start] = useTransition();
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
        body: JSON.stringify({ projectId: p.projectId, episode: p.episode, quality, mode: 'latest', idempotencyKey: crypto.randomUUID().replace(/-/g, '') }),
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
            {active ? `Merender ${active.progress}%` : busy ? 'Memulai…' : p.saved ? `Render timeline v${p.saved.version}` : 'Rakit & render MP4'}
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
        <>
        <section className="tl" aria-label="Timeline">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="row">
              <span className="pill">{p.saved ? `v${p.saved.version} · ${SOURCE[p.saved.source] ?? p.saved.source}` : 'pratinjau, belum disimpan'}</span>
              <button className="btn sm ghost" disabled={pending} onClick={() => start(async () => { const r = await reassembleTimeline(p.projectId, p.episode); toast(r?.ok ? 'Timeline dirakit ulang' : (r?.message ?? 'Gagal'), r?.ok ? 'ok' : 'err'); setProposal(null); })}>
                {p.saved ? 'Rakit ulang otomatis' : 'Simpan rakitan'}
              </button>
            </span>
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
        <section className="card">
          <div className="card-h">
            <h2>Edit dengan perintah</h2>
            <span className="pill">AI mengusulkan, kamu yang memutuskan</span>
          </div>
          {!p.saved ? (
            <p className="muted small">Simpan rakitan timeline dulu, lalu ketik perintah edit seperti “percepat pacing SC 2”.</p>
          ) : (
            <>
              <div className="rewrite">
                <input type="text" value={instruction} maxLength={400} onChange={(e) => setInstruction(e.target.value)} placeholder="mis. tambah jeda sebelum ketukan ketiga" aria-label="Perintah edit" />
                <AIButton
                  action="edit"
                  params={{ instruction }}
                  items={[{ category: 'naskah', quantity: 1 }]}
                  label="Minta usulan"
                  disabled={instruction.trim().length < 3}
                  onData={(d) => setProposal({ p: d as EditProposal, base: p.saved!.version })}
                />
              </div>
              <div className="quick" style={{ marginTop: 8 }}>
                {QUICK_EDIT.map((q) => <button key={q} onClick={() => setInstruction(q)}>{q}</button>)}
              </div>
            </>
          )}
          {proposal && (
            <div className="note" style={{ marginTop: 12 }}>
              <b>Usulan:</b> {proposal.p.summary}
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {proposal.p.ops.map((op, i) => <li key={i}>{describeOp(op, p.shotNo)}</li>)}
              </ul>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm primary" disabled={pending} onClick={() => start(async () => {
                  const r = await acceptTimelineEdit(p.episodeId, proposal.base, proposal.p.ops, proposal.p.summary);
                  if (r?.ok) { toast('Edit diterapkan sebagai versi baru'); setProposal(null); setInstruction(''); } else toast(r?.message ?? 'Gagal', 'err');
                })}>Terima</button>
                <button className="btn sm ghost" onClick={() => setProposal(null)}>Batalkan</button>
              </div>
            </div>
          )}
          {p.versions.length > 1 && (
            <details className="small muted" style={{ marginTop: 12 }}>
              <summary>Riwayat versi timeline ({p.versions.length})</summary>
              <ul style={{ paddingLeft: 16, margin: '6px 0' }}>
                {p.versions.map((v, i) => (
                  <li key={v.version} style={{ margin: '4px 0' }}>
                    v{v.version} · {SOURCE[v.source] ?? v.source} · {v.note}{' '}
                    {i > 0 && <button className="btn ghost sm" disabled={pending} onClick={() => start(async () => { const r = await restoreTimeline(p.episodeId, v.version); toast(r?.ok ? `Kembali ke v${v.version}` : (r?.message ?? 'Gagal'), r?.ok ? 'ok' : 'err'); })}>pulihkan</button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        </>
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
