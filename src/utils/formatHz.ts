/**
 * ZANOBOT — FREQUENZ ALS TEXT
 *
 * Eine Stelle für die Schreibweise von Frequenzen in der Oberfläche: unter
 * 1 kHz in Hz, darüber in kHz mit einer Nachkommastelle (und ohne die
 * überflüssige Null bei runden Werten). Das Dezimalzeichen folgt der Sprache.
 *
 * Gebündelt, weil die 3D-Achse und der Transponier-Knopf dieselbe Zahl zeigen —
 * zwei Schreibweisen für dieselbe Frequenz lesen sich wie zwei Messungen.
 */

/** Frequenz für die Anzeige formatieren, z. B. „850 Hz", „3 kHz", „16,2 kHz". */
export function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  const khz = hz / 1000;
  const text = khz % 1 === 0 ? khz.toFixed(0) : khz.toFixed(1);
  return `${text.replace('.', ',')} kHz`;
}
