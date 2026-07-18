/**
 * ZANOBOT · Mess-Labor — classification evaluation (pure)
 *
 * Variant B measures Zanobot's ACTUAL field workflow instead of the one-class
 * AUC: several good AND several bad recordings are registered as separate
 * fingerprints, a live clip is matched against ALL of them (best match wins),
 * and the user's confidence threshold decides healthy / uncertain / faulty.
 *
 * These helpers are pure and unit-tested in isolation from the engines:
 *  - decideClip: best-match + threshold decision (mirrors classify()).
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

export interface ClipDecision {
  /** Decision with the confidence threshold applied (may be 'uncertain'). */
  predicted: PredClass;
  /** Pure best-match class, threshold ignored (never 'uncertain'). */
  predictedFree: 'healthy' | 'faulty';
  /** Winning fingerprint's score. */
  score: number;
}

/**
 * Best-match decision for one clip, mirroring Zanobot's classify(): the highest-
 * scoring fingerprint wins; below the confidence threshold the verdict is
 * 'uncertain'. The threshold-free verdict keeps the winner's type regardless.
 */
export function decideClip(scores: FingerprintScore[], confidenceThreshold: number): ClipDecision {
  if (scores.length === 0) {
    return { predicted: 'uncertain', predictedFree: 'healthy', score: 0 };
  }
  let best = scores[0];
  for (const s of scores) if (s.score > best.score) best = s;
  return {
    predicted: best.score < confidenceThreshold ? 'uncertain' : best.type,
    predictedFree: best.type,
    score: best.score,
  };
}

/** A fingerprint's aggregated clip score together with its identity. */
export interface LabeledFingerprintScore extends FingerprintScore {
  /** Display label of the fingerprint (e.g. "Referenz", "Gut #2", file name). */
  label: string;
}

export interface WinnerDecision extends ClipDecision {
  /** Label of the winning fingerprint ('' when none scored). */
  winnerLabel: string;
}

/**
 * Best-match decision that also reports WHICH fingerprint won — used by the
 * interactive (phone-simulation) mode, where the user wants to see the matched
 * state by name, exactly like the detected-state label on the phone.
 */
export function decideWithWinner(
  scores: LabeledFingerprintScore[],
  confidenceThreshold: number
): WinnerDecision {
  if (scores.length === 0) {
    return { predicted: 'uncertain', predictedFree: 'healthy', score: 0, winnerLabel: '' };
  }
  let best = scores[0];
  for (const s of scores) if (s.score > best.score) best = s;
  return {
    predicted: best.score < confidenceThreshold ? 'uncertain' : best.type,
    predictedFree: best.type,
    score: best.score,
    winnerLabel: best.label,
  };
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

/** Tally one clip's decision into the confusion matrix. */
export function addDecision(c: Confusion, trueClass: TrueClass, d: ClipDecision): void {
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
