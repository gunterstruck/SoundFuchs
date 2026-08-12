/**
 * ZANOBOT · Mess-Labor — classification evaluation (pure)
 *
 * Variant B measures Zanobot's ACTUAL field workflow instead of the one-class
 * AUC: good (and optionally bad) recordings are registered as separate
 * fingerprints and a test clip is matched against all of them.
 *
 * `phoneVerdict` is the ONLY decision rule here, and it mirrors the shipped
 * live loop (`3-Diagnose.ts`) exactly: healthy and faulty fingerprints are
 * evaluated in SEPARATE pools, the gauge is the best healthy score, a
 * confidently matched fault forces 'faulty', and otherwise BOTH user thresholds
 * map the healthy score to a status.
 *
 * A simpler rule used to live here (one pool, winner's type wins, one
 * threshold) and was what the benchmark actually graded. It is gone: it ignored
 * `faultyThreshold` entirely and could never return 'faulty' for a clip that
 * matched nothing — so it understated both false alarms and detections, i.e. it
 * made every engine look quieter than it is. A rule the app does not ship must
 * not be reachable from the measuring instrument.
 *
 * These helpers are pure and unit-tested in isolation from the engines:
 *  - phoneVerdict: the live loop's two-pool verdict.
 *  - confusion matrix accumulation over clips/runs.
 *  - metrics: hit rates, accuracy, uncertain rate (threshold-based + free).
 */

/** Ground-truth class of a test clip. */
export type TrueClass = 'normal' | 'abnormal';

/** Predicted class with the user's threshold applied. */
export type PredClass = 'healthy' | 'uncertain' | 'faulty';

/** One reference fingerprint's aggregated score for a clip + its labelled type. */
export interface FingerprintScore {
  score: number; // 0–100 clip-level health score of this fingerprint
  type: 'healthy' | 'faulty';
}

/** A fingerprint's aggregated clip score together with its identity. */
export interface LabeledFingerprintScore extends FingerprintScore {
  /** Display label of the fingerprint (e.g. "Referenz", "Gut #2", file name). */
  label: string;
}

/**
 * The verdict of one check, mirroring the 3-Diagnose live loop: healthy and
 * faulty fingerprints are evaluated SEPARATELY. The gauge (healthScore) shows
 * closeness to the best HEALTHY reference; a confidently matched FAULT
 * reference forces status 'faulty' regardless of how clean the healthy score
 * looks. Otherwise both thresholds map the healthy score to a status
 * (mirrors scoring.classifyHealthStatus: ≥confidence → healthy,
 * ≥faulty → uncertain, else faulty).
 */
export interface PhoneVerdict {
  /** The phone gauge: best score against a HEALTHY fingerprint. */
  healthScore: number;
  status: PredClass;
  /**
   * Threshold-free reading of the same two-pool logic: whichever pool matched
   * better wins, never 'uncertain'. Lets the benchmark report an accuracy that
   * does not depend on where the user put the thresholds — same role as
   * `ClipDecision.predictedFree`.
   */
  predictedFree: 'healthy' | 'faulty';
  /** Label shown on the phone: the fault when detected, else best healthy. */
  detectedState: string;
  faultDetected: boolean;
  bestFaultyScore: number;
  bestFaultyLabel: string;
}

