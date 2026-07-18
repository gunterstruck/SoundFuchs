/**
 * ZANOBOT - Room Compensation (Pipeline-Stufe 3.5)
 *
 * Optionale Vorverarbeitung zur Kompensation konvolutiver
 * Raumakustik-Störungen (Nachhall / Reverberation).
 *
 * Zwei Stufen:
 * 1. CMN (Cepstral Mean Normalization) - entfernt systematischen spektralen Bias
 * 2. T60-basierte Late Reverberation Subtraction - entfernt geschätzte Nachhallenergie
 *
 * WICHTIG: Diese Funktionen werden NUR aufgerufen wenn die Einstellung aktiv ist.
 * Sie operieren auf den BEREITS EXTRAHIERTEN FeatureVector-Arrays und geben
 * modifizierte FeatureVector-Arrays zurück.
 */

import type { FeatureVector } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface T60Estimate {
  broadband: number;                // T60 in Sekunden (z.B. 0.8)
  subbands: Map<number, number>;    // centerFreq → T60
  timestamp: number;                // Wann gemessen
}

export interface RoomCompSettings {
  enabled: boolean;            // Master-Toggle (Standard: false)
  cmnEnabled: boolean;         // Legacy CMN (experimentell, default OFF – destruktiv bei stationären Signalen)
  biasMatchEnabled: boolean;   // Session Bias Match (empfohlen, default OFF bis getestet)
  t60Enabled: boolean;         // T60-Entzerrung aktiv (Standard: false, braucht Kalibrierung)
  beta: number;                // Over-Subtraction Factor (0.5–2.0, Standard: 1.0)
  spectralFloor: number;       // Spectral Floor ε (0.01–0.1, Standard: 0.05)
  calibrationMode: 'none' | 'chirp' | 'blind'; // Standard: 'none'
}

export const DEFAULT_ROOM_COMP_SETTINGS: RoomCompSettings = {
  enabled: false,
  cmnEnabled: false,           // CMN Default AUS (destruktiv bei stationären Signalen)
  biasMatchEnabled: false,     // Noch nicht getestet, default OFF
  t60Enabled: false,
  beta: 1.0,
  spectralFloor: 0.05,
  calibrationMode: 'none',
};

// ============================================================================
// ENVIRONMENT COMPARISON (Reference T60 vs. Diagnosis T60)
// ============================================================================

/**
 * Classify a T60 value into a machine-readable category.
 * Thresholds match classifyT60() in PipelineStatus.ts.
 */
export function classifyT60Value(t60: number): string {
  if (t60 < 0.3) return 'very_dry';
  if (t60 < 0.6) return 'dry';
  if (t60 < 1.0) return 'medium';
  if (t60 < 2.0) return 'reverberant';
  return 'very_reverberant';
}

/**
 * Return a localized display name for a T60 classification.
 */
export function getT60ClassificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    'very_dry': t('pipelineStatus.t60VeryDry'),
    'dry': t('pipelineStatus.t60Dry'),
    'medium': t('pipelineStatus.t60Medium'),
    'reverberant': t('pipelineStatus.t60Reverberant'),
    'very_reverberant': t('pipelineStatus.t60VeryReverberant'),
  };
  return labels[classification] ?? classification;
}

export interface EnvironmentComparisonResult {
  refT60: number;           // Reference T60 in seconds
  measT60: number;          // Current T60 in seconds
  deltaT60: number;         // |measT60 - refT60| in seconds
  ratio: number;            // measT60 / refT60 (>1 = more reverberant, <1 = dryer)
  severity: 'ok' | 'warning' | 'critical';
  message: string;          // Human-readable hint (localized)
  recommendation: string;   // Action recommendation (localized)
}

/**
 * Compare the current test environment with the reference environment.
 *
 * Thresholds:
 *   Ratio 0.7 – 1.5 → ok (similar environment, no hint)
 *   Ratio 1.5 – 3.0 or 0.3 – 0.7 → warning (significantly different)
 *   Ratio > 3.0 or < 0.3 → critical (strongly deviating)
 *
 * @param refT60 - T60 of the reference session (seconds)
 * @param measT60 - T60 of the current diagnosis session (seconds)
 */
