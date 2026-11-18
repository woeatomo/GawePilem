'use client';

import { useActionState, useState } from 'react';
import { createProject } from '@/app/actions';
import { FORMAT_LABEL, GENRE_OPTIONS, STYLE_OPTIONS } from '@/lib/stages';

export function NewProject() {
  const [state, act, pending] = useActionState(createProject, null);
  const [format, setFormat] = useState('microdrama');
  return (
    <section className="card">
      <div className="card-h">
        <h2>Project baru</h2>
        <span className="pill acc">Mulai dari microdrama 9:16: paling cepat dan hemat</span>
      </div>
      <form action={act} className="stack-sm">
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="title">Judul kerja</label>
            <input id="title" name="title" type="text" required maxLength={120} placeholder="Kamar 7" />
          </div>
          <div className="grid3">
            <div>
              <label className="lbl" htmlFor="format">Format</label>
              <select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value)}>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="genre">Genre</label>
              <select id="genre" name="genre" defaultValue="horor">
                {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g[0]!.toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="style">Gaya visual</label>
              <select id="style" name="style">
                {STYLE_OPTIONS.map((g) => <option key={g} value={g}>{g[0]!.toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="topic">Ide, latar, dan target penonton</label>
            <textarea id="topic" name="topic" rows={3} maxLength={2000} placeholder="Kos-kosan tua di Yogyakarta. Mitos kamar nomor 7 yang selalu kosong, dengan tiga ketukan tiap jam 03.00. Penonton 18–34 tahun." />
          </div>
          <div className="grid3">
            <div>
              <label className="lbl" htmlFor="aspect">Rasio</label>
              <select id="aspect" name="aspect" defaultValue={format === 'microdrama' ? '9:16' : '16:9'} key={format}>
                <option value="9:16">9:16 vertikal</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="episodes">Jumlah episode</label>
              <input id="episodes" name="episodes" type="number" min={1} max={100} defaultValue={format === 'microdrama' || format === 'serial' ? 10 : 1} key={format + 'e'} />
            </div>
            <div>
              <label className="lbl" htmlFor="duration">Durasi/eps (detik)</label>
              <input id="duration" name="duration" type="number" min={15} max={3600} defaultValue={format === 'microdrama' ? 90 : 300} key={format + 'd'} />
            </div>
          </div>
        </div>
        {state?.message && <p className="note crit" role="alert">{state.message}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Membuat…' : 'Buat project'}</button>
        </div>
      </form>
    </section>
  );
}
