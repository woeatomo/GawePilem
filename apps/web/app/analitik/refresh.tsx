'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui';

export function RefreshMetrics({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function go() {
    setBusy(true);
    const res = await fetch('/api/analytics/refresh', { method: 'POST' });
    const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    setBusy(false);
    if (!res.ok) return toast(j.error?.message ?? 'Gagal memperbarui', 'err');
    toast('Statistik sedang diambil dari YouTube. Muat ulang halaman dalam 1 menit.', 'info');
    setTimeout(() => router.refresh(), 15_000);
  }
  return <button className="btn sm" disabled={disabled || busy} onClick={go}>{busy ? 'Meminta…' : 'Perbarui sekarang'}</button>;
}
