/**
 * ZANOBO – Report Export Utilities
 *
 * Generates printable HTML reports and CSV exports for diagnosis results.
 * Uses window.print() for PDF generation (no external libraries needed).
 * All processing happens offline.
 *
 * Welle 4: SV1 – Inspection report export
 */

import { t } from '../i18n/index.js';
import { logger } from './logger.js';

export interface ReportEntry {
  machineName: string;
  machineId: string;
  score: number;
  status: string;
  timestamp: number;
  trend?: string;        // e.g. "↗ +3%" or "↘ -12%"
  recommendation?: string;
  detectedState?: string;
}

export interface ReportData {
  title: string;
  subtitle?: string;
  date: string;
  entries: ReportEntry[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    unchecked: number;
    medianScore?: number;
  };
}

/**
 * Generate a printable HTML report and trigger the print dialog.
 * On mobile, this creates a PDF via the system print service.
 */
export function exportAsPrintablePDF(data: ReportData): void {
  const html = generateReportHTML(data);

  // Create hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    logger.error('Failed to create print iframe');
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render, then print
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.print();
      // Cleanup after print dialog closes
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  // Fallback: If onload doesn't fire (some mobile browsers)
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch { /* ignore */ }
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 2000);
  }, 1500);
}

/**
 * Generate an HTML string for the printable report.
 */
function generateReportHTML(data: ReportData): string {
  const rows = data.entries.map(e => `
        <tr class="${e.score < 50 ? 'critical' : e.score < 75 ? 'warning' : ''}">
            <td>${escapeHtmlReport(e.machineName)}</td>
            <td class="score">${e.score.toFixed(0)}%</td>
            <td>${escapeHtmlReport(e.status)}</td>
            <td>${e.trend || '\u2014'}</td>
            <td>${escapeHtmlReport(e.recommendation || '\u2014')}</td>
            <td class="timestamp">${new Date(e.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="${document.documentElement.lang || 'de'}">
<head>
    <meta charset="utf-8">
    <title>${escapeHtmlReport(data.title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #333; padding: 20mm; }
        h1 { font-size: 16pt; margin-bottom: 4px; }
        .subtitle { font-size: 10pt; color: #666; margin-bottom: 16px; }
        .meta { font-size: 9pt; color: #999; margin-bottom: 20px; }
        .summary { display: flex; gap: 24px; margin-bottom: 20px; padding: 12px 16px; background: #f5f5f5; border-radius: 6px; }
        .summary-item { text-align: center; }
        .summary-count { font-size: 20pt; font-weight: 700; }
        .summary-label { font-size: 8pt; color: #666; text-transform: uppercase; }
        .summary-healthy .summary-count { color: #4caf50; }
        .summary-warning .summary-count { color: #ff9800; }
        .summary-critical .summary-count { color: #ef4444; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-size: 9pt; font-weight: 600; border-bottom: 2px solid #ddd; }
        td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 10pt; }
        .score { font-weight: 700; font-variant-numeric: tabular-nums; }
        tr.critical .score { color: #ef4444; }
        tr.warning .score { color: #ff9800; }
        .timestamp { font-size: 9pt; color: #999; }
        .footer { margin-top: 24px; font-size: 8pt; color: #bbb; border-top: 1px solid #eee; padding-top: 8px; }
        @media print {
            body { padding: 10mm; }
            .summary { break-inside: avoid; }
            tr { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>${escapeHtmlReport(data.title)}</h1>
    ${data.subtitle ? `<p class="subtitle">${escapeHtmlReport(data.subtitle)}</p>` : ''}
    <p class="meta">${escapeHtmlReport(data.date)} &middot; Zanobo ${t('report.footer')}</p>

    <div class="summary">
        <div class="summary-item">
            <div class="summary-count">${data.summary.total}</div>
            <div class="summary-label">${t('report.totalLabel')}</div>
        </div>
        <div class="summary-item summary-healthy">
            <div class="summary-count">${data.summary.healthy}</div>
            <div class="summary-label">${t('report.healthyLabel')}</div>
        </div>
        <div class="summary-item summary-warning">
            <div class="summary-count">${data.summary.warning}</div>
            <div class="summary-label">${t('report.warningLabel')}</div>
        </div>
        <div class="summary-item summary-critical">
            <div class="summary-count">${data.summary.critical}</div>
            <div class="summary-label">${t('report.criticalLabel')}</div>
        </div>
        ${data.summary.medianScore !== undefined ? `
        <div class="summary-item">
            <div class="summary-count">${data.summary.medianScore.toFixed(0)}%</div>
            <div class="summary-label">${t('report.medianLabel')}</div>
        </div>` : ''}
    </div>

    <table>
        <thead>
            <tr>
                <th>${t('report.colMachine')}</th>
                <th>${t('report.colScore')}</th>
                <th>${t('report.colStatus')}</th>
                <th>${t('report.colTrend')}</th>
                <th>${t('report.colRecommendation')}</th>
                <th>${t('report.colDate')}</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>

    <div class="footer">
        ${t('report.footer')} &middot; ${escapeHtmlReport(data.date)}
    </div>
</body>
</html>`;
}

/**
 * Export diagnosis data as CSV file and trigger download.
 */
export function exportAsCSV(data: ReportData, filename?: string): void {
  const headers = [
    t('report.colMachine'),
    t('report.colScore'),
    t('report.colStatus'),
    t('report.colTrend'),
    t('report.colRecommendation'),
    t('report.colDate'),
    'Machine ID',
  ];

  const rows = data.entries.map(e => [
    csvEscape(e.machineName),
    e.score.toFixed(1),
    csvEscape(e.status),
    csvEscape(e.trend || ''),
    csvEscape(e.recommendation || ''),
    new Date(e.timestamp).toISOString(),
    e.machineId,
  ]);

  const csv = [
    headers.join(';'),
    ...rows.map(r => r.join(';')),
  ].join('\n');

  // BOM for Excel UTF-8 detection
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename || `zanobo-report-${formatDateForFilename()}.csv`);
}

/**
 * Export structured maintenance report as JSON.
 */
export function exportMaintenanceJSON(entries: ReportEntry[], machineName?: string): void {
  const report = {
    type: 'zanobo-maintenance-report',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generator: 'Zanobo PWA',
    entries: entries.map(e => ({
      machine: e.machineName,
      machineId: e.machineId,
      healthScore: e.score,
      status: e.status,
      timestamp: new Date(e.timestamp).toISOString(),
      trend: e.trend,
      recommendation: e.recommendation,
      detectedState: e.detectedState,
    })),
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const safeName = machineName
    ? machineName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30)
    : 'all';
  triggerDownload(blob, `zanobo-maintenance-${safeName}-${formatDateForFilename()}.json`);
}

// --- Helpers ---

function escapeHtmlReport(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function csvEscape(str: string): string {
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateForFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
