/**
 * ZANOBOT - PHASE 4: SETTINGS
 *
 * Application settings and data management.
 *
 * Features:
 * - Database backup (export to JSON)
 * - Database restore (import from JSON)
 * - Data statistics
 * - Clear all data
 */

import { exportData, importData, getDBStats, clearAllData } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import {
  getVisualizerSettings,
  setVisualizerSettings,
} from '@utils/visualizerSettings.js';
import {
  getRecordingSettings,
  setRecordingSettings,
} from '@utils/recordingSettings.js';
import { t } from '../../i18n/index.js';
import {
  getRoomCompSettings,
  setRoomCompSettings,
  playChirpAndRecord,
  estimateT60FromChirp,
  classifyT60Value,
  getT60ClassificationLabel,
} from '@core/dsp/roomCompensation.js';
import { getRawAudioStream } from '@core/audio/audioHelper.js';
import {
  getCherryPickSettings,
  setCherryPickSettings,
} from '@core/dsp/cherryPicking.js';
import {
  getDriftSettings,
  setDriftSettings,
  getHzPerBin,
} from '@core/dsp/driftDetector.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { applyDefaults } from '@utils/viewLevelSettings.js';
import { toast } from '@ui/components/Toast.js';

export class SettingsPhase {

  // Pre-built export payload for instant sharing (preserves user gesture)
  private preparedSharePayload: {
    file: File;
    filename: string;
    blob: Blob;
  } | null = null;
  private isPreparingPayload = false;

  // CRITICAL FIX: Store event handler references for proper cleanup in destroy()
  private eventHandlers: Map<string, { element: HTMLElement; handler: () => void }> = new Map();

  constructor() {}

  /**
   * Initialize the settings phase UI
   */
  public init(): void {
    // CRITICAL FIX: Use helper method to register event handlers for proper cleanup
    this.registerEventHandler('export-data-btn', () => this.handleExportData());
    this.registerEventHandler('import-data-btn', () => this.handleImportData());
    this.registerEventHandler('share-data-btn', () => this.handleShareData());
    this.registerEventHandler('clear-data-btn', () => this.handleClearData());
    this.registerEventHandler('show-stats-btn', () => this.showStats());

    // Reset to Defaults – two-step button pattern
    this.initResetDefaultsButton();

    this.initVisualizerScaleSettings();
    this.initRecordingSettings();

    // Initialize banner settings (advanced/expert only)
    this.initBannerSettings();

    // Initialize standalone room measurement (all view levels)
    this.initRoomMeasurement();

    // Initialize room compensation settings (expert only)
    this.initRoomCompSettings();

    // Initialize cherry-picking settings (expert only)
    this.initCherryPickSettings();

    // Initialize drift detector settings (expert only)
    this.initDriftDetectorSettings();

    // Load stats on init
    this.showStats();

    // Pre-build share payload in background (for instant sharing without losing user gesture)
    this.prepareSharePayload();
  }

  /**
   * Prepare export payload in background for instant sharing.
   * This is called on init so that when user clicks "Share",
   * we can call navigator.share() immediately without async work,
   * preserving the user gesture (required by Web Share API).
   */
  private async prepareSharePayload(): Promise<void> {
    if (this.isPreparingPayload) return;

    this.isPreparingPayload = true;
    try {
      logger.info('🔄 Preparing share payload in background...');
      const payload = await this.buildExportPayload();
      this.preparedSharePayload = payload;
      logger.info('✅ Share payload ready');
    } catch (error) {
      logger.warn('Failed to prepare share payload:', error);
      this.preparedSharePayload = null;
    } finally {
      this.isPreparingPayload = false;
    }
  }

  private initVisualizerScaleSettings(): void {
    const freqToggle = document.getElementById(
      'frequency-scale-toggle'
    ) as HTMLInputElement | null;
    const ampToggle = document.getElementById(
      'amplitude-scale-toggle'
    ) as HTMLInputElement | null;

    if (!freqToggle && !ampToggle) {
      return;
    }

    const settings = getVisualizerSettings();

    if (freqToggle) {
      freqToggle.checked = settings.frequencyScale === 'log';
      freqToggle.addEventListener('change', () => {
        setVisualizerSettings({
          frequencyScale: freqToggle.checked ? 'log' : 'linear',
        });
      });
    }

    if (ampToggle) {
      ampToggle.checked = settings.amplitudeScale === 'log';
      ampToggle.addEventListener('change', () => {
        setVisualizerSettings({
          amplitudeScale: ampToggle.checked ? 'log' : 'linear',
        });
      });
    }
  }

