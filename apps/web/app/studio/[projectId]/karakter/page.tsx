import type { Metadata } from 'next';
import { loadStage, Stage } from '@/lib/stage';
import { CharactersPanel, type CharView } from './panel';

export const metadata: Metadata = { title: 'Cerita & karakter' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const { data: pending } = await data.session.db.from('jobs').select('input').eq('project_id', b.project.id).eq('action', 'charref').in('status', ['queued', 'running']);
  const busyIds = new Set((pending ?? []).map((j) => ((j.input as { params?: { characterId?: string } })?.params?.characterId) ?? ''));
  const chars: CharView[] = b.characters.map((c) => ({
    id: c.id, name: c.name, age: c.age, role: c.role, traits: c.traits, look: c.look, sampleLine: c.sample_line, voiceId: c.voice_id,
    locked: Boolean(c.locked_at), refImages: (Array.isArray(c.ref_images) ? c.ref_images : []) as { angle: string; url: string }[], generating: busyIds.has(c.id),
  }));
  return (
    <Stage data={data} stage="karakter">
      <CharactersPanel projectId={b.project.id} logline={b.bible?.logline ?? ''} premise={b.bible?.premise ?? ''} hasResearch={Boolean(b.bible?.research || b.bible?.topic)} chars={chars} episodeCount={b.project.episode_count} />
    </Stage>
  );
}
