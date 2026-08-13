/**
 * ZANOBOT - HISTORY CHART COMPONENT
 *
 * Displays machine health history as a trend chart over time.
 * X-axis: Timeline (from first to last diagnosis)
 * Y-axis: Health score (0-100%)
 * Features: Interactive data points, tooltips, threshold lines, smooth animations
 */

import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { setCanvasSize } from '@utils/canvasUtils.js';
import type { DiagnosisResult } from '@data/types.js';

interface ChartDataPoint {
  timestamp: number;
  healthScore: number;
  status: 'healthy' | 'uncertain' | 'faulty';
  diagnosis: DiagnosisResult;
}

export class HistoryChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dataPoints: ChartDataPoint[] = [];
  private hoveredPoint: ChartDataPoint | null = null;
  private animationProgress: number = 0;
  private animationFrame: number | null = null;
  private darkQuery: MediaQueryList | null = null;
  private onSchemeChange: (() => void) | null = null;

  // Bound listener references so destroy() can actually remove them
  private readonly onMouseMove = (e: MouseEvent): void => this.handleMouseMove(e);
  private readonly onMouseLeave = (): void => this.handleMouseLeave();
  private readonly onTouchStart = (e: TouchEvent): void => this.handleTouchStart(e);
  private readonly onTouchMove = (e: TouchEvent): void => this.handleTouchMove(e);

  // Chart dimensions and padding
  private readonly padding = {
    top: 40,
    right: 30,
    bottom: 60,
    left: 60,
  };

  // Theme-aware colors (read from CSS variables)
  private colors = {
    healthy: '#00E676',
    warning: '#FFB74D',
    error: '#FF5252',
    text: '#FFFFFF',
    textMuted: '#888888',
    background: '#2a2a2a',
    gridLine: '#444444',
    chartLine: '#00E676',
  };

  // Thresholds for health status
  private readonly thresholds = {
    healthy: 75,
    uncertain: 50,
  };

  // A "bad feature" (frequency anomaly) is flagged on the timeline once its
  // strength reaches this share of unexplained energy.
  private readonly anomalyStrengthThreshold = 50;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element not found: ${canvasId}`);
    }

    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context');
    }

    this.ctx = ctx;
    setCanvasSize(this.canvas, this.ctx);
    this.updateThemeColors();

    // Listen for theme changes
    this.observeThemeChanges();

    // Add mouse/touch event listeners for interactivity
    this.setupEventListeners();
  }

  /**
   * Read theme colors from CSS variables for consistent theming
   */
  private updateThemeColors(): void {
    const styles = getComputedStyle(document.documentElement);

    this.colors = {
      healthy: styles.getPropertyValue('--status-healthy').trim() || '#00E676',
      warning: styles.getPropertyValue('--status-warning').trim() || '#FFB74D',
      error: styles.getPropertyValue('--status-error').trim() || '#FF5252',
      text: styles.getPropertyValue('--text-primary').trim() || '#FFFFFF',
      textMuted: styles.getPropertyValue('--text-muted').trim() || '#888888',
      background: styles.getPropertyValue('--bg-tertiary').trim() || '#2a2a2a',
      gridLine: styles.getPropertyValue('--border-color').trim() || '#444444',
      chartLine: styles.getPropertyValue('--status-healthy').trim() || '#00E676',
    };
  }

  /**
   * Auf den Helligkeitswechsel des Geräts hören und die Farben nachziehen.
   *
   * Vorher wurde das Attribut `data-theme` beobachtet. Seit es nur noch einen
   * Look gibt, wechselt die Helligkeit über `prefers-color-scheme`.
   */
  private observeThemeChanges(): void {
    this.darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.onSchemeChange = () => {
      this.updateThemeColors();
      this.render();
    };
    this.darkQuery.addEventListener('change', this.onSchemeChange);
  }

  /**
   * Setup mouse and touch event listeners for interactivity
   */
  private setupEventListeners(): void {
    // Mouse move for hover effects
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);

    // Touch support
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: true });
    this.canvas.addEventListener('touchend', this.onMouseLeave, { passive: true });
  }

  /**
   * Handle mouse move for hover effects
   */
  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x =
      ((e.clientX - rect.left) * (this.canvas.width / rect.width)) / (window.devicePixelRatio || 1);
    const y =
      ((e.clientY - rect.top) * (this.canvas.height / rect.height)) /
      (window.devicePixelRatio || 1);

    this.checkHoveredPoint(x, y);
  }

  /**
   * Handle touch start for mobile interactivity
   */
  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x =
        ((touch.clientX - rect.left) * (this.canvas.width / rect.width)) /
        (window.devicePixelRatio || 1);
      const y =
        ((touch.clientY - rect.top) * (this.canvas.height / rect.height)) /
        (window.devicePixelRatio || 1);

      this.checkHoveredPoint(x, y);
    }
  }

  /**
   * Handle touch move for mobile interactivity
   */
  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x =
        ((touch.clientX - rect.left) * (this.canvas.width / rect.width)) /
        (window.devicePixelRatio || 1);
      const y =
        ((touch.clientY - rect.top) * (this.canvas.height / rect.height)) /
        (window.devicePixelRatio || 1);

      this.checkHoveredPoint(x, y);
    }
  }

  /**
   * Handle mouse leave to clear hover state
   */
  private handleMouseLeave(): void {
    if (this.hoveredPoint !== null) {
      this.hoveredPoint = null;
      this.render();
    }
  }

  /**
   * Check if mouse/touch is hovering over a data point
   */
  private checkHoveredPoint(mouseX: number, mouseY: number): void {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    let hoveredPoint: ChartDataPoint | null = null;
    const hoverRadius = 15; // Larger hit area for easier interaction

    for (const point of this.dataPoints) {
      const x = this.getDataPointX(point, chartWidth);
      const y = this.getDataPointY(point.healthScore, chartHeight);

      const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));
      if (distance <= hoverRadius) {
        hoveredPoint = point;
        break;
      }
    }

    if (hoveredPoint !== this.hoveredPoint) {
      this.hoveredPoint = hoveredPoint;
      this.render();
    }
  }

  /**
   * Draw the history chart with diagnosis data
   */
  public draw(diagnoses: DiagnosisResult[], animate: boolean = true): void {
    // Validate and sort diagnoses by timestamp (oldest first for chronological order)
    if (!diagnoses || diagnoses.length === 0) {
      this.dataPoints = [];
      this.renderEmptyState();
      return;
    }

    // Convert to data points and sort chronologically
    this.dataPoints = diagnoses
      .map((diagnosis) => ({
        timestamp: diagnosis.timestamp,
        healthScore: diagnosis.healthScore,
        status: diagnosis.status,
        diagnosis,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    logger.info(`📊 HistoryChart: Drawing chart with ${this.dataPoints.length} data points`);

    if (animate) {
      this.animateChart();
    } else {
      this.animationProgress = 1;
      this.render();
    }
  }

  /**
   * Animate the chart with smooth entrance
   */
  private animateChart(): void {
    const duration = 800; // 0.8 seconds
    const startTime = Date.now();

    const animate = (): void => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      this.animationProgress = 1 - Math.pow(1 - progress, 3);
      this.render();

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    animate();
  }

  /**
   * Render the chart
   */
  private render(): void {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    if (this.dataPoints.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Draw chart components
    this.drawGrid(width, height);
    this.drawThresholdLines(width, height);
    this.drawAxes(width, height);
    this.drawTrendLine(width, height);
    this.drawAnomalyOverlay(width, height);
    this.drawDataPoints(width, height);
    this.drawTooltip(width, height);
  }

  /**
   * Strongest "bad feature" of a data point, or null if none was recorded.
   */
  private topAnomaly(point: ChartDataPoint): { frequency: number; strength: number } | null {
    const list = point.diagnosis.analysis?.frequencyAnomalies;
    if (!list || list.length === 0) return null;
    return list.reduce((best, a) => (a.strength > best.strength ? a : best), list[0]);
  }

  /** True if a point carries a bad feature at or above the flag threshold. */
  private hasStrongAnomaly(point: ChartDataPoint): boolean {
    const top = this.topAnomaly(point);
    return !!top && top.strength >= this.anomalyStrengthThreshold;
  }

  /**
   * Overlay the bad-feature anomalies on the timeline: a red line connecting the
   * checks where a strong feature (≥ threshold) was detected. The points
   * themselves get a red ring in drawDataPoints. The health trend line and the
   * reference threshold lines stay exactly as they are.
   */
  private drawAnomalyOverlay(width: number, height: number): void {
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const animatedPoints = Math.ceil(this.dataPoints.length * this.animationProgress);
    const strong = this.dataPoints.slice(0, animatedPoints).filter((p) => this.hasStrongAnomaly(p));
    if (strong.length < 2) return;

    this.ctx.strokeStyle = this.colors.error;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    strong.forEach((point, i) => {
      const x = this.getDataPointX(point, chartWidth);
      const y = this.getDataPointY(point.healthScore, chartHeight);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    });
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Render empty state when no data is available
   */
  private renderEmptyState(): void {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw empty state message
    this.ctx.font = '18px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(t('historyChart.noData'), width / 2, height / 2);

    // Draw icon (circle with line through it)
    this.ctx.beginPath();
    this.ctx.arc(width / 2, height / 2 - 50, 30, 0, 2 * Math.PI);
    this.ctx.strokeStyle = this.colors.textMuted;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(width / 2 - 20, height / 2 - 50);
    this.ctx.lineTo(width / 2 + 20, height / 2 - 50);
    this.ctx.strokeStyle = this.colors.textMuted;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * Draw grid lines for better readability
   */
  private drawGrid(width: number, height: number): void {
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    this.ctx.strokeStyle = this.colors.gridLine;
    this.ctx.lineWidth = 0.5;
    this.ctx.setLineDash([5, 5]);

    // Horizontal grid lines (health score)
    for (let i = 0; i <= 4; i++) {
      const y = this.padding.top + (chartHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding.left, y);
      this.ctx.lineTo(this.padding.left + chartWidth, y);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]);
  }

  /**
   * Draw threshold lines for health status boundaries
   */
  private drawThresholdLines(width: number, height: number): void {
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    // Healthy threshold (75%)
    const healthyY = this.padding.top + chartHeight * (1 - this.thresholds.healthy / 100);
    this.ctx.strokeStyle = this.colors.healthy + '40'; // 25% opacity
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([10, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding.left, healthyY);
    this.ctx.lineTo(this.padding.left + chartWidth, healthyY);
    this.ctx.stroke();

    // Uncertain threshold (50%)
    const uncertainY = this.padding.top + chartHeight * (1 - this.thresholds.uncertain / 100);
    this.ctx.strokeStyle = this.colors.warning + '40'; // 25% opacity
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([10, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding.left, uncertainY);
    this.ctx.lineTo(this.padding.left + chartWidth, uncertainY);
    this.ctx.stroke();

    this.ctx.setLineDash([]);
  }

  /**
   * Draw X and Y axes with labels
   */
  private drawAxes(width: number, height: number): void {
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    // Y-axis (health score)
    this.ctx.strokeStyle = this.colors.textMuted;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding.left, this.padding.top);
    this.ctx.lineTo(this.padding.left, this.padding.top + chartHeight);
    this.ctx.stroke();

    // Y-axis labels (0%, 25%, 50%, 75%, 100%)
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
      const value = 100 - i * 25;
      const y = this.padding.top + (chartHeight / 4) * i;
      this.ctx.fillText(`${value}%`, this.padding.left - 10, y);
    }

    // Y-axis title
    this.ctx.save();
    this.ctx.translate(15, this.padding.top + chartHeight / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.text;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(t('historyChart.yAxisLabel'), 0, 0);
    this.ctx.restore();

    // X-axis
    this.ctx.strokeStyle = this.colors.textMuted;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding.left, this.padding.top + chartHeight);
    this.ctx.lineTo(this.padding.left + chartWidth, this.padding.top + chartHeight);
    this.ctx.stroke();

    // X-axis labels (time)
    if (this.dataPoints.length > 0) {
      const firstPoint = this.dataPoints[0];
      const lastPoint = this.dataPoints[this.dataPoints.length - 1];

      this.ctx.font = '12px system-ui, -apple-system, sans-serif';
      this.ctx.fillStyle = this.colors.textMuted;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';

      // First timestamp
      this.ctx.fillText(
        this.formatTimestamp(firstPoint.timestamp),
        this.padding.left,
        this.padding.top + chartHeight + 10
      );

      // Last timestamp
      this.ctx.fillText(
        this.formatTimestamp(lastPoint.timestamp),
        this.padding.left + chartWidth,
        this.padding.top + chartHeight + 10
      );

      // Middle timestamp (if enough data points)
      if (this.dataPoints.length > 2) {
        const midIndex = Math.floor(this.dataPoints.length / 2);
        const midPoint = this.dataPoints[midIndex];
        this.ctx.fillText(
          this.formatTimestamp(midPoint.timestamp),
          this.padding.left + chartWidth / 2,
          this.padding.top + chartHeight + 10
        );
      }
    }

    // X-axis title
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.text;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(t('historyChart.xAxisLabel'), this.padding.left + chartWidth / 2, height - 5);
  }

  /**
   * Draw trend line connecting data points
   */
  private drawTrendLine(width: number, height: number): void {
    if (this.dataPoints.length < 2) return;

    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    // Create gradient for line color (green → yellow → red based on health)
    const firstPoint = this.dataPoints[0];
    const lastPoint = this.dataPoints[this.dataPoints.length - 1];

    const firstX = this.getDataPointX(firstPoint, chartWidth);
    const lastX = this.getDataPointX(lastPoint, chartWidth);

    const gradient = this.ctx.createLinearGradient(firstX, 0, lastX, 0);

    // Add color stops based on health scores
    this.dataPoints.forEach((point, index) => {
      const position = index / (this.dataPoints.length - 1);
      const color = this.getHealthColor(point.healthScore);
      gradient.addColorStop(position, color);
    });

    this.ctx.strokeStyle = gradient;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Draw the line with animation
    this.ctx.beginPath();
    const animatedPoints = Math.ceil(this.dataPoints.length * this.animationProgress);

    for (let i = 0; i < animatedPoints; i++) {
      const point = this.dataPoints[i];
      const x = this.getDataPointX(point, chartWidth);
      const y = this.getDataPointY(point.healthScore, chartHeight);

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  /**
   * Draw data points as circles
   */
  private drawDataPoints(width: number, height: number): void {
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const animatedPoints = Math.ceil(this.dataPoints.length * this.animationProgress);

    for (let i = 0; i < animatedPoints; i++) {
      const point = this.dataPoints[i];
      const x = this.getDataPointX(point, chartWidth);
      const y = this.getDataPointY(point.healthScore, chartHeight);
      const isHovered = this.hoveredPoint === point;

      // Draw outer circle (white glow for hovered)
      if (isHovered) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#FFFFFF40';
        this.ctx.fill();
      }

      const strongAnomaly = this.hasStrongAnomaly(point);

      // Draw main circle. A check with a strong "bad feature" is forced red so
      // it reads as anomalous even when the overall health score is still high.
      this.ctx.beginPath();
      this.ctx.arc(x, y, isHovered ? 7 : 5, 0, 2 * Math.PI);
      this.ctx.fillStyle = strongAnomaly
        ? this.colors.error
        : this.getHealthColor(point.healthScore);
      this.ctx.fill();

      // Draw border
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Extra red ring to highlight the bad feature.
      if (strongAnomaly) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, isHovered ? 11 : 9, 0, 2 * Math.PI);
        this.ctx.strokeStyle = this.colors.error;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }
  }

  /**
   * Draw tooltip for hovered data point
   */
  private drawTooltip(width: number, height: number): void {
    if (!this.hoveredPoint) return;

    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const x = this.getDataPointX(this.hoveredPoint, chartWidth);
    const y = this.getDataPointY(this.hoveredPoint.healthScore, chartHeight);

    // Tooltip content
    const scoreText = `${Math.round(this.hoveredPoint.healthScore)}%`;
    const statusText = this.getStatusLabel(this.hoveredPoint.status);
    const timeText = this.formatTimestamp(this.hoveredPoint.timestamp, true);
    const top = this.topAnomaly(this.hoveredPoint);
    const anomalyText = top
      ? t('historyChart.tooltipAnomaly', {
          freq: this.formatHz(top.frequency),
          strength: String(Math.round(top.strength)),
        })
      : '';

    // Measure tooltip size
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    const scoreWidth = this.ctx.measureText(scoreText).width;
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    const statusWidth = this.ctx.measureText(statusText).width;
    const timeWidth = this.ctx.measureText(timeText).width;
    const anomalyWidth = anomalyText ? this.ctx.measureText(anomalyText).width : 0;

    const tooltipWidth = Math.max(scoreWidth, statusWidth, timeWidth, anomalyWidth) + 20;
    const tooltipHeight = anomalyText ? 90 : 70;
    const tooltipPadding = 10;

    // Position tooltip (avoid edges)
    let tooltipX = x + 15;
    let tooltipY = y - tooltipHeight / 2;

    if (tooltipX + tooltipWidth > width - 10) {
      tooltipX = x - tooltipWidth - 15;
    }
    if (tooltipY < 10) {
      tooltipY = 10;
    }
    if (tooltipY + tooltipHeight > height - 10) {
      tooltipY = height - tooltipHeight - 10;
    }

    // Draw tooltip background with shadow
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 2;

    this.ctx.fillStyle = this.colors.background;
    this.ctx.strokeStyle = this.colors.gridLine;
    this.ctx.lineWidth = 1;

    this.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.shadowColor = 'transparent';

    // Draw tooltip content
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    // Score
    this.ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.getHealthColor(this.hoveredPoint.healthScore);
    this.ctx.fillText(scoreText, tooltipX + tooltipPadding, tooltipY + tooltipPadding);

    // Status
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.text;
    this.ctx.fillText(statusText, tooltipX + tooltipPadding, tooltipY + tooltipPadding + 22);

    // Timestamp
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText(timeText, tooltipX + tooltipPadding, tooltipY + tooltipPadding + 42);

    // Top bad feature (if any)
    if (anomalyText) {
      this.ctx.fillStyle = this.colors.error;
      this.ctx.fillText(anomalyText, tooltipX + tooltipPadding, tooltipY + tooltipPadding + 62);
    }
  }

  /** Format a frequency in Hz as a compact "Hz" / "kHz" string. */
  private formatHz(hz: number): string {
    return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
  }

  /**
   * Helper: Draw rounded rectangle
   */
  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  /**
   * Get X position for a data point
   */
  private getDataPointX(point: ChartDataPoint, chartWidth: number): number {
    if (this.dataPoints.length === 1) {
      return this.padding.left + chartWidth / 2;
    }

    const firstTimestamp = this.dataPoints[0].timestamp;
    const lastTimestamp = this.dataPoints[this.dataPoints.length - 1].timestamp;
    const timeRange = lastTimestamp - firstTimestamp;

    if (timeRange === 0) {
      return this.padding.left + chartWidth / 2;
    }

    const relativePosition = (point.timestamp - firstTimestamp) / timeRange;
    return this.padding.left + chartWidth * relativePosition;
  }

  /**
   * Get Y position for a health score
   */
  private getDataPointY(healthScore: number, chartHeight: number): number {
    // Invert Y axis (higher score = lower on canvas)
    return this.padding.top + chartHeight * (1 - healthScore / 100);
  }

  /**
   * Get color for health score
   */
  private getHealthColor(score: number): string {
    if (score >= this.thresholds.healthy) {
      return this.colors.healthy;
    } else if (score >= this.thresholds.uncertain) {
      return this.colors.warning;
    } else {
      return this.colors.error;
    }
  }

  /**
   * Get status label for status value
   */
  private getStatusLabel(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized === 'healthy') {
      return t('status.healthy');
    } else if (normalized === 'uncertain') {
      return t('status.uncertain');
    } else if (normalized === 'faulty') {
      return t('status.faulty');
    } else {
      return t('status.unknown');
    }
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: number, detailed: boolean = false): string {
    const date = new Date(timestamp);

    // For tooltips, always show detailed format
    if (detailed) {
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // For axis labels, show date only
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Destroy the component and clean up
   */
  public destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Stop observing theme changes (otherwise the observer pins this instance forever)
    if (this.darkQuery && this.onSchemeChange) {
      this.darkQuery.removeEventListener('change', this.onSchemeChange);
    }
    this.darkQuery = null;
    this.onSchemeChange = null;

    // Remove event listeners (same references as registered in setupEventListeners)
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onMouseLeave);
  }
}
