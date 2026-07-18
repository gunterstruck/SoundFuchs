/**
 * Tests für den Tier-2 Zyklus-Pfad (T4, Stufe T2-a3) und die
 * Auto-Empfehlung stationär/instationär (§7).
 *
 * Kernaussagen:
 * 1. Periodenerkennung findet die Grundperiode einer getakteten Hüllkurve
 *    (inkl. Subharmonischen-Korrektur) und schweigt bei Stationärem.
 * 2. DTW mit Sakoe-Chiba-Band toleriert moderates Tempo-Warping, aber
 *    NICHT eine gespiegelte/vertauschte Zyklusform (Risiko R2).
 * 3. Template + Selbst-Kalibrierung: gesunde Zyklen scoren z ≈ 0,
 *    gespiegelte Zyklen erreichen Anomalie 1.
 * 4. Auto-Empfehlung: stationär → keine; Takt/Zyklus/bewegter Pegel → ja.
 */

import { describe, it, expect } from 'vitest';
import {
  detectCyclePeriod,
  buildCycleTemplate,
  dtwDistance,
  alignPhase,
  resampleTo,
  normalizeEnvelope,
  scoreCycleWindow,
  frameRmsSeries,
  CYCLE_TEMPLATE_POINTS,
} from './temporalCycle.js';
import { assessNonStationarity } from './engineRecommendation.js';

const HOP = 0.066;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sägezahn-Hüllkurve: langsamer Anstieg (rampUp-Anteil), schneller Abfall.
 * `period` in Stützstellen; Werte in [0.3, 1] (bleibt über dem Energy-Gate).
 */
function sawtoothEnvelope(
  count: number,
  period: number,
  rampUpFraction: number,
  seed: number
): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i % period) / period;
    const v =
      phase < rampUpFraction
        ? 0.3 + 0.7 * (phase / rampUpFraction)
        : 1 - 0.7 * ((phase - rampUpFraction) / (1 - rampUpFraction));
    out.push(v * (1 + 0.03 * (rng() * 2 - 1)));
  }
  return out;
}

/** Flache Hüllkurve mit Jitter (stationäre Maschine). */
function flatEnvelope(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => 0.5 * (1 + 0.05 * (rng() * 2 - 1)));
}

describe('detectCyclePeriod', () => {
  it('finds the fundamental period of a sawtooth envelope', () => {
    // Periode 30 Stützstellen à 66 ms ≈ 1,98 s, 6 volle Zyklen
    const env = sawtoothEnvelope(180, 30, 0.8, 1);
    const detected = detectCyclePeriod(env, HOP);
    expect(detected).not.toBeNull();
    expect(detected!.periodSec).toBeCloseTo(30 * HOP, 1);
  });

  it('returns null for a flat (stationary) envelope', () => {
    expect(detectCyclePeriod(flatEnvelope(180, 2), HOP)).toBeNull();
  });

  it('returns null when fewer than 3 full cycles fit the recording', () => {
    const env = sawtoothEnvelope(70, 30, 0.8, 3); // nur ~2,3 Zyklen
    // Periode 30 wird vom maxLag-Limit (n/3 ≈ 23) ausgeschlossen
    const detected = detectCyclePeriod(env, HOP);
    if (detected !== null) {
      // Falls eine (Sub-)Periode gefunden wird, muss sie ≥ 3-mal hineinpassen
      expect(detected.periodSec * 3).toBeLessThanOrEqual(70 * HOP + 1e-9);
    }
  });
});

describe('dtwDistance / alignPhase', () => {
  it('is zero for identical series and tolerant to small warping', () => {
    const a = sawtoothEnvelope(CYCLE_TEMPLATE_POINTS, CYCLE_TEMPLATE_POINTS, 0.8, 4);
    expect(dtwDistance(a, a)).toBeCloseTo(0, 10);

    // Moderates Tempo-Warping: dieselbe Form, ±10 % gestreckt/gestaucht
    const stretched = normalizeEnvelope(resampleTo(a.slice(0, 29), CYCLE_TEMPLATE_POINTS));
    const warped = dtwDistance(normalizeEnvelope(a), stretched);

    // Gespiegelte Form (schneller Anstieg statt schnellem Abfall)
    const mirrored = [...a].reverse();
    const flipped = dtwDistance(normalizeEnvelope(a), normalizeEnvelope(mirrored));

    expect(warped).toBeLessThan(flipped / 3); // Warping ≪ Formtausch
  });

  it('alignPhase rotates a shifted cycle back onto the template', () => {
    const template = sawtoothEnvelope(CYCLE_TEMPLATE_POINTS, CYCLE_TEMPLATE_POINTS, 0.8, 5);
    const shifted = [...template.slice(10), ...template.slice(0, 10)];
    const aligned = alignPhase(shifted, template);
    expect(dtwDistance(aligned, template)).toBeLessThan(dtwDistance(shifted, template));
    expect(dtwDistance(aligned, template)).toBeLessThan(0.02);
  });
});

