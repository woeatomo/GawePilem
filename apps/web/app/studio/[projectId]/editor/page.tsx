import type { Metadata } from 'next';
import { timelineDuration, timelineSchema, type Timeline } from '@atomo/timeline';
import { buildTimeline } from '@/lib/assemble';
import { loadStage, Stage } from '@/lib/stage';
import { EditorPanel } from './panel';

export const metadata: Metadata = { title: 'Editor' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const saved = b.timeline ? timelineSchema.safeParse(b.timeline.data) : null;
  const built = b.shots.length ? buildTimeline(b) : { timeline: null as Timeline | null, missing: [] as string[] };
  const timeline = saved?.success ? saved.data : built.timeline;
  const missing = built.missing;
  const { data: versions } = await data.session.db.from('timelines').select('version, source, note, created_at').eq('episode_id', b.episode.id).order('version', { ascending: false }).limit(12);
  return (
    <Stage data={data} stage="editor">
      <EditorPanel
        projectId={b.project.id}
        episode={b.episode.number}
        aspect={b.project.aspect_ratio}
        plan={data.session.profile.plan}
        timeline={timeline}
        duration={timeline ? timelineDuration(timeline) : 0}
        missing={missing}
        episodeId={b.episode.id}
        saved={saved?.success ? { version: b.timeline!.version, source: b.timeline!.source, note: b.timeline!.note } : null}
        versions={(versions ?? []).map((v) => ({ version: v.version, source: v.source, note: v.note, at: v.created_at }))}
        shotNo={Object.fromEntries(b.shots.map((s, i) => [s.id, i + 1]))}
        renders={b.renders.map((r) => ({ id: r.id, status: r.status, progress: r.progress, url: r.url, resolution: r.resolution, error: r.error, at: r.created_at, duration: r.duration_sec ? Number(r.duration_sec) : null }))}
      />
    </Stage>
  );
}
