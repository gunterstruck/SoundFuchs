/**
 * Die Karte füllt sich beim ersten Besuch selbst.
 *
 * **Stamm.** TourFuchs lädt auf einer leeren Karte nach kurzer Verzögerung
 * Beispielkunden nach (`scheduleWelcomeDemo()` in `src/ui/importWizard.js`).
 * Das ist keine Nebensache, sondern der Grund, warum sein erstes Bild
 * überhaupt eines ist: Ohne Daten wäre der erste Eindruck ein leerer
 * Deutschlandumriss und die Frage, was man jetzt tun soll.
 *
 * Gemessen am 16.08.2026: TourFuchs zeigt beim ersten Aufruf 11 Marker am
 * Schreibtisch, SoundFuchs zeigte 0. Die Geometrie stimmte da schon —
 * Kopfleiste, Karte und Knopfzeile lagen auf den Pixel genau richtig. Das
 * erste Bild stimmte trotzdem nicht, weil nichts darauf stand.
 *
 * ## Was übernommen ist und was nicht
 *
 * Übernommen: die Bedingungen (leerer Bestand, nicht schon einmal
 * weggeklickt), die Verzögerung, und der sichtbare Hinweis danach.
 *
 * Nicht übernommen: Tresor-Abschaltung, Serviceverträge, Besuchsdaten,
 * Live-Demo-Kopplung und der Vorschau-Statustext. Sie hängen an Funktionen,
 * die es hier nicht gibt.
 *
 * ## Warum überhaupt ungefragt
 *
 * Weil das Gegenteil teurer ist. Ein leerer erster Bildschirm verlangt eine
 * Entscheidung, bevor man gesehen hat, worum es geht. Die Beispieldaten sind
 * erfunden, als solche beschriftet und mit einem Knopf wieder weg — der
 * Hinweisstreifen steht dauerhaft, nicht als Meldung, die verschwindet.
 */

import { logger } from '@utils/logger.js';

/** Merkposten: Der Nutzer hat die Beispieldaten schon einmal entfernt. */
const ABGELEHNT = 'sf_beispieldaten_abgelehnt';

/**
 * So lange bleibt die leere Karte stehen, bevor sie sich füllt.
 *
 * Aus dem Stamm: Er wartet, damit die Karte erst als Karte ankommt und die
 * Punkte danach sichtbar dazukommen. Erschiene beides gleichzeitig, sähe es
 * aus wie ein Ladezustand statt wie ein Angebot.
 */
const WARTEN_MS = 1200;

function abgelehnt(): boolean {
  try {
    return localStorage.getItem(ABGELEHNT) === 'ja';
  } catch {
    return false;
  }
}

function merkeAblehnung(): void {
  try {
    localStorage.setItem(ABGELEHNT, 'ja');
  } catch {
    /* Ohne Speicher kommt das Angebot beim nächsten Mal wieder — verschmerzbar. */
  }
}

function banner(): HTMLElement | null {
  return document.getElementById('demo-banner');
}

/**
 * Den Hinweisstreifen ein- oder ausblenden.
 *
 * Dazu gehört `body.demo-data-active`. Die Klasse ist keine Verzierung: Der
 * Stamm hängt die Guckhöhe des eingeklappten Blatts daran
 * (`--mobile-sheet-peek: 46px` normal, `100px` im Beispielbetrieb), damit der
 * Streifen im Ruhezustand ganz zu sehen ist und nicht nur als Ansatz am
 * unteren Rand. Ohne sie stand das Blatt unterwegs bei y = 798 statt bei 744 —
 * und die Knopfzeile über der Karte gleich mit, weil sie vom Peek aus rechnet.
 */
export async function zeigeBeispielhinweis(): Promise<void> {
  const streifen = banner();
  const { gibEsBeispieldaten } = await import('../../services/demoCustomers.js');
  const laeuft = await gibEsBeispieldaten();
  if (streifen) streifen.hidden = !laeuft;
  document.body.classList.toggle('demo-data-active', laeuft);
}

export interface BeispieldatenDeps {
  /** Nach dem Laden neu zeichnen — die Karte weiß sonst nichts davon. */
  zeichneNeu: () => Promise<void> | void;
}

/**
 * Beim Start anbieten — und den Entfernen-Knopf verdrahten.
 *
 * Gibt zurück, ob geladen wurde. Der Rückgabewert ist für Messungen da: Ein
 * Wächter, der „die Karte ist nicht leer" prüft, soll unterscheiden können,
 * ob das an den Beispieldaten liegt oder an echtem Bestand.
 */
export async function beispieldatenAnbieten(deps: BeispieldatenDeps): Promise<boolean> {
  const streifen = banner();

  streifen?.querySelector('#btn-demo-clear')?.addEventListener('click', () => {
    void (async () => {
      const { entferneBeispieldaten } = await import('../../services/demoCustomers.js');
      const weg = await entferneBeispieldaten();
      merkeAblehnung();
      logger.info(`🧪 Beispieldaten entfernt: ${weg} Standorte`);
      await deps.zeichneNeu();
      await zeigeBeispielhinweis();
    })();
  });

  await zeigeBeispielhinweis();

  if (abgelehnt()) return false;

  const { getAllCustomers } = await import('@data/db.js');
  if ((await getAllCustomers()).length > 0) return false;

  await new Promise((r) => setTimeout(r, WARTEN_MS));

  // Zwischen Prüfung und Ausführung liegt eine Wartezeit — in der kann der
  // Nutzer selbst etwas angelegt oder eingelesen haben. Dann gehört ihm der
  // Bildschirm, nicht der Demo.
  if ((await getAllCustomers()).length > 0) return false;

  try {
    const { ladeBeispieldaten } = await import('../../services/demoCustomers.js');
    const anzahl = await ladeBeispieldaten();
    logger.info(`🧪 Beispieldaten geladen: ${anzahl} Maschinenstandorte`);
    await deps.zeichneNeu();
    await zeigeBeispielhinweis();
    return anzahl > 0;
  } catch (fehler) {
    // Die Karte bleibt startklar. Ein Fehlschlag hier darf den Start nicht
    // aufhalten — er kostet den ersten Eindruck, nicht die Anwendung.
    logger.warn(`Beispieldaten konnten nicht geladen werden: ${String(fehler)}`);
    return false;
  }
}

