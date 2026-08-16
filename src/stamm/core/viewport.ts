/**
 * Die eine Definition von „mobil".
 *
 * **Stamm.** Übernommen aus TourFuchs `src/core/viewport.js` (162 Zeilen),
 * nach TypeScript geschrieben. Die Zahlen, die Regel und die Begründung sind
 * unverändert — siehe `docs/nutzerreise-wie-tourfuchs.md` §0h.
 *
 * SoundFuchs kennt **genau zwei Gesichter**:
 *
 *   - **phone**   – unterwegs. Blatt unten, Karte und Standorte.
 *   - **desktop** – Schreibtisch. Seitenleiste, alle Reiter.
 *
 * Ein Tablet ist kein drittes Gesicht. Es ist beides, je nachdem, wie man es
 * hält: **hochkant unterwegs, quer Schreibtisch.**
 *
 * ## Warum dieses Modul existiert
 *
 * TourFuchs hatte bis Version 3.1 keine Definition von „mobil", sondern vier
 * unabhängig gewachsene Schwellen: 560, 768/769, 900/901 und eine eigene
 * Blatt-Abfrage. Auf einem Galaxy Tab S6 Lite hochkant (~800 px) griffen
 * einige davon und andere nicht, und heraus kam ein Zwitter: Blatt-Geometrie
 * und Handy-Checkliste, aber Desktop-Kartenpopups und offenes Cockpit.
 *
 * Schlimmer noch: **Hochkant war nicht gleich hochkant.** Ein 744-px-Tablet
 * fiel unter 768 und bekam ein sauberes Handy, ein 800-px-Tablet den Zwitter,
 * ein 1024-px-Tablet noch mehr davon. Dieselbe Haltung, drei Produkte – kein
 * Entwurf, sondern ein Nebeneinander von Schwellen, die niemand zusammen
 * gelesen hat.
 *
 * SoundFuchs erbt diesen Fehler nicht, weil es die Lösung mit übernimmt statt
 * die Schwellen neu zu erfinden.
 *
 * ## Warum die Orientierung entscheidet und nicht die Pixelbreite
 *
 * Die Breite in Pixeln ist dem Nutzer unbekannt und je Gerät verschieden –
 * genau daraus sind die drei Hochkant-Produkte entstanden. Die **Haltung**
 * dagegen bestimmt er selbst und sieht sie. „Quer ist Schreibtisch, hochkant
 * ist unterwegs" versteht man einmal und schlägt es nie wieder nach.
 *
 * Der Preis ist ehrlich zu benennen: Ein großes Tablet hochkant hätte Platz
 * fürs Cockpit und bekommt es trotzdem nicht. Das ist kein Verlust, sondern
 * eine Verlegung – die Funktion ist **eine Drehung entfernt**, und eine
 * Drehung ist billiger als ein drittes Layout im Kopf.
 */

/** Das Gesicht der Oberfläche. Zwei, nicht drei. */
export type Gesicht = 'phone' | 'desktop';

/** Ab hier ist auch hochkant Schreibtisch (Desktopmonitor im Hochformat). */
export const TABLET_MAX_WIDTH = 1200;

/** Bis hier ist es immer unterwegs, egal wie gehalten. */
export const PHONE_MAX_WIDTH = 768;

/** Handy quer: breit, aber zu flach für den Schreibtisch. */
const SHORT_LANDSCAPE_MAX_WIDTH = 900;
const SHORT_LANDSCAPE_MAX_HEIGHT = 520;

/**
 * Die Regel als Medienabfrage – wortgleich zu `faceFor()`.
 * CSS und TypeScript müssen dieselbe Grenze ziehen, sonst entsteht genau der
 * Zwitter wieder, den dieses Modul beseitigt.
 */
export const PHONE_FACE_MEDIA = [
  `(max-width: ${PHONE_MAX_WIDTH}px)`,
  `(max-width: ${TABLET_MAX_WIDTH}px) and (orientation: portrait)`,
  `(max-width: ${SHORT_LANDSCAPE_MAX_WIDTH}px) and (max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px)`,
].join(', ');

/**
 * Die Gegenprobe – **exakt** die Verneinung von `PHONE_FACE_MEDIA`.
 *
 * Zwei Gesichter heißt: Jedes Fenster gehört zu genau einem. Solange die
 * Schreibtisch-Abfrage nur „ab 769 quer" lautete, war das nicht wahr – ein
 * Handy quer (880×500) traf beide Listen und bekam Blatt-Geometrie **und**
 * Desktop-Regeln übereinander. Ein Zwitter entsteht nicht nur durch eine
 * dritte Abfrage, sondern genauso durch zwei, die sich überlappen.
 *
 * Ausgerechnet aus der Verneinung der drei Handy-Teile:
 *   nicht(w ≤ 768) und nicht(w ≤ 1200 und hochkant) und nicht(w ≤ 900 und h ≤ 520)
 * = w ≥ 769 und (w ≥ 1201 oder quer) und (w ≥ 901 oder h ≥ 521)
 * und als Vereinigung geschrieben:
 */
