/**
 * Der Befund einer Reihe.
 *
 * Die Frage ist „welche fällt auf?", und sie lässt sich ohne Browser
 * beantworten. Geprüft wird vor allem, dass ein einzelner Ausreißer sich nicht
 * selbst unauffällig macht — genau das täte er, wenn hier der Mittelwert
 * stünde statt des Medians.
 */
import { describe, expect, it } from 'vitest';
import { nameNennen, reihenbefund, VERGLEICHBAR_AB, type Reihenglied } from './reihe.js';

const glieder = (...eintraege: Array<[string, number | null]>): Reihenglied[] =>
  eintraege.map(([name, wert], i) => ({ id: `m${i}`, name, wert }));

describe('Der Befund einer Reihe', () => {
  it('findet niemanden, wenn alle dicht beieinanderliegen', () => {
    const b = reihenbefund(glieder(['A', 88], ['B', 90], ['C', 89], ['D', 91]));
    expect(b.auffaellige).toEqual([]);
    expect(b.geprueft).toBe(4);
    expect(b.spanne).toEqual({ von: 88, bis: 91 });
  });

  /**
   * Der eigentliche Punkt. Mit dem Mittelwert (85,5) läge die Schwelle so
   * tief, dass die 61 als „normal" durchginge — sie hätte den Maßstab, an dem
   * sie gemessen wird, selbst nach unten gezogen.
   */
  it('findet den einen, der herausfällt', () => {
    const b = reihenbefund(glieder(['A', 92], ['B', 90], ['C', 89], ['D', 61]));
    expect(b.auffaellige.map((g) => g.name)).toEqual(['D']);
  });

  it('nennt bei mehreren den auffälligsten zuerst', () => {
    const b = reihenbefund(
      glieder(['A', 92], ['B', 91], ['C', 90], ['D', 89], ['E', 55], ['F', 40])
    );
    expect(b.auffaellige.map((g) => g.name)).toEqual(['F', 'E']);
  });

  it('entscheidet bei Gleichstand nach dem Namen', () => {
    const b = reihenbefund(
      glieder(['Zeta', 92], ['Alpha', 40], ['Beta', 91], ['Gamma', 40], ['Delta', 90], ['Eta', 89])
    );
    expect(b.auffaellige.map((g) => g.name)).toEqual(['Alpha', 'Gamma']);
  });

  /**
   * ── DIE GRENZE DES VERFAHRENS, ABSICHTLICH FESTGEHALTEN ──────────────────
   *
   * Median − 2·MAD findet eine **Minderheit**, die heraussticht. Weicht die
   * Hälfte der Reihe ab, rutscht der Median zwischen die beiden Gruppen, die
   * mittlere Abweichung wird groß, und die Schwelle fällt unter alles.
   *
   * Gemessen: [92, 91, 55, 40] → Median 73, MAD 18,5, Schwelle 36. Niemand
   * liegt darunter, obwohl zwei von vieren deutlich abweichen.
   *
   * Das ist kein Fehler, den man wegdefinieren sollte, sondern die Aussage des
   * Verfahrens: „Fällt eine aus der Reihe?" ist eine andere Frage als „Geht es
   * dieser Reihe gut?". Die zweite beantwortet die Standortliste, Maschine für
   * Maschine — dort steht jede einzeln gegen ihren eigenen Normalzustand.
   */
  it('findet keine Minderheit, wenn die halbe Reihe abweicht', () => {
    const b = reihenbefund(glieder(['A', 92], ['B', 91], ['C', 55], ['D', 40]));
    expect(b.auffaellige).toEqual([]);
    expect(b.spanne).toEqual({ von: 40, bis: 92 });
  });

  it('zählt Ungeprüfte mit, lässt sie aber nicht mitrechnen', () => {
    const b = reihenbefund(glieder(['A', 90], ['B', 88], ['C', null]));
    expect(b.geprueft).toBe(2);
    expect(b.gesamt).toBe(3);
    expect(b.spanne).toEqual({ von: 88, bis: 90 });
  });

  /** Eine einzelne Maschine fällt aus keiner Reihe — sie IST die Reihe. */
  it('kennt keinen Ausreißer bei nur einem Wert', () => {
    const b = reihenbefund(glieder(['A', 12], ['B', null]));
    expect(b.auffaellige).toEqual([]);
    expect(b.kennzahlen).toBeNull();
    expect(b.spanne).toBeNull();
  });

  it('kennt keinen Ausreißer bei gar keinem Wert', () => {
    const b = reihenbefund(glieder(['A', null], ['B', null]));
    expect(b.auffaellige).toEqual([]);
    expect(b.geprueft).toBe(0);
    expect(b.gesamt).toBe(2);
  });

  /**
   * Alle gleich schlecht ist kein Ausreißer, sondern ein Zustand der Reihe.
   * Wer hier jemanden meldete, meldete den Zufall der letzten Nachkommastelle.
   */
  it('meldet niemanden, wenn alle gleich weit abweichen', () => {
    const b = reihenbefund(glieder(['A', 40], ['B', 40], ['C', 40], ['D', 40]));
    expect(b.auffaellige).toEqual([]);
  });
});

