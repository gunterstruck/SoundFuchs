/**
 * ZANOBOT · Mess-Labor — interactive session ("Handy-Simulation")
 *
 * Variant C: the user deliberately hand-picks files from the dataset and uses
 * them exactly like on the phone — first good file becomes the Referenz
 * (Baseline), further good and bad files become additional fingerprints, and
 * then single clips are checked one by one. Every check produces a real
 * DiagnosisResult-shaped record (score, status at the user's thresholds,
 * detected state), which feeds the REAL phone components: HistoryChart for the
 * Verlauf and renderMachineFingerprint for the iris.
 *
 * HARD INVARIANTS (same as the other lab runners): real engines + real feature
 * pipeline via the shared helpers, engine logic untouched; strictly read-only —
 * fingerprints live only in this session object, nothing is persisted.
 */

import { getEngine } from '@core/ml/engine/registry.js';
import { isAsyncEngine } from '@core/ml/engine/types.js';
import type { AnyDiagnosisEngine } from '@core/ml/engine/types.js';
import type { EngineId, DiagnosisResult, QualityResult } from '@data/types.js';
import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import { calculateConfidenceFromScore } from '@core/ml/scoring.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';
import {
  type ClipSource,
  type DecodedClip,
  decodeClip,
  makeAudioContext,
} from './runnerShared.js';
import {
  trainFingerprint,
  fingerprintScores,
  type Fingerprint,
} from './classifyBenchmark.js';
import { phoneVerdict, type LabeledFingerprintScore } from './classifyEval.js';
import {
  trainPipeline,
  computeRefStats,
  LivePipeline,
  pipelineSummary,
  type RefStats,
} from './phonePipeline.js';

/** A hand-picked training file with its user-assigned class. */
export interface TrainSelection {
  path: string;
  type: 'healthy' | 'faulty';
}

/** One trained fingerprint plus the file it came from (for the protocol). */
export interface TrainedFingerprint {
  label: string; // "Referenz", "Gut #2", "Schlecht #1"
  type: 'healthy' | 'faulty';
  path: string;
}

/** Worst drift observed during one check (purely diagnostic, like the phone). */
export interface DriftSummary {
  severity: 'warning' | 'critical';
  interpretation: string;
}

/** One completed check (a "Prüfung") in this session. */
export interface CheckRecord {
  path: string;
  /** Ground truth from the folder name, shown in the protocol. */
  trueClass: 'normal' | 'abnormal' | 'unbekannt';
  diagnosis: DiagnosisResult;
  winnerLabel: string;
  winnerPath: string;
  /** Drift warning of this check (null = ok / detector off). */
  drift: DriftSummary | null;
  /** Which live pipeline stages were active for this check. */
  pipeline: string[];
}

/**
 * A live, in-memory "virtual machine" built from dataset files. Owns its
 * AudioContext and decode cache; dispose() releases everything. Nothing here
 * touches IndexedDB or the app's machines.
 */
export class InteractiveSession {
  readonly engineId: EngineId;
  private engine: AnyDiagnosisEngine;
  private ctx: AudioContext | null = null;
  private readonly resolve: (path: string) => ClipSource;
  private readonly clipCache = new Map<string, DecodedClip>();

  private fingerprints: Fingerprint[] = [];
  private trained: TrainedFingerprint[] = [];
  private pathByLabel = new Map<string, string>();
  private refIris: Float32Array | null = null;
  private checks: CheckRecord[] = [];

  /** Reference statistics for bias match/drift (like Machine.refLogMean etc.). */
  private refStats: RefStats | null = null;
  /** Quality of the Referenz recording, assessed like on the phone. */
  private refQuality: QualityResult | null = null;
  /** Pipeline notes collected during the last training. */
  private trainingNotes: string[] = [];

  constructor(engineId: EngineId, resolve: (path: string) => ClipSource) {
    this.engineId = engineId;
    this.engine = getEngine(engineId);
    this.resolve = resolve;
  }

  get trainedFingerprints(): readonly TrainedFingerprint[] {
    return this.trained;
  }

  get history(): readonly CheckRecord[] {
    return this.checks;
  }

  get referenceIris(): Float32Array | null {
    return this.refIris;
  }

  get isTrained(): boolean {
    return this.fingerprints.length > 0;
  }

  get referenceQuality(): QualityResult | null {
    return this.refQuality;
  }

  get lastTrainingNotes(): readonly string[] {
    return this.trainingNotes;
  }

  private async context(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = await makeAudioContext();
    return this.ctx;
  }

