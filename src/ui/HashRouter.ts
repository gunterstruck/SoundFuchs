/**
 * ZANOBOT - HASH ROUTER
 *
 * Handles hash-based routing for NFC deep links.
 * Format: #/m/<machine_id>?c=<customer_id>
 *
 * This enables NFC tags to open the app directly to a specific machine,
 * triggering automatic reference database download for Basisnutzer.
 * The customerId parameter (c) determines which customer's database to load.
 * The DB URL is automatically built: https://gunterstruck.github.io/<customerId>/db-latest.json
 */

import { getMachine, saveMachine, deleteMachine } from '@data/db.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import type { Machine, FleetDbFile, GMIAModel } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { onboardingTrace } from '@utils/onboardingTrace.js';
import { t } from '../i18n/index.js';
import { notify } from '@utils/notifications.js';

/**
 * Base URL for GitHub Pages reference databases (MVP)
 * All customer databases are hosted under this domain
 */
export const GITHUB_PAGES_BASE_URL = 'https://gunterstruck.github.io';

/**
 * Route match result
 */
export interface RouteMatch {
  type: 'machine' | 'fleet' | 'quickcompare' | 'import' | 'unknown';
  machineId?: string;
  /** Fleet ID from fleet deep link */
  fleetId?: string;
  /** Customer ID from NFC link (c parameter) - used to build DB URL */
  customerId?: string;
  /** Reference DB URL from NFC link (allows auto-creation on new devices) */
  referenceDbUrl?: string;
  /** Fleet DB URL from fleet deep link */
  fleetDbUrl?: string;
  /** External database URL for import route (#/import?url=...) */
  importUrl?: string;
  /** Machine count for quick compare count-only variant (#/q/<number>) */
  machineCount?: number;
}

/**
 * Hash change event callback
 */
export type HashChangeCallback = (match: RouteMatch) => void;

/**
 * Machine load result
 */
export interface MachineLoadResult {
  machine: Machine | null;
  created: boolean;
  error?: string;
  needsReferenceDownload: boolean;
  needsUpdate?: boolean;
  localVersion?: string;
  remoteVersion?: string;
}

/**
 * Hash Router for NFC deep links
 */
/** Fleet import plan (Phase 1: RAM only) */
interface FleetImportPlan {
  toCreate: Machine[];
  toUpdate: Array<{ machine: Machine; updates: Partial<Machine> }>;
  skipped: Array<{ id: string; name: string; reason: 'already_in_fleet' | 'different_fleet' }>;
  warnings: string[];
}

export class HashRouter {
  private onRouteChange?: HashChangeCallback;
  private onMachineReady?: (machine: Machine) => void;
  private onDownloadProgress?: (status: string, progress?: number) => void;
  private onDownloadError?: (error: string) => void;
  private onImportRequested?: (importUrl: string) => void;
  private onFleetReady?: (fleetName: string, machineCount: number) => void;
  private onQuickCompareCountReady?: (count: number) => void;
  private boundHandleHashChange: () => void;

  constructor() {
    // Store bound handler so we can remove it later in destroy()
    this.boundHandleHashChange = () => this.handleHashChange();
    window.addEventListener('hashchange', this.boundHandleHashChange);
  }

  /**
   * Set callback for route changes
   */
  public setOnRouteChange(callback: HashChangeCallback): void {
    this.onRouteChange = callback;
  }

  /**
   * Set callback for when machine is ready (loaded + reference downloaded)
   */
  public setOnMachineReady(callback: (machine: Machine) => void): void {
    this.onMachineReady = callback;
  }

  /**
   * Set callback for download progress updates
   */
  public setOnDownloadProgress(callback: (status: string, progress?: number) => void): void {
    this.onDownloadProgress = callback;
  }

  /**
   * Set callback for download errors
   */
  public setOnDownloadError(callback: (error: string) => void): void {
    this.onDownloadError = callback;
  }

  /**
   * Set callback for import route requests (#/import?url=...)
   */
  public setOnImportRequested(callback: (importUrl: string) => void): void {
    this.onImportRequested = callback;
  }

