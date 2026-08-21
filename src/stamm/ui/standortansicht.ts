/**
 * DIE STANDORTANSICHT
 *
 * Die erste Ebene hinter dem Scharnier. Der Auftraggeber hat aufgezählt, was
 * sie enthalten muss:
 *
 *   - Name und Adresse
 *   - ggf. Betreiber/Kunde als Zusatzinfo
 *   - alle Maschinen an diesem Standort
 *   - „Neue Maschine anlegen"
 *
 * Mehr steht hier nicht, und weniger auch nicht.
 *
 * ## Sie ist kein Stamm — und sieht trotzdem so aus
 *
 * TourFuchs hat keine Standortansicht; es hat Kunden, aber keine Ebene
 * darunter. Diese Datei ist also Neubau. Neu gebaut wird sie aber aus den
 * Teilen, die dastehen: `.near-row` für die Zeilen (dieselbe Rasterung, die
 * der Nähe-Begleiter benutzt) und die Knopfformen des Stamms. Kein eigenes
 * Formenvokabular — das wäre der Anfang der zwei Programme, die es nicht geben
 * soll (§0h).
 *
 * ## Die Liste IST die Handlung
 *
 * Hier standen einmal drei Kennzahlkacheln, darunter eine Überschrift
 * „Maschinen", darunter die Maschinen und darunter ein großer grüner Knopf
 * „Neue Maschine anlegen". Das sagte dem Techniker, der gerade angekommen ist:
 * Deine Aufgabe hier ist es, Maschinen anzulegen. Seine Aufgabe ist es, sie zu
 * prüfen.
 *
 * Deshalb trägt die Liste jetzt, was vorher die Kacheln behaupteten: Jede Zeile
 * sagt in Worten, was mit ihrer Maschine los ist, und sie ist groß genug, um
 * getroffen zu werden. Anlegen bleibt erreichbar, ist aber nur dort die
 * dominante Handlung, wo noch keine Maschine steht.
 *
 * ## Warum sie den alten Rumpf verdeckt und nicht ersetzt
 *
 * Hinter dem Scharnier steht weiterhin die bisherige SoundFuchs-Oberfläche;
 * sie trägt die Maschinenansicht und mit ihr die drei Auflagen (Kamerabild,
 * Abspielen, 3D-Spektrum). Die Standortansicht legt sich davor, statt sie zu
 * verdrängen: So bleibt der Prüfweg unversehrt messbar, während die Ebene
 * darüber schon steht.
 */

import { ladeBestandsuebersicht, type StandortStand } from '../../services/bestandsuebersicht.js';
import { AEHNLICH_AB } from '../maschine/zustand.js';
import { getLatestDiagnosis } from '@data/db.js';
import { farbeFuerZustand, standortname } from '../features/standortmarker.js';
import { zustandZuWert } from '../../services/bestandsuebersicht.js';
import { oeffneTiefe, TIEFE_GEOEFFNET, type TiefeDetail } from './scharnier.js';
import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';
import type { Machine } from '@data/types.js';

export interface StandortansichtDeps {
  /** Eine Maschine öffnen — führt eine Ebene tiefer. */
  zeigeMaschine: (machine: Machine) => void;
  /**
   * Eine neue Maschine an diesem Standort anlegen.
   *
   * Der Standort wird mitgegeben, damit er im Anlegen-Formular vorbelegt
   * werden kann. „Neue Maschine anlegen" aus einem Standort heraus und
   * anschließend den Standort von Hand auswählen zu müssen wäre eine Frage
   * nach etwas, das man gerade gesagt hat.
   */
  neueMaschine: (standortId: string) => void;
}

const BEHAELTER_ID = 'standort-ansicht';

let deps: StandortansichtDeps | null = null;

function behaelter(): HTMLElement | null {
  return document.getElementById(BEHAELTER_ID);
}

/**
 * Wann war die letzte Prüfung — in Worten.
 *
 * „vor 2 Std" statt „16.08.2026, 09:14". Beim Blick auf eine Maschinenliste
 * ist die Frage nicht, wann genau geprüft wurde, sondern ob es lange her ist.
 */
function vorWieLange(zeitpunkt: number): string {
  const minuten = Math.max(0, Math.round((Date.now() - zeitpunkt) / 60000));
  if (minuten < 2) return t('site.justNow');
  if (minuten < 60) return t('site.agoMinutes', { count: String(minuten) });
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return t('site.agoHours', { count: String(stunden) });
  const tage = Math.round(stunden / 24);
  return t('site.agoDays', { count: String(tage) });
}

/** Ist an dieser Maschine schon ein Normalzustand hinterlegt? */
function hatNormalzustand(maschine: Machine): boolean {
  return Boolean(maschine.referenceModels?.length);
}

/**
 * Was mit dieser Maschine los ist — in denselben Worten wie auf ihrer Seite.
 *
 * Die Schlüssel sind absichtlich die der Maschinenansicht (`maschine.lage*`).
 * Wer in der Liste „Klingt wie der Normalzustand" liest und die Zeile antippt,
 * liest dort denselben Satz. Zwei Formulierungen für denselben Sachverhalt
 * wären zwei Behauptungen, von denen eine irgendwann veraltet.
 *
 * Und wie überall gilt: Es wird beschrieben, wie es klingt — nie, was defekt
 * ist. Das steht dem Gerät nicht zu.
 */
