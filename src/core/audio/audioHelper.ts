/**
 * ZANOBOT - AUDIO HELPER
 *
 * Centralized audio configuration and utilities for Phase 5.
 *
 * Features:
 * - Global audio constraints (disable AGC, echo cancellation, noise suppression)
 * - Smart Start logic (warm-up + signal trigger)
 * - Ensures identical audio parameters across Phase 2 and Phase 3
 */

import { logger } from '@utils/logger.js';
import { isIOS } from '@utils/platform.js';
import { t } from '../../i18n/index.js';
import { HardwareCheck } from './HardwareCheck.js';

/**
 * Standard audio constraints for raw, unprocessed audio
 *
 * CRITICAL: We use explicit boolean `false` instead of `{ exact: false }` to force
 * iOS/Android to switch from "Voice Processing Mode" to "Media Recording Mode".
 *
 * Voice Processing Mode (default for telephony):
 * - Uses front/bottom microphone
 * - Applies aggressive noise suppression (filters machine sounds as "noise")
 * - Echo cancellation (removes reverb/room acoustics)
 * - Auto gain control (normalizes volume, removes dynamic range)
 *
 * Media Recording Mode (what we need):
 * - Can use rear/camera microphone (far-field, room recording)
 * - Raw, unfiltered audio with full frequency response
 * - Preserves machine sound characteristics for AI diagnosis
 *
 * The explicit `false` boolean often triggers this mode switch on mobile browsers.
 */
export const AUDIO_CONSTRAINTS = {
  audio: {
    // HARDCORE: Force disable all audio processing
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    channelCount: 1, // Mono is more robust
    sampleRate: 48000, // High quality audio (matches config.json)
  },
};

/**
 * Get live microphone devices (no caching, no persistence).
 *
 * Returns only the current audioinput devices reported by the browser.
 */
