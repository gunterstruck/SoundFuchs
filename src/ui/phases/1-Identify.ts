/**
 * ZANOBOT - PHASE 1: IDENTIFY
 *
 * Entry point of the app flow.
 * User identifies a machine via:
 * - QR/Barcode scan (with integrated camera scanner)
 * - Manual entry
 */

import { saveMachine, getMachine, getAllMachines, getLatestDiagnosis, getAllDiagnoses, deleteMachine, getRecordingsForMachine, getDiagnosesForMachine, deleteReferenceModel } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import type { Machine, DiagnosisResult } from '@data/types.js';
import { Html5Qrcode } from 'html5-qrcode';
import { logger } from '@utils/logger.js';
import { onboardingTrace, OnboardingTraceService } from '@utils/onboardingTrace.js';
import { escapeHtml } from '@utils/sanitize.js';
import { setViewLevelTemporary, restoreViewLevel, restoreTheme, getViewLevel } from '@utils/viewLevelSettings.js';
import { t, getLocale } from '../../i18n/index.js';
import { InfoBottomSheet } from '../components/InfoBottomSheet.js';
import {
  HardwareCheck,
  type AudioQualityReport,
  type AudioDeviceInfo,
} from '@core/audio/HardwareCheck.js';
import { getMicrophones, getRawAudioStream, AUDIO_CONSTRAINTS } from '@core/audio/audioHelper.js';
import { HashRouter, GITHUB_PAGES_BASE_URL } from '../HashRouter.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import { nfcImportService } from '@data/NfcImportService.js';
import QRCode from 'qrcode';
import { ReferenceLoadingOverlay } from '../components/ReferenceLoadingOverlay.js';
import { traceOverlay } from '../components/OnboardingTraceOverlay.js';

type NDEFRecordInit = {
  recordType: 'url';
  data: string;
};

type NDEFMessageInit = {
  records: NDEFRecordInit[];
};

type NDEFReaderConstructor = new () => {
  write: (message: NDEFMessageInit) => Promise<void>;
};

export class IdentifyPhase {
  private onMachineSelected: (machine: Machine) => void;
  private html5QrCode: Html5Qrcode | null = null;
  private scannerModal: HTMLElement | null = null;
  private isScanning: boolean = false;
  private currentMachine: Machine | null = null;

  // Hardware Intelligence
  private currentAudioStream: MediaStream | null = null;
  private selectedDeviceId: string | undefined = undefined;
  private audioQualityReport: AudioQualityReport | null = null;

  // NFC Writer UI
  private nfcModal: HTMLElement | null = null;
  private nfcStatus: HTMLElement | null = null;
  private nfcWriteBtn: HTMLButtonElement | null = null;
  private nfcGenericOption: HTMLInputElement | null = null;
  private nfcSpecificOption: HTMLInputElement | null = null;
  private nfcSpecificDetail: HTMLElement | null = null;
  private nfcSupportDetails: HTMLElement | null = null;
  private deepLinkOverlay: HTMLElement | null = null;
  private nfcDiagnosisModal: HTMLElement | null = null;
  private nfcDiagnosisConfirmBtn: HTMLButtonElement | null = null;
  private nfcDiagnosisCancelBtn: HTMLButtonElement | null = null;
  // NFC customerId field for Variante B
  private nfcCustomerIdInput: HTMLInputElement | null = null;
  private nfcDbUrlPreview: HTMLElement | null = null;
  // NFC Fleet option
  private nfcFleetOption: HTMLInputElement | null = null;
  private nfcFleetSection: HTMLElement | null = null;
  private nfcFleetSelect: HTMLSelectElement | null = null;
  private nfcFleetDetail: HTMLElement | null = null;
  private nfcFleetUrlPreview: HTMLElement | null = null;
  // NFC Quick Compare count-only option
  private nfcQuickCompareCountOption: HTMLInputElement | null = null;
  private nfcQuickCompareCountDetail: HTMLElement | null = null;
  private nfcQcCountSection: HTMLElement | null = null;
  private nfcQcCountInput: HTMLInputElement | null = null;
  private nfcQcCountUrlPreview: HTMLElement | null = null;
  private nfcQcCountSelectedValue: number = 0;

  // NFC Onboarding context tracking
  // Used to restore view level after NFC flow ends
  private isNfcOnboardingActive: boolean = false;

  /** Sprint 4 UX: Current workflow mode */
  private currentWorkflowMode: 'series' | 'fleet' = 'series';

  /** Sprint 5 UX: Current Gold Standard machine ID for badge display */
  private currentGoldStandardId: string | null = null;

  /** Sprint 5 UX: Callback for starting fleet diagnosis queue (set by Router) */
  public onStartFleetQueue: ((machineIds: string[], groupName: string) => void) | null = null;

  /** Sprint 6: Callback for when fleet provisioning is complete (set by Router) */
  public onFleetProvisioned: ((fleetName: string, autoStartCheck: boolean) => void) | null = null;

  /** Sprint 8: Callback for quick compare count-only deep link (set by Router) */
  public onQuickCompareProvisioned: ((count: number) => void) | null = null;

  // QR Code Generator UI
  private qrModal: HTMLElement | null = null;
  private qrCanvas: HTMLCanvasElement | null = null;
  private qrPreviewContainer: HTMLElement | null = null;
  private qrUrlPreview: HTMLElement | null = null;
  private qrLabelInfo: HTMLElement | null = null;
  private qrGenericOption: HTMLInputElement | null = null;
  private qrSpecificOption: HTMLInputElement | null = null;
  private qrSpecificDetail: HTMLElement | null = null;
  private qrCustomerIdInput: HTMLInputElement | null = null;
  private qrCustomerIdSection: HTMLElement | null = null;
  private qrDbUrlPreview: HTMLElement | null = null;
  private qrDownloadBtn: HTMLButtonElement | null = null;
  private qrPrintBtn: HTMLButtonElement | null = null;
  private qrCurrentUrl: string = '';
  // QR Fleet option
  private qrFleetOption: HTMLInputElement | null = null;
  private qrFleetSection: HTMLElement | null = null;
  private qrFleetSelect: HTMLSelectElement | null = null;
  // QR Quick Compare count-only option
  private qrQuickCompareCountOption: HTMLInputElement | null = null;
  private qrQuickCompareCountDetail: HTMLElement | null = null;
  private qrQcCountSection: HTMLElement | null = null;
  private qrQcCountInput: HTMLInputElement | null = null;
  private qrQcCountUrlPreview: HTMLElement | null = null;
  private qrQcCountSelectedValue: number = 0;

  constructor(onMachineSelected: (machine: Machine) => void) {
    this.onMachineSelected = onMachineSelected;
  }

