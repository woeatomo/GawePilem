/**
 * Definisi aksi AI yang dipakai bersama oleh client (estimasi di tombol) dan server
 * (estimasi ulang + charge). Murni, tanpa akses DB.
 */
import { z } from 'zod';
import type { Category } from '@atomo/credits';

export const ACTION_IDS = [
  'research', 'characters', 'outline', 'scene', 'rewrite', 'shotlist', 'continuity', 'publish_meta', 'edit',
  'charref', 'keyframe', 'clip', 'vo',
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const actionParams = {
  research: z.object({ topic: z.string().trim().min(10, 'Tulis ide minimal 10 karakter').max(2000) }),
  characters: z.object({ count: z.number().int().min(1).max(6).default(3) }),
  outline: z.object({}),
  scene: z.object({ sceneNo: z.number().int().positive() }),
  rewrite: z.object({ sceneNo: z.number().int().positive(), instruction: z.string().trim().min(3).max(400) }),
  /** sceneNo: pecah satu scene saja (episode panjang dipecah per scene agar output AI tidak terpotong). */
  shotlist: z.object({ replace: z.boolean().default(false), sceneNo: z.number().int().positive().optional() }),
  continuity: z.object({}),
  publish_meta: z.object({}),
  edit: z.object({ instruction: z.string().trim().min(3, 'Tulis perintah edit').max(400) }),
  charref: z.object({ characterId: z.string().uuid() }),
  // Episode 20 menit ±300 shot & ±400 baris dialog.
  keyframe: z.object({ shotIds: z.array(z.string().uuid()).min(1).max(400) }),
  clip: z.object({ shotIds: z.array(z.string().uuid()).min(1).max(400) }),
  vo: z.object({ lineIds: z.array(z.string()).min(1).max(600) }),
} satisfies Record<ActionId, z.ZodType>;
export type ActionParams<A extends ActionId> = z.infer<(typeof actionParams)[A]>;

export const ACTION_META: Record<ActionId, { label: string; kind: 'stream' | 'structured' | 'media'; jobType: 'text' | 'image' | 'video' | 'vo' }> = {
  research: { label: 'Riset cerita', kind: 'stream', jobType: 'text' },
  characters: { label: 'Generate karakter', kind: 'structured', jobType: 'text' },
  outline: { label: 'Outline episode', kind: 'structured', jobType: 'text' },
  scene: { label: 'Tulis scene', kind: 'stream', jobType: 'text' },
  rewrite: { label: 'Tulis ulang scene', kind: 'stream', jobType: 'text' },
  shotlist: { label: 'Pecah jadi shot list', kind: 'structured', jobType: 'text' },
  continuity: { label: 'Cek kontinuitas', kind: 'structured', jobType: 'text' },
  publish_meta: { label: 'Metadata publish', kind: 'structured', jobType: 'text' },
  edit: { label: 'Usulan edit AI', kind: 'structured', jobType: 'text' },
  charref: { label: 'Reference image karakter', kind: 'media', jobType: 'image' },
  keyframe: { label: 'Frame kunci', kind: 'media', jobType: 'image' },
  clip: { label: 'Image to video', kind: 'media', jobType: 'video' },
  vo: { label: 'Voice over', kind: 'media', jobType: 'vo' },
};

/** Jumlah sudut reference image per karakter (depan, 3/4, samping, full body). */
export const CHARREF_ANGLES = ['depan', '3/4', 'samping', 'full'] as const;

export interface QuantityContext {
  sceneCount: number;
  /** motion 'camera' dirender sebagai gerak kamera dari frame kunci: tidak memotong kredit video. */
  shots: { id: string; durationSec: number; motion?: 'ai' | 'camera' }[];
  lines: { id: string; estimatedSec: number }[];
}

export function quantities(action: ActionId, params: unknown, ctx: QuantityContext): { category: Category; quantity: number }[] {
  switch (action) {
    case 'research':
    case 'characters':
    case 'outline':
    case 'scene':
    case 'rewrite':
    case 'continuity':
    case 'publish_meta':
    case 'edit':
      return [{ category: 'naskah', quantity: 1 }];
    case 'shotlist':
      return [{ category: 'naskah', quantity: (params as ActionParams<'shotlist'>).sceneNo ? 1 : Math.max(1, ctx.sceneCount) }];
    case 'charref':
      return [{ category: 'image', quantity: CHARREF_ANGLES.length }];
    case 'keyframe':
      return [{ category: 'image', quantity: (params as ActionParams<'keyframe'>).shotIds.length }];
    case 'clip': {
      const ids = new Set((params as ActionParams<'clip'>).shotIds);
      const sec = ctx.shots.filter((s) => ids.has(s.id) && s.motion !== 'camera').reduce((a, s) => a + s.durationSec, 0);
      return [{ category: 'video', quantity: Math.ceil(sec) }];
    }
    case 'vo': {
      const ids = new Set((params as ActionParams<'vo'>).lineIds);
      const sec = ctx.lines.filter((l) => ids.has(l.id)).reduce((a, l) => a + l.estimatedSec, 0);
      // VO ditagih per menit audio (pecahan dibulatkan ke atas oleh estimateLine).
      return [{ category: 'vo', quantity: Math.round((sec / 60) * 100) / 100 }];
    }
  }
}

/** Id baris dialog stabil: "<sceneNo>-<urutan>". */
export const lineId = (sceneNo: number, idx: number) => `${sceneNo}-${idx}`;
