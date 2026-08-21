/**
 * ZANOBOT — SPEKTROGRAMM-MATRIX (Zeit × Frequenz × Intensität)
 *
 * Reines Rechenmodul für die 3D-„Gebirge"-Ansicht gespeicherter Aufnahmen:
 * Aus den Frames der Produktions-FFT (extractFeatures, 512 absolute
 * Energie-Bins je 66-ms-Hop) wird eine display-taugliche Matrix gebaut:
 *
 *  - Frequenz: 512 → SPECTROGRAM_COLS Bänder per MAX-Pooling (Peaks — die
 *    diagnostisch relevanten Linien — bleiben erhalten, nichts verschmiert),
 *    auf einer LOGARITHMISCHEN Achse. Linear war hier unbrauchbar: 512 Bins
 *    auf 128 Spalten über 0–24 kHz sind 187 Hz pro Spalte, also lagen ein
 *    50-Hz-Grundton und seine ersten Harmonischen komplett in Spalte 0 und 1 —
 *    die gesamte tieffrequente Struktur war unsichtbar. Log-Bänder geben
 *    ~14 Bänder pro Oktave über den ganzen Bereich.
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

/**
 * Absolute Untergrenze der Log-Frequenzachse (Hz). Die tatsächliche Untergrenze
 * ist `max(diesen Wert, 2 × Bin-Breite)` — siehe `buildSpectrogramMatrix`.
 */
export const SPECTROGRAM_MIN_FREQ_HZ = 40;

export interface SpectrogramMatrix {
  /** Zeilenweise abgelegte Intensitäten ∈ [0,1]; Länge rows × cols. */
  values: Float32Array;
  /** Zeitschritte (Zeile 0 = Aufnahmebeginn). */
  rows: number;
  /** Frequenz-Bänder (Spalte 0 = untere Grenze der Log-Achse). */
  cols: number;
  /** Dauer der Aufnahme in Sekunden (vor der Zeilen-Reduktion). */
  durationSec: number;
  /** Obere Frequenzgrenze der Matrix (Hz, Nyquist der Aufnahme). */
  maxFreqHz: number;
  /** Absolutes Maximum vor der anzeigeseitigen Normierung. */
  maxDb: number;
  /**
   * Grenzen der Log-Frequenzbänder in Hz, Länge cols + 1. Spalte c deckt
   * [bandEdgesHz[c], bandEdgesHz[c+1]) ab. Die Achsenbeschriftung braucht das,
   * weil die X-Position einer Frequenz auf einer Log-Achse nicht mehr
   * proportional zur Frequenz ist.
   */
  bandEdgesHz: Float32Array;
  /**
   * Richtung je Zelle: +1 lauter, −1 leiser als der Vergleich.
   *
   * Nur bei der Unterschiedsansicht mit Vorzeichen belegt
   * (`dsp/signedDifference.ts`). Bei einer Pegelansicht gibt es keine Richtung
   * — dort fehlt das Feld, und die Farbe kommt wie bisher aus der Intensität.
   */
  signs?: Int8Array;
  /**
   * Was die Höhe bedeutet. `pegel` (Vorgabe) ist ein Schalldruck über der
   * Fenstergrenze, `unterschied` ein Abstand zum Normalzustand. Die Achse muss
   * das sagen dürfen: Dieselbe Höhe bedeutet sonst zweierlei.
   */
  hoehe?: 'pegel' | 'unterschied';
}

/**
 * EIN GEMEINSAMES ZEITFENSTER FÜR DEN VERGLEICH
 *
 * Die Geometrie legt die Zeilen einer Matrix auf eine FESTE Tiefe um
 * (`z = r/(rows−1) · 2 − 1`). Solange die drei Ansichten verschieden lang sind,
 * heißt das: Ein Normalzustand von 10 s, eine Messung von 25 s und eine auf
 * 12 s gekappte Differenz füllen alle drei dieselbe Tiefe. Die Beschriftung
 * stimmt — sie kommt aus `durationSec` —, aber die FORM nicht: Derselbe Vorgang
 * wandert beim Umschalten und wirkt in der einen Ansicht dichter als in der
 * anderen.
 *
 * Beim Intensitätsmaßstab ist das längst gelöst (gemeinsame dB-Decke, siehe
 * `rescaleSpectrogramMatrix`). Bei der Zeit fehlte es. Ein Vergleich, bei dem
 * die Achse zwischen den Ansichten den Maßstab wechselt, ist keiner.
 *
 * Diese Funktion schneidet eine Matrix auf die ersten `sekunden` zu. Bekommen
 * alle Ansichten dasselbe Fenster, sind sie danach gleich lang — und die
 * Streckung auf die volle Tiefe ist keine Verzerrung mehr, sondern für alle
 * dieselbe Abbildung.
 *
 * Kürzer als das Fenster wird nicht gestreckt: Eine Matrix, die weniger Zeit
 * abdeckt, kommt unverändert zurück. Lieber ein ehrlich kürzeres Gebirge als
 * eine erfundene Zeit.
 */
