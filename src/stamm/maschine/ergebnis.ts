/**
 * DAS ERGEBNIS EINER PRÜFUNG — SOLANGE DER NUTZER DAVORSTEHT
 *
 * Zwischen dem Ende einer Messung und der Ergebnisfläche muss etwas
 * hinüberreichen: die Bewertung, der Zeitpunkt, und die beiden Aufnahmen, die
 * man vergleichen können soll. Das ist der Zweck dieser Datei.
 *
 * ## Warum ein Wert und kein Ereignis mit Fracht
 *
 * Der nächstliegende Weg wäre ein `CustomEvent` mit den AudioBuffern im
 * `detail`. Er ist falsch, und zwar aus zwei Gründen:
 *
 * 1. Ein Ereignis geht an alle. Zwei Zuhörer, die beide einen Buffer festhalten,
 *    halten ihn unterschiedlich lange — und keiner von beiden weiß, wann er ihn
 *    loslassen darf. Ein Buffer von zehn Sekunden ist rund ein Megabyte;
 *    fünfzig Prüfungen später ist das kein Detail mehr.
 * 2. Ein Ereignis ist ein Zeitpunkt, kein Zustand. Wer eine Sekunde zu spät
 *    zuhört, erfährt nichts. Genau das passiert beim Zeichnen einer Ebene, die
 *    erst nach dem Ereignis aufgebaut wird.
 *
 * Deshalb: Der Wert steht hier, das Ereignis sagt nur **dass** es ihn gibt.
 * Wer ihn braucht, holt ihn — auch später noch.
 *
 * ## Und warum er nicht in die Datenbank gehört
 *
 * Das Ergebnis der laufenden Sitzung ist flüchtig. Beim nächsten Öffnen der
 * Maschine steht die Ebene wieder auf `ready` und zeigt die letzte Prüfung als
 * Auskunft — nicht als Ergebnis, vor dem man gerade steht. Die Bewertung selbst
 * liegt ohnehin in der Diagnose-Tabelle; hier liegt nur, was für die Dauer des
 * Hinsehens gebraucht wird.
 */

/**
 * Es liegt ein Prüfergebnis vor. `detail` trägt nur die Maschinen-Kennung —
 * die Fracht holt sich der Empfänger mit `holeErgebnis()`.
 */
export const PRUEFUNG_FERTIG = 'zanobot:pruefung-fertig';

export interface Pruefergebnis {
  maschinenId: string;
  /** Kennung der gespeicherten Diagnose — dieselbe wie die der Aufnahme. */
  diagnoseId: string;
  /** Der Ähnlichkeitswert, 0–100. */
  wert: number;
  zeitpunkt: number;
  /** Der Normalzustand, gegen den verglichen wurde. */
  referenz: AudioBuffer | null;
  /** Die Aufnahme dieser Prüfung. */
  messung: AudioBuffer | null;
}

let ergebnis: Pruefergebnis | null = null;

/**
 * Ein Ergebnis hinterlegen und es ansagen.
 *
 * Erst hinterlegen, dann ansagen — in der anderen Reihenfolge käme ein
 * Empfänger, der sofort nachfragt, auf einen leeren Platz.
 */
export function merkeErgebnis(neu: Pruefergebnis): void {
  ergebnis = neu;
  document.dispatchEvent(
    new CustomEvent<{ machineId: string }>(PRUEFUNG_FERTIG, {
      detail: { machineId: neu.maschinenId },
    })
  );
}

/** Das Ergebnis dieser Maschine — oder `null`, wenn keines vorliegt. */
export function holeErgebnis(maschinenId: string): Pruefergebnis | null {
  return ergebnis && ergebnis.maschinenId === maschinenId ? ergebnis : null;
}

/**
 * Das Ergebnis vergessen und die Aufnahmen loslassen.
 *
 * Aufzurufen, wenn der Nutzer die Maschine verlässt. Ein Ergebnis, das man
 * nicht mehr ansieht, hält sonst zwei Aufnahmen fest, bis die Seite neu lädt.
 */
export function vergissErgebnis(): void {
  ergebnis = null;
}
