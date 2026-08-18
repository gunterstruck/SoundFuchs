/**
 * FLACHE HÖR-AUSWAHL
 *
 * Die 3D-Ansicht erklärt das Klanggebirge, ist aber kein Schneidwerkzeug: Ziehen
 * dreht dort die Kamera. Diese kleine 2D-Ansicht hat genau eine Geste. Ein
 * Rechteck bestimmt Zeit und Frequenz; derselbe Bereich kann anschließend im
 * Normalzustand, in der Messung und im Unterschied gesehen und gehört werden.
 */

import {
  createSpectralSelectionBuffer,
  type SpectralSelection,
} from '@core/audio/spectralSelection.js';
import { getFineSpectrogramMatrix } from '@core/dsp/fineSpectrogram.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import {
  compensateSpectrogramGain,
  freqToColumn,
  rescaleSpectrogramMatrix,
  type SpectrogramMatrix,
} from '@core/dsp/spectrogram.js';
import { formatHz } from '@utils/formatHz.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';

export interface NormalizedSelectionRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SpectrogramSelectionPanelOptions {
  sources: Partial<Record<SpectrogramSelectionSource, () => AudioBuffer | null>>;
  /** Nachträgliche Hörverstärkung je Quelle; wird nur aus dem Vergleichsmaßstab entfernt. */
  listeningGain?: Partial<Record<SpectrogramSelectionSource, () => number>>;
  initialSource?: SpectrogramSelectionSource;
  /** Eine neue Geometrie ist noch keine neue Hörhilfe; alte Ausgabe entwerten. */
  onSelectionChange?: () => void;
  /** Quellenwechsel entwertet die alte Hörhilfe ebenfalls. */
  onSourceChange?: (source: SpectrogramSelectionSource) => void;
}

export type SpectrogramSelectionSource = 'reference' | 'measurement' | 'difference';

let nextSelectionPanelId = 0;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function frequencyAt(position: number, edges: Float32Array): number {
  const columns = edges.length - 1;
  if (columns < 1) return 0;
  const exact = clamp(position) * columns;
  const index = Math.min(columns - 1, Math.floor(exact));
  const fraction = Math.min(1, exact - index);
  return edges[index] + (edges[index + 1] - edges[index]) * fraction;
}

/** Dieselbe Achsenzuordnung für Bild, Beschriftung und Audioauswahl. */
export function rectToSpectralSelection(
  rect: NormalizedSelectionRect,
  durationSec: number,
  bandEdgesHz: Float32Array
): SpectralSelection {
  const x0 = Math.min(clamp(rect.x0), clamp(rect.x1));
  const x1 = Math.max(clamp(rect.x0), clamp(rect.x1));
  const y0 = Math.min(clamp(rect.y0), clamp(rect.y1));
  const y1 = Math.max(clamp(rect.y0), clamp(rect.y1));
  return {
    startSec: x0 * durationSec,
    endSec: x1 * durationSec,
    lowHz: frequencyAt(1 - y1, bandEdgesHz),
    highHz: frequencyAt(1 - y0, bandEdgesHz),
  };
}

/** Eine fachliche Zeit-/Frequenzauswahl in die Geometrie einer Quelle übertragen. */
export function spectralSelectionToRect(
  selection: SpectralSelection,
  durationSec: number,
  bandEdgesHz: Float32Array
): NormalizedSelectionRect {
  const columns = Math.max(1, bandEdgesHz.length - 1);
  const duration = Math.max(0.001, durationSec);
  const lowPosition = freqToColumn(selection.lowHz, bandEdgesHz) / columns;
  const highPosition = freqToColumn(selection.highHz, bandEdgesHz) / columns;
  return {
    x0: clamp(selection.startSec / duration),
    x1: clamp(selection.endSec / duration),
    y0: clamp(1 - highPosition),
    y1: clamp(1 - lowPosition),
  };
}

export class SpectrogramSelectionPanel {
  public readonly element: HTMLDetailsElement;
  public readonly playButton: HTMLButtonElement;

