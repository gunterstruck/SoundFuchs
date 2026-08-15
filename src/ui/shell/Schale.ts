/**
 * DIE SCHALE — Schnitt 2 aus `docs/nutzerreise-wie-tourfuchs.md`
 *
 * TourFuchs und SoundFuchs sind heute gegensätzlich aufgebaut: Dort liegt die
 * Deutschlandkarte als Grund, immer im Bild, und darüber ein Blatt von unten,
 * dessen Inhalt man über Reiter wechselt. Hier scrollt eine lange Seite, und
 * die Karte ist ein Fenster, das man öffnet. Die Grundschichten sind
 * vertauscht; alles Weitere folgt daraus (§2 des Papiers).
 *
 * Diese Datei dreht die Schichten um — und zwar so, wie TourFuchs es selbst
 * tut: `syncTopnavPlacement()` in `src/ui/sidebar.js` **hängt** die
 * Ansichtstiefe und die Reiterleiste zwischen Blatt und Kopfstreifen um,
 * statt sie zweimal zu bauen. „Die Elemente behalten ihre IDs/Klassen, daher
 * greifen alle bestehenden Event-Handler unverändert", steht dort im
 * Kommentar, und genau das ist hier die Bedingung: In `1-Identify.ts`,
 * `2-Reference.ts` und `3-Diagnose.ts` darf keine Zeile stehen bleiben, die
 * von der Schale weiß. Muss dort etwas geändert werden, ist der Umzug an
 * dieser Stelle noch nicht richtig zugeschnitten.
 *
 * WAS HIER STEHT
 *
 * Schnitt 2 baute die Schale: Grund, Kopfstreifen, Blatt mit den drei
 * Zuständen, Reiterleiste, Beispieldaten-Streifen. Der gesamte bisherige
 * Rumpf zog als Ganzes in den Reiter „Daten".
 *
 * Schnitt 3 hängte die Kette ein, die von der Karte in die Prüfung führt.
 *
 * Schnitt 4 trennte, was nicht zusammengehörte: Die beiden Karten des
 * Prüfablaufs lagen mitten in den Daten, obwohl sie zu EINER Maschine
 * gehören. Sie liegen jetzt in einer eigenen Tafel ohne Reiter — der
 * Zoomstufe. Dazu kamen die Erste-Schritte-Liste und die Standort-Zeile.
 *
 * Schnitt 5 füllte den Reiter „Flotte" mit den beiden Wegen aus §0e. Der
 * Bestand pendelt dafür zwischen „Daten" und „Flotte" — eine Liste, nicht
 * zwei.
 *
 * Schnitt 6 füllte „Karte" (die Nahliste zur Kartenmitte) und „Filter"
 * (Zustand · Standort · Flottengruppe). Damit trägt jeder Reiter Inhalt; die
 * Platzhalterzeile, die sagte „kommt noch", wird nicht mehr gebraucht.
 *
 * DER RÜCKWEG IST EIN SCHALTER
 *
 * Jedes umgehängte Element hinterlässt an seinem alten Platz ein `<template>`
 * als Merkzeichen. `aus()` setzt es genau dorthin zurück. Deshalb ist der Weg
 * zurück keine zweite Wahrheit, die mit der ersten auseinanderlaufen kann,
 * sondern dieselbe Bewegung rückwärts.
 */

import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import {
  MASCHINE_GEWAEHLT,
  MASCHINE_LOSGELASSEN,
  type MaschineGewaehltDetail,
} from './ereignisse.js';
import { Nahliste } from './Nahliste.js';
import { Filterleiste } from './Filterleiste.js';

/** Die vier Reiter. „Prüfen" fehlt mit Absicht — siehe §0c des Papiers. */
export const REITER = ['daten', 'flotte', 'karte', 'filter'] as const;
export type Reiter = (typeof REITER)[number];

/**
 * Die Schlüssel stehen ausgeschrieben, nicht als `t(\`schale.tab.${name}\`)`.
 *
 * `tools/i18n-check.mjs` sammelt die Verwendung mit einem Textmuster über
 * `t('…')` ein; ein zusammengesetzter Schlüssel taucht darin nicht auf und
 * wäre damit der einzige in der App, den niemand bewacht. Und t() gibt bei
 * einem Tippfehler den Schlüssel selbst zurück — in der Reiterleiste stünde
 * dann wörtlich „schale.tab.flotte".
 */
const REITER_NAME: Record<Reiter, string> = {
  get daten() {
    return t('schale.tab.daten');
  },
  get flotte() {
    return t('schale.tab.flotte');
  },
  get karte() {
    return t('schale.tab.karte');
  },
  get filter() {
    return t('schale.tab.filter');
  },
};

