/**
 * Der Schalter zwischen alter und neuer Schale.
 *
 * Die neue Nutzerreise (`docs/nutzerreise-wie-tourfuchs.md`) wird nicht als
 * Kopie gebaut, sondern als zweite Schale um dieselben Abschnitte. Damit ist
 * der Rückweg ein Schalter statt eines Zurückrollens — und beide Schalen
 * lassen sich am selben Bau messen, was der Auftraggeber mit „Konzept ist
 * geprüft, jede Designänderung kritisch" verlangt hat.
 *
 * Voreinstellung ist `alt`. Sie dreht sich in Schnitt 7, und erst dann, wenn
 * die Zahlen aus Schnitt 3 stimmen.
 */

import { logger } from './logger.js';

export type Schalenart = 'alt' | 'neu';

export const SCHALE_EVENT = 'zanobot:schale-change';

const SPEICHER = 'zanobot.schale';

const gueltig = (wert: string | null): wert is Schalenart => wert === 'alt' || wert === 'neu';

export function gemerkteSchale(): Schalenart {
  try {
    const wert = localStorage.getItem(SPEICHER);
    return gueltig(wert) ? wert : 'alt';
  } catch {
    return 'alt';
  }
}

export function setzeSchale(art: Schalenart): void {
  try {
    localStorage.setItem(SPEICHER, art);
  } catch (fehler) {
    logger.warn('Schale: die Wahl konnte nicht gemerkt werden', fehler);
  }
  document.dispatchEvent(new CustomEvent<Schalenart>(SCHALE_EVENT, { detail: art }));
}
