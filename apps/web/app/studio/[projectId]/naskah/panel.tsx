'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { addBlankScene, restoreScriptVersion, saveScene } from '@/app/actions';
import { EpisodeSwitch } from '@/components/episode-switch';
import { ScreenplayPage } from '@/components/screenplay';
import { AIButton, BatchAIButton } from '@/components/use-ai';
import { fmt, timecode, useToast } from '@/components/ui';
import type { ContinuityOutput } from '@atomo/prompt-engine';

const QUICK = ['Perpendek dialog', 'Tambah ketegangan', 'Lebih natural, bahasa sehari-hari', 'Tambah jeda sebelum twist', 'Perkuat hook di awal'];
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const headingOf = (h: string) => h.replace(/^(INT|EXT|INT\/EXT)\.\s*/i, '');

export function ScriptPanel(p: {
  projectId: string; episodeId: string; episode: { number: number; title: string; synopsis: string };
  episodes: { number: number; title: string }[]; scenes: { heading: string; body: string }[]; summaries: string[];
  shotsPerScene: Record<number, number>; hasCharacters: boolean; versions: { version: number; note: string; at: string }[];
}) {
  const [sel, setSel] = useState(0);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const [instruction, setInstruction] = useState('');
  const [stream, setStream] = useState<{ sc: number; text: string } | null>(null);
  const [issues, setIssues] = useState<ContinuityOutput['issues'] | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const scene = p.scenes[sel];
  const total = p.scenes.reduce((a, s) => a + words(s.body), 0);
  useEffect(() => setStream(null), [p.scenes]);
  useEffect(() => {
    if (sel >= p.scenes.length && p.scenes.length) setSel(p.scenes.length - 1);
  }, [p.scenes.length, sel]);

  const body = stream && stream.sc === sel ? stream.text : (scene?.body ?? '');

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 3/8 · AI NASKAH</p>
          <h1>Naskah Eps {p.episode.number}{p.episode.title && p.episode.title !== `Episode ${p.episode.number}` ? `: ${p.episode.title}` : ''}</h1>
          <p className="lede">
            {p.scenes.length} scene · {fmt(total)} kata · perkiraan {timecode(total / 2.6)} durasi bicara dan aksi.
          </p>
        </div>
        <div className="vactions">
          <EpisodeSwitch projectId={p.projectId} episodes={p.episodes} current={p.episode.number} />
          {issues && (issues.length ? <span className="pill warn">{issues.length} catatan kontinuitas</span> : <span className="pill good">Kontinuitas: 0 konflik</span>)}
          {p.scenes.some((s) => s.body) && (
            <AIButton action="continuity" params={{}} items={[{ category: 'naskah', quantity: 1 }]} label="Cek kontinuitas" variant="secondary" onData={(d) => setIssues((d as ContinuityOutput).issues)} />
          )}
          {p.scenes.filter((s) => !s.body).length > 1 && (
            <BatchAIButton
              action="scene"
              steps={p.scenes.flatMap((s, i) => (s.body ? [] : [{ params: { sceneNo: i + 1 }, items: [{ category: 'naskah' as const, quantity: 1 }], label: `Tulis SC ${i + 1}` }]))}
              label={`Tulis ${p.scenes.filter((s) => !s.body).length} scene kosong`}
              variant="primary"
            />
          )}
          <AIButton
            action="outline"
            params={{}}
            items={[{ category: 'naskah', quantity: 1 }]}
            label={p.scenes.length ? 'Outline ulang' : 'Buat outline episode'}
            variant={p.scenes.length ? 'secondary' : 'primary'}
            disabled={!p.hasCharacters}
          />
        </div>
      </header>
      {!p.hasCharacters && <p className="note warn">Buat karakter dulu di tahap 2 supaya naskah memakai tokoh yang terkunci.</p>}
      {p.episode.synopsis && <p className="note"><b>Sinopsis:</b> {p.episode.synopsis}</p>}
      {issues && issues.length > 0 && (
        <section className="card">
          <h2>Catatan kontinuitas</h2>
          <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
            {issues.map((i, k) => (
              <li key={k}>
                <span className={`pill ${i.severity === 'error' ? 'crit' : i.severity === 'warn' ? 'warn' : 'info'}`}>{i.severity}</span> {i.sceneNo ? `SC ${i.sceneNo}: ` : ''}
                {i.message} {i.suggestion && <span className="muted">→ {i.suggestion}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {p.scenes.length === 0 ? (
        <section className="card">
          <h2>Belum ada scene</h2>
          <p className="muted">Mulai dengan outline AI (scene heading + ringkasan), lalu tulis tiap scene. Atau tulis manual.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={pending} onClick={() => start(async () => void (await addBlankScene(p.episodeId)))}>Tulis manual</button>
          </div>
        </section>
      ) : (
        <div className="grid-side">
          <div className="scenes">
            {p.scenes.map((s, i) => (
              <button key={i} className={`scene-item ${i === sel ? 'on' : ''}`} onClick={() => { setSel(i); setEdit(false); }}>
                <b>SC {i + 1}</b>
                <span>{headingOf(s.heading)}</span>
                <small>{s.body ? `${words(s.body)} kata` : 'belum ditulis'} · {p.shotsPerScene[i + 1] ?? 0} shot</small>
              </button>
            ))}
            <button className="btn ghost sm" disabled={pending} onClick={() => start(async () => { const r = await addBlankScene(p.episodeId); if (r?.ok) setSel(p.scenes.length); })}>+ Scene kosong</button>
            {p.versions.length > 1 && (
              <details className="small muted" style={{ marginTop: 8 }}>
                <summary>Riwayat versi ({p.versions.length})</summary>
                <ul style={{ paddingLeft: 16, margin: '6px 0' }}>
                  {p.versions.map((v, i) => (
                    <li key={v.version} style={{ margin: '4px 0' }}>
                      v{v.version} · {v.note || 'tanpa catatan'}{' '}
                      {i > 0 && (
                        <button className="btn ghost sm" disabled={pending} onClick={() => start(async () => { const r = await restoreScriptVersion(p.episodeId, v.version); toast(r?.ok ? `Kembali ke v${v.version}` : (r?.message ?? 'Gagal'), r?.ok ? 'ok' : 'err'); })}>
                          pulihkan
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="stack-sm" style={{ gap: 12 }}>
            {scene && !scene.body && !stream && (
              <div className="note">
                <b>SC {sel + 1}:</b> {p.summaries[sel] ?? headingOf(scene.heading)}
              </div>
            )}
            {edit ? (
              <textarea className="page-edit" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit scene ${sel + 1}`} rows={22} />
            ) : body ? (
              <ScreenplayPage text={body} typing={Boolean(stream && stream.sc === sel)} />
            ) : null}
            <div className="row">
              {!scene?.body && !edit && (
                <AIButton action="scene" params={{ sceneNo: sel + 1 }} items={[{ category: 'naskah', quantity: 1 }]} label={`Tulis SC ${sel + 1} dengan AI`} onDelta={(t) => setStream({ sc: sel, text: t })} />
              )}
              {edit ? (
                <>
                  <button className="btn primary" disabled={pending} onClick={() => start(async () => { const r = await saveScene(p.episodeId, sel + 1, draft); if (r?.ok) { setEdit(false); toast('Scene disimpan sebagai versi baru'); } else toast(r?.message ?? 'Gagal', 'err'); })}>Simpan</button>
                  <button className="btn ghost" onClick={() => setEdit(false)}>Batal</button>
                </>
              ) : (
                <button className="btn" onClick={() => { setDraft(scene?.body || `${scene?.heading ?? 'INT. LOKASI - WAKTU'}\n\n`); setEdit(true); }}>Edit manual</button>
              )}
            </div>
            {scene?.body && !edit && (
              <section className="card">
                <h2 style={{ marginBottom: 8 }}>Tulis ulang dengan AI</h2>
                <div className="rewrite">
                  <input type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="mis. buat Dimas lebih sinis, akhiri dengan ketukan keempat" maxLength={400} aria-label="Instruksi tulis ulang" />
                  <AIButton
                    action="rewrite"
                    params={{ sceneNo: sel + 1, instruction }}
                    items={[{ category: 'naskah', quantity: 1 }]}
                    label="Tulis ulang"
                    disabled={instruction.trim().length < 3}
                    onDelta={(t) => setStream({ sc: sel, text: t })}
                  />
                </div>
                <div className="quick" style={{ marginTop: 8 }}>
                  {QUICK.map((q) => <button key={q} onClick={() => setInstruction(q)}>{q}</button>)}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {p.scenes.length > 0 && p.scenes.every((s) => s.body) && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link className="btn" href={`/studio/${p.projectId}/storyboard${p.episode.number > 1 ? `?ep=${p.episode.number}` : ''}`}>Lanjut ke storyboard →</Link>
        </div>
      )}
    </>
  );
}
