/**
 * Registri gaya visual: satu sumber untuk pilihan di UI, panduan LLM (Bahasa Indonesia),
 * prompt model gambar (Inggris), negative prompt, dan cara membuat reference karakter.
 * `id` disimpan di projects.visual_style, jadi jangan ganti id yang sudah ada.
 */
export interface VisualStyle {
  id: string;
  label: string;
  group: 'Live action' | 'Animasi 2D' | 'Animasi 3D' | 'Ilustrasi & eksperimental';
  /** Untuk kartu pilihan di UI. */
  blurb: string;
  /** Disisipkan ke prompt LLM (karakter & shot list). */
  guide: string;
  /** Ditambahkan ke prompt model gambar. */
  imageStyle: string;
  negative: string;
  /** Awalan prompt reference karakter. */
  charSheet: string;
  /** Awalan imagePrompt tiap shot (diminta ke LLM). */
  framePrefix: string;
}

const NO_TEXT = 'text, watermark, logo, signature';
const ANATOMY = 'deformed hands, extra fingers, distorted face';
const CHARSHEET_RULE =
  '- Deskripsi karakter ("look") WAJIB seperti model sheet: warna & model rambut, warna mata, bentuk wajah/badan, tinggi relatif, kostum khas (warna utama), aksesori ikonik. Siluet tiap tokoh harus mudah dibedakan.';
const NO_COPY = '- Buat desain orisinal; jangan meniru karakter, kostum, atau gaya khas studio/franchise terkenal tertentu.';

