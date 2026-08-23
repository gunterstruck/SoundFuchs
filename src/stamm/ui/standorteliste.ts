/**
 * DIE STANDORTLISTE — DER REITER „STANDORTE" BEKOMMT SEINEN INHALT
 *
 * ## Der Befund, der das nötig macht
 *
 * Gemessen am 23.08.2026 auf der Kartenebene (Handy 390 × 844), Blatt
 * aufgezogen:
 *
 *     Reiter          „📄 Standorte"  ·  „Filter"
 *     tab-daten       "" — 0 Kinder
 *     tab-filter      "" — 0 Kinder
 *
 * Das ist derselbe Befund, der eine Ebene tiefer zum Analyseblatt geführt hat:
 * Das Blatt war da, ließ sich aufziehen — und war leer. Ein leerer Reiter sieht
 * aus wie ein Fehler, nicht wie eine Auskunft.
 *
 * ## Warum er ausgerechnet jetzt gefüllt wird
 *
 * Weil der Schnellcheck sonst etwas anlegte, das niemand wiederfindet. Ein
 * Standort ohne Postleitzahl hat keinen Punkt auf der Karte (`geo: 'none'` —
 * so hält es `CustomerField` seit jeher fest). Auf der Karte ist er damit
 * unsichtbar, und die Karte war bis eben der einzige Weg zu einem Standort.
 *
 * Der Auftraggeber will „heute filmen und in vier Wochen vergleichen". In vier
 * Wochen muss der Weg zurück existieren — und zwar für JEDEN Standort, nicht
 * nur für die mit Koordinaten.
 *
 * ## Warum sie NICHT nach Nähe sortiert
 *
 * TourFuchs sortiert seine Kundenliste nach Entfernung. Das setzt voraus, dass
 * jeder Eintrag eine Position hat — genau das, was hier nicht gilt. Sortiert
 * wird deshalb nach dem, was jeder Standort hat: seinem Zustand, und darin
 * nach Namen. Die schlechteste Maschine steht oben, weil sie die Frage ist.
 */

import { ladeBestandsuebersicht, type StandortStand } from '../../services/bestandsuebersicht.js';
import { farbeFuerZustand, standortname } from '../features/standortmarker.js';
import { oeffneTiefe, TIEFE_GESCHLOSSEN } from './scharnier.js';
import {
  BLATT_GEAENDERT,
  REITER_GEWECHSELT,
  blattIstOffen,
  offenerReiter,
  type Reiter,
} from './schale.js';
import {
  FILTER_GEAENDERT,
  filterAktiv,
  filterAufheben,
  filterInWorten,
  filterreiterBauen,
  standortPasst,
} from './standortfilter.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

const PLATZ = 'tab-daten';
const FILTERPLATZ = 'tab-filter';

/**
 * Die Reihenfolge der Zustände: Was am dringendsten ist, steht oben.
 *
 * „Ungeprüft" ganz unten und nicht ganz oben: Ein Standort ohne Messung ist
 * keine schlechte Nachricht, sondern gar keine. Ihn über einen kritischen zu
 * stellen hieße, Nichtwissen für Alarm zu halten.
 */
const RANG: Readonly<Record<string, number>> = Object.freeze({
  kritisch: 0,
  warnung: 1,
  gesund: 2,
  ungeprueft: 3,
});

let laeuft = false;

function platz(): HTMLElement | null {
  return document.getElementById(PLATZ);
}

/**
 * Ein leerer Reiter sagt, was fehlt — er bleibt nicht stumm.
 *
 * Dieselbe Regel wie im Analyseblatt (`blatt-leer`), deshalb dieselbe Klasse:
 * Zwei Formen für denselben Zustand wären zwei Antworten auf dieselbe Frage.
 */
function leerzustand(ziel: HTMLElement, text: string): void {
  const p = document.createElement('p');
  p.className = 'blatt-leer';
  p.textContent = text;
  ziel.appendChild(p);
}

