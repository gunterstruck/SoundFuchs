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
 * der Nähe-Begleiter benutzt), `.stat-grid` für die Kopfzahlen, `button.primary`
 * für die Handlung. Kein eigenes Formenvokabular — das wäre der Anfang der
 * zwei Programme, die es nicht geben soll (§0h).
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

/** Eine Zeile der Maschinenliste. Dieselbe Rasterung wie `.near-row`. */
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

  const name = document.createElement('span');
  name.className = 'near-name';
  name.textContent = maschine.name;

  const zahl = document.createElement('span');
  zahl.className = 'near-rev';
  if (wert !== null) {
    zahl.textContent = `${Math.round(wert)} %`;
  } else if (maschine.referenceModels?.length) {
    zahl.textContent = t('status.ready');
    zahl.classList.add('muted');
  } else {
    // Ohne Referenz gibt es nichts zu vergleichen. Das ist keine schlechte
    // Nachricht, sondern eine fehlende — und darf deshalb nicht rot aussehen.
    zahl.textContent = t('map.noReference');
    zahl.classList.add('muted');
  }

  const zeit = document.createElement('span');
  zeit.className = 'near-dist';
  zeit.textContent = wann !== null ? vorWieLange(wann) : '—';

  const pfeil = document.createElement('span');
  pfeil.className = 'standort-pfeil';
  pfeil.textContent = '›';
  pfeil.setAttribute('aria-hidden', 'true');

  knopf.append(punkt, name, zahl, zeit, pfeil);
  knopf.addEventListener('click', () => deps?.zeigeMaschine(maschine));
  zeile.appendChild(knopf);
  return zeile;
}

/** Eine Kopfzahl. */
function kennzahl(wert: string, beschriftung: string): HTMLElement {
  const kasten = document.createElement('div');
  kasten.className = 'stat';
  const b = document.createElement('b');
  b.textContent = wert;
  const s = document.createElement('span');
  s.textContent = beschriftung;
  kasten.append(b, s);
  return kasten;
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

  ziel.appendChild(kopf);

  // ── Die Kopfzahlen ───────────────────────────────────────────────────────
  const befunde = await Promise.all(
    stand.maschinen.map(async (m) => ({
      maschine: m,
      wert: stand.befunde.get(m.id) ?? null,
      wann: (await getLatestDiagnosis(m.id))?.timestamp ?? null,
    }))
  );

  const auffaellig = befunde.filter((b) => b.wert !== null && b.wert < 75).length;
  const ungeprueft = befunde.filter((b) => b.wert === null).length;

  const zahlen = document.createElement('div');
  zahlen.className = 'stat-grid standort-zahlen';
  zahlen.appendChild(kennzahl(String(stand.maschinen.length), t('site.machines')));
  zahlen.appendChild(kennzahl(String(auffaellig), t('site.conspicuous')));
  zahlen.appendChild(kennzahl(String(ungeprueft), t('site.unchecked')));
  ziel.appendChild(zahlen);

  // ── Die Maschinen ────────────────────────────────────────────────────────
  const ueberschrift = document.createElement('h3');
  ueberschrift.textContent = t('map.machinesLabel');
  ziel.appendChild(ueberschrift);

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
  const anlegen = document.createElement('button');
  anlegen.type = 'button';
  anlegen.className = 'primary standort-neue-maschine';
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
