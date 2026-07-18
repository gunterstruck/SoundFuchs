/**
 * ZANOBOT - DIFFERENCE ISOLATION ("hear only what's new")
 *
 * Step 2b: given a reference recording and a current measurement, resynthesize
 * the part of the measurement that is NOT present in the reference – i.e. the
 * acoustic content that has appeared since the baseline. Implemented as
 * spectral subtraction:
 *
 *   1. STFT both signals (Hann window, 75% overlap)
 *   2. Build the reference's average magnitude profile R[k]
 *   3. Estimate a global level scale g (mic distance/gain differ between takes)
 *   4. Per measurement frame: keep only the magnitude that exceeds g·R,
 *      preserving the measurement phase
 *   5. ISTFT + overlap-add → time-domain "difference" signal
 *
 * Purely a perception aid (makes the new content audible); it does not judge.
 * The common, unchanged machine hum is suppressed; what's new stands out.
 *
 * NOTE: this is an experimental listening aid – over-subtraction and floor are
 * tunable constants and the result is best judged by ear on a real machine.
 */

import { fft, fftIterative } from '../dsp/fft.js';

interface Cx {
  real: number;
  imag: number;
}

export interface DifferenceOptions {
  /** FFT size (power of two). Default 2048. */
  fftSize?: number;
  /** Over-subtraction factor – higher suppresses the common content more. Default 1.6. */
  overSubtraction?: number;
  /** Max seconds of audio to process (bounds CPU on long recordings). Default 12. */
  maxDurationSec?: number;
}

export interface DifferenceResult {
  samples: Float32Array;
  sampleRate: number;
}

/** Average all channels of an AudioBuffer to mono, capped to maxSamples. */
function toMono(buffer: AudioBuffer, maxSamples: number): Float32Array {
  const length = Math.min(buffer.length, maxSamples);
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
  }
  return mono;
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

/** Inverse FFT via the conjugate trick, returning the real part. */
function ifftReal(spectrum: Cx[]): Float32Array {
  const n = spectrum.length;
  const conj: Cx[] = new Array(n);
  for (let i = 0; i < n; i++) conj[i] = { real: spectrum[i].real, imag: -spectrum[i].imag };
  const f = fftIterative(conj);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f[i].real / n;
  return out;
}

/** Accumulate the average magnitude spectrum of a signal over all STFT frames. */
function averageMagnitude(signal: Float32Array, win: Float32Array, hop: number): Float64Array {
  const N = win.length;
  const profile = new Float64Array(N);
  let frames = 0;
  const frame = new Float32Array(N);
  for (let pos = 0; pos + N <= signal.length; pos += hop) {
    for (let i = 0; i < N; i++) frame[i] = signal[pos + i] * win[i];
    const spec = fft(frame);
    for (let k = 0; k < N; k++) {
      profile[k] += Math.hypot(spec[k].real, spec[k].imag);
    }
    frames++;
  }
  if (frames > 0) {
    for (let k = 0; k < N; k++) profile[k] /= frames;
  }
  return profile;
}

/**
 * Resynthesize the "difference" (measurement minus reference) as a mono signal.
 *
 * @param reference - Reference recording
 * @param measurement - Current measurement
 * @param options - Tuning options
 * @returns Mono difference signal + sample rate
 */
export function isolateDifference(
  reference: AudioBuffer,
  measurement: AudioBuffer,
  options: DifferenceOptions = {}
): DifferenceResult {
  const N = options.fftSize ?? 2048;
  const hop = N / 4; // 75% overlap
  const alpha = options.overSubtraction ?? 1.6;
  const maxDurationSec = options.maxDurationSec ?? 12;

  const sampleRate = measurement.sampleRate;
  const maxSamples = Math.floor(maxDurationSec * sampleRate);

  const meas = toMono(measurement, maxSamples);
  const ref = toMono(reference, Math.floor(maxDurationSec * reference.sampleRate));

  // Too short to process → return empty (caller handles gracefully)
  if (meas.length < N || ref.length < N) {
    return { samples: new Float32Array(0), sampleRate };
  }

  const win = hannWindow(N);

  // Reference magnitude profile and measurement average (for level alignment).
  // Bins are matched by index (≈ by normalized frequency); reference and
  // measurement are recorded under the same fixed sample-rate constraint.
  const refProfile = averageMagnitude(ref, win, hop);
  const measAvg = averageMagnitude(meas, win, hop);

  // Global level scale g: least-squares projection of the measurement's average
  // spectrum onto the reference profile (accounts for mic distance/gain).
  let num = 0;
  let den = 0;
  for (let k = 0; k < N; k++) {
    num += measAvg[k] * refProfile[k];
    den += refProfile[k] * refProfile[k];
  }
  const g = den > 1e-12 ? num / den : 0;

  // Spectral subtraction with overlap-add resynthesis
  const out = new Float32Array(meas.length);
  const winSum = new Float32Array(meas.length);
  const frame = new Float32Array(N);

  for (let pos = 0; pos + N <= meas.length; pos += hop) {
    for (let i = 0; i < N; i++) frame[i] = meas[pos + i] * win[i];
    const spec = fft(frame);

    const newSpec: Cx[] = new Array(N);
    for (let k = 0; k < N; k++) {
      const m = Math.hypot(spec[k].real, spec[k].imag);
      const keep = Math.max(0, m - alpha * g * refProfile[k]);
      const ratio = m > 1e-12 ? keep / m : 0;
      // Keep the measurement phase, scale the magnitude down to the residual
      newSpec[k] = { real: spec[k].real * ratio, imag: spec[k].imag * ratio };
    }

    const timeFrame = ifftReal(newSpec);
    for (let i = 0; i < N; i++) {
      out[pos + i] += timeFrame[i] * win[i];
      winSum[pos + i] += win[i] * win[i];
    }
  }

  // Normalize the overlap-add window gain
  for (let i = 0; i < out.length; i++) {
    if (winSum[i] > 1e-6) out[i] /= winSum[i];
  }

  // Peak-normalize so the (often quiet) residual is comfortably audible
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1e-6) {
    const scale = 0.9 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= scale;
  }

  return { samples: out, sampleRate };
}
