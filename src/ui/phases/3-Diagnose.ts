/**
 * ZANOBOT - PHASE 3: DIAGNOSE (REAL-TIME)
 *
 * Real-time operation mode with live feedback loop.
 *
 * Flow:
 * 1. Stream audio continuously
 * 2. Process in 330ms chunks (3-4x per second)
 * 3. Extract features → GMIA inference → Health score
 * 4. Apply filtering (last 10 scores, trim 2 min/max)
 * 5. Update HealthGauge in real-time
 * 6. User sees live feedback ("Sweet Spot Search")
 * 7. Stop button saves final filtered score
 */

import { extractFeaturesFromChunk, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import {
  ScoreHistory,
  LabelHistory,
  getClassificationDetails,
  classifyDiagnosticState,
  classifyHealthStatus,
  getAllModelScores,
  getMinConfidentMatchScore,
} from '@core/ml/scoring.js';
import { WorkPointRanking, type WorkPoint } from '@ui/components/WorkPointRanking.js';
import { OperatingPointMetrics } from '@core/dsp/operatingPointMetrics.js';
import { OperatingPointMonitor } from '@ui/components/OperatingPointMonitor.js';
import { saveDiagnosis, getMachine, getDiagnosesForMachine } from '@data/db.js';
import { HealthGauge } from '@ui/components/HealthGauge.js';
import { HistoryChart } from '@ui/components/HistoryChart.js';
import {
  getRawAudioStream,
  getSmartStartStatusMessage,
  DEFAULT_SMART_START_CONFIG,
} from '@core/audio/audioHelper.js';
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';
import { notify } from '@utils/notifications.js';
import type { Machine, DiagnosisResult, GMIAModel } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { BUTTON_TEXT, MODAL_TITLE } from '@ui/constants.js';
import { stopMediaStream, closeAudioContext } from '@utils/streamHelper.js';
import { t, getLocale } from '../../i18n/index.js';
import { getViewLevel } from '@utils/viewLevelSettings.js';
import { AudioVisualizer } from '@ui/components/AudioVisualizer.js';
import { InfoBottomSheet } from '@ui/components/InfoBottomSheet.js';
import { getRecordingSettings } from '@utils/recordingSettings.js';
import {
  getRoomCompSettings,
  RealtimeCMN,
  RealtimeBiasMatch,
  RealtimeT60Subtraction,
  playChirpAndRecord,
  estimateT60FromChirp,
  compareEnvironments,
  classifyT60Value,
  getT60ClassificationLabel,
} from '@core/dsp/roomCompensation.js';
import type { T60Estimate, EnvironmentComparisonResult } from '@core/dsp/roomCompensation.js';
import { getCherryPickSettings, RealtimeCherryPick } from '@core/dsp/cherryPicking.js';
import { PipelineStatusDashboard } from '@ui/components/PipelineStatus.js';
import {
  RealtimeDriftDetector,
  getDriftSettings,
  type DriftResult,
  type DriftDetectorSettings,
  type RefDriftBaseline,
} from '@core/dsp/driftDetector.js';

export class DiagnosePhase {
  private machine: Machine;
  private selectedDeviceId: string | undefined; // Selected microphone device ID
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null; // VISUAL POSITIONING: Camera stream for ghost overlay
  private audioWorkletManager: AudioWorkletManager | null = null;
  private visualizer: AudioVisualizer | null = null; // Used in advanced/expert view
  private healthGauge: HealthGauge | null = null;
  private historyChart: HistoryChart | null = null;
  private activeModels: GMIAModel[] = [];

  // Simplified inspection view state
  private lastMagnitudeFactor: number = 0;
  private useSimplifiedView: boolean = true; // Determined by view level at start

  // Real-time processing
  private isProcessing: boolean = false;
  private scoreHistory: ScoreHistory;
  private labelHistory: LabelHistory; // CRITICAL FIX: Label history for majority voting
  private lastProcessedScore: number = 0;
  private lastProcessedStatus: 'healthy' | 'uncertain' | 'faulty' | 'UNKNOWN' = 'UNKNOWN';
  private lastDetectedState: string = 'UNKNOWN'; // MULTICLASS: Store detected state
  private hasValidMeasurement: boolean = false; // Track if actual measurement occurred
  private useAudioWorklet: boolean = true;
  private isStarting: boolean = false;
  private isSaving: boolean = false; // CRITICAL FIX: Prevent duplicate save calls

  // DEBUG: Store last calculation values for UI display
  private lastDebugValues: {
    weightMagnitude: number;
    featureMagnitude: number;
    magnitudeFactor: number;
    cosine: number;
    adjustedCosine: number;
    scalingConstant: number;
    rawScore: number;
  } | null = null;

  // Configuration
  private chunkSize: number; // 330ms in samples
  // CRITICAL FIX: Use 48000 Hz to match AUDIO_CONSTRAINTS.sampleRate
  // This prevents unnecessary browser resampling (48k hardware → 44.1k context)
  private requestedSampleRate: number = 48000; // Requested sample rate
  private actualSampleRate: number = 48000; // Actual sample rate from AudioContext
  private dspConfig: typeof DEFAULT_DSP_CONFIG; // DSP config with actual sample rate

  // CRITICAL FIX: Store event listener reference for proper cleanup
  private diagnoseButtonClickHandler: (() => void) | null = null;

  // Work Point Ranking (Advanced/Expert view)
  private workPointRanking: WorkPointRanking | null = null;
  private lastFeatureVector: {
    features: Float64Array;
    absoluteFeatures: Float64Array;
    bins: number;
    frequencyRange: [number, number];
    rmsAmplitude?: number;
  } | null = null; // Store for ranking calculation

  // Operating Point Monitor (Expert mode only)
  private opMetrics: OperatingPointMetrics | null = null;
  private opMonitor: OperatingPointMonitor | null = null;

  // Room Compensation (real-time CMN + T60 + Bias Match)
  private realtimeCMN: RealtimeCMN | null = null;
  private realtimeBiasMatch: RealtimeBiasMatch | null = null;
  private realtimeT60: RealtimeT60Subtraction | null = null;
  private roomCompEnabled: boolean = false;
  private currentT60: T60Estimate | null = null;

  // Cherry-Picking (real-time Energy-Entropy Gate)
  private realtimeCherryPick: RealtimeCherryPick | null = null;

  // Pipeline Status Dashboard (Expert mode, shows DSP pipeline state)
  private pipelineStatus: PipelineStatusDashboard | null = null;

  // Environment comparison result (Reference T60 vs. Diagnosis T60)
  private environmentWarning: EnvironmentComparisonResult | null = null;

  /** Sprint 3 UX: Track whether operating point changed during diagnosis */
  private opChangedDuringDiagnosis = false;

  // Drift Detector (Global Drift + Local Residual Index)
  private realtimeDrift: RealtimeDriftDetector | null = null;
  private driftSettings: DriftDetectorSettings | null = null;
  private driftContextHintTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Sprint 5: Optional callback fired after diagnosis is saved (for fleet queue) */
  private onDiagnosisComplete: ((diagnosis: DiagnosisResult) => void) | null = null;

  /** Sprint 5 Fix: Optional callback fired when diagnosis fails to start (for fleet queue error recovery) */
  private onDiagnosisError: ((error: unknown) => void) | null = null;

  /** Quick Compare context: gold standard machine name for UX hints */
  private qcGoldStandardName: string | null = null;

  /** Track whether ghost overlay hint has been shown this session */
  private static ghostOverlayHintShown = false;

  /** Track whether score explanation has been shown this session */
  private static scoreExplanationShown = false;

  constructor(machine: Machine, selectedDeviceId?: string) {
    this.machine = machine;
    this.selectedDeviceId = selectedDeviceId;

    // DEBUG LOGGING: Show which machine is being used for diagnosis
    logger.debug('🔬 DiagnosePhase Constructor:', {
      machineId: machine.id,
      machineName: machine.name,
      numModels: machine.referenceModels?.length || 0,
    });

    // Initialize with default config (will be updated when AudioContext is created)
    this.chunkSize = Math.floor(DEFAULT_DSP_CONFIG.windowSize * this.requestedSampleRate);
    this.dspConfig = { ...DEFAULT_DSP_CONFIG };

    // Initialize score history for filtering
    this.scoreHistory = new ScoreHistory();
    // CRITICAL FIX: Initialize label history for majority voting
    this.labelHistory = new LabelHistory();
  }

  /**
   * Update machine data (e.g., after new reference model is added)
   */
  public setMachine(machine: Machine): void {
    this.machine = machine;
    logger.debug('🔄 Machine updated in DiagnosePhase:', {
      machineId: machine.id,
      machineName: machine.name,
      numModels: machine.referenceModels?.length || 0,
    });
  }

  /**
   * Sprint 5: Set callback for diagnosis completion (used by fleet queue)
   */
  public setOnDiagnosisComplete(cb: (diagnosis: DiagnosisResult) => void): void {
    this.onDiagnosisComplete = cb;
  }

  /**
   * Sprint 5 Fix: Set callback for diagnosis error (used by fleet queue to skip failed machines)
   */
  public setOnDiagnosisError(cb: (error: unknown) => void): void {
    this.onDiagnosisError = cb;
  }

  /**
   * Set Quick Compare context for UX hints in the inspection modal.
   * @param goldStandardName - Name of the gold standard (reference) machine
   */
  public setQcContext(goldStandardName: string): void {
    this.qcGoldStandardName = goldStandardName;
  }

  /**
   * Initialize the diagnose phase UI
   */
  public init(): void {
    this.applyAppShellLayout();
    const diagnoseBtn = document.getElementById('diagnose-btn');
    if (diagnoseBtn) {
      // CRITICAL FIX: Store handler reference to enable cleanup in destroy()
      this.diagnoseButtonClickHandler = () => this.startDiagnosis();
      diagnoseBtn.addEventListener('click', this.diagnoseButtonClickHandler);
    }
  }

  /**
   * Start real-time diagnosis with Smart Start
   */
  private async startDiagnosis(): Promise<void> {
    if (this.isStarting || this.isProcessing || this.mediaStream) {
      notify.warning(t('diagnose.alreadyRunning'));
      return;
    }

    // Sprint 3 UX: Reset operating point change flag for new diagnosis
    this.opChangedDuringDiagnosis = false;

    try {
      // Refresh machine data to ensure latest reference models are loaded
      let latestMachine = await getMachine(this.machine.id);
      if (latestMachine) {
        // Sprint 5: Shared Fleet Reference – load Gold Standard models if configured
        if (latestMachine.fleetReferenceSourceId) {
          const goldStandard = await getMachine(latestMachine.fleetReferenceSourceId);
          if (goldStandard && goldStandard.referenceModels && goldStandard.referenceModels.length > 0) {
            logger.info(`🏆 Using Gold Standard reference from: ${goldStandard.name} (${goldStandard.id})`);
            latestMachine = {
              ...latestMachine,
              referenceModels: goldStandard.referenceModels,
              refLogMean: goldStandard.refLogMean,
              refLogStd: goldStandard.refLogStd,
              refLogResidualStd: goldStandard.refLogResidualStd,
              refDriftBaseline: goldStandard.refDriftBaseline,
              refT60: goldStandard.refT60,
              refT60Classification: goldStandard.refT60Classification,
            };
          } else {
            logger.warn(`⚠️ Gold Standard ${latestMachine.fleetReferenceSourceId} not found or has no models. Using own reference.`);
          }
        }
        this.machine = latestMachine;
      } else {
        notify.error(t('identify.errors.machineNotFound'));
        return;
      }

      // DEBUG LOGGING: Show which machine and models are loaded
      logger.debug('🤖 Diagnosis Start Debug:', {
        machineId: this.machine.id,
        machineName: this.machine.name,
        numModels: this.machine.referenceModels?.length || 0,
        models: this.machine.referenceModels?.map(m => ({
          label: m.label,
          trainingDate: new Date(m.trainingDate).toLocaleString(),
          sampleRate: m.sampleRate,
          weightMagnitude: m.metadata?.weightMagnitude?.toFixed(6) || 'N/A',
        })) || [],
      });

      // Check if machine has reference models (multiclass)
      if (!this.machine.referenceModels || this.machine.referenceModels.length === 0) {
        notify.error(t('diagnose.noReferenceModel'));
        return;
      }

      logger.info('🔴 Starting REAL-TIME diagnosis with Smart Start...');

      // Check AudioWorklet support - CRITICAL for real-time processing
      this.useAudioWorklet = isAudioWorkletSupported();
      if (!this.useAudioWorklet) {
        logger.error('❌ AudioWorklet not supported - Real-time diagnosis requires AudioWorklet');
        notify.error(
          t('diagnose.browserNotCompatible'),
          new Error('AudioWorklet not supported'),
          { title: t('modals.browserIncompatible'), duration: 0 }
        );
        return;
      }

      this.isStarting = true;

      // Reset state for new diagnosis
      this.hasValidMeasurement = false;
      this.lastProcessedScore = 0;
      this.lastProcessedStatus = 'UNKNOWN';
      this.lastDetectedState = 'UNKNOWN'; // MULTICLASS: Reset detected state
      this.scoreHistory.clear();
      this.labelHistory.clear(); // CRITICAL FIX: Clear label history

      // CRITICAL FIX: Validate sample rate compatibility BEFORE creating any resources
      // This prevents allocating AudioContext/MediaStream that must be immediately destroyed
      const expectedSampleRate = this.machine.referenceModels[0]?.sampleRate;
      if (!expectedSampleRate) {
        notify.error(t('diagnose.noValidSampleRate'));
        this.isStarting = false;
        return;
      }

      // Check if all models have the same sample rate
      const uniqueRates = [...new Set(this.machine.referenceModels.map(m => m.sampleRate))];
      if (uniqueRates.length > 1) {
        logger.warn(`⚠️ Multiple sample rates in models: ${uniqueRates.join(', ')}Hz`);
      }

      // Request microphone access using central helper with selected device
      this.mediaStream = await getRawAudioStream(this.selectedDeviceId);

      // VISUAL POSITIONING: Request camera whenever a reference image exists
      // so the ghost overlay (semi-transparent position image) is always available
      const hasReferenceImage = !!this.machine?.referenceImage;

      if (hasReferenceImage) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, // Prefer back camera on mobile
            audio: false,
          });
          logger.info('📷 Camera access granted for visual positioning');
        } catch (cameraError) {
          logger.warn('⚠️ Camera access denied – continuing without visual positioning', cameraError);
          notify.info(t('diagnose.cameraNotAvailable'), {
            title: t('modals.cameraOptional'),
          });
          this.cameraStream = null;
        }
      } else {
        logger.debug('📷 Camera not requested (no reference image)');
        this.cameraStream = null;
      }

      // Create audio context with the expected sample rate
      // Note: Browser may still override this based on hardware capabilities
      this.audioContext = new AudioContext({ sampleRate: expectedSampleRate });

      // CRITICAL FIX: Update configuration with actual sample rate
      this.actualSampleRate = this.audioContext.sampleRate;

      if (this.actualSampleRate !== expectedSampleRate) {
        logger.warn(
          `⚠️ AudioContext sample rate is ${this.actualSampleRate}Hz instead of requested ${expectedSampleRate}Hz`
        );
        logger.warn(
          `⚠️ This indicates hardware does not support ${expectedSampleRate}Hz - sample rate mismatch!`
        );
      }

      // CRITICAL: Validate sample rate compatibility with trained models
      // This check now happens AFTER we know the actual hardware rate
      this.activeModels = this.machine.referenceModels.filter(
        (model) => model.sampleRate === this.actualSampleRate
      );
      if (this.activeModels.length === 0) {
        const rateList = [...new Set(this.machine.referenceModels.map((model) => model.sampleRate))]
          .sort((a, b) => a - b)
          .join(', ');
        logger.error(
          `❌ Sample Rate Mismatch: Hardware=${this.actualSampleRate}Hz, ModelRates=[${rateList}]`
        );
        notify.error(
          t('diagnose.sampleRateError', { actual: String(this.actualSampleRate), expected: rateList }),
          new Error('Sample Rate Mismatch'),
          {
            title: t('modals.sampleRateMismatch'),
            duration: 0,
          }
        );
        // Clean up and abort
        this.cleanup();
        return;
      }

      if (this.activeModels.length < this.machine.referenceModels.length) {
        logger.warn(
          `⚠️ Sample Rate Filter: ${this.activeModels.length}/${this.machine.referenceModels.length} Modelle kompatibel (${this.actualSampleRate}Hz)`
        );
      }

      logger.info(
        `✅ Sample Rate validation passed: ${this.actualSampleRate}Hz (matches model training)`
      );

      // Update chunkSize and DSP config with actual sample rate
      this.chunkSize = Math.floor(DEFAULT_DSP_CONFIG.windowSize * this.actualSampleRate);
      this.dspConfig = {
        ...DEFAULT_DSP_CONFIG,
        sampleRate: this.actualSampleRate,
        frequencyRange: [0, this.actualSampleRate / 2], // Update Nyquist frequency
      };

      logger.debug(
        `📊 DSP Config: sampleRate=${this.dspConfig.sampleRate}Hz, chunkSize=${this.chunkSize} samples, windowSize=${DEFAULT_DSP_CONFIG.windowSize}s`
      );

      // Room Compensation: Initialize real-time processors
      const roomCompSettings = getRoomCompSettings();

      // Session Bias Match: Preferred over CMN for stationary machine signals.
      // Uses precomputed refLogMean from the Machine object (stored at reference creation).
      this.realtimeBiasMatch = null;
      if (roomCompSettings.enabled && roomCompSettings.biasMatchEnabled && this.machine.refLogMean) {
        const muRef = new Float64Array(this.machine.refLogMean);
        this.realtimeBiasMatch = new RealtimeBiasMatch(muRef);
        logger.info(`📊 Session Bias Match activated (refLogMean loaded, ${muRef.length} bins)`);
      }

      // CMN: Only if explicitly enabled AND bias match is NOT active
      this.roomCompEnabled = roomCompSettings.enabled && roomCompSettings.cmnEnabled && !roomCompSettings.biasMatchEnabled;
      if (this.roomCompEnabled) {
        this.realtimeCMN = new RealtimeCMN(this.dspConfig.frequencyBins);
        logger.info('🔧 Room compensation (real-time CMN) initialized');
      } else {
        this.realtimeCMN = null;
      }

      // Room Compensation: Chirp measurement for T60 estimation
      // Plays a short ~60ms tone through the speaker BEFORE Smart Start begins.
      this.currentT60 = null;
      this.realtimeT60 = null;
      if (roomCompSettings.enabled && roomCompSettings.t60Enabled && this.audioContext && this.mediaStream) {
        try {
          logger.info('🔊 Chirp calibration for diagnosis...');
          const { chirp, recorded } = await playChirpAndRecord(this.audioContext, this.mediaStream);
          this.currentT60 = estimateT60FromChirp(chirp, recorded, this.audioContext.sampleRate);
          if (this.currentT60) {
            logger.info(`🔊 Room T60: ${this.currentT60.broadband.toFixed(2)}s`);
            // Initialize real-time T60 subtraction processor
            this.realtimeT60 = new RealtimeT60Subtraction(
              this.dspConfig.frequencyBins,
              this.currentT60,
              roomCompSettings.beta,
              roomCompSettings.spectralFloor
            );
          } else {
            logger.warn('⚠️ Chirp: No clear peak – falling back to CMN only');
          }
        } catch (e) {
          logger.warn('⚠️ Chirp measurement failed:', e);
          this.currentT60 = null;
        }
      }

      // Environment comparison: Reference T60 vs. current T60
      this.environmentWarning = null;
      if (this.currentT60 && this.machine.refT60) {
        this.environmentWarning = compareEnvironments(
          this.machine.refT60,
          this.currentT60.broadband
        );
        if (this.environmentWarning.severity !== 'ok') {
          logger.warn(`⚠️ Environment comparison: ${this.environmentWarning.message}`);
        } else {
          logger.info(`✅ Environment similar to reference (ratio: ${this.environmentWarning.ratio.toFixed(1)}x)`);
        }
      }

      // Cherry-Picking: Initialize real-time Energy-Entropy Gate if enabled
      const cherryPickSettings = getCherryPickSettings();
      if (cherryPickSettings.enabled) {
        this.realtimeCherryPick = new RealtimeCherryPick(cherryPickSettings, DEFAULT_DSP_CONFIG.hopSize);
        logger.info(`🍒 Cherry-Picking Gate activated (σ=${cherryPickSettings.sigmaThreshold})`);
      } else {
        this.realtimeCherryPick = null;
      }

      // Drift Detector V2: Initialize if enabled and refLogMean available
      this.driftSettings = getDriftSettings();
      this.realtimeDrift = null;
      if (this.driftSettings.enabled && this.machine.refLogMean) {
        const muRef = new Float64Array(this.machine.refLogMean);
        // Prefer refLogResidualStd (fine structure variance) over refLogStd (overall σ)
        const sigmaRef = this.machine.refLogResidualStd
          ? new Float64Array(this.machine.refLogResidualStd)
          : this.machine.refLogStd
            ? new Float64Array(this.machine.refLogStd)
            : undefined;
        const baseline = (this.machine.refDriftBaseline as RefDriftBaseline | undefined) ?? undefined;
        this.realtimeDrift = new RealtimeDriftDetector(muRef, this.driftSettings, sigmaRef, baseline);
        logger.info(
          '🔍 Drift detector V2 activated'
          + (sigmaRef ? (this.machine.refLogResidualStd ? ' (residual-σ)' : ' (σ)') : '')
          + (baseline ? ' (adaptive thresholds)' : ' (fallback thresholds)')
        );
      }

      // Pipeline Status Dashboard: Initialize if expert mode and features active
      const viewLevelForDashboard = getViewLevel();
      if (viewLevelForDashboard === 'expert' && (cherryPickSettings.enabled || roomCompSettings.enabled)) {
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

        // Set T60 result if chirp was already performed
        if (this.currentT60) {
          this.pipelineStatus.setT60Result(this.currentT60.broadband, true);
        } else if (roomCompSettings.enabled && roomCompSettings.t60Enabled) {
          this.pipelineStatus.setT60Result(null, this.currentT60 !== null);
        }

        // Set CMN status
        if (this.roomCompEnabled) {
          this.pipelineStatus.setCmnActive(false); // Will be set to true after first CMN application
        }

        // Environment comparison: Show result in dashboard
        if (this.environmentWarning) {
          this.pipelineStatus.setEnvironmentComparison(this.environmentWarning);
        } else if (this.machine.refT60 && !roomCompSettings.t60Enabled) {
          // T60 is OFF but reference had a value → show reference info
          this.pipelineStatus.setReferenceT60Info(
            this.machine.refT60,
            this.machine.refT60Classification ?? classifyT60Value(this.machine.refT60)
          );
        }
      }

      // GMIA = "Schnelltest" ALWAYS uses simplified view
      // This is the quick test mode for instant diagnosis
      // IMPORTANT: This must happen BEFORE showRecordingModal() to display the correct modal
      const isNfcDiagnosis = document.body.getAttribute('data-nfc-diagnosis') === 'true';
      if (isNfcDiagnosis) {
        // Clear flag after reading to prevent affecting future diagnoses
        document.body.removeAttribute('data-nfc-diagnosis');
      }

      // Determine view mode based on user's view level setting
      // basic → simplified (percentage only), advanced/expert → full recording modal
      const currentViewLevel = getViewLevel();
      this.useSimplifiedView = currentViewLevel === 'basic';

      logger.info(`📊 Level 1 (Schnelltest): View level='${currentViewLevel}', useSimplifiedView=${this.useSimplifiedView}${isNfcDiagnosis ? ' (NFC initiated)' : ''}`);

      // Show recording modal (uses pre-calculated useSimplifiedView)
      this.showRecordingModal();

      // Initialize visualizer for advanced/expert view
      if (!this.useSimplifiedView && this.audioContext && this.mediaStream) {
        const waveformCanvas = document.getElementById('waveform-canvas');
        if (waveformCanvas) {
          this.visualizer = new AudioVisualizer('waveform-canvas');
          this.visualizer.start(this.audioContext, this.mediaStream);
        }

        // Initialize HealthGauge for advanced view
        const gaugeCanvas = document.getElementById('health-gauge-canvas');
        if (gaugeCanvas) {
          this.healthGauge = new HealthGauge('health-gauge-canvas');
          this.healthGauge.draw(0, 'UNKNOWN');
        }
      }

      // FORCE START: Check if audio trigger should be disabled
      const recordingSettings = getRecordingSettings();
      const skipSmartStart = recordingSettings.disableAudioTrigger;

      // Initialize AudioWorklet Manager (always available at this point)
      this.audioWorkletManager = new AudioWorkletManager({
        bufferSize: this.chunkSize * 2,
        warmUpDuration: DEFAULT_SMART_START_CONFIG.warmUpDuration, // Use config as Single Source of Truth
        onAudioChunk: (chunk) => {
          // Real-time audio chunk received from worklet
          if (this.isProcessing) {
            this.processChunkDirectly(chunk);
          }
        },
        onSmartStartStateChange: (state) => {
          const statusMsg = getSmartStartStatusMessage(state);
          // CRITICAL FIX: Pass phase directly to avoid hardcoded string matching
          this.updateSmartStartStatus(statusMsg, state.phase);
        },
        onSmartStartComplete: (rms) => {
          logger.info(`✅ Smart Start: Signal detected! RMS: ${rms.toFixed(4)}`);

          // Sprint 2 UX: Visual ready moment (flash green + haptic)
          const statusElement = document.getElementById('smart-start-status')
            || document.getElementById('inspection-subtitle');
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

          this.updateSmartStartStatus(t('diagnose.diagnosisRunning'));
          this.isProcessing = true; // Start processing incoming chunks
        },
        onSmartStartTimeout: () => {
          logger.warn('⏱️ Smart Start timeout - cleaning up resources');
          notify.warning(t('reference.recording.noSignal'), {
            title: t('modals.noSignalDetected'),
          });
          // CRITICAL FIX: Call cleanup() to properly release all resources
          this.cleanup();
          this.hideRecordingModal();
        },
      });

      // Initialize AudioWorklet
      await this.audioWorkletManager.init(this.audioContext, this.mediaStream);

      // Start Smart Start sequence (always needed for audio processing)
      this.audioWorkletManager.startSmartStart();

      if (skipSmartStart) {
        // FORCE START: Skip signal detection after warmup (5s), start immediately
        logger.info('⚡ Force Start: Audio trigger disabled, will start after warmup');

        // Wait for warmup duration (5000ms), then skip to recording
        setTimeout(() => {
          if (!this.audioWorkletManager) {
            logger.error('AudioWorkletManager not initialized');
            return;
          }
          logger.info('⚡ Force Start: Warmup complete, starting diagnosis immediately');
          this.updateSmartStartStatus(t('diagnose.diagnosisRunning'));
          this.audioWorkletManager.skipToRecording();
          this.isProcessing = true; // Start processing incoming chunks
        }, DEFAULT_SMART_START_CONFIG.warmUpDuration);
      }

      logger.info('✅ Real-time diagnosis initialized!');
    } catch (error) {
      logger.error('Diagnosis error:', error);
      notify.error(t('reference.recording.microphoneFailed'), error as Error, {
        title: t('modals.accessDenied'),
        duration: 0,
      });

      // Cleanup on error
      this.cleanup();
      this.hideRecordingModal();

      // Sprint 5 Fix: Notify fleet queue about the error so it can skip to next machine
      if (this.onDiagnosisError) {
        this.onDiagnosisError(error);
      }
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Cleanup resources (AudioContext, MediaStream, etc.)
   */
  private cleanup(): void {
    // Stop processing
    this.isProcessing = false;
    this.isStarting = false;

    // Reset state flags to prevent memory leaks
    this.hasValidMeasurement = false;
    this.lastProcessedScore = 0;
    this.lastProcessedStatus = 'UNKNOWN';
    this.lastDetectedState = 'UNKNOWN'; // MULTICLASS: Reset detected state
    this.scoreHistory.clear();
    this.labelHistory.clear(); // CRITICAL FIX: Clear label history

    // Cleanup Pipeline Status Dashboard
    if (this.pipelineStatus) {
      this.pipelineStatus.destroy();
      this.pipelineStatus = null;
    }

    // Cleanup Cherry-Picking state
    if (this.realtimeCherryPick) {
      this.realtimeCherryPick.reset();
      this.realtimeCherryPick = null;
    }

    // Cleanup Drift Detector state
    if (this.realtimeDrift) {
      this.realtimeDrift.reset();
      this.realtimeDrift = null;
    }
    if (this.driftContextHintTimeout) {
      clearTimeout(this.driftContextHintTimeout);
      this.driftContextHintTimeout = null;
    }
    this.driftSettings = null;

    // Cleanup Room Compensation state
    if (this.realtimeT60) {
      this.realtimeT60.reset();
      this.realtimeT60 = null;
    }
    if (this.realtimeBiasMatch) {
      this.realtimeBiasMatch.reset();
      this.realtimeBiasMatch = null;
    }
    if (this.realtimeCMN) {
      this.realtimeCMN.reset();
      this.realtimeCMN = null;
    }
    this.roomCompEnabled = false;
    this.currentT60 = null;

    // Cleanup Operating Point Monitor (Expert mode)
    if (this.opMetrics) {
      this.opMetrics.reset();
      this.opMetrics = null;
    }
    if (this.opMonitor) {
      this.opMonitor.destroy();
      this.opMonitor = null;
    }

    // Cleanup AudioWorklet
    if (this.audioWorkletManager) {
      this.audioWorkletManager.cleanup();
      this.audioWorkletManager = null;
    }

    // Stop visualizer (used in advanced/expert view)
    if (this.visualizer) {
      this.visualizer.stop();
      this.visualizer = null;
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

    // Clean up dynamically created DOM elements to prevent memory leaks
    // CRITICAL FIX: Only remove elements within the recording modal to avoid affecting other UI
    const modal = document.getElementById('recording-modal');
    if (modal) {
      // Remove live display elements within modal only
      const liveDisplays = modal.querySelectorAll('.live-display');
      liveDisplays.forEach((element) => element.remove());

      // Remove smart start status elements within modal only
      const smartStartStatuses = modal.querySelectorAll('#smart-start-status');
      smartStartStatuses.forEach((element) => element.remove());
    }

    logger.debug('🧹 Cleanup complete');
  }

  /**
   * Process audio chunk directly (called from AudioWorklet)
   *
   * This is the NEW real-time processing pipeline using AudioWorklet.
   * Receives chunks directly from the audio thread.
   *
   * MULTICLASS MODE: Uses classifyDiagnosticState() to compare against all trained models.
   *
   * @param chunk - Audio chunk from AudioWorklet (4096 samples)
   */
  private processChunkDirectly(chunk: Float32Array): void {
    // Check if processing is active to prevent race conditions during cleanup
    if (!this.isProcessing) {
      return;
    }

    // Validate reference models exist
    if (!this.activeModels || this.activeModels.length === 0) {
      return;
    }

    // CRITICAL FIX: Comprehensive chunk validation to prevent runtime errors
    try {
      // Validate chunk exists and is correct type
      if (!chunk || !(chunk instanceof Float32Array)) {
        logger.error('❌ Invalid chunk received: not a Float32Array');
        return;
      }

      // Validate chunk is not empty
      if (chunk.length === 0) {
        logger.debug('⏳ Empty chunk received, skipping');
        return;
      }

      // CRITICAL: Ensure chunk has minimum required samples for feature extraction
      // Required: this.chunkSize samples (330ms window = ~15840 samples at 48kHz, ~14553 at 44.1kHz)
      // If chunk is smaller, skip processing and wait for more data from AudioWorklet
      if (chunk.length < this.chunkSize) {
        logger.debug(
          `⏳ Chunk too small: ${chunk.length} < ${this.chunkSize} samples, waiting for more data`
        );
        return;
      }

      // Extract exactly chunkSize samples for feature extraction (discard excess if any)
      // This ensures consistent window sizes across all processing cycles
      const processingChunk = chunk.slice(0, this.chunkSize);

      // Step 1: Extract features (Energy Spectral Densities)
      // CRITICAL FIX: Use actual sample rate from dspConfig (not hardcoded DEFAULT_DSP_CONFIG)
      const rawFeatureVector = extractFeaturesFromChunk(processingChunk, this.dspConfig);

      // Step 1a: Cherry-Picking Gate - reject transient frames before scoring
      if (this.realtimeCherryPick) {
        const accepted = this.realtimeCherryPick.processFrame(rawFeatureVector);
        if (this.pipelineStatus) {
          this.pipelineStatus.updateCherryPick(accepted);
        }
        if (!accepted) {
          logger.debug('🍒 Frame rejected (transient)');
          return; // Skip this frame – do not score. Score stays at last good value.
        }
      }

      // Step 1b: Room Compensation - Apply T60 subtraction, then Bias Match or CMN
      let featureVector = rawFeatureVector;
      if (this.realtimeT60) {
        featureVector = this.realtimeT60.process(featureVector);
      }
      if (this.realtimeBiasMatch) {
        featureVector = this.realtimeBiasMatch.processFrame(featureVector);
        if (this.pipelineStatus) {
          this.pipelineStatus.setBiasMatchActive(true);
        }
      } else if (this.roomCompEnabled && this.realtimeCMN) {
        featureVector = this.realtimeCMN.process(featureVector);
        if (this.pipelineStatus) {
          this.pipelineStatus.setCmnActive(true);
        }
      }

      // Store last feature vector for ranking calculation in showResults
      this.lastFeatureVector = featureVector;

      // Step 2: MULTICLASS CLASSIFICATION
      // Compare against all trained models and find best match
      // CRITICAL: Pass actualSampleRate for validation against model's training sample rate
      const diagnosis = classifyDiagnosticState(
        this.activeModels,
        featureVector,
        this.actualSampleRate
      );

      // Step 3: Add score to history for filtering
      this.scoreHistory.addScore(diagnosis.healthScore);

      // CRITICAL FIX: Add label to history for majority voting
      const detectedState = (typeof diagnosis.metadata?.detectedState === 'string'
        ? diagnosis.metadata.detectedState
        : 'UNKNOWN');
      this.labelHistory.addLabel(detectedState);

      // Step 4: Get filtered score (trimmed mean of last 10)
      const filteredScore = this.scoreHistory.getFilteredScore();

      // Step 5: Derive status from filtered score for consistency
      // Use user-configured thresholds from settings
      const settings = getRecordingSettings();
      const filteredStatus = classifyHealthStatus(
        filteredScore,
        settings.confidenceThreshold,
        settings.faultyThreshold
      );

      // Step 6: Store debug values from diagnosis metadata
      if (diagnosis.metadata?.debug) {
        const debug = diagnosis.metadata.debug as {
          weightMagnitude: number;
          featureMagnitude: number;
          magnitudeFactor: number;
          cosine: number;
          adjustedCosine: number;
          scalingConstant: number;
          rawScore: number;
        };
        this.lastDebugValues = debug;
        // Store magnitude factor for quality hints in simplified view
        this.lastMagnitudeFactor = debug.magnitudeFactor;
        logger.debug('✅ Debug values stored:', this.lastDebugValues);
      } else {
        logger.warn('⚠️ No debug values in diagnosis.metadata!', diagnosis.metadata);
      }

      // Step 6b: Update operating point metrics (Expert mode only)
      let operatingPointChanged = false;
      if (this.opMetrics && featureVector.rmsAmplitude !== undefined) {
        this.opMetrics.update(
          featureVector.features,
          featureVector.rmsAmplitude,
          this.scoreHistory.getAllScores()
        );
        const opResult = this.opMetrics.getResult();
        if (opResult) {
          operatingPointChanged = opResult.operatingPointChanged;
          // Sprint 3 UX: Latch – once true, stays true for the entire diagnosis
          if (operatingPointChanged) {
            this.opChangedDuringDiagnosis = true;
          }
          if (this.opMonitor) {
            this.opMonitor.update(opResult);
          }
        }
      }

      // Step 7: Update UI in real-time with detected state and debug values
      this.updateLiveDisplay(filteredScore, filteredStatus, detectedState, operatingPointChanged);
      this.updateDebugDisplay();

      // Step 8: Store for final save (use filtered score/status for consistency)
      this.lastProcessedScore = filteredScore;
      this.lastProcessedStatus = filteredStatus;
      this.lastDetectedState = detectedState; // MULTICLASS: Store detected state (will be replaced by majority vote on save)
      this.hasValidMeasurement = true; // Mark that we have valid data

      // Step 9: Drift Detector – purely diagnostic, does NOT change score
      if (this.realtimeDrift && rawFeatureVector.absoluteFeatures) {
        const driftResult = this.realtimeDrift.processFrame(rawFeatureVector.absoluteFeatures);
        if (driftResult) {
          this.updateDriftDisplay(driftResult, filteredScore);
        }
      }

      // Debug log every 10th update
      if (this.scoreHistory.getAllScores().length % 10 === 0) {
        logger.debug(
          `📊 Live Score: ${filteredScore.toFixed(1)}% | State: ${detectedState} (${filteredStatus})`
        );
      }
    } catch (error) {
      logger.error('Chunk processing error:', error);

      // CRITICAL: Check for sample rate mismatch error
      if (error instanceof Error && error.message.includes('Sample Rate Mismatch')) {
        // Stop processing immediately
        this.isProcessing = false;

        // Show user-friendly error message
        notify.error(
          t('diagnose.sampleRateError', { actual: String(this.actualSampleRate), expected: '?' }),
          error,
          {
            title: t('modals.sampleRateMismatch'),
            duration: 0,
          }
        );

        // Clean up resources
        this.cleanup();
        this.hideRecordingModal();
      }
    }
  }

  /**
   * Update Smart Start status message
   *
   * Updates both simplified and advanced views during initialization.
   * Shows descriptive feedback during the extended settling time (5 seconds).
   *
   * CRITICAL FIX: Now accepts optional phase parameter to avoid hardcoded string matching
   * which would fail in non-German locales.
   *
   * @param message - Status message to display
   * @param phase - Optional SmartStart phase ('idle' | 'warmup' | 'waiting' | 'recording')
   */
  private updateSmartStartStatus(message: string, phase?: 'idle' | 'warmup' | 'waiting' | 'recording'): void {
    // CRITICAL FIX: Check phase instead of matching German strings
    // This ensures internationalization works correctly
    const isRecording = phase === 'recording';
    const isWarmup = phase === 'warmup';
    const isWaiting = phase === 'waiting';

    if (this.useSimplifiedView) {
      // === SIMPLIFIED VIEW ===
      const subtitleElement = document.getElementById('inspection-subtitle');
      if (subtitleElement) {
        if (isRecording) {
          subtitleElement.textContent = t('inspection.subtitle');
        } else {
          subtitleElement.textContent = t('inspection.subtitleInitializing');
        }
      }

      const hintElement = document.getElementById('inspection-hint');
      if (hintElement) {
        if (isRecording) {
          hintElement.classList.add('hint-hidden');
        } else {
          hintElement.textContent = t('inspection.hintWaiting');
          hintElement.classList.remove('hint-hidden');
        }
      }
    } else {
      // === ADVANCED VIEW ===
      const statusElement = document.getElementById('smart-start-status');
      if (statusElement) {
        let enhancedMessage = message;
        if (isWarmup) {
          enhancedMessage = t('diagnose.smartStart.stabilizing', { message });
        } else if (isWaiting) {
          enhancedMessage = t('diagnose.smartStart.waiting', { message });
        }
        statusElement.textContent = enhancedMessage;

        if (isRecording) {
          statusElement.style.display = 'none';
        }
      }
    }
  }

  /**
   * Update debug display with calculation values
   */
  private updateDebugDisplay(): void {
    if (!this.lastDebugValues) {
      logger.warn('⚠️ updateDebugDisplay: No debug values available!');
      return;
    }

    logger.debug('🔧 Updating debug display with values:', this.lastDebugValues);
    const v = this.lastDebugValues;

    const updateElement = (id: string, text: string, highlight: boolean = false) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = text;
        if (highlight) {
          el.style.color = '#ff8800';
          el.style.fontWeight = '700';
        }
        logger.debug(`  ✓ Updated ${id}: ${text}`);
      } else {
        logger.error(`  ✗ Element not found: ${id}`);
      }
    };

    updateElement(
      'debug-weight-magnitude',
      t('diagnose.debug.weightMagnitude', { value: v.weightMagnitude.toFixed(6) })
    );
    updateElement(
      'debug-feature-magnitude',
      t('diagnose.debug.featureMagnitude', { value: v.featureMagnitude.toFixed(6) })
    );
    updateElement(
      'debug-magnitude-factor',
      t('diagnose.debug.magnitudeFactor', { value: v.magnitudeFactor.toFixed(4) }),
      v.magnitudeFactor < 0.5
    );
    updateElement('debug-cosine', t('diagnose.debug.cosine', { value: v.cosine.toFixed(4) }));
    updateElement(
      'debug-adjusted-cosine',
      t('diagnose.debug.adjustedCosine', { value: v.adjustedCosine.toFixed(4) })
    );
    updateElement(
      'debug-scaling-constant',
      t('diagnose.debug.scalingConstant', { value: v.scalingConstant.toFixed(4) })
    );
    updateElement(
      'debug-raw-score',
      t('diagnose.debug.rawScore', { value: v.rawScore.toFixed(1) }),
      v.rawScore === 0
    );
  }

  /**
   * Update drift indicator panel with latest drift result.
   * Called from processChunkDirectly() after scoring.
   */
  private updateDriftDisplay(result: DriftResult, currentScore: number): void {
    // Sprint 2 UX: Update simplified drift summary for Advanced view
    const summaryEl = document.getElementById('drift-summary-advanced');
    if (summaryEl) {
      const iconEl = document.getElementById('drift-summary-icon');
      const textEl = document.getElementById('drift-summary-text');

      if (iconEl && textEl) {
        switch (result.interpretation) {
          case 'all_ok':
            iconEl.textContent = '✅';
            textEl.textContent = t('drift.summaryOk');
            break;
          case 'room_change':
            iconEl.textContent = '🟡';
            textEl.textContent = t('drift.summaryRoomChange');
            break;
          case 'machine_change':
            iconEl.textContent = '🔴';
            textEl.textContent = t('drift.summaryMachineChange');
            break;
          case 'both':
            iconEl.textContent = '🟠';
            textEl.textContent = t('drift.summaryBoth');
            break;
          default:
            iconEl.textContent = '🟡';
            textEl.textContent = t('drift.summaryUncertain');
        }
      }
    }

    const panel = document.getElementById('drift-indicator-panel');
    if (!panel) return;

    panel.style.display = '';

    // Global Drift Bar (use actual thresholds from result for correct scaling)
    const globalBar = document.getElementById('drift-bar-global');
    const globalStatus = document.getElementById('drift-status-global');
    if (globalBar && globalStatus) {
      const maxVal = result.globalCriticalUsed * 1.5;
      const pct = Math.min((result.globalDrift / maxVal) * 100, 100);
      globalBar.style.width = pct + '%';
      globalBar.className = 'drift-bar drift-bar-' + result.globalSeverity;

      switch (result.globalSeverity) {
        case 'ok':
          globalStatus.textContent = '\u2705';
          break;
        case 'warning':
          globalStatus.textContent = '\uD83D\uDFE1';
          break;
        case 'critical':
          globalStatus.textContent = '\uD83D\uDD34';
          break;
      }
    }

    // Local Drift Bar (use actual thresholds from result for correct scaling)
    const localBar = document.getElementById('drift-bar-local');
    const localStatus = document.getElementById('drift-status-local');
    if (localBar && localStatus) {
      const maxVal = result.localCriticalUsed * 1.5;
      const localVal = result.localDriftNormalized ?? result.localDrift;
      const pct = Math.min((localVal / maxVal) * 100, 100);
      localBar.style.width = pct + '%';
      localBar.className = 'drift-bar drift-bar-' + result.localSeverity;

      switch (result.localSeverity) {
        case 'ok':
          localStatus.textContent = '\u2705';
          break;
        case 'warning':
          localStatus.textContent = '\uD83D\uDFE1';
          break;
        case 'critical':
          localStatus.textContent = '\uD83D\uDD34';
          break;
      }
    }

    // Interpretation
    const interpEl = document.getElementById('drift-interpretation');
    if (interpEl) {
      interpEl.textContent = result.overallMessage;
      interpEl.className =
        'drift-interpretation drift-interp-' + result.interpretation;
    }

    // Recommendation (only when there's a deviation)
    const recoEl = document.getElementById('drift-recommendation');
    if (recoEl) {
      if (result.recommendation) {
        recoEl.style.display = '';
        recoEl.textContent = result.recommendation;
      } else {
        recoEl.style.display = 'none';
      }
    }

    // Expert details
    const detailGlobal = document.getElementById('drift-detail-global');
    const detailLocal = document.getElementById('drift-detail-local');
    const detailsContainer = document.getElementById('drift-details');
    if (detailGlobal && detailLocal && detailsContainer) {
      detailsContainer.style.display = '';
      detailGlobal.textContent = `D_global = ${result.globalDrift.toFixed(4)} [${result.thresholdsUsed}]`;
      let localText = `D_local = ${result.localDrift.toFixed(4)}`;
      if (result.localDriftNormalized !== null) {
        localText += ` (norm: ${result.localDriftNormalized.toFixed(4)})`;
      }
      detailLocal.textContent = localText;
    }

    // Contextual hints
    if (result.interpretation === 'room_change' && currentScore > 85) {
      this.showDriftContextHint('drift.roomChangeButScoreOk');
    } else if (result.interpretation === 'room_change' && currentScore < 70) {
      this.showDriftContextHint('drift.roomChangeMayCauseScoreDrop');
    } else if (result.interpretation === 'machine_change') {
      this.showDriftContextHint('drift.machineChangeDetected');
    }
  }

  /**
   * Show a contextual hint below the drift panel.
   * Only one at a time; auto-hides after 6 seconds.
   */
  private showDriftContextHint(messageKey: string): void {
    const hintEl = document.getElementById('drift-context-hint');
    if (!hintEl) return;

    // Only show once per interpretation (not every frame update)
    if (hintEl.dataset.lastKey === messageKey) return;
    hintEl.dataset.lastKey = messageKey;

    hintEl.textContent = t(messageKey);
    hintEl.style.display = '';

    // Auto-hide after 6s
    if (this.driftContextHintTimeout) clearTimeout(this.driftContextHintTimeout);
    this.driftContextHintTimeout = setTimeout(() => {
      hintEl.style.display = 'none';
    }, 6000);
  }

  /**
   * Update live display based on current view mode
   *
   * - Simplified view: Updates large percentage, status label, quality hints
   * - Advanced view: Updates HealthGauge, live score display, status
   */
  /**
   * Sprint 1 UX: Get human-readable status text for a health score
   */
  private getScoreVerbalStatus(score: number): string {
    if (score >= 85) return t('status.consistent');
    if (score >= 70) return t('status.slightDeviation');
    if (score >= 50) return t('status.significantChange');
    return t('status.strongDeviation');
  }

  private updateLiveDisplay(score: number, status: string, detectedState?: string, operatingPointChanged?: boolean): void {
    const normalizedStatus = status.toLowerCase();

    if (this.useSimplifiedView) {
      // === SIMPLIFIED INSPECTION VIEW ===
      const statusClass = normalizedStatus === 'healthy'
        ? 'status-healthy'
        : normalizedStatus === 'uncertain'
          ? 'status-uncertain'
          : 'status-faulty';

      // Remove initializing state when we have real data
      const contentElement = document.getElementById('inspection-content');
      if (contentElement) {
        contentElement.classList.remove('is-initializing');
      }

      // Update subtitle to "running" state
      const subtitleElement = document.getElementById('inspection-subtitle');
      if (subtitleElement) {
        subtitleElement.textContent = t('inspection.subtitle');
      }

      // Update score container background color
      const scoreContainer = document.getElementById('inspection-score-container');
      if (scoreContainer) {
        scoreContainer.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
        scoreContainer.classList.add(statusClass);
      }

      // Update main score display
      const scoreElement = document.getElementById('inspection-score');
      if (scoreElement) {
        const roundedScore = Math.round(score);
        scoreElement.innerHTML = `${roundedScore}<span class="inspection-score-unit">%</span>`;
        scoreElement.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
        scoreElement.classList.add(statusClass);
      }

      // Update status label with simple, non-technical word
      const statusLabel = document.getElementById('inspection-status-label');
      if (statusLabel) {
        let statusText: string;
        if (normalizedStatus === 'healthy') {
          statusText = t('inspection.statusNormal');
        } else if (normalizedStatus === 'uncertain') {
          statusText = t('inspection.statusUncertain');
        } else {
          statusText = t('inspection.statusDeviation');
        }
        statusLabel.textContent = statusText;
        statusLabel.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
        statusLabel.classList.add(statusClass);
      }

      // Update quality hints based on signal strength
      this.updateQualityHint();

      // Sprint 1 UX: Update verbal status in simplified view
      const inspectionVerbal = document.getElementById('live-verbal-status');
      if (inspectionVerbal) {
        inspectionVerbal.textContent = this.getScoreVerbalStatus(score);
      }

    } else {
      // === ADVANCED/EXPERT VIEW ===
      const statusClass = normalizedStatus === 'healthy'
        ? 'status-healthy'
        : normalizedStatus === 'uncertain'
          ? 'status-uncertain'
          : 'status-faulty';

      // Update HealthGauge (if still present)
      if (this.healthGauge) {
        this.healthGauge.draw(score, status);
      }

      // Update legacy score display in modal (live-health-score)
      const scoreElement = document.getElementById('live-health-score');
      if (scoreElement) {
        const scoreValue = score.toFixed(1);
        const unitSpan = scoreElement.querySelector('.live-score-unit');
        if (unitSpan) {
          scoreElement.childNodes[0].textContent = scoreValue;
        } else {
          scoreElement.textContent = `${scoreValue}%`;
        }
      }

      // Update legacy score display container color
      const scoreDisplay = document.getElementById('live-score-display');
      if (scoreDisplay) {
        scoreDisplay.classList.remove('score-healthy', 'score-uncertain', 'score-faulty');
        if (score >= 75) {
          scoreDisplay.classList.add('score-healthy');
        } else if (score >= 50) {
          scoreDisplay.classList.add('score-uncertain');
        } else {
          scoreDisplay.classList.add('score-faulty');
        }
      }

      // === NEW DASHBOARD SCORE ELEMENTS ===
      // Update dashboard score (large percentage in right panel)
      const dashboardScore = document.getElementById('live-dashboard-score');
      if (dashboardScore) {
        const roundedScore = Math.round(score);
        dashboardScore.innerHTML = `${roundedScore}<span class="inspection-score-unit">%</span>`;
      }

      // Update dashboard score container color
      const dashboardScoreContainer = document.getElementById('live-dashboard-score-container');
      if (dashboardScoreContainer) {
        dashboardScoreContainer.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
        dashboardScoreContainer.classList.add(statusClass);
      }

      // Update dashboard status text
      const dashboardStatus = document.getElementById('live-dashboard-status');
      if (dashboardStatus) {
        const localizedStatus = normalizedStatus === 'healthy'
          ? t('status.healthy')
          : normalizedStatus === 'uncertain'
            ? t('status.uncertain')
            : normalizedStatus === 'faulty'
              ? t('status.faulty')
              : status;

        const shouldShowState = score >= getMinConfidentMatchScore() && detectedState && detectedState !== 'UNKNOWN';
        const displayState = detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState;

        if (shouldShowState) {
          dashboardStatus.textContent = `${localizedStatus} | ${displayState}`;
        } else {
          dashboardStatus.textContent = localizedStatus;
        }
        dashboardStatus.className = `inspection-status status-${normalizedStatus}`;
      }

      // Sprint 1 UX: Update verbal status in advanced/expert view
      const liveVerbal = document.getElementById('live-verbal-status')
        || document.getElementById('live-dashboard-verbal');
      if (liveVerbal) {
        liveVerbal.textContent = this.getScoreVerbalStatus(score);
      }

      // Update legacy status element
      const statusElement = document.getElementById('live-status');
      if (statusElement) {
        const localizedStatus = normalizedStatus === 'healthy'
          ? t('status.healthy')
          : normalizedStatus === 'uncertain'
            ? t('status.uncertain')
            : normalizedStatus === 'faulty'
              ? t('status.faulty')
              : status;

        // Show detected state if score meets confident match threshold
        const shouldShowState = score >= getMinConfidentMatchScore() && detectedState && detectedState !== 'UNKNOWN';
        const displayState = detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState;

        if (shouldShowState) {
          statusElement.textContent = `${localizedStatus} | ${displayState}`;
        } else {
          statusElement.textContent = localizedStatus;
        }
        statusElement.className = `live-status status-${normalizedStatus}`;
      }

      // === SCORE INVALIDATION (Expert mode) ===
      // When operating point has changed (energy or frequency red), visually
      // invalidate the main score to signal: "Don't trust this score right now"
      if (operatingPointChanged !== undefined) {
        const scoreInvalidClass = 'op-score-invalidated';
        const dashboardScoreEl = document.getElementById('live-dashboard-score-container');
        const invalidBadge = document.getElementById('op-invalid-badge');

        if (dashboardScoreEl) {
          if (operatingPointChanged) {
            dashboardScoreEl.classList.add(scoreInvalidClass);
            // Create or show the invalid badge
            if (!invalidBadge) {
              const badge = document.createElement('div');
              badge.id = 'op-invalid-badge';
              badge.className = 'op-invalid-badge';
              badge.textContent = t('opMonitor.scoreInvalid');
              dashboardScoreEl.parentElement?.appendChild(badge);
            } else {
              invalidBadge.style.display = 'block';
            }
          } else {
            dashboardScoreEl.classList.remove(scoreInvalidClass);
            if (invalidBadge) {
              invalidBadge.style.display = 'none';
            }
          }
        }
      }
    }
  }

  /**
   * Update quality hint based on signal strength
   *
   * Shows dynamic hints to help user improve signal quality:
   * - "Bitte näher an die Maschine gehen" (move closer)
   * - "Position leicht verändern" (change position)
   * - "Gerät ruhig halten" (hold steady)
   */
  private updateQualityHint(): void {
    const hintElement = document.getElementById('inspection-hint');
    if (!hintElement) return;

    // Check signal quality based on magnitude factor
    // magnitudeFactor < 0.5 indicates weak signal
    if (this.lastMagnitudeFactor < 0.3) {
      // Very weak signal - suggest moving closer
      hintElement.textContent = t('inspection.hintMoveCloser');
      hintElement.classList.remove('hint-hidden');
    } else if (this.lastMagnitudeFactor < 0.5) {
      // Weak signal - suggest changing position
      hintElement.textContent = t('inspection.hintChangePosition');
      hintElement.classList.remove('hint-hidden');
    } else {
      // Good signal - hide hint
      hintElement.classList.add('hint-hidden');
    }
  }

  /**
   * Stop recording and save final result
   */
  private stopRecording(): void {
    // CRITICAL FIX: Prevent duplicate calls (e.g., user clicking Stop button twice)
    // This prevents saving the same diagnosis multiple times
    if (this.isSaving) {
      logger.warn('⚠️ Stop already in progress, ignoring duplicate call');
      return;
    }

    this.isSaving = true;
    logger.info('⏹️ Stopping diagnosis...');

    // CRITICAL FIX: Save ALL values BEFORE cleanup (cleanup resets them!)
    const hadValidMeasurement = this.hasValidMeasurement;
    const finalScore = this.lastProcessedScore;
    const finalStatus = this.lastProcessedStatus;
    const scoreHistoryCopy = this.scoreHistory.getAllScores().slice(); // Copy array
    // CRITICAL FIX: Use majority voting for final label instead of last chunk
    const finalDetectedState = this.labelHistory.getMajorityLabel();
    const labelHistoryCopy = this.labelHistory.getAllLabels().slice(); // Copy for debugging

    logger.info(
      `🗳️ Majority voting: ${finalDetectedState} (from ${labelHistoryCopy.length} chunks: ${labelHistoryCopy.slice(-5).join(', ')})`
    );

    // Cleanup resources
    this.cleanup();

    // Save final diagnosis ONLY if we have valid measurement data
    if (hadValidMeasurement) {
      this.saveFinalDiagnosis(finalScore, finalStatus, finalDetectedState, scoreHistoryCopy);
    } else {
      logger.warn('⚠️ No valid measurement data - skipping save');
      this.hideRecordingModal();
    }
  }

  /**
   * Save final diagnosis result
   *
   * MULTICLASS: Includes detected state in metadata
   *
   * CRITICAL FIX: Accepts values as parameters (saved before cleanup)
   *
   * @param finalScore - Health score before cleanup
   * @param finalStatus - Health status before cleanup
   * @param detectedState - Detected state before cleanup
   * @param scoreHistory - Score history array before cleanup
   */
  private async saveFinalDiagnosis(
    finalScore: number,
    finalStatus: 'healthy' | 'uncertain' | 'faulty' | 'UNKNOWN',
    detectedState: string,
    scoreHistory: number[]
  ): Promise<void> {
    try {
      // Validate machine data
      if (!this.machine || !this.machine.id) {
        throw new Error('Machine data is invalid or missing');
      }

      const latestMachine = await getMachine(this.machine.id);
      if (!latestMachine) {
        throw new Error(`Machine not found: ${this.machine.id}`);
      }
      this.machine = latestMachine;

      if (!this.machine.referenceModels || this.machine.referenceModels.length === 0) {
        throw new Error('No reference models available');
      }

      // Use the passed values (saved before cleanup)

      // Get classification details
      const classification = getClassificationDetails(finalScore);

      // UX FIX: Hide detected state if score below confident match threshold
      const effectiveDetectedState = finalScore >= getMinConfidentMatchScore() ? detectedState : 'UNKNOWN';

      // MULTICLASS: Generate hint based on detected state
      let hint = classification.recommendation;
      if (effectiveDetectedState !== 'UNKNOWN') {
        if (finalStatus === 'healthy') {
          hint = t('diagnose.analysis.healthyMatch', { state: effectiveDetectedState, score: finalScore.toFixed(1) });
        } else if (finalStatus === 'faulty') {
          hint = t('diagnose.analysis.faultyMatch', { state: effectiveDetectedState, score: finalScore.toFixed(1) });
        }
      }

      // Create diagnosis result
      // CRITICAL FIX: Add random suffix to prevent ID collisions
      // If multiple diagnoses are saved in the same millisecond, they would collide
      // without a random suffix (e.g., rapid automated testing or high-frequency monitoring)
      const randomSuffix = Math.random().toString(36).substring(2, 9);

      // CRITICAL FIX: Ensure status is valid for DiagnosisResult (never 'UNKNOWN')
      // If finalStatus is somehow still 'UNKNOWN', default to 'uncertain'
      const validStatus: 'healthy' | 'uncertain' | 'faulty' =
        finalStatus === 'UNKNOWN' ? 'uncertain' : finalStatus;

      const diagnosis: DiagnosisResult = {
        id: `diag-${Date.now()}-${randomSuffix}`,
        machineId: this.machine.id,
        timestamp: Date.now(),
        healthScore: finalScore,
        status: validStatus,
        confidence: classification.confidence,
        rawCosineSimilarity: 0, // Not stored for real-time
        metadata: {
          processingMode: 'real-time',
          totalScores: scoreHistory.length,
          scoreHistory: scoreHistory.slice(-10), // Use passed scoreHistory (saved before cleanup)
          detectedState: effectiveDetectedState, // MULTICLASS: Store detected state (UNKNOWN if score < 70%)
          multiclassMode: true,
          evaluatedModels: this.activeModels.length,
        },
        analysis: {
          hint,
        },
      };

      logger.info(
        `💾 Saving final diagnosis: ${finalScore.toFixed(1)}% | State: ${detectedState} (${finalStatus})`
      );

      // Save to database
      await saveDiagnosis(diagnosis);

      // Hide modal
      this.hideRecordingModal();

      // Show results
      this.showResults(diagnosis);

      // Sprint 1 UX: Diagnosis completion confirmation
      notify.success(t('diagnose.compareComplete'), {
        duration: 3000,
      });

      // UX improvement: One-time score explanation after first QC diagnosis
      if (this.qcGoldStandardName && !DiagnosePhase.scoreExplanationShown) {
        DiagnosePhase.scoreExplanationShown = true;
        setTimeout(() => {
          notify.info(t('quickCompare.scoreExplanation.hint', { score: String(Math.round(finalScore)) }), {
            duration: 6000,
          });
        }, 500);
      }

      logger.info('✅ Diagnosis saved successfully!');

      // Sprint 5: Fire fleet queue callback if set
      if (this.onDiagnosisComplete) {
        this.onDiagnosisComplete(diagnosis);
      }
    } catch (error) {
      logger.error('Save error:', error);
      notify.error(t('diagnose.saveFailed'), error as Error, {
        title: t('modals.saveError'),
        duration: 0,
      });
      this.hideRecordingModal();
    } finally {
      // CRITICAL FIX: Reset flag after save completes (success or error)
      // This allows future diagnoses to be saved
      this.isSaving = false;
    }
  }

  /**
   * Render camera and score layout (shared between basic and advanced views)
   * Returns HTML string for the 2-column layout
   */
  private renderCameraAndScoreLayout(): string {
    // --- LEFT: Camera with Ghost Overlay ---
    let cameraHTML = '';
    if (this.cameraStream && this.machine.referenceImage) {
      const imageUrl = URL.createObjectURL(this.machine.referenceImage);
      cameraHTML = `
        <div class="ghost-overlay-container" id="ghost-overlay-container">
          <div class="ghost-overlay-wrapper">
            <video id="diagnosis-video" autoplay playsinline muted></video>
            <img id="ghost-overlay-image" class="ghost-overlay-image" src="${imageUrl}" />
          </div>
        </div>
      `;
    } else {
      cameraHTML = `
        <div style="text-align: center; padding: var(--spacing-sm); color: var(--text-muted); font-size: 0.75rem;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 4px;">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <div>${t('diagnose.display.noCameraAvailable')}</div>
        </div>
      `;
    }

    return `
      <div class="diagnosis-dashboard-grid">
        <div class="dashboard-left-cam">
          <div class="diagnosis-middle-camera">
            ${cameraHTML}
          </div>
        </div>
        <div class="dashboard-right-score">
          <div class="inspection-score-container" id="inspection-score-container">
            <!-- Pulse Animation Rings -->
            <div class="inspection-pulse-animation">
              <div class="inspection-pulse-ring"></div>
              <div class="inspection-pulse-ring"></div>
              <div class="inspection-pulse-ring"></div>
            </div>
            <!-- Score Value -->
            <span class="inspection-score" id="inspection-score">--<span class="inspection-score-unit">%</span></span>
          </div>
          <div class="inspection-status" id="inspection-status-label">${t('common.initializing')}</div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize camera video element after rendering
   */
  private initCamera(): void {
    if (!this.cameraStream) return;

    const video = document.getElementById('diagnosis-video') as HTMLVideoElement | null;
    if (video) {
      video.srcObject = this.cameraStream;
      logger.info('✅ Camera video element initialized');
    }
  }

  /**
   * Show simplified inspection modal (redesigned PWA view)
   *
   * Layout: Fixed header, 2-column layout (camera + score), fixed footer
   * Focus on: Clear question, camera with ghost overlay, large percentage, STOP button
   *
   * NEW: Now includes camera view with ghost overlay for positioning assistance
   */
  private showInspectionModal(): void {
    // Hide recording modal (in case it was shown before)
    const recordingModal = document.getElementById('recording-modal');
    if (recordingModal) {
      recordingModal.style.display = 'none';
    }

    const modal = document.getElementById('inspection-modal');
    if (modal) {
      modal.style.display = 'flex';
    }

    // Update machine name
    const machineNameElement = document.getElementById('inspection-machine-name');
    if (machineNameElement) {
      machineNameElement.textContent = this.machine.name;
    }

    // Set initial subtitle (initializing state) – show QC comparison context if available
    const subtitleElement = document.getElementById('inspection-subtitle');
    if (subtitleElement) {
      if (this.qcGoldStandardName) {
        subtitleElement.textContent = t('quickCompare.inspectionReference.comparingWith', { name: this.qcGoldStandardName });
      } else {
        subtitleElement.textContent = t('inspection.subtitleInitializing');
      }
    }

    // Set reference state info
    const referenceValueElement = document.getElementById('inspection-reference-value');
    if (referenceValueElement && this.activeModels.length > 0) {
      // Get the baseline/primary reference model label
      const baselineModel = this.activeModels.find(m => m.label === 'Baseline') || this.activeModels[0];
      const referenceLabel = baselineModel.label === 'Baseline'
        ? t('inspection.referenceDefault')
        : baselineModel.label;
      referenceValueElement.textContent = referenceLabel;
    }

    // NEW: Insert camera and score layout
    const contentElement = document.getElementById('inspection-content');
    if (contentElement) {
      // Check if layout already exists (prevent duplicate insertion)
      if (!contentElement.querySelector('.diagnosis-dashboard-grid')) {
        const layoutHTML = this.renderCameraAndScoreLayout();
        // Insert before the hint element
        const hintElement = document.getElementById('inspection-hint');
        if (hintElement) {
          hintElement.insertAdjacentHTML('beforebegin', layoutHTML);
        } else {
          contentElement.insertAdjacentHTML('afterbegin', layoutHTML);
        }

        // Initialize camera video element
        this.initCamera();

        // Ghost overlay hint: show once per session when overlay is visible (as toast, not overlay)
        if (this.cameraStream && this.machine.referenceImage && !DiagnosePhase.ghostOverlayHintShown) {
          DiagnosePhase.ghostOverlayHintShown = true;
          notify.info(t('quickCompare.ghostOverlay.hint'), { duration: 5000 });
        }

        // Add reference info line (same position as advanced/expert view)
        const rightScore = contentElement.querySelector('.dashboard-right-score');
        if (rightScore) {
          const refInfo = document.createElement('div');
          refInfo.className = 'inspection-ref-info';
          refInfo.id = 'inspection-ref-info';
          refInfo.textContent = `${t('diagnose.display.reference')}: ${this.machine.name}`;
          rightScore.appendChild(refInfo);
        }
      }

      contentElement.classList.add('is-initializing');
    }

    // Setup stop button
    const stopBtn = document.getElementById('inspection-stop-btn');
    if (stopBtn) {
      stopBtn.onclick = () => this.stopRecording();
    }

    // Hide quality hint initially
    const hintElement = document.getElementById('inspection-hint');
    if (hintElement) {
      hintElement.classList.add('hint-hidden');
    }

    logger.info('✅ Inspection modal shown with camera and score layout');
  }

  /**
   * Show the appropriate modal based on view level
   *
   * - basic: Simplified inspection modal (new design)
   * - advanced/expert: Original recording modal with technical details
   *
   * IMPORTANT: useSimplifiedView must be set BEFORE calling this method.
   * The flag is calculated in startDiagnosis() considering NFC mode and user settings.
   */
  private showRecordingModal(): void {
    // Use pre-calculated useSimplifiedView flag (set in startDiagnosis)
    // This ensures NFC-initiated diagnoses always use simplified view
    if (this.useSimplifiedView) {
      this.showInspectionModal();
    } else {
      this.showAdvancedRecordingModal();
    }

    // Sprint 1 UX: Tap on score shows explanation toast
    const scoreDisplay = document.getElementById('health-gauge-canvas')
      || document.getElementById('inspection-score-container')
      || document.getElementById('live-dashboard-score-container');

    if (scoreDisplay && !scoreDisplay.dataset.scoreTapBound) {
      scoreDisplay.dataset.scoreTapBound = 'true';
      scoreDisplay.addEventListener('click', () => {
        notify.info(t('healthScore.explain'), {
          title: t('healthScore.explainTitle'),
          duration: 8000,
        });
      });
    }
  }

  /**
   * Show the advanced/expert recording modal with dashboard layout
   * Split-Layout: Camera (left) + Score (right) | Spectrum (below) | Expert debug (below)
   * Expert view adds scrollable details below spectrum
   */
  private showAdvancedRecordingModal(): void {
    // Hide inspection modal (in case it was shown before)
    const inspectionModal = document.getElementById('inspection-modal');
    if (inspectionModal) {
      inspectionModal.style.display = 'none';
    }

    const modal = document.getElementById('recording-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Add diagnosis-active class to body for CSS targeting
    document.body.classList.add('diagnosis-active');

    // Update machine name in modal subtitle
    const machineIdElement = document.getElementById('machine-id');
    if (machineIdElement) {
      machineIdElement.textContent = this.machine.name;
      logger.debug('✅ Modal machine name updated:', this.machine.name);
    }

    // Update button text and behavior
    const stopBtn = document.getElementById('stop-recording-btn');
    if (stopBtn) {
      stopBtn.textContent = BUTTON_TEXT.STOP_DIAGNOSE;
      stopBtn.onclick = () => this.stopRecording();
    }

    // Update modal title
    const modalTitle = document.querySelector('#recording-modal .modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = MODAL_TITLE.RECORDING_DIAGNOSE;
    }

    // Get modal body and rebuild with structured layout
    const modalBody = document.querySelector('#recording-modal .modal-body') as HTMLElement;
    if (!modalBody || modal.querySelector('.diagnosis-structured-content')) return;

    // Hide original elements that we'll reorganize
    const waveformCanvas = document.getElementById('waveform-canvas');
    const gaugeCanvas = document.getElementById('health-gauge-canvas');
    const recordingStatus = modalBody.querySelector('.recording-status') as HTMLElement;
    const recordingTimer = modalBody.querySelector('.recording-timer') as HTMLElement;

    if (waveformCanvas) waveformCanvas.style.display = 'none';
    if (gaugeCanvas) gaugeCanvas.style.display = 'none';
    if (recordingStatus) recordingStatus.style.display = 'none';
    if (recordingTimer) recordingTimer.style.display = 'none';

    // Build structured content container
    const structuredContent = document.createElement('div');
    structuredContent.className = 'diagnosis-structured-content';
    structuredContent.style.cssText = 'display: flex; flex-direction: column; height: 100%; gap: var(--spacing-sm);';

    // === DASHBOARD GRID: Camera (left) + Score (right) ===
    // Use shared rendering method for consistency with basic view
    const dashboardContainer = document.createElement('div');
    dashboardContainer.innerHTML = this.renderCameraAndScoreLayout();
    const dashboardGrid = dashboardContainer.firstElementChild as HTMLElement;

    // Update score container IDs for advanced view (to maintain existing updateLiveDisplay logic)
    const scoreContainer = dashboardGrid.querySelector('#inspection-score-container');
    const scoreElement = dashboardGrid.querySelector('#inspection-score');
    const statusElement = dashboardGrid.querySelector('#inspection-status-label');

    if (scoreContainer) scoreContainer.id = 'live-dashboard-score-container';
    if (scoreElement) scoreElement.id = 'live-dashboard-score';
    if (statusElement) {
      statusElement.id = 'live-dashboard-status';
      statusElement.textContent = t('diagnose.display.waitingForSignal');
    }

    // Add reference info line for advanced view
    const rightScore = dashboardGrid.querySelector('.dashboard-right-score');
    if (rightScore) {
      const refInfo = document.createElement('div');
      refInfo.className = 'inspection-ref-info';
      refInfo.id = 'live-dashboard-ref';
      refInfo.textContent = `${t('diagnose.display.reference')}: ${this.machine.name}`;
      rightScore.appendChild(refInfo);
    }

    // === SCROLLABLE AREA: Camera+Score + Spectrum + Expert Debug ===
    // Wraps dashboard grid, spectrum, and expert panel in one scroll container
    // so the user can scroll through all content as a unit
    const scrollableArea = document.createElement('div');
    scrollableArea.className = 'diagnosis-scrollable-area';

    // Dashboard grid (camera + score) is part of the scrollable area
    scrollableArea.appendChild(dashboardGrid);

    // --- Spectrum: Waveform Visualizer ---
    const spectrumSection = document.createElement('div');
    spectrumSection.className = 'diagnosis-spectrum-container';

    // Sprint 2 UX: Help button for spectrogram (Advanced/Expert)
    const spectroHelp = document.createElement('button');
    spectroHelp.className = 'help-icon-btn help-icon-inline';
    spectroHelp.setAttribute('aria-label', t('help.spectrogram.title'));
    spectroHelp.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    spectroHelp.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.spectrogram.title'),
        content: t('help.spectrogram.body'),
        icon: 'ℹ️',
      });
    });
    spectrumSection.appendChild(spectroHelp);

    if (waveformCanvas) {
      waveformCanvas.style.display = 'block';
      spectrumSection.appendChild(waveformCanvas);
    }
    scrollableArea.appendChild(spectrumSection);

    // --- Expert Debug Stats: Only shown in expert view level ---
    const currentViewLevel = getViewLevel();
    if (currentViewLevel === 'expert') {
      const dateLocale = getLocale();
      const refModelInfo = this.activeModels.length > 0
        ? this.activeModels.map(m => {
            const trainingDate = new Date(m.trainingDate).toLocaleString(dateLocale, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            return `${m.label} (${trainingDate})`;
          }).join(', ')
        : t('reference.noModelsYet');

      const expertStats = document.createElement('div');
      expertStats.id = 'expert-debug-stats';
      expertStats.className = 'expert-stats-panel';
      expertStats.innerHTML = `
        <div class="reference-model-info">
          <div style="color: var(--text-muted); margin-bottom: 2px;">${t('diagnose.display.referenceModels')}</div>
          <div style="font-size: 0.9rem; color: var(--text-primary); font-weight: 500;">${refModelInfo}</div>
          <div style="color: var(--text-muted); margin-top: 2px;">${t('diagnose.display.statesTrainedCount', { count: String(this.activeModels.length) })}</div>
        </div>
        <div class="debug-info" data-view-level="expert">
          <div style="color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">${t('diagnose.display.debugValues')}</div>
          <div id="debug-weight-magnitude">${t('diagnose.debug.weightMagnitude', { value: '--' })}</div>
          <div id="debug-feature-magnitude">${t('diagnose.debug.featureMagnitude', { value: '--' })}</div>
          <div id="debug-magnitude-factor">${t('diagnose.debug.magnitudeFactor', { value: '--' })}</div>
          <div id="debug-cosine">${t('diagnose.debug.cosine', { value: '--' })}</div>
          <div id="debug-adjusted-cosine">${t('diagnose.debug.adjustedCosine', { value: '--' })}</div>
          <div id="debug-scaling-constant">${t('diagnose.debug.scalingConstant', { value: '--' })}</div>
          <div id="debug-raw-score">${t('diagnose.debug.rawScorePlaceholder')}</div>
        </div>
      `;
      scrollableArea.appendChild(expertStats);

      // --- Operating Point Monitor: Container for live metrics ---
      const opMonitorContainer = document.createElement('div');
      opMonitorContainer.id = 'op-monitor-container';
      scrollableArea.appendChild(opMonitorContainer);

      // Initialize OperatingPointMetrics calculator
      this.opMetrics = new OperatingPointMetrics(
        this.actualSampleRate,
        this.dspConfig.fftSize,
        this.dspConfig.frequencyBins
      );
    }

    structuredContent.appendChild(scrollableArea);

    // === PIPELINE STATUS DASHBOARD (Expert mode) ===
    if (this.pipelineStatus) {
      this.pipelineStatus.mount(scrollableArea);
      this.pipelineStatus.show();
    }

    // === DRIFT SUMMARY (Advanced mode, simplified 1-line indicator) ===
    if (this.realtimeDrift && currentViewLevel === 'advanced') {
      const driftSummary = document.createElement('div');
      driftSummary.id = 'drift-summary-advanced';
      driftSummary.className = 'drift-summary';
      driftSummary.innerHTML = `
        <span class="drift-summary-icon" id="drift-summary-icon">—</span>
        <span class="drift-summary-text" id="drift-summary-text">${t('drift.initializing')}</span>
      `;

      // Sprint 2 UX: Help button for drift summary (Advanced)
      const driftHelpAdv = document.createElement('button');
      driftHelpAdv.className = 'help-icon-btn help-icon-inline';
      driftHelpAdv.setAttribute('aria-label', t('help.drift.title'));
      driftHelpAdv.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      driftHelpAdv.addEventListener('click', (e) => {
        e.stopPropagation();
        InfoBottomSheet.show({
          title: t('help.drift.title'),
          content: t('help.drift.body'),
          icon: 'ℹ️',
        });
      });
      driftSummary.appendChild(driftHelpAdv);

      scrollableArea.appendChild(driftSummary);
    }

    // === DRIFT INDICATOR PANEL (Expert mode, only when drift detector active) ===
    if (this.realtimeDrift && currentViewLevel === 'expert') {
      const driftPanel = document.createElement('div');
      driftPanel.id = 'drift-indicator-panel';
      driftPanel.className = 'drift-panel';
      driftPanel.style.display = 'none'; // Hidden until first result
      driftPanel.innerHTML = `
        <div class="drift-panel-header">
          <span>${t('drift.title')}</span>
        </div>
        <div class="drift-indicators">
          <div class="drift-row" id="drift-row-global">
            <span class="drift-label">${t('drift.environment')}</span>
            <div class="drift-bar-container">
              <div class="drift-bar" id="drift-bar-global"></div>
            </div>
            <span class="drift-status" id="drift-status-global">—</span>
          </div>
          <div class="drift-row" id="drift-row-local">
            <span class="drift-label">${t('drift.machine')}</span>
            <div class="drift-bar-container">
              <div class="drift-bar" id="drift-bar-local"></div>
            </div>
            <span class="drift-status" id="drift-status-local">—</span>
          </div>
        </div>
        <div class="drift-interpretation" id="drift-interpretation"></div>
        <div class="drift-recommendation" id="drift-recommendation" style="display: none;"></div>
        <div class="drift-details" id="drift-details" style="display: none;">
          <span id="drift-detail-global"></span>
          <span id="drift-detail-local"></span>
        </div>
      `;
      // Sprint 2 UX: Help button in drift panel header (Expert)
      const driftHelpExp = document.createElement('button');
      driftHelpExp.className = 'help-icon-btn help-icon-inline';
      driftHelpExp.setAttribute('aria-label', t('help.drift.title'));
      driftHelpExp.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      driftHelpExp.addEventListener('click', (e) => {
        e.stopPropagation();
        InfoBottomSheet.show({
          title: t('help.drift.title'),
          content: t('help.drift.body'),
          icon: 'ℹ️',
        });
      });
      const driftHeader = driftPanel.querySelector('.drift-panel-header');
      if (driftHeader) {
        driftHeader.appendChild(driftHelpExp);
      }

      scrollableArea.appendChild(driftPanel);

      // Context hint element (below drift panel)
      const hintEl = document.createElement('div');
      hintEl.id = 'drift-context-hint';
      hintEl.className = 'drift-context-hint';
      hintEl.style.display = 'none';
      scrollableArea.appendChild(hintEl);
    }

    // === CONTROLS: Stop Button ===
    const controlsSection = document.createElement('div');
    controlsSection.className = 'diagnosis-controls';
    controlsSection.innerHTML = `<button id="stop-diagnosis-btn" class="btn btn-danger" onclick="document.getElementById('stop-recording-btn')?.click()">${BUTTON_TEXT.STOP_DIAGNOSE}</button>`;
    structuredContent.appendChild(controlsSection);

    // Add structured content to modal body
    modalBody.appendChild(structuredContent);

    // Initialize camera video element (must be done AFTER adding to DOM)
    this.initCamera();

    // Mount Operating Point Monitor AFTER DOM is ready (expert mode only)
    if (currentViewLevel === 'expert' && !this.opMonitor) {
      this.opMonitor = new OperatingPointMonitor('op-monitor-container');
      this.opMonitor.mount();
    }

    logger.info('✅ Advanced recording modal shown with dashboard layout');
  }

  /**
   * Hide inspection modal (and legacy recording modal)
   */
  private hideRecordingModal(): void {
    // Hide inspection modal (new simplified view)
    const inspectionModal = document.getElementById('inspection-modal');
    if (inspectionModal) {
      inspectionModal.style.display = 'none';

      // Reset to initial state for next use
      const contentElement = document.getElementById('inspection-content');
      if (contentElement) {
        contentElement.classList.add('is-initializing');

        // Clean up ghost overlay image URL in basic view
        const ghostImage = contentElement.querySelector('#ghost-overlay-image') as HTMLImageElement | null;
        if (ghostImage && ghostImage.src) {
          URL.revokeObjectURL(ghostImage.src);
        }

        // Remove camera and score layout
        const dashboardGrid = contentElement.querySelector('.diagnosis-dashboard-grid');
        if (dashboardGrid) {
          dashboardGrid.remove();
        }
      }

      // Reset score container classes
      const scoreContainer = document.getElementById('inspection-score-container');
      if (scoreContainer) {
        scoreContainer.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
      }

      // Reset score display
      const scoreElement = document.getElementById('inspection-score');
      if (scoreElement) {
        scoreElement.innerHTML = '--<span class="inspection-score-unit">%</span>';
        scoreElement.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
      }

      // Reset status label
      const statusLabel = document.getElementById('inspection-status-label');
      if (statusLabel) {
        statusLabel.textContent = t('common.initializing');
        statusLabel.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
      }

      // Hide hint
      const hintElement = document.getElementById('inspection-hint');
      if (hintElement) {
        hintElement.classList.add('hint-hidden');
      }
    }

    // Also hide and clean up recording modal (for advanced/expert view)
    const recordingModal = document.getElementById('recording-modal');
    if (recordingModal) {
      recordingModal.style.display = 'none';

      // Remove diagnosis-active class from body
      document.body.classList.remove('diagnosis-active');

      // Clean up structured content (new layout)
      const structuredContent = recordingModal.querySelector('.diagnosis-structured-content');
      if (structuredContent) {
        // Clean up ghost overlay image URL
        const ghostImage = structuredContent.querySelector('#ghost-overlay-image') as HTMLImageElement | null;
        if (ghostImage && ghostImage.src) {
          URL.revokeObjectURL(ghostImage.src);
        }

        // Move waveform canvas back to modal body before removing structured content
        const waveformCanvas = structuredContent.querySelector('#waveform-canvas');
        const modalBody = recordingModal.querySelector('.modal-body');
        if (waveformCanvas && modalBody) {
          modalBody.insertBefore(waveformCanvas, modalBody.firstChild);
          (waveformCanvas as HTMLElement).style.display = 'none';
        }

        structuredContent.remove();
      }

      // Clean up legacy live display elements (backwards compatibility)
      const liveDisplay = recordingModal.querySelector('.live-display');
      if (liveDisplay) {
        liveDisplay.remove();
      }

      // Clean up legacy ghost overlay elements
      const ghostContainer = recordingModal.querySelector('#ghost-overlay-container');
      if (ghostContainer) {
        const ghostImage = ghostContainer.querySelector('#ghost-overlay-image') as HTMLImageElement | null;
        if (ghostImage && ghostImage.src) {
          URL.revokeObjectURL(ghostImage.src);
        }
        ghostContainer.remove();
      }
      const ghostHint = recordingModal.querySelector('.ghost-overlay-hint');
      if (ghostHint) {
        ghostHint.remove();
      }

      // Reset original elements visibility
      const recordingStatus = recordingModal.querySelector('.recording-status') as HTMLElement;
      const recordingTimer = recordingModal.querySelector('.recording-timer') as HTMLElement;
      if (recordingStatus) recordingStatus.style.display = '';
      if (recordingTimer) recordingTimer.style.display = '';
    }

    logger.debug('🧹 Modals hidden and reset');
  }

  /**
   * Show diagnosis results
   */
  private async showResults(diagnosis: DiagnosisResult): Promise<void> {
    const modal = document.getElementById('diagnosis-modal');
    if (!modal) return;

    // Update machine info
    const machineBarcode = document.getElementById('machine-barcode');
    if (machineBarcode) {
      machineBarcode.textContent = this.machine.name;
    }

    // Draw final health gauge
    const gaugeCanvas = document.getElementById('health-gauge-canvas');
    if (gaugeCanvas) {
      if (this.healthGauge) {
        this.healthGauge.destroy();
      }
      this.healthGauge = new HealthGauge('health-gauge-canvas');
      this.healthGauge.draw(diagnosis.healthScore, diagnosis.status);
    }

    // Update status
    const resultStatus = document.getElementById('result-status');
    if (resultStatus) {
      // Translate technical status to localized display text
      const normalizedStatus = diagnosis.status.toLowerCase();
      const localizedStatus = normalizedStatus === 'healthy'
        ? t('status.healthy')
        : normalizedStatus === 'uncertain'
          ? t('status.uncertain')
          : normalizedStatus === 'faulty'
            ? t('status.faulty')
            : t('status.unknown');

      // MULTICLASS: Show detected state if available
      const detectedState = diagnosis.metadata?.detectedState;
      if (detectedState && detectedState !== 'UNKNOWN') {
        const displayState = detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState;
        resultStatus.textContent = `${localizedStatus} | ${displayState}`;
      } else {
        resultStatus.textContent = localizedStatus;
      }
      // CSS classes use technical terms for correct color styling
      resultStatus.className = `result-status status-${normalizedStatus}`;
    }

    // Sprint 1 UX: Add verbal status below score in result modal
    const verbalStatus = document.getElementById('result-verbal-status');
    if (verbalStatus) {
      verbalStatus.textContent = this.getScoreVerbalStatus(diagnosis.healthScore);
    }

    // Sprint 3 UX: Calculate and show trend arrow
    const trendEl = document.getElementById('result-trend');
    if (trendEl) {
      try {
        const recentDiagnoses = await getDiagnosesForMachine(this.machine.id, 6);
        const olderDiagnoses = recentDiagnoses.filter(d => d.id !== diagnosis.id);

        if (olderDiagnoses.length < 1) {
          trendEl.style.display = 'flex';
          const arrowEl = document.getElementById('trend-arrow');
          const textEl = document.getElementById('trend-text');
          if (arrowEl) arrowEl.textContent = '—';
          if (textEl) textEl.textContent = t('trend.noTrend');
          trendEl.className = 'result-trend trend-neutral';
        } else if (olderDiagnoses.length <= 2) {
          trendEl.style.display = 'flex';
          const arrowEl = document.getElementById('trend-arrow');
          const textEl = document.getElementById('trend-text');
          if (arrowEl) arrowEl.textContent = '~';
          if (textEl) textEl.textContent = t('trend.uncertain');
          trendEl.className = 'result-trend trend-neutral';
        } else {
          const currentScore = diagnosis.healthScore;
          const olderScores = olderDiagnoses
            .slice(0, 5)
            .map(d => d.healthScore)
            .sort((a, b) => a - b);
          const medianOlder = olderScores.length % 2 === 0
            ? (olderScores[olderScores.length / 2 - 1] + olderScores[olderScores.length / 2]) / 2
            : olderScores[Math.floor(olderScores.length / 2)];
          const diff = currentScore - medianOlder;

          const arrowEl = document.getElementById('trend-arrow');
          const textEl = document.getElementById('trend-text');
          trendEl.style.display = 'flex';

          if (diff > 3) {
            trendEl.className = 'result-trend trend-up';
            if (arrowEl) arrowEl.textContent = '↗';
            if (textEl) textEl.textContent = t('trend.improving');
          } else if (diff < -3) {
            trendEl.className = 'result-trend trend-down';
            if (arrowEl) arrowEl.textContent = '↘';
            if (textEl) textEl.textContent = t('trend.declining');
          } else {
            trendEl.className = 'result-trend trend-stable';
            if (arrowEl) arrowEl.textContent = '→';
            if (textEl) textEl.textContent = t('trend.stable');
          }
        }
      } catch (error) {
        logger.warn('Could not calculate trend:', error);
        trendEl.style.display = 'none';
      }
    }

    // Environment match hint (all view levels)
    const envMatchEl = document.getElementById('env-match-result');
    if (envMatchEl) {
      if (this.environmentWarning && this.environmentWarning.severity !== 'ok') {
        envMatchEl.style.display = '';

        const severity = this.environmentWarning.severity;
        const ratio = this.environmentWarning.ratio;

        // Direction-aware text
        let textKey: string;
        if (severity === 'critical') {
          textKey = 'results.envMatch.critical';
        } else if (ratio > 1) {
          textKey = 'results.envMatch.moreReverberant';
        } else {
          textKey = 'results.envMatch.lessReverberant';
        }

        envMatchEl.textContent = t(textKey);
        envMatchEl.className = 'env-match-result';
        envMatchEl.classList.add(`env-match-${severity}`);
      } else {
        // severity === 'ok' OR no environmentWarning (T60 not available)
        envMatchEl.style.display = 'none';
      }
    }

    // Sprint 3 UX: Operating point hint in result modal (Expert only)
    const opHintResult = document.getElementById('op-hint-result');
    if (opHintResult) {
      const currentViewLevel = document.body.dataset.viewLevel || 'basic';
      if (currentViewLevel === 'expert' && this.opChangedDuringDiagnosis) {
        opHintResult.style.display = '';
        opHintResult.textContent = t('diagnose.opHint.changed');
      } else {
        opHintResult.style.display = 'none';
      }
    }

    // Update confidence
    const resultConfidence = document.getElementById('result-confidence');
    if (resultConfidence) {
      resultConfidence.textContent = diagnosis.confidence.toFixed(1);
    }

    // Update analysis hint
    const analysisHint = document.getElementById('analysis-hint');
    if (analysisHint) {
      // MULTICLASS: Use diagnosis.analysis.hint if available (contains detected state info)
      if (diagnosis.analysis?.hint) {
        analysisHint.textContent = diagnosis.analysis.hint;
      } else {
        // Fallback to old method
        const classification = getClassificationDetails(diagnosis.healthScore);
        analysisHint.textContent = classification.recommendation;
      }
    }

    // Show modal BEFORE drawing canvas/ranking — elements inside a display:none
    // ancestor return 0×0 from getBoundingClientRect(), which caused the canvas
    // to render at zero size (visible only as a gray background).
    modal.style.display = 'flex';

    // Draw frequency spectrum on analysis canvas (must be after modal is visible)
    this.drawAnalysisCanvas(diagnosis);

    // Update Work Point Ranking (Advanced/Expert view)
    this.updateWorkPointRanking();

    // Setup close button
    const closeBtn = document.getElementById('close-diagnosis-modal');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = 'none';
        // Cleanup ranking when modal closes
        if (this.workPointRanking) {
          this.workPointRanking.destroy();
          this.workPointRanking = null;
        }
      };
    }

    // Setup footer close button
    const closeResultBtn = document.getElementById('close-diagnosis-result-btn');
    if (closeResultBtn) {
      closeResultBtn.onclick = () => {
        modal.style.display = 'none';
        if (this.workPointRanking) {
          this.workPointRanking.destroy();
          this.workPointRanking = null;
        }
      };
    }

    // Setup view history button
    const viewHistoryBtn = document.getElementById('view-history-btn');
    if (viewHistoryBtn) {
      viewHistoryBtn.onclick = () => {
        this.showHistoryChart();
      };
    }
  }

  /**
   * Draw frequency spectrum visualization on the analysis canvas.
   * Shows the measured frequency energy distribution with color-coded
   * bars based on the diagnosis status.
   */
  private drawAnalysisCanvas(diagnosis: DiagnosisResult): void {
    const canvas = document.getElementById('analysis-canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.lastFeatureVector) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution to match display size (avoid blurry rendering)
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const features = this.lastFeatureVector.features;
    const bins = features.length;
    if (bins === 0) return;

    // Downsample bins to fit display width (group bins together)
    const barCount = Math.min(bins, Math.floor(displayWidth / 2));
    const binsPerBar = bins / barCount;
    const downsampled: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * binsPerBar);
      const end = Math.floor((i + 1) * binsPerBar);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += features[j];
      }
      downsampled.push(sum / (end - start));
    }

    // Find max value for normalization
    const maxVal = Math.max(...downsampled, 1e-10);

    // Choose color based on diagnosis status
    const statusColors: Record<string, { bar: string; glow: string }> = {
      healthy: { bar: '#00E676', glow: 'rgba(0, 230, 118, 0.3)' },
      uncertain: { bar: '#FFA726', glow: 'rgba(255, 167, 38, 0.3)' },
      faulty: { bar: '#FF5252', glow: 'rgba(255, 82, 82, 0.3)' },
    };
    const colors = statusColors[diagnosis.status] || statusColors.uncertain;

    // Draw bars
    const barWidth = displayWidth / barCount;
    const padding = Math.max(0.5, barWidth * 0.1);

    for (let i = 0; i < barCount; i++) {
      const normalizedHeight = (downsampled[i] / maxVal) * (displayHeight - 4);
      const barHeight = Math.max(1, normalizedHeight);
      const x = i * barWidth + padding / 2;
      const y = displayHeight - barHeight;

      // Subtle glow effect
      ctx.fillStyle = colors.glow;
      ctx.fillRect(x, y - 1, barWidth - padding, barHeight + 1);

      // Main bar
      ctx.fillStyle = colors.bar;
      ctx.globalAlpha = 0.4 + 0.6 * (downsampled[i] / maxVal);
      ctx.fillRect(x, y, barWidth - padding, barHeight);
      ctx.globalAlpha = 1.0;
    }

    // Draw frequency axis labels
    const freqRange = this.lastFeatureVector.frequencyRange;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'top';

    const freqLabels = [0, 5, 10, 15, 20];
    for (const kHz of freqLabels) {
      const freq = kHz * 1000;
      if (freq > freqRange[1]) break;
      const xPos = (freq / freqRange[1]) * displayWidth;
      ctx.fillText(`${kHz}k`, xPos + 2, 2);
    }
  }

  /**
   * Update Work Point Ranking component with all model scores
   *
   * This provides a detailed view of all trained machine states
   * and their probability scores for Advanced/Expert users.
   */
  private updateWorkPointRanking(): void {
    // Check if we have the necessary data
    if (!this.lastFeatureVector || !this.activeModels || this.activeModels.length === 0) {
      logger.debug('📊 WorkPointRanking: No feature vector or models available');
      return;
    }

    // Get all model scores
    const modelScores = getAllModelScores(
      this.activeModels,
      this.lastFeatureVector,
      this.actualSampleRate
    );

    if (modelScores.length === 0) {
      logger.debug('📊 WorkPointRanking: No scores calculated');
      return;
    }

    // Convert to WorkPoint format
    const workPoints: WorkPoint[] = modelScores.map((score) => ({
      name: score.label === 'Baseline' ? t('reference.labels.baseline') : score.label,
      score: score.score,
      isHealthy: score.isHealthy,
      metadata: {
        trainingDate: score.trainingDate,
      },
    }));

    // Initialize or update ranking component
    const container = document.getElementById('work-point-ranking-container');
    if (!container) {
      logger.warn('📊 WorkPointRanking: Container not found');
      return;
    }

    // Create ranking if not exists
    if (!this.workPointRanking) {
      this.workPointRanking = new WorkPointRanking('work-point-ranking-container', {
        animate: true,
        showRankNumbers: true,
        maxItems: 10,
      });
    }

    // Update with new data
    this.workPointRanking.update(workPoints);

    logger.info(`📊 WorkPointRanking updated with ${workPoints.length} states`);
  }

  /**
   * Show history chart modal with machine diagnosis history
   */
  private async showHistoryChart(): Promise<void> {
    try {
      logger.info('📈 Loading history chart...');

      // Fetch diagnosis history for this machine
      const diagnoses = await getDiagnosesForMachine(this.machine.id, 50); // Last 50 diagnoses

      if (!diagnoses || diagnoses.length === 0) {
        notify.info(t('historyChart.noDataMessage'));
        return;
      }

      logger.info(`📈 Loaded ${diagnoses.length} diagnoses for history chart`);

      // Open history chart modal
      const modal = document.getElementById('history-chart-modal');
      if (!modal) {
        logger.error('❌ History chart modal not found');
        return;
      }

      // Update machine name
      const machineNameEl = document.getElementById('history-machine-name');
      if (machineNameEl) {
        machineNameEl.textContent = this.machine.name;
      }

      // Update data count
      const dataCountEl = document.getElementById('history-data-count');
      if (dataCountEl) {
        dataCountEl.textContent = diagnoses.length.toString();
      }

      // Update time range
      const timeRangeEl = document.getElementById('history-time-range');
      if (timeRangeEl && diagnoses.length > 0) {
        const firstDate = new Date(diagnoses[0].timestamp);
        const lastDate = new Date(diagnoses[diagnoses.length - 1].timestamp);
        const formatDate = (date: Date): string => {
          return date.toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        };
        timeRangeEl.textContent = `${formatDate(firstDate)} - ${formatDate(lastDate)}`;
      }

      // Show modal BEFORE initializing chart (canvas needs to be visible)
      modal.style.display = 'flex';

      // Initialize history chart
      if (this.historyChart) {
        this.historyChart.destroy();
      }
      this.historyChart = new HistoryChart('history-chart-canvas');
      this.historyChart.draw(diagnoses, true);

      // Setup close buttons
      const closeBtn = document.getElementById('close-history-chart-modal');
      const closeActionBtn = document.getElementById('close-history-chart-btn');

      const closeHandler = (): void => {
        modal.style.display = 'none';
        // Cleanup chart when modal closes
        if (this.historyChart) {
          this.historyChart.destroy();
          this.historyChart = null;
        }
      };

      if (closeBtn) {
        closeBtn.onclick = closeHandler;
      }
      if (closeActionBtn) {
        closeActionBtn.onclick = closeHandler;
      }

      logger.info('✅ History chart displayed successfully');
    } catch (error) {
      logger.error('❌ Failed to show history chart:', error);
      notify.error(t('historyChart.errorMessage'), error);
    }
  }

  private applyAppShellLayout(): void {
    const modal = document.getElementById('diagnosis-modal');
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

    // CRITICAL FIX: Remove event listener to prevent stacking on re-init
    if (this.diagnoseButtonClickHandler) {
      const diagnoseBtn = document.getElementById('diagnose-btn');
      if (diagnoseBtn) {
        diagnoseBtn.removeEventListener('click', this.diagnoseButtonClickHandler);
      }
      this.diagnoseButtonClickHandler = null;
    }

    // Destroy visualizer
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }

    // Cleanup health gauge instance to prevent leaks
    if (this.healthGauge) {
      this.healthGauge.destroy();
      this.healthGauge = null;
    }

    // Cleanup history chart
    if (this.historyChart) {
      this.historyChart.destroy();
      this.historyChart = null;
    }

    // Cleanup work point ranking
    if (this.workPointRanking) {
      this.workPointRanking.destroy();
      this.workPointRanking = null;
    }
    this.lastFeatureVector = null;

    // Clear score history
    this.scoreHistory.clear();
    this.labelHistory.clear(); // CRITICAL FIX: Clear label history
  }
}
