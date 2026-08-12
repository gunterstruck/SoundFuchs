/**
 * ZANOBOT - Spectral Cosine One-Class Engine (Tier 0 alternative)
 *
 * NOTE on the history: an earlier version used a diagonal Mahalanobis distance
 * (report §11.9/§11.10); it was abandoned for the COSINE-to-mean distance below
 * with GMIA-style value calibration.
 *
 * Why: on relative-ESD features the diagonal Mahalanobis inverse-variance
 * weighting emphasises exactly the low-energy noise-floor bins (var → 0), so a
 * minor room/noise change between training and diagnosis explodes the distance
 * and the score collapses to 0 even for an acoustically MATCHING signal
 * (observed live distance ≈ 40, score 0). Cosine weights by ENERGY — the
 * informative peak bins dominate — and is scale-free; that is exactly why GMIA
 * is robust. (Briefing §17.2: k-NN/cosine is often more robust than parametric
 * Mahalanobis with very little data.)
 *
 * Model: a k-NN memory bank of training sub-window spectra (Briefing §17.2) plus
 * the reference mean spectrum μ and a tanh² scaling constant C. Diagnosis:
 * sim = mean cosine to the k NEAREST reference sub-windows (falls back to
 * cos(f, μ) when no bank), then score = 100·tanh(C·sim)² (GMIA Eq. 4 form),
 * calibrated so the typical training similarity maps to ~90%. k-NN makes the
 * engine robust to multimodal / "moving" recordings (the live frame matches the
 * nearest cluster instead of a blurred average). Multiclass and the downstream
 * chain are unchanged.
 */

import type { DiagnosisEngine, FrameInput, TrainInput } from './types.js';
import type { ReferenceModel, SpectralCosineModel, DiagnosisResult } from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';
import { calculateConfidenceFromScore, generateMulticlassHint } from '../scoring.js';
import { cosineSimilarity, vectorMagnitude, mean as meanOf } from '../mathUtils.js';
import { computeBaselineSpread } from '../baselineSpread.js';
import { CURRENT_FEATURE_LAYOUT } from '@core/dsp/filterBank.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';

/** Target mean self-recognition score for the reference (GMIA-style, 0.9 = 90%). */
const TARGET_SELF_SCORE = 0.9;

/** Number of nearest reference sub-windows averaged for the k-NN similarity (Briefing §17.2: small). */
const KNN_K = 5;

/** Max memory-bank size: training sub-windows are evenly subsampled to this cap (storage bound). */
const MAX_BANK = 64;

/**
 * BEAM — Band-wise Equalized Anomaly Measure (Saengthong & Shinozaki, arXiv
 * 2603.13749). Instead of one global cosine over the whole spectrum, the
 * spectrum is split into sub-bands; each band does its OWN k-NN against the same
 * band of the memory bank, and the per-band similarities are aggregated
 * UNIFORMLY (every band counts equally). This removes two variance sources of
 * global cosine matching: (1) tied-reference mismatch (one global neighbour
 * forced on all bands) and (2) energy coupling (a few loud bands dominate the
 * score under normal energy fluctuations) — exactly the noise-floor / domain-
 * shift instability seen in the field. Sub-bands are octave-like (log-spaced),
 * giving more resolution where machine signatures live (low frequencies).
 */
const SUBBAND_MIN_BIN = 8;

export class SpectralCosineEngine implements DiagnosisEngine {
  readonly id = 'spectral-cosine' as const;

