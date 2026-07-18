import { describe, it, expect } from 'vitest';
import { getAverageBaselineScore, getBaselineRating } from './machineStatus.js';
import type { Machine, GMIAModel } from '@data/types.js';

/** Build a minimal Machine carrying only the reference models under test. */
function makeMachine(baselineScores: Array<number | undefined>): Machine {
  const referenceModels = baselineScores.map(
    (s) => ({ label: 'Baseline', baselineScore: s }) as unknown as GMIAModel
  );
  return {
    id: 'm1',
    name: 'Test Machine',
    createdAt: 0,
    referenceModels,
  } as Machine;
}

describe('getAverageBaselineScore', () => {
  it('returns 0 when there are no reference models', () => {
    expect(getAverageBaselineScore(makeMachine([]))).toBe(0);
  });

  it('returns 0 when referenceModels is missing entirely', () => {
    expect(getAverageBaselineScore({ id: 'm', name: 'n', createdAt: 0 } as Machine)).toBe(0);
  });

  it('returns the single score when only one model has a score', () => {
    expect(getAverageBaselineScore(makeMachine([88]))).toBe(88);
  });

  it('averages multiple scores', () => {
    expect(getAverageBaselineScore(makeMachine([80, 90, 100]))).toBe(90);
  });

  it('ignores models without a baseline score (undefined)', () => {
    // Only 80 and 100 count → average 90, not divided by 3
    expect(getAverageBaselineScore(makeMachine([80, undefined, 100]))).toBe(90);
  });

  it('returns 0 when every model lacks a score', () => {
    expect(getAverageBaselineScore(makeMachine([undefined, undefined]))).toBe(0);
  });
});

describe('getBaselineRating', () => {
  it('rates >= 90 as good', () => {
    expect(getBaselineRating(90)).toBe('good');
    expect(getBaselineRating(99.9)).toBe('good');
  });

  it('rates 75..89.99 as ok', () => {
    expect(getBaselineRating(75)).toBe('ok');
    expect(getBaselineRating(89)).toBe('ok');
  });

  it('rates < 75 as unknown', () => {
    expect(getBaselineRating(74.9)).toBe('unknown');
    expect(getBaselineRating(0)).toBe('unknown');
  });
});
