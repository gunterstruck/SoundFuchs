/**
 * EIN BLICK AUF DEN GANZEN BESTAND
 *
 * Karte, Nahliste und Filter fragen dasselbe: Welche Standorte gibt es, welche
 * Maschinen stehen dort, und wie geht es ihnen? Jeder für sich würde dieselben
 * Sätze aus der Datenbank holen — bei hundert Standorten mit je einem Befund je
 * Maschine sind das schnell dreihundert Lesevorgänge, dreimal.
 *
 * Deshalb einmal lesen und weiterreichen. Die Übersicht ist ein Abzug, kein
 * Zustand: Wer sie hält, hält den Stand von eben. Wer den aktuellen braucht,
 * holt sie neu — das ist billiger zu verstehen als ein Zwischenspeicher, der
 * irgendwann nicht mehr stimmt.
 */

import { getAllCustomers, getMachinesForCustomer, getLatestDiagnosis } from '@data/db.js';
import type { Customer, Machine } from '@data/types.js';

/** Der Zustand eines Standorts, abgeleitet aus seinen Maschinen. */
export type Zustand = 'gesund' | 'warnung' | 'kritisch' | 'ungeprueft';

export interface StandortStand {
  kunde: Customer;
  maschinen: Machine[];
  /** Der schlechteste Wert unter den Maschinen — oder null, wenn keine geprüft ist. */
  schlechtester: number | null;
  /**
   * Der Zustand des Standorts. Er richtet sich nach der schlechtesten Maschine,
   * nicht nach dem Durchschnitt: Eine kritische Pumpe zwischen neun gesunden
   * ist ein kritischer Standort, kein guter mit Ausreißer.
   */
  zustand: Zustand;
  /** Alle Flottengruppen, die an diesem Standort vorkommen. */
  flotten: string[];
}

export function zustandZuWert(wert: number | null): Zustand {
  if (wert === null) return 'ungeprueft';
  if (wert >= 75) return 'gesund';
  if (wert >= 50) return 'warnung';
  return 'kritisch';
}

export async function ladeBestandsuebersicht(): Promise<StandortStand[]> {
  const kunden = await getAllCustomers();

  return Promise.all(
    kunden.map(async (kunde) => {
      const maschinen = await getMachinesForCustomer(kunde.id);
      const werte = await Promise.all(
        maschinen.map(async (m) => (await getLatestDiagnosis(m.id))?.healthScore ?? null)
      );
      const gemessen = werte.filter((w): w is number => w !== null);
      const schlechtester = gemessen.length > 0 ? Math.min(...gemessen) : null;
      const flotten = [
        ...new Set(maschinen.map((m) => m.fleetGroup).filter((g): g is string => Boolean(g))),
      ].sort((a, b) => a.localeCompare(b));

      return {
        kunde,
        maschinen,
        schlechtester,
        zustand: zustandZuWert(schlechtester),
        flotten,
      };
    })
  );
}
