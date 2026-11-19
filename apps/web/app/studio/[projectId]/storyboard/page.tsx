import type { Metadata } from 'next';
import { loadStage, Stage } from '@/lib/stage';
import type { CameraMove } from '@atomo/timeline';
import { StoryboardPanel, type ShotView } from './panel';

export const metadata: Metadata = { title: 'Storyboard' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const names = new Map(b.characters.map((c) => [c.id, { name: c.name, locked: Boolean(c.locked_at) }]));
  const shots: ShotView[] = b.shots.map((s, i) => ({
    id: s.id, no: i + 1, sceneNo: s.scene_no, type: s.shot_type, camera: s.camera, durationSec: Number(s.duration_sec), description: s.description,
    dialog: s.dialog, characters: s.character_ids.map((id) => names.get(id)?.name ?? '?'), unlocked: s.character_ids.some((id) => !names.get(id)?.locked),
    keyframeUrl: s.keyframe_url, keyframeStatus: s.keyframe_status, approved: s.approved, clipStatus: s.clip_status,
    motion: s.motion === 'camera' ? 'camera' : 'ai', cameraMove: s.camera_move as CameraMove,
  }));
  return (
    <Stage data={data} stage="storyboard">
      <StoryboardPanel
        projectId={b.project.id}
        episodeId={b.episode.id}
        episode={b.episode.number}
        aspect={b.project.aspect_ratio}
        sceneCount={b.script?.content.scenes.length ?? 0}
        scriptReady={(b.script?.content.scenes ?? []).some((s) => s.body)}
        writtenScenes={(b.script?.content.scenes ?? []).flatMap((s, i) => (s.body ? [i + 1] : []))}
        shots={shots}
      />
    </Stage>
  );
}
