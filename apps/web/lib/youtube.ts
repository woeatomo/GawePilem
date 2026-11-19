import 'server-only';
import type { OAuthClient } from '@atomo/publisher';
import { env } from './env';
import { platformSecret } from './platform';

export async function youtubeClient(): Promise<OAuthClient | null> {
  const e = env();
  const [clientId, clientSecret] = await Promise.all([platformSecret('GOOGLE_CLIENT_ID'), platformSecret('GOOGLE_CLIENT_SECRET')]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${e.APP_URL}/api/oauth/youtube/callback` };
}
