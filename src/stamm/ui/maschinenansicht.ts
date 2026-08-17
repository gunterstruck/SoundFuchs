/**
 * DIE MASCHINEN-ARBEITSEBENE
 *
 * Eine Maschine ist eine eigene semantische Ebene, kein Abschnitt am Ende
 * einer langen Bestandsseite. Diese Datei ist diese Ebene.
 *
 * ## Was sie ersetzt
 *
 * Gemessen am 16.08.2026, nachdem man eine Maschinenzeile angetippt hatte:
 *
 *   130 Maschinenzeilen im Arbeitskontext
 *   178 fokussierbare Elemente hinter dem Scharnier
 *   10 174 px innere Höhe (Handy), 11 016 px (Schreibtisch)
 *   ein Auswahlfenster für die Maschine, die man gerade ausgewählt hatte
 *
 * Der Bestand ist der Kontext, aus dem man kommt — nicht der, in dem man
 * arbeitet. Er bleibt jetzt draußen, und zwar vollständig: nicht nur aus dem
 * Bild, sondern aus dem Tab-Weg und aus dem Vorlesebaum. Ein Ding, das man
 * nicht sieht, aber vierzig Tabs lang durchtabben muss, ist nicht verborgen.
 *
 * ## Was sie zeigt
 *
 * Oben Name, Standort und der letzte bekannte Zustand — drei Zeilen
 * Orientierung. Darunter **eine** Handlung. Welche das ist, entscheidet die
 * Zustandsmaschine (`stamm/maschine/zustand.ts`), nicht diese Datei: Die
 * Ansicht malt, sie urteilt nicht.
 *
 * ## Sie ist kein Stamm — und sieht trotzdem so aus
 *
 * TourFuchs hat keine Maschinenebene. Gebaut ist sie aus dessen Teilen:
 * `.stat-grid` für die Kennzahlen, `button.primary` für die Handlung,
 * `.near-row` für den Verlauf, dieselben Abstände und Radien. Kein zweites
 * Formenvokabular (§0h).
 */

import type { DiagnosisResult, Machine } from '@data/types.js';
import { getLatestDiagnosis, getRecording, getRecordingsForMachine } from '@data/db.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { farbeFuerZustand } from '../features/standortmarker.js';
import { zustandZuWert } from '../../services/bestandsuebersicht.js';
import {
  zustandAus,
  handlungFuer,
  istErgebnis,
  type Lage,
  type Maschinenzustand,
} from '../maschine/zustand.js';
import { oeffneTiefe, TIEFE_GEOEFFNET, type TiefeDetail } from './scharnier.js';
import { NORMALZUSTAND_GESPEICHERT } from '@ui/phases/2-Reference.js';
import { renderMachineFingerprint } from '@ui/components/MachineFingerprint.js';
import { getReferenceIrisVector } from '@ui/phases/referenceIris.js';
import { getMachine } from '@data/db.js';
import { ListenPanel } from '@ui/components/ListenPanel.js';
import { holeErgebnis, PRUEFUNG_FERTIG, vergissErgebnis } from '../maschine/ergebnis.js';

export interface MaschinenansichtDeps {
  /**
   * Die Maschine, um die es geht — von außen gesetzt, weil das Scharnier nur
   * den Standort kennt.
   */
  aktuelleMaschine: () => Machine | null;
  /**
   * Den nächsten Schritt auslösen: Aufnahme oder Prüfung.
   *
   * Die Ansicht sagt nur, DASS es weitergeht. Womit, entscheidet der Router
   * anhand dessen, was die Maschine schon hat — dieselbe Entscheidung, die er
   * ohnehin für `MASCHINE_GEWAEHLT` trifft. Sie hier zu wiederholen wäre eine
   * zweite Stelle, an der sie falsch sein kann.
   */
  starteNaechstenSchritt: (maschine: Machine) => void;
  /** Den Verlauf dieser Maschine öffnen. */
  zeigeVerlauf: (maschine: Machine) => void;
  /**
   * Eine frischere Fassung derselben Maschine übernehmen.
   *
   * Nach dem Speichern des Normalzustands trägt die Maschine ein
   * Referenzmodell, das die Fassung in der Hand nicht kennt. Ohne dieses
   * Nachreichen stünde die Ebene weiter auf „Noch kein Normalzustand" — direkt
   * neben dem Fingerabdruck, der gerade daraus entstanden ist.
   */
  uebernimmMaschine: (maschine: Machine) => void;
}

