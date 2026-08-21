/**
 * ZANOBOT — EINE FARBE FÜR EINE INTENSITÄT
 *
 * Dieselben Daten dürfen nicht zweimal verschieden aussehen. Bis zum
 * 18.08.2026 gab es dafür zwei Formeln: den Turbo-Verlauf im 3D-Gebirge und
 * eine eigene, von Hand gemischte Formel im Auswahl-Spektrogramm. Zwei
 * Formeln sind zwei Aussagen darüber, was „laut" aussieht — und sie laufen
 * auseinander, sobald jemand nur eine anfasst.
 *
 * Der Anlass, es zusammenzuziehen: Auf der Maschinenseite steht jetzt ein
 * kleines Klangbild, das sich auf Tipp in das Gebirge verwandelt. Diese
 * Verwandlung ist nur dann verständlich, wenn beide dasselbe Bild sind —
 * einmal klein, einmal groß. Sähen sie verschieden aus, wäre es kein Zoom,
 * sondern ein Sprung.
 *
 * Reines Rechenmodul: kein DOM, kein WebGL, vollständig prüfbar.
 */

import type { SpectrogramMatrix } from './spectrogram.js';

/**
 * Turbo-artiger Farbverlauf (dunkelblau → türkis → gelb → rot) als
 * stückweise lineare Interpolation.
 */
export function turboColor(v: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0.0, 0.07, 0.11, 0.27], // tiefes Blau
    [0.3, 0.1, 0.5, 0.75], // Blau/Cyan
    [0.55, 0.1, 0.8, 0.45], // Grün-Türkis
    [0.75, 0.95, 0.85, 0.15], // Gelb
    [1.0, 0.85, 0.15, 0.1], // Rot
  ];
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, r0, g0, b0] = stops[i - 1];
      const [x1, r1, g1, b1] = stops[i];
      const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3]];
}

/**
 * Zweiseitiger Verlauf für den Unterschied mit Vorzeichen.
 *
 * Warm (Orange → Rot) heißt „lauter als im Normalzustand", kalt (Türkis →
 * Blau) „leiser". In der Mitte, wo sich nichts geändert hat, treffen sich
 * beide in einem neutralen Grau — sonst sähe „kein Unterschied" nach einer
 * Aussage aus.
 *
 * Nicht Turbo: Ein Regenbogen hat keine Mitte und kein Vorzeichen. Er wäre für
 * einen Unterschied die falsche Skala, egal wie hübsch er ist.
 */
export function signedColor(v: number, sign: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, v));
  const neutral: [number, number, number] = [0.42, 0.44, 0.47];
  const ziel: [number, number, number] =
    sign >= 0
      ? [0.9, 0.28, 0.12] // lauter geworden
      : [0.1, 0.52, 0.82]; // leiser geworden
  return [
    neutral[0] + (ziel[0] - neutral[0]) * x,
    neutral[1] + (ziel[1] - neutral[1]) * x,
    neutral[2] + (ziel[2] - neutral[2]) * x,
  ];
}

export interface Bildpunkte {
  /** Breite in Bildpunkten = Zeitschritte der Matrix. */
  breite: number;
  /** Höhe in Bildpunkten = Frequenzbänder der Matrix. */
  hoehe: number;
  /** RGBA, zeilenweise — direkt für `ImageData` verwendbar. */
  punkte: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Eine Spektrogramm-Matrix in ein Pixelbild verwandeln.
 *
 * Zeit läuft nach rechts, Frequenz nach oben: Bildzeile 0 ist das **höchste**
 * Band. Das ist die Konvention jedes Spektrogramms — tief unten, hoch oben —
 * und die Matrix legt ihre Bänder andersherum ab, also wird hier gespiegelt.
 *
 * Trägt die Matrix Vorzeichen (Unterschiedsansicht), kommt der zweiseitige
 * Verlauf zum Einsatz, sonst der Turbo-Verlauf. Die Entscheidung fällt hier
 * und nicht beim Aufrufer: Wer ein Bild bestellt, soll nicht auch noch wissen
 * müssen, welche Skala dazugehört.
 */
export function matrixZuBildpunkten(matrix: SpectrogramMatrix): Bildpunkte {
  const { rows, cols, values, signs } = matrix;
  const punkte = new Uint8ClampedArray(new ArrayBuffer(rows * cols * 4));

  for (let zeit = 0; zeit < rows; zeit++) {
    for (let band = 0; band < cols; band++) {
      const quelle = zeit * cols + band;
      const wert = values[quelle];
      const [r, g, b] = signs ? signedColor(wert, signs[quelle]) : turboColor(wert);
      // Bildzeile = gespiegeltes Band, Bildspalte = Zeitschritt.
      const ziel = ((cols - 1 - band) * rows + zeit) * 4;
      punkte[ziel] = Math.round(r * 255);
      punkte[ziel + 1] = Math.round(g * 255);
      punkte[ziel + 2] = Math.round(b * 255);
      punkte[ziel + 3] = 255;
    }
  }

  return { breite: rows, hoehe: cols, punkte };
}
