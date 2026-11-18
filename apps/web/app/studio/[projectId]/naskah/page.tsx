import type { Metadata } from 'next';
import { loadStage, Stage } from '@/lib/stage';
import { ScriptPanel } from './panel';

export const metadata: Metadata = { title: 'Naskah' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const { data: versions } = await data.session.db.from('scripts').select('version, note, created_at').eq('episode_id', b.episode.id).order('version', { ascending: false }).limit(15);
  return (
    <Stage data={data} stage="naskah">
      <ScriptPanel
        projectId={b.project.id}
        episodeId={b.episode.id}
        episode={{ number: b.episode.number, title: b.episode.title, synopsis: b.episode.synopsis }}
        episodes={b.episodes.map((e) => ({ number: e.number, title: e.title }))}
        scenes={b.script?.content.scenes ?? []}
        summaries={b.script?.content.summaries ?? []}
        shotsPerScene={b.shots.reduce<Record<number, number>>((a, s) => ({ ...a, [s.scene_no]: (a[s.scene_no] ?? 0) + 1 }), {})}
        hasCharacters={b.characters.length > 0}
        versions={(versions ?? []).map((v) => ({ version: v.version, note: v.note, at: v.created_at }))}
      />
    </Stage>
  );
}
