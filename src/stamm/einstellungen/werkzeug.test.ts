/**
 * Die Wahl des Auswertungswerkzeugs.
 *
 * Geprüft wird nicht die Oberfläche, sondern das, worauf sie sich verlässt:
 * dass eine fehlende Merkung eine Vorgabe ergibt statt einer Lücke, dass eine
 * unbekannte Kennung nichts kaputt macht, und dass eine kaputte Ablage den Weg
 * zur Tür nicht versperrt.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  gewaehltesWerkzeug,
  vorgabe,
  waehleWerkzeug,
  weitereWerkzeuge,
  werkzeugMit,
  WERKZEUGE,
} from './werkzeug.js';

/**
 * Die Testumgebung ist `node` — es gibt keine Ablage. Statt dafür eine ganze
 * Browserumgebung zu laden, steht hier eine, die tut, was `localStorage` tut:
 * Werte halten, und auf Wunsch werfen. Genau das sind die beiden Fälle, um die
 * es geht.
 */
function stelleAblage(werfen = false): void {
  const inhalt = new Map<string, string>();
  const ablage = {
    getItem: (k: string) => {
      if (werfen) throw new Error('kein Speicher');
      return inhalt.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (werfen) throw new Error('kein Speicher');
      inhalt.set(k, v);
    },
    removeItem: (k: string) => void inhalt.delete(k),
    clear: () => inhalt.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ablage, configurable: true });
}

function nimmAblageWeg(): void {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, 'localStorage');
}

describe('Die angebotenen Werkzeuge', () => {
  it('sind die vom Auftraggeber benannten', () => {
    expect(WERKZEUGE.map((w) => w.name)).toEqual(['Claude', 'ChatGPT']);
  });

  it('führen jeweils zu einer Adresse', () => {
    for (const w of WERKZEUGE) expect(w.adresse).toMatch(/^https:\/\//);
  });

  it('haben verschiedene Kennungen', () => {
    expect(new Set(WERKZEUGE.map((w) => w.id)).size).toBe(WERKZEUGE.length);
  });
});

describe('Ein Werkzeug finden', () => {
  it('findet es an seiner Kennung', () => {
    expect(werkzeugMit('chatgpt')?.name).toBe('ChatGPT');
  });

  it('findet nichts zu einer unbekannten Kennung', () => {
    expect(werkzeugMit('gemini')).toBeNull();
  });

  it('findet nichts zu gar keiner Kennung', () => {
    expect(werkzeugMit(null)).toBeNull();
    expect(werkzeugMit('')).toBeNull();
  });
});

describe('Die Wahl', () => {
  beforeEach(() => stelleAblage());
  afterEach(() => nimmAblageWeg());

  it('ist ohne Merkung die Vorgabe', () => {
    expect(gewaehltesWerkzeug().id).toBe(vorgabe().id);
  });

  it('merkt sich, was gewählt wurde', () => {
    waehleWerkzeug('chatgpt');
    expect(gewaehltesWerkzeug().name).toBe('ChatGPT');
  });

  it('gibt das nun gültige Werkzeug zurück', () => {
    expect(waehleWerkzeug('chatgpt').name).toBe('ChatGPT');
  });

  /**
   * Der eigentliche Punkt: Ein Werkzeug, das später aus der Liste genommen
   * wird, darf den Weg zur Tür nicht versperren.
   */
  it('fällt bei einer unbekannten Merkung auf die Vorgabe zurück', () => {
    localStorage.setItem('sf_auswertungswerkzeug', 'gemini');
    expect(gewaehltesWerkzeug().id).toBe(vorgabe().id);
  });

  it('speichert eine unbekannte Kennung gar nicht erst', () => {
    waehleWerkzeug('chatgpt');
    waehleWerkzeug('gemini');
    expect(gewaehltesWerkzeug().name).toBe('ChatGPT');
  });

  /**
   * In privaten Fenstern kann schon das Lesen werfen. Dann gilt die Vorgabe —
   * ein Fehler an dieser Stelle nähme dem Nutzer den ganzen Weg.
   */
  it('überlebt eine Ablage, die wirft', () => {
    stelleAblage(true);
    expect(gewaehltesWerkzeug().id).toBe(vorgabe().id);
    expect(waehleWerkzeug('chatgpt').name).toBe('ChatGPT');
  });

  /** Und eine, die es gar nicht gibt — im Node-Lauf der Regelfall. */
  it('überlebt eine Ablage, die es nicht gibt', () => {
    nimmAblageWeg();
    expect(gewaehltesWerkzeug().id).toBe(vorgabe().id);
    expect(waehleWerkzeug('chatgpt').name).toBe('ChatGPT');
  });
});

describe('Das andere Werkzeug', () => {
  it('ist alles außer dem gewählten', () => {
    expect(weitereWerkzeuge(WERKZEUGE[0]).map((w) => w.name)).toEqual(['ChatGPT']);
    expect(weitereWerkzeuge(WERKZEUGE[1]).map((w) => w.name)).toEqual(['Claude']);
  });
});
