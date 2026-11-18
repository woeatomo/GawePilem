import { AIGateway, DEFAULT_MODEL, decryptSecret, type ProviderSetting } from '@atomo/ai-gateway';
import type { Category } from '@atomo/credits';
import { mockResponder } from '@atomo/prompt-engine';
import { admin } from './db';
import { env } from './env';

export const gateway = new AIGateway({
  platformKeys: {
    ...(env.OPENCODE_API_KEY ? { opencode: env.OPENCODE_API_KEY } : {}),
    ...(env.ELEVENLABS_API_KEY ? { elevenlabs: env.ELEVENLABS_API_KEY } : {}),
    ...(env.FAL_KEY ? { fal: env.FAL_KEY } : {}),
  },
  decrypt: (enc, aad) => decryptSecret(enc, env.ENCRYPTION_KEY, aad),
  mock: env.AI_MOCK,
  mockResponder,
});

const DEFAULT_PROVIDER: Record<Category, string> = { naskah: 'opencode', vo: 'elevenlabs', image: 'fal', video: 'fal' };

/** Setting dipakai sesuai saat job dibuat (provider/model tercatat di jobs). */
export async function settingFor(
  workspaceId: string,
  category: Category,
  job?: { provider: string | null; model: string | null; billing_mode: 'saldo' | 'byok' },
): Promise<ProviderSetting> {
  const { data } = await admin.from('provider_settings').select('provider, model, mode, tier, encrypted_key').eq('workspace_id', workspaceId).eq('category', category).maybeSingle();
  const base: ProviderSetting = data
    ? { category, provider: data.provider, model: data.model, mode: data.mode, tier: data.tier, encryptedKey: data.encrypted_key, keyAad: `${workspaceId}:${category}` }
    : { category, provider: DEFAULT_PROVIDER[category], model: DEFAULT_MODEL[category].standar, mode: 'saldo', tier: 'standar' };
  if (!job) return base;
  // Mode tagihan mengikuti saat job dibuat: job saldo (sudah dibayar) memakai key platform,
  // job BYOK (tidak dipotong saldo) wajib memakai key user.
  const s: ProviderSetting = { ...base, mode: job.billing_mode };
  return job.model && job.provider === base.provider ? { ...s, model: job.model } : s;
}
