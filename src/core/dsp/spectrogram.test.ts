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
  compensateSpectrogramGain,
  freqToColumn,
  logBandEdges,
  rescaleSpectrogramMatrix,
  SPECTROGRAM_COLS,
  SPECTROGRAM_MAX_ROWS,
  SPECTROGRAM_MIN_FREQ_HZ,
} from './spectrogram.js';
import {
  buildAxisGeometry,
  buildHeightFieldMesh,
  niceTimeStep,
  projectToScreen,
  normalizeSpectrogramCameraState,
  turboColor,
} from '@ui/components/Spectrogram3D.js';
import type { FeatureVector } from '@data/types.js';

const BINS = 512;
const HOP = 0.066;

describe('3D-Kamerazustand', () => {
  it('bewahrt gültige Perspektiven und klemmt unbrauchbare Werte', () => {
    expect(normalizeSpectrogramCameraState({ yaw: 2.1, pitch: 0.5, distance: 4 })).toEqual({
      yaw: 2.1,
      pitch: 0.5,
      distance: 4,
    });
    const clamped = normalizeSpectrogramCameraState({ yaw: Number.NaN, pitch: 99, distance: 0 });
    expect(clamped.yaw).toBeCloseTo(0.6);
    expect(clamped.pitch).toBeLessThan(2);
    expect(clamped.distance).toBeGreaterThan(0);
  });
});

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
    // Bin → Frequenz → Spalte, über dieselbe Log-Abbildung wie die Matrix.
    const hz = (200 + 0.5) * (24000 / BINS);
    const col = Math.floor(freqToColumn(hz, m.bandEdgesHz));
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
    const hz = (400 + 0.5) * (24000 / BINS);
    const col = Math.floor(freqToColumn(hz, m.bandEdgesHz));
    let best = 0;
    for (let r = 0; r < m.rows; r++) best = Math.max(best, m.values[r * m.cols + col]);
    expect(best).toBeCloseTo(1, 6); // Transient überlebt als Maximum
  });

  it('returns null without usable frames', () => {
    expect(buildSpectrogramMatrix([], HOP)).toBeNull();
  });

  it('macht eine leisere Quelle unter gemeinsamem Maßstab sichtbar kleiner', () => {
    const quiet = buildSpectrogramMatrix([frame(100, 0.01)], HOP)!;
    const loud = buildSpectrogramMatrix([frame(100, 1)], HOP)!;
    const ownPeak = Math.max(...quiet.values);
    const shared = rescaleSpectrogramMatrix(quiet, loud.maxDb);
    expect(ownPeak).toBeCloseTo(1, 6);
    expect(Math.max(...shared.values)).toBeLessThan(ownPeak);
    expect(quiet.maxDb).toBeLessThan(loud.maxDb);
  });

  it('rechnet reine Hörverstärkung aus dem gemeinsamen Maßstab heraus', () => {
    const matrix = buildSpectrogramMatrix([frame(100, 1)], HOP)!;
    const compensated = compensateSpectrogramGain(matrix, 10);
    expect(compensated.maxDb).toBeCloseTo(matrix.maxDb - 20, 6);
    expect(compensated.values).toBe(matrix.values);
  });
});

