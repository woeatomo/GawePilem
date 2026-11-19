import type { Metadata } from 'next';
import { dialogLines } from '@/lib/ai/context';
import { loadStage, Stage } from '@/lib/stage';
import { AudioPanel } from './panel';

export const metadata: Metadata = { title: 'Audio' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const b = data.bundle;
  const lines = dialogLines(b).map((l) => {
    const c = b.characters.find((x) => l.character.toLowerCase().includes(x.name.toLowerCase()));
    const t = b.audio.find((a) => a.line_id === l.id);
    return {
      id: l.id, sceneNo: l.sceneNo, character: c?.name ?? l.character, hue: c ? [...c.name].reduce((a, ch) => (a + ch.charCodeAt(0) * 7) % 360, 0) : 0,
      text: l.text, estimatedSec: l.estimatedSec, voiceReady: Boolean(c?.locked_at && c.voice_id), known: Boolean(c),
      url: t?.status === 'ready' && t.text === l.text ? t.url : null, stale: Boolean(t && t.text !== l.text), durationMs: t?.duration_ms ?? null,
    };
  });
  return (
    <Stage data={data} stage="audio">
      <AudioPanel projectId={b.project.id} lines={lines} />
    </Stage>
  );
}