const BEHAELTER_ID = 'maschinen-ansicht';

let deps: MaschinenansichtDeps | null = null;

/**
 * Der Fingerabdruck-Moment steht an, sobald ein Normalzustand gespeichert
 * wurde — einmal, für das nächste Zeichnen der Ebene.
 *
 * Als Merker und nicht als eigener Zustand in `zustand.ts`: Er ist kein Zustand
 * der Maschine, sondern ein Augenblick in der Reise. Die Maschine ist danach
 * schlicht `ready`; dass sie es gerade erst geworden ist, gehört der
 * Oberfläche und nicht der Fachlogik.
 */
let fingerabdruckZeigen = false;

function behaelter(): HTMLElement | null {
  return document.getElementById(BEHAELTER_ID);
}

/** Wann war die letzte Prüfung — in Worten. */
function vorWieLange(zeitpunkt: number): string {
  const minuten = Math.max(0, Math.round((Date.now() - zeitpunkt) / 60000));
  if (minuten < 2) return t('site.justNow');
  if (minuten < 60) return t('site.agoMinutes', { count: String(minuten) });
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return t('site.agoHours', { count: String(stunden) });
  return t('site.agoDays', { count: String(Math.round(stunden / 24)) });
}

/**
 * Der Satz über dem Ergebnis — in Alltagssprache.
 *
 * „Klingt wie der Normalzustand", nicht „Score 94". Die Zahl steht daneben und
 * stützt die Aussage; sie führt sie nicht an. Und niemals eine Ursache: Die
 * App hört einen Unterschied, sie sieht kein Lager.
 */
function urteil(zustand: Maschinenzustand): string {
  switch (zustand) {
    case 'untrained':
      return t('maschine.lageUntrained');
    case 'ready':
      return t('maschine.lageReady');
    case 'result-similar':
      return t('maschine.lageSimilar');
    case 'result-deviating':
      return t('maschine.lageDeviating');
    case 'permission-blocked':
      return t('maschine.lageMikrofon');
    case 'quality-insufficient':
      return t('maschine.lageQualitaet');
    case 'offline':
      return t('maschine.lageOffline');
    default:
      return t('maschine.lageLaeuft');
  }
}

/** Die Handlungsbeschriftung. Ausgeschrieben, damit `check-i18n` sie sieht. */
function handlungstext(schluessel: string): string {
  switch (schluessel) {
    case 'maschine.aktionReferenz':
      return t('maschine.aktionReferenz');
    case 'maschine.aktionPruefen':
      return t('maschine.aktionPruefen');
    case 'maschine.aktionStoppen':
      return t('maschine.aktionStoppen');
    case 'maschine.aktionRechnet':
      return t('maschine.aktionRechnet');
    case 'maschine.aktionFertig':
      return t('maschine.aktionFertig');
    case 'maschine.aktionUnterschied':
      return t('maschine.aktionUnterschied');
    case 'maschine.aktionMikrofon':
      return t('maschine.aktionMikrofon');
    case 'maschine.aktionWiederholen':
      return t('maschine.aktionWiederholen');
    default:
      return t('maschine.aktionErneut');
  }
}

