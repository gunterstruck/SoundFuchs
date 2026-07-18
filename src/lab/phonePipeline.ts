/**
 * ZANOBOT · Mess-Labor — phone pipeline mirror (settings-driven extra stages)
 *
 * The phone does NOT feed raw features straight into the engines: depending on
 * the CURRENT settings it first runs Cherry-Picking (transient gate), Room
 * Compensation (Bias Match / CMN; T60 needs a live chirp) and — purely
 * diagnostic — the Drift Detector. This module mirrors those stages 1:1 for the
 * interactive "Handy-Simulation", using the SAME production classes and the
 * SAME order as 2-Reference (training) and 3-Diagnose (live check):
 *
 *   Training:  extractFeatures → cherryPickFeatures (fallback <5) →
 *              assessRecordingQuality → applyRoomCompensation → engine.train
 *   Check:     frame → cherry-pick gate (reject) → [drift on raw] →
 *              bias-match | CMN → engine.scoreAll
 *
 * T60 subtraction requires playing a chirp through the speaker and recording
 * the room response — physically impossible when reading files, so it is
 * skipped exactly like on a phone whose chirp failed (documented in the notes).
 *
 * Settings are read LIVE on every call, so changing them in the app settings
 * immediately affects the next training/check — like on the phone.
 */

import type { FeatureVector, QualityResult } from '@data/types.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { getCherryPickSettings, cherryPickFeatures, RealtimeCherryPick } from '@core/dsp/cherryPicking.js';
import {
  getRoomCompSettings,
  applyRoomCompensation,
  RealtimeBiasMatch,
  RealtimeCMN,
} from '@core/dsp/roomCompensation.js';
import {
  getDriftSettings,
  computeRefLogResidualStd,
  calibrateAdaptiveThresholds,
  RealtimeDriftDetector,
  type DriftResult,
  type RefDriftBaseline,
} from '@core/dsp/driftDetector.js';
import { assessRecordingQuality } from '@core/ml/qualityCheck.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import { logger } from '@utils/logger.js';

/** Same epsilon as 2-Reference / driftDetector for log-energy statistics. */
const LOG_EPSILON = 1e-12;

export interface TrainPipelineResult {
  /** Features to train on (cherry-picked + room-compensated, like the phone). */
  features: FeatureVector[];
  /** Quality of the recording, assessed like on the phone (post cherry-pick, pre room comp). */
  quality: QualityResult;
  /** Human-readable notes about what the pipeline did (for the protocol). */
  notes: string[];
}

/**
 * Mirror of the 2-Reference training preprocessing for ONE recording (here: one
 * hand-picked file). Reads the current settings live.
 */
export function trainPipeline(features: FeatureVector[]): TrainPipelineResult {
  const notes: string[] = [];

  // Stage 1 — Cherry-Picking (transient filter), incl. the <5-frames fallback.
  const cp = getCherryPickSettings();
  let picked = features;
  if (cp.enabled) {
    const result = cherryPickFeatures(features, cp);
    picked = result.filteredFeatures;
    notes.push(`Cherry-Picking: ${result.removedCount}/${result.totalCount} Frames verworfen (σ=${cp.sigmaThreshold})`);
    if (picked.length < 5) {
      picked = features;
      notes.push('Cherry-Picking-Fallback: zu wenige Frames übrig — alle Frames verwendet');
    }
  }

  // Quality gate input — like the phone: cherry-picked, BEFORE room comp.
  const quality = assessRecordingQuality(picked);

  // Stage 3.5 — Room Compensation. No chirp possible in file mode → no T60.
  const rc = getRoomCompSettings();
  let processed = picked;
  if (rc.enabled) {
    processed = applyRoomCompensation(picked, rc, undefined, undefined);
    const parts: string[] = [];
    if (rc.cmnEnabled) parts.push('CMN');
    if (rc.biasMatchEnabled) parts.push('Bias-Match (erst bei Prüfung wirksam)');
    if (rc.t60Enabled) parts.push('T60 übersprungen (kein Chirp im Datei-Modus)');
    notes.push(`Raumkompensation aktiv${parts.length ? `: ${parts.join(', ')}` : ''}`);
  }

  return { features: processed, quality, notes };
}

/** Reference statistics the phone stores on the Machine at reference creation. */
export interface RefStats {
  refLogMean: Float64Array;
  refLogResidualStd: Float64Array | null;
  refLogStd: Float64Array | null;
  driftBaseline: RefDriftBaseline | null;
}

/**
 * Mirror of the 2-Reference refLogMean/refLogStd/residual/baseline computation
 * (used by Bias Match and the Drift Detector during checks).
 */
