import type { ChatMessage } from './types';
import type { CharactersOutput, ContinuityOutput, OutlineOutput, PublishMeta, ShotlistOutput } from './schemas';

/**
 * Contoh keluaran untuk mode dev tanpa API key (AI_MOCK=1) dan untuk tes.
 * Cerita contoh: "Kamar 7", microdrama horor orisinal.
 */
export const SAMPLE_RESEARCH = `Latar & budaya:
- Kos lama dekat kampus di Yogyakarta biasanya rumah joglo atau rumah Belanda yang disekat jadi kamar, lorong panjang, satu dapur bersama.
- Pemilik kos generasi tua sering tinggal di lantai bawah dan punya aturan tak tertulis, misalnya jam malam dan larangan masuk ruangan tertentu.
- Panggilan "Nduk" dan "Le" memberi warna Jawa yang terasa dekat tanpa perlu banyak dialog.
Mitos/elemen yang bisa dipakai:
- Jam 03.00 sering disebut "jam paling sunyi" dalam cerita horor urban (kepercayaan populer, bukan fakta).
- Ketukan berulang yang tidak boleh dijawab memberi aturan sederhana yang mudah diingat penonton.
- Foto penghuni lama memberi petunjuk visual untuk misteri lintas episode.
Hook 3 detik pertama:
- Close-up jam 02.59 berganti 03.00, lalu ketukan pertama.
- Gembok di pintu yang mengunci dari luar, padahal ada suara dari dalam.
- Bisikan "jangan dijawab" sebelum gambar muncul.
Hindari:
- Hantu perempuan berambut panjang di cermin tanpa alasan cerita.
- Menjadikan kepercayaan agama tertentu sebagai sumber teror.`;

export const SAMPLE_CHARACTERS: CharactersOutput = {
  logline: 'Mahasiswi baru di kos tua Yogyakarta menemukan bahwa tiga ketukan jam tiga pagi dari kamar 7 adalah panggilan untuk menggantikan penghuni sebelumnya.',
  premise: 'Setiap penghuni kamar 7 sejak 1998 menghilang tanpa jejak. Laras, yang skeptis, harus membongkar aturan kos sebelum gilirannya tiba.',
  characters: [
    { name: 'Laras', age: 24, role: 'Mahasiswi S2, penghuni baru kamar 8', traits: ['skeptis', 'nekat', 'penasaran'], look: 'Rambut sebahu, hoodie abu, kacamata bulat. Selalu membawa gelas kosong ke dapur.', backstory: 'Pindah dari Medan untuk riset tesis tentang arsitektur kolonial.', speechStyle: 'Singkat, logis, sedikit sinis.', sampleLine: 'Gembok baru. Siapa yang ganti?', voiceHint: 'perempuan_lembut' },
    { name: 'Dimas', age: 26, role: 'Penghuni kamar 6, sudah 4 tahun di kos', traits: ['jahil', 'paranoid', 'setia kawan'], look: 'Kaus band pudar, kantung mata gelap, layar HP selalu menyala.', backstory: 'Mahasiswa abadi yang diam-diam mendokumentasikan semua penghuni kamar 7.', speechStyle: 'Bercanda untuk menutupi takut.', sampleLine: 'Tiga ketukan, jam tiga. Kalau kamu jawab, besok kamu yang ngetuk.', voiceHint: 'laki_hangat' },
    { name: 'Bu Wati', age: 58, role: 'Pemilik kos', traits: ['ramah', 'misterius', 'protektif'], look: 'Kebaya rumahan, sanggul kecil, senyum yang tidak pernah hilang.', backstory: 'Kehilangan anaknya di kamar 7 pada 1998.', speechStyle: 'Lembut, memanggil semua orang "Nduk" atau "Le".', sampleLine: 'Kamar 7 itu dulu kamar anak Ibu.', voiceHint: 'perempuan_matang' },
  ],
};

export const SAMPLE_OUTLINE: OutlineOutput = {
  episodeTitle: 'Ketukan Ketiga',
  synopsis: 'Laras mendengar tiga ketukan dari kamar 7. Dimas memperingatkannya, dan Bu Wati tahu lebih banyak dari yang ia katakan.',
  hook: 'Jam dinding berganti 03.00, lalu ketukan pertama.',
  cliffhanger: 'Bu Wati: "Kamar 7 itu dulu kamar anak Ibu."',
  scenes: [
    { heading: 'INT. KOS BU WATI, LORONG LANTAI 2 - MALAM', summary: 'Laras menemukan gembok baru di kamar 7 dan mendengar ketukan. Dimas memperingatkannya.', characters: ['Laras', 'Dimas'], estimatedSec: 25 },
    { heading: 'INT. KAMAR 6 - MALAM', summary: 'Dimas menunjukkan dinding foto penghuni kamar 7 sejak 1998. Ketukan pindah ke pintu kamar 6.', characters: ['Laras', 'Dimas'], estimatedSec: 21 },
    { heading: 'INT. DAPUR BERSAMA - PAGI', summary: 'Bu Wati bertanya soal ketukan dan membuka rahasia kecil.', characters: ['Laras', 'Bu Wati'], estimatedSec: 14 },
  ],
};

