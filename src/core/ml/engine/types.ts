/**
 * ZANOBOT - Diagnosis Engine Interface
 *
 * A thin, well-defined contract that every evaluation engine implements.
 * The existing GMIA path is wrapped (GmiaEngine) so it stays byte-for-byte
 * identical; alternative engines (spectral-cosine, later YAMNet) implement the
 * same interface and become selectable via a settings toggle.
 *
 * Tier 0 keeps the interface SYNCHRONOUS: GMIA and spectral-cosine both compute
 * synchronously, so the real-time diagnosis loop in 3-Diagnose.ts stays
 * unchanged. An async variant is only introduced when an embedding engine
 * (YAMNet, Tier 1) actually needs it.
 */

import type {
  FeatureVector,
  TrainingData,
  DiagnosisResult,
  ReferenceModel,
  EngineId,
} from '@data/types.js';
import type { WorkPointScore } from '../scoring.js';

/**
 * What an engine sees per 330-ms frame during diagnosis.
 * Both the spectral feature (GMIA, spectral-cosine) and the raw chunk
 * (future embedding engines) are offered; an engine takes what it needs.
 */
export interface FrameInput {
  feature: FeatureVector; // 512-bin relative ESD (GMIA, spectral-cosine)
  rawChunk?: Float32Array; // raw 330-ms audio (reserved for YAMNet)
  sampleRate: number; // actualSampleRate (48000/44100)
}

/**
 * Training input. GMIA & spectral-cosine use trainingData (N FeatureVectors as
 * Float64Array rows); embedding engines additionally use the raw buffer.
 */
export interface TrainInput {
  trainingData: TrainingData;
  rawBuffer?: Float32Array; // reserved for embedding-sequence engines
  sampleRate: number;
}

/**
 * The swappable SYNCHRONOUS evaluation engine contract (GMIA, spectral-cosine).
 * Unchanged — the sync diagnosis path and dispatcher rely on this being sync.
 */
export interface DiagnosisEngine {
  readonly id: EngineId;

  /** Train a reference model from one reference recording. */
  train(input: TrainInput, machineId: string): ReferenceModel;

  /** Multiclass diagnosis: score all models, best wins → DiagnosisResult. */
  classify(models: ReferenceModel[], frame: FrameInput): DiagnosisResult;

  /** Per-model scores for the WorkPointRanking visualization. */
  scoreAll(models: ReferenceModel[], frame: FrameInput): WorkPointScore[];
}

/**
 * ASYNCHRONOUS engine contract (Tier 1 / YAMNet). Kept separate so the existing
 * synchronous engines and the synchronous dispatcher are completely untouched.
 * Async engines are handled by a dedicated path (3-Diagnose / 2-Reference) and
 * are skipped by the synchronous dispatcher.
 */
export interface AsyncDiagnosisEngine {
  readonly id: EngineId;
  readonly isAsync: true;

  /** Lazily load the model (heavy; cached after first call). */
  init(): Promise<void>;

  train(input: TrainInput, machineId: string): Promise<ReferenceModel>;
  classify(models: ReferenceModel[], frame: FrameInput): Promise<DiagnosisResult>;
  scoreAll(models: ReferenceModel[], frame: FrameInput): Promise<WorkPointScore[]>;

  /** Release model/GPU resources. */
  dispose?(): void;
}

/** Either engine kind. */
export type AnyDiagnosisEngine = DiagnosisEngine | AsyncDiagnosisEngine;

/** Narrow to the async engine kind. */
export function isAsyncEngine(engine: AnyDiagnosisEngine): engine is AsyncDiagnosisEngine {
  return (engine as AsyncDiagnosisEngine).isAsync === true;
}
