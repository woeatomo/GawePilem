import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { encryptSecret } from '@atomo/ai-gateway';
import { youtube } from '@atomo/publisher';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';
import { youtubeClient } from '@/lib/youtube';

/** Callback OAuth Google: simpan token terenkripsi. Token tidak pernah dikirim ke client. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = await getSession();
  const c = await youtubeClient();
  const jar = await cookies();
  const raw = jar.get('yt_oauth')?.value;
  jar.delete({ name: 'yt_oauth', path: '/api/oauth/youtube' });
  const saved = raw ? (JSON.parse(raw) as { state: string; back: string }) : null;
  let back = new URL(saved?.back ?? '/studio', url.origin);
  if (back.origin !== url.origin) back = new URL('/studio', url.origin); // cegah open redirect
  if (!s || !c || !saved || saved.state !== url.searchParams.get('state')) {
    back.searchParams.set('yt', 'invalid_state');
    return NextResponse.redirect(back);
  }
  const code = url.searchParams.get('code');
  if (!code) {
    back.searchParams.set('yt', url.searchParams.get('error') ?? 'denied');
    return NextResponse.redirect(back);
  }
  try {
    const tokens = await youtube.exchangeCode(c, code);
    const ch = await youtube.myChannel(tokens.accessToken);
    const admin = supabaseAdmin();
    const enc = encryptSecret(JSON.stringify(tokens), env().ENCRYPTION_KEY, `${s.workspaceId}:youtube:${ch.id}`);
    const { data: existing } = await admin.from('social_accounts').select('encrypted_tokens').eq('workspace_id', s.workspaceId).eq('platform', 'youtube').eq('channel_id', ch.id).maybeSingle();
    // Google kadang tidak mengirim refresh_token ulang; pertahankan yang lama bila ada.
    let finalEnc = enc;
    if (!tokens.refreshToken && existing) {
      const { decryptSecret } = await import('@atomo/ai-gateway');
      const old = JSON.parse(decryptSecret(existing.encrypted_tokens, env().ENCRYPTION_KEY, `${s.workspaceId}:youtube:${ch.id}`)) as { refreshToken: string | null };
      finalEnc = encryptSecret(JSON.stringify({ ...tokens, refreshToken: old.refreshToken }), env().ENCRYPTION_KEY, `${s.workspaceId}:youtube:${ch.id}`);
    }
    await admin.from('social_accounts').upsert(
      {
        workspace_id: s.workspaceId, user_id: s.userId, platform: 'youtube', channel_id: ch.id, channel_name: ch.title, avatar_url: ch.avatar,
        encrypted_tokens: finalEnc, token_expires_at: new Date(tokens.expiresAt).toISOString(), scopes: tokens.scope.split(' '),
        audited: env().YOUTUBE_AUDITED, status: 'active', last_error: null,
      },
      { onConflict: 'workspace_id,platform,channel_id' },
    );
    await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'social.connect', targetType: 'youtube', targetId: ch.id, ip: clientIp(req.headers) });
    back.searchParams.set('yt', 'connected');
  } catch (e) {
    console.error('[oauth/youtube]', e);
    back.searchParams.set('yt', 'error');
  }
  return NextResponse.redirect(back);
}
