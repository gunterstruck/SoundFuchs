/**
 * DER FILTER — Zustand · Standort · Flottengruppe
 *
 * Der Reiter „Filter" von TourFuchs verkleinert die Menge, die auf der Karte
 * liegt; alles Weitere arbeitet dann auf dieser kleineren Menge weiter (dort
 * `customersOnMap()`). Genau dieselbe Rolle hat er hier: Er filtert die Karte
 * und die Nahliste, die auf ihr sitzt.
 *
 * Ausdrücklich NICHT gefiltert wird die Maschinenliste im Reiter „Daten". Das
 * ist keine Auslassung, sondern die Trennung, die dieser Umbau überall zieht:
 * „Daten" ist der Bestand, vollständig und nachschlagbar; die Karte ist die
 * Arbeitsfläche, auf der man einengt. Wer im Bestand sucht, hat oben die Suche.
 */

import { logger } from '@utils/logger.js';
import type { StandortStand, Zustand } from '../../services/bestandsuebersicht.js';

export const FILTER_EVENT = 'zanobot:filter-change';

export interface Filterstand {
  /** Leer = alle Zustände. */
  zustand: Zustand | '';
  /** Leer = alle Standorte. */
  standortId: string;
  /** Leer = alle Flotten. */
  flotte: string;
}

const LEER: Filterstand = { zustand: '', standortId: '', flotte: '' };

let stand: Filterstand = { ...LEER };

export function filterstand(): Filterstand {
  return { ...stand };
}

export function istGefiltert(): boolean {
  return stand.zustand !== '' || stand.standortId !== '' || stand.flotte !== '';
}

export function setzeFilter(teil: Partial<Filterstand>): void {
  stand = { ...stand, ...teil };
  document.dispatchEvent(new CustomEvent<Filterstand>(FILTER_EVENT, { detail: { ...stand } }));
  logger.debug(`Filter: ${JSON.stringify(stand)}`);
}

export function leereFilter(): void {
  setzeFilter({ ...LEER });
}

/** Passt ein Standort durch den Filter? */
export function passt(eintrag: StandortStand): boolean {
  if (stand.zustand && eintrag.zustand !== stand.zustand) return false;
  if (stand.standortId && eintrag.kunde.id !== stand.standortId) return false;
  if (stand.flotte && !eintrag.flotten.includes(stand.flotte)) return false;
  return true;
}
