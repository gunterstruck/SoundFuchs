/**
 * Wie ein Maschinenstandort auf der Karte aussieht.
 *
 * **Stamm.** Übernommen aus TourFuchs `src/features/customerMarkers.js`, nach
 * TypeScript geschrieben. Die Schwellen sind mitgebracht, nicht neu gewählt —
 * wer sie ändert, ändert das Vorbild und muss das begründen.
 *
 * Entfallen ist, was an TourFuchs' Fachlichkeit hing: `customerClusterSummary`
 * färbte den Stapel nach Vertriebsgebiet, `canOfferCustomerMarkerHint` gehörte
 * zu den Live-Demos. An die Stelle der Gebietsfarbe tritt der Zustand der
 * Maschinen — dieselbe Idee, anderer Gegenstand (§0h).
 *
 * ## Warum eine eigene Datei für vier Funktionen
 *
 * Weil sie rein sind. Zoomstufe rein, Stufe raus; keine Karte, kein Leaflet,
 * kein Dokument. Das macht sie prüfbar, ohne einen Browser zu starten — und
 * genau die Zahlen darin sind es, die man beim Umbau versehentlich verstellt.
 */

import type { Zustand } from '../../services/bestandsuebersicht.js';

/**
 * Progressive Offenlegung auf der Karte: Erst Orientierung, dann ein klar
 * anklickbares Objekt, danach Identität und schließlich ein kompakter Kontext.
 */
export const MARKERSTUFEN = Object.freeze(['dot', 'card', 'label', 'detail'] as const);
export type Markerstufe = (typeof MARKERSTUFEN)[number];

export const STANDARDFARBE = '#0d9488';

/**
 * Die Farben der vier Zustände.
 *
 * TourFuchs färbt den Marker nach Vertriebsgebiet, weil das dort die Frage
 * ist, die man von weitem beantwortet haben will. Hier ist die Frage eine
 * andere: Wie geht es den Maschinen? Die Form bleibt — ein farbiger Punkt,
 * dessen Farbe von weitem trägt —, der Gegenstand wechselt.
 *
 * Grau für „ungeprüft" ist Absicht und keine Verlegenheit: Ein Standort ohne
 * Referenzaufnahme ist nicht gesund, er ist unbekannt. Ihn grün zu zeigen
 * hieße, eine Auskunft zu geben, die es nicht gibt.
 */
export const ZUSTANDSFARBEN: Readonly<Record<Zustand, string>> = Object.freeze({
  gesund: '#16a34a',
  warnung: '#f59e0b',
  kritisch: '#dc2626',
  ungeprueft: '#94a3b8',
});

export function farbeFuerZustand(zustand: Zustand): string {
  return ZUSTANDSFARBEN[zustand] ?? STANDARDFARBE;
}

/**
 * Welche Stufe zeigt der Marker bei dieser Zoomstufe?
 *
 * Namen verdecken in der Stadtansicht schnell die Nachbarn. Deshalb bleiben
 * die kleinen Clips bewusst länger stehen: Namen erscheinen erst im echten
 * Nahbereich, wenn wirklich deutlich hineingezoomt wurde — darunter reicht der
 * kompakte Clip zur Orientierung. Aus dem Stamm, samt Zahlen.
 */
export function markerstufe(zoom: number, { mobil = false }: { mobil?: boolean } = {}): Markerstufe {
  const wert = Number(zoom) || 0;
  const labelZoom = mobil ? 15 : 14;
  const detailZoom = mobil ? 16.5 : 15.5;
  if (wert >= detailZoom) return 'detail';
  if (wert >= labelZoom) return 'label';
  if (wert >= 8) return 'card';
  return 'dot';
}

/**
 * Die Klasse, die der Kartenbehälter trägt.
 *
 * Der Name bleibt `customer-marker-mode-*`, obwohl aus dem Kunden ein
 * Maschinenstandort geworden ist: Das Stamm-CSS spricht diese Klassen an, und
 * das CSS ist unverändert übernommen. Ein Umbenennen hier hieße, den Stamm
 * anzufassen — und damit die Möglichkeit zu verlieren, ihn mit TourFuchs zu
 * vergleichen. Die Umbenennung endet an der Oberfläche, wo sie hingehört.
 */
