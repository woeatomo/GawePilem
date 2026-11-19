import { z } from 'zod';

/** Kontrak antrean antara web (producer, lewat HTTP) dan worker (BullMQ). */
export const MEDIA_QUEUE = 'atomo-media';
/** Render FFmpeg berat dipisah agar tidak memblokir job AI. */
export const RENDER_QUEUE = 'atomo-render';

const id = z.string().min(1).max(100);
const uuid = z.string().uuid();

export const mediaJobSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('charref'), jobId: id, workspaceId: uuid, characterId: uuid }),
  z.object({ kind: z.literal('keyframe'), jobId: id, workspaceId: uuid, shotIds: z.array(uuid).min(1).max(400) }),
  z.object({ kind: z.literal('clip'), jobId: id, workspaceId: uuid, shotIds: z.array(uuid).min(1).max(400) }),
  z.object({ kind: z.literal('vo'), jobId: id, workspaceId: uuid, episodeId: uuid, lineIds: z.array(z.string().max(40)).min(1).max(600) }),
  z.object({ kind: z.literal('render'), jobId: id, workspaceId: uuid, renderId: uuid }),
  z.object({ kind: z.literal('publish'), jobId: id, workspaceId: uuid, publicationId: uuid }),
  z.object({ kind: z.literal('purge'), jobId: id, workspaceId: uuid }),
  z.object({ kind: z.literal('expire'), jobId: id, workspaceId: z.string() }),
]);
export type MediaJobData = z.infer<typeof mediaJobSchema>;

export function queueFor(kind: MediaJobData['kind']): string {
  return kind === 'render' ? RENDER_QUEUE : MEDIA_QUEUE;
}
