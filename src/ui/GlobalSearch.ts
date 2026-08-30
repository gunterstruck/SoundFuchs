/**
 * SOUNDFUCHS — SUCHE IN DER KOPFLEISTE
 *
 * Sucht Maschinen nach Name, Ort und ID und zeigt die Treffer als Klappliste
 * unter dem Feld. Ein Tipp auf einen Treffer wählt die Maschine — über
 * denselben Weg, den auch die Liste und der Scanner nehmen.
 *
 * Vorbild ist die Suche von TourFuchs (`#global-search`, `Kunde, Ort, PLZ
 * suchen…`). Der Gedanke dahinter zählt mehr als die Optik: Sobald der Bestand
 * über eine Bildschirmhöhe wächst, ist Tippen schneller als Scrollen — und
 * schneller als jede Sortierung, die man vorher verstehen müsste.
 *
 * Die Suche liest bei jedem Öffnen frisch aus der Datenbank, statt eine Liste
 * mitzuführen. Maschinen entstehen an vielen Stellen (Scan, NFC, Anlegen von
 * Hand, Import); ein mitgeführter Zwischenstand wäre irgendwann veraltet, und
 * eine Suche, die eine gerade angelegte Maschine nicht findet, ist schlimmer
 * als keine.
 */
import { getAllCustomers, getAllMachines } from '@data/db.js';
import type { Customer, Machine } from '@data/types.js';
import { MAX_TREFFER, MINDESTLAENGE, sucheTreffer, type Treffer } from './sucheTreffer.js';
import { logger } from '@utils/logger.js';
import { escapeHtml } from '@utils/sanitize.js';
import { t } from '../i18n/index.js';
import {
  STANDORT_SUCHHINWEIS_MS,
  standortSuchhinweisNeu,
  standortVorgabeAusSuche,
  type StandortVorgabe,
} from './standortSuche.js';

export class GlobalSearch {
  private readonly feld: HTMLInputElement;
  private readonly liste: HTMLElement;
  private readonly beiAuswahl: (machine: Machine) => void;
  private readonly beiStandort: ((kunde: Customer) => void) | null;
  private readonly beiNeuemStandort: ((vorgabe: StandortVorgabe) => void) | null;
  private treffer: Treffer[] = [];
  private hinweisTimer: number | null = null;

  constructor(
    beiAuswahl: (machine: Machine) => void,
    beiStandort?: (kunde: Customer) => void,
    beiNeuemStandort?: (vorgabe: StandortVorgabe) => void
  ) {
    this.beiAuswahl = beiAuswahl;
    this.beiStandort = beiStandort ?? null;
    this.beiNeuemStandort = beiNeuemStandort ?? null;
    this.feld = document.getElementById('global-search') as HTMLInputElement;
    this.liste = document.getElementById('search-results') as HTMLElement;
  }

  /** Gibt es die Kopfleiste auf dieser Seite überhaupt? */
  public get istVerfuegbar(): boolean {
    return Boolean(this.feld && this.liste);
  }

