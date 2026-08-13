/**
 * ZANOBOT - MAINTENANCE REPORT EXPORT
 *
 * The single-machine maintenance report export extracted from the Diagnose
 * phase: a format-choice sheet (clipboard / JSON / CSV) plus the clipboard
 * formatter. Stateless — the machine and diagnosis are passed in, so this does
 * not touch the phase's live-audio state.
 */

import { notify } from '@utils/notifications.js';
import { t } from '../../i18n/index.js';
import { InfoBottomSheet } from '../components/InfoBottomSheet.js';
import {
  exportMaintenanceJSON,
  exportAsCSV,
  type ReportData,
  type ReportEntry,
} from '@utils/reportExport.js';
import type { Machine, DiagnosisResult } from '@data/types.js';

/**
 * Welle 2: Copy a maintenance report summary to clipboard.
 */
async function copyMaintenanceReport(machine: Machine, diagnosis: DiagnosisResult): Promise<void> {
  const lines = [
    t('resultActions.maintenanceReportTitle'),
    `${t('resultActions.machine')}: ${machine.name}`,
    `${t('resultActions.score')}: ${diagnosis.healthScore.toFixed(0)}%`,
    `${t('resultActions.status')}: ${diagnosis.status}`,
    `${t('resultActions.date')}: ${new Date(diagnosis.timestamp).toLocaleString()}`,
    `${t('resultActions.recommendation')}: ${t('diagnose.recommendation.critical')}`,
  ];

  const text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    notify.success(t('resultActions.copiedToClipboard'));
  } catch {
    // Fallback for older browsers
    notify.info(text, { title: t('resultActions.maintenanceReportTitle'), duration: 10000 });
  }
}

/**
 * Welle 4: Show maintenance export format choice (Clipboard / JSON / CSV).
 * Replaces the direct clipboard copy for richer export options.
 */
export function showMaintenanceExportChoice(machine: Machine, diagnosis: DiagnosisResult): void {
  const entry: ReportEntry = {
    machineName: machine.name,
    machineId: machine.id,
    score: diagnosis.healthScore,
    status: diagnosis.status,
    timestamp: diagnosis.timestamp,
    recommendation: t('diagnose.recommendation.critical'),
    detectedState: (diagnosis.metadata as Record<string, unknown>)?.detectedState as
      | string
      | undefined,
  };

  InfoBottomSheet.show({
    title: t('maintenance.exportTitle'),
    content: `
        <div class="maintenance-export-options">
          <button class="maintenance-export-btn" id="maint-clipboard">
            📋 ${t('maintenance.copyToClipboard')}
          </button>
          <button class="maintenance-export-btn" id="maint-json">
            📄 ${t('maintenance.exportJSON')}
          </button>
          <button class="maintenance-export-btn" id="maint-csv">
            📈 ${t('maintenance.exportCSV')}
          </button>
        </div>
      `,
    icon: '🔧',
  });

  requestAnimationFrame(() => {
    document.getElementById('maint-clipboard')?.addEventListener('click', () => {
      void copyMaintenanceReport(machine, diagnosis);
      InfoBottomSheet.close();
    });
    document.getElementById('maint-json')?.addEventListener('click', () => {
      exportMaintenanceJSON([entry], machine.name);
      InfoBottomSheet.close();
      notify.success(t('report.exported'));
    });
    document.getElementById('maint-csv')?.addEventListener('click', () => {
      const data: ReportData = {
        title: t('maintenance.reportTitle'),
        date: new Date().toLocaleString(),
        entries: [entry],
        summary: { total: 1, healthy: 0, warning: 0, critical: 1, unchecked: 0 },
      };
      exportAsCSV(data, `soundfuchs-maintenance-${machine.name.replace(/[^a-z0-9]/gi, '_')}.csv`);
      InfoBottomSheet.close();
      notify.success(t('report.exported'));
    });
  });
}
