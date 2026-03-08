/**
 * ZANOBOT - PHASE 2: REFERENCE
 *
 * Training mode - Record healthy machine state.
 * Steps:
 * 1. Record audio (default 10s)
 * 2. Extract features
 * 3. Train GMIA model
 * 4. Save model to machine
 */

import { extractFeatures, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { trainGMIA } from '@core/ml/gmia.js';
import { assessRecordingQuality } from '@core/ml/qualityCheck.js';
import { AudioVisualizer } from '@ui/components/AudioVisualizer.js';
import { getRawAudioStream, getSmartStartStatusMessage } from '@core/audio/audioHelper.js';
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';
import { notify } from '@utils/notifications.js';
import type { Machine, TrainingData, FeatureVector, QualityResult } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { BUTTON_TEXT } from '@ui/constants.js';
import { stopMediaStream, closeAudioContext } from '@utils/streamHelper.js';
import { classifyDiagnosticState } from '@core/ml/scoring.js';
import { t, getLocale } from '../../i18n/index.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import {
  applyRoomCompensation,
  getRoomCompSettings,
  playChirpAndRecord,
  estimateT60FromChirp,
  classifyT60Value,
} from '@core/dsp/roomCompensation.js';
import type { T60Estimate } from '@core/dsp/roomCompensation.js';
import { getCherryPickSettings, cherryPickFeatures } from '@core/dsp/cherryPicking.js';
import { PipelineStatusDashboard } from '@ui/components/PipelineStatus.js';
import { getViewLevel } from '@utils/viewLevelSettings.js';
import {
  getDriftSettings,
  computeRefLogResidualStd,
  calibrateAdaptiveThresholds,
  type RefDriftBaseline,
} from '@core/dsp/driftDetector.js';

export class ReferencePhase {
  private machine: Machine | null;
  private selectedDeviceId: string | undefined; // Selected microphone device ID
  private onMachineUpdated: ((machine: Machine) => void) | null = null; // Callback when machine is updated
  private wasAutoCreated: boolean = false; // Track if machine was auto-created for zero-friction flow
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null; // VISUAL POSITIONING: Camera stream for reference image
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private visualizer: AudioVisualizer | null = null;
  private recordingDuration: number; // seconds (net recording time for training data, excluding warmup)
  private warmUpDuration: number = 5; // seconds (settling time for OS audio filters)
  private audioWorkletManager: AudioWorkletManager | null = null;
  private isRecordingActive: boolean = false;
  private recordedBlob: Blob | null = null; // For reference audio export
  private useAudioWorklet: boolean = true;
  private recordingStartTime: number = 0; // Track when actual recording started
  private timerInterval: ReturnType<typeof setInterval> | null = null; // Track timer interval for cleanup
  private isRecordingStarting: boolean = false;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private smartStartWasUsed: boolean = false; // Track if Smart Start completed successfully

  // Room Compensation: T60 estimate from chirp measurement
  private currentT60: T60Estimate | null = null;

  // Phase 2: Review Modal State
  private currentAudioBuffer: AudioBuffer | null = null;
  private currentFeatures: FeatureVector[] = [];
  private currentQualityResult: QualityResult | null = null;
  private currentTrainingData: TrainingData | null = null;

  // CRITICAL FIX: Store event listener reference for proper cleanup
  private recordButtonClickHandler: (() => void) | null = null;

  // VISUAL POSITIONING: Reference image captured during recording
  private capturedReferenceImage: Blob | null = null;
  private reviewImageUrl: string | null = null;

  // Pipeline Status Dashboard (Expert mode, shows batch DSP results in review modal)
  private pipelineStatus: PipelineStatusDashboard | null = null;

  // Reference environment data (for Session Bias Match + T60 environment comparison)
  private currentRefLogMean: number[] | null = null;
  private currentRefLogStd: number[] | null = null;
  private currentRefLogResidualStd: number[] | null = null;
  private currentRefDriftBaseline: RefDriftBaseline | null = null;
  private currentRefT60: number | null = null;
  private currentRefT60Classification: string | null = null;

  constructor(machine?: Machine | null, selectedDeviceId?: string) {
    this.machine = machine || null;
    this.selectedDeviceId = selectedDeviceId;

    // Load recording duration from settings (net recording time without warmup)
    const settings = getRecordingSettings();
    this.recordingDuration = settings.recordingDuration;

    // DEBUG LOGGING: Show which machine is being used for reference recording
    if (machine) {
      logger.debug('📝 ReferencePhase Constructor:', {
        machineId: machine.id,
        machineName: machine.name,
        numExistingModels: machine.referenceModels?.length || 0,
      });
    } else {
      logger.debug('📝 ReferencePhase Constructor: No machine selected (zero-friction mode)');
    }
  }

  /**
   * Set the machine for this phase (used when machine is selected after init)
   */
  public setMachine(machine: Machine): void {
    this.machine = machine;
    this.wasAutoCreated = false;
    logger.debug('📝 ReferencePhase: Machine set:', {
      machineId: machine.id,
      machineName: machine.name,
    });

  }

  /**
   * Set callback to be notified when machine is updated (new model saved)
   */
  public setOnMachineUpdated(callback: (machine: Machine) => void): void {
    this.onMachineUpdated = callback;
  }

  /**
   * Initialize the reference phase UI
   */
  public init(): void {
    this.applyAppShellLayout();

    // Store handler reference to enable cleanup in destroy()
    this.recordButtonClickHandler = () => this.startRecording();

    // Original record button (State A - machine selected)
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) {
      recordBtn.addEventListener('click', this.recordButtonClickHandler);
    }

