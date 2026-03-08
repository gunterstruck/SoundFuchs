/**
 * ZANOBOT - OPERATING POINT MONITOR (Expert Mode Only)
 *
 * Displays transparency metrics below the Similarity Score in expert mode.
 * Shows: P10 Similarity, Energy Delta, Frequency Delta, Stability.
 *
 * Each metric includes:
 *  - Value + unit
 *  - Traffic-light indicator (green / yellow / red)
 *  - Short label (2-3 words)
 *  - One-sentence explanation (as subtext)
 *  - Tap-to-expand tooltip with dynamic warning (when metric is yellow/red)
 *
 * During warmup (baseline capture), shows an initialization banner
 * telling the user to hold the device steady.
 *
 * A warning banner appears when the operating point has changed significantly.
 *
 * This component is PURELY presentational — all calculations happen
 * in OperatingPointMetrics (DSP layer).
 */

import type { OperatingPointResult, OperatingPointMetric, TrafficLight } from '@core/dsp/operatingPointMetrics.js';
import { t } from '../../i18n/index.js';

/**
 * CSS class constants
 */
const CLS = {
  container: 'op-monitor',
  header: 'op-monitor-header',
  row: 'op-monitor-row',
  rowExpanded: 'op-monitor-row--expanded',
  light: 'op-monitor-light',
  value: 'op-monitor-value',
  label: 'op-monitor-label',
  desc: 'op-monitor-desc',
  textBlock: 'op-monitor-text',
  banner: 'op-monitor-banner',
  bannerHidden: 'op-monitor-banner--hidden',
  initBanner: 'op-monitor-init-banner',
  initBannerHidden: 'op-monitor-init-banner--hidden',
  tooltip: 'op-monitor-tooltip',
  tooltipHidden: 'op-monitor-tooltip--hidden',
  tooltipWarning: 'op-monitor-tooltip-warning',
  tooltipExplain: 'op-monitor-tooltip-explain',
  tapHint: 'op-monitor-tap-hint',
} as const;

/**
 * Traffic light colour map
 */
const LIGHT_COLORS: Record<TrafficLight, string> = {
  green: 'var(--color-healthy, #4CAF50)',
  yellow: 'var(--color-warning, #FFC107)',
  red: 'var(--color-faulty, #F44336)',
};

/**
 * Metric IDs used for DOM element references
 */
type MetricId = 'p10' | 'energy' | 'freq' | 'stab';

export class OperatingPointMonitor {
  private containerEl: HTMLElement | null = null;
  private parentId: string;
  private isDestroyed = false;

  // Cached DOM references for fast updates
  private p10ValueEl: HTMLElement | null = null;
  private p10LightEl: HTMLElement | null = null;
  private energyValueEl: HTMLElement | null = null;
  private energyLightEl: HTMLElement | null = null;
  private freqValueEl: HTMLElement | null = null;
  private freqLightEl: HTMLElement | null = null;
  private stabValueEl: HTMLElement | null = null;
  private stabLightEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private initBannerEl: HTMLElement | null = null;

  // Tooltip DOM references
  private p10TooltipEl: HTMLElement | null = null;
  private energyTooltipEl: HTMLElement | null = null;
  private freqTooltipEl: HTMLElement | null = null;
  private stabTooltipEl: HTMLElement | null = null;

  // Row DOM references (for expanded state)
  private p10RowEl: HTMLElement | null = null;
  private energyRowEl: HTMLElement | null = null;
  private freqRowEl: HTMLElement | null = null;
  private stabRowEl: HTMLElement | null = null;

  // Track which tooltips are expanded
  private expandedMetrics: Set<MetricId> = new Set();

  // Bound click handlers for cleanup
  private rowClickHandlers: Map<HTMLElement, () => void> = new Map();

  constructor(parentId: string) {
    this.parentId = parentId;
  }

