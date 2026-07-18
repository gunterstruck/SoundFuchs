/**
 * ZANOBOT · Mess-Labor — AUC / pAUC (pure functions)
 *
 * The "Note" (grade) of the engine benchmark. An engine does not stamp
 * healthy/faulty; it emits a continuous anomaly value per clip. AUC summarises
 * how well those values separate normal (label 0) from abnormal (label 1)
 * clips, independent of any chosen threshold:
 *
 *   AUC = P( score(random abnormal) > score(random normal) )
 *
 * 1.0 = perfect separation, 0.5 = random. Implemented rank-based
 * (Mann–Whitney U) so ties are handled exactly via average ranks.
 *
 * These are pure, dependency-free and unit-tested in isolation from the
 * engines and the browser — exactly the contract of the build order.
 */

/**
 * Area under the ROC curve via the rank statistic (Mann–Whitney U).
 *
 * @param labels Per-clip ground truth: 0 = normal, 1 = abnormal.
 * @param scores Per-clip anomaly score (higher = more anomalous).
 * @returns AUC in [0,1], or NaN when one of the two classes is absent.
 */
export function auc(labels: number[], scores: number[]): number {
  if (labels.length !== scores.length) {
    throw new Error(`auc: labels (${labels.length}) and scores (${scores.length}) length mismatch`);
  }
  const n = labels.length;
  if (n === 0) return NaN;

  // Rank the scores ascending, assigning the average rank to tied groups.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[order[j + 1]] === scores[order[i]]) j++;
    // Ranks are 1-based; average rank for the tie group [i..j].
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }

  let nPos = 0;
  let sumRankPos = 0;
  for (let idx = 0; idx < n; idx++) {
    if (labels[idx] === 1) {
      nPos++;
      sumRankPos += ranks[idx];
    }
  }
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;

  // U = sumRankPos - nPos*(nPos+1)/2 ; AUC = U / (nPos*nNeg).
  const u = sumRankPos - (nPos * (nPos + 1)) / 2;
  return u / (nPos * nNeg);
}

/**
 * Partial AUC restricted to the low false-positive-rate region (FPR ≤ maxFpr),
 * normalised back to [0,1] over that region (McClish standardisation is NOT
 * applied; the raw partial area is divided by maxFpr so it stays comparable to
 * the full AUC scale). Useful because in condition monitoring only the
 * low-false-alarm part of the curve matters operationally.
 *
 * @param labels 0 = normal, 1 = abnormal.
 * @param scores anomaly score (higher = more anomalous).
 * @param maxFpr upper FPR bound of the region (default 0.1).
 * @returns pAUC in [0,1], or NaN when a class is absent.
 */
export function pAUC(labels: number[], scores: number[], maxFpr = 0.1): number {
  if (labels.length !== scores.length) {
    throw new Error('pAUC: labels and scores length mismatch');
  }
  if (!(maxFpr > 0 && maxFpr <= 1)) {
    throw new Error(`pAUC: maxFpr must be in (0,1], got ${maxFpr}`);
  }
  const n = labels.length;
  let nPos = 0;
  let nNeg = 0;
  for (const l of labels) {
    if (l === 1) nPos++;
    else nNeg++;
  }
  if (nPos === 0 || nNeg === 0) return NaN;

  // Sweep thresholds from high score to low, accumulating ROC points. Ties in
  // score are consumed together so a tied block moves TPR and FPR in one step.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  let tp = 0;
  let fp = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let area = 0;
  const fprCap = maxFpr;

  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && scores[order[j + 1]] === scores[order[k]]) j++;
    for (let m = k; m <= j; m++) {
      if (labels[order[m]] === 1) tp++;
      else fp++;
    }
    const fpr = fp / nNeg;
    const tpr = tp / nPos;

    // Trapezoid between previous and current point, clipped at fprCap.
    if (fpr <= fprCap) {
      area += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    } else if (prevFpr < fprCap) {
      // Linearly interpolate the TPR at the cap and add the final partial slice.
      const frac = (fprCap - prevFpr) / (fpr - prevFpr);
      const tprAtCap = prevTpr + frac * (tpr - prevTpr);
      area += ((fprCap - prevFpr) * (tprAtCap + prevTpr)) / 2;
      return area / fprCap;
    }
    prevFpr = fpr;
    prevTpr = tpr;
    k = j + 1;
  }
  // Curve never exceeded the cap (e.g. cap = 1): normalise by the reached FPR.
  return area / fprCap;
}
