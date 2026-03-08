/**
 * ZANOBOT - OPERATING POINT METRICS
 *
 * Parallel metrics for the Expert Mode "Betriebspunkt-Monitor".
 * These metrics provide transparency about operating conditions
 * WITHOUT modifying the existing DSP pipeline, GMIA, or scoring.
 *
 * All metrics are purely informational context data that complement
 * the existing Similarity Score.
 *
 * ARCHITECTURE: Reads from the same data the existing pipeline produces.
 * No additional DSP pass, no changes to features.ts, gmia.ts, or scoring.ts.
 *
 * BASELINE STRATEGY:
 * The reference baseline is NOT captured from the first chunk.
 * Instead, a warmup buffer collects initial frames and only commits the
 * baseline once the signal is stable (frame-to-frame cosine > threshold
 * for a minimum number of consecutive frames). This prevents false
 * baselines from microphone settling, user movement, or transient loads.
 *
 * METRICS:
 *  A. RMS-Delta (Energy Check) — dB difference to baseline RMS
 *  B. Multi-Peak Frequency Shift — median shift of tracked dominant peaks
 *  C. P10-Similarity (Stability Check) — 10th percentile of rolling scores
 *  D. Signal Stability — percentage of stable frame transitions
 */

import { logger } from '@utils/logger.js';

/**
 * Ampel status for a single metric
 */
export type TrafficLight = 'green' | 'yellow' | 'red';

/**
 * Single operating point metric result
 */
export interface OperatingPointMetric {
  /** Metric value (number for display) */
  value: number;
  /** Formatted display string (e.g. "+2.8 dB", "93%", "+12 Hz") */
  displayValue: string;
  /** Traffic light status */
  status: TrafficLight;
  /** Short label (2-3 words) */
  shortLabel: string;
  /** One-sentence explanation */
  description: string;
  /** Dynamic warning text (only set when status is yellow or red) */
  warningText?: string;
}

/**
 * Complete operating point monitor result
 */
export interface OperatingPointResult {
  /** Similarity P10 - short-term minimum */
  similarityP10: OperatingPointMetric;
  /** Energy delta - RMS difference to reference in dB */
  energyDelta: OperatingPointMetric;
  /** Frequency delta - multi-peak tracking shift (median of dominant peaks) */
  frequencyDelta: OperatingPointMetric;
  /** Signal stability - percentage of stable frames */
  stability: OperatingPointMetric;
  /** Whether operating point has changed significantly */
  operatingPointChanged: boolean;
  /** Whether the baseline is still being captured (warmup phase) */
  isInitializing: boolean;
}

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Rolling window size for stability calculation */
const STABILITY_WINDOW = 10;

/** EMA smoothing factor for energy delta */
const ENERGY_SMOOTHING_ALPHA = 0.3;

/** Number of strongest peaks to track for multi-peak frequency shift */
const NUM_TRACKED_PEAKS = 5;

/** Minimum peak prominence (relative to strongest peak) */
const MIN_PEAK_PROMINENCE = 0.1;

/** Maximum search width for peak matching (in bins) */
const PEAK_MATCH_MAX_DISTANCE = 20;

/** EMA smoothing factor for frequency shift */
const FREQ_SHIFT_SMOOTHING_ALPHA = 0.2;

/** Band limits for dominant peak search (Hz) */
const PEAK_BAND_MIN_HZ = 50;
const PEAK_BAND_MAX_HZ = 8000;

// Warmup / baseline capture ------------------------------------------------

/** Minimum warmup frames before baseline can be committed */
const WARMUP_MIN_FRAMES = 8;

/** Maximum warmup frames — force-commit baseline after this many frames */
const WARMUP_MAX_FRAMES = 30;

/**
 * Minimum consecutive stable frames required to commit baseline.
 * "Stable" means frame-to-frame cosine similarity > WARMUP_STABILITY_THRESHOLD.
 */
const WARMUP_STABLE_STREAK_REQUIRED = 5;

/** Cosine similarity threshold for a frame pair to count as "stable" during warmup */
const WARMUP_STABILITY_THRESHOLD = 0.92;

// Thresholds ------------------------------------------------------------------

