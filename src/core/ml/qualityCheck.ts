/**
 * ZANOBOT - RECORDING QUALITY ASSESSMENT
 *
 * Analyzes recording quality before saving reference data.
 * Checks for signal stability, outliers, and noise.
 *
 * Phase 2: Professional Reference Recording
 */

import type { FeatureVector, QualityResult } from '@data/types.js';
import { logger } from '@utils/logger.js';

/**
 * Quality assessment thresholds
 */
const QUALITY_THRESHOLDS = {
  // RMS amplitude thresholds (pre-standardization)
  RMS_CRITICAL: 0.01, // Below this: very weak/diffuse signal (likely noise)
  RMS_WARNING: 0.02, // Below this: weak tonal signal
  SNR_WEAK_MIN: 4, // Below this: weak signal likely masked by noise

  // Score thresholds for rating
  SCORE_GOOD: 90, // >= 90%: GOOD rating
  SCORE_EXCELLENT: 95, // >= 95%: Excellent quality
  SCORE_OK: 75, // >= 75%: OK rating

  // Variance thresholds
  VARIANCE_HIGH: 0.0001, // Above this: high spectral variance
  VARIANCE_VERY_HIGH: 0.0005, // Above this: very high variance
  VARIANCE_ACCEPTABLE: 0.00005, // Below this: acceptable for excellent quality
  STABILITY_MIN_FRAME_SIM: 0.92, // Minimum median frame similarity for stable tonal signals

  // Outlier ratio thresholds
  OUTLIER_RATIO_LOW: 0.02, // Below this: very few outliers (perfect quality)
  OUTLIER_RATIO_ACCEPTABLE: 0.05, // Below this: acceptable for excellent quality
  OUTLIER_RATIO_HIGH: 0.1, // Above this: too many outliers

  // Mains frequency masking (for variance metrics only)
  IGNORE_MAINS_HZ: 50, // Typical mains/inverter fundamental
  IGNORE_HARMONICS_COUNT: 10, // Number of harmonics to ignore
  IGNORE_MAINS_BIN_RADIUS: 1, // ±bins around each harmonic to ignore
} as const;

/**
 * Assess recording quality based on extracted features
 *
 * This function analyzes the feature vectors from a reference recording
 * to determine if the signal is stable enough for training.
 *
 * Input: Feature vectors (only from second 5 onwards - after settling period)
 * Output: Quality assessment with score, rating, and issues
 *
 * Quality Criteria:
 * - GOOD (>90%): Stationary signal, minimal variance
 * - OK (75-90%): Slight noise but stable overall
 * - BAD (<75%): Strong outliers (e.g., door slam, unstable signal)
 *
 * @param features - Feature vectors from recording (post-settling period)
 * @returns Quality assessment result
 */
