/**
 * Eine bewusst kleine Hülle um die Standortbestimmung des Browsers.
 *
 * Sie fragt nie von selbst nach einer Berechtigung. Erst ein ausdrücklicher
 * Tipp auf „Aktuellen Standort verwenden" ruft diese Funktion auf. Die App
 * bekommt danach nur Koordinaten und Genauigkeit; gespeichert werden sie
 * weiterhin ausschließlich in ihrer lokalen IndexedDB.
 */

export interface GpsPunkt {
  lat: number;
  lng: number;
  genauigkeit: number;
}

export type StandortfehlerArt = 'nicht-verfuegbar' | 'verweigert' | 'position' | 'zeit';

export class Standortfehler extends Error {
  constructor(public readonly art: StandortfehlerArt) {
    super(art);
    this.name = 'Standortfehler';
  }
}

export function aktuellePosition(): Promise<GpsPunkt> {
  if (!navigator.geolocation) {
    return Promise.reject(new Standortfehler('nicht-verfuegbar'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          genauigkeit: position.coords.accuracy,
        });
      },
      (fehler) => {
        // Die drei Codes sind Teil der Web-Geolocation-Spezifikation. Nicht
        // jeder Browser stellt daneben auch ein globales Konstruktorobjekt
        // `GeolocationPositionError` bereit, deshalb nicht darauf zugreifen.
        const art: StandortfehlerArt =
          fehler.code === 1 ? 'verweigert' : fehler.code === 3 ? 'zeit' : 'position';
        reject(new Standortfehler(art));
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 60_000,
      }
    );
  });
}
