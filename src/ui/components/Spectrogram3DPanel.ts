/**
 * ZANOBOT — 3D-SPEKTROGRAMM ALS BEDIENBARE EINHEIT
 *
 * Umschalter („🏔️ 3D-Ansicht") plus Quellen-Chips (Messung / Referenz /
 * Differenz) plus die Ansicht selbst. Vorher lagen diese ~90 Zeilen inline im
 * Verlaufs-Modal; da die Ansicht jetzt auch auf dem Ergebnis-Screen erscheint,
 * wären sie sonst zweimal da — und zwei Kopien laufen auseinander.
 *
 * Alles lazy: Matrix, WebGL und die (teure) spektrale Subtraktion entstehen erst
 * beim Tap auf den jeweiligen Chip, nicht beim Anzeigen des Screens.
 *
 * Die DIFFERENZ ist dasselbe Signal, das der Hörknopf „nur die Differenz"
 * abspielt (`getDifferenceTake`) — Auge und Ohr zeigen denselben Gegenstand.
 */

import {
  DEFAULT_SPECTROGRAM_CAMERA,
  Spectrogram3D,
  type Spectrogram3DCameraState,
} from './Spectrogram3D.js';
import { DifferenceStrengthIndicator } from './DifferenceStrengthIndicator.js';
import {
  compensateSpectrogramGain,
  rescaleSpectrogramMatrix,
  type SpectrogramMatrix,
} from '@core/dsp/spectrogram.js';
import { getFineSpectrogramMatrix } from '@core/dsp/fineSpectrogram.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { getDifferenceTake } from '@core/audio/differenceTake.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

export type Spectro3DSource = 'measurement' | 'reference' | 'difference';

export interface Spectrogram3DPanelOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
}

export class Spectrogram3DPanel {
  /** Wurzelelement zum Einhängen (Chip-Zeile + Ansicht). */
  public readonly element: HTMLElement;
  /** False, wenn es nichts zu zeigen gibt — dann nicht einhängen. */
  public readonly hasContent: boolean;

  private host: HTMLElement;
  private view: Spectrogram3D | null = null;
  private shown = false;
  private toggle: HTMLButtonElement;
  private reset: HTMLButtonElement;
  private scale: HTMLButtonElement;
  private chips: Array<{ key: Spectro3DSource; el: HTMLButtonElement }> = [];
  private matrixCache = new Map<Spectro3DSource, SpectrogramMatrix | null>();
  private reference: AudioBuffer | null;
  private measurement: AudioBuffer | null;
  private activeKey: Spectro3DSource | null = null;
  private preferredKey: Spectro3DSource | null = null;
  private cameraState: Spectrogram3DCameraState = { ...DEFAULT_SPECTROGRAM_CAMERA };
  private strength = new DifferenceStrengthIndicator();
  private sharedScale = false;
  private mountRequest = 0;

  /** WebGL vorhanden? Ohne wird die Ansicht gar nicht angeboten. */
  static isSupported(): boolean {
    return Spectrogram3D.isSupported();
  }

  constructor(options: Spectrogram3DPanelOptions) {
    this.reference = options.reference ?? null;
    this.measurement = options.measurement ?? null;

    const root = document.createElement('div');
    root.className = 'spectro3d-panel';
    this.element = root;

    const sources: Spectro3DSource[] = [];
    if (this.measurement) sources.push('measurement');
    if (this.reference) sources.push('reference');
    // Differenz braucht beide Aufnahmen.
    if (this.reference && this.measurement) sources.push('difference');

    this.hasContent = sources.length > 0 && Spectrogram3DPanel.isSupported();

    const row = document.createElement('div');
    row.className = 'spectro3d-toggle-row';
    this.host = document.createElement('div');

    this.toggle = this.makeChip(`🏔️ ${t('spectro3d.show')}`, () => this.setShown(!this.shown));
    row.appendChild(this.toggle);

    for (const key of sources) {
      const el = this.makeChip(this.labelOf(key), () => this.mount(key));
      el.style.display = 'none';
      row.appendChild(el);
      this.chips.push({ key, el });
    }
    this.preferredKey = sources[0] ?? null;

    this.reset = this.makeChip(t('spectro3d.resetView'), () => {
      this.view?.resetCamera();
      this.cameraState = { ...DEFAULT_SPECTROGRAM_CAMERA };
    });
    this.reset.classList.add('spectro3d-reset');
    this.reset.style.display = 'none';
    row.appendChild(this.reset);

    this.scale = this.makeChip(t('spectro3d.compareScale'), () => {
      this.sharedScale = !this.sharedScale;
      this.scale.setAttribute('aria-pressed', this.sharedScale ? 'true' : 'false');
      this.scale.textContent = this.sharedScale
        ? t('spectro3d.detailScale')
        : t('spectro3d.compareScale');
      if (this.activeKey) this.doMount(this.activeKey);
    });
    this.scale.classList.add('spectro3d-scale');
    this.scale.setAttribute('aria-pressed', 'false');
    this.scale.style.display = 'none';
    row.appendChild(this.scale);

    root.appendChild(row);
    root.appendChild(this.strength.element);
    root.appendChild(this.host);

    if (!this.hasContent) root.style.display = 'none';
  }

