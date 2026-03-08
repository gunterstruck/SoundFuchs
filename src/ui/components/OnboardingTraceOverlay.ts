/**
 * ZANOBOT - ONBOARDING TRACE OVERLAY
 *
 * UI component that displays the step-by-step protocol for NFC onboarding.
 * Shows exactly where the process succeeded or failed for debugging.
 *
 * Features:
 * - Appears only for NFC/Deep-Link or debug=1
 * - Shows timestamped list of steps with status (OK/IN_PROGRESS/FAIL)
 * - Stays visible on errors
 * - Copy to clipboard button
 * - Collapsible/expandable
 * - Auto-scrolls to latest entry
 */

import { t } from '../../i18n/index.js';
import { onboardingTrace, type TraceSession, type TraceEntry, type TraceStatus } from '@utils/onboardingTrace.js';
import { logger } from '@utils/logger.js';
import { escapeHtml } from '@utils/sanitize.js';

/**
 * Status indicator icons (using Unicode symbols for simplicity)
 */
const STATUS_ICONS: Record<TraceStatus, string> = {
  pending: '⏳',
  in_progress: '⏳',
  success: '✓',
  fail: '✗',
};

/**
 * Status CSS classes
 */
const STATUS_CLASSES: Record<TraceStatus, string> = {
  pending: 'status-pending',
  in_progress: 'status-progress',
  success: 'status-success',
  fail: 'status-fail',
};

/**
 * Onboarding Trace Overlay Component
 */
export class OnboardingTraceOverlay {
  private container: HTMLElement | null = null;
  private entriesContainer: HTMLElement | null = null;
  private headerStatus: HTMLElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private toggleButton: HTMLButtonElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private isCollapsed: boolean = false;

  private static readonly CONTAINER_ID = 'onboarding-trace-overlay';

  /**
   * Initialize and show the overlay
   */
  public show(): void {
    if (!this.container) {
      this.create();
    }

    if (this.container) {
      this.container.style.display = 'block';
    }

    // Subscribe to trace updates
    this.unsubscribe = onboardingTrace.subscribe((session) => {
      this.update(session);
    });

    logger.info('[TraceOverlay] Shown');
  }

  /**
   * Hide the overlay
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.container.style.pointerEvents = 'none';
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    logger.info('[TraceOverlay] Hidden');
  }

  /**
   * Check if overlay is visible
   */
  public isVisible(): boolean {
    return this.container?.style.display !== 'none';
  }

