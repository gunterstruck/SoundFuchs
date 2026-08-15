/**
 * „IN DER NÄHE" — der Inhalt des Reiters „Karte"
 *
 * Die Karte ist der Grund und liegt immer da; der Reiter darüber trägt nicht
 * noch eine Karte, sondern die Liste zu ihr. Genauso hält es TourFuchs
 * (`src/ui/nearby.js`): „Füllt die Freifläche des aufgezogenen Blatts mit den
 * nächstgelegenen Kunden — bezogen auf die Kartenmitte (was man gerade
 * ansieht) oder den GPS-Standort."
 *
 * Zwei Dinge sind anders, beide aus dem Auftrag:
 *
 *   TourFuchs zeigt Umsatz, hier steht der Zustand. Das ist der Unterschied
 *   zwischen einer Vertriebs- und einer Wartungs-App, und er ist der Grund,
 *   warum die Zeile überhaupt anders aussehen darf.
 *
 *   Der Knopf „zur Tour" entfällt ersatzlos — SoundFuchs plant keine Wege
 *   (§0c). Ein Tipp auf die Zeile fliegt zum Standort und öffnet sein Blatt;
 *   das ist hier die einzige sinnvolle Fortsetzung.
 */

import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { ladeBestandsuebersicht, type StandortStand } from '../../services/bestandsuebersicht.js';
import { FILTER_EVENT, passt, istGefiltert } from './standortfilter.js';

/** Mehr als das liest niemand, und mehr Zeilen kosten nur Rechenzeit. */
const HOECHSTENS = 12;

export interface NahlisteDeps {
  /** Wo schaut die Karte gerade hin? Null, wenn sie noch nicht steht. */
  kartenmitte: () => { lat: number; lng: number } | null;
  /** Zu einem Standort fliegen und sein Blatt öffnen. */
  zeigeStandort: (id: string) => void;
}

type Bezug = 'karte' | 'gps';

function entfernungKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const bogen = (g: number) => (g * Math.PI) / 180;
  const dLat = bogen(bLat - aLat);
  const dLng = bogen(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bogen(aLat)) * Math.cos(bogen(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function schreibeEntfernung(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

export class Nahliste {
  private bezug: Bezug = 'karte';
  private gps: { lat: number; lng: number } | null = null;
  private gpsFehler = '';
  private wurzel: HTMLElement | null = null;
  private aufraeumer: Array<() => void> = [];

  constructor(private readonly deps: NahlisteDeps) {}

  public baue(tafel: HTMLElement): void {
    const wurzel = document.createElement('div');
    wurzel.className = 'nahliste';
    wurzel.innerHTML =
      `<div class="nahliste-kopf">` +
      `<b class="nahliste-titel"></b>` +
      `<div class="nahliste-bezug" role="group"></div>` +
      `</div>` +
      `<p class="nahliste-zahlen"></p>` +
      `<ul class="nahliste-zeilen"></ul>` +
      `<p class="nahliste-leer" hidden></p>`;

    const titel = wurzel.querySelector('.nahliste-titel');
    if (titel) titel.textContent = t('schale.nearby.title');
    const leer = wurzel.querySelector('.nahliste-leer');
    if (leer) leer.textContent = t('schale.nearby.empty');

    const bezugsleiste = wurzel.querySelector('.nahliste-bezug');
    for (const art of ['karte', 'gps'] as const) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'nahliste-bezug-btn';
      knopf.dataset.bezug = art;
      knopf.classList.toggle('active', art === this.bezug);
      knopf.textContent =
        art === 'karte' ? t('schale.nearby.originMap') : t('schale.nearby.originGps');
      knopf.addEventListener('click', () => this.setzeBezug(art));
      bezugsleiste?.appendChild(knopf);
    }

    tafel.appendChild(wurzel);
    this.wurzel = wurzel;

    const beiFilter = () => void this.zeichne();
    document.addEventListener(FILTER_EVENT, beiFilter);
    this.aufraeumer.push(() => document.removeEventListener(FILTER_EVENT, beiFilter));
  }

  public abbauen(): void {
    for (const weg of this.aufraeumer) weg();
    this.aufraeumer = [];
    this.wurzel?.remove();
    this.wurzel = null;
  }

  private setzeBezug(art: Bezug): void {
    this.bezug = art;
    this.wurzel?.querySelectorAll<HTMLElement>('.nahliste-bezug-btn').forEach((k) => {
      k.classList.toggle('active', k.dataset.bezug === art);
    });
    if (art === 'gps' && !this.gps) this.frageGps();
    else void this.zeichne();
  }

  /**
   * Der Standort wird erst gefragt, wenn jemand ihn haben will.
   *
   * Ungefragt danach zu fragen wäre dieselbe Sorte Übergriff wie ungefragt das
   * Mikrofon zu öffnen — und die Karte beantwortet die Frage „was sehe ich
   * gerade?" ohnehin ohne jede Erlaubnis.
   */
  private frageGps(): void {
    if (!navigator.geolocation) {
      this.gpsFehler = t('schale.nearby.gpsUnavailable');
      void this.zeichne();
      return;
    }
    this.gpsFehler = t('schale.nearby.gpsWaiting');
    void this.zeichne();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.gpsFehler = '';
        void this.zeichne();
      },
      () => {
        this.gpsFehler = t('schale.nearby.gpsDenied');
        void this.zeichne();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  private bezugspunkt(): { lat: number; lng: number } | null {
    if (this.bezug === 'gps') return this.gps;
    return this.deps.kartenmitte();
  }

  public async zeichne(): Promise<void> {
    if (!this.wurzel) return;
    const zahlen = this.wurzel.querySelector<HTMLElement>('.nahliste-zahlen');
    const liste = this.wurzel.querySelector<HTMLElement>('.nahliste-zeilen');
    const leer = this.wurzel.querySelector<HTMLElement>('.nahliste-leer');
    if (!zahlen || !liste || !leer) return;

    let uebersicht: StandortStand[] = [];
    try {
      uebersicht = await ladeBestandsuebersicht();
    } catch (fehler) {
      logger.warn('Nahliste: der Bestand ließ sich nicht lesen', fehler);
    }

    // Dieselbe Menge, die auch auf der Karte liegt — nicht der ganze Bestand.
    // Bei TourFuchs steht an dieser Stelle der Kommentar, warum: Sonst schlägt
    // die Liste Kunden vor, die gar nicht gezeichnet sind.
    const verortet = uebersicht.filter(
      (e) => e.kunde.geo === 'plz' && e.kunde.lat != null && e.kunde.lng != null && passt(e)
    );
    const punkt = this.bezugspunkt();

    const zeilen = verortet
      .map((e) => ({
        e,
        km: punkt ? entfernungKm(punkt.lat, punkt.lng, e.kunde.lat!, e.kunde.lng!) : null,
      }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
      .slice(0, HOECHSTENS);

    const teile = [
      t('schale.nearby.visible', { count: String(verortet.length) }),
      ...(istGefiltert() ? [t('schale.nearby.filtered')] : []),
      ...(this.gpsFehler ? [this.gpsFehler] : []),
    ];
    zahlen.textContent = teile.join(' · ');

    liste.textContent = '';
    leer.hidden = zeilen.length > 0;

    for (const { e, km } of zeilen) {
      const zeile = document.createElement('li');
      zeile.className = 'nahliste-zeile';

      const punktchen = document.createElement('span');
      punktchen.className = `nahliste-punkt zustand-${e.zustand}`;

      const name = document.createElement('span');
      name.className = 'nahliste-name';
      name.textContent = e.kunde.name;
      const ort = document.createElement('small');
      ort.textContent = e.kunde.ort ?? '';
      name.appendChild(ort);

      const wert = document.createElement('span');
      wert.className = 'nahliste-wert';
      // Nur der Wert, nicht auch noch die Maschinenzahl: Bei 390 Punkten
      // Breite stieß „1 Maschine(n), ungeprüft" in den Namen daneben. Wie
      // viele Maschinen dort stehen, sagt das Standortblatt — und dorthin
      // führt die Zeile ohnehin.
      wert.textContent =
        e.schlechtester !== null
          ? `${Math.round(e.schlechtester)} %`
          : t('schale.nearby.unchecked');

      const weite = document.createElement('span');
      weite.className = 'nahliste-weite';
      weite.textContent = schreibeEntfernung(km);

      zeile.append(punktchen, name, wert, weite);
      zeile.addEventListener('click', () => this.deps.zeigeStandort(e.kunde.id));
      liste.appendChild(zeile);
    }
  }
}
