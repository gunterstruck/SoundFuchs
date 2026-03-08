/**
 * ZANOBOT - FEATURE EXTRACTION
 *
 * Extracts Energy Spectral Densities from audio signals.
 * This is THE core feature extraction method for GMIA.
 *
 * - Chunking: 0.330s windows with 0.066s hop size
 * - FFT: Calculate frequency spectrum
 * - Binning: Group into 512 frequency bins
 * - Normalization: Relative features (sum = 1)
 */

import { fft, getMagnitude, applyHanningWindow, padToPowerOfTwo } from './fft.js';
import type { FeatureVector, AudioChunk, DSPConfig } from '@data/types.js';
import { logger } from '@utils/logger.js';

/**
 * Default DSP configuration for GMIA
 */
export const DEFAULT_DSP_CONFIG: DSPConfig = {
  sampleRate: 48000, // High quality audio sample rate (matches config.json)
  windowSize: 0.33, // 330ms
  hopSize: 0.066, // 66ms overlap
  fftSize: 2048, // Fixed FFT size (matches config.json)
  frequencyBins: 512, // Tested optimal value (Report p.19)
  frequencyRange: [0, 24000], // 0 to Nyquist frequency (48000/2)
};

/**
 * Extract Energy Spectral Densities from audio buffer
 *
 * This is the main entry point for feature extraction.
 *
 * @param audioBuffer - Web Audio API AudioBuffer
 * @param config - DSP configuration (optional)
 * @returns Array of feature vectors (one per chunk)
 * @throws Error if audio buffer is too short to extract any features
 */
export function extractFeatures(
  audioBuffer: AudioBuffer,
  config: DSPConfig = DEFAULT_DSP_CONFIG
): FeatureVector[] {
  // CRITICAL FIX: Validate sample rate before using it
  // Prevents mathematical errors from invalid sample rates (0, NaN, Infinity, negative)
  if (
    !audioBuffer.sampleRate ||
    !isFinite(audioBuffer.sampleRate) ||
    audioBuffer.sampleRate <= 0 ||
    audioBuffer.sampleRate > 192000
  ) {
    throw new Error(
      `Ungültige Sample Rate: ${audioBuffer.sampleRate}Hz. ` +
      `Erwartet: 8000-192000Hz (typisch: 44100Hz oder 48000Hz)`
    );
  }

  // OPTIMIZATION: Check if config needs adjustment for actual audio buffer sample rate
  // Improves readability by separating condition from conditional assignment
  const needsSampleRateAdjustment =
    config.sampleRate !== audioBuffer.sampleRate ||
    config.frequencyRange[1] !== audioBuffer.sampleRate / 2;

  const effectiveConfig = needsSampleRateAdjustment
    ? {
        ...config,
        sampleRate: audioBuffer.sampleRate,
        frequencyRange: [0, audioBuffer.sampleRate / 2] as [number, number],
      }
    : config;

  // CRITICAL FIX: Validate frequency range
  const [minFreq, maxFreq] = effectiveConfig.frequencyRange;
  if (!isFinite(minFreq) || !isFinite(maxFreq) || minFreq < 0 || maxFreq <= minFreq) {
    throw new Error(
      `Invalid frequency range: [${minFreq}, ${maxFreq}]Hz. ` +
      `Min must be >= 0, Max must be > Min, both must be finite.`
    );
  }

  // Validate against Nyquist frequency
  const nyquistFreq = effectiveConfig.sampleRate / 2;
  if (maxFreq > nyquistFreq) {
    throw new Error(
      `Frequency range max (${maxFreq}Hz) exceeds Nyquist frequency (${nyquistFreq}Hz) ` +
      `for sample rate ${effectiveConfig.sampleRate}Hz`
    );
  }

  // Validate audio buffer duration (both minimum and maximum)
  const minDuration = effectiveConfig.windowSize; // At least one window size
  const maxDuration = 300; // 5 minutes maximum to prevent browser freeze

  if (audioBuffer.duration < minDuration) {
    throw new Error(
      `Audio buffer too short: ${audioBuffer.duration.toFixed(2)}s (minimum: ${minDuration.toFixed(2)}s)`
    );
  }

  if (audioBuffer.duration > maxDuration) {
    logger.warn(
      `⚠️ Audio buffer very long (${audioBuffer.duration.toFixed(1)}s), ` +
      `this may cause performance issues. Maximum recommended: ${maxDuration}s`
    );
    // Note: We continue processing but warn the user
    // Truncation would require more complex buffer manipulation
  }

  // Get mono channel data
  const channelData = getMonoChannel(audioBuffer);

  // Split into chunks (0.330s windows with 0.066s overlap)
  const chunks = chunkSignal(channelData, audioBuffer.sampleRate, effectiveConfig);

  // Ensure we have at least one chunk
  if (chunks.length === 0) {
    throw new Error('Failed to extract any audio chunks - signal too short');
  }

  // Extract features from each chunk
  const features = chunks.map((chunk) => extractChunkFeatures(chunk, effectiveConfig));

  return features;
}