/** Eine Zeile: welcher Standort, wie geht es ihm, wie viele Maschinen. */
function zeile(stand: StandortStand): HTMLElement {
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'near-row standorteliste-zeile';

  const punkt = document.createElement('span');
  punkt.className = 'near-dot';
  punkt.style.background = farbeFuerZustand(stand.zustand);
  punkt.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'standorteliste-zeile-text';

  const name = document.createElement('span');
  name.className = 'near-name';
  name.textContent = standortname(stand.kunde.name, { demo: stand.kunde.demo });

  /**
   * Die zweite Zeile sagt zwei Dinge, und beide in Worten.
   *
   * „3 Maschinen · schlechteste 61 %" — nicht „61 %" allein: Eine Zahl ohne
   * Bezugswort ist auf einer Liste aus lauter Zahlen keine Auskunft. Und ohne
   * Messung steht dort, dass es keine gibt, statt einer leeren Stelle.
   */
  const lage = document.createElement('span');
  lage.className = 'standorteliste-zeile-lage';
  const anzahl = t(stand.maschinen.length === 1 ? 'liste.eineMaschine' : 'liste.maschinen', {
    count: String(stand.maschinen.length),
  });
  lage.textContent =
    stand.schlechtester === null
      ? `${anzahl} · ${t('liste.nochNichtGeprueft')}`
      : `${anzahl} · ${t('liste.schlechteste', { wert: String(Math.round(stand.schlechtester)) })}`;

  text.append(name, lage);
  knopf.append(punkt, text);
  knopf.addEventListener('click', () => oeffneTiefe(stand.kunde.id, 'standort'));
  return knopf;
}

/**
 * Die Liste bauen.
 *
 * Sie holt den ganzen Bestand — denselben Abzug, den auch die Karte holt.
 * Deshalb erst, wenn der Reiter wirklich zu sehen ist: Wer das Blatt unten
 * lässt, zahlt dafür nichts.
 *
 * ## Warum sie sich NICHTS merkt
 *
 * Der erste Versuch merkte sich, dass sie schon gebaut war, und baute nicht
 * noch einmal. Gemessen im Wächter: Beim Start lief sie, bevor die
 * Beispieldaten geladen waren, schrieb „Noch kein Standort" — und blieb dabei.
 * Hundert Standorte lagen da, und die Liste sagte, es gebe keinen.
 *
 * Ein Abzug, der den Stand von vorhin zeigt, ist schlimmer als keiner: Er
 * behauptet etwas. Also wird jedes Mal neu geholt, wenn jemand hinsieht —
 * dieselbe Regel, nach der `main.ts` die Karte beim Zurückkommen auffrischt.
 */
export async function standortelisteFuellen(): Promise<void> {
  const ziel = platz();
  if (!ziel || laeuft) return;
  laeuft = true;
  try {
    const bestand = await ladeBestandsuebersicht();
    ziel.replaceChildren();
    if (bestand.length === 0) {
      leerzustand(ziel, t('liste.nochKeiner'));
      return;
    }
    /**
     * Der Filter steht ÜBER der Liste, nicht nur in seinem Reiter.
     *
     * Wer filtert, wechselt danach hierher — und sieht dann eine kurze Liste.
     * Ohne diese Zeile wäre nicht zu unterscheiden, ob es wirklich nur zwölf
     * Standorte gibt oder ob ein Filter läuft, den man vor zehn Minuten
     * gesetzt hat. Ein vergessener Filter ist schlimmer als keiner.
     */
    if (filterAktiv()) ziel.appendChild(filterzeile());

    const sortiert = [...bestand].filter((s) => standortPasst(s)).sort(
      (a, b) =>
        (RANG[a.zustand] ?? 9) - (RANG[b.zustand] ?? 9) ||
        standortname(a.kunde.name, { demo: a.kunde.demo }).localeCompare(
          standortname(b.kunde.name, { demo: b.kunde.demo })
        )
    );
    if (sortiert.length === 0) {
      leerzustand(ziel, t('filter.keinTreffer'));
      return;
    }
    for (const stand of sortiert) ziel.appendChild(zeile(stand));
  } catch (fehler) {
    logger.warn('Standortliste: Bestand nicht ladbar', fehler);
    ziel.replaceChildren();
    leerzustand(ziel, t('liste.nichtLadbar'));
  } finally {
    laeuft = false;
  }
}

