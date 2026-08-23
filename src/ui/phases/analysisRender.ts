/**
 * ZANOBOT - DIAGNOSIS ANALYSIS RENDERING HELPERS
 *
 * Pure, stateless helpers extracted from the Diagnose phase:
 * - dominantFrequency / topDeviationHz: spectral analysis on plain arrays
 * - renderAnalysisCanvas: draws the expert "Varianz / Frequenzabweichung" plot
 *
 * These contain no component state (no `this`); all inputs are passed in, so
 * they are trivially testable and reusable.
 */

import { t } from '../../i18n/index.js';

/** Reference spectrum for the analysis-canvas overlay. */
export interface ReferenceSpectrum {
  data: ArrayLike<number>;
  nyquist: number;
}

/** Minimal shape of the measurement feature vector needed for rendering. */
export interface AnalysisFeatureVector {
  features: ArrayLike<number>;
  frequencyRange: [number, number];
}

/** A frequency band where the measurement carries energy the reference doesn't. */
export interface DeviationFeature {
  /** Centre frequency of the band, in Hz. */
  frequency: number;
  /**
   * 0–100. The share of this band's measured energy that is NOT explained by
   * the reference: ~100 % is an essentially new tone, 50 % means roughly double
   * the reference energy, ~0 % means it merely tracks the reference.
   */
  strength: number;
}

/**
 * Find the frequency bands where the measurement adds the most relative energy
 * over the reference, returned strongest-first. Used to document "bad features"
 * of a check (a list, plus timeline markers when strength ≥ 50 %).
 *
 * Both spectra are unit-sum normalized (mic-level independent), lightly smoothed,
 * and scanned for local maxima of the positive difference. Energetically
 * insignificant noise-floor bins are skipped, and near-duplicate peaks merged.
 */
export function topDeviations(
  ref: ArrayLike<number>,
  meas: ArrayLike<number>,
  nyquist: number,
  maxCount = 6
): DeviationFeature[] {
  const n = Math.min(ref.length, meas.length);
  if (n < 4 || nyquist <= 0) return [];

  let sumRef = 0;
  let sumMeas = 0;
  for (let i = 0; i < n; i++) {
    sumRef += Math.max(0, ref[i]);
    sumMeas += Math.max(0, meas[i]);
  }
  if (sumRef <= 0 || sumMeas <= 0) return [];

  const measRel = new Float64Array(n);
  const refRel = new Float64Array(n);
  const diff = new Float64Array(n);
  let maxMeasRel = 0;
  for (let i = 0; i < n; i++) {
    measRel[i] = Math.max(0, meas[i]) / sumMeas;
    refRel[i] = Math.max(0, ref[i]) / sumRef;
    diff[i] = measRel[i] - refRel[i];
    if (measRel[i] > maxMeasRel) maxMeasRel = measRel[i];
  }
  if (maxMeasRel <= 0) return [];

  const energyFloor = 0.02 * maxMeasRel; // ignore near-silent bins (noise floor)
  const smooth = (i: number): number =>
    (diff[Math.max(0, i - 1)] + diff[i] + diff[Math.min(n - 1, i + 1)]) / 3;

  const candidates: { bin: number; sig: number; strength: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    const s = smooth(i);
    if (s <= 0 || measRel[i] < energyFloor) continue;
    if (s < smooth(i - 1) || s < smooth(i + 1)) continue; // local maximum only
    const strength = Math.max(0, Math.min(1, (measRel[i] - refRel[i]) / measRel[i])) * 100;
    candidates.push({ bin: i, sig: s, strength });
  }

  // Pick the most energy-significant peaks, suppressing near-duplicates.
  candidates.sort((a, b) => b.sig - a.sig);
  const minSepBins = Math.max(2, Math.round(n / 64));
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.some((p) => Math.abs(p.bin - c.bin) < minSepBins)) continue;
    picked.push(c);
    if (picked.length >= maxCount) break;
  }

  // Present strongest-first (by how "new" the band is).
  return picked
    .map((c) => ({ frequency: (c.bin / n) * nyquist, strength: Math.round(c.strength) }))
    .sort((a, b) => b.strength - a.strength);
}

