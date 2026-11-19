import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLATFORM_SECRETS } from '@atomo/db';
import { MfaChallenge, MfaEnroll } from '@/components/mfa';
import { AccountPage, loadAccount } from '@/lib/account';
import { platformSecrets } from '@/lib/platform';
import { SecretsPanel, type SecretRow } from './panel';

export const metadata: Metadata = { title: 'Secret platform', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STEP_UP_SEC = 15 * 60;

export default async function SecretsPage() {
  const data = await loadAccount();
  const s = data.session;
  // Halaman tidak "ada" bagi non-superadmin.
  if (!s.profile.is_superadmin) notFound();

  const [{ data: aal }, { data: factors }] = await Promise.all([s.db.auth.mfa.getAuthenticatorAssuranceLevel(), s.db.auth.mfa.listFactors()]);
  const enrolled = (factors?.totp ?? []).some((f) => f.status === 'verified');

  let body: React.ReactNode;
  if (!enrolled) {
    body = <MfaEnroll />;
  } else if (aal?.currentLevel !== 'aal2') {
    body = <MfaChallenge title="Masukkan kode 2FA" desc="Sesi ini belum terverifikasi 2FA. Masukkan kode dari aplikasi autentikator untuk membuka halaman secret." />;
  } else {
    const { data: rows, error } = await s.db.rpc('list_platform_secrets');
    if (error) throw new Error(error.message);
    const lastTotp = Math.max(
      0,
      ...(aal.currentAuthenticationMethods ?? []).flatMap((m) => (typeof m === 'object' && m.method === 'totp' ? [m.timestamp] : [])),
    );
    const secrets: SecretRow[] = await Promise.all(
      PLATFORM_SECRETS.map(async (p) => {
        const r = rows?.find((x) => x.name === p.name);
        return {
          name: p.name, label: p.label, group: p.group, help: p.help,
          source: await platformSecrets().source(p.name),
          hint: r?.hint ?? null, updatedAt: r?.updated_at ?? null, updatedBy: r?.updated_by_email ?? null,
        };
      }),
    );
    body = <SecretsPanel secrets={secrets} stepUpUntil={(lastTotp + STEP_UP_SEC) * 1000} />;
  }

  return (
    <AccountPage data={data} active="admin" title="Secret platform">
      <header className="vhead">
        <div>
          <p className="eyebrow">SUPERADMIN</p>
          <h1>Secret platform</h1>
          <p className="lede">
            Key asli provider AI, payment gateway, dan OAuth. Disimpan terenkripsi AES-256-GCM; nilai tidak pernah ditampilkan lagi setelah disimpan. Mengubah secret butuh
            verifikasi 2FA dalam 15 menit terakhir, dan setiap perubahan tercatat di audit log.
          </p>
        </div>
      </header>
      {body}
    </AccountPage>
  );
}
