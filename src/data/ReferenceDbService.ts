/**
 * ZANOBOT - REFERENCE DATABASE SERVICE
 *
 * Handles downloading and managing reference databases for NFC-based machine setup.
 * Enables Basisnutzer to automatically download reference data when scanning NFC tags.
 *
 * Flow (MVP - Variante B):
 * 1. NFC tag contains: #/m/<machineId>?c=<customerId>
 * 2. HashRouter derives referenceDbUrl: https://gunterstruck.github.io/<customerId>/db-latest.json
 * 3. ReferenceDbService downloads and imports the full database export (replace/reset)
 * 4. Machine is auto-created or updated, reference models are applied
 *
 * Note: The referenceDbUrl is derived at runtime from the customerId parameter.
 * There is no manual URL entry - all data comes from the official GitHub Pages source.
 */

import {
  getMachine,
  saveMachine,
  getReferenceDatabase,
  saveReferenceDatabase,
  hasReferenceDatabase,
  importData,
  getAllMachines,
} from './db.js';
import type { Machine, ReferenceDatabase, GMIAModel, ReferenceDbFile, ReferenceDbMeta, FleetDbFile } from './types.js';
import { logger } from '@utils/logger.js';
import { onboardingTrace } from '@utils/onboardingTrace.js';

/**
 * Result of a reference database download operation
 */
export interface DownloadResult {
  success: boolean;
  error?: string;
  version?: string;
  modelsImported?: number;
  dbMeta?: ReferenceDbMeta;
}

/**
 * Result of fetching and validating a reference database
 * Used internally to validate downloaded data before importing
 */
export interface FetchValidateResult {
  success: boolean;
  error?: string;
  dbMeta?: ReferenceDbMeta;
  modelsCount?: number;
  rawData?: ReferenceDbFile;
}

/**
 * Result of version check
 */
export interface VersionCheckResult {
  needsUpdate: boolean;
  localVersion?: string;
  remoteVersion?: string;
  reason?: 'no_local_db' | 'version_higher' | 'version_same_or_lower' | 'error';
}

/**
 * Progress callback for download status updates
 */
export type ProgressCallback = (status: string, progress?: number) => void;

/**
 * Reference Database Service
 *
 * Manages downloading, validating, and applying reference databases
 * from Google Drive for NFC-based machine setup.
 *
 * Key principles:
 * - Official reference databases are versioned (db_meta.db_version)
 * - Local copies are only updated when remote version > local version
 * - User-added local references are preserved during updates
 * - No automatic overwrites without explicit version upgrade
 */
export class ReferenceDbService {
  /**
   * Compare two semantic versions
   *
   * @param versionA - First version (e.g., "1.0.0")
   * @param versionB - Second version (e.g., "1.2.0")
   * @returns -1 if A < B, 0 if A == B, 1 if A > B
   */
  public static compareVersions(versionA: string, versionB: string): number {
    // Default to "0.0.0" for missing versions
    const a = (versionA || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
    const b = (versionB || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);

    // Ensure both arrays have 3 elements
    while (a.length < 3) a.push(0);
    while (b.length < 3) b.push(0);

    for (let i = 0; i < 3; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }

    return 0;
  }

  /**
   * Check if a machine needs reference database download
   * (Initial download - no local DB exists)
   *
   * @param machineId - Machine ID to check
   * @returns True if machine has referenceDbUrl but no local reference data
   */
  public static async needsDownload(machineId: string): Promise<boolean> {
    const machine = await getMachine(machineId);

    if (!machine) {
      return false;
    }

    // No reference URL configured - nothing to download
    if (!machine.referenceDbUrl) {
      return false;
    }

    // Check if reference DB already downloaded locally
    const hasLocalDb = await hasReferenceDatabase(machineId);

    return !hasLocalDb;
  }

  /**
   * Check if machine needs a reference database update
   * Only returns true if remote version > local version
   *
   * @param machineId - Machine ID to check
   * @returns VersionCheckResult with details about the update status
   */
  public static async needsUpdate(machineId: string): Promise<VersionCheckResult> {
    const machine = await getMachine(machineId);

    if (!machine?.referenceDbUrl) {
      return { needsUpdate: false, reason: 'error' };
    }

    const localDb = await getReferenceDatabase(machineId);

    // No local DB exists - needs initial download
    if (!localDb) {
      return { needsUpdate: true, reason: 'no_local_db' };
    }

    try {
      // Fetch remote database to check version
      const response = await this.fetchWithRetry(machine.referenceDbUrl);

      if (!response.ok) {
        logger.warn(`Failed to check remote version: HTTP ${response.status}`);
        return { needsUpdate: false, localVersion: localDb.version, reason: 'error' };
      }

      const rawData = await response.json();
      const remoteVersion = this.extractVersion(rawData);
      const localVersion = localDb.version;

      // Compare versions - only update if remote is HIGHER
      const comparison = this.compareVersions(remoteVersion, localVersion);

      if (comparison > 0) {
        logger.info(`📦 Update available: ${localVersion} → ${remoteVersion}`);
        return {
          needsUpdate: true,
          localVersion,
          remoteVersion,
          reason: 'version_higher',
        };
      }

      logger.info(`✓ Local DB is up-to-date (v${localVersion})`);
      return {
        needsUpdate: false,
        localVersion,
        remoteVersion,
        reason: 'version_same_or_lower',
      };
    } catch (error) {
      logger.error('Error checking for updates:', error);
      return { needsUpdate: false, localVersion: localDb.version, reason: 'error' };
    }
  }

  /**
   * Extract version from reference database file
   * Supports both new db_meta format and legacy config.version
   */
  private static extractVersion(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return '1.0.0';
    }

    const d = data as Record<string, unknown>;

    // New format: db_meta.db_version
    if (d.db_meta && typeof d.db_meta === 'object') {
      const meta = d.db_meta as Record<string, unknown>;
      if (typeof meta.db_version === 'string') {
        return meta.db_version;
      }
    }

    // Legacy format: data.config.version or config.version
    const dataObj = d.data as Record<string, unknown> | undefined;
    if (dataObj?.config && typeof dataObj.config === 'object') {
      const config = dataObj.config as Record<string, unknown>;
      if (typeof config.version === 'string') {
        return config.version;
      }
    }

    if (d.config && typeof d.config === 'object') {
      const config = d.config as Record<string, unknown>;
      if (typeof config.version === 'string') {
        return config.version;
      }
    }

    return '1.0.0';
  }