/**
 * Find the frequency (Hz) where the measurement deviates most from the
 * reference (most newly-added relative energy). Both spectra are normalized
 * to unit sum first (mic-level independent); a light 3-bin smoothing makes
 * the peak robust. Returns null if nothing usable.
 */
export function topDeviationHz(
  ref: ArrayLike<number>,
  meas: ArrayLike<number>,
  nyquist: number
): number | null {
  const n = Math.min(ref.length, meas.length);
  if (n < 4 || nyquist <= 0) return null;

  let sumRef = 0;
  let sumMeas = 0;
  for (let i = 0; i < n; i++) {
    sumRef += Math.max(0, ref[i]);
    sumMeas += Math.max(0, meas[i]);
  }
  if (sumRef <= 0 || sumMeas <= 0) return null;

  const diff = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    diff[i] = Math.max(0, meas[i]) / sumMeas - Math.max(0, ref[i]) / sumRef;
  }

  let bestBin = -1;
  let bestVal = 0;
  // Skip bin 0 (DC); smooth over ±1 bin for robustness
  for (let i = 1; i < n; i++) {
    const s = (diff[i - 1] + diff[i] + (i + 1 < n ? diff[i + 1] : 0)) / 3;
    if (s > bestVal) {
      bestVal = s;
      bestBin = i;
    }
  }
  if (bestBin < 0) return null;
  return (bestBin / n) * nyquist;
}

/**
 * Frequency of the strongest spectral peak within the machine band
 * (50–8000 Hz). Used to compare the operating point (dominant tone) of the
 * measurement against the reference.
 */
