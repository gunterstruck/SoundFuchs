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
import { getEngine } from '@core/ml/engine/registry.js';
import { getEvaluationEngine, setEvaluationEngine } from '@utils/evaluationSettings.js';
import { assessNonStationarity } from '@core/ml/engine/engineRecommendation.js';
import { frameRmsSeries } from '@core/ml/engine/temporalCycle.js';
import { assessRecordingQuality } from '@core/ml/qualityCheck.js';
import { AudioVisualizer } from '@ui/components/AudioVisualizer.js';
import { getRawAudioStream, getSmartStartStatusMessage } from '@core/audio/audioHelper.js';
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';
import { notify } from '@utils/notifications.js';
import type { Machine, TrainingData, FeatureVector, QualityResult } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { BUTTON_TEXT } from '@ui/constants.js';
import { stopMediaStream, closeAudioContext } from '@utils/streamHelper.js';
import { t } from '../../i18n/index.js';
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
import {
  applyNoiseSubtraction,
  getNoiseSubtractionSettings,
  getActiveNoiseProfile,
} from '@core/dsp/noiseProfile.js';
import { PipelineStatusDashboard } from '@ui/components/PipelineStatus.js';
import { getViewLevel } from '@utils/viewLevelSettings.js';
import {
  getDriftSettings,
  computeRefLogResidualStd,
  calibrateAdaptiveThresholds,
  type RefDriftBaseline,
} from '@core/dsp/driftDetector.js';
import { promptReferenceAudioExport } from './referenceAudioExport.js';
import { showLabelTypeModal } from './referenceLabelModal.js';
import { setMeasurementActive } from '@utils/measurementActivity.js';

/**
 * Ein Normalzustand ist gespeichert.
 *
 * Der Anlass für den Fingerabdruck-Moment auf der Maschinenebene. Als
 * Dokument-Ereignis und nicht als weiterer Rückruf im Konstruktor: Zuhörer ist
 * die Schale, und die Referenzphase soll sie nicht kennenlernen müssen.
 */
export const NORMALZUSTAND_GESPEICHERT = 'zanobot:normalzustand-gespeichert';

/**
 * So viel Ton braucht ein Normalzustand mindestens.
 *
 * Bei 330 ms Fenster und 66 ms Vorschub sind 5 s rund 70–80 Ausschnitte —
 * genug, damit der Mittelwert steht. Mit 2 s waren es ~26, und das Modell
 * schwankte. Die Zahl gilt für beide Wege: Mikrofon wie mitgebrachte Datei.
 */
export const MINDESTDAUER_NORMALZUSTAND = 5.0;

/**
 * Was aus einem mitgebrachten Ton wurde.
 *
 * Mit Satz statt mit Fehlercode: Wer eine Datei mitbringt, steht in einem
 * Dialog, und dort muss stehen, was jetzt zu tun ist — nicht, was schiefging.
 */
export type NormalzustandBefund = { ok: true } | { ok: false; satz: string };

