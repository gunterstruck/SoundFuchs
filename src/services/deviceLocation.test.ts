import { afterEach, describe, expect, it, vi } from 'vitest';
import { aktuellePosition } from './deviceLocation.js';

afterEach(() => vi.unstubAllGlobals());

describe('Standortbestimmung des Geräts', () => {
  it('übernimmt Koordinaten und Genauigkeit des Browsers', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (erfolg: PositionCallback) =>
          erfolg({
            coords: { latitude: 51.1, longitude: 7.2, accuracy: 14 },
          } as GeolocationPosition),
      },
    });

    await expect(aktuellePosition()).resolves.toEqual({
      lat: 51.1,
      lng: 7.2,
      genauigkeit: 14,
    });
  });

  it('übersetzt eine verweigerte Berechtigung in einen stabilen Fehler', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_: PositionCallback, fehler: PositionErrorCallback) =>
          fehler({ code: 1 } as GeolocationPositionError),
      },
    });

    await expect(aktuellePosition()).rejects.toMatchObject({
      art: 'verweigert',
    });
  });
});
