/**
 * DAS KLANGBILD
 *
 * Auf der Maschinenseite, ohne einen einzigen Tipp: das Spektrogramm der
 * letzten Prüfung. Ein Tipp darauf verwandelt es in das 3D-Gebirge.
 *
 * ## Warum es das gibt
 *
 * Gemessen am 18.08.2026 auf einem Handy (390 × 844), Maschine im Ruhezustand:
 *
 *   5 Angebote, das unterste endet bei 422 px
 *   422 px ungenutzter Bildschirm darunter — genau die Hälfte
 *   4 Tipps von hier bis zum Gebirge (Verlauf → Hören → 3D → Quelle)
 *   7 Tipps ab der Karte, und vorher noch auf „Profi" umschalten
 *
 * Die halbe Seite stand leer, und das Eindrucksvollste lag vier Türen weiter.
 * Das ist kein Platzproblem, sondern ein Belegungsproblem: Die leere Hälfte
 * bekommt das, wofür man sonst vier Tipps braucht.
 *
 * ## Warum erst 2D und dann 3D
 *
 * Ein Gebirge in 240 px Höhe ist eine Briefmarke, und ein WebGL-Kontext ist
 * eine knappe Ressource — Browser vergeben nur eine Handvoll pro Seite. Das
 * flache Spektrogramm ist billig, sofort da und zeigt dieselbe Sache: Es ist
 * das ehrliche Vorschaubild seiner selbst.
 *
 * Damit die Verwandlung als Zoom lesbar ist und nicht als Sprung, benutzen
 * beide **dieselbe** Farbskala (`core/dsp/klangfarben.ts`).
 *
 * ## Was es nicht ist
 *
 * Keine neue Ebene. Das Bild wächst an Ort und Stelle; der Rückweg ist
 * derselbe Tipp. Der Auftraggeber hat ausdrücklich weniger Ebenen verlangt,
 * nicht mehr.
 */

import { getFineSpectrogramMatrix } from '@core/dsp/fineSpectrogram.js';
import { DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { matrixZuBildpunkten } from '@core/dsp/klangfarben.js';
import { signedDifferenceMatrix } from '@core/dsp/signedDifference.js';
import { cropSpectrogramMatrix, type SpectrogramMatrix } from '@core/dsp/spectrogram.js';
import { Spectrogram3DPanel } from './Spectrogram3DPanel.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { renderIrisVergleich } from '@ui/components/MachineFingerprint.js';
import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import {
  rectToSpectralSelection,
  type NormalizedSelectionRect,
} from './SpectrogramSelectionPanel.js';
import { createSpectralSelectionBuffer } from '@core/audio/spectralSelection.js';
import { getDifferenceTake } from '@core/audio/differenceTake.js';
import { SlowListenPlayer } from '@core/audio/slowListen.js';
import { formatHz } from '@utils/formatHz.js';

export interface KlangbildOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
  /**
   * Kein Tipp ins Gebirge.
   *
   * Seit dem 23.08.2026 hat das Gebirge einen eigenen Reiter im Analyseblatt.
   * Ein Bild, das nebenbei ein zweites Gebirge öffnet, wäre die zweite Tür zum
   * selben Werkzeug — genau die Unordnung, für die es das Blatt gibt.
   */
  ohneGebirge?: boolean;

  /**
   * Kein Ziehen, keine Bereichsauswahl.
   *
   * Nur für das Bild auf der Maschinenseite: Dort ist das Klangbild der Beleg
   * des letzten Urteils, kein Werkzeug. Gearbeitet wird im Blatt.
   *
   * Getrennt von `ohneGebirge`, weil das Ziehen die **Basis**-Fähigkeit ist:
   * Eine Stelle greifen und hören kann jeder, die tiefe Auswahl der Hör-Lupe
   * ist Profi. Beides in einem Schalter zu bündeln hätte der Basis-Stufe beim
   * Umzug still etwas weggenommen.
   */
  ohneAuswahl?: boolean;
}

/** Welche Quelle das Bild gerade zeigt. */
type Quelle = 'measurement' | 'reference' | 'signed' | 'iris';

