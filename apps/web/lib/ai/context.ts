import 'server-only';
import { extractDialog, type ProjectContext } from '@atomo/prompt-engine';
import type { ProjectBundle } from '../project';
import { lineId, type QuantityContext } from './actions';

export function scriptTexts(b: ProjectBundle): string[] {
  return (b.script?.content.scenes ?? []).map((s) => s.body || s.heading);
}

export function dialogLines(b: ProjectBundle) {
  const perScene = new Map<number, number>();
  return extractDialog(scriptTexts(b)).map((l) => {
    const n = perScene.get(l.sceneNo) ?? 0;
    perScene.set(l.sceneNo, n + 1);
    return { ...l, id: lineId(l.sceneNo, n) };
  });
}

export function quantityContext(b: ProjectBundle): QuantityContext {
  return {
    sceneCount: b.script?.content.scenes.length ?? 0,
    shots: b.shots.map((s) => ({ id: s.id, durationSec: Number(s.duration_sec), motion: s.motion === 'camera' ? 'camera' : 'ai' })),
    lines: dialogLines(b).map((l) => ({ id: l.id, estimatedSec: l.estimatedSec })),
  };
}

export function projectContext(b: ProjectBundle, opts: { scenes?: 'all' | number[] } = {}): ProjectContext {
  const scenes = b.script?.content.scenes ?? [];
  const pick = opts.scenes === 'all' ? scenes.map((_, i) => i + 1) : (opts.scenes ?? []);
  const facts = Array.isArray(b.bible?.continuity_facts) ? (b.bible.continuity_facts as unknown[]).map(String) : [];
  return {
    title: b.project.title,
    format: b.project.format,
    genre: b.project.genre,
    style: b.project.visual_style,
    aspect: b.project.aspect_ratio,
    language: b.project.language,
    targetSec: b.project.target_duration_sec,
    episodeCount: b.project.episode_count,
    bible: {
      logline: b.bible?.logline ?? '',
      premise: b.bible?.premise ?? '',
      world: b.bible?.world ?? '',
      tone: b.bible?.tone ?? '',
      continuityFacts: facts,
    },
    research: b.bible?.research ?? '',
    characters: b.characters.map((c) => ({
      name: c.name,
      age: c.age,
      role: c.role,
      traits: c.traits,
      look: c.look,
      speechStyle: c.speech_style,
      locked: Boolean(c.locked_at),
    })),
    scenes: pick
      .filter((n) => scenes[n - 1])
      .map((n) => ({ no: n, text: scenes[n - 1]!.body || `${scenes[n - 1]!.heading}\n(belum ditulis)` })),
    previousEpisodes: b.episodes.filter((e) => e.number < b.episode.number && e.synopsis).map((e) => `Eps ${e.number}: ${e.title} — ${e.synopsis}`),
  };
}
