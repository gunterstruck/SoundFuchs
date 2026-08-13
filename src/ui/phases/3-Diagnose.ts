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
  classifyHealthStatus,
  getMinConfidentMatchScore,
  type WorkPointScore,
} from '@core/ml/scoring.js';
import {
  classifyWithEngines,
  scoreAllWithEngines,
  getModelWeightVector,
  getAsyncEngine,
} from '@core/ml/engine/registry.js';
import { RollingAudioBuffer } from '@core/dsp/resample.js';
import { assessRecordingQuality } from '@core/ml/qualityCheck.js';
import {
  renderAnalysisCanvas,
  dominantFrequency,
  topDeviationHz,
  topDeviations,
} from './analysisRender.js';
import { showMaintenanceExportChoice } from './maintenanceExport.js';
import { getScoreVerbalStatus } from './diagnoseScore.js';
import { setMeasurementActive } from '@utils/measurementActivity.js';
import { WorkPointRanking, type WorkPoint } from '@ui/components/WorkPointRanking.js';
import { OperatingPointMetrics } from '@core/dsp/operatingPointMetrics.js';
import { OperatingPointMonitor } from '@ui/components/OperatingPointMonitor.js';
import { EventTimeline } from '@ui/components/EventTimeline.js';
import type {
  TemporalEventsMetadata,
  TemporalCycleMetadata,
} from '@core/ml/engine/TemporalEngine.js';
import {
  saveDiagnosis,
  getMachine,
  getDiagnosesForMachine,
  getRecordingsForMachine,
  saveRecording,
  deleteRecording,
} from '@data/db.js';
import { getDiagnosisAudioMode } from '@utils/diagnosisAudioSettings.js';
import { SlowListenPlayer } from '@core/audio/slowListen.js';
import { isolateDifference } from '@core/audio/differenceIsolation.js';
import { getDifferenceTake } from '@core/audio/differenceTake.js';
import { partitionModels } from '@core/ml/modelCompatibility.js';
import { resolutionLineState } from './resolutionLine.js';
import { planTranspose } from '@core/audio/audibleTranspose.js';
import { peakFrequencyFine } from '@core/dsp/fineSpectrogram.js';
import { Spectrogram3DPanel } from '../components/Spectrogram3DPanel.js';
import { formatHz } from '@utils/formatHz.js';
import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import { renderMachineFingerprint } from '@ui/components/MachineFingerprint.js';
import { HealthGauge } from '@ui/components/HealthGauge.js';
import { HistoryChart } from '@ui/components/HistoryChart.js';
import {
  getRawAudioStream,
  getSmartStartStatusMessage,
  DEFAULT_SMART_START_CONFIG,
} from '@core/audio/audioHelper.js';
import { AudioWorkletManager, isAudioWorkletSupported } from '@core/audio/audioWorkletHelper.js';
import { notify } from '@utils/notifications.js';
import type { Machine, DiagnosisResult, ReferenceModel, FeatureVector } from '@data/types.js';
import { isGMIAModel } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { BUTTON_TEXT, MODAL_TITLE } from '@ui/constants.js';
import { stopMediaStream, closeAudioContext } from '@utils/streamHelper.js';
import { t, getLocale } from '../../i18n/index.js';
import { getViewLevel, isViewLevelAtLeast } from '@utils/viewLevelSettings.js';
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
} from '@core/dsp/roomCompensation.js';
import type { T60Estimate, EnvironmentComparisonResult } from '@core/dsp/roomCompensation.js';
import { getCherryPickSettings, RealtimeCherryPick } from '@core/dsp/cherryPicking.js';
import {
  RealtimeNoiseSubtraction,
  RealtimeMinStatsSubtraction,
  getNoiseSubtractionSettings,
  getActiveNoiseProfile,
  isProfileCompatible,
  isProfileStale,
  profileAgeDays,
  noiseReferenceOverlap,
  OVERLAP_WARN_THRESHOLD,
} from '@core/dsp/noiseProfile.js';
import { PipelineStatusDashboard } from '@ui/components/PipelineStatus.js';
import {
  RealtimeDriftDetector,
  getDriftSettings,
  type DriftResult,
  type DriftDetectorSettings,
  type RefDriftBaseline,
} from '@core/dsp/driftDetector.js';
import { hapticForScore } from '@utils/haptics.js';
import { escapeHtml } from '@utils/sanitize.js';

/** Minimal placeholder feature for the YAMNet path (which ignores spectral features). */
const EMPTY_FEATURE: FeatureVector = {
  features: new Float64Array(0),
  absoluteFeatures: new Float64Array(0),
  bins: 0,
  frequencyRange: [0, 0],
};

export class DiagnosePhase {
  private machine: Machine;
  private selectedDeviceId: string | undefined; // Selected microphone device ID
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null; // VISUAL POSITIONING: Camera stream for ghost overlay
  private audioWorkletManager: AudioWorkletManager | null = null;
  private visualizer: AudioVisualizer | null = null; // Used in advanced/expert view
  private revealVisualizer: AudioVisualizer | null = null; // basic view "look closer" spectrum
  private slowListenPlayer: SlowListenPlayer | null = null; // A/B listening on the result screen
  private spectro3dPanel: Spectrogram3DPanel | null = null; // 3D-Gebirge on the result screen
  // "Hear the difference": capture the diagnosis audio (fully decoupled from the
  // scoring pipeline via MediaRecorder) for A/B playback against the reference.
  private diagnosisRecorder: MediaRecorder | null = null;
  private diagnosisAudioChunks: Blob[] = [];
  private lastDiagnosisAudioBuffer: AudioBuffer | null = null;
  private diagnosisAudioPromise: Promise<AudioBuffer | null> | null = null;
  private listenPlayingKey: string | null = null;
  private healthGauge: HealthGauge | null = null;
  private historyChart: HistoryChart | null = null;
  private activeModels: ReferenceModel[] = [];
  // Tier 1 (YAMNet) — separate async diagnosis path. Sync engines never touch these.
  private diagnosisIsYamnet = false;
  private yamnetBuffer: RollingAudioBuffer | null = null;
  private yamnetBusy = false;
  // Last per-state YAMNet scores (the async engine produces no ESD feature
  // vector, so the expert work-point ranking reuses these instead).
  private lastYamnetScores: WorkPointScore[] | null = null;

  // Simplified inspection view state
  private lastMagnitudeFactor: number = 0;
  private useSimplifiedView: boolean = true; // Determined by view level at start

  // Real-time processing
  private isProcessing: boolean = false;
  private scoreHistory: ScoreHistory;
  // Separate smoothing for the best FAULT-reference match. The main gauge shows
  // closeness to a HEALTHY reference; a confidently matched fault reference is
  // reported separately (and flips the status to faulty even at a high score).
  private faultScoreHistory: ScoreHistory;
  private lastFaultLabel: string = ''; // detected fault state (empty = none)
  private lastFaultScore: number = 0; // its match quality (0 = none)
  // Best fault match REGARDLESS of detection — so the fault line stays visible
  // whenever fault references exist (showing they are actively checked and, when
  // below threshold, ruled out). Empty label = no fault references at all.
  private lastBestFaultLabel: string = '';
  private lastBestFaultScore: number = 0;
  private lastFaultModelsExist: boolean = false;
  // Label der GESUNDEN Referenz, die die Anzeige gespeist hat. Nur dafür da, auf
  // dem Ergebnis-Screen die Auflösung GENAU dieser Referenz nennen zu können —
  // sie ist eine Eigenschaft der Referenz, nicht der App, und unterscheidet sich
  // zwischen zwei Referenzen derselben Maschine.
  private lastHealthyLabel: string = '';
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

  // Reference spectrum (from the stored reference audio) for the expert
  // analysis canvas overlay – only set when real reference audio is available.
  private lastReferenceSpectrum: { data: ArrayLike<number>; nyquist: number } | null = null;

  // Measured spectrum derived from the captured measurement audio. Used as the
  // expert "Frequenzabweichung" curve when the active engine produces no ESD
  // feature vector (e.g. YAMNet works on raw-audio embeddings), so the spectrum
  // comparison stays available regardless of the evaluation method.
  private lastMeasurementSpectrum: { data: ArrayLike<number>; nyquist: number } | null = null;

  // Quality gate: raw (pre room-comp) frames collected during a check, assessed
  // at the end to warn when the measurement signal is too weak / noise-masked.
  private diagnosisQualityFeatures: FeatureVector[] = [];
  private measurementSignalTooWeak = false;

  // Operating Point Monitor (Expert mode only)
  private opMetrics: OperatingPointMetrics | null = null;
  private opMonitor: OperatingPointMonitor | null = null;

  // Ereignis-Zeitleiste (Expert mode, nur Temporal-Engine / Tier 2)
  private eventTimeline: EventTimeline | null = null;

  // Room Compensation (real-time CMN + T60 + Bias Match)
  private realtimeCMN: RealtimeCMN | null = null;
  private realtimeBiasMatch: RealtimeBiasMatch | null = null;
  private realtimeT60: RealtimeT60Subtraction | null = null;
  private roomCompEnabled: boolean = false;
  private currentT60: T60Estimate | null = null;

  // Cherry-Picking (real-time Energy-Entropy Gate)
  private realtimeCherryPick: RealtimeCherryPick | null = null;

  // Noise Profile Subtraction (Pipeline-Stufe 1.5, real-time)
  private realtimeNoiseSub: RealtimeNoiseSubtraction | null = null;
  private realtimeMinStats: RealtimeMinStatsSubtraction | null = null;
  private noiseSubProfileName: string = '';
  private noiseSubContext: {
    staleDays: number | null;
    overlapWarning: boolean;
    deviceMismatch: boolean;
  } | null = null;

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

  /** Welle 2: Optional callback fired when result modal is closed (for dashboard refresh) */
  private onResultModalClosed: (() => void) | null = null;

  /** UX-Fix: Optional callback fired when the explicit "Weiter" button is clicked (for Grundansicht reset) */
  private onResultContinue: (() => void) | null = null;

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
    this.faultScoreHistory = new ScoreHistory();
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
   * Welle 2: Set callback for when result modal is closed (for dashboard refresh)
   */
  public setOnResultModalClosed(cb: () => void): void {
    this.onResultModalClosed = cb;
  }

