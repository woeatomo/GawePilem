import { findOffer, PLAN_FEATURES, TIER_RANK, type PlanOffer, type PlanTier } from '@atomo/credits';
import type { DB } from '@atomo/db';

export interface ActivePlan {
  tier: PlanTier;
  offerId: string | null;
  periodEnd: string | null;
  daysLeft: number | null;
}

export async function activePlan(db: DB, userId: string, profilePlan: PlanTier): Promise<ActivePlan> {
  const { data } = await db.from('subscriptions').select('tier, offer_id, current_period_end').eq('user_id', userId).maybeSingle();
  if (!data || new Date(data.current_period_end).getTime() <= Date.now()) return { tier: profilePlan, offerId: null, periodEnd: null, daysLeft: null };
  return {
    tier: data.tier as PlanTier,
    offerId: data.offer_id,
    periodEnd: data.current_period_end,
    daysLeft: Math.ceil((new Date(data.current_period_end).getTime() - Date.now()) / 86_400_000),
  };
}

/** Cegah membeli paket lebih rendah saat paket lebih tinggi masih aktif (periode lama akan hilang). */
export function planPurchaseBlock(active: ActivePlan, offer: PlanOffer): string | null {
  if (active.periodEnd && TIER_RANK[offer.tier] < TIER_RANK[active.tier]) {
    const until = new Date(active.periodEnd).toLocaleDateString('id-ID', { dateStyle: 'medium' });
    return `Paket ${PLAN_FEATURES[active.tier].label} masih aktif sampai ${until}. Beli paket yang sama atau lebih tinggi, atau tunggu periodenya habis.`;
  }
  return null;
}

export { findOffer };
