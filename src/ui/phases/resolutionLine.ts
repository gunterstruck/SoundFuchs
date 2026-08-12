/**
 * ZANOBOT — WAS DIESER VERGLEICH AUFLÖST (Zustand der Zeile unter der Ampel)
 *
 * Hier steht die Entscheidung, NICHT das Zeichnen: welche Referenz gemeint ist,
 * ob es überhaupt eine Zahl gibt, und wie sie geschrieben wird. Das Setzen von
 * `textContent` bleibt in `3-Diagnose`.
 *
 * Getrennt, weil genau diese drei Fälle still kaputtgehen können: ein Rückfall
 * auf die falsche Referenz (dann steht eine echte Zahl über der falschen
 * Messung da), eine erfundene Zahl bei fehlender Streuung, und „0,0 Punkte" bei
 * einer sehr engen Referenz — was gelesen wird als „löst alles auf".
 */

import type { ReferenceModel } from '@data/types.js';
import { baselineResolution } from '@core/ml/baselineSpread.js';

/** Was die Zeile anzeigen soll. */
export type ResolutionLineState =
  /** Nichts anzeigen — keine gesunde Referenz, oder Streuung fehlt und die
   *  Ansichtsstufe ist zu einfach für einen Hinweis, auf den man nur mit
   *  Neuanlernen reagieren kann. */
  | { kind: 'hidden' }
  /** Referenz vorhanden, aber ohne Eigenstreuung: sagen, dass es keine Zahl gibt. */
  | { kind: 'unknown' }
  /** Zahl vorhanden. `points` ist fertig formatiert. */
  | { kind: 'value'; points: string; k: number; label: string };

/**
 * Punktzahl für die Anzeige: eine Nachkommastelle, Komma als Dezimalzeichen
 * (wie `utils/formatHz`).
 *
 * Unter 0,1 wird die SCHRANKE gezeigt statt der Wert. „0,0 Punkte" hieße
 * gelesen „dieser Vergleich löst beliebig fein auf" — das behauptet niemand,
 * schon weil der angezeigte Score selbst nur ganzzahlig dargestellt wird.
 */
export function formatResolutionPoints(points: number): string {
  if (!Number.isFinite(points) || points < 0) return '—';
  if (points < 0.1) return '< 0,1';
  return points.toFixed(1).replace('.', ',');
}

/**
 * Zustand der Auflösungszeile bestimmen.
 *
 * @param models          Modelle, mit denen tatsächlich gerechnet wurde
 *                        (bereits auf verträgliche gefiltert).
 * @param healthyLabel    Label der gesunden Referenz, die die Anzeige gespeist
 *                        hat. Leer, wenn keine Messung lief.
 * @param allowUnknownHint Darf der „keine Zahl"-Hinweis gezeigt werden
 *                        (Ansichtsstufe ≥ Advanced)?
 */
export function resolutionLineState(
  models: readonly ReferenceModel[],
  healthyLabel: string,
  allowUnknownHint: boolean
): ResolutionLineState {
  const healthy = models.filter((m) => m.type === 'healthy');
  // Genau die Referenz, die die Anzeige gespeist hat. Der Rückfall auf die erste
  // gesunde gilt nur, wenn KEIN Label mitkam (Ergebnis-Screen ohne gelaufene
  // Messung) — ein unbekanntes Label darf nicht stillschweigend zu einer
  // anderen Referenz werden, sonst gehört die Zahl zu etwas anderem als der
  // Score darüber.
  const model = healthyLabel
    ? healthy.find((m) => m.label === healthyLabel)
    : (healthy[0] ?? undefined);
  if (!model) return { kind: 'hidden' };

  const resolution = baselineResolution(model);
  if (!resolution) return allowUnknownHint ? { kind: 'unknown' } : { kind: 'hidden' };

  return {
    kind: 'value',
    points: formatResolutionPoints(resolution.points),
    k: resolution.k,
    label: model.label,
  };
}
