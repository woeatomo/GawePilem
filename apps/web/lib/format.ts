/** Helper format angka & waktu. Netral (tanpa 'use client'), aman dipakai di server maupun client. */
export const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n));
export const fmt1 = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
export const rupiah = (n: number) => `Rp${fmt(n)}`;

export function timecode(sec: number, fps = 24): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60), f = Math.floor((sec % 1) * fps);
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}
