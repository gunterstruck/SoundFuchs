/**
 * Tests für die Spektrogramm-Matrix (3D-„Gebirge"-Ansicht) und die reinen
 * Render-Helfer (Höhenfeld-Mesh, Farbverlauf).
 *
 * Kernaussagen:
 * 1. Matrix-Geometrie: 512 Bins → 128 Spalten, Zeilen ≤ 240, Werte ∈ [0,1].
 * 2. Max-Pooling erhält Peaks: eine Spektrallinie und ein kurzer Transient
 *    bleiben an der richtigen Stelle sichtbar (nichts wird weggemittelt).
 * 3. dB-Normierung: lauteste Stelle = 1, Rauschboden deutlich darunter.
 * 4. Mesh: korrekte Vertex-/Dreieckszahlen, Farben in [0,1].
 */

import { describe, it, expect } from 'vitest';
import {
  buildSpectrogramMatrix,
  SPECTROGRAM_COLS,
  SPECTROGRAM_MAX_ROWS,
} from './spectrogram.js';
import { buildHeightFieldMesh, turboColor } from '@ui/components/Spectrogram3D.js';
import type { FeatureVector } from '@data/types.js';

const BINS = 512;
const HOP = 0.066;

/** Frame mit Rauschboden + optionaler Linie bei `peakBin`. */
function frame(peakBin: number | null, peakEnergy = 1): FeatureVector {
  const abs = new Float64Array(BINS).fill(1e-6);
  if (peakBin !== null) abs[peakBin] = peakEnergy;
  const sum = abs.reduce((s, v) => s + v, 0);
  const rel = Float64Array.from(abs, (v) => v / sum);
  return {
    features: rel,
    absoluteFeatures: abs,
    bins: BINS,
    frequencyRange: [0, 24000],
    rmsAmplitude: 0.1,
  };
}

describe('buildSpectrogramMatrix', () => {
  it('produces the display geometry (128 cols, ≤240 rows, values in [0,1])', () => {
    const features = Array.from({ length: 600 }, () => frame(100));
    const m = buildSpectrogramMatrix(features, HOP)!;
    expect(m.cols).toBe(SPECTROGRAM_COLS);
    expect(m.rows).toBeLessThanOrEqual(SPECTROGRAM_MAX_ROWS);
    expect(m.durationSec).toBeCloseTo(600 * HOP, 6);
    expect(m.maxFreqHz).toBe(24000);
    for (const v of m.values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a spectral line at the right column and the loudest point at 1', () => {
    const features = Array.from({ length: 60 }, () => frame(200));
    const m = buildSpectrogramMatrix(features, HOP)!;
    const col = Math.floor(200 / Math.ceil(BINS / m.cols)); // Bin → Spalte
    const rowMid = Math.floor(m.rows / 2);
    expect(m.values[rowMid * m.cols + col]).toBeCloseTo(1, 6);
    // Nachbarspalte ohne Linie: deutlich niedriger (Rauschboden)
    expect(m.values[rowMid * m.cols + col + 4]).toBeLessThan(0.3);
  });

  it('preserves a single short transient through the time reduction (max pooling)', () => {
    // 600 Frames (Reduktion aktiv), genau EIN Frame trägt einen Transienten
    const features = Array.from({ length: 600 }, (_, i) =>
      i === 300 ? frame(400, 5) : frame(null)
    );
    const m = buildSpectrogramMatrix(features, HOP)!;
    const col = Math.floor(400 / Math.ceil(BINS / m.cols));
    let best = 0;
    for (let r = 0; r < m.rows; r++) best = Math.max(best, m.values[r * m.cols + col]);
    expect(best).toBeCloseTo(1, 6); // Transient überlebt als Maximum
  });

  it('returns null without usable frames', () => {
    expect(buildSpectrogramMatrix([], HOP)).toBeNull();
  });
});

describe('buildHeightFieldMesh', () => {
  it('builds the expected vertex/triangle counts and valid colors', () => {
    const features = Array.from({ length: 40 }, () => frame(100));
    const m = buildSpectrogramMatrix(features, HOP)!;
    const mesh = buildHeightFieldMesh(m);

    expect(mesh.vertexCount).toBe(m.rows * m.cols);
    expect(mesh.triangleCount).toBe((m.rows - 1) * (m.cols - 1) * 2);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.colors.length).toBe(mesh.vertexCount * 3);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);

    for (const c of mesh.colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    // Alle Indizes zeigen auf existierende Vertices
    for (const i of mesh.indices) expect(i).toBeLessThan(mesh.vertexCount);
  });
});

describe('turboColor', () => {
  it('maps low→blue-ish and high→red-ish, clamped to [0,1]', () => {
    const low = turboColor(0);
    const high = turboColor(1);
    expect(low[2]).toBeGreaterThan(low[0]); // Blau dominiert unten
    expect(high[0]).toBeGreaterThan(high[2]); // Rot dominiert oben
    for (const c of [...turboColor(-1), ...turboColor(2)]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
