/**
 * ZANOBOT - HEALTH SCORE CALCULATION
 *
 * Converts cosine similarity to health score (0-100%).
 * Uses hyperbolic tangent scaling for non-linear transformation.
 *
 * GMIA Equation 4
 * Formula: Score = 100 * (tanh(C * cos(α)))^2
 *
 * Where:
 * - C: Scaling constant (calculated during training)
 * - cos(α): Cosine similarity between test and reference
 */

import type {
  GMIAModel,
  DiagnosisResult,
  FeatureVector,
  Machine,
  MachineMatchResult,
  AutoDetectionResult,
} from '@data/types.js';
import { AUTO_DETECTION_THRESHOLDS } from '@data/types.js';
import { inferGMIA } from './gmia.js';
import { vectorMagnitude } from './mathUtils.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';

/**
 * Thresholds for health status classification
 */
const HEALTH_THRESHOLDS = {
  healthy: 75, // >= 75% = Healthy
  uncertain: 50, // 50-75% = Uncertain
  // < 50% = Faulty
};

/**
 * Minimum score for confident state detection
 * Below this threshold, detected state labels are hidden to avoid confusion
 *
 * @deprecated Use getMinConfidentMatchScore() instead to respect user settings
 */
export const MIN_CONFIDENT_MATCH_SCORE = 70;

/**
 * Get the minimum score for confident state detection from user settings
 * Below this threshold, detected state labels are hidden to avoid confusion
 *
 * @returns Minimum confidence score threshold (0-100)
 */
export function getMinConfidentMatchScore(): number {
  const settings = getRecordingSettings();
  return settings.confidenceThreshold;
}

/**
 * Confidence calculation parameters
 */
const CONFIDENCE_PARAMS = {
  healthyBase: 70, // Base confidence for healthy status
  healthyMultiplier: 1.2, // Multiplier for score above healthy threshold
  uncertainMultiplier: 0.8, // Multiplier for uncertain range
  uncertainBase: 50, // Base confidence for uncertain status
  faultyMultiplier: 1.0, // Multiplier for faulty status
};

/**
 * Calculate health score from cosine similarity
 *
 * Applies tanh scaling: Score = 100 * (tanh(C * cosine))^2
 *
 * @param cosineSimilarity - Cosine similarity value [-1, 1]
 * @param scalingConstant - C from model training
 * @returns Health score [0, 100]
 */
export function calculateHealthScore(cosineSimilarity: number, scalingConstant: number): number {
  // Apply tanh transformation
  const clampedCosine = Math.max(0, cosineSimilarity);
  const tanhValue = Math.tanh(scalingConstant * clampedCosine);

  // Square and convert to percentage
  const score = Math.pow(tanhValue, 2) * 100;

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score));
}

/**
 * Classify health status based on score
 *
 * @param score - Health score [0, 100]
 * @param healthyThreshold - User-configured threshold for 'unauffällig' (unremarkable) status (default: 75)
 * @param faultyThreshold - User-configured threshold for 'auffällig' (conspicuous) status (default: 50)
 * @returns Status category: 'healthy' (unauffällig), 'uncertain' (Abweichung), or 'faulty' (auffällig)
 * @throws Error if score is NaN or Infinity
 */
export function classifyHealthStatus(
  score: number,
  healthyThreshold: number = HEALTH_THRESHOLDS.healthy,
  faultyThreshold: number = HEALTH_THRESHOLDS.uncertain
): 'healthy' | 'uncertain' | 'faulty' {
  // CRITICAL FIX: Validate input to prevent NaN propagation
  // NaN comparisons always return false, causing silent misclassification as 'faulty'
  if (!isFinite(score)) {
    logger.error(`❌ Invalid health score received: ${score}`);
    throw new Error(`Invalid health score: ${score}. Score must be a finite number.`);
  }

  // Use user-configured thresholds for classification
  // Logic: score >= healthyThreshold → unauffällig (unremarkable)
  //        score >= faultyThreshold  → Abweichung (uncertain/deviation)
  //        score < faultyThreshold   → auffällig (conspicuous/anomalous)
  if (score >= healthyThreshold) {
    return 'healthy';
  } else if (score >= faultyThreshold) {
    return 'uncertain';
  } else {
    return 'faulty';
  }
}

