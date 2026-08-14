/**
 * SOUNDFUCHS — DIE DREI KARTENGRÜNDE
 *
 * Eins zu eins von der Schwester-App TourFuchs übernommen (dort
 * `CONFIG.tileLayers` in `src/core/config.js`), samt Adressen, Zoomgrenzen und
 * Quellenangaben. Nicht aus Bequemlichkeit: Wer beide Apps nebeneinander
 * benutzt, soll dieselbe Karte sehen — sonst sieht es aus, als zeigten sie
 * verschiedene Länder.
 *
 * ── DIE QUELLENANGABE IST PFLICHT, NICHT SCHMUCK ────────────────────────────
 *
 * Alle drei Dienste verlangen Namensnennung. Sie steht deshalb an drei
 * Stellen: hier am Datensatz, unten rechts auf der Karte selbst (Leaflets
 * `attributionControl`, ausdrücklich eingeschaltet), und im Dialog „Über
 * SoundFuchs". Der Text darf nicht weggekürzt werden, auch nicht „nur fürs
 * Handy" — er ist die Bedingung, unter der die Kacheln benutzt werden dürfen.
 *
 * ── KACHELN BRAUCHEN NETZ ───────────────────────────────────────────────────
 *
 * Das ist die einzige echte Einschränkung der Karte (docs/kunden-und-karte.md
 * §5). In einer Halle ohne Empfang bleibt sie grau. Deshalb bleibt die Liste
 * der führende Weg zur Maschine und die Karte das zweite Fenster.
 */

/** Ein Kartengrund, so wie Leaflet ihn braucht. */
export interface Kachelgrund {
  /** Schlüssel, unter dem die Wahl gespeichert wird. */
  schluessel: Kachelwahl;
  /** Übersetzungsschlüssel der Beschriftung. */
  key: string;
  url: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
}

export type Kachelwahl = 'light' | 'standard' | 'satellite';

export const KACHELGRUENDE: Record<Kachelwahl, Kachelgrund> = {
  light: {
    schluessel: 'light',
    key: 'map.tileLight',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    minZoom: 5,
  },
  standard: {
    schluessel: 'standard',
    key: 'map.tileStandard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    minZoom: 5,
  },
  satellite: {
    schluessel: 'satellite',
    key: 'map.tileSatellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    minZoom: 5,
  },
};

/**
 * Kartenausschnitt beim Öffnen — ebenfalls von TourFuchs (`CONFIG.map`).
 *
 * Der Mittelpunkt liegt in der Mitte Deutschlands, die Grenzen umfassen
 * Mitteleuropa. Wer weiter hinausziehen will, kann es nicht: Eine Weltkarte
 * mit drei Kunden im Ruhrgebiet zeigt vor allem Ozean.
 */
export const KARTENSICHT = {
  mitte: [51.16, 10.45] as [number, number],
  zoom: 6,
  minZoom: 5,
  maxZoom: 19,
  grenzen: [
    [40.0, -10.0],
    [62.0, 30.0],
  ] as [[number, number], [number, number]],
};

const SPEICHER = 'soundfuchs.kartengrund';

/**
 * Die zuletzt gewählte Kartendarstellung.
 *
 * Wer einmal auf Satellit gestellt hat, will beim nächsten Öffnen nicht wieder
 * umstellen. Ein unbekannter oder fehlender Wert fällt auf „Hell" zurück —
 * das ist der ruhigste Grund, auf dem die Marker am besten lesbar sind.
 */
export function gemerkterKachelgrund(): Kachelwahl {
  try {
    const wert = localStorage.getItem(SPEICHER);
    if (wert && wert in KACHELGRUENDE) return wert as Kachelwahl;
  } catch {
    // Kein Speicher (privates Fenster) — dann eben die Voreinstellung.
  }
  return 'light';
}

export function merkeKachelgrund(wahl: Kachelwahl): void {
  try {
    localStorage.setItem(SPEICHER, wahl);
  } catch {
    // Nicht merken zu können ist kein Grund, die Karte nicht zu zeigen.
  }
}
