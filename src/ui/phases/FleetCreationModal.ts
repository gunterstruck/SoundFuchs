/**
 * ZANOBOT - FLEET CREATION / QUICK-SAVE UI
 *
 * The fleet grouping UI extracted from the Identify phase:
 * - renderQuickSaveCTA: the "save this ad-hoc 24h group as a fleet" call to action,
 * - showQuickSaveDialog: prompt-based bulk tagging of those machines,
 * - show: the full fleet creation modal (multi-select + Gold-Standard picker).
 *
 * Holds no phase state; the workflow-mode transitions and the dependent
 * re-renders / suggestion refresh are injected via the deps interface.
 */

import { getAllMachines, saveMachine } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import type { Machine } from '@data/types.js';

/** Phase-side behaviour the fleet creation UI needs. */
export interface FleetCreationDeps {
  /** Refresh the fleet-group autocomplete suggestions datalist. */
  populateFleetGroupSuggestions: () => Promise<void>;
  /** Re-render the machine overview (current workflow mode). */
  loadMachineOverview: () => Promise<void>;
  /** Force-switch into fleet mode and re-render (even if already in fleet mode). */
  forceFleetMode: () => Promise<void>;
}

export class FleetCreationModal {
  constructor(private readonly deps: FleetCreationDeps) {}

