import { z } from 'zod';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // Analitik ringan: jam tonton, durasi & persentase tonton (retensi), subscriber dari video.
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];
export const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
/** Kuota default videos.insert per project Google Cloud per hari. */
export const YOUTUBE_DEFAULT_DAILY_UPLOADS = 100;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
  scope: string;
}

export class PublishError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'quota' | 'bad_request' | 'network' | 'unknown',
    readonly status?: number,
  ) {
    super(message);
  }
  get retryable() {
    return this.code === 'network' || this.code === 'unknown';
  }
}

export function authUrl(c: OAuthClient, state: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', c.clientId);
  u.searchParams.set('redirect_uri', c.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  return u.toString();
}

const tokenRes = z.object({ access_token: z.string(), expires_in: z.number(), refresh_token: z.string().optional(), scope: z.string().default('') });

async function errorFor(res: Response): Promise<PublishError> {
  const body = await res.text().catch(() => '');
  if (res.status === 401 || /invalid_grant/.test(body)) return new PublishError(`Otorisasi YouTube ditolak: ${body.slice(0, 200)}`, 'auth', res.status);
  if (res.status === 403 && /quota|uploadLimitExceeded|rateLimitExceeded/i.test(body)) return new PublishError('Kuota upload YouTube habis untuk hari ini', 'quota', res.status);
  if (res.status >= 400 && res.status < 500) return new PublishError(`YouTube menolak permintaan (${res.status}): ${body.slice(0, 300)}`, 'bad_request', res.status);
  return new PublishError(`YouTube error ${res.status}`, 'unknown', res.status);
}

async function tokenRequest(params: Record<string, string>, f: typeof fetch): Promise<Tokens> {
  const res = await f('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  if (!res.ok) throw await errorFor(res);
  const t = tokenRes.parse(await res.json());
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: Date.now() + t.expires_in * 1000, scope: t.scope };
}

export function exchangeCode(c: OAuthClient, code: string, f: typeof fetch = fetch): Promise<Tokens> {
  return tokenRequest({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }, f);
}

/** Refresh token. refresh_token lama dipertahankan bila Google tidak mengirim yang baru. */
export async function refreshTokens(c: OAuthClient, t: Tokens, f: typeof fetch = fetch): Promise<Tokens> {
  if (!t.refreshToken) throw new PublishError('Tidak ada refresh token. Hubungkan ulang akun.', 'auth');
  const n = await tokenRequest({ refresh_token: t.refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token' }, f);
  return { ...n, refreshToken: n.refreshToken ?? t.refreshToken };
}

export function needsRefresh(t: Tokens, now = Date.now()): boolean {
  return t.expiresAt - now < 60_000;
}

const channelRes = z.object({ items: z.array(z.object({ id: z.string(), snippet: z.object({ title: z.string(), thumbnails: z.object({ default: z.object({ url: z.string() }).optional() }).partial().optional() }) })).default([]) });

export async function myChannel(accessToken: string, f: typeof fetch = fetch): Promise<{ id: string; title: string; avatar: string | null }> {
  const res = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await errorFor(res);
  const c = channelRes.parse(await res.json()).items[0];
  if (!c) throw new PublishError('Akun Google ini belum punya channel YouTube', 'bad_request');
  return { id: c.id, title: c.snippet.title, avatar: c.snippet.thumbnails?.default?.url ?? null };
}

export interface YouTubeMeta {
  title: string;
  description: string;
  tags: string[];
  privacy: 'private' | 'unlisted' | 'public';
  /** RFC3339; hanya berlaku bila privacy=private (YouTube mengubah ke public pada waktunya). */
  publishAt?: string;
  categoryId?: string;
  madeForKids?: boolean;
  playlistId?: string;
}

/** Metadata yang dikirim ke YouTube. Label konten sintetis/AI SELALU aktif. */
export function videoResource(m: YouTubeMeta) {
  const title = m.title.replace(/[<>]/g, '').slice(0, 100);
  const description = m.description.replace(/[<>]/g, '').slice(0, 5000);
  const tags: string[] = [];
  let len = 0;
  for (const t of m.tags.map((x) => x.replace(/^#/, '').trim()).filter(Boolean)) {
    if (len + t.length + 1 > 480) break;
    tags.push(t);
    len += t.length + 1;
  }
  return {
    snippet: { title, description, tags, categoryId: m.categoryId ?? '1' },
    status: {
      privacyStatus: m.publishAt ? 'private' : m.privacy,
      ...(m.publishAt ? { publishAt: m.publishAt } : {}),
      selfDeclaredMadeForKids: m.madeForKids ?? false,
      // Pengungkapan konten sintetis (altered or synthetic content) — wajib & tidak bisa dimatikan.
      containsSyntheticMedia: true,
    },
  };
}

/**
 * Upload resumable. Langkah 1 membuat sesi (dapat Location), langkah 2 PUT seluruh byte.
 * Project Google yang belum lolos audit: YouTube memaksa video menjadi private.
 */
/** Isi video: byte di memori, atau stream + ukuran (Workers: hindari memuat ±100 MB ke memori). */
export type VideoBody = Uint8Array | { stream: ReadableStream<Uint8Array>; size: number };

export async function uploadVideo(
  accessToken: string,
  file: VideoBody,
  meta: YouTubeMeta,
  f: typeof fetch = fetch,
  onProgress?: (pct: number) => void,
): Promise<{ videoId: string; privacy: string }> {
  const init = await f('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': 'video/mp4',
      'x-upload-content-length': String(file instanceof Uint8Array ? file.byteLength : file.size),
    },
    body: JSON.stringify(videoResource(meta)),
  });
  if (!init.ok) throw await errorFor(init);
  const location = init.headers.get('location');
  if (!location) throw new PublishError('YouTube tidak mengembalikan URL upload', 'unknown');
  onProgress?.(10);
  const size = file instanceof Uint8Array ? file.byteLength : file.size;
  const body: Blob | ReadableStream<Uint8Array> = file instanceof Uint8Array ? new Blob([file as Uint8Array<ArrayBuffer>]) : file.stream;
  const put = await f(location, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(size) }, body, ...(file instanceof Uint8Array ? {} : { duplex: 'half' }) } as RequestInit);
  if (!put.ok) throw await errorFor(put);
  onProgress?.(100);
  const v = z.object({ id: z.string(), status: z.object({ privacyStatus: z.string() }).partial().optional() }).parse(await put.json());
  return { videoId: v.id, privacy: v.status?.privacyStatus ?? meta.privacy };
}

// ---------------------------------------------------------------------------
// Statistik & analitik (dibaca berkala oleh Worker job).
// ---------------------------------------------------------------------------

const num = z.coerce.number().int().nonnegative().catch(0);

const videosRes = z.object({
  items: z.array(z.object({ id: z.string(), statistics: z.object({ viewCount: num, likeCount: num, commentCount: num }).partial().default({}), status: z.object({ privacyStatus: z.string() }).partial().optional() })).default([]),
});

export interface VideoStats { views: number; likes: number; comments: number; privacy: string | null }

/** Statistik publik per video (maks 50 id per panggilan, dipecah otomatis). */
export async function videoStats(accessToken: string, ids: string[], f: typeof fetch = fetch): Promise<Record<string, VideoStats>> {
  const out: Record<string, VideoStats> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const res = await f(`https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${part.map(encodeURIComponent).join(',')}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw await errorFor(res);
    for (const v of videosRes.parse(await res.json()).items) {
      out[v.id] = { views: v.statistics.viewCount ?? 0, likes: v.statistics.likeCount ?? 0, comments: v.statistics.commentCount ?? 0, privacy: v.status?.privacyStatus ?? null };
    }
  }
  return out;
}

const channelStatsRes = z.object({
  items: z.array(z.object({ statistics: z.object({ subscriberCount: num, viewCount: num, videoCount: num, hiddenSubscriberCount: z.boolean().optional() }).partial() })).default([]),
});

export async function channelStats(accessToken: string, f: typeof fetch = fetch): Promise<{ subscribers: number; views: number; videos: number }> {
  const res = await f('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await errorFor(res);
  const s = channelStatsRes.parse(await res.json()).items[0]?.statistics ?? {};
  return { subscribers: s.subscriberCount ?? 0, views: s.viewCount ?? 0, videos: s.videoCount ?? 0 };
}

const reportRes = z.object({
  columnHeaders: z.array(z.object({ name: z.string() })).default([]),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).default([]),
});

/** Query YouTube Analytics API v2 (ids=channel==MINE). Baris dikembalikan sebagai objek per nama kolom. */
export async function analyticsReport(
  accessToken: string,
  q: { startDate: string; endDate: string; metrics: string[]; dimensions?: string[]; filters?: string; maxResults?: number },
  f: typeof fetch = fetch,
): Promise<Record<string, string | number>[]> {
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids', 'channel==MINE');
  u.searchParams.set('startDate', q.startDate);
  u.searchParams.set('endDate', q.endDate);
  u.searchParams.set('metrics', q.metrics.join(','));
  if (q.dimensions?.length) u.searchParams.set('dimensions', q.dimensions.join(','));
  if (q.filters) u.searchParams.set('filters', q.filters);
  if (q.maxResults) u.searchParams.set('maxResults', String(q.maxResults));
  const res = await f(u.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await errorFor(res);
  const r = reportRes.parse(await res.json());
  return r.rows.map((row) => Object.fromEntries(r.columnHeaders.map((h, i) => [h.name, row[i]!])));
}

export interface VideoAnalytics { minutesWatched: number; avgViewDurationSec: number; avgViewPct: number; subsGained: number }

/** Jam tonton & retensi per video sejak tanggal tertentu (filter video maks 50 id per panggilan). */
export async function videoAnalytics(accessToken: string, ids: string[], since: string, until: string, f: typeof fetch = fetch): Promise<Record<string, VideoAnalytics>> {
  const out: Record<string, VideoAnalytics> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const rows = await analyticsReport(accessToken, {
      startDate: since, endDate: until, dimensions: ['video'], filters: `video==${part.join(',')}`, maxResults: 50,
      metrics: ['estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained'],
    }, f);
    for (const r of rows) {
      out[String(r.video)] = {
        minutesWatched: Number(r.estimatedMinutesWatched ?? 0), avgViewDurationSec: Number(r.averageViewDuration ?? 0),
        avgViewPct: Math.round(Number(r.averageViewPercentage ?? 0) * 10) / 10, subsGained: Number(r.subscribersGained ?? 0),
      };
    }
  }
  return out;
}
