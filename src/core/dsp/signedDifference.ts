/**
 * ZANOBOT — DER UNTERSCHIED MIT VORZEICHEN
 *
 * Die hörbare Differenz (`core/audio/differenceIsolation.ts`) kennt nur eine
 * Richtung. Sie rechnet
 *
 *   keep = max(0, |M| − α · g · R)
 *
 * und schneidet damit alles Negative ab. Was neu dazugekommen ist, bleibt
 * stehen; was **verschwunden** ist, wird zu Null — unsichtbar und unhörbar.
 * Wegen der Übersubtraktion (α = 1,6) verschwindet sogar, was nur leiser
 * geworden ist.
 *
 * Das ist für das Ohr richtig: Ein Ton, der fehlt, lässt sich nicht abspielen.
 * Für das AUGE ist es falsch. „Der Lüfter läuft nicht mehr" ist oft
 * aussagekräftiger als „da ist etwas Neues" — und genau das war bisher
 * nirgends zu sehen.
 *
 * ## Was hier gerechnet wird
 *
 * Pro Anzeigeband und Zeitschritt der Messung:
 *
 *   Δ dB = Pegel(Messung) − Pegel(Normalzustand) − Versatz
 *
 * Positiv heißt „lauter als im Normalzustand", negativ „leiser". Die Höhe im
 * Gebirge ist der BETRAG, die Farbe das Vorzeichen.
 *
 * ## Warum über den Anzeigebändern und nicht über der FFT
 *
 * Die drei bisherigen Quellen (Messung, Normalzustand, Unterschied) benutzen
 * dieselbe logarithmische Bandachse. Eine vierte Ansicht mit eigener Achse wäre
 * nicht vergleichbar — man würde Spalten nebeneinanderlegen, die verschiedene
 * Frequenzen meinen. Also wird auf denselben Bändern gerechnet, aus denen die
 * anderen drei schon bestehen.
 *
 * ## Der Versatz
 *
 * Zwei Aufnahmen derselben Maschine unterscheiden sich fast immer im
 * Gesamtpegel — Mikrofonabstand, Verstärkung, Hintergrund. Ohne Ausgleich wäre
 * das Bild einfarbig: alles lauter oder alles leiser.
 *
 * Ausgeglichen wird mit dem **Median** aller Bandunterschiede, nicht mit dem
 * Mittelwert. Der Median ist unempfindlich gegen wenige stark veränderte
 * Bänder — und die sind genau das, was gesucht wird. Ein Mittelwert würde einen
 * kräftigen neuen Ton in den Versatz einrechnen und ihn damit teilweise selbst
 * wieder wegkürzen.
 *
 * ## Sie urteilt nicht
 *
 * Wie die Hör-Lupe: eine Darstellung, keine Diagnose. Sie zeigt, wo es lauter
 * und wo es leiser wurde. Warum, sagt sie nicht.
 */

import {
  SPECTROGRAM_DB_RANGE,
  type SpectrogramMatrix,
} from './spectrogram.js';

/**
 * Sichtbarer Bereich des Unterschieds (dB, in beide Richtungen).
 *
 * Enger als die 50 dB der Pegelansicht, und mit Absicht: Ein Unterschied von
 * 24 dB ist bereits gewaltig — das Achtfache an Amplitude. Ein weiteres Fenster
 * würde alle üblichen Unterschiede flach an den Boden drücken.
 */
export const SIGNED_DB_RANGE = 24;

/** Aus dem auf [0,1] normierten Anzeigewert wieder dB machen. */
function zuDezibel(wert: number, maxDb: number): number {
  return maxDb + (wert - 1) * SPECTROGRAM_DB_RANGE;
}

/** Median einer Zahlenreihe. Verändert die übergebene Reihe (Sortierung). */
export function median(werte: Float64Array): number {
  if (werte.length === 0) return 0;
  werte.sort();
  const mitte = werte.length >> 1;
  return werte.length % 2 === 1 ? werte[mitte] : (werte[mitte - 1] + werte[mitte]) / 2;
}

/**
 * Das mittlere Bandprofil einer Matrix in dB.
 *
 * Gemittelt wird über die Zeit — der Normalzustand geht als **ein** Profil in
 * den Vergleich ein, genau wie im Hörpfad. Damit spielt es keine Rolle, dass
 * Normalzustand und Messung verschieden lang sind: Verglichen wird jeder
 * Zeitschritt der Messung gegen dieses Profil.
 */
export function bandprofilDb(matrix: SpectrogramMatrix): Float64Array {
  const profil = new Float64Array(matrix.cols);
  if (matrix.rows === 0) return profil;
  for (let r = 0; r < matrix.rows; r++) {
    const zeile = r * matrix.cols;
    for (let c = 0; c < matrix.cols; c++) {
      profil[c] += zuDezibel(matrix.values[zeile + c], matrix.maxDb);
    }
  }
  for (let c = 0; c < matrix.cols; c++) profil[c] /= matrix.rows;
  return profil;
}

/**
 * Der Unterschied zwischen Messung und Normalzustand, mit Vorzeichen.
 *
 * Zeilen und Zeitachse kommen von der **Messung** — sie ist das, was gerade
 * passiert; der Normalzustand steuert nur sein Profil bei.
 *
 * @returns `null`, wenn die beiden Matrizen nicht auf derselben Bandachse
 *          liegen — dann wäre jeder Vergleich ein Vergleich von Äpfeln mit
 *          Birnen, und ein leeres Bild ist ehrlicher als ein falsches.
 */
export function signedDifferenceMatrix(
  referenz: SpectrogramMatrix,
  messung: SpectrogramMatrix
): SpectrogramMatrix | null {
  if (referenz.cols !== messung.cols) return null;
  if (messung.rows < 2 || referenz.rows < 1) return null;

  const profil = bandprofilDb(referenz);
  const anzahl = messung.rows * messung.cols;

  // Erst alle Bandunterschiede, dann ihr Median als Versatz.
  const roh = new Float64Array(anzahl);
  for (let r = 0; r < messung.rows; r++) {
    const zeile = r * messung.cols;
    for (let c = 0; c < messung.cols; c++) {
      roh[zeile + c] = zuDezibel(messung.values[zeile + c], messung.maxDb) - profil[c];
    }
  }
  const versatz = median(Float64Array.from(roh));

  const values = new Float32Array(anzahl);
  const signs = new Int8Array(anzahl);
  let groesster = 0;
  for (let i = 0; i < anzahl; i++) {
    const delta = roh[i] - versatz;
    const betrag = Math.abs(delta);
    if (betrag > groesster) groesster = betrag;
    values[i] = Math.min(1, betrag / SIGNED_DB_RANGE);
    signs[i] = delta >= 0 ? 1 : -1;
  }

  return {
    values,
    signs,
    rows: messung.rows,
    cols: messung.cols,
    durationSec: messung.durationSec,
    maxFreqHz: messung.maxFreqHz,
    // Die Höhe ist hier ein UNTERSCHIED, kein Pegel. `maxDb` trägt deshalb den
    // größten aufgetretenen Betrag — die Achse beschriftet sich danach.
    maxDb: Math.min(SIGNED_DB_RANGE, Math.round(groesster)),
    bandEdgesHz: messung.bandEdgesHz,
    hoehe: 'unterschied',
  };
}
