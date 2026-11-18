'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CATEGORY_META, describeEstimate, estimate, requiresConfirmation, type Category, type Estimate } from '@atomo/credits';
import { Modal, fmt, useToast } from './ui';
import { useStudio } from './studio-context';
import type { ActionId } from '@/lib/ai/actions';

export interface RunOptions {
  onDelta?: (fullText: string) => void;
  onData?: (data: unknown) => void;
}

interface ApiError {
  code: string;
  message: string;
  estimate?: Estimate;
  refunded?: number;
}

const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '');

/** Estimasi di sisi client dari tarif + pengaturan tier/billing (server tetap menghitung ulang). */
export function useEstimate(items: { category: Category; quantity: number }[]): Estimate {
  const { rates, settings } = useStudio();
  return estimate(items.map((i) => ({ ...i, tier: settings[i.category].tier, billingMode: settings[i.category].mode })), rates);
}

/**
 * Menjalankan aksi AI: konfirmasi bila > 150 kredit, kirim expectedTotal, baca stream NDJSON,
 * tangani saldo kurang / estimasi berubah / refund otomatis.
 */
export function useAI() {
  const { projectId, episode, balance } = useStudio();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ est: Estimate; label: string; resolve: (ok: boolean) => void } | null>(null);
  const [insufficient, setInsufficient] = useState<{ need: number } | null>(null);

  const run = useCallback(
    async (action: ActionId, params: unknown, est: Estimate, label: string, opts: RunOptions = {}): Promise<boolean> => {
      if (est.total > balance) {
        setInsufficient({ need: est.total });
        return false;
      }
      let confirmed = false;
      if (requiresConfirmation(est.total)) {
        confirmed = await new Promise<boolean>((resolve) => setConfirm({ est, label, resolve }));
        setConfirm(null);
        if (!confirmed) return false;
      }
      setBusy(action);
      try {
        const res = await fetch(`/api/ai/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, episode, params, expectedTotal: est.total, confirmed, idempotencyKey: newKey() }),
        });
        if (!res.ok) {
          const err = ((await res.json().catch(() => null)) as { error?: ApiError } | null)?.error;
          if (err?.code === 'insufficient_credits') setInsufficient({ need: est.total });
          else if (err?.code === 'estimate_changed' || err?.code === 'rate_changed') {
            toast(`${err.message}${err.estimate ? ` Sekarang: ${describeEstimate(err.estimate)}.` : ''}`, 'info');
            router.refresh();
          } else toast(err?.message ?? 'Gagal memproses permintaan.', 'err');
          return false;
        }
        const type = res.headers.get('content-type') ?? '';
        if (type.includes('ndjson') && res.body) {
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          let text = '';
          let ok = false;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let i: number;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i);
              buf = buf.slice(i + 1);
              if (!line) continue;
              const ev = JSON.parse(line) as { t: string; v?: string; message?: string; refunded?: number; cost?: number };
              if (ev.t === 'delta') {
                text += ev.v ?? '';
                opts.onDelta?.(text);
              } else if (ev.t === 'done') {
                ok = true;
                toast(ev.cost ? `${label} selesai · ${fmt(ev.cost)} kredit` : `${label} selesai`);
              } else if (ev.t === 'error') {
                toast(`${ev.message} ${ev.refunded ? `${fmt(ev.refunded)} kredit dikembalikan.` : ''}`, 'err');
              }
            }
          }
          router.refresh();
          return ok;
        }
        const json = (await res.json()) as { data?: unknown; status?: string; cost?: number };
        if (res.status === 202) toast(`${label} masuk antrean · ${fmt(json.cost ?? 0)} kredit`, 'info');
        else toast(`${label} selesai${json.cost ? ` · ${fmt(json.cost)} kredit` : ''}`);
        opts.onData?.(json.data);
        router.refresh();
        return true;
      } catch {
        toast('Koneksi terputus. Kalau kredit sudah terpotong dan job gagal, kredit akan dikembalikan otomatis.', 'err');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [projectId, episode, balance, router, toast],
  );

  const dialogs = (
    <>
      <Modal open={!!confirm} onClose={() => confirm?.resolve(false)} label="Konfirmasi biaya">
        {confirm && (
          <>
            <h2>Konfirmasi biaya</h2>
            <p className="muted">
              <b className="mono" style={{ color: 'var(--text)' }}>{confirm.label}</b> akan memakai <b className="mono" style={{ color: 'var(--text)' }}>{fmt(confirm.est.total)}</b> kredit
              (sisa saldo setelahnya {fmt(balance - confirm.est.total)}).
            </p>
            <table className="tarif">
              <tbody>
                {confirm.est.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{CATEGORY_META[l.category].label}</td>
                    <td className="muted small">
                      {fmt(l.quantity)} {CATEGORY_META[l.category].unitShort} × {l.unitCredits}
                    </td>
                    <td className="num-r">{l.billingMode === 'byok' ? 'BYOK' : fmt(l.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small faint">Kalau provider gagal, kredit dikembalikan otomatis.</p>
            <div className="acts">
              <button className="btn ghost" onClick={() => confirm.resolve(false)}>Batal</button>
              <button className="btn primary" onClick={() => confirm.resolve(true)}>Lanjutkan · {fmt(confirm.est.total)} kr</button>
            </div>
          </>
        )}
      </Modal>
      <Modal open={!!insufficient} onClose={() => setInsufficient(null)} label="Saldo tidak cukup">
        <h2>Saldo tidak cukup</h2>
        <p className="muted">
          Aksi ini butuh <b className="mono">{fmt(insufficient?.need ?? 0)}</b> kredit, saldo kamu <b className="mono">{fmt(balance)}</b>. Top-up dulu atau pilih tier yang lebih hemat di
          Provider AI.
        </p>
        <div className="acts">
          <button className="btn ghost" onClick={() => setInsufficient(null)}>Batal</button>
          <a className="btn primary" href="/saldo">Top-up saldo</a>
        </div>
      </Modal>
    </>
  );

  return { run, busy, dialogs };
}

/** Tombol aksi AI dengan badge biaya (estimasi sebelum generate). */
export function AIButton({
  action, params, items, label, onDelta, onData, variant = 'primary', disabled, size,
}: {
  action: ActionId;
  params: unknown;
  items: { category: Category; quantity: number }[];
  label: string;
  onDelta?: (t: string) => void;
  onData?: (d: unknown) => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  size?: 'sm';
}) {
  const est = useEstimate(items);
  const { run, busy, dialogs } = useAI();
  const isBusy = busy === action;
  const costLabel = est.total === 0 && est.lines.every((l) => l.billingMode === 'byok') ? 'BYOK' : `${fmt(est.total)} kr`;
  return (
    <>
      <button
        className={`btn ${variant === 'primary' ? 'primary' : ''} ${size ?? ''}`}
        disabled={disabled || isBusy}
        onClick={() => run(action, params, est, label, { ...(onDelta ? { onDelta } : {}), ...(onData ? { onData } : {}) })}
        title={describeEstimate(est)}
      >
        {isBusy ? 'Memproses…' : label}
        <span className="cost">{costLabel}</span>
      </button>
      {dialogs}
    </>
  );
}
