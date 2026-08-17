/**
 * Die Regel, um die es geht: pro Zustand genau eine dominante Handlung.
 *
 * Das ist der Grund, warum die Zustandsmaschine ein Wert ist und keine Folge
 * von `style.display`-Schaltungen: Man kann sie durchgehen. Ein Test kann
 * fragen „gilt das für JEDEN Zustand", und die Antwort ist nicht „bei den
 * dreien, die ich angeklickt habe".
 */

import { describe, it, expect } from 'vitest';
import {
  ZUSTAENDE,
  zustandAus,
  handlungFuer,
  darfZurueck,
  istErgebnis,
  nimmtAuf,
  AEHNLICH_AB,
  type Maschinenzustand,
} from './zustand.js';

describe('Der Zustand ergibt sich aus der Lage', () => {
  it('ohne Normalzustand: untrained', () => {
    expect(zustandAus({ hatNormalzustand: false })).toBe('untrained');
  });

  it('mit Normalzustand: ready — der Alltagsfall', () => {
    expect(zustandAus({ hatNormalzustand: true })).toBe('ready');
  });

  it('öffnet sich nicht in einem Ergebnis von vorgestern', () => {
    // `ergebnis` meint das Ergebnis DIESER Sitzung. Ein Wert aus der Datenbank
    // gehört in den Kopf der Ebene („zuletzt 94 %"), nicht in den Zustand —
    // sonst landete man beim Öffnen in einer Ergebnisansicht, ohne gemessen
    // zu haben.
    expect(zustandAus({ hatNormalzustand: true, ergebnis: null })).toBe('ready');
    expect(zustandAus({ hatNormalzustand: true, ergebnis: undefined })).toBe('ready');
  });

  it('teilt das Ergebnis an derselben Schwelle wie der Bestand', () => {
    expect(zustandAus({ hatNormalzustand: true, ergebnis: AEHNLICH_AB })).toBe('result-similar');
    expect(zustandAus({ hatNormalzustand: true, ergebnis: AEHNLICH_AB - 1 })).toBe(
      'result-deviating'
    );
    // Zwei Schwellen für dieselbe Frage wären zwei Antworten: Die Karte zeigte
    // grün, wo die Maschinenebene „anders" sagt.
    expect(AEHNLICH_AB).toBe(75);
  });

  it('stellt das Blockierende vor alles andere', () => {
    // Ohne Mikrofon geht beides nicht — die Frage nach dem Normalzustand ist
    // dann zweitrangig.
    expect(zustandAus({ hatNormalzustand: false, mikrofonAbgelehnt: true })).toBe(
      'permission-blocked'
    );
    expect(
      zustandAus({ hatNormalzustand: true, mikrofonAbgelehnt: true, ergebnis: 90 })
    ).toBe('permission-blocked');
  });

  it('zeigt, was läuft, vor dem, was war', () => {
    expect(zustandAus({ hatNormalzustand: true, nimmtAuf: 'pruefung', ergebnis: 90 })).toBe(
      'capturing-check'
    );
    expect(zustandAus({ hatNormalzustand: false, nimmtAuf: 'referenz' })).toBe(
      'capturing-reference'
    );
    expect(zustandAus({ hatNormalzustand: true, rechnet: true, ergebnis: 90 })).toBe('processing');
  });

  it('führt eine untaugliche Aufnahme nicht als Ergebnis', () => {
    expect(
      zustandAus({ hatNormalzustand: true, aufnahmeUntauglich: true, ergebnis: 40 })
    ).toBe('quality-insufficient');
  });
});

describe('Pro Zustand genau eine dominante Handlung', () => {
  it.each(ZUSTAENDE)('%s hat genau eine', (zustand) => {
    const h = handlungFuer(zustand);
    expect(h.schluessel).toMatch(/^maschine\./);
    expect(['weiter', 'abbruch', 'beheben']).toContain(h.art);
  });

  it('gibt jedem Zustand eine eigene Handlung, wo er eine eigene braucht', () => {
    // Aufnehmen ist in beiden Aufnahmezuständen dasselbe („Stoppen") — sonst
    // stünde im selben Bild einmal „Stoppen" und einmal etwas anderes für
    // denselben Vorgang.
    const eigene = new Set(ZUSTAENDE.map((z) => handlungFuer(z).schluessel));
    expect(eigene.size).toBe(ZUSTAENDE.length - 1);
    expect(handlungFuer('capturing-reference')).toEqual(handlungFuer('capturing-check'));
  });

  it('macht aus dem Ergebnis mit Abweichung den Weg zum Hören', () => {
    // Der Wow-Moment: Bei einer Abweichung ist der hörbare Unterschied das
    // Ziel, nicht die Zahl daneben.
    expect(handlungFuer('result-deviating').schluessel).toBe('maschine.aktionUnterschied');
    expect(handlungFuer('result-deviating').art).toBe('weiter');
  });

  it('macht „Stoppen" zum Notausgang, nicht zum Ziel', () => {
    expect(handlungFuer('capturing-check').art).toBe('abbruch');
  });

  it('bietet aus jeder Sackgasse einen Weg heraus', () => {
    for (const z of ['permission-blocked', 'quality-insufficient', 'offline'] as const) {
      expect(handlungFuer(z).art).toBe('beheben');
    }
  });
});

describe('Der Rückweg', () => {
  it('steht überall außer während einer Aufnahme', () => {
    const gesperrt = ZUSTAENDE.filter((z) => !darfZurueck(z));
    expect(gesperrt).toEqual(['capturing-reference', 'capturing-check']);
  });

  it('ist genau dann gesperrt, wenn aufgenommen wird', () => {
    for (const z of ZUSTAENDE) expect(darfZurueck(z)).toBe(!nimmtAuf(z));
  });
});

describe('Hilfsfragen', () => {
  it('kennt die beiden Ergebniszustände', () => {
    const mitErgebnis = ZUSTAENDE.filter(istErgebnis);
    expect(mitErgebnis).toEqual(['result-similar', 'result-deviating']);
  });

  it('deckt jeden aufgezählten Zustand ab', () => {
    // Wer einen Zustand ergänzt, ohne `handlungFuer` zu erweitern, bekommt in
    // TypeScript einen Fehler — und hier zusätzlich einen roten Test, falls
    // jemand ihn mit einem `default` erschlägt.
    for (const z of ZUSTAENDE) {
      expect(() => handlungFuer(z as Maschinenzustand)).not.toThrow();
      expect(handlungFuer(z as Maschinenzustand)).toBeTruthy();
    }
    expect(ZUSTAENDE).toHaveLength(10);
  });
});