export async function getMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((device) => device.kind === 'audioinput');

  if (audioInputs.length <= 1) {
    return audioInputs;
  }

  const specialDeviceIds = new Set(['default', 'communications']);
  const normalizeLabel = (label: string): string => label.trim().toLowerCase();
  const keyFor = (device: MediaDeviceInfo): string => {
    const normalizedLabel = normalizeLabel(device.label || '');
    return `${device.groupId || 'no-group'}::${normalizedLabel || device.deviceId}`;
  };

  const hasNonSpecial = new Set<string>();
  audioInputs.forEach((device) => {
    if (!specialDeviceIds.has(device.deviceId)) {
      hasNonSpecial.add(keyFor(device));
    }
  });

  const seen = new Set<string>();
  return audioInputs.filter((device) => {
    const key = keyFor(device);
    if (specialDeviceIds.has(device.deviceId) && hasNonSpecial.has(key)) {
      return false;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Build audio constraints with optional device ID
 *
 * IMPORTANT: Uses explicit boolean `false` for all audio processing flags
 * to force "Media Recording Mode" instead of "Voice Processing Mode".
 *
 * @param deviceId - Optional specific device ID to use
 * @returns Audio constraints object
 */
export function buildAudioConstraints(deviceId?: string): MediaStreamConstraints {
  // CRITICAL: Deep copy to prevent mutation of global AUDIO_CONSTRAINTS
  // Use explicit boolean `false` to maximize compatibility and force raw audio mode
  const baseConstraints: MediaStreamConstraints = {
    audio: {
      // HARDCORE: Explicit boolean false for all processing (not { exact: false })
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
      channelCount: AUDIO_CONSTRAINTS.audio.channelCount,
      sampleRate: AUDIO_CONSTRAINTS.audio.sampleRate,
      // Device selection (use exact for specific device targeting)
      ...(deviceId && { deviceId: { exact: deviceId } }),
    },
  };

  return baseConstraints;
}

/**
 * Fallback constraints if exact: false throws errors
 * Some browsers don't support the exact syntax
 */
export const AUDIO_CONSTRAINTS_FALLBACK = {
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    channelCount: 1,
    sampleRate: 48000, // High quality audio (matches config.json)
  },
};

/**
 * Smart Start configuration
 */
export interface SmartStartConfig {
  /** Warm-up duration in milliseconds (discard initial audio) */
  warmUpDuration: number;
  /** Signal trigger threshold (RMS level, 0-1) */
  signalThreshold: number;
  /** Maximum wait time for signal in milliseconds */
  maxWaitTime: number;
  /** Enable adaptive trigger learning (default: true) */
  adaptiveTrigger?: boolean;
  /** Learning period for adaptive trigger in milliseconds (default: 2000ms) */
  adaptiveLearningPeriod?: number;
}

/**
 * Default Smart Start configuration
 */
export const DEFAULT_SMART_START_CONFIG: SmartStartConfig = {
  // ⚠️ DO NOT CHANGE: Physical settling time for OS audio filters (AGC, noise cancellation)
  // 5 seconds warmup is REQUIRED to discard initial unstable samples.
  // This is not a timing bug - it's a deliberate delay for signal stabilization.
  warmUpDuration: 5000, // 5 seconds (extended settling time for OS audio filters)
  signalThreshold: isIOS() ? 0.002 : 0.01, // iOS gets higher sensitivity; Android/Desktop keep stable default
  maxWaitTime: 30000, // 30 seconds max wait
  adaptiveTrigger: true, // Enable adaptive trigger learning
  adaptiveLearningPeriod: 2000, // Learn from first 2 seconds of warmup
};

/**
 * Smart Start state
 *
 * CRITICAL: This interface is shared between audioHelper and audioWorkletHelper.
 * All properties except 'phase' are optional to support both implementations.
 */
export interface SmartStartState {
  phase: 'idle' | 'warmup' | 'waiting' | 'recording';
  remainingWarmUp?: number;
  signalDetected?: boolean;
}

/**
 * Get optimized audio stream with raw, unprocessed audio
 *
 * Attempts to use exact constraints first, falls back to simple booleans
 * if the browser doesn't support exact syntax.
 *
 * iOS SPECIAL HANDLING:
 * - If deviceId is IOS_REAR_MIC_DEVICE_ID, uses the Video+Audio workaround
 * - This forces iOS to use the rear microphone associated with the back camera
 *
 * @param deviceId - Optional specific device ID to use (or IOS_REAR_MIC_DEVICE_ID for iOS workaround)
 * @returns MediaStream with raw audio
 */
export async function getRawAudioStream(deviceId?: string): Promise<MediaStream> {
  try {
    // ============================================
    // iOS SPECIAL PATH: Rear Microphone Workaround
    // ============================================
    if (deviceId === HardwareCheck.IOS_REAR_MIC_DEVICE_ID) {
      logger.info('📱 getRawAudioStream: iOS rear mic workaround requested');

      const iosStream = await HardwareCheck.getiOSRearMicStream();

      if (iosStream) {
        logger.info('✅ iOS rear mic stream obtained successfully');
        return iosStream;
      }

      // Fallback to default mic if workaround fails
      logger.warn('📱 iOS rear mic workaround failed, falling back to default microphone');
      const fallbackConstraints = buildAudioConstraints(undefined);
      return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }

    // ============================================
    // STANDARD PATH: Normal device selection
    // ============================================
    if (deviceId) {
      const availableDevices = await getMicrophones();
      const deviceExists = availableDevices.some((device) => device.deviceId === deviceId);

      if (!deviceExists) {
        logger.warn(`🎤 Requested microphone "${deviceId}" not found, using default instead.`);
        deviceId = undefined;
      }
    }

    // Build constraints with optional device ID
    const constraints = buildAudioConstraints(deviceId);

    // Try exact constraints first
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    logger.warn('⚠️ Exact constraints failed, using fallback:', error);

    try {
      // CRITICAL FIX: Deep copy to prevent mutation of global AUDIO_CONSTRAINTS_FALLBACK
      // Shallow copy ({ ...AUDIO_CONSTRAINTS_FALLBACK }) would leave the nested 'audio' object as a reference
      const fallbackConstraints: MediaStreamConstraints = {
        audio: {
          ...AUDIO_CONSTRAINTS_FALLBACK.audio, // Deep copy of nested audio object
        },
      };
      return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    } catch (fallbackError) {
      logger.error('❌ Failed to get audio stream:', fallbackError);
      throw new Error(
        'Failed to access microphone. Please grant permission and ensure no other app is using it.'
      );
    }
  }
}

/**
 * Get actual hardware sample rate from MediaStream
 *
 * @param stream - MediaStream from getUserMedia
 * @returns Actual sample rate (fallback 48000)
 */
export function getRealSampleRate(stream: MediaStream): number {
  const audioTracks = stream.getAudioTracks();
  const sampleRate = audioTracks[0]?.getSettings().sampleRate;

  if (sampleRate) {
    logger.debug(`🎚️ Detected hardware sample rate: ${sampleRate}Hz`);
    return sampleRate;
  }

  logger.debug('⚠️ Hardware sample rate unavailable, falling back to 48000Hz');
  return 48000;
}

/**
 * Calculate RMS (Root Mean Square) level of audio samples
 *
 * This represents the "loudness" or "power" of the audio signal.
 * Used for signal trigger detection.
 *
 * @param samples - Audio samples
 * @returns RMS level (0-1), or 0 if samples array is empty
 */
export function calculateRMS(samples: Float32Array): number {
  // Guard against empty samples to prevent NaN
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Smart Start Manager
 *
 * Handles warm-up period and signal trigger logic.
 * Ensures identical recording conditions for Phase 2 and Phase 3.
 *
 * ADAPTIVE TRIGGER:
 * - During first 2s of warmup: Collect RMS samples
 * - Calculate median RMS (baseline noise level)
 * - Set adaptive trigger = max(baseline * 3, config.signalThreshold)
 * - This adapts to environment noise while preventing false triggers
 */
export class SmartStartManager {
  private config: SmartStartConfig;
  private state: SmartStartState;
  private warmUpStartTime: number = 0;
  private waitStartTime: number = 0;
  private onStateChange?: (state: SmartStartState) => void;
  private onRecordingStart?: () => void;
  private onTimeout?: () => void;

  // Adaptive trigger learning
  private rmsHistory: number[] = [];
  private adaptiveTriggerThreshold: number;
  private isLearningComplete: boolean = false;

  constructor(
    config: SmartStartConfig = DEFAULT_SMART_START_CONFIG,
    callbacks?: {
      onStateChange?: (state: SmartStartState) => void;
      onRecordingStart?: () => void;
      onTimeout?: () => void;
    }
  ) {
    this.config = config;
    this.state = {
      phase: 'idle',
    };
    this.adaptiveTriggerThreshold = config.signalThreshold;
    this.isLearningComplete = false;

    if (callbacks) {
      this.onStateChange = callbacks.onStateChange;
      this.onRecordingStart = callbacks.onRecordingStart;
      this.onTimeout = callbacks.onTimeout;
    }
  }

  /**
   * Start the Smart Start sequence
   */
  public start(): void {
    logger.info('🚀 Smart Start: Beginning warm-up period...');
    this.warmUpStartTime = Date.now();
    this.state = {
      phase: 'warmup',
      remainingWarmUp: this.config.warmUpDuration,
      signalDetected: false,
    };
    this.notifyStateChange();
  }

  /**
   * Process incoming audio samples
   *
   * Call this continuously with new audio data.
   *
   * @param samples - Audio samples from microphone
   * @returns true if recording should proceed, false if still waiting
   */
  public processAudio(samples: Float32Array): boolean {
    const now = Date.now();

    if (this.state.phase === 'idle') {
      return false;
    }

    // Phase 1: Warm-up period (discard audio)
    if (this.state.phase === 'warmup') {
      const elapsed = now - this.warmUpStartTime;
      this.state.remainingWarmUp = Math.max(0, this.config.warmUpDuration - elapsed);

      // Adaptive trigger learning: Collect RMS samples during learning period
      if (
        this.config.adaptiveTrigger &&
        !this.isLearningComplete &&
        elapsed <= (this.config.adaptiveLearningPeriod || 2000)
      ) {
        const rms = calculateRMS(samples);
        this.rmsHistory.push(rms);
      }

      // End of learning period: Calculate adaptive trigger
      if (
        this.config.adaptiveTrigger &&
        !this.isLearningComplete &&
        elapsed > (this.config.adaptiveLearningPeriod || 2000)
      ) {
        this.computeAdaptiveTrigger();
        this.isLearningComplete = true;
      }

      if (elapsed >= this.config.warmUpDuration) {
        logger.info('✅ Warm-up complete. Waiting for signal...');
        this.state.phase = 'waiting';
        this.waitStartTime = now;
        this.notifyStateChange();
        return false; // Phase changed, wait for next processAudio() call
      } else {
        this.notifyStateChange();
        return false; // Still warming up
      }
    }

    // Phase 2: Wait for signal trigger
    if (this.state.phase === 'waiting') {
      const waitElapsed = now - this.waitStartTime;

      // Check for timeout
      if (waitElapsed >= this.config.maxWaitTime) {
        logger.warn('⏱️ Signal timeout - no signal detected');
        this.state = { phase: 'idle' };
        this.notifyStateChange();
        if (this.onTimeout) {
          this.onTimeout();
        }
        return false;
      }

      // Check signal level (use adaptive threshold if available)
      const rms = calculateRMS(samples);
      const activeThreshold = this.adaptiveTriggerThreshold;

      if (rms >= activeThreshold) {
        logger.info(
          `🎯 Signal detected! RMS: ${rms.toFixed(4)} (threshold: ${activeThreshold.toFixed(4)}${this.config.adaptiveTrigger ? ' adaptive' : ''})`
        );
        this.state.phase = 'recording';
        this.state.signalDetected = true;
        this.notifyStateChange();

        if (this.onRecordingStart) {
          this.onRecordingStart();
        }

        return true; // Start recording!
      }

      this.notifyStateChange();
      return false; // Still waiting for signal
    }

    // Phase 3: Recording in progress
    return this.state.phase === 'recording';
  }

  /**
   * Get current state
   */
  public getState(): SmartStartState {
    return { ...this.state };
  }

  /**
   * Reset to initial state
   */
  public reset(): void {
    this.state = {
      phase: 'idle',
    };
    this.warmUpStartTime = 0;
    this.waitStartTime = 0;
    this.rmsHistory = [];
    this.adaptiveTriggerThreshold = this.config.signalThreshold;
    this.isLearningComplete = false;
  }

  /**
   * Compute adaptive trigger threshold from collected RMS samples
   *
   * Algorithm:
   * 1. Calculate median RMS (baseline noise level)
   * 2. Set trigger = max(baseline * 3, config.signalThreshold)
   * 3. This adapts to environment noise while preventing false triggers
   *
   * iOS FIX: If all RMS samples are zero (or near-zero), iOS may be muting
   * the microphone during the learning period. In this case, fall back to
   * the default signal threshold to avoid setting an impossible trigger.
   */
  private computeAdaptiveTrigger(): void {
    if (this.rmsHistory.length === 0) {
      logger.warn('⚠️ No RMS samples collected - using default threshold');
      this.adaptiveTriggerThreshold = this.config.signalThreshold;
      return;
    }

    // iOS FIX: Check if all samples are effectively zero
    // iOS sometimes mutes/filters audio during the first few seconds,
    // resulting in all-zero RMS values. If median is below noise floor,
    // use the default threshold instead of an impossible adaptive one.
    const NOISE_FLOOR = 0.0001; // Below this is considered "silence"

    // Sort RMS values to find median
    const sorted = [...this.rmsHistory].sort((a, b) => a - b);
    const medianIndex = Math.floor(sorted.length / 2);
    const medianRMS = sorted.length % 2 === 0
      ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
      : sorted[medianIndex];

    // iOS FIX: If median is below noise floor, iOS likely muted the mic
    // Use default threshold to prevent impossible signal detection
    if (medianRMS < NOISE_FLOOR) {
      logger.warn(
        `⚠️ iOS Audio Filter Detected: Median RMS ${medianRMS.toFixed(6)} is below noise floor. ` +
        `Using default threshold ${this.config.signalThreshold.toFixed(4)} instead of impossible adaptive trigger.`
      );
      this.adaptiveTriggerThreshold = this.config.signalThreshold;
      return;
    }

    // Count how many samples are non-zero
    const nonZeroSamples = this.rmsHistory.filter(rms => rms > NOISE_FLOOR);
    const nonZeroRatio = nonZeroSamples.length / this.rmsHistory.length;

    // iOS FIX: If less than 30% of samples have signal, iOS may be applying
    // aggressive noise suppression. Log warning and use default threshold.
    if (nonZeroRatio < 0.3) {
      logger.warn(
        `⚠️ iOS Audio Filter Detected: Only ${(nonZeroRatio * 100).toFixed(0)}% of samples have signal. ` +
        `Using default threshold ${this.config.signalThreshold.toFixed(4)}.`
      );
      this.adaptiveTriggerThreshold = this.config.signalThreshold;
      return;
    }

    // Set trigger = baseline * 3, but not lower than config threshold
    // Factor 3 ensures we detect signal above noise while avoiding false triggers
    const adaptiveThreshold = Math.max(medianRMS * 3, this.config.signalThreshold);

    this.adaptiveTriggerThreshold = adaptiveThreshold;

    logger.info(
      `📊 Adaptive trigger computed: ${adaptiveThreshold.toFixed(4)} ` +
      `(baseline: ${medianRMS.toFixed(4)}, samples: ${this.rmsHistory.length}, nonZero: ${(nonZeroRatio * 100).toFixed(0)}%)`
    );
  }

  /**
   * Notify state change to callback
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Skip warm-up and signal trigger (for manual start)
   */
  public skipToRecording(): void {
    logger.info('⏭️ Skipping to recording phase');
    this.state = {
      phase: 'recording',
      remainingWarmUp: 0,
      signalDetected: true,
    };
    this.notifyStateChange();

    if (this.onRecordingStart) {
      this.onRecordingStart();
    }
  }
}

/**
 * Get user-friendly status message for UI
 */
export function getSmartStartStatusMessage(state: SmartStartState): string {
  switch (state.phase) {
    case 'idle':
      return t('audio.ready');
    case 'warmup': {
      // CRITICAL FIX: Handle optional remainingWarmUp field
      const seconds = state.remainingWarmUp ? Math.ceil(state.remainingWarmUp / 1000) : 0;
      return t('audio.stabilizing', { seconds });
    }
    case 'waiting':
      return t('audio.waitingForSignal');
    case 'recording':
      return t('audio.recordingRunning');
    default:
      return t('audio.ready');
  }
}