export function cropSpectrogramMatrix(
  matrix: SpectrogramMatrix,
  sekunden: number
): SpectrogramMatrix {
  if (!Number.isFinite(sekunden) || sekunden <= 0) return matrix;
  if (matrix.rows < 2 || matrix.durationSec <= sekunden + 1e-9) return matrix;

  // Zeile r deckt [r · zeilendauer, (r+1) · zeilendauer) ab.
  const zeilendauer = matrix.durationSec / matrix.rows;
  const zeilen = Math.max(2, Math.min(matrix.rows, Math.round(sekunden / zeilendauer)));
  if (zeilen >= matrix.rows) return matrix;

  return {
    ...matrix,
    values: matrix.values.slice(0, zeilen * matrix.cols),
    rows: zeilen,
    durationSec: zeilen * zeilendauer,
  };
}

/**
 * Eine bereits berechnete Matrix auf einen gemeinsamen dB-Deckel umlegen.
 * Dadurch bleibt eine leise Differenz im Vergleich auch wirklich kleiner.
 * Die Ursprungsmatrix und ihr absolutes `maxDb` bleiben unverändert.
 */
export function rescaleSpectrogramMatrix(
  matrix: SpectrogramMatrix,
  ceilingDb: number
): SpectrogramMatrix {
  if (!Number.isFinite(ceilingDb) || ceilingDb <= matrix.maxDb + 1e-6) return matrix;
  const values = Float32Array.from(matrix.values, (value) => {
    const reconstructedDb = matrix.maxDb + (value - 1) * SPECTROGRAM_DB_RANGE;
    return Math.min(1, Math.max(0, 1 + (reconstructedDb - ceilingDb) / SPECTROGRAM_DB_RANGE));
  });
  return { ...matrix, values };
}

/**
 * Eine reine Hörverstärkung aus dem absoluten Anzeigemaximum herausrechnen.
 * Die relative Form der Matrix bleibt gleich; nur ein gemeinsamer Maßstab darf
 * nicht so tun, als sei die fürs Ohr normalisierte Differenz wirklich so laut.
 */
export function compensateSpectrogramGain(
  matrix: SpectrogramMatrix,
  gain: number
): SpectrogramMatrix {
  if (!Number.isFinite(gain) || gain <= 0 || Math.abs(gain - 1) < 1e-9) return matrix;
  return { ...matrix, maxDb: matrix.maxDb - 20 * Math.log10(gain) };
}

/**
 * Log-verteilte Bandgrenzen von `minHz` bis `maxHz` (cols + 1 Werte).
 * Exportiert, damit die Achsenbeschriftung dieselbe Abbildung benutzt wie die
 * Matrix — eine zweite, leicht abweichende Formel wäre eine falsche Achse.
 */
export function logBandEdges(minHz: number, maxHz: number, cols: number): Float32Array {
  const edges = new Float32Array(cols + 1);
  const lo = Math.log(minHz);
  const ratio = Math.log(maxHz / minHz) / cols;
  for (let c = 0; c <= cols; c++) edges[c] = Math.exp(lo + ratio * c);
  return edges;
}

/**
 * Spaltenindex einer Frequenz — als FLIESSKOMMA-Position, damit ein Achsen-Tick
 * zwischen zwei Spalten stehen kann.
 *
 * Sucht in den GRENZEN statt ein Gesetz zu unterstellen. Die erste Fassung
 * rechnete `log(hz/minHz) / log(maxHz/minHz)` und setzte damit eine reine
 * Log-Achse voraus. Das brach bei der feinen Anzeige-Matrix, deren Aufteilung
 * unten linear und oben logarithmisch ist und bei 0 Hz beginnt: `log(hz/0)` ergab
 * NaN, und jede Beschriftung landete irgendwo. Eine Kantensuche stimmt für jede
 * monoton steigende Aufteilung — linear, log oder hybrid.
 *
 * @returns Position ∈ [0, cols]; außerhalb liegende Frequenzen werden geklemmt.
 */
