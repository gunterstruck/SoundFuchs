/**
 * SOUNDFUCHS — BEISPIELDATEN
 *
 * Wer die App vorführen will, braucht etwas zum Zeigen, ohne vorher fremde
 * Kunden einzutippen. Genau dafür, und für nichts sonst, ist diese Datei da:
 * rund 100 erfundene Kunden, deutschlandweit verteilt, mit je einer
 * unangelernten Maschine.
 *
 * Von TourFuchs übernommen ist das Grundprinzip — deterministische Erzeugung
 * über Bezirks-Anker plus nächster-Anker-Zuordnung der echten Postleitzahlen
 * (dort `createDemoCustomers` in `src/services/excel.js`), damit die
 * Vorführung bei jedem Start gleich aussieht und ganz Deutschland füllt,
 * statt sich in einer Ecke zu ballen. Nicht übernommen ist die Vertriebslogik
 * (Bezirke, Umsatz, Kanal) — die passt zu TourFuchs, nicht zu einer App, die
 * Maschinenzustände prüft.
 *
 * ── UNVERWECHSELBAR ALS BEISPIEL ─────────────────────────────────────────
 *
 * Jeder Kunde trägt `demo: true` und einen Namen, der mit „SoundFuchs Demo · "
 * beginnt — niemand tippt das aus Versehen, und „Beispieldaten entfernen"
 * kann sich blind auf das Feld verlassen, ohne Namen zu vergleichen. Jede
 * Maschine trägt dasselbe Feld.
 *
 * ── KEINE ERFUNDENE REFERENZ ─────────────────────────────────────────────
 *
 * Die Beispielmaschinen bleiben unangelernt (`referenceModels: []`), zeigen
 * also „Referenz fehlt" — genau das, was eine frisch importierte Maschine
 * auch zeigen würde, und ehrlich: Eine echte Referenz ist ein trainiertes
 * Muster aus einer echten Aufnahme. Sie vorzutäuschen hieße, Gewichte zu
 * erfinden, die wie eine Messung aussehen, aber keine ist — genau die Art
 * Anzeige, die diese App an anderer Stelle bewusst vermeidet (die
 * Postleitzahl-Verortung sagt „Ortsmitte" statt eine Hausnummer-Genauigkeit
 * zu behaupten, die sie nicht hat). Ein Klangbild ohne echte Aufnahme wäre
 * dieselbe Täuschung, nur im Ton statt auf der Karte.
 */

import { alleOrte, verorteUeberPlz } from './plzGeocode.js';
import {
  saveCustomer,
  saveMachine,
  getAllCustomers,
  getAllMachines,
  deleteCustomer,
  deleteMachine,
} from '@data/db.js';
import { logger } from '@utils/logger.js';
import type { Customer, Machine } from '@data/types.js';

/** Wie viele Beispielkunden entstehen sollen. */
export const BEISPIEL_ANZAHL = 100;

/**
 * Grobe Bezirks-Anker, verteilt über Deutschland — eine verkleinerte Fassung
 * von TourFuchs' 15 Vertriebsbezirken (dort mit Umsatz und Zuständigkeit,
 * hier nur als geografischer Schwerpunkt gebraucht).
 */
const ANKER: ReadonlyArray<[number, number]> = [
  [53.55, 9.99], // Hamburg
  [52.52, 13.4], // Berlin
  [53.08, 8.8], // Bremen
  [51.51, 7.47], // Ruhrgebiet
  [50.94, 6.96], // Köln
  [50.11, 8.68], // Frankfurt
  [49.45, 11.08], // Nürnberg
  [48.14, 11.58], // München
  [48.78, 9.18], // Stuttgart
  [51.05, 13.74], // Dresden
  [51.34, 12.37], // Leipzig
  [52.13, 11.63], // Magdeburg
];

/**
 * Branchen mit rotierenden Maschinen — der Sorte, für die diese App gebaut
 * ist. TourFuchs' Liste (Bäckerei, Optik, Textil …) passt zu Vertrieb, nicht
 * zu Maschinenakustik; diese hier ist bewusst eine andere.
 */
