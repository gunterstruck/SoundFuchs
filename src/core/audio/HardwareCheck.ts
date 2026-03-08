/**
 * ZANOBOT - AUDIO HARDWARE INTELLIGENCE
 *
 * Detects problematic microphones (Jabra, Headsets, Bluetooth)
 * that might filter out machine sounds and cause poor training quality.
 *
 * Features:
 * - Hardware label analysis (keyword detection)
 * - Sample rate validation
 * - Real-time device enumeration
 */

import { logger } from '@utils/logger.js';
import { isIOS } from '@utils/platform.js';
import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';

/**
 * Audio Quality Report
 * Represents the assessment of current audio hardware
 */
export interface AudioQualityReport {
  status: 'good' | 'warning';
  reason: string;
  deviceLabel: string;
  sampleRate: number;
  recommendations?: string[];
}

/**
 * Device Info for selection UI
 */
export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId: string;
}

/**
 * HardwareCheck - Audio Hardware Intelligence
 *
 * Analyzes microphone quality and provides recommendations.
 */
export class HardwareCheck {
  // Known problematic keywords in device labels
  private static readonly PROBLEMATIC_KEYWORDS = [
    'jabra',
    'plantronics',
    'sennheiser',
    'hands-free',
    'handsfree',
    'headset',
    'airpods',
    'bluetooth',
    'bt audio',
    'wireless',
  ];

  // Minimum recommended sample rate (44.1 kHz)
  private static readonly MIN_SAMPLE_RATE = 44100;

  /**
   * Priority-ordered keywords for identifying rear/environment microphones
   * These mics are optimized for room recording (far-field) rather than voice (near-field)
   *
   * Priority:
   * 1. back/rück/rear - iOS typical rear mic naming
   * 2. environment - Professional/industrial hardware
   * 3. camcorder/video - Android camera mic (optimized for video recording)
   * 4. camera - Generic camera-associated mic
   */
  private static readonly PREFERRED_MIC_KEYWORDS = [
    // Priority 1: iOS rear microphone (highest priority)
    'back',
    'rück',
    'rear',
    // Priority 2: Professional/industrial hardware
    'environment',
    // Priority 3: Android video/camcorder microphone
    'camcorder',
    'video',
    // Priority 4: Generic camera microphone (lowest priority in preferred list)
    'camera',
  ];

  /**
   * Analyze current audio device
   *
   * @param label - Device label from MediaDeviceInfo or getUserMedia
   * @param sampleRate - Sample rate in Hz
   * @returns Audio quality report with status and recommendations
   */
  public static analyzeCurrentDevice(label: string, sampleRate: number): AudioQualityReport {
    const report: AudioQualityReport = {
      status: 'good',
      reason: t('hardware.suitable'),
      deviceLabel: label,
      sampleRate,
      recommendations: [],
    };

    // Check 1: Device label for problematic keywords
    const lowerLabel = label.toLowerCase();
    const foundKeyword = this.PROBLEMATIC_KEYWORDS.find((keyword) => lowerLabel.includes(keyword));

    if (foundKeyword) {
      report.status = 'warning';
      report.reason = t('hardware.voiceOptimized');
      report.recommendations = [
        t('hardware.useStudioMic'),
        t('hardware.headsetsOptimized'),
        t('hardware.mayFilter'),
      ];

      logger.warn(
        `⚠️ Problematic audio hardware detected: "${label}" (keyword: "${foundKeyword}")`
      );
      return report;
    }

    // Check 2: Sample rate validation
    if (sampleRate < this.MIN_SAMPLE_RATE) {
      report.status = 'warning';
      report.reason = t('hardware.sampleRateLow', { sampleRate });
      report.recommendations = [
        t('hardware.currentSampleRate', { sampleRate }),
        t('hardware.recommendedSampleRate', { minRate: this.MIN_SAMPLE_RATE }),
        t('hardware.lowSampleRate'),
      ];

      logger.warn(
        `⚠️ Low sample rate detected: ${sampleRate} Hz (recommended: ${this.MIN_SAMPLE_RATE} Hz)`
      );
      return report;
    }

    // All checks passed
    logger.info(`✅ Audio hardware check passed: "${label}" @ ${sampleRate} Hz`);
    return report;
  }

