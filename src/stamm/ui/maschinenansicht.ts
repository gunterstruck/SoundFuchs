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

import type { Machine } from '@data/types.js';
import { getLatestDiagnosis } from '@data/db.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import { farbeFuerZustand } from '../features/standortmarker.js';
import { zustandZuWert } from '../../services/bestandsuebersicht.js';
import {
  zustandAus,
  handlungFuer,
  type Lage,
  type Maschinenzustand,
} from '../maschine/zustand.js';
import { oeffneTiefe, TIEFE_GEOEFFNET, type TiefeDetail } from './scharnier.js';
import { NORMALZUSTAND_GESPEICHERT } from '@ui/phases/2-Reference.js';
import { renderMachineFingerprint } from '@ui/components/MachineFingerprint.js';
import { getReferenceIrisVector } from '@ui/phases/referenceIris.js';
import { getMachine } from '@data/db.js';

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

async function zeichne(maschine: Machine): Promise<void> {
  const ziel = behaelter();
  if (!ziel) return;
  ziel.textContent = '';

  const letzte = await getLatestDiagnosis(maschine.id);
  const lage: Lage = {
    hatNormalzustand: (maschine.referenceModels?.length ?? 0) > 0,
    // Bewusst kein `ergebnis`: Die Ebene öffnet sich im Ruhezustand, nicht in
    // einem Ergebnis von vorgestern. Der alte Wert steht im Kopf als Auskunft.
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
  punkt.style.background = farbeFuerZustand(zustandZuWert(letzte?.healthScore ?? null));
  punkt.setAttribute('aria-hidden', 'true');
  lageZeile.append(punkt, urteil(zustand));
  kopf.appendChild(lageZeile);

  if (letzte) {
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
  knopf.addEventListener('click', () => deps?.starteNaechstenSchritt(maschine));
  ziel.appendChild(knopf);

  const hinweis = document.createElement('p');
  hinweis.className = 'muted small maschine-hinweis';
  hinweis.textContent =
    zustand === 'untrained' ? t('maschine.hinweisReferenz') : t('maschine.hinweisPruefung');
  if (geradeGelernt) hinweis.textContent = t('maschine.hinweisGegenprobe');
  ziel.appendChild(hinweis);

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

  document.addEventListener(TIEFE_GEOEFFNET, (ereignis) => {
    const detail = (ereignis as CustomEvent<TiefeDetail>).detail;
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
