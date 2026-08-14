/**
 * ZANOBOT - ROUTER
 *
 * Simple state manager that controls the 4-phase flow:
 * Phase 1: Identify → Phase 2: Reference / Phase 3: Diagnose
 * Phase 4: Settings (always available, independent of machine selection)
 *
 * The user MUST select a machine (Phase 1) before accessing Phase 2 or 3.
 *
 * Uses GMIA analysis (ReferencePhase, DiagnosePhase) for acoustic pattern comparison.
 */

import { IdentifyPhase } from './phases/1-Identify.js';
import type { ReferencePhase } from './phases/2-Reference.js';
import type { DiagnosePhase } from './phases/3-Diagnose.js';
import { SettingsPhase } from './phases/4-Settings.js';
import type { AutoDetectionPhase } from './phases/AutoDetectionPhase.js';
import { calculateFleetStats } from './phases/fleetStats.js';
import { DiagnoseCardController } from './components/DiagnoseCardController.js';
import { ReferenceCardController } from './components/ReferenceCardController.js';
import {
  getAllMachines,
  getMachine,
  getLatestDiagnosis,
  getDiagnosesForMachine,
  deleteDiagnosis,
} from '@data/db.js';
import type { AutoDetectionResult, MachineMatchResult } from '@data/types.js';
import type { Machine } from '@data/types.js';
import { isGMIAModel } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { notify } from '@utils/notifications.js';
import { escapeHtml } from '@utils/sanitize.js';
import { t, getLocale, LANGUAGE_CHANGE_EVENT } from '../i18n/index.js';
import { getRecordingSettings, RECORDING_SETTINGS_EVENT } from '@utils/recordingSettings.js';
import { QuickCompareController } from './QuickCompareController.js';
import { exportAsPrintablePDF, type ReportData, type ReportEntry } from '@utils/reportExport.js';
import { hapticForScore } from '@utils/haptics.js';

/**
 * Lazy-load the heavy phase modules on demand and cache the module promise.
 *
 * Phase 1 (Identify) and Phase 4 (Settings) stay eagerly imported because they
 * are needed at startup. Phases 2 (Reference), 3 (Diagnose) and Auto-Detection
 * are only reached after user interaction, so they are split into their own
 * chunks. preloadLazyPhases() warms these chunks during construction, so by the
 * time a phase is actually instantiated the module is already available and the
 * awaits at the instantiation sites resolve without a visible delay.
 */
let referencePhaseModulePromise: Promise<typeof import('./phases/2-Reference.js')> | null = null;
function loadReferencePhaseModule(): Promise<typeof import('./phases/2-Reference.js')> {
  return (referencePhaseModulePromise ??= import('./phases/2-Reference.js'));
}

let diagnosePhaseModulePromise: Promise<typeof import('./phases/3-Diagnose.js')> | null = null;
function loadDiagnosePhaseModule(): Promise<typeof import('./phases/3-Diagnose.js')> {
  return (diagnosePhaseModulePromise ??= import('./phases/3-Diagnose.js'));
}

let autoDetectionPhaseModulePromise: Promise<
  typeof import('./phases/AutoDetectionPhase.js')
> | null = null;
function loadAutoDetectionPhaseModule(): Promise<typeof import('./phases/AutoDetectionPhase.js')> {
  return (autoDetectionPhaseModulePromise ??= import('./phases/AutoDetectionPhase.js'));
}

/** Warm the lazily-loaded phase chunks ahead of first use. */
function preloadLazyPhases(): void {
  void loadReferencePhaseModule();
  void loadDiagnosePhaseModule();
  void loadAutoDetectionPhaseModule();
}

export class Router {
  private currentMachine: Machine | null = null;
  private identifyPhase: IdentifyPhase;
  private settingsPhase: SettingsPhase;

  // GMIA phases
  private referencePhase: ReferencePhase | null = null;
  private diagnosePhase: DiagnosePhase | null = null;

  // Auto-detection phase (simplified flow)
  private autoDetectionPhase: AutoDetectionPhase | null = null;

  // Card state controllers
  private diagnoseCardController: DiagnoseCardController;
  private referenceCardController: ReferenceCardController;

  /** Sprint 5: Fleet diagnosis queue */
  private fleetQueue: string[] = [];
  private fleetQueueIndex: number = 0;
  private fleetQueueGroupName: string = '';
  private isFleetQueueActive: boolean = false;
  private isFleetQueuePaused: boolean = false;
  private boundVisibilityHandler: (() => void) | null = null;
  /** Sprint 6: Count skipped machines in guided fleet check */
  private fleetQueueSkipped: number = 0;
  /** Track diagnosis IDs created during fleet queue for discard functionality */
  private fleetQueueDiagnosisIds: string[] = [];

  /** Sprint 7: Quick Compare Controller */
  private quickCompareController: QuickCompareController;

  constructor() {
    // Warm the lazily-loaded phase chunks so they are ready before first use.
    preloadLazyPhases();

    // Initialize Phase 1 (always available)
    this.identifyPhase = new IdentifyPhase((machine) => this.onMachineSelected(machine));

    // Wire up all deep link callbacks BEFORE init(), because init() fires handleDeepLink()
    // synchronously and count-only quick compare resolves without yielding to the event loop.

    // Sprint 5: Wire up fleet queue callback
    this.identifyPhase.onStartFleetQueue = (ids, name) => this.startFleetQueue(ids, name);

    // Sprint 6: Wire up fleet provisioning callback
    this.identifyPhase.onFleetProvisioned = (fleetName: string, autoStartCheck: boolean) => {
      this.handleFleetProvisioned(fleetName, autoStartCheck);
    };

    // Sprint 8: Wire up quick compare count-only deep link callback
    this.identifyPhase.onQuickCompareProvisioned = (count: number) => {
      this.handleQuickCompareCountDeepLink(count);
    };

    // Welle 2: Wire up dashboard "Jetzt prüfen" to diagnosis
    this.identifyPhase.onStartDiagnosis = (machine: Machine) => {
      this.onMachineSelected(machine);
      // Auto-start diagnosis after a short delay to let phases initialize
      setTimeout(() => {
        const diagnoseBtn = document.getElementById('diagnose-btn');
        if (diagnoseBtn) {
          diagnoseBtn.click();
        }
      }, 300);
    };

    // Now initialize – deep link handler can safely invoke the callbacks above
    this.identifyPhase.init();

    // Sprint 7: Initialize Quick Compare Controller
    this.quickCompareController = new QuickCompareController();
    this.quickCompareController.onStartFleetQueue = (ids, name) => this.startFleetQueue(ids, name);
    this.quickCompareController.onNavigateHome = () => {
      this.identifyPhase.refreshMachineLists();
    };

    // Sprint 7: Wire up Quick Compare button
    const qcBtn = document.getElementById('quick-compare-btn');
    if (qcBtn) {
      qcBtn.addEventListener('click', () => {
        this.quickCompareController.start();
      });
    }

    // Initialize Phase 4 (Settings - always available, independent of machine selection)
    this.settingsPhase = new SettingsPhase();
    this.settingsPhase.init();

    // Initialize DiagnoseCardController for state-based UI
    this.diagnoseCardController = new DiagnoseCardController();
    this.diagnoseCardController.init({
      onMachineSelected: (machine) => this.onMachineSelected(machine),
      onScanRequested: () => this.handleDiagnoseScanRequest(),
      onSelectRequested: () => this.handleDiagnoseSelectRequest(),
      onCreateRequested: () => this.handleDiagnoseCreateRequest(),
      onAutoDetectRequested: () => void this.handleAutoDetectRequest(),
    });

    // Sprint 9: Wire up Fleet Quick Check button (same pattern as Quick Compare button)
    const fleetQcBtn = document.getElementById('fleet-quickcheck-btn');
    if (fleetQcBtn) {
      fleetQcBtn.addEventListener('click', () => {
        void this.handleFleetQuickCheck();
      });
    }

    // Initialize ReferenceCardController for state-based UI (mirrors DiagnoseCardController)
    this.referenceCardController = new ReferenceCardController();
    this.referenceCardController.init({
      onScanRequested: () => this.handleReferenceScanRequest(),
      onSelectRequested: () => this.handleReferenceSelectRequest(),
      onCreateRequested: () => this.handleReferenceCreateRequest(),
    });

    // Lock Phase 3 initially, but keep Phase 2 (Reference) available for zero-friction
    this.lockPhases();

    // CRITICAL: Explicitly ensure auto-detect buttons are always enabled
    // This is needed because auto-detection works WITHOUT machine pre-selection
    this.ensureAutoDetectButtonsEnabled();

    // CRITICAL: Ensure tile buttons (QR scannen, Maschine wählen, Neue Maschine) are always clickable
    this.ensureTileButtonsEnabled();

    // ZERO-FRICTION: Initialize reference phase without machine for zero-friction recording
    // This allows users to start recording immediately without selecting a machine first.
    // Fire-and-forget: the reference module is prefetched, so it is ready almost
    // immediately; the record button is only usable once its phase has initialised.
    void this.initializeZeroFrictionReferencePhase();

    // CRITICAL FIX: Update duration-dependent UI texts on init and when settings change
    // This ensures the displayed recording duration always matches the user's settings
    this.updateRecordingDurationTexts();

    // Listen for recording settings changes to update duration texts immediately
    window.addEventListener(RECORDING_SETTINGS_EVENT, () => {
      this.updateRecordingDurationTexts();
    });

    // Listen for language changes to re-render duration texts with correct locale
    window.addEventListener(LANGUAGE_CHANGE_EVENT, () => {
      this.updateRecordingDurationTexts();
    });
  }

  /**
   * Die Maschinenansicht für eine Maschine öffnen (Suche in der Kopfleiste).
   *
   * Der Router reicht durch, statt dass die Suche sich die Identify-Phase
   * selbst heraussucht: So bleibt es bei einem Weg von außen in die Phasen.
   */
  public showMachineView(machine: Machine): void {
    this.identifyPhase.showMachineView(machine);
  }

