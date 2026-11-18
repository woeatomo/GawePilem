'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Category, RateTable } from '@atomo/credits';

export interface ClientSetting {
  provider: string;
  model: string;
  mode: 'saldo' | 'byok';
  tier: 'hemat' | 'standar' | 'premium';
  keyHint: string | null;
}

export interface StudioCtx {
  projectId: string;
  episode: number;
  rates: RateTable;
  settings: Record<Category, ClientSetting>;
  balance: number;
}

const Ctx = createContext<StudioCtx | null>(null);
export function StudioProvider({ value, children }: { value: StudioCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStudio(): StudioCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStudio di luar StudioProvider');
  return v;
}
