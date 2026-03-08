/**
 * ZANOBOT - ONBOARDING TRACE SERVICE
 *
 * Provides step-by-step protocol logging for NFC onboarding and DB import.
 * Shows exactly where the process succeeded or failed for debugging.
 *
 * Features:
 * - Timestamped entries with status (OK/IN_PROGRESS/FAIL)
 * - Detailed information per step (machineId, customerId, URLs, HTTP status, etc.)
 * - Keeps last 30 entries
 * - Persists during errors (doesn't clear on failure)
 * - Provides copy-to-clipboard functionality
 *
 * Usage:
 *   import { onboardingTrace } from '@utils/onboardingTrace.js';
 *   onboardingTrace.start();
 *   onboardingTrace.step('deep_link_detected', { hash: '#/m/123?c=customer1' });
 *   onboardingTrace.success('machine_id_extracted', { machineId: '123' });
 *   onboardingTrace.fail('download_failed', { error: 'HTTP 404', url: '...' });
 */

import { logger } from './logger.js';
import { getLocale } from '../i18n/index.js';

/**
 * Trace entry status
 */
export type TraceStatus = 'pending' | 'in_progress' | 'success' | 'fail';

/**
 * Trace step identifiers (for i18n lookup)
 */
export type TraceStepId =
  // Deep Link Processing
  | 'deep_link_detected'
  | 'hash_parsed'
  | 'machine_id_extracted'
  | 'customer_id_extracted'
  | 'db_url_derived'
  | 'import_url_detected'
  // Download Process
  | 'download_started'
  | 'download_complete'
  | 'download_failed'
  // JSON Processing
  | 'json_parse_started'
  | 'json_parse_complete'
  | 'json_parse_failed'
  // Validation
  | 'schema_validation_started'
  | 'schema_validation_complete'
  | 'schema_validation_failed'
  // Database Operations
  | 'db_reset_started'
  | 'db_import_started'
  | 'db_import_complete'
  | 'db_import_failed'
  // App State
  | 'app_state_reload'
  // Machine Operations
  | 'machine_lookup'
  | 'machine_found'
  | 'machine_not_found'
  | 'machine_created'
  | 'machine_selected'
  | 'machine_not_in_import' // Target machine not found in imported database
  // Final Steps
  | 'test_dialog_shown'
  | 'process_complete'
  | 'process_failed'
  // UI Mode (NFC onboarding forces simple mode)
  | 'ui_mode_set'
  // Detection Mode (NFC onboarding forces STATIONARY/Level 1)
  | 'detection_mode_set'
  | 'detection_mode_ok'
  // Onboarding completion tracking
  | 'onboarding_complete'
  // Trace visibility tracking
  | 'trace_hidden';

/**
 * Trace entry with details
 */
export interface TraceEntry {
  id: string;
  timestamp: number;
  stepId: TraceStepId;
  status: TraceStatus;
  details: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Trace session info
 */
export interface TraceSession {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  source: 'nfc' | 'deep_link' | 'manual' | 'debug';
  entries: TraceEntry[];
  hasError: boolean;
  errorStep?: TraceStepId;
}

/**
 * Listeners for trace updates
 */
export type TraceListener = (session: TraceSession) => void;

/**
 * Configuration
 */
const MAX_ENTRIES = 30;

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Onboarding Trace Service
 */
export class OnboardingTraceService {
  private currentSession: TraceSession | null = null;
  private listeners: Set<TraceListener> = new Set();
  private stepStartTimes: Map<TraceStepId, number> = new Map();
  private _isActive: boolean = false;

  /**
   * Check if tracing is active
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Get current session
   */
  public getSession(): TraceSession | null {
    return this.currentSession;
  }

  /**
   * Start a new trace session
   * @param source - Source of the onboarding (nfc, deep_link, manual, debug)
   */
  public start(source: TraceSession['source'] = 'nfc'): void {
    this.currentSession = {
      sessionId: generateId(),
      startedAt: Date.now(),
      source,
      entries: [],
      hasError: false,
    };
    this._isActive = true;
    this.stepStartTimes.clear();

    logger.info(`[Trace] Session started: ${this.currentSession.sessionId} (${source})`);
    this.notifyListeners();
  }

