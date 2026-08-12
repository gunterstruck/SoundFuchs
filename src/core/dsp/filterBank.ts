/**
 * ZANOBOT — FILTERBANK (Rohe FFT-Bins → Merkmalsbänder)
 *
 * Bisher lag diese Abbildung als vier Zeilen in `features.binFrequencies`:
 * 8192 rohe FFT-Bins linear zu 512 Bändern zusammengefasst, also 46,875 Hz pro
 * Band. Das ist der Grund, warum Zanobo tieffrequente Ordnungen nicht auflöst —
 * NICHT die Fensterlänge. Nachgerechnet: 0,33 s × 48 kHz = 15840 Samples,
 * gepolstert auf 16384, das sind 8192 positive Bins à **2,93 Hz**. Die
 * Auflösung ist also da und wird erst beim Zusammenfassen weggeworfen.
 *
 * Beispiel 4-Zylinder-Viertakt bei 1800 min⁻¹: ein Zylinder 15 Hz, Kurbelwelle
 * 30 Hz, Zündfolge 60 Hz, Harmonische 120/180/240 Hz. Linear landen 15 und
 * 30 Hz gemeinsam in Band 0 (mit Gleichanteil), 60 Hz in Band 1 — die
 * zylinderselektive Information ist nicht trennbar.
 *
 * WARUM NICHT EINFACH LOGARITHMISCH
 *
 * Reines Log über 512 Bänder von 15 Hz bis 24 kHz ergibt 1,45 % pro Band. Ein
 * Band wird erst ab 202 Hz so breit wie ein FFT-Bin — darunter sind **180 von
 * 512 Bändern schmaler als die Rohauflösung** und tragen denselben Rohbin
 * mehrfach. Zwei Folgen, beide schlecht:
 *
 *  1. 35 % des Merkmalsvektors wären gedoppelte Information.
 *  2. Im Cosinus-Vergleich wächst das Gewicht eines Bereichs mit seiner
 *     BÄNDERZAHL. Der Bereich unter 200 Hz bekäme 180 statt 4,3 Bänder, also
 *     rund 42× mehr Gewicht — der Score würde stillschweigend etwas anderes
 *     messen als vorher, nicht nur feiner.
 *
 * DESHALB HYBRID (mel-artig, aber aus der Rohauflösung abgeleitet statt aus
 * einer Gehörkurve — es geht hier um Maschinen, nicht um Wahrnehmung):
 *
 *  - Unterhalb LOW_BLOCK_MAX_HZ: **ein Rohbin pro Band**, also volle 2,93 Hz
 *    Auflösung. Feiner geht nicht, gröber wäre Verzicht ohne Grund.
 *  - Darüber: logarithmisch über die restlichen Bänder. Das schmalste Log-Band
 *    ist per Konstruktion breiter als ein Rohbin, es wird also nichts gedoppelt.
 *
 * Der Preis ist benannt und gewollt: der Bereich 0–300 Hz bekommt ~20 % des
 * Vektors statt 1,25 %. Für einen Motor, dessen Diagnoseinhalt in den Ordnungen
 * liegt, ist das der Zweck. Für einen Lagerschaden bei 4 kHz verdünnt es dessen
 * Beitrag. Welche der beiden Seiten überwiegt, ist eine MESSFRAGE — dafür
 * existiert `linear-512` weiter, damit das Mess-Labor beide Layouts gegeneinander
 * fahren kann, statt blind zu tauschen.
 *
 * Reine Rechenfunktionen, kein DOM, keine Audio-API.
 */

/**
 * Kennung des Merkmals-Layouts. Sie wandert in jedes trainierte Modell, damit
 * eine Messung nie gegen eine Referenz mit anderer Bandaufteilung verglichen
 * wird — das ergäbe einen plausibel aussehenden, aber bedeutungslosen Score.
 */
export type FeatureLayout = 'linear-512' | 'hybrid-512';

/**
 * Layout, mit dem neu trainiert und gemessen wird.
 *
 * Steht bewusst noch auf `linear-512`: erst wird jeder Verbraucher, der heute
 * „Band × 46,875 Hz" rechnet, auf die Bank umgestellt (verhaltensgleich, durch
 * Tests belegt), und erst danach wird hier umgeschaltet. Ein Wechsel, solange
 * noch irgendeine Stelle linear rechnet, würde Beschriftungen und Masken
 * still verschieben.
 */
