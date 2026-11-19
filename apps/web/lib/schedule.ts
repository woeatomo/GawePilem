/** Jadwal rilis dalam WIB (UTC+7, tanpa daylight saving). */
const WIB_OFFSET_MS = 7 * 3_600_000;
export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/**
 * Slot berikutnya pada hari & jam WIB tertentu, minimal `minLeadMin` menit dari sekarang
 * (YouTube butuh waktu memproses upload sebelum tayang).
 */
export function nextSlotWib(weekday: number, hour: number, now = Date.now(), minLeadMin = 60): Date {
  const wibNow = new Date(now + WIB_OFFSET_MS);
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate() + add, hour, 0, 0) - WIB_OFFSET_MS);
    const wd = new Date(d.getTime() + WIB_OFFSET_MS).getUTCDay();
    if (wd === weekday && d.getTime() >= now + minLeadMin * 60_000) return d;
  }
  return new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate() + 14, hour) - WIB_OFFSET_MS);
}

export function formatWib(d: Date | string): string {
  return new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

/** Nilai untuk <input type="datetime-local"> (zona waktu browser). */
export function toLocalInput(d: Date): string {
  const l = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return l.toISOString().slice(0, 16);
}