  private initRecordingSettings(): void {
    const confidenceSlider = document.getElementById(
      'confidence-threshold'
    ) as HTMLInputElement | null;
    const confidenceValue = document.getElementById('confidence-value');
    const faultySlider = document.getElementById(
      'faulty-threshold'
    ) as HTMLInputElement | null;
    const faultyValue = document.getElementById('faulty-value');
    const durationSelect = document.getElementById(
      'recording-duration'
    ) as HTMLSelectElement | null;
    const disableAudioTriggerToggle = document.getElementById(
      'disable-audio-trigger-toggle'
    ) as HTMLInputElement | null;

    if (!confidenceSlider && !faultySlider && !durationSelect && !disableAudioTriggerToggle) {
      return;
    }

    const settings = getRecordingSettings();

    if (confidenceSlider) {
      confidenceSlider.value = settings.confidenceThreshold.toString();
      if (confidenceValue) {
        confidenceValue.textContent = `${settings.confidenceThreshold}%`;
      }

      confidenceSlider.addEventListener('input', () => {
        const value = parseInt(confidenceSlider.value, 10);
        if (confidenceValue) {
          confidenceValue.textContent = `${value}%`;
        }
        try {
          setRecordingSettings({
            confidenceThreshold: value,
          });
          // Update faulty slider max to ensure it stays below confidence threshold
          if (faultySlider) {
            const currentFaulty = parseInt(faultySlider.value, 10);
            if (currentFaulty >= value) {
              faultySlider.value = Math.max(0, value - 10).toString();
              if (faultyValue) {
                faultyValue.textContent = `${faultySlider.value}%`;
              }
            }
          }
        } catch (error) {
          logger.error('Failed to save confidence threshold:', error);
          notify.error(
            'Die Vertrauensschwelle konnte nicht gespeichert werden. Möglicherweise ist der Speicher voll oder Sie befinden sich im privaten Modus.',
            error as Error,
            { title: 'Speicherfehler', duration: 5000 }
          );
        }
      });
    }

    if (faultySlider) {
      faultySlider.value = settings.faultyThreshold.toString();
      if (faultyValue) {
        faultyValue.textContent = `${settings.faultyThreshold}%`;
      }

      faultySlider.addEventListener('input', () => {
        const value = parseInt(faultySlider.value, 10);
        if (faultyValue) {
          faultyValue.textContent = `${value}%`;
        }
        try {
          setRecordingSettings({
            faultyThreshold: value,
          });
        } catch (error) {
          logger.error('Failed to save faulty threshold:', error);
          notify.error(
            'Die Auffälligkeitsschwelle konnte nicht gespeichert werden. Möglicherweise ist der Speicher voll oder Sie befinden sich im privaten Modus.',
            error as Error,
            { title: 'Speicherfehler', duration: 5000 }
          );
        }
      });
    }

    if (durationSelect) {
      durationSelect.value = settings.recordingDuration.toString();
      durationSelect.addEventListener('change', () => {
        const value = parseInt(durationSelect.value, 10);
        try {
          setRecordingSettings({
            recordingDuration: value,
          });
        } catch (error) {
          logger.error('Failed to save recording duration:', error);
          notify.error(
            'Die Aufnahmedauer konnte nicht gespeichert werden. Möglicherweise ist der Speicher voll oder Sie befinden sich im privaten Modus.',
            error as Error,
            { title: 'Speicherfehler', duration: 5000 }
          );
        }
      });
    }

    if (disableAudioTriggerToggle) {
      disableAudioTriggerToggle.checked = settings.disableAudioTrigger;
      disableAudioTriggerToggle.addEventListener('change', () => {
        try {
          setRecordingSettings({
            disableAudioTrigger: disableAudioTriggerToggle.checked,
          });
          logger.info(`Audio-Trigger ${disableAudioTriggerToggle.checked ? 'deaktiviert' : 'aktiviert'}`);
        } catch (error) {
          logger.error('Failed to save disable audio trigger setting:', error);
          notify.error(
            'Die Audio-Trigger-Einstellung konnte nicht gespeichert werden. Möglicherweise ist der Speicher voll oder Sie befinden sich im privaten Modus.',
            error as Error,
            { title: 'Speicherfehler', duration: 5000 }
          );
        }
      });
    }
  }

  private async initBannerSettings(): Promise<void> {
    const previewImage = document.getElementById('banner-preview-image') as HTMLImageElement | null;
    const uploadBtn = document.getElementById('banner-upload-btn');
    const resetBtn = document.getElementById('banner-reset-btn') as HTMLButtonElement | null;
    const uploadInput = document.getElementById('banner-upload-input') as HTMLInputElement | null;

    if (!previewImage || !uploadBtn || !resetBtn || !uploadInput) {
      return;
    }

    // Import BannerManager dynamically to access instance
    const { getBannerManager } = await import('../BannerManager.js');
    const bannerManager = getBannerManager();

    if (!bannerManager) {
      logger.warn('⚠️ BannerManager not available for settings');
      return;
    }

    // Update preview and reset button state
    const updateBannerPreview = async () => {
      const currentSrc = bannerManager.getCurrentBannerSrc();
      if (currentSrc) {
        previewImage.src = currentSrc;
      }

      const hasCustom = await bannerManager.hasCustomBannerForCurrentTheme();
      resetBtn.disabled = !hasCustom;
    };

    // Initial update
    void updateBannerPreview();

    // Upload button click
    uploadBtn.addEventListener('click', () => {
      uploadInput.click();
    });

    // Handle file selection
    uploadInput.addEventListener('change', async (event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      const file = input?.files?.[0];

      if (!file) {
        return;
      }

      const success = await bannerManager.uploadBanner(file);
      if (success) {
        await updateBannerPreview();
      }

      // Clear input so same file can be selected again
      input.value = '';
    });

    // Reset button click
    resetBtn.addEventListener('click', async () => {
      await bannerManager.resetBanner();
      await updateBannerPreview();
    });

    // Update preview when theme changes
    window.addEventListener('themechange', () => {
      void updateBannerPreview();
    });
  }