export function compareEnvironments(refT60: number, measT60: number): EnvironmentComparisonResult {
  const deltaT60 = Math.abs(measT60 - refT60);
  const ratio = refT60 > 0 ? measT60 / refT60 : (measT60 > 0 ? Infinity : 1);

  let severity: 'ok' | 'warning' | 'critical';
  let message: string;
  let recommendation: string;

  if (ratio >= 0.7 && ratio <= 1.5) {
    severity = 'ok';
    message = t('envCompare.ok');
    recommendation = '';
  } else if (ratio > 1.5 && ratio <= 3.0) {
    severity = 'warning';
    message = t('envCompare.moreReverberant');
    recommendation = t('envCompare.recommendCloser');
  } else if (ratio < 0.7 && ratio >= 0.3) {
    severity = 'warning';
    message = t('envCompare.lesserReverberant');
    recommendation = t('envCompare.recommendNote');
  } else if (ratio > 3.0) {
    severity = 'critical';
    message = t('envCompare.muchMoreReverberant');
    recommendation = t('envCompare.recommendCompensation');
  } else {
    // ratio < 0.3
    severity = 'critical';
    message = t('envCompare.muchLessReverberant');
    recommendation = t('envCompare.recommendNote');
  }

  return {
    refT60,
    measT60,
    deltaT60,
    ratio,
    severity,
    message,
    recommendation,
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Spectral floor to prevent log(0) */
const EPSILON = 1e-10;

// ============================================================================
// PHASE 1: CEPSTRAL MEAN NORMALIZATION (CMN)
// ============================================================================

/**
 * Apply Cepstral Mean Normalization to feature vectors.
 *
 * CMN removes the average spectral shape (room transfer function) by:
 * 1. Converting absoluteFeatures to log domain
 * 2. Computing the mean log-spectrum across all frames
 * 3. Subtracting the mean from each frame
 * 4. Converting back to linear domain
 *
 * This compensates for the systematic spectral "coloring" introduced by
 * room acoustics (convolutive distortion: Y = S * h(t)).
 *
 * IMPORTANT: Original FeatureVectors are NOT mutated (immutable operation).
 *
 * @param features - Array of FeatureVectors from extractFeatures()
 * @returns New array of CMN-normalized FeatureVectors
 */
export function applyCMN(features: FeatureVector[]): FeatureVector[] {
  if (features.length === 0) {
    return [];
  }

  const numBins = features[0].absoluteFeatures.length;
  const numFrames = features.length;

  // Step 1: Compute mean log-spectrum across all frames
  const meanLogSpectrum = new Float64Array(numBins);

  for (let n = 0; n < numFrames; n++) {
    const abs = features[n].absoluteFeatures;
    for (let k = 0; k < numBins; k++) {
      meanLogSpectrum[k] += Math.log(abs[k] + EPSILON);
    }
  }

  for (let k = 0; k < numBins; k++) {
    meanLogSpectrum[k] /= numFrames;
  }

  // Step 2: Subtract mean and convert back to linear domain for each frame
  const result: FeatureVector[] = new Array(numFrames);

  for (let n = 0; n < numFrames; n++) {
    const abs = features[n].absoluteFeatures;
    const newAbsolute = new Float64Array(numBins);

    for (let k = 0; k < numBins; k++) {
      const logVal = Math.log(abs[k] + EPSILON) - meanLogSpectrum[k];
      newAbsolute[k] = Math.exp(logVal);
    }

    // Re-normalize: features (sum = 1)
    const newFeatures = normalizeToSum1(newAbsolute);

    result[n] = {
      features: newFeatures,
      normalizedFeatures: newFeatures,
      absoluteFeatures: newAbsolute,
      bins: features[n].bins,
      frequencyRange: features[n].frequencyRange,
      rmsAmplitude: features[n].rmsAmplitude,
    };
  }

  logger.info(`🔧 CMN applied to ${numFrames} frames (${numBins} bins)`);
  return result;
}

// ============================================================================
// SESSION BIAS MATCH (Cross-Session Room Compensation)
// ============================================================================

/**
 * Session Bias Match – Room compensation for quasi-stationary signals.
 *
 * Instead of removing the per-session mean (CMN, destructive for machines),
 * only the DIFFERENCE between reference and measurement session is compensated.
 *
 * Math:
 *   µ_ref[k] = (1/N) · Σ log(ESD_ref[k])     // Mean log-spectrum of reference
 *   µ_meas[k] = (1/N) · Σ log(ESD_meas[k])   // Mean log-spectrum of measurement
 *   bias[k] = µ_ref[k] - µ_meas[k]            // Spectral coloring difference
 *   ESD_meas_corr[k] = exp(log(ESD_meas[k]) + bias[k])  // Align measurement to reference
 *
 * Effect: Compensates constant spectral differences between sessions
 *         (different mic position, different room, different temperature),
 *         WITHOUT destroying the machine signature.
 *
 * @param measurementFeatures - Feature vectors of the CURRENT measurement
 * @param referenceFeatures - Feature vectors of the stored REFERENCE
 * @returns Corrected measurement features (only measurement is adjusted, reference stays unchanged)
 */
export function applySessionBiasMatch(
  measurementFeatures: FeatureVector[],
  referenceFeatures: FeatureVector[]
): FeatureVector[] {
  if (measurementFeatures.length === 0 || referenceFeatures.length === 0) {
    return measurementFeatures;
  }

  const K = measurementFeatures[0].absoluteFeatures.length; // 512 bins
  const epsilon = 1e-30; // Floor for log(0)

  // Step 1: Compute mean log-spectrum of reference
  const muRef = new Float64Array(K);
  for (const fv of referenceFeatures) {
    for (let k = 0; k < K; k++) {
      muRef[k] += Math.log(fv.absoluteFeatures[k] + epsilon);
    }
  }
  for (let k = 0; k < K; k++) {
    muRef[k] /= referenceFeatures.length;
  }

  // Step 2: Compute mean log-spectrum of measurement
  const muMeas = new Float64Array(K);
  for (const fv of measurementFeatures) {
    for (let k = 0; k < K; k++) {
      muMeas[k] += Math.log(fv.absoluteFeatures[k] + epsilon);
    }
  }
  for (let k = 0; k < K; k++) {
    muMeas[k] /= measurementFeatures.length;
  }

  // Step 3: Compute bias (reference minus measurement)
  const bias = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    bias[k] = muRef[k] - muMeas[k];
  }

  // Step 4: Correct measurement
  const result: FeatureVector[] = [];
  for (const fv of measurementFeatures) {
    const newAbsolute = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const logVal = Math.log(fv.absoluteFeatures[k] + epsilon);
      newAbsolute[k] = Math.exp(logVal + bias[k]);
    }

    // Re-normalize (sum = 1)
    const newNormalized = normalizeToSum1(newAbsolute);

    result.push({
      features: newNormalized,
      normalizedFeatures: newNormalized,
      absoluteFeatures: newAbsolute,
      bins: fv.bins,
      frequencyRange: fv.frequencyRange,
      rmsAmplitude: fv.rmsAmplitude,
    });
  }

  logger.info(`🔄 Session Bias Match applied to ${measurementFeatures.length} frames (${K} bins)`);
  return result;
}