export const CURRENT_FEATURE_LAYOUT: FeatureLayout = 'linear-512';

/** Modelle ohne Layout-Feld stammen aus der Zeit vor dieser Unterscheidung. */
export const LEGACY_FEATURE_LAYOUT: FeatureLayout = 'linear-512';

/**
 * Obergrenze des linear aufgelösten Blocks (Hz). 300 Hz deckt bei einem
 * 4-Zylinder-Viertakt die Zündfolge und ihre ersten drei Harmonischen ab
 * (60/120/180/240 Hz) und kostet ~20 % der Bänder.
 */
export const LOW_BLOCK_MAX_HZ = 300;

export interface FilterBank {
  layout: FeatureLayout;
  /** Zahl der Merkmalsbänder (Länge des gespeicherten Vektors). */
  numBands: number;
  /** Zahl der rohen positiven FFT-Bins, aus denen gebündelt wird. */
  rawBins: number;
  /** Obere Frequenzgrenze der rohen Bins (Nyquist der Aufnahme, Hz). */
  nyquistHz: number;
  /**
   * Startindex im Rohspektrum je Band, Länge numBands + 1. Band b umfasst die
   * Rohbins [edges[b], edges[b+1]). Streng monoton, sodass jedes Band
   * mindestens einen Rohbin hat.
   */
  edges: Int32Array;
}

/** Breite eines Rohbins in Hz. */
export function rawBinWidthHz(bank: FilterBank): number {
  return bank.rawBins > 0 ? bank.nyquistHz / bank.rawBins : 0;
}

/**
 * Filterbank für ein Layout bauen.
 *
 * @param layout    'linear-512' (historisches Verhalten) oder 'hybrid-512'
 * @param numBands  Zielzahl der Bänder (512)
 * @param rawBins   Zahl der rohen positiven FFT-Bins (8192 bei 0,33 s / 48 kHz)
 * @param nyquistHz Obere Frequenzgrenze der Rohbins
 * @throws bei unbrauchbaren Eingaben — das wäre ein Programmierfehler.
 */
export function buildFilterBank(
  layout: FeatureLayout,
  numBands: number,
  rawBins: number,
  nyquistHz: number
): FilterBank {
  if (!Number.isInteger(numBands) || numBands < 1) {
    throw new Error(`buildFilterBank: numBands muss ≥ 1 sein, war ${numBands}.`);
  }
  if (!Number.isInteger(rawBins) || rawBins < 1) {
    throw new Error(`buildFilterBank: rawBins muss ≥ 1 sein, war ${rawBins}.`);
  }
  if (!(nyquistHz > 0)) {
    throw new Error(`buildFilterBank: nyquistHz muss > 0 sein, war ${nyquistHz}.`);
  }

  const edges =
    layout === 'linear-512'
      ? linearEdges(numBands, rawBins)
      : hybridEdges(numBands, rawBins, nyquistHz);

  return { layout, numBands, rawBins, nyquistHz, edges };
}

/**
 * Historische Aufteilung, bit-genau wie die frühere `binFrequencies`:
 * `binSize = floor(rawBins / effectiveBands)`, und das LETZTE belegte Band
 * nimmt den Rest bis zum Ende auf. Bei 8192/512 geht es glatt auf; die
 * Rest-Regel greift nur bei ungeraden Verhältnissen, muss aber erhalten
 * bleiben, sonst verschieben sich Alt-Modelle gegen Neu-Messungen.
 *
 * Bänder jenseits von `rawBins` (falls numBands > rawBins) bleiben leer — genau
 * wie vorher, wo der Zielpuffer auf numBands dimensioniert, aber nur
 * effectiveBands weit gefüllt wurde.
 */
function linearEdges(numBands: number, rawBins: number): Int32Array {
  const effective = Math.min(numBands, rawBins);
  const binSize = Math.max(1, Math.floor(rawBins / effective));
  const edges = new Int32Array(numBands + 1);
  for (let b = 0; b < effective; b++) {
    edges[b] = b * binSize;
  }
  edges[effective] = rawBins;
  // Leere Bänder oberhalb: Start = Ende = rawBins (Breite 0).
  for (let b = effective + 1; b <= numBands; b++) edges[b] = rawBins;
  return edges;
}

