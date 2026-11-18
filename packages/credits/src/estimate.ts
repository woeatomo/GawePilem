import { CATEGORIES, type BillingMode, type Category, type RateTable, type Tier } from './types';

/** Aksi di atas ambang ini wajib dikonfirmasi user sebelum jalan. */
export const CONFIRMATION_THRESHOLD = 150;

/** 1 kredit = Rp100. */
export const RUPIAH_PER_CREDIT = 100;

export interface EstimateItem {
  category: Category;
  tier: Tier;
  /** Jumlah satuan: scene/aksi, menit audio, gambar, atau detik video. */
  quantity: number;
  billingMode: BillingMode;
  label?: string;
}

export interface EstimateLine extends EstimateItem {
  unitCredits: number;
  credits: number;
}

export interface Estimate {
  lines: EstimateLine[];
  byCategory: Record<Category, number>;
  total: number;
  requiresConfirmation: boolean;
}

export class EstimateError extends Error {}

export function emptyByCategory(): Record<Category, number> {
  return { naskah: 0, vo: 0, image: 0, video: 0 };
}

/**
 * Hitung kredit satu item. Pembulatan ke atas per item supaya user tidak pernah
 * ditagih kurang dari tarif (mis. 0,4 menit VO × 26 = 10,4 → 11 kredit).
 */
export function estimateLine(item: EstimateItem, rates: RateTable): EstimateLine {
  if (!Number.isFinite(item.quantity) || item.quantity < 0) {
    throw new EstimateError(`Jumlah tidak valid untuk ${item.category}: ${item.quantity}`);
  }
  const unitCredits = item.billingMode === 'byok' ? 0 : rates[item.category][item.tier];
  // Koreksi galat floating point (0.1 * 30 = 3.0000000000000004) sebelum ceil.
  const raw = Math.round(unitCredits * item.quantity * 1e6) / 1e6;
  return { ...item, unitCredits, credits: Math.ceil(raw) };
}

export function estimate(items: readonly EstimateItem[], rates: RateTable): Estimate {
  const lines = items.map((i) => estimateLine(i, rates));
  const byCategory = emptyByCategory();
  for (const l of lines) byCategory[l.category] += l.credits;
  const total = CATEGORIES.reduce((s, c) => s + byCategory[c], 0);
  return { lines, byCategory, total, requiresConfirmation: requiresConfirmation(total) };
}

export function requiresConfirmation(totalCredits: number): boolean {
  return totalCredits > CONFIRMATION_THRESHOLD;
}

export function creditsToRupiah(credits: number): number {
  return credits * RUPIAH_PER_CREDIT;
}

/** Format ringkas untuk UI, mis. "naskah 36, VO 52, gambar 144, video 1.980 kredit". */
export function describeEstimate(e: Pick<Estimate, 'byCategory'>): string {
  const label: Record<Category, string> = { naskah: 'naskah', vo: 'VO', image: 'gambar', video: 'video' };
  const fmt = new Intl.NumberFormat('id-ID');
  const parts = CATEGORIES.filter((c) => e.byCategory[c] > 0).map((c) => `${label[c]} ${fmt.format(e.byCategory[c])}`);
  return parts.length ? `${parts.join(', ')} kredit` : '0 kredit';
}
