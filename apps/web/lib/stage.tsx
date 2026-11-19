import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CATEGORIES } from '@atomo/credits';
import { getBalance } from '@atomo/db';
import { Shell } from '@/components/shell';
import { StudioProvider } from '@/components/studio-context';
import { JobWatcher } from '@/components/job-watcher';
import { requireSession, type Session } from './auth';
import { env } from './env';
import { platformSecret } from './platform';
import { loadProject, type ProjectBundle } from './project';
import { loadPublicSettings, loadRates, type PublicSettings } from './settings';
import { FORMAT_LABEL, STAGES, type StageId, type StageStatus } from './stages';
import { dialogLines } from './ai/context';
import type { RateTable } from '@atomo/credits';

export interface StageData {
  session: Session;
  bundle: ProjectBundle;
  rates: RateTable;
  settings: PublicSettings;
  balance: number;
  activeJobs: number;
  /** Key platform untuk provider teks tersedia (DB atau env). */
  textKeyReady: boolean;
}

export async function loadStage(params: Promise<{ projectId: string }>, searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<StageData> {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const session = await requireSession();
  const ep = Number(Array.isArray(sp.ep) ? sp.ep[0] : sp.ep) || 1;
  const [bundle, rates, settings, balance, active] = await Promise.all([
    loadProject(session.db, projectId, ep),
    loadRates(session.db),
    loadPublicSettings(session.db, session.workspaceId),
    getBalance(session.db, session.userId),
    session.db.from('jobs').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['queued', 'running']),
  ]);
  return { session, bundle, rates, settings, balance, activeJobs: active.count ?? 0, textKeyReady: Boolean(await platformSecret('OPENCODE_API_KEY')) };
}

export function stageStatus(b: ProjectBundle): Record<StageId, StageStatus> {
  const scenes = b.script?.content.scenes ?? [];
  const shots = b.shots;
  const all = <T,>(xs: T[], f: (x: T) => boolean) => xs.length > 0 && xs.every(f);
  const some = <T,>(xs: T[], f: (x: T) => boolean) => xs.some(f);
  const lines = dialogLines(b);
  const st = (done: boolean, wip: boolean): StageStatus => (done ? 'done' : wip ? 'wip' : 'todo');
  return {
    riset: st(Boolean(b.bible?.research), Boolean(b.bible?.topic)),
    karakter: st(all(b.characters, (c) => Boolean(c.locked_at)), b.characters.length > 0),
    naskah: st(all(scenes, (s) => Boolean(s.body)), scenes.length > 0),
    storyboard: st(all(shots, (s) => s.keyframe_status === 'ready' && s.approved), shots.length > 0),
    visual: st(all(shots, (s) => s.clip_status === 'ready'), some(shots, (s) => s.clip_status !== 'empty')),
    audio: st(
      all(lines, (l) => b.audio.some((a) => a.line_id === l.id && a.text === l.text && a.status === 'ready')),
      b.audio.length > 0,
    ),
    editor: st(b.renders.some((r) => r.status === 'ready'), b.renders.length > 0),
    publish: st(b.episode.status === 'published', false),
  };
}

export function Stage({ data, stage, children }: { data: StageData; stage: StageId; children: ReactNode }) {
  const { bundle: b, session, rates, settings, balance } = data;
  const e = env();
  const mockAll = e.AI_MOCK;
  const naskah = settings.naskah;
  const noKey = !mockAll && naskah.mode === 'saldo' && !data.textKeyReady;
  const aiLabel = mockAll ? 'AI: mode demo (mock)' : noKey ? 'AI: key platform belum di-set' : `AI: ${naskah.provider} · ${naskah.model}`;
  const name = STAGES.find((s) => s.id === stage)!.name;
  const clientSettings = Object.fromEntries(CATEGORIES.map((c) => [c, settings[c]])) as typeof settings;
  return (
    <Shell
      email={session.email}
      superadmin={session.profile.is_superadmin}
      balance={balance}
      aiLabel={aiLabel}
      aiLive={!noKey}
      project={{
        id: b.project.id,
        title: b.project.title,
        subtitle: `${FORMAT_LABEL[b.project.format] ?? b.project.format} ${b.project.genre} · ${b.project.aspect_ratio} · Eps ${b.episode.number} dari ${b.project.episode_count}`,
        status: stageStatus(b),
        episode: b.episode.number,
      }}
      crumbs={
        <>
          <Link href="/studio">Project</Link> / {b.project.title} / Eps {b.episode.number} / <b>{name}</b>
        </>
      }
    >
      <StudioProvider value={{ projectId: b.project.id, episode: b.episode.number, rates, settings: clientSettings, balance }}>
        <div className="wrap">{children}</div>
        <JobWatcher projectId={b.project.id} active={data.activeJobs} />
      </StudioProvider>
    </Shell>
  );
}

export function StageHead({ no, title, desc, actions }: { no: string; title: string; desc: ReactNode; actions?: ReactNode }) {
  return (
    <header className="vhead">
      <div>
        <p className="eyebrow">{no}</p>
        <h1>{title}</h1>
        <p className="lede">{desc}</p>
      </div>
      {actions && <div className="vactions">{actions}</div>}
    </header>
  );
}
