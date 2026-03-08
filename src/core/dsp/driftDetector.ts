/**
 * ZANOBOT - DRIFT DETECTOR V2 (Global Drift + Local Residual Index)
 *
 * Separates spectral changes into two components:
 * - Global Drift: Smooth, broadband changes (room/environment/microphone position)
 * - Local Residual: Narrowband structural changes (machine condition)
 *
 * Physical model:
 *   Y(f) = S(f) · H(f)  →  log Y(f) = log S(f) + log H(f)
 *   S(f) = machine signal, H(f) = room transfer function
 *
 * V2 improvements over V1:
 * - "Diff first, then smooth" instead of smoothing separately → exact additive decomposition
 * - Low-frequency masking: Bins below cutoff ignored for D_local (room mode protection)
 * - Adaptive thresholds via reference partition calibration (median + MAD)
 * - Residual-variance normalization (refLogResidualStd) for machine-independent D_local
 * - RefDriftBaseline interface for calibrated threshold persistence
 *
 * IMPORTANT: This is purely diagnostic. It does NOT modify features, scores, or GMIA training.
 */

import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

// ════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════

const LOG_EPSILON = 1e-12;

/** Moving-Average window width (bins). 32 bins ≈ 1.5 kHz smoothing. */
const DEFAULT_SMOOTH_WINDOW = 32;

/** Default thresholds (configurable via Settings) */
export const DEFAULT_DRIFT_SETTINGS: DriftDetectorSettings = {
  enabled: false, // Default OFF – activated via Settings
  smoothWindow: DEFAULT_SMOOTH_WINDOW,
  lowFreqCutoffBin: 3, // Bins 0-2 ignored for D_local (≈ 140 Hz at 512 bins / 48 kHz)
  globalWarning: 0.3,
  globalCritical: 0.6,
  localWarning: 0.15,
  localCritical: 0.30,
  useAdaptiveThresholds: true, // Prefer calibrated thresholds when available
  hasManualOverride: false, // True when user has explicitly adjusted threshold sliders
};

// ════════════════════════════════════════════════════════════
// Interfaces
// ════════════════════════════════════════════════════════════

export interface DriftDetectorSettings {
  enabled: boolean;
  smoothWindow: number; // Moving-Average window width (bins)
  lowFreqCutoffBin: number; // Bins below this are ignored for D_local (room mode protection)
  globalWarning: number; // D_global → warning threshold (fallback/manual)
  globalCritical: number; // D_global → critical threshold (fallback/manual)
  localWarning: number; // D_local → warning threshold (fallback/manual)
  localCritical: number; // D_local → critical threshold (fallback/manual)
  useAdaptiveThresholds: boolean; // When true AND refDriftBaseline present → adaptive thresholds
  hasManualOverride: boolean; // True when user has explicitly adjusted threshold sliders
}

/** Calibrated baseline from reference partitions */
export interface RefDriftBaseline {
  globalMedian: number;
  globalMAD: number;
  localMedian: number;
  localMAD: number;
  adaptiveGlobalWarning: number;
  adaptiveGlobalCritical: number;
  adaptiveLocalWarning: number;
  adaptiveLocalCritical: number;
}

export interface DriftResult {
  globalDrift: number; // D_global (0 = identical, higher = more room drift)
  localDrift: number; // D_local  (0 = identical, higher = more machine change)
  localDriftNormalized: number | null; // D_local / σ_residual_mean (machine-independent, null if no σ)

  globalSeverity: 'ok' | 'warning' | 'critical';
  localSeverity: 'ok' | 'warning' | 'critical';

  interpretation:
    | 'all_ok'
    | 'room_change'
    | 'machine_change'
    | 'both'
    | 'uncertain';

  // Human-readable messages (localized)
  globalMessage: string;
  localMessage: string;
  overallMessage: string;
  recommendation: string;

