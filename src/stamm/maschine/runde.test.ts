/**
 * Die Runde endet.
 *
 * Der Kern ist eine Entscheidung, keine Oberfläche: Wer kommt als Nächstes, und
 * wann ist niemand mehr übrig. Das lässt sich ohne Browser prüfen — und genau
 * deshalb steht es als reine Funktion da.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  erledigte,
  merkeGeprueft,
  naechsteInDerRunde,
  rundeBeenden,
  standortBetreten,
  type Kandidat,
} from './runde.js';

const m = (id: string, name: string) => ({ id, name });

const kandidaten = (
  ...eintraege: Array<[string, string, number | null]>
): Array<Kandidat<Record<string, never>>> =>
  eintraege.map(([id, name, zuletzt]) => ({ maschine: m(id, name), zuletzt })) as Array<
    Kandidat<Record<string, never>>
  >;

describe('Wer als Nächstes drankommt', () => {
  it('nimmt zuerst, was noch nie geprüft wurde', () => {
    const naechste = naechsteInDerRunde(
      kandidaten(['a', 'Alt', 1000], ['b', 'Nie', null]),
      new Set()
    );
    expect(naechste?.id).toBe('b');
  });

  it('nimmt danach das am längsten Zurückliegende', () => {
    const naechste = naechsteInDerRunde(
      kandidaten(['a', 'Frisch', 9000], ['b', 'Alt', 1000]),
      new Set()
    );
    expect(naechste?.id).toBe('b');
  });

  it('entscheidet bei Gleichstand nach dem Namen — damit zwei Besuche gleich laufen', () => {
    const naechste = naechsteInDerRunde(
      kandidaten(['a', 'Zeta', 1000], ['b', 'Alpha', 1000]),
      new Set()
    );
    expect(naechste?.name).toBe('Alpha');
  });

  it('überspringt, was in dieser Runde schon dran war', () => {
    const naechste = naechsteInDerRunde(
      kandidaten(['a', 'Erste', 1000], ['b', 'Zweite', 2000]),
      new Set(['a'])
    );
    expect(naechste?.id).toBe('b');
  });

  /**
   * Der eigentliche Punkt. Vorher zeigte die Runde nach der letzten Maschine
   * wieder auf die erste — die war ja inzwischen die mit der ältesten Prüfung.
   */
  it('endet, wenn alle dran waren', () => {
    const naechste = naechsteInDerRunde(
      kandidaten(['a', 'Erste', 1000], ['b', 'Zweite', 2000]),
      new Set(['a', 'b'])
    );
    expect(naechste).toBeNull();
  });

  it('endet auch, wenn es gar keine Geschwister gibt', () => {
    expect(naechsteInDerRunde(kandidaten(), new Set())).toBeNull();
  });
});

describe('Das Gedächtnis der Runde', () => {
  beforeEach(() => rundeBeenden());

  it('merkt sich, was geprüft wurde', () => {
    merkeGeprueft('werk-1', 'pumpe');
    expect([...erledigte('werk-1')]).toEqual(['pumpe']);
  });

  it('gilt nur für den eigenen Standort', () => {
    merkeGeprueft('werk-1', 'pumpe');
    expect([...erledigte('werk-2')]).toEqual([]);
  });

  it('beginnt bei einem anderen Standort von vorn', () => {
    merkeGeprueft('werk-1', 'pumpe');
    standortBetreten('werk-2');
    standortBetreten('werk-1');
    expect([...erledigte('werk-1')]).toEqual([]);
  });

  /**
   * Zwischen Standort- und Maschinenebene wird dauernd gewechselt, und beide
   * melden denselben Standort. Setzte das die Runde zurück, gäbe es sie nicht.
   */
  it('läuft weiter, wenn derselbe Standort noch einmal betreten wird', () => {
    merkeGeprueft('werk-1', 'pumpe');
    standortBetreten('werk-1');
    expect([...erledigte('werk-1')]).toEqual(['pumpe']);
  });

  it('endet mit dem Verlassen der Tiefe', () => {
    merkeGeprueft('werk-1', 'pumpe');
    rundeBeenden();
    expect([...erledigte('werk-1')]).toEqual([]);
  });
});
