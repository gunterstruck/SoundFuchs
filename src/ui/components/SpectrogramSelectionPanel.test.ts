import { describe, expect, it } from 'vitest';
import { rectToSpectralSelection, spectralSelectionToRect } from './SpectrogramSelectionPanel.js';

describe('rectToSpectralSelection', () => {
  it('bildet Zeit horizontal und Frequenz von unten nach oben ab', () => {
    const selection = rectToSpectralSelection(
      { x0: 0.2, x1: 0.7, y0: 0.25, y1: 0.75 },
      10,
      new Float32Array([100, 200, 400, 800, 1600])
    );
    expect(selection.startSec).toBeCloseTo(2);
    expect(selection.endSec).toBeCloseTo(7);
    expect(selection.lowHz).toBeCloseTo(200);
    expect(selection.highHz).toBeCloseTo(800);
  });

  it('ordnet ein rückwärts gezogenes Rechteck richtig', () => {
    const selection = rectToSpectralSelection(
      { x0: 0.9, x1: 0.1, y0: 0.8, y1: 0.2 },
      20,
      new Float32Array([0, 1000, 2000])
    );
    expect(selection.startSec).toBeCloseTo(2);
    expect(selection.endSec).toBeCloseTo(18);
    expect(selection.lowHz).toBeCloseTo(400);
    expect(selection.highHz).toBeCloseTo(1600);
  });

  it('bewahrt Sekunden und Hertz beim Wechsel auf eine anders lange Quelle', () => {
    const edges = new Float32Array([100, 200, 400, 800, 1600]);
    const original = rectToSpectralSelection({ x0: 0.2, x1: 0.6, y0: 0.25, y1: 0.75 }, 10, edges);
    const onLongerSource = spectralSelectionToRect(original, 20, edges);
    const restored = rectToSpectralSelection(onLongerSource, 20, edges);

    expect(restored.startSec).toBeCloseTo(original.startSec);
    expect(restored.endSec).toBeCloseTo(original.endSec);
    expect(restored.lowHz).toBeCloseTo(original.lowHz);
    expect(restored.highHz).toBeCloseTo(original.highHz);
  });
});
