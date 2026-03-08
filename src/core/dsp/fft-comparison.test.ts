/**
 * ZANOBOT - FFT COMPARISON TEST
 *
 * Verifies that iterative FFT produces IDENTICAL results to recursive FFT.
 * This is critical to ensure compliance with GMIA algorithm requirements.
 */

import { describe, it, expect } from 'vitest';
import { fft, getMagnitude } from './fft.js';

// Import the recursive version for comparison (we need to temporarily expose it)
// For now, we'll create test vectors and compare against known good values

describe('FFT - Recursive vs Iterative Comparison', () => {
  /**
   * Helper: Calculate FFT using current implementation (iterative)
   */
  function calculateFFT(signal: Float32Array) {
    return fft(signal);
  }

  /**
   * Helper: Calculate reference FFT results (from known algorithm)
   * These values are computed from the Cooley-Tukey algorithm
   */
  function getReferenceDFT(signal: Float32Array) {
    const N = signal.length;
    const result: Array<{ real: number; imag: number }> = [];

    for (let k = 0; k < N; k++) {
      let real = 0;
      let imag = 0;

      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N;
        real += signal[n] * Math.cos(angle);
        imag += signal[n] * Math.sin(angle);
      }

      result.push({ real, imag });
    }

    return result;
  }

  /**
   * Compare two complex arrays with tolerance
   */
  function expectComplexArraysEqual(
    actual: Array<{ real: number; imag: number }>,
    expected: Array<{ real: number; imag: number }>,
    tolerance: number = 1e-10
  ) {
    expect(actual.length).toBe(expected.length);

    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].real).toBeCloseTo(expected[i].real, 10);
      expect(actual[i].imag).toBeCloseTo(expected[i].imag, 10);

      // Additional check: absolute difference should be less than tolerance
      const realDiff = Math.abs(actual[i].real - expected[i].real);
      const imagDiff = Math.abs(actual[i].imag - expected[i].imag);

      if (realDiff > tolerance) {
        throw new Error(
          `Real part mismatch at index ${i}: ${actual[i].real} vs ${expected[i].real} (diff: ${realDiff})`
        );
      }

      if (imagDiff > tolerance) {
        throw new Error(
          `Imag part mismatch at index ${i}: ${actual[i].imag} vs ${expected[i].imag} (diff: ${imagDiff})`
        );
      }
    }
  }

  it('should produce identical results to DFT for size 4', () => {
    const signal = new Float32Array([1, 2, 3, 4]);

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult);
  });

  it('should produce identical results to DFT for size 8', () => {
    const signal = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0]);

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult);
  });

  it('should produce identical results to DFT for sine wave', () => {
    const N = 16;
    const signal = new Float32Array(N);

    // Generate sine wave
    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin((2 * Math.PI * i) / N);
    }

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult);
  });

  it('should produce identical results to DFT for complex signal (size 32)', () => {
    const N = 32;
    const signal = new Float32Array(N);

    // Generate complex signal (multiple frequencies)
    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin((2 * Math.PI * i * 1) / N) + 0.5 * Math.cos((2 * Math.PI * i * 3) / N);
    }

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult);
  });

  it('should produce identical results for large signal (size 256)', () => {
    const N = 256;
    const signal = new Float32Array(N);

    // Generate random-like signal
    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin((2 * Math.PI * i * 5) / N) + 0.3 * Math.sin((2 * Math.PI * i * 17) / N);
    }

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult);
  });

  it('should produce identical magnitude spectrum', () => {
    const N = 64;
    const signal = new Float32Array(N);

    // Generate test signal
    for (let i = 0; i < N; i++) {
      signal[i] = Math.sin((2 * Math.PI * i * 4) / N);
    }

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    const iterativeMag = getMagnitude(iterativeResult);
    const referenceMag = getMagnitude(referenceResult);

    expect(iterativeMag.length).toBe(referenceMag.length);

    for (let i = 0; i < iterativeMag.length; i++) {
      expect(iterativeMag[i]).toBeCloseTo(referenceMag[i], 10);
    }
  });

  it('should match reference values for DC signal', () => {
    const signal = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);

    const result = calculateFFT(signal);

    // DC component should be 8
    expect(result[0].real).toBeCloseTo(8, 10);
    expect(result[0].imag).toBeCloseTo(0, 10);

    // All other components should be ~0
    for (let i = 1; i < result.length; i++) {
      expect(Math.abs(result[i].real)).toBeLessThan(1e-10);
      expect(Math.abs(result[i].imag)).toBeLessThan(1e-10);
    }
  });

  it('should preserve numerical precision for very small values', () => {
    const N = 16;
    const signal = new Float32Array(N);

    // Very small values
    for (let i = 0; i < N; i++) {
      signal[i] = 1e-10 * Math.sin((2 * Math.PI * i) / N);
    }

    const iterativeResult = calculateFFT(signal);
    const referenceResult = getReferenceDFT(signal);

    expectComplexArraysEqual(iterativeResult, referenceResult, 1e-15);
  });

  it('should handle edge case: all zeros', () => {
    const signal = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);

    const result = calculateFFT(signal);

    // All components should be 0
    for (let i = 0; i < result.length; i++) {
      expect(Math.abs(result[i].real)).toBeLessThan(1e-15);
      expect(Math.abs(result[i].imag)).toBeLessThan(1e-15);
    }
  });

  it('should handle edge case: single impulse', () => {
    const signal = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);

    const result = calculateFFT(signal);
    const reference = getReferenceDFT(signal);

    expectComplexArraysEqual(result, reference);
  });
});
