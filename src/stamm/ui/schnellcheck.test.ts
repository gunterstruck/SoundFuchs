/**
 * Der Name, den ein mitgebrachtes Geräusch bekommt.
 *
 * Die Ausschnitte selbst lassen sich ohne Browser nicht prüfen — sie brauchen
 * Web-Audio und eine Datenbank. Die Namensbildung nicht: Sie ist reines
 * Rechnen auf einer Zeichenkette, und sie ist die eine Stelle, an der ein
 * Dateiname aus der Welt in die Ablage der App gerät.
 */

import { describe, it, expect } from 'vitest';
import { nameAusDatei } from './schnellcheck.js';

describe('nameAusDatei', () => {
  it('nimmt die Endung weg', () => {
    expect(nameAusDatei('motorhaube.mp4')).toBe('motorhaube');
    expect(nameAusDatei('geraeusch.wav')).toBe('geraeusch');
  });

  it('macht aus Unterstrichen Leerzeichen', () => {
    // Genau der Fall des Auftraggebers: 9b3ad0df-20260822_155244.mp4
    expect(nameAusDatei('9b3ad0df-20260822_155244.mp4')).toBe('9b3ad0df-20260822 155244');
  });

  it('lässt einen Namen ohne Endung in Ruhe', () => {
    expect(nameAusDatei('Waschmaschine')).toBe('Waschmaschine');
  });

  it('hält einen Punkt im Namen für einen Punkt, nicht für eine Endung', () => {
    // „Motor 2.5 Liter" hat keine Endung — „5 Liter" ist keine.
    expect(nameAusDatei('Motor 2.5 Liter')).toBe('Motor 2.5 Liter');
  });

  it('kürzt lange Namen und sagt das mit einem Zeichen', () => {
    const lang = 'A'.repeat(80) + '.mp4';
    const kurz = nameAusDatei(lang);
    expect(kurz.length).toBeLessThanOrEqual(40);
    expect(kurz.endsWith('…')).toBe(true);
  });

  it('gibt nichts zurück, wenn nichts übrig bleibt', () => {
    // Dann entscheidet der Aufrufer — er hat einen Ersatznamen.
    expect(nameAusDatei('.mp4')).toBe('');
    expect(nameAusDatei('   ')).toBe('');
    expect(nameAusDatei('___.wav')).toBe('');
  });

  it('lässt keine doppelten Leerzeichen stehen', () => {
    expect(nameAusDatei('Pumpe___Halle  3.m4a')).toBe('Pumpe Halle 3');
  });
});
