/**
 * ZANOBOT — SPEKTROGRAMM-MATRIX (Zeit × Frequenz × Intensität)
 *
 * Reines Rechenmodul für die 3D-„Gebirge"-Ansicht gespeicherter Aufnahmen:
 * Aus den Frames der Produktions-FFT (extractFeatures, 512 absolute
 * Energie-Bins je 66-ms-Hop) wird eine display-taugliche Matrix gebaut:
 *
 *  - Frequenz: 512 → SPECTROGRAM_COLS Bins per MAX-Pooling (Peaks — die
 *    diagnostisch relevanten Linien — bleiben erhalten, nichts verschmiert).
 *  - Zeit: auf höchstens SPECTROGRAM_MAX_ROWS Zeilen reduziert (MAX-Pooling
 *    über k Frames — kurze Klacks bleiben sichtbar statt wegzumitteln).
 *  - Intensität: dB-Skala (10·log10), auf [0,1] normiert über ein festes
 *    Fenster von SPECTROGRAM_DB_RANGE dB unter dem globalen Maximum —
 *    dieselbe Wahrnehmungslogik wie bei jedem Audio-Spektrogramm.
 *
 * Kein DOM, kein WebGL — vollständig unit-testbar. Das Rendering übernimmt
 * ui/components/Spectrogram3D.ts.
 */

import type { FeatureVector } from '@data/types.js';

/** Frequenz-Spalten der Display-Matrix (512 → 128 per Max-Pooling). */
export const SPECTROGRAM_COLS = 128;

/** Max. Zeit-Zeilen der Display-Matrix (30 s Aufnahme → ~2 Frames/Zeile). */
export const SPECTROGRAM_MAX_ROWS = 240;

/** Sichtbarer Dynamikbereich unter dem Maximum (dB). */
export const SPECTROGRAM_DB_RANGE = 50;

export interface SpectrogramMatrix {
  /** Zeilenweise abgelegte Intensitäten ∈ [0,1]; Länge rows × cols. */
  values: Float32Array;
  /** Zeitschritte (Zeile 0 = Aufnahmebeginn). */
  rows: number;
  /** Frequenz-Bins (Spalte 0 = 0 Hz). */
  cols: number;
  /** Dauer der Aufnahme in Sekunden (vor der Zeilen-Reduktion). */
  durationSec: number;
  /** Obere Frequenzgrenze der Matrix (Hz, Nyquist der Aufnahme). */
  maxFreqHz: number;
}

/**
 * Display-Matrix aus den FFT-Frames einer Aufnahme bauen.
 * @param features Frames der Produktions-Extraktion (absoluteFeatures nötig)
 * @param hopSec   Zeitabstand der Frames (Sekunden)
 * @returns Matrix, oder null wenn keine verwertbaren Frames vorliegen.
 */
export function buildSpectrogramMatrix(
  features: FeatureVector[],
  hopSec: number
): SpectrogramMatrix | null {
  const frames = features.filter((f) => f.absoluteFeatures && f.absoluteFeatures.length > 0);
  if (frames.length === 0) return null;

  const srcBins = frames[0].absoluteFeatures.length;
  const cols = Math.min(SPECTROGRAM_COLS, srcBins);
  const binGroup = Math.ceil(srcBins / cols);

  // Zeit-Reduktion: k Frames → 1 Zeile (Max-Pooling, Transienten-erhaltend)
  const frameGroup = Math.max(1, Math.ceil(frames.length / SPECTROGRAM_MAX_ROWS));
  const rows = Math.ceil(frames.length / frameGroup);

  const energy = new Float32Array(rows * cols);
  for (let fi = 0; fi < frames.length; fi++) {
    const row = Math.floor(fi / frameGroup);
    const abs = frames[fi].absoluteFeatures;
    for (let k = 0; k < srcBins; k++) {
      const col = Math.min(cols - 1, Math.floor(k / binGroup));
      const idx = row * cols + col;
      const v = abs[k];
      if (v > energy[idx]) energy[idx] = v;
    }
  }

  // dB-Skala + Normierung auf [0,1] im Fenster [max − RANGE, max]
  let maxDb = -Infinity;
  const db = new Float32Array(rows * cols);
  const EPS = 1e-12;
  for (let i = 0; i < db.length; i++) {
    db[i] = 10 * Math.log10(energy[i] + EPS);
    if (db[i] > maxDb) maxDb = db[i];
  }
  if (!isFinite(maxDb)) return null;

  const values = new Float32Array(rows * cols);
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.min(1, Math.max(0, 1 + (db[i] - maxDb) / SPECTROGRAM_DB_RANGE));
  }

  return {
    values,
    rows,
    cols,
    durationSec: frames.length * hopSec,
    maxFreqHz: frames[0].frequencyRange?.[1] ?? 0,
  };
}