/**
 * Realtime Session Bias Match for live diagnosis.
 *
 * Receives the reference mean once at initialization and builds
 * the measurement mean incrementally (exponential smoothing).
 */
export class RealtimeBiasMatch {
  private muRef: Float64Array;           // Log mean of reference (fixed)
  private muMeas: Float64Array;          // Running log mean of measurement
  private frameCount: number = 0;
  private readonly alpha: number;        // Smoothing factor (0.02 = slow, robust)
  private readonly minFrames: number = 3; // Minimum frames before correction activates
  private readonly K: number;
  private readonly epsilon: number = 1e-30;

  /**
   * @param source - Either FeatureVector[] (compute mean live) or Float64Array (precomputed log-mean from IndexedDB)
   * @param alpha - Exponential smoothing factor (default: 0.02)
   */
  constructor(source: FeatureVector[] | Float64Array, alpha: number = 0.02) {
    this.alpha = alpha;

    if (source instanceof Float64Array) {
      // Precomputed log-mean (loaded from IndexedDB via Machine.refLogMean)
      this.K = source.length;
      this.muRef = new Float64Array(source);
    } else {
      // Feature vectors → compute mean live
      if (!source || source.length === 0) {
        throw new Error('RealtimeBiasMatch requires non-empty reference features');
      }
      this.K = source[0].absoluteFeatures.length;
      this.muRef = new Float64Array(this.K);
      for (const fv of source) {
        for (let k = 0; k < this.K; k++) {
          this.muRef[k] += Math.log(fv.absoluteFeatures[k] + this.epsilon);
        }
      }
      for (let k = 0; k < this.K; k++) {
        this.muRef[k] /= source.length;
      }
    }

    this.muMeas = new Float64Array(this.K);
  }

  /**
   * Process a single measurement frame and return the corrected frame.
   * The first `minFrames` frames are passed through uncorrected
   * (mean needs to build up first).
   */
  processFrame(featureVector: FeatureVector): FeatureVector {
    this.frameCount++;

    // Update running mean of measurement (exponential smoothing)
    if (this.frameCount === 1) {
      // First frame: initialize muMeas
      for (let k = 0; k < this.K; k++) {
        this.muMeas[k] = Math.log(featureVector.absoluteFeatures[k] + this.epsilon);
      }
    } else {
      for (let k = 0; k < this.K; k++) {
        const logVal = Math.log(featureVector.absoluteFeatures[k] + this.epsilon);
        this.muMeas[k] = (1 - this.alpha) * this.muMeas[k] + this.alpha * logVal;
      }
    }

    // Not enough frames yet → pass through uncorrected
    if (this.frameCount < this.minFrames) {
      return featureVector;
    }

    // Compute and apply bias
    const newAbsolute = new Float64Array(this.K);
    for (let k = 0; k < this.K; k++) {
      const bias = this.muRef[k] - this.muMeas[k];
      const logVal = Math.log(featureVector.absoluteFeatures[k] + this.epsilon);
      newAbsolute[k] = Math.exp(logVal + bias);
    }

    // Re-normalize
    const newNormalized = normalizeToSum1(newAbsolute);

    return {
      features: newNormalized,
      normalizedFeatures: newNormalized,
      absoluteFeatures: newAbsolute,
      bins: featureVector.bins,
      frequencyRange: featureVector.frequencyRange,
      rmsAmplitude: featureVector.rmsAmplitude,
    };
  }

