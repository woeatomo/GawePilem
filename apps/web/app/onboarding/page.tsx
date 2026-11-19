import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { OnboardingForm } from './form';

export const metadata: Metadata = { title: 'Mulai' };

export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.profile.age_confirmed_at && s.profile.data_consent_at) redirect('/studio');
  return (
    <div className="auth">
      <div className="card">
        <div className="row" style={{ gap: 12 }}>
          <Logo size={36} />
          <h1 style={{ fontSize: 20 }}>Sebelum mulai</h1>
        </div>
        <OnboardingForm defaultName={s.profile.display_name ?? ''} />
      </div>
    </div>
  );
}
