/**
 * SOUNDFUCHS — DIE POSTLEITZAHLGEBIETE ALS FLÄCHEN
 *
 * Das „Deutschlandbild": nicht nur Kacheln mit Punkten darauf, sondern die
 * Postleitzahlgebiete als sichtbare Flächen mit Grenzen — so wie es TourFuchs
 * zeigt und wonach der Auftraggeber gefragt hat.
 *
 * Übernommen von TourFuchs (`CONFIG.levels` in `src/core/config.js`,
 * gezeichnet in `src/features/map.js`), samt der beiden Datensätze. Was dort
 * die Fläche einfärbt, ist der Umsatz eines Vertriebsbezirks; hier ist es die
 * Zahl der Maschinen, die in dem Gebiet stehen. Dieselbe Machart, andere
 * Frage — SoundFuchs kennt keinen Umsatz.
 *
 * ── ZWEI STUFEN, NICHT VIER ────────────────────────────────────────────────
 *
 * TourFuchs führt vier Zuschnitte (1-, 2-, 3-, 5-stellig) plus Landkreise.
 * Hier liegen nur die beiden groben:
 *
 *   plz1.geojson    10 Gebiete    298 KB
 *   plz2.geojson    95 Gebiete    803 KB
 *
 * Die feineren wären 2,4 MB und 5,1 MB. Sie beantworten eine Frage, die diese
 * App nicht stellt: Auf drei- oder fünfstelliger Ebene sucht man einen
 * einzelnen Kunden, und dafür ist die Liste da. Für „wo stehen meine
 * Maschinen überhaupt" reichen zehn beziehungsweise 95 Flächen — und
 * ersparen einer App, die ihre Symbole von 3,3 MB auf 88 KB gedrückt hat,
 * 7,5 MB Geometrie.
 *
 * ── HERKUNFT DER DATEN ─────────────────────────────────────────────────────
 *
 *   plz1.geojson, plz2.geojson
 *   © OpenStreetMap-Mitwirkende (ODbL), über Esri Deutschland Open Data
 *
 * Die Namensnennung ist Bedingung der Nutzung, nicht Höflichkeit. Sie steht
 * in NOTICE, im Dialog „Über SoundFuchs" und unten rechts auf der Karte.
 *
 * ── ERST BEIM ÖFFNEN GELADEN ───────────────────────────────────────────────
 *
 * Wie die PLZ-Koordinaten und Leaflet stehen auch diese Dateien nicht im
 * Vorrat des Service Workers. Wer nie die Karte öffnet, lädt kein Byte davon.
 */

import { logger } from '@utils/logger.js';

/** Ein Gebietszuschnitt. */
export type Gebietsstufe = 'plz1' | 'plz2';

interface GebietsQuelle {
  pfad: string;
  /** Ab diesem Zoom wird dieser Zuschnitt gezeigt. */
  abZoom: number;
  /** Wie viele Stellen der Postleitzahl das Gebiet zusammenfasst. */
  stellen: number;
}

export const GEBIETSSTUFEN: Record<Gebietsstufe, GebietsQuelle> = {
  plz1: { pfad: 'geodata/plz1.geojson', abZoom: 0, stellen: 1 },
  plz2: { pfad: 'geodata/plz2.geojson', abZoom: 7, stellen: 2 },
};

/** Namensnennung, die zu den Flächen gehört. */
export const GEBIETE_QUELLE =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende (ODbL), via Esri Deutschland';

/** Minimalform dessen, was aus den Dateien gebraucht wird. */
export interface GebietsSammlung {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { plz: string };
    geometry: unknown;
  }>;
}

const vorrat = new Map<Gebietsstufe, GebietsSammlung>();

/**
 * Welcher Zuschnitt gehört zu diesem Zoom?
 *
 * Grob heraus, fein hinein — dieselbe Staffelung wie bei TourFuchs
 * (`CONFIG.map.autoLevels`), nur mit zwei Stufen statt vier. Wer ganz
 * Deutschland im Bild hat, sieht zehn Flächen; wer hineinzoomt, bekommt die
 * 95 zweistelligen. Andersherum wäre es unlesbar: 95 beschriftete Flächen auf
 * einem Handybildschirm sind ein Muster, keine Karte.
 */
export function stufeZuZoom(zoom: number): Gebietsstufe {
  return zoom >= GEBIETSSTUFEN.plz2.abZoom ? 'plz2' : 'plz1';
}

/** Einen Zuschnitt laden (und für das nächste Mal behalten). */
export async function ladeGebiete(stufe: Gebietsstufe): Promise<GebietsSammlung | null> {
  const gemerkt = vorrat.get(stufe);
  if (gemerkt) return gemerkt;
  try {
    const antwort = await fetch(GEBIETSSTUFEN[stufe].pfad);
    if (!antwort.ok) throw new Error(`Gebiete nicht ladbar (${antwort.status})`);
    const daten = (await antwort.json()) as GebietsSammlung;
    vorrat.set(stufe, daten);
    return daten;
  } catch (fehler) {
    // Ohne Empfang bleiben die Flächen weg — die Karte selbst trägt weiter.
    logger.warn(`Postleitzahlgebiete (${stufe}) nicht ladbar`, fehler);
    return null;
  }
}

/**
 * Wie viele Maschinen stehen je Gebiet?
 *
 * Der Schlüssel ist die verkürzte Postleitzahl: Bei `plz1` die erste Ziffer,
 * bei `plz2` die ersten zwei — genau die Schreibweise, die auch in den
 * Dateien steht (`properties.plz`).
 */
export function zaehleJeGebiet(plzListe: string[], stufe: Gebietsstufe): Map<string, number> {
  const stellen = GEBIETSSTUFEN[stufe].stellen;
  const zaehler = new Map<string, number>();
  for (const plz of plzListe) {
    if (!/^\d{5}$/.test(plz)) continue;
    const schluessel = plz.slice(0, stellen);
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
  }
  return zaehler;
}

/**
 * Die Füllstärke einer Fläche, abhängig von ihrer Zahl.
 *
 * Nicht linear, sondern über die Wurzel: Ein Gebiet mit 40 Maschinen ist
 * nicht vierzigmal so wichtig wie eines mit einer. Linear eingefärbt bliebe
 * alles außer dem größten Gebiet fast unsichtbar — die Karte zeigte dann nur,
 * wo man zufällig angefangen hat.
 *
 * Ein leeres Gebiet bekommt 0 und bleibt damit sichtbar, aber ungefüllt: Die
 * Grenze zeichnet es trotzdem, denn das Deutschlandbild soll vollständig
 * sein und nicht nur dort, wo schon etwas steht.
 */
export function fuellstaerke(anzahl: number, hoechstwert: number): number {
  if (anzahl <= 0 || hoechstwert <= 0) return 0;
  const anteil = Math.sqrt(anzahl) / Math.sqrt(hoechstwert);
  // Untergrenze, damit ein einzelner Kunde nicht unsichtbar bleibt.
  return 0.12 + anteil * 0.45;
}
