/**
 * Der Unterschied MIT Vorzeichen — die Richtung, die der Hörpfad nicht kann.
 *
 * Geprüft wird, was man einer Farbe sonst glauben müsste: dass „wärmer"
 * wirklich lauter heißt, dass „kälter" wirklich leiser heißt, und dass ein
 * bloßer Pegelunterschied zwischen zwei Aufnahmen NICHT als Veränderung
 * durchgeht.
 */
import { describe, it, expect } from 'vitest';
import {
  SPECTROGRAM_DB_RANGE,
  cropSpectrogramMatrix,
  type SpectrogramMatrix,
} from './spectrogram.js';
import {
  SIGNED_DB_RANGE,
  bandprofilDb,
  median,
  signedDifferenceMatrix,
} from './signedDifference.js';

/**
 * Eine Matrix aus dB-Werten bauen — so, wie `buildSpectrogramMatrix` sie
 * ablegen würde: auf [0,1] normiert über ein Fenster von SPECTROGRAM_DB_RANGE
 * unter `maxDb`.
 */
function ausDezibel(zeilenInDb: number[][], maxDb: number): SpectrogramMatrix {
  const rows = zeilenInDb.length;
  const cols = zeilenInDb[0].length;
  const values = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      values[r * cols + c] = 1 + (zeilenInDb[r][c] - maxDb) / SPECTROGRAM_DB_RANGE;
    }
  }
  const bandEdgesHz = new Float32Array(cols + 1);
  for (let i = 0; i <= cols; i++) bandEdgesHz[i] = 40 * Math.pow(2, i);
  return {
    values,
    rows,
    cols,
    durationSec: rows * 0.1,
    maxFreqHz: bandEdgesHz[cols],
    maxDb,
    bandEdgesHz,
  };
}

/** Der dB-Abstand einer Zelle, aus dem Anzeigewert zurückgerechnet. */
function abstandDb(matrix: SpectrogramMatrix, r: number, c: number): number {
  return matrix.values[r * matrix.cols + c] * SIGNED_DB_RANGE;
}

describe('median', () => {
  it('nimmt bei ungerader Anzahl die Mitte', () => {
    expect(median(Float64Array.from([3, 1, 2]))).toBe(2);
  });

  it('mittelt bei gerader Anzahl die beiden mittleren', () => {
    expect(median(Float64Array.from([4, 1, 3, 2]))).toBe(2.5);
  });

  it('ist unempfindlich gegen wenige Ausreißer', () => {
    // Genau darum geht es: Ein einzelner neuer Ton darf den Versatz nicht
    // verschieben, sonst kürzt er sich selbst weg.
    expect(median(Float64Array.from([0, 0, 0, 0, 40]))).toBe(0);
  });
});

describe('bandprofilDb', () => {
  it('mittelt über die Zeit, nicht über die Frequenz', () => {
    const m = ausDezibel(
      [
        [-10, -30],
        [-30, -30],
      ],
      0
    );
    const profil = bandprofilDb(m);
    expect(profil[0]).toBeCloseTo(-20, 5);
    expect(profil[1]).toBeCloseTo(-30, 5);
  });
});

