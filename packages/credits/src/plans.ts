import { estimate, RUPIAH_PER_CREDIT, type Estimate } from './estimate';
import type { Category, RateTable, Tier } from './types';

// ---------------------------------------------------------------------------
// Mode AI satu klik: Hemat / Seimbang / Gacor → tier per kategori.
// ---------------------------------------------------------------------------

export const AI_PROFILES = ['hemat', 'seimbang', 'gacor'] as const;
export type AIProfile = (typeof AI_PROFILES)[number];

export const AI_PROFILE_META: Record<AIProfile, { label: string; blurb: string; tiers: Record<Category, Tier> }> = {
  hemat: {
    label: 'Hemat',
    blurb: 'Model cepat & murah, video 480p. Cocok untuk draft, uji ide, dan channel baru.',
    tiers: { naskah: 'hemat', vo: 'hemat', image: 'hemat', video: 'hemat' },
  },
  seimbang: {
    label: 'Seimbang',
    blurb: 'Kualitas layak tayang, video 720p, wajah konsisten. Pilihan default untuk serial rutin.',
    tiers: { naskah: 'standar', vo: 'standar', image: 'standar', video: 'standar' },
  },
  gacor: {
    label: 'Gacor',
    blurb: 'Model terbaik di tiap kategori, video 1080p. Untuk episode pilot, trailer, dan rilis andalan.',
    tiers: { naskah: 'premium', vo: 'premium', image: 'premium', video: 'premium' },
  },
};

/** Profil yang cocok dengan tier saat ini, atau null bila campuran (diatur manual). */
export function detectProfile(tiers: Record<Category, Tier>): AIProfile | null {
  return AI_PROFILES.find((p) => (Object.keys(tiers) as Category[]).every((c) => AI_PROFILE_META[p].tiers[c] === tiers[c])) ?? null;
}

// ---------------------------------------------------------------------------
// Estimasi biaya satu episode (untuk halaman paket & pemilihan mode AI).
// ---------------------------------------------------------------------------

export interface EpisodeAssumptions {
  minutes: number;
  /** Porsi durasi yang memakai video AI (sisanya gerak kamera gratis). 0..1 */
  aiShare: number;
  /** Cadangan retake/generate ulang. Default 20%. */
  retake?: number;
}

/**
 * Perkiraan kebutuhan satu episode: ±1,5 scene/menit (tulis + shot list per scene),
 * ±15 shot/menit (frame kunci), dialog ±70% durasi, plus cadangan retake.
 */
export function episodeQuantities(a: EpisodeAssumptions): Record<Category, number> {
  const r = 1 + (a.retake ?? 0.2);
  const scenes = Math.max(1, Math.ceil(a.minutes * 1.5));
  return {
    naskah: scenes * 2 + 3,
    image: Math.ceil(a.minutes * 15 * r),
    video: Math.ceil(a.minutes * 60 * Math.min(1, Math.max(0, a.aiShare)) * r),
    vo: Math.round(a.minutes * 0.7 * 100) / 100,
  };
}

export function episodeEstimate(a: EpisodeAssumptions, tiers: Record<Category, Tier>, rates: RateTable): Estimate {
  const q = episodeQuantities(a);
  return estimate((Object.keys(q) as Category[]).map((c) => ({ category: c, tier: tiers[c], quantity: q[c], billingMode: 'saldo' as const })), rates);
}

// ---------------------------------------------------------------------------
// Katalog paket & langganan. Harga prabayar per periode (QRIS/VA/e-wallet tidak auto-debit):
// perpanjangan diingatkan di aplikasi. Kredit paket langsung masuk dan berlaku 12 bulan (FIFO).
// ---------------------------------------------------------------------------

export type PlanTier = 'free' | 'creator' | 'pro' | 'studio';

export interface PlanOffer {
  id: string;
  kind: 'langganan' | 'serial';
  tier: Exclude<PlanTier, 'free'>;
  name: string;
  months: 1 | 3;
  priceIdr: number;
  credits: number;
  /** Untuk paket serial: jumlah episode 20 menit (Seimbang, hybrid 40%) yang tertutup kreditnya. */
  episodes?: number;
  highlight?: boolean;
  features: string[];
}

export const PLAN_FEATURES: Record<PlanTier, { label: string; features: string[] }> = {
  free: { label: 'Gratis', features: ['Semua tahap produksi', 'Render 720p dengan watermark', 'Publish manual ke YouTube', 'Bayar kredit sesuai pakai'] },
  creator: { label: 'Creator', features: ['Tanpa watermark', 'Render 1080p', 'Teaser Shorts 9:16', 'Kit promosi AI per episode'] },
  pro: { label: 'Pro', features: ['Semua fitur Creator', 'Publish terjadwal', 'Prioritas antrean render', 'Template serial & aset dipakai ulang'] },
  studio: { label: 'Studio', features: ['Semua fitur Pro', 'Volume besar untuk banyak channel', 'Dukungan langsung', 'Workspace tim (segera)'] },
};

/** Diskon prabayar 3 bulan. */
export const QUARTER_DISCOUNT = 0.1;

const monthly = (id: string, tier: PlanOffer['tier'], priceIdr: number, highlight = false): PlanOffer[] => {
  const credits = Math.round(priceIdr / RUPIAH_PER_CREDIT);
  const base = { kind: 'langganan' as const, tier, name: PLAN_FEATURES[tier].label, features: PLAN_FEATURES[tier].features, ...(highlight ? { highlight } : {}) };
  return [
    { ...base, id: `${id}-1m`, months: 1, priceIdr, credits },
    { ...base, id: `${id}-3m`, months: 3, priceIdr: Math.round((priceIdr * 3 * (1 - QUARTER_DISCOUNT)) / 1000) * 1000, credits: credits * 3 },
  ];
};

const serial = (id: string, name: string, episodes: number, priceIdr: number, credits: number, highlight = false): PlanOffer => ({
  id, kind: 'serial', tier: 'pro', name, months: 1, priceIdr, credits, episodes, ...(highlight ? { highlight } : {}),
  features: [`Kredit untuk ±${episodes} episode 20 menit`, 'Semua fitur Pro', 'Bonus kredit dibanding top-up biasa'],
});

/** Usulan harga awal; wajib dikalibrasi setelah episode pilot dengan tagihan provider asli. */
export const PLAN_OFFERS: readonly PlanOffer[] = [
  ...monthly('creator', 'creator', 149_000),
  ...monthly('pro', 'pro', 499_000, true),
  ...monthly('studio', 'studio', 1_490_000),
  serial('serial-bulanan', 'Serial Bulanan', 1, 1_600_000, 17_000),
  serial('serial-dwimingguan', 'Serial Dua Mingguan', 2, 2_900_000, 33_000),
  serial('serial-mingguan', 'Serial Mingguan', 4, 5_500_000, 64_000, true),
];

export function findOffer(id: string): PlanOffer | undefined {
  return PLAN_OFFERS.find((o) => o.id === id);
}

export const TIER_RANK: Record<PlanTier, number> = { free: 0, creator: 1, pro: 2, studio: 3 };
