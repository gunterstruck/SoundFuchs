/**
 * ZANOBOT · Mess-Labor — shared result types (engine benchmark)
 */

import type { EngineId } from '@data/types.js';
import type { ClipAggMode } from './clipAggregate.js';
import type { SplitPlan, SplitMode } from './parseFolder.js';
import type { Confusion, ClassifyMetrics } from './classifyEval.js';

/**
 * The quantity AUC/pAUC were computed on:
 *  - 'raw-cosine'   : the engine's raw, uncalibrated cosine/similarity (before
 *                     the saturating tanh²) — preferred, avoids ceiling ties.
 *  - 'capped-score' : fallback to the 0–100 health score (only if the raw value
 *                     was unavailable).
 */
export type ScoreBasis = 'raw-cosine' | 'capped-score';

/** The grade of ONE engine on ONE section. */
export interface EngineScore {
  /** AUC in [0,1], or NaN if a class was missing / training failed. */
  auc: number;
  /** Partial AUC at FPR ≤ 0.1, or NaN. */
  pAuc: number;
  /** Which quantity the AUC/pAUC above were computed on. */
  scoreBasis: ScoreBasis;
  nTestNormal: number;
  nTestAbnormal: number;
  /** Set when this engine could not be graded on this section. */
  error?: string;
}

/** Per-section block: split summary + one grade per engine. */
export interface SectionResult {
  key: string;
  machine: string;
  section: string;
  split: {
    source: SplitPlan['source'];
    mode: SplitMode;
    ratio: number;
    trainNormal: number;
    testNormal: number;
    testAbnormal: number;
  };
  perEngine: Partial<Record<EngineId, EngineScore>>;
}

/** The whole "Zeugnis" (report card). */
export interface BenchmarkResult {
  engines: EngineId[];
  clipAgg: ClipAggMode;
  sections: SectionResult[];
  startedAt: number;
  finishedAt: number;
  totalClipsScored: number;
}

/** Progress callback payload during a run. */
export interface BenchmarkProgress {
  phase: 'train' | 'score' | 'init';
  sectionKey: string;
  engineId?: EngineId;
  filesDone: number;
  filesTotal: number;
  message: string;
}

// ── Variant B: gut/schlecht classification (Zanobot's real multiclass workflow) ──

/** One engine's classification result on one section, summed over all runs. */
export interface ClassifyEngineResult {
  /** Confusion counts (true × predicted), summed over runs. */
  confusion: Confusion;
  /** Derived headline metrics. */
  metrics: ClassifyMetrics;
  /** Set when this engine could not be evaluated on this section. */
  error?: string;
}

export interface ClassifySectionResult {
  key: string;
  machine: string;
  section: string;
  /** Fingerprints per run actually used (may be reduced if the pool was small). */
  nGood: number;
  nBad: number;
  perEngine: Partial<Record<EngineId, ClassifyEngineResult>>;
}

/** The whole classification report card. */
export interface ClassifyResult {
  engines: EngineId[];
  sections: ClassifySectionResult[];
  /** Requested random draws per section. */
  runs: number;
  /** Requested good/bad fingerprints per run. */
  nGood: number;
  nBad: number;
  /** Confidence threshold used for the healthy/uncertain/faulty decision. */
  confidenceThreshold: number;
  seed: number;
  startedAt: number;
  finishedAt: number;
  totalClipsScored: number;
}
