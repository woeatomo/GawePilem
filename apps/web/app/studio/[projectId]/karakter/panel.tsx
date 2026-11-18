'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteCharacter, saveBible, setCharacterLock, updateCharacter } from '@/app/actions';
import { AIButton } from '@/components/use-ai';
import { useToast } from '@/components/ui';
import { CHARREF_ANGLES } from '@/lib/ai/actions';
import { VOICES } from '@/lib/voices';

export interface CharView {
  id: string; name: string; age: number | null; role: string; traits: string[]; look: string; sampleLine: string;
  voiceId: string | null; locked: boolean; refImages: { angle: string; url: string }[]; generating: boolean;
}

function Img({ src, alt }: { src: string | undefined; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} loading="lazy" /> : null;
}

export function CharactersPanel(p: { projectId: string; logline: string; premise: string; hasResearch: boolean; chars: CharView[]; episodeCount: number }) {
  const [logline, setLogline] = useState(p.logline);
  const [pending, start] = useTransition();
  const toast = useToast();
  const act = (fn: () => Promise<{ ok: boolean; message?: string } | null>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast(r.message ?? 'Gagal', 'err');
      else if (ok) toast(ok);
    });
  const allLocked = p.chars.length > 0 && p.chars.every((c) => c.locked);

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 2/8 · AI NASKAH + TEXT TO IMAGE</p>
          <h1>Cerita & karakter</h1>
          <p className="lede">Wajah dan suara tiap karakter dikunci di sini, lalu dipakai ulang di semua scene dan episode supaya konsisten.</p>
        </div>
        <div className="vactions">
          <AIButton
            action="characters"
            params={{ count: 3 }}
            items={[{ category: 'naskah', quantity: 1 }]}
            label={p.chars.length ? 'Tambah karakter dengan AI' : 'Buat logline & karakter dengan AI'}
            disabled={!p.hasResearch}
          />
        </div>
      </header>
      {!p.hasResearch && <p className="note warn">Isi ide dan jalankan riset dulu di tahap 1 supaya karakter punya konteks.</p>}
      <section className="card">
        <div className="card-h">
          <h2>Logline</h2>
          <span className="pill">Series bible · {p.episodeCount} episode</span>
        </div>
        <textarea
          rows={2}
          aria-label="Logline"
          value={logline}
          maxLength={400}
          placeholder="Satu kalimat: siapa, ingin apa, dan apa yang menghalangi."
          onChange={(e) => setLogline(e.target.value)}
          onBlur={() => logline !== p.logline && act(() => saveBible(p.projectId, { logline }))}
        />
        {p.premise && <p className="small muted" style={{ marginTop: 8 }}>{p.premise}</p>}
      </section>
      {p.chars.length > 0 && !allLocked && (
        <p className="note">
          Untuk setiap karakter: <b>buat reference image</b> ({CHARREF_ANGLES.length} sudut), <b>pilih suara</b>, lalu <b>kunci</b>. Shot yang memuat karakter belum terkunci tidak bisa dirender.
        </p>
      )}
      <div className="chars">
        {p.chars.map((c) => {
          const front = c.refImages[0]?.url;
          return (
            <article className="char" key={c.id}>
              <div>
                <div className="portrait">{front ? <Img src={front} alt={`Wajah ${c.name}`} /> : c.generating ? 'Membuat…' : 'Belum ada wajah'}</div>
                <div className="angles">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <Img src={c.refImages[i]?.url} alt={`${c.name} ${CHARREF_ANGLES[i]}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="crow">
                  <h3>{c.name}</h3>
                  {c.age !== null && <span className="muted small">{c.age} th</span>}
                  {c.locked ? <span className="pill acc">Wajah & suara dikunci</span> : <span className="pill">Belum dikunci</span>}
                </div>
                <p className="role">{c.role}</p>
                <div className="tags">{c.traits.map((t) => <span key={t} className="pill">{t}</span>)}</div>
                <p className="look">{c.look}</p>
                <div className="voice">
                  <select
                    aria-label={`Suara ${c.name}`}
                    value={c.voiceId ?? ''}
                    disabled={c.locked || pending}
                    onChange={(e) => act(() => updateCharacter(c.id, { voiceId: e.target.value }), 'Suara diperbarui')}
                  >
                    <option value="">Pilih suara…</option>
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    {c.voiceId && !VOICES.some((v) => v.id === c.voiceId) && <option value={c.voiceId}>Suara kustom ({c.voiceId.slice(0, 6)}…)</option>}
                  </select>
                </div>
                {c.sampleLine && <blockquote>“{c.sampleLine}”</blockquote>}
                <div className="row" style={{ marginTop: 10 }}>
                  {!c.locked && (
                    <AIButton
                      action="charref"
                      params={{ characterId: c.id }}
                      items={[{ category: 'image', quantity: CHARREF_ANGLES.length }]}
                      label={c.refImages.length ? 'Buat ulang wajah' : 'Buat reference image'}
                      variant="secondary"
                      size="sm"
                      disabled={c.generating}
                    />
                  )}
                  {c.locked ? (
                    <button className="btn sm ghost" disabled={pending} onClick={() => act(() => setCharacterLock(c.id, false), `${c.name} dibuka kuncinya`)}>Buka kunci</button>
                  ) : (
                    <button className="btn sm" disabled={pending || !c.refImages.length || !c.voiceId} onClick={() => act(() => setCharacterLock(c.id, true), `${c.name} dikunci`)}>
                      Kunci wajah & suara
                    </button>
                  )}
                  {!c.locked && (
                    <button className="btn sm ghost danger" disabled={pending} onClick={() => confirm(`Hapus ${c.name}?`) && act(() => deleteCharacter(c.id), 'Karakter dihapus')}>
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {allLocked && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link className="btn" href={`/studio/${p.projectId}/naskah`}>Lanjut ke naskah →</Link>
        </div>
      )}
    </>
  );
}
