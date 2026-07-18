/**
 * ZANOBO - Haptic Feedback Utilities
 *
 * Provides score-based vibration patterns for diagnosis results.
 * Vibration API is not supported on iOS Safari – all calls are
 * feature-gated and fail silently.
 */

import { logger } from './logger.js';

/**
 * Vibration patterns by severity.
 * Designed to be distinguishable in a loud industrial environment:
 * - OK: Single short pulse (confidence signal)
 * - Warning: Double pulse (attention signal)
 * - Critical: Triple pulse (alarm signal)
 */
const PATTERNS = {
  ok:       [200],                      // 1× 200ms – „alles gut"
  warning:  [200, 100, 200],            // 2× 200ms mit 100ms Pause
  critical: [200, 100, 200, 100, 200],  // 3× 200ms mit je 100ms Pause
} as const;

/**
 * Thresholds aligned with the existing status classification:
 * - >= 75: HEALTHY / Unauffällig  → ok
 * - >= 50: WARNING / Abweichung   → warning
 * - <  50: CRITICAL / Auffällig   → critical
 *
 * These match the thresholds in 3-Diagnose.ts getStatusFromScore().
 */
const SCORE_THRESHOLD_HEALTHY = 75;
const SCORE_THRESHOLD_WARNING = 50;

/**
 * Trigger haptic feedback based on a health score.
 *
 * @param score - Health score 0–100
 * @returns true if vibration was triggered, false if not supported
 */
export function hapticForScore(score: number): boolean {
  if (!navigator.vibrate) {
    logger.debug('Haptics: Vibration API not supported');
    return false;
  }

  let pattern: readonly number[];
  if (score >= SCORE_THRESHOLD_HEALTHY) {
    pattern = PATTERNS.ok;
  } else if (score >= SCORE_THRESHOLD_WARNING) {
    pattern = PATTERNS.warning;
  } else {
    pattern = PATTERNS.critical;
  }

  try {
    navigator.vibrate([...pattern]); // Spread to mutable array
    logger.debug(`Haptics: score=${score.toFixed(1)} → pattern=${pattern.join(',')}`);
    return true;
  } catch {
    logger.debug('Haptics: vibrate() threw');
    return false;
  }
}

/**
 * Simple confirmation vibration (e.g., after saving).
 */
export function hapticConfirm(): boolean {
  if (!navigator.vibrate) return false;
  try {
    navigator.vibrate(100);
    return true;
  } catch {
    return false;
  }
}