export const VISUAL_STYLES: readonly VisualStyle[] = [
  {
    id: 'realistis sinematik', label: 'Realistis sinematik', group: 'Live action',
    blurb: 'Seperti film live action: cahaya alami, lensa sinematik.',
    guide: `Gaya visual sinematik realistis seperti film live action. Deskripsi karakter konsisten: rambut, pakaian khas, ciri wajah, properti.
- Tokoh fiktif, bukan wajah orang nyata.`,
    imageStyle: 'cinematic photorealistic film still, 35mm, natural skin texture, motivated lighting, shallow depth of field',
    negative: `cartoon, anime, illustration, 3d render, ${ANATOMY}, ${NO_TEXT}, celebrity likeness`,
    charSheet: 'Character reference photo, original fictional person, neutral studio background, soft key light',
    framePrefix: 'cinematic film still,',
  },
  {
    id: 'fotorealistik dokumenter', label: 'Foto dokumenter', group: 'Live action',
    blurb: 'Gaya dokumenter/rekonstruksi: natural, handheld, arsip.',
    guide: `Gaya dokumenter: cahaya natural, kamera handheld, komposisi jurnalistik. Rekonstruksi peristiwa ditandai sebagai ilustrasi.
- Tokoh rekonstruksi tetap fiktif; tidak memakai wajah tokoh nyata.`,
    imageStyle: 'documentary photography, natural available light, handheld, realistic, muted color grade, film grain',
    negative: `cartoon, anime, illustration, glamour, ${ANATOMY}, ${NO_TEXT}, celebrity likeness`,
    charSheet: 'Documentary-style portrait of an original fictional person, natural light, plain background',
    framePrefix: 'documentary photo,',
  },
  {
    id: 'noir hitam putih', label: 'Noir hitam putih', group: 'Live action',
    blurb: 'Kontras tinggi, bayangan tajam, misterius.',
    guide: `Gaya noir hitam putih: kontras tinggi, bayangan tajam, komposisi miring. Deskripsi karakter fokus pada siluet & kostum.`,
    imageStyle: 'black and white film noir, high contrast, hard shadows, venetian blind light, dutch angle',
    negative: `color, colorful, cartoon, ${ANATOMY}, ${NO_TEXT}, celebrity likeness`,
    charSheet: 'Black and white noir character portrait, hard key light, original fictional person',
    framePrefix: 'film noir still,',
  },
  {
    id: 'anime', label: 'Anime', group: 'Animasi 2D',
    blurb: 'Serial TV anime: line art bersih, cel shading, latar dilukis.',
    guide: `Gaya visual ANIME serial TV Jepang: line art bersih, cel shading, latar dilukis detail, warna hidup, ekspresi wajah ekspresif.
${CHARSHEET_RULE}
- Shot pakai bahasa visual anime: establishing shot latar, close-up mata/ekspresi, speed lines untuk aksi, reaction shot singkat, cut ke detail benda simbolik.
${NO_COPY}`,
    imageStyle: 'Japanese TV anime style, anime key visual, clean crisp line art, cel shading, vibrant colors, detailed painted background, expressive eyes, original character design',
    negative: `photorealistic, photo, 3d render, realistic skin texture, western cartoon, blurry, ${ANATOMY}, ${NO_TEXT}`,
    charSheet: 'Anime character model sheet, original anime character, plain flat background, consistent design',
    framePrefix: 'anime key frame,',
  },
  {
    id: 'chibi', label: 'Chibi', group: 'Animasi 2D',
    blurb: 'Lucu, kepala besar, cocok untuk komedi & konten anak.',
    guide: `Gaya CHIBI: proporsi 2–3 kepala, ekspresi berlebihan yang lucu, warna pastel cerah.
${CHARSHEET_RULE}
- Cocok untuk komedi; ekspresi dan reaksi lebih penting daripada detail latar.
${NO_COPY}`,
    imageStyle: 'cute chibi style, super deformed proportions, big head small body, pastel colors, soft cel shading, clean outlines',
    negative: `photorealistic, realistic proportions, 3d render, horror, gore, ${NO_TEXT}`,
    charSheet: 'Chibi character model sheet, original character, plain pastel background',
    framePrefix: 'chibi illustration,',
  },
  {
    id: 'kartun 2D', label: 'Kartun 2D', group: 'Animasi 2D',
    blurb: 'Kartun TV flat 2D: bentuk sederhana, warna solid.',
    guide: `Gaya KARTUN 2D televisi: bentuk geometris sederhana, outline tebal, warna solid, ekspresi jelas dibaca dari jauh.
${CHARSHEET_RULE}
${NO_COPY}`,
    imageStyle: '2D cartoon TV animation style, flat colors, bold clean outlines, simple shapes, vector look, expressive poses',
    negative: `photorealistic, photo, anime, 3d render, gradient heavy, ${NO_TEXT}`,
    charSheet: '2D cartoon character turnaround sheet, original character, plain background, flat colors',
    framePrefix: '2D cartoon frame,',
  },
  {
    id: 'komik webtoon', label: 'Komik webtoon', group: 'Animasi 2D',
    blurb: 'Gaya manhwa/webtoon digital: tajam, glossy, romantis/drama.',
    guide: `Gaya KOMIK WEBTOON digital: line art halus, pewarnaan digital glossy, pencahayaan dramatis, karakter good-looking ala drama.
${CHARSHEET_RULE}
- Banyak close-up emosional dan panel dramatis; cocok untuk romance, drama, dan fantasi.
${NO_COPY}`,
    imageStyle: 'Korean webtoon manhwa style, digital comic illustration, smooth line art, glossy soft shading, dramatic lighting, beautiful character design',
    negative: `photorealistic, photo, 3d render, chibi, western cartoon, ${ANATOMY}, ${NO_TEXT}`,
    charSheet: 'Webtoon character design sheet, original character, plain background, digital comic style',
    framePrefix: 'webtoon panel illustration,',
  },
  {
    id: 'wayang & batik', label: 'Wayang & batik Nusantara', group: 'Ilustrasi & eksperimental',
    blurb: 'Siluet wayang kulit, ornamen batik, warna sogan.',
    guide: `Gaya NUSANTARA: siluet dan ornamen terinspirasi wayang kulit, motif batik, palet sogan (coklat, emas, krem, indigo).
${CHARSHEET_RULE}
- Gunakan unsur budaya secara hormat: jangan memakai tokoh pewayangan yang sakral sebagai bahan lelucon, dan jangan mencampur simbol agama secara sembarangan.
- Tokoh orisinal; motif sebagai gaya visual, bukan menyalin karya seniman tertentu.`,
    imageStyle: 'Indonesian wayang kulit inspired illustration, intricate batik ornament patterns, shadow puppet silhouettes, warm sogan palette brown gold cream indigo, flat layered composition',
    negative: `photorealistic, photo, 3d render, anime, ${NO_TEXT}`,
    charSheet: 'Original character design in wayang kulit inspired style, profile silhouette with batik ornaments, plain background',
    framePrefix: 'wayang-inspired illustration,',
  },
  {
    id: 'cat air', label: 'Cat air', group: 'Ilustrasi & eksperimental',
    blurb: 'Ilustrasi lembut bertekstur kertas.',
    guide: `Gaya ilustrasi cat air: tepi lembut, tekstur kertas, palet terbatas. Deskripsi karakter fokus pada siluet & warna kostum.`,
    imageStyle: 'watercolor illustration, soft edges, visible paper texture, limited palette, gentle washes',
    negative: `photorealistic, photo, 3d render, harsh outlines, ${NO_TEXT}`,
    charSheet: 'Watercolor character design, original character, white paper background',
    framePrefix: 'watercolor illustration,',
  },
  {
    id: 'pixel art', label: 'Pixel art', group: 'Ilustrasi & eksperimental',
    blurb: 'Retro 16-bit, cocok untuk gaming & nostalgia.',
    guide: `Gaya PIXEL ART 16-bit: palet terbatas, piksel tegas, sprite karakter yang mudah dikenali.
${CHARSHEET_RULE}`,
    imageStyle: '16-bit pixel art, limited color palette, crisp pixels, retro game scene, no anti-aliasing',
    negative: `photorealistic, photo, smooth gradients, 3d render, blurry, ${NO_TEXT}`,
    charSheet: 'Pixel art character sprite sheet, original character, plain background',
    framePrefix: 'pixel art scene,',
  },
  {
    id: 'sketsa storyboard', label: 'Sketsa storyboard', group: 'Ilustrasi & eksperimental',
    blurb: 'Pensil hitam putih untuk pre-visualisasi & pitch (hemat).',
    guide: `Gaya SKETSA STORYBOARD pensil: garis cepat, arsiran, tanpa warna. Fokus pada komposisi, framing, dan gerak kamera; detail wajah tidak penting.`,
    imageStyle: 'pencil storyboard sketch, rough graphite lines, hatching, black and white, cinematic framing',
    negative: `color, photorealistic, 3d render, polished painting, ${NO_TEXT}`,
    charSheet: 'Pencil character sketch turnaround, original character, white paper',
    framePrefix: 'storyboard sketch,',
  },
  {
    id: '3D animasi', label: '3D animasi keluarga', group: 'Animasi 3D',
    blurb: 'Film animasi 3D: bentuk bulat ekspresif, material lembut.',
    guide: `Gaya 3D animasi sinematik keluarga: bentuk karakter sederhana & ekspresif, material lembut, pencahayaan global hangat.
${CHARSHEET_RULE}
${NO_COPY}`,
    imageStyle: '3D animated feature film style, stylized characters, soft subsurface materials, global illumination, warm cinematic lighting, original character design',
    negative: `photorealistic, photo, 2d, anime, flat colors, ${ANATOMY}, ${NO_TEXT}`,
    charSheet: '3D stylized character turnaround, original character, neutral grey background, soft studio light',
    framePrefix: '3D animated film still,',
  },
  {
    id: 'donghua 3D', label: 'Donghua 3D', group: 'Animasi 3D',
    blurb: 'Animasi 3D fantasi Asia: jubah berkibar, efek energi, latar megah.',
    guide: `Gaya DONGHUA 3D fantasi Asia: karakter elegan berjubah, rambut panjang berkibar, efek energi/sihir bercahaya, latar pegunungan & istana megah.
${CHARSHEET_RULE}
- Shot aksi memakai slow motion, partikel cahaya, dan kamera mengitari tokoh.
${NO_COPY}`,
    imageStyle: 'Chinese 3D donghua style, elegant xianxia fantasy, flowing robes and hair, glowing energy effects, majestic mountain palace background, cinematic lighting, original character design',
    negative: `photorealistic photo, 2d flat, western cartoon, chibi, ${ANATOMY}, ${NO_TEXT}`,
    charSheet: '3D donghua character turnaround, original character in fantasy robes, neutral background',
    framePrefix: '3D donghua fantasy still,',
  },
  {
    id: 'stop motion clay', label: 'Stop motion clay', group: 'Animasi 3D',
    blurb: 'Claymation: tekstur plastisin, set miniatur.',
    guide: `Gaya STOP MOTION CLAY: tokoh plastisin dengan sidik jari halus, set miniatur buatan tangan, gerak sedikit patah-patah.
${CHARSHEET_RULE}`,
    imageStyle: 'claymation stop motion, plasticine characters with subtle fingerprints, handmade miniature set, soft practical lighting, tilt-shift',
    negative: `photorealistic human, anime, 2d flat, glossy cgi, ${NO_TEXT}`,
    charSheet: 'Claymation character turnaround, original plasticine character, plain backdrop',
    framePrefix: 'claymation stop motion still,',
  },
];

export const DEFAULT_STYLE = VISUAL_STYLES[0]!;

export function findStyle(id: string): VisualStyle {
  return VISUAL_STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE;
}
