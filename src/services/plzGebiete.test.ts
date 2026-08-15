/**
 * Prüfungen zu den Postleitzahlgebieten.
 *
 * Zwei Dinge, die still falsch sein könnten und die man auf einer Karte nicht
 * ansieht:
 *
 * Die Verkürzung der Postleitzahl auf den Gebietsschlüssel — „45127" gehört
 * bei einstelligen Gebieten zu „4", bei zweistelligen zu „45". Verrutscht das
 * um eine Stelle, färbt die Karte konsequent das falsche Gebiet ein, und zwar
 * so plausibel, dass es niemandem auffällt.
 *
 * Und die Füllstärke: Sie ist bewusst nicht linear. Wäre sie es, verschwände
 * bei einem Gebiet mit 40 Maschinen jedes andere fast vollständig.
 */
import { describe, it, expect } from 'vitest';
import { stufeZuZoom, zaehleJeGebiet, fuellstaerke, GEBIETSSTUFEN } from './plzGebiete.js';

describe('Gebietsstufe zum Zoom', () => {
  it('zeigt weit draußen die groben Gebiete', () => {
    expect(stufeZuZoom(5)).toBe('plz1');
    expect(stufeZuZoom(6.9)).toBe('plz1');
  });

  it('wechselt beim Hineinzoomen auf die feineren', () => {
    expect(stufeZuZoom(7)).toBe('plz2');
    expect(stufeZuZoom(11)).toBe('plz2');
  });

  it('führt die grobe Stufe ohne Untergrenze', () => {
    // plz1 muss bei jedem Zoom greifen können — sonst bliebe die Karte beim
    // Herauszoomen ohne Flächen.
    expect(GEBIETSSTUFEN.plz1.abZoom).toBe(0);
  });
});

describe('Maschinen je Gebiet', () => {
  it('fasst einstellig zusammen', () => {
    const zaehler = zaehleJeGebiet(['45127', '45128', '10115'], 'plz1');
    expect(zaehler.get('4')).toBe(2);
    expect(zaehler.get('1')).toBe(1);
  });

  it('fasst zweistellig zusammen', () => {
    const zaehler = zaehleJeGebiet(['45127', '45128', '48000', '10115'], 'plz2');
    expect(zaehler.get('45')).toBe(2);
    expect(zaehler.get('48')).toBe(1);
    expect(zaehler.get('10')).toBe(1);
  });

  it('übergeht, was keine fünfstellige Postleitzahl ist', () => {
    const zaehler = zaehleJeGebiet(['45127', '451', '', 'abcde'], 'plz1');
    expect(zaehler.get('4')).toBe(1);
    expect(zaehler.size).toBe(1);
  });

  it('behält die führende Null', () => {
    // Ostdeutsche Postleitzahlen beginnen mit 0. Würde irgendwo eine Zahl
    // statt einer Zeichenkette benutzt, fiele die Null weg und das Gebiet
    // „0" träfe nie zu.
    const zaehler = zaehleJeGebiet(['01067', '04109'], 'plz1');
    expect(zaehler.get('0')).toBe(2);
  });
});

describe('Füllstärke', () => {
  it('lässt ein leeres Gebiet ungefüllt', () => {
    expect(fuellstaerke(0, 40)).toBe(0);
  });

  it('gibt schon einer einzelnen Maschine eine sichtbare Färbung', () => {
    expect(fuellstaerke(1, 40)).toBeGreaterThan(0.1);
  });

  it('steigt', () => {
    expect(fuellstaerke(10, 40)).toBeGreaterThan(fuellstaerke(1, 40));
    expect(fuellstaerke(40, 40)).toBeGreaterThan(fuellstaerke(10, 40));
  });

  it('gewinnt mit jeder weiteren Maschine weniger dazu', () => {
    // Das ist der Sinn der Wurzel, und es muss bei GLEICH GROSSEN Schritten
    // geprüft werden: Die erste Maschine in einem Gebiet verändert das Bild
    // deutlich, die vierzigste kaum noch. (Ein Vergleich „1→10 gegen 10→40"
    // misst das nicht — dort sind die Schritte 9 und 30 Maschinen breit.)
    const ersterSchritt = fuellstaerke(2, 40) - fuellstaerke(1, 40);
    const letzterSchritt = fuellstaerke(40, 40) - fuellstaerke(39, 40);
    expect(ersterSchritt).toBeGreaterThan(letzterSchritt);
  });

  it('liegt über einer geraden Linie — sonst bliebe die Mitte fast leer', () => {
    // Bei linearer Färbung hätte ein Gebiet mit einem Viertel der Maschinen
    // auch nur ein Viertel der Stärke und wäre praktisch unsichtbar.
    const viertel = fuellstaerke(10, 40);
    const gerade = 0.12 + 0.25 * 0.45;
    expect(viertel).toBeGreaterThan(gerade);
  });

  it('bleibt in einem Bereich, der die Karte nicht zudeckt', () => {
    expect(fuellstaerke(40, 40)).toBeLessThanOrEqual(0.6);
  });
});
