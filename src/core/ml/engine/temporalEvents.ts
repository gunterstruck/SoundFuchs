/**
 * ZANOBOT — Tier 2 Ereignis-Pfad (T3, Stufe T2-a2)
 *
 * Reine Helfer für die Onset-Segmentierung und Ereignis-Bank der Temporal-
 * Engine (Konzept: docs/TIER2_TEMPORAL_ENGINE_KONZEPT.md §4.4). Kein Zustand,
 * kein DOM, kein Audio-I/O — vollständig unit-testbar.
 *
 * Onset-Gate: Die "Novelty" zwischen zwei aufeinanderfolgenden Frames ist
 * 1 − cos(f_t, f_{t−1}) auf der relativen ESD — scale-frei und identisch in
 * Training (Hop 66 ms) und Live-Betrieb (~330 ms Kadenz) berechenbar. Ein
 * Ereignis beginnt, wenn die Novelty den adaptiven Schwellwert
 * max(NOVELTY_FLOOR, NOVELTY_FACTOR · median) überschreitet (steigende
 * Flanke), und umfasst die Folge-Frames, solange die Novelty über der halben
 * Schwelle bleibt (max. EVENT_MAX_FRAMES).
 *
 * Der Deskriptor eines Ereignisses ist das renormierte Mittelspektrum seiner
 * Frames plus Dauer und Energie-Verhältnis; das Matching in der Diagnose
 * läuft über Cosine gegen die Ereignis-Bank (bekannt vs. anomal).
 */

import type { TemporalEventDescriptor } from '@data/types.js';
import { cosineSimilarity } from '../mathUtils.js';

/** Novelty-Untergrenze: darunter ist spektrale Änderung Rauschen. */
export const NOVELTY_FLOOR = 0.02;

/** Adaptiver Schwellwert: Vielfaches des Novelty-Grundrauschens (25 %-Quantil). */
export const NOVELTY_FACTOR = 4;

/** Max. Ereignisdauer in Frames (~0,5 s im 66-ms-Hop-Raster). */
export const EVENT_MAX_FRAMES = 8;

/** Max. Größe der Ereignis-Bank (diverse Auswahl, s. buildEventBank). */
export const EVENT_BANK_MAX = 24;

/** Zwei Deskriptoren mit Cosine darüber gelten als dasselbe Ereignis. */
export const EVENT_BANK_DEDUP_COS = 0.98;

/** Ein Live-Ereignis mit Bank-Cosine ab diesem Wert gilt als "bekannt". */
export const EVENT_KNOWN_COS = 0.9;

/** Ein erkanntes Ereignis in einer Frame-Sequenz (Indizes im Frame-Raster). */
export interface DetectedEvent {
  startIndex: number;
  durationFrames: number;
  /** Renormiertes Mittelspektrum über die Ereignis-Frames (Σ=1). */
  spectrum: Float64Array;
}

/** Novelty-Zeitreihe: n(0)=0, n(t) = 1 − cos(f_t, f_{t−1}). */
export function noveltySeries(features: ArrayLike<number>[]): number[] {
  const out = new Array<number>(features.length).fill(0);
  for (let t = 1; t < features.length; t++) {
    out[t] = 1 - cosineSimilarity(features[t] as Float64Array, features[t - 1] as Float64Array);
  }
  return out;
}

/**
 * Adaptiver Onset-Schwellwert einer Novelty-Reihe. Grundrauschen = 25 %-
 * Quantil statt Median: Bei dichten Ereignissen (Ventil-Takt nahe der
 * Frame-Kadenz) kann fast die Hälfte der Übergänge ein Zustandswechsel
 * sein — der Median läge dann am Spike-Niveau und die Schwelle liefe weg.
 */
export function noveltyThreshold(novelties: number[]): number {
  return Math.max(NOVELTY_FLOOR, NOVELTY_FACTOR * noveltyBackground(novelties));
}

/**
 * Novelty-Grundrauschen (25 %-Quantil). Liegt es ÜBER dem Floor, wechselt
 * der Strom permanent den Zustand — Onset-Zählung ist dann nicht
 * aussagekräftig (Sicherheitsventil für den Dichte-Wächter).
 */
export function noveltyBackground(novelties: number[]): number {
  if (novelties.length === 0) return 0;
  const sorted = [...novelties].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)];
}

/**
 * Onset-Segmentierung einer Frame-Sequenz (Training und Batch-Diagnose).
 *
 * Ein Onset braucht ZWEI Bedingungen: Novelty-Spitze über dem Schwellwert
 * UND Unähnlichkeit zum letzten HINTERGRUND-Zustand — die Rückfall-Flanke
 * (Klack→Brummen) hat zwar hohe Novelty, kehrt aber zum Hintergrund zurück
 * und ist deshalb kein eigenes Ereignis (sonst würde jeder Klack doppelt
 * gezählt). Die AUSDEHNUNG ist ebenfalls zustandsbasiert: Folge-Frames
 * gehören zum Ereignis, solange sie dem Hintergrund unähnlich bleiben —
 * anhaltende neue Zustände werden EIN Ereignis mit Dauer, und das
 * Rückfall-Frame verwässert den Deskriptor nicht.
 */
