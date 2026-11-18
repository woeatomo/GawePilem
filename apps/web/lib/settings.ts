import 'server-only';
import { AIGateway, DEFAULT_MODEL, decryptSecret, type ProviderSetting } from '@atomo/ai-gateway';
import { buildRateTable, CATEGORIES, type Category, type RateTable } from '@atomo/credits';
import type { DB } from '@atomo/db';
import { mockResponder } from '@atomo/prompt-engine';
import { env } from './env';
import { supabaseAdmin } from './supabase/server';

export const DEFAULT_PROVIDER: Record<Category, string> = { naskah: 'opencode', vo: 'elevenlabs', image: 'fal', video: 'fal' };

/** Pengaturan publik (tanpa key) untuk UI. */
export interface PublicSetting {
  category: Category;
  provider: string;
  model: string;
  mode: 'saldo' | 'byok';
  tier: 'hemat' | 'standar' | 'premium';
  keyHint: string | null;
}
export type PublicSettings = Record<Category, PublicSetting>;

export async function loadPublicSettings(db: DB, workspaceId: string): Promise<PublicSettings> {
  const { data } = await db
    .from('provider_settings')
    .select('category, provider, model, mode, tier, key_hint')
    .eq('workspace_id', workspaceId);
  const out = {} as PublicSettings;
  for (const c of CATEGORIES) {
    const row = data?.find((r) => r.category === c);
    out[c] = row
      ? { category: c, provider: row.provider, model: row.model, mode: row.mode, tier: row.tier, keyHint: row.key_hint }
      : { category: c, provider: DEFAULT_PROVIDER[c], model: DEFAULT_MODEL[c].standar, mode: 'saldo', tier: 'standar', keyHint: null };
  }
  return out;
}

/** Pengaturan lengkap termasuk key terenkripsi. HANYA server, via service_role. */
export async function loadSecretSetting(workspaceId: string, category: Category): Promise<ProviderSetting> {
  const { data } = await supabaseAdmin()
    .from('provider_settings')
    .select('category, provider, model, mode, tier, encrypted_key')
    .eq('workspace_id', workspaceId)
    .eq('category', category)
    .maybeSingle();
  if (data)
    return {
      category, provider: data.provider, model: data.model, mode: data.mode, tier: data.tier,
      encryptedKey: data.encrypted_key, keyAad: `${workspaceId}:${category}`,
    };
  return { category, provider: DEFAULT_PROVIDER[category], model: DEFAULT_MODEL[category].standar, mode: 'saldo', tier: 'standar' };
}

export async function loadRates(db: DB): Promise<RateTable> {
  const { data, error } = await db.from('rates').select('category, tier, credits_per_unit');
  if (error) throw new Error(`Gagal memuat tarif: ${error.message}`);
  return buildRateTable(data.map((r) => ({ category: r.category, tier: r.tier, creditsPerUnit: Number(r.credits_per_unit) })));
}

let gw: AIGateway | null = null;
export function gateway(): AIGateway {
  if (!gw) {
    const e = env();
    gw = new AIGateway({
      platformKeys: {
        ...(e.OPENCODE_API_KEY ? { opencode: e.OPENCODE_API_KEY } : {}),
        ...(e.ELEVENLABS_API_KEY ? { elevenlabs: e.ELEVENLABS_API_KEY } : {}),
        ...(e.FAL_KEY ? { fal: e.FAL_KEY } : {}),
      },
      decrypt: (enc, aad) => decryptSecret(enc, e.ENCRYPTION_KEY, aad),
      mock: e.AI_MOCK,
      mockResponder,
    });
  }
  return gw;
}