  /**
   * Create the overlay DOM structure
   */
  private create(): void {
    // Remove existing if present
    const existing = document.getElementById(OnboardingTraceOverlay.CONTAINER_ID);
    if (existing) {
      existing.remove();
    }

    this.container = document.createElement('div');
    this.container.id = OnboardingTraceOverlay.CONTAINER_ID;
    this.container.className = 'trace-overlay';
    this.container.innerHTML = `
      <div class="trace-header">
        <div class="trace-header-left">
          <button class="trace-toggle-btn" id="trace-toggle-btn" title="${t('trace.toggle')}">
            <span class="toggle-icon">▼</span>
          </button>
          <span class="trace-title">${t('trace.title')}</span>
          <span class="trace-header-status" id="trace-header-status"></span>
        </div>
        <div class="trace-header-right">
          <button class="trace-copy-btn" id="trace-copy-btn" title="${t('trace.copyToClipboard')}">
            ${t('trace.copy')}
          </button>
          <button class="trace-close-btn" id="trace-close-btn" title="${t('buttons.close')}">×</button>
        </div>
      </div>
      <div class="trace-body" id="trace-body">
        <div class="trace-entries" id="trace-entries">
          <div class="trace-empty">${t('trace.noEntries')}</div>
        </div>
      </div>
    `;

    this.addStyles();
    document.body.appendChild(this.container);

    // Cache element references
    this.entriesContainer = document.getElementById('trace-entries');
    this.headerStatus = document.getElementById('trace-header-status');
    this.copyButton = document.getElementById('trace-copy-btn') as HTMLButtonElement;
    this.toggleButton = document.getElementById('trace-toggle-btn') as HTMLButtonElement;
    const closeButton = document.getElementById('trace-close-btn');

    // Event listeners
    if (this.copyButton) {
      this.copyButton.addEventListener('click', () => this.handleCopy());
    }
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.handleToggle());
    }
    if (closeButton) {
      closeButton.addEventListener('click', () => this.hide());
    }
  }

  /**
   * Update the overlay with current session data
   */
  private update(session: TraceSession): void {
    if (!this.entriesContainer || !this.headerStatus) {
      return;
    }

    // Update header status
    if (session.hasError) {
      this.headerStatus.textContent = `✗ ${t('trace.statusFailed')}`;
      this.headerStatus.className = 'trace-header-status status-fail';
    } else if (session.endedAt) {
      this.headerStatus.textContent = `✓ ${t('trace.statusComplete')}`;
      this.headerStatus.className = 'trace-header-status status-success';
    } else {
      this.headerStatus.textContent = `⏳ ${t('trace.statusRunning')}`;
      this.headerStatus.className = 'trace-header-status status-progress';
    }

    // Build entries HTML
    if (session.entries.length === 0) {
      this.entriesContainer.innerHTML = `<div class="trace-empty">${t('trace.noEntries')}</div>`;
      return;
    }

    const entriesHtml = session.entries.map(entry => this.renderEntry(entry)).join('');
    this.entriesContainer.innerHTML = entriesHtml;

    // Auto-scroll to bottom
    this.entriesContainer.scrollTop = this.entriesContainer.scrollHeight;
  }

  /**
   * Render a single trace entry
   */
  private renderEntry(entry: TraceEntry): string {
    const time = new Date(entry.timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const icon = STATUS_ICONS[entry.status];
    const statusClass = STATUS_CLASSES[entry.status];
    const stepLabel = t(`trace.steps.${entry.stepId}`) || entry.stepId;
    const duration = entry.durationMs ? `<span class="trace-duration">${entry.durationMs}ms</span>` : '';

    // Format details
    let detailsHtml = '';
    if (Object.keys(entry.details).length > 0) {
      const detailLines = Object.entries(entry.details)
        .map(([key, value]) => {
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          const truncated = displayValue.length > 60
            ? displayValue.substring(0, 60) + '...'
            : displayValue;
          return `<span class="trace-detail-key">${key}:</span> ${escapeHtml(truncated)}`;
        })
        .join('<br>');
      detailsHtml = `<div class="trace-entry-details">${detailLines}</div>`;
    }

    return `
      <div class="trace-entry ${statusClass}">
        <span class="trace-time">${time}</span>
        <span class="trace-icon">${icon}</span>
        <div class="trace-content">
          <span class="trace-step">${stepLabel}</span>
          ${duration}
          ${detailsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Handle copy button click
   */
  private async handleCopy(): Promise<void> {
    if (!this.copyButton) {
      return;
    }

    const originalText = this.copyButton.textContent;
    const success = await onboardingTrace.copyToClipboard();

    if (success) {
      this.copyButton.textContent = t('trace.copied');
      this.copyButton.classList.add('copied');
    } else {
      this.copyButton.textContent = t('trace.copyFailed');
    }

    // Reset after 2 seconds
    setTimeout(() => {
      if (this.copyButton) {
        this.copyButton.textContent = originalText;
        this.copyButton.classList.remove('copied');
      }
    }, 2000);
  }

  /**
   * Handle toggle button click
   */
  private handleToggle(): void {
    this.isCollapsed = !this.isCollapsed;

    const body = document.getElementById('trace-body');
    const toggleIcon = this.toggleButton?.querySelector('.toggle-icon');

    if (body) {
      body.style.display = this.isCollapsed ? 'none' : 'block';
    }
    if (toggleIcon) {
      toggleIcon.textContent = this.isCollapsed ? '▶' : '▼';
    }
  }

  /**
   * Add required CSS styles
   */
  private addStyles(): void {
    const styleId = 'onboarding-trace-overlay-styles';

    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .trace-overlay {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 50vh;
        background: var(--background-primary, #0A1929);
        border-top: 2px solid var(--primary-color, #00D4FF);
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
        z-index: 9998;
        font-family: monospace;
        font-size: 12px;
        display: none;
      }

      .trace-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--background-secondary, #1A2F4A);
        border-bottom: 1px solid var(--border-color, #2D4A6A);
      }

      .trace-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .trace-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .trace-title {
        font-weight: bold;
        color: var(--text-primary, #FFFFFF);
        font-size: 13px;
      }

      .trace-header-status {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
      }

      .trace-header-status.status-progress {
        background: rgba(255, 193, 7, 0.2);
        color: #FFC107;
      }

      .trace-header-status.status-success {
        background: rgba(76, 175, 80, 0.2);
        color: #4CAF50;
      }

      .trace-header-status.status-fail {
        background: rgba(244, 67, 54, 0.2);
        color: #F44336;
      }

      .trace-toggle-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #A0AEC0);
        cursor: pointer;
        padding: 2px 4px;
        font-size: 10px;
      }

      .trace-toggle-btn:hover {
        color: var(--text-primary, #FFFFFF);
      }

      .trace-copy-btn {
        background: var(--primary-color, #00D4FF);
        color: var(--background-primary, #0A1929);
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: background 0.2s;
      }

      .trace-copy-btn:hover {
        background: var(--primary-hover, #00B8E6);
      }

      .trace-copy-btn.copied {
        background: var(--status-healthy, #4CAF50);
      }

      .trace-close-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #A0AEC0);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0 4px;
      }

      .trace-close-btn:hover {
        color: var(--text-primary, #FFFFFF);
      }

      .trace-body {
        overflow: hidden;
      }

      .trace-entries {
        max-height: calc(50vh - 50px);
        overflow-y: auto;
        padding: 8px;
      }

      .trace-empty {
        color: var(--text-muted, #718096);
        text-align: center;
        padding: 16px;
        font-style: italic;
      }

      .trace-entry {
        display: flex;
        align-items: flex-start;
        padding: 4px 8px;
        border-radius: 4px;
        margin-bottom: 2px;
        background: var(--background-secondary, #1A2F4A);
      }

      .trace-entry.status-fail {
        background: rgba(244, 67, 54, 0.15);
        border-left: 3px solid #F44336;
      }

      .trace-entry.status-success {
        border-left: 3px solid transparent;
      }

      .trace-entry.status-progress {
        border-left: 3px solid #FFC107;
        animation: pulse-border 1s infinite;
      }

      @keyframes pulse-border {
        0%, 100% { border-left-color: #FFC107; }
        50% { border-left-color: transparent; }
      }

      .trace-time {
        color: var(--text-muted, #718096);
        margin-right: 8px;
        flex-shrink: 0;
        font-size: 11px;
      }

      .trace-icon {
        margin-right: 6px;
        flex-shrink: 0;
        width: 14px;
        text-align: center;
      }

      .status-success .trace-icon {
        color: #4CAF50;
      }

      .status-fail .trace-icon {
        color: #F44336;
      }

      .status-progress .trace-icon,
      .status-pending .trace-icon {
        color: #FFC107;
      }

      .trace-content {
        flex: 1;
        min-width: 0;
      }

      .trace-step {
        color: var(--text-primary, #FFFFFF);
        word-break: break-word;
      }

      .trace-duration {
        color: var(--text-muted, #718096);
        font-size: 10px;
        margin-left: 8px;
      }

      .trace-entry-details {
        margin-top: 4px;
        padding-left: 4px;
        font-size: 10px;
        color: var(--text-secondary, #A0AEC0);
        line-height: 1.4;
        word-break: break-all;
      }

      .trace-detail-key {
        color: var(--primary-color, #00D4FF);
      }

      /* Scrollbar styling */
      .trace-entries::-webkit-scrollbar {
        width: 6px;
      }

      .trace-entries::-webkit-scrollbar-track {
        background: var(--background-primary, #0A1929);
      }

      .trace-entries::-webkit-scrollbar-thumb {
        background: var(--border-color, #2D4A6A);
        border-radius: 3px;
      }

      .trace-entries::-webkit-scrollbar-thumb:hover {
        background: var(--primary-color, #00D4FF);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Destroy the overlay
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.entriesContainer = null;
    this.headerStatus = null;
    this.copyButton = null;
    this.toggleButton = null;
  }
}

/**
 * Global overlay instance
 */
export const traceOverlay = new OnboardingTraceOverlay();
