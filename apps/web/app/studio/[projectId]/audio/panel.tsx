'use client';

import Link from 'next/link';
import { AIButton } from '@/components/use-ai';
import { fmt1 } from '@/components/ui';

interface L {
  id: string; sceneNo: number; character: string; hue: number; text: string; estimatedSec: number; voiceReady: boolean; known: boolean;
  url: string | null; stale: boolean; durationMs: number | null;
}

export function AudioPanel({ projectId, lines }: { projectId: string; lines: L[] }) {
  const todo = lines.filter((l) => !l.url && l.voiceReady);
  const sec = todo.reduce((a, l) => a + l.estimatedSec, 0);
  const blocked = lines.filter((l) => !l.voiceReady);
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">TAHAP 6/8 · AI VOICE OVER</p>
          <h1>Audio & dialog</h1>
          <p className="lede">Setiap baris dialog diisi suara karakter yang sudah dikunci. Ditagih per menit audio.</p>
        </div>
        <div className="vactions">
          <AIButton action="vo" params={{ lineIds: todo.map((l) => l.id) }} items={[{ category: 'vo', quantity: Math.round((sec / 60) * 100) / 100 }]} label={`Generate ${todo.length} baris VO · ${fmt1(sec)} dtk`} disabled={!todo.length} />
        </div>
      </header>
      {blocked.length > 0 && (
        <p className="note warn">
          {blocked.length} baris belum bisa diisi karena suara tokohnya belum dikunci atau tokoh tidak ada di sheet. <Link href={`/studio/${projectId}/karakter`}><b>Atur di tahap karakter</b></Link>.
        </p>
      )}
      <section className="card">
        <div className="card-h">
          <h2>Baris dialog</h2>
          <span className="pill">{lines.filter((l) => l.url).length}/{lines.length} siap</span>
        </div>
        {lines.length === 0 ? (
          <p className="muted">Belum ada dialog. Tulis naskah dulu.</p>
        ) : (
          <div className="lines">
            {lines.map((l) => (
              <div className="line" key={l.id}>
                <div className="who">
                  <span className="av" style={{ background: `hsl(${l.hue} 40% 45%)` }} />
                  {l.character} <span className="faint small mono">SC{l.sceneNo}</span>
                </div>
                <div className="txt">{l.text}</div>
                <div className="sec">{fmt1(l.durationMs ? l.durationMs / 1000 : l.estimatedSec)}s</div>
                <div>
                  {l.url ? <audio src={l.url} controls preload="none" style={{ height: 30, maxWidth: 220 }} /> : l.stale ? <span className="pill warn">teks berubah</span> : !l.voiceReady ? <span className="pill">suara belum dikunci</span> : <span className="pill">belum</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="note">Musik latar dan efek suara: unggah file bebas royalti di Fase 2. Render tetap jalan tanpa musik.</p>
    </>
  );
}
