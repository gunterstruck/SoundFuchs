/**
 * Prüfungen zum Kundenbestand.
 *
 * Der wichtigste Fall steht unten: Wer einen Kunden löscht, darf keine
 * Maschine verlieren. Ein Kunde ist eine Beschriftung, eine Maschine ist die
 * Arbeit von Wochen — angelernte Referenzen, Prüfverlauf, Positionsbild. Das
 * ist die Art Fehler, die man erst bemerkt, wenn es zu spät ist, und die
 * deshalb hier festgehalten gehört.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveCustomer,
  getCustomer,
  getAllCustomers,
  deleteCustomer,
  getMachinesForCustomer,
  saveMachine,
  getMachine,
} from './db.js';
import type { Customer, Machine } from './types.js';

const kunde = (id: string, name: string, plz: string): Customer => ({
  id,
  name,
  plz,
  ort: 'Essen',
  lat: 51.45,
  lng: 7.01,
  geo: 'plz',
  createdAt: Date.now(),
});

const maschine = (id: string, customerId?: string): Machine => ({
  id,
  name: `Maschine ${id}`,
  createdAt: Date.now(),
  referenceModels: [],
  ...(customerId ? { customerId } : {}),
});

describe('Kundenbestand', () => {
  beforeEach(async () => {
    for (const k of await getAllCustomers()) await deleteCustomer(k.id);
  });

  it('legt einen Kunden an und findet ihn wieder', async () => {
    await saveCustomer(kunde('k1', 'Müller Guss', '45127'));
    const geholt = await getCustomer('k1');
    expect(geholt?.name).toBe('Müller Guss');
    expect(geholt?.plz).toBe('45127');
    expect(geholt?.geo).toBe('plz');
  });

  it('sortiert alphabetisch, nicht nach Anlegedatum', async () => {
    await saveCustomer(kunde('k1', 'Zeppelin Werke', '45127'));
    await saveCustomer(kunde('k2', 'Ärztehaus Nord', '45127'));
    await saveCustomer(kunde('k3', 'Müller Guss', '45127'));
    const namen = (await getAllCustomers()).map((k) => k.name);
    expect(namen).toEqual(['Ärztehaus Nord', 'Müller Guss', 'Zeppelin Werke']);
  });

  it('findet die Maschinen eines Kunden', async () => {
    await saveCustomer(kunde('k1', 'Müller Guss', '45127'));
    await saveMachine(maschine('m1', 'k1'));
    await saveMachine(maschine('m2', 'k1'));
    await saveMachine(maschine('m3'));
    const seine = await getMachinesForCustomer('k1');
    expect(seine.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('behält die Maschinen, wenn der Kunde gelöscht wird', async () => {
    await saveCustomer(kunde('k1', 'Müller Guss', '45127'));
    await saveMachine(maschine('m1', 'k1'));

    await deleteCustomer('k1');

    expect(await getCustomer('k1')).toBeUndefined();
    // Die Maschine lebt weiter — sie hat nur ihre Zuordnung verloren.
    const m = await getMachine('m1');
    expect(m).toBeDefined();
    expect(m?.customerId).toBeUndefined();
  });
});
