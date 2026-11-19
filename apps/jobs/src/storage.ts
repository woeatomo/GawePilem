import type { Ctx } from './ctx';

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'text/plain': 'ass', 'video/mp2t': 'ts', 'audio/mp4': 'm4a',
};
export const extFor = (type: string) => EXT[type.split(';')[0]!.trim()] ?? 'bin';

export function publicUrl(ctx: Ctx, key: string): string {
  return `${ctx.env.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

/** Simpan byte ke R2 dan kembalikan URL publik. key selalu diawali workspace_id. */
export async function putBytes(ctx: Ctx, key: string, data: Uint8Array | string, contentType: string): Promise<string> {
  await ctx.env.MEDIA.put(key, data, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  return publicUrl(ctx, key);
}

/**
 * Unduh dari URL (atau data:) lalu simpan ke R2. File besar (render MP4) di-stream
 * dengan panjang tetap supaya tidak memenuhi memori Worker (128 MB).
 */
export async function putFromUrl(ctx: Ctx, keyNoExt: string, url: string, fallbackType = 'application/octet-stream'): Promise<string> {
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error('data URL tidak valid');
    const bytes = m[2] ? Uint8Array.from(atob(m[3]!), (ch) => ch.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]!));
    return putBytes(ctx, `${keyNoExt}.${extFor(m[1]!)}`, bytes, m[1]!);
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Gagal mengunduh hasil (${res.status})`);
  const type = res.headers.get('content-type')?.split(';')[0] || fallbackType;
  const key = `${keyNoExt}.${extFor(type) === 'bin' ? extFor(fallbackType) : extFor(type)}`;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > 20 * 1024 * 1024) {
    const fixed = new FixedLengthStream(len);
    void res.body.pipeTo(fixed.writable);
    await ctx.env.MEDIA.put(key, fixed.readable, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  } else {
    await ctx.env.MEDIA.put(key, await res.arrayBuffer(), { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  }
  return publicUrl(ctx, key);
}

/** Sajikan objek R2 (dev lokal / tanpa custom domain), mendukung Range untuk pemutar video. */
export async function serveMedia(ctx: Ctx, key: string, req: Request): Promise<Response> {
  if (!/^[0-9a-f-]{36}\/[\w./-]+$/.test(key) || key.includes('..')) return new Response('Bad path', { status: 400 });
  const range = req.headers.get('range');
  const obj = await ctx.env.MEDIA.get(key, range ? { range: req.headers } : {});
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers({ 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' });
  obj.writeHttpMetadata(headers);
  if (range && obj.range && 'offset' in obj.range) {
    const off = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - off;
    headers.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`);
    headers.set('content-length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}
