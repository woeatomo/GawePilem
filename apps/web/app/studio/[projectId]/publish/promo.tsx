'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PromoKit } from '@atomo/prompt-engine';
import { AIButton } from '@/components/use-ai';
import { useToast } from '@/components/ui';

export interface ShortCandidate { sceneNo: number; title: string; hook: string; start: number; end: number }

const ts = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Copy({ text, label = 'Salin' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button className="btn sm ghost" onClick={() => void navigator.clipboard?.writeText(text).then(() => toast('Disalin'), () => toast('Gagal menyalin', 'err'))}>
      {label}
    </button>
  );
}

/** Kit promosi per episode: judul A/B, thumbnail, chapter otomatis, komentar pin, kandidat Shorts siap render. */
export function PromoCard(p: {
  projectId: string; episode: number; promo: PromoKit | null; chapters: string; shorts: ShortCandidate[]; hasMaster: boolean; plan: string;
  onUse: (m: { title?: string; description?: string; tags?: string }) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  const router = useRouter();
  const k = p.promo;
  const fullDesc = k ? `${k.description.replace(/\n*Konten ini dibuat dengan bantuan AI\.?\s*$/i, '')}${p.chapters ? `\n\n${p.chapters}` : ''}\n\n${k.hashtags.join(' ')}\n\nKonten ini dibuat dengan bantuan AI.`.trim() : '';

  async function renderShort(i: number, s: ShortCandidate) {
    setBusy(i);
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: p.projectId, episode: p.episode, quality: p.plan === 'free' ? '720p' : '1080p', mode: 'latest', idempotencyKey: crypto.randomUUID().replace(/-/g, ''), teaser: { start: s.start, end: s.end, aspect: '9:16', reframe: 'blur' } }),
    });
    setBusy(null);
    const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) return toast(j.error?.message ?? 'Gagal render Shorts', 'err');
    toast('Shorts masuk antrean render (gratis). Hasilnya muncul di pilihan video.', 'info');
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-h">
        <h2>Kit promosi</h2>
        <AIButton action="promo" params={{}} items={[{ category: 'naskah', quantity: 1 }]} label={k ? 'Buat ulang kit promosi' : 'Buat kit promosi'} variant={k ? 'secondary' : 'primary'} size="sm" />
      </div>
      {!k ? (
        <p className="muted small">
          AI menyiapkan 3 varian judul untuk uji A/B, teks thumbnail, deskripsi dengan chapter otomatis, tag, komentar pin yang memancing diskusi, posting komunitas, dan scene terbaik untuk dijadikan Shorts. Shorts adalah pintu masuk penonton baru ke episode panjang.
        </p>
      ) : (
        <div className="stack-sm">
          <div>
            <p className="lbl">Judul (uji A/B: pakai satu, ganti setelah 48 jam bila CTR rendah)</p>
            {k.titles.map((t) => (
              <div key={t} className="row" style={{ justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                <span>{t} <span className="small faint mono">{t.length}</span></span>
                <button className="btn sm" onClick={() => p.onUse({ title: t })}>Pakai</button>
              </div>
            ))}
          </div>
          <div className="grid2">
            <div>
              <p className="lbl">Teks thumbnail</p>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{k.thumbnailTexts.map((t) => <span key={t} className="pill acc mono">{t}</span>)}</div>
              {k.thumbnailPrompt && <p className="small muted" style={{ marginTop: 6 }}>Ide gambar: {k.thumbnailPrompt}</p>}
            </div>
            <div>
              <p className="lbl">Jadwal rilis</p>
              <p className="small">{k.bestTime || 'Rilis di hari & jam yang sama tiap minggu supaya penonton terbiasa.'}</p>
            </div>
          </div>
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="lbl">Deskripsi{p.chapters ? ' + chapter otomatis' : ''}</p>
              <span className="row" style={{ gap: 6 }}>
                <Copy text={fullDesc} />
                <button className="btn sm" onClick={() => p.onUse({ description: fullDesc, tags: k.tags.join(', ') })}>Pakai deskripsi & tag</button>
              </span>
            </div>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: 10, borderRadius: 8, maxHeight: 220, overflow: 'auto' }}>{fullDesc}</pre>
            {!p.chapters && <p className="small faint">Chapter muncul otomatis setelah timeline punya minimal 3 scene ≥ 10 detik.</p>}
          </div>
          <div className="grid2">
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><p className="lbl">Komentar pin</p><Copy text={k.pinnedComment} /></div>
              <p className="small">{k.pinnedComment}</p>
            </div>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><p className="lbl">Posting komunitas (H-1)</p><Copy text={k.communityPost} /></div>
              <p className="small">{k.communityPost}</p>
            </div>
          </div>
          <div>
            <p className="lbl">Kandidat Shorts / TikTok</p>
            {p.shorts.length === 0 && <p className="small faint">Rakit timeline dulu supaya scene punya waktu di video.</p>}
            {p.shorts.map((s, i) => (
              <div key={`${s.sceneNo}-${i}`} className="row" style={{ justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <div>
                  <b>{s.title}</b> <span className="pill mono">SC{s.sceneNo} · {ts(s.start)}–{ts(s.end)}</span>
                  <p className="small muted">{s.hook}</p>
                </div>
                <button className="btn sm" disabled={!p.hasMaster || busy !== null} onClick={() => void renderShort(i, s)}>
                  {busy === i ? 'Mengirim…' : 'Render Shorts 9:16'} <span className="cost">gratis</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <details style={{ marginTop: 12 }}>
        <summary className="small" style={{ cursor: 'pointer' }}>Checklist supaya channel bisa dimonetisasi</summary>
        <ul className="small muted" style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 4 }}>
          <li>Syarat YouTube Partner Program berubah dari waktu ke waktu; cek angka terbaru di YouTube Studio → Hasilkan uang. Umumnya butuh subscriber minimal plus jam tonton atau views Shorts dalam periode tertentu.</li>
          <li>YouTube tidak memonetisasi konten massal atau berulang. Jaga cerita tiap episode berbeda, suara narasi konsisten, dan karakter khas: itu yang membuat serial dianggap orisinal.</li>
          <li>Rilis terjadwal tetap (mis. tiap Kamis 19.00) lebih baik daripada banyak sekaligus. Satu episode panjang + 2–3 Shorts per minggu.</li>
          <li>Label konten AI selalu aktif. Jangan beli views/subscriber: melanggar aturan dan bisa membuat channel diblokir dari monetisasi.</li>
          <li>Pantau CTR thumbnail (target ≥ 4–5%) dan retensi 30 detik pertama di YouTube Studio, lalu ganti judul/thumbnail yang lemah.</li>
        </ul>
      </details>
    </section>
  );
}
