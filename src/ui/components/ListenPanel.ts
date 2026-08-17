/**
 * DIE HÖR-LUPE
 *
 * Normalzustand · Messung · Unterschied — drei Quellen, ein Tipp je Quelle.
 *
 * Sie ist nicht das Zubehör des Ergebnisses, sie ist der Beweis. Eine
 * Prozentzahl muss man glauben; ein Geräusch kann man einem zweiten Menschen
 * vorspielen. Wer die Ampel nicht nachprüfen kann, muss ihr vertrauen — und
 * genau das soll SoundFuchs nicht verlangen.
 *
 * ## Was „Unterschied" ist
 *
 * Nicht die Messung lauter, sondern das, was in der Messung steht und im
 * Normalzustand nicht: spektrale Subtraktion, zeitlich ausgerichtet
 * (`core/audio/differenceIsolation.ts`), einmal berechnet und gemerkt
 * (`getDifferenceTake`). Wenn ein Lager anfängt zu klopfen, ist genau dieses
 * Klopfen das, was hier übrig bleibt.
 *
 * ## Was unter „Fein einstellen" liegt und warum
 *
 * Tempo und Tonlage helfen — ein Klopfen, das im Dauergeräusch untergeht, wird
 * langsamer hörbar; „Auffälligkeit hörbar machen" liest die Frequenz des
 * größten Unterschieds aus der Messung selbst und zieht genau diese Stelle in
 * den Bereich, in dem das Ohr am besten auflöst (~3 kHz, siehe
 * `core/audio/audibleTranspose.ts`).
 *
 * Aber: Das sind Werkzeuge für den, der schon weiß, was er sucht. Im Erstbild
 * stehen sie im Weg. Bis zum 17.08.2026 lagen hier sieben gleich große Knöpfe
 * nebeneinander, und die drei, um die es geht, waren darin nicht zu erkennen.
 * Jetzt stehen drei Quellen oben, der Rest liegt eine Stufe tiefer — erreichbar
 * in einem Tipp, aber nicht im Weg.
 *
 * ## Sie urteilt nicht
 *
 * Wahrnehmungshilfe, mehr nicht. Sie macht Unterschiede hörbar; sie sagt nicht,
 * woher sie kommen. Das ist kein Understatement, sondern die Grenze des
 * Verfahrens: Regen auf Blech und ein beginnender Lagerschaden sehen für eine
 * spektrale Subtraktion gleich aus. Der Mensch davor kann sie unterscheiden.
 */

import { SlowListenPlayer } from '@core/audio/slowListen.js';
import { getDifferenceTake } from '@core/audio/differenceTake.js';
import { planTranspose } from '@core/audio/audibleTranspose.js';
import { peakFrequencyFine } from '@core/dsp/fineSpectrogram.js';
import { formatHz } from '@utils/formatHz.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { notify } from '@utils/notifications.js';

export interface ListenPanelOptions {
  reference?: AudioBuffer | null;
  measurement?: AudioBuffer | null;
  /**
   * Überschrift und erklärender Satz mitzeichnen.
   *
   * Im Ergebnis ja — dort ist die Hör-Lupe ein benannter Teil der Fläche. Im
   * Verlauf nein: Dort steht sie in einer Zeile, die schon sagt, um welche
   * Prüfung es geht, und eine zweite Überschrift wäre eine Wiederholung.
   */
  mitUeberschrift?: boolean;
}

/** Welche Quelle gerade läuft. */
type Quelle = 'reference' | 'measurement' | 'difference';

export class ListenPanel {
  /** The root element to insert into the DOM. */
  public readonly element: HTMLElement;
  /** True if there is at least one recording to play. */
  public readonly hasContent: boolean;
  /** Ob sich überhaupt ein Unterschied bilden lässt (beide Aufnahmen da). */
  public readonly hatUnterschied: boolean;

