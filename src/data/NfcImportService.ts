/**
 * ZANOBOT - NFC IMPORT SERVICE
 *
 * Handles database import via NFC deep links.
 * When the app is opened with ?importUrl=<url>, this service:
 * 1. Fetches the backup data from the URL
 * 2. Validates it's actually JSON (not GitHub HTML page)
 * 3. Shows a confirmation dialog
 * 4. Imports the data if user confirms
 *
 * Security:
 * - Never auto-imports without user confirmation
 * - Validates content-type and content structure
 * - Handles GitHub blob vs raw URL mistakes
 */

import { importData, getDBStats } from './db.js';
import { logger } from '@utils/logger.js';
import { escapeHtml } from '@utils/sanitize.js';
import { t, getLocale } from '../i18n/index.js';

/**
 * Result of the NFC import check
 */
export interface NfcImportCheckResult {
  hasImportUrl: boolean;
  importUrl?: string;
}

/**
 * Result of fetching and validating import data
 */
export interface NfcImportFetchResult {
  success: boolean;
  error?: 'invalid_url' | 'fetch_failed' | 'not_json' | 'github_blob_url' | 'invalid_structure';
  errorMessage?: string;
  data?: ImportData;
  metadata?: ImportMetadata;
}

/**
 * Metadata extracted from import data
 */
export interface ImportMetadata {
  machineCount: number;
  recordingCount: number;
  diagnosisCount: number;
  exportDate?: string;
  sourceUrl: string;
}

/**
 * Expected structure of import data
 */
interface ImportData {
  machines?: unknown[];
  recordings?: unknown[];
  diagnoses?: unknown[];
  exportedAt?: string;
}

/**
 * Maximum allowed import file size (50 MB)
 * Prevents memory exhaustion from maliciously large files
 */
const MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * NFC Import Service
 * Handles the entire NFC deep link import workflow
 */
export class NfcImportService {
  private importUrl: string | null = null;
  private fetchedData: ImportData | null = null;
  private metadata: ImportMetadata | null = null;

  /**
   * Check if the current URL contains an import parameter
   * Supports both ?importUrl= and legacy ?import= parameters
   */
  public checkForImportUrl(): NfcImportCheckResult {
    const params = new URLSearchParams(window.location.search);

    // Check for importUrl parameter (primary)
    let importUrl = params.get('importUrl');

    // Fallback to 'import' parameter
    if (!importUrl) {
      importUrl = params.get('import');
    }

    if (importUrl) {
      try {
        // Validate it's a valid URL
        new URL(importUrl);
        this.importUrl = importUrl;
        logger.info(`🔗 NFC import URL detected: ${importUrl}`);
        return { hasImportUrl: true, importUrl };
      } catch {
        logger.warn(`⚠️ Invalid import URL in query string: ${importUrl}`);
        return { hasImportUrl: false };
      }
    }

    return { hasImportUrl: false };
  }

