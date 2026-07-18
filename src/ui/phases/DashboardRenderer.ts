/**
 * ZANOBOT - STATUS DASHBOARD RENDERER
 *
 * Renders the Identify phase's status dashboard extracted from 1-Identify.ts:
 * the fleet status counts, the "needs attention" card (most urgent machine +
 * trend + check/maintenance actions), the per-machine trend warnings, and the
 * "export report for all machines" link (PDF/CSV format choice).
 *
 * Holds no phase state; relative-time formatting and starting a diagnosis are
 * injected via the deps interface.
 */

import { getAllMachines, getLatestDiagnosis, getDiagnosesForMachine } from '@data/db.js';
import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import { escapeHtml } from '@utils/sanitize.js';
import { analyzeTrend } from '@utils/trendAnalysis.js';
import {
  exportAsPrintablePDF,
  exportAsCSV,
  exportMaintenanceJSON,
  type ReportData,
  type ReportEntry,
} from '@utils/reportExport.js';
import { InfoBottomSheet } from '../components/InfoBottomSheet.js';
import { calculateMedian } from './fleetStats.js';
import type { Machine } from '@data/types.js';

/** Phase-side behaviour the dashboard needs. */
export interface DashboardDeps {
  /** Relative time string (e.g. "2 days ago") for a timestamp. */
  formatRelativeTime: (timestamp: number) => string;
  /** Start a diagnosis for the given machine (no-op when unset). */
  startDiagnosis: (machine: Machine) => void;
}

export class DashboardRenderer {
  constructor(private readonly deps: DashboardDeps) {}

