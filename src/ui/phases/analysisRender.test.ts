import { describe, it, expect } from 'vitest';
import { topDeviations } from './analysisRender.js';

/**
 * topDeviations() finds frequency bands where the measurement adds relative
 * energy over the reference and scores how "new" each band is (0–100 %).
 */
describe('topDeviations', () => {
  const nyquist = 1000; // Hz; with n bins, bin i ≈ (i/n)*nyquist

  it('returns nothing when measurement matches the reference', () => {
    const ref = new Float64Array(64).fill(1);
    const meas = new Float64Array(64).fill(1);
    expect(topDeviations(ref, meas, nyquist)).toEqual([]);
  });

  it('flags a new tone that is absent from the reference', () => {
    const n = 64;
    const ref = new Float64Array(n).fill(1);
    const meas = new Float64Array(n).fill(1);
    // Inject a strong peak the reference does not have, around bin 32.
    meas[31] = 8;
    meas[32] = 12;
    meas[33] = 8;

    const out = topDeviations(ref, meas, nyquist);
    expect(out.length).toBeGreaterThan(0);

    const top = out[0];
    // Peak near bin 32 → ~ (32/64)*1000 = 500 Hz.
    expect(top.frequency).toBeGreaterThan(440);
    expect(top.frequency).toBeLessThan(560);
    // Mostly new energy → high strength.
    expect(top.strength).toBeGreaterThan(50);
    expect(top.strength).toBeLessThanOrEqual(100);
  });

  it('sorts strongest-first and respects maxCount', () => {
    const n = 128;
    const ref = new Float64Array(n).fill(1);
    const meas = new Float64Array(n).fill(1);
    // A fully-new strong peak and a milder one elsewhere.
    meas[20] = 20; // strong/new
    meas[80] = 3; // mild bump
    const out = topDeviations(ref, meas, nyquist, 1);
    expect(out.length).toBe(1);
    // The single returned feature should be the strong new peak near bin 20.
    expect(out[0].frequency).toBeGreaterThan(120);
    expect(out[0].frequency).toBeLessThan(200);
  });

  it('is robust to empty / degenerate input', () => {
    expect(topDeviations(new Float64Array(0), new Float64Array(0), nyquist)).toEqual([]);
    expect(topDeviations(new Float64Array(64), new Float64Array(64), 0)).toEqual([]);
  });
});
