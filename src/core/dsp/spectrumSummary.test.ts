import { describe, it, expect } from 'vitest';
import { averageSpectrum } from './spectrumSummary.js';

const SAMPLE_RATE = 48000;
const BINS = 512;

/** Minimal AudioBuffer stand-in for the mono path averageSpectrum uses. */
function mockBuffer(samples: Float32Array, sampleRate = SAMPLE_RATE): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function tone(samples: Float32Array, freq: number, amp: number, from: number, to: number): void {
  for (let i = from; i < to; i++) {
    samples[i] += amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
}

const binOf = (freq: number) => Math.round((freq / (SAMPLE_RATE / 2)) * BINS);

describe('averageSpectrum (robust median)', () => {
  it('keeps the steady tone and suppresses a brief transient', () => {
    const n = SAMPLE_RATE; // 1 s → ~45 analysis windows
    const samples = new Float32Array(n);
    // Steady 1 kHz tone across the whole measurement.
    tone(samples, 1000, 0.5, 0, n);
    // Loud 5 kHz "whistle" only in the last ~18 % of the recording (a minority
    // of the analysis windows), like a short whistle mid-measurement.
    tone(samples, 5000, 1.0, Math.floor(n * 0.82), n);

    const spec = averageSpectrum(mockBuffer(samples), BINS);

    const steady = spec[binOf(1000)];
    const transient = spec[binOf(5000)];

    // The steady tone dominates; the brief whistle is largely rejected by the
    // per-bin median (it would survive in an arithmetic mean).
    expect(steady).toBeGreaterThan(0);
    expect(steady).toBeGreaterThan(transient * 5);
  });

  it('returns a zeroed spectrum for audio shorter than one window', () => {
    const spec = averageSpectrum(mockBuffer(new Float32Array(1024)), BINS);
    expect(spec).toHaveLength(BINS);
    expect(spec.every((v) => v === 0)).toBe(true);
  });
});
