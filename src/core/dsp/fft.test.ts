/**
 * ZANOBOT - FFT TESTS
 *
 * Tests for Fast Fourier Transform implementation
 */

import { describe, it, expect } from 'vitest';
import { fft, getMagnitude, applyHanningWindow, padToPowerOfTwo } from './fft.js';

describe('FFT', () => {
  describe('fft()', () => {
    it('should compute FFT of a constant signal (DC component)', () => {
      // DC signal: all samples have value 1
      const signal = new Float32Array([1, 1, 1, 1]);
      const result = fft(signal);

      // DC component should be at index 0
      expect(result[0].real).toBeCloseTo(4, 5);
      expect(result[0].imag).toBeCloseTo(0, 5);

      // Other frequencies should be ~0
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i].real)).toBeLessThan(0.0001);
        expect(Math.abs(result[i].imag)).toBeLessThan(0.0001);
      }
    });

    it('should compute FFT of a sine wave', () => {
      // Generate sine wave: 1 cycle in 8 samples
      const n = 8;
      const signal = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        signal[i] = Math.sin((2 * Math.PI * i) / n);
      }

      const result = fft(signal);
      const magnitude = getMagnitude(result);

      // Peak should be at frequency bin 1 (and 7 due to symmetry)
      expect(magnitude[1]).toBeGreaterThan(3);
      expect(magnitude[7]).toBeGreaterThan(3);

      // Other bins should be small
      expect(magnitude[0]).toBeLessThan(0.0001);
      expect(magnitude[2]).toBeLessThan(0.0001);
    });

    it('should throw error for non-power-of-2 length', () => {
      const signal = new Float32Array([1, 2, 3]);
      expect(() => fft(signal)).toThrow('FFT input length must be power of 2');
    });

    it('should handle large inputs without stack overflow', () => {
      // Test with 32768 samples (previous recursive version would fail)
      const n = 32768;
      const signal = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        signal[i] = Math.sin((2 * Math.PI * i * 440) / 44100); // 440 Hz tone
      }

      // Should not throw stack overflow
      expect(() => fft(signal)).not.toThrow();
    });

    it("should preserve energy (Parseval's theorem)", () => {
      const signal = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = fft(signal);

      // Time-domain energy
      let timeEnergy = 0;
      for (let i = 0; i < signal.length; i++) {
        timeEnergy += signal[i] * signal[i];
      }

      // Frequency-domain energy
      let freqEnergy = 0;
      for (let i = 0; i < result.length; i++) {
        const mag = Math.sqrt(result[i].real ** 2 + result[i].imag ** 2);
        freqEnergy += mag * mag;
      }
      freqEnergy /= signal.length;

      expect(freqEnergy).toBeCloseTo(timeEnergy, 1);
    });
  });

  describe('getMagnitude()', () => {
    it('should calculate magnitude correctly', () => {
      const fftResult = [
        { real: 3, imag: 4 }, // magnitude = 5
        { real: 5, imag: 12 }, // magnitude = 13
        { real: 8, imag: 15 }, // magnitude = 17
      ];

      const magnitude = getMagnitude(fftResult);

      expect(magnitude[0]).toBeCloseTo(5, 5);
      expect(magnitude[1]).toBeCloseTo(13, 5);
      expect(magnitude[2]).toBeCloseTo(17, 5);
    });
  });

  describe('applyHanningWindow()', () => {
    it('should apply Hanning window (endpoints near zero)', () => {
      const signal = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
      const windowed = applyHanningWindow(signal);

      // Endpoints should be close to 0
      expect(windowed[0]).toBeCloseTo(0, 5);
      expect(windowed[7]).toBeCloseTo(0, 5);

      // Middle should be close to 1
      expect(windowed[3]).toBeCloseTo(1, 1);
      expect(windowed[4]).toBeCloseTo(1, 1);
    });

    it('should preserve array length', () => {
      const signal = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const windowed = applyHanningWindow(signal);

      expect(windowed.length).toBe(signal.length);
    });
  });

  describe('padToPowerOfTwo()', () => {
    it('should pad to next power of 2', () => {
      const signal = new Float32Array([1, 2, 3]);
      const padded = padToPowerOfTwo(signal);

      expect(padded.length).toBe(4); // Next power of 2
      expect(padded[0]).toBe(1);
      expect(padded[1]).toBe(2);
      expect(padded[2]).toBe(3);
      expect(padded[3]).toBe(0); // Zero-padded
    });

    it('should not pad if already power of 2', () => {
      const signal = new Float32Array([1, 2, 3, 4]);
      const padded = padToPowerOfTwo(signal);

      expect(padded.length).toBe(4);
      expect(padded).toBe(signal); // Same reference
    });

    it('should handle large arrays', () => {
      const signal = new Float32Array(1000);
      const padded = padToPowerOfTwo(signal);

      expect(padded.length).toBe(1024); // 2^10
    });
  });
});
