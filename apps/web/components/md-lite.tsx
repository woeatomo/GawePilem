import type { ReactNode } from 'react';

/** Markdown ringan untuk hasil riset: judul diakhiri ":" atau "#", bullet "- ". Aman (tanpa HTML mentah). */
export function MdLite({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) out.push(<ul key={`u${k}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    if (!l) return;
    if (/^[-•*]\s+/.test(l)) {
      list.push(l.replace(/^[-•*]\s+/, '').replace(/\*\*/g, ''));
      return;
    }
    flush(i);
    const clean = l.replace(/^#+\s*/, '').replace(/\*\*/g, '');
    out.push(/:$/.test(clean) || /^#/.test(l) ? <h4 key={i}>{clean.replace(/:$/, '')}</h4> : <p key={i}>{clean}</p>);
  });
  flush(-1);
  return <>{out}</>;
}
