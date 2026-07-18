/**
 * ZANOBOT - MACHINE OVERVIEW RENDERER
 *
 * Builds the per-machine cards of the Identify phase's machine overview list
 * (status dot/label, reference-quality badge, lazy sparkline, history link,
 * delete button, and the acoustic fingerprint iris) plus the batched, lazy
 * sparkline loader. Extracted from 1-Identify.ts.
 *
 * The phase still owns the list container, the empty-state, and the
 * series/fleet mode branch; it delegates the heavy per-card DOM construction
 * here. Phase-side behaviour (status labels, relative time, navigation,
 * refresh, history) is injected via the deps interface so this renderer holds
 * no phase state.
 */

import {
  getLatestDiagnosis,
  getRecordingsForMachine,
  deleteMachine,
  getAllMachines,
  saveMachine,
  getMachine,
  getDiagnosesForMachine,
} from '@data/db.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { renderMachineFingerprint } from '../components/MachineFingerprint.js';
import { generateSparkline } from './historyRender.js';
import { getAverageBaselineScore, getBaselineRating } from './machineStatus.js';
import { getReferenceIrisVector } from './referenceIris.js';
import type { Machine, DiagnosisResult } from '@data/types.js';
import { isGMIAModel } from '@data/types.js';

/** Phase-side behaviour the overview renderer needs. */
export interface MachineOverviewDeps {
  /** Localized status label for a diagnosis status. */
  getStatusLabel: (status: DiagnosisResult['status']) => string;
  /** Relative time string (e.g. "2 days ago") for a timestamp. */
  formatRelativeTime: (timestamp: number) => string;
  /** Open a machine (card click). */
  onMachineSelect: (machine: Machine) => void;
  /** Reload all machine lists (after a delete). */
  onRefresh: () => Promise<void>;
  /** Open the per-machine history modal. */
  showHistory: (machine: Machine) => void;
  /** Open the per-machine detail modal (⭐/Löschen/Verlauf) via ⓘ button. */
  showDetails: (machine: Machine) => void;
}

export class MachineOverviewRenderer {
  constructor(private readonly deps: MachineOverviewDeps) {}

