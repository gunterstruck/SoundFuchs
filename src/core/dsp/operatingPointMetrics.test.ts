/**
 * ZANOBOT - OPERATING POINT METRICS TESTS
 *
 * Tests for the OperatingPointMetrics class, including:
 * - Warmup phase (stability-based baseline capture)
 * - Baseline commit logic (stable vs. forced)
 * - Live-phase metric computation
 * - Reset behaviour
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OperatingPointMetrics } from './operatingPointMetrics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;
const FREQUENCY_BINS = 512;

/**
 * Generate a stable feature vector (normalised, sum ~ 1).
 * Peaks at a given bin to simulate a dominant spectral peak.
 */
function makeFeatures(peakBin: number = 50, spread: number = 5): Float64Array {
  const f = new Float64Array(FREQUENCY_BINS);
  let sum = 0;
  for (let i = 0; i < FREQUENCY_BINS; i++) {
    const dist = Math.abs(i - peakBin);
    f[i] = Math.exp(-(dist * dist) / (2 * spread * spread));
    sum += f[i];
  }
  // Normalise
  for (let i = 0; i < FREQUENCY_BINS; i++) {
    f[i] /= sum;
  }
  return f;
}

/**
 * Generate a slightly different feature vector (shifted peak).
 */
function makeShiftedFeatures(peakBin: number = 150, spread: number = 5): Float64Array {
  return makeFeatures(peakBin, spread);
}

/**
 * Feed N identical (stable) frames.
 */
function feedStableFrames(
  metrics: OperatingPointMetrics,
  n: number,
  rms: number = 0.05,
  peakBin: number = 50,
  scoreHistory: number[] = [90, 92, 88]
): void {
  const features = makeFeatures(peakBin);
  for (let i = 0; i < n; i++) {
    metrics.update(features, rms, scoreHistory);
  }
}

/**
 * Feed N chaotic (unstable) frames — alternating between two very different spectra.
 */
