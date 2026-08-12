/**
 * ZANOBOT - SPECTRUM COMPARISON (Expert overlay for the Listen modal)
 *
 * A static frequency comparison between a reference recording and a past
 * measurement: both are reduced to their mean relative spectrum (the same
 * 512-bin ESD features the engines use), then overlaid on a canvas so the user
 * can SEE where the measurement gained energy versus the reference — the visual
 * counterpart to the "listen to the difference" control next to it.
 *
 * Expert-only, additive: it never changes the score or the existing listen UI.
 * Uses RELATIVE features (loudness-independent), so it compares spectral SHAPE,
 * consistent with how GMIA / spectral-cosine judge the machine.
 */

import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

export interface SpectrumComparisonOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
}

interface MeanSpectrum {
  spectrum: Float64Array;
  nyquist: number;
}

/**
 * Loudness-independent average spectrum of a recording.
 *
 * Reuses the app-wide averageSpectrum() primitive (the same one behind the iris
 * fingerprint and the diagnose ghost) and normalizes it to unit sum, so the
 * reference and the measurement sit on a shared scale regardless of recording
 * level — otherwise a simply louder take would show "extra energy" everywhere.
 */
function relativeSpectrum(buffer: AudioBuffer): MeanSpectrum | null {
  try {
    const raw = averageSpectrum(buffer);
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += raw[i];
    if (!(sum > 0)) return null;
    const spectrum = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) spectrum[i] = raw[i] / sum;
    return { spectrum, nyquist: buffer.sampleRate / 2 };
  } catch (error) {
    logger.warn('Spectrum comparison: averageSpectrum failed:', error);
    return null;
  }
}