/** Was die Schale von außen braucht. */
export interface SchaleDeps {
  /**
   * Die Karte am neuen Platz aufbauen und zeichnen. Ohne Behälter-Argument:
   * `CustomerMap` findet `#customer-map` über die ID, und die ändert sich
   * beim Umhängen nicht — genau das ist der Punkt des Umhängens.
   */
  karteInDenGrund: () => Promise<void>;
  /** Stehen schon Maschinen im Bestand? Entscheidet über den Blattzustand. */
  hatBestand: () => Promise<boolean>;
  /** Wie weit ist der rote Faden — Maschine, Normalzustand, Prüfung? */
  ersteSchritte: () => Promise<Fortschritt>;
  /** Die Einstellungen auf ein Thema stellen (Standorte: Beispiele & Import). */
  oeffneThema: (thema: string, beschriftung: string) => void;
  /** Die Maschinenliste nach Flotten gruppieren — oder wieder als Reihe. */
  setzeFlottenmodus: (anzeigen: boolean) => Promise<void>;
  /** Wohin schaut die Karte? Die Nahliste rechnet von hier aus. */
  kartenmitte: () => { lat: number; lng: number } | null;
  /** Zu einem Standort fliegen und sein Blatt öffnen. */
  zeigeStandort: (id: string) => void;
}

/** Die drei Schritte des ersten Laufs, jeder für sich getan oder offen. */
export interface Fortschritt {
  maschine: boolean;
  referenz: boolean;
  pruefung: boolean;
}

/**
 * Die Prüf-Zoomstufe. **Kein Reiter** — sie hat bewusst keinen Knopf in der
 * Leiste, denn das Prüfen steht nicht neben den Daten, es liegt hinter einer
 * bestimmten Maschine (§0c des Papiers). Man kommt hinein, indem man eine
 * Maschine wählt, und wieder heraus über die Zoomleiste.
 */
const PRUEFEN = 'pruefen';

/** Alle Tafeln im Blatt: die vier Reiter und die Zoomstufe dahinter. */
const TAFELN = [...REITER, PRUEFEN] as const;
type Tafelname = (typeof TAFELN)[number];

/** Was umzieht, und wohin. Die Reihenfolge ist die Reihenfolge im Ziel. */
interface Umzug {
  id: string;
  ziel: 'grund' | 'streifen' | 'pruefen' | 'flotte';
}

const UMZUEGE: Umzug[] = [
  // Der Grund: die Karte, ihre Grundwahl und das Standortblatt. Sie stehen
  // heute im Fenster `#customer-map-modal`; im Grund brauchen sie es nicht
  // mehr, und CustomerMap findet sie unverändert über ihre IDs.
  { id: 'map-basemap-row', ziel: 'grund' },
  { id: 'customer-map', ziel: 'grund' },
  { id: 'map-unlocated', ziel: 'grund' },
  { id: 'customer-sheet', ziel: 'grund' },
  // Der Kopfstreifen: die Ansichtstiefe. Wie bei TourFuchs hängt sie oben,
  // nicht im Blatt — sie ist eine Eigenschaft der ganzen App, nicht eines
  // Reiters.
  { id: 'depth-switch', ziel: 'streifen' },
  // Die Prüf-Zoomstufe: die beiden Karten des Ablaufs. Sie lagen im Rumpf
  // zwischen Bestand und Fußzeile — also mitten in den Daten, obwohl sie zu
  // einer einzelnen Maschine gehören und ohne sie gar nichts tun können.
  // Beides zog man vorher aneinander vorbei, jedes Mal.
  { id: 'card-record', ziel: 'pruefen' },
  { id: 'card-check', ziel: 'pruefen' },
  // Der Reiter „Flotte": die zweite der beiden Funktionen aus §0e — mehrere
  // unbekannte Maschinen vergleichen, ohne sie anzulegen. Sie hieß
  // „Schnellvergleich" und stand als Knopf über der Maschinenliste, also an
  // der Stelle, an der man gerade NICHT unbekannte Maschinen vergleicht.
  { id: 'quick-compare-cta', ziel: 'flotte' },
];

export class Schale {
  private an_ = false;
  private reiter: Reiter = 'daten';
  private grund: HTMLElement | null = null;
  private streifen: HTMLElement | null = null;
  private blatt: HTMLElement | null = null;
  /** Aufräumer, die `aus()` in umgekehrter Reihenfolge abarbeitet. */
  private aufraeumer: Array<() => void> = [];
  private nahliste: Nahliste | null = null;
  private filterleiste: Filterleiste | null = null;

  constructor(private readonly deps: SchaleDeps) {}

  public get läuft(): boolean {
    return this.an_;
  }

  // ══════════════════════════════════════════════════════════════════════
  // AN
  // ══════════════════════════════════════════════════════════════════════