  /**
   * Create a machine overview item element.
   */
  public async createItem(machine: Machine): Promise<HTMLElement> {
    const machineItem = document.createElement('div');
    machineItem.className = 'machine-item';
    machineItem.dataset.machineId = machine.id;

    // Get latest diagnosis for status
    const latestDiagnosis = await getLatestDiagnosis(machine.id);

    // Determine status and label
    let statusClass = 'status-no-data';
    let statusLabel = t('status.noData');
    let timeLabel = t('status.notChecked');

    if (latestDiagnosis) {
      statusClass = `status-${latestDiagnosis.status}`;
      statusLabel = this.deps.getStatusLabel(latestDiagnosis.status);
      timeLabel = `Letzte Prüfung ${this.deps.formatRelativeTime(latestDiagnosis.timestamp)}`;
    } else if (machine.referenceModels && machine.referenceModels.length > 0) {
      // Has reference models but no diagnosis yet
      statusLabel = t('status.ready');
      statusClass = 'status-ready';
      timeLabel = t('identify.statesTrained', { count: String(machine.referenceModels.length) });
    }

    // Create machine info
    const machineInfo = document.createElement('div');
    machineInfo.className = 'machine-info';

    const machineName = document.createElement('h4');
    machineName.className = 'machine-name';

    // Welle 1 UX: Status dot next to machine name
    const statusDot = document.createElement('span');
    statusDot.className = 'machine-status-dot';
    if (latestDiagnosis) {
      if (latestDiagnosis.healthScore >= 75) {
        statusDot.classList.add('status-dot-healthy');
        statusDot.setAttribute('aria-label', t('machineList.statusHealthy'));
      } else if (latestDiagnosis.healthScore >= 50) {
        statusDot.classList.add('status-dot-warning');
        statusDot.setAttribute('aria-label', t('machineList.statusWarning'));
      } else {
        statusDot.classList.add('status-dot-critical');
        statusDot.setAttribute('aria-label', t('machineList.statusCritical'));
      }
    } else {
      statusDot.classList.add('status-dot-unknown');
      statusDot.setAttribute('aria-label', t('machineList.statusUnknown'));
    }
    machineName.appendChild(statusDot);
    machineName.appendChild(document.createTextNode(machine.name));

    const machineStatus = document.createElement('p');
    machineStatus.className = `machine-status ${statusClass}`;
    machineStatus.textContent = statusLabel;

    const machineTime = document.createElement('p');
    machineTime.className = 'machine-time';
    machineTime.textContent = timeLabel;

    machineInfo.appendChild(machineName);
    machineInfo.appendChild(machineStatus);
    machineInfo.appendChild(machineTime);

    // Sprint 3 UX: Reference quality badge
    if (machine.referenceModels && machine.referenceModels.length > 0) {
      const avgBaseline = getAverageBaselineScore(machine);
      const rating = getBaselineRating(avgBaseline);
      const badgeEl = document.createElement('span');
      badgeEl.className = `ref-quality-badge ref-quality-${rating}`;
      badgeEl.textContent = t(`reference.quality.${rating}`);
      badgeEl.setAttribute(
        'aria-label',
        t('reference.quality.ariaLabel', {
          rating: t(`reference.quality.${rating}`),
        })
      );
      machineInfo.appendChild(badgeEl);
    }

    // Sprint 3 UX: Sparkline container (filled lazily after render)
    const sparkContainer = document.createElement('div');
    sparkContainer.className = 'sparkline-container';
    sparkContainer.dataset.machineId = machine.id;
    machineInfo.appendChild(sparkContainer);

    // Welle 3: History link below sparkline (visible for machines with ≥ 1 diagnosis)
    if (machine.lastDiagnosisAt) {
      const historyLink = document.createElement('button');
      historyLink.className = 'machine-history-link';
      historyLink.textContent = t('history.viewHistory');
      historyLink.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deps.showHistory(machine);
      });
      machineInfo.appendChild(historyLink);
    }

    // Create chevron icon
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'chevron-right');
    chevron.setAttribute('width', '24');
    chevron.setAttribute('height', '24');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    chevron.appendChild(polyline);

    // Sprint 1 UX: Delete button on machine card
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'machine-delete-btn';
    deleteBtn.setAttribute('aria-label', t('identify.deleteMachine'));
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>`;

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Don't trigger machine select

      const confirmed = confirm(t('identify.confirmDeleteMachine', { name: machine.name }));
      if (!confirmed) return;

      // Double confirmation for machines with recordings
      const recordings = await getRecordingsForMachine(machine.id);
      if (recordings.length > 0) {
        const doubleConfirm = confirm(
          t('identify.confirmDeleteMachineWithData', {
            name: machine.name,
            count: String(recordings.length),
          })
        );
        if (!doubleConfirm) return;
      }

      await deleteMachine(machine.id);

      // Sprint 5 Fix: Clean up Gold-Standard references pointing to deleted machine
      const allMachines = await getAllMachines();
      let goldStandardOrphans = 0;
      for (const m of allMachines) {
        if (m.fleetReferenceSourceId === machine.id) {
          m.fleetReferenceSourceId = null;
          await saveMachine(m);
          goldStandardOrphans++;
        }
      }
      if (goldStandardOrphans > 0) {
        logger.info(
          `Cleared Gold-Standard reference on ${goldStandardOrphans} machines after deleting ${machine.name}`
        );
        notify.warning(
          t('fleet.goldStandard.deleted', {
            name: machine.name,
            count: String(goldStandardOrphans),
          })
        );
      }

      notify.success(t('identify.machineDeleted', { name: machine.name }));
      await this.deps.onRefresh();
    });

    // Step 3: acoustic fingerprint "portrait" – a radial signature of the
    // machine's reference spectrum. Only shown when a reference model with a
    // weight vector exists.
    const fingerprintModel =
      (machine.referenceModels || []).find((m) => m.label === 'Baseline') ||
      (machine.referenceModels || [])[0];
    if (fingerprintModel && isGMIAModel(fingerprintModel) && fingerprintModel.weightVector.length) {
      const fpCanvas = document.createElement('canvas');
      fpCanvas.className = 'machine-fingerprint';
      fpCanvas.setAttribute('aria-hidden', 'true');
      machineItem.appendChild(fpCanvas);
      // Prefer the reference sound's spectrum (distinctive per machine), fall
      // back to the model weight vector. Rendered after insertion (canvas size).
      void getReferenceIrisVector(machine).then((vector) => {
        if (vector) requestAnimationFrame(() => renderMachineFingerprint(fpCanvas, vector));
      });
    }

    // UX: ⓘ-Button — Detail-Modal (⭐/Löschen/Verlauf) bleibt erreichbar,
    // obwohl der Karten-Tap jetzt DIREKT lädt (kein Umweg mehr).
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
      e.stopPropagation(); // Karten-Tap (= Laden) nicht auslösen
      this.deps.showDetails(machine);
    });

    // Assemble item
    machineItem.appendChild(machineInfo);
    machineItem.appendChild(detailsBtn);
    machineItem.appendChild(deleteBtn);
    machineItem.appendChild(chevron);

    // Add click handler
    machineItem.addEventListener('click', () => this.deps.onMachineSelect(machine));

    return machineItem;
  }

  /**
   * Sprint 3 UX: Load sparklines for all visible machine cards (lazy, batched).
   */
  public async loadSparklines(): Promise<void> {
    const containers = Array.from(
      document.querySelectorAll('.sparkline-container[data-machine-id]')
    ) as HTMLElement[];

    const BATCH_SIZE = 3;
    for (let i = 0; i < containers.length; i += BATCH_SIZE) {
      const batch = containers.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (container) => {
          const machineId = container.dataset.machineId;
          if (!machineId) return;

          try {
            // Sprint 3 Polish: Skip if sparkline already rendered
            if (container.querySelector('.sparkline-svg')) return;

            const diagnoses = await getDiagnosesForMachine(machineId, 10);
            if (diagnoses.length >= 2) {
              const scores = [...diagnoses].reverse().map((d) => d.healthScore);
              const sparkline = generateSparkline(scores);
              if (sparkline) {
                // Sprint 3 Polish: Clear container before appending to prevent duplicates
                container.textContent = '';
                container.appendChild(sparkline);

                // Welle 3: Make sparkline tappable to open history
                container.style.cursor = 'pointer';
                container.setAttribute('role', 'button');
                const machineItem = container.closest('.machine-item');
                const machineName = machineItem?.querySelector('.machine-name')?.textContent || '';
                container.setAttribute(
                  'aria-label',
                  t('history.openHistory', { name: machineName })
                );
                container.addEventListener('click', (e) => {
                  e.stopPropagation(); // Don't trigger machine selection
                  getMachine(machineId).then((machine) => {
                    if (machine) this.deps.showHistory(machine);
                  });
                });
              }
            }
          } catch (error) {
            logger.warn(`Could not load sparkline for ${machineId}:`, error);
          }
        })
      );
    }
  }
}
