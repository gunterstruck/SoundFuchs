/**
 * ZANOBOT - MACHINE DETAIL MODAL
 *
 * The per-machine detail modal extracted from the Identify phase: shows the
 * machine's acoustic fingerprint, its trained reference models / signatures
 * (with promote-to-Baseline and delete actions), a "select this machine"
 * button, and a history entry point.
 *
 * Holds no phase state; the select/notify/refresh/history touch-points are
 * injected via the deps interface. Operates on the static #machine-detail-modal
 * DOM that already exists in index.html.
 */

import {
  getMachine,
  getLatestDiagnosis,
  getDiagnosesForMachine,
  deleteReferenceModel,
  promoteToBaseline,
} from '@data/db.js';
import { ReferenceDbService } from '@data/ReferenceDbService.js';
import { notify } from '@utils/notifications.js';
import { t, getLocale } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { renderMachineFingerprint } from '../components/MachineFingerprint.js';
import { getReferenceIrisVector } from './referenceIris.js';
import { getAverageBaselineScore, getBaselineRating } from './machineStatus.js';
import { getHistoryStatusClass } from './historyRender.js';
import { calculateMedian } from './fleetStats.js';
import type { Machine, DiagnosisResult } from '@data/types.js';
import { isGMIAModel } from '@data/types.js';

/** Phase-side behaviour the machine detail modal needs. */
export interface MachineDetailDeps {
  /** Remember the machine as the current one. */
  setCurrentMachine: (machine: Machine) => void;
  /** Proceed with the selected machine (continue the app flow). */
  onMachineSelected: (machine: Machine) => void;
  /** Show a transient notification. */
  showNotification: (message: string) => void;
  /** Refresh the machine overview / quick-select lists. */
  refreshMachineLists: () => Promise<void>;
  /** Open the per-machine diagnosis history modal. */
  showHistory: (machine: Machine) => void;
  /** Relative time string (e.g. "2 days ago") for a timestamp. */
  formatRelativeTime: (timestamp: number) => string;
}

export class MachineDetailModal {
  constructor(private readonly deps: MachineDetailDeps) {}

