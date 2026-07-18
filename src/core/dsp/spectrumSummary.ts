/**
 * ZANOBOT - AVERAGE SPECTRUM SUMMARY
 *
 * Computes a robust average magnitude spectrum from an AudioBuffer, suitable
 * for rendering a fingerprint "iris". Uses a per-bin MEDIAN across the analysis
 * windows rather than the arithmetic mean, so brief transients (a whistle, a
 * cough, a tool clink) do not distort the steady spectrum. Returns `bins`
 * values spanning 0..Nyquist linearly (the same convention as a model weight
 * vector), so a reference and a measurement can be drawn as comparable irises.
 */

import { fft } from './fft.js';

/**
 * Robust (per-bin median) average magnitude spectrum of an audio buffer.
 *
 * @param buffer - Audio to analyze
 * @param bins - Number of output bins over 0..Nyquist (default 512)
 * @param maxDurationSec - Cap on processed audio to bound CPU (default 12)
 * @returns Float32Array of length `bins`
 */
export function averageSpectrum(
  buffer: AudioBuffer,
  bins = 512,
  maxDurationSec = 12
): Float32Array {
  const N = 2048;
  const hop = N / 2;
  const half = N / 2;

  const maxSamples = Math.floor(maxDurationSec * buffer.sampleRate);
  const length = Math.min(buffer.length, maxSamples);

  // Downmix to mono
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
  }

  const out = new Float32Array(bins);
  if (mono.length < N) return out;

  // Hann window
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  const ratio = half / bins;
  const numFrames = Math.floor((mono.length - N) / hop) + 1;
  if (numFrames <= 0) return out;

  // Per-bin magnitude over all frames (row-major: bin b, frame f at b*numFrames+f),
  // so we can take a per-bin MEDIAN instead of a mean. The median is robust to
  // brief transients (a whistle, a cough, a tool clink): as long as the
  // disturbance is a minority of the measurement, it does not move the median,
  // so the spectrum/iris reflects the steady machine sound — consistent with the
  // transient-rejecting "cherry-picking" used for the score.
  const perBin = new Float32Array(bins * numFrames);
  const frame = new Float32Array(N);
  let frames = 0;
  for (let pos = 0; pos + N <= mono.length; pos += hop) {
    for (let i = 0; i < N; i++) frame[i] = mono[pos + i] * win[i];
    const spec = fft(frame);
    for (let b = 0; b < bins; b++) {
      const start = Math.floor(b * ratio);
      const end = Math.max(start + 1, Math.floor((b + 1) * ratio));
      let sum = 0;
      let count = 0;
      for (let k = start; k < end && k < half; k++) {
        sum += Math.hypot(spec[k].real, spec[k].imag);
        count++;
      }
      perBin[b * numFrames + frames] = count > 0 ? sum / count : 0;
    }
    frames++;
  }
  if (frames === 0) return out;

  // Median per bin (TypedArray.sort is numeric and sorts in place).
  const scratch = new Float32Array(frames);
  const mid = frames >> 1;
  for (let b = 0; b < bins; b++) {
    for (let f = 0; f < frames; f++) scratch[f] = perBin[b * numFrames + f];
    scratch.sort();
    out[b] = frames % 2 ? scratch[mid] : (scratch[mid - 1] + scratch[mid]) / 2;
  }
  return out;
}