const BRANCHEN = [
  'Gießerei',
  'Sägewerk',
  'Spedition',
  'Molkerei',
  'Brauerei',
  'Zementwerk',
  'Stahlwerk',
  'Recyclinghof',
  'Kläranlage',
  'Papierfabrik',
  'Lackiererei',
  'Wäscherei',
  'Kühlhaus',
  'Ziegelei',
  'Walzwerk',
  'Textilwerk',
  'Kraftwerk',
  'Chemiewerk',
  'Getreidemühle',
  'Recyclingwerk',
];

const MASCHINENARTEN = [
  'Pumpe',
  'Lüfter',
  'Kompressor',
  'Förderband',
  'Getriebe',
  'Ventilator',
  'Rührwerk',
  'Kühlaggregat',
  'Kreiselpumpe',
  'Extruder',
];

/**
 * Derselbe kleine deterministische Zufallsgenerator wie bei TourFuchs
 * (`createDemoCustomers`): Kein `Math.random()`, damit die Vorführung bei
 * jedem Laden exakt gleich aussieht — dieselbe Überlegung wie beim Versatz
 * in `plzGeocode.ts`.
 */
function pseudozufall(startwert: number): () => number {
  let stand = startwert >>> 0;
  return () => {
    stand = (Math.imul(stand, 1103515245) + 12345) & 0x7fffffff;
    return stand / 0x7fffffff;
  };
}

/** Jede Postleitzahl ihrem nächstgelegenen Anker zuordnen (Voronoi light). */
function verteileAufAnker(
  orte: Array<{ plz: string; lat: number; lng: number; ort: string }>
): Array<Array<{ plz: string; lat: number; lng: number; ort: string }>> {
  const pools: Array<Array<{ plz: string; lat: number; lng: number; ort: string }>> = ANKER.map(
    () => []
  );
  for (const ort of orte) {
    let besterIndex = 0;
    let besteDistanz = Infinity;
    for (let a = 0; a < ANKER.length; a++) {
      const [aLat, aLng] = ANKER[a];
      const dLat = ort.lat - aLat;
      const dLng = ort.lng - aLng;
      const distanz = dLat * dLat + dLng * dLng;
      if (distanz < besteDistanz) {
        besteDistanz = distanz;
        besterIndex = a;
      }
    }
    pools[besterIndex].push(ort);
  }
  return pools;
}

/**
 * Beispieldaten anlegen: rund 100 Kunden, deutschlandweit verteilt, je einer
 * unangelernten Maschine.
 *
 * Läuft neben einem bestehenden echten Bestand her — nichts wird überschrieben
 * oder gelöscht. Ein zweiter Aufruf legt weitere 100 an; wer das nicht will,
 * ruft vorher `entferneBeispieldaten` auf (so verdrahtet es die Oberfläche).
 */