  reset(): void {
    this.frameCount = 0;
    this.muMeas.fill(0);
  }
}

// ============================================================================
// PHASE 2: CHIRP GENERATION + T60 ESTIMATION + LATE REVERB SUBTRACTION
// ============================================================================

/** Chirp sweep start frequency (Hz) */
const CHIRP_F0 = 200;
/** Chirp sweep end frequency (Hz) */
const CHIRP_F1 = 8000;
/** Chirp amplitude (loud enough for room reflections, quiet enough not to disturb) */
const CHIRP_AMPLITUDE = 0.4;
/** Extra recording time after chirp to capture room decay (ms) */
const CHIRP_TAIL_MS = 500;
/** Minimum peak-to-noise ratio for valid chirp detection (~12 dB) */
const MIN_PEAK_RATIO = 4;
/** Minimum plausible T60 (seconds) */
const MIN_T60 = 0.1;
/** Maximum plausible T60 (seconds) */
const MAX_T60 = 5.0;

/**
 * Generate a logarithmic sine sweep (chirp) signal.
 *
 * Produces a Tukey-windowed log sweep from 200 Hz to 8000 Hz.
 * Used to excite the room so the impulse response can be extracted
 * via cross-correlation with the recorded signal.
 *
 * @param sampleRate - Sample rate in Hz (e.g. 48000)
 * @param duration - Duration in seconds (default: 0.06 = 60ms)
 * @returns Chirp signal as Float32Array
 */
export function generateChirp(sampleRate: number, duration: number = 0.06): Float32Array {
  const N = Math.floor(sampleRate * duration);
  const chirp = new Float32Array(N);

  // Logarithmic sweep parameter: L = duration / ln(f1/f0)
  const L = duration / Math.log(CHIRP_F1 / CHIRP_F0);

  // Tukey window: 10% fade-in, 10% fade-out, flat in the middle
  // Guard against fadeLength=0 (when N < 10) to prevent division by zero
  const fadeLength = Math.max(1, Math.floor(N * 0.1));

  for (let i = 0; i < N; i++) {
    const t = i / sampleRate;

    // Logarithmic instantaneous phase
    const phase = 2 * Math.PI * CHIRP_F0 * L * (Math.exp(t / L) - 1);

    // Tukey window
    let window = 1.0;
    if (i < fadeLength) {
      window = 0.5 * (1 - Math.cos(Math.PI * i / fadeLength));
    } else if (i >= N - fadeLength) {
      window = 0.5 * (1 - Math.cos(Math.PI * (N - 1 - i) / fadeLength));
    }

    chirp[i] = CHIRP_AMPLITUDE * window * Math.sin(phase);
  }

  return chirp;
}

/**
 * Play a chirp through the speaker and simultaneously record via microphone.
 *
 * Uses ScriptProcessorNode (deprecated but universally supported) to capture
 * raw samples synchronously. The recording includes the chirp duration plus
 * 500ms tail for room decay.
 *
 * @param audioContext - Active AudioContext (state === 'running')
 * @param stream - Active MediaStream from getUserMedia
 * @param duration - Chirp duration in seconds (default: 0.06)
 * @returns Object with original chirp and recorded microphone signal
 */