describe('logarithmische Frequenzachse', () => {
  it('trennt tieffrequente Harmonische, die linear alle in Spalte 0/1 lagen', () => {
    // Der Grund für die Log-Achse: bei 128 Spalten linear über 0–24 kHz ist eine
    // Spalte 187 Hz breit, ein 50-Hz-Motor mit Harmonischen also unsichtbar.
    // Bins bei ~94 Hz (k=2), ~188 Hz (k=4), ~375 Hz (k=8) — je eine Oktave.
    const m = buildSpectrogramMatrix([frame(2), frame(4), frame(8)], HOP)!;
    const colOf = (k: number) =>
      Math.floor(freqToColumn((k + 0.5) * (24000 / BINS), m.bandEdgesHz));
    const c2 = colOf(2);
    const c4 = colOf(4);
    const c8 = colOf(8);
    expect(c4).toBeGreaterThan(c2);
    expect(c8).toBeGreaterThan(c4);
    // Eine Oktave muss deutlich mehr als eine Spalte auseinanderliegen.
    expect(c4 - c2).toBeGreaterThan(5);
    expect(c8 - c4).toBeGreaterThan(5);
  });

  it('verteilt Oktaven gleichmäßig — das ist die Definition der Log-Achse', () => {
    const m = buildSpectrogramMatrix([frame(100)], HOP)!;
    const col = (hz: number) => freqToColumn(hz, m.bandEdgesHz);
    const octave1 = col(2000) - col(1000);
    const octave2 = col(4000) - col(2000);
    const octave3 = col(8000) - col(4000);
    expect(octave2).toBeCloseTo(octave1, 4);
    expect(octave3).toBeCloseTo(octave1, 4);
  });

  it('liefert cols + 1 Bandgrenzen von der Untergrenze bis Nyquist', () => {
    const m = buildSpectrogramMatrix([frame(100)], HOP)!;
    expect(m.bandEdgesHz.length).toBe(m.cols + 1);
    // Untergrenze = max(Konstante, 2 × Bin-Breite). Bei 24 kHz / 512 Bins ist die
    // Bin-Breite 46,875 Hz, also gewinnt hier 2 × 46,875 = 93,75 Hz über die 40.
    // Der Grund ist Auflösung, nicht Geschmack: unterhalb des zweiten Bins fielen
    // dutzende Log-Spalten auf dasselbe FFT-Bin und erzeugten ein breites Plateau.
    const hzPerBin = 24000 / BINS;
    expect(m.bandEdgesHz[0]).toBeCloseTo(Math.max(SPECTROGRAM_MIN_FREQ_HZ, 2 * hzPerBin), 6);
    expect(m.bandEdgesHz[m.cols]).toBeCloseTo(24000, 3);
    // Streng monoton steigend
    for (let c = 1; c <= m.cols; c++) {
      expect(m.bandEdgesHz[c]).toBeGreaterThan(m.bandEdgesHz[c - 1]);
    }
  });

  it('lässt keine Spalte leer, auch wo die FFT-Auflösung fehlt', () => {
    // Unten sind Log-Bänder schmaler als ein FFT-Bin. Solche Spalten bekommen das
    // nächstgelegene Bin — sichtbare Treppenstufen statt falscher Stille.
    const m = buildSpectrogramMatrix([frame(2, 1)], HOP)!;
    const noiseFloorOnly = buildSpectrogramMatrix([frame(null)], HOP)!;
    // Alle Spalten der ersten Zeile tragen einen Wert (Rauschboden reicht).
    for (let c = 0; c < m.cols; c++) {
      expect(Number.isFinite(m.values[c])).toBe(true);
      expect(Number.isFinite(noiseFloorOnly.values[c])).toBe(true);
    }
  });

  it('freqToColumn klemmt außerhalb des Bereichs statt zu extrapolieren', () => {
    const edges = logBandEdges(40, 24000, 128);
    expect(freqToColumn(10, edges)).toBe(0);
    expect(freqToColumn(40, edges)).toBe(0);
    expect(freqToColumn(99999, edges)).toBe(128);
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

describe('buildAxisGeometry', () => {
  const matrixOf = (durationFrames: number) =>
    buildSpectrogramMatrix(
      Array.from({ length: durationFrames }, () => frame(100)),
      HOP
    )!;

  it('setzt Frequenz-Teilstriche an die Position der Log-Achse, nicht linear', () => {
    const m = matrixOf(60);
    const axis = buildAxisGeometry(m);
    const xOf = (text: string) => axis.labels.find((l) => l.text === text)?.x;

    // 1 kHz und 2 kHz sind eine Oktave auseinander, 2 kHz und 4 kHz ebenso —
    // auf einer Log-Achse also derselbe Abstand. Linear wäre er doppelt so groß.
    const x1 = xOf('1 kHz')!;
    const x2 = xOf('2 kHz')!;
    const x4 = xOf('4 kHz');
    expect(x1).toBeLessThan(x2);
    // 4 kHz steht nicht auf der Teilstrich-Leiter (50/100/200/500/1k/2k/5k/…),
    // deshalb prüfen wir die Oktav-Gleichheit über 5 kHz vs. 500 Hz.
    expect(x4).toBeUndefined();
    const x500 = xOf('500 Hz')!;
    const x5k = xOf('5 kHz')!;
    // Dekade 500 Hz → 5 kHz muss genauso breit sein wie 100 Hz → 1 kHz.
    const x100 = xOf('100 Hz')!;
    expect(x5k - x500).toBeCloseTo(x1 - x100, 4);
  });

  it('lässt Teilstriche weg, die außerhalb der Aufnahme liegen', () => {
    const m = matrixOf(30);
    const axis = buildAxisGeometry(m);
    // Untergrenze der Achse ist 40 Hz, es darf kein Tick darunter erscheinen.
    for (const l of axis.labels) {
      const match = /^(\d+) Hz$/.exec(l.text);
      if (match) expect(Number(match[1])).toBeGreaterThanOrEqual(SPECTROGRAM_MIN_FREQ_HZ);
    }
  });

  it('beschriftet die Zeitachse mit runden Sekunden von 0 bis zur Dauer', () => {
    const m = matrixOf(150); // 150 × 0,066 s ≈ 9,9 s
    const axis = buildAxisGeometry(m);
    const seconds = axis.labels
      .filter((l) => l.text.endsWith(' s'))
      .map((l) => Number(l.text.replace(' s', '')));
    expect(seconds[0]).toBe(0);
    expect(seconds.length).toBeGreaterThanOrEqual(3);
    for (const s of seconds) expect(s).toBeLessThanOrEqual(m.durationSec + 1e-6);
  });

  it('beschriftet die Höhe als dB-Fenster', () => {
    const axis = buildAxisGeometry(matrixOf(30));
    const texts = axis.labels.map((l) => l.text);
    expect(texts).toContain('0 dB');
    expect(texts.some((x) => x.includes('dB') && x !== '0 dB')).toBe(true);
  });

  it('liefert paarweise Linien-Vertices mit passender Farbmenge', () => {
    const axis = buildAxisGeometry(matrixOf(30));
    expect(axis.positions.length).toBe(axis.vertexCount * 3);
    expect(axis.colors.length).toBe(axis.vertexCount * 3);
    expect(axis.vertexCount % 2).toBe(0); // gl.LINES: je zwei Vertices eine Linie
  });
});

describe('niceTimeStep', () => {
  it('liefert runde Schritte in der Größenordnung Dauer/5', () => {
    expect(niceTimeStep(10)).toBe(2); // 0/2/4/6/8/10
    expect(niceTimeStep(30)).toBe(10); // 0/10/20/30 — aufgerundet auf die 1/2/5-Leiter
    expect(niceTimeStep(1)).toBeCloseTo(0.2, 10);
    expect(niceTimeStep(100)).toBe(20);
  });

  it('bleibt bei unbrauchbarer Dauer bei 1 statt NaN zu liefern', () => {
    expect(niceTimeStep(0)).toBe(1);
    expect(niceTimeStep(-5)).toBe(1);
  });
});

describe('projectToScreen', () => {
  /** Identität als MVP: Weltkoordinaten sind dann direkt Clip-Koordinaten. */
  const identity = () => {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  it('bildet den Ursprung auf die Bildmitte ab', () => {
    const p = projectToScreen(identity(), 0, 0, 0, 200, 100);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('dreht die Y-Achse um (WebGL zeigt nach oben, CSS nach unten)', () => {
    const top = projectToScreen(identity(), 0, 1, 0, 200, 100);
    expect(top.y).toBeCloseTo(0, 6);
  });

  it('meldet Punkte hinter der Kamera als unsichtbar statt sie zu spiegeln', () => {
    const m = identity();
    m[15] = 0; // w = 0 → keine gültige Projektion
    expect(projectToScreen(m, 0, 0, 0, 200, 100).visible).toBe(false);
    const behind = identity();
    behind[15] = -1; // w < 0 → hinter der Kamera
    expect(projectToScreen(behind, 0, 0, 0, 200, 100).visible).toBe(false);
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