  /**
   * Create the DOM structure and append to parent.
   * Call once after the parent element is in the DOM.
   */
  public mount(): void {
    const parent = document.getElementById(this.parentId);
    if (!parent || this.isDestroyed) return;

    // Prevent double-mount
    if (this.containerEl) return;

    this.containerEl = document.createElement('div');
    this.containerEl.className = CLS.container;
    this.containerEl.id = 'op-monitor';

    this.containerEl.innerHTML = `
      <div class="${CLS.header}">${t('opMonitor.title')}</div>
      <div class="${CLS.initBanner}" id="op-monitor-init-banner">
        ${t('opMonitor.initializingBaseline')}
      </div>
      ${this.renderRow('energy')}
      ${this.renderRow('freq')}
      ${this.renderRow('p10')}
      ${this.renderRow('stab')}
      <div class="${CLS.banner} ${CLS.bannerHidden}" id="op-monitor-banner">
        ${t('opMonitor.operatingPointChanged')}
      </div>
    `;

    parent.appendChild(this.containerEl);

    // Cache element references
    this.p10ValueEl = this.containerEl.querySelector('#op-p10-value');
    this.p10LightEl = this.containerEl.querySelector('#op-p10-light');
    this.energyValueEl = this.containerEl.querySelector('#op-energy-value');
    this.energyLightEl = this.containerEl.querySelector('#op-energy-light');
    this.freqValueEl = this.containerEl.querySelector('#op-freq-value');
    this.freqLightEl = this.containerEl.querySelector('#op-freq-light');
    this.stabValueEl = this.containerEl.querySelector('#op-stab-value');
    this.stabLightEl = this.containerEl.querySelector('#op-stab-light');
    this.bannerEl = this.containerEl.querySelector('#op-monitor-banner');
    this.initBannerEl = this.containerEl.querySelector('#op-monitor-init-banner');

    // Cache tooltip and row references
    this.p10TooltipEl = this.containerEl.querySelector('#op-p10-tooltip');
    this.energyTooltipEl = this.containerEl.querySelector('#op-energy-tooltip');
    this.freqTooltipEl = this.containerEl.querySelector('#op-freq-tooltip');
    this.stabTooltipEl = this.containerEl.querySelector('#op-stab-tooltip');

    this.p10RowEl = this.containerEl.querySelector('#op-p10-row');
    this.energyRowEl = this.containerEl.querySelector('#op-energy-row');
    this.freqRowEl = this.containerEl.querySelector('#op-freq-row');
    this.stabRowEl = this.containerEl.querySelector('#op-stab-row');

    // Attach click handlers for tooltip toggle
    this.attachRowClickHandler(this.energyRowEl, 'energy');
    this.attachRowClickHandler(this.freqRowEl, 'freq');
    this.attachRowClickHandler(this.p10RowEl, 'p10');
    this.attachRowClickHandler(this.stabRowEl, 'stab');
  }

  /**
   * Update all metrics with fresh data from OperatingPointMetrics.
   */
  public update(result: OperatingPointResult): void {
    if (this.isDestroyed || !this.containerEl) return;

    this.updateMetric(this.energyValueEl, this.energyLightEl, this.energyTooltipEl, this.energyRowEl, result.energyDelta, 'energy');
    this.updateMetric(this.freqValueEl, this.freqLightEl, this.freqTooltipEl, this.freqRowEl, result.frequencyDelta, 'freq');
    this.updateMetric(this.p10ValueEl, this.p10LightEl, this.p10TooltipEl, this.p10RowEl, result.similarityP10, 'p10');
    this.updateMetric(this.stabValueEl, this.stabLightEl, this.stabTooltipEl, this.stabRowEl, result.stability, 'stab');

    // Initialization banner (warmup phase)
    if (this.initBannerEl) {
      if (result.isInitializing) {
        this.initBannerEl.classList.remove(CLS.initBannerHidden);
      } else {
        this.initBannerEl.classList.add(CLS.initBannerHidden);
      }
    }

    // Warning banner (operating point changed)
    if (this.bannerEl) {
      if (result.operatingPointChanged && !result.isInitializing) {
        this.bannerEl.classList.remove(CLS.bannerHidden);
      } else {
        this.bannerEl.classList.add(CLS.bannerHidden);
      }
    }
  }