  private player = new SlowListenPlayer();
  private speedFactor = 1; // 0.5 = slower/lower, 2 = faster/higher
  private playingKey: Quelle | null = null;
  private buffers: Partial<Record<Quelle, AudioBuffer>> = {};
  private buttons: Array<{ key: Quelle; el: HTMLButtonElement; label: string }> = [];
  private ansage: HTMLElement | null = null;
  private referenz: AudioBuffer | null;
  private messung: AudioBuffer | null;
  private unterschiedLaeuft = false;

  constructor(options: ListenPanelOptions) {
    const reference = options.reference ?? null;
    const measurement = options.measurement ?? null;
    this.referenz = reference;
    this.messung = measurement;
    this.hasContent = Boolean(reference || measurement);
    this.hatUnterschied = Boolean(reference && measurement);

    const container = document.createElement('div');
    container.className = 'listen-controls hoerlupe';
    this.element = container;

    if (!this.hasContent) return;

    if (options.mitUeberschrift) {
      const beschriftung = document.createElement('p');
      beschriftung.className = 'listen-controls-label';
      beschriftung.textContent = t('diagnose.display.listenSectionLabel');
      container.appendChild(beschriftung);

      const hinweis = document.createElement('p');
      hinweis.className = 'listen-controls-hint';
      hinweis.textContent = t('diagnose.display.listenSectionHint');
      container.appendChild(hinweis);
    }

    /**
     * Was gerade läuft — vorgelesen statt nur eingefärbt.
     *
     * Der aktive Knopf trägt `aria-pressed`, zusätzlich sagt diese Zeile den
     * Wechsel an. „Farbe allein" wäre für ein Wiedergabegerät die schlechteste
     * aller Kennzeichnungen: Wer nicht sieht, hört sonst drei Aufnahmen, ohne
     * je zu erfahren, welche davon welche war.
     */
    const ansage = document.createElement('p');
    ansage.className = 'hoerlupe-ansage muted small';
    ansage.setAttribute('role', 'status');
    ansage.setAttribute('aria-live', 'polite');
    this.ansage = ansage;

    // ── Die drei Quellen ───────────────────────────────────────────────────
    const reihe = document.createElement('div');
    reihe.className = 'hoerlupe-quellen';
    container.appendChild(reihe);

    if (reference) {
      this.macheQuelle(reihe, 'reference', t('hoerlupe.quelleNormalzustand'), reference);
    }
    if (measurement) {
      this.macheQuelle(reihe, 'measurement', t('hoerlupe.quelleMessung'), measurement);
    }
    if (this.hatUnterschied) this.macheUnterschiedsknopf(reihe);

    container.appendChild(ansage);

    // ── Fein einstellen ────────────────────────────────────────────────────
    //
    // Ein `details`, kein eigener Bildschirm: Der Weg zurück ist derselbe
    // Tipp, und der Zustand „offen" überlebt das Umschalten der Quelle.
    const fein = document.createElement('details');
    fein.className = 'hoerlupe-fein';
    const zusammenfassung = document.createElement('summary');
    zusammenfassung.textContent = t('hoerlupe.feinEinstellen');
    fein.appendChild(zusammenfassung);
    this.macheTempo(fein);
    if (this.hatUnterschied) this.macheHoerbar(fein);
    container.appendChild(fein);
  }

  /** Ein Quellenknopf: tippen spielt, nochmal tippen hält an. */
  private macheQuelle(
    ziel: HTMLElement,
    key: Quelle,
    label: string,
    buffer: AudioBuffer
  ): HTMLButtonElement {
    this.buffers[key] = buffer;
    const knopf = document.createElement('button');
    knopf.type = 'button';
    // Ausgeschrieben statt zusammengesetzt: Ein Klassenname, der aus einem
    // Rumpf und einer Variablen entsteht, macht in `css-check` den ganzen
    // Rumpf lebendig — danach gilt jeder erfundene Selektor mit diesem Anfang
    // als benutzt. Drei Wörter sind billiger als ein blinder Fleck im Wächter.
    // (Der Wächter liest auch Kommentare; deshalb steht das Muster hier nicht.)
    const klasse =
      key === 'reference'
        ? 'hoerlupe-reference'
        : key === 'measurement'
          ? 'hoerlupe-measurement'
          : 'hoerlupe-difference';
    knopf.className = `listen-btn hoerlupe-quelle ${klasse}`;
    knopf.textContent = label;
    knopf.setAttribute('aria-pressed', 'false');
    knopf.onclick = () => {
      if (this.playingKey === key) {
        this.halteAn();
        return;
      }
      this.starte(key);
    };
    this.buttons.push({ key, el: knopf, label });
    ziel.appendChild(knopf);
    return knopf;
  }

