/**
 * DAS ANALYSEBLATT — DIE WERKZEUGE EINEN ZUG ENTFERNT
 *
 * Der Auftraggeber am 23.08.2026: Das Blatt, das man bei TourFuchs aufzieht,
 * um eine Tour zu planen, soll hinter dem Scharnier die **gesamte Analyse**
 * aufnehmen — 2D, 3D-Gebirge, Briefing. Oben bleibt, worum sich alles dreht:
 * die aktuelle Prüfung.
 *
 * ## Was der Anlass wirklich war
 *
 * Gemessen auf der Maschinenebene (Handy 390 × 844):
 *
 *     Reiter im Blatt      „📄 Standorte"  ·  „Filter"
 *     Inhalt des Reiters   ""            ← leer
 *     Blatt-Oberkante      744 px  →  aufgezogen 404 px
 *
 * Das Blatt war also schon da, ließ sich schon aufziehen — und war falsch
 * beschriftet und leer. Der Vorschlag ist damit keine Erweiterung, sondern
 * eine Reparatur.
 *
 * Dazu kam eine zweite Unordnung: Drei Werkzeuge derselben Art wurden auf drei
 * verschiedenen Wegen erreicht — die Hör-Lupe über „Unterschied anhören", das
 * Gebirge über einen Tipp aufs Klangbild, das Briefing über einen Knopf weit
 * unten. Keiner dieser Wege hieß „Analyse".
 *
 * ## Die Regel, die daraus folgt
 *
 * Aufgezogen verdeckt das Blatt die untere Hälfte der Seite. Das ist gewollt —
 * wer analysiert, arbeitet in der Analyse. Es erzwingt aber: **Was im Blatt
 * liegt, muss dort vollständig sein.** Ein Reiter, der auf etwas oben
 * verweist, wäre eine halbe Sache, denn oben ist dann verdeckt.
 *
 * ## Warum die Inhalte erst beim Öffnen entstehen
 *
 * Das Gebirge kostet Matrix, WebGL und eine spektrale Subtraktion. Es lag
 * bisher hinter einem Tipp, damit die Maschinenseite nicht darauf wartet — und
 * dieselbe Zurückhaltung gilt hier: Ein Reiter baut sich, wenn er das erste
 * Mal aufgeht, nicht wenn das Blatt gefüllt wird.
 */

import { ListenPanel } from '@ui/components/ListenPanel.js';
import { Klangbild } from '@ui/components/Klangbild.js';
import { Spectrogram3DPanel } from '@ui/components/Spectrogram3DPanel.js';
import { openAnalysisPackageDialog } from '@ui/components/AnalysisPackageDialog.js';
import { WorkPointRanking, type WorkPoint } from '@ui/components/WorkPointRanking.js';
import { renderAnalysisCanvas } from '@ui/phases/analysisRender.js';
import { averageSpectrum } from '@core/dsp/spectrumSummary.js';
import { extractFeatures, DEFAULT_DSP_CONFIG } from '@core/dsp/features.js';
import { scoreAllWithEngines } from '@core/ml/engine/registry.js';
import type { ReferenceModel } from '@data/types.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import { REITER_GEWECHSELT, offenerReiter, reiterOeffnen, type Reiter } from './schale.js';

/** Woraus die Analyse besteht: zwei Aufnahmen und der Name dazu. */
export interface Analysestoff {
  referenz: AudioBuffer | null;
  messung: AudioBuffer | null;
  maschinenname: string;
  /**
   * Die angelernten Betriebspunkte der Maschine — für die Rangliste im
   * Reiter „Details".
   *
   * Optional, weil der Rest des Blatts sie nicht braucht: 2D, Gebirge und
   * Briefing arbeiten allein mit den beiden Tönen. Fehlen sie, sagt der
   * Reiter das, statt leer zu bleiben.
   */
  modelle?: ReferenceModel[];
  /**
   * Wie die Prüfung ausgegangen ist — sie färbt die Kurve.
   *
   * Durchgereicht und nicht neu gerechnet. Die Maschinenseite zeigt oben
   * bereits einen Prozentwert; würde der Reiter sich seine eigene Farbe
   * ausrechnen, gäbe es zwei Urteile über dieselbe Messung. Wo noch keins
   * vorliegt — ein mitgebrachter Ton etwa —, bleibt es bei `uncertain`:
   * nichts hat ihn bisher beurteilt.
   */
  status?: 'healthy' | 'uncertain' | 'faulty';
}