export function markerstufeKlasse(stufe: Markerstufe | string): string {
  const sicher = (MARKERSTUFEN as readonly string[]).includes(stufe) ? stufe : 'dot';
  return `customer-marker-mode-${sicher}`;
}

/**
 * Pixelradius für die Verdichtung. In dichten Stadtansichten bleiben Stapel
 * bewusst länger zusammen; erst im Nahbereich entstehen Einzelmarker.
 *
 * Aus dem Stamm. SoundFuchs hatte hier eine feste 45 — das ist über alle
 * Zoomstufen dieselbe Zahl und deshalb überall ein bisschen falsch: auf
 * Deutschland-Zoom zu klein (ein Teppich aus Stapeln), im Nahbereich zu groß
 * (Nachbarn kleben zusammen, obwohl Platz ist).
 */
export function stapelradius(zoom: number, { mobil = false }: { mobil?: boolean } = {}): number {
  const wert = Number(zoom) || 0;
  if (wert <= 6) return mobil ? 112 : 104;
  if (wert <= 8) return mobil ? 124 : 116;
  if (wert <= 10) return mobil ? 120 : 112;
  if (wert <= 12) return mobil ? 104 : 92;
  // Im Nahbereich enger stapeln, damit verteilte Kleingruppen (≤5) beim
  // Hineinzoomen von selbst zu Einzelmarkern werden — man sieht, wo sie sitzen.
  if (wert <= 14) return mobil ? 58 : 48;
  return mobil ? 34 : 28;
}

/**
 * Der Name, wie er auf der Karte steht.
 *
 * Aus dem Stamm (`customerMarkerLabel`): Beispieldaten tragen im Bestand ein
 * Präfix, damit sie sich beim Löschen sicher wiederfinden lassen — hier steht
 * dann „SoundFuchs Demo · Gießerei 0081". Das Präfix ist Buchhaltung, nicht
 * Auskunft: Auf der Karte kostet es die halbe Zeile, und dass es Demodaten
 * sind, sagt das Abzeichen daneben ohnehin.
 *
 * Weggenommen wird es nur für die Anzeige. Im Bestand bleibt der Name, wie er
 * ist — sonst fände `entferneBeispieldaten` seine eigenen Sätze nicht mehr.
 */
export function standortname(name: string, { demo = false }: { demo?: boolean } = {}): string {
  const wert = String(name ?? '').trim();
  if (!demo) return wert;
  return wert.replace(/^SoundFuchs Demo\s*·\s*/i, '') || wert;
}

export interface Stapelbefund {
  anzahl: number;
  /** Der schlechteste Zustand im Stapel — er bestimmt die Farbe. */
  zustand: Zustand;
  farbe: string;
}

/** Von gut nach schlecht. Der letzte, der vorkommt, gewinnt. */
const RANGFOLGE: readonly Zustand[] = ['gesund', 'ungeprueft', 'warnung', 'kritisch'];

/**
 * Was ein Stapel aussagt.
 *
 * Die Farbe richtet sich nach dem schlechtesten Standort darin — genauso, wie
 * sich der Zustand eines Standorts nach seiner schlechtesten Maschine richtet
 * (`bestandsuebersicht.ts`). Ein Stapel, der nach dem Durchschnitt grün wäre,
 * obwohl eine kritische Anlage darin steckt, verdeckt genau das, wofür man
 * auf die Karte schaut.
 *
 * „Ungeprüft" steht in der Rangfolge über „gesund", aber unter „Warnung": Es
 * ist schlechter als eine bestandene Prüfung und besser als eine gerissene.
 */
export function stapelbefund(zustaende: readonly Zustand[]): Stapelbefund {
  const anzahl = zustaende.length;
  let schlimmster: Zustand = 'gesund';
  for (const z of zustaende) {
    if (RANGFOLGE.indexOf(z) > RANGFOLGE.indexOf(schlimmster)) schlimmster = z;
  }
  return { anzahl, zustand: schlimmster, farbe: farbeFuerZustand(schlimmster) };
}
