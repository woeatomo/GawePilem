import type { ChatMessage } from './types';
import { buildContext, type ProjectContext } from './context';
import { CLICHES_TO_AVOID, FORMAT_GUIDE, GENRE_GUIDE, GUARDRAILS, hashSeed, pickDevices } from './guidance';
import { OUTPUT_SCHEMAS, type FilmFormat, type Genre, type Stage, type StructuredStage } from './schemas';
import { BUILTIN_TEMPLATES, fill, selectTemplate, type PromptTemplate } from './templates';

export interface BuildInput {
  stage: Stage;
  project: ProjectContext;
  vars?: Record<string, string | number | undefined>;
  /** Template dari DB; kosong = bawaan. */
  templates?: readonly PromptTemplate[];
  /** Jendela konteks model (token). */
  contextTokens?: number;
  /** Seed variasi (mis. id episode). */
  variationSeed?: string;
  random?: () => number;
}

export interface BuiltPrompt {
  messages: ChatMessage[];
  template: { stage: Stage; genre: string; format: string; version: number };
  trimmed: string[];
  structured: boolean;
  maxTokens: number;
}

const OUTPUT_BUDGET: Record<Stage, number> = {
  research: 1_200,
  characters: 2_000,
  outline: 2_000,
  scene: 1_800,
  rewrite: 1_800,
  shotlist: 6_000,
  continuity: 1_500,
  publish_meta: 1_000,
};

const LANG: Record<string, string> = { id: 'Indonesia', en: 'Inggris', ms: 'Melayu', jv: 'Jawa' };

export function isStructured(stage: Stage): stage is StructuredStage {
  return stage in OUTPUT_SCHEMAS;
}

/** Susun prompt lengkap: template + panduan genre/format + konteks terpangkas + guardrail. */
export function buildPrompt(input: BuildInput): BuiltPrompt {
  const { stage, project: p } = input;
  const tpl = selectTemplate(input.templates?.length ? input.templates : BUILTIN_TEMPLATES, stage, p.genre, p.format, input.random);
  const seed = hashSeed(`${input.variationSeed ?? p.title ?? ''}:${stage}`);
  const previous = p.previousEpisodes?.length
    ? `Episode sebelumnya (jangan ulangi pola yang sama):\n${p.previousEpisodes.slice(-5).map((e) => `- ${e}`).join('\n')}`
    : '';

  const task = fill(tpl.body, {
    format: p.format,
    genre: p.genre,
    style: p.style,
    aspect: p.aspect,
    language: LANG[p.language] ?? p.language,
    targetSec: p.targetSec,
    episodeCount: p.episodeCount ?? 1,
    genreGuide: GENRE_GUIDE[p.genre as Genre] ?? GENRE_GUIDE.default,
    formatGuide: FORMAT_GUIDE[p.format as FilmFormat] ?? FORMAT_GUIDE.default,
    devices: pickDevices(seed).join('; '),
    cliches: CLICHES_TO_AVOID.join('; '),
    previousEpisodes: previous,
    count: 3,
    ...input.vars,
  });

  const maxTokens = OUTPUT_BUDGET[stage];
  const window = input.contextTokens ?? 32_000;
  const fixed = Math.ceil((task.length + GUARDRAILS.length) / 4) + 200;
  const budget = Math.max(500, Math.min(24_000, window - maxTokens - fixed));
  const ctx = buildContext(p, budget);

  const system = [
    `[stage:${stage}]`,
    'Kamu bagian dari Atomo Film Studio, membantu kreator Indonesia memproduksi film dan serial orisinal. Kreator adalah sutradara; kamu kru-nya.',
    GUARDRAILS,
  ].join('\n\n');
  const user = [ctx.text ? `KONTEKS PROJECT\n\n${ctx.text}` : '', `TUGAS\n\n${task}`].filter(Boolean).join('\n\n---\n\n');

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    template: { stage: tpl.stage, genre: tpl.genre, format: tpl.format, version: tpl.version },
    trimmed: ctx.trimmed,
    structured: isStructured(stage),
    maxTokens,
  };
}