/**
 * Get classification details for a health score
 *
 * @param score - Health score [0, 100]
 * @param healthyThreshold - User-configured threshold for 'unauffällig' status (default: 75)
 * @param faultyThreshold - User-configured threshold for 'auffällig' status (default: 50)
 * @returns Classification details with confidence and recommendation
 */
export function getClassificationDetails(
  score: number,
  healthyThreshold: number = HEALTH_THRESHOLDS.healthy,
  faultyThreshold: number = HEALTH_THRESHOLDS.uncertain
): {
  status: 'healthy' | 'uncertain' | 'faulty';
  confidence: number;
  recommendation: string;
} {
  const status = classifyHealthStatus(score, healthyThreshold, faultyThreshold);

  let confidence: number;
  let recommendation: string;

  if (status === 'healthy') {
    confidence = Math.min(
      100,
      CONFIDENCE_PARAMS.healthyBase +
        (score - healthyThreshold) * CONFIDENCE_PARAMS.healthyMultiplier
    );
    recommendation = t('scoring.matchesReference');
  } else if (status === 'uncertain') {
    confidence =
      CONFIDENCE_PARAMS.uncertainBase +
      (score - faultyThreshold) * CONFIDENCE_PARAMS.uncertainMultiplier;
    recommendation = t('scoring.moderateDeviation');
  } else {
    confidence = Math.max(
      20,
      faultyThreshold - (faultyThreshold - score) * 0.6
    );
    recommendation = t('scoring.significantDeviation');
  }

  return {
    status,
    confidence: Math.round(confidence),
    recommendation,
  };
}

/**
 * Calculate confidence score based on model quality
 *
 * Higher confidence when:
 * - More training samples
 * - Recent model training
 * - Consistent cosine values
 *
 * @param model - GMIA model
 * @param cosineSimilarities - Array of cosine values from test
 * @returns Confidence score [0, 100]
 */
export function calculateConfidence(model: GMIAModel, cosineSimilarities: number[]): number {
  // Guard against empty array (would cause NaN)
  if (cosineSimilarities.length === 0) {
    return 0;
  }

  // Base confidence from mean cosine similarity
  const meanCosine =
    cosineSimilarities.reduce((sum, val) => sum + val, 0) / cosineSimilarities.length;
  // Clamp negative values to 0 (negative cosine = poor match = low confidence)
  const baseConfidence = Math.max(0, meanCosine) * 100;

  // Penalty for high variance (inconsistent readings)
  const variance = calculateVariance(cosineSimilarities);
  const consistencyFactor = Math.exp(-variance * 10); // Lower variance = higher consistency

  // Age penalty (model older than 30 days)
  const ageInDays = (Date.now() - model.trainingDate) / (1000 * 60 * 60 * 24);
  const ageFactor = Math.max(0.7, 1 - ageInDays / 365); // Gradual decline over a year

  // Combined confidence
  const confidence = baseConfidence * consistencyFactor * ageFactor;

  return Math.max(0, Math.min(100, confidence));
}

/**
 * Generate complete diagnosis result
 *
 * @param model - Trained GMIA model
 * @param cosineSimilarities - Cosine similarities from inference
 * @param machineId - Machine identifier
 * @returns Complete diagnosis result
 */
