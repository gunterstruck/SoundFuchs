/**
 * DER REITER „FILTER" — CHIPS STATT PULLDOWN
 *
 * ## Die Frage, die der Auftraggeber gestellt hat
 *
 * „Ein Pulldown, womit?" — und dann: „Du bist der PO, entscheide, setze um."
 *
 * ## Entschieden: wonach
 *
 * Ein Filter darf nur nach dem fragen, was der Nutzer im Kopf hat, wenn er das
 * Blatt aufzieht. Bei hundert Standorten sind das zwei Fragen:
 *
 *     „Wo ist etwas auffällig?"        →  Zustand
 *     „Wo war lange niemand mehr?"     →  zuletzt geprüft
 *
 * Beides beantwortet die Übersicht schon; für die zweite Frage behält sie seit
 * heute den Zeitpunkt, den sie ohnehin gelesen hat.
 *
 * Eine dritte Reihe steht nur da, wenn sie etwas zu sagen hat: **Flotte**. Wer
 * keine Flottengruppen gepflegt hat, bekommt keine leere Reihe — und wer nur
 * eine hat, bekommt keinen Filter, der nichts filtert.
 *
 * Nicht dabei ist eine Suche nach Namen. Die gibt es schon, oben in der
 * Kopfleiste, und zwar für die ganze Anwendung. Eine zweite hier wäre ein
 * zweiter Ort für dieselbe Frage.
 *
 * ## Entschieden: Chips, kein Pulldown
 *
 * Der Auftraggeber hat ein Pulldown vorgeschlagen. Es sind Chips geworden, aus
 * drei Gründen:
 *
 * 1. **Der Stamm spricht so.** TourFuchs setzt für Auswahl aus wenigen festen
 *    Möglichkeiten Pillen ein, nicht `<select>`. Ein Pulldown hier wäre eine
 *    fremde Form an einer Stelle, die der Stamm schon beantwortet hat.
 * 2. **Mehrfachauswahl.** „kritisch ODER Abweichung" ist die häufigste Frage
 *    überhaupt. Ein Pulldown kann das nur mit Mehrfachauswahl, und die ist auf
 *    dem Telefon die unangenehmste Bedienform, die es gibt.
 * 3. **Sichtbar ohne Tipp.** Ein Pulldown verbirgt seinen Stand hinter einem
 *    Wort. Chips zeigen mit einem Blick, was gerade gilt — und ein Filter, den
 *    man vergessen hat, ist schlimmer als keiner.
 *
 * ## Was er NICHT tut
 *
 * Er filtert die **Liste**, nicht die Karte. Die Karte ist der Stamm, ihre
 * Punkte kommen aus dessen Markerschicht, und eine halbleere Karte ohne
 * sichtbaren Grund wäre die schlechtere Auskunft. Deshalb steht der Stand des
 * Filters auch über der Liste, mit dem Weg zurück daneben.
 */

import type { StandortStand } from '../../services/bestandsuebersicht.js';
import type { Zustand } from '../../services/bestandsuebersicht.js';
import { t } from '../../i18n/index.js';

/** Alle Zustände, in der Reihenfolge der Dringlichkeit. */
const ZUSTAENDE: readonly Zustand[] = ['kritisch', 'warnung', 'gesund', 'ungeprueft'] as const;

/**
 * Die drei Zeitfenster.
 *
 * `nie` ist bewusst dabei und nicht dasselbe wie „ungeprüft" beim Zustand: Ein
 * Standort kann geprüfte und ungeprüfte Maschinen haben. „Zustand ungeprüft"
 * heißt „keine einzige Messung an keiner Maschine"; „zuletzt: nie" heißt
 * dasselbe — aber wer nach Alter sucht, sucht in dieser Reihe und soll dort
 * nicht ins Leere greifen.
 */
const ALTER = ['nie', 'ab30', 'ab90'] as const;
export type Altersfenster = (typeof ALTER)[number];

const TAG = 24 * 60 * 60 * 1000;

/** Was gerade gilt. Leere Menge heißt: diese Reihe filtert nicht. */
const gewaehlt: {
  zustand: Set<Zustand>;
  alter: Set<Altersfenster>;
  flotte: Set<string>;
} = { zustand: new Set(), alter: new Set(), flotte: new Set() };

export const FILTER_GEAENDERT = 'stamm:filter-geaendert';

function melde(): void {
  document.dispatchEvent(new CustomEvent(FILTER_GEAENDERT));
}