  // Actual thresholds used for severity classification (for correct UI scaling)
  globalCriticalUsed: number;
  localCriticalUsed: number;

  // Debug data (for Expert-View)
  diff: Float64Array; // µ_meas - µ_ref (raw difference)
  smoothDiff: Float64Array; // Smoothed difference (≈ environment)
  localDiff: Float64Array; // Fine structure of difference (≈ machine)
  thresholdsUsed: 'adaptive' | 'manual' | 'fallback'; // Which thresholds are active
}

// ════════════════════════════════════════════════════════════
// Settings Persistence
// ════════════════════════════════════════════════════════════

const STORAGE_KEY = 'zanobot-drift-detector-settings';

export function getDriftSettings(): DriftDetectorSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_DRIFT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    logger.warn('Drift-Settings Load Error:', e);
  }
  return { ...DEFAULT_DRIFT_SETTINGS };
}

export function setDriftSettings(
  partial: Partial<DriftDetectorSettings>
): void {
  const current = getDriftSettings();
  const updated = { ...current, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    logger.warn('Drift-Settings Save Error:', e);
  }
}

// ════════════════════════════════════════════════════════════
// Core Algorithm
// ════════════════════════════════════════════════════════════

/**
 * Moving Average smoothing of a spectrum.
 * Extracts the "smooth" part (broadband drift).
 *
 * @param spectrum - Spectrum (512 bins)
 * @param windowSize - Window width (default: 32 bins)
 * @returns Smoothed spectrum (same length)
 */
export function smoothSpectrum(
  spectrum: Float64Array,
  windowSize: number
): Float64Array {
  const K = spectrum.length;
  const result = new Float64Array(K);
  const halfW = Math.floor(windowSize / 2);

  for (let k = 0; k < K; k++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, k - halfW);
    const end = Math.min(K - 1, k + halfW);
    for (let j = start; j <= end; j++) {
      sum += spectrum[j];
      count++;
    }
    result[k] = sum / count;
  }

  return result;
}

/**
 * Compute drift index between reference and measurement.
 *
 * V2: "Diff first, then smooth" – D_global + D_local explain the total
 * difference exactly additively. Only one smoothing pass instead of two.
 *
 * @param muRef - Log-spectral mean of reference (512 bins)
 * @param muMeas - Log-spectral mean of current measurement (512 bins)
 * @param settings - Thresholds and configuration
 * @param sigmaRef - Optional: Residual standard deviation of reference (512 bins).
 *   Preferred: refLogResidualStd (fine structure variance). Fallback: refLogStd.
 *   If present, D_local is normalized → machine-independent thresholds.
 * @param baseline - Optional: Calibrated baseline from reference partitions
 * @returns DriftResult with both indices, interpretation and messages
 */