  /** Wire the static modal's close affordances (called once at phase init). */
  public init(): void {
    const modal = document.getElementById('machine-detail-modal');
    const closeBtn = document.getElementById('close-machine-detail-modal');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Close on backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.close();
        }
      });
    }
  }

  /**
   * Show machine detail modal with reference models / signatures.
   */
  public show(machine: Machine): void {
    const modal = document.getElementById('machine-detail-modal');
    const nameEl = document.getElementById('machine-detail-name');
    const idEl = document.getElementById('machine-detail-id');
    const signaturesContainer = document.getElementById('machine-detail-signatures');
    const selectBtn = document.getElementById('machine-detail-select-btn');

    if (!modal || !nameEl || !idEl || !signaturesContainer || !selectBtn) {
      logger.warn('Machine detail modal elements not found');
      // Fallback: direct selection
      this.deps.setCurrentMachine(machine);
      this.deps.onMachineSelected(machine);
      return;
    }

    // Set machine info
    nameEl.textContent = machine.name;
    idEl.textContent = machine.id;

    // Acoustic fingerprint "portrait" for this machine (radial signature of
    // its reference spectrum), shown prominently above the name.
    const infoEl = modal.querySelector('.machine-detail-info');
    infoEl?.querySelector('.machine-detail-fingerprint')?.remove();
    const fpModel =
      (machine.referenceModels || []).find((m) => m.label === 'Baseline') ||
      (machine.referenceModels || [])[0];
    if (infoEl && fpModel && isGMIAModel(fpModel) && fpModel.weightVector.length) {
      const fpCanvas = document.createElement('canvas');
      fpCanvas.className = 'machine-detail-fingerprint';
      fpCanvas.setAttribute('aria-hidden', 'true');
      infoEl.insertBefore(fpCanvas, infoEl.firstChild);
      // Prefer the reference sound's spectrum (distinctive per machine)
      void getReferenceIrisVector(machine).then((vector) => {
        if (vector) requestAnimationFrame(() => renderMachineFingerprint(fpCanvas, vector));
      });
    }

    // Health status summary (last result + trend + reference quality),
    // inserted above the trained-states list. Filled asynchronously.
    void this.renderStatusSummary(machine, signaturesContainer);

    void this.renderTimeline(machine);

    // Render signatures / reference models
    this.renderSignatures(signaturesContainer, machine);

    // Wire up select button (remove old listeners by cloning)
    const newSelectBtn = selectBtn.cloneNode(true) as HTMLButtonElement;
    selectBtn.parentNode!.replaceChild(newSelectBtn, selectBtn);

    // Der Knopf trägt den nächsten Schritt, nicht die Technik dahinter. Wohin
    // er führt, entscheidet ohnehin der Bestand an Referenzen (s. Router,
    // onMachineSelected): mit Referenz die Prüf-Sektion, ohne sie die Aufnahme.
    // Stand hier „Maschine laden", versprach der Knopf einer Maschine ohne
    // Referenz eine Prüfung, die es noch gar nicht geben kann.
    const hatReferenz = (machine.referenceModels?.length ?? 0) > 0;
    newSelectBtn.textContent = hatReferenz
      ? t('identify.machineDetail.startCheck')
      : t('identify.machineDetail.startRecording');

    newSelectBtn.addEventListener('click', () => {
      this.close();
      this.deps.showNotification(t('identify.success.machineLoaded', { name: machine.name }));
      this.deps.setCurrentMachine(machine);
      this.deps.onMachineSelected(machine);
    });

    // History entry point: re-open past checks (and listen to them) from here.
    // Only shown when the machine has at least one check.
    const actions = modal.querySelector('.machine-detail-actions');
    actions?.querySelector('.machine-detail-history-btn')?.remove();
    if (actions && machine.lastDiagnosisAt) {
      const histBtn = document.createElement('button');
      histBtn.type = 'button';
      histBtn.className = 'action-btn secondary-btn machine-detail-history-btn';
      histBtn.textContent = t('history.viewHistory');
      histBtn.addEventListener('click', () => {
        this.close();
        this.deps.showHistory(machine);
      });
      actions.insertBefore(histBtn, actions.firstChild);
    }

    this.renderShareCollectionButton(actions, machine);

    // Show modal
    modal.style.display = 'flex';
    logger.info(`Machine detail modal opened for: ${machine.name} (${machine.id})`);
  }

  /**
   * Build the compact health-status summary shown above the trained states:
   * last result (score + status colour), when it was last checked + trend
   * arrow, and the reference-quality badge. All from data we already have.
   */
  private async renderStatusSummary(
    machine: Machine,
    signaturesContainer: HTMLElement
  ): Promise<void> {
    const parent = signaturesContainer.parentElement;
    if (!parent) return;

    // Remove a previous summary (the modal DOM is reused across machines)
    parent.querySelector('.machine-detail-status')?.remove();

    const summary = document.createElement('div');
    summary.className = 'machine-detail-status';

    const latest = await getLatestDiagnosis(machine.id);

    // Primary row: score chip + status label (or "not checked yet")
    const primary = document.createElement('div');
    primary.className = 'mds-primary';
    if (latest) {
      const status = latest.status; // 'healthy' | 'uncertain' | 'faulty'
      const score = document.createElement('span');
      score.className = `mds-score status-${status}`;
      score.textContent = `${Math.round(latest.healthScore)}%`;
      const label = document.createElement('span');
      label.className = 'mds-status-label';
      label.textContent = t(`status.${status}`);
      primary.appendChild(score);
      primary.appendChild(label);

      // Trend arrow vs. the median of the previous checks (same logic as dashboard)
      const recent = await getDiagnosesForMachine(machine.id, 6);
      if (recent.length >= 2) {
        const older = recent.slice(1).map((d) => d.healthScore);
        const delta = latest.healthScore - calculateMedian(older);
        if (Math.abs(delta) > 3) {
          const trend = document.createElement('span');
          trend.className = `mds-trend ${delta > 0 ? 'trend-improving' : 'trend-declining'}`;
          trend.textContent = delta > 0 ? `↗ +${delta.toFixed(0)}%` : `↘ ${delta.toFixed(0)}%`;
          primary.appendChild(trend);
        }
      }
    } else {
      const label = document.createElement('span');
      label.className = 'mds-status-label mds-not-checked';
      label.textContent = t('status.notChecked');
      primary.appendChild(label);
    }
    summary.appendChild(primary);

    // Meta row: last-checked time + reference-quality badge
    const meta = document.createElement('div');
    meta.className = 'mds-meta';
    if (latest) {
      const when = document.createElement('span');
      when.textContent = t('dashboard.lastCheck', {
        time: this.deps.formatRelativeTime(latest.timestamp),
      });
      meta.appendChild(when);
    }
    if (machine.referenceModels && machine.referenceModels.length > 0) {
      const rating = getBaselineRating(getAverageBaselineScore(machine));
      const badge = document.createElement('span');
      badge.className = `mds-ref-badge ref-quality-${rating}`;
      badge.textContent = t(`reference.quality.${rating}`);
      meta.appendChild(badge);
    }
    if (meta.childElementCount > 0) summary.appendChild(meta);

    // Vor den Zeitstrahl, nicht dahinter: Die Zusammenfassung beantwortet
    // „wie steht es jetzt?", der Zeitstrahl „wie war es davor?". Stand sie
    // darunter, las man den neuesten Wert zweimal kurz hintereinander — einmal
    // als obersten Punkt des Zeitstrahls, einmal als Überschrift —, und die
    // Antwort auf die erste Frage kam nach der Antwort auf die zweite.
    const zeitstrahl = parent.querySelector('#machine-detail-timeline');
    parent.insertBefore(summary, zeitstrahl ?? signaturesContainer);
  }

  /**
   * „Sammlung teilen" — die Referenzen dieser Maschine als Datei herausgeben,
   * damit sie unter `<sammlung>/db-latest.json` veröffentlicht werden können
   * (Format und Ablauf: `docs/geteilte-referenzen.md`).
   *
   * Hier und nicht in den Einstellungen, weil eine Sammlung zu EINER Maschine
   * gehört: der Knopf steht neben den Referenzen, die er weitergibt. Der
   * Einstellungs-Knopf „Datenbank exportieren" bleibt, was er ist — eine
   * vollständige App-Sicherung, kein teilbarer Maßstab.
   *
   * Erscheint nur, wenn es etwas zu teilen gibt. Ein Knopf, der „keine Referenz
   * vorhanden" antwortet, ist eine Falle, keine Auskunft.
   */
  private renderShareCollectionButton(actions: Element | null, machine: Machine): void {
    actions?.querySelector('.machine-detail-share-btn')?.remove();
    if (!actions) return;
    if (!machine.referenceModels?.length) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn secondary-btn machine-detail-share-btn';
    btn.textContent = t('shareCollection.button');
    btn.title = t('shareCollection.hint');

    let busy = false;
    btn.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      const label = btn.textContent;
      btn.textContent = t('shareCollection.working');
      // `shareExport` versucht die Teilen-Funktion des Systems und fällt selbst
      // auf einen Download zurück (auch wenn der Nutzer NICHT abbricht — dann
      // gibt es weder Datei noch Fehler, deshalb wird hier nichts gemeldet,
      // was nicht sicher stimmt).
      void ReferenceDbService.shareExport(machine.id)
        .then((ok) => {
          if (ok) {
            notify.success(t('shareCollection.done'), { title: t('shareCollection.doneTitle') });
          }
        })
        .catch((error) => {
          logger.warn('Sharing the reference collection failed:', error);
          notify.error(t('shareCollection.failed'));
        })
        .finally(() => {
          busy = false;
          btn.textContent = label;
        });
    });

    actions.insertBefore(btn, actions.firstChild);
  }

  /**
   * Render reference model / signature list inside the machine detail modal.
   */
  /**
   * Kurzer Zeitstrahl der letzten Prüfungen.
   *
   * Dieselbe Bauweise wie im Verlaufsdialog — durchgehende Linie, Punkt in der
   * Farbe des Zustands, neueste oben. Hier bewusst nur fünf Einträge und ohne
   * Aufklappen: Er soll die erste Frage beantworten („wie war es zuletzt?"),
   * nicht den vollen Verlauf ersetzen. Der liegt mit Diagramm, A/B-Hören und
   * 3D-Gebirge einen Tipp entfernt.
   *
   * Gemeinsam ist beiden die Statusklasse aus historyRender; damit stimmen die
   * Farben überein, ohne dass jemand sie an zwei Stellen pflegen muss.
   */
  private async renderTimeline(machine: Machine): Promise<void> {
    const container = document.getElementById('machine-detail-timeline');
    if (!container) return;
    container.innerHTML = '';

    let diagnoses: DiagnosisResult[] = [];
    try {
      diagnoses = await getDiagnosesForMachine(machine.id, 5);
    } catch (error) {
      logger.warn('Zeitstrahl: Prüfungen konnten nicht gelesen werden', error);
      return;
    }
    if (diagnoses.length === 0) return;

    const titel = document.createElement('p');
    titel.className = 'machine-detail-timeline-title';
    titel.textContent = t('history.viewHistory');
    container.appendChild(titel);

    for (const d of diagnoses) {
      const eintrag = document.createElement('div');
      eintrag.className = `history-list-item ${getHistoryStatusClass(d.healthScore, d.status)}`;

      const kopf = document.createElement('div');
      kopf.className = 'history-item-header';

      const datum = document.createElement('span');
      datum.className = 'history-item-date';
      datum.textContent = this.deps.formatRelativeTime(d.timestamp);

      const wert = document.createElement('span');
      wert.className = `history-item-score ${getHistoryStatusClass(d.healthScore, d.status)}`;
      wert.textContent = `${Math.round(d.healthScore)}%`;

      const zustand = document.createElement('span');
      zustand.className = 'history-item-status';
      zustand.textContent = t(`status.${d.status ?? 'uncertain'}`);

      kopf.append(datum, wert, zustand);
      eintrag.appendChild(kopf);
      container.appendChild(eintrag);
    }

    const mehr = document.createElement('button');
    mehr.type = 'button';
    mehr.className = 'machine-detail-timeline-more';
    mehr.textContent = t('history.fullHistory');
    mehr.addEventListener('click', () => this.deps.showHistory(machine));
    container.appendChild(mehr);
  }

  private renderSignatures(container: HTMLElement, machine: Machine): void {
    container.innerHTML = '';

    const title = document.createElement('h5');
    title.textContent = t('reference.trainedStates');
    container.appendChild(title);

    const models = machine.referenceModels;

    if (!models || models.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'machine-detail-empty';
      empty.textContent = t('reference.noModels');
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'machine-detail-signature-list';

    models.forEach((model) => {
      const li = document.createElement('li');
      li.className = 'machine-detail-signature-item';

      // Info section
      const info = document.createElement('div');
      info.className = 'machine-detail-signature-info';

      const displayName =
        model.label === 'Baseline'
          ? t('reference.labels.baseline')
          : model.label || t('reference.unnamed', { index: String(list.children.length + 1) });

      const label = document.createElement('div');
      label.className = 'machine-detail-signature-label';
      label.textContent = displayName;

      const date = document.createElement('div');
      date.className = 'machine-detail-signature-date';
      date.textContent = model.trainingDate
        ? new Date(model.trainingDate).toLocaleString(getLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      info.appendChild(label);
      info.appendChild(date);

      // Type badge
      const typeBadge = document.createElement('span');
      typeBadge.className = `machine-detail-signature-type type-${model.type}`;
      typeBadge.textContent = model.type === 'healthy' ? 'OK' : model.type;

      // Promote-to-Baseline button: lets the user pick a different recording as
      // "the" primary reference (e.g. when the current Baseline came from an
      // NFC import with no backing audio). Not shown for the current Baseline.
      let promoteBtn: HTMLButtonElement | null = null;
      if (model.label !== 'Baseline') {
        promoteBtn = document.createElement('button');
        promoteBtn.className = 'machine-detail-baseline-btn';
        promoteBtn.setAttribute('aria-label', t('reference.makeBaseline'));
        promoteBtn.title = t('reference.makeBaseline');
        promoteBtn.textContent = '⭐';
        promoteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const result = await promoteToBaseline(
            machine.id,
            model.label || '',
            t('reference.labels.formerBaseline')
          );
          if (result !== undefined) {
            notify.success(t('reference.baselinePromoted', { name: displayName }));
            // Reload machine and re-render the modal
            const updated = await getMachine(machine.id);
            if (updated) {
              this.renderSignatures(container, updated);
              // Also refresh the overview lists (ghost overlay etc. depend on Baseline)
              await this.deps.refreshMachineLists();
            }
          }
        });
      }

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'machine-detail-delete-btn';
      deleteBtn.setAttribute('aria-label', t('reference.deleteModel'));
      deleteBtn.textContent = '🗑️';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = confirm(t('reference.confirmDeleteModel', { name: model.label || '' }));
        if (!confirmed) return;

        const deleted = await deleteReferenceModel(machine.id, model.label || '');
        if (deleted) {
          notify.success(t('reference.modelDeleted', { name: model.label || '' }));
          // Reload machine and re-render the modal
          const updated = await getMachine(machine.id);
          if (updated) {
            this.renderSignatures(container, updated);
            // Also refresh the overview lists
            await this.deps.refreshMachineLists();
          }
        }
      });

      li.appendChild(info);
      li.appendChild(typeBadge);
      if (promoteBtn) li.appendChild(promoteBtn);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  /** Close machine detail modal. */
  public close(): void {
    const modal = document.getElementById('machine-detail-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
}
