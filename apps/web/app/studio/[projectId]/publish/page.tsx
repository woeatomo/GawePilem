import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { loadStage, Stage } from '@/lib/stage';
import { youtubeClient } from '@/lib/youtube';
import { PublishPanel } from './panel';

export const metadata: Metadata = { title: 'Publish' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const sp = await props.searchParams;
  const b = data.bundle;
  const db = data.session.db;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [{ data: accounts }, { data: pubs }, { count: usedToday }] = await Promise.all([
    db.from('social_accounts').select('id, platform, channel_name, avatar_url, status, audited, last_error').eq('workspace_id', b.project.workspace_id),
    db.from('publications').select('id, platform, variant, status, platform_video_id, privacy, error, created_at, metadata').eq('episode_id', b.episode.id).order('created_at', { ascending: false }),
    db.from('publications').select('id', { count: 'exact', head: true }).eq('platform', 'youtube').gte('created_at', today.toISOString()),
  ]);
  const ready = b.renders.filter((r) => r.status === 'ready' && r.url);
  const e = env();
  return (
    <Stage data={data} stage="publish">
      <PublishPanel
        projectId={b.project.id}
        episode={b.episode.number}
        title={b.episode.title}
        synopsis={b.episode.synopsis}
        renders={ready.map((r) => ({ id: r.id, url: r.url, aspect: r.aspect_ratio, duration: Number(r.duration_sec ?? 0), variant: r.variant, at: r.created_at }))}
        accounts={(accounts ?? []).map((a) => ({ id: a.id, platform: a.platform, name: a.channel_name, avatar: a.avatar_url, status: a.status, audited: a.audited, error: a.last_error }))}
        pubs={(pubs ?? []).map((p) => ({ id: p.id, variant: p.variant, status: p.status, videoId: p.platform_video_id, privacy: p.privacy, error: p.error, at: p.created_at, title: String((p.metadata as { title?: string })?.title ?? '') }))}
        youtubeConfigured={Boolean(await youtubeClient())}
        quota={{ used: usedToday ?? 0, limit: e.YOUTUBE_DAILY_UPLOADS }}
        plan={data.session.profile.plan}
        flash={typeof sp.yt === 'string' ? sp.yt : null}
      />
    </Stage>
  );
}
