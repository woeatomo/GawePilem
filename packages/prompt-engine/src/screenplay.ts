/** Parser naskah format standar → blok (heading, aksi, tokoh, parenthetical, dialog). */
export type BlockType = 'heading' | 'action' | 'character' | 'parenthetical' | 'dialog';
export interface ScriptBlock {
  type: BlockType;
  text: string;
}

export function parseScreenplay(text: string): ScriptBlock[] {
  const out: ScriptBlock[] = [];
  let prev: BlockType | null = null;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) {
      prev = null;
      continue;
    }
    let t: BlockType;
    if (/^(INT|EXT|INT\/EXT|EXT\/INT)[.\s]/i.test(l)) t = 'heading';
    else if (/^\(.*\)$/.test(l) && (prev === 'character' || prev === 'dialog')) t = 'parenthetical';
    else if (prev === 'character' || prev === 'parenthetical' || prev === 'dialog') t = 'dialog';
    else if (l === l.toUpperCase() && /\p{Lu}/u.test(l) && l.length < 40 && !/[.!?]$/.test(l)) t = 'character';
    else t = 'action';
    out.push({ type: t, text: l });
    prev = t;
  }
  return out;
}

export interface DialogLine {
  sceneNo: number;
  character: string;
  text: string;
  /** Perkiraan detik bicara (2,6 kata per detik, minimal 1,2 detik). */
  estimatedSec: number;
}

export function speechSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, Math.round((words / 2.6) * 10) / 10);
}

export function extractDialog(scenes: readonly string[]): DialogLine[] {
  const lines: DialogLine[] = [];
  scenes.forEach((s, i) => {
    let who: string | null = null;
    let cur: DialogLine | null = null;
    for (const b of parseScreenplay(s)) {
      if (b.type === 'character') {
        who = b.text.replace(/\(.*?\)/g, '').trim();
        cur = null;
      } else if (b.type === 'dialog' && who) {
        if (cur) {
          // Dialog multi-baris dalam satu cue.
          cur.text += ` ${b.text}`;
          cur.estimatedSec = speechSeconds(cur.text);
        } else {
          cur = { sceneNo: i + 1, character: who, text: b.text, estimatedSec: speechSeconds(b.text) };
          lines.push(cur);
        }
      } else if (b.type === 'action' || b.type === 'heading') {
        who = null;
        cur = null;
      }
    }
  });
  return lines;
}

export function sceneHeading(text: string): string {
  return parseScreenplay(text).find((b) => b.type === 'heading')?.text ?? 'SCENE';
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