  /**
   * Fetch and validate the import data from URL
   * Includes GitHub blob vs raw URL detection
   */
  public async fetchAndValidate(): Promise<NfcImportFetchResult> {
    if (!this.importUrl) {
      return { success: false, error: 'invalid_url', errorMessage: 'No import URL set' };
    }

    // Check for common GitHub blob URL mistake
    if (this.isGitHubBlobUrl(this.importUrl)) {
      const rawUrl = this.convertToRawUrl(this.importUrl);
      logger.error(`❌ GitHub blob URL detected. User should use raw URL instead.`);
      logger.info(`   Suggested raw URL: ${rawUrl}`);

      return {
        success: false,
        error: 'github_blob_url',
        errorMessage: t('nfcImport.errorGitHubBlob') ||
          `Fehler: Bitte nutzen Sie den 'Raw'-Link von GitHub, nicht den Web-Link.\n\nVersuchen Sie stattdessen:\n${rawUrl}`,
      };
    }

    try {
      logger.info(`📥 Fetching import data from: ${this.importUrl}`);

      const response = await fetch(this.importUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.error(`❌ Fetch failed: HTTP ${response.status}`);
        return {
          success: false,
          error: 'fetch_failed',
          errorMessage: t('nfcImport.errorFetchFailed') ||
            `Download fehlgeschlagen (HTTP ${response.status}). Bitte prüfen Sie die URL.`,
        };
      }

      // SECURITY: Check Content-Length to prevent memory exhaustion
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > MAX_IMPORT_SIZE_BYTES) {
          const sizeMB = (size / (1024 * 1024)).toFixed(1);
          const maxMB = (MAX_IMPORT_SIZE_BYTES / (1024 * 1024)).toFixed(0);
          logger.error(`❌ Import file too large: ${sizeMB} MB (max: ${maxMB} MB)`);
          return {
            success: false,
            error: 'fetch_failed',
            errorMessage: t('nfcImport.errorFileTooLarge') ||
              `Datei zu groß (${sizeMB} MB). Maximale Größe: ${maxMB} MB.`,
          };
        }
      }

      // Check content-type header
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
        // Could still be JSON with wrong content-type, check content
        const text = await response.text();