  public async an(): Promise<void> {
    if (this.an_) return;
    const rumpf = document.querySelector<HTMLElement>('.container');
    const kopf = document.querySelector<HTMLElement>('.topbar');
    if (!rumpf || !kopf) {
      logger.warn('Schale: Rumpf oder Kopfleiste fehlen — die neue Schale bleibt aus');
      return;
    }

    document.documentElement.dataset.schale = 'neu';
    this.an_ = true;

    this.grund = this.baueGrund(rumpf);
    this.streifen = this.baueStreifen();
    this.blatt = this.baueBlatt();

    // Die Kopfleiste verlässt den Rumpf: Sie steht künftig über allem, nicht
    // im Blatt, das sich bewegt. Sonst führe die Suche mit dem Blatt nach
    // unten aus dem Bild.
    this.haengeUm(kopf, document.body, this.grund);

    // Der bisherige Rumpf wird zum Inhalt des Reiters „Daten" — als Ganzes,
    // ohne eine Zeile darin anzufassen. Er zieht VOR den Einzelstücken um:
    // Was gleich aus ihm heraus in die Prüf-Zoomstufe wandert, soll seinen
    // Rückweg an dem Platz finden, an dem es dann wirklich steht.
    const tafelDaten = this.tafel('daten');
    if (tafelDaten) this.haengeUm(rumpf, tafelDaten);

    for (const umzug of UMZUEGE) {
      const el = document.getElementById(umzug.id);
      if (!el) {
        logger.warn(`Schale: „${umzug.id}" fehlt im Markup — der Platz bleibt leer`);
        continue;
      }
      if (umzug.ziel === 'grund') {
        if (this.grund) this.haengeUm(el, this.grund);
      } else if (umzug.ziel === 'streifen') {
        // Reihenfolge im Streifen wie bei TourFuchs: erst Basis/Profi, dann
        // die Reiter. Die Tiefe gilt für die ganze App, der Reiter nur für
        // das Blatt darunter — das Allgemeinere steht oben.
        if (this.streifen) this.haengeUm(el, this.streifen, this.streifen.firstElementChild);
      } else {
        const ziel = this.tafel(umzug.ziel === 'flotte' ? 'flotte' : PRUEFEN);
        if (ziel) this.haengeUm(el, ziel);
      }
    }

    // Das Zuhause des Bestands festhalten, bevor er zwischen den Reitern
    // pendelt. Ein Merkzeichen an seiner Stelle in den Daten — dasselbe
    // Mittel wie beim Rückweg der Schale, nur dass dieses bleibt.
    const bestand = document.getElementById('machine-overview-section');
    if (bestand) {
      const heimat = document.createElement('template');
      heimat.dataset.schaleHeimat = 'bestand';
      bestand.parentElement?.insertBefore(heimat, bestand);
      this.aufraeumer.push(() => heimat.remove());
    }

    this.baueDatenkopf();
    this.baueFlottenkopf();
    this.baueKarteUndFilter();
    await this.setzeBlattzustand();
    this.zeigeTafel('daten');
    this.hoereAufMaschinenwahl();

    // Die Karte zuletzt: Leaflet misst beim Anlegen die Größe des Behälters,
    // und der muss dafür schon an seinem endgültigen Platz stehen.
    if (document.getElementById('customer-map')) await this.deps.karteInDenGrund();
  }

  // ══════════════════════════════════════════════════════════════════════
  // AUS
  // ══════════════════════════════════════════════════════════════════════

  public aus(): void {
    if (!this.an_) return;
    // Rückwärts: Die zuletzt gesetzten Merkzeichen liegen am tiefsten.
    for (const zurueck of this.aufraeumer.reverse()) zurueck();
    this.aufraeumer = [];

    this.grund?.remove();
    this.streifen?.remove();
    this.blatt?.remove();
    this.grund = this.streifen = this.blatt = null;

    delete document.documentElement.dataset.schale;
    document.body.classList.remove('blatt-offen', 'blatt-zieht');
    this.an_ = false;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Bauteile
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Der Grund. Bei TourFuchs ist das `<main id="map">` — ein Element, das nie
   * verschwindet und über das sich alles andere legt.
   */
  private baueGrund(vor: HTMLElement): HTMLElement {
    const grund = document.createElement('main');
    grund.id = 'karten-grund';
    grund.className = 'karten-grund';
    grund.setAttribute('role', 'application');
    grund.setAttribute('aria-label', t('map.title'));
    vor.parentElement?.insertBefore(grund, vor);
    return grund;
  }

  /**
   * Der Kopfstreifen. Er trägt die Ansichtstiefe und die Reiter, und er ist
   * durchlässig: Die Lücken zwischen den Pillen lassen die Karte darunter
   * durch, genau wie bei TourFuchs (`pointer-events: none` auf dem Streifen,
   * `auto` auf den Pillen).
   */
  private baueStreifen(): HTMLElement {
    const streifen = document.createElement('div');
    streifen.id = 'schale-streifen';
    streifen.className = 'schale-streifen';
    streifen.setAttribute('role', 'navigation');
    streifen.setAttribute('aria-label', t('schale.navLabel'));

    const reiterleiste = document.createElement('nav');
    reiterleiste.className = 'schale-reiter';
    reiterleiste.setAttribute('role', 'tablist');
    for (const name of REITER) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'schale-reiter-btn';
      knopf.dataset.reiter = name;
      knopf.setAttribute('role', 'tab');
      knopf.setAttribute('aria-selected', String(name === this.reiter));
      knopf.textContent = REITER_NAME[name];
      knopf.addEventListener('click', () => {
        this.zeigeTafel(name);
        this.oeffneBlatt(true);
      });
      reiterleiste.appendChild(knopf);
    }
    streifen.appendChild(reiterleiste);
    streifen.appendChild(this.baueZoomleiste());

    document.body.appendChild(streifen);
    return streifen;
  }