const PLAETZE: Readonly<Record<'zweid' | 'dreid' | 'briefing' | 'details', string>> = Object.freeze({
  zweid: 'tab-zweid',
  dreid: 'tab-dreid',
  briefing: 'tab-briefing',
  details: 'tab-details',
});

let stoff: Analysestoff | null = null;
let lupe: ListenPanel | null = null;
let bild: Klangbild | null = null;
let gebirge: Spectrogram3DPanel | null = null;
let rangliste: WorkPointRanking | null = null;
/** Hält die Frequenzkurve scharf, wenn das Blatt seine Höhe ändert. */
let kurvenbeobachter: ResizeObserver | null = null;
/** Welche Reiter für den aktuellen Stoff schon gebaut sind. */
const gebaut = new Set<string>();
let verdrahtet = false;

function platz(reiter: keyof typeof PLAETZE): HTMLElement | null {
  return document.getElementById(PLAETZE[reiter]);
}

/**
 * Der leere Zustand eines Reiters — er sagt, was fehlt, nicht dass etwas
 * schiefging.
 *
 * Ein Reiter, der bei fehlendem Ton einfach leer bliebe, sähe aus wie ein
 * Fehler. „Noch keine Messung" ist eine Auskunft.
 */
function leerzustand(ziel: HTMLElement, text: string): void {
  const p = document.createElement('p');
  p.className = 'blatt-leer';
  p.textContent = text;
  ziel.appendChild(p);
}

function baue(reiter: keyof typeof PLAETZE): void {
  const ziel = platz(reiter);
  if (!ziel || gebaut.has(reiter)) return;
  gebaut.add(reiter);
  ziel.replaceChildren();

  if (!stoff || (!stoff.referenz && !stoff.messung)) {
    leerzustand(ziel, t('blatt.nochNichts'));
    return;
  }

  if (reiter === 'zweid') {
    /**
     * Zuerst das Bild mit seinen Werkzeugen.
     *
     * Das Klangbild trägt die vier Quellen (Normalzustand · Messung ·
     * Unterschied · Iris) und das Ziehen: eine Stelle greifen und hören. Das
     * ist die **Basis**-Fähigkeit — sie stand vorher auf der Maschinenseite
     * und wäre beim Umzug still verschwunden, denn die Bereichsauswahl der
     * Hör-Lupe darunter ist Profi.
     *
     * Ohne Tipp ins Gebirge: Das hat seinen eigenen Reiter.
     */
    bild = new Klangbild({
      reference: stoff.referenz,
      measurement: stoff.messung,
      ohneGebirge: true,
    });
    if (bild.hasContent) ziel.appendChild(bild.element);
    else bild = null;

    /**
     * Dieselbe Hör-Lupe wie im Verlauf, nur an einem anderen Platz. Eine
     * zweite Fassung wäre eine zweite Wahrheit darüber, was „Unterschied"
     * bedeutet.
     *
     * `mitUeberschrift: false` — der Reiter trägt den Namen bereits.
     *
     * Und ohne `analysisPackage`: Die Hör-Lupe bringt sonst ihren eigenen
     * Briefing-Einstieg mit. Das Briefing hat hier einen eigenen Reiter, und
     * zwei Türen zum selben Werkzeug sind genau die Unordnung, für die es
     * dieses Blatt gibt.
     */
    lupe = new ListenPanel({
      reference: stoff.referenz,
      measurement: stoff.messung,
      mitUeberschrift: false,
      shareName: stoff.maschinenname,
    });
    if (!lupe.hasContent) {
      lupe = null;
      if (!bild) leerzustand(ziel, t('blatt.nochNichts'));
      return;
    }
    ziel.appendChild(lupe.element);
    return;
  }

  if (reiter === 'dreid') {
    if (!stoff.referenz || !stoff.messung) {
      leerzustand(ziel, t('blatt.gebirgeBrauchtBeide'));
      return;
    }
    gebirge = new Spectrogram3DPanel({
      reference: stoff.referenz,
      measurement: stoff.messung,
    });
    ziel.appendChild(gebirge.element);
    /**
     * Der Reiter IST die Bitte.
     *
     * Das Panel baut sein Gebirge sonst erst beim Tipp auf „🏔️ 3D-Ansicht" —
     * richtig, solange es unangefordert auf einer Seite steht. Hier hat der
     * Nutzer gerade „3D" gewählt; ein zweiter Tipp wäre dieselbe Frage ein
     * zweites Mal. Gemessen im Wächter: Der Reiter zeigte Chips und keine
     * Leinwand.
     */
    gebirge.oeffne();
    return;
  }

  if (reiter === 'details') {
    baueDetails(ziel);
    return;
  }

  // Briefing: ein Satz, was es ist, und der Weg hinein. Der Dialog selbst
  // bleibt ein Dialog — er führt durch mehrere Schritte und hat sein eigenes
  // Versprechen („SoundFuchs hat nichts hochgeladen"), das nicht in einem
  // halbhohen Blatt untergehen soll.
  const erklaerung = document.createElement('p');
  erklaerung.className = 'blatt-briefing-text';
  erklaerung.textContent = t('blatt.briefingErklaerung');
  ziel.appendChild(erklaerung);

  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'primary blatt-briefing-knopf';
  knopf.textContent = t('maschine.briefing');
  knopf.addEventListener('click', () => {
    if (!stoff) return;
    openAnalysisPackageDialog({
      reference: stoff.referenz,
      measurement: stoff.messung as AudioBuffer,
      machineName: stoff.maschinenname,
      // Was im 2D-Reiter markiert wurde, fährt mit: Wer einen Bereich
      // ausgewählt hat, meint genau den.
      getSelection: () => lupe?.aktuelleAuswahl() ?? null,
    });
  });
  ziel.appendChild(knopf);
}