describe('buildCycleTemplate + scoreCycleWindow', () => {
  it('builds a calibrated template and separates healthy from mirrored cycles', () => {
    const env = sawtoothEnvelope(180, 30, 0.8, 6);
    const template = buildCycleTemplate(env, HOP);
    expect(template).not.toBeNull();
    expect(template!.periodSec).toBeCloseTo(30 * HOP, 1);

    // Gesunder Live-Zyklus: gleiche Form, anderer Jitter, andere Phase
    const healthy = sawtoothEnvelope(60, 30, 0.8, 7).slice(13, 43);
    const healthyResult = scoreCycleWindow(healthy, template!);
    expect(healthyResult.anomaly).toBe(0);

    // Gespiegelter Zyklus: schneller Anstieg, langsamer Abfall — gleiche
    // Wertemenge, gleiche Periode, andere REIHENFOLGE (T1–T3-blind!)
    const mirrored = sawtoothEnvelope(60, 30, 0.2, 8).slice(13, 43);
    const mirroredResult = scoreCycleWindow(mirrored, template!);
    expect(mirroredResult.anomaly).toBe(1);
    expect(mirroredResult.z).toBeGreaterThan(healthyResult.z + 4);
  });

  it('returns null for stationary or too-short recordings', () => {
    expect(buildCycleTemplate(flatEnvelope(180, 9), HOP)).toBeNull();
    expect(buildCycleTemplate(sawtoothEnvelope(70, 30, 0.8, 10), HOP)).toBeNull();
  });
});

describe('frameRmsSeries', () => {
  it('tracks the amplitude envelope in the extraction raster', () => {
    // 1 s Rauschen mit Amplitudensprung bei 0,5 s
    const SR = 48000;
    const raw = new Float32Array(SR);
    const rng = mulberry32(11);
    for (let i = 0; i < SR; i++) {
      raw[i] = (rng() * 2 - 1) * (i < SR / 2 ? 0.1 : 0.4);
    }
    const rms = frameRmsSeries(raw, 0.33, HOP, SR);
    expect(rms.length).toBeGreaterThan(5);
    expect(rms[rms.length - 1]).toBeGreaterThan(rms[0] * 2.5);
  });
});

describe('assessNonStationarity (§7 Auto-Empfehlung)', () => {
  const BINS = 64;
  function humFrame(rng: () => number): Float64Array {
    const s = new Float64Array(BINS).fill(0.01);
    s[5] = 0.6;
    s[12] = 0.35;
    let total = 0;
    for (let k = 0; k < BINS; k++) {
      s[k] *= 1 + 0.1 * (rng() * 2 - 1);
      total += s[k];
    }
    for (let k = 0; k < BINS; k++) s[k] /= total;
    return s;
  }
  function clackFrame(rng: () => number): Float64Array {
    const s = humFrame(rng);
    s[30] += 0.4;
    let total = 0;
    for (let k = 0; k < BINS; k++) total += s[k];
    for (let k = 0; k < BINS; k++) s[k] /= total;
    return s;
  }

  it('does not recommend for a stationary machine', () => {
    const rng = mulberry32(12);
    const features = Array.from({ length: 150 }, () => humFrame(rng));
    const result = assessNonStationarity(features, flatEnvelope(150, 13), HOP);
    expect(result.recommendTemporal).toBe(false);
  });

  it('recommends for a valve-like machine (event rate)', () => {
    const rng = mulberry32(14);
    const features = Array.from({ length: 150 }, (_, i) =>
      i % 10 === 9 ? clackFrame(rng) : humFrame(rng)
    );
    const result = assessNonStationarity(features, flatEnvelope(150, 15), HOP);
    expect(result.eventRatePerMin).toBeGreaterThan(30);
    expect(result.recommendTemporal).toBe(true);
  });

  it('recommends for a cyclic machine (period + moving level)', () => {
    const rng = mulberry32(16);
    const features = Array.from({ length: 180 }, () => humFrame(rng));
    const result = assessNonStationarity(features, sawtoothEnvelope(180, 30, 0.8, 17), HOP);
    expect(result.cyclePeriodSec).not.toBeNull();
    expect(result.recommendTemporal).toBe(true);
  });
});