export function computeDrift(
  muRef: Float64Array,
  muMeas: Float64Array,
  settings: DriftDetectorSettings,
  sigmaRef?: Float64Array,
  baseline?: RefDriftBaseline
): DriftResult {
  const K = muRef.length;

  // ── Clamp settings (protect against corrupt localStorage values) ──
  const lowCut = Math.max(0, Math.min(settings.lowFreqCutoffBin, K - 1));
  const smoothWindow = Math.max(1, Math.min(settings.smoothWindow, K));

  // ── Step 1: Compute difference first (V2 improvement) ──
  const diff = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    diff[k] = muMeas[k] - muRef[k];
  }

  // ── Step 2: Smooth → Global Drift Index ────────────────
  const smoothDiff = smoothSpectrum(diff, smoothWindow);
  let globalSum = 0;
  for (let k = 0; k < K; k++) {
    globalSum += Math.abs(smoothDiff[k]);
  }
  const globalDrift = globalSum / K;

  // ── Step 3: Residual → Local Drift Index ────────────────
  // Low-Freq Masking: Bins < lowCut ignored (room mode protection)
  const localDiff = new Float64Array(K);
  let localSum = 0;
  const effectiveBins = K - lowCut;

  for (let k = 0; k < K; k++) {
    localDiff[k] = diff[k] - smoothDiff[k];
    if (k >= lowCut) {
      localSum += Math.abs(localDiff[k]);
    }
  }
  const localDrift = effectiveBins > 0 ? localSum / effectiveBins : 0;

  // ── Step 3b: σ-normalization (residual variance, V2) ──
  let localDriftNormalized: number | null = null;
  if (sigmaRef && sigmaRef.length === K) {
    let sigmaSum = 0;
    for (let k = lowCut; k < K; k++) sigmaSum += sigmaRef[k];
    const sigmaMean = effectiveBins > 0 ? sigmaSum / effectiveBins : 0;
    if (sigmaMean > LOG_EPSILON) {
      localDriftNormalized = localDrift / sigmaMean;
    }
  }

  // ── Step 4: Determine thresholds (V2: adaptive support) ──
  // Priority: 1. Adaptive (calibrated) 2. Manual (user-adjusted sliders) 3. Fallback (defaults)
  let gWarn: number, gCrit: number, lWarn: number, lCrit: number;
  let thresholdsUsed: 'adaptive' | 'manual' | 'fallback';

  if (settings.useAdaptiveThresholds && baseline && !settings.hasManualOverride) {
    gWarn = baseline.adaptiveGlobalWarning;
    gCrit = baseline.adaptiveGlobalCritical;
    lWarn = baseline.adaptiveLocalWarning;
    lCrit = baseline.adaptiveLocalCritical;
    thresholdsUsed = 'adaptive';
  } else {
    gWarn = settings.globalWarning;
    gCrit = settings.globalCritical;
    lWarn = settings.localWarning;
    lCrit = settings.localCritical;
    thresholdsUsed = settings.hasManualOverride ? 'manual' : 'fallback';
  }

  const localForSeverity = localDriftNormalized ?? localDrift;

  // ── Step 5: Severity + Interpretation ──────────────────
  const globalSeverity = classifySeverity(globalDrift, gWarn, gCrit);
  const localSeverity = classifySeverity(localForSeverity, lWarn, lCrit);
  const interpretation = interpretDrift(globalSeverity, localSeverity);

  // ── Step 6: Human-readable messages ──────────────────────
  const {
    globalMessage,
    localMessage,
    overallMessage,
    recommendation,
  } = generateDriftMessages(globalSeverity, localSeverity, interpretation);

  return {
    globalDrift,
    localDrift,
    localDriftNormalized,
    globalSeverity,
    localSeverity,
    interpretation,
    globalMessage,
    localMessage,
    overallMessage,
    recommendation,
    globalCriticalUsed: gCrit,
    localCriticalUsed: lCrit,
    diff,
    smoothDiff,
    localDiff,
    thresholdsUsed,
  };
}

// ════════════════════════════════════════════════════════════
// Adaptive Threshold Calibration
// ════════════════════════════════════════════════════════════

/**
 * Calibrate adaptive thresholds from reference partitions.
 * Splits reference features into P partitions, computes drift between all pairs,
 * then derives thresholds from median + MAD of baseline drift values.
 *
 * @param processedFeatures - All reference feature vectors (must have absoluteFeatures)
 * @param settings - Drift detector settings (for smoothWindow, lowFreqCutoffBin)
 * @param P - Number of partitions (default: 4, yields 6 pairs)
 * @param minFramesPerPartition - Minimum frames per partition (default: 5)
 * @returns RefDriftBaseline or null if not enough frames
 */