  private readonly sourceProviders: Partial<
    Record<SpectrogramSelectionSource, () => AudioBuffer | null>
  >;
  private readonly listeningGainProviders: Partial<
    Record<SpectrogramSelectionSource, () => number>
  >;
  private readonly onSelectionChange: () => void;
  private readonly onSourceChange: (source: SpectrogramSelectionSource) => void;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly loading: HTMLElement;
  private source: AudioBuffer | null = null;
  private matrix: SpectrogramMatrix | null = null;
  private baseImage: HTMLCanvasElement | null = null;
  private activeSource: SpectrogramSelectionSource;
  private sourceButtons: Array<{
    key: SpectrogramSelectionSource;
    el: HTMLButtonElement;
  }> = [];
  private prepared = new Map<
    SpectrogramSelectionSource,
    { source: AudioBuffer; matrix: SpectrogramMatrix; image: HTMLCanvasElement }
  >();
  private pendingSelection: SpectralSelection | null = null;
  private sharedScale = false;
  private scaleButton: HTMLButtonElement;
  private rect: NormalizedSelectionRect = { x0: 0, x1: 1, y0: 0.22, y1: 0.78 };
  private dragStart: { x: number; y: number } | null = null;
  private rectBeforeDrag: NormalizedSelectionRect | null = null;
  private preparing: SpectrogramSelectionSource | null = null;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SpectrogramSelectionPanelOptions) {
    this.sourceProviders = options.sources;
    this.listeningGainProviders = options.listeningGain ?? {};
    this.onSelectionChange = options.onSelectionChange ?? (() => {});
    this.onSourceChange = options.onSourceChange ?? (() => {});
    const available = (['reference', 'measurement', 'difference'] as const).filter((key) =>
      Boolean(this.sourceProviders[key])
    );
    this.activeSource =
      options.initialSource && available.includes(options.initialSource)
        ? options.initialSource
        : available.includes('difference')
          ? 'difference'
          : (available[0] ?? 'measurement');
    const panelId = ++nextSelectionPanelId;

    const details = document.createElement('details');
    details.className = 'hoerlupe-auswahl';
    this.element = details;

    const summary = document.createElement('summary');
    summary.textContent = t('hoerlupe.auswahlOeffnen');
    details.appendChild(summary);

    const hint = document.createElement('p');
    hint.className = 'muted small hoerlupe-auswahl-hinweis';
    hint.textContent = t('hoerlupe.auswahlHinweis');
    details.appendChild(hint);

    const sources = document.createElement('div');
    sources.className = 'hoerlupe-auswahl-quellen';
    sources.setAttribute('role', 'group');
    sources.setAttribute('aria-label', t('hoerlupe.auswahlQuellenTitel'));
    for (const key of available) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'listen-btn hoerlupe-auswahl-quelle';
      button.textContent = this.sourceName(key);
      button.classList.toggle('listen-btn-active', key === this.activeSource);
      button.setAttribute('aria-pressed', key === this.activeSource ? 'true' : 'false');
      button.onclick = () => this.selectSource(key);
      sources.appendChild(button);
      this.sourceButtons.push({ key, el: button });
    }
    details.appendChild(sources);

    this.scaleButton = document.createElement('button');
    this.scaleButton.type = 'button';
    this.scaleButton.className = 'listen-btn hoerlupe-auswahl-massstab';
    this.scaleButton.textContent = t('spectro3d.compareScale');
    this.scaleButton.setAttribute('aria-pressed', 'false');
    this.scaleButton.hidden = available.length < 2;
    this.scaleButton.onclick = () => {
      this.sharedScale = !this.sharedScale;
      this.scaleButton.setAttribute('aria-pressed', this.sharedScale ? 'true' : 'false');
      this.scaleButton.textContent = this.sharedScale
        ? t('spectro3d.detailScale')
        : t('spectro3d.compareScale');
      const cached = this.prepared.get(this.activeSource);
      if (cached) {
        this.baseImage = this.imageFor(cached);
        this.draw();
      }
    };
    details.appendChild(this.scaleButton);

    this.loading = document.createElement('p');
    this.loading.className = 'muted small hoerlupe-auswahl-laedt';
    this.loading.textContent = t('hoerlupe.auswahlLaedt');
    this.loading.hidden = true;
    details.appendChild(this.loading);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hoerlupe-spektrogramm';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'group');
    this.canvas.setAttribute('aria-label', t('hoerlupe.auswahlCanvasLabel'));
    this.canvas.hidden = true;
    details.appendChild(this.canvas);

    const axes = document.createElement('div');
    axes.className = 'hoerlupe-auswahl-achsen muted small';
    axes.innerHTML = `<span>${t('hoerlupe.auswahlAchseFrequenz')}</span><span>${t('hoerlupe.auswahlAchseZeit')}</span>`;
    details.appendChild(axes);

    this.status = document.createElement('p');
    this.status.id = `hoerlupe-auswahl-status-${panelId}`;
    this.status.className = 'hoerlupe-auswahl-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    details.appendChild(this.status);
    this.canvas.setAttribute('aria-describedby', this.status.id);

    this.playButton = document.createElement('button');
    this.playButton.type = 'button';
    this.playButton.className = 'listen-btn hoerlupe-auswahl-spielen';
    this.playButton.textContent = this.playLabel();
    this.playButton.disabled = true;
    this.playButton.setAttribute('aria-pressed', 'false');
    details.appendChild(this.playButton);

    details.addEventListener('toggle', () => {
      if (details.open) this.prepare();
    });
    this.attachInteraction();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(this.canvas);
    }
  }

  private sourceName(source: SpectrogramSelectionSource): string {
    if (source === 'reference') return t('spectro3d.sourceReference');
    if (source === 'measurement') return t('spectro3d.sourceMeasurement');
    return t('spectro3d.sourceDifference');
  }

  public selectedSource(): SpectrogramSelectionSource {
    return this.activeSource;
  }

  public sourceBuffer(): AudioBuffer | null {
    return this.source;
  }

  public playLabel(): string {
    return t('hoerlupe.auswahlAnhoerenQuelle', { quelle: this.sourceName(this.activeSource) });
  }

  /** Dieselbe fachliche Auswahl auf eine andere Quelle legen. */
  private selectSource(source: SpectrogramSelectionSource): void {
    if (source === this.activeSource) return;
    this.pendingSelection = this.selection();
    this.activeSource = source;
    for (const item of this.sourceButtons) {
      const active = item.key === source;
      item.el.classList.toggle('listen-btn-active', active);
      item.el.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    this.onSelectionChange();
    this.onSourceChange(source);
    this.usePrepared(source);
    if (this.element.open) this.prepare();
  }

  private usePrepared(source: SpectrogramSelectionSource): boolean {
    const cached = this.prepared.get(source);
    if (!cached) {
      this.source = null;
      this.matrix = null;
      this.baseImage = null;
      this.canvas.hidden = true;
      this.playButton.disabled = true;
      this.playButton.textContent = this.playLabel();
      return false;
    }
    this.source = cached.source;
    this.matrix = cached.matrix;
    this.baseImage = this.imageFor(cached);
    if (this.pendingSelection) {
      this.rect = spectralSelectionToRect(
        this.pendingSelection,
        cached.source.duration,
        cached.matrix.bandEdgesHz
      );
      this.pendingSelection = null;
    }
    this.canvas.hidden = false;
    this.playButton.disabled = false;
    this.playButton.textContent = this.playLabel();
    this.updateStatus();
    this.draw();
    return true;
  }

  /** Die aktive Quelle und Matrix erst rechnen, wenn der Nutzer das Werkzeug öffnet. */
  private prepare(): void {
    if (this.usePrepared(this.activeSource)) return;
    if (this.preparing === this.activeSource) return;
    const requestedSource = this.activeSource;
    this.preparing = requestedSource;
    this.loading.hidden = false;
    setTimeout(() => {
      if (this.destroyed) {
        this.preparing = null;
        return;
      }
      try {
        const source = this.sourceProviders[requestedSource]?.() ?? null;
        const normalizedMatrix = source
          ? getFineSpectrogramMatrix(source, DEFAULT_DSP_CONFIG.hopSize)
          : null;
        const matrix = normalizedMatrix
          ? compensateSpectrogramGain(
              normalizedMatrix,
              this.listeningGainProviders[requestedSource]?.() ?? 1
            )
          : null;
        if (source && matrix) {
          const image = this.buildBaseImage(matrix);
          this.prepared.set(requestedSource, { source, matrix, image });
          if (requestedSource === this.activeSource) {
            this.source = source;
            this.matrix = matrix;
            this.baseImage = this.imageFor({ source, matrix, image });
            if (this.pendingSelection) {
              this.rect = spectralSelectionToRect(
                this.pendingSelection,
                source.duration,
                matrix.bandEdgesHz
              );
              this.pendingSelection = null;
            } else if (this.prepared.size === 1) {
              this.setUsefulDefault();
            }
            this.canvas.hidden = false;
            this.playButton.disabled = false;
            this.playButton.textContent = this.playLabel();
            this.updateStatus();
            this.draw();
          }
        } else {
          this.status.textContent = t('hoerlupe.auswahlNichtVerfuegbar');
        }
      } catch (error) {
        logger.warn('2D-Hör-Auswahl konnte nicht vorbereitet werden:', error);
        this.status.textContent = t('hoerlupe.auswahlNichtVerfuegbar');
      } finally {
        if (this.preparing === requestedSource) this.preparing = null;
        if (requestedSource === this.activeSource) this.loading.hidden = true;
      }
    }, 50);
  }

  /** Startet mit dem ganzen Zeitraum und dem anschaulichen Beispielband 1–4 kHz. */
  private setUsefulDefault(): void {
    if (!this.matrix) return;
    const edges = this.matrix.bandEdgesHz;
    const columns = this.matrix.cols;
    const maximum = edges[columns];
    const low = Math.min(1_000, maximum * 0.25);
    const high = Math.min(4_000, maximum);
    const lowPosition = freqToColumn(low, edges) / columns;
    const highPosition = freqToColumn(high, edges) / columns;
    this.rect = {
      x0: 0,
      x1: 1,
      y0: clamp(1 - highPosition),
      y1: clamp(1 - lowPosition),
    };
  }

  /** Matrix einmal in ein Pixelbild verwandeln; Auswahlrahmen bleibt separat. */
  private buildBaseImage(matrix: SpectrogramMatrix): HTMLCanvasElement {
    const { rows, cols, values } = matrix;
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = rows;
    imageCanvas.height = cols;
    const context = imageCanvas.getContext('2d');
    if (!context) return imageCanvas;
    const image = context.createImageData(rows, cols);
    for (let time = 0; time < rows; time++) {
      for (let frequency = 0; frequency < cols; frequency++) {
        const value = values[time * cols + frequency];
        const pixel = ((cols - 1 - frequency) * rows + time) * 4;
        const red = Math.round(255 * Math.min(1, Math.max(0, 1.7 * value - 0.45)));
        const green = Math.round(255 * Math.min(1, Math.max(0, 1.8 * value)));
        const blue = Math.round(255 * Math.min(1, Math.max(0, 1.2 - value)));
        image.data[pixel] = red;
        image.data[pixel + 1] = green;
        image.data[pixel + 2] = blue;
        image.data[pixel + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return imageCanvas;
  }

  private imageFor(cached: {
    source: AudioBuffer;
    matrix: SpectrogramMatrix;
    image: HTMLCanvasElement;
  }): HTMLCanvasElement {
    if (!this.sharedScale) return cached.image;
    const ceiling = Math.max(
      ...[...this.prepared.values()].map((entry) => entry.matrix.maxDb),
      cached.matrix.maxDb
    );
    const scaled = rescaleSpectrogramMatrix(cached.matrix, ceiling);
    return scaled === cached.matrix ? cached.image : this.buildBaseImage(scaled);
  }

  private attachInteraction(): void {
    const point = (event: PointerEvent): { x: number; y: number } => {
      const bounds = this.canvas.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / Math.max(1, bounds.width)),
        y: clamp((event.clientY - bounds.top) / Math.max(1, bounds.height)),
      };
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.matrix) return;
      this.rectBeforeDrag = this.sortedRect();
      this.dragStart = point(event);
      this.rect = {
        x0: this.dragStart.x,
        x1: this.dragStart.x,
        y0: this.dragStart.y,
        y1: this.dragStart.y,
      };
      this.canvas.setPointerCapture(event.pointerId);
      this.draw();
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragStart) return;
      const current = point(event);
      this.rect = { x0: this.dragStart.x, x1: current.x, y0: this.dragStart.y, y1: current.y };
      this.draw();
    });
    const finish = (event: PointerEvent): void => {
      if (!this.dragStart) return;
      const current = point(event);
      const start = this.dragStart;
      this.dragStart = null;
      if (Math.abs(current.x - start.x) < 0.015 || Math.abs(current.y - start.y) < 0.025) {
        if (this.rectBeforeDrag) this.rect = this.rectBeforeDrag;
      } else {
        this.rect = { x0: start.x, x1: current.x, y0: start.y, y1: current.y };
        this.onSelectionChange();
      }
      this.rectBeforeDrag = null;
      this.updateStatus();
      this.draw();
    };
    this.canvas.addEventListener('pointerup', finish);
    this.canvas.addEventListener('pointercancel', () => {
      if (this.rectBeforeDrag) this.rect = this.rectBeforeDrag;
      this.dragStart = null;
      this.rectBeforeDrag = null;
      this.updateStatus();
      this.draw();
    });
    this.canvas.addEventListener('keydown', (event) => this.onKey(event));
  }

  /** Pfeile verschieben; Umschalt+Pfeile verändern die rechte/obere Kante. */
  private onKey(event: KeyboardEvent): void {
    if (!this.matrix || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return;
    event.preventDefault();
    const step = 0.025;
    let { x0, x1, y0, y1 } = this.sortedRect();
    if (event.shiftKey) {
      if (event.key === 'ArrowLeft') x1 = Math.max(x0 + 0.02, x1 - step);
      if (event.key === 'ArrowRight') x1 = Math.min(1, x1 + step);
      if (event.key === 'ArrowUp') y0 = Math.max(0, y0 - step);
      if (event.key === 'ArrowDown') y0 = Math.min(y1 - 0.03, y0 + step);
    } else {
      const width = x1 - x0;
      const height = y1 - y0;
      if (event.key === 'ArrowLeft') {
        x0 = Math.max(0, x0 - step);
        x1 = x0 + width;
      }
      if (event.key === 'ArrowRight') {
        x1 = Math.min(1, x1 + step);
        x0 = x1 - width;
      }
      if (event.key === 'ArrowUp') {
        y0 = Math.max(0, y0 - step);
        y1 = y0 + height;
      }
      if (event.key === 'ArrowDown') {
        y1 = Math.min(1, y1 + step);
        y0 = y1 - height;
      }
    }
    this.rect = { x0, x1, y0, y1 };
    this.onSelectionChange();
    this.updateStatus();
    this.draw();
  }

  private sortedRect(): NormalizedSelectionRect {
    return {
      x0: Math.min(this.rect.x0, this.rect.x1),
      x1: Math.max(this.rect.x0, this.rect.x1),
      y0: Math.min(this.rect.y0, this.rect.y1),
      y1: Math.max(this.rect.y0, this.rect.y1),
    };
  }

  public selection(): SpectralSelection | null {
    if (!this.matrix || !this.source) return null;
    return rectToSpectralSelection(
      this.sortedRect(),
      this.source.duration,
      this.matrix.bandEdgesHz
    );
  }

  public selectionLabel(): string {
    const selection = this.selection();
    if (!selection) return t('hoerlupe.auswahlQuelle');
    return t('hoerlupe.auswahlBeschreibung', {
      quelle: this.sourceName(this.activeSource),
      vonZeit: selection.startSec.toFixed(1),
      bisZeit: selection.endSec.toFixed(1),
      vonHz: formatHz(selection.lowHz),
      bisHz: formatHz(selection.highHz),
    });
  }

  private updateStatus(): void {
    const label = this.selectionLabel();
    this.status.textContent = label;
    const selection = this.selection();
    if (selection) {
      this.playButton.dataset.selectionSource = this.activeSource;
      this.playButton.dataset.selectionStart = selection.startSec.toFixed(3);
      this.playButton.dataset.selectionEnd = selection.endSec.toFixed(3);
      this.playButton.dataset.selectionLow = selection.lowHz.toFixed(1);
      this.playButton.dataset.selectionHigh = selection.highHz.toFixed(1);
    }
  }

  public createSelectedBuffer(): ReturnType<typeof createSpectralSelectionBuffer> {
    const selection = this.selection();
    if (!this.source || !selection) return null;
    return createSpectralSelectionBuffer(this.source, selection);
  }

  private draw(): void {
    if (!this.matrix || !this.baseImage || this.canvas.hidden) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round((this.canvas.clientWidth || 520) * ratio));
    const height = Math.max(1, Math.round((this.canvas.clientHeight || 210) * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    context.drawImage(this.baseImage, 0, 0, width, height);
    const rect = this.sortedRect();
    const x = rect.x0 * width;
    const y = rect.y0 * height;
    const selectedWidth = (rect.x1 - rect.x0) * width;
    const selectedHeight = (rect.y1 - rect.y0) * height;
    context.fillStyle = 'rgba(255, 255, 255, 0.13)';
    context.fillRect(x, y, selectedWidth, selectedHeight);
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, 2 * ratio);
    context.setLineDash([7 * ratio, 4 * ratio]);
    context.strokeRect(x, y, selectedWidth, selectedHeight);
    context.setLineDash([]);
  }

  public destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}
