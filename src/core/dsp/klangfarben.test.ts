/**
 * Eine Farbe für eine Intensität — und ein Bild, das die Achsen nicht
 * vertauscht.
 *
 * Die Bildpunkt-Rechnung ist die Stelle, an der ein Spektrogramm still falsch
 * werden kann: Zeit und Frequenz vertauscht, oder die Frequenz auf dem Kopf.
 * Beides sieht „irgendwie richtig" aus und ist es nicht.
 */
import { describe, it, expect } from 'vitest';
import { matrixZuBildpunkten, signedColor, turboColor } from './klangfarben.js';
import type { SpectrogramMatrix } from './spectrogram.js';

function matrix(zeilen: number[][], signs?: number[]): SpectrogramMatrix {
  const rows = zeilen.length;
  const cols = zeilen[0].length;
  const bandEdgesHz = new Float32Array(cols + 1);
  for (let i = 0; i <= cols; i++) bandEdgesHz[i] = 40 * Math.pow(2, i);
  return {
    values: Float32Array.from(zeilen.flat()),
    rows,
    cols,
    durationSec: rows * 0.1,
    maxFreqHz: bandEdgesHz[cols],
    maxDb: 0,
    bandEdgesHz,
    ...(signs ? { signs: Int8Array.from(signs) } : {}),
  };
}

/** RGB eines Bildpunkts an (Spalte = Zeit, Zeile = von oben). */
function punkt(b: ReturnType<typeof matrixZuBildpunkten>, zeit: number, bildzeile: number) {
  const i = (bildzeile * b.breite + zeit) * 4;
  return [b.punkte[i], b.punkte[i + 1], b.punkte[i + 2], b.punkte[i + 3]];
}

describe('turboColor', () => {
  it('geht von dunkel nach hell', () => {
    const tief = turboColor(0);
    const hoch = turboColor(1);
    expect(tief[0] + tief[1] + tief[2]).toBeLessThan(hoch[0] + hoch[1] + hoch[2]);
  });

  it('bleibt auch außerhalb von [0,1] im Farbraum', () => {
    for (const c of [...turboColor(-1), ...turboColor(2)]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('signedColor', () => {
  it('trifft sich bei null in einem neutralen Ton', () => {
    const plus = signedColor(0, 1);
    const minus = signedColor(0, -1);
    expect(plus).toEqual(minus);
    // Neutral heißt: keine Richtung behaupten — Rot und Blau liegen gleichauf.
    expect(Math.abs(plus[0] - plus[2])).toBeLessThan(0.1);
  });

  it('wird nach oben warm und nach unten kalt', () => {
    const lauter = signedColor(1, 1);
    const leiser = signedColor(1, -1);
    expect(lauter[0]).toBeGreaterThan(lauter[2]); // mehr Rot als Blau
    expect(leiser[2]).toBeGreaterThan(leiser[0]); // mehr Blau als Rot
  });
});

describe('matrixZuBildpunkten', () => {
  it('macht Zeit zur Breite und Frequenz zur Höhe', () => {
    const b = matrixZuBildpunkten(matrix([[0, 0, 0], [0, 0, 0]])); // 2 Zeit × 3 Bänder
    expect(b.breite).toBe(2);
    expect(b.hoehe).toBe(3);
    expect(b.punkte.length).toBe(2 * 3 * 4);
  });

  it('legt das höchste Band nach OBEN', () => {
    // Band 2 (das höchste) ist laut, die anderen still.
    const b = matrixZuBildpunkten(matrix([[0, 0, 1]]));
    const oben = punkt(b, 0, 0);
    const unten = punkt(b, 0, 2);
    const hellOben = oben[0] + oben[1] + oben[2];
    const hellUnten = unten[0] + unten[1] + unten[2];
    expect(hellOben).toBeGreaterThan(hellUnten);
  });

  it('trennt zwei Zeitschritte nebeneinander', () => {
    // Erster Zeitschritt still, zweiter laut.
    const b = matrixZuBildpunkten(matrix([[0], [1]]));
    const links = punkt(b, 0, 0);
    const rechts = punkt(b, 1, 0);
    expect(links).not.toEqual(rechts);
  });

  it('nimmt den zweiseitigen Verlauf, sobald Vorzeichen dabei sind', () => {
    const ohne = matrixZuBildpunkten(matrix([[1]]));
    const mitPlus = matrixZuBildpunkten(matrix([[1]], [1]));
    const mitMinus = matrixZuBildpunkten(matrix([[1]], [-1]));
    expect(punkt(mitPlus, 0, 0)).not.toEqual(punkt(ohne, 0, 0));
    expect(punkt(mitPlus, 0, 0)).not.toEqual(punkt(mitMinus, 0, 0));
  });

  it('malt jeden Bildpunkt deckend', () => {
    const b = matrixZuBildpunkten(matrix([[0, 0.5], [1, 0.25]]));
    for (let i = 3; i < b.punkte.length; i += 4) expect(b.punkte[i]).toBe(255);
  });
});
