/** Standortanlage an einer Stelle — für Maschinenformular und eigenen Dialog. */

import { saveCustomer } from '@data/db.js';
import type { Customer } from '@data/types.js';
import { ortZurPlz, verorteUeberPlz } from './plzGeocode.js';
import type { GpsPunkt } from './deviceLocation.js';

/** Meldet allen Ansichten, dass ihre Standortauswahl neu geladen werden muss. */
export const STANDORT_GESPEICHERT = 'soundfuchs:standort-gespeichert';

export interface StandortEingabe {
  name: string;
  plz?: string;
  ort?: string;
  gps?: GpsPunkt | null;
}

/**
 * Einen Standort speichern. Der Aufrufer validiert und zeigt die passende
 * Meldung; hier wird nur garantiert, dass beide Wege dieselbe Datenform bauen.
 */
export async function speichereStandort(eingabe: StandortEingabe): Promise<Customer> {
  const name = eingabe.name.trim();
  const plz = eingabe.plz?.trim() ?? '';
  const id =
    `K-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
  const ort = eingabe.ort?.trim() || (plz ? await ortZurPlz(plz) : undefined) || undefined;
  const plzPunkt = !eingabe.gps && plz ? await verorteUeberPlz(plz, id) : null;
  const punkt = eingabe.gps ?? plzPunkt;

  const kunde: Customer = {
    id,
    name,
    plz,
    ort,
    lat: punkt?.lat,
    lng: punkt?.lng,
    geo: eingabe.gps ? 'gps' : plzPunkt ? 'plz' : 'none',
    createdAt: Date.now(),
  };
  await saveCustomer(kunde);
  return kunde;
}
