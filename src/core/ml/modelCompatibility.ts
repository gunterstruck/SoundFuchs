/**
 * ZANOBOT — PASST DIESE REFERENZ ZU DIESER MESSUNG?
 *
 * Ein Referenzmodell ist nur mit Messungen vergleichbar, die aus derselben
 * Merkmalsdarstellung stammen. Zwei Bedingungen dafür sind schon lange bekannt
 * und werden geprüft (Sample-Rate), eine kommt mit der Filterbank hinzu:
 *
 *  1. **Sample-Rate** — die FFT-Bins hängen daran (bisher direkt in
 *     `3-Diagnose` geprüft).
 *  2. **Merkmals-Layout** — die Bandaufteilung. 512 lineare Bänder à 46,875 Hz
 *     und 512 Hybrid-Bänder (unten 2,93 Hz, oben logarithmisch) haben dieselbe
 *     LÄNGE, beschreiben aber völlig verschiedene Frequenzen. Ein Cosinus über
 *     zwei solche Vektoren rechnet fehlerfrei durch und liefert eine Zahl
 *     zwischen 0 und 100 — die nichts bedeutet.
 *
 * Das ist die gefährlichste Fehlerart in diesem Produkt: kein Absturz, keine
 * Warnung, nur ein plausibler Score. Deshalb ist die Prüfung nicht optional und
 * nicht kulant — ein Modell mit fremdem Layout wird nicht gerechnet, sondern
 * ausgeschlossen und benannt.
 *
 * YAMNET IST AUSGENOMMEN, und zwar nicht als Kulanz: Embedding-Modelle entstehen
 * aus ROHAUDIO (intern auf 16 kHz resampelt), sie berühren die spektrale
 * Filterbank nie. Deshalb trägt `EmbeddingModel` auch kein `featureLayout` —
 * die Ausnahme steht im Typ, nicht in einer if-Abfrage.
 */

import type { ReferenceModel } from '@data/types.js';
import { CURRENT_FEATURE_LAYOUT, LEGACY_FEATURE_LAYOUT } from '@core/dsp/filterBank.js';
import type { FeatureLayout } from '@core/dsp/filterBank.js';

/** Ist dieses Modell unabhängig von der spektralen Filterbank? */
export function isLayoutIndependent(model: ReferenceModel): boolean {
  return model.engineId === 'yamnet';
}

/**
 * Layout, mit dem dieses Modell trainiert wurde. Modelle ohne Feld stammen aus
 * der Zeit vor der Unterscheidung und sind damit linear-512 — das ist eine
 * Tatsache über die Vergangenheit, keine Annahme.
 */
export function layoutOf(model: ReferenceModel): FeatureLayout | null {
  if (isLayoutIndependent(model)) return null;
  const withLayout = model as { featureLayout?: FeatureLayout };
  return withLayout.featureLayout ?? LEGACY_FEATURE_LAYOUT;
}

/** Passt das Layout dieses Modells zu dem, mit dem gerade gemessen wird? */
export function isLayoutCompatible(model: ReferenceModel): boolean {
  const layout = layoutOf(model);
  return layout === null || layout === CURRENT_FEATURE_LAYOUT;
}

/**
 * Passt dieses Modell zur laufenden Messung — Sample-Rate UND Layout?
 *
 * @param actualSampleRate Die Rate, mit der die Hardware tatsächlich läuft
 *                         (nicht die angeforderte).
 */
export function isModelUsable(model: ReferenceModel, actualSampleRate: number): boolean {
  if (!isLayoutCompatible(model)) return false;
  // YAMNet resampelt intern auf 16 kHz und ist daher nicht an die Aufnahmerate
  // gebunden; alle spektralen Engines sind es über die FFT-Bins.
  return isLayoutIndependent(model) || model.sampleRate === actualSampleRate;
}

export interface ModelPartition {
  /** Modelle, mit denen gerechnet werden darf. */
  usable: ReferenceModel[];
  /** Modelle mit fremdem Merkmals-Layout — müssen neu angelernt werden. */
  outdatedLayout: ReferenceModel[];
  /** Modelle mit fremder Sample-Rate — Layout stimmt, Aufnahmerate nicht. */
  wrongSampleRate: ReferenceModel[];
}

/**
 * Modelle in brauchbar / veraltet / falsche Rate aufteilen.
 *
 * Die beiden Ausschlussgründe werden getrennt gehalten, weil sie zu
 * verschiedenen Handlungen führen: falsche Sample-Rate heißt „mit dem anderen
 * Gerät messen oder neu anlernen", fremdes Layout heißt immer „neu anlernen".
 */
export function partitionModels(
  models: readonly ReferenceModel[] | undefined,
  actualSampleRate: number
): ModelPartition {
  const usable: ReferenceModel[] = [];
  const outdatedLayout: ReferenceModel[] = [];
  const wrongSampleRate: ReferenceModel[] = [];

  for (const model of models ?? []) {
    if (!isLayoutCompatible(model)) {
      outdatedLayout.push(model);
    } else if (!isModelUsable(model, actualSampleRate)) {
      wrongSampleRate.push(model);
    } else {
      usable.push(model);
    }
  }

  return { usable, outdatedLayout, wrongSampleRate };
}