  /**
   * Die Zoomleiste — sie tritt an die Stelle der Reiter, solange man in einer
   * Maschine steckt.
   *
   * Warum keine fünfte Pille „Prüfen": Sie stünde dann neben Daten, Flotte,
   * Karte und Filter, als wäre sie ein gleichrangiger Ort. Ist sie nicht. Das
   * Prüfen gehört zu **einer** Maschine und existiert ohne sie gar nicht
   * (§0c). Eine Leiste, die den Namen dieser Maschine trägt und zurückführt,
   * sagt genau das: Du bist eine Ebene tiefer, und hier ist der Weg heraus.
   * Dieselbe Rolle wie TourFuchs' Briefing-Dialog, nur ohne zweites Fenster.
   */
  private baueZoomleiste(): HTMLElement {
    const leiste = document.createElement('div');
    leiste.id = 'schale-zoom';
    leiste.className = 'schale-zoom';
    leiste.hidden = true;

    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'schale-zoom-zurueck';
    zurueck.textContent = t('schale.zoomBack');
    zurueck.addEventListener('click', () => this.verlasseMaschine());

    const name = document.createElement('span');
    name.id = 'schale-zoom-name';
    name.className = 'schale-zoom-name';

    leiste.append(zurueck, name);
    return leiste;
  }

  /**
   * Das Blatt. Drei Zustände, alle von TourFuchs (§0b des Papiers):
   * leerer Bestand → rund halbhoch, Daten da und in Ruhe → Peek,
   * beim Arbeiten → aufgezogen.
   */
  private baueBlatt(): HTMLElement {
    const blatt = document.createElement('aside');
    blatt.id = 'schale-blatt';
    blatt.className = 'schale-blatt';

    const griff = document.createElement('button');
    griff.type = 'button';
    griff.id = 'schale-griff';
    griff.className = 'schale-griff';
    griff.setAttribute('aria-label', t('schale.gripLabel'));
    griff.appendChild(document.createElement('span'));
    griff.addEventListener('click', () => this.oeffneBlatt(!this.istOffen()));
    blatt.appendChild(griff);
    this.verdrahteZiehen(griff);

    // Der Beispieldaten-Streifen. Bei TourFuchs steht er ständig und ruhig im
    // Blatt, solange Demo-Daten laufen — und schiebt dort sogar den Peek
    // höher, damit er nicht hinter der System-Leiste verschwindet. Hier ist
    // er in Schnitt 2 vorgesehen und leer; gefüllt wird er in Schnitt 4, wo
    // die Beispieldaten hingehören.
    const streifen = document.createElement('div');
    streifen.id = 'schale-beispielstreifen';
    streifen.className = 'schale-beispielstreifen';
    streifen.setAttribute('role', 'note');
    streifen.hidden = true;
    blatt.appendChild(streifen);

    for (const name of TAFELN) {
      const tafel = document.createElement('section');
      tafel.id = `schale-tafel-${name}`;
      tafel.className = 'schale-tafel';
      tafel.dataset.reiter = name;
      tafel.setAttribute('role', name === PRUEFEN ? 'region' : 'tabpanel');
      blatt.appendChild(tafel);
    }

    document.body.appendChild(blatt);
    return blatt;
  }

  private tafel(name: Tafelname): HTMLElement | null {
    return this.blatt?.querySelector<HTMLElement>(`#schale-tafel-${name}`) ?? null;
  }

