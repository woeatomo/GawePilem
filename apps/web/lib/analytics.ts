import { z } from 'zod';

/** Snapshot metrik per video (diisi Worker job dari YouTube Data + Analytics API). */
export const videoMetricsSchema = z.object({
  views: z.number().default(0),
  likes: z.number().default(0),
  comments: z.number().default(0),
  privacy: z.string().nullable().default(null),
  minutesWatched: z.number().optional(),
  avgViewDurationSec: z.number().optional(),
  avgViewPct: z.number().optional(),
  subsGained: z.number().optional(),
});
export type VideoMetrics = z.infer<typeof videoMetricsSchema>;

export const channelMetricsSchema = z.object({
  subscribers: z.number().default(0),
  views: z.number().default(0),
  videos: z.number().default(0),
  watchMinutes365: z.number().nullable().default(null),
  analyticsError: z.enum(['scope', 'unavailable']).nullable().default(null),
});
export type ChannelMetrics = z.infer<typeof channelMetricsSchema>;

/**
 * Ambang YouTube Partner Program (jalur video panjang). Bisa berubah: UI selalu mengarahkan
 * ke YouTube Studio untuk angka resmi. Jam tonton di sini perkiraan (semua video publik & non-publik).
 */
export const YPP = { subscribers: 1000, watchHours: 4000 } as const;

export function yppProgress(c: ChannelMetrics) {
  const hours = c.watchMinutes365 === null ? null : Math.round(c.watchMinutes365 / 60);
  return {
    subscribers: { value: c.subscribers, target: YPP.subscribers, pct: Math.min(100, Math.round((c.subscribers / YPP.subscribers) * 100)) },
    watchHours: hours === null ? null : { value: hours, target: YPP.watchHours, pct: Math.min(100, Math.round((hours / YPP.watchHours) * 100)) },
  };
}

export interface VideoRow { id: string; variant: 'youtube' | 'shorts' | 'tiktok' | string; publishedAt: string | null; m: VideoMetrics }

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Saran singkat per video, dibandingkan dengan video lain di varian yang sama. */
export function insights(rows: VideoRow[], now = Date.now()): Record<string, { tone: 'good' | 'warn' | 'info'; text: string }[]> {
  const out: Record<string, { tone: 'good' | 'warn' | 'info'; text: string }[]> = {};
  const med = new Map<string, number>();
  for (const v of new Set(rows.map((r) => r.variant))) med.set(v, median(rows.filter((r) => r.variant === v).map((r) => r.m.views)));
  for (const r of rows) {
    const list: { tone: 'good' | 'warn' | 'info'; text: string }[] = [];
    const ageDays = r.publishedAt ? (now - new Date(r.publishedAt).getTime()) / 86_400_000 : 0;
    const m = med.get(r.variant) ?? 0;
    if (r.m.privacy === 'private') list.push({ tone: 'info', text: 'Masih private: belum bisa ditonton publik.' });
    if (r.m.avgViewPct !== undefined && r.m.views >= 20) {
      if (r.variant === 'shorts' && r.m.avgViewPct >= 80) list.push({ tone: 'good', text: 'Shorts ditonton hampir habis: buat 2–3 Shorts lagi dari episode ini.' });
      if (r.variant !== 'shorts' && r.m.avgViewPct < 30) list.push({ tone: 'warn', text: 'Penonton cepat pergi: perkuat 30 detik pertama, langsung ke konflik.' });
      if (r.variant !== 'shorts' && r.m.avgViewPct >= 50) list.push({ tone: 'good', text: 'Retensi bagus: pertahankan pola pembuka & tempo ini.' });
    }
    if (rows.filter((x) => x.variant === r.variant).length >= 3 && ageDays >= 3 && m > 0) {
      if (r.m.views >= m * 2) list.push({ tone: 'good', text: 'Views 2× rata-rata: pakai lagi gaya judul & thumbnail ini.' });
      else if (r.m.views < m * 0.5) list.push({ tone: 'warn', text: 'Di bawah rata-rata: ganti judul ke varian lain dari kit promosi & perbarui thumbnail.' });
    }
    if (r.m.views >= 100 && r.m.likes + r.m.comments < r.m.views * 0.02) list.push({ tone: 'info', text: 'Interaksi rendah: pin komentar pertanyaan dari kit promosi.' });
    out[r.id] = list;
  }
  return out;
}