/**
 * Extract features from a raw audio chunk (for real-time processing)
 *
 * Optimized for live stream processing - no AudioBuffer overhead.
 * Use this for real-time feedback loops where chunks are continuously processed.
 *
 * @param samples - Raw audio samples (Float32Array)
 * @param config - DSP configuration
 * @returns Feature vector
 */
export function extractFeaturesFromChunk(
  samples: Float32Array,
  config: DSPConfig = DEFAULT_DSP_CONFIG
): FeatureVector {
  if (
    !config.sampleRate ||
    !isFinite(config.sampleRate) ||
    config.sampleRate <= 0 ||
    config.sampleRate > 192000
  ) {
    throw new Error(
      `Ungültige Sample Rate: ${config.sampleRate}Hz. ` +
      `Erwartet: 8000-192000Hz (typisch: 44100Hz oder 48000Hz)`
    );
  }

  const [minFreq, maxFreq] = config.frequencyRange;
  if (!isFinite(minFreq) || !isFinite(maxFreq) || minFreq < 0 || maxFreq <= minFreq) {
    throw new Error(
      `Invalid frequency range: [${minFreq}, ${maxFreq}]Hz. ` +
      `Min must be >= 0, Max must be > Min, both must be finite.`
    );
  }

  const nyquistFreq = config.sampleRate / 2;
  if (maxFreq > nyquistFreq) {
    throw new Error(
      `Frequency range max (${maxFreq}Hz) exceeds Nyquist frequency (${nyquistFreq}Hz) ` +
      `for sample rate ${config.sampleRate}Hz`
    );
  }

  const chunk: AudioChunk = {
    samples,
    startTime: 0,
    duration: samples.length / config.sampleRate,
    normalized: false,
  };

  return extractChunkFeatures(chunk, config);
}

/**
 * Extract features from a single audio chunk
 *
 * Steps:
 * 1. Standardize (mean removal + variance scaling)
 * 2. Apply windowing (Hanning)
 * 3. Compute FFT
 * 4. Calculate energy per frequency bin
 * 5. Bin into frequency groups (512 bins)
 * 6. Normalize to relative features
 *
 * @param chunk - Audio chunk
 * @param config - DSP configuration
 * @returns Feature vector
 */
function extractChunkFeatures(chunk: AudioChunk, config: DSPConfig): FeatureVector {
  // Step 0: CRITICAL - Calculate RMS amplitude BEFORE standardization
  // This preserves the actual signal strength for quality assessment and magnitude checks
  let rmsSum = 0;
  for (let i = 0; i < chunk.samples.length; i++) {
    rmsSum += chunk.samples[i] * chunk.samples[i];
  }
  const rmsAmplitude = Math.sqrt(rmsSum / chunk.samples.length);

  // Step 1: Standardize the chunk
  const standardized = standardizeSignal(chunk.samples);

  // CRITICAL FIX: Validate standardized signal is not degenerate
  // If RMS of standardized signal is too low, use non-standardized signal instead
  let standardizedRms = 0;
  for (let i = 0; i < standardized.length; i++) {
    standardizedRms += standardized[i] * standardized[i];
  }
  standardizedRms = Math.sqrt(standardizedRms / standardized.length);

  let signalToUse = standardized;
  if (standardizedRms < 1e-6) {
    logger.warn(`⚠️ Standardization produced near-zero signal (RMS=${standardizedRms.toExponential(2)}), using non-standardized signal instead`);
    signalToUse = chunk.samples; // Use original signal
  }

  // Step 2: Apply Hanning window
  const windowed = applyHanningWindow(signalToUse);

  // Step 3: Pad to power of 2 for FFT efficiency
  const padded = padToPowerOfTwo(windowed);

  // Step 4: Compute FFT
  const fftResult = fft(padded);

  // Step 5: Get magnitude (energy)
  const magnitude = getMagnitude(fftResult);

  // Step 6: Only use positive frequencies (0 to Nyquist)
  const positiveFreqs = magnitude.slice(0, magnitude.length / 2);

  // Step 7: Bin into frequency groups
  const binnedEnergy = binFrequencies(positiveFreqs, config.frequencyBins);

  // CRITICAL VALIDATION: Check if features are degenerate (all zeros or near-zeros)
  let totalEnergy = 0;
  for (let i = 0; i < binnedEnergy.length; i++) {
    totalEnergy += binnedEnergy[i];
  }

  if (totalEnergy < 1e-10) {
    logger.error(`❌ Feature extraction failed: Total energy = ${totalEnergy.toExponential(2)} (degenerate signal)`);
    logger.error(`   This indicates the signal is too constant or silent.`);
    logger.error(`   RMS amplitude: ${rmsAmplitude.toFixed(6)}`);
    throw new Error(
      `Feature extraction failed: Signal is too constant or silent (total energy = ${totalEnergy.toExponential(2)}). ` +
      `This can happen with very stable noise sources. Please ensure the signal has sufficient variation.`
    );
  }

  // Step 8: Calculate relative features (sum = 1)
  const relativeFeatures = normalizeFeatures(binnedEnergy);

  return {
    features: relativeFeatures,
    normalizedFeatures: relativeFeatures,
    absoluteFeatures: binnedEnergy,
    bins: config.frequencyBins,
    frequencyRange: [0, config.sampleRate / 2],
    rmsAmplitude: rmsAmplitude, // CRITICAL: Pre-standardization RMS for amplitude checks
  };
}