/**
 * DER REITER „DETAILS" — DIE BEIDEN EXPERTENANSICHTEN, ZURÜCKGEHOLT
 *
 * Beide gingen mit dem Abriss des alten Ergebnisdialogs (#100), weil sie seit
 * dem 22.08.2026 in ein Fenster zeichneten, das nicht mehr aufging. Der Abriss
 * hat ihnen schon den Platz genannt, an den sie gehören, falls sie
 * zurückkommen: „neben 2D und Gebirge ins Analyseblatt, eigener Schnitt."
 * Genau hier ist er.
 *
 * ## Was sie zeigen
 *
 *   Frequenzabweichung   die gemessene Kurve über der des Normalzustands,
 *                        beide auf log-Hz und dB, mit den zwei stärksten
 *                        Spitzen beziffert
 *   Betriebspunkte       jeder angelernte Zustand mit seinem Wert — nicht
 *                        nur der beste, sondern das ganze Feld
 *
 * ## Warum sie hinter Profi liegen
 *
 * Sie beantworten eine Frage, die auf Basis gar nicht gestellt wird: nicht
 * „klingt es anders?", sondern „bei welcher Frequenz, und welchem bekannten
 * Zustand ähnelt es sonst noch?". Das Verstecken macht `data-view-level` am
 * Reiter und am Feld (index.html) — dieselbe Mechanik wie bei der
 * Bereichsauswahl der Hör-Lupe.
 *
 * ## Was hier NICHT steht
 *
 * Kein Prozentsatz als Überschrift. Der steht oben auf der Maschinenseite, und
 * ein zweiter hier wäre ein zweites Urteil über dieselbe Messung. Die Rangliste
 * rechnet dieselbe Mittelung wie die Prüfung selbst (`mean` über alle Fenster),
 * damit ihr erster Platz mit der Zahl oben zusammenfällt statt daneben.
 */
