/**
 * ZANOBOT - PHASE 1: IDENTIFY
 *
 * Entry point of the app flow.
 * User identifies a machine via:
 * - QR/Barcode scan (with integrated camera scanner)
 * - Manual entry
 */

import { saveMachine, getMachine, getAllMachines, getAllDiagnoses } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import type { Machine, DiagnosisResult } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { onboardingTrace, OnboardingTraceService } from '@utils/onboardingTrace.js';
import { setViewLevelTemporary } from '@utils/viewLevelSettings.js';
import { t } from '../../i18n/index.js';
import { InfoBottomSheet } from '../components/InfoBottomSheet.js';
import { HashRouter } from '../HashRouter.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import { nfcImportService } from '@data/NfcImportService.js';
import { ReferenceLoadingOverlay } from '../components/ReferenceLoadingOverlay.js';
import { traceOverlay } from '../components/OnboardingTraceOverlay.js';

import { QrShareModal } from './QrShareModal.js';
import { MicController } from './MicController.js';

import { NfcWriteModal } from './NfcWriteModal.js';
import { MachineHistoryModal } from './MachineHistoryModal.js';
import { MachineOverviewRenderer } from './MachineOverviewRenderer.js';
import { FleetRankingRenderer } from './FleetRankingRenderer.js';
import { FleetCreationModal } from './FleetCreationModal.js';
import { MachineDetailModal } from './MachineDetailModal.js';
import { NfcOnboardingController } from './NfcOnboardingController.js';
import { ScannerController } from './ScannerController.js';
import { DashboardRenderer } from './DashboardRenderer.js';
import { QuickSelectList } from './QuickSelectList.js';

export class IdentifyPhase {
  private onMachineSelected: (machine: Machine) => void;
  private currentMachine: Machine | null = null;

  // QR/Barcode camera scanner + modal (extracted controller)
  private scanner: ScannerController;

  // Status dashboard renderer (extracted)
  private dashboardRenderer: DashboardRenderer;

  // Recently-trained quick-select list (extracted)
  private quickSelectList: QuickSelectList;

  // Microphone / hardware controller (selection, quality, mic modal)
  private micController: MicController;

  private deepLinkOverlay: HTMLElement | null = null;
  // NFC onboarding prompt + view-restore lifecycle (extracted controller)
  private nfcOnboarding: NfcOnboardingController = new NfcOnboardingController();
  // NFC tag writer (extracted modal controller)
  private nfcWriteModal: NfcWriteModal;
  // Per-machine diagnosis history modal (extracted controller)
  private machineHistoryModal: MachineHistoryModal = new MachineHistoryModal();
  // Machine overview card builder + sparkline loader (extracted renderer)
  private overviewRenderer: MachineOverviewRenderer;
  // Fleet-mode ranking renderer (extracted)
  private fleetRankingRenderer: FleetRankingRenderer;
  // Fleet creation / quick-save UI (extracted)
  private fleetCreationModal: FleetCreationModal;
  // Per-machine detail modal (extracted)
  private machineDetailModal: MachineDetailModal;

  /** Sprint 4 UX: Current workflow mode */
  private currentWorkflowMode: 'series' | 'fleet' = 'series';

  /** Sprint 5 UX: Callback for starting fleet diagnosis queue (set by Router) */
  public onStartFleetQueue: ((machineIds: string[], groupName: string) => void) | null = null;

  /** Sprint 6: Callback for when fleet provisioning is complete (set by Router) */
  public onFleetProvisioned: ((fleetName: string, autoStartCheck: boolean) => void) | null = null;

  /** Sprint 8: Callback for quick compare count-only deep link (set by Router) */
  public onQuickCompareProvisioned: ((count: number) => void) | null = null;

  /** Welle 2: Callback to start diagnosis for a specific machine (set by Router) */
  public onStartDiagnosis: ((machine: Machine) => void) | null = null;

  // QR Code Generator (extracted modal controller)
  private qrShareModal: QrShareModal | null = null;

  constructor(onMachineSelected: (machine: Machine) => void) {
    this.onMachineSelected = onMachineSelected;
    this.scanner = new ScannerController({
      onCode: (code) => this.processScannedCode(code),
    });
    this.dashboardRenderer = new DashboardRenderer({
      formatRelativeTime: (timestamp) => this.formatRelativeTime(timestamp),
      startDiagnosis: (machine) => this.onStartDiagnosis?.(machine),
    });
    this.quickSelectList = new QuickSelectList({
      showError: (message) => this.showError(message),
      refreshMachineLists: () => this.refreshMachineLists(),
      showMachineDetail: (machine) => this.machineDetailModal.show(machine),
      onMachineSelect: (machine) => this.onMachineSelected(machine),
    });
    this.micController = new MicController({ onError: (message) => this.showError(message) });
    this.nfcWriteModal = new NfcWriteModal({
      getCurrentMachine: () => this.currentMachine,
      getBaseAppUrl: () => this.getBaseAppUrl(),
    });
    this.overviewRenderer = new MachineOverviewRenderer({
      getStatusLabel: (status) => this.getStatusLabel(status),
      formatRelativeTime: (timestamp) => this.formatRelativeTime(timestamp),
      onMachineSelect: (machine) => void this.handleMachineSelect(machine),
      onRefresh: () => this.refreshMachineLists(),
      showHistory: (machine) => void this.machineHistoryModal.show(machine),
      showDetails: (machine) => void this.handleMachineDetails(machine),
    });
    this.fleetCreationModal = new FleetCreationModal({
      populateFleetGroupSuggestions: () => this.populateFleetGroupSuggestions(),
      loadMachineOverview: () => this.loadMachineOverview(),
      forceFleetMode: async () => {
        this.currentWorkflowMode = 'series'; // Force mode switch
        await this.setWorkflowMode('fleet');
      },
    });
    this.fleetRankingRenderer = new FleetRankingRenderer({
      onMachineSelect: (machine) => void this.handleMachineSelect(machine),
      exportFleet: (groupName) => void this.exportCurrentFleet(groupName),
      renderQuickFleetSaveCTA: (container, machines) =>
        this.fleetCreationModal.renderQuickSaveCTA(container, machines),
      startFleetQueue: (ids, groupName) => this.onStartFleetQueue?.(ids, groupName),
    });
    this.machineDetailModal = new MachineDetailModal({
      setCurrentMachine: (machine) => this.setCurrentMachine(machine),
      onMachineSelected: (machine) => this.onMachineSelected(machine),
      showNotification: (message) => this.showNotification(message),
      refreshMachineLists: () => this.refreshMachineLists(),
      showHistory: (machine) => void this.machineHistoryModal.show(machine),
      formatRelativeTime: (timestamp) => this.formatRelativeTime(timestamp),
    });
  }

