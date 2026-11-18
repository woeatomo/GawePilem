import type { Metadata } from 'next';
import { loadStage, Stage } from '@/lib/stage';
import { ResearchPanel } from './panel';

export const metadata: Metadata = { title: 'Riset' };

export default async function Page(props: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadStage(props.params, props.searchParams);
  const { bundle: b, settings } = data;
  return (
    <Stage data={data} stage="riset">
      <ResearchPanel
        projectId={b.project.id}
        topic={b.bible?.topic ?? ''}
        research={b.bible?.research ?? ''}
        meta={{ format: b.project.format, genre: b.project.genre, style: b.project.visual_style, aspect: b.project.aspect_ratio }}
        model={`${settings.naskah.provider} · ${settings.naskah.model} · tier ${settings.naskah.tier}${settings.naskah.mode === 'byok' ? ' · BYOK' : ''}`}
      />
    </Stage>
  );
}