  train(input: TrainInput, machineId: string): ReferenceModel {
    const features = input.trainingData.featureVectors;
    if (features.length === 0) {
      throw new Error('Cannot train one-class model with empty feature set');
    }
    if (!features[0] || features[0].length === 0) {
      throw new Error('Invalid feature vector: first feature is empty or undefined');
    }

    const numSamples = features.length;
    const dim = features[0].length;

    // Reference mean spectrum μ (kept for the ghost overlay and as a fallback).
    const meanVec = new Float64Array(dim);
    for (const f of features) {
      for (let k = 0; k < dim; k++) meanVec[k] += f[k];
    }
    for (let k = 0; k < dim; k++) meanVec[k] /= numSamples;

    // k-NN memory bank: evenly subsample the training sub-windows to MAX_BANK.
    const bankF64 = subsample(features, MAX_BANK);
    const edges = bandEdges(dim);

    // Value calibration (GMIA Eq. 4 recipe) on the BEAM similarity level.
    // Leave-one-out: each bank vector's similarity excludes itself, so the
    // calibration is honest (not the trivial self-match of 1.0).
    const sims = bankF64.map((v, i) => beamSimilarity(v, bankF64, edges, KNN_K, i));
    const muSim = meanOf(sims);
    if (!(muSim > 1e-6) || !isFinite(muSim)) {
      throw new Error(
        'Signal zu schwach oder inkonsistent für Training ' +
          `(mittlere k-NN-Ähnlichkeit: ${muSim.toExponential(2)}).`
      );
    }
    const scalingConstant = Math.atanh(Math.sqrt(TARGET_SELF_SCORE)) / muSim;

    // Baseline self-score (quality gate + ranking parity) PLUS the robust spread
    // of the same self-scores: the mean alone cannot say how wide this
    // reference's own normal is, which is what a threshold has to be measured
    // against (baselineSpread.ts).
    const selfScores = sims.map((s) => scoreFromCosine(s, scalingConstant));
    const spread = computeBaselineSpread(selfScores);
    const baselineScore = spread.mean;

    // Energy reference: RMS of the raw training audio. Lets diagnosis gate the
    // (magnitude-invariant) cosine score down for near-silence (stopped machine).
    const trainingRms = input.rawBuffer ? rmsOf(input.rawBuffer) : undefined;

    logger.info(
      `✅ Spectral one-class (BEAM sub-band k-NN) model trained: N=${numSamples}, bank=${bankF64.length}, ` +
        `bands=${edges.length - 1}, k=${KNN_K}, μsim=${muSim.toFixed(4)}, C=${scalingConstant.toFixed(4)}, baseline=${baselineScore.toFixed(1)}%`
    );

    const model: SpectralCosineModel = {
      engineId: 'spectral-cosine',
      machineId,
      label: '', // set by caller (2-Reference)
      type: 'healthy', // set by caller
      mean: Array.from(meanVec),
      bank: bankF64.map((v) => Array.from(v)),
      scalingConstant,
      featureDimension: dim,
      sampleRate: input.trainingData.config.sampleRate,
      featureLayout: CURRENT_FEATURE_LAYOUT,
      trainingDate: Date.now(),
      trainingDuration: input.trainingData.config.windowSize * numSamples,
      baselineScore,
      baselineMedian: spread.median,
      baselineMad: spread.mad,
      trainingRms,
      metadata: { meanCosine: muSim, targetScore: TARGET_SELF_SCORE },
    };
    return model;
  }

  classify(models: ReferenceModel[], frame: FrameInput): DiagnosisResult {
    const ocModels = models.filter(isOneClass);
    if (ocModels.length === 0) {
      throw new Error('No one-class reference models available for classification');
    }

    const f = frame.feature.features;
    let bestScore = -1;
    let bestCos = 0;
    let bestLabel = 'UNKNOWN';
    let bestModel: SpectralCosineModel | null = null;

    for (const model of ocModels) {
      if (f.length !== model.mean.length) {
        logger.warn(
          `⚠️ One-class feature dim mismatch (${f.length} vs ${model.mean.length}) for "${model.label}"`
        );
        continue;
      }
      const sim = modelSimilarity(model, f);
      const calibrated = calibrateScore(scoreFromCosine(sim, model.scalingConstant), model.baselineScore);
      const score = energyGate(calibrated, model.trainingRms, frame.feature.rmsAmplitude);
      if (score > bestScore) {
        bestScore = score;
        bestCos = sim;
        bestLabel = model.label;
        bestModel = model;
      }
    }

    const settings = getRecordingSettings();
    const uncertaintyThreshold = settings.confidenceThreshold;

    let status: DiagnosisResult['status'];
    if (bestModel === null || bestScore < uncertaintyThreshold) {
      status = 'uncertain';
      bestLabel = 'UNKNOWN';
    } else {
      status = bestModel.type;
    }

    const safeScore = bestScore < 0 ? 0 : bestScore;

    return {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      machineId: bestModel?.machineId || ocModels[0].machineId,
      timestamp: Date.now(),
      healthScore: Math.round(safeScore * 10) / 10,
      status,
      confidence: calculateConfidenceFromScore(safeScore),
      rawCosineSimilarity: Math.round(bestCos * 10000) / 10000, // a REAL cosine now
      metadata: {
        detectedState: bestLabel,
        multiclassMode: true,
        evaluatedModels: ocModels.length,
        engineId: 'spectral-cosine',
        // Debug block shaped like the GMIA one so the expert view works.
        debug: bestModel
          ? {
              weightMagnitude: 0,
              featureMagnitude: vectorMagnitude(frame.feature.features),
              magnitudeFactor: 1,
              cosine: bestCos,
              adjustedCosine: bestCos,
              scalingConstant: bestModel.scalingConstant,
              rawScore: safeScore,
            }
          : undefined,
      },
      analysis: {
        hint: generateMulticlassHint(safeScore, bestLabel, status),
      },
    };
  }

