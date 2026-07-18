/**
 * ZANOBOT - DIAGNOSE SCORE FORMATTING
 *
 * Pure, stateless score → text mapping extracted from the Diagnose phase.
 * No component state and no DOM, so it is trivially unit-testable.
 */

import { t } from '../../i18n/index.js';

/**
 * Map a health score (0–100) to a localized verbal status used on the
 * inspection, live, and result displays.
 * ≥85 consistent · ≥70 slight deviation · ≥50 significant change · else strong deviation.
 */
export function getScoreVerbalStatus(score: number): string {
  if (score >= 85) return t('status.consistent');
  if (score >= 70) return t('status.slightDeviation');
  if (score >= 50) return t('status.significantChange');
  return t('status.strongDeviation');
}
