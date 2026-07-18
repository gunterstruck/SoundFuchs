/**
 * ZANOBOT · Mess-Labor — engine benchmark runner (browser only)
 *
 * Drives the REAL engines and the REAL production feature pipeline over a
 * MIMII-style folder and produces an AUC grade per machine-section per engine.
 *
 * HARD INVARIANTS honoured here:
 *  - Engine logic is NOT reimplemented: we call the same DiagnosisEngine /
 *    AsyncDiagnosisEngine instances from the registry and the same
 *    extractFeatures() (330-ms frames, 512-bin relative ESD) as the product.
 *  - Read-only: nothing is written to IndexedDB or to any real reference.
 *  - GMIA and the live loop are untouched; this module is purely additive and
 *    lazily loaded.
 *
 * The heavy work is chunked with cooperative yields so the tab never freezes,
 * and an AbortSignal cancels between clips.
 */

import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { getEngine } from '@core/ml/engine/registry.js';
import { isAsyncEngine } from '@core/ml/engine/types.js';
import type { AnyDiagnosisEngine } from '@core/ml/engine/types.js';
import type { EngineId, ReferenceModel, TrainingData } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { auc, pAUC } from './auc.js';
import { clipAggregate, CLIP_AGG_DEFAULT, type ClipAggMode } from './clipAggregate.js';
import {
  planSplit,
  SPLIT_MODE_DEFAULT,
  type ParsedDataset,
  type ParsedSection,
  type SplitMode,
} from './parseFolder.js';
import {
  type ClipSource,
  type DecodedClip,
  throwIfAborted,
  yieldToUi,
  decodeClip,
  makeAudioContext,
  concatRaw,
  cap,
  yamnetFrame,
  YAMNET_WINDOW_SEC,
  YAMNET_HOP_SEC,
} from './runnerShared.js';
import type {
  BenchmarkResult,
  BenchmarkProgress,
  SectionResult,
  EngineScore,
  ScoreBasis,
} from './types.js';

export type { ClipSource };

export interface BenchmarkOptions {
  engines: EngineId[];
  clipAgg?: ClipAggMode;
  /** Train/test ratio for sections without an explicit split (default 0.5). */
  splitRatio?: number;
  /** Partition strategy for sections without an explicit split (default interleaved). */
  splitMode?: SplitMode;
  /** Seed for the 'seeded-random' split mode (reproducible). */
  splitSeed?: number;
  /** Optional cap on files used per section per role (first measurement). */
  maxFilesPerSection?: number;
  signal?: AbortSignal;
  onProgress?: (p: BenchmarkProgress) => void;
}


/** One clip's anomaly, on two bases: the display score and the metric (raw). */
interface ClipAnomaly {
  /** Aggregated 0–100 anomaly (100 − capped health score) — for display. */
  capped: number;
  /**
   * Aggregated anomaly on the engine's RAW cosine/similarity (1 − rawCosine),
   * BEFORE the saturating tanh². Preferred for AUC/pAUC because well-matching
   * healthy clips no longer pile up as ties at the score ceiling. NaN when the
   * engine did not expose a raw similarity for this clip.
   */
  raw: number;
  /** True when a finite raw similarity was available for every scored frame. */
  rawValid: boolean;
}

/**
 * Anomaly of one decoded clip for one engine. Sync engines run per 330-ms
 * frame; the async engine slides ≈1-s windows over the raw waveform (the
 * product's ring-buffer granularity). Per frame we keep BOTH the capped
 * anomaly (100 − health) for display and the raw anomaly (1 − rawCosine) for
 * the metric, then aggregate each with the chosen mode.
 *
 * NB: nothing about the engines changes — `rawCosineSimilarity` is already on
 * the DiagnosisResult (the winning model's cosine before tanh²/calibration).
 */
async function scoreClip(
  engine: AnyDiagnosisEngine,
  models: ReferenceModel[],
  clip: DecodedClip,
  mode: ClipAggMode
): Promise<ClipAnomaly> {
  // Sequenz-Engines (Tier 2 'temporal') halten einen Ringpuffer über die
  // Frames EINER Aufnahme. Pro Clip zurücksetzen, damit keine Anomalien
  // über Clip-Grenzen "lecken" (im Feld erledigt das die Session-Lücke).
  (engine as { resetSequenceState?: () => void }).resetSequenceState?.();

  const capped: number[] = [];
  const raw: number[] = [];
  let frames = 0;

  const consume = (r: { healthScore: number; rawCosineSimilarity?: number }): void => {
    frames++;
    capped.push(100 - r.healthScore);
    const sim = r.rawCosineSimilarity;
    if (typeof sim === 'number' && Number.isFinite(sim)) raw.push(1 - sim);
  };

  if (isAsyncEngine(engine)) {
    const win = Math.max(1, Math.round(YAMNET_WINDOW_SEC * clip.sampleRate));
    const hop = Math.max(1, Math.round(YAMNET_HOP_SEC * clip.sampleRate));
    if (clip.raw.length < win) {
      consume(await engine.classify(models, yamnetFrame(clip.raw, clip.sampleRate)));
    } else {
      for (let start = 0; start + win <= clip.raw.length; start += hop) {
        const chunk = clip.raw.subarray(start, start + win);
        consume(await engine.classify(models, yamnetFrame(chunk, clip.sampleRate)));
      }
    }
  } else {
    for (const feature of clip.features) {
      consume(engine.classify(models, { feature, sampleRate: clip.sampleRate }));
    }
  }

  const rawValid = frames > 0 && raw.length === frames;
  return {
    capped: clipAggregate(capped, mode),
    raw: rawValid ? clipAggregate(raw, mode) : NaN,
    rawValid,
  };
}

