import type { LedgerEntry } from './types';

/** Masa berlaku kredit: 12 bulan sejak top-up. */
export const CREDIT_VALIDITY_MONTHS = 12;

export function expiryFor(topupAt: Date): Date {
  const d = new Date(topupAt.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + CREDIT_VALIDITY_MONTHS);
  // Clamp 29 Feb → 28 Feb, 31 → akhir bulan.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface Lot {
  id: string;
  createdAt: Date;
  expiresAt: Date | null;
  original: number;
  remaining: number;
  expired: boolean;
}

export interface LedgerReplay {
  lots: Lot[];
  /** SUM(amount) — saldo resmi. */
  balance: number;
  /** Untuk setiap job: lot mana dipakai berapa (urutan FIFO). */
  consumption: Map<string, { lotId: string; amount: number }[]>;
  /** Pemakaian yang tidak tertutup lot (seharusnya 0 kalau constraint DB benar). */
  uncovered: number;
}

export class LedgerError extends Error {}

function byTime(a: LedgerEntry, b: LedgerEntry): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

/**
 * Putar ulang ledger append-only secara kronologis untuk menurunkan lot FIFO.
 * - topup / adjustment positif membuat lot baru.
 * - usage memakai lot yang paling cepat hangus lebih dulu (FIFO), lewati lot hangus.
 * - refund mengembalikan kredit ke lot yang dipakai job itu (lot terakhir dulu).
 * - expire menutup sisa lot.
 */
export function replayLedger(entries: readonly LedgerEntry[]): LedgerReplay {
  const sorted = [...entries].sort(byTime);
  const lots: Lot[] = [];
  const lotById = new Map<string, Lot>();
  const consumption = new Map<string, { lotId: string; amount: number }[]>();
  let balance = 0;
  let uncovered = 0;

  const spend = (amount: number, at: Date, jobId: string | null | undefined) => {
    let left = amount;
    const usable = lots
      .filter((l) => !l.expired && l.remaining > 0 && (!l.expiresAt || l.expiresAt > at))
      .sort(
        (a, b) =>
          (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    for (const lot of usable) {
      if (left === 0) break;
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
      if (jobId) {
        const list = consumption.get(jobId) ?? [];
        list.push({ lotId: lot.id, amount: take });
        consumption.set(jobId, list);
      }
    }
    uncovered += left;
  };

  for (const e of sorted) {
    balance += e.amount;
    switch (e.type) {
      case 'topup':
      case 'adjustment': {
        if (e.amount > 0) {
          const lot: Lot = {
            id: e.id,
            createdAt: e.createdAt,
            expiresAt: e.expiresAt ?? null,
            original: e.amount,
            remaining: e.amount,
            expired: false,
          };
          lots.push(lot);
          lotById.set(lot.id, lot);
        } else if (e.amount < 0) {
          spend(-e.amount, e.createdAt, null);
        }
        break;
      }
      case 'usage': {
        if (e.amount > 0) throw new LedgerError(`usage ${e.id} harus negatif`);
        spend(-e.amount, e.createdAt, e.jobId);
        break;
      }
      case 'refund': {
        if (e.amount < 0) throw new LedgerError(`refund ${e.id} harus positif`);
        if (!e.jobId) throw new LedgerError(`refund ${e.id} wajib menunjuk job`);
        let left = e.amount;
        const used = consumption.get(e.jobId) ?? [];
        for (let i = used.length - 1; i >= 0 && left > 0; i--) {
          const u = used[i]!;
          const lot = lotById.get(u.lotId);
          if (!lot) continue;
          const give = Math.min(u.amount, left);
          u.amount -= give;
          left -= give;
          // Lot yang sudah hangus tetap menerima refund lalu langsung hangus lagi lewat entri expire berikutnya.
          lot.remaining += give;
        }
        if (left > 0) {
          // Refund tanpa jejak pemakaian (data lama): jadikan lot baru 12 bulan.
          const lot: Lot = {
            id: e.id,
            createdAt: e.createdAt,
            expiresAt: expiryFor(e.createdAt),
            original: left,
            remaining: left,
            expired: false,
          };
          lots.push(lot);
          lotById.set(lot.id, lot);
        }
        break;
      }
      case 'expire': {
        const lot = e.lotId ? lotById.get(e.lotId) : undefined;
        if (!lot) throw new LedgerError(`expire ${e.id} menunjuk lot yang tidak ada`);
        if (-e.amount > lot.remaining) throw new LedgerError(`expire ${e.id} melebihi sisa lot`);
        lot.remaining += e.amount;
        if (lot.remaining === 0) lot.expired = true;
        break;
      }
    }
  }
  return { lots, balance, consumption, uncovered };
}

export interface PendingExpiry {
  lotId: string;
  amount: number;
  expiresAt: Date;
}

/** Lot yang sudah lewat masa berlaku tapi sisanya belum dicatat sebagai entri `expire`. */
export function pendingExpirations(entries: readonly LedgerEntry[], now: Date): PendingExpiry[] {
  const { lots } = replayLedger(entries);
  return lots
    .filter((l) => l.expiresAt && l.expiresAt <= now && l.remaining > 0)
    .map((l) => ({ lotId: l.id, amount: l.remaining, expiresAt: l.expiresAt! }));
}

/** Kredit yang akan hangus dalam `withinDays` hari ke depan (untuk pengingat). */
export function upcomingExpirations(entries: readonly LedgerEntry[], now: Date, withinDays: number): PendingExpiry[] {
  const limit = now.getTime() + withinDays * 86_400_000;
  const { lots } = replayLedger(entries);
  return lots
    .filter((l) => l.expiresAt && l.expiresAt > now && l.expiresAt.getTime() <= limit && l.remaining > 0)
    .map((l) => ({ lotId: l.id, amount: l.remaining, expiresAt: l.expiresAt! }));
}

/** Saldo yang benar-benar bisa dipakai saat ini (lot hangus yang belum diproses tidak dihitung). */
export function spendableBalance(entries: readonly LedgerEntry[], now: Date): number {
  const { lots } = replayLedger(entries);
  return lots
    .filter((l) => !l.expired && (!l.expiresAt || l.expiresAt > now))
    .reduce((s, l) => s + l.remaining, 0);
}