export async function playChirpAndRecord(
  audioContext: AudioContext,
  stream: MediaStream,
  duration: number = 0.06
): Promise<{ chirp: Float32Array; recorded: Float32Array }> {
  const sampleRate = audioContext.sampleRate;
  const chirp = generateChirp(sampleRate, duration);

  // Total capture duration: chirp + tail for room reflections
  const totalDurationMs = duration * 1000 + CHIRP_TAIL_MS;
  const expectedSamples = Math.ceil(sampleRate * totalDurationMs / 1000);

  // Create AudioBuffer from chirp and play through speakers
  const buffer = audioContext.createBuffer(1, chirp.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  channelData.set(chirp);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  // Set up recording via ScriptProcessorNode
  const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
  const micSource = audioContext.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];
  let totalSamples = 0;

  scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    totalSamples += input.length;
  };

  // Connect: mic → scriptNode → destination (must be connected to fire events)
  micSource.connect(scriptNode);
  scriptNode.connect(audioContext.destination);

  // Start playback
  source.start();

  // Wait for total capture duration
  await new Promise<void>((resolve) => {
    setTimeout(resolve, totalDurationMs + 50); // +50ms safety margin
  });

  // Disconnect and clean up
  scriptNode.onaudioprocess = null;
  try { micSource.disconnect(scriptNode); } catch { /* already disconnected */ }
  try { scriptNode.disconnect(audioContext.destination); } catch { /* already disconnected */ }
  try { source.disconnect(audioContext.destination); } catch { /* already disconnected */ }

  // Concatenate recorded chunks into a single Float32Array
  const recorded = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    recorded.set(chunk, offset);
    offset += chunk.length;
  }

  // Trim or pad to expected length
  const finalRecorded = recorded.length >= expectedSamples
    ? recorded.slice(0, expectedSamples)
    : recorded;

  logger.info(`🔊 Chirp played (${chirp.length} samples) + recorded (${finalRecorded.length} samples)`);

  return { chirp, recorded: finalRecorded };
}

/**
 * Estimate T60 reverberation time from a played chirp and its recording.
 *
 * Pipeline:
 * 1. Cross-correlation → Room Impulse Response (RIR)
 * 2. Peak detection + SNR validation
 * 3. Schroeder backward integration
 * 4. Linear regression on -5dB to -25dB decay range
 * 5. T60 = -60 / slope
 *
 * @param chirp - The known chirp signal that was played
 * @param recorded - The recorded signal containing chirp + room response
 * @param sampleRate - Sample rate in Hz
 * @returns T60 estimate or null if measurement failed
 */
export function estimateT60FromChirp(
  chirp: Float32Array,
  recorded: Float32Array,
  sampleRate: number
): T60Estimate | null {
  // Step 1: Cross-correlation to extract Room Impulse Response
  const correlation = crossCorrelation(recorded, chirp);

  // Step 2: Find peak (direct sound arrival) and validate
  let peakIndex = 0;
  let peakValue = 0;
  for (let i = 0; i < correlation.length; i++) {
    const absVal = Math.abs(correlation[i]);
    if (absVal > peakValue) {
      peakValue = absVal;
      peakIndex = i;
    }
  }

  // Calculate noise floor as median of absolute correlation values
  const absCorrelation = new Float64Array(correlation.length);
  for (let i = 0; i < correlation.length; i++) {
    absCorrelation[i] = Math.abs(correlation[i]);
  }
  const sorted = Array.from(absCorrelation).sort((a, b) => a - b);
  const medianNoise = sorted[Math.floor(sorted.length / 2)];

  // Peak-to-noise ratio check
  const peakRatio = medianNoise > 0 ? peakValue / medianNoise : 0;
  if (peakRatio < MIN_PEAK_RATIO) {
    logger.warn(`⚠️ Chirp: Peak-to-noise ratio too low (${peakRatio.toFixed(1)} < ${MIN_PEAK_RATIO})`);
    return null;
  }

  // Extract RIR from peak onwards
  const rirLength = Math.min(correlation.length - peakIndex, Math.floor(sampleRate * 2));
  if (rirLength < Math.floor(sampleRate * 0.05)) {
    logger.warn('⚠️ Chirp: RIR too short for T60 estimation');
    return null;
  }

  // Step 3: Schroeder backward integration on squared RIR
  // E[n] = Σ(k=n..N-1) h²[k], in dB: 10·log10(E[n] / E[0])
  const schroeder = new Float64Array(rirLength);
  let cumSum = 0;
  for (let n = rirLength - 1; n >= 0; n--) {
    const h = correlation[peakIndex + n];
    cumSum += h * h;
    schroeder[n] = cumSum;
  }

  // Convert to dB relative to total energy
  const totalEnergy = schroeder[0];
  if (totalEnergy <= 0) {
    logger.warn('⚠️ Chirp: Zero energy in RIR');
    return null;
  }

  const schroederDB = new Float64Array(rirLength);
  for (let n = 0; n < rirLength; n++) {
    schroederDB[n] = 10 * Math.log10(schroeder[n] / totalEnergy + 1e-30);
  }

  // Step 4: Find -5dB and -25dB crossing points for linear regression
  let nStart = -1;
  let nEnd = -1;
  for (let n = 0; n < rirLength; n++) {
    if (nStart < 0 && schroederDB[n] < -5) {
      nStart = n;
    }
    if (nEnd < 0 && schroederDB[n] < -25) {
      nEnd = n;
      break;
    }
  }

  if (nStart < 0 || nEnd < 0 || nEnd - nStart < 10) {
    logger.warn(`⚠️ Chirp: Insufficient decay range for regression (start=${nStart}, end=${nEnd})`);
    return null;
  }

  // Step 5: Linear regression y = mx + b on the -5dB to -25dB segment
  const count = nEnd - nStart;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < count; i++) {
    const x = nStart + i;
    const y = schroederDB[x];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = count * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-30) {
    logger.warn('⚠️ Chirp: Degenerate regression (zero denominator)');
    return null;
  }

  // Slope in dB/sample
  const slopePerSample = (count * sumXY - sumX * sumY) / denominator;

  // Convert slope to dB/second and compute T60
  const slopePerSecond = slopePerSample * sampleRate;
  if (slopePerSecond >= 0) {
    logger.warn('⚠️ Chirp: Non-negative decay slope (no reverberation detected)');
    return null;
  }

  const t60 = -60 / slopePerSecond;

  // Step 6: Plausibility check
  if (t60 < MIN_T60 || t60 > MAX_T60) {
    logger.warn(`⚠️ Chirp: T60 out of plausible range (${t60.toFixed(2)}s, expected ${MIN_T60}–${MAX_T60}s)`);
    return null;
  }

  logger.info(`🔊 T60 estimated: ${t60.toFixed(2)}s (peak ratio: ${peakRatio.toFixed(1)}, regression ${nStart}–${nEnd} samples)`);

  return {
    broadband: t60,
    subbands: new Map([[500, t60]]),
    timestamp: Date.now(),
  };
}

