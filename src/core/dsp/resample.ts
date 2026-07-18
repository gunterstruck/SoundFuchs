/**
 * ZANOBOT - Audio resampling + rolling window (Tier 1 / YAMNet helpers)
 *
 * Pure, dependency-free DSP used only by the YAMNet engine path. YAMNet expects
 * mono float32 at 16 kHz; the app captures at 48/44.1 kHz. These helpers are
 * unit-tested independently of TF.js.
 */

/** YAMNet input sample rate. */
export const YAMNET_SAMPLE_RATE = 16000;

/**
 * Linear-interpolation resampling of a mono signal from `fromRate` to `toRate`.
 * Good enough for embedding front-ends (YAMNet has its own log-mel front-end).
 */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) {
    return input.slice();
  }
  if (!(fromRate > 0) || !(toRate > 0)) {
    throw new Error(`Invalid sample rates: ${fromRate} → ${toRate}`);
  }
  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLength);
  const step = (input.length - 1) / (outLength - 1 || 1);
  for (let i = 0; i < outLength; i++) {
    const pos = i * step;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = pos - lo;
    out[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }
  return out;
}

/** Convenience: resample to YAMNet's 16 kHz. */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  return resampleLinear(input, fromRate, YAMNET_SAMPLE_RATE);
}

/**
 * Fixed-capacity rolling window of the most recent audio samples. Used to keep
 * the last ~1 s of audio so YAMNet always sees ≥ its 0.96 s frame even though
 * the worklet delivers 330 ms chunks. Allocation-light (single backing buffer).
 */
export class RollingAudioBuffer {
  private buf: Float32Array;
  private filled = 0;

  constructor(public readonly capacity: number) {
    if (!(capacity > 0)) throw new Error('RollingAudioBuffer capacity must be > 0');
    this.buf = new Float32Array(capacity);
  }

  /** Append samples, dropping the oldest beyond capacity. */
  push(samples: Float32Array): void {
    const n = samples.length;
    if (n >= this.capacity) {
      this.buf.set(samples.subarray(n - this.capacity));
      this.filled = this.capacity;
      return;
    }
    if (this.filled + n > this.capacity) {
      const shift = this.filled + n - this.capacity;
      this.buf.copyWithin(0, shift, this.filled);
      this.filled -= shift;
    }
    this.buf.set(samples, this.filled);
    this.filled += n;
  }

  /** Number of samples currently held. */
  get length(): number {
    return this.filled;
  }

  /** A copy of the current contents (oldest → newest). */
  toArray(): Float32Array {
    return this.buf.slice(0, this.filled);
  }

  clear(): void {
    this.filled = 0;
  }
}
