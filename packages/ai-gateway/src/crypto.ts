import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Enkripsi AES-256-GCM untuk key BYOK & token OAuth. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 * ENCRYPTION_KEY = 32 byte acak, base64. Buat dengan: openssl rand -base64 32
 */
const VERSION = 'v1';

function loadKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('ENCRYPTION_KEY belum di-set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY harus 32 byte (base64)');
  return key;
}

export function encryptSecret(plaintext: string, keyB64: string | undefined = process.env.ENCRYPTION_KEY, aad = ''): string {
  const key = loadKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, keyB64: string | undefined = process.env.ENCRYPTION_KEY, aad = ''): string {
  const key = loadKey(keyB64);
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== VERSION || !iv || !tag || !ct) throw new Error('Format secret terenkripsi tidak dikenal');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** Petunjuk key untuk UI, mis. "sk-…9f2c". Tidak pernah membocorkan lebih dari 4 karakter akhir. */
export function keyHint(secret: string): string {
  const s = secret.trim();
  if (s.length < 12) return '…';
  const prefix = /^[a-z]{2,4}[-_]/i.exec(s)?.[0] ?? '';
  return `${prefix}…${s.slice(-4)}`;
}