export const SAMPLE_SCENES = [
  `INT. KOS BU WATI, LORONG LANTAI 2 - MALAM

Lampu lorong berkedip. Jam dinding menunjuk 02.58. LARAS (24) keluar kamar membawa gelas kosong, lalu berhenti di depan pintu bernomor 7 yang digembok dari luar.

LARAS
(berbisik)
Gembok baru. Siapa yang ganti?

Dari balik pintu terdengar tiga ketukan pelan. Laras mundur selangkah.

DIMAS (O.S.)
Jangan dijawab.

Laras menoleh. DIMAS (26) berdiri di ujung lorong, wajahnya pucat diterangi layar HP.

DIMAS
Tiga ketukan, jam tiga. Kalau kamu jawab, besok kamu yang ngetuk.`,
  `INT. KAMAR 6 - MALAM

Dimas menutup pintu dan menyalakan lampu meja. Di dinding tertempel foto-foto lama penghuni kos. Beberapa wajah dicoret spidol merah.

LARAS
Kamu ngumpulin ini semua?

DIMAS
Semua penghuni kamar 7 sejak 1998. Nggak ada yang pindah. Mereka cuma berhenti kelihatan.

Ketukan terdengar lagi. Kali ini dari pintu kamar 6.`,
  `INT. DAPUR BERSAMA - PAGI

BU WATI (58) menuang teh. Senyumnya terlalu lebar. Laras duduk dengan mata sembab.

BU WATI
Semalam ada yang ketuk pintu kamu, Nduk?

LARAS
Kok Ibu tahu?

BU WATI
(tetap tersenyum)
Kamar 7 itu dulu kamar anak Ibu.`,
];

export const SAMPLE_SHOTLIST: ShotlistOutput = {
  shots: [
    { sceneNo: 1, shotType: 'WS', camera: 'dolly in', durationSec: 4, description: 'Lorong berkedip, Laras keluar kamar', characters: ['Laras'], dialog: null, imagePrompt: 'Wide shot of a narrow old boarding house corridor at night, flickering tungsten light, young woman Laras stepping out of her room holding an empty glass, cinematic, vertical 9:16', motionPrompt: 'slow dolly in, light flickers' },
    { sceneNo: 1, shotType: 'CU', camera: 'statis', durationSec: 3, description: 'Jam dinding 02.58', characters: [], dialog: null, imagePrompt: 'Close-up of an old wall clock showing 02:58, dim warm light, dust in the air, cinematic', motionPrompt: 'second hand ticks' },
    { sceneNo: 1, shotType: 'MS', camera: 'handheld', durationSec: 4, description: 'Laras berhenti di depan pintu 7 yang digembok', characters: ['Laras'], dialog: 'Gembok baru. Siapa yang ganti?', imagePrompt: 'Medium shot, Laras stands before a wooden door numbered 7 with a new padlock, night, uneasy mood', motionPrompt: 'subtle handheld sway' },
    { sceneNo: 1, shotType: 'ECU', camera: 'statis', durationSec: 2, description: 'Gembok baru berkilat', characters: [], dialog: null, imagePrompt: 'Extreme close-up of a shiny new brass padlock on an old door, glint of light', motionPrompt: 'light glint moves across lock' },
    { sceneNo: 1, shotType: 'POV', camera: 'slow push', durationSec: 3, description: 'Tiga ketukan dari balik pintu', characters: [], dialog: null, imagePrompt: 'POV of door number 7 in darkness, the door vibrates slightly as if knocked from inside', motionPrompt: 'slow push toward the door' },
    { sceneNo: 1, shotType: 'OTS', camera: 'statis', durationSec: 5, description: 'Dimas di ujung lorong, wajah diterangi HP', characters: ['Dimas', 'Laras'], dialog: 'Jangan dijawab.', imagePrompt: 'Over-the-shoulder from Laras toward Dimas at the end of the corridor, face lit by phone screen, pale', motionPrompt: 'Dimas lowers his phone' },
    { sceneNo: 2, shotType: 'MS', camera: 'pan kanan', durationSec: 4, description: 'Dimas menyalakan lampu meja', characters: ['Dimas'], dialog: null, imagePrompt: 'Medium shot of Dimas switching on a desk lamp in a cluttered small room', motionPrompt: 'pan right to reveal wall' },
    { sceneNo: 2, shotType: 'WS', camera: 'tilt up', durationSec: 5, description: 'Dinding penuh foto, wajah dicoret merah', characters: [], dialog: 'Semua penghuni kamar 7 sejak 1998.', imagePrompt: 'Wall covered with old photographs of boarding house tenants, some faces crossed out with red marker', motionPrompt: 'tilt up across photos' },
    { sceneNo: 2, shotType: 'CU', camera: 'statis', durationSec: 4, description: 'Laras menatap foto-foto', characters: ['Laras'], dialog: 'Kamu ngumpulin ini semua?', imagePrompt: 'Close-up of Laras looking at the photos, lamp light on her glasses', motionPrompt: 'eyes move across photos' },
    { sceneNo: 2, shotType: 'CU', camera: 'rack focus', durationSec: 3, description: 'Ketukan di pintu kamar 6', characters: [], dialog: null, imagePrompt: 'Close-up of door number 6 from inside the room, shadow under the door', motionPrompt: 'rack focus to the door, shadow shifts' },
    { sceneNo: 3, shotType: 'MS', camera: 'statis', durationSec: 5, description: 'Bu Wati menuang teh, senyum terlalu lebar', characters: ['Bu Wati'], dialog: 'Semalam ada yang ketuk pintu kamu, Nduk?', imagePrompt: 'Medium shot of Bu Wati pouring tea in a shared kitchen, morning light, unsettling wide smile', motionPrompt: 'tea pours, steam rises' },
    { sceneNo: 3, shotType: 'ECU', camera: 'slow push', durationSec: 4, description: 'Senyum Bu Wati', characters: ['Bu Wati'], dialog: 'Kamar 7 itu dulu kamar anak Ibu.', imagePrompt: 'Extreme close-up of Bu Wati smiling, morning light, eerie', motionPrompt: 'slow push in on the smile' },
  ],
};

