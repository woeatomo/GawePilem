import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

export interface Storage {
  /** Simpan file dan kembalikan URL yang bisa dipakai web app. key selalu diawali workspace_id. */
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
}

class LocalStorage implements Storage {
  private root = resolve(env.LOCAL_MEDIA_DIR);
  async put(key: string, data: Uint8Array): Promise<string> {
    const full = join(this.root, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return `/api/media/${key}`;
  }
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' },
  });
  async put(key: string, data: Uint8Array, contentType: string): Promise<string> {
    if (!env.S3_BUCKET || !env.S3_PUBLIC_URL) throw new Error('S3_BUCKET dan S3_PUBLIC_URL wajib untuk STORAGE_DRIVER=s3');
    await this.client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: data, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
    return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
}

export const storage: Storage = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

/** Unduh aset (http(s), data:, atau URL media lokal) ke Uint8Array. */
export async function fetchAsset(url: string): Promise<{ data: Uint8Array; contentType: string }> {
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error('data URL tidak valid');
    const data = m[2] ? Buffer.from(m[3]!, 'base64') : Buffer.from(decodeURIComponent(m[3]!));
    return { data: new Uint8Array(data), contentType: m[1]! };
  }
  if (url.startsWith('/api/media/')) {
    const data = await readFile(join(resolve(env.LOCAL_MEDIA_DIR), url.slice('/api/media/'.length)));
    return { data: new Uint8Array(data), contentType: 'application/octet-stream' };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Gagal mengunduh aset (${res.status})`);
  return { data: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

/** URL absolut untuk dikirim ke provider AI (reference image harus bisa diakses publik). */
export function publicUrl(url: string): string {
  return url.startsWith('/') ? `${env.APP_URL}${url}` : url;
}

export function extFor(contentType: string): string {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[contentType] ?? 'bin';
}
