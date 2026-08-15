/**
 * Der Schalter zwischen alter und neuer Schale.
 *
 * Die neue Nutzerreise (`docs/nutzerreise-wie-tourfuchs.md`) wird nicht als
 * Kopie gebaut, sondern als zweite Schale um dieselben Abschnitte. Damit ist
 * der Rückweg ein Schalter statt eines Zurückrollens — und beide Schalen
 * lassen sich am selben Bau messen, was der Auftraggeber mit „Konzept ist
 * geprüft, jede Designänderung kritisch" verlangt hat.
 *
 * Voreinstellung ist seit Schnitt 7 `neu` — nachdem `npm run schalenvergleich`
 * beide Schalen nebeneinandergelegt hat (§7a des Papiers) und `durchlauf` den
 * Hauptweg samt der drei Auflagen auch in der neuen Schale trägt.
 *
 * Der Schalter bleibt. Die alte Schale ist der Rückweg, nicht Ballast: Solange
 * niemand die neue über längere Zeit benutzt hat, wäre ihr Entfernen eine
 * Wette. Und `durchlauf` misst weiter beide.
 */

import { logger } from './logger.js';

export type Schalenart = 'alt' | 'neu';

export const SCHALE_EVENT = 'zanobot:schale-change';

const SPEICHER = 'zanobot.schale';

const gueltig = (wert: string | null): wert is Schalenart => wert === 'alt' || wert === 'neu';

export function gemerkteSchale(): Schalenart {
  try {
    const wert = localStorage.getItem(SPEICHER);
    return gueltig(wert) ? wert : 'neu';
  } catch {
    return 'neu';
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
