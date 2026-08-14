/**
 * SOUNDFUCHS — SCHNELLWAHL
 *
 * Die Liste der zuletzt angelernten Maschinen (neuestes Anlerndatum zuerst,
 * höchstens zehn) auf der Startseite. Sie steht seit dem 14.08.2026 nur unter
 * Profi, weil die Maschinenübersicht direkt darunter bei üblichem Bestand
 * weitgehend dieselben Maschinen zeigt.
 *
 * ── ZWEI LISTEN, ZWEI VERHALTEN — SO GEWOLLT ────────────────────────────────
 *
 * Ein Tipp auf eine Zeile hier LÄDT die Maschine in den Prüf-Ablauf. Ein Tipp
 * auf eine Zeile der Maschinenübersicht ZEIGT sie dagegen (Maschinenansicht,
 * s. MachineOverviewRenderer). Das ist kein Rest aus dem Umbau, sondern die
 * Entscheidung dazu — sie folgt den Namen, die beide Listen ohnehin tragen:
 *
 *   Übersicht   — man verschafft sich einen Überblick, also zeigt sie.
 *   Schnellwahl — sie ist schnell, also lädt sie.
 *
 * Wer die Schnellwahl benutzt, hat Profi eingeschaltet und weiß, welche
 * Maschine er will; ihm einen Zwischenschritt zu geben, nähme ihr genau das,
 * wofür sie da ist. Wer in der Übersicht sucht, will erst sehen.
 *
 * Der ⓘ-Knopf bleibt deshalb hier — anders als in der Übersicht, wo er
 * entfallen ist, weil dort Zeile und Knopf dasselbe täten. Hier tun sie
 * Verschiedenes: die Zeile lädt, der Knopf zeigt.
 *
 * Wer diese Liste einmal ganz entfernt, verliert damit nichts als den kurzen
 * Weg — die Maschinen stehen alle in der Übersicht darunter und in der Suche.
 *
 * Die Klasse hält keinen Phasenzustand; Fehlermeldung, Auffrischen und das
 * Öffnen der Maschinenansicht kommen über die deps hinein.
 */

import { getAllMachines, getMachine } from '@data/db.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import type { Machine } from '@data/types.js';

/** Phase-side behaviour the quick-select list needs. */
export interface QuickSelectDeps {
  /** Show an inline error message. */
  showError: (message: string) => void;
  /** Refresh the machine overview / quick-select lists. */
  refreshMachineLists: () => Promise<void>;
  /** Open the per-machine detail modal (ⓘ button). */
  showMachineDetail: (machine: Machine) => void;
  /** Load the machine directly (item tap). */
  onMachineSelect: (machine: Machine) => void;
}

export class QuickSelectList {
  constructor(private readonly deps: QuickSelectDeps) {}

  /** Load trained machines (newest first, max 10) and render the quick-select list. */
  public async load(): Promise<void> {
    try {
      // Get all machines from database
      const machines = await getAllMachines();

      // Filter machines that have at least one trained model
      const trainedMachines = machines.filter(
        (machine) => machine.referenceModels && machine.referenceModels.length > 0
      );

      // Sort by most recent training date (newest first)
      trainedMachines.sort((a, b) => {
        // Get latest training date for each machine (defensive: handle edge cases)
        const aLatestDate =
          a.referenceModels.length > 0
            ? Math.max(...a.referenceModels.map((m) => m.trainingDate || 0))
            : 0;
        const bLatestDate =
          b.referenceModels.length > 0
            ? Math.max(...b.referenceModels.map((m) => m.trainingDate || 0))
            : 0;
        return bLatestDate - aLatestDate;
      });

      // Render the quick select list (max 10 machines)
      this.renderQuickSelectList(trainedMachines.slice(0, 10));
    } catch (error) {
      logger.error('Failed to load machine history:', error);
      // Don't show error to user - just hide the quick select section
      this.hideQuickSelectSection();
    }
  }