export function assessRecordingQuality(features: FeatureVector[]): QualityResult {
  logger.info('🔍 Assessing recording quality...');

  if (features.length === 0) {
    return {
      score: 0,
      rating: 'BAD',
      issues: ['Keine Features vorhanden'],
      metadata: {
        variance: 0,
        stability: 0,
        outlierCount: 0,
      },
    };
  }

  // Extract feature matrices for analysis
  // NOTE: Always use baseline-normalized features for variance metrics (sum = 1).
  const baselineFeatureMatrix: number[][] = features.map((f) =>
    normalizeAbsoluteFeatures(f.absoluteFeatures)
  );
  const absoluteFeatureMatrix: number[][] = features.map((f) => Array.from(f.absoluteFeatures)); // Absolute features (preserve amplitude)
  const numFrames = baselineFeatureMatrix.length;
  const numBins = baselineFeatureMatrix[0]?.length || 0;

  // SAFETY CHECK: Prevent division by zero and undefined access
  if (numFrames === 0 || numBins === 0) {
    return {
      score: 0,
      rating: 'BAD',
      issues: ['Keine Audiodaten extrahiert (Frame Count 0)'],
      metadata: {
        variance: 0,
        stability: 0,
        outlierCount: 0,
      },
    };
  }

  logger.debug(`   Analyzing ${numFrames} frames with ${numBins} frequency bins`);

  // 1. Calculate spectral variance across time (use normalized features for stability analysis)
  const varianceMask = buildVarianceMask(features[0]);
  const variance = calculateSpectralVariance(baselineFeatureMatrix, varianceMask);

  // 2. Detect outliers (frames with unusual spectral content)
  const outliers = detectOutliers(absoluteFeatureMatrix);
  const outlierCount = outliers.length;

  // 3. Calculate stability metric (inverse of variance, normalized)
  const frameSimilarity = calculateFrameSimilarity(baselineFeatureMatrix, varianceMask);
  const stability = calculateStability(variance, outlierCount, numFrames, frameSimilarity);

  // 4. CRITICAL FIX: Calculate signal magnitude from pre-standardization RMS amplitude
  // This is the TRUE amplitude measure (before any normalization/standardization)
  // Average RMS across all frames to get overall signal strength
  const signalMagnitude = calculateSignalMagnitudeFromRMS(features);
  const signalSnr = calculateSignalToNoiseRatio(absoluteFeatureMatrix);

  // 5. Calculate final quality score (0-100)
  const score = calculateQualityScore(variance, stability, outlierCount, numFrames);

  // 6. Determine rating and issues
  const { rating, issues } = determineRating(
    score,
    variance,
    outlierCount,
    numFrames,
    signalMagnitude,
    frameSimilarity,
    signalSnr
  );

  logger.info(`   Quality Score: ${score.toFixed(1)}% - Rating: ${rating}`);
  logger.info(`   Signal RMS Amplitude: ${signalMagnitude.toFixed(4)} (${signalMagnitude >= 0.03 ? 'SUFFICIENT' : 'LOW - possible noise/weak signal'})`);
  logger.info(`   Median frame similarity: ${frameSimilarity.toFixed(3)} | Peak/median SNR: ${signalSnr.toFixed(2)}`);
  if (issues.length > 0) {
    logger.warn(`   Issues detected: ${issues.join(', ')}`);
  }

  return {
    score: Math.round(score),
    rating,
    issues,
    metadata: {
      variance,
      stability,
      outlierCount,
      signalMagnitude,
      frameSimilarity,
      signalSnr,
    },
  };
}

/**
 * Calculate spectral variance across time
 *
 * Measures how much the spectrum changes over time.
 * Low variance = stable signal (good for reference)
 * High variance = unstable/noisy signal (bad for reference)
 *
 * @param featureMatrix - Matrix of feature vectors [frames x bins]
 * @returns Average variance across all frequency bins
 */
function calculateSpectralVariance(featureMatrix: number[][], mask?: boolean[] | null): number {
  const numFrames = featureMatrix.length;
  const numBins = featureMatrix[0].length;

  if (numFrames < 2) {
    return 0;
  }

  // For each frequency bin, calculate variance across time
  let totalVariance = 0;
  let usedBins = 0;

  for (let bin = 0; bin < numBins; bin++) {
    if (mask && !mask[bin]) {
      continue;
    }
    // Extract time series for this bin
    const binValues = featureMatrix.map((frame) => frame[bin]);

    // Calculate mean
    const mean = binValues.reduce((sum, val) => sum + val, 0) / numFrames;

    // Calculate variance
    const variance = binValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numFrames;

    totalVariance += variance;
    usedBins += 1;
  }

  // Average variance across all bins
  const avgVariance = usedBins > 0 ? totalVariance / usedBins : 0;

  return avgVariance;
}

/**
 * Detect outlier frames using statistical methods
 *
 * An outlier is a frame whose spectral content deviates significantly
 * from the mean (e.g., sudden loud noise, door slam, etc.)
 *
 * Method: Modified Z-score using median absolute deviation (MAD)
 * This is more robust to outliers than standard deviation
 *
 * @param featureMatrix - Matrix of feature vectors [frames x bins]
 * @returns Array of outlier frame indices
 */