  private labelOf(key: Spectro3DSource): string {
    if (key === 'measurement') return t('spectro3d.sourceMeasurement');
    if (key === 'reference') return t('spectro3d.sourceReference');
    return t('spectro3d.sourceDifference');
  }

  private makeChip(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'listen-btn';
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  private setShown(shown: boolean): void {
    this.shown = shown;
    if (shown) {
      this.toggle.textContent = `🏔️ ${t('spectro3d.hide')}`;
      // Nur eine Quelle → Chips wären eine Wahl ohne Alternative.
      const multi = this.chips.length > 1;
      for (const c of this.chips) c.el.style.display = multi ? '' : 'none';
      this.reset.style.display = '';
      this.scale.style.display = multi ? '' : 'none';
      const key = this.preferredKey ?? this.chips[0]?.key;
      if (key) this.mount(key);
    } else {
      this.mountRequest++;
      this.toggle.textContent = `🏔️ ${t('spectro3d.show')}`;
      for (const c of this.chips) c.el.style.display = 'none';
      this.reset.style.display = 'none';
      this.scale.style.display = 'none';
      if (this.view) this.cameraState = this.view.cameraState();
      this.view?.destroy();
      this.view = null;
      this.activeKey = null;
    }
  }

  /** Matrix der Quelle bauen (gemerkt) — `null`, wenn sie sich nicht bilden lässt. */
  private matrixOf(key: Spectro3DSource): SpectrogramMatrix | null {
    const cached = this.matrixCache.get(key);
    if (cached !== undefined) return cached;

    let matrix: SpectrogramMatrix | null = null;
    try {
      if (key === 'difference') {
        const take =
          this.reference && this.measurement
            ? getDifferenceTake(this.reference, this.measurement)
            : null;
        // Auch die Differenz fein: sonst hätten die drei Chips verschiedene
        // Frequenzachsen und wären nicht vergleichbar.
        if (take) this.strength.update(take.metrics);
        const normalized = take
          ? getFineSpectrogramMatrix(take.buffer, DEFAULT_DSP_CONFIG.hopSize)
          : null;
        matrix =
          take && normalized
            ? compensateSpectrogramGain(normalized, take.metrics.listeningGain)
            : null;
      } else {
        const buffer = key === 'measurement' ? this.measurement : this.reference;
        // Feine Auflösung (2,93 Hz statt 46,875 Hz): unten ein FFT-Bin je Spalte.
        // Erst dadurch sind tieffrequente Ordnungen überhaupt sichtbar — bei einem
        // 4-Zylinder-Viertakt mit 1800 min⁻¹ liegen 15 und 30 Hz sonst in derselben
        // Spalte. Reine Anzeige: der Bewertungspfad bleibt bei seinen 512 Bändern.
        matrix = buffer ? getFineSpectrogramMatrix(buffer, DEFAULT_DSP_CONFIG.hopSize) : null;
      }
    } catch (error) {
      logger.warn(`3D-Spektrogramm (${key}) konnte nicht erstellt werden:`, error);
      matrix = null;
    }

    this.matrixCache.set(key, matrix);
    return matrix;
  }

  private mount(key: Spectro3DSource): void {
    if (this.activeKey === key && this.view) return;
    const request = ++this.mountRequest;

    const chip = this.chips.find((c) => c.key === key)?.el;
    const needsWork = !this.matrixCache.has(key);
    if (chip && needsWork && key === 'difference') {
      // Spektrale Subtraktion blockiert den Thread; erst den Zustand zeichnen.
      const original = chip.textContent;
      chip.textContent = t('spectro3d.computing');
      setTimeout(() => {
        chip.textContent = original;
        if (request !== this.mountRequest || !this.shown) return;
        this.doMount(key);
      }, 0);
      return;
    }
    if (request !== this.mountRequest) return;
    this.doMount(key);
  }

  private doMount(key: Spectro3DSource): void {
    const sourceMatrix = this.matrixOf(key);
    if (!sourceMatrix) {
      // Ehrlich statt stumm: eine Differenz, die sich nicht bilden lässt (zu kurze
      // Aufnahme, zu ähnliche Signale), darf nicht wie ein Fehler wirken.
      this.host.innerHTML = `<p class="spectro3d-empty">${t('spectro3d.unavailable')}</p>`;
      this.activeKey = null;
      return;
    }
    const ceiling = Math.max(
      ...[...this.matrixCache.values()]
        .filter((matrix): matrix is SpectrogramMatrix => Boolean(matrix))
        .map((matrix) => matrix.maxDb)
    );
    const matrix = this.sharedScale
      ? rescaleSpectrogramMatrix(sourceMatrix, ceiling)
      : sourceMatrix;
    this.host.innerHTML = '';
    if (this.view) this.cameraState = this.view.cameraState();
    this.view?.destroy();
    this.view = new Spectrogram3D(matrix, this.cameraState);
    this.host.appendChild(this.view.element);
    this.activeKey = key;
    this.preferredKey = key;
    for (const c of this.chips) c.el.classList.toggle('listen-btn-active', c.key === key);
  }

  public destroy(): void {
    if (this.view) this.cameraState = this.view.cameraState();
    this.view?.destroy();
    this.view = null;
    this.element.remove();
  }
}