export function dominantFrequency(data: ArrayLike<number>, nyquist: number): number {
  const n = data.length;
  if (n === 0 || !isFinite(nyquist) || nyquist <= 0) return 0;
  const minHz = 50;
  const maxHz = Math.min(8000, nyquist);
  let bestVal = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < n; i++) {
    const freq = ((i + 0.5) / n) * nyquist;
    if (freq < minHz || freq > maxHz) continue;
    if (data[i] > bestVal) {
      bestVal = data[i];
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return 0;
  return ((bestIdx + 0.5) / n) * nyquist;
}


/**
 * ZURÜCKGEHOLT AM 23.08.2026.
 *
 * Diese Funktion ging mit dem Abriss des alten Ergebnisdialogs (#100), weil sie
 * seit dem 22.08. in ein Fenster zeichnete, das nicht mehr aufging. Der
 * Auftraggeber hat entschieden, sie zurückzuholen — an den Platz, den der
 * Abriss ihr schon zugewiesen hatte: neben 2D und Gebirge ins Analyseblatt,
 * eigener Reiter.
 *
 * Unverändert übernommen. Wer sie liest, liest denselben Code wie am 22.08.;
 * neu ist nur, wer sie ruft.
 */
/**
 * Draw the frequency-analysis visualization on the expert "Varianz /
 * Frequenzabweichung" canvas.
 *
 * Plots the measured spectrum on logarithmic frequency (x) and logarithmic
 * amplitude/dB (y) axes as a status-coloured line, annotates the two dominant
 * spectral peaks with a dashed marker and their frequency value, and overlays
 * the reference spectrum (when available) as a faint dashed line.
 */
export function renderAnalysisCanvas(
  canvas: HTMLCanvasElement,
  featureVector: AnalysisFeatureVector,
  referenceSpectrum: ReferenceSpectrum | null,
  status: string
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas resolution to match display size (avoid blurry rendering)
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const displayWidth = rect.width;
  const displayHeight = rect.height;

  // Clear canvas
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const features = featureVector.features;
  const bins = features.length;
  if (bins === 0) return;

  const nyquist = featureVector.frequencyRange[1];
  if (!isFinite(nyquist) || nyquist <= 0) return;

  // Color palette based on diagnosis status
  const statusColors: Record<string, { line: string; fill: string }> = {
    healthy: { line: '#00E676', fill: 'rgba(0, 230, 118, 0.18)' },
    uncertain: { line: '#FFA726', fill: 'rgba(255, 167, 38, 0.18)' },
    faulty: { line: '#FF5252', fill: 'rgba(255, 82, 82, 0.18)' },
  };
  const colors = statusColors[status] || statusColors.uncertain;

  // Theme-aware axis/grid colours: the canvas sits on a themed background
  // (--bg-tertiary), so read the theme text colours so the labels and grid stay
  // readable on both light and dark themes (hard-coded white was invisible on
  // the light result screen).
  const rootStyle = getComputedStyle(document.documentElement);
  const axisColor = rootStyle.getPropertyValue('--text-secondary').trim() || '#607d8b';
  const refColor = rootStyle.getPropertyValue('--text-muted').trim() || '#90a4ae';

  // Plot area – margins for the dB axis (left), frequency axis (bottom)
  // and peak labels (top, up to two stacked rows).
  const padTop = 22;
  const padBottom = 13;
  const padLeft = 22;
  const padRight = 6;
  const plotW = Math.max(1, displayWidth - padLeft - padRight);
  const plotTop = padTop;
  const plotBottom = displayHeight - padBottom;
  const plotH = Math.max(1, plotBottom - plotTop);

  // Logarithmic frequency axis: map a frequency to an x pixel.
  const fMin = 20; // Hz – low end of the log range
  const fMax = nyquist;
  if (fMax <= fMin) return;
  const logMin = Math.log10(fMin);
  const logSpan = Math.log10(fMax) - logMin;
  const binFreq = (i: number) => ((i + 0.5) / bins) * nyquist;
  const freqToX = (freq: number) => {
    const clamped = Math.min(fMax, Math.max(fMin, freq));
    return padLeft + ((Math.log10(clamped) - logMin) / logSpan) * plotW;
  };

  // Logarithmic amplitude axis (dB relative to the spectrum max).
  let maxVal = 1e-12;
  for (let i = 0; i < bins; i++) {
    if (features[i] > maxVal) maxVal = features[i];
  }
  const floorDb = -42;
  const dbToY = (db: number) => {
    const norm = Math.min(1, Math.max(0, (db - floorDb) / -floorDb)); // 0..1
    return plotBottom - norm * plotH;
  };
  const ampToY = (value: number) => dbToY(10 * Math.log10(Math.max(value, 1e-12) / maxVal));

  // --- Horizontal grid + dB labels (logarithmic amplitude axis) ---
  // Major lines (labelled) at 0/-20/-40 plus fainter minor lines at -10/-30 so
  // the level can be estimated between the labels.
  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  const dbMajor = [0, -20, -40];
  for (const db of [0, -10, -20, -30, -40]) {
    const y = dbToY(db);
    const major = dbMajor.includes(db);
    ctx.globalAlpha = major ? 0.2 : 0.1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
    if (major) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = axisColor;
      ctx.fillText(`${db}`, padLeft - 3, Math.min(plotBottom - 4, Math.max(plotTop + 4, y)));
    }
  }
  ctx.globalAlpha = 1;
  // Unit caption for the amplitude axis
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = axisColor;
  ctx.fillText('dB', 1, 1);
  ctx.globalAlpha = 1;

  // --- Vertical grid + frequency labels ---
  // Labelled decades (100/1k/10k) plus fainter minor lines (50/200/500/2k/5k)
  // so the frequency of a feature can be read off more precisely.
  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  const fMajor = [100, 1000, 10000];
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    if (f <= fMin || f >= fMax) continue;
    const x = freqToX(f);
    const major = fMajor.includes(f);
    ctx.globalAlpha = major ? 0.2 : 0.1;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
    if (major) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = axisColor;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, plotBottom + 2);
    }
  }
  ctx.globalAlpha = 1;

  // --- Spectrum as a filled line on the log–log axes ---
  ctx.beginPath();
  ctx.moveTo(padLeft, plotBottom);
  for (let i = 0; i < bins; i++) {
    ctx.lineTo(freqToX(binFreq(i)), ampToY(features[i]));
  }
  ctx.lineTo(padLeft + plotW, plotBottom);
  ctx.closePath();
  ctx.fillStyle = colors.fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < bins; i++) {
    const x = freqToX(binFreq(i));
    const y = ampToY(features[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- Detect the top spectral peaks (local maxima above 20% of max) ---
  const peakThreshold = maxVal * 0.2;
  const candidates: { freq: number; value: number }[] = [];
  for (let i = 1; i < bins - 1; i++) {
    const v = features[i];
    if (v >= peakThreshold && v > features[i - 1] && v >= features[i + 1]) {
      candidates.push({ freq: binFreq(i), value: v });
    }
  }
  candidates.sort((a, b) => b.value - a.value);

  // Keep up to two peaks that are visually separated on the log axis.
  const peaks: { freq: number; value: number }[] = [];
  const minXGap = plotW * 0.12;
  for (const c of candidates) {
    if (peaks.length >= 2) break;
    const cx = freqToX(c.freq);
    if (peaks.every((p) => Math.abs(freqToX(p.freq) - cx) >= minXGap)) {
      peaks.push(c);
    }
  }

  // --- Peak markers: dashed vertical line + dot + numeric frequency label ---
  // Track placed label boxes so two close peaks stack on a second row instead
  // of overprinting each other (the old layout drew "117 Hz"/"305 Hz" on top
  // of one another).
  const placedLabels: { x0: number; x1: number; y: number }[] = [];
  for (const peak of peaks) {
    const x = freqToX(peak.freq);
    const y = ampToY(peak.value);

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colors.line;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const text =
      peak.freq >= 1000 ? `${(peak.freq / 1000).toFixed(1)} kHz` : `${Math.round(peak.freq)} Hz`;
    ctx.font = 'bold 10px sans-serif';
    ctx.textBaseline = 'top';
    const textW = ctx.measureText(text).width;
    const tx = Math.min(displayWidth - textW - 2, Math.max(2, x - textW / 2));
    // Stack onto a second row when this label would overlap an existing one.
    let ty = 1;
    while (placedLabels.some((p) => p.y === ty && tx < p.x1 + 3 && tx + textW > p.x0 - 3)) {
      ty += 11;
    }
    placedLabels.push({ x0: tx, x1: tx + textW, y: ty });
    ctx.fillStyle = colors.line;
    ctx.fillText(text, tx, ty);
  }

  // --- Reference spectrum overlay (faint dashed line) for deviation context ---
  const ref = referenceSpectrum;
  if (ref && ref.data.length > 0 && ref.nyquist > 0) {
    let refMax = 1e-12;
    for (let i = 0; i < ref.data.length; i++) {
      if (ref.data[i] > refMax) refMax = ref.data[i];
    }
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const freq = binFreq(i);
      const ri = Math.min(
        ref.data.length - 1,
        Math.max(0, Math.round((freq / ref.nyquist) * ref.data.length))
      );
      const db = 10 * Math.log10(Math.max(ref.data[ri], 1e-12) / refMax);
      const norm = Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
      const x = freqToX(freq);
      const y = plotBottom - norm * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = refColor;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Legend (top-right): measurement (solid colour) vs reference (dashed grey)
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const legendX = displayWidth - 3;
    ctx.fillStyle = colors.line;
    ctx.fillText(t('diagnose.display.irisMeasurement'), legendX, plotTop + 4);
    ctx.fillStyle = refColor;
    ctx.fillText(t('diagnose.display.irisReference'), legendX, plotTop + 15);
    ctx.textAlign = 'left';
  }
}
