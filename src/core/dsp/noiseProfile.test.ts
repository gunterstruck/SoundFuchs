/**
 * Tests für die Lärmprofil-Subtraktion (noiseProfile.ts)
 *
 * Kernaussagen:
 * 1. Profilbildung liefert korrekte Mittelwert-/Std-Statistiken
 * 2. Subtraktion holt ein verrauschtes Signal näher an das saubere Signal
 *    (Kosinus-Ähnlichkeit steigt) – der eigentliche Zweck des Features
 * 3. Spectral Floor verhindert negative/Null-Energien
 * 4. Inkompatible Profile (Sample-Rate/Bins) → Pass-Through ohne Änderung
 * 5. Realtime-Variante konvergiert gegen das Batch-Ergebnis
 * 6. Scale-Fit erkennt Pegelunterschiede zwischen Profil und Messung
 */

import { describe, it, expect } from 'vitest';
import type { FeatureVector } from '@data/types.js';
import {
  buildNoiseProfileFromFeatures,
  applyNoiseSubtraction,
  RealtimeNoiseSubtraction,
  estimateEnergyScale,
  isProfileCompatible,
  isProfileStationary,
  classifyNoiseSnr,
  isProfileStale,
  profileAgeDays,
  noiseReferenceOverlap,
  PROFILE_STALE_AFTER_MS,
  OVERLAP_WARN_THRESHOLD,
  MinimumStatisticsNoiseEstimator,
  RealtimeMinStatsSubtraction,
  DEFAULT_NOISE_SUB_SETTINGS,
  type NoiseSubtractionSettings,
  type StoredNoiseProfile,
} from './noiseProfile.js';

const BINS = 64;
const SAMPLE_RATE = 48000;

/** Deterministischer Pseudo-Zufall (Mulberry32) für reproduzierbare Tests */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FeatureVector aus einem Amplituden-Spektrum bauen */
function makeFeatureVector(amplitudes: number[]): FeatureVector {
  const abs = Float64Array.from(amplitudes);
  let total = 0;
  for (const v of abs) total += v;
  const norm = new Float64Array(abs.length);
  if (total > 0) {
    for (let i = 0; i < abs.length; i++) norm[i] = abs[i] / total;
  }
  return {
    features: norm,
    normalizedFeatures: norm,
    absoluteFeatures: abs,
    bins: abs.length,
    frequencyRange: [0, SAMPLE_RATE / 2],
    rmsAmplitude: 0.1,
  };
}

/** Maschinen-Amplitudenspektrum: wenige starke Spektrallinien */
function machineSpectrum(): number[] {
  const spec = new Array<number>(BINS).fill(0.01);
  spec[5] = 1.0;
  spec[12] = 0.7;
  spec[13] = 0.5;
  spec[30] = 0.4;
  spec[47] = 0.25;
  return spec;
}

/** Lärm-Amplitudenspektrum: breitbandig, tieffrequent betont */
function noiseSpectrum(): number[] {
  const spec = new Array<number>(BINS);
  for (let k = 0; k < BINS; k++) {
    spec[k] = 0.5 * Math.exp(-k / 20) + 0.05;
  }
  return spec;
}

/**
 * Frames erzeugen: baseSpectrum + multiplikative Zufallsschwankung.
 * mixWith: optionales zweites Spektrum, das ENERGETISCH addiert wird
 * (unkorrelierte Quellen addieren sich in der Energie).
 */
function makeFrames(
  base: number[],
  count: number,
  seed: number,
  jitter = 0.15,
  mixWith?: number[]
): FeatureVector[] {
  const rng = mulberry32(seed);
  const frames: FeatureVector[] = [];
  for (let n = 0; n < count; n++) {
    const amps = new Array<number>(BINS);
    for (let k = 0; k < BINS; k++) {
      const a = base[k] * (1 + jitter * (rng() * 2 - 1));
      if (mixWith) {
        const b = mixWith[k] * (1 + jitter * (rng() * 2 - 1));
        amps[k] = Math.sqrt(a * a + b * b);
      } else {
        amps[k] = a;
      }
    }
    frames.push(makeFeatureVector(amps));
  }
  return frames;
}

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-30);
}

function meanNormalized(frames: FeatureVector[]): Float64Array {
  const mean = new Float64Array(BINS);
  for (const fv of frames) {
    for (let k = 0; k < BINS; k++) mean[k] += fv.features[k];
  }
  for (let k = 0; k < BINS; k++) mean[k] /= frames.length;
  return mean;
}

