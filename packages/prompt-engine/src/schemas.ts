import { z } from 'zod';
import { CAMERA_MOVES, editProposalSchema } from '@atomo/timeline';

export const STAGES = ['research', 'characters', 'outline', 'scene', 'rewrite', 'shotlist', 'continuity', 'publish_meta', 'edit'] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

export const FORMATS = ['microdrama', 'film_pendek', 'serial', 'dokumenter', 'iklan', 'animasi'] as const;
export type FilmFormat = (typeof FORMATS)[number];
export const GENRES = ['drama', 'horor', 'thriller', 'komedi', 'romance', 'action', 'sci-fi', 'fantasi', 'misteri', 'sejarah', 'religi', 'anak'] as const;
export type Genre = (typeof GENRES)[number];

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const characterDraftSchema = z.object({
  name: trimmed(60),
  age: z.coerce.number().int().min(0).max(120),
  role: trimmed(200),
  traits: z.array(trimmed(40)).min(1).max(6),
  look: trimmed(400),
  backstory: z.string().trim().max(800).default(''),
  speechStyle: z.string().trim().max(200).default(''),
  sampleLine: trimmed(200),
  voiceHint: z.enum(['perempuan_lembut', 'perempuan_matang', 'laki_hangat', 'laki_berat', 'anak', 'narator']).default('narator'),
});
export type CharacterDraft = z.infer<typeof characterDraftSchema>;

export const charactersOutputSchema = z.object({
  logline: trimmed(400),
  premise: z.string().trim().max(1200).default(''),
  characters: z.array(characterDraftSchema).min(1).max(8),
});
export type CharactersOutput = z.infer<typeof charactersOutputSchema>;

export const outlineOutputSchema = z.object({
  episodeTitle: trimmed(100),
  synopsis: trimmed(800),
  hook: trimmed(300),
  cliffhanger: z.string().trim().max(300).default(''),
  scenes: z
    .array(
      z.object({
        heading: trimmed(120),
        summary: trimmed(500),
        characters: z.array(z.string().trim()).default([]),
        estimatedSec: z.coerce.number().positive().max(600).default(20),
      }),
    )
    .min(1)
    .max(40),
});
export type OutlineOutput = z.infer<typeof outlineOutputSchema>;

export const SHOT_TYPES = ['WS', 'MS', 'CU', 'ECU', 'OTS', 'POV', 'INSERT', 'AERIAL'] as const;
export const shotDraftSchema = z.object({
  sceneNo: z.coerce.number().int().positive(),
  shotType: z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase().trim() : v), z.enum(SHOT_TYPES)),
  camera: z.string().trim().max(80).default('statis'),
  durationSec: z.coerce.number().min(1).max(15),
  description: trimmed(300),
  characters: z.array(z.string().trim()).default([]),
  dialog: z.string().trim().max(400).nullable().default(null),
  imagePrompt: trimmed(800),
  motionPrompt: z.string().trim().max(300).default(''),
  /** 'ai' = image-to-video berbayar; 'camera' = gerak kamera dari frame kunci (gratis). */
  motionType: z.preprocess((v) => (v === 'camera' ? 'camera' : 'ai'), z.enum(['ai', 'camera'])).default('ai'),
  cameraMove: z.preprocess((v) => (typeof v === 'string' && (CAMERA_MOVES as readonly string[]).includes(v) ? v : 'push_in'), z.enum(CAMERA_MOVES)).default('push_in'),
});
export type ShotDraft = z.infer<typeof shotDraftSchema>;
export const shotlistOutputSchema = z.object({ shots: z.array(shotDraftSchema).min(1).max(120) });
export type ShotlistOutput = z.infer<typeof shotlistOutputSchema>;

export const continuityOutputSchema = z.object({
  issues: z
    .array(
      z.object({
        severity: z.enum(['info', 'warn', 'error']),
        sceneNo: z.coerce.number().int().positive().nullable().default(null),
        message: trimmed(300),
        suggestion: z.string().trim().max(300).default(''),
      }),
    )
    .max(30),
});
export type ContinuityOutput = z.infer<typeof continuityOutputSchema>;

export const publishMetaSchema = z.object({
  youtube: z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().max(4800), tags: z.array(z.string().trim()).max(20) }),
  tiktok: z.object({ caption: z.string().trim().min(1).max(2000), hashtags: z.array(z.string().trim()).max(10) }),
});
export type PublishMeta = z.infer<typeof publishMetaSchema>;

export const OUTPUT_SCHEMAS = {
  characters: charactersOutputSchema,
  outline: outlineOutputSchema,
  shotlist: shotlistOutputSchema,
  continuity: continuityOutputSchema,
  publish_meta: publishMetaSchema,
  edit: editProposalSchema,
} as const;
export type StructuredStage = keyof typeof OUTPUT_SCHEMAS;