  // ════════════════════════════════════════════════════════════
  // STANDALONE ROOM MEASUREMENT (T60 via 3× Chirp)
  // ════════════════════════════════════════════════════════════

  /**
   * Initialize standalone room measurement button and UI.
   * Visible to ALL view levels (not expert-only).
   */
  private initRoomMeasurement(): void {
    const measureBtn = document.getElementById('room-measure-btn') as HTMLButtonElement | null;
    if (!measureBtn) return;

    measureBtn.addEventListener('click', () => {
      void this.performRoomMeasurement();
    });
  }

  private async performRoomMeasurement(): Promise<void> {
    const measureBtn = document.getElementById('room-measure-btn') as HTMLButtonElement | null;
    if (!measureBtn) return;

    const btnText = document.getElementById('room-measure-btn-text');
    const btnIcon = document.getElementById('room-measure-btn-icon');
    const progressSection = document.getElementById('room-measure-progress');
    const progressBar = document.getElementById('room-measure-progress-bar') as HTMLElement | null;
    const progressText = document.getElementById('room-measure-progress-text');
    const resultSection = document.getElementById('room-measure-result');
    const errorSection = document.getElementById('room-measure-error');

    // ── UI: Start measurement ──────────────────────────────
    measureBtn.disabled = true;
    if (btnText) btnText.textContent = t('roomMeasure.measuring');
    if (btnIcon) btnIcon.textContent = '\u23F3'; // ⏳
    if (resultSection) resultSection.style.display = 'none';
    if (errorSection) errorSection.style.display = 'none';
    if (progressSection) progressSection.style.display = '';
    if (progressBar) progressBar.style.width = '0%';

    const NUM_CHIRPS = 3;
    const PAUSE_BETWEEN_MS = 800;
    const t60Values: number[] = [];

    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;

    try {
      // ── Initialize audio ─────────────────────────────────
      audioContext = new AudioContext({ sampleRate: 48000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      stream = await getRawAudioStream();

      // ── Run 3 chirps ─────────────────────────────────────
      for (let i = 0; i < NUM_CHIRPS; i++) {
        if (progressText) {
          progressText.textContent = t('roomMeasure.chirpProgress', {
            current: String(i + 1),
            total: String(NUM_CHIRPS),
          });
        }
        if (progressBar) {
          progressBar.style.width = `${(i / NUM_CHIRPS) * 100}%`;
        }

        const { chirp, recorded } = await playChirpAndRecord(audioContext, stream);
        const t60Result = estimateT60FromChirp(chirp, recorded, audioContext.sampleRate);

        if (t60Result && t60Result.broadband > 0) {
          t60Values.push(t60Result.broadband);
          logger.info(`Chirp ${i + 1}/${NUM_CHIRPS}: T60 = ${t60Result.broadband.toFixed(3)}s`);
        } else {
          logger.warn(`Chirp ${i + 1}/${NUM_CHIRPS}: No valid T60 value`);
        }

        // Pause between chirps (let reverb decay)
        if (i < NUM_CHIRPS - 1) {
          await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_MS));
        }
      }

      // Progress: 100%
      if (progressBar) progressBar.style.width = '100%';

      // ── Cleanup audio ────────────────────────────────────
      stream.getTracks().forEach(track => track.stop());
      await audioContext.close();
      audioContext = null;
      stream = null;

      // ── Evaluate result ──────────────────────────────────
      if (t60Values.length === 0) {
        this.showRoomMeasurementError(t('roomMeasure.errorNoResult'));
        return;
      }

      if (t60Values.length < 2) {
        logger.warn(`Only ${t60Values.length} of ${NUM_CHIRPS} chirps successful`);
      }

      // Mean
      const meanT60 = t60Values.reduce((a, b) => a + b, 0) / t60Values.length;

      // Standard deviation
      const stddev = t60Values.length > 1
        ? Math.sqrt(
            t60Values.reduce((sum, v) => sum + (v - meanT60) ** 2, 0) / (t60Values.length - 1)
          )
        : 0;

      const isStable = stddev < 0.15;

      logger.info(`Room measurement result: T60 = ${meanT60.toFixed(3)}s ± ${stddev.toFixed(3)}s (${t60Values.length}/${NUM_CHIRPS} chirps)`);

      // ── Show result ──────────────────────────────────────
      this.showRoomMeasurementResult(meanT60, stddev, t60Values, isStable);

    } catch (error) {
      logger.error('Room measurement error:', error);

      // Cleanup on error
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        try { await audioContext.close(); } catch { /* ignore */ }
      }

      let errorMsg = t('roomMeasure.errorGeneric');
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          errorMsg = t('roomMeasure.errorMicPermission');
        } else if (error.name === 'NotFoundError') {
          errorMsg = t('roomMeasure.errorNoMic');
        }
      }
      this.showRoomMeasurementError(errorMsg);

    } finally {
      // ── Reset button ─────────────────────────────────────
      measureBtn.disabled = false;
      const resultVisible = document.getElementById('room-measure-result');
      if (btnText) {
        btnText.textContent = resultVisible?.style.display !== 'none'
          ? t('roomMeasure.measureAgain')
          : t('roomMeasure.measureBtn');
      }
      if (btnIcon) btnIcon.textContent = '\uD83D\uDD0A'; // 🔊
      if (progressSection) progressSection.style.display = 'none';
    }
  }

  private showRoomMeasurementResult(
    meanT60: number,
    stddev: number,
    individual: number[],
    isStable: boolean
  ): void {
    const errorSection = document.getElementById('room-measure-error');
    const resultSection = document.getElementById('room-measure-result');
    if (errorSection) errorSection.style.display = 'none';
    if (!resultSection) return;
    resultSection.style.display = '';

    // T60 value
    const t60El = document.getElementById('room-measure-t60');
    if (t60El) t60El.textContent = meanT60.toFixed(2);

    // Classification
    const classification = classifyT60Value(meanT60);
    const classEl = document.getElementById('room-measure-classification');
    const colorClass = this.getT60ColorClass(classification);

    if (classEl) {
      classEl.textContent = this.getRoomMeasureClassLabel(classification);
      classEl.className = 'room-measure-classification ' + colorClass;
    }

    // Color the T60 value
    if (t60El) {
      t60El.className = 'room-measure-t60 ' + colorClass;
    }

    // Position scale marker (0.0s = 0%, 2.5s = 100%)
    const marker = document.getElementById('room-measure-scale-marker');
    if (marker) {
      const pct = Math.min(Math.max(meanT60 / 2.5 * 100, 0), 100);
      marker.style.left = `calc(${pct}% - 2px)`;
    }

    // Individual measurements (Expert)
    const individualEl = document.getElementById('room-measure-individual');
    if (individualEl) {
      individualEl.textContent = `${t('roomMeasure.individual')}: ${individual.map(v => v.toFixed(2) + 's').join(', ')}`;
    }

    const stddevEl = document.getElementById('room-measure-stddev');
    if (stddevEl) {
      const stabilityIcon = isStable ? '\u2713' : '\u26A0';
      const stabilityText = isStable ? t('roomMeasure.stable') : t('roomMeasure.unstable');
      stddevEl.textContent = `${t('roomMeasure.stddev')}: ${stddev.toFixed(3)}s (${stabilityText} ${stabilityIcon})`;
    }

    // Update button text
    const btnText = document.getElementById('room-measure-btn-text');
    if (btnText) btnText.textContent = t('roomMeasure.measureAgain');
  }

  private showRoomMeasurementError(message: string): void {
    const resultSection = document.getElementById('room-measure-result');
    const errorSection = document.getElementById('room-measure-error');
    const errorText = document.getElementById('room-measure-error-text');
    if (resultSection) resultSection.style.display = 'none';
    if (!errorSection || !errorText) return;
    errorSection.style.display = '';
    errorText.textContent = message;
  }

  private getT60ColorClass(classification: string): string {
    switch (classification) {
      case 'very_dry':
      case 'dry':
        return 'rm-status-healthy';
      case 'medium':
        return 'rm-status-uncertain';
      case 'reverberant':
        return 'rm-status-warning';
      case 'very_reverberant':
        return 'rm-status-faulty';
      default:
        return '';
    }
  }

  private getRoomMeasureClassLabel(classification: string): string {
    const labels: Record<string, string> = {
      'very_dry': t('roomMeasure.classVeryDry'),
      'dry': t('roomMeasure.classDry'),
      'medium': t('roomMeasure.classMedium'),
      'reverberant': t('roomMeasure.classReverberant'),
      'very_reverberant': t('roomMeasure.classVeryReverberant'),
    };
    return labels[classification] ?? getT60ClassificationLabel(classification);
  }

  /**
   * Initialize room compensation settings (Expert only)
   * Reads settings from localStorage and binds UI toggles.
   */
  private initRoomCompSettings(): void {
    const masterToggle = document.getElementById('room-comp-toggle') as HTMLInputElement | null;
    const cmnToggle = document.getElementById('cmn-toggle') as HTMLInputElement | null;
    const biasMatchToggle = document.getElementById('bias-match-toggle') as HTMLInputElement | null;
    const detailsContainer = document.getElementById('room-comp-details');

    if (!masterToggle) {
      return;
    }

    const settings = getRoomCompSettings();

    // Initialize master toggle
    masterToggle.checked = settings.enabled;

    // Show/hide sub-settings based on master toggle
    if (detailsContainer) {
      detailsContainer.style.display = settings.enabled ? '' : 'none';
    }

    // Initialize Bias Match toggle
    if (biasMatchToggle) {
      biasMatchToggle.checked = settings.biasMatchEnabled;
    }

    // Initialize CMN toggle
    if (cmnToggle) {
      cmnToggle.checked = settings.cmnEnabled;
    }

    // Master toggle event
    masterToggle.addEventListener('change', () => {
      const enabled = masterToggle.checked;
      setRoomCompSettings({ enabled });

      if (detailsContainer) {
        detailsContainer.style.display = enabled ? '' : 'none';
      }

      logger.info(`🔧 Room compensation ${enabled ? 'enabled' : 'disabled'}`);
    });

    // Bias Match toggle event (mutually exclusive with CMN)
    if (biasMatchToggle) {
      biasMatchToggle.addEventListener('change', () => {
        setRoomCompSettings({ biasMatchEnabled: biasMatchToggle.checked });

        // If Bias Match ON → CMN automatically OFF (mutually exclusive)
        if (biasMatchToggle.checked && cmnToggle) {
          cmnToggle.checked = false;
          setRoomCompSettings({ cmnEnabled: false });
        }

        logger.info(`🔄 Session Bias Match ${biasMatchToggle.checked ? 'enabled' : 'disabled'}`);
      });
    }

    // CMN toggle event (mutually exclusive with Bias Match)
    if (cmnToggle) {
      cmnToggle.addEventListener('change', () => {
        setRoomCompSettings({ cmnEnabled: cmnToggle.checked });

        // If CMN ON → Bias Match automatically OFF (mutually exclusive)
        if (cmnToggle.checked && biasMatchToggle) {
          biasMatchToggle.checked = false;
          setRoomCompSettings({ biasMatchEnabled: false });
        }

        logger.info(`🔧 CMN ${cmnToggle.checked ? 'enabled' : 'disabled'}`);
      });
    }

    // T60 Chirp Toggle (Phase 2)
    const t60Setting = document.getElementById('t60-setting');
    const t60Toggle = document.getElementById('t60-toggle') as HTMLInputElement | null;
    const betaSetting = document.getElementById('beta-setting');
    const betaSlider = document.getElementById('beta-slider') as HTMLInputElement | null;
    const betaValue = document.getElementById('beta-value');

    // Make T60 setting visible (was hidden during Phase 1)
    if (t60Setting) {
      t60Setting.style.display = '';
    }

    if (t60Toggle) {
      t60Toggle.checked = settings.t60Enabled;

      // Show/hide beta slider based on T60 toggle
      if (betaSetting) {
        betaSetting.style.display = settings.t60Enabled ? '' : 'none';
      }

      t60Toggle.addEventListener('change', () => {
        setRoomCompSettings({ t60Enabled: t60Toggle.checked });
        if (betaSetting) {
          betaSetting.style.display = t60Toggle.checked ? '' : 'none';
        }
        logger.info(`🔧 T60 chirp ${t60Toggle.checked ? 'enabled' : 'disabled'}`);
      });
    }

    // Beta slider
    if (betaSlider) {
      betaSlider.value = String(settings.beta);
      if (betaValue) {
        betaValue.textContent = settings.beta.toFixed(1);
      }

      betaSlider.addEventListener('input', () => {
        const val = parseFloat(betaSlider.value);
        if (betaValue) {
          betaValue.textContent = val.toFixed(1);
        }
        setRoomCompSettings({ beta: val });
      });
    }
  }

  /**
   * Initialize cherry-picking settings (Expert only)
   * Reads settings from localStorage and binds UI toggle + slider.
   */
  private initCherryPickSettings(): void {
    const cherryPickToggle = document.getElementById('cherry-pick-toggle') as HTMLInputElement | null;
    const cherryPickDetails = document.getElementById('cherry-pick-details');

    if (!cherryPickToggle) {
      return;
    }

    const cpSettings = getCherryPickSettings();

    // Initialize master toggle
    cherryPickToggle.checked = cpSettings.enabled;

    // Show/hide sub-settings based on toggle
    if (cherryPickDetails) {
      cherryPickDetails.style.display = cpSettings.enabled ? '' : 'none';
    }

    // Toggle event
    cherryPickToggle.addEventListener('change', () => {
      const enabled = cherryPickToggle.checked;
      setCherryPickSettings({ enabled });

      if (cherryPickDetails) {
        cherryPickDetails.style.display = enabled ? '' : 'none';
      }

      logger.info(`🍒 Cherry-Picking ${enabled ? 'enabled' : 'disabled'}`);
    });

    // Sigma slider
    const sigmaSlider = document.getElementById('sigma-slider') as HTMLInputElement | null;
    const sigmaValue = document.getElementById('sigma-value');

    if (sigmaSlider) {
      sigmaSlider.value = String(cpSettings.sigmaThreshold);
      if (sigmaValue) {
        sigmaValue.textContent = cpSettings.sigmaThreshold.toFixed(1);
      }

      sigmaSlider.addEventListener('input', () => {
        const val = parseFloat(sigmaSlider.value);
        if (sigmaValue) {
          sigmaValue.textContent = val.toFixed(1);
        }
        setCherryPickSettings({ sigmaThreshold: val });
      });
    }
  }

  /**
   * Initialize drift detector settings (Expert only)
   * Reads settings from localStorage and binds UI toggle + sliders.
   */
  private initDriftDetectorSettings(): void {
    const driftToggle = document.getElementById('drift-toggle') as HTMLInputElement | null;
    const driftDetails = document.getElementById('drift-details-settings');

    if (!driftToggle) {
      return;
    }

    const dSettings = getDriftSettings();

    // Initialize master toggle
    driftToggle.checked = dSettings.enabled;

    // Show/hide sub-settings based on toggle
    if (driftDetails) {
      driftDetails.style.display = dSettings.enabled ? '' : 'none';
    }

    // Toggle event
    driftToggle.addEventListener('change', () => {
      const enabled = driftToggle.checked;
      setDriftSettings({ enabled });

      if (driftDetails) {
        driftDetails.style.display = enabled ? '' : 'none';
      }

      logger.info(`🔍 Drift detector ${enabled ? 'enabled' : 'disabled'}`);
    });

    // Smoothing window slider
    const smoothSlider = document.getElementById('drift-smooth-slider') as HTMLInputElement | null;
    const smoothValue = document.getElementById('drift-smooth-value');

    if (smoothSlider) {
      smoothSlider.value = String(dSettings.smoothWindow);
      if (smoothValue) {
        smoothValue.textContent = String(dSettings.smoothWindow);
      }

      smoothSlider.addEventListener('input', () => {
        const val = parseInt(smoothSlider.value);
        if (smoothValue) {
          smoothValue.textContent = String(val);
        }
        setDriftSettings({ smoothWindow: val });
      });
    }

    // Low-frequency cutoff slider (Room mode protection)
    const lowFreqSlider = document.getElementById('drift-lowfreq-slider') as HTMLInputElement | null;
    const lowFreqValue = document.getElementById('drift-lowfreq-value');
    const lowFreqHz = document.getElementById('drift-lowfreq-hz');
    // Compute Hz/bin from actual DSP config instead of hardcoding
    const hzPerBin = getHzPerBin(DEFAULT_DSP_CONFIG.sampleRate, DEFAULT_DSP_CONFIG.frequencyBins);

    if (lowFreqSlider) {
      lowFreqSlider.value = String(dSettings.lowFreqCutoffBin);
      if (lowFreqValue) {
        lowFreqValue.textContent = String(dSettings.lowFreqCutoffBin);
      }
      if (lowFreqHz) {
        lowFreqHz.textContent = `\u2248${Math.round(dSettings.lowFreqCutoffBin * hzPerBin)}`;
      }

      lowFreqSlider.addEventListener('input', () => {
        const val = parseInt(lowFreqSlider.value);
        if (lowFreqValue) {
          lowFreqValue.textContent = String(val);
        }
        if (lowFreqHz) {
          lowFreqHz.textContent = `\u2248${Math.round(val * hzPerBin)}`;
        }
        setDriftSettings({ lowFreqCutoffBin: val });
      });
    }

    // Global threshold slider (Room sensitivity)
    const globalSlider = document.getElementById('drift-global-slider') as HTMLInputElement | null;
    const globalValue = document.getElementById('drift-global-value');

    if (globalSlider) {
      globalSlider.value = String(dSettings.globalWarning);
      if (globalValue) {
        globalValue.textContent = dSettings.globalWarning.toFixed(2);
      }

      globalSlider.addEventListener('input', () => {
        const val = parseFloat(globalSlider.value);
        if (globalValue) {
          globalValue.textContent = val.toFixed(2);
        }
        // Critical = Warning × 2; mark as manual override
        setDriftSettings({ globalWarning: val, globalCritical: val * 2, hasManualOverride: true });
      });
    }

    // Local threshold slider (Machine sensitivity)
    const localSlider = document.getElementById('drift-local-slider') as HTMLInputElement | null;
    const localValue = document.getElementById('drift-local-value');

    if (localSlider) {
      localSlider.value = String(dSettings.localWarning);
      if (localValue) {
        localValue.textContent = dSettings.localWarning.toFixed(2);
      }

      localSlider.addEventListener('input', () => {
        const val = parseFloat(localSlider.value);
        if (localValue) {
          localValue.textContent = val.toFixed(2);
        }
        // Critical = Warning × 2; mark as manual override
        setDriftSettings({ localWarning: val, localCritical: val * 2, hasManualOverride: true });
      });
    }
  }

  /**
   * Handle database export
   */
  private async handleExportData(): Promise<void> {
    try {
      logger.info('📦 Exporting database...');

      const { data, filename, blob } = await this.buildExportPayload();

      this.triggerDownload(blob, filename);

      logger.info(`✅ Database exported: ${filename}`);
      notify.success(
        t('settings.export.success', {
          filename,
          machines: data.machines.length,
          recordings: data.recordings.length,
          diagnoses: data.diagnoses.length,
        }),
        { title: t('modals.databaseExported') }
      );
    } catch (error) {
      logger.error('Export error:', error);
      notify.error(t('settings.exportError'), error as Error);
    }
  }

  /**
   * Handle database share (send as file)
   *
   * IMPORTANT: Web Share API requires "transient user activation" - the share()
   * call must happen IMMEDIATELY after the user gesture (click), without any
   * await in between. That's why we pre-build the payload in prepareSharePayload()
   * and use it directly here.
   */
  private async handleShareData(): Promise<void> {
    logger.info('📤 Share button clicked');

    // Use pre-built payload if available (instant share, preserves user gesture)
    let payload = this.preparedSharePayload;

    // If payload not ready yet, we have to build it now (will likely fail on Android)
    if (!payload) {
      if (this.isPreparingPayload) {
        notify.info(t('settings.share.preparing'));
        return;
      }

      // Build payload now (fallback - user gesture will likely expire)
      logger.warn('Share payload not ready, building now (user gesture may expire)');
      try {
        payload = await this.buildExportPayload();
      } catch (error) {
        logger.error('Failed to build export payload:', error);
        notify.error(t('settings.shareError'), error as Error);
        return;
      }
    }

    const { file, filename, blob } = payload;

    // Check if Web Share API with files is available
    if (!navigator.share) {
      logger.info('navigator.share not available, downloading instead');
      this.triggerDownload(blob, filename);
      notify.info(t('settings.share.fallback', { filename }), {
        title: t('modals.databaseExported'),
      });
      this.refreshSharePayload();
      return;
    }

    // Try sharing - this MUST happen immediately after click (no await before this!)
    try {
      await navigator.share({
        files: [file],
        title: t('settings.share.title'),
        text: t('settings.share.text', { filename }),
      });

      logger.info(`✅ Database shared: ${filename}`);
      notify.success(t('settings.share.success', { filename }), {
        title: t('modals.databaseShared'),
      });
    } catch (shareError) {
      const errorName = (shareError as Error).name;
      const errorMessage = (shareError as Error).message;

      // User cancelled sharing - not an error
      if (errorName === 'AbortError') {
        logger.info('Share cancelled by user');
        return;
      }

      // NotAllowedError: User gesture expired or file sharing not supported
      // TypeError: Files not supported on this browser
      logger.warn(`Share API failed (${errorName}): ${errorMessage}`);

      // Fallback to download
      this.triggerDownload(blob, filename);
      notify.info(t('settings.share.fallback', { filename }), {
        title: t('modals.databaseExported'),
      });
    }

    // Refresh payload for next share attempt (data may have changed)
    this.refreshSharePayload();
  }

  /**
   * Refresh the prepared share payload (call after sharing or when data changes)
   */
  private refreshSharePayload(): void {
    this.preparedSharePayload = null;
    // Rebuild in background
    setTimeout(() => this.prepareSharePayload(), 100);
  }

  /**
   * Handle database import
   */
  private async handleImportData(): Promise<void> {
    try {
      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';

      input.onchange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) {
          return;
        }

        logger.info(`📥 Importing database from: ${file.name}`);

        try {
          // Read file
          const text = await file.text();
          const data = JSON.parse(text);

          // Validate data structure
          if (!data.machines && !data.recordings && !data.diagnoses) {
            throw new Error('Invalid backup file format');
          }

          // Ask for merge or replace
          const merge = confirm(t('settings.import.confirmMerge', { filename: file.name }));

          // Confirm replace if not merging
          if (!merge) {
            const confirmReplace = confirm(t('settings.import.confirmReplace'));

            if (!confirmReplace) {
              return;
            }
          }

          // Import data
          const result = await importData(data, merge);

          // Show success (or warning if some records were skipped)
          const mode = merge ? t('settings.import.modeMerged') : t('settings.import.modeReplaced');

          if (result.totalSkipped > 0) {
            notify.warning(
              t('settings.import.partialWarning', {
                machinesImported: result.machinesImported,
                machinesSkipped: result.machinesSkipped,
                recordingsImported: result.recordingsImported,
                recordingsSkipped: result.recordingsSkipped,
                diagnosesImported: result.diagnosesImported,
                diagnosesSkipped: result.diagnosesSkipped,
                totalSkipped: result.totalSkipped,
                mode,
              }),
              { title: t('modals.databaseImported') }
            );
          } else {
            notify.success(
              t('settings.import.success', {
                machines: result.machinesImported,
                recordings: result.recordingsImported,
                diagnoses: result.diagnosesImported,
                mode,
              }),
              { title: t('modals.databaseImported') }
            );
          }

          // Refresh stats display
          this.showStats();

          setTimeout(() => {
            window.location.reload();
          }, 1500);

          logger.info('✅ Database import complete');
        } catch (error) {
          logger.error('Import error:', error);
          notify.error(t('settings.importError'), error as Error, {
            duration: 0,
          });
        }
      };

      input.click();
    } catch (error) {
      logger.error('Import setup error:', error);
      notify.error(t('settings.import.setupError'), error as Error);
    }
  }

  /**
   * Handle clear all data
   */
  private async handleClearData(): Promise<void> {
    const confirmed = confirm(t('settings.clear.confirmFirst'));

    if (!confirmed) {
      return;
    }

    // Double confirmation
    const doubleConfirm = confirm(t('settings.clear.confirmSecond'));

    if (!doubleConfirm) {
      return;
    }

    try {
      logger.info('🗑️ Clearing all data...');

      await clearAllData();

      notify.success(t('settings.clear.success'), { title: t('modals.databaseCleared') });

      // Refresh stats display
      this.showStats();

      setTimeout(() => {
        window.location.reload();
      }, 1500);

      logger.info('✅ All data cleared');
    } catch (error) {
      logger.error('Clear error:', error);
      notify.error(t('settings.clear.error'), error as Error, {
        duration: 0,
      });
    }
  }

  /**
   * Two-step "Reset to Defaults" button.
   * First tap → button enters confirming state (warning color, different text).
   * Second tap within 3 s → executes reset.
   * Timeout → reverts to initial state.
   */
  private initResetDefaultsButton(): void {
    const btn = document.getElementById('reset-defaults-btn');
    if (!btn) return;

    let confirmTimer: ReturnType<typeof setTimeout> | null = null;
    let isConfirming = false;

    const resetButtonState = (): void => {
      isConfirming = false;
      btn.classList.remove('confirming');
      const label = btn.querySelector('span');
      if (label) label.textContent = t('settingsUI.resetButton');
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
    };

    btn.addEventListener('click', () => {
      if (!isConfirming) {
        // First tap → enter confirming state
        isConfirming = true;
        btn.classList.add('confirming');
        const label = btn.querySelector('span');
        if (label) label.textContent = t('settingsUI.resetConfirm');
        confirmTimer = setTimeout(resetButtonState, 3000);
      } else {
        // Second tap → execute reset
        resetButtonState();
        applyDefaults();

        // Close settings modal
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';

        toast.success(t('settingsUI.resetSuccess'));
        logger.info('↺ User reset to defaults');
      }
    });
  }

  /**
   * Show database statistics
   */
  private async showStats(): Promise<void> {
    try {
      const stats = await getDBStats();

      // Update UI elements
      const machinesCount = document.getElementById('stats-machines');
      const recordingsCount = document.getElementById('stats-recordings');
      const diagnosesCount = document.getElementById('stats-diagnoses');

      if (machinesCount) {
        machinesCount.textContent = stats.machines.toString();
      }

      if (recordingsCount) {
        recordingsCount.textContent = stats.recordings.toString();
      }

      if (diagnosesCount) {
        diagnosesCount.textContent = stats.diagnoses.toString();
      }

      logger.debug('📊 Database stats:', stats);
    } catch (error) {
      logger.error('Stats error:', error);
    }
  }

  private async buildExportPayload(): Promise<{
    data: Awaited<ReturnType<typeof exportData>>;
    filename: string;
    blob: Blob;
    file: File;
  }> {
    // Get all data
    const data = await exportData();

    // Create JSON blob
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `zanobot-backup-${timestamp}.json`;
    const file = new File([blob], filename, { type: 'application/json' });

    return { data, filename, blob, file };
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Register an event handler with automatic cleanup tracking
   * CRITICAL FIX: Prevents memory leaks by storing references for removal in destroy()
   */
  private registerEventHandler(elementId: string, handler: () => void): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener('click', handler);
      this.eventHandlers.set(elementId, { element: element as HTMLElement, handler });
    }
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    // CRITICAL FIX: Remove all registered event handlers to prevent memory leaks
    for (const [elementId, { element, handler }] of this.eventHandlers) {
      element.removeEventListener('click', handler);
      logger.debug(`🧹 Removed event handler from ${elementId}`);
    }
    this.eventHandlers.clear();

    // Clear prepared share payload to release memory
    this.preparedSharePayload = null;
  }
}