  /**
   * Get all available audio input devices
   *
   * CRITICAL FIX: Uses finally block to ensure stream is always released,
   * even if an error occurs after getUserMedia but before stop().
   * This prevents microphone from being locked, which would block phone calls.
   *
   * @returns List of audio input devices
   */
  public static async getAvailableDevices(): Promise<AudioDeviceInfo[]> {
    let stream: MediaStream | null = null;

    try {
      // Request permissions first (required for device labels)
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || t('hardware.microphoneId', { id: device.deviceId.substring(0, 8) }),
          kind: device.kind,
          groupId: device.groupId,
        }));

      logger.info(`Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      logger.error('Failed to enumerate audio devices:', error);
      throw new Error(t('hardware.microphoneDenied'));
    } finally {
      // CRITICAL: Always release the microphone stream, even on error
      // This ensures phone calls can still work if this method fails
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        logger.debug('🎤 Permission stream released in getAvailableDevices()');
      }
    }
  }

  /**
   * Get current active audio device info
   *
   * Requires an active MediaStream to determine the current device.
   *
   * @param stream - Active MediaStream
   * @returns Device info or null if not determinable
   */
  public static async getCurrentDevice(stream: MediaStream): Promise<AudioDeviceInfo | null> {
    try {
      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) {
        logger.warn('No audio tracks in stream');
        return null;
      }

      const settings = tracks[0].getSettings();
      const deviceId = settings.deviceId;

      if (!deviceId) {
        logger.warn('No deviceId in track settings');
        return null;
      }

      const devices = await this.getAvailableDevices();
      const currentDevice = devices.find((device) => device.deviceId === deviceId);

      return currentDevice || null;
    } catch (error) {
      logger.error('Failed to get current device:', error);
      return null;
    }
  }

  /**
   * Check if device label suggests it's a built-in microphone
   *
   * Built-in mics are usually good for machine diagnosis.
   *
   * @param label - Device label
   * @returns True if likely built-in
   */
  public static isLikelyBuiltIn(label: string): boolean {
    const lowerLabel = label.toLowerCase();
    const builtInKeywords = [
      'built-in',
      'internal',
      'integriert',
      'eingebaut',
      'default',
      'array',
      'macbook',
      'imac',
    ];

    return builtInKeywords.some((keyword) => lowerLabel.includes(keyword));
  }

  /**
   * Special deviceId marker for iOS rear microphone workaround
   * When this deviceId is passed to getRawAudioStream(), it triggers the Video+Audio workaround
   */
  public static readonly IOS_REAR_MIC_DEVICE_ID = '__ios_rear_mic__';

  /**
   * Cached result of iOS rear mic availability check.
   * Prevents duplicate getUserMedia calls (camera+mic) within the same session.
   * null = not yet checked, true = available, false = not available
   */
  private static iosRearMicAvailable: boolean | null = null;

  /**
   * iOS-specific: Get rear microphone stream via Video+Audio workaround
   *
   * CRITICAL iOS LIMITATION:
   * - iOS Safari does NOT expose separate microphones via enumerateDevices()
   * - It only shows "iPhone Microphone" or "Internal Microphone"
   * - The ONLY way to access the rear microphone on iOS is through the camera API
   *
   * This method requests a video+audio stream with facingMode: "environment" (back camera),
   * which forces iOS to use the rear microphone associated with the back camera.
   * The video tracks are immediately stopped (we only need audio).
   *
   * CRITICAL FIX: Uses try-finally pattern to ensure all tracks are stopped on error,
   * preventing microphone/camera from being locked (which would block phone calls).
   *
   * @returns MediaStream with rear microphone audio, or null if not available
   */
  public static async getiOSRearMicStream(): Promise<MediaStream | null> {
    if (!isIOS()) {
      logger.debug('📱 getiOSRearMicStream: Not iOS, skipping');
      return null;
    }

    let stream: MediaStream | null = null;

    try {
      logger.info('📱 iOS detected: Attempting rear microphone via camera workaround...');

      // Explain to user why camera permission is needed before the system dialog appears
      notify.info(t('hardware.iosMicHint'), { duration: 3000 });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Request video+audio with back camera (facingMode: "environment")
      // This forces iOS to use the rear microphone associated with the back camera
      //
      // iOS CONSTRAINT FIX:
      // - iOS Safari does NOT support { exact: 'environment' } syntax - throws "Invalid constraint"
      // - iOS Safari requires minimum resolution constraints (1x1 is rejected)
      // - Use simple string 'environment' and realistic minimum resolution
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Simple string - iOS compatible
          width: { ideal: 640 }, // Minimal but valid resolution for iOS
          height: { ideal: 480 },
        },
        audio: {
          // CRITICAL: Disable all audio processing for raw machine sounds
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      // Extract audio tracks
      const audioTracks = stream.getAudioTracks();

      if (audioTracks.length === 0) {
        logger.warn('📱 iOS rear mic workaround: No audio tracks received');
        // Stream will be cleaned up in finally block
        return null;
      }

      // IMPORTANT: Stop video tracks immediately (we only need audio)
      // This releases the camera resource
      stream.getVideoTracks().forEach((track) => {
        logger.debug(`📱 Stopping video track: ${track.label}`);
        track.stop();
      });

      // Create audio-only stream
      const audioOnlyStream = new MediaStream(audioTracks);

      logger.info(
        `✅ iOS rear mic workaround successful: "${audioTracks[0].label}" (via back camera)`
      );

      // Mark stream as successfully transferred to audioOnlyStream
      // Set to null so finally block doesn't stop the audio tracks we want to return
      stream = null;

      return audioOnlyStream;
    } catch (error) {
      // Expected errors:
      // - NotAllowedError: User denied camera permission
      // - OverconstrainedError: Device has no back camera (e.g., iPad mini)
      // - NotFoundError: No camera available

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (errorName === 'NotAllowedError') {
        logger.info('📱 iOS rear mic: Camera permission denied, falling back to default mic');
      } else if (errorName === 'OverconstrainedError') {
        logger.info('📱 iOS rear mic: No back camera available, falling back to default mic');
      } else {
        logger.warn(`📱 iOS rear mic workaround failed: ${errorName} - ${errorMessage}`);
      }

      return null;
    } finally {
      // CRITICAL FIX: Always release the stream on failure or early return
      // This ensures microphone/camera are released for phone calls
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        logger.debug('📱 iOS rear mic stream released in finally block');
      }
    }
  }

  /**
   * Find the best microphone for machine diagnosis (Smart Microphone Auto-Selection)
   *
   * This method searches for rear/environment microphones that are optimized for
   * room recording (far-field) rather than voice calls (near-field).
   *
   * Rationale:
   * - Default smartphone mics (bottom/front) are optimized for telephony
   * - They apply aggressive noise suppression that filters out machine sounds
   * - Rear/camera mics are optimized for video recording (unfiltered room audio)
   *
   * iOS SPECIAL HANDLING:
   * - iOS does not expose separate microphones via enumerateDevices()
   * - We use the Video+Audio workaround with facingMode: "environment"
   * - Returns a special deviceId (__ios_rear_mic__) that triggers the workaround
   *
   * @returns Promise<{ deviceId: string; label: string } | undefined>
   *          Returns device info if a preferred mic is found, undefined otherwise
   */
  public static async findBestMicrophone(): Promise<{ deviceId: string; label: string } | undefined> {
    try {
      // ============================================
      // iOS SPECIAL PATH: Video+Audio Workaround
      // ============================================
      if (isIOS()) {
        logger.info('📱 findBestMicrophone: iOS detected, attempting rear mic workaround...');

        // Use cached result if available to avoid duplicate camera+mic prompts
        if (this.iosRearMicAvailable === true) {
          logger.info('📱 findBestMicrophone: Using cached iOS rear mic availability (available)');
          return {
            deviceId: this.IOS_REAR_MIC_DEVICE_ID,
            label: t('hardware.optimizedForDiagnosis', { label: t('hardware.iphoneBackMic') }),
          };
        }
        if (this.iosRearMicAvailable === false) {
          logger.info('📱 findBestMicrophone: Using cached iOS rear mic availability (not available)');
          return undefined;
        }

        // Try to get rear microphone via camera API
        const iosStream = await this.getiOSRearMicStream();

        if (iosStream) {
          // Success! Stop the stream (we'll get a new one when needed)
          const label = iosStream.getAudioTracks()[0]?.label || t('hardware.iphoneBackMic');
          iosStream.getTracks().forEach((track) => track.stop());

          logger.info(`✅ iOS: Rear microphone available: "${label}"`);
          this.iosRearMicAvailable = true;

          // Return special marker deviceId - getRawAudioStream() will handle this
          return {
            deviceId: this.IOS_REAR_MIC_DEVICE_ID,
            label: t('hardware.optimizedForDiagnosis', { label }),
          };
        }

        // Fallback: iOS rear mic not available, use default
        logger.info('📱 iOS: Rear mic not available, using default microphone');
        this.iosRearMicAvailable = false;
        return undefined;
      }

      // ============================================
      // STANDARD PATH: Keyword-based device search
      // ============================================
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === 'audioinput');

      // Check if we have labels (requires permission)
      const hasLabels = audioInputs.some((device) => device.label && device.label.length > 0);

      if (!hasLabels) {
        logger.warn('🎤 findBestMicrophone: No device labels available (permission may be required)');
        return undefined;
      }

      logger.info(`🎤 findBestMicrophone: Scanning ${audioInputs.length} audio inputs...`);

      // Search by priority - first keyword match wins
      for (const keyword of this.PREFERRED_MIC_KEYWORDS) {
        for (const device of audioInputs) {
          const lowerLabel = device.label.toLowerCase();

          if (lowerLabel.includes(keyword)) {
            logger.info(
              `✅ findBestMicrophone: Found preferred mic "${device.label}" (keyword: "${keyword}")`
            );
            return {
              deviceId: device.deviceId,
              label: device.label,
            };
          }
        }
      }

      // No preferred microphone found - fallback to default
      logger.info('🎤 findBestMicrophone: No preferred mic found, using system default');
      return undefined;
    } catch (error) {
      logger.error('❌ findBestMicrophone: Failed to enumerate devices:', error);
      return undefined;
    }
  }
}
