/**
 * Die Schale: Blatt, Reiter, Kopf-Streifen.
 *
 * **Stamm.** Übernommen aus TourFuchs `src/ui/sidebar.js` — dort stehen diese
 * Mechaniken zwischen Tourplanung, Gebietseditor und Servicevertrags-Radar
 * verteilt über 1 998 Zeilen. Hier steht nur die Schale: die Teile, die das
 * Blatt tragen, die Reiter schalten und den Kopf-Streifen befüllen. Alles
 * andere ist fachlich entfallen (§0h).
 *
 * Übernommen sind namentlich:
 *   - `SIDEBAR_MIN` / `SIDEBAR_MAX` / `SHEET_MIN_HEIGHT` / `DOCK_THRESHOLD`
 *   - `sheetMaxHeight()` · `peekPx()` · `clampSheetHeight()` · `setSheetHeight()`
 *   - `initSheetGrip()` — ein Griff für Höhe, Verschieben, Tippen, Doppelklick
 *   - `applySidebar()` · `activateTab()` · `syncTopnavPlacement()`
 *
 * Die Zahlen sind nicht neu gewählt, sondern mitgebracht. Wer sie ändert,
 * ändert das Vorbild — und muss das begründen, nicht nur messen.
 *
 * ## Der Zustand
 *
 * TourFuchs hält `state.ui.sidebarOpen` und `state.ui.activeTab` in einem
 * globalen Zustandsobjekt, das auch Kunden, Touren und Gebiete trägt. Davon
 * braucht die Schale zwei Felder. Sie stehen deshalb hier, im Modul, das sie
 * benutzt — nicht in einem geteilten Behälter, der sie mit Fachdaten mischt.
 */

import { isPhoneUi, onFaceChange } from '../core/viewport.js';
import {
  tiefeIstOffen,
  schliesseTiefe,
  TIEFE_GEOEFFNET,
  TIEFE_GESCHLOSSEN,
  type TiefeDetail,
} from './scharnier.js';

/** Schmalste Breite der Seitenleiste am Schreibtisch. Aus dem Stamm. */
const SIDEBAR_MIN = 340;
/** Breiteste. Aus dem Stamm. */
const SIDEBAR_MAX = 400;
/** Reicht für Griff + Reiter. Aus dem Stamm. */
const SHEET_MIN_HEIGHT = 140;
/** So nah am linken Rand dockt die schwebende Leiste wieder an. Aus dem Stamm. */
const DOCK_THRESHOLD = 34;
/** Ab hier ist es ein Ziehen und kein Tippen. Aus dem Stamm. */
const ZIEH_SCHWELLE = 4;

const SHEET_HEIGHT_KEY = 'sf_sheet_height';
const SIDEBAR_WIDTH_KEY = 'sf_sidebar_width';
const SIDEBAR_POS_KEY = 'sf_sidebar_position';

/**
 * Die Reiter, die es gibt. Im Stamm sind es sechs, hier zwei.
 *
 * Einen Reiter „Karte" gibt es nicht mehr — im Stamm seit `19b3951` nicht und
 * hier seitdem auch nicht. Er ergab Sinn, solange die Reiter oben im
 * Kopfstreifen hingen: Dort war er der Weg, das Blatt loszuwerden. Jetzt
 * stehen sie **im** Blatt, und ein Reiter, den man im Blatt antippt, um das
 * Blatt zuzumachen, ist ein Knopf, der sich selbst wegräumt.
 *
 * Zur Karte kommt man über den Griff oder über ☰ — beides Wege, die das Blatt
 * zuziehen, statt einen Inhalt zu wechseln.
 */
export const REITER = [
  'daten',
  'filter',
  'standortblatt',
  'zweid',
  'dreid',
  'briefing',
  'details',
] as const;
export type Reiter = (typeof REITER)[number];

/**
 * Drei Reitersätze, einen je Ebene.
 *
 * Bis zum 23.08.2026 gab es nur den ersten, und er stand auch hinter dem
 * Scharnier: Wer an einer Maschine arbeitete, sah unten „📄 Standorte" und
 * „Filter" — mit gemessen leerem Inhalt.
 *
 * Welcher Satz SICHTBAR ist, entscheidet CSS über `data-ebene` (tiefe.css).
 * Diese Liste sagt nur, welcher Reiter beim Wechsel der Ebene aufgeht — denn
 * ein Blatt, dessen aktiver Reiter gerade unsichtbar wurde, zeigt gar nichts.
 */