  private async clip(path: string): Promise<DecodedClip> {
    const hit = this.clipCache.get(path);
    if (hit) return hit;
    const clip = await decodeClip(await this.context(), this.resolve(path));
    this.clipCache.set(path, clip);
    // Interactive sessions handle a handful of files; still, keep a sane bound.
    if (this.clipCache.size > 60) {
      const oldest = this.clipCache.keys().next().value;
      if (oldest !== undefined) this.clipCache.delete(oldest);
    }
    return clip;
  }

  /** Median spectrum of a clip for the iris (same primitive as the phone). */
  private async irisVectorOf(path: string): Promise<Float32Array | null> {
    try {
      const clip = await this.clip(path);
      const ctx = await this.context();
      const buffer = ctx.createBuffer(1, clip.raw.length, clip.sampleRate);
      // Fresh copy: copyToChannel requires a plain-ArrayBuffer-backed view.
      buffer.copyToChannel(new Float32Array(clip.raw), 0);
      return averageSpectrum(buffer);
    } catch (err) {
      logger.warn('Mess-Labor (Interaktiv): Iris-Spektrum fehlgeschlagen:', err);
      return null;
    }
  }

  /**
   * Train the hand-picked selection as separate fingerprints. The FIRST healthy
   * file becomes "Referenz" (the Baseline, like on the phone); further healthy
   * files "Gut #n", faulty files "Schlecht #n". Replaces any previous training
   * but keeps the check history (the Verlauf tracks the whole session).
   */
  async train(
    selection: TrainSelection[],
    onProgress?: (done: number, total: number, label: string) => void
  ): Promise<TrainedFingerprint[]> {
    if (isAsyncEngine(this.engine)) await this.engine.init();

    const good = selection.filter((s) => s.type === 'healthy');
    const bad = selection.filter((s) => s.type === 'faulty');
    if (good.length === 0) {
      throw new Error('Mindestens eine Gut-Datei als Referenz auswählen.');
    }

    const jobs: Array<{ path: string; type: 'healthy' | 'faulty'; label: string }> = [
      ...good.map((s, i) => ({
        path: s.path,
        type: s.type,
        label: i === 0 ? 'Referenz' : `Gut #${i + 1}`,
      })),
      ...bad.map((s, i) => ({ path: s.path, type: s.type, label: `Schlecht #${i + 1}` })),
    ];

    const fingerprints: Fingerprint[] = [];
    const trained: TrainedFingerprint[] = [];
    const pathByLabel = new Map<string, string>();
    const notes: string[] = [];
    let refQuality: QualityResult | null = null;
    let refStats: RefStats | null = null;
    let done = 0;
    for (const job of jobs) {
      onProgress?.(done, jobs.length, job.label);
      const clip = await this.clip(job.path);
      // Phone training preprocessing per recording: cherry-picking + room comp
      // exactly as 2-Reference does it, driven by the CURRENT settings.
      const pre = trainPipeline(clip.features);
      for (const note of pre.notes) notes.push(`${job.label}: ${note}`);
      const fp = await trainFingerprint(
        this.engine,
        clip,
        job.type,
        job.label,
        'mess-labor',
        pre.features
      );
      if (fp) {
        fingerprints.push(fp);
        trained.push({ label: job.label, type: job.type, path: job.path });
        pathByLabel.set(job.label, job.path);
        if (job.label === 'Referenz') {
          refQuality = pre.quality;
          // Reference statistics (refLogMean/σ/baseline) for bias match + drift,
          // like the phone stores them on the Machine at reference creation.
          refStats = computeRefStats(pre.features);
        }
      } else {
        logger.warn(`Mess-Labor (Interaktiv): "${job.path}" konnte nicht angelernt werden.`);
      }
      done++;
      onProgress?.(done, jobs.length, job.label);
    }
    if (!fingerprints.some((f) => f.type === 'healthy')) {
      throw new Error('Referenz konnte nicht angelernt werden.');
    }

    this.fingerprints = fingerprints;
    this.trained = trained;
    this.pathByLabel = pathByLabel;
    this.refQuality = refQuality;
    this.refStats = refStats;
    this.trainingNotes = notes;
    this.refIris = await this.irisVectorOf(pathByLabel.get('Referenz') ?? good[0].path);
    return trained;
  }

