/**
 * ZANOBO – Trend Analysis Engine
 *
 * Detects declining health trends across multiple diagnoses.
 * Uses simple linear regression (no external libraries).
 * All processing happens offline.
 *
 * Welle 4: SV4 – Automatic degradation detection
 */

import type { DiagnosisResult } from '../data/types.js';

export type TrendCategory = 'critical_decline' | 'declining' | 'stable' | 'improving';

export interface TrendResult {
  category: TrendCategory;
  slope: number;              // Percentage points per check
  dataPoints: number;         // Number of diagnoses used
  firstScore: number;         // Oldest score in window
  lastScore: number;          // Newest score in window
  totalDelta: number;         // lastScore - firstScore
  message: string;            // Localized warning text
}

const MIN_DATA_POINTS = 4;
const MAX_DATA_POINTS = 10;
const SLOPE_THRESHOLD_DECLINING = -3;   // -3 PP/check
const SLOPE_THRESHOLD_CRITICAL = -5;    // -5 PP/check
const SLOPE_THRESHOLD_IMPROVING = 3;    // +3 PP/check
const SCORE_THRESHOLD_WARNING = 75;
const SCORE_THRESHOLD_CRITICAL = 50;

/**
 * Analyze the trend of a machine's health scores.
 *
 * @param diagnoses - Sorted by timestamp descending (newest first, as returned by DB)
 * @param translate - i18n translation function
 * @returns TrendResult or null if insufficient data
 */
export function analyzeTrend(
  diagnoses: DiagnosisResult[],
  translate: (key: string, params?: Record<string, string>) => string,
): TrendResult | null {
  if (diagnoses.length < MIN_DATA_POINTS) return null;

  // Take up to MAX_DATA_POINTS, then reverse to chronological order (oldest first)
  const recent = diagnoses.slice(0, MAX_DATA_POINTS).reverse();
  const n = recent.length;
  const scores = recent.map(d => d.healthScore);

  // Linear regression: y = slope * x + intercept
  const xMean = (n - 1) / 2;
  const yMean = scores.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (scores[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const lastScore = scores[n - 1];
  const firstScore = scores[0];
  const totalDelta = lastScore - firstScore;

  // Classify
  let category: TrendCategory;
  let message: string;

  if (slope < SLOPE_THRESHOLD_CRITICAL && lastScore < SCORE_THRESHOLD_CRITICAL) {
    category = 'critical_decline';
    message = translate('trendAnalysis.criticalDecline', {
      count: String(n),
      from: firstScore.toFixed(0),
      to: lastScore.toFixed(0),
    });
  } else if (slope < SLOPE_THRESHOLD_DECLINING && lastScore < SCORE_THRESHOLD_WARNING) {
    category = 'declining';
    message = translate('trendAnalysis.declining', {
      count: String(n),
      from: firstScore.toFixed(0),
      to: lastScore.toFixed(0),
    });
  } else if (slope > SLOPE_THRESHOLD_IMPROVING) {
    category = 'improving';
    message = translate('trendAnalysis.improving', {
      count: String(n),
      from: firstScore.toFixed(0),
      to: lastScore.toFixed(0),
    });
  } else {
    category = 'stable';
    message = '';
  }

  return { category, slope, dataPoints: n, firstScore, lastScore, totalDelta, message };
}
