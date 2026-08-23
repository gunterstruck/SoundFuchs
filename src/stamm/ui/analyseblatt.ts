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
import { t } from '../../i18n/index.js';
import { REITER_GEWECHSELT, offenerReiter, reiterOeffnen, type Reiter } from './schale.js';

/** Woraus die Analyse besteht: zwei Aufnahmen und der Name dazu. */
export interface Analysestoff {
  referenz: AudioBuffer | null;
  messung: AudioBuffer | null;
  maschinenname: string;
}

const PLAETZE: Readonly<Record<'zweid' | 'dreid' | 'briefing', string>> = Object.freeze({
  zweid: 'tab-zweid',
  dreid: 'tab-dreid',
  briefing: 'tab-briefing',
});

let stoff: Analysestoff | null = null;
let lupe: ListenPanel | null = null;
let bild: Klangbild | null = null;
let gebirge: Spectrogram3DPanel | null = null;
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
