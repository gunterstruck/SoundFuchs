/**
 * WAS DIE SUCHE FINDET — die Regel, getrennt vom Zeichnen
 *
 * ## Der Anlass
 *
 * Der Auftraggeber am 24.08.2026, mit einem Bildschirmfoto: „brau" im Suchfeld,
 * und nichts passiert. Gemessen an den Beispieldaten (100 Standorte, 130
 * Maschinen):
 *
 *     „brau"        →  Nichts gefunden.       (es gibt Brauerei-Standorte)
 *     „Bremen"      →  Nichts gefunden.       (es gibt Standorte dort)
 *     „28"          →  „Extruder 2"           (getroffen über `demo-m-28`)
 *     „Kompressor"  →  8 Maschinen  ✓
 *
 * Der Grund: Die Suche las ausschließlich `getAllMachines()`. **Standorte kamen
 * gar nicht vor** — obwohl das Feld seit jeher „Standort, Maschine, PLZ suchen…"
 * verspricht. Und „28" traf eine interne Kennung, die dem Nutzer nichts sagt.
 *
 * ## Warum das hier steht und nicht in `GlobalSearch`
 *
 * Eine Trefferregel, die nur über ein Eingabefeld mit hundert Standorten
 * dahinter erreichbar ist, wird nie widerlegt. Hier ist sie eine reine
 * Funktion: Eingabe rein, Treffer raus, prüfbar in Millisekunden.
 *
 * ## Was gesucht wird
 *
 *     Standort   Name · Postleitzahl · Ort
 *     Maschine   Name · Standort-Vermerk (`location`)
 *
 * ## Was NICHT gesucht wird: die Straße
 *
 * Es gibt sie nicht. `Customer` hat Name, PLZ und Ort — die Straße ist beim
 * Entwurf ausdrücklich verworfen worden (§4a des Papiers: „Kundendaten haben
 * PLZ, Stadt und ggf. die zugehörigen Maschinen — nichts weiter"). Nach etwas
 * zu suchen, das nirgends erfasst wird, wäre ein Feld, das immer schweigt.
 * Gesucht wird stattdessen der **Ort**, der dieselbe Frage beantwortet: wo?
 *
 * ## Und die Kennung nur von vorn
 *
 * `id` bleibt suchbar — wer einen QR-Code einliest, hat eine Kennung in der
 * Hand. Aber nur als **Anfang**: Sonst findet die Postleitzahl „28" die
 * Maschine `demo-m-28`, und der Nutzer bekommt auf eine Ortsfrage eine
 * Maschine, die nichts damit zu tun hat.
 */

import type { Customer, Machine } from '@data/types.js';

/** Ab so vielen Zeichen wird gesucht. Ein einzelner Buchstabe trifft fast alles. */
export const MINDESTLAENGE = 2;

/** Mehr Treffer als das passt kaum auf einen Handybildschirm. */
export const MAX_TREFFER = 8;

/** Ein Treffer ist entweder ein Standort oder eine Maschine. */
export type Treffer =
  | { art: 'standort'; kunde: Customer; titel: string; zusatz: string }
  | { art: 'maschine'; maschine: Machine; titel: string; zusatz: string };

/** Klein, ohne Rand — und für die Suche reicht das. */
function normal(text: string | undefined | null): string {
  return (text ?? '').toLowerCase().trim();
}

/**
 * Treffer für ein Suchwort.
 *
 * Standorte stehen vor Maschinen. Wer „Brauerei" tippt, meint fast immer den
 * Ort und nicht eine der Maschinen darin — und vom Standort aus sind seine
 * Maschinen einen Tipp entfernt, umgekehrt aber nicht.
 */
export function sucheTreffer(
  wort: string,
  kunden: readonly Customer[],
  maschinen: readonly Machine[],
  max: number = MAX_TREFFER
): Treffer[] {
  const w = normal(wort);
  if (w.length < MINDESTLAENGE) return [];

  const standorte: Treffer[] = kunden
    .filter(
      (k) =>
        normal(k.name).includes(w) ||
        normal(k.plz).includes(w) ||
        normal(k.ort).includes(w) ||
        normal(k.strasse).includes(w)
    )
    .map((kunde) => ({
      art: 'standort' as const,
      kunde,
      titel: kunde.name,
      // Was den Standort ausmacht, wenn der Name allein nicht reicht: zwei
      // Brauereien in zwei Städten sind sonst nicht zu unterscheiden.
      zusatz: [kunde.strasse, [kunde.plz, kunde.ort].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · '),
    }));

  const geraete: Treffer[] = maschinen
    .filter((m) => {
      if (normal(m.name).includes(w)) return true;
      if (normal(m.location).includes(w)) return true;
      // Die Kennung NUR von vorn — siehe Kopf dieser Datei.
      return normal(m.id).startsWith(w);
    })
    .map((maschine) => ({
      art: 'maschine' as const,
      maschine,
      titel: maschine.name,
      zusatz: maschine.location ?? '',
    }));

  /**
   * Innerhalb der Maschinen: zuletzt geprüfte zuerst.
   *
   * Wer sucht, meint meist die Maschine, an der er gerade war. Standorte haben
   * keine solche Spur und behalten die Reihenfolge des Bestands.
   */
  geraete.sort(
    (a, b) =>
      ((b.art === 'maschine' ? b.maschine.lastDiagnosisAt : 0) ?? 0) -
      ((a.art === 'maschine' ? a.maschine.lastDiagnosisAt : 0) ?? 0)
  );

  return [...standorte, ...geraete].slice(0, max);
}