export function freqToColumn(hz: number, edges: Float32Array): number {
  const cols = edges.length - 1;
  if (cols < 1) return 0;
  if (hz <= edges[0]) return 0;
  if (hz >= edges[cols]) return cols;

  let lo = 0;
  let hi = cols - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (edges[mid] <= hz) lo = mid;
    else hi = mid - 1;
  }
  const width = edges[lo + 1] - edges[lo];
  // Innerhalb des Bandes linear interpolieren: der Tick soll dort stehen, wo die
  // Frequenz im Band liegt, nicht an dessen Kante.
  return width > 0 ? lo + (hz - edges[lo]) / width : lo;
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
  const nyquist = frames[0].frequencyRange?.[1] ?? 0;
  if (!(nyquist > SPECTROGRAM_MIN_FREQ_HZ)) return null;

  const hzPerBin = nyquist / srcBins;

  // Untergrenze NICHT einfach 40 Hz: die FFT hat bei 48 kHz / 512 Bins ~47 Hz
  // Bin-Breite. Startet die Log-Achse deutlich unter dem zweiten Bin, fallen
  // Dutzende Spalten unter dasselbe Bin und es entsteht ein breites Plateau, das
  // Platz kostet und keine Information trägt (gemessen: 40 Hz → 49 von 128
  // Spalten unter den ersten 10 Bins, also 38 % der Fläche).
  //
  // Das ist keine Anzeige-Schwäche, sondern die Auflösung selbst: 50-Hz-
  // Harmonische lassen sich mit 47-Hz-Bins nicht trennen, egal welche Achse man
  // darunterlegt. Dafür bräuchte es ein längeres Fenster in DEFAULT_DSP_CONFIG.
  const minHz = Math.max(SPECTROGRAM_MIN_FREQ_HZ, 2 * hzPerBin);
  const bandEdgesHz = logBandEdges(minHz, nyquist, cols);

  // Log-Zuordnung Quell-Bin → Spalte. Bin k deckt [k·hzPerBin, (k+1)·hzPerBin)
  // ab; als Frequenz nehmen wir die Bin-MITTE. Bin 0 (DC) fällt weg.
  const colOfBin = new Int16Array(srcBins).fill(-1);
  for (let k = 1; k < srcBins; k++) {
    const hz = (k + 0.5) * hzPerBin;
    if (hz < bandEdgesHz[0]) continue;
    colOfBin[k] = Math.min(cols - 1, Math.floor(freqToColumn(hz, bandEdgesHz)));
  }

  // Unten sind die Log-Bänder schmaler als ein FFT-Bin, es bleiben also Spalten
  // ohne eigenes Bin-Zentrum. Sie bekommen das NÄCHSTGELEGENE Bin, damit keine
  // Lücke als Stille erscheint — die dann sichtbaren Treppenstufen sind die
  // ehrliche Anzeige der fehlenden Auflösung, kein Artefakt.
  const fallbackBinOfCol = new Int16Array(cols).fill(-1);
  for (let c = 0; c < cols; c++) {
    const centerHz = Math.sqrt(bandEdgesHz[c] * bandEdgesHz[c + 1]); // geometrische Mitte
    const k = Math.round(centerHz / hzPerBin - 0.5);
    fallbackBinOfCol[c] = Math.min(srcBins - 1, Math.max(1, k));
  }
  const colHasOwnBin = new Uint8Array(cols);
  for (let k = 1; k < srcBins; k++) {
    if (colOfBin[k] >= 0) colHasOwnBin[colOfBin[k]] = 1;
  }

  // Zeit-Reduktion: k Frames → 1 Zeile (Max-Pooling, Transienten-erhaltend)
  const frameGroup = Math.max(1, Math.ceil(frames.length / SPECTROGRAM_MAX_ROWS));
  const rows = Math.ceil(frames.length / frameGroup);

  const energy = new Float32Array(rows * cols);
  for (let fi = 0; fi < frames.length; fi++) {
    const row = Math.floor(fi / frameGroup);
    const abs = frames[fi].absoluteFeatures;
    for (let k = 1; k < srcBins; k++) {
      const col = colOfBin[k];
      if (col < 0) continue;
      const idx = row * cols + col;
      const v = abs[k];
      if (v > energy[idx]) energy[idx] = v;
    }
    for (let c = 0; c < cols; c++) {
      if (colHasOwnBin[c]) continue;
      const idx = row * cols + c;
      const v = abs[fallbackBinOfCol[c]];
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
    maxFreqHz: nyquist,
    maxDb,
    bandEdgesHz,
  };
}