export function calibrateAdaptiveThresholds(
  processedFeatures: Array<{ absoluteFeatures: Float64Array }>,
  settings: DriftDetectorSettings,
  P: number = 4,
  minFramesPerPartition: number = 5
): RefDriftBaseline | null {
  const N = processedFeatures.length;
  if (N < P * minFramesPerPartition) {
    return null;
  }

  const K = processedFeatures[0].absoluteFeatures.length;
  const partitionSize = Math.floor(N / P);

  // Compute partition means
  const partitionMeans: Float64Array[] = [];
  for (let p = 0; p < P; p++) {
    const mu = new Float64Array(K);
    const start = p * partitionSize;
    const end = p === P - 1 ? N : (p + 1) * partitionSize;
    const count = end - start;
    for (let i = start; i < end; i++) {
      for (let k = 0; k < K; k++) {
        mu[k] += Math.log(processedFeatures[i].absoluteFeatures[k] + LOG_EPSILON);
      }
    }
    for (let k = 0; k < K; k++) mu[k] /= count;
    partitionMeans.push(mu);
  }

  // Drift between all partition pairs
  const baselineGlobal: number[] = [];
  const baselineLocal: number[] = [];
  for (let i = 0; i < P; i++) {
    for (let j = i + 1; j < P; j++) {
      const result = computeDrift(partitionMeans[i], partitionMeans[j], settings);
      baselineGlobal.push(result.globalDrift);
      baselineLocal.push(result.localDrift);
    }
  }

  // Robust statistics: Median + MAD
  const gMedian = median(baselineGlobal);
  const gMAD = mad(baselineGlobal);
  const lMedian = median(baselineLocal);
  const lMAD = mad(baselineLocal);

  return {
    globalMedian: gMedian,
    globalMAD: gMAD,
    localMedian: lMedian,
    localMAD: lMAD,
    adaptiveGlobalWarning: Math.max(gMedian + 3 * gMAD, 0.05),
    adaptiveGlobalCritical: Math.max(gMedian + 6 * gMAD, 0.10),
    adaptiveLocalWarning: Math.max(lMedian + 3 * lMAD, 0.03),
    adaptiveLocalCritical: Math.max(lMedian + 6 * lMAD, 0.06),
  };
}

/**
 * Compute residual standard deviation of reference features.
 * Measures variance of the FINE STRUCTURE (not overall spectrum).
 * For each frame: residual = frame log-value minus smoothed reference mean.
 *
 * @param processedFeatures - All reference feature vectors
 * @param refLogMean - Already-computed log-spectral mean (512 bins)
 * @param smoothWindow - Smoothing window width
 * @returns Float64Array of residual std per bin, or null if too few frames
 */
export function computeRefLogResidualStd(
  processedFeatures: Array<{ absoluteFeatures: Float64Array }>,
  refLogMean: Float64Array,
  smoothWindow: number
): Float64Array | null {
  const N = processedFeatures.length;
  if (N < 2) return null;

  const K = refLogMean.length;
  const smoothedRefMean = smoothSpectrum(refLogMean, smoothWindow);

  const refLogResidualStd = new Float64Array(K);
  for (const fv of processedFeatures) {
    for (let k = 0; k < K; k++) {
      const logVal = Math.log(fv.absoluteFeatures[k] + LOG_EPSILON);
      const residual = logVal - smoothedRefMean[k];
      refLogResidualStd[k] += residual * residual;
    }
  }
  for (let k = 0; k < K; k++) {
    refLogResidualStd[k] = Math.sqrt(refLogResidualStd[k] / (N - 1)); // Bessel correction
  }

  return refLogResidualStd;
}

// ════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════

function classifySeverity(
  value: number,
  warningThreshold: number,
  criticalThreshold: number
): 'ok' | 'warning' | 'critical' {
  if (value >= criticalThreshold) return 'critical';
  if (value >= warningThreshold) return 'warning';
  return 'ok';
}

function interpretDrift(
  globalSev: 'ok' | 'warning' | 'critical',
  localSev: 'ok' | 'warning' | 'critical'
): 'all_ok' | 'room_change' | 'machine_change' | 'both' | 'uncertain' {
  const gOk = globalSev === 'ok';
  const lOk = localSev === 'ok';

  if (gOk && lOk) return 'all_ok';
  if (!gOk && lOk) return 'room_change';
  if (gOk && !lOk) return 'machine_change';
  // Both not ok
  if (globalSev === 'critical' && localSev === 'critical') return 'both';
  return 'uncertain';
}

