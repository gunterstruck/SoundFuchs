/**
 * SOUNDFUCHS — EINE KUNDENLISTE EINLESEN
 *
 * Schnitt 4 aus docs/kunden-und-karte.md. Von TourFuchs abgeschaut ist die
 * Idee, nicht das Format: Dort wird eine ganze Kundenverwaltung importiert,
 * mit Umsatz, Vertriebsbezirk, Ansprechpartner, Kanal (`src/services/excel.js`
 * + `src/ui/importWizard.js`, zusammen rund 1700 Zeilen). Das gehört zu
 * TourFuchs' Aufgabe, nicht zu dieser: Ein Kunde hier ist schmal
 * (docs/kunden-und-karte.md §2), und die Liste, die jemand mitbringt, ist es
 * auch — eine Adresse, vielleicht ein Maschinenname, vielleicht eine
 * Position. Keine Umsatzspalte, weil SoundFuchs keinen Umsatz kennt.
 *
 * Deshalb reicht hier eine schlichte CSV-Datei mit vier möglichen Spalten
 * statt eines mehrstufigen Zuordnungs-Assistenten: Name, PLZ, Ort (optional),
 * Maschine (optional). Wer mehr mitbringt — weitere Spalten —, die werden
 * schlicht ignoriert, nicht abgelehnt.
 *
 * ── SPALTEN ──────────────────────────────────────────────────────────────
 *
 *   Name       Pflicht.  Firmenname.
 *   PLZ        Pflicht.  Fünf Ziffern. Bestimmt Ort und Kartenposition.
 *   Ort        Optional. Wird sonst aus der PLZ nachgetragen.
 *   Maschine   Optional. Legt eine Maschine ohne Referenz beim Kunden an.
 *
 * Spaltennamen werden über Aliase erkannt (deutsch/englisch, Groß-/
 * Kleinschreibung egal), die Reihenfolge der Spalten ist beliebig.
 *
 * ── WAS BEIM ERNEUTEN EINLESEN PASSIERT ─────────────────────────────────
 *
 * Ein Kunde mit demselben Namen und derselben PLZ wird übersprungen, nicht
 * verdoppelt — dieselbe Liste zweimal einzulesen (versehentlich, oder weil
 * sie aktualisiert wurde) darf nicht zu doppelten Kunden führen.
 */

import { alleOrte, verorteUeberPlz } from './plzGeocode.js';
import { saveCustomer, saveMachine, getAllCustomers } from '@data/db.js';
import { logger } from '@utils/logger.js';
import type { Customer, Machine } from '@data/types.js';

export interface ImportErgebnis {
  angelegt: number;
  maschinenAngelegt: number;
  uebersprungen: number;
  fehlerzeilen: number[];
}

/** Spaltennamen, unter denen ein Feld erkannt wird — klein geschrieben. */
const SPALTEN_ALIASE: Record<'name' | 'plz' | 'ort' | 'maschine', string[]> = {
  name: ['name', 'firma', 'firmenname', 'kunde', 'company', 'customer'],
  plz: ['plz', 'postleitzahl', 'zip', 'postcode', 'zipcode'],
  ort: ['ort', 'stadt', 'city', 'town'],
  maschine: ['maschine', 'machine', 'maschinenname', 'anlage', 'equipment'],
};

/**
 * Eine CSV-Zeile in Felder zerlegen.
 *
 * Bewusst schlicht: Trennzeichen Komma oder Semikolon (wird an der
 * Kopfzeile erkannt), Anführungszeichen für Felder mit dem Trennzeichen
 * darin. Was diese Funktion nicht kann — Felder mit eingebettetem
 * Zeilenumbruch —, kann ein Tabellenprogramm beim Exportieren vermeiden;
 * für eine Liste aus vier Spalten ist das kein Verlust, den es wert wäre,
 * einen vollen CSV-Parser einzubinden.
 */
function zerlegeZeile(zeile: string, trenner: string): string[] {
  const felder: string[] = [];
  let aktuell = '';
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const zeichen = zeile[i];
    if (inAnfuehrung) {
      if (zeichen === '"' && zeile[i + 1] === '"') {
        aktuell += '"';
        i++;
      } else if (zeichen === '"') {
        inAnfuehrung = false;
      } else {
        aktuell += zeichen;
      }
    } else if (zeichen === '"') {
      inAnfuehrung = true;
    } else if (zeichen === trenner) {
      felder.push(aktuell.trim());
      aktuell = '';
    } else {
      aktuell += zeichen;
    }
  }
  felder.push(aktuell.trim());
  return felder;
}

