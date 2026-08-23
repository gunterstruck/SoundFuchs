/**
 * DIE REIHE — WELCHE VON DIESEN FÄLLT AUF?
 *
 * Eine einzelne Prüfung beantwortet eine Frage über EINE Maschine: „Klingt sie
 * wie ihr eigener Normalzustand?" Der Flottenlauf beantwortet eine andere:
 * „Welche dieser gleichartigen Maschinen fällt aus der Reihe?" Das ist keine
 * Wiederholung der ersten Frage, sondern eine zweite.
 *
 * ## Was verglichen wird — und was nicht
 *
 * Verglichen werden nicht die Maschinen miteinander, sondern ihre **Abstände
 * zum jeweils eigenen Normalzustand**. Vier Rührwerke, jedes gegen sein
 * eigenes früheres Ich: Wessen Abstand sticht heraus?
 *
 * Der Unterschied ist wichtig für den Satz, der am Ende dasteht. „Rührwerk 3
 * klingt anders als die anderen" wäre falsch — es kann bauartbedingt anders
 * klingen und trotzdem völlig unverändert sein. Richtig ist: „Rührwerk 3
 * weicht stärker von seinem Normalzustand ab als die anderen."
 *
 * ## Warum Median und MAD
 *
 * Die Schwelle kommt aus `fleetStats.ts` und ist `Median − 2·MAD`. Der
 * Mittelwert wäre die naheliegende Wahl und die falsche: Ein einzelner
 * Ausreißer zieht ihn zu sich und macht sich damit selbst unauffällig. Genau
 * den will man hier finden.
 *
 * ## Was hier NICHT steht
 *
 * Eine Ursache. Die App hört einen Unterschied; sie sieht kein Lager, keine
 * Unwucht und keinen Riemen. Der Befund heißt „fällt aus der Reihe", und was
 * das bedeutet, entscheidet ein Mensch vor der Maschine.
 */

import { calculateFleetStats, type FleetStats } from '@ui/phases/fleetStats.js';

/** Eine Maschine der Reihe mit ihrem Abstand zum eigenen Normalzustand. */
export interface Reihenglied {
  id: string;
  name: string;
  /** Ähnlichkeit zum eigenen Normalzustand in Prozent, oder `null` (ungeprüft). */
  wert: number | null;
}

/** Was die Reihe ergeben hat. */
export interface Reihenbefund {
  /** Wer unter der Schwelle liegt — nach Auffälligkeit, die stärkste zuerst. */
  auffaellige: Reihenglied[];
  /** Wie viele einen Wert haben. */
  geprueft: number;
  /** Wie viele in der Reihe standen. */
  gesamt: number;
  /** Niedrigster und höchster Wert — der Beleg unter dem Satz. */
  spanne: { von: number; bis: number } | null;
  /** Die Kennzahlen, für alles, was sie noch braucht. */
  kennzahlen: FleetStats | null;
  /**
   * Lässt sich hier überhaupt jemand einordnen?
   *
   * Erst ab drei Werten. Bei zweien liegt der Median genau zwischen ihnen,
   * beide weichen gleich weit ab, und die Schwelle `Median − 2·MAD` fällt
   * unter beide — rechnerisch kann bei zwei Maschinen NIE eine auffallen.
   *
   * Das ist keine Schwäche der Formel, sondern die Wahrheit über die Frage:
   * Zwei Maschinen, die verschieden klingen, sind zwei verschiedene Maschinen.
   * Welche von beiden die auffällige ist, sagt dieser Vergleich nicht — dafür
   * braucht es eine Mehrheit, von der jemand abweichen kann.
   *
   * Ohne dieses Feld stünde am Ende einer Zweierreihe „Keine fällt aus der
   * Reihe" — ein wahrer Satz, der nichts gemessen hat, und der bei 40 % gegen
   * 92 % genau das Gegenteil dessen nahelegt, was dasteht.
   */
  vergleichbar: boolean;
}

/** Ab so vielen Werten kann eine Mehrheit entstehen, von der jemand abweicht. */
export const VERGLEICHBAR_AB = 3;

/**
 * Die Reihe auswerten.
 *
 * Ungeprüfte Glieder zählen nicht mit: Wer keinen Wert hat, kann weder
 * auffallen noch die Schwelle verschieben. Sie stehen trotzdem in `gesamt` —
 * „2 von 4 geprüft" ist eine Auskunft, die der Nutzer braucht.
 *
 * Unter zwei Werten gibt es keine Reihe: Eine einzelne Maschine fällt aus
 * keiner Reihe, sie IST die Reihe.
 */
export function reihenbefund(glieder: readonly Reihenglied[]): Reihenbefund {
  const mitWert = glieder.filter(
    (g): g is Reihenglied & { wert: number } => typeof g.wert === 'number'
  );
  const kennzahlen = calculateFleetStats(mitWert.map((g) => g.wert));
  const auffaellige = kennzahlen
    ? mitWert
        .filter((g) => g.wert < kennzahlen.outlierThreshold)
        .sort((a, b) => a.wert - b.wert || a.name.localeCompare(b.name))
    : [];
  return {
    auffaellige,
    geprueft: mitWert.length,
    gesamt: glieder.length,
    spanne: kennzahlen ? { von: kennzahlen.min, bis: kennzahlen.max } : null,
    kennzahlen,
    vergleichbar: mitWert.length >= VERGLEICHBAR_AB,
  };
}

/**
 * Namen aufzählen, wie ein Mensch sie aufzählt.
 *
 * „Rührwerk 1 und Rührwerk 3", nicht „Rührwerk 1, Rührwerk 3". Bei mehr als
 * dreien wird abgekürzt — eine Aufzählung von sieben Namen liest niemand, und
 * der Satz soll eine Auskunft sein, keine Liste.
 *
 * @param und Das Wort für die letzte Verbindung, aus der Übersetzung.
 * @param weitere Die Formulierung für „und {{n}} weitere", aus der Übersetzung.
 */
export function nameNennen(
  namen: readonly string[],
  und: string,
  weitere: (anzahl: number) => string
): string {
  if (namen.length === 0) return '';
  if (namen.length === 1) return namen[0];
  if (namen.length <= 3) {
    return `${namen.slice(0, -1).join(', ')} ${und} ${namen[namen.length - 1]}`;
  }
  return `${namen.slice(0, 2).join(', ')} ${weitere(namen.length - 2)}`;
}
