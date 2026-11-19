/** Preset project untuk mulai cepat. Semua nilai bisa diubah setelah dipilih. */
export interface Preset {
  id: string;
  label: string;
  format: string;
  genre: string;
  style: string;
  aspect: '9:16' | '16:9' | '1:1';
  episodes: number;
  duration: number;
  topicHint: string;
  titleHint: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'anime', label: 'Serial anime', format: 'serial', genre: 'fantasi', style: 'anime', aspect: '16:9', episodes: 12, duration: 1200,
    titleHint: 'Penjaga Gerbang Senja',
    topicHint: 'Dunia, tokoh utama dan keinginannya, konflik musim ini, target penonton. Mis. remaja penjaga gerbang dunia roh di kota pelabuhan fiktif.',
  },
  {
    id: 'micro', label: 'Microdrama horor', format: 'microdrama', genre: 'horor', style: 'realistis sinematik', aspect: '9:16', episodes: 10, duration: 90,
    titleHint: 'Kamar 7',
    topicHint: 'Kos-kosan tua di Yogyakarta. Mitos kamar nomor 7 yang selalu kosong, dengan tiga ketukan tiap jam 03.00. Penonton 18–34 tahun.',
  },
  {
    id: 'webtoon', label: 'Drama webtoon', format: 'microdrama', genre: 'romance', style: 'komik webtoon', aspect: '9:16', episodes: 20, duration: 120,
    titleHint: 'Kontrak Setahun',
    topicHint: 'Drama romantis bergaya webtoon: dua tokoh dengan rahasia, satu kesepakatan yang mengikat mereka, cliffhanger tiap episode.',
  },
  {
    id: 'donghua', label: 'Donghua fantasi', format: 'serial', genre: 'fantasi', style: 'donghua 3D', aspect: '16:9', episodes: 16, duration: 1200,
    titleHint: 'Pedang Sembilan Awan',
    topicHint: 'Fantasi kultivasi: murid sekte kecil, sistem kekuatan dengan harga yang harus dibayar, rival, dan rahasia asal-usul.',
  },
  {
    id: 'anak', label: 'Animasi anak 3D', format: 'animasi', genre: 'anak', style: '3D animasi', aspect: '16:9', episodes: 10, duration: 300,
    titleHint: 'Petualangan Kiko',
    topicHint: 'Usia penonton 4–8 tahun. Tokoh hewan/anak dengan rasa ingin tahu, satu pelajaran sederhana per episode (berbagi, jujur, berani mencoba).',
  },
  {
    id: 'nusantara', label: 'Legenda Nusantara', format: 'serial', genre: 'fantasi', style: 'wayang & batik', aspect: '16:9', episodes: 8, duration: 300,
    titleHint: 'Hikayat Pulau Kabut',
    topicHint: 'Legenda orisinal terinspirasi cerita rakyat Nusantara (bukan menyalin legenda yang sudah ada), dengan pesan budaya yang hormat.',
  },
  {
    id: 'dokumenter', label: 'Dokumenter sejarah', format: 'dokumenter', genre: 'sejarah', style: 'fotorealistik dokumenter', aspect: '16:9', episodes: 1, duration: 600,
    titleHint: 'Jalur Rempah',
    topicHint: 'Topik sejarah, sudut pandang, sumber yang akan dirujuk, dan bagian yang berupa rekonstruksi.',
  },
  {
    id: 'iklan', label: 'Iklan naratif UMKM', format: 'iklan', genre: 'drama', style: 'realistis sinematik', aspect: '9:16', episodes: 1, duration: 60,
    titleHint: 'Kopi Pagi Bu Sri',
    topicHint: 'Produk/brand, masalah pelanggan, momen yang menyentuh, ajakan bertindak. Klaim produk harus jujur.',
  },
  {
    id: 'pendek', label: 'Film pendek', format: 'film_pendek', genre: 'drama', style: 'realistis sinematik', aspect: '16:9', episodes: 1, duration: 600,
    titleHint: 'Pulang',
    topicHint: 'Satu tema kuat, tokoh utama dengan keputusan sulit, akhir yang beresonansi. Cocok untuk festival atau YouTube.',
  },
];