const settings: NoiseSubtractionSettings = { ...DEFAULT_NOISE_SUB_SETTINGS, enabled: true };

describe('buildNoiseProfileFromFeatures', () => {
  it('computes per-bin mean energy of the input frames', () => {
    const frames = makeFrames(noiseSpectrum(), 50, 42);
    const profile = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'Test');

    expect(profile.bins).toBe(BINS);
    expect(profile.frameCount).toBe(50);
    expect(profile.sampleRate).toBe(SAMPLE_RATE);

    // Mittlere Energie in Bin 0 ≈ noiseSpectrum()[0]² (Jitter mittelt sich weg)
    const expected = noiseSpectrum()[0] ** 2;
    expect(profile.meanEnergy[0]).toBeGreaterThan(expected * 0.85);
    expect(profile.meanEnergy[0]).toBeLessThan(expected * 1.15);
  });

  it('flags a quasi-stationary recording as stationary', () => {
    const frames = makeFrames(noiseSpectrum(), 50, 7, 0.1);
    const profile = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'Stable');
    expect(isProfileStationary(profile)).toBe(true);
  });

  it('flags a highly fluctuating recording as non-stationary', () => {
    // Extremer Jitter: Frames schwanken um Faktor ~40 in der Energie
    const rng = mulberry32(99);
    const frames: FeatureVector[] = [];
    for (let n = 0; n < 50; n++) {
      const scale = 0.05 + rng() * 2;
      frames.push(makeFeatureVector(noiseSpectrum().map((v) => v * scale)));
    }
    const profile = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'Unruhig');
    expect(isProfileStationary(profile)).toBe(false);
  });

  it('throws on empty input', () => {
    expect(() => buildNoiseProfileFromFeatures([], SAMPLE_RATE, 30, 'X')).toThrow();
  });
});

describe('applyNoiseSubtraction', () => {
  it('moves a noisy measurement closer to the clean machine signature', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 60, 1);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'Halle');

    const cleanFrames = makeFrames(machineSpectrum(), 40, 2);
    const noisyFrames = makeFrames(machineSpectrum(), 40, 3, 0.15, noiseSpectrum());

    const cleanMean = meanNormalized(cleanFrames);
    const noisyMean = meanNormalized(noisyFrames);

    const subtracted = applyNoiseSubtraction(noisyFrames, profile, settings);
    const subtractedMean = meanNormalized(subtracted);

    const simBefore = cosineSimilarity(noisyMean, cleanMean);
    const simAfter = cosineSimilarity(subtractedMean, cleanMean);

    // Der Kern des Features: Subtraktion verbessert die Ähnlichkeit deutlich.
    // Gemessen: simBefore ≈ 0.69 → simAfter ≈ 0.95. Der Abstand zu 1.0 ist
    // das bewusste Spectral-Floor-Residuum (Schutz vor Über-Subtraktion).
    expect(simAfter).toBeGreaterThan(simBefore + 0.2);
    expect(simAfter).toBeGreaterThan(0.94);
  });

  it('does not mutate the input frames', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 4);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');
    const frames = makeFrames(machineSpectrum(), 5, 5, 0.15, noiseSpectrum());
    const before = Array.from(frames[0].absoluteFeatures);

    applyNoiseSubtraction(frames, profile, settings);

    expect(Array.from(frames[0].absoluteFeatures)).toEqual(before);
  });

  it('respects the spectral floor (no zero/negative energies)', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 6);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');

    // Messung = reiner Lärm → ohne Floor würde alles auf 0 fallen
    const pureNoise = makeFrames(noiseSpectrum(), 10, 8);
    const result = applyNoiseSubtraction(pureNoise, profile, {
      ...settings,
      spectralFloor: 0.05,
    });

    for (const fv of result) {
      for (let k = 0; k < BINS; k++) {
        const inputAmp = pureNoise[result.indexOf(fv)]?.absoluteFeatures[k] ?? 0;
        // Floor: Energie-Gain min. 0.05 → Amplituden-Gain min. sqrt(0.05) ≈ 0.224
        expect(fv.absoluteFeatures[k]).toBeGreaterThanOrEqual(inputAmp * Math.sqrt(0.05) * 0.999);
        expect(fv.absoluteFeatures[k]).toBeGreaterThan(0);
      }
    }
  });

  it('passes through unchanged when the profile sample rate mismatches', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 9);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, 44100, 30, 'P44k');

    const frames = makeFrames(machineSpectrum(), 5, 10);
    const result = applyNoiseSubtraction(frames, profile, settings);

    expect(result).toBe(frames); // identische Referenz = echter Pass-Through
  });

  it('passes through unchanged when the bin count mismatches', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 11);
    const profile: StoredNoiseProfile = {
      ...buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P'),
      bins: 512,
      meanEnergy: new Array(512).fill(0.01),
      stdEnergy: new Array(512).fill(0.001),
    };

    const frames = makeFrames(machineSpectrum(), 5, 12);
    const result = applyNoiseSubtraction(frames, profile, settings);

    expect(result).toBe(frames);
  });

  it('handles empty input gracefully', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 13);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');
    expect(applyNoiseSubtraction([], profile, settings)).toEqual([]);
  });
});