  /**
   * UX-Fix: Set callback for when the explicit "Weiter" button is clicked (triggers Grundansicht reset)
   */
  public setOnResultContinue(cb: () => void): void {
    this.onResultContinue = cb;
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

    setMeasurementActive(true); // block PWA reload while measuring

    // Sprint 3 UX: Reset operating point change flag for new diagnosis
    this.opChangedDuringDiagnosis = false;

    try {
      // Refresh machine data to ensure latest reference models are loaded
      let latestMachine = await getMachine(this.machine.id);
      if (latestMachine) {
        // Sprint 5: Shared Fleet Reference – load Gold Standard models if configured
        if (latestMachine.fleetReferenceSourceId) {
          const goldStandard = await getMachine(latestMachine.fleetReferenceSourceId);
          if (
            goldStandard &&
            goldStandard.referenceModels &&
            goldStandard.referenceModels.length > 0
          ) {
            logger.info(
              `🏆 Using Gold Standard reference from: ${goldStandard.name} (${goldStandard.id})`
            );
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
            logger.warn(
              `⚠️ Gold Standard ${latestMachine.fleetReferenceSourceId} not found or has no models. Using own reference.`
            );
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
        models:
          this.machine.referenceModels?.map((m) => ({
            label: m.label,
            trainingDate: new Date(m.trainingDate).toLocaleString(),
            sampleRate: m.sampleRate,
            weightMagnitude:
              (isGMIAModel(m) ? m.metadata.weightMagnitude?.toFixed(6) : undefined) || 'N/A',
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
        notify.error(t('diagnose.browserNotCompatible'), new Error('AudioWorklet not supported'), {
          title: t('modals.browserIncompatible'),
          duration: 0,
        });
        return;
      }

      this.isStarting = true;

      // Reset state for new diagnosis
      this.hasValidMeasurement = false;
      this.lastProcessedScore = 0;
      this.lastProcessedStatus = 'UNKNOWN';
      this.lastDetectedState = 'UNKNOWN'; // MULTICLASS: Reset detected state
      this.diagnosisQualityFeatures = [];
      this.measurementSignalTooWeak = false;
      this.scoreHistory.clear();
      this.faultScoreHistory.clear();
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
      const uniqueRates = [...new Set(this.machine.referenceModels.map((m) => m.sampleRate))];
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
          logger.warn(
            '⚠️ Camera access denied – continuing without visual positioning',
            cameraError
          );
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

      // CRITICAL: Validate compatibility with the trained models — sample rate
      // AND feature layout. Beides muss stimmen, sonst rechnet der Cosinus über
      // zwei Vektoren gleicher Länge, die verschiedene Frequenzen beschreiben,
      // und liefert einen plausiblen, bedeutungslosen Score.
      // (YAMNet ist von beidem ausgenommen — Rohaudio, kein Bandraster.)
      const partition = partitionModels(this.machine.referenceModels, this.actualSampleRate);
      this.activeModels = partition.usable;

      if (partition.outdatedLayout.length > 0) {
        logger.warn(
          `⚠️ ${partition.outdatedLayout.length} Referenzmodell(e) mit fremdem Merkmals-Layout ` +
            `– ausgeschlossen, müssen neu angelernt werden: ` +
            partition.outdatedLayout.map((m) => m.label || '(ohne Label)').join(', ')
        );
        if (partition.usable.length === 0) {
          notify.error(
            t('models.layoutOutdated', { count: String(partition.outdatedLayout.length) }),
            new Error('Feature layout mismatch'),
            { duration: 0, title: t('models.layoutOutdatedTitle') }
          );
          this.cleanup();
          return;
        }
        notify.info(
          t('models.layoutOutdatedPartial', {
            count: String(partition.outdatedLayout.length),
          })
        );
      }

      // Ab hier kann nur noch die Sample-Rate der Grund sein: Layout-Fälle sind
      // oben abgefangen, und die Rate-Liste zählt nur die Modelle, deren Layout
      // überhaupt passt — sonst nennte die Meldung Raten von Modellen, die
      // ohnehin nicht in Frage kommen.
      if (this.activeModels.length === 0) {
        const rateList = [...new Set(partition.wrongSampleRate.map((model) => model.sampleRate))]
          .sort((a, b) => a - b)
          .join(', ');
        logger.error(
          `❌ Sample Rate Mismatch: Hardware=${this.actualSampleRate}Hz, ModelRates=[${rateList}]`
        );
        notify.error(
          t('diagnose.sampleRateError', {
            actual: String(this.actualSampleRate),
            expected: rateList,
          }),
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

      if (partition.wrongSampleRate.length > 0) {
        logger.warn(
          `⚠️ Sample Rate Filter: ${this.activeModels.length}/${this.machine.referenceModels.length} Modelle kompatibel (${this.actualSampleRate}Hz)`
        );
      }

      logger.info(
        `✅ Sample Rate validation passed: ${this.actualSampleRate}Hz (matches model training)`
      );

      // Tier 1: detect a YAMNet (embedding) machine → separate async path.
      // Sync engines (GMIA, spectral-cosine) keep the existing path unchanged.
      this.diagnosisIsYamnet =
        this.activeModels.length > 0 &&
        this.activeModels.every((m) => m.engineId === 'yamnet');
      this.lastYamnetScores = null; // fresh ranking per diagnosis
      if (this.diagnosisIsYamnet) {
        this.yamnetBuffer = new RollingAudioBuffer(Math.round(1.1 * this.actualSampleRate));
        // Warm up the model (lazy TF.js + YAMNet load) while the user records.
        void getAsyncEngine('yamnet')
          .init()
          .catch((e) => logger.error('YAMNet init failed:', e));
      }

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
      if (
        roomCompSettings.enabled &&
        roomCompSettings.biasMatchEnabled &&
        this.machine.refLogMean
      ) {
        const muRef = new Float64Array(this.machine.refLogMean);
        this.realtimeBiasMatch = new RealtimeBiasMatch(muRef);
        logger.info(`📊 Session Bias Match activated (refLogMean loaded, ${muRef.length} bins)`);
      }

      // CMN: Only if explicitly enabled AND bias match is NOT active
      this.roomCompEnabled =
        roomCompSettings.enabled &&
        roomCompSettings.cmnEnabled &&
        !roomCompSettings.biasMatchEnabled;
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
      if (
        roomCompSettings.enabled &&
        roomCompSettings.t60Enabled &&
        this.audioContext &&
        this.mediaStream
      ) {
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
          logger.info(
            `✅ Environment similar to reference (ratio: ${this.environmentWarning.ratio.toFixed(1)}x)`
          );
        }
      }

      // Noise Profile Subtraction (Pipeline-Stufe 1.5): Initialize real-time processor.
      // Additive Störungen werden VOR den konvolutiven Stufen (T60/Bias Match) entfernt.
      this.realtimeNoiseSub = null;
      this.realtimeMinStats = null;
      this.noiseSubProfileName = '';
      this.noiseSubContext = null;
      const noiseSubSettings = getNoiseSubtractionSettings();
      if (noiseSubSettings.enabled) {
        const activeNoiseProfile = getActiveNoiseProfile();
        if (
          activeNoiseProfile &&
          isProfileCompatible(
            activeNoiseProfile,
            this.actualSampleRate,
            this.dspConfig.frequencyBins
          )
        ) {
          const noiseRefLogMean = this.machine.refLogMean
            ? new Float64Array(this.machine.refLogMean)
            : null;
          this.realtimeNoiseSub = new RealtimeNoiseSubtraction(
            activeNoiseProfile,
            noiseSubSettings,
            noiseRefLogMean
          );
          this.noiseSubProfileName = activeNoiseProfile.name;
          logger.info(
            `🎚️ Noise subtraction activated (profile "${activeNoiseProfile.name}", β=${noiseSubSettings.beta})`
          );

          // Kontext-Warnungen: Staleness (R1), Überlappung (R5), Gerätewechsel (R4)
          const staleDays = isProfileStale(activeNoiseProfile)
            ? profileAgeDays(activeNoiseProfile)
            : null;
          const overlap = noiseRefLogMean
            ? noiseReferenceOverlap(activeNoiseProfile, noiseRefLogMean)
            : null;
          const overlapWarning = overlap !== null && overlap > OVERLAP_WARN_THRESHOLD;
          const currentMicLabel = this.mediaStream?.getAudioTracks()[0]?.label ?? '';
          const deviceMismatch =
            !!activeNoiseProfile.deviceLabel &&
            !!currentMicLabel &&
            activeNoiseProfile.deviceLabel !== currentMicLabel;
          this.noiseSubContext = { staleDays, overlapWarning, deviceMismatch };

          if (staleDays !== null) {
            logger.warn(`⚠️ Noise profile is ${staleDays} days old – consider re-recording`);
          }
          if (overlapWarning) {
            logger.warn(
              `⚠️ Noise profile resembles machine reference (overlap=${overlap!.toFixed(2)}) – ` +
                `subtraction may distort the signature`
            );
          }
          if (deviceMismatch) {
            logger.warn(
              `⚠️ Different microphone than during profile capture ` +
                `("${activeNoiseProfile.deviceLabel}" vs. "${currentMicLabel}")`
            );
          }
        } else if (activeNoiseProfile) {
          logger.warn(
            `⚠️ Noise profile "${activeNoiseProfile.name}" incompatible with current ` +
              `sample rate (${this.actualSampleRate}Hz) – subtraction skipped`
          );
        }

        // Stufe-3-Fallback: Kein (kompatibles) Profil, aber Minimum-Statistik
        // erlaubt → Lärmboden live schätzen. Braucht refLogMean (Bin-Maske,
        // Schutz der Maschinensignatur bei stationären Maschinen).
        if (!this.realtimeNoiseSub && noiseSubSettings.minStatsEnabled) {
          if (this.machine.refLogMean) {
            this.realtimeMinStats = new RealtimeMinStatsSubtraction(
              this.dspConfig.frequencyBins,
              new Float64Array(this.machine.refLogMean),
              noiseSubSettings
            );
            this.noiseSubProfileName = t('noiseSub.minStatsName');
            logger.info('🎚️ Min-stats noise fallback activated (no stored profile)');
          } else {
            logger.warn(
              '⚠️ Min-stats noise fallback needs a reference with refLogMean – skipped'
            );
          }
        }
      }

      // Cherry-Picking: Initialize real-time Energy-Entropy Gate if enabled
      const cherryPickSettings = getCherryPickSettings();
      if (cherryPickSettings.enabled) {
        this.realtimeCherryPick = new RealtimeCherryPick(
          cherryPickSettings,
          DEFAULT_DSP_CONFIG.hopSize
        );
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
        const baseline =
          (this.machine.refDriftBaseline as RefDriftBaseline | undefined) ?? undefined;
        this.realtimeDrift = new RealtimeDriftDetector(
          muRef,
          this.driftSettings,
          sigmaRef,
          baseline
        );
        logger.info(
          '🔍 Drift detector V2 activated' +
            (sigmaRef ? (this.machine.refLogResidualStd ? ' (residual-σ)' : ' (σ)') : '') +
            (baseline ? ' (adaptive thresholds)' : ' (fallback thresholds)')
        );
      }

      // Pipeline Status Dashboard: Initialize if expert mode and features active
      const viewLevelForDashboard = getViewLevel();
      const noiseStageActive = this.realtimeNoiseSub !== null || this.realtimeMinStats !== null;
      if (
        viewLevelForDashboard === 'expert' &&
        (cherryPickSettings.enabled || roomCompSettings.enabled || noiseStageActive)
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
          noiseStageActive,
          this.noiseSubProfileName
        );

        // Noise profile context warnings (staleness, overlap, device mismatch)
        if (this.realtimeNoiseSub && this.noiseSubContext) {
          this.pipelineStatus.setNoiseSubContext(
            this.noiseSubContext.staleDays,
            this.noiseSubContext.overlapWarning,
            this.noiseSubContext.deviceMismatch
          );
        }

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

      logger.info(
        `📊 Level 1 (Schnelltest): View level='${currentViewLevel}', useSimplifiedView=${this.useSimplifiedView}${isNfcDiagnosis ? ' (NFC initiated)' : ''}`
      );

      // Show recording modal (uses pre-calculated useSimplifiedView)
      this.showRecordingModal();

      // Initialize visualizer for advanced/expert view
      if (!this.useSimplifiedView && this.audioContext && this.mediaStream) {
        const waveformCanvas = document.getElementById('waveform-canvas');
        if (waveformCanvas) {
          this.visualizer = new AudioVisualizer('waveform-canvas');
          this.visualizer.start(this.audioContext, this.mediaStream);

          // Step 1: overlay the reference "ghost" behind the live spectrum.
          // The model's weight vector is, in effect, the averaged reference
          // spectrum – so the ghost works for every existing machine without
          // any new stored data.
          const baselineModel =
            this.activeModels.find((m) => m.label === 'Baseline') || this.activeModels[0];
          const baselineWeights = baselineModel ? getModelWeightVector(baselineModel) : undefined;
          if (baselineWeights?.length) {
            this.visualizer.setReferenceSpectrum(
              baselineWeights,
              baselineModel.sampleRate / 2
            );
          } else if (baselineModel) {
            // YAMNet models carry an embedding, not a spectrum. Derive the ghost
            // from the reference AUDIO (same averageSpectrum used for the iris) so
            // the overlay also works for the neural engine. Async + best-effort.
            void this.loadReferenceGhostFromAudio();
          }
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
          const statusElement =
            document.getElementById('smart-start-status') ||
            document.getElementById('inspection-subtitle');
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
          this.startDiagnosisAudioCapture();
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
          this.startDiagnosisAudioCapture();
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
    // Tier 1: reset the YAMNet async path state.
    this.diagnosisIsYamnet = false;
    this.yamnetBusy = false;
    this.yamnetBuffer?.clear();
    setMeasurementActive(false); // measurement over → PWA reload allowed again

    // Stop diagnosis audio capture BEFORE the media stream is torn down below,
    // and kick off decoding so the buffer is ready by the time results show.
    this.stopDiagnosisAudioCapture();

    // Reset state flags to prevent memory leaks
    this.hasValidMeasurement = false;
    this.lastProcessedScore = 0;
    this.lastProcessedStatus = 'UNKNOWN';
    this.lastDetectedState = 'UNKNOWN'; // MULTICLASS: Reset detected state
    this.lastFaultLabel = '';
    this.lastFaultScore = 0;
    this.lastBestFaultLabel = '';
    this.lastBestFaultScore = 0;
    this.lastFaultModelsExist = false;
    // Mit zurücksetzen: sonst zeigt die Auflösungszeile beim nächsten Ergebnis
    // die Zahl einer Referenz, die zur Maschine davor gehörte.
    this.lastHealthyLabel = '';
    this.renderFaultLine(null);
    this.scoreHistory.clear();
    this.faultScoreHistory.clear();
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

    // Cleanup Noise Profile Subtraction state
    if (this.realtimeNoiseSub) {
      this.realtimeNoiseSub.reset();
      this.realtimeNoiseSub = null;
    }
    if (this.realtimeMinStats) {
      this.realtimeMinStats.reset();
      this.realtimeMinStats = null;
    }
    this.noiseSubProfileName = '';
    this.noiseSubContext = null;

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

    // Cleanup Ereignis-Zeitleiste (Expert mode, Temporal-Engine)
    if (this.eventTimeline) {
      this.eventTimeline.destroy();
      this.eventTimeline = null;
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

    // Stop the on-demand basic-view spectrum, if it was revealed
    if (this.revealVisualizer) {
      this.revealVisualizer.stop();
      this.revealVisualizer = null;
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

      // Tier 1: YAMNet machines run on raw audio via a SEPARATE async path.
      // Everything below (the synchronous GMIA / spectral-cosine pipeline and
      // the entire UI it drives) is left exactly as it was.
      if (this.diagnosisIsYamnet) {
        void this.processChunkYamnet(chunk);
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

      // Quality gate: collect accepted raw frames (bounded) for the
      // end-of-check signal-quality assessment (pre room-comp = true mic signal).
      this.diagnosisQualityFeatures.push(rawFeatureVector);
      if (this.diagnosisQualityFeatures.length > 120) {
        this.diagnosisQualityFeatures.shift();
      }

      // Step 1b: Noise Profile Subtraction (Pipeline-Stufe 1.5) –
      // additive Störungen zuerst, dann konvolutive (T60/Bias Match/CMN).
      // Entweder mit gespeichertem Profil ODER Min-Stats-Fallback (Stufe 3).
      let featureVector = rawFeatureVector;
      if (this.realtimeNoiseSub) {
        featureVector = this.realtimeNoiseSub.process(featureVector);
        if (this.pipelineStatus) {
          this.pipelineStatus.setNoiseSubStatus(
            true,
            this.noiseSubProfileName,
            true,
            this.realtimeNoiseSub.estimatedSnrDb
          );
        }
      } else if (this.realtimeMinStats) {
        featureVector = this.realtimeMinStats.process(featureVector);
        if (this.pipelineStatus) {
          this.pipelineStatus.setNoiseSubStatus(
            true,
            this.noiseSubProfileName,
            this.realtimeMinStats.isActive,
            this.realtimeMinStats.estimatedSnrDb
          );
        }
      }

      // Step 1c: Room Compensation - Apply T60 subtraction, then Bias Match or CMN
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
      const diagnosis = classifyWithEngines(this.activeModels, {
        feature: featureVector,
        sampleRate: this.actualSampleRate,
      });

      // Step 3: Split the per-state scores by reference TYPE so a matched FAULT
      // reference is reported as a fault — not as "healthy" just because the
      // match score is high. The main gauge shows closeness to a HEALTHY
      // reference; the best FAULT match is tracked and smoothed separately.
      const settings = getRecordingSettings();
      const allScores = scoreAllWithEngines(this.activeModels, {
        feature: featureVector,
        sampleRate: this.actualSampleRate,
      });
      let bestHealthyScore = 0;
      let bestHealthyLabel = '';
      let bestFaultyScore = 0;
      let bestFaultyLabel = '';
      let hasFaultModels = false;
      for (const s of allScores) {
        if (s.isHealthy) {
          if (s.score > bestHealthyScore) {
            bestHealthyScore = s.score;
            bestHealthyLabel = s.label;
          }
        } else {
          hasFaultModels = true;
          if (s.score > bestFaultyScore) {
            bestFaultyScore = s.score;
            bestFaultyLabel = s.label;
          }
        }
      }

      // Smooth health (gauge) and fault separately.
      this.scoreHistory.addScore(bestHealthyScore);
      this.faultScoreHistory.addScore(bestFaultyScore);
      const filteredScore = this.scoreHistory.getFilteredScore();
      const filteredFaultScore = this.faultScoreHistory.getFilteredScore();

      // A FAULT reference matched confidently → status is faulty regardless of
      // how "clean" the score looks. Otherwise derive health from the gauge.
      const faultDetected =
        hasFaultModels && filteredFaultScore >= settings.confidenceThreshold;
      const filteredStatus: 'healthy' | 'uncertain' | 'faulty' = faultDetected
        ? 'faulty'
        : classifyHealthStatus(
            filteredScore,
            settings.confidenceThreshold,
            settings.faultyThreshold
          );

      this.lastFaultLabel = faultDetected ? bestFaultyLabel : '';
      this.lastFaultScore = faultDetected ? filteredFaultScore : 0;
      // Best fault regardless of detection (for the always-visible fault line).
      this.lastFaultModelsExist = hasFaultModels;
      this.lastBestFaultLabel = hasFaultModels ? bestFaultyLabel : '';
      this.lastBestFaultScore = hasFaultModels ? filteredFaultScore : 0;
      this.lastHealthyLabel = bestHealthyLabel;

      // Detected state for display/save: the fault label when a fault is
      // detected, otherwise the best-matching healthy state.
      const detectedState = faultDetected
        ? bestFaultyLabel
        : bestHealthyLabel || 'UNKNOWN';
      this.labelHistory.addLabel(detectedState);

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

      // Step 6a (T2-a2/T2-a3): Ereignis-Zeitleiste + Zyklus-Status (Expert)
      if (this.eventTimeline && diagnosis.metadata?.temporalEvents) {
        this.eventTimeline.update(diagnosis.metadata.temporalEvents as TemporalEventsMetadata);
        this.eventTimeline.updateCycle(
          (diagnosis.metadata.temporalCycle as TemporalCycleMetadata | undefined) ?? null
        );
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
      this.updateLiveDisplay(
        filteredScore,
        filteredStatus,
        detectedState,
        operatingPointChanged,
        hasFaultModels
          ? { label: bestFaultyLabel, score: filteredFaultScore, detected: faultDetected }
          : null
      );
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
   * Tier 1 — YAMNet diagnosis (separate async path).
   *
   * Accumulates raw audio in a ~1 s rolling window and, once enough is buffered,
   * runs the YAMNet embedding engine off the audio (resample → 16 kHz → embed →
   * cosine k-NN). Reuses the SAME fault-aware smoothing/status/display logic as
   * the synchronous path, but is fully isolated so the GMIA / spectral-cosine
   * pipeline above is untouched. A busy-flag drops overlapping frames so slow
   * inference never piles up.
   */
  private async processChunkYamnet(chunk: Float32Array): Promise<void> {
    if (!this.isProcessing || !this.yamnetBuffer) return;
    this.yamnetBuffer.push(chunk);
    const needed = Math.round(0.96 * this.actualSampleRate);
    if (this.yamnetBuffer.length < needed || this.yamnetBusy) return;

    this.yamnetBusy = true;
    try {
      const wave = this.yamnetBuffer.toArray();
      const frame = {
        feature: this.lastFeatureVector ?? EMPTY_FEATURE,
        rawChunk: wave,
        sampleRate: this.actualSampleRate,
      };
      const allScores = await getAsyncEngine('yamnet').scoreAll(this.activeModels, frame);
      if (!this.isProcessing) return;
      // Keep the latest per-state scores for the expert work-point ranking.
      this.lastYamnetScores = allScores;

      // Same fault-aware split as the synchronous path (health gauge vs. fault).
      let bestHealthyScore = 0;
      let bestHealthyLabel = '';
      let bestFaultyScore = 0;
      let bestFaultyLabel = '';
      let hasFaultModels = false;
      for (const s of allScores) {
        if (s.isHealthy) {
          if (s.score > bestHealthyScore) {
            bestHealthyScore = s.score;
            bestHealthyLabel = s.label;
          }
        } else {
          hasFaultModels = true;
          if (s.score > bestFaultyScore) {
            bestFaultyScore = s.score;
            bestFaultyLabel = s.label;
          }
        }
      }

      this.scoreHistory.addScore(bestHealthyScore);
      this.faultScoreHistory.addScore(bestFaultyScore);
      const filteredScore = this.scoreHistory.getFilteredScore();
      const filteredFaultScore = this.faultScoreHistory.getFilteredScore();
      const settings = getRecordingSettings();
      const faultDetected =
        hasFaultModels && filteredFaultScore >= settings.confidenceThreshold;
      const filteredStatus: 'healthy' | 'uncertain' | 'faulty' = faultDetected
        ? 'faulty'
        : classifyHealthStatus(
            filteredScore,
            settings.confidenceThreshold,
            settings.faultyThreshold
          );

      this.lastFaultLabel = faultDetected ? bestFaultyLabel : '';
      this.lastFaultScore = faultDetected ? filteredFaultScore : 0;
      this.lastFaultModelsExist = hasFaultModels;
      this.lastBestFaultLabel = hasFaultModels ? bestFaultyLabel : '';
      this.lastBestFaultScore = hasFaultModels ? filteredFaultScore : 0;
      this.lastHealthyLabel = bestHealthyLabel;
      const detectedState = faultDetected ? bestFaultyLabel : bestHealthyLabel || 'UNKNOWN';
      this.labelHistory.addLabel(detectedState);

      this.updateLiveDisplay(
        filteredScore,
        filteredStatus,
        detectedState,
        undefined,
        hasFaultModels
          ? { label: bestFaultyLabel, score: filteredFaultScore, detected: faultDetected }
          : null
      );
      this.lastProcessedScore = filteredScore;
      this.lastProcessedStatus = filteredStatus;
      this.lastDetectedState = detectedState;
      this.hasValidMeasurement = true;
    } catch (error) {
      logger.error('YAMNet diagnosis error:', error);
    } finally {
      this.yamnetBusy = false;
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
  private updateSmartStartStatus(
    message: string,
    phase?: 'idle' | 'warmup' | 'waiting' | 'recording'
  ): void {
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
      interpEl.className = 'drift-interpretation drift-interp-' + result.interpretation;
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
   * Render the dedicated fault line shown beneath the main status.
   *
   * It is visible whenever fault references exist for this machine, so the user
   * can always see that known faults are being actively checked:
   *  - DETECTED  → red, "⚠ Fehler erkannt: ‹Label› (NN %)"
   *  - not (yet) → neutral, "Fehler ‚‹Label›': NN % – kein Treffer"
   * When no fault references exist (faultInfo == null) the line stays hidden, so
   * machines with only healthy references look exactly as before.
   */
  private renderFaultLine(
    faultInfo: { label: string; score: number; detected: boolean } | null
  ): void {
    const el =
      document.getElementById('inspection-fault-line') ||
      document.getElementById('live-dashboard-fault-line');
    if (!el) {
      return;
    }
    if (!faultInfo) {
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('fault-detected', 'fault-clear');
      return;
    }
    const pct = Math.round(faultInfo.score);
    const label = faultInfo.label || t('diagnose.faultGeneric');
    el.style.display = '';
    el.classList.remove('fault-detected', 'fault-clear');
    if (faultInfo.detected) {
      el.classList.add('fault-detected');
      el.textContent = `⚠ ${t('diagnose.faultDetected', { fault: `${label} (${pct} %)` })}`;
    } else {
      el.classList.add('fault-clear');
      el.textContent = t('diagnose.faultChecked', { fault: label, score: pct });
    }
  }

  private updateLiveDisplay(
    score: number,
    status: string,
    detectedState?: string,
    operatingPointChanged?: boolean,
    faultInfo?: { label: string; score: number; detected: boolean } | null
  ): void {
    const normalizedStatus = status.toLowerCase();

    // The dedicated fault line (below) shows the best fault match whenever fault
    // references exist — red when detected, neutral ("checked, no match") when
    // below threshold. The main status text only names the fault when it was
    // actually DETECTED, so a healthy reading stays clean.
    this.renderFaultLine(faultInfo ?? null);
    const faultLabelText =
      faultInfo && faultInfo.detected
        ? `${faultInfo.label} (${Math.round(faultInfo.score)} %)`
        : null;

    if (this.useSimplifiedView) {
      // === SIMPLIFIED INSPECTION VIEW ===
      const statusClass =
        normalizedStatus === 'healthy'
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
        // When a known fault is detected, name it with its own match quality.
        statusLabel.textContent = faultLabelText
          ? `${statusText} — ${t('diagnose.faultDetected', { fault: faultLabelText })}`
          : statusText;
        statusLabel.classList.remove('status-healthy', 'status-uncertain', 'status-faulty');
        statusLabel.classList.add(statusClass);
      }

      // Update quality hints based on signal strength
      this.updateQualityHint();

      // Sprint 1 UX: Update verbal status in simplified view
      const inspectionVerbal = document.getElementById('live-verbal-status');
      if (inspectionVerbal) {
        inspectionVerbal.textContent = faultLabelText
          ? t('diagnose.faultDetected', { fault: faultLabelText })
          : getScoreVerbalStatus(score);
      }
    } else {
      // === ADVANCED/EXPERT VIEW ===
      const statusClass =
        normalizedStatus === 'healthy'
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
        dashboardScoreContainer.classList.remove(
          'status-healthy',
          'status-uncertain',
          'status-faulty'
        );
        dashboardScoreContainer.classList.add(statusClass);
      }

      // Update dashboard status text
      const dashboardStatus = document.getElementById('live-dashboard-status');
      if (dashboardStatus) {
        const localizedStatus =
          normalizedStatus === 'healthy'
            ? t('status.healthy')
            : normalizedStatus === 'uncertain'
              ? t('status.uncertain')
              : normalizedStatus === 'faulty'
                ? t('status.faulty')
                : status;

        const shouldShowState =
          faultLabelText != null ||
          (score >= getMinConfidentMatchScore() && detectedState && detectedState !== 'UNKNOWN');
        const displayState =
          faultLabelText ??
          (detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState);

        if (shouldShowState) {
          dashboardStatus.textContent = `${localizedStatus} | ${displayState}`;
        } else {
          dashboardStatus.textContent = localizedStatus;
        }
        dashboardStatus.className = `inspection-status status-${normalizedStatus}`;
      }

      // Sprint 1 UX: Update verbal status in advanced/expert view
      const liveVerbal =
        document.getElementById('live-verbal-status') ||
        document.getElementById('live-dashboard-verbal');
      if (liveVerbal) {
        liveVerbal.textContent = getScoreVerbalStatus(score);
      }

      // Update legacy status element
      const statusElement = document.getElementById('live-status');
      if (statusElement) {
        const localizedStatus =
          normalizedStatus === 'healthy'
            ? t('status.healthy')
            : normalizedStatus === 'uncertain'
              ? t('status.uncertain')
              : normalizedStatus === 'faulty'
                ? t('status.faulty')
                : status;

        // Show detected state if score meets confident match threshold
        const shouldShowState =
          faultLabelText != null ||
          (score >= getMinConfidentMatchScore() && detectedState && detectedState !== 'UNKNOWN');
        const displayState =
          faultLabelText ??
          (detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState);

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

    // Quality gate (before cleanup clears the collected frames): flag a weak,
    // noise-masked measurement. Purely additive – never blocks or alters the score.
    this.measurementSignalTooWeak = false;
    try {
      if (this.diagnosisQualityFeatures.length >= 5) {
        const quality = assessRecordingQuality(this.diagnosisQualityFeatures);
        this.measurementSignalTooWeak = quality.metadata?.signalTooWeak === true;
      }
    } catch (error) {
      logger.warn('Quality gate assessment failed (ignored):', error);
      this.measurementSignalTooWeak = false;
    }

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
      const effectiveDetectedState =
        finalScore >= getMinConfidentMatchScore() ? detectedState : 'UNKNOWN';

      // MULTICLASS: Generate hint based on detected state
      let hint = classification.recommendation;
      if (effectiveDetectedState !== 'UNKNOWN') {
        if (finalStatus === 'healthy') {
          hint = t('diagnose.analysis.healthyMatch', {
            state: effectiveDetectedState,
            score: finalScore.toFixed(1),
          });
        } else if (finalStatus === 'faulty') {
          // When a known fault was matched, report ITS quality (not the health gauge).
          const faultQuality = this.lastFaultScore > 0 ? this.lastFaultScore : finalScore;
          hint = t('diagnose.analysis.faultyMatch', {
            state: effectiveDetectedState,
            score: faultQuality.toFixed(1),
          });
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
          // Fault-aware fields: when a known fault reference was matched, record
          // its label and match quality separately from the health gauge.
          faultLabel: this.lastFaultLabel || undefined,
          faultScore: this.lastFaultScore > 0 ? Math.round(this.lastFaultScore * 10) / 10 : undefined,
          // Best fault check regardless of detection — lets the result/history
          // document that known faults were actively checked and ruled out.
          faultModelsExist: this.lastFaultModelsExist || undefined,
          bestFaultLabel: this.lastFaultModelsExist ? this.lastBestFaultLabel || undefined : undefined,
          bestFaultScore: this.lastFaultModelsExist
            ? Math.round(this.lastBestFaultScore * 10) / 10
            : undefined,
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

      // Persist the measurement audio (so the check can be re-opened later with
      // A/B / difference listening), honoring the user's retention setting.
      // Recording id == diagnosis id, so a past result can fetch its audio.
      await this.persistDiagnosisAudio(diagnosis.id);

      // Hide modal
      this.hideRecordingModal();

      // Show results
      this.showResults(diagnosis);

      // Sprint 1 UX: Diagnosis completion confirmation
      notify.success(t('diagnose.compareComplete'), {
        duration: 3000,
      });

      // Welle 1 UX: Haptic feedback on diagnosis completion
      hapticForScore(finalScore);

      // UX improvement: One-time score explanation after first QC diagnosis
      if (this.qcGoldStandardName && !DiagnosePhase.scoreExplanationShown) {
        DiagnosePhase.scoreExplanationShown = true;
        setTimeout(() => {
          notify.info(
            t('quickCompare.scoreExplanation.hint', { score: String(Math.round(finalScore)) }),
            {
              duration: 6000,
            }
          );
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
    // UX: Ohne Positionsbild wird die Kamera-Zelle KOMPLETT eingeklappt
    // (Grid-Modifier .no-camera) — vorher belegte ein „Kein Positionsbild"-
    // Platzhalter die halbe Bildschirmhöhe, die wertvollste Fläche des
    // Livescreens zeigte ein Nichts. Der Score bekommt den Platz.
    const hasCamera = Boolean(this.cameraStream && this.machine.referenceImage);
    let cameraHTML = '';
    if (hasCamera && this.machine.referenceImage) {
      const imageUrl = URL.createObjectURL(this.machine.referenceImage);
      cameraHTML = `
        <div class="ghost-overlay-container" id="ghost-overlay-container">
          <div class="ghost-overlay-wrapper">
            <video id="diagnosis-video" autoplay playsinline muted></video>
            <img id="ghost-overlay-image" class="ghost-overlay-image" src="${imageUrl}" />
          </div>
        </div>
      `;
    }

    return `
      <div class="diagnosis-dashboard-grid${hasCamera ? '' : ' no-camera'}">
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
          <!-- Fault line: visible whenever fault references exist (red when a
               fault is detected, neutral "checked – no match" otherwise). -->
          <div class="inspection-fault-line" id="inspection-fault-line" style="display: none"></div>
        </div>
      </div>
    `;
  }

  /**
   * Insert the "look closer" reveal into the basic inspection view.
   *
   * Basic view stays a clean traffic light by default; this adds a single
   * toggle that reveals the live spectrum with the reference "ghost" behind it
   * – the comparison is shown on demand, never forced.
   */
  private insertSpectrumReveal(contentElement: HTMLElement): void {
    if (contentElement.querySelector('#inspection-spectrum-reveal')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'inspection-spectrum-reveal';
    wrapper.id = 'inspection-spectrum-reveal';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'inspection-spectrum-toggle';
    toggleBtn.id = 'inspection-spectrum-toggle';
    toggleBtn.textContent = t('diagnose.display.spectrumReveal');
    toggleBtn.setAttribute('aria-expanded', 'false');

    const panel = document.createElement('div');
    panel.className = 'inspection-spectrum-panel';
    panel.id = 'inspection-spectrum-panel';
    panel.style.display = 'none';

    const canvas = document.createElement('canvas');
    canvas.id = 'inspection-spectrum-canvas';
    canvas.className = 'inspection-spectrum-canvas';
    panel.appendChild(canvas);

    toggleBtn.addEventListener('click', () => this.toggleInspectionSpectrum());

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(panel);

    // Place the reveal after the dashboard grid (below camera + score)
    const grid = contentElement.querySelector('.diagnosis-dashboard-grid');
    if (grid && grid.parentElement) {
      grid.parentElement.insertBefore(wrapper, grid.nextSibling);
    } else {
      contentElement.appendChild(wrapper);
    }
  }

  /**
   * Toggle the on-demand spectrum panel in basic view. The AudioVisualizer is
   * created lazily on first reveal (so the canvas has a real size) and stopped
   * when hidden to avoid running a second render loop unnecessarily.
   */
  private toggleInspectionSpectrum(): void {
    const panel = document.getElementById('inspection-spectrum-panel');
    const toggleBtn = document.getElementById('inspection-spectrum-toggle');
    if (!panel || !toggleBtn) return;

    const isHidden = panel.style.display === 'none';

    if (isHidden) {
      panel.style.display = 'block';
      toggleBtn.textContent = t('diagnose.display.spectrumHide');
      toggleBtn.setAttribute('aria-expanded', 'true');

      // Create the visualizer after the panel is laid out, so the canvas has
      // a non-zero size when its backing store is configured.
      requestAnimationFrame(() => {
        if (!this.revealVisualizer && this.audioContext && this.mediaStream) {
          try {
            this.revealVisualizer = new AudioVisualizer('inspection-spectrum-canvas');
            this.revealVisualizer.start(this.audioContext, this.mediaStream);
            const baselineModel =
              this.activeModels.find((m) => m.label === 'Baseline') || this.activeModels[0];
            const baselineWeights = baselineModel
              ? getModelWeightVector(baselineModel)
              : undefined;
            if (baselineWeights?.length) {
              this.revealVisualizer.setReferenceSpectrum(
                baselineWeights,
                baselineModel.sampleRate / 2
              );
            }
          } catch (error) {
            logger.warn('Could not start inspection spectrum visualizer:', error);
          }
        }
      });
    } else {
      panel.style.display = 'none';
      toggleBtn.textContent = t('diagnose.display.spectrumReveal');
      toggleBtn.setAttribute('aria-expanded', 'false');
      if (this.revealVisualizer) {
        this.revealVisualizer.stop();
        this.revealVisualizer = null;
      }
    }
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
        subtitleElement.textContent = t('quickCompare.inspectionReference.comparingWith', {
          name: this.qcGoldStandardName,
        });
      } else {
        subtitleElement.textContent = t('inspection.subtitleInitializing');
      }
    }

    // Set reference state info
    const referenceValueElement = document.getElementById('inspection-reference-value');
    if (referenceValueElement && this.activeModels.length > 0) {
      // Get the baseline/primary reference model label
      const baselineModel =
        this.activeModels.find((m) => m.label === 'Baseline') || this.activeModels[0];
      const referenceLabel =
        baselineModel.label === 'Baseline' ? t('inspection.referenceDefault') : baselineModel.label;
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
        if (
          this.cameraStream &&
          this.machine.referenceImage &&
          !DiagnosePhase.ghostOverlayHintShown
        ) {
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

        // "Look closer" reveal: keep basic view a clean traffic light, but let
        // the user open the live spectrum + reference ghost on demand.
        this.insertSpectrumReveal(contentElement);
      }

      contentElement.classList.add('is-initializing');
    }

    // Always start the spectrum reveal collapsed and tear down any previous
    // live visualizer, so a repeated measurement begins from a consistent
    // state (otherwise the panel could stay "open" from the last run while its
    // visualizer was destroyed, so the first tap would wrongly collapse it).
    const revealPanel = document.getElementById('inspection-spectrum-panel');
    const revealToggle = document.getElementById('inspection-spectrum-toggle');
    if (revealPanel) revealPanel.style.display = 'none';
    if (revealToggle) {
      revealToggle.textContent = t('diagnose.display.spectrumReveal');
      revealToggle.setAttribute('aria-expanded', 'false');
    }
    if (this.revealVisualizer) {
      this.revealVisualizer.stop();
      this.revealVisualizer = null;
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
    const scoreDisplay =
      document.getElementById('health-gauge-canvas') ||
      document.getElementById('inspection-score-container') ||
      document.getElementById('live-dashboard-score-container');

    if (scoreDisplay && !scoreDisplay.dataset.scoreTapBound) {
      scoreDisplay.dataset.scoreTapBound = 'true';
      scoreDisplay.addEventListener('click', () => {
        notify.info(t('healthGauge.explain'), {
          title: t('healthGauge.explainTitle'),
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
      // Hide footer stop button – the dynamically created stop-diagnosis-btn is the primary control
      stopBtn.style.display = 'none';
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
    structuredContent.style.cssText =
      'display: flex; flex-direction: column; height: 100%; gap: var(--spacing-sm);';

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
    const faultLineElement = dashboardGrid.querySelector('#inspection-fault-line');
    if (faultLineElement) {
      faultLineElement.id = 'live-dashboard-fault-line';
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
    spectroHelp.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
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
      const refModelInfo =
        this.activeModels.length > 0
          ? this.activeModels
              .map((m) => {
                const trainingDate = new Date(m.trainingDate).toLocaleString(dateLocale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const displayLabel =
                  m.label === 'Baseline' ? t('reference.labels.baseline') : escapeHtml(m.label);
                return `${displayLabel} (${trainingDate})`;
              })
              .join(', ')
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

      // --- Ereignis-Zeitleiste (T2-a2): Container, nur Temporal-Modelle ---
      const eventTimelineContainer = document.createElement('div');
      eventTimelineContainer.id = 'event-timeline-container';
      scrollableArea.appendChild(eventTimelineContainer);

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
      driftHelpAdv.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
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
      driftHelpExp.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
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

    // Ereignis-Zeitleiste (T2-a2): nur Expert-Modus UND Temporal-Modelle aktiv
    if (
      currentViewLevel === 'expert' &&
      !this.eventTimeline &&
      this.activeModels.some((m) => m.engineId === 'temporal')
    ) {
      this.eventTimeline = new EventTimeline('event-timeline-container');
      this.eventTimeline.mount();
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
        const ghostImage = contentElement.querySelector(
          '#ghost-overlay-image'
        ) as HTMLImageElement | null;
        if (ghostImage && ghostImage.src) {
          URL.revokeObjectURL(ghostImage.src);
        }

        // Remove camera and score layout
        const dashboardGrid = contentElement.querySelector('.diagnosis-dashboard-grid');
        if (dashboardGrid) {
          dashboardGrid.remove();
        }

        // Remove the spectrum reveal too, so it is re-created fresh (and
        // correctly positioned under the new grid) on the next check instead
        // of lingering at a stale position.
        const spectrumReveal = contentElement.querySelector('#inspection-spectrum-reveal');
        if (spectrumReveal) {
          spectrumReveal.remove();
        }
        if (this.revealVisualizer) {
          this.revealVisualizer.stop();
          this.revealVisualizer = null;
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

      // Restore footer stop button visibility for reference recording mode
      const stopBtn = document.getElementById('stop-recording-btn');
      if (stopBtn) {
        stopBtn.style.display = '';
      }

      // Remove diagnosis-active class from body
      document.body.classList.remove('diagnosis-active');

      // Clean up structured content (new layout)
      const structuredContent = recordingModal.querySelector('.diagnosis-structured-content');
      if (structuredContent) {
        // Clean up ghost overlay image URL
        const ghostImage = structuredContent.querySelector(
          '#ghost-overlay-image'
        ) as HTMLImageElement | null;
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
        const ghostImage = ghostContainer.querySelector(
          '#ghost-overlay-image'
        ) as HTMLImageElement | null;
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
      const localizedStatus =
        normalizedStatus === 'healthy'
          ? t('status.healthy')
          : normalizedStatus === 'uncertain'
            ? t('status.uncertain')
            : normalizedStatus === 'faulty'
              ? t('status.faulty')
              : t('status.unknown');

      // MULTICLASS: Show detected state if available. When a known fault was
      // matched, name it with its own match quality (separate from the gauge).
      const detectedState = diagnosis.metadata?.detectedState;
      const faultLabel = diagnosis.metadata?.faultLabel as string | undefined;
      const faultScore = diagnosis.metadata?.faultScore as number | undefined;
      if (normalizedStatus === 'faulty' && faultLabel) {
        const faultText = `${faultLabel}${typeof faultScore === 'number' ? ` (${Math.round(faultScore)} %)` : ''}`;
        resultStatus.textContent = `${localizedStatus} | ${t('diagnose.faultDetected', { fault: faultText })}`;
      } else if (detectedState && detectedState !== 'UNKNOWN') {
        const displayState =
          detectedState === 'Baseline' ? t('reference.labels.baseline') : detectedState;
        resultStatus.textContent = `${localizedStatus} | ${displayState}`;
      } else {
        resultStatus.textContent = localizedStatus;
      }
      // CSS classes use technical terms for correct color styling
      resultStatus.className = `result-status status-${normalizedStatus}`;
    }

    // Fault line in the saved documentation: shown whenever fault references
    // existed for this check — red if a fault was detected, neutral if they were
    // checked and ruled out. Hidden entirely when the machine has no fault refs.
    const resultFaultLine = document.getElementById('result-fault-line');
    if (resultFaultLine) {
      const faultModelsExist = diagnosis.metadata?.faultModelsExist === true;
      const detectedFaultLabel = diagnosis.metadata?.faultLabel as string | undefined;
      const detectedFaultScore = diagnosis.metadata?.faultScore as number | undefined;
      const bestFaultLabel = diagnosis.metadata?.bestFaultLabel as string | undefined;
      const bestFaultScore = diagnosis.metadata?.bestFaultScore as number | undefined;
      resultFaultLine.classList.remove('fault-detected', 'fault-clear');
      if (detectedFaultLabel) {
        const pct = typeof detectedFaultScore === 'number' ? Math.round(detectedFaultScore) : 0;
        resultFaultLine.classList.add('fault-detected');
        resultFaultLine.textContent = `⚠ ${t('diagnose.faultDetected', { fault: `${detectedFaultLabel} (${pct} %)` })}`;
        resultFaultLine.style.display = '';
      } else if (faultModelsExist && bestFaultLabel) {
        resultFaultLine.classList.add('fault-clear');
        resultFaultLine.textContent = t('diagnose.faultChecked', {
          fault: bestFaultLabel || t('diagnose.faultGeneric'),
          score: typeof bestFaultScore === 'number' ? Math.round(bestFaultScore) : 0,
        });
        resultFaultLine.style.display = '';
      } else {
        resultFaultLine.style.display = 'none';
        resultFaultLine.textContent = '';
      }
    }

    // Sprint 1 UX: Add verbal status below score in result modal
    const verbalStatus = document.getElementById('result-verbal-status');
    if (verbalStatus) {
      verbalStatus.textContent = getScoreVerbalStatus(diagnosis.healthScore);
    }

    // Measurement quality gate: warn when the signal was too weak / noise-masked
    // (e.g. mic too far, machine off, mostly background noise). Additive only –
    // the score and status are still shown, just flagged as barely usable.
    const qualityWarning = document.getElementById('quality-warning-result');
    if (qualityWarning) {
      if (this.measurementSignalTooWeak) {
        qualityWarning.textContent = t('diagnosisResults.measurementQualityWarning');
        qualityWarning.style.display = '';
      } else {
        qualityWarning.style.display = 'none';
        qualityWarning.textContent = '';
      }
    }

    // Welle 1 UX: Action recommendation
    const recommendationEl = document.getElementById('diagnosis-recommendation');
    if (recommendationEl) {
      if (diagnosis.healthScore >= 75) {
        recommendationEl.textContent = t('diagnose.recommendation.healthy');
      } else if (diagnosis.healthScore >= 50) {
        recommendationEl.textContent = t('diagnose.recommendation.warning');
      } else {
        recommendationEl.textContent = t('diagnose.recommendation.critical');
      }
    }

    // Welle 2 UX: Ampel-Banner
    const ampel = document.getElementById('result-ampel');
    if (ampel) {
      const ampelIcon = document.getElementById('result-ampel-icon');
      const ampelLabel = document.getElementById('result-ampel-label');
      const ampelExplanation = document.getElementById('result-ampel-explanation');
      const ampelRecommendation = document.getElementById('result-ampel-recommendation');

      const ampelScore = diagnosis.healthScore;

      // Remove previous status classes
      ampel.classList.remove('ampel-healthy', 'ampel-warning', 'ampel-critical');

      if (ampelScore >= 75) {
        ampel.classList.add('ampel-healthy');
        if (ampelIcon) ampelIcon.textContent = '✅';
        if (ampelLabel) ampelLabel.textContent = t('status.healthy').toUpperCase();
        if (ampelExplanation) ampelExplanation.textContent = t('resultAmpel.explanationHealthy');
        if (ampelRecommendation)
          ampelRecommendation.textContent = t('diagnose.recommendation.healthy');
      } else if (ampelScore >= 50) {
        ampel.classList.add('ampel-warning');
        if (ampelIcon) ampelIcon.textContent = '⚠';
        if (ampelLabel) ampelLabel.textContent = t('status.uncertain').toUpperCase();
        if (ampelExplanation) ampelExplanation.textContent = t('resultAmpel.explanationWarning');
        if (ampelRecommendation)
          ampelRecommendation.textContent = t('diagnose.recommendation.warning');
      } else {
        ampel.classList.add('ampel-critical');
        if (ampelIcon) ampelIcon.textContent = '❌';
        if (ampelLabel) ampelLabel.textContent = t('status.faulty').toUpperCase();
        if (ampelExplanation) ampelExplanation.textContent = t('resultAmpel.explanationCritical');
        if (ampelRecommendation)
          ampelRecommendation.textContent = t('diagnose.recommendation.critical');
      }

      // Welle 2: Trend with delta in ampel banner
      const ampelTrendContainer = document.getElementById('result-ampel-trend');
      const ampelTrendArrow = document.getElementById('result-ampel-trend-arrow');
      const ampelTrendText = document.getElementById('result-ampel-trend-text');

      if (ampelTrendContainer && ampelTrendArrow && ampelTrendText) {
        try {
          const ampelDiagnoses = await getDiagnosesForMachine(this.machine.id, 6);
          const ampelOlder = ampelDiagnoses.filter((d) => d.id !== diagnosis.id).slice(0, 5);

          if (ampelOlder.length >= 2) {
            const olderScores = ampelOlder.map((d) => d.healthScore);
            const sorted = [...olderScores].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median =
              sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
            const delta = ampelScore - median;

            ampelTrendContainer.style.display = 'flex';

            if (Math.abs(delta) <= 3) {
              ampelTrendArrow.textContent = '→';
              ampelTrendText.textContent = t('resultAmpel.trendStable', {
                count: String(ampelOlder.length),
              });
              ampelTrendContainer.className = 'result-ampel-trend trend-stable';
            } else if (delta > 0) {
              ampelTrendArrow.textContent = '↗';
              ampelTrendText.textContent = t('resultAmpel.trendImproving', {
                delta: `+${delta.toFixed(0)}`,
                count: String(ampelOlder.length),
              });
              ampelTrendContainer.className = 'result-ampel-trend trend-improving';
            } else {
              ampelTrendArrow.textContent = '↘';
              ampelTrendText.textContent = t('resultAmpel.trendDeclining', {
                delta: delta.toFixed(0),
                count: String(ampelOlder.length),
              });
              ampelTrendContainer.className = 'result-ampel-trend trend-declining';
            }
          } else {
            ampelTrendContainer.style.display = 'none';
          }
        } catch {
          ampelTrendContainer.style.display = 'none';
        }
      }

      this.renderResolutionLine();
    }

    // Welle 2 UX: Context-aware action buttons
    const resultBtnNext = document.getElementById('result-btn-next');
    const resultBtnDetails = document.getElementById('result-btn-details');
    if (resultBtnNext) {
      if (diagnosis.healthScore < 50) {
        // Critical: Primary action becomes "Report maintenance"
        resultBtnNext.textContent = t('resultActions.reportMaintenance');
        resultBtnNext.className = 'result-action-btn result-action-danger';

        const newNextBtn = resultBtnNext.cloneNode(true) as HTMLElement;
        resultBtnNext.parentNode?.replaceChild(newNextBtn, resultBtnNext);
        newNextBtn.addEventListener('click', () => {
          showMaintenanceExportChoice(this.machine, diagnosis);
        });
      } else {
        // Normal: "New check"
        resultBtnNext.textContent = t('resultActions.newCheck');
        resultBtnNext.className = 'result-action-btn result-action-primary';

        const newNextBtn = resultBtnNext.cloneNode(true) as HTMLElement;
        resultBtnNext.parentNode?.replaceChild(newNextBtn, resultBtnNext);
        newNextBtn.addEventListener('click', () => {
          modal.style.display = 'none';
          if (this.workPointRanking) {
            this.workPointRanking.destroy();
            this.workPointRanking = null;
          }
          if (this.onResultModalClosed) {
            this.onResultModalClosed();
          }
          // Re-trigger diagnosis
          const diagnoseBtn = document.getElementById('diagnose-btn');
          if (diagnoseBtn) {
            diagnoseBtn.click();
          }
        });
      }
    }

    // Welle 2: Details button scrolls to technical details
    if (resultBtnDetails) {
      const newDetailsBtn = resultBtnDetails.cloneNode(true) as HTMLElement;
      resultBtnDetails.parentNode?.replaceChild(newDetailsBtn, resultBtnDetails);
      newDetailsBtn.addEventListener('click', () => {
        const fingerprint = modal.querySelector('.result-fingerprint');
        if (fingerprint) {
          fingerprint.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // Sprint 3 UX: Old trend arrow (hidden - replaced by Welle 2 ampel trend)
    const trendEl = document.getElementById('result-trend');
    if (trendEl) {
      trendEl.style.display = 'none';
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
        // Stop slow-motion playback if still running
        this.slowListenPlayer?.stop();
        // WebGL-Kontexte sind eine knappe Ressource (Browser begrenzen sie
        // pro Seite) — das Gebirge muss beim Schließen wirklich weg sein.
        this.spectro3dPanel?.destroy();
        this.spectro3dPanel = null;
        // Cleanup ranking when modal closes
        if (this.workPointRanking) {
          this.workPointRanking.destroy();
          this.workPointRanking = null;
        }
        // Welle 2: Notify router to refresh dashboard
        if (this.onResultModalClosed) {
          this.onResultModalClosed();
        }
      };
    }

    // Setup footer "Weiter" button – closes modal and triggers Grundansicht reset
    const closeResultBtn = document.getElementById('close-diagnosis-result-btn');
    if (closeResultBtn) {
      closeResultBtn.onclick = () => {
        modal.style.display = 'none';
        // Stop slow-motion playback if still running
        this.slowListenPlayer?.stop();
        // WebGL-Kontexte sind eine knappe Ressource (Browser begrenzen sie
        // pro Seite) — das Gebirge muss beim Schließen wirklich weg sein.
        this.spectro3dPanel?.destroy();
        this.spectro3dPanel = null;
        if (this.workPointRanking) {
          this.workPointRanking.destroy();
          this.workPointRanking = null;
        }
        // UX-Fix: Notify router to reset to Grundansicht (explicit "Weiter" action)
        if (this.onResultContinue) {
          this.onResultContinue();
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

    // Result extras (iris comparison + A/B listen controls): reserve their
    // slots in a fixed order and fill them from a single shared audio load, so
    // they fade in place instead of racing and reordering (which made the
    // result screen jump as each block was pushed in).
    void this.renderResultExtras(diagnosis);
  }

  /**
   * AUFLÖSUNG DIESER REFERENZ — die Zahl, die „Vergleich, keine Diagnose" von
   * einer Ausrede trennt.
   *
   * Wer nicht diagnostiziert, muss sagen können, was er stattdessen leistet.
   * Zanobo leistet: Unterschiede ab einer bestimmten Punktzahl auflösen. Diese
   * Punktzahl ist keine Produkteigenschaft, sondern eine Eigenschaft DIESER
   * Referenz — sie kommt aus deren eigener Wiederholstreuung (Median + k · MAD
   * der Selbsttest-Scores, siehe `core/ml/baselineSpread.ts`). Eine leise
   * Maschine mit ruhiger Aufnahme löst fein auf, eine mit schwankendem
   * Betriebspunkt grob. Beide zeigen dieselbe Skala — deshalb muss dabeistehen,
   * was sie wert ist.
   *
   * Diese Zeile ENTSCHEIDET nichts. Die Ampel urteilt unverändert an ihren zwei
   * festen Schwellen; hier steht nur, wie fein sie urteilen kann. Erst wenn sich
   * über genug echte Referenzen zeigt, wo die Zahl liegt, kann die Schwelle
   * begründet darauf umgestellt werden.
   *
   * Fehlt die Streuung (Referenz vor diesem Feld angelernt, oder Temporal-Engine,
   * die keine Verteilung hat), wird KEINE Zahl erfunden: ab „Advanced" steht der
   * Grund da, darunter bleibt die Zeile weg — ein Hinweis, auf den man nur mit
   * Neuanlernen reagieren kann, ist für die einfache Ansicht bloß Lärm.
   */
  private renderResolutionLine(): void {
    const line = document.getElementById('result-ampel-resolution');
    if (!line) return;

    const state = resolutionLineState(
      this.activeModels,
      this.lastHealthyLabel,
      isViewLevelAtLeast('advanced')
    );

    if (state.kind === 'hidden') {
      line.style.display = 'none';
      line.textContent = '';
      line.removeAttribute('title');
      return;
    }

    line.style.display = '';
    if (state.kind === 'unknown') {
      line.textContent = t('resultAmpel.resolutionUnknown');
      line.removeAttribute('title');
      return;
    }

    line.textContent = t('resultAmpel.resolution', { points: state.points });
    line.title = t('resultAmpel.resolutionDetail', {
      k: String(state.k),
      label: state.label,
    });
  }

  /**
   * Reserve fixed-order slots for the result extras and fill them from a single
   * shared audio load. Replaces the two independent async insertions that used
   * to race for the same anchor (causing the visible "jump"/reorder).
   */
  private async renderResultExtras(diagnosis: DiagnosisResult): Promise<void> {
    const anchor = document.getElementById('result-ampel');
    if (!anchor || !anchor.parentElement) return;

    // (Re)create the two slots in a fixed order: iris comparison, then listen
    // controls, directly under the ampel. They stay collapsed (:empty) until
    // populated, then fade in.
    document.getElementById('iris-comparison')?.remove();
    document.getElementById('listen-controls')?.remove();
    document.getElementById('spectro3d-slot')?.remove();
    const listenSlot = document.createElement('div');
    listenSlot.id = 'listen-controls';
    listenSlot.className = 'listen-controls result-extra-slot';
    const irisSlot = document.createElement('div');
    irisSlot.id = 'iris-comparison';
    irisSlot.className = 'iris-comparison result-extra-slot';
    const spectroSlot = document.createElement('div');
    spectroSlot.id = 'spectro3d-slot';
    spectroSlot.className = 'result-extra-slot';
    // insertBefore(anchor.nextSibling) stapelt in umgekehrter Reihenfolge: zuletzt
    // eingefügt steht oben. Ergebnis: Hören · Iris · Gebirge.
    //
    // Das Hören steht ganz vorn, weil es das Einzige ist, was der Mensch
    // ÜBERPRÜFEN kann. Die Iris ist ein Bild, das man glauben muss; „nur den
    // Unterschied" hören heißt, dem Urteil der App zu widersprechen, wenn es
    // nach Regen auf dem Blech klingt statt nach einem Lager. Wer die Ampel
    // nicht nachprüfen kann, muss ihr vertrauen — und genau das soll Zanobo
    // nicht verlangen.
    anchor.parentElement.insertBefore(spectroSlot, anchor.nextSibling);
    anchor.parentElement.insertBefore(irisSlot, anchor.nextSibling);
    anchor.parentElement.insertBefore(listenSlot, anchor.nextSibling);

    // Load the shared audio ONCE (both extras need the reference recording and
    // the captured measurement) instead of each function reading them again.
    let referenceBuffer: AudioBuffer | null = null;
    let measurementBuffer: AudioBuffer | null = null;
    try {
      const recordings = await getRecordingsForMachine(this.machine.id);
      referenceBuffer =
        recordings
          .filter((r) => r.type === 'reference' && r.audioBuffer)
          .sort((a, b) => b.timestamp - a.timestamp)[0]?.audioBuffer ?? null;
    } catch (error) {
      logger.warn('Could not load reference recording for result extras:', error);
    }
    try {
      measurementBuffer = (await this.diagnosisAudioPromise) ?? this.lastDiagnosisAudioBuffer;
    } catch {
      measurementBuffer = null;
    }

    this.populateIrisComparison(diagnosis, referenceBuffer, measurementBuffer);
    this.populateListenControls(referenceBuffer, measurementBuffer);
    this.populateSpectro3d(spectroSlot, referenceBuffer, measurementBuffer);
  }

  /**
   * 3D-Spektrogramm „Gebirge" direkt auf dem Ergebnis-Screen (ab Advanced):
   * Zeit × Frequenz × Intensität, umschaltbar zwischen Messung, Referenz und
   * Differenz. Alles lazy — Matrix, WebGL und die spektrale Subtraktion
   * entstehen erst beim Tap auf den jeweiligen Chip, nicht beim Anzeigen des
   * Ergebnisses.
   */
  private populateSpectro3d(
    slot: HTMLElement,
    referenceBuffer: AudioBuffer | null,
    measurementBuffer: AudioBuffer | null
  ): void {
    if (!isViewLevelAtLeast('advanced')) return;
    if (!referenceBuffer && !measurementBuffer) return;

    this.spectro3dPanel?.destroy();
    this.spectro3dPanel = null;

    const panel = new Spectrogram3DPanel({
      reference: referenceBuffer,
      measurement: measurementBuffer,
    });
    if (!panel.hasContent) return;
    this.spectro3dPanel = panel;
    slot.appendChild(panel.element);
    this.revealResultSlot(slot);
  }

  /**
   * Reveal a populated result-extra slot with a quick fade-in (only if it
   * actually received content). Collapsed-while-empty + fade keeps the result
   * screen from popping/jumping.
   */
  private revealResultSlot(slot: HTMLElement): void {
    if (!slot.firstChild) return;
    requestAnimationFrame(() => slot.classList.add('is-ready'));
  }

  /**
   * Show two fingerprint "irises" side by side on the result screen: the
   * reference and the measurement just taken, so their acoustic signatures can
   * be compared at a glance. Reference uses the stored reference audio when
   * available, otherwise the baseline model's spectrum.
   */
  private populateIrisComparison(
    diagnosis: DiagnosisResult,
    referenceBuffer: AudioBuffer | null,
    measurementBuffer: AudioBuffer | null
  ): void {
    const container = document.getElementById('iris-comparison');
    if (!container) return;

    // Reference spectrum: prefer reference audio, fall back to baseline model.
    // Only real reference audio populates the analysis-canvas overlay.
    let refVector: ArrayLike<number> | null = null;
    this.lastReferenceSpectrum = null;
    if (referenceBuffer) {
      refVector = averageSpectrum(referenceBuffer);
      this.lastReferenceSpectrum = { data: refVector, nyquist: referenceBuffer.sampleRate / 2 };
    }
    if (!refVector) {
      const baseline =
        this.activeModels.find((m) => m.label === 'Baseline') || this.activeModels[0];
      const baselineWeights = baseline ? getModelWeightVector(baseline) : undefined;
      if (baselineWeights?.length) refVector = baselineWeights;
    }

    const measVector = measurementBuffer ? averageSpectrum(measurementBuffer) : null;
    // Remember the measured spectrum so the expert analysis canvas can render it
    // even for engines that don't produce an ESD feature vector (e.g. YAMNet).
    this.lastMeasurementSpectrum =
      measVector && measurementBuffer
        ? { data: measVector, nyquist: measurementBuffer.sampleRate / 2 }
        : null;

    // Document the "bad features" of this check — frequency bands where the
    // measurement adds energy the reference doesn't — and persist them on the
    // diagnosis so the history can list them and mark the timeline. Computed
    // once (guard) and only when both spectra are available; backfills older
    // results too when their audio is still retained.
    if (
      refVector &&
      measVector &&
      measurementBuffer &&
      !diagnosis.analysis?.frequencyAnomalies
    ) {
      const anomalies = topDeviations(refVector, measVector, measurementBuffer.sampleRate / 2);
      diagnosis.analysis = { ...(diagnosis.analysis ?? {}), frequencyAnomalies: anomalies };
      void saveDiagnosis(diagnosis);
    }

    if (!refVector && !measVector) return;

    container.innerHTML = '';

    const makeCell = (label: string, vector: ArrayLike<number>) => {
      const cell = document.createElement('div');
      cell.className = 'iris-cell';
      const canvas = document.createElement('canvas');
      canvas.className = 'iris-comparison-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('div');
      caption.className = 'iris-cell-label';
      caption.textContent = label;
      cell.appendChild(canvas);
      cell.appendChild(caption);
      container.appendChild(cell);
      requestAnimationFrame(() => renderMachineFingerprint(canvas, vector));
    };

    if (refVector) makeCell(t('diagnose.display.irisReference'), refVector);
    if (measVector) makeCell(t('diagnose.display.irisMeasurement'), measVector);

    // When the machine deviates from the reference, point to the frequency
    // where the deviation is strongest, so the user can check (with a
    // frequency-locator) whether it comes from the machine or the environment.
    if (diagnosis.status !== 'healthy' && refVector && measVector && measurementBuffer) {
      const hz = topDeviationHz(refVector, measVector, measurementBuffer.sampleRate / 2);
      if (hz && hz > 0) {
        const freqText = hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
        const devBox = document.createElement('div');
        devBox.className = 'deviation-frequency';
        const line = document.createElement('div');
        line.className = 'deviation-frequency-main';
        line.textContent = t('diagnose.display.deviationFrequencyLabel', { freq: freqText });
        const hint = document.createElement('div');
        hint.className = 'deviation-frequency-hint';
        hint.textContent = t('diagnose.display.deviationFrequencyHint');
        devBox.appendChild(line);
        devBox.appendChild(hint);
        container.appendChild(devBox);
      }
    }

    // Operating-point check: if the dominant frequency shifted a lot versus the
    // reference, a lower score may reflect a different speed/load rather than a
    // fault. Additive hint only – never changes the score. Requires real
    // reference audio and a non-healthy result.
    if (
      diagnosis.status !== 'healthy' &&
      this.lastReferenceSpectrum &&
      measVector &&
      measurementBuffer
    ) {
      const refDom = dominantFrequency(
        this.lastReferenceSpectrum.data,
        this.lastReferenceSpectrum.nyquist
      );
      const measDom = dominantFrequency(measVector, measurementBuffer.sampleRate / 2);
      if (refDom > 0 && measDom > 0 && Math.abs(measDom - refDom) / refDom > 0.15) {
        const fmt = (hz: number) =>
          hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
        const opBox = document.createElement('div');
        opBox.className = 'deviation-frequency operating-point-note';
        const opLine = document.createElement('div');
        opLine.className = 'deviation-frequency-main';
        opLine.textContent = t('diagnose.display.operatingPointWarning', {
          refFreq: fmt(refDom),
          measFreq: fmt(measDom),
        });
        opBox.appendChild(opLine);
        container.appendChild(opBox);
      }
    }

    // Re-draw the expert analysis canvas now that the reference and/or measured
    // spectrum are available, so it can overlay the reference for deviation
    // context (and, for engines without an ESD vector like YAMNet, draw the
    // measured curve at all).
    if (this.lastReferenceSpectrum || this.lastMeasurementSpectrum) {
      this.drawAnalysisCanvas(diagnosis);
    }

    this.revealResultSlot(container);
  }

  /**
   * Start capturing the diagnosis audio for later A/B playback.
   *
   * Uses a dedicated MediaRecorder on the microphone stream – completely
   * decoupled from the scoring pipeline, so it can never affect the
   * measurement. Idempotent (safe to call from multiple start callbacks).
   */
  private startDiagnosisAudioCapture(): void {
    if (this.diagnosisRecorder || !this.mediaStream) return;
    if (typeof MediaRecorder === 'undefined') return; // unsupported (e.g. older iOS)

    try {
      this.diagnosisAudioChunks = [];
      this.lastDiagnosisAudioBuffer = null;
      const recorder = new MediaRecorder(this.mediaStream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.diagnosisAudioChunks.push(e.data);
      };
      recorder.start();
      this.diagnosisRecorder = recorder;
    } catch (error) {
      logger.warn('Could not start diagnosis audio capture:', error);
      this.diagnosisRecorder = null;
    }
  }

  /**
   * Stop diagnosis audio capture and decode it to an AudioBuffer.
   *
   * Must be called before the media stream is stopped. Stores a promise that
   * resolves to the decoded buffer (or null), which the result screen awaits.
   */
  private stopDiagnosisAudioCapture(): void {
    const recorder = this.diagnosisRecorder;
    if (!recorder) return;
    this.diagnosisRecorder = null;

    this.diagnosisAudioPromise = new Promise<AudioBuffer | null>((resolve) => {
      recorder.onstop = async () => {
        try {
          if (this.diagnosisAudioChunks.length === 0) {
            resolve(null);
            return;
          }
          const blob = new Blob(this.diagnosisAudioChunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          this.diagnosisAudioChunks = [];
          const arrayBuffer = await blob.arrayBuffer();
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioCtx) {
            resolve(null);
            return;
          }
          const ctx = new AudioCtx();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          await ctx.close();
          this.lastDiagnosisAudioBuffer = audioBuffer;
          resolve(audioBuffer);
        } catch (error) {
          logger.warn('Could not decode diagnosis audio:', error);
          resolve(null);
        }
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Persist the captured measurement audio for later re-opening, honoring the
   * retention setting ('none' | 'latest' | 'all'). The recording id matches the
   * diagnosis id so the result screen can fetch the right audio later.
   *
   * Additive and failure-tolerant – never breaks diagnosis saving.
   */
  private async persistDiagnosisAudio(diagnosisId: string): Promise<void> {
    const mode = getDiagnosisAudioMode();
    if (mode === 'none') return;

    try {
      const buffer = (await this.diagnosisAudioPromise) ?? this.lastDiagnosisAudioBuffer;
      if (!buffer) return;

      // 'latest' → drop previously stored measurement audio for this machine
      if (mode === 'latest') {
        const existing = await getRecordingsForMachine(this.machine.id);
        for (const rec of existing) {
          if (rec.type === 'diagnosis') {
            await deleteRecording(rec.id);
          }
        }
      }

      await saveRecording({
        id: diagnosisId,
        machineId: this.machine.id,
        type: 'diagnosis',
        audioBuffer: buffer,
        timestamp: Date.now(),
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
      });
    } catch (error) {
      logger.warn('Could not persist diagnosis audio:', error);
    }
  }

  /**
   * Add A/B listening controls to the result screen: play the reference and
   * "this measurement" back to back by ear (the real "hear the difference"),
   * with an optional slow-motion toggle for transient/rhythmic detail.
   *
   * Degrades gracefully: shows only what audio is available. NFC-provisioned
   * machines may have no local reference audio; very old browsers may not have
   * captured the diagnosis audio.
   */
  private populateListenControls(
    referenceBuffer: AudioBuffer | null,
    diagnosisBuffer: AudioBuffer | null
  ): void {
    const container = document.getElementById('listen-controls');
    if (!container) return;

    if (!referenceBuffer && !diagnosisBuffer) return;

    if (!this.slowListenPlayer) {
      this.slowListenPlayer = new SlowListenPlayer();
    }
    this.listenPlayingKey = null;

    container.innerHTML = '';

    let speedFactor = 1; // 0.5 = slower/lower, 2 = faster/higher
    const buttons: Array<{ key: string; el: HTMLButtonElement; label: string }> = [];
    const buffers: Record<string, AudioBuffer> = {};

    const resetAll = () => {
      this.listenPlayingKey = null;
      for (const b of buttons) b.el.textContent = b.label;
    };

    // Play a given recording at the current speed, updating button labels
    const startPlayback = (key: string) => {
      const player = this.slowListenPlayer;
      const buffer = buffers[key];
      if (!player || !buffer) return;
      player.stop();
      resetAll();
      this.listenPlayingKey = key;
      const active = buttons.find((b) => b.key === key);
      if (active) active.el.textContent = t('diagnose.display.listenStop');
      void player.play(buffer, { playbackRate: speedFactor }, resetAll).catch((error) => {
        logger.warn('Listen playback failed:', error);
        resetAll();
      });
    };

    const makeListenButton = (key: string, label: string, buffer: AudioBuffer) => {
      buffers[key] = buffer;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-btn';
      btn.textContent = label;
      btn.onclick = () => {
        if (this.listenPlayingKey === key) {
          // tapping the active button just stops
          this.slowListenPlayer?.stop();
          resetAll();
          return;
        }
        startPlayback(key);
      };
      buttons.push({ key, el: btn, label });
      container.appendChild(btn);
    };

    // Geschwindigkeit: HIER erzeugt, aber erst am Ende angehängt. Grund: der
    // Transponier-Knopf ruft `applySpeed`, steht in der Reihe aber VOR den
    // Umschaltern. Erzeugung und Platzierung müssen deshalb getrennt sein.
    const slowToggle = document.createElement('button');
    const normalToggle = document.createElement('button');
    const fastToggle = document.createElement('button');

    // Speed selector: slower/lower (🐢), normal (▶), faster/higher (🐇).
    // Exactly one is active; the speed applies to whichever clip is playing.
    const updateSpeedActive = () => {
      slowToggle.classList.toggle('active', speedFactor === 0.5);
      normalToggle.classList.toggle('active', speedFactor === 1);
      fastToggle.classList.toggle('active', speedFactor === 2);
    };
    const applySpeed = (factor: number) => {
      speedFactor = factor;
      updateSpeedActive();
      // If something is playing, replay it immediately at the new speed
      const playingKey = this.listenPlayingKey;
      if (playingKey) startPlayback(playingKey);
    };

    // „Nur Unterschied" ZUERST, und als einzige gefüllte Fläche in der Reihe.
    //
    // Referenz und Messung nacheinander anzuhören kann jede Audio-App; das Ohr
    // hört dabei vor allem, was in beiden gleich ist. Was nur Zanobo kann, ist
    // das Gemeinsame WEGZURECHNEN und den Rest übrig zu lassen — und das ist
    // gleichzeitig das Einzige, womit sich der Ampel widersprechen lässt. Wenn
    // dieser Knopf hinter dem A/B-Vergleich steht, wird er zur Fußnote einer
    // Zahl, die man sonst nur glauben kann. Deshalb steht er vorn.
    //
    // Technisch: spektrale Subtraktion, nur wenn beide Aufnahmen vorliegen.
    if (referenceBuffer && diagnosisBuffer) {
      const refBuf = referenceBuffer;
      const measBuf = diagnosisBuffer;
      let differenceComputed = false;
      let computing = false;
      const diffLabel = t('diagnose.display.listenDifference');

      const diffBtn = document.createElement('button');
      diffBtn.type = 'button';
      diffBtn.className = 'listen-btn listen-btn-difference';
      diffBtn.textContent = diffLabel;
      buttons.push({ key: 'difference', el: diffBtn, label: diffLabel });

      diffBtn.onclick = () => {
        if (this.listenPlayingKey === 'difference') {
          this.slowListenPlayer?.stop();
          resetAll();
          return;
        }
        if (differenceComputed) {
          startPlayback('difference');
          return;
        }
        if (computing) return;
        computing = true;
        diffBtn.textContent = t('diagnose.display.listenComputing');
        // Defer so the "computing" label paints before the heavy synchronous DSP
        setTimeout(() => {
          try {
            const result = isolateDifference(refBuf, measBuf);
            if (result.samples.length === 0) {
              notify.info(t('diagnose.display.listenDifferenceTooShort'));
              diffBtn.textContent = diffLabel;
              computing = false;
              return;
            }
            buffers['difference'] = this.samplesToAudioBuffer(result.samples, result.sampleRate);
            differenceComputed = true;
            computing = false;
            diffBtn.textContent = diffLabel;
            startPlayback('difference');
          } catch (error) {
            logger.warn('Difference isolation failed:', error);
            diffBtn.textContent = diffLabel;
            computing = false;
          }
        }, 50);
      };
      container.appendChild(diffBtn);
    }

    // Faktor AUS DER MESSUNG statt 0,5/1/2 nach Gefühl: die Frequenz mit dem
    // größten Unterschied wird auf ~3 kHz gezogen, wo das Ohr am besten auflöst
    // und der Handylautsprecher noch trägt. Resampling nimmt den Rhythmus mit —
    // gewollt, denn genau dadurch wird ein Klopfen im Dauergeräusch hörbar.
    if (referenceBuffer && diagnosisBuffer) {
      const refBuf = referenceBuffer;
      const measBuf = diagnosisBuffer;
      const tuneBtn = document.createElement('button');
      tuneBtn.type = 'button';
      tuneBtn.className = 'listen-btn listen-btn-tune';
      tuneBtn.textContent = t('diagnose.display.listenTune');
      let tuning = false;
      tuneBtn.onclick = () => {
        if (tuning) return;
        tuning = true;
        tuneBtn.textContent = t('diagnose.display.listenComputing');
        setTimeout(() => {
          tuning = false;
          const take = getDifferenceTake(refBuf, measBuf);
          // Feine Auflösung: 2,93 Hz statt 46,875 Hz. Der Transponier-Faktor folgt
          // direkt aus dieser Frequenz, ein 16-faches Raster war dort zu grob.
          const peakHz = take ? peakFrequencyFine(take.buffer) : null;
          if (!take || peakHz === null) {
            tuneBtn.textContent = t('diagnose.display.listenTune');
            notify.info(t('diagnose.display.listenDifferenceTooShort'));
            return;
          }
          buffers['difference'] = take.buffer;
          const plan = planTranspose(peakHz);
          tuneBtn.textContent = t('diagnose.display.listenTuneResult', {
            peak: formatHz(plan.peakHz),
            target: formatHz(plan.resultHz),
          });
          tuneBtn.title = plan.clamped
            ? t('diagnose.display.listenTuneClamped')
            : t('diagnose.display.listenTuneExact');
          applySpeed(plan.factor);
          startPlayback('difference');
        }, 50);
      };
      container.appendChild(tuneBtn);
    }

    // A/B danach: Referenz und Messung einzeln anhören. Bleibt erreichbar (es ist
    // die Gegenprobe zur Differenz), ist aber nicht mehr das Erste, was man sieht.
    if (referenceBuffer) {
      makeListenButton('reference', t('diagnose.display.listenReference'), referenceBuffer);
    }
    if (diagnosisBuffer) {
      makeListenButton('measurement', t('diagnose.display.listenMeasurement'), diagnosisBuffer);
    }

    // Speed toggles: slower/lower (🐢, good for impacts/rattles) and
    // faster/higher (🐇, transposes low content up into the phone-speaker range
    // so deep hums become audible). Mutually exclusive; tapping the active one
    // returns to normal speed. Ganz am Ende: sie verändern das Abspielen, sie
    // starten nichts.
    slowToggle.type = 'button';
    slowToggle.className = 'listen-slow-toggle';
    slowToggle.textContent = t('diagnose.display.listenSlow');
    slowToggle.onclick = () => applySpeed(0.5);
    container.appendChild(slowToggle);

    normalToggle.type = 'button';
    normalToggle.className = 'listen-slow-toggle listen-normal-toggle';
    normalToggle.textContent = t('diagnose.display.listenNormal');
    normalToggle.onclick = () => applySpeed(1);
    container.appendChild(normalToggle);

    fastToggle.type = 'button';
    fastToggle.className = 'listen-slow-toggle listen-fast-toggle';
    fastToggle.textContent = t('diagnose.display.listenFaster');
    fastToggle.setAttribute('aria-pressed', 'false');
    fastToggle.onclick = () => applySpeed(2);
    container.appendChild(fastToggle);

    updateSpeedActive(); // Normal active by default

    this.revealResultSlot(container);
  }

  /**
   * Wrap a mono sample buffer into a playable AudioBuffer.
   */
  private samplesToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    void ctx.close();
    return buffer;
  }

  /**
   * Draw the frequency-analysis visualization on the expert "Varianz /
   * Frequenzabweichung" canvas.
   *
   * Plots the measured spectrum on logarithmic frequency (x) and logarithmic
   * amplitude/dB (y) axes as a status-coloured line, and annotates the two
   * dominant spectral peaks with a dashed marker and their frequency value so
   * the user can tell which frequencies the energy sits at.
   */
  /**
   * Set the live "ghost" overlay from the machine's reference AUDIO (for engines
   * whose model carries no spectrum, i.e. YAMNet). Best-effort: silently does
   * nothing if no reference audio is stored or the visualizer is gone.
   */
  private async loadReferenceGhostFromAudio(): Promise<void> {
    try {
      const recordings = await getRecordingsForMachine(this.machine.id);
      const refBuffer = recordings
        .filter((r) => r.type === 'reference' && r.audioBuffer)
        .sort((a, b) => b.timestamp - a.timestamp)[0]?.audioBuffer;
      if (!refBuffer || !this.visualizer) return;
      const spectrum = averageSpectrum(refBuffer);
      this.visualizer.setReferenceSpectrum(spectrum, refBuffer.sampleRate / 2);
    } catch (error) {
      logger.warn('Could not build reference ghost from audio:', error);
    }
  }

  private drawAnalysisCanvas(diagnosis: DiagnosisResult): void {
    const canvas = document.getElementById('analysis-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    // Prefer the engine's ESD feature vector (GMIA / spectral-cosine). When the
    // active engine produces none (YAMNet), fall back to the measured spectrum
    // computed from the captured audio, so the "Frequenzabweichung" plot — the
    // measured curve over the reference, with the strongest deviations — is
    // shown regardless of the evaluation method.
    const measured = this.lastFeatureVector
      ? this.lastFeatureVector
      : this.lastMeasurementSpectrum
        ? {
            features: this.lastMeasurementSpectrum.data,
            frequencyRange: [0, this.lastMeasurementSpectrum.nyquist] as [number, number],
          }
        : null;
    if (!measured) return;
    renderAnalysisCanvas(canvas, measured, this.lastReferenceSpectrum, diagnosis.status);
  }

  /**
   * Update Work Point Ranking component with all model scores
   *
   * This provides a detailed view of all trained machine states
   * and their probability scores for Advanced/Expert users.
   */
  private updateWorkPointRanking(): void {
    // YAMNet produces no ESD feature vector and is skipped by the sync
    // dispatcher, so reuse the per-state scores captured during the live YAMNet
    // diagnosis. All other engines score synchronously from the feature vector.
    // NOTE: detect YAMNet by the captured scores, NOT this.diagnosisIsYamnet —
    // cleanup() resets that flag before the result screen renders. lastYamnetScores
    // survives cleanup and is only set during a YAMNet diagnosis.
    let modelScores: WorkPointScore[];
    if (this.lastYamnetScores && this.lastYamnetScores.length > 0) {
      modelScores = this.lastYamnetScores;
    } else {
      if (!this.lastFeatureVector || !this.activeModels || this.activeModels.length === 0) {
        logger.debug('📊 WorkPointRanking: No feature vector or models available');
        return;
      }
      modelScores = scoreAllWithEngines(this.activeModels, {
        feature: this.lastFeatureVector,
        sampleRate: this.actualSampleRate,
      });
    }

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
  /**
   * Render the "Auffällige Merkmale" list for the most recent check in the
   * history modal. Lists every recorded bad feature (even weak ones, so they're
   * at least documented); strong ones (≥ 50 %) are marked red to match the
   * timeline markers.
   */
  private renderHistoryAnomalyList(diagnoses: DiagnosisResult[]): void {
    const listEl = document.getElementById('history-anomaly-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const latest = diagnoses.reduce(
      (a, b) => (b.timestamp > a.timestamp ? b : a),
      diagnoses[0]
    );
    const anomalies = latest?.analysis?.frequencyAnomalies ?? [];

    if (anomalies.length === 0) {
      const li = document.createElement('li');
      li.className = 'history-anomaly-empty';
      li.textContent = t('historyChart.anomalyNone');
      listEl.appendChild(li);
      return;
    }

    const fmtHz = (hz: number): string =>
      hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;

    for (const a of anomalies) {
      const li = document.createElement('li');
      li.className = 'history-anomaly-item';
      if (a.strength >= 50) li.classList.add('is-strong');

      const freq = document.createElement('span');
      freq.className = 'history-anomaly-freq';
      freq.textContent = fmtHz(a.frequency);

      const strength = document.createElement('span');
      strength.className = 'history-anomaly-strength';
      strength.textContent = `${Math.round(a.strength)}%`;

      li.appendChild(freq);
      li.appendChild(strength);
      listEl.appendChild(li);
    }
  }

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
            day: 'numeric',
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

      // List the bad features ("Auffällige Merkmale") of the most recent check.
      this.renderHistoryAnomalyList(diagnoses);

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

    // Destroy the on-demand basic-view spectrum visualizer
    if (this.revealVisualizer) {
      this.revealVisualizer.destroy();
      this.revealVisualizer = null;
    }

    // Stop any A/B listening playback
    if (this.slowListenPlayer) {
      this.slowListenPlayer.stop();
      this.slowListenPlayer = null;
    }

    // Stop diagnosis audio capture and release captured buffers
    this.stopDiagnosisAudioCapture();
    this.diagnosisAudioChunks = [];
    this.lastDiagnosisAudioBuffer = null;
    this.diagnosisAudioPromise = null;
    this.listenPlayingKey = null;

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
    this.lastReferenceSpectrum = null;
    this.lastMeasurementSpectrum = null;
    this.lastYamnetScores = null;
    this.diagnosisQualityFeatures = [];
    this.measurementSignalTooWeak = false;

    // Clear score history
    this.scoreHistory.clear();
    this.faultScoreHistory.clear();
    this.labelHistory.clear(); // CRITICAL FIX: Clear label history
    this.lastFaultLabel = '';
    this.lastFaultScore = 0;
    this.lastBestFaultLabel = '';
    this.lastBestFaultScore = 0;
    this.lastFaultModelsExist = false;
    // Mit zurücksetzen: sonst zeigt die Auflösungszeile beim nächsten Ergebnis
    // die Zahl einer Referenz, die zur Maschine davor gehörte.
    this.lastHealthyLabel = '';
  }
}
