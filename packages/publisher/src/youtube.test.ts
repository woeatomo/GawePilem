import { describe, expect, it, vi } from 'vitest';
import { youtube, PublishError } from './index';

const client = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app/cb' };
const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('YouTube', () => {
  it('authUrl meminta offline access + scope upload', () => {
    const u = new URL(youtube.authUrl(client, 'st'));
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('scope')).toContain('youtube.upload');
    expect(u.searchParams.get('state')).toBe('st');
  });

  it('label konten sintetis selalu aktif & metadata dibersihkan', () => {
    const r = youtube.videoResource({ title: '<b>Judul</b>'.padEnd(150, 'x'), description: 'd', tags: ['#horor', 'kamar7'], privacy: 'public' });
    expect(r.status.containsSyntheticMedia).toBe(true);
    expect(r.snippet.title.length).toBe(100);
    expect(r.snippet.title).not.toMatch(/[<>]/);
    expect(r.snippet.tags).toEqual(['horor', 'kamar7']);
    const sch = youtube.videoResource({ title: 't', description: '', tags: [], privacy: 'public', publishAt: '2026-11-20T12:00:00Z' });
    expect(sch.status).toMatchObject({ privacyStatus: 'private', publishAt: '2026-11-20T12:00:00Z' });
  });

  it('refresh mempertahankan refresh_token lama', async () => {
    const f = vi.fn(async () => json({ access_token: 'new', expires_in: 3600, scope: 's' })) as unknown as typeof fetch;
    const t = await youtube.refreshTokens(client, { accessToken: 'old', refreshToken: 'r1', expiresAt: 0, scope: '' }, f);
    expect(t).toMatchObject({ accessToken: 'new', refreshToken: 'r1' });
    expect(youtube.needsRefresh(t)).toBe(false);
  });

  it('upload resumable: sesi lalu PUT byte', async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(url).split('?')[0]}`);
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body)).status.containsSyntheticMedia).toBe(true);
        return new Response(null, { status: 200, headers: { location: 'https://upload.example/session1' } });
      }
      return json({ id: 'vid123', status: { privacyStatus: 'private' } });
    }) as unknown as typeof fetch;
    const r = await youtube.uploadVideo('tok', new Uint8Array(10), { title: 't', description: '', tags: [], privacy: 'public' }, f);
    expect(r).toEqual({ videoId: 'vid123', privacy: 'private' });
    expect(calls).toEqual(['POST https://www.googleapis.com/upload/youtube/v3/videos', 'PUT https://upload.example/session1']);
  });

  it('kuota habis → PublishError quota (tidak di-retry)', async () => {
    const f = vi.fn(async () => json({ error: { errors: [{ reason: 'uploadLimitExceeded' }] } }, 403)) as unknown as typeof fetch;
    const e = await youtube.uploadVideo('tok', new Uint8Array(1), { title: 't', description: '', tags: [], privacy: 'private' }, f).catch((x) => x);
    expect(e).toBeInstanceOf(PublishError);
    expect(e).toMatchObject({ code: 'quota', retryable: false });
  });
});
