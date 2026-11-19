'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { approveAllShots, deleteShot, moveShot, updateShot } from '@/app/actions';
import { AIButton, BatchAIButton } from '@/components/use-ai';
import { fmt1, timecode, useToast } from '@/components/ui';
import { CAMERA_MOVES, type CameraMove } from '@atomo/timeline';

export interface ShotView {
  id: string; no: number; sceneNo: number; type: string; camera: string; durationSec: number; description: string; dialog: string | null;
  characters: string[]; unlocked: boolean; keyframeUrl: string | null; keyframeStatus: string; approved: boolean; clipStatus: string;
  motion: 'ai' | 'camera'; cameraMove: CameraMove;
}

export const MOVE_LABEL: Record<CameraMove, string> = {
  push_in: 'Dorong masuk', pull_out: 'Tarik mundur', pan_left: 'Pan kiri', pan_right: 'Pan kanan', tilt_up: 'Tilt naik', tilt_down: 'Tilt turun', static: 'Diam',
};

export const ratioClass = (a: string) => (a === '16:9' ? 'r169' : a === '1:1' ? 'r11' : '');

export function StoryboardPanel(p: { projectId: string; episodeId: string; episode: number; aspect: string; sceneCount: number; writtenScenes: number[]; scriptReady: boolean; shots: ShotView[] }) {
  const [filter, setFilter] = useState(0);
  const [pending, start] = useTransition();
  const toast = useToast();
  const act = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast(r.message ?? 'Gagal', 'err');
    });
  const shown = filter ? p.shots.filter((s) => s.sceneNo === filter) : p.shots;
  const missing = p.shots.filter((s) => s.keyframeStatus !== 'ready' && s.keyframeStatus !== 'queued' && s.keyframeStatus !== 'running' && !s.unlocked);
  const total = p.shots.reduce((a, s) => a + s.durationSec, 0);
  const approved = p.shots.filter((s) => s.approved).length;
  const anyUnlocked = p.shots.some((s) => s.unlocked);
  const aiSec = p.shots.filter((s) => s.motion === 'ai').reduce((a, s) => a + s.durationSec, 0);
  const aiPct = total ? Math.round((aiSec / total) * 100) : 0;
  const busy = (s: ShotView) => s.clipStatus === 'queued' || s.clipStatus === 'running';

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 4/8 · AI NASKAH + TEXT TO IMAGE</p>
          <h1>Storyboard & shot list</h1>
          <p className="lede">Naskah dipecah jadi shot. Frame kunci dibuat dengan reference image karakter yang terkunci. Setujui storyboard sebelum render video, karena video adalah tahap termahal.</p>
        </div>
        <div className="vactions">
          {p.sceneCount > 1 && (
            <BatchAIButton
              action="shotlist"
              steps={p.writtenScenes.map((n) => ({ params: { sceneNo: n, replace: true }, items: [{ category: 'naskah' as const, quantity: 1 }], label: `Shot list SC ${n}` }))}
              label={p.shots.length ? `Pecah ulang per scene (${p.writtenScenes.length})` : `Pecah per scene (${p.writtenScenes.length})`}
              disabled={!p.scriptReady}
            />
          )}
          <AIButton
            action="shotlist"
            params={{ replace: p.shots.length > 0 }}
            items={[{ category: 'naskah', quantity: Math.max(1, p.sceneCount) }]}
            label={p.shots.length ? 'Pecah ulang jadi shot' : 'Pecah naskah jadi shot list'}
            variant={p.shots.length ? 'secondary' : 'primary'}
            disabled={!p.scriptReady}
          />
          {missing.length > 0 && (
            <AIButton action="keyframe" params={{ shotIds: missing.map((s) => s.id) }} items={[{ category: 'image', quantity: missing.length }]} label={`Buat ${missing.length} frame kunci`} />
          )}
        </div>
      </header>
      {!p.scriptReady && <p className="note warn">Tulis naskah dulu di tahap 3.</p>}
      {anyUnlocked && <p className="note warn">Ada shot dengan karakter yang belum dikunci. <Link href={`/studio/${p.projectId}/karakter`}><b>Kunci wajah & suara</b></Link> dulu supaya frame kunci konsisten.</p>}
      {p.shots.length > 0 && (
        <>
          <div className="stats">
            <div className="stat"><small>Shot</small><b>{p.shots.length}</b><span>{p.sceneCount} scene</span></div>
            <div className="stat"><small>Durasi total</small><b>{timecode(total)}</b><span>{fmt1(total)} detik</span></div>
            <div className="stat"><small>Frame kunci</small><b>{p.shots.filter((s) => s.keyframeStatus === 'ready').length}/{p.shots.length}</b><span>siap</span></div>
            <div className="stat"><small>Disetujui</small><b>{approved}/{p.shots.length}</b><span>siap render video</span></div>
            <div className="stat"><small>Video AI</small><b>{aiPct}%</b><span>{fmt1(aiSec)} dtk AI · {fmt1(total - aiSec)} dtk kamera gratis</span></div>
          </div>
          <p className="small muted">
            <b style={{ color: 'var(--text)' }}>Hybrid gerak:</b> shot <span className="pill acc">Video AI</span> dihidupkan model image-to-video (ditagih per detik).
            Shot <span className="pill">Gerak kamera</span> memakai frame kunci dengan gerak kamera halus, tanpa biaya video AI. Pakai Video AI untuk aksi, ekspresi, dan close-up bicara.
          </p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="filters">
              <button className={`btn sm ${filter === 0 ? 'primary' : ''}`} onClick={() => setFilter(0)}>Semua</button>
              {Array.from({ length: p.sceneCount }, (_, i) => (
                <button key={i} className={`btn sm ${filter === i + 1 ? 'primary' : ''}`} onClick={() => setFilter(i + 1)}>SC {i + 1}</button>
              ))}
            </div>
            {filter > 0 && p.writtenScenes.includes(filter) && (
              <AIButton action="shotlist" params={{ sceneNo: filter, replace: true }} items={[{ category: 'naskah', quantity: 1 }]} label={`Pecah ulang SC ${filter}`} variant="secondary" size="sm" />
            )}
            <button className="btn sm" disabled={pending || !p.shots.some((s) => s.keyframeStatus === 'ready' && !s.approved)} onClick={() => act(() => approveAllShots(p.episodeId))}>
              Setujui semua frame siap
            </button>
          </div>
          <div className="board">
            {shown.map((s) => (
              <article className="shot" key={s.id}>
                <div className={`frame ${ratioClass(p.aspect)}`}>
                  {s.keyframeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.keyframeUrl} alt={s.description} loading="lazy" />
                  ) : (
                    <div className="empty-frame">{s.keyframeStatus === 'queued' || s.keyframeStatus === 'running' ? 'Membuat frame…' : s.keyframeStatus === 'failed' ? 'Gagal, coba lagi' : 'Frame belum dibuat'}</div>
                  )}
                  <span className="no">#{s.no} · SC{s.sceneNo}</span>
                  <span className="dur">{fmt1(s.durationSec)}s</span>
                </div>
                <div className="meta">
                  <div className="t">
                    <span className="pill acc">{s.type}</span>
                    <span className="pill">{s.camera}</span>
                    {s.approved && <span className="pill good">Disetujui</span>}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label={`Cara gerak shot ${s.no}`}>
                    <button className={`btn sm ${s.motion === 'ai' ? 'primary' : 'ghost'}`} aria-pressed={s.motion === 'ai'} disabled={pending || busy(s)} onClick={() => s.motion !== 'ai' && act(() => updateShot(s.id, { motion: 'ai' }))}>Video AI</button>
                    <button className={`btn sm ${s.motion === 'camera' ? 'primary' : 'ghost'}`} aria-pressed={s.motion === 'camera'} disabled={pending || busy(s)} onClick={() => s.motion !== 'camera' && act(() => updateShot(s.id, { motion: 'camera' }))}>Gerak kamera</button>
                    {s.motion === 'camera' && (
                      <select aria-label={`Gerak kamera shot ${s.no}`} value={s.cameraMove} disabled={pending || busy(s)} onChange={(e) => act(() => updateShot(s.id, { cameraMove: e.target.value as CameraMove }))} style={{ width: 'auto', padding: '2px 6px' }}>
                        {CAMERA_MOVES.map((m) => <option key={m} value={m}>{MOVE_LABEL[m]}</option>)}
                      </select>
                    )}
                  </div>
                  <p>{s.description}</p>
                  {s.dialog && <p style={{ color: 'var(--text)', fontStyle: 'italic' }}>“{s.dialog}”</p>}
                  {s.characters.length > 0 && <p className="small faint">{s.characters.join(', ')}</p>}
                  <div className="acts">
                    {s.keyframeStatus === 'ready' && (
                      <button className="btn sm" disabled={pending} onClick={() => act(() => updateShot(s.id, { approved: !s.approved }))}>{s.approved ? 'Batal setuju' : 'Setujui'}</button>
                    )}
                    {!s.unlocked && s.clipStatus !== 'ready' && (s.keyframeStatus === 'ready' || s.keyframeStatus === 'failed') && (
                      <AIButton action="keyframe" params={{ shotIds: [s.id] }} items={[{ category: 'image', quantity: 1 }]} label="Ulang" variant="secondary" size="sm" />
                    )}
                    <button className="btn sm ghost" aria-label="Geser ke kiri" disabled={pending} onClick={() => act(() => moveShot(s.id, -1))}>←</button>
                    <button className="btn sm ghost" aria-label="Geser ke kanan" disabled={pending} onClick={() => act(() => moveShot(s.id, 1))}>→</button>
                    <button className="btn sm ghost danger" aria-label="Hapus shot" disabled={pending} onClick={() => confirm(`Hapus shot #${s.no}?`) && act(() => deleteShot(s.id))}>✕</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {approved > 0 && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Link className="btn" href={`/studio/${p.projectId}/visual${p.episode > 1 ? `?ep=${p.episode}` : ''}`}>Lanjut ke produksi visual →</Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
