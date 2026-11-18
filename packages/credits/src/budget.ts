import { CATEGORIES, type Category } from './types';

export type BudgetCaps = Partial<Record<Category, number | null>>;

export interface BudgetViolation {
  category: Category;
  cap: number;
  spent: number;
  requested: number;
  /** Sisa kredit yang masih boleh dipakai di kategori ini. */
  remaining: number;
}

/** Cek budget cap per kategori per project. Cap null/undefined = tanpa batas. */
export function checkBudgetCaps(
  requested: Record<Category, number>,
  spent: Record<Category, number>,
  caps: BudgetCaps,
): BudgetViolation[] {
  const out: BudgetViolation[] = [];
  for (const c of CATEGORIES) {
    const cap = caps[c];
    if (cap === null || cap === undefined) continue;
    const req = requested[c];
    if (req <= 0) continue;
    if (spent[c] + req > cap) {
      out.push({ category: c, cap, spent: spent[c], requested: req, remaining: Math.max(0, cap - spent[c]) });
    }
  }
  return out;
}

export function canAfford(balance: number, total: number): boolean {
  return total <= balance;
}
