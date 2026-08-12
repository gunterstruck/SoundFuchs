/**
 * Tests für die Auflösungszeile.
 *
 * Die wichtigste Aussage ist die dritte: die Zahl muss zu DER Referenz gehören,
 * die den angezeigten Score erzeugt hat. Ein stiller Rückfall auf eine andere
 * gesunde Referenz wäre der schlimmste Fehler, den diese Zeile machen kann —
 * eine korrekt gerechnete Zahl über der falschen Messung.
 */

import { describe, it, expect } from 'vitest';
import type { GMIAModel } from '@data/types.js';
import { resolutionLineState, formatResolutionPoints } from './resolutionLine.js';

/** Minimales GMIA-Modell; nur die Felder, die diese Zeile liest, sind echt. */
function model(
  label: string,
  type: 'healthy' | 'faulty',
  spread?: { baselineScore: number; baselineMedian: number; baselineMad: number }
): GMIAModel {
  return {
    machineId: 'm1',
    label,
    type,
    weightVector: new Float64Array(4),
    regularization: 1e9,
    scalingConstant: 10,
    featureDimension: 4,
    trainingDate: 0,
    trainingDuration: 1,
    sampleRate: 48000,
    metadata: { meanCosineSimilarity: 0.18, targetScore: 0.9 },
    ...spread,
  };
}

const TIGHT = { baselineScore: 89, baselineMedian: 89, baselineMad: 0.5 };
const WIDE = { baselineScore: 89, baselineMedian: 89, baselineMad: 6 };

describe('formatResolutionPoints', () => {
  it('one decimal, comma as separator (like formatHz)', () => {
    expect(formatResolutionPoints(2.14)).toBe('2,1');
    expect(formatResolutionPoints(12)).toBe('12,0');
  });

  it('shows the bound instead of "0,0" for a very tight reference', () => {
    // „0,0 Punkte" liest sich als „löst beliebig fein auf" — das behauptet
    // niemand, schon weil der Score selbst ganzzahlig angezeigt wird.
    expect(formatResolutionPoints(0.04)).toBe('< 0,1');
    expect(formatResolutionPoints(0)).toBe('< 0,1');
    expect(formatResolutionPoints(0.1)).toBe('0,1');
  });

  it('refuses nonsense instead of printing it', () => {
    expect(formatResolutionPoints(NaN)).toBe('—');
    expect(formatResolutionPoints(-1)).toBe('—');
  });
});

describe('resolutionLineState', () => {
  it('reports the number of the reference that fed the display', () => {
    const models = [model('Normalzustand', 'healthy', TIGHT), model('Kalt', 'healthy', WIDE)];
    const tight = resolutionLineState(models, 'Normalzustand', true);
    const wide = resolutionLineState(models, 'Kalt', true);
    expect(tight).toEqual({ kind: 'value', points: '1,7', k: 3, label: 'Normalzustand' });
    expect(wide.kind).toBe('value');
    if (wide.kind === 'value') expect(wide.points).toBe('20,2');
  });

  it('never silently substitutes a different reference for an unknown label', () => {
    // Der gefährliche Fall: eine echte Zahl von der falschen Referenz. Lieber
    // keine Zeile als eine, die zu einer anderen Messung gehört.
    const models = [model('Normalzustand', 'healthy', TIGHT)];
    expect(resolutionLineState(models, 'Gibt-es-nicht', true)).toEqual({ kind: 'hidden' });
  });

  it('falls back to the first healthy reference only when no label came at all', () => {
    // Ergebnis-Screen ohne gelaufene Messung — dann ist die erste gesunde
    // Referenz die richtige Auskunft über die Maschine.
    const models = [model('Normalzustand', 'healthy', TIGHT)];
    expect(resolutionLineState(models, '', true).kind).toBe('value');
  });

  it('ignores fault references — the gauge shows closeness to a HEALTHY one', () => {
    const models = [model('Lagerschaden', 'faulty', TIGHT)];
    expect(resolutionLineState(models, 'Lagerschaden', true)).toEqual({ kind: 'hidden' });
    expect(resolutionLineState(models, '', true)).toEqual({ kind: 'hidden' });
  });

  it('says it has no number instead of inventing one', () => {
    // Referenz von vor der Streuungsmessung: kein baselineMedian/baselineMad.
    const models = [model('Normalzustand', 'healthy')];
    expect(resolutionLineState(models, 'Normalzustand', true)).toEqual({ kind: 'unknown' });
  });

  it('keeps the "no number" hint out of the simple view', () => {
    // Ein Hinweis, auf den man nur mit Neuanlernen reagieren kann, ist auf der
    // einfachen Stufe bloß Lärm.
    const models = [model('Normalzustand', 'healthy')];
    expect(resolutionLineState(models, 'Normalzustand', false)).toEqual({ kind: 'hidden' });
  });

  it('hides itself when there is no reference at all', () => {
    expect(resolutionLineState([], 'Normalzustand', true)).toEqual({ kind: 'hidden' });
  });
});