  public init(): void {
    if (!this.istVerfuegbar) return;

    this.feld.addEventListener('input', () => {
      this.hinweisTimerBeenden();
      void this.suchen();
    });
    this.feld.addEventListener('focus', () => {
      this.hinweisTimerBeenden();
      void this.suchen();
    });

    // Escape schließt die Liste, ohne das Feld zu leeren: Wer sich vertippt
    // hat, will meist korrigieren, nicht von vorn anfangen.
    this.feld.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.schliessen();
    });

    // Ein Tipp außerhalb schließt. `mousedown` statt `click`, weil ein Klick
    // auf einen Treffer sonst erst das Schließen auslöst und ins Leere geht.
    document.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof Node)) return;
      if (this.feld.contains(e.target) || this.liste.contains(e.target)) return;
      this.schliessen();
    });

    this.erstenStandorthinweisAnzeigen();
  }

  private async suchen(): Promise<void> {
    const eingabe = this.feld.value.trim();
    const wort = eingabe.toLowerCase();
    if (wort.length < MINDESTLAENGE) {
      this.treffer = [];
      // Auch ein leeres fokussiertes Feld bietet den seltenen Verwaltungsweg
      // an. So muss niemand wissen, welches Wort die Tür sichtbar macht.
      if (this.beiNeuemStandort) this.zeichnen(wort, eingabe);
      else this.schliessen();
      return;
    }

    let machines: Machine[] = [];
    let customers: Customer[] = [];
    try {
      /**
       * Beide Bestände, nebeneinander gelesen.
       *
       * Bis zum 24.08.2026 stand hier nur `getAllMachines()` — und damit fand
       * ein Feld, auf dem „Standort, Maschine, PLZ suchen…" steht, keinen
       * einzigen Standort. Gemessen: „brau" → nichts, obwohl hundert
       * Brauereien im Bestand lagen.
       *
       * `Promise.all` und nicht nacheinander: Es sind zwei unabhängige Lesungen
       * derselben Datenbank, und die Suche läuft bei jedem Tastendruck.
       */
      [machines, customers] = await Promise.all([getAllMachines(), getAllCustomers()]);
    } catch (error) {
      logger.warn('Suche: Bestand konnte nicht gelesen werden', error);
      this.schliessen();
      return;
    }

    this.treffer = sucheTreffer(wort, customers, machines, MAX_TREFFER);

    this.zeichnen(wort, eingabe);
  }

  private zeichnen(wort: string, eingabe: string): void {
    this.liste.innerHTML = '';

    if (this.treffer.length === 0 && wort.length >= MINDESTLAENGE) {
      const leer = document.createElement('div');
      leer.className = 'search-empty';
      leer.textContent = t('search.noHits');
      this.liste.appendChild(leer);
    }

    for (const treffer of this.treffer) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = `search-hit search-hit-${treffer.art}`;
      knopf.setAttribute('role', 'option');
      knopf.dataset.art = treffer.art;

      /**
       * WAS ist das hier — Standort oder Maschine?
       *
       * Ohne diese Marke stünden „Brauerei 0005" und „Kompressor 3"
       * ununterscheidbar untereinander, und ein Tipp führte mal eine Ebene
       * tiefer und mal zwei. Das Wort steht vorn, weil es entscheidet, was der
       * Tipp tut — nicht als Verzierung dahinter.
       */
      const art = document.createElement('span');
      art.className = 'search-hit-art';
      art.textContent = t(treffer.art === 'standort' ? 'search.artStandort' : 'search.artMaschine');

      const name = document.createElement('span');
      name.className = 'search-hit-name';
      name.innerHTML = this.hervorheben(treffer.titel, wort);

      const meta = document.createElement('span');
      meta.className = 'search-hit-meta';
      // Der Zusatz darf leer sein — eine Maschine ohne Standortvermerk hat
      // keinen. Dann steht dort nichts, statt einer inneren Kennung, die dem
      // Nutzer nichts sagt.
      meta.textContent = treffer.zusatz;

      knopf.append(art, name, meta);
      knopf.addEventListener('click', () => {
        this.schliessen();
        this.feld.value = '';
        if (treffer.art === 'standort') this.beiStandort?.(treffer.kunde);
        else this.beiAuswahl(treffer.maschine);
      });
      this.liste.appendChild(knopf);
    }

    if (this.beiNeuemStandort) {
      const vorgabe = standortVorgabeAusSuche(eingabe);
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'search-create-site';

      const plus = document.createElement('span');
      plus.className = 'search-create-site-icon';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = '＋';

      const beschriftung = document.createElement('span');
      beschriftung.className = 'search-create-site-label';
      if (vorgabe.plz) {
        beschriftung.textContent = t('search.createSitePostcode', { postcode: vorgabe.plz });
      } else if (vorgabe.name) {
        beschriftung.textContent = t('search.createSiteNamed', { name: vorgabe.name });
      } else {
        beschriftung.textContent = t('search.createSite');
      }

      knopf.append(plus, beschriftung);
      knopf.addEventListener('click', () => {
        this.hinweisTimerBeenden();
        this.schliessen();
        this.feld.value = '';
        this.beiNeuemStandort?.(vorgabe);
      });
      this.liste.appendChild(knopf);
    }

    this.liste.hidden = false;
  }

  /**
   * Einmal pro Gerät zeigt sich die neue Tür fünf Sekunden lang von selbst.
   * Das Feld bekommt bewusst keinen Fokus: Auf dem Handy bleibt die Tastatur
   * zu und die Karte kann sofort benutzt werden.
   */
  private erstenStandorthinweisAnzeigen(): void {
    if (!this.beiNeuemStandort) return;
    const speicher = typeof localStorage === 'undefined' ? null : localStorage;
    if (!standortSuchhinweisNeu(speicher)) return;

    this.treffer = [];
    // Die automatische Vorschau darf keine darunterliegende Bedienung
    // abfangen. Erst ein bewusster Fokus auf die Suche macht dieselbe Zeile
    // interaktiv.
    this.liste.classList.add('search-results-intro');
    this.zeichnen('', '');
    this.hinweisTimer = window.setTimeout(() => {
      this.hinweisTimer = null;
      if (document.activeElement !== this.feld && this.feld.value.trim() === '') this.schliessen();
    }, STANDORT_SUCHHINWEIS_MS);
  }

  private hinweisTimerBeenden(): void {
    this.liste.classList.remove('search-results-intro');
    if (this.hinweisTimer === null) return;
    window.clearTimeout(this.hinweisTimer);
    this.hinweisTimer = null;
  }

  /**
   * Die Fundstelle im Namen markieren. Der Text wird vorher entschärft und die
   * Markierung danach eingesetzt — nie umgekehrt, sonst wäre ein Maschinenname
   * ein Einfallstor.
   */
  private hervorheben(text: string, wort: string): string {
    const sicher = escapeHtml(text);
    const stelle = sicher.toLowerCase().indexOf(wort);
    if (stelle < 0) return sicher;
    return (
      sicher.slice(0, stelle) +
      '<mark class="search-mark">' +
      sicher.slice(stelle, stelle + wort.length) +
      '</mark>' +
      sicher.slice(stelle + wort.length)
    );
  }

  private schliessen(): void {
    this.liste.classList.remove('search-results-intro');
    this.liste.hidden = true;
    this.liste.innerHTML = '';
  }
}
