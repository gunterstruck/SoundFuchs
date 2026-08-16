/**
 * Die Zahlen des Stamms — festgehalten, damit sie nicht unbemerkt verrutschen.
 *
 * Der Zweck ist nicht, zu beweisen, dass `>= 8` acht ist. Er ist, dass diese
 * Schwellen aus TourFuchs stammen und nicht aus dem Bauchgefühl: Wer eine
 * ändert, ändert das Vorbild, und dann soll ein Test danach fragen, statt dass
 * es beim nächsten Blick auf die Karte auffällt.
 */

import { describe, it, expect } from 'vitest';
import {
  markerstufe,
  markerstufeKlasse,
  stapelradius,
  stapelbefund,
  farbeFuerZustand,
  standortname,
  ZUSTANDSFARBEN,
} from './standortmarker.js';

describe('Markerstufe', () => {
  it('zeigt weit draußen nur einen Punkt', () => {
    expect(markerstufe(5)).toBe('dot');
    expect(markerstufe(7.9)).toBe('dot');
  });

  it('macht ab Zoom 8 ein Klemmbrett daraus', () => {
    expect(markerstufe(8)).toBe('card');
    expect(markerstufe(13)).toBe('card');
  });

  it('zeigt den Namen am Schreibtisch ab 14, unterwegs erst ab 15', () => {
    expect(markerstufe(14)).toBe('label');
    expect(markerstufe(14, { mobil: true })).toBe('card');
    expect(markerstufe(15, { mobil: true })).toBe('label');
  });

  it('zeigt den Zusatz am Schreibtisch ab 15,5, unterwegs erst ab 16,5', () => {
    expect(markerstufe(15.5)).toBe('detail');
    expect(markerstufe(15.5, { mobil: true })).toBe('label');
    expect(markerstufe(16.5, { mobil: true })).toBe('detail');
  });

  it('fällt bei Unsinn auf den Punkt zurück', () => {
    expect(markerstufe(Number.NaN)).toBe('dot');
    expect(markerstufeKlasse('gibtesnicht')).toBe('customer-marker-mode-dot');
  });

  it('behält die Klassennamen des Stamms', () => {
    // Das Stamm-CSS spricht genau diese an. Ein „standort-marker-mode-…" wäre
    // konsequent benannt und würde nichts mehr treffen.
    expect(markerstufeKlasse('label')).toBe('customer-marker-mode-label');
  });
});

describe('Stapelradius', () => {
  it('stapelt weit draußen großzügig und im Nahbereich eng', () => {
    expect(stapelradius(5)).toBe(104);
    expect(stapelradius(16)).toBe(28);
  });

  it('nimmt unterwegs überall mehr Platz — der Finger ist breiter als der Zeiger', () => {
    for (const zoom of [5, 8, 10, 12, 14, 16]) {
      expect(stapelradius(zoom, { mobil: true })).toBeGreaterThan(stapelradius(zoom));
    }
  });

  it('wird zum Nahbereich hin nie wieder größer', () => {
    // Ein Ausreißer nach oben hieße: beim Hineinzoomen klebt plötzlich wieder
    // zusammen, was eben schon getrennt war.
    const stufen = [10, 12, 14, 16].map((z) => stapelradius(z));
    for (let i = 1; i < stufen.length; i += 1) {
      expect(stufen[i]).toBeLessThanOrEqual(stufen[i - 1]!);
    }
  });
});

describe('Stapelbefund', () => {
  it('zählt, was drin ist', () => {
    expect(stapelbefund(['gesund', 'gesund', 'gesund']).anzahl).toBe(3);
  });

  it('nimmt den schlechtesten Zustand, nicht den häufigsten', () => {
    // Neun gesunde Standorte und ein kritischer sind ein kritischer Stapel.
    // Genau dafür schaut man auf die Karte.
    const viele: ReturnType<typeof stapelbefund> = stapelbefund([
      ...Array<'gesund'>(9).fill('gesund'),
      'kritisch',
    ]);
    expect(viele.zustand).toBe('kritisch');
    expect(viele.farbe).toBe(ZUSTANDSFARBEN.kritisch);
  });

  it('stellt „ungeprüft" über „gesund", aber unter „Warnung"', () => {
    expect(stapelbefund(['gesund', 'ungeprueft']).zustand).toBe('ungeprueft');
    expect(stapelbefund(['ungeprueft', 'warnung']).zustand).toBe('warnung');
  });

  it('nennt einen leeren Stapel gesund — er hat nichts zu melden', () => {
    expect(stapelbefund([]).anzahl).toBe(0);
    expect(stapelbefund([]).zustand).toBe('gesund');
  });

  it('gibt jedem Zustand eine eigene Farbe', () => {
    const farben = new Set(Object.values(ZUSTANDSFARBEN));
    expect(farben.size).toBe(4);
    expect(farbeFuerZustand('ungeprueft')).not.toBe(farbeFuerZustand('gesund'));
  });
});

describe('Standortname', () => {
  it('lässt echte Namen unangetastet', () => {
    expect(standortname('Müller Guss GmbH')).toBe('Müller Guss GmbH');
    // Auch dann, wenn der Name zufällig so aussieht — ohne demo-Kennzeichen
    // wird nichts weggenommen.
    expect(standortname('SoundFuchs Demo · Werk 1')).toBe('SoundFuchs Demo · Werk 1');
  });

  it('nimmt das Präfix nur bei Beispieldaten weg', () => {
    expect(standortname('SoundFuchs Demo · Gießerei 0081', { demo: true })).toBe('Gießerei 0081');
  });

  it('gibt niemals einen leeren Namen zurück', () => {
    // Hieße ein Beispielstandort exakt wie das Präfix, bliebe sonst nichts
    // übrig — und ein Marker ohne Beschriftung ist schlimmer als einer mit
    // umständlicher.
    expect(standortname('SoundFuchs Demo · ', { demo: true })).toBe('SoundFuchs Demo ·');
  });

  it('verträgt Unsinn', () => {
    expect(standortname('   ')).toBe('');
  });
});