/**
 * Chunk signal into overlapping windows
 *
 * @param signal - Full audio signal
 * @param sampleRate - Sample rate (Hz)
 * @param config - DSP configuration
 * @returns Array of audio chunks
 */
function chunkSignal(signal: Float32Array, sampleRate: number, config: DSPConfig): AudioChunk[] {
  const windowSamples = Math.floor(config.windowSize * sampleRate);
  const hopSamples = Math.floor(config.hopSize * sampleRate);

  const chunks: AudioChunk[] = [];
  let offset = 0;

  while (offset + windowSamples <= signal.length) {
    const samples = signal.slice(offset, offset + windowSamples);

    chunks.push({
      samples,
      startTime: offset / sampleRate,
      duration: config.windowSize,
      normalized: false,
    });

    offset += hopSamples;
  }

  return chunks;
}

/**
 * Standardize signal (zero mean, unit variance)
 *
 * Critical preprocessing step for GMIA.
 *
 * @param signal - Input signal
 * @returns Standardized signal
 */
function standardizeSignal(signal: Float32Array): Float32Array {
  const n = signal.length;

  // Calculate mean
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += signal[i];
  }
  const mean = sum / n;

  // Calculate variance
  let varianceSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = signal[i] - mean;
    varianceSum += diff * diff;
  }
  const variance = varianceSum / n;
  const stdDev = Math.sqrt(variance);

  // CRITICAL FIX: If signal is too constant (stdDev ≈ 0), skip standardization
  // This prevents division by zero and generating all-zero feature vectors
  // Threshold: 1e-6 allows very stable signals while protecting against pure constants
  const MIN_STDDEV = 1e-6;

  if (stdDev < MIN_STDDEV) {
    logger.warn(`⚠️ Signal too constant (stdDev=${stdDev.toExponential(2)}), skipping standardization`);
    // Return mean-centered signal without variance scaling
    const standardized = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      standardized[i] = signal[i] - mean;
    }
    return standardized;
  }

  // Standardize normally (mean=0, variance=1)
  const standardized = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    standardized[i] = (signal[i] - mean) / stdDev;
  }

  return standardized;
}

/**
 * Bin frequencies into groups
 *
 * Groups the FFT output into N equally-spaced bins.
 * Calculates "Square Root Mean Value" for each bin.
 *
 * @param magnitudes - FFT magnitude spectrum
 * @param numBins - Number of bins (default: 512)
 * @returns Binned energy values
 */
function binFrequencies(magnitudes: Float64Array, numBins: number): Float64Array {
  // Guard: if magnitudes has fewer elements than bins, clamp numBins
  const effectiveBins = Math.min(numBins, magnitudes.length);
  const binnedEnergy = new Float64Array(numBins);
  const binSize = Math.max(1, Math.floor(magnitudes.length / effectiveBins));

  for (let bin = 0; bin < effectiveBins; bin++) {
    const startIdx = bin * binSize;
    const endIdx = bin === effectiveBins - 1 ? magnitudes.length : (bin + 1) * binSize;

    // Calculate Square Root Mean Value
    let sum = 0;
    let count = 0;

    for (let i = startIdx; i < endIdx; i++) {
      sum += magnitudes[i] * magnitudes[i]; // Energy = magnitude^2
      count++;
    }

    const meanSquare = count > 0 ? sum / count : 0;
    binnedEnergy[bin] = Math.sqrt(meanSquare);
  }

  return binnedEnergy;
}

/**
 * Normalize features to relative values (sum = 1)
 *
 * Formula: rf_j = f_j / f_tot
 *
 * @param features - Absolute feature values
 * @returns Normalized relative features
 */
function normalizeFeatures(features: Float64Array): Float64Array {
  const n = features.length;

  // Calculate total energy
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += features[i];
  }

  // Normalize
  const normalized = new Float64Array(n);

  if (total > 0) {
    for (let i = 0; i < n; i++) {
      normalized[i] = features[i] / total;
    }
  }

  return normalized;
}

/**
 * Convert stereo to mono by averaging channels
 *
 * @param audioBuffer - Web Audio API buffer
 * @returns Mono channel data
 */
function getMonoChannel(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Average all channels
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }

  // Divide by number of channels
  for (let i = 0; i < length; i++) {
    mono[i] /= audioBuffer.numberOfChannels;
  }

  return mono;
}

/**
 * Calculate frequency for a given bin index
 *
 * @param binIndex - Bin index
 * @param numBins - Total number of bins
 * @param sampleRate - Sample rate (Hz)
 * @returns Frequency in Hz
 */
export function binToFrequency(binIndex: number, numBins: number, sampleRate: number): number {
  const nyquist = sampleRate / 2;
  return (binIndex / numBins) * nyquist;
}