/** Train every requested engine for one section from its normal-train clips. */
async function trainSection(
  ctx: AudioContext,
  engines: Map<EngineId, AnyDiagnosisEngine>,
  trainPaths: string[],
  resolve: (path: string) => ClipSource,
  machineId: string,
  signal: AbortSignal | undefined,
  onClip: () => void
): Promise<Map<EngineId, ReferenceModel | { error: string }>> {
  // Decode all training clips once; accumulate features + raw for every engine.
  const featureVectors: Float64Array[] = [];
  const rawParts: Float32Array[] = [];
  let sampleRate = DEFAULT_DSP_CONFIG.sampleRate;

  for (const path of trainPaths) {
    throwIfAborted(signal);
    try {
      const clip = await decodeClip(ctx, resolve(path));
      sampleRate = clip.sampleRate;
      for (const f of clip.features) featureVectors.push(f.features);
      rawParts.push(clip.raw);
    } catch (err) {
      logger.warn(`Mess-Labor: Trainings-Clip übersprungen (${path}):`, err);
    }
    onClip();
    await yieldToUi();
  }

  const result = new Map<EngineId, ReferenceModel | { error: string }>();
  if (featureVectors.length === 0) {
    for (const id of engines.keys()) result.set(id, { error: 'Keine Trainings-Frames dekodiert' });
    return result;
  }

  const rawBuffer = concatRaw(rawParts);
  const trainingData: TrainingData = {
    featureVectors,
    machineId,
    recordingId: `lab-${machineId}`,
    numSamples: featureVectors.length,
    config: { ...DEFAULT_DSP_CONFIG, sampleRate },
  };

  for (const [id, engine] of engines) {
    throwIfAborted(signal);
    try {
      const input = { trainingData, rawBuffer, sampleRate };
      const model = isAsyncEngine(engine)
        ? await engine.train(input, machineId)
        : engine.train(input, machineId);
      model.label = 'Referenz';
      model.type = 'healthy';
      result.set(id, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Mess-Labor: Training fehlgeschlagen (${id}/${machineId}):`, err);
      result.set(id, { error: msg });
    }
  }
  return result;
}

function isModel(m: ReferenceModel | { error: string }): m is ReferenceModel {
  return !('error' in m);
}

/**
 * Run the full benchmark. `resolve(path)` maps a parsed relative path back to a
 * readable clip source (provided by the UI from the picked directory).
 */
export async function runBenchmark(
  dataset: ParsedDataset,
  resolve: (path: string) => ClipSource,
  options: BenchmarkOptions
): Promise<BenchmarkResult> {
  const clipAgg = options.clipAgg ?? CLIP_AGG_DEFAULT;
  const signal = options.signal;
  const startedAt = Date.now();

  // One audio context for the whole run. 48 kHz matches the product config; the
  // pipeline adapts to each file's true rate when it differs.
  const ctx = await makeAudioContext();

  // Instantiate the requested engines (shared singletons from the registry).
  const engines = new Map<EngineId, AnyDiagnosisEngine>();
  for (const id of options.engines) engines.set(id, getEngine(id));

  // Lazily load TF.js + YAMNet exactly once, up front, if requested.
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

  // Plan splits and count total files for the progress bar.
  const splitMode = options.splitMode ?? SPLIT_MODE_DEFAULT;
  const plans = dataset.sections.map((s) => ({
    section: s,
    plan: planSplit(s, { mode: splitMode, ratio: options.splitRatio, seed: options.splitSeed }),
  }));
  let filesTotal = 0;
  for (const { plan } of plans) {
    filesTotal +=
      cap(plan.trainNormal, options.maxFilesPerSection).length +
      cap(plan.testNormal, options.maxFilesPerSection).length +
      cap(plan.testAbnormal, options.maxFilesPerSection).length;
  }

  let filesDone = 0;
  let totalClipsScored = 0;
  const sections: SectionResult[] = [];

  try {
    for (const { section, plan } of plans) {
      throwIfAborted(signal);
      const trainPaths = cap(plan.trainNormal, options.maxFilesPerSection);
      const testNormal = cap(plan.testNormal, options.maxFilesPerSection);
      const testAbnormal = cap(plan.testAbnormal, options.maxFilesPerSection);

      options.onProgress?.({
        phase: 'train',
        sectionKey: section.key,
        filesDone,
        filesTotal,
        message: `Anlernen: ${section.key}`,
      });

      const models = await trainSection(
        ctx,
        engines,
        trainPaths,
        resolve,
        section.key,
        signal,
        () => {
          filesDone++;
        }
      );

      // Per engine, accumulate clip anomaly scores + labels across the test set.
      // We keep BOTH the raw-cosine metric and the capped score so the basis can
      // be chosen honestly per engine (raw preferred; capped only as fallback).
      const scoresByEngine = new Map<
        EngineId,
        { raw: number[]; capped: number[]; labels: number[]; rawAllValid: boolean }
      >();
      for (const id of engines.keys())
        scoresByEngine.set(id, { raw: [], capped: [], labels: [], rawAllValid: true });

      const testClips: Array<{ path: string; label: 0 | 1 }> = [
        ...testNormal.map((p) => ({ path: p, label: 0 as const })),
        ...testAbnormal.map((p) => ({ path: p, label: 1 as const })),
      ];

      for (const { path, label } of testClips) {
        throwIfAborted(signal);
        options.onProgress?.({
          phase: 'score',
          sectionKey: section.key,
          filesDone,
          filesTotal,
          message: `Prüfen: ${section.key}`,
        });
        let clip: DecodedClip | null = null;
        try {
          clip = await decodeClip(ctx, resolve(path));
        } catch (err) {
          logger.warn(`Mess-Labor: Prüf-Clip übersprungen (${path}):`, err);
        }
        if (clip) {
          for (const [id, engine] of engines) {
            const model = models.get(id);
            if (!model || !isModel(model)) continue;
            try {
              const value = await scoreClip(engine, [model], clip, clipAgg);
              // A clip contributes only if at least the display score is finite.
              if (Number.isFinite(value.capped)) {
                const bucket = scoresByEngine.get(id);
                if (bucket) {
                  bucket.capped.push(value.capped);
                  bucket.raw.push(value.raw);
                  bucket.labels.push(label);
                  if (!value.rawValid || !Number.isFinite(value.raw)) bucket.rawAllValid = false;
                }
              }
            } catch (err) {
              logger.warn(`Mess-Labor: Scoring fehlgeschlagen (${id}/${path}):`, err);
            }
          }
          totalClipsScored++;
        }
        filesDone++;
        await yieldToUi();
      }

      // Grade every engine for this section. Prefer the raw-cosine basis; fall
      // back to the capped score only if a raw value was missing for any clip.
      const perEngine: SectionResult['perEngine'] = {};
      for (const id of engines.keys()) {
        const model = models.get(id);
        if (model && !isModel(model)) {
          perEngine[id] = {
            auc: NaN,
            pAuc: NaN,
            scoreBasis: 'raw-cosine',
            nTestNormal: 0,
            nTestAbnormal: 0,
            error: model.error,
          };
          continue;
        }
        const bucket = scoresByEngine.get(id) ?? {
          raw: [],
          capped: [],
          labels: [],
          rawAllValid: false,
        };
        const useRaw = bucket.rawAllValid && bucket.raw.length === bucket.labels.length;
        const basis: ScoreBasis = useRaw ? 'raw-cosine' : 'capped-score';
        const metric = useRaw ? bucket.raw : bucket.capped;
        const nNorm = bucket.labels.filter((l) => l === 0).length;
        const nAbn = bucket.labels.filter((l) => l === 1).length;
        const score: EngineScore = {
          auc: auc(bucket.labels, metric),
          pAuc: nNorm > 0 && nAbn > 0 ? pAUC(bucket.labels, metric, 0.1) : NaN,
          scoreBasis: basis,
          nTestNormal: nNorm,
          nTestAbnormal: nAbn,
        };
        perEngine[id] = score;
      }

      sections.push({
        key: section.key,
        machine: section.machine,
        section: section.section,
        split: {
          source: plan.source,
          mode: plan.mode,
          ratio: plan.ratio,
          trainNormal: trainPaths.length,
          testNormal: testNormal.length,
          testAbnormal: testAbnormal.length,
        },
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
    clipAgg,
    sections,
    startedAt,
    finishedAt: Date.now(),
    totalClipsScored,
  };
}

/** Re-export for the UI without it reaching into parseFolder directly. */
export type { ParsedSection };