export const SAMPLE_CONTINUITY: ContinuityOutput = { issues: [] };

export const SAMPLE_META: PublishMeta = {
  youtube: {
    title: 'Jangan Jawab Ketukan Ketiga | Kamar 7 Eps 3 #shorts',
    description: 'Laras akhirnya mendengar tiga ketukan dari kamar 7. Dimas tahu sesuatu, dan Bu Wati tahu lebih banyak.\n\nKonten ini dibuat dengan bantuan AI.',
    tags: ['kamar7', 'horor', 'ceritahoror', 'microdrama'],
  },
  tiktok: { caption: 'Tiga ketukan jam 3 pagi. Kamu bakal jawab? Eps 3 Kamar 7', hashtags: ['#kamar7', '#horor', '#ceritahoror', '#microdrama'] },
};

/** Responder untuk MockScriptAI: membaca penanda [stage:x] di system prompt. */
export function mockResponder(req: { messages: ChatMessage[] }): string {
  const sys = req.messages.find((m) => m.role === 'system')?.content ?? '';
  const user = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  const stage = /\[stage:(\w+)\]/.exec(sys)?.[1];
  switch (stage) {
    case 'research':
      return SAMPLE_RESEARCH;
    case 'characters':
      return JSON.stringify(SAMPLE_CHARACTERS);
    case 'outline':
      return JSON.stringify(SAMPLE_OUTLINE);
    case 'scene': {
      const n = Number(/Tulis scene (\d+)/.exec(user)?.[1] ?? 1);
      return SAMPLE_SCENES[(n - 1) % SAMPLE_SCENES.length]!;
    }
    case 'rewrite': {
      const cur = /SCENE SAAT INI:\n([\s\S]*?)\n\nBalas HANYA/.exec(user)?.[1] ?? SAMPLE_SCENES[0]!;
      return cur.replace(/\n\n([A-Z][A-Z .]+)\n/, '\n\nSunyi sejenak. Lampu padam satu detik.\n\n$1\n');
    }
    case 'shotlist':
      return JSON.stringify(SAMPLE_SHOTLIST);
    case 'continuity':
      return JSON.stringify(SAMPLE_CONTINUITY);
    case 'publish_meta':
      return JSON.stringify(SAMPLE_META);
    case 'edit': {
      // Usulan contoh: percepat shot pertama dan beri transisi dip ke shot kedua.
      const clips = [...user.matchAll(/"shotId":"([^"]+)","in":([\d.]+),"out":([\d.]+)/g)];
      const ops: unknown[] = [];
      const first = clips[0];
      if (first) ops.push({ op: 'trim', shotId: first[1], out: Math.max(Number(first[2]) + 0.5, Number(first[3]) * 0.8) });
      if (clips[1]) ops.push({ op: 'transition', shotId: clips[1][1], transition: 'dip' });
      if (!ops.length) ops.push({ op: 'duck', enabled: true });
      return JSON.stringify({ summary: 'Shot pembuka dipercepat 20% dan transisi ke shot kedua diganti dip ke hitam.', ops });
    }
    default:
      return 'OK';
  }
}