  /**
   * Initialize the identify phase UI
   */
  public init(): void {
    // Scan button
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.scanner.handleScan());
    }

    // QR/Barcode scanner modal (own controller)
    this.scanner.init();

    // Create machine button
    const createBtn = document.getElementById('create-machine-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.handleCreateMachine());
    }

    // Sprint 1 UX: Clear inline validation error on typing
    const machineNameInput = document.getElementById('machine-name-input') as HTMLInputElement;
    if (machineNameInput) {
      machineNameInput.addEventListener('input', () => {
        machineNameInput.classList.remove('input-invalid');
        machineNameInput.removeAttribute('aria-invalid');
        const nameError = document.getElementById('machine-name-error');
        if (nameError) nameError.style.display = 'none';
      });
    }

    // Manual input modal elements
    const manualInputBtn = document.getElementById('manual-input-btn');
    const manualInputConfirmBtn = document.getElementById('manual-input-confirm');
    const manualInputCancelBtn = document.getElementById('manual-input-cancel');
    const manualInputCloseBtn = document.getElementById('close-manual-input-modal');
    const manualInputModal = document.getElementById('manual-input-modal');

    if (manualInputBtn) {
      manualInputBtn.addEventListener('click', () => this.handleManualInput());
    }

    if (manualInputConfirmBtn) {
      manualInputConfirmBtn.addEventListener('click', () => this.submitManualInput());
    }

    if (manualInputCancelBtn) {
      manualInputCancelBtn.addEventListener('click', () => this.closeManualInputModal());
    }

    if (manualInputCloseBtn) {
      manualInputCloseBtn.addEventListener('click', () => this.closeManualInputModal());
    }

    if (manualInputModal) {
      manualInputModal.addEventListener('click', (e) => {
        if (e.target === manualInputModal) {
          this.closeManualInputModal();
        }
      });
    }

    // Microphone selection + hardware check (own controller)
    this.micController.init();

    // Initialize machine detail modal
    this.machineDetailModal.init();

    // Load and render machine history for quick select
    this.quickSelectList.load();

    // Load and render machine overview (all machines with status)
    this.loadMachineOverview();

    // Load and render diagnosis history
    this.loadDiagnosisHistory();

    // Welle 5: Initialize identify tile navigation
    this.initIdentifyTiles();

    // "Neue Maschine" / "Neue Flotte" button handler (Sprint 5: mode-dependent)
    const addNewMachineBtn = document.getElementById('add-new-machine-btn');
    if (addNewMachineBtn) {
      addNewMachineBtn.addEventListener('click', () => {
        if (this.currentWorkflowMode === 'fleet') {
          void this.fleetCreationModal.show();
        } else {
          this.handleAddNewMachine();
        }
      });
    }

    // Sprint 2 UX: Empty state CTA scrolls to machine name input
    document.getElementById('empty-state-cta')?.addEventListener('click', () => {
      this.handleAddNewMachine();
    });

    // Sprint 2 UX: Help icon handlers for contextual BottomSheet help
    document.getElementById('help-reference')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.reference.title'),
        content: t('help.reference.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-diagnose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.diagnose.title'),
        content: t('help.diagnose.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-machines')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.machines.title'),
        content: t('help.machines.body'),
        icon: 'ℹ️',
      });
    });

    document.getElementById('help-viewlevel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.viewLevel.title'),
        content: t('help.viewLevel.body'),
        icon: 'ℹ️',
      });
    });

    // Sprint 5 UX: Flottencheck help icon (next to toggle)
    document.getElementById('help-fleet')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.fleet.title'),
        content: t('help.fleet.body'),
        icon: 'ℹ️',
      });
    });

    // Sprint 9: Fleet Quick Check help icon (next to fleet quick check button in Phase 3)
    document.getElementById('help-fleet-quickcheck')?.addEventListener('click', (e) => {
      e.stopPropagation();
      InfoBottomSheet.show({
        title: t('help.fleetQuickCheck.title'),
        content: t('help.fleetQuickCheck.body'),
        icon: '\u26A1',
      });
    });

    // Sprint 4 UX: Workflow mode toggle + fleet group autocomplete
    this.initWorkflowToggle();
    this.populateFleetGroupSuggestions();

    // NFC Writer integration
    this.nfcWriteModal.init();

    // QR Code Generator integration
    this.qrShareModal = new QrShareModal({
      getCurrentMachine: () => this.currentMachine,
      getBaseAppUrl: () => this.getBaseAppUrl(),
    });
    this.qrShareModal.init();

    // NFC diagnosis prompt modal
    this.nfcOnboarding.initPrompt();

    // Deep link handling (catch errors so they are not silently swallowed)
    this.handleDeepLink().catch((err) => {
      logger.error('❌ Deep link handling failed:', err);
    });
  }

  /**
   * Process the scanned code
   *
   * Supports three input types:
   * 1. Full URL with hash route (#/m/ID?c=CUSTOMER) → machine import with reference DB
   * 2. Full URL with import route (#/import?url=URL) → full database import
   * 3. Plain text → treated as machine ID (existing behavior)
   *
   * For URL-based QR codes: all relevant data is imported (machine, reference DB),
   * but no diagnosis test is started automatically.
   */
  private async processScannedCode(code: string): Promise<void> {
    try {
      const trimmedCode = code.trim();

      // Check if the scanned code is a URL containing a hash route
      if (this.isUrlWithHashRoute(trimmedCode)) {
        await this.processScannedUrl(trimmedCode);
        return;
      }

      // Plain text: treat as machine ID (existing behavior)
      const validation = this.validateMachineId(trimmedCode);

      if (!validation.valid) {
        this.showError(validation.error || t('identify.errors.invalidCode'));
        return;
      }

      await this.handleMachineId(trimmedCode);
    } catch (error) {
      logger.error('Error processing scanned code:', error);
      this.showError(t('identify.errors.codeProcessing'));
    }
  }

  /**
   * Check if a scanned code is a URL containing a hash route
   * Matches URLs like https://example.com#/m/... or https://example.com#/import?...
   *
   * SECURITY FIX: Uses exact route matching for #/import to prevent
   * unrelated routes like #/important from being routed into import handling.
   */
  private isUrlWithHashRoute(code: string): boolean {
    try {
      if (!code.startsWith('http://') && !code.startsWith('https://')) {
        return false;
      }
      const url = new URL(code);
      // Extract path from hash (before any query string)
      const hashPath = url.hash.split('?')[0];
      return hashPath.startsWith('#/m/') || hashPath === '#/import';
    } catch {
      return false;
    }
  }

  /**
   * Process a scanned URL containing a hash route
   *
   * Parses the hash part using HashRouter and dispatches to the appropriate handler:
   * - machine route: loads/creates machine and imports reference DB (no auto-test)
   * - import route: imports full database export via NfcImportService
   */
  private async processScannedUrl(url: string): Promise<void> {
    try {
      const parsed = new URL(url);
      const hash = parsed.hash;

      if (!hash) {
        this.showError(t('identify.errors.invalidCode'));
        return;
      }

      const router = new HashRouter();
      const match = router.parseHash(hash);

      logger.info(
        `📱 QR scan URL parsed: type=${match.type}, machineId=${match.machineId || 'none'}, dbUrl=${match.referenceDbUrl || 'none'}`
      );

      if (match.type === 'machine' && match.machineId) {
        // Machine route: load/create machine and download reference DB
        const validation = this.validateMachineId(match.machineId);
        if (!validation.valid) {
          this.showError(validation.error || t('identify.errors.invalidMachineId'));
          return;
        }

        const machineHandled = await this.handleMachineId(match.machineId, match.referenceDbUrl);

        // After successful machine load + DB import, ask user if they want to run a test
        if (machineHandled) {
          this.nfcOnboarding.openPrompt();
        }
        return;
      }

      if (match.type === 'import' && match.importUrl) {
        // Import route: full database import via external URL
        await this.processScannedImportUrl(match.importUrl);
        return;
      }

      // Unknown route type - treat the whole URL as invalid
      logger.warn(`⚠️ QR scan URL has unknown route type: ${match.type}`);
      this.showError(t('identify.errors.invalidCode'));
    } catch (error) {
      logger.error('Error processing scanned URL:', error);
      this.showError(t('identify.errors.codeProcessing'));
    }
  }

  /**
   * Process a scanned import URL (#/import?url=...)
   * Fetches and imports the full database export, then refreshes the UI.
   * Shows loading overlay during the import process.
   */
  private async processScannedImportUrl(importUrl: string): Promise<void> {
    const overlay = new ReferenceLoadingOverlay();
    overlay.show();
    overlay.updateStatus(t('urlImport.statusFetching'), 10);

    try {
      const result = await nfcImportService.importFromExternalUrl(importUrl, {
        onProgress: (status) => {
          const progressMap: Record<string, number> = {
            [t('urlImport.statusFetching')]: 30,
            [t('urlImport.statusValidating')]: 60,
            [t('urlImport.statusImporting')]: 85,
          };
          overlay.updateStatus(status, progressMap[status] || 50);
        },
        onError: (errorMessage) => {
          overlay.showError(errorMessage);
        },
      });

      if (result.success) {
        overlay.showSuccess();

        const meta = result.metadata;
        const details = meta
          ? `${meta.machineCount} ${t('settingsUI.machines')}, ${meta.recordingCount} ${t('settingsUI.recordings')}, ${meta.diagnosisCount} ${t('settingsUI.diagnoses')}`
          : '';

        notify.success(
          details ? `${t('urlImport.success')}\n\n${details}` : t('urlImport.success'),
          { title: t('urlImport.successTitle') }
        );

        // Refresh UI, then select first machine and offer diagnosis prompt
        setTimeout(() => {
          void (async () => {
            try {
              overlay.hide();
              overlay.destroy();
              await this.refreshMachineLists();
              await this.loadDiagnosisHistory();

              // Select first available machine and ask user if they want to run a test
              const machines = await getAllMachines();
              if (machines.length > 0) {
                const firstMachine = machines[0];
                this.setCurrentMachine(firstMachine);
                this.onMachineSelected(firstMachine);
                this.nfcOnboarding.openPrompt();
              }
            } catch (error) {
              logger.error('Post-import UI refresh failed:', error);
              overlay.hide();
              overlay.destroy();
            }
          })();
        }, 1600);
      } else {
        // Error is already shown via onError callback on the overlay
        await new Promise((resolve) => setTimeout(resolve, 3000));
        overlay.hide();
        overlay.destroy();
      }
    } catch (error) {
      logger.error('QR scan import error:', error);
      overlay.showError(t('urlImport.errorGeneric'));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      overlay.hide();
      overlay.destroy();
    }
  }

  /**
   * Handle manual input from scanner modal
   */
  private async handleManualInput(): Promise<void> {
    await this.scanner.closeScanner();
    this.openManualInputModal();
  }

  /**
   * Handle manual machine ID submission
   */
  private async submitManualInput(): Promise<void> {
    const manualInput = document.getElementById(
      'manual-machine-id-input'
    ) as HTMLInputElement | null;

    if (!manualInput) {
      this.showError(t('identify.errors.manualEntryLoad'));
      return;
    }

    const trimmedCode = manualInput.value.trim();
    const validation = this.validateMachineId(trimmedCode);

    if (!validation.valid) {
      this.showError(validation.error || t('identify.errors.invalidMachineId'));
      return;
    }

    this.closeManualInputModal();
    await this.handleMachineId(trimmedCode);
  }

  /**
   * Open manual input modal
   */
  private openManualInputModal(): void {
    const manualInputModal = document.getElementById('manual-input-modal');
    const manualInput = document.getElementById(
      'manual-machine-id-input'
    ) as HTMLInputElement | null;

    if (manualInputModal) {
      manualInputModal.style.display = 'flex';
    }

    if (manualInput) {
      manualInput.value = '';
      manualInput.focus();
    }
  }

  /**
   * Close manual input modal
   */
  private closeManualInputModal(): void {
    const manualInputModal = document.getElementById('manual-input-modal');
    if (manualInputModal) {
      manualInputModal.style.display = 'none';
    }
  }

  /**
   * Handle machine selection or auto-create if missing
   * Also triggers automatic reference database download for NFC-based setup
   *
   * @param id - Machine identifier
   * @param referenceDbUrl - Optional reference DB URL from NFC link (enables auto-creation with DB)
   */
  private async handleMachineId(id: string, referenceDbUrl?: string): Promise<boolean> {
    try {
      let machine = await getMachine(id);

      if (machine) {
        // Update referenceDbUrl if provided and different from current
        if (referenceDbUrl && machine.referenceDbUrl !== referenceDbUrl) {
          logger.info(`🔄 Updating reference URL for machine ${id}`);
          machine.referenceDbUrl = referenceDbUrl;
          await saveMachine(machine);
        }

        notify.success(t('identify.success.machineLoaded', { name: machine.name }));
        this.setCurrentMachine(machine);
        this.onMachineSelected(machine);

        // Check if reference database download is needed (NFC setup flow)
        const needsDownload = await ReferenceDbService.needsDownload(id);
        if (needsDownload && machine.referenceDbUrl) {
          const downloadSuccess = await this.downloadReferenceDatabase(machine);
          // Reload machine to get updated reference models
          // For full database imports, the machine data might have changed significantly
          machine = await getMachine(id);
          if (machine) {
            this.setCurrentMachine(machine);
            this.onMachineSelected(machine);
          }
          // If download failed, still return true (machine exists) but log warning
          if (!downloadSuccess) {
            logger.warn(`⚠️ Reference download failed for machine ${id}, but machine exists`);
          }
        }

        return true;
      }

      // Machine not found - auto-create
      // If referenceDbUrl is provided (from NFC link), include it for DB download
      if (referenceDbUrl) {
        // Validate URL before creating machine
        const validation = ReferenceDbService.validateUrl(referenceDbUrl);
        if (!validation.valid) {
          logger.error(`Invalid reference URL: ${validation.error}`);
          this.showError(
            t('identify.errors.invalidReferenceUrl') || 'Invalid reference database URL'
          );
          return false;
        }
        logger.info(`🆕 Auto-creating machine ${id} with reference DB URL from NFC`);
      }

      const autoName = t('identify.messages.autoMachineName', { id });
      const newMachine: Machine = {
        id,
        name: autoName,
        nameIsPlaceholder: true,
        createdAt: Date.now(),
        referenceModels: [],
        referenceDbUrl: referenceDbUrl, // Include URL from NFC link
      };

      await saveMachine(newMachine);
      await this.refreshMachineLists();
      notify.success(t('identify.success.machineAutoCreated', { name: autoName }));
      this.setCurrentMachine(newMachine);
      this.onMachineSelected(newMachine);

      // If referenceDbUrl was provided, download the database immediately
      if (referenceDbUrl) {
        const downloadSuccess = await this.downloadReferenceDatabase(newMachine);
        // Reload machine to get updated reference models and metadata
        // For full database imports, the machine data might have changed significantly
        const updatedMachine = await getMachine(id);
        if (updatedMachine) {
          this.setCurrentMachine(updatedMachine);
          this.onMachineSelected(updatedMachine);
        }
        // If download failed, still return true (machine was created) but log warning
        if (!downloadSuccess) {
          logger.warn(`⚠️ Reference download failed for machine ${id}, but machine was created`);
        }
      }

      return true;
    } catch (error) {
      logger.error('Error handling machine ID:', error);
      notify.error(t('identify.errors.machineLoad'), error as Error);
      return false;
    }
  }

  /**
   * Download reference database for a machine (NFC setup flow)
   * Shows loading overlay during download
   *
   * Supports both:
   * - Reference database format (models) → applied to machine
   * - Full database export format (machines, recordings, diagnoses) → full import with replace/reset
   *
   * After successful import (especially full DB import), this method:
   * - Refreshes machine lists to reflect imported data
   * - Returns true if import was successful (caller can then select machine)
   */
  private async downloadReferenceDatabase(machine: Machine): Promise<boolean> {
    const overlay = new ReferenceLoadingOverlay();
    overlay.show();

    try {
      const result = await ReferenceDbService.downloadAndApply(machine.id, (status, progress) => {
        overlay.updateStatus(this.getLocalizedDownloadStatus(status), progress);
      });

      if (result.success) {
        overlay.showSuccess();
        logger.info(
          `✅ Reference DB downloaded: ${result.modelsImported} models, v${result.version}`
        );

        // CRITICAL FIX: Explicitly destroy overlay to prevent it from blocking clicks
        // The setTimeout in showSuccess() might fail, leaving the overlay active
        setTimeout(() => {
          overlay.hide();
          overlay.destroy();
        }, 1600); // Slightly longer than showSuccess timeout to ensure it completes

        // CRITICAL: Refresh machine lists after successful import
        // This is especially important for full database imports where the
        // entire database was replaced - we need to reload all UI state
        await this.refreshMachineLists();

        // Also reload diagnosis history as it may have changed
        await this.loadDiagnosisHistory();

        return true;
      } else {
        overlay.showError(this.getLocalizedDownloadError(result.error || 'unknown'));
        // Keep overlay visible longer for error
        await new Promise((resolve) => setTimeout(resolve, 3000));
        overlay.hide();
        overlay.destroy();
        this.offerDownloadRetry(machine);
        return false;
      }
    } catch (error) {
      logger.error('Reference DB download error:', error);
      overlay.showError(t('machineSetup.errorUnknown'));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      overlay.hide();
      overlay.destroy();
      this.offerDownloadRetry(machine);
      return false;
    }
  }

  /**
   * NFC-Kante: Referenz-Download gescheitert (offline in der Halle, 404,
   * Timeout) → die App bleibt trotzdem voll nutzbar. Dieser Toast sagt das
   * ausdrücklich („Normalzustand direkt aufnehmen") und bietet den erneuten
   * Download mit EINEM Tap an — statt den Nutzer im Unklaren zu lassen.
   */
  private offerDownloadRetry(machine: Machine): void {
    notify.warning(t('machineSetup.downloadFailedHint'), {
      duration: 12000,
      actions: [
        {
          label: t('machineSetup.retryDownload'),
          onClick: () => {
            void this.downloadReferenceDatabase(machine);
          },
        },
      ],
    });
  }

  /**
   * Get localized download status message
   */
  private getLocalizedDownloadStatus(status: string): string {
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
   * Get localized download error message
   */
  private getLocalizedDownloadError(error: string): string {
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
   * Handle manual machine creation
   * Includes service technician fields for NFC setup (expert mode)
   */
  private async handleCreateMachine(): Promise<void> {
    try {
      const nameInput = document.getElementById('machine-name-input') as HTMLInputElement;
      const idInput = document.getElementById('machine-id-input') as HTMLInputElement;

      // Service technician fields (expert mode)
      const refDbUrlInput = document.getElementById('reference-db-url-input') as HTMLInputElement;
      const locationInput = document.getElementById('machine-location-input') as HTMLInputElement;
      const notesInput = document.getElementById('machine-notes-input') as HTMLTextAreaElement;

      if (!nameInput || !idInput) {
        throw new Error('Input elements not found');
      }

      const name = nameInput.value.trim();
      const idInputValue = idInput.value.trim();

      // Get service technician fields if available
      const referenceDbUrl = refDbUrlInput?.value.trim() || undefined;
      const location = locationInput?.value.trim() || undefined;
      const notes = notesInput?.value.trim() || undefined;

      // Sprint 1 UX: Inline validation for machine name
      const nameError = document.getElementById('machine-name-error');

      // Validate name
      if (!name) {
        nameInput.classList.add('input-invalid');
        nameInput.setAttribute('aria-invalid', 'true');
        if (nameError) {
          nameError.style.display = 'block';
        }
        nameInput.focus();
        return;
      }

      // Clear error state on valid input
      nameInput.classList.remove('input-invalid');
      nameInput.removeAttribute('aria-invalid');
      if (nameError) nameError.style.display = 'none';

      // Validate name is not just whitespace and has reasonable length
      if (!/\S/.test(name)) {
        this.showError(t('identify.errors.nameWhitespace'));
        return;
      }

      if (name.length > 100) {
        this.showError(t('identify.errors.nameTooLong'));
        return;
      }

      // Validate reference DB URL if provided
      if (referenceDbUrl) {
        const urlValidation = ReferenceDbService.validateUrl(referenceDbUrl);
        if (!urlValidation.valid) {
          this.showError(
            t(`machineSetup.${this.getUrlErrorKey(urlValidation.error || 'urlInvalid')}`)
          );
          return;
        }
      }

      // Generate or validate ID
      let id: string;
      if (idInputValue) {
        // Validate provided ID
        const validation = this.validateMachineId(idInputValue);
        if (!validation.valid) {
          this.showError(validation.error || t('identify.errors.invalidMachineId'));
          return;
        }
        id = idInputValue;
      } else {
        // Generate new ID
        id = this.generateMachineId();
      }

      // Check if ID already exists
      const existing = await getMachine(id);
      if (existing) {
        this.showError(t('identify.errors.machineExists'));
        return;
      }

      // Sprint 4 UX: Fleet group
      const fleetGroupInput = document.getElementById(
        'machine-fleet-group'
      ) as HTMLInputElement | null;
      const fleetGroup = fleetGroupInput?.value?.trim() || null;

      // Create new machine with service technician fields
      const machine: Machine = {
        id,
        name,
        createdAt: Date.now(),
        referenceModels: [],
        // Service technician fields (NFC setup)
        referenceDbUrl,
        location,
        notes,
        // Sprint 4 UX: Optional fleet group
        fleetGroup,
      };

      await saveMachine(machine);
      await this.refreshMachineLists();

      logger.debug('✅ Machine Created:', {
        id: machine.id,
        name: machine.name,
        createdAt: new Date(machine.createdAt).toLocaleString(),
        hasReferenceDbUrl: !!machine.referenceDbUrl,
      });
      logger.debug('📞 Calling onMachineSelected() with new machine...');

      // Clear inputs
      nameInput.value = '';
      idInput.value = '';
      if (refDbUrlInput) refDbUrlInput.value = '';
      if (locationInput) locationInput.value = '';
      if (notesInput) notesInput.value = '';
      if (fleetGroupInput) fleetGroupInput.value = '';

      // Sprint 4 UX: Update fleet group autocomplete suggestions
      this.populateFleetGroupSuggestions();

      this.showNotification(t('identify.success.machineCreated', { name }));
      this.setCurrentMachine(machine);
      this.onMachineSelected(machine);
    } catch (error) {
      logger.error('Create machine error:', error);
      this.showError(t('identify.errors.machineCreate'));
    }
  }

  /**
   * Map URL validation error to i18n key
   */
  private getUrlErrorKey(error: string): string {
    const errorMap: Record<string, string> = {
      url_empty: 'urlEmpty',
      url_invalid: 'urlInvalid',
      url_not_https: 'urlNotHttps',
      google_drive_not_direct: 'googleDriveNotDirect',
      url_not_official_source: 'urlNotOfficialSource',
    };
    return errorMap[error] || 'urlInvalid';
  }

  /**
   * Refresh machine lists (overview + quick select) after updates.
   */
  public async refreshMachineLists(): Promise<void> {
    await Promise.all([this.loadMachineOverview(), this.quickSelectList.load()]);
    // Welle 2: Also update dashboard when machine lists refresh
    await this.updateDashboard();
    // Welle 5: Update tile badge count
    this.updateIdentifyTileBadge();
  }

  /**
   * Welle 5: Initialize tile navigation for "Maschine auswählen"
   */
  private initIdentifyTiles(): void {
    const tiles = document.querySelectorAll('.identify-tile');
    const sections = document.querySelectorAll('#select-machine-content .identify-section');

    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const targetId = (tile as HTMLElement).dataset.target;
        if (!targetId) return;

        const target = document.getElementById(targetId);

        // Toggle: if already visible, hide it (go back to tiles)
        if (target && target.style.display !== 'none') {
          target.style.display = 'none';
          tile.classList.remove('active');
          return;
        }

        // Hide all sections
        sections.forEach((s) => ((s as HTMLElement).style.display = 'none'));
        tiles.forEach((t) => t.classList.remove('active'));

        // Show target section
        if (target) {
          target.style.display = '';
          tile.classList.add('active');
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    // Update machine count badge
    this.updateIdentifyTileBadge();
  }

  /**
   * Welle 5: Update the machine count badge on the list tile
   */
  private async updateIdentifyTileBadge(): Promise<void> {
    const badge = document.getElementById('identify-tile-count');
    if (!badge) return;
    const machines = await getAllMachines();
    badge.textContent = machines.length > 0 ? String(machines.length) : '';
    badge.style.display = machines.length > 0 ? '' : 'none';
  }

  /**
   * Welle 2 UX: Update the status dashboard on the start screen.
   * Delegates to the extracted DashboardRenderer.
   */
  public updateDashboard(): Promise<void> {
    return this.dashboardRenderer.update();
  }

  /**
   * Generate random machine ID
   */
  private generateMachineId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Validate machine ID format
   * Ensures ID is not empty, not just whitespace, and has reasonable length
   */
  private validateMachineId(id: string): { valid: boolean; error?: string } {
    // Trim whitespace
    const trimmedId = id.trim();

    // Check if empty after trimming
    if (!trimmedId) {
      return { valid: false, error: t('identify.errors.idEmpty') };
    }

    // Check minimum length (at least 1 character)
    if (trimmedId.length < 1) {
      return { valid: false, error: t('identify.errors.idTooShort') };
    }

    // Check maximum length (prevent excessive IDs)
    if (trimmedId.length > 100) {
      return { valid: false, error: t('identify.errors.idTooLong') };
    }

    // Check for only whitespace characters (extra safety)
    if (!/\S/.test(trimmedId)) {
      return { valid: false, error: t('identify.errors.idWhitespace') };
    }

    return { valid: true };
  }

  /**
   * Show notification message
   */
  private showNotification(message: string): void {
    notify.success(message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    notify.error(message);
  }

  /**
   * Track currently selected machine for NFC writer context.
   */
  private setCurrentMachine(machine: Machine): void {
    this.currentMachine = machine;
    this.nfcWriteModal.updateNfcSpecificOption();
  }

  /**
   * ========================================
   * MACHINE DETAIL MODAL
   * ========================================
   */

  /**
   * Initialize machine detail modal event listeners
   */
  /**
   * Welle 3: Quick-create a machine with just a name (no SAP-ID, no extras).
   * Returns the created machine or null on failure.
   */
  public async createMachineQuick(name: string): Promise<Machine | null> {
    try {
      const machine: Machine = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: Date.now(),
        referenceModels: [],
      };
      await saveMachine(machine);
      await this.refreshMachineLists();
      logger.info(`Quick-created machine: ${machine.name} (${machine.id})`);
      return machine;
    } catch (error) {
      logger.error('Failed to quick-create machine:', error);
      notify.error(t('identify.errors.createFailed'));
      return null;
    }
  }

  /**
   * Welle 3: Select a machine programmatically (used by unified flow).
   */
  public selectMachineById(machineId: string): void {
    getMachine(machineId).then((machine) => {
      if (machine) {
        this.setCurrentMachine(machine);
        this.onMachineSelected(machine);
      }
    });
  }

  /**
   * Deep link handling for magic URLs.
   * Supports:
   * - New format: #/m/<id>?c=<customer_id> (customerId builds DB URL automatically)
   * - Legacy hash format: #/m/<id>?ref=<encoded_url>
   * - Legacy query param format: ?machineId=<id>
   *
   * When customerId (c) is provided (NFC setup flow - Variante B):
   * - DB URL is built automatically: https://gunterstruck.github.io/<customerId>/db-latest.json
   * - Auto-creates machine if not found
   * - Downloads and imports the complete database
   * - Selects the specific machine
   * - Offers "Test starten" immediately
   */
  private async handleDeepLink(): Promise<void> {
    let machineId: string | null = null;
    let referenceDbUrl: string | undefined;
    let customerId: string | undefined;
    let isHashRoute = false;

    // Check hash-based route first using HashRouter for correct parsing
    // This properly handles #/m/<machine_id>?c=<customer_id> (new) or ?ref=<encoded_url> (legacy)
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/m/')) {
      // ═══════════════════════════════════════════════════════════════════════════
      // KRITISCH: NFC-Onboarding erzwingt Simple Mode - BEVOR irgendetwas anderes läuft!
      // Reihenfolge: 1) View Level → 2) Detection Mode → 3) Trace → 4) Rest
      // ═══════════════════════════════════════════════════════════════════════════

      // SCHRITT 1: View Level auf "basic" setzen (UI-Darstellung)
      // Muss SOFORT passieren, bevor irgendwelche UI-Komponenten initialisiert werden
      const previousViewLevel =
        document.documentElement.getAttribute('data-view-level') || 'unknown';
      setViewLevelTemporary('basic', 'nfc_onboarding');
      // Validierung: Sicherstellen, dass das Attribut wirklich gesetzt wurde
      const currentViewLevel = document.documentElement.getAttribute('data-view-level');
      if (currentViewLevel !== 'basic') {
        logger.error(
          `❌ NFC-Onboarding: View Level konnte nicht auf 'basic' gesetzt werden! Ist: ${currentViewLevel}`
        );
        // Fallback: Manuell setzen
        document.documentElement.setAttribute('data-view-level', 'basic');
      }
      logger.info(`🎨 NFC-Onboarding: View Level von '${previousViewLevel}' auf 'basic' gesetzt`);

      // SCHRITT 2: Trace-Session starten (für Debugging/Protokoll)
      onboardingTrace.start('nfc');

      // Mark NFC onboarding as active (for view level restore later)
      this.nfcOnboarding.markOnboardingActive();

      // Trace: Mode-Änderung protokollieren
      onboardingTrace.success('ui_mode_set', {
        from: previousViewLevel,
        to: 'basic',
        reason: 'nfc_onboarding',
      });

      // Show trace overlay for debugging (always show for NFC deep links, or when debug=1)
      const showDebugTrace = OnboardingTraceService.shouldShowTrace();
      if (showDebugTrace) {
        traceOverlay.show();
      }

      const router = new HashRouter();
      const match = router.parseHash(hash);
      if (match.type === 'machine' && match.machineId) {
        machineId = match.machineId;
        customerId = match.customerId;
        referenceDbUrl = match.referenceDbUrl;
        isHashRoute = true;
        logger.info(
          `🔗 Deep link parsed: machineId=${machineId}, customerId=${customerId || 'none'}, dbUrl=${referenceDbUrl || 'none'}`
        );
      }
    }

    // Sprint 6: Handle fleet deep links (#/f/<fleet_id>?c=<customer_id>)
    if (hash && hash.startsWith('#/f/')) {
      logger.info('🔗 Fleet deep link detected');

      const fleetRouter = new HashRouter();
      const fleetMatch = fleetRouter.parseHash(hash);

      if (fleetMatch.type === 'fleet' && fleetMatch.fleetId && fleetMatch.fleetDbUrl) {
        logger.info(`🚢 Fleet route: ${fleetMatch.fleetId} → ${fleetMatch.fleetDbUrl}`);

        // Show loading overlay
        const overlay = new ReferenceLoadingOverlay();
        overlay.show();

        // Configure callbacks
        fleetRouter.setOnDownloadProgress((status, progress) => {
          overlay.updateStatus(status, progress || 50);
        });

        fleetRouter.setOnDownloadError((error) => {
          logger.error(`Fleet provisioning failed: ${error}`);
          overlay.showError(t('fleet.provision.error'));
          setTimeout(() => overlay.hide(), 3000);
        });

        fleetRouter.setOnFleetReady((fleetName, machineCount) => {
          logger.info(`✅ Fleet "${fleetName}" ready with ${machineCount} machines`);
          overlay.showSuccess();
          setTimeout(() => overlay.hide(), 1500);

          // Refresh machine lists to show new fleet
          this.refreshMachineLists();

          // Notify parent (Router) to switch to fleet mode (auto-start guided check from deep link)
          if (this.onFleetProvisioned) {
            this.onFleetProvisioned(fleetName, true);
          }
        });

        // Trigger fleet route handling (downloads + provisions)
        // init() calls handleHashChange() which processes the current hash
        await fleetRouter.init();

        // Clean up URL after processing
        window.history.replaceState({}, document.title, window.location.pathname);

        // Destroy router to remove hashchange listener
        fleetRouter.destroy();
        return; // Don't fall through to machine ID handling
      }
    }

    // Sprint 8: Handle quick compare deep links (#/q/<number> – count-only, fully offline)
    if (hash && hash.startsWith('#/q/')) {
      logger.info('⚡ Quick Compare deep link detected');

      const qcRouter = new HashRouter();
      const qcMatch = qcRouter.parseHash(hash);
      qcRouter.destroy(); // Not needed beyond parsing

      if (qcMatch.type === 'quickcompare' && qcMatch.machineCount) {
        const count = qcMatch.machineCount;
        logger.info(`⚡ Quick Compare route (count-only): ${count} machines`);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Directly notify parent – no async round-trip needed for count-only
        if (this.onQuickCompareProvisioned) {
          this.onQuickCompareProvisioned(count);
        } else {
          logger.error('❌ Quick Compare deep link: onQuickCompareProvisioned callback not set');
        }
        return; // Don't fall through to machine ID handling
      }
    }

    // Fallback to legacy query param: ?machineId=<id>
    if (!machineId) {
      const params = new URLSearchParams(window.location.search);
      machineId = params.get('machineId');
    }

    if (!machineId) {
      return;
    }

    const validation = this.validateMachineId(machineId);
    if (!validation.valid) {
      this.showError(validation.error || t('identify.errors.invalidMachineId'));
      onboardingTrace.fail('process_failed', { reason: 'invalid_machine_id', machineId });
      return;
    }

    this.showDeepLinkOverlay(true);
    let machineHandled = false;
    try {
      machineHandled = await this.handleMachineId(machineId, referenceDbUrl);

      // Clean up URL after processing
      if (isHashRoute) {
        // Clear hash
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search
        );
      } else {
        // Clear query param
        const params = new URLSearchParams(window.location.search);
        params.delete('machineId');
        const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (error) {
      logger.error('Failed to handle deep link:', error);
      this.showError(t('identify.errors.machineLoad'));
      onboardingTrace.fail('process_failed', {
        reason: 'handle_machine_error',
        error: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      this.showDeepLinkOverlay(false);
    }

    if (machineHandled) {
      // Trace: Test dialog shown
      onboardingTrace.success('test_dialog_shown', { machineId });
      // Mark onboarding as complete
      onboardingTrace.success('onboarding_complete', { status: 'success' });
      // End trace session
      onboardingTrace.end();

      // TEIL B: Automatisches Ausblenden des Protokolls bei Erfolg
      // Wenn kein Fehler aufgetreten ist UND nicht im Debug-Modus: Overlay vollständig ausblenden
      if (onboardingTrace.shouldAutoHide()) {
        onboardingTrace.success('trace_hidden', { reason: 'success' });
        traceOverlay.hide();
        logger.debug('[NFC Onboarding] Trace overlay auto-hidden (success, no errors)');
      }

      this.nfcOnboarding.openPrompt();
    } else {
      // End trace session on failure - Protokoll bleibt sichtbar
      onboardingTrace.end();
      // Trace overlay bleibt sichtbar für Fehleranalyse (Teil B Fehlerfall)
      logger.debug('[NFC Onboarding] Trace overlay remains visible (error occurred)');
    }
  }

  private showDeepLinkOverlay(show: boolean): void {
    if (!this.deepLinkOverlay) {
      this.deepLinkOverlay = document.getElementById('deep-link-overlay');
    }
    if (this.deepLinkOverlay) {
      this.deepLinkOverlay.style.display = show ? 'flex' : 'none';
      this.deepLinkOverlay.style.pointerEvents = show ? 'auto' : 'none';
    }
  }

  private getBaseAppUrl(): string {
    return new URL('/', window.location.origin).toString();
  }

  /**
   * Get selected device ID for recording
   * Called by other phases that need to record audio
   */
  public getSelectedDeviceId(): string | undefined {
    return this.micController.getSelectedDeviceId();
  }

  /**
   * ========================================
   * SPRINT 4 UX: FLEET CHECK MODE
   * ========================================
   */

  /**
   * Sprint 4 UX: Initialize workflow mode toggle buttons
   */
  private initWorkflowToggle(): void {
    const seriesBtn = document.getElementById('toggle-series');
    const fleetBtn = document.getElementById('toggle-fleet');

    if (seriesBtn) {
      seriesBtn.textContent = t('fleet.toggle.series');
      seriesBtn.addEventListener('click', () => this.setWorkflowMode('series'));
    }
    if (fleetBtn) {
      fleetBtn.textContent = t('fleet.toggle.fleet');
      fleetBtn.addEventListener('click', () => this.setWorkflowMode('fleet'));
    }
  }

  /**
   * Sprint 4 UX: Switch workflow mode and re-render machine list
   */
  public async setWorkflowMode(mode: 'series' | 'fleet'): Promise<void> {
    if (this.currentWorkflowMode === mode) return;

    this.currentWorkflowMode = mode;

    // Update toggle button states
    const seriesBtn = document.getElementById('toggle-series');
    const fleetBtn = document.getElementById('toggle-fleet');
    if (seriesBtn) {
      seriesBtn.classList.toggle('toggle-btn-active', mode === 'series');
      seriesBtn.setAttribute('aria-pressed', String(mode === 'series'));
    }
    if (fleetBtn) {
      fleetBtn.classList.toggle('toggle-btn-active', mode === 'fleet');
      fleetBtn.setAttribute('aria-pressed', String(mode === 'fleet'));
    }

    // Sprint 5: Update CTA button text based on mode
    const addBtn = document.getElementById('add-new-machine-btn');
    if (addBtn) {
      const label = addBtn.querySelector('span');
      if (label) {
        label.textContent = mode === 'fleet' ? t('fleet.cta.newFleet') : t('buttons.newMachine');
      }
    }

    // Re-render machine overview with new mode
    await this.loadMachineOverview();
  }

  /**
   * Sprint 4 UX: Populate fleet group datalist with existing group names.
   * Called on init and after machine creation to keep suggestions current.
   */
  private async populateFleetGroupSuggestions(): Promise<void> {
    const datalist = document.getElementById('fleet-group-suggestions');
    if (!datalist) return;

    // Clear existing options
    datalist.innerHTML = '';

    // Collect unique fleet groups from all machines
    const machines = await getAllMachines();
    const groups = new Set<string>();
    for (const m of machines) {
      if (m.fleetGroup) {
        groups.add(m.fleetGroup);
      }
    }

    // Add as datalist options (sorted alphabetically)
    const sorted = [...groups].sort((a, b) => a.localeCompare(b));
    for (const group of sorted) {
      const option = document.createElement('option');
      option.value = group;
      datalist.appendChild(option);
    }
  }

  /**
   * Export current fleet as JSON file for NFC/QR provisioning.
   */
  private async exportCurrentFleet(groupName: string): Promise<void> {
    const result = await ReferenceDbService.exportFleet(groupName);
    if (!result) {
      notify.error(t('fleet.export.failed'));
      return;
    }

    // Trigger download
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notify.success(t('fleet.export.success', { name: groupName }));
  }

  /**
   * Activate fleet mode from external trigger (e.g., NFC fleet provisioning).
   * Sprint 6: Also called after fleet deep link provisioning to auto-navigate to fleet ranking.
   */
  public async activateFleetMode(fleetName?: string): Promise<void> {
    if (this.currentWorkflowMode !== 'fleet') {
      await this.setWorkflowMode('fleet');
    } else {
      await this.loadMachineOverview();
    }
    await this.populateFleetGroupSuggestions();

    if (fleetName) {
      logger.info(`🚢 Fleet mode activated for: "${fleetName}"`);
    }
  }

  /**
   * Sprint 5 UX: Public method for Router to trigger fleet ranking re-render
   */
  public async showFleetRanking(): Promise<void> {
    if (this.currentWorkflowMode !== 'fleet') {
      this.currentWorkflowMode = 'series'; // Force mode switch
      await this.setWorkflowMode('fleet');
    } else {
      await this.loadMachineOverview();
    }
  }

  /**
   * ========================================
   * MACHINE OVERVIEW
   * ========================================
   */

  /**
   * Load all machines and render the overview with status
   */
  private async loadMachineOverview(): Promise<void> {
    try {
      const machines = await getAllMachines();

      // Sort by most recent activity (lastDiagnosisAt or createdAt)
      machines.sort((a, b) => {
        const aTime = a.lastDiagnosisAt || a.createdAt;
        const bTime = b.lastDiagnosisAt || b.createdAt;
        return bTime - aTime;
      });

      await this.renderMachineOverview(machines);
    } catch (error) {
      logger.error('Failed to load machine overview:', error);
    }
  }

  /**
   * Render machine overview list with status
   */
  private async renderMachineOverview(machines: Machine[]): Promise<void> {
    const overviewContainer = document.getElementById('machine-overview');
    const emptyState = document.getElementById('machine-overview-empty');

    if (!overviewContainer) {
      logger.warn('Machine overview container not found');
      return;
    }

    // Clear existing items (except empty state and fleet-specific elements)
    const existingItems = overviewContainer.querySelectorAll(
      '.machine-item, .fleet-rank-item, .fleet-header, .fleet-save-cta, .fleet-check-all-btn'
    );
    existingItems.forEach((item) => item.remove());

    // Sprint 4 UX: Branch based on workflow mode
    if (this.currentWorkflowMode === 'fleet') {
      await this.fleetRankingRenderer.render(machines);
      return;
    }

    // --- Series mode (existing, unmodified) ---

    // Show/hide empty state
    if (emptyState) {
      emptyState.style.display = machines.length === 0 ? 'block' : 'none';
    }

    // Render each machine
    for (const machine of machines) {
      const machineItem = await this.overviewRenderer.createItem(machine);
      // Insert before the empty state element
      if (emptyState) {
        overviewContainer.insertBefore(machineItem, emptyState);
      } else {
        overviewContainer.appendChild(machineItem);
      }
    }

    // Sprint 3 UX: Lazy-load sparklines after initial render
    requestAnimationFrame(() => {
      void this.overviewRenderer.loadSparklines();
    });
  }

  /**
   * Handle machine selection from overview
   *
   * UX: Antippen = LADEN. Der 90-%-Fall ist „diese Maschine jetzt prüfen" —
   * der Umweg über das Detail-Modal (+ „Maschine laden"-Tap) entfällt.
   * Verwaltung (⭐/Löschen/Verlauf) bleibt über den ⓘ-Button am Eintrag
   * erreichbar (öffnet weiterhin das Detail-Modal, s. handleMachineDetails).
   */
  private async handleMachineSelect(machine: Machine): Promise<void> {
    logger.info(`Machine selected from overview: ${machine.name} (${machine.id})`);

    // Reload machine from DB to get latest state
    const freshMachine = await getMachine(machine.id);
    if (!freshMachine) {
      this.showError(t('identify.errors.machineNotFound'));
      await this.refreshMachineLists();
      return;
    }

    this.onMachineSelected(freshMachine);
  }

  /** Detail-Modal (⭐/Löschen/Verlauf) für einen Listeneintrag öffnen. */
  private async handleMachineDetails(machine: Machine): Promise<void> {
    const freshMachine = await getMachine(machine.id);
    if (!freshMachine) {
      this.showError(t('identify.errors.machineNotFound'));
      await this.refreshMachineLists();
      return;
    }
    this.machineDetailModal.show(freshMachine);
  }

  /**
   * ========================================
   * DIAGNOSIS HISTORY
   * ========================================
   */

  /**
   * Load and render diagnosis history
   */
  private async loadDiagnosisHistory(): Promise<void> {
    try {
      // Get last 10 diagnoses across all machines
      const diagnoses = await getAllDiagnoses(10);
      await this.renderDiagnosisHistory(diagnoses);
    } catch (error) {
      logger.error('Failed to load diagnosis history:', error);
    }
  }

  /**
   * Render diagnosis history list
   */
  private async renderDiagnosisHistory(diagnoses: DiagnosisResult[]): Promise<void> {
    const historyContainer = document.getElementById('history-list');
    const emptyState = document.getElementById('history-empty');
    const historySection = document.getElementById('history-section');

    if (!historyContainer) {
      logger.warn('History container not found');
      return;
    }

    // Clear existing items (except empty state)
    const existingItems = historyContainer.querySelectorAll('.history-item');
    existingItems.forEach((item) => item.remove());

    // Show/hide empty state and section
    if (emptyState) {
      emptyState.style.display = diagnoses.length === 0 ? 'block' : 'none';
    }

    // Hide entire section if no diagnoses
    if (historySection) {
      historySection.style.display = diagnoses.length === 0 ? 'none' : 'block';
    }

    // Get machine names for display
    const machines = await getAllMachines();
    const machineMap = new Map(machines.map((m) => [m.id, m]));

    // Render each diagnosis
    for (const diagnosis of diagnoses) {
      const machine = machineMap.get(diagnosis.machineId);
      const historyItem = this.createHistoryItem(diagnosis, machine);
      // Insert before the empty state element
      if (emptyState) {
        historyContainer.insertBefore(historyItem, emptyState);
      } else {
        historyContainer.appendChild(historyItem);
      }
    }
  }

  /**
   * Create a history item element
   */
  private createHistoryItem(diagnosis: DiagnosisResult, machine?: Machine): HTMLElement {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.dataset.machineId = diagnosis.machineId;

    // Create history info
    const historyInfo = document.createElement('div');
    historyInfo.className = 'history-info';

    const machineName = document.createElement('div');
    machineName.className = 'history-machine-name';
    machineName.textContent =
      machine?.name || t('identify.messages.autoMachineName', { id: diagnosis.machineId });

    const historyDetails = document.createElement('div');
    historyDetails.className = 'history-details';

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.className = `history-status-badge status-${diagnosis.status}`;
    statusBadge.textContent = this.getStatusLabel(diagnosis.status);

    // Score
    const scoreText = document.createElement('span');
    scoreText.className = 'history-score';
    scoreText.textContent = `${Math.round(diagnosis.healthScore)}%`;

    // Time
    const timeText = document.createElement('span');
    timeText.className = 'history-time';
    timeText.textContent = this.formatRelativeTime(diagnosis.timestamp);

    historyDetails.appendChild(statusBadge);
    historyDetails.appendChild(scoreText);
    historyDetails.appendChild(timeText);

    historyInfo.appendChild(machineName);
    historyInfo.appendChild(historyDetails);

    // Create chevron icon
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'chevron-right');
    chevron.setAttribute('width', '20');
    chevron.setAttribute('height', '20');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    chevron.appendChild(polyline);

    // Assemble item
    historyItem.appendChild(historyInfo);
    historyItem.appendChild(chevron);

    // Add click handler - select the machine
    if (machine) {
      historyItem.addEventListener('click', () => this.handleMachineSelect(machine));
    }

    return historyItem;
  }

  /**
   * ========================================
   * HELPER FUNCTIONS
   * ========================================
   */

  /**
   * Format timestamp to relative time (German)
   */
  private formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) {
      return t('identify.time.justNow');
    } else if (minutes < 60) {
      return t('identify.time.minutesAgo', { minutes: String(minutes) });
    } else if (hours < 24) {
      return t('identify.time.hoursAgo', { hours: String(hours) });
    } else if (days < 7) {
      return days === 1
        ? t('identify.time.dayAgo')
        : t('identify.time.daysAgo', { days: String(days) });
    } else {
      return weeks === 1
        ? t('identify.time.weekAgo')
        : t('identify.time.weeksAgo', { weeks: String(weeks) });
    }
  }

  /**
   * Get localized status label
   */
  private getStatusLabel(status: DiagnosisResult['status']): string {
    switch (status) {
      case 'healthy':
        return t('status.healthy');
      case 'uncertain':
        return t('status.uncertain');
      case 'faulty':
        return t('status.faulty');
      default:
        return t('status.unknown');
    }
  }

  /**
   * Handle "Neue Maschine" button click
   * Scrolls to the machine creation section and focuses the input
   */
  private handleAddNewMachine(): void {
    // Reveal the machine-creation section. These buttons ("Erste Maschine
    // anlegen" / "Neue Maschine anlegen") live inside the machine-list view, so
    // we switch identify-sections the same way the create tile does, instead of
    // scrolling to an inline form id that no longer exists.
    const createSection = document.getElementById('create-section');
    const nameInput = document.getElementById('machine-name-input') as HTMLInputElement | null;

    if (createSection) {
      // Hide the other identify-sections + clear active tiles, then show create.
      document
        .querySelectorAll('#select-machine-content .identify-section')
        .forEach((s) => ((s as HTMLElement).style.display = 'none'));
      document
        .querySelectorAll('.identify-tile')
        .forEach((tile) => tile.classList.remove('active'));
      createSection.style.display = '';
      document.getElementById('identify-tile-create')?.classList.add('active');
      createSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Focus the name input once the section is visible.
      setTimeout(() => nameInput?.focus(), 300);
    } else if (nameInput) {
      // Fallback: just focus the input
      nameInput.focus();
    }
  }

  /**
   * Cleanup on phase exit
   */
  public cleanup(): void {
    this.micController.cleanup();
  }
}
