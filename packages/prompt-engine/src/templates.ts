import type { Stage } from './schemas';

export interface PromptTemplate {
  stage: Stage;
  genre: string; // '*' = semua genre
  format: string; // '*' = semua format
  version: number;
  body: string;
  weight: number;
}

/**
 * Template bawaan v1. Disalin ke tabel prompt_templates saat seed; runtime memilih
 * dari DB (dengan bobot A/B) dan jatuh ke sini bila DB kosong.
 * Placeholder: {{nama}}. Bagian konteks ({{context}}) diisi oleh context builder.
 */
export const BUILTIN_TEMPLATES: readonly PromptTemplate[] = [
  {
    stage: 'research', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu peneliti cerita untuk tim produksi film AI di Indonesia.
Tugas: riset untuk ide berikut sebelum naskah ditulis.

IDE KREATOR:
{{topic}}

Format: {{format}} · Genre: {{genre}} · Gaya visual: {{style}} · Bahasa: {{language}}

{{genreGuide}}

Tulis hasil riset dalam Markdown dengan bagian persis berikut (judul diakhiri titik dua):
Latar & budaya:
- 3–5 poin spesifik (tempat, kebiasaan, cara bicara) yang membuat cerita terasa nyata.
Mitos/elemen yang bisa dipakai:
- 3–5 poin. Tandai jika sebuah elemen adalah kepercayaan populer, bukan fakta.
Hook 3 detik pertama:
- 3 opsi pembuka visual/kalimat yang kuat.
Hindari:
- 2–3 klise atau risiko sensitif untuk tema ini.

Singkat dan padat. Jangan menulis naskah.`,
  },
  {
    stage: 'characters', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu penulis serial dan perancang karakter.
Dari riset dan ide di konteks, buat logline, premis, dan {{count}} karakter utama yang orisinal.

{{genreGuide}}
{{formatGuide}}

Syarat karakter:
- Nama Indonesia yang wajar dan beragam, bukan nama orang terkenal.
- Tiap karakter punya keinginan, rahasia/kelemahan, dan cara bicara yang berbeda.
- "look" = deskripsi visual konsisten (rambut, pakaian khas, ciri wajah, properti) untuk dikunci sebagai reference image.
- "sampleLine" = satu kalimat khas karakter.
- "voiceHint" salah satu: perempuan_lembut, perempuan_matang, laki_hangat, laki_berat, anak, narator.

Balas HANYA JSON:
{"logline": string, "premise": string, "characters": [{"name": string, "age": number, "role": string, "traits": string[], "look": string, "backstory": string, "speechStyle": string, "sampleLine": string, "voiceHint": string}]}`,
  },
  {
    stage: 'outline', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu showrunner. Susun outline episode {{episodeNumber}} dari {{episodeCount}}.
Target durasi: {{targetSec}} detik.

{{genreGuide}}
{{formatGuide}}

Perangkat naratif yang WAJIB dipakai minimal satu untuk variasi: {{devices}}.
Hindari klise: {{cliches}}.
{{previousEpisodes}}

Balas HANYA JSON:
{"episodeTitle": string, "synopsis": string, "hook": string, "cliffhanger": string,
 "scenes": [{"heading": "INT./EXT. LOKASI - WAKTU", "summary": string, "characters": string[], "estimatedSec": number}]}`,
  },
  {
    stage: 'scene', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu penulis naskah film. Tulis scene {{sceneNo}} lengkap dalam format naskah standar berbahasa {{language}}.

Rencana scene: {{sceneSummary}}

{{formatGuide}}

Format WAJIB (teks biasa, tanpa Markdown):
INT./EXT. LOKASI - WAKTU

Paragraf aksi singkat, present tense.

NAMA TOKOH (HURUF KAPITAL)
(parenthetical opsional)
Dialog.

Pakai hanya karakter dari sheet karakter. Pertahankan nama, umur, dan fakta kontinuitas. Jangan menulis apa pun di luar naskah.`,
  },
  {
    stage: 'rewrite', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu script doctor. Tulis ulang scene di bawah sesuai instruksi kreator, pertahankan format naskah standar, karakter, dan fakta kontinuitas.

INSTRUKSI: {{instruction}}

SCENE SAAT INI:
{{sceneText}}

Balas HANYA dengan scene hasil revisi.`,
  },
  {
    stage: 'shotlist', genre: '*', format: '*', version: 1, weight: 100,
    body: `Kamu sutradara dan storyboard artist. Pecah naskah episode menjadi shot list untuk rasio {{aspect}}, gaya visual "{{style}}".

Aturan:
- Durasi tiap shot 2–8 detik (maks 15). Total mendekati {{targetSec}} detik.
- shotType salah satu: WS, MS, CU, ECU, OTS, POV, INSERT, AERIAL. Microdrama: perbanyak CU/MS.
- camera: gerakan kamera singkat (statis, dolly in, handheld, pan kanan, tilt up, rack focus, slow push).
- characters: nama karakter yang tampak di frame, persis seperti di sheet.
- dialog: kalimat yang diucapkan di shot ini (atau null).
- imagePrompt: deskripsi frame kunci dalam bahasa Inggris untuk model gambar (komposisi, cahaya, lensa, mood, gaya "{{style}}"). Rujuk karakter dengan namanya; jangan deskripsikan ulang wajah (wajah diambil dari reference terkunci).
- motionPrompt: gerakan untuk image-to-video dalam bahasa Inggris, singkat.

Balas HANYA JSON:
{"shots": [{"sceneNo": number, "shotType": string, "camera": string, "durationSec": number, "description": string, "characters": string[], "dialog": string|null, "imagePrompt": string, "motionPrompt": string}]}`,
  },
  {
    stage: 'continuity', genre: '*', format: '*', version: 1, weight: 100,
    body: `Periksa kontinuitas naskah terhadap sheet karakter dan fakta series bible: nama, umur, relasi, timeline, lokasi, dan aturan dunia cerita.
Laporkan hanya konflik nyata. Jika tidak ada, kembalikan array kosong.

Balas HANYA JSON: {"issues": [{"severity": "info"|"warn"|"error", "sceneNo": number|null, "message": string, "suggestion": string}]}`,
  },
  {
    stage: 'publish_meta', genre: '*', format: '*', version: 1, weight: 100,
    body: `Buat metadata publish untuk episode ini. Judul memancing rasa ingin tahu tanpa clickbait menyesatkan.
Deskripsi YouTube wajib diakhiri kalimat: "Konten ini dibuat dengan bantuan AI."
Balas HANYA JSON:
{"youtube": {"title": string (maks 100 karakter), "description": string, "tags": string[]}, "tiktok": {"caption": string, "hashtags": string[]}}`,
  },
];

/** Pilih template paling spesifik (genre/format persis > wildcard), versi terbaru, lalu acak berbobot untuk A/B. */
export function selectTemplate(
  templates: readonly PromptTemplate[],
  stage: Stage,
  genre: string,
  format: string,
  random: () => number = Math.random,
): PromptTemplate {
  const score = (t: PromptTemplate) => (t.genre === genre ? 2 : 0) + (t.format === format ? 1 : 0);
  const candidates = templates.filter(
    (t) => t.stage === stage && (t.genre === genre || t.genre === '*') && (t.format === format || t.format === '*') && t.weight > 0,
  );
  if (!candidates.length) {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.stage === stage);
    if (!builtin) throw new Error(`Template untuk tahap ${stage} tidak ada`);
    return builtin;
  }
  const best = Math.max(...candidates.map(score));
  const pool = candidates.filter((t) => score(t) === best);
  const total = pool.reduce((s, t) => s + t.weight, 0);
  let x = random() * total;
  for (const t of pool) {
    x -= t.weight;
    if (x < 0) return t;
  }
  return pool[pool.length - 1]!;
}

export function fill(body: string, vars: Record<string, string | number | undefined>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined ? '' : String(v);
  });
}
