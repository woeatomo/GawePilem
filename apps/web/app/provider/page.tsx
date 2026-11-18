import type { Metadata } from 'next';
import { CATEGORIES } from '@atomo/credits';
import { MODELS } from '@atomo/ai-gateway';
import { AccountPage, loadAccount } from '@/lib/account';
import { env } from '@/lib/env';
import { ProviderForm } from './form';

export const metadata: Metadata = { title: 'Provider AI' };

const PROVIDERS: Record<string, { id: string; name: string }[]> = {
  naskah: [{ id: 'opencode', name: 'OpenCode Zen' }],
  vo: [{ id: 'elevenlabs', name: 'ElevenLabs' }],
  image: [{ id: 'fal', name: 'fal.ai' }],
  video: [{ id: 'fal', name: 'fal.ai' }],
};

export default async function Provider() {
  const data = await loadAccount();
  const e = env();
  const platform = { opencode: Boolean(e.OPENCODE_API_KEY), elevenlabs: Boolean(e.ELEVENLABS_API_KEY), fal: Boolean(e.FAL_KEY) };
  return (
    <AccountPage data={data} active="provider" title="Provider AI">
      <header className="vhead">
        <div>
          <p className="eyebrow">PENGATURAN</p>
          <h1>Provider AI</h1>
          <p className="lede">Pilih provider, model, dan tier per kategori. Mode <b>Saldo</b> memakai key kami dan memotong kredit. Mode <b>BYOK</b> memakai API key kamu sendiri: tidak memotong saldo, biaya langsung ditagih provider.</p>
        </div>
      </header>
      {e.AI_MOCK && <p className="note">Mode demo aktif (AI_MOCK=1): semua kategori memakai adapter tiruan, tidak ada panggilan ke provider.</p>}
      <div className="provs">
        {CATEGORIES.map((c) => (
          <ProviderForm
            key={c}
            category={c}
            current={data.settings[c]}
            providers={PROVIDERS[c]!}
            models={MODELS.filter((m) => m.category === c && m.provider !== 'mock').map((m) => ({ id: m.id, label: m.label, provider: m.provider }))}
            platformReady={platform}
          />
        ))}
      </div>
      <p className="note">API key dienkripsi AES-256-GCM di server dan tidak pernah dikirim kembali ke browser. Hanya 4 karakter terakhir yang ditampilkan.</p>
    </AccountPage>
  );
}