function detectOutliers(featureMatrix: number[][]): number[] {
  const numFrames = featureMatrix.length;

  // Calculate total energy per frame (sum across all bins)
  const frameEnergies = featureMatrix.map((frame) => frame.reduce((sum, val) => sum + val, 0));

  // Calculate median
  const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
  const median = sortedEnergies[Math.floor(numFrames / 2)];

  // Calculate MAD (Median Absolute Deviation)
  const absoluteDeviations = frameEnergies.map((energy) => Math.abs(energy - median));
  const sortedDeviations = [...absoluteDeviations].sort((a, b) => a - b);
  const mad = sortedDeviations[Math.floor(numFrames / 2)];

  // Modified Z-score threshold (typically 3.5 for outlier detection)
  const threshold = 3.5;

  // Detect outliers
  const outliers: number[] = [];

  if (mad > 0) {
    for (let i = 0; i < numFrames; i++) {
      const modifiedZScore = (0.6745 * (frameEnergies[i] - median)) / mad;
      if (Math.abs(modifiedZScore) > threshold) {
        outliers.push(i);
      }
    }
  }

  return outliers;
}

/**
 * Calculate frame similarity (cosine similarity to median frame)
 *
 * @param featureMatrix - Matrix of feature vectors [frames x bins]
 * @param mask - Optional mask to ignore specific bins
 * @returns Median cosine similarity across frames
 */
function calculateFrameSimilarity(featureMatrix: number[][], mask?: boolean[] | null): number {
  const numFrames = featureMatrix.length;
  const numBins = featureMatrix[0]?.length ?? 0;

  if (numFrames === 0 || numBins === 0) {
    return 0;
  }

  const medianFrame = new Array(numBins).fill(0);

  for (let bin = 0; bin < numBins; bin++) {
    if (mask && !mask[bin]) {
      continue;
    }
    const values = featureMatrix.map((frame) => frame[bin]).sort((a, b) => a - b);
    medianFrame[bin] = values[Math.floor(numFrames / 2)] ?? 0;
  }

  const similarities: number[] = [];

  for (let i = 0; i < numFrames; i++) {
    const frame = featureMatrix[i];
    let dot = 0;
    let frameNorm = 0;
    let medianNorm = 0;
    for (let bin = 0; bin < numBins; bin++) {
      if (mask && !mask[bin]) {
        continue;
      }
      const v = frame[bin];
      const m = medianFrame[bin];
      dot += v * m;
      frameNorm += v * v;
      medianNorm += m * m;
    }
    const denom = Math.sqrt(frameNorm) * Math.sqrt(medianNorm);
    similarities.push(denom > 0 ? dot / denom : 0);
  }

  similarities.sort((a, b) => a - b);
  return similarities[Math.floor(similarities.length / 2)] ?? 0;
}

/**
 * Calculate stability metric (0-1, higher is better)
 *
 * Combines variance and outlier information into a single metric.
 *
 * @param variance - Spectral variance
 * @param outlierCount - Number of outlier frames
 * @param numFrames - Total number of frames
 * @returns Stability metric (0-1)
 */
function calculateStability(
  variance: number,
  outlierCount: number,
  numFrames: number,
  frameSimilarity: number
): number {
  // Penalize based on variance (exponential decay)
  // Typical good variance is around 1e-6 to 1e-5
  // Bad variance is > 1e-4
  const variancePenalty = Math.exp(-variance * 10000);

  // Penalize based on outlier percentage
  const outlierRatio = outlierCount / numFrames;
  const outlierPenalty = 1 - Math.min(outlierRatio * 5, 1); // Cap at 1

  const similarityPenalty =
    frameSimilarity >= QUALITY_THRESHOLDS.STABILITY_MIN_FRAME_SIM
      ? 1
      : Math.max(0, frameSimilarity / QUALITY_THRESHOLDS.STABILITY_MIN_FRAME_SIM);

  // Combine penalties (geometric mean for balance)
  const stability = Math.sqrt(variancePenalty * outlierPenalty) * similarityPenalty;

  return stability;
}

/**
 * Calculate final quality score (0-100)
 *
 * Weighted combination of stability and other factors.
 *
 * @param variance - Spectral variance
 * @param stability - Stability metric (0-1)
 * @param outlierCount - Number of outlier frames
 * @param numFrames - Total number of frames
 * @returns Quality score (0-100)
 */