const ERSTER_REITER: Readonly<Record<'karte' | 'standort' | 'maschine', Reiter>> = Object.freeze({
  karte: 'daten',
  standort: 'standortblatt',
  maschine: 'zweid',
});

function istReiter(wert: string | undefined): wert is Reiter {
  return !!wert && (REITER as readonly string[]).includes(wert);
}

/**
 * Die Ebene wechseln — und mit ihr den Reitersatz.
 *
 * Wird beim Öffnen und Schließen der Tiefe gerufen. Steht der offene Reiter
 * schon im richtigen Satz, bleibt er stehen: Wer zwischen Maschine und Arbeit
 * hin- und herwechselt, soll nicht jedes Mal wieder auf „2D" landen.
 */
export function reitersatzSetzen(ebene: 'karte' | 'standort' | 'maschine'): void {
  const offenerKnopf = document.querySelector<HTMLElement>(
    `.tab-button[data-tab="${zustand.reiter}"]`
  );
  if (offenerKnopf?.dataset.ebene === ebene) return;
  reiterOeffnen(ERSTER_REITER[ebene]);
}

/**
 * Der Zustand der Schale — zwei Felder, mehr braucht sie nicht.
 *
 * `blattOffen` startet abhängig vom Gesicht: Am Schreibtisch steht die
 * Seitenleiste, unterwegs liegt das Blatt auf Guckhöhe und die Karte ist frei.
 * Im Stamm steht das als `sidebarOpen: !isPhoneUi()` (core/state.js). Ohne
 * diese Zeile stand die Leiste am Schreibtisch bei x = −400 — also draußen.
 */
const zustand: {
  blattOffen: boolean;
  reiter: Reiter;
} = {
  blattOffen: !isPhoneUi(),
  reiter: 'daten',
};

/** Liegt das Panel als Blatt unten statt seitlich? Gleichbedeutend mit „unterwegs". */
export function istBlatt(): boolean {
  return isPhoneUi();
}

export function offenerReiter(): Reiter {
  return zustand.reiter;
}

export function blattIstOffen(): boolean {
  return zustand.blattOffen;
}

// ─── Ereignisse ────────────────────────────────────────────────────────────
// Der Stamm hat einen eigenen kleinen Verteiler (`emit`/`on` in core/state.js).
// Hier tut es das Dokument: Wer zuhören will, hört ohnehin schon auf
// DOM-Ereignisse, und ein zweiter Verteiler daneben wäre ein zweiter Ort, an
// dem man nach Zuhörern sucht.

export const BLATT_GEAENDERT = 'stamm:blatt-geaendert';
export const REITER_GEWECHSELT = 'stamm:reiter-gewechselt';

function melde(name: string, detail: unknown): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

// ─── Maße ──────────────────────────────────────────────────────────────────

function topbarPx(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--topbar-height');
  return parseInt(v, 10) || 52;
}

function sheetMaxHeight(): number {
  return Math.max(SHEET_MIN_HEIGHT, Math.round(window.innerHeight - topbarPx() - 8));
}

/** Sichtbare „Guckhöhe" des geschlossenen Blatts (nur der Griff schaut heraus). */
function peekPx(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--mobile-sheet-peek');
  return parseInt(v, 10) || 46;
}

function clampSheetHeight(h: number): number {
  return Math.max(SHEET_MIN_HEIGHT, Math.min(sheetMaxHeight(), Math.round(h)));
}

function setSheetHeight(h: number, merken = false): number {
  const next = clampSheetHeight(h);
  document.documentElement.style.setProperty('--sheet-height', `${next}px`);
  document.getElementById('sidebar')?.classList.add('sheet-sized');
  if (merken) {
    try {
      localStorage.setItem(SHEET_HEIGHT_KEY, String(next));
    } catch {
      /* Speicher voll oder gesperrt — die Höhe gilt trotzdem für diese Sitzung. */
    }
  }
  return next;
}