function baueDetails(ziel: HTMLElement): void {
  if (!stoff?.messung) {
    leerzustand(ziel, t('blatt.detailsBrauchtMessung'));
    return;
  }
  const messung = stoff.messung;

  const kurvenfeld = document.createElement('div');
  kurvenfeld.className = 'blatt-details-kurve';
  const ueberschrift = document.createElement('h4');
  ueberschrift.textContent = t('blatt.detailsKurve');
  kurvenfeld.appendChild(ueberschrift);

  /**
   * Ohne Bezeichner.
   *
   * Die alte Leinwand hieß `#analysis-canvas`, und `#analysis-canvas` in
   * style.css setzt `height: 100px`. Ein Bezeichner schlägt jede Klasse — die
   * 160 px dieses Reiters wären also wirkungslos geblieben, und zwar
   * unsichtbar: Die Kurve wäre gezeichnet worden, nur zu flach.
   *
   * Gebraucht wird der Name ohnehin nicht: `renderAnalysisCanvas` bekommt das
   * Element, nicht seinen Bezeichner. Die tote Regel ist mitgegangen.
   */
  const leinwand = document.createElement('canvas');
  leinwand.className = 'blatt-details-canvas';
  kurvenfeld.appendChild(leinwand);

  const bildunterschrift = document.createElement('p');
  bildunterschrift.className = 'muted small';
  bildunterschrift.textContent = stoff.referenz
    ? t('blatt.detailsKurveErklaerung')
    : t('blatt.detailsKurveOhneReferenz');
  kurvenfeld.appendChild(bildunterschrift);
  ziel.appendChild(kurvenfeld);

  /**
   * ANGEHÄNGT IST NICHT DASSELBE WIE SICHTBAR.
   *
   * `renderAnalysisCanvas` misst die Leinwand mit `getBoundingClientRect()`,
   * um ihre Auflösung zu setzen. Steht das Blatt in dem Moment nur auf
   * Guckhöhe, ist die Leinwand 0 × 0 — dann rechnet die Funktion sauber
   * durch und malt in nichts hinein. Danach kann das Blatt aufgehen, so weit
   * es will: Was einmal in eine 0 × 0 große Leinwand gezeichnet wurde, kommt
   * nicht zurück.
   *
   * Gemessen am 23.08.2026 im Durchlauf: Leinwand 0 px, 0 Farbstufen, während
   * die Überschrift darüber ordentlich dastand. Genau derselbe Fehler wie beim
   * Klangbild am selben Tag — und dort habe ich ihn erst für behoben erklärt
   * und dann nachgemessen.
   *
   * Deshalb: einmal jetzt zeichnen (meistens reicht das) und noch einmal,
   * sobald die Leinwand wirklich eine Größe bekommt.
   */
  const zeichne = (): void => {
    try {
      if (!stoff?.messung) return;
      const spektrum = averageSpectrum(stoff.messung);
      renderAnalysisCanvas(
        leinwand,
        { features: spektrum, frequencyRange: [0, stoff.messung.sampleRate / 2] },
        stoff.referenz
          ? { data: averageSpectrum(stoff.referenz), nyquist: stoff.referenz.sampleRate / 2 }
          : null,
        stoff.status ?? 'uncertain'
      );
    } catch (fehler) {
      logger.warn('Details: Frequenzkurve nicht gezeichnet', fehler);
      kurvenfeld.remove();
    }
  };
  zeichne();
  if (typeof ResizeObserver !== 'undefined') {
    kurvenbeobachter?.disconnect();
    let zuletzt = 0;
    kurvenbeobachter = new ResizeObserver(() => {
      const breit = Math.round(leinwand.getBoundingClientRect().width);
      // Nur bei einer echten Änderung neu zeichnen — sonst löst das Setzen der
      // Auflösung im Zeichnen die nächste Meldung aus, und das läuft im Kreis.
      if (breit > 0 && breit !== zuletzt) {
        zuletzt = breit;
        zeichne();
      }
    });
    kurvenbeobachter.observe(leinwand);
  }

  const befund = betriebspunkte(messung, stoff.modelle ?? []);
  if (befund.art === 'rateAnders') {
    leerzustand(
      ziel,
      t('blatt.detailsRatenPassenNicht', {
        modell: String(Math.round(befund.modell / 100) / 10),
        messung: String(Math.round(befund.messung / 100) / 10),
      })
    );
    return;
  }
  if (befund.art !== 'liste') {
    leerzustand(ziel, t('blatt.detailsBrauchtNormalzustand'));
    return;
  }

  const rangfeld = document.createElement('div');
  rangfeld.id = 'blatt-betriebspunkte';
  ziel.appendChild(rangfeld);
  rangliste = new WorkPointRanking('blatt-betriebspunkte', { maxItems: 10 });
  rangliste.update(befund.punkte);
}