export function computeRefStats(processedFeatures: FeatureVector[]): RefStats | null {
  if (processedFeatures.length === 0 || !processedFeatures[0]?.absoluteFeatures?.length) {
    return null;
  }
  const K = processedFeatures[0].absoluteFeatures.length;
  const N = processedFeatures.length;

  const refLogMean = new Float64Array(K);
  for (const fv of processedFeatures) {
    for (let k = 0; k < K; k++) refLogMean[k] += Math.log(fv.absoluteFeatures[k] + LOG_EPSILON);
  }
  for (let k = 0; k < K; k++) refLogMean[k] /= N;

  let refLogStd: Float64Array | null = null;
  if (N >= 2) {
    refLogStd = new Float64Array(K);
    for (const fv of processedFeatures) {
      for (let k = 0; k < K; k++) {
        const diff = Math.log(fv.absoluteFeatures[k] + LOG_EPSILON) - refLogMean[k];
        refLogStd[k] += diff * diff;
      }
    }
    for (let k = 0; k < K; k++) refLogStd[k] = Math.sqrt(refLogStd[k] / (N - 1));
  }

  const driftSettings = getDriftSettings();
  const refLogResidualStd = computeRefLogResidualStd(
    processedFeatures,
    refLogMean,
    driftSettings.smoothWindow
  );
  const driftBaseline = calibrateAdaptiveThresholds(processedFeatures, driftSettings);

  return {
    refLogMean,
    refLogResidualStd: refLogResidualStd ? new Float64Array(refLogResidualStd) : null,
    refLogStd,
    driftBaseline: driftBaseline ?? null,
  };
}

/** Outcome of pushing one raw frame through the live pipeline. */
export interface LiveFrameOutcome {
  /** Processed frame for scoring, or null when the cherry-pick gate rejected it. */
  feature: FeatureVector | null;
  /** Drift result for this frame (occasional; purely diagnostic). */
  drift: DriftResult | null;
}

/**
 * Per-check live pipeline, mirroring the 3-Diagnose per-frame order. Build one
 * fresh instance per Prüfung (running means/gates start clean, like a new
 * diagnosis run on the phone).
 */
export class LivePipeline {
  private readonly gate: RealtimeCherryPick | null;
  private readonly biasMatch: RealtimeBiasMatch | null;
  private readonly cmn: RealtimeCMN | null;
  private readonly drift: RealtimeDriftDetector | null;
  readonly notes: string[] = [];
  /** Frames rejected by the cherry-pick gate in this check. */
  rejected = 0;
  accepted = 0;

  constructor(refStats: RefStats | null) {
    const cp = getCherryPickSettings();
    this.gate = cp.enabled ? new RealtimeCherryPick(cp, DEFAULT_DSP_CONFIG.hopSize) : null;
    if (this.gate) this.notes.push(`Cherry-Picking-Gate aktiv (σ=${cp.sigmaThreshold})`);

    const rc = getRoomCompSettings();
    // Bias Match preferred over CMN — exactly the 3-Diagnose precedence.
    this.biasMatch =
      rc.enabled && rc.biasMatchEnabled && refStats
        ? new RealtimeBiasMatch(refStats.refLogMean)
        : null;
    this.cmn =
      rc.enabled && rc.cmnEnabled && !rc.biasMatchEnabled
        ? new RealtimeCMN(DEFAULT_DSP_CONFIG.frequencyBins)
        : null;
    if (this.biasMatch) this.notes.push('Session-Bias-Match aktiv');
    else if (this.cmn) this.notes.push('CMN aktiv');
    if (rc.enabled && rc.t60Enabled) {
      this.notes.push('T60 übersprungen (kein Chirp im Datei-Modus)');
    }

    const ds = getDriftSettings();
    this.drift =
      ds.enabled && refStats
        ? new RealtimeDriftDetector(
            refStats.refLogMean,
            ds,
            refStats.refLogResidualStd ?? refStats.refLogStd ?? undefined,
            refStats.driftBaseline ?? undefined
          )
        : null;
    if (this.drift) this.notes.push('Drift-Detector aktiv');
    if (ds.enabled && !refStats) {
      this.notes.push('Drift-Detector übersprungen (keine Referenz-Statistik)');
      logger.debug('Mess-Labor: Drift aktiviert, aber refStats fehlen');
    }
  }

  /** Push one RAW frame through gate → drift(raw) → bias-match/CMN. */
  process(raw: FeatureVector): LiveFrameOutcome {
    if (this.gate && !this.gate.processFrame(raw)) {
      this.rejected++;
      return { feature: null, drift: null };
    }
    this.accepted++;
    // Drift sees the RAW (pre room comp) accepted frame — like 3-Diagnose step 9.
    const drift =
      this.drift && raw.absoluteFeatures ? this.drift.processFrame(raw.absoluteFeatures) : null;

    let fv = raw;
    if (this.biasMatch) fv = this.biasMatch.processFrame(fv);
    else if (this.cmn) fv = this.cmn.process(fv);
    return { feature: fv, drift };
  }
}

/**
 * One-line summary of every settings-driven option the simulation honours —
 * read live so the UI always shows what the NEXT action would use.
 */
export function pipelineSummary(): string {
  const cp = getCherryPickSettings();
  const rc = getRoomCompSettings();
  const ds = getDriftSettings();
  const rec = getRecordingSettings();
  const stages: string[] = [];
  if (cp.enabled) stages.push(`Cherry-Picking (σ${cp.sigmaThreshold})`);
  if (rc.enabled) {
    const sub: string[] = [];
    if (rc.biasMatchEnabled) sub.push('Bias-Match');
    else if (rc.cmnEnabled) sub.push('CMN');
    if (rc.t60Enabled) sub.push('T60: im Datei-Modus n. verf.');
    stages.push(`Raumkomp.${sub.length ? ` (${sub.join(', ')})` : ''}`);
  }
  if (ds.enabled) stages.push('Drift-Detector');
  const stagesText = stages.length ? stages.join(' · ') : 'keine Zusatzstufen';
  return `Schwellen ${rec.confidenceThreshold}/${rec.faultyThreshold} % · ${stagesText}`;
}