/**
 * ── DIE ZWEIERREIHE ────────────────────────────────────────────────────────
 *
 * Gefunden beim absichtlichen Falsifizieren: Ein erzwungener Ausreißer
 * erschien nicht. Der Grund ist keine Panne, sondern Arithmetik — bei zwei
 * Werten liegt der Median genau zwischen ihnen, beide weichen gleich weit ab,
 * und `Median − 2·MAD` fällt unter beide.
 *
 * „Keine fällt aus der Reihe" wäre dort ein wahrer Satz, der nichts gemessen
 * hat. Bei 40 % gegen 92 % legte er sogar das Gegenteil dessen nahe, was
 * dasteht. Deshalb sagt der Befund selbst, ob er etwas sagen kann.
 */
describe('Wann eine Reihe überhaupt etwas aussagt', () => {
  it('kann bei zwei Maschinen niemanden einordnen — auch bei großem Abstand', () => {
    const b = reihenbefund(glieder(['A', 40], ['B', 92]));
    expect(b.auffaellige).toEqual([]);
    expect(b.vergleichbar).toBe(false);
    // Die Spanne steht trotzdem da: Sie ist die Auskunft, die bleibt.
    expect(b.spanne).toEqual({ von: 40, bis: 92 });
  });

  it('kann es ab drei', () => {
    const b = reihenbefund(glieder(['A', 40], ['B', 92], ['C', 90]));
    expect(b.vergleichbar).toBe(true);
    expect(b.auffaellige.map((g) => g.name)).toEqual(['A']);
  });

  it('zählt dafür nur die Geprüften', () => {
    const b = reihenbefund(glieder(['A', 40], ['B', 92], ['C', null], ['D', null]));
    expect(b.vergleichbar).toBe(false);
    expect(b.gesamt).toBe(4);
  });

  it('nennt die Grenze, statt sie zu verstecken', () => {
    expect(VERGLEICHBAR_AB).toBe(3);
  });
});

describe('Namen aufzählen', () => {
  const und = 'und';
  const weitere = (n: number) => `und ${n} weitere`;

  it('nennt einen beim Namen', () => {
    expect(nameNennen(['A'], und, weitere)).toBe('A');
  });

  it('verbindet zwei mit „und"', () => {
    expect(nameNennen(['A', 'B'], und, weitere)).toBe('A und B');
  });

  it('zählt drei auf', () => {
    expect(nameNennen(['A', 'B', 'C'], und, weitere)).toBe('A, B und C');
  });

  /** Sieben Namen liest niemand — der Satz ist eine Auskunft, keine Liste. */
  it('kürzt ab vier ab', () => {
    expect(nameNennen(['A', 'B', 'C', 'D'], und, weitere)).toBe('A, B und 2 weitere');
  });

  it('sagt zu gar keinem Namen nichts', () => {
    expect(nameNennen([], und, weitere)).toBe('');
  });
});
