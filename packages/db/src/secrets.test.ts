import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encryptPlatformSecret, isPlatformSecretName, PlatformSecrets, type DB } from './index';

const KEY = randomBytes(32).toString('base64');

function fakeDb(rows: { name: string; encrypted_value: string }[]) {
  const select = vi.fn(async () => ({ data: rows, error: null }));
  return { db: { from: () => ({ select }) } as unknown as DB, select };
}

describe('PlatformSecrets', () => {
  it('nilai di database menang atas env, env jadi cadangan', async () => {
    const { encrypted } = encryptPlatformSecret('FAL_KEY', 'fal-dari-db', KEY);
    const { db } = fakeDb([{ name: 'FAL_KEY', encrypted_value: encrypted }]);
    const s = new PlatformSecrets(db, KEY, { FAL_KEY: 'fal-dari-env', OPENCODE_API_KEY: 'oc-env' });
    expect(await s.get('FAL_KEY')).toBe('fal-dari-db');
    expect(await s.source('FAL_KEY')).toBe('database');
    expect(await s.get('OPENCODE_API_KEY')).toBe('oc-env');
    expect(await s.source('OPENCODE_API_KEY')).toBe('env');
    expect(await s.source('ELEVENLABS_API_KEY')).toBe('none');
  });

  it('ciphertext yang disalin ke nama lain tidak bisa didekripsi (AAD)', async () => {
    const { encrypted } = encryptPlatformSecret('FAL_KEY', 'rahasia', KEY);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = fakeDb([{ name: 'OPENCODE_API_KEY', encrypted_value: encrypted }]);
    const s = new PlatformSecrets(db, KEY, {});
    expect(await s.get('OPENCODE_API_KEY')).toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('cache dipakai sampai TTL habis, invalidate memaksa baca ulang', async () => {
    let t = 0;
    const { db, select } = fakeDb([]);
    const s = new PlatformSecrets(db, KEY, {}, 60_000, () => t);
    await Promise.all([s.get('FAL_KEY'), s.get('FAL_KEY')]);
    expect(select).toHaveBeenCalledTimes(1);
    t = 59_000;
    await s.get('FAL_KEY');
    expect(select).toHaveBeenCalledTimes(1);
    t = 61_000;
    await s.get('FAL_KEY');
    expect(select).toHaveBeenCalledTimes(2);
    s.invalidate();
    await s.get('FAL_KEY');
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('hint hanya 4 karakter terakhir & daftar nama dibatasi', () => {
    expect(encryptPlatformSecret('OPENCODE_API_KEY', 'sk-abcdefghijkl9876', KEY).hint).toBe('sk-…9876');
    expect(isPlatformSecretName('ENCRYPTION_KEY')).toBe(false);
    expect(isPlatformSecretName('SUPABASE_SERVICE_ROLE_KEY')).toBe(false);
    expect(isPlatformSecretName('FAL_KEY')).toBe(true);
  });
});