  /**
   * Sprint 4 UX: "Save as fleet" CTA for an ad-hoc (time-fallback) group.
   */
  public renderQuickSaveCTA(container: HTMLElement, machines: Machine[]): void {
    // Remove existing CTA if re-rendering
    const existing = container.querySelector('.fleet-save-cta');
    if (existing) existing.remove();

    const ctaContainer = document.createElement('div');
    ctaContainer.className = 'fleet-save-cta';

    const hint = document.createElement('span');
    hint.className = 'fleet-save-cta-hint';
    hint.textContent = t('fleet.quickSave.hint');

    const btn = document.createElement('button');
    btn.className = 'fleet-save-cta-btn';
    btn.textContent = t('fleet.quickSave.button');
    btn.setAttribute('aria-label', t('fleet.quickSave.button'));

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.showQuickSaveDialog(machines);
    });

    ctaContainer.appendChild(hint);
    ctaContainer.appendChild(btn);
    container.appendChild(ctaContainer);
  }

  /**
   * Sprint 4 UX: Show dialog to name and save the Quick Fleet as a persistent group.
   */
  private async showQuickSaveDialog(machines: Machine[]): Promise<void> {
    const groupName = prompt(t('fleet.quickSave.prompt'));
    if (!groupName || !groupName.trim()) return;

    const trimmed = groupName.trim();

    // Bulk-assign fleetGroup to all machines
    for (const machine of machines) {
      machine.fleetGroup = trimmed;
      await saveMachine(machine);
    }

    // Update autocomplete suggestions
    await this.deps.populateFleetGroupSuggestions();

    // Re-render fleet ranking (now uses tag-based grouping)
    await this.deps.loadMachineOverview();

    // Notify user
    notify.success(
      t('fleet.quickSave.success', {
        count: String(machines.length),
        name: trimmed,
      })
    );
  }

  /**
   * Sprint 5 UX: Show fleet creation modal with multi-select machine list.
   */
  public async show(): Promise<void> {
    const allMachines = await getAllMachines();
    if (allMachines.length === 0) {
      notify.info(t('fleet.create.noMachines'));
      return;
    }

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'fleet-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('fleet.create.title'));

    // Header
    const header = document.createElement('div');
    header.className = 'fleet-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'fleet-modal-title';
    titleEl.textContent = t('fleet.create.title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottomsheet-close fleet-modal-close';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    closeBtn.textContent = '✕';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Group name input
    const nameSection = document.createElement('div');
    nameSection.className = 'fleet-modal-section';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label';
    nameLabel.textContent = t('fleet.create.nameLabel');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'machine-input fleet-modal-name-input';
    nameInput.placeholder = t('fleet.create.namePlaceholder');
    nameInput.setAttribute('list', 'fleet-group-suggestions');
    nameInput.maxLength = 50;
    nameInput.autocomplete = 'off';

    nameSection.appendChild(nameLabel);
    nameSection.appendChild(nameInput);

    // Machine list with checkboxes
    const listSection = document.createElement('div');
    listSection.className = 'fleet-modal-section';

    const listLabel = document.createElement('label');
    listLabel.className = 'form-label';
    listLabel.textContent = t('fleet.create.selectMachines');
    listSection.appendChild(listLabel);

    const machineList = document.createElement('div');
    machineList.className = 'fleet-modal-machine-list';

    for (const machine of allMachines) {
      const item = document.createElement('label');
      item.className = 'fleet-modal-machine-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = machine.id;
      checkbox.className = 'fleet-modal-checkbox';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'fleet-modal-machine-name';
      nameSpan.textContent = machine.name;

      item.appendChild(checkbox);
      item.appendChild(nameSpan);
      machineList.appendChild(item);
    }
    listSection.appendChild(machineList);

    // Gold-Standard selection (Maßnahme 5)
    const goldSection = document.createElement('div');
    goldSection.className = 'fleet-modal-section fleet-modal-gold-section';
    goldSection.style.display = 'none';

    const goldLabel = document.createElement('label');
    goldLabel.className = 'form-label';
    goldLabel.textContent = t('fleet.create.goldStandard');

    const goldHint = document.createElement('p');
    goldHint.className = 'fleet-modal-hint';
    goldHint.textContent = t('fleet.create.goldHint');

    const goldSelect = document.createElement('select');
    goldSelect.className = 'machine-input fleet-modal-gold-select';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = t('fleet.create.goldNone');
    goldSelect.appendChild(defaultOpt);

    goldSection.appendChild(goldLabel);
    goldSection.appendChild(goldHint);
    goldSection.appendChild(goldSelect);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'fleet-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fleet-modal-cancel-btn';
    cancelBtn.textContent = t('buttons.cancel');

    const createBtn = document.createElement('button');
    createBtn.className = 'action-btn fleet-modal-create-btn';
    createBtn.textContent = t('fleet.create.createButton');
    createBtn.disabled = true;

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(nameSection);
    modal.appendChild(listSection);
    modal.appendChild(goldSection);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // --- Event handlers ---
    const checkboxes = machineList.querySelectorAll<HTMLInputElement>('.fleet-modal-checkbox');

    const updateState = () => {
      const checked = [...checkboxes].filter((cb) => cb.checked);
      const hasName = nameInput.value.trim().length > 0;
      const hasEnoughMachines = checked.length >= 2;

      createBtn.disabled = !(hasName && hasEnoughMachines);

      // Show/hide Gold-Standard section
      goldSection.style.display = hasEnoughMachines ? 'block' : 'none';

      // Update Gold-Standard dropdown options
      if (hasEnoughMachines) {
        const currentValue = goldSelect.value;
        goldSelect.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = t('fleet.create.goldNone');
        goldSelect.appendChild(noneOpt);

        for (const cb of checked) {
          const machine = allMachines.find((m) => m.id === cb.value);
          if (machine && machine.referenceModels && machine.referenceModels.length > 0) {
            const opt = document.createElement('option');
            opt.value = machine.id;
            opt.textContent = machine.name;
            goldSelect.appendChild(opt);
          }
        }
        // Restore previous selection if still valid
        if ([...goldSelect.options].some((o) => o.value === currentValue)) {
          goldSelect.value = currentValue;
        }
      }
    };

    nameInput.addEventListener('input', updateState);
    checkboxes.forEach((cb) => cb.addEventListener('change', updateState));

    // Close handlers
    const close = () => {
      document.removeEventListener('keydown', keydownHandler);
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    // Escape key + focus trap
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      // Focus trap: Tab cycles within modal
      if (e.key === 'Tab') {
        const focusableEls = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableEls.length === 0) return;
        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydownHandler);

    // Create handler
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;

      const selectedIds = [...checkboxes].filter((cb) => cb.checked).map((cb) => cb.value);
      const goldStandardId = goldSelect.value || null;

      await this.createFleetFromSelection(name, selectedIds, goldStandardId, allMachines);
      close();
    });

    // Focus name input
    requestAnimationFrame(() => nameInput.focus());
  }

  /**
   * Sprint 5 UX: Apply fleetGroup (and optional Gold-Standard) to selected machines.
   */
  private async createFleetFromSelection(
    groupName: string,
    machineIds: string[],
    goldStandardId: string | null,
    allMachines: Machine[]
  ): Promise<void> {
    for (const id of machineIds) {
      const machine = allMachines.find((m) => m.id === id);
      if (!machine) continue;

      machine.fleetGroup = groupName;

      // Maßnahme 5: Set shared reference source (if Gold-Standard chosen)
      if (goldStandardId && id !== goldStandardId) {
        machine.fleetReferenceSourceId = goldStandardId;
      } else if (id === goldStandardId) {
        // Gold-Standard uses its own reference
        machine.fleetReferenceSourceId = null;
      }

      await saveMachine(machine);
    }

    // Update autocomplete suggestions
    await this.deps.populateFleetGroupSuggestions();

    // Switch to fleet mode and re-render
    await this.deps.forceFleetMode();

    notify.success(
      t('fleet.create.success', {
        count: String(machineIds.length),
        name: groupName,
      })
    );
  }
}
