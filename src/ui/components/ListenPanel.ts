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
import {
  createDifferenceHighlightBuffer,
  type DifferenceHighlightStrength,
} from '@core/audio/differenceHighlight.js';
import { shareHearingComparison } from '@core/audio/hearingComparisonShare.js';
import {
  SpectrogramSelectionPanel,
  type SpectrogramSelectionSource,
} from './SpectrogramSelectionPanel.js';
import { DifferenceStrengthIndicator } from './DifferenceStrengthIndicator.js';
import { openAnalysisPackageDialog } from './AnalysisPackageDialog.js';
import { planTranspose } from '@core/audio/audibleTranspose.js';
import { peakFrequencyFine } from '@core/dsp/fineSpectrogram.js';
import { formatHz } from '@utils/formatHz.js';
import type { SpectralSelection } from '@core/audio/spectralSelection.js';
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
  /** Maschinenname für verständliche Dateinamen beim bewussten Teilen. */
  shareName?: string;
  /** Zeigt den lokalen Übergang an eine beliebige KI; eine Aufnahme genügt. */
  analysisPackage?: { machineName: string };
}

/** Welche Quelle gerade läuft. */
type Quelle =
  | 'reference'
  | 'measurement'
  | 'difference'
  | 'highlight-clear'
  | 'highlight-strong'
  | 'selection';

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
  private playingButton: HTMLButtonElement | null = null;
  private playingLabel: string | null = null;
  private ansage: HTMLElement | null = null;
  private referenz: AudioBuffer | null;
  private messung: AudioBuffer | null;
  private unterschiedLaeuft = false;
  private shareName: string;
  private shareButton: HTMLButtonElement | null = null;
  private teilbareHoerhilfe: {
    buffer: AudioBuffer;
    original: AudioBuffer;
    kind: DifferenceHighlightStrength | 'selection';
    label: string;
  } | null = null;
  private teilenLaeuft = false;
  private auswahlLaeuft = false;
  private auswahlPanel: SpectrogramSelectionPanel | null = null;
  private strength = new DifferenceStrengthIndicator();
  private destroyed = false;

  constructor(options: ListenPanelOptions) {
    const reference = options.reference ?? null;
    const measurement = options.measurement ?? null;
    this.referenz = reference;
    this.messung = measurement;
    this.shareName = options.shareName ?? 'SoundFuchs';
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
      hinweis.textContent = t(
        this.hatUnterschied
          ? 'diagnose.display.listenSectionHint'
          : 'hoerlupe.einzelaufnahmeHinweis'
      );
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
      this.macheQuelle(
        reihe,
        'reference',
        measurement ? t('hoerlupe.quelleNormalzustand') : t('hoerlupe.quelleAufnahme'),
        reference
      );
    }
    if (measurement) {
      this.macheQuelle(
        reihe,
        'measurement',
        reference ? t('hoerlupe.quelleMessung') : t('hoerlupe.quelleAufnahme'),
        measurement
      );
    }
    if (this.hatUnterschied) this.macheUnterschiedsknopf(reihe);

    container.appendChild(ansage);
    container.appendChild(this.strength.element);

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
    if (this.hatUnterschied) this.macheHervorhebung(fein);
    this.macheSpektrogrammAuswahl(fein);
    container.appendChild(fein);
    if (options.analysisPackage) {
      this.macheAnalysepaket(
        container,
        reference,
        measurement,
        options.analysisPackage.machineName
      );
    }
  }

  /**
   * Kein Diagnose-Knopf, sondern eine saubere Übergabe: Kontext + Belege +
   * Arbeitsauftrag verlassen SoundFuchs erst, wenn der Nutzer das ZIP selbst
   * an eine KI weitergibt.
   */
  private macheAnalysepaket(
    ziel: HTMLElement,
    reference: AudioBuffer | null,
    measurement: AudioBuffer | null,
    machineName: string
  ): void {
    const card = document.createElement('section');
    card.className = 'analysepaket-einstieg';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'analysepaket-einstieg-eyebrow';
    eyebrow.textContent = t(
      this.hatUnterschied ? 'analysisPackage.entryEyebrow' : 'analysisPackage.entrySingleEyebrow'
    );
    const title = document.createElement('h3');
    title.textContent = t(
      this.hatUnterschied ? 'analysisPackage.entryTitle' : 'analysisPackage.entrySingleTitle'
    );
    const hint = document.createElement('p');
    hint.className = 'muted small';
    hint.textContent = t(
      this.hatUnterschied ? 'analysisPackage.entryHint' : 'analysisPackage.entrySingleHint'
    );
    copy.append(eyebrow, title, hint);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'listen-btn analysepaket-einstieg-knopf';
    button.textContent = t(
      this.hatUnterschied ? 'analysisPackage.entryButton' : 'analysisPackage.entrySingleButton'
    );
    button.onclick = () => {
      this.halteAn();
      const primary = measurement ?? reference;
      if (!primary) return;
      openAnalysisPackageDialog({
        // Nur wenn wirklich zwei Aufnahmen da sind, darf eine davon als
        // mögliche Referenz auftreten. Eine einzelne alte „Referenz" wird zum
        // neutralen Geräuschfall und nicht heimlich als gesund behauptet.
        reference: reference && measurement ? reference : null,
        measurement: primary,
        machineName,
        getSelection: () => this.auswahlPanel?.selection() ?? null,
      });
    };
    card.append(copy, button);
    ziel.appendChild(card);
  }

  /**
   * Was gerade im Spektrogramm markiert ist — oder `null`.
   *
   * Nach außen gegeben, seit das Briefing im Analyseblatt einen eigenen Reiter
   * hat: Wer dort einen Bereich markiert und dann auf „Briefing" wechselt,
   * meint genau diesen Bereich. Ohne diesen Zugang müsste das Blatt eine
   * zweite Auswahl führen — und zwei Auswahlen sind eine zu viel.
   */
  public aktuelleAuswahl(): SpectralSelection | null {
    return this.auswahlPanel?.selection() ?? null;
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
      if (this.playingButton === knopf) {
        this.halteAn();
        return;
      }
      this.starte(key, knopf, label);
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
      if (this.playingButton === knopf) {
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
    this.player.unlock();
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
    if (this.destroyed) {
      this.unterschiedLaeuft = false;
      return false;
    }

    const take = this.holeUnterschied();
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
        if (this.playingKey) {
          this.starte(
            this.playingKey,
            this.playingButton ?? undefined,
            this.playingLabel ?? undefined
          );
        }
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
      this.player.unlock();
      laeuft = true;
      knopf.textContent = t('diagnose.display.listenComputing');
      setTimeout(() => {
        laeuft = false;
        if (this.destroyed) return;
        const take = this.holeUnterschied();
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

  /**
   * Originalmessung · Deutlich · Stark — der Unterschied bleibt im Maschinenklang.
   *
   * „Originalmessung" ist tatsächlich der unveränderte Mess-Buffer. Die beiden anderen
   * Stufen entstehen nur im Arbeitsspeicher und werden weder gespeichert noch
   * an die Bewertung zurückgegeben. Darum steht die Kennzeichnung direkt am
   * Werkzeug und nicht in einer Hilfe-Seite, die beim Hören niemand sieht.
   */
  private macheHervorhebung(ziel: HTMLElement): void {
    if (!this.messung) return;

    const gruppe = document.createElement('section');
    gruppe.className = 'hoerlupe-hervorhebung';
    gruppe.setAttribute('aria-label', t('hoerlupe.hervorhebungTitel'));
    /**
     * Profi-Sache.
     *
     * Die drei Quellen — Normalzustand, Messung, Unterschied — beantworten die
     * Frage „klingt sie anders?" und bleiben in Basis. Die Hervorhebung ist
     * etwas anderes: eine bearbeitete Hörhilfe, deren Verstärkung man verstehen
     * muss, um sie nicht für die Aufnahme zu halten. Wer sie sucht, findet sie
     * unter Profi; wer sie nicht sucht, wird nicht von ihr befragt.
     */
    gruppe.setAttribute('data-view-level', 'expert');

    const titel = document.createElement('p');
    titel.className = 'hoerlupe-hervorhebung-titel';
    titel.textContent = t('hoerlupe.hervorhebungTitel');
    gruppe.appendChild(titel);

    const stufen = document.createElement('div');
    stufen.className = 'hoerlupe-hervorhebung-stufen';
    gruppe.appendChild(stufen);

    const aus = this.macheHervorhebungsknopf(stufen, 'measurement', t('hoerlupe.hervorhebungAus'));
    aus.dataset.highlightLevel = 'off';
    aus.onclick = () => {
      if (this.playingButton === aus) {
        this.halteAn();
        return;
      }
      this.starte('measurement', aus, t('hoerlupe.quelleMessung'));
    };

    const deutlich = this.macheHervorhebungsknopf(
      stufen,
      'highlight-clear',
      t('hoerlupe.hervorhebungDeutlich')
    );
    deutlich.dataset.highlightLevel = 'clear';
    deutlich.onclick = () => void this.spieleHervorhebung('clear', deutlich);

    const stark = this.macheHervorhebungsknopf(
      stufen,
      'highlight-strong',
      t('hoerlupe.hervorhebungStark')
    );
    stark.dataset.highlightLevel = 'strong';
    stark.onclick = () => void this.spieleHervorhebung('strong', stark);

    const hinweis = document.createElement('p');
    hinweis.className = 'hoerlupe-hervorhebung-hinweis muted small';
    hinweis.textContent = t('hoerlupe.hervorhebungHinweis');
    gruppe.appendChild(hinweis);

    const teilen = document.createElement('button');
    teilen.type = 'button';
    teilen.className = 'listen-btn hoerlupe-teilen';
    teilen.textContent = t('hoerlupe.vergleichTeilen');
    teilen.hidden = true;
    teilen.onclick = () => void this.teileHoerhilfe();
    this.shareButton = teilen;
    gruppe.appendChild(teilen);
    ziel.appendChild(gruppe);
  }

  private macheHervorhebungsknopf(
    ziel: HTMLElement,
    key: Quelle,
    label: string
  ): HTMLButtonElement {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'listen-btn hoerlupe-hervorhebung-knopf';
    knopf.textContent = label;
    knopf.setAttribute('aria-pressed', 'false');
    this.buttons.push({ key, el: knopf, label });
    ziel.appendChild(knopf);
    return knopf;
  }

  /** Differenz bilden, in die Messung mischen und nur diese Ableitung spielen. */
  private async spieleHervorhebung(
    strength: DifferenceHighlightStrength,
    knopf: HTMLButtonElement
  ): Promise<void> {
    const key: Quelle = strength === 'clear' ? 'highlight-clear' : 'highlight-strong';
    const label =
      strength === 'clear' ? t('hoerlupe.hervorhebungDeutlich') : t('hoerlupe.hervorhebungStark');
    const ansage =
      strength === 'clear'
        ? t('hoerlupe.hervorhebungDeutlichLaeuft')
        : t('hoerlupe.hervorhebungStarkLaeuft');

    if (this.playingButton === knopf) {
      this.halteAn();
      return;
    }
    this.player.unlock();
    if (this.buffers[key]) {
      this.markiereTeilbar(this.buffers[key]!, strength, label);
      this.starte(key, knopf, ansage);
      return;
    }
    if (!this.referenz || !this.messung || this.unterschiedLaeuft) return;

    this.unterschiedLaeuft = true;
    knopf.textContent = t('diagnose.display.listenComputing');
    await new Promise((r) => setTimeout(r, 50));
    if (this.destroyed) {
      this.unterschiedLaeuft = false;
      return;
    }

    let take: ReturnType<typeof getDifferenceTake> = null;
    let highlighted: ReturnType<typeof createDifferenceHighlightBuffer> = null;
    try {
      take = this.holeUnterschied();
      highlighted = take
        ? createDifferenceHighlightBuffer(this.messung, take.buffer, strength)
        : null;
    } catch (error) {
      logger.warn('Hervorgehobenes Differenz-Signal konnte nicht gebildet werden:', error);
    } finally {
      this.unterschiedLaeuft = false;
      knopf.textContent = label;
    }
    if (!take || !highlighted) {
      notify.info(t('diagnose.display.listenDifferenceTooShort'));
      return;
    }

    this.buffers.difference = take.buffer;
    this.buffers[key] = highlighted.buffer;
    // Ein End-to-End-Wächter kann damit nachweisen, dass nicht bloss der Text
    // umspringt: beide Stufen müssen einen tatsächlich berechneten, anderen
    // Mischfaktor besitzen. Die Zahl ist Diagnose, keine Bewertung.
    knopf.dataset.differenceGain = highlighted.metrics.differenceGain.toFixed(8);
    knopf.dataset.audioDerived = highlighted.metrics.applied ? 'true' : 'unchanged';
    knopf.dataset.audioFingerprint = this.audioFingerprint(highlighted.buffer);
    this.markiereTeilbar(highlighted.buffer, strength, label);
    this.starte(key, knopf, ansage);
  }

  private markiereTeilbar(
    buffer: AudioBuffer,
    kind: DifferenceHighlightStrength | 'selection',
    label: string
  ): void {
    if (!this.messung) return;
    this.teilbareHoerhilfe = { buffer, original: this.messung, kind, label };
    if (!this.shareButton) return;
    this.shareButton.hidden = false;
    this.shareButton.dataset.shareStrength = kind;
    this.shareButton.textContent = t('hoerlupe.vergleichTeilen');
  }

  /** Eine verschobene Markierung darf niemals noch den alten Ausschnitt teilen. */
  private verwerfeAuswahlFreigabe(): void {
    if (this.playingKey === 'selection') this.halteAn();
    delete this.buffers.selection;
    if (this.teilbareHoerhilfe?.kind !== 'selection') return;
    this.teilbareHoerhilfe = null;
    if (!this.shareButton) return;
    this.shareButton.hidden = true;
    delete this.shareButton.dataset.shareStrength;
    this.shareButton.textContent = t('hoerlupe.vergleichTeilen');
  }

  /** Eine Rechnung, eine Stärkeanzeige, ein Cache für alle Hörwerkzeuge. */
  private holeUnterschied(): ReturnType<typeof getDifferenceTake> {
    if (!this.referenz || !this.messung) return null;
    const take = getDifferenceTake(this.referenz, this.messung);
    if (take) {
      this.buffers.difference = take.buffer;
      this.strength.update(take.metrics);
    }
    return take;
  }

  /**
   * 2D statt 3D: Ziehen bedeutet hier immer auswählen und nie Kamera drehen.
   * Der Unterschied bleibt die Vorauswahl. Derselbe Rahmen kann aber ohne
   * Neuzeichnen auf Normalzustand und Messung gelegt werden; Auge und Ohr
   * wechseln dabei immer gemeinsam dieselbe Quelle.
   */
  private macheSpektrogrammAuswahl(ziel: HTMLElement): void {
    const sources: Partial<Record<SpectrogramSelectionSource, () => AudioBuffer | null>> = {};
    if (this.referenz) sources.reference = () => this.referenz;
    if (this.messung) sources.measurement = () => this.messung;
    if (this.hatUnterschied) sources.difference = () => this.holeUnterschied()?.buffer ?? null;
    const panel = new SpectrogramSelectionPanel({
      sources,
      listeningGain: {
        difference: () => this.holeUnterschied()?.metrics.listeningGain ?? 1,
      },
      initialSource: this.hatUnterschied
        ? 'difference'
        : this.messung
          ? 'measurement'
          : 'reference',
      onSelectionChange: () => this.verwerfeAuswahlFreigabe(),
      onSourceChange: () => {
        this.verwerfeAuswahlFreigabe();
        const entry = this.buttons.find((button) => button.el === panel.playButton);
        if (!entry) return;
        entry.label = panel.playLabel();
        if (this.playingButton !== panel.playButton) panel.playButton.textContent = entry.label;
      },
    });
    /**
     * Profi-Sache — das TIEFE Auswahlwerkzeug.
     *
     * Auf dem Bildplatz gibt es seit dem 22.08.2026 die schlichte Geste: Zug
     * heißt Auswahl, ein Tipp spielt sie. Das ist Basis und bleibt es. Dieses
     * Werkzeug hier ist die Werkbank dazu — eigene Quellenwahl,
     * Maßstabsvergleich, Teilen. Beides gleichzeitig in Basis wären zwei
     * Auswahlen, von denen man nicht weiß, welche gemeint ist.
     */
    panel.element.setAttribute('data-view-level', 'expert');
    this.auswahlPanel = panel;
    const entry = { key: 'selection' as const, el: panel.playButton, label: panel.playLabel() };
    this.buttons.push(entry);
    panel.playButton.onclick = () => {
      if (this.playingButton === panel.playButton) {
        this.halteAn();
        return;
      }
      if (this.auswahlLaeuft) return;
      this.player.unlock();
      this.auswahlLaeuft = true;
      panel.playButton.disabled = true;
      panel.playButton.textContent = t('diagnose.display.listenComputing');
      setTimeout(() => {
        if (this.destroyed) {
          this.auswahlLaeuft = false;
          return;
        }
        try {
          const selected = panel.createSelectedBuffer();
          if (!selected) {
            notify.info(t('hoerlupe.auswahlNichtVerfuegbar'));
            return;
          }
          const selectionLabel = panel.selectionLabel();
          this.buffers.selection = selected.buffer;
          panel.playButton.dataset.audioDerived = 'true';
          panel.playButton.dataset.audioFingerprint = this.audioFingerprint(selected.buffer);
          panel.playButton.dataset.outputPeak = selected.metrics.outputPeak.toFixed(6);
          panel.playButton.dataset.outputDuration = selected.buffer.duration.toFixed(3);
          this.teilbareHoerhilfe = {
            buffer: selected.buffer,
            // Beim Unterschied bleibt die unveränderte Messung der hörbare
            // Gegenpol; bei den beiden Originalquellen ist es die Quelle selbst.
            original:
              panel.selectedSource() === 'reference'
                ? (this.referenz ?? this.messung!)
                : (this.messung ?? panel.sourceBuffer()!),
            kind: 'selection',
            label: selectionLabel,
          };
          if (this.shareButton) {
            this.shareButton.hidden = false;
            this.shareButton.dataset.shareStrength = 'selection';
          }
          this.starte('selection', panel.playButton, selectionLabel);
        } catch (error) {
          logger.warn('Spektrogramm-Auswahl konnte nicht hörbar gemacht werden:', error);
          notify.error(t('hoerlupe.auswahlNichtVerfuegbar'));
        } finally {
          this.auswahlLaeuft = false;
          panel.playButton.disabled = false;
          if (this.playingButton !== panel.playButton) panel.playButton.textContent = entry.label;
        }
      }, 50);
    };
    ziel.appendChild(panel.element);
  }

  /** Teilt Original + exakt zuletzt gehörte Hörhilfe, nie eine heimliche Stufe. */
  private async teileHoerhilfe(): Promise<void> {
    if (this.teilenLaeuft || !this.shareButton || !this.teilbareHoerhilfe) {
      return;
    }
    this.teilenLaeuft = true;
    this.shareButton.disabled = true;
    this.shareButton.textContent = t('hoerlupe.vergleichWirdVorbereitet');
    try {
      const outcome = await shareHearingComparison({
        measurement: this.teilbareHoerhilfe.original,
        highlighted: this.teilbareHoerhilfe.buffer,
        baseName: this.shareName,
        highlightedSuffix: this.teilbareHoerhilfe.label,
        title: t('hoerlupe.vergleichTitel', { name: this.shareName }),
        text: t('hoerlupe.vergleichText', { stufe: this.teilbareHoerhilfe.label }),
      });
      if (outcome === 'shared') notify.success(t('hoerlupe.vergleichGeteilt'));
      if (outcome === 'downloaded') notify.success(t('hoerlupe.vergleichHeruntergeladen'));
    } catch (error) {
      logger.warn('Hörvergleich konnte nicht ausgegeben werden:', error);
      notify.error(t('hoerlupe.vergleichFehlgeschlagen'));
    } finally {
      this.teilenLaeuft = false;
      this.shareButton.disabled = false;
      this.shareButton.textContent = t('hoerlupe.vergleichTeilen');
    }
  }

  /** Kurzer, nicht umkehrbarer Prüfwert des tatsächlich erzeugten Buffers. */
  private audioFingerprint(buffer: AudioBuffer): string {
    const samples = buffer.getChannelData(0);
    const stride = Math.max(1, Math.floor(samples.length / 2_048));
    let hash = 2_166_136_261;
    for (let i = 0; i < samples.length; i += stride) {
      const quantized = Math.round((Number.isFinite(samples[i]) ? samples[i] : 0) * 32_767);
      hash ^= quantized & 0xffff;
      hash = Math.imul(hash, 16_777_619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  /** Eine Quelle starten und überall anzeigen, dass sie es ist. */
  private starte(key: Quelle, knopf?: HTMLButtonElement, ansageLabel?: string): void {
    const buffer = this.buffers[key];
    if (!buffer) return;
    this.player.stop();
    this.zeigeRuhe();
    this.playingKey = key;

    const aktiv = knopf
      ? this.buttons.find((b) => b.el === knopf)
      : this.buttons.find((b) => b.key === key);
    if (aktiv) {
      this.playingButton = aktiv.el;
      this.playingLabel = ansageLabel ?? aktiv.label;
      aktiv.el.textContent = t('diagnose.display.listenStop');
      aktiv.el.setAttribute('aria-pressed', 'true');
      aktiv.el.classList.add('is-playing');
      if (this.ansage) {
        this.ansage.textContent = t('hoerlupe.laeuft', { quelle: this.playingLabel });
      }
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
    this.playingButton = null;
    this.playingLabel = null;
    for (const b of this.buttons) {
      b.el.textContent = b.label;
      b.el.setAttribute('aria-pressed', 'false');
      b.el.classList.remove('is-playing');
    }
    if (this.ansage) this.ansage.textContent = '';
  }

  /** Stop playback and release resources. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.player.destroy();
    this.auswahlPanel?.destroy();
    this.auswahlPanel = null;
  }
}
