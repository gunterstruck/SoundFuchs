/**
 * Ereignisse zwischen Ablauf und Schale.
 *
 * Der Router weiß nicht, dass es eine Schale gibt, und soll es auch nicht
 * wissen — sonst hinge die geprüfte Reise an einem Umbau, der sie gar nicht
 * betrifft. Er sagt nur, was geschehen ist; wer zuhört, entscheidet selbst,
 * was das für ihn bedeutet. Dieselbe Form wie `VIEW_LEVEL_EVENT`.
 */

/**
 * Eine Maschine ist gewählt, der nächste Schritt ist gleich im Bild.
 *
 * `abschnitt` nennt die ID des Abschnitts, den der Ablauf gleich aufklappt und
 * anspringt — ohne Referenz die Aufnahme, mit Referenz die Prüfung.
 */
export const MASCHINE_GEWAEHLT = 'zanobot:maschine-gewaehlt';

export interface MaschineGewaehltDetail {
  abschnitt: string;
  /** Der Name der Maschine — er steht in der Zoomleiste über dem Prüfablauf. */
  name: string;
}

/**
 * Die Maschine ist wieder losgelassen — zurück aus dem Prüfablauf.
 *
 * Die Schale meldet das, nicht der Ablauf: Sie ist es, die den Weg zurück
 * anbietet. Wer zuhört, kann seinen Zustand aufräumen.
 */
export const MASCHINE_LOSGELASSEN = 'zanobot:maschine-losgelassen';