/**
 * DER ERSTE WOW-MOMENT
 *
 * „Normalzustand ist bereit" — und daneben das, was gerade entstanden ist:
 * der akustische Fingerabdruck dieser Maschine, als radiale Iris.
 *
 * Er ist kein Schmuck. Bis hierher hat der Nutzer zehn Sekunden lang ein
 * Mikrofon an eine Maschine gehalten und musste glauben, dass dabei etwas
 * herauskam. Das Bild ist der Beleg: Es ist bei jeder Maschine anders, es
 * entsteht aus ihrem Klang, und man erkennt sie daran wieder.
 *
 * Gezeichnet wird mit der Komponente, die es längst gibt
 * (`MachineFingerprint`) — sie steht schon auf den Maschinenkarten und im
 * Messlabor. Eine zweite Fassung wäre ein zweites Bild derselben Sache.
 */
async function zeichneFingerabdruck(ziel: HTMLElement, maschine: Machine): Promise<void> {
  const kasten = document.createElement('div');
  kasten.className = 'maschine-fingerabdruck';

  const leinwand = document.createElement('canvas');
  leinwand.className = 'maschine-iris';
  leinwand.setAttribute('role', 'img');
  leinwand.setAttribute('aria-label', t('maschine.fingerabdruckAlt'));
  kasten.appendChild(leinwand);

  const satz = document.createElement('p');
  satz.className = 'maschine-fingerabdruck-satz';
  satz.textContent = t('maschine.fingerabdruckFertig');
  kasten.appendChild(satz);

  ziel.appendChild(kasten);

  // Erst zeichnen, wenn die Leinwand im Baum steht und ihre Maße hat.
  const vektor = await getReferenceIrisVector(maschine);
  if (vektor) requestAnimationFrame(() => renderMachineFingerprint(leinwand, vektor));
}

/**
 * Die Hör-Lupe dieser Ebene — höchstens eine, und sie wird abgeräumt.
 *
 * Sie hält einen Web-Audio-Spieler; zwei davon nebeneinander hieße zwei
 * Wiedergaben gleichzeitig, und die zweite hörte man nicht mehr richtig.
 */
let lupe: ListenPanel | null = null;

function raeumeLupeAb(): void {
  lupe?.destroy();
  // `destroy()` hält die Wiedergabe an, entfernt aber nichts aus dem Baum —
  // die Komponente weiß nicht, wo sie hängt. Wer sie eingehängt hat, hängt sie
  // auch wieder aus; sonst stünden nach dem zweiten Aufruf zwei Hör-Lupen da,
  // von denen nur eine reagiert.
  lupe?.element.remove();
  lupe = null;
}

/**
 * Die Hör-Lupe an eine Stelle zeichnen.
 *
 * Sie bekommt keine eigene Fassung für das Ergebnis: Es ist dieselbe
 * Komponente, die im Verlauf steht (`ui/components/ListenPanel.ts`). Eine
 * zweite wäre eine zweite Wahrheit darüber, was „Unterschied" bedeutet.
 */
function zeichneLupe(
  ziel: HTMLElement,
  referenz: AudioBuffer | null,
  messung: AudioBuffer | null
): ListenPanel | null {
  raeumeLupeAb();
  const panel = new ListenPanel({ reference: referenz, measurement: messung, mitUeberschrift: true });
  if (!panel.hasContent) return null;
  lupe = panel;
  ziel.appendChild(panel.element);
  return panel;
}

/**
 * Die Aufnahmen einer vergangenen Prüfung holen — für „Letzten Unterschied
 * anhören".
 *
 * Die Kennung der Aufnahme ist die der Diagnose; deshalb genügt die Diagnose,
 * um an ihren Ton zu kommen. Fehlt er, weil die Aufbewahrung ihn nicht behalten
 * hat, kommt `null` zurück — und der Knopf erscheint gar nicht erst. Ein Knopf,
 * der nichts tut, ist schlimmer als kein Knopf.
 */