        // Check if it's HTML (GitHub page instead of raw)
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          logger.error(`❌ Received HTML instead of JSON. Likely a GitHub blob URL.`);
          return {
            success: false,
            error: 'not_json',
            errorMessage: t('nfcImport.errorNotJson') ||
              `Fehler: Die URL liefert HTML statt JSON.\n\nBitte nutzen Sie den 'Raw'-Link von GitHub:\n1. Öffnen Sie die Datei auf GitHub\n2. Klicken Sie auf 'Raw'\n3. Kopieren Sie die URL aus der Adressleiste`,
          };
        }

        // Try to parse as JSON anyway
        try {
          this.fetchedData = JSON.parse(text) as ImportData;
        } catch {
          logger.error(`❌ Failed to parse response as JSON`);
          return {
            success: false,
            error: 'not_json',
            errorMessage: t('nfcImport.errorInvalidJson') ||
              'Fehler: Die Datei enthält kein gültiges JSON-Format.',
          };
        }
      } else {
        // Content-type is JSON, parse directly
        try {
          this.fetchedData = await response.json() as ImportData;
        } catch {
          logger.error(`❌ Failed to parse JSON response`);
          return {
            success: false,
            error: 'not_json',
            errorMessage: t('nfcImport.errorInvalidJson') ||
              'Fehler: Die Datei enthält kein gültiges JSON-Format.',
          };
        }
      }

      // Validate structure
      if (!this.isValidImportData(this.fetchedData)) {
        logger.error(`❌ Invalid import data structure`);
        return {
          success: false,
          error: 'invalid_structure',
          errorMessage: t('nfcImport.errorInvalidStructure') ||
            'Fehler: Die Datei hat nicht das erwartete Backup-Format.',
        };
      }

      // Extract metadata
      this.metadata = {
        machineCount: this.fetchedData.machines?.length || 0,
        recordingCount: this.fetchedData.recordings?.length || 0,
        diagnosisCount: this.fetchedData.diagnoses?.length || 0,
        exportDate: this.fetchedData.exportedAt,
        sourceUrl: this.importUrl,
      };

      logger.info(`✅ Import data validated:`);
      logger.info(`   Machines: ${this.metadata.machineCount}`);
      logger.info(`   Recordings: ${this.metadata.recordingCount}`);
      logger.info(`   Diagnoses: ${this.metadata.diagnosisCount}`);

      return {
        success: true,
        data: this.fetchedData,
        metadata: this.metadata,
      };
    } catch (error) {
      logger.error(`❌ Fetch error:`, error);
      return {
        success: false,
        error: 'fetch_failed',
        errorMessage: t('nfcImport.errorNetwork') ||
          'Netzwerkfehler beim Laden der Daten. Bitte prüfen Sie Ihre Internetverbindung.',
      };
    }
  }

  /**
   * Show confirmation dialog and handle import
   * Returns true if import was successful, false if cancelled or failed
   */
  public async showConfirmationAndImport(): Promise<boolean> {
    if (!this.fetchedData || !this.metadata) {
      logger.error('No data to import. Call fetchAndValidate() first.');
      return false;
    }

    // Get current DB stats for comparison
    const currentStats = await getDBStats();

    // Create and show modal
    const confirmed = await this.showImportModal(this.metadata, currentStats);

    if (!confirmed) {
      logger.info('🚫 Import cancelled by user');
      this.cleanupUrl();
      return false;
    }

    // Perform import
    try {
      logger.info('📥 Importing data...');
      await importData(this.fetchedData as Parameters<typeof importData>[0], false);
      logger.info('✅ Import completed successfully');
      this.cleanupUrl();
      return true;
    } catch (error) {
      logger.error('❌ Import failed:', error);
      throw error;
    }
  }

  /**
   * Show the import confirmation modal
   * Returns promise that resolves to true (confirm) or false (cancel)
   */
  private showImportModal(
    metadata: ImportMetadata,
    currentStats: { machines: number; recordings: number; diagnoses: number }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Create modal HTML
      const modal = document.createElement('div');
      modal.className = 'modal nfc-import-modal';
      modal.id = 'nfc-import-modal';
      modal.style.display = 'flex';

      const exportDateStr = escapeHtml(
        metadata.exportDate
          ? new Date(metadata.exportDate).toLocaleString(getLocale())
          : t('common.unknown')
      );

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>${t('nfcImport.modalTitle') || 'Backup via NFC erkannt'}</h3>
            <button class="modal-close" id="nfc-import-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="import-warning">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p>${t('nfcImport.warningOverwrite') || 'Achtung: Die lokale Datenbank wird überschrieben!'}</p>
            </div>

            <div class="import-comparison">
              <div class="import-column">
                <h4>${t('nfcImport.currentData') || 'Aktuelle Daten'}</h4>
                <ul>
                  <li><strong>${currentStats.machines}</strong> ${t('common.machines') || 'Maschinen'}</li>
                  <li><strong>${currentStats.recordings}</strong> ${t('common.recordings') || 'Aufnahmen'}</li>
                  <li><strong>${currentStats.diagnoses}</strong> ${t('common.diagnoses') || 'Diagnosen'}</li>
                </ul>
              </div>
              <div class="import-arrow">→</div>
              <div class="import-column import-new">
                <h4>${t('nfcImport.newData') || 'Neue Daten'}</h4>
                <ul>
                  <li><strong>${metadata.machineCount}</strong> ${t('common.machines') || 'Maschinen'}</li>
                  <li><strong>${metadata.recordingCount}</strong> ${t('common.recordings') || 'Aufnahmen'}</li>
                  <li><strong>${metadata.diagnosisCount}</strong> ${t('common.diagnoses') || 'Diagnosen'}</li>
                </ul>
                <p class="export-date">${t('nfcImport.exportedAt') || 'Exportiert am'}: ${exportDateStr}</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="nfc-import-cancel">
              ${t('buttons.cancel') || 'Abbrechen'}
            </button>
            <button class="btn btn-danger" id="nfc-import-confirm">
              ${t('nfcImport.confirmButton') || 'Daten importieren'}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Event handlers
      const confirmBtn = modal.querySelector('#nfc-import-confirm') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('#nfc-import-cancel') as HTMLButtonElement;
      const closeBtn = modal.querySelector('#nfc-import-close') as HTMLButtonElement;

      const cleanup = (result: boolean) => {
        modal.remove();
        resolve(result);
      };

      confirmBtn?.addEventListener('click', () => cleanup(true));
      cancelBtn?.addEventListener('click', () => cleanup(false));
      closeBtn?.addEventListener('click', () => cleanup(false));

      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup(false);
        }
      });

      // Close on Escape
      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          cleanup(false);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  }

  /**
   * Check if URL is a GitHub blob URL (not raw)
   */
  private isGitHubBlobUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'github.com' && parsed.pathname.includes('/blob/');
    } catch {
      return false;
    }
  }

  /**
   * Convert GitHub blob URL to raw URL
   */
  private convertToRawUrl(blobUrl: string): string {
    try {
      const parsed = new URL(blobUrl);
      // github.com/user/repo/blob/branch/path -> raw.githubusercontent.com/user/repo/branch/path
      const pathParts = parsed.pathname.split('/');
      const blobIndex = pathParts.indexOf('blob');

      if (blobIndex !== -1) {
        // Remove 'blob' from path
        pathParts.splice(blobIndex, 1);
        const newPath = pathParts.join('/');
        return `https://raw.githubusercontent.com${newPath}`;
      }

      return blobUrl;
    } catch {
      return blobUrl;
    }
  }

  /**
   * Validate import data structure
   */
  private isValidImportData(data: unknown): data is ImportData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Must have at least one of machines, recordings, or diagnoses
    const hasMachines = Array.isArray(obj.machines);
    const hasRecordings = Array.isArray(obj.recordings);
    const hasDiagnoses = Array.isArray(obj.diagnoses);

    return hasMachines || hasRecordings || hasDiagnoses;
  }

  /**
   * Clean up URL by removing import parameter
   * Keeps the URL clean after import
   */
  private cleanupUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('importUrl');
    url.searchParams.delete('import');

    // Replace URL without reload
    window.history.replaceState({}, document.title, url.toString());
    logger.info('🧹 Import URL parameter cleaned from address bar');
  }

  /**
   * Show error modal for import failures
   */
  public showErrorModal(errorMessage: string): void {
    const modal = document.createElement('div');
    modal.className = 'modal nfc-import-modal';
    modal.id = 'nfc-import-error-modal';
    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header error">
          <h3>${t('nfcImport.errorTitle') || 'Import fehlgeschlagen'}</h3>
          <button class="modal-close" id="nfc-error-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="import-error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--status-critical)" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <p class="error-message">${escapeHtml(errorMessage)}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="nfc-error-ok">
            ${t('buttons.ok') || 'OK'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector('#nfc-error-ok') as HTMLButtonElement;
    const closeBtn = modal.querySelector('#nfc-error-close') as HTMLButtonElement;

    const cleanup = () => {
      modal.remove();
      this.cleanupUrl();
    };

    okBtn?.addEventListener('click', cleanup);
    closeBtn?.addEventListener('click', cleanup);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup();
    });
  }

  /**
   * Import database from an external URL (used by #/import?url=... deep links)
   *
   * Full workflow:
   * 1. Validates the URL
   * 2. Converts GitHub blob URLs to raw URLs automatically
   * 3. Fetches and validates JSON data
   * 4. Imports into local database
   *
   * Security:
   * - Only processes JSON data (HTML responses are rejected)
   * - Validates content structure before import
   * - Size limit enforced (50 MB)
   * - No script execution possible (JSON.parse only)
   *
   * @param targetUrl - The URL to fetch the database JSON from
   * @param callbacks - Optional progress/status callbacks
   * @returns Result with success flag and metadata
   */
  public async importFromExternalUrl(
    targetUrl: string,
    callbacks?: {
      onProgress?: (status: string) => void;
      onError?: (errorMessage: string) => void;
    }
  ): Promise<{ success: boolean; errorMessage?: string; metadata?: ImportMetadata }> {
    // Step 1: Validate URL
    try {
      new URL(targetUrl);
    } catch {
      const msg = t('urlImport.errorInvalidUrl') || 'Ungültige URL.';
      callbacks?.onError?.(msg);
      return { success: false, errorMessage: msg };
    }

    // Step 2: Auto-convert GitHub blob URLs to raw URLs
    let fetchUrl = targetUrl;
    if (this.isGitHubBlobUrl(targetUrl)) {
      fetchUrl = this.convertToRawUrl(targetUrl);
      logger.info(`🔄 GitHub blob URL auto-converted to raw: ${fetchUrl}`);
    }

    // Step 3: Fetch the data
    callbacks?.onProgress?.(t('urlImport.statusFetching') || 'Datenbank wird geladen...');

    try {
      const response = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const msg = (t('urlImport.errorFetchFailed') || 'Download fehlgeschlagen (HTTP {{status}}).')
          .replace('{{status}}', String(response.status));
        callbacks?.onError?.(msg);
        return { success: false, errorMessage: msg };
      }

      // SECURITY: Check Content-Length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > MAX_IMPORT_SIZE_BYTES) {
          const sizeMB = (size / (1024 * 1024)).toFixed(1);
          const maxMB = (MAX_IMPORT_SIZE_BYTES / (1024 * 1024)).toFixed(0);
          const msg = (t('urlImport.errorFileTooLarge') || `Datei zu groß (${sizeMB} MB). Maximale Größe: ${maxMB} MB.`);
          callbacks?.onError?.(msg);
          return { success: false, errorMessage: msg };
        }
      }

      // Step 4: Parse response
      callbacks?.onProgress?.(t('urlImport.statusValidating') || 'Daten werden geprüft...');

      const text = await response.text();

      // SECURITY: Reject HTML responses (wrong URL / GitHub page)
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        const msg = t('urlImport.errorNotJson') ||
          'Die URL liefert HTML statt JSON. Bitte prüfen Sie den Link.';
        callbacks?.onError?.(msg);
        return { success: false, errorMessage: msg };
      }

      let data: ImportData;
      try {
        data = JSON.parse(text) as ImportData;
      } catch {
        const msg = t('urlImport.errorInvalidJson') ||
          'Die Datei enthält kein gültiges JSON-Format.';
        callbacks?.onError?.(msg);
        return { success: false, errorMessage: msg };
      }

      // Step 5: Validate structure
      if (!this.isValidImportData(data)) {
        const msg = t('urlImport.errorInvalidStructure') ||
          'Die Datei hat nicht das erwartete Datenbank-Format.';
        callbacks?.onError?.(msg);
        return { success: false, errorMessage: msg };
      }

      // Extract metadata
      const metadata: ImportMetadata = {
        machineCount: data.machines?.length || 0,
        recordingCount: data.recordings?.length || 0,
        diagnosisCount: data.diagnoses?.length || 0,
        exportDate: data.exportedAt,
        sourceUrl: targetUrl,
      };

      logger.info(`✅ External URL data validated: ${metadata.machineCount} machines, ${metadata.recordingCount} recordings, ${metadata.diagnosisCount} diagnoses`);

      // Step 6: Import data
      callbacks?.onProgress?.(t('urlImport.statusImporting') || 'Daten werden importiert...');
      await importData(data as Parameters<typeof importData>[0], false);

      logger.info('✅ External URL import completed successfully');

      // Clean hash after successful import
      this.cleanupHash();

      return { success: true, metadata };
    } catch (error) {
      logger.error('❌ External URL import failed:', error);
      const msg = t('urlImport.errorNetwork') ||
        'Netzwerkfehler beim Laden der Daten. Bitte prüfen Sie Ihre Internetverbindung.';
      callbacks?.onError?.(msg);
      return { success: false, errorMessage: msg };
    }
  }

  /**
   * Clean up the hash after import processing
   */
  private cleanupHash(): void {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    logger.info('🧹 Import hash cleaned from URL');
  }
}

/**
 * Singleton instance for easy access
 */
export const nfcImportService = new NfcImportService();