function erkenneTrenner(kopfzeile: string): string {
  return (kopfzeile.match(/;/g)?.length ?? 0) > (kopfzeile.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/** Zu jeder erkannten Spalte den Index in der Kopfzeile finden. */
function ordneSpalten(
  kopf: string[]
): Partial<Record<'name' | 'plz' | 'ort' | 'maschine', number>> {
  const ergebnis: Partial<Record<'name' | 'plz' | 'ort' | 'maschine', number>> = {};
  const klein = kopf.map((s) => s.toLowerCase().trim());
  for (const feld of Object.keys(SPALTEN_ALIASE) as Array<keyof typeof SPALTEN_ALIASE>) {
    const index = klein.findIndex((spalte) => SPALTEN_ALIASE[feld].includes(spalte));
    if (index >= 0) ergebnis[feld] = index;
  }
  return ergebnis;
}

function neueKennung(vorsilbe: string): string {
  return `${vorsilbe}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
}

/**
 * Eine CSV-Kundenliste einlesen.
 *
 * Jede gültige Zeile legt einen Kunden an (und, falls eine Maschinenspalte
 * gefüllt ist, eine unangelernte Maschine dazu). Eine unbekannte Postleitzahl
 * hält eine Zeile nicht auf — der Kunde entsteht trotzdem, nur mit
 * `geo: 'none'` statt einer erfundenen Position, dieselbe Regel wie beim
 * manuellen Anlegen (`CustomerField.ts`).
 */
export async function importiereKundenliste(text: string): Promise<ImportErgebnis> {
  const ergebnis: ImportErgebnis = {
    angelegt: 0,
    maschinenAngelegt: 0,
    uebersprungen: 0,
    fehlerzeilen: [],
  };

  const zeilen = text.split(/\r?\n/).filter((z) => z.trim().length > 0);
  if (zeilen.length < 2) return ergebnis;

  const trenner = erkenneTrenner(zeilen[0]);
  const kopf = zerlegeZeile(zeilen[0], trenner);
  const spalten = ordneSpalten(kopf);

  if (spalten.name === undefined || spalten.plz === undefined) {
    logger.warn('Kundenimport: Spalte "Name" oder "PLZ" fehlt in der Kopfzeile', kopf);
    return ergebnis;
  }

  // Gegen doppeltes Einlesen derselben Liste: Name + PLZ zusammen als
  // Schlüssel, nicht der Name allein — zwei Filialen derselben Firma in
  // verschiedenen Städten sind zwei Kunden.
  const bekannt = new Set((await getAllCustomers()).map((k) => `${k.name.toLowerCase()}|${k.plz}`));

  // Damit eine unbekannte Postleitzahl nicht bei jeder Zeile neu übers Netz
  // geprüft wird: einmal alle bekannten Postleitzahlen laden. Dieselbe Liste
  // liefert auch den Ortsnamen nach, wenn die Datei selbst keinen mitbringt.
  const plzZuOrt = new Map((await alleOrte()).map((o) => [o.plz, o.ort]));

  for (let i = 1; i < zeilen.length; i++) {
    const felder = zerlegeZeile(zeilen[i], trenner);
    const name = felder[spalten.name]?.trim();
    const plz = felder[spalten.plz]?.trim();
    const ortSpalte = spalten.ort !== undefined ? felder[spalten.ort]?.trim() : undefined;
    const maschinenName =
      spalten.maschine !== undefined ? felder[spalten.maschine]?.trim() : undefined;

    if (!name || !/^\d{5}$/.test(plz ?? '')) {
      ergebnis.fehlerzeilen.push(i + 1); // 1-basiert plus Kopfzeile
      continue;
    }

    const schluessel = `${name.toLowerCase()}|${plz}`;
    if (bekannt.has(schluessel)) {
      ergebnis.uebersprungen++;
      continue;
    }
    bekannt.add(schluessel);

    const kundeId = neueKennung('IMP');
    const bekannteOrt = plzZuOrt.get(plz as string);
    const verortung = bekannteOrt ? await verorteUeberPlz(plz as string, kundeId) : null;

    const kunde: Customer = {
      id: kundeId,
      name,
      plz: plz as string,
      ort: ortSpalte || bekannteOrt || undefined,
      lat: verortung?.lat,
      lng: verortung?.lng,
      geo: verortung ? 'plz' : 'none',
      createdAt: Date.now(),
    };
    await saveCustomer(kunde);
    ergebnis.angelegt++;

    if (maschinenName) {
      const maschine: Machine = {
        id: neueKennung('IMP-M'),
        name: maschinenName,
        createdAt: Date.now(),
        referenceModels: [],
        customerId: kundeId,
      };
      await saveMachine(maschine);
      ergebnis.maschinenAngelegt++;
    }
  }

  logger.info(
    `📥 Kundenliste eingelesen: ${ergebnis.angelegt} Kunden, ${ergebnis.maschinenAngelegt} Maschinen, ${ergebnis.uebersprungen} übersprungen, ${ergebnis.fehlerzeilen.length} fehlerhafte Zeilen`
  );
  return ergebnis;
}
