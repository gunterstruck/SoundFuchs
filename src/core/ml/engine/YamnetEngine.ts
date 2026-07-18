/**
 * ZANOBOT - YAMNet Embedding Engine (Tier 1 — third, separately selectable engine)
 *
 * A neural alternative that replaces the spectral REPRESENTATION (not the
 * workflow): a pretrained YAMNet (AudioSet, MobileNetV1) maps raw audio to a
 * 1024-dim embedding; diagnosis is distance-based (cosine k-NN) against a memory
 * bank of reference embeddings, value-calibrated like the spectral-cosine engine.
 *
 * ISOLATION: GMIA and spectral-cosine, the synchronous dispatcher and the whole
 * existing UI are untouched. This engine is async (model load + inference) and
 * runs on a dedicated path; the synchronous dispatcher skips 'yamnet' models.
 *
 * OFFLINE/PWA: TF.js is lazy-loaded (code-split) only when this engine is used,
 * and the model is fetched once and kept in the browser cache. (Service-worker
 * precaching for full offline is a follow-up.)
 *
 * ⚠️ Inference (the TF.js model run) can only be validated on a real device; the
 * surrounding structure (resampling, windowing, cosine k-NN, calibration) is
 * unit-tested via the spectral engine and the resample helpers.
 */

import type * as TF from '@tensorflow/tfjs';
import type { AsyncDiagnosisEngine, FrameInput, TrainInput } from './types.js';
import type { ReferenceModel, EmbeddingModel, DiagnosisResult } from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';
import { calculateConfidenceFromScore, generateMulticlassHint } from '../scoring.js';
import { cosineSimilarity, vectorMagnitude } from '../mathUtils.js';
import { scoreFromCosine } from './SpectralCosineEngine.js';
import { resampleTo16k, YAMNET_SAMPLE_RATE } from '@core/dsp/resample.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';

/**
 * YAMNet TF.js model URL (TF Hub). Loaded once, then served from the browser
 * cache. Kept as a constant so it is trivial to repoint on device.
 */
const YAMNET_MODEL_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';

const EMBEDDING_DIM = 1024;
/** YAMNet frame: 0.96 s window, 0.48 s hop, at 16 kHz. */
const WINDOW_SAMPLES = Math.round(0.96 * YAMNET_SAMPLE_RATE); // 15360
const HOP_SAMPLES = Math.round(0.48 * YAMNET_SAMPLE_RATE); // 7680
const TARGET_SELF_SCORE = 0.9;
const KNN_K = 5;
/**
 * Memory-bank cap. Kept modest (32) because each entry is a 1024-dim vector
 * that is JSON-serialized into the exported machine file — 64 banks per state
 * across several states pushed exports past the device share limit ("Datei zu
 * groß"). 32 windows already cover ~15 s of reference at the 0.48 s hop.
 */
const MAX_BANK = 32;

/**
 * Per-model cache of the bank decoded to Float32Array[]. The stored bank is
 * number[][] (JSON-friendly); converting it on EVERY live frame (≈2×/s during
 * diagnosis) reallocated thousands of typed arrays per minute. Keyed on the
 * model object via a WeakMap so it is GC'd with the model and never leaks.
 */
const bankCache = new WeakMap<EmbeddingModel, Float32Array[]>();

function decodeBank(model: EmbeddingModel): Float32Array[] {
  let bank = bankCache.get(model);
  if (!bank) {
    bank = model.bank.map((v) => Float32Array.from(v));
    bankCache.set(model, bank);
  }
  return bank;
}

export class YamnetEngine implements AsyncDiagnosisEngine {
  readonly id = 'yamnet' as const;
  readonly isAsync = true as const;

