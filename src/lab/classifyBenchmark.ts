/**
 * ZANOBOT · Mess-Labor — gut/schlecht classification runner (browser only)
 *
 * Variant B measures Zanobot's ACTUAL field workflow (not the one-class AUC):
 * per machine section it randomly registers N good + M bad recordings as
 * SEPARATE reference fingerprints, then classifies disjoint random test clips by
 * best match, applying the user's confidence threshold (healthy/uncertain/
 * faulty). Repeated over several seeded runs and averaged.
 *
 * HARD INVARIANTS (identical to the AUC runner): the real engines and the real
 * feature pipeline are reused (no engine logic reimplemented); strictly read-
 * only (no IndexedDB writes, no real references touched); purely additive and
 * lazily loaded; GMIA/live loop untouched.
 */

import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { getEngine } from '@core/ml/engine/registry.js';
import { isAsyncEngine } from '@core/ml/engine/types.js';
import type { AnyDiagnosisEngine } from '@core/ml/engine/types.js';
import type { EngineId, FeatureVector, ReferenceModel, TrainingData } from '@data/types.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';
import { shuffledIndices } from './rng.js';
import type { ParsedDataset } from './parseFolder.js';
import {
  type ClipSource,
  type DecodedClip,
  throwIfAborted,
  yieldToUi,
  decodeClip,
  makeAudioContext,
  yamnetFrame,
  YAMNET_WINDOW_SEC,
  YAMNET_HOP_SEC,
} from './runnerShared.js';
import {
  decideClip,
  emptyConfusion,
  addDecision,
  metricsOf,
  type Confusion,
  type FingerprintScore,
  type TrueClass,
} from './classifyEval.js';
import type {
  BenchmarkProgress,
  ClassifyResult,
  ClassifySectionResult,
  ClassifyEngineResult,
} from './types.js';

export interface ClassifyOptions {
  engines: EngineId[];
  /** Good fingerprints registered per run (default 10). */
  nGood?: number;
  /** Bad fingerprints registered per run (default 10). */
  nBad?: number;
  /** Number of seeded random draws to average over (default 5). */
  runs?: number;
  /** Max test clips per class per run (default 20). */
  maxTestPerClass?: number;
  /** Base seed for reproducible draws (default fixed). */
  seed?: number;
  /** Bound the per-class pool (and thus the decode cache); default 80. */
  poolCap?: number;
  signal?: AbortSignal;
  onProgress?: (p: BenchmarkProgress) => void;
}

const DEFAULTS = {
  nGood: 10,
  nBad: 10,
  runs: 5,
  maxTestPerClass: 20,
  seed: 20240607,
  poolCap: 80,
};

/** One trained fingerprint: its model + the class label we assigned. */
export interface Fingerprint {
  model: ReferenceModel;
  type: 'healthy' | 'faulty';
  label: string;
}

/** Bounded FIFO decode cache so repeated draws don't re-decode the same clip. */
class DecodeCache {
  private map = new Map<string, DecodedClip>();
  constructor(
    private readonly ctx: AudioContext,
    private readonly resolve: (path: string) => ClipSource,
    private readonly keepRaw: boolean,
    private readonly cap: number
  ) {}

  async get(path: string): Promise<DecodedClip> {
    const hit = this.map.get(path);
    if (hit) return hit;
    const clip = await decodeClip(this.ctx, this.resolve(path));
    // Drop the raw waveform when no async engine needs it (memory bound).
    const stored: DecodedClip = this.keepRaw ? clip : { ...clip, raw: new Float32Array(0) };
    this.map.set(path, stored);
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return stored;
  }
}

/**
 * Aggregate per-fingerprint clip scores via the engine's own scoreAll().
 *
 * `transform` (optional) mirrors the phone's per-frame preprocessing on the
 * SYNC path: it may modify a frame (room compensation) or return null to
 * reject it (cherry-pick gate). The async YAMNet path scores raw audio and —
 * like on the phone — bypasses these spectral-feature stages.
 */
