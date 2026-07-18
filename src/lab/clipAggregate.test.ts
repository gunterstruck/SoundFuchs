import { describe, it, expect } from 'vitest';
import { clipAggregate, CLIP_AGG_DEFAULT } from './clipAggregate.js';

describe('clipAggregate', () => {
  it('default mode is mean', () => {
    expect(CLIP_AGG_DEFAULT).toBe('mean');
  });

  it('mean averages the frame scores', () => {
    expect(clipAggregate([10, 20, 30], 'mean')).toBeCloseTo(20, 10);
  });

  it('p90 picks the worst tenth (nearest-rank 90th percentile)', () => {
    const scores = Array.from({ length: 10 }, (_, i) => (i + 1) * 10); // 10..100
    // nearest-rank: rank = ceil(0.9*10)=9 → value 90
    expect(clipAggregate(scores, 'p90')).toBe(90);
  });

  it('p90 keeps strong transients that the mean dilutes', () => {
    // 20 frames, the worst ~tenth are anomalous spikes.
    const scores = [...Array(17).fill(0), 100, 100, 100];
    expect(clipAggregate(scores, 'mean')).toBeCloseTo(15, 10);
    // nearest-rank: rank = ceil(0.9*20) = 18 → sorted[17] = 100
    expect(clipAggregate(scores, 'p90')).toBe(100);
  });

  it('ignores non-finite values', () => {
    expect(clipAggregate([10, NaN, 30, Infinity], 'mean')).toBeCloseTo(20, 10);
  });

  it('returns NaN for an empty clip', () => {
    expect(Number.isNaN(clipAggregate([], 'mean'))).toBe(true);
    expect(Number.isNaN(clipAggregate([NaN], 'p90'))).toBe(true);
  });

  it('defaults to mean when no mode is given', () => {
    expect(clipAggregate([2, 4])).toBeCloseTo(3, 10);
  });
});
