/**
 * EIN GERÄUSCH MITBRINGEN — DIE VORSCHAU
 *
 * Der Auftraggeber: „Ich glaube, das ist sehr allgemein, dass die Menschen
 * einen Film machen von etwas, wo sie denken, das hört sich aber komisch an."
 *
 * Die Datei kommt herein, die Tonspur wird herausgelöst, und dann steht die
 * eine Frage, die ein Video mit sich bringt: **welche Stelle?** Ein Film ist
 * lang, das Interessante darin kurz.
 *
 * ## Das Bild ist der Wegweiser
 *
 * Bei einer Audiodatei hilft nur die Wellenform. Bei einem Video gibt es etwas,
 * das es sonst nicht gibt: Wer gefilmt hat, weiß, wann er die Haube aufgemacht
 * und wo er hingehalten hat. Deshalb springt das Bild mit, wenn man den
 * Ausschnitt verschiebt.
 *
 * ## Danach ist das Video zu Ende
 *
 * Übergeben wird die Tonspur des gewählten Ausschnitts, nicht der Film. Ein
 * Video im Speicher jeder Prüfung wäre in zwei Wochen ein volles Telefon.
 *
 * ## Kein Fehler ohne Satz
 *
 * Jeder Befund aus `geraeuschdatei.ts` hat hier seinen eigenen Satz und einen
 * Weg weiter. Besonders einer: „Dieser Browser kann dieses Format nicht lesen."
 * Er ist echt — der Testbrowser dieses Projekts kann kein AAC, und AAC ist das,
 * was jedes Telefon aufnimmt. Ein stilles „ging nicht" wäre davon nicht zu
 * unterscheiden.
 */

import {
  ausschnitt,
  Dateifehler,
  istVideo,
  ruhigsteStelle,
  toneAusDatei,
  type Dateibefund,
} from '@core/audio/geraeuschdatei.js';
import { SlowListenPlayer } from '@core/audio/slowListen.js';
import type { NormalzustandBefund } from '@ui/phases/2-Reference.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

/** So lang ist der Ausschnitt, den SoundFuchs auswertet. */
const FENSTER = 10;

export interface MitbringenOptions {
  /** Was mit dem gewählten Ausschnitt geschehen soll. */
  uebernehmen: (ton: AudioBuffer, dateiname: string) => void;
  /**
   * Der zweite Ausgang: den Ausschnitt als Normalzustand behalten.
   *
   * Der Auftraggeber: „Dann kann man sein Auto heute filmen und in vier Wochen
   * vergleichen." Ohne diesen Ausgang ist ein mitgebrachter Film ein
   * einmaliger Blick; mit ihm ist er der Maßstab für alles, was danach kommt.
   *
   * Optional, weil er eine Maschine braucht, der er gehören kann. Wo keine
   * ist, wird er nicht angeboten — statt angeboten und dann verweigert.
   */
  normalzustand?: {
    /** Hat die Maschine schon einen? Dann wird gefragt, bevor ersetzt wird. */
    vorhanden: boolean;
    /** Speichern — der Befund sagt, ob der Dialog zugehen darf. */
    speichern: (ton: AudioBuffer, dateiname: string) => Promise<NormalzustandBefund>;
    /**
     * Den Ausschnitt als bewertete Prüfung durchlaufen lassen.
     *
     * Nur sinnvoll, wenn es einen Normalzustand gibt — ohne Maßstab kein
     * Urteil. Deshalb hängt es hier mit drin statt als eigenes Feld: Wo der
     * eine Fall gilt, gilt der andere nicht.
     */
    pruefen?: (ton: AudioBuffer) => Promise<{ ok: boolean; satz?: string }>;
  };
}

const SATZ: Readonly<Record<Dateibefund, string>> = Object.freeze({
  'zu-gross': 'mitbringen.fehlerZuGross',
  'keine-tonspur': 'mitbringen.fehlerKeineTonspur',
  format: 'mitbringen.fehlerFormat',
  'zu-kurz': 'mitbringen.fehlerZuKurz',
  leer: 'mitbringen.fehlerLeer',
  unlesbar: 'mitbringen.fehlerUnlesbar',
});

