import type { Metadata } from 'next';
import Link from 'next/link';
import { getBalance } from '@atomo/db';
import { Shell } from '@/components/shell';
import { requireSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { FORMAT_LABEL } from '@/lib/stages';
import { NewProject } from './new-project';

export const metadata: Metadata = { title: 'Project' };

export default async function Studio() {
  const s = await requireSession();
  const [{ data: projects }, balance] = await Promise.all([
    s.db.from('projects').select('id, title, format, genre, aspect_ratio, episode_count, updated_at, episodes(count)').is('archived_at', null).order('updated_at', { ascending: false }),
    getBalance(s.db, s.userId),
  ]);
  const e = env();
  return (
    <Shell email={s.email} balance={balance} aiLabel={e.AI_MOCK ? 'AI: mode demo (mock)' : 'AI siap'} aiLive active="studio" crumbs={<b>Semua project</b>}>
      <div className="wrap">
        <header className="vhead">
          <div>
            <p className="eyebrow">STUDIO</p>
            <h1>Project kamu</h1>
            <p className="lede">Satu project = satu film atau satu serial. Karakter, suara, dan gaya visual dipakai ulang di semua episode.</p>
          </div>
        </header>
        <NewProject />
        {projects?.length ? (
          <div className="projects">
            {projects.map((p) => (
              <Link key={p.id} href={`/studio/${p.id}/riset`} className="card pj">
                <h2>{p.title}</h2>
                <p className="muted small">
                  {FORMAT_LABEL[p.format] ?? p.format} · {p.genre} · {p.aspect_ratio}
                </p>
                <div className="tags">
                  <span className="pill">{(p.episodes as unknown as { count: number }[])[0]?.count ?? 0} dari {p.episode_count} episode</span>
                  <span className="pill">Diubah {new Date(p.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="note">Belum ada project. Mulai dari ide cerita di atas, misalnya horor kos-kosan tua atau drama keluarga di kampung halaman.</p>
        )}
      </div>
    </Shell>
  );
}
