/**
 * ZANOBOT - FLEET / SCORE STATISTICS HELPERS
 *
 * Pure, stateless statistics used by the Identify phase for the dashboard trend
 * and the fleet ranking (median, MAD-based outlier threshold, spread). No
 * component state and no DOM — trivially unit-testable.
 */

/** Median of a list of numbers (0 for an empty list). */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Fleet statistics result. */
export interface FleetStats {
  median: number;
  mad: number;
  outlierThreshold: number;
  min: number;
  max: number;
  spread: number;
  count: number;
}

/**
 * Robust fleet statistics from a set of scores: median, MAD (median absolute
 * deviation), an outlier threshold (median − 2·MAD) and the min/max spread.
 * Returns null for fewer than two scores.
 */
export function calculateFleetStats(scores: number[]): FleetStats | null {
  if (scores.length < 2) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  // Median
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  // MAD (Median Absolute Deviation)
  const deviations = sorted.map((s) => Math.abs(s - median));
  deviations.sort((a, b) => a - b);
  const mad =
    deviations.length % 2 === 0
      ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
      : deviations[Math.floor(deviations.length / 2)];

  // Outlier threshold: below this = orange
  // Guard: if MAD is 0 (all scores identical), threshold = median - 5
  const effectiveMAD = mad > 0 ? mad : 2.5;
  const outlierThreshold = median - 2 * effectiveMAD;

  return {
    median,
    mad,
    outlierThreshold,
    min: sorted[0],
    max: sorted[n - 1],
    spread: sorted[n - 1] - sorted[0],
    count: n,
  };
}
