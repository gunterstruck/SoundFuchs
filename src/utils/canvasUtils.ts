/**
 * ZANOBOT - CANVAS UTILITIES
 *
 * Shared utility functions for canvas initialization and manipulation.
 * These utilities ensure consistent DPI-aware canvas setup across all
 * canvas-based components (AudioVisualizer, HealthGauge, etc.).
 */

/**
 * Initialize a canvas element with DPI-aware sizing.
 *
 * This function:
 * 1. Scales the canvas dimensions by device pixel ratio (DPR)
 * 2. Sets up the context transform for crisp rendering on HiDPI displays
 * 3. Resets any existing transforms to prevent cumulative scaling
 *
 * @param canvas - The canvas element to initialize
 * @param ctx - The 2D rendering context for the canvas
 *
 * @example
 * ```typescript
 * const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
 * const ctx = canvas.getContext('2d');
 * if (ctx) {
 *   setCanvasSize(canvas, ctx);
 * }
 * ```
 */
export function setCanvasSize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  // Reset transform to prevent cumulative scaling on repeated calls
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

/**
 * Get canvas dimensions adjusted for device pixel ratio.
 *
 * Returns the logical dimensions (CSS pixels) for drawing operations.
 * Use these values when drawing to ensure correct positioning.
 *
 * @param canvas - The canvas element
 * @returns Object with width and height in logical pixels
 *
 * @example
 * ```typescript
 * const { width, height } = getCanvasDimensions(canvas);
 * ctx.fillRect(0, 0, width, height);
 * ```
 */
export function getCanvasDimensions(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  return {
    width: canvas.width / dpr,
    height: canvas.height / dpr,
  };
}
