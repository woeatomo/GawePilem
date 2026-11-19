import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/actions';
import { Logo } from './logo';
import { StageNav } from './stage-nav';
import { fmt } from '@/lib/format';
import type { StageId, StageStatus } from '@/lib/stages';

export interface ShellProps {
  children: ReactNode;
  crumbs: ReactNode;
  balance: number;
  aiLabel: string;
  aiLive: boolean;
  project?: { id: string; title: string; subtitle: string; status: Record<StageId, StageStatus>; episode: number };
  active?: string;
  email: string;
  superadmin?: boolean;
}

export function Shell(p: ShellProps) {
  return (
    <div className="app">
      <aside className="rail">
        <Link className="brand" href="/studio">
          <Logo />
          <div>
            <b>Atomo Film Studio</b>
            <small>Atomo Digipedia</small>
          </div>
        </Link>
        {p.project && (
          <Link className="proj" href={`/studio/${p.project.id}/riset`}>
            <b>{p.project.title}</b>
            <span>{p.project.subtitle}</span>
          </Link>
        )}
        <StageNav
          {...(p.project ? { projectId: p.project.id, status: p.project.status, episode: p.project.episode } : {})}
          {...(p.active ? { active: p.active } : {})}
          superadmin={Boolean(p.superadmin)}
        />
        <div className="rail-foot">
          <span title={p.email} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
          <form action={signOut}>
            <button className="btn ghost sm" type="submit">Keluar</button>
          </form>
        </div>
      </aside>
      <div className="main">
        <div className="top">
          <div className="crumbs">{p.crumbs}</div>
          <span className={`chip ${p.aiLive ? 'live' : 'warn'}`} title="Status AI gateway">
            <span className="dot" />
            <span>{p.aiLabel}</span>
          </span>
          <div className="wallet">
            <span className="bal">{fmt(p.balance)}</span>
            <small>kredit</small>
            <Link className="btn primary sm" href="/saldo">Top-up</Link>
          </div>
        </div>
        <main className="view" id="view" tabIndex={-1}>
          {p.children}
        </main>
      </div>
    </div>
  );
}
