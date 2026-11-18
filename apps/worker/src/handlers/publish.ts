import { decryptSecret, encryptSecret, ProviderError } from '@atomo/ai-gateway';
import type { Job } from '@atomo/db';
import { PublishError, youtube, type Tokens } from '@atomo/publisher';
import { admin } from '../db';
import { env } from '../env';
import { log, progress, type JobResult } from '../job';
import { fetchAsset } from '../storage';

const DAILY = Number(process.env.YOUTUBE_DAILY_UPLOADS ?? 100);

/** Upload ke YouTube. Idempotent: publikasi yang sudah punya platform_video_id tidak diunggah ulang. */
export async function publish(job: Job, publicationId: string): Promise<JobResult> {
  const { data: pub } = await admin.from('publications').select('*').eq('id', publicationId).single();
  if (!pub) throw new ProviderError('Publikasi tidak ditemukan', 'youtube', 'bad_request');
  if (pub.platform_video_id) return { output: { videoId: pub.platform_video_id, skipped: true } };
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ProviderError('Integrasi YouTube belum dikonfigurasi', 'youtube', 'auth');

  // Kuota project Google per hari dibagi semua user: antrekan ulang bila habis.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from('publications').select('id', { count: 'exact', head: true }).eq('platform', 'youtube').not('platform_video_id', 'is', null).gte('published_at', today.toISOString());
  if ((count ?? 0) >= DAILY) {
    const msg = 'Kuota upload YouTube hari ini habis. Coba lagi besok (kuota direset tengah malam waktu Pasifik).';
    await admin.from('publications').update({ status: 'failed', error: msg }).eq('id', pub.id);
    throw new ProviderError(msg, 'youtube', 'bad_request', 429);
  }

  const { data: acc } = await admin.from('social_accounts').select('*').eq('id', pub.social_account_id).single();
  if (!acc) throw new ProviderError('Akun YouTube tidak ditemukan', 'youtube', 'bad_request');
  const aad = `${acc.workspace_id}:youtube:${acc.channel_id}`;
  let tokens = JSON.parse(decryptSecret(acc.encrypted_tokens, env.ENCRYPTION_KEY, aad)) as Tokens;
  const client = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${env.APP_URL}/api/oauth/youtube/callback` };

  try {
    if (youtube.needsRefresh(tokens)) {
      tokens = await youtube.refreshTokens(client, tokens);
      await admin.from('social_accounts').update({ encrypted_tokens: encryptSecret(JSON.stringify(tokens), env.ENCRYPTION_KEY, aad), token_expires_at: new Date(tokens.expiresAt).toISOString(), status: 'active', last_error: null }).eq('id', acc.id);
    }
    const { data: r } = await admin.from('renders').select('url').eq('id', pub.render_id).single();
    if (!r?.url) throw new ProviderError('File render tidak ada', 'youtube', 'bad_request');
    await admin.from('publications').update({ status: 'uploading', attempts: pub.attempts + 1, error: null }).eq('id', pub.id);
    const file = await fetchAsset(r.url);
    const meta = pub.metadata as { title: string; description: string; tags: string[] };
    let description = meta.description;
    if (pub.variant === 'shorts' && !/#shorts/i.test(meta.title + description)) description += '\n\n#Shorts';
    if (!/dibuat dengan bantuan AI/i.test(description)) description += '\n\nKonten ini dibuat dengan bantuan AI.';
    const up = await youtube.uploadVideo(tokens.accessToken, file.data, {
      title: meta.title, description, tags: meta.tags, privacy: pub.privacy as 'private' | 'unlisted' | 'public',
      ...(pub.scheduled_at ? { publishAt: new Date(pub.scheduled_at).toISOString() } : {}),
    }, fetch, (pct) => void progress(job.id, pct));
    await admin.from('publications').update({ status: 'published', platform_video_id: up.videoId, privacy: up.privacy, published_at: new Date().toISOString(), error: null }).eq('id', pub.id);
    if (pub.episode_id) await admin.from('episodes').update({ status: 'published' }).eq('id', pub.episode_id);
    await admin.from('audit_log').insert({ actor_id: acc.user_id, workspace_id: acc.workspace_id, action: 'publish.done', target_type: 'publication', target_id: pub.id, details: { videoId: up.videoId, privacy: up.privacy } });
    return { output: { videoId: up.videoId, privacy: up.privacy } };
  } catch (e) {
    const pe = e instanceof PublishError ? e : null;
    const msg = pe?.message ?? (e as Error).message;
    log('publish gagal', { publicationId, error: msg });
    if (pe?.code === 'auth') await admin.from('social_accounts').update({ status: 'expired', last_error: msg.slice(0, 300) }).eq('id', acc.id);
    await admin.from('publications').update({ status: 'failed', error: msg.slice(0, 500) }).eq('id', pub.id);
    if (pe) throw new ProviderError(msg, 'youtube', pe.code === 'auth' ? 'auth' : pe.code === 'quota' ? 'bad_request' : pe.retryable ? 'network' : 'bad_request', pe.status);
    throw e;
  }
}