export function generateDiagnosisResult(
  model: GMIAModel,
  cosineSimilarities: number[],
  machineId: string
): DiagnosisResult {
  // Guard against empty array (would cause NaN)
  if (cosineSimilarities.length === 0) {
    throw new Error('Cannot generate diagnosis result with empty cosine similarities array');
  }

  // Average cosine similarity
  const avgCosine =
    cosineSimilarities.reduce((sum, val) => sum + val, 0) / cosineSimilarities.length;

  // Calculate health score
  const healthScore = calculateHealthScore(avgCosine, model.scalingConstant);

  // Get user-configured thresholds from settings
  const settings = getRecordingSettings();
  const healthyThreshold = settings.confidenceThreshold;
  const faultyThreshold = settings.faultyThreshold;

  // Classify status using user's configured thresholds
  const status = classifyHealthStatus(healthScore, healthyThreshold, faultyThreshold);

  // Calculate confidence
  const confidence = calculateConfidence(model, cosineSimilarities);

  // Generate unique ID with timestamp + random suffix to prevent collisions
  const uniqueId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return {
    id: uniqueId,
    machineId,
    timestamp: Date.now(),
    healthScore: Math.round(healthScore * 10) / 10, // Round to 1 decimal
    rawCosineSimilarity: Math.round(avgCosine * 10000) / 10000, // Round to 4 decimals
    confidence: Math.round(confidence * 10) / 10,
    status,
    analysis: generateAnalysisHints(healthScore, status),
  };
}

/**
 * Generate analysis hints based on results
 *
 * @param healthScore - Calculated health score
 * @param status - Health status
 * @returns Analysis object with hints
 */
function generateAnalysisHints(
  healthScore: number,
  status: 'healthy' | 'uncertain' | 'faulty'
): DiagnosisResult['analysis'] {
  const hints: string[] = [];

  if (status === 'healthy') {
    hints.push(t('scoring.hints.matchesReference'));
    if (healthScore < 85) {
      hints.push(t('scoring.hints.minorDeviations'));
    }
  } else if (status === 'uncertain') {
    hints.push(t('scoring.hints.moderateDeviation'));
    hints.push(t('scoring.hints.recommendInspection'));
  } else {
    hints.push(t('scoring.hints.significantAnomaly'));
    hints.push(t('scoring.hints.immediateInspection'));
  }

  return {
    hint: hints.join(' '),
  };
}

/**
 * Calculate variance of array
 *
 * @param values - Input values
 * @returns Variance
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return variance;
}

/**
 * Calculate health score statistics for multiple measurements
 *
 * @param scores - Array of health scores
 * @returns Statistics object
 */
export function calculateScoreStatistics(scores: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (scores.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const mean = scores.reduce((sum, val) => sum + val, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  const variance = calculateVariance(scores);
  const stdDev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 10) / 10,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
  };
}

/**
 * Compare two health scores to detect degradation
 *
 * @param previousScore - Previous health score
 * @param currentScore - Current health score
 * @returns Degradation percentage (positive = getting worse)
 */
export function calculateDegradation(previousScore: number, currentScore: number): number {
  const degradation = previousScore - currentScore;
  return Math.round(degradation * 10) / 10;
}

/**
 * Score history buffer size for filtering
 */
export const SCORE_HISTORY_SIZE = 10;

/**
 * UI Post-Processing Filter for score smoothing
 *
 * Filtering strategy:
 * 1. Take last 10 calculated scores
 * 2. Sort by value
 * 3. Remove 2 highest values
 * 4. Remove 2 lowest values
 * 5. Calculate mean of remaining 6 values
 *
 * This prevents display "jitter" and provides stable readings.
 *
 * @param scores - Array of recent health scores (should contain at least SCORE_HISTORY_SIZE values)
 * @returns Filtered (smoothed) health score
 */