  /**
   * Initialize the identify phase UI
   */
  public init(): void {
    // Scan button
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.handleScan());
    }

    // Create machine button
    const createBtn = document.getElementById('create-machine-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.handleCreateMachine());
    }

    // Sprint 1 UX: Clear inline validation error on typing
    const machineNameInput = document.getElementById('machine-name-input') as HTMLInputElement;
    if (machineNameInput) {
      machineNameInput.addEventListener('input', () => {
        machineNameInput.classList.remove('input-invalid');
        machineNameInput.removeAttribute('aria-invalid');
        const nameError = document.getElementById('machine-name-error');
        if (nameError) nameError.style.display = 'none';
      });
    }

    // Scanner modal elements
    this.scannerModal = document.getElementById('scanner-modal');
    const closeScannerBtn = document.getElementById('close-scanner-modal');
    const manualInputBtn = document.getElementById('manual-input-btn');
    const manualInputConfirmBtn = document.getElementById('manual-input-confirm');
    const manualInputCancelBtn = document.getElementById('manual-input-cancel');
    const manualInputCloseBtn = document.getElementById('close-manual-input-modal');
    const manualInputModal = document.getElementById('manual-input-modal');

    if (closeScannerBtn) {
      closeScannerBtn.addEventListener('click', () => this.closeScanner());
    }

    const closeScannerFooterBtn = document.getElementById('close-scanner-btn');
    if (closeScannerFooterBtn) {
      closeScannerFooterBtn.addEventListener('click', () => this.closeScanner());
    }

    if (manualInputBtn) {
      manualInputBtn.addEventListener('click', () => this.handleManualInput());
    }

    if (manualInputConfirmBtn) {
      manualInputConfirmBtn.addEventListener('click', () => this.submitManualInput());
    }

    if (manualInputCancelBtn) {
      manualInputCancelBtn.addEventListener('click', () => this.closeManualInputModal());
    }

    if (manualInputCloseBtn) {
      manualInputCloseBtn.addEventListener('click', () => this.closeManualInputModal());
    }

    if (manualInputModal) {
      manualInputModal.addEventListener('click', (e) => {
        if (e.target === manualInputModal) {
          this.closeManualInputModal();
        }
      });
    }

    // Close modal when clicking outside
    if (this.scannerModal) {
      this.scannerModal.addEventListener('click', (e) => {
        if (e.target === this.scannerModal) {
          this.closeScanner();
        }
      });
    }

    // Hardware Intelligence: Change Microphone Button
    const changeMicBtn = document.getElementById('change-microphone-btn');
    if (changeMicBtn) {
      changeMicBtn.addEventListener('click', () => this.showMicrophoneSelection());
    }

    // Initialize hardware check
    this.initializeHardwareCheck();

    // Initialize machine detail modal
    this.initMachineDetailModal();

    // Load and render machine history for quick select
    this.loadMachineHistory();

    // Load and render machine overview (all machines with status)
    this.loadMachineOverview();

    // Load and render diagnosis history
    this.loadDiagnosisHistory();

    // "Neue Maschine" / "Neue Flotte" button handler (Sprint 5: mode-dependent)
    const addNewMachineBtn = document.getElementById('add-new-machine-btn');
    if (addNewMachineBtn) {
      addNewMachineBtn.addEventListener('click', () => {
        if (this.currentWorkflowMode === 'fleet') {
          this.showFleetCreationModal();
        } else {
          this.handleAddNewMachine();
        }
      });
    }

    // Sprint 2 UX: Empty state CTA scrolls to machine name input
    document.getElementById('empty-state-cta')?.addEventListener('click', () => {
      this.handleAddNewMachine();
    });

    // Sprint 2 UX: Help icon handlers for contextual BottomSheet help
    document.getElementById('help-reference')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.reference.title'),
        content: t('help.reference.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-diagnose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.diagnose.title'),
        content: t('help.diagnose.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-machines')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.machines.title'),
        content: t('help.machines.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-viewlevel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.viewLevel.title'),
        content: t('help.viewLevel.body'),
        icon: 'ℹ️',
      });
    });

    // Sprint 5 UX: Flottencheck help icon (next to toggle)
    document.getElementById('help-fleet')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.fleet.title'),
        content: t('help.fleet.body'),
        icon: 'ℹ️',
      });
    });

    // Sprint 4 UX: Workflow mode toggle + fleet group autocomplete
    this.initWorkflowToggle();
    this.populateFleetGroupSuggestions();

    // NFC Writer integration
    this.initNfcWriter();

    // QR Code Generator integration
    this.initQrGenerator();

    // NFC diagnosis prompt modal
    this.initNfcDiagnosisPrompt();

    // Deep link handling (catch errors so they are not silently swallowed)
    this.handleDeepLink().catch((err) => {
      logger.error('❌ Deep link handling failed:', err);
    });
  }

  /**
   * Handle QR/Barcode scan
   */
  private async handleScan(): Promise<void> {
    try {
      this.openScannerModal();
      await this.startScanner();
    } catch (error) {
      logger.error('Scan error:', error);
      this.showScannerError(t('identify.errors.scannerStart'));
    }
  }

  /**
   * Open scanner modal
   */
  private openScannerModal(): void {
    if (this.scannerModal) {
      this.scannerModal.style.display = 'flex';

      // Hide error and success messages
      const errorDiv = document.getElementById('scanner-error');
      const successDiv = document.getElementById('scanner-success');
      const scannerContainer = document.getElementById('scanner-container');

      if (errorDiv) errorDiv.style.display = 'none';
      if (successDiv) successDiv.style.display = 'none';
      if (scannerContainer) scannerContainer.style.display = 'block';
    }
  }

  /**
   * Start the QR/Barcode scanner
   */
  private async startScanner(): Promise<void> {
    if (this.isScanning) return;

    try {
      this.isScanning = true;
      this.html5QrCode = new Html5Qrcode('qr-reader');

      // Configuration for scanning QR codes and barcodes
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [
          0, // QR_CODE
          8, // CODE_128
          13, // EAN_13
          14, // EAN_8
        ],
      };

      await this.html5QrCode.start(
        { facingMode: 'environment' }, // Use back camera
        config,
        this.onScanSuccess.bind(this),
        this.onScanFailure.bind(this)
      );
    } catch (error) {
      logger.error('Failed to start scanner:', error);
      this.isScanning = false;
      // Clean up scanner instance on error to prevent stale state
      this.html5QrCode = null;

      // OPTIMIZATION: Type-safe error handling with single type guard check
      // Avoid redundant instanceof checks by storing the result
      const isErrorObject = error instanceof Error;
      const errorName = isErrorObject ? error.name : '';
      const errorMessage = isErrorObject ? error.message : String(error);

      // Check if it's a permission error
      if (errorName === 'NotAllowedError' || errorMessage.includes('Permission')) {
        this.showScannerError(
          t('identify.errors.cameraAccessDenied'),
          t('identify.errors.cameraAccessHint')
        );
      } else if (errorName === 'NotFoundError') {
        this.showScannerError(
          t('identify.errors.noCameraFound'),
          t('identify.errors.noCameraHint')
        );
      } else {
        this.showScannerError(
          t('identify.errors.scannerStart'),
          t('identify.errors.manualEntryLoad')
        );
      }
    }
  }

  /**
   * Handle successful scan
   */
  private async onScanSuccess(decodedText: string, _decodedResult: unknown): Promise<void> {
    logger.info('Code detected:', decodedText);

    // Stop scanner immediately
    await this.stopScanner();

    // Play success beep
    this.playSuccessBeep();

    // Show success message
    this.showScannerSuccess(decodedText);

    // Wait a moment before proceeding
    setTimeout(async () => {
      try {
        await this.processScannedCode(decodedText);
      } catch (error) {
        logger.error('Failed to process scanned code:', error);
        notify.error(t('identify.errors.qrProcessing'), error as Error, {
          title: t('modals.scanError'),
          duration: 0,
        });
      } finally {
        this.closeScanner();
      }
    }, 800);
  }

  /**
   * Handle scan failure (this is called continuously, so we don't show errors here)
   */
  private onScanFailure(error: string): void {
    // Don't log every failure - it's called very frequently while scanning
    // Only log if it's not the typical "No MultiFormat Readers" message
    if (!error.includes('No MultiFormat Readers')) {
      logger.debug('Scan attempt:', error);
    }
  }

  /**
   * Process the scanned code
   *
   * Supports three input types:
   * 1. Full URL with hash route (#/m/ID?c=CUSTOMER) → machine import with reference DB
   * 2. Full URL with import route (#/import?url=URL) → full database import
   * 3. Plain text → treated as machine ID (existing behavior)
   *
   * For URL-based QR codes: all relevant data is imported (machine, reference DB),
   * but no diagnosis test is started automatically.
   */
  private async processScannedCode(code: string): Promise<void> {
    try {
      const trimmedCode = code.trim();

      // Check if the scanned code is a URL containing a hash route
      if (this.isUrlWithHashRoute(trimmedCode)) {
        await this.processScannedUrl(trimmedCode);
        return;
      }

      // Plain text: treat as machine ID (existing behavior)
      const validation = this.validateMachineId(trimmedCode);

      if (!validation.valid) {
        this.showError(validation.error || t('identify.errors.invalidCode'));
        return;
      }

      await this.handleMachineId(trimmedCode);
    } catch (error) {
      logger.error('Error processing scanned code:', error);
      this.showError(t('identify.errors.codeProcessing'));
    }
  }

  /**
   * Check if a scanned code is a URL containing a hash route
   * Matches URLs like https://example.com#/m/... or https://example.com#/import?...
   *
   * SECURITY FIX: Uses exact route matching for #/import to prevent
   * unrelated routes like #/important from being routed into import handling.
   */
  private isUrlWithHashRoute(code: string): boolean {
    try {
      if (!code.startsWith('http://') && !code.startsWith('https://')) {
        return false;
      }
      const url = new URL(code);
      // Extract path from hash (before any query string)
      const hashPath = url.hash.split('?')[0];
      return hashPath.startsWith('#/m/') || hashPath === '#/import';
    } catch {
      return false;
    }
  }

  /**
   * Process a scanned URL containing a hash route
   *
   * Parses the hash part using HashRouter and dispatches to the appropriate handler:
   * - machine route: loads/creates machine and imports reference DB (no auto-test)
   * - import route: imports full database export via NfcImportService
   */
  private async processScannedUrl(url: string): Promise<void> {
    try {
      const parsed = new URL(url);
      const hash = parsed.hash;

      if (!hash) {
        this.showError(t('identify.errors.invalidCode'));
        return;
      }

      const router = new HashRouter();
      const match = router.parseHash(hash);

      logger.info(`📱 QR scan URL parsed: type=${match.type}, machineId=${match.machineId || 'none'}, dbUrl=${match.referenceDbUrl || 'none'}`);

      if (match.type === 'machine' && match.machineId) {
        // Machine route: load/create machine and download reference DB
        const validation = this.validateMachineId(match.machineId);
        if (!validation.valid) {
          this.showError(validation.error || t('identify.errors.invalidMachineId'));
          return;
        }

        const machineHandled = await this.handleMachineId(match.machineId, match.referenceDbUrl);

        // After successful machine load + DB import, ask user if they want to run a test
        if (machineHandled) {
          this.openNfcDiagnosisPrompt();
        }
        return;
      }

      if (match.type === 'import' && match.importUrl) {
        // Import route: full database import via external URL
        await this.processScannedImportUrl(match.importUrl);
        return;
      }

      // Unknown route type - treat the whole URL as invalid
      logger.warn(`⚠️ QR scan URL has unknown route type: ${match.type}`);
      this.showError(t('identify.errors.invalidCode'));
    } catch (error) {
      logger.error('Error processing scanned URL:', error);
      this.showError(t('identify.errors.codeProcessing'));
    }
  }

  /**
   * Process a scanned import URL (#/import?url=...)
   * Fetches and imports the full database export, then refreshes the UI.
   * Shows loading overlay during the import process.
   */
  private async processScannedImportUrl(importUrl: string): Promise<void> {
    const overlay = new ReferenceLoadingOverlay();
    overlay.show();
    overlay.updateStatus(t('urlImport.statusFetching'), 10);

    try {
      const result = await nfcImportService.importFromExternalUrl(importUrl, {
        onProgress: (status) => {
          const progressMap: Record<string, number> = {
            [t('urlImport.statusFetching')]: 30,
            [t('urlImport.statusValidating')]: 60,
            [t('urlImport.statusImporting')]: 85,
          };
          overlay.updateStatus(status, progressMap[status] || 50);
        },
        onError: (errorMessage) => {
          overlay.showError(errorMessage);
        },
      });

      if (result.success) {
        overlay.showSuccess();

        const meta = result.metadata;
        const details = meta
          ? `${meta.machineCount} ${t('settings.machines')}, ${meta.recordingCount} ${t('settings.recordings')}, ${meta.diagnosisCount} ${t('settings.diagnoses')}`
          : '';

        notify.success(
          details
            ? `${t('urlImport.success')}\n\n${details}`
            : t('urlImport.success'),
          { title: t('urlImport.successTitle') }
        );

        // Refresh UI, then select first machine and offer diagnosis prompt
        setTimeout(() => {
          void (async () => {
            try {
              overlay.hide();
              overlay.destroy();
              await this.refreshMachineLists();
              await this.loadDiagnosisHistory();

              // Select first available machine and ask user if they want to run a test
              const machines = await getAllMachines();
              if (machines.length > 0) {
                const firstMachine = machines[0];
                this.setCurrentMachine(firstMachine);
                this.onMachineSelected(firstMachine);
                this.openNfcDiagnosisPrompt();
              }
            } catch (error) {
              logger.error('Post-import UI refresh failed:', error);
              overlay.hide();
              overlay.destroy();
            }
          })();
        }, 1600);
      } else {
        // Error is already shown via onError callback on the overlay
        await new Promise(resolve => setTimeout(resolve, 3000));
        overlay.hide();
        overlay.destroy();
      }
    } catch (error) {
      logger.error('QR scan import error:', error);
      overlay.showError(t('urlImport.errorGeneric'));
      await new Promise(resolve => setTimeout(resolve, 3000));
      overlay.hide();
      overlay.destroy();
    }
  }

  /**
   * Stop the scanner
   */
  private async stopScanner(): Promise<void> {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (error) {
        logger.error('Error stopping scanner:', error);
      } finally {
        this.isScanning = false;
      }
    }
  }

  /**
   * Close scanner modal
   */
  private async closeScanner(): Promise<void> {
    try {
      await this.stopScanner();
    } catch (error) {
      logger.error('Error stopping scanner:', error);
    } finally {
      // CRITICAL FIX: Always hide modal, even if stopScanner() fails
      // This ensures the modal doesn't block clicks if scanner cleanup errors occur
      if (this.scannerModal) {
        this.scannerModal.style.display = 'none';
      }
    }
  }

  /**
   * Show scanner error
   */
  private showScannerError(message: string, hint?: string): void {
    const errorDiv = document.getElementById('scanner-error');
    const successDiv = document.getElementById('scanner-success');
    const scannerContainer = document.getElementById('scanner-container');
    const errorMessage = document.getElementById('scanner-error-message');
    const errorHint = document.querySelector('.scanner-error-hint');

    if (errorDiv) {
      errorDiv.style.display = 'flex';
    }
    if (successDiv) {
      successDiv.style.display = 'none';
    }
    if (scannerContainer) {
      scannerContainer.style.display = 'none';
    }
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    // CRITICAL FIX: Always reset hint text (even when empty) to prevent stale hints
    // This ensures old hints don't remain visible when new errors occur without hints
    if (errorHint) {
      errorHint.textContent = hint || '';
    }
  }

  /**
   * Show scanner success
   */
  private showScannerSuccess(code: string): void {
    const errorDiv = document.getElementById('scanner-error');
    const successDiv = document.getElementById('scanner-success');
    const scannerContainer = document.getElementById('scanner-container');
    const successMessage = document.getElementById('scanner-success-message');

    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
    if (successDiv) {
      successDiv.style.display = 'flex';
    }
    if (scannerContainer) {
      scannerContainer.style.display = 'none';
    }
    if (successMessage) {
      successMessage.textContent = t('identify.messages.codeRecognized', { code });
    }
  }

  /**
   * Play success beep sound
   */
  private playSuccessBeep(): void {
    try {
      // Create a simple beep using Web Audio API
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        logger.warn('AudioContext not supported in this browser');
        return;
      }
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      // CRITICAL FIX: Close AudioContext after beep finishes to prevent resource leak
      // Wait for sound duration (200ms) + small buffer before closing context
      setTimeout(() => {
        if (audioContext && audioContext.state !== 'closed') {
          try {
            audioContext.close();
          } catch (error) {
            logger.warn('⚠️ Error closing AudioContext:', error);
          }
        }
      }, 250); // 200ms sound + 50ms buffer
    } catch (error) {
      logger.warn('Could not play beep sound:', error);
    }
  }

  /**
   * Handle manual input from scanner modal
   */
  private async handleManualInput(): Promise<void> {
    await this.closeScanner();
    this.openManualInputModal();
  }

  /**
   * Handle manual machine ID submission
   */
  private async submitManualInput(): Promise<void> {
    const manualInput = document.getElementById(
      'manual-machine-id-input'
    ) as HTMLInputElement | null;

    if (!manualInput) {
      this.showError(t('identify.errors.manualEntryLoad'));
      return;
    }

    const trimmedCode = manualInput.value.trim();
    const validation = this.validateMachineId(trimmedCode);

    if (!validation.valid) {
      this.showError(validation.error || t('identify.errors.invalidMachineId'));
      return;
    }

    this.closeManualInputModal();
    await this.handleMachineId(trimmedCode);
  }

  /**
   * Open manual input modal
   */
  private openManualInputModal(): void {
    const manualInputModal = document.getElementById('manual-input-modal');
    const manualInput = document.getElementById(
      'manual-machine-id-input'
    ) as HTMLInputElement | null;

    if (manualInputModal) {
      manualInputModal.style.display = 'flex';
    }

    if (manualInput) {
      manualInput.value = '';
      manualInput.focus();
    }
  }

  /**
   * Close manual input modal
   */
  private closeManualInputModal(): void {
    const manualInputModal = document.getElementById('manual-input-modal');
    if (manualInputModal) {
      manualInputModal.style.display = 'none';
    }
  }

  /**
   * Handle machine selection or auto-create if missing
   * Also triggers automatic reference database download for NFC-based setup
   *
   * @param id - Machine identifier
   * @param referenceDbUrl - Optional reference DB URL from NFC link (enables auto-creation with DB)
   */
  private async handleMachineId(id: string, referenceDbUrl?: string): Promise<boolean> {
    try {
      let machine = await getMachine(id);

      if (machine) {
        // Update referenceDbUrl if provided and different from current
        if (referenceDbUrl && machine.referenceDbUrl !== referenceDbUrl) {
          logger.info(`🔄 Updating reference URL for machine ${id}`);
          machine.referenceDbUrl = referenceDbUrl;
          await saveMachine(machine);
        }

        notify.success(t('identify.success.machineLoaded', { name: machine.name }));
        this.setCurrentMachine(machine);
        this.onMachineSelected(machine);

        // Check if reference database download is needed (NFC setup flow)
        const needsDownload = await ReferenceDbService.needsDownload(id);
        if (needsDownload && machine.referenceDbUrl) {
          const downloadSuccess = await this.downloadReferenceDatabase(machine);
          // Reload machine to get updated reference models
          // For full database imports, the machine data might have changed significantly
          machine = await getMachine(id);
          if (machine) {
            this.setCurrentMachine(machine);
            this.onMachineSelected(machine);
          }
          // If download failed, still return true (machine exists) but log warning
          if (!downloadSuccess) {
            logger.warn(`⚠️ Reference download failed for machine ${id}, but machine exists`);
          }
        }

        return true;
      }

      // Machine not found - auto-create
      // If referenceDbUrl is provided (from NFC link), include it for DB download
      if (referenceDbUrl) {
        // Validate URL before creating machine
        const validation = ReferenceDbService.validateUrl(referenceDbUrl);
        if (!validation.valid) {
          logger.error(`Invalid reference URL: ${validation.error}`);
          this.showError(t('identify.errors.invalidReferenceUrl') || 'Invalid reference database URL');
          return false;
        }
        logger.info(`🆕 Auto-creating machine ${id} with reference DB URL from NFC`);
      }

      const autoName = t('identify.messages.autoMachineName', { id });
      const newMachine: Machine = {
        id,
        name: autoName,
        nameIsPlaceholder: true,
        createdAt: Date.now(),
        referenceModels: [],
        referenceDbUrl: referenceDbUrl, // Include URL from NFC link
      };

      await saveMachine(newMachine);
      await this.refreshMachineLists();
      notify.success(t('identify.success.machineAutoCreated', { name: autoName }));
      this.setCurrentMachine(newMachine);
      this.onMachineSelected(newMachine);

      // If referenceDbUrl was provided, download the database immediately
      if (referenceDbUrl) {
        const downloadSuccess = await this.downloadReferenceDatabase(newMachine);
        // Reload machine to get updated reference models and metadata
        // For full database imports, the machine data might have changed significantly
        const updatedMachine = await getMachine(id);
        if (updatedMachine) {
          this.setCurrentMachine(updatedMachine);
          this.onMachineSelected(updatedMachine);
        }
        // If download failed, still return true (machine was created) but log warning
        if (!downloadSuccess) {
          logger.warn(`⚠️ Reference download failed for machine ${id}, but machine was created`);
        }
      }

      return true;
    } catch (error) {
      logger.error('Error handling machine ID:', error);
      notify.error(t('identify.errors.machineLoad'), error as Error);
      return false;
    }
  }

  /**
   * Download reference database for a machine (NFC setup flow)
   * Shows loading overlay during download
   *
   * Supports both:
   * - Reference database format (models) → applied to machine
   * - Full database export format (machines, recordings, diagnoses) → full import with replace/reset
   *
   * After successful import (especially full DB import), this method:
   * - Refreshes machine lists to reflect imported data
   * - Returns true if import was successful (caller can then select machine)
   */
  private async downloadReferenceDatabase(machine: Machine): Promise<boolean> {
    const overlay = new ReferenceLoadingOverlay();
    overlay.show();

    try {
      const result = await ReferenceDbService.downloadAndApply(
        machine.id,
        (status, progress) => {
          overlay.updateStatus(this.getLocalizedDownloadStatus(status), progress);
        }
      );

      if (result.success) {
        overlay.showSuccess();
        logger.info(`✅ Reference DB downloaded: ${result.modelsImported} models, v${result.version}`);

        // CRITICAL FIX: Explicitly destroy overlay to prevent it from blocking clicks
        // The setTimeout in showSuccess() might fail, leaving the overlay active
        setTimeout(() => {
          overlay.hide();
          overlay.destroy();
        }, 1600); // Slightly longer than showSuccess timeout to ensure it completes

        // CRITICAL: Refresh machine lists after successful import
        // This is especially important for full database imports where the
        // entire database was replaced - we need to reload all UI state
        await this.refreshMachineLists();

        // Also reload diagnosis history as it may have changed
        await this.loadDiagnosisHistory();

        return true;
      } else {
        overlay.showError(this.getLocalizedDownloadError(result.error || 'unknown'));
        // Keep overlay visible longer for error
        await new Promise(resolve => setTimeout(resolve, 3000));
        overlay.hide();
        return false;
      }
    } catch (error) {
      logger.error('Reference DB download error:', error);
      overlay.showError(t('machineSetup.errorUnknown'));
      await new Promise(resolve => setTimeout(resolve, 3000));
      overlay.hide();
      return false;
    }
  }

  /**
   * Get localized download status message
   */
  private getLocalizedDownloadStatus(status: string): string {
    const statusMap: Record<string, string> = {
      downloading: t('machineSetup.statusDownloading'),
      parsing: t('machineSetup.statusParsing'),
      validating: t('machineSetup.statusValidating'),
      saving: t('machineSetup.statusSaving'),
      complete: t('machineSetup.statusComplete'),
    };
    return statusMap[status] || status;
  }

  /**
   * Get localized download error message
   */
  private getLocalizedDownloadError(error: string): string {
    const errorMap: Record<string, string> = {
      machine_not_found: t('machineSetup.errorMachineNotFound'),
      no_reference_url: t('machineSetup.errorNoReferenceUrl'),
      download_failed: t('machineSetup.errorDownloadFailed'),
      invalid_format: t('machineSetup.errorInvalidFormat'),
      invalid_data_structure: t('machineSetup.errorInvalidStructure'),
      no_models_or_config: t('machineSetup.errorNoModels'),
      invalid_model_format: t('machineSetup.errorInvalidModel'),
    };
    return errorMap[error] || t('machineSetup.errorUnknown');
  }

  /**
   * Handle manual machine creation
   * Includes service technician fields for NFC setup (expert mode)
   */
  private async handleCreateMachine(): Promise<void> {
    try {
      const nameInput = document.getElementById('machine-name-input') as HTMLInputElement;
      const idInput = document.getElementById('machine-id-input') as HTMLInputElement;

      // Service technician fields (expert mode)
      const refDbUrlInput = document.getElementById('reference-db-url-input') as HTMLInputElement;
      const locationInput = document.getElementById('machine-location-input') as HTMLInputElement;
      const notesInput = document.getElementById('machine-notes-input') as HTMLTextAreaElement;

      if (!nameInput || !idInput) {
        throw new Error('Input elements not found');
      }

      const name = nameInput.value.trim();
      const idInputValue = idInput.value.trim();

      // Get service technician fields if available
      const referenceDbUrl = refDbUrlInput?.value.trim() || undefined;
      const location = locationInput?.value.trim() || undefined;
      const notes = notesInput?.value.trim() || undefined;

      // Sprint 1 UX: Inline validation for machine name
      const nameError = document.getElementById('machine-name-error');

      // Validate name
      if (!name) {
        nameInput.classList.add('input-invalid');
        nameInput.setAttribute('aria-invalid', 'true');
        if (nameError) {
          nameError.style.display = 'block';
        }
        nameInput.focus();
        return;
      }

      // Clear error state on valid input
      nameInput.classList.remove('input-invalid');
      nameInput.removeAttribute('aria-invalid');
      if (nameError) nameError.style.display = 'none';

      // Validate name is not just whitespace and has reasonable length
      if (!/\S/.test(name)) {
        this.showError(t('identify.errors.nameWhitespace'));
        return;
      }

      if (name.length > 100) {
        this.showError(t('identify.errors.nameTooLong'));
        return;
      }

      // Validate reference DB URL if provided
      if (referenceDbUrl) {
        const urlValidation = ReferenceDbService.validateUrl(referenceDbUrl);
        if (!urlValidation.valid) {
          this.showError(t(`machineSetup.${this.getUrlErrorKey(urlValidation.error || 'urlInvalid')}`));
          return;
        }
      }

      // Generate or validate ID
      let id: string;
      if (idInputValue) {
        // Validate provided ID
        const validation = this.validateMachineId(idInputValue);
        if (!validation.valid) {
          this.showError(validation.error || t('identify.errors.invalidMachineId'));
          return;
        }
        id = idInputValue;
      } else {
        // Generate new ID
        id = this.generateMachineId();
      }

      // Check if ID already exists
      const existing = await getMachine(id);
      if (existing) {
        this.showError(t('identify.errors.machineExists'));
        return;
      }

      // Sprint 4 UX: Fleet group
      const fleetGroupInput = document.getElementById('machine-fleet-group') as HTMLInputElement | null;
      const fleetGroup = fleetGroupInput?.value?.trim() || null;

      // Create new machine with service technician fields
      const machine: Machine = {
        id,
        name,
        createdAt: Date.now(),
        referenceModels: [],
        // Service technician fields (NFC setup)
        referenceDbUrl,
        location,
        notes,
        // Sprint 4 UX: Optional fleet group
        fleetGroup,
      };

      await saveMachine(machine);
      await this.refreshMachineLists();

      logger.debug('✅ Machine Created:', {
        id: machine.id,
        name: machine.name,
        createdAt: new Date(machine.createdAt).toLocaleString(),
        hasReferenceDbUrl: !!machine.referenceDbUrl,
      });
      logger.debug('📞 Calling onMachineSelected() with new machine...');

      // Clear inputs
      nameInput.value = '';
      idInput.value = '';
      if (refDbUrlInput) refDbUrlInput.value = '';
      if (locationInput) locationInput.value = '';
      if (notesInput) notesInput.value = '';
      if (fleetGroupInput) fleetGroupInput.value = '';

      // Sprint 4 UX: Update fleet group autocomplete suggestions
      this.populateFleetGroupSuggestions();

      this.showNotification(t('identify.success.machineCreated', { name }));
      this.setCurrentMachine(machine);
      this.onMachineSelected(machine);
    } catch (error) {
      logger.error('Create machine error:', error);
      this.showError(t('identify.errors.machineCreate'));
    }
  }

  /**
   * Map URL validation error to i18n key
   */
  private getUrlErrorKey(error: string): string {
    const errorMap: Record<string, string> = {
      url_empty: 'urlEmpty',
      url_invalid: 'urlInvalid',
      url_not_https: 'urlNotHttps',
      google_drive_not_direct: 'googleDriveNotDirect',
      url_not_official_source: 'urlNotOfficialSource',
    };
    return errorMap[error] || 'urlInvalid';
  }

  /**
   * Refresh machine lists (overview + quick select) after updates.
   */
  public async refreshMachineLists(): Promise<void> {
    await Promise.all([this.loadMachineOverview(), this.loadMachineHistory()]);
  }

  /**
   * Generate random machine ID
   */
  private generateMachineId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Validate machine ID format
   * Ensures ID is not empty, not just whitespace, and has reasonable length
   */
  private validateMachineId(id: string): { valid: boolean; error?: string } {
    // Trim whitespace
    const trimmedId = id.trim();

    // Check if empty after trimming
    if (!trimmedId) {
      return { valid: false, error: t('identify.errors.idEmpty') };
    }

    // Check minimum length (at least 1 character)
    if (trimmedId.length < 1) {
      return { valid: false, error: t('identify.errors.idTooShort') };
    }

    // Check maximum length (prevent excessive IDs)
    if (trimmedId.length > 100) {
      return { valid: false, error: t('identify.errors.idTooLong') };
    }

    // Check for only whitespace characters (extra safety)
    if (!/\S/.test(trimmedId)) {
      return { valid: false, error: t('identify.errors.idWhitespace') };
    }

    return { valid: true };
  }

  /**
   * Show notification message
   */
  private showNotification(message: string): void {
    notify.success(message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    notify.error(message);
  }

  /**
   * Track currently selected machine for NFC writer context.
   */
  private setCurrentMachine(machine: Machine): void {
    this.currentMachine = machine;
    this.updateNfcSpecificOption();
  }

  /**
   * ========================================
   * MACHINE DETAIL MODAL
   * ========================================
   */

  /**
   * Initialize machine detail modal event listeners
   */
  private initMachineDetailModal(): void {
    const modal = document.getElementById('machine-detail-modal');
    const closeBtn = document.getElementById('close-machine-detail-modal');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeMachineDetailModal());
    }

    // Close on backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeMachineDetailModal();
        }
      });
    }
  }

  /**
   * Show machine detail modal with reference models / signatures
   */
  private showMachineDetailModal(machine: Machine): void {
    const modal = document.getElementById('machine-detail-modal');
    const nameEl = document.getElementById('machine-detail-name');
    const idEl = document.getElementById('machine-detail-id');
    const signaturesContainer = document.getElementById('machine-detail-signatures');
    const selectBtn = document.getElementById('machine-detail-select-btn');

    if (!modal || !nameEl || !idEl || !signaturesContainer || !selectBtn) {
      logger.warn('Machine detail modal elements not found');
      // Fallback: direct selection
      this.setCurrentMachine(machine);
      this.onMachineSelected(machine);
      return;
    }

    // Set machine info
    nameEl.textContent = machine.name;
    idEl.textContent = machine.id;

    // Render signatures / reference models
    this.renderMachineDetailSignatures(signaturesContainer, machine);

    // Wire up select button (remove old listeners by cloning)
    const newSelectBtn = selectBtn.cloneNode(true) as HTMLButtonElement;
    selectBtn.parentNode!.replaceChild(newSelectBtn, selectBtn);
    newSelectBtn.addEventListener('click', () => {
      this.closeMachineDetailModal();
      this.showNotification(t('identify.success.machineLoaded', { name: machine.name }));
      this.setCurrentMachine(machine);
      this.onMachineSelected(machine);
    });

    // Show modal
    modal.style.display = 'flex';
    logger.info(`Machine detail modal opened for: ${machine.name} (${machine.id})`);
  }

  /**
   * Render reference model / signature list inside the machine detail modal
   */
  private renderMachineDetailSignatures(container: HTMLElement, machine: Machine): void {
    container.innerHTML = '';

    const title = document.createElement('h5');
    title.textContent = t('reference.trainedStates');
    container.appendChild(title);

    const models = machine.referenceModels;

    if (!models || models.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'machine-detail-empty';
      empty.textContent = t('reference.noModels');
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'machine-detail-signature-list';

    models.forEach((model) => {
      const li = document.createElement('li');
      li.className = 'machine-detail-signature-item';

      // Info section
      const info = document.createElement('div');
      info.className = 'machine-detail-signature-info';

      const label = document.createElement('div');
      label.className = 'machine-detail-signature-label';
      label.textContent = model.label || t('reference.unnamed', { index: String(list.children.length + 1) });

      const date = document.createElement('div');
      date.className = 'machine-detail-signature-date';
      date.textContent = model.trainingDate
        ? new Date(model.trainingDate).toLocaleString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      info.appendChild(label);
      info.appendChild(date);

      // Type badge
      const typeBadge = document.createElement('span');
      typeBadge.className = `machine-detail-signature-type type-${model.type}`;
      typeBadge.textContent = model.type === 'healthy' ? 'OK' : model.type;

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'machine-detail-delete-btn';
      deleteBtn.setAttribute('aria-label', t('reference.deleteModel'));
      deleteBtn.textContent = '\uD83D\uDDD1\uFE0F';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = confirm(
          t('reference.confirmDeleteModel', { name: model.label || '' })
        );
        if (!confirmed) return;

        const deleted = await deleteReferenceModel(machine.id, model.label || '');
        if (deleted) {
          notify.success(t('reference.modelDeleted', { name: model.label || '' }));
          // Reload machine and re-render the modal
          const updated = await getMachine(machine.id);
          if (updated) {
            this.renderMachineDetailSignatures(container, updated);
            // Also refresh the overview lists
            await this.refreshMachineLists();
          }
        }
      });

      li.appendChild(info);
      li.appendChild(typeBadge);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  /**
   * Close machine detail modal
   */
  private closeMachineDetailModal(): void {
    const modal = document.getElementById('machine-detail-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Deep link handling for magic URLs.
   * Supports:
   * - New format: #/m/<id>?c=<customer_id> (customerId builds DB URL automatically)
   * - Legacy hash format: #/m/<id>?ref=<encoded_url>
   * - Legacy query param format: ?machineId=<id>
   *
   * When customerId (c) is provided (NFC setup flow - Variante B):
   * - DB URL is built automatically: https://gunterstruck.github.io/<customerId>/db-latest.json
   * - Auto-creates machine if not found
   * - Downloads and imports the complete database
   * - Selects the specific machine
   * - Offers "Test starten" immediately
   */
  private async handleDeepLink(): Promise<void> {
    let machineId: string | null = null;
    let referenceDbUrl: string | undefined;
    let customerId: string | undefined;
    let isHashRoute = false;

    // Check hash-based route first using HashRouter for correct parsing
    // This properly handles #/m/<machine_id>?c=<customer_id> (new) or ?ref=<encoded_url> (legacy)
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/m/')) {
      // ═══════════════════════════════════════════════════════════════════════════
      // KRITISCH: NFC-Onboarding erzwingt Simple Mode - BEVOR irgendetwas anderes läuft!
      // Reihenfolge: 1) View Level → 2) Detection Mode → 3) Trace → 4) Rest
      // ═══════════════════════════════════════════════════════════════════════════

      // SCHRITT 1: View Level auf "basic" setzen (UI-Darstellung)
      // Muss SOFORT passieren, bevor irgendwelche UI-Komponenten initialisiert werden
      const previousViewLevel = document.documentElement.getAttribute('data-view-level') || 'unknown';
      setViewLevelTemporary('basic', 'nfc_onboarding');
      // Validierung: Sicherstellen, dass das Attribut wirklich gesetzt wurde
      const currentViewLevel = document.documentElement.getAttribute('data-view-level');
      if (currentViewLevel !== 'basic') {
        logger.error(`❌ NFC-Onboarding: View Level konnte nicht auf 'basic' gesetzt werden! Ist: ${currentViewLevel}`);
        // Fallback: Manuell setzen
        document.documentElement.setAttribute('data-view-level', 'basic');
      }
      logger.info(`🎨 NFC-Onboarding: View Level von '${previousViewLevel}' auf 'basic' gesetzt`);

      // SCHRITT 1b: Theme temporär auf "focus" setzen (DOM only, kein localStorage)
      document.documentElement.setAttribute('data-theme', 'focus');
      logger.info('🎨 NFC-Onboarding: Theme temporär auf "focus" gesetzt');

      // SCHRITT 2: Trace-Session starten (für Debugging/Protokoll)
      onboardingTrace.start('nfc');

      // Mark NFC onboarding as active (for view level restore later)
      this.isNfcOnboardingActive = true;

      // Trace: Mode-Änderung protokollieren
      onboardingTrace.success('ui_mode_set', {
        from: previousViewLevel,
        to: 'basic',
        reason: 'nfc_onboarding',
      });

      // Show trace overlay for debugging (always show for NFC deep links, or when debug=1)
      const showDebugTrace = OnboardingTraceService.shouldShowTrace();
      if (showDebugTrace) {
        traceOverlay.show();
      }

      const router = new HashRouter();
      const match = router.parseHash(hash);
      if (match.type === 'machine' && match.machineId) {
        machineId = match.machineId;
        customerId = match.customerId;
        referenceDbUrl = match.referenceDbUrl;
        isHashRoute = true;
        logger.info(`🔗 Deep link parsed: machineId=${machineId}, customerId=${customerId || 'none'}, dbUrl=${referenceDbUrl || 'none'}`);
      }
    }

    // Sprint 6: Handle fleet deep links (#/f/<fleet_id>?c=<customer_id>)
    if (hash && hash.startsWith('#/f/')) {
      logger.info('🔗 Fleet deep link detected');

      const fleetRouter = new HashRouter();
      const fleetMatch = fleetRouter.parseHash(hash);

      if (fleetMatch.type === 'fleet' && fleetMatch.fleetId && fleetMatch.fleetDbUrl) {
        logger.info(`🚢 Fleet route: ${fleetMatch.fleetId} → ${fleetMatch.fleetDbUrl}`);

        // Show loading overlay
        const overlay = new ReferenceLoadingOverlay();
        overlay.show();

        // Configure callbacks
        fleetRouter.setOnDownloadProgress((status, progress) => {
          overlay.updateStatus(status, progress || 50);
        });

        fleetRouter.setOnDownloadError((error) => {
          logger.error(`Fleet provisioning failed: ${error}`);
          overlay.showError(t('fleet.provision.error'));
          setTimeout(() => overlay.hide(), 3000);
        });

        fleetRouter.setOnFleetReady((fleetName, machineCount) => {
          logger.info(`✅ Fleet "${fleetName}" ready with ${machineCount} machines`);
          overlay.showSuccess();
          setTimeout(() => overlay.hide(), 1500);

          // Refresh machine lists to show new fleet
          this.refreshMachineLists();

          // Notify parent (Router) to switch to fleet mode (auto-start guided check from deep link)
          if (this.onFleetProvisioned) {
            this.onFleetProvisioned(fleetName, true);
          }
        });

        // Trigger fleet route handling (downloads + provisions)
        // init() calls handleHashChange() which processes the current hash
        await fleetRouter.init();

        // Clean up URL after processing
        window.history.replaceState({}, document.title, window.location.pathname);

        // Destroy router to remove hashchange listener
        fleetRouter.destroy();
        return; // Don't fall through to machine ID handling
      }
    }

    // Sprint 8: Handle quick compare deep links (#/q/<number> – count-only, fully offline)
    if (hash && hash.startsWith('#/q/')) {
      logger.info('⚡ Quick Compare deep link detected');

      const qcRouter = new HashRouter();
      const qcMatch = qcRouter.parseHash(hash);
      qcRouter.destroy(); // Not needed beyond parsing

      if (qcMatch.type === 'quickcompare' && qcMatch.machineCount) {
        const count = qcMatch.machineCount;
        logger.info(`⚡ Quick Compare route (count-only): ${count} machines`);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Directly notify parent – no async round-trip needed for count-only
        if (this.onQuickCompareProvisioned) {
          this.onQuickCompareProvisioned(count);
        } else {
          logger.error('❌ Quick Compare deep link: onQuickCompareProvisioned callback not set');
        }
        return; // Don't fall through to machine ID handling
      }
    }

    // Fallback to legacy query param: ?machineId=<id>
    if (!machineId) {
      const params = new URLSearchParams(window.location.search);
      machineId = params.get('machineId');
    }

    if (!machineId) {
      return;
    }

    const validation = this.validateMachineId(machineId);
    if (!validation.valid) {
      this.showError(validation.error || t('identify.errors.invalidMachineId'));
      onboardingTrace.fail('process_failed', { reason: 'invalid_machine_id', machineId });
      return;
    }

    this.showDeepLinkOverlay(true);
    let machineHandled = false;
    try {
      machineHandled = await this.handleMachineId(machineId, referenceDbUrl);

      // Clean up URL after processing
      if (isHashRoute) {
        // Clear hash
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      } else {
        // Clear query param
        const params = new URLSearchParams(window.location.search);
        params.delete('machineId');
        const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (error) {
      logger.error('Failed to handle deep link:', error);
      this.showError(t('identify.errors.machineLoad'));
      onboardingTrace.fail('process_failed', {
        reason: 'handle_machine_error',
        error: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      this.showDeepLinkOverlay(false);
    }

    if (machineHandled) {
      // Trace: Test dialog shown
      onboardingTrace.success('test_dialog_shown', { machineId });
      // Mark onboarding as complete
      onboardingTrace.success('onboarding_complete', { status: 'success' });
      // End trace session
      onboardingTrace.end();

      // TEIL B: Automatisches Ausblenden des Protokolls bei Erfolg
      // Wenn kein Fehler aufgetreten ist UND nicht im Debug-Modus: Overlay vollständig ausblenden
      if (onboardingTrace.shouldAutoHide()) {
        onboardingTrace.success('trace_hidden', { reason: 'success' });
        traceOverlay.hide();
        logger.debug('[NFC Onboarding] Trace overlay auto-hidden (success, no errors)');
      }

      this.openNfcDiagnosisPrompt();
    } else {
      // End trace session on failure - Protokoll bleibt sichtbar
      onboardingTrace.end();
      // Trace overlay bleibt sichtbar für Fehleranalyse (Teil B Fehlerfall)
      logger.debug('[NFC Onboarding] Trace overlay remains visible (error occurred)');
    }
  }

  private showDeepLinkOverlay(show: boolean): void {
    if (!this.deepLinkOverlay) {
      this.deepLinkOverlay = document.getElementById('deep-link-overlay');
    }
    if (this.deepLinkOverlay) {
      this.deepLinkOverlay.style.display = show ? 'flex' : 'none';
      this.deepLinkOverlay.style.pointerEvents = show ? 'auto' : 'none';
    }
  }

  private initNfcDiagnosisPrompt(): void {
    this.nfcDiagnosisModal = document.getElementById('nfc-diagnosis-modal');
    this.nfcDiagnosisConfirmBtn = document.getElementById('nfc-diagnosis-confirm-btn') as HTMLButtonElement | null;
    this.nfcDiagnosisCancelBtn = document.getElementById('nfc-diagnosis-cancel-btn') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('close-nfc-diagnosis-modal');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeNfcDiagnosisPrompt());
    }
    if (this.nfcDiagnosisCancelBtn) {
      this.nfcDiagnosisCancelBtn.addEventListener('click', () => this.closeNfcDiagnosisPrompt());
    }
    if (this.nfcDiagnosisConfirmBtn) {
      this.nfcDiagnosisConfirmBtn.addEventListener('click', () => {
        // startingTest=true: keep basic mode active during test
        this.closeNfcDiagnosisPrompt(true);
        this.startDiagnosisFromNfc();
      });
    }
    if (this.nfcDiagnosisModal) {
      this.nfcDiagnosisModal.addEventListener('click', (event) => {
        if (event.target === this.nfcDiagnosisModal) {
          this.closeNfcDiagnosisPrompt();
        }
      });
    }
  }

  private openNfcDiagnosisPrompt(): void {
    if (!this.nfcDiagnosisModal) {
      return;
    }
    this.nfcDiagnosisModal.style.display = 'flex';
  }

  /**
   * Close the NFC diagnosis prompt
   * @param startingTest - true if closing because test is starting (don't restore view level yet)
   */
  private closeNfcDiagnosisPrompt(startingTest: boolean = false): void {
    if (this.nfcDiagnosisModal) {
      this.nfcDiagnosisModal.style.display = 'none';
    }

    // Restore view level after NFC onboarding flow ends
    // But NOT if we're starting the test - keep basic mode during test
    // Restore only happens when user cancels/closes without starting test
    if (this.isNfcOnboardingActive && !startingTest) {
      this.isNfcOnboardingActive = false;
      restoreViewLevel();
      restoreTheme();
      logger.debug('[NFC Onboarding] View level and theme restored to user preference (dialog closed)');
    }
  }

  private startDiagnosisFromNfc(): void {
    const content = document.getElementById('run-diagnosis-content');
    const header = document.querySelector('.section-header[data-target="run-diagnosis-content"]') as HTMLElement | null;
    if (content && header && window.getComputedStyle(content).display === 'none') {
      header.click();
    }

    // Set flag to force basic view for NFC-initiated diagnosis
    // This ensures simplified inspection modal is shown regardless of user's view level setting
    document.body.setAttribute('data-nfc-diagnosis', 'true');

    const startButton = document.getElementById('diagnose-btn') as HTMLButtonElement | null;

    if (!startButton) {
      return;
    }

    if (!startButton.disabled) {
      startButton.click();
      return;
    }

    const waitForEnableTimeout = 4000;
    const startTime = Date.now();
    const intervalId = window.setInterval(() => {
      if (!startButton.disabled) {
        startButton.click();
        window.clearInterval(intervalId);
        return;
      }
      if (Date.now() - startTime >= waitForEnableTimeout) {
        window.clearInterval(intervalId);
      }
    }, 250);
  }

  /**
   * NFC Writer setup and flow.
   */
  private initNfcWriter(): void {
    const openBtn = document.getElementById('open-nfc-writer-btn') as HTMLButtonElement | null;
    const settingsBtn = document.getElementById('settings-nfc-writer-btn') as HTMLButtonElement | null;
    const availabilityHint = document.getElementById('nfc-availability-hint');
    const settingsAvailabilityHint = document.getElementById('settings-nfc-availability-hint');

    this.nfcModal = document.getElementById('nfc-writer-modal');
    this.nfcStatus = document.getElementById('nfc-status');
    this.nfcWriteBtn = document.getElementById('nfc-write-btn') as HTMLButtonElement | null;
    this.nfcGenericOption = document.getElementById('nfc-option-generic') as HTMLInputElement | null;
    this.nfcSpecificOption = document.getElementById('nfc-option-specific') as HTMLInputElement | null;
    this.nfcSpecificDetail = document.getElementById('nfc-option-specific-detail');
    this.nfcSupportDetails = document.getElementById('nfc-support-details');

    // CustomerId input field for Variante B
    this.nfcCustomerIdInput = document.getElementById('nfc-customer-id-input') as HTMLInputElement | null;
    this.nfcDbUrlPreview = document.getElementById('nfc-db-url-preview');

    const closeBtn = document.getElementById('close-nfc-writer-modal');
    const cancelBtn = document.getElementById('nfc-cancel-btn');

    const { supported: supportsNfc } = this.getNfcSupportStatus();

    if (openBtn) {
      openBtn.addEventListener('click', () => this.openNfcModal());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openNfcModal());
    }

    if (availabilityHint) {
      availabilityHint.style.display = supportsNfc ? 'none' : 'block';
    }
    if (settingsAvailabilityHint) {
      settingsAvailabilityHint.style.display = supportsNfc ? 'none' : 'block';
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeNfcModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeNfcModal());
    }
    if (this.nfcModal) {
      this.nfcModal.addEventListener('click', (event) => {
        if (event.target === this.nfcModal) {
          this.closeNfcModal();
        }
      });
    }
    if (this.nfcWriteBtn) {
      this.nfcWriteBtn.addEventListener('click', () => {
        void this.handleNfcWrite();
      });
    }

    // Update DB URL preview when customerId changes
    if (this.nfcCustomerIdInput) {
      this.nfcCustomerIdInput.addEventListener('input', () => {
        this.updateNfcDbUrlPreview();
        this.updateNfcFleetDetail();
      });
    }

    // Fleet option
    this.nfcFleetOption = document.getElementById('nfc-option-fleet') as HTMLInputElement | null;
    this.nfcFleetSection = document.getElementById('nfc-fleet-section');
    this.nfcFleetSelect = document.getElementById('nfc-fleet-select') as HTMLSelectElement | null;
    this.nfcFleetDetail = document.getElementById('nfc-option-fleet-detail');
    this.nfcFleetUrlPreview = document.getElementById('nfc-fleet-url-preview');

    // Quick Compare count-only option
    this.nfcQuickCompareCountOption = document.getElementById('nfc-option-quickcompare-count') as HTMLInputElement | null;
    this.nfcQuickCompareCountDetail = document.getElementById('nfc-option-quickcompare-count-detail');
    this.nfcQcCountSection = document.getElementById('nfc-qc-count-section');
    this.nfcQcCountInput = document.getElementById('nfc-qc-count-input') as HTMLInputElement | null;
    this.nfcQcCountUrlPreview = document.getElementById('nfc-qc-count-url-preview');

    // Count-only chip buttons
    const nfcCountChips = document.getElementById('nfc-qc-count-chips');
    if (nfcCountChips) {
      nfcCountChips.querySelectorAll('.qc-count-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const count = parseInt((chip as HTMLElement).dataset.count || '0', 10);
          if (count >= 2 && count <= 30) {
            this.nfcQcCountSelectedValue = count;
            // Deselect all chips, select this one
            nfcCountChips.querySelectorAll('.qc-count-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            if (this.nfcQcCountInput) this.nfcQcCountInput.value = '';
            this.updateNfcQcCountUrlPreview();
          }
        });
      });
    }

    // Count-only custom input
    if (this.nfcQcCountInput) {
      this.nfcQcCountInput.addEventListener('input', () => {
        const val = parseInt(this.nfcQcCountInput!.value, 10);
        nfcCountChips?.querySelectorAll('.qc-count-chip').forEach(c => c.classList.remove('active'));
        if (!isNaN(val) && val >= 2 && val <= 30) {
          this.nfcQcCountSelectedValue = val;
          // Highlight matching preset chip if it exists
          nfcCountChips?.querySelectorAll('.qc-count-chip').forEach(c => {
            if ((c as HTMLElement).dataset.count === String(val)) c.classList.add('active');
          });
        } else {
          this.nfcQcCountSelectedValue = 0;
        }
        this.updateNfcQcCountUrlPreview();
      });
    }

    // Show/hide fleet section based on radio selection
    [this.nfcGenericOption, this.nfcSpecificOption, this.nfcFleetOption, this.nfcQuickCompareCountOption].forEach(radio => {
      radio?.addEventListener('change', () => {
        this.updateNfcFleetVisibility();
        this.updateNfcDbUrlPreview();
        this.updateNfcQcCountVisibility();
        // Clear any previous validation error when switching radio options
        this.setNfcStatus('');
      });
    });

    // Fleet select change
    if (this.nfcFleetSelect) {
      this.nfcFleetSelect.addEventListener('change', () => {
        this.updateNfcFleetDetail();
        this.updateNfcDbUrlPreview();
      });
    }

    this.updateNfcSpecificOption();
  }

  /**
   * Update the DB URL preview based on customerId input
   */
  private updateNfcDbUrlPreview(): void {
    if (!this.nfcDbUrlPreview || !this.nfcCustomerIdInput) {
      return;
    }

    const selectedOption = this.nfcQuickCompareCountOption?.checked ? 'quickcompare-count'
      : this.nfcFleetOption?.checked ? 'fleet'
      : this.nfcSpecificOption?.checked ? 'specific'
      : 'generic';

    // Generic or count-only link: no data URL preview needed
    if (selectedOption === 'generic' || selectedOption === 'quickcompare-count') {
      this.nfcDbUrlPreview.style.display = 'none';
      return;
    }

    const customerId = this.nfcCustomerIdInput.value.trim();
    if (!customerId) {
      this.nfcDbUrlPreview.style.display = 'none';
      return;
    }

    let dataUrl: string;
    if (selectedOption === 'fleet') {
      const fleetName = this.nfcFleetSelect?.value;
      if (!fleetName) {
        this.nfcDbUrlPreview.style.display = 'none';
        return;
      }
      const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
      dataUrl = `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(customerId)}/fleet-${fleetId}.json`;
    } else {
      dataUrl = HashRouter.buildDbUrlFromCustomerId(customerId);
    }

    this.nfcDbUrlPreview.textContent = t('nfc.dbUrlPreview', { url: dataUrl });
    this.nfcDbUrlPreview.style.display = 'block';
  }

  private async updateNfcFleetVisibility(): Promise<void> {
    const isFleet = this.nfcFleetOption?.checked;

    if (this.nfcFleetSection) {
      this.nfcFleetSection.style.display = isFleet ? 'block' : 'none';
    }

    if (isFleet && this.nfcFleetSelect) {
      // Populate fleet dropdown
      const machines = await getAllMachines();
      const groups = new Map<string, number>();
      for (const m of machines) {
        if (m.fleetGroup) {
          groups.set(m.fleetGroup, (groups.get(m.fleetGroup) || 0) + 1);
        }
      }

      this.nfcFleetSelect.innerHTML = '';
      if (groups.size === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('nfc.noFleets');
        this.nfcFleetSelect.appendChild(opt);
      } else {
        for (const [name, count] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `${name} (${count} ${count === 1 ? t('nfc.machine') : t('nfc.machines')})`;
          this.nfcFleetSelect.appendChild(opt);
        }
      }

      this.updateNfcFleetDetail();
    }
  }

  private updateNfcFleetDetail(): void {
    const selected = this.nfcFleetSelect?.value;
    if (this.nfcFleetDetail && selected) {
      this.nfcFleetDetail.textContent = t('nfc.optionFleetDetail', { name: selected });
    }
    // Update URL preview
    if (this.nfcFleetUrlPreview && selected) {
      const customerId = this.nfcCustomerIdInput?.value.trim();
      if (customerId) {
        const fleetId = ReferenceDbService.slugifyFleetName(selected);
        const url = HashRouter.getFullFleetUrl(fleetId, customerId);
        this.nfcFleetUrlPreview.textContent = url;
        this.nfcFleetUrlPreview.style.display = 'block';
      } else {
        this.nfcFleetUrlPreview.style.display = 'none';
      }
    }
  }

  private updateNfcQcCountVisibility(): void {
    const isCountOnly = this.nfcQuickCompareCountOption?.checked;
    if (this.nfcQcCountSection) {
      this.nfcQcCountSection.style.display = isCountOnly ? 'block' : 'none';
    }
    // Hide customer ID section when count-only is selected (no internet needed)
    const nfcCustomerIdSection = document.getElementById('nfc-customer-id-section');
    if (nfcCustomerIdSection) {
      nfcCustomerIdSection.style.display = isCountOnly ? 'none' : '';
    }
  }

  private updateNfcQcCountUrlPreview(): void {
    if (!this.nfcQcCountUrlPreview) return;

    if (this.nfcQcCountSelectedValue >= 2 && this.nfcQcCountSelectedValue <= 30) {
      const url = HashRouter.getFullQuickCompareCountUrl(this.nfcQcCountSelectedValue);
      this.nfcQcCountUrlPreview.textContent = url;
      this.nfcQcCountUrlPreview.style.display = 'block';

      // Update detail text
      if (this.nfcQuickCompareCountDetail) {
        this.nfcQuickCompareCountDetail.textContent = t('nfc.optionQuickCompareCountDetail', {
          count: String(this.nfcQcCountSelectedValue),
        });
      }
    } else {
      this.nfcQcCountUrlPreview.style.display = 'none';
    }
  }

  private getNfcSupportStatus(): { supported: boolean; message?: string } {
    if (!window.isSecureContext) {
      return { supported: false, message: t('nfc.requiresSecureContext') };
    }

    const hasReader = typeof (window as typeof window & { NDEFReader?: NDEFReaderConstructor }).NDEFReader !== 'undefined';
    if (!hasReader) {
      return { supported: false, message: t('nfc.unsupportedBrowser') };
    }

    return { supported: true };
  }

  private openNfcModal(): void {
    if (!this.nfcModal) {
      return;
    }

    // CRITICAL FIX: Close settings modal before opening NFC writer modal
    // This prevents the settings modal from overlaying the NFC writer modal
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
      settingsModal.style.display = 'none';
      logger.debug('Settings modal closed before opening NFC writer modal');
    }

    const { supported: supportsNfc, message } = this.getNfcSupportStatus();
    this.updateNfcSpecificOption();
    this.updateNfcSupportDetails();
    // Ensure field visibility matches the currently selected radio option
    this.updateNfcFleetVisibility();
    this.updateNfcQcCountVisibility();
    this.updateNfcDbUrlPreview();
    if (this.nfcWriteBtn) {
      this.nfcWriteBtn.disabled = !supportsNfc;
    }
    this.setNfcStatus(supportsNfc ? '' : message || t('nfc.unsupported'), supportsNfc ? undefined : 'error');
    this.nfcModal.style.display = 'flex';
  }

  private closeNfcModal(): void {
    if (this.nfcModal) {
      this.nfcModal.style.display = 'none';
    }
  }

  private updateNfcSpecificOption(): void {
    if (!this.nfcSpecificOption || !this.nfcSpecificDetail) {
      return;
    }

    if (this.currentMachine) {
      this.nfcSpecificOption.disabled = false;
      this.nfcSpecificDetail.textContent = t('nfc.optionSpecificDetail', {
        name: this.currentMachine.name,
        id: this.currentMachine.id,
      });
    } else {
      this.nfcSpecificOption.disabled = true;
      if (this.nfcGenericOption) {
        this.nfcGenericOption.checked = true;
      }
      this.nfcSpecificDetail.textContent = t('nfc.optionSpecificUnavailable');
    }
  }

  private updateNfcSupportDetails(): void {
    if (!this.nfcSupportDetails) {
      return;
    }

    const hasSecureContext = window.isSecureContext;
    const hasReader = typeof (window as typeof window & { NDEFReader?: NDEFReaderConstructor }).NDEFReader !== 'undefined';
    const yes = t('common.yes');
    const no = t('common.no');

    this.nfcSupportDetails.textContent = t('nfc.supportDetails', {
      secureContext: hasSecureContext ? yes : no,
      ndefReader: hasReader ? yes : no,
    });
  }

  private setNfcStatus(message: string, status?: 'success' | 'error'): void {
    if (!this.nfcStatus) {
      return;
    }
    this.nfcStatus.textContent = message;
    this.nfcStatus.classList.remove('status-success', 'status-error');
    if (status === 'success') {
      this.nfcStatus.classList.add('status-success');
    }
    if (status === 'error') {
      this.nfcStatus.classList.add('status-error');
    }
  }

  private getBaseAppUrl(): string {
    return new URL('/', window.location.origin).toString();
  }

  private async handleNfcWrite(): Promise<void> {
    if (!this.nfcWriteBtn) {
      return;
    }

    const { supported: supportsNfc, message } = this.getNfcSupportStatus();
    if (!supportsNfc) {
      this.setNfcStatus(message || t('nfc.unsupported'), 'error');
      return;
    }

    const readerConstructor = (window as typeof window & { NDEFReader?: NDEFReaderConstructor }).NDEFReader;
    if (!readerConstructor) {
      this.setNfcStatus(t('nfc.unsupported'), 'error');
      return;
    }

    const selectedOption = this.nfcQuickCompareCountOption?.checked ? 'quickcompare-count'
      : this.nfcFleetOption?.checked ? 'fleet'
      : this.nfcSpecificOption?.checked ? 'specific'
      : 'generic';

    if (selectedOption === 'specific' && !this.currentMachine) {
      this.setNfcStatus(t('nfc.optionSpecificUnavailable'), 'error');
      return;
    }

    // Get customerId from input field
    const customerId = this.nfcCustomerIdInput?.value.trim() || '';

    // Validate: customerId is required for machine-specific and fleet links
    if (selectedOption === 'specific' && !customerId) {
      this.setNfcStatus(t('nfc.customerIdRequired'), 'error');
      return;
    }

    if (selectedOption === 'fleet') {
      const fleetName = this.nfcFleetSelect?.value;
      if (!fleetName || !customerId) {
        this.setNfcStatus(t('nfc.fleetRequiresCustomerId'), 'error');
        return;
      }
    }

    // Validate: count-only requires a valid count
    if (selectedOption === 'quickcompare-count') {
      if (this.nfcQcCountSelectedValue < 2 || this.nfcQcCountSelectedValue > 30) {
        this.setNfcStatus(t('quickCompare.wizard.minMachines'), 'error');
        return;
      }
    }

    const baseUrl = this.getBaseAppUrl();
    let url: string;
    if (selectedOption === 'quickcompare-count' && this.nfcQcCountSelectedValue >= 2) {
      url = HashRouter.getFullQuickCompareCountUrl(this.nfcQcCountSelectedValue);
    } else if (selectedOption === 'fleet' && this.nfcFleetSelect?.value) {
      const fleetId = ReferenceDbService.slugifyFleetName(this.nfcFleetSelect.value);
      url = HashRouter.getFullFleetUrl(fleetId, customerId);
    } else if (selectedOption === 'specific' && this.currentMachine) {
      url = HashRouter.getFullMachineUrl(this.currentMachine.id, customerId);
    } else {
      url = baseUrl;
    }

    logger.info(`📝 Writing NFC tag: ${url}`);

    this.nfcWriteBtn.disabled = true;
    this.setNfcStatus(t('nfc.statusWriting'));

    try {
      const reader = new readerConstructor();
      await reader.write({
        records: [
          {
            recordType: 'url',
            data: url,
          },
        ],
      });
      this.setNfcStatus(t('nfc.statusSuccess'), 'success');
    } catch (error) {
      const isError = error instanceof Error;
      const errorName = isError ? error.name : '';
      if (errorName === 'AbortError') {
        this.setNfcStatus(t('nfc.statusCancelled'), 'error');
      } else {
        this.setNfcStatus(t('nfc.statusError'), 'error');
      }
      logger.error('NFC write failed:', error);
    } finally {
      this.nfcWriteBtn.disabled = false;
    }
  }

  /**
   * ========================================
   * QR CODE GENERATOR
   * ========================================
   */

  private initQrGenerator(): void {
    const openBtn = document.getElementById('open-qr-generator-btn') as HTMLButtonElement | null;
    const settingsBtn = document.getElementById('settings-qr-generator-btn') as HTMLButtonElement | null;

    this.qrModal = document.getElementById('qr-generator-modal');
    this.qrCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement | null;
    this.qrPreviewContainer = document.getElementById('qr-preview-container');
    this.qrUrlPreview = document.getElementById('qr-url-preview');
    this.qrLabelInfo = document.getElementById('qr-label-info');
    this.qrGenericOption = document.getElementById('qr-option-generic') as HTMLInputElement | null;
    this.qrSpecificOption = document.getElementById('qr-option-specific') as HTMLInputElement | null;
    this.qrSpecificDetail = document.getElementById('qr-option-specific-detail');
    this.qrCustomerIdInput = document.getElementById('qr-customer-id-input') as HTMLInputElement | null;
    this.qrCustomerIdSection = document.getElementById('qr-customer-id-section');
    this.qrDbUrlPreview = document.getElementById('qr-db-url-preview');
    this.qrDownloadBtn = document.getElementById('qr-download-btn') as HTMLButtonElement | null;
    this.qrPrintBtn = document.getElementById('qr-print-btn') as HTMLButtonElement | null;

    const closeBtn = document.getElementById('close-qr-generator-modal');
    const cancelBtn = document.getElementById('qr-close-btn');

    if (openBtn) {
      openBtn.addEventListener('click', () => this.openQrModal());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openQrModal());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeQrModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeQrModal());
    }
    if (this.qrModal) {
      this.qrModal.addEventListener('click', (event) => {
        if (event.target === this.qrModal) {
          this.closeQrModal();
        }
      });
    }

    // QR Fleet option
    this.qrFleetOption = document.getElementById('qr-option-fleet') as HTMLInputElement | null;
    this.qrFleetSelect = document.getElementById('qr-fleet-select') as HTMLSelectElement | null;
    this.qrFleetSection = document.getElementById('qr-fleet-section');

    // QR Quick Compare count-only option
    this.qrQuickCompareCountOption = document.getElementById('qr-option-quickcompare-count') as HTMLInputElement | null;
    this.qrQuickCompareCountDetail = document.getElementById('qr-option-quickcompare-count-detail');
    this.qrQcCountSection = document.getElementById('qr-qc-count-section');
    this.qrQcCountInput = document.getElementById('qr-qc-count-input') as HTMLInputElement | null;
    this.qrQcCountUrlPreview = document.getElementById('qr-qc-count-url-preview');

    // Count-only chip buttons for QR
    const qrCountChips = document.getElementById('qr-qc-count-chips');
    if (qrCountChips) {
      qrCountChips.querySelectorAll('.qc-count-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const count = parseInt((chip as HTMLElement).dataset.count || '0', 10);
          if (count >= 2 && count <= 30) {
            this.qrQcCountSelectedValue = count;
            qrCountChips.querySelectorAll('.qc-count-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            if (this.qrQcCountInput) this.qrQcCountInput.value = '';
            this.updateQrQcCountUrlPreview();
            void this.generateQrPreview();
          }
        });
      });
    }

    if (this.qrQcCountInput) {
      this.qrQcCountInput.addEventListener('input', () => {
        const val = parseInt(this.qrQcCountInput!.value, 10);
        qrCountChips?.querySelectorAll('.qc-count-chip').forEach(c => c.classList.remove('active'));
        if (!isNaN(val) && val >= 2 && val <= 30) {
          this.qrQcCountSelectedValue = val;
          qrCountChips?.querySelectorAll('.qc-count-chip').forEach(c => {
            if ((c as HTMLElement).dataset.count === String(val)) c.classList.add('active');
          });
        } else {
          this.qrQcCountSelectedValue = 0;
        }
        this.updateQrQcCountUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Radio button changes trigger QR regeneration
    const qrRadios = [this.qrGenericOption, this.qrSpecificOption, this.qrFleetOption, this.qrQuickCompareCountOption];
    for (const radio of qrRadios) {
      if (radio) {
        radio.addEventListener('change', () => {
          this.updateQrFleetVisibility();
          this.updateQrDbUrlPreview();
          this.updateQrQcCountVisibility();
          void this.generateQrPreview();
        });
      }
    }

    // Fleet select change triggers QR regeneration
    if (this.qrFleetSelect) {
      this.qrFleetSelect.addEventListener('change', () => {
        this.updateQrDbUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Customer ID input changes trigger QR regeneration
    if (this.qrCustomerIdInput) {
      this.qrCustomerIdInput.addEventListener('input', () => {
        this.updateQrDbUrlPreview();
        void this.generateQrPreview();
      });
    }

    // Download button
    if (this.qrDownloadBtn) {
      this.qrDownloadBtn.addEventListener('click', () => this.downloadQrCode());
    }

    // Print button
    if (this.qrPrintBtn) {
      this.qrPrintBtn.addEventListener('click', () => this.printQrCode());
    }
  }

  private openQrModal(): void {
    if (!this.qrModal) {
      return;
    }

    // Close settings modal if open (same pattern as NFC)
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
      settingsModal.style.display = 'none';
    }

    this.updateQrSpecificOption();
    // Ensure field visibility matches the currently selected radio option
    this.updateQrFleetVisibility();
    this.updateQrQcCountVisibility();
    this.updateQrDbUrlPreview();
    this.qrModal.style.display = 'flex';

    // Generate initial QR code
    void this.generateQrPreview();
  }

  private closeQrModal(): void {
    if (this.qrModal) {
      this.qrModal.style.display = 'none';
    }
  }

  private updateQrSpecificOption(): void {
    if (!this.qrSpecificOption || !this.qrSpecificDetail) {
      return;
    }

    if (this.currentMachine) {
      this.qrSpecificOption.disabled = false;
      this.qrSpecificDetail.textContent = t('qrCode.optionSpecificDetail', {
        name: this.currentMachine.name,
        id: this.currentMachine.id,
      });
    } else {
      this.qrSpecificOption.disabled = true;
      if (this.qrGenericOption) {
        this.qrGenericOption.checked = true;
      }
      this.qrSpecificDetail.textContent = t('qrCode.optionSpecificUnavailable');
    }
  }

  private updateQrDbUrlPreview(): void {
    if (!this.qrDbUrlPreview || !this.qrCustomerIdInput) {
      return;
    }

    const selectedOption = this.qrQuickCompareCountOption?.checked ? 'quickcompare-count'
      : this.qrFleetOption?.checked ? 'fleet'
      : this.qrSpecificOption?.checked ? 'specific'
      : 'generic';

    // Generic or count-only link: no data URL preview needed
    if (selectedOption === 'generic' || selectedOption === 'quickcompare-count') {
      this.qrDbUrlPreview.style.display = 'none';
      return;
    }

    const customerId = this.qrCustomerIdInput.value.trim();
    if (!customerId) {
      this.qrDbUrlPreview.style.display = 'none';
      return;
    }

    let dataUrl: string;
    if (selectedOption === 'fleet') {
      const fleetName = this.qrFleetSelect?.value;
      if (!fleetName) {
        this.qrDbUrlPreview.style.display = 'none';
        return;
      }
      const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
      dataUrl = `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(customerId)}/fleet-${fleetId}.json`;
    } else {
      dataUrl = HashRouter.buildDbUrlFromCustomerId(customerId);
    }

    this.qrDbUrlPreview.textContent = t('qrCode.dbUrlPreview', { url: dataUrl });
    this.qrDbUrlPreview.style.display = 'block';
  }

  private async updateQrFleetVisibility(): Promise<void> {
    const isFleet = this.qrFleetOption?.checked;

    if (this.qrFleetSection) {
      this.qrFleetSection.style.display = isFleet ? 'block' : 'none';
    }

    if (isFleet && this.qrFleetSelect) {
      const machines = await getAllMachines();
      const groups = new Map<string, number>();
      for (const m of machines) {
        if (m.fleetGroup) {
          groups.set(m.fleetGroup, (groups.get(m.fleetGroup) || 0) + 1);
        }
      }

      this.qrFleetSelect.innerHTML = '';
      if (groups.size === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('nfc.noFleets');
        this.qrFleetSelect.appendChild(opt);
      } else {
        for (const [name, count] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = `${name} (${count} ${count === 1 ? t('nfc.machine') : t('nfc.machines')})`;
          this.qrFleetSelect.appendChild(opt);
        }
      }
    }
  }

  private updateQrQcCountVisibility(): void {
    const isCountOnly = this.qrQuickCompareCountOption?.checked;
    if (this.qrQcCountSection) {
      this.qrQcCountSection.style.display = isCountOnly ? 'block' : 'none';
    }
    // Hide customer ID section when count-only is selected (no internet needed)
    if (this.qrCustomerIdSection) {
      this.qrCustomerIdSection.style.display = isCountOnly ? 'none' : '';
    }
  }

  private updateQrQcCountUrlPreview(): void {
    if (!this.qrQcCountUrlPreview) return;

    if (this.qrQcCountSelectedValue >= 2 && this.qrQcCountSelectedValue <= 30) {
      const url = HashRouter.getFullQuickCompareCountUrl(this.qrQcCountSelectedValue);
      this.qrQcCountUrlPreview.textContent = url;
      this.qrQcCountUrlPreview.style.display = 'block';

      // Update detail text
      if (this.qrQuickCompareCountDetail) {
        this.qrQuickCompareCountDetail.textContent = t('qrCode.optionQuickCompareCountDetail', {
          count: String(this.qrQcCountSelectedValue),
        });
      }
    } else {
      this.qrQcCountUrlPreview.style.display = 'none';
    }
  }

  private getQrUrl(): string {
    const selectedOption = this.qrQuickCompareCountOption?.checked ? 'quickcompare-count'
      : this.qrFleetOption?.checked ? 'fleet'
      : this.qrSpecificOption?.checked ? 'specific'
      : 'generic';
    const baseUrl = this.getBaseAppUrl();

    if (selectedOption === 'quickcompare-count') {
      if (this.qrQcCountSelectedValue >= 2 && this.qrQcCountSelectedValue <= 30) {
        return HashRouter.getFullQuickCompareCountUrl(this.qrQcCountSelectedValue);
      }
      return baseUrl;
    }

    if (selectedOption === 'fleet') {
      const fleetName = this.qrFleetSelect?.value;
      const customerId = this.qrCustomerIdInput?.value.trim();
      if (fleetName && customerId) {
        const fleetId = ReferenceDbService.slugifyFleetName(fleetName);
        return HashRouter.getFullFleetUrl(fleetId, customerId);
      }
      return baseUrl;
    }

    if (selectedOption === 'specific' && this.currentMachine) {
      const customerId = this.qrCustomerIdInput?.value.trim() || '';
      if (customerId) {
        return HashRouter.getFullMachineUrl(this.currentMachine.id, customerId);
      }
      // Without customerId, use base URL with machine hash only
      return `${baseUrl}#/m/${encodeURIComponent(this.currentMachine.id)}`;
    }

    return baseUrl;
  }

  private async generateQrPreview(): Promise<void> {
    if (!this.qrCanvas || !this.qrPreviewContainer) {
      return;
    }

    const url = this.getQrUrl();
    this.qrCurrentUrl = url;

    try {
      await QRCode.toCanvas(this.qrCanvas, url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      // Show preview and action buttons
      this.qrPreviewContainer.style.display = 'block';
      if (this.qrDownloadBtn) this.qrDownloadBtn.style.display = '';
      if (this.qrPrintBtn) this.qrPrintBtn.style.display = '';

      // Update URL preview
      if (this.qrUrlPreview) {
        this.qrUrlPreview.textContent = url;
      }

      // Update label info
      if (this.qrLabelInfo) {
        const selectedOption = this.qrQuickCompareCountOption?.checked ? 'quickcompare-count'
          : this.qrFleetOption?.checked ? 'fleet'
          : this.qrSpecificOption?.checked ? 'specific'
          : 'generic';
        if (selectedOption === 'quickcompare-count' && this.qrQcCountSelectedValue >= 2) {
          this.qrLabelInfo.innerHTML =
            `<strong>${t('quickCompare.startButton')}:</strong> ${this.qrQcCountSelectedValue} ${t('nfc.machines')}`;
        } else if (selectedOption === 'fleet' && this.qrFleetSelect?.value) {
          this.qrLabelInfo.innerHTML =
            `<strong>${t('qrCode.fleetLabel')}:</strong> ${escapeHtml(this.qrFleetSelect.value)}`;
        } else if (selectedOption === 'specific' && this.currentMachine) {
          this.qrLabelInfo.innerHTML =
            `<strong>${t('qrCode.machineLabel')}:</strong> ${escapeHtml(this.currentMachine.name)}<br>` +
            `<strong>${t('qrCode.machineIdLabel')}:</strong> ${escapeHtml(this.currentMachine.id)}`;
        } else {
          this.qrLabelInfo.innerHTML = `<strong>${t('qrCode.genericLabel')}</strong>`;
        }
      }
    } catch (error) {
      logger.error('Failed to generate QR code:', error);
    }
  }

  private downloadQrCode(): void {
    if (!this.qrCanvas) {
      return;
    }

    // Create a higher-resolution canvas for download (400px)
    const downloadCanvas = document.createElement('canvas');
    void QRCode.toCanvas(downloadCanvas, this.qrCurrentUrl, {
      width: 400,
      margin: 3,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).then(() => {
      const link = document.createElement('a');
      link.download = this.qrQuickCompareCountOption?.checked && this.qrQcCountSelectedValue >= 2
        ? `qr-quickcompare-${this.qrQcCountSelectedValue}.png`
        : this.qrFleetOption?.checked && this.qrFleetSelect?.value
        ? `qr-fleet-${ReferenceDbService.slugifyFleetName(this.qrFleetSelect.value)}.png`
        : this.currentMachine && this.qrSpecificOption?.checked
        ? `qr-${this.currentMachine.id}.png`
        : 'qr-zanobot.png';
      link.href = downloadCanvas.toDataURL('image/png');
      link.click();
    });
  }

  private printQrCode(): void {
    const printHeader = document.getElementById('qr-print-header');
    const printCanvas = document.getElementById('qr-print-canvas') as HTMLCanvasElement | null;
    const printDetails = document.getElementById('qr-print-details');
    const printFooter = document.getElementById('qr-print-footer');

    if (!printCanvas || !printHeader || !printDetails || !printFooter) {
      return;
    }

    const selectedOption = this.qrQuickCompareCountOption?.checked ? 'quickcompare-count'
      : this.qrFleetOption?.checked ? 'fleet'
      : this.qrSpecificOption?.checked ? 'specific'
      : 'generic';
    const isSpecific = selectedOption === 'specific' && this.currentMachine;
    const isFleet = selectedOption === 'fleet' && this.qrFleetSelect?.value;
    const isCountOnly = selectedOption === 'quickcompare-count' && this.qrQcCountSelectedValue >= 2;
    const now = new Date().toLocaleDateString();

    // Fill print label content
    if (isCountOnly) {
      printHeader.textContent = t('quickCompare.startButton');
      printDetails.innerHTML =
        `<strong>${t('quickCompare.startButton')}:</strong> ${this.qrQcCountSelectedValue} ${t('nfc.machines')}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else if (isFleet) {
      printHeader.textContent = t('qrCode.fleetPrintTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.fleetLabel')}:</strong> ${escapeHtml(this.qrFleetSelect!.value)}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else if (isSpecific && this.currentMachine) {
      printHeader.textContent = t('qrCode.printTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.machineLabel')}:</strong> ${escapeHtml(this.currentMachine.name)}<br>` +
        `<strong>${t('qrCode.machineIdLabel')}:</strong> ${escapeHtml(this.currentMachine.id)}<br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    } else {
      printHeader.textContent = t('qrCode.printTitle');
      printDetails.innerHTML =
        `<strong>${t('qrCode.genericLabel')}</strong><br>` +
        `<strong>${t('qrCode.dateLabel')}:</strong> ${now}`;
    }

    printFooter.textContent = t('qrCode.printInstructions');

    // Generate QR code on the print canvas
    void QRCode.toCanvas(printCanvas, this.qrCurrentUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).then(() => {
      // Trigger print with special body class
      document.body.classList.add('qr-printing');
      window.print();
      document.body.classList.remove('qr-printing');
    });
  }

  /**
   * ========================================
   * HARDWARE INTELLIGENCE
   * ========================================
   */

  /**
   * Initialize hardware check on page load
   *
   * SMART MICROPHONE AUTO-SELECTION:
   * 1. Request initial audio permission (gets device labels)
   * 2. Search for optimal rear/environment microphone
   * 3. Automatically switch to best mic if found
   * 4. Notify user of optimization
   */
  private async initializeHardwareCheck(): Promise<void> {
    let tempStream: MediaStream | null = null;
    try {
      // Step 1: Request initial audio permission to get device labels
      tempStream = await getRawAudioStream(this.selectedDeviceId);

      // Step 2: SMART MICROPHONE AUTO-SELECTION
      // Now that we have permission, device labels are available
      const bestMic = await HardwareCheck.findBestMicrophone();

      if (bestMic && bestMic.deviceId !== this.selectedDeviceId) {
        logger.info(`🎤 Smart Auto-Selection: Switching to "${bestMic.label}"`);

        // Stop the initial stream before switching
        tempStream.getTracks().forEach((track) => track.stop());
        tempStream = null;

        // Set the optimal microphone
        this.selectedDeviceId = bestMic.deviceId;

        // Get new stream with the optimal microphone
        tempStream = await getRawAudioStream(this.selectedDeviceId);

        // Notify user of automatic optimization (technical status, skip in basic mode)
        if (getViewLevel() !== 'basic') {
          notify.success(t('identify.success.microphoneOptimized', { label: bestMic.label }));
        }
      }

      // Step 3: Analyze the (potentially new) hardware
      const currentDevice = await HardwareCheck.getCurrentDevice(tempStream);

      if (currentDevice) {
        // Get audio track settings for sample rate
        const audioTracks = tempStream.getAudioTracks();
        if (audioTracks.length === 0) {
          logger.warn('No audio tracks found on device');
          return;
        }
        const audioTrack = audioTracks[0];
        const settings = audioTrack.getSettings();
        const sampleRate = settings.sampleRate || 44100;

        // Analyze hardware
        this.audioQualityReport = HardwareCheck.analyzeCurrentDevice(
          currentDevice.label,
          sampleRate
        );

        // Update UI
        this.updateHardwareInfoCard();
      }
    } catch (error) {
      logger.error('Failed to initialize hardware check:', error);
      // Don't block user flow - just log the error
    } finally {
      // CRITICAL FIX: Stop temporary stream after hardware check (success or failure)
      // This prevents resource leak and keeps microphone available for actual recordings
      if (tempStream) {
        tempStream.getTracks().forEach((track) => track.stop());
        tempStream = null;
      }
    }
  }

  /**
   * Update hardware info card in UI
   */
  private updateHardwareInfoCard(): void {
    if (!this.audioQualityReport) {
      return;
    }

    const statusIcon = document.getElementById('hardware-status-icon');
    const deviceLabel = document.getElementById('hardware-device-label');
    const statusText = document.getElementById('hardware-status-text');

    if (!statusIcon || !deviceLabel || !statusText) {
      return;
    }

    // Update device label
    deviceLabel.textContent = this.audioQualityReport.deviceLabel;

    // Update status icon and text
    if (this.audioQualityReport.status === 'good') {
      statusIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-healthy)" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
      statusText.textContent = this.audioQualityReport.reason;
      statusText.style.color = 'var(--status-healthy)';
    } else {
      statusIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
      statusText.textContent = this.audioQualityReport.reason;
      statusText.style.color = 'var(--status-warning)';
    }
  }

  /**
   * Show microphone selection modal
   */
  private async showMicrophoneSelection(): Promise<void> {
    try {
      // CRITICAL FIX: Close settings modal before opening microphone selection
      // This prevents the settings modal from overlaying the microphone selection modal
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && window.getComputedStyle(settingsModal).display !== 'none') {
        settingsModal.style.display = 'none';
        logger.debug('Settings modal closed before opening microphone selection');
      }

      const liveDevices = await getMicrophones();
      const devices: AudioDeviceInfo[] = liveDevices.map((device) => ({
        deviceId: device.deviceId,
        label: device.label || t('hardware.microphoneId', { id: device.deviceId.substring(0, 8) }),
        kind: device.kind,
        groupId: device.groupId,
      }));

      // Get or create modal
      const modal = document.getElementById('microphone-selection-modal');
      if (!modal) {
        logger.error('Microphone selection modal not found in DOM');
        return;
      }

      const hasSelectedDevice =
        !!this.selectedDeviceId &&
        (this.selectedDeviceId === HardwareCheck.IOS_REAR_MIC_DEVICE_ID ||
          devices.some((device) => device.deviceId === this.selectedDeviceId));

      if (this.selectedDeviceId && !hasSelectedDevice) {
        logger.warn(
          `🎤 Selected microphone "${this.selectedDeviceId}" not found in live device list.`
        );
        if (getViewLevel() !== 'basic') {
          notify.warning(t('identify.warnings.preferredMicrophoneUnavailable'));
        }
        this.selectedDeviceId = undefined;
      }

      // Populate device list
      const deviceList = document.getElementById('microphone-device-list');
      if (!deviceList) {
        logger.error('Device list container not found');
        return;
      }

      deviceList.innerHTML = '';

      devices.forEach((device) => {
        const deviceItem = document.createElement('div');
        deviceItem.className = 'microphone-device-item';
        deviceItem.dataset.deviceId = device.deviceId;

        // Check if this is the currently selected device
        const isSelected =
          this.selectedDeviceId === device.deviceId ||
          (!this.selectedDeviceId && device.deviceId === 'default');

        if (isSelected) {
          deviceItem.classList.add('selected');
        }

        // Analyze this device
        // CRITICAL FIX: Use sample rate from AUDIO_CONSTRAINTS instead of hardcoded value
        // Note: This is the requested rate - actual rate will be determined when stream is created
        const estimatedSampleRate = AUDIO_CONSTRAINTS.audio.sampleRate;
        const tempReport = HardwareCheck.analyzeCurrentDevice(device.label, estimatedSampleRate);
        const statusClass = tempReport.status === 'good' ? 'status-good' : 'status-warning';

        // CRITICAL FIX: Use safe DOM manipulation instead of innerHTML to prevent XSS
        // Create device info container
        const deviceInfo = document.createElement('div');
        deviceInfo.className = 'device-info';

        // Create device icon with status
        const deviceIcon = document.createElement('div');
        deviceIcon.className = `device-icon ${statusClass}`;

        // Add appropriate SVG based on status (safe static content)
        if (tempReport.status === 'good') {
          deviceIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>`;
        } else {
          deviceIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>`;
        }

        // Create device details container
        const deviceDetails = document.createElement('div');
        deviceDetails.className = 'device-details';

        // Use textContent instead of innerHTML to prevent XSS attacks
        const deviceName = document.createElement('div');
        deviceName.className = 'device-name';
        deviceName.textContent = device.label; // SAFE - textContent escapes HTML

        const deviceStatus = document.createElement('div');
        deviceStatus.className = 'device-status';
        deviceStatus.textContent = tempReport.reason; // SAFE - textContent escapes HTML

        // Assemble the structure
        deviceDetails.appendChild(deviceName);
        deviceDetails.appendChild(deviceStatus);
        deviceInfo.appendChild(deviceIcon);
        deviceInfo.appendChild(deviceDetails);
        deviceItem.appendChild(deviceInfo);

        // Add checkmark for selected device
        if (isSelected) {
          const checkmark = document.createElement('div');
          checkmark.className = 'device-checkmark';
          checkmark.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
          deviceItem.appendChild(checkmark);
        }

        deviceItem.addEventListener('click', () => this.selectMicrophone(device));
        deviceList.appendChild(deviceItem);
      });

      // Show modal
      modal.style.display = 'flex';

      // Setup close handlers
      const closeBtn = document.getElementById('close-microphone-modal');
      if (closeBtn) {
        closeBtn.onclick = () => this.closeMicrophoneModal();
      }

      modal.onclick = (e) => {
        if (e.target === modal) {
          this.closeMicrophoneModal();
        }
      };
    } catch (error) {
      logger.error('Failed to show microphone selection:', error);
      this.showError(t('identify.errors.microphoneLoad'));
    }
  }

  /**
   * Select a microphone
   */
  private async selectMicrophone(device: AudioDeviceInfo): Promise<void> {
    try {
      logger.info(`Selecting microphone: ${device.label}`);

      // Stop current stream
      if (this.currentAudioStream) {
        this.currentAudioStream.getTracks().forEach((track) => track.stop());
      }

      // Update selected device
      this.selectedDeviceId = device.deviceId;

      // Get new stream with selected device
      this.currentAudioStream = await getRawAudioStream(device.deviceId);

      // Re-analyze hardware
      const audioTracks = this.currentAudioStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available on selected device');
      }
      const audioTrack = audioTracks[0];
      const settings = audioTrack.getSettings();
      const sampleRate = settings.sampleRate || 44100;

      this.audioQualityReport = HardwareCheck.analyzeCurrentDevice(device.label, sampleRate);

      // Update UI
      this.updateHardwareInfoCard();

      // Close modal
      this.closeMicrophoneModal();

      // Notify user
      notify.success(t('identify.success.microphoneChanged', { label: device.label }));
    } catch (error) {
      logger.error('Failed to select microphone:', error);
      this.showError(t('identify.errors.microphoneSwitch'));
    }
  }

  /**
   * Close microphone selection modal
   */
  private closeMicrophoneModal(): void {
    const modal = document.getElementById('microphone-selection-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Get selected device ID for recording
   * Called by other phases that need to record audio
   */
  public getSelectedDeviceId(): string | undefined {
    return this.selectedDeviceId;
  }

  /**
   * ========================================
   * MACHINE HISTORY / QUICK SELECT
   * ========================================
   */

  /**
   * Load machine history and render quick select list
   */
  private async loadMachineHistory(): Promise<void> {
    try {
      // Get all machines from database
      const machines = await getAllMachines();

      // Filter machines that have at least one trained model
      const trainedMachines = machines.filter(
        (machine) => machine.referenceModels && machine.referenceModels.length > 0
      );

      // Sort by most recent training date (newest first)
      trainedMachines.sort((a, b) => {
        // Get latest training date for each machine (defensive: handle edge cases)
        const aLatestDate =
          a.referenceModels.length > 0
            ? Math.max(...a.referenceModels.map((m) => m.trainingDate || 0))
            : 0;
        const bLatestDate =
          b.referenceModels.length > 0
            ? Math.max(...b.referenceModels.map((m) => m.trainingDate || 0))
            : 0;
        return bLatestDate - aLatestDate;
      });

      // Render the quick select list (max 10 machines)
      this.renderQuickSelectList(trainedMachines.slice(0, 10));
    } catch (error) {
      logger.error('Failed to load machine history:', error);
      // Don't show error to user - just hide the quick select section
      this.hideQuickSelectSection();
    }
  }

  /**
   * Render quick select list with recent machines
   */
  private renderQuickSelectList(machines: Machine[]): void {
    const quickSelectSection = document.getElementById('quick-select-section');
    const quickSelectList = document.getElementById('quick-select-list');

    if (!quickSelectSection || !quickSelectList) {
      logger.warn('Quick select elements not found in DOM');
      return;
    }

    // Hide section if no machines available
    if (machines.length === 0) {
      quickSelectSection.style.display = 'none';
      return;
    }

    // Show section
    quickSelectSection.style.display = 'block';

    // Clear existing list
    quickSelectList.innerHTML = '';

    // Render each machine
    machines.forEach((machine) => {
      const machineItem = document.createElement('div');
      machineItem.className = 'quick-select-item';
      machineItem.dataset.machineId = machine.id;

      // Create machine info
      const machineInfo = document.createElement('div');
      machineInfo.className = 'quick-select-item-info';

      const machineName = document.createElement('div');
      machineName.className = 'quick-select-machine-name';
      machineName.textContent = machine.name;

      const machineId = document.createElement('div');
      machineId.className = 'quick-select-machine-id';
      machineId.textContent = machine.id;

      machineInfo.appendChild(machineName);
      machineInfo.appendChild(machineId);

      // Create chevron icon
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('width', '20');
      chevron.setAttribute('height', '20');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2');
      chevron.style.color = 'var(--text-muted)';
      chevron.style.flexShrink = '0';

      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', '9 18 15 12 9 6');
      chevron.appendChild(polyline);

      // Assemble item
      machineItem.appendChild(machineInfo);
      machineItem.appendChild(chevron);

      // Add click handler
      machineItem.addEventListener('click', () => this.handleQuickSelect(machine));

      // Add to list
      quickSelectList.appendChild(machineItem);
    });
  }

  /**
   * Handle quick select machine click
   */
  private async handleQuickSelect(machine: Machine): Promise<void> {
    try {
      logger.info(`Quick select: ${machine.name} (${machine.id})`);

      // Reload machine from DB to get latest state
      const freshMachine = await getMachine(machine.id);
      if (!freshMachine) {
        this.showError(t('identify.errors.machineNotFound'));
        await this.refreshMachineLists();
        return;
      }

      this.showMachineDetailModal(freshMachine);
    } catch (error) {
      logger.error('Failed to quick select machine:', error);
      this.showError(t('identify.errors.machineLoad'));
    }
  }

  /**
   * Hide quick select section
   */
  private hideQuickSelectSection(): void {
    const quickSelectSection = document.getElementById('quick-select-section');
    if (quickSelectSection) {
      quickSelectSection.style.display = 'none';
    }
  }

  /**
   * ========================================
   * SPRINT 4 UX: FLEET CHECK MODE
   * ========================================
   */

  /**
   * Sprint 4 UX: Initialize workflow mode toggle buttons
   */
  private initWorkflowToggle(): void {
    const seriesBtn = document.getElementById('toggle-series');
    const fleetBtn = document.getElementById('toggle-fleet');

    if (seriesBtn) {
      seriesBtn.textContent = t('fleet.toggle.series');
      seriesBtn.addEventListener('click', () => this.setWorkflowMode('series'));
    }
    if (fleetBtn) {
      fleetBtn.textContent = t('fleet.toggle.fleet');
      fleetBtn.addEventListener('click', () => this.setWorkflowMode('fleet'));
    }
  }

  /**
   * Sprint 4 UX: Switch workflow mode and re-render machine list
   */
  private async setWorkflowMode(mode: 'series' | 'fleet'): Promise<void> {
    if (this.currentWorkflowMode === mode) return;

    this.currentWorkflowMode = mode;

    // Update toggle button states
    const seriesBtn = document.getElementById('toggle-series');
    const fleetBtn = document.getElementById('toggle-fleet');
    if (seriesBtn) {
      seriesBtn.classList.toggle('toggle-btn-active', mode === 'series');
      seriesBtn.setAttribute('aria-pressed', String(mode === 'series'));
    }
    if (fleetBtn) {
      fleetBtn.classList.toggle('toggle-btn-active', mode === 'fleet');
      fleetBtn.setAttribute('aria-pressed', String(mode === 'fleet'));
    }

    // Sprint 5: Update CTA button text based on mode
    const addBtn = document.getElementById('add-new-machine-btn');
    if (addBtn) {
      const label = addBtn.querySelector('span');
      if (label) {
        label.textContent = mode === 'fleet'
          ? t('fleet.cta.newFleet')
          : t('buttons.newMachine');
      }
    }

    // Re-render machine overview with new mode
    await this.loadMachineOverview();
  }

  /**
   * Sprint 4 UX: Populate fleet group datalist with existing group names.
   * Called on init and after machine creation to keep suggestions current.
   */
  private async populateFleetGroupSuggestions(): Promise<void> {
    const datalist = document.getElementById('fleet-group-suggestions');
    if (!datalist) return;

    // Clear existing options
    datalist.innerHTML = '';

    // Collect unique fleet groups from all machines
    const machines = await getAllMachines();
    const groups = new Set<string>();
    for (const m of machines) {
      if (m.fleetGroup) {
        groups.add(m.fleetGroup);
      }
    }

    // Add as datalist options (sorted alphabetically)
    const sorted = [...groups].sort((a, b) => a.localeCompare(b));
    for (const group of sorted) {
      const option = document.createElement('option');
      option.value = group;
      datalist.appendChild(option);
    }
  }

  /**
   * Sprint 4 UX: Get machines for fleet ranking.
   * Primary: Filter by fleetGroup. Fallback: Last 24h diagnoses.
   */
  private async getFleetMachines(allMachines: Machine[]): Promise<{
    machines: Machine[];
    groupName: string;
    isTimeFallback: boolean;
  }> {
    // Collect all unique fleet groups
    const groups = new Map<string, Machine[]>();
    for (const m of allMachines) {
      if (m.fleetGroup) {
        const list = groups.get(m.fleetGroup) || [];
        list.push(m);
        groups.set(m.fleetGroup, list);
      }
    }

    // If groups exist, use the largest one
    if (groups.size > 0) {
      let bestGroup = '';
      let bestSize = 0;
      for (const [name, members] of groups) {
        if (members.length > bestSize) {
          bestGroup = name;
          bestSize = members.length;
        }
      }
      return {
        machines: groups.get(bestGroup) || [],
        groupName: bestGroup,
        isTimeFallback: false,
      };
    }

    // Fallback: machines with diagnosis in last 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentChecks = await Promise.all(
      allMachines.map(async (m) => {
        // Fast path: lastDiagnosisAt exists and is recent
        if (m.lastDiagnosisAt && m.lastDiagnosisAt > cutoff) {
          return m;
        }
        // Slow path: field missing – query DB for actual latest diagnosis
        if (!m.lastDiagnosisAt) {
          const latest = await getLatestDiagnosis(m.id);
          if (latest && latest.timestamp > cutoff) {
            return m;
          }
        }
        return null;
      })
    );
    const recentMachines = recentChecks.filter((m): m is Machine => m !== null);

    return {
      machines: recentMachines,
      groupName: t('fleet.group.recent24h'),
      isTimeFallback: true,
    };
  }

  /**
   * Sprint 4 UX: Fleet statistics interface
   */
  private calculateFleetStats(scores: number[]): {
    median: number;
    mad: number;
    outlierThreshold: number;
    min: number;
    max: number;
    spread: number;
    count: number;
  } | null {
    if (scores.length < 2) return null;

    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;

    // Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // MAD (Median Absolute Deviation)
    const deviations = sorted.map(s => Math.abs(s - median));
    deviations.sort((a, b) => a - b);
    const mad = deviations.length % 2 === 0
      ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
      : deviations[Math.floor(deviations.length / 2)];

    // Outlier threshold: below this = orange
    // Guard: if MAD is 0 (all scores identical), threshold = median - 5
    const effectiveMAD = mad > 0 ? mad : 2.5;
    const outlierThreshold = median - 2 * effectiveMAD;

    return {
      median,
      mad,
      outlierThreshold,
      min: sorted[0],
      max: sorted[n - 1],
      spread: sorted[n - 1] - sorted[0],
      count: n,
    };
  }

  /**
   * Sprint 4 UX: Render fleet ranking view
   */
  private async renderFleetRanking(allMachines: Machine[]): Promise<void> {
    const overviewContainer = document.getElementById('machine-overview');
    const emptyState = document.getElementById('machine-overview-empty');
    if (!overviewContainer) return;

    // Get fleet machines
    const { machines, groupName, isTimeFallback } = await this.getFleetMachines(allMachines);

    // Collect scores (parallel DB reads)
    const ranked = await Promise.all(
      machines.map(async (machine) => {
        const diagnosis = await getLatestDiagnosis(machine.id);
        return {
          machine,
          score: diagnosis ? diagnosis.healthScore : null,
          diagnosis: diagnosis ?? null,
        };
      })
    );

    // Sort: lowest score first (outlier at top), null-scores at bottom
    ranked.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });

    // Calculate statistics (only from machines with scores)
    const scores = ranked.map(r => r.score).filter((s): s is number => s !== null);
    const stats = this.calculateFleetStats(scores);

    // Fix: Minimum fleet size check – at least 2 machines for meaningful ranking
    if (ranked.length < 2) {
      if (emptyState) {
        emptyState.style.display = ranked.length === 0 ? 'block' : 'none';
      }
      const hint = document.createElement('div');
      hint.className = 'fleet-minimum-hint';
      hint.innerHTML = `<p>${t('fleet.ranking.minimumHint')}</p>`;
      if (emptyState) {
        overviewContainer.insertBefore(hint, emptyState);
      } else {
        overviewContainer.appendChild(hint);
      }
      // Still show the single machine as a regular item (without ranking context)
      if (ranked.length === 1) {
        const item = this.createFleetRankingItem(ranked[0].machine, ranked[0].score, null, false);
        if (emptyState) {
          overviewContainer.insertBefore(item, emptyState);
        } else {
          overviewContainer.appendChild(item);
        }
      }
      return;
    }

    // Sprint 5: Pre-compute Gold Standard for badge display
    this.currentGoldStandardId = null;
    const refSourceIds = machines.map(m => m.fleetReferenceSourceId).filter(Boolean);
    if (refSourceIds.length > 0) {
      const counts = new Map<string, number>();
      for (const id of refSourceIds) {
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      let maxCount = 0;
      for (const [id, count] of counts) {
        if (count > maxCount) {
          this.currentGoldStandardId = id;
          maxCount = count;
        }
      }
    }

    // Show/hide empty state
    if (emptyState) {
      emptyState.style.display = ranked.length === 0 ? 'block' : 'none';
    }

    // Update empty state text for fleet mode
    if (ranked.length === 0 && emptyState) {
      const titleEl = emptyState.querySelector('.empty-state-title');
      if (titleEl) {
        titleEl.textContent = t('fleet.group.noMachines');
      }
    }

    // Render fleet header (Maßnahme 4)
    if (stats && ranked.length >= 2) {
      this.renderFleetHeader(overviewContainer, stats, groupName, ranked.length);
    }

    // Sprint 5 Polish: Show hint when only 1 machine in fleet (no meaningful comparison)
    if (ranked.length === 1) {
      const hint = document.createElement('p');
      hint.className = 'fleet-single-machine-hint';
      hint.textContent = t('fleet.ranking.singleMachineHint');
      if (emptyState) {
        overviewContainer.insertBefore(hint, emptyState);
      } else {
        overviewContainer.appendChild(hint);
      }
    }

    // Render ranking items
    for (const item of ranked) {
      const isOutlier = stats !== null && item.score !== null
        ? item.score < stats.outlierThreshold
        : false;
      const rankItem = this.createFleetRankingItem(item.machine, item.score, stats, isOutlier);
      if (emptyState) {
        overviewContainer.insertBefore(rankItem, emptyState);
      } else {
        overviewContainer.appendChild(rankItem);
      }
    }

    // Sprint 4 UX: Quick Fleet – show "Save as fleet" CTA
    if (isTimeFallback && ranked.length >= 2) {
      const untagged = ranked.filter(r => !r.machine.fleetGroup);
      if (untagged.length >= 2) {
        this.renderQuickFleetSaveCTA(overviewContainer, untagged.map(r => r.machine));
      }
    }

    // Sprint 5 UX: "Flotte prüfen" button (only if machines have references)
    const machinesWithRef = ranked.filter(r =>
      r.machine.referenceModels && r.machine.referenceModels.length > 0
    );
    if (machinesWithRef.length >= 2) {
      const checkAllBtn = document.createElement('button');
      checkAllBtn.className = 'action-btn fleet-check-all-btn';
      checkAllBtn.textContent = t('fleet.queue.startButton', {
        count: String(machinesWithRef.length),
      });
      checkAllBtn.addEventListener('click', () => {
        const ids = machinesWithRef.map(r => r.machine.id);
        if (this.onStartFleetQueue) {
          this.onStartFleetQueue(ids, groupName);
        }
      });
      if (emptyState) {
        overviewContainer.insertBefore(checkAllBtn, emptyState);
      } else {
        overviewContainer.appendChild(checkAllBtn);
      }
    }
  }

  /**
   * Sprint 4 UX: Create a single fleet ranking item
   */
  private createFleetRankingItem(
    machine: Machine,
    score: number | null,
    stats: { median: number; mad: number; outlierThreshold: number; min: number; max: number; spread: number; count: number } | null,
    isOutlier: boolean
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = `fleet-rank-item${isOutlier ? ' fleet-outlier' : ''}`;
    item.dataset.machineId = machine.id;

    // Machine name
    const nameEl = document.createElement('div');
    nameEl.className = 'fleet-rank-name';
    nameEl.textContent = machine.name;

    // Sprint 5: Gold Standard indicator
    if (this.currentGoldStandardId === machine.id) {
      const goldBadge = document.createElement('span');
      goldBadge.className = 'fleet-gold-badge';
      goldBadge.textContent = '\u{1F3C6}';
      goldBadge.title = t('fleet.goldStandard.badge');
      nameEl.appendChild(goldBadge);
    }

    // Score bar container
    const barContainer = document.createElement('div');
    barContainer.className = 'fleet-rank-bar-container';

    if (score !== null && stats) {
      // Score bar (width proportional to score, 0–100%)
      const bar = document.createElement('div');
      bar.className = `fleet-rank-bar${isOutlier ? ' fleet-rank-bar-outlier' : ''}`;
      bar.style.width = `${Math.max(score, 2)}%`; // Min 2% for visibility

      barContainer.appendChild(bar);

      // Score label
      const scoreLabel = document.createElement('span');
      scoreLabel.className = `fleet-rank-score${isOutlier ? ' fleet-rank-score-outlier' : ''}`;
      scoreLabel.textContent = isOutlier ? `\u26A0 ${score.toFixed(0)}%` : `${score.toFixed(0)}%`;

      barContainer.appendChild(scoreLabel);
    } else {
      // No diagnosis
      const noData = document.createElement('span');
      noData.className = 'fleet-rank-nodata';
      noData.textContent = t('fleet.ranking.noData');
      barContainer.appendChild(noData);
    }

    item.appendChild(nameEl);
    item.appendChild(barContainer);

    // Click handler: select machine (same as series mode)
    item.addEventListener('click', () => {
      this.handleMachineSelect(machine);
    });

    return item;
  }

  /**
   * Sprint 4 UX: Render fleet statistics header
   */
  private renderFleetHeader(
    container: HTMLElement,
    stats: { median: number; mad: number; outlierThreshold: number; min: number; max: number; spread: number; count: number },
    groupName: string,
    machineCount: number
  ): void {
    // Remove existing header if re-rendering
    const existing = container.querySelector('.fleet-header');
    if (existing) existing.remove();

    const header = document.createElement('div');
    header.className = 'fleet-header';

    // Group name + count
    const titleEl = document.createElement('div');
    titleEl.className = 'fleet-header-title';
    titleEl.textContent = `${groupName} (${machineCount})`;

    // Sprint 5 UX: Help icon in fleet header
    const helpBtn = document.createElement('button');
    helpBtn.className = 'help-icon-btn help-icon-inline';
    helpBtn.setAttribute('aria-label', t('help.fleetRanking.title'));
    helpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`;
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.fleetRanking.title'),
        content: t('help.fleetRanking.body'),
        icon: 'ℹ️',
      });
    });

    // Fleet export button (for NFC/QR provisioning)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'help-icon-btn help-icon-inline';
    exportBtn.setAttribute('aria-label', t('fleet.export.button'));
    exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.exportCurrentFleet(groupName);
    });

    const titleRow = document.createElement('div');
    titleRow.className = 'fleet-header-title-row';
    titleRow.appendChild(titleEl);
    titleRow.appendChild(exportBtn);
    titleRow.appendChild(helpBtn);

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'fleet-header-stats';

    const medianStat = document.createElement('span');
    medianStat.className = 'fleet-stat';
    medianStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.median'))}</span><span class="fleet-stat-value">${stats.median.toFixed(0)}%</span>`;

    const worstStat = document.createElement('span');
    worstStat.className = 'fleet-stat';
    worstStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.worst'))}</span><span class="fleet-stat-value fleet-stat-worst">${stats.min.toFixed(0)}%</span>`;

    const spreadStat = document.createElement('span');
    spreadStat.className = 'fleet-stat';
    spreadStat.innerHTML = `<span class="fleet-stat-label">${escapeHtml(t('fleet.stats.spread'))}</span><span class="fleet-stat-value">${stats.spread.toFixed(0)}%</span>`;

    statsRow.appendChild(medianStat);
    statsRow.appendChild(worstStat);
    statsRow.appendChild(spreadStat);

    header.appendChild(titleRow);
    header.appendChild(statsRow);

    // Insert at top of container
    container.insertBefore(header, container.firstChild);
  }

  /**
   * Export current fleet as JSON file for NFC/QR provisioning.
   */
  private async exportCurrentFleet(groupName: string): Promise<void> {
    const result = await ReferenceDbService.exportFleet(groupName);
    if (!result) {
      notify.error(t('fleet.export.failed'));
      return;
    }

    // Trigger download
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notify.success(t('fleet.export.success', { name: groupName }));
  }

  /**
   * Activate fleet mode from external trigger (e.g., NFC fleet provisioning).
   * Sprint 6: Also called after fleet deep link provisioning to auto-navigate to fleet ranking.
   */
  public async activateFleetMode(fleetName?: string): Promise<void> {
    if (this.currentWorkflowMode !== 'fleet') {
      await this.setWorkflowMode('fleet');
    } else {
      await this.loadMachineOverview();
    }
    await this.populateFleetGroupSuggestions();

    if (fleetName) {
      logger.info(`🚢 Fleet mode activated for: "${fleetName}"`);
    }
  }

  /**
   * Sprint 4 UX: Render "Save as fleet" CTA below Quick Fleet ranking.
   */
  private renderQuickFleetSaveCTA(container: HTMLElement, machines: Machine[]): void {
    // Remove existing CTA if re-rendering
    const existing = container.querySelector('.fleet-save-cta');
    if (existing) existing.remove();

    const ctaContainer = document.createElement('div');
    ctaContainer.className = 'fleet-save-cta';

    const hint = document.createElement('span');
    hint.className = 'fleet-save-cta-hint';
    hint.textContent = t('fleet.quickSave.hint');

    const btn = document.createElement('button');
    btn.className = 'fleet-save-cta-btn';
    btn.textContent = t('fleet.quickSave.button');
    btn.setAttribute('aria-label', t('fleet.quickSave.button'));

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showQuickFleetSaveDialog(machines);
    });

    ctaContainer.appendChild(hint);
    ctaContainer.appendChild(btn);
    container.appendChild(ctaContainer);
  }

  /**
   * Sprint 4 UX: Show dialog to name and save the Quick Fleet as a persistent group.
   */
  private async showQuickFleetSaveDialog(machines: Machine[]): Promise<void> {
    const groupName = prompt(t('fleet.quickSave.prompt'));
    if (!groupName || !groupName.trim()) return;

    const trimmed = groupName.trim();

    // Bulk-assign fleetGroup to all machines
    for (const machine of machines) {
      machine.fleetGroup = trimmed;
      await saveMachine(machine);
    }

    // Update autocomplete suggestions
    await this.populateFleetGroupSuggestions();

    // Re-render fleet ranking (now uses tag-based grouping)
    await this.loadMachineOverview();

    // Notify user
    notify.success(t('fleet.quickSave.success', {
      count: String(machines.length),
      name: trimmed,
    }));
  }

  /**
   * Sprint 5 UX: Show fleet creation modal with multi-select machine list
   */
  private async showFleetCreationModal(): Promise<void> {
    const allMachines = await getAllMachines();
    if (allMachines.length === 0) {
      notify.info(t('fleet.create.noMachines'));
      return;
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'fleet-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('fleet.create.title'));

    // Header
    const header = document.createElement('div');
    header.className = 'fleet-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'fleet-modal-title';
    titleEl.textContent = t('fleet.create.title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottomsheet-close fleet-modal-close';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    closeBtn.textContent = '\u2715';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Group name input
    const nameSection = document.createElement('div');
    nameSection.className = 'fleet-modal-section';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label';
    nameLabel.textContent = t('fleet.create.nameLabel');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'machine-input fleet-modal-name-input';
    nameInput.placeholder = t('fleet.create.namePlaceholder');
    nameInput.setAttribute('list', 'fleet-group-suggestions');
    nameInput.maxLength = 50;
    nameInput.autocomplete = 'off';

    nameSection.appendChild(nameLabel);
    nameSection.appendChild(nameInput);

    // Machine list with checkboxes
    const listSection = document.createElement('div');
    listSection.className = 'fleet-modal-section';

    const listLabel = document.createElement('label');
    listLabel.className = 'form-label';
    listLabel.textContent = t('fleet.create.selectMachines');
    listSection.appendChild(listLabel);

    const machineList = document.createElement('div');
    machineList.className = 'fleet-modal-machine-list';

    for (const machine of allMachines) {
      const item = document.createElement('label');
      item.className = 'fleet-modal-machine-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = machine.id;
      checkbox.className = 'fleet-modal-checkbox';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'fleet-modal-machine-name';
      nameSpan.textContent = machine.name;

      item.appendChild(checkbox);
      item.appendChild(nameSpan);
      machineList.appendChild(item);
    }
    listSection.appendChild(machineList);

    // Gold-Standard selection (Maßnahme 5)
    const goldSection = document.createElement('div');
    goldSection.className = 'fleet-modal-section fleet-modal-gold-section';
    goldSection.style.display = 'none';

    const goldLabel = document.createElement('label');
    goldLabel.className = 'form-label';
    goldLabel.textContent = t('fleet.create.goldStandard');

    const goldHint = document.createElement('p');
    goldHint.className = 'fleet-modal-hint';
    goldHint.textContent = t('fleet.create.goldHint');

    const goldSelect = document.createElement('select');
    goldSelect.className = 'machine-input fleet-modal-gold-select';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = t('fleet.create.goldNone');
    goldSelect.appendChild(defaultOpt);

    goldSection.appendChild(goldLabel);
    goldSection.appendChild(goldHint);
    goldSection.appendChild(goldSelect);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'fleet-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fleet-modal-cancel-btn';
    cancelBtn.textContent = t('buttons.cancel');

    const createBtn = document.createElement('button');
    createBtn.className = 'action-btn fleet-modal-create-btn';
    createBtn.textContent = t('fleet.create.createButton');
    createBtn.disabled = true;

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(nameSection);
    modal.appendChild(listSection);
    modal.appendChild(goldSection);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // --- Event handlers ---
    const checkboxes = machineList.querySelectorAll<HTMLInputElement>('.fleet-modal-checkbox');

    const updateState = () => {
      const checked = [...checkboxes].filter(cb => cb.checked);
      const hasName = nameInput.value.trim().length > 0;
      const hasEnoughMachines = checked.length >= 2;

      createBtn.disabled = !(hasName && hasEnoughMachines);

      // Show/hide Gold-Standard section
      goldSection.style.display = hasEnoughMachines ? 'block' : 'none';

      // Update Gold-Standard dropdown options
      if (hasEnoughMachines) {
        const currentValue = goldSelect.value;
        goldSelect.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = t('fleet.create.goldNone');
        goldSelect.appendChild(noneOpt);

        for (const cb of checked) {
          const machine = allMachines.find(m => m.id === cb.value);
          if (machine && machine.referenceModels && machine.referenceModels.length > 0) {
            const opt = document.createElement('option');
            opt.value = machine.id;
            opt.textContent = machine.name;
            goldSelect.appendChild(opt);
          }
        }
        // Restore previous selection if still valid
        if ([...goldSelect.options].some(o => o.value === currentValue)) {
          goldSelect.value = currentValue;
        }
      }
    };

    nameInput.addEventListener('input', updateState);
    checkboxes.forEach(cb => cb.addEventListener('change', updateState));

    // Close handlers
    const close = () => {
      document.removeEventListener('keydown', keydownHandler);
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    // Escape key + focus trap
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      // Focus trap: Tab cycles within modal
      if (e.key === 'Tab') {
        const focusableEls = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableEls.length === 0) return;
        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydownHandler);

    // Create handler
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;

      const selectedIds = [...checkboxes].filter(cb => cb.checked).map(cb => cb.value);
      const goldStandardId = goldSelect.value || null;

      await this.createFleetFromSelection(name, selectedIds, goldStandardId, allMachines);
      close();
    });

    // Focus name input
    requestAnimationFrame(() => nameInput.focus());
  }

  /**
   * Sprint 5 UX: Apply fleetGroup (and optional Gold-Standard) to selected machines
   */
  private async createFleetFromSelection(
    groupName: string,
    machineIds: string[],
    goldStandardId: string | null,
    allMachines: Machine[]
  ): Promise<void> {
    for (const id of machineIds) {
      const machine = allMachines.find(m => m.id === id);
      if (!machine) continue;

      machine.fleetGroup = groupName;

      // Maßnahme 5: Set shared reference source (if Gold-Standard chosen)
      if (goldStandardId && id !== goldStandardId) {
        machine.fleetReferenceSourceId = goldStandardId;
      } else if (id === goldStandardId) {
        // Gold-Standard uses its own reference
        machine.fleetReferenceSourceId = null;
      }

      await saveMachine(machine);
    }

    // Update autocomplete suggestions
    await this.populateFleetGroupSuggestions();

    // Switch to fleet mode and re-render
    this.currentWorkflowMode = 'series'; // Force mode switch
    await this.setWorkflowMode('fleet');

    notify.success(t('fleet.create.success', {
      count: String(machineIds.length),
      name: groupName,
    }));
  }

  /**
   * Sprint 5 UX: Public method for Router to trigger fleet ranking re-render
   */
  public async showFleetRanking(): Promise<void> {
    if (this.currentWorkflowMode !== 'fleet') {
      this.currentWorkflowMode = 'series'; // Force mode switch
      await this.setWorkflowMode('fleet');
    } else {
      await this.loadMachineOverview();
    }
  }

  /**
   * ========================================
   * MACHINE OVERVIEW
   * ========================================
   */

  /**
   * Load all machines and render the overview with status
   */
  private async loadMachineOverview(): Promise<void> {
    try {
      const machines = await getAllMachines();

      // Sort by most recent activity (lastDiagnosisAt or createdAt)
      machines.sort((a, b) => {
        const aTime = a.lastDiagnosisAt || a.createdAt;
        const bTime = b.lastDiagnosisAt || b.createdAt;
        return bTime - aTime;
      });

      await this.renderMachineOverview(machines);
    } catch (error) {
      logger.error('Failed to load machine overview:', error);
    }
  }

  /**
   * Render machine overview list with status
   */
  private async renderMachineOverview(machines: Machine[]): Promise<void> {
    const overviewContainer = document.getElementById('machine-overview');
    const emptyState = document.getElementById('machine-overview-empty');

    if (!overviewContainer) {
      logger.warn('Machine overview container not found');
      return;
    }

    // Clear existing items (except empty state and fleet-specific elements)
    const existingItems = overviewContainer.querySelectorAll('.machine-item, .fleet-rank-item, .fleet-header, .fleet-save-cta, .fleet-check-all-btn');
    existingItems.forEach((item) => item.remove());

    // Sprint 4 UX: Branch based on workflow mode
    if (this.currentWorkflowMode === 'fleet') {
      await this.renderFleetRanking(machines);
      return;
    }

    // --- Series mode (existing, unmodified) ---

    // Show/hide empty state
    if (emptyState) {
      emptyState.style.display = machines.length === 0 ? 'block' : 'none';
    }

    // Render each machine
    for (const machine of machines) {
      const machineItem = await this.createMachineOverviewItem(machine);
      // Insert before the empty state element
      if (emptyState) {
        overviewContainer.insertBefore(machineItem, emptyState);
      } else {
        overviewContainer.appendChild(machineItem);
      }
    }

    // Sprint 3 UX: Lazy-load sparklines after initial render
    requestAnimationFrame(() => {
      this.loadSparklines();
    });
  }

  /**
   * Create a machine overview item element
   */
  private async createMachineOverviewItem(machine: Machine): Promise<HTMLElement> {
    const machineItem = document.createElement('div');
    machineItem.className = 'machine-item';
    machineItem.dataset.machineId = machine.id;

    // Get latest diagnosis for status
    const latestDiagnosis = await getLatestDiagnosis(machine.id);

    // Determine status and label
    let statusClass = 'status-no-data';
    let statusLabel = t('status.noData');
    let timeLabel = t('status.notChecked');

    if (latestDiagnosis) {
      statusClass = `status-${latestDiagnosis.status}`;
      statusLabel = this.getStatusLabel(latestDiagnosis.status);
      timeLabel = `Letzte Prüfung ${this.formatRelativeTime(latestDiagnosis.timestamp)}`;
    } else if (machine.referenceModels && machine.referenceModels.length > 0) {
      // Has reference models but no diagnosis yet
      statusLabel = t('status.ready');
      statusClass = 'status-ready';
      timeLabel = t('identify.statesTrained', { count: String(machine.referenceModels.length) });
    }

    // Create machine info
    const machineInfo = document.createElement('div');
    machineInfo.className = 'machine-info';

    const machineName = document.createElement('h4');
    machineName.className = 'machine-name';
    machineName.textContent = machine.name;

    const machineStatus = document.createElement('p');
    machineStatus.className = `machine-status ${statusClass}`;
    machineStatus.textContent = statusLabel;

    const machineTime = document.createElement('p');
    machineTime.className = 'machine-time';
    machineTime.textContent = timeLabel;

    machineInfo.appendChild(machineName);
    machineInfo.appendChild(machineStatus);
    machineInfo.appendChild(machineTime);

    // Sprint 3 UX: Reference quality badge
    if (machine.referenceModels && machine.referenceModels.length > 0) {
      const avgBaseline = this.getAverageBaselineScore(machine);
      const rating = this.getBaselineRating(avgBaseline);
      const badgeEl = document.createElement('span');
      badgeEl.className = `ref-quality-badge ref-quality-${rating}`;
      badgeEl.textContent = t(`reference.quality.${rating}`);
      badgeEl.setAttribute('aria-label', t('reference.quality.ariaLabel', {
        rating: t(`reference.quality.${rating}`)
      }));
      machineInfo.appendChild(badgeEl);
    }

    // Sprint 3 UX: Sparkline container (filled lazily after render)
    const sparkContainer = document.createElement('div');
    sparkContainer.className = 'sparkline-container';
    sparkContainer.dataset.machineId = machine.id;
    machineInfo.appendChild(sparkContainer);

    // Create chevron icon
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'chevron-right');
    chevron.setAttribute('width', '24');
    chevron.setAttribute('height', '24');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    chevron.appendChild(polyline);

    // Sprint 1 UX: Delete button on machine card
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'machine-delete-btn';
    deleteBtn.setAttribute('aria-label', t('identify.deleteMachine'));
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>`;

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Don't trigger machine select

      const confirmed = confirm(
        t('identify.confirmDeleteMachine', { name: machine.name })
      );
      if (!confirmed) return;

      // Double confirmation for machines with recordings
      const recordings = await getRecordingsForMachine(machine.id);
      if (recordings.length > 0) {
        const doubleConfirm = confirm(
          t('identify.confirmDeleteMachineWithData', {
            name: machine.name,
            count: String(recordings.length),
          })
        );
        if (!doubleConfirm) return;
      }

      await deleteMachine(machine.id);

      // Sprint 5 Fix: Clean up Gold-Standard references pointing to deleted machine
      const allMachines = await getAllMachines();
      let goldStandardOrphans = 0;
      for (const m of allMachines) {
        if (m.fleetReferenceSourceId === machine.id) {
          m.fleetReferenceSourceId = null;
          await saveMachine(m);
          goldStandardOrphans++;
        }
      }
      if (goldStandardOrphans > 0) {
        logger.info(`Cleared Gold-Standard reference on ${goldStandardOrphans} machines after deleting ${machine.name}`);
        notify.warning(t('fleet.goldStandard.deleted', {
          name: machine.name,
          count: String(goldStandardOrphans),
        }));
      }

      notify.success(t('identify.machineDeleted', { name: machine.name }));
      await this.refreshMachineLists();
    });

    // Assemble item
    machineItem.appendChild(machineInfo);
    machineItem.appendChild(deleteBtn);
    machineItem.appendChild(chevron);

    // Add click handler
    machineItem.addEventListener('click', () => this.handleMachineSelect(machine));

    return machineItem;
  }

  /**
   * Sprint 3 UX: Calculate average baseline score across all reference models
   */
  private getAverageBaselineScore(machine: Machine): number {
    const models = machine.referenceModels || [];
    const scores = models
      .map(m => m.baselineScore)
      .filter((s): s is number => s !== undefined && s !== null);

    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  /**
   * Sprint 3 UX: Get rating category from baseline score
   */
  private getBaselineRating(score: number): 'good' | 'ok' | 'unknown' {
    if (score >= 90) return 'good';
    if (score >= 75) return 'ok';
    return 'unknown';
  }

  /**
   * Sprint 3 UX: Generate inline SVG sparkline from diagnosis scores
   * Returns an SVG element or null if not enough data
   */
  private generateSparkline(scores: number[]): SVGSVGElement | null {
    if (scores.length < 2) return null;

    const width = 80;
    const height = 24;
    const padding = 2;

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    const points = scores.map((score, i) => {
      const x = padding + (i / (scores.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (score - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const trend = scores[scores.length - 1] - scores[0];
    const strokeColor = trend >= -3
      ? 'var(--status-healthy, #4CAF50)'
      : 'var(--status-warning, #FF9800)';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'sparkline-svg');
    svg.setAttribute('aria-label', t('identify.sparkline.ariaLabel', {
      count: String(scores.length)
    }));
    svg.setAttribute('role', 'img');

    // Sprint 3 Polish: Use style properties for CSS variable colors
    // (more reliable across browsers/WebViews than SVG attributes)
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.style.stroke = strokeColor;
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);

    const lastPoint = points[points.length - 1].split(',');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', lastPoint[0]);
    dot.setAttribute('cy', lastPoint[1]);
    dot.setAttribute('r', '2.5');
    dot.style.fill = strokeColor;
    svg.appendChild(dot);

    return svg;
  }

  /**
   * Sprint 3 UX: Load sparklines for all visible machine cards (lazy, batched)
   */
  private async loadSparklines(): Promise<void> {
    const containers = Array.from(
      document.querySelectorAll('.sparkline-container[data-machine-id]')
    ) as HTMLElement[];

    const BATCH_SIZE = 3;
    for (let i = 0; i < containers.length; i += BATCH_SIZE) {
      const batch = containers.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (container) => {
          const machineId = container.dataset.machineId;
          if (!machineId) return;

          try {
            // Sprint 3 Polish: Skip if sparkline already rendered
            if (container.querySelector('.sparkline-svg')) return;

            const diagnoses = await getDiagnosesForMachine(machineId, 10);
            if (diagnoses.length >= 2) {
              const scores = [...diagnoses].reverse().map(d => d.healthScore);
              const sparkline = this.generateSparkline(scores);
              if (sparkline) {
                // Sprint 3 Polish: Clear container before appending to prevent duplicates
                container.textContent = '';
                container.appendChild(sparkline);
              }
            }
          } catch (error) {
            logger.warn(`Could not load sparkline for ${machineId}:`, error);
          }
        })
      );
    }
  }

  /**
   * Handle machine selection from overview
   */
  private async handleMachineSelect(machine: Machine): Promise<void> {
    logger.info(`Machine selected from overview: ${machine.name} (${machine.id})`);

    // Reload machine from DB to get latest state
    const freshMachine = await getMachine(machine.id);
    if (!freshMachine) {
      this.showError(t('identify.errors.machineNotFound'));
      await this.refreshMachineLists();
      return;
    }

    this.showMachineDetailModal(freshMachine);
  }

  /**
   * ========================================
   * DIAGNOSIS HISTORY
   * ========================================
   */

  /**
   * Load and render diagnosis history
   */
  private async loadDiagnosisHistory(): Promise<void> {
    try {
      // Get last 10 diagnoses across all machines
      const diagnoses = await getAllDiagnoses(10);
      await this.renderDiagnosisHistory(diagnoses);
    } catch (error) {
      logger.error('Failed to load diagnosis history:', error);
    }
  }

  /**
   * Render diagnosis history list
   */
  private async renderDiagnosisHistory(diagnoses: DiagnosisResult[]): Promise<void> {
    const historyContainer = document.getElementById('history-list');
    const emptyState = document.getElementById('history-empty');
    const historySection = document.getElementById('history-section');

    if (!historyContainer) {
      logger.warn('History container not found');
      return;
    }

    // Clear existing items (except empty state)
    const existingItems = historyContainer.querySelectorAll('.history-item');
    existingItems.forEach((item) => item.remove());

    // Show/hide empty state and section
    if (emptyState) {
      emptyState.style.display = diagnoses.length === 0 ? 'block' : 'none';
    }

    // Hide entire section if no diagnoses
    if (historySection) {
      historySection.style.display = diagnoses.length === 0 ? 'none' : 'block';
    }

    // Get machine names for display
    const machines = await getAllMachines();
    const machineMap = new Map(machines.map((m) => [m.id, m]));

    // Render each diagnosis
    for (const diagnosis of diagnoses) {
      const machine = machineMap.get(diagnosis.machineId);
      const historyItem = this.createHistoryItem(diagnosis, machine);
      // Insert before the empty state element
      if (emptyState) {
        historyContainer.insertBefore(historyItem, emptyState);
      } else {
        historyContainer.appendChild(historyItem);
      }
    }
  }

  /**
   * Create a history item element
   */
  private createHistoryItem(diagnosis: DiagnosisResult, machine?: Machine): HTMLElement {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.dataset.machineId = diagnosis.machineId;

    // Create history info
    const historyInfo = document.createElement('div');
    historyInfo.className = 'history-info';

    const machineName = document.createElement('div');
    machineName.className = 'history-machine-name';
    machineName.textContent =
      machine?.name || t('identify.messages.autoMachineName', { id: diagnosis.machineId });

    const historyDetails = document.createElement('div');
    historyDetails.className = 'history-details';

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.className = `history-status-badge status-${diagnosis.status}`;
    statusBadge.textContent = this.getStatusLabel(diagnosis.status);

    // Score
    const scoreText = document.createElement('span');
    scoreText.className = 'history-score';
    scoreText.textContent = `${Math.round(diagnosis.healthScore)}%`;

    // Time
    const timeText = document.createElement('span');
    timeText.className = 'history-time';
    timeText.textContent = this.formatRelativeTime(diagnosis.timestamp);

    historyDetails.appendChild(statusBadge);
    historyDetails.appendChild(scoreText);
    historyDetails.appendChild(timeText);

    historyInfo.appendChild(machineName);
    historyInfo.appendChild(historyDetails);

    // Create chevron icon
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'chevron-right');
    chevron.setAttribute('width', '20');
    chevron.setAttribute('height', '20');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    chevron.appendChild(polyline);

    // Assemble item
    historyItem.appendChild(historyInfo);
    historyItem.appendChild(chevron);

    // Add click handler - select the machine
    if (machine) {
      historyItem.addEventListener('click', () => this.handleMachineSelect(machine));
    }

    return historyItem;
  }

  /**
   * ========================================
   * HELPER FUNCTIONS
   * ========================================
   */

  /**
   * Format timestamp to relative time (German)
   */
  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) {
      return t('identify.time.justNow');
    } else if (minutes < 60) {
      return t('identify.time.minutesAgo', { minutes: String(minutes) });
    } else if (hours < 24) {
      return t('identify.time.hoursAgo', { hours: String(hours) });
    } else if (days < 7) {
      return days === 1 ? t('identify.time.dayAgo') : t('identify.time.daysAgo', { days: String(days) });
    } else {
      return weeks === 1 ? t('identify.time.weekAgo') : t('identify.time.weeksAgo', { weeks: String(weeks) });
    }
  }

  /**
   * Get localized status label
   */
  private getStatusLabel(status: DiagnosisResult['status']): string {
    switch (status) {
      case 'healthy':
        return t('status.healthy');
      case 'uncertain':
        return t('status.uncertain');
      case 'faulty':
        return t('status.faulty');
      default:
        return t('status.unknown');
    }
  }

  /**
   * Handle "Neue Maschine" button click
   * Scrolls to the machine creation section and focuses the input
   */
  private handleAddNewMachine(): void {
    const createSection = document.getElementById('create-machine-form');
    const nameInput = document.getElementById('machine-name-input') as HTMLInputElement | null;

    if (createSection) {
      createSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Focus the input after scrolling
      setTimeout(() => {
        if (nameInput) {
          nameInput.focus();
        }
      }, 500);
    } else {
      // Fallback: just focus the input
      if (nameInput) {
        nameInput.focus();
      }
    }
  }

  /**
   * Cleanup on phase exit
   */
  public cleanup(): void {
    if (this.currentAudioStream) {
      this.currentAudioStream.getTracks().forEach((track) => track.stop());
      this.currentAudioStream = null;
    }
  }
}