/** Filtert gerade überhaupt etwas? */
export function filterAktiv(): boolean {
  return gewaehlt.zustand.size > 0 || gewaehlt.alter.size > 0 || gewaehlt.flotte.size > 0;
}

/** Alles wieder zeigen. */
export function filterAufheben(): void {
  if (!filterAktiv()) return;
  gewaehlt.zustand.clear();
  gewaehlt.alter.clear();
  gewaehlt.flotte.clear();
  melde();
}

function altPasst(zuletzt: number | null, fenster: Altersfenster, jetzt: number): boolean {
  if (fenster === 'nie') return zuletzt === null;
  if (zuletzt === null) {
    /**
     * Noch nie geprüft zählt NICHT als „älter als 30 Tage".
     *
     * Das wäre logisch verteidigbar und praktisch irreführend: Wer nach „älter
     * als 90 Tage" sucht, sucht Standorte, an denen die Prüfung eingeschlafen
     * ist — nicht solche, die nie angefangen haben. Für die gibt es „nie".
     */
    return false;
  }
  return jetzt - zuletzt >= (fenster === 'ab30' ? 30 : 90) * TAG;
}

/**
 * Passt dieser Standort durch den Filter?
 *
 * Zwischen den Reihen gilt UND, innerhalb einer Reihe ODER. Das ist die
 * Bedeutung, die jeder von Chips erwartet: „kritisch oder Abweichung, und
 * davon die, an denen lange niemand war."
 */
export function standortPasst(stand: StandortStand, jetzt = Date.now()): boolean {
  if (gewaehlt.zustand.size > 0 && !gewaehlt.zustand.has(stand.zustand)) return false;
  if (gewaehlt.alter.size > 0) {
    const trifft = [...gewaehlt.alter].some((f) => altPasst(stand.zuletzt, f, jetzt));
    if (!trifft) return false;
  }
  if (gewaehlt.flotte.size > 0) {
    const trifft = stand.flotten.some((f) => gewaehlt.flotte.has(f));
    if (!trifft) return false;
  }
  return true;
}

/** Der Stand in Worten — für die Zeile über der Liste. */
export function filterInWorten(): string {
  const teile: string[] = [];
  for (const z of ZUSTAENDE) if (gewaehlt.zustand.has(z)) teile.push(t(`filter.zustand.${z}`));
  for (const a of ALTER) if (gewaehlt.alter.has(a)) teile.push(t(`filter.alter.${a}`));
  for (const f of [...gewaehlt.flotte].sort((a, b) => a.localeCompare(b))) teile.push(f);
  return teile.join(' · ');
}

/**
 * Eine Reihe Chips.
 *
 * Jeder Chip ist ein Knopf mit `aria-pressed` — kein Kästchen mit Beschriftung
 * daneben. Das ist nicht Geschmack: Ein gedrückter Knopf ist ein Zustand, den
 * Vorleseprogramme ansagen, und er ist mit dem Daumen zu treffen, weil die
 * ganze Fläche zählt.
 */
function chipreihe(
  ueberschrift: string,
  eintraege: { schluessel: string; beschriftung: string; anzahl: number }[],
  gesetzt: (schluessel: string) => boolean,
  schalte: (schluessel: string) => void
): HTMLElement {
  const feld = document.createElement('div');
  feld.className = 'standortfilter-reihe';

  const h = document.createElement('h4');
  h.className = 'standortfilter-titel';
  h.textContent = ueberschrift;
  feld.appendChild(h);

  const zeile = document.createElement('div');
  zeile.className = 'standortfilter-chips';
  for (const eintrag of eintraege) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'standortfilter-chip';
    chip.dataset.wert = eintrag.schluessel;
    chip.setAttribute('aria-pressed', String(gesetzt(eintrag.schluessel)));
    /**
     * Die Zahl steht am Chip, nicht erst im Ergebnis.
     *
     * Ein Chip, der auf 0 Standorte führt, ist eine Sackgasse — und man sieht
     * sie erst, nachdem man getippt hat. Mit der Zahl daneben entscheidet man
     * vorher.
     */
    chip.textContent = `${eintrag.beschriftung} ${eintrag.anzahl}`;
    if (eintrag.anzahl === 0) chip.classList.add('standortfilter-chip-leer');
    chip.addEventListener('click', () => schalte(eintrag.schluessel));
    zeile.appendChild(chip);
  }
  feld.appendChild(zeile);
  return feld;
}