/**
 * Was beim Auszählen der Betriebspunkte herauskam.
 *
 * Mit benanntem Ausgang statt mit leerer Liste: Eine leere Liste sagt „nichts
 * da", und das stimmt in einem der drei Fälle nicht — der Vergleich war
 * möglich, er war nur nicht zulässig.
 */
type Punktebefund =
  | { art: 'liste'; punkte: WorkPoint[] }
  | { art: 'rateAnders'; modell: number; messung: number }
  | { art: 'nichts' };

/**
 * Jeden angelernten Betriebspunkt gegen die ganze Aufnahme halten.
 *
 * Fenster für Fenster bewerten und je Zustand mitteln — dieselbe Rechnung, mit
 * der auch die Prüfung selbst zu ihrer Zahl kommt. Nur den letzten Frame zu
 * nehmen (so lief es im alten Dialog, wo die Messung noch lief) wäre hier
 * willkürlich: Die Aufnahme liegt vollständig vor, es gibt keinen Grund, sich
 * auf ihr Ende zu verlassen.
 *
 * ## Wenn die Abtastraten nicht zusammenpassen
 *
 * Ein Merkmalsvektor hat 512 Felder, die gleichmäßig über 0 bis zur halben
 * Abtastrate liegen. Feld 100 bedeutet bei 44,1 kHz eine andere Frequenz als
 * bei 48 kHz. Ein Modell, das bei 48 kHz gelernt hat, gegen eine Aufnahme bei
 * 44,1 kHz zu halten, vergleicht deshalb zwei verschiedene Achsen — GMIA weist
 * das mit einer eigenen Fehlermeldung zurück, und das ist richtig so.
 *
 * Gemessen im Durchlauf am 23.08.2026: Modell 48 000 Hz, aufbewahrte Messung
 * 44 100 Hz, jede Wertung verworfen — und der Reiter stand mit „noch kein
 * angelernter Betriebspunkt" da, was schlicht falsch war. Einer war da.
 *
 * Hier wird deshalb VORHER nachgesehen und der Fall beim Namen genannt. Nicht
 * umgerechnet: Die Merkmale auf eine andere Achse zu schieben wäre eine
 * Signalverarbeitungs-Entscheidung, die man trifft und begründet — nicht eine,
 * die man einbaut, damit ein Reiter voll aussieht.
 */
function betriebspunkte(messung: AudioBuffer, modelle: ReferenceModel[]): Punktebefund {
  if (modelle.length === 0) return { art: 'nichts' };
  const rate = messung.sampleRate;
  const fremd = modelle.find((m) => {
    const r = (m as { sampleRate?: number }).sampleRate;
    return typeof r === 'number' && r > 0 && r !== rate;
  });
  if (fremd) {
    return {
      art: 'rateAnders',
      modell: (fremd as { sampleRate?: number }).sampleRate ?? 0,
      messung: rate,
    };
  }
  try {
    const merkmale = extractFeatures(messung, {
      ...DEFAULT_DSP_CONFIG,
      sampleRate: rate,
      frequencyRange: [0, rate / 2] as [number, number],
    });
    if (merkmale.length === 0) return { art: 'nichts' };

    const summe = new Map<string, { wert: number; anzahl: number; gesund: boolean; datum?: number }>();
    for (const feature of merkmale) {
      for (const punkt of scoreAllWithEngines(modelle, { feature, sampleRate: rate })) {
        const bisher = summe.get(punkt.label);
        if (bisher) {
          bisher.wert += punkt.score;
          bisher.anzahl += 1;
        } else {
          summe.set(punkt.label, {
            wert: punkt.score,
            anzahl: 1,
            gesund: punkt.isHealthy,
            datum: punkt.trainingDate,
          });
        }
      }
    }

    const punkte = [...summe.entries()]
      .map(([label, s]) => ({
        name: label === 'Baseline' ? t('reference.labels.baseline') : label,
        score: s.wert / s.anzahl,
        isHealthy: s.gesund,
        metadata: { trainingDate: s.datum },
      }))
      .sort((a, b) => b.score - a.score);
    return punkte.length > 0 ? { art: 'liste', punkte } : { art: 'nichts' };
  } catch (fehler) {
    logger.warn('Details: Betriebspunkte nicht berechnet', fehler);
    return { art: 'nichts' };
  }
}

