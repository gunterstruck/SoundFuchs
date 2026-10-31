/**
 * GMIA-λ: optionale Regularisierung fürs Mess-Labor.
 *
 * 1. Ohne Angabe (und mit λ = 10^9) ist der Gewichtsvektor BITGLEICH zur
 *    bisherigen Rechnung w = X (XᵀX + 10^9 I)⁻¹ 1.
 * 2. relativeLambda = α · Spur(XᵀX) / N (Zahlenbeispiel).
 * 3. Großes α → w fast parallel zum Mittelspektrum; kleines α → deutlich anders.
 * 4. Konditionszahl wird nur auf Wunsch geschrieben und wächst mit kleinem α.
 */

import { describe, it, expect } from 'vitest';
import { trainGMIA, relativeLambda, conditionNumberSpd, LAMBDA } from './gmia.js';
import {
  featuresToMatrix,
  matrixTranspose,
  matrixMultiply,
  addRegularization,
  matrixInverse,
  onesVector,
  matrixVectorMultiply,
  cosineSimilarity,
} from './mathUtils.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import type { TrainingData } from '@data/types.js';
import { mulberry32 } from '@lab/rng.js';

/** N Frames à D Bins, je Frame auf Summe 1 normiert (wie die Produktion). */
function frames(n: number, d: number, seed: number): Float64Array[] {
  const rand = mulberry32(seed);
  const out: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Float64Array(d);
    let sum = 0;
    for (let k = 0; k < d; k++) {
      // gemeinsames Grundspektrum + zwei Frame-abhängige Komponenten + Rauschen
      const base = 1 / (1 + k);
      const mod =
        (i % 3 === 0 ? 0.8 : 0.1) * (k === 5 ? 1 : 0) + (i % 2) * 0.3 * (k === 11 ? 1 : 0);
      f[k] = base + mod + 0.05 * rand();
      sum += f[k];
    }
    for (let k = 0; k < d; k++) f[k] /= sum;
    out.push(f);
  }
  return out;
}

function td(features: Float64Array[]): TrainingData {
  return {
    featureVectors: features,
    machineId: 'm',
    recordingId: 'r',
    numSamples: features.length,
    config: { ...DEFAULT_DSP_CONFIG },
  };
}

function meanSpectrum(features: Float64Array[]): Float64Array {
  const m = new Float64Array(features[0].length);
  for (const f of features) for (let k = 0; k < f.length; k++) m[k] += f[k] / features.length;
  return m;
}

describe('trainGMIA mit optionalem λ', () => {
  const feats = frames(40, 32, 7);

  it('Standard-λ: bitgleich zur bisherigen Rechnung', () => {
    const X = featuresToMatrix(feats);
    const R = addRegularization(matrixMultiply(matrixTranspose(X), X), 1e9);
    const expected = matrixVectorMultiply(
      X,
      matrixVectorMultiply(matrixInverse(R), onesVector(feats.length))
    );

    const plain = trainGMIA(td(feats), 'm');
    const explicit = trainGMIA(td(feats), 'm', { lambda: LAMBDA });
    expect(LAMBDA).toBe(1e9);
    expect(Array.from(plain.weightVector)).toEqual(Array.from(expected));
    expect(Array.from(explicit.weightVector)).toEqual(Array.from(expected));
    expect(plain.regularization).toBe(1e9);
    expect(plain.metadata.conditionNumber).toBeUndefined();
  });

  it('relativeLambda = α · Spur(XᵀX) / N', () => {
    const f = [Float64Array.from([1, 2]), Float64Array.from([3, 0])];
    // Spur(XᵀX) = Σ‖x_i‖² = (1 + 4) + 9 = 14; N = 2 → 7 · α
    expect(relativeLambda(f, 1)).toBeCloseTo(7);
    expect(relativeLambda(f, 0.1)).toBeCloseTo(0.7);
    const model = trainGMIA(td(feats), 'm', { relativeAlpha: 0.1 });
    expect(model.regularization).toBeCloseTo(relativeLambda(feats, 0.1), 15);
  });

  it('großes α ≈ Mittelspektrum, kleines α weicht deutlich ab', () => {
    const mu = meanSpectrum(feats);
    const big = trainGMIA(td(feats), 'm', { relativeAlpha: 1000 });
    const small = trainGMIA(td(feats), 'm', { relativeAlpha: 1e-4 });
    expect(cosineSimilarity(big.weightVector, mu)).toBeGreaterThan(0.999);
    expect(cosineSimilarity(small.weightVector, mu)).toBeLessThan(0.99);
  });

  it('Konditionszahl nur auf Wunsch; ≈ 1 beim Standard, wächst mit kleinem α', () => {
    const std = trainGMIA(td(feats), 'm', { computeCondition: true });
    expect(std.metadata.conditionNumber).toBeGreaterThanOrEqual(1);
    expect(std.metadata.conditionNumber).toBeLessThan(1.0001);
    const a1 = trainGMIA(td(feats), 'm', { relativeAlpha: 1, computeCondition: true });
    const a3 = trainGMIA(td(feats), 'm', { relativeAlpha: 1e-3, computeCondition: true });
    expect(a3.metadata.conditionNumber!).toBeGreaterThan(a1.metadata.conditionNumber!);
    // Gewichtsvektor unabhängig davon, ob die Konditionszahl berechnet wird.
    const a1plain = trainGMIA(td(feats), 'm', { relativeAlpha: 1 });
    expect(Array.from(a1plain.weightVector)).toEqual(Array.from(a1.weightVector));
  });
});

describe('conditionNumberSpd', () => {
  it('trifft die Konditionszahl einer Diagonalmatrix', () => {
    const R = [
      Float64Array.from([4, 0, 0]),
      Float64Array.from([0, 2, 0]),
      Float64Array.from([0, 0, 1e-3]),
    ];
    const Rinv = R.map((row, i) => {
      const r = new Float64Array(3);
      r[i] = 1 / row[i];
      return r;
    });
    expect(conditionNumberSpd(R, Rinv)).toBeCloseTo(4000, 3);
  });
});