export function filterHealthScoreForDisplay(scores: number[]): number {
  // CRITICAL FIX: Filter out invalid values (NaN, Infinity, out of range) FIRST
  // This prevents NaN propagation through reduce() operations
  const validScores = scores.filter((s) => isFinite(s) && s >= 0 && s <= 100);

  if (validScores.length === 0) {
    logger.warn('No valid scores in history, returning 0');
    return 0;
  }

  // Need at least SCORE_HISTORY_SIZE scores for proper filtering
  if (validScores.length < SCORE_HISTORY_SIZE) {
    // Fallback: return mean of available valid scores
    return validScores.reduce((sum, val) => sum + val, 0) / validScores.length;
  }

  // Take last SCORE_HISTORY_SIZE scores
  const lastN = validScores.slice(-SCORE_HISTORY_SIZE);

  // Sort ascending
  const sorted = [...lastN].sort((a, b) => a - b);

  // Remove 2 lowest (indices 0, 1) and 2 highest (indices 8, 9)
  const trimmed = sorted.slice(2, 8);

  // Guard against empty array (should not happen after validation, but prevents division by zero)
  if (trimmed.length === 0) {
    return sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
  }

  // Calculate mean of remaining 6 values
  const mean = trimmed.reduce((sum, val) => sum + val, 0) / trimmed.length;

  return Math.round(mean * 10) / 10; // Round to 1 decimal
}

/**
 * Score History Manager
 *
 * Manages a rolling buffer of health scores for filtering.
 */
export class ScoreHistory {
  private scores: number[] = [];
  private maxSize: number = SCORE_HISTORY_SIZE;

  /**
   * Add a new score to the history
   *
   * @param score - Health score to add
   */
  addScore(score: number): void {
    this.scores.push(score);

    // Keep only last maxSize scores
    if (this.scores.length > this.maxSize) {
      this.scores.shift();
    }
  }

  /**
   * Get filtered score for display
   *
   * @returns Filtered health score
   */
  getFilteredScore(): number {
    return filterHealthScoreForDisplay(this.scores);
  }

  /**
   * Get all scores
   *
   * @returns Array of all scores
   */
  getAllScores(): number[] {
    return [...this.scores];
  }

  /**
   * Clear all scores
   */
  clear(): void {
    this.scores = [];
  }

  /**
   * Check if history has enough scores for reliable filtering
   *
   * @returns True if >= SCORE_HISTORY_SIZE scores available
   */
  hasFullHistory(): boolean {
    return this.scores.length >= SCORE_HISTORY_SIZE;
  }
}

/**
 * Label History Manager
 *
 * Manages a rolling buffer of detected state labels for majority voting.
 * Prevents inconsistent diagnoses where filtered score indicates healthy
 * but label comes from a single noisy chunk.
 */
export class LabelHistory {
  private labels: string[] = [];
  private maxSize: number = SCORE_HISTORY_SIZE; // Use same buffer size as scores

  /**
   * Add a new label to the history
   *
   * @param label - State label to add
   */
  addLabel(label: string): void {
    this.labels.push(label);

    // Keep only last maxSize labels
    if (this.labels.length > this.maxSize) {
      this.labels.shift();
    }
  }

