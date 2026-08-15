/**
 * DER REITER „FILTER" — Zustand · Standort · Flottengruppe
 *
 * Drei Auswahlfelder und ein Weg zurück auf „alles". Mehr braucht es nicht:
 * Was gefiltert werden kann, ist genau das, was ein Standort trägt (§0d) —
 * sein Zustand, er selbst, und die Flotten, die dort stehen.
 *
 * Die Felder füllen sich aus dem Bestand, nicht aus einer festen Liste. Eine
 * Flottengruppe, die es nicht gibt, steht deshalb auch nicht zur Wahl — ein
 * Filter, der auf Leeres zeigt, ist eine Falle mit Anlauf.
 */

import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import {
  ladeBestandsuebersicht,
  type StandortStand,
  type Zustand,
} from '../../services/bestandsuebersicht.js';
import {
  filterstand,
  setzeFilter,
  leereFilter,
  istGefiltert,
  FILTER_EVENT,
} from './standortfilter.js';

const ZUSTAENDE: Zustand[] = ['gesund', 'warnung', 'kritisch', 'ungeprueft'];

const ZUSTAND_NAME: Record<Zustand, string> = {
  get gesund() {
    return t('schale.filter.healthy');
  },
  get warnung() {
    return t('schale.filter.warning');
  },
  get kritisch() {
    return t('schale.filter.critical');
  },
  get ungeprueft() {
    return t('schale.filter.unchecked');
  },
};

export class Filterleiste {
  private wurzel: HTMLElement | null = null;
  private aufraeumer: Array<() => void> = [];

  public baue(tafel: HTMLElement): void {
    const wurzel = document.createElement('div');
    wurzel.className = 'filterleiste';
    tafel.appendChild(wurzel);
    this.wurzel = wurzel;
    void this.zeichne();

    // Der Rückweg erscheint, sobald etwas gefiltert ist — und zwar sofort,
    // nicht erst beim nächsten vollständigen Zeichnen. Nur der Knopf wird
    // angefasst: Ein Neuaufbau würde die Auswahlfelder mitten im Benutzen
    // ersetzen und dem Finger die Liste unter dem Tippen wegziehen.
    const beiFilter = () => this.frischeRueckweg();
    document.addEventListener(FILTER_EVENT, beiFilter);
    this.aufraeumer.push(() => document.removeEventListener(FILTER_EVENT, beiFilter));
  }

  public abbauen(): void {
    for (const weg of this.aufraeumer) weg();
    this.aufraeumer = [];
    this.wurzel?.remove();
    this.wurzel = null;
  }

  private frischeRueckweg(): void {
    const knopf = this.wurzel?.querySelector<HTMLElement>('.filter-zuruecksetzen');
    if (knopf) knopf.hidden = !istGefiltert();
  }

  private feld(
    beschriftung: string,
    id: string,
    werte: Array<[string, string]>,
    gewaehlt: string,
    beiWahl: (wert: string) => void
  ): HTMLElement {
    const gruppe = document.createElement('label');
    gruppe.className = 'filter-feld';

    const text = document.createElement('span');
    text.className = 'filter-feld-name';
    text.textContent = beschriftung;

    const auswahl = document.createElement('select');
    auswahl.id = id;
    auswahl.className = 'filter-feld-wahl';
    for (const [wert, name] of werte) {
      const eintrag = document.createElement('option');
      eintrag.value = wert;
      eintrag.textContent = name;
      eintrag.selected = wert === gewaehlt;
      auswahl.appendChild(eintrag);
    }
    auswahl.addEventListener('change', () => beiWahl(auswahl.value));

    gruppe.append(text, auswahl);
    return gruppe;
  }

  public async zeichne(): Promise<void> {
    if (!this.wurzel) return;

    let uebersicht: StandortStand[] = [];
    try {
      uebersicht = await ladeBestandsuebersicht();
    } catch (fehler) {
      logger.warn('Filter: der Bestand ließ sich nicht lesen', fehler);
    }

    const stand = filterstand();
    const alle = t('schale.filter.all');

    // Nur Zustände anbieten, die es wirklich gibt. Sonst wählt man „kritisch"
    // und bekommt eine leere Karte, ohne zu wissen, ob der Filter arbeitet
    // oder alles in Ordnung ist.
    const vorhandeneZustaende = new Set(uebersicht.map((e) => e.zustand));
    const standorte = [...uebersicht]
      .map((e) => [e.kunde.id, e.kunde.name] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
    const flotten = [...new Set(uebersicht.flatMap((e) => e.flotten))]
      .sort((a, b) => a.localeCompare(b))
      .map((f) => [f, f] as [string, string]);

    this.wurzel.textContent = '';
    this.wurzel.appendChild(
      this.feld(
        t('schale.filter.condition'),
        'filter-zustand',
        [
          ['', alle],
          ...ZUSTAENDE.filter((z) => vorhandeneZustaende.has(z)).map(
            (z) => [z, ZUSTAND_NAME[z]] as [string, string]
          ),
        ],
        stand.zustand,
        (wert) => setzeFilter({ zustand: wert as Zustand | '' })
      )
    );
    this.wurzel.appendChild(
      this.feld(
        t('schale.filter.site'),
        'filter-standort',
        [['', alle], ...standorte],
        stand.standortId,
        (wert) => setzeFilter({ standortId: wert })
      )
    );
    this.wurzel.appendChild(
      this.feld(
        t('schale.filter.fleet'),
        'filter-flotte',
        [['', alle], ...flotten],
        stand.flotte,
        (wert) => setzeFilter({ flotte: wert })
      )
    );

    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.id = 'filter-zuruecksetzen';
    zurueck.className = 'filter-zuruecksetzen';
    zurueck.textContent = t('schale.filter.reset');
    zurueck.hidden = !istGefiltert();
    zurueck.addEventListener('click', () => {
      leereFilter();
      void this.zeichne();
    });
    this.wurzel.appendChild(zurueck);
  }
}