/** Configuration for late reverberation subtraction */
interface ReverbSubtractionConfig {
  beta: number;
  spectralFloor: number;
  hopSize: number;
}

/**
 * Apply late reverberation subtraction to feature vectors.
 *
 * Implements Lebart et al. (2001): estimates late reverberant energy
 * from delayed frames and subtracts it from the current frame's spectrum.
 *
 * For each frame n and frequency bin k:
 *   Φ_late(n,k) = decayFactor · |X(n-Δ, k)|²
 *   G(n,k) = max(1 - β · Φ_late / (|X(n,k)|² + ε), spectralFloor)
 *   ESD_clean(n,k) = G(n,k) · ESD_raw(n,k)
 *
 * @param features - Input feature vectors
 * @param t60 - T60 estimate from chirp measurement
 * @param config - Subtraction parameters (beta, spectralFloor, hopSize)
 * @returns New array of processed FeatureVectors (originals untouched)
 */
export function applyLateReverbSubtraction(
  features: FeatureVector[],
  t60: T60Estimate,
  config: ReverbSubtractionConfig
): FeatureVector[] {
  if (features.length === 0) {
    return [];
  }

  // Prediction delay in frames (~50ms worth of hop-size frames)
  const delta = Math.max(1, Math.round(0.05 / config.hopSize));

  // Exponential decay factor: exp(-2·Δ·hopSize / T60)
  const decayFactor = Math.exp(-2 * delta * config.hopSize / t60.broadband);

  const numFrames = features.length;
  const result: FeatureVector[] = new Array(numFrames);

  for (let n = 0; n < numFrames; n++) {
    const K = features[n].absoluteFeatures.length;
    const newAbsolute = new Float64Array(K);

    for (let k = 0; k < K; k++) {
      const currEnergy = features[n].absoluteFeatures[k];

      if (n < delta) {
        // No delayed frame available → pass through unchanged
        newAbsolute[k] = currEnergy;
      } else {
        const prevEnergy = features[n - delta].absoluteFeatures[k];
        const reverbEstimate = decayFactor * prevEnergy;
        const gain = Math.max(
          1.0 - config.beta * reverbEstimate / (currEnergy + 1e-30),
          config.spectralFloor
        );
        newAbsolute[k] = gain * currEnergy;
      }
    }

    // Re-normalize (sum = 1)
    const newFeatures = normalizeToSum1(newAbsolute);

    result[n] = {
      features: newFeatures,
      normalizedFeatures: newFeatures,
      absoluteFeatures: newAbsolute,
      bins: features[n].bins,
      frequencyRange: features[n].frequencyRange,
      rmsAmplitude: features[n].rmsAmplitude,
    };
  }

  logger.info(`🔧 Late reverb subtraction applied: Δ=${delta} frames, decay=${decayFactor.toFixed(4)}, β=${config.beta}, T60=${t60.broadband.toFixed(2)}s`);
  return result;
}

// ============================================================================
// REAL-TIME T60 SUBTRACTION (for Diagnose phase – single-frame streaming)
// ============================================================================