/**
 * Die Zeile über der gefilterten Liste: was gilt, und der Weg zurück.
 *
 * Der Weg zurück ist ein Knopf und kein Verweis auf den Filterreiter: „Alle
 * zeigen" ist eine Handlung, und wer sie will, will sie hier — nicht nach
 * einem Reiterwechsel.
 */
function filterzeile(): HTMLElement {
  const zeile = document.createElement('div');
  zeile.className = 'standorteliste-filterzeile';

  const text = document.createElement('span');
  text.className = 'standorteliste-filtertext';
  text.textContent = t('filter.aktiv', { filter: filterInWorten() });

  const alle = document.createElement('button');
  alle.type = 'button';
  alle.className = 'standorteliste-filter-aus';
  alle.textContent = t('filter.alleZeigen');
  alle.addEventListener('click', () => filterAufheben());

  zeile.append(text, alle);
  return zeile;
}

/**
 * Und der Reiter daneben.
 *
 * Bis zum 23.08.2026 stand hier ein Satz: „Filter gibt es noch nicht." Er war
 * ehrlich und die halbe Miete — ein leerer Reiter sieht aus wie ein Fehler,
 * ein benannter nicht. Jetzt trägt er, wonach man bei hundert Standorten
 * wirklich sucht (siehe standortfilter.ts).
 *
 * Er holt denselben Abzug wie die Liste und merkt sich nichts: Die Zahlen an
 * den Chips müssen zum Bestand von JETZT passen, nicht zu dem von vorhin.
 */
async function filterreiterFuellen(): Promise<void> {
  const ziel = document.getElementById(FILTERPLATZ);
  if (!ziel) return;
  try {
    filterreiterBauen(ziel, await ladeBestandsuebersicht());
  } catch (fehler) {
    logger.warn('Filter: Bestand nicht ladbar', fehler);
    ziel.replaceChildren();
    leerzustand(ziel, t('liste.nichtLadbar'));
  }
}

export function standortelisteAufbauen(): void {
  /** Nachziehen, sooft der Reiter wirklich zu sehen ist. */
  const wennSichtbar = () => {
    if (!blattIstOffen()) return;
    if (offenerReiter() === 'filter') void filterreiterFuellen();
    if (offenerReiter() === 'daten') void standortelisteFuellen();
  };

  document.addEventListener(REITER_GEWECHSELT, (ereignis) => {
    const reiter = (ereignis as CustomEvent<Reiter>).detail;
    if (reiter === 'filter') void filterreiterFuellen();
    if (reiter === 'daten') void standortelisteFuellen();
  });

  /**
   * Ein Tipp auf einen Chip ändert beide Reiter.
   *
   * Den Filterreiter, weil dort „12 von 130" steht und „Alle zeigen"
   * dazukommt oder verschwindet — und die Liste, weil sie das Ergebnis ist.
   * Gebaut wird trotzdem nur, was offen ist: Der andere Reiter holt sich
   * seinen Stand, wenn jemand hinsieht.
   */
  document.addEventListener(FILTER_GEAENDERT, () => {
    if (offenerReiter() === 'filter') void filterreiterFuellen();
    if (offenerReiter() === 'daten') void standortelisteFuellen();
  });

  /**
   * Das Blatt geht auf — das ist der Augenblick, in dem jemand hinsieht.
   *
   * Auf dem Handy startet es zugezogen (§0b, „wie TourFuchs"). Ohne dieses
   * Signal hätte die Liste nur den Stand vom Programmstart, und das ist der
   * Stand, bevor überhaupt Daten geladen sind.
   */
  document.addEventListener(BLATT_GEAENDERT, (ereignis) => {
    if ((ereignis as CustomEvent<boolean>).detail) wennSichtbar();
  });

  /**
   * Zurück auf der Karte heißt: Der Bestand kann sich geändert haben.
   *
   * Hinter dem Scharnier wird angelegt, geprüft und gelöscht. Dieselbe
   * Begründung, aus der `main.ts` dort die Karte auffrischt.
   */
  document.addEventListener(TIEFE_GESCHLOSSEN, wennSichtbar);

  wennSichtbar();
}
