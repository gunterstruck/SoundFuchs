/**
 * SOUNDFUCHS — VERORTUNG ÜBER DIE POSTLEITZAHL
 *
 * Ein Kunde bekommt seine Stelle auf der Karte aus seiner Postleitzahl.
 * Kein Schlüssel, kein Benutzerkonto, keine Anfrage ins Netz: Die 8.298
 * deutschen Postleitzahlen liegen als Datei bei.
 *
 * Übernommen von der Schwester-App TourFuchs (dort `src/services/geocode.js`),
 * einschließlich der Daten selbst. Was dort in einer zweiten Stufe über
 * Nominatim eine hausgenaue Adresse holt, fehlt hier mit Absicht: Für „wo
 * steht der Kunde" reicht die Ortsmitte, und eine Netzabfrage je Kunde wäre
 * Aufwand und Datenabfluss für eine Genauigkeit, die niemand braucht.
 *
 * ── HERKUNFT DER DATEN ──────────────────────────────────────────────────────
 *
 *   plz-places.json     Ortsnamen — © GeoNames, CC BY 4.0
 *                       https://download.geonames.org/export/zip/DE.zip
 *   plz-centroids.json  Koordinaten — © OpenStreetMap-Mitwirkende, ODbL
 *
 * Beide Lizenzen verlangen Namensnennung. Sie steht in NOTICE und im Dialog
 * „Über SoundFuchs"; wer die Daten weitergibt, gibt die Pflicht mit weiter.
 * Die Quellenangabe ist keine Höflichkeit, sondern Bedingung der Nutzung.
 *
 * ── WARUM NICHT VORGELADEN ──────────────────────────────────────────────────
 *
 * Die beiden Dateien sind zusammen rund 400 KB und stehen bewusst NICHT im
 * Vorrat des Service Workers (`globPatterns` in vite.config.ts führt kein
 * JSON). Wer nie einen Kunden anlegt, lädt sie nie. Beim ersten Mal kommen sie
 * aus dem Netz und liegen danach im Laufzeit-Zwischenspeicher — ab dann auch
 * ohne Empfang. Dieselbe Überlegung wie beim TensorFlow-Paket.
 */

import { logger } from '@utils/logger.js';

/** PLZ → [Breite, Länge]. */
type Schwerpunkte = Record<string, [number, number]>;

/** PLZ → Ortsname. */
type Ortsnamen = Record<string, string>;

const PFAD_SCHWERPUNKTE = 'geodata/plz-centroids.json';
const PFAD_ORTSNAMEN = 'geodata/plz-places.json';

let schwerpunkte: Schwerpunkte | null = null;
let ortsnamen: Ortsnamen | null = null;

/** Genauigkeit, mit der ein Kunde auf der Karte liegt. */
export type Ortsgenauigkeit = 'plz' | 'none';

export interface Verortung {
  lat: number;
  lng: number;
  genauigkeit: Ortsgenauigkeit;
}

async function ladeSchwerpunkte(): Promise<Schwerpunkte> {
  if (schwerpunkte) return schwerpunkte;
  const antwort = await fetch(PFAD_SCHWERPUNKTE);
  if (!antwort.ok) throw new Error(`PLZ-Koordinaten nicht ladbar (${antwort.status})`);
  schwerpunkte = (await antwort.json()) as Schwerpunkte;
  return schwerpunkte;
}

async function ladeOrtsnamen(): Promise<Ortsnamen> {
  if (ortsnamen) return ortsnamen;
  const antwort = await fetch(PFAD_ORTSNAMEN);
  if (!antwort.ok) throw new Error(`PLZ-Ortsnamen nicht ladbar (${antwort.status})`);
  // Die Datei führt ihre eigene Herkunft mit: { source, license, places }.
  const roh = (await antwort.json()) as { places?: Ortsnamen } & Ortsnamen;
  ortsnamen = roh.places ?? roh;
  return ortsnamen;
}

/**
 * Den Ortsnamen zu einer Postleitzahl nachschlagen.
 *
 * Damit füllt sich das Ortsfeld beim Anlegen eines Kunden von selbst — man
 * tippt fünf Ziffern, nicht zwei Felder. `null`, wenn die PLZ unbekannt ist;
 * dann trägt man den Ort eben ein.
 */
export async function ortZurPlz(plz: string): Promise<string | null> {
  const sauber = plz.trim();
  if (!/^\d{5}$/.test(sauber)) return null;
  try {
    const namen = await ladeOrtsnamen();
    return namen[sauber] ?? null;
  } catch (fehler) {
    logger.warn('Ortsname zur PLZ nicht ermittelbar', fehler);
    return null;
  }
}

/**
 * Ein gleichbleibender kleiner Versatz, etwa ±500 m.
 *
 * Ohne ihn lägen alle Kunden derselben Postleitzahl exakt aufeinander — auf
 * der Karte wäre nur einer zu sehen. Der Wert kommt aus der Kennung, nicht aus
 * dem Zufall: Derselbe Kunde landet bei jedem Laden an derselben Stelle.
 * Sonst wanderten die Marker bei jedem Öffnen.
 */
function versatz(kennung: string): [number, number] {
  let hash = 0;
  for (let i = 0; i < kennung.length; i++) {
    hash = (hash * 31 + kennung.charCodeAt(i)) | 0;
  }
  const a = ((hash & 0xffff) / 0xffff - 0.5) * 0.009;
  const b = (((hash >> 16) & 0xffff) / 0xffff - 0.5) * 0.013;
  return [a, b];
}

/**
 * Einen Kunden über seine Postleitzahl verorten.
 *
 * Die Genauigkeit wird mitgegeben und nicht verschwiegen: `plz` heißt
 * Ortsmitte, nicht Hausnummer. Die Karte zeigt das an, statt eine Schärfe
 * vorzutäuschen, die die Daten nicht haben.
 */
export async function verorteUeberPlz(plz: string, kennung: string): Promise<Verortung | null> {
  const sauber = plz.trim();
  if (!/^\d{5}$/.test(sauber)) return null;
  try {
    const punkte = await ladeSchwerpunkte();
    const treffer = punkte[sauber];
    if (!treffer) return null;
    const [dLat, dLng] = versatz(kennung);
    return { lat: treffer[0] + dLat, lng: treffer[1] + dLng, genauigkeit: 'plz' };
  } catch (fehler) {
    logger.warn('Verortung über PLZ fehlgeschlagen', fehler);
    return null;
  }
}
