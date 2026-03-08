/**
 * ZANOBOT - CENTRALIZED LOGGING UTILITY
 *
 * Provides conditional logging based on environment.
 * In production, console logs are suppressed to reduce noise and improve performance.
 *
 * Usage:
 *   import { logger } from '@utils/logger.js';
 *   logger.info('User action', { machineId: '123' });
 *   logger.error('API failure', error);
 *   logger.debug('Debug info', data);
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableStackTrace: boolean;
}

/**
 * Default configuration based on environment
 */
const getDefaultConfig = (): LoggerConfig => {
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  return {
    level: isDevelopment ? LogLevel.DEBUG : LogLevel.WARN,
    enableTimestamp: true,
    enableStackTrace: isDevelopment,
  };
};

/**
 * Logger class
 */
class Logger {
  private config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Update logger configuration
   */
  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Debug log (development only)
   */
  public debug(message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, args, console.debug);
    }
  }

  /**
   * Info log
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.INFO) {
      this.log('INFO', message, args, console.log);
    }
  }

  /**
   * Warning log
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.WARN) {
      this.log('WARN', message, args, console.warn);
    }
  }

  /**
   * Error log
   */
  public error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.config.level <= LogLevel.ERROR) {
      const errorInfo = error instanceof Error ? error.message : String(error);
      const stack =
        error instanceof Error && this.config.enableStackTrace ? error.stack : undefined;

      this.log('ERROR', message, [errorInfo, ...args], console.error);

      if (stack) {
        console.error('Stack trace:', stack);
      }
    }
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, args: unknown[], logFn: (...data: unknown[]) => void): void {
    const timestamp = this.config.enableTimestamp ? new Date().toISOString() : '';
    const prefix = timestamp ? `[${timestamp}] [${level}]` : `[${level}]`;

    if (args.length > 0) {
      logFn(prefix, message, ...args);
    } else {
      logFn(prefix, message);
    }
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Shorthand logging functions (for convenience)
 */
export const log = {
  debug: (message: string, ...args: unknown[]) => logger.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => logger.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => logger.warn(message, ...args),
  error: (message: string, error?: Error | unknown, ...args: unknown[]) =>
    logger.error(message, error, ...args),
};
