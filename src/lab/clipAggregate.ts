/**
 * ZANOBOT · Mess-Labor — clip-score aggregation (pure)
 *
 * A 10-second recording yields many 330-ms frames, each with its own anomaly
 * value. The benchmark needs exactly ONE value per clip. Two honest reductions
 * are offered:
 *   - 'mean' : average anomaly over the clip (default; smooth, robust).
 *   - 'p90'  : the 90th percentile ("worst tenth"), which keeps short but
 *              strong transient anomalies that the mean would wash out.
 */

export type ClipAggMode = 'mean' | 'p90';

/** Default aggregation, referenced by the runner and the UI label. */
export const CLIP_AGG_DEFAULT: ClipAggMode = 'mean';

/**
 * Reduce per-frame anomaly values to a single clip value.
 *
 * @param frameScores anomaly per frame (any finite range; 0–100 in practice).
 * @param mode 'mean' or 'p90'.
 * @returns the aggregated clip value, or NaN for an empty input.
 */
export function clipAggregate(frameScores: number[], mode: ClipAggMode = CLIP_AGG_DEFAULT): number {
  const vals = frameScores.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return NaN;

  if (mode === 'mean') {
    let sum = 0;
    for (const v of vals) sum += v;
    return sum / vals.length;
  }

  // p90 — nearest-rank 90th percentile ("worst tenth").
  const sorted = [...vals].sort((a, b) => a - b);
  const rank = Math.ceil(0.9 * sorted.length); // 1-based rank
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}
