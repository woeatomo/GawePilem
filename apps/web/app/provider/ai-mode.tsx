'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AI_PROFILE_META, AI_PROFILES, creditsToRupiah, episodeEstimate, VIDEO_RESOLUTION, type AIProfile } from '@atomo/credits';
import { fmt, rupiah, useToast } from '@/components/ui';
import { useStudio } from '@/components/studio-context';

/** Pilih mode AI satu klik. Estimasi memakai tarif aktif, episode 20 menit dengan 40% video AI. */
export function AIModePicker({ current, models }: { current: AIProfile | null; models: Record<AIProfile, string[]> }) {
  const { rates } = useStudio();
  const [busy, setBusy] = useState<AIProfile | null>(null);
  const toast = useToast();
  const router = useRouter();
  async function pick(p: AIProfile) {
    if (p === current) return;
    setBusy(p);
    const res = await fetch('/api/provider/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: p }) });
    setBusy(null);
    const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) return toast(j.error?.message ?? 'Gagal mengganti mode', 'err');
    toast(`Mode AI: ${AI_PROFILE_META[p].label}`);
    router.refresh();
  }
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <h2>Mode AI</h2>
        <span className="small muted">{current ? `Aktif: ${AI_PROFILE_META[current].label}` : 'Aktif: campuran (diatur manual di bawah)'}</span>
      </div>
      <div className="aimodes">
        {AI_PROFILES.map((p) => {
          const m = AI_PROFILE_META[p];
          const ep = episodeEstimate({ minutes: 20, aiShare: 0.4 }, m.tiers, rates).total;
          const micro = episodeEstimate({ minutes: 1.5, aiShare: 0.6 }, m.tiers, rates).total;
          return (
            <button key={p} className="aimode" aria-pressed={current === p} disabled={busy !== null} onClick={() => void pick(p)}>
              <b>{m.label}{p === 'gacor' ? ' 🔥' : ''}</b>
              <span className="small muted">{m.blurb}</span>
              <span className="small">Video {VIDEO_RESOLUTION[m.tiers.video]} · {models[p].join(' · ')}</span>
              <span className="k">±{rupiah(creditsToRupiah(ep))}<span className="small muted"> /episode 20 mnt</span></span>
              <span className="small faint">Microdrama 1,5 menit ±{rupiah(creditsToRupiah(micro))} · {fmt(ep)} kredit/eps</span>
              {busy === p && <span className="small">Menyimpan…</span>}
            </button>
          );
        })}
      </div>
      <p className="small faint" style={{ marginTop: 10 }}>Bisa dicampur: pakai Hemat untuk draft, lalu Gacor sebelum render final. Pengaturan per kategori di bawah tetap bisa diubah manual.</p>
    </section>
  );
}