async function toeneZurPruefung(
  maschine: Machine,
  diagnose: DiagnosisResult
): Promise<{ referenz: AudioBuffer; messung: AudioBuffer } | null> {
  try {
    const messungsAufnahme = await getRecording(diagnose.id);
    if (!messungsAufnahme?.audioBuffer) return null;
    const alle = await getRecordingsForMachine(maschine.id);
    const referenz = alle
      .filter((r) => r.type === 'reference' && r.audioBuffer)
      .sort((a, b) => b.timestamp - a.timestamp)[0]?.audioBuffer;
    if (!referenz) return null;
    return { referenz, messung: messungsAufnahme.audioBuffer };
  } catch (fehler) {
    logger.warn('Maschinenansicht: Ton der letzten Prüfung nicht ladbar', fehler);
    return null;
  }
}

async function zeichne(maschine: Machine): Promise<void> {
  const ziel = behaelter();
  if (!ziel) return;
  raeumeLupeAb();
  ziel.textContent = '';
  ziel.classList.remove('maschinen-ansicht-ergebnis');

  const letzte = await getLatestDiagnosis(maschine.id);
  /**
   * Das Ergebnis dieser Sitzung — und nur dieser.
   *
   * `holeErgebnis` liefert etwas, wenn der Nutzer gerade eben geprüft hat. Ein
   * Wert aus der Datenbank kommt hier bewusst NICHT hinein: Die Ebene öffnet
   * sich im Ruhezustand, nicht in einem Ergebnis von vorgestern. Was vorgestern
   * war, steht darunter als Auskunft.
   */
  const frisch = holeErgebnis(maschine.id);
  const lage: Lage = {
    hatNormalzustand: (maschine.referenceModels?.length ?? 0) > 0,
    ergebnis: frisch ? frisch.wert : null,
  };
  const zustand = zustandAus(lage);

  // ── Kopf: Name, Standort, letzter Zustand ────────────────────────────────
  const kopf = document.createElement('header');
  kopf.className = 'maschine-kopf';

  const titel = document.createElement('h2');
  titel.textContent = maschine.name;
  kopf.appendChild(titel);

  const lageZeile = document.createElement('p');
  lageZeile.className = 'maschine-lage';
  const punkt = document.createElement('span');
  punkt.className = 'maschine-punkt';
  punkt.style.background = farbeFuerZustand(zustandZuWert(frisch?.wert ?? letzte?.healthScore ?? null));
  punkt.setAttribute('aria-hidden', 'true');
  lageZeile.append(punkt, urteil(zustand));
  kopf.appendChild(lageZeile);

  /**
   * Erst der Satz, dann die Zahl.
   *
   * „Die Messung klingt anders als der Normalzustand" ist die Aussage;
   * „Ähnlichkeit 61 %" ist der Beleg dafür. In der anderen Reihenfolge müsste
   * der Nutzer aus einer Prozentzahl schließen, was sie bedeutet — und genau
   * das kann er nicht, weil er die Schwelle nicht kennt.
   *
   * Und niemals eine Ursache: Die App hört einen Unterschied. Sie sieht kein
   * Lager.
   */
  if (frisch) {
    const satz = document.createElement('p');
    satz.className = 'maschine-ergebnissatz';
    satz.textContent =
      zustand === 'result-deviating'
        ? t('maschine.ergebnisAbweichung')
        : t('maschine.ergebnisAehnlich');
    kopf.appendChild(satz);

    const beleg = document.createElement('p');
    beleg.className = 'muted small maschine-zuletzt';
    beleg.textContent = t('maschine.aehnlichkeit', {
      wert: String(Math.round(frisch.wert)),
      wann: vorWieLange(frisch.zeitpunkt),
    });
    kopf.appendChild(beleg);
  } else if (letzte) {
    const zuletzt = document.createElement('p');
    zuletzt.className = 'muted small maschine-zuletzt';
    zuletzt.textContent = t('maschine.zuletzt', {
      wert: String(Math.round(letzte.healthScore)),
      wann: vorWieLange(letzte.timestamp),
    });
    kopf.appendChild(zuletzt);
  }
  ziel.appendChild(kopf);

  // ── Der Fingerabdruck, einmal ────────────────────────────────────────────
  const geradeGelernt = fingerabdruckZeigen;
  if (geradeGelernt) {
    fingerabdruckZeigen = false;
    await zeichneFingerabdruck(ziel, maschine);
  }

  // ── Die eine Handlung ────────────────────────────────────────────────────
  //
  // Genau eine, und sie steht ohne Scrollen im Bild. Was es sonst noch gibt —
  // Verlauf, Flotte, Einstellungen — ist entweder sekundär oder gehört auf
  // eine andere Ebene.
  const handlung = handlungFuer(zustand);
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = `primary maschine-aktion maschine-aktion-${handlung.art}`;
  /**
   * Im Fingerabdruck-Moment heißt derselbe Schritt anders.
   *
   * Der Zustand ist `ready` wie immer, die Handlung ist dieselbe — eine
   * Prüfung starten. Nur das Wort wechselt: „Jetzt Gegenprobe machen" knüpft
   * an das an, was gerade passiert ist, „Jetzt 10 Sekunden prüfen" stünde da
   * wie beim hundertsten Mal.
   *
   * Das ist Darstellung und keine Fachlogik, deshalb steht es hier und nicht
   * in `zustand.ts`. Die Zustandsmaschine kennt keine Augenblicke.
   */
  knopf.textContent = geradeGelernt
    ? t('maschine.aktionGegenprobe')
    : handlungstext(handlung.schluessel);
  if (zustand === 'processing') {
    // Eine Auskunft, kein Angebot. Sie steht an der Stelle der Handlung, damit
    // die Fläche nicht eingefroren wirkt — aber sie ist nicht drückbar, sonst
    // verspricht sie etwas, das sie nicht hat.
    knopf.disabled = true;
  }
  ziel.appendChild(knopf);

  /**
   * Der stützende Satz — aber nicht im Ergebnis.
   *
   * Dort stand bis zur ersten Messung dieses Schnitts „Halte das Gerät wie beim
   * letzten Mal an dieselbe Stelle": ein Hinweis zum Aufnehmen, unter einem
   * Knopf, der etwas abspielt. Im Ergebnis erklärt sich der nächste Schritt
   * durch die Hör-Lupe direkt darunter, und die bringt ihren eigenen Satz mit.
   * Zwei Sätze übereinander, von denen einer falsch ist, sind schlechter als
   * einer.
   */
  if (!istErgebnis(zustand)) {
    const hinweis = document.createElement('p');
    hinweis.className = 'muted small maschine-hinweis';
    hinweis.textContent =
      zustand === 'untrained' ? t('maschine.hinweisReferenz') : t('maschine.hinweisPruefung');
    if (geradeGelernt) hinweis.textContent = t('maschine.hinweisGegenprobe');
    if (zustand === 'processing') hinweis.textContent = t('maschine.rechnetHinweis');
    ziel.appendChild(hinweis);
  }

  // ── Das Ergebnis: die Hör-Lupe ───────────────────────────────────────────
  //
  // Sie ist der Punkt, an dem aus einer Prozentzahl etwas wird, das ein
  // zweiter Mensch nachvollziehen kann. Deshalb steht sie IM Ergebnis und
  // nicht hinter einem Weg dorthin.
  if (frisch) {
    /**
     * Am Schreibtisch bekommt das Ergebnis zwei Spalten.
     *
     * Die Klasse steht nur am Ergebnis, nicht an der Ebene: Im Ruhezustand
     * gibt es nichts, was eine zweite Spalte füllen würde, und eine leere
     * Spalte ist keine Nutzung der Fläche, sondern ein Loch. Was die Klasse
     * bewirkt, entscheidet allein die Schreibtisch-Abfrage in `tiefe.css` —
     * auf dem Handy bleibt alles, wie es ist.
     */
    ziel.classList.add('maschinen-ansicht-ergebnis');
  }

  if (frisch && zustand === 'result-deviating') {
    const panel = zeichneLupe(ziel, frisch.referenz, frisch.messung);
    /**
     * Ein Tipp bis zum hörbaren Unterschied.
     *
     * Die Primäraktion ruft die Komponente an ihrer eigenen Schnittstelle auf,
     * statt einen ihrer Knöpfe zu klicken. Ein nachgemachter Klick wäre eine
     * zweite Bedienung derselben Sache — und die erste, die kaputtgeht, wenn
     * dort jemand eine Klasse umbenennt.
     */
    knopf.addEventListener('click', () => {
      if (!panel) return;
      void panel.spieleUnterschied();
      // Sichtbar hinführen, ohne zu springen: Der Fokus wandert auf die
      // Lupe, damit auch ohne Blick klar ist, wo es weitergeht.
      panel.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      panel.element.querySelector<HTMLButtonElement>('.hoerlupe-difference')?.focus();
    });
  } else if (frisch && zustand === 'result-similar') {
    /**
     * „Fertig" ist die einzige Primäraktion — die Lupe bleibt erreichbar.
     *
     * Auch ein gutes Ergebnis muss überprüfbar sein: Wer misstraut, soll
     * nachhören können, ohne dass die App ihm dazu einen zweiten gleich
     * lauten Knopf danebenstellt.
     */
    knopf.addEventListener('click', () => {
      vergissErgebnis();
      void zeichne(maschine);
    });

    const trotzdem = document.createElement('button');
    trotzdem.type = 'button';
    trotzdem.className = 'linklike maschine-trotzdem';
    trotzdem.textContent = t('maschine.trotzdemHoeren');
    trotzdem.addEventListener('click', () => {
      trotzdem.remove();
      zeichneLupe(ziel, frisch.referenz, frisch.messung);
    });
    ziel.appendChild(trotzdem);
  } else if (zustand !== 'processing') {
    knopf.addEventListener('click', () => deps?.starteNaechstenSchritt(maschine));
  }

  // ── Sekundär: die letzte Prüfung nachhören ───────────────────────────────
  //
  // Der Weg zur letzten Hör-Lupe, ohne Umweg über den Verlauf. Er erscheint
  // nur, wenn es den Ton wirklich gibt — die Aufbewahrung ist eine Einstellung
  // des Nutzers, und sie wird hier nicht heimlich umgestellt, nur damit ein
  // Knopf dastehen kann.
  if (!frisch && letzte && zustand === 'ready') {
    const toene = await toeneZurPruefung(maschine, letzte);
    if (toene) {
      const nachhoeren = document.createElement('button');
      nachhoeren.type = 'button';
      nachhoeren.className = 'maschine-nachhoeren';
      nachhoeren.textContent = t('maschine.letzterUnterschied');
      nachhoeren.addEventListener('click', () => {
        nachhoeren.remove();
        const panel = zeichneLupe(ziel, toene.referenz, toene.messung);
        void panel?.spieleUnterschied();
      });
      ziel.appendChild(nachhoeren);
    }
  }

  // ── Sekundär: der Verlauf ────────────────────────────────────────────────
  if (maschine.lastDiagnosisAt) {
    const verlauf = document.createElement('button');
    verlauf.type = 'button';
    verlauf.className = 'linklike maschine-verlauf';
    verlauf.textContent = t('history.viewHistory');
    verlauf.addEventListener('click', () => deps?.zeigeVerlauf(maschine));
    ziel.appendChild(verlauf);
  }
}

