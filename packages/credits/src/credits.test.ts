import { describe, expect, it } from 'vitest';
import {
  SEED_RATES,
  AI_PROFILE_META,
  detectProfile,
  episodeEstimate,
  findOffer,
  PLAN_OFFERS,
  buildRateTable,
  rateTableToRows,
  RateTableError,
  estimate,
  estimateLine,
  describeEstimate,
  requiresConfirmation,
  CONFIRMATION_THRESHOLD,
  creditsToRupiah,
  checkBudgetCaps,
  canAfford,
  emptyByCategory,
  replayLedger,
  pendingExpirations,
  upcomingExpirations,
  spendableBalance,
  expiryFor,
  LedgerError,
  EstimateError,
  type LedgerEntry,
} from './index';

const R = SEED_RATES;

describe('tarif', () => {
  it('seed sesuai tabel tarif CLAUDE.md', () => {
    expect(R.naskah).toEqual({ hemat: 3, standar: 5, premium: 9 });
    expect(R.vo).toEqual({ hemat: 12, standar: 26, premium: 43 });
    expect(R.image).toEqual({ hemat: 3, standar: 6, premium: 10 });
    expect(R.video).toEqual({ hemat: 8, standar: 22, premium: 42 });
  });

  it('round-trip baris DB ↔ RateTable', () => {
    expect(buildRateTable(rateTableToRows(R))).toEqual(R);
  });

  it('menolak tabel tarif yang tidak lengkap', () => {
    const rows = rateTableToRows(R).filter((r) => !(r.category === 'video' && r.tier === 'premium'));
    expect(() => buildRateTable(rows)).toThrow(RateTableError);
  });

  it('menolak tarif negatif', () => {
    const rows = rateTableToRows(R).map((r) => (r.category === 'vo' ? { ...r, creditsPerUnit: -1 } : r));
    expect(() => buildRateTable(rows)).toThrow();
  });
});

describe('estimasi', () => {
  it('menghitung per kategori dan total', () => {
    const e = estimate(
      [
        { category: 'naskah', tier: 'standar', quantity: 7, billingMode: 'saldo' },
        { category: 'vo', tier: 'standar', quantity: 2, billingMode: 'saldo' },
        { category: 'image', tier: 'standar', quantity: 24, billingMode: 'saldo' },
        { category: 'video', tier: 'standar', quantity: 90, billingMode: 'saldo' },
      ],
      R,
    );
    expect(e.byCategory).toEqual({ naskah: 35, vo: 52, image: 144, video: 1980 });
    expect(e.total).toBe(2211);
    expect(e.requiresConfirmation).toBe(true);
    expect(describeEstimate(e)).toBe('naskah 35, VO 52, gambar 144, video 1.980 kredit');
  });

  it('VO per menit pecahan dibulatkan ke atas', () => {
    expect(estimateLine({ category: 'vo', tier: 'standar', quantity: 0.4, billingMode: 'saldo' }, R).credits).toBe(11);
    expect(estimateLine({ category: 'vo', tier: 'hemat', quantity: 1.8, billingMode: 'saldo' }, R).credits).toBe(22);
  });

  it('tidak ada galat floating point (0,1 × 30 = 3, bukan 4)', () => {
    const rates = { ...R, vo: { hemat: 30, standar: 30, premium: 30 } };
    expect(estimateLine({ category: 'vo', tier: 'hemat', quantity: 0.1, billingMode: 'saldo' }, rates).credits).toBe(3);
  });

  it('BYOK tidak memotong saldo', () => {
    const e = estimate(
      [
        { category: 'naskah', tier: 'premium', quantity: 10, billingMode: 'byok' },
        { category: 'video', tier: 'hemat', quantity: 5, billingMode: 'saldo' },
      ],
      R,
    );
    expect(e.byCategory.naskah).toBe(0);
    expect(e.total).toBe(40);
  });

  it('menolak jumlah negatif atau NaN', () => {
    expect(() => estimateLine({ category: 'image', tier: 'hemat', quantity: -1, billingMode: 'saldo' }, R)).toThrow(EstimateError);
    expect(() => estimateLine({ category: 'image', tier: 'hemat', quantity: NaN, billingMode: 'saldo' }, R)).toThrow(EstimateError);
  });

  it('konfirmasi hanya untuk aksi DI ATAS 150 kredit', () => {
    expect(CONFIRMATION_THRESHOLD).toBe(150);
    expect(requiresConfirmation(150)).toBe(false);
    expect(requiresConfirmation(151)).toBe(true);
  });

  it('1 kredit = Rp100', () => {
    expect(creditsToRupiah(500)).toBe(50_000);
  });

  it('describe kosong', () => {
    expect(describeEstimate({ byCategory: emptyByCategory() })).toBe('0 kredit');
  });
});

