import { describe, expect, it } from 'vitest';
import {
  STANDORT_SUCHHINWEIS_SCHLUESSEL,
  standortSuchhinweisNeu,
  standortVorgabeAusSuche,
} from './standortSuche.js';

function speicher() {
  const werte = new Map<string, string>();
  return {
    getItem: (schluessel: string) => werte.get(schluessel) ?? null,
    setItem: (schluessel: string, wert: string) => void werte.set(schluessel, wert),
  };
}

describe('Standort aus der Suche anlegen', () => {
  it('übernimmt einen Namen, aber keine umgebenden Leerzeichen', () => {
    expect(standortVorgabeAusSuche('  Werk Nord  ')).toEqual({ name: 'Werk Nord' });
  });

  it('übernimmt eine begonnene oder vollständige PLZ ins richtige Feld', () => {
    expect(standortVorgabeAusSuche('451')).toEqual({ plz: '451' });
    expect(standortVorgabeAusSuche('45127')).toEqual({ plz: '45127' });
  });

  it('legt bei leerer Suche nichts in das Formular', () => {
    expect(standortVorgabeAusSuche('  ')).toEqual({});
  });
});

describe('Einmaliger Standort-Hinweis', () => {
  it('erscheint genau einmal und merkt dies unter einem eigenen Schlüssel', () => {
    const ablage = speicher();
    expect(standortSuchhinweisNeu(ablage)).toBe(true);
    expect(ablage.getItem(STANDORT_SUCHHINWEIS_SCHLUESSEL)).toBe('gesehen');
    expect(standortSuchhinweisNeu(ablage)).toBe(false);
  });

  it('versperrt die Suche nicht, wenn der Speicher nicht verfügbar ist', () => {
    const kaputt = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(standortSuchhinweisNeu(kaputt)).toBe(true);
    expect(standortSuchhinweisNeu(null)).toBe(true);
  });
});
