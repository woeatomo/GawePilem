'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STAGES, type StageId, type StageStatus } from '@/lib/stages';

export function StageNav({ projectId, status, episode, active, superadmin }: { projectId?: string; status?: Record<StageId, StageStatus>; episode?: number; active?: string; superadmin?: boolean }) {
  const path = usePathname();
  const q = episode && episode > 1 ? `?ep=${episode}` : '';
  return (
    <nav className="nav" aria-label="Tahap produksi">
      {projectId && status && (
        <>
          <div className="sec">Pipeline produksi</div>
          {STAGES.map((s, i) => {
            const href = `/studio/${projectId}/${s.id}`;
            const on = path === href;
            return (
              <Link key={s.id} href={href + q} className={`${on ? 'on' : ''} ${status[s.id]}`} aria-current={on ? 'page' : undefined}>
                <span className="num">{status[s.id] === 'done' ? '✓' : i + 1}</span>
                {s.name}
              </Link>
            );
          })}
        </>
      )}
      <div className="sec">Akun</div>
      <Link href="/studio" className={active === 'studio' ? 'on' : ''}>
        <span className="ico">▦</span>Semua project
      </Link>
      <Link href="/saldo" className={active === 'saldo' ? 'on' : ''}>
        <span className="ico">◎</span>Saldo & tarif
      </Link>
      <Link href="/paket" className={active === 'paket' ? 'on' : ''}>
        <span className="ico">★</span>Paket & langganan
      </Link>
      <Link href="/provider" className={active === 'provider' ? 'on' : ''}>
        <span className="ico">⌁</span>Provider AI
      </Link>
      <Link href="/akun" className={active === 'akun' ? 'on' : ''}>
        <span className="ico">◇</span>Akun & privasi
      </Link>
      {superadmin && (
        <Link href="/admin/secrets" className={active === 'admin' ? 'on' : ''}>
          <span className="ico">⚿</span>Secret platform
        </Link>
      )}
    </nav>
  );
}
