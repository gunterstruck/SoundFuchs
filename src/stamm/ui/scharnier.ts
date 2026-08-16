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
import { t } from '../../i18n/index.js';

/** Wird gemeldet, wenn die Tiefe aufgeht — mit dem Standort, um den es geht. */
export const TIEFE_GEOEFFNET = 'stamm:tiefe-geoeffnet';
/** Wird gemeldet, wenn wieder die Karte im Bild ist. */
export const TIEFE_GESCHLOSSEN = 'stamm:tiefe-geschlossen';

export interface TiefeDetail {
  /** Der Maschinenstandort, dessen Name angeklickt wurde. */
  standortId: string | null;
  /** Auf welcher Ebene die Tiefe steht bzw. stand. */
  ebene: Tiefenebene;
}

/**
 * Zwei Ebenen hinter der Tür.
 *
 * `standort` — die Standortansicht: Name, Adresse, alle Maschinen.
 * `maschine` — eine einzelne Maschine mit den akustischen Funktionen.
 *
 * Sie sind eine Kette und kein Nebeneinander: Von der Karte kommt man in den
 * Standort, aus dem Standort in eine Maschine, und derselbe Weg führt zurück.
 * Deshalb hat der Rückweg drei Stationen und nicht zwei — wer aus einer
 * Maschine kommt, will meistens zur Nachbarmaschine, nicht auf die Karte.
 *
 * Ein Sonderfall bleibt: Eine Maschine kann über die Suche, einen Deep-Link
 * oder einen NFC-Anhänger erreicht werden. Dann gibt es keinen Standort, aus
 * dem man kam, und der Rückweg führt direkt auf die Karte.
 */
export type Tiefenebene = 'standort' | 'maschine';

let offenerStandort: string | null = null;
let ebene: Tiefenebene = 'standort';

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

/** Auf welcher Ebene steht die Tiefe gerade? */
export function offeneEbene(): Tiefenebene {
  return ebene;
}

/**
 * Die Tür aufmachen.
 *
 * @param standortId Der Maschinenstandort, oder `null` für „ohne Standort" —
 *   etwa wenn eine Maschine über die Suche oder einen Deep-Link erreicht wird
 *   und ihr Standort (noch) nicht feststeht.
 */
export function oeffneTiefe(
  standortId: string | null = null,
  aufEbene: Tiefenebene = 'standort'
): void {
  const ziel = tiefe();
  if (!ziel) {
    logger.warn('Scharnier: #zanobo-tiefe fehlt im Markup — die Tür führt nirgendwohin');
    return;
  }
  offenerStandort = standortId;
  ebene = aufEbene;
  ziel.hidden = false;
  document.body.classList.add('tiefe-offen');
  document.body.classList.toggle('tiefe-maschine', aufEbene === 'maschine');
  // Von oben anfangen. Wer vorher weit unten war und zurückkommt, soll nicht
  // mitten im Text landen.
  ziel.scrollTop = 0;
  rueckwegBeschriften();
  document.dispatchEvent(
    new CustomEvent<TiefeDetail>(TIEFE_GEOEFFNET, { detail: { standortId, ebene: aufEbene } })
  );
}

/**
 * Eine Stufe zurück.
 *
 * Aus einer Maschine in ihren Standort, aus dem Standort auf die Karte. Ohne
 * bekannten Standort ist die Maschine über Suche, Deep-Link oder NFC erreicht
 * worden — dann gibt es keine Zwischenstation, und der Weg führt hinaus.
 */
export function eineStufeZurueck(): void {
  if (ebene === 'maschine' && offenerStandort) {
    oeffneTiefe(offenerStandort, 'standort');
    return;
  }
  schliesseTiefe();
}

/**
 * Der Rückweg sagt, wohin er führt.
 *
 * „Zurück" allein wäre auf zwei Ebenen zweimal dasselbe Wort für zwei
 * verschiedene Ziele. Wer aus einer Maschine kommt, landet im Standort — das
 * soll dranstehen, bevor man drückt, nicht danach auffallen.
 */
function rueckwegBeschriften(): void {
  const knopf = tiefe()?.querySelector<HTMLElement>('.tiefe-zurueck');
  if (!knopf) return;
  const zumStandort = ebene === 'maschine' && Boolean(offenerStandort);
  const wort = zumStandort ? t('hinge.backToSite') : t('hinge.backToMap');
  knopf.textContent = '';
  const pfeil = document.createElement('span');
  pfeil.setAttribute('aria-hidden', 'true');
  pfeil.textContent = '‹';
  knopf.append(pfeil, ` ${wort}`);
  knopf.setAttribute('aria-label', wort);
}

/** Die Tür zumachen — zurück auf die Karte. */
export function schliesseTiefe(): void {
  const ziel = tiefe();
  if (!ziel) return;
  const vorher = offenerStandort;
  const vorherigeEbene = ebene;
  offenerStandort = null;
  ebene = 'standort';
  ziel.hidden = true;
  document.body.classList.remove('tiefe-offen', 'tiefe-maschine');
  document.dispatchEvent(
    new CustomEvent<TiefeDetail>(TIEFE_GESCHLOSSEN, {
      detail: { standortId: vorher, ebene: vorherigeEbene },
    })
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
    zurueck.addEventListener('click', () => eineStufeZurueck());
    ziel.prepend(zurueck);
  }
  rueckwegBeschriften();

  // Escape schließt die Tiefe — aber nur, wenn kein Dialog darüber liegt.
  // Sonst nähme man dem Dialog seine eigene Escape-Taste weg und schlösse zwei
  // Dinge mit einem Druck.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !tiefeIstOffen()) return;
    const dialogOffen = document.querySelector<HTMLElement>(
      '.modal[style*="flex"], .modal[style*="block"], dialog[open]'
    );
    if (dialogOffen) return;
    eineStufeZurueck();
  });
}