describe('estimateEnergyScale', () => {
  it('recovers a level difference between profile and measurement', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 60, 14);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');

    // Messung: gleicher Lärm, aber Amplitude ×2 → Energie ×4
    const louderNoise = noiseSpectrum().map((v) => v * 2);
    const louderFrames = makeFrames(louderNoise, 60, 15);
    const measMean = new Float64Array(BINS);
    for (const fv of louderFrames) {
      for (let k = 0; k < BINS; k++) measMean[k] += fv.absoluteFeatures[k] ** 2;
    }
    for (let k = 0; k < BINS; k++) measMean[k] /= louderFrames.length;

    const g2 = estimateEnergyScale(measMean, profile.meanEnergy);
    expect(g2).toBeGreaterThan(3.2);
    expect(g2).toBeLessThan(4.8);
  });

  it('returns 1.0 as a neutral fallback on length mismatch', () => {
    expect(estimateEnergyScale(new Float64Array(10), new Float64Array(20))).toBe(1.0);
  });

  it('clamps extreme scale factors', () => {
    const profileEnergy = new Float64Array(BINS).fill(1);
    const measEnergy = new Float64Array(BINS).fill(1000); // g² wäre 1000
    const g2 = estimateEnergyScale(measEnergy, profileEnergy);
    expect(g2).toBeLessThanOrEqual(16); // MAX_SCALE² = 16
  });
});

describe('RealtimeNoiseSubtraction', () => {
  it('converges towards the batch result over a stream of frames', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 60, 16);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');

    const noisyFrames = makeFrames(machineSpectrum(), 40, 17, 0.15, noiseSpectrum());
    const batch = applyNoiseSubtraction(noisyFrames, profile, settings);

    const rt = new RealtimeNoiseSubtraction(profile, settings);
    const streamed = noisyFrames.map((fv) => rt.process(fv));

    // Nach dem Einschwingen (letzte 10 Frames) müssen Realtime- und
    // Batch-Ergebnis dieselbe Signatur liefern
    const batchMean = meanNormalized(batch.slice(-10));
    const streamMean = meanNormalized(streamed.slice(-10));
    expect(cosineSimilarity(batchMean, streamMean)).toBeGreaterThan(0.999);
  });

  it('passes through frames with unexpected bin count', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 18);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');
    const rt = new RealtimeNoiseSubtraction(profile, settings);

    const odd = makeFeatureVector(new Array(32).fill(0.1));
    expect(rt.process(odd)).toBe(odd);
  });

  it('reports an SNR estimate after warm-up', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 60, 19);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');

    // Laute Maschine (Amplitude ×4 → Energie ×16, breitbandig über dem Lärm)
    const loudMachine = machineSpectrum().map((v) => v * 4);
    const rtLoud = new RealtimeNoiseSubtraction(profile, settings);
    expect(rtLoud.estimatedSnrDb).toBeNull();
    for (const fv of makeFrames(loudMachine, 20, 20, 0.15, noiseSpectrum())) rtLoud.process(fv);
    const snrLoud = rtLoud.estimatedSnrDb;
    expect(snrLoud).not.toBeNull();
    expect(snrLoud!).toBeGreaterThan(0);

    // Normale Maschine (breitbandig schwächer) → SNR muss niedriger ausfallen
    const rtNormal = new RealtimeNoiseSubtraction(profile, settings);
    for (const fv of makeFrames(machineSpectrum(), 20, 20, 0.15, noiseSpectrum()))
      rtNormal.process(fv);
    const snrNormal = rtNormal.estimatedSnrDb;
    expect(snrNormal).not.toBeNull();
    expect(snrNormal!).toBeLessThan(snrLoud!);
  });

  it('reset() clears all adaptive state', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 20, 21);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'P');
    const rt = new RealtimeNoiseSubtraction(profile, settings);

    const frames = makeFrames(machineSpectrum(), 10, 22);
    for (const fv of frames) rt.process(fv);
    rt.reset();

    expect(rt.estimatedSnrDb).toBeNull();
    expect(rt.currentEnergyScale).toBe(1.0);
  });
});

