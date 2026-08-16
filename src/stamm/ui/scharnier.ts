/**
 * Das Scharnier.
 *
 * Der Übergang zwischen den beiden Welten: davor die TourFuchs-Oberfläche mit
 * der Karte, dahinter Standort-, Maschinen- und Analyseansicht mit den
 * akustischen Funktionen. Der Auftraggeber hat es an genau einem Element
 * festgemacht — **dem klickbaren Namen**:
 *
 *     Karte → Maschinenstandortname → Standortansicht → Maschinenliste
 *           → Maschinenansicht → Zanobo-Funktionen
 *
 * Dieses Modul ist die Tür selbst, nicht das, was dahinter liegt. Es weiß, wie
 * man aufmacht und wie man zurückkommt, und sonst nichts. Was hinter der Tür
 * steht, wird Schnitt für Schnitt ersetzt, ohne dass die Tür sich ändert.
 *
 * ## Warum kein zweites Fenster
 *
 * Die Alternative wäre ein Dialog über der Karte gewesen. Dagegen sprach, dass
 * die Tiefe kein Nebenschauplatz ist: Dort wird aufgenommen, verglichen und
 * gehört — das sind Minuten, keine Sekunden. Ein Fenster, das man so lange
 * offen hält, ist kein Fenster mehr, sondern ein Ort. Orte bekommen einen
 * eigenen Bildschirm und einen Weg zurück.
 */

import { logger } from '@utils/logger.js';

/** Wird gemeldet, wenn die Tiefe aufgeht — mit dem Standort, um den es geht. */
export const TIEFE_GEOEFFNET = 'stamm:tiefe-geoeffnet';
/** Wird gemeldet, wenn wieder die Karte im Bild ist. */
export const TIEFE_GESCHLOSSEN = 'stamm:tiefe-geschlossen';

export interface TiefeDetail {
  /** Der Maschinenstandort, dessen Name angeklickt wurde. */
  standortId: string | null;
}

let offenerStandort: string | null = null;

function tiefe(): HTMLElement | null {
  return document.getElementById('zanobo-tiefe');
}

/** Steht gerade die Tiefe im Bild statt der Karte? */
export function tiefeIstOffen(): boolean {
  return document.body.classList.contains('tiefe-offen');
}

/** Welcher Standort ist offen? `null`, wenn die Karte im Bild ist. */
export function offenerStandortId(): string | null {
  return tiefeIstOffen() ? offenerStandort : null;
}

/**
 * Die Tür aufmachen.
 *
 * @param standortId Der Maschinenstandort, oder `null` für „ohne Standort" —
 *   etwa wenn eine Maschine über die Suche oder einen Deep-Link erreicht wird
 *   und ihr Standort (noch) nicht feststeht.
 */
export function oeffneTiefe(standortId: string | null = null): void {
  const ziel = tiefe();
  if (!ziel) {
    logger.warn('Scharnier: #zanobo-tiefe fehlt im Markup — die Tür führt nirgendwohin');
    return;
  }
  offenerStandort = standortId;
  ziel.hidden = false;
  document.body.classList.add('tiefe-offen');
  // Von oben anfangen. Wer vorher weit unten war und zurückkommt, soll nicht
  // mitten im Text landen.
  ziel.scrollTop = 0;
  document.dispatchEvent(
    new CustomEvent<TiefeDetail>(TIEFE_GEOEFFNET, { detail: { standortId } })
  );
}

/** Die Tür zumachen — zurück auf die Karte. */
export function schliesseTiefe(): void {
  const ziel = tiefe();
  if (!ziel) return;
  const vorher = offenerStandort;
  offenerStandort = null;
  ziel.hidden = true;
  document.body.classList.remove('tiefe-offen');
  document.dispatchEvent(
    new CustomEvent<TiefeDetail>(TIEFE_GESCHLOSSEN, { detail: { standortId: vorher } })
  );
}

/**
 * Den Rückweg einbauen und die Escape-Taste verdrahten.
 *
 * Der Knopf wird hier erzeugt und nicht ins HTML geschrieben: Er gehört zur
 * Tür, nicht zum Inhalt dahinter. Wenn der Inhalt in späteren Schnitten
 * ausgetauscht wird, soll der Rückweg nicht mit verschwinden.
 */
export function scharnierAufbauen(): void {
  const ziel = tiefe();
  if (!ziel) return;

  if (!ziel.querySelector('.tiefe-zurueck')) {
    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'tiefe-zurueck';
    zurueck.innerHTML = '<span aria-hidden="true">‹</span> Zur Karte';
    zurueck.setAttribute('aria-label', 'Zurück zur Standortkarte');
    zurueck.addEventListener('click', () => schliesseTiefe());
    ziel.prepend(zurueck);
  }

  // Escape schließt die Tiefe — aber nur, wenn kein Dialog darüber liegt.
  // Sonst nähme man dem Dialog seine eigene Escape-Taste weg und schlösse zwei
  // Dinge mit einem Druck.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !tiefeIstOffen()) return;
    const dialogOffen = document.querySelector<HTMLElement>(
      '.modal[style*="flex"], .modal[style*="block"], dialog[open]'
    );
    if (dialogOffen) return;
    schliesseTiefe();
  });
}