  /**
   * Der Reiter „Flotte" — die beiden Wege aus §0e, jeder mit einem Satz.
   *
   * Beide gab es schon, beide an prominenter falscher Stelle: Der
   * „Flottencheck" war ein Umschalter MITTEN in der Maschinenliste, und der
   * „Schnellvergleich" ein Knopf darüber — also genau dort, wo man gerade
   * nicht unbekannte Maschinen vergleicht. Die Flotte ist kein zweiter
   * gleichrangiger Modus neben dem Prüfen (das war die Korrektur in §0e),
   * sondern eine Funktion, die man aufsucht. Hier ist sie.
   *
   * Der Umschalter selbst entfällt: Der Reiter IST die Umschaltung. Zwei
   * Bedienelemente für denselben Zustand wären eines zu viel — und das
   * verbliebene stünde wieder mitten in einer Liste.
   */
  private baueFlottenkopf(): void {
    const tafel = this.tafel('flotte');
    if (!tafel) return;

    const kopf = document.createElement('div');
    kopf.className = 'schale-flottenkopf';

    const ausBestand = document.createElement('p');
    ausBestand.className = 'schale-flotten-satz';
    ausBestand.textContent = t('schale.fleet.fromStock');
    kopf.appendChild(ausBestand);

    tafel.insertBefore(kopf, tafel.firstChild);

    // Der Satz zum Schnellvergleich steht über dessen Knopf, nicht über der
    // Liste: Er erklärt genau ihn.
    const ohneBestand = document.createElement('p');
    ohneBestand.className = 'schale-flotten-satz schale-flotten-satz-unten';
    ohneBestand.textContent = t('schale.fleet.withoutStock');
    const knopf = tafel.querySelector('#quick-compare-cta');
    if (knopf) tafel.insertBefore(ohneBestand, knopf);
    else tafel.appendChild(ohneBestand);
  }

  /**
   * Die letzten beiden Reiter (Schnitt 6).
   *
   * „Karte" trägt nicht noch eine Karte — die liegt als Grund darunter und
   * verschwindet nie. Der Reiter trägt die Liste zu ihr, wie bei TourFuchs
   * (`#tab-karte` mit „In der Nähe"). „Filter" verkleinert, was auf dem Grund
   * liegt; alles Weitere arbeitet dann auf der kleineren Menge.
   */
  private baueKarteUndFilter(): void {
    const karte = this.tafel('karte');
    if (karte) {
      this.nahliste = new Nahliste({
        kartenmitte: () => this.deps.kartenmitte(),
        zeigeStandort: (id) => {
          this.deps.zeigeStandort(id);
          // Das Blatt gibt den Grund frei: Wer auf eine Zeile tippt, will den
          // Standort auf der Karte sehen, nicht die Zeile, die er getippt hat.
          this.oeffneBlatt(false);
        },
      });
      this.nahliste.baue(karte);
      this.aufraeumer.push(() => {
        this.nahliste?.abbauen();
        this.nahliste = null;
      });
    }

    const filter = this.tafel('filter');
    if (filter) {
      this.filterleiste = new Filterleiste();
      this.filterleiste.baue(filter);
      this.aufraeumer.push(() => {
        this.filterleiste?.abbauen();
        this.filterleiste = null;
      });
    }
  }

  /**
   * Den Bestand in den Reiter „Flotte" holen — oder ihn zurückgeben.
   *
   * Es ist dieselbe Liste, nicht eine zweite. Eine zweite wäre eine zweite
   * Wahrheit: Wer in der einen eine Maschine anlegt und in der anderen
   * nachsieht, hätte zwei Bestände, die auseinanderlaufen können. Die Liste
   * zieht deshalb um und wechselt dabei ihre Gruppierung — dieselbe Bewegung
   * wie überall sonst in dieser Schale.
   */
  private async verschiebeBestand(nachFlotte: boolean): Promise<void> {
    const bestand = document.getElementById('machine-overview-section');
    const marke = this.blatt?.querySelector<HTMLElement>('template[data-schale-heimat="bestand"]');
    const flotte = this.tafel('flotte');
    if (!bestand || !marke || !flotte) return;

    const istInFlotte = bestand.parentElement === flotte;
    if (istInFlotte === nachFlotte) return;

    if (nachFlotte) {
      // Unter den Satz, der ihn erklärt — und VOR den zweiten Weg. Angehängt
      // stünde die Liste hinter dem Schnellvergleich, also unter der
      // Überschrift des jeweils anderen Falls.
      const zweiterWeg = flotte.querySelector('.schale-flotten-satz-unten');
      if (zweiterWeg) flotte.insertBefore(bestand, zweiterWeg);
      else flotte.appendChild(bestand);
    } else {
      marke.parentElement?.insertBefore(bestand, marke);
    }

    try {
      await this.deps.setzeFlottenmodus(nachFlotte);
    } catch (fehler) {
      logger.warn('Schale: der Flottenmodus ließ sich nicht stellen', fehler);
    }
  }

