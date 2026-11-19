import { z } from 'zod';
import { timelineSchema, type Timeline } from './schema';

/**
 * Operasi edit yang boleh diusulkan LLM. LLM tidak menyentuh video; ia mengusulkan
 * daftar operasi ini, kreator menerima/membatalkan, lalu worker merender ulang.
 */
export const editOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('trim'), shotId: z.string(), in: z.number().min(0).optional(), out: z.number().positive().optional() }),
  z.object({ op: z.literal('move'), shotId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal('remove'), shotId: z.string() }),
  z.object({ op: z.literal('transition'), shotId: z.string(), transition: z.enum(['cut', 'fade', 'dip']) }),
  z.object({ op: z.literal('shiftDialog'), lineId: z.string(), by: z.number().min(-30).max(30) }),
  z.object({ op: z.literal('gain'), track: z.enum(['dialog', 'music', 'sfx']), gainDb: z.number().min(-60).max(12), id: z.string().optional() }),
  z.object({ op: z.literal('duck'), enabled: z.boolean() }),
  z.object({ op: z.literal('subtitleText'), index: z.number().int().min(0), text: z.string().min(1).max(300) }),
]);
export type EditOp = z.infer<typeof editOpSchema>;
export const editProposalSchema = z.object({ summary: z.string().max(400), ops: z.array(editOpSchema).min(1).max(50) });
export type EditProposal = z.infer<typeof editProposalSchema>;

export class EditError extends Error {}

/** Terapkan operasi secara murni (tidak memutasi input). Hasil divalidasi ulang dengan skema. */
export function applyEdits(t: Timeline, ops: readonly EditOp[]): Timeline {
  const next: Timeline = structuredClone(t);
  const v = next.tracks.video;
  const idx = (shotId: string) => {
    const i = v.findIndex((c) => c.shotId === shotId);
    if (i < 0) throw new EditError(`Shot ${shotId} tidak ada di timeline`);
    return i;
  };
  for (const op of ops) {
    switch (op.op) {
      case 'trim': {
        const c = v[idx(op.shotId)]!;
        if (op.in !== undefined) c.in = op.in;
        if (op.out !== undefined) c.out = op.out;
        break;
      }
      case 'move': {
        const [c] = v.splice(idx(op.shotId), 1);
        v.splice(Math.min(op.toIndex, v.length), 0, c!);
        break;
      }
      case 'remove':
        if (v.length === 1) throw new EditError('Timeline harus menyisakan minimal satu shot');
        v.splice(idx(op.shotId), 1);
        break;
      case 'transition':
        v[idx(op.shotId)]!.transition = op.transition;
        break;
      case 'shiftDialog': {
        const d = next.tracks.dialog.find((x) => x.lineId === op.lineId);
        if (!d) throw new EditError(`Dialog ${op.lineId} tidak ada`);
        d.start = Math.max(0, d.start + op.by);
        break;
      }
      case 'gain':
        if (op.track === 'music') next.tracks.music.filter((m) => !op.id || m.assetId === op.id).forEach((m) => (m.gainDb = op.gainDb));
        else next.tracks[op.track].filter((m) => !op.id || m.assetId === op.id).forEach((m) => (m.gainDb = op.gainDb));
        break;
      case 'duck':
        next.tracks.music.forEach((m) => (m.duckUnderDialog = op.enabled));
        break;
      case 'subtitleText': {
        const s = next.tracks.subtitle[op.index];
        if (!s) throw new EditError(`Subtitle #${op.index} tidak ada`);
        s.text = op.text;
        delete s.words;
        break;
      }
    }
  }
  if (v[0]) delete v[0].transition;
  const parsed = timelineSchema.safeParse(next);
  if (!parsed.success) throw new EditError(`Hasil edit tidak valid: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
