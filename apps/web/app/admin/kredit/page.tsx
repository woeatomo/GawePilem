import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLAN_OFFERS } from '@atomo/credits';
import { MfaChallenge, MfaEnroll } from '@/components/mfa';
import { AccountPage, loadAccount } from '@/lib/account';
import { ManualCreditPanel } from './panel';

export const metadata: Metadata = { title: 'Kredit manual', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STEP_UP_SEC = 15 * 60;

export default async function ManualCreditPage() {
  const data = await loadAccount();
  const s = data.session;
  if (!s.profile.is_superadmin) notFound();

  const [{ data: aal }, { data: factors }] = await Promise.all([s.db.auth.mfa.getAuthenticatorAssuranceLevel(), s.db.auth.mfa.listFactors()]);
  const enrolled = (factors?.totp ?? []).some((f) => f.status === 'verified');

  let body: React.ReactNode;
  if (!enrolled) body = <MfaEnroll />;
  else if (aal?.currentLevel !== 'aal2') body = <MfaChallenge title="Masukkan kode 2FA" desc="Halaman kredit manual butuh sesi yang sudah terverifikasi 2FA." />;
  else {
    const { data: history, error } = await s.db.rpc('admin_manual_history', { p_limit: 30 });
    if (error) throw new Error(error.message);
    const lastTotp = Math.max(0, ...(aal.currentAuthenticationMethods ?? []).flatMap((m) => (typeof m === 'object' && m.method === 'totp' ? [m.timestamp] : [])));
    body = (
      <ManualCreditPanel
        stepUpUntil={(lastTotp + STEP_UP_SEC) * 1000}
        offers={PLAN_OFFERS.map((o) => ({ id: o.id, label: `${o.name} · ${o.months} bln`, priceIdr: o.priceIdr, credits: o.credits }))}
        history={(history ?? []).map((h) => ({ at: h.at, actor: h.actor_email ?? '–', user: h.user_email ?? '(akun dihapus)', credits: h.credits, amountIdr: h.amount_idr, note: h.note ?? '', plan: h.plan }))}
      />
    );
  }

  return (
    <AccountPage data={data} active="admin-kredit" title="Kredit manual">
      <header className="vhead">
        <div>
          <p className="eyebrow">SUPERADMIN</p>
          <h1>Kredit manual</h1>
          <p className="lede">
            Tambahkan kredit atau aktifkan paket untuk customer yang membayar lewat transfer langsung. Melewati jalur yang sama dengan pembayaran online (ledger, masa berlaku 12 bulan), aman
            dari klik ganda, dan setiap penambahan tercatat di audit log beserta catatan buktinya.
          </p>
        </div>
      </header>
      {body}
    </AccountPage>
  );
}
