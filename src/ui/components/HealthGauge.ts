/**
 * ZANOBOT - HEALTH GAUGE COMPONENT
 *
 * Visual gauge/dial that displays health score (0-100%).
 * Color-coded: Green (healthy), Yellow (uncertain), Red (faulty).
 */

import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { setCanvasSize } from '@utils/canvasUtils.js';

export class HealthGauge {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private score: number = 0;
  private customStatus: string | undefined = undefined;
  private animationFrame: number | null = null;

  // Theme-aware colors (read from CSS variables)
  private colors = {
    healthy: '#00E676',
    warning: '#FFB74D',
    error: '#FF5252',
    text: '#FFFFFF',
    textMuted: '#888888',
    background: '#2a2a2a'
  };

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
      background: styles.getPropertyValue('--bg-tertiary').trim() || '#2a2a2a'
    };
  }

  /**
   * Observe theme changes and update colors accordingly
   */
  private observeThemeChanges(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          this.updateThemeColors();
          this.render();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  /**
   * Draw gauge with score and status (Real-time compatible)
   *
   * CRITICAL FIX: Comprehensive input validation to prevent canvas errors
   *
   * @param score - Health score (0-100)
   * @param status - Status label (optional, auto-calculated if omitted)
   */
  public draw(score: number, status?: string): void {
    // CRITICAL FIX: Validate score is a valid number
    if (!isFinite(score) || score < 0 || score > 100) {
      logger.error(`❌ HealthGauge: Invalid score: ${score}, using 0`);
      this.score = 0;
    } else {
      this.score = Math.max(0, Math.min(100, score));
    }

    // CRITICAL FIX: Validate status if provided
    if (status !== undefined) {
      const validStatuses = ['healthy', 'uncertain', 'faulty', 'UNKNOWN'];
      if (!validStatuses.includes(status)) {
        logger.error(`❌ HealthGauge: Invalid status: ${status}, using UNKNOWN`);
        this.customStatus = 'UNKNOWN';
      } else {
        this.customStatus = status;
      }
    } else {
      this.customStatus = status;
    }

    this.render();
  }

  /**
   * Update and render the gauge with new score
   *
   * CRITICAL FIX: Input validation to prevent invalid scores
   *
   * @param score - Health score (0-100)
   * @param animate - Whether to animate the transition
   */
  public updateScore(score: number, animate: boolean = true): void {
    // CRITICAL FIX: Validate score is a valid number
    if (!isFinite(score) || score < 0 || score > 100) {
      logger.error(`❌ HealthGauge.updateScore: Invalid score: ${score}, using 0`);
      score = 0;
    }

    const targetScore = Math.max(0, Math.min(100, score));

    // CRITICAL FIX: Reset custom status to allow auto-calculated status
    this.customStatus = undefined;

    if (animate) {
      this.animateToScore(targetScore);
    } else {
      this.score = targetScore;
      this.render();
    }
  }

  private animateToScore(targetScore: number): void {
    const startScore = this.score;
    const diff = targetScore - startScore;
    const duration = 1000; // 1 second
    const startTime = Date.now();

    const animate = (): void => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      this.score = startScore + diff * eased;
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

  private render(): void {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const centerX = width / 2;
    const centerY = height / 2;
    // CRITICAL FIX: Prevent negative radius for small/hidden canvas
    const radius = Math.max(0, Math.min(width, height) / 2 - 20);

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw background arc (theme-aware)
    this.drawArc(centerX, centerY, radius, 0, 100, this.colors.background, 8);

    // Draw score arc
    const color = this.getScoreColor(this.score);
    this.drawArc(centerX, centerY, radius, 0, this.score, color, 10);

    // Draw center text
    this.drawText(centerX, centerY, this.score);
  }

  private drawArc(
    x: number,
    y: number,
    radius: number,
    startScore: number,
    endScore: number,
    color: string,
    lineWidth: number
  ): void {
    const startAngle = this.scoreToAngle(startScore);
    const endAngle = this.scoreToAngle(endScore);

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, startAngle, endAngle);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  private scoreToAngle(score: number): number {
    // Map score (0-100) to angle (-135° to +135°, 270° total arc)
    const startAngle = -135 * (Math.PI / 180); // -135°
    const totalAngle = 270 * (Math.PI / 180); // 270°
    return startAngle + (score / 100) * totalAngle;
  }

  private drawText(x: number, y: number, score: number): void {
    const scoreText = Math.round(score).toString();

    // Draw score value centered (theme-aware text color)
    this.ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.text;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(scoreText, x, y - 10);

    // Draw percentage symbol beside the number, without affecting centering
    // Measure the score text width to position % just to its right
    const scoreWidth = this.ctx.measureText(scoreText).width;
    this.ctx.font = '24px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('%', x + scoreWidth / 2 + 2, y - 10);

    // Draw status label (use custom status if provided, otherwise auto-calculate)
    // Translate technical status values to localized display text
    let status: string;
    if (this.customStatus !== undefined) {
      const normalized = this.customStatus.toLowerCase();
      if (normalized === 'healthy') {
        status = t('status.healthy');
      } else if (normalized === 'uncertain') {
        status = t('status.uncertain');
      } else if (normalized === 'faulty') {
        status = t('status.faulty');
      } else if (normalized === 'unknown') {
        status = t('status.unknown');
      } else {
        status = this.customStatus;
      }
    } else {
      status = this.getStatusLabel(score);
    }
    this.ctx.font = '16px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = this.getScoreColor(score);
    this.ctx.fillText(status, x, y + 35);
  }

  private getScoreColor(score: number): string {
    // Use theme-aware status colors from CSS variables
    if (score >= 75) {
      return this.colors.healthy;
    } else if (score >= 50) {
      return this.colors.warning;
    } else {
      return this.colors.error;
    }
  }

  private getStatusLabel(score: number): string {
    if (score >= 75) {
      return t('healthGauge.normal');
    } else if (score >= 50) {
      return t('healthGauge.deviation');
    } else {
      return t('healthGauge.abnormal');
    }
  }

  /**
   * Destroy the component and clean up
   */
  public destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}