class Vorschau {
  private readonly overlay: HTMLDivElement;
  private readonly dialog: HTMLDivElement;
  private readonly buehne: HTMLDivElement;
  private readonly leinwand: HTMLCanvasElement;
  private readonly rahmen: HTMLElement;
  private readonly fuss: HTMLDivElement;
  private readonly spieler = new SlowListenPlayer();
  private video: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private ton: AudioBuffer | null = null;
  private start = 0;
  private laeuft = false;
  private zu = false;
  private gezogenVerdrahtet = false;
  private readonly vorherFokus: HTMLElement | null;

  constructor(
    private readonly datei: File,
    private readonly optionen: MitbringenOptions
  ) {
    this.vorherFokus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'mitbringen-overlay';
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.schliesse();
    });

    this.dialog = document.createElement('div');
    this.dialog.className = 'mitbringen-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', t('mitbringen.titel'));
    this.overlay.appendChild(this.dialog);

    const kopf = document.createElement('header');
    kopf.className = 'mitbringen-kopf';
    const titel = document.createElement('h2');
    titel.textContent = t('mitbringen.titel');
    const name = document.createElement('p');
    name.className = 'muted small mitbringen-dateiname';
    name.textContent = datei.name;
    const zuKnopf = document.createElement('button');
    zuKnopf.type = 'button';
    zuKnopf.className = 'mitbringen-schliessen';
    zuKnopf.setAttribute('aria-label', t('mitbringen.abbrechen'));
    zuKnopf.textContent = '×';
    zuKnopf.onclick = () => this.schliesse();
    const kopftext = document.createElement('div');
    kopftext.append(titel, name);
    kopf.append(kopftext, zuKnopf);
    this.dialog.appendChild(kopf);

    this.buehne = document.createElement('div');
    this.buehne.className = 'mitbringen-buehne';
    this.dialog.appendChild(this.buehne);

    const welle = document.createElement('div');
    welle.className = 'mitbringen-welle';
    this.leinwand = document.createElement('canvas');
    this.leinwand.className = 'mitbringen-wellenbild';
    this.rahmen = document.createElement('div');
    this.rahmen.className = 'mitbringen-fenster';
    this.rahmen.hidden = true;
    welle.append(this.leinwand, this.rahmen);
    this.dialog.appendChild(welle);

    this.fuss = document.createElement('div');
    this.fuss.className = 'mitbringen-fuss';
    this.dialog.appendChild(this.fuss);

    this.dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.schliesse();
    });

    document.body.appendChild(this.overlay);
    zuKnopf.focus();
    void this.lade();
  }

  private zeigeWarten(): void {
    this.buehne.replaceChildren();
    const p = document.createElement('p');
    p.className = 'mitbringen-warten';
    p.textContent = t('mitbringen.liest');
    this.buehne.appendChild(p);
  }

  private async lade(): Promise<void> {
    this.zeigeWarten();
    try {
      const ton = await toneAusDatei(this.datei);
      if (this.zu) return;
      this.ton = ton;
      this.start = ruhigsteStelle(
        ton.getChannelData(0),
        ton.sampleRate,
        Math.min(FENSTER, ton.duration)
      );
      this.zeigeVorschau();
    } catch (fehler) {
      if (this.zu) return;
      const befund = fehler instanceof Dateifehler ? fehler.befund : 'unlesbar';
      const zusatz = fehler instanceof Dateifehler ? fehler.zusatz : undefined;
      logger.warn(`Geräusch mitbringen: ${befund}`, fehler);
      this.zeigeFehler(befund, zusatz);
    }
  }

  private zeigeFehler(befund: Dateibefund, zusatz?: string): void {
    this.buehne.replaceChildren();
    const kasten = document.createElement('div');
    kasten.className = 'mitbringen-fehler';
    const satz = document.createElement('p');
    satz.setAttribute('role', 'alert');
    satz.textContent = t(SATZ[befund], zusatz ? { zusatz } : undefined);
    kasten.appendChild(satz);
    this.buehne.appendChild(kasten);
    this.fuss.replaceChildren();
    const andere = document.createElement('button');
    andere.type = 'button';
    andere.className = 'primary';
    andere.textContent = t('mitbringen.andereDatei');
    andere.onclick = () => {
      this.schliesse();
      geraeuschMitbringen(this.optionen);
    };
    this.fuss.appendChild(andere);
    andere.focus();
  }

  private zeigeVorschau(): void {
    const ton = this.ton;
    if (!ton) return;
    /**
     * Die Vorschau wird mehr als einmal gezeigt.
     *
     * Wer die Ersetzen-Frage abbricht oder nach einem abgelehnten Ausschnitt
     * „Andere Stelle wählen" drückt, landet wieder hier — mit demselben
     * Regler-Stand. Deshalb muss diese Methode aufräumen, was sie beim letzten
     * Mal angelegt hat: Ohne diese vier Zeilen bliebe je ein Video-Objekt und
     * eine Objekt-URL zurück, und die halten den ganzen Film im Speicher.
     */
    if (this.video) {
      this.video.src = '';
      this.video = null;
    }
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
    }
    this.buehne.replaceChildren();

    if (istVideo(this.datei)) {
      /**
       * Das Bild — nur als Wegweiser.
       *
       * Stumm und ohne Bedienleiste: Gehört wird der Ausschnitt über den
       * Knopf darunter, und zwar die Tonspur, die auch ausgewertet wird. Zwei
       * Wiedergaben nebeneinander wären zwei Wahrheiten über dasselbe.
       */
      this.videoUrl = URL.createObjectURL(this.datei);
      const v = document.createElement('video');
      v.className = 'mitbringen-video';
      v.muted = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.src = this.videoUrl;
      v.onloadedmetadata = () => this.springeBild();
      this.video = v;
      this.buehne.appendChild(v);
    }

    const dauer = document.createElement('p');
    dauer.className = 'muted small mitbringen-dauer';
    dauer.textContent = t('mitbringen.dauer', {
      dauer: ton.duration.toFixed(1),
      rate: String(Math.round(ton.sampleRate / 1000)),
    });
    this.buehne.appendChild(dauer);

    this.maleWelle();
    this.rahmen.hidden = false;
    this.setzeRahmen();
    this.verdrahteZiehen();

    const hinweis = document.createElement('p');
    hinweis.className = 'muted small mitbringen-hinweis';
    hinweis.textContent =
      ton.duration <= FENSTER ? t('mitbringen.ganzKurz') : t('mitbringen.schieben');

    this.fuss.replaceChildren();
    const hoeren = document.createElement('button');
    hoeren.type = 'button';
    hoeren.className = 'mitbringen-hoeren';
    hoeren.textContent = t('mitbringen.hoeren');
    hoeren.onclick = () => void this.spiele(hoeren);

    const nehmen = document.createElement('button');
    nehmen.type = 'button';
    nehmen.className = 'primary mitbringen-nehmen';
    nehmen.textContent = t('mitbringen.verwenden');
    nehmen.onclick = () => {
      const teil = ausschnitt(ton, this.start, Math.min(FENSTER, ton.duration));
      const name = this.datei.name;
      this.schliesse();
      this.optionen.uebernehmen(teil, name);
    };

    const zeile = document.createElement('div');
    zeile.className = 'mitbringen-knoepfe';
    zeile.append(hoeren, nehmen);
    this.fuss.append(hinweis, zeile);

    const normal = this.baueNormalblock();
    if (normal) this.fuss.appendChild(normal);

    nehmen.focus();
  }

  /**
   * ── DER ZWEITE AUSGANG ─────────────────────────────────────────────────
   *
   * Unter der einen Handlung und ungefüllt — dieselbe Zurückhaltung wie beim
   * Knopf, der diesen Dialog geöffnet hat. „Ansehen" bleibt der Hauptweg;
   * „Normalzustand" ist die Entscheidung, die man erst trifft, wenn man weiß,
   * dass man sie treffen will.
   *
   * Der Satz darüber sagt, was daraus folgt, nicht was der Knopf tut. „Als
   * Normalzustand speichern" allein wäre für jemanden, der das Wort zum ersten
   * Mal liest, keine Auskunft.
   */
  private baueNormalblock(): HTMLElement | null {
    const angebot = this.optionen.normalzustand;
    if (!angebot) return null;

    const block = document.createElement('div');
    block.className = 'mitbringen-normal';

    /**
     * Ein zweiter Ausgang, nicht zwei.
     *
     * Was hier steht, hängt davon ab, was die Maschine schon hat:
     *
     *   ohne Normalzustand  →  „Als Normalzustand speichern"
     *   mit  Normalzustand  →  „Als Prüfung auswerten"
     *
     * Der Grund ist die Frage, die der Nutzer mitbringt. Wer noch keinen
     * Maßstab hat, will einen. Wer einen hat, will fast immer wissen: Wie
     * steht dieses Geräusch dazu? Beides gleichrangig nebeneinander wäre eine
     * Wahl, die man nur treffen kann, wenn man beide Begriffe schon kennt.
     *
     * Der seltene Fall — den Maßstab ersetzen — bleibt erreichbar, aber leiser.
     */
    const pruefbar = angebot.vorhanden && Boolean(angebot.pruefen);
    const satz = document.createElement('p');
    satz.className = 'muted small mitbringen-normal-text';
    satz.textContent = pruefbar
      ? t('mitbringen.pruefungErklaerung')
      : angebot.vorhanden
        ? t('mitbringen.normalSchonEiner')
        : t('mitbringen.normalNochKeiner');
    block.appendChild(satz);

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'mitbringen-normal-knopf';
    knopf.textContent = pruefbar ? t('mitbringen.alsPruefung') : t('mitbringen.alsNormalzustand');
    knopf.onclick = () => {
      if (pruefbar) void this.werteAlsPruefungAus();
      else if (angebot.vorhanden) this.frageErsetzen();
      else void this.speichereNormalzustand();
    };
    block.appendChild(knopf);

    if (pruefbar) {
      const ersetzen = document.createElement('button');
      ersetzen.type = 'button';
      ersetzen.className = 'mitbringen-normal-leise';
      ersetzen.textContent = t('mitbringen.alsNormalzustand');
      ersetzen.onclick = () => this.frageErsetzen();
      block.appendChild(ersetzen);
    }
    return block;
  }

  /**
   * Den Ausschnitt als Prüfung durchlaufen lassen.
   *
   * Bei Erfolg geht der Dialog zu — das Ergebnis steht dann auf der
   * Maschinenebene, wo jede Prüfung steht. Ein zweiter Ort dafür wäre eine
   * zweite Wahrheit über dieselbe Messung.
   */
  private async werteAlsPruefungAus(): Promise<void> {
    const pruefen = this.optionen.normalzustand?.pruefen;
    const ton = this.ton;
    if (!pruefen || !ton) return;

    this.spieler.stop();
    this.laeuft = false;
    this.fuss.replaceChildren();
    const warten = document.createElement('p');
    warten.className = 'mitbringen-warten';
    warten.setAttribute('role', 'status');
    warten.textContent = t('mitbringen.pruefungLaeuft');
    this.fuss.appendChild(warten);

    const teil = ausschnitt(ton, this.start, Math.min(FENSTER, ton.duration));
    const befund = await pruefen(teil);
    if (this.zu) return;
    if (befund.ok) {
      this.schliesse();
      return;
    }
    this.zeigeNormalFehler(befund.satz ?? t('mitbringen.pruefungGingNicht'));
  }

  /**
   * §7e: Ein Normalzustand wird nie still überschrieben.
   *
   * Er ist der Maßstab, an dem jede Prüfung dieser Maschine gemessen wird —
   * ihn zu ersetzen ändert rückwirkend nichts, aber ab jetzt alles. Deshalb
   * eine Frage mit zwei benannten Antworten, und die gefährliche ist nicht die
   * gefüllte.
   *
   * Im Dialog und nicht per `confirm()`: In installierten PWAs wird `confirm()`
   * auf Android stillschweigend unterdrückt — es erscheint kein Fenster, der
   * Aufruf liefert sofort `false`. Dieselbe Lehre steht in `2-Reference.ts`.
   */
  private frageErsetzen(): void {
    this.fuss.replaceChildren();

    const frage = document.createElement('p');
    frage.className = 'mitbringen-ersetzen-frage';
    frage.setAttribute('role', 'alert');
    frage.textContent = t('mitbringen.ersetzenFrage');

    const beruhigung = document.createElement('p');
    beruhigung.className = 'muted small';
    beruhigung.textContent = t('mitbringen.ersetzenBleibt');

    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'mitbringen-hoeren';
    zurueck.textContent = t('mitbringen.abbrechen');
    zurueck.onclick = () => this.zeigeVorschau();

    const los = document.createElement('button');
    los.type = 'button';
    los.className = 'primary mitbringen-ersetzen-knopf';
    los.textContent = t('mitbringen.ersetzenTun');
    los.onclick = () => void this.speichereNormalzustand();

    const zeile = document.createElement('div');
    zeile.className = 'mitbringen-knoepfe';
    zeile.append(zurueck, los);
    this.fuss.append(frage, beruhigung, zeile);
    zurueck.focus();
  }

  /**
   * Speichern — und dabei sagen, dass es dauert.
   *
   * Merkmale ziehen, Kirschen pflücken, Modell trainieren: Das sind auf einem
   * Telefon Sekunden. Ein Knopf, der in dieser Zeit unverändert dasteht, sieht
   * aus wie ein Knopf, der nicht funktioniert hat.
   */
  private async speichereNormalzustand(): Promise<void> {
    const angebot = this.optionen.normalzustand;
    const ton = this.ton;
    if (!angebot || !ton) return;

    this.spieler.stop();
    this.laeuft = false;
    this.fuss.replaceChildren();
    const warten = document.createElement('p');
    warten.className = 'mitbringen-warten';
    warten.setAttribute('role', 'status');
    warten.textContent = t('mitbringen.normalSpeichert');
    this.fuss.appendChild(warten);

    const teil = ausschnitt(ton, this.start, Math.min(FENSTER, ton.duration));
    const befund = await angebot.speichern(teil, this.datei.name);
    if (this.zu) return;
    if (befund.ok) {
      this.schliesse();
      return;
    }
    this.zeigeNormalFehler(befund.satz);
  }

  /**
   * Es hat nicht geklappt — und der Weg weiter führt zurück in denselben Film.
   *
   * „Andere Datei wählen" wäre hier die falsche Hilfe: Wenn der Ausschnitt zu
   * kurz oder zu unruhig war, liegt die passende Stelle meist in derselben
   * Aufnahme, einen Zug am Regler entfernt.
   */
  private zeigeNormalFehler(satz: string): void {
    this.fuss.replaceChildren();
    const p = document.createElement('p');
    p.className = 'mitbringen-normal-fehler';
    p.setAttribute('role', 'alert');
    p.textContent = satz;

    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'primary';
    zurueck.textContent = t('mitbringen.andereStelle');
    zurueck.onclick = () => this.zeigeVorschau();

    this.fuss.append(p, zurueck);
    zurueck.focus();
  }

  /** Die Wellenform des ganzen Stücks — grob, sie ist eine Landkarte. */
  private maleWelle(): void {
    const ton = this.ton;
    if (!ton) return;
    const breite = Math.max(200, Math.round(this.dialog.clientWidth || 320) - 24);
    const hoehe = 64;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.leinwand.width = Math.round(breite * dpr);
    this.leinwand.height = Math.round(hoehe * dpr);
    this.leinwand.style.width = `${breite}px`;
    this.leinwand.style.height = `${hoehe}px`;
    const c = this.leinwand.getContext('2d');
    if (!c) return;
    c.scale(dpr, dpr);
    c.clearRect(0, 0, breite, hoehe);
    const daten = ton.getChannelData(0);
    const proSpalte = Math.max(1, Math.floor(daten.length / breite));
    c.fillStyle = getComputedStyle(this.leinwand).color || '#0d9488';
    for (let x = 0; x < breite; x += 1) {
      let max = 0;
      const von = x * proSpalte;
      for (let i = von; i < Math.min(daten.length, von + proSpalte); i += 1) {
        const a = Math.abs(daten[i]);
        if (a > max) max = a;
      }
      const h = Math.max(1, max * hoehe);
      c.fillRect(x, (hoehe - h) / 2, 1, h);
    }
  }

  private setzeRahmen(): void {
    const ton = this.ton;
    if (!ton) return;
    const anteil = Math.min(1, FENSTER / ton.duration);
    this.rahmen.style.left = `${(this.start / ton.duration) * 100}%`;
    this.rahmen.style.width = `${anteil * 100}%`;
  }

  private springeBild(): void {
    if (!this.video) return;
    // In die Mitte des Ausschnitts: Dort ist am ehesten zu sehen, worum es geht.
    const ziel = this.start + Math.min(FENSTER, this.ton?.duration ?? FENSTER) / 2;
    try {
      this.video.currentTime = Math.max(0, ziel);
    } catch {
      /* Manche Container erlauben kein Springen — dann bleibt das erste Bild. */
    }
  }

  private verdrahteZiehen(): void {
    const ton = this.ton;
    if (!ton || ton.duration <= FENSTER) return;
    // Nur einmal: Die Wellenfläche überlebt jedes Neuzeichnen der Vorschau,
    // ihre Zuhörer würden sich sonst stapeln.
    if (this.gezogenVerdrahtet) return;
    this.gezogenVerdrahtet = true;
    const flaeche = this.leinwand.parentElement;
    if (!flaeche) return;
    const setzen = (klientX: number) => {
      const k = flaeche.getBoundingClientRect();
      const anteil = Math.min(1, Math.max(0, (klientX - k.left) / k.width));
      this.start = Math.min(
        ton.duration - FENSTER,
        Math.max(0, anteil * ton.duration - FENSTER / 2)
      );
      this.setzeRahmen();
      this.springeBild();
    };
    let zieht = false;
    flaeche.addEventListener('pointerdown', (e) => {
      zieht = true;
      flaeche.setPointerCapture(e.pointerId);
      setzen(e.clientX);
    });
    flaeche.addEventListener('pointermove', (e) => {
      if (zieht) setzen(e.clientX);
    });
    const ende = () => {
      zieht = false;
    };
    flaeche.addEventListener('pointerup', ende);
    flaeche.addEventListener('pointercancel', ende);
  }

  private async spiele(knopf: HTMLButtonElement): Promise<void> {
    const ton = this.ton;
    if (!ton) return;
    if (this.laeuft) {
      this.spieler.stop();
      this.laeuft = false;
      knopf.textContent = t('mitbringen.hoeren');
      return;
    }
    this.laeuft = true;
    knopf.textContent = t('mitbringen.stoppen');
    try {
      this.spieler.unlock();
      // In normaler Geschwindigkeit: Hier soll man hören, was aufgenommen
      // wurde — nicht, was die Hör-Lupe daraus macht.
      await this.spieler.play(
        ausschnitt(ton, this.start, Math.min(FENSTER, ton.duration)),
        { playbackRate: 1 },
        () => {
          this.laeuft = false;
          if (!this.zu) knopf.textContent = t('mitbringen.hoeren');
        }
      );
    } catch (fehler) {
      logger.warn('Ausschnitt ließ sich nicht abspielen', fehler);
      this.laeuft = false;
      knopf.textContent = t('mitbringen.hoeren');
    }
  }

  private schliesse(): void {
    if (this.zu) return;
    this.zu = true;
    this.spieler.stop();
    if (this.video) {
      this.video.src = '';
      this.video = null;
    }
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
    }
    this.overlay.remove();
    this.vorherFokus?.focus();
  }
}

/**
 * Eine Datei auswählen lassen und die Vorschau öffnen.
 *
 * Audio UND Video im selben Filter: Für `decodeAudioData` ist der Unterschied
 * keiner — die Bildspur wird ignoriert. Ein zweiter Knopf „Video verwenden"
 * wäre eine Unterscheidung, die den Nutzer nichts angeht.
 */
export function geraeuschMitbringen(optionen: MitbringenOptions): void {
  const feld = document.createElement('input');
  feld.type = 'file';
  feld.accept = 'audio/*,video/*';
  feld.hidden = true;
  feld.addEventListener('change', () => {
    const datei = feld.files?.[0];
    feld.remove();
    if (datei) new Vorschau(datei, optionen);
  });
  document.body.appendChild(feld);
  feld.click();
}
