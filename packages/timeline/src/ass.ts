import type { Subtitle, Timeline } from './schema';

function assTime(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N');
}

/**
 * Subtitle gaya short-form (ASS). karaoke=true menyorot kata yang sedang diucapkan (\k).
 */
export function toAss(subs: readonly Subtitle[], size: { width: number; height: number }, opts: { karaoke?: boolean; font?: string } = {}): string {
  const vertical = size.height > size.width;
  const fontSize = Math.round((vertical ? size.width : size.height) * (vertical ? 0.062 : 0.055));
  const marginV = Math.round(size.height * (vertical ? 0.2 : 0.08));
  const font = opts.font ?? 'IBM Plex Sans';
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${size.width}
PlayResY: ${size.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize},&H00FFFFFF,&H003AA6F0,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(fontSize / 12))},1,2,${Math.round(size.width * 0.08)},${Math.round(size.width * 0.08)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [...subs]
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      let text: string;
      if (opts.karaoke && s.words?.length) {
        text = s.words
          .map((w, i) => {
            const next = s.words![i + 1]?.t ?? s.end;
            return `{\\k${Math.max(1, Math.round((next - w.t) * 100))}}${escapeAss(w.w)}`;
          })
          .join(' ');
      } else text = escapeAss(s.text);
      return `Dialogue: 0,${assTime(s.start)},${assTime(s.end)},Default,,0,0,0,,${text}`;
    });
  return header + lines.join('\n') + '\n';
}

export type { Timeline };