export async function fingerprintScores(
  engine: AnyDiagnosisEngine,
  fps: Fingerprint[],
  clip: DecodedClip,
  transform?: (fv: FeatureVector) => FeatureVector | null
): Promise<FingerprintScore[]> {
  const models = fps.map((f) => f.model);
  const typeByLabel = new Map(fps.map((f) => [f.label, f.type]));
  const sum = new Map<string, number>();
  const count = new Map<string, number>();

  const accumulate = (scores: { label: string; score: number }[]): void => {
    for (const s of scores) {
      sum.set(s.label, (sum.get(s.label) ?? 0) + s.score);
      count.set(s.label, (count.get(s.label) ?? 0) + 1);
    }
  };

  if (isAsyncEngine(engine)) {
    const win = Math.max(1, Math.round(YAMNET_WINDOW_SEC * clip.sampleRate));
    const hop = Math.max(1, Math.round(YAMNET_HOP_SEC * clip.sampleRate));
    if (clip.raw.length < win) {
      accumulate(await engine.scoreAll(models, yamnetFrame(clip.raw, clip.sampleRate)));
    } else {
      for (let start = 0; start + win <= clip.raw.length; start += hop) {
        const chunk = clip.raw.subarray(start, start + win);
        accumulate(await engine.scoreAll(models, yamnetFrame(chunk, clip.sampleRate)));
      }
    }
  } else {
    for (const feature of clip.features) {
      const fv = transform ? transform(feature) : feature;
      if (!fv) continue; // frame rejected by the cherry-pick gate
      accumulate(engine.scoreAll(models, { feature: fv, sampleRate: clip.sampleRate }));
    }
  }

  // Mean score per fingerprint over the clip → one score per fingerprint.
  return fps.map((f) => {
    const c = count.get(f.label) ?? 0;
    const mean = c > 0 ? (sum.get(f.label) ?? 0) / c : 0;
    return { score: mean, type: typeByLabel.get(f.label) ?? f.type };
  });
}

/**
 * Train one fingerprint (one model) from a single decoded clip.
 * `processedFeatures` (optional) lets the caller pass features that already ran
 * through the phone's preprocessing (cherry-picking/room comp) — the interactive
 * simulation uses this; the benchmark modes train on the raw pipeline features.
 */
export async function trainFingerprint(
  engine: AnyDiagnosisEngine,
  clip: DecodedClip,
  type: 'healthy' | 'faulty',
  label: string,
  machineId: string,
  processedFeatures?: FeatureVector[]
): Promise<Fingerprint | null> {
  const feats = processedFeatures ?? clip.features;
  const trainingData: TrainingData = {
    featureVectors: feats.map((f) => f.features),
    machineId,
    recordingId: `lab-${label}`,
    numSamples: feats.length,
    config: { ...DEFAULT_DSP_CONFIG, sampleRate: clip.sampleRate },
  };
  const input = { trainingData, rawBuffer: clip.raw, sampleRate: clip.sampleRate };
  try {
    const model = isAsyncEngine(engine)
      ? await engine.train(input, machineId)
      : engine.train(input, machineId);
    model.label = label;
    model.type = type;
    return { model, type, label };
  } catch (err) {
    logger.warn(`Mess-Labor (Klassifikation): Fingerprint-Training übersprungen (${label}):`, err);
    return null;
  }
}

/**
 * Run the gut/schlecht classification benchmark. `resolve(path)` maps a parsed
 * relative path back to a readable clip source.
 */