  /**
   * Get most frequent label (majority voting)
   *
   * @returns Most common label, or 'UNKNOWN' if no labels available
   */
  getMajorityLabel(): string {
    if (this.labels.length === 0) {
      logger.warn('⚠️ Label history empty, returning UNKNOWN');
      return 'UNKNOWN';
    }

    // Count occurrences of each label
    const counts = new Map<string, number>();
    for (const label of this.labels) {
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    // Find label with highest count
    let maxCount = 0;
    let majorityLabel = 'UNKNOWN';
    // OPTIMIZATION: Direct iteration without intermediate array allocation
    // Using for...of with counts.entries() is more efficient than Array.from().forEach()
    for (const [label, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        majorityLabel = label;
      }
    }

    // CRITICAL FIX: Check if all labels are UNKNOWN despite having full history
    // This indicates diagnosis has completely failed (should not happen in normal operation)
    if (majorityLabel === 'UNKNOWN' && this.labels.length >= this.maxSize) {
      logger.error(
        `❌ All labels in full history are UNKNOWN (${this.labels.length} labels) - diagnosis failed completely`
      );
      logger.error(`   This indicates a critical issue with feature extraction or model inference`);
    }

    return majorityLabel;
  }

  /**
   * Get all labels
   *
   * @returns Array of all labels
   */
  getAllLabels(): string[] {
    return [...this.labels];
  }

  /**
   * Clear all labels
   */
  clear(): void {
    this.labels = [];
  }

  /**
   * Check if history has enough labels for reliable voting
   *
   * @returns True if >= SCORE_HISTORY_SIZE labels available
   */
  hasFullHistory(): boolean {
    return this.labels.length >= SCORE_HISTORY_SIZE;
  }
}

/**
 * Multiclass Diagnosis - Classify machine state across multiple trained models
 *
 * Algorithm:
 * 1. Loop through all trained models
 * 2. For each model: Calculate cosine similarity → health score
 * 3. Find model with highest score
 * 4. Check uncertainty threshold (< 70% = UNKNOWN anomaly)
 * 5. Return diagnosis with best matching state
 *
 * CRITICAL: Validates sample rate compatibility before inference.
 * All models must have been trained at the same sample rate as the test data.
 *
 * @param models - Array of trained GMIA models (each representing a machine state)
 * @param featureVector - Feature vector from test audio
 * @param testSampleRate - Sample rate of the test audio (required for validation)
 * @returns Diagnosis result with identified state
 * @throws Error if sample rates don't match between models and test data
 */
export function classifyDiagnosticState(
  models: GMIAModel[],
  featureVector: FeatureVector,
  testSampleRate: number
): DiagnosisResult {
  if (models.length === 0) {
    throw new Error('No reference models available for classification');
  }

  // Initialize tracking variables
  let bestScore = 0;
  let bestLabel = 'UNKNOWN';
  let bestModel: GMIAModel | null = null;
  let bestCosine = 0;
  let bestDebug:
    | {
        weightMagnitude: number;
        featureMagnitude: number;
        magnitudeFactor: number;
        cosine: number;
        adjustedCosine: number;
        scalingConstant: number;
        rawScore: number;
      }
    | null = null;

  // Loop through all models to find best match
  for (const model of models) {
    // Step 1: Calculate cosine similarity using existing GMIA inference
    // CRITICAL: Pass testSampleRate for validation
    const cosineSimilarities = inferGMIA(model, [featureVector], testSampleRate);
    const cosine = cosineSimilarities[0];

    // Step 2: Calculate magnitude adjustment + health score
    const magnitudeFactor = calculateMagnitudeFactor(model.weightVector, featureVector.features);
    const adjustedCosine = cosine * magnitudeFactor;
    const rawScore = calculateHealthScore(adjustedCosine, model.scalingConstant);
    let score = rawScore;

    // Step 2.5: SCORE CALIBRATION - Normalize using baseline score
    // ============================================================================
    // If the model has a baseline score (self-recognition score from training),
    // normalize the raw score to ensure perfect matches show 100%.
    //
    // Formula: CalibratedScore = (RawScore / BaselineScore) * 100
    // Cap at 100% to prevent scores > 100%
    //
    // Example:
    //   Raw Score: 92%, Baseline: 92% → Calibrated: 100%
    //   Raw Score: 85%, Baseline: 92% → Calibrated: 92.4%
    //   Raw Score: 46%, Baseline: 92% → Calibrated: 50%
    //
    // Fallback: If no baseline score exists (old models), use raw score as-is.
    // This maintains backward compatibility with existing models.
    // ============================================================================
    let calibratedScore = score;
    if (model.baselineScore && model.baselineScore > 0) {
      const baselineRawScore = score;
      calibratedScore = (score / model.baselineScore) * 100;
      calibratedScore = Math.min(100, calibratedScore); // Cap at 100%

      logger.debug(
        `📊 Score Calibration for "${model.label}": Raw=${baselineRawScore.toFixed(1)}%, Baseline=${model.baselineScore.toFixed(1)}%, Calibrated=${calibratedScore.toFixed(1)}%`
      );

      score = calibratedScore; // Use calibrated score for comparison
    } else {
      logger.debug(
        `📊 No baseline score for "${model.label}" - using raw score (backward compatibility)`
      );
    }

    // DEBUG LOGGING: Show comparison for each model
    logger.debug(`📊 Model "${model.label}" evaluation:`, {
      cosine: cosine.toFixed(4),
      magnitudeFactor: magnitudeFactor.toFixed(4),
      adjustedCosine: adjustedCosine.toFixed(4),
      rawScore: rawScore.toFixed(1),
      baselineScore: model.baselineScore?.toFixed(1) || 'N/A',
      calibratedScore: calibratedScore.toFixed(1),
    });

    // Step 3: Check if this is the best match so far
    if (score > bestScore) {
      bestScore = score;
      bestLabel = model.label;
      bestModel = model;
      bestCosine = cosine;
      bestDebug = {
        weightMagnitude: vectorMagnitude(model.weightVector),
        featureMagnitude: vectorMagnitude(featureVector.features),
        magnitudeFactor,
        cosine,
        adjustedCosine,
        scalingConstant: model.scalingConstant,
        rawScore,
      };
    }
  }

  // Step 4: Uncertainty check - is the best score too low?
  let status: DiagnosisResult['status'];
  // Get user-configured confidence threshold from settings
  const settings = getRecordingSettings();
  const uncertaintyThreshold = settings.confidenceThreshold;

  // CRITICAL FIX: Check bestModel === null FIRST to prevent null reference error
  // This ensures we never access bestModel.type when bestModel is null
  if (bestModel === null || bestScore < uncertaintyThreshold) {
    // Anomaly detected, but doesn't match any known pattern
    // OR all scores were zero/negative (bestModel remains null)
    status = 'uncertain';
    bestLabel = 'UNKNOWN';
  } else {
    // Matched a known state - use model's type directly
    // This allows multiple healthy states (e.g., "Idle", "Full Load") and multiple faults
    // bestModel is guaranteed to be non-null here due to the check above
    status = bestModel.type; // 'healthy' or 'faulty' from the winning model
  }

  // Generate diagnosis result with debug information
  const diagnosis: DiagnosisResult = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    machineId: bestModel?.machineId || models[0].machineId,
    timestamp: Date.now(),
    healthScore: Math.round(bestScore * 10) / 10,
    status,
    confidence: calculateConfidenceFromScore(bestScore),
    rawCosineSimilarity: Math.round(bestCosine * 10000) / 10000,
    metadata: {
      detectedState: bestLabel,
      multiclassMode: true,
      evaluatedModels: models.length,
      // DEBUG INFO: Add detailed calculation values for troubleshooting
      debug: bestModel
        ? bestDebug ?? {
            weightMagnitude: vectorMagnitude(bestModel.weightVector),
            featureMagnitude: vectorMagnitude(featureVector.features),
            magnitudeFactor: 1,
            cosine: bestCosine,
            adjustedCosine: bestCosine,
            scalingConstant: bestModel.scalingConstant,
            rawScore: bestScore,
          }
        : undefined,
    },
    analysis: {
      hint: generateMulticlassHint(bestScore, bestLabel, status),
    },
  };