  private tf: typeof TF | null = null;
  private model: TF.GraphModel | null = null;
  private loading: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      logger.info('🧠 Loading TF.js + YAMNet model (first use)…');
      this.tf = await import('@tensorflow/tfjs');
      await this.tf.ready();
      this.model = await this.tf.loadGraphModel(YAMNET_MODEL_URL, { fromTFHub: true });
      logger.info('✅ YAMNet model loaded');
    })();
    return this.loading;
  }

  async train(input: TrainInput, machineId: string): Promise<ReferenceModel> {
    await this.init();
    const rate = input.sampleRate || input.trainingData.config.sampleRate;
    const wave = input.rawBuffer
      ? resampleTo16k(input.rawBuffer, rate)
      : null;
    if (!wave || wave.length < WINDOW_SAMPLES) {
      throw new Error(
        'YAMNet benötigt das vollständige Roh-Referenzaudio (mind. ~1 s). Bitte erneut aufnehmen.'
      );
    }

    // Slide YAMNet windows over the reference and embed each → bank.
    const embeddings: Float32Array[] = [];
    for (let start = 0; start + WINDOW_SAMPLES <= wave.length; start += HOP_SAMPLES) {
      const win = wave.subarray(start, start + WINDOW_SAMPLES);
      embeddings.push(await this.embed(win));
    }
    if (embeddings.length === 0) {
      embeddings.push(await this.embed(wave.subarray(0, WINDOW_SAMPLES)));
    }
    const bank = subsample(embeddings, MAX_BANK);

    // Mean reference embedding (L2-normalized) for ghost/fallback.
    const mean = l2normalize(average(bank));

    // Value calibration on the cosine k-NN similarity (leave-one-out).
    const sims = bank.map((v, i) => meanTopKCosine(v, bank, KNN_K, i));
    const muSim = mean1(sims);
    if (!(muSim > 1e-6) || !isFinite(muSim)) {
      throw new Error('YAMNet-Referenz inkonsistent (mittlere Embedding-Ähnlichkeit ~0).');
    }
    const scalingConstant = Math.atanh(Math.sqrt(TARGET_SELF_SCORE)) / muSim;
    const baselineScore = mean1(sims.map((s) => scoreFromCosine(s, scalingConstant)));

    logger.info(
      `✅ YAMNet model trained: windows=${embeddings.length}, bank=${bank.length}, ` +
        `μsim=${muSim.toFixed(4)}, C=${scalingConstant.toFixed(4)}, baseline=${baselineScore.toFixed(1)}%`
    );

    const model: EmbeddingModel = {
      engineId: 'yamnet',
      machineId,
      label: '',
      type: 'healthy',
      bank: bank.map((v) => Array.from(v)),
      mean: Array.from(mean),
      scalingConstant,
      embeddingDim: EMBEDDING_DIM,
      featureDimension: EMBEDDING_DIM,
      sampleRate: rate,
      trainingDate: Date.now(),
      trainingDuration: input.trainingData.config.windowSize * input.trainingData.numSamples,
      baselineScore,
      metadata: { meanCosine: muSim, targetScore: TARGET_SELF_SCORE },
    };
    return model;
  }

  async classify(models: ReferenceModel[], frame: FrameInput): Promise<DiagnosisResult> {
    await this.init();
    const embModels = models.filter(isEmbedding);
    if (embModels.length === 0) {
      throw new Error('No YAMNet reference models available for classification');
    }
    if (!frame.rawChunk || frame.rawChunk.length === 0) {
      throw new Error('YAMNet requires raw audio (frame.rawChunk)');
    }

    const wave = resampleTo16k(frame.rawChunk, frame.sampleRate);
    const z = await this.embed(wave); // L2-normalized live embedding

    let bestScore = -1;
    let bestCos = 0;
    let bestLabel = 'UNKNOWN';
    let bestModel: EmbeddingModel | null = null;
    for (const model of embModels) {
      const bank = decodeBank(model);
      const sim = meanTopKCosine(z, bank, KNN_K, -1);
      const score = calibrate(scoreFromCosine(sim, model.scalingConstant), model.baselineScore);
      if (score > bestScore) {
        bestScore = score;
        bestCos = sim;
        bestLabel = model.label;
        bestModel = model;
      }
    }

    const settings = getRecordingSettings();
    const safeScore = bestScore < 0 ? 0 : bestScore;
    let status: DiagnosisResult['status'];
    if (bestModel === null || safeScore < settings.confidenceThreshold) {
      status = 'uncertain';
      bestLabel = 'UNKNOWN';
    } else {
      status = bestModel.type;
    }

    return {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      machineId: bestModel?.machineId || embModels[0].machineId,
      timestamp: Date.now(),
      healthScore: Math.round(safeScore * 10) / 10,
      status,
      confidence: calculateConfidenceFromScore(safeScore),
      rawCosineSimilarity: Math.round(bestCos * 10000) / 10000,
      metadata: {
        detectedState: bestLabel,
        multiclassMode: true,
        evaluatedModels: embModels.length,
        engineId: 'yamnet',
        debug: bestModel
          ? {
              weightMagnitude: 0,
              featureMagnitude: vectorMagnitude(z as unknown as Float64Array),
              magnitudeFactor: 1,
              cosine: bestCos,
              adjustedCosine: bestCos,
              scalingConstant: bestModel.scalingConstant,
              rawScore: safeScore,
            }
          : undefined,
      },
      analysis: { hint: generateMulticlassHint(safeScore, bestLabel, status) },
    };
  }

  async scoreAll(models: ReferenceModel[], frame: FrameInput): Promise<WorkPointScore[]> {
    await this.init();
    if (!frame.rawChunk || frame.rawChunk.length === 0) return [];
    const wave = resampleTo16k(frame.rawChunk, frame.sampleRate);
    const z = await this.embed(wave);
    const scores: WorkPointScore[] = [];
    for (const model of models) {
      if (!isEmbedding(model)) continue;
      const bank = decodeBank(model);
      const sim = meanTopKCosine(z, bank, KNN_K, -1);
      const score = calibrate(scoreFromCosine(sim, model.scalingConstant), model.baselineScore);
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

  dispose(): void {
    this.model?.dispose();
    this.model = null;
    this.loading = null;
  }

  /** Run YAMNet on a 16 kHz waveform → one L2-normalized 1024-dim embedding. */
  private async embed(wave16k: Float32Array): Promise<Float32Array> {
    if (!this.tf || !this.model) throw new Error('YAMNet model not loaded');
    const tf = this.tf;
    const input = tf.tensor1d(wave16k);
    const out = this.model.execute(input) as TF.Tensor | TF.Tensor[];
    // YAMNet TFJS outputs [scores, embeddings, spectrogram]; embeddings is the
    // rank-2 (frames × 1024) tensor. Pick by shape to be robust to ordering.
    const outs = Array.isArray(out) ? out : [out];
    try {
      // The embeddings output is the rank-2 (frames × 1024) tensor. If it is not
      // present, the model output format differs from what we expect — fail
      // loudly rather than silently averaging the wrong tensor (e.g. scores).
      const embeddingsTensor = outs.find(
        (tens) => tens.shape.length === 2 && tens.shape[1] === EMBEDDING_DIM
      );
      if (!embeddingsTensor) {
        const shapes = outs.map((t) => `[${t.shape.join(',')}]`).join(' ');
        throw new Error(
          `YAMNet output has no [N,${EMBEDDING_DIM}] embeddings tensor (got ${shapes}). ` +
            `Adjust EMBEDDING_DIM / model URL for this YAMNet variant.`
        );
      }
      const data = (await embeddingsTensor.data()) as Float32Array;
      const dim = embeddingsTensor.shape[1] ?? EMBEDDING_DIM;
      const frames = Math.max(1, embeddingsTensor.shape[0] ?? 1);
      // Mean over frames → one embedding.
      const mean = new Float64Array(dim);
      for (let f = 0; f < frames; f++) {
        for (let k = 0; k < dim; k++) mean[k] += data[f * dim + k];
      }
      for (let k = 0; k < dim; k++) mean[k] /= frames;
      return l2normalize(Float32Array.from(mean));
    } finally {
      input.dispose();
      for (const tens of outs) tens.dispose();
    }
  }
}

function isEmbedding(model: ReferenceModel): model is EmbeddingModel {
  return model.engineId === 'yamnet';
}

/** Baseline calibration (perfect self-match → ~100%), identical to the spectral engine. */
function calibrate(rawScore: number, baselineScore?: number): number {
  if (baselineScore && baselineScore > 0) return Math.min(100, (rawScore / baselineScore) * 100);
  return rawScore;
}

function l2normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (!(n > 1e-12)) return v.slice();
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function average(vectors: Float32Array[]): Float32Array {
  const dim = vectors[0]?.length ?? 0;
  const out = new Float32Array(dim);
  for (const v of vectors) for (let k = 0; k < dim; k++) out[k] += v[k];
  for (let k = 0; k < dim; k++) out[k] /= vectors.length || 1;
  return out;
}

function meanTopKCosine(vec: Float32Array, bank: Float32Array[], k: number, exclude: number): number {
  const cosines: number[] = [];
  for (let i = 0; i < bank.length; i++) {
    if (i === exclude) continue;
    cosines.push(Math.max(0, Math.min(1, cosineSimilarity(vec as unknown as Float64Array, bank[i] as unknown as Float64Array))));
  }
  if (cosines.length === 0) return 1;
  cosines.sort((a, b) => b - a);
  const kk = Math.min(k, cosines.length);
  let s = 0;
  for (let i = 0; i < kk; i++) s += cosines[i];
  return s / kk;
}

function subsample(vectors: Float32Array[], cap: number): Float32Array[] {
  if (vectors.length <= cap) return vectors.map((v) => v);
  const out: Float32Array[] = [];
  const stride = vectors.length / cap;
  for (let i = 0; i < cap; i++) out.push(vectors[Math.floor(i * stride)]);
  return out;
}

function mean1(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}