function restoreSheetHeight(): void {
  let gemerkt: string | null = null;
  try {
    gemerkt = localStorage.getItem(SHEET_HEIGHT_KEY);
  } catch {
    /* egal */
  }
  if (gemerkt) setSheetHeight(Number(gemerkt));
}

/*
 * Hier stand `topnavMasse()`: Es maß die Unterkante des Kopf-Streifens und
 * veröffentlichte sie als `--mobile-topnav-bottom`. Gebraucht hat das genau
 * eine Regel — die Karten-Knopfzeile, die **nur auf dem hochkanten Tablet** an
 * den oberen Kartenrand wanderte und dort hinter der Basis/Profi-Pille landete.
 *
 * Diese Sonderplatzierung war die letzte Stelle, an der ein Tablet etwas tat,
 * was weder das Handy noch der Schreibtisch tut. Sie ist weg: Die Knopfzeile
 * liegt unterwegs überall unten über dem eingeklappten Blatt und verschwindet,
 * sobald das Blatt aufgezogen wird (`body.sheet-open`). Damit hat das Maß
 * keinen Leser mehr — und ein Messwert ohne Leser ist kein Vorrat, sondern
 * eine Einladung, die Sonderregel zurückzuholen.
 *
 * Übernommen aus dem Stamm, Stand 19b3951.
 */

// ─── Kopf-Streifen ─────────────────────────────────────────────────────────

/**
 * Unterwegs die Ansichtstiefe (Basis/Profi) aus dem Blatt in den festen
 * Kopf-Streifen heben – so bleibt sie immer sichtbar „oben aufgehängt". Am
 * Schreibtisch wandert sie an ihre ursprüngliche Stelle in der Seitenleiste
 * zurück. Das Element behält Bezeichner und Klassen, daher greifen alle
 * bestehenden Zuhörer unverändert.
 *
 * ## Die Reiter bleiben unten
 *
 * Bis zum 16.08.2026 zogen sie mit nach oben. Der Streifen war dadurch
 * zweizeilig (gemessene 100 px statt 55) und nahm der Karte 45 px, die sie an
 * ihrer wichtigsten Stelle braucht — oben, wo man hinschaut.
 *
 * Der Stamm hat das mit `19b3951` geradegezogen, und die Begründung trägt auch
 * hier: Die Ansichtstiefe gilt für die ganze Anwendung und muss deshalb immer
 * erreichbar sein. Die Reiter dagegen schalten den Inhalt **des Blatts** um —
 * sie gehören dorthin, wo dieser Inhalt steht. Oben angeheftet wären sie eine
 * Navigation, die auf etwas zeigt, das gerade eingeklappt ist.
 */
function reiterUmhaengen(): void {
  const topnav = document.getElementById('mobile-topnav');
  const sidebar = document.getElementById('sidebar');
  const tiefe = document.getElementById('depth-switch');
  if (!topnav || !sidebar || !tiefe) return;

  const inDieLeiste = (): void => {
    // Zurück in die Seitenleiste an den ursprünglichen Ankerpunkt.
    const kartenstil = sidebar.querySelector('.basemap-control');
    if (tiefe.parentElement !== sidebar && kartenstil) sidebar.insertBefore(tiefe, kartenstil);
  };

  /**
   * Hinter dem Scharnier bleibt alles, wie es ist.
   *
   * Hier stand vom 22.08.2026 an ein dritter Fall: Bei offener Tiefe wanderte
   * der Schalter in die Leiste, weil der Kopfstreifen dort ruhte. Der
   * Auftraggeber hat am selben Tag widersprochen — er will den Streifen
   * **sehen**, nicht in einem Tipp erreichen. Jetzt ruht der Streifen nicht
   * mehr, und der Schalter bleibt, wo er unterwegs immer steht.
   */
  if (istBlatt()) {
    if (tiefe.parentElement !== topnav) topnav.appendChild(tiefe);
  } else {
    inDieLeiste();
  }
}

// ─── Anwenden ──────────────────────────────────────────────────────────────

