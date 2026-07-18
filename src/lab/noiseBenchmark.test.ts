/**
 * Tests für den Lärm-Robustheits-Benchmark (Stufe 2).
 *
 * Kernaussagen:
 * 1. mixAtSnr trifft die Ziel-SNR exakt (Leistungsverhältnis der Segmente)
 * 2. extractFeaturesFromRaw chunked identisch zur Produktions-Pipeline
 * 3. Synthetischer End-to-End-A/B mit der ECHTEN SpectralCosine-Engine:
 *    Bei ähnlichen Pegeln (0 dB) trennt die Subtraktion gut/anomal
 *    besser als ohne (AUC mit ≥ AUC ohne) – die Kernbehauptung des Konzepts.
 * 4. estimateClipSnrDb (Produktions-Ampel-Schätzer) trackt die Misch-SNR.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import {
  buildNoiseProfileFromFeatures,
  applyNoiseSubtraction,
  estimateClipSnrDb,
  DEFAULT_NOISE_SUB_SETTINGS,
} from '@core/dsp/noiseProfile.js';
import { SpectralCosineEngine } from '@core/ml/engine/SpectralCosineEngine.js';
import type { TrainingData } from '@data/types.js';
import { auc } from './auc.js';
import { mulberry32 } from './rng.js';
import {
  signalPower,
  mixAtSnr,
  extractFeaturesFromRaw,
  computeRefLogMean,
  scoreFeatureClip,
} from './noiseBenchmark.js';

const SR = 48000;

/** Deterministisches Signal: Summe von Sinustönen + weißes Rauschen. */
function makeSignal(
  seconds: number,
  tones: Array<{ freq: number; amp: number }>,
  noiseAmp: number,
  seed: number
): Float32Array {
  const rng = mulberry32(seed);
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = noiseAmp * (rng() * 2 - 1);
    for (const t of tones) {
      v += t.amp * Math.sin((2 * Math.PI * t.freq * i) / SR);
    }
    out[i] = v;
  }
  return out;
}

/** "Gesunde Maschine": zwei stabile Töne. */
const healthySignal = (seconds: number, seed: number): Float32Array =>
  makeSignal(seconds, [{ freq: 1000, amp: 0.2 }, { freq: 3100, amp: 0.1 }], 0.02, seed);

/** "Anomale Maschine": verschobene Töne + zusätzliche Linie. */
const faultySignal = (seconds: number, seed: number): Float32Array =>
  makeSignal(
    seconds,
    [
      { freq: 800, amp: 0.18 },
      { freq: 2500, amp: 0.12 },
      { freq: 5200, amp: 0.08 },
    ],
    0.02,
    seed
  );

/** "Hallenlärm": tieffrequent gefärbtes Rauschen (gleitender Mittelwert). */
function hallNoise(seconds: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  let smooth = 0;
  for (let i = 0; i < n; i++) {
    const white = rng() * 2 - 1;
    smooth = 0.98 * smooth + 0.02 * white; // Tiefpass → tieffrequente Energie
    out[i] = 0.15 * white + 3.0 * smooth;
  }
  return out;
}

