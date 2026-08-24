import { beforeEach, describe, expect, it, vi } from 'vitest';

const tfMock = vi.hoisted(() => ({
  ready: vi.fn(async () => undefined),
  loadGraphModel: vi.fn(),
}));

vi.mock('@tensorflow/tfjs', () => tfMock);

import { YamnetEngine } from './YamnetEngine.js';

const lokalesZiel = 'indexeddb://soundfuchs-yamnet-tfjs-1';
const fernesZiel = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';

function modell() {
  return {
    save: vi.fn(async () => ({})),
    dispose: vi.fn(),
  };
}

describe('YAMNet-Laden', () => {
  beforeEach(() => {
    tfMock.ready.mockClear();
    tfMock.loadGraphModel.mockReset();
  });

  it('lädt zuerst aus IndexedDB und braucht dann kein Netz', async () => {
    const lokal = modell();
    tfMock.loadGraphModel.mockResolvedValueOnce(lokal);

    const engine = new YamnetEngine();
    await engine.init();

    expect(tfMock.loadGraphModel).toHaveBeenCalledTimes(1);
    expect(tfMock.loadGraphModel).toHaveBeenCalledWith(lokalesZiel);
    expect(lokal.save).not.toHaveBeenCalled();
  });

  it('speichert den ersten Download und erlaubt nach einem Fehler einen neuen Versuch', async () => {
    const geladen = modell();
    tfMock.loadGraphModel
      .mockRejectedValueOnce(new Error('noch nicht lokal'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('noch nicht lokal'))
      .mockResolvedValueOnce(geladen);

    const engine = new YamnetEngine();
    await expect(engine.init()).rejects.toThrow('offline');
    await expect(engine.init()).resolves.toBeUndefined();

    expect(tfMock.loadGraphModel.mock.calls).toEqual([
      [lokalesZiel],
      [fernesZiel, { fromTFHub: true }],
      [lokalesZiel],
      [fernesZiel, { fromTFHub: true }],
    ]);
    expect(geladen.save).toHaveBeenCalledWith(lokalesZiel);
  });
});
