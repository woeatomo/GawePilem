import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { youtube } from '@atomo/publisher';
import { getSession } from '@/lib/auth';
import { youtubeClient } from '@/lib/youtube';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL('/login', req.url));
  const c = youtubeClient();
  if (!c) return new Response('Integrasi YouTube belum dikonfigurasi (GOOGLE_CLIENT_ID/SECRET).', { status: 503 });
  const back = new URL(req.url).searchParams.get('back') ?? '/studio';
  const state = randomBytes(24).toString('base64url');
  (await cookies()).set('yt_oauth', JSON.stringify({ state, back: back.startsWith('/') ? back : '/studio' }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/oauth/youtube' });
  return NextResponse.redirect(youtube.authUrl(c, state));
}
