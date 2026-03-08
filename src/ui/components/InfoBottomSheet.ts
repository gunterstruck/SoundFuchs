import { t } from '../../i18n/index.js';

/**
 * Sprint 2 UX: Reusable InfoBottomSheet for contextual help
 *
 * A lightweight bottom sheet overlay component that slides up from
 * the bottom of the screen. Used for contextual help throughout the app.
 *
 * Usage:
 *   InfoBottomSheet.show({
 *     title: 'Was bedeutet der Health Score?',
 *     content: '<p>Der Score zeigt die Ähnlichkeit...</p>',
 *     icon: 'ℹ️',
 *   });
 */
export class InfoBottomSheet {
  private static instance: InfoBottomSheet | null = null;
  private overlay: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  /** Sprint 3 Polish: Focus trap handler for Tab key cycling */
  private trapFocusHandler: ((e: KeyboardEvent) => void) | null = null;

  private constructor() {}

  /**
   * Show the bottom sheet with given content
   */
  public static show(options: {
    title: string;
    content: string;
    icon?: string;
  }): void {
    if (!InfoBottomSheet.instance) {
      InfoBottomSheet.instance = new InfoBottomSheet();
    }
    InfoBottomSheet.instance.render(options);
  }

  /**
   * Close the bottom sheet
   */
  public static close(): void {
    InfoBottomSheet.instance?.dismiss();
  }

  private render(options: { title: string; content: string; icon?: string }): void {
    // Save current focus for restoration
    this.previousFocus = document.activeElement as HTMLElement;

    // Remove existing if open
    this.dismiss();

    // Create backdrop
    this.overlay = document.createElement('div');
    this.overlay.className = 'bottomsheet-overlay';
    this.overlay.addEventListener('click', () => this.dismiss());

    // Create sheet
    this.sheet = document.createElement('div');
    this.sheet.className = 'bottomsheet';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.setAttribute('aria-label', options.title);

    this.sheet.innerHTML = `
      <div class="bottomsheet-handle"></div>
      <div class="bottomsheet-header">
        ${options.icon ? `<span class="bottomsheet-icon">${options.icon}</span>` : ''}
        <h3 class="bottomsheet-title">${options.title}</h3>
        <button class="bottomsheet-close" aria-label="${t('buttons.close')}">✕</button>
      </div>
      <div class="bottomsheet-body">${options.content}</div>
    `;

    // Close button handler
    this.sheet.querySelector('.bottomsheet-close')?.addEventListener('click', () => this.dismiss());

    // Escape key handler (stored on instance for cleanup in dismiss())
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.dismiss();
      }
    };
    document.addEventListener('keydown', this.escHandler);

    // Sprint 3 Polish: Focus trap – Tab cycles within the sheet
    const focusableElements = this.sheet.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    this.trapFocusHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };
    this.sheet.addEventListener('keydown', this.trapFocusHandler);

    // Append to DOM
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.sheet);

    // Trigger animation (next frame)
    requestAnimationFrame(() => {
      this.overlay?.classList.add('bottomsheet-overlay-visible');
      this.sheet?.classList.add('bottomsheet-visible');
    });

    // Focus the close button for accessibility
    const closeBtn = this.sheet.querySelector('.bottomsheet-close') as HTMLElement;
    closeBtn?.focus();
  }

  private dismiss(): void {
    // Clean up escape handler FIRST (prevents double-firing)
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }

    // Sprint 3 Polish: Clean up focus trap handler
    if (this.trapFocusHandler && this.sheet) {
      this.sheet.removeEventListener('keydown', this.trapFocusHandler);
      this.trapFocusHandler = null;
    }

    // Capture references before nulling – transitionend fires asynchronously
    const overlayEl = this.overlay;
    const sheetEl = this.sheet;

    if (overlayEl) {
      overlayEl.classList.remove('bottomsheet-overlay-visible');
      overlayEl.addEventListener('transitionend', () => overlayEl.remove(), { once: true });
      // Fallback: remove after timeout if transitionend doesn't fire
      setTimeout(() => { if (overlayEl.parentNode) overlayEl.remove(); }, 400);
    }
    if (sheetEl) {
      sheetEl.classList.remove('bottomsheet-visible');
      sheetEl.addEventListener('transitionend', () => sheetEl.remove(), { once: true });
      setTimeout(() => { if (sheetEl.parentNode) sheetEl.remove(); }, 400);
    }

    // Restore focus
    this.previousFocus?.focus();

    this.overlay = null;
    this.sheet = null;
  }
}
