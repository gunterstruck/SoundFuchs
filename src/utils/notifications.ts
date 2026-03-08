/**
 * ZANOBOT - CENTRALIZED NOTIFICATION SYSTEM
 *
 * Provides consistent user notifications throughout the app.
 * Replaces inconsistent alert() calls with proper UI feedback.
 *
 * Usage:
 *   import { notify } from '@utils/notifications.js';
 *   notify.success('Model trained successfully!');
 *   notify.error('Failed to access microphone', error);
 *   notify.warning('No signal detected');
 */

import { logger } from './logger.js';
import { toast, type ToastAction } from '@ui/components/Toast.js';
import { t } from '../i18n/index.js';

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification action (re-export from Toast for convenience)
 */
export type NotificationAction = ToastAction;

/**
 * Notification options
 */
export interface NotificationOptions {
  /** Notification message */
  message: string;
  /** Optional title */
  title?: string;
  /** Duration in milliseconds (0 = permanent) */
  duration?: number;
  /** Show close button */
  dismissible?: boolean;
  /** Optional action buttons (Zero-Friction feature) */
  actions?: NotificationAction[];
}

/**
 * Notification Manager
 */
class NotificationManager {
  /**
   * Show success notification
   */
  public success(message: string, options?: Partial<NotificationOptions>): void {
    this.show('success', { message, ...options });
    logger.info('✅ Success:', message);
  }

  /**
   * Show error notification
   */
  public error(
    message: string,
    error?: Error | unknown,
    options?: Partial<NotificationOptions>
  ): void {
    // Include error details in notification if available
    let fullMessage = message;
    if (error && error instanceof Error && error.message) {
      fullMessage = `${message}\n\nDetails: ${error.message}`;
    }

    this.show('error', { message: fullMessage, ...options });

    if (error) {
      logger.error('❌ Error:', error, message);
    } else {
      logger.error('❌ Error:', message);
    }
  }

  /**
   * Show warning notification
   */
  public warning(message: string, options?: Partial<NotificationOptions>): void {
    this.show('warning', { message, ...options });
    logger.warn('⚠️ Warning:', message);
  }

  /**
   * Show info notification
   */
  public info(message: string, options?: Partial<NotificationOptions>): void {
    this.show('info', { message, ...options });
    logger.info('ℹ️ Info:', message);
  }

  /**
   * Confirm dialog (for important actions)
   */
  public async confirm(message: string, title = t('notifications.confirmRequired')): Promise<boolean> {
    // Browser guard: Check if window.confirm is available
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      logger.warn('⚠️ Confirm dialog not available in non-browser context. Defaulting to false.');
      return false;
    }

    // For now, use browser confirm (can be replaced with custom modal later)
    return confirm(`${title}\n\n${message}`);
  }

  /**
   * Internal show method
   */
  private show(type: NotificationType, options: NotificationOptions): void {
    const defaults: NotificationOptions = {
      message: '',
      duration: type === 'error' ? 0 : 5000,
      dismissible: true,
    };

    const config = { ...defaults, ...options };

    // For now, use native browser APIs
    // TODO: Replace with custom toast/modal system in future
    if (typeof window !== 'undefined') {
      this.showNativeNotification(type, config);
    }
  }

  /**
   * Show toast notification (modern implementation)
   */
  private showNativeNotification(type: NotificationType, options: NotificationOptions): void {
    // Use toast system for all notification types
    toast.show({
      message: options.message,
      title: options.title,
      type,
      duration: options.duration,
      dismissible: options.dismissible,
      actions: options.actions, // Zero-Friction feature: pass actions to toast
    });
  }

  /**
   * Get icon for notification type
   */
  private getIcon(type: NotificationType): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };

    return icons[type] || '';
  }
}

/**
 * Global notification manager instance
 */
export const notify = new NotificationManager();

/**
 * Shorthand notification functions
 */
export const notification = {
  success: (message: string, options?: Partial<NotificationOptions>) =>
    notify.success(message, options),
  error: (message: string, error?: Error | unknown, options?: Partial<NotificationOptions>) =>
    notify.error(message, error, options),
  warning: (message: string, options?: Partial<NotificationOptions>) =>
    notify.warning(message, options),
  info: (message: string, options?: Partial<NotificationOptions>) => notify.info(message, options),
  confirm: (message: string, title?: string) => notify.confirm(message, title),
};
