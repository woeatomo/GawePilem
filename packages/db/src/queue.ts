/** Kontrak antrean BullMQ antara web (producer) dan worker (consumer). */
export const MEDIA_QUEUE = 'atomo-media';
/** Render FFmpeg berat dipisah agar tidak memblokir job AI. */
export const RENDER_QUEUE = 'atomo-render';

export type MediaJobData =
  | { kind: 'charref'; jobId: string; workspaceId: string; characterId: string }
  | { kind: 'keyframe'; jobId: string; workspaceId: string; shotIds: string[] }
  | { kind: 'clip'; jobId: string; workspaceId: string; shotIds: string[] }
  | { kind: 'vo'; jobId: string; workspaceId: string; episodeId: string; lineIds: string[] }
  | { kind: 'render'; jobId: string; workspaceId: string; renderId: string }
  | { kind: 'publish'; jobId: string; workspaceId: string; publicationId: string }
  | { kind: 'expire'; jobId: string; workspaceId: string };

export function queueFor(kind: MediaJobData['kind']): string {
  return kind === 'render' ? RENDER_QUEUE : MEDIA_QUEUE;
}