  public async update(): Promise<void> {
    const dashboard = document.getElementById('status-dashboard');
    if (!dashboard) return;

    const machines = await getAllMachines();

    // UX (geführter Erst-Lauf): Ohne Maschinen gilt der Erststart-Modus —
    // die Karten stehen dann in Workflow-Reihenfolge (① Maschine wählen →
    // ② Normalzustand aufnehmen → ③ Zustand prüfen) mit Schritt-Badges,
    // statt der „Prüfen zuerst"-Anordnung für Wiederkehrer (Focus-Theme).
    document.body.classList.toggle('zb-first-run', machines.length === 0);

    // Hide dashboard if no machines exist (Empty State Guide handles this)
    if (machines.length === 0) {
      dashboard.style.display = 'none';
      return;
    }

    dashboard.style.display = '';

    // Collect status counts
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    let unchecked = 0;
    let mostUrgent: { machine: Machine; score: number; timestamp: number } | null = null;

    for (const machine of machines) {
      const diagnosis = await getLatestDiagnosis(machine.id);

      if (!diagnosis) {
        unchecked++;
        continue;
      }

      const score = diagnosis.healthScore;
      if (score >= 75) {
        healthy++;
      } else if (score >= 50) {
        warning++;
        if (!mostUrgent || score < mostUrgent.score) {
          mostUrgent = { machine, score, timestamp: diagnosis.timestamp };
        }
      } else {
        critical++;
        if (!mostUrgent || score < mostUrgent.score) {
          mostUrgent = { machine, score, timestamp: diagnosis.timestamp };
        }
      }
    }

    // Update counts
    this.setDashboardCount('dashboard-count-total', machines.length);
    this.setDashboardCount('dashboard-count-healthy', healthy);
    this.setDashboardCount('dashboard-count-warning', warning);
    this.setDashboardCount('dashboard-count-critical', critical);
    this.setDashboardCount('dashboard-count-unchecked', unchecked);

    // Hide zero-count stats to reduce visual noise
    this.toggleDashboardStat('dashboard-stat-warning', warning > 0);
    this.toggleDashboardStat('dashboard-stat-critical', critical > 0);
    this.toggleDashboardStat('dashboard-stat-unchecked', unchecked > 0);

    // Update attention card
    const attentionCard = document.getElementById('dashboard-attention');
    if (attentionCard && mostUrgent) {
      attentionCard.style.display = '';

      const icon = document.getElementById('dashboard-attention-icon');
      const title = document.getElementById('dashboard-attention-title');
      const scoreEl = document.getElementById('dashboard-attention-score');
      const timeEl = document.getElementById('dashboard-attention-time');
      const btn = document.getElementById('dashboard-attention-btn');

      if (icon) icon.textContent = mostUrgent.score < 50 ? '❌' : '⚠';
      if (title) title.textContent = mostUrgent.machine.name;
      if (scoreEl) {
        scoreEl.textContent = `${mostUrgent.score.toFixed(0)}%`;
        scoreEl.className = `dashboard-attention-score ${
          mostUrgent.score < 50 ? 'score-critical' : 'score-warning'
        }`;
      }
      if (timeEl) timeEl.textContent = this.deps.formatRelativeTime(mostUrgent.timestamp);

      // Trend calculation (reuse Sprint 3 logic)
      const trendEl = document.getElementById('dashboard-attention-trend');
      if (trendEl) {
        const diagnoses = await getDiagnosesForMachine(mostUrgent.machine.id, 6);
        if (diagnoses.length >= 2) {
          const olderScores = diagnoses.slice(1).map((d) => d.healthScore);
          const olderMedian = calculateMedian(olderScores);
          const delta = mostUrgent.score - olderMedian;
          if (Math.abs(delta) > 3) {
            trendEl.textContent = delta > 0 ? `↗ +${delta.toFixed(0)}%` : `↘ ${delta.toFixed(0)}%`;
            trendEl.className = `dashboard-attention-trend ${delta > 0 ? 'trend-improving' : 'trend-declining'}`;
          } else {
            trendEl.textContent = '→';
            trendEl.className = 'dashboard-attention-trend trend-stable';
          }
        } else {
          trendEl.textContent = '';
        }
      }

      // Wire up "Jetzt prüfen" button
      if (btn) {
        const capturedMachine = mostUrgent.machine;
        const newBtn = btn.cloneNode(true) as HTMLElement;
        btn.parentNode?.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
          this.deps.startDiagnosis(capturedMachine);
        });
      }
      // Welle 4: Maintenance button on attention card (Score < 50).
      // Always remove the previous button first: it captures the previous
      // most-urgent machine in its closure and would export a stale report.
      attentionCard.querySelector('.dashboard-attention-btn-secondary')?.remove();
      if (mostUrgent.score < 50) {
        const maintBtn = document.createElement('button');
        maintBtn.className = 'dashboard-attention-btn dashboard-attention-btn-secondary';
        maintBtn.textContent = t('maintenance.reportButton');
        const capturedMostUrgent = mostUrgent;
        maintBtn.addEventListener('click', () => {
          const entry: ReportEntry = {
            machineName: capturedMostUrgent.machine.name,
            machineId: capturedMostUrgent.machine.id,
            score: capturedMostUrgent.score,
            status: capturedMostUrgent.score < 50 ? 'faulty' : 'uncertain',
            timestamp: capturedMostUrgent.timestamp,
            recommendation: t('diagnose.recommendation.critical'),
          };
          exportMaintenanceJSON([entry], capturedMostUrgent.machine.name);
          notify.success(t('report.exported'));
        });
        const btnContainer = attentionCard.querySelector('.dashboard-attention-buttons');
        if (btnContainer) btnContainer.appendChild(maintBtn);
      }
    } else if (attentionCard) {
      attentionCard.style.display = 'none';
    }

    // Welle 4: Trend warnings
    const trendContainer = document.getElementById('dashboard-trend-warnings');
    if (trendContainer) {
      trendContainer.innerHTML = '';
      const trendWarnings: Array<{ machine: Machine; message: string; category: string }> = [];

      for (const machine of machines) {
        const machineDiagnoses = await getDiagnosesForMachine(machine.id, 10);
        const trend = analyzeTrend(machineDiagnoses, t);
        if (trend && (trend.category === 'declining' || trend.category === 'critical_decline')) {
          trendWarnings.push({ machine, message: trend.message, category: trend.category });
        }
      }

      if (trendWarnings.length > 0) {
        trendContainer.style.display = '';
        for (const { machine, message, category } of trendWarnings) {
          const warning = document.createElement('div');
          warning.className = `dashboard-trend-warning ${category === 'critical_decline' ? 'trend-critical' : 'trend-declining'}`;
          warning.innerHTML = `
            <span class="trend-warning-icon">${category === 'critical_decline' ? '🔴' : '🟡'}</span>
            <div class="trend-warning-text">
              <strong>${escapeHtml(machine.name)}</strong>
              <span>${escapeHtml(message)}</span>
            </div>
          `;
          trendContainer.appendChild(warning);
        }
      } else {
        trendContainer.style.display = 'none';
      }
    }

    // Welle 4: Report link in dashboard (only if machines > 0)
    const reportLink = document.getElementById('dashboard-report-link');
    if (reportLink) {
      reportLink.style.display = machines.length > 0 ? '' : 'none';
      const newLink = reportLink.cloneNode(true) as HTMLElement;
      reportLink.parentNode?.replaceChild(newLink, reportLink);
      newLink.addEventListener('click', () => this.exportAllMachinesReport());
    }
  }

  private setDashboardCount(elementId: string, value: number): void {
    const el = document.getElementById(elementId);
    if (el) el.textContent = String(value);
  }

  private toggleDashboardStat(elementId: string, visible: boolean): void {
    const el = document.getElementById(elementId);
    if (el) el.style.display = visible ? '' : 'none';
  }

  /**
   * Welle 4: Export a report for all machines (dashboard link).
   * Shows format choice via InfoBottomSheet.
   */
  private async exportAllMachinesReport(): Promise<void> {
    const machines = await getAllMachines();
    const entries: ReportEntry[] = [];
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    let unchecked = 0;
    const scores: number[] = [];

    for (const machine of machines) {
      const diagnosis = await getLatestDiagnosis(machine.id);
      if (!diagnosis) {
        unchecked++;
        continue;
      }

      const score = diagnosis.healthScore;
      scores.push(score);
      if (score >= 75) healthy++;
      else if (score >= 50) warning++;
      else critical++;

      // Trend calculation
      const machineDiagnoses = await getDiagnosesForMachine(machine.id, 6);
      let trendStr = '';
      if (machineDiagnoses.length >= 2) {
        const olderScores = machineDiagnoses.slice(1).map((d) => d.healthScore);
        const median = calculateMedian(olderScores);
        const delta = score - median;
        if (Math.abs(delta) > 3) {
          trendStr = delta > 0 ? `↗ +${delta.toFixed(0)}%` : `↘ ${delta.toFixed(0)}%`;
        }
      }

      const statusText =
        score >= 75
          ? t('status.healthy')
          : score >= 50
            ? t('status.uncertain')
            : t('status.faulty');

      entries.push({
        machineName: machine.name,
        machineId: machine.id,
        score,
        status: statusText,
        timestamp: diagnosis.timestamp,
        trend: trendStr,
        recommendation:
          score >= 75
            ? t('diagnose.recommendation.healthy')
            : score >= 50
              ? t('diagnose.recommendation.warning')
              : t('diagnose.recommendation.critical'),
      });
    }

    // Sort by score ascending (worst first)
    entries.sort((a, b) => a.score - b.score);

    const medianScore = scores.length > 0 ? calculateMedian(scores) : undefined;

    const data: ReportData = {
      title: t('report.allMachinesTitle'),
      date: new Date().toLocaleString(),
      entries,
      summary: {
        total: machines.length,
        healthy,
        warning,
        critical,
        unchecked,
        medianScore,
      },
    };

    // Show format choice
    InfoBottomSheet.show({
      title: t('report.formatChoiceTitle'),
      content: `
        <div class="report-format-options">
          <button class="report-format-btn" id="report-fmt-pdf">
            📄 ${t('report.formatPDF')}
          </button>
          <button class="report-format-btn" id="report-fmt-csv">
            📈 ${t('report.formatCSV')}
          </button>
        </div>
      `,
      icon: '📋',
    });

    // Wait for sheet to render then attach listeners
    requestAnimationFrame(() => {
      document.getElementById('report-fmt-pdf')?.addEventListener('click', () => {
        exportAsPrintablePDF(data);
        InfoBottomSheet.close();
      });
      document.getElementById('report-fmt-csv')?.addEventListener('click', () => {
        exportAsCSV(data);
        InfoBottomSheet.close();
        notify.success(t('report.exported'));
      });
    });
  }
}
