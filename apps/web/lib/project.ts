import 'server-only';
import type { DB, Row } from '@atomo/db';
import { notFound } from 'next/navigation';

export interface ScriptScene {
  heading: string;
  body: string;
}
export interface ScriptContent {
  title?: string;
  synopsis?: string;
  hook?: string;
  cliffhanger?: string;
  /** Ringkasan per scene dari outline (dipakai saat AI menulis scene). */
  summaries?: string[];
  scenes: ScriptScene[];
}

export interface ProjectBundle {
  project: Row<'projects'>;
  bible: Row<'series_bible'> | null;
  episodes: Row<'episodes'>[];
  episode: Row<'episodes'>;
  characters: Row<'characters'>[];
  script: { id: string; version: number; content: ScriptContent } | null;
  shots: Row<'shots'>[];
  audio: Row<'audio_tracks'>[];
  renders: Row<'renders'>[];
}

export function parseScript(content: unknown): ScriptContent {
  const c = (content ?? {}) as Partial<ScriptContent>;
  return {
    ...c,
    scenes: Array.isArray(c.scenes)
      ? c.scenes.map((s) => ({ heading: String(s?.heading ?? ''), body: String(s?.body ?? '') }))
      : [],
  };
}

/** Muat semua data project untuk satu episode (RLS menjamin user anggota workspace). */
export async function loadProject(db: DB, projectId: string, epNumber = 1): Promise<ProjectBundle> {
  const { data: project } = await db.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (!project) notFound();
  const [{ data: bible }, { data: episodes }, { data: characters }] = await Promise.all([
    db.from('series_bible').select('*').eq('project_id', projectId).maybeSingle(),
    db.from('episodes').select('*').eq('project_id', projectId).order('number'),
    db.from('characters').select('*').eq('project_id', projectId).order('created_at'),
  ]);
  const episode = episodes?.find((e) => e.number === epNumber) ?? episodes?.[0];
  if (!episode) notFound();
  const [{ data: script }, { data: shots }, { data: audio }, { data: renders }] = await Promise.all([
    db.from('scripts').select('id, version, content').eq('episode_id', episode.id).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('shots').select('*').eq('episode_id', episode.id).order('scene_no').order('order_index'),
    db.from('audio_tracks').select('*').eq('episode_id', episode.id).order('start_ms'),
    db.from('renders').select('*').eq('episode_id', episode.id).order('created_at', { ascending: false }).limit(5),
  ]);
  return {
    project,
    bible,
    episodes: episodes ?? [],
    episode,
    characters: characters ?? [],
    script: script ? { id: script.id, version: script.version, content: parseScript(script.content) } : null,
    shots: shots ?? [],
    audio: audio ?? [],
    renders: renders ?? [],
  };
}