  /**
   * Der Unterschied wird erst beim Antippen gerechnet.
   *
   * Die spektrale Subtraktion läuft über beide Aufnahmen und dauert; sie beim
   * Aufbau der Fläche zu starten hieße, jedes Ergebnis um eine Rechnung zu
   * verzögern, die die meisten gar nicht anfordern. Gerechnet wird einmal und
   * gemerkt (`getDifferenceTake` hält einen Cache an der Messung).
   */
  private macheUnterschiedsknopf(ziel: HTMLElement): void {
    const label = t('hoerlupe.quelleUnterschied');
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'listen-btn listen-btn-difference hoerlupe-quelle hoerlupe-difference';
    knopf.textContent = label;
    knopf.setAttribute('aria-pressed', 'false');
    knopf.onclick = () => {
      if (this.playingKey === 'difference') {
        this.halteAn();
        return;
      }
      void this.spieleUnterschied();
    };
    this.buttons.push({ key: 'difference', el: knopf, label });
    ziel.appendChild(knopf);
  }

  /**
   * Den Unterschied abspielen — der eine Tipp aus dem Ergebnis heraus.
   *
   * Öffentlich, damit die Ergebnisfläche ihre Primäraktion darauf legen kann,
   * ohne die Knöpfe dieser Komponente von außen anzuklicken. Ein simulierter
   * Klick wäre eine zweite Bedienung derselben Sache — und die erste, die
   * kaputtgeht, wenn hier jemand eine Klasse umbenennt.
   *
   * @returns ob wirklich etwas abgespielt wird.
   */
  public async spieleUnterschied(): Promise<boolean> {
    if (!this.referenz || !this.messung) return false;
    if (this.buffers.difference) {
      this.starte('difference');
      return true;
    }
    if (this.unterschiedLaeuft) return false;

    this.unterschiedLaeuft = true;
    const knopf = this.buttons.find((b) => b.key === 'difference');
    if (knopf) knopf.el.textContent = t('diagnose.display.listenComputing');

    // Einen Bildaufbau abwarten, damit „… rechne …" wirklich sichtbar wird,
    // bevor die synchrone STFT den Faden für eine Weile belegt.
    await new Promise((r) => setTimeout(r, 50));

    const take = getDifferenceTake(this.referenz, this.messung);
    this.unterschiedLaeuft = false;
    if (knopf) knopf.el.textContent = knopf.label;
    if (!take) {
      notify.info(t('diagnose.display.listenDifferenceTooShort'));
      return false;
    }
    this.buffers.difference = take.buffer;
    this.starte('difference');
    return true;
  }

