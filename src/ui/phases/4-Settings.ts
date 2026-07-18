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

import {
  exportData,
  importData,
  getDBStats,
  clearAllData,
  exportSettings,
  importSettings,
  backupHasSettings,
  type ExportedSettings,
} from '@data/db.js';
import { openExportOptionsModal, openImportOptionsModal } from './ImportExportModal.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { getVisualizerSettings, setVisualizerSettings } from '@utils/visualizerSettings.js';
import { getRecordingSettings, setRecordingSettings } from '@utils/recordingSettings.js';
import { getEvaluationEngine, setEvaluationEngine } from '@utils/evaluationSettings.js';
import type { EngineId } from '@data/types.js';
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
import { getBannerManager } from '../BannerManager.js';
import { openBannerCropModal } from '@ui/components/BannerCropModal.js';
import {
  getBannerText,
  setBannerText,
  hasCustomBannerText,
  getBannerTextPosition,
  setBannerTextPosition,
  hasCustomBannerTextPosition,
  isBannerTextHidden,
  setBannerTextHidden,
} from '@utils/bannerTextSettings.js';
import { getCherryPickSettings, setCherryPickSettings } from '@core/dsp/cherryPicking.js';
import {
  getNoiseSubtractionSettings,
  setNoiseSubtractionSettings,
  getNoiseProfiles,
  saveNoiseProfile,
  deleteNoiseProfile,
  buildNoiseProfileFromFeatures,
  isProfileStationary,
  MAX_NOISE_PROFILES,
} from '@core/dsp/noiseProfile.js';
import { getDriftSettings, setDriftSettings, getHzPerBin } from '@core/dsp/driftDetector.js';
import { DEFAULT_DSP_CONFIG, extractFeatures } from '@core/dsp/features.js';
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
    this.initEvaluationEngineSettings();
    this.initMessLaborEntry();

    // Initialize banner settings (advanced/expert only)
    this.initBannerSettings();

    // Initialize standalone room measurement (all view levels)
    this.initRoomMeasurement();

    // Initialize room compensation settings (expert only)
    this.initRoomCompSettings();

    // Initialize noise profile subtraction settings (expert only)
    this.initNoiseProfileSettings();

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
    const freqToggle = document.getElementById('frequency-scale-toggle') as HTMLInputElement | null;
    const ampToggle = document.getElementById('amplitude-scale-toggle') as HTMLInputElement | null;

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
    const faultySlider = document.getElementById('faulty-threshold') as HTMLInputElement | null;
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
          logger.info(
            `Audio-Trigger ${disableAudioTriggerToggle.checked ? 'deaktiviert' : 'aktiviert'}`
          );
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

  /**
   * Bind the evaluation-engine selector. Default GMIA. Only affects which
   * engine trains NEW references; existing models keep their own engine.
   */
  private initEvaluationEngineSettings(): void {
    const select = document.getElementById(
      'evaluation-engine-select'
    ) as HTMLSelectElement | null;
    if (!select) {
      return;
    }

    // The description box above the selector explains the *currently selected*
    // engine. We drive it by swapping the element's data-i18n key (not just its
    // text) so the right description survives a later language switch, which
    // re-runs translateDOM() over the data-i18n attributes.
    const desc = document.getElementById('engine-method-desc');
    const DESC_KEY: Record<EngineId, string> = {
      gmia: 'settingsUI.gmaiMethodDesc',
      'spectral-cosine': 'settingsUI.engineDescSpectral',
      yamnet: 'settingsUI.engineDescYamnet',
      temporal: 'settingsUI.engineDescTemporal',
    };
    const updateEngineDescription = (engineId: EngineId): void => {
      if (!desc) {
        return;
      }
      const key = DESC_KEY[engineId] ?? DESC_KEY.gmia;
      desc.setAttribute('data-i18n', key);
      desc.textContent = t(key);
    };

    select.value = getEvaluationEngine();
    updateEngineDescription(select.value as EngineId);
    select.addEventListener('change', () => {
      try {
        const engine = setEvaluationEngine(select.value as EngineId);
        select.value = engine; // reflect validated value
        updateEngineDescription(engine);
        logger.info(`🔀 Evaluation engine set to "${engine}"`);
      } catch (error) {
        logger.error('Failed to save evaluation engine setting:', error);
        notify.error(
          t('settingsUI.evaluationEngineSaveError'),
          error as Error,
          { title: t('settingsUI.evaluationEngineSaveErrorTitle'), duration: 5000 }
        );
      }
    });
  }

  /**
   * Wire the Mess-Labor (engine benchmark) entry button. The whole lab is a
   * lazily-imported, code-split module reached only here, and the entry is shown
   * only on a desktop browser that can pick a directory (the lab decodes whole
   * folders through every engine — too heavy for a phone). Purely additive: it
   * never touches GMIA, the live loop or the database.
   */
  private initMessLaborEntry(): void {
    const entry = document.getElementById('mess-labor-entry');
    const btn = document.getElementById('mess-labor-open-btn');
    if (!entry || !btn) return;

    void import('@lab/index.js')
      .then(({ isMessLaborSupported, launchMessLabor }) => {
        if (!isMessLaborSupported()) return; // stays hidden on mobile / narrow
        entry.style.display = '';
        const handler = () => launchMessLabor();
        btn.addEventListener('click', handler);
        this.eventHandlers.set('mess-labor-open-btn', { element: btn as HTMLElement, handler });
      })
      .catch((error) => {
        logger.warn('Mess-Labor entry unavailable:', error);
      });
  }

  private async initBannerSettings(): Promise<void> {
    const previewImage = document.getElementById('banner-preview-image') as HTMLImageElement | null;
    const uploadBtn = document.getElementById('banner-upload-btn');
    const resetBtn = document.getElementById('banner-reset-btn') as HTMLButtonElement | null;
    const uploadInput = document.getElementById('banner-upload-input') as HTMLInputElement | null;

    if (!previewImage || !uploadBtn || !resetBtn || !uploadInput) {
      return;
    }

    // BannerManager is already loaded eagerly via main.ts, so use it directly
    // (a dynamic import here cannot split it into its own chunk and only adds overhead).
    const bannerManager = getBannerManager();

    if (!bannerManager) {
      logger.warn('⚠️ BannerManager not available for settings');
      return;
    }

    const themeOf = () => document.documentElement.getAttribute('data-theme') || 'brand';

    // Enable "reset" whenever there is anything to reset for this theme — a
    // custom image, custom text, a moved text position, or the hide-text flag —
    // not just an image. (Otherwise changing only the text or only the position
    // left the button disabled, so it could never be reverted.)
    const refreshResetEnabled = async () => {
      const theme = themeOf();
      const hasImage = await bannerManager.hasCustomBannerForCurrentTheme();
      resetBtn.disabled = !(
        hasImage ||
        hasCustomBannerText(theme) ||
        hasCustomBannerTextPosition(theme) ||
        isBannerTextHidden(theme)
      );
    };

    // Update preview and reset button state. Reads the actually stored banner
    // (robust to crossfade timing) so the preview shows the new crop right away.
    const updateBannerPreview = async () => {
      const url = await bannerManager.getCurrentBannerPreviewUrl();
      const previous = previewImage.dataset.bloburl;
      previewImage.src = url;
      if (url.startsWith('blob:')) previewImage.dataset.bloburl = url;
      else delete previewImage.dataset.bloburl;
      if (previous && previous !== url) URL.revokeObjectURL(previous);

      await refreshResetEnabled();
    };

    // Initial update
    void updateBannerPreview();

    // Text/hide changes elsewhere (initBannerTextSettings) re-evaluate the reset
    // button without rebuilding the preview image.
    window.addEventListener('bannercustomizationchange', () => {
      void refreshResetEnabled();
    });

    // Upload button click
    uploadBtn.addEventListener('click', () => {
      uploadInput.click();
    });

    // Handle file selection → open the crop modal so any image can be framed to
    // the banner size, then save the cropped result.
    uploadInput.addEventListener('change', async (event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (file) {
        const cropped = await openBannerCropModal(file);
        if (cropped) {
          const success = await bannerManager.saveBannerBlob(cropped);
          if (success) {
            await updateBannerPreview();
          }
        }
      }
      // Clear input so the same file can be selected again
      if (input) input.value = '';
    });

    // Reset button click — reverts image AND custom text/position (resetBanner
    // clears both). Refresh the preview image, then tell the text UI to reload
    // its inputs/sliders/preview-text from the now-cleared store.
    resetBtn.addEventListener('click', async () => {
      await bannerManager.resetBanner();
      await updateBannerPreview();
      window.dispatchEvent(new Event('bannertextreset'));
    });

    // Update preview when theme changes
    window.addEventListener('themechange', () => {
      void updateBannerPreview();
    });

    this.initBannerTextSettings(bannerManager);
  }

  /**
   * Wire the editable banner overlay text (headline + subline). Empty field =
   * fall back to the translated default.
   */
  private initBannerTextSettings(bannerManager: ReturnType<typeof getBannerManager>): void {
    const headlineInput = document.getElementById(
      'banner-headline-input'
    ) as HTMLInputElement | null;
    const sublineInput = document.getElementById('banner-subline-input') as HTMLInputElement | null;
    const posXInput = document.getElementById('banner-textx-input') as HTMLInputElement | null;
    const posYInput = document.getElementById('banner-texty-input') as HTMLInputElement | null;
    const hideInput = document.getElementById('banner-hidetext-input') as HTMLInputElement | null;
    if (!headlineInput || !sublineInput) {
      return;
    }

    // Preview elements (optional).
    const previewContainer = document.getElementById('banner-preview-container');
    const previewBlock = document.getElementById('banner-preview-textblock');
    const previewHeadline = document.getElementById('banner-preview-headline');
    const previewSubline = document.getElementById('banner-preview-subline');

    const POS_X = { min: 0, max: 65 };
    const POS_Y = { min: 12, max: 88 };
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'brand';

    const renderPreviewText = () => {
      const txt = getBannerText(currentTheme());
      if (previewHeadline) previewHeadline.textContent = txt.headline || t('banner.headline');
      if (previewSubline) previewSubline.textContent = txt.subline || t('banner.subline');
    };
    const applyPreviewPosition = (x: number, y: number) => {
      previewContainer?.style.setProperty('--banner-text-x', `${x}%`);
      previewContainer?.style.setProperty('--banner-text-y', `${y}%`);
    };
    // Reflect the "hide text" toggle in the preview and disable the text/position
    // controls (they have no effect while the text is hidden).
    const applyHiddenState = (hidden: boolean) => {
      if (previewBlock) previewBlock.style.display = hidden ? 'none' : '';
      headlineInput.disabled = hidden;
      sublineInput.disabled = hidden;
      if (posXInput) posXInput.disabled = hidden;
      if (posYInput) posYInput.disabled = hidden;
    };

    const loadForTheme = () => {
      const current = getBannerText(currentTheme());
      headlineInput.value = current.headline;
      sublineInput.value = current.subline;
      const pos = getBannerTextPosition(currentTheme());
      if (posXInput) posXInput.value = String(pos.x);
      if (posYInput) posYInput.value = String(pos.y);
      const hidden = isBannerTextHidden(currentTheme());
      if (hideInput) hideInput.checked = hidden;
      renderPreviewText();
      applyPreviewPosition(pos.x, pos.y);
      applyHiddenState(hidden);
    };
    loadForTheme();

    const commitText = () => {
      setBannerText(currentTheme(), {
        headline: headlineInput.value,
        subline: sublineInput.value,
      });
      renderPreviewText();
      bannerManager?.applyBannerText();
      window.dispatchEvent(new Event('bannercustomizationchange'));
    };
    // Single source of truth for a position update (from sliders OR drag):
    // persist, sync sliders, update the preview, and apply to the live hero.
    const setPosition = (x: number, y: number) => {
      setBannerTextPosition(currentTheme(), { x, y });
      if (posXInput) posXInput.value = String(Math.round(x));
      if (posYInput) posYInput.value = String(Math.round(y));
      applyPreviewPosition(x, y);
      bannerManager?.applyBannerText();
      // Let the reset button re-evaluate: a moved position is now resettable.
      window.dispatchEvent(new Event('bannercustomizationchange'));
    };

    headlineInput.addEventListener('input', commitText);
    sublineInput.addEventListener('input', commitText);
    posXInput?.addEventListener('input', () =>
      setPosition(clamp(parseFloat(posXInput.value), POS_X.min, POS_X.max),
        posYInput ? parseFloat(posYInput.value) : getBannerTextPosition(currentTheme()).y)
    );
    posYInput?.addEventListener('input', () =>
      setPosition(posXInput ? parseFloat(posXInput.value) : getBannerTextPosition(currentTheme()).x,
        clamp(parseFloat(posYInput.value), POS_Y.min, POS_Y.max))
    );

    // "Hide text" checkbox — show an image-only banner for this theme.
    hideInput?.addEventListener('change', () => {
      const hidden = hideInput.checked;
      setBannerTextHidden(currentTheme(), hidden);
      applyHiddenState(hidden);
      bannerManager?.applyBannerText();
      window.dispatchEvent(new Event('bannercustomizationchange'));
    });

    // Banner text + position are per-theme: reload on theme change.
    window.addEventListener('themechange', loadForTheme);
    // After a banner reset the store is cleared — reload so the fields/sliders
    // and preview text snap back to the defaults.
    window.addEventListener('bannertextreset', loadForTheme);
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
          await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MS));
        }
      }

      // Progress: 100%
      if (progressBar) progressBar.style.width = '100%';

      // ── Cleanup audio ────────────────────────────────────
      stream.getTracks().forEach((track) => track.stop());
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
      const stddev =
        t60Values.length > 1
          ? Math.sqrt(
              t60Values.reduce((sum, v) => sum + (v - meanT60) ** 2, 0) / (t60Values.length - 1)
            )
          : 0;

      const isStable = stddev < 0.15;

      logger.info(
        `Room measurement result: T60 = ${meanT60.toFixed(3)}s ± ${stddev.toFixed(3)}s (${t60Values.length}/${NUM_CHIRPS} chirps)`
      );

      // ── Show result ──────────────────────────────────────
      this.showRoomMeasurementResult(meanT60, stddev, t60Values, isStable);
    } catch (error) {
      logger.error('Room measurement error:', error);

      // Cleanup on error
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        try {
          await audioContext.close();
        } catch {
          /* ignore */
        }
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
        btnText.textContent =
          resultVisible?.style.display !== 'none'
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
      const pct = Math.min(Math.max((meanT60 / 2.5) * 100, 0), 100);
      marker.style.left = `calc(${pct}% - 2px)`;
    }

    // Individual measurements (Expert)
    const individualEl = document.getElementById('room-measure-individual');
    if (individualEl) {
      individualEl.textContent = `${t('roomMeasure.individual')}: ${individual.map((v) => v.toFixed(2) + 's').join(', ')}`;
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
      very_dry: t('roomMeasure.classVeryDry'),
      dry: t('roomMeasure.classDry'),
      medium: t('roomMeasure.classMedium'),
      reverberant: t('roomMeasure.classReverberant'),
      very_reverberant: t('roomMeasure.classVeryReverberant'),
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

  // ════════════════════════════════════════════════════════════
  // NOISE PROFILE SUBTRACTION (Lärmprofil-Subtraktion)
  // ════════════════════════════════════════════════════════════

  /** Duration of the guided ambient-noise recording (seconds) */
  private static readonly NOISE_CAPTURE_SECONDS = 30;

  /**
   * Initialize noise profile subtraction settings (Expert only).
   * Master toggle, profile selection, guided capture, delete, beta slider.
   */
  private initNoiseProfileSettings(): void {
    const masterToggle = document.getElementById('noise-sub-toggle') as HTMLInputElement | null;
    const detailsContainer = document.getElementById('noise-sub-details');

    if (!masterToggle) {
      return;
    }

    const settings = getNoiseSubtractionSettings();

    masterToggle.checked = settings.enabled;
    if (detailsContainer) {
      detailsContainer.style.display = settings.enabled ? '' : 'none';
    }

    masterToggle.addEventListener('change', () => {
      const enabled = masterToggle.checked;
      setNoiseSubtractionSettings({ enabled });
      if (detailsContainer) {
        detailsContainer.style.display = enabled ? '' : 'none';
      }
      logger.info(`🎚️ Noise profile subtraction ${enabled ? 'enabled' : 'disabled'}`);
    });

    // Record hint (static text with duration placeholder)
    const recordHint = document.getElementById('noise-sub-record-hint');
    if (recordHint) {
      recordHint.textContent = t('noiseSub.recordHint', {
        seconds: String(SettingsPhase.NOISE_CAPTURE_SECONDS),
      });
    }

    // Profile dropdown
    const profileSelect = document.getElementById(
      'noise-sub-profile-select'
    ) as HTMLSelectElement | null;
    if (profileSelect) {
      this.refreshNoiseProfileDropdown();
      profileSelect.addEventListener('change', () => {
        const id = profileSelect.value || null;
        setNoiseSubtractionSettings({ activeProfileId: id });
        this.updateNoiseProfileMeta();
      });
    }

    // Record button
    const recordBtn = document.getElementById('noise-sub-record-btn') as HTMLButtonElement | null;
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        void this.performNoiseProfileCapture();
      });
    }

    // Delete button
    const deleteBtn = document.getElementById('noise-sub-delete-btn') as HTMLButtonElement | null;
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const current = getNoiseSubtractionSettings();
        if (!current.activeProfileId) return;
        if (!confirm(t('noiseSub.deleteConfirm'))) return;
        deleteNoiseProfile(current.activeProfileId);
        this.refreshNoiseProfileDropdown();
        this.updateNoiseProfileMeta();
      });
    }

    // Beta slider
    const betaSlider = document.getElementById(
      'noise-sub-beta-slider'
    ) as HTMLInputElement | null;
    const betaValue = document.getElementById('noise-sub-beta-value');
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
        setNoiseSubtractionSettings({ beta: val });
      });
    }

    // Minimum-Statistics fallback toggle (no profile needed)
    const minStatsToggle = document.getElementById(
      'noise-sub-minstats-toggle'
    ) as HTMLInputElement | null;
    if (minStatsToggle) {
      minStatsToggle.checked = settings.minStatsEnabled;
      minStatsToggle.addEventListener('change', () => {
        setNoiseSubtractionSettings({ minStatsEnabled: minStatsToggle.checked });
        logger.info(
          `🎚️ Min-stats noise fallback ${minStatsToggle.checked ? 'enabled' : 'disabled'}`
        );
      });
    }

    this.updateNoiseProfileMeta();
  }

  /** Rebuild the profile dropdown from stored profiles. */
  private refreshNoiseProfileDropdown(): void {
    const profileSelect = document.getElementById(
      'noise-sub-profile-select'
    ) as HTMLSelectElement | null;
    if (!profileSelect) return;

    const settings = getNoiseSubtractionSettings();
    const profiles = getNoiseProfiles();

    profileSelect.innerHTML = '';

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = t('noiseSub.noProfile');
    profileSelect.appendChild(noneOption);

    for (const profile of profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      if (profile.id === settings.activeProfileId) {
        option.selected = true;
      }
      profileSelect.appendChild(option);
    }
  }

  /** Show metadata (date, duration, frames) of the active profile. */
  private updateNoiseProfileMeta(): void {
    const metaEl = document.getElementById('noise-sub-profile-meta');
    if (!metaEl) return;

    const settings = getNoiseSubtractionSettings();
    const profile = getNoiseProfiles().find((p) => p.id === settings.activeProfileId);
    if (!profile) {
      metaEl.textContent = '';
      return;
    }

    metaEl.textContent = t('noiseSub.profileMeta', {
      date: new Date(profile.createdAt).toLocaleString(),
      duration: profile.durationSec.toFixed(0),
      frames: String(profile.frameCount),
    });
  }

  /**
   * Guided ambient-noise capture: records NOISE_CAPTURE_SECONDS of raw audio
   * (machine off!), extracts features, builds and stores the noise profile.
   *
   * Uses ScriptProcessorNode for capture – same proven pattern as
   * playChirpAndRecord() in roomCompensation.ts.
   */
  private async performNoiseProfileCapture(): Promise<void> {
    const recordBtn = document.getElementById('noise-sub-record-btn') as HTMLButtonElement | null;
    if (!recordBtn) return;

    const recordText = document.getElementById('noise-sub-record-text');
    const progressSection = document.getElementById('noise-sub-progress');
    const progressBar = document.getElementById('noise-sub-progress-bar') as HTMLElement | null;
    const progressText = document.getElementById('noise-sub-progress-text');
    const statusSection = document.getElementById('noise-sub-status');
    const statusText = document.getElementById('noise-sub-status-text');

    const showStatus = (msg: string): void => {
      if (statusSection) statusSection.style.display = '';
      if (statusText) statusText.textContent = msg;
    };

    // Profile limit check BEFORE recording (don't waste the user's 30 seconds)
    if (getNoiseProfiles().length >= MAX_NOISE_PROFILES) {
      showStatus(t('noiseSub.limitReached', { max: String(MAX_NOISE_PROFILES) }));
      return;
    }

    recordBtn.disabled = true;
    if (statusSection) statusSection.style.display = 'none';
    if (progressSection) progressSection.style.display = '';
    if (progressBar) progressBar.style.width = '0%';

    const captureSeconds = SettingsPhase.NOISE_CAPTURE_SECONDS;

    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;

    try {
      audioContext = new AudioContext({ sampleRate: DEFAULT_DSP_CONFIG.sampleRate });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      stream = await getRawAudioStream();

      const sampleRate = audioContext.sampleRate;
      const expectedSamples = Math.ceil(sampleRate * captureSeconds);

      // Capture raw samples via ScriptProcessorNode (universally supported)
      const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
      const micSource = audioContext.createMediaStreamSource(stream);
      const chunks: Float32Array[] = [];
      let totalSamples = 0;

      scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        totalSamples += input.length;
      };

      micSource.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      // Progress feedback once per second
      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Math.min((Date.now() - startTime) / 1000, captureSeconds);
        if (progressBar) {
          progressBar.style.width = `${(elapsed / captureSeconds) * 100}%`;
        }
        if (progressText) {
          progressText.textContent = t('noiseSub.recording', {
            seconds: String(Math.floor(elapsed)),
          });
        }
      }, 1000);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, captureSeconds * 1000 + 100);
      });

      // Stop capture
      clearInterval(progressTimer);
      progressTimer = null;
      scriptNode.onaudioprocess = null;
      try {
        micSource.disconnect(scriptNode);
      } catch {
        /* already disconnected */
      }
      try {
        scriptNode.disconnect(audioContext.destination);
      } catch {
        /* already disconnected */
      }

      if (progressText) progressText.textContent = t('noiseSub.processing');
      if (progressBar) progressBar.style.width = '100%';

      // Concatenate chunks into an AudioBuffer for feature extraction
      const length = Math.min(totalSamples, expectedSamples);
      if (length < sampleRate) {
        throw new Error('Recording too short');
      }
      const buffer = audioContext.createBuffer(1, length, sampleRate);
      const channelData = buffer.getChannelData(0);
      let offset = 0;
      for (const chunk of chunks) {
        if (offset >= length) break;
        channelData.set(chunk.subarray(0, Math.min(chunk.length, length - offset)), offset);
        offset += chunk.length;
      }

      // Mikrofon-Bezeichnung sichern (Warnung bei Gerätewechsel in der Diagnose)
      const deviceLabel = stream.getAudioTracks()[0]?.label || undefined;

      // Cleanup audio before the (CPU-bound) feature extraction
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
      audioContext = null;
      stream = null;

      // Extract features and build the profile
      const features = extractFeatures(buffer);
      const profileName = t('noiseSub.defaultName', {
        date: new Date().toLocaleString(),
      });
      const profile = buildNoiseProfileFromFeatures(
        features,
        sampleRate,
        captureSeconds,
        profileName,
        deviceLabel
      );

      saveNoiseProfile(profile);
      setNoiseSubtractionSettings({ activeProfileId: profile.id });
      this.refreshNoiseProfileDropdown();
      this.updateNoiseProfileMeta();

      showStatus(isProfileStationary(profile) ? t('noiseSub.saved') : t('noiseSub.savedUnstable'));
      logger.info(
        `🎚️ Noise profile captured: "${profile.name}" ` +
          `(${profile.frameCount} frames, stationarity=${profile.stationarity.toFixed(2)})`
      );
    } catch (error) {
      logger.error('Noise profile capture error:', error);

      if (progressTimer) clearInterval(progressTimer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        try {
          await audioContext.close();
        } catch {
          /* ignore */
        }
      }

      let errorMsg = t('noiseSub.errorGeneric');
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          errorMsg = t('noiseSub.errorMicPermission');
        } else if (error.name === 'NotFoundError') {
          errorMsg = t('noiseSub.errorNoMic');
        }
      }
      showStatus(errorMsg);
    } finally {
      recordBtn.disabled = false;
      if (recordText) recordText.textContent = t('noiseSub.recordBtn');
      if (progressSection) progressSection.style.display = 'none';
    }
  }

  /**
   * Initialize cherry-picking settings (Expert only)
   * Reads settings from localStorage and binds UI toggle + slider.
   */
  private initCherryPickSettings(): void {
    const cherryPickToggle = document.getElementById(
      'cherry-pick-toggle'
    ) as HTMLInputElement | null;
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
    const lowFreqSlider = document.getElementById(
      'drift-lowfreq-slider'
    ) as HTMLInputElement | null;
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
    // Ask whether to bundle the current settings (banner, view level, thresholds …).
    const choice = await openExportOptionsModal();
    if (!choice.proceed) {
      return;
    }

    try {
      logger.info(`📦 Exporting database${choice.includeSettings ? ' (with settings)' : ''}...`);

      const { data, filename, blob } = await this.buildExportPayload(choice.includeSettings);

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
      // Create file input.
      // NOTE: Intentionally NO `accept` filter. On Android the document picker
      // greys out files whose provider-reported MIME type isn't an exact match
      // for the filter, so a `zanobot-backup-*.json` sitting in Downloads often
      // appears only under "Recent" and can't be picked from its folder. Without
      // a filter the user can browse to any folder and select the file; the
      // content is validated (JSON.parse + structure check) after selection.
      const input = document.createElement('input');
      input.type = 'file';

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

          // Ask whether to also apply the settings stored in the file. Machines
          // are ALWAYS merged (added to the existing database), never replaced —
          // the user can clear the database beforehand if they want a clean slate.
          const fileHasSettings = backupHasSettings(data);
          const choice = await openImportOptionsModal(fileHasSettings);
          if (!choice.proceed) {
            return;
          }

          // Import data (always merge: only add machines, keep existing ones)
          const result = await importData(data, true);

          // Optionally apply the bundled settings (banner, view level, thresholds …)
          if (choice.includeSettings && fileHasSettings) {
            await importSettings(data.settings as ExportedSettings);
            logger.info('⚙️ Imported settings applied');
          }

          // Show success (or warning if some records were skipped)
          const mode = t('settings.import.modeMerged');

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
      if (confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
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

  private async buildExportPayload(includeSettings: boolean = false): Promise<{
    data: Awaited<ReturnType<typeof exportData>> & { settings?: ExportedSettings };
    filename: string;
    blob: Blob;
    file: File;
  }> {
    // Get all data
    const data: Awaited<ReturnType<typeof exportData>> & { settings?: ExportedSettings } =
      await exportData();

    // Optionally bundle the current UI settings (banner, view level, thresholds …)
    if (includeSettings) {
      data.settings = await exportSettings();
    }

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