  /**
   * Render quick select list with recent machines.
   */
  private renderQuickSelectList(machines: Machine[]): void {
    const quickSelectSection = document.getElementById('quick-select-section');
    const quickSelectList = document.getElementById('quick-select-list');

    if (!quickSelectSection || !quickSelectList) {
      logger.warn('Quick select elements not found in DOM');
      return;
    }

    // Hide section if no machines available
    if (machines.length === 0) {
      quickSelectSection.style.display = 'none';
      return;
    }

    // Show section
    quickSelectSection.style.display = 'block';

    // Clear existing list
    quickSelectList.innerHTML = '';

    // Render each machine
    machines.forEach((machine) => {
      const machineItem = document.createElement('div');
      machineItem.className = 'quick-select-item';
      machineItem.dataset.machineId = machine.id;

      // Create machine info
      const machineInfo = document.createElement('div');
      machineInfo.className = 'quick-select-item-info';

      const machineName = document.createElement('div');
      machineName.className = 'quick-select-machine-name';
      machineName.textContent = machine.name;

      const machineId = document.createElement('div');
      machineId.className = 'quick-select-machine-id';
      machineId.textContent = machine.id;

      machineInfo.appendChild(machineName);
      machineInfo.appendChild(machineId);

      // Create chevron icon
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('width', '20');
      chevron.setAttribute('height', '20');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2');
      chevron.style.color = 'var(--text-muted)';
      chevron.style.flexShrink = '0';

      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', '9 18 15 12 9 6');
      chevron.appendChild(polyline);

      // ⓘ zeigt die Maschine, der Zeilen-Tipp lädt sie — beides mit Absicht,
      // s. Kopfkommentar. In der Maschinenübersicht ist dieser Knopf entfallen,
      // weil dort die Zeile schon zeigt.
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'machine-details-btn';
      detailsBtn.setAttribute('aria-label', t('identify.machineDetails'));
      detailsBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`;
      detailsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.openDetails(machine);
      });

      // Assemble item
      machineItem.appendChild(machineInfo);
      machineItem.appendChild(detailsBtn);
      machineItem.appendChild(chevron);

      // Add click handler
      machineItem.addEventListener('click', () => this.handleQuickSelect(machine));

      // Add to list
      quickSelectList.appendChild(machineItem);
    });
  }

  /**
   * Antippen lädt die Maschine in den Prüf-Ablauf.
   *
   * Das ist der Unterschied zur Maschinenübersicht, wo derselbe Tipp die
   * Maschinenansicht öffnet — festgeschrieben am 14.08.2026, Begründung im
   * Kopfkommentar. Auskunft gibt hier der ⓘ-Knopf (openDetails).
   */
  private async handleQuickSelect(machine: Machine): Promise<void> {
    try {
      logger.info(`Quick select: ${machine.name} (${machine.id})`);

      // Reload machine from DB to get latest state
      const freshMachine = await getMachine(machine.id);
      if (!freshMachine) {
        this.deps.showError(t('identify.errors.machineNotFound'));
        await this.deps.refreshMachineLists();
        return;
      }

      this.deps.onMachineSelect(freshMachine);
    } catch (error) {
      logger.error('Failed to quick select machine:', error);
      this.deps.showError(t('identify.errors.machineLoad'));
    }
  }

  /** Detail-Modal für einen Eintrag öffnen (ⓘ-Button). */
  private async openDetails(machine: Machine): Promise<void> {
    try {
      const freshMachine = await getMachine(machine.id);
      if (!freshMachine) {
        this.deps.showError(t('identify.errors.machineNotFound'));
        await this.deps.refreshMachineLists();
        return;
      }
      this.deps.showMachineDetail(freshMachine);
    } catch (error) {
      logger.error('Failed to open machine details:', error);
      this.deps.showError(t('identify.errors.machineLoad'));
    }
  }

  /**
   * Hide quick select section.
   */
  private hideQuickSelectSection(): void {
    const quickSelectSection = document.getElementById('quick-select-section');
    if (quickSelectSection) {
      quickSelectSection.style.display = 'none';
    }
  }
}
