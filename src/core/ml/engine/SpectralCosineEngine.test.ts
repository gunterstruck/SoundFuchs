import { describe, it, expect } from 'vitest';
import { SpectralCosineEngine, scoreFromCosine, energyGate } from './SpectralCosineEngine.js';
import type { TrainInput, FrameInput } from './types.js';
import type { TrainingData, FeatureVector, SpectralCosineModel } from '@data/types.js';

const SAMPLE_RATE = 48000;
const DIM = 64;

function makeConfig() {
  return {
    sampleRate: SAMPLE_RATE,
    windowSize: 0.33,
    hopSize: 0.066,
    fftSize: 2048,
    frequencyBins: DIM,
    frequencyRange: [0, SAMPLE_RATE / 2] as [number, number],
  };
}

/** Deterministic pseudo-noise in [0,1). */
function noise(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A realistic relative-ESD row: a few high-energy peaks plus many near-zero
 * noise-floor bins, normalized to Σ=1. This is the case that broke the diagonal
 * Mahalanobis (noise-floor bins dominated). Cosine must ignore them.
 */
function row(seed: number, peakBins: Set<number>): Float64Array {
  const v = new Float64Array(DIM);
  let sum = 0;
  for (let k = 0; k < DIM; k++) {
    const isPeak = peakBins.has(k);
    const base = isPeak ? 0.2 : 0.001;
    const jit = (isPeak ? 0.02 : 0.0005) * (noise(seed, k) - 0.5) * 2;
    v[k] = Math.max(1e-6, base + jit);
    sum += v[k];
  }
  for (let k = 0; k < DIM; k++) v[k] /= sum; // relative ESD (Σ=1)
  return v;
}

function makeTrainInput(rows: Float64Array[]): TrainInput {
  const trainingData: TrainingData = {
    featureVectors: rows,
    machineId: 'm1',
    recordingId: 'r1',
    numSamples: rows.length,
    config: makeConfig(),
  };
  return { trainingData, sampleRate: SAMPLE_RATE };
}

function makeFrame(features: Float64Array): FrameInput {
  const feature: FeatureVector = {
    features,
    absoluteFeatures: features,
    bins: features.length,
    frequencyRange: [0, SAMPLE_RATE / 2],
  };
  return { feature, sampleRate: SAMPLE_RATE };
}

const PEAKS = new Set([8, 16, 24, 40]);

describe('Spectral cosine one-class engine', () => {
  const engine = new SpectralCosineEngine();

  function trainHealthyModel(): SpectralCosineModel {
    const rows = Array.from({ length: 40 }, (_, i) => row(i + 1, PEAKS));
    const model = engine.train(makeTrainInput(rows), 'm1') as SpectralCosineModel;
    model.label = 'Baseline';
    model.type = 'healthy';
    return model;
  }

  it('produces a well-formed model (engineId, mean, scalingConstant)', () => {
    const model = trainHealthyModel();
    expect(model.engineId).toBe('spectral-cosine');
    expect(model.mean).toHaveLength(DIM);
    expect(model.scalingConstant).toBeGreaterThan(0);
    expect(Number.isFinite(model.scalingConstant)).toBe(true);
    expect(model.sampleRate).toBe(SAMPLE_RATE);
    // No leftover diagonal-Mahalanobis fields.
    expect((model as unknown as { diagVar?: unknown }).diagVar).toBeUndefined();
  });

  it('reference self-scores land in the healthy band (baseline >= 75)', () => {
    const model = trainHealthyModel();
    expect(model.baselineScore).toBeGreaterThanOrEqual(75);
  });

  it('FIELD FINDING: an acoustically matching live frame scores high, not 0', () => {
    // The exact case from the device: peaks + noise floor, matching live frame.
    // Diagonal Mahalanobis gave 0%; cosine must give a healthy-band score.
    const model = trainHealthyModel();
    const matching = engine.classify([model], makeFrame(row(9999, PEAKS)));
    expect(matching.metadata?.debug).toBeDefined();
    expect(matching.healthScore).toBeGreaterThan(75);
    expect(matching.status).toBe('healthy');
    // rawCosineSimilarity is now a REAL cosine (high for a match).
    expect(matching.rawCosineSimilarity).toBeGreaterThan(0.9);
  });

  it('a clearly different spectrum (peaks moved) scores much lower', () => {
    const model = trainHealthyModel();
    const matching = engine.classify([model], makeFrame(row(9999, PEAKS))).healthScore;
    const moved = engine.classify(
      [model],
      makeFrame(row(9999, new Set([10, 20, 30, 50])))
    ).healthScore;
    expect(moved).toBeLessThan(matching);
    expect(matching - moved).toBeGreaterThan(20);
  });

  it('robust to a changed noise floor (the bins that broke Mahalanobis)', () => {
    // Same peaks, but the noise-floor bins shifted (different room/mic). Cosine
    // is dominated by the peaks → should stay healthy. Diagonal Mahalanobis
    // collapsed to 0 here.
    const model = trainHealthyModel();
    const peaks = PEAKS;
    const v = new Float64Array(DIM);
    let sum = 0;
    for (let k = 0; k < DIM; k++) {
      const isPeak = peaks.has(k);
      // peaks ~unchanged, noise floor 3x higher than training
      v[k] = isPeak ? 0.2 : 0.003;
      sum += v[k];
    }
    for (let k = 0; k < DIM; k++) v[k] /= sum;
    const res = engine.classify([model], makeFrame(v));
    expect(res.healthScore).toBeGreaterThan(60);
  });

  it('scoreFromCosine: tanh² curve, monotonic, clamped to [0,100]', () => {
    const C = 1.8;
    expect(scoreFromCosine(0, C)).toBe(0);
    expect(scoreFromCosine(1, C)).toBeGreaterThan(scoreFromCosine(0.5, C));
    expect(scoreFromCosine(0.5, C)).toBeGreaterThan(scoreFromCosine(0.2, C));
    expect(scoreFromCosine(1, C)).toBeLessThanOrEqual(100);
    expect(scoreFromCosine(2, C)).toBeLessThanOrEqual(100); // cosine clamped to 1
  });

  it('energyGate: silences quiet signals, leaves matched-energy scores intact', () => {
    const trainRms = 0.2;
    // Live energy at/above training → no penalty.
    expect(energyGate(90, trainRms, 0.2)).toBeCloseTo(90, 5);
    expect(energyGate(90, trainRms, 0.5)).toBeCloseTo(90, 5);
    // Near-silence (< 8 % of training energy) → fully gated to ~0.
    expect(energyGate(90, trainRms, 0.005)).toBe(0);
    // A 2× mic-distance change (~half energy) is NOT penalized.
    expect(energyGate(90, trainRms, 0.1)).toBeCloseTo(90, 5);
    // Backward compatible: no training RMS or no live RMS → unchanged.
    expect(energyGate(90, undefined, 0.001)).toBe(90);
    expect(energyGate(90, trainRms, undefined)).toBe(90);
  });

  it('multiclass: best-matching state wins; scoreAll lists all models', () => {
    const healthy = trainHealthyModel();
    const fault = engine.train(
      makeTrainInput(Array.from({ length: 40 }, (_, i) => row(i + 100, new Set([12, 28, 36, 52])))),
      'm1'
    ) as SpectralCosineModel;
    fault.label = 'Lagerschaden';
    fault.type = 'faulty';

    // A frame matching the healthy state should detect "Baseline".
    const res = engine.classify([healthy, fault], makeFrame(row(7777, PEAKS)));
    expect(res.metadata?.detectedState).toBe('Baseline');

    const scores = engine.scoreAll([healthy, fault], makeFrame(row(7777, PEAKS)));
    expect(scores).toHaveLength(2);
    expect(scores[0].label).toBe('Baseline'); // highest score first
  });

  it('returns finite, clamped scores for arbitrary inputs', () => {
    const model = trainHealthyModel();
    for (const seed of [1, 50, 500, 5000]) {
      const score = engine.classify([model], makeFrame(row(seed, PEAKS))).healthScore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(score)).toBe(true);
    }
  });

  it('stores a (capped) k-NN memory bank', () => {
    // Train with more frames than MAX_BANK (64) → bank must be subsampled, not 1.
    const rows = Array.from({ length: 200 }, (_, i) => row(i + 1, PEAKS));
    const model = engine.train(makeTrainInput(rows), 'm1') as SpectralCosineModel;
    expect(model.bank).toBeDefined();
    expect(model.bank!.length).toBeGreaterThan(1);
    expect(model.bank!.length).toBeLessThanOrEqual(64);
    expect(model.bank![0]).toHaveLength(DIM);
  });

  it('k-NN beats mean-to-reference on a MULTIMODAL recording (moving mic)', () => {
    // Reference recorded across TWO positions: half the frames have peaks at
    // mode A, half at mode B. The mean spectrum is a blur of both; k-NN matches
    // the nearest cluster. A live frame at mode A should score clearly higher
    // with k-NN than with the mean-only fallback.
    const modeA = new Set([8, 16]);
    const modeB = new Set([40, 48]);
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(i + 1, i % 2 === 0 ? modeA : modeB)
    );
    const model = engine.train(makeTrainInput(rows), 'm1') as SpectralCosineModel;
    model.label = 'Baseline';
    model.type = 'healthy';

    const frameA = makeFrame(row(424242, modeA));
    const knnScore = engine.classify([model], frameA).healthScore;

    // Mean-only variant of the SAME model (drop the bank → cosine-to-mean).
    const meanOnly: SpectralCosineModel = { ...model, bank: undefined };
    const meanScore = engine.classify([meanOnly], frameA).healthScore;

    expect(knnScore).toBeGreaterThan(meanScore);
  });

  it('BEAM detects a band-localized anomaly (a single sub-band altered)', () => {
    const model = trainHealthyModel(); // bank → BEAM sub-band scoring
    model.label = 'Baseline';
    model.type = 'healthy';

    const matchScore = engine.classify([model], makeFrame(row(31415, PEAKS))).healthScore;
    expect(matchScore).toBeGreaterThan(75);

    // Alter one mid sub-band [16,32) (flatten it, removing its peaks). BEAM's
    // per-band matching makes such a band-localized change visible.
    const a = row(31415, PEAKS);
    for (let k = 16; k < 32; k++) a[k] = 0.05;
    let s = 0;
    for (let k = 0; k < a.length; k++) s += a[k];
    for (let k = 0; k < a.length; k++) a[k] /= s;

    const anomalyScore = engine.classify([model], makeFrame(a)).healthScore;
    expect(anomalyScore).toBeLessThan(matchScore);
  });
});