/**
 * Maintains a buffer of previous frame energies for real-time late reverb
 * subtraction during streaming diagnosis.
 *
 * With hopSize=66ms and a prediction delay of ~50ms, Δ=1 frame. This class
 * stores the previous frame's absoluteFeatures and applies the Lebart et al.
 * gain formula to each incoming frame.
 *
 * Usage:
 *   const rtT60 = new RealtimeT60Subtraction(512, t60Estimate, settings);
 *   const cleaned = rtT60.process(featureVector);
 */
export class RealtimeT60Subtraction {
  private numBins: number;
  private prevAbsolute: Float64Array | null = null;
  private decayFactor: number;
  private beta: number;
  private spectralFloor: number;

  constructor(numBins: number, t60: T60Estimate, beta: number, spectralFloor: number) {
    this.numBins = numBins;
    this.beta = beta;
    this.spectralFloor = spectralFloor;

    // Prediction delay Δ=1 frame (≈66ms hop, closest to 50ms target)
    const hopSize = 0.066;
    const delta = 1;
    this.decayFactor = Math.exp(-2 * delta * hopSize / t60.broadband);
  }

  /**
   * Process a single feature vector with late reverb subtraction.
   * Returns the input unchanged for the first frame (no previous frame available).
   */
  process(fv: FeatureVector): FeatureVector {
    if (!this.prevAbsolute) {
      // First frame: no delayed reference, store and pass through
      this.prevAbsolute = new Float64Array(fv.absoluteFeatures);
      return fv;
    }

    const newAbsolute = new Float64Array(this.numBins);
    for (let k = 0; k < this.numBins; k++) {
      const currEnergy = fv.absoluteFeatures[k];
      const prevEnergy = this.prevAbsolute[k];
      const reverbEstimate = this.decayFactor * prevEnergy;
      const gain = Math.max(
        1.0 - this.beta * reverbEstimate / (currEnergy + 1e-30),
        this.spectralFloor
      );
      newAbsolute[k] = gain * currEnergy;
    }

    // Store current frame for next iteration
    this.prevAbsolute = new Float64Array(fv.absoluteFeatures);

    const newFeatures = normalizeToSum1(newAbsolute);

    return {
      features: newFeatures,
      normalizedFeatures: newFeatures,
      absoluteFeatures: newAbsolute,
      bins: fv.bins,
      frequencyRange: fv.frequencyRange,
      rmsAmplitude: fv.rmsAmplitude,
    };
  }

  reset(): void {
    this.prevAbsolute = null;
  }
}

// ============================================================================
// REAL-TIME CMN (for Diagnose phase – single-frame streaming)
// ============================================================================

/**
 * Maintains a running mean of the log-spectrum for real-time CMN.
 *
 * In the Diagnose phase, feature vectors arrive one at a time (330ms chunks).
 * Batch CMN cannot be applied to a single frame (subtracting the frame's own
 * mean would flatten everything to 1.0). Instead, this class accumulates
 * a running mean across frames and applies it to each new frame.
 *
 * After ~5 frames (≈1.5s with 330ms windows and 66ms hop), the mean stabilizes
 * and CMN becomes effective at removing the room transfer function.
 *
 * Usage:
 *   const rtCmn = new RealtimeCMN(512);
 *   // For each incoming chunk:
 *   const compensated = rtCmn.process(featureVector);
 */
export class RealtimeCMN {
  private numBins: number;
  private meanLogSpectrum: Float64Array;
  private frameCount: number = 0;

  /** Minimum frames required before CMN is applied (avoids unstable early mean) */
  private static readonly MIN_FRAMES = 3;

  constructor(numBins: number) {
    this.numBins = numBins;
    this.meanLogSpectrum = new Float64Array(numBins);
  }

  /**
   * Process a single feature vector with running CMN.
   *
   * Updates the running mean and returns a CMN-normalized copy of the input.
   * For the first few frames (< MIN_FRAMES), returns the input unchanged
   * because the mean is not yet stable.
   *
   * @param fv - Single FeatureVector from extractFeaturesFromChunk()
   * @returns New FeatureVector with CMN applied (or unchanged if too few frames)
   */
  process(fv: FeatureVector): FeatureVector {
    const abs = fv.absoluteFeatures;

    // Update running mean (incremental: newMean = oldMean + (newVal - oldMean) / n)
    this.frameCount++;
    for (let k = 0; k < this.numBins; k++) {
      const logVal = Math.log(abs[k] + EPSILON);
      this.meanLogSpectrum[k] += (logVal - this.meanLogSpectrum[k]) / this.frameCount;
    }

    // Don't apply CMN until mean is stable
    if (this.frameCount < RealtimeCMN.MIN_FRAMES) {
      return fv;
    }

    // Apply CMN: subtract running mean in log domain, convert back
    const newAbsolute = new Float64Array(this.numBins);
    for (let k = 0; k < this.numBins; k++) {
      const logVal = Math.log(abs[k] + EPSILON) - this.meanLogSpectrum[k];
      newAbsolute[k] = Math.exp(logVal);
    }

    const newFeatures = normalizeToSum1(newAbsolute);

    return {
      features: newFeatures,
      normalizedFeatures: newFeatures,
      absoluteFeatures: newAbsolute,
      bins: fv.bins,
      frequencyRange: fv.frequencyRange,
      rmsAmplitude: fv.rmsAmplitude,
    };
  }

