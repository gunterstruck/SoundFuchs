import { describe, it, expect } from 'vitest';
import { getScoreVerbalStatus } from './diagnoseScore.js';

// The exact strings depend on the active locale, so these tests assert the
// branch boundaries by comparing return values rather than hardcoding text.
describe('getScoreVerbalStatus', () => {
  it('returns four distinct status strings across the ranges', () => {
    const consistent = getScoreVerbalStatus(90);
    const slight = getScoreVerbalStatus(75);
    const significant = getScoreVerbalStatus(60);
    const strong = getScoreVerbalStatus(20);
    const all = new Set([consistent, slight, significant, strong]);
    expect(all.size).toBe(4);
  });

  it('maps the >=85 band to the "consistent" status', () => {
    expect(getScoreVerbalStatus(100)).toBe(getScoreVerbalStatus(85));
    expect(getScoreVerbalStatus(85)).not.toBe(getScoreVerbalStatus(84));
  });

  it('maps the 70..84 band to the "slight deviation" status', () => {
    expect(getScoreVerbalStatus(84)).toBe(getScoreVerbalStatus(70));
    expect(getScoreVerbalStatus(70)).not.toBe(getScoreVerbalStatus(69));
  });

  it('maps the 50..69 band to the "significant change" status', () => {
    expect(getScoreVerbalStatus(69)).toBe(getScoreVerbalStatus(50));
    expect(getScoreVerbalStatus(50)).not.toBe(getScoreVerbalStatus(49));
  });

  it('maps <50 to the "strong deviation" status', () => {
    expect(getScoreVerbalStatus(49)).toBe(getScoreVerbalStatus(0));
  });
});
