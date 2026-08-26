/**
 * Prüfungen zum Kundenimport.
 *
 * Am wichtigsten: eine zweite Einlesung derselben Datei darf keine
 * Duplikate anlegen. Wer eine Liste versehentlich zweimal hochlädt — oder
 * sie regelmäßig aktualisiert und erneut einliest —, soll dieselben Kunden
 * wiederfinden, nicht doppelt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { importiereKundenliste } from './customerImport.js';
import { getAllCustomers, getAllMachines, deleteCustomer } from '@data/db.js';

const SCHWERPUNKTE = { '45127': [51.45562, 7.01045] };
const ORTSNAMEN = { source: 'GeoNames', license: 'CC BY 4.0', places: { '45127': 'Essen' } };

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

describe('Kundenliste einlesen', () => {
  beforeEach(async () => {
    for (const k of await getAllCustomers()) await deleteCustomer(k.id);
  });

  it('legt Kunden aus einer einfachen CSV an', async () => {
    const csv =
      'Name,PLZ,Ort,Maschine\nMüller Guss GmbH,45127,Essen,Pumpe 3\nÄrztehaus Nord,45127,,\n';
    const ergebnis = await importiereKundenliste(csv);
    expect(ergebnis.angelegt).toBe(2);
    expect(ergebnis.maschinenAngelegt).toBe(1);

    const kunden = await getAllCustomers();
    expect(new Set(kunden.map((k) => k.name))).toEqual(
      new Set(['Ärztehaus Nord', 'Müller Guss GmbH'])
    );

    const maschinen = await getAllMachines();
    expect(maschinen).toHaveLength(1);
    expect(maschinen[0].name).toBe('Pumpe 3');
    expect(maschinen[0].referenceModels).toEqual([]);
  });

  it('erkennt das Semikolon als Trennzeichen', async () => {
    const csv = 'Name;PLZ;Ort\nMüller Guss GmbH;45127;Essen\n';
    const ergebnis = await importiereKundenliste(csv);
    expect(ergebnis.angelegt).toBe(1);
  });

  it('übernimmt eine optionale Straßenadresse ohne sie zu geokodieren', async () => {
    const csv = 'Name,PLZ,Straße\nMüller Guss GmbH,45127,Industriestraße 12\n';
    await importiereKundenliste(csv);
    const [kunde] = await getAllCustomers();
    expect(kunde.strasse).toBe('Industriestraße 12');
    expect(kunde.geo).toBe('plz');
  });

  it('trägt den Ort aus der PLZ nach, wenn die Datei keinen mitbringt', async () => {
    const csv = 'Name,PLZ\nMüller Guss GmbH,45127\n';
    await importiereKundenliste(csv);
    const [kunde] = await getAllCustomers();
    expect(kunde.ort).toBe('Essen');
    expect(kunde.geo).toBe('plz');
  });

  it('legt einen Kunden mit unbekannter PLZ trotzdem an, ohne Kartenposition', async () => {
    const csv = 'Name,PLZ\nWeit weg GmbH,99999\n';
    const ergebnis = await importiereKundenliste(csv);
    expect(ergebnis.angelegt).toBe(1);
    const [kunde] = await getAllCustomers();
    expect(kunde.geo).toBe('none');
    expect(kunde.lat).toBeUndefined();
  });

  it('überspringt Zeilen ohne Namen oder mit ungültiger PLZ', async () => {
    const csv = 'Name,PLZ\n,45127\nMüller Guss GmbH,451\n';
    const ergebnis = await importiereKundenliste(csv);
    expect(ergebnis.angelegt).toBe(0);
    expect(ergebnis.fehlerzeilen).toEqual([2, 3]);
  });

  it('legt bei einer fehlenden Name- oder PLZ-Spalte nichts an', async () => {
    const csv = 'Firma\nMüller Guss GmbH\n';
    const ergebnis = await importiereKundenliste(csv);
    expect(ergebnis.angelegt).toBe(0);
    expect(await getAllCustomers()).toHaveLength(0);
  });

  it('verdoppelt beim erneuten Einlesen derselben Liste nichts', async () => {
    const csv = 'Name,PLZ\nMüller Guss GmbH,45127\n';
    await importiereKundenliste(csv);
    const zweitesMal = await importiereKundenliste(csv);
    expect(zweitesMal.angelegt).toBe(0);
    expect(zweitesMal.uebersprungen).toBe(1);
    expect(await getAllCustomers()).toHaveLength(1);
  });
});