function feedUnstableFrames(
  metrics: OperatingPointMetrics,
  n: number,
  rms: number = 0.05,
  scoreHistory: number[] = [90, 92, 88]
): void {
  for (let i = 0; i < n; i++) {
    const features = i % 2 === 0 ? makeFeatures(50, 5) : makeFeatures(300, 5);
    metrics.update(features, rms, scoreHistory);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OperatingPointMetrics', () => {
  let metrics: OperatingPointMetrics;

  beforeEach(() => {
    metrics = new OperatingPointMetrics(SAMPLE_RATE, FFT_SIZE, FREQUENCY_BINS);
  });

  // -------------------------------------------------------------------------
  // Warmup phase
  // -------------------------------------------------------------------------

  describe('Warmup phase', () => {
    it('should start in initializing state', () => {
      expect(metrics.isInitializing).toBe(true);
      expect(metrics.getResult()).toBeNull();
    });

    it('should remain initializing with fewer than 8 stable frames', () => {
      feedStableFrames(metrics, 5);
      expect(metrics.isInitializing).toBe(true);
      const result = metrics.getResult();
      expect(result).not.toBeNull();
      expect(result!.isInitializing).toBe(true);
    });

    it('should show placeholder values during warmup', () => {
      feedStableFrames(metrics, 3);
      const result = metrics.getResult()!;
      expect(result.isInitializing).toBe(true);
      expect(result.energyDelta.displayValue).toBe('-- dB');
      expect(result.frequencyDelta.displayValue).toBe('-- Hz');
    });

    it('should not show operatingPointChanged during warmup', () => {
      feedStableFrames(metrics, 5);
      const result = metrics.getResult()!;
      expect(result.operatingPointChanged).toBe(false);
    });

    it('should skip silent chunks (rms < 1e-8)', () => {
      const features = makeFeatures();
      metrics.update(features, 0, [90]);
      metrics.update(features, 1e-9, [90]);
      expect(metrics.isInitializing).toBe(true);
      expect(metrics.getResult()).toBeNull(); // no valid frame received
    });

    it('should still track stability metric during warmup', () => {
      feedStableFrames(metrics, 6);
      const result = metrics.getResult()!;
      // Stability should be available (and high, since frames are identical)
      expect(result.stability.value).toBeGreaterThan(80);
    });
  });

  // -------------------------------------------------------------------------
  // Baseline commit — stable
  // -------------------------------------------------------------------------

  describe('Baseline commit (stable)', () => {
    it('should commit baseline after min 8 frames with 5 consecutive stable frames', () => {
      // Need at least 8 frames total AND 5 consecutive stable frames
      // Frame 1: no comparison yet (no previous)
      // Frame 2-6: 5 comparisons, all stable → streak = 5
      // But we also need >= 8 frames total
      // So: feed 8 stable frames — streak starts at frame 2, by frame 8 streak = 7
      feedStableFrames(metrics, 8);

      // Should have committed by now (8 frames + stable streak >= 5)
      // After commit, next frame goes into live phase
      const features = makeFeatures(50);
      metrics.update(features, 0.05, [90]);
      const result = metrics.getResult()!;
      expect(result.isInitializing).toBe(false);
    });

    it('should transition from initializing to live after baseline commit', () => {
      feedStableFrames(metrics, 12);
      expect(metrics.isInitializing).toBe(false);
      const result = metrics.getResult()!;
      expect(result.isInitializing).toBe(false);
      // Energy and frequency should now show real values, not placeholders
      expect(result.energyDelta.displayValue).not.toBe('-- dB');
      expect(result.frequencyDelta.displayValue).not.toBe('-- Hz');
    });
  });

  // -------------------------------------------------------------------------
  // Baseline commit — forced (max frames)
  // -------------------------------------------------------------------------

  describe('Baseline commit (forced)', () => {
    it('should force-commit baseline after 30 frames even if unstable', () => {
      // Feed 30 unstable frames
      feedUnstableFrames(metrics, 30);

      // Should have force-committed at frame 30
      // Feed one more to enter live phase
      const features = makeFeatures(50);
      metrics.update(features, 0.05, [90]);
      const result = metrics.getResult()!;
      expect(result.isInitializing).toBe(false);
    });

    it('should not commit before 30 frames if signal remains unstable', () => {
      feedUnstableFrames(metrics, 25);
      expect(metrics.isInitializing).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Live phase — metric computation
  // -------------------------------------------------------------------------

  describe('Live phase metrics', () => {
    beforeEach(() => {
      // Get past warmup: 12 stable frames is enough
      feedStableFrames(metrics, 12);
    });

    it('should compute energy delta near 0 dB when RMS matches baseline', () => {
      feedStableFrames(metrics, 5, 0.05);
      const result = metrics.getResult()!;
      expect(Math.abs(result.energyDelta.value)).toBeLessThan(1);
      expect(result.energyDelta.status).toBe('green');
    });

    it('should flag energy delta yellow/red for significant RMS changes', () => {
      // Double the RMS → ~+6 dB
      feedStableFrames(metrics, 5, 0.10);
      const result = metrics.getResult()!;
      expect(result.energyDelta.value).toBeGreaterThan(2);
      expect(['yellow', 'red']).toContain(result.energyDelta.status);
    });

    it('should compute frequency delta near 0% when spectrum matches baseline', () => {
      feedStableFrames(metrics, 5, 0.05, 50);
      const result = metrics.getResult()!;
      expect(Math.abs(result.frequencyDelta.value)).toBeLessThan(5);
      expect(result.frequencyDelta.status).toBe('green');
    });

    it('should flag frequency delta when spectrum shifts significantly', () => {
      // Shift peak from bin 50 to bin 65 — within PEAK_MATCH_MAX_DISTANCE (20 bins)
      // but still a ~30% frequency shift (~646 Hz)
      const shifted = makeShiftedFeatures(65, 5);
      for (let i = 0; i < 10; i++) {
        metrics.update(shifted, 0.05, [90]);
      }
      const result = metrics.getResult()!;
      expect(Math.abs(result.frequencyDelta.value)).toBeGreaterThan(5);
    });

    it('should show high stability for identical frames', () => {
      feedStableFrames(metrics, 15, 0.05);
      const result = metrics.getResult()!;
      expect(result.stability.value).toBeGreaterThan(90);
      expect(result.stability.status).toBe('green');
    });

    it('should set operatingPointChanged when energy is red', () => {
      // 10x RMS → ~+20 dB
      feedStableFrames(metrics, 5, 0.50);
      const result = metrics.getResult()!;
      expect(result.energyDelta.status).toBe('red');
      expect(result.operatingPointChanged).toBe(true);
    });

    it('should compute P10 from score history', () => {
      const scores = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
      feedStableFrames(metrics, 3, 0.05, 50, scores);
      const result = metrics.getResult()!;
      // P10 of [50..95] → ~55
      expect(result.similarityP10.value).toBeGreaterThanOrEqual(50);
      expect(result.similarityP10.value).toBeLessThanOrEqual(60);
    });

    it('should format energy display value with sign and unit', () => {
      feedStableFrames(metrics, 5, 0.05);
      const result = metrics.getResult()!;
      expect(result.energyDelta.displayValue).toMatch(/[+-]?\d+\.\d+ dB/);
    });

    it('isInitializing should be false in live phase', () => {
      expect(metrics.isInitializing).toBe(false);
      const result = metrics.getResult()!;
      expect(result.isInitializing).toBe(false);
    });

    it('should remain stable when peak amplitudes change but positions stay', () => {
      // Feed frames where two peaks stay at the same position (bin 50 and bin 200)
      // but their amplitudes fluctuate inversely.
      // With a single-centroid approach this would cause large jumps;
      // With multi-peak tracking the shift should stay near 0%.
      for (let i = 0; i < 10; i++) {
        const features = new Float64Array(FREQUENCY_BINS);
        // Peak at bin 50 with varying amplitude
        const amp = 0.3 + 0.4 * Math.sin(i);
        for (let j = 0; j < FREQUENCY_BINS; j++) {
          const dist = Math.abs(j - 50);
          features[j] = amp * Math.exp(-(dist * dist) / 50);
        }
        // Second peak at bin 200 with inverse amplitude
        const amp2 = 0.7 - 0.4 * Math.sin(i);
        for (let j = 0; j < FREQUENCY_BINS; j++) {
          const dist = Math.abs(j - 200);
          features[j] += amp2 * Math.exp(-(dist * dist) / 50);
        }
        // Normalize
        let sum = 0;
        for (let j = 0; j < FREQUENCY_BINS; j++) sum += features[j];
        for (let j = 0; j < FREQUENCY_BINS; j++) features[j] /= sum;

        metrics.update(features, 0.05, [90]);
      }

      const result = metrics.getResult()!;
      // With multi-peak tracking: shift should be near 0 Hz (peaks didn't move)
      expect(Math.abs(result.frequencyDelta.value)).toBeLessThan(3);
      expect(result.frequencyDelta.status).toBe('green');
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('Reset', () => {
    it('should return to initializing state after reset', () => {
      feedStableFrames(metrics, 12);
      expect(metrics.isInitializing).toBe(false);

      metrics.reset();

      expect(metrics.isInitializing).toBe(true);
      expect(metrics.getResult()).toBeNull();
    });

    it('should require new warmup after reset', () => {
      feedStableFrames(metrics, 12);
      metrics.reset();

      // Feed only 3 frames — should still be initializing
      feedStableFrames(metrics, 3);
      expect(metrics.isInitializing).toBe(true);
      expect(metrics.getResult()!.isInitializing).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle empty score history gracefully', () => {
      feedStableFrames(metrics, 12, 0.05, 50, []);
      const result = metrics.getResult()!;
      expect(result.similarityP10.value).toBe(0);
    });

    it('should handle very low RMS (near silence threshold)', () => {
      const features = makeFeatures();
      metrics.update(features, 1e-7, []); // just above threshold
      expect(metrics.getResult()).not.toBeNull();
    });

    it('should use median for baseline (robust against outliers)', () => {
      // Feed 7 frames at rms=0.05, then 1 outlier at rms=0.50, then stable again
      const features = makeFeatures(50);
      for (let i = 0; i < 7; i++) {
        metrics.update(features, 0.05, [90]);
      }
      // Outlier
      metrics.update(features, 0.50, [90]);
      // More stable frames to reach streak
      for (let i = 0; i < 6; i++) {
        metrics.update(features, 0.05, [90]);
      }

      // Should be in live phase now
      expect(metrics.isInitializing).toBe(false);

      // Energy delta should be near 0 when feeding 0.05 RMS
      // because median of [0.05 x7, 0.50, 0.05 x6] ≈ 0.05
      feedStableFrames(metrics, 3, 0.05);
      const result = metrics.getResult()!;
      expect(Math.abs(result.energyDelta.value)).toBeLessThan(2);
    });
  });
});
