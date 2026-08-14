/**
 * Prüfungen zu den Kartengründen.
 *
 * Zwei Dinge werden festgehalten, die still verloren gehen könnten.
 *
 * Erstens die Quellenangabe. Sie ist keine Höflichkeit, sondern die Bedingung,
 * unter der die Kacheln benutzt werden dürfen. Fiele sie beim Aufräumen aus
 * einem der drei Einträge heraus, sähe man das nirgends — die Karte zeichnete
 * weiter, nur eben unzulässig.
 *
 * Zweitens die gemerkte Wahl. Ein unbekannter Wert im Speicher (alte Version,
 * fremder Eintrag) darf nicht dazu führen, dass die Karte grau bleibt.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { KACHELGRUENDE, KARTENSICHT, gemerkterKachelgrund, merkeKachelgrund } from './mapTiles.js';

/** Ein sehr kleiner localStorage-Ersatz — der Node-Lauf hat keinen. */
function speicherStellen(): void {
  const ablage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe('Kartengründe', () => {
  it('kennt genau die drei Varianten von TourFuchs', () => {
    expect(Object.keys(KACHELGRUENDE).sort()).toEqual(['light', 'satellite', 'standard']);
  });

  it('führt zu jedem Grund eine Quellenangabe', () => {
    for (const grund of Object.values(KACHELGRUENDE)) {
      expect(grund.attribution.trim().length).toBeGreaterThan(10);
    }
  });

  it('nennt die Urheber beim Namen', () => {
    expect(KACHELGRUENDE.light.attribution).toContain('OpenStreetMap');
    expect(KACHELGRUENDE.light.attribution).toContain('CARTO');
    expect(KACHELGRUENDE.standard.attribution).toContain('OpenStreetMap');
    expect(KACHELGRUENDE.satellite.attribution).toContain('Esri');
  });

  it('lädt Kacheln nur über HTTPS', () => {
    for (const grund of Object.values(KACHELGRUENDE)) {
      expect(grund.url.startsWith('https://')).toBe(true);
    }
  });

  it('hält den Ausschnitt innerhalb der eigenen Grenzen', () => {
    const [[sued, west], [nord, ost]] = KARTENSICHT.grenzen;
    const [lat, lng] = KARTENSICHT.mitte;
    expect(lat).toBeGreaterThan(sued);
    expect(lat).toBeLessThan(nord);
    expect(lng).toBeGreaterThan(west);
    expect(lng).toBeLessThan(ost);
    expect(KARTENSICHT.zoom).toBeGreaterThanOrEqual(KARTENSICHT.minZoom);
  });
});

describe('gemerkter Kartengrund', () => {
  beforeEach(() => speicherStellen());

  it('beginnt bei Hell', () => {
    expect(gemerkterKachelgrund()).toBe('light');
  });

  it('merkt sich die Wahl', () => {
    merkeKachelgrund('satellite');
    expect(gemerkterKachelgrund()).toBe('satellite');
  });

  it('fällt bei einem unbekannten Eintrag auf Hell zurück', () => {
    localStorage.setItem('soundfuchs.kartengrund', 'mondkarte');
    expect(gemerkterKachelgrund()).toBe('light');
  });
});