/** Human-readable frequency: "240 Hz", "1.2 kHz", "12 kHz". */
function formatHz(hz: number): string {
  if (hz >= 10000) return `${Math.round(hz / 1000)} kHz`;
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

interface SpectralPeak {
  bin: number;
  freq: number;
  value: number;
}

/**
 * Top-N spectral peaks (local maxima), kept apart in log-frequency so the
 * labels never cluster on neighbouring bins of the same tonal component.
 */
function findPeaks(spectrum: Float64Array, freqPerBin: number, count: number): SpectralPeak[] {
  const candidates: SpectralPeak[] = [];
  for (let i = 2; i < spectrum.length - 2; i++) {
    const v = spectrum[i];
    if (
      v > spectrum[i - 1] &&
      v >= spectrum[i + 1] &&
      v > spectrum[i - 2] &&
      v >= spectrum[i + 2]
    ) {
      candidates.push({ bin: i, freq: i * freqPerBin, value: v });
    }
  }
  candidates.sort((a, b) => b.value - a.value);
  const chosen: SpectralPeak[] = [];
  for (const p of candidates) {
    if (chosen.length >= count) break;
    // Require ~0.1 decade separation (≈26 %) between labelled peaks.
    if (chosen.every((c) => Math.abs(Math.log10(p.freq) - Math.log10(c.freq)) > 0.1)) {
      chosen.push(p);
    }
  }
  return chosen;
}

export class SpectrumComparison {
  /** Root element to insert into the DOM. */
  public readonly element: HTMLElement;
  /** True when a comparison could be computed (both takes present & long enough). */
  public readonly hasContent: boolean;

  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly ref: MeanSpectrum | null;
  private readonly meas: MeanSpectrum | null;

  constructor(options: SpectrumComparisonOptions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'spectrum-comparison';
    this.element = wrapper;

    this.ref = options.reference ? relativeSpectrum(options.reference) : null;
    this.meas = options.measurement ? relativeSpectrum(options.measurement) : null;
    // A comparison needs BOTH takes; otherwise there is nothing to overlay.
    this.hasContent = Boolean(this.ref && this.meas);
    if (!this.hasContent) return;

    const title = document.createElement('div');
    title.className = 'spectrum-comparison-title';
    title.textContent = t('diagnose.display.spectrumTitle');
    wrapper.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.className = 'spectrum-comparison-canvas';
    this.canvas = canvas;
    wrapper.appendChild(canvas);

    const legend = document.createElement('div');
    legend.className = 'spectrum-comparison-legend';
    legend.innerHTML =
      `<span class="spectrum-legend-item spectrum-legend-ref">${t('diagnose.display.spectrumReference')}</span>` +
      `<span class="spectrum-legend-item spectrum-legend-meas">${t('diagnose.display.spectrumMeasurement')}</span>` +
      `<span class="spectrum-legend-item spectrum-legend-diff">${t('diagnose.display.spectrumDifference')}</span>`;
    wrapper.appendChild(legend);

    // Draw once attached (so clientWidth is known) and on every resize.
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  private draw(): void {
    const canvas = this.canvas;
    if (!canvas || !this.ref || !this.meas) return;

    const cssWidth = canvas.clientWidth || 320;
    const cssHeight = 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padL = 26; // room for dB labels on the left
    const padR = 8;
    const padTop = 14; // room for peak labels at the top
    const padBottom = 18; // room for frequency labels
    const plotW = Math.max(1, cssWidth - padL - padR);
    const plotH = Math.max(1, cssHeight - padTop - padBottom);

    const refS = this.ref.spectrum;
    const measS = this.meas.spectrum;
    const bins = Math.min(refS.length, measS.length);
    const nyquist = this.meas.nyquist || this.ref.nyquist;
    const freqPerBin = bins > 1 ? nyquist / (bins - 1) : nyquist;

    // --- Log FREQUENCY x-axis (from the first non-DC bin up to Nyquist) ---
    const fMin = Math.max(20, freqPerBin);
    const fMax = Math.max(fMin * 2, nyquist);
    const logFMin = Math.log10(fMin);
    const logFMax = Math.log10(fMax);
    const xAt = (freq: number) =>
      padL + ((Math.log10(Math.max(freq, fMin)) - logFMin) / (logFMax - logFMin)) * plotW;

    // --- Log AMPLITUDE y-axis (dB relative to the shared peak) ---
    let maxVal = 1e-12;
    for (let i = 0; i < bins; i++) {
      if (refS[i] > maxVal) maxVal = refS[i];
      if (measS[i] > maxVal) maxVal = measS[i];
    }
    const FLOOR_DB = -50; // anything quieter than -50 dB sits on the baseline
    const yAt = (value: number) => {
      const db = 10 * Math.log10(Math.max(value, 1e-12) / maxVal);
      const norm = Math.max(0, Math.min(1, (db - FLOOR_DB) / (0 - FLOOR_DB)));
      return padTop + plotH - norm * plotH;
    };

    // --- dB grid lines + labels (0, -10, -20, -30, -40 dB) ---
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let db = 0; db >= FLOOR_DB + 10; db -= 10) {
      const norm = (db - FLOOR_DB) / (0 - FLOOR_DB);
      const y = padTop + plotH - norm * plotH;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${db}`, padL - 4, y);
    }

    // --- Vertical frequency grid at decade ticks (100 Hz, 1k, 10k …) ---
    const freqTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(
      (f) => f >= fMin && f <= fMax
    );
    ctx.textBaseline = 'top';
    for (const f of freqTicks) {
      const x = xAt(f);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'center';
      ctx.fillText(formatHz(f), x, padTop + plotH + 4);
    }

    // --- Excess energy (measurement above reference): the audible difference ---
    ctx.fillStyle = 'rgba(229,72,77,0.35)';
    for (let i = 1; i < bins; i++) {
      if (measS[i] > refS[i]) {
        const x0 = xAt(i * freqPerBin);
        const x1 = xAt((i + 1) * freqPerBin);
        const yM = yAt(measS[i]);
        const yR = yAt(refS[i]);
        ctx.fillRect(x0, yM, Math.max(1, x1 - x0), yR - yM);
      }
    }

    // --- Reference: filled translucent "ghost" + outline ---
    ctx.beginPath();
    ctx.moveTo(xAt(freqPerBin), padTop + plotH);
    for (let i = 1; i < bins; i++) ctx.lineTo(xAt(i * freqPerBin), yAt(refS[i]));
    ctx.lineTo(padL + plotW, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(138,151,168,0.20)';
    ctx.fill();
    ctx.beginPath();
    for (let i = 1; i < bins; i++) {
      const x = xAt(i * freqPerBin);
      const y = yAt(refS[i]);
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(170,182,196,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Measurement: solid line on top ---
    ctx.beginPath();
    for (let i = 1; i < bins; i++) {
      const x = xAt(i * freqPerBin);
      const y = yAt(measS[i]);
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#2bb6c4';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Peak labels: dominant frequencies of THIS measurement ---
    //
    // Die Zahl bekommt eine eigene dunkle Unterlage und mehr Abstand zum Punkt.
    // Vorher stand sie 4 px über dem Peak und lag damit im Linienzug selbst — auf
    // einem echten Telefon war ausgerechnet die dominante Frequenz unlesbar,
    // also der Wert, den man an dieser Stelle ablesen will.
    const peaks = findPeaks(measS, freqPerBin, 3);
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'bottom';
    const LABEL_GAP = 11; // über dem Punkt, außerhalb der 1,5 px breiten Linie
    // Bereits belegte Kästchen: zwei nahe Peaks ergaben sonst übereinander
    // liegende Zahlen („1(21 kHz" statt „16 kHz" und „21 kHz"). Der Punkt bleibt
    // in jedem Fall gezeichnet — nur die Zahl entfällt, wo kein Platz ist.
    const taken: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    for (const p of peaks) {
      const x = xAt(p.freq);
      const y = yAt(p.value);
      ctx.fillStyle = '#2bb6c4';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const text = formatHz(p.freq);
      const align: CanvasTextAlign =
        x > padL + plotW - 32 ? 'right' : x < padL + 32 ? 'left' : 'center';
      const tw = ctx.measureText(text).width;
      const baseline = Math.max(padTop + 10, y - LABEL_GAP);
      const left = align === 'right' ? x - tw : align === 'left' ? x : x - tw / 2;
      const box = { x0: left - 3, x1: left + tw + 3, y0: baseline - 10, y1: baseline + 1 };
      if (taken.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) {
        continue;
      }
      taken.push(box);

      ctx.fillStyle = 'rgba(13,20,32,0.78)';
      ctx.fillRect(left - 2, baseline - 9, tw + 4, 11);

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.textAlign = align;
      ctx.fillText(text, x, baseline);
    }
  }

  /** Release the resize observer. */
  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
