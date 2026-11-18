import { z } from 'zod';

export const CATEGORIES = ['naskah', 'vo', 'image', 'video'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const TIERS = ['hemat', 'standar', 'premium'] as const;
export const tierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof tierSchema>;

export const billingModeSchema = z.enum(['saldo', 'byok']);
export type BillingMode = z.infer<typeof billingModeSchema>;

/** Satu baris tabel `rates`. `credits_per_unit` boleh pecahan (numeric di Postgres). */
export const rateSchema = z.object({
  category: categorySchema,
  tier: tierSchema,
  creditsPerUnit: z.number().nonnegative().finite(),
});
export type Rate = z.infer<typeof rateSchema>;

export type RateTable = Record<Category, Record<Tier, number>>;

export const ledgerEntryTypeSchema = z.enum(['topup', 'usage', 'refund', 'expire', 'adjustment']);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string(),
  type: ledgerEntryTypeSchema,
  /** Positif = kredit masuk, negatif = kredit keluar. Selalu bilangan bulat. */
  amount: z.number().int(),
  createdAt: z.coerce.date(),
  /** Hanya untuk topup/adjustment positif: kapan lot ini hangus. */
  expiresAt: z.coerce.date().nullable().optional(),
  /** usage & refund menunjuk job yang sama. */
  jobId: z.string().nullable().optional(),
  /** expire menunjuk lot (id entri topup) yang hangus. */
  lotId: z.string().nullable().optional(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
