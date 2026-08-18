/**
 * Verständliche Einordnung der AKUSTISCHEN Differenzstärke.
 *
 * Die Eingabe stammt aus `differenceIsolation` und liegt vor jeder
 * Peak-Normalisierung. Diese Einordnung ist ausdrücklich keine Diagnose und
 * keine Schadensschwere: Sie sagt nur, wie groß der isolierte neue Klanganteil
 * gegenüber Messsignal und innerer Schwankung des Normalzustands ist.
 */

import type { DifferenceMetrics } from './differenceIsolation.js';

export type DifferenceStrengthLevel = 'within' | 'slight' | 'clear' | 'strong';

export interface DifferenceStrength {
  level: DifferenceStrengthLevel;
  /** RMS-Amplitudenanteil in Prozent, nicht die nachträgliche Hörlautstärke. */
  percent: number;
  /** Für einen kompakten Balken; bewusst nicht als weitere Fachzahl gezeigt. */
  meterPercent: number;
  /** Gerundeter Faktor zur inneren Referenzschwankung, falls belastbar. */
  variationMultiple: number | null;
  relativeDb: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Zuerst die Eigenstreuung verwenden, wenn sie messbar ist. Bei einer nahezu
 * starren Referenz wäre jeder Faktor astronomisch; dort ist der absolute
 * Differenzpegel die ehrlichere Skala.
 */
export function classifyDifferenceStrength(metrics: DifferenceMetrics): DifferenceStrength {
  const amplitude = Math.max(0, finiteOr(metrics.relativeAmplitude, 0));
  const db = finiteOr(metrics.relativeDb, -120);
  const multiple =
    metrics.variationMultiple !== null &&
    Number.isFinite(metrics.variationMultiple) &&
    metrics.variationMultiple >= 0
      ? metrics.variationMultiple
      : null;

  let level: DifferenceStrengthLevel;
  // Unter −34 dB (≈ 2 %) bleibt die Abweichung unabhängig von einem unruhigen
  // Faktor akustisch sehr klein. Danach entscheidet bevorzugt die Referenz.
  if (db <= -34) level = 'within';
  else if (multiple !== null) {
    if (multiple <= 1.5) level = 'within';
    else if (multiple <= 3) level = 'slight';
    else if (multiple <= 6) level = 'clear';
    else level = 'strong';
  } else if (db <= -26) level = 'within';
  else if (db <= -20) level = 'slight';
  else if (db <= -12) level = 'clear';
  else level = 'strong';

  // Logarithmische Sichtskala: −40 dB = 0 %, 0 dB = 100 %. So bleibt ein
  // kleiner Unterschied sichtbar, ohne dass 10 % Amplitude wie 10 % Fläche
  // und damit fälschlich fast „nichts" aussehen.
  const meterPercent = Math.min(100, Math.max(0, ((db + 40) / 40) * 100));
  return {
    level,
    percent: Math.min(999, amplitude * 100),
    meterPercent,
    variationMultiple: multiple,
    relativeDb: db,
  };
}