function generateDriftMessages(
  globalSev: 'ok' | 'warning' | 'critical',
  localSev: 'ok' | 'warning' | 'critical',
  interpretation: string
): {
  globalMessage: string;
  localMessage: string;
  overallMessage: string;
  recommendation: string;
} {
  // Global message
  let globalMessage: string;
  switch (globalSev) {
    case 'ok':
      globalMessage = t('drift.globalOk');
      break;
    case 'warning':
      globalMessage = t('drift.globalWarning');
      break;
    case 'critical':
      globalMessage = t('drift.globalCritical');
      break;
  }

  // Local message
  let localMessage: string;
  switch (localSev) {
    case 'ok':
      localMessage = t('drift.localOk');
      break;
    case 'warning':
      localMessage = t('drift.localWarning');
      break;
    case 'critical':
      localMessage = t('drift.localCritical');
      break;
  }

  // Overall message + recommendation
  let overallMessage: string;
  let recommendation: string;

  switch (interpretation) {
    case 'all_ok':
      overallMessage = t('drift.allOk');
      recommendation = '';
      break;
    case 'room_change':
      overallMessage = t('drift.roomChange');
      recommendation = t('drift.recommendRoom');
      break;
    case 'machine_change':
      overallMessage = t('drift.machineChange');
      recommendation = t('drift.recommendMachine');
      break;
    case 'both':
      overallMessage = t('drift.both');
      recommendation = t('drift.recommendBoth');
      break;
    default:
      overallMessage = t('drift.uncertain');
      recommendation = t('drift.recommendUncertain');
  }

  return { globalMessage, localMessage, overallMessage, recommendation };
}

/**
 * Compute Hz per ESD bin from DSP parameters.
 * Formula: (sampleRate / 2) / frequencyBins = Nyquist / numBins
 *
 * @param sampleRate - Audio sample rate in Hz (default: 48000)
 * @param frequencyBins - Number of ESD frequency bins (default: 512)
 * @returns Hz per bin
 */
export function getHzPerBin(sampleRate: number = 48000, frequencyBins: number = 512): number {
  return (sampleRate / 2) / frequencyBins;
}

/** Compute median of a numeric array */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Compute MAD (Median Absolute Deviation) scaled to σ-estimate */
export function mad(arr: number[]): number {
  const med = median(arr);
  const deviations = arr.map(v => Math.abs(v - med));
  return median(deviations) * 1.4826; // MAD → σ estimator
}

// ════════════════════════════════════════════════════════════
// Realtime Variant for Live Diagnosis
// ════════════════════════════════════════════════════════════

/** Minimum RMS level (linear) below which drift is not computed.
 *  Prevents false alarms with very quiet machines or silence.
 *  Approximately -72 dBFS. */
const MIN_RMS_FOR_DRIFT = 0.00025;

/** First N frames are ignored (AGC settling, microphone warmup).
 *  Frames are counted but NOT fed into the Welford mean. */
const SKIP_INITIAL_FRAMES = 5;

/** Minimum accumulated frames (after skip) before drift is computed. */
const MIN_ACCUMULATED_FRAMES = 15;

/**
 * Builds the measurement mean incrementally and computes
 * drift index periodically (not per frame – too expensive for UI).
 */
export class RealtimeDriftDetector {
  private readonly muRef: Float64Array;
  private readonly sigmaRef: Float64Array | null;
  private readonly baseline: RefDriftBaseline | null;
  private muMeas: Float64Array;
  private totalFrameCount: number = 0; // All frames (incl. skipped)
  private accumulatedFrames: number = 0; // Frames in Welford mean
  private readonly K: number;
  private settings: DriftDetectorSettings;
  private lastResult: DriftResult | null = null;
  private lowSnrCount: number = 0; // Consecutive low-SNR frames

