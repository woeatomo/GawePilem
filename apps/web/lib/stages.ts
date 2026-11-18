export const STAGES = [
  { id: 'riset', name: 'Riset' },
  { id: 'karakter', name: 'Cerita & karakter' },
  { id: 'naskah', name: 'Naskah' },
  { id: 'storyboard', name: 'Storyboard' },
  { id: 'visual', name: 'Produksi visual' },
  { id: 'audio', name: 'Audio' },
  { id: 'editor', name: 'Editor' },
  { id: 'publish', name: 'Publish' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];
export type StageStatus = 'todo' | 'wip' | 'done';

export const FORMAT_LABEL: Record<string, string> = {
  microdrama: 'Microdrama vertikal', film_pendek: 'Film pendek', serial: 'Serial episodik', dokumenter: 'Dokumenter pendek', iklan: 'Iklan naratif', animasi: 'Animasi',
};
export const GENRE_OPTIONS = ['horor', 'drama', 'thriller', 'misteri', 'romance', 'komedi', 'action', 'sci-fi', 'fantasi', 'sejarah', 'religi', 'anak'];
export const STYLE_OPTIONS = ['realistis sinematik', 'anime', '3D animasi', 'cat air', 'noir hitam putih'];
