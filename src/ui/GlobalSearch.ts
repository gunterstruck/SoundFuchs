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
import { getAllMachines } from '@data/db.js';
import type { Machine } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { escapeHtml } from '@utils/sanitize.js';
import { t } from '../i18n/index.js';

/** Ab so vielen Zeichen wird gesucht. Ein einzelner Buchstabe trifft fast alles. */
const MINDESTLAENGE = 2;

/** Mehr Treffer als das passt kaum auf einen Handybildschirm. */
const MAX_TREFFER = 8;

export class GlobalSearch {
  private readonly feld: HTMLInputElement;
  private readonly liste: HTMLElement;
  private readonly beiAuswahl: (machine: Machine) => void;
  private treffer: Machine[] = [];

  constructor(beiAuswahl: (machine: Machine) => void) {
    this.beiAuswahl = beiAuswahl;
    this.feld = document.getElementById('global-search') as HTMLInputElement;
    this.liste = document.getElementById('search-results') as HTMLElement;
  }

  /** Gibt es die Kopfleiste auf dieser Seite überhaupt? */
  public get istVerfuegbar(): boolean {
    return Boolean(this.feld && this.liste);
  }

  public init(): void {
    if (!this.istVerfuegbar) return;

    this.feld.addEventListener('input', () => void this.suchen());
    this.feld.addEventListener('focus', () => void this.suchen());

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
  }

  private async suchen(): Promise<void> {
    const wort = this.feld.value.trim().toLowerCase();
    if (wort.length < MINDESTLAENGE) {
      this.schliessen();
      return;
    }

    let machines: Machine[] = [];
    try {
      machines = await getAllMachines();
    } catch (error) {
      logger.warn('Suche: Maschinen konnten nicht gelesen werden', error);
      this.schliessen();
      return;
    }

    this.treffer = machines
      .filter((m) =>
        [m.name, m.location ?? '', m.id].some((feld) => feld.toLowerCase().includes(wort))
      )
      // Zuletzt geprüfte zuerst: Wer sucht, meint meist die Maschine, an der
      // er gerade war.
      .sort((a, b) => (b.lastDiagnosisAt ?? 0) - (a.lastDiagnosisAt ?? 0))
      .slice(0, MAX_TREFFER);

    this.zeichnen(wort);
  }

  private zeichnen(wort: string): void {
    this.liste.innerHTML = '';

    if (this.treffer.length === 0) {
      const leer = document.createElement('div');
      leer.className = 'search-empty';
      leer.textContent = t('search.noHits');
      this.liste.appendChild(leer);
      this.liste.hidden = false;
      return;
    }

    for (const machine of this.treffer) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'search-hit';
      knopf.setAttribute('role', 'option');

      const name = document.createElement('span');
      name.className = 'search-hit-name';
      name.innerHTML = this.hervorheben(machine.name, wort);

      const meta = document.createElement('span');
      meta.className = 'search-hit-meta';
      meta.textContent = machine.location || machine.id;

      knopf.append(name, meta);
      knopf.addEventListener('click', () => {
        this.schliessen();
        this.feld.value = '';
        this.beiAuswahl(machine);
      });
      this.liste.appendChild(knopf);
    }

    this.liste.hidden = false;
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
    this.liste.hidden = true;
    this.liste.innerHTML = '';
  }
}
