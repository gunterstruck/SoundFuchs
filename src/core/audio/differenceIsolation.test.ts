import { describe, expect, it } from 'vitest';
import { isolateDifference } from './differenceIsolation.js';

const SAMPLE_RATE = 8_000;

function fakeBuffer(samples: Float32Array): AudioBuffer {
  return {
    sampleRate: SAMPLE_RATE,
    length: samples.length,
    duration: samples.length / SAMPLE_RATE,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function tone(hz: number, amplitude: number): Float32Array {
  const samples = new Float32Array(SAMPLE_RATE);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  }
  return samples;
}

function add(a: Float32Array, b: Float32Array): Float32Array {
  return Float32Array.from(a, (sample, index) => sample + b[index]);
}

describe('isolateDifference metrics', () => {
  it('misst die Stärke vor der Peak-Normalisierung', () => {
    const reference = tone(320, 0.3);
    const measurement = add(reference, tone(1_100, 0.03));
    const result = isolateDifference(fakeBuffer(reference), fakeBuffer(measurement), {
      fftSize: 256,
      maxDurationSec: 1,
    });

    const outputPeak = Math.max(...Array.from(result.samples, Math.abs));
    expect(outputPeak).toBeCloseTo(0.9, 4);
    expect(result.metrics.rawDifferenceRms).toBeGreaterThan(0);
    expect(result.metrics.relativeAmplitude).toBeGreaterThan(0);
    expect(result.metrics.relativeAmplitude).toBeLessThan(0.2);
    expect(result.metrics.listeningGain).toBeGreaterThan(1);
  });

  it('ordnet einen stärkeren neuen Ton auch vor derselben Hörlautheit stärker ein', () => {
    const reference = tone(320, 0.3);
    const quiet = isolateDifference(
      fakeBuffer(reference),
      fakeBuffer(add(reference, tone(1_100, 0.02))),
      { fftSize: 256, maxDurationSec: 1 }
    );
    const loud = isolateDifference(
      fakeBuffer(reference),
      fakeBuffer(add(reference, tone(1_100, 0.12))),
      { fftSize: 256, maxDurationSec: 1 }
    );

    expect(loud.metrics.relativeAmplitude).toBeGreaterThan(quiet.metrics.relativeAmplitude * 2);
    expect(Math.max(...Array.from(quiet.samples, Math.abs))).toBeCloseTo(0.9, 4);
    expect(Math.max(...Array.from(loud.samples, Math.abs))).toBeCloseTo(0.9, 4);
  });
});