  /**
   * Remove from DOM and release references.
   */
  public destroy(): void {
    this.isDestroyed = true;

    // Remove click handlers
    for (const [el, handler] of this.rowClickHandlers) {
      el.removeEventListener('click', handler);
    }
    this.rowClickHandlers.clear();
    this.expandedMetrics.clear();

    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.p10ValueEl = null;
    this.p10LightEl = null;
    this.energyValueEl = null;
    this.energyLightEl = null;
    this.freqValueEl = null;
    this.freqLightEl = null;
    this.stabValueEl = null;
    this.stabLightEl = null;
    this.bannerEl = null;
    this.initBannerEl = null;
    this.p10TooltipEl = null;
    this.energyTooltipEl = null;
    this.freqTooltipEl = null;
    this.stabTooltipEl = null;
    this.p10RowEl = null;
    this.energyRowEl = null;
    this.freqRowEl = null;
    this.stabRowEl = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private renderRow(metricId: MetricId): string {
    const labelKey = this.getI18nKeyForMetric(metricId, 'shortLabel');
    const descKey = this.getI18nKeyForMetric(metricId, 'description');
    const warningKey = this.getI18nKeyForMetric(metricId, 'warning');
    const explainKey = this.getI18nKeyForMetric(metricId, 'explain');

    return `
      <div class="${CLS.row}" id="op-${metricId}-row">
        <span class="${CLS.light}" id="op-${metricId}-light"></span>
        <span class="${CLS.value}" id="op-${metricId}-value">--</span>
        <div class="${CLS.textBlock}">
          <span class="${CLS.label}">${t(labelKey)}</span>
          <span class="${CLS.desc}">${t(descKey)}</span>
          <span class="${CLS.tapHint}" id="op-${metricId}-tap-hint"></span>
        </div>
      </div>
      <div class="${CLS.tooltip} ${CLS.tooltipHidden}" id="op-${metricId}-tooltip">
        <div class="${CLS.tooltipWarning}" id="op-${metricId}-tooltip-warning">${t(warningKey)}</div>
        <div class="${CLS.tooltipExplain}">${t(explainKey)}</div>
      </div>
    `;
  }

  private getI18nKeyForMetric(metricId: MetricId, suffix: string): string {
    const map: Record<MetricId, string> = {
      p10: 'opMonitor.similarityP10',
      energy: 'opMonitor.energyDelta',
      freq: 'opMonitor.frequencyDelta',
      stab: 'opMonitor.stability',
    };
    return `${map[metricId]}.${suffix}`;
  }

  private attachRowClickHandler(rowEl: HTMLElement | null, metricId: MetricId): void {
    if (!rowEl) return;

    const handler = () => this.toggleTooltip(metricId);
    rowEl.addEventListener('click', handler);
    this.rowClickHandlers.set(rowEl, handler);
  }

  private toggleTooltip(metricId: MetricId): void {
    const tooltipEl = this.getTooltipEl(metricId);
    const rowEl = this.getRowEl(metricId);
    if (!tooltipEl || !rowEl) return;

    if (this.expandedMetrics.has(metricId)) {
      // Collapse
      this.expandedMetrics.delete(metricId);
      tooltipEl.classList.add(CLS.tooltipHidden);
      rowEl.classList.remove(CLS.rowExpanded);
    } else {
      // Expand
      this.expandedMetrics.add(metricId);
      tooltipEl.classList.remove(CLS.tooltipHidden);
      rowEl.classList.add(CLS.rowExpanded);
    }
  }

  private getTooltipEl(metricId: MetricId): HTMLElement | null {
    switch (metricId) {
      case 'p10': return this.p10TooltipEl;
      case 'energy': return this.energyTooltipEl;
      case 'freq': return this.freqTooltipEl;
      case 'stab': return this.stabTooltipEl;
    }
  }

  private getRowEl(metricId: MetricId): HTMLElement | null {
    switch (metricId) {
      case 'p10': return this.p10RowEl;
      case 'energy': return this.energyRowEl;
      case 'freq': return this.freqRowEl;
      case 'stab': return this.stabRowEl;
    }
  }

  private updateMetric(
    valueEl: HTMLElement | null,
    lightEl: HTMLElement | null,
    tooltipEl: HTMLElement | null,
    rowEl: HTMLElement | null,
    metric: OperatingPointMetric,
    metricId: MetricId
  ): void {
    if (valueEl) {
      valueEl.textContent = metric.displayValue;
    }
    if (lightEl) {
      lightEl.style.backgroundColor = LIGHT_COLORS[metric.status];
    }

    // Update tap hint visibility: show "tap for details" indicator when warning
    const tapHintEl = this.containerEl?.querySelector(`#op-${metricId}-tap-hint`) as HTMLElement | null;
    if (tapHintEl) {
      if (metric.warningText) {
        tapHintEl.textContent = '\u25B6'; // small arrow indicator
        tapHintEl.style.display = 'inline';
      } else {
        tapHintEl.style.display = 'none';
      }
    }

    // Show/hide warning text within tooltip
    if (tooltipEl) {
      const warningEl = tooltipEl.querySelector(`.${CLS.tooltipWarning}`) as HTMLElement | null;
      if (warningEl) {
        warningEl.style.display = metric.warningText ? 'block' : 'none';
      }
    }

    // Add warning class to row for visual emphasis
    if (rowEl) {
      rowEl.classList.toggle('op-monitor-row--warning', metric.status === 'yellow');
      rowEl.classList.toggle('op-monitor-row--critical', metric.status === 'red');
    }
  }
}
