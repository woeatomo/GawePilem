export interface CharacterSheet {
  name: string;
  age?: number | null;
  role?: string;
  traits?: string[];
  look?: string;
  speechStyle?: string;
  locked?: boolean;
}

export interface ProjectContext {
  title?: string;
  format: string;
  genre: string;
  style: string;
  aspect: '9:16' | '16:9' | '1:1';
  language: string;
  targetSec: number;
  episodeCount?: number;
  bible?: { logline?: string; premise?: string; world?: string; tone?: string; continuityFacts?: string[] };
  research?: string;
  characters?: CharacterSheet[];
  /** Scene terkait (mis. scene sebelum & sesudah, atau seluruh naskah untuk shot list). */
  scenes?: { no: number; text: string }[];
  /** Logline/judul episode sebelumnya, untuk menghindari repetisi. */
  previousEpisodes?: string[];
}

interface Section {
  key: string;
  title: string;
  text: string;
  /** Makin besar makin penting (dipangkas terakhir). */
  priority: number;
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

function truncate(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, Math.max(0, maxChars - 20));
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak + 1) : cut} […dipangkas]`;
}

export function characterBlock(chars: readonly CharacterSheet[]): string {
  return chars
    .map((c) =>
      [
        `- ${c.name}${c.age ? ` (${c.age})` : ''}${c.locked ? ' [wajah & suara terkunci]' : ''}: ${c.role ?? ''}`,
        c.traits?.length ? `  sifat: ${c.traits.join(', ')}` : '',
        c.look ? `  visual: ${c.look}` : '',
        c.speechStyle ? `  gaya bicara: ${c.speechStyle}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');
}

/**
 * Susun konteks (series bible, riset, sheet karakter, scene terkait) dan pangkas
 * sesuai budget token. Bagian prioritas rendah dipangkas lebih dulu.
 */
export function buildContext(ctx: ProjectContext, budgetTokens: number): { text: string; trimmed: string[]; tokens: number } {
  const sections: Section[] = [];
  const b = ctx.bible;
  const bibleText = [
    b?.logline ? `Logline: ${b.logline}` : '',
    b?.premise ? `Premis: ${b.premise}` : '',
    b?.world ? `Dunia: ${b.world}` : '',
    b?.tone ? `Nada: ${b.tone}` : '',
    b?.continuityFacts?.length ? `Fakta kontinuitas:\n${b.continuityFacts.map((f) => `- ${f}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (bibleText) sections.push({ key: 'bible', title: 'SERIES BIBLE', text: bibleText, priority: 4 });
  if (ctx.characters?.length) sections.push({ key: 'characters', title: 'SHEET KARAKTER', text: characterBlock(ctx.characters), priority: 5 });
  if (ctx.scenes?.length)
    sections.push({ key: 'scenes', title: 'SCENE TERKAIT', text: ctx.scenes.map((s) => `[SC ${s.no}]\n${s.text}`).join('\n\n'), priority: 3 });
  if (ctx.research) sections.push({ key: 'research', title: 'HASIL RISET', text: ctx.research, priority: 2 });

  const render = (ss: Section[]) => ss.filter((s) => s.text).map((s) => `### ${s.title}\n${s.text}`).join('\n\n');
  const trimmed: string[] = [];
  let total = estimateTokens(render(sections));
  // Pangkas dari prioritas terendah; tiap bagian disisakan minimal 15% budget kalau masih muat.
  for (const s of [...sections].sort((a, b) => a.priority - b.priority)) {
    if (total <= budgetTokens) break;
    const over = total - budgetTokens;
    const cur = estimateTokens(s.text);
    const keep = Math.max(0, cur - over);
    s.text = truncate(s.text, keep < budgetTokens * 0.05 ? 0 : keep);
    trimmed.push(s.key);
    total = estimateTokens(render(sections));
  }
  const text = render(sections);
  return { text, trimmed, tokens: estimateTokens(text) };
}