describe('mixAtSnr', () => {
  it('hits the target SNR exactly (segment power ratio)', () => {
    const clean = healthySignal(1, 1);
    const noise = hallNoise(2, 2);

    for (const target of [10, 0, -10]) {
      const mixed = mixAtSnr(clean, noise, target, 12345);
      // Lärmanteil rekonstruieren: mixed − clean
      const noisePart = new Float32Array(clean.length);
      for (let i = 0; i < clean.length; i++) noisePart[i] = mixed[i] - clean[i];
      const snr = 10 * Math.log10(signalPower(clean) / signalPower(noisePart));
      expect(snr).toBeCloseTo(target, 6);
    }
  });

  it('wraps around short noise recordings (modulo)', () => {
    const clean = healthySignal(1, 3);
    const shortNoise = hallNoise(0.25, 4);
    const mixed = mixAtSnr(clean, shortNoise, 0, 0);
    expect(mixed.length).toBe(clean.length);
    // Muss sich vom Original unterscheiden (Lärm wurde addiert)
    let diff = 0;
    for (let i = 0; i < clean.length; i++) diff += Math.abs(mixed[i] - clean[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it('returns a copy of the clean signal for empty noise', () => {
    const clean = healthySignal(0.5, 5);
    const mixed = mixAtSnr(clean, new Float32Array(0), 0);
    expect(Array.from(mixed)).toEqual(Array.from(clean));
    expect(mixed).not.toBe(clean);
  });
});

describe('extractFeaturesFromRaw', () => {
  it('produces the production chunk count (330ms window, 66ms hop)', () => {
    const seconds = 2;
    const raw = healthySignal(seconds, 6);
    const features = extractFeaturesFromRaw(raw, SR);

    const windowSamples = Math.floor(DEFAULT_DSP_CONFIG.windowSize * SR);
    const hopSamples = Math.floor(DEFAULT_DSP_CONFIG.hopSize * SR);
    const expected = Math.floor((raw.length - windowSamples) / hopSamples) + 1;

    expect(features.length).toBe(expected);
    expect(features[0].absoluteFeatures.length).toBe(DEFAULT_DSP_CONFIG.frequencyBins);
    expect(features[0].frequencyRange[1]).toBe(SR / 2);
  });

  it('returns empty for signals shorter than one window', () => {
    expect(extractFeaturesFromRaw(new Float32Array(100), SR)).toEqual([]);
  });
});

describe('synthetic A/B: subtraction improves AUC at similar levels', () => {
  // Voller A/B-Durchlauf mit echter Engine: läuft ~5 s und reißt unter
  // Parallellast das 5-s-Default-Timeout — deshalb explizit erhöht.
  it('AUC with subtraction ≥ AUC without at 0 dB SNR (real SpectralCosine engine)', { timeout: 30000 }, () => {
    const engine = new SpectralCosineEngine();

    // Referenz sauber trainieren (Werks-Szenario)
    const trainFeatures = extractFeaturesFromRaw(healthySignal(4, 10), SR);
    const trainingData: TrainingData = {
      featureVectors: trainFeatures.map((f) => f.features),
      machineId: 'lab-test',
      recordingId: 'lab-test-rec',
      numSamples: trainFeatures.length,
      config: { ...DEFAULT_DSP_CONFIG, sampleRate: SR },
    };
    const model = engine.train({ trainingData, sampleRate: SR }, 'lab-test');
    model.label = 'Referenz';
    model.type = 'healthy';
    const refLogMean = computeRefLogMean(trainFeatures);

    // Lärmprofil aus der ersten Hälfte, gemischt wird mit der zweiten
    const noise = hallNoise(8, 11);
    const half = Math.floor(noise.length / 2);
    const profile = buildNoiseProfileFromFeatures(
      extractFeaturesFromRaw(noise.subarray(0, half), SR),
      SR,
      half / SR,
      'Labor'
    );
    const mixNoise = noise.slice(half);
    const settings = { ...DEFAULT_NOISE_SUB_SETTINGS, enabled: true };

    // Test-Clips: 6 gesund, 6 anomal, bei 0 dB gemischt
    const rng = mulberry32(99);
    const labels: number[] = [];
    const anomalyWithout: number[] = [];
    const anomalyWith: number[] = [];
    const estimates: number[] = [];

    for (let i = 0; i < 12; i++) {
      const label = i < 6 ? 0 : 1;
      const clean = label === 0 ? healthySignal(1.5, 100 + i) : faultySignal(1.5, 200 + i);
      const mixed = mixAtSnr(clean, mixNoise, 0, Math.floor(rng() * mixNoise.length));
      const feats = extractFeaturesFromRaw(mixed, SR);

      const a = scoreFeatureClip(engine, [model], feats, SR, 'mean');
      const cleaned = applyNoiseSubtraction(feats, profile, settings, refLogMean);
      const b = scoreFeatureClip(engine, [model], cleaned, SR, 'mean');

      labels.push(label);
      anomalyWithout.push(a.rawValid ? a.raw : a.capped);
      anomalyWith.push(b.rawValid ? b.raw : b.capped);

      const est = estimateClipSnrDb(feats, profile, refLogMean);
      if (est !== null) estimates.push(est);
    }

    const aucWithout = auc(labels, anomalyWithout);
    const aucWith = auc(labels, anomalyWith);

    // Kernbehauptung: Subtraktion verschlechtert nie und trennt hier besser
    expect(aucWith).toBeGreaterThanOrEqual(aucWithout);
    expect(aucWith).toBeGreaterThan(0.9);

    // Produktions-SNR-Schätzer: bei 0 dB Misch-SNR muss die Schätzung im
    // "Pegel ähnlich"-Fenster liegen (grobe Breitband-Schätzung, ±6 dB)
    const meanEst = estimates.reduce((s, v) => s + v, 0) / estimates.length;
    expect(meanEst).toBeGreaterThan(-6);
    expect(meanEst).toBeLessThan(6);
  });
});
