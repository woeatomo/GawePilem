import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ass': 'text/plain',
};

/** Penyaji media lokal untuk dev (driver storage "local"). Produksi memakai S3 + CDN. */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const root = env().LOCAL_MEDIA_DIR;
  if (!root) return new Response('Not found', { status: 404 });
  const s = await getSession();
  const { path } = await ctx.params;
  // Path selalu diawali workspace_id; hanya anggota workspace yang boleh membaca.
  if (!s || path[0] !== s.workspaceId) return new Response('Forbidden', { status: 403 });
  const full = normalize(join(root, ...path));
  if (!full.startsWith(normalize(root) + sep)) return new Response('Bad path', { status: 400 });
  try {
    const st = await stat(full);
    const range = req.headers.get('range');
    const type = TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream';
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m?.[1] ? Number(m[1]) : 0;
      const end = m?.[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      return new Response(Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream, {
        status: 206,
        headers: { 'content-type': type, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1) },
      });
    }
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: { 'content-type': type, 'content-length': String(st.size), 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