describe('classifyNoiseSnr (Konfidenz-Ampel)', () => {
  it('classifies the three SNR regimes at their thresholds', () => {
    expect(classifyNoiseSnr(20)).toBe('machine_dominates');
    expect(classifyNoiseSnr(15)).toBe('machine_dominates'); // Grenze inklusiv grün
    expect(classifyNoiseSnr(14.9)).toBe('similar_levels');
    expect(classifyNoiseSnr(0)).toBe('similar_levels');
    expect(classifyNoiseSnr(-5)).toBe('similar_levels'); // Grenze noch gelb
    expect(classifyNoiseSnr(-5.1)).toBe('noise_dominates');
    expect(classifyNoiseSnr(-20)).toBe('noise_dominates');
  });
});

describe('isProfileStale / profileAgeDays', () => {
  const baseProfile = (): StoredNoiseProfile =>
    buildNoiseProfileFromFeatures(makeFrames(noiseSpectrum(), 10, 40), SAMPLE_RATE, 30, 'P');

  it('fresh profile is not stale', () => {
    const p = baseProfile();
    expect(isProfileStale(p, p.createdAt + 1000)).toBe(false);
    expect(profileAgeDays(p, p.createdAt + 1000)).toBe(0);
  });

  it('profile older than the threshold is stale', () => {
    const p = baseProfile();
    const later = p.createdAt + PROFILE_STALE_AFTER_MS + 1;
    expect(isProfileStale(p, later)).toBe(true);
    expect(profileAgeDays(p, later)).toBe(7);
  });
});

describe('noiseReferenceOverlap (baugleiche Nachbarmaschine)', () => {
  /** refLogMean aus einem Amplituden-Spektrum bauen: ln(Amplitude) */
  const toRefLogMean = (amps: number[]): Float64Array =>
    Float64Array.from(amps.map((a) => Math.log(a + 1e-12)));

  it('is high when the noise profile matches the machine signature', () => {
    // Profil = exakt das Maschinenspektrum (Nachbarmaschine, baugleich)
    const machineNoise = makeFrames(machineSpectrum(), 40, 41);
    const profile = buildNoiseProfileFromFeatures(machineNoise, SAMPLE_RATE, 30, 'Twin');
    const overlap = noiseReferenceOverlap(profile, toRefLogMean(machineSpectrum()));

    expect(overlap).not.toBeNull();
    expect(overlap!).toBeGreaterThan(OVERLAP_WARN_THRESHOLD);
  });

  it('is low for broadband noise vs. a tonal machine', () => {
    const noiseFrames = makeFrames(noiseSpectrum(), 40, 42);
    const profile = buildNoiseProfileFromFeatures(noiseFrames, SAMPLE_RATE, 30, 'Halle');
    const overlap = noiseReferenceOverlap(profile, toRefLogMean(machineSpectrum()));

    expect(overlap).not.toBeNull();
    expect(overlap!).toBeLessThan(OVERLAP_WARN_THRESHOLD);
  });

  it('returns null on bin count mismatch', () => {
    const profile = buildNoiseProfileFromFeatures(
      makeFrames(noiseSpectrum(), 10, 43),
      SAMPLE_RATE,
      30,
      'P'
    );
    expect(noiseReferenceOverlap(profile, new Float64Array(32))).toBeNull();
  });
});

describe('deviceLabel', () => {
  it('is stored when provided and omitted otherwise', () => {
    const frames = makeFrames(noiseSpectrum(), 10, 44);
    const withLabel = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'P', 'USB Mic');
    const withoutLabel = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'P');
    expect(withLabel.deviceLabel).toBe('USB Mic');
    expect(withoutLabel.deviceLabel).toBeUndefined();
  });
});

