import { parseScreenplay } from '@atomo/prompt-engine';

export function ScreenplayPage({ text, typing }: { text: string; typing?: boolean }) {
  return (
    <div className={`page ${typing ? 'typing' : ''}`} aria-live={typing ? 'polite' : undefined}>
      {parseScreenplay(text).map((b, i) => (
        <p key={i} className={b.type}>
          {b.text}
        </p>
      ))}
    </div>
  );
}