  /**
   * Check one file — like a Prüfung on the phone: the live pipeline (cherry-pick
   * gate, bias match/CMN, drift) runs per frame per the CURRENT settings, then
   * healthy and faulty fingerprints are judged separately with BOTH thresholds
   * (3-Diagnose logic). Appends to the session history and returns the record.
   */
  async check(
    path: string,
    trueClass: CheckRecord['trueClass']
  ): Promise<{ record: CheckRecord; iris: Float32Array | null }> {
    if (this.fingerprints.length === 0) {
      throw new Error('Bitte zuerst anlernen (mindestens die Referenz).');
    }
    const settings = getRecordingSettings();
    const clip = await this.clip(path);

    // Fresh live pipeline per check — running means/gates start clean, like a
    // new diagnosis run on the phone. Drift is tracked as the worst event.
    const live = new LivePipeline(this.refStats);
    let drift: DriftSummary | null = null;
    const transform = (fv: Parameters<LivePipeline['process']>[0]) => {
      const out = live.process(fv);
      if (out.drift) {
        const sev =
          out.drift.globalSeverity === 'critical' || out.drift.localSeverity === 'critical'
            ? 'critical'
            : out.drift.globalSeverity === 'warning' || out.drift.localSeverity === 'warning'
              ? 'warning'
              : null;
        if (sev && (drift === null || (drift.severity === 'warning' && sev === 'critical'))) {
          drift = { severity: sev, interpretation: out.drift.interpretation };
        }
      }
      return out.feature;
    };

    let raw = await fingerprintScores(this.engine, this.fingerprints, clip, transform);
    const pipeline = [...live.notes];
    // Gate safety: if EVERY frame was rejected as transient, score without the
    // gate (mirrors the phone never updating — a no-result is useless in a demo).
    if (!isAsyncEngine(this.engine) && live.accepted === 0 && live.rejected > 0) {
      raw = await fingerprintScores(this.engine, this.fingerprints, clip);
      pipeline.push('Alle Frames als transient verworfen — Gate für diese Prüfung ignoriert');
    } else if (live.rejected > 0) {
      pipeline.push(`Cherry-Picking: ${live.rejected} Frame(s) verworfen`);
    }

    const labeled: LabeledFingerprintScore[] = raw.map((s, i) => ({
      ...s,
      label: this.fingerprints[i].label,
    }));
    // Phone verdict (3-Diagnose): gauge = best HEALTHY score; a confidently
    // matched fault forces 'faulty'; both thresholds map the healthy score.
    const verdict = phoneVerdict(labeled, settings.confidenceThreshold, settings.faultyThreshold);
    const score = Math.round(verdict.healthScore * 10) / 10;

    const diagnosis: DiagnosisResult = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      machineId: 'mess-labor',
      timestamp: Date.now(),
      healthScore: score,
      status: verdict.status,
      confidence: calculateConfidenceFromScore(score),
      metadata: {
        detectedState: verdict.detectedState,
        engineId: this.engineId,
        fileName: path,
        labMode: 'interactive',
        faultDetected: verdict.faultDetected,
        bestFaultyLabel: verdict.bestFaultyLabel,
        bestFaultyScore: Math.round(verdict.bestFaultyScore * 10) / 10,
      },
    };

    const record: CheckRecord = {
      path,
      trueClass,
      diagnosis,
      winnerLabel: verdict.detectedState,
      winnerPath: this.pathByLabel.get(verdict.detectedState) ?? '',
      drift,
      pipeline,
    };
    this.checks.push(record);
    const iris = await this.irisVectorOf(path);
    return { record, iris };
  }

  /** Machine-readable protocol of the whole session (for the JSON download). */
  toJson(): string {
    const settings = getRecordingSettings();
    return JSON.stringify(
      {
        tool: 'zanobot-mess-labor',
        mode: 'interactive',
        note: 'Handy-Simulation: handverlesene Fingerprints, Prüfungen einzeln, Pipeline + Schwellen wie in den Einstellungen. Strikt lesend.',
        engine: this.engineId,
        confidenceThreshold: settings.confidenceThreshold,
        faultyThreshold: settings.faultyThreshold,
        pipeline: pipelineSummary(),
        trainingNotes: this.trainingNotes,
        referenceQuality: this.refQuality
          ? { rating: this.refQuality.rating, score: this.refQuality.score, issues: this.refQuality.issues }
          : null,
        trainedFingerprints: this.trained,
        checks: this.checks.map((c) => ({
          file: c.path,
          trueClass: c.trueClass,
          healthScore: c.diagnosis.healthScore,
          status: c.diagnosis.status,
          detectedState: c.winnerLabel,
          detectedFile: c.winnerPath,
          drift: c.drift,
          pipeline: c.pipeline,
          timestamp: new Date(c.diagnosis.timestamp).toISOString(),
        })),
      },
      null,
      2
    );
  }

  /** Drop the training + history and release audio resources. */
  async dispose(): Promise<void> {
    this.fingerprints = [];
    this.trained = [];
    this.pathByLabel.clear();
    this.checks = [];
    this.refIris = null;
    this.refStats = null;
    this.refQuality = null;
    this.trainingNotes = [];
    this.clipCache.clear();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* ignore */
      }
      this.ctx = null;
    }
  }
}
