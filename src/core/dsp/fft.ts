/**
 * ZANOBOT - FFT (Fast Fourier Transform)
 *
 * Implements FFT for audio signal processing.
 * Based on Cooley-Tukey radix-2 algorithm.
 */

/**
 * Complex number representation
 */
interface Complex {
  real: number;
  imag: number;
}

/**
 * Perform FFT on real-valued input signal
 *
 * Uses iterative Cooley-Tukey algorithm with bit-reversal.
 * Prevents stack overflow for large inputs.
 *
 * @param signal - Input time-domain signal (must be power of 2 length)
 * @returns Complex frequency-domain representation
 */
export function fft(signal: Float32Array): Complex[] {
  const n = signal.length;

  // Ensure input length is power of 2
  if (!isPowerOfTwo(n)) {
    throw new Error(`FFT input length must be power of 2, got ${n}`);
  }

  // Convert real signal to complex
  const complex: Complex[] = Array.from(signal, (real) => ({ real, imag: 0 }));

  // Perform iterative FFT (no recursion, no stack overflow)
  return fftIterative(complex);
}

/**
 * Iterative FFT implementation (Cooley-Tukey with bit-reversal)
 *
 * Advantages over recursive:
 * - No stack overflow for large inputs
 * - Better performance (no function call overhead)
 * - More memory efficient
 *
 * Algorithm:
 * 1. Bit-reversal permutation
 * 2. Butterfly operations in log2(n) stages
 *
 * @internal - Exported only for testing purposes
 */
export function fftIterative(x: Complex[]): Complex[] {
  const n = x.length;
  const result = [...x]; // Copy input

  // Step 1: Bit-reversal permutation
  const numBits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    const reversed = reverseBits(i, numBits);
    if (reversed > i) {
      // Swap
      [result[i], result[reversed]] = [result[reversed], result[i]];
    }
  }

  // Step 2: Butterfly operations (bottom-up)
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const step = (2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        // Twiddle factor: e^(-2πij/size)
        const angle = -step * j;
        const twiddle: Complex = {
          real: Math.cos(angle),
          imag: Math.sin(angle),
        };

        // Butterfly operation
        const evenIdx = i + j;
        const oddIdx = i + j + halfSize;

        const t = complexMultiply(twiddle, result[oddIdx]);
        const even = result[evenIdx];

        result[evenIdx] = complexAdd(even, t);
        result[oddIdx] = complexSubtract(even, t);
      }
    }
  }

  return result;
}

/**
 * Reverse bits of a number
 *
 * Used for bit-reversal permutation in iterative FFT.
 *
 * @param num - Number to reverse
 * @param numBits - Number of bits to consider
 * @returns Bit-reversed number
 */
function reverseBits(num: number, numBits: number): number {
  let reversed = 0;
  for (let i = 0; i < numBits; i++) {
    reversed = (reversed << 1) | (num & 1);
    num >>= 1;
  }
  return reversed;
}

/**
 * Recursive FFT implementation (Cooley-Tukey)
 *
 * @deprecated Use iterative implementation instead (fftIterative)
 * Kept for reference and validation testing.
 * @internal - Exported only for testing purposes
 */
export function fftRecursive(x: Complex[]): Complex[] {
  const n = x.length;

  // Base case
  if (n === 1) {
    return x;
  }

  // Divide
  const even: Complex[] = [];
  const odd: Complex[] = [];

  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      even.push(x[i]);
    } else {
      odd.push(x[i]);
    }
  }

  // Conquer
  const fftEven = fftRecursive(even);
  const fftOdd = fftRecursive(odd);

  // Combine
  const result: Complex[] = new Array(n);

  for (let k = 0; k < n / 2; k++) {
    // Twiddle factor: e^(-2πik/n)
    const angle = (-2 * Math.PI * k) / n;
    const twiddle: Complex = {
      real: Math.cos(angle),
      imag: Math.sin(angle),
    };

    // Complex multiplication: twiddle * fftOdd[k]
    const t: Complex = complexMultiply(twiddle, fftOdd[k]);

    // Butterfly operation
    result[k] = complexAdd(fftEven[k], t);
    result[k + n / 2] = complexSubtract(fftEven[k], t);
  }

  return result;
}

/**
 * Calculate magnitude (absolute value) of FFT output
 *
 * Uses Math.hypot for better numerical stability and overflow prevention.
 *
 * @param fftResult - Complex FFT output
 * @returns Magnitude spectrum (real values)
 */
export function getMagnitude(fftResult: Complex[]): Float64Array {
  const magnitude = new Float64Array(fftResult.length);

  for (let i = 0; i < fftResult.length; i++) {
    const { real, imag } = fftResult[i];
    // Use Math.hypot for numerical stability (prevents overflow)
    magnitude[i] = Math.hypot(real, imag);
  }

  return magnitude;
}

/**
 * Calculate power spectrum (magnitude squared)
 *
 * @param fftResult - Complex FFT output
 * @returns Power spectrum
 */
export function getPowerSpectrum(fftResult: Complex[]): Float64Array {
  const power = new Float64Array(fftResult.length);

  for (let i = 0; i < fftResult.length; i++) {
    const { real, imag } = fftResult[i];
    power[i] = real * real + imag * imag;
  }

  return power;
}

/**
 * Apply Hanning window to reduce spectral leakage
 *
 * @param signal - Input signal
 * @returns Windowed signal
 */
export function applyHanningWindow(signal: Float32Array): Float32Array {
  const n = signal.length;
  const windowed = new Float32Array(n);

  // Guard: single-sample signal would cause division by zero (n-1 = 0)
  if (n <= 1) {
    windowed.set(signal);
    return windowed;
  }

  for (let i = 0; i < n; i++) {
    const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    windowed[i] = signal[i] * windowValue;
  }

  return windowed;
}

/**
 * Pad signal to next power of 2 length
 *
 * @param signal - Input signal
 * @returns Zero-padded signal
 */
export function padToPowerOfTwo(signal: Float32Array): Float32Array {
  const n = signal.length;
  const nextPower = nextPowerOfTwo(n);

  if (n === nextPower) {
    return signal;
  }

  const padded = new Float32Array(nextPower);
  padded.set(signal);

  return padded;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function complexAdd(a: Complex, b: Complex): Complex {
  return {
    real: a.real + b.real,
    imag: a.imag + b.imag,
  };
}

function complexSubtract(a: Complex, b: Complex): Complex {
  return {
    real: a.real - b.real,
    imag: a.imag - b.imag,
  };
}

function complexMultiply(a: Complex, b: Complex): Complex {
  return {
    real: a.real * b.real - a.imag * b.imag,
    imag: a.real * b.imag + a.imag * b.real,
  };
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}