export function phoneVerdict(
  scores: Array<FingerprintScore & { label: string }>,
  confidenceThreshold: number,
  faultyThreshold: number
): PhoneVerdict {
  let bestHealthy = 0;
  let bestHealthyLabel = '';
  let bestFaulty = 0;
  let bestFaultyLabel = '';
  let hasFault = false;
  for (const s of scores) {
    if (s.type === 'healthy') {
      if (s.score > bestHealthy) {
        bestHealthy = s.score;
        bestHealthyLabel = s.label;
      }
    } else {
      hasFault = true;
      if (s.score > bestFaulty) {
        bestFaulty = s.score;
        bestFaultyLabel = s.label;
      }
    }
  }

  const faultDetected = hasFault && bestFaulty >= confidenceThreshold;
  const status: PredClass = faultDetected
    ? 'faulty'
    : bestHealthy >= confidenceThreshold
      ? 'healthy'
      : bestHealthy >= faultyThreshold
        ? 'uncertain'
        : 'faulty';

  return {
    healthScore: bestHealthy,
    status,
    predictedFree: hasFault && bestFaulty > bestHealthy ? 'faulty' : 'healthy',
    detectedState: faultDetected ? bestFaultyLabel : bestHealthyLabel || 'UNKNOWN',
    faultDetected,
    bestFaultyScore: bestFaulty,
    bestFaultyLabel,
  };
}

/** Confusion counts: true class → predicted class tallies. */
export interface Confusion {
  normal: Record<PredClass, number>;
  abnormal: Record<PredClass, number>;
  /** Threshold-free tallies (no 'uncertain'). */
  free: {
    normal: { healthy: number; faulty: number };
    abnormal: { healthy: number; faulty: number };
  };
}

export function emptyConfusion(): Confusion {
  return {
    normal: { healthy: 0, uncertain: 0, faulty: 0 },
    abnormal: { healthy: 0, uncertain: 0, faulty: 0 },
    free: { normal: { healthy: 0, faulty: 0 }, abnormal: { healthy: 0, faulty: 0 } },
  };
}

/**
 * Tally one clip's verdict into the confusion matrix. Takes only the two fields
 * it needs, so a `PhoneVerdict` can be tallied directly without an adapter.
 */
export function addDecision(
  c: Confusion,
  trueClass: TrueClass,
  d: { predicted: PredClass; predictedFree: 'healthy' | 'faulty' }
): void {
  c[trueClass][d.predicted]++;
  c.free[trueClass][d.predictedFree]++;
}

/** Sum two confusion matrices (used to fold multiple runs together). */
export function mergeConfusion(a: Confusion, b: Confusion): Confusion {
  const out = emptyConfusion();
  for (const t of ['normal', 'abnormal'] as const) {
    for (const p of ['healthy', 'uncertain', 'faulty'] as const) {
      out[t][p] = a[t][p] + b[t][p];
    }
    for (const p of ['healthy', 'faulty'] as const) {
      out.free[t][p] = a.free[t][p] + b.free[t][p];
    }
  }
  return out;
}

export interface ClassifyMetrics {
  /** normal correctly seen as healthy / all normal. */
  recallGood: number;
  /** abnormal correctly seen as faulty / all abnormal. */
  recallBad: number;
  /** (normal→healthy + abnormal→faulty) / all, with the threshold applied. */
  accuracy: number;
  /** share of clips the threshold pushed to 'uncertain'. */
  uncertainRate: number;
  /** accuracy of the pure best-match (threshold ignored). */
  accuracyFree: number;
  nNormal: number;
  nAbnormal: number;
}

/** Derive the headline metrics from an accumulated confusion matrix. */
export function metricsOf(c: Confusion): ClassifyMetrics {
  const nNormal = c.normal.healthy + c.normal.uncertain + c.normal.faulty;
  const nAbnormal = c.abnormal.healthy + c.abnormal.uncertain + c.abnormal.faulty;
  const total = nNormal + nAbnormal;
  const uncertain = c.normal.uncertain + c.abnormal.uncertain;
  const correctFree = c.free.normal.healthy + c.free.abnormal.faulty;
  return {
    recallGood: nNormal > 0 ? c.normal.healthy / nNormal : NaN,
    recallBad: nAbnormal > 0 ? c.abnormal.faulty / nAbnormal : NaN,
    accuracy: total > 0 ? (c.normal.healthy + c.abnormal.faulty) / total : NaN,
    uncertainRate: total > 0 ? uncertain / total : NaN,
    accuracyFree: total > 0 ? correctFree / total : NaN,
    nNormal,
    nAbnormal,
  };
}
