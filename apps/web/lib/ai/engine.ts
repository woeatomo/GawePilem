import 'server-only';
import { findModel } from '@atomo/ai-gateway';
export * from '@atomo/prompt-engine';

export function findModelContext(model: string): number {
  return findModel(model)?.contextTokens ?? 32_000;
}
