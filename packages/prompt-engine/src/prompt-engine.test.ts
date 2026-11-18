import { describe, expect, it } from 'vitest';
import {
  buildPrompt, buildContext, selectTemplate, BUILTIN_TEMPLATES, GUARDRAILS, moderateText, mockResponder,
  charactersOutputSchema, shotlistOutputSchema, outlineOutputSchema, SAMPLE_SCENES, extractDialog, parseScreenplay,
  pickDevices, STAGES, OUTPUT_SCHEMAS, type ProjectContext, type PromptTemplate,
} from './index';

const project: ProjectContext = {
  title: 'Kamar 7', format: 'microdrama', genre: 'horor', style: 'realistis sinematik', aspect: '9:16', language: 'id',
  targetSec: 90, episodeCount: 10,
  bible: { logline: 'Mahasiswi baru...', continuityFacts: ['Laras berumur 24'] },
  research: 'Riset panjang. '.repeat(50),
  characters: [{ name: 'Laras', age: 24, role: 'mahasiswi', traits: ['skeptis'], look: 'hoodie abu', locked: true }],
};

describe('buildPrompt', () => {
  it('setiap tahap punya template bawaan', () => {
    for (const s of STAGES) expect(BUILTIN_TEMPLATES.some((t) => t.stage === s)).toBe(true);
  });

  it('selalu menyisipkan guardrail IP & orang nyata, dan konteks', () => {
    for (const stage of STAGES) {
      const p = buildPrompt({ stage, project, vars: { topic: 'kos tua', sceneNo: 1, sceneSummary: 'x', instruction: 'x', sceneText: 'x', episodeNumber: 1 } });
      expect(p.messages[0]!.content).toContain(GUARDRAILS);
      expect(p.messages[0]!.content).toContain(`[stage:${stage}]`);
      expect(p.messages[1]!.content).toContain('SHEET KARAKTER');
      expect(p.messages[1]!.content).not.toMatch(/\{\{\w+\}\}/);
      expect(p.structured).toBe(stage in OUTPUT_SCHEMAS);
    }
  });

  it('menyisipkan panduan genre horor & format microdrama', () => {
    const p = buildPrompt({ stage: 'outline', project });
    expect(p.messages[1]!.content).toMatch(/Hook kuat di 3 detik/);
    expect(p.messages[1]!.content).toMatch(/Horor:/);
  });

  it('perangkat variasi berbeda antar-episode tapi deterministik', () => {
    const a = buildPrompt({ stage: 'outline', project, variationSeed: 'ep1' }).messages[1]!.content;
    const a2 = buildPrompt({ stage: 'outline', project, variationSeed: 'ep1' }).messages[1]!.content;
    expect(a).toBe(a2);
    const seeds = new Set(Array.from({ length: 10 }, (_, i) => pickDevices(i * 7919).join('|')));
    expect(seeds.size).toBeGreaterThan(5);
  });

  it('episode sebelumnya disebut agar tidak diulang', () => {
    const p = buildPrompt({ stage: 'outline', project: { ...project, previousEpisodes: ['Eps 1: Gembok'] } });
    expect(p.messages[1]!.content).toContain('Eps 1: Gembok');
  });

  it('konteks dipangkas sesuai budget token model (riset dulu, karakter terakhir)', () => {
    const big = { ...project, research: 'x'.repeat(200_000), scenes: [{ no: 1, text: 'y'.repeat(40_000) }] };
    const c = buildContext(big, 3_000);
    expect(c.tokens).toBeLessThanOrEqual(3_100);
    expect(c.trimmed[0]).toBe('research');
    expect(c.text).toContain('Laras');
    const p = buildPrompt({ stage: 'shotlist', project: big, contextTokens: 16_000 });
    expect(p.trimmed).toContain('research');
  });
});

describe('selectTemplate', () => {
  const t = (genre: string, format: string, version: number, weight = 100): PromptTemplate => ({ stage: 'scene', genre, format, version, body: `${genre}/${format}/v${version}`, weight });

  it('memilih yang paling spesifik', () => {
    const list = [t('*', '*', 1), t('horor', '*', 1), t('horor', 'microdrama', 1)];
    expect(selectTemplate(list, 'scene', 'horor', 'microdrama').body).toBe('horor/microdrama/v1');
    expect(selectTemplate(list, 'scene', 'drama', 'microdrama').body).toBe('*/*/v1');
  });

  it('A/B test berbobot dan bobot 0 nonaktif', () => {
    const list = [t('horor', '*', 1, 0), t('horor', '*', 2, 100), t('horor', '*', 3, 100)];
    expect(selectTemplate(list, 'scene', 'horor', 'x', () => 0.1).version).toBe(2);
    expect(selectTemplate(list, 'scene', 'horor', 'x', () => 0.9).version).toBe(3);
  });

  it('jatuh ke template bawaan bila DB kosong untuk tahap itu', () => {
    expect(selectTemplate([], 'research', 'horor', 'microdrama').stage).toBe('research');
  });
});

describe('fixture mock valid terhadap skema', () => {
  const req = (stage: string, user = '') => ({ messages: [{ role: 'system' as const, content: `[stage:${stage}]` }, { role: 'user' as const, content: user }] });
  it('characters, outline, shotlist', () => {
    expect(charactersOutputSchema.parse(JSON.parse(mockResponder(req('characters')))).characters).toHaveLength(3);
    expect(outlineOutputSchema.parse(JSON.parse(mockResponder(req('outline')))).scenes).toHaveLength(3);
    expect(shotlistOutputSchema.parse(JSON.parse(mockResponder(req('shotlist')))).shots).toHaveLength(12);
    expect(mockResponder(req('scene', 'Tulis scene 2 lengkap'))).toContain('KAMAR 6');
  });

  it('shotType dinormalisasi', () => {
    const s = shotlistOutputSchema.parse({ shots: [{ sceneNo: 1, shotType: ' cu', durationSec: '3', description: 'd', imagePrompt: 'p' }] });
    expect(s.shots[0]).toMatchObject({ shotType: 'CU', durationSec: 3, camera: 'statis', dialog: null });
  });
});

describe('screenplay', () => {
  it('mengurai blok dan dialog per karakter', () => {
    const blocks = parseScreenplay(SAMPLE_SCENES[0]!);
    expect(blocks[0]).toEqual({ type: 'heading', text: 'INT. KOS BU WATI, LORONG LANTAI 2 - MALAM' });
    expect(blocks.find((b) => b.type === 'parenthetical')?.text).toBe('(berbisik)');
    const d = extractDialog(SAMPLE_SCENES);
    expect(d.map((l) => l.character)).toEqual(['LARAS', 'DIMAS', 'DIMAS', 'LARAS', 'DIMAS', 'BU WATI', 'LARAS', 'BU WATI']);
    expect(d[0]).toMatchObject({ sceneNo: 1, text: 'Gembok baru. Siapa yang ganti?' });
    expect(d[2]!.estimatedSec).toBeGreaterThan(3);
  });
});

describe('moderasi prefilter', () => {
  it('memblokir IP berhak cipta', () => {
    expect(moderateText('Buat karakter mirip Doraemon').verdict).toBe('block');
  });
  it('menandai peniruan orang nyata', () => {
    expect(moderateText('karakter dengan wajah mirip presiden').verdict).toBe('flag');
  });
  it('memblokir konten seksual anak', () => {
    expect(moderateText('adegan telanjang anak').verdict).toBe('block');
  });
  it('meloloskan horor lokal yang wajar', () => {
    expect(moderateText('Kos tua di Yogyakarta, tiga ketukan jam 03.00').verdict).toBe('allow');
  });
});
