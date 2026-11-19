'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { addEpisode } from '@/app/actions';

export function EpisodeSwitch({ projectId, episodes, current }: { projectId: string; episodes: { number: number; title: string }[]; current: number }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <div className="row">
      <select aria-label="Episode" value={current} style={{ width: 'auto' }} onChange={(e) => router.push(`${path}?ep=${e.target.value}`)}>
        {episodes.map((e) => (
          <option key={e.number} value={e.number}>
            Eps {e.number}{e.title && e.title !== `Episode ${e.number}` ? `: ${e.title}` : ''}
          </option>
        ))}
      </select>
      <button className="btn sm ghost" disabled={pending} onClick={() => start(() => addEpisode(projectId))}>+ Episode</button>
    </div>
  );
}
