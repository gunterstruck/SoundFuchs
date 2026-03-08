/**
 * ZANOBOT - QUICK COMPARE CONTROLLER (Simplified)
 *
 * Enables "zero-friction" fleet comparison:
 * 1. Choose machine count (or receive via NFC/QR deep link)
 * 2. All n machines are created immediately
 * 3. Unified guided loop: Machine 01 = reference, Machine 02-n = diagnosis
 * 4. Result screen with outlier detection + save-as-fleet option
 *
 * Design principles:
 * - No new DB schema changes (DB_VERSION stays 7)
 * - Reuses existing Fleet Queue (startFleetQueue / advanceFleetQueue / completeFleetQueue)
 * - Reuses existing Recording + GMIA infrastructure
 * - All machines persisted immediately in IndexedDB (crash-safe)
 * - Machine 01 is always the reference – no separate reference step
 */

import { saveMachine, getMachine, deleteMachine, getLatestDiagnosis } from '@data/db.js';
import type { Machine } from '@data/types.js';
import { t } from '../i18n/index.js';
import { logger } from '@utils/logger.js';
import { notify } from '@utils/notifications.js';

export class QuickCompareController {
  private machineCount: number = 0;
  private goldStandardId: string | null = null;
  private createdMachineIds: string[] = [];
  private _isActive: boolean = false;
  private currentStep: 'idle' | 'count' | 'reference' | 'compare' | 'result' = 'idle';

  /** Callback: start the fleet queue with ALL machine IDs */
  public onStartFleetQueue: ((machineIds: string[], groupName: string) => void) | null = null;
  /** Callback: navigate back to start screen */
  public onNavigateHome: (() => void) | null = null;

  public get isActive(): boolean {
    return this._isActive;
  }

  /** Public getter: ID of the gold standard (reference) machine */
  public get goldStandardMachineId(): string | null {
    return this.goldStandardId;
  }

  constructor() {}

  // ============================================================================
  // STEP 1: COUNT SELECTION
  // ============================================================================

  /** Start the quick compare flow – shows the count selection wizard */
  public start(): void {
    this._isActive = true;
    this.currentStep = 'count';
    this.machineCount = 0;
    this.goldStandardId = null;
    this.createdMachineIds = [];
    this.showCountSelection();
  }

  /**
   * Start quick compare with a pre-set count (NFC/QR deep link flow).
   * Skips the count selection wizard – directly creates machines and starts the loop.
   */
  public async startWithCount(count: number): Promise<void> {
    this._isActive = true;
    this.machineCount = count;
    this.goldStandardId = null;
    this.createdMachineIds = [];
    await this.createMachinesAndStartLoop(count);
  }

  /** Cancel and clean up the quick compare flow */
  public cancel(): void {
    this._isActive = false;
    this.currentStep = 'idle';
    this.removeOverlay();
  }

  private showCountSelection(): void {
    this.removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'qc-overlay';
    overlay.className = 'fleet-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-modal qc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('quickCompare.wizard.title'));

    // Header
    const header = document.createElement('div');
    header.className = 'fleet-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'fleet-modal-title';
    titleEl.textContent = t('quickCompare.wizard.title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottomsheet-close fleet-modal-close';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.cancel());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Question
    const question = document.createElement('p');
    question.className = 'qc-question';
    question.textContent = t('quickCompare.wizard.howMany');

    // Preset chips
    const chips = document.createElement('div');
    chips.className = 'qc-count-chips';

    let selectedCount = 0;
    const presets = [3, 5, 8, 10];
    const chipBtns: HTMLButtonElement[] = [];

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.className = 'machine-input qc-custom-input';
    customInput.min = '2';
    customInput.max = '30';
    customInput.placeholder = t('quickCompare.wizard.customCount');

    const nextBtn = document.createElement('button');
    nextBtn.className = 'action-btn qc-next-btn';
    nextBtn.textContent = t('quickCompare.wizard.next');
    nextBtn.disabled = true;

    const errorMsg = document.createElement('div');
    errorMsg.className = 'qc-error-msg';
    errorMsg.style.display = 'none';

    const updateSelection = (count: number) => {
      selectedCount = count;
      chipBtns.forEach(b => b.classList.remove('active'));
      if (presets.includes(count)) {
        const idx = presets.indexOf(count);
        chipBtns[idx].classList.add('active');
        customInput.value = '';
      }
      nextBtn.disabled = count < 2;
      errorMsg.style.display = 'none';
    };

    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.className = 'qc-count-chip';
      btn.textContent = String(preset);
      btn.addEventListener('click', () => updateSelection(preset));
      chips.appendChild(btn);
      chipBtns.push(btn);
    }