  /**
   * Fetch and validate a reference database without saving
   * Used internally to validate downloaded data before importing
   *
   * @param url - URL to fetch the reference database from
   * @returns Validation result with metadata
   */
  public static async fetchAndValidate(url: string): Promise<FetchValidateResult> {
    try {
      // Validate URL first
      const urlValidation = this.validateUrl(url);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error };
      }

      // Fetch the database
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        return { success: false, error: 'download_failed' };
      }

      // Parse JSON
      let rawData: unknown;
      try {
        rawData = await response.json();
      } catch {
        return { success: false, error: 'invalid_json' };
      }

      // Validate structure and extract metadata
      const normalizedData = this.normalizeReferenceData(rawData);

      if (!normalizedData) {
        return { success: false, error: 'invalid_format' };
      }

      // Extract db_meta
      const dbMeta = this.extractDbMeta(rawData);
      const models = normalizedData.models || normalizedData.referenceModels || [];

      // Validate models if present
      if (models.length > 0) {
        for (const model of models) {
          if (!this.isValidModel(model)) {
            return { success: false, error: 'invalid_model_format' };
          }
        }
      }

      return {
        success: true,
        dbMeta,
        modelsCount: models.length,
        rawData: normalizedData,
      };
    } catch (error) {
      logger.error('fetchAndValidate error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      };
    }
  }

  /**
   * Extract db_meta from raw data
   */
  private static extractDbMeta(data: unknown): ReferenceDbMeta | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const d = data as Record<string, unknown>;

    if (d.db_meta && typeof d.db_meta === 'object') {
      const meta = d.db_meta as Record<string, unknown>;
      return {
        db_version: (meta.db_version as string) || '1.0.0',
        created_by: (meta.created_by as string) || 'unknown',
        created_at: (meta.created_at as string) || new Date().toISOString().split('T')[0],
        description: meta.description as string | undefined,
      };
    }

    // Create synthetic meta from legacy format
    return {
      db_version: this.extractVersion(data),
      created_by: 'legacy',
      created_at: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Normalize reference data to standard format
   * Handles both new db_meta format and legacy formats
   */
  private static normalizeReferenceData(data: unknown): ReferenceDbFile | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const d = data as Record<string, unknown>;

    // New format with db_meta
    if (d.db_meta && typeof d.db_meta === 'object') {
      return {
        db_meta: d.db_meta as ReferenceDbMeta,
        models: (d.models as GMIAModel[]) || [],
        references: d.references as unknown[] | undefined,
        // Also include any legacy fields if present
        referenceModels: d.referenceModels as GMIAModel[] | undefined,
        machineName: d.machineName as string | undefined,
        location: d.location as string | undefined,
        notes: d.notes as string | undefined,
        config: d.config as Record<string, unknown> | undefined,
      };
    }

    // Legacy format with 'data' wrapper
    if (d.data && typeof d.data === 'object') {
      const inner = d.data as Record<string, unknown>;
      return {
        db_meta: {
          db_version: this.extractVersion(d),
          created_by: 'legacy',
          created_at: new Date().toISOString().split('T')[0],
        },
        models: (inner.referenceModels as GMIAModel[]) || [],
        referenceModels: inner.referenceModels as GMIAModel[] | undefined,
        machineName: inner.machineName as string | undefined,
        location: inner.location as string | undefined,
        notes: inner.notes as string | undefined,
        config: inner.config as Record<string, unknown> | undefined,
      };
    }

    // Direct legacy format
    if (d.referenceModels || d.config) {
      return {
        db_meta: {
          db_version: this.extractVersion(d),
          created_by: 'legacy',
          created_at: new Date().toISOString().split('T')[0],
        },
        models: (d.referenceModels as GMIAModel[]) || [],
        referenceModels: d.referenceModels as GMIAModel[] | undefined,
        machineName: d.machineName as string | undefined,
        location: d.location as string | undefined,
        notes: d.notes as string | undefined,
        config: d.config as Record<string, unknown> | undefined,
      };
    }

    return null;
  }

  /**
   * Download and apply reference database for a machine
   * Respects versioning: only updates if remote version > local version
   * Preserves locally added references during updates
   *
   * @param machineId - Machine ID
   * @param onProgress - Progress callback for UI updates
   * @param forceUpdate - Skip version check (used for initial setup)
   * @returns Download result
   */
  public static async downloadAndApply(
    machineId: string,
    onProgress?: ProgressCallback,
    forceUpdate: boolean = false
  ): Promise<DownloadResult> {
    try {
      // Get machine configuration
      const machine = await getMachine(machineId);

      if (!machine) {
        onboardingTrace.fail('db_import_failed', { reason: 'machine_not_found', machineId });
        return { success: false, error: 'machine_not_found' };
      }

      if (!machine.referenceDbUrl) {
        onboardingTrace.fail('db_import_failed', { reason: 'no_reference_url', machineId });
        return { success: false, error: 'no_reference_url' };
      }

      // Get existing local database to preserve local references
      const existingLocalDb = await getReferenceDatabase(machineId);

      onProgress?.('downloading', 10);

      // Trace: Download started
      onboardingTrace.step('download_started', {
        url: machine.referenceDbUrl,
        machineId,
      });

      // Download the reference database
      const response = await this.fetchWithRetry(machine.referenceDbUrl);

      if (!response.ok) {
        logger.error(`Failed to download reference DB: HTTP ${response.status}`);
        // Trace: Download failed
        onboardingTrace.fail('download_failed', {
          httpStatus: response.status,
          statusText: response.statusText,
          url: machine.referenceDbUrl,
        });
        return { success: false, error: 'download_failed' };
      }

      // Get response metadata for trace
      const contentType = response.headers.get('content-type') || 'unknown';

      // Clone response so we can read body twice (once for size, once for JSON)
      const responseClone = response.clone();
      const bodyText = await responseClone.text();
      const byteLength = new Blob([bodyText]).size;

      // Trace: Download complete
      onboardingTrace.success('download_complete', {
        httpStatus: response.status,
        contentType,
        byteLength,
        byteLengthFormatted: byteLength > 1024 ? `${(byteLength / 1024).toFixed(1)} KB` : `${byteLength} bytes`,
      });

      onProgress?.('parsing', 40);

      // Trace: JSON parse started
      onboardingTrace.step('json_parse_started', { byteLength });

      // Parse the JSON response
      let rawData: unknown;
      try {
        rawData = JSON.parse(bodyText);
      } catch (e) {
        const parseError = e instanceof Error ? e.message : 'Unknown parse error';
        logger.error('Failed to parse reference DB JSON:', e);
        // Trace: JSON parse failed
        onboardingTrace.fail('json_parse_failed', {
          error: parseError,
          preview: bodyText.substring(0, 100),
        });
        return { success: false, error: 'invalid_format' };
      }

      // Trace: JSON parse complete
      onboardingTrace.success('json_parse_complete', {
        type: typeof rawData,
        isArray: Array.isArray(rawData),
        topLevelKeys: rawData && typeof rawData === 'object' ? Object.keys(rawData as object).slice(0, 10) : [],
      });

      // Trace: Schema validation started
      onboardingTrace.step('schema_validation_started');

      // Check if this is a full database export (same format as manual export)
      // If so, use the shared import path (db.importData) instead of reference DB normalization
      if (this.isFullDatabaseExport(rawData)) {
        logger.info('📦 Detected full database export format - using shared import path');
        return await this.handleFullDatabaseImport(rawData, machineId, machine.referenceDbUrl, onProgress);
      }

      // Normalize to new format (reference database)
      const normalizedData = this.normalizeReferenceData(rawData);

      if (!normalizedData) {
        // Trace: Schema validation failed
        onboardingTrace.fail('schema_validation_failed', {
          reason: 'normalization_failed',
          detectedFormat: this.detectDataFormat(rawData),
        });
        return { success: false, error: 'invalid_format' };
      }

      const dbMeta = this.extractDbMeta(rawData);
      const remoteVersion = dbMeta?.db_version || '1.0.0';

      // Check version if not forcing update
      if (!forceUpdate && existingLocalDb) {
        const comparison = this.compareVersions(remoteVersion, existingLocalDb.version);

        if (comparison <= 0) {
          logger.info(`⏭️ Skipping download: local version (${existingLocalDb.version}) >= remote (${remoteVersion})`);
          onboardingTrace.success('schema_validation_complete', {
            skipped: true,
            reason: 'version_not_higher',
            localVersion: existingLocalDb.version,
            remoteVersion,
          });
          return {
            success: true,
            version: existingLocalDb.version,
            modelsImported: 0,
            dbMeta: existingLocalDb.dbMeta,
          };
        }

        logger.info(`📦 Updating from v${existingLocalDb.version} to v${remoteVersion}`);
      }

      onProgress?.('validating', 60);

      // Get models from new format
      const models = normalizedData.models.length > 0
        ? normalizedData.models
        : normalizedData.referenceModels || [];

      // Validate models if present
      if (models.length > 0) {
        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          if (!this.isValidModel(model)) {
            logger.error('Invalid model format in reference DB');
            // Trace: Schema validation failed
            onboardingTrace.fail('schema_validation_failed', {
              reason: 'invalid_model_format',
              modelIndex: i,
              modelLabel: (model as unknown as Record<string, unknown>)?.label || 'unknown',
              missingFields: this.getMissingModelFields(model),
            });
            return { success: false, error: 'invalid_model_format' };
          }
        }
      }

      // Trace: Schema validation complete
      onboardingTrace.success('schema_validation_complete', {
        version: remoteVersion,
        modelsCount: models.length,
        hasDbMeta: !!dbMeta,
        detectedFormat: normalizedData.models.length > 0 ? 'new_format' : 'legacy_format',
      });

      onProgress?.('saving', 80);

      // Trace: DB import started
      onboardingTrace.step('db_import_started', {
        mode: existingLocalDb ? 'update' : 'initial',
        previousVersion: existingLocalDb?.version,
        newVersion: remoteVersion,
        modelsCount: models.length,
      });

      // Build reference data for storage
      const refData: ReferenceDatabase['data'] = {
        referenceModels: models,
        machineName: normalizedData.machineName,
        location: normalizedData.location,
        notes: normalizedData.notes,
        config: normalizedData.config,
      };

      // Save the reference database, preserving local models
      const refDb: ReferenceDatabase = {
        machineId,
        version: remoteVersion,
        downloadedAt: Date.now(),
        sourceUrl: machine.referenceDbUrl,
        dbMeta,
        data: refData,
        // Preserve locally added models from previous database
        localModels: existingLocalDb?.localModels,
        localModelsUpdatedAt: existingLocalDb?.localModelsUpdatedAt,
      };

      await saveReferenceDatabase(refDb);

      // Apply reference models to machine if available
      let modelsImported = 0;
      if (models.length > 0) {
        modelsImported = await this.applyModelsToMachine(machine, models);
      }

      // Update machine metadata if provided
      if (refData.machineName || refData.location || refData.notes) {
        await this.updateMachineMetadata(machine, refData);
      }

      // Mark machine as having reference DB loaded
      machine.referenceDbLoaded = true;
      machine.referenceDbVersion = refDb.version;
      await saveMachine(machine);

      // Trace: DB import complete
      onboardingTrace.success('db_import_complete', {
        version: remoteVersion,
        modelsImported,
        localModelsPreserved: existingLocalDb?.localModels?.length || 0,
      });

      // Trace: App state reload
      onboardingTrace.success('app_state_reload', {
        machineId,
        referenceDbLoaded: true,
        version: remoteVersion,
      });

      onProgress?.('complete', 100);

      logger.info(`✅ Reference DB loaded for machine ${machineId}: v${remoteVersion}, ${modelsImported} models imported`);

      // Trace: Process complete
      onboardingTrace.success('process_complete', {
        machineId,
        version: remoteVersion,
        modelsImported,
      });

      return {
        success: true,
        version: refDb.version,
        modelsImported,
        dbMeta,
      };
    } catch (error) {
      logger.error('Reference DB download error:', error);
      // Trace: Process failed
      onboardingTrace.fail('process_failed', {
        machineId,
        error: error instanceof Error ? error.message : 'unknown_error',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      };
    }
  }

  /**
   * Detect data format for debugging
   */
  private static detectDataFormat(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return 'not_object';
    }

    const d = data as Record<string, unknown>;

    // Check for full database export format first (from manual export)
    if (this.isFullDatabaseExport(d)) return 'zanobot_export_v1';

    if (d.db_meta && d.models) return 'new_format_with_models';
    if (d.db_meta) return 'new_format_partial';
    if (d.data && typeof d.data === 'object') return 'legacy_wrapped';
    if (d.referenceModels) return 'legacy_direct';
    if (d.config) return 'legacy_config_only';

    return 'unknown';
  }

  /**
   * Check if data is a full database export (from Settings export)
   * Format: { machines: [], recordings: [], diagnoses: [] }
   *
   * This format is different from reference databases and needs to be
   * imported using the same path as manual import (db.importData).
   */
  private static isFullDatabaseExport(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const d = data as Record<string, unknown>;

    // Full database export has machines, recordings, and/or diagnoses arrays
    const hasMachines = 'machines' in d && Array.isArray(d.machines);
    const hasRecordings = 'recordings' in d && Array.isArray(d.recordings);
    const hasDiagnoses = 'diagnoses' in d && Array.isArray(d.diagnoses);

    // Must have at least machines array (the primary indicator)
    // Also check that it's NOT a reference database format (no db_meta, referenceModels, etc.)
    const isNotReferenceDb = !('db_meta' in d) && !('models' in d) && !('referenceModels' in d);

    return hasMachines && isNotReferenceDb && (hasRecordings || hasDiagnoses || true);
  }

  /**
   * Handle full database export import (shared import path)
   *
   * This method handles the case where the downloaded JSON is a full database
   * export (from Settings export), not a reference database. It uses the same
   * import logic as the manual import in Settings phase.
   *
   * Flow:
   * 1. Validate the data structure
   * 2. Replace/reset local database (like manual import)
   * 3. Import the data using db.importData()
   * 4. Find and select the target machine
   * 5. Trigger app state reload
   *
   * @param rawData - The parsed JSON data
   * @param machineId - Target machine ID to select after import
   * @param sourceUrl - Source URL for logging
   * @param onProgress - Progress callback
   */
  private static async handleFullDatabaseImport(
    rawData: unknown,
    machineId: string,
    sourceUrl: string | undefined,
    onProgress?: ProgressCallback
  ): Promise<DownloadResult> {
    const data = rawData as {
      machines?: unknown[];
      recordings?: unknown[];
      diagnoses?: unknown[];
    };

    // Trace: Schema validation complete - using shared import path
    onboardingTrace.success('schema_validation_complete', {
      detectedFormat: 'zanobot_export_v1',
      importPath: 'shared_manual_import',
      machineCount: data.machines?.length || 0,
      recordingCount: data.recordings?.length || 0,
      diagnosisCount: data.diagnoses?.length || 0,
    });

    onProgress?.('validating', 50);

    // Validate that we have at least machines data
    if (!data.machines || data.machines.length === 0) {
      logger.warn('⚠️ Full database export has no machines - importing anyway');
    }

    // Trace: DB import started (merge mode - Sprint 1 UX)
    onboardingTrace.step('db_import_started', {
      mode: 'merge',
      importPath: 'shared_manual_import',
      machineCount: data.machines?.length || 0,
      recordingCount: data.recordings?.length || 0,
      diagnosisCount: data.diagnoses?.length || 0,
    });

    onProgress?.('saving', 70);

    try {
      // Sprint 1 UX: NFC import MERGES with existing data (never deletes user data)
      // Existing machines, recordings, and diagnoses are preserved.
      // New data is added alongside existing data.
      await importData(
        {
          machines: data.machines as Parameters<typeof importData>[0]['machines'],
          recordings: data.recordings as Parameters<typeof importData>[0]['recordings'],
          diagnoses: data.diagnoses as Parameters<typeof importData>[0]['diagnoses'],
        },
        true // merge = true → preserve existing data, add new
      );

      logger.info('✅ Full database import completed (merge mode)');

      // Trace: DB import complete
      onboardingTrace.success('db_import_complete', {
        mode: 'merge',
        importPath: 'shared_manual_import',
        machineCount: data.machines?.length || 0,
        recordingCount: data.recordings?.length || 0,
        diagnosisCount: data.diagnoses?.length || 0,
      });

      onProgress?.('complete', 90);

      // Find the target machine in the imported data
      const allMachines = await getAllMachines();
      const targetMachine = allMachines.find(m => m.id === machineId);

      if (targetMachine) {
        logger.info(`✅ Target machine found after import: ${targetMachine.name} (${targetMachine.id})`);

        // Trace: Machine selected
        onboardingTrace.success('machine_selected', {
          machineId: targetMachine.id,
          machineName: targetMachine.name,
          hasReferenceModels: (targetMachine.referenceModels?.length || 0) > 0,
          referenceModelCount: targetMachine.referenceModels?.length || 0,
        });
      } else {
        logger.warn(`⚠️ Target machine ${machineId} not found in imported data`);
        // This is not a failure - the import was successful, just the target machine wasn't in the data
        onboardingTrace.step('machine_not_in_import', {
          machineId,
          availableMachines: allMachines.map(m => m.id),
        });
      }

      // Trace: App state reload needed
      // Note: The actual reload is handled by the caller (IdentifyPhase)
      onboardingTrace.success('app_state_reload', {
        reason: 'full_database_import',
        reloadTriggered: true,
        targetMachineId: machineId,
        targetMachineFound: !!targetMachine,
      });

      onProgress?.('complete', 100);

      // Trace: Process complete
      onboardingTrace.success('process_complete', {
        importPath: 'shared_manual_import',
        mode: 'merge',
        machineCount: data.machines?.length || 0,
        targetMachineId: machineId,
        targetMachineFound: !!targetMachine,
      });

      return {
        success: true,
        version: '1.0.0', // Full exports don't have version, use default
        modelsImported: targetMachine?.referenceModels?.length || 0,
      };
    } catch (error) {
      logger.error('❌ Full database import failed:', error);

      // Trace: DB import failed
      onboardingTrace.fail('db_import_failed', {
        importPath: 'shared_manual_import',
        error: error instanceof Error ? error.message : 'unknown_error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'import_failed',
      };
    }
  }

  /**
   * Get missing required fields from a model for debugging
   */
  private static getMissingModelFields(model: unknown): string[] {
    const missing: string[] = [];
    if (!model || typeof model !== 'object') {
      return ['entire_model_invalid'];
    }

    const m = model as Record<string, unknown>;
    const requiredFields = ['label', 'type', 'weightVector'];

    for (const field of requiredFields) {
      if (!(field in m)) {
        missing.push(field);
      }
    }

    if (m.type !== 'healthy' && m.type !== 'faulty') {
      missing.push(`type_invalid(${m.type})`);
    }

    return missing;
  }

  /**
   * Add a locally trained model to the reference database
   * These are preserved during official DB updates
   *
   * @param machineId - Machine ID
   * @param model - Model to add
   */
  public static async addLocalModel(machineId: string, model: GMIAModel): Promise<boolean> {
    try {
      const refDb = await getReferenceDatabase(machineId);

      if (!refDb) {
        logger.warn(`Cannot add local model: no reference DB for machine ${machineId}`);
        return false;
      }

      // Initialize local models array if needed
      if (!refDb.localModels) {
        refDb.localModels = [];
      }

      // Add the model with machineId
      refDb.localModels.push({
        ...model,
        machineId,
      });

      refDb.localModelsUpdatedAt = Date.now();

      await saveReferenceDatabase(refDb);

      logger.info(`✅ Added local model "${model.label}" to reference DB`);
      return true;
    } catch (error) {
      logger.error('Failed to add local model:', error);
      return false;
    }
  }

  /**
   * Export the local reference database as a file
   * Creates a file in the new db_meta format that can be uploaded to Google Drive
   *
   * @param machineId - Machine ID
   * @returns Blob containing the exported JSON, or null on error
   */
  public static async exportDatabase(machineId: string): Promise<{
    blob: Blob;
    filename: string;
    version: string;
  } | null> {
    try {
      const machine = await getMachine(machineId);
      const refDb = await getReferenceDatabase(machineId);

      if (!machine || !refDb) {
        logger.error('Cannot export: machine or reference DB not found');
        return null;
      }

      // Combine official models with local models
      const allModels = [
        ...(refDb.data.referenceModels || []),
        ...(refDb.localModels || []),
      ];

      // Serialize models (convert Float64Array to regular arrays)
      const serializedModels = allModels.map(model => ({
        ...model,
        weightVector: Array.from(model.weightVector),
      }));

      // Increment patch version for export
      const currentVersion = refDb.version || '1.0.0';
      const versionParts = currentVersion.split('.').map(n => parseInt(n, 10) || 0);
      while (versionParts.length < 3) versionParts.push(0);
      versionParts[2]++; // Increment patch version
      const newVersion = versionParts.join('.');

      // Create export data in new format
      // Note: models array contains serialized weightVector (number[] instead of Float64Array)
      // This is intentional for JSON serialization - it will be converted back when imported
      const exportData = {
        db_meta: {
          db_version: newVersion,
          created_by: 'user-export',
          created_at: new Date().toISOString().split('T')[0],
          description: refDb.dbMeta?.description
            ? `${refDb.dbMeta.description} (+ local references)`
            : `Export from ${machine.name || machine.id}`,
        },
        models: serializedModels,
        // Include machine metadata
        machineName: machine.name,
        location: machine.location,
        notes: machine.notes,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });

      // Generate filename
      const safeName = (machine.name || machine.id)
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .substring(0, 50);
      const filename = `reference-db_${safeName}_v${newVersion}.json`;

      logger.info(`📤 Exported reference DB: ${filename} (${allModels.length} models)`);

      return { blob, filename, version: newVersion };
    } catch (error) {
      logger.error('Export failed:', error);
      return null;
    }
  }

  /**
   * Trigger download of exported database
   * Creates a download link and clicks it
   *
   * @param machineId - Machine ID to export
   */
  public static async downloadExport(machineId: string): Promise<boolean> {
    const exportResult = await this.exportDatabase(machineId);

    if (!exportResult) {
      return false;
    }

    // Create download link
    const url = URL.createObjectURL(exportResult.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportResult.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  }

  /**
   * Share exported database using Web Share API (if available)
   *
   * Note: Web Share API requires "transient user activation" - the share()
   * call must happen quickly after the user gesture. We skip canShare()
   * check to preserve the user gesture timing and try sharing directly.
   *
   * @param machineId - Machine ID to export
   * @returns True if shared successfully, false otherwise
   */
  public static async shareExport(machineId: string): Promise<boolean> {
    const exportResult = await this.exportDatabase(machineId);

    if (!exportResult) {
      return false;
    }

    // Try to share directly without checking canShare() first.
    // Reason: canShare() can return false on some browsers (iOS Safari)
    // even when sharing would work. Also, the extra call costs time
    // which can cause "user gesture" to expire, leading to permission errors.
    if (navigator.share) {
      try {
        const file = new File([exportResult.blob], exportResult.filename, {
          type: 'application/json',
        });

        await navigator.share({
          files: [file],
          title: `Reference Database v${exportResult.version}`,
        });

        return true;
      } catch (error) {
        const errorName = (error as Error).name;

        // User cancelled - not an error
        if (errorName === 'AbortError') {
          return false;
        }

        // NotAllowedError, TypeError, etc. - fall back to download
        logger.warn(`Share failed (${errorName}), falling back to download:`, error);
      }
    }

    // Fall back to download
    return this.downloadExport(machineId);
  }

  /**
   * Check if a newer version of the reference database is available
   * (Legacy method - delegates to needsUpdate)
   *
   * @param machineId - Machine ID
   * @returns True if update available (remote > local), false otherwise
   */
  public static async checkForUpdate(machineId: string): Promise<boolean> {
    const result = await this.needsUpdate(machineId);
    return result.needsUpdate && result.reason === 'version_higher';
  }

  /**
   * GitHub Pages base URL for reference databases (MVP)
   * All customer databases must be hosted under this domain for security
   */
  public static readonly GITHUB_PAGES_BASE_URL = 'https://gunterstruck.github.io';

  /**
   * Validate URL format for reference database sources
   * MVP: Only accepts URLs from the official GitHub Pages repository
   * Rule: https://gunterstruck.github.io/<customerId>/db-latest.json
   *
   * @param url - URL to validate
   * @returns Validation result
   */
  public static validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url || url.trim() === '') {
      return { valid: false, error: 'url_empty' };
    }

    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== 'https:') {
        return { valid: false, error: 'url_not_https' };
      }

      // MVP Security Rule: Only accept URLs from the official GitHub Pages repository
      // This ensures all reference databases come from a trusted source
      const isOfficialGitHubPages = parsed.hostname === 'gunterstruck.github.io';

      if (!isOfficialGitHubPages) {
        return { valid: false, error: 'url_not_official_source' };
      }

      // Valid: URL is from the official GitHub Pages
      return { valid: true };
    } catch {
      return { valid: false, error: 'url_invalid' };
    }
  }

  /**
   * Fetch with retry logic for network resilience
   */
  private static async fetchWithRetry(
    url: string,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          // Don't follow redirects automatically for Google Drive
          redirect: 'follow',
        });

        // Handle Google Drive virus scan warning page
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            // Likely a Google Drive warning page, try with confirm parameter
            const confirmUrl = this.addGoogleDriveConfirm(url);
            if (confirmUrl !== url) {
              return await fetch(confirmUrl);
            }
          }
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Fetch attempt ${attempt + 1} failed:`, error);

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Fetch failed after retries');
  }

  /**
   * Add Google Drive confirm parameter for large files
   */
  private static addGoogleDriveConfirm(url: string): string {
    const parsed = new URL(url);

    if (parsed.hostname === 'drive.google.com' && !parsed.searchParams.has('confirm')) {
      parsed.searchParams.set('confirm', 't');
      return parsed.toString();
    }

    return url;
  }

  /**
   * Validate reference data structure
   * Supports both new db_meta format and legacy formats
   */
  private static validateReferenceData(
    data: unknown
  ): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'invalid_data_structure' };
    }

    const d = data as Record<string, unknown>;

    // New format: must have db_meta with db_version
    const hasDbMeta = d.db_meta && typeof d.db_meta === 'object';
    const hasModels = 'models' in d && Array.isArray(d.models);

    // Legacy format checks
    const hasLegacyModels = 'referenceModels' in d && Array.isArray(d.referenceModels);
    const hasConfig = 'config' in d && typeof d.config === 'object';

    // Valid if has new format OR legacy format
    if (!hasDbMeta && !hasModels && !hasLegacyModels && !hasConfig) {
      return { valid: false, error: 'no_models_or_config' };
    }

    // Validate models if present (new format)
    if (hasModels) {
      const models = d.models as unknown[];

      for (const model of models) {
        if (!this.isValidModel(model)) {
          return { valid: false, error: 'invalid_model_format' };
        }
      }
    }

    // Validate models if present (legacy format)
    if (hasLegacyModels) {
      const models = d.referenceModels as unknown[];

      for (const model of models) {
        if (!this.isValidModel(model)) {
          return { valid: false, error: 'invalid_model_format' };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check if an object is a valid GMIA model
   */
  private static isValidModel(model: unknown): boolean {
    if (!model || typeof model !== 'object') {
      return false;
    }

    const m = model as Record<string, unknown>;

    // Required fields for a GMIA model
    const requiredFields = ['label', 'type', 'weightVector'];

    for (const field of requiredFields) {
      if (!(field in m)) {
        return false;
      }
    }

    // Validate type
    if (m.type !== 'healthy' && m.type !== 'faulty') {
      return false;
    }

    // Validate weightVector (can be array or Float64Array serialized as array)
    if (!Array.isArray(m.weightVector) && !(m.weightVector instanceof Float64Array)) {
      return false;
    }

    return true;
  }

  /**
   * Apply reference models to a machine
   */
  private static async applyModelsToMachine(
    machine: Machine,
    models: GMIAModel[]
  ): Promise<number> {
    // Convert serialized weight vectors back to Float64Array
    const processedModels: GMIAModel[] = models.map(model => ({
      ...model,
      machineId: machine.id, // Ensure machineId matches
      weightVector: Array.isArray(model.weightVector)
        ? new Float64Array(model.weightVector)
        : model.weightVector,
    }));

    // Sprint 1 UX: MERGE models – only add if no model with same name exists
    const existingNames = new Set(
      (machine.referenceModels || []).map(m => m.label?.toLowerCase().trim())
    );

    const newModels = processedModels.filter(model => {
      const modelName = model.label?.toLowerCase().trim();
      if (modelName && existingNames.has(modelName)) {
        logger.info(`⏭️ Skipping model "${model.label}" – already exists for machine ${machine.id}`);
        return false;
      }
      return true;
    });

    // Append new models to existing ones
    machine.referenceModels = [...(machine.referenceModels || []), ...newModels];

    if (newModels.length < processedModels.length) {
      const skipped = processedModels.length - newModels.length;
      logger.info(`📋 Merged: ${newModels.length} new models added, ${skipped} duplicates skipped`);
    }

    await saveMachine(machine);

    return newModels.length;
  }

  /**
   * Update machine metadata from reference data
   */
  private static async updateMachineMetadata(
    machine: Machine,
    refData: ReferenceDatabase['data']
  ): Promise<void> {
    let updated = false;

    // Only update if local data is missing
    if (!machine.name && refData.machineName) {
      machine.name = refData.machineName;
      updated = true;
    }

    if (!machine.location && refData.location) {
      machine.location = refData.location;
      updated = true;
    }

    if (!machine.notes && refData.notes) {
      machine.notes = refData.notes;
      updated = true;
    }

    if (updated) {
      await saveMachine(machine);
    }
  }

  /**
   * Slugify a fleet name for use in URLs.
   * "Fernwärme Ost" → "fernwaerme-ost"
   */
  public static slugifyFleetName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Export a fleet as FleetDbFile JSON for NFC/QR provisioning.
   *
   * @param fleetGroupName - The fleetGroup to export
   * @returns Blob + filename + fleetId, or null if export failed
   */
  public static async exportFleet(fleetGroupName: string): Promise<{
    blob: Blob;
    filename: string;
    fleetId: string;
  } | null> {
    try {
      const allMachines = await getAllMachines();
      const fleetMachines = allMachines.filter(m => m.fleetGroup === fleetGroupName);

      if (fleetMachines.length < 2) {
        logger.warn(`Fleet "${fleetGroupName}" has fewer than 2 machines`);
        return null;
      }

      const fleetId = this.slugifyFleetName(fleetGroupName);

      // Find Gold Standard: most common fleetReferenceSourceId
      const refSourceIds = fleetMachines.map(m => m.fleetReferenceSourceId).filter(Boolean) as string[];
      let goldStandardId: string | null = null;
      if (refSourceIds.length > 0) {
        const counts = new Map<string, number>();
        for (const id of refSourceIds) {
          counts.set(id, (counts.get(id) || 0) + 1);
        }
        let maxCount = 0;
        for (const [id, count] of counts) {
          if (count > maxCount) {
            goldStandardId = id;
            maxCount = count;
          }
        }
      }

      // Get Gold Standard reference data
      let goldStandardModels: FleetDbFile['goldStandardModels'] = undefined;
      if (goldStandardId) {
        const goldMachine = await getMachine(goldStandardId);
        if (goldMachine && goldMachine.referenceModels && goldMachine.referenceModels.length > 0) {
          goldStandardModels = {
            referenceModels: goldMachine.referenceModels.map(m => ({
              ...m,
              // Serialize Float64Array to number[] for JSON
              weightVector: Array.from(m.weightVector) as unknown as Float64Array,
            })),
            refLogMean: goldMachine.refLogMean,
            refLogStd: goldMachine.refLogStd,
            refLogResidualStd: goldMachine.refLogResidualStd,
            refDriftBaseline: goldMachine.refDriftBaseline,
            refT60: goldMachine.refT60,
            refT60Classification: goldMachine.refT60Classification,
          };
        }
      }

      const exportData: FleetDbFile = {
        format: 'zanobot-fleet-db',
        schemaVersion: '1.0.0',
        exportDbVersion: 7,
        exportedAt: new Date().toISOString(),
        fleet: {
          name: fleetGroupName,
          id: fleetId,
        },
        goldStandardId,
        goldStandardModels,
        machines: fleetMachines.map(m => ({
          id: m.id,
          name: m.name,
          isGoldStandard: m.id === goldStandardId,
          location: m.location,
          notes: m.notes,
        })),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const filename = `fleet-${fleetId}.json`;

      logger.info(`Fleet exported: ${filename} (${fleetMachines.length} machines, ` +
        `Gold Standard: ${goldStandardId || 'none'})`);

      return { blob, filename, fleetId };
    } catch (error) {
      logger.error('Fleet export failed:', error);
      return null;
    }
  }
}