  /**
   * Der Kopf des Reiters „Daten": Erste-Schritte-Liste und die Zeile zu den
   * Standorten.
   *
   * Beides stand vorher nicht in den Daten. Die Anleitung 1-2-3 lag im
   * Leerzustand der Maschinenliste — sie verschwand also genau in dem Moment,
   * in dem man die erste Maschine angelegt hatte und die restlichen zwei
   * Schritte noch vor sich hatte. Und die Standorte lagen ausschließlich in
   * den Einstellungen, obwohl sie Daten sind wie die Maschinen auch.
   *
   * TourFuchs führt für das Erste eine eigene Liste (`#first-steps`,
   * „sichtbarer roter Faden nach dem ersten Import"). Genau das ist es hier
   * auch: Sie bleibt, bis alle drei Schritte getan sind, und verschwindet
   * dann von selbst.
   */
  private baueDatenkopf(): void {
    const tafel = this.tafel('daten');
    if (!tafel) return;

    const kopf = document.createElement('div');
    kopf.className = 'schale-datenkopf';

    const liste = document.createElement('div');
    liste.id = 'erste-schritte';
    liste.className = 'erste-schritte';
    liste.hidden = true;
    kopf.appendChild(liste);

    // Die Standorte: eine Zeile, kein zweiter Bestand. Was dahinter liegt —
    // Beispieldaten und Import — steht schon in den Einstellungen unter
    // „standorte" und wird von hier aus nur aufgeschlagen. Zwei Orte für
    // dieselbe Sache wären ein Ort zu viel.
    const standorte = document.createElement('button');
    standorte.type = 'button';
    standorte.id = 'schale-standorte-zeile';
    standorte.className = 'schale-datenzeile';
    standorte.innerHTML =
      `<span class="schale-datenzeile-symbol" aria-hidden="true">🧾</span>` +
      `<span class="schale-datenzeile-text"></span>` +
      `<span class="schale-datenzeile-pfeil" aria-hidden="true">›</span>`;
    const beschriftung = t('sheet.customerData');
    const textFeld = standorte.querySelector('.schale-datenzeile-text');
    if (textFeld) textFeld.textContent = beschriftung;
    standorte.addEventListener('click', () => this.deps.oeffneThema('standorte', beschriftung));
    kopf.appendChild(standorte);

    tafel.insertBefore(kopf, tafel.firstChild);
    void this.frischeErsteSchritte();
  }