export async function ladeBeispieldaten(): Promise<number> {
  const orte = await alleOrte();
  if (orte.length === 0) {
    logger.warn('Beispieldaten: keine Postleitzahlen geladen');
    return 0;
  }

  const pools = verteileAufAnker(orte);
  const rnd = pseudozufall(0x9e3779b9);
  const proAnker = Math.ceil(BEISPIEL_ANZAHL / ANKER.length);

  let erzeugt = 0;
  let i = 0;
  for (let a = 0; a < ANKER.length && erzeugt < BEISPIEL_ANZAHL; a++) {
    const pool = pools[a];
    if (pool.length === 0) continue;
    for (let n = 0; n < proAnker && erzeugt < BEISPIEL_ANZAHL; n++) {
      const ort = pool[Math.floor(rnd() * pool.length)];
      const branche = BRANCHEN[i % BRANCHEN.length];
      const maschinenArt = MASCHINENARTEN[Math.floor(rnd() * MASCHINENARTEN.length)];
      const kundeId = `demo-${i}`;

      // Derselbe Versatz wie bei einem von Hand angelegten Kunden — die
      // Beispieldaten bekommen keine Sonderbehandlung.
      const verortung = await verorteUeberPlz(ort.plz, kundeId);

      const kunde: Customer = {
        id: kundeId,
        name: `SoundFuchs Demo · ${branche} ${String(i + 1).padStart(4, '0')}`,
        plz: ort.plz,
        ort: ort.ort,
        lat: verortung?.lat,
        lng: verortung?.lng,
        geo: verortung ? 'plz' : 'none',
        createdAt: Date.now(),
        demo: true,
      };
      await saveCustomer(kunde);

      // ── WARUM JEDER ZEHNTE STANDORT EINE FLOTTE BEKOMMT ────────────────
      //
      // Bis zum 15.08.2026 trugen die Beispieldaten genau eine Maschine je
      // Standort und keine Flottengruppe. Der Reiter „Flotte" (Schnitt 5 der
      // Nutzerreise) konnte damit nichts zeigen als seinen eigenen leeren
      // Zustand: „Mindestens 2 Maschinen für einen aussagekräftigen
      // Flottenvergleich nötig." Beispieldaten, die genau die Funktion nicht
      // vorführen können, für die man sie lädt, sind keine.
      //
      // Eine Flotte ist ein Satz vergleichbarer Maschinen an EINEM Ort —
      // vier Pumpen in derselben Halle, nicht vier Pumpen in vier Städten.
      // Deshalb bekommt jeder zehnte Standort vier gleichartige Maschinen
      // mit gemeinsamer Gruppe, die übrigen bleiben bei einer. Das ergibt
      // rund zehn echte Flotten und lässt das Bild der Karte unberührt.
      const istFlottenstandort = i % 10 === 0;
      // Der Name der Flotte nennt Art und Ort, nicht eine Mehrzahl: „Extruder
      // · Zwickau" statt „Extrudern 08066". Deutsche Mehrzahlformen aus einem
      // Wortstamm zu bilden geht bei „Pumpe" gut und bei „Extruder" schief.
      const flotte = istFlottenstandort ? `${maschinenArt} · ${ort.ort}` : null;
      const anzahl = istFlottenstandort ? 4 : 1;

      for (let m = 0; m < anzahl; m++) {
        const maschine: Machine = {
          id: anzahl > 1 ? `demo-m-${i}-${m}` : `demo-m-${i}`,
          name: istFlottenstandort ? `${maschinenArt} ${m + 1}` : `${maschinenArt} ${(i % 9) + 1}`,
          createdAt: Date.now(),
          referenceModels: [],
          customerId: kundeId,
          fleetGroup: flotte,
          demo: true,
        };
        await saveMachine(maschine);
      }

      erzeugt++;
      i++;
    }
  }

  logger.info(`🧪 Beispieldaten angelegt: ${erzeugt} Kunden`);
  return erzeugt;
}

/** Ob überhaupt Beispieldaten im Bestand liegen. */
export async function gibEsBeispieldaten(): Promise<boolean> {
  return (await getAllCustomers()).some((k) => k.demo === true);
}

/** Wie viele Beispielkunden aktuell im Bestand liegen. */
export async function zaehleBeispieldaten(): Promise<number> {
  return (await getAllCustomers()).filter((k) => k.demo === true).length;
}

/**
 * Alle Beispieldaten wieder entfernen — Kunden und ihre Maschinen.
 *
 * `deleteCustomer` würde die Maschinen nur entkoppeln, nicht löschen (richtig
 * so bei einem echten Kunden, siehe db.ts). Bei Beispieldaten ist das
 * unerwünscht: Sie sollen spurlos verschwinden, nicht als „Maschine ohne
 * Kunde" liegen bleiben. Deshalb werden hier beide gezielt über das
 * `demo`-Feld gelöscht, nicht über `deleteCustomer` allein.
 */
export async function entferneBeispieldaten(): Promise<number> {
  const kunden = (await getAllCustomers()).filter((k) => k.demo === true);
  const maschinen = (await getAllMachines()).filter((m) => m.demo === true);

  for (const maschine of maschinen) await deleteMachine(maschine.id);
  for (const kunde of kunden) await deleteCustomer(kunde.id);

  logger.info(`🧪 Beispieldaten entfernt: ${kunden.length} Kunden, ${maschinen.length} Maschinen`);
  return kunden.length;
}
