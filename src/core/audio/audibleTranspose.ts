/**
 * ZANOBOT — TRANSPOSITION AUF DEN HÖRBAREN BEREICH
 *
 * „Hör den Unterschied" — Schritt 2c. Die Zeitlupe (`slowListen`) hatte bisher
 * willkürliche Faktoren (0,5 / 1 / 2). Dieses Modul leitet den Faktor stattdessen
 * AUS DER MESSUNG ab: Es sucht die Frequenz, bei der sich Messung und Referenz am
 * stärksten unterscheiden, und zieht genau diese Stelle in den Bereich, in dem
 * das menschliche Ohr am besten auflöst.
 *
 * Warum ~3 kHz als Ziel:
 *  - Das Gehör ist dort am empfindlichsten (Gehörgangsresonanz; das Minimum der
 *    Hörschwelle nach ISO 226 liegt bei ≈3,5 kHz).
 *  - Handylautsprecher geben diesen Bereich sauber wieder. Unter ~500 Hz und über
 *    ~10 kHz brechen die kleinen Treiber weg — eine Transposition auf 12 kHz
 *    wäre auf dem Gerät, mit dem gemessen wurde, halb unhörbar.
 *
 * Warum Resampling (`playbackRate`) und kein Pitch-Shift:
 *  Der Zweck ist, TRANSIENTEN hörbar zu machen — ein Klopfen, ein Klacken, eine
 *  Rhythmik, die im Kontinuierlichen untergeht. Resampling lässt die Attack-Flanke
 *  exakt erhalten (es dehnt sie nur), ein Phase-Vocoder verschmiert sie und nimmt
 *  dem Geräusch genau den Charakter, um den es geht. Der Preis ist bekannt und
 *  gewollt: Tonhöhe und Tempo bewegen sich gemeinsam, der Rhythmus wird also
 *  mitverlangsamt.
 *
 *  Deshalb ist der Faktor NACH UNTEN BEGRENZT: unterhalb von MIN_FACTOR wird ein
 *  Takt so weit gestreckt, dass er als Rhythmus nicht mehr wahrnehmbar ist —
 *  einzelne Ereignisse statt eines Musters. Dann wird die Zielfrequenz bewusst
 *  NICHT erreicht; lieber eine hörbare Rhythmik als eine perfekte Tonhöhe.
 *
 * Die Peak-SUCHE lag zuerst hier (auf den 512 gespeicherten Bändern, also im
 * 46,875-Hz-Raster) und ist nach `core/dsp/fineSpectrogram.peakFrequencyFine`
 * gewandert: dort wird sie auf 2,93 Hz genau bestimmt. Ein 16-faches Raster war
 * zu grob für eine Größe, aus der der Faktor unmittelbar folgt.
 *
 * Reine Rechenfunktionen, kein DOM, kein Audio-Kontext.
 */

/** Zielfrequenz der Transposition (Hz) — siehe Modulkopf. */
export const AUDIBLE_TARGET_HZ = 3000;

/**
 * Langsamster erlaubter Faktor. 0,25 entspricht zwei Oktaven abwärts und
 * vierfacher Dauer: ein Takt von 120/min wird zu 30/min — knapp oberhalb der
 * Grenze, an der das Ohr noch ein Muster statt einzelner Ereignisse hört.
 */
export const MIN_FACTOR = 0.25;

/** Schnellster erlaubter Faktor (aufwärts für sehr tieffrequente Unterschiede). */
export const MAX_FACTOR = 2;

export interface TransposePlan {
  /** Frequenz der größten Auffälligkeit (Hz). */
  peakHz: number;
  /** Faktor für `playbackRate` — < 1 langsamer/tiefer, > 1 schneller/höher. */
  factor: number;
  /** Frequenz, auf der der Peak nach der Transposition tatsächlich landet (Hz). */
  resultHz: number;
  /**
   * True, wenn die Zielfrequenz NICHT erreicht wurde, weil der Faktor begrenzt
   * werden musste. Die UI sagt das, statt eine Präzision zu behaupten, die
   * nicht da ist.
   */
  clamped: boolean;
}

/**
 * Plan für die Transposition: welcher Faktor bringt `peakHz` möglichst nah an
 * `targetHz`, ohne die Faktor-Grenzen zu verlassen?
 *
 * @throws bei nicht-positiven Frequenzen — das wäre ein Programmierfehler.
 */
export function planTranspose(
  peakHz: number,
  targetHz: number = AUDIBLE_TARGET_HZ
): TransposePlan {
  if (!(peakHz > 0) || !(targetHz > 0)) {
    throw new Error(`planTranspose: Frequenzen müssen > 0 sein (peak=${peakHz}, ziel=${targetHz}).`);
  }
  const ideal = targetHz / peakHz;
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, ideal));
  return {
    peakHz,
    factor,
    resultHz: peakHz * factor,
    clamped: factor !== ideal,
  };
}
