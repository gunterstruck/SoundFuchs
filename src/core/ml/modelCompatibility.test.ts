/**
 * Tests für den Layout-/Sample-Rate-Riegel.
 *
 * Kernaussage: Ein Modell aus einer fremden Bandaufteilung darf NICHT gerechnet
 * werden. Der Fehler wäre sonst der schlimmste, den dieses Produkt haben kann —
 * kein Absturz, keine Warnung, nur ein plausibler Score über zwei Vektoren
 * gleicher Länge, die verschiedene Frequenzen beschreiben.
 */

import { describe, it, expect } from 'vitest';
import {
  isLayoutCompatible,
  isLayoutIndependent,
  isModelUsable,
  layoutOf,
  partitionModels,
} from './modelCompatibility.js';
import { CURRENT_FEATURE_LAYOUT } from '@core/dsp/filterBank.js';
import type { ReferenceModel } from '@data/types.js';

/** Minimales Spektral-Modell mit wählbarem Layout. */
const spectral = (
  label: string,
  sampleRate = 48000,
  featureLayout?: 'linear-512' | 'hybrid-512'
): ReferenceModel =>
  ({
    engineId: 'spectral-cosine',
    machineId: 'm1',
    label,
    type: 'healthy',
    mean: [1, 2, 3],
    scalingConstant: 2,
    featureDimension: 512,
    sampleRate,
    trainingDate: 0,
    trainingDuration: 10,
    ...(featureLayout ? { featureLayout } : {}),
  }) as ReferenceModel;

/** YAMNet-Modell: entsteht aus Rohaudio, kennt kein Bandraster. */
const yamnet = (label: string, sampleRate = 44100): ReferenceModel =>
  ({
    engineId: 'yamnet',
    machineId: 'm1',
    label,
    type: 'healthy',
    bank: [[1]],
    mean: [1],
    scalingConstant: 2,
    embeddingDim: 1024,
    featureDimension: 1024,
    sampleRate,
    trainingDate: 0,
    trainingDuration: 10,
  }) as ReferenceModel;

describe('layoutOf', () => {
  it('liest Altmodelle ohne Feld als linear-512 — eine Tatsache, keine Annahme', () => {
    expect(layoutOf(spectral('alt'))).toBe('linear-512');
  });

  it('liest das gesetzte Layout', () => {
    expect(layoutOf(spectral('neu', 48000, 'hybrid-512'))).toBe('hybrid-512');
  });

  it('gibt für YAMNet null zurück — die Frage stellt sich dort nicht', () => {
    expect(layoutOf(yamnet('y'))).toBeNull();
    expect(isLayoutIndependent(yamnet('y'))).toBe(true);
    expect(isLayoutIndependent(spectral('s'))).toBe(false);
  });
});

describe('isLayoutCompatible', () => {
  it('lässt Modelle mit dem aktiven Layout zu', () => {
    expect(isLayoutCompatible(spectral('a', 48000, CURRENT_FEATURE_LAYOUT))).toBe(true);
    expect(isLayoutCompatible(spectral('altmodell'))).toBe(CURRENT_FEATURE_LAYOUT === 'linear-512');
  });

  it('weist ein Modell mit fremdem Layout ab', () => {
    const fremd = CURRENT_FEATURE_LAYOUT === 'linear-512' ? 'hybrid-512' : 'linear-512';
    expect(isLayoutCompatible(spectral('fremd', 48000, fremd))).toBe(false);
  });

  it('lässt YAMNet immer zu — es berührt die Filterbank nie', () => {
    expect(isLayoutCompatible(yamnet('y'))).toBe(true);
  });
});

describe('isModelUsable', () => {
  it('verlangt Layout UND Sample-Rate bei spektralen Modellen', () => {
    expect(isModelUsable(spectral('a', 48000, CURRENT_FEATURE_LAYOUT), 48000)).toBe(true);
    expect(isModelUsable(spectral('a', 48000, CURRENT_FEATURE_LAYOUT), 44100)).toBe(false);
  });

  it('nimmt YAMNet von der Sample-Rate aus (resampelt intern auf 16 kHz)', () => {
    expect(isModelUsable(yamnet('y', 44100), 48000)).toBe(true);
  });

  it('Layout schlägt Sample-Rate: fremdes Layout ist auch bei passender Rate unbrauchbar', () => {
    const fremd = CURRENT_FEATURE_LAYOUT === 'linear-512' ? 'hybrid-512' : 'linear-512';
    expect(isModelUsable(spectral('f', 48000, fremd), 48000)).toBe(false);
  });
});

describe('partitionModels', () => {
  const fremd = CURRENT_FEATURE_LAYOUT === 'linear-512' ? 'hybrid-512' : 'linear-512';

  it('trennt die beiden Ausschlussgründe, weil sie zu verschiedenen Handlungen führen', () => {
    const p = partitionModels(
      [
        spectral('gut', 48000, CURRENT_FEATURE_LAYOUT),
        spectral('falsche-rate', 44100, CURRENT_FEATURE_LAYOUT),
        spectral('altes-layout', 48000, fremd),
        yamnet('yamnet-egal', 44100),
      ],
      48000
    );
    expect(p.usable.map((m) => m.label)).toEqual(['gut', 'yamnet-egal']);
    expect(p.wrongSampleRate.map((m) => m.label)).toEqual(['falsche-rate']);
    expect(p.outdatedLayout.map((m) => m.label)).toEqual(['altes-layout']);
  });

  it('ordnet ein Modell mit BEIDEN Problemen dem Layout zu — das ist der härtere Grund', () => {
    // Falsche Rate lässt sich durch ein anderes Gerät lösen, fremdes Layout nie.
    const p = partitionModels([spectral('beides', 44100, fremd)], 48000);
    expect(p.outdatedLayout).toHaveLength(1);
    expect(p.wrongSampleRate).toHaveLength(0);
    expect(p.usable).toHaveLength(0);
  });

  it('verträgt undefined und leere Listen', () => {
    for (const input of [undefined, []]) {
      const p = partitionModels(input, 48000);
      expect(p.usable).toEqual([]);
      expect(p.outdatedLayout).toEqual([]);
      expect(p.wrongSampleRate).toEqual([]);
    }
  });

  it('lässt heute nichts liegen: Altmodelle bleiben brauchbar, solange linear aktiv ist', () => {
    // Wichtig für diesen Zwischenstand — der Riegel darf jetzt noch nichts
    // aussortieren, sonst wäre der Commit nicht verhaltensneutral.
    const p = partitionModels([spectral('alt-ohne-feld')], 48000);
    expect(p.usable).toHaveLength(1);
    expect(p.outdatedLayout).toHaveLength(0);
  });
});
