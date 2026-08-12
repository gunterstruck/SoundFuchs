/**
 * ZANOBOT — SPEKTROGRAMM IN VOLLER AUFLÖSUNG (nur Anzeige und Gehör)
 *
 * Der Bewertungspfad speichert 512 Bänder à 46,875 Hz. Für einen 4-Zylinder-
 * Viertakt bei 1800 min⁻¹ liegen damit ein Zylinder (15 Hz) und die Kurbelwelle
 * (30 Hz) gemeinsam in Band 0, die Zündfolge (60 Hz) in Band 1 — die Ordnungen
 * sind nicht trennbar.
 *
 * Die Auflösung ist aber vorhanden: dasselbe 330-ms-Fenster ergibt nach
 * `padToPowerOfTwo` 8192 positive Bins à 2,93 Hz. Weggeworfen wird sie erst beim
 * Bündeln auf 512 lineare Bänder.
 *
 * Dieses Modul greift die feine Auflösung ab, BEVOR gebündelt wird, und baut
 * daraus eine Anzeige-Matrix auf einer LOGARITHMISCHEN Frequenzachse ab 15 Hz —
 * siehe `displayEdges` dazu, warum die Anzeige eine andere Aufteilung braucht als
 * der Merkmalsvektor. Zwei Zwecke:
 *
 *  1. Man SIEHT die Ordnungen — 15/30/60/120 Hz in getrennten Spalten — und der
 *     Transponier-Knopf findet den Unterschieds-Peak auf 2,93 Hz genau statt auf
 *     47 Hz. Das ist der Nutzen, der ohne jede Umstellung zu haben ist.
 *  2. Es ist gleichzeitig die VORSCHAU auf den Layout-Wechsel: die Auflösung, die
 *     hier sichtbar wird, ist die, die ein Hybrid-Merkmalsvektor bewerten würde.
 *     Wer entscheiden soll, ob der Wechsel seinen Preis wert ist, kann vorher
 *     hinsehen.
 *
 * ABGRENZUNG — und die ist der Kern: Dieses Modul berührt den Bewertungspfad
 * NICHT. Es erzeugt keine `FeatureVector`, kein Modell rechnet damit, kein Score
 * ändert sich, keine gespeicherte Referenz wird ungültig. Rein additiv,
 * Anzeige und Wahrnehmung.
 *
 * Warum nicht einfach die feine Auflösung an jeden Frame hängen: 8192 Werte × ~150
 * Frames sind gut 5 MB pro 10-Sekunden-Aufnahme. Für eine Ansicht, die man selten
 * öffnet, wird das hier einmalig berechnet und danach verworfen.
 */

import { fft, getMagnitude, applyHanningWindow, padToPowerOfTwo } from './fft.js';
import { SPECTROGRAM_DB_RANGE, SPECTROGRAM_MAX_ROWS, type SpectrogramMatrix } from './spectrogram.js';
import { DEFAULT_DSP_CONFIG } from './features.js';
import { logger } from '@utils/logger.js';

/**
 * Frequenzspalten der feinen Anzeige.
 *
 * 256 und nicht 512: bei höchstens SPECTROGRAM_MAX_ROWS = 240 Zeilen ergibt das
 * 61.440 Vertices und bleibt damit unter der Uint16-Indexgrenze (65.535). Mit 512
 * Spalten bräuchte das Mesh die Erweiterung `OES_element_index_uint`, die nicht
 * jedes Gerät hat — die Ansicht wäre dort still leer. 256 Hybrid-Bänder trennen
 * die Ordnungen weiterhin klar (15/30/60/120 Hz in verschiedenen Spalten).
 */
export const SPECTROGRAM_FINE_COLS = 256;

/**
 * Untere Grenze der Anzeige-Achse (Hz). 15 Hz ist ein Arbeitsspiel eines
 * 4-Zylinder-Viertakts bei 1800 min⁻¹ — die tiefste Ordnung, die man sehen will.
 */
export const FINE_MIN_HZ = 15;

