import type { Ctx } from './ctx';

/**
 * Batas perintah render sesuai paket Rendi. Paket Free: maks 1 menit per perintah & 4 vCPU
 * (atur RENDER_MAX_SECONDS=60, RENDER_MAX_VCPU=4, dan RENDER_SEGMENT_SEC kecil agar tiap segmen muat).
 */
export function renderOpts(ctx: Ctx, wantSeconds: number, wantVcpu: number): { maxSeconds: number; vcpu: number } {
  const capSec = Number(ctx.env.RENDER_MAX_SECONDS ?? 0) || Infinity;
  const capCpu = Number(ctx.env.RENDER_MAX_VCPU ?? 0) || Infinity;
  return { maxSeconds: Math.min(wantSeconds, capSec), vcpu: Math.min(wantVcpu, capCpu) };
}
