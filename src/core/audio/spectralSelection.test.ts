import { describe, expect, it } from 'vitest';
import {
  isolateSpectralSelectionChannels,
  normalizeSpectralSelection,
  SPECTRAL_SELECTION_CEILING,
} from './spectralSelection.js';

const RATE = 8_000;

function tones(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => {
    const time = index / RATE;
    return (
      0.25 * Math.sin(2 * Math.PI * 200 * time) +
      0.18 * Math.sin(2 * Math.PI * 2_000 * time) +
      0.2 * Math.sin(2 * Math.PI * 3_600 * time)
    );
  });
}

function amplitudeAt(samples: Float32Array, frequency: number): number {
  let sine = 0;
  let cosine = 0;
  for (let i = 0; i < samples.length; i++) {
    const phase = (2 * Math.PI * frequency * i) / RATE;
    sine += samples[i] * Math.sin(phase);
    cosine += samples[i] * Math.cos(phase);
  }
  return (2 * Math.hypot(sine, cosine)) / samples.length;
}

describe('spectralSelection', () => {
  it('ordnet umgekehrt gezogene Grenzen und klemmt sie an Aufnahme und Nyquist', () => {
    expect(
      normalizeSpectralSelection({ startSec: 3, endSec: -1, lowHz: 9_000, highHz: 1_000 }, 2, RATE)
    ).toEqual({ startSec: 0, endSec: 2, lowHz: 1_000, highHz: 4_000 });
  });

  it('verwirft zu kleine Zeit- oder Frequenzbereiche', () => {
    expect(
      normalizeSpectralSelection({ startSec: 0, endSec: 0.01, lowHz: 100, highHz: 1000 }, 2, RATE)
    ).toBeNull();
    expect(
      normalizeSpectralSelection({ startSec: 0, endSec: 1, lowHz: 100, highHz: 110 }, 2, RATE)
    ).toBeNull();
  });

  it('schneidet die gewählte Zeit aus und lässt hauptsächlich das gewählte Band stehen', () => {
    const source = tones(RATE * 2);
    const result = isolateSpectralSelectionChannels([source], RATE, {
      startSec: 0.5,
      endSec: 1.5,
      lowHz: 1_000,
      highHz: 3_000,
    })!;
    const output = result.channels[0];

    expect(output).toHaveLength(RATE);
    expect(result.metrics.startSample).toBe(RATE / 2);
    expect(result.metrics.endSample).toBe((RATE * 3) / 2);
    expect(amplitudeAt(output, 2_000)).toBeGreaterThan(amplitudeAt(output, 200) * 20);
    expect(amplitudeAt(output, 2_000)).toBeGreaterThan(amplitudeAt(output, 3_600) * 5);
  });

  it('blendet die Schnittkanten und hält den Headroom ein', () => {
    const source = new Float32Array(RATE).fill(10);
    const result = isolateSpectralSelectionChannels([source], RATE, {
      startSec: 0,
      endSec: 1,
      lowHz: 0,
      highHz: RATE / 2,
    })!;
    const output = result.channels[0];

    expect(Math.abs(output[0])).toBeLessThan(1e-7);
    expect(Math.abs(output[output.length - 1])).toBeLessThan(1e-7);
    expect(result.metrics.outputPeak).toBeLessThanOrEqual(SPECTRAL_SELECTION_CEILING + 1e-6);
  });

  it('verändert mehrkanalige Eingaben nicht und bereinigt ungültige Samples', () => {
    const left = tones(RATE);
    const right = tones(RATE);
    right[400] = Number.NaN;
    const beforeLeft = left.slice();
    const result = isolateSpectralSelectionChannels([left, right], RATE, {
      startSec: 0.1,
      endSec: 0.9,
      lowHz: 1_000,
      highHz: 3_000,
    })!;

    expect(left).toEqual(beforeLeft);
    expect(Number.isNaN(right[400])).toBe(true);
    expect(result.channels).toHaveLength(2);
    expect(result.channels.every((channel) => Array.from(channel).every(Number.isFinite))).toBe(
      true
    );
  });
});
