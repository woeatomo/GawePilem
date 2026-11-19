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

/**
 * Panduan gaya visual. Untuk anime, deskripsi karakter harus berupa "model sheet" yang bisa
 * diulang persis di setiap shot (rambut, mata, kostum, aksesori) karena konsistensi tokoh adalah
 * hal pertama yang dinilai penonton anime.
 */
export const STYLE_GUIDE: Record<string, string> & { default: string } = {
  anime: `Gaya visual ANIME serial TV Jepang: line art bersih, cel shading, latar dilukis detail, warna hidup, ekspresi wajah ekspresif.
- Deskripsi karakter ("look") WAJIB seperti model sheet: warna & model rambut, warna mata, bentuk wajah, tinggi relatif, kostum khas (warna utama), aksesori ikonik. Siluet tiap tokoh harus mudah dibedakan.
- Shot pakai bahasa visual anime: establishing shot latar, close-up mata/ekspresi, speed lines untuk aksi, reaction shot singkat, cut ke detail benda simbolik.
- Hindari meniru desain karakter, kostum, atau gaya khas studio/anime terkenal tertentu. Buat desain orisinal.`,
  '3D animasi': `Gaya visual 3D animasi sinematik: bentuk karakter sederhana & ekspresif, material lembut, pencahayaan global.
- Deskripsi karakter berupa model sheet (proporsi, warna, kostum, aksesori) supaya konsisten.`,
  'cat air': `Gaya ilustrasi cat air: tepi lembut, tekstur kertas, palet terbatas. Deskripsi karakter fokus pada siluet & warna kostum.`,
  'noir hitam putih': `Gaya noir hitam putih: kontras tinggi, bayangan tajam, komposisi miring. Deskripsi karakter fokus pada siluet & kostum.`,
  default: `Gaya visual sinematik realistis. Deskripsi karakter konsisten: rambut, pakaian khas, ciri wajah, properti.`,
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