  /**
   * End the current trace session
   */
  public end(): void {
    if (this.currentSession) {
      this.currentSession.endedAt = Date.now();
      logger.info(`[Trace] Session ended: ${this.currentSession.sessionId}`);
    }
    this._isActive = false;
    this.notifyListeners();
  }

  /**
   * Add a step in progress
   */
  public step(stepId: TraceStepId, details: Record<string, unknown> = {}): void {
    if (!this.currentSession) {
      return;
    }

    // Mark previous step as complete if it was in_progress
    const lastEntry = this.currentSession.entries[this.currentSession.entries.length - 1];
    if (lastEntry && lastEntry.status === 'in_progress') {
      lastEntry.status = 'success';
      const startTime = this.stepStartTimes.get(lastEntry.stepId);
      if (startTime) {
        lastEntry.durationMs = Date.now() - startTime;
      }
    }

    // Record start time
    this.stepStartTimes.set(stepId, Date.now());

    const entry: TraceEntry = {
      id: generateId(),
      timestamp: Date.now(),
      stepId,
      status: 'in_progress',
      details,
    };

    this.addEntry(entry);
    logger.debug(`[Trace] Step: ${stepId}`, details);
  }

  /**
   * Mark a step as successful
   */
  public success(stepId: TraceStepId, details: Record<string, unknown> = {}): void {
    if (!this.currentSession) {
      return;
    }

    // Check if there's a matching in_progress entry
    const existingEntry = this.currentSession.entries.find(
      e => e.stepId === stepId && e.status === 'in_progress'
    );

    if (existingEntry) {
      existingEntry.status = 'success';
      existingEntry.details = { ...existingEntry.details, ...details };
      const startTime = this.stepStartTimes.get(stepId);
      if (startTime) {
        existingEntry.durationMs = Date.now() - startTime;
      }
    } else {
      const entry: TraceEntry = {
        id: generateId(),
        timestamp: Date.now(),
        stepId,
        status: 'success',
        details,
      };
      this.addEntry(entry);
    }

    logger.debug(`[Trace] Success: ${stepId}`, details);
    this.notifyListeners();
  }

  /**
   * Mark a step as failed
   */
  public fail(stepId: TraceStepId, details: Record<string, unknown> = {}): void {
    if (!this.currentSession) {
      return;
    }

    // Check if there's a matching in_progress entry
    const existingEntry = this.currentSession.entries.find(
      e => e.stepId === stepId && e.status === 'in_progress'
    );

    if (existingEntry) {
      existingEntry.status = 'fail';
      existingEntry.details = { ...existingEntry.details, ...details };
      const startTime = this.stepStartTimes.get(stepId);
      if (startTime) {
        existingEntry.durationMs = Date.now() - startTime;
      }
    } else {
      const entry: TraceEntry = {
        id: generateId(),
        timestamp: Date.now(),
        stepId,
        status: 'fail',
        details,
      };
      this.addEntry(entry);
    }

    this.currentSession.hasError = true;
    this.currentSession.errorStep = stepId;

    logger.error(`[Trace] Fail: ${stepId}`, details);
    this.notifyListeners();
  }

  /**
   * Add an entry and enforce max limit
   */
  private addEntry(entry: TraceEntry): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.entries.push(entry);

    // Enforce max entries limit
    if (this.currentSession.entries.length > MAX_ENTRIES) {
      this.currentSession.entries = this.currentSession.entries.slice(-MAX_ENTRIES);
    }

    this.notifyListeners();
  }

  /**
   * Subscribe to trace updates
   */
  public subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state
    if (this.currentSession) {
      listener(this.currentSession);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    if (this.currentSession) {
      this.listeners.forEach(listener => listener(this.currentSession!));
    }
  }

