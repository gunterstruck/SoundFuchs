/**
 * ZANOBOT - FFT RECURSIVE vs ITERATIVE DIRECT COMPARISON
 *
 * CRITICAL TEST: Ensures that the new iterative FFT produces
 * IDENTICAL results to the old recursive FFT.
 *
 * This validates compliance with GMIA algorithm requirements.
 */

import { describe, it, expect } from 'vitest';
import { fftRecursive, fftIterative } from './fft.js';

interface Complex {
  real: number;
  imag: number;
}

describe('FFT - DIRECT Recursive vs Iterative Comparison', () => {
  /**
   * Compare two complex arrays with strict tolerance
   */
  function expectIdenticalResults(iterative: Complex[], recursive: Complex[], testName: string) {
    expect(iterative.length).toBe(recursive.length);

    let maxRealDiff = 0;
    let maxImagDiff = 0;

    for (let i = 0; i < iterative.length; i++) {
      const realDiff = Math.abs(iterative[i].real - recursive[i].real);
      const imagDiff = Math.abs(iterative[i].imag - recursive[i].imag);

      maxRealDiff = Math.max(maxRealDiff, realDiff);
      maxImagDiff = Math.max(maxImagDiff, imagDiff);

      // Strict comparison - must be identical to at least 10 decimal places
      expect(iterative[i].real).toBeCloseTo(recursive[i].real, 10);
      expect(iterative[i].imag).toBeCloseTo(recursive[i].imag, 10);

      // Additional check: absolute difference should be < 1e-10
      if (realDiff > 1e-10) {
        throw new Error(
          `${testName}: Real mismatch at index ${i}: ${iterative[i].real} vs ${recursive[i].real} (diff: ${realDiff})`
        );
      }

      if (imagDiff > 1e-10) {
        throw new Error(
          `${testName}: Imag mismatch at index ${i}: ${iterative[i].imag} vs ${recursive[i].imag} (diff: ${imagDiff})`
        );
      }
    }

    console.log(
      `${testName}: Max diff - Real: ${maxRealDiff.toExponential(3)}, Imag: ${maxImagDiff.toExponential(3)}`
    );
  }

  it('CRITICAL: Size 4 - Simple case', () => {
    const input: Complex[] = [
      { real: 1, imag: 0 },
      { real: 2, imag: 0 },
      { real: 3, imag: 0 },
      { real: 4, imag: 0 },
    ];

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 4');
  });

  it('CRITICAL: Size 8 - Alternating pattern', () => {
    const input: Complex[] = [];
    for (let i = 0; i < 8; i++) {
      input.push({ real: i % 2, imag: 0 });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 8');
  });

  it('CRITICAL: Size 16 - Sine wave', () => {
    const N = 16;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: Math.sin((2 * Math.PI * i) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 16 - Sine');
  });

  it('CRITICAL: Size 32 - Multi-frequency signal', () => {
    const N = 32;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: Math.sin((2 * Math.PI * i * 1) / N) + 0.5 * Math.cos((2 * Math.PI * i * 3) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 32 - Multi-freq');
  });

  it('CRITICAL: Size 64 - Complex signal', () => {
    const N = 64;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: Math.sin((2 * Math.PI * i * 4) / N) + 0.3 * Math.sin((2 * Math.PI * i * 11) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 64');
  });

  it('CRITICAL: Size 128 - Random-like signal', () => {
    const N = 128;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real:
          Math.sin((2 * Math.PI * i * 7) / N) +
          0.5 * Math.cos((2 * Math.PI * i * 13) / N) +
          0.3 * Math.sin((2 * Math.PI * i * 23) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 128');
  });

  it('CRITICAL: Size 256 - Large signal (typical audio chunk)', () => {
    const N = 256;
    const input: Complex[] = [];

    // Simulate typical audio chunk
    for (let i = 0; i < N; i++) {
      input.push({
        real:
          0.8 * Math.sin((2 * Math.PI * i * 5) / N) +
          0.4 * Math.sin((2 * Math.PI * i * 17) / N) +
          0.2 * Math.cos((2 * Math.PI * i * 31) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 256');
  });

  it('CRITICAL: Size 512 - Actual GMIA feature dimension', () => {
    const N = 512;
    const input: Complex[] = [];

    // This is the actual size used in GMIA!
    for (let i = 0; i < N; i++) {
      input.push({
        real: Math.sin((2 * Math.PI * i * 3) / N) + 0.5 * Math.sin((2 * Math.PI * i * 7) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 512 - GMIA');
  });

  it('CRITICAL: Size 1024 - Extended test', () => {
    const N = 1024;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: Math.sin((2 * Math.PI * i * 11) / N) + 0.3 * Math.sin((2 * Math.PI * i * 23) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Size 1024');
  });

  it('CRITICAL: DC signal (all ones)', () => {
    const input: Complex[] = [];
    for (let i = 0; i < 16; i++) {
      input.push({ real: 1, imag: 0 });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'DC signal');

    // Extra validation: DC component should be N
    expect(iterative[0].real).toBeCloseTo(16, 10);
    expect(iterative[0].imag).toBeCloseTo(0, 10);
  });

  it('CRITICAL: Impulse signal', () => {
    const input: Complex[] = [];
    for (let i = 0; i < 32; i++) {
      input.push({ real: i === 0 ? 1 : 0, imag: 0 });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Impulse');

    // Extra validation: Impulse should give all components = 1
    for (let i = 0; i < 32; i++) {
      expect(iterative[i].real).toBeCloseTo(1, 10);
      expect(iterative[i].imag).toBeCloseTo(0, 10);
    }
  });

  it('CRITICAL: Very small values (precision test)', () => {
    const N = 64;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: 1e-10 * Math.sin((2 * Math.PI * i) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Small values');
  });

  it('CRITICAL: Large values (overflow test)', () => {
    const N = 16;
    const input: Complex[] = [];

    for (let i = 0; i < N; i++) {
      input.push({
        real: 1e6 * Math.sin((2 * Math.PI * i) / N),
        imag: 0,
      });
    }

    const iterative = fftIterative([...input]);
    const recursive = fftRecursive([...input]);

    expectIdenticalResults(iterative, recursive, 'Large values');
  });
});
