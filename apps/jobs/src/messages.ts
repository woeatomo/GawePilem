import { z } from 'zod';
import { mediaJobSchema } from '@atomo/db';

/** Pesan internal Worker jobs (tidak bisa dikirim dari luar lewat /enqueue). */
const handle = z.object({ provider: z.string(), requestId: z.string(), model: z.string(), statusUrl: z.string().optional(), responseUrl: z.string().optional() });

export const internalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clip_poll'), jobId: z.string(), workspaceId: z.string(), shotId: z.string(), handle, deadline: z.number() }),
  z.object({
    kind: z.literal('ffmpeg_poll'),
    jobId: z.string(),
    workspaceId: z.string(),
    purpose: z.enum(['clip', 'render']),
    targetId: z.string(),
    commandId: z.string(),
    key: z.string(),
    deadline: z.number(),
    startedAt: z.number(),
    expectedSec: z.number(),
  }),
]);
export type InternalMessage = z.infer<typeof internalSchema>;

/** Akumulasi job multi-item yang dilanjutkan di pesan berikutnya (batas waktu consumer). */
export const accSchema = z.object({ done: z.number(), failed: z.number(), failedSec: z.number() }).optional();

export type JobMessage = (z.infer<typeof mediaJobSchema> & { acc?: z.infer<typeof accSchema> }) | InternalMessage;

export function parseMessage(body: unknown): JobMessage {
  const i = internalSchema.safeParse(body);
  if (i.success) return i.data;
  const acc = accSchema.parse((body as { acc?: unknown })?.acc);
  return { ...mediaJobSchema.parse(body), ...(acc ? { acc } : {}) };
}