  scoreAll(models: ReferenceModel[], frame: FrameInput): WorkPointScore[] {
    const f = frame.feature.features;
    const scores: WorkPointScore[] = [];
    for (const model of models) {
      if (!isOneClass(model)) continue;
      if (f.length !== model.mean.length) continue;
      const sim = modelSimilarity(model, f);
      const calibrated = calibrateScore(scoreFromCosine(sim, model.scalingConstant), model.baselineScore);
      const score = energyGate(calibrated, model.trainingRms, frame.feature.rmsAmplitude);
      scores.push({
        label: model.label,
        score: Math.round(score * 10) / 10,
        isHealthy: model.type === 'healthy',
        trainingDate: model.trainingDate,
      });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }
}

function isOneClass(model: ReferenceModel): model is SpectralCosineModel {
  return model.engineId === 'spectral-cosine';
}

/** Health score from cosine via the tanh² value curve (GMIA Eq. 4 form). Exported for tests. */
export function scoreFromCosine(cosine: number, scalingConstant: number): number {
  const t = Math.tanh(scalingConstant * clamp01(cosine));
  return Math.max(0, Math.min(100, t * t * 100));
}

/**
 * Baseline calibration, identical to GMIA's classifyDiagnosticState step: a
 * perfect self-match shows ~100% instead of the ~90% the raw curve targets.
 * Falls back to the raw score when no baseline is present.
 */
function calibrateScore(rawScore: number, baselineScore?: number): number {
  if (baselineScore && baselineScore > 0) {
    return Math.min(100, (rawScore / baselineScore) * 100);
  }
  return rawScore;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** RMS amplitude of a raw waveform. */
function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Energy gate: cosine similarity ignores level, so near-silence (a stopped
 * machine) can still score moderately. Scale the score by the live/training
 * energy ratio so a clearly quieter-than-trained signal is pushed down. Only
 * ramps in for genuine low energy (a 2× mic-distance change ≈ 0.5 ratio is
 * untouched); below GATE_LO it is fully cut. No training RMS (older models) or
 * no live RMS → returned unchanged (fully backward compatible).
 */
const GATE_LO = 0.08; // < 8 % of training energy → silence → factor 0
const GATE_HI = 0.25; // ≥ 25 % of training energy → factor 1 (no penalty)
export function energyGate(score: number, trainingRms?: number, liveRms?: number): number {
  if (!trainingRms || trainingRms <= 0 || liveRms === undefined || !isFinite(liveRms)) {
    return score;
  }
  const ratio = liveRms / trainingRms;
  const factor = Math.max(0, Math.min(1, (ratio - GATE_LO) / (GATE_HI - GATE_LO)));
  return score * factor;
}

function toF64(a: number[] | Float64Array): Float64Array {
  return a instanceof Float64Array ? a : Float64Array.from(a);
}

/** Cache of a model's bank as Float64Array[] so we don't re-allocate per frame. */
const bankCache = new WeakMap<SpectralCosineModel, Float64Array[]>();

function getBankF64(model: SpectralCosineModel): Float64Array[] | null {
  if (!model.bank || model.bank.length === 0) return null;
  let cached = bankCache.get(model);
  if (!cached) {
    cached = model.bank.map((v) => toF64(v));
    bankCache.set(model, cached);
  }
  return cached;
}

/**
 * Similarity of a live frame to a reference model: BEAM sub-band k-NN similarity
 * against the memory bank, or cosine to the mean spectrum when the model has no
 * bank (backward compatibility).
 */
function modelSimilarity(model: SpectralCosineModel, f: Float64Array): number {
  const bank = getBankF64(model);
  if (bank) return beamSimilarity(f, bank, bandEdges(f.length), KNN_K, -1);
  return clamp01(cosineSimilarity(toF64(model.mean), f));
}

/**
 * BEAM similarity: for each sub-band, the query band does its own k-NN against
 * the same band of every bank vector, and the per-band similarities are
 * aggregated UNIFORMLY (every band equal). Band-aligned + energy-equalized.
 */
function beamSimilarity(
  query: Float64Array,
  bank: Float64Array[],
  edges: number[],
  k: number,
  exclude: number
): number {
  const numBands = edges.length - 1;
  if (numBands <= 0) return 1;
  let total = 0;
  for (let b = 0; b < numBands; b++) {
    const lo = edges[b];
    const hi = edges[b + 1];
    const qb = query.subarray(lo, hi);
    const cosines: number[] = [];
    for (let j = 0; j < bank.length; j++) {
      if (j === exclude) continue;
      cosines.push(clamp01(cosineSimilarity(qb, bank[j].subarray(lo, hi))));
    }
    total += topKMean(cosines, k);
  }
  return total / numBands;
}

/** Mean of the k highest values (descending). Returns 1 for an empty list (degenerate). */
function topKMean(values: number[], k: number): number {
  if (values.length === 0) return 1;
  values.sort((a, b) => b - a);
  const kk = Math.min(k, values.length);
  let sum = 0;
  for (let i = 0; i < kk; i++) sum += values[i];
  return sum / kk;
}

/**
 * Octave-like (log-spaced) sub-band edges over [0, dim]: 0, 8, 16, 32, … , dim.
 * More resolution at low frequencies (where machine signatures concentrate),
 * the noisy high end lumped into wider bands.
 */
function bandEdges(dim: number): number[] {
  const edges = [0];
  for (let e = SUBBAND_MIN_BIN; e < dim; e *= 2) edges.push(e);
  edges.push(dim);
  return edges;
}

/** Evenly subsample `vectors` down to at most `cap` Float64Array rows. */
function subsample(vectors: Float64Array[], cap: number): Float64Array[] {
  if (vectors.length <= cap) return vectors.map((v) => v);
  const out: Float64Array[] = [];
  const stride = vectors.length / cap;
  for (let i = 0; i < cap; i++) out.push(vectors[Math.floor(i * stride)]);
  return out;
}
