import { describe, expect, it } from 'vitest';
import {
  DIFFERENCE_HIGHLIGHT_CEILING,
  highlightDifferenceChannels,
} from './differenceHighlight.js';

const RATE = 8_000;
const LENGTH = RATE;

function sine(frequency: number, amplitude: number, length = LENGTH): Float32Array {
  return Float32Array.from(
    { length },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / RATE)
  );
}

function amplitudeAt(samples: Float32Array, frequency: number): number {
  let sin = 0;
  let cos = 0;
  for (let i = 0; i < samples.length; i++) {
    const phase = (2 * Math.PI * frequency * i) / RATE;
    sin += samples[i] * Math.sin(phase);
    cos += samples[i] * Math.cos(phase);
  }
  return (2 * Math.hypot(sin, cos)) / samples.length;
}

describe('highlightDifferenceChannels', () => {
  it('lässt die Messung bei leerer Differenz praktisch unverändert', () => {
    const measurement = sine(400, 0.25);
    const before = measurement.slice();
    const result = highlightDifferenceChannels(
      [measurement],
      new Float32Array(LENGTH),
      'clear',
      RATE
    );

    expect(result.metrics.applied).toBe(false);
    expect(result.channels[0]).toEqual(before);
    expect(measurement).toEqual(before);
  });

  it('hebt einen zusätzlichen Ton gegenüber dem gemeinsamen Geräusch hervor', () => {
    const measurement = sine(400, 0.25);
    const difference = sine(2_000, 0.9);
    const result = highlightDifferenceChannels([measurement], difference, 'clear', RATE);

    const common = amplitudeAt(result.channels[0], 400);
    const anomaly = amplitudeAt(result.channels[0], 2_000);
    expect(result.metrics.applied).toBe(true);
    expect(anomaly / common).toBeGreaterThan(0.4);
    expect(amplitudeAt(measurement, 2_000)).toBeLessThan(1e-5);
  });

  it('ist monoton: Stark hebt den Unterschied stärker hervor als Deutlich', () => {
    const measurement = sine(400, 0.25);
    const difference = sine(2_000, 0.9);
    const clear = highlightDifferenceChannels([measurement], difference, 'clear', RATE);
    const strong = highlightDifferenceChannels([measurement], difference, 'strong', RATE);

    const clearRatio = amplitudeAt(clear.channels[0], 2_000) / amplitudeAt(clear.channels[0], 400);
    const strongRatio =
      amplitudeAt(strong.channels[0], 2_000) / amplitudeAt(strong.channels[0], 400);
    expect(strongRatio).toBeGreaterThan(clearRatio * 1.5);
  });

  it('hält den definierten Headroom auch bei extremen Spitzen ein', () => {
    const measurement = new Float32Array(LENGTH);
    const difference = new Float32Array(LENGTH);
    measurement.fill(0.3);
    measurement[4_000] = 1;
    difference[4_000] = 1;

    const result = highlightDifferenceChannels([measurement], difference, 'strong', RATE);
    expect(result.metrics.outputPeak).toBeLessThanOrEqual(DIFFERENCE_HIGHLIGHT_CEILING + 1e-6);
    expect(result.metrics.limiterGain).toBeLessThan(1);
  });

  it('gleicht die Gesamtlautheit ab, statt Stark einfach lauter zu machen', () => {
    const measurement = sine(400, 0.25);
    const difference = sine(2_000, 0.9);
    const clear = highlightDifferenceChannels([measurement], difference, 'clear', RATE);
    const strong = highlightDifferenceChannels([measurement], difference, 'strong', RATE);

    expect(Math.abs(clear.metrics.loudnessDeltaDb)).toBeLessThan(0.05);
    expect(Math.abs(strong.metrics.loudnessDeltaDb)).toBeLessThan(0.05);
    expect(Math.abs(clear.metrics.outputRms - strong.metrics.outputRms)).toBeLessThan(1e-5);
  });

  it('behandelt Stille, kurze und unterschiedlich lange Kanäle sicher', () => {
    const silent = highlightDifferenceChannels(
      [new Float32Array(3), new Float32Array(1)],
      new Float32Array([1]),
      'strong',
      0
    );
    expect(silent.metrics.applied).toBe(false);
    expect(silent.channels).toHaveLength(2);
    expect(silent.channels[0]).toHaveLength(3);

    const invalid = highlightDifferenceChannels(
      [new Float32Array([0.2, Number.NaN, Number.POSITIVE_INFINITY])],
      new Float32Array([0.4, Number.NaN]),
      'clear',
      Number.NaN
    );
    expect(Array.from(invalid.channels[0]).every(Number.isFinite)).toBe(true);
  });

  it('verändert weder Messung noch Differenz', () => {
    const left = sine(400, 0.2);
    const right = sine(600, 0.15, LENGTH - 17);
    const difference = sine(2_000, 0.9, LENGTH - 31);
    const leftBefore = left.slice();
    const rightBefore = right.slice();
    const differenceBefore = difference.slice();

    const result = highlightDifferenceChannels([left, right], difference, 'strong', RATE);
    expect(result.channels).toHaveLength(2);
    expect(result.channels[1]).toHaveLength(right.length);
    expect(left).toEqual(leftBefore);
    expect(right).toEqual(rightBefore);
    expect(difference).toEqual(differenceBefore);
  });
});
