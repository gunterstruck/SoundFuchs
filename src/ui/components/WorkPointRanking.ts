/**
 * ZANOBOT - WorkPointRanking Component
 *
 * A dynamic ranking list that displays the probability distribution
 * of all detected machine states (work points) as an interactive dashboard.
 *
 * Design: "Fieberthermometer" - Industrial Dark Mode
 * - Sorted by score (highest first)
 * - Visual progress bars for each state
 * - Color-coded status indicators (healthy/faulty)
 * - Only visible for Advanced/Expert users
 *
 * @example
 * ```typescript
 * const ranking = new WorkPointRanking('ranking-container');
 * ranking.update([
 *   { name: 'Normalbetrieb 50Hz', score: 95, isHealthy: true },
 *   { name: 'Lagerschaden', score: 15, isHealthy: false },
 * ]);
 * ```
 */

import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { escapeHtml } from '@utils/sanitize.js';

/**
 * Represents a single work point (machine state) with its probability
 */
export interface WorkPoint {
  /** Name or comment describing the state */
  name: string;
  /** Probability score from 0 to 100 */
  score: number;
  /** Whether this is a healthy/good state (true) or fault/bad state (false) */
  isHealthy: boolean;
  /** Optional: Additional metadata for the state */
  metadata?: {
    /** Training date of this reference model */
    trainingDate?: number;
    /** Number of training samples */
    sampleCount?: number;
  };
}

/**
 * Configuration options for WorkPointRanking
 */
export interface WorkPointRankingConfig {
  /** Whether to animate score changes (default: true) */
  animate?: boolean;
  /** Animation duration in ms (default: 300) */
  animationDuration?: number;
  /** Maximum number of items to display (default: 10) */
  maxItems?: number;
  /** Minimum score threshold to display (default: 0) */
  minScoreThreshold?: number;
  /** Whether to show rank numbers (default: true) */
  showRankNumbers?: boolean;
}

const DEFAULT_CONFIG: Required<WorkPointRankingConfig> = {
  animate: true,
  animationDuration: 300,
  maxItems: 10,
  minScoreThreshold: 0,
  showRankNumbers: true,
};

/**
 * WorkPointRanking - Dynamic ranking visualization component
 *
 * Displays machine states sorted by probability with visual progress bars.
 * Designed for the Industrial Dark Mode aesthetic with theme support.
 */
export class WorkPointRanking {
  private container: HTMLElement | null = null;
  private containerId: string;
  private config: Required<WorkPointRankingConfig>;
  private currentData: WorkPoint[] = [];
  private isDestroyed: boolean = false;

  /**
   * Create a new WorkPointRanking instance
   *
   * @param containerId - ID of the container element
   * @param config - Optional configuration
   */
  constructor(containerId: string, config?: WorkPointRankingConfig) {
    this.containerId = containerId;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.initContainer();
    logger.debug('📊 WorkPointRanking initialized:', containerId);
  }

  /**
   * Initialize the container element
   */
  private initContainer(): void {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      logger.warn(`WorkPointRanking: Container #${this.containerId} not found`);
      return;
    }

    // Add component class
    this.container.classList.add('work-point-ranking');

