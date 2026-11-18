import type { Metadata } from 'next';
import { timelineDuration } from '@atomo/timeline';
import { buildTimeline } from '@/lib/assemble';
import { loadStage, Stage } from '@/lib/stage';
import { EditorPanel } from './panel';

export const metadata: Metadata = { title: 'Editor' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const { timeline, missing } = b.shots.length ? buildTimeline(b) : { timeline: null, missing: [] };
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
        shotNo={Object.fromEntries(b.shots.map((s, i) => [s.id, i + 1]))}
        renders={b.renders.map((r) => ({ id: r.id, status: r.status, progress: r.progress, url: r.url, resolution: r.resolution, error: r.error, at: r.created_at, duration: r.duration_sec ? Number(r.duration_sec) : null }))}
      />
    </Stage>
  );
}
