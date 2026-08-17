/**
 * EIN KLANG, DER NACH MASCHINE KLINGT
 *
 * Chromiums eingebautes Kunstmikrofon liefert Stille, und die App weist Stille
 * zu Recht ab („Signal is too constant or silent"). Wer eine Aufnahme messen
 * will, muss also etwas zu hören haben: `--use-file-for-fake-audio-capture`
 * spielt eine Datei ein, die hier entsteht.
 *
 * Warum an einer Stelle für alle Messwerkzeuge: `durchlauf.mjs` misst, ob der
 * Weg trägt, `wow.mjs` misst, ob er kurz ist — aber beide messen dieselbe
 * Aufnahme. Zwei Generatoren wären zwei Maschinen, und ein Unterschied im
 * Ergebnis wäre nicht mehr vom Unterschied im Ton zu trennen.
 *
 * Der feste Startwert hält den Lauf wiederholbar. Sonst wäre jedes Ergebnis ein
 * anderes und ein Rückgang nicht von Zufall zu unterscheiden.
 */
import { writeFileSync } from 'node:fs';

const ABTASTRATE = 48000;
const SEKUNDEN = 30;

/**
 * Schreibt eine WAV-Datei: 50 Hz Drehzahl-Grundton, drei Oberwellen, etwas
 * Rauschen. Mono, 16 bit — das Format, das Chromium einliest.
 *
 * @param {string} pfad Zielpfad der Datei.
 */
export function schreibeKlang(pfad) {
  const n = ABTASTRATE * SEKUNDEN;
  const daten = Buffer.alloc(n * 2);

  let saat = 7;
  const zufall = () => {
    saat = (saat * 1103515245 + 12345) & 0x7fffffff;
    return saat / 0x7fffffff;
  };

  for (let i = 0; i < n; i++) {
    const t = i / ABTASTRATE;
    let s = 0.35 * Math.sin(2 * Math.PI * 50 * t);
    s += 0.18 * Math.sin(2 * Math.PI * 100 * t);
    s += 0.1 * Math.sin(2 * Math.PI * 150 * t);
    s += 0.06 * Math.sin(2 * Math.PI * 430 * t);
    s += 0.04 * (zufall() * 2 - 1);
    daten.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 12000))), i * 2);
  }

  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0);
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write('WAVE', 8);
  kopf.write('fmt ', 12);
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20); // PCM
  kopf.writeUInt16LE(1, 22); // mono
  kopf.writeUInt32LE(ABTASTRATE, 24);
  kopf.writeUInt32LE(ABTASTRATE * 2, 28);
  kopf.writeUInt16LE(2, 32);
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36);
  kopf.writeUInt32LE(daten.length, 40);

  writeFileSync(pfad, Buffer.concat([kopf, daten]));
}