    customInput.addEventListener('input', () => {
      const val = parseInt(customInput.value, 10);
      chipBtns.forEach(b => b.classList.remove('active'));
      if (isNaN(val) || val < 2) {
        selectedCount = 0;
        nextBtn.disabled = true;
        if (customInput.value.length > 0 && val < 2) {
          errorMsg.textContent = t('quickCompare.wizard.minMachines');
          errorMsg.style.display = 'block';
        }
      } else if (val > 30) {
        selectedCount = 0;
        nextBtn.disabled = true;
        errorMsg.textContent = t('quickCompare.wizard.maxMachines');
        errorMsg.style.display = 'block';
      } else {
        selectedCount = val;
        nextBtn.disabled = false;
        errorMsg.style.display = 'none';
        if (presets.includes(val)) {
          chipBtns[presets.indexOf(val)].classList.add('active');
        }
      }
    });

    // Explanation
    const explanation = document.createElement('p');
    explanation.className = 'qc-explanation';
    explanation.textContent = t('quickCompare.wizard.explanation');

    // Next button – directly creates machines and starts the guided loop
    nextBtn.addEventListener('click', async () => {
      if (selectedCount >= 2 && selectedCount <= 30) {
        this.machineCount = selectedCount;
        this.removeOverlay();
        await this.createMachinesAndStartLoop(selectedCount);
      }
    });

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(question);
    modal.appendChild(chips);
    modal.appendChild(customInput);
    modal.appendChild(errorMsg);
    modal.appendChild(explanation);
    modal.appendChild(nextBtn);
    overlay.appendChild(modal);

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.cancel();
    });

    document.body.appendChild(overlay);
  }

  // ============================================================================
  // STEP 2: CREATE MACHINES AND START GUIDED LOOP
  // ============================================================================

  /**
   * Create all n machines in IndexedDB and start the guided loop.
   * Machine 01 is the gold standard (reference). The loop covers ALL machines.
   * The Router will detect which machine is the gold standard and route accordingly.
   */
  private async createMachinesAndStartLoop(count: number): Promise<void> {
    this.currentStep = 'reference';

    const now = Date.now();
    const allIds: string[] = [];

    for (let i = 1; i <= count; i++) {
      const paddedNumber = i.toString().padStart(2, '0');
      const machine: Machine = {
        id: `qc-${now}-${paddedNumber}-${Math.random().toString(36).substring(2, 6)}`,
        name: t('zeroFriction.autoMachineName', { number: paddedNumber }),
        createdAt: now,
        referenceModels: [],
      };
      await saveMachine(machine);
      allIds.push(machine.id);
      this.createdMachineIds.push(machine.id);
    }

    // First machine is the gold standard
    this.goldStandardId = allIds[0];

    logger.info(`[QuickCompare] Created ${count} machines, gold standard: ${this.goldStandardId}`);

    // Start the fleet queue with ALL machines (including the gold standard)
    if (this.onStartFleetQueue) {
      this.onStartFleetQueue(allIds, t('quickCompare.wizard.title'));
    }
  }

  // ============================================================================
  // STEP 2b: AFTER REFERENCE SAVED → COPY TO REMAINING MACHINES
  // ============================================================================

  /**
   * Called by Router when the reference model is saved for the gold standard machine.
   * Copies the reference to all remaining machines (02-n) so they can run diagnosis.
   * The fleet queue is already running – Router will advance after this completes.
   */
  public async onReferenceComplete(goldMachine: Machine): Promise<void> {
    if (this.currentStep !== 'reference') return;
    this.currentStep = 'compare';

    logger.info(`[QuickCompare] Reference complete for gold standard: ${goldMachine.name}`);
    notify.success(t('quickCompare.reference.saved'));

    // Update stored Gold Standard ID with fresh data
    this.goldStandardId = goldMachine.id;

    // Copy reference to all remaining machines (02-n)
    for (const id of this.createdMachineIds) {
      if (id === goldMachine.id) continue;

      const machine = await getMachine(id);
      if (!machine) continue;

      // Deep copy reference models (especially Float64Array weightVector!)
      machine.referenceModels = goldMachine.referenceModels.map(m => ({
        ...m,
        weightVector: new Float64Array(m.weightVector),
      }));
      machine.refLogMean = goldMachine.refLogMean ? [...goldMachine.refLogMean] : null;
      machine.refLogStd = goldMachine.refLogStd ? [...goldMachine.refLogStd] : null;
      machine.refLogResidualStd = goldMachine.refLogResidualStd ? [...goldMachine.refLogResidualStd] : null;
      machine.refDriftBaseline = goldMachine.refDriftBaseline ? { ...goldMachine.refDriftBaseline } : null;
      machine.refT60 = goldMachine.refT60 ?? null;
      machine.refT60Classification = goldMachine.refT60Classification ?? null;
      machine.fleetReferenceSourceId = goldMachine.id;
      await saveMachine(machine);
    }

    logger.info(`[QuickCompare] Copied reference to ${this.createdMachineIds.length - 1} machines`);
  }

  // ============================================================================
  // STEP 4: RESULT SCREEN
  // ============================================================================

  /** Called by Router when fleet queue completes during Quick Compare */
  public async showResults(): Promise<void> {
    this.currentStep = 'result';

    const results: Array<{
      machine: Machine;
      score: number | null;
      isGold: boolean;
    }> = [];

    for (const id of this.createdMachineIds) {
      const machine = await getMachine(id);
      if (!machine) continue;

      const isGold = id === this.goldStandardId;
      let score: number | null = null;

      if (!isGold) {
        const diagnosis = await getLatestDiagnosis(id);
        score = diagnosis ? diagnosis.healthScore : null;
      }

      results.push({ machine, score, isGold });
    }

    // Sort: Gold first, then by score ascending (worst first for highlighting), null at end
    results.sort((a, b) => {
      if (a.isGold) return -1;
      if (b.isGold) return 1;
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });

    // Calculate statistics (exclude gold standard)
    const scores = results.map(r => r.score).filter((s): s is number => s !== null);
    const stats = this.calculateStats(scores);
    const checked = scores.length;
    const total = this.machineCount - 1; // Exclude gold standard from total
    const outlierCount = stats ? scores.filter(s => s < stats.outlierThreshold).length : 0;

    this.renderResultScreen(results, stats, checked, total, outlierCount);
  }

  private calculateStats(scores: number[]): { median: number; mad: number; outlierThreshold: number } | null {
    if (scores.length < 2) return null;

    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    // MAD (Median Absolute Deviation)
    const deviations = sorted.map(s => Math.abs(s - median)).sort((a, b) => a - b);
    const madMid = Math.floor(deviations.length / 2);
    const mad = deviations.length % 2 === 0
      ? (deviations[madMid - 1] + deviations[madMid]) / 2
      : deviations[madMid];

    // Outlier threshold: Median - 2*MAD
    const outlierThreshold = median - 2 * mad;

    return { median, mad, outlierThreshold };
  }

  private renderResultScreen(
    results: Array<{ machine: Machine; score: number | null; isGold: boolean }>,
    stats: { median: number; mad: number; outlierThreshold: number } | null,
    checked: number,
    total: number,
    outlierCount: number,
  ): void {
    this.removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'qc-overlay';
    overlay.className = 'fleet-modal-overlay';

    const screen = document.createElement('div');
    screen.className = 'fleet-modal qc-result-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'qc-result-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'qc-result-title';
    titleEl.textContent = t('quickCompare.result.title');
    headerDiv.appendChild(titleEl);

    const summary = document.createElement('div');
    summary.className = 'qc-result-summary';
    summary.textContent = t('quickCompare.result.summary', {
      checked: String(checked),
      total: String(total),
    });
    headerDiv.appendChild(summary);

    // Outlier alert or all-good
    if (outlierCount > 0) {
      const alert = document.createElement('div');
      alert.className = 'qc-result-outlier-alert';
      alert.textContent = t('quickCompare.result.outlierFound', { count: String(outlierCount) });
      headerDiv.appendChild(alert);
    } else if (checked > 0) {
      const allGood = document.createElement('div');
      allGood.className = 'qc-result-all-good';
      allGood.textContent = t('quickCompare.result.allGood');
      headerDiv.appendChild(allGood);
    }

    // UX improvement: Context explanation and recommendation
    const contextEl = document.createElement('div');
    contextEl.className = 'qc-result-context';
    if (outlierCount > 0) {
      // Find outlier names
      const outlierNames = results
        .filter(r => !r.isGold && r.score !== null && stats !== null && r.score < stats.outlierThreshold)
        .map(r => r.machine.name);
      if (outlierNames.length === 1) {
        contextEl.textContent = t('quickCompare.resultContext.outlierWarning', { name: outlierNames[0] });
      } else {
        contextEl.textContent = t('quickCompare.resultContext.outlierWarningMultiple', { count: String(outlierCount) });
      }
    } else if (checked > 0) {
      contextEl.textContent = t('quickCompare.resultContext.allGood');
    }
    if (contextEl.textContent) {
      headerDiv.appendChild(contextEl);
    }

    screen.appendChild(headerDiv);

    // Ranking list
    const list = document.createElement('div');
    list.className = 'qc-result-list';

    for (const entry of results) {
      const isOutlier = !entry.isGold && entry.score !== null && stats !== null && entry.score < stats.outlierThreshold;
      const item = this.createResultItem(entry.machine, entry.score, entry.isGold, isOutlier);
      list.appendChild(item);
    }

    screen.appendChild(list);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'qc-result-actions';

    // Save as fleet button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'qc-save-fleet-btn';
    saveBtn.textContent = t('quickCompare.result.saveAsFleet');
    saveBtn.addEventListener('click', () => this.showSaveFleetDialog(overlay));
    actions.appendChild(saveBtn);

    // Fleet save hint
    const fleetHint = document.createElement('div');
    fleetHint.className = 'qc-fleet-save-hint';
    fleetHint.textContent = t('quickCompare.resultContext.fleetSaveHint');
    actions.appendChild(fleetHint);

    // Secondary actions row
    const secondaryRow = document.createElement('div');
    secondaryRow.className = 'qc-secondary-actions';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'qc-secondary-btn';
    doneBtn.textContent = t('quickCompare.result.done');
    doneBtn.addEventListener('click', () => {
      this.finish();
    });
    secondaryRow.appendChild(doneBtn);

    const cleanupBtn = document.createElement('button');
    cleanupBtn.className = 'qc-secondary-btn';
    cleanupBtn.textContent = t('quickCompare.result.cleanup');
    cleanupBtn.addEventListener('click', () => this.cleanupTestData());
    secondaryRow.appendChild(cleanupBtn);

    actions.appendChild(secondaryRow);
    screen.appendChild(actions);

    overlay.appendChild(screen);
    document.body.appendChild(overlay);
  }

  private createResultItem(
    machine: Machine,
    score: number | null,
    isGold: boolean,
    isOutlier: boolean,
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = 'qc-result-item' + (isGold ? ' qc-gold' : '') + (isOutlier ? ' qc-outlier' : '');

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'qc-result-name';
    nameEl.textContent = machine.name;

    // Rename button
    const renameBtn = document.createElement('button');
    renameBtn.className = 'qc-result-rename-btn';
    renameBtn.textContent = '\u270F\uFE0F';
    renameBtn.title = t('quickCompare.result.rename');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt(
        t('zeroFriction.editMachineNamePrompt'),
        machine.name,
      );
      if (newName && newName.trim()) {
        machine.name = newName.trim();
        saveMachine(machine);
        nameEl.textContent = newName.trim();
        notify.success(t('zeroFriction.machineRenamed', { newName: newName.trim() }));
      }
    });

    const nameRow = document.createElement('div');
    nameRow.className = 'qc-result-name-row';
    nameRow.appendChild(nameEl);
    if (!isGold) {
      nameRow.appendChild(renameBtn);
    }

    // Score bar
    const barContainer = document.createElement('div');
    barContainer.className = 'qc-result-bar-container';

    if (isGold) {
      const goldLabel = document.createElement('span');
      goldLabel.className = 'qc-result-gold-label';
      goldLabel.textContent = '\uD83C\uDFC6 ' + t('quickCompare.result.goldLabel');
      barContainer.appendChild(goldLabel);
    } else if (score !== null) {
      const bar = document.createElement('div');
      bar.className = 'qc-result-bar' + (isOutlier ? ' qc-result-bar-outlier' : '');
      bar.style.width = `${Math.max(score, 2)}%`;
      barContainer.appendChild(bar);

      const scoreLabel = document.createElement('span');
      scoreLabel.className = 'qc-result-score' + (isOutlier ? ' qc-result-score-outlier' : '');
      scoreLabel.textContent = isOutlier ? `\u26A0 ${score.toFixed(0)}%` : `${score.toFixed(0)}%`;
      barContainer.appendChild(scoreLabel);
    } else {
      const noData = document.createElement('span');
      noData.className = 'fleet-rank-nodata';
      noData.textContent = t('quickCompare.result.notChecked');
      barContainer.appendChild(noData);
    }

    item.appendChild(nameRow);
    item.appendChild(barContainer);

    return item;
  }

  // ============================================================================
  // SAVE AS FLEET
  // ============================================================================

  private showSaveFleetDialog(_parentOverlay: HTMLElement): void {
    const fleetName = prompt(
      t('quickCompare.result.saveFleetName'),
      t('quickCompare.result.saveFleetPlaceholder'),
    );

    if (fleetName === null) return; // User cancelled

    const name = fleetName.trim() || t('quickCompare.result.defaultFleetName', {
      date: new Date().toLocaleDateString(),
    });

    this.saveAsFleet(name);
  }

  private async saveAsFleet(fleetName: string): Promise<void> {
    for (const id of this.createdMachineIds) {
      const machine = await getMachine(id);
      if (machine) {
        machine.fleetGroup = fleetName;
        if (id !== this.goldStandardId) {
          machine.fleetReferenceSourceId = this.goldStandardId;
        }
        await saveMachine(machine);
      }
    }

    notify.success(t('quickCompare.result.fleetSaved', {
      name: fleetName,
      count: String(this.createdMachineIds.length),
    }));
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  private async cleanupTestData(): Promise<void> {
    const idsToDelete = this.createdMachineIds;

    if (idsToDelete.length === 0) {
      this.finish();
      return;
    }

    const count = idsToDelete.length;

    if (!confirm(t('quickCompare.result.cleanupConfirm', { count: String(count) }))) {
      return;
    }

    for (const id of idsToDelete) {
      await deleteMachine(id);
    }

    notify.info(t('quickCompare.result.cleanupDone', { count: String(count) }));

    this.createdMachineIds = [];
    this.goldStandardId = null;
    this.finish();
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private finish(): void {
    this._isActive = false;
    this.currentStep = 'idle';
    this.removeOverlay();
    if (this.onNavigateHome) {
      this.onNavigateHome();
    }
  }

  private removeOverlay(): void {
    document.getElementById('qc-overlay')?.remove();
  }
}
