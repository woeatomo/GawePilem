import 'server-only';
import type { ReactNode } from 'react';
import { CATEGORIES } from '@atomo/credits';
import { getBalance } from '@atomo/db';
import { Shell } from '@/components/shell';
import { StudioProvider } from '@/components/studio-context';
import { requireSession } from './auth';
import { env } from './env';
import { loadPublicSettings, loadRates } from './settings';

/** Kerangka halaman akun (Saldo, Provider) tanpa project. */
export async function loadAccount() {
  const session = await requireSession();
  const [rates, settings, balance] = await Promise.all([loadRates(session.db), loadPublicSettings(session.db, session.workspaceId), getBalance(session.db, session.userId)]);
  return { session, rates, settings, balance };
}

export function AccountPage({ data, active, title, children }: { data: Awaited<ReturnType<typeof loadAccount>>; active: string; title: string; children: ReactNode }) {
  const e = env();
  return (
    <Shell email={data.session.email} balance={data.balance} aiLabel={e.AI_MOCK ? 'AI: mode demo (mock)' : 'AI siap'} aiLive active={active} crumbs={<b>{title}</b>}>
      <StudioProvider value={{ projectId: '', episode: 1, rates: data.rates, settings: Object.fromEntries(CATEGORIES.map((c) => [c, data.settings[c]])) as typeof data.settings, balance: data.balance }}>
        <div className="wrap">{children}</div>
      </StudioProvider>
    </Shell>
  );
}
