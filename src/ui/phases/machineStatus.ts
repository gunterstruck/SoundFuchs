/**
 * ZANOBOT - MACHINE STATUS / BASELINE-QUALITY HELPERS
 *
 * Pure, stateless helpers extracted from the Identify phase for deriving a
 * machine's reference-quality rating from its trained models. No component
 * state and no DOM — trivially unit-testable.
 */

import type { Machine } from '@data/types.js';

/** Reference-quality rating categories used by the machine card badge. */
export type BaselineRating = 'good' | 'ok' | 'unknown';

/**
 * Sprint 3 UX: Average baseline (self-recognition) score across all of a
 * machine's reference models. Returns 0 when no model carries a score.
 */
export function getAverageBaselineScore(machine: Machine): number {
  const models = machine.referenceModels || [];
  const scores = models
    .map((m) => m.baselineScore)
    .filter((s): s is number => s !== undefined && s !== null);

  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Sprint 3 UX: Map an average baseline score to a rating category.
 * ≥ 90 = good, ≥ 75 = ok, otherwise unknown.
 */
export function getBaselineRating(score: number): BaselineRating {
  if (score >= 90) return 'good';
  if (score >= 75) return 'ok';
  return 'unknown';
}
