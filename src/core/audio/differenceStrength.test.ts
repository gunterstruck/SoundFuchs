import { describe, expect, it } from 'vitest';
import type { DifferenceMetrics } from './differenceIsolation.js';
import { classifyDifferenceStrength } from './differenceStrength.js';

function metrics(relativeAmplitude: number, variationMultiple: number | null): DifferenceMetrics {
  return {
    measurementRms: 0.2,
    rawDifferenceRms: 0.2 * relativeAmplitude,
    relativeAmplitude,
    relativeDb: relativeAmplitude > 0 ? 20 * Math.log10(relativeAmplitude) : -Infinity,
    referenceVariationAmplitude: variationMultiple ? relativeAmplitude / variationMultiple : 0,
    variationMultiple,
    listeningGain: 5,
  };
}

describe('classifyDifferenceStrength', () => {
  it('lässt sehr kleine Differenzen unabhängig vom Verstärkungsfaktor normal', () => {
    expect(classifyDifferenceStrength(metrics(0.01, 20)).level).toBe('within');
  });

  it('vergleicht bevorzugt mit der inneren Schwankung des Normalzustands', () => {
    expect(classifyDifferenceStrength(metrics(0.08, 1.2)).level).toBe('within');
    expect(classifyDifferenceStrength(metrics(0.08, 2.2)).level).toBe('slight');
    expect(classifyDifferenceStrength(metrics(0.08, 4.5)).level).toBe('clear');
    expect(classifyDifferenceStrength(metrics(0.08, 8)).level).toBe('strong');
  });

  it('fällt bei einer zu ruhigen Referenz auf den realen Pegelabstand zurück', () => {
    expect(classifyDifferenceStrength(metrics(0.08, null)).level).toBe('slight');
    expect(classifyDifferenceStrength(metrics(0.2, null)).level).toBe('clear');
    expect(classifyDifferenceStrength(metrics(0.4, null)).level).toBe('strong');
  });
});
