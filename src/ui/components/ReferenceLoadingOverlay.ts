/**
 * ZANOBOT - REFERENCE LOADING OVERLAY
 *
 * Full-screen overlay shown while downloading reference database.
 * Blocks testing until reference data is loaded.
 *
 * Design:
 * - Clean, neutral loading state
 * - Progress indicator
 * - Human-friendly status messages
 * - No technical jargon
 */

import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

/**
 * Loading Overlay Component
 */
export class ReferenceLoadingOverlay {
  private overlay: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private statusText: HTMLElement | null = null;
  private subtitleText: HTMLElement | null = null;

  private static readonly OVERLAY_ID = 'reference-loading-overlay';

  /**
   * Show the loading overlay
   */
  public show(): void {
    // Create overlay if it doesn't exist
    if (!this.overlay) {
      this.createOverlay();
    }

    if (this.overlay) {
      this.overlay.style.display = 'flex';
      this.updateStatus(t('machineSetup.loadingTitle'), 0);
    }

    logger.info('📥 Reference loading overlay shown');
  }

  /**
   * Hide the loading overlay
   */
  public hide(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.style.pointerEvents = 'none';
    }

    logger.info('📥 Reference loading overlay hidden');
  }

  /**
   * Update the loading status
   *
   * @param status - Human-readable status message
   * @param progress - Progress percentage (0-100), optional
   */
  public updateStatus(status: string, progress?: number): void {
    if (this.statusText) {
      this.statusText.textContent = status;
    }

    if (this.progressBar && progress !== undefined) {
      this.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  }

  /**
   * Show an error state
   *
   * @param errorMessage - Human-friendly error message
   */
  public showError(errorMessage: string): void {
    if (this.statusText) {
      this.statusText.textContent = errorMessage;
      this.statusText.classList.add('error');
    }

    if (this.subtitleText) {
      this.subtitleText.textContent = t('machineSetup.errorMachineNotFound');
    }

    if (this.progressBar) {
      this.progressBar.style.backgroundColor = 'var(--status-faulty)';
      this.progressBar.style.width = '100%';
    }
  }

  /**
   * Show success state briefly before hiding
   */
  public showSuccess(): void {
    if (this.statusText) {
      this.statusText.textContent = t('machineSetup.referenceLoaded');
      this.statusText.classList.remove('error');
    }

    if (this.progressBar) {
      this.progressBar.style.backgroundColor = 'var(--status-healthy)';
      this.progressBar.style.width = '100%';
    }

    // Hide after a short delay
    setTimeout(() => this.hide(), 1500);
  }

  /**
   * Create the overlay DOM structure
   */
  private createOverlay(): void {
    // Remove existing overlay if present
    const existing = document.getElementById(ReferenceLoadingOverlay.OVERLAY_ID);
    if (existing) {
      existing.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.id = ReferenceLoadingOverlay.OVERLAY_ID;
    this.overlay.className = 'reference-loading-overlay';
    this.overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" class="spinner-path"/>
          </svg>
        </div>
        <h2 class="loading-title" id="loading-status">${t('machineSetup.loadingTitle')}</h2>
        <p class="loading-subtitle" id="loading-subtitle">${t('machineSetup.loadingSubtitle')}</p>
        <div class="loading-progress-container">
          <div class="loading-progress-bar" id="loading-progress"></div>
        </div>
        <p class="loading-hint">${t('machineSetup.testingBlocked')}</p>
      </div>
    `;

    // Add styles
    this.addStyles();

    // Add to DOM
    document.body.appendChild(this.overlay);

    // Cache element references
    this.progressBar = document.getElementById('loading-progress');
    this.statusText = document.getElementById('loading-status');
    this.subtitleText = document.getElementById('loading-subtitle');
  }

  /**
   * Add required CSS styles
   */
  private addStyles(): void {
    const styleId = 'reference-loading-overlay-styles';

    // Don't add styles twice
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .reference-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--background-primary, #0A1929);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 1;
        transition: opacity 0.3s ease;
      }

      .reference-loading-overlay .loading-content {
        text-align: center;
        padding: 2rem;
        max-width: 320px;
      }

      .reference-loading-overlay .loading-spinner {
        margin-bottom: 1.5rem;
        animation: pulse 2s ease-in-out infinite;
      }

      .reference-loading-overlay .loading-spinner .spinner-path {
        animation: spin 1s linear infinite;
        transform-origin: center;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .reference-loading-overlay .loading-title {
        color: var(--text-primary, #FFFFFF);
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
      }

      .reference-loading-overlay .loading-title.error {
        color: var(--status-faulty, #FF4444);
      }

      .reference-loading-overlay .loading-subtitle {
        color: var(--text-secondary, #A0AEC0);
        font-size: 0.875rem;
        margin: 0 0 1.5rem 0;
      }

      .reference-loading-overlay .loading-progress-container {
        width: 100%;
        height: 4px;
        background: var(--background-secondary, #1A2F4A);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 1rem;
      }

      .reference-loading-overlay .loading-progress-bar {
        height: 100%;
        background: var(--primary-color, #00D4FF);
        border-radius: 2px;
        width: 0%;
        transition: width 0.3s ease, background-color 0.3s ease;
      }

      .reference-loading-overlay .loading-hint {
        color: var(--text-muted, #718096);
        font-size: 0.75rem;
        margin: 0;
        font-style: italic;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Clean up overlay
   */
  public destroy(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    this.progressBar = null;
    this.statusText = null;
    this.subtitleText = null;
  }
}
