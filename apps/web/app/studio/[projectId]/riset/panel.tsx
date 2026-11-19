'use client';

import Link from 'next/link';
import { useState } from 'react';
import { saveBible } from '@/app/actions';
import { AIButton } from '@/components/use-ai';
import { MdLite } from '@/components/md-lite';
import { useToast } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/stages';

export function ResearchPanel(p: { projectId: string; topic: string; research: string; meta: { format: string; genre: string; style: string; aspect: string }; model: string }) {
  const [topic, setTopic] = useState(p.topic);
  const [stream, setStream] = useState<string | null>(null);
  const toast = useToast();
  const shown = stream ?? p.research;
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 1/8 · AI NASKAH</p>
          <h1>Riset cerita</h1>
          <p className="lede">Kumpulkan latar budaya, mitos, dan hook pembuka sebelum menulis. Hasilnya dipakai sebagai konteks oleh semua tahap berikutnya.</p>
        </div>
        <div className="vactions">
          <AIButton
            action="research"
            params={{ topic }}
            items={[{ category: 'naskah', quantity: 1 }]}
            label={p.research ? 'Riset ulang dengan AI' : 'Riset dengan AI'}
            disabled={topic.trim().length < 10}
            onDelta={(t) => setStream(t)}
          />
        </div>
      </header>
      <div className="grid2">
        <section className="card">
          <h2>Ide & batasan</h2>
          <label className="lbl" htmlFor="topic">Topik, latar, dan target penonton</label>
          <textarea
            id="topic"
            rows={7}
            value={topic}
            maxLength={2000}
            onChange={(e) => setTopic(e.target.value)}
            onBlur={async () => {
              if (topic !== p.topic) {
                const r = await saveBible(p.projectId, { topic });
                if (!r?.ok) toast(r?.message ?? 'Gagal menyimpan', 'err');
              }
            }}
          />
          <div className="tags" style={{ marginTop: 12 }}>
            <span className="pill">{FORMAT_LABEL[p.meta.format] ?? p.meta.format}</span>
            <span className="pill">{p.meta.genre}</span>
            <span className="pill">{p.meta.style}</span>
            <span className="pill">{p.meta.aspect}</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Model: {p.model}</p>
        </section>
        <section className="card">
          <div className="card-h">
            <h2>Hasil riset</h2>
            {shown ? <span className="pill good">Dipakai sebagai konteks</span> : <span className="pill">Belum ada</span>}
          </div>
          <div className={`out ${stream !== null && stream !== p.research ? 'typing' : ''}`} aria-live="polite">
            {shown ? <MdLite text={shown} /> : <p className="muted">Tulis ide di kiri lalu klik “Riset dengan AI”. Hasil riset muncul di sini secara langsung.</p>}
          </div>
          {p.research && (
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <Link className="btn" href={`/studio/${p.projectId}/karakter`}>Lanjut ke karakter →</Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