describe('budget cap & saldo', () => {
  it('melaporkan kategori yang melewati cap', () => {
    const v = checkBudgetCaps(
      { ...emptyByCategory(), video: 500, image: 10 },
      { ...emptyByCategory(), video: 2700, image: 10 },
      { video: 3000, image: null },
    );
    expect(v).toEqual([{ category: 'video', cap: 3000, spent: 2700, requested: 500, remaining: 300 }]);
  });

  it('tepat di cap masih boleh', () => {
    expect(checkBudgetCaps({ ...emptyByCategory(), vo: 100 }, { ...emptyByCategory(), vo: 200 }, { vo: 300 })).toEqual([]);
  });

  it('canAfford', () => {
    expect(canAfford(100, 100)).toBe(true);
    expect(canAfford(99, 100)).toBe(false);
  });
});

const d = (s: string) => new Date(s);
function topup(id: string, amount: number, at: string): LedgerEntry {
  return { id, type: 'topup', amount, createdAt: d(at), expiresAt: expiryFor(d(at)) };
}
function usage(id: string, amount: number, at: string, jobId: string): LedgerEntry {
  return { id, type: 'usage', amount: -amount, createdAt: d(at), jobId };
}

describe('ledger & FIFO', () => {
  it('masa berlaku 12 bulan, clamp akhir bulan', () => {
    expect(expiryFor(d('2026-01-15T10:00:00Z')).toISOString()).toBe('2027-01-15T10:00:00.000Z');
    expect(expiryFor(d('2028-02-29T00:00:00Z')).toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });

  it('saldo = SUM ledger', () => {
    const r = replayLedger([topup('t1', 500, '2026-01-01'), usage('u1', 120, '2026-01-02', 'j1')]);
    expect(r.balance).toBe(380);
    expect(r.uncovered).toBe(0);
  });

  it('pemakaian memotong lot yang paling cepat hangus dulu', () => {
    const r = replayLedger([
      topup('t1', 100, '2026-01-01'),
      topup('t2', 100, '2026-03-01'),
      usage('u1', 150, '2026-04-01', 'j1'),
    ]);
    expect(r.lots.map((l) => l.remaining)).toEqual([0, 50]);
    expect(r.consumption.get('j1')).toEqual([
      { lotId: 't1', amount: 100 },
      { lotId: 't2', amount: 50 },
    ]);
  });

  it('refund mengembalikan kredit ke lot asal (lot terakhir dulu)', () => {
    const r = replayLedger([
      topup('t1', 100, '2026-01-01'),
      topup('t2', 100, '2026-03-01'),
      usage('u1', 150, '2026-04-01', 'j1'),
      { id: 'r1', type: 'refund', amount: 150, createdAt: d('2026-04-01T00:05:00Z'), jobId: 'j1' },
    ]);
    expect(r.lots.map((l) => l.remaining)).toEqual([100, 100]);
    expect(r.balance).toBe(200);
  });

  it('refund wajib menunjuk job dan bernilai positif', () => {
    expect(() => replayLedger([{ id: 'r', type: 'refund', amount: 10, createdAt: d('2026-01-01') }])).toThrow(LedgerError);
    expect(() =>
      replayLedger([{ id: 'r', type: 'refund', amount: -10, createdAt: d('2026-01-01'), jobId: 'x' }]),
    ).toThrow(LedgerError);
  });

  it('usage positif ditolak', () => {
    expect(() => replayLedger([{ id: 'u', type: 'usage', amount: 5, createdAt: d('2026-01-01'), jobId: 'j' }])).toThrow(
      LedgerError,
    );
  });

  it('lot hangus tidak bisa dipakai dan masuk daftar pending expire', () => {
    const entries = [topup('t1', 100, '2025-01-01'), topup('t2', 50, '2026-01-10'), usage('u1', 30, '2026-02-01', 'j1')];
    const r = replayLedger(entries);
    // t1 hangus 2026-01-01, jadi pemakaian Feb memotong t2.
    expect(r.consumption.get('j1')).toEqual([{ lotId: 't2', amount: 30 }]);
    const now = d('2026-02-02');
    expect(pendingExpirations(entries, now)).toEqual([{ lotId: 't1', amount: 100, expiresAt: d('2026-01-01') }]);
    expect(spendableBalance(entries, now)).toBe(20);

    const after = [...entries, { id: 'e1', type: 'expire' as const, amount: -100, createdAt: now, lotId: 't1' }];
    expect(pendingExpirations(after, now)).toEqual([]);
    expect(replayLedger(after).balance).toBe(20);
  });

  it('expire tidak boleh melebihi sisa lot', () => {
    expect(() =>
      replayLedger([topup('t1', 10, '2025-01-01'), { id: 'e', type: 'expire', amount: -11, createdAt: d('2026-02-01'), lotId: 't1' }]),
    ).toThrow(LedgerError);
  });

  it('pengingat kredit yang akan hangus', () => {
    const entries = [topup('t1', 100, '2025-12-01'), topup('t2', 100, '2026-06-01')];
    expect(upcomingExpirations(entries, d('2026-11-15'), 30).map((x) => x.lotId)).toEqual(['t1']);
  });

  it('pemakaian melebihi lot tercatat sebagai uncovered', () => {
    expect(replayLedger([topup('t1', 10, '2026-01-01'), usage('u', 15, '2026-01-02', 'j')]).uncovered).toBe(5);
  });
});

describe('paket & mode AI', () => {
  it('profil mode AI terdeteksi dari tier', () => {
    expect(detectProfile({ naskah: 'standar', vo: 'standar', image: 'standar', video: 'standar' })).toBe('seimbang');
    expect(detectProfile({ naskah: 'premium', vo: 'hemat', image: 'standar', video: 'standar' })).toBeNull();
  });

  it('episode 20 menit: Hemat < Seimbang < Gacor, hybrid lebih murah dari full AI', () => {
    const t = (p: keyof typeof AI_PROFILE_META) => episodeEstimate({ minutes: 20, aiShare: 0.4 }, AI_PROFILE_META[p].tiers, SEED_RATES).total;
    expect(t('hemat')).toBeLessThan(t('seimbang'));
    expect(t('seimbang')).toBeLessThan(t('gacor'));
    const full = episodeEstimate({ minutes: 20, aiShare: 1 }, AI_PROFILE_META.seimbang.tiers, SEED_RATES).total;
    expect(t('seimbang')).toBeLessThan(full * 0.55);
  });

  it('paket serial menutup jumlah episode yang dijanjikan & lebih murah per kredit dari top-up', () => {
    const ep = episodeEstimate({ minutes: 20, aiShare: 0.4 }, AI_PROFILE_META.seimbang.tiers, SEED_RATES).total;
    for (const o of PLAN_OFFERS.filter((x) => x.kind === 'serial')) {
      expect(o.credits).toBeGreaterThanOrEqual(ep * o.episodes!);
      expect(o.priceIdr / o.credits).toBeLessThan(100);
    }
  });

  it('langganan 3 bulan diskon 10% dengan kredit 3×', () => {
    const m = findOffer('pro-1m')!;
    const q = findOffer('pro-3m')!;
    expect(q.credits).toBe(m.credits * 3);
    expect(q.priceIdr).toBe(Math.round((m.priceIdr * 3 * 0.9) / 1000) * 1000);
    expect(new Set(PLAN_OFFERS.map((o) => o.id)).size).toBe(PLAN_OFFERS.length);
  });
});
