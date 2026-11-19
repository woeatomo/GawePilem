import { DEFAULT_STYLE, VISUAL_STYLES } from './styles';
import type { FilmFormat, Genre } from './schemas';

/** Larangan yang SELALU disisipkan ke setiap prompt, tidak bisa dimatikan template. */
export const GUARDRAILS = `ATURAN WAJIB (tidak boleh dilanggar):
- Jangan meniru, menyebut, atau memparodikan karakter, dunia, atau IP berhak cipta (film, kartun, game, novel, komik terkenal).
- Jangan memakai nama, wajah, atau suara orang nyata (selebritas, tokoh publik, atau orang biasa). Semua tokoh fiktif.
- Tidak ada konten seksual, apalagi yang melibatkan anak. Tidak ada ujaran kebencian atau SARA, dan tidak ada panduan kekerasan nyata.
- Horor & kekerasan boleh secara sinematik (ketegangan, implisit), bukan gore eksplisit.
- Jangan menyajikan fiksi sebagai fakta atau berita nyata.`;

export const GENRE_GUIDE: Partial<Record<Genre, string>> & { default: string } = {
  horor: `Horor: bangun ketegangan lewat aturan sederhana yang mudah diingat penonton (mis. "jangan dijawab"), suara, dan apa yang TIDAK terlihat.
Gunakan latar dan mitos lokal Indonesia secara hormat tanpa merendahkan kepercayaan tertentu. Hindari jump scare murahan berulang; tiap episode butuh satu momen "dingin" yang baru.`,
  drama: `Drama: konflik berpusat pada keinginan vs. kebutuhan tokoh. Tunjukkan emosi lewat tindakan dan subteks, bukan dialog yang menjelaskan perasaan.
Setiap scene harus mengubah sesuatu (relasi, informasi, atau keputusan). Hindari melodrama berlebihan dan tokoh hitam-putih.`,
  thriller: `Thriller: jam terus berdetak. Informasi dibuka sedikit demi sedikit, tiap scene menaikkan taruhan.`,
  komedi: `Komedi: humor dari karakter dan situasi, bukan dari merendahkan kelompok tertentu.`,
  romance: `Romance: chemistry lewat interaksi spesifik, hambatan yang masuk akal, dan momen kecil yang jujur.`,
  misteri: `Misteri: tanam petunjuk yang adil bagi penonton; jawaban harus terasa tak terduga tapi tak terhindarkan.`,
  fantasi: `Fantasi: dunia dengan aturan (sistem sihir, batas kekuatan, harga yang harus dibayar) yang konsisten antar-episode.
Perkenalkan dunia lewat tindakan tokoh, bukan eksposisi panjang. Ambil inspirasi dari mitologi Nusantara secara orisinal dan hormat.`,
  action: `Action: setiap pertarungan punya tujuan dan taruhan emosional, bukan sekadar adu kekuatan. Koreografi jelas: siapa di mana, apa yang berubah setelah adegan.
Beri jeda napas di antara adegan aksi; kekalahan dan harga yang dibayar membuat kemenangan bermakna.`,
  'sci-fi': `Sci-fi: satu gagasan "bagaimana jika" yang dieksplorasi konsekuensinya pada manusia. Teknologi punya aturan dan keterbatasan yang konsisten.`,
  sejarah: `Sejarah: latar dan detail periode akurat; tandai bagian fiksi. Hindari menyudutkan kelompok tertentu.`,
  anak: `Anak (penonton di bawah 13 tahun): bahasa sederhana, pesan positif tanpa menggurui, konflik ringan yang selesai di episode yang sama.
Tidak ada kekerasan menakutkan, kata kasar, atau adegan berbahaya yang bisa ditiru. Tokoh anak memecahkan masalahnya sendiri.`,
  religi: `Religi: hormati keyakinan, rujuk nilai universal (kejujuran, sabar, tolong-menolong). Jangan mengutip ayat/hadis tanpa sumber jelas atau mempertentangkan agama.`,
  default: `Tulis dengan detail spesifik, tokoh yang punya keinginan jelas, dan konflik yang terus bergerak.`,
};

export const FORMAT_GUIDE: Partial<Record<FilmFormat, string>> & { default: string } = {
  microdrama: `Format microdrama vertikal 9:16 (60–120 detik per episode, 3–6 scene pendek).
- Hook kuat di 3 detik pertama: visual atau kalimat yang langsung memancing pertanyaan.
- Satu konflik utama per episode, dialog singkat (maks 2 kalimat per giliran), banyak close-up.
- Akhiri dengan cliffhanger yang membuat penonton menunggu episode berikutnya.`,
  film_pendek: `Film pendek: struktur 3 babak ringkas, satu tema kuat, akhir yang memberi resonansi.`,
  serial: `Serial episodik: tiap episode punya arc sendiri sambil menggerakkan arc musim.`,
  dokumenter: `Dokumenter pendek: narasi voice over yang akurat, sumber jelas, visual ilustratif. Tandai rekonstruksi sebagai ilustrasi.`,
  iklan: `Iklan naratif 30–90 detik: masalah → momen → solusi, produk hadir alami, tanpa klaim berlebihan.`,
  animasi: `Animasi: manfaatkan visual yang tidak mungkin di live action, tetap konsisten gaya.`,
  default: `Tulis untuk tayangan video pendek yang padat.`,
};

/** Panduan gaya visual per id gaya (diturunkan dari registri VISUAL_STYLES). */
export const STYLE_GUIDE: Record<string, string> & { default: string } = {
  ...Object.fromEntries(VISUAL_STYLES.map((v) => [v.id, `${v.guide}\nAwali imagePrompt dengan "${v.framePrefix}".`])),
  default: DEFAULT_STYLE.guide,
};

/**
 * Perangkat naratif untuk mendorong variasi antar-episode, supaya channel kreator
 * tidak dianggap konten massal/repetitif. Dipilih deterministik dari seed.
 */
export const NARRATIVE_DEVICES = [
  'buka dari akhir lalu mundur sebentar',
  'sudut pandang tokoh pendukung',
  'benda kecil yang jadi petunjuk penting',
  'dialog yang berlawanan dengan tindakan',
  'jeda sunyi panjang sebelum titik balik',
  'informasi yang penonton tahu tapi tokoh tidak (dramatic irony)',
  'adegan sehari-hari yang berubah ganjil',
  'pengulangan motif visual dengan makna berbeda di akhir',
  'keputusan moral tanpa jawaban benar',
  'tokoh berbohong dan penonton baru sadar belakangan',
  'batas waktu yang jelas (deadline)',
  'lokasi sempit yang menekan',
] as const;

export const CLICHES_TO_AVOID = [
  'ternyata semua hanya mimpi',
  'tokoh menjelaskan rencana jahat panjang lebar',
  'hantu muncul tiba-tiba di cermin tanpa makna',
  'twist tanpa petunjuk sebelumnya',
  'kalimat pembuka "Halo guys" atau gaya vlog',
];

/** PRNG kecil deterministik (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDevices(seed: number, n = 2): string[] {
  const r = rng(seed);
  const pool = [...NARRATIVE_DEVICES];
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return out;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
