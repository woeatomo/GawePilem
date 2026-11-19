import { decryptSecret, encryptSecret, keyHint } from '@atomo/ai-gateway';
import type { DB } from './index';

/**
 * Daftar secret platform yang boleh diatur superadmin dari aplikasi.
 * ENCRYPTION_KEY dan SUPABASE_SERVICE_ROLE_KEY sengaja TIDAK ada di sini: keduanya
 * dibutuhkan untuk membaca tabel ini, jadi harus tetap di env server.
 */
export const PLATFORM_SECRETS = [
  { name: 'OPENCODE_API_KEY', label: 'OpenCode Zen', group: 'AI', help: 'Teks (riset, naskah, shot list)' },
  { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs', group: 'AI', help: 'Voice over' },
  { name: 'FAL_KEY', label: 'fal.ai', group: 'AI', help: 'Gambar & image-to-video' },
  { name: 'MIDTRANS_SERVER_KEY', label: 'Midtrans server key', group: 'Pembayaran', help: 'Top-up QRIS, VA, e-wallet' },
  { name: 'GOOGLE_CLIENT_ID', label: 'Google OAuth client ID', group: 'Publish', help: 'Koneksi YouTube' },
  { name: 'GOOGLE_CLIENT_SECRET', label: 'Google OAuth client secret', group: 'Publish', help: 'Koneksi YouTube' },
] as const;
export type PlatformSecretName = (typeof PLATFORM_SECRETS)[number]['name'];

export function isPlatformSecretName(n: string): n is PlatformSecretName {
  return PLATFORM_SECRETS.some((s) => s.name === n);
}

/** AAD mengikat ciphertext ke nama secret: nilai FAL_KEY tidak bisa disalin jadi OPENCODE_API_KEY. */
export const secretAad = (name: string) => `platform:${name}`;

export function encryptPlatformSecret(name: PlatformSecretName, value: string, encryptionKey: string) {
  return { encrypted: encryptSecret(value, encryptionKey, secretAad(name)), hint: keyHint(value) };
}

export type SecretSource = 'database' | 'env' | 'none';

/**
 * Resolver secret platform: nilai di database (diatur superadmin) menang atas env.
 * Hasil dekripsi di-cache sebentar supaya tidak membaca DB di setiap panggilan AI;
 * perubahan dari halaman admin berlaku paling lambat `ttlMs` di semua proses.
 */
export class PlatformSecrets {
  private cache: { at: number; values: Map<string, string> } | null = null;
  private loading: Promise<Map<string, string>> | null = null;

  constructor(
    private readonly admin: DB,
    private readonly encryptionKey: string,
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<Map<string, string>> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.values;
    this.loading ??= (async () => {
      const values = new Map<string, string>();
      const { data, error } = await this.admin.from('platform_secrets').select('name, encrypted_value');
      if (error) throw new Error(`Gagal membaca secret platform: ${error.message}`);
      for (const row of data ?? []) {
        try {
          values.set(row.name, decryptSecret(row.encrypted_value, this.encryptionKey, secretAad(row.name)));
        } catch {
          // Ciphertext rusak / ENCRYPTION_KEY berganti: abaikan, jatuh ke env.
          console.error(`[secrets] gagal mendekripsi ${row.name}; memakai env bila ada`);
        }
      }
      this.cache = { at: this.now(), values };
      return values;
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async get(name: PlatformSecretName): Promise<string | undefined> {
    const v = (await this.load()).get(name);
    return v || this.env[name] || undefined;
  }

  async source(name: PlatformSecretName): Promise<SecretSource> {
    if ((await this.load()).get(name)) return 'database';
    return this.env[name] ? 'env' : 'none';
  }

  async all(): Promise<Record<PlatformSecretName, string | undefined>> {
    const out = {} as Record<PlatformSecretName, string | undefined>;
    for (const s of PLATFORM_SECRETS) out[s.name] = await this.get(s.name);
    return out;
  }

  /** Paksa baca ulang (dipanggil setelah superadmin mengubah secret di proses ini). */
  invalidate(): void {
    this.cache = null;
  }
}