  /** Tempo und Tonlage — gilt für die Quelle, die gerade läuft. */
  private macheTempo(ziel: HTMLElement): void {
    const reihe = document.createElement('div');
    reihe.className = 'hoerlupe-tempo';

    const knoepfe: Array<[number, string, string]> = [
      [0.5, 'listen-slow-toggle', t('diagnose.display.listenSlow')],
      [1, 'listen-slow-toggle listen-normal-toggle', t('diagnose.display.listenNormal')],
      [2, 'listen-slow-toggle listen-fast-toggle', t('diagnose.display.listenFaster')],
    ];
    const alle: Array<{ faktor: number; el: HTMLButtonElement }> = [];
    const markiere = () => {
      for (const { faktor, el } of alle) {
        const aktiv = this.speedFactor === faktor;
        el.classList.toggle('active', aktiv);
        el.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
      }
    };

    for (const [faktor, klasse, text] of knoepfe) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = klasse;
      knopf.textContent = text;
      knopf.onclick = () => {
        this.speedFactor = faktor;
        markiere();
        // Läuft gerade etwas, wird es mit dem neuen Tempo neu gestartet —
        // sonst gälte die Einstellung erst beim nächsten Mal, und niemand
        // wüsste, ob sie überhaupt etwas tut.
        if (this.playingKey) this.starte(this.playingKey);
      };
      alle.push({ faktor, el: knopf });
      reihe.appendChild(knopf);
    }
    markiere();
    ziel.appendChild(reihe);
  }

  /**
   * „Auffälligkeit hörbar machen": der Faktor kommt AUS DER MESSUNG.
   *
   * Nicht 0,5 oder 2 nach Gefühl, sondern die Frequenz des größten
   * Unterschieds, gezogen in den Bereich, in dem das Ohr am besten auflöst.
   * Weil Resampling Tonhöhe und Tempo gemeinsam bewegt, wird eine Rhythmik
   * dabei mitverlangsamt — genau das macht ein Klopfen hörbar, das bei
   * Originalgeschwindigkeit im Dauergeräusch untergeht.
   */
  private macheHoerbar(ziel: HTMLElement): void {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'listen-btn listen-btn-tune';
    knopf.textContent = t('hoerlupe.hoerbarMachen');
    let laeuft = false;
    knopf.onclick = () => {
      if (laeuft || !this.referenz || !this.messung) return;
      laeuft = true;
      knopf.textContent = t('diagnose.display.listenComputing');
      setTimeout(() => {
        laeuft = false;
        const take = getDifferenceTake(this.referenz!, this.messung!);
        // Feine Auflösung: 2,93 Hz statt 46,875 Hz. Der Faktor folgt direkt aus
        // dieser Frequenz, ein 16-faches Raster war dort zu grob.
        const peakHz = take ? peakFrequencyFine(take.buffer) : null;
        if (!take || peakHz === null) {
          knopf.textContent = t('hoerlupe.hoerbarMachen');
          notify.info(t('diagnose.display.listenDifferenceTooShort'));
          return;
        }
        this.buffers.difference = take.buffer;
        const plan = planTranspose(peakHz);
        knopf.textContent = t('diagnose.display.listenTuneResult', {
          peak: formatHz(plan.peakHz),
          target: formatHz(plan.resultHz),
        });
        // Kein Etikett-Versprechen ohne Deckung: Wurde der Faktor begrenzt,
        // wird die Zielfrequenz nicht erreicht, und das steht dann auch da.
        knopf.title = plan.clamped
          ? t('diagnose.display.listenTuneClamped')
          : t('diagnose.display.listenTuneExact');
        this.speedFactor = plan.factor;
        this.starte('difference');
      }, 50);
    };
    ziel.appendChild(knopf);
  }

  /** Eine Quelle starten und überall anzeigen, dass sie es ist. */
  private starte(key: Quelle): void {
    const buffer = this.buffers[key];
    if (!buffer) return;
    this.player.stop();
    this.zeigeRuhe();
    this.playingKey = key;

    const aktiv = this.buttons.find((b) => b.key === key);
    if (aktiv) {
      aktiv.el.textContent = t('diagnose.display.listenStop');
      aktiv.el.setAttribute('aria-pressed', 'true');
      aktiv.el.classList.add('is-playing');
      if (this.ansage) this.ansage.textContent = t('hoerlupe.laeuft', { quelle: aktiv.label });
    }

    void this.player
      .play(buffer, { playbackRate: this.speedFactor }, () => this.zeigeRuhe())
      .catch((error) => {
        logger.warn('Listen playback failed:', error);
        this.zeigeRuhe();
      });
  }

  private halteAn(): void {
    this.player.stop();
    this.zeigeRuhe();
  }

  /** Alle Knöpfe zurück in den Ruhezustand. */
  private zeigeRuhe(): void {
    this.playingKey = null;
    for (const b of this.buttons) {
      b.el.textContent = b.label;
      b.el.setAttribute('aria-pressed', 'false');
      b.el.classList.remove('is-playing');
    }
    if (this.ansage) this.ansage.textContent = '';
  }

  /** Stop playback and release resources. */
  public destroy(): void {
    this.player.stop();
  }
}
