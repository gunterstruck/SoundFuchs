/**
 * ZANOBOT - ReferenceCardController
 *
 * Controls the state-based UI of the "Referenz aufnehmen" card.
 * Manages transitions between:
 * - State B: No machine selected (shows three equal action buttons)
 * - State A: Machine selected (shows machine info + AUFNEHMEN button)
 *
 * This mirrors the DiagnoseCardController logic for consistent UX.
 */

import type { Machine } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

export class ReferenceCardController {
  // State tracking
  private currentMachine: Machine | null = null;

  // UI Elements
  private noMachineState: HTMLElement | null = null;
  private machineReadyState: HTMLElement | null = null;
  private machineNameDisplay: HTMLElement | null = null;
  private machineMetaDisplay: HTMLElement | null = null;

  // Callbacks
  private onScanRequested: (() => void) | null = null;
  private onSelectRequested: (() => void) | null = null;
  private onCreateRequested: (() => void) | null = null;

  constructor() {
    // Elements will be initialized in init()
  }

  /**
   * Initialize the controller and set up event listeners
   */
  public init(callbacks: {
    onScanRequested: () => void;
    onSelectRequested: () => void;
    onCreateRequested: () => void;
  }): void {
    this.onScanRequested = callbacks.onScanRequested;
    this.onSelectRequested = callbacks.onSelectRequested;
    this.onCreateRequested = callbacks.onCreateRequested;

    // Get UI elements
    this.noMachineState = document.getElementById('reference-no-machine');
    this.machineReadyState = document.getElementById('reference-machine-ready');
    this.machineNameDisplay = document.getElementById('reference-selected-machine-name');
    this.machineMetaDisplay = document.getElementById('reference-selected-machine-meta');

    // Set up event listeners
    this.setupEventListeners();

    // Show initial state (no machine selected)
    this.showNoMachineState();

    logger.debug('[ReferenceCardController] Initialized');
  }

  /**
   * Set up event listeners for UI interactions
   */
  private setupEventListeners(): void {
    // Scan button
    const scanBtn = document.getElementById('reference-scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.debug('[ReferenceCardController] Scan button clicked');
        if (this.onScanRequested) {
          this.onScanRequested();
        }
      });
      logger.debug('[ReferenceCardController] Scan button listener attached');
    } else {
      logger.warn('[ReferenceCardController] Scan button not found: #reference-scan-btn');
    }

    // Select existing machine button
    const selectBtn = document.getElementById('reference-select-btn');
    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.debug('[ReferenceCardController] Select button clicked');
        if (this.onSelectRequested) {
          this.onSelectRequested();
        }
      });
      logger.debug('[ReferenceCardController] Select button listener attached');
    } else {
      logger.warn('[ReferenceCardController] Select button not found: #reference-select-btn');
    }

    // Create new machine button
    const createBtn = document.getElementById('reference-create-btn');
    if (createBtn) {
      createBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.debug('[ReferenceCardController] Create button clicked');
        if (this.onCreateRequested) {
          this.onCreateRequested();
        }
      });
      logger.debug('[ReferenceCardController] Create button listener attached');
    } else {
      logger.warn('[ReferenceCardController] Create button not found: #reference-create-btn');
    }

    // Change machine button (in State A)
    const changeMachineBtn = document.getElementById('reference-change-machine-btn');
    if (changeMachineBtn) {
      changeMachineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.debug('[ReferenceCardController] Change machine button clicked');
        this.showNoMachineState();
        this.currentMachine = null;
      });
    }
  }

  /**
   * Update the card to show machine-selected state (State A)
   */
  public setMachine(machine: Machine): void {
    this.currentMachine = machine;
    this.showMachineReadyState(machine);
    logger.debug(`[ReferenceCardController] Machine set: ${machine.name}`);
  }

  /**
   * Clear the selected machine and show selection state (State B)
   */
  public clearMachine(): void {
    this.currentMachine = null;
    this.showNoMachineState();
    logger.debug('[ReferenceCardController] Machine cleared');
  }

  /**
   * Get the currently selected machine
   */
  public getCurrentMachine(): Machine | null {
    return this.currentMachine;
  }

  /**
   * Show the no-machine-selected state (State B)
   */
  private showNoMachineState(): void {
    if (this.noMachineState) {
      this.noMachineState.style.display = 'block';
    }
    if (this.machineReadyState) {
      this.machineReadyState.style.display = 'none';
    }
  }

  /**
   * Show the machine-ready state (State A)
   */
  private showMachineReadyState(machine: Machine): void {
    if (this.noMachineState) {
      this.noMachineState.style.display = 'none';
    }
    if (this.machineReadyState) {
      this.machineReadyState.style.display = 'block';
    }

    // Update machine info display
    if (this.machineNameDisplay) {
      this.machineNameDisplay.textContent = machine.name;
    }

    // Update meta info
    if (this.machineMetaDisplay) {
      const metaText = this.getMachineMetaText(machine);
      this.machineMetaDisplay.textContent = metaText;
      this.machineMetaDisplay.style.display = metaText ? 'block' : 'none';
    }
  }

  /**
   * Generate meta text for the machine (e.g., trained states count)
   */
  private getMachineMetaText(machine: Machine): string {
    if (machine.referenceModels && machine.referenceModels.length > 0) {
      const count = machine.referenceModels.length;
      return t('reference.statesRecorded', { count: String(count) });
    }
    return t('reference.noReferenceYet');
  }
}