/**
 * Bandgrenzen der ANZEIGE als Rohbin-Indizes, logarithmisch verteilt.
 *
 * Warum hier logarithmisch und in der Filterbank hybrid — das sind zwei
 * verschiedene Anforderungen, und sie zu vermischen war ein Fehler:
 *
 *  - Der MERKMALSVEKTOR braucht unten lineare Bänder, weil im Cosinus das Gewicht
 *    eines Bereichs mit seiner Bänderzahl wächst; gedoppelte Bänder würden den
 *    tiefen Bereich künstlich hochgewichten.
 *  - Die ANZEIGE hat kein Gewichtungsproblem, sondern ein Lesbarkeitsproblem. Mit
 *    linearen Bändern unten drängen sich 20, 30 und 50 Hz in die ersten Prozent
 *    der Bildbreite und ihre Etiketten überdecken sich (am Bild gesehen).
 *    Logarithmisch liegen sie gleichmäßig — Oktave für Oktave.
 *
 * Bänder, die schmaler als ein Rohbin sind, dürfen sich hier denselben Bin teilen.
 * Das erzeugt unten sichtbare Treppenstufen, und die sind die ehrliche Anzeige der
 * Auflösungsgrenze: dort steht wirklich nicht mehr Information.
 */
function displayEdges(cols: number, rawBins: number, nyquistHz: number): Int32Array {
  const binWidth = nyquistHz / rawBins;
  const minBin = Math.max(1, FINE_MIN_HZ / binWidth);
  const ratio = Math.log(rawBins / minBin) / cols;
  const edges = new Int32Array(cols + 1);
  for (let c = 0; c <= cols; c++) {
    edges[c] = Math.min(rawBins, Math.max(1, Math.round(minBin * Math.exp(ratio * c))));
  }
  edges[cols] = rawBins;
  return edges;
}

/**
 * Anzeige-Matrix in voller Frequenzauflösung direkt aus einer Aufnahme.
 *
 * Fenster und Hop sind dieselben wie im Produktionspfad, damit die Zeitachse zur
 * gespeicherten Analyse passt und ein Klopfen an derselben Stelle liegt.
 *
 * @param buffer Aufnahme (Mono wird intern gemischt)
 * @param hopSec Zeitabstand der Frames; Standard ist der Produktions-Hop
 * @returns Matrix mit den Anzeige-Bandgrenzen in `bandEdgesHz`, oder null wenn die
 *          Aufnahme zu kurz oder unbrauchbar ist.
 */
export function buildFineSpectrogramMatrix(
  buffer: AudioBuffer,
  hopSec: number = DEFAULT_DSP_CONFIG.hopSize
): SpectrogramMatrix | null {
  const sampleRate = buffer.sampleRate;
  if (!(sampleRate > 0) || !isFinite(sampleRate)) return null;

  const windowSamples = Math.floor(DEFAULT_DSP_CONFIG.windowSize * sampleRate);
  const hopSamples = Math.max(1, Math.floor(hopSec * sampleRate));
  if (windowSamples < 2 || buffer.length < windowSamples) return null;

  const mono = toMono(buffer);
  const nyquist = sampleRate / 2;

  // Frame-Positionen bestimmen; Zeilen werden wie in der groben Matrix begrenzt,
  // damit die Mesh-Größe beschränkt bleibt (Max-Pooling über je k Frames).
  const frameCount = Math.floor((mono.length - windowSamples) / hopSamples) + 1;
  if (frameCount < 1) return null;
  const frameGroup = Math.max(1, Math.ceil(frameCount / SPECTROGRAM_MAX_ROWS));
  const rows = Math.ceil(frameCount / frameGroup);

  // Kanten erst nach dem ersten FFT bauen: die Zahl der Rohbins hängt an der
  // Polsterung auf die nächste Zweierpotenz.
  let edges: Int32Array | null = null;
  let binCount = 0;
  let cols = 0;
  let energy: Float32Array | null = null;

  for (let fi = 0; fi < frameCount; fi++) {
    const start = fi * hopSamples;
    const frame = mono.subarray(start, start + windowSamples);

    let magnitude: Float64Array;
    try {
      magnitude = getMagnitude(fft(padToPowerOfTwo(applyHanningWindow(frame))));
    } catch (error) {
      logger.warn('Feines Spektrogramm: FFT fehlgeschlagen, Frame übersprungen:', error);
      continue;
    }
    const rawBins = Math.floor(magnitude.length / 2);
    if (rawBins < 2) continue;

    if (!edges) {
      edges = displayEdges(SPECTROGRAM_FINE_COLS, rawBins, nyquist);
      cols = SPECTROGRAM_FINE_COLS;
      binCount = rawBins;
      energy = new Float32Array(rows * cols);
    }
    // Wechselt die Rohbin-Zahl mitten in der Aufnahme, passen die Kanten nicht
    // mehr; bei gleicher Fensterlänge kann das nicht vorkommen, wird aber nicht
    // geraten.
    if (!energy || binCount !== rawBins) continue;

    const row = Math.floor(fi / frameGroup);
    for (let b = 0; b < cols; b++) {
      const from = edges[b];
      const to = edges[b + 1];
      // MAX über die Rohbins des Bandes: eine Spektrallinie und ein kurzer
      // Transient bleiben stehen, statt im Mittel zu verschwinden — dieselbe
      // Wahl wie in der groben Matrix.
      //
      // Unten sind Bänder schmaler als ein Rohbin (from === to). Sie bekommen
      // diesen einen Bin, damit dort eine Treppenstufe steht statt eines Lochs:
      // ein leeres Band würde als −240 dB gezeichnet und sähe wie Stille aus.
      let peak = 0;
      if (to > from) {
        for (let i = from; i < to; i++) {
          const v = magnitude[i];
          if (v > peak) peak = v;
        }
      } else {
        peak = magnitude[Math.min(rawBins - 1, from)];
      }
      const idx = row * cols + b;
      if (peak > energy[idx]) energy[idx] = peak;
    }
  }

  if (!edges || !energy || cols === 0) return null;

  // dB-Skala und Normierung auf [0,1] im Fenster [max − RANGE, max] — identisch
  // zur groben Matrix, damit beide Ansichten gleich zu lesen sind.
  let maxDb = -Infinity;
  const db = new Float32Array(energy.length);
  const EPS = 1e-12;
  for (let i = 0; i < db.length; i++) {
    db[i] = 20 * Math.log10(energy[i] + EPS);
    if (db[i] > maxDb) maxDb = db[i];
  }
  if (!isFinite(maxDb)) return null;

  const values = new Float32Array(energy.length);
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.min(1, Math.max(0, 1 + (db[i] - maxDb) / SPECTROGRAM_DB_RANGE));
  }

  return {
    values,
    rows,
    cols,
    durationSec: frameCount * hopSec,
    maxFreqHz: nyquist,
    bandEdgesHz: Float32Array.from(edges, (bin) => (bin * nyquist) / binCount),
  };
}

