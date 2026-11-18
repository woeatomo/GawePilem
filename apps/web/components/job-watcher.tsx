'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useToast } from './ui';

/**
 * Memantau job antrean (gambar, video, VO, render) milik project ini. Selama ada job aktif,
 * cek tiap 3 detik dan segarkan halaman saat ada yang selesai/gagal.
 */
export function JobWatcher({ projectId, active }: { projectId: string; active: number }) {
  const router = useRouter();
  const toast = useToast();
  const last = useRef<string>('');
  useEffect(() => {
    if (active === 0) return;
    const db = supabaseBrowser();
    let stop = false;
    const tick = async () => {
      const { data } = await db.from('jobs').select('id, status, action, progress, error').eq('project_id', projectId).in('type', ['image', 'video', 'vo', 'render']).order('created_at', { ascending: false }).limit(30);
      if (stop || !data) return;
      const sig = data.map((j) => `${j.id}:${j.status}:${j.progress}`).join('|');
      if (last.current && sig !== last.current) {
        const prev = new Map(last.current.split('|').map((x) => [x.split(':')[0], x.split(':')[1]]));
        for (const j of data) {
          const was = prev.get(j.id);
          if (was && was !== j.status) {
            if (j.status === 'succeeded') toast(`Job ${j.action} selesai`);
            if (j.status === 'refunded' || j.status === 'failed') toast(`Job ${j.action} gagal, kredit dikembalikan. ${j.error ?? ''}`, 'err');
          }
        }
        router.refresh();
      }
      last.current = sig;
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [projectId, active, router, toast]);
  return null;
}