/**
 * Den Stoff einlegen.
 *
 * Ändert sich der Stoff, werden alle Reiter verworfen: Ein Gebirge, das noch
 * die vorige Messung zeigt, wäre schlimmer als keins. Gebaut wird danach nur,
 * was gerade offen ist — der Rest wartet auf seinen ersten Tipp.
 */
export function analyseblattFuellen(neu: Analysestoff | null): void {
  verdrahte();
  const gleich =
    stoff?.referenz === neu?.referenz &&
    stoff?.messung === neu?.messung &&
    stoff?.maschinenname === neu?.maschinenname;
  if (!gleich) {
    abraeumen();
    stoff = neu;
  }
  /**
   * Auch bei gleichem Stoff bauen — und auch bei gar keinem.
   *
   * Der erste Versuch kehrte hier um, wenn sich nichts geändert hatte. Gemessen
   * auf einer Maschine ohne Normalzustand: Der 2D-Reiter stand offen und war
   * **leer** — kein Bild, kein Satz, nichts. Ein leerer Reiter sieht aus wie
   * ein Fehler, nicht wie eine Auskunft.
   *
   * `baue` kehrt selbst um, wenn der Reiter schon steht; hier kann also
   * bedenkenlos gerufen werden.
   */
  const offen = offenerReiter();
  if (offen in PLAETZE) baue(offen as keyof typeof PLAETZE);
}

/** Alles wegräumen — beim Verlassen der Maschinenebene. */
export function analyseblattLeeren(): void {
  abraeumen();
  stoff = null;
}

function abraeumen(): void {
  bild?.destroy();
  bild = null;
  lupe?.destroy();
  lupe = null;
  gebirge?.destroy();
  gebirge = null;
  rangliste?.destroy();
  rangliste = null;
  kurvenbeobachter?.disconnect();
  kurvenbeobachter = null;
  for (const id of Object.values(PLAETZE)) document.getElementById(id)?.replaceChildren();
  gebaut.clear();
}

/**
 * Einen Reiter des Blatts von außen öffnen.
 *
 * Die Maschinenseite behält ihre Handlungen — „Unterschied anhören" bleibt die
 * eine dominante Handlung. Sie führt jetzt aber hierher, statt eine zweite
 * Hör-Lupe auf der Seite aufzumachen. Zwei Wege zum selben Werkzeug waren
 * genau die Unordnung, die dieses Blatt beseitigt.
 */
export function analyseblattOeffnen(reiter: keyof typeof PLAETZE): void {
  verdrahte();
  reiterOeffnen(reiter as Reiter);
  baue(reiter);
}

/** Die Hör-Lupe des Blatts — für „Unterschied anhören". */
export function blattLupe(): ListenPanel | null {
  return lupe;
}

function verdrahte(): void {
  if (verdrahtet) return;
  verdrahtet = true;
  document.addEventListener(REITER_GEWECHSELT, (ereignis) => {
    const reiter = (ereignis as CustomEvent<Reiter>).detail;
    if (reiter in PLAETZE) baue(reiter as keyof typeof PLAETZE);
  });
}
