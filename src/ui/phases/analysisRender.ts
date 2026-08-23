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

