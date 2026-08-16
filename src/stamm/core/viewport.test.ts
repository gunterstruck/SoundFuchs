/**
 * Die eine Definition von „mobil" – und das Tor gegen eine fünfte.
 *
 * **Stamm.** Übernommen aus TourFuchs `tests/viewport.test.js` (Stand
 * `19b3951`), nach Vitest/TypeScript geschrieben. Die Geräteliste ist
 * unverändert; die Quellenliste des Tors nennt SoundFuchs' eigene Module.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  faceFor,
  PHONE_FACE_MEDIA,
  DESKTOP_FACE_MEDIA,
  PHONE_MAX_WIDTH,
  TABLET_MAX_WIDTH,
  type Gesicht,
} from './viewport.js';

const lies = (datei: string): string => readFileSync(resolve(process.cwd(), datei), 'utf8');

/** Echte Geräte in CSS-Pixeln. */
const GERAETE: Array<[string, number, number, Gesicht]> = [
  ['iPhone 15 hochkant', 393, 852, 'phone'],
  ['iPhone 15 quer', 852, 393, 'phone'], // zu flach für den Schreibtisch
  ['iPad mini hochkant', 744, 1133, 'phone'],
  ['iPad mini quer', 1133, 744, 'desktop'],
  ['Galaxy Tab S6 Lite hochkant', 800, 1333, 'phone'],
  ['Galaxy Tab S6 Lite quer', 1333, 800, 'desktop'],
  ['iPad 11" hochkant', 834, 1194, 'phone'],
  ['iPad 11" quer', 1194, 834, 'desktop'],
  ['iPad 12,9" hochkant', 1024, 1366, 'phone'],
  ['iPad 12,9" quer', 1366, 1024, 'desktop'],
  ['Laptop', 1440, 900, 'desktop'],
  ['Monitor hochkant', 1440, 2560, 'desktop'], // über der Tablet-Grenze
];

/** Die Fenster, die der Auftrag ausdrücklich nennt. */
const ABNAHME: Array<[number, number, Gesicht]> = [
  [390, 844, 'phone'],
  [820, 1180, 'phone'],
  [834, 1194, 'phone'],
  [1024, 1366, 'phone'],
  [1180, 820, 'desktop'],
  [1194, 834, 'desktop'],
  [1440, 900, 'desktop'],
  [900, 520, 'phone'],
  [901, 521, 'desktop'],
];

describe('Viewport – zwei Gesichter', () => {
  it.each(GERAETE)('%s (%ix%i) ist %s', (_name, width, height, erwartet) => {
    expect(faceFor({ width, height })).toBe(erwartet);
  });

  it.each(ABNAHME)('%ix%i ist %s (Abnahmeliste)', (width, height, erwartet) => {
    expect(faceFor({ width, height })).toBe(erwartet);
  });

  it('macht aus derselben Haltung dasselbe Produkt', () => {
    // Der eigentliche Defekt vor Version 3.2: Hochkant war nicht gleich
    // hochkant. 744 px ergab ein sauberes Handy, 800 px einen Zwitter,
    // 1024 px noch mehr davon – dieselbe Haltung, drei Produkte.
    const hochkant = [744, 800, 834, 1024, 1200].map((width) =>
      faceFor({ width, height: width + 300 })
    );
    expect(new Set(hochkant)).toEqual(new Set(['phone']));
  });

  it('respektiert die ausdrückliche Orientierung vor dem Seitenverhältnis', () => {
    expect(faceFor({ width: 1000, height: 1400, portrait: false })).toBe('desktop');
    expect(faceFor({ width: 1000, height: 800, portrait: true })).toBe('phone');
  });

  it('hält die beiden Grenzen genau ein', () => {
    expect(faceFor({ width: PHONE_MAX_WIDTH, height: 400 })).toBe('phone');
    // Höhe 400 wäre ein flaches Querformat und damit ohnehin Touransicht –
    // die Breitengrenze prüft sich nur an einem hohen genug Fenster.
    expect(faceFor({ width: PHONE_MAX_WIDTH + 1, height: 700, portrait: false })).toBe('desktop');
    expect(faceFor({ width: TABLET_MAX_WIDTH, portrait: true })).toBe('phone');
    expect(faceFor({ width: TABLET_MAX_WIDTH + 1, portrait: true })).toBe('desktop');
  });

  it('fällt ohne brauchbare Angaben auf den Schreibtisch zurück', () => {
    expect(faceFor()).toBe('desktop');
    expect(faceFor({ width: Number.NaN })).toBe('desktop');
    expect(faceFor({ width: undefined, height: 800 })).toBe('desktop');
  });
});

describe('Tor: keine fünfte Definition von „mobil"', () => {
  /**
   * Die Module, die eine Gesichtsfrage stellen könnten.
   *
   * Der Stamm listet hier seine eigenen; das sind SoundFuchs'. Wer ein neues
   * Modul anlegt, das die Oberfläche nach Größe unterscheidet, gehört in
   * diese Liste — sonst bewacht sie nur noch die Vergangenheit.
   */
  const QUELLEN = [
    'src/stamm/ui/schale.ts',
    'src/stamm/ui/scharnier.ts',
    'src/stamm/ui/standortansicht.ts',
    'src/stamm/ui/beispieldaten.ts',
    'src/stamm/features/standortmarker.ts',
    'src/ui/components/CustomerMap.ts',
    'src/main.ts',
  ];

  it.each(QUELLEN)('%s definiert keine eigene Breitenschwelle', (datei) => {
    const quelle = lies(datei);
    // Genau die Schwellen, aus denen der Zwitter entstanden ist.
    expect(quelle).not.toMatch(/matchMedia\(\s*['"`]\(max-width: (768|900|1200)px\)/);
    expect(quelle).not.toMatch(/matchMedia\(\s*['"`]\(min-width: (769|901|1201)px\)/);
    expect(quelle).not.toMatch(/innerWidth\s*[<>]=?\s*(768|769|900|901|1200|1201)\b/);
    // Und keine zweite Auswertung der Haltung.
    expect(quelle).not.toMatch(/matchMedia\([^)]*orientation/);
    expect(quelle).not.toMatch(/screen\.orientation\.(type|angle)/);
  });

  it('hält die Grenze an genau einer Stelle', () => {
    const viewport = lies('src/stamm/core/viewport.ts');
    expect(viewport).toContain('PHONE_FACE_MEDIA');
    expect(viewport).toContain('DESKTOP_FACE_MEDIA');
    // Drei Teilbedingungen je Liste, nicht mehr: Handy, Tablet hochkant,
    // flaches Quer — und ihre Verneinung.
    expect(PHONE_FACE_MEDIA.split(',')).toHaveLength(3);
    expect(DESKTOP_FACE_MEDIA.split(',')).toHaveLength(3);
  });

  it('bindet das CSS wortgleich an dieselben Zeichenketten', () => {
    const css = lies('src/styles/stamm/responsive.css');
    for (const liste of [PHONE_FACE_MEDIA, DESKTOP_FACE_MEDIA]) {
      for (const teil of liste.split(',').map((s) => s.trim())) {
        expect(css).toContain(teil);
      }
    }
  });
});
