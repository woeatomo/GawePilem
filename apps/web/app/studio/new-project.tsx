'use client';

import { useActionState, useState } from 'react';
import { createProject } from '@/app/actions';
import { VISUAL_STYLES, findStyle } from '@atomo/prompt-engine';
import { PRESETS, type Preset } from '@/lib/presets';
import { FORMAT_LABEL, GENRE_OPTIONS } from '@/lib/stages';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function NewProject() {
  const [state, act, pending] = useActionState(createProject, null);
  const [v, setV] = useState<Omit<Preset, 'id' | 'label'>>(PRESETS[0]!);
  const [presetId, setPresetId] = useState('anime');
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const pick = (p: Preset) => {
    setPresetId(p.id);
    setV(p);
  };

  return (
    <section className="card">
      <div className="card-h">
        <h2>Project baru</h2>
        <span className="small muted">Pilih preset, lalu sesuaikan</span>
      </div>
      <div className="quick" role="group" aria-label="Preset" style={{ marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => pick(p)} aria-pressed={presetId === p.id} style={presetId === p.id ? { borderStyle: 'solid', borderColor: 'var(--accent)', color: 'var(--text)', background: 'var(--accent-soft)' } : undefined}>
            {p.label} · {p.aspect}
          </button>
        ))}
      </div>
      <form action={act} className="stack-sm">
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="title">Judul kerja</label>
            <input id="title" name="title" type="text" required maxLength={120} placeholder={PRESETS.find((p) => p.id === presetId)?.titleHint ?? 'Judul kerja'} />
          </div>
          <div className="grid3">
            <div>
              <label className="lbl" htmlFor="format">Format</label>
              <select id="format" name="format" value={v.format} onChange={(e) => set('format', e.target.value)}>
                {Object.entries(FORMAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="genre">Genre</label>
              <select id="genre" name="genre" value={v.genre} onChange={(e) => set('genre', e.target.value)}>
                {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{cap(g)}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="style">Gaya visual</label>
              <select id="style" name="style" value={v.style} onChange={(e) => set('style', e.target.value)}>
                {[...new Set(VISUAL_STYLES.map((s) => s.group))].map((g) => (
                  <optgroup key={g} label={g}>
                    {VISUAL_STYLES.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="topic">Ide, latar, dan target penonton</label>
            <textarea id="topic" name="topic" rows={3} maxLength={2000} placeholder={v.topicHint} />
          </div>
          <div className="grid3">
            <div>
              <label className="lbl" htmlFor="aspect">Rasio master</label>
              <select id="aspect" name="aspect" value={v.aspect} onChange={(e) => set('aspect', e.target.value as Preset['aspect'])}>
                <option value="16:9">16:9 (YouTube)</option>
                <option value="9:16">9:16 vertikal</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="episodes">Jumlah episode</label>
              <input id="episodes" name="episodes" type="number" min={1} max={100} value={v.episodes} onChange={(e) => set('episodes', Number(e.target.value))} />
            </div>
            <div>
              <label className="lbl" htmlFor="duration">Durasi/eps (detik)</label>
              <input id="duration" name="duration" type="number" min={15} max={3600} value={v.duration} onChange={(e) => set('duration', Number(e.target.value))} />
            </div>
          </div>
        </div>
        <p className="small muted">Gaya <b style={{ color: 'var(--text)' }}>{findStyle(v.style).label}</b>: {findStyle(v.style).blurb}</p>
        {v.aspect === '16:9' && <p className="small muted">Master 16:9 untuk YouTube. Versi 9:16 untuk Shorts/TikTok bisa dirender dari potongan episode di tahap Editor.</p>}
        {state?.message && <p className="note crit" role="alert">{state.message}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Membuat…' : 'Buat project'}</button>
        </div>
      </form>
    </section>
  );
}
