/**
 * Rauchtest für das Handy-Protokoll mit einem kleinen synthetischen Datensatz
 * in MIMII-Struktur: pump/id_00/normal (12 WAVs) + pump/id_00/abnormal (6 WAVs,
 * zusätzlicher Ton). Die ECHTEN Engines (GMIA, Spektral-Kosinus, Zeitmuster)
 * laufen durch die echte Handy-Pipeline.
 *
 * Node hat kein AudioContext — deshalb wird hier ein kleiner PCM-Decoder
 * eingespeist (Option `decode`); er liest die WAV ohne Umrechnung und nutzt
 * dieselbe Feature-Extraktion wie die Produktion (extractFeaturesFromChunk).
 * Erwartet: der Modus läuft durch, AUC deutlich über 0,5, 16 kHz wird vermerkt.
 */

import { describe, it, expect } from 'vitest';
import { parseFolder } from './parseFolder.js';
import { mulberry32 } from './rng.js';
import { extractFeaturesFromRaw } from './noiseBenchmark.js';
import type { ClipSource, DecodedClip } from './runnerShared.js';
import { runPhoneProtocol, runMetrics } from './phoneProtocol.js';
import { toCsvPhone, toCsvPhoneDetail, toJsonPhone } from './phoneProtocolExport.js';

const SR = 16000;
const SECONDS = 3;

function synth(seed: number, abnormal: boolean): Float32Array {
  const rng = mulberry32(seed);
  const n = SR * SECONDS;
  const out = new Float32Array(n);
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v =
      0.25 * Math.sin(2 * Math.PI * 440 * t + phase) + 0.12 * Math.sin(2 * Math.PI * 1320 * t);
    v += 0.03 * (rng() * 2 - 1);
    if (abnormal) v += 0.2 * Math.sin(2 * Math.PI * 3150 * t); // zusätzlicher Ton
    out[i] = v;
  }
  return out;
}

/** 16-bit-PCM-Mono-WAV schreiben. */
function toWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const put = (off: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  put(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return buf;
}

/** Minimaler PCM-Decoder für Node (16 bit mono, Kopf wie toWav). */
async function decodePcm(src: ClipSource): Promise<DecodedClip> {
  const bytes = await src.read();
  const v = new DataView(bytes);
  const rate = v.getUint32(24, true);
  const n = v.getUint32(40, true) / 2;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = v.getInt16(44 + i * 2, true) / 0x7fff;
  return { features: extractFeaturesFromRaw(raw, rate), raw, sampleRate: rate };
}

function dataset(): { paths: string[]; files: Map<string, ArrayBuffer> } {
  const files = new Map<string, ArrayBuffer>();
  for (let i = 0; i < 12; i++) {
    files.set(
      `pump/id_00/normal/${String(i).padStart(8, '0')}.wav`,
      toWav(synth(100 + i, false), SR)
    );
  }
  for (let i = 0; i < 6; i++) {
    files.set(
      `pump/id_00/abnormal/${String(i).padStart(8, '0')}.wav`,
      toWav(synth(900 + i, true), SR)
    );
  }
  // Ein Bereich mit nur einem Normal-Clip → muss übersprungen und genannt werden.
  files.set('pump/id_02/normal/00000000.wav', toWav(synth(5, false), SR));
  files.set('pump/id_02/abnormal/00000000.wav', toWav(synth(6, true), SR));
  return { paths: [...files.keys()], files };
}

describe('runPhoneProtocol (Rauchtest, synthetisch)', () => {
  it('läuft durch, trennt gut/auffällig (AUC ≫ 0,5) und exportiert', async () => {
    const { paths, files } = dataset();
    const ds = parseFolder(paths);
    const resolve = (p: string): ClipSource => {
      const b = files.get(p);
      if (!b) throw new Error(p);
      return { read: async () => b.slice(0) };
    };

    const progress: number[] = [];
    const result = await runPhoneProtocol(ds, resolve, {
      engines: ['gmia', 'spectral-cosine', 'temporal'],
      runs: 4,
      seed: 3,
      decode: decodePcm,
      onProgress: (p) => progress.push(p.filesDone),
    });

    expect(result.sections).toHaveLength(1);
    expect(result.skipped).toEqual([expect.objectContaining({ key: 'pump/id_02' })]);
    const sec = result.sections[0];
    expect(sec.key).toBe('pump/id_00');
    expect(sec.nTestNormal).toBe(11);
    expect(sec.nTestAbnormal).toBe(6);

    for (const e of ['gmia', 'spectral-cosine', 'temporal'] as const) {
      const r = sec.perEngine[e];
      expect(r, e).toBeDefined();
      expect(r!.runs).toHaveLength(4);
      expect(r!.summary.runsOk, e).toBe(4);
      expect(r!.summary.auc.median, e).toBeGreaterThan(0.8);
      expect(r!.summary.auc.min, e).toBeLessThanOrEqual(r!.summary.auc.max);
      for (const run of r!.runs) expect(run.nTestNormal + run.nTestAbnormal).toBe(17);
    }

    // Detail: 4 Durchläufe × 17 Testclips × 3 Engines; Referenz nie als Testdatei.
    expect(result.details).toHaveLength(4 * 17 * 3);
    for (const d of result.details) expect(d.testPath).not.toBe(d.refPath);

    // 16-kHz-Vermerk.
    expect(result.sourceSampleRates['16000']).toBeGreaterThan(0);
    expect(result.notes.join(' ')).toMatch(/16 kHz/);
    expect(progress.length).toBeGreaterThan(0);

    const csv = toCsvPhone(result);
    expect(csv).toContain('Referenzdatei');
    expect(csv).toContain('Übersprungen: pump/id_02');
    expect(csv.split('\n').filter((l) => l.startsWith('pump/id_00,')).length).toBe(3 * 4 + 3);
    const detail = toCsvPhoneDetail(result);
    expect(detail.split('\n')).toHaveLength(2 + 4 * 17 * 3);
    const json = JSON.parse(toJsonPhone(result, true)) as { mode: string; details: unknown[] };
    expect(json.mode).toBe('phone-protocol');
    expect(json.details).toHaveLength(4 * 17 * 3);
  }, 120_000);

  it('bricht über das AbortSignal ab', async () => {
    const { paths, files } = dataset();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      runPhoneProtocol(parseFolder(paths), (p) => ({ read: async () => files.get(p)!.slice(0) }), {
        engines: ['spectral-cosine'],
        runs: 2,
        decode: decodePcm,
        signal: ctrl.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('runMetrics', () => {
  it('zählt Fehlalarme, Erkennungen und Zwischenbereich getrennt nach Klasse', () => {
    const m = runMetrics({
      labels: [0, 0, 0, 0, 1, 1],
      raw: [0.1, 0.2, 0.3, 0.9, 0.8, 0.95],
      capped: [0, 0, 0, 0, 0, 0],
      status: ['healthy', 'uncertain', 'healthy', 'faulty', 'faulty', 'uncertain'],
      rawAllValid: true,
    });
    expect(m.scoreBasis).toBe('raw-cosine');
    expect(m.falseAlarmRate).toBeCloseTo(0.25);
    expect(m.detectionRate).toBeCloseTo(0.5);
    expect(m.normalUncertainRate).toBeCloseTo(0.25);
    expect(m.abnormalUncertainRate).toBeCloseTo(0.5);
    expect(m.uncertainRate).toBeCloseTo(2 / 6);
    expect(m.auc).toBeCloseTo(7 / 8);
  });
});
