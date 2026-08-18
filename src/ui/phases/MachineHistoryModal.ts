/**
 * ZANOBOT - MACHINE HISTORY MODAL
 *
 * Per-machine diagnosis history modal extracted from the Identify phase.
 * Self-contained: holds no phase state, depends only on its `show(machine)`
 * argument plus shared db / i18n / export helpers. Shows the diagnosis history
 * chart, a trend banner, time/abnormal filters, a tappable list of past checks,
 * a CSV export, and an A/B listen panel for re-opening stored measurements.
 */

import { getDiagnosesForMachine, getRecordingsForMachine, getRecording } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { escapeHtml } from '@utils/sanitize.js';
import { analyzeTrend } from '@utils/trendAnalysis.js';
import { exportAsCSV, type ReportData, type ReportEntry } from '@utils/reportExport.js';
import { ListenPanel } from '../components/ListenPanel.js';
import { SpectrumComparison } from '../components/SpectrumComparison.js';
import { Spectrogram3DPanel } from '../components/Spectrogram3DPanel.js';
import { buildResultCardBlob, shareResultImage } from '@utils/resultShareImage.js';
import { getViewLevel, isViewLevelAtLeast } from '@utils/viewLevelSettings.js';
import { generateHistoryChart, getHistoryStatusClass } from './historyRender.js';
import type { Machine, DiagnosisResult } from '@data/types.js';

export class MachineHistoryModal {
  /**
   * Welle 3: Show the per-machine diagnosis history modal (chart, trend banner,
   * filters, list, CSV export).
   */
  public async show(machine: Machine): Promise<void> {
    const diagnoses = await getDiagnosesForMachine(machine.id);

    if (diagnoses.length === 0) {
      notify.info(t('history.noDiagnoses', { name: machine.name }));
      return;
    }

    // Which past checks still have stored measurement audio (→ can be listened to)
    let audioIds = new Set<string>();
    try {
      const recordings = await getRecordingsForMachine(machine.id);
      audioIds = new Set(recordings.filter((r) => r.type === 'diagnosis').map((r) => r.id));
    } catch (error) {
      logger.warn('Could not load recordings for history listen:', error);
    }

    // Build modal (dynamic DOM, consistent with Fleet-Result-Modal pattern)
    const overlay = document.createElement('div');
    overlay.className = 'fleet-result-overlay';

    const modal = document.createElement('div');
    modal.className = 'fleet-result-modal history-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', t('history.viewHistory'));

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'fleet-result-header';

    const titleContainer = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = machine.name;
    const subtitle = document.createElement('p');
    subtitle.className = 'history-subtitle';
    subtitle.textContent = t('history.diagnosisCount', { count: String(diagnoses.length) });
    titleContainer.appendChild(title);
    titleContainer.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fleet-result-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', t('buttons.close'));

    header.appendChild(titleContainer);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // --- Body ---
    const body = document.createElement('div');
    body.className = 'fleet-result-body';

    // Chart Section
    const chartSection = document.createElement('div');
    chartSection.className = 'history-chart-section';
    const chartSvg = generateHistoryChart(diagnoses.slice(0, 30));
    chartSection.appendChild(chartSvg);
    body.appendChild(chartSection);

    // Welle 4: Trend analysis banner
    const trend = analyzeTrend(diagnoses, t);
    if (trend && (trend.category === 'declining' || trend.category === 'critical_decline')) {
      const banner = document.createElement('div');
      banner.className = `history-trend-banner ${trend.category === 'critical_decline' ? 'trend-critical' : 'trend-declining'}`;
      banner.innerHTML = `
        <span class="trend-warning-icon">${trend.category === 'critical_decline' ? '🔴' : '🟡'}</span>
        <span>${escapeHtml(trend.message)}</span>
      `;
      body.appendChild(banner);
    }

    // Filter Section
    const filterSection = document.createElement('div');
    filterSection.className = 'history-filter-section';

    const filters = [
      { key: 'all', label: t('history.filterAll') },
      { key: '7d', label: t('history.filter7d') },
      { key: '30d', label: t('history.filter30d') },
      { key: 'abnormal', label: t('history.filterAbnormal') },
    ];

    let activeFilter = 'all';

    for (const filter of filters) {
      const btn = document.createElement('button');
      btn.className = `history-filter-btn ${filter.key === 'all' ? 'active' : ''}`;
      btn.textContent = filter.label;
      btn.addEventListener('click', () => {
        filterSection
          .querySelectorAll('.history-filter-btn')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = filter.key;
        this.renderHistoryList(listSection, diagnoses, activeFilter, machine, audioIds);
      });
      filterSection.appendChild(btn);
    }
    body.appendChild(filterSection);

    // Diagnosis List
    const listSection = document.createElement('div');
    listSection.className = 'history-list-section';
    this.renderHistoryList(listSection, diagnoses, 'all', machine, audioIds);
    body.appendChild(listSection);

