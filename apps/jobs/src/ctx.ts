import { createClient } from '@supabase/supabase-js';
import { AIGateway, DEFAULT_MODEL, decryptSecret, ProviderError, type ProviderSetting } from '@atomo/ai-gateway';
import type { Category } from '@atomo/credits';
import { PlatformSecrets, type Database, type DB, type Job } from '@atomo/db';
import { mockResponder } from '@atomo/prompt-engine';
import { RenderClient } from '@atomo/timeline';
import type { Env } from './env';
import type { JobMessage } from './messages';

export interface Ctx {
  env: Env;
  admin: DB;
  secrets: PlatformSecrets;
  mock: boolean;
  gateway(): Promise<AIGateway>;
  render(): Promise<RenderClient>;
  settingFor(workspaceId: string, category: Category, job?: Pick<Job, 'provider' | 'model' | 'billing_mode'>): Promise<ProviderSetting>;
  send(msg: JobMessage, delaySeconds?: number): Promise<void>;
  log(msg: string, extra?: Record<string, unknown>): void;
}

const DEFAULT_PROVIDER: Record<Category, string> = { naskah: 'opencode', vo: 'elevenlabs', image: 'fal', video: 'fal' };

// Cache per isolate (Worker bisa dipakai ulang antar-pesan).
let cached: { key: string; admin: DB; secrets: PlatformSecrets; gw?: { sig: string; g: AIGateway } } | null = null;

export function makeCtx(env: Env): Ctx {
  const key = `${env.NEXT_PUBLIC_SUPABASE_URL}|${env.SUPABASE_SERVICE_ROLE_KEY.slice(-8)}`;
  if (!cached || cached.key !== key) {
    const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    cached = { key, admin, secrets: new PlatformSecrets(admin, env.ENCRYPTION_KEY, env as unknown as Record<string, string | undefined>) };
  }
  const c = cached;
  const mock = env.AI_MOCK === '1' || env.AI_MOCK === 'true';

  return {
    env,
    admin: c.admin,
    secrets: c.secrets,
    mock,
    async gateway() {
      const k = await c.secrets.all();
      const keys = {
        ...(k.OPENCODE_API_KEY ? { opencode: k.OPENCODE_API_KEY } : {}),
        ...(k.ELEVENLABS_API_KEY ? { elevenlabs: k.ELEVENLABS_API_KEY } : {}),
        ...(k.FAL_KEY ? { fal: k.FAL_KEY } : {}),
      };
      const sig = JSON.stringify(Object.keys(keys)) + Object.values(keys).map((v) => v.slice(-6)).join('');
      if (!c.gw || c.gw.sig !== sig) {
        c.gw = { sig, g: new AIGateway({ platformKeys: keys, decrypt: (enc, aad) => decryptSecret(enc, env.ENCRYPTION_KEY, aad), mock, mockResponder }) };
      }
      return c.gw.g;
    },
    async render() {
      if (env.RENDER_BASE_URL) return new RenderClient({ baseUrl: env.RENDER_BASE_URL, apiKey: env.RENDER_API_KEY ?? 'local' });
      const apiKey = await c.secrets.get('RENDI_API_KEY');
      if (!apiKey) throw new ProviderError('RENDI_API_KEY belum diisi di /admin/secrets', 'rendi', 'auth');
      return new RenderClient({ apiKey });
    },
    async settingFor(workspaceId, category, job) {
      const { data } = await c.admin.from('provider_settings').select('provider, model, mode, tier, encrypted_key').eq('workspace_id', workspaceId).eq('category', category).maybeSingle();
      const base: ProviderSetting = data
        ? { category, provider: data.provider, model: data.model, mode: data.mode, tier: data.tier, encryptedKey: data.encrypted_key, keyAad: `${workspaceId}:${category}` }
        : { category, provider: DEFAULT_PROVIDER[category], model: DEFAULT_MODEL[category].standar, mode: 'saldo', tier: 'standar' };
      if (!job) return base;
      // Mode tagihan mengikuti saat job dibuat: job saldo memakai key platform, job BYOK memakai key user.
      const s: ProviderSetting = { ...base, mode: job.billing_mode };
      return job.model && job.provider === base.provider ? { ...s, model: job.model } : s;
    },
    async send(msg, delaySeconds) {
      await env.JOBS.send(msg, delaySeconds ? { delaySeconds: Math.min(43_200, Math.max(0, Math.round(delaySeconds))) } : undefined);
    },
    log(msg, extra = {}) {
      console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));
    },
  };
}