export async function runClassifyBenchmark(
  dataset: ParsedDataset,
  resolve: (path: string) => ClipSource,
  options: ClassifyOptions
): Promise<ClassifyResult> {
  const nGood = options.nGood ?? DEFAULTS.nGood;
  const nBad = options.nBad ?? DEFAULTS.nBad;
  const runs = Math.max(1, options.runs ?? DEFAULTS.runs);
  const maxTest = options.maxTestPerClass ?? DEFAULTS.maxTestPerClass;
  const seed = options.seed ?? DEFAULTS.seed;
  const poolCap = options.poolCap ?? DEFAULTS.poolCap;
  const signal = options.signal;
  const confidenceThreshold = getRecordingSettings().confidenceThreshold;
  const startedAt = Date.now();

  const ctx = await makeAudioContext();
  const engines = new Map<EngineId, AnyDiagnosisEngine>();
  for (const id of options.engines) engines.set(id, getEngine(id));

  const hasAsync = [...engines.values()].some((e) => isAsyncEngine(e));
  for (const engine of engines.values()) {
    if (isAsyncEngine(engine)) {
      options.onProgress?.({
        phase: 'init',
        sectionKey: '',
        filesDone: 0,
        filesTotal: 0,
        message: 'Lade YAMNet-Modell (einmalig)…',
      });
      await engine.init();
    }
  }
  const cache = new DecodeCache(ctx, resolve, hasAsync, Math.max(poolCap * 2, 40));

  // Prepare per-section pools + effective counts, and estimate total work.
  const sectionsPrep = dataset.sections.map((s) => {
    const normals = [...s.normalPaths, ...s.trainNormalPaths, ...s.testNormalPaths].sort().slice(0, poolCap);
    const abnormals = [...s.abnormalPaths].sort().slice(0, poolCap);
    const effGood = Math.min(nGood, Math.max(0, normals.length - 1));
    const effBad = Math.min(nBad, Math.max(0, abnormals.length - 1));
    const testGood = Math.min(maxTest, normals.length - effGood);
    const testBad = Math.min(maxTest, abnormals.length - effBad);
    return { s, normals, abnormals, effGood, effBad, testGood, testBad };
  });
  let filesTotal = 0;
  for (const p of sectionsPrep) {
    filesTotal += runs * (p.effGood + p.effBad + p.testGood + p.testBad);
  }

  let filesDone = 0;
  let totalClipsScored = 0;
  const sections: ClassifySectionResult[] = [];

  try {
    for (let si = 0; si < sectionsPrep.length; si++) {
      const { s, normals, abnormals, effGood, effBad } = sectionsPrep[si];
      throwIfAborted(signal);

      // Not enough data to both train and test a class → report as an error.
      if (effGood < 1 || effBad < 1) {
        const perEngine: ClassifySectionResult['perEngine'] = {};
        const err = `Zu wenige Clips (gut ${normals.length}, schlecht ${abnormals.length})`;
        for (const id of engines.keys()) {
          perEngine[id] = { confusion: emptyConfusion(), metrics: metricsOf(emptyConfusion()), error: err };
        }
        sections.push({ key: s.key, machine: s.machine, section: s.section, nGood: effGood, nBad: effBad, perEngine });
        continue;
      }

      const confusions = new Map<EngineId, Confusion>();
      for (const id of engines.keys()) confusions.set(id, emptyConfusion());

      for (let r = 0; r < runs; r++) {
        throwIfAborted(signal);
        const base = seed + si * 7919 + r * 13;
        const ordN = shuffledIndices(normals.length, base);
        const ordA = shuffledIndices(abnormals.length, base + 104729);

        const trainGood = ordN.slice(0, effGood).map((i) => normals[i]);
        const testGood = ordN.slice(effGood, effGood + maxTest).map((i) => normals[i]);
        const trainBad = ordA.slice(0, effBad).map((i) => abnormals[i]);
        const testBad = ordA.slice(effBad, effBad + maxTest).map((i) => abnormals[i]);

        options.onProgress?.({
          phase: 'train',
          sectionKey: s.key,
          filesDone,
          filesTotal,
          message: `Anlernen: ${s.key} (Durchlauf ${r + 1}/${runs})`,
        });

        // Train fingerprints per engine.
        const fpsByEngine = new Map<EngineId, Fingerprint[]>();
        for (const id of engines.keys()) fpsByEngine.set(id, []);
        const trainList: Array<{ path: string; type: 'healthy' | 'faulty'; idx: number }> = [
          ...trainGood.map((path, idx) => ({ path, type: 'healthy' as const, idx })),
          ...trainBad.map((path, idx) => ({ path, type: 'faulty' as const, idx })),
        ];
        for (const { path, type, idx } of trainList) {
          throwIfAborted(signal);
          const clip = await cache.get(path);
          for (const [id, engine] of engines) {
            const fp = await trainFingerprint(engine, clip, type, `${type}#${idx}`, s.key);
            if (fp) fpsByEngine.get(id)?.push(fp);
          }
          filesDone++;
          await yieldToUi();
        }

        // Classify the disjoint test clips.
        const testList: Array<{ path: string; truth: TrueClass }> = [
          ...testGood.map((path) => ({ path, truth: 'normal' as const })),
          ...testBad.map((path) => ({ path, truth: 'abnormal' as const })),
        ];
        for (const { path, truth } of testList) {
          throwIfAborted(signal);
          options.onProgress?.({
            phase: 'score',
            sectionKey: s.key,
            filesDone,
            filesTotal,
            message: `Prüfen: ${s.key} (Durchlauf ${r + 1}/${runs})`,
          });
          let clip: DecodedClip | null = null;
          try {
            clip = await cache.get(path);
          } catch (err) {
            logger.warn(`Mess-Labor (Klassifikation): Prüf-Clip übersprungen (${path}):`, err);
          }
          if (clip) {
            for (const [id, engine] of engines) {
              const fps = fpsByEngine.get(id) ?? [];
              // Need at least one healthy AND one faulty fingerprint to decide.
              const hasBoth = fps.some((f) => f.type === 'healthy') && fps.some((f) => f.type === 'faulty');
              if (!hasBoth) continue;
              try {
                const scores = await fingerprintScores(engine, fps, clip);
                addDecision(confusions.get(id)!, truth, decideClip(scores, confidenceThreshold));
              } catch (err) {
                logger.warn(`Mess-Labor (Klassifikation): Scoring fehlgeschlagen (${id}/${path}):`, err);
              }
            }
            totalClipsScored++;
          }
          filesDone++;
          await yieldToUi();
        }
      }

      const perEngine: ClassifySectionResult['perEngine'] = {};
      for (const id of engines.keys()) {
        const confusion = confusions.get(id) ?? emptyConfusion();
        const result: ClassifyEngineResult = { confusion, metrics: metricsOf(confusion) };
        perEngine[id] = result;
      }
      sections.push({
        key: s.key,
        machine: s.machine,
        section: s.section,
        nGood: effGood,
        nBad: effBad,
        perEngine,
      });
    }
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }

  return {
    engines: options.engines,
    sections,
    runs,
    nGood,
    nBad,
    confidenceThreshold,
    seed,
    startedAt,
    finishedAt: Date.now(),
    totalClipsScored,
  };
}
