/**
 * ZANOBOT - HISTORY / SPARKLINE RENDERING HELPERS
 *
 * Pure, stateless SVG builders extracted from the Identify phase:
 * - generateSparkline: inline trend sparkline for machine cards,
 * - generateHistoryChart: larger diagnosis-history time-series chart,
 * - getHistoryStatusClass: score → status CSS class.
 *
 * No component state (no `this`); all inputs are passed in.
 */

import type { DiagnosisResult } from '@data/types.js';
import { t } from '../../i18n/index.js';

/**
 * CSS class for a check's status coloring.
 *
 * UX-Konsistenz: Der GESPEICHERTE Status der Prüfung ist die Quelle der
 * Wahrheit — er entstand mit der Nutzer-Schwelle und der Fault-Erkennung.
 * Feste Score-Schwellen (75/50) sind nur der Fallback für Alt-Daten und
 * würden sonst der Maschinen-Karte widersprechen („Normal" hier,
 * „Abweichung" dort für dieselbe Prüfung).
 */
export function getHistoryStatusClass(
  score: number,
  status?: DiagnosisResult['status']
): string {
  if (status === 'healthy') return 'point-healthy';
  if (status === 'uncertain') return 'point-warning';
  if (status === 'faulty') return 'point-critical';
  if (score >= 75) return 'point-healthy';
  if (score >= 50) return 'point-warning';
  return 'point-critical';
}

/**
 * Sprint 3 UX: Generate inline SVG sparkline from diagnosis scores
 * Returns an SVG element or null if not enough data
 */
export function generateSparkline(scores: number[]): SVGSVGElement | null {
  if (scores.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores.map((score, i) => {
    const x = padding + (i / (scores.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (score - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trend = scores[scores.length - 1] - scores[0];
  const strokeColor =
    trend >= -3 ? 'var(--status-healthy, #4CAF50)' : 'var(--status-warning, #FF9800)';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'sparkline-svg');
  svg.setAttribute(
    'aria-label',
    t('identify.sparkline.ariaLabel', {
      count: String(scores.length),
    })
  );
  svg.setAttribute('role', 'img');

  // Sprint 3 Polish: Use style properties for CSS variable colors
  // (more reliable across browsers/WebViews than SVG attributes)
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.style.stroke = strokeColor;
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  const lastPoint = points[points.length - 1].split(',');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', lastPoint[0]);
  dot.setAttribute('cy', lastPoint[1]);
  dot.setAttribute('r', '2.5');
  dot.style.fill = strokeColor;
  svg.appendChild(dot);

  return svg;
}

/**
 * Welle 3: Generate an SVG time series chart for diagnosis history.
 * Larger version of the sparkline with axes and interactive data points.
 *
 * ── WARUM DIE HÖHE EINSTELLBAR IST ──────────────────────────────────────────
 *
 * Seit dem 25.08.2026 steht dieselbe Kurve an zwei Stellen: im Verlaufsfenster
 * (Filter, Liste, Bericht) und als Streifen auf der Maschinenebene, wo sie in
 * den Platz zwischen der einen Handlung und dem unteren Rand passen muss.
 *
 * Ein zweiter Zeichner wäre die naheliegende Lösung und die falsche: Zwei
 * Kurven derselben Daten laufen beim nächsten Umbau auseinander, und dann
 * zeigt dieselbe Maschine an zwei Stellen zwei Formen. Einstellbar ist
 * deshalb nur die Höhe — alles andere rechnet sich aus ihr.
 *
 * @param options.height Höhe des viewBox. Voreinstellung 160, wie bisher; der
 *   Streifen nimmt 120 und wird dadurch flacher, nicht kleiner.
 */
export function generateHistoryChart(
  diagnoses: DiagnosisResult[],
  options: { height?: number } = {}
): SVGSVGElement {
  const WIDTH = 320;
  const HEIGHT = options.height ?? 160;
  const PADDING = { top: 10, right: 15, bottom: 25, left: 35 };
  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  // Reverse to chronological order (oldest first for left-to-right display)
  const data = [...diagnoses].reverse();

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('class', 'history-chart-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('history.chartAriaLabel', { count: String(data.length) }));

  // Y-axis labels (0%, 50%, 100%)
  for (const pct of [0, 50, 100]) {
    const y = PADDING.top + chartH - (pct / 100) * chartH;

    // Grid line
    const gridLine = document.createElementNS(ns, 'line');
    gridLine.setAttribute('x1', String(PADDING.left));
    gridLine.setAttribute('x2', String(WIDTH - PADDING.right));
    gridLine.setAttribute('y1', String(y));
    gridLine.setAttribute('y2', String(y));
    gridLine.setAttribute('class', 'history-chart-grid');
    svg.appendChild(gridLine);

    // Label
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(PADDING.left - 5));
    label.setAttribute('y', String(y + 3));
    label.setAttribute('class', 'history-chart-label');
    label.setAttribute('text-anchor', 'end');
    label.textContent = `${pct}%`;
    svg.appendChild(label);
  }

  // Threshold lines (75% healthy, 50% warning)
  for (const threshold of [75, 50]) {
    const y = PADDING.top + chartH - (threshold / 100) * chartH;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(PADDING.left));
    line.setAttribute('x2', String(WIDTH - PADDING.right));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute(
      'class',
      threshold === 75 ? 'history-chart-threshold-ok' : 'history-chart-threshold-warn'
    );
    svg.appendChild(line);
  }

  // Data points + polyline
  if (data.length > 0) {
    const points: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const x = PADDING.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
      const y = PADDING.top + chartH - (data[i].healthScore / 100) * chartH;
      points.push(`${x},${y}`);

      // Data point circle
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '4');
      circle.setAttribute(
        'class',
        `history-chart-point ${getHistoryStatusClass(data[i].healthScore, data[i].status)}`
      );
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute(
        'aria-label',
        `${data[i].healthScore.toFixed(0)}% – ${new Date(data[i].timestamp).toLocaleDateString()}`
      );
      svg.appendChild(circle);
    }

    // Polyline connecting data points
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('class', 'history-chart-line');
    svg.appendChild(polyline);
  }

  // X-axis: First and last date
  if (data.length >= 2) {
    const firstDate = document.createElementNS(ns, 'text');
    firstDate.setAttribute('x', String(PADDING.left));
    firstDate.setAttribute('y', String(HEIGHT - 3));
    firstDate.setAttribute('class', 'history-chart-label');
    firstDate.textContent = new Date(data[0].timestamp).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
    });
    svg.appendChild(firstDate);

    const lastDate = document.createElementNS(ns, 'text');
    lastDate.setAttribute('x', String(WIDTH - PADDING.right));
    lastDate.setAttribute('y', String(HEIGHT - 3));
    lastDate.setAttribute('class', 'history-chart-label');
    lastDate.setAttribute('text-anchor', 'end');
    lastDate.textContent = new Date(data[data.length - 1].timestamp).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
    });
    svg.appendChild(lastDate);
  }

  return svg;
}
