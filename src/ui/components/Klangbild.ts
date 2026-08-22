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

export interface KlangbildOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
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

    flaeche.setAttribute('aria-label', t('klangbild.vergroessern'));
    flaeche.addEventListener('click', () => this.wechsleTiefe());
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

    this.zeige(this.quelle);
  }

  /** Die Matrix einer Quelle — im gemeinsamen Zeitfenster beider Aufnahmen. */
  private matrix(key: Quelle): SpectrogramMatrix | null {
    try {
      const hop = DEFAULT_DSP_CONFIG.hopSize;
      const ref = this.referenz ? getFineSpectrogramMatrix(this.referenz, hop) : null;
      const mes = this.messung ? getFineSpectrogramMatrix(this.messung, hop) : null;
      const roh =
        key === 'signed' ? (ref && mes ? signedDifferenceMatrix(ref, mes) : null) : key === 'reference' ? ref : mes;
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
      this.zeichneIris();
      return;
    }
    this.zeichneFlach();
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

  public destroy(): void {
    this.gebirge?.destroy();
    this.gebirge = null;
  }
}