const ENERGY_THRESHOLD_GREEN = 3; // dB (spec: ±3 dB)
const ENERGY_THRESHOLD_YELLOW = 6; // dB

const FREQ_THRESHOLD_GREEN_HZ = 5; // Hz (spec: ±5 Hz)
const FREQ_THRESHOLD_GREEN_PCT = 5; // % (spec: or > 5%)
const FREQ_THRESHOLD_YELLOW_HZ = 15; // Hz
const FREQ_THRESHOLD_YELLOW_PCT = 15; // %

const STABILITY_THRESHOLD_GREEN = 85; // %
const STABILITY_THRESHOLD_YELLOW = 60; // %

const P10_THRESHOLD_GREEN = 90; // %
const P10_THRESHOLD_YELLOW = 75; // %

/** P10 is considered "unstable" when avg - p10 exceeds this threshold */
const P10_INSTABILITY_THRESHOLD = 15; // percentage points

/**
 * Operating Point Metrics Calculator
 *
 * Instantiated once per diagnosis session.
 * Call `update()` with each new chunk's data, then read `getResult()`.
 *
 * Lifecycle:
 *  1. Warmup phase — collects frames, checks stability
 *  2. Baseline commit — when stable streak reached (or max frames exceeded)
 *  3. Live phase — normal metric computation against the committed baseline
 */
export class OperatingPointMetrics {
  // Reference baselines (set once after warmup)
  private referenceRms: number = 0;
  private referencePeaks: { bin: number; freq: number; amplitude: number }[] = [];
  private hasReference: boolean = false;

  // DSP config
  private sampleRate: number;
  private fftSize: number;
  private frequencyBins: number;

  // Warmup state
  private warmupFrameCount: number = 0;
  private warmupRmsBuffer: number[] = [];
  private warmupLastFeatures: Float64Array | null = null;
  private warmupStableStreak: number = 0;
  private warmupPreviousFeatures: Float64Array | null = null;

  // Smoothed live values
  private smoothedEnergyDeltaDb: number = 0;
  private smoothedFrequencyShiftPercent: number = 0;
  private isFirstUpdate: boolean = true;

  // Rolling frame buffer for stability
  private previousFeatures: Float64Array | null = null;
  private frameSimilarities: number[] = [];

  // Latest result (cached)
  private lastResult: OperatingPointResult | null = null;