  /**
   * Called when a machine is selected in Phase 1
   */
  private onMachineSelected(machine: Machine): void {
    logger.info(`🤖 Machine selected: ${machine.name} (${machine.id})`);

    // DEBUG LOGGING: Show selected machine details
    logger.debug('🎯 Machine Selection Debug:', {
      machineId: machine.id,
      machineName: machine.name,
      createdAt: new Date(machine.createdAt).toLocaleString(),
      numModels: machine.referenceModels?.length || 0,
      models:
        machine.referenceModels?.map((m) => ({
          label: m.label,
          trainingDate: new Date(m.trainingDate).toLocaleString(),
          weightMagnitude:
            (isGMIAModel(m) ? m.metadata.weightMagnitude?.toFixed(6) : undefined) || 'N/A',
        })) || [],
    });

    // Stop any active IdentifyPhase resources (e.g., temporary microphone streams)
    this.identifyPhase.cleanup();

    this.currentMachine = machine;

    // Update UI to show selected machine
    this.updateMachineDisplay(machine);

    // Update card states to show machine info
    this.diagnoseCardController.setMachine(machine);
    this.referenceCardController.setMachine(machine);

    // Unlock Phase 2 and 3
    this.unlockPhases();

    // Collapse the machine selection container after successful selection
    this.collapseSection('select-machine-content');

    // Initialize Phase 2 and 3 with the selected machine.
    // Fire-and-forget: phase modules are prefetched; downstream auto-start paths
    // already poll/delay for the diagnose button, so they tolerate async init.
    void this.initializePhases(machine);

    // Quick Compare: auto-expand reference section and scroll to it so the
    // user lands directly on the recording UI instead of seeing the main page
    // with all sections collapsed.
    if (this.quickCompareController.isActive) {
      this.expandSection('record-reference-content');
      requestAnimationFrame(() => {
        const refSection = document.getElementById('record-reference-content');
        refSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    // UX (geführter Fluss): Nach der Maschinen-Auswahl ist der nächste
    // Schritt immer sichtbar — ohne Referenz öffnet sich die Aufnahme-
    // Sektion („Normalzustand aufnehmen"), mit Referenz die Prüf-Sektion.
    // Vorher klappte alles zu und der rote Faden riss genau an der Stelle,
    // an der Neulinge ihn am dringendsten brauchen.
    const nextSection =
      (machine.referenceModels?.length ?? 0) > 0
        ? 'run-diagnosis-content'
        : 'record-reference-content';
    this.expandSection(nextSection);
    requestAnimationFrame(() => {
      document.getElementById(nextSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /**
   * Handle scan request from diagnose card
   * Opens the scanner modal via IdentifyPhase
   */
  private handleDiagnoseScanRequest(): void {
    logger.info('📷 Scan requested from diagnose card');
    // Trigger the scan button click in the identify phase
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.click();
    }
  }

  /**
   * Handle select existing machine request from diagnose card
   * Checks if machines exist, then expands the machine selection section
   */
  private async handleDiagnoseSelectRequest(): Promise<void> {
    logger.info('📋 Select machine requested from diagnose card');

    try {
      const machines = await getAllMachines();

      if (machines.length === 0) {
        // No machines exist - show hint and redirect to create
        notify.info(t('diagnose.noMachinesYet'), {
          title: t('diagnose.noMachinesHint'),
          duration: 4000,
        });
        // Redirect to create new machine
        this.handleDiagnoseCreateRequest();
        return;
      }

      // Machines exist - show the selection
      this.expandSection('select-machine-content');
      // Scroll to machine overview section
      const machineOverview = document.getElementById('machine-overview');
      if (machineOverview) {
        machineOverview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      logger.error('Error checking machines:', error);
      // Fallback: just expand the section
      this.expandSection('select-machine-content');
    }
  }

  /**
   * Handle create machine request from diagnose card
   * Expands the machine selection section and focuses on name input
   */
  private handleDiagnoseCreateRequest(): void {
    logger.info('➕ Create machine requested from diagnose card');
    this.navigateToNewMachineInput();
  }

  /**
   * Handle scan request from reference card
   * Opens the scanner modal via IdentifyPhase
   */
  private handleReferenceScanRequest(): void {
    logger.info('📷 Scan requested from reference card');
    // Trigger the scan button click in the identify phase
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.click();
    }
  }

  /**
   * Handle select existing machine request from reference card
   * Checks if machines exist, then expands the machine selection section
   */
  private async handleReferenceSelectRequest(): Promise<void> {
    logger.info('📋 Select machine requested from reference card');

    try {
      const machines = await getAllMachines();

      if (machines.length === 0) {
        // No machines exist - show hint and redirect to create
        notify.info(t('reference.noMachinesYet'), {
          title: t('reference.noMachinesHint'),
          duration: 4000,
        });
        // Redirect to create new machine
        this.handleReferenceCreateRequest();
        return;
      }

      // Machines exist - show the selection
      this.expandSection('select-machine-content');
      // Scroll to machine overview section
      const machineOverview = document.getElementById('machine-overview');
      if (machineOverview) {
        machineOverview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      logger.error('Error checking machines:', error);
      // Fallback: just expand the section
      this.expandSection('select-machine-content');
    }
  }

  /**
   * Handle create machine request from reference card
   * Expands the machine selection section and focuses on name input
   */
  private handleReferenceCreateRequest(): void {
    logger.info('➕ Create machine requested from reference card');
    this.navigateToNewMachineInput();
  }

  /**
   * Expand a collapsible section by content ID
   */
  private expandSection(sectionId: string): void {
    const content = document.getElementById(sectionId);
    if (!content) {
      return;
    }

    const computedDisplay = window.getComputedStyle(content).display;
    if (computedDisplay === 'none') {
      // CRITICAL FIX: If originalDisplay was recorded as 'none' (e.g., collapseSection was
      // called on an already-hidden section), fall back to 'block' to actually show the section.
      const originalDisplay = content.dataset.originalDisplay;
      content.style.display =
        originalDisplay && originalDisplay !== 'none' ? originalDisplay : 'block';
    }

    const header = document.querySelector(`.section-header[data-target="${sectionId}"]`);
    const icon = header?.querySelector('.collapse-icon');
    if (icon) {
      icon.classList.add('rotated');
    }
  }

  /**
   * Navigate to new machine input field
   * Expands the section, scrolls smoothly, focuses input, and adds visual feedback
   */
  private navigateToNewMachineInput(): void {
    // Step 1: Expand the machine selection section
    this.expandSection('select-machine-content');

    // Step 2: Wait for DOM update, then scroll and focus
    requestAnimationFrame(() => {
      const nameInput = document.getElementById('machine-name-input') as HTMLInputElement;
      if (!nameInput) {
        logger.warn('machine-name-input element not found');
        return;
      }

      // Step 3: Scroll the input into view with smooth animation
      nameInput.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // Step 4: After scroll completes (~300ms), focus and add highlight animation
      setTimeout(() => {
        // Focus the input to open keyboard on mobile
        nameInput.focus();

        // Add highlight animation class
        nameInput.classList.add('input-highlight');

        // Remove the animation class after it completes
        setTimeout(() => {
          nameInput.classList.remove('input-highlight');
        }, 1500);
      }, 350);
    });
  }

  // ============================================================================
  // AUTO-DETECTION FLOW (Simplified "Zustand prüfen")
  // ============================================================================

  /**
   * Handle auto-detect request from diagnose card
   * Starts the simplified flow where no machine pre-selection is needed
   */
  private async handleAutoDetectRequest(): Promise<void> {
    logger.info('🔍 Auto-detection requested');

    // Get selected microphone device ID from Phase 1
    const selectedDeviceId = this.identifyPhase.getSelectedDeviceId();

    // Cleanup any existing auto-detection phase
    if (this.autoDetectionPhase) {
      this.autoDetectionPhase.destroy();
      this.autoDetectionPhase = null;
    }

    // Create new auto-detection phase with callbacks (module lazy-loaded on demand)
    const { AutoDetectionPhase } = await loadAutoDetectionPhaseModule();
    this.autoDetectionPhase = new AutoDetectionPhase(
      {
        onMachineRecognized: (machine, result) => this.handleMachineRecognized(machine, result),
        onUncertainMatch: (candidates, result) => this.handleUncertainMatch(candidates, result),
        onNoMatch: (result) => this.handleNoMatch(result),
        onCancel: () => this.handleAutoDetectCancel(),
      },
      selectedDeviceId
    );

    // Start detection
    this.autoDetectionPhase.start();
  }

  /**
   * Fall A: Machine recognized with high confidence (≥80%)
   * Auto-select the machine and show diagnosis result
   */
  private handleMachineRecognized(machine: Machine, result: AutoDetectionResult): void {
    logger.info(`✅ Machine auto-recognized: ${machine.name}`);

    // Show recognition result modal
    this.showMachineRecognizedModal(machine, result);
  }

  /**
   * Fall B: Uncertain match (40-79%)
   * Show candidates for user selection
   */
  private handleUncertainMatch(
    candidates: MachineMatchResult[],
    result: AutoDetectionResult
  ): void {
    logger.info(`⚠️ Uncertain match with ${candidates.length} candidates`);

    // Show selection modal
    this.showCandidateSelectionModal(candidates, result);
  }

  /**
   * Fall C: No match found (<40%)
   * Welle 3: Enhanced with unified flow - smart-routes based on machine state.
   */
  private async handleNoMatch(result: AutoDetectionResult): Promise<void> {
    logger.info('No matching machine found – unified flow');

    const machines = await getAllMachines();

    // Check if any machine exists without reference models
    const machinesWithoutRef = machines.filter(
      (m) => !m.referenceModels || m.referenceModels.length === 0
    );

    if (machines.length === 0) {
      // Case A: No machines at all → offer to create + record reference
      this.showUnifiedFlowModal('no_machines', null, result);
    } else if (machinesWithoutRef.length > 0) {
      // Case B: Some machines exist without reference → offer to record for them
      this.showUnifiedFlowModal('missing_reference', machinesWithoutRef, result);
    } else {
      // Case C: All machines have references, just no match → existing behavior
      this.showNoMatchModal(result);
    }
  }

  /**
   * Auto-detection cancelled by user
   */
  private handleAutoDetectCancel(): void {
    logger.info('🚫 Auto-detection cancelled');

    // Cleanup
    if (this.autoDetectionPhase) {
      this.autoDetectionPhase.destroy();
      this.autoDetectionPhase = null;
    }
  }

  /**
   * Show modal for Fall A: Machine recognized with high confidence
   */
  private showMachineRecognizedModal(machine: Machine, result: AutoDetectionResult): void {
    const modal = document.getElementById('machine-recognized-modal');
    if (!modal) return;

    // Update machine info
    const nameEl = document.getElementById('recognized-machine-name');
    if (nameEl) nameEl.textContent = machine.name;

    const similarityEl = document.getElementById('recognized-similarity');
    if (similarityEl && result.bestMatch) {
      similarityEl.textContent = `${result.bestMatch.similarity.toFixed(0)}%`;
    }

    // Update status based on the match
    const statusEl = document.getElementById('recognized-status');
    if (statusEl && result.bestMatch) {
      const status = result.bestMatch.status;
      statusEl.textContent =
        status === 'healthy'
          ? t('status.healthy')
          : status === 'faulty'
            ? t('status.faulty')
            : t('status.uncertain');
      statusEl.className = `recognized-status status-${status}`;
    }

    // Setup continue button - proceed to full diagnosis
    const continueBtn = document.getElementById('recognized-continue-btn');
    if (continueBtn) {
      continueBtn.onclick = () => {
        modal.style.display = 'none';
        this.onMachineSelected(machine);
        // Auto-start diagnosis with the recognized machine
        setTimeout(() => {
          const diagnoseBtn = document.getElementById('diagnose-btn');
          if (diagnoseBtn) diagnoseBtn.click();
        }, 100);
      };
    }

    // Setup "different machine" button
    const differentBtn = document.getElementById('recognized-different-btn');
    if (differentBtn) {
      differentBtn.onclick = () => {
        modal.style.display = 'none';
        this.expandSection('select-machine-content');
      };
    }

    modal.style.display = 'flex';
  }

  /**
   * Show modal for Fall B: Uncertain match with candidate selection
   */
  private showCandidateSelectionModal(
    candidates: MachineMatchResult[],
    _result: AutoDetectionResult
  ): void {
    const modal = document.getElementById('candidate-selection-modal');
    if (!modal) return;

    // Build candidate list
    const listEl = document.getElementById('candidate-list');
    if (listEl) {
      listEl.innerHTML = '';

      const ALLOWED_STATUSES = ['healthy', 'faulty', 'uncertain'] as const;

      candidates.forEach((candidate) => {
        const safeStatus = (ALLOWED_STATUSES as readonly string[]).includes(candidate.status)
          ? candidate.status
          : 'uncertain';

        const item = document.createElement('button');
        item.className = 'candidate-item';
        item.innerHTML = `
          <div class="candidate-info">
            <span class="candidate-name">${escapeHtml(candidate.machine.name)}</span>
            <span class="candidate-similarity">${candidate.similarity.toFixed(0)}%</span>
          </div>
          <div class="candidate-status status-${safeStatus}">
            ${safeStatus === 'healthy' ? t('status.healthy') : safeStatus === 'faulty' ? t('status.faulty') : t('status.uncertain')}
          </div>
        `;
        item.onclick = () => {
          modal.style.display = 'none';
          this.onMachineSelected(candidate.machine);
          // Auto-start diagnosis
          setTimeout(() => {
            const diagnoseBtn = document.getElementById('diagnose-btn');
            if (diagnoseBtn) diagnoseBtn.click();
          }, 100);
        };
        listEl.appendChild(item);
      });

      // Add "New machine" option
      const newMachineItem = document.createElement('button');
      newMachineItem.className = 'candidate-item candidate-new';
      newMachineItem.innerHTML = `
        <div class="candidate-info">
          <span class="candidate-name">${t('autoDetect.newMachine')}</span>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      `;
      newMachineItem.onclick = () => {
        modal.style.display = 'none';
        this.handleDiagnoseCreateRequest();
      };
      listEl.appendChild(newMachineItem);
    }

    // Setup cancel button
    const cancelBtn = document.getElementById('candidate-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }

    modal.style.display = 'flex';
  }

  /**
   * Show modal for Fall C: No match found
   */
  private showNoMatchModal(_result: AutoDetectionResult): void {
    const modal = document.getElementById('no-match-modal');
    if (!modal) return;

    // Setup "Record reference" button
    const recordRefBtn = document.getElementById('no-match-record-btn');
    if (recordRefBtn) {
      recordRefBtn.onclick = () => {
        modal.style.display = 'none';
        // Open reference section and create flow
        this.handleReferenceCreateRequest();
      };
    }

    // Setup "New machine" button
    const newMachineBtn = document.getElementById('no-match-new-machine-btn');
    if (newMachineBtn) {
      newMachineBtn.onclick = () => {
        modal.style.display = 'none';
        this.handleDiagnoseCreateRequest();
      };
    }

    // Setup cancel button
    const cancelBtn = document.getElementById('no-match-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }

    modal.style.display = 'flex';
  }

  /**
   * Welle 3: Show unified flow modal for no-match scenarios.
   * Guides the user to create a machine and/or record a reference
   * without ever using the word "Referenz".
   */
  private showUnifiedFlowModal(
    scenario: 'no_machines' | 'missing_reference',
    machinesWithoutRef: Machine[] | null,
    _result: AutoDetectionResult
  ): void {
    const overlay = document.createElement('div');
    overlay.className = 'fleet-result-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-result-modal unified-flow-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'fleet-result-header';

    const titleContainer = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent =
      scenario === 'no_machines'
        ? t('unifiedFlow.newMachineTitle')
        : t('unifiedFlow.missingRefTitle');
    titleContainer.appendChild(title);
    header.appendChild(titleContainer);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fleet-result-close';
    closeBtn.innerHTML = '\u2715';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // --- Body ---
    const body = document.createElement('div');
    body.className = 'fleet-result-body';

    if (scenario === 'no_machines') {
      // Explanation
      const explanation = document.createElement('p');
      explanation.className = 'unified-flow-explanation';
      explanation.textContent = t('unifiedFlow.noMachinesExplanation');
      body.appendChild(explanation);

      // Name input
      const inputGroup = document.createElement('div');
      inputGroup.className = 'unified-flow-input-group';

      const label = document.createElement('label');
      label.textContent = t('unifiedFlow.machineNameLabel');
      label.className = 'unified-flow-label';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'machine-input unified-flow-input';
      input.placeholder = t('unifiedFlow.machineNamePlaceholder');
      input.setAttribute('autocomplete', 'off');

      inputGroup.appendChild(label);
      inputGroup.appendChild(input);
      body.appendChild(inputGroup);

      // CTA button
      const ctaBtn = document.createElement('button');
      ctaBtn.className = 'result-action-btn result-action-primary unified-flow-cta';
      ctaBtn.textContent = t('unifiedFlow.createAndRecord');
      ctaBtn.disabled = true;

      input.addEventListener('input', () => {
        ctaBtn.disabled = input.value.trim().length === 0;
      });

      ctaBtn.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return;

        overlay.remove();

        // Create machine via IdentifyPhase
        const machine = await this.identifyPhase.createMachineQuick(name);
        if (machine) {
          // Select machine and start reference recording flow
          this.onMachineSelected(machine);
          // Auto-expand reference section and trigger recording
          setTimeout(() => {
            this.expandSection('record-reference-content');
            const refSection = document.getElementById('record-reference-content');
            refSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            notify.info(t('unifiedFlow.recordingStarted', { name }));
          }, 300);
        }
      });

      body.appendChild(ctaBtn);
    } else if (scenario === 'missing_reference' && machinesWithoutRef) {
      // Explanation
      const explanation = document.createElement('p');
      explanation.className = 'unified-flow-explanation';
      explanation.textContent = t('unifiedFlow.missingRefExplanation');
      body.appendChild(explanation);

      // Machine selection (if multiple)
      for (const machine of machinesWithoutRef.slice(0, 5)) {
        const machineBtn = document.createElement('button');
        machineBtn.className = 'unified-flow-machine-btn';
        machineBtn.innerHTML = `<strong>${escapeHtml(machine.name)}</strong><span>${escapeHtml(t('unifiedFlow.recordNormalState'))}</span>`;

        machineBtn.addEventListener('click', () => {
          overlay.remove();
          this.onMachineSelected(machine);
          // Auto-expand reference section
          setTimeout(() => {
            this.expandSection('record-reference-content');
            const refSection = document.getElementById('record-reference-content');
            refSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            notify.info(t('unifiedFlow.recordingStarted', { name: machine.name }));
          }, 300);
        });

        body.appendChild(machineBtn);
      }
    }

    // Cancel option
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'result-action-btn result-action-secondary unified-flow-cancel';
    cancelBtn.textContent = t('buttons.cancel');
    cancelBtn.addEventListener('click', () => overlay.remove());
    body.appendChild(cancelBtn);

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        overlay.remove();
      }
    };
    document.addEventListener('keydown', escHandler);
    requestAnimationFrame(() => {
      const firstInput = modal.querySelector('input');
      if (firstInput) firstInput.focus();
      else closeBtn.focus();
    });
  }

  /**
   * Initialize Phase 2 (Reference) and Phase 3 (Diagnose)
   */
  private async initializePhases(machine: Machine): Promise<void> {
    // Cleanup all previous instances with error handling
    this.cleanupAllPhases();

    // Get selected microphone device ID from Phase 1
    const selectedDeviceId = this.identifyPhase.getSelectedDeviceId();
    logger.info(`📱 Using microphone device: ${selectedDeviceId || 'default'}`);

    // Initialize GMIA analysis phases
    await this.initializeLevel1Phases(machine, selectedDeviceId);
  }

  /**
   * Initialize GMIA phases
   */
  private async initializeLevel1Phases(machine: Machine, selectedDeviceId?: string): Promise<void> {
    logger.info('📊 Initializing GMIA phases');

    // Create phase instances (modules lazy-loaded, prefetched at construction)
    const { ReferencePhase } = await loadReferencePhaseModule();
    this.referencePhase = new ReferencePhase(machine, selectedDeviceId);
    this.referencePhase.init();

    const { DiagnosePhase } = await loadDiagnosePhaseModule();
    this.diagnosePhase = new DiagnosePhase(machine, selectedDeviceId);
    this.diagnosePhase.init();

    // Welle 2: Refresh dashboard when result modal is dismissed (✕ button)
    this.diagnosePhase.setOnResultModalClosed(() => {
      this.identifyPhase.updateDashboard();
    });

    // UX-Fix: Reset to Grundansicht when explicit "Weiter" button is clicked
    // Guard: in fleet queue mode the queue advances via onDiagnosisComplete – do not reset
    this.diagnosePhase.setOnResultContinue(() => {
      if (!this.isFleetQueueActive) {
        this.resetToGrundansicht();
      }
    });

    // Sprint 5: Register fleet queue callbacks if queue is active
    if (this.isFleetQueueActive) {
      this.diagnosePhase.setOnDiagnosisComplete((diagnosis) => {
        if (diagnosis?.id) {
          this.fleetQueueDiagnosisIds.push(diagnosis.id);
        }
        // Welle 1 UX: Haptic feedback after each fleet diagnosis
        if (diagnosis?.healthScore !== undefined) {
          hapticForScore(diagnosis.healthScore);
        }
        this.fleetQueueIndex++;
        // Short delay to show result, then advance
        setTimeout(() => this.advanceFleetQueue(), 1500);
      });
      // Sprint 5 Fix: Handle diagnosis errors in fleet queue (skip to next machine)
      this.diagnosePhase.setOnDiagnosisError((error) => {
        logger.warn(
          `Fleet queue: diagnosis failed for machine ${this.fleetQueue[this.fleetQueueIndex]}, skipping`,
          error
        );
        this.fleetQueueIndex++;
        setTimeout(() => this.advanceFleetQueue(), 500);
      });

      // UX improvement: Set QC context for inspection modal hints
      if (
        this.quickCompareController.isActive &&
        this.quickCompareController.goldStandardMachineId
      ) {
        const goldId = this.quickCompareController.goldStandardMachineId;
        getMachine(goldId).then((goldMachine) => {
          if (goldMachine && this.diagnosePhase) {
            this.diagnosePhase.setQcContext(goldMachine.name);
          }
        });
      }
    }

    // Register callback to update UI when reference model is saved
    this.referencePhase.setOnMachineUpdated((updatedMachine) => {
      // ZERO-FRICTION: Update current machine state when a new machine is auto-created
      this.currentMachine = updatedMachine;

      // Update card controllers with new machine
      this.diagnoseCardController.setMachine(updatedMachine);
      this.referenceCardController.setMachine(updatedMachine);

      if (this.diagnosePhase) {
        this.diagnosePhase.setMachine(updatedMachine);
      }
      this.updateMachineDisplay(updatedMachine);

      // ZERO-FRICTION: Unlock diagnosis phase after machine is created/updated
      this.unlockPhases();

      // Sprint 7: Quick Compare – handle reference recording complete
      if (
        this.quickCompareController.isActive &&
        updatedMachine.id === this.quickCompareController.goldStandardMachineId
      ) {
        // Reference recording for gold standard machine 01 is complete.
        // Copy reference to remaining machines (async – wait before advancing).
        this.quickCompareController.onReferenceComplete(updatedMachine).then(() => {
          // Advance the fleet queue to the next machine (02)
          this.fleetQueueIndex++;
          setTimeout(() => this.advanceFleetQueue(), 500);
        });
        return; // Don't execute normal post-reference flow
      }

      // Welle 3: Enhanced post-reference feedback + dashboard refresh
      // (Only for normal flows, not Quick Compare)
      this.identifyPhase.updateDashboard();
      notify.info(t('unifiedFlow.referenceSavedHint', { name: updatedMachine.name }), {
        duration: 5000,
      });

      // UX (geführter Fluss): Referenz gespeichert → direkt die Prüf-Sektion
      // öffnen und hinscrollen. Schritt 3 liegt damit ohne Suchen vor dem
      // Nutzer („Jetzt prüfen").
      this.expandSection('run-diagnosis-content');
      requestAnimationFrame(() => {
        document
          .getElementById('run-diagnosis-content')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /**
   * ZERO-FRICTION: Initialize reference phase without machine selection
   * This allows users to start recording immediately without pre-selecting a machine.
   * A new machine will be auto-created when the recording is saved.
   */
  private async initializeZeroFrictionReferencePhase(): Promise<void> {
    logger.info('🎯 Initializing zero-friction reference phase (no machine selected)');

    // Get selected microphone device ID
    const selectedDeviceId = this.identifyPhase.getSelectedDeviceId();

    // Create reference phase without machine (null) – module lazy-loaded (prefetched)
    const { ReferencePhase } = await loadReferencePhaseModule();
    this.referencePhase = new ReferencePhase(null, selectedDeviceId);
    this.referencePhase.init();

    // Register callback to handle machine creation during zero-friction flow
    this.referencePhase.setOnMachineUpdated(async (newMachine) => {
      logger.info(`🤖 Zero-friction: Machine created - ${newMachine.name}`);

      // Update router state with new machine
      this.currentMachine = newMachine;

      // Update card controllers
      this.diagnoseCardController.setMachine(newMachine);
      this.referenceCardController.setMachine(newMachine);

      // Update UI display
      this.updateMachineDisplay(newMachine);

      // Initialize diagnose phase with new machine (module lazy-loaded, prefetched)
      const { DiagnosePhase } = await loadDiagnosePhaseModule();
      this.diagnosePhase = new DiagnosePhase(newMachine, selectedDeviceId);
      this.diagnosePhase.init();

      // Unlock all phases now that we have a machine
      this.unlockPhases();

      // Collapse machine selection section
      this.collapseSection('select-machine-content');

      // Welle 3: Enhanced post-reference feedback + dashboard refresh
      this.identifyPhase.updateDashboard();
      notify.info(t('unifiedFlow.referenceSavedHint', { name: newMachine.name }), {
        duration: 5000,
      });
    });

    // Ensure reference button is always enabled for zero-friction
    this.ensureReferenceButtonEnabled();
  }

  /**
   * ZERO-FRICTION: Ensure reference record button is always enabled
   */
  private ensureReferenceButtonEnabled(): void {
    const recordBtn = document.getElementById('record-reference-btn');
    if (recordBtn instanceof HTMLButtonElement) {
      recordBtn.disabled = false;
      recordBtn.style.opacity = '1';
      recordBtn.style.cursor = 'pointer';
      recordBtn.style.pointerEvents = 'auto';
      logger.debug('[Router] Reference record button explicitly enabled for zero-friction');
    }
  }

  /**
   * Cleanup all phase instances
   */
  private cleanupAllPhases(): void {
    // Cleanup phases
    if (this.referencePhase) {
      try {
        this.referencePhase.destroy();
      } catch (error) {
        logger.warn('⚠️ Error destroying reference phase:', error);
      }
      this.referencePhase = null;
    }
    if (this.diagnosePhase) {
      try {
        this.diagnosePhase.destroy();
      } catch (error) {
        logger.warn('⚠️ Error destroying diagnose phase:', error);
      }
      this.diagnosePhase = null;
    }
  }

  /**
   * Lock Phase 2 and 3 (disable buttons)
   */
  private lockPhases(): void {
    this.setPhaseState('record-reference-content', false);
    this.setPhaseState('run-diagnosis-content', false);
    // Safety: re-enable tile buttons that must always stay clickable
    this.ensureTileButtonsEnabled();
    document.body.classList.add('zb-no-machine');
  }

  /**
   * Unlock Phase 2 and 3 (enable buttons)
   */
  private unlockPhases(): void {
    this.setPhaseState('record-reference-content', true);
    this.setPhaseState('run-diagnosis-content', true);
    // Safety: re-enable tile buttons that must always stay clickable
    this.ensureTileButtonsEnabled();
    document.body.classList.remove('zb-no-machine');
  }

  /**
   * Enable/disable a phase section
   */
  private setPhaseState(sectionId: string, enabled: boolean): void {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const buttons = section.querySelectorAll('button');
    buttons.forEach((btn) => {
      // Skip diagnose tile buttons - they should always be clickable
      // to allow machine selection even when phase is "locked"
      if (btn.classList.contains('diagnose-tile')) {
        return;
      }
      // Skip auto-detect button - it should always be clickable since
      // auto-detection works without requiring machine pre-selection
      if (btn.classList.contains('auto-detect-btn')) {
        return;
      }
      // Skip manual selection toggle - always needs to be clickable
      if (btn.classList.contains('manual-selection-toggle')) {
        return;
      }
      // Sprint 9: Fleet quick check (and inline help) must remain usable without machine pre-selection
      if (btn.id === 'fleet-quickcheck-btn' || btn.id === 'help-fleet-quickcheck') {
        return;
      }
      // ZERO-FRICTION: Skip reference record button - always enabled for zero-friction recording
      if (btn.id === 'record-reference-btn') {
        return;
      }
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.5';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    });
  }

  /**
   * Explicitly ensure auto-detect buttons are always enabled
   * Called after lockPhases() to guarantee these buttons remain clickable
   */
  private ensureAutoDetectButtonsEnabled(): void {
    // Auto-detect button
    const autoDetectBtn = document.getElementById('diagnose-auto-detect-btn');
    if (autoDetectBtn instanceof HTMLButtonElement) {
      autoDetectBtn.disabled = false;
      autoDetectBtn.style.opacity = '1';
      autoDetectBtn.style.cursor = 'pointer';
      autoDetectBtn.style.pointerEvents = 'auto';
      logger.debug('[Router] Auto-detect button explicitly enabled');
    }

    // Manual selection toggle
    const manualToggleBtn = document.getElementById('diagnose-show-manual-btn');
    if (manualToggleBtn instanceof HTMLButtonElement) {
      manualToggleBtn.disabled = false;
      manualToggleBtn.style.opacity = '1';
      manualToggleBtn.style.cursor = 'pointer';
      manualToggleBtn.style.pointerEvents = 'auto';
      logger.debug('[Router] Manual selection toggle explicitly enabled');
    }
  }

  /**
   * Explicitly ensure all diagnose-tile buttons are always enabled
   * Called after lockPhases() to guarantee tile buttons remain clickable
   */
  private ensureTileButtonsEnabled(): void {
    const tileIds = [
      'reference-scan-btn',
      'reference-select-btn',
      'reference-create-btn',
      'diagnose-scan-btn',
      'diagnose-select-btn',
      'diagnose-create-btn',
      'fleet-quickcheck-btn',
      'help-fleet-quickcheck',
    ];

    for (const id of tileIds) {
      const btn = document.getElementById(id);
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
      }
    }
    logger.debug('[Router] Tile buttons explicitly enabled');
  }

  /**
   * Update UI to display selected machine info
   */
  private updateMachineDisplay(machine: Machine): void {
    // Update user name in header
    const userName = document.getElementById('user-name');
    if (userName) {
      userName.textContent = machine.name;
    }

    // Show reference status (MULTICLASS)
    const recordSection = document.getElementById('record-reference-content');
    if (recordSection) {
      const description = recordSection.querySelector('.sub-description');
      if (description) {
        if (machine.referenceModels && machine.referenceModels.length > 0) {
          const count = machine.referenceModels.length;
          // CRITICAL FIX: Sort by trainingDate with defensive fallback for missing dates
          // This prevents crashes if any model has undefined/null trainingDate
          const sortedModels = [...machine.referenceModels].sort(
            (a, b) => (b.trainingDate || 0) - (a.trainingDate || 0)
          );
          // CRITICAL FIX: Use toLocaleString() instead of toLocaleDateString() to include time
          const latestTimestamp = sortedModels[0]?.trainingDate;
          const latestDate = latestTimestamp
            ? new Date(latestTimestamp).toLocaleString(getLocale(), {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : t('common.unknown');
          description.textContent = t('router.statesTrained', {
            count: String(count),
            plural: count > 1 ? 'e' : '',
            date: latestDate,
          });
        } else {
          const duration = getRecordingSettings().recordingDuration;
          description.textContent = t('router.referenceRequired', { duration });
        }
      }
    }

    // Show/hide diagnosis availability
    const diagnoseSection = document.getElementById('run-diagnosis-content');
    if (diagnoseSection) {
      const description = diagnoseSection.querySelector('.sub-description');
      if (description) {
        if (machine.referenceModels && machine.referenceModels.length > 0) {
          description.textContent = t('router.liveAnalysis');
        } else {
          const duration = getRecordingSettings().recordingDuration;
          description.textContent = t('router.referenceRequired', { duration });
        }
      }
    }
  }

  /**
   * Update all duration-dependent UI texts to reflect current recording settings
   *
   * Called on:
   * - Router init (to set correct initial values)
   * - Recording settings change (RECORDING_SETTINGS_EVENT)
   * - Language change (LANGUAGE_CHANGE_EVENT)
   */
  private updateRecordingDurationTexts(): void {
    const { recordingDuration } = getRecordingSettings();
    const warmUpDuration = 5; // Fixed warmup duration
    const totalDuration = warmUpDuration + recordingDuration;

    // Update reference card sub-description (initial state before machine selection)
    const referenceDurationText = document.getElementById('reference-duration-text');
    if (referenceDurationText) {
      // Only update if the router hasn't overwritten it with machine-specific info
      // Check if a machine with models is selected - if so, don't overwrite the statesTrained text
      const hasModels =
        this.currentMachine?.referenceModels && this.currentMachine.referenceModels.length > 0;
      if (!hasModels) {
        referenceDurationText.textContent = t('reference.tenSecondRecording', {
          duration: recordingDuration,
        });
      }
    }

    // Update review modal recording info text
    const reviewRecordingInfo = document.getElementById('review-recording-info');
    if (reviewRecordingInfo) {
      reviewRecordingInfo.textContent = t('review.recordingInfo', {
        total: totalDuration,
        duration: recordingDuration,
      });
    }
  }

  /**
   * Collapse a collapsible section by content ID
   */
  private collapseSection(sectionId: string): void {
    const content = document.getElementById(sectionId);
    if (!content) {
      return;
    }

    // CRITICAL FIX: Only record originalDisplay if the section is currently visible.
    // Recording 'none' would break expandSection() later, preventing the section from reopening.
    if (!content.dataset.originalDisplay) {
      const computedStyle = window.getComputedStyle(content);
      if (computedStyle.display !== 'none') {
        content.dataset.originalDisplay = computedStyle.display;
      }
    }

    const computedDisplay = window.getComputedStyle(content).display;
    if (computedDisplay !== 'none') {
      content.style.display = 'none';
    }

    const header = document.querySelector(`.section-header[data-target="${sectionId}"]`);
    const icon = header?.querySelector('.collapse-icon');
    if (icon) {
      icon.classList.remove('rotated');
    }
  }

  // ============================================================================
  // SPRINT 6: FLEET PROVISIONING HANDLER
  // ============================================================================

  /**
   * Sprint 6: Handle fleet provisioning completion.
   * Switches to fleet mode and shows the fleet ranking.
   */
  private async handleFleetProvisioned(
    fleetName: string,
    autoStartCheck: boolean = false
  ): Promise<void> {
    logger.info(
      `🚢 Fleet provisioned: "${fleetName}" – switching to fleet mode (autoStart=${autoStartCheck})`
    );

    // Refresh machine data
    await this.identifyPhase.refreshMachineLists();

    // Expand the machine section
    this.expandSection('select-machine-content');

    // Switch to fleet mode and show the fleet
    await this.identifyPhase.activateFleetMode(fleetName);

    // Auto-start guided fleet check via onboarding splash (only from NFC/deep link)
    if (autoStartCheck) {
      const allMachines = await getAllMachines();
      const fleetMachines = allMachines.filter((m) => m.fleetGroup === fleetName);

      if (fleetMachines.length === 0) {
        notify.info(t('fleet.onboarding.noMachines'));
        return;
      }

      this.showFleetOnboardingSplash(
        fleetName,
        fleetMachines.map((m) => m.id),
        fleetMachines.length
      );
    }
  }

  /**
   * Show onboarding splash overlay after NFC fleet provisioning.
   * Explains the fleet check concept and starts the guided queue on button tap.
   */
  private showFleetOnboardingSplash(
    fleetName: string,
    machineIds: string[],
    machineCount: number
  ): void {
    // Remove any existing splash
    const existing = document.getElementById('fleet-onboarding-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fleet-onboarding-overlay';
    overlay.className = 'fleet-onboarding-overlay';

    const titleKey =
      machineCount === 1 ? 'fleet.onboarding.titleSingular' : 'fleet.onboarding.title';
    const titleText = escapeHtml(t(titleKey, { count: String(machineCount) }));

    overlay.innerHTML = `
      <div class="fleet-onboarding-card">
        <div class="fleet-onboarding-icon">\uD83D\uDD0A</div>
        <div class="fleet-onboarding-title">${titleText}</div>
        <div class="fleet-onboarding-concept">${escapeHtml(t('fleet.onboarding.concept'))}</div>
        <div class="fleet-onboarding-method">${escapeHtml(t('fleet.onboarding.method'))}</div>
        <div class="fleet-onboarding-howto">${escapeHtml(t('fleet.onboarding.howTo'))}</div>
        <ol class="fleet-onboarding-steps">
          <li data-step="1.">${escapeHtml(t('fleet.onboarding.step1'))}</li>
          <li data-step="2.">${escapeHtml(t('fleet.onboarding.step2'))}</li>
          <li data-step="3.">${escapeHtml(t('fleet.onboarding.step3'))}</li>
          <li data-step="4.">${escapeHtml(t('fleet.onboarding.step4'))}</li>
        </ol>
        <button class="fleet-onboarding-start-btn" id="fleet-onboarding-start-btn">
          \u25B6 ${escapeHtml(t('fleet.onboarding.startButton'))}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Start guided fleet check on button tap
    const startBtn = document.getElementById('fleet-onboarding-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        overlay.remove();
        this.startFleetQueue(machineIds, fleetName);
      });
    }
  }

  // ============================================================================
  // SPRINT 8: QUICK COMPARE VIA NFC (Schnellvergleich per Deep Link)
  // ============================================================================

  /**
   * Handle quick compare count-only deep link.
   * Shows the onboarding splash and starts the QC flow with the given count.
   */
  private handleQuickCompareCountDeepLink(count: number): void {
    logger.info(`⚡ Quick Compare deep link: ${count} machines`);

    // Edge case: need at least 2 machines
    if (count < 2) {
      notify.error(t('quickCompare.nfcOnboarding.minMachines'));
      return;
    }

    // Show onboarding splash
    this.showQuickCompareOnboardingSplash(count);
  }

  /**
   * Show onboarding splash for NFC/QR-triggered quick compare.
   * Explains the concept and starts the flow on button tap.
   */
  private showQuickCompareOnboardingSplash(count: number): void {
    const existing = document.getElementById('qc-onboarding-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qc-onboarding-overlay';
    overlay.className = 'fleet-onboarding-overlay';

    const titleKey =
      count === 1 ? 'quickCompare.nfcOnboarding.titleSingular' : 'quickCompare.nfcOnboarding.title';
    const titleText = escapeHtml(t(titleKey, { count: String(count) }));

    // Calculate time estimate: ~15s per machine, rounded to nearest 0.5 min
    const totalSeconds = count * 15;
    const minutes = (Math.ceil(totalSeconds / 30) * 0.5).toFixed(1).replace('.0', '');
    const timeEstimate = escapeHtml(
      t('quickCompare.nfcOnboarding.timeEstimate', { minutes, count: String(count) })
    );
    const privacyHint = escapeHtml(t('quickCompare.nfcOnboarding.privacyHint'));

    overlay.innerHTML = `
      <div class="fleet-onboarding-card">
        <div class="fleet-onboarding-icon">\uD83D\uDD0A</div>
        <div class="fleet-onboarding-title">${titleText}</div>
        <div class="fleet-onboarding-concept">${escapeHtml(t('quickCompare.nfcOnboarding.concept'))}</div>
        <div class="fleet-onboarding-method">${escapeHtml(t('quickCompare.nfcOnboarding.method'))}</div>
        <div class="qc-onboarding-meta">
          <div class="qc-onboarding-time-estimate">${timeEstimate}</div>
          <div class="qc-onboarding-privacy-hint">${privacyHint}</div>
        </div>
        <button class="fleet-onboarding-start-btn" id="qc-onboarding-start-btn">
          \u25B6 ${escapeHtml(t('quickCompare.nfcOnboarding.startButton'))}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const startBtn = document.getElementById('qc-onboarding-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        overlay.remove();
        // Start the Quick Compare controller with count (creates machines + starts loop)
        this.quickCompareController.startWithCount(count);
      });
    }
  }

  // ============================================================================
  // SPRINT 9: FLEET QUICK CHECK FROM PHASE 3
  // ============================================================================

  /**
   * Sprint 9: Handle fleet quick check button tap in Phase 3.
   * Context-aware: starts Quick Compare, direct fleet check, or shows fleet selection.
   */
  private async handleFleetQuickCheck(): Promise<void> {
    try {
      const allMachines = await getAllMachines();
      const fleetGroups = new Map<string, Machine[]>();

      for (const m of allMachines) {
        if (m.fleetGroup) {
          const group = fleetGroups.get(m.fleetGroup) || [];
          group.push(m);
          fleetGroups.set(m.fleetGroup, group);
        }
      }

      if (fleetGroups.size === 0) {
        // No fleets → start Quick Compare directly
        this.quickCompareController.start();
        return;
      }

      if (fleetGroups.size === 1) {
        const [fleetName, machines] = [...fleetGroups.entries()][0];
        if (machines.length >= 2) {
          // Exactly 1 fleet with ≥2 machines → start guided fleet check directly
          this.startGuidedFleetCheckFromPhase3(fleetName, machines);
          return;
        }
        // Only 1 machine in the fleet → show hint + offer Quick Compare
        notify.info(t('fleetSelect.singleMachineHint', { name: fleetName }));
        this.quickCompareController.start();
        return;
      }

      // Multiple fleets → show selection sheet
      await this.showFleetSelectionSheet(fleetGroups);
    } catch (error) {
      logger.error('[Router] Fleet quick check could not be started', error);
      notify.error(t('alerts.genericError'));
    }
  }

  /**
   * Sprint 9: Show fleet selection bottom sheet.
   */
  private async showFleetSelectionSheet(fleetGroups: Map<string, Machine[]>): Promise<void> {
    // Remove existing sheet
    document.getElementById('fleet-select-overlay')?.remove();

    // Build fleet info with last-checked timestamps
    const fleetInfos: Array<{ name: string; machines: Machine[]; lastChecked: number | null }> = [];
    for (const [name, machines] of fleetGroups) {
      let latestTimestamp: number | null = null;
      for (const m of machines) {
        const diag = await getLatestDiagnosis(m.id);
        if (diag && (latestTimestamp === null || diag.timestamp > latestTimestamp)) {
          latestTimestamp = diag.timestamp;
        }
      }
      fleetInfos.push({ name, machines, lastChecked: latestTimestamp });
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'fleet-select-overlay';
    overlay.className = 'bottomsheet-overlay';

    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = 'bottomsheet';

    // escHandler placeholder – assigned below, captured by dismiss via closure
    let escHandler: (e: KeyboardEvent) => void = () => {
      /* assigned below */
    };

    // Helper: animated dismissal (defined early so buttons can use it)
    const dismiss = () => {
      overlay.classList.remove('bottomsheet-overlay-visible');
      sheet.classList.remove('bottomsheet-visible');
      setTimeout(() => {
        overlay.remove();
      }, 350);
      document.removeEventListener('keydown', escHandler);
    };

    // Handle
    const handle = document.createElement('div');
    handle.className = 'bottomsheet-handle';
    sheet.appendChild(handle);

    // Header with close button
    const header = document.createElement('div');
    header.className = 'bottomsheet-header';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottomsheet-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => dismiss());
    header.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.className = 'bottomsheet-title';
    title.textContent = t('fleetSelect.title');
    header.appendChild(title);

    sheet.appendChild(header);

    // Fleet list
    const list = document.createElement('div');
    list.className = 'fleet-select-list';

    for (const info of fleetInfos) {
      const item = document.createElement('button');
      item.className = 'fleet-select-item';

      const icon = document.createElement('span');
      icon.className = 'fleet-select-icon';
      icon.textContent = '\uD83C\uDFED'; // 🏭
      item.appendChild(icon);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'fleet-select-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'fleet-select-name';
      nameEl.textContent = info.name;
      infoDiv.appendChild(nameEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'fleet-select-meta';
      const countText =
        info.machines.length === 1
          ? t('fleetSelect.machineCountSingular')
          : t('fleetSelect.machineCount', { count: String(info.machines.length) });
      const timeText = info.lastChecked
        ? t('fleetSelect.lastChecked', { time: this.formatRelativeTimeForSheet(info.lastChecked) })
        : t('fleetSelect.neverChecked');
      metaEl.textContent = `${countText} \u00B7 ${timeText}`;
      infoDiv.appendChild(metaEl);

      item.appendChild(infoDiv);

      item.addEventListener('click', () => {
        dismiss();
        if (info.machines.length < 2) {
          notify.info(t('fleetSelect.singleMachineHint', { name: info.name }));
          return;
        }
        this.startGuidedFleetCheckFromPhase3(info.name, info.machines);
      });

      list.appendChild(item);
    }

    sheet.appendChild(list);

    // Separator
    const separator = document.createElement('div');
    separator.className = 'fleet-select-separator';
    separator.textContent = t('diagnose.orFleet');
    sheet.appendChild(separator);

    // Quick Compare option
    const qcItem = document.createElement('button');
    qcItem.className = 'fleet-select-item';

    const qcIcon = document.createElement('span');
    qcIcon.className = 'fleet-select-icon';
    qcIcon.textContent = '\u26A1'; // ⚡
    qcItem.appendChild(qcIcon);

    const qcInfo = document.createElement('div');
    qcInfo.className = 'fleet-select-info';

    const qcName = document.createElement('div');
    qcName.className = 'fleet-select-name';
    qcName.textContent = t('fleetSelect.newQuickCompare');
    qcInfo.appendChild(qcName);

    const qcMeta = document.createElement('div');
    qcMeta.className = 'fleet-select-meta';
    qcMeta.textContent = t('fleetSelect.newQuickCompareHint');
    qcInfo.appendChild(qcMeta);

    qcItem.appendChild(qcInfo);

    qcItem.addEventListener('click', () => {
      dismiss();
      this.quickCompareController.start();
    });

    sheet.appendChild(qcItem);

    // Assemble
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    // Trigger CSS transitions (must run after DOM append)
    requestAnimationFrame(() => {
      overlay.classList.add('bottomsheet-overlay-visible');
      sheet.classList.add('bottomsheet-visible');
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // Assign the Escape handler (captured by dismiss via closure)
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Sprint 9: Start a guided fleet check from Phase 3.
   * Navigates to Phase 1, activates fleet mode, then starts the queue.
   */
  private startGuidedFleetCheckFromPhase3(fleetName: string, machines: Machine[]): void {
    const machineIds = machines.map((m) => m.id);

    // Expand the machine section (Phase 1) so DOM is ready
    this.expandSection('select-machine-content');

    // Activate fleet mode and start the queue after a short delay for DOM readiness
    this.identifyPhase.activateFleetMode(fleetName).then(() => {
      // Small delay to ensure DOM is settled before starting the fleet queue
      setTimeout(() => {
        this.startFleetQueue(machineIds, fleetName);
      }, 300);
    });
  }

  /**
   * Sprint 9: Format a timestamp as relative time (e.g., "vor 2h", "vor 1d").
   */
  private formatRelativeTimeForSheet(timestamp: number): string {
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

  // ============================================================================
  // SPRINT 5: FLEET DIAGNOSIS QUEUE
  // ============================================================================

  /**
   * Sprint 5: Start fleet diagnosis queue
   */
  public startFleetQueue(machineIds: string[], groupName: string): void {
    this.fleetQueue = machineIds;
    this.fleetQueueIndex = 0;
    this.fleetQueueGroupName = groupName;
    this.isFleetQueueActive = true;
    this.isFleetQueuePaused = false;
    this.fleetQueueSkipped = 0;
    this.fleetQueueDiagnosisIds = [];

    // Sprint 5 Fix: Watch for app going to background to pause queue
    this.boundVisibilityHandler = () => this.handleVisibilityChange();
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    // Show progress bar
    this.showFleetProgress();

    // Advance to first machine
    this.advanceFleetQueue();
  }

  /**
   * Sprint 5 Fix: Pause/resume fleet queue when app visibility changes.
   * Mobile OS can suspend audio streams when the app is backgrounded,
   * which would cause silent diagnosis failures.
   */
  private handleVisibilityChange(): void {
    if (!this.isFleetQueueActive) return;

    if (document.hidden) {
      // App went to background - pause the queue (don't auto-advance after current diagnosis)
      this.isFleetQueuePaused = true;
      logger.info('Fleet queue paused (app backgrounded)');
    } else if (this.isFleetQueuePaused) {
      // App came back - notify user and resume
      this.isFleetQueuePaused = false;
      logger.info('Fleet queue resumed (app foregrounded)');
      notify.info(t('fleet.queue.resumed'));
    }
  }

  /**
   * Sprint 5: Advance to next machine in fleet queue
   */
  private async advanceFleetQueue(): Promise<void> {
    if (!this.isFleetQueueActive) return;

    if (this.fleetQueueIndex >= this.fleetQueue.length) {
      this.completeFleetQueue();
      return;
    }

    // Sprint 5 Fix: If paused (app backgrounded), wait for foreground
    if (this.isFleetQueuePaused) {
      logger.info('Fleet queue: waiting for app to return to foreground');
      return; // Will be resumed by handleVisibilityChange -> the onDiagnosisComplete callback will re-trigger
    }

    const machineId = this.fleetQueue[this.fleetQueueIndex];
    const machine = await getMachine(machineId);
    if (!machine) {
      // Skip missing machine
      this.fleetQueueIndex++;
      this.advanceFleetQueue();
      return;
    }

    // Update progress
    this.updateFleetProgress(this.fleetQueueIndex + 1, this.fleetQueue.length, machine.name);

    // Sprint 6 Fix: Do NOT call onMachineSelected() here!
    // Phase navigation rebuilds <main> DOM and destroys the guided prompt.
    // Instead, show the guided prompt first – navigation happens on user tap.
    this.showGuidedPrompt(machine, this.fleetQueueIndex + 1, this.fleetQueue.length);
  }

  /**
   * Sprint 5 Fix: Wait for diagnose button to be ready and click it.
   * Retries up to 20 times (100ms intervals = 2s max) to handle slow devices
   * where DiagnosePhase.init() may not have registered the click handler yet.
   */
  private waitForDiagnoseButton(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 20;

      const tryClick = () => {
        attempts++;
        const diagnoseBtn = document.getElementById('diagnose-btn');
        if (diagnoseBtn) {
          diagnoseBtn.click();
          resolve();
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(tryClick, 100);
        } else {
          // Button not found after retries - skip this machine
          logger.warn(
            `Fleet queue: diagnose-btn not found after ${maxAttempts} attempts, skipping`
          );
          this.fleetQueueIndex++;
          setTimeout(() => this.advanceFleetQueue(), 100);
          resolve();
        }
      };

      // Start after one animation frame to let DOM settle
      requestAnimationFrame(() => setTimeout(tryClick, 100));
    });
  }

  /**
   * Bugfix: Wait for reference record button to be ready and click it.
   * Used in fleet queue context to skip the tile navigation and start recording directly.
   * Tries both record-btn (State A) and record-reference-btn (State B / zero-friction).
   */
  private waitForRecordButton(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 20;

      const tryClick = () => {
        attempts++;
        const recordBtn =
          document.getElementById('record-btn') || document.getElementById('record-reference-btn');
        if (recordBtn) {
          recordBtn.click();
          resolve();
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(tryClick, 100);
        } else {
          logger.warn(`Fleet queue: record button not found after ${maxAttempts} attempts`);
          resolve();
        }
      };

      requestAnimationFrame(() => setTimeout(tryClick, 100));
    });
  }

  /**
   * Sprint 6: Show guided fleet check prompt.
   * Large, clear UI telling the user which machine to go to,
   * with a manual start button for the recording.
   */
  private showGuidedPrompt(machine: Machine, current: number, total: number): void {
    // Remove any existing prompt
    document.getElementById('fleet-guided-prompt')?.remove();

    // Detect if this is the gold standard machine in a Quick Compare flow
    const isQcGoldStandard =
      this.quickCompareController.isActive &&
      machine.id === this.quickCompareController.goldStandardMachineId;

    const prompt = document.createElement('div');
    prompt.id = 'fleet-guided-prompt';
    prompt.className = 'fleet-guided-prompt';

    // Machine name (large, prominent)
    const goToLabel = document.createElement('div');
    goToLabel.className = 'fleet-guided-goto';
    goToLabel.textContent = t('fleet.queue.guided.goTo');
    prompt.appendChild(goToLabel);

    const machineName = document.createElement('div');
    machineName.className = 'fleet-guided-machine-name';
    machineName.textContent = machine.name;
    prompt.appendChild(machineName);

    // Quick Compare: Reference hint for gold standard machine
    if (isQcGoldStandard) {
      const refHint = document.createElement('div');
      refHint.className = 'fleet-guided-ref-hint';
      refHint.textContent = t('quickCompare.guidedPrompt.referenceHint');
      prompt.appendChild(refHint);
    }

    // Location hint (if available)
    if (machine.location && !isQcGoldStandard) {
      const locationHint = document.createElement('div');
      locationHint.className = 'fleet-guided-location';
      locationHint.textContent = machine.location;
      prompt.appendChild(locationHint);
    }

    // Instruction text – improved for reference machine
    const instruction = document.createElement('div');
    instruction.className = 'fleet-guided-instruction';
    instruction.textContent = isQcGoldStandard
      ? t('quickCompare.guidedPrompt.positionInstruction')
      : t('fleet.queue.guided.waitingForUser');
    prompt.appendChild(instruction);

    // Quick Compare: Position memory tip + noise hint (only for machine 01)
    if (isQcGoldStandard) {
      const positionTip = document.createElement('div');
      positionTip.className = 'fleet-guided-tip';
      positionTip.textContent = t('quickCompare.guidedPrompt.positionMemory');
      prompt.appendChild(positionTip);

      const noiseHint = document.createElement('div');
      noiseHint.className = 'fleet-guided-noise-hint';
      noiseHint.textContent = t('quickCompare.guidedPrompt.noiseHint');
      prompt.appendChild(noiseHint);
    }

    // Start button (large, prominent, touch-friendly)
    const startBtn = document.createElement('button');
    startBtn.className = 'fleet-guided-start-btn';
    startBtn.textContent = isQcGoldStandard
      ? t('quickCompare.reference.startRecording')
      : t('fleet.queue.guided.startRecording');
    startBtn.addEventListener('click', async () => {
      // Remove prompt
      prompt.remove();

      if (isQcGoldStandard) {
        // Gold standard: select machine for REFERENCE phase (Phase 2)
        this.onMachineSelected(machine);
        // Bugfix: Start recording directly – skip tile navigation
        await new Promise((resolve) => setTimeout(resolve, 300));
        await this.waitForRecordButton();
      } else {
        // Normal comparison: select machine and auto-start diagnosis (Phase 3)
        this.onMachineSelected(machine);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await this.waitForDiagnoseButton();
      }
    });
    prompt.appendChild(startBtn);

    // Bottom row: counter + skip
    const bottomRow = document.createElement('div');
    bottomRow.className = 'fleet-guided-bottom';

    const counter = document.createElement('span');
    counter.className = 'fleet-guided-counter';
    counter.textContent = t('fleet.queue.guided.machineOf', {
      current: String(current),
      total: String(total),
    });
    bottomRow.appendChild(counter);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'fleet-guided-skip-btn';
    skipBtn.textContent = t('fleet.queue.guided.skip');
    skipBtn.addEventListener('click', () => {
      prompt.remove();
      this.fleetQueueSkipped++;
      this.fleetQueueIndex++;
      // Short delay before next prompt
      setTimeout(() => this.advanceFleetQueue(), 300);
    });
    bottomRow.appendChild(skipBtn);

    prompt.appendChild(bottomRow);

    // Append to body (not <main>) so it survives phase navigation DOM rebuilds
    document.body.appendChild(prompt);

    // Focus the start button for keyboard accessibility
    requestAnimationFrame(() => startBtn.focus());
  }

  /**
   * Sprint 5: Show fleet progress bar
   */
  private showFleetProgress(): void {
    // Remove existing
    document.getElementById('fleet-progress')?.remove();

    const bar = document.createElement('div');
    bar.id = 'fleet-progress';
    bar.className = 'fleet-progress';

    const textEl = document.createElement('div');
    textEl.className = 'fleet-progress-text';
    textEl.id = 'fleet-progress-text';

    const barBg = document.createElement('div');
    barBg.className = 'fleet-progress-bar-bg';

    const barFill = document.createElement('div');
    barFill.className = 'fleet-progress-bar-fill';
    barFill.id = 'fleet-progress-fill';
    barBg.appendChild(barFill);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fleet-progress-cancel';
    cancelBtn.id = 'fleet-progress-cancel';
    cancelBtn.setAttribute('aria-label', t('buttons.cancel'));
    cancelBtn.textContent = '\u2715';

    bar.appendChild(textEl);
    bar.appendChild(barBg);
    bar.appendChild(cancelBtn);

    // Insert at top of page
    const main = document.querySelector('main');
    if (main) {
      main.insertBefore(bar, main.firstChild);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }

    cancelBtn.addEventListener('click', () => {
      this.cancelFleetQueue();
    });
  }

  /**
   * Sprint 5: Update fleet progress bar
   */
  private updateFleetProgress(current: number, total: number, machineName: string): void {
    const textEl = document.getElementById('fleet-progress-text');
    const fillEl = document.getElementById('fleet-progress-fill');
    if (textEl) {
      textEl.textContent = t('fleet.queue.progress', {
        current: String(current),
        total: String(total),
        name: machineName,
      });
    }
    if (fillEl) fillEl.style.width = `${(current / total) * 100}%`;
  }

  /**
   * Sprint 5: Complete fleet queue and show ranking
   */
  private async completeFleetQueue(): Promise<void> {
    const total = this.fleetQueue.length;
    const skipped = this.fleetQueueSkipped;
    const checked = total - skipped;
    const groupName = this.fleetQueueGroupName;
    const diagnosisIds = [...this.fleetQueueDiagnosisIds];
    const machineIds = [...this.fleetQueue];

    this.cleanupFleetQueue();

    // Sprint 7: If Quick Compare is active, show its result screen instead
    if (this.quickCompareController.isActive) {
      this.quickCompareController.showResults();
      return;
    }

    // Show fleet result modal instead of toast + immediate ranking
    await this.showFleetResultModal({
      groupName,
      machineIds,
      diagnosisIds,
      total,
      checked,
      skipped,
    });
  }

  // ============================================================================
  // FLEET RESULT MODAL
  // ============================================================================

  /**
   * Welle 4: Export fleet report as PDF or CSV.
   */
  private exportFleetReport(
    groupName: string,
    ranked: Array<{ machine: Machine; score: number | null }>,
    stats: {
      median: number;
      outlierThreshold: number;
      min: number;
      max: number;
      spread: number;
    } | null
  ): void {
    const entries: ReportEntry[] = ranked
      .filter((r): r is { machine: Machine; score: number } => r.score !== null)
      .map((r) => {
        const statusText =
          r.score >= 75
            ? t('status.healthy')
            : r.score >= 50
              ? t('status.uncertain')
              : t('status.faulty');
        return {
          machineName: r.machine.name,
          machineId: r.machine.id,
          score: r.score,
          status: statusText,
          timestamp: Date.now(),
          recommendation:
            r.score >= 75
              ? t('diagnose.recommendation.healthy')
              : r.score >= 50
                ? t('diagnose.recommendation.warning')
                : t('diagnose.recommendation.critical'),
        };
      });

    const data: ReportData = {
      title: t('report.fleetTitle'),
      subtitle: groupName,
      date: new Date().toLocaleString(),
      entries,
      summary: {
        total: ranked.length,
        healthy: entries.filter((e) => e.score >= 75).length,
        warning: entries.filter((e) => e.score >= 50 && e.score < 75).length,
        critical: entries.filter((e) => e.score < 50).length,
        unchecked: ranked.filter((r) => r.score === null).length,
        medianScore: stats?.median,
      },
    };

    // Direct PDF export for fleet results (most common use case)
    exportAsPrintablePDF(data);
  }

  /**
   * Show fleet result modal after fleet queue completes.
   */
  private async showFleetResultModal(params: {
    groupName: string;
    machineIds: string[];
    diagnosisIds: string[];
    total: number;
    checked: number;
    skipped: number;
  }): Promise<void> {
    const { groupName, machineIds, diagnosisIds, total, checked, skipped } = params;

    // Load machines and their latest diagnoses
    const ranked: Array<{ machine: Machine; score: number | null }> = [];
    for (const id of machineIds) {
      const machine = await getMachine(id);
      if (!machine) continue;
      const diagnosis = await getLatestDiagnosis(id);
      ranked.push({ machine, score: diagnosis ? diagnosis.healthScore : null });
    }

    // Sort: lowest score first (outlier at top), null-scores at bottom
    ranked.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });

    // Calculate statistics
    const scores = ranked.map((r) => r.score).filter((s): s is number => s !== null);
    const stats = calculateFleetStats(scores);
    const outlierCount = stats ? scores.filter((s) => s < stats.outlierThreshold).length : 0;
    const hasOutliers = outlierCount > 0;

    // Detect gold standard machine
    let goldStandardId: string | null = null;
    const refSourceIds = ranked.map((r) => r.machine.fleetReferenceSourceId).filter(Boolean);
    if (refSourceIds.length > 0) {
      const counts = new Map<string, number>();
      for (const id of refSourceIds) {
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      let maxCount = 0;
      for (const [id, count] of counts) {
        if (count > maxCount) {
          goldStandardId = id;
          maxCount = count;
        }
      }
    }

    // Build modal DOM
    const overlay = document.createElement('div');
    overlay.className = 'fleet-result-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-result-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'fleet-result-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = t('fleet.result.title');
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fleet-result-close';
    closeBtn.setAttribute('aria-label', t('fleet.history.close'));
    closeBtn.textContent = '\u2715';
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // --- Scrollable body ---
    const body = document.createElement('div');
    body.className = 'fleet-result-body';

    // Status banner
    const statusBanner = document.createElement('div');
    statusBanner.className = `fleet-result-status ${hasOutliers ? 'fleet-result-status-warning' : 'fleet-result-status-ok'}`;

    const statusIcon = document.createElement('div');
    statusIcon.className = 'fleet-result-status-icon';
    statusIcon.textContent = hasOutliers ? '\u26A0\uFE0F' : '\u2705';
    statusBanner.appendChild(statusIcon);

    const statusTitle = document.createElement('div');
    statusTitle.className = 'fleet-result-status-title';
    statusTitle.textContent = hasOutliers
      ? t('fleet.result.completeWithOutliers')
      : t('fleet.result.complete');
    statusBanner.appendChild(statusTitle);

    const statusSubtitle = document.createElement('div');
    statusSubtitle.className = 'fleet-result-status-subtitle';
    statusSubtitle.textContent = t('fleet.result.summary', {
      name: groupName,
      checked: String(checked),
      total: String(total),
    });
    if (skipped > 0) {
      statusSubtitle.textContent +=
        ' · ' +
        t('fleet.result.summarySkipped', {
          skipped: String(skipped),
        });
    }
    statusBanner.appendChild(statusSubtitle);

    body.appendChild(statusBanner);

    // Statistics row (only if we have stats)
    if (stats) {
      const statsRow = document.createElement('div');
      statsRow.className = 'fleet-result-stats';

      const medianStat = this.createStatBlock(
        t('fleet.result.statsMedian'),
        `${stats.median.toFixed(0)}%`
      );
      const spreadStat = this.createStatBlock(
        t('fleet.result.statsSpread'),
        `${stats.spread.toFixed(0)}%`
      );
      const worstStat = this.createStatBlock(
        t('fleet.result.statsWorst'),
        `${stats.min.toFixed(0)}%`
      );

      statsRow.appendChild(medianStat);
      statsRow.appendChild(spreadStat);
      statsRow.appendChild(worstStat);
      body.appendChild(statsRow);
    }

    // Ranking list
    const rankingSection = document.createElement('div');
    rankingSection.className = 'fleet-result-ranking';

    const rankingTitle = document.createElement('div');
    rankingTitle.className = 'fleet-result-ranking-title';
    rankingTitle.textContent = t('fleet.result.rankingTitle');
    rankingSection.appendChild(rankingTitle);

    for (const item of ranked) {
      const isOutlier =
        stats !== null && item.score !== null ? item.score < stats.outlierThreshold : false;
      const rankItem = this.createFleetResultRankingItem(
        item.machine,
        item.score,
        stats,
        isOutlier,
        goldStandardId
      );
      rankingSection.appendChild(rankItem);
    }

    body.appendChild(rankingSection);
    modal.appendChild(body);

    // --- Action buttons ---
    const actions = document.createElement('div');
    actions.className = 'fleet-result-actions';

    const historyBtn = document.createElement('button');
    historyBtn.className = 'fleet-result-btn-history';
    historyBtn.textContent = '\uD83D\uDCCA ' + t('fleet.result.viewHistory');
    historyBtn.addEventListener('click', () => {
      this.showFleetHistory(groupName, machineIds);
    });
    actions.appendChild(historyBtn);

    // Welle 4: Report export button
    const reportBtn = document.createElement('button');
    reportBtn.className = 'fleet-result-btn-history';
    reportBtn.textContent = '\uD83D\uDCC4 ' + t('report.exportButton');
    reportBtn.addEventListener('click', () => {
      this.exportFleetReport(groupName, ranked, stats);
    });
    actions.appendChild(reportBtn);

    const closeAndContinueBtn = document.createElement('button');
    closeAndContinueBtn.className = 'fleet-result-btn-close';
    closeAndContinueBtn.textContent = t('fleet.result.closeAndContinue');
    closeAndContinueBtn.setAttribute('aria-label', t('fleet.result.closeAndContinue'));
    closeAndContinueBtn.addEventListener('click', () => {
      overlay.remove();
      this.resetToGrundansicht();
    });
    actions.appendChild(closeAndContinueBtn);

    const btnRow = document.createElement('div');
    btnRow.className = 'fleet-result-btn-row';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'fleet-result-btn-save';
    saveBtn.textContent = '\u2705 ' + t('fleet.result.save');
    saveBtn.addEventListener('click', () => {
      overlay.remove();
      this.identifyPhase.showFleetRanking();
    });
    btnRow.appendChild(saveBtn);

    const discardBtn = document.createElement('button');
    discardBtn.className = 'fleet-result-btn-discard';
    discardBtn.textContent = '\uD83D\uDDD1 ' + t('fleet.result.discard');
    discardBtn.addEventListener('click', async () => {
      if (!confirm(t('fleet.result.discardConfirm'))) return;
      await this.discardFleetResults(diagnosisIds);
      notify.info(t('fleet.result.discardDone', { count: String(diagnosisIds.length) }));
      overlay.remove();
      this.identifyPhase.showFleetRanking();
    });
    btnRow.appendChild(discardBtn);

    actions.appendChild(btnRow);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers (implicit save)
    const closeModal = () => {
      overlay.remove();
      this.identifyPhase.showFleetRanking();
    };

    closeBtn.addEventListener('click', closeModal);

    // Backdrop click closes (implicit save)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Escape key closes (implicit save)
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        closeModal();
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus the save button for keyboard accessibility
    requestAnimationFrame(() => saveBtn.focus());
  }

  /**
   * Create a stat display block (value + label).
   */
  private createStatBlock(label: string, value: string): HTMLElement {
    const block = document.createElement('div');
    block.className = 'fleet-result-stat';

    const valueEl = document.createElement('div');
    valueEl.className = 'fleet-result-stat-value';
    valueEl.textContent = value;
    block.appendChild(valueEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'fleet-result-stat-label';
    labelEl.textContent = label;
    block.appendChild(labelEl);

    return block;
  }

  /**
   * Create a ranking item for the fleet result modal.
   * Visually identical to the fleet ranking items, but without click handler.
   */
  private createFleetResultRankingItem(
    machine: Machine,
    score: number | null,
    stats: {
      median: number;
      outlierThreshold: number;
      min: number;
      max: number;
      spread: number;
    } | null,
    isOutlier: boolean,
    goldStandardId: string | null
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = `fleet-rank-item${isOutlier ? ' fleet-outlier' : ''}`;

    // Machine name
    const nameEl = document.createElement('div');
    nameEl.className = 'fleet-rank-name';
    nameEl.textContent = machine.name;

    // Gold Standard indicator
    if (goldStandardId === machine.id) {
      const goldBadge = document.createElement('span');
      goldBadge.className = 'fleet-gold-badge';
      goldBadge.textContent = '\uD83C\uDFC6';
      goldBadge.title = t('fleet.goldStandard.badge');
      nameEl.appendChild(goldBadge);
    }

    // Score bar container
    const barContainer = document.createElement('div');
    barContainer.className = 'fleet-rank-bar-container';

    if (score !== null && stats) {
      const bar = document.createElement('div');
      bar.className = `fleet-rank-bar${isOutlier ? ' fleet-rank-bar-outlier' : ''}`;
      bar.style.width = `${Math.max(score, 2)}%`;
      barContainer.appendChild(bar);

      const scoreLabel = document.createElement('span');
      scoreLabel.className = `fleet-rank-score${isOutlier ? ' fleet-rank-score-outlier' : ''}`;
      scoreLabel.textContent = isOutlier ? `\u26A0 ${score.toFixed(0)}%` : `${score.toFixed(0)}%`;
      barContainer.appendChild(scoreLabel);
    } else if (score !== null) {
      // Score exists but no stats (single machine)
      const bar = document.createElement('div');
      bar.className = 'fleet-rank-bar';
      bar.style.width = `${Math.max(score, 2)}%`;
      barContainer.appendChild(bar);

      const scoreLabel = document.createElement('span');
      scoreLabel.className = 'fleet-rank-score';
      scoreLabel.textContent = `${score.toFixed(0)}%`;
      barContainer.appendChild(scoreLabel);
    } else {
      const noData = document.createElement('span');
      noData.className = 'fleet-rank-nodata';
      noData.textContent = t('fleet.result.notChecked');
      barContainer.appendChild(noData);
    }

    item.appendChild(nameEl);
    item.appendChild(barContainer);

    // No click handler – this is a summary view, not navigation
    return item;
  }

  /**
   * Discard fleet results: delete diagnoses from this run.
   */
  private async discardFleetResults(diagnosisIds: string[]): Promise<void> {
    for (const id of diagnosisIds) {
      await deleteDiagnosis(id);
    }
  }

  /**
   * Show fleet check history modal (MVP table view).
   */
  private async showFleetHistory(groupName: string, machineIds: string[]): Promise<void> {
    // Load all diagnoses for all fleet machines
    const allDiagnoses: Array<{ machineId: string; timestamp: number; healthScore: number }> = [];
    for (const id of machineIds) {
      const diagnoses = await getDiagnosesForMachine(id);
      for (const d of diagnoses) {
        allDiagnoses.push({
          machineId: d.machineId,
          timestamp: d.timestamp,
          healthScore: d.healthScore,
        });
      }
    }

    // Group by timestamp (±5 minutes = same run)
    allDiagnoses.sort((a, b) => b.timestamp - a.timestamp);
    const FIVE_MINUTES = 5 * 60 * 1000;
    const runs: Array<{ timestamp: number; scores: number[]; machineCount: number }> = [];

    for (const d of allDiagnoses) {
      const existingRun = runs.find((r) => Math.abs(r.timestamp - d.timestamp) < FIVE_MINUTES);
      if (existingRun) {
        existingRun.scores.push(d.healthScore);
        // Track unique machines
        existingRun.machineCount = existingRun.scores.length;
      } else {
        runs.push({ timestamp: d.timestamp, scores: [d.healthScore], machineCount: 1 });
      }
    }

    // Build history modal (reusing fleet-result-overlay pattern)
    const overlay = document.createElement('div');
    overlay.className = 'fleet-result-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-result-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // Header
    const header = document.createElement('div');
    header.className = 'fleet-result-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = t('fleet.history.title');
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fleet-result-close';
    closeBtn.setAttribute('aria-label', t('fleet.history.close'));
    closeBtn.textContent = '\u2715';
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'fleet-result-body';

    // Subtitle with group name
    const subtitle = document.createElement('div');
    subtitle.className = 'fleet-result-status-subtitle';
    subtitle.style.textAlign = 'center';
    subtitle.style.marginBottom = '16px';
    subtitle.textContent = t('fleet.history.subtitle', { name: groupName });
    body.appendChild(subtitle);

    if (runs.length <= 1) {
      // No trend yet
      const noTrend = document.createElement('div');
      noTrend.className = 'fleet-history-no-trend';
      noTrend.textContent = t('fleet.history.noTrend');
      body.appendChild(noTrend);
    }

    // Always show the runs we have (even if just one)
    if (runs.length > 0) {
      const list = document.createElement('ul');
      list.className = 'fleet-history-list';

      for (const run of runs) {
        const runStats = calculateFleetStats(run.scores);
        const li = document.createElement('li');
        li.className = 'fleet-history-item';

        const dateEl = document.createElement('span');
        dateEl.className = 'fleet-history-date';
        const dateObj = new Date(run.timestamp);
        dateEl.textContent =
          dateObj.toLocaleDateString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }) +
          ' ' +
          dateObj.toLocaleTimeString(getLocale(), {
            hour: '2-digit',
            minute: '2-digit',
          });
        li.appendChild(dateEl);

        const statsEl = document.createElement('span');
        statsEl.className = 'fleet-history-stats';
        if (runStats) {
          statsEl.textContent = `${t('fleet.history.median')} ${runStats.median.toFixed(0)}%  ·  ${t('fleet.history.spread')} ${runStats.spread.toFixed(0)}%  ·  ${run.machineCount}/${machineIds.length}`;
        } else if (run.scores.length === 1) {
          statsEl.textContent = `${run.scores[0].toFixed(0)}%  ·  1/${machineIds.length}`;
        }
        li.appendChild(statsEl);

        list.appendChild(li);
      }

      body.appendChild(list);
    }

    modal.appendChild(body);

    // Close button at bottom
    const actions = document.createElement('div');
    actions.className = 'fleet-result-actions';

    const closeBtnBottom = document.createElement('button');
    closeBtnBottom.className = 'fleet-result-btn-save';
    closeBtnBottom.textContent = t('fleet.history.close');
    closeBtnBottom.addEventListener('click', () => overlay.remove());
    actions.appendChild(closeBtnBottom);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        overlay.remove();
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Sprint 5: Cancel fleet queue
   */
  private cancelFleetQueue(): void {
    // Sprint 7: If Quick Compare is active, show results for what was already checked
    const wasQuickCompare = this.quickCompareController.isActive;

    this.cleanupFleetQueue();
    this.fleetQueue = [];

    if (wasQuickCompare) {
      this.quickCompareController.showResults();
      return;
    }

    notify.info(t('fleet.queue.cancelled'));
  }

  /**
   * UX-Fix: Reset app to clean Grundansicht after a completed check process.
   *
   * Preserves: Machine info header with export option (top bar).
   * Resets: Workflow mode, fleet queue, active diagnosis state, button states.
   */
  private resetToGrundansicht(): void {
    logger.info('🏠 Resetting to Grundansicht after completed check');

    // 1. Reset any active fleet queue state
    if (this.isFleetQueueActive) {
      this.cleanupFleetQueue();
    }

    // 2. Reset workflow mode to series (Übersicht)
    this.identifyPhase.setWorkflowMode('series');

    // 3. Clear machine from card controllers so the "no machine selected" state shows
    this.diagnoseCardController.clearMachine();
    this.referenceCardController.clearMachine();
    this.currentMachine = null;

    // 4. Reset section layout: collapse diagnosis/reference, re-expand machine selection
    this.collapseSection('run-diagnosis-content');
    this.collapseSection('record-reference-content');
    this.expandSection('select-machine-content');

    // 5. Reset diagnose/reference button states to default
    const diagnoseBtn = document.getElementById('diagnose-btn');
    const referenceBtn = document.getElementById('reference-btn');
    if (diagnoseBtn) {
      diagnoseBtn.classList.remove('active', 'ready');
    }
    if (referenceBtn) {
      referenceBtn.classList.remove('active', 'ready');
    }

    // 6. Refresh machine overview
    this.identifyPhase.updateDashboard();

    logger.info('✅ Grundansicht restored');
  }

  /**
   * Sprint 5 Fix: Clean up fleet queue state and listeners
   */
  private cleanupFleetQueue(): void {
    this.isFleetQueueActive = false;
    this.isFleetQueuePaused = false;
    document.getElementById('fleet-progress')?.remove();
    // Sprint 6: Remove guided prompt if visible
    document.getElementById('fleet-guided-prompt')?.remove();
    // Remove visibility listener
    if (this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
  }
}
