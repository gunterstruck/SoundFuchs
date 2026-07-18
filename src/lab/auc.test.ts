import { describe, it, expect } from 'vitest';
import { auc, pAUC } from './auc.js';

describe('auc', () => {
  it('returns 1.0 for perfect separation (all abnormal above all normal)', () => {
    const labels = [0, 0, 0, 1, 1, 1];
    const scores = [1, 2, 3, 4, 5, 6];
    expect(auc(labels, scores)).toBe(1);
  });

  it('returns 0.0 for perfectly inverted separation', () => {
    const labels = [1, 1, 1, 0, 0, 0];
    const scores = [1, 2, 3, 4, 5, 6];
    expect(auc(labels, scores)).toBe(0);
  });

  it('computes the probability over interleaved scores', () => {
    const labels = [0, 1, 0, 1, 0, 1];
    const scores = [1, 2, 3, 4, 5, 6];
    // normals 1,3,5 ; abnormals 2,4,6 → favorable pairs 1+2+3 of 9 = 2/3
    expect(auc(labels, scores)).toBeCloseTo(2 / 3, 10);
  });

  it('returns ~0.5 for a symmetric non-separating arrangement', () => {
    // normals and abnormals share the same score multiset → no separation
    const labels = [0, 1, 0, 1];
    const scores = [1, 1, 2, 2];
    expect(auc(labels, scores)).toBeCloseTo(0.5, 10);
  });

  it('handles ties via average ranks (all scores equal → 0.5)', () => {
    const labels = [0, 0, 1, 1];
    const scores = [5, 5, 5, 5];
    expect(auc(labels, scores)).toBeCloseTo(0.5, 10);
  });

  it('matches the probabilistic definition on a small mixed example', () => {
    // normals: 0.1, 0.4 ; abnormals: 0.35, 0.8
    // pairs (ab,no): (0.35,0.1)=1 (0.35,0.4)=0 (0.8,0.1)=1 (0.8,0.4)=1 → 3/4
    const labels = [0, 0, 1, 1];
    const scores = [0.1, 0.4, 0.35, 0.8];
    expect(auc(labels, scores)).toBeCloseTo(0.75, 10);
  });

  it('returns NaN when a class is missing', () => {
    expect(Number.isNaN(auc([0, 0, 0], [1, 2, 3]))).toBe(true);
    expect(Number.isNaN(auc([1, 1], [1, 2]))).toBe(true);
    expect(Number.isNaN(auc([], []))).toBe(true);
  });

  it('throws on length mismatch', () => {
    expect(() => auc([0, 1], [1])).toThrow();
  });
});

describe('pAUC', () => {
  it('is 1.0 for perfect separation within the low-FPR region', () => {
    const labels = [0, 0, 0, 1, 1, 1];
    const scores = [1, 2, 3, 4, 5, 6];
    expect(pAUC(labels, scores, 0.1)).toBeCloseTo(1, 6);
  });

  it('returns NaN when a class is missing', () => {
    expect(Number.isNaN(pAUC([0, 0], [1, 2], 0.1))).toBe(true);
  });

  it('rejects an out-of-range maxFpr', () => {
    expect(() => pAUC([0, 1], [1, 2], 0)).toThrow();
    expect(() => pAUC([0, 1], [1, 2], 1.5)).toThrow();
  });

  it('full-range pAUC (maxFpr=1) equals the standard AUC', () => {
    const labels = [0, 0, 1, 1];
    const scores = [0.1, 0.4, 0.35, 0.8];
    expect(pAUC(labels, scores, 1)).toBeCloseTo(auc(labels, scores), 6);
  });

  it('raw-basis pAUC differs from capped-basis when healthy clips saturate at the ceiling', () => {
    // Motivation for computing the metric on the RAW similarity instead of the
    // tanh²-capped score: well-matching clips clamp to a health of 100 → anomaly
    // 0, piling up as TIES exactly in the low-FPR region the pAUC lives in.
    const labels = [0, 0, 0, 1, 1, 1];
    // Capped anomaly (100 − score): all healthy clamp to 0 AND one borderline
    // abnormal also clamps to 0 → it is tied with the healthy negatives.
    const capped = [0, 0, 0, 0, 8, 40];
    // Raw anomaly (1 − cosine): the same clips are slightly separated, so the
    // borderline abnormal now ranks just above every healthy clip.
    const raw = [0.02, 0.05, 0.09, 0.11, 0.3, 0.5];

    const pCapped = pAUC(labels, capped, 0.1);
    const pRaw = pAUC(labels, raw, 0.1);

    expect(pRaw).toBeCloseTo(1.0, 6); // raw separates perfectly in the low-FPR slice
    expect(pCapped).toBeLessThan(0.8); // ceiling ties drag the capped pAUC down
    expect(Math.abs(pRaw - pCapped)).toBeGreaterThan(0.1);
  });
});
