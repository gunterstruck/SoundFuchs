/**
 * DIE SUCHE, AN DEN FÄLLEN AUS DEM BILDSCHIRMFOTO
 *
 * Der Auftraggeber am 24.08.2026: „brau" im Feld, nichts passiert. Gemessen an
 * den Beispieldaten fand die Suche damals Standorte grundsätzlich nicht — sie
 * las nur `getAllMachines()`.
 *
 * Diese Fälle stehen hier, damit die Regel widerlegbar ist, ohne hundert
 * Standorte in einer Datenbank anzulegen.
 */

import { describe, it, expect } from 'vitest';
import { sucheTreffer } from './sucheTreffer.js';
import type { Customer, Machine } from '@data/types.js';

const kunde = (name: string, plz: string, ort: string, strasse?: string): Customer => ({
  id: `k-${name}`,
  name,
  plz,
  ort,
  strasse,
  geo: 'plz',
  createdAt: 0,
});

const maschine = (id: string, name: string, location?: string): Machine =>
  ({ id, name, createdAt: 0, referenceModels: [], location }) as Machine;

const KUNDEN = [
  kunde('SoundFuchs Demo · Brauerei 0005', '28195', 'Bremen', 'Am Hafen 12'),
  kunde('SoundFuchs Demo · Gießerei 0001', '25729', 'Windbergen'),
];
const MASCHINEN = [
  maschine('demo-m-28', 'Extruder 2'),
  maschine('demo-m-80-0', 'Kompressor 1'),
  maschine('qc-1', 'Rührwerk 1', 'Halle Nord'),
];

describe('sucheTreffer', () => {
  it('findet den Standort über seinen Namen — der gemeldete Fall', () => {
    const t = sucheTreffer('brau', KUNDEN, MASCHINEN);
    expect(t).toHaveLength(1);
    expect(t[0].art).toBe('standort');
    expect(t[0].titel).toContain('Brauerei');
  });

  it('findet den Standort über den Ort', () => {
    const t = sucheTreffer('bremen', KUNDEN, MASCHINEN);
    expect(t.map((x) => x.art)).toEqual(['standort']);
  });

  it('findet den Standort über die Postleitzahl', () => {
    const t = sucheTreffer('28195', KUNDEN, MASCHINEN);
    expect(t).toHaveLength(1);
    expect(t[0].zusatz).toContain('28195');
  });

  it('findet und beschreibt den Standort über seine Straßenadresse', () => {
    const t = sucheTreffer('hafen', KUNDEN, MASCHINEN);
    expect(t).toHaveLength(1);
    expect(t[0].zusatz).toBe('Am Hafen 12 · 28195 Bremen');
  });

  it('findet Maschinen über ihren Namen', () => {
    const t = sucheTreffer('kompressor', KUNDEN, MASCHINEN);
    expect(t.map((x) => x.titel)).toEqual(['Kompressor 1']);
  });

  it('findet Maschinen über ihren Standortvermerk', () => {
    const t = sucheTreffer('halle', KUNDEN, MASCHINEN);
    expect(t.map((x) => x.titel)).toEqual(['Rührwerk 1']);
  });

  /**
   * DER FALL, DER VORHER FALSCH WAR.
   *
   * „28" ist der Anfang einer Postleitzahl. Vorher traf es zusätzlich die
   * interne Kennung `demo-m-28` — und der Nutzer bekam auf eine Ortsfrage eine
   * Maschine, die nichts damit zu tun hat. Kennungen zählen jetzt nur von vorn.
   */
  it('trifft mit einer Postleitzahl keine interne Kennung', () => {
    const t = sucheTreffer('28', KUNDEN, MASCHINEN);
    expect(t.every((x) => x.art === 'standort')).toBe(true);
  });

  it('findet eine Maschine über den Anfang ihrer Kennung', () => {
    const t = sucheTreffer('demo-m-28', KUNDEN, MASCHINEN);
    expect(t.map((x) => x.titel)).toEqual(['Extruder 2']);
  });

  it('stellt Standorte vor Maschinen', () => {
    const gemischt = sucheTreffer('demo', KUNDEN, MASCHINEN);
    const ersteMaschine = gemischt.findIndex((x) => x.art === 'maschine');
    const letzterStandort = gemischt.map((x) => x.art).lastIndexOf('standort');
    if (ersteMaschine >= 0 && letzterStandort >= 0) {
      expect(letzterStandort).toBeLessThan(ersteMaschine);
    }
  });

  it('schweigt unter der Mindestlänge', () => {
    expect(sucheTreffer('b', KUNDEN, MASCHINEN)).toEqual([]);
    expect(sucheTreffer('', KUNDEN, MASCHINEN)).toEqual([]);
  });

  it('hält sich an die Obergrenze', () => {
    const viele = Array.from({ length: 30 }, (_, i) => maschine(`m${i}`, `Pumpe ${i}`));
    expect(sucheTreffer('pumpe', [], viele, 8)).toHaveLength(8);
  });
});