    // Set initial empty state
    this.renderEmptyState();
  }

  /**
   * Update the ranking with new data
   *
   * @param workPoints - Array of work points to display
   */
  public update(workPoints: WorkPoint[]): void {
    if (this.isDestroyed || !this.container) return;

    // Filter by minimum score threshold
    const filtered = workPoints.filter(wp => wp.score >= this.config.minScoreThreshold);

    // Sort by score (highest first)
    const sorted = [...filtered].sort((a, b) => b.score - a.score);

    // Limit to maxItems
    const limited = sorted.slice(0, this.config.maxItems);

    this.currentData = limited;
    this.render();
  }

  /**
   * Render the ranking list
   */
  private render(): void {
    if (!this.container) return;

    if (this.currentData.length === 0) {
      this.renderEmptyState();
      return;
    }

    const html = this.currentData.map((wp, index) => this.renderWorkPoint(wp, index)).join('');

    this.container.innerHTML = `
      <div class="ranking-header">
        <h4 class="ranking-title">${t('workPointRanking.title')}</h4>
        <span class="ranking-count">${this.currentData.length} ${t('workPointRanking.states')}</span>
      </div>
      <div class="ranking-list" role="list" aria-label="${t('workPointRanking.ariaLabel')}">
        ${html}
      </div>
    `;

    // Trigger animations if enabled
    if (this.config.animate) {
      this.animateEntries();
    }
  }

  /**
   * Render a single work point entry
   */
  private renderWorkPoint(wp: WorkPoint, index: number): string {
    const rank = index + 1;
    const statusClass = wp.isHealthy ? 'status-healthy' : 'status-faulty';
    const statusText = wp.isHealthy
      ? t('workPointRanking.statusHealthy')
      : t('workPointRanking.statusFaulty');
    const statusIcon = wp.isHealthy
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    // Determine bar color based on score and health status
    const barColorClass = this.getBarColorClass(wp.score, wp.isHealthy);

    // Format score for display
    const scoreDisplay = wp.score.toFixed(1);

    return `
      <div class="ranking-item ${statusClass}" role="listitem" data-rank="${rank}" style="--animation-delay: ${index * 50}ms;">
        <div class="ranking-item-header">
          <div class="ranking-item-left">
            ${this.config.showRankNumbers ? `<span class="ranking-rank">#${rank}</span>` : ''}
            <span class="ranking-name" title="${escapeHtml(wp.name)}">${escapeHtml(wp.name)}</span>
          </div>
          <div class="ranking-item-right">
            <span class="ranking-badge ${statusClass}">
              ${statusIcon}
              <span class="ranking-badge-text">${statusText}</span>
            </span>
            <span class="ranking-score">${scoreDisplay}%</span>
          </div>
        </div>
        <div class="ranking-bar-container">
          <div class="ranking-bar ${barColorClass}" style="--bar-width: ${wp.score}%;"></div>
          <div class="ranking-bar-glow ${barColorClass}"></div>
        </div>
      </div>
    `;
  }

  /**
   * Render empty state when no data is available
   */
  private renderEmptyState(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="ranking-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 3v18h18"/>
          <path d="M18 9l-5 5-4-4-5 5"/>
        </svg>
        <p>${t('workPointRanking.noData')}</p>
      </div>
    `;
  }

  /**
   * Get the color class for the progress bar based on score and health
   */
  private getBarColorClass(score: number, isHealthy: boolean): string {
    if (!isHealthy) {
      // Fault states always use error/warning colors
      return score >= 50 ? 'bar-error-high' : 'bar-error-low';
    }

    // Healthy states use gradient based on confidence
    if (score >= 75) return 'bar-healthy-high';
    if (score >= 50) return 'bar-healthy-mid';
    return 'bar-healthy-low';
  }

  /**
   * Animate the entry of ranking items
   */
  private animateEntries(): void {
    if (!this.container) return;

    const items = this.container.querySelectorAll('.ranking-item');
    items.forEach((item, index) => {
      const element = item as HTMLElement;
      element.style.opacity = '0';
      element.style.transform = 'translateX(-20px)';

      setTimeout(() => {
        element.style.transition = `opacity ${this.config.animationDuration}ms ease, transform ${this.config.animationDuration}ms ease`;
        element.style.opacity = '1';
        element.style.transform = 'translateX(0)';
      }, index * 50);
    });

    // Animate progress bars after items appear
    setTimeout(() => {
      const bars = this.container?.querySelectorAll('.ranking-bar');
      bars?.forEach((bar) => {
        const element = bar as HTMLElement;
        element.classList.add('animate');
      });
    }, this.currentData.length * 50 + 100);
  }

  /**
   * Get current ranking data
   */
  public getData(): WorkPoint[] {
    return [...this.currentData];
  }

  /**
   * Clear all data and show empty state
   */
  public clear(): void {
    this.currentData = [];
    this.renderEmptyState();
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<WorkPointRankingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Destroy the component and clean up resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('work-point-ranking');
    }
    this.container = null;
    this.currentData = [];
    logger.debug('📊 WorkPointRanking destroyed');
  }
}

/**
 * Factory function for creating a WorkPointRanking with demo data
 * Useful for testing and previewing the component
 */
export function createDemoRanking(containerId: string): WorkPointRanking {
  const ranking = new WorkPointRanking(containerId);

  const demoData: WorkPoint[] = [
    { name: 'Normalbetrieb 50Hz', score: 94.5, isHealthy: true },
    { name: 'Baseline (Referenz)', score: 87.2, isHealthy: true },
    { name: 'Anlaufphase', score: 42.8, isHealthy: true },
    { name: 'Lagerschaden (früh)', score: 23.1, isHealthy: false },
    { name: 'Unwucht', score: 15.7, isHealthy: false },
    { name: 'Kavitation', score: 8.3, isHealthy: false },
    { name: 'Ausrichtungsfehler', score: 5.2, isHealthy: false },
  ];

  ranking.update(demoData);
  return ranking;
}
