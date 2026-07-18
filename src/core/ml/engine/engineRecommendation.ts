/**
 * ZANOBOT — Auto-Empfehlung stationär/instationär (Tier 2, T2-a3)
 *
 * Konzept §7: "Erkennen, nicht übernehmen." Beim Anlernen mit einer
 * Mittelwert-Engine (GMIA/Spektral-Cosine) wird die Referenzaufnahme auf
 * Nicht-Stationarität geprüft:
 *  - Variationskoeffizient der Frame-Energien (CV groß = Pegel bewegt sich),
 *  - Onset-/Ereignisdichte (Ventil-Klacks, Schläge),
 *  - stabile Periodizität der Energie-Hüllkurve (getaktete Maschine).
 * Trifft eines zu, bekommt der Nutzer einen HINWEIS, dass die Zeitmuster-
 * Engine (Tier 2) für solche Maschinen gebaut ist — mit einem Tap
 * umschaltbar. Keine Automatik-Magie: der Nutzer entscheidet
 * (Zanobo-Philosophie: Vergleich statt Diagnose).
 *
 * Reine Funktion, vollständig unit-testbar.
 */

import { buildEventBank } from './temporalEvents.js';
import { detectCyclePeriod } from './temporalCycle.js';

/** CV der Frame-Energien, ab dem die Aufnahme als bewegt/instationär gilt. */
export const NONSTATIONARY_CV = 0.2;

/** Ereignisdichte, ab der die Aufnahme als transient-geprägt gilt. */
export const NONSTATIONARY_EVENT_RATE_PER_MIN = 30;

export interface NonStationarityAssessment {
  /** Variationskoeffizient (std/mean) der Frame-RMS-Reihe (0 ohne Rohsignal). */
  energyCv: number;
  /** Onset-Dichte der Aufnahme (Ereignisse pro Minute). */
  eventRatePerMin: number;
  /** Dominante Zyklusperiode der Hüllkurve, oder null. */
  cyclePeriodSec: number | null;
  /** Empfehlung: Zeitmuster-Engine (Tier 2) anbieten? */
  recommendTemporal: boolean;
}

/**
 * Referenzaufnahme auf Nicht-Stationarität prüfen.
 *
 * @param features Frame-Features der Aufnahme (relative ESD)
 * @param frameRms Frame-RMS-Reihe (Energie-Hüllkurve) — optional; ohne sie
 *        tragen nur die Onsets zur Bewertung bei
 * @param hopSec   Hop der Frame-Extraktion (Sekunden)
 */
export function assessNonStationarity(
  features: Float64Array[],
  frameRms: number[] | undefined,
  hopSec: number
): NonStationarityAssessment {
  const eventRatePerMin = buildEventBank(features, hopSec).eventRatePerMin;

  let energyCv = 0;
  let cyclePeriodSec: number | null = null;
  if (frameRms && frameRms.length > 1) {
    const mean = frameRms.reduce((s, v) => s + v, 0) / frameRms.length;
    if (mean > 0) {
      const variance =
        frameRms.reduce((s, v) => s + (v - mean) * (v - mean), 0) / frameRms.length;
      energyCv = Math.sqrt(variance) / mean;
    }
    cyclePeriodSec = detectCyclePeriod(frameRms, hopSec)?.periodSec ?? null;
  }

  const recommendTemporal =
    energyCv > NONSTATIONARY_CV ||
    eventRatePerMin >= NONSTATIONARY_EVENT_RATE_PER_MIN ||
    cyclePeriodSec !== null;

  return { energyCv, eventRatePerMin, cyclePeriodSec, recommendTemporal };
}