  /**
   * Reset the running mean (e.g., when starting a new diagnosis session).
   */
  reset(): void {
    this.meanLogSpectrum.fill(0);
    this.frameCount = 0;
  }
}

// ============================================================================
// MAIN WRAPPER
// ============================================================================

/**
 * Apply room compensation to feature vectors based on settings.
 *
 * This is the main entry point called from Reference and Diagnose phases.
 * Depending on settings, it applies:
 * - T60-based late reverberation subtraction (if calibrated)
 * - Session Bias Match (recommended, needs reference features)
 * - CMN (experimental, only if explicitly activated and bias match is OFF)
 * - Nothing (if disabled)
 *
 * @param features - Array of FeatureVectors from extractFeatures()
 * @param settings - Room compensation settings from localStorage
 * @param t60 - Optional T60 estimate
 * @param referenceFeatures - Optional reference features (for Session Bias Match)
 * @returns Processed FeatureVectors (new array, originals untouched)
 */
export function applyRoomCompensation(
  features: FeatureVector[],
  settings: RoomCompSettings,
  t60?: T60Estimate,
  referenceFeatures?: FeatureVector[]
): FeatureVector[] {
  if (!settings.enabled) {
    return features;
  }

  let processed = features;

  // Stage 1: T60-based late reverb subtraction (physically correct, if available)
  if (settings.t60Enabled && t60) {
    processed = applyLateReverbSubtraction(processed, t60, {
      beta: settings.beta,
      spectralFloor: settings.spectralFloor,
      hopSize: 0.066, // DSP hop size in seconds
    });
  }

  // Stage 2a: Session Bias Match (recommended, needs reference features)
  if (settings.biasMatchEnabled && referenceFeatures && referenceFeatures.length > 0) {
    processed = applySessionBiasMatch(processed, referenceFeatures);
  } else if (settings.biasMatchEnabled && (!referenceFeatures || referenceFeatures.length === 0)) {
    // Bias Match requested but no reference features available.
    // Fall back to CMN if also enabled, otherwise skip silently.
    logger.warn('⚠️ Session Bias Match enabled but no reference features available – skipped');
    if (settings.cmnEnabled) {
      logger.info('🔧 Falling back to CMN');
      processed = applyCMN(processed);
    }
  }

  // Stage 2b: CMN (experimental, only if explicitly activated and bias match is OFF)
  if (settings.cmnEnabled && !settings.biasMatchEnabled) {
    processed = applyCMN(processed);
  }

  return processed;
}

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'zanobot-room-comp-settings';

/**
 * Read room compensation settings from localStorage.
 * Returns defaults if nothing is stored or parsing fails.
 */
export function getRoomCompSettings(): RoomCompSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_ROOM_COMP_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    /* ignore parse errors */
  }
  return { ...DEFAULT_ROOM_COMP_SETTINGS };
}

/**
 * Write (merge) room compensation settings to localStorage.
 */
export function setRoomCompSettings(settings: Partial<RoomCompSettings>): void {
  const current = getRoomCompSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize a Float64Array so that all values sum to 1.
 * Used to recreate relative features after CMN or spectral subtraction.
 */
function normalizeToSum1(values: Float64Array): Float64Array {
  const n = values.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += values[i];
  }

  const normalized = new Float64Array(n);
  if (total > 0) {
    for (let i = 0; i < n; i++) {
      normalized[i] = values[i] / total;
    }
  }
  return normalized;
}

/**
 * Time-domain cross-correlation between a signal and a template.
 *
 * For a 60ms chirp at 48kHz (2880 samples) and a 600ms recording (28800 samples),
 * this requires ~83M multiplications — well under 100ms on modern smartphones.
 *
 * @param signal - Recorded signal (longer)
 * @param template - Known chirp signal (shorter)
 * @returns Cross-correlation values for each lag position
 */
function crossCorrelation(signal: Float32Array, template: Float32Array): Float64Array {
  const N = signal.length;
  const M = template.length;
  const result = new Float64Array(N);

  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    const limit = Math.min(M, N - lag);
    for (let j = 0; j < limit; j++) {
      sum += signal[lag + j] * template[j];
    }
    result[lag] = sum;
  }

  return result;
}
