/**
 * DAS AUSWERTUNGSWERKZEUG — WOHIN DAS BRIEFING GEHT
 *
 * Das Geräusch-Briefing entsteht vollständig im Browser: ein ZIP mit den
 * Aufnahmen und ein Arbeitsauftrag als Text. SoundFuchs lädt nichts hoch und
 * wertet nichts aus — die fachliche Einordnung passiert beim Empfänger.
 *
 * Bis zum 23.08.2026 endete das an einer Wand. Der Erfolgsbildschirm sagte
 * „Der Arbeitsauftrag liegt in der Zwischenablage" und bot zwei Knöpfe:
 * „Nochmal kopieren" und „Fertig". Keiner führte irgendwohin. Wer das Briefing
 * erzeugt hatte, musste selbst einen Tab öffnen, sich an den Namen einer KI
 * erinnern, sie ansteuern, einfügen und die ZIP-Datei aus dem
 * Download-Ordner anhängen. Der letzte Schritt einer Funktion, die es genau
 * für diesen Schritt gibt, war der einzige ohne Weg.
 *
 * ## Was hier steht
 *
 * Die Liste der Werkzeuge und die Merkung, welches gewählt ist. Sonst nichts:
 * Kein Schlüssel, kein Konto, keine Verbindung. Ein Werkzeug ist hier eine
 * **Adresse und ein Name** — SoundFuchs öffnet sie, mehr passiert nicht.
 *
 * ## Warum keine Schnittstelle
 *
 * Die naheliegende Erwartung an „Auswertungswerkzeug wählen" wäre, dass die
 * App das Briefing selbst hinschickt und die Antwort anzeigt. Das hieße:
 * Zugangsschlüssel im Browser, Audio auf fremde Server, und ein
 * Datenschutzversprechen („Das Briefing wurde lokal erzeugt. SoundFuchs hat
 * nichts hochgeladen."), das dann nicht mehr stimmt. Der Nutzer übergibt
 * weiterhin selbst; die App bringt ihn nur bis zur Tür.
 */

/** Ein Werkzeug: ein Name und eine Adresse. Mehr weiß die App darüber nicht. */
export interface Werkzeug {
  id: string;
  /** Der Name, wie ihn der Nutzer kennt — nicht übersetzt, es ist ein Eigenname. */
  name: string;
  /** Wohin der Knopf führt. Ein neues Gespräch, nicht die Startseite. */
  adresse: string;
}

/**
 * Die angebotenen Werkzeuge.
 *
 * Vom Auftraggeber am 23.08.2026 benannt: „auswahlwerkzeuge: Claude, Chatgpt".
 * Die Reihenfolge ist die Vorgabe — das erste ist die Voreinstellung.
 *
 * Die Adressen führen jeweils in ein NEUES Gespräch, nicht auf die Startseite:
 * Wer mit einem Arbeitsauftrag in der Zwischenablage ankommt, will ein leeres
 * Eingabefeld und nicht das letzte Gespräch von gestern.
 */
export const WERKZEUGE: readonly Werkzeug[] = [
  { id: 'claude', name: 'Claude', adresse: 'https://claude.ai/new' },
  { id: 'chatgpt', name: 'ChatGPT', adresse: 'https://chatgpt.com/' },
];

const SCHLUESSEL = 'sf_auswertungswerkzeug';

/** Das voreingestellte Werkzeug — das erste der Liste. */
export function vorgabe(): Werkzeug {
  return WERKZEUGE[0];
}

/**
 * Ein Werkzeug anhand seiner Kennung finden.
 *
 * Rein, damit die Zuordnung ohne Browser prüfbar ist — und weil sie an zwei
 * Stellen gebraucht wird: beim Lesen der Merkung und beim Lesen einer
 * Bedienelement-Auswahl.
 */
export function werkzeugMit(id: string | null | undefined): Werkzeug | null {
  if (!id) return null;
  return WERKZEUGE.find((w) => w.id === id) ?? null;
}

/**
 * Welches Werkzeug ist gewählt?
 *
 * Eine unbekannte oder fehlende Merkung ergibt die Vorgabe statt eines
 * Fehlers: Ein Werkzeug, das aus der Liste genommen wurde, darf den Weg zur
 * Tür nicht versperren. Und ein Zugriff auf `localStorage` kann in privaten
 * Fenstern werfen — dann gilt ebenfalls die Vorgabe.
 */
export function gewaehltesWerkzeug(): Werkzeug {
  try {
    return werkzeugMit(localStorage.getItem(SCHLUESSEL)) ?? vorgabe();
  } catch {
    return vorgabe();
  }
}

/**
 * Ein Werkzeug wählen.
 *
 * Eine unbekannte Kennung ändert nichts — sie zu speichern hieße, die nächste
 * Frage nach dem gewählten Werkzeug mit der Vorgabe zu beantworten und dabei
 * so zu tun, als sei etwas gemerkt worden.
 *
 * @returns das nun gültige Werkzeug.
 */
export function waehleWerkzeug(id: string): Werkzeug {
  const gewaehlt = werkzeugMit(id);
  if (!gewaehlt) return gewaehltesWerkzeug();
  try {
    localStorage.setItem(SCHLUESSEL, gewaehlt.id);
  } catch {
    // Ohne Ablage bleibt die Wahl für diesen Besuch wirkungslos. Das ist
    // besser als ein Fehler an einer Stelle, an der der Nutzer gerade etwas
    // ganz anderes vorhat.
  }
  return gewaehlt;
}

/** Das andere Werkzeug — für den leisen Wechsel direkt an der Tür. */
export function weitereWerkzeuge(ausser: Werkzeug): readonly Werkzeug[] {
  return WERKZEUGE.filter((w) => w.id !== ausser.id);
}