  return diagnosis;
}

/**
 * Score data for a single work point (model)
 */
export interface WorkPointScore {
  /** Name/label of the state */
  label: string;
  /** Score [0-100] */
  score: number;
  /** Whether this is a healthy state */
  isHealthy: boolean;
  /** Training date (if available) */
  trainingDate?: number;
}

/**
 * Get all model scores for ranking visualization.
 *
 * This function calculates scores for ALL trained models (not just the best match)
 * to provide a complete probability distribution view for the WorkPointRanking component.
 *
 * @param models - Array of GMIA models to evaluate
 * @param featureVector - Test feature vector from current audio
 * @param testSampleRate - Sample rate of test audio
 * @returns Array of WorkPointScore sorted by score (highest first)
 */
export function getAllModelScores(
  models: GMIAModel[],
  featureVector: FeatureVector,
  testSampleRate: number
): WorkPointScore[] {
  if (models.length === 0) {
    return [];
  }

  const scores: WorkPointScore[] = [];

  for (const model of models) {
    try {
      // Calculate cosine similarity using existing GMIA inference
      const cosineSimilarities = inferGMIA(model, [featureVector], testSampleRate);
      const cosine = cosineSimilarities[0];

      // Calculate magnitude adjustment + health score
      const magnitudeFactor = calculateMagnitudeFactor(model.weightVector, featureVector.features);
      const adjustedCosine = cosine * magnitudeFactor;
      let score = calculateHealthScore(adjustedCosine, model.scalingConstant);

      // Apply score calibration if baseline exists
      if (model.baselineScore && model.baselineScore > 0) {
        score = (score / model.baselineScore) * 100;
        score = Math.min(100, Math.max(0, score)); // Clamp to [0, 100]
      }

      scores.push({
        label: model.label,
        score: Math.round(score * 10) / 10, // Round to 1 decimal
        isHealthy: model.type === 'healthy',
        trainingDate: model.trainingDate,
      });
    } catch (error) {
      logger.warn(`Failed to calculate score for model "${model.label}":`, error);
    }
  }

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Calculate magnitude factor for cosine similarity adjustment.
 *
 * NOTE: This function always returns 1.0 (no adjustment).
 * The original GMIA algorithm uses pure cosine similarity without magnitude scaling.
 *
 * Magnitude-based adjustments were considered but removed due to:
 * - Feature standardization produces very small weight magnitudes (~1e-6)
 * - Threshold-based rejection was too aggressive
 * - RMS amplitude check in qualityCheck.ts provides adequate signal validation
 *
 * @param _weightVector - Model weight vector (unused)
 * @param _featureVector - Test feature vector (unused)
 * @returns Always 1.0 (no magnitude adjustment)
 */
export function calculateMagnitudeFactor(
  _weightVector: Float64Array,
  _featureVector: Float64Array
): number {
  return 1.0;
}


/**
 * Calculate confidence from score for multiclass diagnosis
 *
 * @param score - Health score [0, 100]
 * @returns Confidence [0, 100]
 */
function calculateConfidenceFromScore(score: number): number {
  // Higher scores = higher confidence
  // Use exponential curve to emphasize high scores
  const normalized = score / 100;
  const confidence = Math.pow(normalized, 0.8) * 100;
  return Math.round(confidence * 10) / 10;
}

/**
 * Generate analysis hint for multiclass diagnosis
 *
 * @param score - Health score
 * @param label - Detected state label
 * @param status - Status category
 * @returns Hint text
 */
function generateMulticlassHint(
  score: number,
  label: string,
  status: DiagnosisResult['status']
): string {
  if (status === 'uncertain') {
    return t('scoring.multiclass.noMatch', { score: score.toFixed(1) });
  }

  if (status === 'healthy') {
    return t('scoring.multiclass.healthy', { label, score: score.toFixed(1) });
  }

  // status === 'faulty'
  return t('scoring.multiclass.faulty', { label, score: score.toFixed(1) });
}

// ============================================================================
// AUTO-DETECTION: MULTI-MACHINE CLASSIFICATION
// Used for automatic machine recognition in "Zustand prüfen" flow
// ============================================================================

/**
 * Compare audio against a single machine's reference models
 *
 * @param machine - Machine with reference models to compare against
 * @param featureVector - Feature vector from test audio
 * @param testSampleRate - Sample rate of test audio
 * @returns Match result for this machine
 */
export function classifyAgainstMachine(
  machine: Machine,
  featureVector: FeatureVector,
  testSampleRate: number
): MachineMatchResult {
  // Filter models by sample rate
  const compatibleModels = machine.referenceModels?.filter(
    (model) => model.sampleRate === testSampleRate
  ) || [];

  // No compatible models
  if (compatibleModels.length === 0) {
    return {
      machine,
      bestModel: null,
      similarity: 0,
      rawCosine: 0,
      detectedState: 'UNKNOWN',
      status: 'uncertain',
    };
  }

  // Use existing multiclass classification
  try {
    const diagnosis = classifyDiagnosticState(compatibleModels, featureVector, testSampleRate);

    // Find the best matching model
    const bestModel = compatibleModels.find(
      (m) => m.label === diagnosis.metadata?.detectedState
    ) || compatibleModels[0];

    return {
      machine,
      bestModel,
      similarity: diagnosis.healthScore,
      rawCosine: diagnosis.rawCosineSimilarity || 0,
      detectedState: (diagnosis.metadata?.detectedState as string) || 'UNKNOWN',
      status: diagnosis.status,
    };
  } catch (error) {
    logger.warn(`Error classifying against machine ${machine.name}:`, error);
    return {
      machine,
      bestModel: null,
      similarity: 0,
      rawCosine: 0,
      detectedState: 'UNKNOWN',
      status: 'uncertain',
    };
  }
}

/**
 * Compare audio against ALL machines in the database
 *
 * This is the core function for automatic machine recognition.
 * It compares the test audio against all machines and determines:
 * - High confidence (≥80%): Automatic recognition
 * - Uncertain (40-79%): Show selection to user
 * - No match (<40%): Unknown sound
 *
 * @param machines - All machines to compare against
 * @param featureVector - Feature vector from test audio
 * @param testSampleRate - Sample rate of test audio
 * @returns Auto-detection result with outcome and candidates
 */
export function classifyAcrossAllMachines(
  machines: Machine[],
  featureVector: FeatureVector,
  testSampleRate: number
): AutoDetectionResult {
  const timestamp = Date.now();

  // Filter machines that have reference models
  const machinesWithModels = machines.filter(
    (m) => m.referenceModels && m.referenceModels.length >= AUTO_DETECTION_THRESHOLDS.MIN_MODELS
  );

  if (machinesWithModels.length === 0) {
    logger.info('🔍 Auto-detection: No machines with reference models found');
    return {
      outcome: 'no_match',
      bestMatch: null,
      candidates: [],
      timestamp,
      featureVector,
    };
  }

  // Compare against all machines
  const candidates: MachineMatchResult[] = [];

  for (const machine of machinesWithModels) {
    const result = classifyAgainstMachine(machine, featureVector, testSampleRate);
    candidates.push(result);
  }

  // Sort by similarity (highest first)
  candidates.sort((a, b) => b.similarity - a.similarity);

  // Determine outcome based on best match
  const bestMatch = candidates[0] || null;
  const bestSimilarity = bestMatch?.similarity || 0;

  let outcome: AutoDetectionResult['outcome'];

  if (bestSimilarity >= AUTO_DETECTION_THRESHOLDS.HIGH_CONFIDENCE) {
    outcome = 'high_confidence';
    logger.info(
      `✅ Auto-detection: High confidence match! ${bestMatch?.machine.name} (${bestSimilarity.toFixed(1)}%)`
    );
  } else if (bestSimilarity >= AUTO_DETECTION_THRESHOLDS.LOW_CONFIDENCE) {
    outcome = 'uncertain';
    logger.info(
      `⚠️ Auto-detection: Uncertain match. Best: ${bestMatch?.machine.name} (${bestSimilarity.toFixed(1)}%)`
    );
  } else {
    outcome = 'no_match';
    logger.info(
      `❌ Auto-detection: No match found. Best similarity: ${bestSimilarity.toFixed(1)}%`
    );
  }

  return {
    outcome,
    bestMatch,
    candidates,
    timestamp,
    featureVector,
  };
}

/**
 * Get top candidates for user selection (Fall B: uncertain match)
 *
 * Filters candidates above the minimum threshold and returns them
 * for display to the user.
 *
 * @param result - Auto-detection result
 * @param maxCandidates - Maximum number of candidates to return (default: 5)
 * @returns Filtered candidates above minimum threshold
 */
export function getTopCandidates(
  result: AutoDetectionResult,
  maxCandidates: number = 5
): MachineMatchResult[] {
  return result.candidates
    .filter((c) => c.similarity >= AUTO_DETECTION_THRESHOLDS.LOW_CONFIDENCE)
    .slice(0, maxCandidates);
}