  /**
   * Die Liste neu zeichnen. Sie zeigt Zustand, keine Knöpfe: Wo etwas zu tun
   * ist, steht der Weg dorthin ohnehin unmittelbar darunter im Bestand — eine
   * zweite Tür daneben wäre nur eine zweite Tür.
   */
  private async frischeErsteSchritte(): Promise<void> {
    const liste = document.getElementById('erste-schritte');
    if (!liste) return;

    let stand: Fortschritt = { maschine: false, referenz: false, pruefung: false };
    try {
      stand = await this.deps.ersteSchritte();
    } catch (fehler) {
      logger.warn('Schale: der Fortschritt ließ sich nicht lesen', fehler);
    }

    const schritte: Array<[boolean, string, string]> = [
      [stand.maschine, t('identify.emptyGuide.step1Title'), t('identify.emptyGuide.step1Desc')],
      [stand.referenz, t('identify.emptyGuide.step2Title'), t('identify.emptyGuide.step2Desc')],
      [stand.pruefung, t('identify.emptyGuide.step3Title'), t('identify.emptyGuide.step3Desc')],
    ];

    // Alles getan: Die Liste hat ihre Aufgabe erfüllt und geht. Stehenbleiben
    // hieße, jemandem dauerhaft zu erklären, was er längst kann.
    if (schritte.every(([getan]) => getan)) {
      liste.hidden = true;
      liste.textContent = '';
      return;
    }

    liste.textContent = '';
    const titel = document.createElement('p');
    titel.className = 'erste-schritte-titel';
    titel.textContent = t('identify.emptyGuide.title');
    liste.appendChild(titel);

    schritte.forEach(([getan, name, erklaerung], i) => {
      const zeile = document.createElement('div');
      zeile.className = 'erste-schritte-zeile';
      zeile.classList.toggle('getan', getan);

      const marke = document.createElement('span');
      marke.className = 'erste-schritte-marke';
      marke.textContent = getan ? '✓' : String(i + 1);
      marke.setAttribute('aria-label', t(getan ? 'schale.stepDone' : 'schale.stepOpen'));

      const text = document.createElement('div');
      text.className = 'erste-schritte-text';
      const stark = document.createElement('strong');
      stark.textContent = name;
      const klein = document.createElement('span');
      klein.textContent = erklaerung;
      text.append(stark, klein);

      zeile.append(marke, text);
      liste.appendChild(zeile);
    });
    liste.hidden = false;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zustände
  // ══════════════════════════════════════════════════════════════════════

  public zeigeTafel(name: Tafelname): void {
    if (name !== PRUEFEN) this.reiter = name;
    const tiefer = name === PRUEFEN;

    this.streifen?.querySelectorAll<HTMLElement>('.schale-reiter-btn').forEach((knopf) => {
      const treffer = !tiefer && knopf.dataset.reiter === name;
      knopf.classList.toggle('active', treffer);
      knopf.setAttribute('aria-selected', String(treffer));
    });
    this.blatt?.querySelectorAll<HTMLElement>('.schale-tafel').forEach((tafel) => {
      tafel.classList.toggle('active', tafel.dataset.reiter === name);
    });

    // In der Tiefe tritt die Zoomleiste an die Stelle der Reiter. Beides
    // nebeneinander stehen zu lassen wäre die Frage „bin ich in den Daten oder
    // in einer Maschine?" — und die soll man nicht stellen müssen.
    const reiterleiste = this.streifen?.querySelector<HTMLElement>('.schale-reiter');
    const zoomleiste = this.streifen?.querySelector<HTMLElement>('.schale-zoom');
    if (reiterleiste) reiterleiste.hidden = tiefer;
    if (zoomleiste) zoomleiste.hidden = !tiefer;
    this.blatt?.classList.toggle('in-der-tiefe', tiefer);

    // Bei jeder Rückkehr in die Daten nachsehen, wie weit der rote Faden ist.
    // Genau dazwischen ist ja etwas passiert.
    if (name === 'daten') void this.frischeErsteSchritte();

    // Der Bestand folgt dem Reiter: In „Flotte" steht er nach Flotten
    // gruppiert, überall sonst wieder als Reihe in den Daten. Die Prüf-
    // Zoomstufe zählt dabei als „nicht Flotte" — sie gehört einer einzelnen
    // Maschine, und der Bestand soll hinter ihr an seinem Platz stehen.
    void this.verschiebeBestand(name === 'flotte');

    // Nahliste und Filter erst zeichnen, wenn man sie ansieht. Beide lesen
    // den ganzen Bestand; das bei jedem Reiterwechsel zu tun wäre Arbeit für
    // eine Ansicht, die niemand offen hat. TourFuchs macht es ebenso
    // („Nur berechnen/zeichnen, wenn der Karte-Tab aktiv ist").
    if (name === 'karte') void this.nahliste?.zeichne();
    if (name === 'filter') void this.filterleiste?.zeichne();
  }

  /**
   * Zurück aus einer Maschine in die Daten.
   *
   * Die Karten des Ablaufs bleiben stehen, wie sie sind — sie gehören dieser
   * Maschine, und wer sie gleich wieder aufsucht, findet seinen Stand vor. Die
   * Schale räumt hier nichts auf, was ihr nicht gehört.
   */
  public verlasseMaschine(): void {
    this.zeigeTafel('daten');
    document.dispatchEvent(new CustomEvent(MASCHINE_LOSGELASSEN));
  }

  private istOffen(): boolean {
    return this.blatt?.classList.contains('offen') ?? false;
  }

  public oeffneBlatt(offen: boolean): void {
    this.blatt?.classList.toggle('offen', offen);
    document.body.classList.toggle('blatt-offen', offen);
    const griff = document.getElementById('schale-griff');
    griff?.setAttribute('aria-label', t(offen ? 'schale.gripClose' : 'schale.gripLabel'));
    // Erst nach der Überblendung messen, sonst steht die alte Höhe drin.
    window.setTimeout(() => this.meldeBlattmass(), 280);
    this.meldeBlattmass();
  }

  /**
   * Veröffentlichen, wie viel vom unteren Bildrand das Blatt verdeckt.
   *
   * Alles, was über der Karte schwebt — die Grundwahl, das Standortblatt —,
   * muss oberhalb davon bleiben. Eine feste Zahl im CSS wäre nur so lange
   * richtig, bis das Blatt seinen Zustand wechselt: 46 px im Peek, halbhoch
   * im Einstieg, weit mehr aufgezogen. Gemessen wird deshalb, was dasteht.
   * TourFuchs veröffentlicht aus demselben Grund `--mobile-topnav-bottom`.
   */
  private meldeBlattmass(): void {
    if (!this.blatt) return;
    const r = this.blatt.getBoundingClientRect();
    const verdeckt = Math.max(0, Math.round(window.innerHeight - r.top));
    document.documentElement.style.setProperty('--blatt-verdeckt', `${verdeckt}px`);
  }

  /**
   * Der leere Bestand bekommt das halbhohe Blatt, nicht den Peek. Sonst
   * stünde beim ersten Start eine fremde Karte im Bild und darunter ein
   * Streifen von 46 px — und nichts sagte, was man tun soll. TourFuchs löst
   * das mit `.sidebar.onboarding { height: min(52dvh, 480px) }`.
   */
  private async setzeBlattzustand(): Promise<void> {
    let bestand = false;
    try {
      bestand = await this.deps.hatBestand();
    } catch (fehler) {
      logger.warn('Schale: der Bestand ließ sich nicht lesen', fehler);
    }
    this.blatt?.classList.toggle('einstieg', !bestand);
    this.oeffneBlatt(!bestand);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Die Kette von der Karte in die Prüfung
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Marker → Standortblatt → Maschinenzeile → Maschinenblatt → **Prüfung**.
   *
   * Das letzte Glied riss, als das Blatt dazukam. Der Ablauf klappt den
   * nächsten Abschnitt auf und springt ihn an — nur liegt der jetzt in einer
   * Tafel, die eingeklappt `display: none` trägt. Getippt, nichts passiert,
   * die Karte steht unverändert da: der klassische stille Bruch, denn kein
   * Fehler wird gemeldet und jede einzelne Stelle arbeitet korrekt.
   *
   * Die Schale zieht deshalb auf, bevor der Ablauf springt. Sie tut es
   * synchron: Der Ablauf springt im nächsten Einzelbild, und dann muss die
   * Tafel schon sichtbar sein.
   */
  private hoereAufMaschinenwahl(): void {
    const zuhoerer = (e: Event) => {
      if (!this.an_) return;
      const detail = (e as CustomEvent<MaschineGewaehltDetail>).detail;
      const abschnitt = detail?.abschnitt;

      // Eine Ebene tiefer: Die Prüfung gehört dieser Maschine, und die
      // Zoomleiste trägt ihren Namen. Erst seit Schnitt 4 ist das eine eigene
      // Tafel — vorher lagen die beiden Karten des Ablaufs mitten in den
      // Daten, zwischen Bestand und Fußzeile, und man zog jedes Mal an ihnen
      // vorbei, auch wenn man gar keine Maschine gewählt hatte.
      const name = document.getElementById('schale-zoom-name');
      if (name) name.textContent = detail?.name ?? '';
      this.zeigeTafel(PRUEFEN);
      this.oeffneBlatt(true);
      if (!abschnitt) return;
      // Nach der Überblendung noch einmal nachfassen: Der Sprung des Ablaufs
      // fällt in ein Blatt, das sich gerade noch bewegt, und landet dann zu
      // kurz. Ein zweiter, sanfter Anlauf kostet nichts und trifft.
      window.setTimeout(() => {
        document.getElementById(abschnitt)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 320);
    };
    document.addEventListener(MASCHINE_GEWAEHLT, zuhoerer);
    this.aufraeumer.push(() => document.removeEventListener(MASCHINE_GEWAEHLT, zuhoerer));
  }

  // ══════════════════════════════════════════════════════════════════════
  // Ziehen
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Der Griff folgt dem Finger. Über der Hälfte des Weges entscheidet die
   * Richtung, darunter der Ort — dieselbe Regel wie in jedem Blatt, das man
   * kennt, und der Grund, warum ein kurzer Zupfer nach oben auch dann öffnet,
   * wenn der Finger kaum unterwegs war.
   */
  private verdrahteZiehen(griff: HTMLElement): void {
    let start = 0;
    let zuletzt = 0;
    let zieht = false;

    const runter = (e: PointerEvent) => {
      start = zuletzt = e.clientY;
      zieht = true;
      griff.setPointerCapture(e.pointerId);
      document.body.classList.add('blatt-zieht');
    };
    const bewegt = (e: PointerEvent) => {
      if (!zieht) return;
      zuletzt = e.clientY;
    };
    const hoch = (e: PointerEvent) => {
      if (!zieht) return;
      zieht = false;
      griff.releasePointerCapture(e.pointerId);
      document.body.classList.remove('blatt-zieht');
      const weg = start - zuletzt;
      // Unter 24 px war es kein Ziehen, sondern ein Tipp — den behandelt der
      // Klick-Zuhörer, sonst schaltete das Blatt zweimal.
      if (Math.abs(weg) < 24) return;
      this.oeffneBlatt(weg > 0);
    };

    griff.addEventListener('pointerdown', runter);
    griff.addEventListener('pointermove', bewegt);
    griff.addEventListener('pointerup', hoch);
    griff.addEventListener('pointercancel', hoch);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Umhängen
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Ein Element umhängen und den Weg zurück merken.
   *
   * Das Merkzeichen ist ein `<template>`: Es steht im Baum, hat aber weder
   * Größe noch Darstellung, und niemand stolpert im CSS darüber.
   */
  private haengeUm(el: HTMLElement, ziel: HTMLElement, vor?: Element | null): void {
    const merkzeichen = document.createElement('template');
    merkzeichen.dataset.schalePlatz = el.id || el.className;
    el.parentElement?.insertBefore(merkzeichen, el);
    if (vor && vor.parentElement === ziel) ziel.insertBefore(el, vor);
    else ziel.appendChild(el);

    this.aufraeumer.push(() => {
      merkzeichen.parentElement?.insertBefore(el, merkzeichen);
      merkzeichen.remove();
    });
  }
}
