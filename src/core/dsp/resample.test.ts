import { describe, it, expect } from 'vitest';
import { resampleLinear, resampleTo16k, RollingAudioBuffer, YAMNET_SAMPLE_RATE } from './resample.js';

describe('resampleLinear', () => {
  it('returns a copy unchanged when rates are equal', () => {
    const x = new Float32Array([1, 2, 3, 4]);
    const y = resampleLinear(x, 16000, 16000);
    expect(Array.from(y)).toEqual([1, 2, 3, 4]);
    expect(y).not.toBe(x); // copy
  });

  it('downsamples 48k → 16k to ~1/3 the length', () => {
    const x = new Float32Array(48000).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
    const y = resampleTo16k(x, 48000);
    expect(y.length).toBeCloseTo(16000, -2); // ~16000 (±100)
    expect(Number.isFinite(y[0])).toBe(true);
    expect(Math.max(...y)).toBeLessThanOrEqual(1.0001);
  });

  it('preserves endpoints and interpolates linearly when upsampling', () => {
    const x = new Float32Array([0, 1]); // ramp
    const y = resampleLinear(x, 1, 3); // 3 samples
    expect(y[0]).toBeCloseTo(0, 5);
    expect(y[y.length - 1]).toBeCloseTo(1, 5);
    expect(y[1]).toBeGreaterThan(0);
    expect(y[1]).toBeLessThan(1);
  });

  it('YAMNET_SAMPLE_RATE is 16000', () => {
    expect(YAMNET_SAMPLE_RATE).toBe(16000);
  });
});

describe('RollingAudioBuffer', () => {
  it('keeps the most recent samples up to capacity', () => {
    const rb = new RollingAudioBuffer(4);
    rb.push(new Float32Array([1, 2]));
    expect(rb.length).toBe(2);
    expect(Array.from(rb.toArray())).toEqual([1, 2]);
    rb.push(new Float32Array([3, 4, 5])); // overflow by 1
    expect(rb.length).toBe(4);
    expect(Array.from(rb.toArray())).toEqual([2, 3, 4, 5]);
  });

  it('handles a push larger than capacity (keeps the tail)', () => {
    const rb = new RollingAudioBuffer(3);
    rb.push(new Float32Array([1, 2, 3, 4, 5]));
    expect(rb.length).toBe(3);
    expect(Array.from(rb.toArray())).toEqual([3, 4, 5]);
  });

  it('clear resets the buffer', () => {
    const rb = new RollingAudioBuffer(3);
    rb.push(new Float32Array([1, 2, 3]));
    rb.clear();
    expect(rb.length).toBe(0);
    expect(Array.from(rb.toArray())).toEqual([]);
  });
});
