/**
 * ZANOBOT - QR / BARCODE SCANNER CONTROLLER
 *
 * Owns the camera scanner lifecycle and its modal UI, extracted from the
 * Identify phase: opening/closing the scanner modal, lazy-loading html5-qrcode,
 * starting/stopping the camera, the success beep, and the error/success panels.
 *
 * Decoding only — the decoded text is handed back to the phase via the `onCode`
 * dependency, which interprets it (machine id / deep-link URL / import URL).
 */

import { logger } from '@utils/logger.js';
import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import type { Html5Qrcode } from 'html5-qrcode';

/** Phase-side behaviour the scanner needs. */
export interface ScannerDeps {
  /** Process a decoded code (plain machine id, deep-link URL, or import URL). */
  onCode: (code: string) => Promise<void>;
}

export class ScannerController {
  private html5QrCode: Html5Qrcode | null = null;
  private scannerModal: HTMLElement | null = null;
  private isScanning: boolean = false;
  private isProcessingScan: boolean = false;

  constructor(private readonly deps: ScannerDeps) {}

  /** Wire the static scanner modal's open/close affordances (called once at phase init). */
  public init(): void {
    this.scannerModal = document.getElementById('scanner-modal');

    const closeScannerBtn = document.getElementById('close-scanner-modal');
    if (closeScannerBtn) {
      closeScannerBtn.addEventListener('click', () => this.closeScanner());
    }

    const closeScannerFooterBtn = document.getElementById('close-scanner-btn');
    if (closeScannerFooterBtn) {
      closeScannerFooterBtn.addEventListener('click', () => this.closeScanner());
    }

    // Close modal when clicking outside
    if (this.scannerModal) {
      this.scannerModal.addEventListener('click', (e) => {
        if (e.target === this.scannerModal) {
          this.closeScanner();
        }
      });
    }
  }

  /** Open the scanner modal and start the camera. */
  public async handleScan(): Promise<void> {
    try {
      this.openScannerModal();
      await this.startScanner();
    } catch (error) {
      logger.error('Scan error:', error);
      this.showScannerError(t('identify.errors.scannerStart'));
    }
  }

  /**
   * Open scanner modal.
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
   * Start the QR/Barcode scanner.
   */
  private async startScanner(): Promise<void> {
    if (this.isScanning) return;

    try {
      this.isScanning = true;
      // Fresh scan session: allow the next success callback to be processed
      this.isProcessingScan = false;
      // Lazy-load the scanner library only when the user actually opens the scanner.
      const { Html5Qrcode } = await import('html5-qrcode');
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
   * Handle successful scan.
   */
  private async onScanSuccess(decodedText: string, _decodedResult: unknown): Promise<void> {
    // html5-qrcode fires per recognized frame – a second callback can arrive
    // before stopScanner() resolves, which would double-process the code
    if (this.isProcessingScan) {
      return;
    }
    this.isProcessingScan = true;

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
        await this.deps.onCode(decodedText);
      } catch (error) {
        logger.error('Failed to process scanned code:', error);
        notify.error(t('identify.errors.qrProcessing'), error as Error, {
          title: t('modals.scanError'),
          duration: 0,
        });
      } finally {
        this.closeScanner();
        this.isProcessingScan = false;
      }
    }, 800);
  }

  /**
   * Handle scan failure (this is called continuously, so we don't show errors here).
   */
  private onScanFailure(error: string): void {
    // Don't log every failure - it's called very frequently while scanning
    // Only log if it's not the typical "No MultiFormat Readers" message
    if (!error.includes('No MultiFormat Readers')) {
      logger.debug('Scan attempt:', error);
    }
  }

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
   * Close scanner modal.
   */
  public async closeScanner(): Promise<void> {
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
   * Show scanner error.
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
   * Show scanner success.
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
   * Play success beep sound.
   */
  private playSuccessBeep(): void {
    try {
      // Create a simple beep using Web Audio API
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
}