  /**
   * Set callback for when fleet provisioning is complete
   */
  public setOnFleetReady(callback: (fleetName: string, machineCount: number) => void): void {
    this.onFleetReady = callback;
  }

  /**
   * Set callback for when quick compare count-only route is detected
   */
  public setOnQuickCompareCountReady(callback: (count: number) => void): void {
    this.onQuickCompareCountReady = callback;
  }

  /**
   * Initialize router and process current hash
   */
  public async init(): Promise<void> {
    await this.handleHashChange();
  }

  /**
   * Parse hash URL and extract route info
   * Supports:
   * - New format: #/m/<machine_id>?c=<customer_id> (customerId builds DB URL automatically)
   * - Legacy format: #/m/<machine_id>?ref=<encoded_url> (full URL in parameter)
   * - Import format: #/import?url=<encoded_url> (direct DB import from external URL)
   */
  public parseHash(hash: string): RouteMatch {
    // Remove leading # if present
    const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;

    // Trace: Hash parsed
    onboardingTrace.step('hash_parsed', { hash: cleanHash });

    // Split path and query string
    const [path, queryString] = cleanHash.split('?');

    // Match /import route (URL-based database import)
    if (path === '/import') {
      if (queryString) {
        const params = new URLSearchParams(queryString);
        const importUrl = params.get('url');

        if (importUrl) {
          const decodedUrl = decodeURIComponent(importUrl);

          // Validate that it's a proper URL
          try {
            new URL(decodedUrl);
          } catch {
            logger.warn(`⚠️ Invalid import URL in hash: ${decodedUrl}`);
            return { type: 'unknown' };
          }

          logger.info(`🔗 Import route detected: ${decodedUrl}`);
          onboardingTrace.step('import_url_detected', { url: decodedUrl });

          return {
            type: 'import',
            importUrl: decodedUrl,
          };
        }
      }

      logger.warn('⚠️ /import route without url parameter');
      return { type: 'unknown' };
    }

    // Match /m/<machine_id> pattern
    const machineMatch = path.match(/^\/m\/([^/?]+)/);

    if (machineMatch) {
      const result: RouteMatch = {
        type: 'machine',
        machineId: decodeURIComponent(machineMatch[1]),
      };

      // Trace: Machine ID extracted
      onboardingTrace.success('machine_id_extracted', { machineId: result.machineId });

      // Parse query parameters
      if (queryString) {
        const params = new URLSearchParams(queryString);

        // New format: customerId (c parameter) - preferred
        const customerId = params.get('c');
        if (customerId) {
          result.customerId = customerId;
          // Trace: Customer ID extracted
          onboardingTrace.success('customer_id_extracted', { customerId });

          // Auto-build the reference DB URL from customerId
          result.referenceDbUrl = HashRouter.buildDbUrlFromCustomerId(customerId);
          // Trace: DB URL derived
          onboardingTrace.success('db_url_derived', { dbUrl: result.referenceDbUrl });
          logger.info(`🔗 CustomerId "${customerId}" → DB URL: ${result.referenceDbUrl}`);
        }

        // Legacy format: full ref URL (fallback for backwards compatibility)
        if (!result.referenceDbUrl) {
          const refUrl = params.get('ref');
          if (refUrl) {
            result.referenceDbUrl = decodeURIComponent(refUrl);
            // Trace: DB URL from legacy ref param
            onboardingTrace.success('db_url_derived', { dbUrl: result.referenceDbUrl, source: 'legacy_ref' });
          }
        }
      }

      return result;
    }

    // Match /f/<fleet_id> pattern (fleet deep link)
    const fleetMatch = path.match(/^\/f\/([^/?]+)/);

    if (fleetMatch) {
      const result: RouteMatch = {
        type: 'fleet',
        fleetId: decodeURIComponent(fleetMatch[1]),
      };

      if (queryString) {
        const params = new URLSearchParams(queryString);
        const customerId = params.get('c');
        if (customerId) {
          result.customerId = customerId;
          // Fleet DB URL: <base>/<customerId>/fleet-<fleetId>.json
          result.fleetDbUrl = `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(customerId)}/fleet-${result.fleetId}.json`;
          logger.info(`Fleet route: "${result.fleetId}" -> ${result.fleetDbUrl}`);
        }
      }

      return result;
    }

    // Match /q/<value> pattern (quick compare deep link – count only)
    // #/q/<number> → count-only quick compare (value must be a valid integer 2-30)
    const qcMatch = path.match(/^\/q\/([^/?]+)/);

    if (qcMatch) {
      const rawValue = decodeURIComponent(qcMatch[1]);
      const parsedInt = parseInt(rawValue, 10);
      const isPureInteger = /^\d+$/.test(rawValue);

      if (isPureInteger && parsedInt >= 2 && parsedInt <= 30) {
        logger.info(`Quick Compare count-only route: ${parsedInt} machines`);
        return {
          type: 'quickcompare',
          machineCount: parsedInt,
        };
      }

      if (isPureInteger && parsedInt > 30) {
        logger.warn(`Quick Compare: count=${parsedInt} capped to 30`);
        return {
          type: 'quickcompare',
          machineCount: 30,
        };
      }

      // Invalid: not a valid count (non-integer, <=0, or 1)
      logger.warn(`Quick Compare: invalid parameter "${rawValue}"`);
      return { type: 'unknown' };
    }

    return { type: 'unknown' };
  }