export function detectEvents(features: Float64Array[]): DetectedEvent[] {
  if (features.length < 2) return [];
  const novelties = noveltySeries(features);
  const threshold = noveltyThreshold(novelties);
  const events: DetectedEvent[] = [];

  let background = 0; // Index des letzten Nicht-Ereignis-Frames
  let t = 1;
  while (t < features.length) {
    const awayFromBackground = 1 - cosineSimilarity(features[t], features[background]);
    if (novelties[t] <= threshold || awayFromBackground <= threshold / 2) {
      background = t;
      t++;
      continue;
    }
    const start = t;
    let end = t;
    while (
      end + 1 < features.length &&
      end - start + 1 < EVENT_MAX_FRAMES &&
      1 - cosineSimilarity(features[end + 1], features[background]) > threshold / 2
    ) {
      end++;
    }
    events.push({
      startIndex: start,
      durationFrames: end - start + 1,
      spectrum: meanSpectrumOf(features, start, end),
    });
    t = end + 1;
  }
  return events;
}

/** Renormiertes Mittelspektrum der Frames [start..end] (Σ=1 wie relative ESD). */
function meanSpectrumOf(features: Float64Array[], start: number, end: number): Float64Array {
  const dim = features[start].length;
  const mean = new Float64Array(dim);
  for (let i = start; i <= end; i++) {
    for (let k = 0; k < dim; k++) mean[k] += features[i][k];
  }
  let sum = 0;
  for (let k = 0; k < dim; k++) sum += mean[k];
  if (sum > 0) {
    for (let k = 0; k < dim; k++) mean[k] /= sum;
  }
  return mean;
}

/**
 * Ereignis-Bank + Dichte aus einer Referenz-Frame-Sequenz.
 *
 * Die Bank ist eine DIVERSE Auswahl: Deskriptoren, die zu einem bestehenden
 * Eintrag ≥ EVENT_BANK_DEDUP_COS ähnlich sind, erhöhen nur dessen Zählung
 * (ein Ventil-Klack landet einmal in der Bank, nicht 20-mal). Die Dichte
 * zählt dagegen ALLE Ereignisse: eventRatePerMin = Ereignisse pro Minute
 * Referenzdauer (Frames × hopSec).
 *
 * @param frameRms optionale Frame-RMS-Reihe (aus dem Rohsignal) für das
 *        energyRatio-Feld des Deskriptors; ohne sie wird 1 gespeichert.
 */
export function buildEventBank(
  features: Float64Array[],
  hopSec: number,
  frameRms?: number[]
): { events: TemporalEventDescriptor[]; eventCount: number; eventRatePerMin: number } {
  const detected = detectEvents(features);
  const medianRms = frameRms && frameRms.length > 0 ? medianOf(frameRms) : 0;

  const bank: Array<{ descriptor: TemporalEventDescriptor; spectrum: Float64Array }> = [];
  for (const ev of detected) {
    let energyRatio = 1;
    if (frameRms && medianRms > 0) {
      let evRms = 0;
      const end = Math.min(ev.startIndex + ev.durationFrames - 1, frameRms.length - 1);
      for (let i = ev.startIndex; i <= end; i++) evRms = Math.max(evRms, frameRms[i]);
      energyRatio = evRms / medianRms;
    }

    const existing = bank.find(
      (b) => cosineSimilarity(ev.spectrum, b.spectrum) >= EVENT_BANK_DEDUP_COS
    );
    if (existing) continue; // Dichte zählt unten trotzdem alle
    if (bank.length >= EVENT_BANK_MAX) continue;
    bank.push({
      descriptor: {
        meanSpectrum: Array.from(ev.spectrum),
        durationFrames: ev.durationFrames,
        energyRatio,
      },
      spectrum: ev.spectrum,
    });
  }

  const durationMin = (features.length * hopSec) / 60;
  return {
    events: bank.map((b) => b.descriptor),
    eventCount: detected.length,
    eventRatePerMin: durationMin > 0 ? detected.length / durationMin : 0,
  };
}

/**
 * Ein Live-Ereignis gegen die Ereignis-Bank matchen.
 * @returns beste Cosine-Ähnlichkeit (0, wenn die Bank leer ist).
 */
export function matchEvent(
  spectrum: Float64Array,
  events: TemporalEventDescriptor[]
): number {
  let best = 0;
  for (const ev of events) {
    const s = cosineSimilarity(spectrum, Float64Array.from(ev.meanSpectrum));
    if (s > best) best = s;
  }
  return best;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