export class Klangbild {
  public readonly element: HTMLElement;
  /** False, wenn es nichts zu zeigen gibt — dann nicht einhängen. */
  public readonly hasContent: boolean;

  private referenz: AudioBuffer | null;
  private messung: AudioBuffer | null;
  private buehne: HTMLElement;
  private leinwand: HTMLCanvasElement;
  private reiter: Array<{ key: Quelle; el: HTMLButtonElement }> = [];
  private quelle: Quelle;
  private gebirge: Spectrogram3DPanel | null = null;
  /** Die runde Ansicht. Eigene Leinwand: Ein Kreis in einer gestreckten
      Fläche wäre eine Ellipse. */
  private iris: HTMLCanvasElement;
  private tief = false;
  /** Was zuletzt flach gemalt wurde — Zeitachse und Bandgrenzen der Auswahl. */
  private letzteMatrix: SpectrogramMatrix | null = null;
  /** Das gezogene Rechteck, in Anteilen der Fläche. */
  private auswahl: NormalizedSelectionRect | null = null;
  private auswahlRahmen: HTMLElement;
  private auswahlzeile: HTMLElement;
  private auswahlKnopf: HTMLButtonElement;
  private auswahlText: HTMLElement;
  /** Die eine Zeile unter dem Bild: erklärt die Geste — oder die Iris. */
  private hinweis: HTMLElement;
  private spieler = new SlowListenPlayer();
  private laeuft = false;
  /** Merker, damit ein Zug nicht als Tipp durchgeht. */
  private warZug = false;

