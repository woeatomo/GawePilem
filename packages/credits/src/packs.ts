export interface TopupPack {
  id: 'starter' | 'creator' | 'pro' | 'studio';
  name: string;
  priceIdr: number;
  credits: number;
  bonusLabel: string;
}

/** Paket top-up awal (usulan PRD, wajib dikalibrasi ke harga provider sebelum launch). */
export const TOPUP_PACKS: readonly TopupPack[] = [
  { id: 'starter', name: 'Starter', priceIdr: 50_000, credits: 500, bonusLabel: '–' },
  { id: 'creator', name: 'Creator', priceIdr: 150_000, credits: 1_600, bonusLabel: '+7%' },
  { id: 'pro', name: 'Pro', priceIdr: 500_000, credits: 5_500, bonusLabel: '+10%' },
  { id: 'studio', name: 'Studio', priceIdr: 1_500_000, credits: 17_000, bonusLabel: '+13%' },
];

export function findPack(id: string): TopupPack | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}
