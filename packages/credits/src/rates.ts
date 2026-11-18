import { CATEGORIES, TIERS, rateSchema, type Category, type Rate, type RateTable, type Tier } from './types';

/**
 * Nilai awal tabel `rates`. HANYA dipakai untuk seed dan tes.
 * Runtime selalu membaca tarif dari database lewat `buildRateTable`.
 */
export const SEED_RATES: RateTable = {
  naskah: { hemat: 3, standar: 5, premium: 9 },
  vo: { hemat: 12, standar: 26, premium: 43 },
  image: { hemat: 3, standar: 6, premium: 10 },
  video: { hemat: 8, standar: 22, premium: 42 },
};

export const CATEGORY_META: Record<Category, { label: string; unit: string; unitShort: string }> = {
  naskah: { label: 'AI Naskah', unit: 'scene / aksi teks', unitShort: 'aksi' },
  vo: { label: 'AI Voice Over', unit: 'menit audio', unitShort: 'menit' },
  image: { label: 'AI Text to Image', unit: 'gambar', unitShort: 'gambar' },
  video: { label: 'AI Image to Video', unit: 'detik video', unitShort: 'detik' },
};

export const TIER_LABEL: Record<Tier, string> = { hemat: 'Hemat', standar: 'Standar', premium: 'Premium' };
export const VIDEO_RESOLUTION: Record<Tier, '480p' | '720p' | '1080p'> = {
  hemat: '480p',
  standar: '720p',
  premium: '1080p',
};

export class RateTableError extends Error {}

/** Membangun RateTable dari baris DB. Gagal kalau ada kombinasi kategori × tier yang hilang. */
export function buildRateTable(rows: readonly Rate[]): RateTable {
  const partial: Partial<Record<Category, Partial<Record<Tier, number>>>> = {};
  for (const raw of rows) {
    const row = rateSchema.parse(raw);
    (partial[row.category] ??= {})[row.tier] = row.creditsPerUnit;
  }
  const table = {} as RateTable;
  for (const c of CATEGORIES) {
    const tiers = {} as Record<Tier, number>;
    for (const t of TIERS) {
      const v = partial[c]?.[t];
      if (v === undefined) throw new RateTableError(`Tarif ${c}/${t} tidak ditemukan`);
      tiers[t] = v;
    }
    table[c] = tiers;
  }
  return table;
}

export function rateTableToRows(table: RateTable): Rate[] {
  return CATEGORIES.flatMap((category) =>
    TIERS.map((tier) => ({ category, tier, creditsPerUnit: table[category][tier] })),
  );
}