function lagesatz(maschine: Machine, wert: number | null, wann: number | null): string {
  if (wert === null) {
    return hatNormalzustand(maschine) ? t('maschine.lageReady') : t('maschine.lageUntrained');
  }
  const lage = wert >= AEHNLICH_AB ? t('maschine.lageSimilar') : t('maschine.lageDeviating');
  return wann !== null ? `${lage} · ${vorWieLange(wann)}` : lage;
}

/**
 * Eine Zeile der Maschinenliste.
 *
 * Sie liegt weiter im Raster von `.near-row`, trägt aber zwei Zeilen: Name und
 * darunter die Lage in Worten. Gemessen waren es vorher 42 px — unter den 44,
 * die eine Fingerkuppe braucht, und das bei jeder einzelnen Maschine. Die
 * zweite Zeile ist deshalb nicht nur Auskunft, sie ist auch die Größe.
 */
function maschinenzeile(
  maschine: Machine,
  wert: number | null,
  wann: number | null
): HTMLLIElement {
  const zeile = document.createElement('li');

  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'near-row standort-maschine';

  const punkt = document.createElement('span');
  punkt.className = 'near-dot';
  punkt.style.background = farbeFuerZustand(zustandZuWert(wert));
  punkt.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'standort-maschine-text';

  const name = document.createElement('span');
  name.className = 'near-name';
  name.textContent = maschine.name;

  const lage = document.createElement('span');
  lage.className = 'standort-maschine-lage';
  lage.textContent = lagesatz(maschine, wert, wann);

  text.append(name, lage);

  const zahl = document.createElement('span');
  zahl.className = 'near-rev';
  // Die Zahl steht nur da, wo es eine gibt. „—" ist keine Auskunft, sondern
  // eine Spalte, die so tut, als hätte sie eine.
  if (wert !== null) zahl.textContent = `${Math.round(wert)} %`;

  const pfeil = document.createElement('span');
  pfeil.className = 'standort-pfeil';
  pfeil.textContent = '›';
  pfeil.setAttribute('aria-hidden', 'true');

  knopf.append(punkt, text, zahl, pfeil);
  knopf.addEventListener('click', () => deps?.zeigeMaschine(maschine));
  zeile.appendChild(knopf);
  return zeile;
}

/**
 * Die Lage des Standorts in einem Satz.
 *
 * Vorher standen hier drei Kacheln: „4 Maschinen · 0 auffällig · 4 ungeprüft".
 * Bei vier ungeprüften Maschinen ist „0 auffällig" keine Auskunft — es ist
 * bloß die Folge davon, dass noch nichts gemessen wurde. Drei Kacheln, 66 px
 * hoch, um zu sagen: „Hier wurde noch nichts geprüft."
 */
function lageDesStandorts(anzahl: number, auffaellig: number, ohneMessung: number): string {
  const maschinen = anzahl === 1 ? t('site.countMachineOne') : t('site.countMachines', {
    n: String(anzahl),
  });
  let lage: string;
  if (ohneMessung === anzahl) {
    lage = t('site.stateNoneChecked');
  } else if (auffaellig > 0) {
    lage =
      auffaellig === 1
        ? t('site.stateDeviatingOne')
        : t('site.stateDeviating', { n: String(auffaellig) });
  } else if (ohneMessung > 0) {
    lage =
      ohneMessung === 1
        ? t('site.stateUncheckedOne')
        : t('site.stateUnchecked', { n: String(ohneMessung) });
  } else {
    lage = t('site.stateAllFine');
  }
  return `${maschinen} · ${lage}`;
}

