import { decryptSecret, encryptSecret, ProviderError } from '@atomo/ai-gateway';
import type { Row } from '@atomo/db';
import { youtube, type Tokens } from '@atomo/publisher';
import type { Ctx } from '../ctx';

/** Token akses YouTube yang masih berlaku untuk satu akun (refresh + simpan terenkripsi bila perlu). */
export async function youtubeAccess(ctx: Ctx, acc: Row<'social_accounts'>): Promise<Tokens> {
  const [clientId, clientSecret] = await Promise.all([ctx.secrets.get('GOOGLE_CLIENT_ID'), ctx.secrets.get('GOOGLE_CLIENT_SECRET')]);
  if (!clientId || !clientSecret) throw new ProviderError('Integrasi YouTube belum dikonfigurasi', 'youtube', 'auth');
  const aad = `${acc.workspace_id}:youtube:${acc.channel_id}`;
  let tokens = JSON.parse(decryptSecret(acc.encrypted_tokens, ctx.env.ENCRYPTION_KEY, aad)) as Tokens;
  if (youtube.needsRefresh(tokens)) {
    tokens = await youtube.refreshTokens({ clientId, clientSecret, redirectUri: `${ctx.env.APP_URL}/api/oauth/youtube/callback` }, tokens);
    await ctx.admin
      .from('social_accounts')
      .update({ encrypted_tokens: encryptSecret(JSON.stringify(tokens), ctx.env.ENCRYPTION_KEY, aad), token_expires_at: new Date(tokens.expiresAt).toISOString(), status: 'active', last_error: null })
      .eq('id', acc.id);
  }
  return tokens;
}