  constructor(sampleRate: number, fftSize: number = 2048, frequencyBins: number = 512) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.frequencyBins = frequencyBins;
  }

  /**
   * Whether the monitor is still in the warmup/initialization phase.
   */
  public get isInitializing(): boolean {
    return !this.hasReference;
  }

  /**
   * Update metrics with a new chunk's data.
   *
   * @param features      - Normalised feature vector (512 bins, sum ~ 1)
   * @param rmsAmplitude  - RMS amplitude BEFORE standardisation
   * @param scoreHistory  - Current score history array (raw scores)
   */
  public update(
    features: Float64Array,
    rmsAmplitude: number,
    scoreHistory: number[]
  ): void {
    // Skip completely silent chunks
    if (rmsAmplitude < 1e-8) return;

    // -----------------------------------------------------------------------
    // WARMUP PHASE: Collect frames and wait for stable signal
    // -----------------------------------------------------------------------
    if (!this.hasReference) {
      this.warmupFrameCount++;

      // Track RMS for median calculation; save features for peak extraction at commit
      this.warmupRmsBuffer.push(rmsAmplitude);
      this.warmupLastFeatures = new Float64Array(features);

      // Check frame-to-frame stability
      if (this.warmupPreviousFeatures) {
        const sim = this.cosineSim(this.warmupPreviousFeatures, features);
        if (sim >= WARMUP_STABILITY_THRESHOLD) {
          this.warmupStableStreak++;
        } else {
          this.warmupStableStreak = 0; // Reset streak on unstable transition
        }
      }
      this.warmupPreviousFeatures = new Float64Array(features);

      // Also track frame similarities for stability metric (carried over after warmup)
      if (this.previousFeatures) {
        const sim = this.cosineSim(this.previousFeatures, features);
        this.frameSimilarities.push(sim);
        if (this.frameSimilarities.length > STABILITY_WINDOW) {
          this.frameSimilarities.shift();
        }
      }
      this.previousFeatures = new Float64Array(features);

      // Decide whether to commit baseline
      const hasEnoughFrames = this.warmupFrameCount >= WARMUP_MIN_FRAMES;
      const isStable = this.warmupStableStreak >= WARMUP_STABLE_STREAK_REQUIRED;
      const forceCommit = this.warmupFrameCount >= WARMUP_MAX_FRAMES;

      if (hasEnoughFrames && (isStable || forceCommit)) {
        this.commitBaseline(forceCommit);
      }

      // During warmup, emit a result with isInitializing = true
      this.lastResult = this.buildWarmupResult(scoreHistory);
      return;
    }

    // -----------------------------------------------------------------------
    // LIVE PHASE: Normal metric computation
    // -----------------------------------------------------------------------

    // --- 1. Energy Delta (dB) ---
    const rawDeltaDb = this.calculateEnergyDeltaDb(rmsAmplitude);
    if (this.isFirstUpdate) {
      this.smoothedEnergyDeltaDb = rawDeltaDb;
    } else {
      this.smoothedEnergyDeltaDb =
        ENERGY_SMOOTHING_ALPHA * rawDeltaDb +
        (1 - ENERGY_SMOOTHING_ALPHA) * this.smoothedEnergyDeltaDb;
    }

    // --- 2. Multi-Peak Frequency Shift ---
    const rawShift = this.calculateMultiPeakShift(features);
    if (this.isFirstUpdate) {
      this.smoothedFrequencyShiftPercent = rawShift;
    } else {
      this.smoothedFrequencyShiftPercent =
        FREQ_SHIFT_SMOOTHING_ALPHA * rawShift +
        (1 - FREQ_SHIFT_SMOOTHING_ALPHA) * this.smoothedFrequencyShiftPercent;
    }

    // --- 3. Stability (frame-to-frame cosine) ---
    if (this.previousFeatures) {
      const sim = this.cosineSim(this.previousFeatures, features);
      this.frameSimilarities.push(sim);
      if (this.frameSimilarities.length > STABILITY_WINDOW) {
        this.frameSimilarities.shift();
      }
    }
    this.previousFeatures = new Float64Array(features);

    this.isFirstUpdate = false;
    this.lastResult = this.buildResult(scoreHistory);
  }

  /**
   * Get the latest computed metrics.
   */
  public getResult(): OperatingPointResult | null {
    return this.lastResult;
  }

  /**
   * Reset all state (call when diagnosis stops).
   */
  public reset(): void {
    this.hasReference = false;
    this.referenceRms = 0;
    this.referencePeaks = [];
    this.smoothedEnergyDeltaDb = 0;
    this.smoothedFrequencyShiftPercent = 0;
    this.isFirstUpdate = true;
    this.previousFeatures = null;
    this.frameSimilarities = [];
    this.lastResult = null;

    // Reset warmup state
    this.warmupFrameCount = 0;
    this.warmupRmsBuffer = [];
    this.warmupLastFeatures = null;
    this.warmupStableStreak = 0;
    this.warmupPreviousFeatures = null;
  }

  // ---------------------------------------------------------------------------
  // Warmup / Baseline
  // ---------------------------------------------------------------------------

  /**
   * Commit the baseline from the warmup buffer.
   * Uses median values for robustness against outliers.
   */
  private commitBaseline(forced: boolean): void {
    this.referenceRms = this.median(this.warmupRmsBuffer);
    this.referencePeaks = this.warmupLastFeatures
      ? this.findDominantPeaks(this.warmupLastFeatures)
      : [];
    this.hasReference = true;

    // Initialise smoothed values to baseline
    this.smoothedFrequencyShiftPercent = 0;
    this.smoothedEnergyDeltaDb = 0;
    this.isFirstUpdate = false;

    const method = forced ? 'FORCED (max frames reached)' : 'STABLE';
    logger.debug(
      `[OpPoint] Baseline committed (${method}): ` +
      `RMS=${this.referenceRms.toFixed(6)}, ` +
      `peaks=[${this.referencePeaks.map(p => p.freq.toFixed(0) + 'Hz').join(', ')}], ` +
      `frames=${this.warmupFrameCount}, ` +
      `stableStreak=${this.warmupStableStreak}`
    );

    // Free warmup buffers
    this.warmupRmsBuffer = [];
    this.warmupLastFeatures = null;
    this.warmupPreviousFeatures = null;
  }

  /**
   * Build a result during the warmup phase.
   * Shows placeholder values and signals isInitializing = true.
   */
  private buildWarmupResult(scoreHistory: number[]): OperatingPointResult {
    const p10 = this.calculateP10(scoreHistory);
    const stabilityPercent = this.calculateStabilityPercent();

    return {
      similarityP10: {
        value: p10,
        displayValue: `${p10.toFixed(0)}%`,
        status: p10 > P10_THRESHOLD_GREEN ? 'green' : p10 >= P10_THRESHOLD_YELLOW ? 'yellow' : 'red',
        shortLabel: 'similarityP10.shortLabel',
        description: 'similarityP10.description',
      },
      energyDelta: {
        value: 0,
        displayValue: '-- dB',
        status: 'green',
        shortLabel: 'energyDelta.shortLabel',
        description: 'energyDelta.description',
      },
      frequencyDelta: {
        value: 0,
        displayValue: '-- Hz',
        status: 'green',
        shortLabel: 'frequencyDelta.shortLabel',
        description: 'frequencyDelta.description',
      },
      stability: {
        value: stabilityPercent,
        displayValue: `${stabilityPercent.toFixed(0)}%`,
        status:
          stabilityPercent >= STABILITY_THRESHOLD_GREEN
            ? 'green'
            : stabilityPercent >= STABILITY_THRESHOLD_YELLOW
              ? 'yellow'
              : 'red',
        shortLabel: 'stability.shortLabel',
        description: 'stability.description',
      },
      operatingPointChanged: false,
      isInitializing: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal calculations
  // ---------------------------------------------------------------------------

  private buildResult(scoreHistory: number[]): OperatingPointResult {
    const p10 = this.calculateP10(scoreHistory);
    const energyDb = this.smoothedEnergyDeltaDb;
    const freqDeltaHz = this.calculateFrequencyDeltaHz();
    const freqDeltaPercent = this.calculateFrequencyDeltaPercent();
    const stabilityPercent = this.calculateStabilityPercent();

    const energyAbs = Math.abs(energyDb);
    const freqAbsHz = Math.abs(freqDeltaHz);
    const freqAbsPct = Math.abs(freqDeltaPercent);

    // --- Energy Delta ---
    const energyStatus: TrafficLight =
      energyAbs < ENERGY_THRESHOLD_GREEN ? 'green'
      : energyAbs <= ENERGY_THRESHOLD_YELLOW ? 'yellow'
      : 'red';

    const energyDelta: OperatingPointMetric = {
      value: energyDb,
      displayValue: `${energyDb >= 0 ? '+' : ''}${energyDb.toFixed(1)} dB`,
      status: energyStatus,
      shortLabel: 'energyDelta.shortLabel',
      description: 'energyDelta.description',
      warningText: energyStatus !== 'green' ? 'energyDelta.warning' : undefined,
    };

    // --- Frequency Delta (dual threshold: Hz OR %) ---
    const freqExceedsGreen = freqAbsHz > FREQ_THRESHOLD_GREEN_HZ || freqAbsPct > FREQ_THRESHOLD_GREEN_PCT;
    const freqExceedsYellow = freqAbsHz > FREQ_THRESHOLD_YELLOW_HZ || freqAbsPct > FREQ_THRESHOLD_YELLOW_PCT;

    const freqStatus: TrafficLight =
      !freqExceedsGreen ? 'green'
      : !freqExceedsYellow ? 'yellow'
      : 'red';

    const frequencyDelta: OperatingPointMetric = {
      value: freqDeltaHz,
      displayValue: `${freqDeltaHz >= 0 ? '+' : ''}${freqDeltaHz.toFixed(0)} Hz`,
      status: freqStatus,
      shortLabel: 'frequencyDelta.shortLabel',
      description: 'frequencyDelta.description',
      warningText: freqStatus !== 'green' ? 'frequencyDelta.warning' : undefined,
    };

    // --- P10 Similarity ---
    const avgScore = scoreHistory.length > 0
      ? scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length
      : p10;
    const p10Unstable = (avgScore - p10) > P10_INSTABILITY_THRESHOLD;

    const p10Status: TrafficLight =
      p10 > P10_THRESHOLD_GREEN ? 'green'
      : p10 >= P10_THRESHOLD_YELLOW ? 'yellow'
      : 'red';

    const similarityP10: OperatingPointMetric = {
      value: p10,
      displayValue: `P10: ${p10.toFixed(0)}%`,
      status: p10Status,
      shortLabel: 'similarityP10.shortLabel',
      description: 'similarityP10.description',
      warningText: (p10Status !== 'green' || p10Unstable) ? 'similarityP10.warning' : undefined,
    };

    // --- Stability ---
    const stabStatus: TrafficLight =
      stabilityPercent >= STABILITY_THRESHOLD_GREEN ? 'green'
      : stabilityPercent >= STABILITY_THRESHOLD_YELLOW ? 'yellow'
      : 'red';

    const stability: OperatingPointMetric = {
      value: stabilityPercent,
      displayValue: `${stabilityPercent.toFixed(0)}%`,
      status: stabStatus,
      shortLabel: 'stability.shortLabel',
      description: 'stability.description',
      warningText: stabStatus !== 'green' ? 'stability.warning' : undefined,
    };

    // Operating point considered "changed" when energy OR frequency is red,
    // or both are yellow.
    const operatingPointChanged =
      energyDelta.status === 'red' ||
      frequencyDelta.status === 'red' ||
      (energyDelta.status === 'yellow' && frequencyDelta.status === 'yellow');

    return {
      similarityP10,
      energyDelta,
      frequencyDelta,
      stability,
      operatingPointChanged,
      isInitializing: false,
    };
  }

  /**
   * Calculate P10 (10th percentile) of the score history.
   * Represents the short-term minimum similarity.
   */
  private calculateP10(scoreHistory: number[]): number {
    const valid = scoreHistory.filter((s) => isFinite(s) && s >= 0 && s <= 100);
    if (valid.length === 0) return 0;

    const sorted = [...valid].sort((a, b) => a - b);
    // 10th percentile index
    const idx = Math.max(0, Math.floor(sorted.length * 0.1));
    return sorted[idx];
  }

  /**
   * Calculate energy difference to reference in dB.
   * Formula: Delta_dB = 20 * log10(RMS_curr / RMS_ref)
   */
  private calculateEnergyDeltaDb(currentRms: number): number {
    if (this.referenceRms <= 0 || currentRms <= 0) return 0;
    return 20 * Math.log10(currentRms / this.referenceRms);
  }

  /**
   * Find the N most dominant peaks in the spectrum.
   *
   * A peak is a local maximum that is higher than both neighbours and
   * has at least MIN_PEAK_PROMINENCE × maxAmplitude.
   * Parabolic interpolation provides sub-bin accuracy.
   *
   * @returns Top N peaks sorted by frequency (ascending).
   */
  private findDominantPeaks(features: Float64Array): { bin: number; freq: number; amplitude: number }[] {
    const nyquist = this.sampleRate / 2;
    const binWidth = nyquist / this.frequencyBins;

    const minBin = Math.max(1, Math.floor(PEAK_BAND_MIN_HZ / binWidth));
    const maxBin = Math.min(this.frequencyBins - 2, Math.ceil(PEAK_BAND_MAX_HZ / binWidth));

    // Find global maximum for prominence threshold
    let maxAmplitude = 0;
    for (let i = minBin; i <= maxBin; i++) {
      if (features[i] > maxAmplitude) maxAmplitude = features[i];
    }

    const prominenceThreshold = maxAmplitude * MIN_PEAK_PROMINENCE;

    // Find all local maxima
    const peaks: { bin: number; freq: number; amplitude: number }[] = [];

    for (let i = minBin; i <= maxBin; i++) {
      if (features[i] > features[i - 1] &&
          features[i] > features[i + 1] &&
          features[i] >= prominenceThreshold) {

        // Parabolic interpolation for sub-bin accuracy
        const alpha = features[i - 1];
        const beta = features[i];
        const gamma = features[i + 1];
        const denom = alpha - 2 * beta + gamma;

        let refinedBin = i;
        if (Math.abs(denom) > 1e-12) {
          const correction = 0.5 * (alpha - gamma) / denom;
          refinedBin = i + Math.max(-0.5, Math.min(0.5, correction));
        }

        const freq = (refinedBin + 0.5) * binWidth;
        peaks.push({ bin: refinedBin, freq, amplitude: features[i] });
      }
    }

    // Sort by amplitude (strongest first), take top N
    peaks.sort((a, b) => b.amplitude - a.amplitude);
    const topPeaks = peaks.slice(0, NUM_TRACKED_PEAKS);

    // Sort by frequency for stable matching
    topPeaks.sort((a, b) => a.freq - b.freq);

    return topPeaks;
  }

  /**
   * Calculate the median relative frequency shift across all tracked peaks.
   *
   * For each reference peak, find the nearest current peak within
   * PEAK_MATCH_MAX_DISTANCE bins. Compute relative shift for each match
   * and return the median (robust against single false matches).
   *
   * @returns Median relative shift in percent. 0 if no peaks could be matched.
   */
  private calculateMultiPeakShift(features: Float64Array): number {
    if (this.referencePeaks.length === 0) return 0;

    const currentPeaks = this.findDominantPeaks(features);
    if (currentPeaks.length === 0) return 0;

    // Match each reference peak to the nearest current peak
    const shifts: number[] = [];

    for (const refPeak of this.referencePeaks) {
      let bestMatch: { bin: number; freq: number; amplitude: number } | null = null;
      let bestDistance = Infinity;

      for (const curPeak of currentPeaks) {
        const distance = Math.abs(curPeak.bin - refPeak.bin);
        if (distance < bestDistance && distance <= PEAK_MATCH_MAX_DISTANCE) {
          bestDistance = distance;
          bestMatch = curPeak;
        }
      }

      if (bestMatch && refPeak.freq > 0) {
        const relativeShift = ((bestMatch.freq - refPeak.freq) / refPeak.freq) * 100;
        shifts.push(relativeShift);
      }
    }

    // Median of shifts (robust against single false matches)
    if (shifts.length === 0) return 0;

    shifts.sort((a, b) => a - b);
    const mid = Math.floor(shifts.length / 2);
    return shifts.length % 2 === 0
      ? (shifts[mid - 1] + shifts[mid]) / 2
      : shifts[mid];
  }

  /**
   * Calculate absolute frequency delta in Hz.
   * Derives Hz from the percent shift using the strongest reference peak.
   */
  private calculateFrequencyDeltaHz(): number {
    if (this.referencePeaks.length === 0) return 0;
    const strongestPeak = this.referencePeaks.reduce(
      (a, b) => (a.amplitude > b.amplitude ? a : b)
    );
    return strongestPeak.freq * this.smoothedFrequencyShiftPercent / 100;
  }

  /**
   * Calculate relative frequency delta in percent.
   * Returns the smoothed multi-peak shift directly.
   */
  private calculateFrequencyDeltaPercent(): number {
    return this.smoothedFrequencyShiftPercent;
  }

  /**
   * Calculate stability as percentage of stable frame transitions.
   * A frame pair is "stable" when cosine similarity > 0.95.
   */
  private calculateStabilityPercent(): number {
    if (this.frameSimilarities.length === 0) return 100; // No data yet -> assume stable
    const stableCount = this.frameSimilarities.filter((s) => s > 0.95).length;
    return (stableCount / this.frameSimilarities.length) * 100;
  }

  /**
   * Cosine similarity between two feature vectors.
   * Lightweight implementation to avoid importing mathUtils
   * (which operates on Float64Array internally).
   */
  private cosineSim(a: Float64Array, b: Float64Array): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    if (denom < 1e-12) return 0;
    return dot / denom;
  }

  /**
   * Calculate median of a number array (robust against outliers).
   */
  private median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}