  /** Drift is recomputed every N frames */
  private readonly updateInterval: number = 10; // Every ~660ms at 66ms hop

  /**
   * @param refLogMean - Log-spectral mean of reference (512 bins)
   * @param settings - Drift detector settings
   * @param refLogStd - Optional: Residual standard deviation of reference (512 bins).
   *   Preferred: refLogResidualStd. Fallback: refLogStd (overall σ).
   * @param baseline - Optional: Calibrated thresholds from reference partitions
   */
  constructor(
    refLogMean: Float64Array,
    settings: DriftDetectorSettings,
    refLogStd?: Float64Array,
    baseline?: RefDriftBaseline
  ) {
    this.K = refLogMean.length;
    this.muRef = refLogMean;
    this.sigmaRef = refLogStd ?? null;
    this.baseline = baseline ?? null;
    this.muMeas = new Float64Array(this.K);
    this.settings = settings;
  }

  /**
   * Feed a new measurement frame.
   * Returns DriftResult when an update is due, otherwise null.
   */
  processFrame(absoluteFeatures: Float64Array): DriftResult | null {
    this.totalFrameCount++;

    // SNR Guard: At very low signals, residuals become unstable → false alarms.
    let rmsSum = 0;
    for (let k = 0; k < this.K; k++)
      rmsSum += absoluteFeatures[k] * absoluteFeatures[k];
    const rms = Math.sqrt(rmsSum / this.K);

    if (rms < MIN_RMS_FOR_DRIFT) {
      this.lowSnrCount++;
      // After 30 consecutive low-SNR frames: keep last result
      if (this.lowSnrCount > 30 && this.lastResult) {
        return this.lastResult;
      }
      return null; // Ignore frame, no update
    }
    this.lowSnrCount = 0;

    // Skip first frames (AGC settling, microphone warmup)
    if (this.totalFrameCount <= SKIP_INITIAL_FRAMES) {
      return null; // Don't include in mean
    }

    // Running Mean Update (Welford)
    this.accumulatedFrames++;
    for (let k = 0; k < this.K; k++) {
      const logVal = Math.log(absoluteFeatures[k] + LOG_EPSILON);
      this.muMeas[k] += (logVal - this.muMeas[k]) / this.accumulatedFrames;
    }

    // Need enough frames for stable mean
    if (this.accumulatedFrames < MIN_ACCUMULATED_FRAMES) return null;

    // Only update every N frames (performance)
    // Return null on non-update frames to prevent unnecessary DOM updates
    if (this.accumulatedFrames % this.updateInterval !== 0)
      return null;

    this.lastResult = computeDrift(
      this.muRef,
      this.muMeas,
      this.settings,
      this.sigmaRef ?? undefined,
      this.baseline ?? undefined
    );
    return this.lastResult;
  }

  get currentResult(): DriftResult | null {
    return this.lastResult;
  }

  get isReady(): boolean {
    return this.accumulatedFrames >= MIN_ACCUMULATED_FRAMES;
  }

  get statusText(): string {
    if (this.totalFrameCount <= SKIP_INITIAL_FRAMES) {
      return `initializing (${this.totalFrameCount}/${SKIP_INITIAL_FRAMES})`;
    }
    if (this.accumulatedFrames < MIN_ACCUMULATED_FRAMES) {
      return `warming up (${this.accumulatedFrames}/${MIN_ACCUMULATED_FRAMES})`;
    }
    if (this.lowSnrCount > 10) return 'low signal';
    return 'active';
  }

  reset(): void {
    this.totalFrameCount = 0;
    this.accumulatedFrames = 0;
    this.lowSnrCount = 0;
    this.muMeas.fill(0);
    this.lastResult = null;
  }
}
