/**
 * ZANOBOT - Cherry-Picking (Pipeline-Stufe 1)
 *
 * Energy-Entropy-Gate: Filters transient interference frames
 * (horns, hammering, door slams, compressed air) from feature vectors
 * BEFORE they reach Room Compensation and GMIA.
 *
 * Two variants:
 * - Batch: cherryPickFeatures() for Reference phase (processes all frames at once)
 * - Realtime: RealtimeCherryPick class for Diagnose phase (per-frame gate decision)
 *
 * When disabled (default), zero Cherry-Picking code executes.
 */

import type { FeatureVector } from '@data/types.js';
import { logger } from '@utils/logger.js';

// ============================================================================
// INTERFACES & DEFAULTS
// ============================================================================

export interface CherryPickSettings {
  enabled: boolean; // Default: false
  sigmaThreshold: number; // Default: 2.0 (Frames > 2σ from median are rejected)
  minRetainRatio: number; // Default: 0.5 (at least 50% of frames kept)
}

export const DEFAULT_CHERRY_PICK_SETTINGS: CherryPickSettings = {
  enabled: false,
  sigmaThreshold: 2.0,
  minRetainRatio: 0.5,
};

export interface CherryPickResult {
  filteredFeatures: FeatureVector[]; // Only the "good" frames
  removedCount: number; // Number of rejected frames
  totalCount: number; // Total frame count
  removedIndices: number[]; // Indices of rejected frames (for UI/logging)
  energyStats: {
    median: number;
    mad: number; // Median Absolute Deviation
    threshold: [number, number]; // [lower, upper] thresholds
  };
  entropyStats: {
    median: number;
    mad: number;
    threshold: [number, number];
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Median of a number array */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Median Absolute Deviation */
function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

/** Fallback: compute RMS from absoluteFeatures (when rmsAmplitude is not present) */
function computeRmsFromAbsolute(fv: FeatureVector): number {
  let sum = 0;
  for (let i = 0; i < fv.absoluteFeatures.length; i++) {
    sum += fv.absoluteFeatures[i] * fv.absoluteFeatures[i];
  }
  return Math.sqrt(sum / fv.absoluteFeatures.length);
}

// ============================================================================
// SPECTRAL ENTROPY
// ============================================================================

/**
 * Calculates normalized spectral entropy of a frame.
 *
 * Stationary machine signals have characteristic entropy (tonal peaks → low entropy).
 * Transients (broadband impulses) have high entropy (energy uniformly distributed).
 *
 * @param absoluteFeatures - Absolute energy values per frequency bin
 * @returns Normalized entropy in [0, 1]
 *   ~0.0 → pure sine (all energy in one bin)
 *   ~0.5 → typical machine noise (some dominant frequencies)
 *   ~1.0 → white noise / broadband impulse (uniformly distributed)
 */
export function calculateSpectralEntropy(absoluteFeatures: Float64Array): number {
  const K = absoluteFeatures.length;
  if (K === 0) return 0;

  // Step 1: Compute total energy
  let totalEnergy = 0;
  for (let i = 0; i < K; i++) {
    totalEnergy += absoluteFeatures[i];
  }

  // Avoid division by zero for silent frames
  if (totalEnergy <= 0) return 0;

  // Step 2: Shannon entropy
  const epsilon = 1e-30;
  let entropy = 0;
  for (let i = 0; i < K; i++) {
    const p = absoluteFeatures[i] / totalEnergy;
    entropy -= p * Math.log2(p + epsilon);
  }

  // Step 3: Normalize to [0, 1]
  const maxEntropy = Math.log2(K);
  if (maxEntropy <= 0) return 0;

  return entropy / maxEntropy;
}

// ============================================================================
// BATCH CHERRY-PICKING (Reference Phase)
// ============================================================================

/**
 * Batch variant for the Reference phase.
 * Evaluates all frames and filters outliers using robust statistics (Median + MAD).
 *
 * @param features - Array of feature vectors from extractFeatures()
 * @param settings - Cherry-Pick configuration
 * @returns CherryPickResult with filtered features and statistics
 */
export function cherryPickFeatures(
  features: FeatureVector[],
  settings: CherryPickSettings
): CherryPickResult {
  const totalCount = features.length;

  // Edge case: too few frames to compute meaningful statistics
  if (totalCount < 3) {
    return {
      filteredFeatures: [...features],
      removedCount: 0,
      totalCount,
      removedIndices: [],
      energyStats: { median: 0, mad: 0, threshold: [0, 0] },
      entropyStats: { median: 0, mad: 0, threshold: [0, 0] },
    };
  }

  // Step 1: Compute metrics for each frame
  const energy: number[] = new Array(totalCount);
  const entropy: number[] = new Array(totalCount);

  for (let i = 0; i < totalCount; i++) {
    energy[i] = features[i].rmsAmplitude ?? computeRmsFromAbsolute(features[i]);
    entropy[i] = calculateSpectralEntropy(features[i].absoluteFeatures);
  }

  // Step 2: Robust statistics (Median + MAD)
  // Why Median instead of Mean? → Median is robust against outliers.
  // Why MAD instead of Std Dev? → MAD is also robust.
  // 1.4826: consistency factor for normal distribution (MAD → σ)
  const medianEnergy = median(energy);
  const madEnergy = mad(energy) * 1.4826;
  const lowerEnergy = medianEnergy - settings.sigmaThreshold * madEnergy;
  const upperEnergy = medianEnergy + settings.sigmaThreshold * madEnergy;

  const medianEntropy = median(entropy);
  const madEntropy = mad(entropy) * 1.4826;
  const lowerEntropy = medianEntropy - settings.sigmaThreshold * madEntropy;
  const upperEntropy = medianEntropy + settings.sigmaThreshold * madEntropy;

  // Step 3: Classify frames
  // A frame is an outlier if energy OR entropy is outside the thresholds
  interface OutlierInfo {
    index: number;
    severity: number; // Normalized distance from median (for ranking)
  }

  const outliers: OutlierInfo[] = [];

  for (let i = 0; i < totalCount; i++) {
    const energyOutlier = energy[i] < lowerEnergy || energy[i] > upperEnergy;
    const entropyOutlier = entropy[i] < lowerEntropy || entropy[i] > upperEntropy;

    if (energyOutlier || entropyOutlier) {
      // Compute severity: max normalized distance across both metrics
      const energyDist =
        madEnergy > 0 ? Math.abs(energy[i] - medianEnergy) / madEnergy : 0;
      const entropyDist =
        madEntropy > 0 ? Math.abs(entropy[i] - medianEntropy) / madEntropy : 0;
      const severity = Math.max(energyDist, entropyDist);

      outliers.push({ index: i, severity });
    }
  }

  // Step 4: Minimum-Retain-Guard
  const maxRemovable = Math.floor((1 - settings.minRetainRatio) * totalCount);
  let removedIndices: number[];

  if (outliers.length > maxRemovable) {
    // Too many frames would be rejected
    // Sort by severity (descending) and keep only the worst ones
    logger.warn(
      `Cherry-Picking: ${outliers.length} outliers exceed minRetainRatio, keeping only ${maxRemovable} worst`
    );
    outliers.sort((a, b) => b.severity - a.severity);
    removedIndices = outliers.slice(0, maxRemovable).map((o) => o.index);
  } else {
    removedIndices = outliers.map((o) => o.index);
  }

  // Sort indices for consistent output
  removedIndices.sort((a, b) => a - b);

  // Step 5: Filter (immutable - returns new array)
  const removedSet = new Set(removedIndices);
  const filteredFeatures = features.filter((_, i) => !removedSet.has(i));

  // Step 6: Return result
  return {
    filteredFeatures,
    removedCount: removedIndices.length,
    totalCount,
    removedIndices,
    energyStats: {
      median: medianEnergy,
      mad: madEnergy,
      threshold: [lowerEnergy, upperEnergy],
    },
    entropyStats: {
      median: medianEntropy,
      mad: madEntropy,
      threshold: [lowerEntropy, upperEntropy],
    },
  };
}

// ============================================================================
// REALTIME CHERRY-PICKING (Diagnose Phase)
// ============================================================================

/**
 * Real-time variant for the Diagnose phase.
 * Uses a sliding window to build baseline statistics and gate individual frames.
 */
export class RealtimeCherryPick {
  private settings: CherryPickSettings;
  private energyHistory: number[] = [];
  private entropyHistory: number[] = [];
  private readonly windowSize: number; // Number of frames in the sliding window
  private readonly minFramesForStats: number = 5; // Minimum frames before gate activates

  constructor(settings: CherryPickSettings, hopSizeSeconds: number = 0.066) {
    this.settings = settings;
    // 3-second sliding window (as specified in concept)
    this.windowSize = Math.round(3.0 / hopSizeSeconds); // ≈45 frames
  }

  /**
   * Checks whether a frame should be accepted or rejected.
   * @returns true if the frame is GOOD (keep), false if it's an outlier (reject)
   */
  processFrame(featureVector: FeatureVector): boolean {
    const energy = featureVector.rmsAmplitude ?? 0;
    const entropy = calculateSpectralEntropy(featureVector.absoluteFeatures);

    // Phase 1: Build history (always, even if frame is rejected)
    this.energyHistory.push(energy);
    this.entropyHistory.push(entropy);

    // Constrain window (FIFO)
    if (this.energyHistory.length > this.windowSize) {
      this.energyHistory.shift();
      this.entropyHistory.shift();
    }

    // Phase 2: Not enough data → accept frame
    if (this.energyHistory.length < this.minFramesForStats) {
      return true; // Accept until enough statistics are available
    }

    // Phase 3: Compute statistics
    const energyMedian = median(this.energyHistory);
    const energyMad = mad(this.energyHistory) * 1.4826;
    const entropyMedian = median(this.entropyHistory);
    const entropyMad = mad(this.entropyHistory) * 1.4826;

    // Phase 4: Gate decision
    const sigma = this.settings.sigmaThreshold;

    const energyOutlier =
      energy < energyMedian - sigma * energyMad ||
      energy > energyMedian + sigma * energyMad;

    const entropyOutlier =
      entropy < entropyMedian - sigma * entropyMad ||
      entropy > entropyMedian + sigma * entropyMad;

    if (energyOutlier || entropyOutlier) {
      return false; // Reject
    }

    return true; // Accept
  }

  /** Reset (at start of new diagnosis run) */
  reset(): void {
    this.energyHistory = [];
    this.entropyHistory = [];
  }
}

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'zanobot-cherry-pick-settings';

export function getCherryPickSettings(): CherryPickSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CherryPickSettings>;
      return { ...DEFAULT_CHERRY_PICK_SETTINGS, ...parsed };
    }
  } catch (e) {
    logger.warn('Cherry-Pick Settings Load Error:', e);
  }
  return { ...DEFAULT_CHERRY_PICK_SETTINGS };
}

export function setCherryPickSettings(partial: Partial<CherryPickSettings>): void {
  const current = getCherryPickSettings();
  const updated = { ...current, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    logger.warn('Cherry-Pick Settings Save Error:', e);
  }
}
