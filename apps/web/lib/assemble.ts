import 'server-only';
import { autoAssemble, type Timeline } from '@atomo/timeline';
import type { ProjectBundle } from './project';
import { dialogLines } from './ai/context';

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** Tempel tiap baris dialog ke shot yang paling cocok di scene yang sama. */
export function assignLines(b: ProjectBundle) {
  const lines = dialogLines(b);
  const used = new Map<string, number>();
  return lines.map((l) => {
    const inScene = b.shots.filter((s) => s.scene_no === l.sceneNo);
    const target =
      inScene.find((s) => s.dialog && (norm(s.dialog).includes(norm(l.text)) || norm(l.text).includes(norm(s.dialog)))) ??
      inScene.find((s) => b.characters.some((c) => s.character_ids.includes(c.id) && l.character.toLowerCase().includes(c.name.toLowerCase())) && !used.has(s.id)) ??
      inScene[0];
    if (target) used.set(target.id, (used.get(target.id) ?? 0) + 1);
    return { line: l, shotId: target?.id ?? null };
  });
}

export function buildTimeline(b: ProjectBundle): { timeline: Timeline; missing: string[] } {
  const missing: string[] = [];
  const shots = b.shots.filter((s) => s.clip_status === 'ready' || s.keyframe_status === 'ready');
  if (shots.length < b.shots.length) missing.push(`${b.shots.length - shots.length} shot belum punya frame/klip`);
  const ready = new Set(shots.map((s) => s.id));
  const lines = assignLines(b)
    .filter((x) => x.shotId && ready.has(x.shotId))
    .flatMap(({ line, shotId }) => {
      const track = b.audio.find((a) => a.line_id === line.id && a.status === 'ready' && a.text === line.text);
      if (!track) {
        missing.push(`VO SC${line.sceneNo}: “${line.text.slice(0, 30)}”`);
        return [];
      }
      return [{ lineId: line.id, shotId: shotId!, assetId: track.id, text: line.text, durationSec: (track.duration_ms ?? line.estimatedSec * 1000) / 1000 }];
    });
  const timeline = autoAssemble({
    fps: 24,
    aspect: b.project.aspect_ratio,
    shots: shots.map((s) => ({ shotId: s.id, sceneNo: s.scene_no, durationSec: Number(s.duration_sec) })),
    lines,
    sceneTransition: b.project.genre === 'horor' ? 'dip' : 'fade',
  });
  return { timeline, missing };
}
