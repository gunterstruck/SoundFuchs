/**
 * ZANOBOT - TOAST NOTIFICATION COMPONENT
 *
 * Modern, non-intrusive toast notifications to replace alert() dialogs.
 *
 * Features:
 * - Auto-dismiss with configurable duration
 * - Multiple toast types: success, error, warning, info
 * - Stacking support (multiple toasts at once)
 * - Smooth animations (slide in/out)
 * - Accessible (ARIA attributes)
 */

import { t } from '../../i18n/index.js';
import { escapeHtml } from '@utils/sanitize.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Action button for toast notifications (Zero-Friction feature)
 */
export interface ToastAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
}

export interface ToastOptions {
  /** Toast message */
  message: string;
  /** Optional title */
  title?: string;
  /** Toast type */
  type?: ToastType;
  /** Duration in milliseconds (0 = permanent, requires manual close) */
  duration?: number;
  /** Show close button */
  dismissible?: boolean;
  /** Position on screen */
  position?:
    | 'top-right'
    | 'top-center'
    | 'top-left'
    | 'bottom-right'
    | 'bottom-center'
    | 'bottom-left';
  /** Optional action buttons (Zero-Friction feature) */
  actions?: ToastAction[];
}

/**
 * Toast Notification Manager
 */
export class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Map<string, HTMLElement> = new Map();
  private toastCounter = 0;
  private pendingToasts: Array<{ id: string; options: Required<ToastOptions> }> = [];
  private currentPosition: Required<ToastOptions>['position'] = 'top-right';
  private activeMessages: Map<string, string> = new Map(); // message-key → toastId

  constructor() {
    this.initContainer();
  }

  /**
   * Initialize toast container
   */
  private initContainer(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (!document.body) {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          this.initContainer();
        },
        { once: true }
      );
      return;
    }

    // Check if container already exists
    let container = document.getElementById('toast-container');

    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(container);
    }

    this.container = container;
    this.container.classList.add(`toast-container--${this.currentPosition}`);
    this.flushPendingToasts();
  }

  /**
   * Show a toast notification
   */
  public show(options: ToastOptions): string {
    const defaults: Required<Omit<ToastOptions, 'actions'>> & { actions: ToastAction[] } = {
      message: '',
      title: '',
      type: 'info',
      duration: 5000,
      dismissible: true,
      position: 'top-right',
      actions: [],
    };

    const config = { ...defaults, ...options, actions: options.actions || [] };

    // Deduplication: skip duplicate info/warning/success toasts (errors always show)
    if (config.type !== 'error') {
      const messageKey = `${config.type}:${config.message}`;
      const existingToastId = this.activeMessages.get(messageKey);
      if (existingToastId && this.toasts.has(existingToastId)) {
        this.pulseToast(existingToastId);
        return existingToastId;
      }
    }

    const toastId = this.createToastId();

    // Track active message for deduplication (errors excluded above)
    if (config.type !== 'error') {
      const messageKey = `${config.type}:${config.message}`;
      this.activeMessages.set(messageKey, toastId);
    }

    if (!this.container) {
      this.initContainer();
    }

    if (!this.container) {
      this.pendingToasts.push({ id: toastId, options: config });
      return toastId;
    }

    this.renderToast(toastId, config);

    return toastId;
  }

  /**
   * Flush queued toasts once the container is ready
   */
  private flushPendingToasts(): void {
    if (!this.container || this.pendingToasts.length === 0) {
      return;
    }

    const queued = [...this.pendingToasts];
    this.pendingToasts = [];
    queued.forEach(({ id, options }) => {
      this.renderToast(id, { ...options });
    });
  }

  /**
   * Render a toast in the DOM
   */
  private renderToast(toastId: string, config: Required<Omit<ToastOptions, 'actions'>> & { actions: ToastAction[] }): void {
    if (!this.container) {
      return;
    }

    this.applyPosition(config.position);

    // Create toast element
    const toast = this.createToastElement(toastId, config);

    this.container.appendChild(toast);
    this.toasts.set(toastId, toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('toast-show'), 10);

    // Auto-dismiss after duration
    if (config.duration > 0) {
      setTimeout(() => this.hide(toastId), config.duration);
    }
  }

  /**
   * Apply container position classes
   */
  private applyPosition(position: Required<ToastOptions>['position']): void {
    if (!this.container || this.currentPosition === position) {
      return;
    }

    this.container.classList.remove(`toast-container--${this.currentPosition}`);
    this.container.classList.add(`toast-container--${position}`);
    this.currentPosition = position;
  }

  /**
   * Generate a unique toast ID
   */
  private createToastId(): string {
    return `toast-${++this.toastCounter}`;
  }

  /**
   * Hide a specific toast
   */
  public hide(toastId: string): void {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    // Animate out
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.container && toast.parentNode === this.container) {
        this.container.removeChild(toast);
      }
      this.toasts.delete(toastId);

      // Clean up deduplication tracking
      this.activeMessages.forEach((id, key) => {
        if (id === toastId) this.activeMessages.delete(key);
      });
    }, 300);
  }

  /**
   * Hide all toasts
   */
  public hideAll(): void {
    this.toasts.forEach((_, toastId) => this.hide(toastId));
    this.activeMessages.clear();
  }

  /**
   * Briefly pulse an existing toast to indicate a duplicate was suppressed
   */
  private pulseToast(toastId: string): void {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    toast.classList.remove('toast-pulse');
    // Force reflow so re-adding the class restarts the animation
    void toast.offsetWidth;
    toast.classList.add('toast-pulse');

    const onEnd = (): void => {
      toast.classList.remove('toast-pulse');
      toast.removeEventListener('animationend', onEnd);
    };
    toast.addEventListener('animationend', onEnd);
  }

  /**
   * Create toast DOM element
   */
  private createToastElement(toastId: string, config: Required<Omit<ToastOptions, 'actions'>> & { actions: ToastAction[] }): HTMLElement {
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast toast-${config.type}`;
    toast.setAttribute('role', config.type === 'error' ? 'alert' : 'status');

    // Icon
    const icon = this.getIcon(config.type);

    // Title
    const titleHTML = config.title
      ? `<div class="toast-title">${escapeHtml(config.title)}</div>`
      : '';

    // Message
    const messageHTML = `<div class="toast-message">${escapeHtml(config.message)}</div>`;

    // Close button
    const closeButton = config.dismissible
      ? `<button class="toast-close" aria-label="${t('notifications.closeNotification')}" data-toast-id="${toastId}">×</button>`
      : '';

    // Action buttons (Zero-Friction feature)
    const actionsHTML =
      config.actions.length > 0
        ? `<div class="toast-actions">${config.actions
            .map((action, i) => `<button class="toast-action-btn" data-action-index="${i}">${escapeHtml(action.label)}</button>`)
            .join('')}</div>`
        : '';

    // Compose toast
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        ${titleHTML}
        ${messageHTML}
        ${actionsHTML}
      </div>
      ${closeButton}
    `;

    // Add close button event listener
    if (config.dismissible) {
      const closeBtn = toast.querySelector('.toast-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide(toastId));
      }
    }

    // Add action button event listeners (Zero-Friction feature)
    if (config.actions.length > 0) {
      const actionBtns = toast.querySelectorAll('.toast-action-btn');
      actionBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const index = parseInt((e.target as HTMLElement).dataset.actionIndex || '0', 10);
          const action = config.actions[index];
          if (action && typeof action.onClick === 'function') {
            action.onClick();
            this.hide(toastId); // Close toast after action
          }
        });
      });
    }

    return toast;
  }

  /**
   * Get icon for toast type
   */
  private getIcon(type: ToastType): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };

    return icons[type] || icons.info;
  }

  /**
   * Shorthand: Show success toast
   */
  public success(message: string, title?: string, duration = 5000): string {
    return this.show({ message, title, type: 'success', duration });
  }

  /**
   * Shorthand: Show error toast
   */
  public error(message: string, title?: string, duration = 0): string {
    return this.show({ message, title, type: 'error', duration });
  }

  /**
   * Shorthand: Show warning toast
   */
  public warning(message: string, title?: string, duration = 7000): string {
    return this.show({ message, title, type: 'warning', duration });
  }

  /**
   * Shorthand: Show info toast
   */
  public info(message: string, title?: string, duration = 5000): string {
    return this.show({ message, title, type: 'info', duration });
  }
}

/**
 * Global toast manager instance
 */
export const toast = new ToastManager();
