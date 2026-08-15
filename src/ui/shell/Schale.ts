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
 * WAS SCHNITT 2 BAUT — UND WAS NOCH NICHT
 *
 * Die Schale, leer. Grund, Kopfstreifen, Blatt mit den drei Zuständen,
 * Reiterleiste, Beispieldaten-Streifen. Die Abschnitte liegen weiter, wo sie
 * liegen: Der gesamte bisherige Rumpf zieht als Ganzes in den Reiter „Daten".
 * Die drei anderen Reiter sind noch leer und sagen das auch. Sie füllen sich
 * in den Schnitten 4 bis 6.
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

const REITER_LEER: Record<Reiter, string> = {
  get daten() {
    return t('schale.soon.daten');
  },
  get flotte() {
    return t('schale.soon.flotte');
  },
  get karte() {
    return t('schale.soon.karte');
  },
  get filter() {
    return t('schale.soon.filter');
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
}

/** Was umzieht, und wohin. Die Reihenfolge ist die Reihenfolge im Ziel. */
interface Umzug {
  id: string;
  ziel: 'grund' | 'streifen' | 'blatt-daten';
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
];

export class Schale {
  private an_ = false;
  private reiter: Reiter = 'daten';
  private grund: HTMLElement | null = null;
  private streifen: HTMLElement | null = null;
  private blatt: HTMLElement | null = null;
  /** Aufräumer, die `aus()` in umgekehrter Reihenfolge abarbeitet. */
  private aufraeumer: Array<() => void> = [];

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
      } else if (this.tafel('daten')) {
        this.haengeUm(el, this.tafel('daten') as HTMLElement);
      }
    }

    // Der bisherige Rumpf wird zum Inhalt des Reiters „Daten" — als Ganzes,
    // ohne eine Zeile darin anzufassen.
    const tafelDaten = this.tafel('daten');
    if (tafelDaten) this.haengeUm(rumpf, tafelDaten);

    await this.setzeBlattzustand();
    this.zeigeReiter(this.reiter);

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
        this.zeigeReiter(name);
        this.oeffneBlatt(true);
      });
      reiterleiste.appendChild(knopf);
    }
    streifen.appendChild(reiterleiste);

    document.body.appendChild(streifen);
    return streifen;
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

    for (const name of REITER) {
      const tafel = document.createElement('section');
      tafel.id = `schale-tafel-${name}`;
      tafel.className = 'schale-tafel';
      tafel.dataset.reiter = name;
      tafel.setAttribute('role', 'tabpanel');
      if (name !== 'daten') {
        // Ein leerer Reiter, der nichts sagt, wirkt kaputt. Er sagt lieber,
        // dass er noch nichts kann.
        const platzhalter = document.createElement('p');
        platzhalter.className = 'schale-platzhalter';
        platzhalter.textContent = REITER_LEER[name];
        tafel.appendChild(platzhalter);
      }
      blatt.appendChild(tafel);
    }

    document.body.appendChild(blatt);
    return blatt;
  }

  private tafel(name: Reiter): HTMLElement | null {
    return this.blatt?.querySelector<HTMLElement>(`#schale-tafel-${name}`) ?? null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Zustände
  // ══════════════════════════════════════════════════════════════════════

  public zeigeReiter(name: Reiter): void {
    this.reiter = name;
    this.streifen?.querySelectorAll<HTMLElement>('.schale-reiter-btn').forEach((knopf) => {
      const treffer = knopf.dataset.reiter === name;
      knopf.classList.toggle('active', treffer);
      knopf.setAttribute('aria-selected', String(treffer));
    });
    this.blatt?.querySelectorAll<HTMLElement>('.schale-tafel').forEach((tafel) => {
      tafel.classList.toggle('active', tafel.dataset.reiter === name);
    });
  }

  private istOffen(): boolean {
    return this.blatt?.classList.contains('offen') ?? false;
  }

  public oeffneBlatt(offen: boolean): void {
    this.blatt?.classList.toggle('offen', offen);
    document.body.classList.toggle('blatt-offen', offen);
    const griff = document.getElementById('schale-griff');
    griff?.setAttribute('aria-label', t(offen ? 'schale.gripClose' : 'schale.gripLabel'));
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
