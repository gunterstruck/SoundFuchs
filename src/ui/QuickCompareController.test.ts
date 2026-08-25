/**
 * WANN IST DIE VERGLEICHSBASIS SELBST DER VERDÄCHTIGE?
 *
 * Der Schnellvergleich misst jede Maschine gegen die erste. Ist ausgerechnet
 * die erste auffällig, weichen alle anderen von IHR ab — und der Bildschirm
 * meldet vier kranke Maschinen statt einer schlechten Vergleichsbasis.
 *
 * Ein Prüfbericht vom 24.08.2026 hat darauf gezeigt. Die Regel dafür steht
 * seitdem als reine Funktion daneben, damit sie hier geprüft werden kann statt
 * nur auf einem Bildschirm, den man mit fünf echten Aufnahmen erreicht.
 */

import { describe, it, expect } from 'vitest';
import { basisIstVerdaechtig } from './QuickCompareController.js';

describe('basisIstVerdaechtig', () => {
  it('schweigt, wenn nur ein Teil abweicht', () => {
    // 5 geprüft (Basis + 4), davon 2 auffällig → zwei einzelne Befunde.
    expect(basisIstVerdaechtig(5, 2)).toBe(false);
    expect(basisIstVerdaechtig(5, 3)).toBe(false);
  });

  it('meldet sich, wenn ausnahmslos jede Vergleichsmaschine abweicht', () => {
    // 5 geprüft (Basis + 4), alle 4 auffällig → die gemeinsame Ursache ist
    // wahrscheinlicher als vier einzelne.
    expect(basisIstVerdaechtig(5, 4)).toBe(true);
    expect(basisIstVerdaechtig(3, 2)).toBe(true);
  });

  /**
   * Bei EINER Vergleichsmaschine wäre der Satz keine Auskunft.
   *
   * „Alle weichen ab" heißt dann „diese eine weicht ab" — dasselbe, was oben
   * schon steht, nur mit mehr Worten und dem Beigeschmack einer Erklärung.
   */
  it('schweigt bei nur einer Vergleichsmaschine', () => {
    expect(basisIstVerdaechtig(2, 1)).toBe(false);
  });

  it('schweigt, wenn gar nichts abweicht', () => {
    expect(basisIstVerdaechtig(5, 0)).toBe(false);
  });

  /** Unmögliche Eingaben dürfen nicht zu einer Behauptung führen. */
  it('bleibt bei sinnlosen Zahlen stumm', () => {
    expect(basisIstVerdaechtig(0, 0)).toBe(false);
    expect(basisIstVerdaechtig(1, 5)).toBe(false);
  });
});