    // ZERO-FRICTION: New record button (State B - no machine, auto-create)
    const zeroFrictionRecordBtn = document.getElementById('record-reference-btn');
    if (zeroFrictionRecordBtn) {
      zeroFrictionRecordBtn.addEventListener('click', this.recordButtonClickHandler);
      logger.debug('📝 Zero-friction record button initialized');
    }

  }

  /**
   * Start recording reference audio with Smart Start
   */
  private async startRecording(): Promise<void> {
    if (this.isRecordingStarting || this.isRecordingActive || this.mediaStream) {
      notify.warning(t('reference.recording.alreadyRunning'));
      return;
    }

    // ZERO-FRICTION: Show info toast if no machine is selected
    if (!this.machine) {
      notify.info(t('zeroFriction.noMachineSelected'));
    }

    this.isRecordingStarting = true;

    // CRITICAL FIX: Reload recording duration from settings at recording start time
    // Previously this was only loaded in the constructor, so settings changes were ignored
    // until the phase was re-created (e.g., by restarting the PWA)
    const currentSettings = getRecordingSettings();
    this.recordingDuration = currentSettings.recordingDuration;

    try {
      logger.info('🎙️ Phase 2: Starting reference recording with Smart Start...');

      // Check AudioWorklet support
      this.useAudioWorklet = isAudioWorkletSupported();
      if (!this.useAudioWorklet) {
        logger.warn('⚠️ AudioWorklet not supported, Smart Start disabled');
      }

      // Request microphone access using central helper with selected device
      this.mediaStream = await getRawAudioStream(this.selectedDeviceId);

      // VISUAL POSITIONING: Only request camera if Room Compensation is active
      // Reference phase needs camera to capture the reference image for later ghost overlay
      const roomCompSettings = getRoomCompSettings();

      if (roomCompSettings.enabled) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, // Prefer back camera on mobile
            audio: false,
          });
          logger.info('📷 Camera access granted for reference image');
        } catch (cameraError) {
          logger.warn(
            '⚠️ Camera access denied – continuing without reference image',
            cameraError
          );
          notify.info(t('reference.recording.cameraNotAvailable'), {
            title: t('modals.cameraOptional'),
          });
          this.cameraStream = null;
        }
      } else {
        logger.debug('📷 Camera not requested (Room Comp. inactive)');
        this.cameraStream = null;
      }

      // Drift Detector: Show info hint if change analysis is active
      const driftSettings = getDriftSettings();
      if (driftSettings.enabled) {
        notify.info(t('drift.referenceHint'));
      }

      if (typeof MediaRecorder === 'undefined') {
        notify.error(
          t('reference.recording.browserNotCompatible'),
          new Error('MediaRecorder not supported'),
          { title: t('modals.browserIncompatible'), duration: 0 }
        );
        this.cleanup();
        return;
      }

      // Create audio context
      // CRITICAL FIX: Use 48000 Hz to match AUDIO_CONSTRAINTS.sampleRate
      // This prevents unnecessary browser resampling (48k hardware → 44.1k context)
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // CRITICAL FIX: Validate sample rate and adapt DSP config to actual rate
      // This ensures training and diagnosis use consistent feature extraction parameters
      const actualSampleRate = this.audioContext.sampleRate;
      if (actualSampleRate !== 48000) {
        logger.warn(
          `⚠️ AudioContext sample rate is ${actualSampleRate}Hz instead of requested 48000Hz`
        );
        logger.info(`✅ Feature extraction will use actual sample rate: ${actualSampleRate}Hz`);
      }

      // Room Compensation: Chirp measurement (automatic, before recording starts)
      // Plays a short ~60ms tone through the speaker and records the room response.
      // Must happen BEFORE Smart Start so the chirp doesn't interfere with the machine recording.
      this.currentT60 = null;
      const roomSettings = getRoomCompSettings();
      if (roomSettings.enabled && roomSettings.t60Enabled && this.audioContext && this.mediaStream) {
        try {
          logger.info('🔊 Chirp calibration: Automatic room measurement...');
          const { chirp, recorded } = await playChirpAndRecord(this.audioContext, this.mediaStream);
          this.currentT60 = estimateT60FromChirp(chirp, recorded, this.audioContext.sampleRate);
          if (this.currentT60) {
            logger.info(`🔊 Room T60: ${this.currentT60.broadband.toFixed(2)}s`);
          } else {
            logger.warn('⚠️ Chirp: No clear peak – falling back to CMN only');
          }
        } catch (e) {
          logger.warn('⚠️ Chirp measurement failed:', e);
          this.currentT60 = null;
        }
      }

      // Show recording modal
      this.showRecordingModal();

      // Start visualizer
      const canvas = document.getElementById('waveform-canvas');
      if (canvas) {
        this.visualizer = new AudioVisualizer('waveform-canvas');
        this.visualizer.start(this.audioContext, this.mediaStream);
      }

      // FORCE START: Check if audio trigger should be disabled
      const recordingSettings = getRecordingSettings();
      const skipSmartStart = recordingSettings.disableAudioTrigger;

      if (this.useAudioWorklet) {
        // CRITICAL FIX: Calculate proper buffer size based on actual sample rate
        // At 96kHz: chunkSize = 31680, so we need bufferSize >= 63360
        const chunkSize = Math.floor(0.33 * actualSampleRate);
        const bufferSize = Math.max(32768, chunkSize * 2);

        // Initialize AudioWorklet Manager (always needed for audio processing)
        this.audioWorkletManager = new AudioWorkletManager({
          bufferSize: bufferSize,
          warmUpDuration: this.warmUpDuration * 1000, // Convert seconds to milliseconds
          onSmartStartStateChange: (state) => {
            const statusMsg = getSmartStartStatusMessage(state);
            this.updateStatusMessage(statusMsg);
          },
          onSmartStartComplete: (rms) => {
            logger.info(`✅ Smart Start: Signal detected! RMS: ${rms.toFixed(4)}`);
            this.smartStartWasUsed = true; // Mark that Smart Start completed successfully

            // Sprint 2 UX: Visual ready moment (flash green + haptic)
            const statusElement = document.getElementById('recording-status')
              || document.querySelector('.recording-status');
            if (statusElement) {
              statusElement.classList.add('smart-start-ready');
              statusElement.textContent = t('smartStartReady.signalDetected');
              setTimeout(() => {
                statusElement.classList.remove('smart-start-ready');
              }, 1500);
            }
            if (navigator.vibrate) {
              navigator.vibrate([50, 30, 50]);
            }

            this.updateStatusMessage(t('reference.recording.recording'));
            this.actuallyStartRecording();
          },
          onSmartStartTimeout: () => {
            logger.warn('⏱️ Smart Start timeout - cleaning up resources');
            this.smartStartWasUsed = false; // Ensure flag is false since Smart Start failed
            notify.warning(t('reference.recording.noSignal'), {
              title: t('modals.noSignalDetected'),
            });
            // CRITICAL FIX: Call cleanup() to properly release all resources
            // (AudioWorklet, MediaStream, Modal, Timer, etc.)
            this.cleanup();
            this.hideRecordingModal();
          },
        });

        // Initialize AudioWorklet
        await this.audioWorkletManager.init(this.audioContext, this.mediaStream);

        // Start Smart Start sequence (always needed for audio processing)
        this.audioWorkletManager.startSmartStart();

        if (skipSmartStart) {
          // FORCE START: Skip signal detection after warmup, start immediately
          logger.info('⚡ Force Start: Audio trigger disabled, will start after warmup');

          // Wait for warmup duration, then skip to recording
          setTimeout(() => {
            if (!this.audioWorkletManager) {
              logger.error('AudioWorkletManager not initialized');
              return;
            }
            logger.info('⚡ Force Start: Warmup complete, starting recording immediately');
            this.updateStatusMessage(t('reference.recording.recording'));
            this.audioWorkletManager.skipToRecording();
            this.smartStartWasUsed = true; // CRITICAL FIX: Warmup was completed, prevent duplicate stabilization in timer
            this.actuallyStartRecording();
          }, this.warmUpDuration * 1000);
        }
      } else {
        // Fallback: Start recording immediately without Smart Start
        logger.info('⏭️ Skipping Smart Start (AudioWorklet not supported)');
        this.updateStatusMessage(t('reference.recording.recording'));
        setTimeout(() => this.actuallyStartRecording(), 500);
      }
    } catch (error) {
      logger.error('Recording error:', error);
      notify.error(t('reference.recording.microphoneFailed'), error as Error, {
        title: t('modals.accessDenied'),
        duration: 0,
      });

      // Cleanup on error
      this.cleanup();
      this.hideRecordingModal();
    }
  }

  /**
   * Cleanup resources (AudioContext, MediaStream, etc.)
   */
  private cleanup(): void {
    // Reset state flags to prevent memory leaks
    this.isRecordingActive = false;
    this.isRecordingStarting = false;
    this.currentT60 = null;
    this.smartStartWasUsed = false; // Reset Smart Start flag for next recording

    // Clear timer interval to prevent memory leaks
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    // Stop media recorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    // Stop visualizer
    if (this.visualizer) {
      this.visualizer.stop();
    }

    // Cleanup AudioWorklet
    if (this.audioWorkletManager) {
      this.audioWorkletManager.cleanup();
      this.audioWorkletManager = null;
    }

    // Stop media stream tracks
    stopMediaStream(this.mediaStream);
    this.mediaStream = null;

    // VISUAL POSITIONING: Stop camera stream
    stopMediaStream(this.cameraStream);
    this.cameraStream = null;

    // Close audio context with error handling to prevent leaks
    closeAudioContext(this.audioContext);
    this.audioContext = null;

    logger.debug('🧹 Reference phase cleanup complete');
  }

  /**
   * Actually start recording after Smart Start completes
   *
   * Important: We record for warmup + user-configured duration (total) for debugging,
   * but only use the audio after warmup period (user-configured duration) for training.
   */
  private actuallyStartRecording(): void {
    if (!this.mediaStream) {
      return;
    }

    // Stop AudioWorklet Smart Start
    if (this.audioWorkletManager) {
      this.audioWorkletManager.stop();
    }

    // Setup media recorder with explicit mimeType
    // CRITICAL FIX: Detect supported MIME type to ensure Blob matches actual format
    let mimeType: string | undefined;
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      mimeType = 'audio/ogg;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }
    logger.info(`🎙️ Using MediaRecorder MIME type: ${mimeType ?? 'browser default'}`);

    this.audioChunks = [];
    const mediaRecorderOptions = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = mediaRecorderOptions
      ? new MediaRecorder(this.mediaStream, mediaRecorderOptions)
      : new MediaRecorder(this.mediaStream);
    this.isRecordingActive = true;
    this.isRecordingStarting = false;

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.processRecording().catch((error) => {
        logger.error('Unhandled error in processRecording:', error);
        notify.error(t('reference.recording.processingFailed'), error as Error, {
          title: t('modals.processingError'),
          duration: 0,
        });
        this.cleanup();
        this.hideRecordingModal();
      });
    };

    // Set up onstart handler to ensure precise timing
    this.mediaRecorder.onstart = () => {
      // Record actual start time when recording actually begins
      this.recordingStartTime = Date.now();

      // Update timer (shows dual-phase UI)
      this.startTimer();

      // Auto-stop after full duration (warmup + recording)
      // Smart Start: recordingDuration only (warmup already handled)
      // Manual Start: warmUpDuration + recordingDuration
      const totalDuration = this.smartStartWasUsed
        ? this.recordingDuration
        : this.warmUpDuration + this.recordingDuration;

      this.autoStopTimer = setTimeout(() => {
        this.stopRecording();
      }, totalDuration * 1000);

      // VISUAL POSITIONING: Capture reference image at midpoint of recording
      // Calculate snapshot time: halfway through the actual recording (after warmup)
      const warmupPhase = this.smartStartWasUsed ? 0 : this.warmUpDuration;
      const snapshotDelay = warmupPhase * 1000 + (this.recordingDuration * 1000) / 2;

      setTimeout(() => {
        this.captureReferenceSnapshot();
      }, snapshotDelay);
    };

    // Start recording (will trigger onstart event)
    this.mediaRecorder.start();
  }

  /**
   * VISUAL POSITIONING: Capture reference snapshot from camera stream
   *
   * Creates a snapshot of the current video frame and stores it as Blob.
   * This image will be saved to the machine for later use in diagnosis.
   */
  private captureReferenceSnapshot(): void {
    // Check if camera stream is available
    if (!this.cameraStream) {
      logger.info('📷 No camera stream available - skipping reference snapshot');
      return;
    }

    try {
      // Get video element
      const video = document.getElementById('reference-video') as HTMLVideoElement | null;
      if (!video || video.videoWidth === 0) {
        logger.warn('⚠️ Video element not ready - skipping snapshot');
        return;
      }

      // Create canvas for snapshot
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        logger.error('❌ Failed to get canvas context');
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            this.capturedReferenceImage = blob;
            logger.info(
              `📸 Reference snapshot captured: ${blob.size} bytes (${canvas.width}x${canvas.height})`
            );

            // Visual feedback: Flash border on video
            const videoContainer = document.getElementById('reference-video-container');
            if (videoContainer) {
              videoContainer.style.borderColor = 'var(--status-healthy)';
              setTimeout(() => {
                videoContainer.style.borderColor = 'var(--primary-color)';
              }, 300);
            }
          } else {
            logger.error('❌ Failed to create blob from canvas');
          }
        },
        'image/jpeg',
        0.8 // 80% quality for reasonable file size
      );
    } catch (error) {
      logger.error('Snapshot capture error:', error);
    }
  }

  /**
   * Stop recording
   *
   * IMPORTANT: Only stops the MediaRecorder here. Cleanup is called later
   * in processRecording() after the audio has been decoded and processed.
   * This prevents closing the AudioContext before processRecording() needs it.
   */
  private stopRecording(): void {
    // Stop media recorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop(); // This triggers onstop -> processRecording()
      return;
    }

    // Handle Smart Start / waiting phase where MediaRecorder is inactive
    if (this.audioWorkletManager || this.isRecordingActive || this.isRecordingStarting) {
      if (this.audioWorkletManager) {
        this.audioWorkletManager.cleanup();
      }
      this.cleanup();
      this.hideRecordingModal();
    }
  }

  /**
   * Process recorded audio and show review modal
   *
   * PHASE 2 WORKFLOW:
   * 1. Extract features from post-warmup audio (after warmup period)
   * 2. Assess recording quality
   * 3. Show review modal with audio player and quality assessment
   * 4. Wait for user decision (Save or Discard)
   *
   * CRITICAL IMPLEMENTATION:
   * - File blob: Full 15 seconds (for playback and debugging)
   * - Feature extraction: Only seconds 5-15 (after OS audio filters have settled)
   * - Cleanup is called at the end to release AudioContext after processing
   */
  private async processRecording(): Promise<void> {
    try {
      if (!this.audioContext) {
        throw new Error('Audio context not initialized');
      }

      // Create blob from chunks (FULL 15 seconds for download)
      // CRITICAL FIX: Use actual MIME type from MediaRecorder to ensure correct format
      const mimeType = this.mediaRecorder?.mimeType || '';
      const blobOptions = mimeType ? { type: mimeType } : undefined;
      const blob = blobOptions
        ? new Blob(this.audioChunks, blobOptions)
        : new Blob(this.audioChunks);
      this.recordedBlob = blob; // Save for export
      logger.info(`📦 Created audio blob with MIME type: ${mimeType}`);

      // Convert to AudioBuffer
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      logger.info(`🎙️ Recording complete: ${audioBuffer.duration.toFixed(2)}s`);

      // CRITICAL FIX: Only slice audio buffer if Smart Start was NOT used
      // Smart Start already handled the 5-second warmup period, so we don't need to slice again
      const sampleRate = audioBuffer.sampleRate;
      const warmupSamples = this.smartStartWasUsed
        ? 0
        : Math.floor(this.warmUpDuration * sampleRate);
      const totalSamples = audioBuffer.length;
      const trainingSamples = totalSamples - warmupSamples;

      if (this.smartStartWasUsed) {
        logger.info(`📊 Using full recording (Smart Start handled warmup):`);
        logger.info(
          `   Total duration: ${audioBuffer.duration.toFixed(2)}s - ALL USED FOR TRAINING`
        );
      } else {
        logger.info(`📊 Slicing audio buffer (fallback mode without Smart Start):`);
        logger.info(`   Total duration: ${audioBuffer.duration.toFixed(2)}s`);
        logger.info(
          `   Warmup period: ${this.warmUpDuration}s (${warmupSamples} samples) - DISCARDED`
        );
        logger.info(
          `   Training period: ${(trainingSamples / sampleRate).toFixed(2)}s (${trainingSamples} samples) - USED`
        );
      }

      // CRITICAL FIX: Validate that we have enough samples for training
      // UPDATED: Increased from 2.0s to 5.0s for stable GMIA models
      // With 330ms windows + 66ms hop: 5s = ~70-80 chunks (sufficient for statistical stability)
      // 2s was too short (~26 chunks), leading to high variance and unreliable models
      const MIN_TRAINING_DURATION = 5.0; // Minimum 5 seconds of training data
      const minTrainingSamples = Math.floor(MIN_TRAINING_DURATION * sampleRate);

      if (trainingSamples <= 0) {
        throw new Error(
          t('reference.errors.recordingTooShort', { duration: audioBuffer.duration.toFixed(2), warmup: this.warmUpDuration, minDuration: (this.warmUpDuration + MIN_TRAINING_DURATION).toFixed(1) })
        );
      }

      if (trainingSamples < minTrainingSamples) {
        throw new Error(
          t('reference.errors.trainingDataTooShort', { duration: (trainingSamples / sampleRate).toFixed(2), minDuration: MIN_TRAINING_DURATION, totalMinDuration: (this.warmUpDuration + MIN_TRAINING_DURATION).toFixed(1) })
        );
      }

      // Create new AudioBuffer with only the training portion
      const trainingBuffer = this.audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        trainingSamples,
        sampleRate
      );

      // Copy data from original buffer (starting at warmupSamples offset)
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const originalData = audioBuffer.getChannelData(channel);
        const trainingData = trainingBuffer.getChannelData(channel);

        // Copy samples from offset to end
        for (let i = 0; i < trainingSamples; i++) {
          trainingData[i] = originalData[warmupSamples + i];
        }
      }

      // CRITICAL FIX: Create DSP config with actual sample rate from AudioContext
      // This ensures training features match diagnosis features even if browser uses different sample rate
      const actualSampleRate = this.audioContext.sampleRate;
      const dspConfig = {
        ...DEFAULT_DSP_CONFIG,
        sampleRate: actualSampleRate,
        frequencyRange: [0, actualSampleRate / 2] as [number, number], // Update Nyquist frequency
      };

      logger.debug(
        `📊 DSP Config: sampleRate=${dspConfig.sampleRate}Hz, frequencyRange=[${dspConfig.frequencyRange[0]}, ${dspConfig.frequencyRange[1]}]Hz`
      );

      // Extract features from the SLICED buffer (only stable signal)
      logger.info('📊 Extracting features from stable signal...');
      const features = extractFeatures(trainingBuffer, dspConfig);
      logger.info(`   Extracted ${features.length} feature vectors`);

      // Cherry-Picking (Pipeline-Stufe 1): Filter transient interference frames
      // Applied BEFORE quality check and room compensation so GMIA only sees clean frames.
      const cherryPickSettings = getCherryPickSettings();
      let cherryPickedFeatures = features;
      let cpTotalCount = features.length;
      let cpRemovedCount = 0;

      if (cherryPickSettings.enabled) {
        const cpResult = cherryPickFeatures(features, cherryPickSettings);
        cpTotalCount = cpResult.totalCount;
        cpRemovedCount = cpResult.removedCount;
        logger.info(`🍒 Cherry-Picking: ${cpResult.removedCount}/${cpResult.totalCount} Frames verworfen`);
        if (cpResult.removedCount > 0) {
          logger.info(`   Entfernte Indizes: [${cpResult.removedIndices.join(', ')}]`);
          logger.info(`   Energie-Schwellen: [${cpResult.energyStats.threshold[0].toFixed(4)}, ${cpResult.energyStats.threshold[1].toFixed(4)}]`);
          logger.info(`   Entropie-Schwellen: [${cpResult.entropyStats.threshold[0].toFixed(4)}, ${cpResult.entropyStats.threshold[1].toFixed(4)}]`);
        }
        cherryPickedFeatures = cpResult.filteredFeatures;

        // Safety check: enough frames remaining for training?
        if (cherryPickedFeatures.length < 5) {
          logger.error('Cherry-Picking: Too few frames remaining for training');
          cherryPickedFeatures = features;
          logger.warn('Fallback: Using all frames');
        }
      }

      // PHASE 2: Assess recording quality (on cherry-picked features, before room compensation)
      const qualityResult = assessRecordingQuality(cherryPickedFeatures);

      // Room Compensation: Apply T60 subtraction + optional CMN (Pipeline-Stufe 3.5)
      // IMPORTANT: Quality assessment uses cherry-picked features; training uses compensated features.
      // NOTE: During reference creation, Bias-Match is not applicable (no prior reference exists).
      //       Only T60 subtraction is meaningful here. CMN is off by default.
      const roomCompSettings = getRoomCompSettings();
      const processedFeatures = roomCompSettings.enabled
        ? applyRoomCompensation(cherryPickedFeatures, roomCompSettings, this.currentT60 ?? undefined, undefined)
        : cherryPickedFeatures;

      // Pipeline Status Dashboard: Prepare for review modal (Expert mode only)
      if (this.pipelineStatus) {
        this.pipelineStatus.destroy();
        this.pipelineStatus = null;
      }
      const currentViewLevel = getViewLevel();
      if (currentViewLevel === 'expert' && (cherryPickSettings.enabled || roomCompSettings.enabled)) {
        this.pipelineStatus = new PipelineStatusDashboard();
        this.pipelineStatus.loadFromSettings(
          cherryPickSettings.enabled,
          roomCompSettings.enabled,
          roomCompSettings.cmnEnabled,
          roomCompSettings.t60Enabled,
          cherryPickSettings.sigmaThreshold,
          roomCompSettings.beta,
          roomCompSettings.biasMatchEnabled
        );

        if (cherryPickSettings.enabled) {
          this.pipelineStatus.setCherryPickBatchResult(cpTotalCount, cpRemovedCount);
        }

        if (this.currentT60) {
          this.pipelineStatus.setT60Result(this.currentT60.broadband, true);
        } else if (roomCompSettings.enabled && roomCompSettings.t60Enabled) {
          this.pipelineStatus.setT60Result(null, false);
        }

        if (roomCompSettings.enabled && roomCompSettings.cmnEnabled) {
          this.pipelineStatus.setCmnActive(true);
        }
      }

      // ════════════════════════════════════════════════════════════
      // Reference environment data for Bias Match + T60 comparison
      // ════════════════════════════════════════════════════════════
      const LOG_EPSILON = 1e-12;
      const K = processedFeatures[0]?.absoluteFeatures.length ?? 512;
      const refLogMeanArr = new Float64Array(K);

      for (const fv of processedFeatures) {
        for (let k = 0; k < K; k++) {
          refLogMeanArr[k] += Math.log(fv.absoluteFeatures[k] + LOG_EPSILON);
        }
      }
      for (let k = 0; k < K; k++) {
        refLogMeanArr[k] /= processedFeatures.length;
      }

      this.currentRefLogMean = Array.from(refLogMeanArr);
      logger.info(`📊 refLogMean computed (${K} bins, ${processedFeatures.length} frames)`);

      // Standard deviation (refLogStd) – for Drift Detector variance normalization
      const N = processedFeatures.length;
      if (N >= 2) {
        const refLogStdArr = new Float64Array(K);
        for (const fv of processedFeatures) {
          for (let k = 0; k < K; k++) {
            const logVal = Math.log(fv.absoluteFeatures[k] + LOG_EPSILON);
            const diff = logVal - refLogMeanArr[k];
            refLogStdArr[k] += diff * diff;
          }
        }
        for (let k = 0; k < K; k++) {
          refLogStdArr[k] = Math.sqrt(refLogStdArr[k] / (N - 1)); // Bessel correction
        }
        this.currentRefLogStd = Array.from(refLogStdArr);
        logger.info(`📊 refLogStd computed (${K} bins, ${N} frames)`);
      } else {
        this.currentRefLogStd = null;
      }

      // Residual standard deviation (refLogResidualStd) – Drift Detector V2
      // Measures variance of the FINE STRUCTURE (not overall spectrum).
      const driftSettings = getDriftSettings();
      const residualStd = computeRefLogResidualStd(processedFeatures, refLogMeanArr, driftSettings.smoothWindow);
      if (residualStd) {
        this.currentRefLogResidualStd = Array.from(residualStd);
        logger.info(`📊 refLogResidualStd computed (${K} bins, ${N} frames)`);
      } else {
        this.currentRefLogResidualStd = null;
      }

      // Adaptive threshold calibration via reference partitions – Drift Detector V2
      this.currentRefDriftBaseline = calibrateAdaptiveThresholds(processedFeatures, driftSettings);
      if (this.currentRefDriftBaseline) {
        logger.info('📊 Adaptive drift thresholds calibrated:', this.currentRefDriftBaseline);
      } else {
        logger.info('📊 Too few frames for drift calibration, fallback thresholds will be used');
      }

      // Store reference T60 (measured during chirp warmup)
      this.currentRefT60 = this.currentT60?.broadband ?? null;
      this.currentRefT60Classification = this.currentRefT60 !== null
        ? classifyT60Value(this.currentRefT60)
        : null;

      if (this.currentRefT60 !== null) {
        logger.info(`🔊 Reference environment: T60 = ${this.currentRefT60.toFixed(2)}s (${this.currentRefT60Classification})`);
      } else {
        logger.info('🔊 No reference T60 (chirp disabled or failed)');
      }

      // Prepare training data (but don't train yet - wait for user approval)
      // CRITICAL FIX: Store actual DSP config used for feature extraction
      // ZERO-FRICTION: Use placeholder ID if no machine selected (will be updated when machine is created)
      const trainingData: TrainingData = {
        featureVectors: processedFeatures.map((f) => f.features),
        machineId: this.machine?.id || 'pending-auto-create',
        recordingId: `ref-${Date.now()}`,
        numSamples: processedFeatures.length,
        config: dspConfig, // Use actual config with correct sample rate
      };

      // Store for later use
      this.currentAudioBuffer = audioBuffer;
      this.currentFeatures = processedFeatures;
      this.currentQualityResult = qualityResult;
      this.currentTrainingData = trainingData;

      // Cleanup resources now that processing is complete
      // This releases AudioContext, MediaStream, timer, etc.
      this.cleanup();

      // Hide recording modal
      this.hideRecordingModal();

      // PHASE 2: Show review modal instead of saving directly
      this.showReviewModal();
    } catch (error) {
      logger.error('Processing error:', error);
      notify.error(t('reference.recording.processingFailed'), error as Error, {
        title: t('modals.processingError'),
        duration: 0,
      });

      // Cleanup on error
      this.cleanup();

      this.hideRecordingModal();
    }
  }

  /**
   * Show success message with reference audio export option
   */
  private showSuccessWithExport(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // CRITICAL FIX: Determine file extension based on actual MIME type
    let extension = 'webm';
    if (this.recordedBlob) {
      if (this.recordedBlob.type.includes('ogg')) {
        extension = 'ogg';
      } else if (this.recordedBlob.type.includes('mp4')) {
        extension = 'm4a';
      }
    }
    const machineId = this.machine?.id || 'unknown';
    const machineName = this.machine?.name || 'Unknown Machine';
    const filename = `${machineId}_REF_${timestamp}.${extension}`;

    const shouldDownload = confirm(
      t('reference.success.modelTrained', { name: machineName }) +
        '\n\n' +
        t('reference.success.downloadPrompt')
    );

    if (shouldDownload && this.recordedBlob) {
      this.exportReferenceAudio(filename);
    }
  }

  /**
   * Export reference audio as downloadable file
   */
  private exportReferenceAudio(filename: string): void {
    if (!this.recordedBlob) {
      notify.warning(t('reference.errors.noAudioFile'), {
        title: t('reference.errors.noAudioFile'),
      });
      return;
    }

    try {
      const url = URL.createObjectURL(this.recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.info(`📥 Reference audio exported: ${filename}`);
    } catch (error) {
      logger.error('Export error:', error);
      notify.error(t('reference.errors.exportFailed'), error as Error, {
        title: t('reference.errors.exportFailed'),
      });
    }
  }

  /**
   * Update status message in UI
   */
  private updateStatusMessage(message: string): void {
    const statusElement = document.getElementById('recording-status');
    if (statusElement) {
      statusElement.textContent = message;
    }

    // Also update modal title if needed
    const modalTitle = document.querySelector('#recording-modal .modal-header h3');
    if (modalTitle && message.includes(t('reference.recording.stabilizing').split('...')[0])) {
      modalTitle.textContent = `${t('modals.referenceRecording')} - ${t('reference.recording.stabilizing')}`;
    } else if (modalTitle && message.includes(t('reference.recording.waitingForSignal').split(' ')[0])) {
      modalTitle.textContent = `${t('modals.referenceRecording')} - ${t('reference.recording.waitingForSignal')}`;
    } else if (modalTitle && message.includes(t('reference.recording.recording').split(' ')[0])) {
      modalTitle.textContent = `${t('modals.referenceRecording')} - ${t('reference.recording.recording')}`;
    }
  }

  /**
   * Show recording modal
   */
  private showRecordingModal(): void {
    const modal = document.getElementById('recording-modal');
    if (modal) {
      modal.style.display = 'flex';
    }

    // CRITICAL FIX: Update machine name in modal subtitle
    // ZERO-FRICTION: Show hint if no machine selected
    const machineIdElement = document.getElementById('machine-id');
    if (machineIdElement) {
      if (this.machine) {
        machineIdElement.textContent = `${this.machine.name} (${this.machine.id})`;
        logger.debug('✅ Modal machine name updated:', this.machine.name);
      } else {
        machineIdElement.textContent = t('zeroFriction.noMachineSelected');
        logger.debug('✅ Modal: Zero-friction mode (no machine selected)');
      }
    }

    // Sprint 1 UX: Show reference explanation before recording
    const modalBody = document.querySelector('#recording-modal .modal-body');
    if (modalBody && !document.getElementById('reference-explain-banner')) {
      const explainBanner = document.createElement('div');
      explainBanner.id = 'reference-explain-banner';
      explainBanner.className = 'reference-explain-banner';
      explainBanner.innerHTML = `
        <div class="explain-icon">\u2139\uFE0F</div>
        <div class="explain-text">${t('reference.explainBefore')}</div>
      `;
      modalBody.insertBefore(explainBanner, modalBody.firstChild);
    }

    // Add existing models info and status message
    if (modalBody && !document.getElementById('recording-status')) {
      // Show existing models info
      const existingModels = this.machine?.referenceModels || [];
      const existingModelsInfo =
        existingModels.length > 0
          ? existingModels
              .map((m) => {
                const trainingDate = new Date(m.trainingDate).toLocaleString(getLocale(), {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return `${m.label} (${trainingDate})`;
              })
              .join(', ')
          : t('reference.noModelsYet');

      const infoDiv = document.createElement('div');
      infoDiv.className = 'existing-models-info';
      infoDiv.style.cssText =
        'background: rgba(0, 212, 255, 0.1); border-left: 3px solid var(--primary-color); padding: 8px 12px; margin-bottom: 12px; border-radius: 4px;';
      infoDiv.innerHTML = `
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">${t('reference.existingModels')}</div>
        <div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 500;">${existingModelsInfo}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">${t('reference.statesTrainedCount', { count: existingModels.length })}</div>
      `;
      const visualizerContainer = modalBody.querySelector('#visualizer-container');
      if (visualizerContainer) {
        visualizerContainer.insertAdjacentElement('afterend', infoDiv);
      } else {
        modalBody.insertBefore(infoDiv, modalBody.firstChild);
      }

      const statusDiv = document.createElement('div');
      statusDiv.id = 'recording-status';
      statusDiv.className = 'recording-status';
      statusDiv.textContent = t('common.initializing');
      infoDiv.insertAdjacentElement('afterend', statusDiv);

      // Sprint 1 UX: Show movement hint during recording
      const movementHint = document.createElement('div');
      movementHint.className = 'recording-hint';
      movementHint.textContent = t('reference.explainDuring');
      statusDiv.insertAdjacentElement('afterend', movementHint);
    }

    // Setup stop button
    const stopBtn = document.getElementById('stop-recording-btn');
    if (stopBtn) {
      // CRITICAL FIX: Reset button text using constant (Diagnose phase sets it to 'Stop & Save')
      // This prevents UI confusion when switching between phases
      stopBtn.textContent = BUTTON_TEXT.STOP_REFERENCE;
      stopBtn.onclick = () => this.stopRecording();
    }

    // VISUAL POSITIONING: Add video preview if camera is available
    if (this.cameraStream && modalBody) {
      // Create video container
      const videoContainer = document.createElement('div');
      videoContainer.id = 'reference-video-container';
      videoContainer.className = 'reference-video-container';
      videoContainer.style.cssText = `
        position: relative;
        width: 100%;
        max-width: 300px;
        margin: 12px auto;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid var(--primary-color);
      `;

      // Create video element
      const video = document.createElement('video');
      video.id = 'reference-video';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.cssText = `
        width: 100%;
        height: auto;
        display: block;
      `;

      // Attach camera stream to video
      video.srcObject = this.cameraStream;

      // Add hint text
      const hint = document.createElement('p');
      hint.className = 'video-hint';
      hint.style.cssText = `
        font-size: 0.75rem;
        color: var(--text-muted);
        text-align: center;
        margin-top: 8px;
      `;
      hint.textContent = t('reference.recording.positionImage');

      videoContainer.appendChild(video);
      modalBody.insertBefore(videoContainer, modalBody.firstChild);
      modalBody.insertBefore(hint, videoContainer.nextSibling);

      logger.info('✅ Reference video preview added to modal');
    }
  }

  /**
   * Hide recording modal
   */
  private hideRecordingModal(): void {
    const modal = document.getElementById('recording-modal');
    if (modal) {
      modal.style.display = 'none';
    }

    const statusElement = document.getElementById('recording-status');
    if (statusElement) {
      statusElement.remove();
    }

    // Clean up existing models info
    const existingModelsInfo = modal?.querySelector('.existing-models-info');
    if (existingModelsInfo) {
      existingModelsInfo.remove();
    }

    // VISUAL POSITIONING: Clean up video elements
    const videoContainer = document.getElementById('reference-video-container');
    if (videoContainer) {
      videoContainer.remove();
    }
    const videoHint = modal?.querySelector('.video-hint');
    if (videoHint) {
      videoHint.remove();
    }
  }

  /**
   * Start recording timer with dual-phase UI
   *
   * CRITICAL FIX: Timer behavior depends on whether Smart Start was used:
   * - Smart Start used: Show only recording phase (user-configured duration, e.g., 10s)
   * - Smart Start NOT used: Show warmup + recording phases (5s warmup + user-configured duration = e.g., 15s total)
   *
   * Phase 1 (0-5s): "Stabilisierung..." (only if Smart Start NOT used)
   * Phase 2 (5s-15s or 0-10s): "Aufnahme..." (actual recording used for training)
   */
  private startTimer(): void {
    // CRITICAL FIX: Clear any existing timer first to prevent memory leaks
    // This handles the case where startTimer() is called multiple times
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    let elapsed = 0;
    const timerElement = document.getElementById('recording-timer');
    const statusElement = document.getElementById('recording-status');

    // Determine total duration and warmup phase based on Smart Start usage
    const warmupPhase = this.smartStartWasUsed ? 0 : this.warmUpDuration;
    const totalDuration = this.smartStartWasUsed
      ? this.recordingDuration
      : this.warmUpDuration + this.recordingDuration;

    // Store interval reference for cleanup
    this.timerInterval = setInterval(() => {
      // CRITICAL FIX: Check if recording is still active (defensive programming)
      // If recording was stopped prematurely, clear the timer
      if (!this.isRecordingActive) {
        if (this.timerInterval !== null) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }
        return;
      }

      elapsed++;

      // Update phase-specific UI
      if (!this.smartStartWasUsed && elapsed <= warmupPhase) {
        // Phase 1: Stabilisierung (0-5s) - only shown when Smart Start was NOT used
        if (statusElement) {
          const remaining = warmupPhase - elapsed + 1;
          statusElement.textContent = `${t('reference.recording.stabilizing')} ${remaining}s`;
        }
        if (timerElement) {
          timerElement.textContent = '--:--';
        }
      } else {
        // Phase 2: Aufnahme - actual recording phase (after warmup if applicable)
        const recordingElapsed = this.smartStartWasUsed ? elapsed : elapsed - warmupPhase;
        const recordingTotal = this.recordingDuration;

        if (statusElement) {
          statusElement.textContent = `${t('reference.recording.recording')}...`;
        }
        if (timerElement) {
          const minutes = Math.floor(recordingElapsed / 60);
          const seconds = recordingElapsed % 60;
          timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} / ${Math.floor(
            recordingTotal / 60
          )
            .toString()
            .padStart(2, '0')}:${(recordingTotal % 60).toString().padStart(2, '0')}`;
        }
      }

      if (elapsed >= totalDuration) {
        if (this.timerInterval !== null) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }
      }
    }, 1000);
  }

  /**
   * PHASE 2: Show review modal with audio player and quality assessment
   */
  private showReviewModal(): void {
    if (!this.recordedBlob || !this.currentQualityResult) {
      logger.error('Cannot show review modal: missing data');
      notify.error(t('reference.recording.processingFailed'), new Error('Missing recording data'), {
        title: t('modals.processingError'),
        duration: 0,
      });
      return;
    }

    const modal = document.getElementById('review-modal');
    if (!modal) {
      logger.error('Review modal element not found');
      notify.error(t('reference.recording.processingFailed'), new Error('Review modal not found in DOM'), {
        title: t('modals.processingError'),
        duration: 0,
      });
      return;
    }

    // CRITICAL FIX: Update review recording info text with actual duration values
    // This ensures the text reflects the current recording settings, not hardcoded values
    const reviewRecordingInfo = document.getElementById('review-recording-info');
    if (reviewRecordingInfo) {
      const totalDuration = this.warmUpDuration + this.recordingDuration;
      reviewRecordingInfo.textContent = t('review.recordingInfo', {
        total: totalDuration,
        duration: this.recordingDuration,
      });
    }

    // Setup audio player with proper null checks
    const audioElement = document.getElementById('review-audio') as HTMLAudioElement | null;

    if (!audioElement) {
      logger.error('Audio player element not found');
      notify.error(t('reference.recording.processingFailed'), new Error('Audio player element not found in DOM'), {
        title: t('modals.processingError'),
        duration: 0,
      });
      return;
    }

    // Recreate <source> element if missing (can be destroyed by translateDOM's textContent)
    let audioSource = document.getElementById('review-audio-source') as HTMLSourceElement | null;
    if (!audioSource) {
      logger.warn('review-audio-source not found, recreating element');
      audioSource = document.createElement('source');
      audioSource.id = 'review-audio-source';
      audioElement.appendChild(audioSource);
    }

    const audioUrl = URL.createObjectURL(this.recordedBlob);
    audioSource.src = audioUrl;
    audioSource.type = this.recordedBlob.type || 'audio/webm';
    audioElement.load();

    const imageContainer = document.getElementById('review-reference-image-container');
    const imageElement = document.getElementById('review-reference-image') as HTMLImageElement | null;

    if (imageContainer && imageElement) {
      if (this.capturedReferenceImage) {
        if (this.reviewImageUrl) {
          URL.revokeObjectURL(this.reviewImageUrl);
        }
        this.reviewImageUrl = URL.createObjectURL(this.capturedReferenceImage);
        imageElement.src = this.reviewImageUrl;
        imageContainer.style.display = 'block';
      } else {
        imageElement.removeAttribute('src');
        imageContainer.style.display = 'none';
      }
    }

    // Update quality indicator (only visible for non-GOOD quality)
    this.updateQualityIndicator(this.currentQualityResult);

    // Setup event listeners for buttons
    const discardBtn = document.getElementById('review-discard-btn');
    const saveBtn = document.getElementById('review-save-btn');

    if (discardBtn) {
      discardBtn.onclick = () => this.handleReviewDiscard();
    }

    if (saveBtn) {
      saveBtn.onclick = () => this.handleReviewSave();
    }

    // Mount Pipeline Status Dashboard into review modal (Expert mode)
    if (this.pipelineStatus) {
      const qualitySection = modal.querySelector('.review-quality');
      if (qualitySection && qualitySection.parentElement) {
        this.pipelineStatus.mount(
          qualitySection.parentElement,
          qualitySection.nextSibling as HTMLElement
        );
        this.pipelineStatus.show();
      }
    }

    // Show modal
    modal.style.display = 'flex';

    logger.info('🔍 Review modal displayed');
  }

  /**
   * Hide review modal
   */
  private hideReviewModal(): void {
    // Cleanup Pipeline Status Dashboard
    if (this.pipelineStatus) {
      this.pipelineStatus.destroy();
      this.pipelineStatus = null;
    }

    const modal = document.getElementById('review-modal');
    if (modal) {
      modal.style.display = 'none';
    }

    // Clean up audio URL
    const audioElement = document.getElementById('review-audio') as HTMLAudioElement;
    if (audioElement) {
      audioElement.pause();
      const audioSource = document.getElementById('review-audio-source') as HTMLSourceElement;
      if (audioSource && audioSource.src) {
        URL.revokeObjectURL(audioSource.src);
        audioSource.src = '';
      }
    }

    if (this.reviewImageUrl) {
      URL.revokeObjectURL(this.reviewImageUrl);
      this.reviewImageUrl = null;
    }
    const imageContainer = document.getElementById('review-reference-image-container');
    const imageElement = document.getElementById('review-reference-image') as HTMLImageElement | null;
    if (imageContainer && imageElement) {
      imageElement.removeAttribute('src');
      imageContainer.style.display = 'none';
    }
  }

  /**
   * Update quality indicator UI - only shown when quality is not GOOD
   */
  private updateQualityIndicator(qualityResult: QualityResult): void {
    const qualitySection = document.querySelector('.review-quality') as HTMLElement;
    if (!qualitySection) return;

    // Hide entire quality section when quality is GOOD
    if (qualityResult.rating === 'GOOD') {
      qualitySection.style.display = 'none';
      return;
    }

    qualitySection.style.display = '';

    // Update score
    const scoreElement = document.getElementById('quality-score');
    if (scoreElement) {
      scoreElement.textContent = qualityResult.score.toString();
    }

    // Update rating text and icon
    const ratingElement = document.getElementById('quality-rating-text');
    const iconElement = document.getElementById('quality-icon');

    if (ratingElement && iconElement) {
      ratingElement.className = 'quality-rating';
      iconElement.className = 'quality-icon';
      iconElement.innerHTML = '';

      if (qualityResult.rating === 'OK') {
        ratingElement.classList.add('ok');
        ratingElement.textContent = t('reference.quality.slightUnrest');
        iconElement.classList.add('ok');
        iconElement.innerHTML = '⚠';
      } else {
        ratingElement.classList.add('bad');
        ratingElement.textContent = t('reference.quality.signalUnstable');
        iconElement.classList.add('bad');
        iconElement.innerHTML = '✗';
      }
    }

    // Show issues if any
    const issuesContainer = document.getElementById('quality-issues');
    const issuesList = document.getElementById('quality-issues-list');

    if (issuesContainer && issuesList) {
      if (qualityResult.issues.length > 0) {
        issuesList.innerHTML = '';
        qualityResult.issues.forEach((issue) => {
          const li = document.createElement('li');
          li.textContent = issue;
          issuesList.appendChild(li);
        });
        issuesContainer.style.display = 'block';
      } else {
        issuesContainer.style.display = 'none';
      }
    }
  }

  /**
   * Handle "Discard" button click - discard recording and start over
   */
  private handleReviewDiscard(): void {
    logger.info('🗑️ User discarded recording');

    // Hide review modal
    this.hideReviewModal();

    // Clear stored data
    this.currentAudioBuffer = null;
    this.currentFeatures = [];
    this.currentQualityResult = null;
    this.currentTrainingData = null;
    this.recordedBlob = null;
    this.capturedReferenceImage = null; // VISUAL POSITIONING: Clear reference image

    // Show info message
    notify.info(t('reference.success.canStartNew'), { title: t('modals.recordingDiscarded') });
  }

  /**
   * Handle "Save" button click - train model and save to database
   *
   * ZERO-FRICTION WORKFLOW:
   * 1. If no machine selected: Auto-create a new machine with generated name
   * 2. First recording: Always labeled "Baseline" (healthy state) - NO PROMPT
   * 3. Additional recordings: Ask user for label and type
   * 4. After save: Show simple toast with optional "Edit" button
   *
   * MULTICLASS WORKFLOW:
   * 1. First recording: Always labeled "Baseline" (healthy state)
   * 2. Additional recordings: User provides custom label (e.g., "Unwucht", "Lagerschaden")
   * 3. After save: Show list of trained states + "Train Another State" button
   *
   * IMPORTANT: If quality is BAD, show additional confirmation warning
   */
  private async handleReviewSave(): Promise<void> {
    const { getMachine, saveMachine, createAutoMachine, getNextAutoMachineNumber } = await import('@data/db.js');

    let machineToUpdate: Machine;

    // ZERO-FRICTION: Auto-create machine if none selected
    if (!this.machine || !this.machine.id) {
      logger.info('🤖 Zero-friction: No machine selected, auto-creating...');

      try {
        // Get next number for auto-generated name
        const nextNumber = await getNextAutoMachineNumber();
        const paddedNumber = nextNumber.toString().padStart(2, '0');
        const autoName = t('zeroFriction.autoMachineName', { number: paddedNumber });

        // Create the machine
        const newMachine = await createAutoMachine(autoName);
        this.machine = newMachine;
        this.wasAutoCreated = true;
        machineToUpdate = newMachine;

        logger.info(`✅ Auto-created machine: ${newMachine.name} (${newMachine.id})`);
      } catch (error) {
        logger.error('Failed to auto-create machine:', error);
        notify.error(t('reference.errors.machineDataMissing'), error as Error, {
          title: t('modals.error'),
          duration: 0,
        });
        return;
      }
    } else {
      // Machine exists - fetch latest from DB
      const existingMachine = await getMachine(this.machine.id);
      if (!existingMachine) {
        logger.error(`Cannot save: machine not found (${this.machine.id})`);
        notify.error(t('reference.errors.machineDataMissing'), new Error('Machine not found'), {
          title: t('modals.error'),
          duration: 0,
        });
        return;
      }
      machineToUpdate = existingMachine;
      this.machine = existingMachine;
    }

    if (!this.currentTrainingData || !this.currentQualityResult) {
      logger.error('Cannot save: missing training data or quality result');
      notify.error(t('reference.recording.processingFailed'), new Error('Missing training data or quality result'), {
        title: t('modals.processingError'),
        duration: 0,
      });
      return;
    }

    // PHASE 2 REQUIREMENT: Block BAD quality recordings with very low scores
    if (this.currentQualityResult.rating === 'BAD' && this.currentQualityResult.score < 30) {
      logger.error('Recording quality too low for training - blocking save');
      notify.error(
        t('reference.errors.qualityTooLow', { issues: this.currentQualityResult.issues.map((issue) => `• ${issue}`).join('\n') }),
        new Error('Quality too low'),
        { duration: 0 }
      );
      return;
    }

    // INTELLIGENT MAGNITUDE + QUALITY CHECK: Brown Noise Protection
    // Block if BOTH quality AND signal magnitude are insufficient
    // UPDATED: Magnitude now uses RMS amplitude (pre-standardization), typical: 0.01-0.5
    const magnitude = this.currentQualityResult.metadata?.signalMagnitude ?? 0.5; // Default to OK if not available
    const isNoiseDetected =
      (magnitude < 0.01 && this.currentQualityResult.score < 60) || // Very low magnitude + poor quality = pure noise
      (magnitude < 0.03 && this.currentQualityResult.score < 50); // Low magnitude + bad quality = too risky

    if (isNoiseDetected) {
      logger.error('Brown noise or weak signal detected - blocking save');
      notify.error(
        t('reference.errors.signalTooWeak', {
          magnitude: magnitude.toFixed(4),
          quality: this.currentQualityResult.score,
          issues: this.currentQualityResult.issues.map((issue) => `• ${issue}`).join('\n'),
        }),
        new Error('Signal too weak or noisy'),
        { duration: 0, title: t('modals.unsuitableSignal') }
      );
      return;
    }

    // PHASE 2 REQUIREMENT: Show extra confirmation for BAD quality (score >= 30%)
    // This runs ONLY if not blocked by magnitude check above
    if (this.currentQualityResult.rating === 'BAD') {
      const confirmed = confirm(
        t('reference.errors.badQualityWarning', {
          issues: this.currentQualityResult.issues.map((issue) => `• ${issue}`).join('\n'),
        })
      );

      if (!confirmed) {
        logger.info('User cancelled save due to bad quality warning');
        return;
      }
    }

    try {
      // MULTICLASS: Determine label and type based on number of existing models
      let label: string;
      let type: 'healthy' | 'faulty';

      // CRITICAL FIX: Store local reference to prevent race conditions
      // Use machineToUpdate (freshly fetched or just created) for consistency
      const existingModels = machineToUpdate.referenceModels || [];

      // ZERO-FRICTION: First recording is always baseline - no prompt needed
      if (existingModels.length === 0) {
        // First recording: Always baseline (healthy state) - SILENT, no user interaction
        label = t('reference.labels.baseline');
        type = 'healthy';
        logger.info(`🎯 Zero-friction: First recording - using label: "${label}", type: "healthy"`);
      } else {
        // Additional recordings: Ask user for label and type
        const userLabel = prompt(
          t('reference.labels.prompt'),
          ''
        );

        if (!userLabel || userLabel.trim() === '') {
          logger.info('User cancelled - no label provided');
          notify.warning(t('reference.labels.pleaseEnterName'), { title: t('modals.cancelled') });
          return;
        }

        // CRITICAL FIX: Validate and sanitize user input to prevent issues
        // - Limit length to prevent UI overflow
        // - Remove control characters and excessive whitespace
        // - Validate against empty result after sanitization
        const MAX_LABEL_LENGTH = 50;
        // eslint-disable-next-line no-control-regex
        const controlCharsRegex = /[\u0000-\u001F\u007F]/g;
        let sanitizedLabel = userLabel
          .trim()
          .replace(controlCharsRegex, '') // Remove control characters
          .replace(/\s+/g, ' '); // Normalize whitespace

        if (sanitizedLabel.length > MAX_LABEL_LENGTH) {
          sanitizedLabel = sanitizedLabel.substring(0, MAX_LABEL_LENGTH);
          logger.warn(`Label truncated to ${MAX_LABEL_LENGTH} characters`);
        }

        if (sanitizedLabel === '') {
          logger.info('User input empty after sanitization');
          notify.warning(t('reference.labels.pleaseEnterName'), { title: t('modals.cancelled') });
          return;
        }

        label = sanitizedLabel;

        // Ask user for type: Is this a normal state or a fault?
        const isHealthy = confirm(
          t('reference.labels.confirmType', { label })
        );

        type = isHealthy ? 'healthy' : 'faulty';
        logger.info(`Additional recording - using label: "${label}", type: "${type}"`);
      }

      logger.info('💾 Saving reference model...');

      // DEBUG LOGGING: Show which machine we're saving to
      logger.debug('💾 Reference Save Debug:', {
        machineId: this.machine.id,
        machineName: this.machine.name,
        label: label,
        type: type,
        existingModels: this.machine.referenceModels?.length || 0,
      });

      // Train GMIA model
      const model = trainGMIA(this.currentTrainingData, this.machine.id);

      // REMOVED: Weight magnitude validation check
      // This check was too strict and caused false negatives (rejecting good recordings like hair dryer)
      // Reason: Weight vectors from standardized features are naturally small (0.001-0.01 range)
      // We now rely on the RMS amplitude check above, which is much more reliable
      // The RMS check validates BEFORE standardization, preserving true signal strength

      logger.info(
        `✅ Model trained successfully (scaling constant: ${model.scalingConstant.toFixed(3)})`
      );

      // ============================================================================
      // SCORE CALIBRATION: Self-Test for Baseline Score
      // ============================================================================
      // After training, we test the model against its own training data to determine
      // the "baseline score" - how well the model recognizes itself.
      //
      // This baseline score is used to normalize diagnosis scores:
      // DisplayedScore = (RawScore / BaselineScore) * 100
      //
      // This ensures that a perfect match (reference vs. same signal) shows 100%,
      // even if the mathematical raw score is only 85-95% due to GMIA algorithm characteristics.
      //
      // Quality Gate: If baseline score < 75%, the recording is too noisy/unstable
      // and should be rejected to prevent unreliable diagnoses.
      // ============================================================================
      logger.info('🎯 Performing self-test for baseline score calibration...');

      // Test model against multiple samples from its own training data
      const numSamplesToTest = Math.min(20, this.currentFeatures.length);
      const step = Math.max(1, Math.floor(this.currentFeatures.length / numSamplesToTest));
      const testScores: number[] = [];

      for (let i = 0; i < numSamplesToTest; i++) {
        const featureIndex = Math.min(i * step, this.currentFeatures.length - 1);
        const testFeature = this.currentFeatures[featureIndex];

        try {
          const diagnosis = classifyDiagnosticState(
            [model],
            testFeature,
            this.currentTrainingData.config.sampleRate
          );
          testScores.push(diagnosis.healthScore);
        } catch (error) {
          logger.warn(`⚠️ Self-test sample ${i} failed:`, error);
          // Continue with remaining samples
        }
      }

      // Calculate average baseline score
      if (testScores.length === 0) {
        throw new Error('Self-test failed: No valid scores could be calculated');
      }

      const baselineScore = testScores.reduce((sum, s) => sum + s, 0) / testScores.length;
      logger.info(
        `✅ Baseline Score: ${baselineScore.toFixed(1)}% (averaged from ${testScores.length} samples)`
      );
      logger.info(
        `   Score range: ${Math.min(...testScores).toFixed(1)}% - ${Math.max(...testScores).toFixed(1)}%`
      );

      // QUALITY GATE: Reject reference if baseline score is too low
      const MIN_BASELINE_SCORE = 75;
      if (baselineScore < MIN_BASELINE_SCORE) {
        logger.error(
          `❌ Baseline score too low: ${baselineScore.toFixed(1)}% (minimum: ${MIN_BASELINE_SCORE}%)`
        );
        notify.error(
          t('reference.errors.baselineScoreTooLow', {
            baselineScore: baselineScore.toFixed(1),
            minScore: MIN_BASELINE_SCORE,
          }),
          new Error('Baseline score too low'),
          { title: t('modals.referenceUnsuitable'), duration: 0 }
        );
        return;
      }

      logger.info(
        `✅ Quality Gate passed: Baseline score ${baselineScore.toFixed(1)}% ≥ ${MIN_BASELINE_SCORE}%`
      );

      // Add baseline score, label and type to model
      model.baselineScore = baselineScore;
      model.label = label;
      model.type = type;

      // Save model + reference image in a single update to avoid overwriting changes.
      if (!machineToUpdate.referenceModels) {
        logger.warn(
          `⚠️ Machine ${this.machine.id} has no referenceModels array - initializing empty array`
        );
        machineToUpdate.referenceModels = [];
      }

      machineToUpdate.referenceModels.push(model);

      // VISUAL POSITIONING: Save reference image to machine (if captured)
      if (this.capturedReferenceImage) {
        machineToUpdate.referenceImage = this.capturedReferenceImage;
        logger.info(
          `📸 Reference image prepared for save (${this.capturedReferenceImage.size} bytes)`
        );
      }

      // Save reference environment data (for Session Bias Match + T60 comparison)
      if (this.currentRefLogMean) {
        machineToUpdate.refLogMean = this.currentRefLogMean;
        logger.info(`📊 refLogMean saved (${this.currentRefLogMean.length} bins)`);
      }
      if (this.currentRefLogStd) {
        machineToUpdate.refLogStd = this.currentRefLogStd;
        logger.info(`📊 refLogStd saved (${this.currentRefLogStd.length} bins)`);
      }
      if (this.currentRefLogResidualStd) {
        machineToUpdate.refLogResidualStd = this.currentRefLogResidualStd;
        logger.info(`📊 refLogResidualStd saved (${this.currentRefLogResidualStd.length} bins)`);
      }
      machineToUpdate.refDriftBaseline = this.currentRefDriftBaseline;
      if (this.currentRefDriftBaseline) {
        logger.info('📊 refDriftBaseline saved (adaptive thresholds)');
      }
      machineToUpdate.refT60 = this.currentRefT60;
      machineToUpdate.refT60Classification = this.currentRefT60Classification;
      if (this.currentRefT60 !== null) {
        logger.info(`📍 Reference environment saved: T60 = ${this.currentRefT60.toFixed(2)}s (${this.currentRefT60Classification})`);
      }

      await saveMachine(machineToUpdate);

      logger.info(
        `✅ Reference model "${label}" trained and saved${this.capturedReferenceImage ? ' with image' : ''}!`
      );

      // Drift Detector: Show hint that environment profile was stored
      if (getDriftSettings().enabled && this.currentRefLogMean) {
        notify.info(t('drift.referenceStored'));
      }

      const updatedMachine = machineToUpdate;
      if (updatedMachine) {
        this.machine = updatedMachine;

        // CRITICAL FIX: Notify other phases (especially DiagnosePhase) about the updated machine
        // This ensures the UI updates and diagnosis can use the new model immediately
        if (this.onMachineUpdated) {
          this.onMachineUpdated(updatedMachine);
        }
      }

      // Hide review modal
      this.hideReviewModal();

      // Sprint 1 UX: Enhanced success confirmation toast
      notify.success(t('reference.savedSuccess'), {
        title: t('reference.savedTitle'),
        duration: 5000,
      });

      // ZERO-FRICTION: Show simple success toast with edit option for auto-created machines
      if (this.wasAutoCreated) {
        this.showZeroFrictionSuccess(updatedMachine);
      } else {
        // Show success with option to download reference audio
        this.showSuccessWithExport();
      }

      // Clear stored data
      this.currentAudioBuffer = null;
      this.currentFeatures = [];
      this.currentQualityResult = null;
      this.currentTrainingData = null;
      this.currentRefLogMean = null;
      this.currentRefLogStd = null;
      this.currentRefLogResidualStd = null;
      this.currentRefDriftBaseline = null;
      this.currentRefT60 = null;
      this.currentRefT60Classification = null;
    } catch (error) {
      logger.error('Save error:', error);
      notify.error(t('reference.errors.saveFailed'), error as Error, {
        title: t('modals.saveError'),
        duration: 0,
      });
    }
  }

  /**
   * Show zero-friction success message with edit option
   *
   * ZERO-FRICTION: After auto-creating a machine and saving the reference,
   * show a simple toast with the machine name and an optional "Edit" button.
   */
  private async showZeroFrictionSuccess(machine: Machine): Promise<void> {
    const { saveMachine } = await import('@data/db.js');

    // Show simple success toast
    const toastMessage = t('zeroFriction.referenceCreatedToast', { machineName: machine.name });

    // Create toast with edit action
    notify.success(toastMessage, {
      title: t('common.success'),
      duration: 8000, // 8 seconds to give user time to see and optionally click
      actions: [
        {
          label: t('zeroFriction.editMachineName'),
          onClick: async () => {
            // Prompt user for new name
            const newName = prompt(t('zeroFriction.editMachineNamePrompt'), machine.name);
            if (newName && newName.trim() !== '' && newName.trim() !== machine.name) {
              // Update machine name
              machine.name = newName.trim();
              await saveMachine(machine);
              this.machine = machine;

              // Notify other phases
              if (this.onMachineUpdated) {
                this.onMachineUpdated(machine);
              }

              notify.success(t('zeroFriction.machineRenamed', { newName: machine.name }));
              logger.info(`✏️ Machine renamed to: ${machine.name}`);
            }
          },
        },
      ],
    });

    logger.info(`🎉 Zero-friction success: ${machine.name}`);

    // Reset auto-created flag
    this.wasAutoCreated = false;

  }

  private applyAppShellLayout(): void {
    const recordingModal = document.getElementById('recording-modal');
    if (recordingModal) {
      const recordingContent = recordingModal.querySelector('.modal-content');
      if (recordingContent) {
        recordingContent.classList.add('app-shell-container');
        const header = recordingContent.querySelector('.modal-header');
        const body = recordingContent.querySelector('.modal-body');
        const footer = recordingContent.querySelector('.modal-actions');

        header?.classList.add('shell-header');
        body?.classList.add('shell-content');
        footer?.classList.add('shell-footer');

        if (header && !header.querySelector('#reference-instruction')) {
          const instruction = document.createElement('p');
          instruction.id = 'reference-instruction';
          instruction.className = 'modal-instruction';
          instruction.textContent = t('reference.recording.instruction');
          header.appendChild(instruction);
        }

        if (body) {
          let visualizerContainer = body.querySelector<HTMLDivElement>('#visualizer-container');
          if (!visualizerContainer) {
            visualizerContainer = document.createElement('div');
            visualizerContainer.id = 'visualizer-container';
            visualizerContainer.className = 'visualizer-container';
          }

          const waveformCanvas = body.querySelector('#waveform-canvas');
          const gaugeCanvas = body.querySelector('#health-gauge-canvas');

          if (waveformCanvas && waveformCanvas.parentElement !== visualizerContainer) {
            visualizerContainer.appendChild(waveformCanvas);
          }
          if (gaugeCanvas && gaugeCanvas.parentElement !== visualizerContainer) {
            visualizerContainer.appendChild(gaugeCanvas);
          }

          if (!visualizerContainer.parentElement) {
            body.insertBefore(visualizerContainer, body.firstChild);
          } else if (body.firstChild !== visualizerContainer) {
            body.insertBefore(visualizerContainer, body.firstChild);
          }
        }
      }
    }

    const modal = document.getElementById('review-modal');
    if (!modal) return;

    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;

    modalContent.classList.add('app-shell-container');
    modalContent.querySelector('.modal-header')?.classList.add('shell-header');
    modalContent.querySelector('.modal-body')?.classList.add('shell-content');
    modalContent.querySelector('.modal-actions')?.classList.add('shell-footer');
  }

  /**
   * Destroy phase and cleanup all resources
   */
  public destroy(): void {
    this.cleanup();

    // CRITICAL FIX: Remove event listeners to prevent stacking on re-init
    if (this.recordButtonClickHandler) {
      // Original record button
      const recordBtn = document.getElementById('record-btn');
      if (recordBtn) {
        recordBtn.removeEventListener('click', this.recordButtonClickHandler);
      }

      // ZERO-FRICTION: New record button
      const zeroFrictionRecordBtn = document.getElementById('record-reference-btn');
      if (zeroFrictionRecordBtn) {
        zeroFrictionRecordBtn.removeEventListener('click', this.recordButtonClickHandler);
      }

      this.recordButtonClickHandler = null;
    }

    // Destroy visualizer
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }

    // Clear audio chunks
    this.audioChunks = [];
    this.recordedBlob = null;
  }
}
