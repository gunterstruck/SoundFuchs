/**
 * DER ERSTLAUF-ZUSTAND AN EINER STELLE
 *
 * `body.zb-first-run` entscheidet, ob die Startkarten in Workflow-Reihenfolge
 * mit Schritt-Marken stehen (① Maschine wählen → ② Normalzustand → ③ prüfen)
 * oder in der „Prüfen zuerst"-Anordnung für Wiederkehrer.
 *
 * ## Warum es diese Datei gibt
 *
 * Die Klasse wurde an zwei Stellen gesetzt — beim Programmstart (`main.ts`)
 * und beim Neuzeichnen der Startseite (`DashboardRenderer`). Beide lesen den
 * Bestand und schalten um. Wer eine Maschine auf einem dritten Weg anlegt,
 * kommt an keiner der beiden vorbei.
 *
 * Genau das ist am 24.08.2026 gemeldet worden: Nach dem Schnellcheck — Datei
 * mitbringen, Maschine entsteht nebenbei — blieb `zb-first-run` stehen. Die
 * App zeigte weiter den Erststart, obwohl eine Maschine da war.
 *
 * Zwei Stellen, die dasselbe entscheiden, sind schon eine zu viel; drei wären
 * die Garantie, dass sie auseinanderlaufen. Deshalb steht die Entscheidung
 * jetzt hier, und die Aufrufer sagen nur noch „sieh nach".
 */

import { getAllMachines } from '@data/db.js';
import { logger } from './logger.js';

/**
 * Nachsehen, ob der Erstlauf noch gilt, und die Klasse entsprechend setzen.
 *
 * @param anzahl Wer die Zahl schon hat, gibt sie mit — sonst wird gezählt.
 *   Das spart dem Aufrufer, der gerade ohnehin gelesen hat, einen zweiten
 *   Gang zur Datenbank, ohne die Entscheidung zu verdoppeln.
 */
export async function ersteLaufNachfuehren(anzahl?: number): Promise<void> {
  try {
    const wieviele = anzahl ?? (await getAllMachines()).length;
    document.body.classList.toggle('zb-first-run', wieviele === 0);
  } catch (fehler) {
    /**
     * Im Zweifel NICHT auf Erstlauf schalten.
     *
     * Ist der Bestand gerade nicht lesbar, weiß niemand, ob Maschinen da sind.
     * Die Klasse dann zu setzen hieße, jemandem mit dreißig Maschinen die
     * Anleitung für seine erste vorzulegen. Also bleibt stehen, was steht.
     */
    logger.warn('Erstlauf-Zustand nicht bestimmbar', fehler);
  }
}