describe('signedDifferenceMatrix', () => {
  it('meldet ein neues Band als „lauter" (+1)', () => {
    const referenz = ausDezibel([[-40, -40, -40]], 0);
    // Band 1 ist in der Messung 18 dB lauter — der Rest unverändert.
    const messung = ausDezibel(
      [
        [-40, -22, -40],
        [-40, -22, -40],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    expect(d).not.toBeNull();
    expect(d!.signs![1]).toBe(1);
    expect(abstandDb(d!, 0, 1)).toBeCloseTo(18, 0);
    // Die unveränderten Bänder bleiben flach.
    expect(abstandDb(d!, 0, 0)).toBeCloseTo(0, 5);
  });

  it('meldet ein verschwundenes Band als „leiser" (−1)', () => {
    // Das ist der Fall, den der Hörpfad wegschneidet: Der Normalzustand hat
    // etwas, das die Messung nicht mehr hat.
    const referenz = ausDezibel([[-40, -18, -40]], 0);
    const messung = ausDezibel(
      [
        [-40, -40, -40],
        [-40, -40, -40],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    expect(d!.signs![1]).toBe(-1);
    expect(abstandDb(d!, 0, 1)).toBeCloseTo(22, 0);
  });

  it('hält einen reinen Pegelunterschied für KEINE Veränderung', () => {
    // Mikrofon 6 dB näher: alles lauter, nichts anders. Ohne Versatzausgleich
    // wäre das Bild einfarbig rot und würde eine Veränderung behaupten.
    const referenz = ausDezibel([[-40, -30, -20, -35]], 0);
    const messung = ausDezibel(
      [
        [-34, -24, -14, -29],
        [-34, -24, -14, -29],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    for (let c = 0; c < d!.cols; c++) {
      expect(abstandDb(d!, 0, c)).toBeCloseTo(0, 5);
    }
  });

  it('lässt sich von einem einzelnen starken Band nicht den Versatz verbiegen', () => {
    // Drei Bänder unverändert, eines um 20 dB lauter. Der Median hält den
    // Versatz bei 0; ein Mittelwert hätte 5 dB daraus gemacht und alle drei
    // unveränderten Bänder fälschlich als „leiser" gefärbt.
    const referenz = ausDezibel([[-30, -30, -30, -30]], 0);
    const messung = ausDezibel(
      [
        [-30, -30, -30, -10],
        [-30, -30, -30, -10],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    expect(abstandDb(d!, 0, 0)).toBeCloseTo(0, 5);
    expect(abstandDb(d!, 0, 1)).toBeCloseTo(0, 5);
    expect(d!.signs![3]).toBe(1);
  });

  it('deckelt den Betrag beim sichtbaren Bereich', () => {
    const referenz = ausDezibel([[-45, -45]], 0);
    const messung = ausDezibel(
      [
        [-45, -1],
        [-45, -1],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    for (const v of d!.values) expect(v).toBeLessThanOrEqual(1);
    expect(d!.maxDb).toBeLessThanOrEqual(SIGNED_DB_RANGE);
  });

  it('nimmt Zeitachse und Zeilen von der Messung', () => {
    const referenz = ausDezibel([[-30, -30]], 0);
    const messung = ausDezibel(
      [
        [-30, -30],
        [-30, -30],
        [-30, -30],
      ],
      0
    );
    const d = signedDifferenceMatrix(referenz, messung);
    expect(d!.rows).toBe(3);
    expect(d!.durationSec).toBeCloseTo(messung.durationSec, 6);
  });

  it('sagt, dass die Höhe ein Unterschied ist und kein Pegel', () => {
    const m = ausDezibel(
      [
        [-30, -30],
        [-30, -30],
      ],
      0
    );
    expect(signedDifferenceMatrix(m, m)!.hoehe).toBe('unterschied');
  });

  it('gibt null zurück, wenn die Bandachsen nicht zusammenpassen', () => {
    const a = ausDezibel([[-30, -30]], 0);
    const b = ausDezibel(
      [
        [-30, -30, -30],
        [-30, -30, -30],
      ],
      0
    );
    expect(signedDifferenceMatrix(a, b)).toBeNull();
  });
});

describe('cropSpectrogramMatrix', () => {
  const zehnZeilen = () =>
    ausDezibel(
      Array.from({ length: 10 }, (_, r) => [-30 - r, -30]),
      0
    );

  it('schneidet auf das Fenster zu und meldet die neue Dauer', () => {
    const m = zehnZeilen(); // 10 Zeilen à 0,1 s = 1,0 s
    const k = cropSpectrogramMatrix(m, 0.5);
    expect(k.rows).toBe(5);
    expect(k.durationSec).toBeCloseTo(0.5, 6);
    expect(k.values.length).toBe(5 * m.cols);
  });

  it('behält den Anfang der Aufnahme', () => {
    const m = zehnZeilen();
    const k = cropSpectrogramMatrix(m, 0.3);
    expect(k.values[0]).toBeCloseTo(m.values[0], 6);
  });

  it('streckt nichts, was kürzer ist als das Fenster', () => {
    const m = zehnZeilen();
    const k = cropSpectrogramMatrix(m, 5);
    expect(k).toBe(m);
  });

  it('lässt Bandachse und Deckel unangetastet', () => {
    const m = zehnZeilen();
    const k = cropSpectrogramMatrix(m, 0.4);
    expect(k.cols).toBe(m.cols);
    expect(k.maxDb).toBe(m.maxDb);
    expect(k.bandEdgesHz).toBe(m.bandEdgesHz);
  });

  it('beantwortet unsinnige Fenster mit der Matrix selbst', () => {
    const m = zehnZeilen();
    expect(cropSpectrogramMatrix(m, 0)).toBe(m);
    expect(cropSpectrogramMatrix(m, Number.NaN)).toBe(m);
  });
});