async function zeichne(stand: StandortStand): Promise<void> {
  const ziel = behaelter();
  if (!ziel) return;
  ziel.textContent = '';

  const kunde = stand.kunde;

  // ── Name und Adresse ─────────────────────────────────────────────────────
  const kopf = document.createElement('header');
  kopf.className = 'standort-kopf';

  const titel = document.createElement('h2');
  titel.textContent = standortname(kunde.name, { demo: Boolean(kunde.demo) });
  kopf.appendChild(titel);

  const ort = [kunde.plz, kunde.ort].filter(Boolean).join(' ');
  if (ort) {
    const adresse = document.createElement('p');
    adresse.className = 'muted small standort-adresse';
    adresse.textContent = ort;
    if (kunde.geo === 'plz') adresse.append(` · 📍 ${t('map.accuracyPlz')}`);
    kopf.appendChild(adresse);
  }

  // Betreiber als Zusatzinfo — nur, wenn er etwas hinzufügt. Ein Feld, das
  // „—" anzeigt, ist eine Zeile, die nichts sagt und trotzdem Platz nimmt.
  const betreiber = (kunde as { betreiber?: string }).betreiber?.trim();
  if (betreiber) {
    const zeile = document.createElement('p');
    zeile.className = 'muted small standort-betreiber';
    zeile.textContent = `${t('site.operator')}: ${betreiber}`;
    kopf.appendChild(zeile);
  }

  const befunde = await Promise.all(
    stand.maschinen.map(async (m) => ({
      maschine: m,
      wert: stand.befunde.get(m.id) ?? null,
      wann: (await getLatestDiagnosis(m.id))?.timestamp ?? null,
    }))
  );

  const auffaellig = befunde.filter((b) => b.wert !== null && b.wert < AEHNLICH_AB).length;
  const ungeprueft = befunde.filter((b) => b.wert === null).length;

  // ── Die Lage in einem Satz ───────────────────────────────────────────────
  if (befunde.length > 0) {
    const lage = document.createElement('p');
    lage.className = 'standort-lage';
    lage.textContent = lageDesStandorts(befunde.length, auffaellig, ungeprueft);
    kopf.appendChild(lage);
  }

  ziel.appendChild(kopf);

  // ── Die Maschinen ────────────────────────────────────────────────────────
  //
  // Ohne Überschrift. „Maschinen" stand hier über einer Liste von Maschinen,
  // unter einer Kachel, auf der „4 Maschinen" stand — dasselbe Wort dreimal
  // auf 150 px.

  if (befunde.length === 0) {
    const leer = document.createElement('p');
    leer.className = 'muted small';
    leer.textContent = t('map.noMachines');
    ziel.appendChild(leer);
  } else {
    const liste = document.createElement('ul');
    liste.className = 'near-list standort-maschinen';
    // Das Auffällige zuerst: Wer eine Liste öffnet, sucht selten die Maschine,
    // der es gut geht. Innerhalb gleicher Lage nach Namen, damit die
    // Reihenfolge zwischen zwei Besuchen stabil bleibt.
    befunde.sort((a, b) => {
      const ra = a.wert === null ? 1 : 0;
      const rb = b.wert === null ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (a.wert !== null && b.wert !== null && a.wert !== b.wert) return a.wert - b.wert;
      return a.maschine.name.localeCompare(b.maschine.name);
    });
    for (const b of befunde) liste.appendChild(maschinenzeile(b.maschine, b.wert, b.wann));
    ziel.appendChild(liste);
  }

  // ── Die Handlung dieser Ebene ────────────────────────────────────────────
  //
  // „Neue Maschine anlegen" war der eine große grüne Knopf dieser Seite. Das
  // sagte dem Techniker, der gerade angekommen ist: Deine Aufgabe hier ist es,
  // Maschinen anzulegen. Seine Aufgabe ist es, sie zu prüfen — und diese
  // Handlung ist die Liste selbst.
  //
  // Steht noch keine Maschine da, ist Anlegen tatsächlich das Einzige, was man
  // hier tun kann. Dann, und nur dann, ist es die dominante Handlung.
  const anlegen = document.createElement('button');
  anlegen.type = 'button';
  anlegen.className = befunde.length === 0 ? 'primary standort-neue-maschine' : 'standort-neue-maschine';
  anlegen.textContent = `➕ ${t('site.newMachine')}`;
  anlegen.addEventListener('click', () => deps?.neueMaschine(kunde.id));
  ziel.appendChild(anlegen);
}

/**
 * Die Ansicht in Betrieb nehmen.
 *
 * Sie hört auf das Scharnier, statt von außen gefüttert zu werden: Wer die
 * Tür aufmacht, sagt dabei, welcher Standort gemeint ist — ein zweiter Aufruf
 * mit derselben Auskunft wäre eine zweite Stelle, an der sie falsch sein kann.
 */
export function standortansichtAufbauen(abhaengigkeiten: StandortansichtDeps): void {
  deps = abhaengigkeiten;

  const tiefe = document.getElementById('zanobo-tiefe');
  if (!tiefe) {
    logger.warn('Standortansicht: #zanobo-tiefe fehlt — sie hätte keinen Platz');
    return;
  }

  let ziel = behaelter();
  if (!ziel) {
    ziel = document.createElement('section');
    ziel.id = BEHAELTER_ID;
    ziel.className = 'standort-ansicht';
    // Hinter den Rückweg, vor den alten Rumpf.
    const zurueck = tiefe.querySelector('.tiefe-zurueck');
    if (zurueck?.nextSibling) tiefe.insertBefore(ziel, zurueck.nextSibling);
    else tiefe.prepend(ziel);
  }

  document.addEventListener(TIEFE_GEOEFFNET, (ereignis) => {
    const detail = (ereignis as CustomEvent<TiefeDetail>).detail;
    if (detail.ebene !== 'standort' || !detail.standortId) return;
    void (async () => {
      const stand = (await ladeBestandsuebersicht()).find((e) => e.kunde.id === detail.standortId);
      if (!stand) {
        // Der Standort ist zwischen Antippen und Zeichnen verschwunden —
        // gelöscht, oder die Beispieldaten wurden geräumt. Dann ist die Karte
        // der ehrlichere Ort als eine leere Überschrift.
        logger.warn(`Standortansicht: ${detail.standortId} nicht gefunden`);
        oeffneTiefe(null, 'maschine');
        return;
      }
      await zeichne(stand);
    })();
  });
}
