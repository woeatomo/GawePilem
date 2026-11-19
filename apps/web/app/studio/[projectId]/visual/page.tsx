import type { Metadata } from 'next';
import { loadStage, Stage } from '@/lib/stage';
import { VisualPanel } from './panel';

export const metadata: Metadata = { title: 'Produksi visual' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  return (
    <Stage data={data} stage="visual">
      <VisualPanel
        projectId={b.project.id}
        episode={b.episode.number}
        aspect={b.project.aspect_ratio}
        tier={data.settings.video.tier}
        shots={b.shots.map((s, i) => ({
          id: s.id, no: i + 1, sceneNo: s.scene_no, durationSec: Number(s.duration_sec), description: s.description, keyframeUrl: s.keyframe_url,
          approved: s.approved, keyframeReady: s.keyframe_status === 'ready', clipStatus: s.clip_status, clipProgress: s.clip_progress, clipUrl: s.clip_url, motion: s.motion === 'camera' ? 'camera' : 'ai',
        }))}
      />
    </Stage>
  );
}