export class ReferencePhase {
  private machine: Machine | null;
  private selectedDeviceId: string | undefined; // Selected microphone device ID
  private onMachineUpdated: ((machine: Machine) => void) | null = null; // Callback when machine is updated
  private wasAutoCreated: boolean = false; // Track if machine was auto-created for zero-friction flow
  private isSavingReference: boolean = false; // Re-entry guard for the save button (training can take seconds)
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
  /** Force-Start-Timer (Audio-Trigger deaktiviert) — muss beim Smart-Start-Erfolg gecancelt werden. */
  private forceStartTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * True, solange processRecording() asynchron arbeitet. Verhindert, dass
   * parallele Stop-/Timer-Pfade cleanup() aufrufen und den AudioContext
   * unter dem laufenden Decoding wegziehen (Race: "Audio context not
   * initialized" / "createBuffer of null").
   */
  private isProcessingRecording: boolean = false;
  private smartStartWasUsed: boolean = false; // Track if Smart Start completed successfully

  /**
   * Kam der Ton aus einer Datei statt aus dem Mikrofon?
   *
   * Ein Merker und keine zweite Klasse: Die Verarbeitung ist dieselbe, das
   * Speichern ist dasselbe. Unterschiedlich ist nur, was schon entschieden
   * wurde — siehe `performReviewSave()`.
   */
  private ausMitgebrachterDatei: boolean = false;

  // Room Compensation: T60 estimate from chirp measurement
  private currentT60: T60Estimate | null = null;

  // Phase 2: Review Modal State
  private currentAudioBuffer: AudioBuffer | null = null;
  private currentFeatures: FeatureVector[] = [];
  private currentQualityResult: QualityResult | null = null;
  private currentTrainingData: TrainingData | null = null;

  // CRITICAL FIX: Store event listener reference for proper cleanup
  private recordButtonClickHandler: (() => void) | null = null;

  // Bugfix: Track if recording tip toast was already shown (once per recording)
  private recordingTipShown: boolean = false;

  // VISUAL POSITIONING: Reference image captured during recording
  private capturedReferenceImage: Blob | null = null;
  private reviewImageUrl: string | null = null;

  // Pipeline Status Dashboard (Expert mode, shows batch DSP results in review modal)
  private pipelineStatus: PipelineStatusDashboard | null = null;

  // Live signal quality tracking during reference recording
  private rmsHistory: number[] = [];
  private signalQualityVisible: boolean = false;
  private signalQualityInterval: ReturnType<typeof setInterval> | null = null;
  private signalAnalyser: AnalyserNode | null = null;
  private signalAnalyserData: Float32Array | null = null;
  private lastSignalLevel: 'good' | 'ok' | 'weak' | null = null;

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
      // Erst mit Zuhörer ein Angebot — dieselbe Begründung wie beim
      // Prüfknopf in `3-Diagnose.ts`.
      (recordBtn as HTMLButtonElement).disabled = false;
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

      // VISUAL POSITIONING: Capture a reference image only on the FIRST
      // reference recording for a machine. Subsequent recordings (good/bad)
      // reuse the existing image so the ghost overlay stays consistent.
      if (this.machine?.referenceImage) {
        logger.debug('📷 Machine already has a reference image – skipping camera');
        this.cameraStream = null;
      } else {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, // Prefer back camera on mobile
            audio: false,
          });
          logger.info('📷 Camera access granted for reference image');
        } catch (cameraError) {
          logger.warn('⚠️ Camera access denied – continuing without reference image', cameraError);
          notify.info(t('reference.recording.cameraNotAvailable'), {
            title: t('modals.cameraOptional'),
          });
          this.cameraStream = null;
        }
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
      if (
        roomSettings.enabled &&
        roomSettings.t60Enabled &&
        this.audioContext &&
        this.mediaStream
      ) {
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
            const statusElement =
              document.getElementById('recording-status') ||
              document.querySelector('.recording-status');
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

          // Wait for warmup duration, then skip to recording.
          // RACE-FIX: Timer-Handle merken — meldet der Smart Start in der
          // Zwischenzeit selbst ein Signal, wird dieser Timer gecancelt
          // (sonst starteten ZWEI Aufnahmen parallel).
          this.forceStartTimer = setTimeout(() => {
            this.forceStartTimer = null;
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
    setMeasurementActive(false); // recording over → PWA reload allowed again
    this.currentT60 = null;
    this.smartStartWasUsed = false; // Reset Smart Start flag for next recording
    this.recordingTipShown = false; // Reset tip flag for next recording

    // Clear timer interval to prevent memory leaks
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.forceStartTimer !== null) {
      clearTimeout(this.forceStartTimer);
      this.forceStartTimer = null;
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

    // Welle 1 UX: Reset countdown
    const countdownContainer = document.getElementById('recording-countdown-container');
    if (countdownContainer) countdownContainer.style.display = 'none';
    const countdownBarFill = document.getElementById('recording-countdown-bar-fill');
    if (countdownBarFill) countdownBarFill.style.width = '0%';
    const fallbackTimer = document.getElementById('recording-timer');
    if (fallbackTimer) fallbackTimer.style.display = '';

    // Reset live signal quality indicator
    this.stopSignalQualityMonitor();

    logger.debug('🧹 Reference phase cleanup complete');
  }

  /**
   * Start the live signal quality monitor during reference recording.
   * Creates an AnalyserNode on the AudioContext to read RMS in real-time.
   */
  private startSignalQualityMonitor(): void {
    if (!this.audioContext || !this.mediaStream) return;

    // Create analyser for RMS measurement
    this.signalAnalyser = this.audioContext.createAnalyser();
    this.signalAnalyser.fftSize = 2048;
    this.signalAnalyser.smoothingTimeConstant = 0;
    this.signalAnalyserData = new Float32Array(this.signalAnalyser.fftSize);

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.signalAnalyser);

    // Reset state
    this.rmsHistory = [];
    this.lastSignalLevel = null;

    // Show the bar immediately
    const container = document.getElementById('ref-signal-quality');
    if (container) {
      container.style.display = 'block';
      this.signalQualityVisible = true;
    }

    // Poll every 300ms to compute RMS and update UI
    this.signalQualityInterval = setInterval(() => {
      if (!this.signalAnalyser || !this.signalAnalyserData) return;
      this.signalAnalyser.getFloatTimeDomainData(
        this.signalAnalyserData as Float32Array<ArrayBuffer>
      );

      // Compute RMS from raw time-domain samples
      let sumSq = 0;
      for (let i = 0; i < this.signalAnalyserData.length; i++) {
        sumSq += this.signalAnalyserData[i] * this.signalAnalyserData[i];
      }
      const rms = Math.sqrt(sumSq / this.signalAnalyserData.length);
      this.updateSignalQuality(rms);
    }, 300);
  }

  /**
   * Stop the live signal quality monitor and hide the bar.
   */
  private stopSignalQualityMonitor(): void {
    if (this.signalQualityInterval !== null) {
      clearInterval(this.signalQualityInterval);
      this.signalQualityInterval = null;
    }
    if (this.signalAnalyser) {
      this.signalAnalyser.disconnect();
      this.signalAnalyser = null;
    }
    this.signalAnalyserData = null;
    this.rmsHistory = [];
    this.lastSignalLevel = null;
    this.signalQualityVisible = false;

    const container = document.getElementById('ref-signal-quality');
    if (container) container.style.display = 'none';
  }

  /**
   * Update the live signal quality indicator based on current RMS amplitude.
   *
   * Uses a rolling median of recent RMS values (last ~3s) to avoid flickering.
   * Thresholds aligned with qualityCheck.ts QUALITY_THRESHOLDS:
   *   - RMS < 0.01 (RMS_CRITICAL) → weak/red
   *   - RMS 0.01–0.02 (RMS_WARNING range) → ok/yellow
   *   - RMS >= 0.02 → good/green
   */
  private updateSignalQuality(rmsAmplitude: number): void {
    // Rolling window of ~3 seconds (~9 chunks at 300ms)
    this.rmsHistory.push(rmsAmplitude);
    if (this.rmsHistory.length > 9) {
      this.rmsHistory.shift();
    }

    // Median for stability
    const sorted = [...this.rmsHistory].sort((a, b) => a - b);
    const medianRms = sorted[Math.floor(sorted.length / 2)];

    // Logarithmic scale: 0.005 → ~0%, 0.01 → ~30%, 0.02 → ~60%, 0.05+ → ~100%
    const minRms = 0.005;
    const maxRms = 0.05;
    const clamped = Math.max(minRms, Math.min(maxRms, medianRms));
    const percent = Math.round(
      ((Math.log(clamped) - Math.log(minRms)) / (Math.log(maxRms) - Math.log(minRms))) * 100
    );

    let level: 'good' | 'ok' | 'weak';
    if (percent >= 60) {
      level = 'good';
    } else if (percent >= 30) {
      level = 'ok';
    } else {
      level = 'weak';
    }

    // Skip DOM update if level hasn't changed (performance optimisation)
    if (level === this.lastSignalLevel) return;
    this.lastSignalLevel = level;

    const container = document.getElementById('ref-signal-quality');
    const fill = document.getElementById('ref-signal-fill');
    const status = document.getElementById('ref-signal-status');
    const hint = document.getElementById('ref-signal-hint');
    if (!container || !fill || !status) return;

    fill.style.width = `${percent}%`;
    fill.className = `signal-quality-fill level-${level}`;

    const statusText =
      level === 'good'
        ? t('reference.signalQuality.good')
        : level === 'ok'
          ? t('reference.signalQuality.ok')
          : t('reference.signalQuality.weak');
    status.textContent = statusText;
    status.className = `signal-quality-status status-${level}`;

    container.setAttribute('aria-label', `${t('reference.signalQuality.label')}: ${statusText}`);

    if (hint) {
      if (level === 'ok') {
        hint.textContent = t('reference.signalQuality.hintCloser');
        hint.style.display = 'block';
      } else if (level === 'weak') {
        hint.textContent = t('reference.signalQuality.hintTooWeak');
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
    }
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

    // RACE-FIX: Smart-Start-Erfolg UND Force-Start-Timeout können beide
    // feuern (fast zeitgleich am Warmup-Ende). Ohne Guard entstehen ZWEI
    // MediaRecorder mit ZWEI Auto-Stop-Timern — der zweite Timer räumte dann
    // mitten in processRecording() den AudioContext ab. Der zweite Trigger
    // ist ab jetzt ein No-Op.
    if (this.isRecordingActive) {
      logger.warn('⚠️ Doppelter Aufnahme-Start ignoriert (Smart-Start + Force-Start-Race)');
      return;
    }
    if (this.forceStartTimer !== null) {
      clearTimeout(this.forceStartTimer);
      this.forceStartTimer = null;
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
    setMeasurementActive(true); // block PWA reload while recording

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.processRecording().catch((error) => {
        logger.error('Unhandled error in processRecording:', error);
        this.showRecordingFailedToast(error as Error);
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

      // RACE-FIX: nie zwei Auto-Stop-Timer parallel
      if (this.autoStopTimer !== null) clearTimeout(this.autoStopTimer);
      this.autoStopTimer = setTimeout(() => {
        this.autoStopTimer = null;
        this.stopRecording();
      }, totalDuration * 1000);

      // VISUAL POSITIONING: Capture reference image at midpoint of recording
      // Calculate snapshot time: halfway through the actual recording (after warmup)
      const warmupPhase = this.smartStartWasUsed ? 0 : this.warmUpDuration;
      const snapshotDelay = warmupPhase * 1000 + (this.recordingDuration * 1000) / 2;

      setTimeout(() => {
        this.captureReferenceSnapshot();
      }, snapshotDelay);

      // Start live signal quality monitoring
      this.startSignalQualityMonitor();
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

    // RACE-FIX: Läuft die Verarbeitung bereits (Recorder gestoppt, Decoding
    // aktiv), darf hier NICHT aufgeräumt werden — cleanup() würde den
    // AudioContext unter processRecording() wegziehen. Das Processing
    // räumt am Ende selbst auf.
    if (this.isProcessingRecording) {
      logger.debug('stopRecording: Verarbeitung läuft — kein Cleanup aus dem Stop-Pfad');
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
    this.isProcessingRecording = true;
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
      const MIN_TRAINING_DURATION = MINDESTDAUER_NORMALZUSTAND;
      const minTrainingSamples = Math.floor(MIN_TRAINING_DURATION * sampleRate);

      if (trainingSamples <= 0) {
        throw new Error(
          t('reference.errors.recordingTooShort', {
            duration: audioBuffer.duration.toFixed(2),
            warmup: this.warmUpDuration,
            minDuration: (this.warmUpDuration + MIN_TRAINING_DURATION).toFixed(1),
          })
        );
      }

      if (trainingSamples < minTrainingSamples) {
        throw new Error(
          t('reference.errors.trainingDataTooShort', {
            duration: (trainingSamples / sampleRate).toFixed(2),
            minDuration: MIN_TRAINING_DURATION,
            totalMinDuration: (this.warmUpDuration + MIN_TRAINING_DURATION).toFixed(1),
          })
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

      /**
       * Ab hier ist es einerlei, woher der Ton kam.
       *
       * Alles Folgende — Merkmale, Kirschen, Rauschabzug, Raumausgleich,
       * Umgebungsdaten — kennt nur noch ein Stück Ton und seine Abtastrate.
       * Deshalb steht es in einer eigenen Methode: Eine mitgebrachte Datei geht
       * durch **dieselbe** Verarbeitung. Eine zweite Fassung wäre eine zweite
       * Wahrheit darüber, was ein Normalzustand ist.
       */
      const qualityResult = this.bereiteNormalzustandVor(
        audioBuffer,
        trainingBuffer,
        this.audioContext.sampleRate
      );

      // Cleanup resources now that processing is complete
      // This releases AudioContext, MediaStream, timer, etc.
      this.cleanup();

      // Hide recording modal
      this.hideRecordingModal();

      /**
       * Eine gute Aufnahme speichert sich selbst.
       *
       * Bis zum 17.08.2026 kam hier immer das Bestätigungsfenster: Anhören,
       * Qualität ansehen, „Speichern" drücken. Bei einer guten Aufnahme ist
       * das eine Frage, deren Antwort schon feststeht — und sie steht genau an
       * der Stelle, an der der erste Erfolg gefeiert werden sollte.
       *
       * Gefragt wird jetzt nur noch, wenn es etwas zu entscheiden gibt: bei
       * `BAD` taugt die Aufnahme nicht zum Vergleichen, und dann muss der
       * Nutzer wissen, warum, und wiederholen können. `OK` speichert mit —
       * eine brauchbare Referenz ist besser als keine, und der Hinweis darauf
       * steht in der Meldung.
       *
       * Der Ausweg bleibt: Wer die gespeicherte Referenz doch nicht will,
       * nimmt eine neue auf; die alte wird dabei ersetzt.
       */
      if (qualityResult.rating === 'BAD') {
        this.showReviewModal();
      } else {
        await this.performReviewSave();
      }
    } catch (error) {
      logger.error('Processing error:', error);
      this.showRecordingFailedToast(error as Error);

      // Cleanup on error
      this.cleanup();

      this.hideRecordingModal();
    } finally {
      this.isProcessingRecording = false;
    }
  }

  /**
   * AUS EINEM STÜCK TON EINEN NORMALZUSTAND VORBEREITEN
   *
   * Die gemeinsame Mitte zweier Wege: der Aufnahme am Mikrofon und der
   * mitgebrachten Datei. Sie unterscheiden sich davor — die Aufnahme muss ihre
   * Anlaufzeit abschneiden, die Datei hat keine — und danach nicht mehr.
   *
   * Gespeichert wird hier noch nichts; das tut `performReviewSave()`.
   *
   * @param ganzerTon Was aufbewahrt und später abgespielt wird.
   * @param trainingBuffer Woraus die Merkmale gezogen werden.
   * @param abtastrate Die Rate, mit der die Prüfung später rechnen wird.
   * @returns Wie gut das Stück ist — daran hängt, ob gefragt oder gespeichert wird.
   */
  private bereiteNormalzustandVor(
    ganzerTon: AudioBuffer,
    trainingBuffer: AudioBuffer,
    abtastrate: number
  ): QualityResult {
    // CRITICAL FIX: Create DSP config with actual sample rate from AudioContext
    // This ensures training features match diagnosis features even if browser uses different sample rate
    const actualSampleRate = abtastrate;
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
      logger.info(
        `🍒 Cherry-Picking: ${cpResult.removedCount}/${cpResult.totalCount} Frames verworfen`
      );
      if (cpResult.removedCount > 0) {
        logger.info(`   Entfernte Indizes: [${cpResult.removedIndices.join(', ')}]`);
        logger.info(
          `   Energie-Schwellen: [${cpResult.energyStats.threshold[0].toFixed(4)}, ${cpResult.energyStats.threshold[1].toFixed(4)}]`
        );
        logger.info(
          `   Entropie-Schwellen: [${cpResult.entropyStats.threshold[0].toFixed(4)}, ${cpResult.entropyStats.threshold[1].toFixed(4)}]`
        );
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

    // Noise Profile Subtraction (Pipeline-Stufe 1.5): additive Störungen zuerst.
    // Nützlich, wenn die Referenz selbst in lauter Umgebung erstellt wird
    // (Einlernen beim Kunden statt im Werk). Bei inkompatiblem Profil gibt
    // applyNoiseSubtraction den Input unverändert zurück (Pass-Through).
    const noiseSubSettings = getNoiseSubtractionSettings();
    const activeNoiseProfile = noiseSubSettings.enabled ? getActiveNoiseProfile() : null;
    const noiseSubtractedFeatures = activeNoiseProfile
      ? applyNoiseSubtraction(cherryPickedFeatures, activeNoiseProfile, noiseSubSettings)
      : cherryPickedFeatures;
    const noiseSubApplied = noiseSubtractedFeatures !== cherryPickedFeatures;

    // Room Compensation: Apply T60 subtraction + optional CMN (Pipeline-Stufe 3.5)
    // IMPORTANT: Quality assessment uses cherry-picked features; training uses compensated features.
    // NOTE: During reference creation, Bias-Match is not applicable (no prior reference exists).
    //       Only T60 subtraction is meaningful here. CMN is off by default.
    const roomCompSettings = getRoomCompSettings();
    const processedFeatures = roomCompSettings.enabled
      ? applyRoomCompensation(
          noiseSubtractedFeatures,
          roomCompSettings,
          this.currentT60 ?? undefined,
          undefined
        )
      : noiseSubtractedFeatures;

    // Pipeline Status Dashboard: Prepare for review modal (Expert mode only)
    if (this.pipelineStatus) {
      this.pipelineStatus.destroy();
      this.pipelineStatus = null;
    }
    const currentViewLevel = getViewLevel();
    if (
      currentViewLevel === 'expert' &&
      (cherryPickSettings.enabled || roomCompSettings.enabled || noiseSubApplied)
    ) {
      this.pipelineStatus = new PipelineStatusDashboard();
      this.pipelineStatus.loadFromSettings(
        cherryPickSettings.enabled,
        roomCompSettings.enabled,
        roomCompSettings.cmnEnabled,
        roomCompSettings.t60Enabled,
        cherryPickSettings.sigmaThreshold,
        roomCompSettings.beta,
        roomCompSettings.biasMatchEnabled,
        noiseSubApplied,
        activeNoiseProfile?.name ?? ''
      );

      if (cherryPickSettings.enabled) {
        this.pipelineStatus.setCherryPickBatchResult(cpTotalCount, cpRemovedCount);
      }

      if (noiseSubApplied) {
        this.pipelineStatus.setNoiseSubStatus(true, activeNoiseProfile?.name ?? '', true);
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
    const residualStd = computeRefLogResidualStd(
      processedFeatures,
      refLogMeanArr,
      driftSettings.smoothWindow
    );
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
    this.currentRefT60Classification =
      this.currentRefT60 !== null ? classifyT60Value(this.currentRefT60) : null;

    if (this.currentRefT60 !== null) {
      logger.info(
        `🔊 Reference environment: T60 = ${this.currentRefT60.toFixed(2)}s (${this.currentRefT60Classification})`
      );
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
    this.currentAudioBuffer = ganzerTon;
    this.currentFeatures = processedFeatures;
    this.currentQualityResult = qualityResult;
    this.currentTrainingData = trainingData;
    return qualityResult;
  }

  /**
   * EINEN MITGEBRACHTEN TON ZUM NORMALZUSTAND MACHEN
   *
   * Der Auftraggeber: „Dann kann man sein Auto heute filmen und in vier Wochen
   * vergleichen." Das ist der Schritt, der dem mitgebrachten Video seinen
   * vollen Wert gibt — ohne ihn ist ein Film ein einmaliger Blick, mit ihm ist
   * er der Maßstab für alles, was danach kommt.
   *
   * ## Warum es DERSELBE Weg ist
   *
   * Der Ton geht durch `bereiteNormalzustandVor()` und `performReviewSave()` —
   * dieselben Methoden, die die Mikrofonaufnahme benutzt. Ein eigener
   * Speicherweg für Dateien wäre ein zweiter Normalzustand-Begriff, und beim
   * nächsten Umbau einer davon veraltet.
   *
   * Zwei Dinge entfallen, weil sie zur Aufnahme gehören und nicht zum Ton:
   * die **Anlaufzeit** (eine Datei hat keine OS-Filter, die sich einschwingen
   * müssen) und der **Raum-T60** (er wurde nicht gemessen; `null` ist die
   * ehrliche Angabe).
   *
   * ## Warum die Abtastrate von selbst passt
   *
   * `decodeAudioData` rechnet die Datei auf die Rate des AudioContext um, und
   * das ist dieselbe Standardrate, mit der die Prüfung später aufnimmt. Der
   * Ton kommt also schon in der Rate an, in der er verglichen wird.
   *
   * ## Warum ein schlechtes Stück hier NICHT gespeichert wird
   *
   * Bei der Aufnahme darf ein `BAD`-Stück nach Rückfrage bleiben — der Nutzer
   * steht an der Maschine, und eine brauchbare Referenz ist besser als keine.
   * Bei einer Datei ist das anders: Eine andere Stelle im selben Film kostet
   * einen Zug am Regler. Ein schlechter Maßstab wäre vier Wochen lang der
   * Maßstab.
   */
  public async normalzustandAusTon(ton: AudioBuffer): Promise<NormalzustandBefund> {
    if (ton.duration < MINDESTDAUER_NORMALZUSTAND) {
      return {
        ok: false,
        satz: t('mitbringen.normalZuKurz', {
          dauer: ton.duration.toFixed(1),
          mindest: String(MINDESTDAUER_NORMALZUSTAND),
        }),
      };
    }

    this.ausMitgebrachterDatei = true;
    try {
      // Kein T60 aus einer Datei: Es gibt keinen Chirp und keinen Raum, den
      // man gemessen hätte. Ein geschätzter Wert wäre eine Behauptung.
      this.currentT60 = null;
      const guete = this.bereiteNormalzustandVor(ton, ton, ton.sampleRate);

      if (guete.rating === 'BAD') {
        const gruende = guete.issues.length
          ? guete.issues.join(' · ')
          : t('mitbringen.normalOhneGrund');
        logger.info(`📄 Mitgebrachte Datei taugt nicht als Normalzustand: ${gruende}`);
        return { ok: false, satz: t('mitbringen.normalTaugtNicht', { gruende }) };
      }

      const gespeichert = await this.performReviewSave();
      return gespeichert ? { ok: true } : { ok: false, satz: t('mitbringen.normalGingNicht') };
    } catch (fehler) {
      logger.error('Normalzustand aus Datei fehlgeschlagen:', fehler);
      return { ok: false, satz: t('mitbringen.normalGingNicht') };
    } finally {
      this.ausMitgebrachterDatei = false;
      this.currentAudioBuffer = null;
      this.currentFeatures = [];
      this.currentQualityResult = null;
      this.currentTrainingData = null;
    }
  }

  /**
   * UX: Fehlgeschlagene Aufnahme menschlich melden — mit Erneut-versuchen-
   * Button direkt im Toast statt rohem Exception-Text. Die technischen
   * Details stehen im Log (und der Fehler ist mit dem Race-Fix oben
   * ohnehin die absolute Ausnahme).
   */
  private showRecordingFailedToast(error: Error): void {
    logger.error('Aufnahme fehlgeschlagen:', error);
    notify.error(t('reference.recording.failedFriendly'), undefined, {
      title: t('modals.processingError'),
      duration: 0,
      actions: [
        {
          label: t('reference.recording.retryAction'),
          onClick: () => {
            void this.startRecording();
          },
        },
      ],
    });
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
    } else if (
      modalTitle &&
      message.includes(t('reference.recording.waitingForSignal').split(' ')[0])
    ) {
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

    // Sprint 1 UX: Show reference explanation as toast notification
    notify.info(t('reference.explainBefore'), { duration: 4000 });

    // Add status message
    const modalBody = document.querySelector('#recording-modal .modal-body');
    if (modalBody && !document.getElementById('recording-status')) {
      const statusDiv = document.createElement('div');
      statusDiv.id = 'recording-status';
      statusDiv.className = 'recording-status';
      statusDiv.textContent = t('common.initializing');
      const visualizerContainer = modalBody.querySelector('#visualizer-container');
      if (visualizerContainer) {
        visualizerContainer.insertAdjacentElement('afterend', statusDiv);
      } else {
        modalBody.insertBefore(statusDiv, modalBody.firstChild);
      }
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
        const remaining = Math.max(0, recordingTotal - recordingElapsed);

        if (statusElement) {
          statusElement.textContent = `${t('reference.recording.recording')}...`;
        }

        // Welle 1 UX: Show countdown during recording phase
        const countdownContainer = document.getElementById('recording-countdown-container');
        const countdownNumber = document.getElementById('recording-countdown-number');
        const countdownBarFill = document.getElementById('recording-countdown-bar-fill');

        if (countdownContainer && countdownNumber && countdownBarFill) {
          // Show countdown, hide MM:SS timer
          countdownContainer.style.display = 'flex';
          if (timerElement) timerElement.style.display = 'none';

          // Bugfix: Show recording tip as toast (once per recording)
          if (!this.recordingTipShown) {
            notify.info(t('reference.recording.countdownTip'), {
              duration: 5000,
            });
            this.recordingTipShown = true;
          }

          // Update countdown number with tick animation
          countdownNumber.textContent = String(remaining);
          countdownNumber.classList.add('countdown-tick');
          setTimeout(() => countdownNumber.classList.remove('countdown-tick'), 150);

          // Update progress bar
          const progress = (recordingElapsed / recordingTotal) * 100;
          countdownBarFill.style.width = `${Math.min(100, progress)}%`;
        } else if (timerElement) {
          // Fallback: show MM:SS timer if countdown elements not found
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
      notify.error(
        t('reference.recording.processingFailed'),
        new Error('Review modal not found in DOM'),
        {
          title: t('modals.processingError'),
          duration: 0,
        }
      );
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
      notify.error(
        t('reference.recording.processingFailed'),
        new Error('Audio player element not found in DOM'),
        {
          title: t('modals.processingError'),
          duration: 0,
        }
      );
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
    const imageElement = document.getElementById(
      'review-reference-image'
    ) as HTMLImageElement | null;

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

    // Mount Pipeline Status Dashboard at end of modal-body (Expert mode)
    if (this.pipelineStatus) {
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody) {
        this.pipelineStatus.mount(modalBody as HTMLElement);
        this.pipelineStatus.show();
      }
    }

    // Show modal
    modal.style.display = 'flex';

    // Scroll-Indikator: Fade-Out ausblenden wenn am Ende gescrollt
    const shellContent = modal.querySelector('.shell-content');
    if (shellContent) {
      const checkScroll = () => {
        const el = shellContent as HTMLElement;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
        const hasOverflow = el.scrollHeight > el.clientHeight + 10;
        el.classList.toggle('scrolled-to-bottom', !hasOverflow || isAtBottom);
      };

      shellContent.addEventListener('scroll', checkScroll, { passive: true });
      requestAnimationFrame(checkScroll);
    }

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
    const imageElement = document.getElementById(
      'review-reference-image'
    ) as HTMLImageElement | null;
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
  /**
   * Save-button entry point. Guards against re-entry and gives immediate visual
   * feedback: training (especially YAMNet: TF.js + model load) can take a few
   * seconds, during which the button must not look idle — otherwise users tap
   * again and again, queueing several train+save passes for the same recording.
   */
  private async handleReviewSave(): Promise<void> {
    if (this.isSavingReference) {
      logger.info('Save already in progress — ignoring duplicate tap');
      return;
    }
    this.isSavingReference = true;

    const saveBtn = document.getElementById('review-save-btn') as HTMLButtonElement | null;
    const previousHtml = saveBtn ? saveBtn.innerHTML : null;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('is-busy');
      saveBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span> ${t('common.saving')}`;
    }

    try {
      await this.performReviewSave();
    } finally {
      this.isSavingReference = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('is-busy');
        if (previousHtml !== null) saveBtn.innerHTML = previousHtml;
      }
    }
  }

  private async performReviewSave(): Promise<boolean> {
    const { getMachine, saveMachine, createAutoMachine, getNextAutoMachineNumber } =
      await import('@data/db.js');

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
          title: t('common.error'),
          duration: 0,
        });
        return false;
      }
    } else {
      // Machine exists - fetch latest from DB
      const existingMachine = await getMachine(this.machine.id);
      if (!existingMachine) {
        logger.error(`Cannot save: machine not found (${this.machine.id})`);
        notify.error(t('reference.errors.machineDataMissing'), new Error('Machine not found'), {
          title: t('common.error'),
          duration: 0,
        });
        return false;
      }
      machineToUpdate = existingMachine;
      this.machine = existingMachine;
    }

    if (!this.currentTrainingData || !this.currentQualityResult) {
      logger.error('Cannot save: missing training data or quality result');
      notify.error(
        t('reference.recording.processingFailed'),
        new Error('Missing training data or quality result'),
        {
          title: t('modals.processingError'),
          duration: 0,
        }
      );
      return false;
    }

    // PHASE 2 REQUIREMENT: Block BAD quality recordings with very low scores
    if (this.currentQualityResult.rating === 'BAD' && this.currentQualityResult.score < 30) {
      logger.error('Recording quality too low for training - blocking save');
      notify.error(
        t('reference.errors.qualityTooLow', {
          issues: this.currentQualityResult.issues.map((issue) => `• ${issue}`).join('\n'),
        }),
        new Error('Quality too low'),
        { duration: 0 }
      );
      return false;
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
      return false;
    }

    // PHASE 2 REQUIREMENT: Show extra confirmation for BAD quality (score >= 30%)
    // This runs ONLY if not blocked by magnitude check above
    if (this.currentQualityResult.rating === 'BAD') {
      const confirmed = confirm(
        t('reference.errors.qualityWarning', {
          issues: this.currentQualityResult.issues.map((issue) => `• ${issue}`).join('\n'),
        })
      );

      if (!confirmed) {
        logger.info('User cancelled save due to bad quality warning');
        return false;
      }
    }

    try {
      // MULTICLASS: Determine label and type based on number of existing models
      let label: string;
      let type: 'healthy' | 'faulty';

      // CRITICAL FIX: Store local reference to prevent race conditions
      // Use machineToUpdate (freshly fetched or just created) for consistency
      const existingModels = machineToUpdate.referenceModels || [];

      /**
       * Eine mitgebrachte Datei wird IMMER der Normalzustand — und ersetzt den
       * bisherigen.
       *
       * Nicht aus Bequemlichkeit, sondern weil im Vorschau-Dialog genau das
       * gefragt wurde: „Diese Datei ersetzt den bisherigen Normalzustand." Wer
       * dort zugestimmt hat, hat entschieden; ihn hier ein zweites Mal nach
       * einem Namen und nach „gesund oder defekt" zu fragen wäre dieselbe Frage
       * in anderen Worten — und legte einen ZWEITEN Zustand an, statt den einen
       * zu ersetzen.
       *
       * Ersetzt wird das Modell, das die App selbst für „den" Normalzustand
       * hält: `label === 'Baseline'`, sonst das erste. Dieselbe Regel, nach der
       * Geisterbild, Iris und Reihenvergleich es suchen — eine zweite Regel
       * hier wäre irgendwann eine andere Antwort.
       *
       * Frühere Prüfungen bleiben unberührt: Sie liegen als eigene Einträge in
       * der Ablage, nicht in diesem Modell.
       */
      if (this.ausMitgebrachterDatei && existingModels.length > 0) {
        const bisher = existingModels.find((m) => m.label === 'Baseline') ?? existingModels[0];
        machineToUpdate.referenceModels = existingModels.filter((m) => m !== bisher);
        label = 'Baseline';
        type = 'healthy';
        logger.info('🗂️ Mitgebrachte Datei ersetzt den bisherigen Normalzustand');
      } else if (existingModels.length === 0) {
        // First recording: Always baseline (healthy state) - SILENT, no user interaction
        // CRITICAL FIX: Store the literal 'Baseline' marker (not the translated display
        // text) - this is the sentinel that find(m => m.label === 'Baseline') lookups
        // throughout the app rely on to pick "the" reference for ghost overlay, iris
        // fingerprint and fleet comparison. Storing the translated word here meant that
        // sentinel never matched, silently falling back to referenceModels[0] instead.
        label = 'Baseline';
        type = 'healthy';
        logger.info(`🎯 Zero-friction: First recording - using label: "${label}", type: "healthy"`);
      } else {
        // Additional recordings: Ask user for label and type via a custom
        // in-app modal. CRITICAL FIX: window.prompt()/confirm() are silently
        // suppressed in installed/standalone PWAs on Android (no dialog is
        // ever shown, the call just returns null/false immediately), which
        // made this step always fail with "no label provided". A real modal
        // works reliably everywhere.
        const choice = await showLabelTypeModal();

        if (!choice) {
          logger.info('User cancelled - no label provided');
          return false;
        }

        label = choice.label;
        type = choice.type;
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

      // Train the reference model using the selected evaluation engine.
      // GMIA stays the default; for GMIA this calls trainGMIA() plus the same
      // baseline self-test as before (unchanged behavior). Diagnosis later
      // dispatches by the model's own engineId, so existing machines that were
      // trained with a different engine are unaffected by this setting.
      const evaluationEngineId = getEvaluationEngine();
      const engine = getEngine(evaluationEngineId);
      logger.info(`🧠 Training reference model with engine "${evaluationEngineId}"...`);

      // Raw reference audio (for embedding engines like YAMNet). Sync engines
      // (GMIA, spectral-cosine) ignore it; `await` resolves immediately for them.
      // IMPORTANT: the raw samples come straight from the AudioBuffer, so the
      // sample rate that matters for resampling is the buffer's OWN sampleRate
      // (the actual hardware rate), not config.sampleRate (the requested/target
      // rate, which the browser may not have honored). Passing the wrong rate
      // would mis-resample the reference to 16 kHz and corrupt every embedding.
      const rawBuffer = this.currentAudioBuffer
        ? this.currentAudioBuffer.getChannelData(0)
        : undefined;
      const rawSampleRate = this.currentAudioBuffer
        ? this.currentAudioBuffer.sampleRate
        : this.currentTrainingData.config.sampleRate;
      const model = await engine.train(
        {
          trainingData: this.currentTrainingData,
          rawBuffer,
          sampleRate: rawSampleRate,
        },
        this.machine.id
      );

      logger.info('✅ Model trained successfully');

      // ============================================================================
      // QUALITY GATE: Baseline self-recognition score
      // ============================================================================
      // Every engine reports a baselineScore (mean self-recognition over its own
      // training data). For GMIA this is the historical baseline calibration; for
      // spectral-cosine it is the mean self-score of the fitted similarity→score curve.
      // If it is too low, the recording is too noisy/unstable to be a reliable
      // reference and we reject it.
      // ============================================================================
      const baselineScore = model.baselineScore ?? 0;
      logger.info(`✅ Baseline Score: ${baselineScore.toFixed(1)}%`);

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
        return false;
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
        logger.info(
          `📍 Reference environment saved: T60 = ${this.currentRefT60.toFixed(2)}s (${this.currentRefT60Classification})`
        );
      }

      await saveMachine(machineToUpdate);

      // Persist the reference audio so it can be played back for the A/B
      // "hear the difference" comparison on the diagnosis result screen.
      // Additive and failure-tolerant – a storage error must not break
      // reference creation. (Stores the full reference recording.)
      if (this.currentAudioBuffer) {
        try {
          const { saveRecording } = await import('@data/db.js');
          await saveRecording({
            id: `rec-${this.machine.id}-${Date.now()}`,
            machineId: this.machine.id,
            type: 'reference',
            audioBuffer: this.currentAudioBuffer,
            timestamp: Date.now(),
            duration: this.currentAudioBuffer.duration,
            sampleRate: this.currentAudioBuffer.sampleRate,
          });
          logger.info('🎧 Reference audio stored for A/B comparison');
        } catch (error) {
          logger.warn('Could not store reference audio:', error);
        }
      }

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

      /**
       * Der Normalzustand steht — und das ist der erste Wow-Moment.
       *
       * Gemeldet und nicht selbst gezeigt: Diese Datei weiß, dass gespeichert
       * wurde; sie weiß nicht, wo der Nutzer gerade steht. Die Maschinenebene
       * weiß das und zeigt den akustischen Fingerabdruck. Wer die Ebene nicht
       * benutzt, für den kostet die Zeile nichts.
       */
      document.dispatchEvent(
        new CustomEvent<{ machineId: string }>(NORMALZUSTAND_GESPEICHERT, {
          detail: { machineId: machineToUpdate.id },
        })
      );

      // Sprint 1 UX: Enhanced success confirmation toast
      notify.success(t('reference.savedSuccess'), {
        title: t('reference.savedTitle'),
        duration: 5000,
      });

      // T2-a3 (§7 Auto-Empfehlung): Referenz mit Mittelwert-Engine trainiert,
      // aber die Aufnahme klingt nicht-stationär (Pegel bewegt sich, klarer
      // Takt oder stabile Periodizität)? Dann Hinweis auf die Zeitmuster-
      // Engine — EIN Tap schaltet die Engine für NEUE Referenzen um.
      // Erkennen, nicht übernehmen: der Nutzer entscheidet.
      this.maybeRecommendTemporalEngine(evaluationEngineId, rawBuffer, rawSampleRate);

      // ZERO-FRICTION: Show simple success toast with edit option for auto-created machines
      if (this.wasAutoCreated) {
        this.showZeroFrictionSuccess(updatedMachine);
      } else if (this.recordedBlob) {
        // Show success with option to download reference audio
        //
        // Nur, wenn es überhaupt eine Aufnahmedatei gibt. Eine mitgebrachte
        // Datei liegt schon auf dem Gerät — die Frage „Möchtest du sie
        // herunterladen?" böte dem Nutzer seine eigene Datei an, und ohne Blob
        // hätte ein „Ja" gar keine Antwort.
        promptReferenceAudioExport(this.recordedBlob, this.machine);
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
      return false;
    }

    return true;
  }

  /**
   * T2-a3 (Konzept §7): Auto-Empfehlung stationär/instationär.
   *
   * Nach erfolgreichem Anlernen mit einer Mittelwert-Engine wird die
   * Aufnahme auf Nicht-Stationarität geprüft (CV der Frame-Energien,
   * Onset-Dichte, Periodizität). Trifft eines zu, erscheint ein Hinweis-
   * Toast mit Ein-Tap-Umschaltung der Engine für NEUE Referenzen.
   * Bewusst fehler-tolerant: eine Ausnahme hier darf das Speichern der
   * Referenz nie beeinträchtigen.
   */
  private maybeRecommendTemporalEngine(
    engineId: string,
    rawBuffer: Float32Array | undefined,
    rawSampleRate: number
  ): void {
    try {
      if (engineId === 'temporal' || !this.currentTrainingData) return;

      const config = this.currentTrainingData.config;
      const frameRms = rawBuffer
        ? frameRmsSeries(rawBuffer, config.windowSize, config.hopSize, rawSampleRate)
        : undefined;
      const assessment = assessNonStationarity(
        this.currentTrainingData.featureVectors,
        frameRms,
        config.hopSize
      );
      if (!assessment.recommendTemporal) return;

      logger.info(
        `💡 Nicht-stationäre Referenz erkannt (CV=${assessment.energyCv.toFixed(2)}, ` +
          `Ereignisse=${assessment.eventRatePerMin.toFixed(0)}/min, ` +
          `Zyklus=${assessment.cyclePeriodSec?.toFixed(2) ?? '–'}s) — empfehle Zeitmuster-Engine`
      );
      notify.info(t('temporalEvents.recommendBody'), {
        title: t('temporalEvents.recommendTitle'),
        duration: 15000,
        actions: [
          {
            label: t('temporalEvents.recommendAction'),
            onClick: () => {
              setEvaluationEngine('temporal');
              notify.success(t('temporalEvents.recommendSwitched'));
            },
          },
        ],
      });
    } catch (error) {
      logger.warn('Engine-Empfehlung übersprungen:', error);
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

    // Ohne Zuhörer kein Angebot.
    const stummerKnopf = document.getElementById('record-btn');
    if (stummerKnopf) (stummerKnopf as HTMLButtonElement).disabled = true;

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