    // Welle 4: Export button at bottom of history modal
    const exportSection = document.createElement('div');
    exportSection.style.padding = 'var(--spacing-sm)';
    exportSection.style.textAlign = 'center';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'fleet-result-btn-history';
    exportBtn.textContent = '📄 ' + t('report.exportButton');
    exportBtn.addEventListener('click', () => {
      const histEntries: ReportEntry[] = diagnoses.map((d) => {
        // UX-Konsistenz: gespeicherter Status (wie in Liste + Karte)
        const statusText = t(`status.${d.status ?? 'uncertain'}`);
        return {
          machineName: machine.name,
          machineId: machine.id,
          score: d.healthScore,
          status: statusText,
          timestamp: d.timestamp,
          detectedState: (d.metadata as Record<string, unknown>)?.detectedState as
            | string
            | undefined,
        };
      });
      const histData: ReportData = {
        title: `${t('report.title')} – ${machine.name}`,
        date: new Date().toLocaleString(),
        entries: histEntries,
        summary: {
          total: diagnoses.length,
          healthy: diagnoses.filter((d) => d.healthScore >= 75).length,
          warning: diagnoses.filter((d) => d.healthScore >= 50 && d.healthScore < 75).length,
          critical: diagnoses.filter((d) => d.healthScore < 50).length,
          unchecked: 0,
        },
      };
      exportAsCSV(histData, `soundfuchs-history-${machine.name.replace(/[^a-z0-9]/gi, '_')}.csv`);
      notify.success(t('report.exported'));
    });
    exportSection.appendChild(exportBtn);
    body.appendChild(exportSection);

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers – escHandler must be removed on EVERY close path,
    // otherwise each modal open leaks a permanent document listener
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    const closeModal = () => {
      document.removeEventListener('keydown', escHandler);
      overlay.remove();
    };
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', escHandler);
    requestAnimationFrame(() => closeBtn.focus());
  }

  /**
   * Welle 3: Render filtered diagnosis list inside history modal.
   */
  private renderHistoryList(
    container: HTMLElement,
    allDiagnoses: DiagnosisResult[],
    filter: string,
    machine?: Machine,
    audioIds?: Set<string>
  ): void {
    container.innerHTML = '';

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    const filtered = allDiagnoses.filter((d) => {
      switch (filter) {
        case '7d':
          return now - d.timestamp <= SEVEN_DAYS;
        case '30d':
          return now - d.timestamp <= THIRTY_DAYS;
        case 'abnormal':
          return d.healthScore < 75;
        default:
          return true;
      }
    });

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-list-empty';
      empty.textContent = t('history.noMatchingDiagnoses');
      container.appendChild(empty);
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const d = filtered[i];
      const item = document.createElement('div');
      // Der Zustand steht am Eintrag selbst, nicht nur an der Zahl: Der
      // Zeitstrahl faerbt seinen Punkt danach, und CSS kommt an ein
      // Geschwisterelement nicht heran.
      item.className = `history-list-item ${getHistoryStatusClass(d.healthScore, d.status)}`;

      // Header row (always visible): Date + Score + Status
      const headerRow = document.createElement('div');
      headerRow.className = 'history-item-header';

      const dateEl = document.createElement('span');
      dateEl.className = 'history-item-date';
      dateEl.textContent = new Date(d.timestamp).toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      const scoreEl = document.createElement('span');
      scoreEl.className = `history-item-score ${getHistoryStatusClass(d.healthScore, d.status)}`;
      scoreEl.textContent = `${d.healthScore.toFixed(0)}%`;

      // UX-Konsistenz: GESPEICHERTER Status statt fester Score-Schwellen —
      // sonst widersprechen sich Verlaufsliste und Maschinen-Karte
      // („Normal" hier, „Abweichung" dort für dieselbe Prüfung).
      const statusEl = document.createElement('span');
      statusEl.className = 'history-item-status';
      statusEl.textContent = t(`status.${d.status ?? 'uncertain'}`);

      headerRow.appendChild(dateEl);
      headerRow.appendChild(scoreEl);
      headerRow.appendChild(statusEl);

      // Detail row (expandable on tap)
      const detailRow = document.createElement('div');
      detailRow.className = 'history-item-detail';
      detailRow.style.display = 'none';

      // Trend to previous
      if (i < filtered.length - 1) {
        const prev = filtered[i + 1]; // Next older diagnosis
        const delta = d.healthScore - prev.healthScore;
        const trendEl = document.createElement('span');
        trendEl.className = 'history-item-trend';
        if (Math.abs(delta) <= 3) {
          trendEl.textContent = `→ ${t('history.stableVsPrevious')}`;
        } else {
          trendEl.textContent =
            delta > 0
              ? `↗ +${delta.toFixed(0)}% ${t('history.vsPrevious')}`
              : `↘ ${delta.toFixed(0)}% ${t('history.vsPrevious')}`;
          trendEl.className += delta > 0 ? ' trend-improving' : ' trend-declining';
        }
        detailRow.appendChild(trendEl);
      }

      // Detected state (Multiclass label, if available)
      const detectedState = (d.metadata as Record<string, unknown>)?.detectedState as
        | string
        | undefined;
      if (detectedState && detectedState !== 'UNKNOWN' && detectedState !== 'Baseline') {
        const stateEl = document.createElement('span');
        stateEl.className = 'history-item-state';
        stateEl.textContent = `${t('history.detectedState')}: ${detectedState}`;
        detailRow.appendChild(stateEl);
      }

      // Re-open / listen to this past check (only when its audio was kept)
      if (machine && audioIds?.has(d.id)) {
        const listenBtn = document.createElement('button');
        listenBtn.className = 'history-item-listen-btn';
        listenBtn.textContent = '🔊 ' + t('diagnose.display.listenReopen');
        listenBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void this.showPastCheckListen(machine, d);
        });
        detailRow.appendChild(listenBtn);
      }

      // Toggle expand on tap
      headerRow.style.cursor = 'pointer';
      headerRow.addEventListener('click', () => {
        const isOpen = detailRow.style.display !== 'none';
        detailRow.style.display = isOpen ? 'none' : 'flex';
        item.classList.toggle('expanded', !isOpen);
      });

      item.appendChild(headerRow);
      item.appendChild(detailRow);
      container.appendChild(item);
    }
  }

  /**
   * Re-open a past check for listening: load the stored measurement audio of
   * that diagnosis plus the machine's reference audio, and show the A/B listen
   * panel (play either, isolate the difference, slower/faster) in a modal.
   */
  private async showPastCheckListen(machine: Machine, diagnosis: DiagnosisResult): Promise<void> {
    let measurement: AudioBuffer | null = null;
    let reference: AudioBuffer | null = null;
    try {
      const rec = await getRecording(diagnosis.id);
      measurement = rec?.audioBuffer ?? null;
      const recordings = await getRecordingsForMachine(machine.id);
      const ref = recordings
        .filter((r) => r.type === 'reference' && r.audioBuffer)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      reference = ref?.audioBuffer ?? null;
    } catch (error) {
      logger.warn('Could not load audio for past check:', error);
    }

    if (!measurement && !reference) {
      notify.info(t('diagnose.display.listenDifferenceTooShort'));
      return;
    }

    const panel = new ListenPanel({ reference, measurement, shareName: machine.name });

    // Lightweight modal hosting the listen panel
    const overlay = document.createElement('div');
    overlay.className = 'fleet-result-overlay';
    const modal = document.createElement('div');
    modal.className = 'fleet-result-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'fleet-result-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = machine.name;
    const subtitle = document.createElement('p');
    subtitle.className = 'history-subtitle';
    subtitle.textContent = new Date(diagnosis.timestamp).toLocaleString();
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fleet-result-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', t('buttons.close'));
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'fleet-result-body';
    body.style.padding = 'var(--spacing-md)';

    // UX: Prüfergebnis als Bild teilen — Werker→Meister läuft über
    // Messenger. Rendert eine Score-Karte (PNG) und öffnet das
    // System-Teilen-Sheet (Desktop: Download-Fallback).
    const shareRow = document.createElement('div');
    shareRow.className = 'spectro3d-toggle-row';
    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'listen-btn';
    shareBtn.textContent = `📤 ${t('share.resultButton')}`;
    shareBtn.onclick = () => {
      void (async () => {
        try {
          const blob = await buildResultCardBlob({
            machineName: machine.name,
            healthScore: diagnosis.healthScore,
            status: diagnosis.status,
            statusLabel: t(`status.${diagnosis.status ?? 'uncertain'}`),
            timestamp: diagnosis.timestamp,
            footerLabel: t('share.resultFooter'),
          });
          const date = new Date(diagnosis.timestamp).toISOString().slice(0, 10);
          await shareResultImage(blob, `zanobot-${machine.name}-${date}.png`);
        } catch (error) {
          logger.warn('Ergebnis-Teilen fehlgeschlagen:', error);
          notify.error(t('share.resultFailed'));
        }
      })();
    };
    shareRow.appendChild(shareBtn);
    body.appendChild(shareRow);

    body.appendChild(panel.element);

    // Expert mode: add a frequency comparison (reference ↔ measurement) below
    // the listen controls, so the audible difference can also be SEEN. Additive
    // and gated — basic/advanced users see exactly the panel they had before.
    let spectrum: SpectrumComparison | null = null;
    if (getViewLevel() === 'expert' && reference && measurement) {
      spectrum = new SpectrumComparison({ reference, measurement });
      if (spectrum.hasContent) {
        body.appendChild(spectrum.element);
      }
    }

    // 3D-Spektrogramm „Gebirge": Zeit × Frequenz × Intensität, per Finger
    // drehbar/zoombar, umschaltbar zwischen Messung, Referenz und Differenz.
    // Additiv und lazy — Matrix, WebGL und die spektrale Subtraktion entstehen
    // erst beim Tap auf den jeweiligen Chip.
    let spectro3d: Spectrogram3DPanel | null = null;
    if (isViewLevelAtLeast('advanced') && (measurement || reference)) {
      const panel = new Spectrogram3DPanel({ reference, measurement });
      if (panel.hasContent) {
        spectro3d = panel;
        body.appendChild(panel.element);
      }
    }

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    const close = () => {
      panel.destroy();
      spectrum?.destroy();
      spectro3d?.destroy();
      overlay.remove();
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
  }
}