export function schaleAnwenden(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('open', zustand.blattOffen);
  document
    .getElementById('sidebar-toggle')
    ?.setAttribute('aria-expanded', String(zustand.blattOffen));

  const griff = document.getElementById('sheet-grip');
  if (griff) {
    if (istBlatt()) {
      griff.setAttribute('aria-label', 'Panelgröße ändern');
      griff.title = 'Ziehen: Größe · Tippen: ein-/ausklappen';
    } else {
      griff.setAttribute('aria-label', 'Panel: Größe ändern oder verschieben');
      griff.title = 'Ziehen: ↕ Größe, ↔ verschieben · Doppelklick: zurück';
    }
  }

  // Ob das Blatt offen ist, entscheidet, ob von der Karte etwas zu sehen ist.
  // Als Klasse am Körper, damit schwebende Kartenelemente per CSS ausweichen
  // können, ohne den Zustand selbst nachzuhalten. Aus dem Stamm.
  document.body.classList.toggle('sheet-open', istBlatt() && zustand.blattOffen);
  melde(BLATT_GEAENDERT, zustand.blattOffen);
}

export function reiterOeffnen(reiter: Reiter): void {
  zustand.reiter = reiter;
  document.querySelectorAll<HTMLElement>('.tab-button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === reiter);
  });
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${reiter}`);
  });
  melde(REITER_GEWECHSELT, reiter);
}

/**
 * Die Karte freilegen — das Blatt zuziehen, ohne den Reiter zu wechseln.
 *
 * Aus dem Stamm (`showMapView`). Am Schreibtisch gibt es nichts freizulegen:
 * Dort steht die Karte ohnehin neben der Seitenleiste.
 */
export function zeigeKarte(): void {
  if (!istBlatt()) return;
  zustand.blattOffen = false;
  schaleAnwenden();
}

/**
 * Das Blatt aufziehen — von außen.
 *
 * Gebraucht, seit die Analyse darin liegt: „Unterschied anhören" ist weiterhin
 * die eine Handlung der Maschinenseite, aber das Werkzeug dazu steht jetzt im
 * Blatt. Eine Handlung, die auf etwas Verborgenes zeigt, ist keine.
 *
 * Am Schreibtisch steht die Leiste meist ohnehin offen; dann tut der Aufruf
 * nichts.
 */
export function blattAufziehen(): void {
  if (zustand.blattOffen) return;
  zustand.blattOffen = true;
  schaleAnwenden();
}

/** Das Blatt ganz auf die Guckhöhe zurückziehen (kein Rest). Aus dem Stamm. */
function blattEinklappen(): void {
  const sidebar = document.getElementById('sidebar');
  sidebar?.classList.remove('sheet-sized');
  document.documentElement.style.removeProperty('--sheet-height');
  try {
    localStorage.removeItem(SHEET_HEIGHT_KEY);
  } catch {
    /* egal */
  }
  zustand.blattOffen = false;
  schaleAnwenden();
}

function blattUmschalten(): void {
  const sidebar = document.getElementById('sidebar');
  if (istBlatt()) {
    zustand.blattOffen = !zustand.blattOffen;
    schaleAnwenden();
  } else if (sidebar?.classList.contains('sheet-sized')) {
    // Schreibtisch: Klick setzt auf volle Höhe zurück.
    sidebar.classList.remove('sheet-sized');
    document.documentElement.style.removeProperty('--sheet-height');
    try {
      localStorage.removeItem(SHEET_HEIGHT_KEY);
    } catch {
      /* egal */
    }
  }
}

// ─── Die schwebende Leiste am Schreibtisch ─────────────────────────────────

function sidebarPositionSetzen(pos: { left: number; top: number } | null): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (!pos) {
    sidebar.classList.remove('floating');
    sidebar.style.left = '';
    sidebar.style.top = '';
    return;
  }
  sidebar.classList.add('floating');
  sidebar.style.left = `${Math.round(pos.left)}px`;
  sidebar.style.top = `${Math.round(pos.top)}px`;
}

function sidebarPositionZuruecksetzen(): void {
  sidebarPositionSetzen(null);
  try {
    localStorage.removeItem(SIDEBAR_POS_KEY);
  } catch {
    /* egal */
  }
}

/** Eine gemerkte Schwebe-Position gilt ausschließlich am Schreibtisch. */
function sidebarPositionFuersGesicht(): void {
  if (istBlatt()) {
    sidebarPositionSetzen(null);
    return;
  }
  try {
    const roh = localStorage.getItem(SIDEBAR_POS_KEY);
    if (!roh) return;
    const pos = JSON.parse(roh) as { left?: unknown; top?: unknown };
    if (typeof pos.left === 'number' && typeof pos.top === 'number') {
      sidebarPositionSetzen({ left: pos.left, top: pos.top });
    }
  } catch {
    /* Unlesbar gemerkt ist so gut wie nicht gemerkt. */
  }
}

function breiteKlemmen(breite: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(breite)));
}

function breiteSetzen(breite: number, merken = false): void {
  const next = breiteKlemmen(breite);
  document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
  if (merken) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
    } catch {
      /* egal */
    }
  }
}

function breiteWiederherstellen(): void {
  try {
    const gemerkt = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (gemerkt) breiteSetzen(Number(gemerkt));
  } catch {
    /* egal */
  }
}

function ziehgriffBreite(): void {
  const griff = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  if (!griff || !sidebar) return;

  let zieht = false;
  griff.addEventListener('pointerdown', (ev) => {
    if (istBlatt()) return;
    zieht = true;
    griff.setPointerCapture?.(ev.pointerId);
    document.body.classList.add('sidebar-dragging');
    ev.preventDefault();
  });
  griff.addEventListener('pointermove', (ev) => {
    if (!zieht) return;
    const links = sidebar.getBoundingClientRect().left;
    breiteSetzen(ev.clientX - links);
  });
  const fertig = (): void => {
    if (!zieht) return;
    zieht = false;
    document.body.classList.remove('sidebar-dragging');
    breiteSetzen(sidebar.getBoundingClientRect().width, true);
  };
  griff.addEventListener('pointerup', fertig);
  griff.addEventListener('pointercancel', fertig);
}

// ─── Der Griff ─────────────────────────────────────────────────────────────

/**
 * Ein Griff für alles: senkrecht ziehen = Höhe ändern, waagerecht ziehen =
 * Panel verschieben (nur Schreibtisch), kurzer Klick = ein-/ausklappen bzw.
 * volle Höhe, Doppelklick = Position zurücksetzen. Die Richtung entscheidet zu
 * Beginn der Bewegung, was gemeint ist (unterwegs immer Höhe). Aus dem Stamm.
 */
function griffVerdrahten(): void {
  const griff = document.getElementById('sheet-grip');
  const sidebar = document.getElementById('sidebar');
  if (!griff || !sidebar) return;

  sidebarPositionFuersGesicht();

  let art: 'pending' | 'resize' | 'move' | null = null;
  let startX = 0;
  let startY = 0;
  let startH = 0;
  let versatzX = 0;
  let versatzY = 0;
  let bewegt = false;
  /** Vom Finger gewünschte Höhe, ungeklammert — entscheidet über „ganz zu". */
  let roheHoehe = 0;

  griff.addEventListener('pointerdown', (ev) => {
    const rect = sidebar.getBoundingClientRect();
    startX = ev.clientX;
    startY = ev.clientY;
    startH = rect.height;
    versatzX = ev.clientX - rect.left;
    versatzY = ev.clientY - rect.top;
    art = 'pending';
    bewegt = false;
    griff.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  });

  griff.addEventListener('pointermove', (ev) => {
    if (!art) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (art === 'pending') {
      if (Math.abs(dx) < ZIEH_SCHWELLE && Math.abs(dy) < ZIEH_SCHWELLE) return;
      bewegt = true;
      // Schreibtisch: überwiegend waagerecht → verschieben, sonst Größe.
      // Unterwegs: immer Größe.
      art = !istBlatt() && Math.abs(dx) > Math.abs(dy) ? 'move' : 'resize';
      document.body.classList.add(art === 'move' ? 'sidebar-dragging' : 'sheet-resizing');
      // Unterwegs aus dem geschlossenen Zustand kontinuierlich aufziehen: das
      // Blatt zunächst auf die sichtbare Guckhöhe fixieren, damit es NICHT auf
      // die volle Höhe springt, sondern von dort dem Finger folgt.
      if (art === 'resize' && istBlatt() && !zustand.blattOffen) {
        startH = setSheetHeight(peekPx());
        zustand.blattOffen = true;
        schaleAnwenden();
      }
    }
    if (art === 'resize') {
      roheHoehe = startH - dy;
      setSheetHeight(roheHoehe);
    } else if (art === 'move') {
      sidebarPositionSetzen({ left: ev.clientX - versatzX, top: ev.clientY - versatzY });
    }
  });

  const fertig = (): void => {
    if (!art) return;
    const getan = art;
    art = null;
    document.body.classList.remove('sheet-resizing', 'sidebar-dragging');
    if (!bewegt) {
      blattUmschalten();
      return;
    }
    if (getan === 'resize') {
      // Bis zum Boden gezogen = ganz einklappen (nicht bei der Mindesthöhe
      // hängenbleiben). Das Blatt kehrt sauber zur Guckhöhe zurück.
      if (istBlatt() && roheHoehe <= SHEET_MIN_HEIGHT) {
        blattEinklappen();
        return;
      }
      try {
        localStorage.setItem(
          SHEET_HEIGHT_KEY,
          String(Math.round(sidebar.getBoundingClientRect().height))
        );
      } catch {
        /* egal */
      }
    } else {
      const rect = sidebar.getBoundingClientRect();
      if (rect.left <= DOCK_THRESHOLD) {
        sidebarPositionZuruecksetzen();
      } else {
        try {
          localStorage.setItem(SIDEBAR_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch {
          /* egal */
        }
      }
    }
  };

  griff.addEventListener('pointerup', fertig);
  griff.addEventListener('pointercancel', fertig);
  griff.addEventListener('dblclick', () => {
    if (!istBlatt()) sidebarPositionZuruecksetzen();
  });
}

// ─── Aufbau ────────────────────────────────────────────────────────────────

/**
 * Die Schale in Betrieb nehmen. Einmal beim Start.
 *
 * Der Unterschied zwischen „unterwegs" und „Schreibtisch" wird hier **einmal**
 * gezogen und danach nur noch beim Wechsel des Gesichts nachgeführt — nicht
 * bei jeder Größenänderung. Ein Fenster, das breiter gezogen wird, ohne die
 * Grenze zu überschreiten, darf nichts zurücksetzen.
 */
export function schaleAufbauen(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  /**
   * Das Blatt folgt der Ebene.
   *
   * Sichtbar ist immer nur ein Reitersatz (CSS, `tiefe.css`). Hier wird nur
   * dafür gesorgt, dass beim Ebenenwechsel auch ein Reiter AUS DIESEM SATZ
   * offen ist — sonst zeigte das Blatt gar nichts, weil sein aktiver Reiter
   * gerade unsichtbar geworden ist.
   */
  document.addEventListener(TIEFE_GEOEFFNET, (ereignis) => {
    const ebene = (ereignis as CustomEvent<TiefeDetail>).detail.ebene;
    reitersatzSetzen(
      ebene === 'maschine' || ebene === 'arbeit'
        ? 'maschine'
        : ebene === 'bestand'
          ? 'karte'
          : 'standort'
    );
  });
  document.addEventListener(TIEFE_GESCHLOSSEN, () => reitersatzSetzen('karte'));

  breiteWiederherstellen();
  restoreSheetHeight();
  reiterUmhaengen();
  griffVerdrahten();
  ziehgriffBreite();

  document.querySelectorAll<HTMLElement>('.tab-button').forEach((knopf) => {
    knopf.addEventListener('click', () => {
      const ziel = knopf.dataset.tab;
      if (!istReiter(ziel)) return;
      /**
       * Ein KARTEN-Reiter ist ein Ortswechsel — die anderen nicht.
       *
       * Bis zum 23.08.2026 stand hier `if (tiefeIstOffen()) schliesseTiefe()`,
       * mit der damals richtigen Begründung: Wer im Blatt „Standorte" wählt,
       * will zur Karte und nicht einen Reiter hinter einer Maschinenseite
       * umschalten, die er nicht sieht.
       *
       * Seit das Blatt auch die Analyse trägt, war das ein Fehler: Ein Tipp
       * auf „3D" schloss die Tiefe und ließ den Nutzer auf der Karte stehen.
       * Gemessen im Wächter — Ebene vor dem Tipp `tiefe-offen tiefe-maschine`,
       * danach `(keine)`.
       *
       * Jetzt entscheidet, zu welchem Satz der Reiter gehört. Karte heißt
       * hinaus; Standort und Maschine heißen: an Ort und Stelle umschalten.
       */
      if (tiefeIstOffen() && knopf.dataset.ebene === 'karte') schliesseTiefe();
      reiterOeffnen(ziel);
    });
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    /**
     * „☰" zieht die Leiste auf — auch hinter dem Scharnier.
     *
     * Hier stand bis zum 22.08.2026 `schliesseTiefe()`: Aus der Tiefe heraus
     * warf der Knopf einen zurück auf die Karte. Das war die Notlösung dafür,
     * dass die Leiste hinter dem Scharnier gar nicht zu sehen war — wer die
     * Ansichtstiefe umstellen wollte, musste die Maschine verlassen und danach
     * den ganzen Weg zurückgehen.
     *
     * Jetzt legt sich die Leiste über die Tiefe. Die Tiefe bleibt stehen; wer
     * die Leiste zuzieht, steht wieder da, wo er war. Zurück auf die Karte
     * führt weiterhin „‹ Zum Standort" beziehungsweise „‹ Zur Karte" — der
     * Rückweg gehört dem Inhalt, nicht der Navigation.
     */
    zustand.blattOffen = !zustand.blattOffen;
    schaleAnwenden();
  });

  // „Standorte" ist der Einstieg. Unterwegs liegt das Blatt dabei auf
  // Guckhöhe (siehe `zustand.blattOffen`), die Karte ist also frei — der
  // Reiter sagt nur, was man sieht, wenn man aufzieht.
  reiterOeffnen('daten');

  /**
   * Beim Drehen: umhängen, nicht neu anfangen.
   *
   * Das ist die Stelle, an der ein Tablet zwischen den Gesichtern wechselt.
   * Was der Nutzer gerade tut, bleibt: offener Standort, gewählte Maschine,
   * offener Reiter. Umgehängt wird nur, was am neuen Ort anders steht.
   */
  /**
   * Beim Öffnen und Schließen der Tiefe zieht der Schalter mit um.
   *
   * Ohne diese beiden Zeilen blieb er unterwegs im Kopfstreifen liegen und war
   * hinter dem Scharnier unsichtbar — der Fall, den die Messung vom 22.08.2026
   * gezeigt hat. `reiterUmhaengen` weiß selbst, wohin er gehört; es muss nur
   * jemand fragen, wenn sich der Ort ändert.
   */
  document.addEventListener(TIEFE_GEOEFFNET, () => {
    reiterUmhaengen();
    /**
     * Beim Betreten der Tiefe tritt die Navigation zur Seite.
     *
     * Am Schreibtisch steht die Leiste sonst offen und legt sich über die
     * Arbeitsfläche — gemessen am 22.08.2026: 400 px über einer Maschinenseite,
     * die 1120 px breit mittig steht. Über der Karte ist das richtig, die kann
     * man darunter weiterschieben; über einer Arbeitsfläche ist es eine
     * Verdeckung.
     *
     * Zugezogen, nicht abgeschaltet: „☰" holt sie jederzeit zurück, dann legt
     * sie sich bewusst darüber.
     */
    schaleAnwenden();
  });
  document.addEventListener(TIEFE_GESCHLOSSEN, () => {
    reiterUmhaengen();
    // Zurück auf der Karte gilt wieder, was das Gesicht vorgibt.
    zustand.blattOffen = !istBlatt();
    schaleAnwenden();
  });

  onFaceChange(() => {
    reiterUmhaengen();
    sidebarPositionFuersGesicht();
    // Am Schreibtisch steht die Seitenleiste, unterwegs liegt das Blatt unten.
    zustand.blattOffen = !istBlatt();
    schaleAnwenden();
  });

  schaleAnwenden();
}
