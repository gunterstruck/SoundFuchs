/**
 * Prüfungen zur Verortung über die Postleitzahl.
 *
 * Der Versatz ist der Teil, der still falsch sein kann: Wäre er zufällig,
 * wanderten die Kunden bei jedem Laden über die Karte, und niemand käme
 * darauf, dass die Ursache eine fehlende Zeile im Code ist. Deshalb wird
 * genau das geprüft — gleiche Kennung, gleiche Stelle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ortZurPlz, verorteUeberPlz } from './plzGeocode.js';

const SCHWERPUNKTE = { '45127': [51.45562, 7.01045], '10115': [52.53261, 13.3777] };
const ORTSNAMEN = {
  source: 'GeoNames German postal codes',
  license: 'CC BY 4.0',
  places: { '45127': 'Essen', '10115': 'Berlin' },
};

beforeEach(() => {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ortsname zur Postleitzahl', () => {
  it('findet den Ort', async () => {
    await expect(ortZurPlz('45127')).resolves.toBe('Essen');
  });

  it('verträgt Leerzeichen drumherum', async () => {
    await expect(ortZurPlz('  10115 ')).resolves.toBe('Berlin');
  });

  it('gibt null für eine unbekannte Postleitzahl', async () => {
    await expect(ortZurPlz('99999')).resolves.toBeNull();
  });

  it('lehnt ab, was keine fünfstellige Zahl ist', async () => {
    await expect(ortZurPlz('4512')).resolves.toBeNull();
    await expect(ortZurPlz('D-45127')).resolves.toBeNull();
    await expect(ortZurPlz('')).resolves.toBeNull();
  });
});

describe('Verortung über die Postleitzahl', () => {
  it('legt den Kunden in die Nähe des Schwerpunkts', async () => {
    const ort = await verorteUeberPlz('45127', 'kunde-1');
    expect(ort).not.toBeNull();
    // Der Versatz liegt bei etwa ±500 m — in Grad also deutlich unter 0,01.
    expect(Math.abs(ort!.lat - 51.45562)).toBeLessThan(0.01);
    expect(Math.abs(ort!.lng - 7.01045)).toBeLessThan(0.01);
    expect(ort!.genauigkeit).toBe('plz');
  });

  it('legt denselben Kunden immer an dieselbe Stelle', async () => {
    const a = await verorteUeberPlz('45127', 'kunde-1');
    const b = await verorteUeberPlz('45127', 'kunde-1');
    expect(a).toEqual(b);
  });

  it('trennt zwei Kunden derselben Postleitzahl', async () => {
    const a = await verorteUeberPlz('45127', 'kunde-1');
    const b = await verorteUeberPlz('45127', 'kunde-2');
    expect(a!.lat === b!.lat && a!.lng === b!.lng).toBe(false);
  });

  it('gibt null für eine unbekannte Postleitzahl', async () => {
    await expect(verorteUeberPlz('99999', 'kunde-1')).resolves.toBeNull();
  });
});
