import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  deleteCustomer,
  deleteMachine,
  getAllCustomers,
  getAllMachines,
  saveCustomer,
  saveMachine,
} from '@data/db.js';
import type { Customer, Machine } from '@data/types.js';
import { cleanupStaleShowcaseData } from './showcase.js';

const customer = (id: string, name: string): Customer => ({
  id,
  name,
  plz: '',
  geo: 'none',
  createdAt: Date.now(),
});

const machine = (id: string, customerId: string): Machine => ({
  id,
  name: id,
  customerId,
  createdAt: Date.now(),
  referenceModels: [],
});

describe('Datenhygiene der Mini-Schulungen', () => {
  beforeEach(async () => {
    for (const entry of await getAllMachines()) await deleteMachine(entry.id);
    for (const entry of await getAllCustomers()) await deleteCustomer(entry.id);
  });

  it('entfernt nur Einträge mit dem reservierten Schulungs-Präfix', async () => {
    await saveCustomer(customer('echter-standort', 'Echter Standort'));
    await saveMachine(machine('echte-maschine', 'echter-standort'));
    await saveCustomer(customer('sf-showcase-test-site', 'Vorführung'));
    await saveMachine(machine('sf-showcase-test-machine', 'sf-showcase-test-site'));

    await cleanupStaleShowcaseData();

    expect((await getAllCustomers()).map((entry) => entry.id)).toEqual(['echter-standort']);
    expect((await getAllMachines()).map((entry) => entry.id)).toEqual(['echte-maschine']);
  });
});
