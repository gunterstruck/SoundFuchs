import { describe, expect, it } from 'vitest';
import { optionenZusammenfassung } from './CustomerField.js';

describe('Standortzusammenfassung beim Maschinenanlegen', () => {
  it('nennt den gewählten Standort', () => {
    expect(optionenZusammenfassung('standort-1', '  Werk Nord · Essen  ', 'Standort')).toBe(
      'Werk Nord · Essen'
    );
  });

  it('verwendet ohne Wahl oder ohne Optionstext den Standardhinweis', () => {
    expect(optionenZusammenfassung('', '— kein Standort —', 'Standort und Zuordnung')).toBe(
      'Standort und Zuordnung'
    );
    expect(optionenZusammenfassung('standort-1', '', 'Standort und Zuordnung')).toBe(
      'Standort und Zuordnung'
    );
  });
});
