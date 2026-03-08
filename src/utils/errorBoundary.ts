/**
 * ZANOBOT - GLOBAL ERROR BOUNDARY
 *
 * Provides global error handling for uncaught errors and unhandled promise rejections.
 * Displays user-friendly error messages and logs technical details for debugging.
 */

import { logger } from './logger.js';
import { notify } from './notifications.js';
import { t } from '../i18n/index.js';

/**
 * Error boundary configuration
 */
interface ErrorBoundaryConfig {
  /**
   * Show error details to user (useful for development)
   */
  showDetails: boolean;
  /**
   * Callback for custom error handling
   */
  onError?: (error: Error, errorInfo: { type: 'error' | 'rejection'; timestamp: number }) => void;
}

/**
 * Default configuration
 */
const defaultConfig: ErrorBoundaryConfig = {
  showDetails: import.meta.env.DEV || import.meta.env.MODE === 'development',
};

/**
 * Global error boundary class
 */
class ErrorBoundary {
  private config: ErrorBoundaryConfig;
  private isInitialized = false;
  private errorHandler: ((event: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(config?: Partial<ErrorBoundaryConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Initialize error boundary
   */
  public init(): void {
    if (this.isInitialized) {
      logger.warn('Error boundary already initialized');
      return;
    }

    // Handle uncaught errors
    this.errorHandler = (event: ErrorEvent) => {
      this.handleError(event.error || new Error(event.message), 'error');
      event.preventDefault(); // Prevent default browser error handling
    };
    window.addEventListener('error', this.errorHandler);

    // Handle unhandled promise rejections
    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.handleError(error, 'rejection');
      event.preventDefault(); // Prevent default browser rejection handling
    };
    window.addEventListener('unhandledrejection', this.rejectionHandler);

    this.isInitialized = true;
    logger.info('✅ Error boundary initialized');
  }

  /**
   * Destroy error boundary and cleanup listeners
   */
  public destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    if (this.errorHandler) {
      window.removeEventListener('error', this.errorHandler);
      this.errorHandler = null;
    }

    if (this.rejectionHandler) {
      window.removeEventListener('unhandledrejection', this.rejectionHandler);
      this.rejectionHandler = null;
    }

    this.isInitialized = false;
    logger.info('Error boundary destroyed');
  }

  /**
   * Handle error
   */
  private handleError(error: Error, type: 'error' | 'rejection'): void {
    const timestamp = Date.now();
    const errorInfo = { type, timestamp };

    // Log error
    logger.error(`Uncaught ${type}:`, error);

    // Call custom error handler if provided
    if (this.config.onError) {
      try {
        this.config.onError(error, errorInfo);
      } catch (handlerError) {
        logger.error('Error in custom error handler:', handlerError);
      }
    }

    // Show user-friendly error message
    this.showErrorMessage(error);
  }

  /**
   * Show user-friendly error message
   */
  private showErrorMessage(error: Error): void {
    let message = t('errorBoundary.unexpectedError');
    let hint = '';

    // Check for common error types and provide helpful messages
    if (error.name === 'NotAllowedError' || error.message.includes('Permission')) {
      message = t('errorBoundary.permissionDenied');
      hint = t('errorBoundary.permissionHint');
    } else if (error.name === 'NotFoundError') {
      message = t('errorBoundary.hardwareNotFound');
      hint = t('errorBoundary.hardwareHint');
    } else if (error.name === 'QuotaExceededError') {
      message = t('errorBoundary.storageFull');
      hint = t('errorBoundary.storageFull');
    } else if (error.message.includes('Network')) {
      message = t('errorBoundary.networkError');
      hint = t('errorBoundary.networkError');
    } else if (error.message.includes('AudioContext')) {
      message = t('errorBoundary.audioSystemError');
      hint = t('errorBoundary.audioSystemHint');
    }

    // Prepare error details for development mode
    const details = this.config.showDetails
      ? `\n\n${t('errorBoundary.technicalDetails')}:\n${error.name}: ${error.message}\n${error.stack || t('errorBoundary.noStackTrace')}`
      : '';

    // Show notification with error
    notify.error(
      `${message}\n\n${hint}${details}`,
      error,
      {
        title: t('errorBoundary.unexpectedErrorTitle'),
        duration: 0, // Don't auto-dismiss
      }
    );
  }

  /**
   * Update configuration
   */
  public configure(config: Partial<ErrorBoundaryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Global error boundary instance
 */
export const errorBoundary = new ErrorBoundary();

/**
 * Initialize error boundary with optional config
 */
export function initErrorBoundary(config?: Partial<ErrorBoundaryConfig>): void {
  if (config) {
    errorBoundary.configure(config);
  }
  errorBoundary.init();
}

/**
 * Destroy error boundary
 */
export function destroyErrorBoundary(): void {
  errorBoundary.destroy();
}