/**
 * Hybrid: unten ein Rohbin je Band (volle Auflösung), oben logarithmisch.
 *
 * Die Grenze wird aus der Rohauflösung abgeleitet, nicht gesetzt: `lowBands` ist
 * die Zahl der Rohbins bis LOW_BLOCK_MAX_HZ. Reichen die restlichen Bänder für
 * einen sinnvollen Log-Teil nicht (sehr kleine FFT), fällt die Bank auf die
 * lineare Aufteilung zurück statt eine Auflösung zu behaupten, die es nicht gibt.
 */
function hybridEdges(numBands: number, rawBins: number, nyquistHz: number): Int32Array {
  const binWidth = nyquistHz / rawBins;
  const lowBands = Math.min(Math.round(LOW_BLOCK_MAX_HZ / binWidth), rawBins);
  const highBands = numBands - lowBands;

  // Der Hybrid trägt nur, wenn oberhalb der Kniefrequenz für JEDES Log-Band noch
  // ein eigener Rohbin übrig ist. Sonst liefen die Bänder in die obere Grenze und
  // es entstünden Bänder der Breite 0 — genau die Dopplung in anderer Form.
  // (Gefunden vom Test mit 64 Rohbins: 1 Band unten, 511 verlangt oben, 63 da.)
  if (lowBands < 1 || highBands < 1 || rawBins - lowBands < highBands) {
    return linearEdges(numBands, rawBins);
  }

  const edges = new Int32Array(numBands + 1);
  for (let b = 0; b <= lowBands; b++) edges[b] = b;

  // Log-Teil: von Rohbin lowBands bis rawBins, streng monoton erzwungen.
  const startBin = lowBands;
  const ratio = Math.log(rawBins / startBin) / highBands;
  let prev = startBin;
  for (let i = 1; i <= highBands; i++) {
    const ideal = Math.round(startBin * Math.exp(ratio * i));
    // Mindestens ein Rohbin je Band — sonst entstünde genau die Dopplung, die
    // dieses Layout vermeiden soll.
    prev = Math.max(prev + 1, Math.min(ideal, rawBins));
    edges[lowBands + i] = prev;
  }
  edges[numBands] = rawBins;
  return edges;
}

/** Untere und obere Frequenzgrenze eines Bandes (Hz). */
export function bandRangeHz(bank: FilterBank, band: number): [number, number] {
  const b = Math.max(0, Math.min(band, bank.numBands - 1));
  const w = rawBinWidthHz(bank);
  return [bank.edges[b] * w, bank.edges[b + 1] * w];
}

/**
 * Mittenfrequenz eines Bandes (Hz) — arithmetische Mitte seiner Grenzen.
 * Für leere Bänder (Breite 0) ist das die Grenze selbst.
 */
export function bandCenterHz(bank: FilterBank, band: number): number {
  const [lo, hi] = bandRangeHz(bank, band);
  return (lo + hi) / 2;
}

/** Breite eines Bandes in Hz. */
export function bandWidthHz(bank: FilterBank, band: number): number {
  const [lo, hi] = bandRangeHz(bank, band);
  return hi - lo;
}

/**
 * Band, in dem eine Frequenz liegt. Frequenzen außerhalb werden geklemmt —
 * eine Maske oder Beschriftung soll nicht auf einen nicht existierenden Index
 * greifen.
 */
export function hzToBand(bank: FilterBank, hz: number): number {
  const w = rawBinWidthHz(bank);
  if (!(w > 0)) return 0;
  const rawBin = hz / w;
  if (rawBin <= bank.edges[0]) return 0;

  // Binäre Suche über die Kanten: edges ist streng monoton (bis auf leere
  // Bänder am Ende, die alle auf rawBins zeigen).
  let lo = 0;
  let hi = bank.numBands - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bank.edges[mid] <= rawBin) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Bandgrenzen in Hz als fortlaufende Liste (Länge numBands + 1) — für
 * Achsenbeschriftungen, die die Bandaufteilung nachzeichnen müssen.
 */
export function bandEdgesHz(bank: FilterBank): Float32Array {
  const w = rawBinWidthHz(bank);
  const out = new Float32Array(bank.numBands + 1);
  for (let b = 0; b <= bank.numBands; b++) out[b] = bank.edges[b] * w;
  return out;
}
