/**
 * ZANOBOT - AUTO-DETECTION PHASE
 *
 * Simplified "Zustand prüfen" flow with automatic machine recognition.
 *
 * UX Principles:
 * - User should never be asked for information the system can determine itself
 * - Technical concepts (references, databases, classification) stay in background
 * - Language: calm, trustworthy, no jargon where not necessary
 * - Every user prompt must have clear added value
 *
 * Flow:
 * 1. User clicks "Zustand prüfen" (no machine pre-selection required)
 * 2. Audio is captured and compared against ALL machines in database
 * 3. Based on similarity score, one of three outcomes:
 *    - Fall A (≥80%): Automatic recognition, show result immediately
 *    - Fall B (40-79%): Uncertain, show selection to user
 *    - Fall C (<40%): No match, offer to create reference
 */

import { extractFeaturesFromChunk, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import {
  classifyAcrossAllMachines,
  getTopCandidates,
} from '@core/ml/scoring.js';
import { getAllMachines } from '@data/db.js';
import {
  getRawAudioStream,
  getSmartStartStatusMessage,
  DEFAULT_SMART_START_CONFIG,
} from '@core/audio/audioHelper.js';
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';
import { notify } from '@utils/notifications.js';
import type {
  Machine,
  AutoDetectionResult,
  MachineMatchResult,
  FeatureVector,
} from '@data/types.js';
import { logger } from '@utils/logger.js';
import { stopMediaStream, closeAudioContext } from '@utils/streamHelper.js';
import { t } from '../../i18n/index.js';

/**
 * Callback types for AutoDetectionPhase events
 */
export interface AutoDetectionCallbacks {
  /** Called when a machine is recognized with high confidence (Fall A) */
  onMachineRecognized: (machine: Machine, result: AutoDetectionResult) => void;
  /** Called when multiple candidates are found (Fall B) */
  onUncertainMatch: (candidates: MachineMatchResult[], result: AutoDetectionResult) => void;
  /** Called when no match is found (Fall C) */
  onNoMatch: (result: AutoDetectionResult) => void;
  /** Called when detection is cancelled */
  onCancel: () => void;
}

export class AutoDetectionPhase {
  private selectedDeviceId: string | undefined;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletManager: AudioWorkletManager | null = null;
  private callbacks: AutoDetectionCallbacks;

  // Processing state
  private isProcessing: boolean = false;
  private isStarting: boolean = false;
  private requestedSampleRate: number = 48000;
  private actualSampleRate: number = 48000;
  private chunkSize: number;
  private dspConfig: typeof DEFAULT_DSP_CONFIG;

  // Detection state
  private allMachines: Machine[] = [];
  private detectionComplete: boolean = false;
  private lastFeatureVector: FeatureVector | null = null;

  // Collection for averaging multiple chunks
  private collectedFeatures: FeatureVector[] = [];
  private readonly MIN_CHUNKS_FOR_DETECTION = 3; // ~1 second of audio

  constructor(callbacks: AutoDetectionCallbacks, selectedDeviceId?: string) {
    this.callbacks = callbacks;
    this.selectedDeviceId = selectedDeviceId;
    this.chunkSize = Math.floor(DEFAULT_DSP_CONFIG.windowSize * this.requestedSampleRate);
    this.dspConfig = { ...DEFAULT_DSP_CONFIG };
  }

  /**
   * Start the auto-detection flow
   */
  public async start(): Promise<void> {
    if (this.isStarting || this.isProcessing) {
      logger.warn('Auto-detection already running');
      return;
    }

    try {
      this.isStarting = true;
      this.detectionComplete = false;
      this.collectedFeatures = [];

      // Load all machines from database
      this.allMachines = await getAllMachines();
      logger.info(`🔍 Auto-detection: Loaded ${this.allMachines.length} machines`);

      // Check if any machines have reference models
      const machinesWithModels = this.allMachines.filter(
        (m) => m.referenceModels && m.referenceModels.length > 0
      );

      if (machinesWithModels.length === 0) {
        logger.info('🔍 Auto-detection: No machines with references found');
        // Show "no match" UI immediately since we have no references
        this.callbacks.onNoMatch({
          outcome: 'no_match',
          bestMatch: null,
          candidates: [],
          timestamp: Date.now(),
        });
        this.isStarting = false;
        return;
      }

      // Check AudioWorklet support
      if (!isAudioWorkletSupported()) {
        notify.error(t('diagnose.browserNotCompatible'));
        this.isStarting = false;
        return;
      }

      // Request microphone access
      this.mediaStream = await getRawAudioStream(this.selectedDeviceId);

      // Determine sample rate from existing models
      const expectedSampleRate = machinesWithModels[0]?.referenceModels?.[0]?.sampleRate || 48000;

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: expectedSampleRate });
      this.actualSampleRate = this.audioContext.sampleRate;

      // Update DSP config with actual sample rate
      this.chunkSize = Math.floor(DEFAULT_DSP_CONFIG.windowSize * this.actualSampleRate);
      this.dspConfig = {
        ...DEFAULT_DSP_CONFIG,
        sampleRate: this.actualSampleRate,
        frequencyRange: [0, this.actualSampleRate / 2],
      };

      logger.info(`🎤 Auto-detection: AudioContext created at ${this.actualSampleRate}Hz`);

      // Show the listening modal
      this.showListeningModal();

      // Initialize AudioWorklet
      this.audioWorkletManager = new AudioWorkletManager({
        bufferSize: this.chunkSize * 2,
        warmUpDuration: DEFAULT_SMART_START_CONFIG.warmUpDuration,
        onAudioChunk: (chunk) => {
          if (this.isProcessing && !this.detectionComplete) {
            this.processChunk(chunk);
          }
        },
        onSmartStartStateChange: (state) => {
          this.updateListeningStatus(getSmartStartStatusMessage(state), state.phase);
        },
        onSmartStartComplete: () => {
          logger.info('✅ Auto-detection: Signal detected, starting analysis');
          this.updateListeningStatus(t('autoDetect.analyzing'), 'recording');
          this.isProcessing = true;
        },
        onSmartStartTimeout: () => {
          logger.warn('⏱️ Auto-detection: Smart Start timeout');
          notify.warning(t('reference.recording.noSignal'));
          this.cleanup();
          this.hideListeningModal();
          this.callbacks.onCancel();
        },
      });

      await this.audioWorkletManager.init(this.audioContext, this.mediaStream);
      this.audioWorkletManager.startSmartStart();

      logger.info('✅ Auto-detection phase initialized');
    } catch (error) {
      logger.error('Auto-detection error:', error);
      notify.error(t('reference.recording.microphoneFailed'), error as Error);
      this.cleanup();
      this.hideListeningModal();
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Process an audio chunk and check for machine recognition
   */
  private processChunk(chunk: Float32Array): void {
    if (!chunk || chunk.length < this.chunkSize || this.detectionComplete) {
      return;
    }

    try {
      // Extract features
      const processingChunk = chunk.slice(0, this.chunkSize);
      const featureVector = extractFeaturesFromChunk(processingChunk, this.dspConfig);
      this.lastFeatureVector = featureVector;

      // Collect features for averaging
      this.collectedFeatures.push(featureVector);

      // Wait for minimum chunks before detection
      if (this.collectedFeatures.length < this.MIN_CHUNKS_FOR_DETECTION) {
        logger.debug(`📊 Collecting features: ${this.collectedFeatures.length}/${this.MIN_CHUNKS_FOR_DETECTION}`);
        return;
      }

      // Use the most recent feature vector for classification
      // (In future, could average multiple vectors for more stable detection)
      const detectionResult = classifyAcrossAllMachines(
        this.allMachines,
        featureVector,
        this.actualSampleRate
      );

      // Mark detection as complete
      this.detectionComplete = true;
      this.isProcessing = false;

      // Cleanup audio resources
      this.cleanup();
      this.hideListeningModal();

      // Handle result based on outcome
      this.handleDetectionResult(detectionResult);
    } catch (error) {
      logger.error('Chunk processing error:', error);
    }
  }

  /**
   * Handle the detection result and trigger appropriate callback
   */
  private handleDetectionResult(result: AutoDetectionResult): void {
    logger.info(`🔍 Detection result: ${result.outcome}`);

    switch (result.outcome) {
      case 'high_confidence':
        // Fall A: Machine recognized with high confidence
        if (result.bestMatch) {
          logger.info(`✅ Machine recognized: ${result.bestMatch.machine.name} (${result.bestMatch.similarity.toFixed(1)}%)`);
          this.callbacks.onMachineRecognized(result.bestMatch.machine, result);
        }
        break;

      case 'uncertain': {
        // Fall B: Uncertain match, show candidates to user
        const candidates = getTopCandidates(result);
        logger.info(`⚠️ Uncertain match. ${candidates.length} candidates above threshold`);
        this.callbacks.onUncertainMatch(candidates, result);
        break;
      }

      case 'no_match':
        // Fall C: No match found
        logger.info('❌ No matching machine found');
        this.callbacks.onNoMatch(result);
        break;
    }
  }

  /**
   * Show the "listening" modal during detection
   */
  private showListeningModal(): void {
    const modal = document.getElementById('auto-detect-modal');
    if (modal) {
      modal.style.display = 'flex';

      // Update subtitle
      const subtitle = document.getElementById('auto-detect-subtitle');
      if (subtitle) {
        subtitle.textContent = t('autoDetect.listening');
      }

      // Setup cancel button
      const cancelBtn = document.getElementById('auto-detect-cancel-btn');
      if (cancelBtn) {
        cancelBtn.onclick = () => this.cancel();
      }
    }
  }

  /**
   * Hide the listening modal
   */
  private hideListeningModal(): void {
    const modal = document.getElementById('auto-detect-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Update the listening status message
   */
  private updateListeningStatus(message: string, phase?: string): void {
    const subtitle = document.getElementById('auto-detect-subtitle');
    if (subtitle) {
      if (phase === 'recording') {
        subtitle.textContent = t('autoDetect.analyzing');
      } else if (phase === 'warmup') {
        subtitle.textContent = t('autoDetect.initializing');
      } else if (phase === 'waiting') {
        subtitle.textContent = t('autoDetect.waitingForSignal');
      } else {
        subtitle.textContent = message;
      }
    }

    // Update pulse animation state
    const pulseCircle = document.getElementById('auto-detect-pulse');
    if (pulseCircle) {
      if (phase === 'recording') {
        pulseCircle.classList.add('is-analyzing');
      } else {
        pulseCircle.classList.remove('is-analyzing');
      }
    }
  }

  /**
   * Cancel the detection process
   */
  public cancel(): void {
    logger.info('🚫 Auto-detection cancelled by user');
    this.cleanup();
    this.hideListeningModal();
    this.callbacks.onCancel();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isProcessing = false;
    this.isStarting = false;

    if (this.audioWorkletManager) {
      this.audioWorkletManager.cleanup();
      this.audioWorkletManager = null;
    }

    stopMediaStream(this.mediaStream);
    this.mediaStream = null;

    closeAudioContext(this.audioContext);
    this.audioContext = null;

    this.collectedFeatures = [];
    logger.debug('🧹 Auto-detection cleanup complete');
  }

  /**
   * Destroy the phase and release all resources
   */
  public destroy(): void {
    this.cleanup();
    this.hideListeningModal();
  }
}