  /**
   * Get formatted trace for clipboard
   */
  public getFormattedTrace(): string {
    if (!this.currentSession) {
      return 'Kein Protokoll vorhanden';
    }

    const session = this.currentSession;
    const lines: string[] = [];

    lines.push('=== ZANOBOT Onboarding-Protokoll ===');
    lines.push(`Session: ${session.sessionId}`);
    lines.push(`Quelle: ${session.source}`);
    lines.push(`Start: ${new Date(session.startedAt).toLocaleString(getLocale())}`);
    if (session.endedAt) {
      lines.push(`Ende: ${new Date(session.endedAt).toLocaleString(getLocale())}`);
      lines.push(`Dauer: ${session.endedAt - session.startedAt}ms`);
    }
    lines.push(`Status: ${session.hasError ? 'FEHLER' : 'OK'}`);
    if (session.errorStep) {
      lines.push(`Fehlerstelle: ${session.errorStep}`);
    }
    lines.push('');
    lines.push('--- Schritte ---');

    for (const entry of session.entries) {
      const time = new Date(entry.timestamp).toLocaleTimeString(getLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const status = entry.status === 'success' ? 'OK' :
                     entry.status === 'fail' ? 'FAIL' :
                     entry.status === 'in_progress' ? '...' : '?';
      const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : '';

      lines.push(`[${time}] [${status}] ${entry.stepId}${duration}`);

      // Add relevant details
      const details = entry.details;
      if (Object.keys(details).length > 0) {
        for (const [key, value] of Object.entries(details)) {
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          // Truncate long values
          const truncated = displayValue.length > 100
            ? displayValue.substring(0, 100) + '...'
            : displayValue;
          lines.push(`    ${key}: ${truncated}`);
        }
      }
    }

    lines.push('');
    lines.push('=== Ende Protokoll ===');

    return lines.join('\n');
  }

  /**
   * Copy trace to clipboard
   */
  public async copyToClipboard(): Promise<boolean> {
    try {
      const text = this.getFormattedTrace();
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      logger.error('[Trace] Failed to copy to clipboard:', error);
      return false;
    }
  }

  /**
   * Check if trace should be shown based on URL parameters
   */
  public static shouldShowTrace(): boolean {
    // Show if debug=1 in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      return true;
    }

    // Show if hash-based deep link present
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/m/')) {
      return true;
    }

    return false;
  }

  /**
   * Reset/clear the current session
   */
  public reset(): void {
    this.currentSession = null;
    this._isActive = false;
    this.stepStartTimes.clear();
    this.notifyListeners();
  }

  /**
   * Check if the current session completed successfully.
   * Not just "no errors" - also verifies critical steps were completed.
   *
   * Required steps for a valid successful onboarding:
   * - Machine must be found, created, or selected
   * - Test dialog must be shown
   * - Onboarding must be marked complete
   *
   * @returns true if session exists, has ended, has no errors, AND critical steps passed
   */
  public isSuccessful(): boolean {
    if (!this.currentSession) {
      return false;
    }

    // Must have ended
    if (!this.currentSession.endedAt) {
      return false;
    }

    // Must have no errors
    if (this.currentSession.hasError) {
      return false;
    }

    // Check for critical success steps (not just absence of failure)
    const successSteps = this.currentSession.entries.filter(e => e.status === 'success');
    const successStepIds = new Set(successSteps.map(e => e.stepId));

    // Machine must have been handled (found, created, or selected)
    const hasMachineStep = successStepIds.has('machine_found') ||
                           successStepIds.has('machine_created') ||
                           successStepIds.has('machine_selected');

    // Test dialog must have been shown
    const hasTestDialogStep = successStepIds.has('test_dialog_shown');

    // Onboarding must be marked complete
    const hasOnboardingComplete = successStepIds.has('onboarding_complete');

    return hasMachineStep && hasTestDialogStep && hasOnboardingComplete;
  }

  /**
   * Check if the trace overlay should be automatically hidden.
   *
   * Rules:
   * - If debug=1 in URL: NEVER auto-hide (always visible for developers)
   * - If session has error: NEVER auto-hide (keep visible for debugging)
   * - If session completed successfully: AUTO-HIDE
   *
   * @returns true if trace should be automatically hidden
   */
  public shouldAutoHide(): boolean {
    // Check for explicit debug mode - never hide in debug mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      return false;
    }

    // Auto-hide only on successful completion
    return this.isSuccessful();
  }
}

/**
 * Global trace service instance
 */
export const onboardingTrace = new OnboardingTraceService();
