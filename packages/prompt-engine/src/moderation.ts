/**
 * Prefilter moderasi lokal (murah, tanpa panggilan AI). Ini lapisan pertama saja:
 * output tetap melewati moderasi provider dan pemeriksaan wajib sebelum publish.
 */
export type ModerationVerdict = 'allow' | 'flag' | 'block';
export interface ModerationResult {
  verdict: ModerationVerdict;
  categories: string[];
  matches: string[];
}

const RULES: { category: string; verdict: ModerationVerdict; patterns: RegExp[] }[] = [
  {
    category: 'ip_berhak_cipta',
    verdict: 'block',
    patterns: [
      /\b(spider-?man|batman|superman|naruto|doraemon|pikachu|pok[eé]mon|harry potter|mickey mouse|elsa frozen|son goku|luffy|upin(?:\s*&|\s+dan)?\s*ipin|si unyil|avengers|marvel|disney|hogwarts|shrek|minion)\b/i,
    ],
  },
  {
    category: 'orang_nyata',
    verdict: 'flag',
    patterns: [/\b(mirip|wajah|suara|meniru|clone|deepfake)\b.{0,30}\b(presiden|menteri|artis|selebriti|youtuber|influencer|aktor|aktris|penyanyi)\b/i, /\bdeepfake\b/i],
  },
  {
    category: 'seksual_anak',
    verdict: 'block',
    patterns: [/\b(anak|bocah|murid sd|di bawah umur|minor|child)\b.{0,40}\b(seks|sex|telanjang|bugil|cabul|porno)/i, /\b(seks|sex|telanjang|bugil|cabul|porno).{0,40}\b(anak|bocah|di bawah umur|minor|child)\b/i],
  },
  { category: 'seksual_eksplisit', verdict: 'flag', patterns: [/\b(porno|pornografi|adegan seks|hubungan intim eksplisit|telanjang bulat)\b/i] },
  { category: 'kebencian_sara', verdict: 'flag', patterns: [/\b(bunuh|basmi|usir|musnahkan)\b.{0,30}\b(kafir|cina|china|kristen|islam|yahudi|hindu|buddha|papua|suku)\b/i] },
  { category: 'kekerasan_nyata', verdict: 'block', patterns: [/\b(cara (membuat|merakit) (bom|senjata api|racun))\b/i] },
];

export function moderateText(text: string): ModerationResult {
  const categories: string[] = [];
  const matches: string[] = [];
  let verdict: ModerationVerdict = 'allow';
  for (const r of RULES) {
    for (const p of r.patterns) {
      const m = p.exec(text);
      if (m) {
        categories.push(r.category);
        matches.push(m[0]);
        if (r.verdict === 'block' || (r.verdict === 'flag' && verdict === 'allow')) verdict = r.verdict;
        break;
      }
    }
  }
  return { verdict, categories, matches };
}

export function moderationMessage(r: ModerationResult): string {
  if (r.categories.includes('ip_berhak_cipta'))
    return 'Permintaan menyebut karakter/IP berhak cipta. Buat karakter orisinal agar aman dipublikasikan.';
  if (r.categories.includes('orang_nyata')) return 'Tidak boleh meniru wajah atau suara orang nyata tanpa bukti consent.';
  if (r.categories.includes('seksual_anak')) return 'Permintaan ini melanggar kebijakan konten dan diblokir.';
  return 'Permintaan berisi konten sensitif dan perlu ditinjau.';
}