  /**
   * Build the reference database URL from a customer ID or direct URL
   *
   * Supports two input modes:
   * 1. Customer ID: "Kundenkennung_nr1" → https://gunterstruck.github.io/Kundenkennung_nr1/db-latest.json
   * 2. Direct URL: "https://..." → used as-is (with GitHub blob→raw auto-conversion)
   *
   * @param customerIdOrUrl - Customer identifier or direct URL to JSON database
   * @returns Full URL to the database
   */
  public static buildDbUrlFromCustomerId(customerIdOrUrl: string): string {
    const trimmed = customerIdOrUrl.trim();

    // Detect if input is already a full URL
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      // Auto-convert GitHub blob URLs to raw URLs
      if (trimmed.includes('github.com') && trimmed.includes('/blob/')) {
        const converted = HashRouter.convertGitHubBlobToRaw(trimmed);
        logger.info(`🔄 GitHub blob URL auto-converted: ${converted}`);
        return converted;
      }
      // Direct URL - use as-is
      return trimmed;
    }

    // Customer ID mode: build URL from ID
    const sanitized = trimmed.replace(/^\/+|\/+$/g, '');
    return `${GITHUB_PAGES_BASE_URL}/${encodeURIComponent(sanitized)}/db-latest.json`;
  }

  /**
   * Convert a GitHub blob URL to a raw.githubusercontent.com URL
   *
   * Example:
   * github.com/user/repo/blob/branch/path/file.json
   * → raw.githubusercontent.com/user/repo/branch/path/file.json
   *
   * @param blobUrl - GitHub blob URL
   * @returns Raw content URL
   */
  public static convertGitHubBlobToRaw(blobUrl: string): string {
    try {
      const parsed = new URL(blobUrl);
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
   * Generate hash URL for a machine
   * @param machineId - Machine identifier
   * @param customerId - Optional customer ID (determines which database to load)
   */
  public static getMachineHash(machineId: string, customerId?: string): string {
    const base = `#/m/${encodeURIComponent(machineId)}`;
    if (customerId) {
      return `${base}?c=${encodeURIComponent(customerId)}`;
    }
    return base;
  }

  /**
   * Generate full URL for NFC tag writing
   * @param machineId - Machine identifier
   * @param customerId - Optional customer ID (determines which database to load)
   */
  public static getFullMachineUrl(machineId: string, customerId?: string): string {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}${this.getMachineHash(machineId, customerId)}`;
  }

  /**
   * Generate hash fragment for fleet deep link
   */
  public static getFleetHash(fleetId: string, customerId?: string): string {
    const base = `#/f/${encodeURIComponent(fleetId)}`;
    if (customerId) {
      return `${base}?c=${encodeURIComponent(customerId)}`;
    }
    return base;
  }

  /**
   * Generate full URL for fleet NFC/QR tag
   */
  public static getFullFleetUrl(fleetId: string, customerId?: string): string {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}${this.getFleetHash(fleetId, customerId)}`;
  }

  /**
   * Generate hash fragment for quick compare count-only deep link (#/q/<number>)
   */
  public static getQuickCompareCountHash(count: number): string {
    return `#/q/${count}`;
  }

  /**
   * Generate full URL for quick compare count-only NFC/QR tag
   */
  public static getFullQuickCompareCountUrl(count: number): string {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}${this.getQuickCompareCountHash(count)}`;
  }

  /**
   * Handle hash change event
   */
  private async handleHashChange(): Promise<void> {
    const hash = window.location.hash;

    if (!hash || hash === '#') {
      return;
    }

    // Trace: Deep link detected - start session if not already active
    if (!onboardingTrace.isActive) {
      onboardingTrace.start('deep_link');
    }
    onboardingTrace.step('deep_link_detected', { hash, fullUrl: window.location.href });

    const match = this.parseHash(hash);
    logger.info(`🔗 Hash route: ${hash} → ${match.type}${match.machineId ? ` (${match.machineId})` : ''}${match.referenceDbUrl ? ' (has ref URL)' : ''}`);

    // Notify listeners
    this.onRouteChange?.(match);

    // Handle machine route
    if (match.type === 'machine' && match.machineId) {
      await this.handleMachineRoute(match.machineId, match.referenceDbUrl);
    }

    // Handle fleet route
    if (match.type === 'fleet' && match.fleetId && match.fleetDbUrl) {
      await this.handleFleetRoute(match.fleetId, match.fleetDbUrl);
    }

    // Handle quick compare route (count-only, no download needed)
    if (match.type === 'quickcompare' && match.machineCount) {
      await this.handleQuickCompareCountOnly(match.machineCount);
    }

    // Handle import route
    if (match.type === 'import' && match.importUrl) {
      this.onImportRequested?.(match.importUrl);
    }
  }

  /**
   * Handle machine route - load machine and download/update reference if needed
   *
   * Version-aware flow:
   * 1. Check if local DB exists (or auto-create if referenceDbUrl provided)
   * 2. If not exists: download initial reference
   * 3. If exists: compare versions (remote > local means update needed)
   * 4. Only update if remote version is HIGHER than local
   *
   * @param machineId - Machine identifier
   * @param referenceDbUrl - Optional reference DB URL from NFC link (enables auto-creation)
   */
  private async handleMachineRoute(machineId: string, referenceDbUrl?: string): Promise<void> {
    try {
      // Trace: Machine lookup
      onboardingTrace.step('machine_lookup', { machineId, hasDbUrl: !!referenceDbUrl });

      // Load or create machine (auto-creates if referenceDbUrl provided)
      const result = await this.loadOrCreateMachine(machineId, referenceDbUrl);

      if (result.error || !result.machine) {
        logger.error(`Failed to load machine ${machineId}:`, result.error);
        // Trace: Machine not found / error
        onboardingTrace.fail('machine_not_found', { machineId, error: result.error });
        onboardingTrace.fail('process_failed', { reason: result.error });
        this.onDownloadError?.(result.error || 'unknown_error');
        return;
      }

      // Trace: Machine found or created
      if (result.created) {
        onboardingTrace.success('machine_created', { machineId, name: result.machine.name });
      } else {
        onboardingTrace.success('machine_found', {
          machineId,
          name: result.machine.name,
          hasLocalDb: !result.needsReferenceDownload,
          localVersion: result.localVersion,
        });
      }

      // Check if reference download or update is needed
      if (result.needsReferenceDownload) {
        logger.info(`📥 Machine ${machineId} needs initial reference download`);
        await this.downloadReference(result.machine);
      } else if (result.needsUpdate) {
        logger.info(`📦 Machine ${machineId} has update available: v${result.localVersion} → v${result.remoteVersion}`);
        await this.downloadReference(result.machine);
      } else {
        logger.info(`✓ Machine ${machineId} is up-to-date (v${result.localVersion || 'unknown'})`);
        // Trace: No download needed
        onboardingTrace.success('process_complete', {
          machineId,
          status: 'up_to_date',
          version: result.localVersion,
        });
      }

      // Trace: Machine selected
      onboardingTrace.success('machine_selected', { machineId, name: result.machine.name });

      // Notify that machine is ready
      this.onMachineReady?.(result.machine);

      // Clear the hash after processing (optional - keeps URL clean)
      // window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      logger.error('Error handling machine route:', error);
      // Trace: Process failed
      onboardingTrace.fail('process_failed', {
        machineId,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      this.onDownloadError?.(error instanceof Error ? error.message : 'unknown_error');
    }
  }

  /**
   * Load existing machine or create from NFC link data
   * Checks for both initial download and version-based updates
   *
   * @param machineId - Machine identifier
   * @param referenceDbUrl - Optional reference DB URL from NFC link (enables auto-creation)
   */
  private async loadOrCreateMachine(machineId: string, referenceDbUrl?: string): Promise<MachineLoadResult> {
    // Try to load existing machine
    let machine = await getMachine(machineId);
    let created = false;

    if (!machine) {
      // Machine not found - check if we can auto-create from NFC link data
      if (referenceDbUrl) {
        // Validate the URL before creating machine
        const validation = ReferenceDbService.validateUrl(referenceDbUrl);
        if (!validation.valid) {
          logger.error(`Invalid reference URL in NFC link: ${validation.error}`);
          return {
            machine: null,
            created: false,
            error: 'invalid_reference_url',
            needsReferenceDownload: false,
          };
        }

        // Auto-create machine with reference URL from NFC link
        logger.info(`🆕 Auto-creating machine ${machineId} from NFC link`);
        machine = {
          id: machineId,
          name: machineId, // Placeholder – will be updated from reference DB metadata
          nameIsPlaceholder: true,
          createdAt: Date.now(),
          referenceModels: [],
          referenceDbUrl: referenceDbUrl,
        };
        await saveMachine(machine);
        created = true;
      } else {
        // No reference URL provided - cannot auto-create
        // User should contact Servicetechniker
        return {
          machine: null,
          created: false,
          error: 'machine_not_found',
          needsReferenceDownload: false,
        };
      }
    } else if (referenceDbUrl && machine.referenceDbUrl !== referenceDbUrl) {
      // Machine exists but has different URL - update it
      logger.info(`🔄 Updating reference URL for machine ${machineId}`);
      machine.referenceDbUrl = referenceDbUrl;
      await saveMachine(machine);
    }

    // Check if initial reference download is needed (no local DB exists)
    const needsInitialDownload = await ReferenceDbService.needsDownload(machineId);

    if (needsInitialDownload) {
      return {
        machine,
        created,
        needsReferenceDownload: true,
        needsUpdate: false,
      };
    }

    // Local DB exists - check for version update
    // Only fetch if machine has a reference URL configured
    if (machine.referenceDbUrl) {
      const updateCheck = await ReferenceDbService.needsUpdate(machineId);

      if (updateCheck.needsUpdate && updateCheck.reason === 'version_higher') {
        return {
          machine,
          created,
          needsReferenceDownload: false,
          needsUpdate: true,
          localVersion: updateCheck.localVersion,
          remoteVersion: updateCheck.remoteVersion,
        };
      }

      // No update needed
      return {
        machine,
        created,
        needsReferenceDownload: false,
        needsUpdate: false,
        localVersion: updateCheck.localVersion,
      };
    }

    // No reference URL - just return machine
    return {
      machine,
      created,
      needsReferenceDownload: false,
      needsUpdate: false,
    };
  }

  /**
   * Download reference database for a machine
   */
  private async downloadReference(machine: Machine): Promise<void> {
    this.onDownloadProgress?.(t('machineSetup.downloadingReference'), 0);

    const result = await ReferenceDbService.downloadAndApply(
      machine.id,
      (status, progress) => {
        this.onDownloadProgress?.(this.getLocalizedStatus(status), progress);
      }
    );

    if (!result.success) {
      this.onDownloadError?.(this.getLocalizedError(result.error || 'unknown'));
      return;
    }

    logger.info(`✅ Reference downloaded: ${result.modelsImported} models, version ${result.version}`);
  }

  /**
   * Get localized status message
   */
  private getLocalizedStatus(status: string): string {
    const statusMap: Record<string, string> = {
      downloading: t('machineSetup.statusDownloading'),
      parsing: t('machineSetup.statusParsing'),
      validating: t('machineSetup.statusValidating'),
      saving: t('machineSetup.statusSaving'),
      complete: t('machineSetup.statusComplete'),
    };

    return statusMap[status] || status;
  }

  /**
   * Get localized error message
   */
  private getLocalizedError(error: string): string {
    const errorMap: Record<string, string> = {
      machine_not_found: t('machineSetup.errorMachineNotFound'),
      no_reference_url: t('machineSetup.errorNoReferenceUrl'),
      download_failed: t('machineSetup.errorDownloadFailed'),
      invalid_format: t('machineSetup.errorInvalidFormat'),
      invalid_data_structure: t('machineSetup.errorInvalidStructure'),
      no_models_or_config: t('machineSetup.errorNoModels'),
      invalid_model_format: t('machineSetup.errorInvalidModel'),
    };

    return errorMap[error] || t('machineSetup.errorUnknown');
  }

  /**
   * Handle fleet deep link - download fleet DB and provision all machines.
   */
  private async handleFleetRoute(fleetId: string, fleetDbUrl: string): Promise<void> {
    try {
      this.onDownloadProgress?.(t('fleet.provision.downloading'), 10);

      // 1. Validate URL (same origin check as machine links)
      const validation = ReferenceDbService.validateUrl(fleetDbUrl);
      if (!validation.valid) {
        logger.error(`Invalid fleet DB URL: ${validation.error}`);
        notify.error(t('fleet.provision.error'));
        this.onDownloadError?.('invalid_fleet_url');
        return;
      }

      // 2. Download fleet DB JSON
      this.onDownloadProgress?.(t('fleet.provision.downloading'), 30);
      let response: Response;
      try {
        response = await fetch(fleetDbUrl);
      } catch (fetchError) {
        // Network error (offline, DNS failure, etc.)
        logger.error(`Fleet DB fetch failed (likely offline):`, fetchError);
        notify.error(t('fleet.provision.offline'), { duration: 0 });
        this.onDownloadError?.('fleet_download_failed_offline');
        return;
      }
      if (!response.ok) {
        logger.error(`Fleet DB download failed: ${response.status}`);
        notify.error(t('fleet.provision.error'));
        this.onDownloadError?.('fleet_download_failed');
        return;
      }

      const rawData = await response.json();

      // 3. Validate format + schema + consistency
      const formatCheck = this.validateFleetDb(rawData);
      if (!formatCheck.valid) {
        logger.error(`Fleet DB validation failed: ${formatCheck.error}`);
        notify.error(t('fleet.provision.error'));
        this.onDownloadError?.(`fleet_validation_failed: ${formatCheck.error}`);
        return;
      }

      const fleetData = rawData as FleetDbFile;
      this.onDownloadProgress?.(t('fleet.provision.downloading'), 50);

      // 4. DB version compatibility warning
      if (fleetData.exportDbVersion > 7) {
        notify.warning(t('fleet.provision.updateRecommended'), { duration: 5000 });
      }

      // 5. Prepare import plan (Phase 1: RAM only)
      const plan = await this.prepareFleetImport(fleetData);

      // Show warnings
      for (const warning of plan.warnings) {
        notify.warning(warning, { duration: 5000 });
      }

      // Nothing to import?
      if (plan.toCreate.length === 0 && plan.toUpdate.length === 0) {
        logger.info('Fleet import: nothing to do (all machines already exist)');
        notify.info(t('fleet.provision.alreadyExists', {
          name: fleetData.fleet.name,
          skipped: String(plan.skipped.length),
        }));
        this.onFleetReady?.(fleetData.fleet.name, plan.skipped.length);
        return;
      }

      this.onDownloadProgress?.(t('fleet.provision.downloading'), 70);

      // 6. Commit import plan (Phase 2: DB writes with rollback on error)
      const result = await this.commitFleetImport(plan);

      this.onDownloadProgress?.(t('fleet.provision.downloading'), 100);

      logger.info(`Fleet "${fleetData.fleet.name}" provisioned: ` +
        `${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);

      // 7. Notify UI
      notify.success(t('fleet.provision.success', {
        name: fleetData.fleet.name,
        created: String(result.created),
        updated: String(result.updated),
      }));

      this.onFleetReady?.(fleetData.fleet.name, result.created + result.updated);

    } catch (error) {
      logger.error('Fleet provisioning failed:', error);
      notify.error(t('fleet.provision.error'));
      this.onDownloadError?.(error instanceof Error ? error.message : 'fleet_provision_failed');
    }
  }

  /**
   * Handle quick compare count-only route (#/q/<number>).
   * Signals the count to the UI – machine creation is handled by QuickCompareController.
   */
  private async handleQuickCompareCountOnly(count: number): Promise<void> {
    logger.info(`Quick Compare count-only route: ${count} machines`);
    this.onQuickCompareCountReady?.(count);
  }

  /**
   * Validate fleet DB JSON structure (Hard Reject on failure)
   */
  private validateFleetDb(data: unknown): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') return { valid: false, error: 'not_an_object' };
    const d = data as Record<string, unknown>;

    // Format check
    if (d.format !== 'zanobot-fleet-db') return { valid: false, error: 'wrong_format' };

    // Schema version check (only support major version 1)
    const sv = String(d.schemaVersion || '');
    if (!sv.startsWith('1.')) return { valid: false, error: `unsupported_schema_version: ${sv}` };

    // Fleet metadata
    const fleet = d.fleet as Record<string, unknown> | undefined;
    if (!fleet || typeof fleet.name !== 'string' || !fleet.name.trim()) {
      return { valid: false, error: 'missing_fleet_name' };
    }

    // Machines array
    const machines = d.machines as unknown[];
    if (!Array.isArray(machines) || machines.length < 2) {
      return { valid: false, error: 'need_at_least_2_machines' };
    }

    // Unique machine IDs
    const typedMachines = machines as Array<Record<string, unknown>>;
    const ids = typedMachines.map(m => m?.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      return { valid: false, error: 'duplicate_machine_ids' };
    }

    // Gold Standard consistency
    const gsId = d.goldStandardId as string | null;
    if (gsId) {
      const gsEntry = typedMachines.find(m => m?.id === gsId && m?.isGoldStandard === true);
      if (!gsEntry) return { valid: false, error: 'gold_standard_id_not_in_machines' };
      if (!d.goldStandardModels) return { valid: false, error: 'gold_standard_models_missing' };
      const gsModels = d.goldStandardModels as Record<string, unknown>;
      const refModels = gsModels.referenceModels as unknown[];
      if (!Array.isArray(refModels) || refModels.length === 0) {
        return { valid: false, error: 'gold_standard_has_no_models' };
      }
    }

    return { valid: true };
  }

  /**
   * Phase 1: Prepare fleet import plan (RAM only, no DB writes)
   */
  private async prepareFleetImport(fleetData: FleetDbFile): Promise<FleetImportPlan> {
    const plan: FleetImportPlan = {
      toCreate: [],
      toUpdate: [],
      skipped: [],
      warnings: [],
    };

    const goldStandardId = fleetData.goldStandardId;

    for (const machineData of fleetData.machines) {
      const existing = await getMachine(machineData.id);

      if (!existing) {
        // New machine -> create
        const newMachine: Machine = {
          id: machineData.id,
          name: machineData.name,
          createdAt: Date.now(),
          referenceModels: [],
          fleetGroup: fleetData.fleet.name,
          location: machineData.location,
          notes: machineData.notes,
          fleetReferenceSourceId: (goldStandardId && machineData.id !== goldStandardId)
            ? goldStandardId : null,
        };

        // Apply Gold Standard reference if this IS the Gold Standard
        if (machineData.isGoldStandard && fleetData.goldStandardModels) {
          const gsModels = fleetData.goldStandardModels;
          newMachine.referenceModels = gsModels.referenceModels.map((m: GMIAModel) => ({
            ...m,
            weightVector: new Float64Array(m.weightVector as unknown as number[]),
          }));
          newMachine.refLogMean = gsModels.refLogMean;
          newMachine.refLogStd = gsModels.refLogStd;
          newMachine.refLogResidualStd = gsModels.refLogResidualStd;
          newMachine.refDriftBaseline = gsModels.refDriftBaseline;
          newMachine.refT60 = gsModels.refT60;
          newMachine.refT60Classification = gsModels.refT60Classification;
        }

        plan.toCreate.push(newMachine);

      } else if (existing.fleetGroup === fleetData.fleet.name) {
        // Already in this fleet -> skip (idempotent re-scan)
        plan.skipped.push({ id: existing.id, name: existing.name, reason: 'already_in_fleet' });

      } else if (existing.fleetGroup && existing.fleetGroup !== fleetData.fleet.name) {
        // Belongs to DIFFERENT fleet -> skip + warn
        plan.skipped.push({ id: existing.id, name: existing.name, reason: 'different_fleet' });
        plan.warnings.push(t('fleet.provision.skippedDifferentFleet', {
          name: existing.name,
          fleet: existing.fleetGroup,
        }));

      } else {
        // Exists but no fleet -> adopt into this fleet
        const updates: Partial<Machine> = {
          fleetGroup: fleetData.fleet.name,
          fleetReferenceSourceId: (goldStandardId && existing.id !== goldStandardId)
            ? goldStandardId : null,
        };
        plan.toUpdate.push({ machine: existing, updates });
      }
    }

    return plan;
  }

  /**
   * Phase 2: Commit fleet import plan (DB writes with rollback on error)
   * Saves original values of updated machines to enable full rollback.
   */
  private async commitFleetImport(plan: FleetImportPlan): Promise<{
    created: number;
    updated: number;
    skipped: number;
  }> {
    const createdIds: string[] = [];
    // Save original values for rollback of updates
    const updatedOriginals: Array<{ machine: Machine; originalFleetGroup: string | null | undefined; originalRefSourceId: string | null | undefined }> = [];

    try {
      // Create new machines
      for (const machine of plan.toCreate) {
        await saveMachine(machine);
        createdIds.push(machine.id);
      }

      // Update existing machines (save originals first for rollback)
      for (const { machine, updates } of plan.toUpdate) {
        updatedOriginals.push({
          machine,
          originalFleetGroup: machine.fleetGroup,
          originalRefSourceId: machine.fleetReferenceSourceId,
        });
        Object.assign(machine, updates);
        await saveMachine(machine);
      }

      return {
        created: plan.toCreate.length,
        updated: plan.toUpdate.length,
        skipped: plan.skipped.length,
      };

    } catch (error) {
      // Rollback: Delete machines we just created
      logger.error('Fleet import failed, rolling back:', error);
      for (const id of createdIds) {
        try {
          await deleteMachine(id);
        } catch (rollbackError) {
          logger.warn(`Rollback: could not delete machine ${id}:`, rollbackError);
        }
      }
      // Rollback: Restore original values on updated machines
      for (const { machine, originalFleetGroup, originalRefSourceId } of updatedOriginals) {
        try {
          machine.fleetGroup = originalFleetGroup;
          machine.fleetReferenceSourceId = originalRefSourceId;
          await saveMachine(machine);
        } catch (rollbackError) {
          logger.warn(`Rollback: could not restore machine ${machine.id}:`, rollbackError);
        }
      }
      throw error;
    }
  }

  /**
   * Clean up router
   */
  public destroy(): void {
    window.removeEventListener('hashchange', this.boundHandleHashChange);
  }
}
