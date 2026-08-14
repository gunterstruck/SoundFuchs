/**
 * Prüfungen zu den Beispieldaten.
 *
 * Der wichtigste Fall steht am Ende: „Beispieldaten entfernen" darf keinen
 * echten Kunden anfassen. Wäre das Feld `demo` nicht zuverlässig, würde man
 * das erst bemerken, wenn ein echter Kunde mitten in einer Vorführung
 * verschwindet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  ladeBeispieldaten,
  gibEsBeispieldaten,
  zaehleBeispieldaten,
  entferneBeispieldaten,
  BEISPIEL_ANZAHL,
} from './demoCustomers.js';
import { saveCustomer, getAllCustomers, getAllMachines, deleteCustomer } from '@data/db.js';
import type { Customer } from '@data/types.js';

const SCHWERPUNKTE: Record<string, [number, number]> = {};
const ORTSNAMEN: Record<string, string> = {};
// Eine Handvoll echter Postleitzahlen reicht für den Test — die Verteilung
// selbst wird nicht geprüft, nur dass sie überhaupt etwas erzeugt.
const BEISPIEL_PLZ: Array<[string, number, number, string]> = [
  ['20095', 53.55, 9.99, 'Hamburg'],
  ['10115', 52.53, 13.38, 'Berlin'],
  ['80331', 48.14, 11.58, 'München'],
  ['50667', 50.94, 6.96, 'Köln'],
  ['70173', 48.78, 9.18, 'Stuttgart'],
];
for (const [plz, lat, lng, ort] of BEISPIEL_PLZ) {
  SCHWERPUNKTE[plz] = [lat, lng];
  ORTSNAMEN[plz] = ort;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).includes('centroids') ? SCHWERPUNKTE : ORTSNAMEN),
      })
    )
  );
});

const kunde = (id: string, name: string): Customer => ({
  id,
  name,
  plz: '50667',
  ort: 'Köln',
  lat: 50.94,
  lng: 6.96,
  geo: 'plz',
  createdAt: Date.now(),
});

describe('Beispieldaten', () => {
  beforeEach(async () => {
    for (const k of await getAllCustomers()) await deleteCustomer(k.id);
  });

  it('legt Kunden an, jeder als Beispiel gekennzeichnet', async () => {
    const anzahl = await ladeBeispieldaten();
    expect(anzahl).toBeGreaterThan(0);
    const kunden = await getAllCustomers();
    expect(kunden.every((k) => k.demo === true)).toBe(true);
    expect(kunden.every((k) => k.name.startsWith('SoundFuchs Demo · '))).toBe(true);
  });

  it('gibt jedem Beispielkunden genau eine unangelernte Maschine', async () => {
    await ladeBeispieldaten();
    const kunden = await getAllCustomers();
    const maschinen = await getAllMachines();
    expect(maschinen.length).toBe(kunden.length);
    expect(maschinen.every((m) => m.demo === true)).toBe(true);
    expect(maschinen.every((m) => (m.referenceModels ?? []).length === 0)).toBe(true);
    expect(maschinen.every((m) => Boolean(m.customerId))).toBe(true);
  });

  it('erkennt vorhandene Beispieldaten', async () => {
    expect(await gibEsBeispieldaten()).toBe(false);
    await ladeBeispieldaten();
    expect(await gibEsBeispieldaten()).toBe(true);
  });

  it('zählt die Beispielkunden', async () => {
    const anzahl = await ladeBeispieldaten();
    expect(await zaehleBeispieldaten()).toBe(anzahl);
  });

  it('entfernt Beispieldaten vollständig, lässt aber einen echten Kunden unberührt', async () => {
    await saveCustomer(kunde('echt-1', 'Müller Guss GmbH'));
    await ladeBeispieldaten();

    const entfernt = await entferneBeispieldaten();
    expect(entfernt).toBeGreaterThan(0);

    const uebrig = await getAllCustomers();
    expect(uebrig).toHaveLength(1);
    expect(uebrig[0].id).toBe('echt-1');
    expect(uebrig[0].demo).toBeUndefined();

    const maschinenUebrig = await getAllMachines();
    expect(maschinenUebrig.every((m) => m.demo !== true)).toBe(true);
  });

  it('erzeugt nicht mehr als die vorgesehene Anzahl', async () => {
    const anzahl = await ladeBeispieldaten();
    expect(anzahl).toBeLessThanOrEqual(BEISPIEL_ANZAHL);
  });
});
