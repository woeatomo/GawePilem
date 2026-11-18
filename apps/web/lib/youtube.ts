import 'server-only';
import type { OAuthClient } from '@atomo/publisher';
import { env } from './env';

export function youtubeClient(): OAuthClient | null {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: `${e.APP_URL}/api/oauth/youtube/callback` };
}