/**
 * Frequenz der größten Auffälligkeit in voller Auflösung (Hz).
 *
 * Gedacht für das Differenz-Signal: dort ist das gemeinsame Grundgeräusch schon
 * herausgerechnet, das Maximum des Restes ist also die Stelle, an der sich etwas
 * geändert hat. Über die Zeit gemittelt, damit ein einzelner Knall den
 * Arbeitspunkt nicht bestimmt.
 *
 * Gegenüber der Variante auf den 512 Bändern gewinnt das Faktor 16 an Genauigkeit
 * (2,93 Hz statt 46,875 Hz) — hörbar relevant, weil der Transponier-Faktor direkt
 * daraus folgt.
 *
 * @returns Frequenz in Hz, oder null wenn nichts Verwertbares vorliegt.
 */
export function peakFrequencyFine(buffer: AudioBuffer): number | null {
  const sampleRate = buffer.sampleRate;
  if (!(sampleRate > 0) || !isFinite(sampleRate)) return null;

  const windowSamples = Math.floor(DEFAULT_DSP_CONFIG.windowSize * sampleRate);
  const hopSamples = Math.max(1, Math.floor(DEFAULT_DSP_CONFIG.hopSize * sampleRate));
  if (windowSamples < 2 || buffer.length < windowSamples) return null;

  const mono = toMono(buffer);
  const frameCount = Math.floor((mono.length - windowSamples) / hopSamples) + 1;

  let sum: Float64Array | null = null;
  let rawBins = 0;
  let frames = 0;

  for (let fi = 0; fi < frameCount; fi++) {
    const start = fi * hopSamples;
    let magnitude: Float64Array;
    try {
      magnitude = getMagnitude(
        fft(padToPowerOfTwo(applyHanningWindow(mono.subarray(start, start + windowSamples))))
      );
    } catch {
      continue;
    }
    const bins = Math.floor(magnitude.length / 2);
    if (bins < 2) continue;
    if (!sum) {
      sum = new Float64Array(bins);
      rawBins = bins;
    }
    if (bins !== rawBins) continue;
    for (let k = 0; k < bins; k++) sum[k] += magnitude[k];
    frames++;
  }

  if (!sum || frames === 0) return null;

  // Bin 0 (Gleichanteil) übersprungen: keine hörbare Frequenz.
  let bestBin = -1;
  let bestValue = 0;
  for (let k = 1; k < rawBins; k++) {
    if (sum[k] > bestValue) {
      bestValue = sum[k];
      bestBin = k;
    }
  }
  if (bestBin < 0 || bestValue <= 0) return null;

  const binWidth = sampleRate / 2 / rawBins;
  return (bestBin + 0.5) * binWidth;
}

/** Kanäle einer Aufnahme zu Mono mischen. */
function toMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
  }
  return mono;
}
