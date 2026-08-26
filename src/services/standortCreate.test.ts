import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { deleteCustomer, getAllCustomers } from '@data/db.js';
import { speichereStandort } from './standortCreate.js';
import { CustomerMap } from '../ui/components/CustomerMap.js';

const SCHWERPUNKTE = { '45127': [51.45562, 7.01045] };
const ORTSNAMEN = { source: 'GeoNames', license: 'CC BY 4.0', places: { '45127': 'Essen' } };

describe('Standort anlegen', () => {
  beforeEach(async () => {
    for (const kunde of await getAllCustomers()) await deleteCustomer(kunde.id);
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

  it('speichert den ausdrücklichen GPS-Punkt ohne Postleitzahl', async () => {
    const kunde = await speichereStandort({
      name: 'Werk Nord',
      gps: { lat: 51.23456, lng: 7.34567, genauigkeit: 18 },
    });

    expect(kunde).toMatchObject({
      name: 'Werk Nord',
      plz: '',
      lat: 51.23456,
      lng: 7.34567,
      geo: 'gps',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await CustomerMap.hatKunden()).toBe(true);
  });

  it('behält den bisherigen Offline-Weg über die Postleitzahl', async () => {
    const kunde = await speichereStandort({
      name: 'Werk Süd',
      plz: '45127',
      strasse: '  Industriestraße 12  ',
    });

    expect(kunde.ort).toBe('Essen');
    expect(kunde.strasse).toBe('Industriestraße 12');
    expect(kunde.geo).toBe('plz');
    expect(kunde.lat).toBeTypeOf('number');
    expect(kunde.lng).toBeTypeOf('number');
  });
});