function calculateQualityScore(
  variance: number,
  stability: number,
  outlierCount: number,
  numFrames: number
): number {
  // Base score from stability (0-100)
  let score = stability * 100;

  // Additional penalty for high outlier count
  const outlierRatio = outlierCount / numFrames;
  if (outlierRatio > 0.1) {
    // More than 10% outliers is very bad
    score *= 0.5; // 50% penalty
  } else if (outlierRatio > 0.05) {
    // More than 5% outliers is bad
    score *= 0.75; // 25% penalty
  }

  // Ensure score is in valid range
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate signal magnitude from pre-standardization RMS amplitudes
 *
 * CRITICAL: This is the TRUE amplitude measure!
 * - Uses RMS amplitude calculated BEFORE standardization
 * - Preserves actual signal strength (loud vs quiet)
 * - Returns average RMS across all frames
 *
 * Typical values:
 * - Silent/background noise: 0.001-0.01
 * - Quiet machine/distant mic: 0.01-0.05
 * - Normal machine: 0.05-0.2
 * - Loud machine/close mic: 0.2-0.5+
 *
 * @param features - Array of feature vectors with rmsAmplitude
 * @returns Average RMS amplitude
 */
function calculateSignalMagnitudeFromRMS(features: FeatureVector[]): number {
  if (features.length === 0) {
    return 0;
  }

  let sum = 0;
  let count = 0;
  for (const feature of features) {
    if (feature.rmsAmplitude !== undefined) {
      sum += feature.rmsAmplitude;
      count++;
    }
  }

  // If no RMS values available, return default (assumes sufficient signal)
  if (count === 0) {
    return 0.1; // Default to reasonable RMS value
  }

  return sum / count;
}

/**
 * Normalize absolute features to relative values (sum = 1)
 */
function normalizeAbsoluteFeatures(features: Float64Array): number[] {
  const n = features.length;
  const normalized = new Array(n).fill(0);
  let total = 0;

  for (let i = 0; i < n; i++) {
    total += features[i];
  }

  if (total > 0) {
    for (let i = 0; i < n; i++) {
      normalized[i] = features[i] / total;
    }
  }

  return normalized;
}

/**
 * Calculate SNR using peak-to-median ratio of mean spectrum
 */
function calculateSignalToNoiseRatio(featureMatrix: number[][]): number {
  const numFrames = featureMatrix.length;
  const numBins = featureMatrix[0]?.length ?? 0;

  if (numFrames === 0 || numBins === 0) {
    return 0;
  }

  const meanSpectrum = new Array(numBins).fill(0);
  for (const frame of featureMatrix) {
    for (let bin = 0; bin < numBins; bin++) {
      meanSpectrum[bin] += frame[bin];
    }
  }
  for (let bin = 0; bin < numBins; bin++) {
    meanSpectrum[bin] /= numFrames;
  }

  const sorted = [...meanSpectrum].sort((a, b) => a - b);
  const median = sorted[Math.floor(numBins / 2)] ?? 0;
  const peak = Math.max(...meanSpectrum);

  return peak / (median + 1e-12);
}

/**
 * Build mask to ignore mains frequency harmonics for variance metrics
 */
function buildVarianceMask(reference: FeatureVector | undefined): boolean[] | null {
  if (!reference) {
    return null;
  }

  const { bins, frequencyRange } = reference;
  const [minFreq, maxFreq] = frequencyRange;

  if (bins <= 0) {
    return null;
  }

  const mask = new Array(bins).fill(true);
  const binWidth = (maxFreq - minFreq) / bins;

  for (let harmonic = 1; harmonic <= QUALITY_THRESHOLDS.IGNORE_HARMONICS_COUNT; harmonic++) {
    const frequency = QUALITY_THRESHOLDS.IGNORE_MAINS_HZ * harmonic;
    if (frequency < minFreq || frequency > maxFreq) {
      continue;
    }
    const centerIndex = Math.round((frequency - minFreq) / binWidth);
    for (
      let offset = -QUALITY_THRESHOLDS.IGNORE_MAINS_BIN_RADIUS;
      offset <= QUALITY_THRESHOLDS.IGNORE_MAINS_BIN_RADIUS;
      offset++
    ) {
      const index = centerIndex + offset;
      if (index >= 0 && index < bins) {
        mask[index] = false;
      }
    }
  }

  return mask;
}

/**
 * Determine quality rating and identify specific issues
 *
 * @param score - Quality score (0-100)
 * @param variance - Spectral variance
 * @param outlierCount - Number of outlier frames
 * @param numFrames - Total number of frames
 * @param signalMagnitude - L2 norm of mean feature vector
 * @returns Rating and list of issues
 */
function determineRating(
  score: number,
  variance: number,
  outlierCount: number,
  numFrames: number,
  signalMagnitude: number,
  frameSimilarity: number,
  signalSnr: number
): { rating: 'GOOD' | 'OK' | 'BAD'; issues: string[] } {
  const issues: string[] = [];

  // Check for specific issues
  const outlierRatio = outlierCount / numFrames;

  if (variance > QUALITY_THRESHOLDS.VARIANCE_HIGH && frameSimilarity < QUALITY_THRESHOLDS.STABILITY_MIN_FRAME_SIM) {
    issues.push('Hohe Spektralvarianz - Signal instabil');
  }

  if (outlierCount > 0) {
    issues.push(
      `${outlierCount} Ausreißer erkannt (${(outlierRatio * 100).toFixed(1)}%) - Mögliche Störgeräusche`
    );
  }

  if (variance > QUALITY_THRESHOLDS.VARIANCE_VERY_HIGH && frameSimilarity < QUALITY_THRESHOLDS.STABILITY_MIN_FRAME_SIM) {
    issues.push('Sehr hohe Varianz - Bitte in ruhigerer Umgebung aufnehmen');
  }

  // CRITICAL FIX: Check signal magnitude (brown noise detection)
  // UPDATED: Using RMS amplitude (pre-standardization) for TRUE amplitude measure
  // Typical RMS values: 0.001-0.01 (silent), 0.01-0.05 (quiet), 0.05-0.2 (normal), 0.2+ (loud)

  // DEBUG LOGGING: Show actual RMS value
  logger.debug(`🔊 RMS Amplitude Check: ${signalMagnitude.toFixed(4)} (threshold warnings: <${QUALITY_THRESHOLDS.RMS_CRITICAL} critical, <${QUALITY_THRESHOLDS.RMS_WARNING} warning)`);

  if (signalMagnitude < QUALITY_THRESHOLDS.RMS_CRITICAL && signalSnr < QUALITY_THRESHOLDS.SNR_WEAK_MIN) {
    issues.push(
      'Sehr schwaches/diffuses Signal - Möglicherweise nur Rauschen. Bitte näher an die Maschine gehen.'
    );
  } else if (signalMagnitude < QUALITY_THRESHOLDS.RMS_WARNING && signalSnr < QUALITY_THRESHOLDS.SNR_WEAK_MIN) {
    issues.push(
      'Schwaches tonales Signal - Signal-Rausch-Verhältnis könnte zu niedrig sein.'
    );
  }

  // Determine rating based on score
  let rating: 'GOOD' | 'OK' | 'BAD';

  if (score >= QUALITY_THRESHOLDS.SCORE_GOOD) {
    rating = 'GOOD';
    // Clear issues array for GOOD rating (only minor issues allowed)
    // ADJUSTED: If score is excellent (>95%) and signal is stable, ignore RMS warnings
    // Rationale: Score already validates quality; low RMS might just be normalization artifact
    if (
      score >= QUALITY_THRESHOLDS.SCORE_EXCELLENT &&
      outlierRatio < QUALITY_THRESHOLDS.OUTLIER_RATIO_ACCEPTABLE &&
      variance < QUALITY_THRESHOLDS.VARIANCE_HIGH
    ) {
      issues.length = 0; // No issues for excellent quality
    } else if (
      outlierRatio < QUALITY_THRESHOLDS.OUTLIER_RATIO_LOW &&
      variance < QUALITY_THRESHOLDS.VARIANCE_ACCEPTABLE &&
      signalMagnitude >= 0.05
    ) {
      issues.length = 0; // No issues for perfect quality
    }
  } else if (score >= QUALITY_THRESHOLDS.SCORE_OK) {
    rating = 'OK';
  } else {
    rating = 'BAD';
  }

  return { rating, issues };
}