/**
 * Die Ebene in Betrieb nehmen.
 *
 * Sie hört auf das Scharnier, statt von außen gefüttert zu werden — wie die
 * Standortansicht. Wer die Tür auf `maschine` stellt, hat gerade gesagt, um
 * welche es geht.
 */
export function maschinenansichtAufbauen(abhaengigkeiten: MaschinenansichtDeps): void {
  deps = abhaengigkeiten;

  const tiefe = document.getElementById('zanobo-tiefe');
  if (!tiefe) {
    logger.warn('Maschinenansicht: #zanobo-tiefe fehlt — sie hätte keinen Platz');
    return;
  }

  let ziel = behaelter();
  if (!ziel) {
    ziel = document.createElement('section');
    ziel.id = BEHAELTER_ID;
    ziel.className = 'maschinen-ansicht';
    const standort = document.getElementById('standort-ansicht');
    if (standort?.nextSibling) tiefe.insertBefore(ziel, standort.nextSibling);
    else tiefe.prepend(ziel);
  }

  /**
   * Ein Normalzustand ist gespeichert — zurück auf die Maschinenebene, und
   * dort den Fingerabdruck zeigen.
   *
   * Der Weg zurück gehört hierher und nicht in die Referenzphase: Diese Ebene
   * hat den Nutzer hingeschickt, sie holt ihn auch wieder ab. Die Maschine
   * wird dabei frisch geholt — sie hat gerade ein Referenzmodell bekommen,
   * und die Fassung in der Hand ist die von vorher.
   */
  document.addEventListener(NORMALZUSTAND_GESPEICHERT, (ereignis) => {
    const { machineId } = (ereignis as CustomEvent<{ machineId: string }>).detail;
    void (async () => {
      const frisch = await getMachine(machineId);
      if (!frisch) return;
      fingerabdruckZeigen = true;
      deps?.uebernimmMaschine(frisch);
      oeffneTiefe(frisch.customerId ?? null, 'maschine');
    })();
  });

  /**
   * Eine Prüfung ist ausgewertet — zurück auf die Maschinenebene, und dort
   * steht das Ergebnis.
   *
   * Null Tipps vom Ende der Messung bis zum sichtbaren Ergebnis: Der Nutzer hat
   * die Prüfung gestartet, er hat damit schon gesagt, dass er das Ergebnis
   * sehen will. Eine Nachfrage wäre dieselbe Frage ein zweites Mal.
   */
  document.addEventListener(PRUEFUNG_FERTIG, (ereignis) => {
    const { machineId } = (ereignis as CustomEvent<{ machineId: string }>).detail;
    void (async () => {
      const frisch = await getMachine(machineId);
      if (!frisch) return;
      deps?.uebernimmMaschine(frisch);
      oeffneTiefe(frisch.customerId ?? null, 'maschine');
    })();
  });

  document.addEventListener(TIEFE_GEOEFFNET, (ereignis) => {
    const detail = (ereignis as CustomEvent<TiefeDetail>).detail;
    /**
     * Wer die Maschine verlässt, lässt auch ihr Ergebnis los.
     *
     * Zwei Aufnahmen sind rund zwei Megabyte. Sie festzuhalten, bis die Seite
     * neu lädt, wäre ein Leck, das man erst nach dem fünfzigsten Standort
     * merkt. Die Arbeitsebene zählt nicht als Verlassen — dorthin führt der
     * Weg der Prüfung selbst.
     */
    if (detail.ebene !== 'maschine' && detail.ebene !== 'arbeit') {
      raeumeLupeAb();
      vergissErgebnis();
    }
    if (detail.ebene !== 'maschine') return;
    const maschine = deps?.aktuelleMaschine() ?? null;
    if (!maschine) {
      // Ohne Maschine gibt es nichts zu zeigen. Das passiert, wenn jemand über
      // einen Deep-Link kommt, dessen Maschine gelöscht wurde — dann ist der
      // Standort der ehrlichere Ort als eine leere Überschrift.
      logger.warn('Maschinenansicht: keine Maschine gewählt');
      oeffneTiefe(detail.standortId, 'standort');
      return;
    }
    void zeichne(maschine);
  });
}
