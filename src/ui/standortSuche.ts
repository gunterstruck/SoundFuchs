/**
 * Die Standortanlage gehört zur Suche, nicht dauerhaft auf die Karte.
 *
 * Diese kleinen Regeln stehen getrennt von `GlobalSearch`, damit die beiden
 * heiklen Entscheidungen ohne Browser prüfbar bleiben: Was wird aus einem
 * Suchwort übernommen, und erscheint der Einführungshinweis wirklich nur
 * einmal?
 */

export const STANDORT_SUCHHINWEIS_SCHLUESSEL = 'sf_site_search_hint_v1';
export const STANDORT_SUCHHINWEIS_MS = 5000;

export interface StandortVorgabe {
  name?: string;
  plz?: string;
}

interface Merkspeicher {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
}

/** Eine reine Ziffernfolge ist eine begonnene PLZ, alles andere ein Name. */
export function standortVorgabeAusSuche(suchtext: string): StandortVorgabe {
  const wert = suchtext.trim();
  if (!wert) return {};
  if (/^\d{1,5}$/.test(wert)) return { plz: wert };
  return { name: wert };
}

/**
 * Merkt den Hinweis beim ersten Anzeigen. Private Browser dürfen den Zugriff
 * verweigern; dann bleibt die Funktion nutzbar und der Hinweis darf beim
 * nächsten Start noch einmal erscheinen.
 */
export function standortSuchhinweisNeu(speicher: Merkspeicher | null): boolean {
  if (!speicher) return true;
  try {
    if (speicher.getItem(STANDORT_SUCHHINWEIS_SCHLUESSEL) === 'gesehen') return false;
    speicher.setItem(STANDORT_SUCHHINWEIS_SCHLUESSEL, 'gesehen');
    return true;
  } catch {
    return true;
  }
}