  constructor(optionen: KlangbildOptions) {
    this.referenz = optionen.reference ?? null;
    this.messung = optionen.measurement ?? null;
    this.hasContent = Boolean(this.referenz || this.messung);
    this.quelle = this.messung ? 'measurement' : 'reference';

    const wurzel = document.createElement('section');
    wurzel.className = 'klangbild';
    this.element = wurzel;

    this.buehne = document.createElement('div');
    this.buehne.className = 'klangbild-buehne';
    this.leinwand = document.createElement('canvas');
    this.leinwand.className = 'klangbild-flach';
    this.iris = document.createElement('canvas');
    this.iris.className = 'klangbild-iris';
    this.iris.hidden = true;
    // Vor dem frühen Ausstieg angelegt, aus demselben Grund wie die Leinwände:
    // Ein Klangbild ohne Inhalt hat keine Bedienung, aber seine Felder müssen
    // trotzdem stehen.
    this.auswahlRahmen = document.createElement('div');
    this.auswahlRahmen.className = 'klangbild-auswahlrahmen';
    this.auswahlRahmen.hidden = true;
    this.auswahlzeile = document.createElement('div');
    this.auswahlzeile.className = 'klangbild-auswahlzeile';
    this.auswahlzeile.hidden = true;
    this.auswahlKnopf = document.createElement('button');
    this.auswahlKnopf.type = 'button';
    this.auswahlKnopf.className = 'klangbild-auswahl-spielen';
    this.auswahlText = document.createElement('span');
    this.auswahlText.className = 'muted small klangbild-auswahl-bereich';
    this.hinweis = document.createElement('p');
    this.hinweis.className = 'muted small klangbild-ziehhinweis';

    if (!this.hasContent) {
      wurzel.style.display = 'none';
      return;
    }

    /**
     * Das Bild ist der Knopf.
     *
     * Ein `button` und kein `div` mit Klickzuhörer: Wer mit der Tastatur oder
     * einem Vorleseprogramm unterwegs ist, muss es erreichen und muss hören,
     * was es tut. Ein Bild, das man antippen kann, ohne dass es als Bedienung
     * angekündigt ist, ist für diese Nutzer nicht vorhanden.
     */
    const flaeche = document.createElement('button');
    flaeche.type = 'button';
    flaeche.className = 'klangbild-flaeche';
    flaeche.appendChild(this.leinwand);
    flaeche.appendChild(this.iris);

    const lupe = document.createElement('span');
    lupe.className = 'klangbild-hinweis';
    lupe.textContent = t('klangbild.vergroessern');
    flaeche.appendChild(lupe);

    /**
     * Der Auswahlrahmen liegt ÜBER dem Bild und fängt nichts ab.
     *
     * `pointer-events: none` in der Gestaltung: Er ist eine Anzeige, kein
     * Bedienelement. Wer ihn anfasst, fasst das Bild darunter an — und das ist
     * richtig, weil das Ziehen dort stattfindet.
     */
    flaeche.appendChild(this.auswahlRahmen);

    if (optionen.ohneGebirge) {
      // Der Hinweis „vergrößern" verschwindet mit dem Tipp: Ein Versprechen
      // ohne Einlösung ist schlimmer als kein Versprechen.
      lupe.remove();
    } else {
      flaeche.setAttribute('aria-label', t('klangbild.vergroessern'));
      flaeche.addEventListener('click', (e) => {
        // Ein Zug ist kein Tipp. Ohne diese Sperre öffnete jedes Aufziehen
        // eines Rechtecks anschließend das Gebirge.
        if (this.warZug) {
          this.warZug = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        this.wechsleTiefe();
      });
    }
    if (optionen.ohneAuswahl) {
      // Eine Fläche, die man ansieht — kein Knopf, der nichts tut.
      flaeche.disabled = true;
      flaeche.classList.add('klangbild-flaeche-beleg');
    } else {
      this.verdrahteZiehen(flaeche);
    }
    this.buehne.appendChild(flaeche);
    wurzel.appendChild(this.buehne);

    // ── Die Quellen, als Reiter unter dem Bild ─────────────────────────────
    const reihe = document.createElement('div');
    reihe.className = 'klangbild-quellen';
    const anlegen = (key: Quelle, text: string) => {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'klangbild-quelle';
      knopf.textContent = text;
      knopf.addEventListener('click', () => this.zeige(key));
      this.reiter.push({ key, el: knopf });
      reihe.appendChild(knopf);
    };
    if (this.referenz) anlegen('reference', t('klangbild.quelleNormalzustand'));
    if (this.messung) anlegen('measurement', t('klangbild.quelleMessung'));
    if (this.referenz && this.messung) anlegen('signed', t('klangbild.quelleUnterschied'));
    // Die Iris braucht beide Spektren: Sie IST der Vergleich.
    if (this.referenz && this.messung) anlegen('iris', t('klangbild.quelleIris'));
    if (this.reiter.length > 1) wurzel.appendChild(reihe);

    /**
     * Die Auswahlzeile — erst da, wenn es etwas auszuwählen gab.
     *
     * Ein Abspielknopf ohne Auswahl wäre ein Versprechen ohne Gegenstand. Er
     * erscheint mit dem ersten Rechteck und verschwindet mit ihm.
     */
    this.auswahlKnopf.textContent = t('klangbild.auswahlSpielen');
    this.auswahlKnopf.addEventListener('click', () => void this.spieleAuswahl());
    this.auswahlzeile.appendChild(this.auswahlKnopf);

    this.auswahlzeile.appendChild(this.auswahlText);

    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'klangbild-auswahl-weg';
    weg.textContent = '✕';
    weg.setAttribute('aria-label', t('klangbild.auswahlWeg'));
    weg.addEventListener('click', () => this.vergissAuswahl());
    this.auswahlzeile.appendChild(weg);

    wurzel.appendChild(this.auswahlzeile);

    wurzel.appendChild(this.hinweis);

    this.zeige(this.quelle);
  }

  /** Die Matrix einer Quelle — im gemeinsamen Zeitfenster beider Aufnahmen. */
  private matrix(key: Quelle): SpectrogramMatrix | null {
    try {
      const hop = DEFAULT_DSP_CONFIG.hopSize;
      const ref = this.referenz ? getFineSpectrogramMatrix(this.referenz, hop) : null;
      const mes = this.messung ? getFineSpectrogramMatrix(this.messung, hop) : null;
      const roh =
        key === 'signed'
          ? ref && mes
            ? signedDifferenceMatrix(ref, mes)
            : null
          : key === 'reference'
            ? ref
            : mes;
      if (!roh) return null;
      // Dasselbe Zeitfenster wie im Gebirge — sonst wechselt beim Umschalten
      // der Maßstab, und der Vergleich wäre keiner.
      const fenster = Math.min(
        this.referenz?.duration ?? Infinity,
        this.messung?.duration ?? Infinity
      );
      return Number.isFinite(fenster) ? cropSpectrogramMatrix(roh, fenster) : roh;
    } catch (fehler) {
      logger.warn('Klangbild: Matrix nicht berechenbar', fehler);
      return null;
    }
  }

  /** Eine Quelle zeigen — flach oder im Gebirge, je nachdem, wo wir sind. */
  private zeige(key: Quelle): void {
    this.quelle = key;
    for (const r of this.reiter) {
      const aktiv = r.key === key;
      r.el.classList.toggle('is-aktiv', aktiv);
      r.el.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
    }
    if (this.tief) {
      // Im Gebirge übernimmt das Panel die Quellenwahl selbst.
      return;
    }
    /**
     * Die Iris ist eine stehende Ansicht, kein Spektrogramm.
     *
     * Deshalb wird für sie die flache Leinwand ausgeblendet statt überschrieben
     * — und der Hinweis „Antippen für die große Ansicht" verschwindet mit ihr:
     * Ein Gebirge aus einer runden Ansicht gibt es nicht, und ein Versprechen,
     * das die Fläche nicht hält, ist schlimmer als keines.
     */
    const rund = key === 'iris';
    this.iris.hidden = !rund;
    this.leinwand.hidden = rund;
    this.element.classList.toggle('ist-rund', rund);
    if (rund) {
      // Die runde Ansicht hat keine Zeitachse — eine Auswahl darin wäre
      // sinnlos. Der Rahmen bleibt liegen, wird aber nicht gezeigt.
      this.auswahlRahmen.hidden = true;
      this.auswahlzeile.hidden = true;
      // Eine weiße gestrichelte Linie ohne Erklärung ist ein Rätsel. Der
      // Hinweis wechselt deshalb mit der Quelle statt zu verschwinden — und
      // die Zeile behält ihre Höhe, sodass das Bild nicht wandert.
      this.hinweis.textContent = t('klangbild.irisLegende');
      this.zeichneIris();
      return;
    }
    this.hinweis.textContent = t('klangbild.ziehen');
    this.zeichneFlach();
    // Dieselbe Auswahl, neue Quelle: Das Rechteck bleibt, was gespielt wird,
    // wechselt mit dem Bild.
    this.zeigeAuswahl();
  }

  /** Die runde Ansicht: Normalzustand und Messung übereinander. */
  private zeichneIris(): void {
    if (!this.referenz || !this.messung) return;
    try {
      renderIrisVergleich(this.iris, averageSpectrum(this.referenz), averageSpectrum(this.messung));
      this.iris.setAttribute('role', 'img');
      this.iris.setAttribute('aria-label', t('klangbild.irisAlt'));
    } catch (fehler) {
      logger.warn('Klangbild: Iris nicht zeichenbar', fehler);
    }
  }

  /** Das flache Bild in die Leinwand malen. */
  private zeichneFlach(): void {
    const matrix = this.matrix(this.quelle);
    const stift = this.leinwand.getContext('2d');
    if (!matrix || !stift) {
      this.leinwand.setAttribute('aria-label', t('klangbild.leer'));
      return;
    }
    this.letzteMatrix = matrix;
    const { breite, hoehe, punkte } = matrixZuBildpunkten(matrix);
    // In Originalauflösung malen und per CSS strecken: Das Bild ist ein
    // Vorschaubild; eine Interpolation von Hand wäre Aufwand ohne Gewinn.
    this.leinwand.width = breite;
    this.leinwand.height = hoehe;
    stift.putImageData(new ImageData(punkte, breite, hoehe), 0, 0);
    this.leinwand.setAttribute('role', 'img');
    this.leinwand.setAttribute('aria-label', t('klangbild.alt'));
  }

  /**
   * Zwischen Vorschau und Gebirge wechseln — an Ort und Stelle.
   *
   * Das Gebirge entsteht erst hier: WebGL, Matrix und die spektrale
   * Subtraktion sind teuer, und die meisten Blicke auf eine Maschinenseite
   * verlangen sie nicht.
   */
  private wechsleTiefe(): void {
    // Aus der runden Ansicht führt kein Gebirge: Sie hat keine Zeitachse.
    // Ein Tipp, der nichts tut, ist besser als einer, der etwas Fremdes zeigt.
    if (!this.tief && this.quelle === 'iris') return;
    this.tief = !this.tief;
    this.element.classList.toggle('ist-tief', this.tief);

    if (!this.tief) {
      this.gebirge?.destroy();
      this.gebirge = null;
      this.buehne.querySelector('.klangbild-flaeche')?.classList.remove('ist-versteckt');
      this.zeige(this.quelle);
      return;
    }

    const panel = new Spectrogram3DPanel({
      reference: this.referenz,
      measurement: this.messung,
    });
    if (!panel.hasContent) {
      this.tief = false;
      this.element.classList.remove('ist-tief');
      return;
    }
    this.gebirge = panel;
    this.buehne.querySelector('.klangbild-flaeche')?.classList.add('ist-versteckt');
    this.buehne.appendChild(panel.element);
    // Das Panel beginnt eingeklappt; hier ist der Tipp auf das Bild bereits
    // die Aufforderung, also gleich aufmachen.
    panel.oeffne();
  }

  /**
   * ── EINE STELLE HERAUSGREIFEN ──────────────────────────────────────────
   *
   * Der Auftraggeber am 22.08.2026: „Ich sehe das zweidimensionale Spektrum,
   * aber ich kann da bestimmte Stellen nicht herausnehmen — diese Funktion
   * fehlt noch. Würde auch gerne, dass ich dieses Spektrogramm vorspielen
   * lassen kann. Fände das gut, wenn das direkt auf dieser oberen Ebene
   * machbar und sichtbar ist."
   *
   * Es gibt sie tiefer unten schon, als eigenes Werkzeug mit Maßstabsschaltern
   * und eigener Quellenwahl. Hier ist sie eine **Geste**, kein Werkzeug: Tipp
   * heißt Gebirge, Zug heißt Auswahl. Dieselbe Fläche, zwei Absichten, die man
   * nicht verwechseln kann — ein Zug ist kein Tipp.
   */
  private verdrahteZiehen(flaeche: HTMLElement): void {
    let start: { x: number; y: number } | null = null;
    const anteil = (e: PointerEvent): { x: number; y: number } => {
      const k = flaeche.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - k.left) / Math.max(1, k.width))),
        y: Math.min(1, Math.max(0, (e.clientY - k.top) / Math.max(1, k.height))),
      };
    };

    flaeche.addEventListener('pointerdown', (e) => {
      // In der runden Ansicht und im Gebirge gibt es nichts aufzuziehen.
      if (this.tief || this.quelle === 'iris') return;
      start = anteil(e);
      flaeche.setPointerCapture(e.pointerId);
    });

    flaeche.addEventListener('pointermove', (e) => {
      if (!start) return;
      const jetzt = anteil(e);
      const k = flaeche.getBoundingClientRect();
      // Erst ab einer Fingerbreite ist es ein Zug. Darunter ist es das
      // Wackeln, das jeden Tipp begleitet.
      if (
        !this.warZug &&
        Math.abs(jetzt.x - start.x) * k.width < 10 &&
        Math.abs(jetzt.y - start.y) * k.height < 10
      ) {
        return;
      }
      this.warZug = true;
      this.auswahl = { x0: start.x, x1: jetzt.x, y0: start.y, y1: jetzt.y };
      this.zeigeAuswahl();
    });

    const ende = (e: PointerEvent): void => {
      if (!start) return;
      start = null;
      if (flaeche.hasPointerCapture(e.pointerId)) flaeche.releasePointerCapture(e.pointerId);
      if (this.warZug) this.zeigeAuswahl();
    };
    flaeche.addEventListener('pointerup', ende);
    flaeche.addEventListener('pointercancel', ende);
  }

  /** Rahmen zeichnen und die Zeile darunter beschriften. */
  private zeigeAuswahl(): void {
    const wahl = this.auswahl;
    const matrix = this.letzteMatrix;
    if (!wahl || !matrix) {
      this.auswahlRahmen.hidden = true;
      this.auswahlzeile.hidden = true;
      return;
    }
    const links = Math.min(wahl.x0, wahl.x1);
    const oben = Math.min(wahl.y0, wahl.y1);
    const breite = Math.abs(wahl.x1 - wahl.x0);
    const hoehe = Math.abs(wahl.y1 - wahl.y0);
    this.auswahlRahmen.hidden = false;
    this.auswahlRahmen.style.left = `${links * 100}%`;
    this.auswahlRahmen.style.top = `${oben * 100}%`;
    this.auswahlRahmen.style.width = `${breite * 100}%`;
    this.auswahlRahmen.style.height = `${hoehe * 100}%`;

    const bereich = rectToSpectralSelection(wahl, matrix.durationSec, matrix.bandEdgesHz);
    this.auswahlText.textContent = t('klangbild.auswahlBereich', {
      von: bereich.startSec.toFixed(1),
      bis: bereich.endSec.toFixed(1),
      tief: formatHz(bereich.lowHz),
      hoch: formatHz(bereich.highHz),
    });
    this.auswahlzeile.hidden = false;
  }

  /** Auswahl verwerfen — Rahmen und Zeile verschwinden mit ihr. */
  private vergissAuswahl(): void {
    this.auswahl = null;
    this.spieler.stop();
    this.laeuft = false;
    this.auswahlKnopf.textContent = t('klangbild.auswahlSpielen');
    this.zeigeAuswahl();
  }

  /** Der Ton hinter der gerade gezeigten Quelle. */
  private tonDerQuelle(): AudioBuffer | null {
    if (this.quelle === 'reference') return this.referenz;
    if (this.quelle === 'measurement') return this.messung;
    if (this.quelle === 'signed' && this.referenz && this.messung) {
      return getDifferenceTake(this.referenz, this.messung)?.buffer ?? null;
    }
    return null;
  }

  /**
   * Die Auswahl hören — aus derselben Quelle, die man gerade sieht.
   *
   * Etwas anderes zu spielen als das, was im Bild steht, wäre die eine
   * Verwechslung, die dieses Werkzeug nicht machen darf: Das Bild ist der
   * Beleg für das Gehörte.
   */
  private async spieleAuswahl(): Promise<void> {
    if (this.laeuft) {
      this.spieler.stop();
      this.laeuft = false;
      this.auswahlKnopf.textContent = t('klangbild.auswahlSpielen');
      return;
    }
    const wahl = this.auswahl;
    const matrix = this.letzteMatrix;
    const ton = this.tonDerQuelle();
    if (!wahl || !matrix || !ton) return;
    const bereich = rectToSpectralSelection(wahl, matrix.durationSec, matrix.bandEdgesHz);
    const geschnitten = createSpectralSelectionBuffer(ton, bereich);
    if (!geschnitten) {
      logger.warn('Klangbild: Auswahl ließ sich nicht schneiden');
      return;
    }
    this.laeuft = true;
    this.auswahlKnopf.textContent = t('klangbild.auswahlStoppen');
    try {
      await this.spieler.play(geschnitten.buffer, {}, () => {
        this.laeuft = false;
        this.auswahlKnopf.textContent = t('klangbild.auswahlSpielen');
      });
    } catch (fehler) {
      logger.warn('Klangbild: Auswahl ließ sich nicht abspielen', fehler);
      this.laeuft = false;
      this.auswahlKnopf.textContent = t('klangbild.auswahlSpielen');
    }
  }

  public destroy(): void {
    this.gebirge?.destroy();
    this.gebirge = null;
    this.spieler.stop();
  }
}