export const DESKTOP_FACE_MEDIA = [
  `(min-width: ${TABLET_MAX_WIDTH + 1}px)`,
  `(min-width: ${SHORT_LANDSCAPE_MAX_WIDTH + 1}px) and (orientation: landscape)`,
  `(min-width: ${PHONE_MAX_WIDTH + 1}px) and (orientation: landscape) and (min-height: ${SHORT_LANDSCAPE_MAX_HEIGHT + 1}px)`,
].join(', ');

/** Was dieses Modul von einer Medienabfrage braucht — nicht mehr. */
interface Abfrage {
  readonly matches: boolean;
  addEventListener(typ: 'change', hoerer: (ereignis: { matches: boolean }) => void): void;
  removeEventListener(typ: 'change', hoerer: (ereignis: { matches: boolean }) => void): void;
}

/** Eine tote Attrappe für Umgebungen ohne `matchMedia` (Tests, SSR). */
const FALLBACK_QUERY: Abfrage = Object.freeze({
  matches: false,
  addEventListener() {
    /* nichts zu melden */
  },
  removeEventListener() {
    /* nichts abzumelden */
  },
});

export interface Fenstermass {
  width: number;
  height?: number;
  /** Ohne Angabe entscheidet das Seitenverhältnis. */
  portrait?: boolean;
}

/**
 * Das Gesicht zu einer Fenstergeometrie. Reine Funktion – der Rechenweg
 * gehört getestet, das Fenster liegt in der Oberfläche.
 */
export function faceFor(viewport?: Partial<Fenstermass>): Gesicht {
  const w = Number(viewport?.width);
  const h = Number(viewport?.height);
  if (!Number.isFinite(w)) return 'desktop';
  // Ohne ausdrückliche Angabe entscheidet das Seitenverhältnis.
  const isPortrait =
    typeof viewport?.portrait === 'boolean'
      ? viewport.portrait
      : Number.isFinite(h)
        ? h >= w
        : false;

  if (w <= PHONE_MAX_WIDTH) return 'phone';
  if (isPortrait && w <= TABLET_MAX_WIDTH) return 'phone';
  if (w <= SHORT_LANDSCAPE_MAX_WIDTH && Number.isFinite(h) && h <= SHORT_LANDSCAPE_MAX_HEIGHT) {
    return 'phone';
  }
  return 'desktop';
}

/** Die Medienabfrage für das Unterwegs-Gesicht (oder eine tote Attrappe im Test). */
export function phoneFaceQuery(): Abfrage {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return FALLBACK_QUERY;
  }
  return window.matchMedia(PHONE_FACE_MEDIA);
}

let cachedQuery: Abfrage | null = null;
function query(): Abfrage {
  if (!cachedQuery) cachedQuery = phoneFaceQuery();
  return cachedQuery;
}

/** Nur für Tests: die gemerkte Abfrage vergessen. */
export function vergissAbfrage(): void {
  cachedQuery = null;
}

export function currentFace(): Gesicht {
  if (typeof window === 'undefined') return 'desktop';
  // Die Medienabfrage ist die Wahrheit – sie folgt derselben Zeichenkette
  // wie das CSS. `faceFor()` ist der testbare Zwilling, nicht die Quelle.
  return query().matches ? 'phone' : 'desktop';
}

/** Unterwegs: Handy immer, Tablet hochkant. */
export function isPhoneUi(): boolean {
  return currentFace() === 'phone';
}

/** Schreibtisch: Desktop immer, Tablet quer. */
export function isDesktopUi(): boolean {
  return currentFace() === 'desktop';
}

/**
 * Eine geerbte Orientierungssperre lösen.
 *
 * Eine **installierte** PWA behält das Manifest ihres Installationszeitpunkts.
 * Stand darin einmal `orientation: 'portrait'`, hängt das Gerät bis heute im
 * Hochformat fest, obwohl die Sperre im Quelltext längst entfernt ist. Auf
 * einem Tablet ist das der Unterschied zwischen „Schreibtisch per Drehung" und
 * „geht gar nicht" — in TourFuchs nachgewiesen auf einem Galaxy Tab S6 Lite,
 * auf dem das System sauber drehte und nur die Anwendung nicht.
 *
 * `releaseInheritedOrientationLock()` nimmt genau diese Sperre zur Laufzeit
 * zurück. Es ist bewusst folgenlos, wo es nichts zu lösen gibt, und wird von
 * Browsern ohne die Schnittstelle stillschweigend übergangen.
 */
export function releaseInheritedOrientationLock(): void {
  try {
    globalThis.screen?.orientation?.unlock?.();
  } catch {
    /* Ohne Sperre wirft manches Umfeld – das ist genau der gute Fall. */
  }
}

/**
 * Auf einen **Wechsel des Gesichts** hören – nicht auf jede Größenänderung.
 *
 * Ein Fenster, das breiter gezogen wird, ohne die Grenze zu überschreiten,
 * darf nichts zurücksetzen. Nur der Übergang zählt, und der Rückruf bekommt
 * das neue Gesicht, damit niemand es erneut abfragen muss.
 *
 * @returns Abmelder
 */
export function onFaceChange(handler: (gesicht: Gesicht) => void): () => void {
  const media = query();
  const listener = (ereignis: { matches: boolean }): void => {
    handler(ereignis.matches ? 'phone' : 'desktop');
  };
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