describe('MinimumStatisticsNoiseEstimator (Stufe-3-Fallback)', () => {
  it('returns null during warm-up, then tracks the noise floor', () => {
    const est = new MinimumStatisticsNoiseEstimator(BINS);
    const frames = makeFrames(noiseSpectrum(), 60, 50, 0.15);

    expect(est.getEstimate()).toBeNull();
    for (const fv of frames) est.update(fv);

    const estimate = est.getEstimate();
    expect(estimate).not.toBeNull();
    // Schätzung liegt in der Größenordnung der wahren Lärmenergie
    // (Minimum × Bias-Kompensation → grob 0.5–1.5× des Mittels)
    const trueEnergy = noiseSpectrum()[0] ** 2;
    expect(estimate![0]).toBeGreaterThan(trueEnergy * 0.3);
    expect(estimate![0]).toBeLessThan(trueEnergy * 2.0);
  });

  it('reset() clears state back to warm-up', () => {
    const est = new MinimumStatisticsNoiseEstimator(BINS);
    for (const fv of makeFrames(noiseSpectrum(), 30, 51)) est.update(fv);
    expect(est.getEstimate()).not.toBeNull();
    est.reset();
    expect(est.getEstimate()).toBeNull();
  });
});

describe('RealtimeMinStatsSubtraction (Fallback ohne Profil)', () => {
  const refLogMeanOf = (amps: number[]): Float64Array =>
    Float64Array.from(amps.map((a) => Math.log(a + 1e-12)));

  it('leaves machine-dominated bins untouched (mask)', () => {
    const rt = new RealtimeMinStatsSubtraction(BINS, refLogMeanOf(machineSpectrum()), {
      ...DEFAULT_NOISE_SUB_SETTINGS,
      enabled: true,
      minStatsEnabled: true,
    });

    const frames = makeFrames(machineSpectrum(), 40, 52, 0.15, noiseSpectrum());
    let last = frames[0];
    let lastOut = last;
    for (const fv of frames) {
      last = fv;
      lastOut = rt.process(fv);
    }

    expect(rt.isActive).toBe(true);
    // Bin 5 = stärkste Maschinenlinie (über Median-Referenzpegel) → identisch
    expect(lastOut.absoluteFeatures[5]).toBeCloseTo(last.absoluteFeatures[5], 12);
    // Lärmdominierte Bins (Maschine schwach, Lärm stark) werden gedämpft
    expect(lastOut.absoluteFeatures[2]).toBeLessThan(last.absoluteFeatures[2]);
  });

  it('improves similarity to the clean signature without any stored profile', () => {
    const cleanFrames = makeFrames(machineSpectrum(), 40, 53);
    const cleanMean = meanNormalized(cleanFrames);

    const noisyFrames = makeFrames(machineSpectrum(), 60, 54, 0.15, noiseSpectrum());
    const noisyMean = meanNormalized(noisyFrames.slice(-20));

    const rt = new RealtimeMinStatsSubtraction(BINS, refLogMeanOf(machineSpectrum()), {
      ...DEFAULT_NOISE_SUB_SETTINGS,
      enabled: true,
      minStatsEnabled: true,
    });
    const processed = noisyFrames.map((fv) => rt.process(fv));
    const processedMean = meanNormalized(processed.slice(-20));

    const simBefore = cosineSimilarity(noisyMean, cleanMean);
    const simAfter = cosineSimilarity(processedMean, cleanMean);
    expect(simAfter).toBeGreaterThan(simBefore);
  });

  it('throws when refLogMean does not match the bin count', () => {
    expect(
      () =>
        new RealtimeMinStatsSubtraction(BINS, new Float64Array(32), {
          ...DEFAULT_NOISE_SUB_SETTINGS,
          enabled: true,
          minStatsEnabled: true,
        })
    ).toThrow();
  });

  it('passes frames through unchanged during warm-up', () => {
    const rt = new RealtimeMinStatsSubtraction(BINS, refLogMeanOf(machineSpectrum()), {
      ...DEFAULT_NOISE_SUB_SETTINGS,
      enabled: true,
      minStatsEnabled: true,
    });
    const fv = makeFrames(machineSpectrum(), 1, 55)[0];
    expect(rt.process(fv)).toBe(fv);
  });
});

describe('isProfileCompatible', () => {
  it('accepts matching sample rate and bins', () => {
    const frames = makeFrames(noiseSpectrum(), 10, 23);
    const profile = buildNoiseProfileFromFeatures(frames, SAMPLE_RATE, 30, 'P');
    expect(isProfileCompatible(profile, SAMPLE_RATE, BINS)).toBe(true);
  });

  it('rejects a different sample rate', () => {
    const frames = makeFrames(noiseSpectrum(), 10, 24);
    const profile = buildNoiseProfileFromFeatures(frames, 44100, 30, 'P');
    expect(isProfileCompatible(profile, 48000, BINS)).toBe(false);
  });
});