/**
 * Den Reiter bauen.
 *
 * Die Zahlen an den Chips zählen gegen den GANZEN Bestand, nicht gegen die
 * bereits gefilterte Menge. Sonst zeigte der eigene Chip nach dem Tippen die
 * Zahl, die er selbst erzeugt hat, und alle anderen 0 — eine Anzeige, die sich
 * selbst beantwortet.
 */
export function filterreiterBauen(ziel: HTMLElement, bestand: StandortStand[]): void {
  ziel.replaceChildren();

  if (bestand.length === 0) {
    const p = document.createElement('p');
    p.className = 'blatt-leer';
    p.textContent = t('liste.nochKeiner');
    ziel.appendChild(p);
    return;
  }

  const jetzt = Date.now();
  const umschalten = <W extends string>(menge: Set<W>, wert: W): void => {
    if (menge.has(wert)) menge.delete(wert);
    else menge.add(wert);
    melde();
  };

  ziel.appendChild(
    chipreihe(
      t('filter.titelZustand'),
      ZUSTAENDE.map((z) => ({
        schluessel: z,
        beschriftung: t(`filter.zustand.${z}`),
        anzahl: bestand.filter((s) => s.zustand === z).length,
      })),
      (k) => gewaehlt.zustand.has(k as Zustand),
      (k) => umschalten(gewaehlt.zustand, k as Zustand)
    )
  );

  ziel.appendChild(
    chipreihe(
      t('filter.titelAlter'),
      ALTER.map((a) => ({
        schluessel: a,
        beschriftung: t(`filter.alter.${a}`),
        anzahl: bestand.filter((s) => altPasst(s.zuletzt, a, jetzt)).length,
      })),
      (k) => gewaehlt.alter.has(k as Altersfenster),
      (k) => umschalten(gewaehlt.alter, k as Altersfenster)
    )
  );

  /**
   * Die Flottenreihe nur, wenn sie wirklich GRUPPIERT.
   *
   * Erst stand hier „mehr als eine Gruppe". Gemessen mit den Beispieldaten am
   * 23.08.2026 ergab das zehn Chips — „Extruder · Rockenberg 1",
   * „Extruder · Zwickau 1", „Förderband · Bremen 1" … Jede Gruppe traf genau
   * einen Standort. Das ist keine Flottenauswahl, das ist die Standortliste
   * ein zweites Mal, nur in Chips und ohne Reihenfolge.
   *
   * Die Bedingung ist deshalb schärfer: Mindestens eine Gruppe muss über
   * mehreren Standorten liegen. Wo jede Gruppe für sich steht, ist „Flotte"
   * kein Ordnungsbegriff, und eine Reihe, die nichts ordnet, kostet nur Platz
   * und Aufmerksamkeit.
   */
  const flotten = [...new Set(bestand.flatMap((s) => s.flotten))].sort((a, b) =>
    a.localeCompare(b)
  );
  const gruppiert = flotten.some(
    (f) => bestand.filter((s) => s.flotten.includes(f)).length > 1
  );
  if (flotten.length > 1 && gruppiert) {
    ziel.appendChild(
      chipreihe(
        t('filter.titelFlotte'),
        flotten.map((f) => ({
          schluessel: f,
          beschriftung: f,
          anzahl: bestand.filter((s) => s.flotten.includes(f)).length,
        })),
        (k) => gewaehlt.flotte.has(k),
        (k) => umschalten(gewaehlt.flotte, k)
      )
    );
  }

  /**
   * Das Ergebnis, bevor man hinsieht.
   *
   * „12 von 130 Standorten" beantwortet die Frage, die man nach jedem Tipp
   * hat — und beantwortet sie hier, wo getippt wird, statt im anderen Reiter.
   */
  const treffer = bestand.filter((s) => standortPasst(s, jetzt)).length;
  const stand = document.createElement('p');
  stand.className = 'standortfilter-stand';
  stand.setAttribute('role', 'status');
  stand.textContent = t('filter.trefferVon', {
    treffer: String(treffer),
    gesamt: String(bestand.length),
  });
  ziel.appendChild(stand);

  if (filterAktiv()) {
    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'standortfilter-aufheben';
    zurueck.textContent = t('filter.aufheben');
    zurueck.addEventListener('click', () => filterAufheben());
    ziel.appendChild(zurueck);
  }
}
